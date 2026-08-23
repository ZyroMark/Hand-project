# Neon Hand Aura

Control your computer's mouse with your hand in front of a webcam.

Live demo: https://hand-project-mu.vercel.app
(tracking only, see the limits section below)

The browser tracks your hand with MediaPipe Hands, draws a neon rainbow skeleton over the video feed, and translates finger poses into gestures. A small Python server receives those gestures over a WebSocket and drives the real system cursor with PyAutoGUI.

## What it does

- Tracks up to two hands at once, live, in the browser
- Draws a glowing rainbow skeleton with motion trails over the camera feed
- Shows a HUD with hand count, detection confidence, FPS, and handedness
- Moves the system cursor, clicks, right clicks, drags, and scrolls from hand gestures

## Gestures

- Index finger up on its own moves the cursor
- Index and middle fingers up scrolls, move your hand up or down to scroll
- Pinch thumb and index together and release quickly for a left click
- Hold the pinch for about 0.8 seconds for a right click
- Hold the pinch and move your hand to drag
- Open palm keeps the cursor moving without clicking
- Closed fist is idle, nothing is sent

## Requirements

- Python 3.8 or newer
- A webcam
- A browser with camera access, Chrome or Edge recommended

## Running it locally

Install the Python dependencies:

```bash
pip install -r requirements.txt
```

Start the mouse control server. Do this first, it prints your screen size and listens on port 8765:

```bash
python server.py
```

In a second terminal, serve the frontend from the project folder:

```bash
python -m http.server 8080
```

Open http://localhost:8080 in your browser and allow camera access. The page connects to the server automatically and retries every two seconds if the server is not up yet.

On Windows, if `python` is not recognised, use the `py` launcher instead, for example `py server.py` and `py -m http.server 8080`.

Opening `index.html` straight from the filesystem will not work. Browsers block camera access on `file://` URLs, so the page has to be served over HTTP.

## Live demo and its limits

The deployed version on Vercel is the visual half of the project. Hand tracking, the neon overlay, and the HUD all work there.

Mouse control does not work on the deployed version, and cannot. Two reasons:

1. `server.py` uses PyAutoGUI to move the cursor on the machine it runs on. There is no cursor to move on a serverless host, so the server has to run on your own computer.
2. The deployed page is served over HTTPS, and browsers block an HTTPS page from opening an insecure `ws://localhost` connection.

Use the deployed page to see the tracking. Clone the repo and run it locally to actually control the mouse.

## Tuning

Gesture behaviour lives in the `CFG` object at the top of `app.js`:

- `pinchThresh` is how close thumb and index must be to count as a pinch. Lower it if clicks fire by accident.
- `rightClickHold` is how long a pinch must be held before it becomes a right click, in milliseconds.
- `clickCooldown` is the minimum gap between two left clicks, in milliseconds.
- `scrollSensitivity` is how far your finger must travel per scroll tick. Lower is faster.
- `cursorSmoothing` runs from 0 to 1. Higher is smoother but laggier.
- `cursorMargin` trims the camera edges so your wrist leaving frame does not throw the cursor around.

Visual settings in the same object cover trail length, glow strength, line width, and rainbow speed.

## Safety note

`server.py` sets `pyautogui.FAILSAFE = False`, which disables the built in escape hatch of slamming the cursor into a screen corner. If a gesture misfires and the cursor runs away, stop the server with Ctrl+C in its terminal, or just move your hand out of the camera frame.

The server only listens on `localhost`, so nothing outside your machine can reach it.

## Files

- `index.html` is the page layout, HUD, and MediaPipe CDN script tags
- `styles.css` is the neon theme, scanlines, and HUD styling
- `app.js` is the tracking loop, the overlay rendering, and the gesture logic
- `server.py` is the WebSocket server that moves the real cursor
- `vercel.json` is the static hosting config for the deployed frontend

## How it fits together

The browser runs MediaPipe Hands on each webcam frame and gets 21 landmarks per hand. `processGestures` in `app.js` reads which fingers are extended and how far the thumb tip sits from the index tip, picks a gesture from that, and sends a small JSON message over the WebSocket. Messages look like `{"action": "move", "x": 840, "y": 512}` or `{"action": "click"}`. The server maps each action onto a PyAutoGUI call. On connect the server sends back the screen resolution so the browser can map normalised hand coordinates onto real pixels.
