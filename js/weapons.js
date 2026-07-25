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
    color: 0x4a3524,
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

    this._buildViewmodel();
  }

  get current() {
    return WEAPON_DEFS[this.index];
  }

  get currentState() {
    return this.state[this.index];
  }

  _buildViewmodel() {
    this.viewmodel = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: this.current.color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.5), mat);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.1), mat);
    grip.position.set(0, -0.15, 0.15);
    this.viewmodel.add(body, grip);
    this.viewmodel.position.set(0.28, -0.28, -0.55);
    this.gunMesh = body;
    this.camera.add(this.viewmodel);

    this.muzzleFlash = new THREE.PointLight(0xffcc66, 0, 4);
    this.muzzleFlash.position.set(0, 0.02, -0.35);
    this.viewmodel.add(this.muzzleFlash);
  }

  switchTo(idx) {
    if (idx === this.index || idx < 0 || idx >= WEAPON_DEFS.length) return;
    this.index = idx;
    this.reloading = false;
    this.reloadTimer = 0;
    this.gunMesh.material.color.set(this.current.color);
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

  // enemyMeshes: flat array of { mesh, enemy } hit targets
  tryFire(enemyMeshes, onHit) {
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
    this._flash();
    this._recoil();

    for (let i = 0; i < def.pellets; i++) {
      const dir = new THREE.Vector3(0, 0, -1);
      dir.applyQuaternion(this.camera.quaternion);
      dir.x += (Math.random() - 0.5) * def.spread;
      dir.y += (Math.random() - 0.5) * def.spread;
      dir.z += (Math.random() - 0.5) * def.spread;
      dir.normalize();

      this.raycaster.set(this.camera.getWorldPosition(new THREE.Vector3()), dir);
      const meshList = enemyMeshes.map((e) => e.mesh);
      const hits = this.raycaster.intersectObjects(meshList, true);
      if (hits.length > 0) {
        const hitMesh = hits[0].object;
        const target = enemyMeshes.find((e) => e.mesh === hitMesh || isDescendant(e.mesh, hitMesh));
        if (target && onHit) onHit(target.enemy, def.damage, hits[0].point);
      }
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
    const recoilOffset = this._recoilT * 0.08;
    this.viewmodel.position.z = -0.55 + recoilOffset;
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
