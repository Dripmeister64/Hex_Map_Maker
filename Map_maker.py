"""Launcher for the Lancer Hex Map Maker.

The map maker itself lives in Map_maker.html and runs in your web browser.
Run this file (double-click, or `python Map_maker.py`) to open it.
"""
import pathlib
import webbrowser

html = pathlib.Path(__file__).with_name("Map_maker.html")
webbrowser.open(html.resolve().as_uri())
