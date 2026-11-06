// The English dictionary that Word Bomb and the other word games check words against:
// words/english.txt.gz, ~450,000 lowercase words, one per line, sorted (made by
// scripts/build-words.mjs from three free word lists plus words/extra.js: Scrabble words,
// names of places, days and languages, contractions typed without the apostrophe, slang,
// brands and games). Words of every length are in it, but only real ones: a, i and o, the
// 2-letter Scrabble words plus "ok", and so on.
//
// It's loaded the first time a game asks, and only once for the whole server. A Set of all
// those words would cost about 35 MB of heap, which is a lot on a 512 MB server shared with
// the proxy. So instead the file stays in memory as one plain string (~4.5 MB) with a table
// of where each word starts (~1.8 MB), and a lookup is a binary search through that table:
// about 19 short comparisons, nothing to notice.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const FILE = new URL("./english.txt.gz", import.meta.url);

let text = null; // the whole file
let starts = null; // where each word starts in it, in alphabetical order
let lens = null; // and how long it is
let count = 0;
let odd = null; // any words the file lists out of order (looked up in a Set instead)

export function loadWords() {
  if (text) return;
  const t0 = Date.now();
  // latin1: every byte is one character, so the string stays one byte per letter.
  text = gunzipSync(readFileSync(FILE)).toString("latin1");
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  starts = new Uint32Array(n);
  lens = new Uint8Array(n);
  odd = new Set();
  let i = 0;
  let prevStart = -1;
  let prevLen = 0;
  while (i < text.length) {
    let j = text.indexOf("\n", i);
    if (j < 0) j = text.length;
    const len = j - i;
    if (len > 0 && len < 40) {
      if (prevStart >= 0 && compareAt(prevStart, prevLen, text, i, len) >= 0) odd.add(text.slice(i, j));
      else {
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
  if (typeof w !== "string" || !w.length) return false;
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
