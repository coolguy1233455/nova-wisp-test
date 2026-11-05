// Basket Random (RHM Interactive), the one already in Nova's games, played online through
// remote play (remote.js): the host's screen runs the real game and streams it; everyone's
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
    blurb: "Floppy one-button basketball where the court, ball and players change every point. Online, on the host's screen.",
    how: "The host's screen runs the real game and streams it to everyone else, who play through the live picture (so the host should be on a good connection and keep the tab open). The host picks 2 Players in the game's menu. Each team has ONE button that makes both of its players jump and swing: the left team (Red, the game's Player 1) and the right team (Blue, Player 2). In 1v1 that button is yours. In 2v2 the game can't move one player on its own, so you and your teammate share your team's button: either of you pressing it jumps both. Everyone presses W, ↑ or Space; the host's page turns it into the right team's key. When the game shows a winner, report it with the buttons under the picture: it counts once everyone agrees, or after 30 seconds if nobody disagrees.",
    keys: "W, ↑ or Space: jump (your team's button) · on a phone or iPad: the big Jump button",
    cover: "/games/basket-random/thumb.webp",
  },
  // Everyone presses their team's one key.
  roles(room) {
    return Object.fromEntries(room.active.map((p) => [p.uid, "both"]));
  },
});
