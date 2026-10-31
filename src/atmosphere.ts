import * as THREE from "three";

const PALETTE = [
  "#ff6fa8",
  "#ff6fa8",
  "#ff9ec8",
  "#ffe14a",
  "#ffd166",
  "#5ae8ff",
  "#7af0ff",
  "#5b8cff",
  "#3d6bff",
  "#d9a0ff",
  "#8dffc0",
  "#ffffff",
  "#fff4c8",
];

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aLife;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float tw = 0.75 + 0.25 * sin(uTime * 1.7 + aPhase);
    vColor = aColor * (0.9 + 0.35 * tw);
    vAlpha = aLife * (0.28 + 0.42 * tw);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float px = aSize * tw * aLife * uPixelRatio * (260.0 / max(1.0, -mv.z));
    gl_PointSize = clamp(px, 0.0, 48.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - vec2(0.5);
    float d = length(p);
    float a = smoothstep(0.5, 0.02, d);
    a = a * a;
    if (a * vAlpha < 0.02) discard;
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

function makeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function fillColor(target: Float32Array, index: number, hex: string, gain = 1): void {
  const c = new THREE.Color(hex);
  target[index * 3] = c.r * gain;
  target[index * 3 + 1] = c.g * gain;
  target[index * 3 + 2] = c.b * gain;
}

function makePoints(
  count: number,
  material: THREE.ShaderMaterial,
  place: (i: number, pos: Float32Array, size: Float32Array, phase: Float32Array, life: Float32Array, color: Float32Array) => void,
): THREE.Points {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const life = new Float32Array(count);
  const color = new Float32Array(count * 3);
  place(count, pos, size, phase, life, color);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geo.setAttribute("aLife", new THREE.BufferAttribute(life, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
  return new THREE.Points(geo, material);
}

function ellipseRing(radius: number, count: number, material: THREE.ShaderMaterial, size: number, colorful: boolean): THREE.Points {
  return makePoints(count, material, (n, pos, sz, phase, life, color) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const j = 1 + Math.sin(i * 9.2) * 0.025;
      pos[i * 3] = Math.cos(a) * radius * j;
      pos[i * 3 + 1] = Math.sin(i * 3.7) * 0.015;
      pos[i * 3 + 2] = Math.sin(a) * radius * j;
      sz[i] = size * (0.65 + (i % 5) * 0.12);
      phase[i] = a * 3;
      life[i] = 1;
      const hex = colorful ? PALETTE[i % PALETTE.length] : i % 4 === 0 ? "#ffe9b0" : "#fffaf2";
      fillColor(color, i, hex, colorful ? 0.95 : 1.15);
    }
  });
}

function glowRing(radius: number): THREE.Mesh {
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
  const pts = curve.getPoints(200).map((p) => new THREE.Vector3(p.x, 0, p.y));
  const path = new THREE.CatmullRomCurve3(pts, true);
  const geo = new THREE.TubeGeometry(path, 200, 0.006, 5, true);
  const mat = new THREE.MeshBasicMaterial({
    color: "#fff6ea",
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  return new THREE.Mesh(geo, mat);
}

const BURST = 220;

export type Atmosphere = {
  update(t: number, dt: number): void;
  burst(): void;
  setPixelRatio(value: number): void;
};

export function createAtmosphere(scene: THREE.Scene): Atmosphere {
  const material = makeMaterial();

  const driftCount = 980;
  const base = new Float32Array(driftCount * 3);
  const drift = makePoints(driftCount, material, (n, pos, size, phase, life, color) => {
    for (let i = 0; i < n; i++) {
      const mode = Math.random();
      let x: number;
      let y: number;
      let z: number;
      let sz: number;
      if (mode < 0.62) {
        const u = Math.random();
        const v = Math.random();
        const theta = Math.PI * 2 * u;
        const phi = Math.acos(2 * v - 1);
        const rad = Math.cbrt(Math.random());
        x = Math.sin(phi) * Math.cos(theta) * rad * 5.4;
        y = Math.cos(phi) * rad * 3.3 + 1.05;
        z = Math.sin(phi) * Math.sin(theta) * rad * 3.5;
        sz = Math.random() < 0.78 ? 0.16 + Math.random() * 0.22 : 0.34 + Math.random() * 0.28;
      } else if (mode < 0.86) {
        const a = Math.random() * Math.PI * 2;
        const r = 1.7 + Math.random() * 1.6;
        x = Math.cos(a) * r;
        y = 0.7 + Math.random() * 1.9;
        z = Math.sin(a) * r * 0.72;
        sz = 0.22 + Math.random() * 0.28;
      } else {
        x = (Math.random() - 0.5) * 7.2;
        y = Math.random() * 4.2;
        z = 1.4 + Math.random() * 2.4;
        sz = 0.85 + Math.random() * 0.7;
      }
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      base[i * 3] = x;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = z;
      size[i] = sz;
      phase[i] = Math.random() * Math.PI * 2;
      life[i] = mode > 0.86 ? 0.42 : 0.9;
      fillColor(color, i, PALETTE[i % PALETTE.length], mode > 0.86 ? 0.7 : 1);
    }
  });
  scene.add(drift);

  const ringRoot = new THREE.Group();
  const mainPivot = new THREE.Group();
  mainPivot.position.y = 1.42;
  mainPivot.rotation.x = 1.12;
  mainPivot.rotation.z = 0.06;
  const mainSpin = new THREE.Group();
  mainSpin.add(ellipseRing(2.15, 300, material, 0.32, false));
  mainSpin.add(ellipseRing(2.22, 70, material, 0.5, true));
  mainSpin.add(glowRing(2.15));
  mainPivot.add(mainSpin);
  ringRoot.add(mainPivot);

  const sidePivot = new THREE.Group();
  sidePivot.position.set(0.1, 0.72, 0);
  sidePivot.rotation.x = 1.25;
  sidePivot.rotation.z = 0.55;
  const sideSpin = new THREE.Group();
  sideSpin.add(ellipseRing(2.45, 160, material, 0.24, true));
  sideSpin.add(glowRing(2.45));
  sidePivot.add(sideSpin);
  ringRoot.add(sidePivot);
  scene.add(ringRoot);

  const burstPos = new Float32Array(BURST * 3);
  const burstVel = new Float32Array(BURST * 3);
  const burstLife = new Float32Array(BURST);
  const burstMax = new Float32Array(BURST);
  const burstPoints = makePoints(BURST, material, (n, pos, size, phase, life, color) => {
    for (let i = 0; i < n; i++) {
      pos[i * 3 + 1] = -10;
      size[i] = 0.9 + Math.random() * 0.8;
      phase[i] = Math.random() * Math.PI * 2;
      life[i] = 0;
      fillColor(color, i, PALETTE[i % PALETTE.length], 1.2);
    }
  });
  scene.add(burstPoints);
  const lifeAttr = burstPoints.geometry.getAttribute("aLife") as THREE.BufferAttribute;
  const posAttr = burstPoints.geometry.getAttribute("position") as THREE.BufferAttribute;
  const colorAttr = burstPoints.geometry.getAttribute("aColor") as THREE.BufferAttribute;

  const driftPos = drift.geometry.getAttribute("position") as THREE.BufferAttribute;
  let bursting = false;

  return {
    setPixelRatio(value: number) {
      material.uniforms.uPixelRatio.value = value;
    },
    burst() {
      bursting = true;
      const colors = colorAttr.array as Float32Array;
      for (let i = 0; i < BURST; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 2.3;
        const radius = 0.95 + Math.random() * 0.4;
        burstPos[i * 3] = Math.cos(angle) * radius;
        burstPos[i * 3 + 1] = -0.05 + Math.random() * 0.9;
        burstPos[i * 3 + 2] = Math.sin(angle) * radius;
        burstVel[i * 3] = Math.cos(angle) * speed;
        burstVel[i * 3 + 1] = 0.4 + Math.random() * 1.35;
        burstVel[i * 3 + 2] = Math.sin(angle) * speed;
        burstLife[i] = 0.9 + Math.random() * 0.4;
        burstMax[i] = burstLife[i];
        fillColor(colors, i, PALETTE[Math.floor(Math.random() * PALETTE.length)], 1.7);
        (lifeAttr.array as Float32Array)[i] = 1;
      }
      (posAttr.array as Float32Array).set(burstPos);
      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      lifeAttr.needsUpdate = true;
    },
    update(t: number, dt: number) {
      material.uniforms.uTime.value = t;
      mainSpin.rotation.y = t * 0.28;
      sideSpin.rotation.y = -t * 0.16;
      const arr = driftPos.array as Float32Array;
      for (let i = 0; i < driftCount; i++) {
        const ph = (drift.geometry.getAttribute("aPhase") as THREE.BufferAttribute).getX(i);
        arr[i * 3] = base[i * 3] + Math.sin(t * 0.33 + ph) * 0.07;
        arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.47 + ph * 1.3) * 0.05;
        arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.29 + ph) * 0.07;
      }
      driftPos.needsUpdate = true;

      if (!bursting) return;
      const lifeArr = lifeAttr.array as Float32Array;
      const pArr = posAttr.array as Float32Array;
      let alive = false;
      for (let i = 0; i < BURST; i++) {
        if (burstLife[i] <= 0) {
          lifeArr[i] = 0;
          continue;
        }
        alive = true;
        burstLife[i] -= dt;
        const drag = Math.exp(-dt * 0.85);
        burstVel[i * 3] *= drag;
        burstVel[i * 3 + 1] = burstVel[i * 3 + 1] * drag + dt * 0.12;
        burstVel[i * 3 + 2] *= drag;
        burstPos[i * 3] += burstVel[i * 3] * dt;
        burstPos[i * 3 + 1] += burstVel[i * 3 + 1] * dt;
        burstPos[i * 3 + 2] += burstVel[i * 3 + 2] * dt;
        pArr[i * 3] = burstPos[i * 3];
        pArr[i * 3 + 1] = burstPos[i * 3 + 1];
        pArr[i * 3 + 2] = burstPos[i * 3 + 2];
        lifeArr[i] = Math.max(0, burstLife[i] / burstMax[i]);
      }
      lifeAttr.needsUpdate = true;
      posAttr.needsUpdate = true;
      if (!alive) bursting = false;
    },
  };
}
