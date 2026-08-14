"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { idUnico } from "@/lib/id-unico";

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
          Com `var(--bo-barra-inferior)` deixa de haver número para discordar. */}
      <div className="fixed bottom-[calc(var(--bo-barra-inferior)+env(safe-area-inset-bottom)+0.75rem)] right-6 z-[80] flex flex-col gap-2 pointer-events-none lg:bottom-6">
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
  error: "#b5654a",
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
      className={`pointer-events-auto flex items-center gap-3 min-w-[260px] max-w-sm bg-white border border-foreground/10 rounded-xl pl-4 pr-3 py-3 shadow-xl shadow-black/10 transition-all duration-300 ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: DOT[toast.kind] }}
      />
      <p className="flex-1 text-foreground/75 text-sm leading-snug">{toast.message}</p>
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
        className="alvo-toque pointer-coarse:-mr-1.5 text-foreground/40 hover:text-foreground/70 transition-colors text-sm leading-none shrink-0"
        aria-label="Fechar"
      >
        ×
      </button>
    </div>
  );
}
