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
  | "acompanhamento"
  | "fazer-proposta"
  | "tarefas"
  | "fornecedores"
  | "inventario"
  | "material"
  | "temas"
  | "estatisticas"
  | "faturas"
  | "contratos"
  | "modelos-email"
  | "definicoes"
  | "servicos";

/**
 * Sidebar split for the calm, ChatGPT-like rail. Only the owner's DAILY CORE
 * stays visible at all times (`CORE_NAV`); everything else is tucked into a
 * collapsible "Mais" group at the bottom (`MORE_NAV`), collapsed by default, so
 * a newcomer sees a short, legible list instead of 15 destinations at once.
 *
 * `NAV` stays the single source of truth for ids / labels / icons and for every
 * other consumer (command palette, mobile bar); these arrays only decide what
 * the rail shows up-front vs. behind the disclosure.
 *
 * Note: several `View` ids exist in the type and still render if reached by a
 * direct link, but are intentionally left out of `NAV` so they don't clutter
 * the menu — the owner asked to hide them. Nothing about them was deleted:
 * add an id back to `NAV` (and to one of the arrays above) to surface it again.
 *
 * Escondidos a pedido dela, por ordem em que o pediu:
 *   · `clientes`, `fornecedores`, `inventario`, `modelos-email`
 *   · `kanban` (Organização de propostas), `servicos` (Biblioteca de
 *     serviços) e `acompanhamento` — "não quero estas opções".
 *
 * Os ecrãs continuam todos escritos e a funcionar. Se algum dia voltarem, é
 * uma linha em cada sítio — não é preciso reescrever nada.
 */
export const CORE_NAV: View[] = [
  "overview",
  "pedidos",
  "fazer-proposta",
  "propostas",
  "calendario",
  "tarefas",
];

export const MORE_NAV: View[] = [
  "faturas",
  "contratos",
  "material",
  "temas",
  "estatisticas",
  "definicoes",
];

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A BARRA DE BAIXO DO TELEMÓVEL — e a regra que a mantém honesta
 * ════════════════════════════════════════════════════════════════════════════
 *
 * **A barra de baixo leva os quatro destinos do dia. A gaveta leva O RESTO.**
 * Nenhum destino aparece nos dois sítios.
 *
 * PORQUE PRECISOU DE SER ESCRITO. Havia duas navegações a competir no mesmo
 * ecrã de 375 px: a gaveta (que abre no hambúrguer, ao canto) e a barra de
 * baixo — e a barra repetia três destinos que a gaveta já tinha, com um quarto
 * botão "Mais" que abria... a mesma gaveta. Dois botões para a mesma coisa, em
 * cantos opostos, e três destinos escritos duas vezes. Quem chega a este back
 * office pela primeira vez não sabe qual dos dois é "a" navegação, porque não
 * há resposta: são a mesma.
 *
 * PORQUE ESTES QUATRO. São o dia de trabalho, por esta ordem: ver o que há
 * (Visão Geral), ler o que entrou (Pedidos), escrever a proposta (Fazer
 * proposta), ver as que já saíram (Propostas). O "Fazer proposta" estava a
 * DOIS toques — abrir a gaveta, escolher — e é a tarefa que dá o dinheiro.
 *
 * O QUE ISTO CUSTA, dito com todas as letras: chegar ao Calendário, às Tarefas
 * ou aos Temas passa a ser sempre pelo hambúrguer, que fica no canto superior
 * esquerdo — o pior canto para um polegar. Continua a ser UM toque, e são
 * destinos de semana, não de hora. A alternativa (um quinto botão "Mais" na
 * barra) dava cinco alvos de 75 px numa barra onde 44 é o mínimo, e voltava a
 * pôr dois abridores para a mesma gaveta.
 *
 * NO COMPUTADOR não há barra de baixo nenhuma: a coluna da esquerda mostra
 * tudo, e esta lista não se aplica. É a mesma navegação com duas formas — não
 * a mesma forma esticada.
 */
export const BARRA_INFERIOR: View[] = ["overview", "pedidos", "fazer-proposta", "propostas"];

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
    id: "fazer-proposta",
    label: "Fazer proposta",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6" />
        <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 14v6M14 17h6" strokeLinecap="round" />
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
    id: "definicoes",
    label: "Definições",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
    id: "material",
    label: "Material",
    // Caixa de ferramentas: a pega e o corpo. É o que vai na carrinha.
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <rect x="3" y="8" width="18" height="12" rx="2" />
        <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" strokeLinecap="round" />
        <path d="M3 13h18" />
      </svg>
    ),
  },
  {
    id: "temas",
    label: "Temas",
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
          d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
          strokeLinejoin="round"
        />
        <circle cx="9.5" cy="12" r="1.2" />
        <path d="m6 17 3.5-3 3 2.5L16 13l3 4" strokeLinecap="round" strokeLinejoin="round" />
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
    id: "contratos",
    label: "Propostas Aceites",
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
        <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m9 14 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];
