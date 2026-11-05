// Hearts, four players, each for themselves. Thirteen cards each. Before each hand everyone
// passes three cards: left, then right, then across, then no pass, and round again. The 2 of
// clubs leads the first trick. Follow the suit that was led if you can; otherwise play
// anything (but no hearts or queen of spades on the very first trick, unless that's all you
// have). Hearts can't be led until a heart has been played, unless you hold nothing else.
// The highest card of the suit led takes the trick and leads the next. Every heart taken is a
// point and the queen of spades is 13; taking all of them ("shooting the moon") gives everyone
// else 26 instead. When someone reaches the target (100, or 50 for a short game) at the end of
// a hand, the lowest score wins; everyone places by score (ties share a place).
//
// A player who leaves is placed last and the game plays their cards for them, so the other
// three can finish. A player whose clock runs out passes their three highest cards, or plays
// their lowest card that's allowed.
import { frenchDeck, shuffle, rankOf, suitOf, startClock, stopClock, timeLeft, clockDone, log, nameOf } from "./common.js";

const TURN_MS = 30_000;
const PASS_MS = 45_000;
const TRICK_MS = 1300; // a finished trick stays on the table this long
const HAND_MS = 7000; // the hand's points stay on screen this long
const DIRS = ["left", "right", "across", "none"];
const high = (c) => (rankOf(c) === 1 ? 14 : rankOf(c));
const QS = "12s";
const points = (c) => (c === QS ? 13 : suitOf(c) === "h" ? 1 : 0);

export default {
  name: "Hearts",
  modes: ["ffa"],
  min: 4,
  max: 4,
  ranked: true,
  options: [
    {
      key: "target",
      label: "Play to",
      type: "select",
      def: "100",
      choices: [
        { value: "50", label: "50 points (shorter)" },
        { value: "100", label: "100 points" },
      ],
    },
  ],
  info: {
    blurb: "Four players, no teams. Dodge the hearts and the queen of spades, or take them all and shoot the moon.",
    how: "Pass three cards before each hand (left, right, across, then none). The 2 of clubs starts. Follow the suit led if you can; the highest card of that suit takes the trick. Each heart you take is 1 point and the queen of spades is 13: points are bad. Hearts can't be led until someone has played one. Take every heart and the queen and you shoot the moon: everyone else gets 26. When someone reaches the target, the lowest score wins.",
    keys: "Passing: tap three cards, then Pass. Playing: tap a card, tap it again to play it (cards you can't play are dimmed).",
  },
  create,
  action(room, g, p, a) {
    const si = g.seats.findIndex((s) => s.uid === p.uid);
    if (si < 0) return;
    if (a.k === "pass" && g.phase === "pass") pass(room, g, si, a.cards);
    if (a.k === "play" && g.phase === "play" && g.turn === si) play(room, g, si, String(a.card || ""));
  },
  view,
  tick(room, g) {
    if (g.phase === "pass") {
      for (const [i, s] of g.seats.entries()) if (!s.passed && (s.left || clockDone(room, g, s.uid, 8000))) pass(room, g, i, autoPass(s.hand));
      return;
    }
    if (g.phase !== "play") return;
    const s = g.seats[g.turn];
    if (s.left || clockDone(room, g, s.uid)) {
      if (!s.left) log(g, `${nameOf(room, s.uid)} ran out of time`);
      play(room, g, g.turn, autoPlay(g, g.turn));
    }
  },
  leave(room, g, p) {
    if (g.phase === "over") return;
    const s = g.seats.find((x) => x.uid === p.uid);
    if (!s || s.left) return;
    s.left = true;
    g.leftOrder.push(s.uid);
    log(g, `${p.name} left: the game plays their cards`);
    const here = g.seats.filter((x) => !x.left);
    if (here.length < 2) return finish(room, g, "Everyone else left");
    room.update();
  },
  summary: (room, g) => (g ? { text: `Hand ${g.hand} · to ${g.target}` } : null),
};

function create(room) {
  const g = {
    seats: room.players.slice(0, 4).map((p) => ({ uid: p.uid, hand: [], taken: [], passed: null, got: null, left: false })),
    scores: room.players.slice(0, 4).map(() => 0),
    target: Number(room.opts.target) === 50 ? 50 : 100,
    hand: 0,
    phase: "pass", // pass | play | trick | hand | over
    trick: [], // [{ seat, card }]
    leader: 0,
    turn: 0,
    broken: false,
    first: true,
    lastTrick: null,
    handRes: null,
    leftOrder: [],
    log: [],
    token: 0,
    seq: 0,
    deadline: 0,
  };
  startHand(room, g);
  return g;
}

const dir = (g) => DIRS[(g.hand - 1) % 4];
const order = (hand) => hand.sort((a, b) => "cdsh".indexOf(suitOf(a)) - "cdsh".indexOf(suitOf(b)) || high(a) - high(b));

function startHand(room, g) {
  g.hand++;
  const deck = shuffle(frenchDeck());
  for (const [i, s] of g.seats.entries()) {
    s.hand = order(deck.slice(i * 13, i * 13 + 13));
    s.taken = [];
    s.passed = null;
    s.got = null;
  }
  g.trick = [];
  g.broken = false;
  g.first = true;
  g.lastTrick = null;
  g.handRes = null;
  log(g, `Hand ${g.hand}${dir(g) === "none" ? ": no passing" : `: pass three cards ${dir(g)}`}`);
  if (dir(g) === "none") return startPlay(room, g);
  g.phase = "pass";
  startClock(g, PASS_MS);
  room.update();
}

// Who gets seat i's cards: left is the next seat, right the one before, across two away.
const passTo = (g, i) => (i + { left: 1, right: 3, across: 2 }[dir(g)]) % 4;

function pass(room, g, si, cards) {
  const s = g.seats[si];
  if (s.passed || !Array.isArray(cards)) return;
  const set = [...new Set(cards.filter((c) => typeof c === "string" && s.hand.includes(c)))];
  if (set.length !== 3) return;
  s.passed = set;
  if (g.seats.some((x) => !x.passed)) return room.update();
  // Everyone has chosen: the cards change hands together.
  for (const x of g.seats) x.hand = x.hand.filter((c) => !x.passed.includes(c));
  for (const [i, x] of g.seats.entries()) {
    const to = g.seats[passTo(g, i)];
    to.hand.push(...x.passed);
    to.got = x.passed;
    order(to.hand);
  }
  startPlay(room, g);
}

function startPlay(room, g) {
  g.phase = "play";
  g.leader = g.turn = g.seats.findIndex((s) => s.hand.includes("2c"));
  startClock(g, TURN_MS);
  room.update();
}

// The cards seat i may play now.
export function legal(g, si) {
  const hand = g.seats[si].hand;
  if (!g.trick.length) {
    if (g.first) return hand.includes("2c") ? ["2c"] : hand;
    const nonHearts = hand.filter((c) => suitOf(c) !== "h");
    return g.broken || !nonHearts.length ? hand : nonHearts;
  }
  const led = suitOf(g.trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  if (follow.length) return follow;
  if (g.first) {
    const clean = hand.filter((c) => !points(c));
    if (clean.length) return clean;
  }
  return hand;
}

function play(room, g, si, card) {
  if (!legal(g, si).includes(card)) return false;
  const s = g.seats[si];
  s.hand.splice(s.hand.indexOf(card), 1);
  g.trick.push({ seat: si, card });
  if (suitOf(card) === "h" && !g.broken) {
    g.broken = true;
    log(g, `Hearts are broken (${nameOf(room, s.uid)})`);
  }
  g.seq++;
  if (g.trick.length < 4) {
    g.turn = (si + 1) % 4;
    startClock(g, TURN_MS);
    return room.update(), true;
  }
  // The trick is complete: the highest card of the suit led takes it.
  const led = suitOf(g.trick[0].card);
  const win = g.trick.filter((t) => suitOf(t.card) === led).sort((a, b) => high(b.card) - high(a.card))[0];
  const w = g.seats[win.seat];
  w.taken.push(...g.trick.map((t) => t.card));
  const pts = g.trick.reduce((n, t) => n + points(t.card), 0);
  g.lastTrick = { cards: g.trick.slice(), winner: w.uid, pts };
  if (pts) log(g, `${nameOf(room, w.uid)} took ${pts} point${pts > 1 ? "s" : ""}${g.trick.some((t) => t.card === QS) ? " (the queen of spades!)" : ""}`);
  g.first = false;
  g.phase = "trick";
  g.turn = -1;
  stopClock(g);
  room.update();
  const t = ++g.token;
  room.timer(TRICK_MS, () => {
    if (g.token !== t) return;
    g.trick = [];
    if (!w.hand.length) return endHand(room, g);
    g.phase = "play";
    g.leader = g.turn = win.seat;
    startClock(g, TURN_MS);
    room.update();
  });
  return true;
}

function endHand(room, g) {
  const pts = g.seats.map((s) => s.taken.reduce((n, c) => n + points(c), 0));
  const moon = pts.findIndex((p) => p === 26);
  const add = moon >= 0 ? pts.map((_, i) => (i === moon ? 0 : 26)) : pts;
  add.forEach((n, i) => (g.scores[i] += n));
  g.handRes = { pts, add, moon: moon >= 0 ? g.seats[moon].uid : null, scores: g.scores.slice() };
  if (moon >= 0) log(g, `${nameOf(room, g.seats[moon].uid)} shot the moon! Everyone else gets 26`);
  g.phase = "hand";
  g.handEnds = Date.now() + HAND_MS;
  room.update();
  const t = ++g.token;
  room.timer(HAND_MS, () => {
    if (g.token !== t) return;
    if (Math.max(...g.scores) >= g.target) return finish(room, g, `${nameOf(room, g.seats[g.scores.indexOf(Math.min(...g.scores))].uid)} had the fewest points`);
    startHand(room, g);
  });
}

function finish(room, g, reason) {
  if (g.phase === "over") return;
  g.phase = "over";
  g.token++;
  stopClock(g);
  const here = g.seats.map((s, i) => ({ uid: s.uid, score: g.scores[i] })).filter((x) => !g.seats.find((s) => s.uid === x.uid).left);
  here.sort((a, b) => a.score - b.score);
  const sides = [];
  here.forEach((x, i) => {
    if (i > 0 && x.score === here[i - 1].score) sides[sides.length - 1].uids.push(x.uid);
    else sides.push({ uids: [x.uid], place: sides.length + 1 });
  });
  for (const uid of g.leftOrder.slice().reverse()) sides.push({ uids: [uid], place: sides.length + 1 });
  room.update();
  room.end({ sides, reason });
}

// Out of time: pass the queen of spades and the highest spades/hearts first, then high cards.
function autoPass(hand) {
  const danger = (c) => (c === QS ? 100 : suitOf(c) === "s" && high(c) > 12 ? 60 + high(c) : suitOf(c) === "h" ? 30 + high(c) : high(c));
  return hand.slice().sort((a, b) => danger(b) - danger(a)).slice(0, 3);
}
// ... or play: follow low; with nothing to follow, dump the worst card.
function autoPlay(g, si) {
  const ok = legal(g, si);
  const following = g.trick.length && suitOf(ok[0]) === suitOf(g.trick[0].card);
  if (!g.trick.length || following) return ok.slice().sort((a, b) => high(a) - high(b))[0];
  return ok.slice().sort((a, b) => points(b) - points(a) || high(b) - high(a))[0];
}

function view(room, g, uid) {
  const si = g.seats.findIndex((s) => s.uid === uid);
  const me = g.seats[si];
  return {
    v: "hearts",
    seats: g.seats.map((s, i) => ({ uid: s.uid, n: s.hand.length, passed: !!s.passed, left: s.left, taken: s.taken.reduce((n, c) => n + points(c), 0), score: g.scores[i] })),
    hand: me ? me.hand : null,
    passing: g.phase === "pass" && me && dir(g) !== "none" ? { dir: dir(g), done: me.passed, to: g.seats[passTo(g, si)].uid } : null,
    got: me && g.phase !== "pass" && g.first && !g.trick.length ? me.got : null, // the cards passed to you, shown until the first lead
    trick: g.trick.map((t) => ({ uid: g.seats[t.seat].uid, card: t.card })),
    lastTrick: g.phase === "trick" ? g.lastTrick : null,
    turn: g.phase === "play" ? g.seats[g.turn].uid : null,
    legal: me && g.phase === "play" && g.turn === si ? legal(g, si) : null,
    broken: g.broken,
    handNo: g.hand,
    dir: dir(g),
    phase: g.phase,
    target: g.target,
    left: timeLeft(g),
    clock: g.phase === "pass" ? PASS_MS : TURN_MS,
    handRes: g.phase === "hand" || g.phase === "over" ? g.handRes : null,
    handLeft: g.phase === "hand" ? Math.max(0, g.handEnds - Date.now()) : 0,
    seq: g.seq,
    log: g.log.slice(-6),
  };
}
