import * as THREE from "three";
import { playShot, playReload, playEmptyClick } from "./audio.js";

export const WEAPON_DEFS = [
  {
    id: "pistol",
    name: "PISTOL",
    damage: 26,
    magSize: 12,
    reserveMax: Infinity,
    fireCooldown: 0.28,
    reloadTime: 0.9,
    auto: false,
    pellets: 1,
    spread: 0.01,
    range: 40,
    falloffStart: 22,
    minDamageMult: 0.55,
    adsZoom: 1.15,
    adsSpreadMult: 0.4,
    color: 0x2b2b2b,
  },
  {
    id: "rifle",
    name: "RIFLE",
    damage: 18,
    magSize: 30,
    reserveMax: 120,
    fireCooldown: 0.11,
    reloadTime: 1.6,
    auto: true,
    pellets: 1,
    spread: 0.018,
    range: 55,
    falloffStart: 30,
    minDamageMult: 0.5,
    adsZoom: 1.4,
    adsSpreadMult: 0.3,
    color: 0x3a3f2e,
  },
  {
    id: "shotgun",
    name: "SHOTGUN",
    damage: 11,
    magSize: 6,
    reserveMax: 24,
    fireCooldown: 0.85,
    reloadTime: 2.1,
    auto: false,
    pellets: 8,
    spread: 0.09,
    range: 14,
    falloffStart: 6,
    minDamageMult: 0.15,
    adsZoom: 1.1,
    adsSpreadMult: 0.6,
    color: 0x4a3524,
  },
  {
    id: "sniper",
    name: "SNIPER",
    damage: 120,
    magSize: 5,
    reserveMax: 20,
    fireCooldown: 1.35,
    reloadTime: 2.4,
    auto: false,
    pellets: 1,
    spread: 0.002,
    range: 120,
    falloffStart: 100,
    minDamageMult: 0.85,
    adsZoom: 3.2,
    adsSpreadMult: 0.05,
    scoped: true,
    color: 0x23261e,
  },
  {
    id: "knife",
    name: "KNIFE",
    damage: 65,
    magSize: Infinity,
    reserveMax: Infinity,
    fireCooldown: 0.45,
    reloadTime: 0,
    auto: false,
    pellets: 1,
    spread: 0,
    range: 2.4,
    falloffStart: 2.4,
    minDamageMult: 1,
    adsZoom: 1,
    adsSpreadMult: 1,
    melee: true,
    color: 0x9a9a9a,
  },
];

export class WeaponManager {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();

    this.index = 0;
    this.state = WEAPON_DEFS.map((def) => ({
      ammoInMag: def.magSize,
      ammoReserve: def.reserveMax === Infinity ? Infinity : def.reserveMax,
    }));

    this.cooldownTimer = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this._recoilT = 0;
    this.aiming = false;

    this._buildViewmodels();
  }

  get current() {
    return WEAPON_DEFS[this.index];
  }

  get currentState() {
    return this.state[this.index];
  }

  _buildGunModel(def) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: def.color });
    const accent = new THREE.MeshLambertMaterial({ color: 0x111111 });

    if (def.id === "pistol") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.32), mat);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.09), mat);
      grip.position.set(0, -0.14, 0.12);
      group.add(body, grip);
    } else if (def.id === "rifle") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.55), mat);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), accent);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.01, -0.42);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.09), accent);
      mag.position.set(0, -0.16, 0.05);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.22), mat);
      stock.position.set(0, -0.02, 0.36);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.05), accent);
      sight.position.set(0, 0.09, -0.05);
      group.add(body, barrel, mag, stock, sight);
    } else if (def.id === "shotgun") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.4), mat);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8), accent);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, -0.36);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.16), accent);
      pump.position.set(0, -0.06, -0.22);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.24), mat);
      stock.position.set(0, -0.01, 0.3);
      group.add(body, barrel, pump, stock);
    } else if (def.id === "sniper") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.68), mat);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.38, 6), accent);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0, -0.52);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), accent);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.1, -0.05);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.26), mat);
      stock.position.set(0, -0.01, 0.44);
      const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.08), accent);
      bolt.position.set(0.06, 0.02, 0.18);
      group.add(body, barrel, scope, stock, bolt);
    } else if (def.id === "knife") {
      const bladeMat = new THREE.MeshLambertMaterial({ color: 0xcfd4d8 });
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.32), bladeMat);
      blade.position.set(0, 0, -0.2);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.14), mat);
      handle.position.set(0, 0, 0.02);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.02), accent);
      guard.position.set(0, 0, -0.06);
      group.add(blade, handle, guard);
    }

    group.traverse((obj) => {
      if (obj.isMesh) obj.castShadow = true;
    });
    return group;
  }

  _buildViewmodels() {
    this.holder = new THREE.Group();
    this.camera.add(this.holder);

    this.hipPosition = new THREE.Vector3(0.28, -0.28, -0.55);
    this.adsPosition = new THREE.Vector3(0, -0.16, -0.32);
    this.holder.position.copy(this.hipPosition);

    this.gunModels = WEAPON_DEFS.map((def) => {
      const model = this._buildGunModel(def);
      model.visible = false;
      this.holder.add(model);
      return model;
    });
    this.gunModels[this.index].visible = true;

    this.muzzleFlash = new THREE.PointLight(0xffcc66, 0, 4);
    this.muzzleFlash.position.set(0, 0.02, -0.5);
    this.holder.add(this.muzzleFlash);
  }

  switchTo(idx) {
    if (idx === this.index || idx < 0 || idx >= WEAPON_DEFS.length) return;
    this.gunModels[this.index].visible = false;
    this.index = idx;
    this.gunModels[this.index].visible = true;
    this.reloading = false;
    this.reloadTimer = 0;
  }

  setAiming(val) {
    this.aiming = val;
  }

  startReload() {
    const state = this.currentState;
    const def = this.current;
    if (this.reloading) return;
    if (state.ammoInMag >= def.magSize) return;
    if (state.ammoReserve !== Infinity && state.ammoReserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = def.reloadTime;
    playReload();
  }

  _finishReload() {
    const state = this.currentState;
    const def = this.current;
    const needed = def.magSize - state.ammoInMag;
    if (state.ammoReserve === Infinity) {
      state.ammoInMag = def.magSize;
    } else {
      const take = Math.min(needed, state.ammoReserve);
      state.ammoInMag += take;
      state.ammoReserve -= take;
    }
    this.reloading = false;
  }

  addReserveAmmo(amount) {
    const state = this.currentState;
    const def = this.current;
    if (state.ammoReserve === Infinity) return;
    state.ammoReserve = Math.min(def.reserveMax, state.ammoReserve + amount);
  }

  _damageAtDistance(def, dist) {
    if (dist <= def.falloffStart) return def.damage;
    if (dist >= def.range) return def.damage * def.minDamageMult;
    const t = (dist - def.falloffStart) / (def.range - def.falloffStart);
    return def.damage * (1 - t * (1 - def.minDamageMult));
  }

  // hitTargets: flat array of { mesh, enemy } hit candidates
  tryFire(hitTargets, blockerMeshes, onHit) {
    const def = this.current;
    const state = this.currentState;

    if (this.reloading || this.cooldownTimer > 0) return;

    if (state.ammoInMag <= 0) {
      playEmptyClick();
      this.cooldownTimer = 0.2;
      return;
    }

    state.ammoInMag--;
    this.cooldownTimer = def.fireCooldown;
    playShot(def.id);
    if (!def.melee) this._flash();
    this._recoil();

    const spread = def.spread * (this.aiming ? def.adsSpreadMult : 1);
    const origin = this.camera.getWorldPosition(new THREE.Vector3());

    for (let i = 0; i < def.pellets; i++) {
      const dir = new THREE.Vector3(0, 0, -1);
      dir.applyQuaternion(this.camera.quaternion);
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;
      dir.normalize();

      this.raycaster.set(origin, dir);
      this.raycaster.far = def.range;

      const targetMeshes = hitTargets.map((t) => t.mesh);
      const allMeshes = targetMeshes.concat(blockerMeshes || []);
      const hits = this.raycaster.intersectObjects(allMeshes, true);
      if (hits.length === 0) continue;

      const firstHit = hits[0];
      const hitMesh = firstHit.object;
      const target = hitTargets.find((t) => t.mesh === hitMesh || isDescendant(t.mesh, hitMesh));

      if (target) {
        const dmg = this._damageAtDistance(def, firstHit.distance);
        if (onHit) onHit(target.enemy, dmg, firstHit.point, origin);
      }
      // if the closest hit was a wall/rock/crate (not an enemy), the shot is blocked — no damage
    }
  }

  _flash() {
    this.muzzleFlash.intensity = 3.2;
  }

  _recoil() {
    this._recoilT = 1;
  }

  update(dt) {
    if (this.cooldownTimer > 0) this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);

    if (this.muzzleFlash.intensity > 0) {
      this.muzzleFlash.intensity = Math.max(0, this.muzzleFlash.intensity - dt * 18);
    }

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this._finishReload();
    }

    if (this._recoilT > 0) {
      this._recoilT = Math.max(0, this._recoilT - dt * 8);
    }

    const targetPos = this.aiming ? this.adsPosition : this.hipPosition;
    this.holder.position.lerp(targetPos, Math.min(1, dt * 12));
    this.holder.position.z += this._recoilT * 0.06;
  }
}

function isDescendant(root, node) {
  let p = node;
  while (p) {
    if (p === root) return true;
    p = p.parent;
  }
  return false;
}
