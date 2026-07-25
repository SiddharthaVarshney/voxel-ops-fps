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

// Attaches a small blocky rifle to a soldier's right arm (used for ranged enemies).
export function attachEnemyGun(rightArm) {
  const gunMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.42), gunMat);
  gun.position.set(0.1, -0.55, -0.18);
  rightArm.add(gun);
  return gun;
}

// Builds a small hovering combat drone: body + four rotor arms + a blinking light.
export function buildDrone() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
  const armMat = new THREE.MeshLambertMaterial({ color: 0x1e1f22 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), bodyMat);
  group.add(body);

  const gunMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.4), gunMat);
  gun.position.set(0, -0.14, 0.35);
  group.add(gun);

  const armOffsets = [
    [0.4, 0, 0.4],
    [-0.4, 0, 0.4],
    [0.4, 0, -0.4],
    [-0.4, 0, -0.4],
  ];
  const rotors = [];
  armOffsets.forEach(([x, y, z]) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), armMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(x * 0.5, 0.02, z * 0.5);
    group.add(arm);

    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 8), armMat);
    rotor.position.set(x, 0.08, z);
    group.add(rotor);
    rotors.push(rotor);
  });

  const light = new THREE.PointLight(0xff3030, 0.6, 2.5);
  light.position.set(0, -0.1, 0.28);
  group.add(light);

  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return { group, gun, rotors, light };
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
