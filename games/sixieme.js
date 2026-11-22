// Sixième Bœuf — règles du jeu (module serveur).
// Le socle (server.js) gère les tables, le chat et les connexions ; ce module ne gère que la partie.
const crypto = require("crypto");

const heads = n => (n === 55 ? 7 : n % 11 === 0 ? 5 : n % 10 === 0 ? 3 : n % 5 === 0 ? 2 : 1);
const rowHeads = r => r.reduce((a, c) => a + heads(c), 0);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

module.exports = {
  id: "sixieme",
  name: "Sixième Bœuf",
  minPlayers: 2,
  maxPlayers: 10,
  defaults: { threshold: 66, hand: 10, rows: 4, rowMax: 5, maxCard: 104, tactical: false, turnTime: 0, speed: 1 },
  schema: {
    threshold: { type: "int", min: 10, max: 500 },
    hand: { type: "int", min: 3, max: 15 },
    rows: { type: "int", min: 2, max: 6 },
    rowMax: { type: "int", min: 3, max: 8 },
    maxCard: { type: "int", min: 40, max: 200 },
    turnTime: { type: "int", min: 0, max: 300 },
    speed: { type: "num", min: 0.4, max: 3 },
    tactical: { type: "bool" },
  },

  validateStart(room, seated) {
    const s = room.settings;
    if (seated.length * s.hand + s.rows > s.maxCard) return `Pas assez de cartes : il en faut ${seated.length * s.hand + s.rows}.`;
    return null;
  },

  start(room, seated, ctx) {
    room.g = {
      phase: "choose", players: seated.map(m => ({ id: m.id, name: m.name, color: m.color, total: 0, round: 0, pile: 0, lastRound: 0 })),
      hands: {}, rows: [], locked: {}, reveal: [], step: 0, waiting: null, deadline: 0, round: 0, turn: 0, ev: null, seq: 0, autoLast: false,
    };
    deal(room, ctx);
    ctx.sys(`La partie commence ! Fin à ${room.settings.threshold} têtes.`);
  },

  rename(room, member) {
    const p = room.g?.players.find(x => x.id === member.id);
    if (p) { p.name = member.name; p.color = member.color; }
  },

  isPlayer: (room, id) => !!room.g?.players.some(p => p.id === id),

  view(room, id, ctx) {
    const g = room.g;
    return {
      phase: g.phase,
      players: g.players.map(p => ({
        id: p.id, name: p.name, color: p.color, total: p.total, round: p.round, pile: p.pile, lastRound: p.lastRound,
        online: ctx.online(p.id), handCount: (g.hands[p.id] || []).length, locked: g.locked[p.id] != null,
      })),
      hand: [...(g.hands[id] || [])],
      myPick: g.locked[id] ?? null,
      rows: g.rows, reveal: g.reveal.slice(g.step), waiting: g.waiting,
      deadlineIn: g.deadline ? Math.max(0, g.deadline - Date.now()) : 0,
      round: g.round, turn: g.turn, ev: g.ev, autoLast: g.autoLast,
    };
  },

  action(room, member, msg, ctx) {
    const g = room.g, p = g.players.find(x => x.id === member.id);
    switch (msg.t) {
      case "pick": {
        if (!p || g.phase !== "choose" || g.locked[p.id] != null || g.autoLast) return;
        const c = Number(msg.c); if (!(g.hands[p.id] || []).includes(c)) return;
        g.locked[p.id] = c; ctx.broadcast(); return maybeReveal(room, ctx);
      }
      case "row": {
        if (g.phase !== "pickRow" || g.waiting !== member.id) return;
        const r = Number(msg.r); if (!Number.isInteger(r) || r < 0 || r >= g.rows.length) return;
        return takeRow(room, r, ctx);
      }
      case "force": {
        if (!ctx.isHost) return;
        if (g.phase === "choose") return autoPick(room, ctx);
        if (g.phase === "pickRow") return autoRow(room, ctx);
        return;
      }
      case "next": { if (!ctx.isHost || g.phase !== "roundEnd") return; deal(room, ctx); return ctx.broadcast(); }
      case "stop": { if (!ctx.isHost || g.phase !== "roundEnd") return; g.phase = "over"; return ctx.broadcast(); }
    }
  },
};

/* ---------------- moteur ---------------- */
const delay = (room, ms) => ms / (room.settings.speed || 1);
function deal(room, ctx) {
  const s = room.settings, g = room.g, n = g.players.length;
  const top = s.tactical ? Math.min(s.maxCard, n * s.hand + s.rows) : s.maxCard;
  const deck = shuffle(Array.from({ length: top }, (_, i) => i + 1));
  g.hands = {};
  for (const p of g.players) { g.hands[p.id] = deck.splice(0, s.hand).sort((a, b) => a - b); p.round = 0; p.pile = 0; }
  g.rows = Array.from({ length: s.rows }, () => [deck.pop()]).sort((a, b) => a[0] - b[0]);
  g.round += 1; g.turn = 1;
  beginTurn(room, ctx);
}
function beginTurn(room, ctx) {
  const g = room.g;
  g.phase = "choose"; g.locked = {}; g.reveal = []; g.step = 0; g.waiting = null;
  g.deadline = room.settings.turnTime ? Date.now() + room.settings.turnTime * 1000 : 0;
  if (g.deadline) ctx.schedule(() => autoPick(room, ctx), g.deadline - Date.now()); else ctx.clearTimer();
  // Dernière carte : aucun choix possible, on la joue pour tout le monde.
  if (g.players.every(p => (g.hands[p.id] || []).length === 1)) {
    for (const p of g.players) g.locked[p.id] = g.hands[p.id][0];
    g.deadline = 0; g.autoLast = true;
    ctx.schedule(() => startReveal(room, ctx), delay(room, 1400));
  } else g.autoLast = false;
}
function maybeReveal(room, ctx) {
  const g = room.g;
  if (g.phase === "choose" && !g.autoLast && g.players.every(p => g.locked[p.id] != null)) ctx.schedule(() => startReveal(room, ctx), 500);
}
function autoPick(room, ctx) {
  const g = room.g; if (g.phase !== "choose") return;
  for (const p of g.players) if (g.locked[p.id] == null) { const h = g.hands[p.id]; g.locked[p.id] = h[crypto.randomInt(h.length)]; }
  ctx.broadcast(); maybeReveal(room, ctx);
}
function startReveal(room, ctx) {
  const g = room.g; if (g.phase !== "choose") return;
  g.reveal = g.players.map(p => ({ id: p.id, c: g.locked[p.id] })).sort((a, b) => a.c - b.c);
  for (const r of g.reveal) g.hands[r.id] = g.hands[r.id].filter(c => c !== r.c);
  g.step = 0; g.phase = "reveal"; g.deadline = 0;
  ctx.broadcast();
  ctx.schedule(() => step(room, ctx), delay(room, 1900));
}
function take(room, id, ri, c, ctx) {
  const g = room.g, taken = g.rows[ri], h = rowHeads(taken), p = g.players.find(x => x.id === id);
  p.round += h; p.pile += taken.length; g.rows[ri] = [c];
  g.ev = { type: "take", id, h, n: taken.length, seq: ++g.seq };
  ctx.sys(`${p.name} ramasse ${taken.length} carte${taken.length > 1 ? "s" : ""} (${h} tête${h > 1 ? "s" : ""}) · total ${p.total + p.round}/${room.settings.threshold}`);
}
function step(room, ctx) {
  const g = room.g; if (g.phase !== "reveal") return;
  if (g.step >= g.reveal.length) return endTurn(room, ctx);
  const { id, c } = g.reveal[g.step];
  let best = -1, bv = -1;
  g.rows.forEach((r, i) => { const last = r[r.length - 1]; if (last < c && last > bv) { bv = last; best = i; } });
  if (best < 0) {
    g.phase = "pickRow"; g.waiting = id;
    g.deadline = room.settings.turnTime ? Date.now() + room.settings.turnTime * 1000 : 0;
    g.ev = { type: "low", id, seq: ++g.seq };
    if (g.deadline) ctx.schedule(() => autoRow(room, ctx), g.deadline - Date.now()); else ctx.clearTimer();
    return ctx.broadcast();
  }
  if (g.rows[best].length >= room.settings.rowMax) take(room, id, best, c, ctx); else g.rows[best].push(c);
  g.step++;
  ctx.broadcast();
  ctx.schedule(() => step(room, ctx), delay(room, 1200));
}
function takeRow(room, r, ctx) {
  const g = room.g, { id, c } = g.reveal[g.step];
  take(room, id, r, c, ctx);
  g.step++; g.phase = "reveal"; g.waiting = null; g.deadline = 0;
  ctx.broadcast();
  ctx.schedule(() => step(room, ctx), delay(room, 1200));
}
function autoRow(room, ctx) {
  const g = room.g; if (g.phase !== "pickRow") return;
  let best = 0, bv = Infinity;
  g.rows.forEach((r, i) => { const t = rowHeads(r); if (t < bv) { bv = t; best = i; } });
  takeRow(room, best, ctx);
}
function endTurn(room, ctx) {
  const g = room.g;
  if (g.players.every(p => (g.hands[p.id] || []).length === 0)) {
    for (const p of g.players) { p.total += p.round; p.lastRound = p.round; p.round = 0; }
    g.phase = g.players.some(p => p.total >= room.settings.threshold) ? "over" : "roundEnd";
    if (g.phase === "over") { const w = [...g.players].sort((a, b) => a.total - b.total)[0]; ctx.sys(`Partie terminée : ${w.name} gagne avec ${w.total} têtes !`); }
    else ctx.sys(`Fin de la manche ${g.round}.`);
    g.deadline = 0; ctx.clearTimer();
    return ctx.broadcast();
  }
  g.turn++; beginTurn(room, ctx); ctx.broadcast();
}
