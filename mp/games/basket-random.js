// Basket Random (RHM Interactive), the one already in Nova's games, played online through
// remote play (remote.js): the party's host runs the real game and streams it; everyone's
// key presses are replayed there. The game has one button per team (Player 1: W, Player 2:
// ↑) that makes both of that team's ragdolls jump and swing. 1v1: each player has their
// team's button. 2v2: the game can't move one ragdoll on its own, so both teammates share
// their team's button (either one pressing jumps both); that's as close to "one each" as
// this game allows, and the screen says so.
import { remoteGame } from "./remote.js";

export default remoteGame({
  id: "basket-random",
  name: "Basket Random",
  ranked: true,
  modes: ["1v1", "teams"],
  min: 2,
  max: 4,
  teamSize: 2,
  teamGame: true,
  info: {
    blurb: "Floppy one-button basketball where the court, ball and players change every point.",
    how: "Create a party, wait for your friend to join and press Start: the game opens in 2-player mode by itself. Each side has ONE button that makes both of its players jump and swing: you're the left side (Player 1) or the right side (Player 2). Everyone presses W, ↑ or Space (or the big Jump button on an iPad). In 2v2 you and your teammate share your side's button. First to 5 baskets wins; when the game shows the winner, tap who won under the game (it counts once you agree, or after 30 seconds if nobody disagrees). Whoever creates the party runs the game on their device, so they should keep the tab open.",
    keys: "W, ↑ or Space: jump (your team's button) · on a phone or iPad: the big Jump button",
    cover: "/games/basket-random/thumb.webp",
  },
  // Everyone presses their team's one key.
  roles(room) {
    return Object.fromEntries(room.active.map((p) => [p.uid, "both"]));
  },
});
