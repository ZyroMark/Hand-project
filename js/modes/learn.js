/* LEARN: three lessons that open up what the tracker is actually doing.
     1  the 21 landmarks, numbered and named
     2  live joint angles and how a finger is judged extended or curled
     3  a gesture trainer that quizzes you and times the run */

import { CFG } from '../config.js';
import { CHAINS, FINGER_NAMES, LANDMARK_LABELS, angleAt, clamp } from '../hand.js';
import { drawCircle, drawLine, drawText, drawPanel, roundRect } from '../fx.js';
import { Theme, shade, alpha } from '../theme.js';
import { Sound } from '../audio.js';


const CHALLENGES = [
  { name: 'Open palm',      hint: 'All five fingers straight',        test: h => h.gesture === 'OPEN' },
  { name: 'Closed fist',    hint: 'Curl every finger in',             test: h => h.gesture === 'FIST' },
  { name: 'Point',          hint: 'Index up, everything else down',   test: h => h.gesture === 'POINT' },
  { name: 'Peace sign',     hint: 'Index and middle up',              test: h => h.gesture === 'PEACE' },
  { name: 'Pinch',          hint: 'Touch thumb to index tip',         test: h => h.pinch.active },
  { name: 'Three fingers',  hint: 'Any three fingers extended',       test: h => h.fingerCount() === 3 },
  { name: 'Thumbs up',      hint: 'Thumb out, fingers curled',        test: h => h.gesture === 'THUMB' },
  { name: 'Pinky out',      hint: 'Only the little finger up',        test: h => h.gesture === 'PINKY' },
];

const HOLD_TIME = 0.7;

export const LearnMode = {
  id:   'learn',
  name: 'LEARN',
  icon: '?',
  blurb: 'See the 21 landmarks, the joint angles, then train the gestures.',
  help: [
    'LEFT and RIGHT arrows move between the three lessons',
    'Lesson 1 names every landmark the model returns',
    'Lesson 2 shows the joint angles that decide extended or curled',
    'Lesson 3 quizzes you, hold each pose until the ring fills',
    'R restarts the trainer',
  ],

  lesson: 0,
  lessonNames: ['LANDMARKS', 'JOINT ANGLES', 'GESTURE TRAINER'],

  // trainer state
  idx: 0, hold: 0, done: false, startedAt: 0, finishedIn: 0, bestTime: 0, celebrate: 0,

  enter(app) {
    this.bestTime = Number(localStorage.getItem('nha.trainBest') || 0);
    this._resetTrainer(app);
  },

  exit() {},

  _resetTrainer(app) {
    this.idx = 0;
    this.hold = 0;
    this.done = false;
    this.startedAt = app.time;
    this.celebrate = 0;
  },

  onKey(e, app) {
    if (e.key === 'ArrowRight') { this.lesson = (this.lesson + 1) % 3; Sound.blip(); return true; }
    if (e.key === 'ArrowLeft')  { this.lesson = (this.lesson + 2) % 3; Sound.blip(); return true; }
    const k = e.key.toLowerCase();
    if (k === 'r') { this._resetTrainer(app); Sound.blip(); return true; }
    return false;
  },

  update(app, hands, dt) {
    this.celebrate = Math.max(0, this.celebrate - dt);
    if (this.lesson !== 2 || this.done) return;

    const h = hands.find(x => x.seen);
    if (!h) { this.hold = Math.max(0, this.hold - dt); return; }

    const ch = CHALLENGES[this.idx];
    if (ch.test(h)) {
      this.hold += dt;
      if (this.hold >= HOLD_TIME) {
        this.hold = 0;
        this.idx++;
        app.particles.burst(h.palm.x, h.palm.y, 20,
          { color: Theme.c.success, speed: 320, life: 0.6, gravity: 0, kind: 'spark' });

        if (this.idx >= CHALLENGES.length) {
          this.done = true;
          this.finishedIn = app.time - this.startedAt;
          this.celebrate = 3;
          if (!this.bestTime || this.finishedIn < this.bestTime) {
            this.bestTime = this.finishedIn;
            localStorage.setItem('nha.trainBest', String(this.bestTime));
            app.toast('New best time');
          }
          Sound.fanfare();
        } else {
          Sound.correct();
        }
      }
    } else {
      this.hold = Math.max(0, this.hold - dt * 1.6);
    }
  },

  draw(ctx, app) {
    const hand = app.hands.find(h => h.seen);

    if (this.lesson === 0) this._drawLandmarks(ctx, app, hand);
    if (this.lesson === 1) this._drawAngles(ctx, app, hand);
    if (this.lesson === 2) this._drawTrainer(ctx, app, hand);

    this._drawLessonBar(ctx, app);

    if (!hand) {
      drawText(ctx, 'show a hand to the camera', app.w / 2, app.h * 0.5,
               Theme.c.faint, '14px ' + Theme.fmono);
    }
  },

  _drawLessonBar(ctx, app) {
    const w = 420, x = app.w / 2 - w / 2, y = 16;
    drawPanel(ctx, x, y, w, 40, Theme.c.accent, 0.92);
    for (let i = 0; i < 3; i++) {
      const cw = w / 3, cx = x + cw * i + cw / 2;
      const on = i === this.lesson;
      drawText(ctx, (i + 1) + '  ' + this.lessonNames[i], cx, y + 20,
               on ? Theme.c.ink : Theme.c.faint,
               (on ? 'bold ' : '') + '11px ' + Theme.fmono);
      if (on) {
        ctx.save();
        ctx.fillStyle   = Theme.c.accent;
        ctx.shadowColor = Theme.c.accent;
        ctx.shadowBlur  = 12;
        ctx.fillRect(cx - 34, y + 32, 68, 2);
        ctx.restore();
      }
    }
  },

  /* Lesson 1: every landmark index and its anatomical name */
  _drawLandmarks(ctx, app, h) {
    if (!h) return;

    for (let f = 0; f < 5; f++) {
      const chain = CHAINS[f];
            drawLine(ctx, h.px[0], h.py[0], h.px[chain[0]], h.py[chain[0]], Theme.paletteAt(f), 2, 10);
      for (let i = 0; i + 1 < chain.length; i++) {
        drawLine(ctx, h.px[chain[i]], h.py[chain[i]],
                      h.px[chain[i + 1]], h.py[chain[i + 1]], Theme.paletteAt(f), 3, 14);
      }
    }

    for (let i = 0; i < 21; i++) {
      const f = i === 0 ? -1 : Math.floor((i - 1) / 4);
            drawCircle(ctx, h.px[i], h.py[i], 11, f < 0 ? Theme.c.ink : Theme.paletteAt(f), 2, 14, Theme.c.overlay);
      drawText(ctx, String(i), h.px[i], h.py[i], Theme.c.ink, '600 10px ' + Theme.fmono, 'center', 6);
    }

    // Name the point nearest the index fingertip so the labels do not all overlap
    const focus = 8;
    drawText(ctx, LANDMARK_LABELS[focus] + '  ·  point ' + focus,
             h.px[focus], h.py[focus] - 30, Theme.c.ink, '600 12px ' + Theme.fmono);

    const bx = 18, by = app.h - 138, bw = 330;
    drawPanel(ctx, bx, by, bw, 120, Theme.c.accent);
    drawText(ctx, 'WHAT THE MODEL RETURNS', bx + 14, by + 20, Theme.c.accent,
             '600 11px ' + Theme.fmono, 'left');
    const lines = [
      'MediaPipe gives 21 points per hand.',
      'Point 0 is the wrist. Each finger adds four,',
      'running base to tip: mcp, pip, dip, tip.',
      'Every gesture in this app is just maths',
      'on these numbers.',
    ];
    lines.forEach((t, i) =>
      drawText(ctx, t, bx + 14, by + 44 + i * 16, Theme.c.dim,
               '11px ' + Theme.fbody, 'left', 0));
  },

  /* Lesson 2: the joint angles behind the extended / curled decision */
  _drawAngles(ctx, app, h) {
    if (!h) return;

    for (let f = 0; f < 5; f++) {
      const c = CHAINS[f];
      const j1 = angleAt(h.lm[c[0]], h.lm[c[1]], h.lm[c[2]]);
      const j2 = angleAt(h.lm[c[1]], h.lm[c[2]], h.lm[c[3]]);
      const up = h.fingers[f];
      const col = up ? Theme.c.success : Theme.c.danger;

      // Mark the two joints being measured
      [[c[1], j1], [c[2], j2]].forEach(pair => {
        const i = pair[0], deg = pair[1];
        drawCircle(ctx, h.px[i], h.py[i], 15, col, 2, 14, Theme.c.overlay);
        drawText(ctx, Math.round(deg) + '', h.px[i], h.py[i], Theme.c.ink,
                 '600 9px ' + Theme.fmono, 'center', 4);
      });

      for (let i = 0; i + 1 < c.length; i++) {
        drawLine(ctx, h.px[c[i]], h.py[c[i]], h.px[c[i + 1]], h.py[c[i + 1]], col, 2.5, 12);
      }
    }

    // Readout panel
    const pw = 330, px = 18, py = app.h - 214;
    drawPanel(ctx, px, py, pw, 196, Theme.c.accent);
    drawText(ctx, 'JOINT ANGLES', px + 14, py + 20, Theme.c.accent,
             '600 11px ' + Theme.fmono, 'left');

    for (let f = 0; f < 5; f++) {
      const y = py + 44 + f * 26;
      const up = h.fingers[f];
      const deg = h.curl[f];
      const thresh = f === 0 ? CFG.gesture.thumbAngle : CFG.gesture.extendAngle;

      drawText(ctx, FINGER_NAMES[f], px + 14, y, Theme.c.dim,
               '11px ' + Theme.fmono, 'left', 0);

      // Bar from 0 to 180 degrees with the threshold marked
      const bx = px + 82, bw = 150, bh = 8;
      ctx.save();
      ctx.fillStyle = Theme.c.hairline;
      roundRect(ctx, bx, y - bh / 2, bw, bh, 4);
      ctx.fill();

      const frac = clamp(deg / 180, 0, 1);
      ctx.fillStyle   = up ? Theme.c.success : Theme.c.danger;
      ctx.shadowColor = up ? Theme.c.success : Theme.c.danger;
      ctx.shadowBlur  = 10;
      roundRect(ctx, bx, y - bh / 2, bw * frac, bh, 4);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = Theme.c.dim;
      ctx.fillRect(bx + bw * (thresh / 180), y - bh, 1.5, bh * 2);
      ctx.restore();

      drawText(ctx, up ? 'UP' : 'DOWN', px + pw - 16, y,
               up ? Theme.c.success : Theme.c.danger, '600 10px ' + Theme.fmono, 'right', 6);
    }

    drawText(ctx, 'fingers up: ' + h.fingerCount() + '    gesture: ' + h.gesture,
             px + 14, py + 180, Theme.c.dim, '11px ' + Theme.fmono, 'left', 0);

    // Big number readout
    drawText(ctx, String(h.fingerCount()), app.w - 90, 110, Theme.c.ink,
             '600 76px ' + Theme.fmono);
    drawText(ctx, 'FINGERS UP', app.w - 90, 162, Theme.c.dim,
             '600 10px ' + Theme.fmono);
  },

  /* Lesson 3: the trainer */
  _drawTrainer(ctx, app, h) {
    const cx = app.w / 2;

    if (this.done) {
      drawPanel(ctx, cx - 210, app.h / 2 - 90, 420, 180, Theme.c.success);
      drawText(ctx, 'ALL EIGHT DONE', cx, app.h / 2 - 46, Theme.c.success,
               '600 28px ' + Theme.fmono);
      drawText(ctx, this.finishedIn.toFixed(1) + ' seconds', cx, app.h / 2 - 6,
               Theme.c.ink, '600 22px ' + Theme.fmono);
      if (this.bestTime) {
        drawText(ctx, 'best ' + this.bestTime.toFixed(1) + 's', cx, app.h / 2 + 26,
                 Theme.c.dim, '13px ' + Theme.fmono);
      }
      drawText(ctx, 'press R to run it again', cx, app.h / 2 + 60,
               Theme.c.dim, '12px ' + Theme.fmono);
      return;
    }

    const ch = CHALLENGES[this.idx];

    // Prompt
    drawPanel(ctx, cx - 220, 74, 440, 84, Theme.c.accent);
    drawText(ctx, 'POSE ' + (this.idx + 1) + ' OF ' + CHALLENGES.length, cx, 94,
             Theme.c.dim, '600 10px ' + Theme.fmono);
    drawText(ctx, ch.name.toUpperCase(), cx, 120, Theme.c.ink, '600 24px ' + Theme.fmono);
    drawText(ctx, ch.hint, cx, 145, Theme.c.dim, '12px ' + Theme.fbody, 'center', 0);

    // Progress dots
    for (let i = 0; i < CHALLENGES.length; i++) {
      const dx = cx - (CHALLENGES.length - 1) * 13 + i * 26;
      const done = i < this.idx;
      drawCircle(ctx, dx, 178, 6, done ? Theme.c.success : Theme.c.faint, 1.5,
                 done ? 12 : 0, done ? Theme.c.success : 'transparent');
    }

    // Hold ring around the palm
    if (h) {
      const p = clamp(this.hold / HOLD_TIME, 0, 1);
      const matched = ch.test(h);
      const col = matched ? Theme.c.success : Theme.c.faint;
      drawCircle(ctx, h.palm.x, h.palm.y, 62, Theme.c.hairline, 4, 0);
      if (p > 0) {
        ctx.save();
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur  = 22;
        ctx.lineWidth   = 6;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.arc(h.palm.x, h.palm.y, 62, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      drawText(ctx, matched ? 'HOLD IT' : h.gesture, h.palm.x, h.palm.y - 84,
               matched ? Theme.c.success : Theme.c.dim,
               '600 12px ' + Theme.fmono);
    }
  },
};
