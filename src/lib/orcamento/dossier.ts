/**
 * Dossier do Evento — modelo de domínio *puro* e *client-safe*.
 *
 * De propósito NÃO importa `server-only`, nenhum `*-store.ts` nem `portal-token`:
 * é partilhado pela página servidor (que agrega os dados) e pelos componentes de
 * cliente (cabeçalho, métricas, stepper), tal como `money.ts`. Toda a matemática
 * do cockpit vive aqui — uma fonte única, testável sem montar React nem tocar na
 * base de dados.
 *
 * Regra de ouro: nunca chamar `Date.now()`/`new Date()` no topo do módulo. As
 * funções que precisam do "hoje" aceitam-no por parâmetro (injectável nos
 * testes); o valor por omissão só é lido dentro da função, no momento da chamada.
 */
import type { Quote, Proposal } from "./types";
import { round2 } from "@/lib/money";

/**
 * Fatura tal como o Dossier a consome — subconjunto serializável do tipo
 * `Invoice` do `invoices-store` (server-only). Redefinido aqui para que este
 * módulo, e por arrasto os componentes de cliente, nunca tenham de importar o
 * store. A página servidor mapeia as faturas reais para esta forma.
 */
export interface DossierInvoice {
  id: string;
  number: string;
  kind: "sinal" | "saldo" | "total";
  amount: number; // com IVA, em €
  status: "emitida" | "paga" | "anulada";
  issuedAt: string; // yyyy-mm-dd
  dueAt?: string;
  paidAt?: string;
}

/**
 * Contrato (aceitação de T&C) reduzido aos campos que o Dossier mostra. Espelha
 * `contract-types` mas mantém a fronteira: a página passa só isto.
 */
export interface DossierContract {
  status: "pendente" | "aceite";
  acceptedAt?: string; // ISO — presente quando aceite
  acceptedName?: string;
  termsVersion?: string;
}

/**
 * Tudo o que a página servidor agrega e entrega ao cliente — apenas dados
 * serializáveis (sem funções, sem instâncias de classe).
 */
export interface DossierData {
  quote: Quote;
  proposal: Proposal | null;
  contract: DossierContract | null;
  invoices: DossierInvoice[];
}

/**
 * As fases do ciclo de vida de um evento, da mais atrasada à mais avançada.
 * `perdido` é um estado terminal lateral (negócio caído em qualquer ponto).
 */
export type EventStage =
  | "lead"
  | "proposta_enviada"
  | "aceite"
  | "sinal_pago"
  | "em_producao"
  | "semana_evento"
  | "concluido"
  | "perdido";

/** Ordem canónica das fases "felizes" para o stepper (perdido fica de fora). */
export const STAGE_ORDER: EventStage[] = [
  "lead",
  "proposta_enviada",
  "aceite",
  "sinal_pago",
  "em_producao",
  "semana_evento",
  "concluido",
];

/** Rótulos PT (AO90) curtos para cada fase. */
export const STAGE_LABELS: Record<EventStage, string> = {
  lead: "Lead",
  proposta_enviada: "Proposta enviada",
  aceite: "Aceite",
  sinal_pago: "Sinal pago",
  em_producao: "Em produção",
  semana_evento: "Semana do evento",
  concluido: "Concluído",
  perdido: "Perdido",
};

/**
 * Dias até à data do evento (negativo = já passou; null = sem data).
 * Ancorado ao meio-dia dos dois lados para o dia nunca "saltar" por fuso.
 */
export function countdownDays(
  date: string | undefined | null,
  today: Date = new Date(),
): number | null {
  if (!date) return null;
  const eventNoon = Date.parse(date.length <= 10 ? `${date}T12:00:00` : date);
  if (Number.isNaN(eventNoon)) return null;
  const todayNoon = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12,
    0,
    0,
    0,
  ).getTime();
  return Math.round((eventNoon - todayNoon) / 86_400_000);
}

/** Valor contratado (com IVA) — proposta > preço cotado > estimativa. */
function contractedTotal(d: DossierData): number {
  return d.proposal?.total ?? d.quote.quotedPrice ?? d.quote.priceBreakdown?.total ?? 0;
}

/** Soma das faturas pagas (com IVA). */
function ledgerPaidTotal(invoices: DossierInvoice[]): number {
  return invoices.reduce((s, i) => s + (i.status === "paga" ? i.amount : 0), 0);
}

/** Soma dos pagamentos informais (quote.payments) marcados como pagos. */
function informalPaidTotal(quote: Quote): number {
  return (quote.payments ?? []).reduce((s, p) => s + (p.paid ? p.amount : 0), 0);
}

/**
 * Máquina de estados do Dossier. Calcula os booleanos e escolhe a fase mais
 * avançada alcançada (primeira coincidência ganha, topo = mais avançado).
 * A implementação segue à letra a tabela do plano.
 */
export function deriveStage(d: DossierData, today: Date = new Date()): EventStage {
  const { quote, proposal, contract, invoices } = d;

  const perdido = quote.status === "rejeitado" || proposal?.status === "rejeitada";

  const eventPassed = !!quote.date && Date.parse(`${quote.date}T12:00:00`) < today.getTime();

  const contracted = contractedTotal(d);
  const ledgerPaid = ledgerPaidTotal(invoices);

  const saldoPago =
    invoices.some((i) => (i.kind === "saldo" || i.kind === "total") && i.status === "paga") ||
    (contracted > 0 && ledgerPaid >= contracted);

  const sinalPago =
    invoices.some((i) => i.kind === "sinal" && i.status === "paga") ||
    (quote.payments ?? []).some((p) => p.kind === "sinal" && p.paid && p.amount > 0);

  const contratoAceite = !!contract?.acceptedAt || proposal?.status === "aceite";

  const propostaEnviada =
    (!!proposal && proposal.status !== "rascunho") || quote.status === "cotado";

  const cd = countdownDays(quote.date, today);

  if (perdido) return "perdido";
  if (eventPassed && saldoPago) return "concluido";
  if (!eventPassed && cd !== null && cd <= 7 && contratoAceite) return "semana_evento";
  if (contratoAceite && sinalPago) return "em_producao";
  if (sinalPago) return "sinal_pago";
  if (contratoAceite) return "aceite";
  if (propostaEnviada) return "proposta_enviada";
  return "lead";
}

export interface EventMetrics {
  contracted: number;
  ledgerIssued: number;
  ledgerPaid: number;
  informalPaid: number;
  pctPaid: number;
  supplierCosts: number;
  margin: number;
  countdownDays: number | null;
  rsvpConfirmed: number;
  rsvpTotal: number;
}

/**
 * Métricas do cockpit — todas com IVA (rotular "c/ IVA" onde forem mostradas).
 * O livro de faturas (não `quote.payments`) é a verdade para Recebido / % Pago.
 */
export function computeEventMetrics(d: DossierData, today: Date = new Date()): EventMetrics {
  const { quote, invoices } = d;

  const contracted = contractedTotal(d);
  const ledgerIssued = invoices.reduce((s, i) => s + (i.status !== "anulada" ? i.amount : 0), 0);
  const ledgerPaid = ledgerPaidTotal(invoices);
  const informalPaid = informalPaidTotal(quote);
  const pctPaid = contracted > 0 ? ledgerPaid / contracted : 0;

  const supplierCosts = (quote.eventSuppliers ?? []).reduce(
    (s, e) => s + (e.actualCost ?? e.estimatedCost ?? 0),
    0,
  );
  const margin = contracted - supplierCosts;

  const guests = quote.guestList ?? [];
  const rsvpTotal = guests.reduce((s, g) => s + (g.party || 0), 0);
  const rsvpConfirmed = guests.reduce(
    (s, g) => s + (g.rsvp === "confirmado" ? g.party || 0 : 0),
    0,
  );

  return {
    contracted,
    ledgerIssued,
    ledgerPaid,
    informalPaid,
    pctPaid,
    supplierCosts,
    margin,
    countdownDays: countdownDays(quote.date, today),
    rsvpConfirmed,
    rsvpTotal,
  };
}

export interface FinanceReconciliation {
  diverges: boolean;
  informalPaid: number;
  ledgerPaid: number;
}

/**
 * Confronta os pagamentos registados à mão (quote.payments) com o que o livro
 * de faturas diz estar pago. Arredonda aos cêntimos antes de comparar, para um
 * desvio de arredondamento nunca disparar um falso alarme.
 */
export function reconcileFinance(d: DossierData): FinanceReconciliation {
  const informalPaid = round2(informalPaidTotal(d.quote));
  const ledgerPaid = round2(ledgerPaidTotal(d.invoices));
  return { diverges: informalPaid !== ledgerPaid, informalPaid, ledgerPaid };
}

export type NextActionKind =
  | "proposta"
  | "portal"
  | "fatura_sinal"
  | "fatura_saldo"
  | "producao"
  | "runsheet"
  | "arquivar"
  | "none";

export interface NextAction {
  label: string;
  hint: string;
  kind: NextActionKind;
}

/**
 * A próxima ação sugerida para o cabeçalho — deriva da fase e, quando útil, do
 * estado financeiro (ex.: na semana do evento distingue "falta liquidar o saldo"
 * de "tudo pago, prepare o run sheet").
 */
export function nextAction(
  stage: EventStage,
  d: DossierData,
  today: Date = new Date(),
): NextAction {
  switch (stage) {
    case "lead":
      return {
        label: "Criar proposta",
        hint: "Ainda sem proposta enviada — desenhe e envie a proposta.",
        kind: "proposta",
      };
    case "proposta_enviada":
      return {
        label: "Abrir portal do cliente",
        hint: "Proposta enviada — a aguardar aceitação. Acompanhe pelo portal.",
        kind: "portal",
      };
    case "aceite":
      return {
        label: "Emitir fatura de sinal (30%)",
        hint: "Contrato aceite — falta receber o sinal para arrancar.",
        kind: "fatura_sinal",
      };
    case "sinal_pago":
      return {
        label: "Iniciar produção",
        hint: "Sinal pago — dê início ao plano de produção do evento.",
        kind: "producao",
      };
    case "em_producao":
      return {
        label: "Gerir produção",
        hint: "Em produção — acompanhe tarefas, fornecedores e cronograma.",
        kind: "producao",
      };
    case "semana_evento": {
      const { pctPaid } = computeEventMetrics(d, today);
      if (pctPaid < 1) {
        return {
          label: "Liquidar o saldo (70%)",
          hint: "Evento esta semana — falta liquidar o saldo antes do dia.",
          kind: "fatura_saldo",
        };
      }
      return {
        label: "Preparar run sheet",
        hint: "Tudo pago — finalize o cronograma do dia.",
        kind: "runsheet",
      };
    }
    case "concluido":
      return {
        label: "Arquivar evento",
        hint: "Evento concluído e liquidado — pode arquivar.",
        kind: "arquivar",
      };
    case "perdido":
      return {
        label: "Negócio perdido",
        hint: "Sem próxima ação — negócio marcado como perdido.",
        kind: "none",
      };
  }
}
