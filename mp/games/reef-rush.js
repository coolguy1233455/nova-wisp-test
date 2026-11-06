// Reef Rush: name something, but name something rare. A pufferfish asks for something ("Name
// a dog breed", "Name a country in Africa", "Name something in a kitchen"...) and everyone
// types ONE answer before it puffs up all the way. An answer that isn't on the list for that
// prompt is turned away with the reason, and you can try again while the clock runs; once one
// is accepted it's locked in. Answers score by how rare they are, decided ahead of time for
// every prompt (reef/bank.js), not by what the other players said:
//   Shallows 10 · Reef 30 · Open Sea 60 · Twilight 85 · Abyss 100.
// While a prompt runs, players only see THAT someone has answered; when it ends, everyone's
// answer is shown with its tier, plus a few deep answers nobody gave.
//
// Three ways to play (the game's variants, each with its own lobby and rating):
//   Party     2-8 members live, ranked; 5-15 prompts (7 by default), 15-30 seconds each.
//   Daily     today's 7 prompts, the same for every member of the site (reef/daily.js); one
//             scored try per member per day and a board of today's scores. Alone or together.
//   Practice  solo, endless random prompts, unranked. Stop whenever you like.
import { PROMPTS, BY_ID, TIERS, check, deepFinds } from "./reef/bank.js";
import { today, dailyIds, dayFor, flushDays, shuffle, DAILY_COUNT } from "./reef/daily.js";
import { keyOf } from "./words/match.js";
import { siteCall } from "../sites.js";

const READY_MS = 3500; // before the first prompt
const REVEAL_MS = 7000; // everyone's answers on show between prompts
const LAST_REVEAL_MS = 4000; // ...after the last one, before the final scores
const EARLY_END_MS = 900; // everyone has answered: the prompt ends this soon after
const DAILY_SECS = 25;
const IDLE_PROMPTS = 3; // practice stops after this many prompts in a row without a try
const MAX_TRIES = 60; // tries per player per prompt
const MODES = ["party", "daily", "practice"];

// Saved daily scores go through the site's signed save calls (the api the core hands boot();
// the same function straight from sites.js until a lobby has been opened).
let apiRef = null;
const call = (site, op, data) => (apiRef?.siteCall || siteCall)(site, op, data);

const ALL_IDS = PROMPTS.map((p) => p.id);
// Today's daily prompts are kept out of parties and practice, so nobody sees their answers early.
const dailyToday = () => new Set(dailyIds(today(), ALL_IDS));

const seconds = {
  key: "seconds",
  label: "Time per prompt",
  type: "select",
  def: "25", // (strings: that's what the host form sends for a select)
  choices: [15, 20, 25, 30].map((n) => ({ value: String(n), label: `${n} seconds` })),
};
const TIER_LINE = TIERS.map((t) => `${t.name} ${t.pts}`).join(" · ");

export default {
  id: "reef-rush",
  name: "Reef Rush",
  ranked: true,
  modes: ["ffa"],
  min: 2,
  max: 8,
  info: {
    blurb: "Name something, but name something rare. One answer per prompt: the deeper your answer, the more it scores.",
    how: `Each prompt asks you to name something. Type one answer before the pufferfish puffs up. Answers score by how rare they are: ${TIER_LINE}.`,
    keys: "Type an answer · Enter to send it",
  },
  variants: {
    party: {
      name: "Party",
      modes: ["ffa"],
      min: 2,
      max: 8,
      ranked: true,
      options: [{ key: "rounds", label: "Prompts", type: "number", min: 5, max: 15, def: 7 }, seconds],
      info: {
        blurb: "2 to 8 members, the same prompts at the same time. Ranked.",
        how: `Each prompt asks you to name something: a dog breed, a country in Africa, something in a kitchen… Type ONE answer before time runs out. If it doesn't count you'll see why, and you can try again until the clock runs out. Once an answer is accepted it's locked in. Answers score by how rare they are, decided ahead of time (so it doesn't matter what anyone else says): ${TIER_LINE}. The others only see that you've answered, not what. After each prompt everyone's answers are shown. Highest total wins; equal totals share the place.`,
        keys: "Type an answer · Enter to send it",
      },
    },
    daily: {
      name: "Daily",
      modes: ["coop"],
      min: 1,
      max: 8,
      ranked: false,
      options: [],
      info: {
        blurb: "Today's 7 prompts, the same for every member. One scored try a day, then see where you rank on today's board.",
        how: `Seven prompts, 25 seconds each, one answer per prompt; rarer answers score more (${TIER_LINE}, so 700 at most). Everyone on Nova gets the same prompts today, and a new set comes at midnight New York time. Only your first daily of the day counts for today's board. Play it alone, or host a Daily party to play it together.`,
        keys: "Type an answer · Enter to send it",
        lobby: "Only each member's first daily of the day counts for today's board.",
      },
    },
    practice: {
      name: "Practice",
      modes: ["coop"],
      min: 1,
      max: 1,
      ranked: false,
      options: [seconds],
      info: {
        blurb: "Endless random prompts, just you. Not ranked.",
        how: `Prompt after prompt, one answer each, scored like the real thing (${TIER_LINE}). Skip a prompt if you're stuck, and press Stop when you're done.`,
        keys: "Type an answer · Enter to send it",
      },
    },
  },

  create(room) {
    const mode = MODES.includes(room.variant) ? room.variant : "party";
    const seats = room.players.map((p) => p.uid);
    const secs = mode === "daily" ? DAILY_SECS : Number(room.opts.seconds) || 25;
    const g = {
      mode,
      seats,
      names: Object.fromEntries(room.players.map((p) => [p.uid, p.name])),
      scores: Object.fromEntries(seats.map((u) => [u, 0])),
      tiers: Object.fromEntries(seats.map((u) => [u, []])), // each prompt's tier (-1: no answer)
      gone: [],
      n: 0, // the prompt we're on
      total: mode === "practice" ? 0 : mode === "daily" ? DAILY_COUNT : room.opts.rounds || 7,
      ms: secs * 1000,
      deck: [],
      pid: null,
      answers: {}, // uid -> the accepted answer this prompt
      tries: {},
      lastTry: {},
      tried: false, // anyone tried anything this prompt (practice's idle check)
      idle: 0,
      phase: "ready",
      deadline: Date.now() + READY_MS,
      roundId: 0,
      reveal: null,
      last: false,
      daily: null,
    };
    if (mode === "daily") {
      g.daily = { date: today(), counted: {} };
      g.deck = dailyIds(g.daily.date, ALL_IDS);
      dayFor(room.site, g.daily.date, call); // starts reading today's saved scores
    } else {
      const avoid = dailyToday();
      g.deck = spread(shuffle(ALL_IDS.filter((id) => !avoid.has(id))));
      if (mode === "party") g.deck.length = g.total;
      else g.avoid = avoid;
      g.recent = [];
    }
    room.timer(READY_MS, () => begin(room, g));
    return g;
  },

  action(room, g, p, a) {
    if (!g || g.phase === "done") return;
    if (a.k === "answer") return answer(room, g, p, a.text);
    const here = g.seats.filter((u) => !g.gone.includes(u));
    // Playing alone, there's no need to sit through the reveal (it shows for half a second at least).
    if (a.k === "next" && g.phase === "reveal" && here.length === 1) {
      const id = g.roundId;
      return room.timer(Math.max(0, g.revealAt + 500 - Date.now()), () => g.roundId === id && g.phase === "reveal" && afterReveal(room, g));
    }
    if (g.mode !== "practice") return;
    if (a.k === "skip" && g.phase === "ask") {
      g.tried = true;
      return endPrompt(room, g);
    }
    if (a.k === "stop") finish(room, g, "stopped");
  },

  view(room, g, uid) {
    if (!g) return null;
    const p = g.pid ? BY_ID.get(g.pid) : null;
    const span = g.phase === "ready" ? READY_MS : g.phase === "ask" ? g.ms : g.phase === "reveal" ? (g.last ? LAST_REVEAL_MS : REVEAL_MS) : 1;
    const here = g.seats.filter((u) => !g.gone.includes(u));
    let daily = null;
    if (g.daily) {
      const day = dayFor(room.site, g.daily.date, call);
      daily = { date: g.daily.date, counted: uid ? (g.daily.counted[uid] ?? null) : null, saved: day.saveOk, board: g.phase === "done" ? day.board(20) : null };
    }
    return {
      mode: g.mode,
      phase: g.phase,
      n: g.n,
      total: g.total,
      roundId: g.roundId,
      left: Math.max(0, g.deadline - Date.now()),
      span,
      prompt: p && g.phase !== "ready" ? { ask: p.ask, topic: p.topic } : null,
      players: g.seats.map((u) => ({
        uid: u,
        name: g.names[u],
        score: g.scores[u],
        answered: g.phase === "ask" && !!g.answers[u], // that they answered, never what
        gone: g.gone.includes(u),
        counted: g.daily ? (g.daily.counted[u] ?? null) : null,
        tiers: g.tiers[u].slice(-30),
      })),
      // Your own locked-in answer (its tier stays a surprise until the reveal).
      mine: uid && g.phase === "ask" && g.answers[uid] ? { show: g.answers[uid].show } : null,
      reveal: g.phase === "reveal" || g.phase === "done" ? g.reveal : null,
      last: g.last,
      solo: here.length === 1,
      tierInfo: TIERS,
      daily,
    };
  },

  leave(room, g, p) {
    if (!g || g.phase === "done") return;
    if (!g.gone.includes(p.uid)) g.gone.push(p.uid);
    const here = g.seats.filter((u) => !g.gone.includes(u));
    if (g.mode === "party" && here.length < 2) return finish(room, g, `${p.name} left`);
    if (!here.length) return finish(room, g, "Everyone left");
    if (g.phase === "ask") maybeEarly(room, g);
    room.update();
  },

  summary(room, g) {
    if (!g || !g.n) return null;
    if (g.mode === "practice") return { text: `Practice · ${g.n} played` };
    return { text: `${g.mode === "daily" ? "Daily · " : ""}Prompt ${g.n} of ${g.total}` };
  },

  // Today's daily board for the game's page: { t: "rr:daily", game: "reef-rush" }.
  message(room, g, client, msg) {
    if (msg?.t !== "rr:daily" || !client?.site) return;
    if (Date.now() - (boardAsked.get(client) || 0) < 1500) return;
    boardAsked.set(client, Date.now());
    const date = today();
    const day = dayFor(client.site, date, call);
    day.ready(4000).then(() => {
      const e = day.entries.get(client.uid);
      client.send({ t: "rr:daily", date, board: day.board(20), me: e ? { score: e.s, tiers: e.t, done: e.d } : null, saved: day.saveOk, loaded: day.loaded });
    });
  },

  // Called whenever someone opens the lobby: have today's scores ready.
  boot(site, api) {
    apiRef = api;
    dayFor(site, today(), call);
  },

  shutdown() {
    return flushDays();
  },
};

const boardAsked = new WeakMap(); // client -> when it last asked for the daily board

// Puts prompts in an order where the same topic doesn't come twice in a row when it can be helped.
function spread(ids, prevTopic = null) {
  const left = [...ids];
  const out = [];
  while (left.length) {
    const last = out.length ? BY_ID.get(out[out.length - 1]).topic : prevTopic;
    const i = Math.max(0, left.findIndex((id) => BY_ID.get(id).topic !== last));
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

// The countdown is over. The daily first settles who plays for real: waiting (5 seconds at
// most) for today's saved scores to know who already had their try.
function begin(room, g, waited = 0) {
  if (g.mode === "daily") {
    const day = dayFor(room.site, g.daily.date, call);
    if (!day.loaded && day.loading && waited < 5000) {
      g.deadline = Date.now() + 500;
      room.timer(500, () => begin(room, g, waited + 500));
      return;
    }
    // (Someone who left during the countdown never saw a prompt: their try isn't used up.)
    for (const u of g.seats) if (!g.gone.includes(u)) g.daily.counted[u] = day.start(u, g.names[u]);
  }
  nextPrompt(room, g);
}

function nextPrompt(room, g) {
  g.n++;
  g.roundId++;
  if (g.mode === "practice") {
    if (!g.deck.length) g.deck = spread(shuffle(ALL_IDS.filter((id) => !g.avoid.has(id) && !g.recent.includes(id))), BY_ID.get(g.pid)?.topic);
    g.pid = g.deck.shift();
    g.recent.push(g.pid);
    if (g.recent.length > 30) g.recent.shift();
  } else g.pid = g.deck[g.n - 1];
  g.answers = {};
  g.tries = {};
  g.tried = false;
  g.reveal = null;
  g.phase = "ask";
  g.deadline = Date.now() + g.ms;
  const id = g.roundId;
  room.timer(g.ms, () => g.roundId === id && g.phase === "ask" && endPrompt(room, g));
  room.update();
}

function answer(room, g, p, raw) {
  if (g.phase !== "ask" || !g.seats.includes(p.uid) || g.gone.includes(p.uid) || g.answers[p.uid]) return;
  const now = Date.now();
  if (now - (g.lastTry[p.uid] || 0) < 200) return;
  g.lastTry[p.uid] = now;
  g.tries[p.uid] = (g.tries[p.uid] || 0) + 1;
  if (g.tries[p.uid] > MAX_TRIES) return;
  const text = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
  if (!text) return;
  g.tried = true;
  const bad = (why) => room.sendTo(p.uid, { t: "rr:bad", text, why, id: g.roundId });
  const r = check(g.pid, text);
  if (r?.rude) return bad("Let's keep it friendly. Try another answer!");
  if (!r) return bad(keyOf(text).length < 2 ? "Type a bit more" : `“${text}” isn't on our list for this one. Try another!`);
  g.answers[p.uid] = { idx: r.idx, show: r.show, tier: r.tier, pts: r.pts };
  room.update();
  maybeEarly(room, g);
}

// Everyone still here has an answer in: no point waiting for the buzzer.
function maybeEarly(room, g) {
  const here = g.seats.filter((u) => !g.gone.includes(u));
  if (!here.length || !here.every((u) => g.answers[u])) return;
  const id = g.roundId;
  if (g.deadline <= Date.now() + EARLY_END_MS) return;
  g.deadline = Date.now() + EARLY_END_MS;
  room.timer(EARLY_END_MS, () => g.roundId === id && g.phase === "ask" && endPrompt(room, g));
  room.update();
}

// Time's up: every answer scores its tier and goes on show.
function endPrompt(room, g) {
  g.phase = "reveal";
  const said = new Set();
  const answers = {};
  for (const u of g.seats) {
    const a = g.answers[u];
    if (a) said.add(a.idx);
    g.scores[u] += a ? a.pts : 0;
    g.tiers[u].push(a ? a.tier : -1);
    answers[u] = a ? { show: a.show, tier: a.tier, pts: a.pts } : null;
  }
  g.reveal = { n: g.n, ask: BY_ID.get(g.pid).ask, answers, finds: deepFinds(g.pid, said, 4) };
  if (g.mode === "daily") {
    const day = dayFor(room.site, g.daily.date, call);
    for (const u of g.seats) if (g.daily.counted[u]) day.score(u, g.scores[u], g.tiers[u], false);
  }
  if (g.mode === "practice") g.idle = g.tried ? 0 : g.idle + 1;
  g.last = (g.total && g.n >= g.total) || (g.mode === "practice" && g.idle >= IDLE_PROMPTS);
  const ms = g.last ? LAST_REVEAL_MS : REVEAL_MS;
  g.revealAt = Date.now();
  g.deadline = g.revealAt + ms;
  const id = g.roundId;
  room.timer(ms, () => g.roundId === id && g.phase === "reveal" && afterReveal(room, g));
  room.update();
}

function afterReveal(room, g) {
  if (g.last) return finish(room, g, g.mode === "practice" ? "idle" : "");
  nextPrompt(room, g);
}

const ordinal = (n) => `${n}${[, "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th"}`;

// Highest total first; equal totals share a place. Players who left come last.
function finish(room, g, why = "") {
  if (g.phase === "done") return;
  g.phase = "done";
  g.deadline = Date.now();
  const here = g.seats.filter((u) => !g.gone.includes(u)).sort((a, b) => g.scores[b] - g.scores[a]);
  const sides = [];
  here.forEach((u, i) => {
    if (i && g.scores[u] === g.scores[here[i - 1]]) sides[sides.length - 1].uids.push(u);
    else sides.push({ uids: [u], place: i + 1 });
  });
  let next = here.length + 1;
  for (const u of [...g.gone].sort((a, b) => g.scores[b] - g.scores[a])) sides.push({ uids: [u], place: next++ });
  const top = sides[0]?.uids || [];
  const best = g.scores[top[0]] ?? 0;
  const name = (u) => g.names[u] || "Someone";
  let reason = "";
  if (g.mode === "party") reason = why || (top.length > 1 ? `A tie at the top with ${best} points` : `${name(top[0])} wins with ${best} points`);
  else if (g.mode === "daily") {
    const day = dayFor(room.site, g.daily.date, call);
    for (const u of g.seats) if (g.daily.counted[u]) day.score(u, g.scores[u], g.tiers[u], !g.gone.includes(u));
    const board = day.board(100);
    if (g.seats.length === 1) {
      const u = g.seats[0];
      const row = board.find((r) => r.uid === u);
      reason = g.daily.counted[u] && row ? `${g.scores[u]} points · ${ordinal(row.place)} of ${board.length} today` : `${g.scores[u]} points · just for fun (your daily already counted today)`;
    } else reason = top.length > 1 ? `A tie at the top with ${best} points` : `${name(top[0])} scored the most: ${best} points`;
  } else {
    const u = g.seats[0];
    const n = g.tiers[u].length;
    reason = `${why === "idle" ? "Practice paused (no answers for a while)" : "Practice over"} · ${n} prompt${n === 1 ? "" : "s"}, ${g.scores[u]} points`;
  }
  room.update();
  room.end({ sides, reason });
}
