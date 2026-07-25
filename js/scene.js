import * as THREE from "three";
import { rand } from "./utils.js";

// Lower internal resolution => canvas CSS scales it up => crisp pixelated look
// via `image-rendering: pixelated` in CSS. Higher divisor = chunkier pixels.
const PIXEL_DIVISOR = 3.2;

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.setPixelRatio(1);
  return renderer;
}

export function resizeRenderer(renderer, camera) {
  const w = Math.max(2, Math.floor(window.innerWidth / PIXEL_DIVISOR));
  const h = Math.max(2, Math.floor(window.innerHeight / PIXEL_DIVISOR));
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb8d6);
  scene.fog = new THREE.Fog(0x8fb8d6, 18, 55);
  return scene;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 1.7, 0);
  return camera;
}

export function addLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3a2a, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d0, 1.1);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  scene.add(sun);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
  fillLight.position.set(-15, 10, -10);
  scene.add(fillLight);
}

const ARENA_HALF = 22;

// Builds the arena floor, boundary walls, and scattered cover blocks.
// Returns an array of THREE.Box3 world-space colliders for gameplay collision.
export function buildArena(scene) {
  const colliders = [];

  const floorMat = new THREE.MeshLambertMaterial({ color: 0x5b6b45 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2, 1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Ground grid texture stand-in: alternating tile blocks for visual read of scale.
  const tileMat1 = new THREE.MeshLambertMaterial({ color: 0x62753f });
  const tileSize = 4;
  for (let x = -ARENA_HALF; x < ARENA_HALF; x += tileSize) {
    for (let z = -ARENA_HALF; z < ARENA_HALF; z += tileSize) {
      if (((x + z) / tileSize) % 2 === 0) continue;
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), tileMat1);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(x + tileSize / 2, 0.01, z + tileSize / 2);
      tile.receiveShadow = true;
      scene.add(tile);
    }
  }

  const wallMat = new THREE.MeshLambertMaterial({ color: 0x4b4536 });
  const wallHeight = 6;
  const wallThickness = 1;

  function addWall(x, z, w, d) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallHeight, d), wallMat);
    wall.position.set(x, wallHeight / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    colliders.push(new THREE.Box3().setFromObject(wall));
  }

  addWall(0, -ARENA_HALF, ARENA_HALF * 2 + wallThickness, wallThickness);
  addWall(0, ARENA_HALF, ARENA_HALF * 2 + wallThickness, wallThickness);
  addWall(-ARENA_HALF, 0, wallThickness, ARENA_HALF * 2 + wallThickness);
  addWall(ARENA_HALF, 0, wallThickness, ARENA_HALF * 2 + wallThickness);

  // Cover crates scattered around the arena.
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  const cratePositions = [];
  let attempts = 0;
  while (cratePositions.length < 14 && attempts < 200) {
    attempts++;
    const x = rand(-ARENA_HALF + 4, ARENA_HALF - 4);
    const z = rand(-ARENA_HALF + 4, ARENA_HALF - 4);
    if (Math.hypot(x, z) < 4.5) continue; // keep spawn clear
    if (cratePositions.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) continue;
    cratePositions.push({ x, z });
  }

  cratePositions.forEach(({ x, z }) => {
    const size = rand(1.2, 2.2);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
    crate.position.set(x, size / 2, z);
    crate.castShadow = true;
    crate.receiveShadow = true;
    scene.add(crate);
    colliders.push(new THREE.Box3().setFromObject(crate));
  });

  return { colliders, arenaHalf: ARENA_HALF - 0.6 };
}
