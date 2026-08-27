/* PAINT: draw in the air. Pinch to lay down a line, the harder you pinch the
   thicker it gets. Colour walks around the wheel as you draw, so a single
   stroke ends up as a gradient. */

import { CFG } from '../config.js';
import { TIP, segmentDist, clamp } from '../hand.js';
import { drawCircle, drawText, drawPanel } from '../fx.js';
import { Theme, shade, alpha } from '../theme.js';
import { Sound } from '../audio.js';

const PT = CFG.paint;

export const PaintMode = {
  id:   'paint',
  name: 'PAINT',
  icon: '~',
  blurb: 'Pinch to draw in the air. Peace sign erases, open palm wipes.',
  help: [
    'Pinch thumb and index to draw, pinch tighter for a fatter line',
    'Peace sign erases strokes you pass through',
    'Hold an open palm for a second to wipe the canvas',
    'Z undoes, C clears, S saves a PNG, [ and ] change the base size',
  ],

  strokes: [],
  active: [null, null],     // in progress stroke per hand
  clearHold: 0,
  phase: 0,
  baseWidth: 12,
  savedNote: 0,

  enter() { this.clearHold = 0; },
  exit()  { this.active = [null, null]; },

  onKey(e, app) {
    const k = e.key.toLowerCase();
    if (k === 'z') { this.strokes.pop(); Sound.blip(); return true; }
    if (k === 'c') { this.strokes = []; this.active = [null, null]; Sound.wrong(); return true; }
    if (k === 's') { this._save(app); return true; }
    if (e.key === '[') { this.baseWidth = clamp(this.baseWidth - 2, 4, 40); app.toast('Brush ' + this.baseWidth); return true; }
    if (e.key === ']') { this.baseWidth = clamp(this.baseWidth + 2, 4, 40); app.toast('Brush ' + this.baseWidth); return true; }
    return false;
  },

  update(app, hands, dt) {
    this.phase = (this.phase + 0.16 * dt) % 1;
    this.savedNote = Math.max(0, this.savedNote - dt);

    for (let i = 0; i < 2; i++) {
      const h = hands[i];
      if (!h || !h.seen) { this.active[i] = null; continue; }

      if (h.pinch.active) {
        this._draw(h, i);
      } else {
        if (this.active[i] && this.active[i].pts.length < 2) {
          // A stray tap with no movement is not worth keeping
          this.strokes.pop();
        }
        this.active[i] = null;
      }

      if (h.gesture === 'PEACE') this._erase(h);
    }

    this._handleClear(app, hands, dt);
  },

  _draw(h, slot) {
    const tip = TIP[1];                     // index fingertip
    const pxv = h.px[tip], pyv = h.py[tip];
    const width = this.baseWidth * (0.45 + h.pinch.strength * 1.15);

    if (!this.active[slot]) {
      const stroke = { pts: [] };
      this.strokes.push(stroke);
      if (this.strokes.length > PT.maxStrokes) this.strokes.shift();
      this.active[slot] = stroke;
      Sound.blip();
    }

    const s = this.active[slot];
    const last = s.pts[s.pts.length - 1];
    // Skip points that barely moved, keeps the geometry light
    if (last && Math.hypot(pxv - last.x, pyv - last.y) < 2.5) return;
    s.pts.push({ x: pxv, y: pyv, c: Theme.rampAt(this.phase), w: clamp(width, PT.minWidth, PT.maxWidth) });
  },

  _erase(h) {
    const ex = (h.px[TIP[1]] + h.px[TIP[2]]) * 0.5;
    const ey = (h.py[TIP[1]] + h.py[TIP[2]]) * 0.5;
    const R = 34;

    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const pts = this.strokes[i].pts;
      let hit = false;
      for (let k = 0; k + 1 < pts.length; k++) {
        if (segmentDist(ex, ey, pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y) < R) {
          hit = true; break;
        }
      }
      if (!hit && pts.length === 1 && Math.hypot(pts[0].x - ex, pts[0].y - ey) < R) hit = true;
      if (hit) { this.strokes.splice(i, 1); Sound.blip(); }
    }
    this._eraseCursor = { x: ex, y: ey, r: R };
  },

  _handleClear(app, hands, dt) {
    const open = hands.find(h => h.seen && h.gesture === 'OPEN');
    if (open && this.strokes.length) {
      this.clearHold += dt;
      this._clearAt = { x: open.palm.x, y: open.palm.y };
      if (this.clearHold >= PT.clearHold / 1000) {
        this.strokes = [];
        this.active = [null, null];
        this.clearHold = 0;
        Sound.wrong();
        app.particles.burst(this._clearAt.x, this._clearAt.y, 40,
          { color: Theme.c.accent, speed: 520, life: 0.8, gravity: 0, kind: 'spark' });
        app.toast('Canvas cleared');
      }
    } else {
      this.clearHold = Math.max(0, this.clearHold - dt * 2.5);
    }
  },

  _save(app) {
    const c = document.createElement('canvas');
    c.width = app.w; c.height = app.h;
    const g = c.getContext('2d');
    g.fillStyle = Theme.c.panel;
    g.fillRect(0, 0, c.width, c.height);
    this._paintStrokes(g);

    c.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hand-aura-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
    this.savedNote = 2;
    Sound.correct();
  },

  _paintStrokes(ctx) {
    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    for (const s of this.strokes) {
      const pts = s.pts;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, pts[0].w / 2, 0, Math.PI * 2);
        ctx.fillStyle   = pts[0].c;
        ctx.shadowColor = pts[0].c;
        ctx.shadowBlur  = 20;
        ctx.fill();
        continue;
      }
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        const col = a.c;
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur  = 18;
        ctx.lineWidth   = a.w;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  },

  draw(ctx, app) {
    this._paintStrokes(ctx);

    // Brush preview on any pinching hand
    for (const h of app.hands) {
      if (!h.seen) continue;
      const tip = TIP[1];
      if (h.pinch.active) {
        const w = this.baseWidth * (0.45 + h.pinch.strength * 1.15);
        drawCircle(ctx, h.px[tip], h.py[tip], w / 2 + 3, Theme.rampAt(this.phase), 1.5, 18);
      } else if (h.gesture === 'PEACE') {
        const ex = (h.px[TIP[1]] + h.px[TIP[2]]) * 0.5;
        const ey = (h.py[TIP[1]] + h.py[TIP[2]]) * 0.5;
        drawCircle(ctx, ex, ey, 34, Theme.c.danger, 1.5, 16);
        drawText(ctx, 'ERASE', ex, ey - 48, Theme.c.danger, '600 10px ' + Theme.fmono);
      } else {
        drawCircle(ctx, h.px[tip], h.py[tip], 5, Theme.c.dim, 1.5, 10);
      }
    }

    // Clear progress ring
    if (this.clearHold > 0.05 && this._clearAt) {
      const p = clamp(this.clearHold / (PT.clearHold / 1000), 0, 1);
      ctx.save();
      ctx.strokeStyle = Theme.c.danger;
      ctx.shadowColor = Theme.c.danger;
      ctx.shadowBlur  = 20;
      ctx.lineWidth   = 5;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.arc(this._clearAt.x, this._clearAt.y, 52, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      drawText(ctx, 'HOLD TO CLEAR', this._clearAt.x, this._clearAt.y - 74,
               Theme.c.danger, '600 11px ' + Theme.fmono);
    }

    // Stats
    const w = 200, x = app.w - w - 18, y = 18;
    drawPanel(ctx, x, y, w, 76, Theme.c.accent);
    drawText(ctx, 'STROKES', x + w / 2, y + 20, Theme.c.dim,
             '600 10px ' + Theme.fmono);
    drawText(ctx, String(this.strokes.length), x + w / 2, y + 44, Theme.c.ink,
             '600 22px ' + Theme.fmono);

    // Live colour chip
    ctx.save();
    ctx.fillStyle   = Theme.rampAt(this.phase);
    ctx.shadowColor = Theme.rampAt(this.phase);
    ctx.shadowBlur  = 14;
    ctx.fillRect(x + 16, y + 58, w - 32, 6);
    ctx.restore();

    if (this.savedNote > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(this.savedNote / 2, 0, 1);
      drawText(ctx, 'PNG SAVED', app.w / 2, app.h - 96, Theme.c.accent,
               '600 14px ' + Theme.fmono);
      ctx.restore();
    }
  },
};
