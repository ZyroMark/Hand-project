# Hand Aura

Webcam hand tracking with five things to do with it: drive your real mouse, bounce balls off your fingers, play a slicing game, paint in the air, and learn how the tracking actually works.

Live demo: https://hand-project-mu.vercel.app
(four of the five modes work there, see the limits section below)

The browser tracks your hands with MediaPipe Hands and draws a live skeleton over the video feed. Everything else is built on the 21 landmarks that model returns.

## The five modes

Switch with keys 1 to 5, or click the bar at the bottom. Press H at any time for the controls of the mode you are in.

### 1. Cursor

Drives the real system cursor through a local Python server. Point to move, pinch to click, hold the pinch to right click, index and middle up to scroll.

### 2. Physics

Balls fall under gravity and collide with the actual bones of your hand, not a rough box around it. Every one of the 21 connections is a moving surface, so a fast swipe transfers real energy and punts the ball across the screen.

Pinch near a ball to grab it, then flick and release to throw. The throw velocity comes from how fast your pinch was moving. Keeping a ball off the floor builds a streak counter, and your best is saved.

SPACE adds a ball, X removes one, R resets, G toggles low gravity.

### 3. Slice

Orbs arc up from the bottom of the screen and your index fingertip is the blade. The blade only cuts while your hand is genuinely moving, so you cannot park a finger in the middle and farm points.

Standard orbs are worth one, gold are worth five, and slicing a bomb costs a life. Letting an orb fall off the bottom also costs a life. Slices inside a short window chain into a combo multiplier. Both hands are tracked, so you get two blades. Three lives, then hold an open palm to play again.

### 4. Paint

Pinch to draw. The tighter the pinch the thicker the line, and the colour walks along the current theme ramp as you go, so one stroke comes out as a gradient. A peace sign erases anything you pass through, and holding an open palm for a second wipes the canvas.

Z undoes, C clears, S saves a PNG, and the bracket keys change the brush size.

### 5. Learn

Three lessons on what the tracker is doing.

Lesson one numbers and names all 21 landmarks, coloured per finger. Lesson two shows the live joint angles and the threshold that decides whether a finger counts as extended or curled, so you can watch the decision happen. Lesson three is a trainer that asks for eight poses in turn, times your run, and saves your best.

Arrow keys move between lessons.

## Themes

Five themes, switched with T or by clicking the dots in the top right. Your choice is saved.

- **Aurora** is the default. Dark slate with a violet to teal ramp and soft depth.
- **Paper** is a light theme. Warm off white, near black ink, one coral accent. The camera feed sits behind a light wash so the page still reads as paper.
- **Mono** is near black with a single acid lime accent and square corners.
- **Ember** is warm dark, amber through rose.
- **Neon** is the original cyan and magenta look, scanlines included, kept as an option.

A theme is not just page colours. It also drives what gets painted on the canvas: the skeleton gradient, ball and orb colours, particles, and a `glow` value that scales every shadow. Glow is what actually separates a flat modern look from the old neon one, so Paper renders with almost no bloom while Neon renders at full strength.

Themes live in `js/theme.js`. Adding one means appending an object with a `css` block for the page and a `canvas` block for the overlay.

## Requirements

- Python 3.8 or newer, only for the cursor mode server
- A webcam
- A browser with camera access, Chrome or Edge recommended

## Running it locally

Serve the folder over HTTP:

```bash
py -m http.server 8080
```

Open http://localhost:8080 and allow camera access. Four of the five modes work straight away with no server.

For cursor mode, install the Python dependencies and start the mouse server first, in its own terminal:

```bash
pip install -r requirements.txt
```

```bash
py server.py
```

On macOS and Linux use `python` instead of `py`.

Opening `index.html` straight from the filesystem will not work. Browsers block camera access on `file://` URLs, and ES modules will not load either, so the page has to be served over HTTP.

## Live demo and its limits

Physics, Slice, Paint, and Learn all work on the deployed version. Cursor does not, and cannot.

`server.py` uses PyAutoGUI to move the cursor on the machine it runs on. There is no cursor to move on a serverless host, so the server has to run on your own computer. On top of that, the deployed page is served over HTTPS, and browsers block an HTTPS page from opening an insecure `ws://localhost` connection. The app detects this and says so rather than retrying forever.

Clone the repo and run it locally if you want mouse control.

## Project layout

```
index.html          page shell, HUD, mode bar
styles.css          page chrome, driven entirely by theme tokens
server.py           WebSocket server that moves the real cursor
js/
  app.js            camera, tracker, mode manager, main loop
  theme.js          five themes, page tokens plus canvas palette
  config.js         every tunable value in the project
  hand.js           landmark maths, gesture detection, per hand state
  fx.js             themed drawing, particle pool, screen shake
  audio.js          generated sound, no audio files
  modes/            cursor, physics, slice, paint, learn
```

Each mode is a plain object with `enter`, `exit`, `update`, `draw`, and `onKey`. Adding a sixth mode means writing one file and adding it to the `MODES` array in `js/app.js`.

## How gestures are detected

A finger counts as extended when both of its joints are close to straight, measured as an angle rather than by comparing y coordinates. That keeps it working when your hand is rotated or upside down.

Pinch is the gap between thumb tip and index tip divided by the length of your palm. Dividing by palm length matters: a raw pixel distance shrinks as you step back from the camera, which would make everything read as a pinch from across the room. A pinch also requires the index finger to be reaching out, otherwise a closed fist reads as a pinch, since a curled thumb and curled index end up near each other.

Both thresholds have separate on and off values so the state does not chatter when you sit right on the boundary.

## Tuning

Everything adjustable lives in `js/config.js`, grouped by area. The values worth trying first:

- `gesture.pinchOn` and `pinchOff` if pinching is too eager or too stubborn
- `gesture.extendAngle` if fingers read as curled when you think they are straight
- `visual.rampDrift` for how fast the skeleton colour walks the theme ramp
- `tracker.smoothing` trades jitter against lag, higher is smoother and laggier
- `physics.handTransfer` and `restitution` for how lively the balls feel
- `slice.minBladeSpeed` for how hard you have to swipe before the blade cuts
- `slice.bombChance` and `spawnEvery` for difficulty

## Safety note

`server.py` sets `pyautogui.FAILSAFE = False`, which disables the built in escape hatch of slamming the cursor into a screen corner. If a gesture misfires and the cursor runs away, stop the server with Ctrl+C in its terminal, or move your hand out of the camera frame.

The server only listens on `localhost`, so nothing outside your machine can reach it.
