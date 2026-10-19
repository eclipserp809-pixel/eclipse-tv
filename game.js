// Eclipse TV · karaoke y Guitar Hero sobre la pantalla (usa st / elapsed() de player.js)
const kar = document.getElementById('kar');
const canvas = document.getElementById('ghCanvas');
const ctx = canvas.getContext('2d');
const COLORS = ['#37C8E8', '#5EE6B0', '#F2F3F5', '#F2B84B', '#FF6B6B'];
const JUDGE = { 3: 'PERFECTO', 2: 'GENIAL', 1: 'BIEN', 0: 'FALLO' };
const gh = { hits: [{}, {}], flash: [null, null], cdStart: 0, lastPhase: '', res: null };

window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.action !== 'gh') return;
  const x = d.data || {};
  if (d.kind === 'start') { gh.hits = [{}, {}]; gh.flash = [null, null]; gh.res = null; gh.lastPhase = ''; }
  else if (d.kind === 'hit') {
    const p = x.p - 1;
    if (!gh.hits[p]) return;
    gh.hits[p][x.i] = x.j;
    (x.m || []).forEach((i) => { gh.hits[p][i] = 0; });
    if (st && st.game && st.game.players && st.game.players[p]) { st.game.players[p].score = x.s; st.game.players[p].combo = x.c; }
    gh.flash[p] = { j: x.j, t: performance.now() };
  } else if (d.kind === 'end') { gh.res = x; }
  else if (d.kind === 'abort') { gh.res = null; }
});

// ---------------------------------------------------------------- karaoke
let karIdx = 0;
function drawKaraoke() {
  const on = !!(st && st.karaoke && st.lines && st.lines.length && !(st.game));
  kar.classList.toggle('on', on);
  if (!on) return;
  const lines = st.lines;
  const e = elapsed() + (st.kOffset || 0);
  if (karIdx >= lines.length || lines[karIdx].t > e) karIdx = 0;
  while (karIdx + 1 < lines.length && lines[karIdx + 1].t <= e) karIdx++;
  const cur = lines[karIdx];
  let idx = karIdx;
  const active = cur && e >= cur.t;
  document.getElementById('kSong').textContent = (st.title || '') + (st.author ? ' · ' + st.author : '');
  const text = (i) => (lines[i] && lines[i].s) || '';
  document.getElementById('kPrev').textContent = active ? text(idx - 1) : '';
  const curEl = document.getElementById('kCurT');
  if (active) {
    const end = lines[idx + 1] ? lines[idx + 1].t : cur.t + 4;
    const span = Math.max(0.6, Math.min(end - cur.t, 7) - 0.15);
    const frac = Math.max(0, Math.min(1, (e - cur.t) / span));
    curEl.textContent = cur.s || '♪';
    curEl.style.setProperty('--p', (frac * 100).toFixed(1) + '%');
    document.getElementById('kNext').textContent = text(idx + 1);
  } else {
    curEl.textContent = '♪';
    curEl.style.setProperty('--p', '0%');
    document.getElementById('kNext').textContent = text(0);
  }
}

// ---------------------------------------------------------------- guitar hero
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function highway(g, pi, cx, e) {
  const L = g.lanes, T = g.chart.t, LN = g.chart.l;
  const yTop = 150, yHit = 590, wFar = 30, wNear = L >= 5 ? 74 : 92, view = 2.4;
  const edge = (q, side) => cx + side * (L * (wFar + (wNear - wFar) * q) / 2);
  const ease = (q) => Math.pow(q, 1.7);
  // pista
  ctx.fillStyle = 'rgba(27,29,34,.92)';
  ctx.beginPath(); ctx.moveTo(edge(0, -1), yTop); ctx.lineTo(edge(0, 1), yTop); ctx.lineTo(edge(1, 1), yHit + 40); ctx.lineTo(edge(1, -1), yHit + 40); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(133,138,148,.35)'; ctx.lineWidth = 1.5;
  for (let k = 0; k <= L; k++) {
    const f = k / L - 0.5;
    ctx.beginPath(); ctx.moveTo(cx + f * L * wFar, yTop); ctx.lineTo(cx + f * L * wNear, yHit + 40); ctx.stroke();
  }
  // linea de golpeo y objetivos
  const laneX = (lane, q) => cx + (lane - (L + 1) / 2) * (wFar + (wNear - wFar) * q);
  ctx.strokeStyle = 'rgba(242,243,245,.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(edge(1, -1), yHit); ctx.lineTo(edge(1, 1), yHit); ctx.stroke();
  for (let lane = 1; lane <= L; lane++) {
    ctx.beginPath(); ctx.arc(laneX(lane, 1), yHit, 27, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS[lane - 1]; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = 'rgba(16,17,20,.85)'; ctx.fill();
    ctx.fillStyle = COLORS[lane - 1]; ctx.font = '700 20px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(String(lane), laneX(lane, 1), yHit + 7);
  }
  // notas (de lejos a cerca)
  const hits = gh.hits[pi] || {};
  for (let i = T.length - 1; i >= 0; i--) {
    const dt = T[i] - e;
    if (dt > view || dt < -0.45) continue;
    const q = Math.min(1.08, 1 - dt / view);
    if (q < 0) continue;
    const r = ease(q);
    const y = yTop + (yHit - yTop) * r;
    const x = laneX(LN[i], r);
    const h = hits[i];
    if (h > 0) continue;
    const rad = 7 + 20 * r;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = h === 0 ? 'rgba(133,138,148,.35)' : COLORS[LN[i] - 1];
    ctx.fill();
    if (h !== 0) { ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, rad * 0.42, 0, Math.PI * 2); ctx.fillStyle = 'rgba(16,17,20,.55)'; ctx.fill(); }
  }
  // juicio
  const f = gh.flash[pi];
  if (f) {
    const a = 1 - (performance.now() - f.t) / 700;
    if (a > 0) {
      ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.font = '800 34px Segoe UI';
      ctx.fillStyle = f.j === 3 ? '#37C8E8' : f.j === 2 ? '#5EE6B0' : '#F2B84B';
      ctx.fillText(JUDGE[f.j], cx, yHit - 70 - (1 - a) * 22); ctx.globalAlpha = 1;
    } else gh.flash[pi] = null;
  }
}

function scoreBox(p, side, name, score, combo) {
  const w = 270, h = 96, x = side === 0 ? 24 : 1280 - 24 - w, y = 22;
  ctx.fillStyle = 'rgba(27,29,34,.94)'; roundRect(x, y, w, h, 16); ctx.fill();
  ctx.strokeStyle = side === 0 ? '#37C8E8' : '#F2B84B'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = side === 0 ? 'left' : 'right'; const tx = side === 0 ? x + 18 : x + w - 18;
  ctx.fillStyle = side === 0 ? '#37C8E8' : '#F2B84B'; ctx.font = '800 17px Segoe UI'; ctx.fillText(String(name || '').toUpperCase().slice(0, 18), tx, y + 28);
  ctx.fillStyle = '#F2F3F5'; ctx.font = '800 40px Segoe UI'; ctx.fillText(String(score || 0), tx, y + 68);
  ctx.fillStyle = '#858A94'; ctx.font = '600 15px Segoe UI'; ctx.fillText('x' + (1 + Math.min(3, Math.floor((combo || 0) / 10))) + '  ·  racha ' + (combo || 0), tx, y + 88);
}

function results(g, res) {
  ctx.fillStyle = 'rgba(8,9,11,.9)'; ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';
  const two = res.players.length === 2;
  ctx.fillStyle = '#F2F3F5'; ctx.font = '800 54px Segoe UI';
  ctx.fillText(two ? (res.winner === 0 ? 'EMPATE' : (res.players[res.winner - 1].name || '').toUpperCase() + ' GANA') : 'RESULTADOS', 640, 112);
  ctx.fillStyle = '#858A94'; ctx.font = '600 22px Segoe UI'; ctx.fillText((res.title || '') + '  ·  ' + ({ easy: 'Facil', normal: 'Normal', hard: 'Dificil', expert: 'Experto' }[res.diff] || ''), 640, 150);
  res.players.forEach((p, i) => {
    const w = 400, h = 380, x = two ? (i === 0 ? 200 : 680) : 440, y = 190;
    ctx.fillStyle = 'rgba(27,29,34,.97)'; roundRect(x, y, w, h, 20); ctx.fill();
    ctx.strokeStyle = (two && res.winner === i + 1) || !two ? '#37C8E8' : '#33363e'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#F2F3F5'; ctx.font = '700 26px Segoe UI'; ctx.fillText((p.name || '').slice(0, 20), x + w / 2, y + 46);
    ctx.font = '800 62px Segoe UI'; ctx.fillStyle = '#37C8E8'; ctx.fillText(String(p.score), x + w / 2, y + 120);
    ctx.fillStyle = '#F2B84B'; ctx.font = '700 32px Segoe UI'; ctx.fillText('★'.repeat(p.stars) + '☆'.repeat(5 - p.stars), x + w / 2, y + 166);
    if (p.record) { ctx.fillStyle = '#37C8E8'; roundRect(x + w / 2 - 82, y + 180, 164, 30, 15); ctx.fill(); ctx.fillStyle = '#06242B'; ctx.font = '800 15px Segoe UI'; ctx.fillText('NUEVO RECORD', x + w / 2, y + 201); }
    const rows = [['Precision', p.acc.toFixed(1) + '%'], ['Mejor racha', p.combo], ['Perfecto', p.perfect], ['Genial / Bien', p.great + ' / ' + p.good], ['Fallos', p.miss]];
    ctx.font = '600 20px Segoe UI';
    rows.forEach((r, k) => {
      ctx.textAlign = 'left'; ctx.fillStyle = '#858A94'; ctx.fillText(r[0], x + 34, y + 242 + k * 26);
      ctx.textAlign = 'right'; ctx.fillStyle = '#F2F3F5'; ctx.fillText(String(r[1]), x + w - 34, y + 242 + k * 26);
    });
    ctx.textAlign = 'center';
  });
}

function drawGame() {
  const g = st && st.game;
  canvas.style.display = g ? 'block' : 'none';
  stage.style.opacity = g ? '0.28' : '1';
  if (!g) { gh.lastPhase = ''; return; }
  ctx.clearRect(0, 0, 1280, 720);
  ctx.fillStyle = 'rgba(8,9,11,.74)'; ctx.fillRect(0, 0, 1280, 720);
  if (g.phase === 'countdown' && gh.lastPhase !== 'countdown') gh.cdStart = performance.now();
  gh.lastPhase = g.phase;
  const res = g.result || gh.res;
  if (g.phase === 'end' || res) { if (res) results(g, res); return; }
  const e = g.phase === 'play' ? elapsed() : 0;
  const n = g.players.length;
  g.players.forEach((p, i) => highway(g, i, n === 1 ? 640 : (i === 0 ? 340 : 940), e));
  ctx.textAlign = 'center'; ctx.fillStyle = '#F2F3F5'; ctx.font = '700 22px Segoe UI';
  ctx.fillText((g.title || '').slice(0, 52), 640, 42);
  ctx.fillStyle = '#858A94'; ctx.font = '600 16px Segoe UI'; ctx.fillText((g.author || '').slice(0, 40) + (n === 2 ? '   ·   DUELO' : ''), 640, 66);
  g.players.forEach((p, i) => scoreBox(p, i, p.name, p.score, p.combo));
  if (g.phase === 'countdown') {
    const left = 3.6 - (performance.now() - gh.cdStart) / 1000;
    ctx.fillStyle = '#37C8E8'; ctx.font = '800 150px Segoe UI'; ctx.textAlign = 'center';
    ctx.fillText(left > 0.4 ? String(Math.ceil(left - 0.5)) : 'YA', 640, 400);
    ctx.fillStyle = '#858A94'; ctx.font = '600 24px Segoe UI'; ctx.fillText('Teclas 1 a ' + g.lanes + ' al llegar a los circulos', 640, 450);
  }
}

function loop() {
  requestAnimationFrame(loop);
  try { drawKaraoke(); drawGame(); } catch (err) { /* un fotograma malo no para la tele */ }
}
loop();
