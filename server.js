// Sixième Bœuf — serveur de jeu (HTTP + WebSocket).
// Le serveur est l'arbitre : il distribue, garde les mains secrètes et résout les tours.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const DEFAULTS = { threshold: 66, hand: 10, rows: 4, rowMax: 5, maxCard: 104, tactical: false, turnTime: 0, speed: 1 };
const LIMITS = {
  threshold: [10, 500], hand: [3, 15], rows: [2, 6], rowMax: [3, 8], maxCard: [40, 200],
  turnTime: [0, 300], speed: [0.4, 3],
};
const MAX_PLAYERS = 10;
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000; // une table vide est supprimée après 3 h

const heads = n => (n === 55 ? 7 : n % 11 === 0 ? 5 : n % 10 === 0 ? 3 : n % 5 === 0 ? 2 : 1);
const rowHeads = r => r.reduce((a, c) => a + heads(c), 0);
const rid = (n = 16) => crypto.randomBytes(n).toString("hex");
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cleanName = s => String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 20);
const cleanColor = s => (/^#[0-9a-fA-F]{6}$/.test(String(s)) ? String(s) : "#ffb22e");

const rooms = new Map();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
  let c;
  do { c = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(""); } while (rooms.has(c));
  return c;
}

/* ---------------- HTTP ---------------- */
const indexHtml = () => fs.readFileSync(path.join(__dirname, "public", "index.html"));
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    return res.end(indexHtml());
  }
  res.writeHead(404, { "content-type": "text/plain" }); res.end("Introuvable");
});

/* ---------------- Rooms ---------------- */
function createRoom() {
  const room = {
    code: newCode(), hostId: null, settings: { ...DEFAULTS }, phase: "lobby",
    members: new Map(), // id -> {id, token, name, color, sockets:Set}
    players: [], hands: {}, rows: [], locked: {}, reveal: [], step: 0, waiting: null,
    deadline: 0, round: 0, turn: 0, ev: null, seq: 0, timer: null, lastActive: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}
const online = (room, id) => (room.members.get(id)?.sockets.size || 0) > 0;
const playerOf = (room, id) => room.players.find(p => p.id === id);

function viewFor(room, id) {
  const inGame = room.phase !== "lobby";
  const members = [...room.members.values()];
  return {
    code: room.code, you: id, hostId: room.hostId, settings: room.settings, phase: room.phase,
    lobby: room.phase === "lobby" ? members.filter(m => m.seated).map(m => ({ id: m.id, name: m.name, color: m.color, online: online(room, m.id) })) : [],
    players: room.players.map(p => ({
      id: p.id, name: p.name, color: p.color, total: p.total, round: p.round, pile: p.pile, lastRound: p.lastRound,
      online: online(room, p.id), handCount: (room.hands[p.id] || []).length, locked: room.locked[p.id] != null,
    })),
    hand: inGame ? [...(room.hands[id] || [])] : [],
    myPick: room.locked[id] ?? null,
    rows: room.rows, reveal: room.reveal.slice(room.step), waiting: room.waiting,
    deadlineIn: room.deadline ? Math.max(0, room.deadline - Date.now()) : 0,
    round: room.round, turn: room.turn, ev: room.ev,
    spectators: members.filter(m => !playerOf(room, m.id) && online(room, m.id) && room.phase !== "lobby").length,
  };
}
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room) {
  room.lastActive = Date.now();
  for (const m of room.members.values()) {
    if (!m.sockets.size) continue;
    const v = viewFor(room, m.id);
    for (const ws of m.sockets) send(ws, { t: "state", state: v });
  }
}

/* ---------------- Engine ---------------- */
const delay = (room, ms) => ms / (room.settings.speed || 1);
function schedule(room, fn, ms) { clearTimeout(room.timer); room.timer = setTimeout(() => { fn(); }, Math.max(0, ms)); }

function startGame(room) {
  const seated = [...room.members.values()].filter(m => m.seated).slice(0, MAX_PLAYERS);
  const s = room.settings;
  if (seated.length < 2) return "Il faut au moins 2 joueurs.";
  if (seated.length * s.hand + s.rows > s.maxCard) return `Pas assez de cartes : il en faut ${seated.length * s.hand + s.rows}.`;
  room.players = seated.map(m => ({ id: m.id, name: m.name, color: m.color, total: 0, round: 0, pile: 0, lastRound: 0 }));
  room.round = 0; room.ev = null;
  deal(room);
  return null;
}
function deal(room) {
  const s = room.settings, n = room.players.length;
  const top = s.tactical ? Math.min(s.maxCard, n * s.hand + s.rows) : s.maxCard;
  const deck = shuffle(Array.from({ length: top }, (_, i) => i + 1));
  room.hands = {};
  for (const p of room.players) { room.hands[p.id] = deck.splice(0, s.hand).sort((a, b) => a - b); p.round = 0; p.pile = 0; }
  room.rows = Array.from({ length: s.rows }, () => [deck.pop()]).sort((a, b) => a[0] - b[0]);
  room.round += 1; room.turn = 1;
  beginTurn(room);
}
function beginTurn(room) {
  room.phase = "choose"; room.locked = {}; room.reveal = []; room.step = 0; room.waiting = null;
  room.deadline = room.settings.turnTime ? Date.now() + room.settings.turnTime * 1000 : 0;
  if (room.deadline) schedule(room, () => autoPick(room), room.deadline - Date.now()); else clearTimeout(room.timer);
}
function maybeReveal(room) {
  if (room.phase === "choose" && room.players.every(p => room.locked[p.id] != null)) schedule(room, () => startReveal(room), 500);
}
function autoPick(room) {
  if (room.phase !== "choose") return;
  for (const p of room.players) if (room.locked[p.id] == null) {
    const h = room.hands[p.id]; room.locked[p.id] = h[crypto.randomInt(h.length)];
  }
  broadcast(room); maybeReveal(room);
}
function startReveal(room) {
  if (room.phase !== "choose") return;
  room.reveal = room.players.map(p => ({ id: p.id, c: room.locked[p.id] })).sort((a, b) => a.c - b.c);
  for (const r of room.reveal) room.hands[r.id] = room.hands[r.id].filter(c => c !== r.c);
  room.step = 0; room.phase = "reveal"; room.deadline = 0;
  broadcast(room);
  schedule(room, () => step(room), delay(room, 1900));
}
function take(room, id, ri, c) {
  const taken = room.rows[ri], h = rowHeads(taken), p = playerOf(room, id);
  p.round += h; p.pile += taken.length; room.rows[ri] = [c];
  room.ev = { type: "take", id, h, n: taken.length, seq: ++room.seq };
}
function step(room) {
  if (room.phase !== "reveal") return;
  if (room.step >= room.reveal.length) return endTurn(room);
  const { id, c } = room.reveal[room.step];
  let best = -1, bv = -1;
  room.rows.forEach((r, i) => { const last = r[r.length - 1]; if (last < c && last > bv) { bv = last; best = i; } });
  if (best < 0) {
    room.phase = "pickRow"; room.waiting = id;
    room.deadline = room.settings.turnTime ? Date.now() + room.settings.turnTime * 1000 : 0;
    room.ev = { type: "low", id, seq: ++room.seq };
    if (room.deadline) schedule(room, () => autoRow(room), room.deadline - Date.now()); else clearTimeout(room.timer);
    return broadcast(room);
  }
  if (room.rows[best].length >= room.settings.rowMax) take(room, id, best, c); else room.rows[best].push(c);
  room.step++;
  broadcast(room);
  schedule(room, () => step(room), delay(room, 1200));
}
function takeRow(room, r) {
  const { id, c } = room.reveal[room.step];
  take(room, id, r, c);
  room.step++; room.phase = "reveal"; room.waiting = null; room.deadline = 0;
  broadcast(room);
  schedule(room, () => step(room), delay(room, 1200));
}
function autoRow(room) {
  if (room.phase !== "pickRow") return;
  let best = 0, bv = Infinity;
  room.rows.forEach((r, i) => { const t = rowHeads(r); if (t < bv) { bv = t; best = i; } });
  takeRow(room, best);
}
function endTurn(room) {
  if (room.players.every(p => (room.hands[p.id] || []).length === 0)) {
    for (const p of room.players) { p.total += p.round; p.lastRound = p.round; p.round = 0; }
    room.phase = room.players.some(p => p.total >= room.settings.threshold) ? "over" : "roundEnd";
    room.deadline = 0; clearTimeout(room.timer);
    return broadcast(room);
  }
  room.turn++; beginTurn(room); broadcast(room);
}
function toLobby(room) {
  clearTimeout(room.timer);
  Object.assign(room, { phase: "lobby", players: [], hands: {}, rows: [], locked: {}, reveal: [], step: 0, waiting: null, deadline: 0, round: 0, turn: 0, ev: null });
}

/* ---------------- Messages ---------------- */
function handle(ws, msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.t === "create" || msg.t === "hello") {
    let room;
    if (msg.t === "create") room = createRoom();
    else {
      room = rooms.get(String(msg.room || "").toUpperCase());
      if (!room) return send(ws, { t: "error", code: "no_room", msg: "Cette table n'existe pas (ou a expiré). Demandez un nouveau lien à l'hôte." });
    }
    let m = [...room.members.values()].find(x => x.token && x.token === msg.token);
    if (!m) {
      const name = cleanName(msg.name);
      if (!name) return send(ws, { t: "need_name", room: room.code });
      m = { id: rid(6), token: rid(), name, color: cleanColor(msg.color), sockets: new Set(), seated: false };
      room.members.set(m.id, m);
    }
    if (!room.hostId) room.hostId = m.id;
    if (room.phase === "lobby" && msg.name && !m.seated) {
      if ([...room.members.values()].filter(x => x.seated).length >= MAX_PLAYERS) send(ws, { t: "toast", msg: "La table est pleine (10 joueurs) : vous regardez en spectateur." });
      else m.seated = true;
    }
    if (msg.name) { m.name = cleanName(msg.name) || m.name; m.color = cleanColor(msg.color || m.color); }
    ws.room = room.code; ws.member = m.id; m.sockets.add(ws);
    send(ws, { t: "joined", room: room.code, token: m.token, you: m.id });
    return broadcast(room);
  }
  const room = rooms.get(ws.room); if (!room) return;
  const m = room.members.get(ws.member); if (!m) return;
  const isHost = room.hostId === m.id;
  const p = playerOf(room, m.id);
  switch (msg.t) {
    case "profile": {
      const name = cleanName(msg.name); if (name) m.name = name; m.color = cleanColor(msg.color);
      if (room.phase === "lobby") m.seated = msg.seated !== false;
      if (p) { p.name = m.name; p.color = m.color; }
      return broadcast(room);
    }
    case "settings": {
      if (!isHost || room.phase !== "lobby") return;
      const s = { ...room.settings };
      for (const [k, [lo, hi]] of Object.entries(LIMITS)) if (msg.settings?.[k] != null) {
        const v = Number(msg.settings[k]); if (Number.isFinite(v)) s[k] = Math.min(hi, Math.max(lo, k === "speed" ? v : Math.round(v)));
      }
      if (msg.settings?.tactical != null) s.tactical = !!msg.settings.tactical;
      if (msg.reset) Object.assign(s, DEFAULTS);
      room.settings = s; return broadcast(room);
    }
    case "kick": {
      if (!isHost || room.phase !== "lobby") return;
      const k = room.members.get(String(msg.id)); if (k && k.id !== m.id) k.seated = false;
      return broadcast(room);
    }
    case "start": {
      if (!isHost || room.phase !== "lobby") return;
      const err = startGame(room); if (err) return send(ws, { t: "toast", msg: err });
      return broadcast(room);
    }
    case "pick": {
      if (!p || room.phase !== "choose" || room.locked[p.id] != null) return;
      const c = Number(msg.c); if (!(room.hands[p.id] || []).includes(c)) return;
      room.locked[p.id] = c; broadcast(room); return maybeReveal(room);
    }
    case "row": {
      if (room.phase !== "pickRow" || room.waiting !== m.id) return;
      const r = Number(msg.r); if (!Number.isInteger(r) || r < 0 || r >= room.rows.length) return;
      return takeRow(room, r);
    }
    case "force": {
      if (!isHost) return;
      if (room.phase === "choose") return autoPick(room);
      if (room.phase === "pickRow") return autoRow(room);
      return;
    }
    case "next": { if (!isHost || room.phase !== "roundEnd") return; deal(room); return broadcast(room); }
    case "stop": { if (!isHost || room.phase !== "roundEnd") return; room.phase = "over"; return broadcast(room); }
    case "lobby": { if (!isHost || room.phase === "lobby") return; toLobby(room); return broadcast(room); }
  }
}

/* ---------------- WebSocket ---------------- */
const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 });
wss.on("connection", ws => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", data => { let msg; try { msg = JSON.parse(data); } catch { return; } try { handle(ws, msg); } catch (e) { console.error(e); } });
  ws.on("close", () => {
    const room = rooms.get(ws.room); if (!room) return;
    const m = room.members.get(ws.member); if (m) m.sockets.delete(ws);
    if (m && !m.sockets.size && room.phase === "lobby" && !playerOf(room, m.id)) {
      // dans le salon, un joueur qui ferme l'onglet libère sa place après 60 s
      setTimeout(() => { if (!m.sockets.size && room.phase === "lobby") { m.seated = false; broadcast(room); } }, 60000);
    }
    broadcast(room);
  });
});
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = [...room.members.values()].some(m => m.sockets.size);
    if (!anyone && now - room.lastActive > ROOM_IDLE_MS) { clearTimeout(room.timer); rooms.delete(code); }
  }
}, 25000);

server.listen(PORT, () => console.log(`Sixième Bœuf prêt sur http://localhost:${PORT}`));
