/* Shared drawing helpers, a particle pool, and screen shake.
   Every blur value is scaled by the active theme's `glow`, which is what makes
   the same drawing code read as flat and modern or as heavy neon. */

import { CFG } from './config.js';
import { CONNECTIONS, OUTLINE, clamp } from './hand.js';
import { Theme } from './theme.js';

/** Scale a blur by the theme, so a flat theme never renders a halo. */
const blurOf = b => (b === undefined ? 12 : b) * Theme.c.glow;

export function drawLine(ctx, x1, y1, x2, y2, color, width, blur) {
  ctx.save();
  ctx.strokeStyle = color || Theme.c.accent;
  ctx.shadowColor = color || Theme.c.accent;
  ctx.shadowBlur  = blurOf(blur);
  ctx.lineWidth   = (width === undefined ? 2 : width) * Theme.c.line;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

export function drawCircle(ctx, x, y, r, color, width, blur, fill) {
  const col = color || Theme.c.accent;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle   = fill;
    ctx.shadowColor = col;
    ctx.shadowBlur  = blurOf(blur === undefined ? 18 : blur);
    ctx.fill();
  }
  ctx.strokeStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = blurOf(blur === undefined ? 18 : blur);
  ctx.lineWidth   = (width === undefined ? 2 : width) * Theme.c.line;
  ctx.stroke();
  ctx.restore();
}

export function drawText(ctx, text, x, y, color, font, align, blur) {
  ctx.save();
  ctx.font         = font || ('600 14px ' + Theme.fmono);
  ctx.textAlign    = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = color || Theme.c.accent;
  ctx.shadowColor  = color || Theme.c.accent;
  ctx.shadowBlur   = blurOf(blur === undefined ? 14 : blur);
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

/** A surface panel. Flat themes get a hairline border, glowy ones get a halo. */
export function drawPanel(ctx, x, y, w, h, color, alpha) {
  const col = color || Theme.c.accent;
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;

  if (Theme.c.glow < 0.3) {
    // Modern themes: soft drop shadow instead of a coloured bloom
    ctx.shadowColor  = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur   = 24;
    ctx.shadowOffsetY = 6;
  }
  ctx.fillStyle = Theme.c.panel;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();

  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = Theme.c.glow < 0.3 ? Theme.c.hairline : col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = blurOf(16);
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.restore();
}

/* Hand skeleton, coloured along the theme ramp rather than a full rainbow */

export function drawSkeleton(ctx, hand, shift, opts) {
  const o = opts || {};
  const alpha = o.alpha === undefined ? 1 : o.alpha;
  const px = hand.px, py = hand.py;
  const n = CONNECTIONS.length;
  const glowy = Theme.c.glow > 0.3;

  ctx.save();
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';

  // Soft outer pass, only worth drawing when the theme actually glows
  if (glowy) {
    ctx.shadowBlur  = CFG.visual.glowBlur * Theme.c.glow;
    ctx.lineWidth   = CFG.visual.glowLineWidth;
    ctx.globalAlpha = alpha * 0.45;
    for (let i = 0; i < n; i++) {
      const a = CONNECTIONS[i][0], b = CONNECTIONS[i][1];
      const col = Theme.rampAt((i / n + shift) % 1);
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.beginPath();
      ctx.moveTo(px[a], py[a]);
      ctx.lineTo(px[b], py[b]);
      ctx.stroke();
    }
  }

  // Crisp core pass
  ctx.globalAlpha = alpha;
  ctx.shadowBlur  = glowy ? 0 : 0;
  ctx.lineWidth   = CFG.visual.lineWidth * Theme.c.line;
  for (let i = 0; i < n; i++) {
    const a = CONNECTIONS[i][0], b = CONNECTIONS[i][1];
    ctx.strokeStyle = Theme.rampAt((i / n + shift) % 1);
    ctx.beginPath();
    ctx.moveTo(px[a], py[a]);
    ctx.lineTo(px[b], py[b]);
    ctx.stroke();
  }

  if (o.outline !== false) {
    ctx.beginPath();
    ctx.moveTo(px[OUTLINE[0]], py[OUTLINE[0]]);
    for (let k = 1; k < OUTLINE.length; k++) ctx.lineTo(px[OUTLINE[k]], py[OUTLINE[k]]);
    ctx.closePath();
    ctx.strokeStyle = Theme.c.hairline;
    ctx.globalAlpha = alpha * 0.9;
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  if (o.dots !== false) {
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 21; i++) {
      const col = Theme.rampAt((i / 21 + shift) % 1);
      ctx.beginPath();
      ctx.arc(px[i], py[i], CFG.visual.dotRadius, 0, Math.PI * 2);
      ctx.fillStyle   = glowy ? Theme.c.ink : col;
      ctx.shadowColor = col;
      ctx.shadowBlur  = blurOf(14);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* Particle pool. Preallocated so a heavy slice combo does not churn the GC. */

export class Particles {
  constructor(max = 600) {
    this.max  = max;
    this.pool = new Array(max);
    for (let i = 0; i < max; i++) {
      this.pool[i] = { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1,
                       size: 3, color: '#fff', gravity: 0, kind: 'dot' };
    }
    this.cursor = 0;
  }

  spawn(x, y, opts) {
    const o = opts || {};
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    p.alive = true;
    p.x = x; p.y = y;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.max = p.life = o.life || 0.7;
    p.size    = o.size || 3;
    p.color   = o.color || Theme.c.accent;
    p.gravity = o.gravity === undefined ? 600 : o.gravity;
    p.kind    = o.kind || 'dot';
    return p;
  }

  burst(x, y, count, opts) {
    const o = opts || {};
    const speed = o.speed || 300;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.85);
      this.spawn(x, y, {
        vx: Math.cos(a) * s + (o.vx || 0),
        vy: Math.sin(a) * s + (o.vy || 0),
        life: (o.life || 0.7) * (0.6 + Math.random() * 0.7),
        size: (o.size || 3) * (0.5 + Math.random()),
        color: o.color,
        gravity: o.gravity,
        kind: o.kind,
      });
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vy += p.gravity * dt;
      p.vx *= 1 - 1.2 * dt;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
    }
  }

  draw(ctx) {
    ctx.save();
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      const t = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = t;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = blurOf(12) * t;
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth   = p.size * t;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  clear() {
    for (let i = 0; i < this.max; i++) this.pool[i].alive = false;
  }
}

/* Screen shake, applied as a canvas translate before a mode draws */

export class Shake {
  constructor() { this.amount = 0; this.x = 0; this.y = 0; }
  kick(a) { this.amount = Math.max(this.amount, a); }
  update(dt) {
    this.amount *= Math.pow(0.0015, dt);
    if (this.amount < 0.4) this.amount = 0;
    this.x = (Math.random() * 2 - 1) * this.amount;
    this.y = (Math.random() * 2 - 1) * this.amount;
  }
}

/* Full screen colour wash, for taking damage or scoring big */

export class Flash {
  constructor() { this.a = 0; this.color = '#ff0000'; }
  fire(color, a) { this.color = color; this.a = Math.max(this.a, a === undefined ? 0.5 : a); }
  update(dt) { this.a *= Math.pow(0.004, dt); if (this.a < 0.01) this.a = 0; }
  draw(ctx, w, h) {
    if (this.a <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.a;
    ctx.fillStyle = this.color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
