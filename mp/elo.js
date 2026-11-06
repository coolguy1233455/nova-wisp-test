// Elo ratings for ranked matches. A match ends with sides (a player alone in a free-for-all,
// a team otherwise) and their places, ties allowed. Every pair of sides is one game between
// them, scored 1, ½ or 0, each side playing at its members' average rating; a side's change
// is shared out whole to each of its members. K is split across the opponents, so a
// five-player free-for-all moves a rating about as much as a 1v1 does.
//
// Everyone starts at 0 and a rating never goes below 0 (the owner's rule, 2026-11-05: someone
// who has only ever lost has earned nothing, so they show 0, not 984). The math is ordinary
// Elo, which only looks at the gap between two ratings, so starting at 0 changes nothing else.
export const START = 0;
export const FLOOR = 0;
const K = 32;

// sides: [{ uids: [...], place: 1 }, ...]; rating(uid) -> current rating.
// Returns { uid: change } (whole numbers).
export function eloChanges(sides, rating) {
  const avg = sides.map((s) => s.uids.reduce((a, u) => a + rating(u), 0) / Math.max(1, s.uids.length));
  const out = {};
  const k = K / Math.max(1, sides.length - 1);
  sides.forEach((s, i) => {
    let d = 0;
    sides.forEach((o, j) => {
      if (i === j) return;
      const expected = 1 / (1 + 10 ** ((avg[j] - avg[i]) / 400));
      const score = s.place < o.place ? 1 : s.place === o.place ? 0.5 : 0;
      d += k * (score - expected);
    });
    for (const u of s.uids) out[u] = Math.round(d);
  });
  return out;
}
