# VOXEL OPS

A browser-based, pixelated 3D wave-survival first-person shooter. No build
step, no backend — pure static files, playable straight from GitHub Pages.

**Play:** https://siddharthavarshney.github.io/voxel-ops-fps/

## What it is
A first-person shooter in the spirit of modern arcade shooters (weapon
switching, sprint/jump, wave-based enemy escalation) rendered with a
low-poly voxel art style. The 3D scene is rendered at a reduced internal
resolution and scaled up with nearest-neighbor filtering — a classic
retro/PS1-era trick that gives full 3D geometry a chunky, pixelated look
without needing pixel-art textures or sprites.

## Stack
- Vanilla JS (ES modules) + [Three.js](https://threejs.org) loaded via
  CDN through an import map — no bundler, no build step.
- IndexedDB for a local high-score leaderboard (`js/storage.js`) — scores
  persist per-browser, per-device, with no server involved.
- Web Audio API for synthesized sound effects (`js/audio.js`) — no audio
  asset files.

## Controls
| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look (click to lock pointer) |
| Left click | Fire |
| R | Reload |
| 1 / 2 / 3 | Switch weapon (Pistol / Rifle / Shotgun) |
| Shift | Sprint |
| Space | Jump |
| Esc | Pause |

## Structure
```
index.html         Menu / HUD / game-over screens + canvas mount
css/style.css       All UI styling
js/main.js          Game state machine + render loop
js/scene.js         Renderer (pixelation), lighting, arena environment
js/player.js        Pointer-lock look, movement, collision
js/weapons.js       Weapon definitions, raycasting, ammo/reload
js/enemies.js       Enemy AI + wave spawner
js/hud.js           DOM HUD updates
js/audio.js         Synthesized SFX
js/storage.js       IndexedDB high-score persistence
js/utils.js         Shared math + voxel character builder
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
