"use client";

import SafeImage, { type SafeImageProps } from "@/components/SafeImage";
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
/**
 * ACRESCENTADO: o herói passou a ter rede.
 *
 * Era um `<Image>` cru, portanto um único erro deixava-o partido para o resto
 * da visita — na maior imagem de cada página. Medido com a derivada forçada a
 * falhar em todas as páginas: das 12 imagens que ainda partiam depois de o
 * resto do sítio passar a `SafeImage`, 10 eram heróis. Agora o herói cai no
 * ficheiro original (`/imagens/…`, versionado, existe sempre) tal como as
 * outras, e o `heroImageLoader` fica só para a PRIMEIRA tentativa — é ele que
 * dá a escada própria até 2048 px que os heróis precisam e as fotos comuns não.
 */
export default function HeroImage(props: Omit<SafeImageProps, "initialLoader">) {
  // O `eslint-disable` do `jsx-a11y/alt-text` que aqui estava deixou de ser
  // preciso: a regra só olha para `next/image`, e isto agora é o SafeImage.
  return <SafeImage initialLoader={heroImageLoader} {...props} />;
}
