"use client";

import Image, { type ImageLoaderProps, type ImageProps } from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Uma imagem do sítio que não fica partida por causa de UM erro de rede.
 *
 * PORQUÊ ESTE COMPONENTE EXISTE. A queixa da dona ("as fotos falham imenso,
 * muitas vezes nem aparecem") já foi resolvida DENTRO da galeria
 * (src/app/[lang]/galeria/GalleryImage.tsx). O resto do sítio não tinha nada
 * disso: `grep -c onError src/components src/app/[lang]/servicos` dava 0, e um
 * `<Image>` do Next sem `onError` é definitivo — ao falhar, o próprio next/image
 * faz `setShowAltText(true)`, ou seja PINTA O TEXTO ALTERNATIVO por cima do
 * ícone de imagem partida. É exactamente o que se vê nas capturas de ecrã que
 * ela mandou: as miniaturas do menu partidas e o "Momentos que criámos" com o
 * texto alternativo à vista.
 *
 * O QUE SE HERDOU DA GALERIA (o padrão que lá está medido):
 *  1. ao PRIMEIRO erro vai-se já ao ficheiro original, sem esperar. Todas as
 *     imagens deste sítio vivem em `public/` (`/imagens/…`, `/logo-liquen.png`)
 *     e portanto estão versionadas no repositório: existem sempre. O que falha
 *     é a DERIVADA — hoje o WebP pré-gerado em `/_img/…` (que pode faltar: uma
 *     foto acrescentada sem correr o pré-gerador, um deploy truncado), ontem o
 *     `/_next/image` (encode a frio, rajada, quota). Uma escada de espera contra
 *     um 404 só gasta segundos: na galeria isso custava 4 pedidos e 7,8 s POR
 *     mosaico antes de se chegar ao ficheiro que existia desde o início;
 *  2. ao original, sim, aplica-se o recuo exponencial (600 ms, 1800 ms,
 *     5400 ms, tecto de 4 tentativas). Aqui uma falha volta a ser plausivelmente
 *     passageira (a rede do visitante), e esperar resolve;
 *  3. cada tentativa leva um anti-cache (`?r=N`) E desmonta/remonta o `<img>`
 *     (`key={bust}`). Sem o par desmontar/remontar o browser NÃO repete o
 *     pedido — está medido na galeria: tentativas por URL falhado {min:1,max:1};
 *  4. esgotado tudo, mostra-se algo digno — nunca o ícone partido;
 *  5. recupera-se quando a imagem reentra no ecrã ou quando a rede volta.
 *
 * O QUE FICOU DELIBERADAMENTE DE FORA (a galeria tem exigências que não são
 * genéricas — ver o relatório):
 *  • a FILA de pedidos em voo (load-queue.ts). Existe porque a galeria monta
 *    427 fotos numa página e a rajada media 116 pedidos simultâneos. As páginas
 *    deste sítio têm menos de dez imagens cada; uma fila partilhada só criaria
 *    acoplamento entre páginas e um risco de bloqueio de cabeça de fila mesmo à
 *    frente do herói (o candidato a LCP);
 *  • o IntersectionObserver de ARRANQUE + `NEAR_VIEWPORT`. Só faz sentido a
 *    acompanhar a fila; sem ela, quem adia o que está longe do ecrã é o
 *    `loading="lazy"` do próprio browser, que nem precisa de hidratação;
 *  • o `galleryImageUrl` (miniaturas WebP pré-geradas em `/_img/g/`) e o
 *    `<ViewTransition>` do mosaico-herói, que obrigam a galeria a ter no máximo
 *    UM filho montado de cada vez. Aqui o primeiro pedido é feito pelo loader
 *    que o sítio tiver configurado — não se toma nenhuma decisão sobre ele.
 *
 * NOTA SOBRE HIDRATAÇÃO: um erro que aconteça ANTES de o React hidratar
 * perder-se-ia. Não se perde porque o próprio next/image trata disso — ao
 * montar, e só quando existe `onError`, refaz `img.src = img.src` para o erro
 * voltar a disparar (ver node_modules/next/dist/client/image-component.js:141).
 * É mais uma razão para o `onError` deste componente existir.
 */

/** 1 tentativa + 3 re-tentativas AO ORIGINAL. Depois disto, o recurso digno. */
const MAX_ATTEMPTS = 4;
/** Recuo exponencial (x3), o mesmo da galeria. */
const BACKOFF_MS = [600, 1800, 5400];

/**
 * Superfície neutra para o último recurso quando quem chama não passa um
 * `blurDataURL`. É o mesmo WebP escuro que `src/lib/blur.ts` usa como omissão,
 * copiado (e não importado) de propósito: `blurFor` puxa o `blur-map.json`
 * (108 KB) e este componente corre no browser, inclusive no Navbar, que está em
 * todas as páginas.
 */
const NEUTRAL_BLUR =
  "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoQAAwAA4BaJaQAA3AA/vOdgAA=";

export type SafeImageProps = Omit<ImageProps, "src" | "loader" | "onError" | "onLoad"> & {
  /** Caminho da imagem em `public/` (é ele o recurso final: existe sempre). */
  src: string;
  /**
   * Legenda do último recurso. OMITIR quando não há espaço para ela ser digna:
   * numa miniatura de 56 px do menu uma etiqueta de texto não cabe e lê-se como
   * mais um defeito. Nesse caso o recurso é silencioso — a superfície da própria
   * imagem, desfocada, e nada mais. Numa foto de portefólio, pelo contrário, a
   * legenda é o que explica ao visitante o que aconteceu.
   */
  unavailableLabel?: string;
  /**
   * Carregador para a PRIMEIRA tentativa, quando quem chama tem um caminho
   * próprio para a versão optimizada. É o caso dos heróis de página, que têm a
   * sua escada até 2048 px (`heroImageLoader`) e não a das fotos comuns.
   *
   * Só afecta a primeira tentativa: o recurso continua a ser o ficheiro
   * original, que é o mesmo para todos. Sem isto, os heróis — a maior imagem de
   * cada página — eram os únicos que ficavam sem rede, e mediu-se: das 12
   * imagens que ainda partiam com a avaria simulada, 10 eram heróis.
   */
  initialLoader?: (p: ImageLoaderProps) => string;
};

export default function SafeImage({
  src,
  alt,
  className,
  blurDataURL,
  unavailableLabel,
  initialLoader,
  fill,
  width,
  height,
  ...rest
}: SafeImageProps) {
  /** Já se desistiu da versão optimizada e está-se a pedir o ficheiro original. */
  const [original, setOriginal] = useState(false);
  /** Nº do anti-cache: 0 = URL normal, N = `?r=N` na tentativa N. */
  const [bust, setBust] = useState(0);
  /** A aguardar o recuo: o `<img>` está desmontado de propósito. */
  const [waiting, setWaiting] = useState(false);
  /** Esgotaram-se as tentativas: mostra-se o recurso digno. */
  const [exhausted, setExhausted] = useState(false);

  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackRef = useRef<HTMLImageElement | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleLoad = useCallback(() => {
    attemptsRef.current = 0;
  }, []);

  const handleError = useCallback(() => {
    // 1.ª falha: passa-se JÁ ao ficheiro original, sem esperar recuo nenhum.
    // O original está no repositório; o que falhou foi a derivada.
    if (!original) {
      attemptsRef.current = 0;
      setOriginal(true);
      setBust((b) => b + 1);
      return;
    }
    attemptsRef.current += 1;
    if (attemptsRef.current >= MAX_ATTEMPTS) {
      setExhausted(true);
      return;
    }
    const delay = BACKOFF_MS[Math.min(attemptsRef.current - 1, BACKOFF_MS.length - 1)];
    // Desmontar o `<img>` falhado é obrigatório: ao voltar a montar, o browser
    // cria um elemento novo com um URL novo e o pedido SAI mesmo.
    setWaiting(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setBust((b) => b + 1);
      setWaiting(false);
    }, delay);
    // `original` TEM de estar nas dependências: sem ele o fecho via sempre
    // `false` e a passagem ao ficheiro original repetia-se para sempre.
  }, [original]);

  // ── Recuperação depois de esgotar as tentativas ─────────────────────────
  // Reentrar no ecrã (saiu e voltou) ou o regresso da rede dão nova
  // oportunidade. Sem isto, um erro pontual ficava para o resto da visita.
  useEffect(() => {
    if (!exhausted) return;
    const reset = () => {
      attemptsRef.current = 0;
      setOriginal(false);
      setExhausted(false);
      setWaiting(false);
      setBust((b) => b + 1);
    };
    window.addEventListener("online", reset);
    let left = false;
    let io: IntersectionObserver | null = null;
    // Observa-se o próprio elemento de recurso: existe exactamente enquanto
    // `exhausted` for verdadeiro, que é quando este observador é preciso.
    const target = fallbackRef.current;
    if (target && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) left = true;
          else if (left) reset();
        }
      });
      io.observe(target);
    }
    return () => {
      window.removeEventListener("online", reset);
      io?.disconnect();
    };
  }, [exhausted]);

  /**
   * O loader.
   *
   * Enquanto se está na versão optimizada NÃO se passa loader nenhum: o
   * primeiro pedido continua a ser feito pelo caminho normal do sítio (o
   * optimizador, ou o que estiver configurado em `images.loader`). Este
   * componente não escolhe por ninguém, e assim não entra em conflito com o
   * pré-gerador nem com a configuração de imagens.
   *
   * No recurso, sim: aponta-se ao ficheiro tal e qual, com o anti-cache. A
   * query é ignorada pelo servidor de estáticos mas conta como URL novo para o
   * browser — sem ela a re-tentativa apanhava a resposta falhada em cache e a
   * escada corria sem nunca fazer um pedido novo.
   */
  const loader = useMemo(
    () =>
      original
        ? ({ src: s }: ImageLoaderProps) => (bust > 0 ? `${s}?r=${bust}` : s)
        : initialLoader,
    [original, bust, initialLoader],
  );

  return (
    <>
      {!exhausted && !waiting && (
        <Image
          // A `key` inclui o nº da tentativa: garante um `<img>` NOVO por
          // tentativa em vez de uma troca de atributo num elemento em erro.
          key={bust}
          src={src}
          alt={alt}
          className={className}
          fill={fill}
          width={width}
          height={height}
          blurDataURL={blurDataURL}
          loader={loader}
          onLoad={handleLoad}
          onError={handleError}
          {...rest}
        />
      )}
      {exhausted && (
        <>
          {/*
            Recurso digno: a superfície da própria imagem, desfocada. É um
            `<img>` simples de propósito — o `blurDataURL` é um `data:` URI, não
            tem nada para optimizar, e um `next/image` aqui voltaria a passar
            pelo caminho que acabou de falhar. Fica com a MESMA className e as
            mesmas dimensões, por isso não há salto de layout, e mantém o texto
            alternativo distinto de cada foto (não se degrada a acessibilidade:
            a imagem que se mostra continua a ser aquela foto, degradada).
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={fallbackRef}
            src={blurDataURL || NEUTRAL_BLUR}
            alt={alt}
            className={className}
            width={fill ? undefined : width}
            height={fill ? undefined : height}
            style={
              fill
                ? {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    width: "100%",
                    height: "100%",
                  }
                : undefined
            }
          />
          {unavailableLabel && (
            <span className="pointer-events-none absolute inset-0 flex items-end justify-start p-3">
              <span className="rounded bg-black/55 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-white/85">
                {unavailableLabel}
              </span>
            </span>
          )}
        </>
      )}
    </>
  );
}
