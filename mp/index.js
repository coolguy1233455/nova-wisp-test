// Nova's multiplayer server: parties (rooms) for the games in mp/games/, a lobby per game,
// matchmaking ("Find a game"), the in-game chat, spectators, rematches and Elo ratings.
// Everything a player sees comes from here; the games' rules run here too (each module in
// mp/games/ owns its state and decides what each player may see), so nobody can cheat by
// changing their own page.
//
// Players connect to /mp over a WebSocket and send JSON. They prove who they are with a token
// from their Nova site (see sites.js); people from different sites never meet. Ratings,
// match results and the public World Empire world are kept by the site (siteCall); rooms,
// chats and games in progress only live in this server's memory, and a room's chat is gone
// when its round ends.
//
// Messages from a player: hello {token}, lobby {game}, host {game, variant, opts}, join {code
// or id}, spectate {id}, find {game, variant, opts}, cancel, leave, start, kick {uid},
// team {team}, opts {opts}, act {a}, chat {text}, rematch, rematch-no, rp {to, d}, ping.
// To a player: welcome, counts, rooms, room, game {s}, chat {msg}, result, left, error, toast,
// finding, rp, and whatever a game sends itself (sendTo / broadcast).
import { WebSocketServer } from "ws";
import { randomBytes, randomInt } from "node:crypto";
import { checkToken, siteCall, publicKey, SITES } from "./sites.js";
import { eloChanges, START, FLOOR } from "./elo.js";
import { GAMES, catalog } from "./games/index.js";

const wss = new WebSocketServer({ noServer: true, maxPayload: 600 * 1024, perMessageDeflate: false });
const clients = new Map(); // "site:uid" -> Client (one connection each; a new one replaces it)
const rooms = new Map(); // id -> Room
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MODES = ["1v1", "ffa", "teams", "coop"];

/* ------------------------------------------------------------ ratings */
// site -> Map("gameKey|uid" -> { elo, games, wins }), read from the site once per start.
const ratings = new Map();
const ratingsReady = new Map();
function loadRatings(site) {
  if (!ratingsReady.has(site))
    ratingsReady.set(
      site,
      siteCall(site, "ratings")
        .then((rows) => {
          const map = new Map();
          for (const r of rows.ratings || []) map.set(`${r.game}|${r.uid}`, { elo: r.elo, games: r.games, wins: r.wins });
          ratings.set(site, map);
        })
        .catch((err) => {
          console.log(`mp: ratings for ${site} unavailable:`, err.message);
          ratings.set(site, ratings.get(site) || new Map());
          setTimeout(() => ratingsReady.delete(site), 60_000);
        }),
    );
  return ratingsReady.get(site);
}
const ratingOf = (site, game, uid) => ratings.get(site)?.get(`${game}|${uid}`) || { elo: START, games: 0, wins: 0 };

// Results waiting to reach their site (retried until they do, for a while).
const outbox = [];
async function flushOutbox() {
  for (const item of outbox.splice(0)) {
    try {
      await siteCall(item.site, item.op, item.data);
    } catch (err) {
      if (++item.tries < 20) outbox.push(item);
      else console.log(`mp: gave up sending ${item.op} to ${item.site}:`, err.message);
    }
  }
}
setInterval(flushOutbox, 30_000).unref();
export function toSite(site, op, data) {
  outbox.push({ site, op, data, tries: 0 });
  flushOutbox();
}

/* ------------------------------------------------------------ clients */
class Client {
  constructor(ws) {
    this.ws = ws;
    this.site = null;
    this.uid = null;
    this.name = "";
    this.photo = null;
    this.adm = false;
    this.room = null;
    this.lobby = undefined; // game id whose rooms it follows (null: only the counts)
    this.finding = null; // { game, variant, opts } while matchmaking
    this.bucket = 60;
    this.lastChat = 0;
  }
  get key() {
    return `${this.site}:${this.uid}`;
  }
  send(msg) {
    if (this.ws.readyState === 1) this.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  get person() {
    return { uid: this.uid, name: this.name, photo: this.photo };
  }
}

/* ------------------------------------------------------------ rooms */
const newCode = () => {
  for (;;) {
    let c = "";
    for (let i = 0; i < 5; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
    if (![...rooms.values()].some((r) => r.code === c)) return c;
  }
};

// The rules a game (or one of its variants, e.g. a card game) plays by.
export function rulesOf(gameId, variant) {
  const def = GAMES[gameId];
  if (!def) return null;
  const v = def.variants?.[variant];
  if (def.variants && !v) return null;
  return { ...def, ...(v || {}), def, variant: v ? variant : null };
}

// Checks and fills in a party's settings: mode, max players, ranked, and the game's own options.
function cleanOpts(rules, raw = {}) {
  const modes = rules.modes || ["ffa"];
  const mode = modes.includes(raw.mode) ? raw.mode : modes[0];
  let min = rules.min ?? 2;
  let max = rules.max ?? 8;
  if (mode === "1v1") min = max = 2;
  if (mode === "teams") {
    const per = rules.teamSize || Math.floor(max / 2);
    // When 1v1 is a mode of its own, Teams means two or more a side.
    min = Math.max(min, modes.includes("1v1") ? 4 : 2);
    max = Math.min(max, per * 2);
  }
  const want = Math.round(Number(raw.max) || max);
  const opts = {
    mode,
    max: rules.unlimited && raw.max === 0 ? 0 : Math.max(min, Math.min(max, want)),
    min,
    ranked: !!rules.ranked && !!raw.ranked && mode !== "coop",
  };
  for (const o of rules.options || []) {
    let v = raw[o.key] ?? o.def;
    if (o.type === "number") v = Math.max(o.min ?? -Infinity, Math.min(o.max ?? Infinity, Math.round(Number(v) || o.def)));
    // Pages send a select's value as text; a numeric choice comes back as its number.
    if (o.type === "select") v = o.choices.find((c) => String(c.value) === String(v))?.value ?? o.def;
    if (o.type === "bool") v = !!v;
    opts[o.key] = v;
  }
  return rules.fixOpts ? rules.fixOpts(opts) : opts;
}

export class Room {
  constructor({ site, gameId, variant = null, opts = {}, host = null, matchmade = false, persistent = false, name = "" }) {
    this.id = randomBytes(6).toString("base64url");
    this.code = newCode();
    this.site = site;
    this.gameId = gameId;
    this.rules = rulesOf(gameId, variant);
    this.def = this.rules.def;
    this.variant = this.rules.variant;
    this.gameKey = this.variant ? `${gameId}:${this.variant}` : gameId;
    this.opts = cleanOpts(this.rules, opts);
    this.host = host?.uid || null;
    this.matchmade = matchmade;
    this.persistent = persistent;
    this.name = name;
    this.players = []; // { uid, name, photo, team, client, connected, left }
    this.specs = new Set(); // Clients watching
    this.state = "lobby"; // lobby | playing | over
    this.g = null; // the game's own state
    this.chat = [];
    this.rematch = new Set();
    this.result = null;
    this.timers = new Set();
    this.round = 0;
    this.countdown = 0; // when a full matchmade party starts (ms)
    this.createdAt = Date.now();
    this.pending = false;
    rooms.set(this.id, this);
    lobbyChanged(this);
  }

  /* --- who is here */
  get active() {
    return this.players.filter((p) => !p.left);
  }
  player(uid) {
    return this.players.find((p) => p.uid === uid && !p.left) || null;
  }
  get full() {
    return this.opts.max > 0 && this.active.length >= this.opts.max;
  }
  get joinable() {
    return !this.full && (this.state === "lobby" || (this.state === "playing" && this.rules.joinPlaying));
  }
  teamCount() {
    return this.opts.mode === "teams" || this.opts.mode === "1v1" ? 2 : 0;
  }
  // A new player's team: the emptier side in team games, their own in a free-for-all.
  pickTeam() {
    const n = this.teamCount();
    if (this.opts.mode === "coop") return 0;
    if (!n) {
      const used = new Set(this.active.map((p) => p.team));
      let t = 0;
      while (used.has(t)) t++;
      return t;
    }
    const counts = Array.from({ length: n }, (_, t) => this.active.filter((p) => p.team === t).length);
    return counts.indexOf(Math.min(...counts));
  }

  addPlayer(client) {
    const back = this.players.find((p) => p.uid === client.uid);
    if (back && !back.left) {
      back.client = client;
      back.connected = true;
      back.name = client.name;
      back.photo = client.photo;
    } else {
      const p = { uid: client.uid, name: client.name, photo: client.photo, team: this.pickTeam(), client, connected: true, left: false };
      if (back) this.players.splice(this.players.indexOf(back), 1);
      this.players.push(p);
      if (this.state === "playing") this.def.join?.(this, this.g, p);
    }
    this.specs.delete(client);
    client.room = this;
    if (!this.host) this.host = client.uid;
    this.maybeCountdown();
    this.changed();
  }

  removePlayer(uid, why = "left") {
    const p = this.players.find((x) => x.uid === uid && !x.left);
    if (!p) return;
    if (p.client?.room === this) p.client.room = null;
    p.client = null;
    p.connected = false;
    if (this.state === "playing") {
      p.left = true;
      this.def.leave?.(this, this.g, p, why);
    } else this.players.splice(this.players.indexOf(p), 1);
    this.rematch.delete(uid);
    if (this.host === uid) this.host = this.active.find((x) => x.connected)?.uid || this.active[0]?.uid || null;
    if (this.countdown && !this.full) this.countdown = 0;
    if (!this.active.length && !this.persistent) return this.close();
    if (this.state === "over") this.checkRematch();
    this.changed();
  }

  addSpec(client) {
    this.specs.add(client);
    client.room = this;
    client.send({ t: "room", room: this.info(client) });
    if (this.state !== "lobby") client.send({ t: "game", s: this.viewFor(null) });
    this.changed();
  }

  /* --- telling everyone */
  info(client) {
    const me = this.player(client.uid);
    return {
      id: this.id,
      code: this.code,
      game: this.gameId,
      variant: this.variant,
      gameName: this.def.name,
      name: this.name,
      opts: this.opts,
      host: this.host,
      state: this.state,
      matchmade: this.matchmade,
      persistent: this.persistent,
      countdown: this.countdown ? Math.max(0, this.countdown - Date.now()) : 0,
      players: this.active.map((p) => ({ uid: p.uid, name: p.name, photo: p.photo, team: p.team, connected: p.connected, elo: this.opts.ranked ? ratingOf(this.site, this.gameKey, p.uid).elo : undefined })),
      specs: [...this.specs].map((c) => c.person),
      you: { uid: client.uid, role: me ? "player" : "spectator" },
      chat: this.chat.slice(-100),
      rematch: [...this.rematch],
      result: this.result,
    };
  }
  everyone() {
    return [...this.active.filter((p) => p.client).map((p) => p.client), ...this.specs];
  }
  broadcast(msg) {
    const text = JSON.stringify(msg);
    for (const c of this.everyone()) c.send(text);
  }
  sendTo(uid, msg) {
    this.player(uid)?.client?.send(msg);
  }
  toSpecs(msg) {
    const text = JSON.stringify(msg);
    for (const c of this.specs) c.send(text);
  }
  // Room details changed (people, settings, state): everyone gets it again, and so does the lobby.
  changed() {
    for (const c of this.everyone()) c.send({ t: "room", room: this.info(c) });
    lobbyChanged(this);
  }
  viewFor(uid) {
    try {
      return this.def.view(this, this.g, uid);
    } catch (err) {
      console.log(`mp: ${this.gameId} view failed:`, err);
      return null;
    }
  }
  // The game changed: each person gets their own view of it (sent once per moment, however
  // many changes the game made).
  update() {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => this.sendViews());
  }
  sendViews() {
    this.pending = false;
    if (this.state === "lobby" || !this.g) return;
    for (const p of this.active) if (p.client) p.client.send({ t: "game", s: this.viewFor(p.uid) });
    if (this.specs.size) {
      const text = JSON.stringify({ t: "game", s: this.viewFor(null) });
      for (const c of this.specs) c.send(text);
    }
  }
  toast(msg, uid = null) {
    if (uid) this.sendTo(uid, { t: "toast", msg });
    else this.broadcast({ t: "toast", msg });
  }

  /* --- timers that end with the round */
  timer(ms, fn) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      this.safe(fn);
    }, ms);
    this.timers.add(id);
    return id;
  }
  clearTimers() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
  }
  safe(fn) {
    try {
      fn();
    } catch (err) {
      console.log(`mp: ${this.gameId} failed:`, err);
    }
  }

  /* --- the round */
  canStart() {
    return this.state !== "playing" && this.active.length >= this.opts.min;
  }
  // A full matchmade party starts by itself after a few seconds.
  maybeCountdown() {
    if (!this.matchmade || this.state !== "lobby" || !this.full || this.countdown) return;
    this.countdown = Date.now() + 4000;
    this.timer(4000, () => {
      if (this.countdown && this.full && this.state === "lobby") this.start();
      this.countdown = 0;
    });
  }
  start() {
    if (!this.canStart()) return false;
    this.clearTimers();
    this.countdown = 0;
    this.players = this.active;
    this.state = "playing";
    this.round++;
    if (this.round > 1) this.chat = []; // a round's chat lasts that round (the lobby's carries into the first)
    this.rematch.clear();
    this.result = null;
    this.g = null;
    this.safe(() => (this.g = this.def.create(this)));
    if (!this.g) {
      this.state = "lobby";
      this.changed();
      return false;
    }
    this.changed();
    this.update();
    return true;
  }

  // The round is over. result: { sides: [{ uids, place }], reason } or the shortcuts
  // { winners: [uid] } (their sides first, everyone else second), { order: [uid, ...] }
  // (first to last), { draw: true }, { aborted: true } (called off: nobody wins, ratings stay).
  // Ranked parties move ratings.
  end(result = {}) {
    if (this.state !== "playing") return;
    const everyone = this.players.map((p) => p.uid);
    let sides = result.aborted ? [{ uids: everyone, place: 1 }] : result.sides;
    const sideOf = (uid) => this.players.find((p) => p.uid === uid)?.team ?? uid;
    if (!sides && result.order)
      sides = result.order.map((uid, i) => ({ uids: [uid], place: i + 1 }));
    if (!sides) {
      const groups = new Map();
      for (const p of this.players) {
        const k = this.opts.mode === "ffa" ? p.uid : sideOf(p.uid);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(p.uid);
      }
      const win = new Set(result.winners || []);
      sides = [...groups.values()].map((uids) => ({ uids, place: result.draw ? 1 : uids.some((u) => win.has(u)) ? 1 : 2 }));
    }
    sides = sides.filter((s) => s.uids.length);
    let deltas = {};
    const elos = {};
    if (this.opts.ranked && sides.length > 1) {
      deltas = eloChanges(sides, (u) => ratingOf(this.site, this.gameKey, u).elo);
      const map = ratings.get(this.site) || new Map();
      ratings.set(this.site, map);
      const players = [];
      for (const s of sides)
        for (const uid of s.uids) {
          const r = { ...ratingOf(this.site, this.gameKey, uid) };
          const before = r.elo;
          r.elo = Math.max(FLOOR, r.elo + (deltas[uid] || 0));
          deltas[uid] = r.elo - before; // what really changed (a loss at 0 changes nothing)
          r.games++;
          if (s.place === 1 && sides.some((o) => o.place > 1)) r.wins++;
          map.set(`${this.gameKey}|${uid}`, r);
          elos[uid] = r.elo;
          players.push({ uid, elo: r.elo, delta: deltas[uid] || 0, won: s.place === 1, games: r.games, wins: r.wins });
        }
      toSite(this.site, "result", { match: `${this.id}-${this.round}`, game: this.gameKey, players });
    }
    this.state = "over";
    this.clearTimers();
    this.result = { reason: result.reason || "", sides, deltas, elos, ranked: this.opts.ranked && !result.aborted, aborted: !!result.aborted, players: everyone };
    this.sendViews(); // the final board first, then the result over it
    this.broadcast({ t: "result", result: this.result });
    this.changed();
    // Nobody left to play again with: the party ends once the last player goes.
    if (this.persistent) this.timer(5000, () => this.def.over?.(this, this.g));
  }

  checkRematch() {
    const here = this.active.filter((p) => p.connected);
    if (this.state === "over" && here.length >= this.opts.min && here.every((p) => this.rematch.has(p.uid))) {
      for (const p of this.players.filter((x) => !x.connected)) this.removePlayer(p.uid);
      this.start();
    }
  }

  close() {
    this.clearTimers();
    this.safe(() => this.def.close?.(this, this.g));
    for (const c of this.everyone()) {
      c.room = null;
      c.send({ t: "left", why: "closed" });
    }
    for (const p of this.players) if (p.client?.room === this) p.client.room = null;
    this.specs.clear();
    this.chat = [];
    rooms.delete(this.id);
    lobbyChanged(this, true);
  }

  summary() {
    const host = this.players.find((p) => p.uid === this.host);
    return {
      id: this.id,
      code: this.code,
      game: this.gameId,
      variant: this.variant,
      name: this.name,
      host: host ? { name: host.name, photo: host.photo, uid: host.uid } : null,
      opts: this.opts,
      count: this.active.length,
      specs: this.specs.size,
      state: this.state,
      matchmade: this.matchmade,
      persistent: this.persistent,
      joinable: this.joinable,
      players: this.active.slice(0, 12).map((p) => ({ name: p.name, photo: p.photo, uid: p.uid, team: p.team })),
      extra: this.def.summary?.(this, this.g) || null,
    };
  }
}

/* ------------------------------------------------------------ lobby */
// Per game: open parties and parties in progress. Sent to whoever follows that game, and the
// counts (for the green dots on the Multiplayer page) to everyone on the site.
const dirtySites = new Set();
let lobbyTimer = null;
function lobbyChanged(room) {
  dirtySites.add(room.site);
  lobbyTimer ||= setTimeout(sendLobbies, 300);
}
function sendLobbies() {
  lobbyTimer = null;
  for (const site of dirtySites) {
    const list = [...rooms.values()].filter((r) => r.site === site);
    const counts = {};
    for (const id of Object.keys(GAMES)) counts[id] = { open: 0, playing: 0 };
    for (const r of list) {
      if (r.joinable) counts[r.gameId].open++;
      else if (r.state !== "lobby") counts[r.gameId].playing++;
    }
    for (const c of clients.values()) {
      if (c.site !== site || c.lobby === undefined) continue;
      c.send({ t: "counts", counts });
      if (c.lobby) c.send(roomsFor(site, c.lobby));
    }
  }
  dirtySites.clear();
}
const roomsFor = (site, game) => {
  const list = [...rooms.values()].filter((r) => r.site === site && r.gameId === game).map((r) => r.summary());
  return { t: "rooms", game, open: list.filter((r) => r.joinable), playing: list.filter((r) => !r.joinable && r.state !== "lobby") };
};

/* ------------------------------------------------------------ messages */
const sameOpts = (a, b) => Object.keys({ ...a, ...b }).every((k) => k === "min" || a[k] === b[k]);

function find(client, { game, variant, opts }) {
  const rules = rulesOf(game, variant);
  if (!rules) return client.send({ t: "error", msg: "Unknown game" });
  const want = cleanOpts(rules, opts);
  const match = [...rooms.values()]
    .filter((r) => r.site === client.site && r.gameKey === (rules.variant ? `${game}:${rules.variant}` : game) && r.state === "lobby" && !r.full && !r.persistent && sameOpts(r.opts, want))
    .sort((a, b) => b.active.length - a.active.length)[0];
  leaveRoom(client);
  client.finding = { game, variant, opts: want };
  if (match) return match.addPlayer(client);
  new Room({ site: client.site, gameId: game, variant: rules.variant, opts: want, host: client, matchmade: true }).addPlayer(client);
}

function leaveRoom(client) {
  const room = client.room;
  if (!room) return;
  if (room.specs.has(client)) {
    room.specs.delete(client);
    client.room = null;
    room.changed();
  } else room.removePlayer(client.uid);
  client.room = null;
}

function onMessage(client, msg) {
  const room = client.room;
  const host = room && room.host === client.uid;
  switch (msg.t) {
    case "ping":
      return client.send({ t: "pong" });
    case "lobby":
      client.lobby = typeof msg.game === "string" && GAMES[msg.game] ? msg.game : null;
      dirtySites.add(client.site);
      lobbyTimer ||= setTimeout(sendLobbies, 50);
      for (const def of Object.values(GAMES)) def.boot?.(client.site, api);
      return;
    case "host": {
      const rules = rulesOf(msg.game, msg.variant);
      if (!rules) return client.send({ t: "error", msg: "Unknown game" });
      if (rules.noHost) return client.send({ t: "error", msg: "That game can't be hosted" });
      leaveRoom(client);
      new Room({ site: client.site, gameId: msg.game, variant: rules.variant, opts: msg.opts, host: client }).addPlayer(client);
      return;
    }
    case "join": {
      const code = String(msg.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const r = [...rooms.values()].find((x) => x.site === client.site && (x.id === msg.id || (code && x.code === code)));
      if (!r) return client.send({ t: "error", msg: "No party with that code" });
      if (r.player(client.uid)) return r.addPlayer(client);
      if (!r.joinable) return client.send({ t: "error", msg: r.full ? "That party is full" : "That game already started. You can watch it instead." });
      leaveRoom(client);
      return r.addPlayer(client);
    }
    case "spectate": {
      const r = rooms.get(msg.id);
      if (!r || r.site !== client.site) return client.send({ t: "error", msg: "That game is over" });
      if (r.player(client.uid)) return r.addPlayer(client);
      leaveRoom(client);
      return r.addSpec(client);
    }
    case "find":
      return find(client, msg);
    case "cancel":
    case "leave":
      client.finding = null;
      leaveRoom(client);
      return client.send({ t: "left", why: "left" });
    case "start":
      if (host && room.state !== "playing" && !room.start()) client.send({ t: "error", msg: `Needs at least ${room.opts.min} players` });
      return;
    case "kick":
      if (host && msg.uid !== client.uid && room.state === "lobby") {
        const p = room.player(msg.uid);
        if (p?.client) p.client.send({ t: "left", why: "kicked" });
        room.removePlayer(msg.uid, "kicked");
      }
      return;
    case "team": {
      const p = room?.player(client.uid);
      const n = room?.teamCount();
      if (!p || room.state !== "lobby" || !n || !(msg.team >= 0 && msg.team < n)) return;
      const per = room.opts.mode === "1v1" ? 1 : Math.ceil(room.opts.max / n);
      if (room.active.filter((x) => x.team === msg.team).length >= per) return client.send({ t: "error", msg: "That team is full" });
      p.team = msg.team;
      return room.changed();
    }
    case "opts":
      if (host && room.state === "lobby" && !room.matchmade) {
        const before = room.opts.mode;
        room.opts = cleanOpts(room.rules, { ...room.opts, ...msg.opts });
        if (room.opts.mode !== before) for (const p of room.active) p.team = -1;
        for (const p of room.active) if (p.team === -1 || (room.teamCount() && p.team >= room.teamCount())) p.team = room.pickTeam();
        while (room.full && room.active.length > room.opts.max) room.removePlayer(room.active[room.active.length - 1].uid, "kicked");
        room.changed();
      }
      return;
    case "act": {
      const p = room?.player(client.uid);
      if (!p || room.state !== "playing" || !msg.a || typeof msg.a !== "object") return;
      return room.safe(() => room.def.action(room, room.g, p, msg.a));
    }
    case "chat": {
      if (!room) return;
      const text = String(msg.text || "").replace(/\s+/g, " ").trim().slice(0, 300);
      if (!text || Date.now() - client.lastChat < 400) return;
      // A game can keep some people quiet while it's on (Mafia's dead players, who know every role).
      let allowed = true;
      try {
        if (room.state === "playing" && room.def.chatAllowed) allowed = room.def.chatAllowed(room, room.g, client.uid) !== false;
      } catch {}
      if (!allowed) return client.send({ t: "toast", msg: "You can't chat until the round ends" });
      client.lastChat = Date.now();
      const m = { id: randomBytes(4).toString("hex"), uid: client.uid, name: client.name, photo: client.photo, text, spec: !room.player(client.uid), at: Date.now() };
      room.chat.push(m);
      if (room.chat.length > 200) room.chat.shift();
      return room.broadcast({ t: "chat", msg: m });
    }
    case "rematch":
      if (room?.state === "over" && room.player(client.uid)) {
        room.rematch.add(client.uid);
        room.changed();
        room.checkRematch();
      }
      return;
    case "rematch-no":
      if (room?.state === "over" && room.player(client.uid)) {
        room.rematch.clear();
        room.broadcast({ t: "toast", msg: `${client.name} doesn't want a rematch` });
        room.changed();
      }
      return;
    case "rp": {
      // Remote play (mp/games/remote.js): the host's game picture to the others, their keys to the host.
      if (!room?.rules.relay || room.state !== "playing") return;
      const out = JSON.stringify({ t: "rp", from: client.uid, d: msg.d });
      // Someone whose connection is still behind on earlier pictures skips this one, so a slow
      // viewer can't pile up memory here.
      const ok = (c) => c?.ws.bufferedAmount < 1_500_000;
      if (room.host === client.uid) {
        for (const c of room.everyone()) if (c !== client && (!msg.to || c.uid === msg.to) && ok(c)) c.send(out);
      } else room.player(room.host)?.client?.send(out);
      return;
    }
    default:
      // A game's own messages: to the party's game, or (outside any party, e.g. signing up for
      // the public World Empire world) to the game named in msg.game.
      if (room) return room.def.message?.(room, room.g, client, msg);
      return GAMES[msg.game]?.message?.(null, null, client, msg);
  }
}

/* ------------------------------------------------------------ connections */
async function onConnection(ws) {
  const client = new Client(ws);
  let ready = null;
  ws.on("message", async (data, isBinary) => {
    if (isBinary) return;
    // At most ~60 messages a second each (remote play's pictures included).
    client.bucket = Math.min(120, client.bucket + ((Date.now() - (client.lastAt || Date.now())) / 1000) * 60);
    client.lastAt = Date.now();
    if (--client.bucket < 0) return;
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== "string") return;
    if (msg.t === "hello") {
      ready ??= checkToken(msg.token).then((who) => {
        if (!who) {
          client.send({ t: "error", msg: "Sign in again to play", fatal: true });
          ws.close();
          return false;
        }
        Object.assign(client, { site: who.site, uid: who.uid, name: String(who.name || "Player").slice(0, 24), photo: who.photo || null, adm: !!who.adm });
        const old = clients.get(client.key);
        if (old && old !== client) {
          old.send({ t: "elsewhere" });
          old.ws.close();
          if (old.room) {
            const p = old.room.player(old.uid);
            if (p) p.client = null;
            old.room.specs.delete(old);
          }
        }
        clients.set(client.key, client);
        return loadRatings(client.site).then(() => {
          const mine = {};
          for (const [k, r] of ratings.get(client.site) || []) {
            const [game, uid] = k.split("|");
            if (uid === client.uid) mine[game] = r.elo;
          }
          client.send({ t: "welcome", you: client.person, ratings: mine, games: catalog(), now: Date.now() });
          // Back in a party it was in (a reload, a dropped connection).
          const r = [...rooms.values()].find((x) => x.site === client.site && x.player(client.uid));
          if (r) {
            r.addPlayer(client);
            if (r.state !== "lobby") client.send({ t: "game", s: r.viewFor(client.uid) });
            if (r.result) client.send({ t: "result", result: r.result });
          }
          return true;
        });
      });
      return;
    }
    if (!(await ready)) return;
    try {
      onMessage(client, msg);
    } catch (err) {
      console.log("mp: message failed:", msg.t, err);
    }
  });
  ws.on("close", async () => {
    if (!(await ready)) return;
    if (clients.get(client.key) === client) clients.delete(client.key);
    const room = client.room;
    if (!room) return;
    if (room.specs.delete(client)) return room.changed();
    const p = room.player(client.uid);
    if (!p || p.client !== client) return;
    p.client = null;
    p.connected = false;
    room.safe(() => room.def.disconnect?.(room, room.g, p));
    room.changed();
    // Gone for good if not back soon (a party that hasn't started forgets them sooner).
    const wait = room.state === "playing" ? room.rules.graceMs ?? 45_000 : 15_000;
    setTimeout(() => {
      const again = room.player(client.uid);
      if (again && !again.connected && rooms.has(room.id)) room.removePlayer(client.uid, "disconnected");
    }, wait);
  });
  ws.on("error", () => {});
}
wss.on("connection", onConnection);

// Rooms nobody is in any more, or empty for long, go; games with a clock tick.
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = now - lastTick;
  lastTick = now;
  for (const r of rooms.values()) {
    if (r.state === "playing" && r.def.tick) r.safe(() => r.def.tick(r, r.g, dt));
    if (!r.persistent && !r.everyone().length && now - r.createdAt > 60_000) r.close();
  }
}, 100).unref();

// What the games get to make rooms themselves (the public World Empire world) and keep data.
export const api = {
  Room,
  rooms,
  clients,
  toSite,
  siteCall,
  createRoom: (o) => new Room(o),
  ratingOf,
};

// Games that keep something running without players (the public World Empire world) start as
// soon as this server does, so it begins on time even if nobody has opened Multiplayer since a
// restart. Only on Render: a test server on someone's computer leaves the real sites alone.
const bootSites = Object.keys(SITES).filter((site) => process.env.RENDER || !["brez", "mf"].includes(site));
setTimeout(() => {
  for (const site of bootSites) for (const def of Object.values(GAMES)) Promise.resolve().then(() => def.boot?.(site, api)).catch((err) => console.log(`mp: boot ${site} failed:`, err));
}, 2000).unref();

/* ------------------------------------------------------------ http */
export function mpUpgrade(req, socket, head) {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
}
export function mpHttp(req, res, headers) {
  if (req.url === "/mp/key") {
    res.writeHead(200, { ...headers, "content-type": "application/json" });
    return res.end(JSON.stringify({ key: publicKey })), true;
  }
  if (req.url === "/mp/status") {
    res.writeHead(200, { ...headers, "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, clients: clients.size, rooms: rooms.size })), true;
  }
  return false;
}

// Render stops this server with SIGTERM before a restart: games that keep data save it first.
export async function mpShutdown() {
  for (const def of Object.values(GAMES)) await Promise.resolve(def.shutdown?.(api)).catch(() => {});
  await flushOutbox();
}
