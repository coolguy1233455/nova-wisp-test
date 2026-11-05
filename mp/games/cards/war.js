// War, two players, pure luck (so never ranked). Half the deck each, face down. Both flip their
// top card; the higher one (ace high) takes both. A tie is a war: three cards face down each,
// then one face up, and the higher of those takes everything on the table (ties go to war
// again). Someone who runs out of cards in a war loses it. Won cards go to the bottom of the
// winner's pile in a random order (so a game can't loop forever). Take all 52 cards to win,
// or have more cards when the battle limit is reached.
//
// Both players tap Flip each battle (or turn on Auto); if one waits too long, their card flips
// by itself.
import { frenchDeck, shuffle, rankOf, startClock, stopClock, timeLeft, nameOf } from "./common.js";

const SHOW_MS = 1100; // a battle's cards stay up this long
const WAR_SHOW_MS = 2400;
const WAIT_MS = 8000; // flips by itself after this long
const AFTER_OTHER_MS = 4000; // ... or this long after the other player flipped
const value = (c) => (rankOf(c) === 1 ? 14 : rankOf(c));

export default {
  name: "War",
  modes: ["1v1"],
  min: 2,
  max: 2,
  ranked: false,
  options: [
    {
      key: "cap",
      label: "Battle limit",
      type: "select",
      def: "200",
      choices: [
        { value: "100", label: "100 battles" },
        { value: "200", label: "200 battles" },
        { value: "400", label: "400 battles" },
      ],
    },
  ],
  info: {
    blurb: "Flip, compare, the higher card takes both. Ties mean war! Pure luck, so never ranked.",
    how: "Both players flip their top card; the higher card (ace high) takes both. Equal cards start a war: three cards face down and one face up each, and the higher face-up card takes the lot. Win by taking all 52 cards, or by holding more cards when the battle limit is reached. Turn on Auto to flip by yourself.",
    keys: "Tap Flip (or your deck) · Auto flips for you · Space flips too.",
  },
  create(room) {
    const deck = shuffle(frenchDeck());
    const cap = Math.max(20, Math.min(1000, Number(room.opts.cap) || 200));
    const g = {
      seats: room.players.slice(0, 2).map((p, i) => ({ uid: p.uid, pile: deck.slice(i * 26, i * 26 + 26), ready: false, auto: false })),
      table: [[], []],
      phase: "ready", // ready | show | over
      battles: 0,
      cap,
      last: null,
      seq: 0,
      token: 0,
      deadline: 0,
    };
    startClock(g, WAIT_MS);
    return g;
  },
  action(room, g, p, a) {
    const seat = g.seats.find((s) => s.uid === p.uid);
    if (!seat || g.phase === "over") return;
    if (a.k === "auto") {
      seat.auto = !!a.on;
      if (seat.auto && g.phase === "ready") flip(room, g, seat);
      return room.update();
    }
    if (a.k === "flip" && g.phase === "ready") flip(room, g, seat);
  },
  view(room, g, uid) {
    return {
      v: "war",
      me: g.seats.findIndex((s) => s.uid === uid),
      seats: g.seats.map((s) => ({ uid: s.uid, n: s.pile.length, ready: s.ready, auto: s.auto })),
      table: g.table.map((cards) => cards.map((x) => (x.up ? x.c : null))),
      phase: g.phase,
      battles: g.battles,
      cap: g.cap,
      left: timeLeft(g),
      clock: g.clockMs || WAIT_MS,
      last: g.last,
    };
  },
  tick(room, g) {
    if (g.phase !== "ready" || !g.deadline || Date.now() < g.deadline) return;
    for (const s of g.seats) if (!s.ready) flip(room, g, s, true);
  },
  leave(room, g, p) {
    if (g.phase === "over") return;
    const other = g.seats.find((s) => s.uid !== p.uid);
    over(room, g, other?.uid || null, `${p.name} left`);
  },
  summary: (room, g) => (g ? { text: `Battle ${g.battles}/${g.cap}` } : null),
};

function flip(room, g, seat, quiet = false) {
  if (seat.ready) return;
  seat.ready = true;
  if (g.seats.every((s) => s.ready)) return battle(room, g);
  // The other one has a few seconds left to flip.
  if (!quiet) startClock(g, Math.min(timeLeft(g) || AFTER_OTHER_MS, AFTER_OTHER_MS));
  room.update();
}

function battle(room, g) {
  const [a, b] = g.seats;
  g.table = [[], []];
  let wars = 0;
  let winner = -1;
  for (;;) {
    // Out of cards when a card is needed: that player loses the battle (and the game).
    if (!a.pile.length || !b.pile.length) {
      winner = a.pile.length ? 0 : b.pile.length ? 1 : -2;
      break;
    }
    const ca = a.pile.shift();
    const cb = b.pile.shift();
    g.table[0].push({ c: ca, up: true });
    g.table[1].push({ c: cb, up: true });
    if (value(ca) !== value(cb)) {
      winner = value(ca) > value(cb) ? 0 : 1;
      break;
    }
    // War: three face down each (keeping one back to turn up, if they can).
    wars++;
    for (const [i, s] of g.seats.entries()) {
      const k = Math.min(3, Math.max(0, s.pile.length - 1));
      for (let j = 0; j < k; j++) g.table[i].push({ c: s.pile.shift(), up: false });
    }
  }
  g.battles++;
  const won = [...g.table[0], ...g.table[1]].map((x) => x.c);
  if (winner >= 0) g.seats[winner].pile.push(...shuffle(won));
  g.last = { winner: winner >= 0 ? g.seats[winner].uid : null, wars, n: won.length, seq: ++g.seq };
  g.phase = "show";
  stopClock(g);
  for (const s of g.seats) s.ready = false;
  room.update();
  const t = ++g.token;
  room.timer(wars ? WAR_SHOW_MS : SHOW_MS, () => {
    if (g.token !== t) return;
    if (winner === -2) return over(room, g, null, "Both ran out of cards in a war");
    const loser = g.seats.find((s) => !s.pile.length);
    if (loser) {
      const w = g.seats.find((s) => s !== loser);
      return over(room, g, w.uid, `${nameOf(room, w.uid)} took every card`);
    }
    if (g.battles >= g.cap) {
      const [na, nb] = g.seats.map((s) => s.pile.length);
      if (na === nb) return over(room, g, null, `Battle limit: ${na} cards each`);
      const w = na > nb ? a : b;
      return over(room, g, w.uid, `Battle limit reached: ${nameOf(room, w.uid)} had more cards (${Math.max(na, nb)} vs ${Math.min(na, nb)})`);
    }
    g.table = [[], []];
    g.phase = "ready";
    startClock(g, WAIT_MS);
    for (const s of g.seats) if (s.auto) s.ready = true;
    if (g.seats.every((s) => s.ready)) return battle(room, g);
    if (g.seats.some((s) => s.ready)) startClock(g, AFTER_OTHER_MS);
    room.update();
  });
}

function over(room, g, winner, reason) {
  g.phase = "over";
  g.token++;
  stopClock(g);
  room.update();
  room.end(winner ? { winners: [winner], reason } : { draw: true, reason });
}
