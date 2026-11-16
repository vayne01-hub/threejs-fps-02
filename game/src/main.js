// SABLE YARD — boot and the fixed-step loop. This file wires the world
// together and owns nothing else: the sim runs at 60 Hz in step(), the
// renderer draws the current state every animation frame, and the two never
// share mutable helpers. A small debug hook (window.__SABLE__) lets the
// headless play-test drive real game states for its screenshots.
import * as THREE from 'three';
import { TICK, WEAPONS, TEAMS } from './config.js';
import { buildWorld, SPAWNS } from './map.js';
import { createRenderer, createScene, makeHumanoid, poseHumanoid, makeViewmodel } from './render.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { Round } from './round.js';
import { HUD } from './hud.js';
import { startReload } from './weapons.js';

const canvas = document.createElement('canvas');
document.getElementById('game').appendChild(canvas);
// Clicking the canvas re-locks the pointer (after the buy menu, a pause,
// or the freeze ending while the menu was open).
canvas.addEventListener('click', () => {
  if (world.started && !input.locked && !hud.buyOpen && round.phase !== 'menu' && round.phase !== 'matchEnd') {
    sounds.ensure();
    input.lock();
  }
});
const renderer = createRenderer(canvas);
const scene = createScene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);
buildWorld(scene);

const fx = new FX(scene);
const sounds = new SoundBank();
const input = new Input(canvas);
const player = new Player();

const world = {
  time: 0,
  input, fx, sounds, player,
  bots: [],
  round: null,
  hud: null,
  spawns: SPAWNS,
  paused: false,
  started: false,
  enemiesOf(team) {
    const list = [];
    if (team !== 'sable' && player.alive) list.push(player);
    for (const b of this.bots) if (b.team !== team) list.push(b);
    return list;
  },
  nearestAttackerTo(x, z) {
    let best = null;
    let bestD = Infinity;
    const consider = (a) => {
      if (!a.alive) return;
      const d = Math.hypot(a.pos.x - x, a.pos.z - z);
      if (d < bestD) { bestD = d; best = a; }
    };
    if (player.alive && player.team === 'sable') consider(player);
    for (const b of this.bots) if (b.team === 'sable') consider(b);
    return best;
  },
  noise(x, z, team) {
    if (this.round) this.round.noises.push({ x, z, team, t: this.time });
  },
  // The spike lives on the Round; expose it (and its plant/defuse ticks)
  // through the world so the player and the bots share one accessor.
  get bomb() { return this.round ? this.round.bomb : null; },
  get noises() { return this.round ? this.round.noises : []; },
  bombPlantTick(actor, dt, site) {
    this.round.bombPlantTick(actor, dt, site);
  },
  bombDefuseTick(actor, dt) {
    this.round.bombDefuseTick(actor, dt);
  },
  onDamage(attacker, victim, dealt, isHead) {
    this.round.onDamage(attacker, victim, dealt, isHead);
  },
  spawnGrenade(pos, vel, owner) {
    this.round.spawnGrenade(pos, vel, owner);
  },
  hudMessage(t) { this.hud.hudMessage(t); },
  hudBanner(t) { this.hud.hudBanner(t); },
  hudKillfeed(k, v, h) { this.hud.hudKillfeed(k, v, h); },
  hudHitmarker(h) { this.hud.hudHitmarker(h); },
  hudDamageFlash() { this.hud.hudDamageFlash(); },
  hudMatchEnd(w) { this.hud.hudMatchEnd(w); },
  buyItem(id) {
    let ok = false;
    if (id === 'grenade') ok = this.round.buyGrenade();
    else if (id === 'armor') ok = this.round.buyArmor();
    else ok = this.round.buyWeapon(id);
    if (!ok) this.sounds.denied();
    this.hud.refreshBuy();
    return ok;
  },
  onPlayerDeath() {
    document.getElementById('dead-note').hidden = false;
    setTimeout(() => { document.getElementById('dead-note').hidden = true; }, 4000);
  },
  syncBots() { syncBotMeshes(); },
};

// Bots: 3 teammates, 4 enemies (4v4 with the player).
for (let i = 0; i < 3; i++) {
  const mesh = makeHumanoid(TEAMS.sable.color, TEAMS.sable.dark);
  scene.add(mesh.group);
  world.bots.push(new Bot('sable', i, mesh));
}
for (let i = 0; i < 4; i++) {
  const mesh = makeHumanoid(TEAMS.vulture.color, TEAMS.vulture.dark);
  scene.add(mesh.group);
  world.bots.push(new Bot('vulture', i, mesh));
}

const round = new Round(world);
world.round = round;
const hud = new HUD(world);
world.hud = hud;

// Viewmodel gun, tinted per weapon.
const viewmodel = makeViewmodel(camera, WEAPONS.pistol.tracer);
let viewmodelWeapon = 'pistol';

// The spike: a small blinking device, shown planted or dropped.
const bombMesh = new THREE.Group();
const bombBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 0.22, 0.3),
  new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.4 }),
);
bombBody.position.y = 0.11;
bombMesh.add(bombBody);
const bombLight = new THREE.Mesh(
  new THREE.BoxGeometry(0.12, 0.06, 0.12),
  new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2 }),
);
bombLight.position.y = 0.25;
bombMesh.add(bombLight);
bombMesh.visible = false;
scene.add(bombMesh);

// Grenade meshes (pooled, 4 max).
const grenadeMeshes = [];
for (let i = 0; i < 4; i++) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2f26, roughness: 0.6, metalness: 0.5 }),
  );
  m.visible = false;
  scene.add(m);
  grenadeMeshes.push(m);
}

function syncBotMeshes() {
  for (const b of world.bots) {
    const g = b.mesh.group;
    g.position.set(b.pos.x, b.pos.y, b.pos.z);
    g.visible = true;
    if (!b.alive) {
      g.rotation.order = 'YXZ';
      g.rotation.set(-Math.PI / 2, b.yaw, 0);
    } else {
      g.rotation.order = 'YXZ';
      g.rotation.set(0, 0, 0);
      poseHumanoid(b.mesh, b.yaw, b.moving, b.walkPhase, b.loadout.reloading);
    }
  }
}

// -- input routing ---------------------------------------------------------
input.onKey = (code) => {
  if (!world.started) return;
  if (hud.buyOpen) {
    if (code === 'KeyB' || code === 'Escape') {
      hud.toggleBuy(false);
      input.lock();
      return;
    }
    const buyKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
    const idx = buyKeys.indexOf(code);
    if (idx >= 0) {
      const ids = ['pistol', 'smg', 'rifle', 'sniper', 'grenade', 'armor'];
      world.buyItem(ids[idx]);
    }
    return;
  }
  switch (code) {
    case 'KeyB':
      if (round.phase === 'freeze') { hud.toggleBuy(true); input.unlock(); }
      break;
    case 'Digit1': player.switchWeapon('pistol'); break;
    case 'Digit2': player.switchWeapon('smg'); break;
    case 'Digit3': player.switchWeapon('rifle'); break;
    case 'Digit4': player.switchWeapon('sniper'); break;
    case 'KeyR':
      if (startReload(player.loadout, world.time)) sounds.reload();
      break;
    case 'KeyG': player.throwGrenade(world); break;
    case 'KeyM': sounds.toggleMute(); break;
    case 'KeyP':
      if (input.locked) input.unlock();
      else input.lock();
      break;
  }
};

input.onLockChange = (locked) => {
  if (world.started && round.phase !== 'menu' && round.phase !== 'matchEnd' && !locked && !hud.buyOpen) {
    world.paused = true;
    document.getElementById('overlay-pause').hidden = false;
  } else if (locked) {
    world.paused = false;
    document.getElementById('overlay-pause').hidden = true;
  }
};

document.getElementById('play').addEventListener('click', () => {
  sounds.ensure();
  document.getElementById('overlay-start').hidden = true;
  world.started = true;
  round.startMatch();
  hud.toggleBuy(true);
  input.unlock();
});

document.getElementById('resume').addEventListener('click', () => {
  input.lock();
});

document.getElementById('restart').addEventListener('click', () => {
  document.getElementById('overlay-end').hidden = true;
  round.startMatch();
  hud.toggleBuy(true);
  input.unlock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// -- fixed-step simulation ---------------------------------------------------
function step(dt) {
  world.time += dt;
  player.update(world, dt, world.time);
  for (const b of world.bots) b.update(world, dt, world.time);
  round.tick(dt, world.time);
}

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.1);
  // The buy menu only lives during the freeze; close it when the round starts.
  if (hud.buyOpen && round.phase !== 'freeze' && round.phase !== 'menu') {
    hud.toggleBuy(false);
  }
  if (world.started && !world.paused && round.phase !== 'menu' && round.phase !== 'matchEnd') {
    acc += dt;
    let steps = 0;
    while (acc >= TICK && steps < 5) {
      step(TICK);
      acc -= TICK;
      steps++;
    }
    if (steps === 5) acc = 0;
  }

  // -- visuals ---------------------------------------------------------------
  const eye = player.eyePos();
  const shake = fx.shake;
  const shX = shake ? (Math.random() - 0.5) * shake * 0.12 : 0;
  const shY = shake ? (Math.random() - 0.5) * shake * 0.12 : 0;
  camera.position.set(
    eye.x + shX,
    player.alive ? eye.y + shY : 0.6,
    eye.z,
  );
  camera.rotation.y = player.yaw + player.recoilYaw;
  camera.rotation.x = player.pitch + player.recoilPitch;
  if (!player.alive) camera.rotation.z = 0.35;
  else camera.rotation.z = 0;

  // Viewmodel: walk bob, recoil kick, reload dip.
  if (player.loadout.id !== viewmodelWeapon) {
    viewmodelWeapon = player.loadout.id;
    viewmodel.children.forEach((m) => {
      if (m.material && m.material.color && m.geometry.type === 'BoxGeometry' && m.position.y > 0.05) {
        m.material.color.setHex(WEAPONS[viewmodelWeapon].tracer);
      }
    });
  }
  const bob = player.moving ? Math.sin(player.walkPhase * 2) * 0.012 : 0;
  viewmodel.position.y = -0.26 + bob - (player.loadout.reloading ? 0.08 : 0);
  viewmodel.position.z = -0.5 + player.recoilPitch * 1.2;
  viewmodel.rotation.x = player.loadout.reloading ? 0.5 : player.recoilPitch * 0.8;

  syncBotMeshes();

  // Spike mesh.
  const b = round.bomb;
  if (b.planted || b.dropped) {
    bombMesh.visible = true;
    bombMesh.position.set(b.x, 0, b.z);
    const mat = bombLight.material;
    mat.emissiveIntensity = b.planted ? (Math.sin(world.time * 7) > 0 ? 2.5 : 0.3) : 1.2;
  } else {
    bombMesh.visible = false;
  }
  // Grenade meshes.
  for (let i = 0; i < grenadeMeshes.length; i++) {
    const g = round.grenades[i];
    if (g) {
      grenadeMeshes[i].visible = true;
      grenadeMeshes[i].position.set(g.pos.x, g.pos.y, g.pos.z);
    } else {
      grenadeMeshes[i].visible = false;
    }
  }

  fx.update(dt);
  hud.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// -- debug hook for the headless play-test (drives real game states) ---------
window.__SABLE__ = {
  world, round, player, renderer,
  bots: world.bots,
  state() {
    return {
      phase: round.phase, round: round.round,
      wins: { ...round.wins }, timer: round.timer,
      bomb: { planted: round.bomb.planted, dropped: round.bomb.dropped, site: round.bomb.site, fuse: round.bomb.fuse },
      player: {
        alive: player.alive, hp: player.hp, money: player.money,
        pos: [player.pos.x, player.pos.z], yaw: player.yaw,
        weapon: player.loadout.id, mag: player.loadout.mag, kills: player.kills,
        carrier: player.isCarrier,
      },
      bots: world.bots.map((bot) => ({
        team: bot.team, alive: bot.alive, hp: bot.hp,
        pos: [bot.pos.x, bot.pos.z], state: bot.state,
      })),
      grenades: round.grenades.length,
    };
  },
  start() {
    if (world.started) return 'already started';
    document.getElementById('overlay-start').hidden = true;
    world.started = true;
    round.startMatch();
    hud.toggleBuy(false);
    return 'started';
  },
  skipFreeze() {
    if (round.phase === 'freeze') { round.timer = 0.01; return 'skipped'; }
    return `phase is ${round.phase}`;
  },
  teleport(x, z, yaw = 0) {
    player.pos.x = x; player.pos.z = z; player.yaw = yaw; player.pitch = 0;
    return 'teleported';
  },
  lookAt(x, z) {
    player.yaw = Math.atan2(-(x - player.pos.x), -(z - player.pos.z));
    return 'aimed';
  },
  plantNow(site) {
    const s = site || 'A';
    round.bomb.planted = true;
    round.bomb.site = s;
    round.bomb.fuse = 30;
    round.bomb.x = s === 'A' ? -24 : 24;
    round.bomb.z = -8;
    player.isCarrier = false;
    return 'planted';
  },
  endMatchNow(winner) {
    round.wins.sable = winner === 'sable' ? 5 : 3;
    round.wins.vulture = winner === 'vulture' ? 5 : 3;
    round.endMatch(winner);
    return 'ended';
  },
  giveMoney(n) { player.money += n; return player.money; },
  hurtBot(team, index, hp) {
    const bot = world.bots.find((bt) => bt.team === team && bt.index === index);
    if (!bot) return 'no bot';
    bot.hp = hp;
    return 'hurt';
  },
};
