import type { Proposal } from "@/app/orcamento/types";
import { createRepository, type Mapper } from "./repository";

export const mapper: Mapper<Proposal> = {
  table: "proposals",
  fileName: "proposals.json",
  getId: (p) => p.id,
  toRow: (p) => ({
    id: p.id,
    quote_id: p.quoteId,
    client_name: p.clientName,
    client_email: p.clientEmail,
    currency: p.currency,
    line_items: p.lineItems,
    vat_rate: p.vatRate,
    subtotal: p.subtotal,
    vat: p.vat,
    total: p.total,
    valid_until: p.validUntil || null,
    notes: p.notes || null,
    status: p.status,
    sent_at: p.sentAt || null,
    responded_at: p.respondedAt || null,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    quoteId: String(r.quote_id ?? ""),
    clientName: String(r.client_name ?? ""),
    clientEmail: String(r.client_email ?? ""),
    currency: String(r.currency ?? "EUR"),
    lineItems: (r.line_items as Proposal["lineItems"]) ?? [],
    vatRate: Number(r.vat_rate ?? 0.23),
    subtotal: Number(r.subtotal ?? 0),
    vat: Number(r.vat ?? 0),
    total: Number(r.total ?? 0),
    validUntil: (r.valid_until as string) ?? undefined,
    notes: (r.notes as string) ?? undefined,
    status: (r.status as Proposal["status"]) ?? "rascunho",
    createdAt: String(r.created_at ?? new Date().toISOString()),
    sentAt: (r.sent_at as string) ?? undefined,
    respondedAt: (r.responded_at as string) ?? undefined,
  }),
  order: { column: "created_at", ascending: false },
  fileCompare: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
};

const repo = createRepository(mapper);

export const createProposal = (p: Proposal): Promise<void> => repo.create(p);
export const listAllProposals = (): Promise<Proposal[]> => repo.list();
export const getProposal = (id: string): Promise<Proposal | null> => repo.get(id);
export const updateProposal = (id: string, patch: Partial<Proposal>): Promise<Proposal | null> =>
  repo.update(id, patch);
export const listProposalsForQuote = (quoteId: string): Promise<Proposal[]> =>
  repo.where("quote_id", quoteId, (p) => p.quoteId === quoteId);
