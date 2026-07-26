import * as THREE from "three";

// ============================================================================
// VEER — "STRIPES", Shadow Legion operative. A boss-tier enemy: a rival human
// assault operative rather than another creature, ported from a standalone
// character-rig prototype into this game's module system.
//
// buildVeer() returns a self-contained instance: { group, setState, fireShot,
// update(dt), onGrenadeRelease }. All per-instance pose state (smoothed limb
// rotations, fire-shot timestamps, throw timing, the glove finger rig) lives
// in closures here, so enemies.js only drives it through that small API and
// never touches Three.js internals directly - mirroring how the rest of the
// game keeps enemy AI (enemies.js) separate from enemy geometry (utils.js).
// ============================================================================

const COLORS = {
  skin: 0xc9976b,
  black: 0x17171a,
  blackSoft: 0x222225,
  red: 0xb31217,
  redBright: 0xe0222d,
  tan: 0x8a7350,
  wood: 0x7a4322,
  metal: 0x45454a,
  metalLight: 0x6d6d72,
  hair: 0x131110,
  boot: 0x1c1c1e,
};

function vox(sx, sy, sz, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ---- articulated glove (adapted from the tactical-glove viewer prototype) ----
// Same anatomy as the standalone glove rig - palm, 4 fingers each with a
// root(proximal)+distal joint, and an angled thumb - at 1/3 scale to fit a
// body rig's hand instead of a stand-alone hero prop.
function buildGloveHand(mirror) { // mirror: +1 = right hand, -1 = left hand
  const handGroup = new THREE.Group();
  const glove1 = COLORS.blackSoft, glove2 = COLORS.black, tip = COLORS.tan;

  handGroup.add(vox(0.115, 0.05, 0.11, glove1, 0, -0.02, 0));
  handGroup.add(vox(0.10, 0.014, 0.02, glove2, 0, 0.012, -0.045));

  const FW = 0.017, FD = 0.02;
  const fingerDefs = [
    { name: "index", x: -0.033 * mirror, proxH: 0.044, distH: 0.028 },
    { name: "middle", x: -0.011 * mirror, proxH: 0.05, distH: 0.032 },
    { name: "ring", x: 0.011 * mirror, proxH: 0.044, distH: 0.028 },
    { name: "pinky", x: 0.033 * mirror, proxH: 0.034, distH: 0.022 },
  ];

  const fingers = {};
  fingerDefs.forEach((fd) => {
    const root = new THREE.Group();
    root.position.set(fd.x, 0.006, -0.05);
    handGroup.add(root);
    root.add(vox(FW, fd.proxH, FD, glove1, 0, fd.proxH / 2, 0));

    const jDist = new THREE.Group();
    jDist.position.set(0, fd.proxH, 0);
    root.add(jDist);
    jDist.add(vox(FW * 0.85, fd.distH, FD * 0.85, tip, 0, fd.distH / 2, 0));

    fingers[fd.name] = { root, jDist };
  });

  const tRoot = new THREE.Group();
  tRoot.position.set(0.05 * mirror, -0.008, -0.008);
  handGroup.add(tRoot);
  tRoot.add(vox(0.022, 0.03, 0.022, glove1, 0, 0.015, 0));
  const tDist = new THREE.Group();
  tDist.position.set(0, 0.03, 0);
  tRoot.add(tDist);
  tDist.add(vox(0.018, 0.02, 0.018, tip, 0, 0.01, 0));

  return { group: handGroup, fingers, thumb: { root: tRoot, jDist: tDist }, mirror };
}

const HAND_GESTURES = {
  rest: { f: [0.15, 0.1], tRz: 0.5, tRx: -0.2 },
  grip: { f: [1.3, 1.1], tRz: 0.35, tRx: 0.75 },
  gun: { f: [1.3, 1.1], index: [0, 0], tRz: 0.85, tRx: -0.1 },
  spread: { f: [0, 0], tRz: 0.85, tRx: -0.35 },
};

function blendGlove(glove, gestureName, extraIndexCurl, t) {
  const g = HAND_GESTURES[gestureName] || HAND_GESTURES.rest;
  ["index", "middle", "ring", "pinky"].forEach((name) => {
    const f = glove.fingers[name];
    const tgt = name === "index" && g.index ? g.index : g.f;
    const extra = name === "index" ? extraIndexCurl : 0;
    f.root.rotation.x = lerp(f.root.rotation.x, tgt[0] + extra, t);
    f.jDist.rotation.x = lerp(f.jDist.rotation.x, tgt[1] + extra, t);
  });
  glove.thumb.root.rotation.z = lerp(glove.thumb.root.rotation.z, g.tRz * glove.mirror, t);
  glove.thumb.root.rotation.x = lerp(glove.thumb.root.rotation.x, g.tRx, t);
}

// two-bone IK (swing-only, law-of-cosines elbow) — solves shoulder(Z then X) +
// elbow(X) so the hand chain reaches targetLocal, in the shoulder's parent
// local space. Used to plant the off-hand on the rifle's foregrip.
function solveTwoBoneAim(shoulderGroup, elbowGroup, upperLen, lowerLen, targetLocal) {
  const v = targetLocal.clone().sub(shoulderGroup.position);
  const maxReach = upperLen + lowerLen - 0.001;
  const minReach = Math.abs(upperLen - lowerLen) + 0.001;
  const d = THREE.MathUtils.clamp(v.length(), minReach, maxReach);
  const dir = v.clone().normalize();

  const alpha = Math.asin(THREE.MathUtils.clamp(dir.x, -1, 1));
  const beta = Math.atan2(-dir.z, -dir.y);
  shoulderGroup.rotation.order = "ZXY";
  shoulderGroup.rotation.set(beta, 0, alpha);

  const cosElbow = THREE.MathUtils.clamp(
    (upperLen * upperLen + lowerLen * lowerLen - d * d) / (2 * upperLen * lowerLen), -1, 1
  );
  const elbowInterior = Math.acos(cosElbow);
  elbowGroup.rotation.x = -(Math.PI - elbowInterior);
}

export function buildVeer() {
  const FOOT_H = 0.12, LOWER_LEG = 0.36, UPPER_LEG = 0.4, TORSO_H = 0.46;
  const PELVIS_Y = FOOT_H + LOWER_LEG + UPPER_LEG;

  const inner = new THREE.Group(); // the actual rig — flipped 180° below so external rotation stays clean

  function buildLeg(sideX, footColor) {
    const hip = new THREE.Group();
    hip.position.set(sideX, PELVIS_Y, 0);
    hip.add(vox(0.16, UPPER_LEG, 0.18, COLORS.black, 0, -UPPER_LEG / 2, 0));

    const knee = new THREE.Group();
    knee.position.set(0, -UPPER_LEG, 0);
    hip.add(knee);
    knee.add(vox(0.14, LOWER_LEG, 0.16, COLORS.blackSoft, 0, -LOWER_LEG / 2, 0));
    knee.add(vox(0.16, FOOT_H, 0.3, footColor, 0, -LOWER_LEG - FOOT_H / 2, 0.06));
    knee.add(vox(0.17, 0.08, 0.06, COLORS.tan, 0, -0.02, 0.1));

    return { hip, knee };
  }
  const legL = buildLeg(-0.11, COLORS.boot);
  const legR = buildLeg(0.11, COLORS.boot);
  inner.add(legL.hip, legR.hip);

  const pelvis = new THREE.Group();
  pelvis.position.set(0, PELVIS_Y, 0);
  inner.add(pelvis);
  pelvis.add(vox(0.32, 0.14, 0.2, COLORS.black, 0, 0.07, 0));

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.13, 0);
  pelvis.add(torsoGroup);

  torsoGroup.add(vox(0.4, TORSO_H, 0.24, COLORS.black, 0, TORSO_H / 2, 0)); // chest armor
  // red stripe accents — the character's own "STRIPES" callsign motif (no flag)
  torsoGroup.add(vox(0.045, TORSO_H * 0.62, 0.015, COLORS.red, 0.05, TORSO_H * 0.5, 0.125));
  torsoGroup.add(vox(0.045, TORSO_H * 0.62, 0.015, COLORS.redBright, 0.12, TORSO_H * 0.5, 0.125));
  torsoGroup.add(vox(0.14, 0.16, 0.08, COLORS.tan, 0, TORSO_H * 0.32, 0.16));
  torsoGroup.add(vox(0.16, 0.08, 0.16, COLORS.tan, -0.24, TORSO_H - 0.02, 0));
  torsoGroup.add(vox(0.16, 0.08, 0.16, COLORS.tan, 0.24, TORSO_H - 0.02, 0));
  torsoGroup.add(vox(0.28, 0.32, 0.12, COLORS.blackSoft, 0, TORSO_H * 0.55, -0.19));

  const headGroup = new THREE.Group();
  headGroup.position.set(0, TORSO_H + 0.05, 0);
  torsoGroup.add(headGroup);

  headGroup.add(vox(0.2, 0.08, 0.2, COLORS.skin, 0, 0.04, 0));
  headGroup.add(vox(0.22, 0.06, 0.21, COLORS.skin, 0, 0.1, -0.005));
  headGroup.add(vox(0.15, 0.05, 0.19, COLORS.skin, 0, 0.055, 0.01));
  headGroup.add(vox(0.22, 0.16, 0.22, COLORS.skin, 0, 0.2, -0.01));
  headGroup.add(vox(0.05, 0.07, 0.08, COLORS.skin, -0.1, 0.16, 0.09));
  headGroup.add(vox(0.05, 0.07, 0.08, COLORS.skin, 0.1, 0.16, 0.09));
  headGroup.add(vox(0.06, 0.1, 0.05, COLORS.skin, 0, 0.185, 0.125));
  headGroup.add(vox(0.05, 0.045, 0.045, COLORS.skin, 0, 0.135, 0.15));
  headGroup.add(vox(0.19, 0.03, 0.2, 0x8a6b4a, 0, 0.225, 0.06));
  headGroup.add(vox(0.03, 0.08, 0.06, COLORS.skin, -0.115, 0.19, -0.01));
  headGroup.add(vox(0.03, 0.08, 0.06, COLORS.skin, 0.115, 0.19, -0.01));
  headGroup.add(vox(0.24, 0.1, 0.24, COLORS.hair, 0, 0.31, -0.01));
  headGroup.add(vox(0.24, 0.04, 0.08, COLORS.hair, 0, 0.255, 0.1));
  headGroup.add(vox(0.23, 0.13, 0.14, COLORS.black, 0, 0.115, 0.08));
  headGroup.add(vox(0.03, 0.13, 0.01, COLORS.red, -0.06, 0.115, 0.152));
  headGroup.add(vox(0.03, 0.13, 0.01, COLORS.redBright, 0.02, 0.115, 0.152));
  headGroup.add(vox(0.03, 0.13, 0.01, COLORS.red, 0.08, 0.115, 0.152));
  headGroup.add(vox(0.038, 0.032, 0.01, 0x1a1a1a, -0.058, 0.2, 0.128));
  headGroup.add(vox(0.038, 0.032, 0.01, 0x1a1a1a, 0.058, 0.2, 0.128));
  headGroup.add(vox(0.245, 0.04, 0.245, COLORS.blackSoft, 0, 0.245, 0));

  function buildArm(sideX) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX, TORSO_H - 0.05, 0);
    shoulder.add(vox(0.13, 0.32, 0.13, COLORS.black, 0, -0.16, 0));

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.32, 0);
    shoulder.add(elbow);
    elbow.add(vox(0.115, 0.28, 0.115, COLORS.tan, 0, -0.14, 0));

    const hand = new THREE.Group();
    hand.position.set(0, -0.28, 0);
    elbow.add(hand);
    const glove = buildGloveHand(sideX >= 0 ? 1 : -1);
    glove.group.position.set(0, -0.05, 0);
    hand.add(glove.group);

    return { shoulder, elbow, hand, glove };
  }
  const armL = buildArm(-0.24);
  const armR = buildArm(0.24);
  torsoGroup.add(armL.shoulder, armR.shoulder);

  const rifle = new THREE.Group();
  rifle.add(vox(0.065, 0.09, 0.32, COLORS.wood, 0, 0, -0.16));
  rifle.add(vox(0.075, 0.1, 0.4, COLORS.metal, 0, 0.01, 0.1));
  rifle.add(vox(0.06, 0.07, 0.28, COLORS.wood, 0, -0.02, 0.28));
  rifle.add(vox(0.032, 0.032, 0.55, COLORS.metalLight, 0, 0.015, 0.62));
  const mag = vox(0.055, 0.24, 0.07, COLORS.metal, 0, -0.17, 0.02);
  mag.rotation.x = 0.35;
  rifle.add(mag);
  rifle.add(vox(0.04, 0.14, 0.04, COLORS.blackSoft, 0, 0.13, -0.28));

  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 6), flashMat);
  flash.rotation.x = Math.PI / 2;
  flash.position.set(0, 0.015, 0.92);
  rifle.add(flash);
  const muzzleLight = new THREE.PointLight(0xffbb55, 0, 1.5);
  muzzleLight.position.set(0, 0.02, 0.9);
  rifle.add(muzzleLight);

  armR.hand.add(rifle);
  rifle.position.set(0, -0.05, 0.05);

  function makeGrenade() {
    const g = new THREE.Group();
    g.add(vox(0.09, 0.11, 0.09, 0x3a4a2e));
    g.add(vox(0.03, 0.03, 0.03, COLORS.metal, 0, 0.07, 0));
    g.add(vox(0.095, 0.02, 0.095, COLORS.red, 0, 0.02, 0));
    return g;
  }

  inner.rotation.y = Math.PI; // "front" of the built geometry faces +Z; flip once so the
                              // external group's facingAngle=0 matches the game's forward
                              // convention (forward = -Z), same as every other enemy type.
  const group = new THREE.Group();
  group.add(inner);
  group.scale.setScalar(1.15); // a touch larger than a regular soldier — reads as tougher

  group.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });

  // ---- instance state (closures — fresh per buildVeer() call) ----
  let state = "idle"; // 'idle'|'walk'|'aim'|'fire'|'throw'
  let elapsed = 0;
  let throwStart = 0;
  let fireShots = [];
  let grenade = null;
  let onGrenadeRelease = null;

  const pose = {
    hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
    shL_x: 0, shL_z: 0, shR_x: 0, shR_z: 0, elL: 0, elR: 0,
    torsoX: 0, torsoY: 0, torsoYaw: 0, headY: 0, rifleX: 0,
  };

  function setState(name) {
    if (name === "throw" && state !== "throw") throwStart = elapsed;
    state = name;
  }
  function fireShot() {
    fireShots.push(elapsed);
  }

  function update(dt) {
    elapsed += dt;
    const t = elapsed;

    const target = { hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, shL_x: 0, shL_z: 0, shR_x: 0, shR_z: 0, elL: 0, elR: 0, torsoX: 0, torsoY: 0, torsoYaw: 0, headY: 0, rifleX: 0 };
    const smooth = 6;

    if (state === "idle") {
      target.torsoY = Math.sin(t * 1.6) * 0.008;
      target.headY = Math.sin(t * 0.35) * 0.18;
      target.shL_z = 0.12 + Math.sin(t * 1.6) * 0.02;
      target.shR_z = -0.1;
      target.elL = 0.15;
      target.elR = 0.35;
      target.rifleX = 0.2;
    } else if (state === "walk") {
      const w = t * 6;
      target.hipL = Math.sin(w) * 0.55;
      target.hipR = -Math.sin(w) * 0.55;
      target.kneeL = Math.max(0, -Math.sin(w)) * 0.9;
      target.kneeR = Math.max(0, Math.sin(w)) * 0.9;
      target.shL_x = -Math.sin(w) * 0.5;
      target.shR_x = Math.sin(w) * 0.5;
      target.shR_z = -0.05;
      target.elR = 0.3;
      target.torsoY = Math.abs(Math.sin(w)) * 0.03;
      target.torsoX = Math.sin(w * 0.5) * 0.03;
      target.torsoYaw = -Math.sin(w) * 0.12;
      target.rifleX = 0.15;
    } else if (state === "aim" || state === "fire") {
      target.torsoX = 0.1;
      target.shR_x = -0.55; target.shR_z = -0.2;
      target.elR = 1.0;
      target.shL_x = -0.5; target.shL_z = 0.4;
      target.elL = 1.35;
      target.kneeL = 0.15; target.kneeR = 0.15;
      target.hipL = -0.08; target.hipR = -0.08;
      target.headY = 0;
      target.rifleX = 0;
    } else if (state === "throw") {
      const dur = t - throwStart;
      if (dur < 0.5) {
        const p = dur / 0.5;
        target.shR_x = lerp(0, -2.4, p);
        target.elR = lerp(0.2, 2.3, p);
        target.torsoX = lerp(0, -0.15, p);
        if (!grenade) {
          grenade = makeGrenade();
          armR.hand.add(grenade);
          grenade.position.set(0, -0.06, 0.02);
        }
      } else if (dur < 0.85) {
        const p = (dur - 0.5) / 0.35;
        target.shR_x = lerp(-2.4, 0.9, p);
        target.elR = lerp(2.3, 0.1, p);
        target.torsoX = lerp(-0.15, 0.1, p);
        if (grenade && grenade.parent === armR.hand && p > 0.4) {
          const worldPos = new THREE.Vector3();
          grenade.getWorldPosition(worldPos);
          const releaseDir = new THREE.Vector3(0, 0.35, 1).normalize();
          armR.hand.localToWorld(releaseDir);
          const originWorld = new THREE.Vector3();
          armR.hand.localToWorld(originWorld.set(0, 0, 0));
          releaseDir.sub(originWorld).normalize();
          armR.hand.remove(grenade);
          group.remove(grenade); // in case it got re-parented; harmless no-op otherwise
          if (onGrenadeRelease) onGrenadeRelease(worldPos, releaseDir);
          grenade = null;
        }
      } else {
        target.shR_x = 0; target.elR = 0.3;
      }
    }

    const k = 1 - Math.exp(-smooth * dt);
    for (const key in pose) pose[key] = lerp(pose[key], target[key], k);

    legL.hip.rotation.x = pose.hipL;
    legR.hip.rotation.x = pose.hipR;
    legL.knee.rotation.x = -pose.kneeL;
    legR.knee.rotation.x = -pose.kneeR;

    armR.shoulder.rotation.x = pose.shR_x;
    armR.shoulder.rotation.z = pose.shR_z;
    armR.elbow.rotation.x = -pose.elR;

    torsoGroup.rotation.x = pose.torsoX;
    torsoGroup.rotation.y = pose.torsoYaw;
    pelvis.position.y = PELVIS_Y + pose.torsoY;
    headGroup.rotation.y = pose.headY;

    let recoil = 0, flashOpacity = 0, lightIntensity = 0;
    for (let i = fireShots.length - 1; i >= 0; i--) {
      const age = t - fireShots[i];
      if (age > 0.18) { fireShots.splice(i, 1); continue; }
      const p = age / 0.18;
      recoil += (1 - p) * 0.25;
      if (age < 0.05) { flashOpacity = Math.max(flashOpacity, 1 - age / 0.05); lightIntensity = Math.max(lightIntensity, 2.5 * (1 - age / 0.05)); }
    }

    if (state === "aim" || state === "fire") {
      const handTotalX = armR.shoulder.rotation.x + armR.elbow.rotation.x;
      const desiredWorldPitch = 0.05;
      const recoilKick = recoil * 0.35;
      rifle.rotation.x = -handTotalX + desiredWorldPitch - recoilKick;
    } else {
      rifle.rotation.x = pose.rifleX;
    }
    torsoGroup.rotation.x += -recoil * 0.04;
    flashMat.opacity = flashOpacity;
    muzzleLight.intensity = lightIntensity;

    if (state === "aim" || state === "fire") {
      group.updateMatrixWorld(true);
      const gripWorld = new THREE.Vector3(0, -0.02, 0.28);
      rifle.localToWorld(gripWorld);
      const gripLocal = torsoGroup.worldToLocal(gripWorld);
      solveTwoBoneAim(armL.shoulder, armL.elbow, 0.32, 0.28, gripLocal);
    } else {
      armL.shoulder.rotation.order = "XYZ";
      armL.shoulder.rotation.x = pose.shL_x;
      armL.shoulder.rotation.z = pose.shL_z;
      armL.elbow.rotation.x = -pose.elL;
    }

    // glove gestures: grip while carrying/aiming, trigger-finger twitch synced
    // to the same recoil pulse, open hand for the grenade release beat
    let rightGesture = "grip", leftGesture = "grip", indexTwitch = 0;
    if (state === "aim" || state === "fire") {
      rightGesture = "gun";
      if (state === "fire") indexTwitch = recoil * 1.4;
    } else if (state === "throw") {
      const dur = t - throwStart;
      rightGesture = dur >= 0.58 && dur < 0.85 ? "spread" : "grip";
    }
    const handK = 1 - Math.exp(-10 * dt);
    blendGlove(armR.glove, rightGesture, indexTwitch, handK);
    blendGlove(armL.glove, leftGesture, 0, handK);
  }

  return {
    group,
    setState,
    fireShot,
    update,
    set onGrenadeRelease(fn) { onGrenadeRelease = fn; },
  };
}
