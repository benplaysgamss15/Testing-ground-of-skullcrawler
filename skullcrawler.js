import * as THREE from 'three';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0 || 1e-8), 0, 1); return t * t * (3 - 2 * t); };
const smootherstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0 || 1e-8), 0, 1); return t * t * t * (10 + t * (-15 + 6 * t)); };
const UP_AXIS = new THREE.Vector3(0, 1, 0);

function evalSpline(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  const n = xs.length;
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]), t2 = t * t, t3 = t2 * t;
  const y0 = ys[Math.max(0, i - 1)], y1 = ys[i], y2 = ys[i + 1], y3 = ys[Math.min(n - 1, i + 2)];
  return 0.5 * ((2 * y1) + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
}

const hash2 = (ix, iy) => { const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453; return n - Math.floor(n); };
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(ix, iy), hash2(ix + 1, iy), ux), lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux), uy);
}
const fbm = (x, y) => 0.55 * noise2(x, y) + 0.30 * noise2(x * 2.1, y * 2.1) + 0.15 * noise2(x * 4.3, y * 4.3);

const pNoise = (u, v, p) => {
  const gx = u * p, gy = v * p, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const i0 = ((ix % p) + p) % p, j0 = ((iy % p) + p) % p, i1 = (i0 + 1) % p, j1 = (j0 + 1) % p;
  return lerp(lerp(hash2(i0, j0), hash2(i1, j0), ux), lerp(hash2(i0, j1), hash2(i1, j1), ux), uy);
};
const pFbm = (u, v, p = 8) => 0.55 * pNoise(u, v, p) + 0.30 * pNoise(u, v, p * 2) + 0.15 * pNoise(u, v, p * 4);

function buildNormalMap(hBuf, size, strength) {
  const nc = document.createElement('canvas'); nc.width = nc.height = size;
  const nCtx = nc.getContext('2d'), nImg = nCtx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    const pyU = (py - 1 + size) % size, pyD = (py + 1) % size;
    for (let px = 0; px < size; px++) {
      const hL = hBuf[py * size + ((px - 1 + size) % size)];
      const hR = hBuf[py * size + ((px + 1) % size)];
      const hU = hBuf[pyU * size + px];
      const hD = hBuf[pyD * size + px];
      const nx = -(hR - hL) * strength, ny = (hD - hU) * strength, nz = 1.0;
      const inv = 1 / Math.hypot(nx, ny, nz), i = (py * size + px) * 4;
      nImg.data[i]     = Math.round((nx * inv * 0.5 + 0.5) * 255);
      nImg.data[i + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      nImg.data[i + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      nImg.data[i + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);
  return nc;
}

function createReptileTextures(size = 512, anisotropy = 4) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return [c, c.getContext('2d')]; };
  const [dc, dCtx] = mk(), [rc, rCtx] = mk();
  const dImg = dCtx.createImageData(size, size), rImg = rCtx.createImageData(size, size);
  const hBuf = new Float32Array(size * size);
  const cells = 22, pts = [];
  for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++)
    pts.push({ x: cx + 0.16 + 0.68 * hash2(cx, cy), y: cy + 0.16 + 0.68 * hash2(cx + 97, cy + 53) });

  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const m1 = pFbm(u, v, 6), m2 = pFbm(u + 0.37, v + 0.61, 22);
      const uw = ((u + (m1 - 0.5) * 0.028) % 1 + 1) % 1;
      const vw = ((v + (m2 - 0.5) * 0.020) % 1 + 1) % 1;
      const gx = uw * cells, gy = vw * cells, icx = Math.floor(gx), icy = Math.floor(gy);
      let d1 = 9e9, d2 = 9e9;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const wx = (icx + ox + cells) % cells, wy = (icy + oy + cells) % cells, pt = pts[wy * cells + wx];
        const dist = Math.hypot((pt.x + (icx + ox - wx)) - gx, (pt.y + (icy + oy - wy)) - gy);
        if (dist < d1) { d2 = d1; d1 = dist; } else if (dist < d2) d2 = dist;
      }
      const edge = clamp((d2 - d1) * 2.1, 0, 1);
      const dome = Math.pow(edge, 0.42), crevice = 1 - smoothstep(0.0, 0.28, edge);
      const fold = 0.5 + 0.5 * Math.sin(u * Math.PI * 16 + m1 * 5.0);
      const idxP = py * size + px, i = idxP * 4;
      hBuf[idxP] = clamp(0.56 * dome + 0.22 * m2 + 0.14 * fold + 0.08 * m1 - 0.24 * crevice, 0, 1);

      const tone = clamp(0.90 + 0.12 * dome + 0.12 * (m1 - 0.5) + 0.08 * (m2 - 0.5) - 0.34 * crevice - 0.06 * (1 - fold), 0.48, 1.04);
      dImg.data[i]     = Math.round(clamp(tone * (0.97 + 0.04 * m1), 0, 1) * 255);
      dImg.data[i + 1] = Math.round(clamp(tone * (0.99 + 0.03 * m2), 0, 1) * 255);
      dImg.data[i + 2] = Math.round(clamp(tone * (0.91 + 0.04 * m1), 0, 1) * 255);
      dImg.data[i + 3] = 255;

      const rough = clamp(0.62 + 0.28 * crevice + 0.14 * (1 - dome) + 0.10 * (m2 - 0.5), 0.52, 0.98);
      rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = Math.round(rough * 255); rImg.data[i + 3] = 255;
    }
  }
  dCtx.putImageData(dImg, 0, 0); rCtx.putImageData(rImg, 0, 0);
  const nc = buildNormalMap(hBuf, size, 4.2);
  const tx = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.anisotropy = anisotropy; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: tx(dc, true), normalMap: tx(nc, false), roughnessMap: tx(rc, false) };
}

function createBoneTextures(size = 384, anisotropy = 4) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return [c, c.getContext('2d')]; };
  const [dc, dCtx] = mk(), [rc, rCtx] = mk();
  const dImg = dCtx.createImageData(size, size), rImg = rCtx.createImageData(size, size);
  const hBuf = new Float32Array(size * size);

  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const b1 = pFbm(u + 0.13, v + 0.41, 6), b2 = pFbm(u + 0.23, v + 0.71, 24);
      const cNoise = pNoise(u + b1 * 0.06, v + b2 * 0.06, 8);
      const crack = Math.pow(clamp(1 - Math.abs(cNoise - 0.5) * 18, 0, 1), 2.2);
      const pore = smoothstep(0.75, 0.93, pNoise(u + 0.5, v + 0.2, 40));
      const idxP = py * size + px, i = idxP * 4;
      hBuf[idxP] = clamp(0.62 + 0.18 * b2 + 0.10 * b1 - 0.38 * crack - 0.28 * pore, 0, 1);

      const tone = clamp(0.95 + 0.08 * (b1 - 0.5) + 0.05 * (b2 - 0.5) - 0.28 * crack - 0.20 * pore, 0.55, 1.0);
      dImg.data[i]     = Math.round(tone * 255);
      dImg.data[i + 1] = Math.round(tone * 0.98 * 255);
      dImg.data[i + 2] = Math.round(tone * 0.93 * 255);
      dImg.data[i + 3] = 255;

      const rough = clamp(0.64 + 0.22 * (1 - b2) + 0.25 * crack + 0.20 * pore, 0.56, 0.98);
      rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = Math.round(rough * 255); rImg.data[i + 3] = 255;
    }
  }
  dCtx.putImageData(dImg, 0, 0); rCtx.putImageData(rImg, 0, 0);
  const nc = buildNormalMap(hBuf, size, 2.6);
  const tx = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.anisotropy = anisotropy; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: tx(dc, true), normalMap: tx(nc, false), roughnessMap: tx(rc, false) };
}

export class RoarSynth {
  constructor() { this.ctx = null; this.on = true; this.last = -10; }
  unlock() {
    if (!this.on) return;
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  setEnabled(v) {
    this.on = v;
    if (v) this.unlock();
  }
  trigger() {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime; if (now - this.last < 2.6) return; this.last = now;
    const dur = 2.3, master = this.ctx.createGain();
    master.gain.setValueAtTime(0.001, now); master.gain.exponentialRampToValueAtTime(0.32, now + 0.18);
    master.gain.setValueAtTime(0.30, now + 1.2); master.gain.exponentialRampToValueAtTime(0.001, now + dur);
    master.connect(this.ctx.destination);
    const o1 = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o1.type = 'sawtooth'; o2.type = 'square'; lfo.frequency.value = 26; lg.gain.value = 38; lfo.connect(lg); lg.connect(o1.frequency);
    o1.frequency.setValueAtTime(210, now); o1.frequency.exponentialRampToValueAtTime(480, now + 0.30); o1.frequency.exponentialRampToValueAtTime(135, now + dur);
    o2.frequency.setValueAtTime(98, now); o2.frequency.exponentialRampToValueAtTime(185, now + 0.28); o2.frequency.exponentialRampToValueAtTime(64, now + dur);
    f.type = 'bandpass'; f.Q.value = 2.4; f.frequency.setValueAtTime(750, now); f.frequency.exponentialRampToValueAtTime(1450, now + 0.35); f.frequency.exponentialRampToValueAtTime(420, now + dur);
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const ns = this.ctx.createBufferSource(), nf = this.ctx.createBiquadFilter(), ng = this.ctx.createGain();
    ns.buffer = buf; nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 1.2; ng.gain.value = 0.25;
    o1.connect(f); o2.connect(f); f.connect(master); ns.connect(nf); nf.connect(ng); ng.connect(master);
    lfo.start(now); o1.start(now); o2.start(now); ns.start(now);
    lfo.stop(now + dur); o1.stop(now + dur); o2.stop(now + dur); ns.stop(now + dur);
  }
}

export class SkullcrawlerModel {
  constructor({ maxAnisotropy = 4 } = {}) {
    this.group = new THREE.Group();
 const tx = createReptileTextures(512, maxAnisotropy);
    const bTx = createBoneTextures(384, maxAnisotropy);
    this.skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tx.map, normalMap: tx.normalMap, normalScale: new THREE.Vector2(1.25, 1.25), roughnessMap: tx.roughnessMap, roughness: 0.95, metalness: 0.03 });
    this.boneMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: bTx.map, normalMap: bTx.normalMap, normalScale: new THREE.Vector2(0.85, 0.85), roughnessMap: bTx.roughnessMap, roughness: 0.92, metalness: 0.02 });
    this.toothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05 });
    this.wetMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.20, metalness: 0.02 });
    this.L1 = 0.88; this.L2 = 1.52;
    this._buildRig();

    this.targetAnim = 'idle';
    this.blend = 1;
    this.time = 0;
    this.gaitPhase = 0;
    this.speed = 1;
    this.prevPose = null;
    this._usingInput = false;

    this.moveBlend = 0;
    this.runBlend = 0;
    this.turnBlend = 0;
    this.turnStepBlend = 0;

    this.onScreamPeak = null;
    this.onScreamEnd = null;
    this.screamActive = false;
    this.screamTime = 0;
    this.screamDuration = 3.4;
    this.screamPeakFired = false;

    this.attackActive = false;
    this.attackTime = 0;
    this.attackDuration = 1.62;
    this.onAttackEnd = null;

    this.facingYaw = 0;
    this.pivotLocalZ = -0.85;
    this.turnActive = false;
    this.turnDir = 1;
    this.turnTime = 0;
    this.turnDuration = 2.25;
    this.turnStartYaw = 0;
    this.turnTargetYaw = 0;
    this.turnPivotWorld = new THREE.Vector3(0, 0, this.pivotLocalZ);
    this.turnReturnAnim = 'idle';
    this.onTurnEnd = null;
  }

  _normalizeAngle(a) {
    let y = a % (Math.PI * 2);
    if (y > Math.PI) y -= Math.PI * 2;
    if (y <= -Math.PI) y += Math.PI * 2;
    if (Math.abs(y) < 1e-9) y = 0;
    if (Math.abs(Math.abs(y) - Math.PI) < 1e-9) y = Math.PI;
    return y;
  }

  setAnimation(name) {
    if (name === 'turnLeft' || name === 'turn_left') return this.triggerTurn('left');
    if (name === 'turnRight' || name === 'turn_right') return this.triggerTurn('right');
    if (name === 'scream') return this.triggerScream();
    if (!['idle', 'walk', 'run'].includes(name)) return;
    if (this.turnActive) {
      this.targetAnim = name;
      this.turnReturnAnim = name;
      return;
    }
    if (name === this.targetAnim && !this.attackActive && !this.screamActive) return;
    this.prevPose = this._getCurrentPose();
    if (this.attackActive) {
      this.attackActive = false;
      if (this.onAttackEnd) this.onAttackEnd();
    }
    if (this.screamActive) {
      this.screamActive = false;
      if (this.onScreamEnd) this.onScreamEnd();
    }
    this.targetAnim = name;
    this.blend = 0;
  }

  triggerAttack() {
    if (this.turnActive || this.attackActive) return false;
    this.prevPose = this._getCurrentPose();
    if (this.screamActive) {
      this.screamActive = false;
      if (this.onScreamEnd) this.onScreamEnd();
    }
    this.attackActive = true;
    this.attackTime = 0;
    this.blend = 0;
    return true;
  }

  triggerScream() {
    if (this.turnActive || this.screamActive) return false;
    this.prevPose = this._getCurrentPose();
    if (this.attackActive) {
      this.attackActive = false;
      if (this.onAttackEnd) this.onAttackEnd();
    }
    this.screamActive = true;
    this.screamTime = 0;
    this.screamPeakFired = false;
    this.blend = 0;
    return true;
  }

  triggerTurn(dirOrName) {
    if (this.turnActive) return false;
    const dir = (dirOrName === 'right' || dirOrName === -1) ? -1 : 1;
    this.prevPose = this._getCurrentPose();
    if (this.attackActive) {
      this.attackActive = false;
      if (this.onAttackEnd) this.onAttackEnd();
    }
    if (this.screamActive) {
      this.screamActive = false;
      if (this.onScreamEnd) this.onScreamEnd();
    }
    this.turnDir = dir;
    this.turnTime = 0;
    this.blend = 0;
    this.turnReturnAnim = (this.targetAnim === 'walk' || this.targetAnim === 'run') ? this.targetAnim : 'idle';
    this.turnStartYaw = this._normalizeAngle(this.group.rotation.y);
    this.facingYaw = this.turnStartYaw;
    this.turnTargetYaw = this.turnStartYaw + dir * Math.PI;
    this.turnPivotWorld.set(0, 0, this.pivotLocalZ).applyAxisAngle(UP_AXIS, this.turnStartYaw).add(this.group.position);
    this.turnActive = true;
    return true;
  }

  _buildRig() {
    const ctrlS = [0, 0.12, 0.25, 0.40, 0.55, 0.68, 0.78, 0.87, 0.94, 1.0];
    const ctrlZ = [-6.5, -5.0, -3.55, -2.35, -1.35, -0.55, 0.02, 0.54, 0.94, 1.30];
    const ctrlY = [ 0.60, 0.46, 0.54, 0.86, 1.30, 1.74, 1.92, 1.82, 1.79, 1.78];
    const stationS = [0.02, 0.11, 0.22, 0.34, 0.46, 0.57, 0.67, 0.78, 0.88, 0.95, 1.00];
    const names = ['tail6','tail5','tail4','tail3','tail2','tail1','pelvis','chest','neck1','neck2','headBase'];
    const wPos = stationS.map(s => new THREE.Vector3(0, evalSpline(ctrlS, ctrlY, s), evalSpline(ctrlS, ctrlZ, s)));

    this.spineBones = names.map(n => { const b = new THREE.Bone(); b.name = n; return b; });
    this.bones = {}; names.forEach((n, i) => this.bones[n] = this.spineBones[i]);
    this.bones.pelvis.position.copy(wPos[6]);
    this.group.add(this.bones.pelvis);
    for (let i = 7; i <= 10; i++) { this.spineBones[i].position.copy(wPos[i]).sub(wPos[i - 1]); this.spineBones[i - 1].add(this.spineBones[i]); }
    for (let i = 5; i >= 0; i--) { this.spineBones[i].position.copy(wPos[i]).sub(wPos[i + 1]); this.spineBones[i + 1].add(this.spineBones[i]); }
    this.pelvisRest = wPos[6].clone();

    this.limbs = { L: this._buildLimbRig(1, this.bones.chest, wPos[7]), R: this._buildLimbRig(-1, this.bones.chest, wPos[7]) };
    const allBones = [
      ...this.spineBones,
      this.limbs.L.shB, this.limbs.L.elB, this.limbs.L.wrB,
      this.limbs.R.shB, this.limbs.R.elB, this.limbs.R.wrB,
    ];

    const bodyGeo = this._buildBodyAndLimbsGeo(ctrlS, ctrlZ, ctrlY, stationS, wPos[7]);
    this.bodyMesh = new THREE.SkinnedMesh(bodyGeo, this.skinMat);
    this.bodyMesh.castShadow = this.bodyMesh.receiveShadow = true; this.bodyMesh.frustumCulled = false;
    this.group.add(this.bodyMesh);
    this.group.updateMatrixWorld(true);
    this.bodyMesh.bind(new THREE.Skeleton(allBones), new THREE.Matrix4());

    this._buildHead(this.bones.headBase);
  }

  _buildBodyAndLimbsGeo(ctrlS, ctrlZ, ctrlY, stationS, chestW) {
    const nAx = 92, nRd = 32;
    const i0 = 67, i1 = 75, j0L = 4, j1L = 12;
    const j0R = nRd - j1L, j1R = nRd - j0L;
    const dI = i1 - i0, dJ = j1L - j0L;
    const iMid = 0.5 * (i0 + i1), jMidL = 0.5 * (j0L + j1L);

    const evalTorsoPt = (iVal, jVal) => {
      const sideJ = jVal <= nRd * 0.5 ? jVal : nRd - jVal;
      const di = (iVal - iMid) / (0.5 * dI), dj = (sideJ - jMidL) / (0.5 * dJ);
      const boxD = Math.max(Math.abs(di), Math.abs(dj));
      let iEff = iVal, jEff = jVal;
      if (Math.abs(di) <= 1.75 && Math.abs(dj) <= 1.75 && (Math.abs(di) > 0.01 || Math.abs(dj) > 0.01)) {
        const rEuclid = Math.hypot(di, dj);
        const wRound = smoothstep(1.75, 1.0, boxD) * smoothstep(0.45, 1.0, boxD);
        const scale = lerp(1.0, boxD / Math.max(rEuclid, 1e-6), 0.85 * wRound);
        iEff = iMid + di * scale * (0.5 * dI);
        const sideJNew = jMidL + dj * scale * (0.5 * dJ);
        jEff = jVal <= nRd * 0.5 ? sideJNew : nRd - sideJNew;
      }

      const sEff = clamp(iEff / (nAx - 1), 0, 1);
      const zC = evalSpline(ctrlS, ctrlZ, sEff), yC = evalSpline(ctrlS, ctrlY, sEff);
      const ds = 0.5 / (nAx - 1);
      const dz = evalSpline(ctrlS, ctrlZ, Math.min(1, sEff + ds)) - evalSpline(ctrlS, ctrlZ, Math.max(0, sEff - ds));
      const dy = evalSpline(ctrlS, ctrlY, Math.min(1, sEff + ds)) - evalSpline(ctrlS, ctrlY, Math.max(0, sEff - ds));
      const tLen = Math.hypot(dz, dy) || 1e-8, nz = -dy / tLen, ny = dz / tLen;

      const tTail = smoothstep(0, 0.72, sEff), hump = Math.exp(-0.5 * ((sEff - 0.76) / 0.095) ** 2), neckT = smoothstep(0.84, 1.0, sEff);
      const rx = (0.018 + 0.36 * tTail ** 1.35 + 0.12 * hump) * (1 - 0.36 * neckT);
      const ryU = (0.022 + 0.36 * tTail ** 1.25 + 0.18 * hump) * (1 - 0.42 * neckT);
      const ryD = (0.018 + 0.27 * tTail ** 1.30 + 0.06 * hump) * (1 - 0.34 * neckT);
      const crestH = (0.038 + 0.088 * hump + 0.028 * Math.exp(-0.5 * ((sEff - 0.35) / 0.18) ** 2)) * smoothstep(0.05, 0.18, sEff) * (1 - smoothstep(0.88, 0.98, sEff));
      const ridgeW = 0.5 + 0.5 * Math.sin(sEff * Math.PI * 48), ribEnv = Math.exp(-0.5 * ((sEff - 0.73) / 0.09) ** 2), ribW = Math.sin(sEff * Math.PI * 64), barb = smoothstep(0.08, 0.015, sEff);

      const th = (jEff / nRd) * Math.PI * 2, sT = Math.sin(th), cT = Math.cos(th);
      let lx = rx * sT * (1 - 0.36 * (Math.max(0, (cT - 0.55) / 0.45) ** 1.5));
      const topPin = Math.max(0, (cT - 0.86) / 0.14) ** 2.2;
      const flank = Math.exp(-0.5 * ((Math.abs(sT) - 0.80) / 0.28) ** 2) * smoothstep(-0.5, 0.5, cT);
      const shMask = Math.exp(-0.5 * (((iEff - iMid) / (0.85 * dI)) ** 2 + ((sideJ - jMidL) / (0.75 * dJ)) ** 2));
      const rib = 0.026 * ribEnv * ribW * flank * (1 - 0.90 * shMask);
      let ln = (cT >= 0 ? ryU * cT : ryD * cT) + crestH * (0.42 + 0.58 * ridgeW) * topPin + 0.35 * rib * cT;
      lx += Math.sign(sT) * rib;
      ln += 0.045 * Math.exp(-0.5 * ((sEff - 0.56) / 0.08) ** 2) * Math.max(0, -cT);
      if (barb > 0 && cT > 0.65) ln += 0.065 * barb * ((cT - 0.65) / 0.35) ** 1.4;

      const shFlare = Math.exp(-0.5 * (((iEff - iMid) / (1.25 * dI)) ** 2 + ((sideJ - jMidL) / (0.90 * dJ)) ** 2));
      if (Math.abs(sT) > 0.05) {
        lx += Math.sign(sT) * 0.145 * shFlare;
        ln -= 0.032 * shFlare * smoothstep(0.0, 0.75, cT);
        if (iEff > iMid) ln -= 0.018 * shFlare * smoothstep(0, 1, (iEff - iMid) / (0.85 * dI)) * smoothstep(0.3, -0.5, cT);
      }

      const p = new THREE.Vector3(lx, yC + ln * ny, zC + ln * nz);
      let cr = lerp(0.20, 0.54, 0.68 * topPin), cg = lerp(0.22, 0.52, 0.68 * topPin), cb = lerp(0.18, 0.42, 0.68 * topPin);
      const ribHi = Math.max(0, ribW) * ribEnv * flank * (1 - 0.90 * shMask);
      cr = lerp(cr, 0.62, 0.52 * ribHi); cg = lerp(cg, 0.60, 0.52 * ribHi); cb = lerp(cb, 0.49, 0.52 * ribHi);
      const sh = 1 - 0.25 * (0.5 + 0.5 * Math.sin(sEff * Math.PI * 40)) * (1 - smoothstep(0.15, 0.60, sEff));
      cr *= sh; cg *= sh; cb *= sh;
      if (cT < 0) { cr = lerp(cr, 0.14, -0.5 * cT); cg = lerp(cg, 0.15, -0.5 * cT); cb = lerp(cb, 0.13, -0.5 * cT); }
      if (sEff < 0.045 && cT > 0.3) { const it = (0.045 - sEff) / 0.045; cr = lerp(cr, 0.80, it); cg = lerp(cg, 0.77, it); cb = lerp(cb, 0.67, it); }
      return { p, c: [clamp(cr, 0, 1), clamp(cg, 0, 1), clamp(cb, 0, 1)] };
    };

    const gridPos = Array.from({ length: nAx }, () => Array(nRd));
    const gridCol = Array.from({ length: nAx }, () => Array(nRd));
    const verts = [], cols = [], uvs = [], si = [], sw = [], idx = [];
    const canonOf = [], relaxWt = [];
    const vid = Array.from({ length: nAx }, () => Array(nRd + 1).fill(-1));
    const insideQuad = (i, j) => (i >= i0 && i < i1 && j >= j0L && j < j1L) || (i >= i0 && i < i1 && j >= j0R && j < j1R);
    const strictlyInside = (i, j) => (i > i0 && i < i1 && j > j0L && j < j1L) || (i > i0 && i < i1 && j > j0R && j < j1R);

    const addVert = (p, c, u, v, bones, weights, canon = -1, rWt = 0) => {
      const id = verts.length;
      verts.push(p.clone()); cols.push(c); uvs.push(u, v);
      si.push(bones[0], bones[1], bones[2], bones[3]);
      sw.push(weights[0], weights[1], weights[2], weights[3]);
      canonOf.push(canon >= 0 ? canon : id);
      relaxWt.push(rWt);
      return id;
    };

    for (let i = 0; i < nAx; i++) {
      const sRaw = i / (nAx - 1);
      let b0 = 0, b1 = 0, w0 = 1, w1 = 0;
      if (sRaw >= stationS[stationS.length - 1]) b0 = b1 = stationS.length - 1;
      else if (sRaw > stationS[0]) for (let k = 0; k < stationS.length - 1; k++) if (sRaw >= stationS[k] && sRaw <= stationS[k + 1]) {
        b0 = k; b1 = k + 1; const t = (sRaw - stationS[k]) / (stationS[k + 1] - stationS[k]); w1 = t * t * (3 - 2 * t); w0 = 1 - w1; break;
      }
      for (let j = 0; j < nRd; j++) {
        const pt = evalTorsoPt(i, j);
        gridPos[i][j] = pt.p; gridCol[i][j] = pt.c;
        if (strictlyInside(i, j)) continue;
        const sideJ = j <= nRd * 0.5 ? j : nRd - j;
        const diAbs = Math.max(0, Math.abs(i - iMid) - 0.5 * dI), djAbs = Math.max(0, Math.abs(sideJ - jMidL) - 0.5 * dJ);
        const dBox = Math.hypot(diAbs, djAbs);
        const rWt = (dBox <= 2.2 && sideJ >= 3 && sideJ <= 13) ? 0.45 * smoothstep(2.4, 0, dBox) : 0;
        vid[i][j] = addVert(pt.p, pt.c, sRaw * 6, j / nRd, [b0, b1, 0, 0], [w0, w1, 0, 0], -1, rWt);
      }
      vid[i][nRd] = addVert(gridPos[i][0], gridCol[i][0], sRaw * 6, 1.0, [b0, b1, 0, 0], [w0, w1, 0, 0], vid[i][0], 0);
    }

    for (let i = 0; i < nAx - 1; i++) for (let j = 0; j < nRd; j++) {
      if (insideQuad(i, j)) continue;
      const a = vid[i][j], b = vid[i + 1][j], c = vid[i + 1][j + 1], d = vid[i][j + 1];
      idx.push(a, b, c, a, c, d);
    }
    const tip = addVert(new THREE.Vector3(0, evalSpline(ctrlS, ctrlY, 0), evalSpline(ctrlS, ctrlZ, 0) - 0.06), [0.80, 0.77, 0.67], 0, 0.5, [0, 0, 0, 0], [1, 0, 0, 0]);
    for (let j = 0; j < nRd; j++) idx.push(tip, vid[0][j], vid[0][j + 1]);
    const nCap = addVert(new THREE.Vector3(0, evalSpline(ctrlS, ctrlY, 1), evalSpline(ctrlS, ctrlZ, 1)), [0.18, 0.19, 0.16], 6, 0.5, [stationS.length - 1, 0, 0, 0], [1, 0, 0, 0]);
    for (let j = 0; j < nRd; j++) idx.push(nCap, vid[nAx - 1][j + 1], vid[nAx - 1][j]);

    const qstep = u => { const x = clamp(u, 0, 1); return x * x * x * (10 + x * (-15 + 6 * x)); };
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const side = sIdx === 0 ? 1 : -1;
      const j0 = side === 1 ? j0L : j0R, j1 = side === 1 ? j1L : j1R;
      const loopIJ = [];
      for (let i = i0; i < i1; i++) loopIJ.push([i, j0]);
      for (let j = j0; j < j1; j++) loopIJ.push([i1, j]);
      for (let i = i1; i > i0; i--) loopIJ.push([i, j1]);
      for (let j = j1; j > j0; j--) loopIJ.push([i0, j]);
      const loopVids = loopIJ.map(([i, j]) => vid[i][j]);
      const loopPts = loopVids.map(v => verts[v].clone());
      const nR = loopVids.length;

      const shLocal = new THREE.Vector3(side * 0.48, -0.05, 0);
      const S0 = chestW.clone().add(shLocal), W0 = new THREE.Vector3(side * 0.82, 0.09, 0.06);
      const ik = this._solveIK(S0, W0, new THREE.Vector3(side * 0.68, 0.44, -0.76)), E0 = ik.E;
      const E0Ctrl = E0.clone().addScaledVector(ik.perp, 0.055);
      const P0 = new THREE.Vector3(); loopPts.forEach(p => P0.add(p)); P0.divideScalar(nR);

      const nSOrig = 46, kB = 14, kJoin = 38;
      const tArm0 = new THREE.Vector3(side * 0.92, -0.16, -0.10).normalize();
      let ptsOrig = Array.from({ length: nSOrig }, (_, k) => {
        const s = k / (nSOrig - 1);
        if (s <= 0.44) {
          const u = s / 0.44, c1 = P0.clone().addScaledVector(tArm0, 0.28), c2 = E0Ctrl.clone().addScaledVector(E0Ctrl.clone().sub(P0), -0.30);
          const m = 1 - u;
          return new THREE.Vector3()
            .addScaledVector(P0, m * m * m).addScaledVector(c1, 3 * m * m * u)
            .addScaledVector(c2, 3 * m * u * u).addScaledVector(E0Ctrl, u * u * u);
        }
        return new THREE.Vector3().lerpVectors(E0Ctrl, W0, (s - 0.44) / 0.56);
      });
      for (let pass = 0; pass < 16; pass++) {
        const nx = ptsOrig.map(p => p.clone());
        for (let k = 3; k < nSOrig - 3; k++) nx[k].copy(ptsOrig[k - 1]).multiplyScalar(0.25).addScaledVector(ptsOrig[k], 0.5).addScaledVector(ptsOrig[k + 1], 0.25);
        ptsOrig = nx;
      }
      ptsOrig[0].copy(P0); ptsOrig[nSOrig - 1].copy(W0);

      const nW = 16, nH = 13;
      const P_w0 = ptsOrig[kJoin].clone();
      const tanFore = ptsOrig[kJoin + 1].clone().sub(ptsOrig[kJoin - 1]).normalize();
      const P_w1 = new THREE.Vector3(side * 0.822, 0.078, 0.116);
      const tanPalm = new THREE.Vector3(side * 0.02, -0.12, 0.993).normalize();
      const P_knuckle = new THREE.Vector3(side * 0.826, 0.056, 0.272);
      const B0 = P_w0, B1 = P_w0.clone().addScaledVector(tanFore, 0.245), B2 = P_w1.clone().addScaledVector(tanPalm, -0.210), B3 = P_w1;

      const pts = ptsOrig.slice(0, kJoin + 1);
      for (let i = 1; i <= nW; i++) {
        const u = i / nW, m = 1 - u;
        pts.push(new THREE.Vector3()
          .addScaledVector(B0, m * m * m).addScaledVector(B1, 3 * m * m * u)
          .addScaledVector(B2, 3 * m * u * u).addScaledVector(B3, u * u * u));
      }
      for (let i = 1; i <= nH; i++) pts.push(new THREE.Vector3().lerpVectors(P_w1, P_knuckle, i / nH));
      const nTot = pts.length;

      const jMidS = side === 1 ? jMidL : (nRd - jMidL);
      const loopTans = loopIJ.map(([i, j], m) => {
        const gi = i - iMid, gj = j - jMidS, gl = Math.max(Math.abs(gi / (0.5 * dI)), Math.abs(gj / (0.5 * dJ)), 1e-6);
        const pOut = evalTorsoPt(i + 0.7 * gi / gl, j + 0.7 * gj / gl).p;
        const tVec = gridPos[i][j].clone().sub(pOut);
        const rHat = loopPts[m].clone().sub(P0); rHat.x = 0;
        if (rHat.lengthSq() > 1e-12) {
          rHat.normalize();
          const inward = tVec.dot(rHat);
          if (inward < 0) tVec.addScaledVector(rHat, -inward);
        }
        tVec.divideScalar(tVec.length() || 1e-6).multiplyScalar(0.50).addScaledVector(tArm0, 0.50).normalize();
        return tVec;
      });

      const tans = pts.map((_, k) => (k === 0 ? pts[1].clone().sub(pts[0]) : (k === nTot - 1 ? pts[k].clone().sub(pts[k - 1]) : pts[k + 1].clone().sub(pts[k - 1]))).normalize());
      const outDs = new Array(nTot), latDs = new Array(nTot);
      for (let k = 0; k < 36; k++) {
        const tan = tans[k];
        const outD = ik.perp.clone().addScaledVector(tan, -ik.perp.dot(tan)).normalize();
        outDs[k] = outD; latDs[k] = new THREE.Vector3().crossVectors(tan, outD).normalize();
      }
      const stepQ = new THREE.Quaternion();
      for (let k = 36; k < nTot; k++) {
        stepQ.setFromUnitVectors(tans[k - 1], tans[k]);
        const tan = tans[k];
        const outD = outDs[k - 1].clone().applyQuaternion(stepQ);
        outD.addScaledVector(tan, -outD.dot(tan)).normalize();
        outDs[k] = outD; latDs[k] = new THREE.Vector3().crossVectors(tan, outD).normalize();
      }
      const tanEnd = tans[nTot - 1];
      const handDown = new THREE.Vector3(0, -1, 0).addScaledVector(tanEnd, tanEnd.y).normalize();
      const rollCross = new THREE.Vector3().crossVectors(outDs[nTot - 1], handDown);
      const rollErr = Math.atan2(rollCross.dot(tanEnd), outDs[nTot - 1].dot(handDown));
      for (let k = 36; k < nTot; k++) {
        const uRoll = smoothstep(35, kJoin + nW, k);
        outDs[k].applyAxisAngle(tans[k], rollErr * uRoll).normalize();
        latDs[k].crossVectors(tans[k], outDs[k]).normalize();
      }

      const uCoords = new Array(nTot);
      for (let k = 0; k <= kJoin; k++) uCoords[k] = (k / (nSOrig - 1)) * 2.1;
      for (let k = kJoin + 1; k < nTot; k++) uCoords[k] = uCoords[k - 1] + pts[k].distanceTo(pts[k - 1]) * 0.79;

      const tanB = tans[kB], outB = outDs[kB], latB = latDs[kB];
      const phis = loopPts.map(p => { const d = p.clone().sub(P0); return Math.atan2(d.dot(latB), d.dot(outB)); });
      for (let m = 1; m < nR; m++) {
        let diff = phis[m] - phis[m - 1];
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        phis[m] = phis[m - 1] + diff;
      }
      const signDir = (phis[nR - 1] - phis[0]) > 0 ? 1 : -1;

      const evalArmPt = (k, m) => {
        const sOrig = k / (nSOrig - 1), uHand = clamp((k - kJoin) / (nTot - 1 - kJoin), 0, 1);
        const tan = tans[k], outD = outDs[k], latD = latDs[k];
        const thUni = phis[0] + signDir * (m / nR) * Math.PI * 2;
        const th = lerp(phis[m], thUni, smoothstep(0.05, 0.44, sOrig)), cT = Math.cos(th), sT = Math.sin(th);

        if (k <= kJoin) {
          const s = sOrig;
          const delt = 0.056 * Math.exp(-0.5 * ((s - 0.16) / 0.09) ** 2), bicep = 0.036 * Math.exp(-0.5 * ((s - 0.30) / 0.085) ** 2), foreB = 0.035 * Math.exp(-0.5 * ((s - 0.56) / 0.10) ** 2);
          const rO = 0.04 + 0.185 * (1 - 0.50 * s) + delt + bicep + foreB;
          const rL = 0.04 + 0.175 * (1 - 0.48 * s) + delt * 0.9 + bicep * 0.8 + foreB * 0.7;
          const spurRidge = Math.exp(-0.5 * ((s - 0.44) / 0.042) ** 2), fEnv = smoothstep(0.48, 0.58, s) * (1 - smoothstep(0.76, 0.88, s)), sW = Math.sin(s * Math.PI * 56);
          const ridge = spurRidge * (Math.max(0, (cT - 0.45) / 0.55) ** 1.8);
          const innerTuck = 1 - 0.14 * Math.exp(-0.5 * ((s - 0.44) / 0.075) ** 2) * Math.max(0, -cT);
          const ro = rO * cT * innerTuck + 0.11 * ridge + 0.022 * fEnv * sW * Math.max(0, cT);
          const rl = rL * sT * (1 - 0.35 * ridge);
          const p = pts[k].clone().addScaledVector(outD, ro).addScaledVector(latD, rl);
          const bt = fEnv > 0 && cT > -0.15 ? Math.max(0, sW) * fEnv * Math.max(0, (cT + 0.15) / 1.15) : 0;
          return { p, c: [lerp(0.21, 0.50, 0.68 * bt), lerp(0.23, 0.48, 0.68 * bt), lerp(0.19, 0.39, 0.68 * bt)] };
        }

        const handBell = smoothstep(0.32, 0.72, uHand) * (1 - 0.18 * smoothstep(0.82, 0.96, uHand));
        const tipU = clamp((uHand - 0.88) / 0.12, 0, 1);
        const tipScale = Math.sqrt(Math.max(0.03, 1 - 0.94 * (tipU ** 2)));
        const rD = (lerp(0.1469, 0.104, smoothstep(0, 0.42, uHand)) - lerp(0, 0.048, smoothstep(0.42, 0.92, uHand))) * tipScale;
        const rP = (lerp(0.1469, 0.078, smoothstep(0, 0.44, uHand)) - lerp(0, 0.030, smoothstep(0.44, 0.92, uHand))) * tipScale;
        const rL = (lerp(0.1441, 0.118, smoothstep(0, 0.36, uHand)) + 0.036 * handBell) * tipScale;

        const fEnv = smoothstep(0.48, 0.58, sOrig) * (1 - smoothstep(0.76, 0.88, sOrig)), sW = Math.sin(sOrig * Math.PI * 56);
        const dors = Math.max(0, -cT), xRel = side * sT;
        const dorsFactor = 1 + 0.06 * smoothstep(0.30, 0.62, uHand) * (1 - sT * sT);
        const tendonEnv = smoothstep(0.38, 0.58, uHand) * (1 - smoothstep(0.88, 1.0, uHand)) * (dors ** 1.15);
        const tendon =
          Math.exp(-0.5 * ((xRel + 0.62) / 0.13) ** 2) + Math.exp(-0.5 * ((xRel + 0.22) / 0.13) ** 2) +
          Math.exp(-0.5 * ((xRel - 0.18) / 0.13) ** 2) + Math.exp(-0.5 * ((xRel - 0.60) / 0.13) ** 2);
        const palmArch = 1 - 0.08 * Math.exp(-0.5 * ((uHand - 0.74) / 0.10) ** 2) * (1 - sT * sT);

        let ro = (cT >= 0 ? rP * cT * palmArch : rD * cT * dorsFactor) - 0.011 * tendonEnv * tendon;
        ro += 0.022 * fEnv * sW * Math.max(0, cT);
        const rl = rL * sT;
        const archU = smoothstep(0.68, 0.98, uHand);
        const zArch = (0.012 * (1 - sT * sT) - 0.028 * (Math.max(0, -xRel) ** 1.4) - 0.014 * (Math.max(0, xRel) ** 1.4)) * archU;
        const tipPush = 0.016 * smoothstep(0.88, 1.0, uHand) * Math.sqrt(Math.max(0, 1 - 0.5 * sT * sT - 0.5 * cT * cT));
        const p = pts[k].clone().addScaledVector(outD, ro).addScaledVector(latD, rl).addScaledVector(tan, zArch + tipPush);

        const bt = fEnv > 0 && cT > -0.15 ? Math.max(0, sW) * fEnv * Math.max(0, (cT + 0.15) / 1.15) : 0;
        let cr = lerp(0.21, 0.50, 0.68 * bt), cg = lerp(0.23, 0.48, 0.68 * bt), cb = lerp(0.19, 0.39, 0.68 * bt);
        const tdHi = clamp(tendonEnv * tendon * 0.26, 0, 0.34);
        cr = lerp(cr, 0.43, tdHi); cg = lerp(cg, 0.42, tdHi); cb = lerp(cb, 0.34, tdHi);
        const palmDark = smoothstep(0.32, 0.60, uHand) * Math.max(0, cT);
        cr = lerp(cr, 0.15, 0.50 * palmDark); cg = lerp(cg, 0.16, 0.50 * palmDark); cb = lerp(cb, 0.14, 0.50 * palmDark);
        return { p, c: [cr, cg, cb] };
      };

      const shBone = 11 + sIdx * 3, elBone = shBone + 1, wrBone = shBone + 2;
      const ring0Arm = loopVids.map((vt, m) => {
        const b = [si[vt * 4], si[vt * 4 + 1], si[vt * 4 + 2], si[vt * 4 + 3]];
        const w = [sw[vt * 4], sw[vt * 4 + 1], sw[vt * 4 + 2], sw[vt * 4 + 3]];
        return addVert(verts[vt], cols[vt], 0, (m / nR) * (2 / 3), b, w, vt, 0);
      });
      const v0 = ring0Arm[0];
      ring0Arm.push(addVert(verts[v0], cols[v0], 0, 2 / 3, [si[v0*4], si[v0*4+1], si[v0*4+2], si[v0*4+3]], [sw[v0*4], sw[v0*4+1], sw[v0*4+2], sw[v0*4+3]], loopVids[0], 0));
      let prevRing = ring0Arm;

      for (let k = 1; k < nTot; k++) {
        const sOrig = k / (nSOrig - 1), uHand = clamp((k - kJoin) / (nTot - 1 - kJoin), 0, 1), uCoord = uCoords[k], curRing = [];
        for (let m = 0; m < nR; m++) {
          const arm = evalArmPt(k, m);
          let p = arm.p, c = arm.c;
          if (k <= kB) {
            const u = k / kB, w = qstep(u);
            const pCont = loopPts[m].clone().addScaledVector(loopTans[m], u * 0.40);
            p = pCont.lerp(arm.p, w);
            const cSock = cols[loopVids[m]], tc = smoothstep(0, 0.85, u);
            c = [lerp(cSock[0], arm.c[0], tc), lerp(cSock[1], arm.c[1], tc), lerp(cSock[2], arm.c[2], tc)];
          }
          const vs = loopVids[m], sb0 = si[vs * 4], sb1 = si[vs * 4 + 1], sw0 = sw[vs * 4], sw1 = sw[vs * 4 + 1];
          let vBones, vWeights;
          if (k <= kJoin && sOrig <= 0.34) {
            const a = smoothstep(0, 0.34, sOrig);
            vBones = [sb0, sb1, shBone, 0]; vWeights = [sw0 * (1 - a), sw1 * (1 - a), a, 0];
          } else if (k <= kJoin && sOrig <= 0.38) {
            vBones = [shBone, elBone, 0, 0]; vWeights = [1, 0, 0, 0];
          } else if (k <= kJoin && sOrig <= 0.54) {
            const a = smoothstep(0.38, 0.54, sOrig);
            vBones = [shBone, elBone, 0, 0]; vWeights = [1 - a, a, 0, 0];
          } else if (k <= kJoin) {
            vBones = [elBone, wrBone, 0, 0]; vWeights = [1, 0, 0, 0];
          } else {
            const a = smoothstep(0.12, 0.48, uHand);
            vBones = [elBone, wrBone, 0, 0]; vWeights = [1 - a, a, 0, 0];
          }
          const rWt = k <= 6 ? 0.45 * smoothstep(7, 0, k) : 0;
          curRing.push(addVert(p, c, uCoord, (m / nR) * (2 / 3), vBones, vWeights, -1, rWt));
        }
        const c0 = curRing[0];
        curRing.push(addVert(verts[c0], cols[c0], uCoord, 2 / 3, [si[c0*4], si[c0*4+1], si[c0*4+2], si[c0*4+3]], [sw[c0*4], sw[c0*4+1], sw[c0*4+2], sw[c0*4+3]], c0, 0));

        for (let m = 0; m < nR; m++) {
          const a0 = prevRing[m], a1 = prevRing[m + 1], b0 = curRing[m], b1 = curRing[m + 1];
          idx.push(a0, a1, b1, a0, b1, b0);
        }
        prevRing = curRing;
      }
      const wCap = addVert(pts[nTot - 1].clone().addScaledVector(tans[nTot - 1], 0.014), [0.21, 0.23, 0.19], uCoords[nTot - 1] + 0.014 * 0.79, 1 / 3, [elBone, wrBone, 0, 0], [0, 1, 0, 0]);
      for (let m = 0; m < nR; m++) idx.push(wCap, prevRing[m], prevRing[m + 1]);
    }

    const nbrs = Array.from({ length: verts.length }, () => new Set());
    for (let t = 0; t < idx.length; t += 3) {
      const ca = canonOf[idx[t]], cb = canonOf[idx[t + 1]], cc = canonOf[idx[t + 2]];
      if (ca !== cb) { nbrs[ca].add(cb); nbrs[cb].add(ca); }
      if (cb !== cc) { nbrs[cb].add(cc); nbrs[cc].add(cb); }
      if (cc !== ca) { nbrs[cc].add(ca); nbrs[ca].add(cc); }
    }
    for (let pass = 0; pass < 4; pass++) {
      const next = verts.map(v => v.clone());
      for (let v = 0; v < verts.length; v++) {
        if (relaxWt[v] > 0 && canonOf[v] === v && nbrs[v].size > 0) {
          const avg = new THREE.Vector3();
          nbrs[v].forEach(nb => avg.add(verts[nb]));
          avg.divideScalar(nbrs[v].size);
          next[v].lerp(avg, relaxWt[v]);
        }
      }
      for (let v = 0; v < verts.length; v++) {
        verts[v] = canonOf[v] === v ? next[v] : next[canonOf[v]].clone();
      }
    }

    const posArr = [], colArr = [];
    for (let v = 0; v < verts.length; v++) {
      posArr.push(verts[v].x, verts[v].y, verts[v].z);
      colArr.push(cols[v][0], cols[v][1], cols[v][2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);

    const normArr = new Float32Array(verts.length * 3);
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      e1.subVectors(verts[b], verts[a]);
      e2.subVectors(verts[c], verts[a]);
      fn.crossVectors(e1, e2);
      for (const v of [canonOf[a], canonOf[b], canonOf[c]]) {
        normArr[v * 3] += fn.x; normArr[v * 3 + 1] += fn.y; normArr[v * 3 + 2] += fn.z;
      }
    }
    for (let v = 0; v < verts.length; v++) {
      if (canonOf[v] === v) {
        const nx = normArr[v * 3], ny = normArr[v * 3 + 1], nz = normArr[v * 3 + 2];
        const len = Math.hypot(nx, ny, nz) || 1e-8;
        normArr[v * 3] = nx / len; normArr[v * 3 + 1] = ny / len; normArr[v * 3 + 2] = nz / len;
      }
    }
    for (let v = 0; v < verts.length; v++) {
      const c = canonOf[v];
      if (c !== v) {
        normArr[v * 3] = normArr[c * 3]; normArr[v * 3 + 1] = normArr[c * 3 + 1]; normArr[v * 3 + 2] = normArr[c * 3 + 2];
      }
    }
    g.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    return g;
  }

  _buildHead(headBone) {
    const nU = 56, nV = 48, pos = [], col = [], uv = [], idx = [];
    const prof = (u) => {
      const tip = smoothstep(0.89, 1.0, u), rearT = smoothstep(0.0, 0.16, u);
      const tEnd = clamp((u - 0.93) / 0.07, 0, 1), endRound = Math.sqrt(Math.max(0.02, 1 - 0.88 * tEnd * tEnd));
      const tipFade = (1 - 0.56 * tip) * endRound;
      const hwS = (0.25 * (1 - 0.62 * u ** 1.18) + 0.055 * Math.exp(-0.5 * ((u - 0.22) / 0.10) ** 2) + 0.030 * Math.exp(-0.5 * ((u - 0.50) / 0.11) ** 2)) * tipFade;
      const hTS = (0.26 * (1 - 0.56 * u ** 1.08) + 0.03 * Math.exp(-0.5 * ((u - 0.24) / 0.14) ** 2)) * tipFade;
      return { hw: lerp(0.22, hwS, rearT), hT: lerp(0.21, hTS, rearT), hB: lerp(-0.11, -0.065 * (1 - 0.35 * u) * tipFade, rearT), z: -0.20 + 1.24 * u, tip };
    };
    const rimF = 0.35 + 0.65 * Math.exp(-0.5 * ((1 - 0.88) / 0.16) ** 2);
    for (let i = 0; i < nU; i++) {
      const u = i / (nU - 1), { hw, hT, hB, z, tip } = prof(u), yRim = hB * rimF;
      for (let j = 0; j < nV; j++) {
        const v = (j / nV) * Math.PI * 2, sV = Math.sin(v), cV = Math.cos(v);
        const bridge = 1 - 0.04 * smoothstep(0.45, 0.15, Math.abs(sV)) * smoothstep(0.25, 0.45, u);
        const yTop = yRim + (hT * bridge - yRim) * (Math.max(0, cV) ** 0.78);
        const yBot = hB * (0.35 + 0.65 * Math.exp(-0.5 * ((Math.abs(sV) - 0.88) / 0.16) ** 2)) + 0.055 * (1 - tip) * (1 - Math.abs(sV)) * Math.max(0, -cV);
        let lx = hw * sV, ly = lerp(yBot, yTop, smoothstep(-0.12, 0.08, cV));
        const horn = Math.exp(-0.5 * ((u - 0.22) / 0.085) ** 2) * Math.exp(-0.5 * ((Math.abs(sV) - 0.86) / 0.22) ** 2) * smoothstep(0.0, 0.50, cV);
        lx += Math.sign(sV) * 0.065 * horn; ly += 0.048 * horn; const zH = -0.035 * horn;
        const brow = Math.exp(-0.5 * ((u - 0.48) / 0.16) ** 2) * Math.exp(-0.5 * ((Math.abs(sV) - 0.56) / 0.15) ** 2) * smoothstep(0.35, 0.85, cV);
        ly += 0.054 * brow; lx += Math.sign(sV) * 0.028 * brow;
        const fSide = smoothstep(0.42, 0.84, Math.abs(sV));
        const fen = Math.exp(-1.5 * (((u - 0.58) / 0.11) ** 2 + ((cV - 0.36) / 0.24) ** 2)) * fSide;
        const nos = Math.exp(-2.0 * (((u - 0.87) / 0.052) ** 2 + ((cV - 0.56) / 0.22) ** 2)) * smoothstep(0.28, 0.72, Math.abs(sV));
        const eye = Math.exp(-2.2 * (((u - 0.33) / 0.052) ** 2 + ((cV - 0.24) / 0.16) ** 2)) * fSide;
        lx -= Math.sign(sV) * (0.095 * fen + 0.024 * nos + 0.046 * eye);
        ly -= (0.025 * fen + 0.015 * nos + 0.014 * eye);
        pos.push(lx, ly, z + zH); uv.push(u * 1.4, j / nV);

        const mT = smoothstep(0.14, 0.30, u) * smoothstep(-0.35, 0.15, cV);
        let cr = lerp(0.20, 0.83, mT), cg = lerp(0.22, 0.80, mT), cb = lerp(0.18, 0.72, mT);
        if (cV < -0.18 && Math.abs(sV) < 0.76 && u < 0.90) {
          const pt = Math.min(1, (-cV - 0.18) / 0.40) * smoothstep(0.76, 0.45, Math.abs(sV)) * smoothstep(0.90, 0.78, u);
          cr = lerp(cr, 0.38, pt); cg = lerp(cg, 0.12, pt); cb = lerp(cb, 0.13, pt);
        }
        const dp = clamp(fen * 1.6 + nos * 1.4 + eye * 1.25, 0, 1);
        col.push(lerp(cr, 0.04, dp), lerp(cg, 0.04, dp), lerp(cb, 0.04, dp));
      }
    }
    for (let i = 0; i < nU - 1; i++) for (let j = 0; j < nV; j++) {
      const jn = (j + 1) % nV, a = i * nV + j, b = (i + 1) * nV + j, c = (i + 1) * nV + jn, d = i * nV + jn;
      idx.push(a, b, c, a, c, d);
    }
    const rIdx = pos.length / 3; pos.push(0, 0.04, -0.22); uv.push(0, 0.5); col.push(0.20, 0.22, 0.18);
    for (let j = 0; j < nV; j++) idx.push(rIdx, j, (j + 1) % nV);
    const stIdx = pos.length / 3; pos.push(0, 0.002, 1.046); uv.push(1.4, 0.5); col.push(0.83, 0.80, 0.72);
    for (let j = 0; j < nV; j++) idx.push(stIdx, (nU - 1) * nV + ((j + 1) % nV), (nU - 1) * nV + j);
    const skGeo = new THREE.BufferGeometry();
    skGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    skGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    skGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    skGeo.setIndex(idx); skGeo.computeVertexNormals();
    const skMesh = new THREE.Mesh(skGeo, this.skinMat); skMesh.castShadow = skMesh.receiveShadow = true; headBone.add(skMesh);

    for (const sgn of [-1, 1]) {
      const eg = new THREE.Group(); eg.position.set(sgn * 0.182, 0.052, 0.205);
      eg.add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), new THREE.MeshStandardMaterial({ color: 0x4f4c24, roughness: 0.06, metalness: 0.08 })));
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), new THREE.MeshBasicMaterial({ color: 0x050504 }));
      p.scale.set(0.7, 1.15, 0.45); p.position.set(sgn * 0.014, 0, 0.004); eg.add(p); headBone.add(eg);
    }

    headBone.add(this._buildTeeth((k, inn) => {
      const u = 0.25 + 0.65 * (k / 12), { hw, z, tip } = prof(u), alt = k % 2 === 0 ? 1.12 : 0.78;
      return { z, x: hw * (inn ? 0.58 : 0.80), y: -0.050 * (1 - 0.35 * u) * (1 - 0.62 * tip) + (inn ? 0.012 : 0), dir: [-0.12, -1, -0.08], len: (inn ? 0.022 : 0.036 + 0.026 * Math.sin(u * Math.PI)) * alt, rad: inn ? 0.0075 : 0.0095 };
    }, 13, true));

    this.jawBone = new THREE.Bone(); this.jawBone.position.set(0, -0.066, 0.02); headBone.add(this.jawBone);
    this.jawBone.add(this._buildJawMesh());
    this.jawBone.add(this._buildTeeth((k, inn) => {
      const u = 0.19 + 0.70 * (k / 11), tip = smoothstep(0.88, 1.0, u);
      const tEnd = clamp((u - 0.93) / 0.07, 0, 1), endRound = Math.sqrt(Math.max(0.02, 1 - 0.86 * tEnd * tEnd));
      const hw = (0.242 * (1 - 0.65 * u ** 1.08) + 0.014 * Math.exp(-0.5 * ((u - 0.45) / 0.16) ** 2)) * (1 - 0.56 * tip) * endRound;
      const alt = k % 2 === 0 ? 1.10 : 0.78;
      return { z: -0.08 + 1.07 * u, x: hw * (inn ? 0.58 : 0.78), y: 0.022 * (1 - 0.35 * u), dir: [-0.12, 1, -0.08], len: (inn ? 0.020 : 0.032 + 0.024 * Math.sin(u * Math.PI)) * alt, rad: inn ? 0.007 : 0.0085 };
    }, 12, false));

    const gPos = [], gCol = [], gSi = [], gSw = [], gIdx = [];
    for (let i = 0; i < 14; i++) {
      const u = i / 13, z = -0.28 + 0.84 * u, rx = 0.155 * (1 - 0.28 * smoothstep(0.3, 1.0, u)), deep = 1 - smoothstep(0, 0.55, u);
      for (let j = 0; j < 20; j++) {
        const a = (j / 20) * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
        let px = rx * sa; if (u > 0.65 && Math.abs(sa) > 0.5) px *= (1 - 0.15 * (u - 0.65) / 0.35);
        const py = lerp(0.05 * (1 - 0.3 * u) + 0.04 * ca, -0.02 + 0.04 * ca, smoothstep(0.35, -0.45, ca));
        gPos.push(px, py - 0.035 * smoothstep(0.35, -0.45, ca) * smoothstep(0.08, 0.35, u), z);
        gCol.push(lerp(0.38, 0.08, deep), lerp(0.11, 0.03, deep), lerp(0.12, 0.04, deep));
        const wJ = smoothstep(0.35, -0.45, ca) * smoothstep(0.08, 0.35, u);
        gSi.push(0, 1, 0, 0); gSw.push(1 - wJ, wJ, 0, 0);
      }
    }
    for (let i = 0; i < 13; i++) for (let j = 0; j < 20; j++) {
      const jn = (j + 1) % 20, a = i*20+j, b = (i+1)*20+j, c = (i+1)*20+jn, d = i*20+jn;
      gIdx.push(a, c, b, a, d, c, a, b, c, a, c, d);
    }
    const backG = gPos.length / 3; gPos.push(0, -0.02, -0.30); gCol.push(0.05, 0.02, 0.02); gSi.push(0, 1, 0, 0); gSw.push(1, 0, 0, 0);
    for (let j = 0; j < 20; j++) { gIdx.push(backG, (j + 1) % 20, j, backG, j, (j + 1) % 20); }
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
    gGeo.setAttribute('color', new THREE.Float32BufferAttribute(gCol, 3));
    gGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(gSi, 4));
    gGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(gSw, 4));
    gGeo.setIndex(gIdx); gGeo.computeVertexNormals();
    const gMesh = new THREE.SkinnedMesh(gGeo, this.wetMat); gMesh.frustumCulled = false;
    headBone.add(gMesh); headBone.updateMatrixWorld(true); gMesh.bind(new THREE.Skeleton([headBone, this.jawBone]));

    this.tongueRoot = new THREE.Group(); this.tongueRoot.position.set(0, 0.026, 0.14); this.jawBone.add(this.tongueRoot);
    this.tongueRoot.add(new THREE.Mesh(this._tube(10, 10, t => ({ x: 0, y: 0.015 * Math.sin(t * Math.PI), z: t * 0.42, r: 0.050 * (1 - 0.32 * t), col: [lerp(0.66, 0.76, t), lerp(0.22, 0.34, t), lerp(0.24, 0.34, t)] })), this.wetMat));
    this.tongueProngs = [{ x: 0, len: 0.66, up: 0.22, r: 0.036 }, { x: 0.14, len: 0.45, up: 0.16, r: 0.026 }, { x: -0.14, len: 0.45, up: 0.16, r: 0.026 }].map(pd => {
      const piv = new THREE.Group(); piv.position.set(0, 0.006, 0.38); this.tongueRoot.add(piv);
      piv.add(new THREE.Mesh(this._tube(14, 10, t => ({ x: pd.x * (t ** 0.85), y: -0.04 * Math.sin(t * Math.PI * 0.7) + pd.up * (t ** 1.9), z: t * pd.len, r: pd.r * (1 - 0.90 * (t ** 1.3)), col: [lerp(0.74, 0.86, t), lerp(0.32, 0.50, t), lerp(0.32, 0.46, t)] })), this.wetMat));
      return piv;
    });
  }
  _buildJawMesh() {
    const nU = 34, nV = 28, pos = [], col = [], uv = [], idx = [];
    for (let i = 0; i < nU; i++) {
      const u = i / (nU - 1), tip = smoothstep(0.88, 1.0, u);
      const tEnd = clamp((u - 0.93) / 0.07, 0, 1), endRound = Math.sqrt(Math.max(0.02, 1 - 0.86 * tEnd * tEnd));
      const tipFade = (1 - 0.56 * tip) * endRound;
      const hw = (0.242 * (1 - 0.65 * u ** 1.08) + 0.014 * Math.exp(-0.5 * ((u - 0.45) / 0.16) ** 2)) * tipFade;
      const hU = 0.036 * (1 - 0.4 * u) * endRound, hD = -0.115 * (1 - 0.62 * u ** 1.05) * (1 - 0.52 * tip) * endRound;
      for (let j = 0; j < nV; j++) {
        const v = (j / nV) * Math.PI * 2, sV = Math.sin(v), cV = Math.cos(v);
        const yTop = hU * Math.exp(-0.5 * ((Math.abs(sV) - 0.85) / 0.18) ** 2) - 0.035 * (1 - tip) * (1 - Math.abs(sV)) * Math.max(0, cV);
        const yBot = hD * (Math.max(0, -cV) ** 0.85);
        const ly = lerp(yBot, yTop, smoothstep(-0.14, 0.14, cV));
        pos.push(hw * sV, ly, -0.08 + 1.07 * u); uv.push(u * 1.2, j / nV);
        if (cV > 0.08 && Math.abs(sV) < 0.72) col.push(0.42, 0.14, 0.15);
        else if (u > 0.30 && Math.abs(sV) > 0.55 && cV > -0.45) { const bt = smoothstep(0.30, 0.65, u); col.push(lerp(0.19, 0.74, bt), lerp(0.21, 0.71, bt), lerp(0.17, 0.63, bt)); }
        else col.push(0.19, 0.21, 0.17);
      }
    }
    for (let i = 0; i < nU - 1; i++) for (let j = 0; j < nV; j++) { const jn = (j + 1) % nV, a = i*nV+j, b = (i+1)*nV+j, c = (i+1)*nV+jn, d = i*nV+jn; idx.push(a, b, c, a, c, d); }
    const tipI = pos.length / 3; pos.push(0, -0.010, 0.996); uv.push(1.2, 0.5); col.push(0.74, 0.71, 0.63);
    for (let j = 0; j < nV; j++) idx.push(tipI, (nU - 1) * nV + ((j + 1) % nV), (nU - 1) * nV + j);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.skinMat); m.castShadow = m.receiveShadow = true; return m;
  }

  _buildTeeth(fn, count, inner) {
    const pos = [], col = [], idx = [];
    const cone = (base, dir, len, rad, sgn) => {
      const d = new THREE.Vector3(dir[0] * sgn, dir[1], dir[2]).normalize();
      const t1 = new THREE.Vector3().crossVectors(d, Math.abs(d.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)).normalize();
      const t2 = new THREE.Vector3().crossVectors(d, t1).normalize(), bi = pos.length / 3;
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, p = base.clone().addScaledVector(t1, rad * Math.cos(a)).addScaledVector(t2, rad * Math.sin(a)); pos.push(p.x, p.y, p.z); col.push(0.74, 0.68, 0.58); }
      const tp = base.clone().addScaledVector(d, len).add(new THREE.Vector3(0, 0, -0.012)); pos.push(tp.x, tp.y, tp.z); col.push(0.95, 0.92, 0.84);
      for (let i = 0; i < 6; i++) idx.push(bi + i, bi + ((i + 1) % 6), bi + 6);
    };
    for (let k = 0; k < count; k++) {
      const o = fn(k, false);
      for (const sgn of [-1, 1]) {
        cone(new THREE.Vector3(sgn * o.x, o.y, o.z), o.dir, o.len, o.rad, sgn);
        if (inner && k % 2 === 0) { const n = fn(k, true); cone(new THREE.Vector3(sgn * n.x, n.y, n.z), n.dir, n.len, n.rad, sgn); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals(); return new THREE.Mesh(g, this.toothMat);
  }

  _tube(nL, nR, fn) {
    const pos = [], col = [], idx = [];
    for (let i = 0; i < nL; i++) { const s = fn(i / (nL - 1)); for (let j = 0; j < nR; j++) { const a = (j / nR) * Math.PI * 2; pos.push(s.x + s.r * Math.cos(a), s.y + s.r * 0.75 * Math.sin(a), s.z); col.push(...s.col); } }
    for (let i = 0; i < nL - 1; i++) for (let j = 0; j < nR; j++) { const jn = (j + 1) % nR, a = i*nR+j, b = (i+1)*nR+j, c = (i+1)*nR+jn, d = i*nR+jn; idx.push(a, c, b, a, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }

  _boneMat(origin, target, pole) {
    const yUp = new THREE.Vector3().subVectors(origin, target).normalize();
    const zP = pole.clone().addScaledVector(yUp, -pole.dot(yUp)); if (zP.lengthSq() < 1e-6) zP.set(0, 0, -1); zP.normalize();
    const xL = new THREE.Vector3().crossVectors(yUp, zP).normalize(), zO = new THREE.Vector3().crossVectors(xL, yUp).normalize();
    return new THREE.Matrix4().makeBasis(xL, yUp, zO).setPosition(origin);
  }

  _solveIK(S, W, pole) {
    const L1 = this.L1, L2 = this.L2, dVec = new THREE.Vector3().subVectors(W, S), dist = dVec.length();
    const d = clamp(dist, Math.abs(L1 - L2) + 0.02, (L1 + L2) * 0.99), dir = dist > 1e-6 ? dVec.divideScalar(dist) : new THREE.Vector3(0, -1, 0);
    const cosA = clamp((L1*L1 + d*d - L2*L2) / (2 * L1 * d), -1, 1), a = L1 * cosA, h = L1 * Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)); if (perp.lengthSq() < 1e-6) perp.set(0, 0, -1).addScaledVector(dir, dir.z); perp.normalize();
    return { E: S.clone().addScaledVector(dir, a).addScaledVector(perp, h), W: S.clone().addScaledVector(dir, d), perp };
  }

  _buildLimbRig(side, chestBone, chestW) {
    const shLocal = new THREE.Vector3(side * 0.48, -0.05, 0), S0 = chestW.clone().add(shLocal), W0 = new THREE.Vector3(side * 0.82, 0.09, 0.06);
    const ik = this._solveIK(S0, W0, new THREE.Vector3(side * 0.68, 0.44, -0.76)), E0 = ik.E;
    const qU0 = new THREE.Quaternion().setFromRotationMatrix(this._boneMat(S0, E0, ik.perp));
    const qF0 = new THREE.Quaternion().setFromRotationMatrix(this._boneMat(E0, W0, ik.perp));
    const shB = new THREE.Bone(); shB.position.copy(shLocal); shB.quaternion.copy(qU0); chestBone.add(shB);
    const elB = new THREE.Bone(); elB.position.set(0, -this.L1, 0); elB.quaternion.copy(qU0.clone().invert().multiply(qF0)); shB.add(elB);
    const wrB = new THREE.Bone(); wrB.position.set(0, -this.L2, 0); wrB.quaternion.copy(qF0.clone().invert()); elB.add(wrB);

    const spurPiv = new THREE.Group(); elB.add(spurPiv);
    const spurMesh = new THREE.Mesh(this._tube(16, 12, t => ({ x: 0, y: -0.06 + 0.34 * t + 0.08 * t * t, z: -0.04 + 0.42 * t, r: 0.105 * ((1 - t) ** 1.25) + 0.003, col: [lerp(0.21, 0.78, smoothstep(0.25, 0.75, t)), lerp(0.23, 0.75, smoothstep(0.25, 0.75, t)), lerp(0.19, 0.66, smoothstep(0.25, 0.75, t))] })), this.skinMat);
    spurMesh.castShadow = true; spurPiv.add(spurMesh);

    const digits = [
      { ang: -0.76 * side, len: 0.28, rad: 0.050, xo: -0.080, zo: 0.148 },
      { ang: -0.25 * side, len: 0.56, rad: 0.062, xo: -0.038, zo: 0.184 },
      { ang:  0.15 * side, len: 0.64, rad: 0.066, xo:  0.024, zo: 0.186 },
      { ang:  0.58 * side, len: 0.52, rad: 0.058, xo:  0.084, zo: 0.170 },
    ].map(ds => {
      const dp = new THREE.Group(); dp.position.set(side * ds.xo, -0.026, ds.zo); dp.rotation.y = ds.ang; wrB.add(dp);
      const nL = 16, nRg = 12, dPos = [], dCol = [], dUv = [], dIdx = [];
      for (let i = 0; i < nL; i++) {
        const t = i / (nL - 1), ct = Math.max(0, (t - 0.70) / 0.30), ft = Math.min(1, t / 0.70);
        const knk = Math.max(0, 0.016 * Math.sin(ft * Math.PI * 2.5)), sb = 0.5 + 0.5 * Math.sin(ft * Math.PI * 10);
        const prox = 0.72 + 0.28 * smoothstep(0, 0.12, t);
        const yC = t < 0.70 ? lerp(0.0, -0.036, ft) + knk : lerp(-0.036, -0.060, ct ** 0.65);
        const rad = (t < 0.70 ? ds.rad * (1 - 0.38 * ft) + 0.010 * Math.max(0, Math.sin(ft * Math.PI * 3)) : ds.rad * 0.62 * (1 - 0.92 * ct)) * prox;
        const col = t < 0.70
          ? [lerp(0.22, 0.42, sb * 0.5), lerp(0.23, 0.41, sb * 0.5), lerp(0.20, 0.34, sb * 0.5)]
          : [lerp(0.14, 0.58, 0.35 * ct), lerp(0.13, 0.54, 0.35 * ct), lerp(0.11, 0.46, 0.35 * ct)];
        for (let j = 0; j <= nRg; j++) {
          const jw = j % nRg, a = (jw / nRg) * Math.PI * 2;
          dPos.push(rad * Math.cos(a), yC + rad * 0.75 * Math.sin(a), t * ds.len);
          dCol.push(...col); dUv.push(t * ds.len * 0.79, (j / nRg) * (2 / 3));
        }
      }
      const stride = nRg + 1;
      for (let i = 0; i < nL - 1; i++) for (let j = 0; j < nRg; j++) {
        const a = i * stride + j, b = (i + 1) * stride + j, c = (i + 1) * stride + j + 1, d = i * stride + j + 1;
        dIdx.push(a, c, b, a, d, c);
      }
      const bc = dPos.length / 3; dPos.push(0, 0, -0.006); dCol.push(0.22, 0.23, 0.19); dUv.push(0, 1 / 3);
      for (let j = 0; j < nRg; j++) dIdx.push(bc, j + 1, j);
      const dGeo = new THREE.BufferGeometry();
      dGeo.setAttribute('position', new THREE.Float32BufferAttribute(dPos, 3));
      dGeo.setAttribute('color', new THREE.Float32BufferAttribute(dCol, 3));
      dGeo.setAttribute('uv', new THREE.Float32BufferAttribute(dUv, 2));
      dGeo.setIndex(dIdx); dGeo.computeVertexNormals();
      const nAttr = dGeo.getAttribute('normal');
      for (let i = 0; i < nL; i++) {
        const i0 = i * stride, i1 = i0 + nRg;
        const nx = nAttr.getX(i0) + nAttr.getX(i1), ny = nAttr.getY(i0) + nAttr.getY(i1), nz = nAttr.getZ(i0) + nAttr.getZ(i1);
        const len = Math.hypot(nx, ny, nz) || 1e-8;
        nAttr.setXYZ(i0, nx / len, ny / len, nz / len); nAttr.setXYZ(i1, nx / len, ny / len, nz / len);
      }
      const dm = new THREE.Mesh(dGeo, this.skinMat);
      dm.castShadow = dm.receiveShadow = true; dp.add(dm); return dp;
    });
    return { side, shLocal, shB, elB, wrB, spurPiv, digits };
  }

  _sampleIdle(t) {
    const ph = t * 1.65;
    const tY = Array(6).fill(0);
    for (let i = 0; i < 6; i++) tY[i] = 0.07 * Math.sin(t * 1.2 - i * 0.55);
    return {
      pOff: new THREE.Vector3(0, 0.032 * Math.sin(ph), 0),
      pRot: new THREE.Euler(0, 0, 0, 'YXZ'),
      chRot: new THREE.Vector3(0.03 * Math.sin(ph - 0.5), 0, 0),
      n1Rot: new THREE.Vector3(0, 0.11 * Math.sin(t * 0.72), 0),
      n2Rot: new THREE.Vector3(),
      hRot: new THREE.Vector3(-0.04 * Math.cos(t * 1.1), 0.14 * Math.sin(t * 0.72 - 0.45), 0),
      jaw: 0.18 + 0.07 * Math.sin(ph),
      tOut: 0.08 + 0.06 * Math.sin(t * 1.8),
      tWhip: 0,
      tP: Array(6).fill(0),
      tY,
      tR: Array(6).fill(0),
      wL: new THREE.Vector3(0.82, 0.09, 0.06),
      wR: new THREE.Vector3(-0.82, 0.09, 0.06),
      swL: 0,
      swR: 0,
    };
  }

  _sampleWalkPhase(phL) {
    const phR = phL + Math.PI;
    const foot = (ph, s) => {
      const u = ((ph % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
      if (u < 0.58) {
        const st = u / 0.58;
        return [new THREE.Vector3(s * (0.82 + 0.04 * Math.sin(st * Math.PI)), 0.09, lerp(0.62, -0.46, st)), 0];
      }
      const sw = (u - 0.58) / 0.42;
      return [new THREE.Vector3(s * (0.82 + 0.10 * Math.sin(sw * Math.PI)), 0.09 + 0.46 * (Math.sin(sw * Math.PI) ** 0.85), lerp(-0.46, 0.62, 0.5 - 0.5 * Math.cos(sw * Math.PI))), Math.sin(sw * Math.PI)];
    };
    const [wL, swL] = foot(phL, 1), [wR, swR] = foot(phR, -1);
    const tP = Array(6).fill(0), tY = Array(6).fill(0), tR = Array(6).fill(0);
    for (let i = 0; i < 6; i++) {
      tY[i] = 0.16 * Math.sin(phL - i * 0.72 + 0.4);
      tR[i] = 0.04 * Math.cos(phL - i * 0.6);
      tP[i] = 0.015 * Math.sin(2 * phL - i * 0.5);
    }
    return {
      pOff: new THREE.Vector3(0.09 * Math.sin(phL), 0.075 * Math.cos(2 * phL) - 0.035, 0.03 * Math.sin(2 * phL)),
      pRot: new THREE.Euler(0.03 * Math.sin(2 * phL), -0.10 * Math.cos(phL), 0.09 * Math.sin(phL), 'YXZ'),
      chRot: new THREE.Vector3(0.05 * Math.sin(2 * phL), 0.16 * Math.cos(phL), -0.05 * Math.sin(phL)),
      n1Rot: new THREE.Vector3(0.04 * Math.sin(2 * phL + 0.4), -0.08 * Math.cos(phL), 0),
      n2Rot: new THREE.Vector3(),
      hRot: new THREE.Vector3(-0.07 * Math.sin(2 * phL + 0.6), -0.05 * Math.cos(phL), 0),
      jaw: 0.24 + 0.08 * Math.sin(2 * phL),
      tOut: 0.10 + 0.05 * Math.sin(2 * phL),
      tWhip: 0,
      tP, tY, tR,
      wL, wR, swL, swR,
    };
  }

  _sampleRunPhase(phL) {
    const phR = phL + Math.PI * 0.74, bPh = phL - 0.05 * Math.PI;
    const foot = (ph, s) => {
      const u = ((ph % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
      if (u < 0.42) return [new THREE.Vector3(s * 0.80, 0.09, lerp(0.84, -0.54, u / 0.42)), 0];
      const sw = (u - 0.42) / 0.58, lift = Math.sin(sw * Math.PI);
      return [new THREE.Vector3(s * (0.80 + 0.12 * lift), 0.09 + 0.48 * (lift ** 0.85), lerp(-0.54, 0.84, 0.5 - 0.5 * Math.cos(sw * Math.PI))), 0.42 * lift * smoothstep(0.15, 0.65, lift)];
    };
    const [wL, swL] = foot(phL, 1), [wR, swR] = foot(phR, -1);
    const tP = Array(6).fill(0), tY = Array(6).fill(0), tR = Array(6).fill(0);
    for (let i = 0; i < 6; i++) {
      tY[i] = 0.22 * Math.sin(phL - i * 0.85);
      tP[i] = -0.05 * Math.cos(bPh - i * 0.6);
    }
    return {
      pOff: new THREE.Vector3(0.07 * Math.sin(phL), -0.03 - 0.08 * Math.cos(bPh), 0.10 * Math.sin(bPh)),
      pRot: new THREE.Euler(0.06 + 0.08 * Math.sin(bPh), 0.08 * Math.sin(phL), 0.05 * Math.cos(phL), 'YXZ'),
      chRot: new THREE.Vector3(-0.07 * Math.sin(bPh), -0.11 * Math.sin(phL), 0),
      n1Rot: new THREE.Vector3(-0.07 - 0.06 * Math.sin(bPh), 0, 0),
      n2Rot: new THREE.Vector3(),
      hRot: new THREE.Vector3(0.08 * Math.sin(bPh), 0, 0),
      jaw: 0.40 + 0.14 * Math.sin(bPh),
      tOut: 0.18 + 0.10 * Math.sin(bPh),
      tWhip: 0,
      tP, tY, tR,
      wL, wR, swL, swR,
    };
  }

  _sampleScreamTime(t) {
    const u = (t % this.screamDuration) / this.screamDuration;
    const rear = Math.sin(clamp((u - 0.04) / 0.84, 0, 1) * Math.PI) ** 0.65;
    const trm = Math.sin(t * 50) * rear, swp = Math.sin(u * Math.PI * 3) * rear;
    const tOut = 0.12 + 0.88 * smoothstep(0.14, 0.58, rear);
    const tP = Array(6).fill(0), tY = Array(6).fill(0), tR = Array(6).fill(0);
    for (let i = 0; i < 6; i++) {
      tP[i] = 0.075 * rear + 0.03 * Math.sin(t * 4.5 - i * 0.7) * rear;
      tY[i] = 0.19 * Math.sin(t * 3.8 - i * 0.65) * (0.3 + 0.7 * rear);
      tR[i] = 0.06 * Math.cos(t * 3.8 - i * 0.6);
    }
    return {
      pOff: new THREE.Vector3(0, 0.14 * rear, -0.14 * rear),
      pRot: new THREE.Euler(-0.28 * rear, 0.06 * swp, 0.04 * swp, 'YXZ'),
      chRot: new THREE.Vector3(-0.20 * rear + 0.02 * trm, 0.10 * swp, 0),
      n1Rot: new THREE.Vector3(-0.16 * rear, 0.16 * swp, 0),
      n2Rot: new THREE.Vector3(-0.10 * rear, 0.12 * swp, 0),
      hRot: new THREE.Vector3(-0.22 * rear + 0.03 * trm, 0.12 * swp, 0.08 * swp),
      jaw: 0.20 + 0.92 * rear + 0.06 * trm,
      tOut,
      tWhip: Math.sin(t * 14) * tOut,
      tP, tY, tR,
      wL: new THREE.Vector3(0.92, 0.09, 0.22),
      wR: new THREE.Vector3(-0.92, 0.09, 0.22),
      swL: 0,
      swR: 0,
    };
  }

  _samplePose(mode, t) {
    if (mode === 'walk') return this._sampleWalkPhase(t * 0.90 * Math.PI * 2);
    if (mode === 'run') return this._sampleRunPhase(t * 2.10 * Math.PI * 2);
    if (mode === 'scream') return this._sampleScreamTime(t);
    return this._sampleIdle(t);
  }

  _applyTurnLean(pose, tb) {
    pose.pRot.y += 0.05 * tb;
    pose.pRot.z -= 0.04 * tb;
    pose.chRot.y += 0.14 * tb;
    pose.chRot.z -= 0.07 * tb;
    pose.n1Rot.y += 0.17 * tb;
    pose.n2Rot.y += 0.14 * tb;
    pose.hRot.y += 0.18 * tb;
    pose.hRot.z -= 0.07 * tb;
    for (let i = 0; i < 6; i++) {
      pose.tY[i] -= 0.10 * tb * (0.65 + 0.07 * i);
      pose.tR[i] += 0.04 * tb;
    }
  }

  _sampleLocomotionPose() {
    const idlePose = this._sampleIdle(this.time);
    if (this.moveBlend <= 1e-3 && this.turnStepBlend <= 1e-3) {
      if (Math.abs(this.turnBlend) > 1e-3) this._applyTurnLean(idlePose, this.turnBlend);
      return idlePose;
    }
    const walkPose = this._sampleWalkPhase(this.gaitPhase);
    const movePose = this.runBlend > 1e-3
      ? this._blendPoses(walkPose, this._sampleRunPhase(this.gaitPhase), this.runBlend)
      : walkPose;
    let locoPose = movePose;
    let locoWeight = this.moveBlend;
    if (this.turnStepBlend > 1e-3) {
      const turnStepPose = this._sampleWalkPhase(this.gaitPhase);
      turnStepPose.wL.z = lerp(0.06, turnStepPose.wL.z, 0.35);
      turnStepPose.wR.z = lerp(0.06, turnStepPose.wR.z, 0.35);
      turnStepPose.wL.x += 0.06 * turnStepPose.swL;
      turnStepPose.wR.x -= 0.06 * turnStepPose.swR;
      const stepRatio = this.turnStepBlend / Math.max(this.moveBlend + this.turnStepBlend, 1e-5);
      locoPose = this._blendPoses(movePose, turnStepPose, stepRatio);
      locoWeight = clamp(this.moveBlend + 0.78 * this.turnStepBlend, 0, 1);
    }
    const pose = this._blendPoses(idlePose, locoPose, smoothstep(0, 1, locoWeight));
    if (Math.abs(this.turnBlend) > 1e-3) this._applyTurnLean(pose, this.turnBlend);
    return pose;
  }

  _evalAttackKeys(keys, u) {
    if (u <= keys[0][0]) return keys[0][1];
    if (u >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
      if (u <= t1) return lerp(v0, v1, smoothstep(t0, t1, u));
    }
    return keys[keys.length - 1][1];
  }
  
_sampleAttackPose(uRaw) {
    const u = clamp(uRaw, 0, 1);
    const k = (keys, uu = u) => this._evalAttackKeys(keys, uu);
    const T = [0.00, 0.12, 0.24, 0.36, 0.48, 0.60, 0.74, 0.88, 1.00];
    const sp = (ys, uu = u) => evalSpline(T, ys, uu);

    const pOffX = sp([0.00,  0.04,  0.08, -0.02, -0.07,  0.04,  0.02,  0.00, 0.00]);
    const pOffY = sp([0.00, -0.10, -0.22, -0.06,  0.04, -0.05,  0.05,  0.01, 0.00]);
    const pOffZ = sp([0.00, -0.18, -0.44,  0.16,  0.76,  0.58, -0.24, -0.08, 0.00]);

    const pRotX = sp([0.00, -0.03, -0.08,  0.04,  0.11,  0.08, -0.06, -0.02, 0.00]);
    const pRotY = sp([0.00, -0.04, -0.08,  0.02,  0.07, -0.05, -0.03,  0.00, 0.00]);
    const pRotZ = sp([0.00, -0.02, -0.05,  0.02,  0.05, -0.04, -0.02,  0.00, 0.00]);

    const lagDamp = 1 - smoothstep(0.70, 0.96, u);
    const uCh = clamp(u - 0.015 * lagDamp, 0, 1);
    const chRotX = sp([0.00, -0.05, -0.12,  0.02,  0.16,  0.12, -0.09, -0.03, 0.00], uCh);
    const chRotY = sp([0.00,  0.05,  0.10, -0.02, -0.09,  0.06,  0.02,  0.00, 0.00], uCh);
    const chRotZ = sp([0.00,  0.03,  0.06, -0.02, -0.06,  0.05,  0.02,  0.00, 0.00], uCh);

    const uNk = clamp(u - 0.025 * lagDamp, 0, 1);
    const n1RotX = sp([0.00,  0.14,  0.28, -0.04, -0.13, -0.02, -0.08, -0.02, 0.00], uNk);
    const n1RotY = sp([0.00,  0.05,  0.10,  0.02, -0.08,  0.09,  0.03,  0.00, 0.00], uNk);
    const n2RotX = sp([0.00,  0.11,  0.22, -0.03, -0.12, -0.02, -0.06, -0.02, 0.00], uNk);
    const n2RotY = sp([0.00,  0.04,  0.08,  0.02, -0.07,  0.08,  0.02,  0.00, 0.00], uNk);

    const uHd = clamp(u - 0.035 * lagDamp, 0, 1);
    const hRotX  = sp([0.00,  0.12,  0.26, -0.10, -0.18,  0.06, -0.10, -0.03, 0.00], uHd);
    const hRotY  = sp([0.00, -0.06, -0.12,  0.04,  0.10, -0.16, -0.04,  0.02, 0.00], uHd);
    const hRotZ  = sp([0.00, -0.08, -0.16,  0.05,  0.14, -0.18, -0.05,  0.00, 0.00], uHd);

    const jaw    = k([[0.00, 0.20], [0.18, 0.12], [0.36, 0.88], [0.45, 1.12], [0.51, 0.02], [0.62, 0.03], [0.78, 0.16], [1.00, 0.20]]);
    const tOut   = k([[0.00, 0.04], [0.22, 0.02], [0.39, 0.26], [0.46, 0.00], [0.66, 0.00], [1.00, 0.05]]);
    const tWhip  = Math.sin(u * Math.PI * 6) * smoothstep(0.24, 0.40, u) * (1 - smoothstep(0.43, 0.48, u));

    const wLz   = sp([0.06, -0.06, -0.22, 0.28, 0.74, 0.58, -0.12, 0.00, 0.06]);
    const wLx   = sp([0.82,  0.86,  0.90, 0.82, 0.78, 0.80,  0.88, 0.84, 0.82]);
    const liftL = Math.max(0, evalSpline([0.00, 0.22, 0.34, 0.47, 0.60, 0.70, 0.80, 0.90, 1.00], [0.00, 0.00, 0.40, 0.00, 0.00, 0.22, 0.00, 0.06, 0.00], u));

    const wRz   = sp([0.06, -0.04, -0.18, 0.20, 0.62, 0.50, -0.08, 0.02, 0.06]);
    const wRx   = sp([0.82,  0.86,  0.90, 0.84, 0.82, 0.82,  0.88, 0.84, 0.82]);
    const liftR = Math.max(0, evalSpline([0.00, 0.25, 0.37, 0.49, 0.62, 0.72, 0.82, 0.92, 1.00], [0.00, 0.00, 0.34, 0.00, 0.00, 0.19, 0.00, 0.05, 0.00], u));

    const delayDamp = 1 - smoothstep(0.76, 0.96, u);
    const tP = [], tY = [], tR = [];
    for (let i = 0; i < 6; i++) {
      const us = clamp(u - (5 - i) * 0.018 * delayDamp, 0, 1);
      const tpVal = sp([0.00, 0.02, 0.045, 0.08, 0.13, 0.10, 0.03, 0.00, 0.00], us);
      const tyVal = sp([0.00, 0.06, 0.13, -0.04, -0.18, 0.12, 0.07, -0.02, 0.00], us) * (1 - 0.06 * i);
      tP.push(tpVal); tY.push(tyVal); tR.push(0.28 * tyVal);
    }

    return {
      pOff: new THREE.Vector3(pOffX, pOffY, pOffZ),
      pRot: new THREE.Euler(pRotX, pRotY, pRotZ, 'YXZ'),
      chRot: new THREE.Vector3(chRotX, chRotY, chRotZ),
      n1Rot: new THREE.Vector3(n1RotX, n1RotY, 0),
      n2Rot: new THREE.Vector3(n2RotX, n2RotY, 0),
      hRot: new THREE.Vector3(hRotX, hRotY, hRotZ),
      jaw, tOut, tWhip, tP, tY, tR,
      wL: new THREE.Vector3(wLx, 0.09 + liftL, wLz),
      wR: new THREE.Vector3(-wRx, 0.09 + liftR, wRz),
      swL: clamp(liftL / 0.40, 0, 1),
      swR: clamp(liftR / 0.34, 0, 1),
    };
  }
  
  _evalTurnStep(u, phases) {
    let ang = phases[0][2];
    for (let i = 0; i < phases.length; i++) {
      const [u0, u1, a0, a1, lh, ro] = phases[i];
      if (u < u0) break;
      if (u <= u1) {
        const t = (u - u0) / (u1 - u0);
        const s = smootherstep(0, 1, t);
        const sw = Math.sin(Math.PI * t);
        return { ang: lerp(a0, a1, s), lift: lh * (sw ** 0.85), rad: ro * sw, sw };
      }
      ang = a1;
    }
    return { ang, lift: 0, rad: 0, sw: 0 };
  }

  _turnGroupYawMag(u) {
    const phIn = [[0.14, 0.34, 0, Math.PI * 0.40, 0.32, 0.08], [0.52, 0.72, Math.PI * 0.40, Math.PI, 0.34, 0.08]];
    const phOut = [[0.32, 0.54, 0, Math.PI * (118 / 180), 0.35, 0.10], [0.70, 0.88, Math.PI * (118 / 180), Math.PI, 0.28, 0.06]];
    const aIn = this._evalTurnStep(u, phIn).ang;
    const aOut = this._evalTurnStep(u, phOut).ang;
    return lerp(0.5 * (aIn + aOut), Math.PI * smootherstep(0.14, 0.88, u), 0.40);
  }

  _turnPelvisWorldYawMag(u) {
    const g = this._turnGroupYawMag(u);
    const antic = -0.055 * Math.sin(Math.PI * smootherstep(0.0, 0.18, u));
    const lag = -0.075 * Math.sin(Math.PI * smootherstep(0.14, 0.86, u));
    const settle = 0.025 * Math.sin(2.0 * Math.PI * smootherstep(0.78, 0.99, u)) * (1.0 - smootherstep(0.86, 0.995, u));
    return g + antic + lag + settle;
  }

  _sampleTurnPose(uRaw, dir) {
    const u = clamp(uRaw, 0, 1);
    const k = (keys) => this._evalAttackKeys(keys, u);
    const phIn = [[0.14, 0.34, 0, Math.PI * 0.40, 0.32, 0.08], [0.52, 0.72, Math.PI * 0.40, Math.PI, 0.34, 0.08]];
    const phOut = [[0.32, 0.54, 0, Math.PI * (118 / 180), 0.35, 0.10], [0.70, 0.88, Math.PI * (118 / 180), Math.PI, 0.28, 0.06]];

    const gYawMag = this._turnGroupYawMag(u);
    const gYaw = dir * gYawMag;
    const wPelvisMag = this._turnPelvisWorldYawMag(u);
    const chLead = 0.14 * Math.sin(Math.PI * smootherstep(0.08, 0.82, u));
    const chSettle = 0.028 * Math.sin(Math.PI * smootherstep(0.80, 0.96, u)) * (1.0 - smootherstep(0.88, 0.98, u));
    const wChestMag = gYawMag + chLead + chSettle;

    const wHeadMag = Math.PI * smootherstep(0.03, 0.62, u) + 0.085 * Math.sin(Math.PI * smootherstep(0.42, 0.90, u)) * (1.0 - smootherstep(0.82, 0.97, u));
    const wN2Mag = lerp(wChestMag, wHeadMag, 0.64);
    const wN1Mag = lerp(wChestMag, wHeadMag, 0.30);

    const pRotY = dir * (wPelvisMag - gYawMag);
    const chRotY = dir * (wChestMag - wPelvisMag);
    const n1RotY = dir * (wN1Mag - wChestMag);
    const n2RotY = dir * (wN2Mag - wN1Mag);
    const hRotY = dir * (wHeadMag - wN2Mag);

    const pOffX = dir * k([[0.00, 0.00], [0.11, -0.13], [0.24, -0.09], [0.35, 0.04], [0.44, 0.11], [0.54, 0.00], [0.63, -0.09], [0.72, 0.02], [0.80, 0.07], [0.91, -0.015], [1.00, 0.00]]);
    const pOffY = k([[0.00, 0.00], [0.12, -0.12], [0.24, -0.07], [0.34, -0.13], [0.44, -0.07], [0.54, -0.12], [0.63, -0.06], [0.73, -0.10], [0.82, -0.04], [0.92, 0.015], [1.00, 0.00]]);
    const pOffZ = k([[0.00, 0.00], [0.12, -0.06], [0.45, 0.03], [0.82, 0.02], [1.00, 0.00]]);

    const pRotX = k([[0.00, 0.00], [0.13, 0.045], [0.50, 0.055], [0.85, 0.02], [0.94, -0.015], [1.00, 0.00]]);
    const pRotZ = dir * k([[0.00, 0.00], [0.12, 0.055], [0.34, -0.070], [0.68, -0.055], [0.88, -0.015], [0.95, 0.010], [1.00, 0.00]]);

    const chRotX = k([[0.00, 0.00], [0.14, 0.03], [0.55, 0.04], [0.90, -0.01], [1.00, 0.00]]);
    const chRotZ = dir * k([[0.00, 0.00], [0.14, 0.02], [0.45, -0.05], [0.85, -0.02], [1.00, 0.00]]);
    const n1RotX = k([[0.00, 0.00], [0.16, -0.04], [0.55, -0.03], [0.90, 0.01], [1.00, 0.00]]);
    const n2RotX = k([[0.00, 0.00], [0.18, -0.03], [0.55, -0.02], [1.00, 0.00]]);
    const hRotX = k([[0.00, 0.00], [0.14, 0.05], [0.45, -0.04], [0.85, -0.02], [1.00, 0.00]]);
    const hRotZ = dir * (-0.11 * Math.sin(Math.PI * smoothstep(0.04, 0.90, u)));

    const driveEnv = Math.sin(Math.PI * smoothstep(0.05, 0.92, u));
    const jaw = 0.20 + 0.09 * driveEnv;
    const tOut = 0.08 + 0.07 * driveEnv;
    const tWhip = dir * 0.45 * Math.sin(Math.PI * smoothstep(0.04, 0.65, u));

    const tP = Array(6).fill(0), tY = Array(6).fill(0), tR = Array(6).fill(0);
    const sweepPitch = Math.sin(Math.PI * smoothstep(0.16, 0.94, u));
    let prevMag = wPelvisMag;
    for (let seg = 1; seg <= 6; seg++) {
      const lag = 0.028 * seg * (1.0 - smootherstep(0.55, 0.95, u));
      const baseSeg = this._turnPelvisWorldYawMag(clamp(u - lag, 0, 1));
      const whipEnv = smootherstep(0.73 + 0.012 * seg, 0.86 + 0.010 * seg, u) * (1.0 - smootherstep(0.87 + 0.010 * seg, 0.985, u));
      const rebound = -0.018 * (seg / 6) * smootherstep(0.92, 0.96, u) * (1.0 - smootherstep(0.96, 0.998, u));
      const wSegMag = baseSeg + (0.036 * seg) * whipEnv + rebound;
      const localYaw = dir * (wSegMag - prevMag);
      prevMag = wSegMag;
      const idx = 6 - seg;
      tY[idx] = localYaw;
      tP[idx] = (seg <= 3 ? 0.024 : 0.014) * sweepPitch;
      tR[idx] = 0.22 * localYaw;
    }

    const stIn = this._evalTurnStep(u, phIn);
    const stOut = this._evalTurnStep(u, phOut);
    const stL = dir === 1 ? stIn : stOut;
    const stR = dir === 1 ? stOut : stIn;
    const aL = dir * stL.ang, aR = dir * stR.ang;
    const piv = new THREE.Vector3(0, 0, this.pivotLocalZ);

    const wL = new THREE.Vector3(0.82 + stL.rad, 0.09, 0.06).sub(piv).applyAxisAngle(UP_AXIS, aL - gYaw).add(piv);
    wL.y = 0.09 + stL.lift;
    const wR = new THREE.Vector3(-0.82 - stR.rad, 0.09, 0.06).sub(piv).applyAxisAngle(UP_AXIS, aR - gYaw).add(piv);
    wR.y = 0.09 + stR.lift;

    const wYawL = (aL - gYaw) + pRotY * 0.25;
    const wYawR = (aR - gYaw) + pRotY * 0.25;
    const poleYawL = lerp(pRotY + chRotY * 0.4, aL - gYaw, 0.5);
    const poleYawR = lerp(pRotY + chRotY * 0.4, aR - gYaw, 0.5);

    return {
      groupYawOffset: gYaw,
      pOff: new THREE.Vector3(pOffX, pOffY, pOffZ),
      pRot: new THREE.Euler(pRotX, pRotY, pRotZ, 'YXZ'),
      chRot: new THREE.Vector3(chRotX, chRotY, chRotZ),
      n1Rot: new THREE.Vector3(n1RotX, n1RotY, 0),
      n2Rot: new THREE.Vector3(n2RotX, n2RotY, 0),
      hRot: new THREE.Vector3(hRotX, hRotY, hRotZ),
      jaw, tOut, tWhip, tP, tY, tR,
      wL, wR, swL: stL.sw, swR: stR.sw,
      wYawL, wYawR, poleYawL, poleYawR,
    };
  }

  _blendPoses(pr, cur, a) {
    if (!pr || a >= 1) return cur;
    return {
      pOff: pr.pOff.clone().lerp(cur.pOff, a),
      pRot: new THREE.Euler(lerp(pr.pRot.x, cur.pRot.x, a), lerp(pr.pRot.y, cur.pRot.y, a), lerp(pr.pRot.z, cur.pRot.z, a), 'YXZ'),
      chRot: pr.chRot.clone().lerp(cur.chRot, a), n1Rot: pr.n1Rot.clone().lerp(cur.n1Rot, a),
      n2Rot: pr.n2Rot.clone().lerp(cur.n2Rot, a), hRot: pr.hRot.clone().lerp(cur.hRot, a),
      jaw: lerp(pr.jaw, cur.jaw, a), tOut: lerp(pr.tOut, cur.tOut, a), tWhip: lerp(pr.tWhip, cur.tWhip, a),
      tP: pr.tP.map((v, i) => lerp(v, cur.tP[i], a)), tY: pr.tY.map((v, i) => lerp(v, cur.tY[i], a)), tR: pr.tR.map((v, i) => lerp(v, cur.tR[i], a)),
      wL: pr.wL.clone().lerp(cur.wL, a), wR: pr.wR.clone().lerp(cur.wR, a), swL: lerp(pr.swL, cur.swL, a), swR: lerp(pr.swR, cur.swR, a),
      wYawL: lerp(pr.wYawL ?? pr.pRot.y * 0.6, cur.wYawL ?? cur.pRot.y * 0.6, a),
      wYawR: lerp(pr.wYawR ?? pr.pRot.y * 0.6, cur.wYawR ?? cur.pRot.y * 0.6, a),
      poleYawL: lerp(pr.poleYawL ?? pr.pRot.y, cur.poleYawL ?? cur.pRot.y, a),
      poleYawR: lerp(pr.poleYawR ?? pr.pRot.y, cur.poleYawR ?? cur.pRot.y, a),
    };
  }

  _getCurrentPose() {
    let cur;
    if (this.turnActive) cur = this._sampleTurnPose(this.turnTime / this.turnDuration, this.turnDir);
    else if (this.attackActive) cur = this._sampleAttackPose(this.attackTime / this.attackDuration);
    else if (this.screamActive) cur = this._sampleScreamTime(this.screamTime);
    else if (this._usingInput) cur = this._sampleLocomotionPose();
    else cur = this._samplePose(this.targetAnim, this.time);
    return (this.blend < 1 && this.prevPose)
      ? this._blendPoses(this.prevPose, cur, smoothstep(0, 1, this.blend))
      : cur;
  }

  update(dt, input = null) {
    this.time += dt * this.speed;
    this._usingInput = Boolean(input);
    const blendRate = this.turnActive ? 6 * Math.max(1, this.speed) : (this.attackActive ? 5.5 * Math.max(1, this.speed) : 4.5 * Math.max(1, this.speed));
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt * blendRate);

    if (input && !this.turnActive) {
      const forwardIn = clamp(input.forward ?? 0, 0, 1);
      const turnIn = clamp(input.turn ?? 0, -1, 1);
      const runIn = Boolean(input.run);

      if (this.screamActive && this.screamTime / this.screamDuration > 0.74 && forwardIn > 0.25) {
        this.prevPose = this._getCurrentPose();
        this.screamActive = false;
        this.blend = 0;
        if (this.onScreamEnd) this.onScreamEnd();
      }

      const moveTarget = this.screamActive ? 0 : forwardIn;
      const turnTarget = this.screamActive ? turnIn * 0.25 : turnIn;
      const kMove = 1 - Math.exp(-9.5 * dt);
      const kRun = 1 - Math.exp(-6.5 * dt);
      const kTurn = 1 - Math.exp(-10.0 * dt);

      this.moveBlend = lerp(this.moveBlend, moveTarget, kMove);
      if (this.moveBlend < 1e-4 && moveTarget === 0) this.moveBlend = 0;
      this.runBlend = lerp(this.runBlend, runIn ? 1 : 0, kRun);
      this.turnBlend = lerp(this.turnBlend, turnTarget, kTurn);
      if (Math.abs(this.turnBlend) < 1e-4 && turnTarget === 0) this.turnBlend = 0;
      const turnStepTarget = Math.abs(turnTarget) * (1 - clamp(moveTarget * 2, 0, 1));
      this.turnStepBlend = lerp(this.turnStepBlend, turnStepTarget, kMove);

      const walkBaseSpeed = 2.35;
      const runBaseSpeed = 6.90;
      const attackScale = this.attackActive ? 0.35 : 1.0;
      const forwardSpeed = lerp(walkBaseSpeed, runBaseSpeed, this.runBlend) * this.moveBlend * this.speed * attackScale;
      const turnAngSpeed = lerp(1.95, 1.55, this.moveBlend * this.runBlend) * this.speed;

      this.facingYaw = this._normalizeAngle(this.facingYaw + this.turnBlend * turnAngSpeed * dt);
      this.group.rotation.y = this.facingYaw;
      this.group.position.x += Math.sin(this.facingYaw) * forwardSpeed * dt;
      this.group.position.z += Math.cos(this.facingYaw) * forwardSpeed * dt;
      if (input.bounds != null) {
        this.group.position.x = clamp(this.group.position.x, -input.bounds, input.bounds);
        this.group.position.z = clamp(this.group.position.z, -input.bounds, input.bounds);
      }

      const stridePerCycle = lerp(1.08 / 0.58, 1.38 / 0.42, this.runBlend);
      const moveFreq = forwardSpeed / stridePerCycle;
      const turnStepFreq = 0.92 * Math.abs(this.turnBlend) * this.turnStepBlend * this.speed;
      this.gaitPhase = (this.gaitPhase + dt * Math.max(moveFreq, turnStepFreq) * Math.PI * 2) % (Math.PI * 2);
    }

    let cur;
    if (this.turnActive) {
      this.turnTime += dt * this.speed;
      const u = this.turnTime / this.turnDuration;
      if (u >= 1) {
        const endPose = this._sampleTurnPose(1, this.turnDir);
        this.prevPose = this._blendPoses(this.prevPose, endPose, smoothstep(0, 1, this.blend));
        this.facingYaw = this._normalizeAngle(this.turnTargetYaw);
        const pivOff = new THREE.Vector3(0, 0, this.pivotLocalZ).applyAxisAngle(UP_AXIS, this.facingYaw);
        this.group.position.copy(this.turnPivotWorld).sub(pivOff);
        if (Math.abs(this.group.position.x) < 1e-9) this.group.position.x = 0;
        if (Math.abs(this.group.position.z) < 1e-9) this.group.position.z = 0;
        this.group.rotation.y = this.facingYaw;

        this.turnActive = false;
        this.blend = 0;
        this.targetAnim = this.turnReturnAnim;
        if (this.onTurnEnd) this.onTurnEnd(this.targetAnim);
        cur = this._usingInput ? this._sampleLocomotionPose() : this._samplePose(this.targetAnim, this.time);
      } else {
        cur = this._sampleTurnPose(u, this.turnDir);
        const curYaw = this.turnStartYaw + cur.groupYawOffset;
        const pivOff = new THREE.Vector3(0, 0, this.pivotLocalZ).applyAxisAngle(UP_AXIS, curYaw);
        this.group.position.copy(this.turnPivotWorld).sub(pivOff);
        this.group.rotation.y = curYaw;
      }
    } else if (this.attackActive) {
      this.attackTime += dt * this.speed;
      const u = this.attackTime / this.attackDuration;
      if (u >= 1) {
        this.prevPose = this._blendPoses(this.prevPose, this._sampleAttackPose(1), smoothstep(0, 1, this.blend));
        this.attackActive = false;
        this.blend = 0;
        if (this.onAttackEnd) this.onAttackEnd();
        cur = this._usingInput ? this._sampleLocomotionPose() : this._samplePose(this.targetAnim, this.time);
      } else {
        cur = this._sampleAttackPose(u);
        if (this._usingInput && Math.abs(this.turnBlend) > 1e-3) this._applyTurnLean(cur, 0.45 * this.turnBlend);
      }
    } else if (this.screamActive) {
      this.screamTime += dt * this.speed;
      const u = this.screamTime / this.screamDuration;
      if (u >= 0.16 && !this.screamPeakFired) {
        this.screamPeakFired = true;
        if (this.onScreamPeak) this.onScreamPeak();
      }
      if (u >= 1) {
        this.prevPose = this._blendPoses(this.prevPose, this._sampleScreamTime(this.screamDuration), smoothstep(0, 1, this.blend));
        this.screamActive = false;
        this.blend = 0;
        if (this.onScreamEnd) this.onScreamEnd();
        cur = this._usingInput ? this._sampleLocomotionPose() : this._samplePose(this.targetAnim, this.time);
      } else {
        cur = this._sampleScreamTime(this.screamTime);
      }
    } else if (this._usingInput) {
      cur = this._sampleLocomotionPose();
    } else {
      cur = this._samplePose(this.targetAnim, this.time);
    }

    const pose = (this.blend < 1 && this.prevPose)
      ? this._blendPoses(this.prevPose, cur, smoothstep(0, 1, this.blend))
      : cur;

    this.bones.pelvis.position.copy(this.pelvisRest).add(pose.pOff);
    this.bones.pelvis.rotation.copy(pose.pRot);
    this.bones.chest.rotation.set(pose.chRot.x, pose.chRot.y, pose.chRot.z);
    this.bones.neck1.rotation.set(pose.n1Rot.x, pose.n1Rot.y, pose.n1Rot.z);
    this.bones.neck2.rotation.set(pose.n2Rot.x, pose.n2Rot.y, pose.n2Rot.z);
    this.bones.headBase.rotation.set(pose.hRot.x, pose.hRot.y, pose.hRot.z);

    this.jawBone.rotation.x = pose.jaw;
    const tE = pose.tOut;
    this.tongueRoot.visible = true;
    this.tongueRoot.position.set(0, 0.024, 0.06 + 0.34 * tE);
    this.tongueRoot.scale.set(0.85 + 0.15 * tE, 0.85 + 0.15 * tE, 0.62 + 0.58 * tE);
    this.tongueRoot.rotation.set(-0.10 - 0.28 * tE + 0.08 * pose.tWhip, 0.14 * pose.tWhip, 0);
    this.tongueProngs.forEach((p, idx) => {
      p.rotation.x = -0.10 * tE + 0.10 * Math.sin(this.time * 14 + idx * 1.4) * (0.15 + tE);
      p.rotation.y = (idx === 0 ? 0.08 : (idx === 1 ? 0.12 : -0.12)) * tE + 0.10 * pose.tWhip;
    });

    const tailOrder = ['tail1','tail2','tail3','tail4','tail5','tail6'];
    tailOrder.forEach((n, i) => this.bones[n].rotation.set(pose.tP[5 - i], pose.tY[5 - i], pose.tR[5 - i], 'YXZ'));
    this.group.updateMatrixWorld(true);
    const tmp = new THREE.Vector3();
    for (let i = 1; i < tailOrder.length; i++) {
      this.bones[tailOrder[i]].getWorldPosition(tmp);
      if (tmp.y < 0.16) { this.bones[tailOrder[i - 1]].rotation.x += Math.min(0.55, (0.16 - tmp.y) * 0.85); this.group.updateMatrixWorld(true); }
    }

    const grpQInv = this.group.quaternion.clone().invert();
    const chP = new THREE.Vector3(), chQ = new THREE.Quaternion();
    this.bones.chest.getWorldPosition(chP); this.bones.chest.getWorldQuaternion(chQ);
    chP.sub(this.group.position).applyQuaternion(grpQInv);
    chQ.premultiply(grpQInv);
    const doIK = (limb, wTgt, sw, wYaw, poleYaw) => {
      const S = limb.shLocal.clone().applyQuaternion(chQ).add(chP);
      const pole = new THREE.Vector3(limb.side * 0.68, 0.44, -0.76).applyAxisAngle(UP_AXIS, poleYaw);
      const { E, W, perp } = this._solveIK(S, wTgt, pole);
      const qU = new THREE.Quaternion().setFromRotationMatrix(this._boneMat(S, E, perp));
      const qF = new THREE.Quaternion().setFromRotationMatrix(this._boneMat(E, W, perp));
      limb.shB.quaternion.copy(chQ.clone().invert().multiply(qU));
      limb.elB.quaternion.copy(qU.clone().invert().multiply(qF));
      const qW = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.45 * sw, wYaw, 0, 'YXZ'));
      limb.wrB.quaternion.copy(qF.clone().invert().multiply(qW));
      limb.spurPiv.quaternion.copy(qF.clone().invert().multiply(qU.clone().slerp(qF, 0.42)));
      limb.digits.forEach(d => d.rotation.x = 0.40 * sw);
    };
    doIK(this.limbs.L, pose.wL, pose.swL, pose.wYawL ?? pose.pRot.y * 0.6, pose.poleYawL ?? pose.pRot.y);
    doIK(this.limbs.R, pose.wR, pose.swR, pose.wYawR ?? pose.pRot.y * 0.6, pose.poleYawR ?? pose.pRot.y);
    this.group.updateMatrixWorld(true);
  }
}
