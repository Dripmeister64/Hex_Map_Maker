# Hex Map Maker

A simple hex battlemap builder for the Lancer TTRPG.

## Running it

Open `Map_maker.html` in a browser (double-click it), or run `python Map_maker.py`, which opens it for you.

## Features

- Start menu: map name, grid size (columns × rows) and an optional background image
- Paint **light cover** (green) and **hard cover** (dark grey) with a 1, 7 or 19 hex brush
- Sci-fi templates: barricades, crates, debris, alien flora, cargo containers, fuel tanks, comms dish, bunker, hab module, warehouse and command center
- Automatic save in the browser, so closing the tab doesn't lose your work
- Save/open map files (`.hexmap.json`) and export the map as a PNG

## Controls

| Action | Control |
| --- | --- |
| Light / hard cover / eraser / pan | `1` / `2` / `3` / `4` |
| Rotate template | `R` (`Shift+R` for the other way) |
| Remove template or erase cover | Right-click |
| Zoom | Mouse wheel |
| Move view | Space + drag, or middle-drag |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` |
| Fit map to screen | `F` |
| Deselect template | `Esc` |
