// When the public World Empire world starts. All times are New York time (the friends' own),
// daylight saving included: the first world starts Saturday, November 7, 2026 at 1:25 PM, and
// after every win the next one starts two days later (by the calendar, in New York) at 1:25 PM.
export const ZONE = "America/New_York";
export const START_HOUR = 13;
export const START_MINUTE = 25;
export const FIRST_START = Date.UTC(2026, 10, 7, 18, 25); // 1:25 PM EST = 18:25 UTC
export const DAYS_AFTER_WIN = 2;

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

// The New York calendar date and clock time of a moment.
export function nyParts(ms) {
  const o = {};
  for (const p of parts.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, min: o.minute, s: o.second };
}

// The moment it is h:min in New York on a calendar day (month 1–12). Tries both offsets New
// York uses (-5 and -4 hours) and keeps the one that reads back right.
export function nyTime(y, m, d, h, min) {
  for (const off of [5, 4]) {
    const ms = Date.UTC(y, m - 1, d, h + off, min);
    const p = nyParts(ms);
    if (p.h === h && p.min === min && p.d === new Date(Date.UTC(y, m - 1, d)).getUTCDate()) return ms;
  }
  // A clock time that doesn't exist that day (the spring-forward hour): an hour later.
  return Date.UTC(y, m - 1, d, h + 4, min);
}

// The next public world after a win at `wonAt`: the calendar day two days later, 1:25 PM.
export function nextStartAfterWin(wonAt) {
  const p = nyParts(wonAt);
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d + DAYS_AFTER_WIN));
  return nyTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), START_HOUR, START_MINUTE);
}
