// Texas Hold'em, no limit, 2-8 players. Everyone starts with 1000 chips; the blinds start at
// 10/20 and double every 8 hands, so a game always ends. The last player with chips wins, and
// everyone else places in the reverse order they went out (two going out in the same hand:
// whoever started that hand with more chips places higher).
//
// A hand: two blinds, two private cards each, a round of betting, then the flop (3 shared
// cards), turn and river (1 each) with a round of betting after each. Players may fold, check,
// call, bet/raise any amount from the minimum up to everything they have, or go all-in.
// The minimum raise is the size of the last full raise (at least the big blind). An all-in
// that's smaller than a full raise doesn't let players who already acted raise again (unless
// several of them add up to a full raise). Whoever can't match a bet can still go all-in;
// side pots are worked out at the end from what each player put in, and each pot goes to the
// best hand among the players who paid into it (ties split it, odd chips going to the first
// winners after the dealer button). Nobody sees anyone else's cards until the showdown.
//
// Heads-up (two players) the dealer posts the small blind and acts first before the flop and
// last after it, as in real poker. A player whose clock runs out checks if they can, else folds.
import { frenchDeck, shuffle, pick, rankOf, suitOf, startClock, stopClock, timeLeft, clockDone, log, nameOf } from "./common.js";

const START_CHIPS = 1000;
const SMALL_BLIND = 10;
const LEVEL_HANDS = 8; // the blinds double after this many hands
const TURN_MS = 30_000;
const SHOW_MS = 6500; // the showdown stays on screen this long
const FOLD_WIN_MS = 2600; // everyone else folded
const RUNOUT_MS = 1300; // between streets when nobody can bet any more (all-in)

export default {
  name: "Texas Hold'em",
  modes: ["ffa"],
  min: 2,
  max: 8,
  ranked: true,
  info: {
    blurb: "No-limit Texas Hold'em. 1000 chips each, blinds double every 8 hands. Last one with chips wins.",
    how: "You get two private cards; five shared cards come in three steps (flop, turn, river) with a round of betting before and after each. Fold, check, call, or bet/raise with the slider (all-in any time). Best five-card hand from your two cards and the five shared ones wins the pot at the showdown, or win it earlier when everyone else folds. Side pots are handled for you when someone is all-in. Blinds start at 10/20 and double every 8 hands. You have 30 seconds to act: when time runs out you check if you can, otherwise fold.",
    keys: "Tap Fold / Check / Call / Raise. Hand ranks, best first: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, pair, high card.",
  },
  create,
  action(room, g, p, a) {
    if (g.phase !== "bet" || g.seats[g.toAct]?.uid !== p.uid) return;
    act(room, g, g.toAct, a);
  },
  view,
  tick(room, g) {
    if (g.phase !== "bet" || g.toAct < 0) return;
    const s = g.seats[g.toAct];
    if (!clockDone(room, g, s.uid)) return;
    const k = g.currentBet > s.bet ? "fold" : "check";
    log(g, `${nameOf(room, s.uid)} ran out of time`);
    act(room, g, g.toAct, { k });
  },
  leave,
  summary: (room, g) => (g ? { text: `Hand ${g.hand} · blinds ${g.sb}/${g.bb}` } : null),
};

/* ------------------------------------------------------------ the table */
function create(room) {
  const g = {
    seats: room.players.map((p) => ({ uid: p.uid, chips: START_CHIPS, hole: [], bet: 0, total: 0, folded: false, allIn: false, out: false, left: false, acted: false, faced: 0, last: null, startChips: START_CHIPS })),
    hand: 0,
    button: -1,
    sbSeat: -1,
    bbSeat: -1,
    sb: SMALL_BLIND,
    bb: SMALL_BLIND * 2,
    board: [],
    deck: [],
    burned: [],
    street: "preflop",
    phase: "bet", // bet | runout | show | over
    toAct: -1,
    currentBet: 0,
    minRaise: 0,
    results: null,
    elim: [], // uids, first out first
    log: [],
    token: 0, // guards the delayed steps (a newer step cancels an older one)
    deadline: 0,
  };
  startHand(room, g);
  return g;
}

// The next seat after `from` (going round the table) that passes `ok`, or -1.
function nextSeat(g, from, ok) {
  const n = g.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k + n) % n;
    if (ok(g.seats[i])) return i;
  }
  return -1;
}
const dealt = (s) => s.hole.length > 0;
const contenders = (g) => g.seats.filter((s) => dealt(s) && !s.folded);
const canAct = (s) => dealt(s) && !s.folded && !s.allIn;
const needs = (g, s) => canAct(s) && (!s.acted || s.bet < g.currentBet);

function pay(s, amt) {
  amt = Math.max(0, Math.min(amt, s.chips));
  s.chips -= amt;
  s.bet += amt;
  s.total += amt;
  if (s.chips === 0) s.allIn = true;
  return amt;
}

function startHand(room, g) {
  const alive = g.seats.filter((s) => !s.out);
  if (alive.length < 2) return finish(room, g);
  g.hand++;
  const level = Math.floor((g.hand - 1) / LEVEL_HANDS);
  g.sb = SMALL_BLIND * 2 ** level;
  g.bb = g.sb * 2;
  g.board = [];
  g.burned = [];
  g.deck = shuffle(frenchDeck());
  g.results = null;
  g.street = "preflop";
  for (const s of g.seats) Object.assign(s, { hole: [], bet: 0, total: 0, folded: s.out, allIn: false, acted: false, faced: 0, last: null, startChips: s.chips });
  g.button = g.button < 0 ? g.seats.indexOf(pick(alive)) : nextSeat(g, g.button, (s) => !s.out);
  const headsUp = alive.length === 2;
  g.sbSeat = headsUp ? g.button : nextSeat(g, g.button, (s) => !s.out);
  g.bbSeat = nextSeat(g, g.sbSeat, (s) => !s.out);
  // Two cards each, one at a time, starting left of the button.
  for (let round = 0; round < 2; round++) {
    let i = g.button;
    for (let k = 0; k < alive.length; k++) {
      i = nextSeat(g, i, (s) => !s.out);
      g.seats[i].hole.push(g.deck.pop());
    }
  }
  const sbPaid = pay(g.seats[g.sbSeat], g.sb);
  g.seats[g.sbSeat].last = { k: "sb", amt: sbPaid };
  const bbPaid = pay(g.seats[g.bbSeat], g.bb);
  g.seats[g.bbSeat].last = { k: "bb", amt: bbPaid };
  // The bet to call is the full big blind even when the big blind couldn't afford all of it.
  g.currentBet = g.bb;
  g.minRaise = g.bb;
  g.phase = "bet";
  g.toAct = -1;
  log(g, `Hand ${g.hand} · blinds ${g.sb}/${g.bb}`);
  next(room, g, g.bbSeat);
}

// Whose turn is next after seat `from`; ends the betting round when nobody needs to act.
function next(room, g, from) {
  if (contenders(g).length === 1) return winUncontested(room, g);
  const actors = g.seats.filter(canAct);
  const topBet = Math.max(0, ...contenders(g).map((s) => s.bet));
  // Everyone else is all-in and the last player has matched them: nothing left to decide.
  if (!actors.length || (actors.length === 1 && actors[0].bet >= topBet)) return endStreet(room, g);
  const i = nextSeat(g, from, (s) => needs(g, s));
  if (i < 0) return endStreet(room, g);
  g.toAct = i;
  startClock(g, TURN_MS);
  room.update();
}

// Seat i acts. Returns false (and changes nothing) for an action that isn't allowed.
function act(room, g, i, a) {
  const s = g.seats[i];
  const name = nameOf(room, s.uid);
  const toCall = Math.max(0, g.currentBet - s.bet);
  const maxTo = s.bet + s.chips; // everything they have
  const canRaise = maxTo > g.currentBet && (!s.acted || g.currentBet - s.faced >= g.minRaise);
  const k = String(a?.k || "");
  if (k === "fold") {
    s.folded = true;
    s.last = { k: "fold" };
    log(g, `${name} folded`);
  } else if (k === "check") {
    if (toCall > 0) return false;
    s.last = { k: "check" };
    log(g, `${name} checked`);
  } else if (k === "call" || ((k === "allin" || k === "raise") && !canRaise)) {
    // A call. "All-in" from a player who may not raise (they can't afford more than a call, or
    // only a short all-in raised the bet since they acted) is a call too.
    if (k === "raise" && !(Math.floor(Number(a.to)) >= maxTo)) return false;
    if (toCall <= 0) return false;
    const amt = pay(s, toCall);
    s.last = { k: s.allIn ? "allin" : "call", amt: s.bet };
    log(g, `${name} ${s.allIn ? `called all-in (${amt})` : `called ${amt}`}`);
  } else if (k === "raise" || k === "allin") {
    if (!canRaise) return false;
    let to = k === "allin" ? maxTo : Math.floor(Number(a.to));
    if (!Number.isFinite(to)) return false;
    to = Math.min(to, maxTo);
    const minTo = g.currentBet + g.minRaise;
    if (to < minTo && to !== maxTo) return false;
    if (to <= g.currentBet) return false;
    const opening = g.currentBet === 0;
    const raiseBy = to - g.currentBet;
    if (raiseBy >= g.minRaise) g.minRaise = raiseBy; // a full raise sets the new minimum
    g.currentBet = to;
    pay(s, to - s.bet);
    s.last = { k: s.allIn ? "allin" : opening ? "bet" : "raise", amt: to };
    log(g, `${name} ${s.allIn ? `went all-in (${to})` : opening ? `bet ${to}` : `raised to ${to}`}`);
  } else return false;
  s.acted = true;
  s.faced = g.currentBet;
  next(room, g, i);
  return true;
}

function dealStreet(g) {
  g.burned.push(g.deck.pop()); // burn one
  if (g.street === "preflop") {
    g.board.push(g.deck.pop(), g.deck.pop(), g.deck.pop());
    g.street = "flop";
  } else {
    g.board.push(g.deck.pop());
    g.street = g.street === "flop" ? "turn" : "river";
  }
}

function endStreet(room, g) {
  g.toAct = -1;
  stopClock(g);
  for (const s of g.seats) {
    s.bet = 0;
    s.acted = false;
    s.faced = 0;
    if (s.last && !["fold", "allin"].includes(s.last.k)) s.last = null;
  }
  g.currentBet = 0;
  g.minRaise = g.bb;
  if (g.street === "river") return showdown(room, g);
  if (g.seats.filter(canAct).length < 2) {
    // Nobody can bet any more: the rest of the board comes out one street at a time.
    g.phase = "runout";
    room.update();
    const t = ++g.token;
    room.timer(RUNOUT_MS, () => {
      if (g.token !== t || g.phase !== "runout") return;
      dealStreet(g);
      endStreet(room, g);
    });
    return;
  }
  dealStreet(g);
  g.phase = "bet";
  next(room, g, g.button);
}

/* ------------------------------------------------------------ pots and the showdown */
// The pots, smallest (main) first: each { amount, eligible: [seats] }. Built from what everyone
// put in this hand, folded players included; only players still in can win a pot, and only
// the pots they paid their full share of.
export function potsOf(seats) {
  const paid = seats.filter((s) => s.total > 0);
  const live = paid.filter((s) => !s.folded);
  const levels = [...new Set(live.map((s) => s.total))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const s of paid) amount += Math.max(0, Math.min(s.total, level) - prev);
    if (amount > 0) pots.push({ amount, eligible: live.filter((s) => s.total >= level) });
    prev = level;
  }
  // Chips a folded player put in above every live player's total (rare) join the last pot.
  let rest = 0;
  for (const s of paid) rest += Math.max(0, s.total - prev);
  if (rest && pots.length) pots[pots.length - 1].amount += rest;
  return pots;
}

function winUncontested(room, g) {
  const w = contenders(g)[0];
  const amount = g.seats.reduce((n, s) => n + s.total, 0);
  w.chips += amount;
  for (const s of g.seats) s.bet = 0;
  g.results = { pots: [{ amount, winners: [w.uid], name: null }], shown: {}, folded: true };
  log(g, `${nameOf(room, w.uid)} won ${amount}`);
  pause(room, g, FOLD_WIN_MS);
}

function showdown(room, g) {
  const live = contenders(g);
  const hands = new Map(live.map((s) => [s, bestHand([...s.hole, ...g.board])]));
  const order = (s) => (g.seats.indexOf(s) - g.button + g.seats.length - 1) % g.seats.length; // first after the button = 0
  const pots = potsOf(g.seats).map((pot) => {
    let best = null;
    let winners = [];
    for (const s of pot.eligible) {
      const h = hands.get(s);
      const c = best ? compare(h.score, best.score) : 1;
      if (c > 0) {
        best = h;
        winners = [s];
      } else if (c === 0) winners.push(s);
    }
    winners.sort((a, b) => order(a) - order(b));
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const w of winners) w.chips += share + (odd-- > 0 ? 1 : 0);
    return { amount: pot.amount, winners: winners.map((w) => w.uid), name: pot.eligible.length > 1 ? best.name : null, back: pot.eligible.length === 1 };
  });
  const shown = {};
  for (const s of live) {
    const h = hands.get(s);
    shown[s.uid] = { cards: s.hole, name: h.name, best: h.cards };
  }
  g.results = { pots, shown, folded: false };
  for (const p of pots) if (!p.back) log(g, `${p.winners.map((u) => nameOf(room, u)).join(" & ")} ${p.winners.length > 1 ? "split" : "won"} ${p.amount} with ${p.name}`);
  pause(room, g, SHOW_MS);
}

// The hand's result stays on screen for a moment, then the next hand (or the end).
function pause(room, g, ms) {
  g.phase = "show";
  g.toAct = -1;
  stopClock(g);
  room.update();
  const t = ++g.token;
  room.timer(ms, () => g.token === t && afterHand(room, g));
}

function afterHand(room, g) {
  const busted = g.seats.filter((s) => !s.out && s.chips === 0);
  busted.sort((a, b) => a.startChips - b.startChips); // fewer chips at the start: out first
  for (const s of busted) {
    s.out = true;
    g.elim.push(s.uid);
    log(g, `${nameOf(room, s.uid)} is out`);
  }
  if (g.seats.filter((s) => !s.out).length < 2) return finish(room, g);
  startHand(room, g);
}

function finish(room, g) {
  if (g.phase === "over") return;
  g.phase = "over";
  g.toAct = -1;
  stopClock(g);
  const alive = g.seats.filter((s) => !s.out).sort((a, b) => b.chips - a.chips);
  const order = [...alive.map((s) => s.uid), ...g.elim.slice().reverse()];
  room.update();
  room.end({ order, reason: alive[0] ? `${nameOf(room, alive[0].uid)} won all the chips` : "Game over" });
}

function leave(room, g, p) {
  const i = g.seats.findIndex((s) => s.uid === p.uid);
  const s = g.seats[i];
  if (!s || s.out || g.phase === "over") return;
  s.out = true;
  s.left = true;
  s.chips = 0; // a player who walks away forfeits what's in front of them
  g.elim.push(s.uid);
  if (dealt(s) && !s.folded) {
    s.folded = true;
    s.last = { k: "fold" };
  }
  log(g, `${p.name} left the table`);
  if (g.seats.filter((x) => !x.out).length < 2) return finish(room, g);
  if (g.phase === "bet" || g.phase === "runout") {
    if (contenders(g).length === 1) return winUncontested(room, g);
    if (g.phase === "bet" && g.toAct === i) return next(room, g, i);
    if (g.phase === "bet") {
      // Someone else's turn: still check whether the round is over now that they're gone.
      const stillNeeded = g.seats.some((x) => needs(g, x));
      if (!stillNeeded) return endStreet(room, g);
    }
  }
  room.update();
}

/* ------------------------------------------------------------ what each player sees */
function view(room, g, uid) {
  const me = g.seats.findIndex((s) => s.uid === uid);
  const shown = g.phase === "show" ? g.results?.shown || {} : {};
  const seats = g.seats.map((s) => {
    let cards = null; // null: no cards · number: that many face down · array: face up
    if (dealt(s)) {
      const open = s.uid === uid || shown[s.uid] || (g.phase === "runout" && !s.folded);
      if (!s.folded || s.uid === uid) cards = open ? s.hole : s.hole.length;
    }
    return { uid: s.uid, chips: s.chips, bet: s.bet, folded: s.folded && dealt(s), allIn: s.allIn, out: s.out, left: s.left, last: s.last, cards, hand: shown[s.uid]?.name || null, best: shown[s.uid]?.best || null };
  });
  const total = g.seats.reduce((n, s) => n + s.total, 0);
  const pot = total - g.seats.reduce((n, s) => n + s.bet, 0);
  let you = null;
  const s = g.seats[me];
  if (s && dealt(s)) {
    you = { best: !s.folded && g.board.length >= 3 ? bestHand([...s.hole, ...g.board]).name : null, turn: false };
    if (g.phase === "bet" && g.toAct === me) {
      const maxTo = s.bet + s.chips;
      you.turn = true;
      you.toCall = Math.min(Math.max(0, g.currentBet - s.bet), s.chips);
      you.canCheck = g.currentBet <= s.bet;
      you.canRaise = maxTo > g.currentBet && (!s.acted || g.currentBet - s.faced >= g.minRaise);
      you.minTo = Math.min(g.currentBet + g.minRaise, maxTo);
      you.maxTo = maxTo;
      you.bet = s.bet;
      you.opening = g.currentBet === 0;
    }
  }
  return {
    v: "poker",
    hand: g.hand,
    sb: g.sb,
    bb: g.bb,
    levelIn: LEVEL_HANDS - ((g.hand - 1) % LEVEL_HANDS),
    nextSb: g.sb * 2,
    button: g.seats[g.button]?.uid || null,
    sbUid: g.seats[g.sbSeat]?.uid || null,
    bbUid: g.seats[g.bbSeat]?.uid || null,
    seats,
    board: g.board,
    pot,
    total,
    street: g.street,
    phase: g.phase,
    toAct: g.seats[g.toAct]?.uid || null,
    left: timeLeft(g),
    clock: TURN_MS,
    currentBet: g.currentBet,
    results: g.phase === "show" ? g.results : null,
    log: g.log.slice(-8),
    you,
  };
}

/* ------------------------------------------------------------ hand ranking */
// Ace is high (14), except in the 5-4-3-2-A straight.
const pokerRank = (c) => (rankOf(c) === 1 ? 14 : rankOf(c));
const RANK_WORD = { 14: "Ace", 13: "King", 12: "Queen", 11: "Jack" };
const word = (r) => RANK_WORD[r] || String(r);
const words = (r) => (r === 6 ? "6s" : `${word(r)}s`);

// The score of exactly five cards: [category, tie-breakers...]; higher arrays win.
// Categories: 8 straight flush, 7 four of a kind, 6 full house, 5 flush, 4 straight,
// 3 three of a kind, 2 two pair, 1 pair, 0 high card.
export function score5(cards) {
  const rs = cards.map(pokerRank).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  let straight = 0;
  if (new Set(rs).size === 5) {
    if (rs[0] - rs[4] === 4) straight = rs[0];
    else if (rs[0] === 14 && rs[1] === 5) straight = 5; // A-2-3-4-5
  }
  const count = {};
  for (const r of rs) count[r] = (count[r] || 0) + 1;
  const groups = Object.entries(count)
    .map(([r, n]) => [n, +r])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const kick = groups.map((x) => x[1]);
  if (straight && flush) return [8, straight];
  if (groups[0][0] === 4) return [7, ...kick];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...kick];
  if (flush) return [5, ...rs];
  if (straight) return [4, straight];
  if (groups[0][0] === 3) return [3, ...kick];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...kick];
  if (groups[0][0] === 2) return [1, ...kick];
  return [0, ...rs];
}

export function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function handName(score) {
  const [cat, a, b] = score;
  switch (cat) {
    case 8:
      return a === 14 ? "Royal flush" : `Straight flush, ${word(a)} high`;
    case 7:
      return `Four ${words(a)}`;
    case 6:
      return `Full house, ${words(a)} over ${words(b)}`;
    case 5:
      return `Flush, ${word(a)} high`;
    case 4:
      return `Straight, ${word(a)} high`;
    case 3:
      return `Three ${words(a)}`;
    case 2:
      return `Two pair, ${words(a)} and ${words(b)}`;
    case 1:
      return `Pair of ${words(a)}`;
    default:
      return `${word(a)} high`;
  }
}

// The best five of 5-7 cards: { score, name, cards }.
export function bestHand(cards) {
  let best = null;
  const n = cards.length;
  const pickFive = (start, chosen) => {
    if (chosen.length === 5) {
      const sc = score5(chosen);
      if (!best || compare(sc, best.score) > 0) best = { score: sc, cards: chosen.slice() };
      return;
    }
    for (let i = start; i <= n - (5 - chosen.length); i++) {
      chosen.push(cards[i]);
      pickFive(i + 1, chosen);
      chosen.pop();
    }
  };
  pickFive(0, []);
  best.name = handName(best.score);
  return best;
}
