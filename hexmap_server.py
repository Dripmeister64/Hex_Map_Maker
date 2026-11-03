"""Tiny local web server shared by Map_maker.py and Battlemap.py.

Both pages are served from the same address, so the browser lets them share
saved data. That is what makes the battlemap's "Edit map" / "Back to battle"
round trip work. Keep the window open while you play; close it (or press
Ctrl+C) to stop the server.
"""
import functools
import http.server
import pathlib
import threading
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parent
HOST, PORT = "127.0.0.1", 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # always serve the latest version of the pages
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

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
    print("Keep this window open while you use it. Press Ctrl+C to stop.")
    threading.Timer(0.5, webbrowser.open, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
