"""Tiny web server shared by Map_maker.py and Battlemap.py.

Both pages are served from the same address, so the browser lets them share
saved data. That is what makes the battlemap's "Edit map" / "Back to battle"
round trip work. Keep the window open while you play; close it (or press
Ctrl+C) to stop the server.

The server also holds the battle itself, so several screens can play on it at
once: everyone on the same Wi-Fi opens the link it prints. Every change goes
through the server, which checks who is allowed to make it and sends the result
to every screen. Players only ever receive what they are allowed to see, so
hidden tokens never reach their devices. The battle is kept in
battle_state.json, so restarting the server doesn't lose it.

Who a screen is:
  GM      unlocked with the GM pattern; can do everything
  player  joined with a name; moves the tokens they have claimed, deploys allies
  table   the computer running this server, without a name: acts for all players
  guest   another device that hasn't joined yet; can only watch

The GM unlock is a pattern drawn on a 3x3 grid of dots, numbered like a phone
keypad (1 2 3 / 4 5 6 / 7 8 9). It lives in gm_passcode.txt next to this file
as the dots in the order you draw them, e.g. 14789. The file is created with
a random pattern the first time, and you can change it to any pattern you like.
"""
import functools
import hmac
import http.server
import json
import math
import pathlib
import re
import secrets
import socket
import threading
import time
import urllib.parse
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parent
HOST, PORT = "0.0.0.0", 8765          # 0.0.0.0: other devices on the local network can connect
PASSCODE_FILE = ROOT / "gm_passcode.txt"
STATE_FILE = ROOT / "battle_state.json"
# only the pages and their assets are served, never the GM pattern, the battle state, scripts or .git
SERVED = {".html", ".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico"}
# token art lives in a local folder that git ignores; the battlemap lists it through /api/tokens
TOKEN_DIRS = ("Tokens", "tokens")
ART_TYPES = {".png", ".jpg", ".jpeg", ".webp"}
MAX_BODY = 60 * 1024 * 1024           # maps carry their background image, so allow big uploads


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
        dots = list("123456789")
        secrets.SystemRandom().shuffle(dots)
        PASSCODE_FILE.write_text("".join(dots[:5]) + "\n")
    return PASSCODE_FILE.read_text().strip()


def valid_pattern(code):
    return len(code) >= 2 and len(set(code)) == len(code) and all(d in "123456789" for d in code)


def pattern_picture(code):
    """The pattern as a 3x3 grid, each dot showing when it's drawn: 14789 -> 1 . . / 2 . . / 3 4 5"""
    order = {int(d): str(n) for n, d in enumerate(code, 1)}
    return "\n".join("    " + " ".join(order.get(r * 3 + c + 1, ".") for c in range(3)) for r in range(3))


def lan_address():
    """This computer's address on the local network (no traffic is sent)"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None


def links():
    """The addresses other screens open, for the GM's "Player links" box"""
    lan = lan_address()
    out = [{"label": "Players on the same Wi-Fi", "url": f"http://{lan}:{PORT}/Battlemap.html"}] if lan else []
    return out + [{"label": "This computer", "url": f"http://127.0.0.1:{PORT}/Battlemap.html"}]


# =============================================================================
#   THE SHARED BATTLE
# =============================================================================
SIDES = {"pc", "ally", "hostile", "neutral"}
PLAYER_SIDES = {"pc", "ally"}
SIZES = (0.5, 1, 2, 3, 4)
FIELDS = ("name", "side", "size", "q", "r", "rot", "img", "hidden", "art")
PLAYER_FIELDS = {"name", "size", "q", "r", "rot", "img", "art"}   # what a player may change on a token they run
ART_RE = re.compile(r"^[Tt]okens/[^/]+$")

changed = threading.Condition()        # guards everything below; notified on every change
state = {"battle": None, "players": {}, "version": 1, "mapVersion": 1}
BOOT = secrets.token_hex(4)           # changes on every start, so screens know to reload everything
gm_sessions = set()
failed_unlocks = {}                    # ip -> (failures in a row, time of the last one)
unlock_lock = threading.Lock()


def load_state():
    try:
        saved = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        state["battle"] = saved.get("battle")
        state["players"] = {str(k): str(v) for k, v in (saved.get("players") or {}).items()}
    except (OSError, ValueError, AttributeError):
        pass


_save_timer = None


def save_soon():
    """Write battle_state.json a moment after the last change (maps can be large)"""
    global _save_timer
    if _save_timer:
        _save_timer.cancel()

    def write():
        with changed:
            data = json.dumps({"battle": state["battle"], "players": state["players"]})
        tmp = STATE_FILE.with_suffix(".tmp")
        tmp.write_text(data, encoding="utf-8")
        tmp.replace(STATE_FILE)

    _save_timer = threading.Timer(1.0, write)
    _save_timer.daemon = True
    _save_timer.start()


def bump(map_changed=False):
    """Call with `changed` held after changing the battle"""
    state["version"] += 1
    if map_changed:
        state["mapVersion"] += 1
    changed.notify_all()
    save_soon()


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def clean_token(raw, base=None):
    """A token from a browser, checked field by field; anything odd keeps the base value"""
    t = dict(base) if base else {"id": 0, "name": "Token", "side": "neutral", "size": 1, "q": 0, "r": 0,
                                 "rot": 0, "img": None, "hidden": False, "art": None, "owner": None}
    if not isinstance(raw, dict):
        return t
    if isinstance(raw.get("name"), str):
        t["name"] = raw["name"][:40]
    if raw.get("side") in SIDES:
        t["side"] = raw["side"]
    if is_num(raw.get("size")) and raw["size"] in SIZES:
        t["size"] = 0.5 if raw["size"] == 0.5 else int(raw["size"])
    for k in ("q", "r"):
        if is_num(raw.get(k)):
            t[k] = int(round(raw[k]))
    if is_num(raw.get("rot")):
        t["rot"] = int(round(raw["rot"])) % 6
    if "img" in raw and (raw["img"] is None or (isinstance(raw["img"], str) and raw["img"].startswith("data:image/"))):
        t["img"] = raw["img"]
    if isinstance(raw.get("hidden"), bool):
        t["hidden"] = raw["hidden"]
    if "art" in raw and (raw["art"] is None or (isinstance(raw["art"], str) and ART_RE.match(raw["art"]))):
        t["art"] = raw["art"]
    return t


def clean_log(entries, allow_gm):
    out = []
    for e in entries if isinstance(entries, list) else []:
        if isinstance(e, dict) and isinstance(e.get("text"), str):
            out.append({"at": int(time.time() * 1000), "text": e["text"][:120], "gm": bool(e.get("gm")) and allow_gm})
    return out[:20]


def can_edit(role, pid, t):
    if role == "gm":
        return True
    if t["hidden"] or role == "guest":
        return False
    if role == "table":
        return t["side"] in PLAYER_SIDES
    return t.get("owner") == pid


def can_remove(role, pid, t):
    if role == "gm":
        return True
    return not t["hidden"] and t["side"] == "ally" and (role == "table" or (role == "player" and t.get("owner") == pid))


def view_for(role, pid):
    """What one screen gets to see: hidden tokens and GM notes only go to the GM"""
    b = state["battle"]
    out = {"boot": BOOT, "version": state["version"], "mapVersion": state["mapVersion"], "battle": bool(b),
           "you": {"role": role, "name": state["players"].get(pid) if pid else None}}
    if role == "gm":
        out["players"] = [{"id": k, "name": v} for k, v in sorted(state["players"].items(), key=lambda kv: kv[1].lower())]
        out["links"] = links()
    if b:
        gm = role == "gm"
        out["mapName"] = (b.get("map") or {}).get("name")
        out["nextId"] = b["nextId"]
        out["tokens"] = [dict({k: t[k] for k in ("id",) + FIELDS},
                              owner=state["players"].get(t["owner"]) if t.get("owner") else None,
                              mine=bool(pid) and t.get("owner") == pid, **({"ownerId": t.get("owner")} if gm else {}))
                         for t in b["tokens"] if gm or not t["hidden"]]
        out["log"] = [e for e in b["log"] if gm or not e.get("gm")]
    return out


def apply_changes(role, pid, body):
    """Token changes from one screen. Each one is checked on its own; the ones that aren't allowed are skipped"""
    b = state["battle"]
    if not b:
        return {"rejected": 1, "idMap": {}}
    tokens = {t["id"]: t for t in b["tokens"]}
    rejected, done, id_map = 0, False, {}
    for raw in body.get("update") or []:
        tid = raw.get("id") if isinstance(raw, dict) else None
        t = tokens.get(tid) if isinstance(tid, int) else None
        if not t or (t["hidden"] and role != "gm"):
            rejected += 1
            continue
        new = clean_token(raw, t)
        diff = {k for k in FIELDS if new[k] != t[k]}
        if not diff:
            continue
        if not can_edit(role, pid, t) or (role != "gm" and not diff <= PLAYER_FIELDS):
            rejected += 1
            continue
        if new["side"] not in PLAYER_SIDES:
            new["owner"] = None          # the GM turned it into a hostile or neutral
        t.update(new)
        done = True
    for tid in body.get("remove") or []:
        t = tokens.get(tid) if isinstance(tid, int) else None
        if not t or not can_remove(role, pid, t):
            rejected += 1
            continue
        b["tokens"].remove(t)
        tokens.pop(tid)
        done = True
    for raw in body.get("add") or []:
        new = clean_token(raw)
        if role == "guest" or (role != "gm" and new["side"] != "ally"):
            rejected += 1
            continue
        if role != "gm":
            new["hidden"] = False
        new["owner"] = pid if role == "player" else None    # players run what they deploy
        new["id"] = b["nextId"]
        b["nextId"] += 1
        if isinstance(raw, dict) and is_num(raw.get("id")):
            id_map[str(raw["id"])] = new["id"]
        b["tokens"].append(new)
        done = True
    log = clean_log(body.get("log"), role == "gm") if role != "guest" else []
    if log:
        b["log"] = (b["log"] + log)[-40:]
        done = True
    if done:
        bump()
    return {"rejected": rejected, "idMap": id_map}


def claim(role, pid, body):
    b = state["battle"]
    t = next((x for x in (b or {}).get("tokens", []) if x["id"] == body.get("id")), None)
    if not t or (t["hidden"] and role != "gm"):
        return "That token isn't on the map"
    action = body.get("action")
    if action == "claim":
        if role != "player":
            return "Join as a player to claim tokens"
        if t["side"] not in PLAYER_SIDES:
            return "Only player and ally tokens can be claimed"
        if t.get("owner") and t["owner"] != pid:
            return f"{t['name']} is already played by {state['players'].get(t['owner'], 'someone')}"
        t["owner"] = pid
        who = state["players"].get(pid)
    elif action == "release":
        if role != "gm" and t.get("owner") != pid:
            return "Only the token's player or the GM can release it"
        t["owner"], who = None, None
    elif action == "assign" and role == "gm":
        who = body.get("player")
        if who is not None and who not in state["players"]:
            return "No player by that name"
        if who is not None and t["side"] not in PLAYER_SIDES:
            return "Only player and ally tokens can be given to a player"
        t["owner"], who = who, state["players"].get(who) if who else None
    else:
        return "Not allowed"
    entry = f"{t['name']} is now played by {who}" if who else f"{t['name']} is free to claim"
    b["log"] = (b["log"] + [{"at": int(time.time() * 1000), "text": entry, "gm": t["hidden"]}])[-40:]
    bump()
    return None


def new_battle(body):
    """A fresh battle from the GM (a new map, or a battle file); nobody has claimed anything yet"""
    tokens, ids = [], set()
    for raw in body.get("tokens") or []:
        t = clean_token(raw)
        tid = int(raw["id"]) if isinstance(raw, dict) and is_num(raw.get("id")) else 0
        t["id"] = tid if tid >= 1 and tid not in ids else max(ids | {0}) + 1
        ids.add(t["id"])
        tokens.append(t)
    next_id = int(body["nextId"]) if is_num(body.get("nextId")) else 1
    state["battle"] = {"map": body["map"], "tokens": tokens, "nextId": max([next_id, 1] + [i + 1 for i in ids]),
                       "log": clean_log(body.get("log"), True)}
    bump(map_changed=True)


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

    def identity(self, query=None):
        """(role, player id). Headers for normal requests; the live feed passes them in the address"""
        q = query or {}
        gm = self.headers.get("X-GM") or (q.get("gm") or [""])[0]
        pid = self.headers.get("X-Player") or (q.get("player") or [""])[0]
        pid = pid if pid in state["players"] else None
        if gm and gm in gm_sessions:
            return "gm", pid
        if pid:
            return "player", pid
        return ("table" if self.client_address[0] in ("127.0.0.1", "::1") else "guest"), None

    def read_body(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        if n > MAX_BODY:
            raise ValueError("too big")
        body = json.loads(self.rfile.read(n) or b"{}")
        if not isinstance(body, dict):
            raise ValueError("not an object")
        return body

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path == "/api/tokens":
            folder, files = token_art()
            self.send_json(200, {"folder": folder, "files": files})
        elif url.path == "/api/state":
            with changed:
                self.send_json(200, view_for(*self.identity()))
        elif url.path == "/api/map":
            with changed:
                b = state["battle"]
                self.send_json(200, {"mapVersion": state["mapVersion"], "map": b and b["map"]})
        elif url.path == "/api/events":
            self.event_stream(urllib.parse.parse_qs(url.query))
        else:
            super().do_GET()

    def event_stream(self, query):
        """Server-sent events: the screen's view of the battle, every time it changes"""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        last = None
        while True:
            with changed:
                if state["version"] == last:
                    changed.wait(timeout=15)
                payload = None
                if state["version"] != last:
                    last = state["version"]
                    payload = json.dumps(view_for(*self.identity(query)))
            try:
                self.wfile.write((f"data: {payload}\n\n" if payload else ": ping\n\n").encode())
                self.wfile.flush()
            except OSError:
                return

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
        path = urllib.parse.urlsplit(self.path).path
        try:
            body = self.read_body()
        except ValueError:
            self.send_json(400, {"ok": False, "error": "Bad request"})
            return
        if path == "/api/gm-unlock":
            self.unlock(body)
            return
        if path == "/api/join":
            name = str(body.get("name") or "").strip()[:24]
            if not name:
                self.send_json(400, {"ok": False, "error": "Type a name"})
                return
            with changed:
                pid = body.get("id") if body.get("id") in state["players"] else secrets.token_urlsafe(12)
                state["players"][pid] = name
                bump()
            self.send_json(200, {"ok": True, "id": pid, "name": name})
            return
        with changed:
            role, pid = self.identity()
            if path == "/api/gm-lock":
                gm_sessions.discard(self.headers.get("X-GM"))
                bump()          # so that screen's live feed drops the hidden tokens straight away
                result = {"ok": True}
            elif path == "/api/changes":
                result = dict(apply_changes(role, pid, body), ok=True)
            elif path == "/api/claim":
                err = claim(role, pid, body)
                result = {"ok": not err, "error": err}
            elif path in ("/api/battle", "/api/map") and role != "gm":
                result = {"ok": False, "error": "Only the GM can do that"}
            elif path == "/api/battle":
                if not isinstance(body.get("map"), dict):
                    result = {"ok": False, "error": "No map"}
                else:
                    new_battle(body)
                    result = {"ok": True}
            elif path == "/api/map":
                if not isinstance(body.get("map"), dict):
                    result = {"ok": False, "error": "No map"}
                elif state["battle"]:
                    state["battle"]["map"] = body["map"]
                    bump(map_changed=True)
                    result = {"ok": True}
                else:
                    new_battle({"map": body["map"]})
                    result = {"ok": True}
            else:
                self.send_error(404)
                return
            result["state"] = view_for(*self.identity())
        self.send_json(200 if result.get("ok") else 403, result)

    def unlock(self, body):
        ip = self.client_address[0]
        with unlock_lock:   # one guess at a time, so guessing in parallel doesn't help
            fails, last = failed_unlocks.get(ip, (0, 0))
            wait = 30 - (time.time() - last)
            if fails >= 5 and wait > 0:
                self.send_json(429, {"ok": False, "wait": math.ceil(wait)})
                return
            ok = hmac.compare_digest(str(body.get("passcode", "")).encode(), gm_passcode().encode())
            if ok:
                failed_unlocks.pop(ip, None)
                token = secrets.token_urlsafe(24)
                with changed:
                    gm_sessions.add(token)
                self.send_json(200, {"ok": True, "token": token})
                return
            failed_unlocks[ip] = (fails + 1 if fails < 5 else 1, time.time())
            time.sleep(0.6)  # slow down guessing
        self.send_json(403, {"ok": False})

    def log_message(self, *args):
        pass


def launch(page):
    url = f"http://127.0.0.1:{PORT}/{page}"
    try:
        server = http.server.ThreadingHTTPServer((HOST, PORT), functools.partial(Handler, directory=str(ROOT)))
    except OSError:
        # already running (e.g. the other launcher started it): just open the page
        webbrowser.open(url)
        return
    load_state()
    print(f"Hex Map Maker is running at http://127.0.0.1:{PORT}/")
    lan = lan_address()
    if lan:
        print(f"Players on the same Wi-Fi open:  http://{lan}:{PORT}/Battlemap.html  (also under Player links in GM mode)")
    code = gm_passcode()
    if valid_pattern(code):
        print("GM pattern (numbers show the order to draw the dots):")
        print(pattern_picture(code))
        print(f"Change it in {PASSCODE_FILE.name}: the dots in order, numbered 1 2 3 / 4 5 6 / 7 8 9.")
    else:
        print(f"WARNING: {PASSCODE_FILE.name} doesn't hold a pattern, so GM mode can't be unlocked.")
        print("Put the pattern's dots in it in the order you draw them, numbered 1 2 3 / 4 5 6 / 7 8 9 (e.g. 14789).")
    print("Keep this window open while you use it. Press Ctrl+C to stop.")
    threading.Timer(0.5, webbrowser.open, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
