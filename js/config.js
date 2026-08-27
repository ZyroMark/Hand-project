/* Central tunables. Every mode reads from here so you only tweak one file. */

export const CFG = {
  camera: { width: 640, height: 480 },

  tracker: {
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.5,
    smoothing: 0.35,        // 0 = raw and jittery, 1 = frozen
  },

  visual: {
    trailLength: 8,
    trailDecay: 0.72,
    glowBlur: 18,
    lineWidth: 2.5,
    glowLineWidth: 9,
    rampDrift: 0.05,        // how fast the skeleton colour walks the theme ramp
    dotRadius: 4,
    motionBlur: 0.22,
  },

  gesture: {
    extendAngle: 158,       // degrees at the joints before a finger counts as straight
    thumbAngle: 148,
    /* Pinch is measured as thumb-to-index gap divided by palm length, so it
       behaves the same whether you are close to the camera or across the room. */
    pinchOn: 0.42,
    pinchOff: 0.60,         // hysteresis so it does not chatter on the threshold
    pinchIndexCurl: 95,     // index must be this straight, else a fist reads as a pinch
  },

  mouse: {
    clickCooldown: 500,
    rightClickHold: 800,
    scrollSensitivity: 12,
    cursorSmoothing: 0.22,
    cursorMargin: 0.05,
  },

  physics: {
    gravity: 1500,          // pixels per second squared
    restitution: 0.78,
    wallRestitution: 0.72,
    airDrag: 0.4,
    handThickness: 16,      // collision padding around each bone segment
    handTransfer: 0.85,     // how much hand speed is handed to the ball
    maxTransfer: 2600,
    grabRadius: 70,
    throwBoost: 1.35,
    ballRadius: 26,
    startBalls: 3,
    maxBalls: 10,
  },

  slice: {
    spawnEvery: 1150,       // ms between waves, shrinks as you level up
    minSpawnEvery: 420,
    waveMin: 1,
    waveMax: 3,
    bombChance: 0.16,
    goldChance: 0.08,
    gravity: 900,
    comboWindow: 700,
    lives: 3,
    bladeLength: 10,
    minBladeSpeed: 380,     // px/sec before the blade is considered live
  },

  paint: {
    minWidth: 3,
    maxWidth: 26,
    clearHold: 1200,        // ms of open palm before the canvas wipes
    maxStrokes: 400,
  },
};
