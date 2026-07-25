import * as THREE from "three";
import { buildVoxelSoldier, rand, distance2D, resolveCircleBoxCollision, clamp } from "./utils.js";
import { playEnemyDeath } from "./audio.js";

const ENEMY_RADIUS = 0.35;
const ATTACK_RANGE = 1.6;
const ATTACK_COOLDOWN = 1.1;

let idCounter = 0;

export class Enemy {
  constructor({ health, speed, damage, position }) {
    this.id = ++idCounter;
    this.maxHealth = health;
    this.health = health;
    this.speed = speed;
    this.damage = damage;
    this.state = "alive"; // alive | dying | dead
    this.attackTimer = rand(0, ATTACK_COOLDOWN);
    this.deathTimer = 0;
    this.walkPhase = rand(0, Math.PI * 2);

    const isElite = health > 60;
    const built = buildVoxelSoldier({
      bodyColor: isElite ? 0x6a2a2a : 0x4a5d3a,
      headColor: 0xc99a72,
    });
    this.group = built.group;
    this.parts = built.parts;
    this.group.position.copy(position);
    this.position = this.group.position;
  }

  takeDamage(amount) {
    if (this.state !== "alive") return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.state = "dying";
      this.deathTimer = 0.5;
      playEnemyDeath();
      return true; // killed
    }
    return false;
  }

  update(dt, playerPos, colliders, onAttack) {
    if (this.state === "dying") {
      this.deathTimer -= dt;
      this.group.rotation.z = clamp(this.group.rotation.z + dt * 4, 0, Math.PI / 2);
      this.group.position.y = Math.max(0, this.group.position.y - dt * 1.2);
      if (this.deathTimer <= 0) this.state = "dead";
      return;
    }
    if (this.state !== "alive") return;

    const dist = distance2D(this.position, playerPos);

    if (dist > ATTACK_RANGE) {
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      const len = Math.hypot(dx, dz) || 1;
      this.position.x += (dx / len) * this.speed * dt;
      this.position.z += (dz / len) * this.speed * dt;
      this.group.rotation.y = Math.atan2(dx, dz);

      // walk animation
      this.walkPhase += dt * 8;
      const swing = Math.sin(this.walkPhase) * 0.5;
      this.parts.leftLeg.rotation.x = swing;
      this.parts.rightLeg.rotation.x = -swing;
      this.parts.leftArm.rotation.x = -swing;
      this.parts.rightArm.rotation.x = swing;

      for (const box of colliders) {
        resolveCircleBoxCollision(this.position, ENEMY_RADIUS, box);
      }
    } else {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = ATTACK_COOLDOWN;
        if (onAttack) onAttack(this.damage);
      }
    }
  }
}

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.wave = 0;
    this.spawnQueue = 0;
    this.spawnTimer = 0;
    this.arenaHalf = 21;
  }

  reset() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies = [];
    this.wave = 0;
    this.spawnQueue = 0;
    this.spawnTimer = 0;
  }

  startNextWave() {
    this.wave++;
    this.spawnQueue = 4 + this.wave * 2;
    this.spawnTimer = 0;
    return this.wave;
  }

  get aliveCount() {
    return this.enemies.filter((e) => e.state !== "dead").length;
  }

  get waveCleared() {
    return this.spawnQueue <= 0 && this.aliveCount === 0;
  }

  _spawnOne() {
    const edge = Math.floor(rand(0, 4));
    const half = this.arenaHalf;
    let x, z;
    if (edge === 0) { x = rand(-half, half); z = -half; }
    else if (edge === 1) { x = rand(-half, half); z = half; }
    else if (edge === 2) { x = -half; z = rand(-half, half); }
    else { x = half; z = rand(-half, half); }

    const health = 30 + this.wave * 6 + (Math.random() < 0.2 ? 30 : 0);
    const speed = clamp(1.6 + this.wave * 0.08, 1.6, 3.4);
    const damage = 6 + Math.floor(this.wave / 2);

    const enemy = new Enemy({ health, speed, damage, position: new THREE.Vector3(x, 0, z) });
    this.enemies.push(enemy);
    this.scene.add(enemy.group);
  }

  update(dt, playerPos, colliders, callbacks) {
    if (this.spawnQueue > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 0.6;
        this._spawnOne();
        this.spawnQueue--;
      }
    }

    for (const enemy of this.enemies) {
      enemy.update(dt, playerPos, colliders, (dmg) => {
        if (callbacks?.onPlayerHit) callbacks.onPlayerHit(dmg);
      });
    }

    // cleanup dead
    this.enemies = this.enemies.filter((e) => {
      if (e.state === "dead") {
        this.scene.remove(e.group);
        return false;
      }
      return true;
    });
  }

  getHitTargets() {
    return this.enemies
      .filter((e) => e.state === "alive")
      .map((e) => ({ mesh: e.group, enemy: e }));
  }
}
