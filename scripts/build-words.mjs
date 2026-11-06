// Builds mp/games/words/english.txt.gz, the dictionary Word Bomb (and the other word games)
// check words against. Run by hand when the sources change:
//   node scripts/build-words.mjs <word-list words.txt> <dwyl words_alpha.txt> <wordlist-english package dir>
// Sources (all free licences):
//   - "word-list" npm package (MIT): ~274,000 Scrabble-style words, every length.
//   - dwyl/english-words words_alpha.txt (Unlicense): ~370,000 words including names of
//     places, days, months, languages and apostrophe-less contractions ("dont", "isnt"). It also
//     holds lots of abbreviations ("cwt", "hcl"), so only its words of 4+ letters that have a
//     vowel are taken.
//   - "wordlist-english" npm package (MIT, from SCOWL): adds words like "google".
//   - EXTRA below: everyday words none of them have (slang, brands, games, abbreviations).
// 1-letter words: only a, i and o. 2- and 3-letter words: word-list + SCOWL + EXTRA (dwyl's short
// ones are mostly abbreviations). Output: lowercase a-z words, one per line, sorted, unique.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { EXTRA } from "../mp/games/words/extra.js";

const [wordListTxt, dwylTxt, scowlDir] = process.argv.slice(2);
if (!scowlDir) throw new Error("usage: build-words.mjs <word-list words.txt> <words_alpha.txt> <wordlist-english dir>");
const plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ok = (w) => /^[a-z]+$/.test(w) && w.length <= 40;
const words = new Set(["a", "i", "o"]);
const lines = (f) => readFileSync(f, "utf8").split(/\r?\n/);

for (const w of lines(wordListTxt)) if (ok(w) && w.length >= 2) words.add(w);
for (const raw of lines(dwylTxt)) {
  const w = raw.trim();
  if (ok(w) && w.length >= 4 && /[aeiouy]/.test(w)) words.add(w);
}
for (const f of readdirSync(scowlDir).filter((f) => /-words-\d+\.json$/.test(f)))
  for (const raw of JSON.parse(readFileSync(join(scowlDir, f), "utf8"))) {
    if (/[^A-Za-zÀ-ÿ]/.test(raw)) continue; // apostrophes, hyphens
    if (raw.length <= 3 && raw !== raw.toLowerCase()) continue; // "OKs", "Woop": abbreviations
    const w = plain(raw);
    if (ok(w) && w.length >= 2) words.add(w);
  }
for (const w of EXTRA) if (ok(w)) words.add(w);

const sorted = [...words].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const out = new URL("../mp/games/words/english.txt.gz", import.meta.url);
writeFileSync(out, gzipSync(sorted.join("\n"), { level: 9 }));
const by = (n) => sorted.filter((w) => w.length === n).length;
console.log(`${sorted.length} words (1: ${by(1)}, 2: ${by(2)}, 3: ${by(3)}) -> ${out.pathname}`);
