// SABLE YARD — the match: rounds, the spike, the economy and the buy menu.
// One Round object owns the phase machine (freeze -> live -> roundEnd ->
// matchEnd), the bomb state, the grenade list and the kill/economy bookkeeping.
// The sim in main.js calls tick() once per fixed step; the HUD reads the
// public fields.
import { MATCH, ECONOMY, WEAPONS, GRENADE } from './config.js';
import { COLLIDERS, SITES, losBlocked } from './map.js';
import { applyDamage } from './weapons.js';

export class Round {
  constructor(world) {
    this.world = world;
    this.phase = 'menu';
    this.round = 0;
    this.wins = { sable: 0, vulture: 0 };
    this.timer = 0;
    this.lossStreak = 0;
    this.banner = '';
    this.bannerUntil = 0;
    this.bomb = {
      planted: false, dropped: false, site: null,
      x: 0, y: 0, z: 0, fuse: 0,
      plantProgress: 0, defuseProgress: 0,
      plantingActor: null, defusingActor: null,
    };
    this.grenades = [];
    this.noises = [];
  }

  startMatch() {
    this.round = 0;
    this.wins = { sable: 0, vulture: 0 };
    this.lossStreak = 0;
    const p = this.world.player;
    p.money = ECONOMY.startMoney;
    p.owned = new Set(['pistol']);
    p.kills = 0; p.deaths = 0;
    this.startRound();
  }

  startRound() {
    const world = this.world;
    this.round++;
    this.phase = 'freeze';
    this.timer = MATCH.freezeSeconds;
    this.bomb.planted = false;
    this.bomb.dropped = false;
    this.bomb.site = null;
    this.bomb.fuse = 0;
    this.bomb.plantProgress = 0;
    this.bomb.defuseProgress = 0;
    this.bomb.plantingActor = null;
    this.bomb.defusingActor = null;
    this.grenades.length = 0;
    this.noises.length = 0;
    const p = world.player;
    // Death costs the bought guns: a dead player restarts on the pistol.
    if (!p.alive || this.round === 1) p.owned = new Set(['pistol']);
    p.grenades = 0;
    p.reset(world.spawns.sable[0], p.money);
    p.isCarrier = true;
    world.bots.forEach((b, i) => {
      const spawn = world.spawns[b.team][i % world.spawns[b.team].length];
      b.reset(this.round, spawn);
    });
    world.syncBots();
    world.hudMessage(`ROUND ${this.round} — BUY PHASE`);
  }

  // -- bomb ---------------------------------------------------------------
  bombPlantTick(actor, dt, siteName) {
    const b = this.bomb;
    if (b.planted || b.dropped) return;
    if (!actor.alive || !actor.isCarrier) return;
    b.plantingActor = actor;
    b.site = siteName ?? actor.site ?? null;
    b.plantProgress += dt;
    if (b.plantProgress >= MATCH.plantSeconds) {
      b.planted = true;
      b.dropped = false;
      const s = SITES[b.site];
      b.x = s.cx; b.y = 0; b.z = s.cz;
      b.fuse = MATCH.bombSeconds;
      b.plantProgress = 0;
      actor.isCarrier = false;
      if (actor.isPlayer) {
        actor.money += ECONOMY.plantReward;
        this.world.hudMessage('SPIKE PLANTED — HOLD THE SITE');
      } else {
        this.world.hudMessage(`SPIKE PLANTED AT ${b.site}`);
      }
      this.world.sounds.plantTick();
    }
  }

  bombDefuseTick(actor, dt) {
    const b = this.bomb;
    if (!b.planted) return;
    if (!actor.alive) return;
    b.defusingActor = actor;
    b.defuseProgress += dt;
    if (b.defuseProgress >= MATCH.defuseSeconds) {
      b.defuseProgress = 0;
      if (actor.isPlayer) actor.money += ECONOMY.defuseReward;
      this.endRound('vulture', 'SPIKE DEFUSED');
    }
  }

  // -- grenades -----------------------------------------------------------
  spawnGrenade(pos, vel, owner) {
    this.grenades.push({
      pos: { ...pos }, vel: { ...vel }, fuse: GRENADE.fuseSeconds, owner,
    });
  }

  updateGrenades(dt) {
    const world = this.world;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.vel.y -= GRENADE.gravity * dt;
      const nx = g.pos.x + g.vel.x * dt;
      const ny = g.pos.y + g.vel.y * dt;
      const nz = g.pos.z + g.vel.z * dt;
      // Ground bounce.
      if (ny < 0.08) {
        g.pos.y = 0.08;
        g.vel.y = Math.abs(g.vel.y) * 0.4;
        g.vel.x *= 0.7; g.vel.z *= 0.7;
      } else {
        g.pos.x = nx; g.pos.y = ny; g.pos.z = nz;
      }
      // Wall bounce: if the new point is inside a collider, step back and
      // reflect the dominant axis.
      for (const c of COLLIDERS) {
        if (g.pos.x > c.min.x && g.pos.x < c.max.x &&
            g.pos.y > c.min.y && g.pos.y < c.max.y &&
            g.pos.z > c.min.z && g.pos.z < c.max.z) {
          const dxl = g.pos.x - c.min.x;
          const dxr = c.max.x - g.pos.x;
          const dzl = g.pos.z - c.min.z;
          const dzr = c.max.z - g.pos.z;
          const m = Math.min(dxl, dxr, dzl, dzr);
          if (m === dxl || m === dxr) g.vel.x *= -0.4;
          else g.vel.z *= -0.4;
          g.pos.x = nx - g.vel.x * dt;
          g.pos.z = nz - g.vel.z * dt;
          break;
        }
      }
      if (g.fuse <= 0) {
        this.grenades.splice(i, 1);
        this.explodeGrenade(g);
      }
    }
  }

  explodeGrenade(g) {
    const world = this.world;
    const p = g.pos;
    world.fx.explosion(p);
    world.sounds.explosion();
    const actors = [world.player, ...world.bots];
    for (const a of actors) {
      if (!a.alive) continue;
      const dx = a.pos.x - p.x;
      const dy = (a.pos.y + 1.1) - p.y;
      const dz = a.pos.z - p.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > GRENADE.radius) continue;
      // Cover blocks the blast.
      if (losBlocked(p.x, p.y + 0.2, p.z, a.pos.x, a.pos.y + 1.1, a.pos.z)) continue;
      const t = dist / GRENADE.radius;
      const raw = GRENADE.damageMax - (GRENADE.damageMax - GRENADE.damageMin) * t;
      const dealt = applyDamage(a, raw);
      world.onDamage(g.owner, a, dealt, false);
    }
  }

  // -- damage / kills -------------------------------------------------------
  onDamage(attacker, victim, dealt, isHead) {
    const world = this.world;
    if (victim.isPlayer) {
      world.sounds.hurt();
      world.hudDamageFlash();
      world.fx.addShake(0.06);
    } else if (attacker && attacker.isPlayer) {
      world.hudHitmarker(isHead);
    }
    if (!victim.alive) this.onKill(attacker, victim, isHead);
  }

  onKill(killer, victim, isHead) {
    const world = this.world;
    victim.deaths = (victim.deaths ?? 0) + 1;
    if (killer && killer !== victim) {
      killer.kills = (killer.kills ?? 0) + 1;
      if (killer.isPlayer) killer.money += ECONOMY.killReward;
    }
    world.hudKillfeed(killer, victim, isHead);
    // The spike drops where its carrier fell.
    if (victim.isCarrier) {
      victim.isCarrier = false;
      this.bomb.dropped = true;
      this.bomb.x = victim.pos.x;
      this.bomb.z = victim.pos.z;
      this.bomb.plantProgress = 0;
      world.hudMessage('SPIKE DROPPED');
    }
    if (victim.isPlayer) world.onPlayerDeath();
  }

  // -- economy / buy -------------------------------------------------------
  buyWeapon(id) {
    const p = this.world.player;
    const w = WEAPONS[id];
    if (!w || this.phase !== 'freeze' || !p.alive) return false;
    if (p.owned.has(id) || p.money < w.price) return false;
    p.money -= w.price;
    p.owned.add(id);
    p.switchWeapon(id);
    this.world.sounds.buy();
    return true;
  }

  buyGrenade() {
    const p = this.world.player;
    if (this.phase !== 'freeze' || !p.alive) return false;
    if (p.grenades >= GRENADE.maxCarry || p.money < GRENADE.price) return false;
    p.money -= GRENADE.price;
    p.grenades++;
    this.world.sounds.buy();
    return true;
  }

  buyArmor() {
    const p = this.world.player;
    if (this.phase !== 'freeze' || !p.alive) return false;
    if (p.armor >= 50 || p.money < 650) return false;
    p.money -= 650;
    p.armor = 50;
    this.world.sounds.buy();
    return true;
  }

  // -- round flow ---------------------------------------------------------
  endRound(winner, reason) {
    if (this.phase !== 'live') return;
    this.phase = 'roundEnd';
    this.timer = MATCH.roundEndSeconds;
    this.wins[winner]++;
    const p = this.world.player;
    if (winner === 'sable') {
      p.money += ECONOMY.winReward;
      this.lossStreak = 0;
      this.world.sounds.roundWin();
    } else {
      this.lossStreak++;
      const bonus = ECONOMY.lossReward + ECONOMY.lossStreakBonus * (this.lossStreak - 1);
      p.money += Math.min(bonus, ECONOMY.lossRewardCap);
      this.world.sounds.roundLose();
    }
    this.banner = reason;
    this.bannerUntil = this.world.time + MATCH.roundEndSeconds;
    this.world.hudBanner(`${winner === 'sable' ? 'SABLE' : 'VULTURE'} WINS — ${reason}`);
  }

  endMatch(winner) {
    this.phase = 'matchEnd';
    this.banner = winner === 'sable' ? 'VICTORY' : 'DEFEAT';
    this.world.hudMatchEnd(winner);
    if (winner === 'sable') this.world.sounds.roundWin();
    else this.world.sounds.roundLose();
  }

  aliveCount(team) {
    const world = this.world;
    let n = 0;
    if (team === 'sable' && world.player.alive) n++;
    for (const b of world.bots) if (b.team === team && b.alive) n++;
    return n;
  }

  tick(dt, now) {
    const world = this.world;
    // Plant progress decays when nobody worked on the spike this tick; the
    // actor planting sets plantingActor during its own update.
    if (this.phase === 'live') {
      if (!this.bomb.plantingActor && !this.bomb.planted) {
        this.bomb.plantProgress = Math.max(0, this.bomb.plantProgress - dt * 2);
      }
      // Clear it here for the next tick.
      this.bomb.plantingActor = null;
      this.bomb.defusingActor = null;
    }
    this.updateGrenades(dt);
    // Prune old noises.
    this.noises = this.noises.filter((n) => now - n.t < 4);

    if (this.phase === 'freeze') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'live';
        this.timer = MATCH.roundSeconds;
        world.hudMessage('GO GO GO');
      }
      return;
    }
    if (this.phase === 'roundEnd') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.wins.sable >= MATCH.winsNeeded || this.wins.vulture >= MATCH.winsNeeded ||
            this.round >= MATCH.maxRounds) {
          this.endMatch(this.wins.sable > this.wins.vulture ? 'sable' : 'vulture');
        } else {
          this.startRound();
        }
      }
      return;
    }
    if (this.phase !== 'live') return;

    // Bomb fuse counts down after the plant.
    if (this.bomb.planted) {
      this.bomb.fuse -= dt;
      if (this.bomb.fuse <= 0) {
        const p = this.bomb;
        this.world.fx.explosion({ x: p.x, y: 0.5, z: p.z });
        this.world.sounds.explosion();
        this.bomb.planted = false;
        this.endRound('sable', 'SPIKE DETONATED');
        return;
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.endRound('vulture', 'TIME EXPIRED');
        return;
      }
    }

    // Elimination wins (after a plant, only the bomb decides the round).
    if (!this.bomb.planted) {
      if (this.aliveCount('vulture') === 0) {
        this.endRound('sable', 'ENEMY TEAM ELIMINATED');
        return;
      }
      if (this.aliveCount('sable') === 0) {
        this.endRound('vulture', 'TEAM ELIMINATED');
        return;
      }
    } else if (this.aliveCount('vulture') === 0 && this.aliveCount('sable') === 0) {
      // Everyone died after the plant: the spike still goes off.
      return;
    }
  }
}
