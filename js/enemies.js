import * as THREE from "three";
import { buildVoxelSoldier, buildDrone, attachEnemyGun, rand, distance2D, resolveCircleBoxCollision, clamp } from "./utils.js";
import { playEnemyDeath } from "./audio.js";

const ENEMY_RADIUS = 0.35;
const MELEE_ATTACK_RANGE = 1.6;
const MELEE_ATTACK_COOLDOWN = 1.1;

const RIFLEMAN_MIN_DIST = 8;
const RIFLEMAN_MAX_DIST = 15;
const RIFLEMAN_FIRE_COOLDOWN = 1.5;
const RIFLEMAN_HIT_CHANCE = 0.55;

const DRONE_HEIGHT = 3.4;
const DRONE_MIN_DIST = 6;
const DRONE_MAX_DIST = 12;
const DRONE_FIRE_COOLDOWN = 1.1;
const DRONE_HIT_CHANCE = 0.45;

let idCounter = 0;
const _rayHelper = new THREE.Raycaster();

export class Enemy {
  constructor({ type, health, speed, damage, position }) {
    this.id = ++idCounter;
    this.type = type; // "grunt" | "rifleman" | "drone"
    this.maxHealth = health;
    this.health = health;
    this.speed = speed;
    this.damage = damage;
    this.state = "alive"; // alive | dying | dead
    this.attackTimer = rand(0, 1);
    this.deathTimer = 0;
    this.walkPhase = rand(0, Math.PI * 2);
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = rand(1.5, 3.5);

    if (type === "drone") {
      const built = buildDrone();
      this.group = built.group;
      this.gunPart = built.gun;
      this.rotors = built.rotors;
      this.group.position.copy(position);
      this.group.position.y = DRONE_HEIGHT;
    } else {
      const isElite = health > 60;
      const built = buildVoxelSoldier({
        bodyColor: type === "rifleman" ? 0x5a4a2a : isElite ? 0x6a2a2a : 0x4a5d3a,
        headColor: 0xc99a72,
      });
      this.group = built.group;
      this.parts = built.parts;
      this.group.position.copy(position);
      if (type === "rifleman") {
        this.gunPart = attachEnemyGun(this.parts.rightArm);
      }
    }
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

  _hasLineOfSight(playerPos, blockerMeshes) {
    const from = this.position.clone();
    from.y += this.type === "drone" ? 0 : 1.3;
    const to = playerPos.clone();
    const dir = to.clone().sub(from);
    const dist = dir.length();
    dir.normalize();
    _rayHelper.set(from, dir);
    _rayHelper.far = dist;
    const hits = _rayHelper.intersectObjects(blockerMeshes, true);
    return hits.length === 0;
  }

  update(dt, playerPos, colliders, blockerMeshes, callbacks) {
    if (this.state === "dying") {
      this.deathTimer -= dt;
      if (this.type === "drone") {
        this.group.position.y = Math.max(0.3, this.group.position.y - dt * 2.5);
        this.group.rotation.z += dt * 6;
      } else {
        this.group.rotation.z = clamp(this.group.rotation.z + dt * 4, 0, Math.PI / 2);
        this.group.position.y = Math.max(0, this.group.position.y - dt * 1.2);
      }
      if (this.deathTimer <= 0) this.state = "dead";
      return;
    }
    if (this.state !== "alive") return;

    if (this.type === "grunt") {
      this._updateGrunt(dt, playerPos, colliders, callbacks);
    } else if (this.type === "rifleman") {
      this._updateRifleman(dt, playerPos, colliders, blockerMeshes, callbacks);
    } else if (this.type === "drone") {
      this._updateDrone(dt, playerPos, blockerMeshes, callbacks);
    }
  }

  _updateGrunt(dt, playerPos, colliders, callbacks) {
    const dist = distance2D(this.position, playerPos);
    if (dist > MELEE_ATTACK_RANGE) {
      this._moveToward(playerPos, this.speed, dt);
      this._animateWalk(dt);
      for (const box of colliders) resolveCircleBoxCollision(this.position, ENEMY_RADIUS, box);
    } else {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = MELEE_ATTACK_COOLDOWN;
        if (callbacks?.onMeleeAttack) callbacks.onMeleeAttack(this.damage);
      }
    }
  }

  _updateRifleman(dt, playerPos, colliders, blockerMeshes, callbacks) {
    const dist = distance2D(this.position, playerPos);
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    this.group.rotation.y = Math.atan2(dx, dz);

    if (dist < RIFLEMAN_MIN_DIST) {
      this._moveAway(playerPos, this.speed, dt);
      this._animateWalk(dt);
    } else if (dist > RIFLEMAN_MAX_DIST) {
      this._moveToward(playerPos, this.speed, dt);
      this._animateWalk(dt);
    } else {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = rand(1.5, 3.5);
        this.strafeDir *= -1;
      }
      const perpX = -dz / (dist || 1);
      const perpZ = dx / (dist || 1);
      this.position.x += perpX * this.strafeDir * this.speed * 0.5 * dt;
      this.position.z += perpZ * this.strafeDir * this.speed * 0.5 * dt;
      this._animateWalk(dt, 0.5);
    }

    for (const box of colliders) resolveCircleBoxCollision(this.position, ENEMY_RADIUS, box);

    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && dist <= RIFLEMAN_MAX_DIST + 2) {
      if (this._hasLineOfSight(playerPos, blockerMeshes)) {
        this.attackTimer = RIFLEMAN_FIRE_COOLDOWN;
        const from = this.position.clone();
        from.y += 1.3;
        if (callbacks?.onRangedAttack) {
          const hit = Math.random() < RIFLEMAN_HIT_CHANCE;
          callbacks.onRangedAttack(hit ? this.damage : 0, from, playerPos.clone());
        }
      }
    }
  }

  _updateDrone(dt, playerPos, blockerMeshes, callbacks) {
    const dist = distance2D(this.position, playerPos);
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    this.group.rotation.y = Math.atan2(dx, dz);
    this.group.position.y = DRONE_HEIGHT + Math.sin(this.walkPhase) * 0.15;
    this.walkPhase += dt * 2;

    this.rotors?.forEach((r) => { r.rotation.y += dt * 40; });

    if (dist < DRONE_MIN_DIST) {
      this._moveAway(playerPos, this.speed * 1.1, dt);
    } else if (dist > DRONE_MAX_DIST) {
      this._moveToward(playerPos, this.speed * 1.1, dt);
    } else {
      const perpX = -dz / (dist || 1);
      const perpZ = dx / (dist || 1);
      this.position.x += perpX * this.strafeDir * this.speed * 0.4 * dt;
      this.position.z += perpZ * this.strafeDir * this.speed * 0.4 * dt;
    }

    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && dist <= DRONE_MAX_DIST + 2) {
      if (this._hasLineOfSight(playerPos, blockerMeshes)) {
        this.attackTimer = DRONE_FIRE_COOLDOWN;
        const from = this.position.clone();
        if (callbacks?.onRangedAttack) {
          const hit = Math.random() < DRONE_HIT_CHANCE;
          callbacks.onRangedAttack(hit ? this.damage : 0, from, playerPos.clone());
        }
      }
    }
  }

  _moveToward(target, speed, dt) {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const len = Math.hypot(dx, dz) || 1;
    this.position.x += (dx / len) * speed * dt;
    this.position.z += (dz / len) * speed * dt;
  }

  _moveAway(target, speed, dt) {
    const dx = this.position.x - target.x;
    const dz = this.position.z - target.z;
    const len = Math.hypot(dx, dz) || 1;
    this.position.x += (dx / len) * speed * dt;
    this.position.z += (dz / len) * speed * dt;
  }

  _animateWalk(dt, scale = 1) {
    if (!this.parts) return;
    this.walkPhase += dt * 8 * scale;
    const swing = Math.sin(this.walkPhase) * 0.5;
    this.parts.leftLeg.rotation.x = swing;
    this.parts.rightLeg.rotation.x = -swing;
    this.parts.leftArm.rotation.x = this.type === "rifleman" ? -0.9 : -swing;
    this.parts.rightArm.rotation.x = this.type === "rifleman" ? -0.9 : swing;
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
    this.tracers = [];
  }

  reset() {
    for (const e of this.enemies) this.scene.remove(e.group);
    for (const t of this.tracers) this.scene.remove(t.line);
    this.enemies = [];
    this.tracers = [];
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

  _pickType() {
    const roll = Math.random();
    if (this.wave >= 4 && roll < 0.2) return "drone";
    if (this.wave >= 2 && roll < 0.5) return "rifleman";
    return "grunt";
  }

  _spawnOne() {
    const edge = Math.floor(rand(0, 4));
    const half = this.arenaHalf;
    let x, z;
    if (edge === 0) { x = rand(-half, half); z = -half; }
    else if (edge === 1) { x = rand(-half, half); z = half; }
    else if (edge === 2) { x = -half; z = rand(-half, half); }
    else { x = half; z = rand(-half, half); }

    const type = this._pickType();
    const healthBase = type === "drone" ? 24 : 30;
    const health = healthBase + this.wave * 6 + (Math.random() < 0.15 ? 25 : 0);
    const speed = clamp(1.6 + this.wave * 0.08, 1.6, 3.4) * (type === "drone" ? 1.15 : 1);
    const damage = type === "grunt" ? 6 + Math.floor(this.wave / 2) : 8 + Math.floor(this.wave / 2);

    const enemy = new Enemy({ type, health, speed, damage, position: new THREE.Vector3(x, 0, z) });
    this.enemies.push(enemy);
    this.scene.add(enemy.group);
  }

  _addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08 });
  }

  update(dt, playerPos, colliders, blockerMeshes, callbacks) {
    if (this.spawnQueue > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 0.6;
        this._spawnOne();
        this.spawnQueue--;
      }
    }

    for (const enemy of this.enemies) {
      enemy.update(dt, playerPos, colliders, blockerMeshes, {
        onMeleeAttack: (dmg) => callbacks?.onPlayerHit?.(dmg),
        onRangedAttack: (dmg, from, to) => {
          this._addTracer(from, to);
          if (dmg > 0) callbacks?.onPlayerHit?.(dmg);
        },
      });
    }

    this.enemies = this.enemies.filter((e) => {
      if (e.state === "dead") {
        this.scene.remove(e.group);
        return false;
      }
      return true;
    });

    this.tracers = this.tracers.filter((t) => {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.08);
      if (t.life <= 0) {
        this.scene.remove(t.line);
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
