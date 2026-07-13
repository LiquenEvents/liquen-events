"use client";

import { useEffect, useRef } from "react";
import { Renderer, Triangle, Program, Mesh, Texture } from "ogl";
import { webglAvailable, glDpr } from "@/lib/motion/webgl";
import { sizedImageSrc } from "@/lib/image-src";

/**
 * WebGL hero layer. Renders the SAME photo as the static <Image> underneath it,
 * but alive: a gentle domain-warp displacement that eases from a soft "develop"
 * on load into a slow ambient drift, a whisper of pointer parallax, a filmic
 * RGB split and a breathing vignette. It sits ON TOP of the real <Image> (which
 * stays the LCP + the fallback), fading in only once the first frame is drawn —
 * so performance/SEO never depend on WebGL, and reduced-motion / unsupported
 * devices simply keep the elegant static hero.
 */
const VERT = /* glsl */ `
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform vec2 uCover;    // cover-fit scale
  uniform vec2 uMouse;    // eased pointer, -1..1
  uniform float uTime;
  uniform float uIntro;   // 0 -> 1 settle
  uniform float uScroll;  // 0..1 hero scrolled out
  varying vec2 vUv;

  void main() {
    float rest = 1.0 - uIntro;                 // 1 at load, 0 when settled
    vec2 uv = (vUv - 0.5) * uCover + 0.5;      // cover fit

    // slow, always-alive ambient drift
    float t = uTime;
    vec2 drift = vec2(
      sin(uv.y * 5.5 + t * 0.28),
      cos(uv.x * 4.8 + t * 0.22)
    ) * 0.004;

    // stronger, higher-frequency warp that only shows during the intro settle
    vec2 develop = vec2(
      sin(uv.y * 11.0 - t * 1.8),
      cos(uv.x * 9.5 + t * 1.6)
    ) * 0.03 * rest;

    // whisper of pointer parallax + a touch of scroll-driven push
    uv += uMouse * 0.014 * (0.4 + 0.6 * (1.0 - uScroll));
    uv += drift + develop;

    // slow ken-burns-ish zoom as you scroll past
    uv = (uv - 0.5) * (1.0 - uScroll * 0.06) + 0.5;

    // filmic RGB split — barely there once settled, a gentle bloom during the
    // intro (kept low so the "develop" reads as filmic, not like a broken frame)
    float sep = 0.0012 + 0.006 * rest;
    float r = texture2D(tMap, uv + vec2(sep, 0.0)).r;
    float g = texture2D(tMap, uv).g;
    float b = texture2D(tMap, uv - vec2(sep, 0.0)).b;
    vec3 col = vec3(r, g, b);

    // breathing vignette for depth
    float d = distance(vUv, vec2(0.5));
    float vig = smoothstep(1.05, 0.3, d);
    col *= 0.72 + 0.28 * vig;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function HeroCanvas({ src, className }: { src: string; className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Bail before touching OGL if the platform can't do WebGL — OGL logs a
    // console error otherwise (headless/no-GPU); the static <Image> stays.
    if (!webglAvailable()) return;

    // Create the canvas imperatively (not via JSX): under React StrictMode the
    // effect mounts→unmounts→mounts, and a WebGL context, once lost on cleanup,
    // can't be re-acquired from the same <canvas>. A fresh canvas per run keeps
    // dev and prod identical.
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 1200ms ease-out;";
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
      return; // no WebGL → static <Image> stays
    }
    const gl = renderer.gl;

    const texture = new Texture(gl, { generateMipmaps: false });
    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        tMap: { value: texture },
        uCover: { value: [1, 1] },
        uMouse: { value: [0, 0] },
        uTime: { value: 0 },
        uIntro: { value: 0 },
        uScroll: { value: 0 },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    let imgAspect = 1;
    const setCover = () => {
      // Size from the HOST (OGL's constructor pins the canvas to its own default
      // 300×150 and rewrites canvas.style.width, so measuring the canvas would
      // dead-lock at 300). setSize rewrites the canvas px size to fill the host.
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      const viewAspect = w / h;
      const ratio = viewAspect / imgAspect;
      program.uniforms.uCover.value = ratio > 1 ? [1, 1 / ratio] : [ratio, 1];
    };
    setCover(); // fill the host immediately, before the texture resolves

    // Reuse the hero <Image>'s already-decoded bitmap as the GL texture instead
    // of fetching a second copy: it's the exact photo the browser just loaded
    // for the LCP (GridRipple/PhotoWall use the same trick), so this WebGL layer
    // costs zero extra network. Only if the hero <img> can't be found (markup
    // changed) do we fall back to our own right-sized fetch.
    let hasTexture = false;
    const applyTexture = (im: HTMLImageElement) => {
      if (!im.naturalWidth) return;
      texture.image = im;
      imgAspect = im.naturalWidth / im.naturalHeight || 1;
      hasTexture = true;
      setCover();
    };
    const heroImg = (host.closest("section")?.querySelector("img") ??
      null) as HTMLImageElement | null;
    const onHeroLoad = () => heroImg && applyTexture(heroImg);
    if (heroImg) {
      if (heroImg.complete && heroImg.naturalWidth) applyTexture(heroImg);
      else heroImg.addEventListener("load", onHeroLoad);
    } else {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => applyTexture(img);
      img.src = sizedImageSrc(src, 1920);
      if (img.complete) applyTexture(img);
    }

    // eased pointer
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const ro = new ResizeObserver(setCover);
    ro.observe(host);

    // pause when offscreen or tab hidden — no wasted GPU
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), {
      threshold: 0,
    });
    io.observe(host);

    const start = performance.now();
    let raf = 0;
    let firstFrame = true;
    let lastPaint = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const hidden = document.hidden || !visible;
      if (hidden && !firstFrame) return;

      const elapsed = (now - start) / 1000;
      // Once the intro has settled the only motion left is a very slow ambient
      // drift + a whisper of pointer parallax — cap it to ~30fps (imperceptible
      // at this speed) to roughly halve the hero's steady-state GPU cost. The
      // load reveal keeps full 60fps so it stays buttery.
      if (elapsed > 2.6 && !firstFrame && now - lastPaint < 32) return;
      lastPaint = now;
      const u = program.uniforms;
      u.uTime.value = elapsed;
      // settle over ~2.6s with an ease-out
      u.uIntro.value = Math.min(1, 1 - Math.pow(1 - Math.min(elapsed / 2.6, 1), 3));
      current.x += (target.x - current.x) * 0.05;
      current.y += (target.y - current.y) * 0.05;
      u.uMouse.value = [current.x, current.y];
      const heroH = host.clientHeight || window.innerHeight;
      u.uScroll.value = Math.min(1, (window.scrollY || 0) / heroH);

      renderer.render({ scene: mesh });
      if (firstFrame && hasTexture) {
        firstFrame = false;
        canvas.style.opacity = "1"; // fade the WebGL layer in over the still
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      heroImg?.removeEventListener("load", onHeroLoad);
      ro.disconnect();
      io.disconnect();
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
      canvas.remove();
    };
  }, [src]);

  return <div ref={hostRef} aria-hidden className={className} />;
}
