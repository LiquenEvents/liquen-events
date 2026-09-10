"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemeImage } from "@/lib/theme-types";
import { Button, cn } from "./ui";
import { SAIDA } from "./ui/saida";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { useFotoComPlanoB } from "@/lib/useFotoComPlanoB";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * VER UMA FOTO EM GRANDE, dentro da biblioteca de temas.
 *
 * A grelha mostra miniaturas de 400 px porque é o que faz uma página de 60
 * fotos custar 1,5 MB em vez de 150. Mas para decidir se uma foto entra numa
 * proposta é preciso vê-la a sério, e até aqui a única forma era descarregá-la.
 *
 * Mostra-se o ORIGINAL (`image.url`), não a miniatura: é este o único sítio da
 * biblioteca onde os pixéis todos valem os bytes. Enquanto ele chega, fica a
 * miniatura esticada por baixo, para haver sempre alguma coisa no ecrã em vez
 * de um retângulo vazio.
 *
 * ── QUANDO O ORIGINAL NÃO CHEGA ────────────────────────────────────────────
 * A grelha ao lado já sabia disto e este ecrã não: sem `onError`, um URL
 * assinado que expirou ou uma foto apagada noutro separador deixavam o
 * «carregou» a `false` para sempre — a miniatura desfocada eternamente ou,
 * nas fotos que não têm nenhuma (precisamente as que o painel «Miniaturas»
 * existe para reparar), um retângulo preto sem uma palavra. Aqui usa-se a
 * mesma cascata do resto da casa (`useFotoComPlanoB`): tenta-se o original,
 * cai-se para a miniatura, e só depois se diz que não foi — com o botão para
 * voltar a tentar, porque desistir nunca quer dizer para sempre.
 */

export interface PhotoLightboxProps {
  /**
   * ── E O VISUALIZADOR TAMBÉM SE VAI EMBORA ─────────────────────────────
   *
   * Abria com a `.bo-entrada` e fechava A SECO: o pai punha o `zoomAt` a
   * `null` e, no fotograma seguinte, a grelha estava outra vez lá. É o corte
   * mais visível da biblioteca inteira, porque isto é preto e cobre o ecrã
   * TODO — a diferença entre «a foto fechou-se» e «a página trocou».
   *
   * `false` quer dizer «já fechou, fica só a apagar-te». Quem segura o nó os
   * 200 ms é o pai (`Temas.tsx`), que é quem tem o `zoomAt`.
   */
  aberto?: boolean;
  images: ThemeImage[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** Transferir a foto que está à vista. */
  onDownload: (image: ThemeImage, index: number) => void;
  downloading?: boolean;
  /**
   * ── DE ONDE A LUPA CRESCE ─────────────────────────────────────────────
   *
   * O rectângulo da MINIATURA no instante em que se abriu, em coordenadas da
   * janela. `null` ou ausente = abre como abria, com a `.bo-entrada` de
   * sempre.
   *
   * `docs/APPLE-TEMAS.md`, Parte 3: «entrada com `--ease-quick` a partir da
   * posição da miniatura (FLIP), NÃO do centro do ecrã», e Parte 5: 325 ms.
   */
  origem?: DOMRect | null;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FLIP — a lupa nasce na miniatura em que se carregou
 * ════════════════════════════════════════════════════════════════════════════
 *
 * FLIP é First, Last, Invert, Play: sabe-se onde a coisa estava (`origem`),
 * deixa-se o browser desenhá-la onde ela vai ficar, calcula-se a transformação
 * que a levaria de volta ao sítio antigo, aplica-se, e anima-se até à
 * identidade. O resultado é uma fotografia que CRESCE do mosaico em vez de
 * aparecer no meio do ecrã — que é a diferença entre saber qual das sessenta
 * se abriu e ter de a procurar outra vez ao fechar.
 *
 * Anima só `transform` e `opacity`, que é a regra absoluta de movimento do
 * `docs/DESIGN-SYSTEM.md` (Parte 2.4). Nada de `width`, `top` ou `left`.
 *
 * ── OS VALORES VÊM DOS TOKENS, LIDOS DO `:root` ──────────────────────────
 *
 * «Nenhum valor literal fora dos tokens.» A duração e a curva não se escrevem
 * aqui: lêem-se do documento, onde o `tema.css` as pôs
 * (`--transition-duration-quick`, `--ease-quick`). Se o token faltar — e já
 * faltou nesta casa, ver a nota do `@theme static` — o FLIP não corre, em vez
 * de correr com um número inventado.
 *
 * ── E NÃO CORRE COM `prefers-reduced-motion` ─────────────────────────────
 *
 * «Substitui transições de POSIÇÃO por fades» [APPLE]. É exactamente uma
 * transição de posição e de escala, portanto desliga-se inteira e fica o fade
 * que a `.bo-entrada` já dá.
 */
function crescerDaMiniatura(caixa: HTMLElement, origem: DOMRect): Animation | null {
  if (typeof window === "undefined" || typeof caixa.animate !== "function") return null;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return null;
  const destino = caixa.getBoundingClientRect();
  if (!destino.width || !destino.height || !origem.width || !origem.height) return null;

  const raiz = getComputedStyle(document.documentElement);
  const duracao = Number.parseFloat(raiz.getPropertyValue("--transition-duration-quick"));
  const curva = raiz.getPropertyValue("--ease-quick").trim();
  if (!Number.isFinite(duracao) || duracao <= 0 || !curva) return null;

  const escalaX = origem.width / destino.width;
  const escalaY = origem.height / destino.height;
  const dx = origem.left + origem.width / 2 - (destino.left + destino.width / 2);
  const dy = origem.top + origem.height / 2 - (destino.top + destino.height / 2);

  return caixa.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${escalaX}, ${escalaY})`, opacity: 0.4 },
      { transform: "none", opacity: 1 },
    ],
    { duration: duracao, easing: curva, fill: "none" },
  );
}

export default function PhotoLightbox({
  aberto = true,
  images,
  index,
  onIndexChange,
  onClose,
  onDownload,
  downloading,
  origem = null,
}: PhotoLightboxProps) {
  const image = images[index];
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  /** A caixa que o FLIP anima — a fotografia, sem as setas. */
  const palcoRef = useRef<HTMLDivElement>(null);
  // O original ainda não chegou: mostra-se a miniatura esticada.
  const [loaded, setLoaded] = useState(false);
  const { alvo, desistiu, aoFalhar, tentarDeNovo } = useFotoComPlanoB(image?.url, image?.thumbUrl);

  // Recomeçar do princípio a cada alvo novo — outra foto, ou a queda do
  // original para a miniatura. Ajustado DURANTE o desenho, e não num efeito,
  // que é o padrão da casa (ver `ImagemComPlanoB`): assim não há um fotograma
  // com a opacidade da foto anterior por cima de uma imagem que ainda não
  // pediu nada.
  const [alvoVisto, setAlvoVisto] = useState(alvo);
  if (alvoVisto !== alvo) {
    setAlvoVisto(alvo);
    setLoaded(false);
  }

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= images.length) return;
      onIndexChange(next);
    },
    [index, images.length, onIndexChange],
  );

  // Teclado: fechar, andar, e o foco presume-se cá dentro enquanto está aberto.
  useEffect(() => {
    // No instante do gesto isto deixa de ser um visualizador: o Escape e as
    // setas param já, e não daqui a 200 ms. Quem está a apagar-se não responde.
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
        return;
      }
      if (e.key !== "Tab") return;
      // Prender o foco: sem isto o Tab saía para a grelha por baixo, que está
      // tapada, e ninguém percebia onde tinha ido parar o cursor.
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aberto, go, onClose]);

  // O foco entra no diálogo ao abrir. Quem o devolve ao mosaico de origem é
  // quem abriu (a grelha guarda o elemento activo).
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  /**
   * ── E A LUPA CRESCE DA MINIATURA ────────────────────────────────────────
   *
   * Uma vez, na montagem, e só com `origem`: `crescerDaMiniatura` mede o
   * destino no instante em que corre, e corre depois do primeiro desenho —
   * que é o «Last» do FLIP.
   *
   * Não atrasa nada. A animação corre POR CIMA de uma lupa que já está no
   * sítio, já tem foco e já responde ao teclado; interrompê-la é carregar em
   * Esc, e o Esc fecha na mesma.
   */
  useEffect(() => {
    if (!aberto || !origem || !palcoRef.current) return;
    const anim = crescerDaMiniatura(palcoRef.current, origem);
    return () => anim?.cancel();
    // Só na montagem: reabrir noutra fotografia remonta este componente (é o
    // pai que o desmonta ao fechar), e as setas trocam a foto SEM FLIP — «não
    // animes interações de alta frequência».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enquanto está aberto, a página por baixo não rola. Regido pelo `aberto` e
  // não pela montagem: a página destranca-se no INSTANTE do gesto, e não ao fim
  // dos 200 ms da saída — nenhuma animação desta casa atrasa uma tarefa.
  useEffect(() => {
    if (!aberto) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [aberto]);

  if (!image) return null;

  /* ── PORQUE É QUE O CONTEÚDO SAI PARA UMA VARIÁVEL ────────────────────
     Porque a moldura tem de ser escrita duas vezes, e o conteúdo não.

     Aqui a tinta preta e a caixa são o MESMO elemento — não há véu por trás
     de nada, isto É o visualizador —, e é por isso que o
     `entrada-dos-fundos.test.ts` isenta este ficheiro da REGRA dos véus. Da
     regra, não da varredura: ele continua a contar este ficheiro, e conta a
     LER o ficheiro — procura a lista de classes escrita por extenso no
     `className`, e não sabe ler um `cn(…)` nem um ternário. Um véu
     embrulhado num deles ficava invisível para ela, e no dia em que alguém
     lhe tirasse a entrada ninguém dava por isso.

     Dois ramos, portanto, com o ABERTO por extenso. Não são dois nós: mesmo
     tipo e mesma posição, o React reaproveita o elemento e troca-lhe as
     classes. */
  const conteudo = (
    <>
      <div className="flex items-center gap-2 px-4 py-3 text-white">
        <span className="text-sm tabular-nums text-white/80">
          {index + 1} / {images.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={downloading}
            onClick={() => onDownload(image, index)}
          >
            Transferir
          </Button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            // 36×36 medidos a 375 px. As setas ao lado já têm 44 (`h-11 w-11`)
            // e esta — a única forma de sair de um ecrã preto inteiro — tinha
            // menos. `.alvo-toque` iguala-a a elas, só ao dedo.
            className={`alvo-toque flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bo-surface)]/10 text-lg leading-none text-white hover:bg-[var(--bo-surface)]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${ESTADO} ${PRESSAO}`}
          >
            ×
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {index > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Foto anterior"
            className={`absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl leading-none text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${ESTADO} ${PRESSAO}`}
          >
            ‹
          </button>
        )}
        {/* ── O PALCO, E PORQUE É QUE ELE EXISTE ─────────────────────────
            É o que o FLIP anima: a fotografia e a miniatura que a segura,
            SEM as setas. Antes eram todos filhos do mesmo `flex`, e uma
            entrada que crescesse daqui levava as setas a crescer com ela —
            dois controlos de 44 px a passar por 8 px, que é a coisa que a
            Parte 5 do sistema de design chama «distrativa». As setas ficam
            irmãs, e paradas. */}
        <div
          ref={palcoRef}
          className="relative flex h-full w-full items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {/* A miniatura por baixo enquanto o original não chega: há sempre
            imagem, em vez de um retângulo preto durante um segundo. Deixa de
            fazer sentido quando é ELA o alvo (seria a mesma foto desfocada por
            baixo de si própria) ou quando já não há nada por onde tentar. */}
          {!loaded && !desistiu && image.thumbUrl && alvo !== image.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.thumbUrl}
              alt=""
              aria-hidden
              className="absolute max-h-full max-w-full object-contain blur-sm"
            />
          )}
          {desistiu || !alvo ? (
            <AvisoDeFalha
              titulo="Não foi possível mostrar esta fotografia"
              mensagem="A ligação pode ter caído, ou a foto pode ter sido removida noutro separador. O ficheiro continua no tema."
              aoTentarDeNovo={tentarDeNovo}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={alvo}
              src={alvo}
              alt={`Foto ${index + 1} de ${images.length}`}
              onLoad={() => setLoaded(true)}
              onError={aoFalhar}
              className={`max-h-full max-w-full object-contain motion-safe:transition-opacity ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
        </div>
        {index < images.length - 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Foto seguinte"
            className={`absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl leading-none text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${ESTADO} ${PRESSAO}`}
          >
            ›
          </button>
        )}
      </div>
    </>
  );

  /* ── E SAI PELO SÍTIO POR ONDE ENTROU ─────────────────────────────────
     `SAIDA` e não `SAIDA_FUNDO`, pela mesma razão que a entrada leva a
     `.bo-entrada` sem a variante do fundo: a variante põe a deslocação a
     zero (`--bo-saida-y: 0px`) e isto ficaria a apagar-se sem ir a lado
     nenhum. Quatro píxeis para cima, a espelhar valor a valor os quatro com
     que desceu.

     E o largar dos toques vem de graça: a `.bo-saida` larga os
     `pointer-events` DENTRO da classe, e quem cobre o ecrã inteiro é este
     mesmo elemento. Sem isso, um visualizador a desvanecer-se continuava a
     comer os toques da grelha durante 200 ms — e o gesto seguinte de quem
     fecha uma foto é abrir a do lado.

     Sem `role`, sem nome e fora do fio do teclado: para quem ouve o ecrã e
     para quem anda de Tab isto acabou no instante do gesto, e acabou mesmo
     — o pai já devolveu o foco ao mosaico de onde a foto foi aberta. */
  if (!aberto) {
    return (
      <div className={cn(SAIDA, "fixed inset-0 z-50 flex flex-col bg-black/92")} aria-hidden inert>
        {conteudo}
      </div>
    );
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${index + 1} de ${images.length}`}
      // ── ISTO ABRIA NUM FOTOGRAMA ────────────────────────────────────────
      // A página estava lá e, no seguinte, um ecrã preto inteiro por cima
      // dela. É o mesmo corte que a `LupaDeFotos` já resolveu (ver o
      // comentário longo lá, ao pé da mesma classe), e o pior sítio possível
      // para um: esta é a superfície que cobre o ecrã TODO.
      //
      // E vai SÓ a `.bo-entrada`, sem a `.bo-entrada-fundo`, pela mesma razão
      // que lá: aqui o véu e a caixa são o MESMO elemento — a tinta escura não
      // está por trás de nada, é o visualizador. É por isso que o
      // `entrada-dos-fundos.test.ts` já isenta este ficheiro da regra dos
      // véus, e a variante do fundo (`--bo-entrada-y: 0px`) tirava a
      // deslocação a tudo o que está cá dentro.
      //
      // Não atrasa nada: a lupa está no sítio e responde ao teclado desde o
      // primeiro fotograma — o `closeRef.current?.focus()` continua a correr
      // na montagem, por cima da animação.
      className="bo-entrada fixed inset-0 z-50 flex flex-col bg-black/92"
      onClick={(e) => {
        // Clicar no fundo fecha; clicar na foto ou nos botões não.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {conteudo}
    </div>
  );
}
