// Guesser: a 20-questions game for two. One player (the chooser) picks a big category (Animal,
// Food, Object, …) and a secret word in it, from suggestions or their own; the other (the
// guesser) is told the category and asks yes/no questions from a bank, which the chooser
// answers Yes, No or Not sure. The guesser can type a guess at any time; a wrong guess costs a
// question like asking one does. 20 questions at most, then one last guess.
//
// Two rounds, each player chooses once. Fewest questions used wins (not guessing at all counts
// as 21); the same number is a draw.
//
// Questions only come from the bank (sent by id), so nobody can ask "what's the word?"; the
// word stays here until the round ends (the guesser and spectators never see it before).
import { randomInt } from "node:crypto";

const MAX_Q = 20;
const FAILED = MAX_Q + 1; // the score for not guessing the word
const PICK_MS = 90_000; // the chooser must pick a word by then (or gets a random one)
const ANSWER_MS = 60_000; // and answer each question by then (or it's "Not sure")
const LAST_MS = 60_000; // the last guess, after the 20th question
const ROUND_END_MS = 7000;

const GENERAL = [
  "Is it bigger than a car?",
  "Is it bigger than a person?",
  "Is it smaller than your hand?",
  "Can you hold it in your hands?",
  "Would you find it at a school?",
  "Would you find it in a house?",
  "Is it usually outside?",
  "Is it found in or near water?",
  "Is it mostly one color?",
  "Is it colorful?",
  "Do kids like it?",
  "Do you see it almost every day?",
  "Is it expensive?",
  "Can it be dangerous?",
  "Is it made by people?",
  "Is it found in nature?",
  "Is it linked to a holiday?",
  "Does it make noise?",
  "Is it famous all over the world?",
  "Is its name more than one word?",
  "Does its name start with a letter from A to M?",
  "Is it found in the USA?",
  "Is it used for fun?",
  "Is it popular in summer?",
  "Is it popular in winter?",
  "Has almost everyone seen one in real life?",
];

// The big categories: what the chooser can pick from, a few ideas for each, and questions
// that fit them (on top of the general ones).
export const CATEGORIES = {
  animal: {
    name: "Animal",
    words: ["dog", "cat", "lion", "tiger", "elephant", "giraffe", "zebra", "horse", "cow", "pig", "sheep", "goat", "chicken", "duck", "penguin", "eagle", "owl", "parrot", "shark", "dolphin", "whale", "octopus", "jellyfish", "crab", "frog", "snake", "turtle", "crocodile", "kangaroo", "koala", "panda", "polar bear", "wolf", "fox", "rabbit", "squirrel", "mouse", "bat", "monkey", "gorilla", "camel", "bee", "butterfly", "spider", "ant", "snail", "hamster", "flamingo"],
    questions: ["Is it a mammal?", "Is it a bird?", "Is it a fish?", "Is it a reptile?", "Is it an insect or a bug?", "Does it live in water?", "Can it fly?", "Does it have four legs?", "Does it have more than four legs?", "Does it have no legs?", "Does it have fur?", "Does it have feathers?", "Does it have scales or a shell?", "Does it have a tail?", "Is it a pet?", "Is it a farm animal?", "Does it live in the jungle?", "Does it live in Africa?", "Does it live in the ocean?", "Does it eat meat?", "Does it eat only plants?", "Is it bigger than a dog?", "Is it smaller than a cat?", "Is it a wild animal?", "Would you see it at a zoo?", "Does it have stripes or spots?", "Can it climb trees?", "Does it lay eggs?", "Is it fast?", "Is it dangerous to people?", "Does it have horns or antlers?", "Is it awake at night?", "Does it live where it's cold?", "Can it swim?", "Does it hop or jump?", "Is it black and white?"],
  },
  food: {
    name: "Food",
    words: ["pizza", "hamburger", "hot dog", "taco", "sushi", "spaghetti", "pancake", "waffle", "cereal", "sandwich", "apple", "banana", "strawberry", "watermelon", "orange", "grapes", "pineapple", "carrot", "broccoli", "potato", "french fries", "popcorn", "ice cream", "chocolate", "cookie", "cake", "donut", "cupcake", "cheese", "egg", "bacon", "bread", "rice", "soup", "salad", "burrito", "lemon", "peanut butter", "yogurt", "pretzel", "noodles", "chicken nuggets", "macaroni and cheese", "corn"],
    questions: ["Is it a fruit?", "Is it a vegetable?", "Is it a dessert or a sweet?", "Is it salty?", "Is it spicy?", "Do people eat it for breakfast?", "Is it eaten hot?", "Is it eaten cold?", "Is it a snack?", "Is it fast food?", "Does it have cheese in it?", "Does it have meat in it?", "Is it made from bread or dough?", "Is it a drink?", "Do you eat it with your hands?", "Do you need a fork or spoon?", "Is it crunchy?", "Is it soft or mushy?", "Is it red?", "Is it yellow?", "Is it green?", "Is it brown?", "Does it grow on a tree?", "Is it baked?", "Is it fried?", "Does it come from Italy?", "Does it come from Asia?", "Does it come from Mexico?", "Is it healthy?", "Is it sugary?", "Is it round?", "Do people eat it at parties?", "Do you peel it?", "Is it made from milk?", "Does it come in a box or package?", "Do people eat it at the movies?"],
  },
  object: {
    name: "Object",
    words: ["chair", "table", "lamp", "phone", "laptop", "television", "pencil", "backpack", "book", "clock", "umbrella", "scissors", "toothbrush", "mirror", "pillow", "key", "wallet", "camera", "guitar", "piano", "ball", "hammer", "spoon", "fork", "cup", "bottle", "glasses", "shoe", "hat", "watch", "candle", "balloon", "headphones", "remote control", "refrigerator", "microwave", "broom", "ladder", "bucket", "rope", "crayon", "calculator", "bed", "door"],
    questions: ["Is it electronic?", "Does it need batteries or a plug?", "Is it made of metal?", "Is it made of plastic?", "Is it made of wood?", "Is it made of glass?", "Is it made of cloth?", "Is it in the kitchen?", "Is it in the bedroom?", "Is it in the bathroom?", "Is it a tool?", "Is it a toy?", "Is it furniture?", "Is it something you wear?", "Do you use it for school?", "Do you use it for cleaning?", "Do you use it for cooking or eating?", "Do you use it to write or draw?", "Does it have a screen?", "Does it have buttons?", "Is it heavier than a backpack?", "Is it sharp?", "Is it soft?", "Does it fold or bend?", "Does it have wheels?", "Is it round?", "Is it a musical instrument?", "Do you use it every day?", "Does it break easily?", "Does it light up?", "Do you keep things in it?", "Is it used outside?", "Would you find it in an office?", "Does it fit in your pocket?", "Does it have a handle?"],
  },
  place: {
    name: "Place",
    words: ["beach", "school", "hospital", "library", "airport", "zoo", "park", "museum", "castle", "farm", "desert", "jungle", "mountain", "volcano", "island", "cave", "forest", "kitchen", "bathroom", "classroom", "restaurant", "supermarket", "movie theater", "stadium", "swimming pool", "playground", "bakery", "church", "prison", "the moon", "North Pole", "Paris", "New York", "Egypt", "Japan", "Antarctica", "mall", "gym", "hotel", "amusement park", "fire station", "bank"],
    questions: ["Is it a building?", "Is it outdoors?", "Is it a country or a city?", "Is it in the USA?", "Is it in Europe?", "Is it in Asia?", "Is it in Africa?", "Is it a natural place?", "Is it a room in a house?", "Is it hot there?", "Is it cold there?", "Is there water there?", "Is it near the ocean?", "Is it in the mountains?", "Do people live there?", "Do people work there?", "Do you go there to learn?", "Do you go there to shop?", "Do you go there for fun?", "Do you go there to eat?", "Do you go there when you're sick?", "Do you need a ticket to get in?", "Is it usually crowded?", "Is it quiet?", "Is it bigger than a house?", "Is it on Earth?", "Can you sleep there?", "Are there animals there?", "Have most people been there?", "Is it open at night?", "Do kids go there a lot?", "Is it a famous place?", "Can you drive there?", "Is it underground?", "Is it in space?"],
  },
  vehicle: {
    name: "Vehicle",
    words: ["car", "bus", "truck", "bicycle", "motorcycle", "train", "airplane", "helicopter", "boat", "ship", "submarine", "rocket", "taxi", "ambulance", "fire truck", "police car", "tractor", "skateboard", "scooter", "golf cart", "hot air balloon", "sailboat", "canoe", "jet ski", "limousine", "van", "tank", "bulldozer", "garbage truck", "school bus", "subway", "tram", "snowmobile", "sled", "spaceship", "cruise ship", "race car", "monster truck", "horse carriage", "forklift", "unicycle", "kayak"],
    questions: ["Does it drive on roads?", "Does it fly?", "Does it go on water?", "Does it go underwater?", "Does it run on rails?", "Does it have an engine?", "Do you pedal it?", "Does it have two wheels?", "Does it have four wheels?", "Does it have more than four wheels?", "Does it carry lots of people?", "Is it for one person?", "Is it used in emergencies?", "Is it used for work?", "Is it used for fun or sport?", "Is it faster than a car?", "Is it bigger than a car?", "Is it smaller than a car?", "Does the army use it?", "Does it carry cargo or things?", "Does it have a siren?", "Is it usually yellow?", "Is it usually red?", "Is it public transportation?", "Do you need a license to drive it?", "Is it used on snow or ice?", "Can it go to space?", "Does it have a roof?", "Does it have wings?", "Does it have sails?", "Is it old-fashioned?", "Can a kid ride it?", "Is it used on farms?", "Do you see it in cities?", "Does it need fuel or charging?"],
  },
  plant: {
    name: "Plant",
    words: ["rose", "sunflower", "tulip", "daisy", "cactus", "oak tree", "palm tree", "pine tree", "maple tree", "bamboo", "grass", "moss", "fern", "ivy", "lily", "orchid", "dandelion", "clover", "lavender", "Venus flytrap", "seaweed", "cherry blossom", "apple tree", "Christmas tree", "bonsai", "poison ivy", "mint", "basil", "wheat", "pumpkin", "cotton", "lotus", "aloe vera", "willow tree", "redwood", "tomato plant", "rosemary", "coconut tree", "strawberry plant", "lettuce"],
    questions: ["Is it a tree?", "Is it a flower?", "Does it grow fruit?", "Can you eat it?", "Is it a vegetable plant?", "Is it an herb or spice?", "Is it mostly green?", "Does it have colorful flowers?", "Is it red?", "Is it yellow?", "Is it purple?", "Is it taller than a person?", "Is it smaller than a person?", "Does it have thorns or spikes?", "Does it grow in the desert?", "Does it grow in water?", "Does it grow in the jungle?", "Does it grow where it's cold?", "Does it smell nice?", "Is it poisonous?", "Is it a houseplant?", "Do people give it as a gift?", "Is it used for decoration?", "Does it lose its leaves in fall?", "Do people make things from it (like wood or cloth)?", "Is it grown on farms?", "Does it climb or grow as a vine?", "Is it linked to a holiday?", "Does it grow in gardens?", "Does it grow in the USA?", "Does it need lots of sun?", "Is it a weed?", "Does it have big leaves?", "Does it live for many years?"],
  },
  person: {
    name: "Person",
    words: ["doctor", "teacher", "firefighter", "police officer", "astronaut", "chef", "pilot", "farmer", "nurse", "dentist", "scientist", "artist", "singer", "actor", "soccer player", "king", "queen", "pirate", "ninja", "cowboy", "wizard", "superhero", "clown", "magician", "president", "baby", "grandma", "lifeguard", "mail carrier", "builder", "lawyer", "YouTuber", "DJ", "detective", "knight", "princess", "zookeeper", "mechanic", "barber", "photographer", "vampire", "mermaid"],
    questions: ["Is it a job?", "Is it a made-up or fantasy character?", "Is it a royal?", "Do they wear a uniform?", "Do they work in a hospital?", "Do they work outside?", "Do they work with kids?", "Do they help people?", "Do they work with animals?", "Do they wear a hat or helmet?", "Do they use a vehicle for work?", "Are they on TV or in movies a lot?", "Are they famous?", "Do they perform on stage?", "Is it about sports?", "Do they need a lot of school?", "Do they cook?", "Do they build or fix things?", "Do they fight or protect people?", "Do they travel a lot?", "Do they work at night?", "Do they use computers a lot?", "Is it a family member?", "Are they from long ago?", "Do they have superpowers or magic?", "Do they carry a weapon?", "Do they make art or music?", "Do they work in an office?", "Do they make a lot of money?", "Is it a kid or a baby?", "Are they usually old?", "Do they sell things?", "Do they work in the air or space?", "Do they work on the water?", "Are they in fairy tales?", "Do they tell people what to do?"],
  },
  sport: {
    name: "Sport",
    words: ["soccer", "basketball", "baseball", "football", "tennis", "golf", "swimming", "hockey", "volleyball", "boxing", "skiing", "snowboarding", "surfing", "skateboarding", "bowling", "cycling", "running", "gymnastics", "karate", "wrestling", "badminton", "table tennis", "cricket", "rugby", "archery", "fencing", "rowing", "figure skating", "dodgeball", "lacrosse", "horse riding", "rock climbing", "diving", "water polo", "softball", "kickball", "curling", "pickleball", "track and field", "judo"],
    questions: ["Is it played with a ball?", "Is it a team sport?", "Is it one against one?", "Is it done in water?", "Is it done on ice or snow?", "Is it played indoors?", "Is it played outdoors?", "Do you use a bat, stick, racket or club?", "Is there a net?", "Is there a goal?", "Do you kick the ball?", "Do you throw the ball?", "Do you hit the ball?", "Is it in the Olympics?", "Is it a fighting sport?", "Do you need special shoes?", "Do you need a helmet?", "Is it played on a field?", "Is it played on a court?", "Does it use wheels or a board?", "Does it use an animal?", "Is it popular in the USA?", "Is it popular in Europe?", "Is it a race?", "Do you score points?", "Do you jump a lot?", "Is it dangerous?", "Is it a summer sport?", "Is it a winter sport?", "Do you need a partner or a team?", "Do kids play it at school?", "Do you run a lot?", "Can you do it alone?", "Does it need a lot of equipment?", "Is it played on grass?", "Does the ball go in a hoop or basket?"],
  },
};

// Every question with its id: "g3" (general) or "animal:5".
const BANK = {};
GENERAL.forEach((q, i) => (BANK[`g${i}`] = q));
for (const [cat, c] of Object.entries(CATEGORIES)) c.questions.forEach((q, i) => (BANK[`${cat}:${i}`] = q));
// Only real categories and questions (not names every object has, like "constructor").
const isCat = (c) => typeof c === "string" && Object.hasOwn(CATEGORIES, c);
const bankFor = (cat) => [...CATEGORIES[cat].questions.map((q, i) => ({ id: `${cat}:${i}`, q, cat: true })), ...GENERAL.map((q, i) => ({ id: `g${i}`, q }))];

export default {
  id: "guesser",
  name: "Guesser",
  ranked: false,
  modes: ["1v1"],
  min: 2,
  max: 2,
  info: {
    blurb: "Pick a secret word, then race to guess theirs with yes-or-no questions.",
    how: "One player picks a big category (Animal, Food, Object, Place, Vehicle, Plant, Person or Sport) and a secret word in it. The other player is told the category and asks yes-or-no questions from the question bank; the chooser answers Yes, No or Not sure. Type a guess whenever you think you know it, but a wrong guess costs a question. You have 20 questions, then one last guess. Then you swap. Whoever needed fewer questions wins.",
    keys: "Tap a question to ask it · type your guess in the box",
  },

  create(room) {
    const uids = room.players.map((p) => p.uid);
    if (randomInt(2)) uids.reverse();
    const g = { order: uids, round: 0, results: [], phase: "pick", endsAt: 0 };
    newRound(room, g);
    return g;
  },

  action(room, g, p, a) {
    const chooser = p.uid === g.chooser;
    const guesser = p.uid === g.guesser;
    // The chooser picks the category and the word.
    if (a.k === "choose" && chooser && g.phase === "pick") {
      const word = cleanWord(a.word);
      if (!isCat(a.cat) || !word) return room.toast("Pick a category and a word (letters, 2 to 30 long)", p.uid);
      g.cat = a.cat;
      g.word = word;
      return ask(room, g);
    }
    if (a.k === "shuffle" && chooser && g.phase === "pick" && isCat(a.cat)) {
      g.ideas[a.cat] = ideas(a.cat);
      return room.update();
    }
    // The guesser asks a question from the bank (one at a time, never the same one twice).
    if (a.k === "ask" && guesser && g.phase === "ask" && !g.pending && g.used < MAX_Q) {
      const id = String(a.id || "");
      const ok = Object.hasOwn(BANK, id) && (id.startsWith("g") || id.startsWith(`${g.cat}:`)) && !g.asked.some((x) => x.id === id);
      if (!ok) return;
      g.asked.push({ id, q: BANK[id], a: null });
      g.pending = true;
      g.used++;
      g.endsAt = Date.now() + ANSWER_MS;
      return room.update();
    }
    // The chooser answers it.
    if (a.k === "answer" && chooser && g.pending && ["yes", "no", "unsure"].includes(a.a)) return answer(room, g, a.a);
    // The guesser guesses (any time while asking; one last guess after the 20th question).
    if (a.k === "guess" && guesser && (g.phase === "ask" || g.phase === "last")) {
      const text = String(a.text || "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (!text) return;
      const right = sameWord(text, g.word);
      g.guesses.push({ text, right, at: g.used });
      if (right) return endRound(room, g, true);
      if (g.phase === "last" || g.used >= MAX_Q) return endRound(room, g, false);
      g.used++;
      if (g.used >= MAX_Q && !g.pending) lastGuess(g);
      return room.update();
    }
  },

  tick(room, g) {
    if (!g.endsAt || Date.now() < g.endsAt) return;
    g.endsAt = 0;
    if (g.phase === "pick") {
      // Too slow to choose: a random idea from a category they were looking at (or any).
      const cat = isCat(g.cat) ? g.cat : pick(Object.keys(CATEGORIES));
      g.cat = cat;
      g.word = pick(CATEGORIES[cat].words);
      room.toast(`Time's up, so your word is "${g.word}"`, g.chooser);
      return ask(room, g);
    }
    if (g.pending) {
      room.toast("No answer in time, so that one is \"Not sure\"", g.guesser);
      return answer(room, g, "unsure");
    }
    if (g.phase === "last") return endRound(room, g, false);
    if (g.phase === "roundover") return g.round >= 2 ? finish(room, g) : newRound(room, g);
  },

  view(room, g, uid) {
    const chooser = uid === g.chooser;
    const guesser = uid === g.guesser;
    const revealed = g.phase === "roundover" || g.phase === "over";
    const v = {
      phase: g.phase,
      round: g.round,
      rounds: 2,
      chooser: g.chooser,
      guesser: g.guesser,
      cat: g.phase === "pick" ? null : g.cat,
      catName: g.phase === "pick" ? null : CATEGORIES[g.cat]?.name,
      asked: g.asked,
      pending: g.pending,
      guesses: g.guesses,
      used: g.used,
      max: MAX_Q,
      left: g.endsAt ? Math.max(0, g.endsAt - Date.now()) : 0,
      results: g.results,
      word: chooser || revealed ? g.word : null,
      got: g.got,
      categories: Object.entries(CATEGORIES).map(([id, c]) => ({ id, name: c.name })),
    };
    if (chooser && g.phase === "pick") v.ideas = g.ideas;
    if (guesser && (g.phase === "ask" || g.phase === "last")) v.bank = bankFor(g.cat);
    return v;
  },

  leave(room, g, p) {
    const other = room.players.find((x) => x.uid !== p.uid);
    room.end({ winners: [other.uid], reason: `${p.name} left` });
  },

  summary(room, g) {
    if (!g || g.phase === "over") return null;
    return { text: `Round ${g.round} of 2` };
  },
};

/* ------------------------------------------------------------ the rounds */
function newRound(room, g) {
  g.round++;
  g.chooser = g.order[(g.round - 1) % 2];
  g.guesser = g.order[g.round % 2];
  g.phase = "pick";
  g.cat = null;
  g.word = null;
  g.asked = [];
  g.guesses = [];
  g.used = 0;
  g.pending = false;
  g.got = null;
  g.ideas = Object.fromEntries(Object.keys(CATEGORIES).map((c) => [c, ideas(c)]));
  g.endsAt = Date.now() + PICK_MS;
  room.update();
}

function ask(room, g) {
  g.phase = "ask";
  g.ideas = null;
  g.endsAt = 0;
  room.update();
}

function answer(room, g, a) {
  const q = g.asked[g.asked.length - 1];
  if (!q || q.a) return;
  q.a = a;
  g.pending = false;
  g.endsAt = 0;
  if (g.used >= MAX_Q) lastGuess(g);
  room.update();
}

function lastGuess(g) {
  g.phase = "last";
  g.endsAt = Date.now() + LAST_MS;
}

function endRound(room, g, got) {
  g.phase = "roundover";
  g.pending = false;
  g.got = got;
  g.results.push({ round: g.round, guesser: g.guesser, chooser: g.chooser, word: g.word, cat: g.cat, used: got ? g.used : FAILED, got });
  g.endsAt = Date.now() + ROUND_END_MS;
  room.update();
}

function finish(room, g) {
  g.phase = "over";
  g.endsAt = 0;
  room.update();
  const [a, b] = g.order.map((uid) => g.results.find((r) => r.guesser === uid));
  const name = (uid) => room.players.find((p) => p.uid === uid)?.name || "Someone";
  const said = (r) => (r.got ? `${name(r.guesser)} needed ${r.used} ${r.used === 1 ? "question" : "questions"}` : `${name(r.guesser)} didn't get it`);
  const [best, worst] = a.used <= b.used ? [a, b] : [b, a];
  const reason = `${said(best)} · ${said(worst)}`;
  if (a.used === b.used) return room.end({ draw: true, reason });
  room.end({ winners: [best.guesser], reason });
}

/* ------------------------------------------------------------ words */
const pick = (list) => list[randomInt(list.length)];
function ideas(cat) {
  const list = [...CATEGORIES[cat].words];
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, 8);
}

// A word of their own: letters (any language), digits, spaces, - ' . & — 2 to 30 long.
function cleanWord(raw) {
  const w = String(raw || "").replace(/\s+/g, " ").trim();
  if (w.length < 2 || w.length > 30 || !/\p{L}/u.test(w) || !/^[\p{L}\p{N} '.&-]+$/u.test(w)) return null;
  return w;
}

// Forgiving: case, accents, spaces and punctuation, "a/an/the", plurals, and one typo in a
// long word all still count.
const IRREGULAR = { mice: "mouse", geese: "goose", teeth: "tooth", feet: "foot", children: "child", men: "man", women: "woman", people: "person", knives: "knife", leaves: "leaf", wolves: "wolf", loaves: "loaf" };
// The word itself and what it could be without a plural ending ("horses" -> "horse", "foxes"
// -> "fox", "cherries" -> "cherry").
function stems(w) {
  const out = new Set([w]);
  if (IRREGULAR[w]) out.add(IRREGULAR[w]);
  if (w.length > 4 && w.endsWith("ies")) out.add(w.slice(0, -3) + "y");
  if (w.length > 4 && w.endsWith("es")) out.add(w.slice(0, -2));
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) out.add(w.slice(0, -1));
  return [...out];
}
// Ways to write a word or phrase, squashed together (only the last word can be plural:
// "french fries", "chicken nuggets").
function forms(text) {
  const words = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter(Boolean);
  if (words.length > 1 && ["a", "an", "the"].includes(words[0])) words.shift();
  const last = words.pop() || "";
  const head = words.join("");
  return last ? stems(last).map((s) => head + s) : [];
}
export function sameWord(guess, word) {
  const a = forms(guess);
  const b = forms(word);
  if (a.some((x) => b.includes(x))) return true;
  return a.some((x) => b.some((y) => Math.min(x.length, y.length) >= 6 && near(x, y)));
}
// At most one letter added, missing, changed, or two neighbors swapped.
function near(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
