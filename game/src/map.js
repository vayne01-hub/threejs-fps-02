// SABLE YARD — the map: "Meridian Yard", an original container yard.
// Attackers spawn south, defenders north; spike sites A (west) and B (east);
// mid runs down the middle. One file owns the colliders, the waypoint graph,
// line-of-sight, movement collision and the three.js meshes, so the sim and
// the renderer can never disagree about where a wall is.
import * as THREE from 'three';
import { segmentHitsBox } from './math.js';

// A collider is { cx, cz, w, d, h }: a box standing on y = 0.
const BOXES = [
  // perimeter (h 4)
  { cx: 0, cz: -24.5, w: 66, d: 1, h: 4 },
  { cx: 0, cz: 24.5, w: 66, d: 1, h: 4 },
  { cx: -32.5, cz: 0, w: 1, d: 50, h: 4 },
  { cx: 32.5, cz: 0, w: 1, d: 50, h: 4 },
  // mid pillars
  { cx: -6, cz: 0, w: 1.5, d: 1.5, h: 3.2 },
  { cx: 6, cz: 0, w: 1.5, d: 1.5, h: 3.2 },
  // mid low wall, z = 8, gap in the middle (x -4..4)
  { cx: -7, cz: 8, w: 6, d: 1, h: 2.2 },
  { cx: 7, cz: 8, w: 6, d: 1, h: 2.2 },
  // north low wall, z = -14, gap in the middle
  { cx: -7, cz: -14, w: 6, d: 1, h: 2.2 },
  { cx: 7, cz: -14, w: 6, d: 1, h: 2.2 },
  // west lane wall (separates A lane from mid-south)
  { cx: -18, cz: 10, w: 1, d: 10, h: 3 },
  // east lane wall
  { cx: 18, cz: 10, w: 1, d: 10, h: 3 },
  // mid crates
  { cx: -2, cz: 6, w: 2, d: 2, h: 1.2 },
  { cx: 3, cz: -4, w: 2, d: 2, h: 1.2 },
  { cx: -12, cz: -6, w: 2, d: 2, h: 1.2 },
  { cx: 12, cz: -6, w: 2, d: 2, h: 1.2 },
  { cx: -12, cz: 14, w: 2, d: 2, h: 2 },
  { cx: 12, cz: 14, w: 2, d: 2, h: 2 },
  { cx: 0, cz: -16, w: 3, d: 1, h: 1.2 },
  // A site furniture
  { cx: -24, cz: -2, w: 2, d: 2, h: 2 },
  { cx: -27, cz: -10, w: 2, d: 2, h: 1.2 },
  { cx: -21, cz: -14, w: 3, d: 1.5, h: 1.2 },
  { cx: -26, cz: -16, w: 6, d: 2.4, h: 2.6 },
  { cx: -28, cz: 14, w: 2, d: 2, h: 1.2 },
  // B site furniture (mirrored)
  { cx: 24, cz: -2, w: 2, d: 2, h: 2 },
  { cx: 27, cz: -10, w: 2, d: 2, h: 1.2 },
  { cx: 21, cz: -14, w: 3, d: 1.5, h: 1.2 },
  { cx: 26, cz: -16, w: 6, d: 2.4, h: 2.6 },
  { cx: 28, cz: 14, w: 2, d: 2, h: 1.2 },
];

// Waypoint graph: bots path on this. Nodes are open floor; edges are walks
// that do not cross a collider.
export const WAYPOINTS = [
  [0, 20], [0, 13], [0, 8], [0, 2], [0, -8], [0, -14], [0, -20],
  [-26, 14], [-26, 4], [-18, -2], [-24, -8], [-21, -14], [-28, -14],
  [26, 14], [26, 4], [18, -2], [24, -8], [21, -14], [28, -14],
  [-12, 0], [12, 0], [-12, -10], [12, -10], [0, -17],
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [5, 23], [4, 21],
  [4, 22], [3, 19], [3, 20], [19, 9], [20, 15], [19, 21], [20, 22],
  [9, 10], [10, 11], [10, 12], [11, 21], [12, 8], [8, 7], [7, 1],
  [9, 8], [15, 16], [16, 17], [16, 18], [17, 22], [18, 14], [14, 13],
  [13, 1], [15, 14], [21, 11], [22, 17], [23, 6], [21, 23], [22, 23],
  [2, 19], [2, 20], [0, 7], [0, 13],
];
export const ADJ = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }

export const SITES = {
  A: { name: 'A', cx: -24, cz: -8, half: 4, node: 10 },
  B: { name: 'B', cx: 24, cz: -8, half: 4, node: 16 },
};

export const SPAWNS = {
  sable: [[0, 20], [-3, 21], [3, 21], [-6, 19]],
  vulture: [[0, -20], [-4, -21], [4, -21], [-8, -19], [8, -19]],
};

export const DEFEND_HOLDS = {
  A: [[-21, -14], [-27, -12]],
  B: [[21, -14], [27, -12]],
};

export const BOUNDS = { minX: -31.6, maxX: 31.6, minZ: -23.6, maxZ: 23.6 };

function toAABB(b) {
  return {
    min: { x: b.cx - b.w / 2, y: 0, z: b.cz - b.d / 2 },
    max: { x: b.cx + b.w / 2, y: b.h, z: b.cz + b.d / 2 },
  };
}
export const COLLIDERS = BOXES.map(toAABB);

// True when the segment between two points is blocked by any collider.
export function losBlocked(ax, ay, az, bx, by, bz) {
  const a = { x: ax, y: ay, z: az };
  const b = { x: bx, y: by, z: bz };
  for (let i = 0; i < COLLIDERS.length; i++) {
    if (segmentHitsBox(a, b, COLLIDERS[i])) return true;
  }
  return false;
}

// Move a standing body (feet at pos.y) by vel*dt, sliding along AABBs.
// pos is {x, y, z} and is mutated; half is the horizontal half-extent,
// height the body height. y stays 0: the yard is flat.
export function moveAndCollide(pos, half, height, vx, vz, dt) {
  // X axis
  let nx = pos.x + vx * dt;
  nx = Math.max(BOUNDS.minX + half, Math.min(BOUNDS.maxX - half, nx));
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    if (c.max.y <= 0.01) continue;
    if (pos.y + height <= c.min.y || pos.y >= c.max.y) continue;
    if (nx + half > c.min.x && nx - half < c.max.x &&
        pos.z + half > c.min.z && pos.z - half < c.max.z) {
      nx = vx > 0 ? c.min.x - half : c.max.x + half;
    }
  }
  pos.x = nx;
  // Z axis
  let nz = pos.z + vz * dt;
  nz = Math.max(BOUNDS.minZ + half, Math.min(BOUNDS.maxZ - half, nz));
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    if (c.max.y <= 0.01) continue;
    if (pos.y + height <= c.min.y || pos.y >= c.max.y) continue;
    if (nz + half > c.min.z && nz - half < c.max.z &&
        pos.x + half > c.min.x && pos.x - half < c.max.x) {
      nz = vz > 0 ? c.min.z - half : c.max.z + half;
    }
  }
  pos.z = nz;
}

// Nearest waypoint index to (x, z).
export function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i][0] - x;
    const dz = WAYPOINTS[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Breadth-first path of node indices from `from` to `to`.
export function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Int16Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of ADJ[cur]) {
      if (prev[nb] !== -1) continue;
      prev[nb] = cur;
      if (nb === to) {
        const path = [to];
        let n = to;
        while (n !== from) { n = prev[n]; path.unshift(n); }
        return path;
      }
      queue.push(nb);
    }
  }
  return [to];
}

// ---- rendering ----------------------------------------------------------

function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#23282e'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
    g.fillRect((Math.random() * 256) | 0, (Math.random() * 256) | 0, 2, 2);
  }
  g.strokeStyle = 'rgba(240,168,48,0.16)'; g.lineWidth = 2;
  g.strokeRect(4, 4, 248, 248);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 12);
  return t;
}

function letterTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = color; g.lineWidth = 6;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = color;
  g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  return new THREE.CanvasTexture(c);
}

export function buildWorld(scene) {
  const concrete = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.95 });
  const concreteDark = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.95 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x9a5a28, roughness: 0.8, metalness: 0.25 });
  const rustBlue = new THREE.MeshStandardMaterial({ color: 0x2e5f6e, roughness: 0.8, metalness: 0.25 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.6, emissive: 0x664400, emissiveIntensity: 0.4 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x35d0c0, roughness: 0.6, emissive: 0x063832, emissiveIntensity: 0.5 });

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(66, 50),
    new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const b of BOXES) {
    // Material by height: perimeter dark, pillars concrete, tall boxes rust,
    // low walls rust, low crates blue-rust — one palette, readable at a glance.
    let mat = rustBlue;
    if (b.h >= 4) mat = concreteDark;
    else if (b.h >= 3) mat = concrete;
    else if (b.h >= 2.2) mat = rust;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(b.cx, b.h / 2, b.cz);
    m.scale.set(b.w, b.h, b.d);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }

  // Spike-site floor decals: an amber A, a teal B.
  for (const [key, site] of Object.entries(SITES)) {
    const mat = new THREE.MeshBasicMaterial({
      map: letterTexture(site.name, key === 'A' ? '#f0a830' : '#35d0c0'),
      transparent: true, opacity: 0.85, depthWrite: false,
    });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.cx, 0.03, site.cz);
    scene.add(decal);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 2.4, 0.5),
      key === 'A' ? amber : teal,
    );
    glow.position.set(site.cx, 1.2, site.cz + 3.4);
    scene.add(glow);
  }

  // Perimeter light posts (emissive only; the sun does the lighting).
  const postMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.9 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 1.6 });
  for (const [x, z] of [[-28, -20], [28, -20], [-28, 20], [28, 20], [0, -22], [0, 22]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5, 0.25), postMat);
    post.position.set(x, 2.5, z);
    scene.add(post);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.7), lampMat);
    lamp.position.set(x, 5, z);
    scene.add(lamp);
  }
}
