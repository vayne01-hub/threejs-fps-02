// SABLE YARD — the bots. One class, one job: decide what to do, walk there,
// and shoot back. Attackers push a site and plant the spike; defenders hold
// their sites and rotate to the plant. Perception is a scan every 0.15 s:
// line of sight + field of view for seeing, gunshot noise for hearing.
// Shooting reuses the same hitscan resolver as the player, with an aim
// error that grows with distance and target movement.
import { BOT, WEAPONS } from './config.js';
import { rand } from './math.js';
import {
  WAYPOINTS, SITES, SPAWNS, DEFEND_HOLDS, nearestNode, findPath,
  moveAndCollide, losBlocked,
} from './map.js';
import {
  makeLoadout, resolveShot, spreadDir, applyDamage, damageAtRange,
  startReload, tickReload, decayBloom,
} from './weapons.js';

let nextId = 1;

export class Bot {
  constructor(team, index, mesh) {
    this.id = nextId++;
    this.team = team;
    this.index = index;
    this.mesh = mesh;
    this.radius = 0.36;
    this.height = 1.78;
    this.pos = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.hp = 100;
    this.armor = 0;
    this.alive = true;
    this.loadout = makeLoadout('pistol');
    this.state = 'path';
    this.path = [];
    this.pathIdx = 0;
    this.holdNode = 0;
    this.site = 'A';
    this.target = null;
    this.lastSeen = null;
    this.reactionAt = 0;
    this.burstLeft = 0;
    this.burstUntil = 0;
    this.nextThink = 0;
    this.strafeDir = 1;
    this.strafeUntil = 0;
    this.walkPhase = 0;
    this.moving = false;
    this.noiseNode = -1;
    this.isCarrier = false;
    this.aimPoint = { x: 0, y: 0, z: 0 };
  }

  get eye() {
    return { x: this.pos.x, y: this.pos.y + 1.55, z: this.pos.z };
  }

  forward() {
    return { x: -Math.sin(this.yaw), y: 0, z: -Math.cos(this.yaw) };
  }

  reset(round, spawn) {
    this.pos.x = spawn[0]; this.pos.z = spawn[1]; this.pos.y = 0;
    this.hp = 100; this.armor = 0; this.alive = true;
    this.target = null; this.lastSeen = null; this.state = 'path';
    this.path = []; this.pathIdx = 0; this.noiseNode = -1;
    this.isCarrier = false;
    // Bot loadout policy: pistols on the pistol round, rifles after that;
    // one defender per round from round 2 carries the sniper.
    let w = 'pistol';
    if (round >= 2) w = 'rifle';
    if (this.team === 'vulture' && round >= 2 && this.index === 0) w = 'sniper';
    this.loadout = makeLoadout(w);
    // Attackers split across the sites; defenders take their holds.
    if (this.team === 'sable') {
      this.site = this.index % 2 === 0 ? 'A' : 'B';
      this.holdNode = SITES[this.site].node;
    } else {
      const holds = this.index < 2 ? DEFEND_HOLDS.A : DEFEND_HOLDS.B;
      this.holdNode = nearestNode(holds[this.index % 2][0], holds[this.index % 2][1]);
      this.site = this.index < 2 ? 'A' : 'B';
      // Defenders walk to their hold first, then stay and scan.
      this.setPathTo(this.holdNode);
    }
    this.yaw = this.team === 'sable' ? 0 : Math.PI;
  }

  setPathTo(node) {
    const from = nearestNode(this.pos.x, this.pos.z);
    this.path = findPath(from, node);
    this.pathIdx = 0;
    this.state = 'path';
  }

  // -- perception --------------------------------------------------------
  canSee(enemy, world) {
    const dx = enemy.pos.x - this.pos.x;
    const dz = enemy.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > BOT.sightRange) return false;
    const f = this.forward();
    const dot = (dx * f.x + dz * f.z) / (dist || 1);
    if (dot < BOT.fovCos) return false;
    const eye = this.eye;
    const ey = enemy.pos.y + (enemy.isPlayer ? 1.5 : 1.3);
    return !losBlocked(eye.x, eye.y, eye.z, enemy.pos.x, ey, enemy.pos.z);
  }

  think(world, now) {
    if (!this.alive) return;
    // 1. See: nearest visible enemy becomes the target.
    let best = null;
    let bestD = Infinity;
    for (const e of world.enemiesOf(this.team)) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < bestD && this.canSee(e, world)) { best = e; bestD = d; }
    }
    if (best && best !== this.target) {
      this.target = best;
      this.reactionAt = now + rand(BOT.reactionMin, BOT.reactionMax);
      this.lastSeen = { x: best.pos.x, y: best.pos.y, z: best.pos.z, t: now };
      this.burstLeft = 0;
    } else if (!best) {
      this.target = null;
    }
    if (this.target && this.target.alive) {
      this.lastSeen = { x: this.target.pos.x, y: this.target.pos.y, z: this.target.pos.z, t: now };
    }

    // 2. Hear: an enemy gunshot nearby is a node to investigate.
    if (world.noises.length) {
      for (const n of world.noises) {
        if (n.team === this.team || now - n.t > 3) continue;
        const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
        if (d < BOT.hearRange) this.noiseNode = nearestNode(n.x, n.z);
      }
    }

    // 3. Decide the objective state (fight overrides movement, not the plan).
    if (this.target) { this.state = 'fight'; return; }
    const bomb = world.bomb;
    if (this.team === 'sable') {
      if (bomb.planted) { this.goHoldNear(bomb.site, world); return; }
      if (bomb.dropped) {
        const carrier = world.nearestAttackerTo(bomb.x, bomb.z);
        if (carrier === this) { this.state = 'fetch'; return; }
      }
      if (this.isCarrier && this.insideSite(this.site)) { this.state = 'plant'; return; }
      if (this.state === 'hold') return; // arrived at the site: hold it
      if (this.state !== 'path' || this.pathIdx >= this.path.length) {
        this.setPathTo(SITES[this.site].node);
      }
    } else {
      if (bomb.planted) {
        const d = Math.hypot(bomb.x - this.pos.x, bomb.z - this.pos.z);
        if (d < 1.6) { this.state = 'defuse'; return; }
        if (this.state !== 'path' || this.pathIdx >= this.path.length) {
          this.setPathTo(SITES[bomb.site].node);
        }
        return;
      }
      if (this.noiseNode >= 0 && this.state === 'hold') {
        this.setPathTo(this.noiseNode);
        this.noiseNode = -1;
        return;
      }
      if (this.state === 'path' && this.pathIdx >= this.path.length) {
        this.state = 'hold';
        this.yaw = this.faceSiteYaw();
      }
    }
  }

  insideSite(siteName) {
    const s = SITES[siteName];
    return Math.abs(this.pos.x - s.cx) <= s.half && Math.abs(this.pos.z - s.cz) <= s.half;
  }

  faceSiteYaw() {
    const s = SITES[this.site];
    const dx = s.cx - this.pos.x;
    const dz = s.cz - this.pos.z;
    return Math.atan2(-dx, -dz);
  }

  goHoldNear(siteName, world) {
    if (this.state === 'hold') return;
    const s = SITES[siteName];
    const node = nearestNode(s.cx + rand(-3, 3), s.cz + rand(-3, 3));
    if (this.state !== 'path') this.setPathTo(node);
  }

  // -- movement ----------------------------------------------------------
  stepMove(dt, now) {
    this.moving = false;
    if (this.state === 'path' || this.state === 'fetch') {
      let tx;
      let tz;
      if (this.state === 'fetch') {
        tx = this.worldRef.bomb.x;
        tz = this.worldRef.bomb.z;
        if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 1.2) return;
      } else {
        if (this.pathIdx >= this.path.length) {
          this.state = 'hold';
          return;
        }
        const node = WAYPOINTS[this.path[this.pathIdx]];
        tx = node[0]; tz = node[1];
        if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 0.7) {
          this.pathIdx++;
          return;
        }
      }
      const dx = tx - this.pos.x;
      const dz = tz - this.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const vx = (dx / len) * BOT.speed;
      const vz = (dz / len) * BOT.speed;
      this.yaw = Math.atan2(-dx, -dz);
      moveAndCollide(this.pos, this.radius, this.height, vx, vz, dt);
      this.moving = true;
      this.walkPhase += dt;
    } else if (this.state === 'fight' && this.target) {
      // Strafe sideways while fighting; change direction now and then.
      if (now > this.strafeUntil) {
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        this.strafeUntil = now + rand(0.7, 1.4);
      }
      const f = this.forward();
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      const vx = rx * this.strafeDir * BOT.speed * 0.55;
      const vz = rz * this.strafeDir * BOT.speed * 0.55;
      moveAndCollide(this.pos, this.radius, this.height, vx, vz, dt);
      this.moving = true;
      this.walkPhase += dt;
      // Face the target.
      const dx = this.target.pos.x - this.pos.x;
      const dz = this.target.pos.z - this.pos.z;
      this.yaw = Math.atan2(-dx, -dz);
    }
  }

  // -- shooting ----------------------------------------------------------
  stepFight(world, dt, now) {
    const w = WEAPONS[this.loadout.id];
    tickReload(this.loadout, now);
    decayBloom(this.loadout, dt);
    if (!this.target || !this.target.alive || now < this.reactionAt) return;
    // Re-check line of sight to the target before firing.
    if (!this.canSee(this.target, world)) { this.target = null; return; }
    if (this.loadout.reloading) return;
    if (this.burstLeft <= 0) {
      if (now < this.burstUntil) return;
      this.burstLeft = (BOT.burstMin + Math.random() * (BOT.burstMax - BOT.burstMin)) | 0;
      this.burstUntil = now + rand(BOT.burstPauseMin, BOT.burstPauseMax);
    }
    if (now < this.loadout.nextShot) return;
    this.loadout.nextShot = now + 60 / w.rpm;
    this.burstLeft--;
    this.fireOnce(world, now);
  }

  fireOnce(world, now) {
    const w = WEAPONS[this.loadout.id];
    if (this.loadout.mag <= 0) {
      if (startReload(this.loadout, now)) return;
      return;
    }
    this.loadout.mag--;
    // Aim at the chest, sometimes the head, with error by distance/motion.
    const t = this.target;
    const dist = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    const aimHead = Math.random() < 0.22;
    const ay = t.pos.y + (aimHead ? t.height - 0.12 : 1.1);
    const eye = this.eye;
    const dx = t.pos.x - eye.x;
    const dy = ay - eye.y;
    const dz = t.pos.z - eye.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const base = { x: dx / len, y: dy / len, z: dz / len };
    const movingTarget = t.vel ? Math.hypot(t.vel.x, t.vel.z) > 1 : this.moving;
    const err = BOT.aimErrorBase + BOT.aimErrorMove * (movingTarget ? 1 : 0) + dist * 0.0009;
    const dir = spreadDir(base, err);
    const muzzle = { x: eye.x + base.x * 0.5, y: eye.y - 0.05, z: eye.z + base.z * 0.5 };
    const enemies = world.enemiesOf(this.team);
    const hit = resolveShot(muzzle, dir, 120, enemies, this);
    world.fx.tracer(muzzle, hit.point, w.tracer);
    world.fx.muzzleFlash(muzzle);
    const d = Math.hypot(this.pos.x - (world.player?.pos.x ?? 0), this.pos.z - (world.player?.pos.z ?? 0));
    world.sounds.shot(w.id, d);
    world.noise(this.pos.x, this.pos.z, this.team);
    if (hit.actor) {
      const raw = damageAtRange(w, hit.dist) * (hit.part === 'head' ? w.headMult : 1);
      const dealt = applyDamage(hit.actor, raw);
      world.fx.impact(hit.point, null);
      world.onDamage(this, hit.actor, dealt, hit.part === 'head');
    } else if (hit.dist < 120) {
      world.fx.impact(hit.point, null);
    }
    this.loadout.bloom = Math.min(w.bloomMax, this.loadout.bloom + w.spreadBloom);
  }

  // -- per-tick update ---------------------------------------------------
  update(world, dt, now) {
    this.worldRef = world;
    if (!this.alive) return;
    if (now >= this.nextThink) {
      this.nextThink = now + BOT.thinkEvery;
      this.think(world, now);
    }
    if (this.state === 'plant') {
      world.bombPlantTick(this, dt);
      return;
    }
    if (this.state === 'defuse') {
      world.bombDefuseTick(this, dt);
      return;
    }
    this.stepMove(dt, now);
    this.stepFight(world, dt, now);
  }
}
