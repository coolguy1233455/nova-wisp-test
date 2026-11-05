// Mafia: everyone gets a secret role, then nights and days take turns until one side wins.
//
// Roles: Mafia (one by default, the host can pick up to 3), and one each of Detective, Doctor
// and Bomber; everyone else is a Civilian. With only 4 players the Bomber is left out (and if
// there were ever too few townspeople to keep one Civilian, the Doctor would go next).
//
// One cycle, every step on a clock that skips ahead once everyone who has to act has acted:
//   roles    the words spin on each screen and stop on that player's role
//   night    the mafia pick a victim together (each sees the others and their picks; the most
//            picked player dies, a tie goes to the latest pick); the Detective checks one player
//            and only they see "innocent" or "mafia"
//   day      discussion in the game chat; nobody is told who died yet ("someone may have died")
//   doctor   the Doctor picks someone to revive without knowing who was hit (they may pick
//            themselves); the right pick saves them
//   reveal   who died (and their role), or "the doctor saved someone"
//   bomb     a Bomber who just died takes any living player with them
//   vote     a strict majority of the living players votes someone out (a tie or no majority:
//            nobody goes); their role is shown, and a Bomber voted out also takes someone
// Then night again. Town wins when every mafia is dead; the mafia win as soon as they're at
// least as many as the town (so with 2 players left and a mafia among them, the mafia win).
// Players who leave count as dead (their role is shown). Dead players watch and see every role.
//
// Secrets stay here: view() gives each person only what they may know (a spectator only what
// everyone knows).
import { randomInt } from "node:crypto";

const MS = { roles: 6500, night: 40_000, day: 75_000, doctor: 25_000, reveal: 6500, bomb: 20_000, boom: 5500, vote: 45_000, verdict: 6500 };
const SETTLE = 2000; // once everyone has acted, a moment to change their mind before moving on

// The most mafia a party of n can have: the town must stay at least two bigger, so the game
// doesn't end after the very first night.
const maxMafia = (n) => Math.max(1, Math.floor((n - 2) / 2));

export default {
  id: "mafia",
  name: "Mafia",
  ranked: true,
  modes: ["ffa"],
  min: 4,
  max: 12,
  options: [{ key: "mafia", label: "Mafia players", type: "number", min: 1, max: 3, def: 1 }],
  info: {
    blurb: "Mafia, Detective, Doctor, Bomber or Civilian? Find the killers before they find you.",
    how: "Everyone gets a secret role. At night the Mafia choose someone to murder and the Detective checks whether one player is innocent or a killer. In the morning you talk it over in the chat, not knowing who died. Then the Doctor picks someone to revive (right guess: they live), the night's victim is revealed, and everyone votes someone out (it takes a majority of the living). If the Bomber dies, they take any player with them. Town wins when all the Mafia are gone; the Mafia win once they're as many as the town.",
    keys: "Tap a player to pick them · talk in the chat on the right",
  },

  // Party settings: the mafia can't outnumber the town (counted from the player limit here;
  // the real count is checked again when the game starts).
  fixOpts(opts) {
    opts.mafia = Math.min(opts.mafia, maxMafia(opts.max || 12));
    return opts;
  },

  create(room) {
    const uids = room.players.map((p) => p.uid);
    const n = uids.length;
    const mafia = Math.max(1, Math.min(room.opts.mafia || 1, maxMafia(n)));
    const specials = ["detective", "doctor", "bomber"];
    const notes = [];
    if (mafia < (room.opts.mafia || 1)) notes.push(`Only ${n} players, so ${mafia} mafia instead of ${room.opts.mafia}.`);
    if (n < 5) specials.pop(); // no Bomber with 4 players
    while (specials.length > n - mafia - 1) specials.pop(); // keep at least one Civilian (Bomber goes first, then the Doctor)
    if (!specials.includes("bomber")) notes.push("No Bomber with this few players.");
    if (!specials.includes("doctor")) notes.push("No Doctor with this few players.");
    const roles = [...Array(mafia).fill("mafia"), ...specials];
    while (roles.length < n) roles.push("civilian");
    shuffle(roles);
    const people = {};
    uids.forEach((uid, i) => (people[uid] = { role: roles[i], alive: true, died: null }));
    const g = {
      order: uids,
      people,
      counts: countRoles(roles),
      notes,
      day: 1,
      phase: "roles",
      endsAt: 0,
      minEnd: 0,
      settling: false,
      picks: {}, // mafia uid -> { uid, seq } tonight
      seq: 0,
      victim: null, // decided at the end of the night, told to nobody but the mafia (and the dead)
      checks: [], // the Detective's results: { day, uid, mafia }
      checked: false, // the Detective has checked someone tonight
      save: null, // the Doctor's pick
      ready: [], // living players happy to end the discussion early
      votes: {}, // uid -> uid | "skip"
      bomb: null, // { uid, next } a dead Bomber choosing, and what comes after
      last: null, // what the reveal / verdict / boom screens show
      log: [], // public events: { day, kind, uid, role, by }
      winner: null,
    };
    phase(room, g, "roles");
    return g;
  },

  action(room, g, p, a) {
    const me = g.people[p.uid];
    if (!me || g.phase === "over") return;
    // Only real players (not names every object has, like "constructor").
    const target = typeof a.uid === "string" && Object.hasOwn(g.people, a.uid) ? g.people[a.uid] : null;
    // The night: the mafia pick a victim, the Detective checks someone.
    if (a.k === "kill" && g.phase === "night" && me.alive && me.role === "mafia") {
      if (!target || !target.alive || target.role === "mafia") return;
      g.picks[p.uid] = { uid: a.uid, seq: ++g.seq };
      return changed(room, g);
    }
    if (a.k === "check" && g.phase === "night" && me.alive && me.role === "detective" && !g.checked) {
      if (!target || !target.alive || a.uid === p.uid) return;
      g.checked = true;
      g.checks.push({ day: g.day, uid: a.uid, mafia: target.role === "mafia" });
      return changed(room, g);
    }
    // The morning talk: everyone alive can say they're ready to move on.
    if (a.k === "ready" && g.phase === "day" && me.alive) {
      if (!g.ready.includes(p.uid)) g.ready.push(p.uid);
      return changed(room, g);
    }
    // The Doctor revives someone (any living player, themselves too). They can change their mind.
    if (a.k === "save" && g.phase === "doctor" && me.alive && me.role === "doctor") {
      if (!target || !target.alive) return;
      g.save = a.uid;
      return changed(room, g);
    }
    // A dead Bomber takes someone with them.
    if (a.k === "bomb" && g.phase === "bomb" && g.bomb?.uid === p.uid) {
      if (!target || !target.alive || a.uid === p.uid) return;
      return detonate(room, g, a.uid, false);
    }
    // The vote: a living player, or "skip" (nobody). Changeable until the vote closes.
    if (a.k === "vote" && g.phase === "vote" && me.alive) {
      if (a.uid !== "skip" && (!target || !target.alive || a.uid === p.uid)) return;
      g.votes[p.uid] = a.uid;
      return changed(room, g);
    }
  },

  tick(room, g) {
    if (g.phase === "over") return;
    const now = Date.now();
    // Everyone who has to act did: move on soon (but not before the phase's shortest time,
    // so how fast a phase ends doesn't give away who is dead).
    if (!g.settling && doneActing(room, g)) {
      g.settling = true;
      const soon = Math.max(g.minEnd, now + SETTLE);
      if (soon < g.endsAt) {
        g.endsAt = soon;
        room.update();
      }
    }
    if (now >= g.endsAt) advance(room, g);
  },

  // The dead see every role, so they keep quiet in the game chat until the round ends
  // (spectators only see what everyone sees, so they may still comment).
  chatAllowed(room, g, uid) {
    const me = g?.people?.[uid];
    return !me || me.alive;
  },

  view(room, g, uid) {
    const me = uid ? g.people[uid] : null;
    const ghost = !!me && !me.alive; // dead players watch with every role showing
    const all = g.phase === "over" || ghost;
    const mafiaMe = me?.role === "mafia";
    const players = g.order.map((u) => {
      const x = g.people[u];
      const p = room.players.find((q) => q.uid === u) || {};
      const seen = all || u === uid || !x.alive || (mafiaMe && x.role === "mafia");
      return { uid: u, name: p.name || "Player", photo: p.photo || null, alive: x.alive, died: x.died, role: seen ? x.role : null, left: !!p.left };
    });
    const v = {
      phase: g.phase,
      day: g.day,
      left: Math.max(0, g.endsAt - Date.now()),
      total: MS[g.phase] || 0,
      players,
      counts: g.counts,
      notes: g.notes,
      log: g.log,
      last: g.last,
      winner: g.winner,
      me: me ? { role: me.role, alive: me.alive } : null,
      ready: g.phase === "day" ? g.ready : [],
      votes: g.phase === "vote" || g.phase === "verdict" ? g.votes : {},
      bomber: g.phase === "bomb" ? g.bomb.uid : null,
      need: needToAct(room, g, uid),
    };
    // The mafia (and the dead) see the mafia's picks and the victim.
    if (mafiaMe || all) {
      v.picks = Object.fromEntries(Object.entries(g.picks).map(([k, x]) => [k, x.uid]));
      v.target = g.phase === "night" ? victimOf(g) : null;
      if (["day", "doctor"].includes(g.phase)) v.victim = g.victim;
    }
    if (me?.role === "detective" || all) {
      v.checks = g.checks;
      v.checked = g.checked;
    }
    if (me?.role === "doctor" || all) v.save = g.phase === "doctor" ? g.save : null;
    return v;
  },

  // Gone for good (left, or didn't come back in time): they count as dead, role shown.
  leave(room, g, p) {
    const x = g.people[p.uid];
    if (!x || g.phase === "over" || !x.alive) return;
    kill(g, p.uid, "left");
    delete g.picks[p.uid];
    delete g.votes[p.uid];
    const w = winnerOf(g);
    if (w) return finish(room, g, w);
    room.update();
  },

  disconnect(room, g) {
    room.update(); // their seat shows as away; the clock stops waiting for them
  },

  summary(room, g) {
    if (!g || g.phase === "over") return null;
    const alive = g.order.filter((u) => g.people[u].alive).length;
    const when = { roles: "Roles", night: "Night", doctor: "Morning", reveal: "Morning", bomb: "Morning" }[g.phase] || "Day";
    return { text: `${when} ${g.day} · ${alive} alive` };
  },
};

/* ------------------------------------------------------------ the flow */
function phase(room, g, name, ms = MS[name], minMs = 0) {
  g.phase = name;
  g.endsAt = Date.now() + ms;
  g.minEnd = Date.now() + minMs;
  g.settling = false;
  room.update();
}

// A phase's time ran out (or everyone acted): the next step.
function advance(room, g) {
  switch (g.phase) {
    case "roles":
      return night(room, g);
    case "night":
      g.victim = victimOf(g);
      g.ready = [];
      return phase(room, g, "day");
    case "day":
      g.save = null;
      // Only skipped when there's no Doctor in this game at all (everyone knows the roles in
      // play). A dead Doctor's turn still takes a while, so nobody can tell they're dead.
      if (!g.counts.doctor) return morning(room, g);
      return phase(room, g, "doctor", MS.doctor, 6000 + randomInt(4000));
    case "doctor":
      return morning(room, g);
    case "reveal":
    case "verdict":
      if (g.bomb) return phase(room, g, "bomb");
      return next(room, g, g.phase === "reveal" ? "vote" : "night");
    case "bomb":
      // The Bomber didn't choose in time: the bomb goes off on a random living player.
      return detonate(room, g, pickRandom(g.order.filter((u) => g.people[u].alive)), true);
    case "boom":
      return afterBomb(room, g);
    case "vote":
      return verdict(room, g);
  }
}

function night(room, g) {
  g.picks = {};
  g.checked = false;
  g.victim = null;
  g.save = null;
  g.votes = {};
  g.last = null;
  phase(room, g, "night", MS.night, 10_000 + randomInt(6000));
}

// The Doctor has chosen (or didn't): what happened last night.
function morning(room, g) {
  const v = g.victim;
  if (v && g.people[v].alive && g.save !== v) {
    kill(g, v, "night");
    g.last = { kind: "night", outcome: "died", uid: v, role: g.people[v].role };
    if (g.people[v].role === "bomber") g.bomb = { uid: v, next: "vote" };
  } else if (v && g.people[v].alive) {
    g.last = { kind: "night", outcome: "saved" };
    g.log.push({ day: g.day, kind: "saved" });
  } else {
    g.last = { kind: "night", outcome: "quiet" };
    g.log.push({ day: g.day, kind: "quiet" });
  }
  phase(room, g, "reveal");
}

function verdict(room, g) {
  const alive = g.order.filter((u) => g.people[u].alive && on(room, u));
  const tally = {};
  for (const [u, t] of Object.entries(g.votes)) if (g.people[u].alive && (t === "skip" || g.people[t]?.alive)) tally[t] = (tally[t] || 0) + 1;
  const [top, n] = Object.entries(tally).filter(([t]) => t !== "skip").sort((a, b) => b[1] - a[1])[0] || [];
  if (top && n > alive.length / 2) {
    kill(g, top, "vote");
    g.last = { kind: "vote", outcome: "out", uid: top, role: g.people[top].role, tally };
    if (g.people[top].role === "bomber") g.bomb = { uid: top, next: "night" };
  } else {
    g.last = { kind: "vote", outcome: "none", tally };
    g.log.push({ day: g.day, kind: "novote" });
  }
  phase(room, g, "verdict");
}

function detonate(room, g, target, random) {
  const bomber = g.bomb.uid;
  if (target) {
    kill(g, target, "bomb", bomber);
    g.last = { kind: "bomb", bomber, uid: target, role: g.people[target].role, random };
  } else g.last = { kind: "bomb", bomber, uid: null };
  phase(room, g, "boom");
}

function afterBomb(room, g) {
  const then = g.bomb?.next || "vote";
  g.bomb = null;
  next(room, g, then);
}

// Between steps: the game may be over; otherwise on to the vote or the next night.
function next(room, g, then) {
  const w = winnerOf(g);
  if (w) return finish(room, g, w);
  if (then === "vote") {
    g.votes = {};
    return phase(room, g, "vote");
  }
  g.day++;
  night(room, g);
}

function finish(room, g, winner) {
  if (g.phase === "over") return;
  g.winner = winner;
  g.phase = "over";
  g.endsAt = Date.now();
  room.update();
  const mafia = g.order.filter((u) => g.people[u].role === "mafia");
  const town = g.order.filter((u) => g.people[u].role !== "mafia");
  const left = new Set(room.players.filter((p) => p.left).map((p) => p.uid));
  const winners = (winner === "mafia" ? mafia : town).filter((u) => !left.has(u));
  // One side each for Elo: the winning team, and everyone else (the losing team, plus anyone
  // from the winning team who walked out).
  const reason = winner === "mafia" ? "The Mafia took over the town" : "The town caught every Mafia";
  room.timer(3000, () => room.end({ sides: [{ uids: winners, place: 1 }, { uids: g.order.filter((u) => !winners.includes(u)), place: 2 }], reason }));
}

/* ------------------------------------------------------------ helpers */
function kill(g, uid, how, by = null) {
  const x = g.people[uid];
  if (!x?.alive) return;
  x.alive = false;
  x.died = { day: g.day, how };
  g.log.push({ day: g.day, kind: how, uid, role: x.role, by });
}

function winnerOf(g) {
  const alive = g.order.filter((u) => g.people[u].alive);
  const mafia = alive.filter((u) => g.people[u].role === "mafia").length;
  if (!mafia) return "town";
  if (mafia >= alive.length - mafia) return "mafia";
  return null;
}

// Tonight's victim: the player most mafia picked; a tie goes to whoever was picked last.
function victimOf(g) {
  const tally = {};
  for (const [m, pick] of Object.entries(g.picks)) {
    if (!g.people[m].alive || !g.people[pick.uid]?.alive) continue;
    const t = (tally[pick.uid] ||= { n: 0, seq: 0 });
    t.n++;
    t.seq = Math.max(t.seq, pick.seq);
  }
  const best = Object.entries(tally).sort((a, b) => b[1].n - a[1].n || b[1].seq - a[1].seq)[0];
  return best ? best[0] : null;
}

const on = (room, uid) => !!room.player(uid)?.connected;

// Who still has to do something this phase (connected and alive, or the dead Bomber).
function waitingOn(room, g) {
  const alive = g.order.filter((u) => g.people[u].alive && on(room, u));
  switch (g.phase) {
    case "night":
      return alive.filter((u) => (g.people[u].role === "mafia" && !g.picks[u]) || (g.people[u].role === "detective" && !g.checked));
    case "day":
      return alive.filter((u) => !g.ready.includes(u));
    case "doctor":
      return alive.filter((u) => g.people[u].role === "doctor" && !g.save);
    case "vote":
      return alive.filter((u) => !g.votes[u]);
    case "bomb":
      return [g.bomb.uid]; // a Bomber who dropped out may come back, so the clock runs out first
    default:
      return null; // the other phases just run their clock
  }
}
function doneActing(room, g) {
  const w = waitingOn(room, g);
  return !!w && !w.length;
}
// What this viewer has to do right now (their screen's prompt), if anything.
function needToAct(room, g, uid) {
  if (!uid) return null;
  const me = g.people[uid];
  if (g.phase === "bomb") return g.bomb.uid === uid ? "bomb" : null;
  if (!me?.alive) return null;
  if (g.phase === "night" && me.role === "mafia") return "kill";
  if (g.phase === "night" && me.role === "detective" && !g.checked) return "check";
  if (g.phase === "doctor" && me.role === "doctor") return "save";
  if (g.phase === "vote") return "vote";
  if (g.phase === "day") return "ready";
  return null;
}

function countRoles(roles) {
  const c = { mafia: 0, detective: 0, doctor: 0, bomber: 0, civilian: 0 };
  for (const r of roles) c[r]++;
  return c;
}
function changed(room, g) {
  room.update();
}
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
const pickRandom = (list) => (list.length ? list[randomInt(list.length)] : null);

export { maxMafia };
