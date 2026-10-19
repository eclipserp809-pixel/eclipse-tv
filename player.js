// Eclipse TV · pagina que se pinta en cada tele (DUI). Recibe: state (que suena y desde que segundo), volume, sync.
const stage = document.getElementById('stage');
const idle = document.getElementById('idle');
const strip = document.getElementById('strip');
let st = false;          // estado actual
let startedAt = 0;       // Date.now() en el que el contenido estaba en el segundo 0
let vol = 0;             // 0..100
let curKey = '';         // fuente|id que esta cargado
let adapter = null;      // { setVolume(v01), pause(), play(), seek(sec) }
let stripTimer = 0;
let audible = true;

const elapsed = () => (!st ? 0 : st.paused ? (st.elapsed || 0) : (Date.now() - startedAt) / 1000);

setInterval(() => {
  const d = new Date();
  document.getElementById('clock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}, 5000);
document.getElementById('clock').textContent = '--:--';

function loadScript(src, test) {
  return new Promise((resolve) => {
    if (test()) return resolve();
    let s = document.querySelector('script[data-src="' + src + '"]');
    if (!s) { s = document.createElement('script'); s.src = src; s.dataset.src = src; document.head.appendChild(s); }
    const t = setInterval(() => { if (test()) { clearInterval(t); resolve(); } }, 150);
    setTimeout(() => { clearInterval(t); resolve(); }, 12000);
  });
}

// mensaje visible en la propia pantalla (para saber por que no sale el video)
function say(msg) {
  let m = document.getElementById('tvmsg');
  if (!m) { m = document.createElement('div'); m.id = 'tvmsg'; m.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:50;padding:10px 16px;font:600 22px Segoe UI,Arial;color:#F2F3F5;background:rgba(0,0,0,.78);text-align:center'; document.body.appendChild(m); }
  m.textContent = msg; m.style.display = msg ? 'block' : 'none';
}
window.addEventListener('error', (e) => say('Error: ' + (e.message || 'script')));

function clearStage() {
  say('');
  try { stage.innerHTML = ''; } catch (e) {}
  adapter = null;
}

function showStrip() {
  if (!st) return;
  document.getElementById('sTitle').textContent = st.title || '';
  document.getElementById('sAuthor').textContent = st.author || '';
  strip.classList.add('show');
  clearTimeout(stripTimer);
  stripTimer = setTimeout(() => strip.classList.remove('show'), 6000);
}

function applyVolume() { if (adapter && adapter.setVolume) { try { adapter.setVolume(Math.max(0, Math.min(1, vol / 100))); } catch (e) {} } }

function iframe(src) {
  const f = document.createElement('iframe');
  f.src = src;
  f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  stage.appendChild(f);
  return f;
}

// ---- proveedores ----
// Error 153 de YouTube = el reproductor se incrusto sin referer/origen valido. Se crea el iframe a mano con referrerPolicy y origin
// y se le engancha la API; si aun asi da 153 se reintenta una vez con el dominio nocookie.
async function mountYouTube(id, t, alt) {
  // YouTube lo carga la propia tele como pagina completa (client/screens.lua). Aqui solo se llega en pausa.
  say(st && st.paused ? 'Pausado' : '');
  return;
  /* eslint-disable no-unreachable */
  say('Cargando YouTube...');
  await loadScript('https://www.youtube.com/iframe_api', () => window.YT && YT.Player);
  if (!(window.YT && YT.Player)) return say('No se pudo cargar YouTube desde la tele (sin acceso a internet o bloqueado)');
  const host = alt ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com';
  const q = 'enablejsapi=1&autoplay=1&controls=0&disablekb=1&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&fs=0&start=' + Math.floor(t) +
    '&origin=' + encodeURIComponent(location.origin) + '&widget_referrer=' + encodeURIComponent(location.origin);
  const f = document.createElement('iframe');
  f.id = 'ytFrame';
  f.src = host + '/embed/' + encodeURIComponent(id) + '?' + q;
  f.allow = 'autoplay; encrypted-media; picture-in-picture';
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  f.style.cssText = 'width:100%;height:100%;border:0';
  stage.appendChild(f);
  new YT.Player(f, {
    events: {
      onError: (e) => {
        const c = e && e.data;
        if ((c === 153 || c === 150 || c === 101) && !alt) { clearStage(); return mountYouTube(id, t, true); }
        say(c === 101 || c === 150 || c === 153 ? 'YouTube bloquea sus videos en esta pantalla (codigo ' + c + '). Usa un enlace directo (.mp4) o Vimeo.' : 'Error de YouTube (codigo ' + c + ')');
      },
      onReady: (e) => {
        say('');
        adapter = {
          setVolume: (v) => e.target.setVolume(Math.round(v * 100)),
          pause: () => e.target.pauseVideo(),
          play: () => e.target.playVideo(),
          seek: (s) => e.target.seekTo(s, true),
          time: () => e.target.getCurrentTime(),
        };
        applyVolume();
        if (st && st.paused) adapter.pause(); else e.target.playVideo();
      },
    },
  });
}

async function mountTwitch(id) {
  await loadScript('https://embed.twitch.tv/embed/v1.js', () => window.Twitch && Twitch.Player);
  const holder = document.createElement('div'); holder.id = 'twHolder'; stage.appendChild(holder);
  if (!(window.Twitch && Twitch.Player)) return;
  const opts = { width: '100%', height: '100%', parent: ['localhost', 'cfx-nui-eclipse_tv'], autoplay: true, muted: false, controls: false };
  if (/^v\d+$/.test(id)) opts.video = id.slice(1); else opts.channel = id;
  const p = new Twitch.Player('twHolder', opts);
  adapter = {
    setVolume: (v) => p.setVolume(v),
    pause: () => p.pause(),
    play: () => p.play(),
    seek: (s) => { if (opts.video) p.seek(s); },
  };
  p.addEventListener(Twitch.Player.READY, () => applyVolume());
}

async function mountVimeo(id, t) {
  await loadScript('https://player.vimeo.com/api/player.js', () => window.Vimeo && Vimeo.Player);
  const f = iframe('https://player.vimeo.com/video/' + id + '?autoplay=1&controls=0&title=0&byline=0&portrait=0');
  if (!(window.Vimeo && Vimeo.Player)) return;
  const p = new Vimeo.Player(f);
  adapter = {
    setVolume: (v) => p.setVolume(v),
    pause: () => p.pause(),
    play: () => p.play(),
    seek: (s) => p.setCurrentTime(s),
  };
  p.ready().then(() => { applyVolume(); p.setCurrentTime(t); if (st && st.paused) p.pause(); else p.play(); }).catch(() => {});
}

async function mountSoundCloud(url, t) {
  await loadScript('https://w.soundcloud.com/player/api.js', () => window.SC && SC.Widget);
  const f = iframe('https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) + '&auto_play=true&hide_related=true&show_comments=false&visual=true');
  if (!(window.SC && SC.Widget)) return;
  const w = SC.Widget(f);
  adapter = {
    setVolume: (v) => w.setVolume(Math.round(v * 100)),
    pause: () => w.pause(),
    play: () => w.play(),
    seek: (s) => w.seekTo(Math.round(s * 1000)),
  };
  w.bind(SC.Widget.Events.READY, () => { applyVolume(); if (t > 1) w.seekTo(Math.round(t * 1000)); if (st && st.paused) w.pause(); });
}

function mountFile(url, t) {
  const isAudio = /\.(mp3|ogg|wav|m4a)(\?|$)/i.test(url);
  const el = document.createElement(isAudio ? 'audio' : 'video');
  el.src = url; el.autoplay = true; el.playsInline = true; el.crossOrigin = 'anonymous';
  el.addEventListener('loadedmetadata', () => { try { el.currentTime = t; } catch (e) {} });
  stage.appendChild(el);
  if (isAudio) { const d = document.createElement('div'); d.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:90px;color:#37C8E8'; d.textContent = '♪'; stage.appendChild(d); }
  adapter = {
    setVolume: (v) => { el.volume = v; },
    pause: () => el.pause(),
    play: () => el.play(),
    seek: (s) => { el.currentTime = s; },
    time: () => el.currentTime,
  };
  applyVolume();
}

// kick y tiktok no tienen API de volumen: se cargan solo si se oye algo (volumen > 0) y se quitan si no se oye
function mountPlain(src, t) {
  const f = iframe(src);
  adapter = { setVolume: () => {}, pause: () => { f.src = 'about:blank'; }, play: () => {}, seek: () => {} };
}

function urlFor(s) {
  if (s.src === 'kick') return 'https://player.kick.com/' + encodeURIComponent(s.id);
  if (s.src === 'tiktok') return 'https://www.tiktok.com/embed/v2/' + encodeURIComponent(s.id);
  return '';
}

async function mount() {
  clearStage();
  const t = elapsed();
  const s = st;
  idle.classList.add('off');
  if (s.src === 'youtube') await mountYouTube(s.id, t);
  else if (s.src === 'twitch') await mountTwitch(s.id);
  else if (s.src === 'vimeo') await mountVimeo(s.id, t);
  else if (s.src === 'soundcloud') await mountSoundCloud(s.id, t);
  else if (s.src === 'file') mountFile(s.id, t);
  else if (s.src === 'kick' || s.src === 'tiktok') { if (vol > 1) { mountPlain(urlFor(s), t); audible = true; } else audible = false; }
  showStrip();
}

function render() {
  if (st && st.off && !st.src) {
    // apagada: pantalla negra
    curKey = '';
    clearStage();
    idle.classList.add('off');
    strip.classList.remove('show');
    document.body.style.background = '#000';
    return;
  }
  document.body.style.background = '';
  if (!st || !st.src) {
    curKey = '';
    clearStage();
    idle.classList.remove('off');
    strip.classList.remove('show');
    return;
  }
  const key = st.src + '|' + st.id;
  if (key !== curKey) { curKey = key; mount(); return; }
  if (!adapter) return;
  try { if (st.paused) adapter.pause(); else adapter.play(); } catch (e) {}
}

window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  if (d.action === 'state') {
    const was = curKey, prevStart = startedAt;
    st = d.st || false;
    if (st) startedAt = Date.now() - (st.elapsed || 0) * 1000;
    render();
    // mismo contenido: si alguien salto a otro punto (seek), se aplica; pausar / reanudar no mueve nada
    if (st && st.src && was === st.src + '|' + st.id && adapter && !st.paused && Math.abs(startedAt - prevStart) > 2500) { try { adapter.seek(elapsed()); } catch (err) {} }
  } else if (d.action === 'volume') {
    vol = Number(d.v) || 0;
    applyVolume();
    // fuentes sin control de volumen
    if (st && (st.src === 'kick' || st.src === 'tiktok')) {
      if (vol <= 1 && audible) { audible = false; clearStage(); curKey = ''; }
      else if (vol > 1 && !audible) { audible = true; curKey = ''; render(); }
    }
  } else if (d.action === 'sync') {
    if (!st || st.paused || !adapter || !adapter.time) return;
    startedAt = Date.now() - (Number(d.t) || 0) * 1000;
    try { if (Math.abs(adapter.time() - elapsed()) > 2.5) adapter.seek(elapsed()); } catch (err) {}
  }
});
