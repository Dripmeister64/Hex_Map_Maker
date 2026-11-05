# Hex Map Maker

A simple hex battlemap builder for the Lancer TTRPG, plus a battlemap for playing on the maps you build.

## Running it

Run `python Battlemap.py` to play, or `python Map_maker.py` to build maps. Each one starts a small local web server and opens the page in your browser. Keep the terminal window open while you use it.

Running through the server lets both pages share saved data, which the battlemap's **Edit map** button needs. It's also what lets several screens play on the same battle (see [Playing together](#playing-together)). You can still open the `.html` files directly. Map and battle files work either way, but Edit map won't work reliably and only that one screen can play.

> Maps you autosaved before the server existed are still in the old copy that opens from disk. Open `Map_maker.html` directly and use **Save to file**, then open that file from the server version.

## Map Maker

- Start menu: map name, grid size (columns × rows) and an optional background image
- Paint **light cover** (a hollow shield on a faint green) and **hard cover** (a solid shield on dark grey) with a 1, 7 or 19 hex brush. Every tile type is a faint tint with one small symbol, so the tokens stand out. A hex with several things on it shows their symbols side by side
- Paint **deployment zones** (blue, chevrons pointing in) and **extraction zones** (amber, chevrons pointing out, dashed outline). Zones are a separate layer, so a hex can be cover and part of a zone at the same time
- Paint **effects**: **difficult terrain** (waves), **dangerous terrain** (a warning triangle) and **climbs** (ladder marks on the border between two hexes, e.g. the edge of a ledge or a building's wall)
- Draw **climb lines** for cliffs and walls: a straight line, a freehand stroke, a box or a circle. Every hex border the line runs through becomes a climb, so a cliff can follow the background image instead of the hex outline. Each line is one object: right-click it to remove the line and its climbs. A new line snaps onto the end of another one, so lines join up into one unbroken cliff
- Give shapes **floors**: click inside a shape made of climbs (a closed line, a building, or several lines joined up) to raise it one floor. Leave a gap in the climbs for a ramp: a gap of up to the chosen number of open borders still counts as closed, and it's marked with arrows pointing uphill. To open a gap in a closed shape, remove those climbs with the climb tool
- **Focus on a floor**: the list at the top left of the map switches floor (or `Page Up` / `Page Down`). The main floor is in focus to start with. Every other floor is tinted in its own colour with a name tag, and tokens on other floors are faded and show their floor
- **Bridges**: a hex can be on two floors at once, so one token can cross a bridge while another walks under it
- Sci-fi templates: barricades, crates, debris, alien flora, cargo containers, fuel tanks, comms dish, bunker, hab module, warehouse and command center
- Large buildings: barracks (6 hexes), reactor (7), landing pad (7, no cover), factory (12), hangar (13) and arcology (19)
- Buildings get climbs all round their walls when placed (untick "Buildings add climbs at their walls" to skip this). Removing a building removes its climbs, but keeps climbs you drew yourself and climbs another building or line still needs
- Automatic save in the browser, so closing the tab doesn't lose your work
- Save/open map files (`.hexmap.json`) and export the map as a PNG

| Action | Control |
| --- | --- |
| Light / hard cover / eraser / pan | `1` / `2` / `3` / `4` |
| Deployment / extraction zone | `5` / `6` |
| Difficult terrain / climb / dangerous terrain | `7` / `8` / `9`. With climb, click or drag along borders; click an existing climb or right-drag to remove it. The eraser also clears climbs around the hexes it erases |
| Climb line | `L`. Pick the shape under the tool. **Line**: click point by point, or drag one straight line; double-click, `Enter` or right-click to finish, click the first point to close the shape. `Backspace` takes back a point, `Esc` drops the line. Hold `Shift` (or tick the box) to snap points to hex corners |
| Floors | `G`. **Raise shape**: click inside a shape to raise it, right-click to lower it. The highlight shows what will change, with the ramps in green; it turns amber if the shape isn't closed and the area spills out over most of the map. **Open borders** sets how big a gap can be (2 borders is about 1 hex wide). **Bridge**: pick the bridge's floor at the top left and drag across the hexes; right-drag takes them off that floor |
| Rotate template | `R` (`Shift+R` for the other way) |
| Remove template or erase cover and zones | Right-click |
| Zoom | Mouse wheel |
| Move view | Space + drag, or middle-drag |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` |
| Fit map to screen | `F` |
| Deselect template | `Esc` |

## Battlemap

The battlemap always opens in the **player view**, on the running battle. That makes it suitable for a screen on the table that everyone uses. Click **🔒 GM** and draw the GM pattern on the 3×3 grid of dots to unlock everything. Drag through the dots like a phone's lock screen, or tap them in order and press **Unlock** (the keys `1`–`9` work too). **Lock to player view** before handing the screen back.

The pattern is printed in the terminal window when `Battlemap.py` starts. It's kept in `gm_passcode.txt` as the dots in the order you draw them, numbered like a phone keypad (`1 2 3` / `4 5 6` / `7 8 9`). For example, `14789` is down the left side and along the bottom. The file is created with a random 5-dot pattern the first time; edit it to change the pattern. The server never hands that file to the browser. It checks every change against who made it, and hidden tokens are never sent to a screen that isn't in GM mode, so players can't peek at an ambush through the browser's developer tools. After 5 wrong patterns in a row, that device has to wait 30 seconds. The terminal window shows the pattern, so keep it out of sight. Opened straight from disk, without the server, there is no check at all.

The sidebar's sections are dropdowns, here and in the map maker: click a heading to fold it away. Each device remembers which ones it keeps open. All the on/off settings are together under **Options**; the ones for one token are with that token.

### Turns and movement limits

**Start turn** in the top bar (or `T`) highlights your mech and every ally and deployable you have claimed, with a gold ring, until you press **End turn**. Anything you claim or deploy during your turn joins it. In GM mode and on the table screen, it acts for the selected token and everything played by the same person. Without a server, it acts for the selected token only.

To track movement, select a token, type its **Speed** and tick **Limit movement**. During a turn the token shows how far it has moved (`Moved 3/5`). If a move costs more than it has left, you get a warning, but you can still make it, since some effects boost Speed for a turn. The part of the route beyond its Speed is drawn in solid red instead of the normal dots, and the Recent list notes it. Moving only counts during a turn, and starting a turn resets the count.

### Playing together

Players on the same Wi-Fi can join from their own laptop, tablet or phone: `Battlemap.py` prints a link like `http://192.168.1.23:8765/Battlemap.html` when it starts. They only need that link and a browser. In GM mode, **Player links** (under GM mode in the sidebar) has the addresses ready to copy. Type the address in full, with `http://` and the `:8765` at the end. The first time, Windows asks whether Python may accept connections; allow it on private networks.

- Everyone sees the same battle, and every move shows up on all screens straight away
- A player types their name when they open the link. Their device remembers it, so reloading the page or opening a new tab keeps them in. **👤** in the top bar changes the name, or stops playing on that device
- To take a mech, a player clicks it and presses `C` (or **Claim**, at the top of the sidebar). Only they and the GM can then move it. Allies they deploy are theirs straight away. `C` again (or **Release**) gives it back. In GM mode, the selected token's dropdown gives it to any player
- The screen on the computer running `Battlemap.py` is the **table screen**: without a name, it moves every player and ally token, for players sitting at the table. Other devices can watch without a name, but have to join to move anything
- The GM unlocks on any screen with the pattern. Each screen has its own mode, so players stay in the player view on theirs
- The battle is kept by the server in `battle_state.json` (git-ignored), so it survives restarting `Battlemap.py`
- Only use this on a network you trust, like your home Wi-Fi: anyone on the same network can open the link

| | Table screen | Player (joined by name) | GM mode |
| --- | --- | --- | --- |
| Move, rename, set image, rotate | Player and ally tokens | The tokens they have claimed | All tokens |
| Claim and release | – | Claim free player and ally tokens; release their own | Give any player or ally token to a player, or free it |
| Spawn, resize, delete, duplicate | Allies only (drones, turrets, deployables) | Allies, which are theirs | Everything |
| Measure, Line / Cone / Blast / Burst | ✓ | ✓ | ✓ |
| Hostile and neutral tokens | Click to see what they are | Click to see what they are | Full control |
| Hidden tokens | Never sent to this screen | Never sent to this screen | Shown faded, marked HIDDEN |
| Edit map, open/save battles, main menu, display settings | – | – | ✓ |

- **Hiding**: tick "Hidden from players" on a selected token (or press `H`), or tick "New tokens start hidden" before placing an ambush. Untick it to reveal the token
- **Recent** (top right of the map) lists moves, deployments and reveals, so the table can follow what happened. Entries about hidden tokens only appear in GM mode
- Every move leaves a trail that fades away over 5 seconds, on every screen, so everyone sees what just moved and where
- Undo only takes back changes made on this screen in its current mode, never another screen's, so players can't undo the GM's setup or each other's moves

- Load the map that's open in the Map Maker, a `.hexmap.json` file, or a saved `.battle.json` (map and tokens together). You can also drop the file onto the page
- Tokens for players, allies, hostiles and neutrals, in Lancer sizes ½, 1, 2, 3 and 4. Tokens snap to the hexes, can show a picture and can be renamed, duplicated and deleted
- **Token art**: put PNG, JPG or WebP files in a `Tokens` folder next to `Battlemap.html`, then use **Art…** on a selected token to search and pick one. The app reads the frame drawn in the picture and sets the token's Size to match. Tokens only store the file name, so the art is never copied into battle files. The art in the `Tokens` folder is git-ignored and never committed; only the empty folder is
- **Movement cost**: while you drag a token, its cheapest route is drawn, with the cost shown as e.g. "Move 7 (5 + 2 extra)". Every step that costs extra is marked "+1". Hard cover blocks the route (you can turn this off under Options), but a token can still end on top of it. Building roofs are the exception: they are hard cover but can be climbed onto and crossed
- **Right-drag** anywhere to measure range, edge to edge, and what moving along that line would cost. A dotted route is only shown when going round costs less than the measured line, or when hard cover blocks the line. Hexes of light or hard cover on the path are highlighted. If an attack along the line would have cover, a shield with its penalty shows at the end of the ruler: `-1d6` for soft cover, `-2d6` for hard. This also works when measuring to an empty hex. Crossed blades with `-1d6` show when the measuring token is engaged, and a crosshair with `In Threat` when the target is inside its longer Threat
- **Measuring to a big token**: the ruler snaps to its closest hex, marked with a dashed ring. To aim at a particular hex, for example to place an area attack, hold `Shift` while dragging, or right-drag from the big token once the ruler is down. Aiming only changes the range: cover belongs to the whole token. A thin dashed line shows the centre-to-centre line that decides soft cover. To start a new ruler from that token instead, press `Esc` first. Under **Options** you can make the exact hex the default; `Shift` then snaps
- **Markers on tokens**: small symbols on a token's rim, on the side that matters. A shield means it's next to a cover tile (hollow for light cover, solid for hard), so it may have cover, depending on where the attack comes from. Crossed blades mean it's engaged by the enemy on that side. A crosshair means it's inside the longer Threat of an enemy further away. Hover a token for the details, or turn the markers off under **Options**
- **Threat**: type it next to Speed on the selected token; it starts at 1. Someone next to an enemy is already engaged, so the crosshair only shows beyond that. The Overwatch warning uses it too. Characters on other floors don't count
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
| Burst X | Every hex within X of the character's space, including the space itself. The user isn't hit by their own burst |
| Movement | Each hex costs 1. A step costs 2 if it enters difficult terrain or crosses a climb. These don't stack, so climbing into difficult terrain still costs 2. Leaving difficult terrain costs nothing extra. Large tokens pay extra if any part of them enters difficult terrain or crosses a climb. Building roofs can be walked on; getting up or down costs the climb at the wall. A ramp between neighbouring floors costs nothing extra. A climb costs the same however many floors it spans, and a drop of two floors or more with no climb marked counts as a climb. Tokens stay on their floor when the next hex has it, so walking under a bridge doesn't put you on it; stepping off a bridge's side is a climb. Characters on different floors don't block or engage each other. To drop a token onto a different floor of the same hex, focus that floor first. Range, cover and attack areas ignore floors, and cover, zones, effects and climbs apply to a hex on all its floors |
| Other characters | Allies never block movement. Anyone else blocks it if they are the mover's Size or larger, so a Size 1 mech can pass a Size ½ drone. Moving next to a hostile of that Size stops movement (engagement), unless the mover started next to them. You can't end a move in an occupied space. Starting a move next to a hostile may provoke Overwatch. Hidden tokens are left out for players |
| Dangerous terrain | No extra movement cost, but entering it means an Engineering check or 5 damage. Routes avoid it when that costs nothing extra |
| Cover | Hard cover: the target is next to hard cover and every line between the two spaces passes through hard cover. If a clear line exists, the target is flanked. Cover belongs to the whole token, whichever hex you aim at. Soft cover: the line between their centres (the middle of a big token's space) passes light cover, or hard cover the target isn't next to. An attacker's own hard cover doesn't obscure their attacks: hard cover next to the attacker doesn't count, unless it's next to the target too. Each point of Difficulty is -1d6 on the attack. Shown when measuring and for each target an area attack hits (from the blast centre for Blast). Being next to a hostile gives +1 Difficulty on ranged attacks |
| Token size | Size ½ and 1: 1 hex. Size 2: 3 hexes. Size 3: 7 hexes. Size 4: 12 hexes |

The rulebook doesn't pin down hex shapes for large tokens or cones. These are the common choices, matching how most virtual tabletops draw them.

| Action | Control |
| --- | --- |
| Move tokens / Line / Cone / Blast / Burst | `1` / `2` / `3` / `4` / `5` |
| Area size X | `[` / `]` or the − / + buttons |
| Measure range | Right-drag |
| Use an area tool | Press on the token, drag to aim (Burst: just click the token) |
| Clear measurement, then selection | `Esc` |
| Hide / reveal selected token (GM) | `H` |
| Claim / release the selected mech | `C` |
| Rotate a Size 2 or 4 token | `R` |
| Duplicate / delete selected token | `Ctrl+D` / `Delete` |
| Pan | Drag empty space, Space + drag, or middle-drag |
| Undo / redo token changes | `Ctrl+Z` / `Ctrl+Y` |
| Save battle to file | `Ctrl+S` |
