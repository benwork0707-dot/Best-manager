// ===== Game engine: state, fixtures, tables, match simulation, transfers =====
const SAVE_KEY = 'mb_career_v1';
let G = null; // current game state

function newCareer(coachName, clubId) {
  const clubs = buildClubs();
  const fixtures = buildFixtures(clubs);
  G = {
    coach: coachName || 'Coach',
    coachProfile: { level: 1, xp: 0, tactics: 55, development: 55, leadership: 55, points: 0 },
    season: 2026,
    week: 1,
    userClubId: clubId,
    clubs,
    fixtures,
    news: [],
    history: [],
    tasks: [],
    cupRun: { champions: 'in', nationalCup: 'in' },
    trophies: [],
    trainingFocus: 'technical',
    lastResult: null,
    pendingQuestion: null,
    matchLog: [],
  };
  makeTasks();
  pushNews(t('kickoff') + ': ' + clubById(clubId).name);
  saveGame();
  return G;
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* storage full */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    G = JSON.parse(raw);
    // Migrate existing careers so the upgrade also applies to a save already in use.
    if (!G.coachProfile) G.coachProfile = { level: 1, xp: 0, tactics: 55, development: 55, leadership: 55, points: 0 };
    (G.clubs || []).forEach((club, ci) => (club.squad || []).forEach((player, pi) => {
      if (!player.faceUrl) {
        let hash = 0; const key = String(player.id || player.name || (ci + '-' + pi));
        for (let j = 0; j < key.length; j++) hash = (hash * 31 + key.charCodeAt(j)) >>> 0;
        player.faceUrl = 'https://randomuser.me/api/portraits/men/' + (hash % 99) + '.jpg';
      }
      if (!player.attrs) player.attrs = { attack: 55, defense: 55, physical: 55, technical: 55 };
      if (!player.stats) player.stats = { apps: 0, goals: 0, assists: 0 };
    }));
    saveGame();
    return G;
  } catch (e) { return null; }
}
function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
function clearSave() { localStorage.removeItem(SAVE_KEY); G = null; }

function clubById(id) { return G.clubs.find(c => c.id === id); }
function userClub() { return clubById(G.userClubId); }
function leagueOf(club) { return LEAGUES.find(l => l.id === club.league); }
function leagueClubs(lid) { return G.clubs.filter(c => c.league === lid); }
function leagueName(lid) { return LEAGUES.find(l => l.id === lid).name[LANG] || LEAGUES.find(l => l.id === lid).name.en; }

// ----- Fixtures: double round robin per league; cups every 4 weeks for user -----
function buildFixtures(clubs) {
  const fixtures = [];
  for (const lg of LEAGUES) {
    const ids = clubs.filter(c => c.league === lg.id).map(c => c.id);
    const n = ids.length;
    const rounds = [];
    const arr = ids.slice();
    for (let r = 0; r < n - 1; r++) {
      const round = [];
      for (let i = 0; i < n / 2; i++) round.push([arr[i], arr[n - 1 - i]]);
      rounds.push(round);
      arr.splice(1, 0, arr.pop());
    }
    // first half then reversed second half
    const all = rounds.concat(rounds.map(rd => rd.map(([a, b]) => [b, a])));
    all.forEach((round, wi) => round.forEach(([h, a]) => fixtures.push({ week: wi + 1, type: 'league', league: lg.id, home: h, away: a, played: false, hg: 0, ag: 0 })));
  }
  // Cup fixtures for the user's club are created at runtime (see addCupFixtures)
  return fixtures;
}

function leagueWeeks() {
  return Math.max(...G.fixtures.filter(f => f.type === 'league').map(f => f.week));
}

// Each 4th week, user club gets a cup match against a random foreign club
function addCupFixtures() {
  const uc = userClub();
  const other = G.clubs.filter(c => c.league !== uc.league);
  for (let w = 4; w <= leagueWeeks(); w += 4) {
    if (G.fixtures.some(f => f.type === 'cup' && f.week === w && (f.home === uc.id || f.away === uc.id))) continue;
    const opp = pick(other);
    G.fixtures.push({ week: w, type: 'cup', comp: 'champions', league: null, home: uc.id, away: opp.id, played: false, hg: 0, ag: 0 });
  }
}

function nextUserFixture() {
  const uid = G.userClubId;
  return G.fixtures.filter(f => !f.played && f.week >= G.week && (f.home === uid || f.away === uid))
    .sort((a, b) => a.week - b.week)[0] || null;
}

// ----- Team strength -----
function effectiveXI(club) {
  if (club.lineup && club.lineup.length === 11) {
    return club.lineup.map(id => club.squad.find(p => p.id === id)).filter(Boolean);
  }
  return club.squad.slice().filter(p => p.injuredWeeks === 0).sort((a, b) => b.ovr - a.ovr).slice(0, 11);
}

function teamStrength(club) {
  const xi = effectiveXI(club);
  if (!xi.length) return 40;
  let s = 0;
  for (const p of xi) {
    const fitF = 0.85 + 0.15 * (p.fitness / 100);
    const morF = 0.95 + 0.05 * (p.morale / 100);
    s += p.ovr * fitF * morF;
  }
  s /= xi.length;
  // Manager tactical ability gives a small, earned advantage without overpowering player quality.
  if (G && club.id === G.userClubId && G.coachProfile) s += (G.coachProfile.tactics - 50) * 0.035;
  // home advantage & facilities handled by caller
  return s;
}

// Simulate one match returns {hg, ag, events}
function simulateMatch(home, away, opts = {}) {
  const hs = teamStrength(home) + (opts.homeBonus || 2) + home.facilities.stadium * 0.3;
  const as = teamStrength(away);
  const diff = hs - as;
  const baseH = 1.35 * Math.exp(diff / 25);
  const baseA = 1.35 * Math.exp(-diff / 25);
  const hg = poisson(baseH);
  const ag = poisson(baseA);
  const events = [];
  const minutes = new Set();
  const pickMin = () => { let m; do { m = rndInt(1, 90); } while (minutes.has(m)); minutes.add(m); return m; };
  for (let i = 0; i < hg; i++) events.push({ min: pickMin(), type: 'goal', side: 'home', club: home.id, scorer: scorerOf(home) });
  for (let i = 0; i < ag; i++) events.push({ min: pickMin(), type: 'goal', side: 'away', club: away.id, scorer: scorerOf(away) });
  const cards = rndInt(1, 5);
  for (let i = 0; i < cards; i++) {
    const side = rnd() < 0.5 ? 'home' : 'away';
    events.push({ min: pickMin(), type: 'yellow', side, club: side === 'home' ? home.id : away.id, scorer: '' });
  }
  events.sort((a, b) => a.min - b.min);
  const possession = clamp(Math.round(50 + diff * 1.1 + rndInt(-9, 9)), 25, 75);
  const homeShots = Math.max(hg, rndInt(5, 17) + Math.round(diff / 8));
  const awayShots = Math.max(ag, rndInt(5, 17) - Math.round(diff / 8));
  return { hg, ag, events, stats: { possession, homeShots, awayShots, homeOnTarget: Math.min(homeShots, hg + rndInt(1, 5)), awayOnTarget: Math.min(awayShots, ag + rndInt(1, 5)), homeCorners: rndInt(1, 10), awayCorners: rndInt(1, 10) } };
}

function scorerOf(club) {
  const xi = effectiveXI(club);
  const w = xi.map(p => (p.pos === 'ST' ? 5 : p.pos === 'LW' || p.pos === 'RW' ? 3 : p.pos === 'CAM' ? 2 : p.pos === 'GK' ? 0 : 1));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  let r = rnd() * total;
  for (let i = 0; i < xi.length; i++) { r -= w[i]; if (r <= 0) { xi[i].stats.goals++; return xi[i].name; } }
  return xi[0] ? xi[0].name : '';
}

function poisson(lambda) {
  let L = Math.exp(-lambda), k = 0, p = 1;
  do { k++; p *= rnd(); } while (p > L);
  return Math.min(k - 1, 8);
}

// Apply a finished match result to fixture and tables
function recordResult(fx, res) {
  fx.played = true; fx.hg = res.hg; fx.ag = res.ag; fx.events = res.events;
  const h = clubById(fx.home), a = clubById(fx.away);
  for (const c of [h, a]) {
    c.squad.forEach(p => {
      if (p.injuredWeeks === 0) p.stats.apps++;
      p.fitness = Math.max(55, p.fitness - rndInt(6, 14));
    });
  }
  // random injuries
  for (const c of [h, a]) {
    if (rnd() < 0.12) { const p = pick(c.squad); p.injuredWeeks = rndInt(1, 4); }
  }
  // form & morale tweak
  const outcome = res.hg > res.ag ? 'H' : res.hg < res.ag ? 'A' : 'D';
  const bump = (club, win) => club.squad.forEach(p => { p.morale = clamp(p.morale + (win ? 4 : -3), 10, 100); p.form = clamp(p.form + (win ? 5 : -4), 10, 100); });
  bump(h, outcome === 'H'); bump(a, outcome === 'A');
  // table is derived from fixtures, nothing to store here
  return outcome;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Compute league table
function leagueTable(lid) {
  const clubs = leagueClubs(lid);
  const rows = {};
  clubs.forEach(c => rows[c.id] = { club: c, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  G.fixtures.filter(f => f.type === 'league' && f.league === lid && f.played).forEach(f => {
    const h = rows[f.home], a = rows[f.away];
    h.p++; a.p++; h.gf += f.hg; h.ga += f.ag; a.gf += f.ag; a.ga += f.hg;
    if (f.hg > f.ag) { h.w++; h.pts += 3; a.l++; }
    else if (f.hg < f.ag) { a.w++; a.pts += 3; h.l++; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  });
  return Object.values(rows).sort((x, y) => (y.pts - x.pts) || ((y.gf - y.ga) - (x.gf - x.ga)) || (y.gf - x.gf));
}

// ----- Week progression -----
function playWeek(userMatchOverride) {
  const events = { user: null, log: [] };
  const week = G.week;
  // Simulate every fixture for this week (user's own fixture uses the given result if provided)
  G.fixtures.filter(f => !f.played && f.week === week).forEach(f => {
    const h = clubById(f.home), a = clubById(f.away);
    const isUser = f.home === G.userClubId || f.away === G.userClubId;
    let res;
    if (isUser && userMatchOverride) res = userMatchOverride;
    else res = simulateMatch(h, a, { homeBonus: 2 });
    recordResult(f, res);
    if (isUser) events.user = { fx: f, res };
    if (f.type === 'cup') {
      const winnerId = res.hg > res.ag ? f.home : res.hg < res.ag ? f.away : null;
      if (winnerId === G.userClubId) pushNews(t('win') + ' — ' + COMPETITIONS.champions.name[LANG]);
    }
    // AI news for big results
    if (!isUser && Math.abs(res.hg - res.ag) >= 3) {
      pushNews(h.name + ' ' + res.hg + '-' + res.ag + ' ' + a.name);
    }
  });
  if (events.user) {
    const f = events.user.fx;
    const uc = userClub();
    const out = f.home === G.userClubId ? (f.hg > f.ag ? 'win' : f.hg < f.ag ? 'loss' : 'draw')
                                        : (f.ag > f.hg ? 'win' : f.ag < f.hg ? 'loss' : 'draw');
    G.lastResult = { home: clubById(f.home).name, away: clubById(f.away).name, hg: f.hg, ag: f.ag, outcome: out, events: f.events };
    pushNews(uc.name + ': ' + G.lastResult.home + ' ' + f.hg + '-' + f.ag + ' ' + G.lastResult.away);
  }
  // AI-to-AI transfers occasionally
  aiTransfers();
  // Training and the manager's career progression
  applyTraining();
  developCoach();
  // advance
  G.week++;
  if (G.week > leagueWeeks()) finishSeason();
  else if (G.week % 4 === 0) addCupFixtures();
  // refresh tasks
  makeTasks(true);
  saveGame();
  return events;
}

function finishSeason() {
  const lid = leagueOf(userClub()).id;
  const table = leagueTable(lid);
  const champ = table[0].club;
  G.history.push({ season: G.season, champion: champ.name, userPos: table.findIndex(r => r.club.id === G.userClubId) + 1 });
  if (champ.id === G.userClubId) G.trophies.push(G.season + ' ' + t('champion'));
  pushNews(t('season_end') + ': ' + champ.name + ' ' + t('champion'));
  // start new season: reset fixtures, age squads
  G.season++;
  G.week = 1;
  G.fixtures = buildFixtures(G.clubs);
  G.clubs.forEach(c => c.squad.forEach(p => {
    p.age++;
    if (p.age > 31) p.ovr = clamp(p.ovr - rndInt(0, 3), 40, 95);
    else if (p.age < 25) p.ovr = clamp(p.ovr + rndInt(0, 4), 40, 95);
    p.stats = { apps: 0, goals: 0, assists: 0 };
    p.fitness = 100;
  }));
  addCupFixtures();
}

function applyTraining() {
  const uc = userClub();
  const f = G.trainingFocus;
  const coachBonus = 1 + Math.floor(((G.coachProfile || {}).development || 55) / 35);
  const facilityBonus = Math.max(1, uc.facilities.training || 1);
  uc.squad.forEach(p => {
    if (p.injuredWeeks > 0) { p.injuredWeeks--; return; }
    p.attrs[f] = clamp(p.attrs[f] + (rnd() < Math.min(0.9, 0.25 + facilityBonus * 0.08 + coachBonus * 0.04) ? 1 : 0), 30, 99);
    if (rnd() < Math.min(0.55, 0.12 + facilityBonus * 0.04 + coachBonus * 0.025) && p.ovr < p.potential) { p.ovr++; p.value = Math.round(p.value * 1.08); }
    p.fitness = clamp(p.fitness + 10, 40, 100);
  });
}



function developCoach() {
  if (!G.coachProfile) G.coachProfile = { level: 1, xp: 0, tactics: 55, development: 55, leadership: 55, points: 0 };
  const cp = G.coachProfile;
  const uc = userClub();
  cp.xp += 12 + Math.round(uc.reputation / 10);
  const threshold = cp.level * 100;
  if (cp.xp >= threshold) {
    cp.xp -= threshold; cp.level++; cp.points++;
    pushNews((LANG === 'ar' ? 'تطور مستوى المدرب إلى ' : LANG === 'fr' ? 'Niveau entraîneur atteint : ' : 'Manager level reached: ') + cp.level);
  }
  // Manager attributes improve gradually through experience; they influence training and match preparation.
  if (rnd() < 0.35) cp.tactics = clamp(cp.tactics + 1, 40, 99);
  if (rnd() < 0.30) cp.development = clamp(cp.development + 1, 40, 99);
  if (rnd() < 0.25) cp.leadership = clamp(cp.leadership + 1, 40, 99);
}

// ----- Market -----
function playerMarketList() {
  return G.clubs.filter(c => c.id !== G.userClubId)
    .flatMap(c => c.squad.map(p => ({ p, club: c })))
    .sort((a, b) => b.p.ovr - a.p.ovr);
}

function buyPlayer(fromClubId, playerId) {
  const uc = userClub();
  const from = clubById(fromClubId);
  const idx = from.squad.findIndex(p => p.id === playerId);
  if (idx < 0) return { ok: false, msg: t('notEnough') };
  const p = from.squad[idx];
  const fee = Math.round(p.value * 1.1);
  if (uc.budget < fee) return { ok: false, msg: t('notEnough') };
  uc.budget -= fee; from.budget += fee;
  from.squad.splice(idx, 1);
  uc.squad.push(p);
  G.lastBuy = p.name;
  pushNews(t('signed') + ': ' + p.name + ' (' + fmtMoney(fee) + ')');
  // AI club refills squad
  if (from.squad.length < 16) from.squad.push(makePlayer(pick(POSITIONS), from.rating, Math.floor(rnd() * 999)));
  saveGame();
  return { ok: true, msg: t('signed') };
}

function sellPlayer(playerId) {
  const uc = userClub();
  const idx = uc.squad.findIndex(p => p.id === playerId);
  if (idx < 0 || uc.squad.length <= 14) return { ok: false, msg: t('notEnough') };
  const p = uc.squad[idx];
  const buyer = G.clubs.filter(c => c.id !== uc.id).sort((a, b) => b.budget - a.budget)[0];
  const fee = Math.round(p.value * 0.9);
  if (buyer.budget < fee) return { ok: false, msg: t('notEnough') };
  buyer.budget -= fee; uc.budget += fee;
  uc.squad.splice(idx, 1);
  buyer.squad.push(p);
  pushNews(t('sold') + ': ' + p.name + ' (' + fmtMoney(fee) + ')');
  saveGame();
  return { ok: true, msg: t('sold') };
}

function aiTransfers() {
  if (rnd() > 0.35) return;
  const cands = G.clubs.filter(c => c.id !== G.userClubId && c.squad.length > 16);
  if (!cands.length) return;
  const seller = pick(cands);
  const buyer = pick(G.clubs.filter(c => c.id !== seller.id && c.id !== G.userClubId));
  const p = seller.squad.splice(rndInt(0, seller.squad.length - 1), 1)[0];
  const fee = Math.round(p.value);
  if (buyer.budget >= fee) { buyer.budget -= fee; seller.budget += fee; buyer.squad.push(p); pushNews(buyer.name + ' ← ' + p.name + ' (' + seller.name + ')'); }
  else seller.squad.push(p);
}

function fmtMoney(v) {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M' + t('currency');
  if (v >= 1e3) return Math.round(v / 1e3) + 'K' + t('currency');
  return v + t('currency');
}

// ----- News & tasks -----
function pushNews(text) {
  G.news.unshift({ week: G.week, season: G.season, text });
  G.news = G.news.slice(0, 60);
}

function makeTasks(keepDone) {
  const uc = userClub();
  const list = [
    { id: 'top4', label: { ar: 'إنهاء الموسم ضمن أفضل 4 فرق', fr: 'Finir dans le top 4', en: 'Finish top 4' }, done: false },
    { id: 'train', label: { ar: 'اختيار محور تدريب واحد على الأقل', fr: "Choisir un axe d'entraînement", en: 'Set a training focus' }, done: !!G.trainingFocus },
    { id: 'fit', label: { ar: 'حافظ على لياقة الفريق فوق 70%', fr: "Garder l'équipe au-dessus de 70% de condition", en: 'Keep squad fitness above 70%' }, done: uc.squad.every(p => p.fitness >= 70) },
  ];
  if (keepDone && G.tasks.length) list.forEach(x => { const old = G.tasks.find(o => o.id === x.id); if (old && old.done) x.done = true; });
  G.tasks = list;
}
