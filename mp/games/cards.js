// Card Games: one game on the Multiplayer page with a choice of card games (its variants).
// Each variant's rules live in their own file in cards/ and keep a separate rating
// ("cards:poker", "cards:scopa", ...; the core does that from room.variant). This file only
// lists them and hands every call to the variant the party is playing.
//
// Hidden cards stay here: each player's view only holds their own hand plus what's on the
// table, and spectators only see the table.
import poker from "./cards/poker.js";
import spit from "./cards/spit.js";
import scopa from "./cards/scopa.js";
import crazyEights from "./cards/crazy-eights.js";
import goFish from "./cards/go-fish.js";
import war from "./cards/war.js";
import hearts from "./cards/hearts.js";

const VARIANTS = { poker, spit, scopa, "crazy-eights": crazyEights, "go-fish": goFish, hearts, war };

// What the lobby needs about each variant (the core merges it over the fields below).
const META = ["name", "modes", "min", "max", "ranked", "teamSize", "options", "info", "fixOpts"];
const variants = Object.fromEntries(Object.entries(VARIANTS).map(([id, v]) => [id, Object.fromEntries(META.filter((k) => v[k] !== undefined).map((k) => [k, v[k]]))]));

const rulesFor = (room) => VARIANTS[room.variant] || poker;

export default {
  id: "cards",
  name: "Card Games",
  ranked: true,
  modes: ["ffa"],
  min: 2,
  max: 8,
  variants,
  info: {
    blurb: "Poker, Spit, Scopa, Crazy Eights, Go Fish, Hearts and War. Pick a game, then host a table or find one.",
    how: "Choose a card game above. Each one has its own rating when you play it ranked (War is pure luck, so it's never ranked).",
  },
  create: (room) => rulesFor(room).create(room),
  action(room, g, p, a) {
    if (g) rulesFor(room).action(room, g, p, a);
  },
  view(room, g, uid) {
    if (!g) return null;
    return { ...rulesFor(room).view(room, g, uid), variant: room.variant };
  },
  tick(room, g, dt) {
    if (g) rulesFor(room).tick?.(room, g, dt);
  },
  leave(room, g, p, why) {
    if (g) rulesFor(room).leave?.(room, g, p, why);
  },
  summary: (room, g) => (g ? rulesFor(room).summary?.(room, g) || null : null),
};
