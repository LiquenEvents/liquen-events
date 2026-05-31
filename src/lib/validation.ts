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
