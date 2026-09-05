"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { idUnico } from "@/lib/id-unico";
/* A escala de movimento da casa — ver `ui/movimento.ts`. Aqui só o botão de
   fechar é um estado de interacção; a ENTRADA da caixa tem escala própria,
   logo abaixo, porque não é um estado a mudar — é o sistema a apresentar. */
import { ESTADO, PRESSAO } from "./ui/movimento";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_DURATION = 4000;

/**
 * ── QUANTOS AVISOS CABEM NO ECRÃ AO MESMO TEMPO ─────────────────────────────
 *
 * A pilha cresce para cima a partir do canto de baixo à direita e não tinha
 * tecto nenhum. Uma gravação em lote que falha em doze linhas dá doze caixas de
 * ~64 px — 768 px, mais alto do que o ecrã de um telemóvel. Nessa altura o
 * aviso deixou de avisar: tapou a página inteira, incluindo o trabalho a que se
 * refere, e as primeiras caixas nem sequer se vêem porque saem por cima.
 *
 * Quatro é o que cabe folgadamente em 375 px de altura útil. Quando chega mais
 * um, sai o MAIS VELHO: o recente é o que ainda diz respeito ao que se acabou
 * de carregar, e o velho já teve os seus segundos.
 */
const MAX_TOASTS = 4;

/**
 * ── A ENTRADA DE UM AVISO: 240 ms, E A CURVA DE QUEM APRESENTA ──────────────
 *
 * Estava `transition-all duration-300`, sem `motion-safe:`. Três desvios num
 * sítio só, e nenhum deles escolhido:
 *
 *  1. **300 ms.** A casa fixou 240 para tudo o que APARECE por cima da página
 *     — é o número da `.bo-entrada` e da `.view-in` do `globals.css`, e é o que
 *     os outros nove sítios do back office que se apresentam já usam. Trezentos
 *     não era um degrau: era um número solto a discordar dos vizinhos em
 *     silêncio, num aviso que nasce ao lado deles.
 *
 *  2. **A curva.** Sem `ease-*`, uma `transition-*` desta casa sai com o
 *     `--default-transition-timing-function`, que é a curva de ASSINATURA
 *     (`cubic-bezier(0.16, 1, 0.3, 1)`). Essa é para o que o utilizador
 *     provoca. Um aviso não é provocado — chega quando o sistema tem alguma
 *     coisa a dizer —, e o que o sistema apresenta entra na curva que SÓ
 *     DESACELERA, `cubic-bezier(0, 0, 0.2, 1)`. É a mesma da `.bo-entrada`, e
 *     o `duracoes-da-casa.test.ts` prende este literal ao do `globals.css`
 *     para as duas pontas não poderem afinar-se sozinhas.
 *
 *  3. **`transition-all`, e sem `motion-safe:`.** O `all` obriga o browser a
 *     considerar `width`, `height` e `margin` em cada fotograma — layout, no
 *     elemento que aparece precisamente quando alguma coisa já correu mal. A
 *     lista aqui é fechada: `opacity` e `translate` (no Tailwind v4 o
 *     `translate-y-2` emite a propriedade AUTÓNOMA `translate`, não
 *     `transform` — compilado para confirmar), as duas compostas na GPU. E o
 *     `motion-safe:` porque o `globals.css` não tem rede global nenhuma: só
 *     desliga transições dentro de `prefers-reduced-motion` em três sítios
 *     concretos, e este não é nenhum deles.
 *
 * ── PORQUE É QUE NÃO É A CLASSE `.bo-entrada` ───────────────────────────────
 *
 * Seria o caminho mais curto — traz o número, a curva e a guarda de movimento
 * reduzido de graça. Mas a `.bo-entrada` é uma ANIMAÇÃO à montagem, e o
 * `entrada-do-que-aparece.test.ts` (que não é meu) prende, letra por letra, o
 * gesto que este aviso faz hoje: `"opacity-0 translate-y-2"`. Trocá-lo por
 * `.bo-entrada` punha esse teste vermelho num ficheiro que não me cabe
 * corrigir. Fica igual em tudo o que se vê — os mesmos 8 px, os mesmos 240 ms,
 * a mesma curva —, e a mudança da mecânica fica para quem for dono do teste.
 */
const ENTRADA_DO_AVISO =
  "motion-safe:transition-[opacity,translate] " +
  "motion-safe:duration-[240ms] " +
  "motion-safe:ease-[cubic-bezier(0,0,0.2,1)]";

/**
 * ── E A SAÍDA? NÃO A HÁ, E É UMA DECISÃO ────────────────────────────────────
 *
 * Quando um aviso se apaga, sai da lista no mesmo fotograma e os de baixo
 * saltam para o lugar dele. Ficou por fazer, de propósito, e por duas razões:
 *
 *  · Uma saída em `opacity` não corrige o salto — só o adia 240 ms. Corrigir o
 *    salto a sério é animar a ALTURA da caixa que sai, e altura é *layout* a
 *    cada fotograma: exactamente o que o `transition-all` daqui de cima estava
 *    a fazer de errado, e o que a promessa dos 60 fps no telemóvel proíbe.
 *  · E há um perigo concreto: esta pilha pousa em cima da barra de acção do
 *    estúdio (ver o comentário do `bottom-[calc(…)]` mais abaixo). Um aviso a
 *    desvanecer-se por cima dessa barra continua a apanhar o toque enquanto
 *    não desaparecer — ou seja, a saída teria de largar `pointer-events` no
 *    PRIMEIRO fotograma, antes de qualquer opacidade. Enquanto isso não
 *    estiver escrito e testado, é mais seguro o aviso sair de repente do que
 *    sair bonito a comer cliques do botão «Gerar e enviar».
 */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // The auto-dismiss timer now lives in each ToastItem so it can be paused on
  // hover/focus — the provider just enqueues.
  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = idUnico();
    setToasts((prev) => [...prev, { id, kind, message }].slice(-MAX_TOASTS));
  }, []);

  // Errors go to an assertive `role="alert"` region so they interrupt and are
  // never missed; success/info stay in a polite `role="status"` region. Both
  // sit in one visual stack (bottom-right) so ordering still reads naturally.
  const errorToasts = toasts.filter((t) => t.kind === "error");
  const politeToasts = toasts.filter((t) => t.kind !== "error");

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* ── O AVISO NÃO PODE POUSAR EM CIMA DA NAVEGAÇÃO ──────────────────
          MEDIDO a 375×667: com `bottom-6` (24 px) a caixa do aviso acabava aos
          635 px e a barra de baixo do telemóvel começa aos 610 — 25 px de
          sobreposição, opaco sobre opaco, mesmo por cima dos ícones de «Visão
          Geral» e «Pedidos» (que ficam nos primeiros ~20 px da barra). E é o
          pior momento possível para tapar a navegação: o aviso aparece quando
          alguma coisa falhou, que é quando ela quer sair dali.

          A conta é a mesma que o `<main>` já faz para não esconder a última
          linha da lista: a altura da barra, mais o entalhe, mais um respiro.
          Acima de `lg` não há barra nenhuma e volta aos 24 px de sempre.

          ── E A ALTURA VEM DO TOKEN, não de um «56px» escrito aqui ──────────
          Estava escrito. Era a TERCEIRA cópia do mesmo número (o `<main>` tinha
          as outras duas), e foi a que sobrou quando a barra cresceu para 72 px
          ao levantar os rótulos de 8 px para o chão de 12: o aviso passou a
          acabar aos 603 px com a barra a começar aos 594, ou seja a pousar-lhe
          em cima — exactamente o defeito que este comentário diz ter corrigido.
          Quem o apanhou foi o passeio `admin-mobile.spec.ts`, não os olhos.
          Com `var(--bo-barra-inferior)` deixa de haver número para discordar.

          ── E HÁ UM ECRÃ COM UMA SEGUNDA BARRA POR CIMA DESSA ──────────────
          O estúdio de propostas põe a sua acção principal («Pré-visualizar»,
          «Gerar e enviar») numa barra que pousa em cima da navegação, com uns
          64 px de altura. O aviso levantava-se 12 px do chão e nascia DENTRO
          dessa faixa — em cima do botão, a apanhar-lhe o toque durante os 4 s
          em que fica no ecrã. Medido a 375 px.
          `--bo-barra-accao` é a altura MEDIDA dessa barra, publicada pelo
          próprio estúdio enquanto está aberto (e ausente — logo, zero — em
          todo o resto do back office, que não tem barra nenhuma ali). O aviso
          soma-a e passa a pousar-lhe em cima, à vista, sem tapar nada. Acima
          de `lg` a navegação do telemóvel desaparece mas a barra do estúdio
          fica, encostada ao fundo: por isso o `lg:` também a soma. */}
      <div className="fixed bottom-[calc(var(--bo-barra-inferior)+var(--bo-barra-accao,0px)+env(safe-area-inset-bottom)+0.75rem)] right-6 z-[80] flex flex-col gap-2 pointer-events-none lg:bottom-[calc(var(--bo-barra-accao,0px)+1.5rem)]">
        <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
          {errorToasts.map((t) => (
            <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
          ))}
        </div>
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          {politeToasts.map((t) => (
            <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

const DOT: Record<ToastKind, string> = {
  success: "#7c854b",
  error: "#8a2a22",
  info: "#8a8a82",
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Auto-dismiss after TOAST_DURATION, but pause the countdown while the toast is
  // hovered or focused (and resume from where it left off on leave/blur) so a
  // reader is never rushed off a message they're still engaging with.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(TOAST_DURATION);
  const startedRef = useRef(0);
  const onCloseRef = useRef(onClose);
  // Keep the ref current without touching it during render (refs are write-only
  // outside render/effects); this lets the mount-only timer always call the
  // latest onClose without re-arming on every parent re-render.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const resume = () => {
    clear();
    startedRef.current = Date.now();
    timerRef.current = setTimeout(() => onCloseRef.current(), remainingRef.current);
  };
  const pause = () => {
    if (!timerRef.current) return;
    clear();
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedRef.current));
  };

  useEffect(() => {
    startedRef.current = Date.now();
    timerRef.current = setTimeout(() => onCloseRef.current(), remainingRef.current);
    return clear;
    // Run once on mount; onClose is read via ref so it needn't be a dep.
  }, []);

  return (
    <div
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className={`pointer-events-auto flex items-center gap-3 min-w-[260px] max-w-sm bg-white border border-[var(--bo-hairline-strong)] rounded-xl pl-4 pr-3 py-3 shadow-[var(--bo-sombra-suspensa)] ${ENTRADA_DO_AVISO} ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: DOT[toast.kind] }}
      />
      <p className="flex-1 text-[var(--bo-tinta-72)] text-sm leading-snug">{toast.message}</p>
      {/* ── 9×14 PX, E É O BOTÃO QUE FECHA UM AVISO ──────────────────────
          MEDIDO a 375 px: nove píxeis de largura por catorze de altura. É o
          alvo mais pequeno de todo o back office, e está no elemento que
          aparece precisamente quando alguma coisa correu mal — «Não foi
          possível guardar», «Não foi possível criar a tarefa». Num telemóvel
          não havia como o fechar: restava esperar que se apagasse sozinho,
          com o aviso pousado por cima do conteúdo até lá.

          `alvo-toque` dá-lhe 44×44 só sob `(pointer: coarse)`; o `×` desenhado
          continua do mesmo tamanho, e no portátil o aviso fica igual. O
          `-mr-1.5` devolve ao aviso a largura que a caixa maior lhe tirava,
          para o texto não encolher por causa disto. */}
      <button
        onClick={onClose}
        className={`alvo-toque pointer-coarse:-mr-1.5 text-foreground/40 hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO} text-sm leading-none shrink-0`}
        aria-label="Fechar"
      >
        ×
      </button>
    </div>
  );
}
