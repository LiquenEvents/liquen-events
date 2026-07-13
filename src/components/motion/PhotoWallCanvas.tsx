"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Renderer, Camera, Transform, Plane, Program, Mesh, Texture } from "ogl";
import { webglAvailable, glDpr } from "@/lib/motion/webgl";
import { sizedImageSrc } from "@/lib/image-src";

/**
 * A 3D curved photo carousel (WebGL / OGL). The gallery photos are arranged on a
 * gentle cylinder that drifts on its own, spins to the drag/swipe with inertia,
 * and nods slightly as the section scrolls through the viewport. It sits ON TOP
 * of the flat CSS ribbon (the SSR + reduced-motion + no-WebGL fallback) and only
 * reveals itself — via `onReady` — once the first frame is drawn, so LCP/SEO and
 * the accessible <Link> never depend on WebGL. Same StrictMode-safe
 * imperative-canvas scaffolding as HeroCanvas.
 *
 * A pointer click that isn't a drag navigates to the gallery (`href`); keyboard
 * and screen-reader users reach it through the always-present focusable pill the
 * wrapper renders above this canvas.
 */
const VERT = /* glsl */ `
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform vec2 uCover;   // cover-fit scale
  uniform float uDim;    // 0..1 facing brightness (edges recede into the dark)
  varying vec2 vUv;
  void main() {
    vec2 uv = (vUv - 0.5) * uCover + 0.5;
    vec3 col = texture2D(tMap, uv).rgb;
    // soft per-photo vignette for depth (light touch — keep the photo bright)
    float d = distance(vUv, vec2(0.5));
    float vig = smoothstep(1.15, 0.35, d);
    col *= 0.92 + 0.08 * vig;
    col *= uDim;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Large 3:2 cards — with the closer camera (see resize) the lead photo reads
// as the stage's centerpiece instead of a small floating tile.
const PLANE_W = 1.9;
const PLANE_H = PLANE_W / 1.5;
const PLANE_ASPECT = PLANE_W / PLANE_H;

export default function PhotoWallCanvas({
  images,
  href,
  onReady,
  className,
}: {
  images: string[];
  href: string;
  onReady?: () => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  // Keep the latest href/onReady reachable from the long-lived effect below
  // without re-running it — synced after each render (writing refs during
  // render is disallowed).
  const hrefRef = useRef(href);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    hrefRef.current = href;
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || images.length === 0) return;
    // No WebGL → keep the flat ribbon fallback, and don't let OGL log an error.
    if (!webglAvailable()) return;

    // Imperative canvas (StrictMode-safe — a lost WebGL context can't be
    // re-acquired from the same <canvas>; a fresh one per effect run keeps dev
    // and prod identical).
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 900ms ease-out;touch-action:pan-y;cursor:grab;";
    host.appendChild(canvas);

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        canvas,
        alpha: true,
        antialias: true,
        dpr: glDpr(),
      });
    } catch {
      canvas.remove();
      return; // no WebGL → flat ribbon stays
    }
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    const camera = new Camera(gl, { fov: 38, near: 0.1, far: 100 });

    const N = images.length;
    const angleStep = (Math.PI * 2) / N;
    // Radius so neighbouring photos sit a comfortable arc apart (1.22 keeps
    // them close enough that the stage reads full, not sparse).
    const R = (PLANE_W * 1.22 * N) / (Math.PI * 2);
    // camera.position.z is set per-aspect in resize() below — close on wide
    // screens so the lead photo dominates the stage, further back on narrow
    // ones so it still fits.

    const group = new Transform();
    const geometry = new Plane(gl, { width: PLANE_W, height: PLANE_H });

    type Card = { mesh: Mesh; program: Program; base: number };
    const cards: Card[] = [];

    images.forEach((src, i) => {
      const texture = new Texture(gl, { generateMipmaps: false });
      const program = new Program(gl, {
        vertex: VERT,
        fragment: FRAG,
        cullFace: gl.BACK, // back half of the ring is culled → a clean front arc
        uniforms: {
          tMap: { value: texture },
          uCover: { value: [1, 1] },
          uDim: { value: 1 },
        },
      });
      const mesh = new Mesh(gl, { geometry, program });
      const base = i * angleStep;
      mesh.position.set(Math.sin(base) * R, 0, Math.cos(base) * R);
      mesh.rotation.y = base; // face outward
      mesh.setParent(group);
      cards.push({ mesh, program, base });

      const img = new Image();
      img.decoding = "async";
      const onImg = () => {
        if (!img.naturalWidth) return;
        texture.image = img;
        const imgAspect = img.naturalWidth / img.naturalHeight || 1;
        const s = imgAspect / PLANE_ASPECT;
        program.uniforms.uCover.value = s > 1 ? [1 / s, 1] : [1, s];
      };
      img.onload = onImg;
      // 768px matches the flat ribbon's own next/image request (sizes="720px"
      // → 768px device width) EXACTLY, so the browser serves this carousel
      // texture from cache instead of downloading a second copy — and the
      // larger stage cards stay sharp.
      img.src = sizedImageSrc(src, 768);
      if (img.complete) onImg();
    });

    const resize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || 400;
      renderer.setSize(w, h);
      const a = w / h;
      camera.perspective({ aspect: a });
      // Frame the stage like a hero, not a distant diorama. Continuous framing:
      // 2.05 fills ~90% of the stage height with the lead photo on wide
      // screens; 2.9/a is the width constraint that backs the camera off on
      // narrow/tall stages so the photo always fits with a small margin.
      camera.position.z = R + Math.max(2.05, 2.9 / a);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // ── Interaction: drag to spin (with inertia), auto-drift at rest ──
    let rot = 0; // accumulated ring rotation
    let vel = 0; // angular velocity
    let dragging = false;
    let lastX = 0;
    let downX = 0;
    let downY = 0;
    let downT = 0;
    let moved = 0;
    const SENS = 0.005; // px → radians
    const AUTO = 0.0016; // idle drift per frame

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = downX = e.clientX;
      downY = e.clientY;
      downT = performance.now();
      moved = 0;
      vel = 0;
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      rot += dx * SENS;
      vel = dx * SENS;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = "grab";
      // A short, near-stationary press is a click → open the gallery.
      const dt = performance.now() - downT;
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist < 6 && dt < 500 && moved < 6) {
        router.push(hrefRef.current);
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // Subtle scroll-driven nod: the ring tilts a few degrees as the section
    // travels through the viewport, adding depth without fighting the spin.
    let tiltTarget = 0;
    const onScroll = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const center = r.top + r.height / 2;
      const p = (center - vh / 2) / vh; // ~ -0.5..0.5 across the viewport
      // Gentler than before (±0.10, not ±0.16): the lead photo now nearly
      // fills the stage height, so a strong tilt would clip its corners.
      tiltTarget = Math.max(-0.1, Math.min(0.1, p * 0.3));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 });
    io.observe(host);

    let raf = 0;
    let firstFrame = true;
    let tilt = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if ((document.hidden || !visible) && !firstFrame) return;

      if (!dragging) {
        rot += vel; // inertia
        vel *= 0.94; // decay
        if (Math.abs(vel) < 0.0004) {
          vel = 0;
          rot += AUTO; // idle drift once inertia dies
        }
      }
      group.rotation.y = rot;
      tilt += (tiltTarget - tilt) * 0.06;
      group.rotation.x = tilt;

      // Per-card facing brightness: photos rotating to the edge recede — but
      // only gently. A higher floor (0.34, not 0.18) keeps the side photos
      // clearly visible and premium instead of murky/near-black.
      for (const c of cards) {
        const facing = Math.cos(c.base + rot); // 1 = front, -1 = back
        c.program.uniforms.uDim.value = 0.34 + 0.66 * Math.max(0, facing);
      }

      renderer.render({ scene: group, camera });

      if (firstFrame) {
        firstFrame = false;
        canvas.style.opacity = "1";
        onReadyRef.current?.();
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      window.removeEventListener("scroll", onScroll);
      ro.disconnect();
      io.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
    // router is stable; images identity drives a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  return <div ref={hostRef} aria-hidden className={className} />;
}
