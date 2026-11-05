// Scopa, the Italian fishing game, with the 40-card Italian deck (ranks 1-7, fante 8,
// cavallo 9, re 10; suits coins, cups, swords, clubs). Two players, or four in two teams of
// two with partners sitting opposite each other (their captures count together).
//
// Each round: three cards to each player and four face up on the table (dealt again if three
// or four of them are re). In turn, everyone plays one card from their hand:
//  - if a table card has the same rank, you must take it (with several, you pick one);
//  - otherwise, if some table cards add up to your card's value, you must take them
//    (with several ways, you pick which);
//  - otherwise your card stays on the table.
// Clearing the table is a scopa (a point), except with the very last card of the round.
// When the hands are empty, three more cards each, until the deck is gone; then whoever made
// the last capture takes what's left on the table.
// Points per round: each scopa, most cards, most coins, the settebello (7 of coins) and the
// primiera (best card of each suit: 7 = 21, 6 = 18, ace = 16, 5 = 15, 4 = 14, 3 = 13, 2 = 12,
// figures = 10; a side missing a suit can't win it). Ties give nobody the point.
// First side to 11 at the end of a round wins (both past 11: the higher; a tie plays on).
import { italianDeck, shuffle, pick, rankOf, suitOf, startClock, stopClock, timeLeft, clockDone, log, nameOf } from "./common.js";

const TARGET = 11;
const TURN_MS = 30_000;
const ROUND_MS = 10_000; // the round's points stay on screen this long
const PRIMIERA = { 7: 21, 6: 18, 1: 16, 5: 15, 4: 14, 3: 13, 2: 12, 8: 10, 9: 10, 10: 10 };
const ITALIAN = { 1: "Asso", 8: "Fante", 9: "Cavallo", 10: "Re" };
const SUIT_WORD = { d: "coins", c: "cups", s: "swords", b: "clubs" };
const cardWord = (c) => `${ITALIAN[rankOf(c)] || rankOf(c)} of ${SUIT_WORD[suitOf(c)]}`;

export default {
  name: "Scopa",
  modes: ["1v1", "teams"],
  min: 2,
  max: 4,
  teamSize: 2,
  ranked: true,
  // Teams are always two against two.
  fixOpts(o) {
    if (o.mode === "teams") o.min = o.max = 4;
    return o;
  },
  info: {
    blurb: "The Italian classic with the 40-card deck. 1v1, or 2v2 with your partner sitting opposite. First to 11.",
    how: "Play one card a turn. If a table card has the same rank you must take it; otherwise you must take table cards that add up to your card (fante 8, cavallo 9, re 10). If you can't take anything your card stays on the table. Clearing the table is a scopa: one point. After the deck runs out, points for: most cards, most coins, the settebello (7 of coins), the primiera (best card of each suit: 7s are best, then 6s, aces, 5s…), plus every scopa. First to 11 wins. In 2v2 your partner (opposite you) scores with you.",
    keys: "Tap a card in your hand, then the table cards to take (if there's a choice), then Play. Tap a card twice to play it when there's nothing to choose.",
  },
  create,
  action(room, g, p, a) {
    if (g.phase !== "play") return;
    const si = g.turn;
    const seat = g.seats[si];
    if (seat.uid !== p.uid || a.k !== "play" || typeof a.card !== "string") return;
    if (!seat.hand.includes(a.card)) return;
    const opts = captures(a.card, g.table);
    let take = [];
    if (opts.length) {
      const want = Array.isArray(a.take) ? a.take.filter((c) => typeof c === "string") : [];
      const match = want.length ? opts.find((o) => o.length === want.length && o.every((c) => want.includes(c))) : opts.length === 1 ? opts[0] : null;
      if (!match) return room.sendTo(p.uid, { t: "cards:nope", msg: want.length ? "Those cards don't add up to your card" : "Pick which cards to take" });
      take = match;
    }
    play(room, g, si, a.card, take);
  },
  view,
  tick(room, g) {
    if (g.phase !== "play") return;
    const seat = g.seats[g.turn];
    if (!clockDone(room, g, seat.uid)) return;
    const [card, take] = autoMove(seat.hand, g.table);
    log(g, `${nameOf(room, seat.uid)} ran out of time`);
    play(room, g, g.turn, card, take);
  },
  leave(room, g, p) {
    if (g.phase === "over") return;
    const seat = g.seats.find((s) => s.uid === p.uid);
    if (!seat) return;
    finish(room, g, 1 - seat.side, `${p.name} left`);
  },
  summary: (room, g) => (g ? { text: `${g.score[0]}–${g.score[1]}` } : null),
};

/* ------------------------------------------------------------ captures */
// Every way to take with `card`: [[cards], ...]. A same-rank card must be taken alone; only
// when there's none can a sum be taken. Values are at most 10, so the search stays tiny.
export function captures(card, table) {
  const v = rankOf(card);
  const same = table.filter((t) => rankOf(t) === v);
  if (same.length) return same.map((t) => [t]);
  const out = [];
  const chosen = [];
  const search = (start, sum) => {
    if (sum === v) {
      if (chosen.length >= 2) out.push(chosen.slice());
      return;
    }
    for (let i = start; i < table.length; i++) {
      const r = rankOf(table[i]);
      if (sum + r > v) continue;
      chosen.push(table[i]);
      search(i + 1, sum + r);
      chosen.pop();
    }
  };
  search(0, 0);
  return out;
}

// For a player out of time: the capture taking the most (the settebello counts extra), else the
// lowest card.
function autoMove(hand, table) {
  let best = null;
  for (const c of hand)
    for (const t of captures(c, table)) {
      const worth = t.length + 1 + (t.includes("7d") || c === "7d" ? 5 : 0) + (t.length === table.length ? 10 : 0);
      if (!best || worth > best.worth) best = { card: c, take: t, worth };
    }
  if (best) return [best.card, best.take];
  const low = hand.slice().sort((a, b) => rankOf(a) - rankOf(b) || (suitOf(a) === "d") - (suitOf(b) === "d"))[0];
  return [low, []];
}

/* ------------------------------------------------------------ rounds */
function create(room) {
  let seats;
  const t0 = room.players.filter((p) => p.team === 0);
  const t1 = room.players.filter((p) => p.team === 1);
  if (room.opts.mode === "teams" && t0.length === 2 && t1.length === 2) seats = [t0[0], t1[0], t0[1], t1[1]].map((p) => ({ uid: p.uid, side: p.team, hand: [] }));
  else seats = room.players.map((p, i) => ({ uid: p.uid, side: i % 2, hand: [] })); // 1v1 (or teams that came out uneven: alternate)
  const g = {
    seats,
    score: [0, 0],
    round: 0,
    dealer: seats.indexOf(pick(seats)),
    deck: [],
    table: [],
    caps: [[], []],
    scope: [0, 0],
    turn: 0,
    lastCap: -1,
    phase: "play", // play | round | over
    last: null,
    seq: 0,
    roundRes: null,
    log: [],
    token: 0,
    deadline: 0,
  };
  startRound(room, g);
  return g;
}

function startRound(room, g) {
  g.round++;
  // Three or four re on the starting table would make scopa too easy for the dealer's side.
  do {
    g.deck = shuffle(italianDeck());
    for (const s of g.seats) s.hand = [];
    dealHands(g);
    g.table = g.deck.splice(-4);
  } while (g.table.filter((c) => rankOf(c) === 10).length >= 3);
  g.caps = [[], []];
  g.scope = [0, 0];
  g.lastCap = -1;
  g.last = null;
  g.roundRes = null;
  g.turn = (g.dealer + 1) % g.seats.length;
  g.phase = "play";
  log(g, `Round ${g.round}`);
  startClock(g, TURN_MS);
  room.update();
}

// Three cards each, starting with the player after the dealer.
function dealHands(g) {
  const n = g.seats.length;
  for (let k = 0; k < 3; k++) for (let j = 1; j <= n; j++) g.seats[(g.dealer + j) % n].hand.push(g.deck.pop());
}

function play(room, g, si, card, take) {
  const seat = g.seats[si];
  const name = nameOf(room, seat.uid);
  seat.hand.splice(seat.hand.indexOf(card), 1);
  let scopa = false;
  if (take.length) {
    g.table = g.table.filter((c) => !take.includes(c));
    g.caps[seat.side].push(card, ...take);
    g.lastCap = seat.side;
    const lastOfRound = !g.deck.length && g.seats.every((s) => !s.hand.length);
    scopa = !g.table.length && !lastOfRound;
    if (scopa) g.scope[seat.side]++;
    log(g, `${name} took ${take.map(cardWord).join(" + ")} with the ${cardWord(card)}${scopa ? " · SCOPA!" : ""}`);
  } else {
    g.table.push(card);
    log(g, `${name} put down the ${cardWord(card)}`);
  }
  g.last = { uid: seat.uid, card, take, scopa, seq: ++g.seq };
  if (g.seats.every((s) => !s.hand.length)) {
    if (!g.deck.length) return endRound(room, g);
    dealHands(g);
  }
  g.turn = (si + 1) % g.seats.length;
  startClock(g, TURN_MS);
  room.update();
}

const primiera = (cards) => {
  let total = 0;
  for (const s of ["d", "c", "s", "b"]) {
    const best = Math.max(0, ...cards.filter((c) => suitOf(c) === s).map((c) => PRIMIERA[rankOf(c)]));
    if (!best) return null; // missing a suit
    total += best;
  }
  return total;
};

// The points of a round for both sides, with what each was for.
export function scoreRound(caps, scope) {
  const cards = caps.map((c) => c.length);
  const coins = caps.map((c) => c.filter((x) => suitOf(x) === "d").length);
  const prim = caps.map(primiera);
  const sette = caps.findIndex((c) => c.includes("7d"));
  const pts = [0, 0];
  const lines = [];
  const award = (side, what) => {
    if (side < 0) return lines.push({ what, side: -1 });
    pts[side]++;
    lines.push({ what, side });
  };
  award(cards[0] === cards[1] ? -1 : cards[0] > cards[1] ? 0 : 1, "Most cards");
  award(coins[0] === coins[1] ? -1 : coins[0] > coins[1] ? 0 : 1, "Most coins");
  award(sette, "Settebello");
  const pw = prim[0] == null && prim[1] == null ? -1 : prim[1] == null ? 0 : prim[0] == null ? 1 : prim[0] === prim[1] ? -1 : prim[0] > prim[1] ? 0 : 1;
  award(pw, "Primiera");
  for (const side of [0, 1]) pts[side] += scope[side];
  return { cards, coins, prim, sette, scope: scope.slice(), pts, lines };
}

function endRound(room, g) {
  if (g.lastCap >= 0 && g.table.length) {
    g.caps[g.lastCap].push(...g.table);
    log(g, `The last ${g.table.length} table card${g.table.length > 1 ? "s go" : " goes"} to the side that took last`);
    g.table = [];
  }
  const res = scoreRound(g.caps, g.scope);
  g.score[0] += res.pts[0];
  g.score[1] += res.pts[1];
  res.total = g.score.slice();
  g.roundRes = res;
  stopClock(g);
  const [a, b] = g.score;
  if ((a >= TARGET || b >= TARGET) && a !== b) {
    g.phase = "round";
    room.update();
    const t = ++g.token;
    return room.timer(4000, () => g.token === t && finish(room, g, a > b ? 0 : 1, `${a}–${b}`));
  }
  g.phase = "round";
  g.roundEnds = Date.now() + ROUND_MS;
  room.update();
  const t = ++g.token;
  room.timer(ROUND_MS, () => {
    if (g.token !== t) return;
    g.dealer = (g.dealer + 1) % g.seats.length;
    startRound(room, g);
  });
}

function finish(room, g, side, reason) {
  if (g.phase === "over") return;
  g.phase = "over";
  g.token++;
  stopClock(g);
  room.update();
  const uids = (s) => g.seats.filter((x) => x.side === s).map((x) => x.uid);
  room.end({ sides: [{ uids: uids(side), place: 1 }, { uids: uids(1 - side), place: 2 }], reason });
}

/* ------------------------------------------------------------ what each player sees */
function view(room, g, uid) {
  const mine = g.seats.find((s) => s.uid === uid);
  return {
    v: "scopa",
    mode: g.seats.length === 4 ? "teams" : "1v1",
    seats: g.seats.map((s) => ({ uid: s.uid, side: s.side, n: s.hand.length })),
    hand: mine ? mine.hand : null,
    table: g.table,
    deck: g.deck.length,
    turn: g.phase === "play" ? g.seats[g.turn].uid : null,
    dealer: g.seats[g.dealer].uid,
    left: timeLeft(g),
    clock: TURN_MS,
    score: g.score,
    target: TARGET,
    round: g.round,
    caps: g.caps.map((c, i) => ({ n: c.length, scope: g.scope[i] })),
    lastCap: g.lastCap,
    last: g.last,
    phase: g.phase,
    roundRes: g.phase !== "play" ? g.roundRes : null,
    roundLeft: g.phase === "round" && g.roundEnds ? Math.max(0, g.roundEnds - Date.now()) : 0,
    log: g.log.slice(-6),
  };
}
