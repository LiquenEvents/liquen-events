import type { ReactNode } from "react";

/**
 * Back-office navigation model — the mutually-exclusive top-level views (their
 * ids double as deep-link anchors) and the sidebar / bottom-bar entries with
 * their inline icons. Extracted from AdminClient so the container isn't padded
 * with ~180 lines of SVG.
 */
export type View =
  | "overview"
  | "pedidos"
  | "kanban"
  | "clientes"
  | "calendario"
  | "propostas"
  | "tarefas"
  | "fornecedores"
  | "estatisticas"
  | "faturas"
  | "modelos-email"
  | "inbox";

export const NAV: { id: View; label: string; icon: ReactNode }[] = [
  {
    id: "overview",
    label: "Visão Geral",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    id: "pedidos",
    label: "Pedidos",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "kanban",
    label: "Pipeline",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <rect x="3" y="4" width="4" height="16" rx="1" />
        <rect x="10" y="4" width="4" height="11" rx="1" />
        <rect x="17" y="4" width="4" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: "clientes",
    label: "Clientes",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
        <path d="M16 5.5a3 3 0 0 1 0 5.5M21 20c0-2.5-1.8-4.3-4-4.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "calendario",
    label: "Calendário",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "propostas",
    label: "Propostas",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "tarefas",
    label: "Tarefas",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M9 11l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "fornecedores",
    label: "Fornecedores",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path
          d="M3 9l1-5h16l1 5M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z"
          strokeLinejoin="round"
        />
        <path d="M9 13h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "estatisticas",
    label: "Estatísticas",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M3 3v18h18" strokeLinecap="round" />
        <path d="M7 14l3-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "faturas",
    label: "Faturas",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M6 2h9l4 4v16l-3-1.5L13 22l-3-1.5L7 22l-1-1V2z" />
        <path d="M9 8h6M9 12h6M9 16h3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "modelos-email",
    label: "Modelos de email",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 8l9 5 9-5M8 14h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "inbox",
    label: "Inbox",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M3 7l9 6 9-6" />
        <rect x="3" y="5" width="18" height="14" rx="2" />
      </svg>
    ),
  },
];
