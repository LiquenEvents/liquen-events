"use client";

/**
 * A friendly empty state: a soft icon, a short headline and (optionally) a
 * call-to-action button. Replaces the bare "Nenhum X" sentences so a fresh
 * account — with little data yet — still feels considered rather than broken.
 */

interface Props {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon, title, hint, action }: Props) {
  return (
    /* A mesma conta do irmão em `ui/EmptyState.tsx`: 128 px de ar para dizer
       que não há nada, iguais a 375 e a 1440. Lê o mesmo token, para os dois
       vazios do back office não poderem discordar. */
    <div className="flex flex-col items-center justify-center text-center py-[var(--bo-p-vazio)] px-[var(--bo-p-cartao)]">
      <div className="w-12 h-12 rounded-2xl bg-foreground/[0.04] flex items-center justify-center text-foreground/25 mb-3 sm:mb-4">
        {icon ?? (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <p className="text-foreground/55 text-sm font-medium">{title}</p>
      {hint && <p className="text-foreground/30 text-xs mt-1.5 max-w-xs">{hint}</p>}
      {action && (
        /**
         * `alvo-toque` porque este botão é escrito à mão e não passa pelo
         * `ui/Button.tsx`, que é onde vive o piso de 44 px do dedo. Media 101×32
         * num iPhone SE — e é o botão de uma folha VAZIA, ou seja, o primeiro
         * que alguém encontra numa instalação nova e o único caminho para sair
         * dali. A rede do CI só o apanhou quando a lista de pedidos passou a
         * poder estar mesmo vazia durante o passeio; até aí, o ecrã que este
         * botão habita nunca chegava a ser medido.
         */
        <button
          onClick={action.onClick}
          className="alvo-toque mt-3.5 sm:mt-5 px-4 py-2 rounded-full bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase hover:bg-[#2a3227] transition-colors "
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
