"use client";

import ReactDOM from "react-dom";
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
 *   · um pré-carregamento nosso, com `type="image/avif"` e o `imageSrcSet` do
 *     AVIF, para o browser puxar a fonte que vai MESMO usar.
 *
 * ── E ONDE É QUE ELE ATERRA NO DOCUMENTO ──────────────────────────────────
 *
 * Isto esteve escrito como um `<link>` em JSX, com um comentário meu a dizer
 * que «o React 19 iça-o para o `<head>` sozinho». FUI MEDIR NO HTML CONSTRUÍDO
 * e é falso: o `</head>` fecha no byte 5456 e o `<link>` do herói saía no byte
 * 31 982 — dentro do corpo, depois da barra de navegação, do menu de telemóvel
 * e de três blocos de dados estruturados. O pedido do elemento de LCP saía a
 * 1/6 do documento mais tarde do que podia, e o comentário garantia o
 * contrário a quem viesse a seguir.
 *
 * `ReactDOM.preload` é a API que faz mesmo o que aquele comentário prometia: é
 * declarada durante o render e o React põe-na no `<head>`, deduplicada. O
 * `<link>` em JSX fica para quem o quiser voltar a tentar — mas então que meça
 * o byte, como aqui.
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

  // Declarado durante o render, que é como esta API se usa. O `href` é o maior
  // degrau: serve de chave de deduplicação e de recurso para quem não perceba
  // `imageSrcSet` — quem perceber escolhe pelo srcset e ignora-o.
  if (avif && priority) {
    const maior = avif.split(", ").pop()?.split(" ")[0] ?? "";
    ReactDOM.preload(maior, {
      as: "image",
      type: "image/avif",
      imageSrcSet: avif,
      imageSizes: sizes,
      fetchPriority: "high",
    });
  }

  const imagem = (
    // O `eslint-disable` do `jsx-a11y/alt-text` que aqui estava deixou de ser
    // preciso: a regra só olha para `next/image`, e isto agora é o SafeImage.
    <SafeImage
      initialLoader={heroImageLoader}
      src={src}
      sizes={sizes}
      /**
       * SÓ O HERÓI DE PRIORIDADE TROCA DE MECANISMO.
       *
       * A primeira versão disto aplicava `loading="eager"` a QUALQUER herói com
       * AVIF, tivesse ele prioridade ou não. Hoje isso não muda nada em página
       * nenhuma — contadas uma a uma, as 10 utilizações do `<HeroImage>` passam
       * todas `priority`, porque um herói está sempre no topo da sua página. É
       * uma armadilha, não um defeito à vista: o primeiro herói que alguém puser
       * abaixo da dobra sem `priority` seria descarregado já, a roubar a ligação
       * ao que está mesmo à frente dos olhos, e nada o denunciaria.
       *
       * (Foi assim que apareceu: fui verificar o HTML servido à procura de outra
       * coisa. Ao escrever isto como "há heróis abaixo da dobra" estava a
       * descrever um risco como se fosse um sintoma — não era, e fica corrigido.)
       *
       * Sem prioridade: nada muda, o `priority` do Next passa como sempre
       * passou (`false`) e o `lazy` continua a decidir.
       * Com prioridade e AVIF: o preload do Next é desligado — apontaria para o
       * WebP que o `<picture>` não vai usar — e substituído pelo nosso, mais o
       * `eager`/`high` que é o que o `priority` fazia de útil.
       */
      {...(avif && priority
        ? { priority: false, loading: "eager" as const, fetchPriority: "high" as const }
        : { priority })}
      {...resto}
    />
  );

  if (!avif) return imagem;

  return (
    <picture>
      <source type="image/avif" srcSet={avif} sizes={sizes} />
      {imagem}
    </picture>
  );
}
