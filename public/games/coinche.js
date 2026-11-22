// Coinche — affichage du jeu (module client de Tapis Vert).
(() => {
const SIGN = { S:"♠", H:"♥", D:"♦", C:"♣" };
const SUITCOL = { S:"#1f2a44", H:"#e0244a", D:"#f07c00", C:"#13955a" };
const RANKFR = { "7":"7", "8":"8", "9":"9", "T":"10", "J":"V", "Q":"D", "K":"R", "A":"A" };
const MODE_LABEL = { S:"♠ Pique", H:"♥ Cœur", D:"♦ Carreau", C:"♣ Trèfle", TA:"Tout atout", SA:"Sans atout" };
const BID_VALUES = [80,90,100,110,120,130,140,150,160,170,180,"capot","generale"];
const bidLabel = v => v==="capot" ? "Capot" : v==="generale" ? "Générale" : String(v);
const modeShort = m => m==="TA" ? "TA" : m==="SA" ? "SA" : SIGN[m];
const TEAMCOL = ["#ffb22e", "#4fb3ff"];
let sel=null, selBid=null, selSuit=null, lastSeq=-1, lastHandNo=0;

function cardHTML(c, extra="", attrs=""){
  const r=c[0], s=c[1], fr=RANKFR[r], face = "JQK".includes(r);
  return `<div class="co-card ${extra}" style="--sc:${SUITCOL[s]}" ${attrs} aria-label="${fr} de ${({S:"pique",H:"cœur",D:"carreau",C:"trèfle"})[s]}">
    <span class="tl">${fr}<i>${SIGN[s]}</i></span>
    <span class="mid ${face?"face":""}">${face?`<b>${fr}</b><i>${SIGN[s]}</i>`:SIGN[s]}</span>
    <span class="br">${fr}<i>${SIGN[s]}</i></span></div>`;
}
const backHTML = (n) => `<div class="co-backs">${Array.from({length:Math.min(n,8)},()=>`<span></span>`).join("")}</div>`;

TV.register({
  id: "coinche",
  name: "Coinche",
  tagline: "La belote contrée : enchères, coinche et surcoinche, en équipes de deux.",
  players: "4 joueurs",
  accent: "#ff5470",
  preview: () => `<div class="co-preview">${["JH","9H","AS","TD"].map(c=>cardHTML(c)).join("")}</div>`,
  css: `
.co-card{--w:clamp(50px,6.2vw,76px);--sc:#222;position:relative;flex:0 0 var(--w);width:var(--w);height:calc(var(--w)*1.45);border-radius:calc(var(--w)*.12);user-select:none;
  background:linear-gradient(160deg,#fff 0%,#fff 55%,color-mix(in srgb,var(--sc) 12%,#fff) 100%);border:2px solid color-mix(in srgb,var(--sc) 55%,#fff);
  box-shadow:0 3px 0 rgba(0,0,0,.35),0 6px 14px rgba(0,0,0,.22);color:var(--sc);font-family:var(--display)}
.co-card .tl,.co-card .br{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:.9;font-size:calc(var(--w)*.24)}
.co-card .tl i,.co-card .br i{font-style:normal;font-size:calc(var(--w)*.2)}
.co-card .tl{top:calc(var(--w)*.06);left:calc(var(--w)*.08)}
.co-card .br{bottom:calc(var(--w)*.06);right:calc(var(--w)*.08);transform:rotate(180deg)}
.co-card .mid{position:absolute;inset:0;display:grid;place-items:center;font-size:calc(var(--w)*.56)}
.co-card .mid.face{place-content:center;gap:0;line-height:1}
.co-card .mid.face b{display:grid;place-items:center;width:calc(var(--w)*.56);height:calc(var(--w)*.56);border-radius:50%;background:var(--sc);color:#fff;font-weight:400;font-size:calc(var(--w)*.34);margin:auto}
.co-card .mid.face i{font-style:normal;font-size:calc(var(--w)*.3);text-align:center}
.co-card.legal{cursor:pointer;transition:transform .12s}
.co-card.legal:hover{transform:translateY(-8px)}
.co-card.legal:focus-visible{outline:3px solid var(--sun);outline-offset:2px}
.co-card.dim{filter:grayscale(.65) brightness(.6)}
.co-card.sel{transform:translateY(-18px)!important;box-shadow:0 0 0 3px var(--sun),0 12px 20px rgba(0,0,0,.45)}
.co-card.win{box-shadow:0 0 0 4px var(--good),0 10px 20px rgba(0,0,0,.4)}
.co-card.drop{animation:co-drop .35s cubic-bezier(.2,1.4,.4,1)}
@keyframes co-drop{from{transform:scale(1.25) rotate(-8deg);opacity:0}}
.co-preview{display:flex}.co-preview .co-card{--w:50px;margin:0 -7px}
.co-preview .co-card:nth-child(1){transform:rotate(-12deg) translateY(6px)}.co-preview .co-card:nth-child(2){transform:rotate(-4deg)}.co-preview .co-card:nth-child(3){transform:rotate(4deg)}.co-preview .co-card:nth-child(4){transform:rotate(12deg) translateY(6px)}
.co-hand{display:flex;justify-content:center;flex-wrap:wrap;gap:6px;padding-top:16px}
.co-hand .co-card{--w:clamp(54px,7vw,84px)}
.co-banner{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center;padding:10px 14px;border-radius:14px;background:rgba(0,0,0,.25);font-weight:800}
.co-banner .ct{font-family:var(--display);font-size:22px;font-weight:400;color:var(--sun)}
.co-chip{border-radius:999px;padding:2px 10px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
.co-table{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr) minmax(0,1fr);grid-template-rows:auto minmax(200px,auto) auto;gap:10px;align-items:center;justify-items:center;
  background:radial-gradient(ellipse at center, color-mix(in srgb,#1f6b55 70%,transparent) 0%, rgba(0,0,0,.15) 70%);border-radius:24px;padding:14px;border:1px solid var(--felt-line)}
.co-seat{display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 12px;border-radius:14px;background:rgba(0,0,0,.28);border:2px solid color-mix(in srgb,var(--tc) 60%,transparent);min-width:0;max-width:100%;position:relative}
.co-seat.turn{box-shadow:0 0 0 3px var(--sun);animation:co-glow 1.4s ease-in-out infinite}
@keyframes co-glow{50%{box-shadow:0 0 0 6px rgba(255,178,46,.35)}}
.co-seat .nm{font-weight:800;display:flex;gap:6px;align-items:center;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.co-seat .dot{width:12px;height:12px;border-radius:50%;flex:0 0 auto}
.co-seat .tm{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--tc)}
.co-seat.off{opacity:.55}
.co-dealer{position:absolute;top:-10px;right:-10px;width:24px;height:24px;border-radius:50%;background:#fff;color:#1b2422;font-family:var(--display);display:grid;place-items:center;font-size:13px;box-shadow:0 2px 0 rgba(0,0,0,.3)}
.co-bubble{background:var(--paper);color:var(--ink);font-weight:800;border-radius:12px;padding:3px 10px;font-size:13px;white-space:nowrap}
.co-bubble.hot{background:var(--danger);color:#fff}
.co-backs{display:flex}.co-backs span{width:14px;height:20px;margin-right:-6px;border-radius:3px;background:repeating-linear-gradient(45deg,#c8324a 0 3px,#e2546a 3px 6px);border:1px solid #fff}
.co-center{display:grid;grid-template-columns:repeat(3,auto);grid-template-rows:repeat(3,auto);gap:4px;align-items:center;justify-items:center;min-height:200px}
.co-center .co-card{--w:clamp(48px,5.6vw,70px)}
.co-center .pos-top{grid-area:1/2}.co-center .pos-left{grid-area:2/1}.co-center .pos-right{grid-area:2/3}.co-center .pos-bottom{grid-area:3/2}
.co-center .info{grid-area:2/2;font-size:12px;font-weight:800;color:var(--muted);text-align:center;max-width:120px}
.co-top{grid-area:1/2}.co-left{grid-area:2/1}.co-right{grid-area:2/3}.co-mid{grid-area:2/2}.co-bottom{grid-area:3/2}
@media (max-width:560px){.co-table{grid-template-columns:1fr 1fr;grid-template-rows:auto auto auto}.co-top{grid-area:1/1/2/3}.co-left{grid-area:2/1}.co-right{grid-area:2/2}.co-mid{grid-area:3/1/4/3}.co-bottom{grid-area:4/1/5/3}}
.co-bid{display:flex;flex-direction:column;gap:10px;align-items:center}
.co-btns{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.co-btns button{padding:7px 11px;background:rgba(255,255,255,.08);color:var(--text);box-shadow:inset 0 0 0 2px var(--felt-line)}
.co-btns button[aria-pressed="true"]{background:var(--sun);color:var(--sun-ink);box-shadow:0 3px 0 #b9770c}
.co-btns button.suit{font-size:22px;min-width:52px;background:#fbf8f0;color:var(--c);box-shadow:0 3px 0 rgba(0,0,0,.3)}
.co-btns button.suit[aria-pressed="true"]{background:#fff;color:var(--c);outline:3px solid var(--sun);outline-offset:2px}
.co-teams{display:flex;flex-direction:column;gap:10px}
.co-team{border-radius:14px;padding:10px 12px;background:rgba(255,255,255,.04);border-left:5px solid var(--tc);display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center}
.co-team.me{background:rgba(255,178,46,.1)}
.co-team .tn{font-weight:800;min-width:0;overflow:hidden;text-overflow:ellipsis}
.co-team .tn small{display:block;font-size:12px;color:var(--muted);font-weight:600}
.co-team .ts{font-family:var(--display);font-size:30px;line-height:1;color:var(--tc)}
.co-team .bar{grid-column:1/-1;height:9px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}
.co-team .bar i{display:block;height:100%;background:var(--tc);border-radius:inherit;transition:width .7s}
.co-team .live{grid-column:1/-1;font-size:12px;color:var(--muted);font-weight:700}
.co-mini{display:flex;gap:4px;flex-wrap:wrap}.co-mini .co-card{--w:42px}
.co-hist{font-size:13px}.co-hist td{padding:4px 5px}
.co-seats{display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:auto auto auto;gap:8px;align-items:center;justify-items:stretch}
.co-seatbtn{display:flex;flex-direction:column;gap:2px;align-items:center;padding:10px 8px;border-radius:12px;background:rgba(255,255,255,.05);border:2px dashed color-mix(in srgb,var(--tc) 70%,transparent);color:var(--text);box-shadow:none;font-weight:800;min-width:0}
.co-seatbtn.taken{border-style:solid;background:color-mix(in srgb,var(--tc) 16%,transparent)}
.co-seatbtn small{font-size:11px;color:var(--tc);text-transform:uppercase;letter-spacing:.06em}
.co-seatbtn span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`,

  settingsHTML(s, dis) {
    const yn = (k, v) => `<select id="s-${k}" data-setting="${k}" data-kind="bool" ${dis}><option value="1" ${v?"selected":""}>Oui</option><option value="0" ${!v?"selected":""}>Non</option></select>`;
    const opt = (list, cur) => list.map(([v,l])=>`<option value="${v}" ${cur==v?"selected":""}>${l}</option>`).join("");
    return `<div class="grid2">
      <div class="field"><label for="s-target">Partie en</label><select id="s-target" data-setting="target" ${dis}>${opt([[1000,"1000 points"],[1500,"1500 points"],[2000,"2000 points"],[3000,"3000 points"]], s.target)}</select></div>
      <div class="field"><label for="s-allowTASA">Tout atout / Sans atout</label>${yn("allowTASA", s.allowTASA)}</div>
      <div class="field"><label for="s-mustBeat">Le preneur doit faire plus que la défense</label>${yn("mustBeat", s.mustBeat)}</div>
      <div class="field"><label for="s-partnerFree">Partenaire maître : pas obligé de couper</label>${yn("partnerFree", s.partnerFree)}</div>
      <div class="field"><label for="s-scoreMode">Contrat réussi, on marque</label><select id="s-scoreMode" data-setting="scoreMode" data-kind="text" ${dis}>${opt([["plus","Contrat + points faits"],["contract","Le contrat seulement"]], s.scoreMode)}</select></div>
      <div class="field"><label for="s-round10">Arrondir à la dizaine</label>${yn("round10", s.round10)}</div>
      <div class="field"><label for="s-speed">Vitesse des plis</label><select id="s-speed" data-setting="speed" ${dis}>${opt([[0.6,"Lente"],[1,"Normale"],[1.8,"Rapide"]], s.speed)}</select></div>
    </div>
    <p class="note">Enchères de 80 à 180, puis Capot (250) et Générale (500), qui sont des maximums. Coinche ×2, surcoinche ×4 : après une coinche, seule l'équipe preneuse peut surcoincher. Belote-rebelote : 20 points, toujours pour l'équipe qui l'a. Dix de der. Contrat chuté : la défense marque 160 + le contrat.
    ${s.mustBeat?"Le preneur doit dépasser la défense (au moins 82 sur un contrat à 80).":"Le contrat est rempli dès que cartes + belote atteignent l'annonce (80 avec belote = 60 points de cartes)."}</p>`;
  },

  lobbyCheck(s, n, list) {
    if (n<4) return {ok:false, text:`Il faut 4 joueurs installés (encore ${4-n}).`};
    if (n>4) return {ok:false, text:"4 joueurs exactement : retirez les joueurs en trop."};
    return {ok:true, text:"Les joueurs sans place choisie seront placés automatiquement."};
  },

  lobbyExtra(S, ctx) {
    const seats = S.lobbyx?.seats || [null,null,null,null], esc=ctx.esc, amIn=S.lobby.some(p=>p.id===S.you);
    const btn = i => { const p=seats[i], team=i%2;
      return `<button type="button" class="co-seatbtn ${p?"taken":""}" style="--tc:${TEAMCOL[team]}" data-seat="${i}" ${!amIn||(p&&p.id===S.you)?"disabled":""}>
        <small>Équipe ${team?"B":"A"} · place ${i+1}</small><span>${p?esc(p.name)+(p.id===S.you?" (vous)":""):"Libre"}</span></button>`; };
    return `<h2 style="margin-top:6px">Places et équipes</h2>
      <div class="co-seats"><span></span>${btn(2)}<span></span>${btn(1)}<span class="note" style="text-align:center">Partenaires face à face</span>${btn(3)}<span></span>${btn(0)}<span></span></div>
      <p class="note">Cliquez une place libre pour vous y asseoir.${ctx.host?" En tant qu'hôte, cliquez une place occupée pour échanger avec ce joueur.":""}</p>
      ${ctx.host?`<button class="ghost" id="shuffleSeats" type="button">Équipes au hasard</button>`:""}`;
  },
  wireLobby(S, ctx) {
    ctx.app.querySelectorAll("[data-seat]").forEach(b=>b.onclick=()=>ctx.send({t:"seat", i:Number(b.dataset.seat)}));
    const sh=ctx.app.querySelector("#shuffleSeats"); if (sh) sh.onclick=()=>ctx.send({t:"shuffleSeats"});
  },

  status(S, ctx) {
    const g=S.g, nm=s=>ctx.esc(g.players[s]?.name);
    if (g.phase==="bidding") return `Donne ${g.handNo} · Enchères · ${g.turn===g.mySeat?"à vous d'annoncer":`${nm(g.turn)} réfléchit`}`;
    if (g.phase==="play") return `Donne ${g.handNo} · Pli ${Math.min(8, g.tricks.reduce((a,b)=>a+b,0)+1)}/8 · ${g.trickDone?`${nm(g.trickDone.winner)} remporte le pli`:g.turn===g.mySeat?"à vous de jouer":`à ${nm(g.turn)} de jouer`}`;
    if (g.phase==="handEnd") return `Fin de la donne ${g.handNo}`;
    if (g.phase==="over") return "Partie terminée";
    return "";
  },

  onState(S, ctx) {
    const g=S.g;
    if (g.handNo!==lastHandNo){ lastHandNo=g.handNo; sel=null; selBid=null; selSuit=null; }
    if (!g.legal.includes(sel)) sel=null;
    const seq=g.ev?.seq ?? 0;
    if (lastSeq===-1 || seq<lastSeq){ lastSeq=seq; return; }
    if (!g.ev || seq===lastSeq) return; lastSeq=seq;
    if (g.ev.type==="belote") ctx.toast(`${ctx.esc(g.players[g.ev.seat].name)} : « ${g.ev.word} ! »`);
  },

  render(S, ctx) {
    const g=S.g, s=S.settings, esc=ctx.esc, me=g.mySeat, spect = me<0;
    const base = spect ? 0 : me; // la place affichée en bas
    const pos = seat => ["bottom","left","top","right"][(seat-base+4)%4];
    const myTeam = spect ? -1 : me%2;
    const teamName = t => myTeam<0 ? `Équipe ${t?"B":"A"}` : (t===myTeam ? "Nous" : "Eux");
    const pl = seat => g.players[seat];
    const c = g.contract, b = g.bidding;

    // bulles d'enchères : dernière action de chaque joueur
    const lastBid = {}; (b?.log||[]).forEach(x=>{ lastBid[x.seat]=x.text; });
    const seatBox = seat => {
      const p=pl(seat), t=seat%2;
      const bubble = g.phase==="bidding" && lastBid[seat] ? `<span class="co-bubble ${/Coinche|Surcoinche/.test(lastBid[seat])?"hot":""}">${esc(lastBid[seat])}</span>`
        : (g.belote && g.belote.seat===seat && g.phase==="play") ? `<span class="co-bubble">${esc(g.belote.word)}</span>` : "";
      return `<div class="co-seat ${g.turn===seat&&(g.phase==="bidding"||g.phase==="play")&&!g.trickDone?"turn":""} ${p.online?"":"off"}" style="--tc:${TEAMCOL[t]}">
        ${g.dealer===seat?`<span class="co-dealer" title="Donneur">D</span>`:""}
        <span class="nm"><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}${seat===me?" (vous)":""}</span>
        <span class="tm">${teamName(t)}${p.online?"":" · déconnecté"}</span>
        ${seat!==me?backHTML(p.cards):""}${bubble}</div>`;
    };
    const winSeat = g.trickDone ? g.trickDone.winner : -1;
    const trickCards = g.trick.map((t,i)=>`<div class="pos-${pos(t.seat)}">${cardHTML(t.card, (t.seat===winSeat?"win ":"")+(i===g.trick.length-1&&!g.trickDone?"drop":""))}</div>`).join("");
    const centerInfo = g.phase==="bidding" ? (b.high?`Meilleure annonce<br><b style="color:var(--sun);font-size:18px">${bidLabel(b.high.value)} ${modeShort(b.high.suit)}</b>`:"Pas encore d'annonce")
      : g.trickDone ? `<b style="color:var(--good)">${esc(pl(winSeat).name)}</b><br>+${g.trickDone.pts} pts` : "";
    const table = `<div class="co-table">
      <div class="co-top">${seatBox((base+2)%4)}</div>
      <div class="co-left">${seatBox((base+1)%4)}</div>
      <div class="co-mid co-center">${trickCards}<div class="info">${centerInfo}</div></div>
      <div class="co-right">${seatBox((base+3)%4)}</div>
      <div class="co-bottom">${seatBox(base)}</div></div>`;

    const banner = c ? `<div class="co-banner"><span>Contrat</span><span class="ct">${bidLabel(c.value)} · ${MODE_LABEL[c.suit]}</span>
        <span>par ${esc(c.by)} (${teamName(c.seat%2)})</span>
        ${c.mult===2?`<span class="co-chip" style="background:var(--danger);color:#fff">Coinché ×2</span>`:c.mult===4?`<span class="co-chip" style="background:#a05cff;color:#fff">Surcoinché ×4</span>`:""}</div>`
      : `<div class="co-banner"><span>Enchères en cours · donneur : ${esc(pl(g.dealer).name)}</span></div>`;

    // panneau d'enchères
    let bidPanel = "";
    if (g.phase==="bidding" && !spect){
      if (g.turn!==me) bidPanel = `<section class="panel"><p class="hint">${esc(pl(g.turn).name)} réfléchit à son annonce…</p></section>`;
      else if (b.surWindow){
        bidPanel = `<section class="panel co-bid"><p class="hint big" style="color:var(--danger)">Vous êtes coinchés !</p>
          <div class="inline"><button id="surBtn">Surcoincher (×4)</button><button class="ghost" id="passBtn">Passer</button></div></section>`;
      } else {
        const capped = b.high && (b.high.value==="capot"||b.high.value==="generale");
        const minRank = b.high ? BID_VALUES.indexOf(b.high.value)+1 : 0;
        const vals = BID_VALUES.filter((v,i)=>i>=minRank);
        if (selBid!=null && !vals.includes(selBid)) selBid=null;
        const suits = ["S","H","D","C"].concat(s.allowTASA?["TA","SA"]:[]);
        const canCoinche = b.high && b.high.seat%2!==me%2 && b.coinche===1;
        bidPanel = `<section class="panel co-bid">
          ${capped?`<p class="hint">${bidLabel(b.high.value)} est l'annonce maximale : vous pouvez seulement passer${canCoinche?" ou coincher":""}.</p>`:`
          <p class="hint">Choisissez un montant et une couleur</p>
          <div class="co-btns">${vals.map(v=>`<button type="button" data-bid="${v}" aria-pressed="${selBid===v}">${bidLabel(v)}</button>`).join("")}</div>
          <div class="co-btns">${suits.map(x=>`<button type="button" class="${x.length===1?"suit":""}" data-suit="${x}" aria-pressed="${selSuit===x}" style="${x.length===1?`--c:${SUITCOL[x]}`:""}">${x.length===1?SIGN[x]:MODE_LABEL[x]}</button>`).join("")}</div>`}
          <div class="inline" style="justify-content:center">
            ${capped?"":`<button id="bidBtn" ${selBid!=null&&selSuit?"":"disabled"}>${selBid!=null&&selSuit?`Annoncer ${bidLabel(selBid)} ${modeShort(selSuit)}`:"Annoncer"}</button>`}
            <button class="ghost" id="passBtn">Passer</button>
            ${canCoinche?`<button id="coincheBtn" style="background:var(--danger);color:#fff;box-shadow:0 3px 0 #a3122c">Coincher !</button>`:""}
          </div></section>`;
      }
    }

    // main
    let handHTML = "";
    if (!spect){
      const myTurnPlay = g.phase==="play" && g.turn===me && !g.trickDone;
      handHTML = `<section class="panel"><div class="handbar"><p class="hint">${myTurnPlay?(sel?"Cliquez à nouveau la carte (ou le bouton) pour la jouer":"À vous de jouer : les cartes jouables sont en couleur"):g.phase==="bidding"?"Votre main":`Votre main · ${g.hand.length} carte${g.hand.length>1?"s":""}`}</p>
        ${myTurnPlay&&sel?`<button id="playBtn">Jouer cette carte</button>`:""}</div>
        <div class="co-hand">${g.hand.map(cd=>{ const ok=myTurnPlay&&g.legal.includes(cd);
          return cardHTML(cd, (ok?"legal ":"")+(myTurnPlay&&!ok?"dim ":"")+(cd===sel?"sel":""), ok?`data-card="${cd}" tabindex="0" role="button"`:""); }).join("")}</div></section>`;
    } else handHTML = `<section class="panel"><p class="hint">Vous regardez la partie en spectateur.</p></section>`;

    // scores par équipe
    const teamBox = t => { const names = `${esc(pl(t).name)} & ${esc(pl(t+2).name)}`, sc=g.scores[t];
      const tricks = g.tricks[t]+g.tricks[t+2];
      return `<div class="co-team ${t===myTeam?"me":""}" style="--tc:${TEAMCOL[t]}"><span class="tn">${teamName(t)}<small>${names}</small></span><span class="ts">${sc}</span>
        <span class="bar"><i style="width:${Math.min(100,sc/s.target*100).toFixed(1)}%"></i></span>
        ${g.phase==="play"||g.phase==="handEnd"?`<span class="live">Cette donne : ${g.live[t]} pts · ${tricks} pli${tricks>1?"s":""}</span>`:""}</div>`; };
    const hist = g.history.slice(-6).reverse();
    const side = `<section class="panel"><h2>Scores</h2><div class="co-teams">${teamBox(0)}${teamBox(1)}</div>
        <p class="note" style="margin-top:10px">Partie en ${s.target} points.${S.spectators?` · ${S.spectators} spectateur${S.spectators>1?"s":""}`:""}</p></section>
      ${g.lastTrick?`<section class="panel"><h2>Dernier pli</h2><div class="co-mini">${g.lastTrick.cards.map(t=>cardHTML(t.card, t.seat===g.lastTrick.winner?"win":"")).join("")}</div><p class="note" style="margin-top:6px">Remporté par ${esc(pl(g.lastTrick.winner).name)}</p></section>`:""}
      ${hist.length?`<section class="panel"><h2>Donnes</h2><table class="co-hist"><tbody>${hist.map(h=>`<tr><td>${esc(h.contract)}</td><td style="color:${h.made?"var(--good)":"var(--danger)"}">${h.made?"Fait":"Chuté"}</td><td class="n" style="color:${TEAMCOL[0]}">+${h.add[0]}</td><td class="n" style="color:${TEAMCOL[1]}">+${h.add[1]}</td></tr>`).join("")}</tbody></table></section>`:""}
      ${ctx.hostTools((g.phase==="bidding"||g.phase==="play")&&!g.players[g.turn].online?`<button class="ghost" id="forceBtn">Jouer à la place de ${esc(pl(g.turn).name)} (déconnecté)</button>`:"")}`;

    ctx.app.innerHTML = `<div class="layout"><aside class="stack">${side}</aside><div class="board">${banner}${table}${bidPanel}${handHTML}</div></div>`;

    // interactions
    const q = sel_ => ctx.app.querySelector(sel_);
    ctx.app.querySelectorAll("[data-bid]").forEach(x=>x.onclick=()=>{ const v=x.dataset.bid; selBid = isNaN(v)?v:Number(v); ctx.rerender(); });
    ctx.app.querySelectorAll("[data-suit]").forEach(x=>x.onclick=()=>{ selSuit=x.dataset.suit; ctx.rerender(); });
    if (q("#bidBtn")) q("#bidBtn").onclick=()=>{ ctx.send({t:"bid", value:selBid, suit:selSuit}); selBid=null; selSuit=null; };
    if (q("#passBtn")) q("#passBtn").onclick=()=>ctx.send({t:"pass"});
    if (q("#coincheBtn")) q("#coincheBtn").onclick=()=>ctx.send({t:"coinche"});
    if (q("#surBtn")) q("#surBtn").onclick=()=>ctx.send({t:"surcoinche"});
    if (q("#forceBtn")) q("#forceBtn").onclick=()=>ctx.send({t:"force"});
    const play = cd => { ctx.send({t:"play", card:cd}); sel=null; };
    ctx.app.querySelectorAll("[data-card]").forEach(el=>{
      const cd=el.dataset.card;
      el.onclick=()=>{ if (sel===cd) play(cd); else { sel=cd; ctx.rerender(); } };
      el.ondblclick=()=>play(cd);
      el.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); el.onclick(); } };
    });
    if (q("#playBtn")) q("#playBtn").onclick=()=>sel&&play(sel);

    // fin de donne / de partie
    if ((g.phase==="handEnd"||g.phase==="over") && g.result){
      const r=g.result, T=r.takerTeam, over=g.phase==="over";
      const row = (label, a, b) => `<tr><td>${label}</td><td class="n">${a}</td><td class="n">${b}</td></tr>`;
      ctx.overlay(`<h2 id="mt">${over?`${teamName(g.winner)==="Nous"?"Victoire !":teamName(g.winner)==="Eux"?"Défaite…":teamName(g.winner)+" gagne !"}`:(r.made?"Contrat réussi !":"Contrat chuté !")}</h2>
        <p class="hint">${bidLabel(r.contract.value)} ${MODE_LABEL[r.contract.suit]} par ${esc(r.contract.by)}${r.contract.mult>1?` · ${r.contract.mult===2?"coinché":"surcoinché"}`:""} · ${teamName(T)} ${r.totalT} pts (belote comprise) contre ${r.totalD}</p>
        <table><thead><tr><th></th><th class="n" style="color:${TEAMCOL[0]}">${teamName(0)}</th><th class="n" style="color:${TEAMCOL[1]}">${teamName(1)}</th></tr></thead><tbody>
        ${row("Points des cartes", r.card[0], r.card[1])}${row("Belote", r.bel[0]||"–", r.bel[1]||"–")}${row("<b>Marqué cette donne</b>", `<b>+${r.add[0]}</b>`, `<b>+${r.add[1]}</b>`)}${row("<b>Total</b>", `<b>${g.scores[0]}</b>`, `<b>${g.scores[1]}</b>`)}
        </tbody></table>
        ${ctx.host?`<div class="inline" style="justify-content:center">${over?`<button id="againBtn">Nouvelle partie</button>`:`<button id="nextBtn">Donne suivante</button>`}</div>`:`<p class="hint">L'hôte lance la suite…</p>`}`,
        { nextBtn:()=>ctx.send({t:"next"}), againBtn:()=>ctx.send({t:"lobby"}) });
    } else ctx.overlay(null);
  },
});
})();
