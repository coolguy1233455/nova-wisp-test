// Go Fish, 2-5 players. Seven cards each (five with four or more players); the rest is the
// pond. On your turn, ask another player for a rank you hold at least one of. If they have
// any, they hand over all of them and you ask again. If not: "Go fish!" You draw from the
// pond; if it's the rank you asked for, you show it and ask again, otherwise the turn passes.
// Four of a rank make a book, laid down at once. Run out of cards and you draw one from the
// pond at the start of your turn (with the pond empty you sit out). When all 13 books are
// down, most books wins (ties share a place). A player whose clock runs out asks for a random
// rank from a random player.
import { frenchDeck, shuffle, pick, rankOf, startClock, stopClock, timeLeft, clockDone, log, nameOf, rankName } from "./common.js";

const TURN_MS = 30_000;

export default {
  name: "Go Fish",
  modes: ["ffa"],
  min: 2,
  max: 5,
  ranked: true,
  info: {
    blurb: "Ask for cards, collect books of four. Most books wins.",
    how: "On your turn, pick a rank you hold and a player to ask. If they have any of that rank, you get them all and go again. If not, go fish: draw from the pond, and if it's what you asked for, go again. Four of a kind make a book. When every book is made, whoever has the most wins. 30 seconds a turn.",
    keys: "Tap a card in your hand (that's the rank you'll ask for), then tap the player to ask.",
  },
  create,
  action(room, g, p, a) {
    if (g.phase !== "play" || a.k !== "ask") return;
    const si = g.turn;
    if (g.seats[si].uid !== p.uid) return;
    ask(room, g, si, g.seats.findIndex((s) => s.uid === a.target), Number(a.rank));
  },
  view,
  tick(room, g) {
    if (g.phase !== "play") return;
    const si = g.turn;
    const seat = g.seats[si];
    if (!clockDone(room, g, seat.uid)) return;
    log(g, `${nameOf(room, seat.uid)} ran out of time`);
    const targets = g.seats.filter((s, i) => i !== si && !s.left && s.hand.length);
    if (!targets.length || !seat.hand.length) return beginTurn(room, g, (si + 1) % g.seats.length);
    ask(room, g, si, g.seats.indexOf(pick(targets)), rankOf(pick(seat.hand)));
  },
  leave(room, g, p) {
    if (g.phase === "over") return;
    const si = g.seats.findIndex((s) => s.uid === p.uid);
    const seat = g.seats[si];
    if (!seat || seat.left) return;
    seat.left = true;
    g.leftOrder.push(seat.uid);
    g.pond.push(...seat.hand.splice(0));
    shuffle(g.pond);
    log(g, `${p.name} left (their cards went back into the pond)`);
    if (g.seats.filter((s) => !s.left).length < 2) return finish(room, g, "Everyone else left");
    if (g.turn === si) beginTurn(room, g, (si + 1) % g.seats.length);
    else room.update();
  },
  summary: (room, g) => (g ? { text: `${g.seats.reduce((n, s) => n + s.books.length, 0)}/13 books` } : null),
};

function create(room) {
  const deck = shuffle(frenchDeck());
  const seats = room.players.map((p) => ({ uid: p.uid, hand: [], books: [], left: false }));
  const size = seats.length <= 3 ? 7 : 5;
  for (let k = 0; k < size; k++) for (const s of seats) s.hand.push(deck.pop());
  const g = { seats, pond: deck, turn: 0, phase: "play", last: null, seq: 0, leftOrder: [], log: [], deadline: 0, drew: {} };
  for (const s of seats) books(room, g, s);
  beginTurn(room, g, seats.indexOf(pick(seats)), true);
  return g;
}

// Lays down any four of a kind in a player's hand.
function books(room, g, seat) {
  const count = {};
  for (const c of seat.hand) count[rankOf(c)] = (count[rankOf(c)] || 0) + 1;
  for (const [r, n] of Object.entries(count))
    if (n === 4) {
      seat.hand = seat.hand.filter((c) => rankOf(c) !== +r);
      seat.books.push(+r);
      log(g, `${nameOf(room, seat.uid)} made a book of ${rankName(+r, true)}`);
    }
}
const allBooks = (g) => g.seats.reduce((n, s) => n + s.books.length, 0) >= 13;

// Turn to seat i (or the next one who can play): draws for an empty hand, skips who can't play.
function beginTurn(room, g, i, quiet = false) {
  const n = g.seats.length;
  for (let k = 0; k <= n; k++, i = (i + 1) % n) {
    if (allBooks(g)) return finish(room, g, "All 13 books are down");
    const s = g.seats[i];
    if (s.left) continue;
    if (!s.hand.length && g.pond.length) {
      const c = g.pond.pop();
      s.hand.push(c);
      g.drew[s.uid] = c;
      log(g, `${nameOf(room, s.uid)} had no cards and drew one`);
      books(room, g, s);
    }
    if (!s.hand.length) continue;
    // Nobody else holds a card: fish for one, or (nothing left anywhere) it's over.
    const someone = g.seats.some((o, j) => j !== i && !o.left && o.hand.length);
    if (!someone) {
      if (!g.pond.length) return finish(room, g, "No cards left to ask for");
      const c = g.pond.pop();
      s.hand.push(c);
      g.drew[s.uid] = c;
      log(g, `${nameOf(room, s.uid)} had nobody to ask and drew a card`);
      books(room, g, s);
      continue;
    }
    g.turn = i;
    startClock(g, TURN_MS);
    if (!quiet) room.update();
    return;
  }
  finish(room, g, "Nobody can play");
}

function ask(room, g, si, ti, rank) {
  const me = g.seats[si];
  const them = g.seats[ti];
  if (!them || ti === si || them.left || !them.hand.length) return false;
  if (!(rank >= 1 && rank <= 13) || !me.hand.some((c) => rankOf(c) === rank)) return false;
  const got = them.hand.filter((c) => rankOf(c) === rank);
  const meName = nameOf(room, me.uid);
  const themName = nameOf(room, them.uid);
  delete g.drew[me.uid];
  if (got.length) {
    them.hand = them.hand.filter((c) => rankOf(c) !== rank);
    me.hand.push(...got);
    g.last = { asker: me.uid, target: them.uid, rank, got: got.length, seq: ++g.seq };
    log(g, `${meName} asked ${themName} for ${rankName(rank, true)} and got ${got.length}`);
    books(room, g, me);
    return beginTurn(room, g, si); // ask again
  }
  let drew = null;
  if (g.pond.length) {
    drew = g.pond.pop();
    me.hand.push(drew);
    g.drew[me.uid] = drew;
  }
  const lucky = !!drew && rankOf(drew) === rank;
  g.last = { asker: me.uid, target: them.uid, rank, got: 0, fished: !!drew, lucky, shown: lucky ? drew : null, seq: ++g.seq };
  log(g, `${meName} asked ${themName} for ${rankName(rank, true)}: go fish!${lucky ? ` ${meName} fished one up and goes again` : ""}`);
  books(room, g, me);
  beginTurn(room, g, lucky ? si : (si + 1) % g.seats.length);
  return true;
}

function finish(room, g, reason) {
  if (g.phase === "over") return;
  g.phase = "over";
  stopClock(g);
  const ranked = g.seats.filter((s) => !s.left).sort((a, b) => b.books.length - a.books.length);
  const sides = [];
  ranked.forEach((s, i) => {
    if (i > 0 && s.books.length === ranked[i - 1].books.length) sides[sides.length - 1].uids.push(s.uid);
    else sides.push({ uids: [s.uid], place: sides.length + 1 });
  });
  for (const uid of g.leftOrder.slice().reverse()) sides.push({ uids: [uid], place: sides.length + 1 });
  room.update();
  const best = ranked[0];
  room.end({ sides, reason: best ? `${reason} · most books: ${best.books.length}` : reason });
}

function view(room, g, uid) {
  const mine = g.seats.find((s) => s.uid === uid);
  return {
    v: "go-fish",
    seats: g.seats.map((s) => ({ uid: s.uid, n: s.hand.length, books: s.books, left: s.left })),
    hand: mine ? mine.hand : null,
    drew: mine && mine.hand.includes(g.drew[uid]) ? g.drew[uid] : null, // the card you just fished (only you see it)
    pond: g.pond.length,
    turn: g.phase === "play" ? g.seats[g.turn].uid : null,
    phase: g.phase,
    left: timeLeft(g),
    clock: TURN_MS,
    last: g.last,
    log: g.log.slice(-6),
  };
}
