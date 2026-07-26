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
import { buildVoxelSoldier, attachEnemyGun } from "./utils.js";
import * as hud from "./hud.js";
import { Minimap } from "./minimap.js";
import { saveScore, getTopScores, isNewHighScore, clearScores } from "./storage.js";
import { getSetting, setSetting } from "./storage.js";
import { playWaveStart, playPlayerHurt, playNukeBoom, setMasterVolume } from "./audio.js";

const isTouchDevice = ("ontouchstart" in window) || navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
if (isTouchDevice) {
  document.body.classList.add("touch-device");
  document.getElementById("mobile-controls").classList.add("active");
}

// ---------------- DOM refs ----------------
const screens = {
  menu: document.getElementById("screen-menu"),
  levels: document.getElementById("screen-levels"),
  howto: document.getElementById("screen-howto"),
  settings: document.getElementById("screen-settings"),
  scores: document.getElementById("screen-scores"),
  pause: document.getElementById("screen-pause"),
  gameover: document.getElementById("screen-gameover"),
};
const hudEl = document.getElementById("hud");
const canvas = document.getElementById("game-canvas");

// Renderer/module finished loading successfully - re-enable the menu that
// was shown in a disabled "loading" state (gap #4: previously the menu
// looked ready instantly while Three.js was still fetching over the CDN).
screens.menu.classList.remove("loading");
screens.menu.querySelectorAll("button").forEach((b) => (b.disabled = false));

let howtoReturnTo = "menu";

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
const minimap = new Minimap(document.getElementById("minimap"));

// ---------------- Third-person player body (hidden by default) ----------------
const playerBody = buildVoxelSoldier({ bodyColor: 0x5a5a3a, headColor: 0xc99a72 });
const headbandMat = new THREE.MeshLambertMaterial({ color: 0xaa1e1e });
const headband = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.4), headbandMat);
headband.position.y = 1.7;
playerBody.group.add(headband);
attachEnemyGun(playerBody.parts.rightArm);
playerBody.group.visible = false;
scene.add(playerBody.group);
let bodyWalkPhase = 0;

let cameraMode = "fps"; // "fps" | "tps"
const TPS_DISTANCE = 4.2;
const TPS_HEIGHT = 1.4;

function setCameraMode(mode) {
  cameraMode = mode;
  const isTps = mode === "tps";
  playerBody.group.visible = isTps;
  weapons.holder.visible = !isTps;
}

const lastBodyPos = { x: 0, z: 0 };
const tpsRaycaster = new THREE.Raycaster();

let colliders = [];
let raycastMeshes = [];
let arenaHalf = 20;
let envGroup = null;
let currentLevelId = "compound";
let currentDifficulty = "normal";

const DIFFICULTY_MULTS = {
  easy: { health: 0.7, damage: 0.65, spawnRate: 1.3 },
  normal: { health: 1, damage: 1, spawnRate: 1 },
  hard: { health: 1.45, damage: 1.4, spawnRate: 0.75 },
};

let score = 0;
let kills = 0;
let grenadeCount = 3;
let waveTransitionTimer = 0;
let nukeCount = 10;

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
  if (isTouchDevice) player.locked = false;
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
    .map((s, i) => {
      const tag = [s.difficulty, s.level].filter(Boolean).join(" · ");
      return `<li><span>#${i + 1} — Wave ${s.wave}, ${s.kills} kills${tag ? ` <em>(${tag})</em>` : ""}</span><b>${s.score}</b></li>`;
    })
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

  enemyManager.difficultyMult = DIFFICULTY_MULTS[currentDifficulty];
  enemyManager.reset();
  grenadeManager.reset();
  pickupManager.reset();

  score = 0;
  kills = 0;
  grenadeCount = 3;
  nukeCount = 10;
  document.getElementById("nuke-icon").classList.remove("used");
  document.getElementById("nuke-count").textContent = nukeCount;
  aiming = false;
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();
  setCameraMode("fps");

  hud.updateScore(score);
  hud.updateHealth(player.health, player.maxHealth);
  hud.updateGrenades(grenadeCount);
  hud.setScoped(false);

  const wave = enemyManager.startNextWave();
  hud.updateWave(wave);
  hud.updateEnemyCount(enemyManager.aliveCount + enemyManager.spawnQueue + enemyManager.pendingSpawns.length);
  refreshWeaponSlotsUI();
  playWaveStart();

  if (isTouchDevice) {
    player.enableTouchControl();
    hud.setLockHint(false);
  } else {
    hud.setLockHint(true, "Click to capture mouse");
    player.requestLock();
  }
}

function pauseGame() {
  if (gameState !== "playing") return;
  gameState = "paused";
  showScreen("pause");
  if (!isTouchDevice) player.exitLock();
}

function resumeGame() {
  gameState = "playing";
  showScreen(null);
  if (isTouchDevice) {
    player.enableTouchControl();
  } else {
    // Don't call requestLock() here directly - right after an Escape-driven
    // exit, the browser enforces a short cooldown and the request silently
    // fails with no event at all. Show the hint and let the existing
    // mousedown handler (which checks !player.locked) acquire it instead.
    hud.setLockHint(true, "Click to resume aiming");
  }
}

async function endGame() {
  gameState = "gameover";
  player.exitLock();
  if (isTouchDevice) player.locked = false;
  hudEl.classList.add("hidden");
  hud.setScoped(false);

  document.getElementById("result-wave").textContent = enemyManager.wave;
  document.getElementById("result-kills").textContent = kills;
  document.getElementById("result-score").textContent = score;

  const newHigh = await isNewHighScore(score);
  document.getElementById("new-highscore-note").classList.toggle("hidden", !newHigh);
  await saveScore({ score, wave: enemyManager.wave, kills, difficulty: currentDifficulty, level: currentLevelId });

  showScreen("gameover");
}

// ---------------- Input wiring ----------------
document.getElementById("btn-play").addEventListener("click", () => showScreen("levels"));

document.querySelectorAll(".level-card").forEach((card) =>
  card.addEventListener("click", () => {
    currentLevelId = card.dataset.level;
    document.querySelectorAll(".level-card").forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
  })
);
document.getElementById("btn-deploy").addEventListener("click", () => startGame(currentLevelId));

document.querySelectorAll(".diff-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    currentDifficulty = btn.dataset.difficulty;
    document.querySelectorAll(".diff-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
  })
);
document.getElementById("btn-scores").addEventListener("click", showScores);
document.getElementById("btn-howto").addEventListener("click", () => {
  howtoReturnTo = "menu";
  showScreen("howto");
});
document.getElementById("btn-settings").addEventListener("click", () => showScreen("settings"));
document.getElementById("btn-pause-howto").addEventListener("click", () => {
  howtoReturnTo = "pause";
  showScreen("howto");
});
document.querySelectorAll(".back-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    if (btn.closest("#screen-howto")) {
      showScreen(howtoReturnTo);
      return;
    }
    showScreen("menu");
  })
);

document.getElementById("btn-clear-scores").addEventListener("click", async () => {
  await clearScores();
  showScores();
});

// ---------------- Settings (gap #13) ----------------
const settingSensitivity = document.getElementById("setting-sensitivity");
const settingVolume = document.getElementById("setting-volume");
const settingInvertY = document.getElementById("setting-invert-y");

function applySensitivity(step) {
  // step 1..10 -> a reasonable mouse-look sensitivity range
  player.sensitivity = 0.0009 + (step - 1) * 0.00042;
}

(async () => {
  const savedSens = await getSetting("sensitivity", 5);
  const savedVol = await getSetting("volume", 10);
  const savedInvert = await getSetting("invertY", false);
  settingSensitivity.value = savedSens;
  settingVolume.value = savedVol;
  settingInvertY.checked = savedInvert;
  applySensitivity(Number(savedSens));
  setMasterVolume(Number(savedVol) / 10);
  player.invertY = savedInvert;
})();

settingSensitivity.addEventListener("input", () => {
  applySensitivity(Number(settingSensitivity.value));
  setSetting("sensitivity", Number(settingSensitivity.value));
});
settingVolume.addEventListener("input", () => {
  setMasterVolume(Number(settingVolume.value) / 10);
  setSetting("volume", Number(settingVolume.value));
});
settingInvertY.addEventListener("change", () => {
  player.invertY = settingInvertY.checked;
  setSetting("invertY", settingInvertY.checked);
});

document.getElementById("btn-resume").addEventListener("click", resumeGame);

// Quit needs a second tap to confirm - a mis-tap on the small pause-screen
// button used to end the run instantly with no way back (gap #3).
const quitBtn = document.getElementById("btn-quit");
let quitConfirmTimeout = null;
quitBtn.addEventListener("click", () => {
  if (quitBtn.classList.contains("btn-confirm")) {
    clearTimeout(quitConfirmTimeout);
    quitBtn.classList.remove("btn-confirm");
    quitBtn.textContent = "Quit to Menu";
    showMenu();
  } else {
    quitBtn.classList.add("btn-confirm");
    quitBtn.textContent = "Tap again to quit";
    quitConfirmTimeout = setTimeout(() => {
      quitBtn.classList.remove("btn-confirm");
      quitBtn.textContent = "Quit to Menu";
    }, 3000);
  }
});

document.getElementById("btn-retry").addEventListener("click", () => startGame(currentLevelId));
document.getElementById("btn-gameover-menu").addEventListener("click", showMenu);

player.onLockChange = (locked) => {
  if (gameState === "playing") {
    hud.setLockHint(!locked, "Click to capture mouse");
    if (!locked) pauseGame();
  }
};

// A requestPointerLock() call can silently fail (e.g. Chrome's brief cooldown
// right after an Escape-triggered exit) with no pointerlockchange event at
// all - previously this left mouse look dead with zero explanation (gap #2).
player.onLockError = () => {
  if (gameState === "playing") hud.setLockHint(true, "Click to resume aiming");
};

player.onDamage = (amount, sourcePos) => {
  hud.flashDamage();
  playPlayerHurt();
  triggerShake(0.18, 0.06);
  if (sourcePos) {
    const dx = sourcePos.x - player.position.x;
    const dz = sourcePos.z - player.position.z;
    const worldAngle = Math.atan2(dx, dz);
    const relative = worldAngle - player.yaw;
    hud.flashDamageDirection(relative);
  }
};

function triggerShake(duration, magnitude) {
  shakeTime = Math.max(shakeTime, duration);
  shakeMag = Math.max(shakeMag, magnitude);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});

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
  if (e.code === "Digit5") weapons.switchTo(4);
  refreshWeaponSlotsUI();
  if (e.code === "KeyR") weapons.startReload();
  if (e.code === "KeyG") throwGrenade();
  if (e.code === "KeyN") useNuke();
  if (e.code === "KeyM") minimap.toggle();
  if (e.code === "KeyV") setCameraMode(cameraMode === "fps" ? "tps" : "fps");
});

let mouseHeld = false;
let aiming = false;

renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

renderer.domElement.addEventListener("mousedown", (e) => {
  if (isTouchDevice) return;
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
  if (isTouchDevice) return;
  if (e.button === 0) mouseHeld = false;
  if (e.button === 2) {
    aiming = false;
    weapons.setAiming(false);
  }
});

function fireWeapon() {
  weapons.tryFire(enemyManager.getHitTargets(), raycastMeshes, (enemy, damage, point, origin) => {
    const killed = enemy.takeDamage(damage, origin);
    hud.flashHitmarker();
    if (killed) {
      kills++;
      score += 100;
    }
  });
}

function refreshWeaponSlotsUI() {
  const slots = weapons.state.map((s) => ({ hasAmmo: s.ammoInMag > 0 || s.ammoReserve > 0 || s.ammoReserve === Infinity }));
  hud.updateWeaponSlots(slots, weapons.index);
  document.querySelectorAll(".touch-weapon-btn").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.weapon) === weapons.index);
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

function useNuke() {
  if (nukeCount <= 0 || !player.locked) return;
  nukeCount--;
  document.getElementById("nuke-count").textContent = nukeCount;
  if (nukeCount <= 0) document.getElementById("nuke-icon").classList.add("used");

  for (const enemy of enemyManager.enemies) {
    if (enemy.state !== "alive") continue;
    const killed = enemy.takeDamage(99999);
    if (killed) {
      kills++;
      score += 100;
    }
  }

  playNukeBoom();
  triggerShake(0.9, 0.28);

  const flash = document.getElementById("nuke-flash");
  flash.classList.remove("show");
  void flash.offsetWidth;
  flash.classList.add("show");
  setTimeout(() => flash.classList.remove("show"), 1200);
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

// ---------------- Mobile touch controls ----------------
if (isTouchDevice) {
  const joystickBase = document.getElementById("joystick-base");
  const joystickKnob = document.getElementById("joystick-knob");
  const lookZone = document.getElementById("look-zone");
  const touchFire = document.getElementById("touch-fire");

  const JOY_RADIUS = 55;
  let joyTouchId = null;
  let joyCenter = { x: 0, y: 0 };

  function setJoystickInput(dx, dy) {
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, JOY_RADIUS);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    const mag = clamped / JOY_RADIUS;
    joystickKnob.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
    // Screen-space: up (negative dy) = forward, right (positive dx) = strafe right.
    player.analogForward = -ny * mag;
    player.analogStrafe = nx * mag;
    const sprinting = mag > 0.85;
    if (sprinting) player.keys.add("ShiftLeft");
    else player.keys.delete("ShiftLeft");
  }

  function resetJoystick() {
    joyTouchId = null;
    joystickKnob.style.transform = "translate(0px, 0px)";
    player.analogForward = 0;
    player.analogStrafe = 0;
    player.keys.delete("ShiftLeft");
  }

  joystickBase.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    const rect = joystickBase.getBoundingClientRect();
    joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    joyTouchId = t.identifier;
    setJoystickInput(t.clientX - joyCenter.x, t.clientY - joyCenter.y);
  }, { passive: false });

  joystickBase.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyTouchId) {
        setJoystickInput(t.clientX - joyCenter.x, t.clientY - joyCenter.y);
      }
    }
  }, { passive: false });

  ["touchend", "touchcancel"].forEach((evt) =>
    joystickBase.addEventListener(evt, (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyTouchId) resetJoystick();
      }
    })
  );

  // Look zone: drag anywhere on the right side of the screen to aim.
  let lookTouchId = null;
  let lastLook = { x: 0, y: 0 };

  lookZone.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lastLook = { x: t.clientX, y: t.clientY };
  }, { passive: false });

  lookZone.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === lookTouchId) {
        const dx = t.clientX - lastLook.x;
        const dy = t.clientY - lastLook.y;
        lastLook = { x: t.clientX, y: t.clientY };
        if (gameState === "playing") player.lookBy(dx * 1.4, dy * 1.4);
      }
    }
  }, { passive: false });

  ["touchend", "touchcancel"].forEach((evt) =>
    lookZone.addEventListener(evt, (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === lookTouchId) lookTouchId = null;
      }
    })
  );

  touchFire.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (gameState !== "playing") return;
    mouseHeld = true;
    fireWeapon();
  }, { passive: false });
  ["touchend", "touchcancel"].forEach((evt) =>
    touchFire.addEventListener(evt, (e) => {
      e.preventDefault();
      mouseHeld = false;
    }, { passive: false })
  );

  document.getElementById("touch-ads").addEventListener("touchstart", (e) => {
    e.preventDefault();
    aiming = true;
    weapons.setAiming(true);
  }, { passive: false });
  document.getElementById("touch-ads").addEventListener("touchend", (e) => {
    e.preventDefault();
    aiming = false;
    weapons.setAiming(false);
  }, { passive: false });

  const jumpBtn = document.getElementById("touch-jump");
  jumpBtn.addEventListener("touchstart", (e) => { e.preventDefault(); player.keys.add("Space"); }, { passive: false });
  jumpBtn.addEventListener("touchend", (e) => { e.preventDefault(); player.keys.delete("Space"); }, { passive: false });

  document.getElementById("touch-reload").addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (gameState === "playing") weapons.startReload();
  }, { passive: false });

  document.getElementById("touch-grenade").addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (gameState === "playing") throwGrenade();
  }, { passive: false });

  document.getElementById("touch-nuke").addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (gameState === "playing") useNuke();
  }, { passive: false });

  document.getElementById("touch-map").addEventListener("touchstart", (e) => {
    e.preventDefault();
    minimap.toggle();
  }, { passive: false });

  document.getElementById("touch-view").addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (gameState === "playing") setCameraMode(cameraMode === "fps" ? "tps" : "fps");
  }, { passive: false });

  document.getElementById("touch-pause").addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (gameState === "playing") pauseGame();
    else if (gameState === "paused") resumeGame();
  }, { passive: false });

  document.querySelectorAll(".touch-weapon-btn").forEach((btn) => {
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (gameState === "playing") {
        weapons.switchTo(parseInt(btn.dataset.weapon, 10));
        refreshWeaponSlotsUI();
      }
    }, { passive: false });
  });

  // Landscape orientation enforcement — FPS controls need width, and the
  // touch layout (joystick + buttons) is designed for landscape only.
  const rotatePrompt = document.getElementById("rotate-prompt");
  const pauseTitle = document.querySelector("#screen-pause .panel-title");
  let pausedByRotation = false;
  function checkOrientation() {
    const isPortrait = window.innerHeight > window.innerWidth;
    rotatePrompt.classList.toggle("hidden", !isPortrait);
    if (isPortrait && gameState === "playing") {
      pausedByRotation = true;
      if (pauseTitle) pauseTitle.textContent = "Paused — rotate back to play";
      pauseGame();
    } else if (!isPortrait && pausedByRotation && gameState === "paused") {
      pausedByRotation = false;
      if (pauseTitle) pauseTitle.textContent = "Paused";
      resumeGame();
    }
  }
  window.addEventListener("resize", checkOrientation);
  window.addEventListener("orientationchange", checkOrientation);
  checkOrientation();
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
      onPlayerHit: (dmg, sourcePos) => player.takeDamage(dmg, sourcePos),
      onSuppressed: () => player.applySpeedDebuff(0.55, 1.6),
      onEnemyThrowGrenade: (pos, dir) => grenadeManager.throwGrenade(pos, dir),
    });
    if (enemyManager.consumeVeerSpawnFlag()) {
      hud.showWaveBanner("⚠ SHADOW LEGION OPERATIVE", "VEER — \"STRIPES\" HAS ENTERED", 2200);
    }

    grenadeManager.update(dt, colliders, arenaHalf, {
      enemies: enemyManager.enemies,
      player,
      onExplode: (pos, distToPlayer) => {
        if (distToPlayer !== null) triggerShake(0.35, 0.14);
        else triggerShake(0.15, 0.05);
      },
    });

    pickupManager.update(dt, player.position, handlePickup);
    minimap.draw(player, enemyManager, arenaHalf);

    if (cameraMode === "tps") {
      playerBody.group.position.set(player.position.x, player.position.y - 1.7, player.position.z);
      playerBody.group.rotation.y = player.yaw;

      const moved = Math.hypot(player.position.x - lastBodyPos.x, player.position.z - lastBodyPos.z);
      if (moved > 0.0015) {
        bodyWalkPhase += dt * 8;
        const swing = Math.sin(bodyWalkPhase) * 0.5;
        playerBody.parts.leftLeg.rotation.x = swing;
        playerBody.parts.rightLeg.rotation.x = -swing;
        playerBody.parts.leftArm.rotation.x = -swing * 0.6;
        playerBody.parts.rightArm.rotation.x = -0.3 + swing * 0.3;
      } else {
        playerBody.parts.leftLeg.rotation.x *= 0.8;
        playerBody.parts.rightLeg.rotation.x *= 0.8;
      }
      lastBodyPos.x = player.position.x;
      lastBodyPos.z = player.position.z;

      const backX = Math.sin(player.yaw);
      const backZ = Math.cos(player.yaw);
      let dist = TPS_DISTANCE;

      tpsRaycaster.set(player.position, new THREE.Vector3(backX, 0, backZ).normalize());
      tpsRaycaster.far = TPS_DISTANCE;
      const hits = tpsRaycaster.intersectObjects(raycastMeshes, true);
      if (hits.length > 0) dist = Math.max(0.6, hits[0].distance - 0.3);

      camera.position.set(
        player.position.x + backX * dist,
        player.position.y + TPS_HEIGHT,
        player.position.z + backZ * dist
      );
    }

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
    hud.updateEnemyCount(enemyManager.aliveCount + enemyManager.spawnQueue + enemyManager.pendingSpawns.length);
    hud.updateWeapon(weapons.current.name, weapons.currentState.ammoInMag, weapons.currentState.ammoReserve);
    refreshWeaponSlotsUI();
    hud.setReloading(weapons.reloading);
    if (weapons.reloading) {
      hud.setReloadProgress(1 - weapons.reloadTimer / weapons.current.reloadTime);
    }

    if (!player.alive) {
      endGame();
    } else if (enemyManager.waveCleared) {
      if (waveTransitionTimer === 0) {
        hud.showWaveBanner(`WAVE ${enemyManager.wave} CLEARED`, `+${50 * enemyManager.wave} SCORE`);
      }
      waveTransitionTimer += dt;
      if (waveTransitionTimer > 1.5) {
        waveTransitionTimer = 0;
        score += 50 * enemyManager.wave;
        const wave = enemyManager.startNextWave();
        hud.updateWave(wave);
        hud.showWaveBanner(`WAVE ${wave} INCOMING`);
        playWaveStart();
      }
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
showMenu();
