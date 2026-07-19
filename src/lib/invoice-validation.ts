import { z } from "zod";

/**
 * Server-side input validation for the faturas (invoice) API routes.
 *
 * These schemas are *additive hardening*: they reject clearly-malformed
 * requests with a clean 400 (bad JSON, a non-object body, wrong-typed fields,
 * an unknown status/kind, an out-of-range VAT rate) BEFORE the handlers run.
 * They are deliberately permissive about the shapes the handlers already
 * accept — scalar text fields still take a string *or* number (the routes run
 * them through `clean()`/`String()`), and amount/total still take a numeric
 * string (the routes coerce with `Number()`), so no previously-valid payload
 * starts failing. The route keeps its own value logic (clamping, the
 * "Cliente obrigatório" / "Valor inválido" checks, the yyyy-mm-dd coercion).
 */

export const invoiceKinds = ["sinal", "saldo", "total"] as const;
export const invoiceStatuses = ["emitida", "paga", "anulada"] as const;

// Text-ish field: the routes stringify it via clean()/String(), so a string or
// number is fine; an object/array/boolean is not (it would smuggle
// "[object Object]" — or worse — into a stored invoice field).
const scalarText = z.union([z.string(), z.number()]).nullish();

// Numeric-ish field: the routes coerce with Number(), so a numeric string is a
// valid input too. Range/clamping stays in the route (num()).
const numericInput = z.union([z.number(), z.string()]).nullish();

// Date-ish field: the routes validate with a yyyy-mm-dd regex and treat
// anything else (including "") as "unset". Accept string|null|absent so the
// "clear a date by sending an empty string" flow keeps working; reject other
// types (a stray number/object is malformed).
const dateInput = z.union([z.string(), z.null()]).optional();

/** POST /api/faturas — create one invoice, or the 30/70 sinal+saldo pair. */
export const invoiceCreateSchema = z
  .object({
    quoteId: scalarText,
    clientName: scalarText,
    clientEmail: scalarText,
    note: scalarText,
    kind: z.enum(invoiceKinds, { message: "Tipo de fatura inválido." }).optional(),
    vatRate: z
      .number({ message: "Taxa de IVA inválida." })
      .min(0, "Taxa de IVA inválida.")
      .max(1, "Taxa de IVA inválida.")
      .optional(),
    amount: numericInput,
    total: numericInput,
    split: z.boolean({ message: "Campo 'split' inválido." }).optional(),
    issuedAt: dateInput,
    dueAt: dateInput,
  })
  .strip();

/** PATCH /api/faturas/[id] — partial update (status / paidAt / dueAt / note). */
export const invoiceUpdateSchema = z
  .object({
    status: z.enum(invoiceStatuses, { message: "Estado inválido" }),
    paidAt: dateInput,
    dueAt: dateInput,
    note: z.union([z.string(), z.number(), z.null()]).optional(),
  })
  .partial()
  .strip();

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;

/**
 * First human-readable error for a 400 response. zod's built-in messages are in
 * English ("Invalid input", "Invalid option…"); we surface our own PT messages
 * where we set them and fall back to a generic PT message otherwise, so a 400
 * body never leaks an English zod default.
 */
export function firstIssue(err: z.ZodError, fallback = "Dados inválidos."): string {
  const msg = err.issues[0]?.message;
  if (!msg || /^Invalid\b/i.test(msg) || /^Too (big|small)\b/i.test(msg)) return fallback;
  return msg;
}

/** Reads the request body as JSON, flagging malformed JSON instead of throwing. */
export async function readJsonBody(request: {
  json: () => Promise<unknown>;
}): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

/**
 * Validates an already-parsed body against a schema, first rejecting anything
 * that isn't a plain JSON object (null / primitive / array) with a PT message.
 */
export function validateBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
): { ok: true; data: T } | { ok: false; error: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Corpo do pedido inválido." };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return { ok: true, data: parsed.data };
}
