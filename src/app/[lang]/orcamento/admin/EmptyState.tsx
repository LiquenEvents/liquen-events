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
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-2xl bg-foreground/[0.04] flex items-center justify-center text-foreground/25 mb-4">
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
        <button
          onClick={action.onClick}
          className="mt-5 px-4 py-2 rounded-xl bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase hover:bg-[#2a3227] transition-colors shadow-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
