"""Tiny local web server shared by Map_maker.py and Battlemap.py.

Both pages are served from the same address, so the browser lets them share
saved data. That is what makes the battlemap's "Edit map" / "Back to battle"
round trip work. Keep the window open while you play; close it (or press
Ctrl+C) to stop the server.

The GM passcode lives in gm_passcode.txt next to this file. It is created with
a random code the first time, and you can change it to anything you like.
"""
import functools
import hmac
import http.server
import json
import pathlib
import secrets
import threading
import time
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parent
HOST, PORT = "127.0.0.1", 8765
PASSCODE_FILE = ROOT / "gm_passcode.txt"
# only the pages and their assets are served, never the passcode, scripts or .git
SERVED = {".html", ".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico"}
# token art lives in a local folder that git ignores; the battlemap lists it through /api/tokens
TOKEN_DIRS = ("Tokens", "tokens")
ART_TYPES = {".png", ".jpg", ".jpeg", ".webp"}


def token_art():
    for name in TOKEN_DIRS:
        folder = ROOT / name
        if folder.is_dir():
            files = sorted(p.name for p in folder.iterdir()
                           if p.is_file() and not p.name.startswith(".") and p.suffix.lower() in ART_TYPES)
            return name, files
    return None, []


def gm_passcode():
    if not PASSCODE_FILE.exists():
        PASSCODE_FILE.write_text(f"{secrets.randbelow(10000):04d}\n")
    return PASSCODE_FILE.read_text().strip()


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # always serve the latest version of the pages
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/tokens":
            folder, files = token_art()
            self.send_json(200, {"folder": folder, "files": files})
            return
        super().do_GET()

    def send_head(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        parts = [p for p in path.split("/") if p]
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/Battlemap.html")
            self.end_headers()
            return None
        if any(p.startswith(".") for p in parts) or pathlib.PurePosixPath(path).suffix.lower() not in SERVED:
            self.send_error(404)
            return None
        return super().send_head()

    def do_POST(self):
        if self.path != "/api/gm-unlock":
            self.send_error(404)
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            given = str(body.get("passcode", ""))
        except (ValueError, AttributeError):
            given = ""
        ok = hmac.compare_digest(given.encode(), gm_passcode().encode())
        if not ok:
            time.sleep(0.6)  # slow down guessing
        self.send_json(200 if ok else 403, {"ok": ok})

    def log_message(self, *args):
        pass


def launch(page):
    url = f"http://{HOST}:{PORT}/{page}"
    try:
        server = http.server.ThreadingHTTPServer((HOST, PORT), functools.partial(Handler, directory=str(ROOT)))
    except OSError:
        # already running (e.g. the other launcher started it): just open the page
        webbrowser.open(url)
        return
    print(f"Hex Map Maker is running at http://{HOST}:{PORT}/")
    print(f"GM passcode: {gm_passcode()}   (change it in {PASSCODE_FILE.name})")
    print("Keep this window open while you use it. Press Ctrl+C to stop.")
    threading.Timer(0.5, webbrowser.open, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
