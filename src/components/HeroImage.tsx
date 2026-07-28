"use client";

import Image, { type ImageProps } from "next/image";
import { heroImageLoader } from "@/lib/hero-image-loader";

/**
 * Thin wrapper around next/image for the full-bleed page heroes. It injects the
 * `heroImageLoader`, which resolves each srcset candidate to a static,
 * build-time WebP under `/_img` (see scripts/pregen-heroes.mjs) instead of the
 * on-demand `/_next/image` optimizer — so the first visitor after a deploy sees
 * a sharp hero with no cold-encode blur.
 *
 * This is a Client Component only because a loader is a function prop, which
 * can't be passed to next/image from a Server Component (the hero pages). It
 * still SSRs and still emits the `priority` preload; behaviour is otherwise
 * identical to a plain <Image>.
 */
export default function HeroImage(props: ImageProps) {
  // `alt` is forwarded from the caller via {...props}; the lint rule can't see
  // through the spread, so it's disabled here rather than at every call site.
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image loader={heroImageLoader} {...props} />;
}
