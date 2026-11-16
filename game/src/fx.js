// SABLE YARD — combat effects, all pooled: nothing is allocated per frame.
// Tracers are stretched lines from muzzle to impact, sparks are small points,
// the muzzle flash is one reusable light. Each effect is claimed, animated
// for a few frames, then returned to its pool.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 160;

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    const tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
      const line = new THREE.Line(tracerGeo.clone(), mat);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3));
    this.sparkMat = new THREE.PointsMaterial({ color: 0xffc46b, size: 0.14, transparent: true, opacity: 0.95, sizeAttenuation: true });
    this.sparks = new THREE.Points(sparkGeo, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.visible = false;
    scene.add(this.sparks);
    this.sparkVel = new Float32Array(MAX_SPARKS * 3);
    this.sparkLife = new Float32Array(MAX_SPARKS);
    this.sparkCursor = 0;

    this.flash = new THREE.PointLight(0xffc46b, 0, 9, 1.6);
    scene.add(this.flash);
    this.flashLife = 0;

    this.shake = 0; // screen-shake magnitude, decays in update()
  }

  tracer(from, to, color) {
    const t = this.tracers.find((x) => x.life <= 0) ?? this.tracers[0];
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z;
    p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.07;
  }

  impact(point, normal) {
    for (let i = 0; i < 6; i++) {
      const idx = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % MAX_SPARKS;
      const p = this.sparks.geometry.attributes.position.array;
      p[idx * 3] = point.x; p[idx * 3 + 1] = point.y; p[idx * 3 + 2] = point.z;
      const spread = 2.4;
      this.sparkVel[idx * 3] = (Math.random() - 0.5) * spread + (normal ? normal.x * 2 : 0);
      this.sparkVel[idx * 3 + 1] = Math.random() * spread * 0.8 + 1;
      this.sparkVel[idx * 3 + 2] = (Math.random() - 0.5) * spread + (normal ? normal.z * 2 : 0);
      this.sparkLife[idx] = 0.35 + Math.random() * 0.25;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.visible = true;
  }

  muzzleFlash(pos) {
    this.flash.position.set(pos.x, pos.y, pos.z);
    this.flash.intensity = 26;
    this.flashLife = 0.05;
  }

  explosion(point) {
    this.flash.position.set(point.x, point.y + 0.5, point.z);
    this.flash.intensity = 90;
    this.flash.color.setHex(0xff8a3c);
    this.flashLife = 0.3;
    for (let i = 0; i < 40; i++) {
      const idx = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % MAX_SPARKS;
      const p = this.sparks.geometry.attributes.position.array;
      p[idx * 3] = point.x; p[idx * 3 + 1] = point.y + 0.2; p[idx * 3 + 2] = point.z;
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 7;
      this.sparkVel[idx * 3] = Math.cos(a) * sp;
      this.sparkVel[idx * 3 + 1] = 2 + Math.random() * 6;
      this.sparkVel[idx * 3 + 2] = Math.sin(a) * sp;
      this.sparkLife[idx] = 0.5 + Math.random() * 0.4;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.visible = true;
    this.shake = Math.max(this.shake, 0.5);
  }

  addShake(amount) {
    this.shake = Math.min(0.8, this.shake + amount);
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.line.visible = false;
        t.line.material.opacity = 0;
      } else {
        t.line.material.opacity = (t.life / 0.07) * 0.9;
      }
    }
    let anySpark = false;
    const p = this.sparks.geometry.attributes.position.array;
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      anySpark = true;
      this.sparkLife[i] -= dt;
      this.sparkVel[i * 3 + 1] -= 12 * dt;
      p[i * 3] += this.sparkVel[i * 3] * dt;
      p[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      p[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.02) { p[i * 3 + 1] = 0.02; this.sparkVel[i * 3 + 1] *= -0.3; }
      if (this.sparkLife[i] <= 0) p[i * 3 + 1] = -10;
    }
    if (anySpark) this.sparks.geometry.attributes.position.needsUpdate = true;
    else this.sparks.visible = false;
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) {
        this.flash.intensity = 0;
        this.flash.color.setHex(0xffc46b);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.8);
  }
}
