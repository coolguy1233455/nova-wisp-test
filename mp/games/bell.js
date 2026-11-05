// Don't Ring the Bell: a cup sits over a bell. One player rests a hand on the cup, the other
// yanks the cup away with Q whenever they like. The hand drops onto the bell unless its owner
// pulls it back with E in time; pulling back before the cup moves is a flinch. Each round the
// players swap places by themselves, the reaction window gets shorter and the hands move
// faster. Q has a cooldown at the start of every round; E never does. First to 5 wins.
//
// Reaction times are measured on the holder's own device (from the moment the cup lifts on
// their screen), so a slow connection doesn't count against them; the server only checks
// that the answer came back in a believable time.
const TARGET = 5;
const FIRST_WINDOW = 650; // ms the holder has to pull back in round 1
const MIN_WINDOW = 200;
const AUTO_AFTER = 6000; // the remover must pull by then, or the cup lifts by itself

export default {
  id: "bell",
  name: "Don't Ring the Bell",
  ranked: true,
  modes: ["1v1"],
  min: 2,
  max: 2,
  info: {
    blurb: "One hand on the cup, one on the trigger. Pull back before the bell rings.",
    how: "Holder: keep your hand on the cup and press E the instant the cup lifts (pressing early is a flinch). Remover: press Q to yank the cup away, whenever you like, once its cooldown ends. Roles swap every round and everything gets faster. First to 5 points wins.",
    keys: "Q remove the cup · E pull your hand back",
  },

  create(room) {
    const [a, b] = room.players;
    const g = { scores: { [a.uid]: 0, [b.uid]: 0 }, holder: a.uid, remover: b.uid, round: 0, phase: "ready", log: [] };
    nextRound(room, g, true);
    return g;
  },

  action(room, g, p, a) {
    if (a.k === "Q" && p.uid === g.remover && g.phase === "armed" && Date.now() >= g.coolUntil) lift(room, g, "pulled");
    if (a.k === "E" && p.uid === g.holder) {
      if (g.phase === "armed") return score(room, g, g.remover, "flinched");
      if (g.phase !== "lifted") return;
      const rt = Number(a.rt);
      const elapsed = Date.now() - g.liftedAt;
      // Believable: measured on their screen, inside the window, and not faster than the network allows.
      if (rt >= 0 && rt <= g.window && elapsed < g.window + 2000) score(room, g, g.holder, "dodged", Math.round(rt));
    }
  },

  view(room, g, uid) {
    return {
      scores: g.scores,
      holder: g.holder,
      remover: g.remover,
      round: g.round,
      phase: g.phase,
      window: g.window,
      speed: g.speed,
      cool: Math.max(0, g.coolUntil - Date.now()),
      autoIn: g.phase === "armed" ? Math.max(0, g.autoAt - Date.now()) : 0,
      last: g.last || null,
      target: TARGET,
      lift: g.liftId,
    };
  },

  leave(room, g, p) {
    const other = room.players.find((x) => x.uid !== p.uid);
    room.end({ winners: [other.uid], reason: `${p.name} left` });
  },
};

function nextRound(room, g, first = false) {
  if (!first) [g.holder, g.remover] = [g.remover, g.holder];
  g.round++;
  g.window = Math.max(MIN_WINDOW, Math.round(FIRST_WINDOW * 0.92 ** (g.round - 1)));
  g.speed = Math.min(3, 1 + (g.round - 1) * 0.12);
  g.phase = "ready";
  room.update();
  room.timer(1400, () => {
    g.phase = "armed";
    const cool = Math.max(350, 1200 - g.round * 60);
    g.coolUntil = Date.now() + cool;
    g.autoAt = Date.now() + AUTO_AFTER;
    room.update();
    // Too slow to pull: the cup lifts by itself at a random moment soon after.
    g.autoTimer = room.timer(AUTO_AFTER + Math.random() * 1500, () => g.phase === "armed" && lift(room, g, "auto"));
  });
}

function lift(room, g, how) {
  g.phase = "lifted";
  g.liftedAt = Date.now();
  g.liftId = (g.liftId || 0) + 1;
  g.how = how;
  room.update();
  // No answer in time (plus the trip back): the hand hits the bell.
  room.timer(g.window + 1500, () => g.phase === "lifted" && score(room, g, g.remover, "rang"));
}

function score(room, g, winner, what, rt = null) {
  if (g.phase === "scored") return;
  g.phase = "scored";
  g.scores[winner]++;
  g.last = { winner, what, rt, holder: g.holder };
  room.update();
  if (g.scores[winner] >= TARGET) return room.timer(1200, () => room.end({ winners: [winner], reason: `First to ${TARGET}` }));
  room.timer(1600, () => nextRound(room, g));
}
