import * as THREE from "three";
import { clamp, resolveCircleBoxCollision } from "./utils.js";

const PLAYER_RADIUS = 0.4;
const EYE_HEIGHT = 1.7;
const WALK_SPEED = 5.2;
const SPRINT_SPEED = 8.2;
const JUMP_SPEED = 6.5;
const GRAVITY = -18;

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.position = new THREE.Vector3(0, EYE_HEIGHT, 0);
    this.velocityY = 0;
    this.onGround = true;

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

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);

    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
  }

  requestLock() {
    this.domElement.requestPointerLock();
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
    const sensitivity = 0.0022;
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  }

  _onKeyDown(e) {
    this.keys.add(e.code);
    if (e.code === "Space") e.preventDefault();
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.timeSinceDamage = 0;
    this.health = clamp(this.health - amount, 0, this.maxHealth);
    if (this.health <= 0) this.alive = false;
    if (this.onDamage) this.onDamage(amount);
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
  }

  reset() {
    this.position.set(0, EYE_HEIGHT, 0);
    this.velocityY = 0;
    this.health = this.maxHealth;
    this.alive = true;
    this.yaw = 0;
    this.pitch = 0;
    this.timeSinceDamage = 999;
  }

  update(dt, colliders, arenaHalf) {
    if (!this.alive) return;

    this.timeSinceDamage += dt;
    if (this.timeSinceDamage > this.regenDelay && this.health < this.maxHealth) {
      this.heal(this.regenRate * dt);
    }

    if (!this.locked) return;

    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-1);
    const right = new THREE.Vector3(-forward.z, 0, forward.x);

    let moveX = 0;
    let moveZ = 0;
    if (this.keys.has("KeyW")) { moveX += forward.x; moveZ += forward.z; }
    if (this.keys.has("KeyS")) { moveX -= forward.x; moveZ -= forward.z; }
    if (this.keys.has("KeyD")) { moveX += right.x; moveZ += right.z; }
    if (this.keys.has("KeyA")) { moveX -= right.x; moveZ -= right.z; }

    const len = Math.hypot(moveX, moveZ);
    if (len > 0) { moveX /= len; moveZ /= len; }

    const sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;

    this.position.x += moveX * speed * dt;
    this.position.z += moveZ * speed * dt;

    // Gravity / jump
    if (this.onGround && this.keys.has("Space")) {
      this.velocityY = JUMP_SPEED;
      this.onGround = false;
    }
    this.velocityY += GRAVITY * dt;
    this.position.y += this.velocityY * dt;
    if (this.position.y <= EYE_HEIGHT) {
      this.position.y = EYE_HEIGHT;
      this.velocityY = 0;
      this.onGround = true;
    }

    // Collide against obstacle colliders (2D, on XZ plane)
    for (const box of colliders) {
      resolveCircleBoxCollision(this.position, PLAYER_RADIUS, box);
    }

    // Arena boundary clamp
    this.position.x = clamp(this.position.x, -arenaHalf, arenaHalf);
    this.position.z = clamp(this.position.z, -arenaHalf, arenaHalf);

    this.camera.position.copy(this.position);
  }
}
