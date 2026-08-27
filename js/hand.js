/* Landmark maths and per-hand state.
   Everything here works in two spaces:
     normalised  0..1 straight from MediaPipe, used for gesture thresholds
     pixel       canvas space, already mirrored, used for drawing and physics */

import { CFG } from './config.js';

export const WRIST = 0;
export const TIP = [4, 8, 12, 16, 20];
export const MCP = [1, 5, 9, 13, 17];
export const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

/* Joint chains per finger, base to tip. */
export const CHAINS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

export const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

export const OUTLINE = [0,1,2,3,4,8,12,16,20,19,18,17,0];

export const LANDMARK_LABELS = [
  'wrist',
  'thumb cmc','thumb mcp','thumb ip','thumb tip',
  'index mcp','index pip','index dip','index tip',
  'middle mcp','middle pip','middle dip','middle tip',
  'ring mcp','ring pip','ring dip','ring tip',
  'pinky mcp','pinky pip','pinky dip','pinky tip',
];

/* small maths helpers */
export const clamp  = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp   = (a, b, t) => a + (b - a) * t;
export const dist2D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Interior angle at point b, in degrees. */
export function angleAt(a, b, c) {
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const d = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (d < 1e-6) return 180;
  return Math.acos(clamp((abx * cbx + aby * cby) / d, -1, 1)) * 180 / Math.PI;
}

/** Closest point on segment ab to point p, plus the parametric t. */
export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return { x: ax, y: ay, t: 0 };
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  return { x: ax + dx * t, y: ay + dy * t, t };
}

/** Do segments p1-p2 and p3-p4 cross? Used by the slice blade. */
export function segmentsCross(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return false;
  const u = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const v = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

/** Shortest distance from point p to segment ab. */
export function segmentDist(px, py, ax, ay, bx, by) {
  const c = closestOnSegment(px, py, ax, ay, bx, by);
  return Math.hypot(px - c.x, py - c.y);
}

/* HandState: one tracked hand, refreshed every frame */

export class HandState {
  constructor() {
    this.lm      = null;                    // smoothed normalised landmarks
    this.px      = new Float32Array(21);
    this.py      = new Float32Array(21);
    this.vx      = new Float32Array(21);    // pixels per second
    this.vy      = new Float32Array(21);
    this.fingers = [false, false, false, false, false];
    this.curl    = [180, 180, 180, 180, 180];
    this.label   = '?';
    this.score   = 0;
    this.seen    = false;
    this.age     = 0;
    this.pinch   = { dist: 1, ratio: 1, active: false, x: 0, y: 0, vx: 0, vy: 0, strength: 0 };
    this.palm    = { x: 0, y: 0, spread: 0 };
    this.gesture = 'NONE';
    this._prevPx = new Float32Array(21);
    this._prevPy = new Float32Array(21);
    this._primed = false;
  }

  /** Feed one frame of raw landmarks. w/h are canvas pixel dimensions. */
  update(raw, handedness, w, h, dt) {
    this.seen  = true;
    this.age  += dt;
    this.label = handedness ? handedness.label : '?';
    this.score = handedness ? handedness.score : 0;

    // Exponential smoothing in normalised space
    const t = 1 - CFG.tracker.smoothing;
    if (!this.lm) {
      this.lm = raw.map(l => ({ x: l.x, y: l.y, z: l.z || 0 }));
    } else {
      for (let i = 0; i < 21; i++) {
        this.lm[i].x += (raw[i].x - this.lm[i].x) * t;
        this.lm[i].y += (raw[i].y - this.lm[i].y) * t;
        this.lm[i].z += ((raw[i].z || 0) - this.lm[i].z) * t;
      }
    }

    // Pixel space, mirrored on x so it matches the flipped video
    for (let i = 0; i < 21; i++) {
      this.px[i] = (1 - this.lm[i].x) * w;
      this.py[i] = this.lm[i].y * h;
    }

    // Per landmark velocity
    if (this._primed && dt > 0) {
      const inv = 1 / dt;
      for (let i = 0; i < 21; i++) {
        this.vx[i] = (this.px[i] - this._prevPx[i]) * inv;
        this.vy[i] = (this.py[i] - this._prevPy[i]) * inv;
      }
    }
    this._prevPx.set(this.px);
    this._prevPy.set(this.py);
    this._primed = true;

    this._computeFingers();
    this._computePinch(dt);
    this._computePalm();
    this._computeGesture();
  }

  markMissing() {
    this.seen    = false;
    this.age     = 0;
    this._primed = false;
    this.gesture = 'NONE';
    this.pinch.active = false;
    this.vx.fill(0);
    this.vy.fill(0);
  }

  /* A finger counts as extended when both of its joints are close to straight.
     Using angles instead of raw y comparisons keeps this working when the hand
     is rotated or upside down, which the original y-only check did not. */
  _computeFingers() {
    for (let f = 0; f < 5; f++) {
      const c = CHAINS[f];
      const j1 = angleAt(this.lm[c[0]], this.lm[c[1]], this.lm[c[2]]);
      const j2 = angleAt(this.lm[c[1]], this.lm[c[2]], this.lm[c[3]]);
      const min = Math.min(j1, j2);
      this.curl[f]    = min;
      this.fingers[f] = min > (f === 0 ? CFG.gesture.thumbAngle : CFG.gesture.extendAngle);
    }
  }

  _computePinch(dt) {
    const p = this.pinch;
    const d = dist2D(this.lm[4], this.lm[8]);

    /* Divide by palm length so the threshold does not change with how far you
       are from the camera. Raw image distance shrinks as you step back, which
       would otherwise make everything read as a pinch. */
    const scale = dist2D(this.lm[0], this.lm[9]) || 1e-3;
    const ratio = d / scale;
    p.dist  = d;
    p.ratio = ratio;

    /* A fist also puts the thumb tip near the index tip, so require the index
       to actually be reaching out before this counts as a pinch. */
    const reaching = this.curl[1] > CFG.gesture.pinchIndexCurl;

    // Hysteresis: has to get properly close to engage, properly far to release
    if (!p.active && ratio < CFG.gesture.pinchOn && reaching) p.active = true;
    if (p.active && (ratio > CFG.gesture.pinchOff || !reaching)) p.active = false;

    p.strength = clamp(1 - (ratio - CFG.gesture.pinchOn) /
                           (CFG.gesture.pinchOff - CFG.gesture.pinchOn), 0, 1);

    const nx = (this.px[4] + this.px[8]) * 0.5;
    const ny = (this.py[4] + this.py[8]) * 0.5;
    if (dt > 0 && this._primed) {
      p.vx = (nx - p.x) / dt;
      p.vy = (ny - p.y) / dt;
    }
    p.x = nx;
    p.y = ny;
  }

  _computePalm() {
    let sx = 0, sy = 0;
    const ids = [0, 5, 9, 13, 17];
    for (const i of ids) { sx += this.px[i]; sy += this.py[i]; }
    this.palm.x = sx / ids.length;
    this.palm.y = sy / ids.length;
    this.palm.spread = Math.hypot(this.px[5] - this.px[17], this.py[5] - this.py[17]);
  }

  fingerCount() {
    let n = 0;
    for (const up of this.fingers) if (up) n++;
    return n;
  }

  _computeGesture() {
    const t = this.fingers[0], i = this.fingers[1], m = this.fingers[2];
    const r = this.fingers[3], p = this.fingers[4];
    if (this.pinch.active)      { this.gesture = 'PINCH'; return; }
    if ( i && !m && !r && !p)   { this.gesture = 'POINT'; return; }
    if ( i &&  m && !r && !p)   { this.gesture = 'PEACE'; return; }
    if ( i &&  m &&  r &&  p)   { this.gesture = t ? 'OPEN' : 'FOUR'; return; }
    if (!i && !m && !r && !p)   { this.gesture = t ? 'THUMB' : 'FIST'; return; }
    if (!i && !m && !r &&  p)   { this.gesture = 'PINKY'; return; }
    this.gesture = 'OTHER';
  }

  /** Bone segments in pixel space, each carrying its own midpoint velocity.
      Physics uses this so a moving hand can actually punt a ball. */
  bones(out) {
    const arr = out || [];
    arr.length = 0;
    for (let k = 0; k < CONNECTIONS.length; k++) {
      const a = CONNECTIONS[k][0], b = CONNECTIONS[k][1];
      arr.push({
        ax: this.px[a], ay: this.py[a],
        bx: this.px[b], by: this.py[b],
        vx: (this.vx[a] + this.vx[b]) * 0.5,
        vy: (this.vy[a] + this.vy[b]) * 0.5,
      });
    }
    return arr;
  }

  tipSpeed(finger) {
    const i = TIP[finger === undefined ? 1 : finger];
    return Math.hypot(this.vx[i], this.vy[i]);
  }
}

/* Tracks both hands across frames */
export class HandRegistry {
  constructor() {
    this.slots = [new HandState(), new HandState()];
    this.live  = [];
  }

  ingest(results, w, h, dt) {
    const lms   = (results && results.multiHandLandmarks) || [];
    const hands = (results && results.multiHandedness) || [];
    this.live.length = 0;

    for (let i = 0; i < lms.length && i < this.slots.length; i++) {
      const slot = this.slots[i];
      slot.update(lms[i], hands[i], w, h, dt);
      this.live.push(slot);
    }
    for (let i = lms.length; i < this.slots.length; i++) this.slots[i].markMissing();
    return this.live;
  }

  /** The hand a mode should drive with. Prefers one that is pointing or pinching. */
  primary() {
    if (!this.live.length) return null;
    for (const h of this.live) {
      if (h.gesture === 'POINT' || h.gesture === 'PINCH') return h;
    }
    return this.live[0];
  }
}
