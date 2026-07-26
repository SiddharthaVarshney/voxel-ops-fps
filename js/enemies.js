import * as THREE from "three";
import {
  buildVoxelSoldier,
  buildDrone,
  buildShieldTrooper,
  buildHeavyGunner,
  buildFlamethrowerTrooper,
  buildDirectionalBillboard,
  attachEnemyGun,
  rand,
  distance2D,
  resolveCircleBoxCollision,
  clamp,
} from "./utils.js";
import { buildVeer } from "./veer.js";
import { playEnemyDeath } from "./audio.js";

const ENEMY_RADIUS = 0.35;
const MELEE_ATTACK_RANGE = 1.6;
const MELEE_ATTACK_COOLDOWN = 1.1;

const RIFLEMAN_MIN_DIST = 8;
const RIFLEMAN_MAX_DIST = 15;
const RIFLEMAN_FIRE_COOLDOWN = 1.5;
const RIFLEMAN_HIT_CHANCE = 0.55;

const HEAVY_MIN_DIST = 7;
const HEAVY_MAX_DIST = 13;
const HEAVY_FIRE_COOLDOWN = 0.9;
const HEAVY_HIT_CHANCE = 0.5;

const FLAME_RANGE = 5.5;
const FLAME_CONE_ANGLE = 0.55; // radians half-angle
const FLAME_DPS = 22;

const DRONE_HEIGHT = 3.4;
const DRONE_MIN_DIST = 6;
const DRONE_MAX_DIST = 12;
const DRONE_FIRE_COOLDOWN = 1.1;
const DRONE_HIT_CHANCE = 0.45;

const SHIELD_TURN_RATE = 2.0; // rad/sec — limited, so flanking is possible
const SHIELD_DAMAGE_REDUCTION = 0.82;

// Veer — boss-tier rival operative. Ranged like rifleman/heavy_gunner but
// engages at longer range, fires in bursts, and periodically throws a real
// physics grenade (routed through the shared GrenadeManager via callbacks).
// Turn rate is limited like shield_trooper's, for the same reason: a
// deliberate, learnable flanking counter instead of instant snap-aim.
const VEER_MIN_DIST = 9;
const VEER_MAX_DIST = 16;
const VEER_TURN_RATE = 3.5;
const VEER_BURST_SHOTS = 3;
const VEER_BURST_INTERVAL = 0.16;
const VEER_BURST_COOLDOWN = 2.2;
const VEER_HIT_CHANCE = 0.6;
const VEER_THROW_DURATION = 1.3;

const SPAWN_TELEGRAPH_TIME = 1.0;

let idCounter = 0;
const _rayHelper = new THREE.Raycaster();

export class Enemy {
  constructor({ type, health, speed, damage, position }) {
    this.id = ++idCounter;
    this.type = type;
    this.maxHealth = health;
    this.health = health;
    this.speed = speed;
    this.damage = damage;
    this.state = "alive";
    this.attackTimer = rand(0, 1);
    this.deathTimer = 0;
    this.walkPhase = rand(0, Math.PI * 2);
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = rand(1.5, 3.5);
    this.facingAngle = rand(0, Math.PI * 2);
    this.flameActive = false;

    if (type === "drone") {
      const built = buildDrone();
      this.group = built.group;
      this.gunPart = built.gun;
      this.rotors = built.rotors;
      this.group.position.copy(position);
      this.group.position.y = DRONE_HEIGHT;
    } else if (type === "mutant_brute") {
      const built = buildDirectionalBillboard({
        front: "assets/sprites/brute_commando_front.png",
        right: "assets/sprites/brute_commando_right.png",
        back: "assets/sprites/brute_commando_back.png",
        left: "assets/sprites/brute_commando_left.png",
      }, 3.2);
      this.group = built.group;
      this.sprite = built.sprite;
      this.updateSpriteFacing = built.updateFacing;
      this.group.position.copy(position);
    } else if (type === "shield_trooper") {
      const built = buildShieldTrooper();
      this.group = built.group;
      this.parts = built.parts;
      this.shield = built.shield;
      this.group.position.copy(position);
    } else if (type === "heavy_gunner") {
      const built = buildHeavyGunner();
      this.group = built.group;
      this.parts = built.parts;
      this.group.position.copy(position);
    } else if (type === "flamethrower") {
      const built = buildFlamethrowerTrooper();
      this.group = built.group;
      this.parts = built.parts;
      this.group.position.copy(position);
      const coneMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.55 });
      this.flameCone = new THREE.Mesh(new THREE.ConeGeometry(1.1, FLAME_RANGE, 10, 1, true), coneMat);
      this.flameCone.rotation.x = -Math.PI / 2;
      this.flameCone.position.set(0, 1.1, -FLAME_RANGE / 2);
      this.flameCone.visible = false;
      this.group.add(this.flameCone);
    } else if (type === "veer") {
      const built = buildVeer();
      this.group = built.group;
      this.veer = built;
      this._pendingGrenade = null;
      this.veer.onGrenadeRelease = (pos, dir) => { this._pendingGrenade = { pos, dir }; };
      this.group.position.copy(position);
      this.veerBurstTimer = rand(1, 2.5);
      this.veerGrenadeTimer = rand(4, 7);
      this.veerShotsLeftInBurst = 0;
      this.veerShotTimer = 0;
      this.veerThrowLock = 0;
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

  takeDamage(amount, hitOrigin) {
    if (this.state !== "alive") return false;

    let dmg = amount;
    if (this.type === "shield_trooper" && hitOrigin) {
      const forward = new THREE.Vector3(-Math.sin(this.facingAngle), 0, -Math.cos(this.facingAngle));
      const toShooter = hitOrigin.clone().sub(this.position);
      toShooter.y = 0;
      toShooter.normalize();
      const frontality = forward.dot(toShooter);
      if (frontality > 0.35) {
        dmg = amount * (1 - SHIELD_DAMAGE_REDUCTION);
      }
    }

    this.health -= dmg;
    if (this.health <= 0) {
      this.state = "dying";
      this.deathTimer = 0.5;
      playEnemyDeath();
      return true;
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
      if (this.flameCone) this.flameCone.visible = false;
      if (this.type === "drone") {
        this.group.position.y = Math.max(0.3, this.group.position.y - dt * 2.5);
        this.group.rotation.z += dt * 6;
      } else if (this.type === "mutant_brute") {
        this.sprite.material.opacity = Math.max(0, 1 - (0.5 - this.deathTimer) / 0.5);
        this.group.position.y = Math.max(0, this.group.position.y - dt * 1.5);
      } else {
        this.group.rotation.z = clamp(this.group.rotation.z + dt * 4, 0, Math.PI / 2);
        this.group.position.y = Math.max(0, this.group.position.y - dt * 1.2);
      }
      if (this.deathTimer <= 0) this.state = "dead";
      return;
    }
    if (this.state !== "alive") return;

    if (this.type === "grunt" || this.type === "mutant_brute") {
      this._updateMelee(dt, playerPos, colliders, callbacks);
    } else if (this.type === "rifleman") {
      this._updateRanged(dt, playerPos, colliders, blockerMeshes, callbacks, {
        min: RIFLEMAN_MIN_DIST, max: RIFLEMAN_MAX_DIST, cooldown: RIFLEMAN_FIRE_COOLDOWN, hitChance: RIFLEMAN_HIT_CHANCE,
      });
    } else if (this.type === "heavy_gunner") {
      this._updateRanged(dt, playerPos, colliders, blockerMeshes, callbacks, {
        min: HEAVY_MIN_DIST, max: HEAVY_MAX_DIST, cooldown: HEAVY_FIRE_COOLDOWN, hitChance: HEAVY_HIT_CHANCE, suppress: true,
      });
    } else if (this.type === "drone") {
      this._updateDrone(dt, playerPos, blockerMeshes, callbacks);
    } else if (this.type === "shield_trooper") {
      this._updateShieldTrooper(dt, playerPos, colliders, callbacks);
    } else if (this.type === "flamethrower") {
      this._updateFlamethrower(dt, playerPos, colliders, blockerMeshes, callbacks);
    } else if (this.type === "veer") {
      this._updateVeer(dt, playerPos, colliders, blockerMeshes, callbacks);
    }
  }

  _updateMelee(dt, playerPos, colliders, callbacks) {
    const dist = distance2D(this.position, playerPos);
    const reach = this.type === "mutant_brute" ? MELEE_ATTACK_RANGE + 0.5 : MELEE_ATTACK_RANGE;
    this._faceTarget(playerPos, 999);
    if (this.updateSpriteFacing) this.updateSpriteFacing(this.facingAngle, playerPos, this.position);

    if (dist > reach) {
      this._moveToward(playerPos, this.speed, dt);
      this._animateWalk(dt);
      for (const c of colliders) resolveCircleBoxCollision(this.position, ENEMY_RADIUS, c.box);
    } else {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = MELEE_ATTACK_COOLDOWN;
        if (callbacks?.onMeleeAttack) callbacks.onMeleeAttack(this.damage);
      }
    }
  }

  _updateRanged(dt, playerPos, colliders, blockerMeshes, callbacks, cfg) {
    const dist = distance2D(this.position, playerPos);
    this._faceTarget(playerPos, 999);

    if (dist < cfg.min) {
      this._moveAway(playerPos, this.speed, dt);
      this._animateWalk(dt);
    } else if (dist > cfg.max) {
      this._moveToward(playerPos, this.speed, dt);
      this._animateWalk(dt);
    } else {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = rand(1.5, 3.5);
        this.strafeDir *= -1;
      }
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      const perpX = -dz / (dist || 1);
      const perpZ = dx / (dist || 1);
      this.position.x += perpX * this.strafeDir * this.speed * 0.5 * dt;
      this.position.z += perpZ * this.strafeDir * this.speed * 0.5 * dt;
      this._animateWalk(dt, 0.5);
    }

    for (const c of colliders) resolveCircleBoxCollision(this.position, ENEMY_RADIUS, c.box);

    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && dist <= cfg.max + 2) {
      if (this._hasLineOfSight(playerPos, blockerMeshes)) {
        this.attackTimer = cfg.cooldown;
        const from = this.position.clone();
        from.y += 1.3;
        const hit = Math.random() < cfg.hitChance;
        callbacks?.onRangedAttack?.(hit ? this.damage : 0, from, playerPos.clone(), cfg.suppress && hit);
      }
    }
  }

  _updateDrone(dt, playerPos, blockerMeshes, callbacks) {
    const dist = distance2D(this.position, playerPos);
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    this.group.rotation.y = Math.atan2(-dx, -dz);
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
        const hit = Math.random() < DRONE_HIT_CHANCE;
        callbacks?.onRangedAttack?.(hit ? this.damage : 0, from, playerPos.clone(), false);
      }
    }
  }

  _updateShieldTrooper(dt, playerPos, colliders, callbacks) {
    const dist = distance2D(this.position, playerPos);
    this._faceTarget(playerPos, SHIELD_TURN_RATE, dt);

    if (dist > MELEE_ATTACK_RANGE + 0.3) {
      this._moveToward(playerPos, this.speed, dt);
      this._animateWalk(dt);
      for (const c of colliders) resolveCircleBoxCollision(this.position, ENEMY_RADIUS, c.box);
    } else {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = MELEE_ATTACK_COOLDOWN;
        if (callbacks?.onMeleeAttack) callbacks.onMeleeAttack(this.damage);
      }
    }
  }

  _updateFlamethrower(dt, playerPos, colliders, blockerMeshes, callbacks) {
    const dist = distance2D(this.position, playerPos);
    this._faceTarget(playerPos, 999);

    if (dist > FLAME_RANGE * 0.7) {
      this._moveToward(playerPos, this.speed, dt);
      this._animateWalk(dt);
      this.flameActive = false;
    } else {
      this.flameActive = this._hasLineOfSight(playerPos, blockerMeshes);
    }
    for (const c of colliders) resolveCircleBoxCollision(this.position, ENEMY_RADIUS, c.box);

    if (this.flameCone) this.flameCone.visible = this.flameActive;

    if (this.flameActive && dist <= FLAME_RANGE) {
      callbacks?.onFlameTick?.(FLAME_DPS * dt);
    }
  }

  _updateVeer(dt, playerPos, colliders, blockerMeshes, callbacks) {
    const dist = distance2D(this.position, playerPos);
    this._faceTarget(playerPos, VEER_TURN_RATE, dt);
    const hasLOS = this._hasLineOfSight(playerPos, blockerMeshes);

    if (this.veerThrowLock > 0) {
      // mid-throw: hold the animation to completion before anything else can interrupt it
      this.veerThrowLock -= dt;
      this.veer.setState("throw");
    } else if (dist < VEER_MIN_DIST) {
      this._moveAway(playerPos, this.speed, dt);
      this.veer.setState("walk");
    } else if (dist > VEER_MAX_DIST || !hasLOS) {
      this._moveToward(playerPos, this.speed, dt);
      this.veer.setState("walk");
    } else {
      this.veerGrenadeTimer -= dt;
      this.veerBurstTimer -= dt;

      if (this.veerGrenadeTimer <= 0) {
        this.veerThrowLock = VEER_THROW_DURATION;
        this.veer.setState("throw");
        this.veerGrenadeTimer = rand(7, 11);
        this.veerBurstTimer = Math.max(this.veerBurstTimer, 1.2); // don't also open fire the instant the throw ends
      } else if (this.veerShotsLeftInBurst > 0) {
        this.veer.setState("fire");
        this.veerShotTimer -= dt;
        if (this.veerShotTimer <= 0) {
          this.veerShotTimer = VEER_BURST_INTERVAL;
          this.veerShotsLeftInBurst--;
          this.veer.fireShot();
          const from = this.position.clone();
          from.y += 1.3;
          const hit = Math.random() < VEER_HIT_CHANCE;
          callbacks?.onRangedAttack?.(hit ? this.damage : 0, from, playerPos.clone(), false);
        }
      } else if (this.veerBurstTimer <= 0) {
        this.veerBurstTimer = VEER_BURST_COOLDOWN;
        this.veerShotsLeftInBurst = VEER_BURST_SHOTS;
        this.veer.setState("aim");
      } else {
        this.veer.setState("aim");
      }
    }

    for (const c of colliders) resolveCircleBoxCollision(this.position, ENEMY_RADIUS, c.box);
    this.veer.update(dt);

    if (this._pendingGrenade) {
      callbacks?.onEnemyThrowGrenade?.(this._pendingGrenade.pos, this._pendingGrenade.dir);
      this._pendingGrenade = null;
    }
  }

  _faceTarget(target, turnRate, dt) {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const desired = Math.atan2(-dx, -dz);
    if (turnRate >= 999) {
      this.facingAngle = desired;
    } else {
      let diff = desired - this.facingAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxStep = turnRate * dt;
      this.facingAngle += clamp(diff, -maxStep, maxStep);
    }
    this.group.rotation.y = this.facingAngle;
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
    const armsFixed = this.type === "rifleman" || this.type === "heavy_gunner" || this.type === "flamethrower";
    this.parts.leftArm.rotation.x = armsFixed ? -0.9 : -swing;
    this.parts.rightArm.rotation.x = armsFixed ? -0.9 : swing;
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
    this.pendingSpawns = []; // telegraphed spawns not yet materialized
    this.difficultyMult = { health: 1, damage: 1, spawnRate: 1 };
    this._veerJustSpawned = false;
  }

  reset() {
    for (const e of this.enemies) this.scene.remove(e.group);
    for (const t of this.tracers) this.scene.remove(t.line);
    for (const p of this.pendingSpawns) this.scene.remove(p.ring);
    this.enemies = [];
    this.tracers = [];
    this.pendingSpawns = [];
    this.wave = 0;
    this.spawnQueue = 0;
    this.spawnTimer = 0;
    this._veerJustSpawned = false;
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
    return this.spawnQueue <= 0 && this.aliveCount === 0 && this.pendingSpawns.length === 0;
  }

  _pickType() {
    const roll = Math.random();
    if (this.wave >= 5 && roll < 0.08) return "veer";
    if (this.wave >= 4 && roll < 0.18) return "mutant_brute";
    if (this.wave >= 4 && roll < 0.34) return "flamethrower";
    if (this.wave >= 3 && roll < 0.5) return "drone";
    if (this.wave >= 3 && roll < 0.6) return "heavy_gunner";
    if (this.wave >= 3 && roll < 0.75) return "shield_trooper";
    if (this.wave >= 2 && roll < 0.9) return "rifleman";
    return "grunt";
  }

  _statsFor(type) {
    const w = this.wave;
    const dm = this.difficultyMult;
    let base;
    switch (type) {
      case "veer":
        base = { health: 220 + w * 12, speed: clamp(1.5 + w * 0.04, 1.5, 2.1), damage: 12 + Math.floor(w / 2) };
        break;
      case "mutant_brute":
        base = { health: 140 + w * 10, speed: clamp(1.3 + w * 0.05, 1.3, 2.4), damage: 16 + Math.floor(w / 2) };
        break;
      case "shield_trooper":
        base = { health: 55 + w * 6, speed: clamp(1.4 + w * 0.05, 1.4, 2.6), damage: 9 + Math.floor(w / 2) };
        break;
      case "heavy_gunner":
        base = { health: 60 + w * 6, speed: clamp(1.3 + w * 0.05, 1.3, 2.2), damage: 7 + Math.floor(w / 2) };
        break;
      case "flamethrower":
        base = { health: 40 + w * 5, speed: clamp(1.7 + w * 0.06, 1.7, 2.8), damage: 0 };
        break;
      case "drone":
        base = { health: 24 + w * 6, speed: clamp(1.6 + w * 0.08, 1.6, 3.4) * 1.15, damage: 8 + Math.floor(w / 2) };
        break;
      case "rifleman":
        base = { health: 30 + w * 6, speed: clamp(1.6 + w * 0.08, 1.6, 3.4), damage: 8 + Math.floor(w / 2) };
        break;
      default:
        base = { health: 30 + w * 6 + (Math.random() < 0.15 ? 25 : 0), speed: clamp(1.6 + w * 0.08, 1.6, 3.4), damage: 6 + Math.floor(w / 2) };
    }
    return {
      health: base.health * dm.health,
      speed: base.speed,
      damage: base.damage * dm.damage,
    };
  }

  _queueSpawn() {
    const edge = Math.floor(rand(0, 4));
    const half = this.arenaHalf;
    let x, z;
    if (edge === 0) { x = rand(-half, half); z = -half; }
    else if (edge === 1) { x = rand(-half, half); z = half; }
    else if (edge === 2) { x = -half; z = rand(-half, half); }
    else { x = half; z = rand(-half, half); }

    const type = this._pickType();

    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2b2b, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 20), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    this.scene.add(ring);

    this.pendingSpawns.push({ x, z, type, timer: SPAWN_TELEGRAPH_TIME, ring });
  }

  _materialize(p) {
    const stats = this._statsFor(p.type);
    const enemy = new Enemy({ type: p.type, ...stats, position: new THREE.Vector3(p.x, 0, p.z) });
    this.enemies.push(enemy);
    this.scene.add(enemy.group);
    this.scene.remove(p.ring);
    if (p.type === "veer") this._veerJustSpawned = true;
  }

  // One-shot flag consumed by main.js to trigger a boss-arrival banner exactly
  // once per spawn, without EnemyManager needing to know about the HUD at all.
  consumeVeerSpawnFlag() {
    const flag = this._veerJustSpawned;
    this._veerJustSpawned = false;
    return flag;
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
        this.spawnTimer = 0.6 * this.difficultyMult.spawnRate;
        this._queueSpawn();
        this.spawnQueue--;
      }
    }

    this.pendingSpawns = this.pendingSpawns.filter((p) => {
      p.timer -= dt;
      const pulse = 1 + Math.sin(p.timer * 20) * 0.15;
      p.ring.scale.set(pulse, pulse, 1);
      if (p.timer <= 0) {
        this._materialize(p);
        return false;
      }
      return true;
    });

    for (const enemy of this.enemies) {
      enemy.update(dt, playerPos, colliders, blockerMeshes, {
        onMeleeAttack: (dmg) => callbacks?.onPlayerHit?.(dmg, enemy.position),
        onRangedAttack: (dmg, from, to, suppress) => {
          this._addTracer(from, to);
          if (dmg > 0) {
            callbacks?.onPlayerHit?.(dmg, enemy.position);
            if (suppress) callbacks?.onSuppressed?.();
          }
        },
        onFlameTick: (dmg) => callbacks?.onPlayerHit?.(dmg, enemy.position),
        onEnemyThrowGrenade: (pos, dir) => callbacks?.onEnemyThrowGrenade?.(pos, dir),
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
