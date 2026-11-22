// Coinche (belote contrée) — règles du jeu (module serveur de Tapis Vert).
// Places 0..3 dans l'ordre de jeu ; équipes : places 0 et 2 (équipe A), places 1 et 3 (équipe B).
const crypto = require("crypto");

const SUITS = ["S", "H", "D", "C"];
const RANKS = ["7", "8", "9", "T", "J", "Q", "K", "A"];
const TRUMP_ORDER = ["7", "8", "Q", "K", "T", "A", "9", "J"]; // du plus faible au plus fort
const PLAIN_ORDER = ["7", "8", "9", "J", "Q", "K", "T", "A"];
const PTS = {
  trump: { J: 20, 9: 14, A: 11, T: 10, K: 4, Q: 3, 8: 0, 7: 0 },
  plain: { A: 11, T: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 },
  TA: { J: 14, 9: 9, A: 6, T: 5, K: 3, Q: 1, 8: 0, 7: 0 },
  SA: { A: 19, T: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 },
};
const SUIT_NAME = { S: "Pique", H: "Cœur", D: "Carreau", C: "Trèfle", TA: "Tout atout", SA: "Sans atout" };
const SUIT_SIGN = { S: "♠", H: "♥", D: "♦", C: "♣", TA: "Tout atout", SA: "Sans atout" };
const BID_VALUES = [80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, "capot", "generale"];
const bidRank = v => BID_VALUES.indexOf(v);
const bidLabel = v => (v === "capot" ? "Capot" : v === "generale" ? "Générale" : String(v));
const contractLabel = c => `${bidLabel(c.value)} ${SUIT_SIGN[c.suit]}`;

const suitOf = c => c[1];
const rankOf = c => c[0];
const team = seat => seat % 2; // 0 = équipe A (places 0 et 2), 1 = équipe B (places 1 et 3)
const partner = seat => (seat + 2) % 4;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function isTrump(card, mode) { return mode.length === 1 && suitOf(card) === mode; }
function strength(card, mode, led) {
  // Force d'une carte dans un pli : les atouts battent tout, puis la couleur demandée, le reste ne vaut rien.
  if (mode === "TA") return suitOf(card) === led ? TRUMP_ORDER.indexOf(rankOf(card)) : -1;
  if (mode === "SA") return suitOf(card) === led ? PLAIN_ORDER.indexOf(rankOf(card)) : -1;
  if (isTrump(card, mode)) return 100 + TRUMP_ORDER.indexOf(rankOf(card));
  return suitOf(card) === led ? PLAIN_ORDER.indexOf(rankOf(card)) : -1;
}
function points(card, mode) {
  if (mode === "TA" || mode === "SA") return PTS[mode][rankOf(card)];
  return (isTrump(card, mode) ? PTS.trump : PTS.plain)[rankOf(card)];
}
function winnerIndex(trick, mode) {
  const led = suitOf(trick[0].card);
  let best = 0;
  trick.forEach((t, i) => { if (strength(t.card, mode, led) > strength(trick[best].card, mode, led)) best = i; });
  return best;
}
function legalCards(hand, trick, mode, seat, settings) {
  if (!trick.length) return hand.slice();
  const led = suitOf(trick[0].card);
  const follow = hand.filter(c => suitOf(c) === led);
  const wi = winnerIndex(trick, mode);
  const bestStrength = strength(trick[wi].card, mode, led);
  const partnerMaster = trick[wi].seat === partner(seat);
  if (mode === "TA") {
    if (!follow.length) return hand.slice();
    const higher = follow.filter(c => strength(c, mode, led) > bestStrength);
    return higher.length ? higher : follow;
  }
  if (mode === "SA") return follow.length ? follow : hand.slice();
  if (led === mode) { // atout demandé : il faut monter si possible
    if (!follow.length) return hand.slice();
    const higher = follow.filter(c => strength(c, mode, led) > bestStrength);
    return higher.length ? higher : follow;
  }
  if (follow.length) return follow;
  const trumps = hand.filter(c => isTrump(c, mode));
  if (!trumps.length) return hand.slice();
  if (settings.partnerFree && partnerMaster) return hand.slice(); // partenaire maître : on peut pisser
  const over = trumps.filter(c => strength(c, mode, led) > bestStrength);
  return over.length ? over : trumps; // surcouper si possible, sinon sous-couper
}
function sortHand(hand, mode) {
  const order = ["S", "H", "C", "D"];
  return hand.slice().sort((a, b) => {
    const ta = isTrump(a, mode) ? 0 : 1, tb = isTrump(b, mode) ? 0 : 1;
    if (ta !== tb) return ta - tb;
    if (suitOf(a) !== suitOf(b)) return order.indexOf(suitOf(a)) - order.indexOf(suitOf(b));
    const ord = (mode === "TA" || isTrump(a, mode)) ? TRUMP_ORDER : PLAIN_ORDER;
    return ord.indexOf(rankOf(b)) - ord.indexOf(rankOf(a));
  });
}
const round10 = n => Math.round(n / 10) * 10;

module.exports = {
  id: "coinche",
  name: "Coinche",
  minPlayers: 4,
  maxPlayers: 4,
  defaults: { target: 2000, mustBeat: false, partnerFree: true, allowTASA: true, scoreMode: "plus", round10: true, speed: 1 },
  schema: {
    target: { type: "int", min: 300, max: 10000 },
    mustBeat: { type: "bool" },
    partnerFree: { type: "bool" },
    allowTASA: { type: "bool" },
    scoreMode: { type: "enum", values: ["plus", "contract"] },
    round10: { type: "bool" },
    speed: { type: "num", min: 0.4, max: 3 },
  },

  /* ---------- salon : choix des places ---------- */
  lobbyView(room, id, seated) {
    cleanSeats(room, seated);
    return { seats: room.seats.map(sid => { const m = sid && room.members.get(sid); return m ? { id: m.id, name: m.name, color: m.color } : null; }) };
  },
  lobbyAction(room, member, msg, ctx, seated) {
    cleanSeats(room, seated);
    if (msg.t === "seat") {
      const i = Number(msg.i); if (!Number.isInteger(i) || i < 0 || i > 3) return;
      if (!member.seated) return;
      const mine = room.seats.indexOf(member.id), other = room.seats[i];
      if (other === member.id) return;
      if (other) {
        // place occupée : seul l'hôte peut échanger (s'il a lui-même une place)
        if (!ctx.isHost || mine < 0) return;
        room.seats[mine] = other; room.seats[i] = member.id; return;
      }
      if (mine >= 0) room.seats[mine] = null;
      room.seats[i] = member.id;
    }
    if (msg.t === "shuffleSeats" && ctx.isHost) {
      room.seats = shuffle(seated.slice(0, 4).map(m => m.id)).concat([null, null, null, null]).slice(0, 4);
    }
  },

  validateStart(room, seated) {
    if (seated.length !== 4) return "La coinche se joue à 4 joueurs exactement.";
    return null;
  },

  start(room, seated, ctx) {
    cleanSeats(room, seated);
    for (const m of seated) if (!room.seats.includes(m.id)) room.seats[room.seats.indexOf(null)] = m.id;
    const players = room.seats.map((id, seat) => { const m = room.members.get(id); return { id, name: m.name, color: m.color, seat }; });
    room.g = { players, scores: [0, 0], dealer: crypto.randomInt(4), handNo: 0, history: [], ev: null, seq: 0, phase: "bidding" };
    ctx.sys(`La partie de coinche commence ! ${players[0].name} et ${players[2].name} contre ${players[1].name} et ${players[3].name}. Objectif : ${room.settings.target} points.`);
    newHand(room, ctx);
  },

  rename(room, member) {
    const p = room.g?.players.find(x => x.id === member.id);
    if (p) { p.name = member.name; p.color = member.color; }
  },
  isPlayer: (room, id) => !!room.g?.players.some(p => p.id === id),

  view(room, id, ctx) {
    const g = room.g, me = g.players.find(p => p.id === id), mySeat = me ? me.seat : -1;
    const mode = g.contract ? g.contract.suit : null;
    const hand = me ? sortHand(g.hands[mySeat], mode || "SA") : [];
    const legal = me && g.phase === "play" && g.turn === mySeat && !g.trickDone ? legalCards(g.hands[mySeat], g.trick, mode, mySeat, room.settings) : [];
    return {
      phase: g.phase, mySeat, dealer: g.dealer, turn: g.turn, handNo: g.handNo,
      players: g.players.map(p => ({ ...p, online: ctx.online(p.id), cards: g.hands[p.seat].length })),
      hand, legal,
      bidding: g.bidding && { high: g.bidding.high, coinche: g.bidding.coinche, coincheBy: g.bidding.coincheBy, log: g.bidding.log, surWindow: g.bidding.surWindow },
      contract: g.contract, trick: g.trick, trickDone: g.trickDone, lastTrick: g.lastTrick,
      tricks: g.tricksWon, live: g.livePts, belote: g.beloteShown,
      scores: g.scores, result: g.result, history: g.history, ev: g.ev, winner: g.winner,
    };
  },

  action(room, member, msg, ctx) {
    const g = room.g, me = g.players.find(p => p.id === member.id);
    if (msg.t === "force") {
      if (!ctx.isHost) return;
      return forceMove(room, ctx);
    }
    if (msg.t === "next") { if (!ctx.isHost || g.phase !== "handEnd") return; g.dealer = (g.dealer + 1) % 4; return newHand(room, ctx); }
    if (!me) return;
    if (g.phase === "bidding") return bidAction(room, me.seat, msg, ctx);
    if (g.phase === "play" && msg.t === "play") return playCard(room, me.seat, String(msg.card), ctx);
  },
};

/* ---------------- salon ---------------- */
function cleanSeats(room, seated) {
  if (!room.seats) room.seats = [null, null, null, null];
  const ids = new Set(seated.map(m => m.id));
  room.seats = room.seats.map(id => (id && ids.has(id) ? id : null));
}

/* ---------------- donne & enchères ---------------- */
function newHand(room, ctx) {
  const g = room.g;
  const deck = shuffle(SUITS.flatMap(s => RANKS.map(r => r + s)));
  g.hands = [0, 1, 2, 3].map(i => deck.slice(i * 8, i * 8 + 8));
  g.handNo += 1;
  g.phase = "bidding"; g.turn = (g.dealer + 1) % 4;
  g.bidding = { high: null, coinche: 1, coincheBy: null, passes: 0, log: [], surWindow: null };
  g.contract = null; g.trick = []; g.trickDone = false; g.lastTrick = null;
  g.tricksWon = [0, 0, 0, 0]; g.cardPts = [0, 0]; g.livePts = [0, 0]; g.result = null; g.beloteShown = null; g.belote = null;
  ctx.clearTimer();
  ctx.broadcast();
}
function logBid(g, seat, text) { g.bidding.log.push({ seat, text }); }
function bidAction(room, seat, msg, ctx) {
  const g = room.g, b = g.bidding, s = room.settings;
  if (g.turn !== seat) return;
  if (b.surWindow) { // après une coinche : seule l'équipe preneuse peut surcoincher
    if (msg.t === "surcoinche") { b.coinche = 4; logBid(g, seat, "Surcoinche !"); ctx.sys(`${g.players[seat].name} surcoinche !`); return endBidding(room, ctx); }
    if (msg.t === "pass") {
      logBid(g, seat, "Passe");
      b.surWindow.shift();
      if (!b.surWindow.length) return endBidding(room, ctx);
      g.turn = b.surWindow[0]; return ctx.broadcast();
    }
    return;
  }
  if (msg.t === "pass") {
    logBid(g, seat, "Passe"); b.passes++;
    if (!b.high && b.passes >= 4) {
      ctx.sys("Tout le monde passe : on redistribue.");
      g.dealer = (g.dealer + 1) % 4; return newHand(room, ctx);
    }
    if (b.high && b.passes >= 3) return endBidding(room, ctx);
    g.turn = (g.turn + 1) % 4; return ctx.broadcast();
  }
  if (msg.t === "bid") {
    const value = msg.value === "capot" || msg.value === "generale" ? msg.value : Number(msg.value);
    const suit = String(msg.suit);
    if (bidRank(value) < 0 || !SUIT_NAME[suit]) return;
    if ((suit === "TA" || suit === "SA") && !s.allowTASA) return;
    if (b.high && (b.high.value === "capot" || b.high.value === "generale")) return; // capot et générale sont des maximums
    if (b.high && bidRank(value) <= bidRank(b.high.value)) return;
    b.high = { seat, value, suit }; b.passes = 0;
    logBid(g, seat, contractLabel(b.high));
    g.turn = (g.turn + 1) % 4; return ctx.broadcast();
  }
  if (msg.t === "coinche") {
    if (!b.high || team(b.high.seat) === team(seat)) return;
    b.coinche = 2; b.coincheBy = seat;
    logBid(g, seat, "Coinche !"); ctx.sys(`${g.players[seat].name} coinche !`);
    // les deux joueurs de l'équipe preneuse peuvent surcoincher, dans l'ordre de jeu
    b.surWindow = [1, 2, 3].map(k => (seat + k) % 4).filter(x => team(x) === team(b.high.seat));
    g.turn = b.surWindow[0]; return ctx.broadcast();
  }
}
function endBidding(room, ctx) {
  const g = room.g, b = g.bidding;
  g.contract = { ...b.high, mult: b.coinche, by: g.players[b.high.seat].name };
  b.surWindow = null;
  const mode = g.contract.suit;
  // belote : le roi et la dame d'atout dans la même main (contrat à la couleur uniquement)
  if (mode.length === 1) {
    for (let s = 0; s < 4; s++) if (g.hands[s].includes("K" + mode) && g.hands[s].includes("Q" + mode)) g.belote = { seat: s, shown: 0 };
  }
  ctx.sys(`Contrat : ${contractLabel(g.contract)} par ${g.contract.by}${g.contract.mult === 2 ? " · coinché" : g.contract.mult === 4 ? " · surcoinché" : ""}.`);
  g.phase = "play"; g.turn = (g.dealer + 1) % 4; g.trick = [];
  ctx.broadcast();
}

/* ---------------- jeu de la carte ---------------- */
function playCard(room, seat, card, ctx) {
  const g = room.g, mode = g.contract.suit;
  if (g.turn !== seat || g.trickDone) return;
  const legal = legalCards(g.hands[seat], g.trick, mode, seat, room.settings);
  if (!legal.includes(card)) return;
  g.hands[seat] = g.hands[seat].filter(c => c !== card);
  g.trick.push({ seat, card });
  if (g.belote && g.belote.seat === seat && (card === "K" + mode || card === "Q" + mode)) {
    g.belote.shown++;
    const word = g.belote.shown === 1 ? "Belote" : "Rebelote";
    g.beloteShown = { seat, word };
    g.ev = { type: "belote", seat, word, seq: ++g.seq };
    ctx.sys(`${g.players[seat].name} : « ${word} ! »`);
  }
  if (g.trick.length < 4) { g.turn = (g.turn + 1) % 4; return ctx.broadcast(); }
  // pli complet : on le laisse visible un instant
  const wi = winnerIndex(g.trick, mode), winSeat = g.trick[wi].seat;
  const pts = g.trick.reduce((a, t) => a + points(t.card, mode), 0) + (g.hands[0].length === 0 ? 10 : 0);
  g.trickDone = { winner: winSeat, pts };
  g.turn = winSeat;
  ctx.broadcast();
  ctx.schedule(() => collectTrick(room, ctx), 1500 / (room.settings.speed || 1));
}
function collectTrick(room, ctx) {
  const g = room.g; if (!g.trickDone) return;
  const { winner, pts } = g.trickDone;
  g.tricksWon[winner]++; g.cardPts[team(winner)] += pts; g.livePts = g.cardPts.slice();
  g.lastTrick = { cards: g.trick, winner };
  g.trick = []; g.trickDone = false; g.turn = winner;
  if (g.hands.every(h => h.length === 0)) return scoreHand(room, ctx);
  ctx.broadcast();
}
function forceMove(room, ctx) {
  const g = room.g;
  if (g.phase === "bidding") return bidAction(room, g.turn, { t: "pass" }, ctx);
  if (g.phase === "play" && !g.trickDone) {
    const legal = legalCards(g.hands[g.turn], g.trick, g.contract.suit, g.turn, room.settings);
    return playCard(room, g.turn, legal[crypto.randomInt(legal.length)], ctx);
  }
}

/* ---------------- décompte ---------------- */
function scoreHand(room, ctx) {
  const g = room.g, s = room.settings, c = g.contract;
  const T = team(c.seat), D = 1 - T;
  const bel = [0, 0]; if (g.belote && g.belote.shown >= 2) bel[team(g.belote.seat)] = 20;
  const card = g.cardPts.slice();
  const totalT = card[T] + bel[T], totalD = card[D] + bel[D];
  const allTeam = g.tricksWon[c.seat] + g.tricksWon[partner(c.seat)] === 8;
  let made;
  if (c.value === "capot") made = allTeam;
  else if (c.value === "generale") made = g.tricksWon[c.seat] === 8;
  else made = totalT >= c.value && (!s.mustBeat || totalT > totalD);
  const value = c.value === "capot" ? 250 : c.value === "generale" ? 500 : c.value;
  const r = n => (s.round10 ? round10(n) : n);
  const add = [0, 0];
  if (made) {
    if (typeof c.value === "number") {
      add[T] = value * c.mult + (s.scoreMode === "plus" ? r(card[T]) : 0);
      add[D] = c.mult === 1 && s.scoreMode === "plus" ? r(card[D]) : 0;
    } else add[T] = value * c.mult;
  } else {
    add[D] = 160 + value * c.mult;
  }
  add[0] += bel[0]; add[1] += bel[1];
  g.scores[0] += add[0]; g.scores[1] += add[1];
  g.result = { made, takerTeam: T, card, bel, add, contract: c, tricks: g.tricksWon.slice(), totalT, totalD };
  g.history.push({ handNo: g.handNo, contract: contractLabel(c) + (c.mult > 1 ? (c.mult === 2 ? " ×2" : " ×4") : ""), by: c.by, made, add: add.slice(), scores: g.scores.slice() });
  const names = t => `${g.players[t].name} & ${g.players[t + 2].name}`;
  ctx.sys(`${made ? "Contrat réussi" : "Contrat chuté"} pour ${names(T)} (${totalT} points avec belote). ${names(0)} +${add[0]}, ${names(1)} +${add[1]}.`);
  const over = g.scores.some(x => x >= s.target);
  if (over) {
    g.phase = "over";
    g.winner = g.scores[0] === g.scores[1] ? T : (g.scores[0] > g.scores[1] ? 0 : 1);
    ctx.sys(`Partie terminée : ${names(g.winner)} gagnent ${Math.max(...g.scores)} à ${Math.min(...g.scores)} !`);
  } else g.phase = "handEnd";
  ctx.broadcast();
}

module.exports._test = { legalCards, winnerIndex, points, strength };
