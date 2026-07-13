"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Renderer, Triangle, Program, Mesh, Texture } from "ogl";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { webglAvailable, glDpr } from "@/lib/motion/webgl";

/**
 * Cursor-following liquid ripple for the gallery grid — the "ripple na grelha".
 *
 * The tricky part of a grid this size (hundreds of photos) is that a WebGL layer
 * per tile is a non-starter: browsers cap live GL contexts at ~16, and mounting
 * one per hover would thrash. So this is ONE persistent context living in a
 * fixed, pointer-events-none overlay that simply *repositions* itself over
 * whichever `[data-ripple]` tile the pointer is over, uploads that tile's
 * already-decoded <img> as its texture, and ripples under the cursor. It never
 * touches the tiles' DOM (so the open/close ViewTransition morph is untouched)
 * and, being pointer-events-none, never intercepts a click — it also hides
 * itself on pointerdown so the open-morph is captured clean.
 *
 * Gated to fine pointers (hover is meaningless on touch) and disabled entirely
 * under reduced motion — the grid keeps its tasteful CSS zoom + caption either
 * way; this is purely additive polish.
 */
const VERT = /* glsl */ `
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform vec2 uCover;
  uniform vec2 uMouse;   // eased pointer, uv space
  uniform float uTime;
  uniform float uHover;  // 0..1 presence
  varying vec2 vUv;
  void main() {
    vec2 uv = (vUv - 0.5) * uCover + 0.5;
    float d = distance(vUv, uMouse);
    float ripple = sin(d * 30.0 - uTime * 5.0) * exp(-d * 6.5);
    vec2 dir = normalize(vUv - uMouse + 1e-4);
    uv += dir * ripple * 0.02 * uHover;
    float sep = 0.0016 + 0.004 * uHover;
    float r = texture2D(tMap, uv + vec2(sep, 0.0)).r;
    float g = texture2D(tMap, uv).g;
    float b = texture2D(tMap, uv - vec2(sep, 0.0)).b;
    // a hair brighter under the cursor — the "wet" highlight
    float lift = 0.08 * uHover * exp(-d * 5.0);
    gl_FragColor = vec4(vec3(r, g, b) + lift, 1.0);
  }
`;

function GridRippleCanvas() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const capRef = useRef<HTMLSpanElement | null>(null);
  const subRef = useRef<HTMLSpanElement | null>(null);
  const subWrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    // Hover only makes sense with a fine pointer; touch users never see this.
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    const root = rootRef.current;
    const host = hostRef.current;
    if (!root || !host) return;
    if (!webglAvailable()) return; // no WebGL → grid keeps its CSS hover, no OGL error

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    host.appendChild(canvas);

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        canvas,
        alpha: true,
        antialias: false,
        dpr: glDpr(),
      });
    } catch {
      canvas.remove();
      return; // no WebGL → grid keeps its CSS hover
    }
    const gl = renderer.gl;

    const texture = new Texture(gl, { generateMipmaps: false });
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        tMap: { value: texture },
        uCover: { value: [1, 1] },
        uMouse: { value: [0.5, 0.5] },
        uTime: { value: 0 },
        uHover: { value: 0 },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    let tile: HTMLElement | null = null;
    let imgAspect = 1;

    const place = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      root.style.width = `${r.width}px`;
      root.style.height = `${r.height}px`;
      root.style.transform = `translate(${r.left}px, ${r.top}px)`;
      renderer.setSize(r.width, r.height);
      const ratio = r.width / r.height / imgAspect;
      program.uniforms.uCover.value = ratio > 1 ? [1, 1 / ratio] : [ratio, 1];
    };

    const targetMouse = { x: 0.5, y: 0.5 };
    const curMouse = { x: 0.5, y: 0.5 };
    let targetHover = 0;
    let curHover = 0;
    let running = false;
    let raf = 0;
    const start = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      curMouse.x += (targetMouse.x - curMouse.x) * 0.12;
      curMouse.y += (targetMouse.y - curMouse.y) * 0.12;
      curHover += (targetHover - curHover) * 0.08;
      const u = program.uniforms;
      u.uTime.value = (now - start) / 1000;
      u.uMouse.value = [curMouse.x, curMouse.y];
      u.uHover.value = curHover;
      renderer.render({ scene: mesh });
      // Once faded out and idle, stop the loop until the next hover.
      if (!tile && curHover < 0.002) {
        running = false;
        cancelAnimationFrame(raf);
        root.style.opacity = "0";
      }
    };
    const ensureRunning = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };

    const activate = (el: HTMLElement) => {
      const img = el.querySelector("img");
      if (!img || !(img.currentSrc || img.src) || !img.naturalWidth) return;
      tile = el;
      imgAspect = img.naturalWidth / img.naturalHeight || 1;
      texture.image = img;
      place(el);
      // caption mirrors the tile's own hover caption (occluded behind us)
      if (capRef.current) capRef.current.textContent = el.dataset.cap ?? "";
      const sub = el.dataset.sub ?? "";
      if (subRef.current) subRef.current.textContent = sub;
      if (subWrapRef.current) subWrapRef.current.style.display = sub ? "" : "none";
      targetHover = 1;
      root.style.opacity = "1";
      ensureRunning();
    };

    const deactivate = () => {
      tile = null;
      targetHover = 0;
    };

    const onOver = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-ripple]") as HTMLElement | null;
      if (el && el !== tile) activate(el);
    };
    const onMove = (e: PointerEvent) => {
      if (!tile) return;
      const r = tile.getBoundingClientRect();
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) {
        deactivate();
        return;
      }
      targetMouse.x = (e.clientX - r.left) / r.width;
      targetMouse.y = 1 - (e.clientY - r.top) / r.height;
    };
    const onOut = (e: PointerEvent) => {
      const to = (e.relatedTarget as HTMLElement | null)?.closest?.("[data-ripple]");
      if (!to) deactivate();
    };
    // A press is about to open the lightbox — get out of the way so the morph
    // snapshot is clean.
    const onDown = () => deactivate();
    const reposition = () => {
      if (tile) place(tile);
    };

    window.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onOut, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onOut);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, []);

  return createPortal(
    <div
      ref={rootRef}
      aria-hidden
      data-grid-ripple
      className="pointer-events-none fixed left-0 top-0 z-30 overflow-hidden opacity-0 transition-opacity duration-300 will-change-transform"
      style={{ transform: "translate(-9999px,-9999px)" }}
    >
      <div ref={hostRef} className="absolute inset-0" />
      {/* Caption mirrors the tile's native hover caption, which sits occluded
          behind this opaque canvas. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/65" />
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-2 p-3.5">
        <span className="min-w-0">
          <span
            ref={capRef}
            className="block truncate text-[12px] font-medium text-white/90"
            style={{ fontFamily: "var(--font-playfair)" }}
          />
          <span ref={subWrapRef}>
            <span
              ref={subRef}
              className="mt-0.5 block text-[9px] uppercase tracking-[0.2em] text-white/55"
            />
          </span>
        </span>
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
          <svg
            className="h-3.5 w-3.5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0zm-3-3v6m-3-3h6"
            />
          </svg>
        </span>
      </div>
    </div>,
    document.body,
  );
}

export default function GridRipple() {
  const reduced = useReducedMotion();
  // Portal + WebGL are client-only: render nothing on the server and on the
  // first client render (so hydration matches), then mount after commit.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (reduced || !mounted) return null;
  return <GridRippleCanvas />;
}
