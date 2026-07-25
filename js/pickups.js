import * as THREE from "three";
import { rand } from "./utils.js";

const PICKUP_RADIUS = 0.8;
const SPAWN_INTERVAL = 11;
const MAX_ACTIVE = 3;

const TYPE_COLORS = {
  health: 0x3ddc45,
  ammo: 0xffcf40,
  grenade: 0x707070,
};

export class PickupManager {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.timer = 5;
    this.arenaHalf = 20;
  }

  reset() {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items = [];
    this.timer = 5;
  }

  _spawnOne() {
    const types = ["health", "ammo", "grenade"];
    const type = types[Math.floor(Math.random() * types.length)];

    const geo =
      type === "health"
        ? new THREE.BoxGeometry(0.4, 0.4, 0.4)
        : type === "grenade"
        ? new THREE.SphereGeometry(0.25, 8, 8)
        : new THREE.BoxGeometry(0.5, 0.28, 0.34);

    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: TYPE_COLORS[type] }));
    let x, z, attempts = 0;
    do {
      x = rand(-this.arenaHalf + 3, this.arenaHalf - 3);
      z = rand(-this.arenaHalf + 3, this.arenaHalf - 3);
      attempts++;
    } while (Math.hypot(x, z) < 4 && attempts < 20);

    mesh.position.set(x, 0.5, z);
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.items.push({ type, mesh, spin: rand(0, Math.PI * 2), life: 22 });
  }

  update(dt, playerPos, onCollect) {
    this.timer -= dt;
    if (this.timer <= 0 && this.items.length < MAX_ACTIVE) {
      this.timer = SPAWN_INTERVAL;
      this._spawnOne();
    }

    this.items = this.items.filter((it) => {
      it.spin += dt * 2.2;
      it.mesh.rotation.y = it.spin;
      it.mesh.position.y = 0.5 + Math.sin(it.spin * 1.4) * 0.08;
      it.life -= dt;

      const dist = Math.hypot(it.mesh.position.x - playerPos.x, it.mesh.position.z - playerPos.z);
      if (dist < PICKUP_RADIUS) {
        this.scene.remove(it.mesh);
        if (onCollect) onCollect(it.type);
        return false;
      }
      if (it.life <= 0) {
        this.scene.remove(it.mesh);
        return false;
      }
      return true;
    });
  }
}
