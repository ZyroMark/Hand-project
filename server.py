"""
Neon Hand Aura — Mouse Control Server
Run this FIRST, then open the browser.

Install:  pip install pyautogui websockets
Run:      python server.py
"""

import asyncio, json, sys
import pyautogui
import websockets

pyautogui.FAILSAFE = False
pyautogui.PAUSE    = 0

SW, SH = pyautogui.size()

async def handler(ws):
    print(f"[+] Browser connected")
    await ws.send(json.dumps({"type": "screen", "w": SW, "h": SH}))
    try:
        async for raw in ws:
            cmd = json.loads(raw)
            t   = cmd.get("action")
            if   t == "move":        pyautogui.moveTo(int(cmd["x"]), int(cmd["y"]))
            elif t == "click":       pyautogui.click()
            elif t == "rightclick":  pyautogui.rightClick()
            elif t == "mousedown":   pyautogui.mouseDown()
            elif t == "mouseup":     pyautogui.mouseUp()
            elif t == "scroll":      pyautogui.scroll(int(cmd.get("amount", 3)))
    except Exception as e:
        print(f"[!] {e}")
    print("[-] Browser disconnected")

async def main():
    print(f"Screen size : {SW}x{SH}")
    print(f"Listening on: ws://localhost:8765")
    print("Open http://localhost:8080 in your browser\n")
    # Compatible with websockets 10, 11, 12, 13+
    async with websockets.serve(handler, "localhost", 8765):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")
