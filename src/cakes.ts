import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { makeRadialTexture } from "./textures";

const glowMap = makeRadialTexture();

export type CakeSpec = {
  id: string;
  accent: string;
  plateGlow: string;
  halo: number;
  group: THREE.Group;
};

type Footprint = {
  contains(x: number, z: number): boolean;
  outline(count: number, inset: number): { x: number; z: number }[];
};

function heartShape(size: number): THREE.Shape {
  const s = size / 2.2;
  const shape = new THREE.Shape();
  shape.moveTo(0, -1.02 * s);
  shape.bezierCurveTo(0.85 * s, -0.42 * s, 1.28 * s, 0.08 * s, 1.02 * s, 0.52 * s);
  shape.bezierCurveTo(0.82 * s, 0.86 * s, 0.3 * s, 0.78 * s, 0, 0.36 * s);
  shape.bezierCurveTo(-0.3 * s, 0.78 * s, -0.82 * s, 0.86 * s, -1.02 * s, 0.52 * s);
  shape.bezierCurveTo(-1.28 * s, 0.08 * s, -0.85 * s, -0.42 * s, 0, -1.02 * s);
  return shape;
}

function heartPolygon(size: number): THREE.Vector2[] {
  return heartShape(size).getPoints(96);
}

function pointInPoly(x: number, y: number, poly: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function heartFootprint(size: number): Footprint {
  const poly = heartPolygon(size);
  return {
    contains(x, z) {
      return pointInPoly(x, z, poly);
    },
    outline(count, inset) {
      const pts: { x: number; z: number }[] = [];
      const k = Math.max(0.2, 1 - inset / Math.max(size, 0.001));
      for (let i = 0; i < count; i++) {
        const p = poly[Math.floor((i / count) * poly.length)];
        pts.push({ x: p.x * k, z: p.y * k });
      }
      return pts;
    },
  };
}

function roundFootprint(radius: number): Footprint {
  return {
    contains(x, z) {
      return x * x + z * z <= radius * radius;
    },
    outline(count, inset) {
      const r = Math.max(0.05, radius - inset);
      const pts: { x: number; z: number }[] = [];
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
      }
      return pts;
    },
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function frosting(
  color: string,
  opts: {
    emissive?: string;
    emissiveIntensity?: number;
    metalness?: number;
    roughness?: number;
    clearcoat?: number;
    env?: number;
  } = {},
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: opts.roughness ?? 0.58,
    metalness: opts.metalness ?? 0.02,
    clearcoat: opts.clearcoat ?? 0.14,
    clearcoatRoughness: 0.42,
    sheen: 1,
    sheenRoughness: 0.42,
    sheenColor: new THREE.Color("#fff4f8"),
    emissive: new THREE.Color(opts.emissive ?? "#000000"),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    side: THREE.DoubleSide,
  });
  mat.envMapIntensity = opts.env ?? 0.42;
  return mat;
}

function candy(color: string, metalness = 0.12): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.28,
    metalness,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18,
    side: THREE.FrontSide,
  });
  mat.envMapIntensity = 0.7;
  return mat;
}

function heartBody(size: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(heartShape(size), {
    depth: Math.max(height, 0.01),
    bevelEnabled: false,
    curveSegments: 12,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (bb) {
    geo.translate(-(bb.max.x + bb.min.x) / 2, -bb.min.y, -(bb.max.z + bb.min.z) / 2);
  }
  return geo;
}

function ridgedHeart(size: number, height: number, ridges: number, mat: THREE.Material): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const step = height / ridges;
  for (let i = 0; i < ridges; i++) {
    const wave = 1 + Math.sin((i + 0.5) * Math.PI) * 0.042;
    const geo = heartBody(size * wave, step * 1.28);
    geo.translate(0, i * step, 0);
    parts.push(geo);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("无法合并心形蛋糕几何");
  return new THREE.Mesh(merged, mat);
}

function ridgedRound(radius: number, height: number, ridges: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const rows = ridges * 8;
  pts.push(new THREE.Vector2(0, 0));
  pts.push(new THREE.Vector2(radius * 0.92, 0));
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = t * height;
    const ridge = Math.sin(t * ridges * Math.PI * 2) * radius * 0.032;
    const lip = Math.sin(Math.min(t, 1 - t) * Math.PI) ;
    const r = radius * (0.9 + 0.1 * Math.min(1, lip * 3)) + ridge;
    pts.push(new THREE.Vector2(Math.max(0.02, r), y));
  }
  pts.push(new THREE.Vector2(radius * 0.9, height));
  pts.push(new THREE.Vector2(0, height));
  return new THREE.LatheGeometry(pts, 72);
}

const dripGeo = new THREE.SphereGeometry(1, 12, 8);
dripGeo.translate(0, -1, 0);

function addDrips(
  parent: THREE.Object3D,
  outline: { x: number; z: number }[],
  y: number,
  mat: THREE.Material,
  every: number,
  rng: () => number,
): void {
  for (let i = 0; i < outline.length; i += every) {
    const p = outline[i];
    if (Math.abs(p.x) < 0.22 && p.z < 0.08) continue;
    const len = 0.12 + rng() * 0.14;
    const mesh = new THREE.Mesh(dripGeo, mat);
    const thick = 0.032 + rng() * 0.012;
    mesh.scale.set(thick, len * 0.5, thick);
    mesh.position.set(p.x * 0.98, y, p.z * 0.98);
    parent.add(mesh);
  }
}

const petalGeo = new THREE.SphereGeometry(1, 10, 8);
petalGeo.scale(1.2, 0.38, 0.7);

function flower(petal: string, center: string, scale: number): THREE.Group {
  const g = new THREE.Group();
  const pMat = candy(petal, 0.04);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const mesh = new THREE.Mesh(petalGeo, pMat);
    const s = 0.042 * scale;
    mesh.scale.setScalar(s);
    mesh.position.set(Math.cos(a) * 0.055 * scale, 0, Math.sin(a) * 0.055 * scale);
    mesh.rotation.y = -a;
    g.add(mesh);
  }
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.026 * scale, 10, 8), candy(center, 0.08));
  c.position.y = 0.012 * scale;
  g.add(c);
  return g;
}

function candle(wax: string, flame: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.2, 12), frosting(wax, { roughness: 0.55 }));
  body.position.y = 0.1;
  const wick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.04, 6),
    new THREE.MeshStandardMaterial({ color: "#2a241c" }),
  );
  wick.position.y = 0.21;
  const fire = new THREE.Group();
  fire.name = "flame";
  fire.position.y = 0.25;
  const flameMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 10),
    new THREE.MeshBasicMaterial({ color: flame, toneMapped: false }),
  );
  flameMesh.scale.set(0.62, 1.25, 0.62);
  const glowMat = new THREE.SpriteMaterial({
    map: glowMap,
    color: flame,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(0.42, 0.55, 1);
  glow.position.y = 0.02;
  fire.add(flameMesh, glow);
  const light = new THREE.PointLight(flame, 1.4, 1.8, 2);
  light.position.y = 0.26;
  g.add(body, wick, fire, light);
  return g;
}

function berry(color: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 12), candy(color, 0.18));
  body.scale.set(0.92, 1.08, 0.92);
  const leafMat = candy("#3caf5a", 0.02);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(petalGeo, leafMat);
    leaf.scale.setScalar(0.03);
    const a = (i / 5) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.02, 0.055, Math.sin(a) * 0.02);
    leaf.rotation.y = -a;
    g.add(leaf);
  }
  g.add(body);
  return g;
}

function dollop(color: string, radius: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), frosting(color, { roughness: 0.4 }));
  mesh.scale.y = 0.58;
  return mesh;
}

function cherry(): THREE.Group {
  const g = new THREE.Group();
  const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), candy("#d3122a", 0.28));
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.007, 0.1, 6),
    new THREE.MeshStandardMaterial({ color: "#2f6b3a" }),
  );
  stem.position.set(0.01, 0.08, 0);
  stem.rotation.z = 0.55;
  g.add(fruit, stem);
  return g;
}

function macaron(shell: string, filling: string): THREE.Group {
  const g = new THREE.Group();
  const shellMat = candy(shell, 0.05);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.068, 16, 12), shellMat);
  top.scale.set(1, 0.42, 1);
  top.position.y = 0.042;
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.068, 16, 12), shellMat);
  bot.scale.set(1, 0.42, 1);
  bot.position.y = 0.012;
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.018, 16), candy(filling, 0.02));
  mid.position.y = 0.028;
  g.add(bot, mid, top);
  return g;
}

function lemonSlice(): THREE.Group {
  const g = new THREE.Group();
  const rind = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 22), candy("#ffe14a", 0.05));
  const pulp = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.026, 18), candy("#fff6c8", 0.02));
  pulp.position.y = 0.004;
  g.add(rind, pulp);
  return g;
}

function sprinkleField(
  parent: THREE.Object3D,
  footprint: Footprint,
  y: number,
  colors: string[],
  count: number,
  rng: () => number,
  span: number,
): void {
  const geo = new THREE.CapsuleGeometry(0.011, 0.03, 2, 6);
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.38, metalness: 0.04 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 40) {
    guard += 1;
    const x = (rng() - 0.5) * span;
    const z = (rng() - 0.5) * span;
    if (!footprint.contains(x, z)) continue;
    dummy.position.set(x, y + rng() * 0.01, z);
    dummy.rotation.set(rng() * 1.2, rng() * Math.PI, rng() * 1.2);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    mesh.setColorAt(placed, color.set(colors[placed % colors.length]));
    placed += 1;
  }
  mesh.count = placed;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (placed > 0) parent.add(mesh);
}

function layFlowers(
  parent: THREE.Object3D,
  spots: { x: number; z: number; petal: string; center: string; scale: number }[],
  y: number,
): void {
  for (const spot of spots) {
    const f = flower(spot.petal, spot.center, spot.scale);
    f.position.set(spot.x, y, spot.z);
    f.rotation.y = Math.atan2(spot.x, spot.z);
    parent.add(f);
  }
}

function drizzle(color: string, y: number, scale = 1): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.34 * scale, y, 0.08 * scale),
    new THREE.Vector3(-0.08 * scale, y + 0.02, -0.08 * scale),
    new THREE.Vector3(0.16 * scale, y + 0.01, 0.1 * scale),
    new THREE.Vector3(0.36 * scale, y + 0.02, -0.02 * scale),
  ]);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 40, 0.018 * scale, 6, false),
    frosting(color, { emissive: color, emissiveIntensity: 0.18, roughness: 0.32 }),
  );
}

function buildCreamHeart(): THREE.Group {
  const g = new THREE.Group();
  const bottomMat = frosting("#d7e7fb", { emissive: "#6f93bf", emissiveIntensity: 0.04, roughness: 0.62 });
  const topMat = frosting("#f7f9fc", { emissive: "#c5d7ee", emissiveIntensity: 0.035, roughness: 0.55 });
  const bottomH = 0.46;
  const topH = 0.2;
  const bottom = ridgedHeart(1.62, bottomH, 12, bottomMat);
  const top = ridgedHeart(1.22, topH, 6, topMat);
  top.position.y = bottomH - 0.01;
  g.add(bottom, top);
  g.add(drizzle("#ffb4c8", bottomH + topH + 0.02, 0.95));
  const foot = heartFootprint(1.05);
  layFlowers(
    g,
    [
      { x: -0.22, z: 0.16, petal: "#ffb3cf", center: "#ffe27a", scale: 0.9 },
      { x: 0.18, z: 0.2, petal: "#fff", center: "#ff8fb8", scale: 0.75 },
      { x: 0.02, z: -0.08, petal: "#c9f3ff", center: "#fff4b0", scale: 0.7 },
    ],
    bottomH + topH + 0.02,
  );
  const light = candle("#fffaf7", "#ffd0e4");
  light.position.set(0.02, bottomH + topH - 0.02, -0.08);
  g.add(light);
  sprinkleField(g, foot, bottomH + topH + 0.03, ["#ff8fb8", "#ffe14a", "#7ee7ff", "#fff"], 18, mulberry32(3), 1.1);
  return g;
}

function buildStrawberry(): THREE.Group {
  const g = new THREE.Group();
  const mat = frosting("#ff8eb5", { emissive: "#ff6f9a", emissiveIntensity: 0.06 });
  const height = 0.62;
  g.add(ridgedHeart(1.5, height, 12, mat));
  const rng = mulberry32(11);
  addDrips(g, heartFootprint(1.42).outline(16, 0.02), height, candy("#ff5d8f", 0.05), 2, rng);
  const foot = heartFootprint(1.15);
  const dollops = foot.outline(7, 0.12);
  for (const p of dollops) {
    if (p.z < -0.25) continue;
    const d = dollop("#fffafc", 0.09);
    d.position.set(p.x, height + 0.02, p.z);
    g.add(d);
  }
  const center = dollop("#fffafc", 0.11);
  center.position.y = height + 0.03;
  g.add(center);
  const spots = [
    { x: -0.18, z: 0.12 },
    { x: 0.2, z: 0.08 },
    { x: 0.02, z: -0.16 },
    { x: -0.28, z: -0.05 },
    { x: 0.26, z: -0.12 },
  ];
  for (const s of spots) {
    const b = berry("#e11d48");
    b.position.set(s.x, height + 0.08, s.z);
    g.add(b);
  }
  return g;
}

function buildChocolate(): THREE.Group {
  const g = new THREE.Group();
  const tiers = [
    { r: 0.78, h: 0.28, c: "#2c1a12" },
    { r: 0.62, h: 0.24, c: "#3b2418" },
    { r: 0.46, h: 0.22, c: "#4a2e1e" },
  ];
  let y = 0;
  for (const tier of tiers) {
    const mesh = new THREE.Mesh(
      ridgedRound(tier.r, tier.h, 7),
      frosting(tier.c, { roughness: 0.42, metalness: 0.08, emissive: "#1a0c08", emissiveIntensity: 0.18, clearcoat: 0.45 }),
    );
    mesh.position.y = y;
    g.add(mesh);
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(tier.r * 0.96, 0.018, 8, 40),
      frosting("#6a4630", { roughness: 0.35, metalness: 0.12 }),
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = y + tier.h;
    g.add(lip);
    y += tier.h - 0.005;
  }
  const gold = candy("#f0d090", 0.86);
  gold.roughness = 0.24;
  addDrips(g, roundFootprint(0.44).outline(14, 0), y, gold, 1, mulberry32(21));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const ch = cherry();
    ch.position.set(Math.cos(a) * 0.18, y + 0.04, Math.sin(a) * 0.18);
    g.add(ch);
  }
  const cream = dollop("#f6efe6", 0.1);
  cream.position.y = y + 0.02;
  g.add(cream);
  const flakeGeo = new THREE.PlaneGeometry(0.07, 0.045);
  const flakeMat = new THREE.MeshStandardMaterial({
    color: "#e7c27a",
    metalness: 0.9,
    roughness: 0.25,
    side: THREE.DoubleSide,
  });
  const rng = mulberry32(22);
  for (let i = 0; i < 10; i++) {
    const flake = new THREE.Mesh(flakeGeo, flakeMat);
    const a = rng() * Math.PI * 2;
    const rr = 0.5 + rng() * 0.22;
    flake.position.set(Math.cos(a) * rr, 0.18 + rng() * 0.35, Math.sin(a) * rr);
    flake.rotation.set(rng(), rng(), rng());
    g.add(flake);
  }
  return g;
}

function buildGalaxy(): THREE.Group {
  const g = new THREE.Group();
  const height = 0.86;
  const radius = 0.7;
  const mat = frosting("#1a1444", {
    emissive: "#6d4dff",
    emissiveIntensity: 0.45,
    metalness: 0.35,
    roughness: 0.32,
    clearcoat: 0.8,
    env: 0.8,
  });
  mat.iridescence = 1;
  mat.iridescenceIOR = 1.25;
  mat.iridescenceThicknessRange = [120, 420];
  const body = new THREE.Mesh(ridgedRound(radius, height, 10), mat);
  g.add(body);
  const dripMat = new THREE.MeshStandardMaterial({
    color: "#d7e4ff",
    metalness: 0.75,
    roughness: 0.18,
    emissive: "#8fb4ff",
    emissiveIntensity: 0.25,
  });
  addDrips(g, roundFootprint(radius * 0.92).outline(12, 0), height, dripMat, 1, mulberry32(31));
  const starGeo = new THREE.SphereGeometry(0.016, 8, 6);
  const starMat = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  const stars = new THREE.InstancedMesh(starGeo, starMat, 56);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const palette = ["#ffffff", "#b9d4ff", "#ffd6ff", "#ffe08a", "#7ef0ff"];
  const rng = mulberry32(32);
  for (let i = 0; i < 56; i++) {
    const onTop = rng() < 0.38;
    if (onTop) {
      const rr = rng() * radius * 0.8;
      const a = rng() * Math.PI * 2;
      dummy.position.set(Math.cos(a) * rr, height + 0.012, Math.sin(a) * rr);
    } else {
      const a = rng() * Math.PI * 2;
      dummy.position.set(Math.cos(a) * (radius + 0.012), rng() * height, Math.sin(a) * (radius + 0.012));
    }
    const s = rng() < 0.15 ? 1.8 : 1;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    stars.setMatrixAt(i, dummy.matrix);
    stars.setColorAt(i, col.set(palette[i % palette.length]));
  }
  if (stars.instanceColor) stars.instanceColor.needsUpdate = true;
  g.add(stars);
  const light = candle("#efeaff", "#b9f3ff");
  light.position.y = height - 0.02;
  g.add(light);
  return g;
}

function buildLemon(): THREE.Group {
  const g = new THREE.Group();
  const height = 0.58;
  const mat = frosting("#ffe56a", { emissive: "#ffd24a", emissiveIntensity: 0.08, roughness: 0.4 });
  g.add(ridgedHeart(1.48, height, 10, mat));
  addDrips(g, heartFootprint(1.4).outline(15, 0.02), height, frosting("#fffdf8", { roughness: 0.3 }), 2, mulberry32(41));
  layFlowers(
    g,
    [
      { x: -0.28, z: 0.12, petal: "#fff", center: "#ffe14a", scale: 0.85 },
      { x: 0.24, z: 0.16, petal: "#fff", center: "#ffb703", scale: 0.8 },
      { x: 0, z: -0.12, petal: "#fff6d0", center: "#fff", scale: 0.7 },
    ],
    height + 0.02,
  );
  const slices = [
    { x: -0.12, z: 0.18, rot: 0.4 },
    { x: 0.16, z: 0.02, rot: -0.3 },
    { x: 0.05, z: -0.2, rot: 0.8 },
  ];
  for (const s of slices) {
    const slice = lemonSlice();
    slice.position.set(s.x, height + 0.02, s.z);
    slice.rotation.y = s.rot;
    slice.rotation.z = 0.15;
    g.add(slice);
  }
  sprinkleField(
    g,
    heartFootprint(1.05),
    height + 0.03,
    ["#fff", "#ff8fb8", "#7dcc6a", "#ffe14a"],
    16,
    mulberry32(42),
    1.2,
  );
  return g;
}

function buildMatcha(): THREE.Group {
  const g = new THREE.Group();
  const bottomH = 0.36;
  const topH = 0.24;
  const bottom = new THREE.Mesh(
    ridgedRound(0.78, bottomH, 8),
    frosting("#6f8f45", { emissive: "#3d5a24", emissiveIntensity: 0.12, roughness: 0.5 }),
  );
  const top = new THREE.Mesh(
    ridgedRound(0.58, topH, 6),
    frosting("#e7f2d4", { emissive: "#f4ffe8", emissiveIntensity: 0.08, roughness: 0.38 }),
  );
  top.position.y = bottomH - 0.008;
  g.add(bottom, top);
  const y = bottomH + topH;
  const creamSpots = roundFootprint(0.42).outline(6, 0);
  for (const p of creamSpots) {
    const d = dollop("#f7fff0", 0.08);
    d.position.set(p.x, y - 0.01, p.z);
    g.add(d);
  }
  const beans = [
    { x: 0, z: 0 },
    { x: -0.12, z: 0.1 },
    { x: 0.14, z: 0.06 },
    { x: 0.02, z: -0.14 },
  ];
  for (const b of beans) {
    const bean = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), candy("#7a3040", 0.08));
    bean.scale.set(1, 0.72, 0.9);
    bean.position.set(b.x, y + 0.03, b.z);
    g.add(bean);
  }
  const leaf = flower("#d8f5b8", "#fff", 0.7);
  leaf.position.set(-0.2, y + 0.01, 0.12);
  g.add(leaf);
  return g;
}

function buildRoseGold(): THREE.Group {
  const g = new THREE.Group();
  const height = 0.64;
  const mat = frosting("#f0a8bc", {
    emissive: "#7a3048",
    emissiveIntensity: 0.12,
    metalness: 0.72,
    roughness: 0.24,
    clearcoat: 0.65,
    env: 1.05,
  });
  g.add(ridgedHeart(1.46, height, 10, mat));
  const gold = candy("#f6d78a", 0.9);
  gold.roughness = 0.2;
  addDrips(g, heartFootprint(1.38).outline(14, 0.02), height, gold, 2, mulberry32(61));
  const pearls = heartFootprint(0.95).outline(10, 0.08);
  const pearlMat = new THREE.MeshPhysicalMaterial({
    color: "#fff8f4",
    roughness: 0.12,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  pearlMat.envMapIntensity = 1;
  for (const p of pearls) {
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 12), pearlMat);
    pearl.position.set(p.x, height + 0.03, p.z);
    g.add(pearl);
  }
  const tiny = new THREE.Mesh(heartBody(0.28, 0.05), candy("#ffd0e0", 0.55));
  tiny.position.y = height + 0.04;
  tiny.rotation.y = 0.4;
  g.add(tiny);
  return g;
}

function buildLavender(): THREE.Group {
  const g = new THREE.Group();
  g.rotation.y = Math.PI / 7;
  const bottomW = 1.22;
  const topW = 0.9;
  const bottom = ridgedSquare(bottomW, bottomW * 0.9, 0.32, 6, frosting("#cbb6ff", { emissive: "#8d74d6", emissiveIntensity: 0.1 }));
  const top = ridgedSquare(topW, topW * 0.9, 0.26, 5, frosting("#f4ecff", { emissive: "#efe4ff", emissiveIntensity: 0.1 }));
  top.position.y = 0.3;
  g.add(bottom, top);
  const y = 0.56;
  const colors: [string, string][] = [
    ["#f3e8ff", "#e7b6d8"],
    ["#ffd0e4", "#fff"],
    ["#e5d4ff", "#c9b6ff"],
    ["#fff", "#ffb7d5"],
    ["#d5c2ff", "#f7e7ff"],
  ];
  colors.forEach((pair, i) => {
    const a = (i / colors.length) * Math.PI * 2 + 0.3;
    const m = macaron(pair[0], pair[1]);
    m.position.set(Math.cos(a) * 0.28, y, Math.sin(a) * 0.24);
    g.add(m);
  });
  layFlowers(
    g,
    [
      { x: 0, z: 0, petal: "#efe6ff", center: "#ffe27a", scale: 0.8 },
      { x: -0.42, z: 0.2, petal: "#fff", center: "#d7c4ff", scale: 0.65 },
    ],
    y + 0.02,
  );
  const light = candle("#f8f4ff", "#ffe9f6");
  light.position.set(0.12, y - 0.02, -0.12);
  g.add(light);
  return g;
}

function ridgedSquare(width: number, depth: number, height: number, ridges: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const step = height / ridges;
  for (let i = 0; i < ridges; i++) {
    const wave = 1 + Math.sin((i + 0.5) * Math.PI) * 0.035;
    const geo = new RoundedBoxGeometry(width * wave, step * 1.12, depth * wave, 3, 0.07);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = step * 0.5 + i * step;
    g.add(mesh);
  }
  return g;
}

export function createCakes(): CakeSpec[] {
  return [
    { id: "cream-heart", accent: "#ffb7d0", plateGlow: "#3d7dff", halo: 0.9, group: buildCreamHeart() },
    { id: "strawberry", accent: "#ff5d8f", plateGlow: "#ff4d8d", halo: 0.55, group: buildStrawberry() },
    { id: "chocolate", accent: "#ffb15a", plateGlow: "#c47a3a", halo: 0.28, group: buildChocolate() },
    { id: "galaxy", accent: "#8ecbff", plateGlow: "#6d5bff", halo: 0.85, group: buildGalaxy() },
    { id: "lemon", accent: "#ffe14a", plateGlow: "#ffd15c", halo: 0.4, group: buildLemon() },
    { id: "matcha", accent: "#d6f5a8", plateGlow: "#7dffb0", halo: 0.35, group: buildMatcha() },
    { id: "rose-gold", accent: "#ffd0e0", plateGlow: "#ff8fb8", halo: 0.7, group: buildRoseGold() },
    { id: "lavender", accent: "#e6d4ff", plateGlow: "#b388ff", halo: 0.6, group: buildLavender() },
  ];
}
