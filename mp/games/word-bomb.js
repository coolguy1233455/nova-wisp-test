// Word Bomb: a word chain with a ticking bomb. 2 to 5 players sit in a circle and the bomb
// goes round. On your turn you type an English word (3+ letters, in the dictionary) that
// starts with the last letter of the word before it, and that nobody has said yet this game.
// Get one in and the bomb passes on; run out of fuse and it blows up in your hands: you lose
// a life and the next player starts fresh from a random letter. Out of lives, you're out.
// The last player still holding lives wins.
//
// The first word of the game also starts from a random letter (picked from the common ones,
// so nobody opens on Q or X). Fuses start at 12 seconds and get a little shorter with every
// word said, down to 7. Wrong words cost nothing: they just shake, and you try again.
//
// Everyone sees the current player typing live: the client sends what's in the box (a few
// times a second) and the server passes it on as a small "wb:type" message rather than a
// whole new view.
import { isWord, loadWords, plainWord } from "./words/dict.js";

const LIVES = 3;
const FIRST_FUSE = 12000; // ms
const MIN_FUSE = 7000;
const FUSE_STEP = 125; // shorter by this for every word said
const READY_MS = 3000; // "get ready" before the first turn
const BOOM_MS = 2400; // the explosion, before the next turn starts
const START_LETTERS = "abcdefghilmnoprstw"; // fresh starts: letters lots of words begin with
const MAX_WORD = 30;

export default {
  id: "word-bomb",
  name: "Word Bomb",
  ranked: true,
  modes: ["ffa"],
  min: 2,
  max: 5,
  options: [{ key: "lives", label: "Lives", type: "number", min: 1, max: 5, def: LIVES }],
  info: {
    blurb: "Pass the bomb with a word. Each word starts with the last letter of the one before.",
    how: "On your turn, type an English word of 3 or more letters that starts with the last letter of the previous word (dog → good → door…). No repeats. A good word passes the bomb to the next player; if the fuse burns out while you hold it, it explodes and you lose a life. After an explosion the next player starts from a random letter. Lose all your lives and you're out. The last player standing wins.",
    keys: "Type your word · Enter to send it",
  },

  create(room) {
    loadWords();
    const seats = room.players.map((p) => p.uid);
    const max = room.opts.lives || LIVES;
    const g = {
      seats,
      lives: Object.fromEntries(seats.map((u) => [u, max])),
      maxLives: max,
      out: [], // uids in the order they went out (first out first)
      gone: [], // the ones who left the game
      phase: "ready",
      turn: seats[Math.floor(Math.random() * seats.length)],
      turnId: 0,
      letter: randomLetter(),
      fuse: FIRST_FUSE,
      deadline: Date.now() + READY_MS,
      typing: "",
      used: new Set(),
      chain: [], // { w, uid } every word said, in order
      words: 0,
      boom: null, // { uid, out, id, word } the last explosion
      booms: 0,
    };
    // (Whoever was picked to go first may have left during the countdown.)
    room.timer(READY_MS, () => startTurn(room, g, alive(g, g.turn) ? g.turn : nextAlive(g, g.turn), g.letter));
    return g;
  },

  action(room, g, p, a) {
    if (g.phase !== "turn" || p.uid !== g.turn) return;
    if (a.k === "type") {
      // What they have in the box so far, shown to everyone.
      const text = plainWord(a.text).slice(0, MAX_WORD);
      if (text === g.typing) return;
      g.typing = text;
      room.broadcast({ t: "wb:type", turnId: g.turnId, text });
      return;
    }
    if (a.k === "word") {
      const w = plainWord(a.word).slice(0, MAX_WORD + 1);
      let why = "";
      if (w.length < 3) why = "At least 3 letters";
      else if (w.length > MAX_WORD) why = "That's too long";
      else if (g.letter && w[0] !== g.letter) why = `Must start with ${g.letter.toUpperCase()}`;
      else if (g.used.has(w)) why = "Already used";
      else if (!isWord(w)) why = "Not in the dictionary";
      if (why) {
        // Wrong: everyone sees the word shake; the player gets to try again.
        room.broadcast({ t: "wb:bad", turnId: g.turnId, uid: p.uid, word: w, why });
        return;
      }
      g.used.add(w);
      g.chain.push({ w, uid: p.uid });
      g.words++;
      g.fuse = Math.max(MIN_FUSE, FIRST_FUSE - g.words * FUSE_STEP);
      startTurn(room, g, nextAlive(g, p.uid), w[w.length - 1]);
    }
  },

  view(room, g, uid) {
    return {
      phase: g.phase,
      seats: g.seats,
      lives: g.lives,
      maxLives: g.maxLives,
      out: g.out,
      gone: g.gone,
      turn: g.turn,
      turnId: g.turnId,
      letter: g.letter,
      fuse: g.phase === "ready" ? READY_MS : g.fuse,
      left: Math.max(0, g.deadline - Date.now()),
      typing: g.typing,
      chain: g.chain.slice(-80),
      words: g.words,
      boom: g.boom,
    };
  },

  // A player who leaves is out on the spot (they place below everyone who outlasts them).
  leave(room, g, p) {
    if (!g.gone.includes(p.uid)) g.gone.push(p.uid);
    if (g.lives[p.uid] > 0) {
      g.lives[p.uid] = 0;
      g.out.push(p.uid);
    }
    if (aliveCount(g) <= 1) return finish(room, g, `${p.name} left`);
    // If they were holding the bomb, the next player carries on from the same letter.
    if (g.turn === p.uid && g.phase === "turn") startTurn(room, g, nextAlive(g, p.uid), g.letter);
    else room.update();
  },

  summary(room, g) {
    if (!g) return null;
    return { text: `${aliveCount(g)} still in · ${g.words} word${g.words === 1 ? "" : "s"}` };
  },
};

const randomLetter = () => START_LETTERS[Math.floor(Math.random() * START_LETTERS.length)];
const alive = (g, uid) => g.lives[uid] > 0;
const aliveCount = (g) => g.seats.filter((u) => alive(g, u)).length;

// The next player round the circle who still has lives.
function nextAlive(g, uid) {
  const i = g.seats.indexOf(uid);
  for (let k = 1; k <= g.seats.length; k++) {
    const u = g.seats[(i + k) % g.seats.length];
    if (alive(g, u)) return u;
  }
  return uid;
}

// Hands the bomb to uid, who must find a word starting with letter.
function startTurn(room, g, uid, letter) {
  g.phase = "turn";
  g.turn = uid;
  g.turnId++;
  g.letter = letter;
  g.typing = "";
  g.deadline = Date.now() + g.fuse;
  const id = g.turnId;
  room.timer(g.fuse, () => g.turnId === id && g.phase === "turn" && explode(room, g));
  room.update();
}

// The fuse ran out: a life lost, maybe out, then the next player starts fresh.
function explode(room, g) {
  const uid = g.turn;
  g.lives[uid] = Math.max(0, g.lives[uid] - 1);
  const out = g.lives[uid] === 0;
  if (out) g.out.push(uid);
  g.phase = "boom";
  g.booms++;
  g.boom = { uid, out, id: g.booms, word: g.typing };
  g.deadline = Date.now() + BOOM_MS;
  room.update();
  room.timer(BOOM_MS, () => {
    if (aliveCount(g) <= 1) return finish(room, g, "");
    startTurn(room, g, nextAlive(g, uid), randomLetter());
  });
}

// Winner first, then everyone else in reverse order of going out.
function finish(room, g, reason) {
  if (g.phase === "done") return;
  const standing = g.seats.filter((u) => alive(g, u));
  const order = [...standing, ...[...g.out].reverse()];
  g.phase = "done";
  g.typing = "";
  const winner = room.players.find((p) => p.uid === order[0]);
  room.update();
  room.end({ order, reason: reason || `${winner?.name || "Someone"} is the last one standing` });
}
