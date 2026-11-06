// Reef Rush's prompt bank: "Name a ..." prompts and, for each, every answer we accept, sorted
// into five rarity tiers from the answer almost everyone gives to the one nobody expects.
// A valid answer scores its tier's points (decided here, ahead of time, from how familiar
// the answer is, not from what other players said).
//
// The prompts live in bank/*.js, one file per group of topics. Each prompt is
//   { id: "dog-breed", ask: "Name a dog breed", topic: "animals",
//     tiers: ["Common answers", "Uncommon", "Rare", "Very rare", "Legendary"] }
// and each tier is one comma-separated string of answers. "Golden retriever|golden|goldie"
// is one answer that can also be typed "golden" or "goldie" (the first name is the one
// shown). Matching is forgiving (words/match.js): case, spaces, dashes, apostrophes, accents
// and a leading "the" don't matter, plurals and singulars both count, a small typo in a
// longer answer is fine, and a word from the question tacked on ("oak tree") is ignored.
import animals from "./bank/animals.js";
import food from "./bank/food.js";
import places from "./bank/places.js";
import mixed from "./bank/mixed.js";
import { buildIndex, lookup } from "../words/match.js";
import { rude } from "./clean.js";

// The five tiers, shallow to deep: what each is called and what it scores.
export const TIERS = [
  { name: "Shallows", pts: 10 },
  { name: "Reef", pts: 30 },
  { name: "Open Sea", pts: 60 },
  { name: "Twilight", pts: 85 },
  { name: "Abyss", pts: 100 },
];

export const TOPICS = ["animals", "nature", "food", "home", "places", "people", "culture", "sports", "school", "tech", "words", "things"];

export const PROMPTS = [...animals, ...food, ...places, ...mixed];
export const BY_ID = new Map(PROMPTS.map((p) => [p.id, p]));

// Answer lookups are built the first time a prompt is played and a few dozen are kept, so
// the whole bank never has to sit in memory as lookup tables.
const built = new Map();
const KEEP = 48;
function indexOf(p) {
  let ix = built.get(p.id);
  if (ix) {
    built.delete(p.id);
    built.set(p.id, ix); // most recently used last
    return ix;
  }
  ix = buildIndex(p.tiers, p.ask);
  built.set(p.id, ix);
  if (built.size > KEEP) built.delete(built.keys().next().value);
  return ix;
}

// What did they mean? Returns { idx, show, tier (0-4), pts }, { rude: true } for words we
// don't take (unless that's exactly a real answer, like "Cock-a-doodle-doo"), or null.
export function check(promptId, text) {
  const p = BY_ID.get(promptId);
  if (!p) return null;
  const ix = indexOf(p);
  let idx = lookup(ix, text, false);
  if (idx < 0 && rude(text)) return { rude: true };
  if (idx < 0) idx = lookup(ix, text);
  if (idx < 0) return null;
  const a = ix.answers[idx];
  return { idx, show: a.show, tier: a.group, pts: TIERS[a.group].pts };
}

// Some answers from the deepest tiers that nobody gave (said: answer indexes), to show
// after a prompt what else would have scored big.
export function deepFinds(promptId, said, n = 4, rnd = Math.random) {
  const p = BY_ID.get(promptId);
  if (!p) return [];
  const ix = indexOf(p);
  const pick = (tier) => {
    const list = ix.answers.map((a, i) => (a.group === tier && !said.has(i) ? i : -1)).filter((i) => i >= 0);
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const out = [...pick(4).slice(0, Math.ceil(n / 2)), ...pick(3)].slice(0, n);
  if (out.length < n) out.push(...pick(4).filter((i) => !out.includes(i)).slice(0, n - out.length));
  return out.map((i) => ({ show: ix.answers[i].show, tier: ix.answers[i].group }));
}
