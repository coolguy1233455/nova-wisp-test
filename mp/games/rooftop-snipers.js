// Rooftop Snipers (New Eich Games), the one already in Nova's games, played online through
// remote play (remote.js): the party's host runs the real game and streams it; everyone's
// key presses are replayed there. Each side has two buttons: Player 1 jumps with W and shoots
// with E, Player 2 jumps with I and shoots with O. 1v1: each player has both of their side's
// buttons. 2v2: teammates split them, one jumps and one shoots (they can swap jobs).
import { remoteGame, teamOf } from "./remote.js";

export default remoteGame({
  id: "rooftop-snipers",
  name: "Rooftop Snipers",
  ranked: true,
  modes: ["1v1", "teams"],
  min: 2,
  max: 4,
  teamSize: 2,
  teamGame: true,
  canSwap: true,
  info: {
    blurb: "Two buttons, one rooftop: jump, shoot and knock the other side off.",
    how: "Create a party, wait for your friend to join and press Start: the game opens in Two Player mode by itself, then each of you presses Jump to get ready. Red is Player 1 (left), Blue is Player 2 (right). In 1v1 you have both of your side's buttons: jump (W or ↑) and shoot (hold E or Space to raise the gun, let go to fire). In 2v2 one of you jumps and the other shoots (you can swap jobs). First to 5 wins; when the game shows the winner, tap who won under the game (it counts once you agree, or after 30 seconds if nobody disagrees). Whoever creates the party runs the game on their device, so they should keep the tab open.",
    keys: "W or ↑: jump · E or Space: shoot (2v2: any key does your job) · on a phone or iPad: the big buttons",
    cover: "/games/rooftop-snipers/thumb.webp",
  },
  // 1v1, or alone on a team: both buttons. Two on a team: the first to join jumps, the other
  // shoots (swapped when they ask).
  roles(room, g) {
    const out = {};
    for (const t of [0, 1]) {
      const list = teamOf(room, t);
      if (list.length === 1) out[list[0].uid] = "both";
      if (list.length >= 2) {
        const [a, b] = g.swaps[t] ? [list[1], list[0]] : [list[0], list[1]];
        out[a.uid] = "jump";
        out[b.uid] = "shoot";
        for (const extra of list.slice(2)) out[extra.uid] = "both";
      }
    }
    return out;
  },
});
