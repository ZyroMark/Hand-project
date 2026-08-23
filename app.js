/* ─────────────────────────────────────────────────────────────
   Neon Hand Aura  ·  app.js
   Hand tracking + gesture-based mouse control
   Requires: server.py running on ws://localhost:8765
   ───────────────────────────────────────────────────────────── */

// ── DOM ───────────────────────────────────────────────────────
const video      = document.getElementById('webcam');
const canvas     = document.getElementById('overlay');
const ctx        = canvas.getContext('2d');
const loadScreen = document.getElementById('loading-screen');
const lsMsg      = document.getElementById('ls-message');
const hudHands   = document.getElementById('hud-hands');
const hudConf    = document.getElementById('hud-conf');
const hudFps     = document.getElementById('hud-fps');
const hudHanded  = document.getElementById('hud-handedness');
const hudSignal  = document.getElementById('hud-signal');

// ── Config ─────────────────────────────────────────────────────
const CFG = {
  trailLength:    8,
  trailDecay:     0.72,
  glowBlur:       18,
  lineWidth:      2.5,
  glowLineWidth:  9,
  rainbowSpeed:   0.7,
  smoothing:      0.3,
  dotRadius:      4,
  motionBlur:     0.22,

  // Gesture thresholds
  pinchThresh:    0.055,   // normalised dist — tune lower if too sensitive
  pinchRelease:   0.08,
  clickCooldown:  500,     // ms between clicks
  rightClickHold: 800,     // ms to hold pinch for right-click
  scrollSensitivity: 12,   // pixels of finger movement per scroll tick
  cursorSmoothing: 0.22,   // 0=instant, 1=frozen
  cursorMargin:   0.05,    // trim camera edges (avoids wrist-off-screen jitter)
};

// ── MediaPipe skeleton ─────────────────────────────────────────
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];
const OUTLINE = [0,1,2,3,4,8,12,16,20,19,18,17,0];

// Finger tip / pip landmark indices
const TIP = [4, 8, 12, 16, 20];
const PIP = [2, 6, 10, 14, 18];

// ── Offscreen glow canvas ──────────────────────────────────────
let glowCanvas, glowCtx;
function buildGlowCanvas() {
  glowCanvas        = document.createElement('canvas');
  glowCanvas.width  = canvas.width;
  glowCanvas.height = canvas.height;
  glowCtx           = glowCanvas.getContext('2d');
  glowCtx.lineCap   = 'round';
  glowCtx.lineJoin  = 'round';
}

// ── State ──────────────────────────────────────────────────────
let smoothed    = [];
let trails      = [];
let lastResults = null;
let colorShift  = 0;
let lastTime    = performance.now();
let frameCount  = 0;
let fps         = 0;

// ── Gesture state ──────────────────────────────────────────────
const GS = {
  mode:          'IDLE',    // IDLE | CURSOR | PINCH | SCROLL | DRAG
  cursorX:       0,
  cursorY:       0,
  screenW:       1920,
  screenH:       1080,
  pinching:      false,
  pinchStart:    0,         // timestamp when pinch began
  rightClickSent:false,
  lastClick:     0,
  scrollAnchorY: null,      // normalised Y when scroll mode started
  scrollAccum:   0,
  gestureLabel:  'IDLE',
  gestureAlpha:  0,
  wsReady:       false,
};

// ── WebSocket to Python server ─────────────────────────────────
let ws = null;
let wsPendingMsg = [];

function wsConnect() {
  ws = new WebSocket('ws://localhost:8765');

  ws.onopen = () => {
    GS.wsReady = true;
    console.log('[WS] Connected to mouse server');
    wsPendingMsg.forEach(m => ws.send(m));
    wsPendingMsg = [];
  };

  ws.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.type === 'screen') {
      GS.screenW = data.w;
      GS.screenH = data.h;
      console.log(`[WS] Screen: ${data.w}x${data.h}`);
    }
  };

  ws.onclose = () => {
    GS.wsReady = false;
    console.warn('[WS] Disconnected. Retrying in 2s…');
    setTimeout(wsConnect, 2000);
  };

  ws.onerror = () => ws.close();
}

function send(obj) {
  const msg = JSON.stringify(obj);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(msg);
  } else {
    wsPendingMsg.push(msg);
  }
}

// ── Gesture helpers ────────────────────────────────────────────
function dist2D(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** true if finger tip is above its PIP knuckle (finger extended) */
function fingerUp(lms, fingerIdx) {
  // fingerIdx: 0=thumb,1=index,2=middle,3=ring,4=pinky
  if (fingerIdx === 0) {
    // Thumb: compare x (mirrored camera, so tip.x > MCP.x when extended)
    return lms[4].x < lms[2].x;
  }
  return lms[TIP[fingerIdx]].y < lms[PIP[fingerIdx]].y;
}

/** Clamp + remap normalised value from [margin, 1-margin] → [0,1] */
function remap(v, margin = CFG.cursorMargin) {
  return Math.max(0, Math.min(1, (v - margin) / (1 - 2 * margin)));
}

// ── Gesture processor (called each frame, first hand only for mouse) ──
let _prevCursorX = 0, _prevCursorY = 0;

function processGestures(lms) {
  const now = performance.now();

  const up = [0,1,2,3,4].map(i => fingerUp(lms, i));
  // up[0]=thumb, up[1]=index, up[2]=middle, up[3]=ring, up[4]=pinky

  const pinchDist    = dist2D(lms[4], lms[8]);
  const isPinching   = pinchDist < CFG.pinchThresh;

  // ── Determine gesture mode ─────────────────────────────────
  let label = 'IDLE';

  const indexOnly   = up[1] && !up[2] && !up[3] && !up[4];
  const twoFingers  = up[1] && up[2] && !up[3] && !up[4];
  const allUp       = up[1] && up[2] && up[3] && up[4];
  const fist        = !up[1] && !up[2] && !up[3] && !up[4];

  if (isPinching) {
    label = GS.pinching ? 'DRAG' : 'CLICK';
  } else if (indexOnly) {
    label = 'CURSOR';
  } else if (twoFingers) {
    label = 'SCROLL';
  } else if (allUp) {
    label = 'OPEN';
  } else if (fist) {
    label = 'FIST';
  }

  GS.gestureLabel = label;

  // ── CURSOR — index fingertip drives the mouse ───────────────
  if (label === 'CURSOR' || label === 'SCROLL' || label === 'OPEN') {
    // Use index tip for cursor, mapped with margin clamp
    const nx = remap(1 - lms[8].x);   // mirrored
    const ny = remap(lms[8].y);

    // Exponential smooth
    const s = CFG.cursorSmoothing;
    GS.cursorX = GS.cursorX * s + (nx * GS.screenW) * (1 - s);
    GS.cursorY = GS.cursorY * s + (ny * GS.screenH) * (1 - s);

    if (Math.abs(GS.cursorX - _prevCursorX) > 1 ||
        Math.abs(GS.cursorY - _prevCursorY) > 1) {
      send({ action: 'move', x: Math.round(GS.cursorX), y: Math.round(GS.cursorY) });
      _prevCursorX = GS.cursorX;
      _prevCursorY = GS.cursorY;
    }
  }

  // ── SCROLL — index+middle drive scroll ─────────────────────
  if (label === 'SCROLL') {
    const curY = lms[8].y;
    if (GS.scrollAnchorY === null) {
      GS.scrollAnchorY = curY;
      GS.scrollAccum   = 0;
    } else {
      GS.scrollAccum += (GS.scrollAnchorY - curY) * GS.screenH;
      const ticks = Math.trunc(GS.scrollAccum / CFG.scrollSensitivity);
      if (ticks !== 0) {
        send({ action: 'scroll', amount: ticks });
        GS.scrollAccum -= ticks * CFG.scrollSensitivity;
        GS.scrollAnchorY = curY;
      }
    }
  } else {
    GS.scrollAnchorY = null;
    GS.scrollAccum   = 0;
  }

  // ── PINCH — click / drag / right-click ─────────────────────
  if (isPinching && !GS.pinching) {
    // Pinch just started
    GS.pinching       = true;
    GS.pinchStart     = now;
    GS.rightClickSent = false;
    send({ action: 'mousedown' });
  }

  if (GS.pinching) {
    const held = now - GS.pinchStart;

    // Still pinching — check for right-click hold
    if (!GS.rightClickSent && held > CFG.rightClickHold) {
      send({ action: 'mouseup' });
      send({ action: 'rightclick' });
      GS.rightClickSent = true;
      GS.gestureLabel   = 'RIGHT CLICK';
    }

    // Move cursor while dragging
    const nx = remap(1 - lms[8].x);
    const ny = remap(lms[8].y);
    GS.cursorX = GS.cursorX * CFG.cursorSmoothing + (nx * GS.screenW) * (1 - CFG.cursorSmoothing);
    GS.cursorY = GS.cursorY * CFG.cursorSmoothing + (ny * GS.screenH) * (1 - CFG.cursorSmoothing);
    send({ action: 'move', x: Math.round(GS.cursorX), y: Math.round(GS.cursorY) });
  }

  if (!isPinching && GS.pinching) {
    // Pinch released
    GS.pinching = false;
    if (!GS.rightClickSent) {
      const held = now - GS.pinchStart;
      send({ action: 'mouseup' });
      // Short tap = left click
      if (held < 600 && now - GS.lastClick > CFG.clickCooldown) {
        send({ action: 'click' });
        GS.lastClick = now;
      }
    }
    GS.rightClickSent = false;
  }

  // Fade gesture label alpha for display
  GS.gestureAlpha = Math.min(1, GS.gestureAlpha + 0.15);
}

// ── Draw gesture HUD overlay ───────────────────────────────────
const GESTURE_ICONS = {
  CURSOR:      '☝',
  CLICK:       '🤏',
  DRAG:        '✊',
  SCROLL:      '✌',
  OPEN:        '✋',
  FIST:        '✊',
  IDLE:        '·',
  'RIGHT CLICK':'🖱',
};

function drawGestureHUD() {
  if (!GS.wsReady) {
    ctx.save();
    ctx.font         = 'bold 12px Orbitron, monospace';
    ctx.fillStyle    = 'rgba(255,60,110,0.85)';
    ctx.textAlign    = 'center';
    ctx.shadowColor  = '#ff3c6e';
    ctx.shadowBlur   = 10;
    ctx.fillText('⚡ server offline — run server.py', canvas.width / 2, canvas.height - 20);
    ctx.restore();
    return;
  }

  const label = GS.gestureLabel;
  const icon  = GESTURE_ICONS[label] || '·';
  const cx2   = canvas.width / 2;
  const cy2   = canvas.height - 50;

  ctx.save();
  ctx.globalAlpha = GS.gestureAlpha;
  ctx.textAlign   = 'center';
  ctx.shadowBlur  = 20;

  // Background pill
  const tw = 180;
  ctx.fillStyle   = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(cx2 - tw / 2, cy2 - 28, tw, 40, 20);
  ctx.fill();

  // Coloured border
  const borderCol = label === 'CLICK' || label === 'DRAG' ? '#ff00ff' :
                    label === 'SCROLL' ? '#00ccff' :
                    label === 'RIGHT CLICK' ? '#ff3c6e' : '#00ffc8';
  ctx.strokeStyle = borderCol;
  ctx.shadowColor = borderCol;
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // Icon + label
  ctx.font      = '20px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(icon, cx2 - 55, cy2 + 6);
  ctx.font        = 'bold 13px Orbitron, monospace';
  ctx.fillStyle   = borderCol;
  ctx.shadowColor = borderCol;
  ctx.fillText(label, cx2 + 20, cy2 + 6);

  ctx.restore();
}

// ── Resize ────────────────────────────────────────────────────
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  buildGlowCanvas();
}
window.addEventListener('resize', resize);
resize();

// ── Colour helpers ─────────────────────────────────────────────
function hsl(h, s = 100, l = 65) {
  return `hsl(${(h + 720) % 360},${s}%,${l}%)`;
}

// ── Pre-alloc pixel buffers ────────────────────────────────────
const px = new Float32Array(21);
const py = new Float32Array(21);
function computePixels(lms) {
  const W = canvas.width, H = canvas.height;
  for (let i = 0; i < 21; i++) {
    px[i] = (1 - lms[i].x) * W;
    py[i] =  lms[i].y * H;
  }
}

// ── Lerp landmarks in-place ────────────────────────────────────
function lerpLandmarks(prev, next) {
  const t = 1 - CFG.smoothing;
  for (let i = 0; i < next.length; i++) {
    prev[i].x += (next[i].x - prev[i].x) * t;
    prev[i].y += (next[i].y - prev[i].y) * t;
  }
  return prev;
}

// ── Draw functions (same optimised approach as before) ─────────
function drawGlowLayer(hueBase) {
  const g = glowCtx;
  g.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
  g.lineWidth  = CFG.glowLineWidth;
  g.shadowBlur = CFG.glowBlur;
  g.globalAlpha = 0.55;
  CONNECTIONS.forEach(([a, b], i) => {
    const col = hsl((hueBase + i * 15) % 360);
    g.beginPath(); g.moveTo(px[a], py[a]); g.lineTo(px[b], py[b]);
    g.strokeStyle = col; g.shadowColor = col; g.stroke();
  });
}

function drawCoreLines(hueBase) {
  ctx.shadowBlur = 0; ctx.lineWidth = CFG.lineWidth; ctx.globalAlpha = 1;
  CONNECTIONS.forEach(([a, b], i) => {
    ctx.beginPath(); ctx.moveTo(px[a], py[a]); ctx.lineTo(px[b], py[b]);
    ctx.strokeStyle = hsl((hueBase + i * 15) % 360, 100, 80);
    ctx.stroke();
  });
}

function drawOutline(hueBase, target, alpha, lw) {
  target.beginPath();
  target.moveTo(px[OUTLINE[0]], py[OUTLINE[0]]);
  for (let k = 1; k < OUTLINE.length; k++) target.lineTo(px[OUTLINE[k]], py[OUTLINE[k]]);
  target.closePath();
  target.strokeStyle = hsl((hueBase + 60) % 360, 100, 80);
  target.lineWidth   = lw;
  target.globalAlpha = alpha;
  target.stroke();
}

function drawDots(hueBase) {
  ctx.shadowBlur = 14; ctx.globalAlpha = 1; ctx.lineWidth = 1;
  for (let i = 0; i < 21; i++) {
    const col = hsl((hueBase + i * 17) % 360);
    ctx.beginPath(); ctx.arc(px[i], py[i], CFG.dotRadius, 0, 6.2832);
    ctx.fillStyle = '#fff'; ctx.shadowColor = col; ctx.fill();
    ctx.beginPath(); ctx.arc(px[i], py[i], CFG.dotRadius + 3, 0, 6.2832);
    ctx.strokeStyle = col; ctx.globalAlpha = 0.65; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
}

function drawTrail(trail, hueBase) {
  ctx.shadowBlur = 0;
  const n = trail.length;
  for (let f = 0; f < n; f++) {
    const lms = trail[f];
    ctx.globalAlpha = Math.pow(CFG.trailDecay, n - f) * 0.5;
    ctx.lineWidth   = CFG.lineWidth * ((f + 1) / n);
    const W = canvas.width, H = canvas.height;
    CONNECTIONS.forEach(([a, b], i) => {
      ctx.beginPath();
      ctx.moveTo((1 - lms[a].x) * W, lms[a].y * H);
      ctx.lineTo((1 - lms[b].x) * W, lms[b].y * H);
      ctx.strokeStyle = hsl((hueBase + i * 15 + f * 9) % 360, 100, 70);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
}

// ── Pinch visualiser — glowing ring between thumb+index ────────
function drawPinchIndicator(lms, hueBase) {
  const tx = px[4], ty = py[4];
  const ix = px[8], iy = py[8];
  const mx = (tx + ix) / 2, my = (ty + iy) / 2;
  const d  = Math.hypot(tx - ix, ty - iy);

  const isPinching = dist2D(lms[4], lms[8]) < CFG.pinchThresh;
  const hue = isPinching ? 300 : (hueBase + 60) % 360;
  const r   = Math.max(6, d / 2);

  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, 6.2832);
  ctx.strokeStyle = hsl(hue, 100, isPinching ? 80 : 60);
  ctx.lineWidth   = isPinching ? 3 : 1.5;
  ctx.shadowColor = hsl(hue);
  ctx.shadowBlur  = isPinching ? 30 : 10;
  ctx.globalAlpha = isPinching ? 1 : 0.5;
  ctx.stroke();
  ctx.restore();
}

// ── Render loop ────────────────────────────────────────────────
function render() {
  requestAnimationFrame(render);

  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    fps = frameCount; frameCount = 0; lastTime = now;
    hudFps.textContent = fps;
  }

  colorShift = (colorShift + CFG.rainbowSpeed) % 360;

  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = CFG.motionBlur;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;

  // Gesture HUD (drawn even with no hands)
  drawGestureHUD();

  if (!lastResults?.multiHandLandmarks) return;

  const hands     = lastResults.multiHandLandmarks;
  const handedness = lastResults.multiHandedness || [];

  hudHands.textContent = hands.length;
  if (!hands.length) {
    hudConf.textContent   = '—'; hudHanded.textContent = '—';
    hudSignal.style.width = '0%';
    GS.gestureLabel = 'IDLE';
  } else {
    const avg = handedness.reduce((s, h) => s + (h.score ?? 1), 0) / handedness.length;
    hudConf.textContent   = (avg * 100).toFixed(0) + '%';
    hudHanded.textContent = handedness.map(h => h.label ?? '?').join(' / ');
    hudSignal.style.width = (avg * 100).toFixed(0) + '%';
  }

  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  hands.forEach((rawLms, hi) => {
    const hueBase = (colorShift + hi * 140) % 360;

    if (!smoothed[hi]) smoothed[hi] = rawLms.map(l => ({ ...l }));
    else lerpLandmarks(smoothed[hi], rawLms);

    if (!trails[hi]) trails[hi] = [];
    trails[hi].push(smoothed[hi].map(l => ({ ...l })));
    if (trails[hi].length > CFG.trailLength) trails[hi].shift();

    computePixels(smoothed[hi]);

    // Gestures only on first (dominant) hand
    if (hi === 0) processGestures(smoothed[hi]);

    drawTrail(trails[hi], hueBase);

    drawGlowLayer(hueBase);
    drawOutline(hueBase, glowCtx, 0.4, 8);
    ctx.globalAlpha = 1;
    ctx.drawImage(glowCanvas, 0, 0);

    drawCoreLines(hueBase);
    drawOutline(hueBase, ctx, 0.85, 1.5);
    drawDots(hueBase);
    drawPinchIndicator(smoothed[hi], hueBase);
  });

  if (hands.length < smoothed.length) {
    smoothed.splice(hands.length);
    trails.splice(hands.length);
  }
}

// ── MediaPipe init ─────────────────────────────────────────────
function initMediaPipe() {
  const hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
  });
  hands.setOptions({
    maxNumHands:             2,
    modelComplexity:         0,
    minDetectionConfidence:  0.55,
    minTrackingConfidence:   0.5,
  });
  hands.onResults(r => { lastResults = r; });

  const camera = new Camera(video, {
    onFrame: async () => { await hands.send({ image: video }); },
    width: 640, height: 480,
  });

  camera.start()
    .then(() => {
      lsMsg.textContent = 'Model loading…';
      setTimeout(() => { loadScreen.classList.add('hidden'); render(); }, 1800);
    })
    .catch(err => showError(
      err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow access and reload.'
        : 'Camera error: ' + err.message
    ));
}

async function start() {
  lsMsg.textContent = 'Requesting camera access…';
  wsConnect();   // connect to mouse server in background
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
    initMediaPipe();
  } catch (err) {
    showError(err.name === 'NotAllowedError'
      ? 'Camera permission denied. Please allow access and reload.'
      : 'Camera error: ' + err.message);
  }
}

function showError(msg) {
  loadScreen.classList.add('error');
  document.querySelector('.ls-spinner').style.animation = 'none';
  document.querySelector('.ls-title').textContent = 'ERROR';
  lsMsg.textContent = msg;
}

window.addEventListener('DOMContentLoaded', start);
