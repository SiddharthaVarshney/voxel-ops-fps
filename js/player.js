import * as THREE from "three";
import { clamp, resolveCircleBoxCollision } from "./utils.js";

const PLAYER_RADIUS = 0.4;
const EYE_HEIGHT = 1.7;
const WALK_SPEED = 5.2;
const SPRINT_SPEED = 8.2;
const JUMP_SPEED = 6.5;
const GRAVITY = -18;

const STEP_HEIGHT = 0.65; // auto-step instantly up to this height (curbs, small ledges)
const VAULT_MAX_HEIGHT = 2.3; // max obstacle top height reachable via jump/mantle
const VAULT_CLIMB_SPEED = 7; // units/sec while smoothly climbing onto a tall obstacle

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.position = new THREE.Vector3(0, EYE_HEIGHT, 0);
    this.velocityY = 0;
    this.onGround = true;
    this.vaultTargetY = null; // when set, smoothly climbing toward this feet-height

    this.yaw = 0;
    this.pitch = 0;

    this.keys = new Set();
    this.locked = false;

    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
    this.timeSinceDamage = 999;
    this.regenDelay = 4.5;
    this.regenRate = 12; // hp per second

    this.speedMultiplier = 1;
    this.speedDebuffTimer = 0;

    this.analogForward = 0; // -1..1, set by touch joystick
    this.analogStrafe = 0; // -1..1, set by touch joystick

    this.sensitivity = 0.0022;
    this.invertY = false;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onPointerLockError = this._onPointerLockError.bind(this);

    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
    document.addEventListener("pointerlockerror", this._onPointerLockError);
  }

  requestLock() {
    this.domElement.requestPointerLock();
  }

  // Browsers (Chrome in particular) enforce a short cooldown after an
  // Escape-triggered exit during which a new requestPointerLock() silently
  // fails - no pointerlockchange fires, so without this the player is left
  // with dead mouse look and no explanation.
  _onPointerLockError() {
    this.locked = false;
    if (this.onLockError) this.onLockError();
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _onPointerLockChange() {
    this.locked = document.pointerLockElement === this.domElement;
    if (this.locked) {
      document.addEventListener("mousemove", this._onMouseMove);
    } else {
      document.removeEventListener("mousemove", this._onMouseMove);
      this.keys.clear();
    }
    if (this.onLockChange) this.onLockChange(this.locked);
  }

  _onMouseMove(e) {
    this.lookBy(e.movementX, e.movementY);
  }

  // Public entry point for touch-drag look (no real movementX/Y available on touch).
  lookBy(dx, dy, sensitivity = this.sensitivity) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  }

  // Mobile has no Pointer Lock UX — bypass it and drive controls directly.
  enableTouchControl() {
    this.locked = true;
  }

  _onKeyDown(e) {
    this.keys.add(e.code);
    if (e.code === "Space") e.preventDefault();
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  takeDamage(amount, sourcePos) {
    if (!this.alive) return;
    this.timeSinceDamage = 0;
    this.health = clamp(this.health - amount, 0, this.maxHealth);
    if (this.health <= 0) this.alive = false;
    if (this.onDamage) this.onDamage(amount, sourcePos);
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
  }

  applySpeedDebuff(multiplier, duration) {
    this.speedMultiplier = Math.min(this.speedMultiplier, multiplier);
    this.speedDebuffTimer = Math.max(this.speedDebuffTimer, duration);
  }

  reset() {
    this.position.set(0, EYE_HEIGHT, 0);
    this.velocityY = 0;
    this.onGround = true;
    this.vaultTargetY = null;
    this.health = this.maxHealth;
    this.alive = true;
    this.yaw = 0;
    this.pitch = 0;
    this.timeSinceDamage = 999;
    this.speedMultiplier = 1;
    this.speedDebuffTimer = 0;
  }

  // Highest walkable surface (floor or a vaultable obstacle top) under the
  // player's current XZ footprint. Non-vaultable colliders (walls, trees)
  // never contribute here — they're handled as solid horizontal blockers.
  _groundHeightAt(x, z, colliders) {
    let best = 0;
    for (const c of colliders) {
      if (!c.vaultable) continue;
      const box = c.box;
      if (box.max.y > VAULT_MAX_HEIGHT) continue;
      const closestX = clamp(x, box.min.x, box.max.x);
      const closestZ = clamp(z, box.min.z, box.max.z);
      const dx = x - closestX;
      const dz = z - closestZ;
      if (dx * dx + dz * dz <= PLAYER_RADIUS * PLAYER_RADIUS) {
        if (box.max.y > best) best = box.max.y;
      }
    }
    return best;
  }

  update(dt, colliders, arenaHalf) {
    if (!this.alive) return;

    this.timeSinceDamage += dt;
    if (this.timeSinceDamage > this.regenDelay && this.health < this.maxHealth) {
      this.heal(this.regenRate * dt);
    }

    if (this.speedDebuffTimer > 0) {
      this.speedDebuffTimer -= dt;
      if (this.speedDebuffTimer <= 0) this.speedMultiplier = 1;
    }

    if (!this.locked) return;

    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-1);
    const right = new THREE.Vector3(-forward.z, 0, forward.x);

    let inputForward = 0;
    let inputStrafe = 0;
    if (this.keys.has("KeyW")) inputForward += 1;
    if (this.keys.has("KeyS")) inputForward -= 1;
    if (this.keys.has("KeyD")) inputStrafe += 1;
    if (this.keys.has("KeyA")) inputStrafe -= 1;

    inputForward += this.analogForward;
    inputStrafe += this.analogStrafe;

    const inputLen = Math.hypot(inputForward, inputStrafe);
    if (inputLen > 1) {
      inputForward /= inputLen;
      inputStrafe /= inputLen;
    }

    const moveX = forward.x * inputForward + right.x * inputStrafe;
    const moveZ = forward.z * inputForward + right.z * inputStrafe;

    const sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * this.speedMultiplier;

    this.position.x += moveX * speed * dt;
    this.position.z += moveZ * speed * dt;

    // Horizontal collision — only non-vaultable (solid) obstacles block movement.
    // Vaultable ones (crates, rocks) are handled purely via the vertical step below.
    for (const c of colliders) {
      if (c.vaultable) continue;
      resolveCircleBoxCollision(this.position, PLAYER_RADIUS, c.box);
    }

    this.position.x = clamp(this.position.x, -arenaHalf, arenaHalf);
    this.position.z = clamp(this.position.z, -arenaHalf, arenaHalf);

    // Jump input
    if (this.onGround && this.keys.has("Space")) {
      this.velocityY = JUMP_SPEED;
      this.onGround = false;
      this.vaultTargetY = null;
    }

    const groundHeight = this._groundHeightAt(this.position.x, this.position.z, colliders);
    const feetY = this.position.y - EYE_HEIGHT;

    if (this.vaultTargetY !== null) {
      // Mid-climb onto a tall obstacle: rise smoothly, movement stays free.
      this.position.y += VAULT_CLIMB_SPEED * dt;
      if (this.position.y >= this.vaultTargetY) {
        this.position.y = this.vaultTargetY;
        this.vaultTargetY = null;
        this.velocityY = 0;
        this.onGround = true;
      }
    } else if (this.onGround) {
      const diff = groundHeight - feetY;
      if (diff > STEP_HEIGHT) {
        // Taller obstacle within reach: start a smooth climb.
        this.vaultTargetY = groundHeight + EYE_HEIGHT;
      } else if (diff > 0.02) {
        // Small ledge/curb: snap up instantly, imperceptible.
        this.position.y = groundHeight + EYE_HEIGHT;
      } else if (diff < -0.02) {
        // Walked off an edge — start falling this frame.
        this.onGround = false;
        this.velocityY += GRAVITY * dt;
        this.position.y += this.velocityY * dt;
      } else {
        // Already at the right height — stay put, no per-frame gravity churn.
        this.position.y = groundHeight + EYE_HEIGHT;
        this.velocityY = 0;
      }
    } else {
      // Normal gravity / falling / landing.
      this.velocityY += GRAVITY * dt;
      this.position.y += this.velocityY * dt;
      const landHeight = this._groundHeightAt(this.position.x, this.position.z, colliders);
      if (this.velocityY <= 0 && this.position.y - EYE_HEIGHT <= landHeight) {
        this.position.y = landHeight + EYE_HEIGHT;
        this.velocityY = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }
    }

    this.camera.position.copy(this.position);
  }
}
