// SABLE YARD — the player. Movement with acceleration and crouch, recoil
// and bloom that punish firing on the move, reloads, the frag grenade, and
// planting the spike. The camera reads yaw/pitch/recoil from here; the HUD
// reads health, ammo and money.
import { WEAPONS, GRENADE, PLAYER } from './config.js';
import { clamp } from './math.js';
import { moveAndCollide, SITES } from './map.js';
import {
  makeLoadout, resolveShot, spreadDir, applyDamage, damageAtRange,
  startReload, tickReload, decayBloom, currentSpread,
} from './weapons.js';

export class Player {
  constructor() {
    this.isPlayer = true;
    this.team = 'sable';
    this.radius = PLAYER.radius;
    this.height = PLAYER.height;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.yaw = 0; // yaw 0 faces north (-z), toward the defenders
    this.pitch = 0;
    this.hp = 100;
    this.armor = 0;
    this.money = 800;
    this.alive = true;
    this.crouched = false;
    this.eyeHeight = PLAYER.eyeHeight;
    this.owned = new Set(['pistol']);
    this.loadout = makeLoadout('pistol');
    this.grenades = 0;
    this.kills = 0;
    this.deaths = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.grenadeCooldown = 0;
    this.isCarrier = false;
    this.moving = false;
    this.walkPhase = 0;
  }

  reset(spawn, money) {
    this.pos.x = spawn[0]; this.pos.z = spawn[1]; this.pos.y = 0;
    this.vel.x = 0; this.vel.z = 0;
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.armor = 0;
    this.alive = true;
    this.money = money;
    this.recoilPitch = 0; this.recoilYaw = 0;
    this.grenades = 0;
    this.isCarrier = false;
    this.loadout = makeLoadout(this.owned.has('rifle') ? 'rifle' : 'pistol');
    if (!this.owned.has(this.loadout.id)) this.owned.add('pistol');
  }

  eyePos() {
    return { x: this.pos.x, y: this.pos.y + this.eyeHeight, z: this.pos.z };
  }

  forwardDir() {
    const cp = Math.cos(this.pitch + this.recoilPitch);
    return {
      x: -Math.sin(this.yaw + this.recoilYaw) * cp,
      y: Math.sin(this.pitch + this.recoilPitch),
      z: -Math.cos(this.yaw + this.recoilYaw) * cp,
    };
  }

  insideSite() {
    for (const [name, s] of Object.entries(SITES)) {
      if (Math.abs(this.pos.x - s.cx) <= s.half && Math.abs(this.pos.z - s.cz) <= s.half) return name;
    }
    return null;
  }

  switchWeapon(id) {
    if (!this.owned.has(id) || this.loadout.id === id) return false;
    if (this.loadout.reloading) return false;
    this.loadout = makeLoadout(id);
    return true;
  }

  update(world, dt, now) {
    if (!this.alive) return;
    const input = world.input;

    // Look.
    const { dx, dy } = input.consumeMouse();
    this.yaw -= dx * 0.0022;
    this.pitch = clamp(this.pitch - dy * 0.0022, -1.5, 1.5);
    // Recoil recovers back toward zero.
    this.recoilPitch = Math.max(0, this.recoilPitch - dt * 0.22);
    this.recoilYaw *= Math.max(0, 1 - dt * 8);

    // Crouch (hold Ctrl or C).
    this.crouched = input.down('ControlLeft') || input.down('ControlRight') || input.down('KeyC');
    const targetEye = this.crouched ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12);
    const height = this.crouched ? PLAYER.crouchHeight : PLAYER.height;
    this.height = height;

    // Move: accelerate toward the wish direction, friction when idle.
    const { f, s } = input.moveAxes();
    const w = WEAPONS[this.loadout.id];
    const speed = (this.crouched ? PLAYER.crouchSpeed : w.speed);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wishX = (-sin * f + cos * s);
    const wishZ = (-cos * f - sin * s);
    const wl = Math.hypot(wishX, wishZ) || 1;
    const tx = (wishX / wl) * speed * (f || s ? 1 : 0);
    const tz = (wishZ / wl) * speed * (f || s ? 1 : 0);
    const k = 1 - Math.exp(-PLAYER.accel * dt * 0.14);
    this.vel.x += (tx - this.vel.x) * Math.min(1, k * 3);
    this.vel.z += (tz - this.vel.z) * Math.min(1, k * 3);
    if (!f && !s) {
      const fr = Math.exp(-PLAYER.friction * dt);
      this.vel.x *= fr; this.vel.z *= fr;
    }
    this.moving = Math.hypot(this.vel.x, this.vel.z) > 0.8;
    if (this.moving) this.walkPhase += dt * Math.hypot(this.vel.x, this.vel.z) * 0.6;
    moveAndCollide(this.pos, this.radius, height, this.vel.x, this.vel.z, dt);

    // Reload + bloom.
    if (tickReload(this.loadout, now)) world.sounds.reload();
    decayBloom(this.loadout, dt);
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);

    // Fire.
    const clicked = input.consumeClick();
    const held = input.mouseDown;
    const wantFire = w.auto ? held : clicked;
    if (wantFire && !this.loadout.reloading && now >= this.loadout.nextShot) {
      this.fire(world, now);
    }

    // Pick up a dropped spike by walking over it.
    const bomb = world.bomb;
    if (bomb.dropped && !bomb.planted) {
      const d = Math.hypot(bomb.x - this.pos.x, bomb.z - this.pos.z);
      if (d < 1.4) {
        bomb.dropped = false;
        this.isCarrier = true;
        world.hudMessage('SPIKE PICKED UP');
      }
    }

    // Plant: hold E inside a site while carrying the spike.
    if (this.isCarrier && !bomb.planted && input.down('KeyE')) {
      const site = this.insideSite();
      if (site) world.bombPlantTick(this, dt, site);
    }
  }

  fire(world, now) {
    const w = WEAPONS[this.loadout.id];
    if (this.loadout.mag <= 0) {
      world.sounds.dryClick();
      startReload(this.loadout, now);
      this.loadout.nextShot = now + 0.3;
      return;
    }
    this.loadout.nextShot = now + 60 / w.rpm;
    this.loadout.mag--;
    const eye = this.eyePos();
    const base = this.forwardDir();
    const spread = currentSpread(w, this.loadout, this.moving, this.crouched);
    const dir = spreadDir(base, spread);
    const muzzle = {
      x: eye.x + base.x * 0.6 + Math.cos(this.yaw) * 0.18,
      y: eye.y - 0.12,
      z: eye.z + base.z * 0.6 - Math.sin(this.yaw) * 0.18,
    };
    const enemies = world.enemiesOf(this.team);
    const hit = resolveShot(muzzle, dir, 120, enemies, this);
    world.fx.tracer(muzzle, hit.point, w.tracer);
    world.fx.muzzleFlash(muzzle);
    world.sounds.shot(w.id, 0);
    world.noise(this.pos.x, this.pos.z, this.team);
    if (hit.actor) {
      const raw = damageAtRange(w, hit.dist) * (hit.part === 'head' ? w.headMult : 1);
      const dealt = applyDamage(hit.actor, raw);
      world.fx.impact(hit.point, null);
      world.sounds.hit(hit.part === 'head');
      world.onDamage(this, hit.actor, dealt, hit.part === 'head');
    } else if (hit.dist < 120) {
      world.fx.impact(hit.point, null);
    }
    // Recoil kicks the view up and a touch sideways; bloom grows the cone.
    this.recoilPitch = Math.min(0.12, this.recoilPitch + w.recoil);
    this.recoilYaw += (Math.random() - 0.5) * w.recoil * 0.5;
    this.loadout.bloom = Math.min(w.bloomMax, this.loadout.bloom + w.spreadBloom);
    world.fx.addShake(0.02);
  }

  throwGrenade(world) {
    if (this.grenades <= 0 || this.grenadeCooldown > 0 || !this.alive) return false;
    this.grenades--;
    this.grenadeCooldown = 0.8;
    const eye = this.eyePos();
    const dir = this.forwardDir();
    world.spawnGrenade(
      { x: eye.x + dir.x * 0.5, y: eye.y - 0.1, z: eye.z + dir.z * 0.5 },
      {
        x: dir.x * GRENADE.throwSpeed + this.vel.x * 0.4,
        y: dir.y * GRENADE.throwSpeed + 3.2,
        z: dir.z * GRENADE.throwSpeed + this.vel.z * 0.4,
      },
      this,
    );
    world.sounds.grenadePin();
    return true;
  }
}
