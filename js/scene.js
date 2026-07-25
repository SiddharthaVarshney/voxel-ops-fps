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

  return { hemi, sun, fillLight };
}

const ARENA_HALF = 22;

function makeEnvGroup(scene) {
  const env = new THREE.Group();
  scene.add(env);
  return env;
}

function addTiledFloor(env, colorA, colorB, half = ARENA_HALF) {
  const floorMat = new THREE.MeshLambertMaterial({ color: colorA });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2, 1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  env.add(floor);

  const tileMat = new THREE.MeshLambertMaterial({ color: colorB });
  const tileSize = 4;
  for (let x = -half; x < half; x += tileSize) {
    for (let z = -half; z < half; z += tileSize) {
      if (((x + z) / tileSize) % 2 === 0) continue;
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), tileMat);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(x + tileSize / 2, 0.01, z + tileSize / 2);
      tile.receiveShadow = true;
      env.add(tile);
    }
  }
}

function addBoundaryWalls(env, colliders, raycastMeshes, wallMat, half = ARENA_HALF) {
  const wallHeight = 6;
  const wallThickness = 1;

  function addWall(x, z, w, d) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallHeight, d), wallMat);
    wall.position.set(x, wallHeight / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    env.add(wall);
    colliders.push({ box: new THREE.Box3().setFromObject(wall), vaultable: false });
    raycastMeshes.push(wall);
  }

  addWall(0, -half, half * 2 + wallThickness, wallThickness);
  addWall(0, half, half * 2 + wallThickness, wallThickness);
  addWall(-half, 0, wallThickness, half * 2 + wallThickness);
  addWall(half, 0, wallThickness, half * 2 + wallThickness);
}

function scatterProps(env, colliders, raycastMeshes, { count, half, minSpacing, buildProp }) {
  const positions = [];
  let attempts = 0;
  while (positions.length < count && attempts < count * 25) {
    attempts++;
    const x = rand(-half + 3, half - 3);
    const z = rand(-half + 3, half - 3);
    if (Math.hypot(x, z) < 4.5) continue; // keep spawn clear
    if (positions.some((p) => Math.hypot(p.x - x, p.z - z) < minSpacing)) continue;
    positions.push({ x, z });
  }
  positions.forEach(({ x, z }) => {
    buildProp(x, z, env, colliders, raycastMeshes);
  });
}

// ---------------- Compound (original arena) ----------------
export function buildArena(scene) {
  const env = makeEnvGroup(scene);
  const colliders = [];
  const raycastMeshes = [];

  addTiledFloor(env, 0x5b6b45, 0x62753f);

  const wallMat = new THREE.MeshLambertMaterial({ color: 0x4b4536 });
  addBoundaryWalls(env, colliders, raycastMeshes, wallMat);

  const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  scatterProps(env, colliders, raycastMeshes, {
    count: 14,
    half: ARENA_HALF,
    minSpacing: 4,
    buildProp: (x, z, env, colliders, raycastMeshes) => {
      const size = rand(1.2, 2.2);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
      crate.position.set(x, size / 2, z);
      crate.castShadow = true;
      crate.receiveShadow = true;
      env.add(crate);
      colliders.push({ box: new THREE.Box3().setFromObject(crate), vaultable: true });
      raycastMeshes.push(crate);
    },
  });

  scene.background = new THREE.Color(0x8fb8d6);
  scene.fog = new THREE.Fog(0x8fb8d6, 18, 55);

  return { colliders, raycastMeshes, arenaHalf: ARENA_HALF - 0.6, envGroup: env };
}

// ---------------- Jungle ----------------
function buildTree(x, z, env, colliders, raycastMeshes) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3521 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e5c2a });

  const height = rand(4.5, 6.5);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, height, 6), trunkMat);
  trunk.position.set(x, height / 2, z);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  env.add(trunk);

  const canopy = new THREE.Mesh(new THREE.ConeGeometry(rand(1.6, 2.2), rand(2.5, 3.5), 7), leafMat);
  canopy.position.set(x, height + 0.8, z);
  canopy.castShadow = true;
  env.add(canopy);

  const canopy2 = new THREE.Mesh(new THREE.ConeGeometry(rand(1.2, 1.6), rand(1.8, 2.4), 6), leafMat);
  canopy2.position.set(x, height + 2.1, z);
  canopy2.castShadow = true;
  env.add(canopy2);

  colliders.push({ box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, 1, z), new THREE.Vector3(0.8, 2, 0.8)), vaultable: false });
  raycastMeshes.push(trunk, canopy);
}

function buildRock(x, z, env, colliders, raycastMeshes, palette) {
  const rockMat = new THREE.MeshLambertMaterial({ color: palette });
  const scaleX = rand(1.2, 2.4);
  const scaleY = rand(0.8, 1.6);
  const scaleZ = rand(1.2, 2.4);
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
  rock.scale.set(scaleX, scaleY, scaleZ);
  rock.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
  rock.position.set(x, scaleY * 0.5, z);
  rock.castShadow = true;
  rock.receiveShadow = true;
  env.add(rock);

  colliders.push({ box: new THREE.Box3().setFromObject(rock), vaultable: true });
  raycastMeshes.push(rock);
}

export function buildJungle(scene) {
  const env = makeEnvGroup(scene);
  const colliders = [];
  const raycastMeshes = [];

  addTiledFloor(env, 0x3d5a2e, 0x466534);

  const wallMat = new THREE.MeshLambertMaterial({ color: 0x2e4022 });
  addBoundaryWalls(env, colliders, raycastMeshes, wallMat);

  scatterProps(env, colliders, raycastMeshes, {
    count: 16,
    half: ARENA_HALF,
    minSpacing: 4.5,
    buildProp: (x, z, e, c, r) => buildTree(x, z, e, c, r),
  });

  scatterProps(env, colliders, raycastMeshes, {
    count: 9,
    half: ARENA_HALF,
    minSpacing: 4,
    buildProp: (x, z, e, c, r) => buildRock(x, z, e, c, r, 0x5c5a4d),
  });

  scene.background = new THREE.Color(0x9fc48a);
  scene.fog = new THREE.Fog(0x6f8f5a, 12, 42);

  return { colliders, raycastMeshes, arenaHalf: ARENA_HALF - 0.6, envGroup: env };
}

// ---------------- Beach ----------------
function buildPalm(x, z, env, colliders, raycastMeshes) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a35 });

  const height = rand(4, 5.5);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, height, 6), trunkMat);
  trunk.position.set(x, height / 2, z);
  trunk.rotation.z = rand(-0.12, 0.12);
  trunk.castShadow = true;
  env.add(trunk);

  for (let i = 0; i < 5; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.25, 2.2, 4), leafMat);
    frond.position.set(x, height + 0.3, z);
    frond.rotation.z = Math.PI / 2.4;
    frond.rotation.y = (i / 5) * Math.PI * 2;
    frond.castShadow = true;
    env.add(frond);
  }

  colliders.push({ box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, 1, z), new THREE.Vector3(0.6, 2, 0.6)), vaultable: false });
  raycastMeshes.push(trunk);
}

export function buildBeach(scene) {
  const env = makeEnvGroup(scene);
  const colliders = [];
  const raycastMeshes = [];

  addTiledFloor(env, 0xd8c58a, 0xcfba7a);

  // Water along one edge, non-collidable visual, backed by an invisible boundary wall.
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x2f7ab0, transparent: true, opacity: 0.85 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2 + 10, 14), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.03, -ARENA_HALF - 6);
  env.add(water);

  const wallMat = new THREE.MeshLambertMaterial({ color: 0xb89a5a });
  addBoundaryWalls(env, colliders, raycastMeshes, wallMat);
  // hide the north wall visually behind the waterline by tinting handled via wallMat already

  scatterProps(env, colliders, raycastMeshes, {
    count: 10,
    half: ARENA_HALF,
    minSpacing: 4.5,
    buildProp: (x, z, e, c, r) => buildPalm(x, z, e, c, r),
  });

  scatterProps(env, colliders, raycastMeshes, {
    count: 10,
    half: ARENA_HALF,
    minSpacing: 4,
    buildProp: (x, z, e, c, r) => buildRock(x, z, e, c, r, 0x8a8878),
  });

  scene.background = new THREE.Color(0xbfe6f0);
  scene.fog = new THREE.Fog(0xbfe6f0, 16, 50);

  return { colliders, raycastMeshes, arenaHalf: ARENA_HALF - 0.6, envGroup: env };
}

export const LEVELS = [
  { id: "compound", name: "Compound", build: buildArena },
  { id: "jungle", name: "Jungle", build: buildJungle },
  { id: "beach", name: "Beach Assault", build: buildBeach },
];

// Fully removes a previous environment (geometries + materials disposed) so
// switching maps between runs doesn't leak GPU memory.
export function disposeEnvironment(scene, envGroup) {
  if (!envGroup) return;
  envGroup.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material?.dispose();
    }
  });
  scene.remove(envGroup);
}
