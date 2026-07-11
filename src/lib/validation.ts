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
  })
  .passthrough();

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

// Contact form.
export const contactSchema = z
  .object({
    nome: trimmed(120).min(2, "Nome demasiado curto"),
    email: z.email("Email inválido").max(160),
    telefone: trimmed(40).optional().default(""),
    eventType: trimmed(80).optional().default(""),
    mensagem: trimmed(4000).min(1, "Escreva uma mensagem"),
  })
  .passthrough();

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
