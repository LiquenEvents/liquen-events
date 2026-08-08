"use client";

import SafeImage, { type SafeImageProps } from "@/components/SafeImage";
import { heroImageLoader, heroAvifSrcSet } from "@/lib/hero-image-loader";

/**
 * Thin wrapper around next/image for the full-bleed page heroes. It injects the
 * `heroImageLoader`, which resolves each srcset candidate to a static,
 * build-time file under `/_img` (see scripts/pregen-heroes.mjs) instead of the
 * on-demand `/_next/image` optimizer — so the first visitor after a deploy sees
 * a sharp hero with no cold-encode blur.
 *
 * This is a Client Component only because a loader is a function prop, which
 * can't be passed to next/image from a Server Component (the hero pages). It
 * still SSRs; behaviour is otherwise identical to a plain <Image>.
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
/**
 * ════════════════════════════════════════════════════════════════════════════
 * E AGORA COM AVIF — mas o pré-carregamento teve de ser escrito à mão
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO: na secretária o herói **é** o elemento de LCP (3388 ms), e são
 * 104,6 KB em WebP a 2048 px. A grelha da galeria tem 2785 ficheiros AVIF;
 * a pasta dos heróis tinha 192 WebP e zero. Ficaram de fora da conversão.
 *
 * ── PORQUE É QUE NÃO BASTOU PÔR UM `<picture>` ────────────────────────────
 *
 * O `priority` do `next/image` faz o Next emitir um `<link rel="preload">` — e
 * esse preload aponta para o `srcset` do `<img>`, que é WebP. Num browser com
 * AVIF, o `<picture>` escolheria o AVIF e o preload teria descarregado o WebP
 * **para nada**: dois downloads do elemento mais pesado da página, que é o
 * contrário exacto do que isto serve.
 *
 * Por isso o `priority` do Next é DESLIGADO e substituído por três coisas
 * escritas aqui:
 *   · `loading="eager"` + `fetchPriority="high"` no `<img>`, que é o que o
 *     `priority` fazia de útil;
 *   · um `<link rel="preload">` nosso, com `type="image/avif"` e o `imageSrcSet`
 *     do AVIF, para o browser puxar a fonte que vai MESMO usar. O React 19
 *     iça-o para o `<head>` sozinho, de onde quer que seja desenhado.
 *
 * ── A SALVAGUARDA ─────────────────────────────────────────────────────────
 *
 * A `<source>` AVIF só é emitida quando `heroAvifSrcSet` reconhece a origem —
 * ou seja, exactamente para os ficheiros que o pré-gerador produz. Isto
 * importa: o browser escolhe a fonte pelo `type`, não por ela existir. Um
 * `<source>` a apontar para um AVIF que não foi gerado dava um herói partido
 * e a rede de recuperação do `SafeImage` ficava do lado de lá a olhar, porque
 * ela vive no `<img>` e o `<img>` nem chegaria a ser escolhido.
 */
export default function HeroImage(props: Omit<SafeImageProps, "initialLoader">) {
  const { priority, sizes, src, ...resto } = props;
  const avif = typeof src === "string" ? heroAvifSrcSet(src) : null;

  const imagem = (
    // O `eslint-disable` do `jsx-a11y/alt-text` que aqui estava deixou de ser
    // preciso: a regra só olha para `next/image`, e isto agora é o SafeImage.
    <SafeImage
      initialLoader={heroImageLoader}
      src={src}
      sizes={sizes}
      // Sem AVIF nada muda: o `priority` do Next continua a fazer o seu
      // preload, que aponta para o WebP que o `<img>` vai mesmo usar.
      {...(avif
        ? { priority: false, loading: "eager" as const, fetchPriority: "high" as const }
        : { priority })}
      {...resto}
    />
  );

  if (!avif) return imagem;

  return (
    <>
      {priority && (
        <link
          rel="preload"
          as="image"
          type="image/avif"
          imageSrcSet={avif}
          imageSizes={sizes}
          fetchPriority="high"
        />
      )}
      <picture>
        <source type="image/avif" srcSet={avif} sizes={sizes} />
        {imagem}
      </picture>
    </>
  );
}
