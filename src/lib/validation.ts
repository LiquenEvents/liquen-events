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

export const quotePayloadSchema = z.object({
  form: quoteFormSchema,
  breakdown: z.unknown().optional(),
});

// Contact form — matches all fields the ContactForm component sends.
export const contactSchema = z
  .object({
    nome: trimmed(120).min(2, "Nome demasiado curto"),
    email: z.email("Email inválido").max(160),
    telefone: trimmed(40).optional().default(""),
    eventType: trimmed(80).optional().default(""),
    data: trimmed(20).optional().default(""),
    convidados: trimmed(40).optional().default(""),
    orcamento: trimmed(40).optional().default(""),
    mensagem: trimmed(4000).min(1, "Escreva uma mensagem"),
  })
  .passthrough();

// Admin: update an existing quote.
const quoteStatusEnum = z.enum(["pendente", "em_revisao", "cotado", "aceite", "rejeitado"]);

export const quoteUpdateSchema = z
  .object({
    status: quoteStatusEnum.optional(),
    quotedPrice: z.coerce.number().min(0).max(10_000_000).optional(),
    adminNotes: trimmed(8000).optional(),
    checklist: z
      .array(
        z.object({
          id: trimmed(80),
          label: trimmed(200),
          done: z.boolean(),
        }),
      )
      .optional(),
    payments: z
      .array(
        z.object({
          id: trimmed(80),
          kind: z.enum(["sinal", "pagamento", "saldo"]),
          amount: z.number().min(0).max(10_000_000),
          date: trimmed(20),
          paid: z.boolean(),
          note: trimmed(500).optional(),
        }),
      )
      .optional(),
    timeline: z
      .array(
        z.object({
          id: trimmed(80),
          time: trimmed(10),
          title: trimmed(200),
          owner: trimmed(100).optional(),
        }),
      )
      .optional(),
  })
  .strict();

// Admin: create a quote manually (phone / walk-in client).
export const manualQuoteSchema = z.object({
  name: trimmed(120).min(2, "Nome demasiado curto"),
  email: z.email("Email inválido").max(160).optional().default(""),
  phone: trimmed(40).optional().default(""),
  company: trimmed(160).optional().default(""),
  category: z.enum(["empresas", "particulares"]).nullable().optional().default(null),
  eventType: trimmed(40).nullable().optional().default(null),
  eventName: trimmed(200).optional().default(""),
  date: trimmed(20).optional().default(""),
  location: trimmed(200).optional().default(""),
  guests: z.coerce.number().int().min(0).max(100_000).optional().default(0),
  notes: trimmed(4000).optional().default(""),
  referralSource: trimmed(160).optional().default("Contacto direto"),
  quotedPrice: z.coerce.number().min(0).max(10_000_000).optional(),
  status: quoteStatusEnum.optional().default("em_revisao"),
});

// Admin: reply to a client message from the dashboard.
export const mensagemSchema = z.object({
  message: trimmed(8000).min(1, "Mensagem vazia"),
});

// Admin: send a reply from the inbox.
export const inboxReplySchema = z.object({
  to: z.email("Email inválido").max(160),
  subject: trimmed(300).optional().default("Re: o seu e-mail"),
  message: trimmed(8000).min(1, "Mensagem vazia"),
});

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
