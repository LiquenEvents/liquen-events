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
  budgetRange: BudgetRange | null;
  urgency: Urgency;
  notes: string;
  referralSource: string;
  name: string;
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
  checklist?: ChecklistItem[];
  payments?: Payment[];
  timeline?: TimelineItem[];
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
}

// ── Propostas (criadas internamente, enviadas em PDF ao cliente) ──
export type ProposalStatus = "rascunho" | "enviada" | "aceite" | "rejeitada";

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
}
