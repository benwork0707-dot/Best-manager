// ===== UI rendering =====
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
let CUR_SECTION = 'home';
let SELECTED_LEAGUE = 'pl';
let SELECTED_CLUB = null;
let MARKET_LEAGUE = 'all';
let SQUAD_SORT = 'ovr';

function applyI18n() {
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.documentElement.lang = LANG;
  document.documentElement.dir = I18N[LANG].dir;
  $('#set-lang') && renderLangButtons();
}

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + id));
  window.scrollTo(0, 0);
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 1800);
}

function modal(title, bodyHTML, buttons = []) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHTML;
  const act = $('#modal-actions');
  act.innerHTML = '';
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (b.cls || '');
    btn.textContent = b.label;
    btn.onclick = () => { closeModal(); b.onClick && b.onClick(); };
    act.appendChild(btn);
  });
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); }

function crestHTML(club, big) {
  const c = club.color || '#666';
  const txt = club.short || club.name.slice(0, 3).toUpperCase();
  const dark = c === '#ffffff' || c === '#fde100' || c === '#fcd116' || c === '#87d8f7';
  const cls = `crest ${big ? 'lg' : ''}`;
  return club.logoUrl ? `<span class="${cls} crest-image" style="background:${c}"><img src="${club.logoUrl}" alt="${club.name} crest" loading="lazy" onerror="this.parentElement.classList.remove('crest-image');this.parentElement.textContent='${txt}'"></span>` : `<span class="${cls}" style="background:${c};color:${dark ? '#111' : '#fff'}">${txt}</span>`;
}

function ovrBg(v) {
  if (v >= 85) return '#22c55e';
  if (v >= 75) return '#84cc16';
  if (v >= 65) return '#f5b82e';
  return '#94a3b8';
}

function fmtDate(w) { return t('week') + ' ' + w; }

// ----- Intro -----
function renderIntro() {
  const has = hasSave();
  $('#btn-continue').style.display = has ? '' : 'none';
  $('#intro-langs').innerHTML = Object.keys(I18N).map(l =>
    `<button class="btn ghost" data-lang="${l}">${I18N[l].name}</button>`).join('');
}

// ----- New career -----
function renderNew() {
  $('#league-picker').innerHTML = LEAGUES.map(l => `
    <button class="pick ${l.id === SELECTED_LEAGUE ? 'sel' : ''}" data-league="${l.id}">
      <span class="crest" style="background:${l.color};color:#fff">${l.country}</span>
      <span><b>${l.name[LANG] || l.name.en}</b><div class="sub">${l.clubs.length} ${t('chooseClub')}</div></span>
    </button>`).join('');
  const leagueDef = LEAGUES.find(l => l.id === SELECTED_LEAGUE);
  // Build club list from static data (no state yet)
  $('#club-picker').innerHTML = leagueDef.clubs.map((c, i) => {
    const sel = SELECTED_CLUB === i ? 'sel' : '';
    const logo = c[4] ? `<span class="crest crest-image" style="background:${c[2]}"><img src="https://a.espncdn.com/i/teamlogos/soccer/500/${c[4]}.png" alt="${c[0]} crest" loading="lazy" onerror="this.parentElement.classList.remove('crest-image');this.parentElement.textContent='${c[1]}'"></span>` : `<span class="crest" style="background:${c[2]}">${c[1]}</span>`;
    return `<button class="pick ${sel}" data-club="${i}">
      ${logo}
      <span><b>${c[0]}</b><div class="sub">${t('overall')} ${c[3]}</div></span></button>`;
  }).join('');
}

// ----- Settings -----
function renderLangButtons() {
  $('#set-lang').innerHTML = Object.keys(I18N).map(l =>
    `<button data-lang="${l}" class="${LANG === l ? 'on' : ''}">${I18N[l].name}</button>`).join('');
  const q = localStorage.getItem('mb_quality') || 'high';
  const s = localStorage.getItem('mb_sound') || 'on';
  const th = localStorage.getItem('mb_theme') || 'dark';
  $$('#set-quality button').forEach(b => b.classList.toggle('on', b.dataset.v === q));
  $$('#set-sound button').forEach(b => b.classList.toggle('on', b.dataset.v === s));
  $$('#set-theme button').forEach(b => b.classList.toggle('on', b.dataset.v === th));
}
function renderSettings() { applyI18n(); renderLangButtons(); }

// ----- Career HUD -----
function renderHUD() {
  const uc = userClub();
  $('#hud-crest').outerHTML = crestHTML(uc).replace('<span', '<span id="hud-crest"');
  $('#hud-club').textContent = uc.name;
  $('#hud-season').textContent = G.season;
  $('#hud-week').textContent = G.week + ' / ' + leagueWeeks();
  $('#hud-budget').textContent = fmtMoney(uc.budget);
  $$('#sidenav button').forEach(b => b.classList.toggle('active', b.dataset.sec === CUR_SECTION));
}

function renderGame() {
  renderHUD();
  const sec = $('#section');
  const map = { home: secHome, squad: secSquad, tactics: secTactics, training: secTraining, transfers: secTransfers,
    tables: secTables, competitions: secCompetitions, news: secNews, press: secPress, facilities: secFacilities, menu: secMenu };
  sec.innerHTML = (map[CUR_SECTION] || secHome)();
  bindSection();
}

// ----- Sections -----
function secHome() {
  const uc = userClub();
  const table = leagueTable(uc.league);
  const pos = table.findIndex(r => r.club.id === uc.id) + 1;
  const me = table.find(r => r.club.id === uc.id);
  const nf = nextUserFixture();
  let nextHTML = `<p class="muted">—</p>`;
  if (nf) {
    const h = clubById(nf.home), a = clubById(nf.away);
    nextHTML = `<div class="next-match"><div class="team">${crestHTML(h)} ${h.name}</div>
      <div class="vs">VS</div><div class="team">${crestHTML(a)} ${a.name}</div>
      <div class="muted">${fmtDate(nf.week)} · ${nf.type === 'cup' ? COMPETITIONS.champions.name[LANG] : leagueName(nf.league)}</div></div>`;
  }
  const tasks = G.tasks.map(x => `<div class="news-item">${x.done ? '✅' : '⬜'} ${x.label[LANG] || x.label.en}</div>`).join('');
  return `
    <div class="tiles">
      <div class="stat-tile"><small>${t('position')}</small><b>${pos}</b></div>
      <div class="stat-tile"><small>${t('points')}</small><b>${me.pts}</b></div>
      <div class="stat-tile"><small>${t('reputation')}</small><b>${uc.reputation}</b></div>
      <div class="stat-tile"><small>${t('fanMood') || 'Fans'}</small><b>${uc.fanMood}%</b></div>
    </div>
    <div class="cols">
      <div class="panel"><h3>${t('nextMatch')}</h3>${nextHTML}
        <div class="row-end"><button class="btn primary" data-act="match">${t('playMatch')}</button></div></div>
      <div class="panel"><h3>${t('tasks')}</h3>${tasks}</div>
      <div class="panel"><h3>${t('news')}</h3>${G.news.slice(0, 5).map(n => `<div class="news-item"><small>${fmtDate(n.week)}</small>${n.text}</div>`).join('') || '—'}</div>
    </div>`;
}

function secSquad() {
  const uc = userClub();
  const xi = effectiveXI(uc).map(p => p.id);
  const players = uc.squad.slice().sort((a, b) => SQUAD_SORT === 'age' ? a.age - b.age : b.ovr - a.ovr);
  const rows = players.map(p => `
    <div class="prow">
      <img class="player-face" src="${p.faceUrl || 'https://randomuser.me/api/portraits/men/12.jpg'}" alt="${p.name}" loading="lazy" onerror="this.src='https://randomuser.me/api/portraits/men/12.jpg'">
      <div class="ovr" style="background:${ovrBg(p.ovr)}">${p.ovr}</div>
      <div><div class="name">${p.name}${p.injuredWeeks ? ' 🩹' : ''}</div><div class="meta">${p.pos} · ${t('age')} ${p.age}</div></div>
      <div class="meta hide-s">${fmtMoney(p.value)}</div>
      <div class="bar"><i style="width:${p.fitness}%"></i></div>
      <div class="meta hide-s">${p.stats.apps} ${t('played')}</div>
      <div class="act"><button data-xi="${p.id}" class="btn ${xi.includes(p.id) ? 'primary' : ''}">${t('lineup').split(' ')[0]}</button></div>
    </div>`).join('');
  return `
    <div class="tabs"><button class="btn ${SQUAD_SORT === 'ovr' ? 'primary' : ''}" data-sort="ovr">${t('overall')}</button>
    <button class="btn ${SQUAD_SORT === 'age' ? 'primary' : ''}" data-sort="age">${t('age')}</button></div>
    <div class="list">${rows}</div>`;
}

function formationSlots(f) {
  // [x%, y%] for GK + lines
  const f4 = { '4-3-3': [[50,88],[18,70],[38,72],[62,72],[82,70],[30,48],[50,44],[70,48],[18,20],[50,14],[82,20]],
    '4-4-2': [[50,88],[18,70],[38,72],[62,72],[82,70],[18,46],[38,50],[62,50],[82,46],[38,18],[62,18]],
    '3-5-2': [[50,88],[28,72],[50,74],[72,72],[12,46],[34,50],[50,44],[66,50],[88,46],[38,18],[62,18]],
    '4-2-3-1': [[50,88],[18,70],[38,72],[62,72],[82,70],[38,52],[62,52],[22,32],[50,30],[78,32],[50,12]] };
  return f4[f] || f4['4-3-3'];
}

function secTactics() {
  const uc = userClub();
  const forms = ['4-3-3', '4-4-2', '3-5-2', '4-2-3-1'];
  const xi = effectiveXI(uc);
  const slots = formationSlots(uc.formation);
  const placed = xi.slice(0, 11).map((p, i) => {
    const [x, y] = slots[i] || [50, 50];
    return `<div class="slot" style="left:${x}%;top:${y}%"><div class="face-wrap"><img class="tactic-face" src="${p.faceUrl || 'https://randomuser.me/api/portraits/men/12.jpg'}" alt="${p.name}" loading="lazy" onerror="this.src='https://randomuser.me/api/portraits/men/12.jpg'"><b>${p.ovr}</b></div><span>${p.name.split(' ')[1] || p.name}</span><small>${p.pos}</small></div>`;
  }).join('');
  const bench = uc.squad.filter(p => !xi.includes(p)).sort((a, b) => b.ovr - a.ovr).slice(0, 7);
  return `
    <div class="cols">
      <div class="panel"><h3>${t('formation')}</h3>
        <div class="seg">${forms.map(f => `<button data-form="${f}" class="${uc.formation === f ? 'on' : ''}">${f}</button>`).join('')}</div>
        <div class="pitch-mini" style="margin-top:12px">${placed}</div></div>
      <div class="panel"><h3>${t('subs')}</h3>
        <div class="list">${bench.map(p => `<div class="prow" style="grid-template-columns:46px 1fr 60px"><div class="ovr" style="background:${ovrBg(p.ovr)}">${p.ovr}</div><div class="name">${p.name}</div><div class="meta">${p.pos}</div></div>`).join('')}</div>
        <div class="row-end"><button class="btn" data-act="autoxi">${t('reset')}</button></div></div>
    </div>`;
}

function secTraining() {
  const foci = ['attack', 'defense', 'physical', 'technical'];
  const uc = userClub();
  const cp = G.coachProfile || { level: 1, xp: 0, tactics: 55, development: 55, leadership: 55, points: 0 };
  const attr = (label, value) => `<div class="coach-attr"><span>${label}</span><b>${value}</b><i><em style="width:${value}%"></em></i></div>`;
  return `<div class="cols"><div class="panel"><h3>${t('trainFocus')}</h3>
    <div class="seg">${foci.map(f => `<button data-focus="${f}" class="${G.trainingFocus === f ? 'on' : ''}">${t(f)}</button>`).join('')}</div>
    <p class="muted" style="margin-top:12px">${t('fitness')}: ${Math.round(uc.squad.reduce((a, p) => a + p.fitness, 0) / uc.squad.length)}%</p>
    <p class="muted">${LANG === 'ar' ? 'تطوير اللاعبين يتأثر بمستوى المدرب ومرافق التدريب.' : LANG === 'fr' ? 'Le développement dépend du coach et des installations.' : 'Player development depends on manager skill and training facilities.'}</p></div>
    <div class="panel coach-card"><h3>🎓 ${LANG === 'ar' ? 'ملف المدرب' : LANG === 'fr' ? 'Profil entraîneur' : 'Manager profile'}</h3><div class="coach-level"><strong>LV ${cp.level}</strong><span>${G.coach}</span></div><div class="xp-track"><i style="width:${Math.min(100, cp.xp / Math.max(1, cp.level * 100) * 100)}%"></i></div><small>${cp.xp} / ${cp.level * 100} XP · ${LANG === 'ar' ? 'نقاط تطوير' : LANG === 'fr' ? 'Points' : 'Skill points'}: ${cp.points}</small>${attr(LANG === 'ar' ? 'التكتيك' : 'Tactics', cp.tactics)}${attr(LANG === 'ar' ? 'تطوير اللاعبين' : 'Development', cp.development)}${attr(LANG === 'ar' ? 'القيادة' : 'Leadership', cp.leadership)}</div></div>`;
}

function secTransfers() {
  const leagueSel = `<select id="mkt-league"><option value="all">${t('all')}</option>
    ${LEAGUES.map(l => `<option value="${l.id}" ${MARKET_LEAGUE === l.id ? 'selected' : ''}>${l.name[LANG] || l.name.en}</option>`).join('')}</select>`;
  let list = playerMarketList();
  if (MARKET_LEAGUE !== 'all') list = list.filter(x => x.club.league === MARKET_LEAGUE);
  const rows = list.slice(0, 40).map(({ p, club }) => `
    <div class="prow">
      <img class="player-face" src="${p.faceUrl || 'https://randomuser.me/api/portraits/men/12.jpg'}" alt="${p.name}" loading="lazy" onerror="this.src='https://randomuser.me/api/portraits/men/12.jpg'">
      <div class="ovr" style="background:${ovrBg(p.ovr)}">${p.ovr}</div>
      <div><div class="name">${p.name}</div><div class="meta">${p.pos} · ${club.name}</div></div>
      <div class="meta hide-s">${t('age')} ${p.age}</div>
      <div class="meta">${fmtMoney(Math.round(p.value * 1.1))}</div>
      <div class="meta hide-s">${t('wage')}: ${fmtMoney(p.wage)}</div>
      <div class="act"><button class="btn primary" data-buy="${club.id}|${p.id}">${t('buy')}</button></div>
    </div>`).join('');
  const mine = userClub().squad.slice().sort((a, b) => b.ovr - a.ovr).map(p => `
    <div class="prow">
      <img class="player-face" src="${p.faceUrl || 'https://randomuser.me/api/portraits/men/12.jpg'}" alt="${p.name}" loading="lazy" onerror="this.src='https://randomuser.me/api/portraits/men/12.jpg'">
      <div class="ovr" style="background:${ovrBg(p.ovr)}">${p.ovr}</div>
      <div><div class="name">${p.name}</div><div class="meta">${p.pos}</div></div>
      <div class="meta hide-s">${t('age')} ${p.age}</div>
      <div class="meta">${fmtMoney(Math.round(p.value * 0.9))}</div>
      <div class="meta hide-s"></div>
      <div class="act"><button class="btn" data-sell="${p.id}">${t('sell')}</button></div>
    </div>`).join('');
  const latest = G.news.filter(n => /←|✓|signed|sold|Recruté|Vendu|تم|Transf/i.test(n.text) || n.text.includes('←')).slice(0, 8)
    .map(n => `<div class="news-item"><small>${fmtDate(n.week)}</small>${n.text}</div>`).join('') || '—';
  return `
    <div class="tiles"><div class="stat-tile"><small>${t('budget')}</small><b>${fmtMoney(userClub().budget)}</b></div></div>
    <div class="tabs">${leagueSel}</div>
    <div class="cols">
      <div class="panel"><h3>${t('transfers')}</h3><div class="list">${rows}</div></div>
      <div class="panel"><h3>${t('squad')}</h3><div class="list">${mine}</div></div>
    </div>
    <div class="panel"><h3>${t('news')}</h3>${latest}</div>`;
}

function secTables() {
  const sel = `<div class="seg">${LEAGUES.map(l => `<button data-tab="${l.id}" class="${SELECTED_LEAGUE === l.id ? 'on' : ''}">${l.name[LANG] || l.name.en}</button>`).join('')}</div>`;
  const rows = leagueTable(SELECTED_LEAGUE).map((r, i) => `
    <tr class="${r.club.id === G.userClubId ? 'me' : ''} ${i < 4 ? 'zone-top' : ''}">
      <td class="club">${i + 1}. ${crestHTML(r.club)} ${r.club.name}</td>
      <td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gf - r.ga}</td><td><b>${r.pts}</b></td>
    </tr>`).join('');
  return `<div class="tabs">${sel}</div><div class="panel table-wrap"><table>
    <tr><th>${t('position')}</th><th>${t('played')}</th><th>${t('won')}</th><th>${t('drawn')}</th><th>${t('lost')}</th><th>${t('gf')}</th><th>${t('ga')}</th><th>${t('gd')}</th><th>${t('points')}</th></tr>
    ${rows}</table></div>`;
}

function secCompetitions() {
  const cupFx = G.fixtures.filter(f => f.type === 'cup' && (f.home === G.userClubId || f.away === G.userClubId));
  const rows = cupFx.map(f => {
    const h = clubById(f.home), a = clubById(f.away);
    const score = f.played ? `${f.hg} - ${f.ag}` : '—';
    return `<div class="news-item">${t('cupRound')} ${f.week}: ${h.name} ${score} ${a.name}</div>`;
  }).join('') || '—';
  const comps = Object.values(COMPETITIONS).map(c => `<div class="news-item"><b>${c.name[LANG] || c.name.en}</b> <span class="muted">${c.type}</span></div>`).join('');
  const hist = G.history.map(h => `<div class="news-item">${h.season}: ${h.champion} · #${h.userPos}</div>`).join('') || '—';
  return `<div class="cols">
    <div class="panel"><h3>${t('competitions')}</h3>${comps}</div>
    <div class="panel"><h3>${COMPETITIONS.champions.name[LANG]}</h3>${rows}</div>
    <div class="panel"><h3>${t('trophies') || 'Trophies'}</h3>${G.trophies.map(x => `<div class="news-item">🏆 ${x}</div>`).join('') || '—'}
      <h3 style="margin-top:12px">${t('season')}</h3>${hist}</div></div>`;
}

function secNews() {
  return `<div class="panel">${G.news.map(n => `<div class="news-item"><small>${t('season')} ${n.season} · ${fmtDate(n.week)}</small>${n.text}</div>`).join('') || '—'}</div>`;
}

const PRESS_Q = [
  { q: { ar: 'هل تعتقد أن فريقك مرشح حقيقي للقب؟', fr: 'Pensez-vous être un vrai candidat au titre ?', en: 'Do you think your team is a genuine title contender?' },
    a: [
      { t: { ar: 'نحن نركز على مباراة بمباراة', fr: 'On joue match après match', en: 'We take it one game at a time' }, m: 2, r: 0 },
      { t: { ar: 'نعم، نحن الأفضل هذا الموسم', fr: 'Oui, nous sommes les meilleurs', en: 'Yes, we are the best this season' }, m: 4, r: -1 },
      { t: { ar: 'لا أتوقع شيئا الآن', fr: 'Je ne prévois rien pour l’instant', en: 'Not yet, no predictions' }, m: -1, r: 1 } ] },
  { q: { ar: 'ما رأيك في أداء اللاعبين الشباب؟', fr: 'Que pensez-vous des jeunes joueurs ?', en: 'What do you think of the young players?' },
    a: [
      { t: { ar: 'موهوبون جدا ويتطورون', fr: 'Très talentueux, ils progressent', en: 'Very talented and improving' }, m: 3, r: 1 },
      { t: { ar: 'يحتاجون وقتا أطول', fr: 'Ils ont besoin de temps', en: 'They need more time' }, m: -2, r: 0 },
      { t: { ar: 'لا تعليق', fr: 'Pas de commentaire', en: 'No comment' }, m: 0, r: -1 } ] },
];

function secPress() {
  const uc = userClub();
  const q = PRESS_Q[(G.week + G.season) % PRESS_Q.length];
  const answered = G.lastPress === G.week + '-' + G.season;
  if (answered) return `<div class="panel"><p class="muted">✔ ${t('answer')}</p></div>`;
  return `<div class="q-card"><h3>${t('interviewQ')}</h3><p><b>${q.q[LANG] || q.q.en}</b></p>
    <div class="opts">${q.a.map((o, i) => `<button class="btn" data-answer="${i}" data-qid="${PRESS_Q.indexOf(q)}">${o.t[LANG] || o.t.en}</button>`).join('')}</div></div>`;
}

function secFacilities() {
  const uc = userClub();
  const items = [['stadium', 'Stadium', 'ملعب', 'Stade'], ['training', 'Training', 'التدريب', 'Entraînement'], ['youth', 'Youth', 'الأكاديمية', 'Centre de formation']];
  return `<div class="cols">${items.map(([k, en, ar, fr]) => {
    const lvl = uc.facilities[k];
    const cost = lvl * 2_000_000;
    const label = LANG === 'ar' ? ar : LANG === 'fr' ? fr : en;
    return `<div class="panel"><h3>${label}</h3><div class="stat-tile"><small>${t('value')}</small><b>${'★'.repeat(lvl)}${'☆'.repeat(5 - lvl)}</b></div>
      <div class="row-end"><button class="btn gold" data-upgrade="${k}" ${lvl >= 5 ? 'disabled' : ''}>⬆ ${fmtMoney(cost)}</button></div></div>`;
  }).join('')}</div>`;
}

function secMenu() {
  return `<div class="panel"><button class="btn" data-act="exit">${t('back')}</button></div>`;
}

// ----- Section event binding -----
function bindSection() {
  const sec = $('#section');
  sec.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const uc = userClub();
    if (b.dataset.xi) { toggleXI(b.dataset.xi); return; }
    if (b.dataset.sort) { SQUAD_SORT = b.dataset.sort; renderGame(); return; }
    if (b.dataset.form) { uc.formation = b.dataset.form; saveGame(); renderGame(); return; }
    if (b.dataset.act === 'autoxi') { uc.lineup = null; saveGame(); renderGame(); return; }
    if (b.dataset.act === 'match') { onPlayMatchRequested(); return; }
    if (b.dataset.act === 'exit') { saveGame(); location.reload(); return; }
    if (b.dataset.focus) { G.trainingFocus = b.dataset.focus; saveGame(); renderGame(); toast(t(b.dataset.focus)); return; }
    if (b.dataset.buy) { const [cid, pid] = b.dataset.buy.split('|'); const r = buyPlayer(cid, pid); toast(r.msg); renderGame(); return; }
    if (b.dataset.sell) { const r = sellPlayer(b.dataset.sell); toast(r.msg); renderGame(); return; }
    if (b.dataset.tab) { SELECTED_LEAGUE = b.dataset.tab; renderGame(); return; }
    if (b.dataset.answer !== undefined) { answerPress(+b.dataset.qid, +b.dataset.answer); return; }
    if (b.dataset.upgrade) { upgradeFacility(b.dataset.upgrade); return; }
  };
  const ml = $('#mkt-league');
  if (ml) ml.onchange = () => { MARKET_LEAGUE = ml.value; renderGame(); };
}

function toggleXI(pid) {
  const uc = userClub();
  let lineup = (uc.lineup && uc.lineup.length === 11) ? uc.lineup.slice() : effectiveXI(uc).map(p => p.id);
  if (lineup.includes(pid)) lineup = lineup.filter(x => x !== pid);
  else if (lineup.length < 11) lineup.push(pid);
  else { toast(t('lineup') + ' 11'); return; }
  uc.lineup = lineup.length === 11 ? lineup : null;
  saveGame(); renderGame();
}

function answerPress(qid, idx) {
  const opt = PRESS_Q[qid].a[idx];
  const uc = userClub();
  uc.squad.forEach(p => p.morale = clamp(p.morale + opt.m, 10, 100));
  uc.reputation = clamp(uc.reputation + opt.r, 1, 99);
  G.lastPress = G.week + '-' + G.season;
  saveGame(); toast(t('answer') + ' ✓'); renderGame();
}

function upgradeFacility(k) {
  const uc = userClub();
  const cost = uc.facilities[k] * 2_000_000;
  if (uc.budget < cost) { toast(t('notEnough')); return; }
  uc.budget -= cost; uc.facilities[k]++;
  pushNews(k + ' ↑ ' + uc.facilities[k]);
  saveGame(); renderGame();
}
