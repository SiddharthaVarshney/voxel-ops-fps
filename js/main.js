import * as THREE from "three";
import { createRenderer, resizeRenderer, createScene, createCamera, addLighting, buildArena } from "./scene.js";
import { Player } from "./player.js";
import { WeaponManager, WEAPON_DEFS } from "./weapons.js";
import { EnemyManager } from "./enemies.js";
import * as hud from "./hud.js";
import { saveScore, getTopScores, isNewHighScore } from "./storage.js";
import { playWaveStart, playPlayerHurt } from "./audio.js";

// ---------------- DOM refs ----------------
const screens = {
  menu: document.getElementById("screen-menu"),
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
addLighting(scene);
const { colliders, arenaHalf } = buildArena(scene);

const player = new Player(camera, renderer.domElement);
const weapons = new WeaponManager(camera, scene);
const enemyManager = new EnemyManager(scene);
enemyManager.arenaHalf = arenaHalf;

let score = 0;
let kills = 0;
let waveTransitionTimer = 0;

resizeRenderer(renderer, camera);
window.addEventListener("resize", () => resizeRenderer(renderer, camera));

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

function startGame() {
  gameState = "playing";
  showScreen(null);
  hudEl.classList.remove("hidden");

  player.reset();
  weapons.index = 0;
  weapons.reloading = false;
  weapons.reloadTimer = 0;
  weapons.cooldownTimer = 0;
  weapons.gunMesh.material.color.set(WEAPON_DEFS[0].color);
  weapons.state.forEach((s, i) => {
    s.ammoInMag = WEAPON_DEFS[i].magSize;
    s.ammoReserve = WEAPON_DEFS[i].reserveMax;
  });

  enemyManager.reset();
  score = 0;
  kills = 0;
  hud.updateScore(score);
  hud.updateHealth(player.health, player.maxHealth);

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

  document.getElementById("result-wave").textContent = enemyManager.wave;
  document.getElementById("result-kills").textContent = kills;
  document.getElementById("result-score").textContent = score;

  const newHigh = await isNewHighScore(score);
  document.getElementById("new-highscore-note").classList.toggle("hidden", !newHigh);
  await saveScore({ score, wave: enemyManager.wave, kills });

  showScreen("gameover");
}

// ---------------- Input wiring ----------------
document.getElementById("btn-play").addEventListener("click", startGame);
document.getElementById("btn-scores").addEventListener("click", showScores);
document.getElementById("btn-howto").addEventListener("click", () => showScreen("howto"));
document.querySelectorAll(".back-btn").forEach((btn) =>
  btn.addEventListener("click", () => showScreen("menu"))
);

document.getElementById("btn-resume").addEventListener("click", resumeGame);
document.getElementById("btn-quit").addEventListener("click", () => {
  gameState = "menu";
  showMenu();
});
document.getElementById("btn-retry").addEventListener("click", startGame);
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
};

document.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    if (gameState === "playing") pauseGame();
    else if (gameState === "paused") resumeGame();
  }
  if (gameState !== "playing") return;

  if (e.code === "Digit1") weapons.switchTo(0);
  if (e.code === "Digit2") weapons.switchTo(1);
  if (e.code === "Digit3") weapons.switchTo(2);
  if (e.code === "KeyR") weapons.startReload();
});

let mouseHeld = false;
renderer.domElement.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  mouseHeld = true;
  if (gameState === "playing" && player.locked) {
    fireWeapon();
  } else if (gameState === "playing" && !player.locked) {
    player.requestLock();
  }
});
document.addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseHeld = false;
});

function fireWeapon() {
  weapons.tryFire(enemyManager.getHitTargets(), (enemy, damage, point) => {
    const killed = enemy.takeDamage(damage);
    hud.flashHitmarker();
    if (killed) {
      kills++;
      score += 100;
    }
  });
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

    enemyManager.update(dt, player.position, colliders, {
      onPlayerHit: (dmg) => player.takeDamage(dmg),
    });

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
