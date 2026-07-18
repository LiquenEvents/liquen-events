/**
 * Rich, multi-page proposal DOCUMENT model — mirrors the studio's real
 * landscape "PO Decoração" proposal (cover → apresentação → serviços →
 * mood boards → orçamento → condições → observações → contracapa).
 *
 * The FIXED boilerplate (terms, payment staging, cancellation, reservation
 * conditions) ships as defaults below so every proposal carries the studio's
 * standard wording; the back office overrides only what changes per event.
 */

/** A single reference image in a mood board (base64-encoded JPEG or PNG bytes,
 *  with or without a `data:` prefix — the renderer sniffs the format). */
export type ImageData = string;

export interface MoodBoard {
  /** Elegant serif title, e.g. "Decoração Cerimónia". */
  title: string;
  /** Uploaded reference photos, laid out as an automatic collage. */
  images: ImageData[];
  /** Optional handwritten-style annotation under the collage. */
  annotation?: string;
}

export interface ServiceItem {
  /** Bold label, e.g. "Reunião inicial" or "Decoração Cerimónia". */
  label: string;
  /** Optional description shown after the label (Organização template). */
  desc?: string;
}

export interface ServiceGroup {
  /** Ordinal marker, e.g. "a)". */
  letter?: string;
  /** Group title, e.g. "Decoração Floral de Casamento". */
  title: string;
  /** Sub-items (bullets); each is a label with an optional description. */
  items: ServiceItem[];
}

/** A timeline phase in the "Cronograma de Organização" (Organização template). */
export interface CronogramaPhase {
  /** e.g. "6-12 meses antes do casamento". */
  title: string;
  items: string[];
}

/** A priced budget row for the per-item estimate model (Organização template). */
export interface BudgetRow {
  item: string;
  /** Kept as free text ("[Valor]", "1.500,00 €") to match the studio's format. */
  price: string;
}

export interface ProposalDoc {
  /** Which studio template this proposal follows — switches the apresentação
   *  heading, the pricing model, and whether a cronograma is shown. */
  template?: "decoracao" | "organizacao";
  /** Running header title, e.g. "PO Decoração Casamento Maria Rebocho 3.07.2027". */
  ref: string;
  /** Header title on the content pages (Organização template shows
   *  "Proposta de orçamento para Organização de Casamento"). */
  headerTitle?: string;

  // ── 1. Apresentação ──
  /** Couple / client, e.g. "Maria & Zé". */
  clientNames: string;
  eventType: string; // "Casamento"
  eventDate: string; // "3 de julho de 2027"
  location: string; // "Monte da Oliveirinha, Évora"
  guests: string; // "150 pax"
  ceremony?: string; // "Civil, simbólica"
  time?: string; // "A definir"

  // ── 2. Serviços ──
  serviceGroups: ServiceGroup[];

  // ── Mood boards (one page each; Decoração template) ──
  moodBoards: MoodBoard[];

  // ── Cronograma de Organização (Organização template) ──
  cronograma?: CronogramaPhase[];

  // ── 3./4. Orçamento Proposto ──
  // Decoração template: grouped total.
  budgetItems: string[]; // item NAMES only, e.g. "Decor Cerimónia"
  totalLabel: string; // "Valor Total Decoração"
  totalText: string; // "3000,00 € + IVA" — kept as text to match the studio's format
  // Organização template: per-item estimated values.
  budgetRows?: BudgetRow[];
  totalEstimatedText?: string; // "[Valor Total]" / "12.500,00 €"
  budgetNote?: string; // "Os valores são estimativas e podem ser ajustados…"

  // ── Cover (two flanking photos around the dark logo panel) ──
  coverImages: ImageData[];

  // ── Fixed boilerplate (defaults below; overridable per event) ──
  notasImportantes: string[];
  incluido: string[];
  naoIncluido: string[];
  condicoesGerais: string[];
  observacoesGerais: string[];
  faseamento: string[];
  cancelamento: string[];
}

/** The studio's standard "Notas Importantes" (Orçamento page). */
export const DEFAULT_NOTAS_IMPORTANTES: string[] = [
  "O serviço de montagem e desmontagem está incluído na Proposta;",
  "Todos os encargos inerentes ao espaço são da responsabilidade do cliente ou do próprio espaço;",
  "O espaço do Evento e todas as zonas a utilizar, têm de nos ser entregues limpos e prontos a usar;",
];

/** "Condições de Reserva" — Incluído na proposta. */
export const DEFAULT_INCLUIDO: string[] = [
  "Serviço de decoração, material e flores conforme descrito;",
  "Serviço de montagem, desmontagem como descritos.",
];

/** "Condições de Reserva" — Não incluído no orçamento. */
export const DEFAULT_NAO_INCLUIDO: string[] = [
  "Aluguer e/ou outras despesas inerentes ao espaço, como tenda, mobiliário, mobiliário de lounge e palamenta de catering;",
  "Lembranças, papelaria referentes ao evento como menus, seatting chart, seatting plan.",
];

/** "Condições Gerais". `{DATA}` / `{CONVIDADOS}` are substituted from the
 *  event data so the wording stays specific without manual editing. */
export const DEFAULT_CONDICOES_GERAIS: string[] = [
  "Aos valores acresce o IVA à taxa legal em vigor como descrito.",
  "Os orçamentos enviados pela Líquen Events terão de ser validados pela mesma, aquando da sua confirmação por parte dos clientes, sendo o critério aplicado, a disponibilidade para a realização do evento.",
  "A pré-reserva do evento deve ser efetuada por escrito através de email. A confirmação do evento só será concluída após pagamento da adjudicação.",
  "Será cobrado o valor de deslocação da equipa Líquen de acordo com os quilómetros relativos à distância de Évora ao local do evento, sempre que o evento se realize fora do distrito de Évora.",
  "Deve estar contemplada a refeição para os elementos da equipa Líquen que ficam durante todo o evento.",
  "Esta proposta só é válida para o evento a realizar no dia {DATA}.",
  "O orçamento é válido para o número de {CONVIDADOS} convidados; abaixo ou acima deste número o valor da proposta terá de ser revisto.",
  "A confirmação do número de pessoas tem de ser feita até 15 dias antes da festa. Se o número de participantes que se verificar no dia do evento for inferior ao previsto, será pago o número que foi confirmado. Caso o número de participantes seja superior ao comunicado, terá de ser feito o ajuste dos mesmos, não podendo a Líquen Events ser responsabilizada por falhas ou lacunas que resultem do serviço prestado a um número de participantes superior ao previamente confirmado.",
  "A Líquen Events reserva-se ao direito de alterar o preço, caso se verifiquem alterações significativas na conjuntura económica nacional e/ou internacional ou nas premissas estabelecidas aquando da realização desta proposta.",
];

/** "Observações Gerais". */
export const DEFAULT_OBSERVACOES_GERAIS: string[] = [
  "A Líquen Events não se responsabiliza caso o evento não se possa realizar ou tenha de mudar de data devido a alterações significativas na conjuntura económica e/ou social nacional e/ou internacional e/ou em caso de guerras e/ou catástrofes naturais.",
  "Todo o material e adereços usados no evento são para uso exclusivo na decoração.",
  "Líquen Events é uma marca registada propriedade de Líquen Events. Todas as imagens, conteúdo, grafismo, texto e logótipo são propriedade da Líquen Events; todos os direitos são reservados.",
  "O conteúdo desta proposta é intransmissível, pessoal e confidencial, não podendo ser reproduzido ou partilhado com terceiros sem autorização expressa, por escrito, por parte da Líquen Events.",
];

/** "Faseamento do Pagamento". */
export const DEFAULT_FASEAMENTO: string[] = [
  "30% na adjudicação;",
  "70% 1 mês antes;",
  "A adjudicação de um serviço só é considerada válida após pagamento no valor da primeira percentagem definida.",
];

/** "Cancelamento". */
export const DEFAULT_CANCELAMENTO: string[] = [
  "Em caso de cancelamento do serviço, a Líquen Events reserva-se o direito de não devolver o valor da adjudicação. Em caso de cancelamento efetuado entre o 30.º dia anterior e até às 14h do oitavo dia útil anterior à data do evento, a Líquen Events tem direito a receber o montante correspondente a 70% do valor total estipulado para o evento, acrescido do respetivo IVA.",
  "Se o cancelamento do evento ocorrer após as 14h do oitavo dia útil antes da data do evento, a Líquen Events terá direito a receber o montante total estipulado para o evento, acrescido de IVA, sendo a denúncia, em qualquer um dos casos, apenas válida se for efetuada por escrito, por email, valendo para tal a data e hora de receção do mesmo.",
  "Para qualquer eventual conflito recorrer-se-á ao Centro de Arbitragem de Conflitos de Consumo de Lisboa.",
];

/** Fills the fixed-text defaults into a partial doc, substituting the
 *  event-specific tokens in the general conditions. */
export function withProposalDefaults(
  doc: Omit<
    ProposalDoc,
    | "notasImportantes"
    | "incluido"
    | "naoIncluido"
    | "condicoesGerais"
    | "observacoesGerais"
    | "faseamento"
    | "cancelamento"
  > &
    Partial<
      Pick<
        ProposalDoc,
        | "notasImportantes"
        | "incluido"
        | "naoIncluido"
        | "condicoesGerais"
        | "observacoesGerais"
        | "faseamento"
        | "cancelamento"
      >
    >,
): ProposalDoc {
  const fill = (s: string) =>
    s.replace("{DATA}", doc.eventDate || "—").replace("{CONVIDADOS}", doc.guests || "—");
  return {
    ...doc,
    notasImportantes: doc.notasImportantes ?? DEFAULT_NOTAS_IMPORTANTES,
    incluido: doc.incluido ?? DEFAULT_INCLUIDO,
    naoIncluido: doc.naoIncluido ?? DEFAULT_NAO_INCLUIDO,
    condicoesGerais: (doc.condicoesGerais ?? DEFAULT_CONDICOES_GERAIS).map(fill),
    observacoesGerais: doc.observacoesGerais ?? DEFAULT_OBSERVACOES_GERAIS,
    faseamento: doc.faseamento ?? DEFAULT_FASEAMENTO,
    cancelamento: doc.cancelamento ?? DEFAULT_CANCELAMENTO,
  };
}
