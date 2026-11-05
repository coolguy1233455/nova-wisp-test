// World Empire's maps: a stylized world of continents and islands, made from a seed so a
// saved world only has to remember the seed. The public world always uses the same hand-placed
// continents; hosted worlds get a fresh random layout every round.
//
// Tiles: 0 deep sea, 1 shallow sea (near a coast, only for looks), 2 plains, 3 forest, 4 hills.
// Land is 2 and up. Every patch of water is part of the one ocean (lakes are filled in), and
// every island is at least a few dozen tiles, so ships can reach every coast and nobody has to
// hunt for a lone pixel of land to win.
//
// Only integer hashing and + - * / are used, so the same seed always makes the same map.

export const MAP_GEN = 1; // bump when the generator changes (saved worlds keep their old seed)
export const SEA = 0;
export const SHALLOW = 1;
export const PLAINS = 2;
export const FOREST = 3;
export const HILLS = 4;

export const SIZES = {
  small: { w: 240, h: 140 },
  medium: { w: 320, h: 190 },
  large: { w: 440, h: 260 },
};

function hash2(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, seed, octaves) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f, y * f, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// A small seeded random number generator (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The public world's continents: [x, y, radius x, radius y, tilt] in map fractions (x across,
// y down). Six big landmasses with seas between them, plus island chains.
const WORLD = [
  [0.18, 0.3, 0.12, 0.16, 0.3],
  [0.1, 0.18, 0.06, 0.07, 0],
  [0.26, 0.73, 0.07, 0.15, -0.25],
  [0.47, 0.22, 0.08, 0.1, 0.5],
  [0.53, 0.34, 0.045, 0.05, 0],
  [0.53, 0.68, 0.085, 0.14, 0.15],
  [0.78, 0.28, 0.14, 0.12, -0.15],
  [0.88, 0.45, 0.05, 0.08, 0.4],
  [0.84, 0.77, 0.075, 0.065, 0.2],
  // island chains
  [0.38, 0.5, 0.025, 0.03, 0],
  [0.41, 0.58, 0.02, 0.025, 0],
  [0.66, 0.55, 0.025, 0.035, 0.3],
  [0.69, 0.66, 0.02, 0.025, 0],
  [0.95, 0.2, 0.025, 0.05, 0],
  [0.06, 0.62, 0.025, 0.04, 0],
  [0.36, 0.1, 0.03, 0.03, 0],
  [0.62, 0.86, 0.035, 0.03, 0],
  [0.15, 0.88, 0.04, 0.03, 0.2],
];

// A random layout for a hosted world: 4–6 continents spread over a grid, plus islands.
function randomLayout(r) {
  const blobs = [];
  const cols = 3;
  const rows = 2;
  const cells = [];
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) cells.push([cx, cy]);
  cells.sort(() => r() - 0.5);
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const [cx, cy] = cells[i];
    const x = (cx + 0.25 + r() * 0.5) / cols;
    const y = (cy + 0.25 + r() * 0.5) / rows;
    blobs.push([x, y, 0.08 + r() * 0.06, 0.1 + r() * 0.08, (r() - 0.5) * 1.2]);
    if (r() < 0.6) blobs.push([x + (r() - 0.5) * 0.12, y + (r() - 0.5) * 0.15, 0.04 + r() * 0.03, 0.04 + r() * 0.03, 0]);
  }
  const islands = 5 + Math.floor(r() * 5);
  for (let i = 0; i < islands; i++) blobs.push([0.06 + r() * 0.88, 0.08 + r() * 0.84, 0.018 + r() * 0.02, 0.02 + r() * 0.025, 0]);
  return blobs;
}

// Makes a map. Returns { w, h, seed, size, terrain: Uint8Array, land: number }.
export function makeMap(size = "large", seed = 1, layout = "world") {
  const { w, h } = SIZES[size] || SIZES.large;
  const r = rng(seed * 7919 + 17);
  const blobs = layout === "world" ? WORLD : randomLayout(r);
  const s = seed * 31;
  const aspect = w / h;
  const elev = new Float32Array(w * h);
  // Precompute each blob's rotation.
  const B = blobs.map(([bx, by, rx, ry, tilt]) => {
    // cos/sin from a polynomial so every engine agrees exactly.
    const t2 = tilt * tilt;
    const c = 1 - t2 / 2 + (t2 * t2) / 24;
    const sn = tilt - (tilt * t2) / 6 + (tilt * t2 * t2) / 120;
    return { bx: bx * aspect, by, rx: rx * aspect * 1.3, ry: ry * 1.3, c, sn };
  });
  for (let y = 0; y < h; y++) {
    const ny = y / h;
    for (let x = 0; x < w; x++) {
      const nx = (x / w) * aspect;
      // Bend the coordinates a little so coasts are ragged, not round.
      let wx = nx + (fbm(nx * 2.4, ny * 2.4, s + 1, 4) - 0.5) * 0.3;
      let wy = ny + (fbm(nx * 2.4 + 9, ny * 2.4 + 9, s + 2, 4) - 0.5) * 0.3;
      wx += (fbm(nx * 9, ny * 9, s + 7, 3) - 0.5) * 0.05;
      wy += (fbm(nx * 9 + 4, ny * 9 + 4, s + 8, 3) - 0.5) * 0.05;
      let e = -1;
      for (const b of B) {
        const dx = wx - b.bx;
        const dy = wy - b.by;
        const u = (dx * b.c + dy * b.sn) / b.rx;
        const v = (-dx * b.sn + dy * b.c) / b.ry;
        const d = 1 - Math.sqrt(u * u + v * v);
        if (d > e) e = d;
      }
      e += (fbm(nx * 4, ny * 4, s + 3, 6) - 0.5) * 2.4 + (fbm(nx * 16, ny * 16, s + 4, 3) - 0.5) * 0.5;
      // Keep a margin of sea at the map's edges.
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (edge < 6) e -= (6 - edge) * 0.12;
      elev[y * w + x] = e;
    }
  }
  const terrain = new Uint8Array(w * h);
  // Land is the highest part of the map: about 36% for the public world, 42% for hosted ones.
  const sorted = Float32Array.from(elev).sort();
  const cut = sorted[Math.floor(sorted.length * (layout === "world" ? 0.64 : 0.58))];
  for (let i = 0; i < w * h; i++) terrain[i] = elev[i] > cut ? PLAINS : SEA;
  // Open sea all around the edge, so the ocean is one body of water (no bay cut off by land
  // touching the edge) and ships can reach every coast.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) terrain[y * w + x] = SEA;
  fillLakes(terrain, w, h);
  dropSpecks(terrain, w, h, Math.max(24, Math.round((w * h) / 2500)));
  // Hills on the highest ground, forests where a second noise says it's wet.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (terrain[i] !== PLAINS) continue;
      const nx = (x / w) * aspect;
      const ny = y / h;
      const ridge = Math.abs(fbm(nx * 7, ny * 7, s + 5, 4) - 0.5);
      if (elev[i] > 0.32 && ridge < 0.022 + elev[i] * 0.025) terrain[i] = HILLS;
      else if (fbm(nx * 9, ny * 9, s + 6, 4) > 0.57) terrain[i] = FOREST;
    }
  // Shallow water: up to two tiles from land (only for looks).
  for (let pass = 0; pass < 2; pass++) {
    const mark = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (terrain[i] !== SEA) continue;
        const want = pass === 0 ? (t) => t >= PLAINS : (t) => t >= SHALLOW;
        if ((x > 0 && want(terrain[i - 1])) || (x < w - 1 && want(terrain[i + 1])) || (y > 0 && want(terrain[i - w])) || (y < h - 1 && want(terrain[i + w]))) mark.push(i);
      }
    for (const i of mark) terrain[i] = SHALLOW;
  }
  let land = 0;
  for (let i = 0; i < w * h; i++) if (terrain[i] >= PLAINS) land++;
  return { w, h, seed, size, layout, terrain, land };
}

// Water the ocean can't reach (lakes) becomes land.
function fillLakes(t, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || t[i] >= PLAINS) continue;
    seen[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  for (let i = 0; i < w * h; i++) if (t[i] < PLAINS && !seen[i]) t[i] = PLAINS;
}

// Islands smaller than `min` tiles sink.
function dropSpecks(t, w, h, min) {
  const seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || t[s] < PLAINS) continue;
    const part = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop();
      part.push(i);
      const x = i % w;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (n < 0 || n >= w * h || seen[n] || t[n] < PLAINS) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (part.length < min) for (const i of part) t[i] = SEA;
  }
}

// Terrain as a short string for the players' screens: one letter per run of equal tiles
// ('a' + kind), followed by the run's length in base 36 (digits and capitals) when it's > 1.
export function packTerrain(t) {
  let out = "";
  for (let i = 0; i < t.length; ) {
    const v = t[i];
    let j = i + 1;
    while (j < t.length && t[j] === v) j++;
    out += String.fromCharCode(97 + v) + (j - i > 1 ? (j - i).toString(36).toUpperCase() : "");
    i = j;
  }
  return out;
}
