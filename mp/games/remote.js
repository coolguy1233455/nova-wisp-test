// Remote play: games Nova already has (other people's builds, so their code can't change)
// played together over the internet. The party's host runs the real game in a frame on their
// own screen; everyone else sees a live picture of it (JPEG frames the host's page sends
// through the "rp" relay in ../index.js, rules.relay) and their key presses travel back to
// the host, whose page replays them into the game as that player's keys. The pictures and
// keys never come through here as game actions; this file only keeps the small part of the
// rules a server can know: who controls what (roles), who won (the players report it), and
// what happens when people leave.
//
// Who won: the game itself shows the score, so the players report the winner with a button.
// Any player can report (or say "no contest"), and change their mind until it's settled.
//   - Everyone still connected reports the same result: it stands at once.
//   - Reports so far all agree and nobody says otherwise for 30 seconds: it stands (so a
//     loser who never answers can't hold the round hostage).
//   - Reports disagree: nothing happens until someone changes theirs.
// "No contest" calls the round off (room.end aborted: nobody wins, ratings stay).
// If the host leaves, the game (which ran on their screen) is gone: the round is called off
// (no winner, ratings stay), unless the reports made so far already agreed on a result.
//
// Each game file gives: id, name, ranked, modes, min, max, teamSize, info, options, and
//   roles(room, g) -> { uid: "both" | "jump" | "shoot" | "all" }  (what each player controls)
//   teamGame: true (players report a winner) or false (co-op: a "Done" button ends it)
const SETTLE_MS = 30_000;

export function remoteGame(def) {
  const game = {
    relay: true,
    graceMs: 30_000,
    options: def.options || [],
    ...def,

    create(room) {
      const g = { host: room.host, startedAt: Date.now(), roles: {}, votes: {}, settleAt: 0, settleTimer: null, swaps: {} };
      g.roles = def.roles(room, g);
      return g;
    },

    action(room, g, p, a) {
      if (a.k === "vote" && def.teamGame) {
        const w = a.w === "none" ? "none" : a.w === 0 || a.w === 1 ? a.w : null;
        if (w === null) delete g.votes[p.uid];
        else g.votes[p.uid] = w;
        settle(room, g);
        room.update();
      }
      // Two teammates who split a team's buttons can trade them.
      if (a.k === "swap" && def.canSwap) {
        g.swaps[p.team] = !g.swaps[p.team];
        g.roles = def.roles(room, g);
        room.update();
        room.toast(`${p.name} swapped jobs with their teammate`);
      }
      // Co-op: anyone can finish the round for everyone.
      if (a.k === "done" && !def.teamGame) {
        const mins = Math.max(1, Math.round((Date.now() - g.startedAt) / 60000));
        room.end({ draw: true, reason: a.found ? `${p.name} called it: you found the needle! (${mins} min)` : `${p.name} ended the game after ${mins} min` });
      }
    },

    view(room, g, uid) {
      return {
        host: g.host,
        roles: g.roles,
        votes: g.votes,
        settleIn: g.settleAt ? Math.max(0, g.settleAt - Date.now()) : 0,
        elapsed: Date.now() - g.startedAt,
        swapped: g.swaps,
      };
    },

    join(room, g, p) {
      g.roles = def.roles(room, g);
      room.update();
    },

    leave(room, g, p, why) {
      delete g.votes[p.uid];
      if (p.uid === g.host) {
        const agreed = agreedValue(room, g);
        if (agreed !== null) return finish(room, g, agreed, "The host left; the reported result stands");
        return room.end({ aborted: true, reason: `${p.name} (the host) left, so the game ended` });
      }
      if (def.teamGame) {
        // A whole team gone: the other team wins.
        const left = room.active.filter((x) => x.team === p.team);
        if (!left.length) {
          const others = room.players.filter((x) => x.team !== p.team).map((x) => x.uid);
          return room.end({ winners: others, reason: `${p.name} left` });
        }
      }
      g.roles = def.roles(room, g);
      settle(room, g);
      room.update();
    },

    disconnect(room, g, p) {
      if (p.uid === g.host) room.toast(`${p.name} (the host) lost connection. Waiting up to 30 seconds for them…`);
      settle(room, g);
      room.update();
    },

    summary(room, g) {
      const host = room.players.find((x) => x.uid === room.host);
      return host ? { text: `hosted by ${host.name}` } : null;
    },
  };
  return game;
}

// The result every report so far agrees on (team 0 / 1 or "none"), or null.
function agreedValue(room, g) {
  const vals = room.active.filter((p) => p.uid in g.votes).map((p) => g.votes[p.uid]);
  if (!vals.length || vals.some((v) => v !== vals[0])) return null;
  return vals[0];
}

function settle(room, g) {
  for (const uid of Object.keys(g.votes)) if (!room.player(uid)) delete g.votes[uid];
  const agreed = agreedValue(room, g);
  const here = room.active.filter((p) => p.connected);
  if (agreed !== null && here.length && here.every((p) => g.votes[p.uid] === agreed)) return finish(room, g, agreed, "Everyone agreed");
  if (agreed === null) {
    g.settleAt = 0;
    return;
  }
  // Uncontested so far: it stands in 30 seconds unless someone disagrees. A change of mind
  // (to the same result) doesn't restart the clock.
  if (g.settleAt && g.settleValue === agreed) return;
  g.settleAt = Date.now() + SETTLE_MS;
  g.settleValue = agreed;
  const at = g.settleAt;
  room.timer(SETTLE_MS + 50, () => {
    if (g.settleAt === at && agreedValue(room, g) === g.settleValue) finish(room, g, g.settleValue, "Nobody disagreed within 30 seconds");
  });
}

function finish(room, g, value, how) {
  g.settleAt = 0;
  if (value === "none") return room.end({ aborted: true, reason: `No contest (${how.toLowerCase()})` });
  const winners = room.players.filter((p) => p.team === value).map((p) => p.uid);
  if (!winners.length) return room.end({ aborted: true, reason: "No result" });
  room.end({ winners, reason: `Reported by the players: ${how.toLowerCase()}` });
}

// Team helpers for roles(): the players of a team in the order they joined.
export const teamOf = (room, t) => room.active.filter((p) => p.team === t);
