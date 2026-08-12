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
import type { Quote, Proposal, Payment } from "./types";
import { round2 } from "@/lib/money";
import { depositPercentOf } from "@/lib/proposal-doc";

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

/**
 * Taxa de IVA efetiva do pedido — derivada do breakdown (iva/subtotal) quando
 * existe, senão a taxa normal portuguesa (23%), a mesma que o motor de preços usa.
 */
export function effectiveVatRate(quote: Quote): number {
  const pb = quote.priceBreakdown;
  if (pb && pb.subtotal > 0 && Number.isFinite(pb.iva)) return pb.iva / pb.subtotal;
  return 0.23;
}

/** Valor contratado decomposto em sem IVA / IVA / com IVA. */
export interface ContractedAmounts {
  net: number; // sem IVA
  iva: number; // valor do IVA
  gross: number; // com IVA — o que o cliente paga
}

/**
 * Valor contratado, decomposto nas três parcelas de IVA. Fonte, por ordem:
 * proposta > preço cotado (`quotedPrice`) > estimativa (`priceBreakdown`).
 *
 * A proposta e o `priceBreakdown` já guardam sem IVA (subtotal) + IVA + com IVA
 * (total). O `quotedPrice` é o campo "Preço final (sem IVA)", logo SEM IVA — o
 * valor com IVA é derivado à taxa efetiva do pedido. Isto corrige o "em falta" e
 * a margem, que antes comparavam um total sem IVA com pagamentos/custos com IVA
 * (erro de ~23% nos negócios de preço manual).
 */
export function contractedAmounts(quote: Quote, proposal?: Proposal | null): ContractedAmounts {
  /**
   * ── O IVA SAI SEMPRE POR SUBTRACÇÃO ──────────────────────────────────────
   * `net + iva` tem de dar `gross` ao cêntimo, venha o total de onde vier.
   * Enquanto o IVA era lido do campo `proposal.vat`, bastava uma proposta cujo
   * trio gravado não fechasse (uma linha migrada, um valor corrigido à mão na
   * base de dados) para o dossier mostrar três números que não somam — e o
   * «em falta» é calculado a partir deles.
   *
   * ── E O LÍQUIDO A ZERO ───────────────────────────────────────────────────
   * As linhas de `proposals` anteriores à coluna `subtotal` lêem-se como 0
   * (ver `proposals-store.fromRow`), e `??` não apanha um zero. O dossier
   * dizia então que um casamento de 12.300 € valia 0 € sem IVA e 12.300 € de
   * IVA. A margem do evento, que compara líquidos, saía a menos o preço todo:
   * um casamento lucrativo aparecia com prejuízo igual aos custos. Um zero num
   * campo que devia trazer o líquido é um campo POR PREENCHER, não um preço
   * de zero euros — a proposta tem total, portanto tem base.
   */
  if (proposal && proposal.total != null && proposal.total > 0) {
    const gross = round2(proposal.total);
    const taxa =
      typeof proposal.vatRate === "number" && proposal.vatRate > 0 ? proposal.vatRate : 0.23;
    const net = proposal.subtotal > 0 ? round2(proposal.subtotal) : round2(gross / (1 + taxa));
    return { net, iva: round2(gross - net), gross };
  }
  if (quote.quotedPrice != null) {
    const net = round2(quote.quotedPrice);
    const gross = round2(net * (1 + effectiveVatRate(quote)));
    return { net, iva: round2(gross - net), gross };
  }
  const pb = quote.priceBreakdown;
  if (pb) {
    const gross = round2(pb.total);
    const net = round2(pb.subtotal);
    return { net, iva: round2(gross - net), gross };
  }
  return { net: 0, iva: 0, gross: 0 };
}

/**
 * Valor contratado, sempre COM IVA — a mesma base do dinheiro com que ele é
 * confrontado (pagamentos, faturas e custos de fornecedor são todos com IVA).
 *
 * Delega em `contractedAmounts` de propósito, em vez de repetir a cascata
 * `proposta ?? preço cotado ?? estimativa`: os três sítios onde o total pode
 * estar gravado NÃO estão na mesma unidade. `proposal.total` e
 * `priceBreakdown.total` são brutos; o `quote.quotedPrice` é o campo "Preço
 * final (sem IVA)" do ecrã, logo líquido. A cascata crua devolvia ora um ora
 * outro e o limiar de "está pago" caía ~23% no ramo do meio: um casamento
 * fechado por 20 000 € + IVA (24 600 € a receber) dava-se por concluído com
 * 20 000 € pagos e 4 600 € por cobrar — e a margem do evento, receita líquida
 * contra custos brutos, saía inflacionada na mesma proporção.
 */
function contractedTotal(d: DossierData): number {
  return contractedAmounts(d.quote, d.proposal).gross;
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
 * Espécie do livro correspondente a cada espécie de pagamento informal. É o
 * MESMO mapa que a rota de faturação aplica ao emitir o documento a partir de
 * uma linha de pagamento (`api/orcamento/[id]/fatura`): sinal→sinal,
 * saldo→saldo, pagamento avulso→total. Por construção, o recibo de um pagamento
 * cai sempre no balde da linha que o originou — é isso que torna a comparação
 * balde-a-balde abaixo fiável.
 */
const PAYMENT_TO_INVOICE_KIND: Record<Payment["kind"], DossierInvoice["kind"]> = {
  sinal: "sinal",
  saldo: "saldo",
  pagamento: "total",
};

const INVOICE_KINDS: DossierInvoice["kind"][] = ["sinal", "saldo", "total"];

/**
 * Dinheiro recebido contando as DUAS fontes — o livro de faturas e o registo à
 * mão (`quote.payments`) — sem somar o mesmo euro duas vezes.
 *
 * As duas fontes não são duas carteiras: são duas VISTAS do mesmo dinheiro (é
 * exatamente isso que `reconcileFinance` confronta, avisando quando divergem).
 * O fluxo normal regista o pagamento à mão e depois emite o recibo a partir
 * dessa linha, pelo que o mesmo valor aparece dos dois lados — somá-los daria o
 * dobro. Mas há eventos pagos só por um dos caminhos, e até eventos com o sinal
 * faturado e o saldo só registado à mão; ficar apenas com o maior TOTAL perderia
 * essa metade.
 *
 * Por isso confrontamos espécie a espécie (sinal / saldo / avulso) e ficamos com
 * o MAIOR de cada lado:
 *   • o mesmo dinheiro nos dois sítios → conta uma vez;
 *   • cada espécie pela sua fonte → somam-se as espécies, não as fontes;
 *   • registo parcial de um dos lados → prevalece o lado mais completo.
 *
 * Arredonda aos cêntimos no fim, como `reconcileFinance`, para um desvio de
 * vírgula flutuante nunca deixar um evento integralmente pago aquém do total.
 */
export function combinedPaidTotal(d: DossierData): number {
  const payments = d.quote.payments ?? [];
  const total = INVOICE_KINDS.reduce((sum, kind) => {
    const ledger = d.invoices.reduce(
      (s, i) => s + (i.kind === kind && i.status === "paga" ? i.amount : 0),
      0,
    );
    const informal = payments.reduce(
      (s, p) => s + (p.paid && PAYMENT_TO_INVOICE_KIND[p.kind] === kind ? p.amount : 0),
      0,
    );
    return sum + Math.max(ledger, informal);
  }, 0);
  return round2(total);
}

/**
 * Máquina de estados do Dossier. Calcula os booleanos e escolhe a fase mais
 * avançada alcançada (primeira coincidência ganha, topo = mais avançado).
 * A implementação segue à letra a tabela do plano.
 */
export function deriveStage(d: DossierData, today: Date = new Date()): EventStage {
  const { quote, proposal, contract, invoices } = d;

  const perdido = quote.status === "rejeitado" || proposal?.status === "rejeitada";

  // Ancorado ao FIM do dia do evento: a tarde do próprio dia continua a ser
  // "hoje" (countdownDays === 0), não "já passou". Só a partir da meia-noite
  // seguinte é que `eventPassed` fica verdadeiro — mantendo-o coerente com o
  // contador (que só vira negativo no dia seguinte).
  // `quote.date` costuma ser "yyyy-mm-dd", mas a rota manual/importação não proíbe
  // um ISO completo com componente horária. Tomamos sempre a porção da DATA (10
  // primeiros carateres) e ancoramos ao fim desse dia, tal como `countdownDays`
  // normaliza os dois formatos — assim um datetime já não produz NaN nem deixa um
  // evento passado preso uma fase atrás.
  const eventDayEnd = quote.date ? Date.parse(`${quote.date.slice(0, 10)}T23:59:59`) : NaN;
  const eventPassed = !Number.isNaN(eventDayEnd) && eventDayEnd < today.getTime();

  const contracted = contractedTotal(d);
  const combinedPaid = combinedPaidTotal(d);

  // Sinal e saldo lêem as MESMAS duas fontes, com o mesmo critério: uma fatura
  // da espécie certa dada por paga, ou uma linha de pagamento da espécie certa
  // marcada como recebida. Enquanto o saldo só olhava para o livro, um evento já
  // realizado e integralmente pago pelo caminho rápido (registo à mão, que é o
  // que o painel de Pagamentos sugere e o que faz subir o "Recebido") nunca
  // chegava a `concluido`: ficava `em_producao` para sempre e acumulava no
  // quadro, ano após ano. Um valor registado e dado por pago vale o mesmo dos
  // dois lados — a divergência entre livro e registo é assunto do banner de
  // reconciliação, não da fase do evento.
  const saldoPago =
    invoices.some((i) => (i.kind === "saldo" || i.kind === "total") && i.status === "paga") ||
    (quote.payments ?? []).some((p) => p.kind === "saldo" && p.paid && p.amount > 0) ||
    // Rede de segurança para quem nunca rotula a última parcela como "saldo":
    // o contratado está coberto, venha o dinheiro de onde vier (sem contar o
    // mesmo euro duas vezes — ver `combinedPaidTotal`).
    (contracted > 0 && combinedPaid >= round2(contracted));

  const sinalPago =
    invoices.some((i) => i.kind === "sinal" && i.status === "paga") ||
    (quote.payments ?? []).some((p) => p.kind === "sinal" && p.paid && p.amount > 0);

  // `quote.status === "aceite"` conta como aceite mesmo sem proposta/contrato:
  // a rota manual permite marcar um negócio como ganho diretamente (reserva
  // offline), tal como `deriveRequestLifecycle` do stepper já reconhece. Sem
  // isto, um pedido ganho à mão aparecia como `lead`, contradizendo o stepper.
  //
  // O nº de contrato (`contractRef`) e o registo "proposta enviada" no
  // `activityLog` são os sinais que SÓ o Quote traz e que o stepper do back
  // office sempre usou. Passaram para aqui quando o stepper deixou de ter
  // derivação própria e passou a ser uma vista desta máquina de estados: sem
  // eles, um contrato assinado à mão (nº preenchido no painel Financeiro) ou uma
  // proposta enviada por e-mail recuavam o pedido uma ou duas fases.
  const contratoAceite =
    !!contract?.acceptedAt ||
    proposal?.status === "aceite" ||
    quote.status === "aceite" ||
    !!quote.contractRef;

  const propostaEnviada =
    (!!proposal && proposal.status !== "rascunho") ||
    quote.status === "cotado" ||
    (quote.activityLog ?? []).some((a) => a.kind === "proposal_sent");

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
  /** Valor contratado com IVA (o que o cliente paga) — corrige o `quotedPrice`
   *  sem IVA para a mesma base dos pagamentos/faturas. Usar isto no "em falta". */
  contractedGross: number;
  contractedNet: number; // sem IVA
  contractedIva: number; // valor do IVA
  ledgerIssued: number;
  ledgerPaid: number;
  informalPaid: number;
  pctPaid: number;
  /** Custos de fornecedor COM IVA — é assim que eles são registados. */
  supplierCosts: number;
  /** Os mesmos custos SEM IVA — a base em que a margem se calcula. */
  supplierCostsNet: number;
  /**
   * ════════════════════════════════════════════════════════════════════════
   * A MARGEM É LÍQUIDA CONTRA LÍQUIDA — E ANTES NÃO ERA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Era `contratado com IVA − custos com IVA`. As duas parcelas estavam na
   * mesma unidade, o que parece bastar, e não basta: o IVA não é receita nem
   * é custo. Entra do cliente e sai para o Estado, e a diferença entre dois
   * brutos é a margem verdadeira MULTIPLICADA por 1,23.
   *
   * Num casamento de 20.000 € de base com 12.000 € de custos, a margem real
   * são 8.000 € e o quadro dizia 9.840 €. É um lucro que não existe, em cima
   * do qual se decide baixar um preço.
   *
   * Também deixava dois ecrãs a discordarem sobre o mesmo evento: o painel
   * de custos (EventCosts) já comparava líquidos e dizia 8.000 €, enquanto o
   * quadro de rentabilidade (StatsDashboard), que lê este campo, dizia 9.840.
   */
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
  const amounts = contractedAmounts(quote, d.proposal);
  const ledgerIssued = invoices.reduce((s, i) => s + (i.status !== "anulada" ? i.amount : 0), 0);
  const ledgerPaid = ledgerPaidTotal(invoices);
  const informalPaid = informalPaidTotal(quote);
  const pctPaid = contracted > 0 ? ledgerPaid / contracted : 0;

  const supplierCosts = round2(
    (quote.eventSuppliers ?? []).reduce((s, e) => s + (e.actualCost ?? e.estimatedCost ?? 0), 0),
  );
  // Os custos de fornecedor são registados COM IVA (ver `EventSupplier`), e o
  // IVA suportado é dedutível — não é custo. Passa-se a líquido à mesma taxa a
  // que a receita foi facturada, que é a única taxa que este evento conhece.
  const vatRate = amounts.gross > 0 && amounts.net > 0 ? amounts.gross / amounts.net - 1 : 0.23;
  const supplierCostsNet = round2(supplierCosts / (1 + vatRate));
  const margin = round2(amounts.net - supplierCostsNet);

  const guests = quote.guestList ?? [];
  const rsvpTotal = guests.reduce((s, g) => s + (g.party || 0), 0);
  const rsvpConfirmed = guests.reduce(
    (s, g) => s + (g.rsvp === "confirmado" ? g.party || 0 : 0),
    0,
  );

  return {
    contracted,
    contractedGross: amounts.gross,
    contractedNet: amounts.net,
    contractedIva: amounts.iva,
    ledgerIssued,
    ledgerPaid,
    informalPaid,
    pctPaid,
    supplierCosts,
    supplierCostsNet,
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
  // A percentagem do sinal é a da PROPOSTA aceite, não os 30% da casa escritos
  // à mão. Uma proposta a 50% deixava o cabeçalho a mandar «Emitir fatura de
  // sinal (30%)» e a rota a emitir 50% — o ecrã a discordar da factura que ele
  // próprio manda emitir. Sem proposta vale a percentagem por omissão, que é
  // exactamente o que estas frases sempre disseram.
  const pctSinal = depositPercentOf(d.proposal?.doc);
  switch (stage) {
    case "lead":
      return {
        label: "Criar proposta",
        hint: "Ainda sem proposta enviada — desenha e envia a proposta.",
        kind: "proposta",
      };
    case "proposta_enviada":
      return {
        label: "Abrir portal do cliente",
        hint: "Proposta enviada — a aguardar aceitação. Acompanha pelo portal.",
        kind: "portal",
      };
    case "aceite":
      return {
        label: `Emitir fatura de sinal (${pctSinal}%)`,
        hint: "Contrato aceite — falta receber o sinal para arrancar.",
        kind: "fatura_sinal",
      };
    case "sinal_pago":
      return {
        label: "Iniciar produção",
        hint: "Sinal pago — dá início ao plano de produção do evento.",
        kind: "producao",
      };
    case "em_producao":
      return {
        label: "Gerir produção",
        hint: "Em produção — acompanha tarefas, fornecedores e cronograma.",
        kind: "producao",
      };
    case "semana_evento": {
      const { pctPaid } = computeEventMetrics(d, today);
      if (pctPaid < 1) {
        return {
          label: `Liquidar o saldo (${100 - pctSinal}%)`,
          hint: "Evento esta semana — falta liquidar o saldo antes do dia.",
          kind: "fatura_saldo",
        };
      }
      return {
        label: "Preparar run sheet",
        hint: "Tudo pago — finaliza o cronograma do dia.",
        kind: "runsheet",
      };
    }
    case "concluido":
      return {
        label: "Arquivar evento",
        hint: "Evento concluído e liquidado — podes arquivar.",
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
