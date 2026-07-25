import * as THREE from "three";

export function rand(min, max) {
  return Math.random() * (max - min) + min;
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function distance2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// Builds a blocky voxel-style humanoid soldier out of Box geometries.
// Returns { group, parts } where parts exposes limbs for simple procedural animation.
export function buildVoxelSoldier({ bodyColor = 0x4a5d3a, skinColor = 0xd8a878, headColor = null } = {}) {
  const group = new THREE.Group();
  const mat = (color) => new THREE.MeshLambertMaterial({ color });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), mat(bodyColor));
  torso.position.y = 1.05;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), mat(headColor || skinColor));
  head.position.y = 1.6;
  group.add(head);

  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.4), mat(0x2e321f));
  helmet.position.y = 1.82;
  group.add(helmet);

  const armGeo = new THREE.BoxGeometry(0.16, 0.6, 0.16);

  const leftArm = new THREE.Mesh(armGeo, mat(bodyColor));
  leftArm.position.set(-0.33, 1.05, 0);
  leftArm.geometry.translate(0, -0.3, 0);
  leftArm.position.y = 1.35;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, mat(bodyColor));
  rightArm.position.set(0.33, 1.05, 0);
  rightArm.geometry.translate(0, -0.3, 0);
  rightArm.position.y = 1.35;
  group.add(rightArm);

  const legGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2);

  const leftLeg = new THREE.Mesh(legGeo, mat(0x2b2f26));
  leftLeg.geometry.translate(0, -0.325, 0);
  leftLeg.position.set(-0.14, 0.68, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, mat(0x2b2f26));
  rightLeg.geometry.translate(0, -0.325, 0);
  rightLeg.position.set(0.14, 0.68, 0);
  group.add(rightLeg);

  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return {
    group,
    parts: { torso, head, helmet, leftArm, rightArm, leftLeg, rightLeg },
  };
}

// Simple 2D circle-vs-box collision resolution used for arena obstacles.
export function resolveCircleBoxCollision(pos, radius, box) {
  const closestX = clamp(pos.x, box.min.x, box.max.x);
  const closestZ = clamp(pos.z, box.min.z, box.max.z);
  const dx = pos.x - closestX;
  const dz = pos.z - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq < radius * radius && distSq > 1e-6) {
    const dist = Math.sqrt(distSq);
    const overlap = radius - dist;
    pos.x += (dx / dist) * overlap;
    pos.z += (dz / dist) * overlap;
  } else if (distSq <= 1e-6) {
    pos.x += radius;
  }
  return pos;
}
