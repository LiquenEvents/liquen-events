"use client";

import Image, { type ImageLoaderProps } from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { galleryLoadQueue } from "./load-queue";

/**
 * A foto de um mosaico da galeria, com re-tentativa.
 *
 * PORQUÊ ESTE COMPONENTE EXISTE. A queixa da dona ("nem todas as fotos
 * carregam") tem uma causa mecânica medida: `grep -c onError` na pasta da
 * galeria dava 0. Injectando UM único HTTP 500 em 23 de 176 pedidos
 * `/_next/image`, ficaram 22 mosaicos em branco no fim da sessão e o número de
 * tentativas por URL falhado foi {min:1, max:1} — o browser NUNCA voltou a
 * pedir nenhum deles, nem ao passar por cima da mesma foto uma segunda vez. Um
 * 5xx pontual da infraestrutura era portanto permanente para aquele visitante.
 *
 * O que este componente faz, por ordem de importância:
 *  1. `onError` -> re-tenta com recuo exponencial (600ms, 1800ms, 5400ms) até
 *     um tecto de 4 tentativas, cada uma com um cache-buster (`?r=N`) para não
 *     apanhar a resposta falhada em cache;
 *  2. esgotado o tecto, mostra algo digno (o blur da própria foto, ou o fundo
 *     musgo da grelha, com a legenda por cima) em vez do ícone partido;
 *  3. mesmo depois disso, volta a tentar quando a foto REENTRA no ecrã ou
 *     quando a ligação volta (`online`) — a recuperação que faltava e que fazia
 *     o buraco ser para sempre;
 *  4. só arranca o pedido quando a foto se aproxima do ecrã E há vaga na fila
 *     (ver load-queue.ts), para não recriar a rajada que gerou as falhas.
 */

/** 1 tentativa + 3 re-tentativas. Tecto: passado isto mostra-se o fallback. */
const MAX_ATTEMPTS = 4;
/** Recuo exponencial (x3). O 5xx medido era pontual; 600ms já chega, e os
    passos seguintes dão tempo ao optimizador de esvaziar a fila de encode. */
const BACKOFF_MS = [600, 1800, 5400];
/**
 * Antecipação do carregamento. Generosa de propósito: o que passou a travar a
 * rajada é a FILA (6 em voo), não esta margem, por isso pode-se pedir cedo sem
 * voltar a empilhar pedidos. 1200px alinha com o limiar do lazy-loading nativo
 * do Chrome em 4G — com 300px, medido, um scroll rápido saltava mosaicos entre
 * frames e 180 de 427 ficavam por pedir no fim da travessia.
 */
const NEAR_VIEWPORT = "1200px 0px";

export type GalleryImageProps = {
  src: string;
  alt: string;
  sizes: string;
  quality: number;
  className: string;
  blurDataURL?: string;
  /** Candidato a LCP: salta a fila e a espera pelo viewport. */
  priority?: boolean;
  /**
   * O elemento cuja proximidade do ecrã decide quando carregar: o próprio
   * botão do mosaico. Não se usa um wrapper aqui por duas razões: (a) o botão
   * leva `content-visibility: auto`, portanto os seus descendentes nem sequer
   * têm caixa enquanto está fora do ecrã e um observer sobre eles nunca
   * dispararia; (b) o mosaico-herói envolve esta imagem num `<ViewTransition>`,
   * que precisa de UM elemento-filho real para fazer o morph.
   */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Texto mostrado se, esgotadas as tentativas, a foto continuar sem vir. */
  unavailableLabel: string;
  onLoaded?: () => void;
};

export default function GalleryImage({
  src,
  alt,
  sizes,
  quality,
  className,
  blurDataURL,
  priority = false,
  anchorRef,
  unavailableLabel,
  onLoaded,
}: GalleryImageProps) {
  const releaseRef = useRef<(() => void) | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  /**
   * `armed` = o <Image> está montado com src (o pedido está a ser feito).
   *
   * ARRANCA LIGADO. Antes só arrancava ligado nas fotos `priority`, e o resto
   * esperava por um IntersectionObserver — que só corre DEPOIS da hidratação.
   * O efeito medido: o HTML vindo do servidor passou a trazer ZERO fotografias
   * (contadas com `curl … | grep -c "<img"`). Numa galeria isso é grave em três
   * frentes: quem tem a ligação lenta não vê nada até o JavaScript chegar, quem
   * navega sem JavaScript não vê nada de todo, e os motores de busca deixam de
   * encontrar as imagens da página cujo conteúdo SÃO as imagens.
   *
   * A fila continua a proteger da rajada: a limitação de pedidos em voo é feita
   * pelo browser e pela fila nas RE-TENTATIVAS, não por esconder o `src` até
   * alguém correr JavaScript. O `loading="lazy"` do próprio browser já adia o
   * que está longe do ecrã, e esse não precisa de hidratação nenhuma.
   */
  const [armed, setArmed] = useState(true);
  // Nº do cache-buster: 0 = URL original, N = `?r=N` na re-tentativa N.
  const [bust, setBust] = useState(0);
  // Esgotou o tecto de tentativas: mostra-se o fallback digno.
  const [exhausted, setExhausted] = useState(false);

  const releaseSlot = useCallback(() => {
    releaseRef.current?.();
    releaseRef.current = null;
  }, []);

  // Volta ao estado inicial quando a foto muda (o mesmo nó pode ser reutilizado
  // ao trocar de filtro/coleção) e liberta tudo ao desmontar, para um mosaico
  // que sai do DOM não reter um lugar da fila.
  useEffect(() => {
    return () => {
      releaseSlot();
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    };
  }, [releaseSlot]);

  /** Põe a próxima tentativa na fila (o pedido só sai quando houver vaga). */
  const enqueue = useCallback(() => {
    releaseSlot();
    releaseRef.current = galleryLoadQueue.acquire(() => setArmed(true));
  }, [releaseSlot]);

  // ── Arranque: perto do ecrã + vaga na fila ──────────────────────────────
  useEffect(() => {
    if (priority || armed || exhausted) return;
    const target = anchorRef.current;
    if (!target) return;
    if (typeof IntersectionObserver === "undefined") {
      enqueue();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        enqueue();
      },
      { rootMargin: NEAR_VIEWPORT },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [priority, armed, exhausted, enqueue, anchorRef]);

  // ── Recuperação depois de esgotar as tentativas ─────────────────────────
  // Uma nova ENTRADA no ecrã (saiu e voltou) ou o regresso da rede voltam a dar
  // uma oportunidade à foto. Sem isto, o mosaico ficava vazio para o resto da
  // visita mesmo que a infraestrutura já tivesse recuperado.
  useEffect(() => {
    if (!exhausted) return;
    const reset = () => {
      attemptsRef.current = 0;
      setExhausted(false);
      setBust((b) => b + 1);
      // Re-armar SEMPRE pela fila (mesmo a foto com prioridade): já não estamos
      // no caminho do LCP, estamos a recuperar de uma falha, e nesse momento a
      // rede pode estar a servir dezenas de outros mosaicos.
      enqueue();
    };
    window.addEventListener("online", reset);
    let left = false;
    let io: IntersectionObserver | null = null;
    const target = anchorRef.current;
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
  }, [exhausted, anchorRef, enqueue]);

  const handleLoad = useCallback(() => {
    releaseSlot();
    attemptsRef.current = 0;
    onLoaded?.();
  }, [releaseSlot, onLoaded]);

  const handleError = useCallback(() => {
    releaseSlot();
    attemptsRef.current += 1;
    if (attemptsRef.current >= MAX_ATTEMPTS) {
      setArmed(false);
      setExhausted(true);
      return;
    }
    const delay = BACKOFF_MS[Math.min(attemptsRef.current - 1, BACKOFF_MS.length - 1)];
    // Desarmar desmonta o <img> falhado; ao voltar a armar, o browser cria um
    // elemento novo com um URL novo, por isso o pedido SAI mesmo (foi a falta
    // deste par desmontar/remontar que fez retry_attempts ficar em 1).
    setArmed(false);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setBust(attemptsRef.current);
      enqueue();
    }, delay);
  }, [releaseSlot, enqueue]);

  // Cache-buster da re-tentativa. NÃO pode ir no `src`: o `localPatterns` por
  // defeito do Next 16 é [{ pathname:"**", search:"" }], por isso um
  // `/imagens/x.jpg?r=1` é rejeitado pelo próprio loader e o optimizador
  // devolve 400 ("url" parameter is not allowed) — medido. Vai portanto no URL
  // FINAL do optimizador, como parâmetro extra: `&r=N` é ignorado na chave de
  // cache do servidor (hash de href+w+q+mime), logo não fragmenta a cache, mas
  // é um URL diferente para o browser e força um pedido novo. Só a partir da
  // 1ª re-tentativa: o caminho normal continua a usar o loader do Next,
  // intocado (incluindo o `dpl` de deploy).
  const retryLoader = useMemo(() => {
    if (bust === 0) return undefined;
    return ({ src: s, width, quality: q }: ImageLoaderProps) => {
      const dpl = typeof document !== "undefined" ? document.documentElement.dataset.dplId : "";
      return `/_next/image?url=${encodeURIComponent(s)}&w=${width}&q=${q ?? quality}${
        dpl ? `&dpl=${dpl}` : ""
      }&r=${bust}`;
    };
  }, [bust, quality]);

  // Fragmento com no máximo UM elemento montado de cada vez (a foto OU o
  // fallback): é o que o `<ViewTransition>` do mosaico-herói precisa para
  // conseguir nomear o filho e fazer o morph.
  return (
    <>
      {armed && (
        <Image
          // `key` inclui o nº da tentativa: garante um <img> NOVO por tentativa
          // em vez de uma mudança de atributo num elemento em estado de erro.
          key={bust}
          src={src}
          loader={retryLoader}
          alt={alt}
          fill
          sizes={sizes}
          quality={quality}
          className={className}
          /**
           * O adiamento é do BROWSER, não nosso.
           *
           * Isto esteve "eager" para todos, o que fazia sentido quando o `src`
           * só era montado depois de um IntersectionObserver decidir que o
           * mosaico estava perto. Agora que a foto vem no HTML do servidor (para
           * existir sem JavaScript), "eager" em todos os mosaicos mandaria os
           * doze primeiros pedidos de uma vez — a mesma rajada que estamos a
           * tentar evitar.
           *
           * `lazy` devolve essa decisão ao browser, que a toma com informação
           * que nós não temos (velocidade da ligação, direcção do scroll) e sem
           * esperar por hidratação nenhuma. As re-tentativas continuam a passar
           * pela fila, que é onde o limite importa.
           */
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          onLoad={handleLoad}
          onError={handleError}
          {...(blurDataURL ? ({ placeholder: "blur", blurDataURL } as const) : {})}
        />
      )}
      {exhausted && (
        <span
          className="absolute inset-0 flex items-end justify-start p-3"
          // Com blur disponível mostra-se a própria foto desfocada (a "algo
          // digno" que o utilizador reconhece); sem ele fica o fundo musgo do
          // .g-tile, nunca o ícone de imagem partida.
          style={
            blurDataURL
              ? {
                  backgroundImage: `url(${blurDataURL})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <span className="rounded bg-black/55 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-white/85">
            {unavailableLabel}
          </span>
        </span>
      )}
    </>
  );
}
