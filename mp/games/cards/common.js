// Things every card game in Card Games (../cards.js) shares: decks, shuffling, card names
// and the turn clock.
//
// A card is a short string: its rank as a number, then one letter for its suit.
//   French deck (poker, spit, crazy eights, go fish, war): ranks 1-13 (1 = ace, 11 = jack,
//   12 = queen, 13 = king), suits s h d c (spades, hearts, diamonds, clubs). "1s" = ace of spades.
//   Italian deck (scopa): ranks 1-10 (8 = fante, 9 = cavallo, 10 = re), suits d c s b
//   (denari = coins, coppe = cups, spade = swords, bastoni = clubs). "7d" = the settebello.
// One deck never holds the same card twice, so a card's string is also its id.
import { randomInt } from "node:crypto";

export const FRENCH_SUITS = ["s", "h", "d", "c"];
export const ITALIAN_SUITS = ["d", "c", "s", "b"];

export const rankOf = (c) => parseInt(c, 10);
export const suitOf = (c) => c[c.length - 1];

export function frenchDeck() {
  const d = [];
  for (const s of FRENCH_SUITS) for (let r = 1; r <= 13; r++) d.push(r + s);
  return d;
}
export function italianDeck() {
  const d = [];
  for (const s of ITALIAN_SUITS) for (let r = 1; r <= 10; r++) d.push(r + s);
  return d;
}

// Fisher-Yates with the crypto generator, so nobody can guess the next deal.
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const pick = (a) => a[randomInt(a.length)];

const FRENCH_NAMES = { 1: "Ace", 11: "Jack", 12: "Queen", 13: "King" };
const SUIT_NAMES = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
export const rankName = (r, plural = false) => {
  const n = FRENCH_NAMES[r] || String(r);
  return plural ? (r === 6 ? "6s" : `${n}s`) : n;
};
export const cardName = (c) => `${rankName(rankOf(c))} of ${SUIT_NAMES[suitOf(c)]}`;

// The turn clock: a deadline the game's tick() checks. Players who dropped their connection get
// a much shorter clock so the others aren't kept waiting while the server waits for them to
// come back.
export function startClock(g, ms) {
  g.clockMs = ms;
  g.clockAt = Date.now();
  g.deadline = Date.now() + ms;
}
export const stopClock = (g) => {
  g.deadline = 0;
};
export const timeLeft = (g) => (g.deadline ? Math.max(0, g.deadline - Date.now()) : 0);
// True when the player whose turn it is has run out of time.
export function clockDone(room, g, uid, awayMs = 6000) {
  if (!g.deadline) return false;
  const now = Date.now();
  if (now >= g.deadline) return true;
  const p = room.players.find((x) => x.uid === uid);
  return !!p && (p.left || !p.connected) && now - g.clockAt >= awayMs;
}

// A short public history ("Amy called 40"), newest last.
export function log(g, text) {
  g.log.push(text);
  if (g.log.length > 30) g.log.shift();
}

export const nameOf = (room, uid) => room.players.find((p) => p.uid === uid)?.name || "Someone";
