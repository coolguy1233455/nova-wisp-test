// Chess: two members, white and black picked at random (a rematch swaps them). Every move is
// checked here with chess.js (mp/lib/chess.js, BSD-2-Clause), so a changed page can't make an
// illegal move. The clocks are kept here too: the side to move loses time until it moves,
// then gets the increment. A flag fall loses, unless the other side couldn't possibly
// checkmate (then it's a draw). Checkmate wins; stalemate, threefold repetition, the
// fifty-move rule, insufficient material and an agreed draw are draws; resigning or leaving
// loses.
//
// Like on the big chess sites, the clocks only start once both sides have moved: until then
// each side has FIRST_MOVE_MS to make its first move, or the game is called off without
// moving anyone's rating (an "abort": the result has a single side, so no Elo changes).
import { Chess } from "../lib/chess.js";

const FIRST_MOVE_MS = 30_000;
const CLOCKS = [
  { value: "3+2", label: "3+2 · Blitz" },
  { value: "5+0", label: "5+0 · Blitz" },
  { value: "10+0", label: "10+0 · Rapid" },
  { value: "15+10", label: "15+10 · Rapid" },
  { value: "30+0", label: "30+0 · Classical" },
  { value: "none", label: "No clock" },
];
const SQUARE = /^[a-h][1-8]$/;
const NAMES = { w: "White", b: "Black" };
const other = (c) => (c === "w" ? "b" : "w");

// Who had white last time in a party, so a rematch swaps colors.
const lastWhite = new WeakMap();

// "3+2" -> { base: 180000, inc: 2000 }; "none" -> null.
function parseClock(v) {
  const m = /^(\d+)\+(\d+)$/.exec(String(v));
  return m ? { base: +m[1] * 60_000, inc: +m[2] * 1000 } : null;
}

export default {
  id: "chess",
  name: "Chess",
  ranked: true,
  modes: ["1v1"],
  min: 2,
  max: 2,
  graceMs: 60_000, // a dropped connection has a minute to come back (their clock keeps running)
  options: [{ key: "clock", label: "Time control", type: "select", choices: CLOCKS, def: "10+0" }],
  info: {
    blurb: "Classic chess against another member, on the clock. Ranked games move your rating.",
    how: "Drag a piece, or tap it and then tap where it goes; dots show where it can move. Colors are picked at random. Only the clock of the side to move runs, and each move adds the increment (3+2 means 3 minutes each plus 2 seconds a move). Checkmate wins. Running out of time loses, unless your opponent has too little left to ever checkmate, which is a draw. Stalemate, the same position three times, fifty moves without a capture or pawn move, too few pieces to mate, or an agreed draw end in a draw. Each side has 30 seconds to make its first move, or the game is called off with no rating change.",
    keys: "Drag or tap to move · Offer draw and Resign are under the moves",
  },

  create(room) {
    const [a, b] = room.players;
    const before = lastWhite.get(room);
    let white = Math.random() < 0.5 ? a : b;
    if (before === a.uid) white = b;
    else if (before === b.uid) white = a;
    lastWhite.set(room, white.uid);
    const tc = parseClock(room.opts.clock);
    return {
      chess: new Chess(),
      white: white.uid,
      black: (white === a ? b : a).uid,
      tc,
      clock: tc ? { w: tc.base, b: tc.base } : null,
      turnAt: 0, // when the side to move's clock started (0: clocks not running yet)
      firstAt: Date.now(), // when the wait for a first move began
      sans: [], // the moves so far, in SAN ("e4", "Nf3", "O-O", "exd8=Q#")
      last: null, // { from, to } of the last move
      captured: { w: [], b: [] }, // piece letters each side has taken
      offer: null, // "w" | "b": that side offers a draw
      offerPly: { w: -99, b: -99 }, // when each side last offered (one offer per full move)
      over: null, // { winner: "w" | "b" | null, reason }
    };
  },

  action(room, g, p, a) {
    if (g.over) return;
    const me = colorOf(g, p.uid);
    if (!me) return;
    const ply = g.sans.length;

    if (a.t === "move") {
      if (g.chess.turn() !== me) return reject(room, p, "It's not your move");
      const from = String(a.from || "");
      const to = String(a.to || "");
      if (!SQUARE.test(from) || !SQUARE.test(to)) return reject(room, p, "That move isn't allowed");
      const promotion = ["q", "r", "b", "n"].includes(a.promotion) ? a.promotion : "q";
      const now = Date.now();
      // Time first: a move that arrives after the flag fell doesn't count.
      const running = !!(g.tc && g.turnAt);
      if (running) {
        g.clock[me] -= now - g.turnAt;
        g.turnAt = now;
        if (g.clock[me] <= 0) return flag(room, g, me);
      }
      let m;
      try {
        m = g.chess.move({ from, to, promotion });
      } catch {
        return reject(room, p, "That move isn't allowed");
      }
      if (running) g.clock[me] += g.tc.inc;
      g.sans.push(m.san);
      g.last = { from: m.from, to: m.to };
      if (m.captured) g.captured[me].push(m.captured);
      if (g.offer === other(me)) g.offer = null; // moving instead of answering declines it
      if (g.sans.length < 2) g.firstAt = now; // now the other side's first move
      else if (g.tc) g.turnAt = now; // both have moved: the clocks run
      if (!checkEnd(room, g, me)) room.update();
      return;
    }

    if (a.t === "resign") return finish(room, g, other(me), `${p.name} resigned`);

    if (a.t === "draw" || a.t === "accept") {
      if (g.offer === other(me)) return finish(room, g, null, "Draw agreed");
      if (a.t === "accept" || g.offer === me) return;
      if (ply - g.offerPly[me] < 2) return reject(room, p, "You can offer a draw once a move");
      g.offer = me;
      g.offerPly[me] = ply;
      room.update();
      return;
    }

    if (a.t === "decline" && g.offer === other(me)) {
      g.offer = null;
      room.toast(`${p.name} declined the draw`, uidOf(g, other(me)));
      room.update();
    }
  },

  view(room, g, uid) {
    const now = Date.now();
    const turn = g.chess.turn();
    const you = colorOf(g, uid);
    const ply = g.sans.length;
    return {
      fen: g.chess.fen(),
      turn,
      white: g.white,
      black: g.black,
      you,
      moves: g.sans,
      last: g.last,
      check: g.chess.inCheck() ? g.chess.findPiece({ type: "k", color: turn })[0] || null : null, // the king's square
      // Clock times as of this message; the page counts the running one down itself.
      clock: g.tc ? { w: timeLeft(g, "w", now), b: timeLeft(g, "b", now) } : null,
      running: g.tc && g.turnAt && !g.over ? turn : null,
      tc: room.opts.clock,
      first: !g.over && ply < 2 ? { side: turn, left: Math.max(0, FIRST_MOVE_MS - (now - g.firstAt)) } : null,
      offer: g.offer,
      canOffer: !!you && !g.over && g.offer !== you && ply - g.offerPly[you] >= 2,
      captured: g.captured,
      over: g.over,
    };
  },

  // Flag falls and first moves that never came.
  tick(room, g) {
    if (g.over) return;
    const now = Date.now();
    const turn = g.chess.turn();
    if (g.sans.length < 2) {
      if (now - g.firstAt >= FIRST_MOVE_MS) {
        const slow = room.player(uidOf(g, turn))?.name || NAMES[turn];
        g.over = { winner: null, reason: `${slow} didn't make a first move`, aborted: true };
        // One side holding both players: nobody wins or loses, so ratings don't move.
        room.end({ aborted: true, reason: `${slow} didn't make a first move (no rating change)` });
      }
      return;
    }
    if (g.tc && g.turnAt && timeLeft(g, turn, now) <= 0) flag(room, g, turn);
  },

  leave(room, g, p) {
    if (g.over) return;
    const me = colorOf(g, p.uid);
    if (me) finish(room, g, other(me), `${p.name} left the game`);
  },

  summary(room, g) {
    const tc = CLOCKS.find((c) => c.value === room.opts.clock)?.value || "";
    const label = tc === "none" ? "No clock" : tc;
    if (!g || room.state !== "playing") return { text: label };
    return { text: `${label} · move ${Math.max(1, Math.ceil(g.sans.length / 2))}` };
  },
};

const colorOf = (g, uid) => (uid && uid === g.white ? "w" : uid && uid === g.black ? "b" : null);
const uidOf = (g, c) => (c === "w" ? g.white : g.black);
const timeLeft = (g, c, now) => Math.max(0, g.clock[c] - (g.turnAt && !g.over && g.chess.turn() === c ? now - g.turnAt : 0));

function reject(room, p, msg) {
  // The page snaps the piece back and says why.
  room.sendTo(p.uid, { t: "chess:reject", msg });
}

// After `mover` moved: is the game over by the rules?
function checkEnd(room, g, mover) {
  const c = g.chess;
  if (c.isCheckmate()) return finish(room, g, mover, "Checkmate"), true;
  if (c.isStalemate()) return finish(room, g, null, "Stalemate"), true;
  if (c.isInsufficientMaterial()) return finish(room, g, null, "Insufficient material"), true;
  if (c.isThreefoldRepetition()) return finish(room, g, null, "Threefold repetition"), true;
  if (c.isDrawByFiftyMoves()) return finish(room, g, null, "Fifty-move rule"), true;
  return false;
}

// `loser` ran out of time. A loss, unless the other side has too little left to ever mate.
function flag(room, g, loser) {
  g.clock[loser] = 0;
  const name = room.player(uidOf(g, loser))?.name || NAMES[loser];
  const winner = other(loser);
  if (!canMate(g.chess, winner)) return finish(room, g, null, `${name} ran out of time, but ${room.player(uidOf(g, winner))?.name || NAMES[winner]} can't checkmate`);
  finish(room, g, winner, `${name} ran out of time`);
}

// Could `color` checkmate with what it has left, by any series of moves (the other side
// helping)? The usual chess-site rule: a lone king can't; a lone knight can't against only a
// king and queens; bishops all on one square color can't unless the other side has a knight,
// a pawn or a bishop on the other color (something to block its own king with).
function canMate(chess, color) {
  const mine = [];
  const theirs = [];
  chess.board().forEach((row, r) =>
    row.forEach((sq, f) => {
      if (!sq || sq.type === "k") return;
      (sq.color === color ? mine : theirs).push({ type: sq.type, dark: (r + f) % 2 === 1 });
    }),
  );
  if (!mine.length) return false;
  if (mine.every((x) => x.type === "n")) return mine.length > 1 || theirs.some((x) => x.type !== "q");
  if (mine.every((x) => x.type === "b")) {
    const dark = mine[0].dark;
    if (mine.some((x) => x.dark !== dark)) return true;
    return theirs.some((x) => x.type === "n" || x.type === "p" || (x.type === "b" && x.dark !== dark));
  }
  return true;
}

// The game is over: freeze the clocks, show it on the board and tell the core (Elo).
function finish(room, g, winner, reason) {
  if (g.over) return;
  const now = Date.now();
  if (g.tc && g.turnAt) {
    const turn = g.chess.turn();
    g.clock[turn] = Math.max(0, g.clock[turn] - (now - g.turnAt));
    g.turnAt = 0;
  }
  g.offer = null;
  g.over = { winner, reason };
  if (winner) room.end({ winners: [uidOf(g, winner)], reason: `${reason} · ${NAMES[winner]} wins` });
  else room.end({ draw: true, reason });
}
