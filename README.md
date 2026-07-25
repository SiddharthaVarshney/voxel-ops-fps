# VOXEL OPS

A browser-based, pixelated 3D wave-survival first-person shooter. No build
step, no backend — pure static files, playable straight from GitHub Pages.
Works with mouse + keyboard on desktop, or touch controls on phone/tablet.

**Play:** https://siddharthavarshney.github.io/voxel-ops-fps/

## What it is
A first-person shooter in the spirit of modern arcade shooters — weapon
switching, sprint/jump, ADS, vaulting, grenades, a one-time nuke, and
wave-based enemy escalation — rendered with a low-poly voxel art style.
The 3D scene renders at a reduced internal resolution and scales up with
nearest-neighbor filtering, the classic retro/PS1-era trick that gives full
3D geometry a chunky, pixelated look. A few key characters (the player
portrait, menu art, and the Mutant Brute enemy) use real extracted sprite
artwork instead of procedural geometry.

## Stack
- Vanilla JS (ES modules) + [Three.js](https://threejs.org) loaded via
  CDN through an import map — no bundler, no build step.
- IndexedDB for a local high-score leaderboard (`js/storage.js`).
- Web Audio API for synthesized sound effects (`js/audio.js`) — no audio
  asset files.

## Controls
| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look (click to lock pointer) |
| Left click | Fire |
| Right click | Aim down sights |
| R | Reload |
| G | Throw grenade |
| N | Nuke (single-use) |
| M | Toggle minimap |
| 1 / 2 / 3 / 4 | Switch weapon (Pistol / Rifle / Shotgun / Sniper) |
| Shift | Sprint |
| Space | Jump / vault onto low cover |
| Esc | Pause |

On phone/tablet, a touch control overlay replaces these automatically: a
virtual joystick, a drag-to-look zone, and buttons for fire/ADS/jump/
reload/grenade/nuke/map/pause/weapon-switch.

## Features
- **3 maps** — Compound, Jungle, and Beach Assault, each with a distinct
  environment (rocks, trees/palms, sand, water) and its own collision +
  line-of-sight geometry.
- **4 weapons**, each with a distinct voxel model, damage, fire rate,
  spread, and effective range with damage falloff beyond it. Sniper is a
  slow, near-zero-spread one/two-shot weapon with a scoped ADS view.
- **Aim down sights** narrows FOV, tightens spread, and shows a scope
  overlay for the sniper.
- **Vault/mantle** — walk into a low crate or rock and automatically climb
  onto it; taller ones get a smooth climbing animation. Walls stay solid.
- **6 enemy types**: melee grunts, ranged riflemen, flying drones, Shield
  Troopers (block frontal damage — flank them), Heavy Gunners (suppress
  your movement speed on hit), Flamethrowers (continuous close-range
  burn), and the Mutant Brute (a tanky heavy using real sprite artwork).
  Ranged types raycast for genuine line of sight before firing. Spawn
  points are telegraphed with a pulsing ring ~1s before an enemy appears.
- **Grenades**: arcing throw with gravity/bounce, timed fuse, AoE damage
  to enemies and the player, flying debris particles, screen shake.
- **Nuke**: one-time-use panic button that instantly clears every enemy
  on the map, with a full screen flash and heavy shake.
- **Minimap**: toggleable radar showing your facing, enemies by type, and
  telegraphed spawn points.
- **Health regen** after a few seconds without damage, plus periodic
  health/ammo/grenade pickups.
- **Mobile-first input layer**: touch joystick + look-drag + button HUD,
  automatically swapped in on touch devices — no Pointer Lock dependency.

## Structure
```
index.html            Menu / level-select / HUD / mobile controls
css/style.css          All UI styling
assets/sprites/        Extracted character artwork (portrait, menu art,
                       Mutant Brute billboard)
js/main.js             Game state machine + render loop + input wiring
                       (desktop + touch)
js/scene.js            Renderer (pixelation), lighting, 3 level builders
js/player.js           Look/movement/collision, vault/mantle, health regen
js/weapons.js          Weapon defs, per-weapon models, raycasting, ADS
js/enemies.js          6 enemy types + AI + line-of-sight + spawn telegraphs
js/grenades.js         Grenade physics, particles, AoE explosion
js/pickups.js          Health/ammo/grenade pickup spawner
js/minimap.js          Canvas-drawn radar
js/hud.js              DOM HUD updates
js/audio.js            Synthesized SFX
js/storage.js          IndexedDB high-score persistence
js/utils.js            Shared math + voxel character/drone/sprite builders
```

## Local development
No build step needed — just serve the folder statically, e.g.:
```
python3 -m http.server 8000
```
then open `http://localhost:8000`.

## Deployment
Plain static files — GitHub Pages just needs to serve the repo root from
`main`. No GitHub Actions workflow required.
