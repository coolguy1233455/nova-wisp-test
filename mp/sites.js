// Who may play, and where results are kept. Nova's sites hand their members a token signed
// with the site's own Ed25519 key (lib/members.js, op=mp-token); this server checks it with
// the site's public key, which it reads from the site itself (GET <site>/api/mp?op=key). No
// secret lives here: what this server sends back to a site (ratings, results, saved worlds)
// is signed with a key made fresh at every start, and the site checks it by reading
// GET <this server>/mp/key.
import { createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

// Site id -> address. MP_SITES adds or replaces some, e.g. "local=http://localhost:8098".
export const SITES = { brez: "https://www.brezmerch.com", mf: "https://www.mathisfuns.com" };
for (const pair of String(process.env.MP_SITES || "").split(",")) {
  const [id, url] = pair.split("=").map((s) => s?.trim());
  if (id && url) SITES[id] = url.replace(/\/+$/, "");
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

// This server's own key, for what it sends to the sites.
const own = generateKeyPairSync("ed25519");
export const publicKey = b64url(own.publicKey.export({ format: "der", type: "spki" }).subarray(SPKI_ED25519.length));

const siteKeys = new Map(); // site -> { at, key }
async function siteKey(site, fresh = false) {
  const known = siteKeys.get(site);
  if (known && !fresh && Date.now() - known.at < 3600_000) return known.key;
  const url = SITES[site];
  if (!url) return null;
  const r = await fetch(`${url}/api/mp?op=key`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${site} key: ${r.status}`);
  const { key } = await r.json();
  const pub = createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(key, "base64url")]), format: "der", type: "spki" });
  siteKeys.set(site, { at: Date.now(), key: pub });
  return pub;
}

// A member's token: "<payload>.<signature>", the payload being base64url JSON
// { v, site, uid, name, photo, adm, exp }. Returns the payload, or null.
export async function checkToken(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  let p;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!p || typeof p.uid !== "string" || !SITES[p.site] || !(p.exp > Date.now() / 1000)) return null;
  for (const fresh of [false, true]) {
    try {
      const key = await siteKey(p.site, fresh);
      if (key && verify(null, Buffer.from(body), key, Buffer.from(sig, "base64url"))) return p;
    } catch (err) {
      console.log("mp: can't read the site key:", err.message);
      return null;
    }
  }
  return null;
}

// A signed call to a site's /api/mp: { op, data, ts, sig }.
export async function siteCall(site, op, data = {}) {
  const url = SITES[site];
  if (!url) throw new Error(`unknown site ${site}`);
  const ts = Date.now();
  const json = JSON.stringify(data);
  const sig = b64url(sign(null, Buffer.from(`${op}.${ts}.${json}`), own.privateKey));
  const r = await fetch(`${url}/api/mp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, ts, data: json, sig }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`${site} ${op}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
