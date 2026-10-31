import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createCakes, type CakeSpec } from "./cakes";
import { createAtmosphere } from "./atmosphere";
import { makeRadialTexture } from "./textures";
import "./style.css";

const DEBOUNCE_MS = 500;

type CameraPose = {
  fov: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
};

function cameraPose(aspect: number, height: number): CameraPose {
  const portrait = aspect < 0.92;
  const short = height < 520;
  if (portrait) {
    // ~34° above the horizon: top surface, toppings, and side layers all read.
    return { fov: 43, position: [0.62, 3.72, 5.19], target: [0, 0.2, 0] };
  }
  if (short) {
    return { fov: 38, position: [0.7, 2.96, 4.8], target: [0, 0.16, 0] };
  }
  return { fov: 32, position: [1.05, 2.52, 3.8], target: [0, 0.24, 0] };
}

function main(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#scene");
  const button = document.querySelector<HTMLButtonElement>("#random-cake");
  const flashQuery = document.querySelector<HTMLDivElement>("#flash");
  if (!canvas || !button || !flashQuery) return;
  const flashEl: HTMLDivElement = flashQuery;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.environmentIntensity = 0.16;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 40);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.zoomSpeed = 0.65;
  controls.rotateSpeed = 0.85;
  controls.minDistance = 3.4;
  controls.maxDistance = 9.5;
  controls.minPolarAngle = THREE.MathUtils.degToRad(18);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(82);
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

  let userAdjusted = false;
  controls.addEventListener("start", () => {
    userAdjusted = true;
  });

  scene.add(new THREE.AmbientLight(0xfff5fb, 0.12));
  const hemi = new THREE.HemisphereLight(0xc9d7ff, 0x1a0a12, 0.24);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff7fb, 1.15);
  key.position.set(2.4, 3.4, 1.8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffd0e4, 0.32);
  fill.position.set(-2.4, 1.2, 2.2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 0.7);
  rim.position.set(-2.4, 2.4, -2.2);
  scene.add(rim);

  const accent = new THREE.PointLight(0xffb7d0, 4.5, 6, 2);
  accent.position.set(0.1, 1.7, 0.45);
  scene.add(accent);
  const under = new THREE.PointLight(0x3d7dff, 1.15, 2.6, 2);
  under.position.set(0, -0.35, 0.2);
  scene.add(under);

  const centerpiece = new THREE.Group();
  scene.add(centerpiece);

  const plateMat = new THREE.MeshStandardMaterial({
    color: "#070b14",
    roughness: 0.48,
    metalness: 0.42,
    emissive: "#061018",
    emissiveIntensity: 0.22,
  });
  plateMat.envMapIntensity = 0.35;
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.28, 0.065, 80), plateMat);
  plate.position.y = -0.02;
  centerpiece.add(plate);

  const rimMat = new THREE.MeshStandardMaterial({
    color: "#07111e",
    emissive: "#1a4f8c",
    emissiveIntensity: 0.65,
    roughness: 0.45,
    metalness: 0.25,
  });
  const plateRim = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.013, 8, 96), rimMat);
  plateRim.rotation.x = Math.PI / 2;
  plateRim.position.y = 0.02;
  centerpiece.add(plateRim);

  const poolMat = new THREE.MeshBasicMaterial({
    color: "#3d7dff",
    transparent: true,
    opacity: 0.09,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const pool = new THREE.Mesh(new THREE.RingGeometry(1.16, 1.58, 72), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -0.045;
  centerpiece.add(pool);

  const shadowTex = contactShadow();
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.82, 40),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  centerpiece.add(shadow);

  const haloMat = new THREE.SpriteMaterial({
    map: makeRadialTexture(),
    color: "#ffb7d0",
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.position.set(0, 1.15, 0.05);
  halo.scale.set(1.15, 1.45, 1);
  centerpiece.add(halo);

  const cakeHolder = new THREE.Group();
  centerpiece.add(cakeHolder);
  const cakes = createCakes();
  for (const cake of cakes) {
    cake.group.visible = false;
    cakeHolder.add(cake.group);
  }

  const atmosphere = createAtmosphere(scene);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.34, 1.02);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let index = 0;
  let shake = 0;
  let pop = 1;

  function showCake(next: number): void {
    index = next;
    cakes.forEach((cake, i) => {
      cake.group.visible = i === next;
    });
    const spec: CakeSpec = cakes[next];
    accent.color.set(spec.accent);
    under.color.set(spec.plateGlow);
    rimMat.color.set(spec.plateGlow);
    poolMat.color.set(spec.plateGlow);
    haloMat.color.set(spec.accent);
    haloMat.opacity = spec.halo;
    document.body.dataset.cake = spec.id;
    pop = 0.86;
  }

  function viewSize(): { width: number; height: number } {
    const viewport = window.visualViewport;
    return {
      width: Math.max(1, Math.round(viewport?.width ?? window.innerWidth)),
      height: Math.max(1, Math.round(viewport?.height ?? window.innerHeight)),
    };
  }

  function layout(): void {
    const { width, height } = viewSize();
    const aspect = width / height;
    const dprCap = Math.min(width, height) < 520 ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);
    atmosphere.setPixelRatio(dpr);
    const pose = cameraPose(aspect, height);
    camera.fov = pose.fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (!userAdjusted) {
      camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
      controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
      controls.update();
    }
  }

  function triggerFlash(): void {
    flashEl.classList.add("show");
    window.setTimeout(() => flashEl.classList.remove("show"), 48);
  }

  let locked = false;
  button.addEventListener("click", () => {
    if (locked) return;
    locked = true;
    button.disabled = true;
    const next = randomOther(index, cakes.length);
    showCake(next);
    shake = 1;
    atmosphere.burst();
    triggerFlash();
    window.setTimeout(() => {
      locked = false;
      button.disabled = false;
    }, DEBOUNCE_MS);
  });

  showCake(0);
  layout();
  let layoutQueued = false;
  const requestLayout = (): void => {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
      layoutQueued = false;
      layout();
    });
  };
  window.addEventListener("resize", requestLayout);
  window.addEventListener("orientationchange", () => {
    window.setTimeout(layout, 80);
  });
  window.visualViewport?.addEventListener("resize", requestLayout);

  const clock = new THREE.Clock();
  function frame(): void {
    const dt = Math.min(clock.getDelta(), 0.033);
    const t = clock.elapsedTime;
    shake *= Math.exp(-dt * 6.2);
    if (shake < 0.001) shake = 0;
    pop += (1 - pop) * (1 - Math.exp(-dt * 8));
    cakeHolder.scale.setScalar(pop);
    cakeHolder.rotation.y = 0.22 + t * 0.12;
    centerpiece.rotation.z = Math.sin(t * 48) * 0.075 * shake;
    centerpiece.rotation.x = Math.sin(t * 36) * 0.04 * shake;
    centerpiece.position.x = Math.sin(t * 54) * 0.06 * shake;
    centerpiece.position.y = -0.28 + Math.sin(t * 0.85) * 0.016 + Math.sin(t * 62) * 0.02 * shake;
    accent.intensity = 4.5 + shake * 8;
    const haloPulse = cakes[index].halo;
    halo.scale.set(1.15, 1.45 * (0.55 + haloPulse * 0.45) + Math.sin(t * 1.8) * 0.04, 1);

    const visible = cakes[index].group;
    visible.traverse((obj) => {
      if (obj.name === "flame") {
        const f = 1 + Math.sin(t * 11) * 0.08 + Math.sin(t * 17.5) * 0.05;
        obj.scale.set(1, f, 1);
      }
    });

    controls.update();
    const shakeX = Math.sin(t * 51) * 0.03 * shake;
    const shakeY = Math.cos(t * 47) * 0.02 * shake;
    camera.position.x += shakeX;
    camera.position.y += shakeY;

    atmosphere.update(t, dt);
    composer.render();
    camera.position.x -= shakeX;
    camera.position.y -= shakeY;
    requestAnimationFrame(frame);
  }
  frame();
}

function randomOther(current: number, count: number): number {
  const pick = Math.floor(Math.random() * (count - 1));
  return pick >= current ? pick + 1 : pick;
}

function contactShadow(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (!g) return new THREE.CanvasTexture(canvas);
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grd.addColorStop(0, "rgba(0,0,0,0.45)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

main();
