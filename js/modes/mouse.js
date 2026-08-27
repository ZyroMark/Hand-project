/* CURSOR: the original mouse control, moved onto the shared hand state.
   Needs server.py running locally on ws://localhost:8765. */

import { CFG } from '../config.js';
import { TIP, clamp } from '../hand.js';
import { drawCircle, drawText, drawPanel } from '../fx.js';
import { Theme, shade, alpha } from '../theme.js';
import { Sound } from '../audio.js';

const M = CFG.mouse;

/* An HTTPS page is not allowed to open an insecure websocket, so on a deployed
   build we skip the attempt entirely and say so rather than retrying forever. */
const INSECURE_BLOCKED = location.protocol === 'https:';

class MouseLink {
  constructor() {
    this.ws = null;
    this.ready = false;
    this.queue = [];
    this.screenW = 1920;
    this.screenH = 1080;
    this.blocked = INSECURE_BLOCKED;
    this.attempts = 0;
  }

  connect() {
    if (this.blocked || this.ws) return;
    try {
      this.ws = new WebSocket('ws://localhost:8765');
    } catch (err) {
      this.ws = null;
      return;
    }

    this.ws.onopen = () => {
      this.ready = true;
      this.attempts = 0;
      this.queue.forEach(m => this.ws.send(m));
      this.queue.length = 0;
    };

    this.ws.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'screen') { this.screenW = d.w; this.screenH = d.h; }
      } catch (err) { /* ignore malformed frames */ }
    };

    this.ws.onclose = () => {
      this.ready = false;
      this.ws = null;
      this.attempts++;
      setTimeout(() => this.connect(), Math.min(8000, 1500 * this.attempts));
    };

    this.ws.onerror = () => { if (this.ws) this.ws.close(); };
  }

  send(obj) {
    if (this.blocked) return;
    const msg = JSON.stringify(obj);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(msg);
    else if (this.queue.length < 20) this.queue.push(msg);
  }
}

const link = new MouseLink();

/** Trim the camera edges then rescale, so a wrist near the frame edge does not
    throw the cursor into a corner. */
function remap(v) {
  return clamp((v - M.cursorMargin) / (1 - 2 * M.cursorMargin), 0, 1);
}

export const MouseMode = {
  id:   'cursor',
  name: 'CURSOR',
  icon: '+',
  blurb: 'Drive the real system cursor. Needs server.py running locally.',
  help: [
    'Point with your index finger to move the cursor',
    'Index and middle up scrolls, move your hand up or down',
    'Quick pinch clicks, hold the pinch to right click',
    'Hold and move while pinched to drag',
    'Needs server.py running, this cannot work on the hosted demo',
  ],

  cursorX: 0, cursorY: 0,
  pinching: false, pinchStart: 0, rightClickSent: false, lastClick: 0,
  scrollAnchor: null, scrollAccum: 0,
  label: 'IDLE',
  _lastSentX: 0, _lastSentY: 0,

  enter() { link.connect(); },
  exit()  { if (this.pinching) { link.send({ action: 'mouseup' }); this.pinching = false; } },

  onKey() { return false; },

  update(app, hands, dt) {
    const h = hands.find(x => x.seen);
    if (!h) { this.label = 'NO HAND'; this._releaseScroll(); return; }

    const now = performance.now();
    const g = h.gesture;
    let label = 'IDLE';

    if (g === 'PINCH')      label = this.pinching ? 'DRAG' : 'CLICK';
    else if (g === 'POINT') label = 'CURSOR';
    else if (g === 'PEACE') label = 'SCROLL';
    else if (g === 'OPEN')  label = 'OPEN';
    else if (g === 'FIST')  label = 'FIST';

    const tip = TIP[1];
    const nx = remap(1 - h.lm[tip].x);
    const ny = remap(h.lm[tip].y);

    if (label === 'CURSOR' || label === 'SCROLL' || label === 'OPEN' || this.pinching) {
      const s = M.cursorSmoothing;
      this.cursorX = this.cursorX * s + (nx * link.screenW) * (1 - s);
      this.cursorY = this.cursorY * s + (ny * link.screenH) * (1 - s);

      if (Math.abs(this.cursorX - this._lastSentX) > 1 ||
          Math.abs(this.cursorY - this._lastSentY) > 1) {
        link.send({ action: 'move', x: Math.round(this.cursorX), y: Math.round(this.cursorY) });
        this._lastSentX = this.cursorX;
        this._lastSentY = this.cursorY;
      }
    }

    if (label === 'SCROLL') this._scroll(h, link);
    else this._releaseScroll();

    this._pinch(h, now, app);

    this.label = this.rightClickSent ? 'RIGHT CLICK' : label;
  },

  _scroll(h, lnk) {
    const y = h.lm[TIP[1]].y;
    if (this.scrollAnchor === null) { this.scrollAnchor = y; this.scrollAccum = 0; return; }
    this.scrollAccum += (this.scrollAnchor - y) * lnk.screenH;
    const ticks = Math.trunc(this.scrollAccum / M.scrollSensitivity);
    if (ticks !== 0) {
      lnk.send({ action: 'scroll', amount: ticks });
      this.scrollAccum -= ticks * M.scrollSensitivity;
      this.scrollAnchor = y;
    }
  },

  _releaseScroll() { this.scrollAnchor = null; this.scrollAccum = 0; },

  _pinch(h, now, app) {
    const active = h.pinch.active;

    if (active && !this.pinching) {
      this.pinching = true;
      this.pinchStart = now;
      this.rightClickSent = false;
      link.send({ action: 'mousedown' });
      Sound.blip();
    }

    if (this.pinching && !this.rightClickSent && now - this.pinchStart > M.rightClickHold) {
      link.send({ action: 'mouseup' });
      link.send({ action: 'rightclick' });
      this.rightClickSent = true;
      Sound.correct();
    }

    if (!active && this.pinching) {
      this.pinching = false;
      if (!this.rightClickSent) {
        const held = now - this.pinchStart;
        link.send({ action: 'mouseup' });
        if (held < 600 && now - this.lastClick > M.clickCooldown) {
          link.send({ action: 'click' });
          this.lastClick = now;
          Sound.blip();
        }
      }
      this.rightClickSent = false;
    }
  },

  draw(ctx, app) {
    for (const h of app.hands) {
      if (!h.seen) continue;
      const tip = TIP[1];
      const col = h.pinch.active ? Theme.c.accent2 : Theme.c.accent;
      drawCircle(ctx, h.px[tip], h.py[tip], 10 + h.pinch.strength * 8, col, 2, 20);
      // Pinch gap ring
      const mx = (h.px[4] + h.px[8]) / 2, my = (h.py[4] + h.py[8]) / 2;
      const gap = Math.hypot(h.px[4] - h.px[8], h.py[4] - h.py[8]) / 2;
      drawCircle(ctx, mx, my, Math.max(6, gap), col, h.pinch.active ? 3 : 1.5,
                 h.pinch.active ? 26 : 10);
    }

    // Status pill
    const cx = app.w / 2, cy = app.h - 54;
    if (link.blocked) {
      drawPanel(ctx, cx - 210, cy - 22, 420, 44, Theme.c.danger);
      drawText(ctx, 'HOSTED DEMO CANNOT REACH server.py', cx, cy,
               Theme.c.danger, '600 12px ' + Theme.fmono);
      return;
    }
    if (!link.ready) {
      drawPanel(ctx, cx - 180, cy - 22, 360, 44, Theme.c.danger);
      drawText(ctx, 'SERVER OFFLINE  ·  run  py server.py', cx, cy,
               Theme.c.danger, '600 12px ' + Theme.fmono);
      return;
    }

    const col = this.label === 'CLICK' || this.label === 'DRAG' ? Theme.c.accent2
              : this.label === 'SCROLL' ? Theme.c.info
              : this.label === 'RIGHT CLICK' ? Theme.c.danger : Theme.c.accent;
    drawPanel(ctx, cx - 110, cy - 22, 220, 44, col);
    drawText(ctx, this.label, cx, cy, col, '600 15px ' + Theme.fmono);

    const w = 200, x = app.w - w - 18, y = 18;
    drawPanel(ctx, x, y, w, 62, Theme.c.accent);
    drawText(ctx, 'SCREEN', x + w / 2, y + 20, Theme.c.dim,
             '600 10px ' + Theme.fmono);
    drawText(ctx, link.screenW + ' x ' + link.screenH, x + w / 2, y + 42,
             Theme.c.ink, '600 14px ' + Theme.fmono);
  },
};
