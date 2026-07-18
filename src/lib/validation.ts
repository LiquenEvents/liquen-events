import { z } from "zod";

/**
 * Server-side validation schemas (zod). The public forms are the front door
 * to the business, so we validate defensively: required contact fields,
 * sane lengths, and a real email. Unknown extra fields on the quote form are
 * preserved (the client sends the full QuoteFormData blob), so we use
 * `.passthrough()` and only assert the parts we depend on.
 */

const trimmed = (max: number) => z.string().trim().max(max);

// Quote request — the part of QuoteFormData we rely on; rest passes through.
const selectedAddonSchema = z.object({
  id: trimmed(100),
  name: trimmed(200),
  tier: trimmed(30),
  price: z.number().finite().min(0).max(10_000_000),
  quantity: z.number().finite().min(0).max(100_000),
  pricingType: trimmed(30),
});

export const quoteFormSchema = z
  .object({
    name: trimmed(120).min(2, "Nome demasiado curto"),
    email: z.email("Email inválido").max(160),
    phone: trimmed(40).optional().default(""),
    company: trimmed(160).optional().default(""),
    nif: trimmed(20).optional().default(""),
    guests: z.coerce.number().int().min(0).max(100000).optional().default(0),
    date: trimmed(20).optional().default(""),
    notes: trimmed(4000).optional().default(""),
    // Remaining QuoteFormData fields are free-form on the client (category
    // labels, location text, addon picks…) — bound their size/shape so a
    // crafted payload can't smuggle a multi-MB string into the confirmation
    // email/DB record, without hardcoding every UI enum value here (brittle
    // if the front-end adds an option this schema doesn't know about yet).
    category: trimmed(40).nullish(),
    eventType: trimmed(60).nullish(),
    eventName: trimmed(200).optional().default(""),
    endDate: trimmed(20).optional().default(""),
    location: trimmed(300).optional().default(""),
    locationType: trimmed(30).optional(),
    duration: z.coerce.number().finite().min(0).max(1000).optional(),
    isMultiDay: z.boolean().optional(),
    packageTier: trimmed(30).optional(),
    addons: z.array(selectedAddonSchema).max(100).optional().default([]),
    budgetRange: trimmed(30).nullish(),
    urgency: trimmed(30).optional(),
    referralSource: trimmed(200).optional().default(""),
    acceptTerms: z.boolean().optional(),
    acceptMarketing: z.boolean().optional(),
  })
  // .strip() (the default) — every QuoteFormData field is declared and bounded
  // above, so unknown keys are dropped rather than persisted. Previously
  // .passthrough() let a crafted payload smuggle arbitrary unbounded keys into
  // the stored quote (data-integrity / storage abuse); a genuinely new field
  // should be added here explicitly instead.
  .strip();

// Price breakdown — computed client-side, so validate the shape before it is
// persisted and reused in emails, exports and admin revenue maths. Values are
// bounded but may be negative (discount-style adjustments).
const money = z.number().finite().min(-10_000_000).max(10_000_000);

export const priceBreakdownSchema = z.object({
  basePrice: money,
  guestCost: money,
  packageMultiplier: z.number().finite().min(0).max(100),
  locationSurcharge: money,
  weekendSurcharge: money,
  seasonSurcharge: money,
  urgencySurcharge: money,
  addonsCost: money,
  subtotal: money,
  iva: money,
  total: money,
  rangeMin: money,
  rangeMax: money,
  isEstimate: z.boolean(),
});

export const quotePayloadSchema = z.object({
  form: quoteFormSchema,
  breakdown: priceBreakdownSchema.optional(),
});

// ── Admin PATCH of a quote ──────────────────────────────────────────────────
// The route already allowlists WHICH fields may change; this validates the
// VALUES so a buggy client (or forged authenticated request) can't persist an
// invalid status, a non-numeric price or malformed arrays that later break
// exports and calculations. All fields optional (it's a partial update);
// nullish is accepted where the UI clears a value.
const entityId = z.string().min(1).max(64);
const shortDate = trimmed(30); // "yyyy-mm-dd" (loose — display-only)

const checklistItemSchema = z.object({
  id: entityId,
  label: trimmed(300),
  done: z.boolean(),
});

const timelineItemSchema = z.object({
  id: entityId,
  time: trimmed(20),
  title: trimmed(300),
  owner: trimmed(120).optional(),
});

const paymentSchema = z.object({
  id: entityId,
  kind: z.enum(["sinal", "pagamento", "saldo"]),
  amount: z.number().finite().min(0).max(10_000_000),
  date: shortDate,
  paid: z.boolean(),
  note: trimmed(500).optional(),
});

const eventSupplierSchema = z.object({
  id: entityId,
  supplierId: entityId.optional(),
  name: trimmed(200),
  category: trimmed(100),
  estimatedCost: z.number().finite().min(0).max(10_000_000),
  actualCost: z.number().finite().min(0).max(10_000_000).optional(),
  status: z.enum(["contactado", "confirmado", "pago"]),
  note: trimmed(500).optional(),
});

const guestSchema = z.object({
  id: entityId,
  name: trimmed(200),
  party: z.number().int().min(1).max(1000),
  rsvp: z.enum(["pendente", "confirmado", "recusado"]),
  note: trimmed(500).optional(),
});

const activityEntrySchema = z.object({
  id: entityId,
  at: trimmed(40),
  kind: z.enum([
    "created",
    "status_change",
    "price_set",
    "note_added",
    "message_sent",
    "proposal_sent",
    "follow_up_set",
    "tags_updated",
    "payment_added",
    "supplier_added",
    "manual_note",
    "call_logged",
    "assigned",
  ]),
  actor: trimmed(120).optional(),
  summary: trimmed(1000),
});

export const quoteUpdateSchema = z
  .object({
    status: z.enum(["pendente", "em_revisao", "cotado", "aceite", "rejeitado"]),
    quotedPrice: z.number().finite().min(0).max(10_000_000).nullish(),
    adminNotes: trimmed(20000).nullish(),
    checklist: z.array(checklistItemSchema).max(500),
    productionPlan: z.array(checklistItemSchema).max(500),
    payments: z.array(paymentSchema).max(500),
    timeline: z.array(timelineItemSchema).max(500),
    eventSuppliers: z.array(eventSupplierSchema).max(500),
    tags: z.array(trimmed(60)).max(100),
    followUpAt: shortDate.nullish(),
    guestList: z.array(guestSchema).max(5000),
    activityLog: z.array(activityEntrySchema).max(5000),
    assignedTo: trimmed(120).nullish(),
    lostReason: trimmed(1000).nullish(),
    date: shortDate,
    guests: z.number().int().min(0).max(100000),
    location: trimmed(300),
    contractRef: trimmed(100).nullish(),
    archived: z.boolean(),
  })
  .partial();

// Proposal creation (admin, from the quote's line-item builder). Bounds every
// value so a crafted admin request can't push megabyte descriptions or a
// huge line-item array into the PDF render / outbound email attachment.
export const proposalLineItemSchema = z.object({
  description: trimmed(500),
  qty: z.number().finite().min(0).max(100_000),
  unitPrice: z.number().finite().min(0).max(10_000_000),
});

export const proposalCreateSchema = z.object({
  lineItems: z.array(proposalLineItemSchema).max(200),
  vatRate: z.number().finite().min(0).max(1).optional(),
  validUntil: shortDate.optional(),
  notes: trimmed(5000).optional(),
});

export const taskUpdateSchema = z
  .object({
    title: trimmed(300).min(1),
    done: z.boolean(),
    priority: z.enum(["baixa", "normal", "alta"]),
    dueDate: shortDate.nullish(),
    quoteId: trimmed(100).nullish(),
    clientName: trimmed(200).nullish(),
    assignee: trimmed(120).nullish(),
    area: trimmed(80).nullish(),
  })
  .partial();

export const supplierUpdateSchema = z
  .object({
    name: trimmed(200).min(1),
    category: trimmed(100),
    email: z.union([z.email().max(160), z.literal("")]).nullish(),
    phone: trimmed(40).nullish(),
    location: trimmed(300).nullish(),
    notes: trimmed(5000).nullish(),
    rating: z.number().int().min(1).max(5).nullish(),
    preferred: z.boolean().nullish(),
  })
  .partial();

// Web Push subscription — sanitise this network-provided object into a strict,
// known-good shape before it is ever persisted.
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .regex(/^https:\/\/[^\s]+$/i, "endpoint inválido")
    .max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(300),
  }),
});

/** Returns the first human-readable error, for a clean 400 response. */
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Dados inválidos";
}
