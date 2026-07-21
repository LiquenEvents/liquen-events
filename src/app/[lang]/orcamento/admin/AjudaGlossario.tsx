"use client";

import { useEffect } from "react";
import { useFocusTrap } from "./useFocusTrap";
import { LIFECYCLE, GLOSSARY } from "./glossario-data";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Ajuda de entrada para quem começa: explica o percurso de um trabalho
 * (Pedido → Proposta → Contrato → Fatura → Evento) e traduz o vocabulário do
 * back-office em linguagem simples. Abre a partir do botão "?" na barra de topo.
 *
 * Espelha o ShortcutsModal: role="dialog"/aria-modal, foco levado para dentro e
 * devolvido ao fechar, fecha com Escape e ao clicar fora.
 */
export default function AjudaGlossario({ open, onClose }: Props) {
  // Trap Tab within the dialog + restore focus to the trigger on close.
  const dialogRef = useFocusTrap<HTMLDivElement>(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ajuda e glossário"
        className="relative w-full max-w-2xl bg-white border border-foreground/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/[0.07]">
          <p className="bo-eyebrow">Ajuda e glossário</p>
          <button
            onClick={onClose}
            className="text-foreground/30 hover:text-foreground/60 transition-colors text-lg leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-6 max-h-[72vh] overflow-y-auto">
          {/* ── Boas-vindas ── */}
          <p className="text-foreground/55 text-sm leading-relaxed mb-6">
            Bem-vindo(a). Esta janela explica, em poucas palavras, como funciona o back-office e o
            que significa cada termo que vai encontrar. Pode voltar aqui sempre que precisar — abre
            com o botão “?” no topo ou com a tecla{" "}
            <kbd className="text-[10px] text-foreground/55 bg-foreground/[0.06] border border-foreground/12 rounded px-1.5 py-0.5 leading-none">
              ?
            </kbd>
            . Feche com Escape ou clicando fora.
          </p>

          {/* ── Como funciona ── */}
          <section>
            <p className="text-foreground/30 text-[10px] tracking-[0.25em] uppercase mb-1">
              Como funciona
            </p>
            <p className="text-foreground/45 text-sm mb-4">
              Cada trabalho faz sempre o mesmo percurso. Os nomes do menu são só as fases deste
              caminho:
            </p>
            <ol className="flex flex-col gap-3">
              {LIFECYCLE.map((it, i) => (
                <li key={it.step} className="flex gap-3">
                  <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-[#4d6350]/12 text-[#4d6350] text-[11px] font-semibold flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-foreground/75 text-sm font-medium">{it.step}</p>
                    <p className="text-foreground/50 text-sm leading-relaxed">{it.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="h-px bg-foreground/[0.07] my-6" />

          {/* ── Glossário ── */}
          <section>
            <p className="text-foreground/30 text-[10px] tracking-[0.25em] uppercase mb-1">
              Glossário — o que significa cada palavra
            </p>
            <p className="text-foreground/45 text-sm mb-4">
              As palavras aparecem pela ordem do percurso acima. São exatamente os nomes que vai ver
              no menu, nos estados dos pedidos e nos botões.
            </p>
            <dl className="flex flex-col gap-4">
              {GLOSSARY.map((it) => (
                <div key={it.term}>
                  <dt className="text-foreground/75 text-sm font-medium">{it.term}</dt>
                  <dd className="text-foreground/50 text-sm leading-relaxed">{it.def}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
