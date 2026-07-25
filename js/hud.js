const el = {
  wave: document.getElementById("hud-wave-num"),
  score: document.getElementById("hud-score-num"),
  healthFill: document.getElementById("health-fill"),
  weaponName: document.getElementById("weapon-name"),
  weaponAmmo: document.getElementById("weapon-ammo"),
  reloadIndicator: document.getElementById("reload-indicator"),
  hitmarker: document.getElementById("hitmarker"),
  damageFlash: document.getElementById("damage-flash"),
  lockHint: document.getElementById("lock-hint"),
  grenadeCount: document.getElementById("grenade-count"),
  scopeOverlay: document.getElementById("scope-overlay"),
  toastContainer: document.getElementById("toast-container"),
};

let hitmarkerTimeout = null;
let damageFlashTimeout = null;

export function updateWave(wave) {
  el.wave.textContent = wave;
}

export function updateScore(score) {
  el.score.textContent = score;
}

export function updateHealth(health, maxHealth) {
  const pct = Math.max(0, (health / maxHealth) * 100);
  el.healthFill.style.width = pct + "%";
  el.healthFill.classList.toggle("low", pct <= 30);
}

export function updateWeapon(name, ammoInMag, ammoReserve) {
  el.weaponName.textContent = name;
  const reserveText = ammoReserve === Infinity ? "∞" : ammoReserve;
  el.weaponAmmo.textContent = `${ammoInMag} / ${reserveText}`;
}

export function setReloading(isReloading) {
  el.reloadIndicator.classList.toggle("hidden", !isReloading);
}

export function flashHitmarker() {
  el.hitmarker.classList.remove("show");
  void el.hitmarker.offsetWidth; // restart animation
  el.hitmarker.classList.add("show");
  clearTimeout(hitmarkerTimeout);
  hitmarkerTimeout = setTimeout(() => el.hitmarker.classList.remove("show"), 250);
}

export function flashDamage() {
  el.damageFlash.classList.add("show");
  clearTimeout(damageFlashTimeout);
  damageFlashTimeout = setTimeout(() => el.damageFlash.classList.remove("show"), 120);
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
