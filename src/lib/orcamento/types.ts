export type EventCategory = "empresas" | "particulares";

export type EventType =
  | "conferencias"
  | "teambuilding"
  | "lancamentos"
  | "jantares_empresa"
  | "casamentos"
  | "batizados"
  | "aniversarios"
  | "jantares_gala";

export type LocationType =
  | "lisboa"
  | "porto"
  | "grande_cidade"
  | "pequena_cidade"
  | "internacional";

export type BudgetRange = "ate_5k" | "5k_15k" | "15k_30k" | "30k_60k" | "60k_plus";

export type Urgency = "standard" | "rush" | "urgente";

export type QuoteStatus = "pendente" | "em_revisao" | "cotado" | "aceite" | "rejeitado";

export type PackageTier = "essencial" | "completo" | "premium" | "personalizado";

export type AddonTier = "essencial" | "completo" | "premium";

export interface AddonCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  pricingType: "fixed" | "per_pax" | "per_unit";
  tiers: {
    essencial: { label: string; price: number };
    completo: { label: string; price: number };
    premium: { label: string; price: number };
  };
  eventTypes?: EventType[];
}

export interface SelectedAddon {
  id: string;
  name: string;
  tier: AddonTier;
  price: number;
  quantity: number;
  pricingType: "fixed" | "per_pax" | "per_unit";
}

export interface QuoteFormData {
  category: EventCategory | null;
  eventType: EventType | null;
  eventName: string;
  date: string;
  endDate: string;
  location: string;
  locationType: LocationType;
  guests: number;
  duration: number;
  isMultiDay: boolean;
  packageTier: PackageTier;
  addons: SelectedAddon[];
  /**
   * Pontos de decoração escolhidos pelo casal no pedido (ver
   * `src/lib/orcamento/decoracao.ts`). Só aparece nos casamentos; vazio em
   * todos os outros tipos de evento e em todos os pedidos anteriores a este
   * campo existir — por isso é opcional e nunca se pode assumir presente.
   */
  decorPoints?: string[];
  /**
   * Os nomes dos noivos, quando o pedido é um casamento e o casal os quis dar.
   * O `name` continua a ser o de QUEM ESCREVEU — pode ser a mãe da noiva, uma
   * wedding planner, um dos dois. São coisas diferentes e não se podem
   * sobrepor: é a este par que a proposta e o contrato se dirigem, e é aquele
   * que se trata por tu ao responder ao email.
   *
   * Opcionais em todos os sentidos: não existem fora dos casamentos, não
   * existem nos pedidos anteriores a este campo, e não existem quando o casal
   * preferiu não os escrever. Nunca assumir presentes.
   */
  partnerA?: string;
  partnerB?: string;
  /**
   * Ordem de grandeza dos convidados, quando o número exacto ainda não existe
   * (ver `GUEST_RANGES`). Vazio quando `guests` traz um número a sério — os
   * dois nunca convivem, e é o número que manda.
   */
  guestsRange?: string;
  budgetRange: BudgetRange | null;
  urgency: Urgency;
  notes: string;
  referralSource: string;
  /**
   * Identificador do clique pago que trouxe esta pessoa, na forma compacta
   * "gclid:VALOR@2026-03-01T10:00:00.000Z" (ver src/lib/ads/click-id.ts).
   * Vazio quando o pedido não veio de um anúncio — que é o caso da maioria.
   *
   * É o que permite devolver ao Google Ads o valor REAL do casamento quando
   * ele fecha, em vez de deixar a Google a optimizar para formulários
   * preenchidos. Ver /ads-output/medicao.md e a rota de exportação de
   * conversões offline.
   */
  adClick?: string;
  /**
   * Identificadores da Meta, na forma compacta "fbp=…;fbc=…" (ver
   * src/lib/meta/click-id.ts). O equivalente do `adClick` para o Instagram e
   * o Facebook: é o que permite devolver à Meta o valor REAL do casamento
   * quando ele fecha. Vazio na maioria dos pedidos.
   */
  metaClick?: string;
  /**
   * O `event_id` do evento `Lead` que o browser já disparou para o pixel.
   * O servidor reenvia o MESMO identificador pela Conversions API, e é assim
   * que a Meta reconhece os dois como um só acontecimento em vez de contar a
   * conversão duas vezes. Ver src/lib/meta/eventos.ts.
   */
  leadEventId?: string;
  name: string;
  /**
   * PODE SER VAZIO desde que haja `phone` — a regra "email ou telefone" está
   * no `quoteFormSchema`. O formulário das variantes sociais tem um campo de
   * contacto só, e quem chega de um anúncio do Instagram escreve o número.
   * Todo o código que envia email para o cliente TEM de verificar isto.
   */
  email: string;
  phone: string;
  company: string;
  nif: string;
  acceptTerms: boolean;
  acceptMarketing: boolean;
}

export interface PriceBreakdown {
  basePrice: number;
  guestCost: number;
  packageMultiplier: number;
  locationSurcharge: number;
  weekendSurcharge: number;
  seasonSurcharge: number;
  urgencySurcharge: number;
  addonsCost: number;
  subtotal: number;
  iva: number;
  total: number;
  rangeMin: number;
  rangeMax: number;
  isEstimate: boolean;
}

export interface QuoteMessage {
  at: string;
  body: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

/** A single moment in the day-of run sheet (cronograma do evento). */
export interface TimelineItem {
  id: string;
  time: string; // "HH:MM"
  title: string;
  owner?: string; // responsável / fornecedor
}

export type PaymentKind = "sinal" | "pagamento" | "saldo";

export interface Payment {
  id: string;
  kind: PaymentKind;
  amount: number; // com IVA, em €
  date: string; // data do pagamento / previsto
  paid: boolean;
  note?: string;
}

/** A supplier/vendor booked for a specific event, with budgeted vs actual cost.
    Powers the per-event cost tracking and profitability (revenue − custos). */
export type EventSupplierStatus = "contactado" | "confirmado" | "pago";

export interface EventSupplier {
  id: string;
  supplierId?: string; // optional link to a Supplier in the directory
  name: string; // denormalised so the booking survives even if the supplier is removed
  category: string;
  estimatedCost: number; // orçamentado, em € (com IVA)
  actualCost?: number; // custo real/confirmado, em €
  status: EventSupplierStatus;
  note?: string;
}

/** A guest (or party/family) on an event's RSVP list. `party` is how many
    people this entry represents, so confirmed headcount = sum of confirmed parties. */
export type RsvpStatus = "pendente" | "confirmado" | "recusado";

export interface Guest {
  id: string;
  name: string;
  party: number;
  rsvp: RsvpStatus;
  note?: string;
}

export type ActivityKind =
  | "created"
  | "status_change"
  | "price_set"
  | "note_added"
  | "message_sent"
  | "proposal_sent"
  | "follow_up_set"
  | "tags_updated"
  | "payment_added"
  | "supplier_added"
  | "manual_note"
  | "call_logged"
  | "assigned";

export interface ActivityEntry {
  id: string;
  at: string;
  kind: ActivityKind;
  actor?: string;
  summary: string;
}

export type TaskPriority = "baixa" | "normal" | "alta";

export interface Task {
  id: string;
  title: string;
  done: boolean;
  priority: TaskPriority;
  dueDate?: string;
  quoteId?: string;
  clientName?: string;
  assignee?: string; // quem é responsável (sócio/membro da equipa)
  area?: string; // ex.: Comercial, Produção, Decoração, Financeiro
  createdAt: string;
}

export interface Quote extends QuoteFormData {
  id: string;
  submittedAt: string;
  status: QuoteStatus;
  priceBreakdown: PriceBreakdown;
  quotedPrice?: number;
  adminNotes?: string;
  lastUpdated?: string;
  messages?: QuoteMessage[];
  /** Event/logistics checklist (EventChecklist) — geral do evento, gerado a
      partir de `checklistTemplate`. NÃO confundir com `productionPlan`. */
  checklist?: ChecklistItem[];
  /** Plano de produção decor (ProductionPlan) — fases de atelier do sourcing ao
      strike, cada item prefixado com a fase. Campo próprio para não colidir com
      `checklist`: os dois painéis vivem lado a lado no separador Produção e
      partilhar o mesmo campo levava a perda de dados. */
  productionPlan?: ChecklistItem[];
  payments?: Payment[];
  timeline?: TimelineItem[];
  eventSuppliers?: EventSupplier[];
  /** Free-form labels for organising/filtering (ex.: "VIP", "Outono", "Ar livre"). */
  tags?: string[];
  /** Date (yyyy-mm-dd) the team should next follow up this lead. Surfaced in
      Reminders/Agenda when due, to chase proposals and keep deals moving. */
  followUpAt?: string;
  /** RSVP / guest list for the event. */
  guestList?: Guest[];
  /** Chronological log of significant actions taken on this quote. */
  activityLog?: ActivityEntry[];
  /** Internal contract/invoice reference number (e.g. "2026-042"). */
  contractRef?: string;
  /** When true, the quote is hidden from the default list view (soft-delete). */
  archived?: boolean;
  /** Team member responsible for this lead (prevents double-work). */
  assignedTo?: string;
  /** Reason the deal was lost — filled when status → rejeitado. */
  lostReason?: string;
  /**
   * O idioma em que a pessoa fez o pedido ("pt" ou "en"), lido do site no
   * momento em que o formulário foi submetido.
   *
   * Já se usava para escolher a língua do email de confirmação, mas era
   * deitado fora a seguir. Guardá-lo permite, meses depois, saber que aquele
   * casal escreveu em inglês — e a proposta do estúdio é escrita em português.
   * Ausente em todos os pedidos anteriores a este campo: nunca assumir "pt".
   */
  locale?: string;
}

/** Standalone calendar entry (reunião, marcação, bloqueio…) not tied to a quote. */
export type CalendarEventKind = "reuniao" | "evento" | "bloqueio" | "nota";

export interface CalendarEvent {
  id: string;
  date: string; // yyyy-mm-dd
  title: string;
  kind: CalendarEventKind;
  time?: string; // "HH:MM" opcional
  note?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  category: string;
  email?: string;
  phone?: string;
  location?: string;
  notes?: string;
  createdAt: string;
  /** 1–5 star quality rating. */
  rating?: number;
  /** Marks this supplier as a preferred/go-to partner. */
  preferred?: boolean;
}

// ── Propostas (criadas internamente, enviadas em PDF ao cliente) ──
/**
 * O estado interno de uma proposta, marcado por ela.
 *
 * "em_negociacao" é o estado que faltava e que descreve a maior parte do tempo
 * real: a proposta seguiu, houve resposta, e está a discutir-se. Sem ele, uma
 * proposta em terceira ronda de conversa era indistinguível de uma que ninguém
 * abriu — e é justamente essa distinção que decide quem se contacta amanhã.
 *
 * NÃO existe aqui um estado "expirada". A validade é uma data; um estado
 * gravado que diga "expirou" fica errado no minuto seguinte ao da gravação, e
 * corrigi-lo exigiria alguém (ou algo) a passar por todas as propostas todos os
 * dias. Deriva-se de `validUntil` — ver `estaExpirada` em proposta-estado.ts.
 */
export type ProposalStatus = "rascunho" | "enviada" | "em_negociacao" | "aceite" | "rejeitada";

/**
 * Porque é que se perdeu.
 *
 * Uma lista curta e fechada, porque o objetivo é poder CONTAR: "perdi seis por
 * preço este semestre" é uma frase que muda decisões, e não se chega lá com
 * texto livre. O `outro` existe para quem não cabe na lista não ser forçado a
 * mentir numa das quatro — e leva nota à parte.
 */
export type MotivoDeRecusa = "preco" | "data" | "escolheram-outro" | "sem-resposta" | "outro";

export interface ProposalLineItem {
  description: string;
  qty: number;
  unitPrice: number; // por unidade, sem IVA
}

export interface Proposal {
  id: string;
  quoteId: string;
  clientName: string;
  clientEmail: string;
  currency: string;
  lineItems: ProposalLineItem[];
  vatRate: number; // ex.: 0.23
  subtotal: number;
  vat: number;
  total: number;
  validUntil?: string;
  notes?: string;
  status: ProposalStatus;
  createdAt: string;
  sentAt?: string;
  /** When the client accepted/declined via the public link. */
  respondedAt?: string;
  /**
   * Quando voltar a falar com esta pessoa (yyyy-mm-dd), escolhido por ela.
   *
   * Não dispara nada para o cliente — não há email automático, não há aviso do
   * lado de lá. É um lembrete do lado de cá, e é isso que o painel de
   * acompanhamento ordena.
   */
  followUpAt?: string;
  /** O que fica por dizer no próximo contacto ("mandar fotos do arco"). */
  followUpNote?: string;
  /** Porque é que se perdeu — preenchido ao marcar como recusada. */
  lostReason?: MotivoDeRecusa;
  /** O detalhe, quando o motivo sozinho não chega. */
  lostNote?: string;
  /** Rich multi-page proposal document (Proposal Studio). Stored so the studio
   *  can re-open and re-edit a sent proposal. Image fields hold Storage paths,
   *  not bytes. Optional — legacy line-item proposals don't set it. */
  doc?: import("@/lib/proposal-doc").ProposalDoc;
}
