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
// Remoção definitiva de uma fatura do livro. A guarda fiscal (só faturas
// `anulada` podem ser apagadas) vive na rota — o store apenas expõe a operação.
export const deleteInvoice = (id: string): Promise<void> => repo.remove(id);

/**
 * O split 30/70 vive agora em `./money` (client-safe) — re-exportado aqui para
 * que os importadores server-side existentes continuem a funcionar sem mudanças.
 */
export { splitThirtySeventy } from "./money";

/** Convenience id generator so callers don't reach for crypto directly. */
export const newInvoiceId = (): string => randomUUID();

/**
 * Reconhece uma violação de unicidade do Postgres (SQLSTATE 23505) vinda do
 * Supabase. Serve de backstop às corridas TOCTOU de emissão sinal/saldo: os
 * índices parciais únicos (db/schema.sql — invoices_one_active_sinal_uk /
 * invoices_one_active_saldo_uk) deixam só uma emissão vencer o insert; a que
 * perde apanha este erro e é tratada como "já emitido", não como falha. O
 * backend de ficheiro (dev) serializa as escritas e não chega aqui.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23505") return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && /duplicate key value|unique constraint/i.test(msg);
}

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
 * Fallback path (APENAS dev, quando o Supabase NÃO está configurado): the
 * historical best-effort read-increment-write over the shared app-state store.
 * Not a hard mutex, but in dev two simultaneous POSTs are the realistic worst
 * case and the counter never goes backwards.
 *
 * CRÍTICO (fiscal): se o Supabase ESTÁ configurado mas a RPC falha (ex.: a
 * migração `db/schema.sql` — invoice_counters + next_invoice_seq — ainda não
 * correu), NÃO caímos para o contador racy de app_state. Em produção, um número
 * fiscal duplicado/saltado é um problema legal; preferimos RECUSAR emitir e
 * deixar a migração em falta berrar (log + throw) a corromper a sequência.
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
      // Supabase configurado + RPC falhou: recusamos emitir em vez de cair no
      // contador racy. Uma migração em falta tem de aparecer alto, não corromper
      // silenciosamente a numeração fiscal. O fallback de app_state é SÓ para dev
      // (Supabase não configurado), tratado abaixo.
      log.error(
        "nextInvoiceNumber: RPC next_invoice_seq falhou com Supabase configurado — a RECUSAR emissão (correu db/schema.sql?)",
        err,
        { year },
      );
      throw new Error(
        "Numeração de faturas indisponível: o contador atómico (next_invoice_seq) falhou. Aplique db/schema.sql.",
      );
    }
  }

  // ── Fallback: read-increment-write over app-state (SÓ dev — Supabase não
  //    configurado). Comportamento idêntico ao histórico. ──
  const key = `invoice-seq-${year}`;
  const current = (await getState<number>(key)) ?? 0;
  const next = current + 1;
  await setState(key, next);
  return `FT ${year}/${String(next).padStart(4, "0")}`;
}
