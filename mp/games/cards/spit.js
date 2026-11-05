// Spit (also called Speed), two players, in real time: nobody takes turns.
//
// Each player gets half the deck. In a round, your cards are laid out as five stock piles of
// 1, 2, 3, 4 and 5 cards (only each pile's top card is face up, and the next one turns over by
// itself when you play the top), and the rest is your spit pile. To start, both players spit:
// the top spit card goes face up onto their own center pile. Then both play as fast as they
// can: a face-up stock card goes onto either center pile if it's one rank above or below that
// pile's top card (suits don't matter, ace connects to both 2 and king). A card can also go
// into an empty stock space, which turns the card under it face up.
//
// When neither player can play, after a moment everyone who still has spit cards spits again.
// The round ends when someone has played every stock card. If they have no spit cards left
// either, they've got rid of everything and win the game. Otherwise they take the smaller center
// pile, the other player takes the bigger one, and everyone's cards (piles, leftover stock and
// spit cards) are shuffled and laid out again for the next round.
//
// Simplifications (said on the game page): the round's winner takes the smaller pile by
// themselves (no slapping race); if both players are stuck and nobody has spit cards left,
// the round ends and whoever holds fewer cards takes the smaller pile; after 12 rounds or 15
// minutes, fewer cards wins.
import { frenchDeck, shuffle, rankOf, nameOf } from "./common.js";

const COUNT_MS = 2400; // "3, 2, 1, spit!" at the start of a round
const STUCK_MS = 1800; // nobody can play: spit after this long
const REVEAL_MS = 4000; // nobody can play or spit: an empty space is filled for you after this long
const IDLE_MS = 12_000; // nothing happened for this long: the game helps (one move each)
const BETWEEN_MS = 3800;
const MAX_ROUNDS = 12;
const MAX_MS = 15 * 60_000;

export default {
  name: "Spit",
  modes: ["1v1"],
  min: 2,
  max: 2,
  ranked: true,
  info: {
    blurb: "Speed! No turns: both players slap cards onto the middle as fast as they can. Get rid of all your cards first.",
    how: "You have five stock piles (top card face up) and a face-down spit pile. Play a face-up stock card onto either middle pile if it's one higher or lower (suits don't matter, ace goes on 2 or king). Both players play at the same time, so be quick. Tap a card to play it (if it fits both piles, tap the pile you want). Put a card into an empty space to turn over the card under it. When nobody can play, both spit a new card onto the middle by themselves. Empty your stock piles to win the round: you take the smaller middle pile and your opponent the bigger one, then everything is dealt out again. Run out of stock and spit cards and you win. (Simplified: no slapping race for the smaller pile, and after 12 rounds or 15 minutes fewer cards wins.)",
    keys: "Tap a card to play it · tap it, then a pile, to choose · tap a card, then an empty space, to move it.",
  },
  create,
  action,
  view,
  tick,
  leave(room, g, p) {
    if (g.phase === "over") return;
    const other = g.p.find((x) => x.uid !== p.uid);
    over(room, g, other ? [other.uid] : [], `${p.name} left`);
  },
  summary: (room, g) => (g ? { text: `Round ${g.round}` } : null),
};

const fits = (card, top) => {
  if (!top) return true; // anything goes onto an empty middle pile
  const d = Math.abs(rankOf(card) - rankOf(top));
  return d === 1 || d === 12;
};
const tops = (g) => g.center.map((c) => c[c.length - 1] || null);
const hasPlay = (pl, g) => pl.stock.some((pile) => pile.length && tops(g).some((t) => fits(pile[pile.length - 1], t)));
const canReveal = (pl) => pl.stock.some((p) => !p.length) && pl.stock.some((p) => p.length >= 2);
const count = (pl) => pl.stock.reduce((n, p) => n + p.length, 0) + pl.spit.length;

// A player's cards laid out for a round: piles of 1-5 (as far as the cards go), then spit.
function layout(pl, cards) {
  shuffle(cards);
  pl.stock = [[], [], [], [], []];
  for (let i = 0; i < 5; i++) for (let k = 0; k <= i && cards.length; k++) pl.stock[i].push(cards.pop());
  pl.spit = cards;
}

function create(room) {
  const deck = shuffle(frenchDeck());
  const g = {
    p: room.players.slice(0, 2).map((pl) => ({ uid: pl.uid, stock: [], spit: [] })),
    center: [[], []],
    round: 0,
    phase: "deal", // deal | play | between | over
    goAt: 0,
    stuckAt: 0,
    moveAt: Date.now(),
    last: null,
    seq: 0,
    spits: 0,
    between: null,
    startedAt: Date.now(),
    token: 0,
  };
  layout(g.p[0], deck.slice(0, 26));
  layout(g.p[1], deck.slice(26));
  startRound(room, g);
  return g;
}

function startRound(room, g) {
  g.round++;
  g.center = [[], []];
  g.phase = "deal";
  g.between = null;
  g.goAt = Date.now() + COUNT_MS;
  room.update();
  const t = ++g.token;
  room.timer(COUNT_MS, () => {
    if (g.token !== t) return;
    g.phase = "play";
    spit(room, g);
  });
}

// Everyone with spit cards turns one over onto their own middle pile.
function spit(room, g) {
  let n = 0;
  g.p.forEach((pl, i) => {
    if (pl.spit.length) {
      g.center[i].push(pl.spit.pop());
      n++;
    }
  });
  if (n) g.spits++;
  g.stuckAt = 0;
  g.moveAt = Date.now();
  room.update();
  return n;
}

function action(room, g, p, a) {
  if (g.phase !== "play") return;
  const me = g.p.findIndex((x) => x.uid === p.uid);
  if (me < 0) return;
  const pl = g.p[me];
  const from = a.from;
  if (!Number.isInteger(from) || from < 0 || from > 4 || !pl.stock[from].length) return;
  const pile = pl.stock[from];
  if (a.k === "play") {
    const to = a.to;
    if (to !== 0 && to !== 1) return;
    const card = pile[pile.length - 1];
    // Too slow (the other player got there first) or simply not a fit: say so, change nothing.
    if (!fits(card, tops(g)[to])) return room.sendTo(p.uid, { t: "cards:nope", from });
    g.center[to].push(pile.pop());
    g.last = { who: p.uid, card, to, from, seq: ++g.seq };
    moved(g);
    if (pl.stock.every((x) => !x.length)) return endRound(room, g, me, "empty");
    room.update();
  } else if (a.k === "move") {
    const to = a.to;
    if (!Number.isInteger(to) || to < 0 || to > 4 || pl.stock[to].length || pile.length < 2) return;
    pl.stock[to].push(pile.pop());
    moved(g);
    room.update();
  }
}
function moved(g) {
  g.moveAt = Date.now();
  g.stuckAt = 0;
}

function tick(room, g) {
  if (g.phase !== "play") return;
  const now = Date.now();
  if (now - g.startedAt > MAX_MS) return timeUp(room, g);
  const anyPlay = g.p.some((pl) => hasPlay(pl, g));
  if (anyPlay) {
    g.stuckAt = 0;
    // Somebody could play but nothing has happened for a long time (a player who walked away):
    // the game makes one move for each player who can, so the round can't stall.
    if (now - g.moveAt > IDLE_MS) helpOut(room, g);
    return;
  }
  if (!g.stuckAt) {
    g.stuckAt = now;
    return room.update();
  }
  const waited = now - g.stuckAt;
  if (g.p.some((pl) => pl.spit.length)) {
    if (waited >= STUCK_MS) spit(room, g);
    return;
  }
  if (g.p.some(canReveal)) {
    if (waited >= REVEAL_MS) {
      for (const pl of g.p) if (canReveal(pl)) reveal(pl);
      g.stuckAt = now;
      g.moveAt = now;
      room.update();
    }
    return;
  }
  // Nobody can play, spit or turn a card over: the round ends, fewer cards takes the small pile.
  if (waited >= STUCK_MS) {
    const [c0, c1] = g.p.map(count);
    const w = c0 < c1 ? 0 : c1 < c0 ? 1 : Math.max(0, g.p.findIndex((x) => x.uid === g.last?.who));
    endRound(room, g, w, "blocked");
  }
}

// Fills an empty space from the tallest pile (turning a card over).
function reveal(pl) {
  const to = pl.stock.findIndex((p) => !p.length);
  let from = -1;
  pl.stock.forEach((p, i) => p.length >= 2 && (from < 0 || p.length > pl.stock[from].length) && (from = i));
  if (to >= 0 && from >= 0) pl.stock[to].push(pl.stock[from].pop());
}

function helpOut(room, g) {
  for (const [i, pl] of g.p.entries()) {
    const t = tops(g);
    const from = pl.stock.findIndex((p) => p.length && t.some((x) => fits(p[p.length - 1], x)));
    if (from < 0) continue;
    const card = pl.stock[from][pl.stock[from].length - 1];
    const to = fits(card, t[0]) ? 0 : 1;
    g.center[to].push(pl.stock[from].pop());
    g.last = { who: pl.uid, card, to, from, seq: ++g.seq, auto: true };
    if (pl.stock.every((x) => !x.length)) return endRound(room, g, i, "empty");
  }
  moved(g);
  room.update();
}

function endRound(room, g, w, how) {
  const win = g.p[w];
  const lose = g.p[1 - w];
  if (how === "empty" && !win.spit.length) return over(room, g, [win.uid], `${nameOf(room, win.uid)} got rid of every card`);
  const small = g.center[0].length <= g.center[1].length ? 0 : 1;
  const winCards = [...win.stock.flat(), ...win.spit, ...g.center[small]];
  const loseCards = [...lose.stock.flat(), ...lose.spit, ...g.center[1 - small]];
  g.between = { winner: win.uid, how, took: g.center[small].length, gave: g.center[1 - small].length, counts: { [win.uid]: winCards.length, [lose.uid]: loseCards.length } };
  g.phase = "between";
  g.center = [[], []];
  win.stock = [[], [], [], [], []];
  lose.stock = [[], [], [], [], []];
  win.spit = winCards;
  lose.spit = loseCards;
  room.update();
  const t = ++g.token;
  room.timer(BETWEEN_MS, () => {
    if (g.token !== t) return;
    if (g.round >= MAX_ROUNDS || Date.now() - g.startedAt > MAX_MS) return timeUp(room, g);
    layout(win, win.spit);
    layout(lose, lose.spit);
    startRound(room, g);
  });
}

function timeUp(room, g) {
  const [c0, c1] = g.p.map(count);
  if (c0 === c1) return over(room, g, null, `Time's up: ${c0} cards each`);
  const w = c0 < c1 ? 0 : 1;
  over(room, g, [g.p[w].uid], `Time's up: ${nameOf(room, g.p[w].uid)} had fewer cards (${Math.min(c0, c1)} vs ${Math.max(c0, c1)})`);
}

function over(room, g, winners, reason) {
  g.phase = "over";
  g.token++;
  room.update();
  room.end(winners ? { winners, reason } : { draw: true, reason });
}

function view(room, g, uid) {
  const t = tops(g);
  return {
    v: "spit",
    me: g.p.findIndex((x) => x.uid === uid),
    round: g.round,
    maxRounds: MAX_ROUNDS,
    phase: g.phase,
    go: g.phase === "deal" ? Math.max(0, g.goAt - Date.now()) : 0,
    players: g.p.map((pl) => ({
      uid: pl.uid,
      stock: pl.stock.map((p) => ({ top: p[p.length - 1] || null, down: Math.max(0, p.length - 1) })),
      spit: pl.spit.length,
      total: count(pl),
      canPlay: g.phase === "play" && hasPlay(pl, g),
    })),
    center: g.center.map((c, i) => ({ top: t[i], under: c[c.length - 2] || null, n: c.length })),
    stuck: g.stuckAt ? Date.now() - g.stuckAt : 0,
    stuckMs: g.p.some((pl) => pl.spit.length) ? STUCK_MS : g.p.some(canReveal) ? REVEAL_MS : STUCK_MS,
    canSpit: g.p.some((pl) => pl.spit.length),
    last: g.last,
    spits: g.spits,
    between: g.between,
    timeLeft: Math.max(0, MAX_MS - (Date.now() - g.startedAt)),
  };
}
