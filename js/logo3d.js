/* ==========================================================================
   Metallic 3D wordmark (homepage hero)

   Loads the flat logo SVG, extrudes its paths into 3D geometry and renders
   it as liquid chrome with a brand-pink environment reflection. The mesh
   drifts gently and tilts toward the pointer. Rendering is paused whenever
   the hero slide is off-screen or the tab is hidden.

   Progressive enhancement: the flat <img.slide-home__logo> is the baseline.
   This module fades a <canvas> in over it only after the first successful
   frame; if WebGL is missing or three.js fails to load, nothing changes.
   ========================================================================== */

import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

const slide = document.querySelector(".slide-home");
const img = document.querySelector(".slide-home__logo");
if (slide && img) init();

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    );
  } catch (e) {
    return false;
  }
}

async function init() {
  if (!webglAvailable()) return;

  const reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let svgText;
  try {
    svgText = await fetch(img.currentSrc || img.src).then(function (r) {
      if (!r.ok) throw new Error("logo svg " + r.status);
      return r.text();
    });
  } catch (e) {
    console.warn("[logo3d]", e.message || e);
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "slide-home__logo3d";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", img.alt || "Pink Party Girls");
  slide.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 6.8);

  // Chrome via a procedural matcap — reads unmistakably as polished metal,
  // costs nothing, and needs no environment / lighting rig.
  const material = new THREE.MeshMatcapMaterial({
    matcap: makeChromeMatcap(),
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  material.toneMapped = false;

  // ---- build geometry from the SVG paths --------------------------------
  const paths = new SVGLoader().parse(svgText).paths;
  const group = new THREE.Group();

  paths.forEach(function (path, i) {
    const shapes = SVGLoader.createShapes(path);
    shapes.forEach(function (shape) {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 58,
        bevelEnabled: true,
        bevelThickness: 6,
        bevelSize: 3,
        bevelSegments: 3,
        curveSegments: 12,
      });
      const mesh = new THREE.Mesh(geo, material);
      // Nudge overlapping script strokes apart to limit z-fighting.
      mesh.position.z = i * 0.2;
      group.add(mesh);
    });
  });

  group.scale.y = -1; // SVG y-axis points down
  group.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);

  const pivot = new THREE.Group();
  pivot.add(group);
  pivot.scale.setScalar(3.4 / Math.max(size.x, size.y));
  scene.add(pivot);

  // Held at a three-quarter angle so the extruded sides are always in view.
  const BASE_YAW = 0.3;
  const BASE_TILT = -0.13;
  pivot.rotation.set(BASE_TILT, BASE_YAW, 0);

  // ---- sizing ----------------------------------------------------------
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  // ---- pointer --------------------------------------------------------
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!reduceMotion) {
    window.addEventListener(
      "pointermove",
      function (e) {
        ptr.tx = e.clientX / window.innerWidth - 0.5;
        ptr.ty = e.clientY / window.innerHeight - 0.5;
      },
      { passive: true }
    );
  }

  // ---- render loop with visibility gating -----------------------------
  let running = false;
  let raf = 0;
  let t = 0;
  let revealed = false;

  function frame() {
    raf = requestAnimationFrame(frame);
    t += 1 / 60;

    ptr.x += (ptr.tx - ptr.x) * 0.05;
    ptr.y += (ptr.ty - ptr.y) * 0.05;

    pivot.rotation.y =
      BASE_YAW + Math.sin(t * 0.3) * 0.18 + ptr.x * 0.55;
    pivot.rotation.x =
      BASE_TILT + ptr.y * 0.3 + Math.sin(t * 0.42) * 0.04;

    renderer.render(scene, camera);

    if (!revealed) {
      revealed = true;
      slide.classList.add("is-3d");
    }
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  if (reduceMotion) {
    // Single static hero frame, no animation.
    renderer.render(scene, camera);
    slide.classList.add("is-3d");
    window.addEventListener("resize", function () {
      resize();
      renderer.render(scene, camera);
    });
    return;
  }

  let heroVisible = true;
  const io = new IntersectionObserver(
    function (entries) {
      heroVisible = entries[0].isIntersecting;
      if (heroVisible && !document.hidden) start();
      else stop();
    },
    { threshold: 0.04 }
  );
  io.observe(slide);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden || !heroVisible) stop();
    else start();
  });

  start();
}

/* Procedural chrome matcap: a shaded sphere with a bright sky, a hard
   horizon, a dark floor, sharp hotspots and a pink brand bounce. */
function makeChromeMatcap() {
  const s = 512;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");

  // Sky → hard horizon → floor ramp.
  const base = g.createLinearGradient(0, 0, 0, s);
  base.addColorStop(0.0, "#9aa0b0");
  base.addColorStop(0.18, "#d5d9e2");
  base.addColorStop(0.4, "#8f94a1");
  base.addColorStop(0.48, "#dfe4ec");
  base.addColorStop(0.5, "#ffffff");
  base.addColorStop(0.53, "#5c5f68");
  base.addColorStop(0.68, "#26272d");
  base.addColorStop(1.0, "#050506");
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);

  g.globalCompositeOperation = "lighter";

  // Cool sky bounce, upper left.
  radial(g, s * 0.3, s * 0.28, s * 0.55, "rgba(150,180,255,0.32)");
  // Pink brand bounce, lower right.
  radial(g, s * 0.72, s * 0.72, s * 0.5, "rgba(255,80,150,0.5)");

  // Hard specular hotspots.
  radial(g, s * 0.32, s * 0.26, s * 0.15, "rgba(255,255,255,1)");
  radial(g, s * 0.66, s * 0.62, s * 0.07, "rgba(255,255,255,0.95)");

  // Round the sphere off with an edge vignette.
  g.globalCompositeOperation = "source-over";
  const v = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.52);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.6)");
  g.fillStyle = v;
  g.fillRect(0, 0, s, s);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function radial(g, x, y, r, color) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}
