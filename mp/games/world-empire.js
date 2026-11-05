// World Empire: everybody starts with a tiny kingdom on a world map of continents and islands
// and grows it into an empire, until one empire owns every piece of land. Not ranked.
//
// The world: a grid of tiles (mp/games/we/map.js). Each land tile belongs to an empire or to
// nobody. Gold pays for everything: an attack spends a share of your gold (5% unless you move
// the bar) and spreads tile by tile from your border into the land you clicked; each tile
// costs strength (more for forests and hills, much more for land someone defends, and more
// still if their people are many and happy), and when the strength runs out or there's
// nothing left to take, the attack ends (leftover strength is lost). Ports send ships across
// the sea that land on the coast you clicked and attack from there. Cities make gold and can
// be upgraded; a city is a banner on one tile, and if an enemy takes that tile the city is gone.
//
// Gold comes from taxes: people × tax rate, minus the people who refuse to pay when the tax is
// high. People fill your land up to 40 a tile, faster when they're happy (low taxes); high
// taxes make them unhappy and they move away. Happy, crowded, big empires defend better.
// Allies can't attack each other, can send each other gold, and can ask each other for gold
// or for help (the ally's screen flashes, and one click sends a ship or an attack at the enemy).
// An empire whose last tile is taken is out of that world for good. Players who go offline
// keep their empire: it keeps earning and defends itself as usual.
//
// Two kinds of worlds:
// - The public world, one per site, hosted by nobody (boot() makes it). It has a schedule:
//   sign up before it starts (the first one starts Saturday, November 7, 2026 at 1:25 PM New
//   York time), everyone signed up gets a tiny piece of land at the start, and people who
//   didn't sign up can watch or join later if there's free land. When someone wins, the
//   winner is shown, sign-ups open again and the next world starts two days after the win at
//   1:25 PM. It never ends as a party (the room stays "playing"); it's saved on the site about
//   once a minute and when the server stops.
// - Hosted worlds (Host a party / Find a game): no player limit unless the host sets one,
//   people can join while it's running (they get a tiny spot in free land), and it ends when
//   one empire owns 100% of the land (every land tile).
//
// Networking: the map itself never goes in view(). A player's screen asks for the whole map
// once (we:snap), then gets the changed tiles about four times a second (we:tick, broadcast
// once for everyone). view() only carries each player's own numbers.
import { makeMap, packTerrain, PLAINS, MAP_GEN } from "./we/map.js";
import { FIRST_START, ZONE, nextStartAfterWin } from "./we/time.js";

const ID = "world-empire";
const SAVE_ID = "we-public";

/* ------------------------------------------------------------ numbers */
const POP_PER_TILE = 40; // people a tile can hold
const TAX_YIELD = 0.02; // gold a second per person per 100% of tax (before refusals)
const TAX_MAX = 60;
const START_TAX = 15;
const START_GOLD = 500;
const START_RADIUS = 2.6; // a starting kingdom: about 21 tiles
const GROWTH = 0.04; // how fast people fill empty land (share of the gap a second, at mood 0.75)
const LEAVING = 0.015; // share of people leaving a second when everyone is furious
const NEUTRAL_COST = 3; // gold to take a tile of plains nobody owns
const ENEMY_COST = 4; // the same for someone's tile, before their defense
const TERRAIN_COST = [0, 0, 1, 1.4, 2]; // by terrain: plains, forest, hills
const CITY_COST = 300; // first city; each one after costs 1.6× the last
const CITY_GROWTH = 1.6;
const CITY_UPGRADE = 250; // level 1→2 costs 500, then 1000, 2000, 4000
const CITY_MAX = 5;
const CITY_GAP = 5; // tiles between two of your cities
const PORT_COST = 350; // first port; each one after costs 1.5× the last
const PORT_GROWTH = 1.5;
const PORT_GAP = 4;
const SHIP_SPEED = 12; // tiles a second
const MAX_ATTACKS = 12; // attacks (and landed ships) going at once, each
const GOLD_CAP_SECONDS = 300; // the treasury holds 5 minutes of income (at least 3000)
const PING_LIFE = 45_000;
const ATTACK_SECONDS = 2.5; // a typical attack spreads over this long
const SHIFT = 131072; // tile numbers fit in 17 bits (the large map has 114,400 tiles)

const PALETTE = [
  "#ef4444", "#3b82f6", "#facc15", "#a855f7", "#f97316", "#22d3ee", "#ec4899", "#a3e635",
  "#f5f5f4", "#6366f1", "#14b8a6", "#fb7185", "#b45309", "#38bdf8", "#d946ef", "#eab308",
  "#8b5cf6", "#10b981", "#f43f5e", "#0ea5e9", "#fdba74", "#c084fc", "#65a30d", "#94a3b8",
];

let clock = () => Date.now(); // replaced in tests

// Local testing only: a game server the site doesn't trust can't read or save the public
// world. WE_TEST_OFFLINE=1 plays it anyway without saving; WE_TEST_START=<seconds> makes a new
// public world start that long after this server starts (instead of November 7).
const TEST_OFFLINE = !!process.env.WE_TEST_OFFLINE;
const TEST_START = process.env.WE_TEST_START ? Date.now() + Number(process.env.WE_TEST_START) * 1000 : 0;

/* ------------------------------------------------------------ small helpers */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN);

function heapPush(h, v) {
  let i = h.length;
  h.push(v);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p] <= v) break;
    h[i] = h[p];
    i = p;
  }
  h[i] = v;
}
function heapPop(h) {
  const top = h[0];
  const last = h.pop();
  const n = h.length;
  if (n) {
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && h[c + 1] < h[c]) c++;
      if (h[c] >= last) break;
      h[i] = h[c];
      i = c;
    }
    h[i] = last;
  }
  return top;
}

// Owner runs for saving and for the whole-map snapshot: [owner, length, owner, length, ...].
function rle(arr) {
  const out = [];
  for (let i = 0; i < arr.length; ) {
    const v = arr[i];
    let j = i + 1;
    while (j < arr.length && arr[j] === v) j++;
    out.push(v, j - i);
    i = j;
  }
  return out;
}
function unrle(runs, n) {
  const arr = new Uint16Array(n);
  let i = 0;
  for (let k = 0; k + 1 < runs.length && i < n; k += 2) {
    const v = runs[k] | 0;
    const len = Math.min(runs[k + 1] | 0, n - i);
    if (v) arr.fill(v, i, i + len);
    i += len;
  }
  return arr;
}

/* ------------------------------------------------------------ the world */
function blankState(pub) {
  return {
    pub,
    phase: "running", // public world: signup | running (a won world goes back to signup)
    startAt: pub ? FIRST_START : 0,
    signups: new Map(), // uid -> { uid, name, at }
    winner: null, // { uid, name, color, at }
    roundNo: 1,
    map: null,
    mapId: "",
    owner: null,
    coast: null,
    empires: [null], // by id (0 = nobody)
    byUid: new Map(),
    eliminated: new Set(),
    buildings: new Map(), // tile -> { k: 1 city | 2 port, lvl, o }
    attacks: [],
    ships: [],
    nextAttack: 1,
    nextShip: 1,
    seq: 0,
    changed: [],
    dirty: null,
    bChanges: [],
    shipNew: [],
    shipGone: [],
    fx: [],
    dead: [],
    rosterDirty: true,
    clocks: { flush: 0, view: 0, slow: 0, boxes: 0 },
    viewSoon: false,
    unsaved: false,
    savedAt: 0,
  };
}

// A new map (no owners yet) for the next round.
function setMap(g, map) {
  const n = map.w * map.h;
  g.map = map;
  g.mapId = `${map.size}-${map.seed}-${(Math.random() * 1e6) | 0}`;
  g.owner = new Uint16Array(n);
  g.dirty = new Uint8Array(n);
  g.coast = new Uint8Array(n);
  const { w, terrain: t } = map;
  for (let i = 0; i < n; i++) {
    if (t[i] < PLAINS) continue;
    const x = i % w;
    if ((x > 0 && t[i - 1] < PLAINS) || (x < w - 1 && t[i + 1] < PLAINS) || (i >= w && t[i - w] < PLAINS) || (i < n - w && t[i + w] < PLAINS)) g.coast[i] = 1;
  }
  g.packed = packTerrain(t);
  g.empires = [null];
  g.byUid = new Map();
  g.eliminated = new Set();
  g.buildings = new Map();
  g.attacks = [];
  g.ships = [];
  g.changed = [];
  g.bChanges = [];
  g.shipNew = [];
  g.shipGone = [];
  g.fx = [];
  g.dead = [];
  g.rosterDirty = true;
}

const isLand = (g, t) => g.map.terrain[t] >= PLAINS;

// Does tile t touch (side by side) land of empire id?
function touches(g, t, id) {
  const { w } = g.map;
  const o = g.owner;
  const x = t % w;
  return (x > 0 && o[t - 1] === id) || (x < w - 1 && o[t + 1] === id) || (t >= w && o[t - w] === id) || (t < o.length - w && o[t + w] === id);
}

// Gives tile t to `to` (0 = nobody): counts, the land the old owner loses its people with, a
// city or port on it is destroyed, and the tile goes out with the next tick.
function setOwner(g, t, to, by = to) {
  const from = g.owner[t];
  if (from === to) return;
  g.owner[t] = to;
  if (from) {
    const e = g.empires[from];
    e.pop -= e.pop / Math.max(1, e.tiles);
    e.tiles--;
    if (by && by !== from) e.hitBy.set(by, clock());
    if (e.tiles <= 0) g.dead.push([from, by]);
  }
  if (to) {
    const e = g.empires[to];
    e.tiles++;
    const { w } = g.map;
    const x = t % w;
    const y = (t - x) / w;
    const b = e.box;
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
  const bld = g.buildings.get(t);
  if (bld && bld.o !== to) removeBuilding(g, t, true);
  if (!g.dirty[t]) {
    g.dirty[t] = 1;
    g.changed.push(t);
  }
}

function removeBuilding(g, t, lost) {
  const b = g.buildings.get(t);
  if (!b) return;
  g.buildings.delete(t);
  const e = g.empires[b.o];
  if (e) {
    if (b.k === 1) {
      e.cities--;
      e.cityLv -= b.lvl;
    } else e.ports--;
  }
  g.bChanges.push([t, 0, 0, 0]);
  if (lost) g.fx.push({ k: b.k === 1 ? "city-lost" : "port-lost", t, o: b.o });
}

// Every empire's bounding box again (they only ever grow between these).
function recomputeBoxes(g) {
  const { w } = g.map;
  for (const e of g.empires) if (e) e.box = [1e9, 1e9, -1, -1];
  const o = g.owner;
  for (let i = 0; i < o.length; i++) {
    const id = o[i];
    if (!id) continue;
    const b = g.empires[id].box;
    const x = i % w;
    const y = (i - x) / w;
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
}

function pickColor(g) {
  const used = new Set(g.empires.filter((e) => e?.alive).map((e) => e.color));
  const free = PALETTE.find((c) => !used.has(c));
  if (free) return free;
  // More empires than colors: walk the color wheel by the golden angle.
  const hue = (g.empires.length * 137.508) % 360;
  return hsl(hue, 70, 58);
}
function hsl(h, s, l) {
  s /= 100;
  l /= 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function newEmpire(g, uid, name) {
  const e = {
    id: g.empires.length,
    uid,
    name: String(name || "Player").slice(0, 24),
    color: pickColor(g),
    alive: true,
    tiles: 0,
    gold: START_GOLD,
    pop: 0,
    tax: START_TAX,
    mood: 0.5,
    inc: 0,
    taxInc: 0,
    cityInc: 0,
    cities: 0,
    cityLv: 0,
    ports: 0,
    allies: new Set(),
    asked: new Set(), // ally requests this empire sent
    reqs: new Set(), // ally requests waiting for this empire's answer
    pings: [], // { pid, from, k: "money" | "help", enemy, at }
    pingSent: new Map(), // "id:k" -> when (so nobody can spam)
    hitBy: new Map(), // empire id -> when it last took a tile of ours
    home: -1,
    box: [1e9, 1e9, -1, -1],
    nextAttack: 0,
    nextShip: 0,
    joinedAt: clock(),
  };
  g.empires.push(e);
  g.byUid.set(uid, e);
  g.rosterDirty = true;
  return e;
}

// How far (in tiles, up to `max`) the nearest owned tile is from tile t.
function freeRadius(g, t, max) {
  const { w, h } = g.map;
  const x0 = t % w;
  const y0 = (t - x0) / w;
  const o = g.owner;
  if (o[t]) return 0;
  for (let r = 1; r <= max; r++) {
    for (let k = -r; k <= r; k++) {
      const pts = [
        [x0 + k, y0 - r],
        [x0 + k, y0 + r],
        [x0 - r, y0 + k],
        [x0 + r, y0 + k],
      ];
      for (const [x, y] of pts) if (x >= 0 && y >= 0 && x < w && y < h && o[y * w + x]) return r;
    }
  }
  return max + 1;
}

// A good free spot for a new kingdom: unowned land with room around it, as far as possible
// from everyone else. Returns a tile or -1 when there's no free land left with room.
function findSpot(g, homes) {
  const { w, h, terrain } = g.map;
  const n = w * h;
  let best = -1;
  let bestScore = -1;
  for (let k = 0; k < 260; k++) {
    const t = (Math.random() * n) | 0;
    if (terrain[t] < PLAINS || g.owner[t]) continue;
    const x = t % w;
    const y = (t - x) / w;
    let room = 0;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || dx * dx + dy * dy > START_RADIUS * START_RADIUS) continue;
        const i = yy * w + xx;
        if (terrain[i] >= PLAINS && !g.owner[i]) room++;
      }
    if (room < 12) continue;
    const free = freeRadius(g, t, 18);
    if (free < 5) continue;
    let far = 1e9;
    for (const hm of homes) {
      const hx = hm % w;
      const hy = (hm - hx) / w;
      far = Math.min(far, Math.hypot(hx - x, hy - y));
    }
    const score = Math.min(free * 4, far) + room * 0.1 + Math.random();
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

// A tiny kingdom for a player around tile `at`.
function spawn(g, uid, name, at) {
  const e = g.byUid.get(uid) || newEmpire(g, uid, name);
  const { w, h } = g.map;
  const x = at % w;
  const y = (at - x) / w;
  const r = Math.ceil(START_RADIUS);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || dx * dx + dy * dy > START_RADIUS * START_RADIUS) continue;
      const i = yy * w + xx;
      if (isLand(g, i) && !g.owner[i]) setOwner(g, i, e.id);
    }
  e.home = at;
  e.pop = e.tiles * POP_PER_TILE * 0.6;
  e.alive = true;
  return e;
}

// A new player (or one coming back) in a running world. Returns their empire, or a reason.
function placePlayer(g, uid, name) {
  const have = g.byUid.get(uid);
  if (have?.alive) return have;
  if (g.eliminated.has(uid)) return "eliminated";
  const homes = g.empires.filter((e) => e?.alive).map((e) => e.home);
  const at = findSpot(g, homes);
  if (at < 0) return "full";
  return spawn(g, uid, name, at);
}

// Everyone at the start of a world, spread out over the map.
function placeAll(g, people) {
  const homes = [];
  for (const p of people) {
    const at = findSpot(g, homes);
    if (at < 0) break;
    homes.push(at);
    spawn(g, p.uid, p.name, at);
  }
}

/* ------------------------------------------------------------ economy */
function econ(g, dt) {
  for (const e of g.empires) {
    if (!e?.alive) continue;
    const cap = Math.max(1, e.tiles * POP_PER_TILE);
    const want = clamp(1 - e.tax / 30, -1, 1);
    e.mood += (want - e.mood) * Math.min(1, dt / 15);
    if (e.pop < cap) e.pop += (cap - e.pop) * GROWTH * Math.max(0, e.mood + 0.25) * dt;
    if (e.mood < 0) e.pop -= e.pop * LEAVING * -e.mood * dt;
    if (e.pop > cap) e.pop -= (e.pop - cap) * Math.min(1, 0.1 * dt);
    if (e.pop < 0) e.pop = 0;
    e.pay = payShare(e.tax);
    e.taxInc = e.pop * (e.tax / 100) * e.pay * TAX_YIELD;
    e.cityInc = e.cityLv * cityRate(e);
    e.inc = e.taxInc + e.cityInc;
    const gcap = goldCap(e);
    if (e.gold < gcap) e.gold = Math.min(gcap, e.gold + e.inc * dt);
  }
}
// The share of people who still pay at a tax rate.
const payShare = (tax) => clamp(1 - Math.max(0, tax - 15) / 35, 0.2, 1);
const cityRate = (e) => 6 + e.tiles / 100; // gold a second per city level
const goldCap = (e) => Math.max(3000, e.inc * GOLD_CAP_SECONDS);
const cityCost = (e) => Math.round(CITY_COST * CITY_GROWTH ** e.cities);
const portCost = (e) => Math.round(PORT_COST * PORT_GROWTH ** e.ports);
const upgradeCost = (lvl) => CITY_UPGRADE * 2 ** lvl;
const maxShips = (e) => Math.min(12, 2 + e.ports * 2);

// How much strength one tile of `target`'s plains costs (forests and hills cost more).
function defense(g, target) {
  if (!target) return NEUTRAL_COST;
  const e = g.empires[target];
  const fill = Math.min(1.2, e.pop / Math.max(1, e.tiles * POP_PER_TILE));
  const size = 1 + 0.12 * Math.log(1 + e.tiles / 60);
  const loyal = 1 + 0.3 * Math.max(0, e.mood);
  return ENEMY_COST * (1.5 + 4.5 * fill) * size * loyal;
}

/* ------------------------------------------------------------ attacks */
// Which tile an attack takes next (smallest first): the ones nearest the clicked spot, but
// tiles already hugged by the attacker on several sides go first, so an attack moves as a
// broad front toward the click instead of a thin line.
function prio(g, a, t) {
  const { w, h } = g.map;
  const o = g.owner;
  const x = t % w;
  const y = (t - x) / w;
  let hug = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && o[yy * w + xx] === a.by) hug++;
    }
  const d = Math.hypot(x - a.cx, y - a.cy) - hug * 1.6 + Math.random() * 1.2 + 20;
  return Math.max(0, Math.floor(d * 8)) * SHIFT + t;
}

// Tiles of `target` along empire e's border (where a land attack can start).
function frontier(g, e, target) {
  const { w, h, terrain } = g.map;
  const o = g.owner;
  const b = e.box;
  const out = [];
  const x0 = Math.max(0, b[0] - 1);
  const x1 = Math.min(w - 1, b[2] + 1);
  const y0 = Math.max(0, b[1] - 1);
  const y1 = Math.min(h - 1, b[3] + 1);
  for (let y = y0; y <= y1; y++)
    for (let x = x0, i = y * w + x0; x <= x1; x++, i++) if (o[i] === target && terrain[i] >= PLAINS && touches(g, i, e.id)) out.push(i);
  return out;
}

function rateFor(g, a) {
  const tiles = a.strength / (defense(g, a.target) * 1.2);
  return clamp(Math.ceil(tiles / (ATTACK_SECONDS * 10)), 2, 150);
}

function spend(e, pct) {
  return Math.floor(e.gold * clamp(Number(pct) || 5, 1, 100) / 100);
}

// A land attack from e's border toward tile `at` (whoever owns it, or nobody).
function landAttack(room, g, e, at, pct) {
  const target = g.owner[at];
  if (!isLand(g, at)) return "That's the sea";
  if (target === e.id) return "That's your land";
  if (target && e.allies.has(target)) return "You can't attack an ally";
  const now = clock();
  if (now < e.nextAttack) return "";
  const gold = spend(e, pct);
  if (gold < NEUTRAL_COST || gold < defense(g, target) * TERRAIN_COST[g.map.terrain[at]] * 0.5) return "Not enough gold for that attack";
  const { w } = g.map;
  const cx = at % w;
  const cy = (at - cx) / w;
  let a = g.attacks.find((x) => x.by === e.id && x.target === target && !x.beach);
  if (a) {
    // Another push on the same enemy joins the attack already going, aimed at the new spot.
    a.strength += gold;
    a.cx = cx;
    a.cy = cy;
    for (const t of frontier(g, e, target)) a.front.add(t);
    a.heap = [];
    for (const t of a.front) heapPush(a.heap, prio(g, a, t));
  } else {
    if (g.attacks.filter((x) => x.by === e.id).length >= MAX_ATTACKS) return "Too many attacks at once";
    const front = frontier(g, e, target);
    if (!front.length) return e.ports ? "You don't border that land. Send a ship instead" : "You don't border that land. Build a port to send ships";
    a = { id: g.nextAttack++, by: e.id, target, strength: gold, cx, cy, front: new Set(front), heap: [], beach: -1 };
    for (const t of front) heapPush(a.heap, prio(g, a, t));
    g.attacks.push(a);
  }
  e.gold -= gold;
  a.rate = rateFor(g, a);
  e.nextAttack = now + 120;
  return null;
}

// Moves every attack forward by up to its rate of tiles.
function stepAttacks(g) {
  const keep = [];
  const terrain = g.map.terrain;
  const { w } = g.map;
  const n = g.owner.length;
  for (const a of g.attacks) {
    const e = g.empires[a.by];
    if (!e.alive) continue;
    if (a.target && e.allies.has(a.target)) {
      e.gold += a.strength; // made peace: the soldiers come home
      continue;
    }
    const base = defense(g, a.target);
    let left = a.rate;
    let done = false;
    while (left > 0) {
      if (!a.heap.length) {
        done = true;
        break;
      }
      const t = heapPop(a.heap) % SHIFT;
      a.front.delete(t);
      if (g.owner[t] !== a.target) continue;
      if (t !== a.beach && !touches(g, t, a.by)) continue;
      const cost = base * TERRAIN_COST[terrain[t]];
      if (a.strength < cost) {
        done = true;
        break;
      }
      a.strength -= cost;
      setOwner(g, t, a.by);
      a.beach = -1;
      left--;
      const x = t % w;
      const nb = [x > 0 ? t - 1 : -1, x < w - 1 ? t + 1 : -1, t >= w ? t - w : -1, t < n - w ? t + w : -1];
      for (const m of nb)
        if (m >= 0 && g.owner[m] === a.target && terrain[m] >= PLAINS) {
          if (pocket(g, m, a.target, a.by)) continue;
          // Pushed again even if already waiting: it's hugged on one more side now.
          a.front.add(m);
          heapPush(a.heap, prio(g, a, m));
        }
    }
    if (!done) keep.push(a);
  }
  g.attacks = keep;
}

// A little piece of `target`'s land (up to 16 tiles) that's now cut off, surrounded only by
// `by` and the sea, gives up without a fight. Keeps fronts clean instead of speckled.
const POCKET = 16;
function pocket(g, start, target, by) {
  const { w } = g.map;
  const o = g.owner;
  const terrain = g.map.terrain;
  const n = o.length;
  const got = [start];
  const seen = new Set(got);
  for (let k = 0; k < got.length; k++) {
    const t = got[k];
    const x = t % w;
    for (const m of [x > 0 ? t - 1 : -1, x < w - 1 ? t + 1 : -1, t >= w ? t - w : -1, t < n - w ? t + w : -1]) {
      if (m < 0 || terrain[m] < PLAINS || seen.has(m)) continue;
      if (o[m] === target) {
        if (got.length >= POCKET) return false;
        seen.add(m);
        got.push(m);
      } else if (o[m] !== by) return false;
    }
  }
  for (const t of got) setOwner(g, t, by);
  return true;
}

/* ------------------------------------------------------------ ships */
let bfsPrev = new Int32Array(0);
let bfsSeen = new Uint32Array(0);
let bfsQueue = new Int32Array(0);
let bfsStamp = 0;

// The shortest sea route from one of e's ports to the coast at tile `land`: a list of tiles
// starting at the port and ending at `land`, or null when no port of e can get there.
function seaRoute(g, e, land) {
  const { w, h, terrain } = g.map;
  const n = w * h;
  if (bfsPrev.length < n) {
    bfsPrev = new Int32Array(n);
    bfsSeen = new Uint32Array(n);
    bfsQueue = new Int32Array(n);
  }
  if (++bfsStamp > 4e9) {
    bfsSeen.fill(0);
    bfsStamp = 1;
  }
  const goal = new Map(); // sea tile next to a port -> the port
  for (const [t, b] of g.buildings) {
    if (b.k !== 2 || b.o !== e.id) continue;
    const x = t % w;
    for (const m of [x > 0 ? t - 1 : -1, x < w - 1 ? t + 1 : -1, t - w, t + w]) if (m >= 0 && m < n && terrain[m] < PLAINS) goal.set(m, t);
  }
  if (!goal.size) return null;
  let qh = 0;
  let qt = 0;
  const lx = land % w;
  for (const m of [lx > 0 ? land - 1 : -1, lx < w - 1 ? land + 1 : -1, land - w, land + w]) {
    if (m < 0 || m >= n || terrain[m] >= PLAINS) continue;
    bfsSeen[m] = bfsStamp;
    bfsPrev[m] = land;
    bfsQueue[qt++] = m;
  }
  while (qh < qt) {
    const t = bfsQueue[qh++];
    if (goal.has(t)) {
      const path = [goal.get(t)];
      for (let c = t; c !== land; c = bfsPrev[c]) path.push(c);
      path.push(land);
      return path;
    }
    const x = t % w;
    const y = (t - x) / w;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const m = yy * w + xx;
        if (bfsSeen[m] === bfsStamp || terrain[m] >= PLAINS) continue;
        // No squeezing diagonally between two pieces of land.
        if (dx && dy && terrain[y * w + xx] >= PLAINS && terrain[yy * w + x] >= PLAINS) continue;
        bfsSeen[m] = bfsStamp;
        bfsPrev[m] = t;
        bfsQueue[qt++] = m;
      }
  }
  return null;
}

// The coast tile nearest to `at` owned by the same empire as `at` (where a ship can land).
function landingNear(g, at) {
  if (g.coast[at]) return at;
  const { w, h } = g.map;
  const who = g.owner[at];
  const x0 = at % w;
  const y0 = (at - x0) / w;
  let best = -1;
  let bestD = 1e9;
  for (let r = 1; r <= 14 && best < 0; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        const d = dx * dx + dy * dy;
        if (g.coast[i] && g.owner[i] === who && d < bestD) {
          best = i;
          bestD = d;
        }
      }
  return best;
}

function shipAttack(room, g, e, at, pct) {
  if (!isLand(g, at)) return "Click the land you want the ship to attack";
  const target = g.owner[at];
  if (target === e.id) return "That's your land";
  if (target && e.allies.has(target)) return "You can't attack an ally";
  if (!e.ports) return "You need a port to send ships";
  const now = clock();
  if (now < e.nextShip) return "";
  if (g.ships.filter((s) => s.by === e.id).length >= maxShips(e)) return `All your ships are at sea (${maxShips(e)}). More ports, more ships`;
  const land = landingNear(g, at);
  if (land < 0) return "No coast near there to land on";
  const gold = spend(e, pct);
  if (gold < NEUTRAL_COST) return "Not enough gold for that attack";
  const path = seaRoute(g, e, land);
  if (!path) return "None of your ports can reach that coast";
  const { w } = g.map;
  // Waypoints every few tiles for the screens; the trip takes as long as the whole route.
  let len = 0;
  const pts = [];
  for (let k = 0; k < path.length; k++) {
    const x = path[k] % w;
    const y = (path[k] - x) / w;
    if (k) {
      const px = path[k - 1] % w;
      len += Math.hypot(x - px, y - (path[k - 1] - px) / w);
    }
    if (k % 3 === 0 || k === path.length - 1) pts.push(x, y);
  }
  e.gold -= gold;
  e.nextShip = now + 400;
  const s = { id: g.nextShip++, by: e.id, land, strength: gold, pts, t0: now, dur: Math.round((len / SHIP_SPEED) * 1000) + 300 };
  g.ships.push(s);
  g.shipNew.push(s);
  return null;
}

// Ships that reached their coast land and attack from the beach.
function moveShips(g, now) {
  if (!g.ships.length) return;
  const keep = [];
  for (const s of g.ships) {
    const e = g.empires[s.by];
    if (!e.alive) {
      g.shipGone.push(s.id);
      continue;
    }
    if (now < s.t0 + s.dur) {
      keep.push(s);
      continue;
    }
    g.shipGone.push(s.id);
    const target = g.owner[s.land];
    // Our own coast by now, or an ally's: the crew comes home with the gold.
    if (target === s.by || (target && e.allies.has(target))) {
      e.gold += s.strength;
      continue;
    }
    const { w } = g.map;
    const cx = s.land % w;
    const a = { id: g.nextAttack++, by: s.by, target, strength: s.strength, cx, cy: (s.land - cx) / w, front: new Set([s.land]), heap: [], beach: s.land };
    heapPush(a.heap, prio(g, a, s.land));
    a.rate = rateFor(g, a);
    g.attacks.push(a);
  }
  g.ships = keep;
}

/* ------------------------------------------------------------ cities and ports */
function build(g, e, t, kind) {
  if (!(t >= 0 && t < g.owner.length) || g.owner[t] !== e.id) return "Build on your own land";
  if (g.buildings.has(t)) return "Something is already built there";
  const { w } = g.map;
  const x = t % w;
  const y = (t - x) / w;
  const gap = kind === 1 ? CITY_GAP : PORT_GAP;
  for (const [bt, b] of g.buildings) {
    if (b.o !== e.id || b.k !== kind) continue;
    const bx = bt % w;
    if (Math.hypot(bx - x, (bt - bx) / w - y) < gap) return kind === 1 ? "Too close to another of your cities" : "Too close to another of your ports";
  }
  if (kind === 2 && !g.coast[t]) return "Ports go on the coast";
  const cost = kind === 1 ? cityCost(e) : portCost(e);
  if (e.gold < cost) return `Not enough gold (${cost} needed)`;
  e.gold -= cost;
  const b = { k: kind, lvl: 1, o: e.id };
  g.buildings.set(t, b);
  if (kind === 1) {
    e.cities++;
    e.cityLv++;
  } else e.ports++;
  g.bChanges.push([t, kind, 1, e.id]);
  return null;
}

function upgrade(g, e, t) {
  const b = g.buildings.get(t);
  if (!b || b.o !== e.id || b.k !== 1) return "Pick one of your cities";
  if (b.lvl >= CITY_MAX) return "This city is as big as it gets";
  const cost = upgradeCost(b.lvl);
  if (e.gold < cost) return `Not enough gold (${cost} needed)`;
  e.gold -= cost;
  b.lvl++;
  e.cityLv++;
  g.bChanges.push([t, 1, b.lvl, e.id]);
  return null;
}

/* ------------------------------------------------------------ alliances */
function makeAllies(room, g, a, b) {
  a.allies.add(b.id);
  b.allies.add(a.id);
  a.asked.delete(b.id);
  b.asked.delete(a.id);
  a.reqs.delete(b.id);
  b.reqs.delete(a.id);
  g.rosterDirty = true;
  room.toast(`You and ${b.name} are allies now`, a.uid);
  room.toast(`You and ${a.name} are allies now`, b.uid);
}

function breakAlliance(room, g, a, b) {
  a.allies.delete(b.id);
  b.allies.delete(a.id);
  a.pings = a.pings.filter((p) => p.from !== b.id);
  b.pings = b.pings.filter((p) => p.from !== a.id);
  g.rosterDirty = true;
  room.toast(`${a.name} ended your alliance`, b.uid);
}

// Who a player most likely needs help against: whoever took their land last (in the last two
// minutes), or else the neighbor they share the longest border with.
function enemyOf(g, e) {
  const now = clock();
  let best = 0;
  let when = 0;
  for (const [id, at] of e.hitBy) {
    const x = g.empires[id];
    if (x?.alive && !e.allies.has(id) && now - at < 120_000 && at > when) {
      best = id;
      when = at;
    }
  }
  if (best) return best;
  const count = new Map();
  const { w, h } = g.map;
  const b = e.box;
  const o = g.owner;
  for (let y = Math.max(0, b[1]); y <= Math.min(h - 1, b[3]); y++)
    for (let x = Math.max(0, b[0]); x <= Math.min(w - 1, b[2]); x++) {
      const i = y * w + x;
      if (o[i] !== e.id) continue;
      for (const m of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        const id = m >= 0 && m < o.length ? o[m] : 0;
        if (id && id !== e.id && !e.allies.has(id)) count.set(id, (count.get(id) || 0) + 1);
      }
    }
  for (const [id, c] of count) if (c > (count.get(best) || 0)) best = id;
  return best;
}

// Where an ally answering a call for help should hit the enemy: enemy land next to the one
// who asked (a coast tile for a ship), or the enemy's tile nearest to them.
function helpTarget(g, asker, enemy, ship) {
  const { w, h } = g.map;
  const b = asker.box;
  const o = g.owner;
  let pick = -1;
  for (let y = Math.max(0, b[1] - 1); y <= Math.min(h - 1, b[3] + 1) && pick < 0; y++)
    for (let x = Math.max(0, b[0] - 1); x <= Math.min(w - 1, b[2] + 1); x++) {
      const i = y * w + x;
      if (o[i] === enemy && touches(g, i, asker.id) && (!ship || g.coast[i])) {
        pick = i;
        break;
      }
    }
  if (pick >= 0) return pick;
  const e = g.empires[enemy];
  const hx = asker.home % w;
  const hy = (asker.home - hx) / w;
  let bestD = 1e9;
  for (let y = Math.max(0, e.box[1]); y <= Math.min(h - 1, e.box[3]); y++)
    for (let x = Math.max(0, e.box[0]); x <= Math.min(w - 1, e.box[2]); x++) {
      const i = y * w + x;
      if (o[i] !== enemy || (ship && !g.coast[i])) continue;
      const d = (x - hx) ** 2 + (y - hy) ** 2;
      if (d < bestD) {
        bestD = d;
        pick = i;
      }
    }
  return pick;
}

/* ------------------------------------------------------------ the end of empires and worlds */
function processDeaths(room, g) {
  if (!g.dead.length) return;
  for (const [id, by] of g.dead.splice(0)) {
    const e = g.empires[id];
    if (!e.alive || e.tiles > 0) continue;
    e.alive = false;
    e.tiles = 0;
    e.pop = 0;
    e.gold = 0;
    g.eliminated.add(e.uid);
    for (const [t, b] of [...g.buildings]) if (b.o === id) removeBuilding(g, t, true);
    g.attacks = g.attacks.filter((a) => a.by !== id);
    for (const s of g.ships) if (s.by === id) g.shipGone.push(s.id);
    g.ships = g.ships.filter((s) => s.by !== id);
    for (const other of g.empires) {
      if (!other || other === e) continue;
      other.allies.delete(id);
      other.asked.delete(id);
      other.reqs.delete(id);
      other.pings = other.pings.filter((p) => p.from !== id);
    }
    e.allies.clear();
    e.asked.clear();
    e.reqs.clear();
    e.pings = [];
    g.rosterDirty = true;
    const killer = by && by !== id ? g.empires[by] : null;
    room.toast(`${e.name} was eliminated${killer ? ` by ${killer.name}` : ""}`);
    room.sendTo(e.uid, { t: "we:out", by: killer?.name || null });
  }
}

function checkWin(room, g) {
  const land = g.map.land;
  for (const e of g.empires) if (e?.alive && e.tiles >= land) return win(room, g, e);
}

function win(room, g, e) {
  flush(room, g);
  const now = clock();
  g.winner = { uid: e.uid, name: e.name, color: e.color, at: now };
  g.attacks = [];
  for (const s of g.ships) g.shipGone.push(s.id);
  g.ships = [];
  if (g.pub) {
    // The public world: show the winner, open sign-ups for the next one, two days from now.
    g.phase = "signup";
    g.startAt = nextStartAfterWin(now);
    g.signups = new Map();
    g.roundNo++;
    room.toast(`${e.name} conquered the whole world! The next public world starts ${whenText(g.startAt)}.`);
    room.update();
    publicFor(room)?.saveSoon(0);
    return;
  }
  g.phase = "won";
  room.update();
  room.end({ winners: [e.uid], reason: `${e.name} conquered the whole world` });
}

/* ------------------------------------------------------------ telling the screens */
function roster(room, g) {
  return g.empires
    .filter(Boolean)
    .map((e) => ({ id: e.id, uid: e.uid, n: e.name, c: e.color, alive: e.alive, on: !!room.player(e.uid)?.connected, al: [...e.allies] }));
}

// Changed tiles as runs: [gap since the last run, run length, owner, ...] in tile order.
function packChanges(g) {
  const list = g.changed.sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (let k = 0; k < list.length; ) {
    const start = list[k];
    const v = g.owner[start];
    let end = start + 1;
    k++;
    while (k < list.length && list[k] === end && g.owner[end] === v) {
      end++;
      k++;
    }
    out.push(start - prev, end - start, v);
    prev = end;
  }
  for (const t of list) g.dirty[t] = 0;
  g.changed = [];
  return out;
}

const shipInfo = (s) => ({ id: s.id, o: s.by, p: s.pts, t0: s.t0, dur: s.dur });

// The changes since the last tick, to everyone at once.
function flush(room, g) {
  const msg = { t: "we:tick", m: g.mapId };
  let any = false;
  if (g.changed.length) (msg.d = packChanges(g)), (any = true);
  if (g.bChanges.length) (msg.b = g.bChanges.splice(0)), (any = true);
  if (g.shipNew.length) (msg.s = g.shipNew.splice(0).map(shipInfo)), (any = true);
  if (g.shipGone.length) (msg.sx = g.shipGone.splice(0)), (any = true);
  if (g.fx.length) (msg.fx = g.fx.splice(0)), (any = true);
  if (g.rosterDirty) {
    msg.r = roster(room, g);
    g.rosterDirty = false;
    any = true;
  }
  if (!any) return;
  msg.seq = ++g.seq;
  msg.now = clock();
  room.broadcast(msg);
}

// The whole map for one screen (it says which map it already has, to skip the terrain).
function snapshot(room, g, have) {
  return {
    t: "we:snap",
    m: g.mapId,
    w: g.map.w,
    h: g.map.h,
    land: g.map.land,
    ter: have === g.mapId ? null : g.packed,
    own: rle(g.owner),
    seq: g.seq,
    roster: roster(room, g),
    b: [...g.buildings].map(([t, b]) => [t, b.k, b.lvl, b.o]),
    ships: g.ships.map(shipInfo),
    now: clock(),
  };
}

const whenFmt = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
const shortFmt = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
function whenText(ms) {
  const p = Object.fromEntries(whenFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.weekday}, ${p.month} ${p.day} at ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

function myView(room, g, uid) {
  const e = uid ? g.byUid.get(uid) : null;
  const now = clock();
  const base = {
    pub: g.pub,
    phase: g.phase,
    m: g.mapId,
    seq: g.seq,
    now,
    land: g.map?.land || 0,
    startAt: g.startAt,
    signups: g.signups.size,
    signedUp: !!uid && g.signups.has(uid),
    winner: g.winner,
    elim: !!uid && g.eliminated.has(uid),
    me: null,
  };
  if (!e?.alive) return base;
  base.me = {
    id: e.id,
    gold: Math.floor(e.gold),
    gcap: Math.floor(goldCap(e)),
    pop: Math.floor(e.pop),
    cap: e.tiles * POP_PER_TILE,
    inc: Math.round(e.inc * 10) / 10,
    tinc: Math.round(e.taxInc * 10) / 10,
    cinc: Math.round(e.cityInc * 10) / 10,
    tax: e.tax,
    mood: Math.round(e.mood * 100) / 100,
    pay: Math.round((e.pay ?? 1) * 100),
    tiles: e.tiles,
    cities: e.cities,
    ports: e.ports,
    cityCost: cityCost(e),
    portCost: portCost(e),
    cityRate: Math.round(cityRate(e) * 10) / 10,
    ships: g.ships.filter((s) => s.by === e.id).length,
    maxShips: maxShips(e),
    asked: [...e.asked],
    reqs: [...e.reqs],
    pings: e.pings.filter((p) => now - p.at < PING_LIFE),
    atk: g.attacks.filter((a) => a.by === e.id).map((a) => ({ t: a.target, s: Math.floor(a.strength) })),
    under: g.attacks.filter((a) => a.target === e.id).length,
  };
  return base;
}

/* ------------------------------------------------------------ actions */
function act(room, g, p, a) {
  if (g.phase !== "running" || !g.map) return;
  const e = g.byUid.get(p.uid);
  if (!e?.alive) return;
  const k = a.k;
  const N = g.owner.length;
  const tile = int(a.tile);
  const okTile = tile >= 0 && tile < N;
  const other = Number.isInteger(a.id) ? g.empires[a.id] : null;
  let err = null;
  switch (k) {
    case "tax": {
      const v = int(a.v);
      if (v >= 0 && v <= TAX_MAX) e.tax = v;
      break;
    }
    case "atk":
      err = okTile ? landAttack(room, g, e, tile, a.pct) : "Pick a tile";
      break;
    case "ship":
      err = okTile ? shipAttack(room, g, e, tile, a.pct) : "Pick a tile";
      break;
    case "city":
      err = okTile ? build(g, e, tile, 1) : "Pick a tile";
      break;
    case "port":
      err = okTile ? build(g, e, tile, 2) : "Pick a tile";
      break;
    case "up":
      err = okTile ? upgrade(g, e, tile) : "Pick a city";
      break;
    case "ally": {
      if (!other?.alive || other === e) return;
      if (e.allies.has(other.id)) return;
      if (e.reqs.has(other.id)) makeAllies(room, g, e, other);
      else if (!e.asked.has(other.id)) {
        e.asked.add(other.id);
        other.reqs.add(e.id);
        room.toast(`${e.name} wants to be your ally`, other.uid);
        room.toast(`Ally request sent to ${other.name}`, e.uid);
      }
      break;
    }
    case "decline":
      if (!other) return;
      e.reqs.delete(other.id);
      other.asked.delete(e.id);
      break;
    case "unally":
      if (other && e.allies.has(other.id)) breakAlliance(room, g, e, other);
      break;
    case "gold": {
      if (!other?.alive || !e.allies.has(other.id)) { err = "You can only send gold to allies"; break; }
      const amount = spend(e, a.pct);
      if (amount < 1) { err = "You have no gold to send"; break; }
      e.gold -= amount;
      other.gold += amount;
      e.pings = e.pings.filter((x) => !(x.from === other.id && x.k === "money"));
      room.toast(`${e.name} sent you ${amount.toLocaleString("en-US")} gold`, other.uid);
      room.toast(`Sent ${amount.toLocaleString("en-US")} gold to ${other.name}`, e.uid);
      break;
    }
    case "ask": {
      if (!other?.alive || !e.allies.has(other.id) || !["money", "help"].includes(a.what)) return;
      const key = `${other.id}:${a.what}`;
      if (clock() - (e.pingSent.get(key) || 0) < 10_000) { err = "You just asked. Give them a moment"; break; }
      let enemy = 0;
      if (a.what === "help") {
        enemy = enemyOf(g, e);
        if (!enemy) { err = "No enemy borders you right now"; break; }
      }
      e.pingSent.set(key, clock());
      other.pings = other.pings.filter((x) => !(x.from === e.id && x.k === a.what));
      other.pings.push({ pid: `${e.id}-${clock()}`, from: e.id, k: a.what, enemy, at: clock() });
      room.toast(a.what === "money" ? `Asked ${other.name} for gold` : `Asked ${other.name} for help against ${g.empires[enemy].name}`, e.uid);
      break;
    }
    case "help": {
      // Answering an ally's call for help: a ship or an attack at their enemy, in one click.
      const ping = other && e.pings.find((x) => x.from === other.id && x.k === "help");
      if (!ping) return;
      const enemy = g.empires[ping.enemy];
      if (!enemy?.alive) { err = "That enemy is already gone"; break; }
      if (e.allies.has(enemy.id)) { err = "You're allied with them too"; break; }
      const ship = a.how === "ship";
      const at = helpTarget(g, other, enemy.id, ship);
      if (at < 0) { err = ship ? "No coast of theirs to land on" : "Can't find their land"; break; }
      err = ship ? shipAttack(room, g, e, at, a.pct) : landAttack(room, g, e, at, a.pct);
      if (!err) e.pings = e.pings.filter((x) => x !== ping);
      break;
    }
    case "dismiss":
      e.pings = e.pings.filter((x) => x.pid !== a.pid);
      break;
    default:
      return;
  }
  if (err) room.toast(err, p.uid);
  g.viewSoon = true;
}

/* ------------------------------------------------------------ the public world */
const publics = new Map(); // site -> Public
const snapAt = new WeakMap(); // client -> when it last got a whole map
const publicFor = (room) => (room?.persistent ? publics.get(room.site) : null);

class Public {
  constructor(site, api) {
    this.site = site;
    this.api = api;
    this.room = null;
    this.loaded = false; // the saved world was read (or there was none)
    this.loading = false;
    this.retryAt = 0;
    this.saving = null; // the save on its way
    this.saveAt = 0;
    this.lastSave = 0;
  }
  start() {
    const room = this.api.createRoom({ site: this.site, gameId: ID, opts: { mode: "ffa", max: 0 }, persistent: true, name: "Public world" });
    this.room = room;
    this.install(freshPublic());
    this.load();
  }
  // Puts a world in the room. The room never goes back to the lobby: the world has its own
  // phases (sign-up, running) and shows them on its screen.
  install(g) {
    const room = this.room;
    g.unsaved = !this.loaded;
    room.g = g;
    room.state = "playing";
    room.round = Math.max(1, room.round);
    room.changed();
    room.update();
  }
  load() {
    if (this.loading) return;
    this.loading = true;
    this.api
      .siteCall(this.site, "world-get", { id: SAVE_ID })
      .then((res) => {
        const before = this.room.g;
        let g = before;
        if (res && typeof res.data === "string" && res.data) {
          try {
            g = restore(res.data);
            // People who signed up while the save was still on its way.
            if (g.phase === "signup") for (const [uid, s] of before.signups) if (!g.signups.has(uid)) g.signups.set(uid, s);
          } catch (err) {
            console.log("world-empire: the saved public world is unreadable, starting a new one:", err.message);
            g = before;
          }
        }
        this.loaded = true;
        if (g !== before) this.install(g);
        else g.unsaved = false;
      })
      .catch((err) => {
        if (TEST_OFFLINE) {
          this.loaded = true;
          this.offline = true;
          this.room.g.unsaved = true;
          return console.log("world-empire: playing the public world without saving (WE_TEST_OFFLINE)");
        }
        console.log(`world-empire: can't read the public world of ${this.site} yet:`, err.message);
        this.retryAt = Date.now() + 60_000;
      })
      .finally(() => (this.loading = false));
  }
  saveSoon(ms = 3000) {
    const at = Date.now() + ms;
    if (!this.saveAt || at < this.saveAt) this.saveAt = at;
  }
  save() {
    const g = this.room?.g;
    if (!g || !this.loaded || this.offline) return Promise.resolve();
    if (this.saving) return this.saving;
    this.saveAt = 0;
    this.lastSave = Date.now();
    this.saving = this.api
      .siteCall(this.site, "world-put", { id: SAVE_ID, data: serialize(g) })
      .then(() => (g.savedAt = Date.now()))
      .catch((err) => {
        console.log(`world-empire: saving the public world of ${this.site} failed:`, err.message);
        this.saveAt = Date.now() + 30_000;
      })
      .finally(() => (this.saving = null));
    return this.saving;
  }
  // Called every tick of the public room: the schedule, saving, reading the save again.
  tick(room, g, now) {
    if (!this.loaded) {
      if (!this.loading && now >= this.retryAt) this.load();
      return;
    }
    if (g.phase === "signup" && now >= g.startAt) startPublic(room, g, this);
    if (this.saveAt && now >= this.saveAt) this.save();
    else if (g.phase === "running" && now - this.lastSave > 60_000) this.save();
  }
}

function freshPublic() {
  const g = blankState(true);
  g.phase = "signup";
  if (TEST_START) g.startAt = TEST_START;
  setMap(g, makeMap("large", 1, "world"));
  g.map.round = 1;
  return g;
}

// Sign-ups close and the world begins: everyone signed up gets a tiny kingdom.
function startPublic(room, g, P) {
  if (g.map.round !== g.roundNo || g.empires.length > 1) {
    setMap(g, makeMap("large", g.roundNo, "world"));
    g.map.round = g.roundNo;
  }
  const people = [...g.signups.values()].sort((a, b) => a.at - b.at);
  placeAll(g, people);
  g.signups = new Map();
  g.winner = null;
  g.phase = "running";
  room.toast(people.length ? `The public world has begun! ${people.length} kingdom${people.length === 1 ? "" : "s"} on the map.` : "The public world has begun!");
  room.update();
  P.saveSoon(0);
}

function serialize(g) {
  return JSON.stringify({
    v: 1,
    gen: MAP_GEN,
    phase: g.phase,
    startAt: g.startAt,
    winner: g.winner,
    roundNo: g.roundNo,
    signups: [...g.signups.values()],
    savedAt: clock(),
    world: {
      size: g.map.size,
      seed: g.map.seed,
      layout: g.map.layout,
      round: g.map.round || g.roundNo,
      owner: rle(g.owner),
      eliminated: [...g.eliminated],
      empires: g.empires.filter(Boolean).map((e) => ({
        id: e.id,
        uid: e.uid,
        name: e.name,
        color: e.color,
        alive: e.alive,
        gold: Math.floor(e.gold),
        pop: Math.floor(e.pop),
        tax: e.tax,
        mood: e.mood,
        home: e.home,
        allies: [...e.allies],
        asked: [...e.asked],
        reqs: [...e.reqs],
        joinedAt: e.joinedAt,
      })),
      buildings: [...g.buildings].map(([t, b]) => [t, b.k, b.lvl, b.o]),
      // Gold still out in attacks and ships goes back to its owners when the world is read again.
      refunds: [...g.attacks, ...g.ships].map((a) => [a.by, Math.floor(a.strength)]),
    },
  });
}

function restore(text) {
  const d = JSON.parse(text);
  if (!d || d.v !== 1) throw new Error("unknown save version");
  const g = blankState(true);
  g.phase = d.phase === "running" ? "running" : "signup";
  g.startAt = Number(d.startAt) || FIRST_START;
  g.winner = d.winner || null;
  g.roundNo = Math.max(1, d.roundNo | 0);
  for (const s of d.signups || []) if (s?.uid) g.signups.set(String(s.uid), { uid: String(s.uid), name: String(s.name || "Player").slice(0, 24), at: Number(s.at) || 0 });
  const wd = d.world;
  if (!wd) {
    setMap(g, makeMap("large", g.roundNo, "world"));
    g.map.round = g.roundNo;
    return g;
  }
  setMap(g, makeMap(wd.size || "large", wd.seed || 1, wd.layout || "world"));
  g.map.round = wd.round || g.roundNo;
  const n = g.owner.length;
  const owner = unrle(wd.owner || [], n);
  for (const e of wd.empires || []) {
    const x = newEmpire(g, String(e.uid), e.name);
    // Keep the saved ids: the owner map refers to them.
    while (x.id < e.id) {
      g.empires.splice(x.id, 0, null);
      x.id++;
    }
    x.color = e.color || x.color;
    x.alive = !!e.alive;
    x.gold = Number(e.gold) || 0;
    x.pop = Number(e.pop) || 0;
    x.tax = clamp(int(e.tax) || 0, 0, TAX_MAX);
    x.mood = clamp(Number(e.mood) || 0, -1, 1);
    x.home = int(e.home) || 0;
    x.joinedAt = Number(e.joinedAt) || 0;
    x._allies = e.allies || [];
    x._asked = e.asked || [];
    x._reqs = e.reqs || [];
  }
  const valid = (id) => id > 0 && id < g.empires.length && g.empires[id];
  for (const e of g.empires) {
    if (!e) continue;
    for (const id of e._allies) if (valid(id) && id !== e.id) e.allies.add(id);
    for (const id of e._asked) if (valid(id)) e.asked.add(id);
    for (const id of e._reqs) if (valid(id)) e.reqs.add(id);
    delete e._allies;
    delete e._asked;
    delete e._reqs;
  }
  // Tiles: only land, only empires that are still in the game.
  for (let i = 0; i < n; i++) {
    const id = owner[i];
    if (!id || !isLand(g, i) || !valid(id) || !g.empires[id].alive) continue;
    g.owner[i] = id;
    g.empires[id].tiles++;
  }
  for (const e of g.empires) if (e && e.alive && e.tiles === 0) e.alive = false;
  for (const uid of wd.eliminated || []) g.eliminated.add(String(uid));
  for (const e of g.empires) if (e && !e.alive) g.eliminated.add(e.uid);
  for (const [t, k, lvl, o] of wd.buildings || []) {
    if (!(t >= 0 && t < n) || g.owner[t] !== o || (k !== 1 && k !== 2)) continue;
    if (k === 2 && !g.coast[t]) continue;
    const e = g.empires[o];
    const level = clamp(lvl | 0, 1, CITY_MAX);
    g.buildings.set(t, { k, lvl: k === 1 ? level : 1, o });
    if (k === 1) {
      e.cities++;
      e.cityLv += level;
    } else e.ports++;
  }
  for (const [id, gold] of wd.refunds || []) if (valid(id) && g.empires[id].alive) g.empires[id].gold += Number(gold) || 0;
  recomputeBoxes(g);
  econ(g, 0);
  return g;
}

/* ------------------------------------------------------------ the game */
export default {
  id: ID,
  name: "World Empire",
  ranked: false,
  modes: ["ffa"],
  min: 1,
  max: 4,
  unlimited: true,
  joinPlaying: true,
  options: [
    {
      key: "map",
      label: "Map size",
      type: "select",
      def: "medium",
      choices: [
        { value: "small", label: "Small · quick game" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large · the whole world" },
      ],
    },
  ],
  info: {
    blurb: "Grow a tiny kingdom into an empire that covers the whole world. Set taxes, build cities and ports, send ships, make allies. The public world is always going.",
    how: "You start with a tiny piece of land. Click land to act: next to your border, the sword attacks it with a share of your gold (5% unless you move the Attack bar at the bottom; more gold, more strength, and strength left over when there's nothing more to take is lost). Someone else's land costs much more than empty land, and big, crowded, happy empires are the hardest to take. Click your own land to build a city (makes gold, upgrade it to make more) or, on the coast, a port (lets you send ships across the sea to any coast). A city is the banner: if an enemy takes the banner's tile, the city is gone. Gold comes from taxes: high taxes make people refuse to pay and move away, low taxes make them happy. Allies can't attack each other; click an ally's land to send gold, ask for gold or ask for help. Lose your last tile and you're out of that world. The first empire to own every piece of land wins. The public world is hosted by nobody: sign up on this page and you get land when it starts.",
    keys: "Drag to move the map · wheel or pinch to zoom · click or tap land for actions",
  },

  create(room) {
    if (room.persistent) return publics.get(room.site)?.room?.g || freshPublic();
    const g = blankState(false);
    const size = ["small", "medium", "large"].includes(room.opts.map) ? room.opts.map : "medium";
    setMap(g, makeMap(size, (Math.random() * 1e9) | 0, "random"));
    placeAll(g, room.players.map((p) => ({ uid: p.uid, name: p.name })));
    g.phase = "running";
    return g;
  },

  action(room, g, p, a) {
    act(room, g, p, a);
  },

  view(room, g, uid) {
    if (!g) return null;
    return myView(room, g, uid);
  },

  tick(room, g, dtMs) {
    if (!g?.map) return;
    const now = clock();
    if (g.pub) publicFor(room)?.tick(room, g, now);
    const dt = Math.min(1, dtMs / 1000);
    if (g.phase === "running") {
      econ(g, dt);
      stepAttacks(g);
      moveShips(g, now);
      processDeaths(room, g);
      if (g.changed.length) checkWin(room, g);
    }
    const c = g.clocks;
    c.flush += dtMs;
    c.view += dtMs;
    c.slow += dtMs;
    c.boxes += dtMs;
    // About 4 times a second (the leftover carries over, ticks come every ~100 ms).
    if (c.flush >= 250) {
      c.flush = c.flush > 1000 ? 0 : c.flush - 250;
      flush(room, g);
    }
    if (c.view >= 500 || g.viewSoon) {
      c.view = 0;
      g.viewSoon = false;
      room.update();
    }
    if (c.slow >= 2000) {
      c.slow = 0;
      // Who's online changed (players coming back don't always pass through join()).
      const on = g.empires.map((e) => (e ? !!room.player(e.uid)?.connected : false)).join();
      if (on !== g.onlineKey) {
        g.onlineKey = on;
        g.rosterDirty = true;
      }
      for (const e of g.empires) if (e?.pings.length) e.pings = e.pings.filter((x) => now - x.at < PING_LIFE);
    }
    if (c.boxes >= 10_000) {
      c.boxes = 0;
      recomputeBoxes(g);
    }
  },

  join(room, g, p) {
    if (!g?.map) return;
    // The public world: only people who signed up (or asked to join later) have land there.
    if (g.pub) return void (g.rosterDirty = true);
    if (g.phase !== "running") return;
    const r = placePlayer(g, p.uid, p.name);
    if (r === "eliminated") room.toast("You were eliminated from this world. You can watch.", p.uid);
    else if (r === "full") room.toast("There's no free land left for a new kingdom. You can watch.", p.uid);
    g.viewSoon = true;
  },

  leave(room, g) {
    // Empires stay when their player leaves: they keep earning and defending.
    if (g) g.rosterDirty = true;
  },

  disconnect(room, g) {
    if (g) g.rosterDirty = true;
  },

  message(room, g, client, msg) {
    if (typeof msg.t !== "string" || !msg.t.startsWith("we:")) return;
    // The map of the world this person is in (or watching).
    if (msg.t === "we:snap") {
      if (!room || room.gameId !== ID || !g?.map) return;
      const now = Date.now();
      if (now - (snapAt.get(client) || 0) < 1500) return;
      snapAt.set(client, now);
      return client.send(snapshot(room, g, msg.have));
    }
    // Everything else is about the site's public world, from its page or from inside it.
    const P = publics.get(client.site);
    if (!P?.room?.g) return client.send({ t: "we:status", ready: false });
    const pg = P.room.g;
    const uid = client.uid;
    let err = null;
    if (msg.t === "we:signup") {
      if (pg.phase !== "signup") err = "Sign-ups are closed: the world is running";
      else if (!pg.signups.has(uid)) {
        pg.signups.set(uid, { uid, name: client.name, at: Date.now() });
        P.saveSoon();
      }
    } else if (msg.t === "we:unsign") {
      if (pg.signups.delete(uid)) P.saveSoon();
    } else if (msg.t === "we:join") {
      if (pg.phase !== "running") err = "The world hasn't started yet. Sign up instead";
      else {
        const r = placePlayer(pg, uid, client.name);
        if (r === "eliminated") err = "You were eliminated from this world. It starts over when someone wins";
        else if (r === "full") err = "There's no free land left for a new kingdom right now";
        else P.saveSoon();
      }
    } else if (msg.t !== "we:status") return;
    if (msg.t !== "we:status") {
      P.room.update();
      P.room.changed(); // the lobby's line about the public world
    }
    const mine = pg.byUid.get(uid);
    client.send({
      t: "we:status",
      ready: true,
      id: P.room.id,
      phase: pg.phase,
      startAt: pg.startAt,
      when: whenText(pg.startAt),
      signups: pg.signups.size,
      signedUp: pg.signups.has(uid),
      empire: !!mine?.alive,
      elim: pg.eliminated.has(uid),
      empires: pg.empires.filter((e) => e?.alive).length,
      winner: pg.winner,
      inside: P.room.active.some((p) => p.uid === uid),
      now: Date.now(),
      err,
    });
  },

  summary(room, g) {
    if (!g?.map) return null;
    const alive = g.empires.filter((e) => e?.alive).length;
    if (g.pub && g.phase === "signup") return { text: `Starts ${shortFmt.format(new Date(g.startAt))} · ${g.signups.size} signed up` };
    return { text: `${alive} ${alive === 1 ? "empire" : "empires"}` };
  },

  boot(site, api) {
    let P = publics.get(site);
    if (P && !api.rooms.has(P.room?.id)) P = null; // the room went away somehow: make it again
    if (!P) {
      P = new Public(site, api);
      publics.set(site, P);
      P.start();
    } else if (!P.loaded && !P.loading && Date.now() >= P.retryAt) P.load();
  },

  async shutdown() {
    // A save already on its way may be a minute old: wait for it, then save the latest.
    for (const P of publics.values()) {
      if (P.saving) await P.saving;
      await P.save();
    }
  },

  close(room) {
    if (room.persistent) publics.delete(room.site);
  },
};

// For the tests (mptest): the world's insides.
export const _test = {
  blankState,
  setMap,
  makeMap,
  spawn,
  placeAll,
  placePlayer,
  econ,
  defense,
  landAttack,
  shipAttack,
  stepAttacks,
  moveShips,
  processDeaths,
  checkWin,
  build,
  upgrade,
  act,
  flush,
  snapshot,
  serialize,
  restore,
  freshPublic,
  startPublic,
  publics,
  Public,
  myView,
  seaRoute,
  whenText,
  setClock: (fn) => (clock = fn),
  consts: { POP_PER_TILE, START_GOLD, NEUTRAL_COST, CITY_COST, PORT_COST, TAX_MAX },
};
