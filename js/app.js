/* Bootstrap: camera, tracker, mode manager, main loop.
   Modes live in js/modes and only need enter/exit/update/draw/onKey. */

import { CFG } from './config.js';
import { HandRegistry } from './hand.js';
import { Particles, Shake, Flash, drawSkeleton, drawText } from './fx.js';
import { Sound } from './audio.js';
import { Theme, THEMES } from './theme.js';

import { MouseMode }   from './modes/mouse.js';
import { PhysicsMode } from './modes/physics.js';
import { SliceMode }   from './modes/slice.js';
import { PaintMode }   from './modes/paint.js';
import { LearnMode }   from './modes/learn.js';

const MODES = [MouseMode, PhysicsMode, SliceMode, PaintMode, LearnMode];

/* How strongly each mode wants the hand skeleton drawn underneath it. */
const SKELETON_ALPHA = { cursor: 1, physics: 1, slice: 0.55, paint: 0.22, learn: 0 };

const el = id => document.getElementById(id);

const video      = el('webcam');
const canvas     = el('overlay');
const ctx        = canvas.getContext('2d');
const loadScreen = el('loading-screen');
const lsMsg      = el('ls-message');
const modeBar    = el('modebar');
const toastEl    = el('toast');
const helpEl     = el('help');
const helpBody   = el('help-body');

const hud = {
  hands:   el('hud-hands'),
  conf:    el('hud-conf'),
  fps:     el('hud-fps'),
  gesture: el('hud-gesture'),
  signal:  el('hud-signal'),
  mode:    el('hud-mode'),
};

/* Shared context handed to every mode */
const APP = {
  w: 1, h: 1,
  time: 0,
  dt: 0,
  hands: [],
  particles: new Particles(700),
  shake: new Shake(),
  flash: new Flash(),
  floats: [],

  toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(APP._toastTimer);
    APP._toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 1600);
  },

  floatText(x, y, text, color) {
    APP.floats.push({ x, y, text, color: color || Theme.c.ink, life: 0.9 });
    if (APP.floats.length > 40) APP.floats.shift();
  },
};

const registry = new HandRegistry();

let current = MODES[1];          // open on Physics, it explains itself fastest
let lastResults = null;
let resultsDirty = false;
let lastHandTime = 0;
let lastFrame = performance.now();
let frames = 0, fpsTimer = 0, fps = 0;
let phase = 0;
let started = false;

/* canvas sizing */

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  APP.w = window.innerWidth;
  APP.h = window.innerHeight;
  canvas.width  = Math.floor(APP.w * dpr);
  canvas.height = Math.floor(APP.h * dpr);
  canvas.style.width  = APP.w + 'px';
  canvas.style.height = APP.h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

/* mode switching */

function buildModeBar() {
  modeBar.innerHTML = '';
  MODES.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'mode-btn';
    b.dataset.mode = m.id;
    b.innerHTML = '<span class="mk">' + (i + 1) + '</span>' + m.name;
    b.title = m.blurb;
    b.addEventListener('click', () => setMode(i));
    modeBar.appendChild(b);
  });
  syncModeBar();
}

function syncModeBar() {
  for (const b of modeBar.children) {
    b.classList.toggle('active', b.dataset.mode === current.id);
  }
  hud.mode.textContent = current.name;
  helpBody.innerHTML =
    '<h3>' + current.name + '</h3><p class="blurb">' + current.blurb + '</p><ul>' +
    current.help.map(h => '<li>' + h + '</li>').join('') +
    '</ul><h3>Anywhere</h3><ul>' +
    '<li>1 to 5 switch modes</li>' +
    '<li>T cycles the theme, or click the dots top right</li>' +
    '<li>H shows and hides this panel</li>' +
    '<li>M mutes the sound</li>' +
    '<li>F toggles fullscreen</li></ul>';
}

function setMode(i) {
  const next = MODES[i];
  if (!next || next === current) return;
  if (current.exit) current.exit(APP);
  current = next;
  APP.particles.clear();
  APP.floats.length = 0;
  if (current.enter) current.enter(APP);
  syncModeBar();
  APP.toast(current.name + '  ·  ' + current.blurb, 2200);
  Sound.blip();
}

/* input */

window.addEventListener('keydown', e => {
  Sound.init();
  Sound.resume();

  if (e.key >= '1' && e.key <= String(MODES.length)) {
    setMode(Number(e.key) - 1);
    e.preventDefault();
    return;
  }

  const k = e.key.toLowerCase();
  if (k === 'h' || e.key === '?') { helpEl.classList.toggle('open'); return; }
  if (k === 'm') { APP.toast(Sound.toggleMute() ? 'Muted' : 'Sound on'); return; }
  if (k === 'f') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
    return;
  }
  if (k === 't') { applyTheme(Theme.index + 1); return; }

  if (current.onKey && current.onKey(e, APP)) e.preventDefault();
});

window.addEventListener('pointerdown', () => { Sound.init(); Sound.resume(); });
el('help-close').addEventListener('click', () => helpEl.classList.remove('open'));
el('help-open').addEventListener('click', () => helpEl.classList.toggle('open'));

/* theme picker */

function buildThemeBar() {
  const bar = el('themebar');
  bar.innerHTML = '';
  THEMES.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'theme-dot';
    b.dataset.theme = t.id;
    b.title = t.name;
    b.setAttribute('aria-label', 'Theme: ' + t.name);
    b.style.setProperty('--sw-a', t.swatch[0]);
    b.style.setProperty('--sw-b', t.swatch[1]);
    b.addEventListener('click', () => applyTheme(i));
    bar.appendChild(b);
  });
  syncThemeBar();
}

function syncThemeBar() {
  for (const b of el('themebar').children) {
    b.classList.toggle('active', b.dataset.theme === Theme.current.id);
  }
}

function applyTheme(i, quiet) {
  const t = Theme.set(i);
  syncThemeBar();
  if (!quiet) { APP.toast('Theme: ' + t.name); Sound.blip(); }
}

/* main loop */

function frame(now) {
  requestAnimationFrame(frame);

  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  APP.dt = dt;
  APP.time += dt;
  phase = (phase + CFG.visual.rampDrift * dt) % 1;

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fps = Math.round(frames / fpsTimer);
    frames = 0; fpsTimer = 0;
    hud.fps.textContent = fps;
  }

  // Only refresh hand state when the camera actually delivered a new frame,
  // otherwise landmark velocity would read as zero on the in between frames.
  if (resultsDirty) {
    const handDt = lastHandTime ? Math.min(0.2, (now - lastHandTime) / 1000) : 1 / 30;
    lastHandTime = now;
    resultsDirty = false;
    APP.hands = registry.ingest(lastResults, APP.w, APP.h, handDt);
    updateHud();
  }

  APP.particles.update(dt);
  APP.shake.update(dt);
  APP.flash.update(dt);
  for (let i = APP.floats.length - 1; i >= 0; i--) {
    const f = APP.floats[i];
    f.life -= dt;
    f.y -= 60 * dt;
    if (f.life <= 0) APP.floats.splice(i, 1);
  }

  if (current.update) current.update(APP, APP.hands, dt);

  ctx.clearRect(0, 0, APP.w, APP.h);
  ctx.save();
  ctx.translate(APP.shake.x, APP.shake.y);

  const alpha = SKELETON_ALPHA[current.id];
  if (alpha > 0) {
    APP.hands.forEach((h, i) => {
      if (h.seen) drawSkeleton(ctx, h, phase + i * 0.35, { alpha, dots: alpha > 0.4 });
    });
  }

  if (current.draw) current.draw(ctx, APP);

  APP.particles.draw(ctx);
  drawFloats();

  ctx.restore();
  APP.flash.draw(ctx, APP.w, APP.h);
}

function drawFloats() {
  for (const f of APP.floats) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.9));
    drawText(ctx, f.text, f.x, f.y, f.color, '600 20px ' + Theme.fmono);
    ctx.restore();
  }
}

function updateHud() {
  const live = APP.hands.filter(h => h.seen);
  hud.hands.textContent = live.length;

  if (!live.length) {
    hud.conf.textContent = '0%';
    hud.gesture.textContent = 'NONE';
    hud.signal.style.width = '0%';
    return;
  }
  const avg = live.reduce((s, h) => s + (h.score || 0), 0) / live.length;
  hud.conf.textContent = Math.round(avg * 100) + '%';
  hud.signal.style.width = Math.round(avg * 100) + '%';
  hud.gesture.textContent = live[0].gesture;
}

/* camera and tracker */

function fail(msg) {
  loadScreen.classList.add('error');
  const sp = document.querySelector('.ls-spinner');
  if (sp) sp.style.animation = 'none';
  document.querySelector('.ls-title').textContent = 'ERROR';
  lsMsg.textContent = msg;
}

function initTracker() {
  if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
    fail('MediaPipe failed to load. Check your internet connection and reload.');
    return;
  }

  const hands = new Hands({
    locateFile: f => 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + f,
  });
  hands.setOptions({
    maxNumHands:            CFG.tracker.maxNumHands,
    modelComplexity:        CFG.tracker.modelComplexity,
    minDetectionConfidence: CFG.tracker.minDetectionConfidence,
    minTrackingConfidence:  CFG.tracker.minTrackingConfidence,
  });
  hands.onResults(r => { lastResults = r; resultsDirty = true; });

  const camera = new Camera(video, {
    onFrame: async () => { await hands.send({ image: video }); },
    width: CFG.camera.width,
    height: CFG.camera.height,
  });

  camera.start()
    .then(() => {
      lsMsg.textContent = 'Loading the hand model';
      setTimeout(() => {
        loadScreen.classList.add('hidden');
        if (!started) {
          started = true;
          if (current.enter) current.enter(APP);
          syncModeBar();
          APP.toast('Press H for controls, 1 to 5 to switch modes', 3200);
          requestAnimationFrame(frame);
        }
      }, 1500);
    })
    .catch(err => fail(
      err && err.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow access and reload.'
        : 'Camera error: ' + (err && err.message ? err.message : err)
    ));
}

async function start() {
  Theme.init();
  buildThemeBar();
  buildModeBar();
  lsMsg.textContent = 'Requesting camera access';
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
    initTracker();
  } catch (err) {
    fail(err && err.name === 'NotAllowedError'
      ? 'Camera permission denied. Allow access and reload.'
      : 'Camera error: ' + (err && err.message ? err.message : err));
  }
}

start();
