import * as THREE from "three";
import { resolveCircleBoxCollision, clamp } from "./utils.js";

const GRAVITY = -14;
const RADIUS = 0.12;
const FUSE = 1.7;
const THROW_SPEED = 15;
const BLAST_RADIUS = 7.5;
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

    for (const c of colliders) {
      const before = this.position.x + "," + this.position.z;
      resolveCircleBoxCollision(this.position, RADIUS, c.box);
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
    this.particles = [];
  }

  reset() {
    for (const g of this.active) this.scene.remove(g.mesh);
    for (const ex of this.explosions) {
      this.scene.remove(ex.mesh);
      this.scene.remove(ex.light);
    }
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.active = [];
    this.explosions = [];
    this.particles = [];
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

    this.particles = this.particles.filter((p) => {
      p.velocity.y += GRAVITY * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.life -= dt;
      if (p.mesh.position.y < 0.03) {
        p.mesh.position.y = 0.03;
        p.velocity.x *= 0.8;
        p.velocity.z *= 0.8;
        p.velocity.y = 0;
      }
      p.mesh.material.opacity = Math.min(1, p.life);
      p.mesh.material.transparent = true;
      p.mesh.rotation.x += dt * 4;
      p.mesh.rotation.y += dt * 3;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
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

    const light = new THREE.PointLight(0xffaa33, 9, BLAST_RADIUS * 1.8);
    light.position.copy(g.position);
    this.scene.add(light);

    this.explosions.push({ mesh, light, timer: 0.4, duration: 0.4 });

    // debris particles: small cubes flying outward with gravity
    const particleColors = [0x8a6a3a, 0x5b6b45, 0x999999];
    for (let i = 0; i < 18; i++) {
      const color = particleColors[Math.floor(Math.random() * particleColors.length)];
      const size = 0.06 + Math.random() * 0.08;
      const pMesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshLambertMaterial({ color }));
      pMesh.position.copy(g.position);
      const angle = Math.random() * Math.PI * 2;
      const upSpeed = 3 + Math.random() * 4;
      const outSpeed = 2 + Math.random() * 5;
      const velocity = new THREE.Vector3(Math.cos(angle) * outSpeed, upSpeed, Math.sin(angle) * outSpeed);
      this.scene.add(pMesh);
      this.particles.push({ mesh: pMesh, velocity, life: 0.9 + Math.random() * 0.5 });
    }

    if (onExplode) onExplode(g.position, distToPlayer <= BLAST_RADIUS ? distToPlayer : null);
  }
}
