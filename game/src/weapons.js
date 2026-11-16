// SABLE YARD — weapons: the shared fire logic for the player and the bots.
// One shot is a hitscan ray with spread: it checks the map colliders and
// every living actor's body/head boxes, takes the nearest hit, and applies
// damage with falloff and the headshot multiplier. Armor absorbs half of a
// hit while it lasts.
import { WEAPONS } from './config.js';
import { rayBox, clamp } from './math.js';
import { COLLIDERS } from './map.js';

export function makeLoadout(weaponId) {
  const w = WEAPONS[weaponId];
  return {
    id: weaponId, mag: w.mag, reserve: w.reserve,
    reloading: false, reloadEnd: 0, nextShot: 0, bloom: 0,
  };
}

// Damage at range: full inside rangeNear, linearly down to `falloff` at rangeFar.
export function damageAtRange(weapon, dist) {
  if (dist <= weapon.rangeNear) return weapon.damage;
  if (dist >= weapon.rangeFar) return weapon.damage * weapon.falloff;
  const t = (dist - weapon.rangeNear) / (weapon.rangeFar - weapon.rangeNear);
  return weapon.damage * (1 - (1 - weapon.falloff) * t);
}

// A body's hit boxes: head is the top 0.34 m, body is the rest.
export function bodyBoxes(actor) {
  const r = actor.radius;
  const h = actor.height;
  const y = actor.pos.y;
  return {
    head: {
      min: { x: actor.pos.x - r * 0.8, y: y + h - 0.34, z: actor.pos.z - r * 0.8 },
      max: { x: actor.pos.x + r * 0.8, y: y + h, z: actor.pos.z + r * 0.8 },
    },
    body: {
      min: { x: actor.pos.x - r, y, z: actor.pos.z - r },
      max: { x: actor.pos.x + r, y: y + h - 0.34, z: actor.pos.z + r },
    },
  };
}

// Resolve one hitscan ray. `actors` are the living bodies to test; `exclude`
// is the shooter. Returns { actor, part, dist, point } or { actor: null,
// dist: <wall distance or maxDist>, point }.
export function resolveShot(origin, dir, maxDist, actors, exclude) {
  let bestDist = maxDist;
  let bestActor = null;
  let bestPart = null;

  // Walls first: nothing past the nearest wall can be hit.
  for (let i = 0; i < COLLIDERS.length; i++) {
    const t = rayBox(origin, dir, COLLIDERS[i]);
    if (t >= 0 && t < bestDist) bestDist = t;
  }

  for (const actor of actors) {
    if (actor === exclude || !actor.alive) continue;
    const boxes = bodyBoxes(actor);
    for (const part of ['head', 'body']) {
      const t = rayBox(origin, dir, boxes[part]);
      if (t >= 0 && t < bestDist) {
        bestDist = t;
        bestActor = actor;
        bestPart = part;
      }
    }
  }

  const point = {
    x: origin.x + dir.x * bestDist,
    y: origin.y + dir.y * bestDist,
    z: origin.z + dir.z * bestDist,
  };
  return { actor: bestActor, part: bestPart, dist: bestDist, point };
}

// Spread direction: a random point in a cone of half-angle `spread` around dir.
export function spreadDir(dir, spread) {
  if (spread <= 0) return { x: dir.x, y: dir.y, z: dir.z };
  const angle = Math.random() * Math.PI * 2;
  const r = spread * Math.sqrt(Math.random());
  // Orthonormal basis around dir.
  const ux = Math.abs(dir.y) < 0.9 ? 0 : 1;
  const uy = Math.abs(dir.y) < 0.9 ? 1 : 0;
  const uz = 0;
  let ax = uy * dir.z - uz * dir.y;
  let ay = uz * dir.x - ux * dir.z;
  let az = ux * dir.y - uy * dir.x;
  const al = Math.hypot(ax, ay, az) || 1;
  ax /= al; ay /= al; az /= al;
  const bx = dir.y * az - dir.z * ay;
  const by = dir.z * ax - dir.x * az;
  const bz = dir.x * ay - dir.y * ax;
  const ox = Math.cos(angle) * r;
  const oy = Math.sin(angle) * r;
  const d = {
    x: dir.x + ax * ox + bx * oy,
    y: dir.y + ay * ox + by * oy,
    z: dir.z + az * ox + bz * oy,
  };
  const l = Math.hypot(d.x, d.y, d.z) || 1;
  d.x /= l; d.y /= l; d.z /= l;
  return d;
}

// Apply a hit to an actor. Armor absorbs half the damage while it lasts.
// Returns the hp damage dealt.
export function applyDamage(actor, raw) {
  let dmg = raw;
  if (actor.armor > 0) {
    const absorbed = Math.min(actor.armor, dmg * 0.5);
    actor.armor -= absorbed;
    dmg -= absorbed;
  }
  actor.hp -= dmg;
  if (actor.hp <= 0) {
    actor.hp = 0;
    actor.alive = false;
  }
  return dmg;
}

// Try to start a reload. Returns true when a reload began.
export function startReload(loadout, now) {
  const w = WEAPONS[loadout.id];
  if (loadout.reloading || loadout.mag >= w.mag || loadout.reserve <= 0) return false;
  loadout.reloading = true;
  loadout.reloadEnd = now + w.reloadSeconds;
  return true;
}

// Finish a reload whose timer expired. Returns true when it completed.
export function tickReload(loadout, now) {
  if (!loadout.reloading || now < loadout.reloadEnd) return false;
  const w = WEAPONS[loadout.id];
  const need = w.mag - loadout.mag;
  const take = Math.min(need, loadout.reserve);
  loadout.mag += take;
  loadout.reserve -= take;
  loadout.reloading = false;
  return true;
}

// Spread for a holder: base + movement + bloom, clamped by the weapon.
export function currentSpread(weapon, loadout, moving, crouched) {
  let s = weapon.spreadBase + loadout.bloom;
  if (moving) s += weapon.spreadMove;
  if (crouched) s *= 0.6;
  return clamp(s, 0, 0.12);
}

// Decay bloom toward zero (called once per tick).
export function decayBloom(loadout, dt) {
  loadout.bloom = Math.max(0, loadout.bloom - 0.05 * dt);
}
