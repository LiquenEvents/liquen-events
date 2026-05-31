import type { Quote } from "@/app/orcamento/types";
import { createRepository, type Mapper } from "./repository";

/**
 * Storage layer for quote requests. The full quote is kept in a `data` jsonb
 * column (with status/name/email mirrored for listing/searching); the file
 * fallback stores the quote object verbatim.
 */
export const mapper: Mapper<Quote> = {
  table: "quotes",
  fileName: "quotes.json",
  selectColumns: "data",
  getId: (q) => q.id,
  toRow: (q) => ({ id: q.id, status: q.status, name: q.name, email: q.email, data: q }),
  fromRow: (r) => r.data as Quote,
  order: { column: "created_at", ascending: false },
  fileCompare: (a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt),
  touch: true,
  beforeUpdate: (q) => ({ ...q, lastUpdated: new Date().toISOString() }),
};

const repo = createRepository(mapper);

export const createQuote = (quote: Quote): Promise<void> => repo.create(quote);
export const listQuotes = (): Promise<Quote[]> => repo.list();
export const getQuote = (id: string): Promise<Quote | null> => repo.get(id);
export const updateQuote = (id: string, updates: Partial<Quote>): Promise<Quote | null> =>
  repo.update(id, updates);
