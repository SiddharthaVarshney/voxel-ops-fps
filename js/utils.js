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

// ---- Sprite billboard support (for enemies using real extracted artwork) ----
const _textureLoader = new THREE.TextureLoader();
const _textureCache = new Map();

function loadTextureCached(url) {
  if (!_textureCache.has(url)) {
    const tex = _textureLoader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    _textureCache.set(url, tex);
  }
  return _textureCache.get(url);
}

// A camera-facing billboard built from a real extracted character sprite.
// heightUnits controls world-space size; aspect is read once the texture loads.
export function buildSpriteBillboard(url, heightUnits = 2.6) {
  const texture = loadTextureCached(url);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(heightUnits, heightUnits, 1);
  sprite.position.y = heightUnits / 2;

  const applyAspect = () => {
    const img = texture.image;
    if (img && img.width) {
      const aspect = img.width / img.height;
      sprite.scale.set(heightUnits * aspect, heightUnits, 1);
      sprite.position.y = heightUnits / 2;
    }
  };
  texture.onUpdate = applyAspect;
  if (texture.image) applyAspect();

  const group = new THREE.Group();
  group.add(sprite);
  return { group, sprite };
}

// A billboard that swaps between 4 real directional sprites (front/right/back/left)
// based on the angle between the entity's facing direction and the viewer, giving
// genuine "rotation" rather than a single static image (classic Doom-sprite technique).
export function buildDirectionalBillboard(urls, heightUnits = 2.6) {
  const textures = {
    front: loadTextureCached(urls.front),
    right: loadTextureCached(urls.right),
    back: loadTextureCached(urls.back),
    left: loadTextureCached(urls.left),
  };

  const material = new THREE.SpriteMaterial({ map: textures.front, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(heightUnits, heightUnits, 1);
  sprite.position.y = heightUnits / 2;

  let currentKey = "front";

  function applyAspectFor(tex) {
    const img = tex.image;
    if (img && img.width) {
      const aspect = img.width / img.height;
      sprite.scale.set(heightUnits * aspect, heightUnits, 1);
      sprite.position.y = heightUnits / 2;
    }
  }

  Object.values(textures).forEach((tex) => {
    tex.onUpdate = () => {
      if (textures[currentKey] === tex) applyAspectFor(tex);
    };
    if (tex.image) applyAspectFor(tex);
  });

  const group = new THREE.Group();
  group.add(sprite);

  // facingAngle: entity's own facing (radians, forward = (sin, 0, cos)).
  // viewerPos: world position of the camera/player.
  // entityPos: world position of the entity (group.position).
  function updateFacing(facingAngle, viewerPos, entityPos) {
    const fx = Math.sin(facingAngle);
    const fz = Math.cos(facingAngle);
    let tx = viewerPos.x - entityPos.x;
    let tz = viewerPos.z - entityPos.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;

    const dot = fx * tx + fz * tz;
    const cross = fx * tz - fz * tx;
    const relAngle = Math.atan2(cross, dot);

    let key;
    if (Math.abs(relAngle) < Math.PI / 4) key = "front";
    else if (relAngle >= Math.PI / 4 && relAngle < (3 * Math.PI) / 4) key = "right";
    else if (relAngle <= -Math.PI / 4 && relAngle > (-3 * Math.PI) / 4) key = "left";
    else key = "back";

    if (key !== currentKey) {
      currentKey = key;
      material.map = textures[key];
      material.needsUpdate = true;
      applyAspectFor(textures[key]);
    }
  }

  return { group, sprite, updateFacing };
}

// ---- Shield Trooper: soldier + a large frontal riot shield ----
export function buildShieldTrooper() {
  const built = buildVoxelSoldier({ bodyColor: 0x2e2f33, headColor: 0xc99a72 });
  const shieldMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.1), shieldMat);
  shield.position.set(0, 1.15, -0.32);
  const emblemMat = new THREE.MeshLambertMaterial({ color: 0xaa1e1e });
  const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.02), emblemMat);
  emblem.position.set(0, 1.15, -0.375);
  built.group.add(shield, emblem);
  shield.castShadow = true;
  return { ...built, shield };
}

// ---- Heavy Gunner: bulkier soldier + minigun cluster ----
export function buildHeavyGunner() {
  const built = buildVoxelSoldier({ bodyColor: 0x4a4030, headColor: 0xc99a72 });
  built.group.scale.set(1.25, 1.2, 1.25);

  const gunMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const gunGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), gunMat);
    barrel.rotation.x = Math.PI / 2;
    const angle = (i / 5) * Math.PI * 2;
    barrel.position.set(Math.cos(angle) * 0.06, Math.sin(angle) * 0.06 - 0.5, -0.25);
    gunGroup.add(barrel);
  }
  built.parts.rightArm.add(gunGroup);
  return { ...built, gunGroup };
}

// ---- Flamethrower Trooper: soldier + fuel tank + nozzle ----
export function buildFlamethrowerTrooper() {
  const built = buildVoxelSoldier({ bodyColor: 0x3a3226, headColor: 0xc99a72 });
  const tankMat = new THREE.MeshLambertMaterial({ color: 0x8a2020 });
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.55, 8), tankMat);
  tank.position.set(0, 1.15, 0.22);
  built.group.add(tank);

  const nozzleMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.4, 6), nozzleMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0.1, -0.55, -0.2);
  built.parts.rightArm.add(nozzle);

  return { ...built, tank };
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
