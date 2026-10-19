// ===== App bootstrap, navigation, match screen =====
let NAV = ['intro'];
let CUR_FX = null;
let PENDING = null;
let PITCH_ANIM = null;

function go(id) {
  if (NAV[NAV.length - 1] !== id) NAV.push(id);
  showScreen(id);
  if (id === 'intro') renderIntro();
  if (id === 'new') renderNew();
  if (id === 'settings') renderSettings();
  if (id === 'game') renderGame();
  if (id === 'match') renderMatchHead();
}
function back() {
  NAV.pop();
  const prev = NAV[NAV.length - 1] || 'intro';
  if (prev === 'game') { showScreen('game'); renderGame(); }
  else go(prev);
}

function applyQuality(q) {
  localStorage.setItem('mb_quality', q);
  document.body.classList.remove('q-low', 'q-medium', 'q-high');
  document.body.classList.add('q-' + q);
}
function applyTheme(th) {
  localStorage.setItem('mb_theme', th);
  document.body.classList.toggle('theme-light', th === 'light');
  document.body.classList.toggle('theme-dark', th !== 'light');
}

// ----- Match flow -----
function userFixtureThisWeek() {
  return G.fixtures.find(f => !f.played && f.week === G.week && (f.home === G.userClubId || f.away === G.userClubId)) || null;
}

function onPlayMatchRequested() {
  const fx = userFixtureThisWeek();
  if (!fx) { toast(t('nextMatch') + ' — ' + t('week') + ' ' + G.week); return; }
  CUR_FX = fx;
  PENDING = null;
  go('match');
}

function onAdvance() {
  const fx = userFixtureThisWeek();
  if (fx) { CUR_FX = fx; PENDING = null; go('match'); return; }
  playWeek(null);
  renderGame();
  if (G.lastResult && G.lastResult.events) toast(t('fullTime'));
}

function renderMatchHead() {
  if (!CUR_FX) return;
  const h = clubById(CUR_FX.home), a = clubById(CUR_FX.away);
  $('#match-head').innerHTML = `
    <div class="team">${crestHTML(h, true)}<span>${h.name}</span></div>
    <div class="score">${PENDING ? PENDING.hg + ' - ' + PENDING.ag : 'vs'}</div>
    <div class="team"><span>${a.name}</span>${crestHTML(a, true)}</div>`;
  $('#match-log').innerHTML = '';
  $('#btn-match-done').style.display = PENDING ? '' : 'none';
  drawPitch(null, 0);
}

function renderEvents(events) {
  const h = clubById(CUR_FX.home);
  $('#match-log').innerHTML = events.map(e => {
    const side = e.club === h.id ? '🏠' : '✈️';
    const icon = e.type === 'goal' ? '⚽' : '🟨';
    return `<div class="ev ${e.type === 'goal' ? 'goal' : ''}">${e.min}' ${icon} ${side} ${e.scorer || ''}</div>`;
  }).join('') || `<div class="ev">—</div>`;
}

function renderMatchStats(stats) {
  if (!stats) return;
  const h = clubById(CUR_FX.home), a = clubById(CUR_FX.away);
  const label = LANG === 'ar' ? ['الاستحواذ','التسديدات','على المرمى','الركنيات'] : LANG === 'fr' ? ['Possession','Tirs','Cadrés','Corners'] : ['Possession','Shots','On target','Corners'];
  const vals = [[stats.possession + '%', (100-stats.possession) + '%'], [stats.homeShots, stats.awayShots], [stats.homeOnTarget, stats.awayOnTarget], [stats.homeCorners, stats.awayCorners]];
  const block = `<div class="match-stats"><div class="match-stat-head"><b>${h.name}</b><b>${a.name}</b></div>${vals.map((v,i)=>`<div class="match-stat"><span>${v[0]}</span><small>${label[i]}</small><span>${v[1]}</span></div>`).join('')}</div>`;
  $('#match-log').insertAdjacentHTML('beforeend', block);
}

function quickSim() {
  if (PITCH_ANIM) return;
  const h = clubById(CUR_FX.home), a = clubById(CUR_FX.away);
  PENDING = simulateMatch(h, a, { homeBonus: 2 });
  renderMatchHead();
  renderEvents(PENDING.events);
  renderMatchStats(PENDING.stats);
  $('#match-head .score').textContent = PENDING.hg + ' - ' + PENDING.ag;
  $('#btn-match-done').style.display = '';
}

function pitchSim() {
  if (PITCH_ANIM) return;
  const h = clubById(CUR_FX.home), a = clubById(CUR_FX.away);
  PENDING = simulateMatch(h, a, { homeBonus: 2 });
  $('#match-log').innerHTML = '';
  $('#btn-match-done').style.display = 'none';
  const dur = LANG && document.body.classList.contains('q-low') ? 4000 : 9000;
  const start = performance.now();
  const shown = new Set();
  const minutes = PENDING.events;
  PITCH_ANIM = true;
  const tick = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const min = Math.floor(p * 90);
    minutes.forEach((e, i) => {
      if (e.min <= min && !shown.has(i)) {
        shown.add(i);
        const div = document.createElement('div');
        div.className = 'ev ' + (e.type === 'goal' ? 'goal' : '');
        const side = e.club === h.id ? '🏠' : '✈️';
        div.textContent = `${e.min}' ${e.type === 'goal' ? '⚽' : '🟨'} ${side} ${e.scorer || ''}`;
        $('#match-log').prepend(div);
        if (e.type === 'goal') toast(e.scorer || t('goal'));
      }
    });
    const scoreNow = minutes.filter(e => e.type === 'goal' && shown.has(minutes.indexOf(e)));
    const hgNow = scoreNow.filter(e => e.side === 'home').length;
    const agNow = scoreNow.filter(e => e.side === 'away').length;
    $('#match-head .score').textContent = hgNow + ' - ' + agNow;
    drawPitch(p, min);
    if (p < 1) requestAnimationFrame(tick);
    else {
      PITCH_ANIM = null;
      $('#match-head .score').textContent = PENDING.hg + ' - ' + PENDING.ag;
      renderMatchStats(PENDING.stats);
      $('#btn-match-done').style.display = '';
    }
  };
  requestAnimationFrame(tick);
}

// Canvas pitch with moving players and ball
function drawPitch(progress, min) {
  const c = $('#pitch'); if (!c) return;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#176b35'; ctx.fillRect(0, 0, W, H);
  // Grass mowing bands and detailed regulation markings.
  for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.055)'; ctx.fillRect(i * W / 12, 0, W / 12, H); }
  const L=28, T=28, R=W-28, B=H-28, mid=W/2;
  ctx.strokeStyle = 'rgba(255,255,255,.88)'; ctx.lineWidth = 2.5;
  ctx.strokeRect(L,T,R-L,B-T);
  ctx.beginPath(); ctx.moveTo(mid,T); ctx.lineTo(mid,B); ctx.stroke();
  ctx.beginPath(); ctx.arc(mid,H/2,68,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(mid,H/2,3,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
  // Penalty areas, six-yard boxes, spots and arcs.
  ctx.strokeRect(L,H/2-112,142,224); ctx.strokeRect(L,H/2-58,48,116);
  ctx.strokeRect(R-142,H/2-112,142,224); ctx.strokeRect(R-48,H/2-58,48,116);
  ctx.beginPath(); ctx.arc(L+96,H/2,2.5,0,Math.PI*2); ctx.arc(R-96,H/2,2.5,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(L+96,H/2,52,-.88,.88); ctx.stroke();
  ctx.beginPath(); ctx.arc(R-96,H/2,52,Math.PI-.88,Math.PI+.88); ctx.stroke();
  // Corner arcs and goals.
  for (const x of [L,R]) for (const y of [T,B]) { ctx.beginPath(); ctx.arc(x,y,12,0,Math.PI/2); ctx.stroke(); }
  ctx.strokeRect(L-8,H/2-34,8,68); ctx.strokeRect(R,H/2-34,8,68);
  // Formation-based player lanes; each side shifts naturally as the match clock moves.
  const tt=(progress||0)*Math.PI*5;
  const homeXs=[.08,.22,.22,.22,.22,.38,.43,.38,.68,.75,.68];
  const homeYs=[.50,.22,.40,.60,.78,.32,.50,.68,.22,.50,.78];
  const awayXs=homeXs.map(x=>1-x);
  const awayYs=homeYs.slice();
  const ballX=mid+Math.sin(tt*1.3)*W*.25;
  const ballY=H/2+Math.cos(tt*1.7)*H*.24;
  const drawTeam=(xs,ys,color,side)=>{
    for(let i=0;i<11;i++){
      const phase=tt+(i*.77)+(side?1.4:0);
      const attackShift=Math.sin(tt*.7+(side?Math.PI:0))*W*.055;
      let x=xs[i]*W+Math.sin(phase)*18+(side?-attackShift:attackShift);
      let y=ys[i]*H+Math.cos(phase*1.1)*15;
      // Players compress around the ball to mimic possession and defensive movement.
      x += (ballX-x)*(.06+((i%3)*.018)); y += (ballY-y)*(.045+((i%4)*.012));
      x=Math.max(L+12,Math.min(R-12,x)); y=Math.max(T+12,Math.min(B-12,y));
      ctx.beginPath(); ctx.ellipse(x+2,y+5,15,7,0,0,Math.PI*2); ctx.fillStyle='#0005'; ctx.fill();
      ctx.beginPath(); ctx.arc(x,y,14,0,Math.PI*2); ctx.fillStyle=color; ctx.fill();
      ctx.lineWidth=2; ctx.strokeStyle=side?'#1f2937':'#f8fafc'; ctx.stroke();
      ctx.fillStyle=side?'#101827':'#152b1b'; ctx.font='bold 12px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(i+1),x,y+.5);
    }
  };
  drawTeam(homeXs,homeYs,'#f8fafc',false); drawTeam(awayXs,awayYs,'#f5b82e',true);
  // Ball with panel pattern and soft shadow.
  ctx.beginPath(); ctx.arc(ballX+2,ballY+4,9,0,Math.PI*2); ctx.fillStyle='#0006'; ctx.fill();
  ctx.beginPath(); ctx.arc(ballX,ballY,8,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ballX-4,ballY-2); ctx.lineTo(ballX+3,ballY-4); ctx.lineTo(ballX+4,ballY+3); ctx.lineTo(ballX-2,ballY+4); ctx.closePath(); ctx.fillStyle='#222'; ctx.fill();
  // Broadcast-style clock and score-independent match atmosphere.
  ctx.fillStyle='rgba(3,12,8,.82)'; ctx.fillRect(W/2-72,8,144,34);
  ctx.fillStyle='#f5b82e'; ctx.font='bold 20px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText((min||0)+"'",W/2,H/2-H/2+25);
}
function finishMatch() {
  if (!PENDING) return;
  PITCH_ANIM = null;
  playWeek(PENDING);
  CUR_FX = null;
  PENDING = null;
  NAV = ['intro', 'game'];
  go('game');
}

// ----- Bootstrap -----
function startCareer(clubIdx) {
  const idx = LEAGUES.findIndex(l => l.id === SELECTED_LEAGUE);
  const offset = LEAGUES.slice(0, idx).reduce((a, l) => a + l.clubs.length, 0);
  const coach = ($('#coach-name').value || 'Coach').trim();
  newCareer(coach, 'c' + (offset + clubIdx));
  NAV = ['intro', 'game'];
  go('game');
}

function init() {
  setLang(LANG);
  applyQuality(localStorage.getItem('mb_quality') || 'high');
  applyTheme(localStorage.getItem('mb_theme') || 'dark');
  applyI18n();
  loadGame();
  go('intro');

  document.body.addEventListener('click', (e) => {
    const go_ = e.target.closest('[data-go]');
    if (go_) { const id = go_.dataset.go; if (id === 'back') back(); else if (id === 'game') { go('game'); } else go(id); return; }
    const lang = e.target.closest('[data-lang]');
    if (lang) {
      setLang(lang.dataset.lang); applyI18n();
      const cur = NAV[NAV.length - 1];
      if (cur === 'intro') renderIntro(); else if (cur === 'settings') renderSettings(); else if (cur === 'game') renderGame(); else if (cur === 'new') renderNew();
      return;
    }
    const q = e.target.closest('[data-quality]');
    const sv = e.target.closest('#set-quality button');
    if (sv) { applyQuality(sv.dataset.v); renderSettings(); return; }
    const snd = e.target.closest('#set-sound button');
    if (snd) { localStorage.setItem('mb_sound', snd.dataset.v); renderSettings(); return; }
    const thm = e.target.closest('#set-theme button');
    if (thm) { applyTheme(thm.dataset.v); renderSettings(); return; }
    const lg = e.target.closest('[data-league]');
    if (lg) { SELECTED_LEAGUE = lg.dataset.league; SELECTED_CLUB = null; renderNew(); return; }
    const cl = e.target.closest('[data-club]');
    if (cl) { SELECTED_CLUB = +cl.dataset.club; renderNew(); return; }
  });

  $('#btn-continue').onclick = () => { if (loadGame()) { go('game'); } };
  $('#btn-new').onclick = () => { go('new'); };
  $('#btn-settings').onclick = () => { go('settings'); };
  $('#btn-start-career').onclick = () => {
    if (SELECTED_CLUB === null) { toast(t('chooseClub')); return; }
    startCareer(SELECTED_CLUB);
  };
  $('#btn-reset').onclick = () => {
    modal(t('reset'), `<p>${t('confirm')}?</p>`, [
      { label: t('cancel'), cls: 'ghost' },
      { label: t('confirm'), cls: 'danger', onClick: () => { clearSave(); renderIntro(); toast('✓'); } },
    ]);
  };
  $('#btn-advance').onclick = onAdvance;
  $('#btn-quick').onclick = quickSim;
  $('#btn-pitch').onclick = pitchSim;
  $('#btn-match-done').onclick = finishMatch;
  $('#sidenav').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sec === 'menu') { go('settings'); return; }
    CUR_SECTION = b.dataset.sec;
    renderGame();
  };
  $('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
  // keep the picker sync if the screen is shown
  renderNew();
}

document.addEventListener('DOMContentLoaded', init);
