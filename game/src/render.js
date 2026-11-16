// SABLE YARD — rendering: the three.js scene, the dusk lighting, the
// low-poly humanoid bodies for the bots, and the first-person viewmodel gun.
// The simulation never touches these meshes except through the small API
// below (spawnBody / setBodyPose / viewmodel), so rendering stays apart
// from the fixed-step sim.
import * as THREE from 'three';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11161f);
  scene.fog = new THREE.Fog(0x11161f, 55, 110);

  const hemi = new THREE.HemisphereLight(0x8fa3c0, 0x2a2118, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
  sun.position.set(28, 42, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x4a6a8a, 0.35);
  fill.position.set(-20, 24, -30);
  scene.add(fill);
  return scene;
}

// A low-poly humanoid from boxes: torso, head with visor, legs, arms, gun.
// Returns { group, head, torso, legL, legR, armR, gun, mats }.
export function makeHumanoid(teamColor, darkColor) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.8 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x0c0f12, roughness: 0.25, metalness: 0.6 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.5, metalness: 0.5 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.34), dark);
  vest.position.y = 1.18;
  group.add(vest);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.06), visor);
  visorMesh.position.set(0, 1.64, 0.16);
  group.add(visorMesh);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), dark);
  legL.position.set(-0.14, 0.39, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), suit);
  armL.position.set(-0.34, 1.18, 0.08);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), suit);
  armR.position.set(0.34, 1.18, 0.08);
  group.add(armR);
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.62), gunMat);
  barrel.position.set(0, 0, 0.28);
  gun.add(barrel);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.24), gunMat);
  stock.position.set(0, -0.02, -0.12);
  gun.add(stock);
  gun.position.set(0.18, 1.32, 0.3);
  group.add(gun);
  return { group, head, torso, legL, legR, armR, gun, mats: { suit, dark } };
}

// Pose a humanoid: yaw faces the aim direction, legs swing while walking,
// the gun dips while reloading. `t` is the walk-phase accumulator.
export function poseHumanoid(body, yaw, moving, t, reloading) {
  body.group.rotation.y = yaw;
  const swing = moving ? Math.sin(t * 9) * 0.5 : 0;
  body.legL.rotation.x = swing;
  body.legR.rotation.x = -swing;
  body.armR.rotation.x = reloading ? -1.1 : -0.35;
  body.gun.position.y = reloading ? 1.22 : 1.32;
  body.gun.rotation.x = reloading ? -0.5 : 0;
}

// The first-person viewmodel: a compact rifle held low-right of the camera.
export function makeViewmodel(camera, colorHex) {
  const gun = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.45, metalness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5, metalness: 0.3 });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.5), dark);
  gun.add(receiver);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), dark);
  barrel.position.set(0, 0.03, -0.42);
  gun.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
  grip.position.set(0, -0.12, 0.12);
  grip.rotation.x = 0.4;
  gun.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.1), accent);
  sight.position.set(0, 0.1, -0.05);
  gun.add(sight);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), dark);
  mag.position.set(0, -0.12, -0.08);
  mag.rotation.x = 0.25;
  gun.add(mag);
  gun.position.set(0.28, -0.26, -0.5);
  camera.add(gun);
  return gun;
}
