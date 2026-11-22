// Sixième Bœuf — affichage du jeu (module client de Tapis Vert).
(() => {
const heads = n => n===55 ? 7 : n%11===0 ? 5 : n%10===0 ? 3 : n%5===0 ? 2 : 1;
const bull = '<svg aria-hidden="true"><use href="#bull"/></svg>';
const ROWCOLORS=["#ff7b54","#46c2ff","#c08bff","#5fd38a","#ffd23f","#ff6fb5"];
let selCard=null, seenCards=new Set(), lastSeq=-1, pending=false, flipKey="";

function cardHTML(n, extra="", attrs=""){
  const h = heads(n);
  return `<div class="sb-card ${extra}" data-h="${h}" ${attrs} aria-label="Carte ${n}, ${h} tête${h>1?"s":""}"><div class="face"></div><div class="band" style="--n:${h}">${bull.repeat(h)}</div><div class="num">${n}</div><div class="corner l">${n}</div><div class="corner">${n}</div></div>`;
}

TV.register({
  id: "sixieme",
  name: "Sixième Bœuf",
  tagline: "Posez vos cartes sans être celui qui pose la sixième d'une rangée.",
  players: "2 à 10 joueurs",
  accent: "#ffb22e",
  preview: () => `<div class="sb-preview">${[7,55,22].map(cardHTML).join("")}</div>`,
  css: `
.sb-card{--cw:clamp(42px,6.6vw,66px);--fr:#36c08e;--fr-d:#156e4d;--fc:#e8fbf2;flex:0 0 var(--cw);width:var(--cw);height:calc(var(--cw)*1.42);border-radius:calc(var(--cw)*.15);position:relative;user-select:none;overflow:hidden;
  background:linear-gradient(155deg,var(--fr) 0%,var(--fr-d) 100%);box-shadow:0 3px 0 rgba(0,0,0,.35),0 6px 14px rgba(0,0,0,.25)}
.sb-card .face{position:absolute;inset:calc(var(--cw)*.065);border-radius:calc(var(--cw)*.1);
  background:radial-gradient(circle at 50% 63%, #fff 0 33%, transparent 34%),
    radial-gradient(color-mix(in srgb, var(--fr) 35%, transparent) 1.3px, transparent 1.6px) 0 0/calc(var(--cw)*.15) calc(var(--cw)*.15),
    linear-gradient(180deg,var(--fc),#fff)}
.sb-card .band{position:absolute;top:calc(var(--cw)*.12);left:50%;transform:translateX(-50%);display:flex;gap:1px;padding:2px 6px;border-radius:999px;background:var(--fr-d);color:#fff;z-index:1;max-width:88%;flex-wrap:nowrap;justify-content:center;box-shadow:0 2px 0 rgba(0,0,0,.15)}
.sb-card .band svg{flex:0 0 auto;width:min(calc(var(--cw)*.17), calc(var(--cw)*.66 / var(--n)));height:min(calc(var(--cw)*.17), calc(var(--cw)*.66 / var(--n)))}
.sb-card .num{position:absolute;left:0;right:0;top:36%;height:54%;display:grid;place-items:center;font-family:var(--display);font-size:calc(var(--cw)*.44);line-height:1;color:var(--fr-d);text-shadow:0 2px 0 color-mix(in srgb, var(--fr) 40%, #fff);z-index:1}
.sb-card .corner{position:absolute;bottom:calc(var(--cw)*.1);right:calc(var(--cw)*.13);font-size:calc(var(--cw)*.15);font-weight:800;color:var(--fr-d);opacity:.75;z-index:1}
.sb-card .corner.l{right:auto;left:calc(var(--cw)*.13)}
.sb-card[data-h="2"]{--fr:#3d9bff;--fr-d:#1652b0;--fc:#e4f0ff}
.sb-card[data-h="3"]{--fr:#ffb21c;--fr-d:#9a5800;--fc:#fff3d1}
.sb-card[data-h="5"]{--fr:#ff4d6a;--fr-d:#a3122c;--fc:#ffe3e8}
.sb-card[data-h="7"]{--fr:#a05cff;--fr-d:#4a17ad;--fc:#f0e6ff}
.sb-card[data-h="7"]::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.6) 48%,transparent 60%);background-size:260% 100%;animation:sb-shine 2.8s linear infinite;pointer-events:none;z-index:2}
@keyframes sb-shine{from{background-position:140% 0}to{background-position:-120% 0}}
.sb-card.new{animation:sb-drop .45s cubic-bezier(.2,1.4,.4,1)}
@keyframes sb-drop{from{transform:translateY(-30px) scale(1.15) rotate(-6deg);opacity:0}}
.sb-card.pickable{cursor:pointer;transition:transform .12s}
.sb-card.pickable:hover{transform:translateY(-6px)}
.sb-card.pickable:focus-visible{outline:3px solid var(--sun);outline-offset:2px}
.sb-card.sel{transform:translateY(-14px)!important;box-shadow:0 0 0 3px var(--sun),0 10px 18px rgba(0,0,0,.45)}
.sb-hand{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;padding:12px 4px 4px}
.sb-hand .sb-card{--cw:clamp(48px,7.2vw,76px)}
.sb-legend{display:flex;gap:8px;flex-wrap:wrap}.sb-legend .sb-card{--cw:38px}
.sb-preview{display:flex;justify-content:center;gap:0}
.sb-preview .sb-card{--cw:54px;margin:0 -6px}
.sb-preview .sb-card:nth-child(1){transform:rotate(-10deg) translateY(4px)}.sb-preview .sb-card:nth-child(3){transform:rotate(10deg) translateY(4px)}
.sb-rows{display:flex;flex-direction:column;gap:10px}
.sb-row{--rc:#fff;display:flex;align-items:center;gap:8px;padding:8px;border-radius:14px;border:2px dashed transparent;border-left:4px solid var(--rc);overflow-x:auto;background:linear-gradient(90deg, color-mix(in srgb, var(--rc) 16%, transparent), rgba(0,0,0,.18) 40%)}
.sb-row.choosable{border-color:var(--sun);border-left-color:var(--rc);cursor:pointer;animation:sb-pulse 1.2s ease-in-out infinite}
.sb-row.choosable:hover{background:rgba(255,178,46,.15)}
.sb-row.choosable:focus-visible{outline:3px solid var(--sun);outline-offset:2px}
@keyframes sb-pulse{50%{box-shadow:0 0 0 4px rgba(255,178,46,.25)}}
.sb-tag{flex:0 0 auto;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-family:var(--display);font-size:16px;background:var(--rc);color:#10201c;box-shadow:0 2px 0 rgba(0,0,0,.3)}
.sb-slot{--cw:clamp(42px,6.6vw,66px);flex:0 0 var(--cw);height:calc(var(--cw)*1.42);border-radius:9px;border:2px dashed rgba(255,255,255,.1)}
.sb-slot.sixth{border-color:rgba(255,106,92,.55);display:grid;place-items:center;color:var(--danger);font-family:var(--display);font-size:calc(var(--cw)*.36)}
.sb-rowinfo{margin-left:auto;flex:0 0 auto;display:flex;align-items:center;gap:4px;font-weight:800;color:var(--muted);padding-left:6px;font-variant-numeric:tabular-nums}
.sb-rowinfo svg{width:16px;height:16px}
.sb-reveal{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.sb-rv{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;font-weight:800;max-width:86px}
.sb-rv span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-rv.cur .sb-card{transform:translateY(-8px);box-shadow:0 0 0 3px var(--sun),0 8px 16px rgba(0,0,0,.4)}
.sb-rv.flipin .sb-card{animation:sb-flip .4s ease-out both}
@keyframes sb-flip{from{transform:rotateY(90deg)}}
`,

  settingsHTML(s, dis) {
    const opt = (list, cur) => list.map(([v,l])=>`<option value="${v}" ${cur==v?"selected":""}>${l}</option>`).join("");
    return `<div class="grid2">
      <div class="field"><label for="s-threshold">Fin de partie à (têtes)</label><input id="s-threshold" data-setting="threshold" type="number" min="10" max="500" value="${s.threshold}" ${dis}></div>
      <div class="field"><label for="s-hand">Cartes en main</label><input id="s-hand" data-setting="hand" type="number" min="3" max="15" value="${s.hand}" ${dis}></div>
      <div class="field"><label for="s-rows">Nombre de rangées</label><input id="s-rows" data-setting="rows" type="number" min="2" max="6" value="${s.rows}" ${dis}></div>
      <div class="field"><label for="s-rowMax">Cartes max par rangée</label><input id="s-rowMax" data-setting="rowMax" type="number" min="3" max="8" value="${s.rowMax}" ${dis}></div>
      <div class="field"><label for="s-maxCard">Plus haute carte</label><input id="s-maxCard" data-setting="maxCard" type="number" min="40" max="200" value="${s.maxCard}" ${dis}></div>
      <div class="field"><label for="s-turnTime">Temps par tour</label><select id="s-turnTime" data-setting="turnTime" ${dis}>${opt([[0,"Illimité"],[20,"20 s"],[30,"30 s"],[45,"45 s"],[60,"1 min"],[90,"1 min 30"]], s.turnTime)}</select></div>
      <div class="field"><label for="s-speed">Vitesse de résolution</label><select id="s-speed" data-setting="speed" ${dis}>${opt([[0.6,"Lente"],[1,"Normale"],[1.8,"Rapide"]], s.speed)}</select></div>
      <div class="field"><label for="s-tactical">Variante tactique</label><select id="s-tactical" data-setting="tactical" data-kind="bool" ${dis}>${opt([[0,"Non"],[1,"Oui (paquet réduit)"]], s.tactical?1:0)}</select></div>
    </div>
    <p class="note">La ${s.rowMax+1}<sup>e</sup> carte posée sur une rangée la fait ramasser. Variante tactique : on joue seulement avec les cartes 1 à (joueurs × ${s.hand} + ${s.rows}).</p>
    <div class="field"><label>Têtes par carte</label><div class="sb-legend">${[3,5,10,11,55].map(n=>cardHTML(n)).join("")}</div></div>`;
  },

  lobbyCheck(s, n) {
    const need = n*s.hand + s.rows;
    if (n<2) return {ok:false, text:"Il faut au moins 2 joueurs installés."};
    if (n>10) return {ok:false, text:"10 joueurs maximum."};
    if (need>s.maxCard) return {ok:false, text:`Pas assez de cartes : il en faut ${need}, la plus haute est ${s.maxCard}.`};
    return {ok:true, text:"Tout le monde est là ? C'est parti."};
  },

  status(S, ctx) {
    const g=S.g, pname=id=>g.players.find(p=>p.id===id)?.name ?? "?";
    const timer = g.deadlineAt ? ` <span class="timer" data-deadline="${g.deadlineAt}"></span>` : "";
    switch(g.phase){
      case "choose": return `Manche ${g.round} · Tour ${g.turn}/${S.settings.hand} · Choisissez une carte${timer}`;
      case "reveal": return `Manche ${g.round} · Tour ${g.turn} · Résolution`;
      case "pickRow": return `${ctx.esc(pname(g.waiting))} choisit une rangée à ramasser${timer}`;
      case "roundEnd": return `Fin de la manche ${g.round}`;
      case "over": return `Partie terminée`;
    }
    return "";
  },

  onState(S, ctx) {
    const g=S.g; pending=false;
    const ev=g.ev, seq=ev?.seq ?? 0;
    if (lastSeq===-1 || seq<lastSeq){ lastSeq=seq; return; }
    if (!ev || seq===lastSeq) return; lastSeq=seq;
    const pname=id=>ctx.esc(g.players.find(p=>p.id===id)?.name ?? "?");
    if (ev.type==="take") ctx.toast(`${ev.id===S.you?"Vous ramassez":pname(ev.id)+" ramasse"} ${ev.n} carte${ev.n>1?"s":""} : <b>${ev.h} tête${ev.h>1?"s":""}</b>`);
    if (ev.type==="low" && ev.id!==S.you) ctx.toast(`${pname(ev.id)} a joué trop petit et doit choisir une rangée`);
  },

  render(S, ctx) {
    const g=S.g, s=S.settings, esc=ctx.esc, mine=g.players.find(p=>p.id===S.you);
    const playerById=id=>g.players.find(p=>p.id===id);
    const statusOf = p => {
      if (g.phase==="choose") return p.locked ? "Carte posée" : "Réfléchit…";
      if (g.phase==="pickRow" && g.waiting===p.id) return "Choisit une rangée";
      return `${p.pile} carte${p.pile>1?"s":""} ramassée${p.pile>1?"s":""}`;
    };
    const players=[...g.players].sort((a,b)=>(a.total+a.round)-(b.total+b.round));
    const scores = ctx.scoreList(players.map(p=>({
      id:p.id, name:p.name, color:p.color, online:p.online, score:p.total+p.round,
      sub:statusOf(p), extra:p.round?`+${p.round} cette manche`:"",
    })), {threshold:s.threshold, lowWins:true, unit:"têtes"});
    const fk=`${g.round}-${g.turn}`, flipNow = g.phase==="reveal" && fk!==flipKey; if(g.phase==="reveal"||g.phase==="pickRow") flipKey=fk;
    const choosingRow = g.phase==="pickRow" && g.waiting===S.you;
    const rowsHTML = g.rows.map((r,i)=>{
      const tot=r.reduce((a,c)=>a+heads(c),0), L=String.fromCharCode(65+i);
      const cards=r.map(c=>cardHTML(c, seenCards.has(c)?"":"new")).join("");
      return `<div class="sb-row ${choosingRow?"choosable":""}" style="--rc:${ROWCOLORS[i%ROWCOLORS.length]}" ${choosingRow?`role="button" tabindex="0" data-row="${i}" aria-label="Ramasser la rangée ${L} (${tot} têtes)"`:""}><div class="sb-tag">${L}</div>${cards}${'<div class="sb-slot"></div>'.repeat(Math.max(0,s.rowMax-r.length))}<div class="sb-slot sixth" title="Celui qui pose ici ramasse la rangée">${s.rowMax+1}</div><div class="sb-rowinfo">${tot} ${bull}</div></div>`;
    }).join("");
    let handHTML;
    if (mine){
      const hand=g.hand, canPick=g.phase==="choose" && g.myPick==null && !pending && !g.autoLast;
      if (selCard!=null && !hand.includes(selCard)) selCard=null;
      handHTML = `<section class="panel"><div class="handbar">
        ${canPick?`<p class="hint">${selCard==null?"Cliquez une carte pour la choisir (double-clic pour la jouer directement)":`Carte ${selCard} sélectionnée`}</p><button id="playBtn" ${selCard==null?"disabled":""}>Jouer cette carte</button>`
        : g.phase==="choose"&&g.autoLast?`<p class="hint big" style="color:var(--sun)">Dernière carte : le <b>${g.myPick}</b> est joué automatiquement</p>`
        : g.phase==="choose"?`<p class="hint">Vous avez posé le <b>${g.myPick ?? selCard}</b>. On attend les autres…</p>`
        : choosingRow?`<p class="hint big" style="color:var(--sun)">Votre carte est trop petite ! Cliquez la rangée que vous ramassez.</p>`
        : `<p class="hint">Votre main · ${hand.length} carte${hand.length>1?"s":""}</p>`}
        </div><div class="sb-hand">${hand.map(c=>cardHTML(c,(canPick?"pickable ":"")+(c===selCard?"sel":""), canPick?`tabindex="0" role="button" data-card="${c}"`:"")).join("")}</div></section>`;
    } else handHTML = `<section class="panel"><p class="hint">Vous regardez la partie en spectateur. Vous pourrez jouer à la prochaine partie.</p></section>`;
    const extraTools = (g.phase==="choose"||g.phase==="pickRow") ? `<button class="ghost" id="forceBtn">Jouer au hasard pour les retardataires</button>` : "";
    ctx.app.innerHTML = `<div class="layout">
      <aside class="stack">
        <section class="panel"><h2>Scores</h2>${scores}
        <p class="note" style="margin-top:10px">Fin à ${s.threshold} têtes · le moins de têtes gagne.${S.spectators?` · ${S.spectators} spectateur${S.spectators>1?"s":""}`:""}</p></section>
        ${ctx.hostTools(extraTools)}
      </aside>
      <div class="board">
        ${g.reveal.length&&(g.phase==="reveal"||g.phase==="pickRow")?`<section class="panel"><h2>Cartes jouées</h2><div class="sb-reveal">${g.reveal.map((r,i)=>`<div class="sb-rv ${i===0?"cur":""} ${flipNow?"flipin":""}">${cardHTML(r.c)}<span style="color:${esc(playerById(r.id)?.color)}">${esc(playerById(r.id)?.name)}</span></div>`).join("")}</div></section>`:""}
        <section class="sb-rows" aria-label="Rangées">${rowsHTML}</section>
        ${handHTML}
      </div></div>`;
    g.rows.flat().forEach(c=>seenCards.add(c));

    const play=()=>{ if(selCard==null||g.phase!=="choose") return; pending=true; ctx.send({t:"pick", c:selCard}); ctx.rerender(); };
    ctx.app.querySelectorAll("[data-card]").forEach(el=>{
      const pick=()=>{ selCard=Number(el.dataset.card); ctx.rerender(); };
      el.onclick=pick; el.ondblclick=()=>{ selCard=Number(el.dataset.card); play(); };
      el.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); pick(); } };
    });
    const pb=ctx.app.querySelector("#playBtn"); if (pb) pb.onclick=play;
    ctx.app.querySelectorAll("[data-row]").forEach(el=>{
      const go=()=>ctx.send({t:"row", r:Number(el.dataset.row)});
      el.onclick=go; el.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); go(); } };
    });
    const fb=ctx.app.querySelector("#forceBtn"); if (fb) fb.onclick=()=>ctx.send({t:"force"});

    // fin de manche / de partie
    if (g.phase==="roundEnd" || g.phase==="over"){
      const ranked=[...g.players].sort((a,b)=>a.total-b.total), over=g.phase==="over";
      ctx.overlay(`<h2 id="mt">${over?`${esc(ranked[0].name)} gagne !`:`Fin de la manche ${g.round}`}</h2>
        <table><thead><tr><th>#</th><th>Joueur</th><th class="n">Manche</th><th class="n">Total</th><th>Vers ${s.threshold}</th></tr></thead><tbody>
        ${ranked.map((p,i)=>`<tr><td>${i+1}</td><td><span style="color:${esc(p.color)}">●</span> ${esc(p.name)}${p.id===S.you?" (vous)":""}</td><td class="n">+${p.lastRound}</td><td class="n"><b>${p.total}</b></td><td>${ctx.miniBar(p.total/s.threshold)}</td></tr>`).join("")}
        </tbody></table>
        <p class="note" style="text-align:center">${over?`Le joueur avec le moins de têtes l'emporte.`:`Partie jusqu'à ${s.threshold} têtes.`}</p>
        ${ctx.host?`<div class="inline" style="justify-content:center">${over?`<button id="againBtn">Nouvelle partie</button>`:`<button id="nextBtn">Manche suivante</button><button class="ghost" id="stopBtn">Arrêter là</button>`}</div>`:`<p class="hint">L'hôte lance la suite…</p>`}`,
        { nextBtn:()=>ctx.send({t:"next"}), againBtn:()=>ctx.send({t:"lobby"}), stopBtn:()=>ctx.send({t:"stop"}) });
    } else ctx.overlay(null);
  },
});
})();
