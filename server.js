// Tapis Vert — plateforme de jeux multijoueur (HTTP + WebSocket).
// Ce fichier est le socle commun : tables, liens d'invitation, salon, chat, reconnexion.
// Chaque jeu est un module dans games/ qui ne s'occupe que de ses règles.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000; // une table vide est supprimée après 3 h

/* ---------------- Jeux disponibles ---------------- */
const GAMES = {};
for (const f of fs.readdirSync(path.join(__dirname, "games"))) {
  if (!f.endsWith(".js")) continue;
  const g = require(path.join(__dirname, "games", f));
  GAMES[g.id] = g;
}

const rid = (n = 16) => crypto.randomBytes(n).toString("hex");
const cleanName = s => String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 20);
const cleanColor = s => (/^#[0-9a-fA-F]{6}$/.test(String(s)) ? String(s) : "#ffb22e");
const cleanText = s => String(s || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300);

const rooms = new Map();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
  let c;
  do { c = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(""); } while (rooms.has(c));
  return c;
}

/* ---------------- HTTP (fichiers de public/) ---------------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const PUBLIC = path.join(__dirname, "public");
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
  const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC, rel);
  const type = TYPES[path.extname(file)];
  if (!file.startsWith(PUBLIC + path.sep) || !type) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Introuvable"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Introuvable"); }
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    res.end(data);
  });
});

/* ---------------- Tables ---------------- */
function createRoom(gameId) {
  const game = GAMES[gameId];
  const room = {
    code: newCode(), game, hostId: null, settings: { ...game.defaults }, phase: "lobby",
    members: new Map(), // id -> {id, token, name, color, sockets:Set, seated, seatedAt}
    g: null, timer: null, lastActive: Date.now(), chat: [],
  };
  rooms.set(room.code, room);
  return room;
}
const online = (room, id) => (room.members.get(id)?.sockets.size || 0) > 0;
const seatedMembers = room => [...room.members.values()].filter(m => m.seated).sort((a, b) => a.seatedAt - b.seatedAt);

function ctxFor(room, member) {
  return {
    broadcast: () => broadcast(room),
    sys: text => pushChat(room, { sys: true, text }),
    schedule: (fn, ms) => { clearTimeout(room.timer); room.timer = setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, Math.max(0, ms)); },
    clearTimer: () => clearTimeout(room.timer),
    online: id => online(room, id),
    isHost: !!member && room.hostId === member.id,
  };
}

function viewFor(room, id) {
  const members = [...room.members.values()];
  const playing = room.phase !== "lobby";
  return {
    code: room.code, game: room.game.id, you: id, hostId: room.hostId, settings: room.settings, phase: room.phase,
    lobby: seatedMembers(room).map(m => ({ id: m.id, name: m.name, color: m.color, online: online(room, m.id) })),
    g: playing ? room.game.view(room, id, ctxFor(room, room.members.get(id))) : null,
    spectators: playing ? members.filter(m => !room.game.isPlayer(room, m.id) && online(room, m.id)).length : 0,
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

/* ---------------- Chat ---------------- */
const CHAT_KEEP = 150;
function pushChat(room, entry) {
  entry.at = Date.now();
  room.chat.push(entry);
  if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
  for (const m of room.members.values()) for (const ws of m.sockets) send(ws, { t: "chat", msg: entry });
}

/* ---------------- Réglages ---------------- */
function applySettings(room, input, reset) {
  const s = reset ? { ...room.game.defaults } : { ...room.settings };
  for (const [k, rule] of Object.entries(room.game.schema || {})) {
    if (!input || input[k] == null) continue;
    let v = input[k];
    if (rule.type === "bool") s[k] = !!v;
    else if (rule.type === "enum") { if (rule.values.includes(v)) s[k] = v; }
    else {
      v = Number(v); if (!Number.isFinite(v)) continue;
      if (rule.type === "int") v = Math.round(v);
      s[k] = Math.min(rule.max, Math.max(rule.min, v));
    }
  }
  room.settings = s;
}

/* ---------------- Messages ---------------- */
function handle(ws, msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.t === "create" || msg.t === "hello") {
    let room;
    if (msg.t === "create") {
      if (!GAMES[msg.game]) return send(ws, { t: "toast", msg: "Ce jeu n'existe pas encore." });
      room = createRoom(msg.game);
    } else {
      room = rooms.get(String(msg.room || "").toUpperCase());
      if (!room) return send(ws, { t: "error", code: "no_room", msg: "Cette table n'existe pas (ou a expiré). Demandez un nouveau lien à l'hôte." });
    }
    let m = [...room.members.values()].find(x => x.token && x.token === msg.token);
    if (!m) {
      const name = cleanName(msg.name);
      if (!name) return send(ws, { t: "need_name", room: room.code, game: room.game.id });
      m = { id: rid(6), token: rid(), name, color: cleanColor(msg.color), sockets: new Set(), seated: false, seatedAt: 0 };
      room.members.set(m.id, m);
    }
    if (!room.hostId) room.hostId = m.id;
    if (room.phase === "lobby" && msg.name && !m.seated) {
      if (seatedMembers(room).length >= room.game.maxPlayers) send(ws, { t: "toast", msg: `La table est complète (${room.game.maxPlayers} joueurs) : vous regardez en spectateur.` });
      else { m.seated = true; m.seatedAt = Date.now(); }
    }
    if (msg.name) { m.name = cleanName(msg.name) || m.name; m.color = cleanColor(msg.color || m.color); }
    ws.room = room.code; ws.member = m.id; m.sockets.add(ws);
    send(ws, { t: "joined", room: room.code, game: room.game.id, token: m.token, you: m.id });
    send(ws, { t: "chatlog", list: room.chat });
    return broadcast(room);
  }
  const room = rooms.get(ws.room); if (!room) return;
  const m = room.members.get(ws.member); if (!m) return;
  const ctx = ctxFor(room, m);
  switch (msg.t) {
    case "profile": {
      const name = cleanName(msg.name); if (name) m.name = name; m.color = cleanColor(msg.color);
      if (room.phase === "lobby") {
        const want = msg.seated !== false;
        if (want && !m.seated) {
          if (seatedMembers(room).length >= room.game.maxPlayers) send(ws, { t: "toast", msg: "La table est complète." });
          else { m.seated = true; m.seatedAt = Date.now(); }
        } else if (!want) m.seated = false;
      }
      if (room.g && room.game.rename) room.game.rename(room, m);
      return broadcast(room);
    }
    case "chat": {
      const text = cleanText(msg.text); if (!text) return;
      const now = Date.now(); if (now - (m.lastChat || 0) < 400) return; m.lastChat = now;
      return pushChat(room, { id: m.id, name: m.name, color: m.color, text });
    }
    case "settings": {
      if (!ctx.isHost || room.phase !== "lobby") return;
      applySettings(room, msg.settings, !!msg.reset);
      return broadcast(room);
    }
    case "kick": {
      if (!ctx.isHost || room.phase !== "lobby") return;
      const k = room.members.get(String(msg.id)); if (k && k.id !== m.id) k.seated = false;
      return broadcast(room);
    }
    case "start": {
      if (!ctx.isHost || room.phase !== "lobby") return;
      const seated = seatedMembers(room);
      const gm = room.game;
      if (seated.length < gm.minPlayers) return send(ws, { t: "toast", msg: `Il faut au moins ${gm.minPlayers} joueurs.` });
      if (seated.length > gm.maxPlayers) return send(ws, { t: "toast", msg: `${gm.maxPlayers} joueurs maximum.` });
      const err = gm.validateStart ? gm.validateStart(room, seated) : null;
      if (err) return send(ws, { t: "toast", msg: err });
      room.phase = "playing";
      gm.start(room, seated, ctx);
      return broadcast(room);
    }
    case "lobby": {
      if (!ctx.isHost || room.phase === "lobby") return;
      clearTimeout(room.timer); room.phase = "lobby"; room.g = null;
      return broadcast(room);
    }
    default:
      if (room.phase === "playing" && room.g) return room.game.action(room, m, msg, ctx);
  }
}

/* ---------------- WebSocket ---------------- */
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
wss.on("connection", ws => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", data => { let msg; try { msg = JSON.parse(data); } catch { return; } try { handle(ws, msg); } catch (e) { console.error(e); } });
  ws.on("close", () => {
    const room = rooms.get(ws.room); if (!room) return;
    const m = room.members.get(ws.member); if (m) m.sockets.delete(ws);
    if (m && !m.sockets.size && room.phase === "lobby") {
      // dans le salon, un joueur qui ferme l'onglet libère sa place après 60 s
      setTimeout(() => { if (!m.sockets.size && room.phase === "lobby" && m.seated) { m.seated = false; broadcast(room); } }, 60000);
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

server.listen(PORT, () => console.log(`Tapis Vert démarré (port ${PORT}) avec ${Object.keys(GAMES).length} jeu(x) : ${Object.values(GAMES).map(g => g.name).join(", ")}.`));
