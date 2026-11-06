// Reef Rush's daily set: the same 7 prompts for every member on a given day (New York
// time), one scored try each, and today's scores for the members' daily board.
//
// The prompts come from the date alone: the bank is shuffled once per "cycle" (as many days
// as it takes to use every prompt once) and each day takes the next 7, so a prompt doesn't
// come back for about three weeks. Scores are kept on the member's own site with the same
// save calls World Empire uses (world-get / world-put), one small record per site and day.
// If the site can't be reached the day still works from memory (a try still counts once
// while this server runs) and the save is tried again later.

export const ZONE = "America/New_York";
export const DAILY_COUNT = 7;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
// "2026-11-05" for the day it is now in New York.
export const today = (now = Date.now()) => dayFmt.format(new Date(now));

// Small seeded random numbers (mulberry32), so a date always gives the same prompts.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function seeded(seed) {
  let a = typeof seed === "number" ? seed : hash(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(list, rnd = Math.random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// The bank's order for a cycle. Each cycle reshuffles the previous order within its first and
// its second half, so a prompt used near the end of one cycle is used late in the next one too
// (never sooner than about a third of a cycle later).
function cycleOrder(sorted, cycle) {
  let order = shuffle([...sorted], seeded("reef-rush-daily-0"));
  for (let c = 1; c <= cycle; c++) {
    const half = Math.floor(order.length / 2);
    const rnd = seeded(`reef-rush-daily-${c}`);
    order = [...shuffle(order.slice(0, half), rnd), ...shuffle(order.slice(half), rnd)];
  }
  return order;
}

// The prompt ids for a date. ids: every prompt id in the bank (any order).
let memo = { key: "", ids: [] };
export function dailyIds(date, ids, n = DAILY_COUNT) {
  const key = `${date}|${ids.length}|${n}`;
  if (memo.key === key) return [...memo.ids];
  const sorted = [...ids].sort();
  const [y, m, d] = date.split("-").map(Number);
  const day = Math.max(0, Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86_400_000));
  const perCycle = Math.max(1, Math.floor(sorted.length / n));
  const order = cycleOrder(sorted, Math.floor(day / perCycle));
  const slot = day % perCycle;
  memo = { key, ids: order.slice(slot * n, slot * n + n) };
  return [...memo.ids];
}

/* ------------------------------------------------------------ today's scores */
// site|date -> Day. Only today's (and a late-finishing yesterday's) are kept.
const days = new Map();
const RETRY_MS = 60_000;

const saveId = (site, date) => `rr-daily-${String(site).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 16)}-${date}`;

class Day {
  constructor(site, date, call) {
    this.site = site;
    this.date = date;
    this.call = call; // (site, op, data) -> Promise: the signed site call
    this.entries = new Map(); // uid -> { n: name, s: score, t: [tier per prompt, -1 none], d: finished, at }
    this.loaded = false; // the saved record was read (or there was none)
    this.loading = null;
    this.retryAt = 0;
    this.saveOk = null; // null: nothing saved yet, true: saved, false: the last try failed
    this.saveTimer = null;
    this.saving = false;
  }
  get id() {
    return saveId(this.site, this.date);
  }
  // Reads the saved record (once; again a minute after a failure). Resolves true if loaded.
  ensure() {
    if (this.loaded) return Promise.resolve(true);
    if (this.loading) return this.loading;
    if (Date.now() < this.retryAt) return Promise.resolve(false);
    this.loading = Promise.resolve()
      .then(() => this.call(this.site, "world-get", { id: this.id }))
      .then((res) => {
        if (res && typeof res.data === "string" && res.data) {
          const saved = JSON.parse(res.data);
          for (const [uid, e] of Object.entries(saved.entries || {})) this.merge(uid, e);
        }
        this.loaded = true;
        // Tries made while the site was out of reach get saved now.
        if (this.entries.size) this.saveSoon(500);
        return true;
      })
      .catch((err) => {
        console.log(`reef-rush: can't read the daily scores of ${this.site} (${this.date}):`, err.message);
        this.retryAt = Date.now() + RETRY_MS;
        return false;
      })
      .finally(() => (this.loading = null));
    return this.loading;
  }
  // Waits for the saved record, but not longer than ms.
  ready(ms) {
    return Promise.race([this.ensure(), new Promise((r) => setTimeout(() => r(false), ms).unref?.())]);
  }
  // Keeps the further-along of two records for the same member.
  merge(uid, e) {
    if (!e || typeof e !== "object") return;
    const clean = { n: String(e.n || "Someone").slice(0, 24), s: Math.max(0, Math.round(Number(e.s) || 0)), t: Array.isArray(e.t) ? e.t.slice(0, 20).map((x) => (x >= 0 && x <= 4 ? x | 0 : -1)) : [], d: !!e.d, at: Number(e.at) || Date.now() };
    const have = this.entries.get(uid);
    if (!have || (clean.d && !have.d) || (clean.d === have.d && clean.t.length > have.t.length)) this.entries.set(uid, clean);
  }
  has(uid) {
    return this.entries.has(uid);
  }
  // A member's scored try starts: from now on today is used up for them.
  start(uid, name) {
    if (this.entries.has(uid)) return false;
    this.entries.set(uid, { n: String(name || "Someone").slice(0, 24), s: 0, t: [], d: false, at: Date.now() });
    this.saveSoon();
    return true;
  }
  // Their score so far (after every prompt, so leaving halfway keeps what they had).
  score(uid, s, tiers, done) {
    const e = this.entries.get(uid);
    if (!e) return;
    e.s = s;
    e.t = tiers.slice(0, 20);
    if (done) e.d = true;
    this.saveSoon(done ? 300 : 4000);
  }
  // Today's board, best first; equal scores share a place.
  board(limit = 50) {
    const list = [...this.entries].map(([uid, e]) => ({ uid, name: e.n, score: e.s, tiers: e.t, done: e.d })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    let place = 0;
    list.forEach((r, i) => (r.place = i && r.score === list[i - 1].score ? place : (place = i + 1)));
    return list.slice(0, limit);
  }
  saveSoon(ms = 3000) {
    // A save already on its way stays, unless this one is wanted sooner.
    if (this.saveTimer && this.saveAt <= Date.now() + ms) return;
    clearTimeout(this.saveTimer);
    this.saveAt = Date.now() + ms;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, ms);
    this.saveTimer.unref?.();
  }
  async save() {
    if (this.saving) return this.saveSoon(2000);
    // Never write over a record we haven't read: the site may already have today's scores.
    if (!this.loaded && !(await this.ensure())) {
      this.saveOk = false;
      return this.saveSoon(RETRY_MS);
    }
    this.saving = true;
    const data = JSON.stringify({ v: 1, date: this.date, entries: Object.fromEntries(this.entries) });
    try {
      await this.call(this.site, "world-put", { id: this.id, data });
      this.saveOk = true;
    } catch (err) {
      console.log(`reef-rush: saving the daily scores of ${this.site} (${this.date}) failed:`, err.message);
      this.saveOk = false;
      this.saveSoon(RETRY_MS / 2);
    } finally {
      this.saving = false;
    }
  }
}

// The scores of one site's day (created, and its save read, on first use).
export function dayFor(site, date, call) {
  const key = `${site}|${date}`;
  let d = days.get(key);
  if (!d) {
    d = new Day(site, date, call);
    days.set(key, d);
    // Forget days older than yesterday (a game that started before midnight may still finish).
    const [y, m, dd] = date.split("-").map(Number);
    const yesterday = new Date(Date.UTC(y, m - 1, dd) - 86_400_000).toISOString().slice(0, 10);
    for (const [k, old] of days) if (old.date < yesterday && !old.saveTimer && !old.saving) days.delete(k);
  }
  d.call = call || d.call;
  d.ensure();
  return d;
}

// The server is stopping: saves that were waiting go now.
export function flushDays() {
  const out = [];
  for (const d of days.values())
    if (d.saveTimer) {
      clearTimeout(d.saveTimer);
      d.saveTimer = null;
      out.push(d.save());
    }
  return Promise.all(out);
}

// For the tests: forget everything in memory (as if this server had restarted).
export function _forget() {
  for (const d of days.values()) clearTimeout(d.saveTimer);
  days.clear();
}
