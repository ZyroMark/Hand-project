/* SLICE: orbs arc up from the bottom, your fingertip is the blade.
   Cut the cyan orbs, chase the gold ones, and do not touch the red bombs.
   Both hands work at once, so you get two blades. */

import { CFG } from '../config.js';
import { TIP, segmentDist, clamp } from '../hand.js';
import { drawCircle, drawText, drawPanel, roundRect } from '../fx.js';
import { Theme, shade, alpha } from '../theme.js';
import { Sound } from '../audio.js';

const S = CFG.slice;

const TYPES = {
  orb:  { points: 1, r: 34, key: 'accent2' },
  gold: { points: 5, r: 30, key: 'gold' },
  bomb: { points: 0, r: 32, key: 'danger' },
};

/** Orb colours follow the theme, so a slice looks right in every palette. */
const orbColor = type => Theme.c[TYPES[type].key];

export const SliceMode = {
  id:   'slice',
  name: 'SLICE',
  icon: '/',
  blurb: 'Cut the orbs with your fingertip. Miss three and it is over.',
  help: [
    'Swipe your index fingertip through an orb to slice it',
    'The blade only cuts while your hand is actually moving',
    'Gold orbs are worth five, red bombs cost a life',
    'Letting an orb fall off the bottom also costs a life',
    'R restarts, or hold an open palm on the game over screen',
  ],

  orbs: [], halves: [], blades: [],
  score: 0, best: 0, lives: S.lives,
  combo: 0, comboUntil: 0, comboShow: 0,
  nextSpawn: 0, elapsed: 0, over: false,
  restartHold: 0,

  enter(app) {
    this.best = Number(localStorage.getItem('nha.sliceBest') || 0);
    this.reset(app);
  },

  exit() {},

  reset(app) {
    this.orbs = [];
    this.halves = [];
    this.blades = [[], []];
    this.score = 0;
    this.lives = S.lives;
    this.combo = 0;
    this.comboUntil = 0;
    this.comboShow = 0;
    this.elapsed = 0;
    this.nextSpawn = app.time + 0.8;
    this.over = false;
    this.restartHold = 0;
  },

  onKey(e, app) {
    if (e.key.toLowerCase() === 'r') { this.reset(app); Sound.blip(); return true; }
    return false;
  },

  get level() { return 1 + Math.floor(this.elapsed / 22); },

  update(app, hands, dt) {
    this._updateBlades(app, hands, dt);

    if (this.over) {
      this._updateGameOver(app, hands, dt);
      this._integrate(app, dt, true);
      return;
    }

    this.elapsed += dt;
    if (app.time >= this.nextSpawn) this._spawnWave(app);
    if (app.time > this.comboUntil) this.combo = 0;
    this.comboShow = Math.max(0, this.comboShow - dt);

    this._integrate(app, dt, false);
    this._testBlades(app);
  },

  _spawnWave(app) {
    const lvl  = this.level;
    const count = S.waveMin + Math.floor(Math.random() * (S.waveMax + Math.min(2, lvl - 1) - S.waveMin + 1));

    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      let type = 'orb';
      if (roll < S.bombChance + lvl * 0.012) type = 'bomb';
      else if (roll < S.bombChance + lvl * 0.012 + S.goldChance) type = 'gold';

      const spec = TYPES[type];
      const x = app.w * (0.12 + Math.random() * 0.76);
      // Aim high enough to hang around in the play area for a beat
      const peak = app.h * (0.18 + Math.random() * 0.3);
      const vy = -Math.sqrt(2 * S.gravity * (app.h - peak));

      this.orbs.push({
        x, y: app.h + spec.r + 10,
        vx: (app.w / 2 - x) * 0.35 + (Math.random() * 200 - 100),
        vy,
        r: spec.r * (0.9 + Math.random() * 0.25),
        type,
        rot: Math.random() * 6.28,
        rotV: (Math.random() * 2 - 1) * 3,
        sliced: false,
      });
    }

    const gap = Math.max(S.minSpawnEvery, S.spawnEvery - (lvl - 1) * 90) / 1000;
    this.nextSpawn = app.time + gap * (0.75 + Math.random() * 0.5);
  },

  _integrate(app, dt, frozen) {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      if (!frozen) {
        o.vy += S.gravity * dt;
        o.x  += o.vx * dt;
        o.y  += o.vy * dt;
        o.rot += o.rotV * dt;
      }
      // Off the bottom
      if (o.y - o.r > app.h + 40) {
        this.orbs.splice(i, 1);
        if (!frozen && o.type !== 'bomb') this._loseLife(app, 'MISSED');
      }
    }

    for (let i = this.halves.length - 1; i >= 0; i--) {
      const h = this.halves[i];
      h.vy += S.gravity * dt;
      h.x  += h.vx * dt;
      h.y  += h.vy * dt;
      h.rot += h.rotV * dt;
      h.life -= dt;
      if (h.life <= 0 || h.y - h.r > app.h + 60) this.halves.splice(i, 1);
    }
  },

  _updateBlades(app, hands, dt) {
    for (let i = 0; i < this.blades.length; i++) {
      const hand = hands[i];
      const trail = this.blades[i];

      if (!hand || !hand.seen) { trail.length = 0; continue; }

      const tip = TIP[1];
      const speed = hand.tipSpeed(1);
      const live = speed > S.minBladeSpeed;

      trail.push({ x: hand.px[tip], y: hand.py[tip], live, t: app.time });
      while (trail.length > S.bladeLength) trail.shift();
      // Drop stale points so a paused hand does not leave a stuck blade
      while (trail.length && app.time - trail[0].t > 0.25) trail.shift();
    }
  },

  _testBlades(app) {
    for (const trail of this.blades) {
      for (let i = 0; i + 1 < trail.length; i++) {
        const a = trail[i], b = trail[i + 1];
        if (!a.live && !b.live) continue;

        for (let k = this.orbs.length - 1; k >= 0; k--) {
          const o = this.orbs[k];
          if (o.sliced) continue;
          if (segmentDist(o.x, o.y, a.x, a.y, b.x, b.y) > o.r) continue;

          o.sliced = true;
          this.orbs.splice(k, 1);
          this._onSlice(app, o, b.x - a.x, b.y - a.y);
        }
      }
    }
  },

  _onSlice(app, o, dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len, ny = dy / len;

    if (o.type === 'bomb') {
      Sound.bomb();
      app.shake.kick(26);
      app.flash.fire(Theme.c.danger, 0.55);
      app.particles.burst(o.x, o.y, 46, {
        color: Theme.c.danger, speed: 620, life: 0.9, size: 5, gravity: 700, kind: 'spark',
      });
      this._loseLife(app, 'BOMB');
      this.combo = 0;
      return;
    }

    // Combo window
    this.combo = app.time <= this.comboUntil ? this.combo + 1 : 1;
    this.comboUntil = app.time + S.comboWindow / 1000;
    this.comboShow = 0.9;

    const base = TYPES[o.type].points;
    const gained = base * Math.max(1, this.combo);
    this.score += gained;

    if (o.type === 'gold') { Sound.gold(); app.flash.fire(Theme.c.gold, 0.16); }
    else Sound.slice(this.combo);

    app.shake.kick(o.type === 'gold' ? 8 : 4);
    app.particles.burst(o.x, o.y, o.type === 'gold' ? 30 : 18, {
      color: orbColor(o.type), speed: 380, life: 0.7, size: 4, gravity: 620, kind: 'spark',
    });

    // Two halves fly apart along the cut normal
    for (const side of [-1, 1]) {
      this.halves.push({
        x: o.x, y: o.y,
        vx: o.vx + (-ny * side) * 260,
        vy: o.vy * 0.4 + (nx * side) * 260 - 120,
        r: o.r, type: o.type, side,
        rot: Math.atan2(dy, dx),
        rotV: side * (2 + Math.random() * 3),
        life: 1.4,
      });
    }

    app.floatText(o.x, o.y, '+' + gained, orbColor(o.type));
  },

  _loseLife(app, why) {
    if (this.over) return;
    this.lives--;
    this.combo = 0;
    app.flash.fire(Theme.c.danger, 0.3);
    if (why === 'MISSED') Sound.wrong();

    if (this.lives <= 0) {
      this.over = true;
      this.restartHold = 0;
      if (this.score > this.best) {
        this.best = this.score;
        localStorage.setItem('nha.sliceBest', String(this.best));
      }
      Sound.gameOver();
    }
  },

  _updateGameOver(app, hands, dt) {
    // Hold an open palm to play again
    const open = hands.some(h => h.seen && h.gesture === 'OPEN');
    if (open) {
      this.restartHold += dt;
      if (this.restartHold > 1.5) { this.reset(app); Sound.fanfare(); }
    } else {
      this.restartHold = Math.max(0, this.restartHold - dt * 2);
    }
  },

  draw(ctx, app) {
    // Sliced halves
    for (const h of this.halves) {
      ctx.save();
      ctx.globalAlpha = clamp(h.life / 1.4, 0, 1);
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rot);
      ctx.beginPath();
      ctx.arc(0, 0, h.r, h.side > 0 ? 0 : Math.PI, h.side > 0 ? Math.PI : Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle   = alpha(orbColor(h.type), 0.72);
      ctx.strokeStyle = shade(orbColor(h.type), 0.3);
      ctx.shadowColor = orbColor(h.type);
      ctx.shadowBlur  = 18;
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Orbs
    for (const o of this.orbs) {
      const col = orbColor(o.type);
      const grad = ctx.createRadialGradient(
        o.x - o.r * 0.35, o.y - o.r * 0.35, o.r * 0.1, o.x, o.y, o.r);
      grad.addColorStop(0, shade(orbColor(o.type), o.type === 'bomb' ? 0.1 : 0.45));
      grad.addColorStop(1, shade(orbColor(o.type), o.type === 'bomb' ? -0.55 : -0.3));
      drawCircle(ctx, o.x, o.y, o.r, col, o.type === 'bomb' ? 3 : 2, 24, grad);

      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot);
      if (o.type === 'bomb') {
        drawText(ctx, 'X', 0, 0, Theme.c.ink, '600 22px ' + Theme.fmono);
        // Fuse spark
        ctx.strokeStyle = Theme.c.warn;
        ctx.shadowColor = Theme.c.warn;
        ctx.shadowBlur  = 14;
        ctx.lineWidth   = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -o.r);
        ctx.quadraticCurveTo(o.r * 0.4, -o.r * 1.5, o.r * 0.1, -o.r * 1.8);
        ctx.stroke();
      } else if (o.type === 'gold') {
        drawText(ctx, '5', 0, 0, Theme.c.ink, '600 20px ' + Theme.fmono);
      }
      ctx.restore();
    }

    this._drawBlades(ctx);
    this._drawHud(ctx, app);
    if (this.over) this._drawGameOver(ctx, app);
  },

  _drawBlades(ctx) {
    for (const trail of this.blades) {
      if (trail.length < 2) continue;
      ctx.save();
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i + 1 < trail.length; i++) {
        const a = trail[i], b = trail[i + 1];
        const t = (i + 1) / trail.length;
        const hot = a.live || b.live;
        ctx.globalAlpha = t * (hot ? 0.95 : 0.22);
        ctx.strokeStyle = hot ? Theme.c.ink : Theme.c.dim;
        ctx.shadowColor = hot ? Theme.c.accent : 'transparent';
        ctx.shadowBlur  = hot ? 22 : 0;
        ctx.lineWidth   = 2 + t * (hot ? 9 : 3);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  },

  _drawHud(ctx, app) {
    const w = 230, x = app.w - w - 18, y = 18;
    drawPanel(ctx, x, y, w, 104, Theme.c.accent);

    drawText(ctx, 'SCORE', x + 14, y + 20, Theme.c.dim,
             '600 10px ' + Theme.fmono, 'left');
    drawText(ctx, String(this.score), x + 14, y + 46, Theme.c.ink,
             '600 26px ' + Theme.fmono, 'left');
    drawText(ctx, 'best ' + this.best, x + 14, y + 70, Theme.c.dim,
             '11px ' + Theme.fmono, 'left');
    drawText(ctx, 'level ' + this.level, x + 14, y + 88, Theme.c.dim,
             '11px ' + Theme.fmono, 'left');

    // Lives
    for (let i = 0; i < S.lives; i++) {
      const cx = x + w - 22 - i * 24, cy = y + 26;
      const alive = i < this.lives;
      ctx.save();
      ctx.globalAlpha = alive ? 1 : 0.22;
      drawCircle(ctx, cx, cy, 8, alive ? Theme.c.danger : Theme.c.faint, 2, alive ? 16 : 0,
                 alive ? Theme.c.danger : 'transparent');
      ctx.restore();
    }

    if (this.comboShow > 0 && this.combo > 1) {
      ctx.save();
      ctx.globalAlpha = clamp(this.comboShow / 0.9, 0, 1);
      drawText(ctx, this.combo + 'x COMBO', app.w / 2, app.h * 0.18,
               Theme.c.accent2, '600 30px ' + Theme.fmono);
      ctx.restore();
    }
  },

  _drawGameOver(ctx, app) {
    ctx.save();
    ctx.fillStyle = Theme.c.overlay;
    ctx.fillRect(0, 0, app.w, app.h);
    ctx.restore();

    const cx = app.w / 2, cy = app.h / 2;
    drawText(ctx, 'GAME OVER', cx, cy - 74, Theme.c.danger, '600 46px ' + Theme.fmono);
    drawText(ctx, 'SCORE  ' + this.score, cx, cy - 18, Theme.c.ink, '600 26px ' + Theme.fmono);
    drawText(ctx, 'BEST  ' + this.best, cx, cy + 14, Theme.c.dim,
             '15px ' + Theme.fmono);
    drawText(ctx, 'hold an open palm to play again, or press R', cx, cy + 54,
             Theme.c.dim, '12px ' + Theme.fmono);

    // Restart hold progress
    const bw = 240, bx = cx - bw / 2, by = cy + 76;
    ctx.save();
    ctx.strokeStyle = Theme.c.faint;
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, 8, 4);
    ctx.stroke();
    const p = clamp(this.restartHold / 1.5, 0, 1);
    if (p > 0) {
      ctx.fillStyle   = Theme.c.accent;
      ctx.shadowColor = Theme.c.accent;
      ctx.shadowBlur  = 14;
      roundRect(ctx, bx, by, bw * p, 8, 4);
      ctx.fill();
    }
    ctx.restore();
  },
};
