"use client";

import { useEffect } from "react";
import { useFocusTrap } from "./useFocusTrap";

interface Props {
  open: boolean;
  onClose: () => void;
}

const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Geral",
    items: [
      { keys: ["⌘", "K"], label: "Pesquisar / comandos" },
      { keys: ["/"], label: "Procurar nos pedidos" },
      { keys: ["N"], label: "Novo pedido" },
      { keys: ["?"], label: "Mostrar atalhos" },
      { keys: ["Esc"], label: "Fechar janelas" },
    ],
  },
  {
    title: "Navegar — pressione G, depois…",
    items: [
      { keys: ["G", "O"], label: "Visão Geral" },
      { keys: ["G", "P"], label: "Pedidos" },
      { keys: ["G", "K"], label: "Pipeline" },
      { keys: ["G", "C"], label: "Clientes" },
      { keys: ["G", "A"], label: "Calendário" },
      { keys: ["G", "R"], label: "Propostas" },
      { keys: ["G", "T"], label: "Tarefas" },
      { keys: ["G", "F"], label: "Fornecedores" },
      { keys: ["G", "E"], label: "Estatísticas" },
    ],
  },
  {
    title: "Pipeline — com um cartão focado",
    items: [
      { keys: ["Enter"], label: "Abrir o pedido" },
      { keys: ["←"], label: "Mover para a coluna anterior" },
      { keys: ["→"], label: "Mover para a coluna seguinte" },
    ],
  },
];

/** A discoverable cheat-sheet for the back-office keyboard shortcuts (opens with "?"). */
export default function ShortcutsModal({ open, onClose }: Props) {
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
        aria-label="Atalhos de teclado"
        className="relative w-full max-w-2xl bg-white border border-foreground/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/[0.07]">
          <p className="bo-eyebrow">Atalhos de teclado</p>
          <button
            onClick={onClose}
            className="text-foreground/30 hover:text-foreground/60 transition-colors text-lg leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6 px-6 py-6 max-h-[70vh] overflow-y-auto">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="text-foreground/30 text-[10px] tracking-[0.25em] uppercase mb-3">
                {g.title}
              </p>
              <div className="flex flex-col gap-2">
                {g.items.map((it) => (
                  <div key={it.label} className="flex items-center justify-between gap-4">
                    <span className="text-foreground/55 text-sm">{it.label}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {it.keys.map((kk) => (
                        <kbd
                          key={kk}
                          className="min-w-[22px] text-center text-[10px] text-foreground/55 bg-foreground/[0.06] border border-foreground/12 rounded px-1.5 py-1 leading-none"
                        >
                          {kk}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
