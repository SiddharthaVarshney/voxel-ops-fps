import * as THREE from "three";
import { resolveCircleBoxCollision, clamp } from "./utils.js";

const GRAVITY = -14;
const RADIUS = 0.12;
const FUSE = 1.7;
const THROW_SPEED = 15;
const BLAST_RADIUS = 5.5;
const BLAST_DAMAGE = 120;
const PLAYER_BLAST_MULT = 0.55;

export class Grenade {
  constructor(position, direction) {
    this.position = position.clone();
    this.velocity = direction.clone().multiplyScalar(THROW_SPEED);
    this.velocity.y += 3.5;
    this.fuse = FUSE;
    this.exploded = false;

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0x2e3b1f })
    );
    this.mesh.position.copy(this.position);
  }

  update(dt, colliders, arenaHalf) {
    if (this.exploded) return;

    this.velocity.y += GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);

    if (this.position.y <= RADIUS) {
      this.position.y = RADIUS;
      if (Math.abs(this.velocity.y) > 0.5) {
        this.velocity.y *= -0.42;
      } else {
        this.velocity.y = 0;
      }
      this.velocity.x *= 0.75;
      this.velocity.z *= 0.75;
    }

    this.position.x = clamp(this.position.x, -arenaHalf, arenaHalf);
    this.position.z = clamp(this.position.z, -arenaHalf, arenaHalf);

    for (const box of colliders) {
      const before = this.position.x + "," + this.position.z;
      resolveCircleBoxCollision(this.position, RADIUS, box);
      if (before !== this.position.x + "," + this.position.z) {
        this.velocity.x *= -0.35;
        this.velocity.z *= -0.35;
      }
    }

    this.mesh.position.copy(this.position);

    this.fuse -= dt;
    if (this.fuse <= 0) this.exploded = true;
  }
}

export class GrenadeManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.explosions = [];
  }

  reset() {
    for (const g of this.active) this.scene.remove(g.mesh);
    for (const ex of this.explosions) {
      this.scene.remove(ex.mesh);
      this.scene.remove(ex.light);
    }
    this.active = [];
    this.explosions = [];
  }

  throwGrenade(position, direction) {
    const g = new Grenade(position, direction);
    this.active.push(g);
    this.scene.add(g.mesh);
    return g;
  }

  update(dt, colliders, arenaHalf, { enemies, player, onExplode }) {
    for (const g of this.active) {
      g.update(dt, colliders, arenaHalf);
      if (g.exploded) this._explode(g, enemies, player, onExplode);
    }
    this.active = this.active.filter((g) => !g.exploded);

    this.explosions = this.explosions.filter((ex) => {
      ex.timer -= dt;
      const t = 1 - ex.timer / ex.duration;
      ex.mesh.scale.setScalar(1 + t * 7);
      ex.mesh.material.opacity = Math.max(0, 1 - t);
      ex.light.intensity = Math.max(0, (1 - t) * 9);
      if (ex.timer <= 0) {
        this.scene.remove(ex.mesh);
        this.scene.remove(ex.light);
        return false;
      }
      return true;
    });
  }

  _explode(g, enemies, player, onExplode) {
    this.scene.remove(g.mesh);

    for (const enemy of enemies) {
      if (enemy.state !== "alive") continue;
      const dist = enemy.position.distanceTo(g.position);
      if (dist <= BLAST_RADIUS) {
        const falloff = 1 - dist / BLAST_RADIUS;
        enemy.takeDamage(BLAST_DAMAGE * falloff);
      }
    }

    const distToPlayer = player.position.distanceTo(g.position);
    if (distToPlayer <= BLAST_RADIUS) {
      const falloff = 1 - distToPlayer / BLAST_RADIUS;
      player.takeDamage(BLAST_DAMAGE * PLAYER_BLAST_MULT * falloff);
    }

    const mat = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), mat);
    mesh.position.copy(g.position);
    this.scene.add(mesh);

    const light = new THREE.PointLight(0xffaa33, 9, 11);
    light.position.copy(g.position);
    this.scene.add(light);

    this.explosions.push({ mesh, light, timer: 0.4, duration: 0.4 });

    if (onExplode) onExplode(g.position, distToPlayer <= BLAST_RADIUS ? distToPlayer : null);
  }
}
