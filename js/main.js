import * as THREE from "three";
import {
  createRenderer,
  resizeRenderer,
  createScene,
  createCamera,
  addLighting,
  LEVELS,
  disposeEnvironment,
} from "./scene.js";
import { Player } from "./player.js";
import { WeaponManager, WEAPON_DEFS } from "./weapons.js";
import { EnemyManager } from "./enemies.js";
import { GrenadeManager } from "./grenades.js";
import { PickupManager } from "./pickups.js";
import * as hud from "./hud.js";
import { saveScore, getTopScores, isNewHighScore } from "./storage.js";
import { playWaveStart, playPlayerHurt } from "./audio.js";

// ---------------- DOM refs ----------------
const screens = {
  menu: document.getElementById("screen-menu"),
  levels: document.getElementById("screen-levels"),
  howto: document.getElementById("screen-howto"),
  scores: document.getElementById("screen-scores"),
  pause: document.getElementById("screen-pause"),
  gameover: document.getElementById("screen-gameover"),
};
const hudEl = document.getElementById("hud");
const canvas = document.getElementById("game-canvas");

let gameState = "menu"; // menu | playing | paused | gameover

// ---------------- Three.js setup ----------------
const renderer = createRenderer(canvas);
const scene = createScene();
const camera = createCamera();
scene.add(camera); // required so viewmodel (gun), parented to camera, gets rendered
const BASE_FOV = camera.fov;
addLighting(scene);

const player = new Player(camera, renderer.domElement);
const weapons = new WeaponManager(camera, scene);
const enemyManager = new EnemyManager(scene);
const grenadeManager = new GrenadeManager(scene);
const pickupManager = new PickupManager(scene);

let colliders = [];
let raycastMeshes = [];
let arenaHalf = 20;
let envGroup = null;
let currentLevelId = "compound";

let score = 0;
let kills = 0;
let grenadeCount = 3;
let waveTransitionTimer = 0;

// simple camera shake state
let shakeTime = 0;
let shakeMag = 0;

resizeRenderer(renderer, camera);
window.addEventListener("resize", () => resizeRenderer(renderer, camera));

function loadLevel(levelId) {
  const level = LEVELS.find((l) => l.id === levelId) || LEVELS[0];
  currentLevelId = level.id;
  disposeEnvironment(scene, envGroup);
  const built = level.build(scene);
  colliders = built.colliders;
  raycastMeshes = built.raycastMeshes;
  arenaHalf = built.arenaHalf;
  envGroup = built.envGroup;
  enemyManager.arenaHalf = arenaHalf;
  pickupManager.arenaHalf = arenaHalf;
}

loadLevel(currentLevelId);

// ---------------- Screen management ----------------
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  if (name && screens[name]) screens[name].classList.remove("hidden");
}

function showMenu() {
  gameState = "menu";
  showScreen("menu");
  hudEl.classList.add("hidden");
  player.exitLock();
}

async function showScores() {
  showScreen("scores");
  const list = document.getElementById("score-list");
  const top = await getTopScores(10);
  if (top.length === 0) {
    list.innerHTML = '<li class="score-empty">No runs yet — go make history.</li>';
    return;
  }
  list.innerHTML = top
    .map(
      (s, i) =>
        `<li><span>#${i + 1} — Wave ${s.wave}, ${s.kills} kills</span><b>${s.score}</b></li>`
    )
    .join("");
}

function startGame(levelId) {
  loadLevel(levelId || currentLevelId);

  gameState = "playing";
  showScreen(null);
  hudEl.classList.remove("hidden");

  player.reset();

  weapons.index = 0;
  weapons.reloading = false;
  weapons.reloadTimer = 0;
  weapons.cooldownTimer = 0;
  weapons.setAiming(false);
  weapons.holder.position.copy(weapons.hipPosition);
  weapons.gunModels.forEach((m, i) => (m.visible = i === 0));
  weapons.state.forEach((s, i) => {
    s.ammoInMag = WEAPON_DEFS[i].magSize;
    s.ammoReserve = WEAPON_DEFS[i].reserveMax;
  });

  enemyManager.reset();
  grenadeManager.reset();
  pickupManager.reset();

  score = 0;
  kills = 0;
  grenadeCount = 3;
  aiming = false;
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();

  hud.updateScore(score);
  hud.updateHealth(player.health, player.maxHealth);
  hud.updateGrenades(grenadeCount);
  hud.setScoped(false);

  const wave = enemyManager.startNextWave();
  hud.updateWave(wave);
  playWaveStart();

  hud.setLockHint(true, "Click to aim");
  player.requestLock();
}

function pauseGame() {
  if (gameState !== "playing") return;
  gameState = "paused";
  showScreen("pause");
  player.exitLock();
}

function resumeGame() {
  gameState = "playing";
  showScreen(null);
  player.requestLock();
}

async function endGame() {
  gameState = "gameover";
  player.exitLock();
  hudEl.classList.add("hidden");
  hud.setScoped(false);

  document.getElementById("result-wave").textContent = enemyManager.wave;
  document.getElementById("result-kills").textContent = kills;
  document.getElementById("result-score").textContent = score;

  const newHigh = await isNewHighScore(score);
  document.getElementById("new-highscore-note").classList.toggle("hidden", !newHigh);
  await saveScore({ score, wave: enemyManager.wave, kills });

  showScreen("gameover");
}

// ---------------- Input wiring ----------------
document.getElementById("btn-play").addEventListener("click", () => showScreen("levels"));
document.querySelectorAll(".level-btn").forEach((btn) =>
  btn.addEventListener("click", () => startGame(btn.dataset.level))
);
document.getElementById("btn-scores").addEventListener("click", showScores);
document.getElementById("btn-howto").addEventListener("click", () => showScreen("howto"));
document.querySelectorAll(".back-btn").forEach((btn) =>
  btn.addEventListener("click", () => showScreen("menu"))
);

document.getElementById("btn-resume").addEventListener("click", resumeGame);
document.getElementById("btn-quit").addEventListener("click", showMenu);
document.getElementById("btn-retry").addEventListener("click", () => startGame(currentLevelId));
document.getElementById("btn-gameover-menu").addEventListener("click", showMenu);

player.onLockChange = (locked) => {
  if (gameState === "playing") {
    hud.setLockHint(!locked, "Click to aim");
    if (!locked) pauseGame();
  }
};

player.onDamage = () => {
  hud.flashDamage();
  playPlayerHurt();
  triggerShake(0.18, 0.06);
};

function triggerShake(duration, magnitude) {
  shakeTime = Math.max(shakeTime, duration);
  shakeMag = Math.max(shakeMag, magnitude);
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    if (gameState === "playing") pauseGame();
    else if (gameState === "paused") resumeGame();
  }
  if (gameState !== "playing") return;

  if (e.code === "Digit1") weapons.switchTo(0);
  if (e.code === "Digit2") weapons.switchTo(1);
  if (e.code === "Digit3") weapons.switchTo(2);
  if (e.code === "Digit4") weapons.switchTo(3);
  if (e.code === "KeyR") weapons.startReload();
  if (e.code === "KeyG") throwGrenade();
});

let mouseHeld = false;
let aiming = false;

renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

renderer.domElement.addEventListener("mousedown", (e) => {
  if (gameState === "playing" && !player.locked) {
    player.requestLock();
    return;
  }
  if (gameState !== "playing" || !player.locked) return;

  if (e.button === 0) {
    mouseHeld = true;
    fireWeapon();
  } else if (e.button === 2) {
    aiming = true;
    weapons.setAiming(true);
  }
});

document.addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseHeld = false;
  if (e.button === 2) {
    aiming = false;
    weapons.setAiming(false);
  }
});

function fireWeapon() {
  weapons.tryFire(enemyManager.getHitTargets(), raycastMeshes, (enemy, damage, point) => {
    const killed = enemy.takeDamage(damage);
    hud.flashHitmarker();
    if (killed) {
      kills++;
      score += 100;
    }
  });
}

function throwGrenade() {
  if (!player.locked || grenadeCount <= 0) return;
  const dir = new THREE.Vector3(0, 0, -1);
  dir.applyQuaternion(camera.quaternion);
  dir.y += 0.15;
  dir.normalize();
  const origin = camera.getWorldPosition(new THREE.Vector3());
  grenadeManager.throwGrenade(origin, dir);
  grenadeCount--;
  hud.updateGrenades(grenadeCount);
}

function handlePickup(type) {
  if (type === "health") {
    player.heal(25);
  } else if (type === "ammo") {
    weapons.addReserveAmmo(WEAPON_DEFS[weapons.index].magSize * 2);
  } else if (type === "grenade") {
    grenadeCount = Math.min(5, grenadeCount + 1);
    hud.updateGrenades(grenadeCount);
  }
  hud.showPickupToast(type);
}

// ---------------- Game loop ----------------
let lastTime = performance.now();

function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (gameState === "playing") {
    player.update(dt, colliders, arenaHalf);
    weapons.update(dt);

    if (weapons.current.auto && mouseHeld && player.locked) {
      fireWeapon();
    }

    enemyManager.update(dt, player.position, colliders, raycastMeshes, {
      onPlayerHit: (dmg) => player.takeDamage(dmg),
    });

    grenadeManager.update(dt, colliders, arenaHalf, {
      enemies: enemyManager.enemies,
      player,
      onExplode: (pos, distToPlayer) => {
        if (distToPlayer !== null) triggerShake(0.35, 0.14);
        else triggerShake(0.15, 0.05);
      },
    });

    pickupManager.update(dt, player.position, handlePickup);

    // camera shake decay
    if (shakeTime > 0) {
      shakeTime = Math.max(0, shakeTime - dt);
      const s = shakeMag * (shakeTime > 0 ? 1 : 0);
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
    }

    // ADS field-of-view lerp
    const targetFov = aiming ? BASE_FOV / weapons.current.adsZoom : BASE_FOV;
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
    hud.setScoped(aiming && !!weapons.current.scoped);

    hud.updateHealth(player.health, player.maxHealth);
    hud.updateScore(score);
    hud.updateWeapon(weapons.current.name, weapons.currentState.ammoInMag, weapons.currentState.ammoReserve);
    hud.setReloading(weapons.reloading);

    if (!player.alive) {
      endGame();
    } else if (enemyManager.waveCleared) {
      waveTransitionTimer += dt;
      if (waveTransitionTimer > 1.5) {
        waveTransitionTimer = 0;
        score += 50 * enemyManager.wave;
        const wave = enemyManager.startNextWave();
        hud.updateWave(wave);
        playWaveStart();
      }
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
showMenu();
