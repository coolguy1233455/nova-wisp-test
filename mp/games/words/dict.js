// The English dictionary that Word Bomb and Reef Rush check words against: the "word-list"
// npm package (MIT, ~274,000 lowercase words, one per line, in alphabetical order).
//
// It's loaded the first time a game asks, and only once for the whole server. A Set of all
// those words would cost about 20 MB of heap (and ~55 MB of RSS while it's built), which is
// a lot on a 512 MB server shared with the proxy. So instead the file stays in memory as
// one plain string (~2.7 MB) with a table of where each word starts (~1.4 MB), and a lookup
// is a binary search through that table: about 18 short comparisons, nothing to notice.
import { readFileSync } from "node:fs";
import wordListPath from "word-list";

// A few everyday words the list is missing (it predates them).
const EXTRA = ["emoji", "emojis", "selfie", "selfies", "wifi", "gifs", "livestream", "livestreams", "livestreamed", "livestreaming", "youtuber", "youtubers", "unfollow", "unfollowed", "hashtagged"];

let text = null; // the whole file
let starts = null; // where each kept word starts in it, in alphabetical order
let lens = null; // and how long it is
let count = 0;
let odd = null; // the few words the file lists out of order (looked up in a Set instead)

export function loadWords() {
  if (text) return;
  const t0 = Date.now();
  // latin1: every byte is one character, so the string stays one byte per letter.
  text = readFileSync(wordListPath, "latin1");
  starts = new Uint32Array(300_000);
  lens = new Uint8Array(300_000);
  odd = new Set(EXTRA);
  let i = 0;
  let prevStart = -1;
  let prevLen = 0;
  while (i < text.length) {
    let j = text.indexOf("\n", i);
    if (j < 0) j = text.length;
    const len = j - i;
    // Keep words of 3+ plain letters (a-z), the only ones either game accepts.
    let plain = len >= 3 && len < 40;
    for (let k = i; plain && k < j; k++) {
      const c = text.charCodeAt(k);
      if (c < 97 || c > 122) plain = false;
    }
    if (plain) {
      if (prevStart >= 0 && compareAt(prevStart, prevLen, text, i, len) >= 0) odd.add(text.slice(i, j));
      else if (count < starts.length) {
        starts[count] = i;
        lens[count] = len;
        count++;
        prevStart = i;
        prevLen = len;
      }
    }
    i = j + 1;
  }
  console.log(`mp: dictionary loaded, ${count + odd.size} words in ${Date.now() - t0} ms`);
}

// Compares the word at [aStart, aStart+aLen) of text with the one at [bStart, ...) of str.
function compareAt(aStart, aLen, str, bStart, bLen) {
  const n = Math.min(aLen, bLen);
  for (let k = 0; k < n; k++) {
    const d = text.charCodeAt(aStart + k) - str.charCodeAt(bStart + k);
    if (d) return d;
  }
  return aLen - bLen;
}

// Is w (already lowercase a-z) an English word?
export function isWord(w) {
  if (typeof w !== "string" || w.length < 3) return false;
  loadWords();
  if (odd.has(w)) return true;
  let lo = 0;
  let hi = count - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const d = compareAt(starts[mid], lens[mid], w, 0, w.length);
    if (d === 0) return true;
    if (d < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

// Every word, one at a time (for tests and for checking prompts have enough answers).
export function* allWords() {
  loadWords();
  for (let i = 0; i < count; i++) yield text.substr(starts[i], lens[i]);
  yield* odd;
}

// What someone typed, as a plain lowercase word: accents dropped (é -> e), anything that
// isn't a letter removed.
export function plainWord(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}
