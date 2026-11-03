# Hex Map Maker

A simple hex battlemap builder for the Lancer TTRPG, plus a battlemap for playing on the maps you build.

## Running it

Run `python Battlemap.py` to play, or `python Map_maker.py` to build maps. Each one starts a small local web server and opens the page in your browser. Keep the terminal window open while you use it.

Running through the server lets both pages share saved data, which the battlemap's **Edit map** button needs. You can still open the `.html` files directly. Map and battle files work either way, but Edit map won't work reliably.

> Maps you autosaved before the server existed are still in the old copy that opens from disk. Open `Map_maker.html` directly and use **Save to file**, then open that file from the server version.

## Map Maker

- Start menu: map name, grid size (columns × rows) and an optional background image
- Paint **light cover** (green) and **hard cover** (dark grey) with a 1, 7 or 19 hex brush
- Paint **deployment zones** (blue) and **extraction zones** (amber). Zones are a separate layer, so a hex can be cover and part of a zone at the same time
- Paint **effects** that change movement cost: **difficult terrain** (hatched hexes) and **climbs** (ladder marks on the border between two hexes, e.g. the edge of a ledge or a building's wall). For a straight cliff, trace along the zigzag of the hex outline
- Sci-fi templates: barricades, crates, debris, alien flora, cargo containers, fuel tanks, comms dish, bunker, hab module, warehouse and command center
- Large buildings: barracks (6 hexes), reactor (7), landing pad (7, no cover), factory (12), hangar (13) and arcology (19)
- Automatic save in the browser, so closing the tab doesn't lose your work
- Save/open map files (`.hexmap.json`) and export the map as a PNG

| Action | Control |
| --- | --- |
| Light / hard cover / eraser / pan | `1` / `2` / `3` / `4` |
| Deployment / extraction zone | `5` / `6` |
| Difficult terrain / climb | `7` / `8`. With climb, click or drag along borders; click an existing climb or right-drag to remove it. The eraser also clears climbs around the hexes it erases |
| Rotate template | `R` (`Shift+R` for the other way) |
| Remove template or erase cover and zones | Right-click |
| Zoom | Mouse wheel |
| Move view | Space + drag, or middle-drag |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` |
| Fit map to screen | `F` |
| Deselect template | `Esc` |

## Battlemap

- Load the map that's open in the Map Maker, a `.hexmap.json` file, or a saved `.battle.json` (map and tokens together). You can also drop the file onto the page
- Tokens for players, allies, hostiles and neutrals, in Lancer sizes ½, 1, 2, 3 and 4. Tokens snap to the hexes, can show a picture and can be renamed, duplicated and deleted
- **Movement cost**: while you drag a token, its cheapest route is drawn, with the cost shown as e.g. "Move 7 (5 + 2 extra)". Every step that costs extra is marked "+1". Hard cover blocks the route (you can turn this off under Display), but a token can still end on top of it
- **Right-drag** anywhere to measure range, edge to edge, and what moving along that line would cost. A dotted route is only shown when going round costs less than the measured line, or when hard cover blocks the line. Hexes of light or hard cover on the path are highlighted
- Area tools: **Line**, **Cone**, **Blast** and **Burst**. Any tokens caught are ringed in orange and listed
- **Edit map** opens the battle's map in the Map Maker, for example to add a crater or wreckage. **Back to battle** brings the changed map back with every token where it was
- Autosaves the battle in the browser. **Save battle to file** keeps a copy

### Lancer rules used

| | |
| --- | --- |
| Range | Hexes counted from the edge of one space to the edge of the other. Adjacent is 1 |
| Line X | A straight line of X hexes, 1 wide, leaving the side of the space facing the cursor |
| Cone X | X hexes long, 1 wide next to the space and X wide at the far end: a triangle of X(X+1)/2 hexes |
| Blast X | Every hex within X of the target hex. The range from the attacker to the centre is shown |
| Burst X | Every hex within X of the character's space, not counting the space itself |
| Movement | Each hex costs 1. A step costs 2 if it enters difficult terrain or crosses a climb. These don't stack, so climbing into difficult terrain still costs 2. Leaving difficult terrain costs nothing extra. Large tokens pay extra if any part of them enters difficult terrain or crosses a climb |
| Token size | Size ½ and 1: 1 hex. Size 2: 3 hexes. Size 3: 7 hexes. Size 4: 12 hexes |

The rulebook doesn't pin down hex shapes for large tokens or cones. These are the common choices, matching how most virtual tabletops draw them.

| Action | Control |
| --- | --- |
| Move tokens / Line / Cone / Blast / Burst | `1` / `2` / `3` / `4` / `5` |
| Area size X | `[` / `]` or the − / + buttons |
| Measure range | Right-drag |
| Use an area tool | Press on the token, drag to aim (Burst: just click the token) |
| Clear measurement, then selection | `Esc` |
| Rotate a Size 2 or 4 token | `R` |
| Duplicate / delete selected token | `Ctrl+D` / `Delete` |
| Pan | Drag empty space, Space + drag, or middle-drag |
| Undo / redo token changes | `Ctrl+Z` / `Ctrl+Y` |
| Save battle to file | `Ctrl+S` |
