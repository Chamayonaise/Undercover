"use strict";

/* ============================================================
   Undercover — jeu à un seul téléphone (pass-and-play)
   Règles : regles.md · Banque de mots : paires.json
   ============================================================ */

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 20;
// Sources de paires exclues du jeu (ex. : paires sans licence de publication).
const EXCLUDED_SOURCES = [];

const ROLE = { CIVIL: "civil", UNDER: "undercover", WHITE: "white" };
const ROLE_INFO = {
  civil: { label: "Civil", plural: "Civils", cls: "c-civil", emoji: "🧑" },
  undercover: { label: "Undercover", plural: "Undercovers", cls: "c-under", emoji: "🕵️" },
  white: { label: "Mr. White", plural: "Mr. White", cls: "c-white", emoji: "👻" },
};
const POINTS = { civilWin: 2, underWin: 10, whiteWin: 6, whiteGuess: 6 };

// Répartition recommandée (regles.md)
const RECO = {
  3: [2, 1, 0], 4: [3, 1, 0], 5: [3, 1, 1], 6: [4, 1, 1], 7: [4, 2, 1], 8: [5, 2, 1],
  9: [5, 3, 1], 10: [6, 3, 1], 11: [6, 3, 2], 12: [7, 3, 2],
};

/* ---------------- Stockage ---------------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem("uc." + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("uc." + key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
  },
  del(key) { try { localStorage.removeItem("uc." + key); } catch { /* ignore */ } },
};

/* ---------------- État ---------------- */
let DATA = null; // contenu de paires.json
let settings = Object.assign({
  players: [],
  custom: false,
  undercover: 1,
  white: 0,
  categories: null, // null = toutes
  difficulties: [1, 2, 3],
}, store.get("settings", {}));
let scores = store.get("scores", {});
let usedPairs = store.get("usedPairs", []);
let game = store.get("game", null);
let ui = { screen: "home" };

function saveSettings() { store.set("settings", settings); }
function saveGame() { if (game) store.set("game", game); else store.del("game"); }

/* ---------------- Utilitaires ---------------- */
const $app = document.getElementById("app");
const $modal = document.getElementById("modal");

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function rand(n) {
  if (window.crypto && crypto.getRandomValues) {
    const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n;
  }
  return Math.floor(Math.random() * n);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function normalize(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/^(le|la|les|l'|l’|un|une|des|du|de la|de l'|d')\s*/i, "")
    .replace(/[^a-z0-9]/g, "");
}
function initial(name) { return esc((name.trim()[0] || "?").toUpperCase()); }
function toast(msg) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
function vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* ignore */ } }

/* ---------------- Répartition ---------------- */
function recommended(n) {
  if (n < MIN_PLAYERS) return [n, 0, 0];
  if (RECO[n]) return RECO[n];
  const w = Math.min(3, Math.floor(n / 6));
  const u = Math.round(n * 0.3);
  return [n - u - w, u, w];
}
function distribution() {
  const n = settings.players.length;
  if (!settings.custom) { const [c, u, w] = recommended(n); return { c, u, w }; }
  const u = settings.undercover, w = settings.white;
  return { c: n - u - w, u, w };
}
function distValid(d, n) {
  return n >= MIN_PLAYERS && d.u + d.w >= 1 && d.c >= 2 && d.c * 2 > n && d.u >= 0 && d.w >= 0;
}

/* ---------------- Paires ---------------- */
function availablePairs() {
  if (!DATA) return [];
  const cats = settings.categories;
  return DATA.paires.filter(p =>
    !EXCLUDED_SOURCES.includes(p.source) &&
    (!cats || cats.includes(p.categorie)) &&
    settings.difficulties.includes(p.difficulte));
}
function drawPair() {
  const pool = availablePairs();
  if (!pool.length) return null;
  let fresh = pool.filter(p => !usedPairs.includes(p.id));
  if (!fresh.length) { // toutes les paires ont été jouées : on recommence
    const ids = new Set(pool.map(p => p.id));
    usedPairs = usedPairs.filter(id => !ids.has(id));
    fresh = pool;
  }
  const pair = fresh[rand(fresh.length)];
  usedPairs.push(pair.id);
  store.set("usedPairs", usedPairs);
  return pair;
}

/* ---------------- Partie ---------------- */
function startGame() {
  const n = settings.players.length;
  const d = distribution();
  if (!distValid(d, n)) { toast("Répartition invalide"); return; }
  const pair = drawPair();
  if (!pair) { toast("Aucune paire ne correspond aux filtres"); return; }

  const swap = rand(2) === 1;
  const civilWord = swap ? pair.motB : pair.motA;
  const underWord = swap ? pair.motA : pair.motB;

  const roles = shuffle([
    ...Array(d.c).fill(ROLE.CIVIL), ...Array(d.u).fill(ROLE.UNDER), ...Array(d.w).fill(ROLE.WHITE),
  ]);
  const players = settings.players.map((name, i) => ({
    name, role: roles[i], alive: true,
    word: roles[i] === ROLE.CIVIL ? civilWord : roles[i] === ROLE.UNDER ? underWord : null,
  }));

  // Ordre de parole aléatoire ; Mr. White ne peut pas commencer.
  let order = shuffle(players.map((_, i) => i));
  if (players[order[0]].role === ROLE.WHITE) {
    const k = order.findIndex(i => players[i].role !== ROLE.WHITE);
    [order[0], order[k]] = [order[k], order[0]];
  }

  game = {
    pairId: pair.id, category: pair.categorie, difficulty: pair.difficulte,
    civilWord, underWord, players, order,
    round: 1, revealIdx: 0, revealShown: false,
    vote: null, eliminated: null, result: null, log: [],
  };
  go("pass");
}

function alivePlayers() { return game.players.filter(p => p.alive); }
function speakingOrder() { return game.order.filter(i => game.players[i].alive); }

function checkWin() {
  const alive = alivePlayers();
  const civils = alive.filter(p => p.role === ROLE.CIVIL).length;
  const impostors = alive.length - civils;
  if (impostors === 0) return { winner: "civils" };
  if (civils <= 1) return { winner: "impostors" };
  return null;
}

function finishGame(result) {
  game.result = result;
  const earned = game.players.map(p => {
    if (result.winner === "civils") return p.role === ROLE.CIVIL ? POINTS.civilWin : 0;
    if (result.winner === "impostors") {
      if (p.role === ROLE.UNDER) return POINTS.underWin;
      if (p.role === ROLE.WHITE) return POINTS.whiteWin;
      return 0;
    }
    if (result.winner === "white") return p.name === result.by ? POINTS.whiteGuess : 0;
    return 0;
  });
  game.earned = earned;
  game.players.forEach((p, i) => { scores[p.name] = (scores[p.name] || 0) + earned[i]; });
  store.set("scores", scores);
  go("end");
}

function eliminate(idx, how) {
  const p = game.players[idx];
  p.alive = false;
  game.eliminated = { idx, how, guess: null, guessed: null };
  game.log.push({ round: game.round, idx });
  game.vote = null;
  vibrate(80);
  go("eliminated");
}

function continueAfterElimination() {
  const r = checkWin();
  if (r) { finishGame(r); return; }
  game.round += 1;
  game.eliminated = null;
  go("round");
}

/* ---------------- Navigation ---------------- */
function go(screen) {
  ui.screen = screen;
  if (game) game.screen = screen;
  saveGame();
  render();
  window.scrollTo(0, 0);
}

function quitGame() {
  confirmSheet("Quitter la partie ?", "La partie en cours sera perdue.", "Quitter", () => {
    game = null; saveGame(); go("home");
  });
}

/* ---------------- Rendu ---------------- */
function render() {
  const fn = SCREENS[ui.screen] || SCREENS.home;
  $app.innerHTML = fn();
  bind();
}

function topbar(title, { back = null, quit = false, rules = true } = {}) {
  return `<header class="topbar">
    ${back ? `<button class="icon-btn" data-act="${back}" aria-label="Retour">←</button>` :
      quit ? `<button class="icon-btn" data-act="quit" aria-label="Quitter la partie">✕</button>` : `<span style="width:44px"></span>`}
    <span class="title">${esc(title)}</span>
    ${rules ? `<button class="icon-btn" data-act="rules" aria-label="Règles">?</button>` : `<span style="width:44px"></span>`}
  </header>`;
}

const SCREENS = {
  home() {
    const n = settings.players.length;
    const d = distribution();
    const valid = distValid(d, n);
    const poolSize = availablePairs().length;
    const cats = DATA ? DATA.categories : [];
    const selCats = settings.categories;
    const allCats = !selCats;
    const hasScores = Object.values(scores).some(v => v > 0);

    let distMsg = "";
    if (n < MIN_PLAYERS) distMsg = `Ajoutez au moins ${MIN_PLAYERS} joueurs.`;
    else if (!valid) {
      if (d.u + d.w < 1) distMsg = "Il faut au moins 1 Undercover ou 1 Mr. White.";
      else distMsg = "Les Civils doivent être strictement majoritaires (et au moins 2).";
    }

    const stepper = (key, val) => !settings.custom ? "" : `
      <div class="stepper">
        <button class="icon-btn" data-act="dist" data-key="${key}" data-delta="-1" ${val <= 0 ? "disabled" : ""} aria-label="Moins">−</button>
        <button class="icon-btn" data-act="dist" data-key="${key}" data-delta="1" aria-label="Plus">+</button>
      </div>`;

    return `
      <div class="hero">
        <img class="logo" src="icon.svg" alt="">
        <h1>Under<span>cover</span></h1>
        <p>Démasquez les imposteurs… sur un seul téléphone.</p>
      </div>

      <section class="card">
        <div class="spread" style="margin-bottom:12px">
          <h3>Joueurs <span class="muted small">(${n}/${MAX_PLAYERS})</span></h3>
          ${n ? `<button class="btn ghost small" data-act="clear-players">Vider</button>` : ""}
        </div>
        <ul class="players">
          ${settings.players.map((p, i) => `
            <li>
              <span class="num">${i + 1}</span>
              <span class="name">${esc(p)}</span>
              <button class="icon-btn" data-act="up" data-i="${i}" aria-label="Monter" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="icon-btn" data-act="remove" data-i="${i}" aria-label="Retirer ${esc(p)}">✕</button>
            </li>`).join("")}
        </ul>
        <form class="row" data-form="add">
          <input class="input" name="name" maxlength="20" autocomplete="off" autocapitalize="words"
            placeholder="${n >= MAX_PLAYERS ? "Maximum atteint" : "Nom du joueur"}" ${n >= MAX_PLAYERS ? "disabled" : ""} enterkeyhint="done">
          <button class="btn primary small" type="submit" ${n >= MAX_PLAYERS ? "disabled" : ""} style="min-height:48px">Ajouter</button>
        </form>
      </section>

      <section class="card">
        <div class="spread" style="margin-bottom:12px">
          <h3>Rôles</h3>
          <button class="chip ${settings.custom ? "on" : ""}" data-act="toggle-custom">${settings.custom ? "Personnalisé" : "Recommandé"}</button>
        </div>
        <div class="dist">
          <div class="role-box c-civil"><div class="count">${Math.max(0, d.c)}</div><div class="label">Civils</div></div>
          <div class="role-box c-under"><div class="count">${d.u}</div><div class="label">Undercover</div>${stepper("undercover", d.u)}</div>
          <div class="role-box c-white"><div class="count">${d.w}</div><div class="label">Mr. White</div>${stepper("white", d.w)}</div>
        </div>
        ${distMsg ? `<p class="small muted" style="margin-top:10px">${distMsg}</p>` : ""}
      </section>

      <details class="card">
        <summary>Mots <span class="muted small" style="margin-left:auto;margin-right:8px">${poolSize} paires</span></summary>
        <p class="small muted" style="margin-bottom:8px">Difficulté</p>
        <div class="chips" style="margin-bottom:14px">
          ${[1, 2, 3].map(lv => `<button class="chip ${settings.difficulties.includes(lv) ? "on" : ""}" data-act="diff" data-lv="${lv}">${["Facile", "Moyen", "Difficile"][lv - 1]}</button>`).join("")}
        </div>
        <div class="spread" style="margin-bottom:8px">
          <p class="small muted">Catégories</p>
          <button class="chip ${allCats ? "on" : ""}" data-act="cat-all">Toutes</button>
        </div>
        <div class="chips">
          ${cats.map(c => `<button class="chip ${!allCats && selCats.includes(c.id) ? "on" : ""}" data-act="cat" data-id="${c.id}">${esc(c.label)}</button>`).join("")}
        </div>
      </details>

      <div class="actions sticky">
        ${hasScores ? `<button class="btn ghost" data-act="scores">🏆 Classement</button>` : ""}
        <button class="btn primary big" data-act="start" ${valid && poolSize ? "" : "disabled"}>Lancer la partie</button>
      </div>`;
  },

  pass() {
    const p = game.players[game.revealIdx];
    const total = game.players.length;
    const dots = game.players.map((_, i) => `<span class="${i < game.revealIdx ? "done" : ""}"></span>`).join("");
    if (!game.revealShown) {
      return `
        ${topbar("Distribution des mots", { quit: true })}
        <div class="pass">
          <div class="progress">${dots}</div>
          <p class="muted">Passe le téléphone à</p>
          <div class="avatar">${initial(p.name)}</div>
          <div class="who">${esc(p.name)}</div>
          <p class="muted small">Les autres ne regardent pas l'écran 🙈</p>
        </div>
        <div class="actions">
          <button class="btn primary big" data-act="show-word">Voir mon mot</button>
        </div>`;
    }
    const secret = p.role === ROLE.WHITE
      ? `<div class="secret white">
           <div class="label">${esc(p.name)}, tu es</div>
           <div class="word">Mr. White 👻</div>
           <div class="hint">Tu n'as pas de mot. Écoute les indices, fonds-toi dans la masse… ou devine le mot des Civils !</div>
         </div>`
      : `<div class="secret">
           <div class="label">${esc(p.name)}, ton mot est</div>
           <div class="word">${esc(p.word)}</div>
           <div class="hint">Mémorise-le. Tu ne sais pas si tu es Civil ou Undercover…</div>
         </div>`;
    const last = game.revealIdx === total - 1;
    return `
      ${topbar("Distribution des mots", { quit: true })}
      <div class="pass">${secret}</div>
      <div class="actions">
        <button class="btn primary big" data-act="hide-word">${last ? "C'est bon, on commence !" : "C'est bon, cacher"}</button>
      </div>`;
  },

  round() {
    const order = speakingOrder();
    const out = game.players.filter(p => !p.alive);
    return `
      ${topbar(`Tour ${game.round}`, { quit: true })}
      <div class="phases">
        <div class="phase"><b>1. Indices</b>Un mot chacun, dans l'ordre</div>
        <div class="phase"><b>2. Débat</b>Qui a un mot différent ?</div>
        <div class="phase"><b>3. Vote</b>On élimine un joueur</div>
      </div>
      <section class="stack">
        <h3>Ordre de parole</h3>
        <ol class="order">
          ${order.map((i, k) => `
            <li class="${k === 0 ? "first" : ""}">
              <span class="pos">${k + 1}</span>
              <span class="name">${esc(game.players[i].name)}</span>
              ${k === 0 ? `<span class="small muted">commence</span>` : ""}
            </li>`).join("")}
        </ol>
      </section>
      ${out.length ? `
        <section class="stack">
          <h3 class="muted">Éliminés</h3>
          <ul class="order">
            ${out.map(p => `<li class="out"><span class="name">${esc(p.name)}</span><span class="badge ${ROLE_INFO[p.role].cls}">${ROLE_INFO[p.role].label}</span></li>`).join("")}
          </ul>
        </section>` : ""}
      <p class="small muted center">Interdit de dire son mot ou un mot de la même famille, et de répéter un indice déjà donné.</p>
      <div class="actions">
        <button class="btn ghost" data-act="peek">👁 Revoir mon mot</button>
        <button class="btn primary big" data-act="to-vote">Passer au vote</button>
      </div>`;
  },

  vote() {
    const v = game.vote;
    const max = Math.max(0, ...v.candidates.map(i => v.counts[i] || 0));
    const total = v.candidates.reduce((s, i) => s + (v.counts[i] || 0), 0);
    const voters = alivePlayers().length;
    return `
      ${topbar(v.tie ? "Vote de départage" : `Vote — tour ${game.round}`, { back: "back-round" })}
      ${v.tie
        ? `<div class="banner alert">Égalité ! ${v.candidates.map(i => `<b>${esc(game.players[i].name)}</b>`).join(", ")} redonnent chacun un indice, puis tout le monde revote entre eux.</div>`
        : `<p class="muted">Votez tous en même temps (en pointant du doigt), puis comptez les voix. Touchez un nom pour ajouter une voix.</p>`}
      <div class="vote-list">
        ${v.candidates.map(i => {
          const c = v.counts[i] || 0;
          return `<div class="vote-row ${c > 0 && c === max ? "lead" : ""}">
            <button class="tap" data-act="vote-add" data-i="${i}">${esc(game.players[i].name)}</button>
            <button class="icon-btn" data-act="vote-sub" data-i="${i}" ${c ? "" : "disabled"} aria-label="Retirer une voix">−</button>
            <span class="votes ${c ? "" : "zero"}">${c}</span>
            <button class="icon-btn" data-act="vote-add" data-i="${i}" aria-label="Ajouter une voix">+</button>
          </div>`;
        }).join("")}
      </div>
      <p class="small muted center">${total} voix sur ${voters} votants${total > voters ? " — trop de voix !" : ""}</p>
      <div class="actions">
        <button class="btn danger big" data-act="vote-validate" ${total ? "" : "disabled"}>Valider le vote</button>
      </div>`;
  },

  draw() {
    return `
      ${topbar("Tirage au sort", { rules: false })}
      <div class="pass">
        <div class="banner alert">L'égalité persiste : un joueur est tiré au sort.</div>
        <div class="spinner-name" id="spin">…</div>
      </div>`;
  },

  eliminated() {
    const e = game.eliminated;
    const p = game.players[e.idx];
    const info = ROLE_INFO[p.role];
    let extra = "";
    if (p.role === ROLE.WHITE && e.guessed === null) {
      extra = `
        <section class="card stack">
          <h3>Dernière chance, Mr. White !</h3>
          <p class="muted small">Devine le mot des Civils. Une seule tentative.</p>
          <form class="row" data-form="guess">
            <input class="input" name="guess" autocomplete="off" autocapitalize="off" placeholder="Le mot des Civils" required enterkeyhint="go">
            <button class="btn primary small" type="submit" style="min-height:48px">Valider</button>
          </form>
        </section>`;
    } else if (p.role === ROLE.WHITE) {
      extra = e.guessed
        ? `<div class="banner">Mr. White a proposé « ${esc(e.guess)} »… <b>C'est exact !</b></div>`
        : `<div class="banner alert">Mr. White a proposé « ${esc(e.guess)} »… raté ! La partie continue.</div>
           <button class="btn ghost small" data-act="guess-override" style="align-self:center">Le groupe accepte sa réponse</button>`;
    } else {
      extra = `<p class="center muted">Son mot était <b style="color:var(--text)">${esc(p.word)}</b></p>`;
    }
    const canContinue = p.role !== ROLE.WHITE || e.guessed !== null;
    const how = e.how === "draw" ? "tiré au sort" : "éliminé par le vote";
    return `
      ${topbar(`Tour ${game.round}`, { rules: false })}
      <div class="reveal-role ${info.cls}">
        <div class="muted small">${how}</div>
        <div class="who">${esc(p.name)}</div>
        <div class="muted">était</div>
        <div class="role">${info.emoji} ${info.label}</div>
      </div>
      ${extra}
      <div class="actions">
        ${canContinue ? `<button class="btn primary big" data-act="continue">${e.guessed ? "Voir les résultats" : "Continuer"}</button>` : ""}
      </div>`;
  },

  end() {
    const r = game.result;
    const banner = {
      civils: { emoji: "🎉", text: "Victoire des Civils !", cls: "c-civil", sub: "Tous les imposteurs ont été démasqués." },
      impostors: { emoji: "🕵️", text: "Victoire des Imposteurs !", cls: "c-under", sub: "Il ne reste plus qu'un Civil en jeu." },
      white: { emoji: "👻", text: "Mr. White gagne !", cls: "c-white", sub: `${esc(r.by || "")} a deviné le mot des Civils.` },
    }[r.winner];
    const cat = DATA && DATA.categories.find(c => c.id === game.category);
    const ranking = Object.entries(scores).filter(([name]) => settings.players.includes(name))
      .sort((a, b) => b[1] - a[1]);
    return `
      <div class="winner ${banner.cls}">
        <div class="emoji">${banner.emoji}</div>
        <h2>${banner.text}</h2>
        <p class="muted">${banner.sub}</p>
      </div>
      <div class="words">
        <div class="w c-civil"><span class="small muted">Mot des Civils</span><b>${esc(game.civilWord)}</b></div>
        <div class="w c-under"><span class="small muted">Mot des Undercovers</span><b>${esc(game.underWord)}</b></div>
      </div>
      ${cat ? `<p class="small muted center">${esc(cat.label)} · ${["Facile", "Moyen", "Difficile"][game.difficulty - 1]}</p>` : ""}
      <section class="card">
        <h3>Rôles & points</h3>
        <ul class="results">
          ${game.players.map((p, i) => `
            <li class="${p.alive ? "" : "out"}">
              <span class="name">${p.alive ? "" : "☠️ "}${esc(p.name)}</span>
              <span class="badge ${ROLE_INFO[p.role].cls}">${ROLE_INFO[p.role].label}</span>
              <span class="pts ${game.earned[i] ? "" : "none"}">+${game.earned[i]}</span>
            </li>`).join("")}
        </ul>
      </section>
      <section class="card">
        <div class="spread" style="margin-bottom:8px"><h3>🏆 Classement</h3>
          <button class="btn ghost small" data-act="reset-scores">Remettre à zéro</button></div>
        <ul class="results">
          ${ranking.map(([name, pts], k) => `<li><span class="num muted">${k + 1}.</span><span class="name">${esc(name)}</span><span class="pts">${pts}</span></li>`).join("")}
        </ul>
      </section>
      <div class="actions">
        <button class="btn ghost" data-act="home">Modifier les joueurs</button>
        <button class="btn primary big" data-act="replay">Rejouer</button>
      </div>`;
  },
};

/* ---------------- Interactions ---------------- */
function bind() {
  $app.querySelectorAll("[data-act]").forEach(el => el.addEventListener("click", onAction));
  const add = $app.querySelector('[data-form="add"]');
  if (add) add.addEventListener("submit", e => {
    e.preventDefault();
    const input = add.elements.name;
    const name = input.value.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (settings.players.some(p => p.toLowerCase() === name.toLowerCase())) { toast("Ce nom est déjà pris"); return; }
    if (settings.players.length >= MAX_PLAYERS) return;
    settings.players.push(name);
    clampCustom(); saveSettings(); render();
    const again = $app.querySelector('[data-form="add"] input');
    if (again && !again.disabled) again.focus();
  });
  const guess = $app.querySelector('[data-form="guess"]');
  if (guess) guess.addEventListener("submit", e => {
    e.preventDefault();
    const val = guess.elements.guess.value.trim();
    if (!val) return;
    const e2 = game.eliminated;
    e2.guess = val;
    e2.guessed = normalize(val) === normalize(game.civilWord);
    vibrate(e2.guessed ? [60, 60, 60] : 120);
    saveGame(); render();
  });
  if (ui.screen === "draw") runDraw();
}

function clampCustom() {
  const n = settings.players.length;
  if (!settings.custom) return;
  // Ramène une répartition personnalisée devenue invalide vers une répartition valide.
  while (settings.undercover + settings.white > 0 && (n - settings.undercover - settings.white) * 2 <= n) {
    if (settings.white > 0 && settings.white >= settings.undercover) settings.white--;
    else settings.undercover--;
  }
}

function onAction(e) {
  const el = e.currentTarget;
  const act = el.dataset.act;
  const i = el.dataset.i !== undefined ? Number(el.dataset.i) : null;

  switch (act) {
    case "rules": return showRules();
    case "quit": return quitGame();
    case "home": game = null; saveGame(); return go("home");

    /* Accueil */
    case "remove": settings.players.splice(i, 1); clampCustom(); saveSettings(); return render();
    case "up": [settings.players[i - 1], settings.players[i]] = [settings.players[i], settings.players[i - 1]]; saveSettings(); return render();
    case "clear-players":
      return confirmSheet("Vider la liste ?", "Tous les joueurs seront retirés.", "Vider", () => {
        settings.players = []; saveSettings(); render();
      });
    case "toggle-custom": {
      if (!settings.custom) {
        const [, u, w] = recommended(settings.players.length);
        settings.undercover = Math.max(u, 0); settings.white = Math.max(w, 0);
      }
      settings.custom = !settings.custom; saveSettings(); return render();
    }
    case "dist": {
      const key = el.dataset.key, delta = Number(el.dataset.delta);
      const n = settings.players.length;
      const next = Object.assign({}, settings, { [key]: Math.max(0, settings[key] + delta) });
      const d = { c: n - next.undercover - next.white, u: next.undercover, w: next.white };
      if (delta > 0 && (d.c < 2 || d.c * 2 <= n)) { toast("Les Civils doivent rester majoritaires"); return; }
      settings[key] = next[key]; saveSettings(); return render();
    }
    case "diff": {
      const lv = Number(el.dataset.lv);
      const set = new Set(settings.difficulties);
      if (set.has(lv)) { if (set.size === 1) { toast("Gardez au moins une difficulté"); return; } set.delete(lv); }
      else set.add(lv);
      settings.difficulties = [...set].sort(); saveSettings(); return render();
    }
    case "cat-all": settings.categories = null; saveSettings(); return renderKeepDetails();
    case "cat": {
      const id = el.dataset.id;
      let sel = settings.categories ? settings.categories.slice() : [];
      if (sel.includes(id)) sel = sel.filter(x => x !== id); else sel.push(id);
      settings.categories = sel.length ? sel : null;
      saveSettings(); return renderKeepDetails();
    }
    case "scores": return showScores();
    case "start": return startGame();

    /* Distribution */
    case "show-word": game.revealShown = true; saveGame(); return render();
    case "hide-word":
      game.revealShown = false;
      if (game.revealIdx < game.players.length - 1) { game.revealIdx++; return go("pass"); }
      return go("round");

    /* Tour */
    case "peek": return showPeek();
    case "to-vote": {
      const cands = speakingOrder();
      game.vote = { candidates: cands, counts: {}, tie: false };
      return go("vote");
    }
    case "back-round": game.vote = null; return go("round");
    case "vote-add": {
      game.vote.counts[i] = (game.vote.counts[i] || 0) + 1; vibrate(15); saveGame(); return render();
    }
    case "vote-sub": {
      game.vote.counts[i] = Math.max(0, (game.vote.counts[i] || 0) - 1); saveGame(); return render();
    }
    case "vote-validate": return validateVote();

    /* Élimination */
    case "guess-override": game.eliminated.guessed = true; saveGame(); return render();
    case "continue": {
      const e2 = game.eliminated;
      if (e2.guessed) return finishGame({ winner: "white", by: game.players[e2.idx].name });
      return continueAfterElimination();
    }

    /* Fin */
    case "replay": return startGame();
    case "reset-scores":
      return confirmSheet("Remettre les scores à zéro ?", "Le classement de tous les joueurs sera effacé.", "Remettre à zéro", () => {
        scores = {}; store.set("scores", scores); render();
      });
  }
}

function renderKeepDetails() {
  const open = $app.querySelector("details")?.open;
  render();
  const d = $app.querySelector("details");
  if (d && open) d.open = true;
}

function validateVote() {
  const v = game.vote;
  const max = Math.max(...v.candidates.map(i => v.counts[i] || 0));
  const top = v.candidates.filter(i => (v.counts[i] || 0) === max);
  if (top.length === 1) return eliminate(top[0], "vote");
  if (!v.tie) {
    // Égalité : les joueurs concernés redonnent un indice, nouveau vote entre eux.
    game.vote = { candidates: top, counts: {}, tie: true };
    vibrate([40, 40, 40]);
    return go("vote");
  }
  // L'égalité persiste : tirage au sort.
  game.drawCandidates = top;
  game.drawResult = top[rand(top.length)];
  return go("draw");
}

function runDraw() {
  const el = document.getElementById("spin");
  const cands = game.drawCandidates;
  let k = 0, delay = 60;
  const step = () => {
    el.textContent = game.players[cands[k % cands.length]].name;
    k++;
    delay *= 1.12;
    if (delay < 420) setTimeout(step, delay);
    else {
      el.textContent = game.players[game.drawResult].name;
      setTimeout(() => eliminate(game.drawResult, "draw"), 900);
    }
  };
  step();
}

/* ---------------- Fenêtres ---------------- */
function openSheet(html) {
  $modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  $modal.hidden = false;
  $modal.onclick = e => { if (e.target === $modal || e.target.closest("[data-close]")) closeSheet(); };
}
function closeSheet() { $modal.hidden = true; $modal.innerHTML = ""; }

function confirmSheet(title, text, okLabel, onOk) {
  openSheet(`
    <h2>${esc(title)}</h2>
    <p class="muted">${esc(text)}</p>
    <div class="actions" style="margin-top:20px">
      <button class="btn danger" data-ok>${esc(okLabel)}</button>
      <button class="btn ghost" data-close>Annuler</button>
    </div>`);
  $modal.querySelector("[data-ok]").onclick = () => { closeSheet(); onOk(); };
}

function showScores() {
  const ranking = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  openSheet(`
    <h2>🏆 Classement</h2>
    <ul class="results">
      ${ranking.map(([name, pts], k) => `<li><span class="muted">${k + 1}.</span><span class="name">${esc(name)}</span><span class="pts">${pts}</span></li>`).join("")}
    </ul>
    <div class="actions" style="margin-top:16px">
      <button class="btn ghost" data-reset>Remettre à zéro</button>
      <button class="btn primary" data-close>Fermer</button>
    </div>`);
  $modal.querySelector("[data-reset]").onclick = () => {
    scores = {}; store.set("scores", scores); closeSheet(); render();
  };
}

function showPeek() {
  const alive = speakingOrder();
  openSheet(`
    <h2>Revoir mon mot</h2>
    <p class="muted small" style="margin-bottom:12px">Choisis ton nom. Les autres ne regardent pas !</p>
    <div class="stack" id="peek-list">
      ${alive.map(i => `<button class="btn" data-peek="${i}">${esc(game.players[i].name)}</button>`).join("")}
    </div>
    <div class="actions" style="margin-top:12px"><button class="btn ghost" data-close>Fermer</button></div>`);
  $modal.querySelectorAll("[data-peek]").forEach(b => b.onclick = () => {
    const p = game.players[Number(b.dataset.peek)];
    $modal.querySelector(".sheet").innerHTML = `
      ${p.role === ROLE.WHITE
        ? `<div class="secret white"><div class="label">${esc(p.name)}, tu es</div><div class="word">Mr. White 👻</div><div class="hint">Tu n'as pas de mot.</div></div>`
        : `<div class="secret"><div class="label">${esc(p.name)}, ton mot est</div><div class="word">${esc(p.word)}</div></div>`}
      <div class="actions" style="margin-top:16px"><button class="btn primary" data-close>Cacher</button></div>`;
  });
}

function showRules() {
  openSheet(`
    <h2>Règles d'Undercover</h2>
    <p>Chaque joueur reçoit secrètement un mot. La majorité (les <b>Civils</b>) a le même mot ; les <b>Undercovers</b> ont un mot proche mais différent, et <b>Mr. White</b> n'a aucun mot. Personne ne connaît son rôle, sauf Mr. White.</p>

    <h3>Les rôles</h3>
    <ul>
      <li><b>Civil</b> : démasquer et éliminer tous les Undercovers et Mr. White.</li>
      <li><b>Undercover</b> : survivre sans être démasqué.</li>
      <li><b>Mr. White</b> : se fondre dans la masse, ou deviner le mot des Civils.</li>
    </ul>

    <h3>Un tour de jeu</h3>
    <ul>
      <li><b>Indices</b> : dans l'ordre de parole, chacun donne un seul mot en lien avec son mot secret. Interdit de dire son mot, un mot de la même famille, ou un indice déjà donné.</li>
      <li><b>Débat</b> : on discute librement pour repérer qui a un mot différent.</li>
      <li><b>Vote</b> : tout le monde vote en même temps ; le plus désigné est éliminé et révèle son rôle.</li>
      <li><b>Égalité</b> : les ex æquo redonnent un indice, puis on revote entre eux. Si l'égalité persiste, tirage au sort.</li>
    </ul>

    <h3>Mr. White éliminé</h3>
    <p>Il a une seule chance de deviner le mot des Civils. S'il trouve, il gagne seul immédiatement.</p>

    <h3>Fin de partie</h3>
    <ul>
      <li><b>Civils</b> : tous les Undercovers et Mr. White sont éliminés.</li>
      <li><b>Imposteurs</b> : il ne reste plus qu'un seul Civil en jeu.</li>
      <li><b>Mr. White</b> : il devine le mot des Civils.</li>
    </ul>

    <h3>Points</h3>
    <table>
      <tr><th>Résultat</th><th>Points</th></tr>
      <tr><td>Civil, victoire des Civils</td><td>2</td></tr>
      <tr><td>Undercover, victoire des Imposteurs</td><td>10</td></tr>
      <tr><td>Mr. White, victoire des Imposteurs</td><td>6</td></tr>
      <tr><td>Mr. White devine le mot</td><td>6</td></tr>
    </table>
    <p class="small muted">Les points vont à tout le camp gagnant, éliminés compris.</p>

    <div class="actions" style="margin-top:20px"><button class="btn primary" data-close>Compris !</button></div>`);
}

/* ---------------- Démarrage ---------------- */
async function init() {
  try {
    const res = await fetch("paires.json", { cache: "no-cache" });
    DATA = await res.json();
  } catch (err) {
    $app.innerHTML = `<p class="loading">Impossible de charger la banque de mots.<br><small>${esc(err.message)}</small></p>`;
    return;
  }
  if (game && game.result) ui.screen = "end";
  else if (game && game.screen) ui.screen = game.screen;
  if (ui.screen === "vote" && !game.vote) ui.screen = "round";
  render();
}

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
