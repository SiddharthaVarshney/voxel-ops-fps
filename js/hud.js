const el = {
  wave: document.getElementById("hud-wave-num"),
  score: document.getElementById("hud-score-num"),
  enemies: document.getElementById("hud-enemies-num"),
  healthFill: document.getElementById("health-fill"),
  weaponName: document.getElementById("weapon-name"),
  weaponAmmo: document.getElementById("weapon-ammo"),
  reloadIndicator: document.getElementById("reload-indicator"),
  reloadBar: document.getElementById("reload-bar"),
  reloadBarFill: document.getElementById("reload-bar-fill"),
  hitmarker: document.getElementById("hitmarker"),
  damageFlash: document.getElementById("damage-flash"),
  lockHint: document.getElementById("lock-hint"),
  grenadeCount: document.getElementById("grenade-count"),
  scopeOverlay: document.getElementById("scope-overlay"),
  toastContainer: document.getElementById("toast-container"),
  waveBanner: document.getElementById("wave-banner"),
  waveBannerTitle: document.getElementById("wave-banner-title"),
  waveBannerSub: document.getElementById("wave-banner-sub"),
  weaponSlots: document.getElementById("weapon-slots"),
  dirIndicator: document.getElementById("damage-direction"),
};

let hitmarkerTimeout = null;
let damageFlashTimeout = null;
let waveBannerTimeout = null;

export function updateWave(wave) {
  el.wave.textContent = wave;
}

export function updateScore(score) {
  el.score.textContent = score;
}

export function updateEnemyCount(count) {
  if (el.enemies) el.enemies.textContent = count;
}

export function updateHealth(health, maxHealth) {
  const pct = Math.max(0, (health / maxHealth) * 100);
  el.healthFill.style.width = pct + "%";
  el.healthFill.classList.toggle("low", pct <= 30);
}

export function updateWeapon(name, ammoInMag, ammoReserve) {
  el.weaponName.textContent = name;
  const magText = ammoInMag === Infinity ? "∞" : ammoInMag;
  const reserveText = ammoReserve === Infinity ? "∞" : ammoReserve;
  el.weaponAmmo.textContent = `${magText} / ${reserveText}`;
}

// slots: array of { name, hasAmmo }; activeIndex: which slot is equipped
export function updateWeaponSlots(slots, activeIndex) {
  if (!el.weaponSlots) return;
  [...el.weaponSlots.children].forEach((node, i) => {
    node.classList.toggle("active", i === activeIndex);
    node.classList.toggle("empty", slots[i] && !slots[i].hasAmmo);
  });
}

export function setReloading(isReloading) {
  el.reloadIndicator.classList.toggle("hidden", !isReloading);
  if (el.reloadBar) el.reloadBar.classList.toggle("hidden", !isReloading);
}

export function setReloadProgress(pct) {
  if (el.reloadBarFill) el.reloadBarFill.style.width = Math.max(0, Math.min(100, pct * 100)) + "%";
}

export function flashHitmarker() {
  el.hitmarker.classList.remove("show");
  void el.hitmarker.offsetWidth; // restart animation
  el.hitmarker.classList.add("show");
  clearTimeout(hitmarkerTimeout);
  hitmarkerTimeout = setTimeout(() => el.hitmarker.classList.remove("show"), 250);
  if (navigator.vibrate) navigator.vibrate(15);
}

export function flashDamage() {
  el.damageFlash.classList.add("show");
  clearTimeout(damageFlashTimeout);
  damageFlashTimeout = setTimeout(() => el.damageFlash.classList.remove("show"), 120);
  if (navigator.vibrate) navigator.vibrate(60);
}

// angleFromFacing: radians, 0 = directly ahead, +/- PI/2 = right/left, PI = behind.
// Lights up one of four wedges around the crosshair so the player always
// knows which way to turn without needing the minimap open.
export function flashDamageDirection(angleFromFacing) {
  if (!el.dirIndicator) return;
  let deg = (angleFromFacing * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  let quadrant = "front";
  if (deg >= 45 && deg < 135) quadrant = "right";
  else if (deg >= 135 && deg < 225) quadrant = "back";
  else if (deg >= 225 && deg < 315) quadrant = "left";

  const wedge = el.dirIndicator.querySelector(`.dir-${quadrant}`);
  if (!wedge) return;
  wedge.classList.remove("show");
  void wedge.offsetWidth;
  wedge.classList.add("show");
}

export function setLockHint(visible, text) {
  el.lockHint.classList.toggle("hidden", !visible);
  if (text) el.lockHint.textContent = text;
}

export function updateGrenades(count) {
  if (el.grenadeCount) el.grenadeCount.textContent = count;
}

export function setScoped(isScoped) {
  el.scopeOverlay?.classList.toggle("hidden", !isScoped);
}

// Reusable banner for wave-clear / wave-incoming beats - the single most
// important loop event previously had zero screen presence.
export function showWaveBanner(title, subtitle, duration = 1600) {
  if (!el.waveBanner) return;
  el.waveBannerTitle.textContent = title;
  el.waveBannerSub.textContent = subtitle || "";
  el.waveBanner.classList.remove("hidden");
  el.waveBanner.classList.remove("show");
  void el.waveBanner.offsetWidth;
  el.waveBanner.classList.add("show");
  clearTimeout(waveBannerTimeout);
  waveBannerTimeout = setTimeout(() => {
    el.waveBanner.classList.remove("show");
    el.waveBanner.classList.add("hidden");
  }, duration);
}

const TOAST_LABELS = {
  health: "+25 HP",
  ammo: "+AMMO",
  grenade: "+1 GRENADE",
};

export function showPickupToast(type) {
  if (!el.toastContainer) return;
  const toast = document.createElement("div");
  toast.className = "pickup-toast";
  toast.textContent = TOAST_LABELS[type] || "PICKUP";
  el.toastContainer.appendChild(toast);
  setTimeout(() => toast.classList.add("rise"), 10);
  setTimeout(() => toast.remove(), 1400);
}
