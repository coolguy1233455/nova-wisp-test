// Find The Needle in Haystack, the one already in Nova's games, played together through
// remote play (remote.js): the party's host runs the real game and streams it; everyone's
// keys and mouse go into that one game, so the whole party digs as one farmer. Not ranked,
// no teams; anyone can end it with "We found it!" or "Done". People can join while it's on.
import { remoteGame } from "./remote.js";

export default remoteGame({
  id: "needle",
  name: "Find the Needle",
  ranked: false,
  modes: ["coop"],
  min: 1,
  max: 5,
  teamGame: false,
  joinPlaying: true,
  info: {
    blurb: "Dig through a giant haystack together, sell the hay, buy upgrades and find the needle. Up to 5 friends, one farmer.",
    how: "Create a party and press Start (friends can join any time, even mid-game): the game skips its intro by itself. Everyone works together: all of your keys and mouse go into the same game, so you share one farmer. Click the game to take control: the mouse looks around (Esc gives it back), WASD moves, Space jumps and the mouse button digs. Little tags show who is pressing what. When you find the needle press \"We found it!\", or \"Done\" to stop; either ends the game for everyone. Whoever creates the party runs the game on their device, so they should keep the tab open.",
    keys: "WASD move · mouse look · click or hold to dig · Space jump · Esc frees the mouse",
    cover: "/games/find-the-needle-in-haystack/thumb.webp",
  },
  roles(room) {
    return Object.fromEntries(room.active.map((p) => [p.uid, "all"]));
  },
});
