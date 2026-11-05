// Reef Rush: a word party game under the sea. A pufferfish in the middle of a coral reef asks
// for something ("Name a seafood", "A word ending in -DAY", "A 5-letter word starting with
// B"...) and slowly puffs up while the timer runs. Everyone types answers at the same time.
//
// Scoring: each player can land up to 3 right answers a round (wrong tries cost nothing, just
// try again). A right answer is worth 100 points the instant the question appears, sliding
// down to 50 at the buzzer, so being quick pays. When the round ends, every answer that
// nobody else gave scores double. So it's a race, but the obvious answer ("apple!") is worth
// less than the one only you thought of ("rambutan!"). While a round runs, players only see
// how many answers each person has (not what); all answers are shown when it ends. Highest
// total after the last round wins; equal totals share the place.
//
// Categories are checked against hand-written lists (words/categories.js, forgiving about
// spelling and plurals); word puzzles against the English dictionary (words/dict.js).
import { isWord, loadWords, plainWord } from "./words/dict.js";
import { CATEGORIES, match } from "./words/categories.js";
import { PATTERNS, lengthPuzzle } from "./words/patterns.js";

const MAX_ANSWERS = 3; // right answers per player per round
const READY_MS = 3500; // before the first question
const REVEAL_MS = 8000; // the answers on show between rounds
const EARLY_END_MS = 800; // everyone's done: the round ends this soon after

export default {
  id: "reef-rush",
  name: "Reef Rush",
  ranked: true,
  modes: ["ffa"],
  min: 2,
  max: 8,
  options: [
    { key: "rounds", label: "Rounds", type: "number", min: 5, max: 15, def: 10 },
    {
      key: "seconds",
      label: "Time per round",
      type: "select",
      def: "15", // (strings: that's what the host form sends for a select)
      choices: [
        { value: "10", label: "10 seconds" },
        { value: "15", label: "15 seconds" },
        { value: "20", label: "20 seconds" },
        { value: "30", label: "30 seconds" },
      ],
    },
  ],
  info: {
    blurb: "A pufferfish asks, everyone types. Quick answers score, answers nobody else thought of score double.",
    how: "Each round the pufferfish asks for something: things in a category (a seafood, a country, a character from Narnia…) or a word puzzle (a word ending in -DAY, a 5-letter word starting with B…). Type up to 3 right answers before it puffs up all the way. A right answer is worth 100 points if you're instant, down to 50 at the buzzer, and double if nobody else gave it. Wrong tries cost nothing. After each round everyone's answers are shown. Highest score after the last round wins.",
    keys: "Type an answer · Enter to send it",
  },

  create(room) {
    loadWords();
    const seats = room.players.map((p) => p.uid);
    const rounds = room.opts.rounds || 10;
    const g = {
      seats,
      scores: Object.fromEntries(seats.map((u) => [u, 0])),
      gone: [],
      round: 0,
      rounds,
      total: (Number(room.opts.seconds) || 15) * 1000,
      deck: buildDeck(rounds),
      prompt: null,
      answers: {},
      reveal: null,
      phase: "ready",
      deadline: Date.now() + READY_MS,
      roundId: 0,
    };
    room.timer(READY_MS, () => nextRound(room, g));
    return g;
  },

  action(room, g, p, a) {
    if (a.k !== "answer" || g.phase !== "ask") return;
    const mine = g.answers[p.uid];
    if (!mine || mine.length >= MAX_ANSWERS) return;
    const typed = String(a.text ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!typed) return;
    const bad = (why) => room.sendTo(p.uid, { t: "rr:bad", text: typed, why, roundId: g.roundId });
    const pr = g.prompt;
    let key;
    let show;
    if (pr.cat) {
      const m = match(pr.cat, typed);
      if (!m) return bad("The pufferfish doesn't know that one");
      key = `#${m.idx}`;
      show = m.show;
    } else {
      const w = plainWord(typed);
      if (w.length < 2) return bad("Type a word");
      if (!pr.test(w)) return bad(pr.why);
      if (!isWord(w) && !pr.also?.includes(w)) return bad("That's not in the dictionary");
      key = w;
      show = w;
    }
    if (mine.some((x) => x.key === key)) return bad("You already said that");
    const left = Math.max(0, g.deadline - Date.now());
    mine.push({ key, show, typed, base: Math.round(50 + (50 * left) / g.total) });
    room.update();
    // Everyone still playing has all their answers: no point waiting for the buzzer.
    const playing = g.seats.filter((u) => !g.gone.includes(u));
    if (playing.every((u) => g.answers[u].length >= MAX_ANSWERS)) {
      const id = g.roundId;
      g.deadline = Math.min(g.deadline, Date.now() + EARLY_END_MS);
      room.timer(EARLY_END_MS, () => g.roundId === id && g.phase === "ask" && endRound(room, g));
      room.update();
    }
  },

  view(room, g, uid) {
    const asking = g.phase === "ask";
    return {
      phase: g.phase,
      round: g.round,
      rounds: g.rounds,
      roundId: g.roundId,
      total: g.phase === "ready" ? READY_MS : g.phase === "reveal" ? REVEAL_MS : g.total,
      left: Math.max(0, g.deadline - Date.now()),
      max: MAX_ANSWERS,
      prompt: g.prompt ? { ask: g.prompt.ask, kind: g.prompt.cat ? "cat" : "word" } : null,
      players: g.seats.map((u) => ({ uid: u, score: g.scores[u], got: g.answers[u]?.length || 0, gone: g.gone.includes(u) })),
      // Your own answers while the round runs (other people's stay hidden until it ends).
      mine: asking && uid && g.answers[uid] ? g.answers[uid].map((x) => ({ show: x.show, base: x.base })) : [],
      reveal: g.phase === "reveal" || g.phase === "done" ? g.reveal : null,
    };
  },

  leave(room, g, p) {
    if (!g.gone.includes(p.uid)) g.gone.push(p.uid);
    if (g.seats.filter((u) => !g.gone.includes(u)).length < 2) return finish(room, g, `${p.name} left`);
    room.update();
  },

  summary(room, g) {
    if (!g || !g.round) return null;
    return { text: `Round ${g.round} of ${g.rounds}` };
  },
};

const shuffle = (list) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

// The questions for a whole game, no repeats: about half categories, half word puzzles
// (a couple of them "N letters starting with X"). It opens with a category, the gentlest kind.
function buildDeck(n) {
  const cats = shuffle(Object.keys(CATEGORIES));
  const pats = shuffle([...PATTERNS]);
  const deck = [];
  let lengthOnes = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    if (i === 0 || (r < 0.55 && cats.length)) deck.push({ cat: cats.pop(), ask: null });
    else if (r < 0.68 && lengthOnes < 2) {
      lengthOnes++;
      deck.push(lengthPuzzle(Math.random, CATEGORIES));
    } else deck.push(pats.pop() || { cat: cats.pop() });
  }
  for (const p of deck) if (p.cat) p.ask = CATEGORIES[p.cat].ask;
  return deck;
}

function nextRound(room, g) {
  g.round++;
  g.roundId++;
  g.prompt = g.deck[g.round - 1];
  g.answers = Object.fromEntries(g.seats.map((u) => [u, []]));
  g.reveal = null;
  g.phase = "ask";
  g.deadline = Date.now() + g.total;
  const id = g.roundId;
  room.timer(g.total, () => g.roundId === id && g.phase === "ask" && endRound(room, g));
  room.update();
}

// The buzzer: answers nobody else gave score double, then everything goes on show.
function endRound(room, g) {
  const count = new Map();
  for (const u of g.seats) for (const x of g.answers[u]) count.set(x.key, (count.get(x.key) || 0) + 1);
  const answers = {};
  const gained = {};
  for (const u of g.seats) {
    gained[u] = 0;
    answers[u] = g.answers[u].map((x) => {
      const unique = count.get(x.key) === 1 && g.seats.length > 1;
      const pts = x.base * (unique ? 2 : 1);
      gained[u] += pts;
      return { show: x.show, typed: x.typed !== x.show ? x.typed : undefined, pts, unique };
    });
    g.scores[u] += gained[u];
  }
  // A few answers nobody gave, to show what else would have counted.
  const pr = g.prompt;
  let ideas;
  if (pr.cat) {
    const said = new Set([...count.keys()]);
    ideas = shuffle(CATEGORIES[pr.cat].answers.map((a, i) => (said.has(`#${i}`) ? null : a.show)).filter(Boolean)).slice(0, 5);
  } else ideas = (pr.examples || []).filter((w) => !count.has(w)).slice(0, 4);
  g.reveal = { ask: pr.ask, answers, gained, ideas };
  g.phase = "reveal";
  const last = g.round >= g.rounds;
  g.deadline = Date.now() + (last ? 3500 : REVEAL_MS);
  room.update();
  room.timer(last ? 3500 : REVEAL_MS, () => (last ? finish(room, g, "") : nextRound(room, g)));
}

// Highest total first; equal totals share a place. Players who left come last.
function finish(room, g, reason) {
  if (g.phase === "done") return;
  g.phase = "done";
  const here = g.seats.filter((u) => !g.gone.includes(u)).sort((a, b) => g.scores[b] - g.scores[a]);
  const sides = [];
  let place = 0;
  here.forEach((u, i) => {
    if (i === 0 || g.scores[u] !== g.scores[here[i - 1]]) {
      place = i + 1;
      sides.push({ uids: [u], place });
    } else sides[sides.length - 1].uids.push(u);
  });
  let next = here.length + 1;
  for (const u of [...g.gone].sort((a, b) => g.scores[b] - g.scores[a])) sides.push({ uids: [u], place: next++ });
  const top = sides[0]?.uids || [];
  const nameOf = (u) => room.players.find((p) => p.uid === u)?.name || "Someone";
  if (!reason) reason = top.length > 1 ? `A tie at the top with ${g.scores[top[0]]} points` : `${nameOf(top[0])} wins with ${g.scores[top[0]]} points`;
  g.deadline = Date.now();
  room.update();
  room.end({ sides, reason });
}
