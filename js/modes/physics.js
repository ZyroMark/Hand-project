/* PHYSICS: balls that collide with the actual bones of your hand.
   Pinch to grab one, flick to throw it. Juggling a ball on your fingers
   without dropping it builds a streak. */

import { CFG } from '../config.js';
import { closestOnSegment, clamp } from '../hand.js';
import { drawCircle, drawText, drawPanel } from '../fx.js';
import { Theme, shade, alpha } from '../theme.js';
import { Sound } from '../audio.js';

const P = CFG.physics;

function makeBall(x, y, ci) {
  return {
    x, y,
    vx: (Math.random() * 2 - 1) * 260,
    vy: -140,
    r: P.ballRadius * (0.8 + Math.random() * 0.5),
    ci,                  // index into the theme palette
    held: null,          // which hand is holding it
    lastHandHit: -1,     // seconds on the app clock
    trail: [],
    spin: 0,
  };
}

export const PhysicsMode = {
  id:   'physics',
  name: 'PHYSICS',
  icon: '●',
  blurb: 'Bounce balls off your hands. Pinch to grab, flick to throw.',
  help: [
    'Open hand to bat the balls around',
    'Pinch near a ball to grab it, release to throw',
    'SPACE adds a ball, X removes one, R resets',
    'G toggles low gravity',
  ],

  balls: [],
  juggle: 0,
  best: 0,
  lowG: false,
  _bones: [],

  enter(app) {
    if (!this.balls.length) this.reset(app);
    this.best = Number(localStorage.getItem('nha.juggleBest') || 0);
  },

  exit() {},

  reset(app) {
    this.balls = [];
    for (let i = 0; i < P.startBalls; i++) {
      this.balls.push(makeBall(
        app.w * (0.3 + 0.4 * Math.random()),
        app.h * 0.3,
        i
      ));
    }
    this.juggle = 0;
  },

  onKey(e, app) {
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'b') {
      if (this.balls.length < P.maxBalls) {
        this.balls.push(makeBall(app.w * 0.5, app.h * 0.25, Math.floor(Math.random() * 5)));
        Sound.blip();
      }
      return true;
    }
    if (k === 'x') { this.balls.pop(); Sound.blip(); return true; }
    if (k === 'r') { this.reset(app); Sound.blip(); return true; }
    if (k === 'g') {
      this.lowG = !this.lowG;
      app.toast(this.lowG ? 'Low gravity on' : 'Gravity normal');
      return true;
    }
    return false;
  },

  update(app, hands, dt) {
    const g = (this.lowG ? P.gravity * 0.22 : P.gravity);

    // Collect every bone from every visible hand, once per frame
    this._bones.length = 0;
    for (const h of hands) {
      const bones = h.bones();
      for (const b of bones) this._bones.push(b);
    }

    this._handleGrabs(app, hands);

    for (const ball of this.balls) {
      if (ball.held) { this._carry(ball, dt); continue; }

      ball.vy += g * dt;
      ball.vx *= 1 - P.airDrag * dt;
      ball.vy *= 1 - P.airDrag * dt;
      ball.x  += ball.vx * dt;
      ball.y  += ball.vy * dt;
      ball.spin += ball.vx * dt * 0.01;

      this._walls(app, ball);
      this._bonesCollide(app, ball);

      ball.trail.push(ball.x, ball.y);
      if (ball.trail.length > 24) ball.trail.splice(0, 2);
    }

    this._ballsCollide();
  },

  _handleGrabs(app, hands) {
    for (const h of hands) {
      const p = h.pinch;

      if (p.active) {
        // Already holding something with this hand?
        const holding = this.balls.find(b => b.held === h);
        if (holding) continue;

        let best = null, bestD = P.grabRadius;
        for (const b of this.balls) {
          if (b.held) continue;
          const d = Math.hypot(b.x - p.x, b.y - p.y);
          if (d < bestD + b.r) { bestD = d; best = b; }
        }
        if (best) {
          best.held = h;
          best.trail.length = 0;
          Sound.grab();
          app.particles.burst(best.x, best.y, 10, { color: Theme.paletteAt(best.ci), speed: 160, life: 0.4, gravity: 0 });
        }
      } else {
        // Released: throw whatever this hand had
        for (const b of this.balls) {
          if (b.held !== h) continue;
          b.held = null;
          b.vx = clamp(p.vx * P.throwBoost, -3200, 3200);
          b.vy = clamp(p.vy * P.throwBoost, -3200, 3200);
          b.lastHandHit = app.time;
          Sound.release();
        }
      }
    }

    // If a hand vanished mid grab, drop the ball rather than freezing it
    for (const b of this.balls) {
      if (b.held && !b.held.seen) { b.held = null; b.vx = 0; b.vy = 0; }
    }
  },

  _carry(ball, dt) {
    const p = ball.held.pinch;
    ball.x = p.x;
    ball.y = p.y;
    ball.vx = p.vx;
    ball.vy = p.vy;
  },

  _walls(app, ball) {
    const e = P.wallRestitution;
    if (ball.x - ball.r < 0)      { ball.x = ball.r;         ball.vx = Math.abs(ball.vx) * e; }
    if (ball.x + ball.r > app.w)  { ball.x = app.w - ball.r; ball.vx = -Math.abs(ball.vx) * e; }
    if (ball.y - ball.r < 0)      { ball.y = ball.r;         ball.vy = Math.abs(ball.vy) * e; }

    if (ball.y + ball.r > app.h) {
      ball.y  = app.h - ball.r;
      ball.vy = -Math.abs(ball.vy) * e;
      ball.vx *= 0.92;
      if (Math.abs(ball.vy) > 150) {
        Sound.bounce(Math.abs(ball.vy));
        app.particles.burst(ball.x, app.h - 2, 6, {
          color: Theme.paletteAt(ball.ci), speed: 180, life: 0.35, vy: -120, gravity: 400,
        });
      }
      // Touching the floor ends the juggling streak
      if (this.juggle > 0) {
        if (this.juggle > this.best) {
          this.best = this.juggle;
          localStorage.setItem('nha.juggleBest', String(this.best));
          app.toast('New best streak: ' + this.best);
        }
        this.juggle = 0;
      }
    }
  },

  /* The interesting part: treat every bone as an immovable moving wall.
     Working with relative velocity means a fast hand transfers real energy. */
  _bonesCollide(app, ball) {
    const minD = ball.r + P.handThickness;

    for (const bone of this._bones) {
      const c = closestOnSegment(ball.x, ball.y, bone.ax, bone.ay, bone.bx, bone.by);
      let dx = ball.x - c.x, dy = ball.y - c.y;
      let d  = Math.hypot(dx, dy);
      if (d > minD) continue;

      if (d < 1e-4) { dx = 0; dy = -1; d = 1; }   // dead centre, push straight up
      const nx = dx / d, ny = dy / d;

      // Push out of the bone
      ball.x = c.x + nx * minD;
      ball.y = c.y + ny * minD;

      // Relative normal velocity
      const rvx = ball.vx - bone.vx;
      const rvy = ball.vy - bone.vy;
      const vn  = rvx * nx + rvy * ny;
      if (vn >= 0) continue;                       // already separating

      const j = -(1 + P.restitution) * vn;
      ball.vx += nx * j;
      ball.vy += ny * j;

      // A little extra punt in the direction the hand is travelling
      const handSpeed = Math.hypot(bone.vx, bone.vy);
      if (handSpeed > 60) {
        const s = Math.min(handSpeed, P.maxTransfer) * P.handTransfer * 0.35;
        ball.vx += (bone.vx / handSpeed) * s;
        ball.vy += (bone.vy / handSpeed) * s;
      }

      const impact = Math.abs(vn) + handSpeed * 0.4;
      Sound.bounce(impact);
      app.particles.burst(c.x, c.y, 7, {
        color: Theme.paletteAt(ball.ci), speed: 140 + impact * 0.15, life: 0.35, gravity: 200, kind: 'spark', size: 2.5,
      });
      app.shake.kick(Math.min(6, impact * 0.003));

      // Count a keep-up, with a short debounce so one touch is not counted twice
      if (app.time - ball.lastHandHit > 0.25) {
        this.juggle++;
        if (this.juggle % 5 === 0) Sound.correct();
      }
      ball.lastHandHit = app.time;
      break;      // one bone per frame keeps it stable
    }
  },

  _ballsCollide() {
    for (let i = 0; i < this.balls.length; i++) {
      const a = this.balls[i];
      if (a.held) continue;
      for (let k = i + 1; k < this.balls.length; k++) {
        const b = this.balls[k];
        if (b.held) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d  = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d >= min || d < 1e-4) continue;

        const nx = dx / d, ny = dy / d;
        const overlap = (min - d) * 0.5;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;

        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn >= 0) continue;
        const j = -(1 + P.restitution) * vn * 0.5;
        a.vx -= nx * j; a.vy -= ny * j;
        b.vx += nx * j; b.vy += ny * j;
      }
    }
  },

  draw(ctx, app) {
    // Trails
    ctx.save();
    ctx.lineCap = 'round';
    for (const ball of this.balls) {
      const t = ball.trail;
      for (let i = 0; i + 3 < t.length; i += 2) {
        const a = (i / t.length) * 0.5;
        ctx.globalAlpha = a;
        ctx.strokeStyle = Theme.paletteAt(ball.ci);
        ctx.lineWidth   = ball.r * 0.5 * (i / t.length);
        ctx.beginPath();
        ctx.moveTo(t[i], t[i + 1]);
        ctx.lineTo(t[i + 2], t[i + 3]);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Balls
    for (const ball of this.balls) {
      const col = Theme.paletteAt(ball.ci);
      const grad = ctx.createRadialGradient(
        ball.x - ball.r * 0.3, ball.y - ball.r * 0.3, ball.r * 0.1,
        ball.x, ball.y, ball.r
      );
      grad.addColorStop(0, shade(Theme.paletteAt(ball.ci), 0.45));
      grad.addColorStop(1, shade(Theme.paletteAt(ball.ci), -0.35));
      drawCircle(ctx, ball.x, ball.y, ball.r, col, ball.held ? 4 : 2, 26, grad);

      // Spin marker so you can see it rotate
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = shade(Theme.paletteAt(ball.ci), 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r * 0.55, ball.spin, ball.spin + 1.6);
      ctx.stroke();
      ctx.restore();

      if (ball.held) {
        drawCircle(ctx, ball.x, ball.y, ball.r + 12 + Math.sin(app.time * 10) * 3,
                   Theme.c.ink, 1.5, 20);
      }
    }

    // Grab hints on any pinching hand
    for (const h of app.hands) {
      if (!h.pinch.active) continue;
      drawCircle(ctx, h.pinch.x, h.pinch.y, P.grabRadius * 0.35, Theme.c.accent2, 2, 22);
    }

    // Stats
    const w = 210, x = app.w - w - 18, y = 18;
    drawPanel(ctx, x, y, w, 92, Theme.c.accent);
    drawText(ctx, 'KEEP-UPS', x + w / 2, y + 20, Theme.c.dim, '600 10px ' + Theme.fmono);
    drawText(ctx, String(this.juggle), x + w / 2, y + 46, Theme.c.ink, '600 28px ' + Theme.fmono);
    drawText(ctx, 'best ' + this.best + '   balls ' + this.balls.length,
             x + w / 2, y + 74, Theme.c.dim, '11px ' + Theme.fmono);

    if (this.lowG) {
      drawText(ctx, 'LOW GRAVITY', app.w / 2, 34, Theme.c.accent2, '600 12px ' + Theme.fmono);
    }
  },
};
