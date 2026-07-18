import "server-only";
import { randomUUID } from "node:crypto";
import { createRepository, type Mapper } from "./repository";
import { getState, setState } from "./app-state";
import { getSupabase } from "./supabase";
import { log } from "./logger";

/**
 * Invoicing ledger — numbered invoices (faturas) tied to the 30%/70% payment
 * model. Persisted through the shared Repository (Supabase when configured,
 * else the dev JSON file), exactly like proposals-store / tasks-store.
 */
export interface Invoice {
  id: string;
  number: string;
  quoteId: string;
  clientName: string;
  clientEmail: string;
  kind: "sinal" | "saldo" | "total";
  amount: number; // com IVA, em €
  vatRate: number; // ex.: 0.23
  issuedAt: string; // yyyy-mm-dd (data de emissão)
  dueAt?: string; // yyyy-mm-dd (vencimento)
  paidAt?: string; // yyyy-mm-dd
  status: "emitida" | "paga" | "anulada";
  note?: string;
}

export const mapper: Mapper<Invoice> = {
  table: "invoices",
  fileName: "invoices.json",
  getId: (i) => i.id,
  toRow: (i) => ({
    id: i.id,
    number: i.number,
    quote_id: i.quoteId,
    client_name: i.clientName,
    client_email: i.clientEmail,
    kind: i.kind,
    amount: i.amount,
    vat_rate: i.vatRate,
    issued_at: i.issuedAt,
    due_at: i.dueAt || null,
    paid_at: i.paidAt || null,
    status: i.status,
    note: i.note || null,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    number: String(r.number ?? ""),
    quoteId: String(r.quote_id ?? ""),
    clientName: String(r.client_name ?? ""),
    clientEmail: String(r.client_email ?? ""),
    kind: (r.kind as Invoice["kind"]) ?? "total",
    amount: Number(r.amount ?? 0),
    vatRate: Number(r.vat_rate ?? 0.23),
    issuedAt: String(r.issued_at ?? new Date().toISOString().slice(0, 10)),
    dueAt: (r.due_at as string) ?? undefined,
    paidAt: (r.paid_at as string) ?? undefined,
    status: (r.status as Invoice["status"]) ?? "emitida",
    note: (r.note as string) ?? undefined,
  }),
  order: { column: "issued_at", ascending: false },
  fileCompare: (a, b) => {
    const d = +new Date(b.issuedAt) - +new Date(a.issuedAt);
    // Same day: keep the higher invoice number first (stable, human order).
    return d !== 0 ? d : b.number.localeCompare(a.number);
  },
};

const repo = createRepository(mapper);

export const listInvoices = (): Promise<Invoice[]> => repo.list();
export const getInvoice = (id: string): Promise<Invoice | null> => repo.get(id);
export const listInvoicesForQuote = (quoteId: string): Promise<Invoice[]> =>
  repo.where("quote_id", quoteId, (i) => i.quoteId === quoteId);
export const createInvoice = (i: Invoice): Promise<void> => repo.create(i);
export const updateInvoice = (id: string, patch: Partial<Invoice>): Promise<Invoice | null> =>
  repo.update(id, patch);

/**
 * O split 30/70 vive agora em `./money` (client-safe) — re-exportado aqui para
 * que os importadores server-side existentes continuem a funcionar sem mudanças.
 */
export { splitThirtySeventy } from "./money";

/** Convenience id generator so callers don't reach for crypto directly. */
export const newInvoiceId = (): string => randomUUID();

/**
 * Sequential invoice number, per year: `FT ${year}/${nnnn}` (zero-padded to 4
 * digits, e.g. "FT 2026/0007"). Portuguese fiscal numbering must be unique and
 * strictly sequential, so the increment has to be race-free.
 *
 * Preferred path (Supabase configured): a single atomic SQL statement —
 * `next_invoice_seq(year)` does an upsert-and-return (`n = n + 1 … returning n`).
 * The Postgres row lock serializes concurrent issuances, so two near-simultaneous
 * POSTs each get a distinct, consecutive `n` — never a duplicate or skipped FT.
 *
 * Fallback path (dev/file mode, OR the RPC errored — e.g. an install that hasn't
 * run the migration yet): the historical best-effort read-increment-write over
 * the shared app-state store. Not a hard mutex, but app-state is a single row and
 * two simultaneous POSTs are the realistic worst case; the counter never goes
 * backwards, so the practical failure mode is a skipped/duplicate number under a
 * true race, never a reused-then-clobbered sequence. Keeping this fallback means
 * nothing breaks before `db/schema.sql` (the invoice_counters + function) is run.
 *
 * The FT string format and the per-year reset are identical on both paths.
 */
export async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();

  // ── Preferred: atomic DB counter (race-free) ──
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.rpc("next_invoice_seq", { p_year: year });
      if (error) throw error;
      const n = Number(data);
      if (Number.isFinite(n) && n > 0) {
        return `FT ${year}/${String(n).padStart(4, "0")}`;
      }
      throw new Error(`next_invoice_seq devolveu um valor inesperado: ${JSON.stringify(data)}`);
    } catch (err) {
      // Graceful degradation: uma instalação que ainda não correu a migração
      // (função inexistente) não pode ficar sem numerar. Registamos e caímos
      // para o contador em app_state — o exato comportamento pré-migração.
      log.error(
        "nextInvoiceNumber: RPC next_invoice_seq falhou — a usar o contador app_state (correu db/schema.sql?)",
        err,
        { year },
      );
    }
  }

  // ── Fallback: read-increment-write over app-state (dev / pré-migração) ──
  const key = `invoice-seq-${year}`;
  const current = (await getState<number>(key)) ?? 0;
  const next = current + 1;
  await setState(key, next);
  return `FT ${year}/${String(next).padStart(4, "0")}`;
}
