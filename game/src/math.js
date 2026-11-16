// SABLE YARD — small math helpers. No allocations in the hot paths: callers
// reuse the scratch objects exported here.
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const randPick = (arr) => arr[(Math.random() * arr.length) | 0];

// Ray vs axis-aligned box. Returns the entry distance along the ray, or -1.
// o, d are {x,y,z}; d must be normalized. Box is {min:{x,y,z}, max:{x,y,z}}.
export function rayBox(o, d, box) {
  let tmin = 0;
  let tmax = Infinity;
  for (const ax of ['x', 'y', 'z']) {
    const od = d[ax];
    const oo = o[ax];
    if (Math.abs(od) < 1e-9) {
      if (oo < box.min[ax] || oo > box.max[ax]) return -1;
    } else {
      let t1 = (box.min[ax] - oo) / od;
      let t2 = (box.max[ax] - oo) / od;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

// Distance from a point to the nearest point of an AABB (0 when inside).
export function distPointBox(p, box) {
  const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x);
  const dy = Math.max(box.min.y - p.y, 0, p.y - box.max.y);
  const dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Segment vs AABB: true when the segment from a to b touches the box.
export function segmentHitsBox(a, b, box) {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
  if (len < 1e-9) return distPointBox(a, box) === 0;
  d.x /= len; d.y /= len; d.z /= len;
  const t = rayBox(a, d, box);
  return t >= 0 && t <= len;
}
