// Crazy Eights, 2-5 players, one hand. Seven cards each with two players, five with more; one
// card starts the discard pile (never an 8). In turn, play a card that matches the top card's
// suit or rank, or any 8 (eights are wild: you name the suit that must follow). Instead of
// playing you may draw one card from the stock; after drawing you can play any card that fits
// or pass. When the stock runs out, the discard pile (all but its top card) is shuffled into a
// new stock. First to get rid of every card wins. Everyone else places by the points left in
// their hand (8 = 50, J/Q/K = 10, ace = 1, others their number; fewer is better, ties share a
// place). If nobody can play or draw for a whole round of turns, the hand ends there and points
// decide it all. A player whose clock runs out plays something if they can, else draws, then
// plays or passes.
import { frenchDeck, shuffle, pick, rankOf, suitOf, startClock, stopClock, timeLeft, clockDone, log, nameOf, cardName } from "./common.js";

const TURN_MS = 30_000;
const AFTER_DRAW_MS = 20_000;
const SUITS = ["s", "h", "d", "c"];
const SUIT_WORD = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };

export default {
  name: "Crazy Eights",
  modes: ["ffa"],
  min: 2,
  max: 5,
  ranked: true,
  info: {
    blurb: "Match the suit or the rank; eights are wild. First to empty their hand wins.",
    how: "Play a card with the same suit or rank as the top of the pile. Any 8 can be played any time, and you choose the suit that comes next. Can't (or don't want to) play? Draw a card; then play something that fits, or pass. First to get rid of all their cards wins; everyone else places by the points left in their hand (8 = 50, faces = 10, ace = 1, others their number). 30 seconds a turn.",
    keys: "Tap a card to pick it, tap again (or Play) to play it · Draw / Pass buttons · after an 8, pick a suit.",
  },
  create,
  action(room, g, p, a) {
    if (g.phase !== "play") return;
    const si = g.turn;
    const seat = g.seats[si];
    if (seat.uid !== p.uid) return;
    if (a.k === "play") playCard(room, g, si, String(a.card || ""), a.suit);
    else if (a.k === "draw") draw(room, g, si);
    else if (a.k === "pass") pass(room, g, si);
  },
  view,
  tick(room, g) {
    if (g.phase !== "play") return;
    const si = g.turn;
    const seat = g.seats[si];
    if (!clockDone(room, g, seat.uid)) return;
    log(g, `${nameOf(room, seat.uid)} ran out of time`);
    autoTurn(room, g, si);
  },
  leave(room, g, p) {
    if (g.phase === "over") return;
    const si = g.seats.findIndex((s) => s.uid === p.uid);
    const seat = g.seats[si];
    if (!seat || seat.left) return;
    seat.left = true;
    g.leftOrder.push(seat.uid);
    // Their cards go under the stock.
    g.stock.unshift(...shuffle(seat.hand.splice(0)));
    log(g, `${p.name} left`);
    if (active(g).length < 2) return finish(room, g, active(g)[0]?.uid || null, "Everyone else left");
    if (g.turn === si) nextTurn(room, g);
    else room.update();
  },
  summary: (room, g) => (g ? { text: `${g.stock.length} cards in the stock` } : null),
};

const active = (g) => g.seats.filter((s) => !s.left);
const top = (g) => g.discard[g.discard.length - 1];
const fits = (g, c) => rankOf(c) === 8 || suitOf(c) === g.suit || rankOf(c) === rankOf(top(g));
const canDraw = (g) => g.stock.length > 0 || g.discard.length > 1;
export const penalty = (c) => (rankOf(c) === 8 ? 50 : rankOf(c) >= 11 ? 10 : rankOf(c));
// The suit a player holds most of (for an 8 played without naming one).
const favorite = (hand) => {
  const n = { s: 0, h: 0, d: 0, c: 0 };
  for (const c of hand) if (rankOf(c) !== 8) n[suitOf(c)]++;
  return SUITS.reduce((a, b) => (n[b] > n[a] ? b : a), "s");
};

function create(room) {
  const deck = shuffle(frenchDeck());
  const n = room.players.length;
  const seats = room.players.map((p) => ({ uid: p.uid, hand: [], left: false }));
  const size = n === 2 ? 7 : 5;
  for (let k = 0; k < size; k++) for (const s of seats) s.hand.push(deck.pop());
  // The first card is never an 8: an 8 goes back into the stock somewhere random.
  let first = deck.pop();
  while (rankOf(first) === 8) {
    deck.splice(Math.floor(Math.random() * deck.length), 0, first);
    first = deck.pop();
  }
  const g = {
    seats,
    stock: deck,
    discard: [first],
    suit: suitOf(first),
    turn: seats.indexOf(pick(seats)),
    drew: false,
    stale: 0, // turns in a row that ended with nobody able to play or draw
    phase: "play",
    last: null,
    seq: 0,
    leftOrder: [],
    log: [],
    deadline: 0,
  };
  log(g, `First card: ${cardName(first)}`);
  startClock(g, TURN_MS);
  return g;
}

function nextTurn(room, g) {
  const n = g.seats.length;
  let i = g.turn;
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (!g.seats[i].left) break;
  }
  g.turn = i;
  g.drew = false;
  startClock(g, TURN_MS);
  room.update();
}

function playCard(room, g, si, card, suit) {
  const seat = g.seats[si];
  if (!seat.hand.includes(card) || !fits(g, card)) return false;
  seat.hand.splice(seat.hand.indexOf(card), 1);
  g.discard.push(card);
  const eight = rankOf(card) === 8;
  g.suit = eight ? (SUITS.includes(suit) ? suit : favorite(seat.hand)) : suitOf(card);
  g.stale = 0;
  g.last = { uid: seat.uid, k: "play", card, suit: eight ? g.suit : null, seq: ++g.seq };
  log(g, `${nameOf(room, seat.uid)} played the ${cardName(card)}${eight ? ` and picked ${SUIT_WORD[g.suit]}` : ""}`);
  if (!seat.hand.length) return finish(room, g, seat.uid, `${nameOf(room, seat.uid)} played their last card`);
  nextTurn(room, g);
  return true;
}

function draw(room, g, si) {
  if (g.drew) return false;
  if (!g.stock.length) {
    if (g.discard.length < 2) return false;
    const keep = g.discard.pop();
    g.stock = shuffle(g.discard);
    g.discard = [keep];
    log(g, "The pile was shuffled into a new stock");
  }
  const seat = g.seats[si];
  const c = g.stock.pop();
  seat.hand.push(c);
  g.drew = c;
  g.last = { uid: seat.uid, k: "draw", seq: ++g.seq };
  log(g, `${nameOf(room, seat.uid)} drew a card`);
  startClock(g, AFTER_DRAW_MS);
  room.update();
  return true;
}

function pass(room, g, si) {
  // Only after drawing, or when there's nothing left to draw.
  if (!g.drew && canDraw(g)) return false;
  const seat = g.seats[si];
  g.last = { uid: seat.uid, k: "pass", seq: ++g.seq };
  log(g, `${nameOf(room, seat.uid)} passed`);
  g.stale = canDraw(g) ? 0 : g.stale + 1;
  if (g.stale >= active(g).length) return finish(room, g, null, "Nobody could play: lowest points wins");
  nextTurn(room, g);
  return true;
}

function autoTurn(room, g, si) {
  const seat = g.seats[si];
  const choose = () => seat.hand.filter((c) => fits(g, c)).sort((a, b) => (rankOf(a) === 8) - (rankOf(b) === 8) || penalty(b) - penalty(a))[0];
  let c = choose();
  if (!c && !g.drew && draw(room, g, si)) c = choose();
  if (c) return playCard(room, g, si, c, favorite(seat.hand.filter((x) => x !== c)));
  pass(room, g, si);
}

function finish(room, g, winner, reason) {
  if (g.phase === "over") return;
  g.phase = "over";
  stopClock(g);
  // Places: the winner, then fewest points left (ties share), then those who left (last to leave first).
  const rest = active(g)
    .filter((s) => s.uid !== winner)
    .map((s) => ({ uid: s.uid, pts: s.hand.reduce((n, c) => n + penalty(c), 0) }))
    .sort((a, b) => a.pts - b.pts);
  const sides = [];
  let place = 1;
  if (winner) sides.push({ uids: [winner], place: place++ });
  rest.forEach((r, i) => {
    if (i > 0 && r.pts === rest[i - 1].pts) sides[sides.length - 1].uids.push(r.uid);
    else sides.push({ uids: [r.uid], place: place++ });
  });
  for (const uid of g.leftOrder.slice().reverse()) sides.push({ uids: [uid], place: place++ });
  g.points = Object.fromEntries(active(g).map((s) => [s.uid, s.hand.reduce((n, c) => n + penalty(c), 0)]));
  g.reveal = Object.fromEntries(active(g).map((s) => [s.uid, s.hand.slice()]));
  room.update();
  room.end({ sides, reason });
}

function view(room, g, uid) {
  const si = g.seats.findIndex((s) => s.uid === uid);
  const mine = g.seats[si];
  const myTurn = g.phase === "play" && si === g.turn;
  return {
    v: "crazy-eights",
    seats: g.seats.map((s) => ({ uid: s.uid, n: s.hand.length, left: s.left, cards: g.reveal?.[s.uid] || null, pts: g.points?.[s.uid] ?? null })),
    hand: mine ? mine.hand : null,
    top: top(g),
    under: g.discard.slice(-4, -1),
    stock: g.stock.length,
    suit: g.suit,
    turn: g.phase === "play" ? g.seats[g.turn].uid : null,
    phase: g.phase,
    left: timeLeft(g),
    clock: g.drew ? AFTER_DRAW_MS : TURN_MS,
    you: myTurn ? { drew: g.drew || null, canDraw: !g.drew && canDraw(g), canPass: !!g.drew || !canDraw(g), playable: mine.hand.filter((c) => fits(g, c)) } : null,
    last: g.last,
    log: g.log.slice(-6),
  };
}
