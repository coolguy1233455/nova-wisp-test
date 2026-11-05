// Every multiplayer game, in the order the Multiplayer page lists them. Each module exports
// its rules (see bell.js for a small complete one, and the notes in ../index.js):
//   id, name, ranked, modes ["1v1" | "ffa" | "teams" | "coop"], min, max, teamSize,
//   options [{ key, label, type: "number" | "select" | "bool", min, max, def, choices }],
//   variants { id: { name, modes, min, max, ranked, ... } } (card games),
//   info { blurb, how, keys }, joinPlaying, unlimited, relay, noHost, graceMs,
//   create(room) -> state, action(room, state, player, a), view(room, state, uid|null),
//   tick(room, state, dt), join/leave/disconnect(room, state, player), message(room, state,
//   client, msg), summary(room, state), boot(site, api), shutdown(api), close(room, state).
import worldEmpire from "./world-empire.js";
import mafia from "./mafia.js";
import guesser from "./guesser.js";
import wordBomb from "./word-bomb.js";
import reefRush from "./reef-rush.js";
import cards from "./cards.js";
import chess from "./chess.js";
import bell from "./bell.js";
import basketRandom from "./basket-random.js";
import rooftopSnipers from "./rooftop-snipers.js";
import needle from "./needle.js";

// World Empire first, as the user asked.
const list = [worldEmpire, mafia, guesser, wordBomb, reefRush, cards, chess, bell, basketRandom, rooftopSnipers, needle];

export const GAMES = Object.fromEntries(list.map((g) => [g.id, g]));

// What the Multiplayer page needs to know about each game (sent with "welcome").
export const catalog = () =>
  list.map((g) => ({
    id: g.id,
    name: g.name,
    ranked: !!g.ranked,
    modes: g.modes,
    min: g.min,
    max: g.max,
    teamSize: g.teamSize || null,
    unlimited: !!g.unlimited,
    joinPlaying: !!g.joinPlaying,
    noHost: !!g.noHost,
    options: g.options || [],
    info: g.info || {},
    variants: g.variants
      ? Object.entries(g.variants).map(([id, v]) => ({ id, name: v.name, ranked: v.ranked ?? !!g.ranked, modes: v.modes || g.modes, min: v.min ?? g.min, max: v.max ?? g.max, teamSize: v.teamSize || null, options: v.options || g.options || [], info: v.info || {} }))
      : null,
  }));
