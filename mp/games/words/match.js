// Forgiving answer matching for the word games (Reef Rush's prompt bank, and the older
// categories.js lists). An answer list is a comma-separated string; "a|b|c" is one answer
// that can be typed as a, b or c (a is how it's shown). Case, spaces, dashes, apostrophes,
// accents, brackets and a leading "the"/"a"/"an" don't matter; plurals and singulars both
// count; a small typo in a longer answer is let through.

// One answer, as a plain key: lowercase letters and digits only, no accents, "&" read as
// "and", and a leading "the"/"a"/"an" dropped.
export function keyOf(s) {
  let k = String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ")
    .trim();
  k = k.replace(/^(the|a|an)\s+/, "");
  return k.replace(/[^a-z0-9]/g, "");
}

// Singular/plural guesses for a key: "cherries" -> "cherry", "boxes" -> "box", "leaves" ->
// "leaf", "peas" -> "pea"; and the other way, so "pea" also finds "peas".
export function forms(k) {
  const out = new Set([k]);
  if (k.length >= 4) {
    if (k.endsWith("ies")) out.add(k.slice(0, -3) + "y");
    if (k.endsWith("ves")) (out.add(k.slice(0, -3) + "f"), out.add(k.slice(0, -3) + "fe"));
    if (k.endsWith("es")) out.add(k.slice(0, -2));
    if (k.endsWith("s") && !k.endsWith("ss")) out.add(k.slice(0, -1));
    if (k.endsWith("i")) out.add(k.slice(0, -1) + "us"); // cacti, octopi
    out.add(k + "s");
    out.add(k + "es");
    if (k.endsWith("y")) out.add(k.slice(0, -1) + "ies");
  }
  return out;
}

// Edit distance (letters added, removed, changed or swapped), giving up past limit.
export function distance(a, b, limit) {
  const m = a.length;
  const n = b.length;
  let prev2 = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

// Words in a question that people tack onto their answer ("oak tree" for "Name a kind of
// tree", "penne pasta" for "Name a type of pasta"): tried without them if nothing matched.
const FILLER = new Set(["name", "something", "thing", "things", "that", "this", "with", "from", "kind", "type", "sort", "famous", "your", "you", "would", "could", "find", "see", "are", "can", "the", "and", "for", "not", "one", "who", "what", "has", "have", "word", "means", "might", "used", "use", "put"]);
export function extraWords(ask) {
  const out = new Set();
  for (const w of String(ask || "").toLowerCase().match(/[a-z]+/g) || []) {
    if (w.length < 3 || FILLER.has(w)) continue;
    for (const f of forms(w)) out.add(f);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

// Builds a lookup for some answer lists. lists: strings in the format above (one per group,
// e.g. Reef Rush's rarity tiers). Returns { answers: [{ show, group }], exact, loose, extra }.
// The same answer listed twice is kept once, in the first group it appears in.
export function buildIndex(lists, ask = "") {
  const answers = [];
  const exact = new Map(); // key -> answer index
  lists.forEach((list, group) => {
    for (const item of String(list || "").split(",")) {
      const names = item.split("|").map((s) => s.trim()).filter(Boolean);
      if (!names.length) continue;
      const keys = names.map(keyOf).filter(Boolean);
      if (!keys.length) continue;
      const dup = keys.find((k) => exact.has(k)) ?? keys.flatMap((k) => [...forms(k)]).find((f) => exact.has(f));
      const idx = dup !== undefined ? exact.get(dup) : answers.push({ show: names[0], group }) - 1;
      for (const k of keys) if (!exact.has(k)) exact.set(k, idx);
    }
  });
  // Plural/singular forms of every name, unless that form is some other answer's own name.
  const loose = new Map();
  for (const [k, idx] of exact) for (const f of forms(k)) if (!exact.has(f) && !loose.has(f)) loose.set(f, idx);
  return { answers, exact, loose, extra: extraWords(ask) };
}

// Which answer did they mean? Returns its index in index.answers, or -1. With fuzzy false,
// only the answer's own names (and their plurals) count: no typos, no extra words.
export function lookup(index, text, fuzzy = true) {
  const k = keyOf(text);
  if (!k) return -1;
  const near = (key) => {
    const hit = index.exact.get(key) ?? index.loose.get(key);
    if (hit !== undefined) return hit;
    for (const f of forms(key)) {
      const h = index.exact.get(f) ?? index.loose.get(f);
      if (h !== undefined) return h;
    }
    return -1;
  };
  let idx = near(k);
  if (idx >= 0 || !fuzzy) return idx;
  if (k.length < 2) return -1;
  // "Oak tree" -> "oak": a word from the question tacked on the end (or the front).
  for (const w of index.extra) {
    if (k.length - w.length < 3) continue;
    if (k.endsWith(w) && (idx = near(k.slice(0, -w.length))) >= 0) return idx;
    if (k.startsWith(w) && (idx = near(k.slice(w.length))) >= 0) return idx;
  }
  // A small typo in a longer answer: one letter off (two in long ones). Ties go to the answer
  // listed first.
  if (k.length >= 5) {
    const limit = k.length >= 9 ? 2 : 1;
    let best = limit + 1;
    for (const [key, i] of index.exact) {
      if (Math.abs(key.length - k.length) > limit || key.length < 4) continue;
      const d = distance(k, key, Math.min(limit, best));
      if (d < best || (d === best && i < idx)) (best = d), (idx = i);
    }
    if (best <= limit) return idx;
  }
  return -1;
}
