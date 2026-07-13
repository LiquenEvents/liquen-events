"use client";

import { useEffect, useRef } from "react";
import { Renderer, Triangle, Program, Mesh, Texture } from "ogl";

/**
 * A WebGL image plane with a cursor-following liquid ripple: concentric waves
 * emanate from the pointer and the image warps around it, easing up while the
 * pointer is over it and settling when it leaves. Sits ON TOP of a static
 * <Image> (the LCP + fallback) and fades in when ready — reduced motion / no
 * WebGL just keep the still. Same StrictMode-safe imperative-canvas scaffolding
 * as HeroCanvas.
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
  uniform vec2 uMouse;   // pointer in uv space (0..1), eased
  uniform float uTime;
  uniform float uHover;  // 0..1 presence of the pointer
  uniform float uIntro;  // 0..1 load settle
  varying vec2 vUv;

  void main() {
    vec2 uv = (vUv - 0.5) * uCover + 0.5;

    // concentric ripple centred on the pointer, decaying with distance
    float d = distance(vUv, uMouse);
    float ripple = sin(d * 34.0 - uTime * 5.5) * exp(-d * 7.0);
    vec2 dir = normalize(vUv - uMouse + 1e-4);
    uv += dir * ripple * 0.022 * uHover;

    // gentle always-alive drift + the load "develop"
    float rest = 1.0 - uIntro;
    uv += vec2(sin(uv.y * 5.0 + uTime * 0.25), cos(uv.x * 4.5 + uTime * 0.2)) * 0.003;
    uv += vec2(sin(uv.y * 10.0 - uTime * 1.7), cos(uv.x * 9.0 + uTime * 1.5)) * 0.04 * rest;

    float sep = 0.0012 + 0.01 * rest + 0.004 * uHover;
    float r = texture2D(tMap, uv + vec2(sep, 0.0)).r;
    float g = texture2D(tMap, uv).g;
    float b = texture2D(tMap, uv - vec2(sep, 0.0)).b;
    vec3 col = vec3(r, g, b);

    float vig = smoothstep(1.05, 0.3, distance(vUv, vec2(0.5)));
    col *= 0.74 + 0.26 * vig;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function sizedSrc(src: string): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=1920&q=75`;
}

export default function ShaderImage({ src, className }: { src: string; className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 1000ms ease-out;";
    host.appendChild(canvas);

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        canvas,
        alpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch {
      canvas.remove();
      return;
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
        uIntro: { value: 0 },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    let imgAspect = 1;
    const setCover = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      const ratio = w / h / imgAspect;
      program.uniforms.uCover.value = ratio > 1 ? [1, 1 / ratio] : [ratio, 1];
    };
    setCover();

    const img = new Image();
    img.decoding = "async";
    const onImg = () => {
      if (!img.naturalWidth) return;
      texture.image = img;
      imgAspect = img.naturalWidth / img.naturalHeight || 1;
      setCover();
    };
    img.onload = onImg;
    img.src = sizedSrc(src);
    if (img.complete) onImg();

    // pointer: target uv (0..1, y-flipped for uv space) + hover presence.
    // Listen on window and hit-test the host rect — the gradient overlays that
    // sit above the canvas (for text legibility) would otherwise swallow the
    // events. Hover eases in only while the pointer is actually over the image.
    const targetMouse = { x: 0.5, y: 0.5 };
    const curMouse = { x: 0.5, y: 0.5 };
    let targetHover = 0;
    let curHover = 0;
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside) {
        targetMouse.x = (e.clientX - r.left) / r.width;
        targetMouse.y = 1 - (e.clientY - r.top) / r.height;
      }
      targetHover = inside ? 1 : 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const ro = new ResizeObserver(setCover);
    ro.observe(host);
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 });
    io.observe(host);

    const start = performance.now();
    let raf = 0;
    let firstFrame = true;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if ((document.hidden || !visible) && !firstFrame) return;
      const t = (now - start) / 1000;
      const u = program.uniforms;
      u.uTime.value = t;
      u.uIntro.value = Math.min(1, 1 - Math.pow(1 - Math.min(t / 2.2, 1), 3));
      curMouse.x += (targetMouse.x - curMouse.x) * 0.08;
      curMouse.y += (targetMouse.y - curMouse.y) * 0.08;
      curHover += (targetHover - curHover) * 0.06;
      u.uMouse.value = [curMouse.x, curMouse.y];
      u.uHover.value = curHover;
      renderer.render({ scene: mesh });
      if (firstFrame && img.complete && img.naturalWidth) {
        firstFrame = false;
        canvas.style.opacity = "1";
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [src]);

  return <div ref={hostRef} aria-hidden className={className} />;
}
