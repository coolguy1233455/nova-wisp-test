// Reef Rush's word puzzles: "a word ending in -ING", "a 5-letter word starting with B"...
// Answers are checked against the English dictionary (dict.js), so any real word that fits
// counts. Each puzzle has a few everyday examples, written by hand, shown after the round
// (the dictionary itself is full of odd words nobody would want suggested).
//
// A puzzle: { ask, test(word), why (said when a real word doesn't fit), examples, also }.
// "also" are extra words that count even though the dictionary lacks them (Monday...).

const ends = (part, examples, also) => ({
  ask: `A word ending in -${part.toUpperCase()}`,
  test: (w) => w.endsWith(part) && w !== part,
  why: `It has to end in -${part.toUpperCase()}`,
  examples,
  also,
});
const starts = (part, examples) => ({
  ask: `A word starting with ${part.toUpperCase()}-`,
  test: (w) => w.startsWith(part) && w !== part,
  why: `It has to start with ${part.toUpperCase()}-`,
  examples,
});
const has = (part, examples) => ({
  ask: `A word with "${part.toUpperCase()}" in it`,
  test: (w) => w.includes(part),
  why: `It needs "${part.toUpperCase()}" in it`,
  examples,
});
const sameEnds = (l, examples) => ({
  ask: `A word that starts AND ends with ${l.toUpperCase()}`,
  test: (w) => w[0] === l && w[w.length - 1] === l,
  why: `It has to start and end with ${l.toUpperCase()}`,
  examples,
});

export const PATTERNS = [
  ends("ing", ["running", "king", "swimming", "something"]),
  ends("day", ["birthday", "holiday", "today", "yesterday"], ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "gameday", "snowday"]),
  ends("tion", ["vacation", "question", "lotion", "station"]),
  ends("ness", ["happiness", "darkness", "kindness", "sadness"]),
  ends("ful", ["beautiful", "helpful", "spoonful", "awful"]),
  ends("less", ["endless", "careless", "useless", "wireless"]),
  ends("ship", ["friendship", "spaceship", "championship", "worship"]),
  ends("ight", ["night", "light", "knight", "tonight"]),
  ends("ology", ["biology", "apology", "technology", "geology"]),
  ends("ment", ["moment", "payment", "basement", "movement"]),
  ends("able", ["comfortable", "table", "adorable", "vegetable"]),
  ends("fish", ["goldfish", "catfish", "jellyfish", "starfish"]),
  ends("berry", ["strawberry", "blueberry", "raspberry", "cranberry"]),
  ends("light", ["flashlight", "sunlight", "spotlight", "daylight"]),
  ends("ball", ["football", "snowball", "meatball", "basketball"]),
  ends("man", ["snowman", "fireman", "fisherman", "woman"]),
  ends("ock", ["clock", "rock", "sock", "shock"]),
  ends("ack", ["snack", "backpack", "black", "attack"]),
  ends("room", ["bedroom", "classroom", "mushroom", "bathroom"]),
  ends("time", ["bedtime", "lunchtime", "overtime", "sometime"]),
  ends("land", ["island", "wonderland", "homeland", "highland"]),
  ends("ake", ["cake", "snake", "earthquake", "pancake"]),
  ends("ous", ["famous", "delicious", "enormous", "nervous"]),
  ends("est", ["biggest", "forest", "best", "fastest"]),
  ends("ward", ["forward", "backward", "award", "awkward"]),
  ends("ish", ["fish", "selfish", "finish", "dish"]),
  ends("oon", ["balloon", "moon", "spoon", "cartoon"]),
  ends("ice", ["rice", "mice", "nice", "office"]),
  starts("pre", ["present", "pretty", "predict", "pretend"]),
  starts("un", ["under", "unhappy", "unicorn", "until"]),
  starts("over", ["overall", "overtime", "overcome", "overnight"]),
  starts("sun", ["sunflower", "sunny", "sunset", "sunglasses"]),
  starts("fire", ["firework", "firefly", "fireplace", "firetruck"]),
  starts("water", ["waterfall", "watermelon", "waterproof", "watery"]),
  starts("back", ["backpack", "backyard", "background", "backwards"]),
  starts("snow", ["snowman", "snowflake", "snowball", "snowy"]),
  starts("star", ["starfish", "start", "starve", "starlight"]),
  starts("sea", ["seashell", "season", "seat", "seahorse"]),
  starts("sand", ["sandwich", "sandal", "sandcastle", "sandy"]),
  starts("rain", ["rainbow", "raincoat", "rainforest", "rainy"]),
  starts("dis", ["disco", "discover", "dishes", "disaster"]),
  starts("mis", ["mistake", "mischief", "missile", "mister"]),
  starts("out", ["outside", "outfit", "outer", "outlaw"]),
  starts("under", ["underwater", "understand", "underwear", "underground"]),
  starts("book", ["bookshelf", "bookmark", "booklet", "bookworm"]),
  starts("head", ["headphones", "headache", "headband", "headlight"]),
  starts("foot", ["football", "footprint", "footstep", "footnote"]),
  starts("hand", ["handshake", "handsome", "handle", "handbag"]),
  starts("air", ["airplane", "airport", "airbag", "airline"]),
  starts("moon", ["moonlight", "moonwalk", "moonbeam", "moonshine"]),
  starts("bed", ["bedroom", "bedtime", "bedbug", "bedside"]),
  starts("sh", ["shark", "shell", "shoe", "shiny"]),
  starts("ch", ["cheese", "chair", "chocolate", "chicken"]),
  starts("th", ["think", "thunder", "thumb", "three"]),
  starts("bl", ["blue", "black", "blanket", "blink"]),
  has("oo", ["school", "moon", "book", "balloon"]),
  has("ee", ["tree", "sheep", "coffee", "green"]),
  has("zz", ["pizza", "puzzle", "buzz", "dizzy"]),
  has("ph", ["phone", "elephant", "alphabet", "dolphin"]),
  has("qu", ["queen", "quiz", "squid", "quiet"]),
  has("ck", ["duck", "chicken", "rocket", "jacket"]),
  has("x", ["box", "taxi", "oxygen", "relax"]),
  has("z", ["zebra", "lazy", "pizza", "frozen"]),
  has("j", ["jam", "enjoy", "pajamas", "jelly"]),
  has("gh", ["ghost", "laugh", "daughter", "night"]),
  has("tt", ["kitten", "butter", "bottle", "letter"]),
  has("ou", ["house", "mouse", "cloud", "young"]),
  has("ai", ["rain", "train", "snail", "paint"]),
  has("oa", ["boat", "goat", "toast", "road"]),
  sameEnds("t", ["test", "toast", "tablet", "trumpet"]),
  sameEnds("d", ["dad", "dead", "diamond", "did"]),
  sameEnds("s", ["stars", "snakes", "sharks", "socks"]),
  sameEnds("e", ["eye", "else", "engine", "escape"]),
  sameEnds("r", ["river", "radar", "rumor", "ruler"]),
  sameEnds("k", ["kick", "knock", "kayak", "kiosk"]),
  sameEnds("n", ["noon", "nation", "nylon", "napkin"]),
  sameEnds("a", ["area", "alpha", "agenda", "arena"]),
  sameEnds("g", ["going", "giving", "gang", "gag"]),
  sameEnds("h", ["health", "hash", "hush", "hatch"]),
  sameEnds("l", ["level", "label", "local", "legal"]),
  sameEnds("y", ["yearly", "yummy", "yay", "yesterday"]),
  {
    ask: "A word with ALL five vowels (A E I O U)",
    test: (w) => [..."aeiou"].every((v) => w.includes(v)),
    why: "It needs A, E, I, O and U somewhere in it",
    examples: ["education", "sequoia", "favourite", "authorize"],
  },
  {
    ask: "A palindrome (same word backwards)",
    test: (w) => w === [...w].reverse().join(""),
    why: "It has to read the same backwards",
    examples: ["mom", "level", "kayak", "racecar"],
    also: ["racecar", "tacocat"],
  },
  {
    ask: "A word with 10 or more letters",
    test: (w) => w.length >= 10,
    why: "It needs at least 10 letters",
    examples: ["basketball", "everything", "strawberry", "watermelon"],
  },
  {
    ask: "A word with no A, E, I, O or U",
    test: (w) => !/[aeiou]/.test(w),
    why: "No A, E, I, O or U allowed (Y is fine)",
    examples: ["rhythm", "gym", "sky", "myth"],
  },
  {
    ask: "A word with TWO sets of double letters",
    test: (w) => (w.match(/(.)\1/g) || []).length >= 2,
    why: "It needs two pairs of double letters (like coffee: FF and EE)",
    examples: ["coffee", "balloon", "committee", "success"],
  },
  {
    ask: "A word with 3 letters (not one more!)",
    test: (w) => w.length === 3,
    why: "Exactly 3 letters",
    examples: ["cat", "sun", "zip", "owl"],
  },
];

// "A 5-letter word starting with B": made up fresh each time. Examples are taken from the
// categories' answers (everyday words) when any fit.
const LETTERS = "bcdfghlmprstw";
export function lengthPuzzle(rand, categories) {
  const n = 4 + Math.floor(rand() * 3); // 4, 5 or 6
  const l = LETTERS[Math.floor(rand() * LETTERS.length)];
  const examples = [];
  for (const c of Object.values(categories))
    for (const a of c.answers) {
      const w = a.show.toLowerCase();
      if (w.length === n && w[0] === l && /^[a-z]+$/.test(w) && !examples.includes(w)) examples.push(w);
    }
  // A few, picked at random so the same ones don't always show.
  for (let i = examples.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [examples[i], examples[j]] = [examples[j], examples[i]];
  }
  return {
    ask: `A ${n}-letter word starting with ${l.toUpperCase()}`,
    test: (w) => w.length === n && w[0] === l,
    why: `${n} letters, starting with ${l.toUpperCase()}`,
    examples: examples.slice(0, 4),
  };
}
