import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Proposal } from "@/lib/orcamento/types";
import type { ProposalDoc } from "@/lib/proposal-doc";

// ── In-memory stand-in for the shared Repository ──────────────────────────────
// It FAITHFULLY mirrors the real backend contract so the store's own logic is
// exercised, not a toy: like FileBackend it stores domain objects verbatim, and
// like BOTH backends it returns `list()`/`where()` ORDERED by the mapper's
// comparator (Supabase applies `order`, the file backend applies `fileCompare`).
// `getProposalByQuote` returns `rows[0]` and RELIES on that ordering, so the mock
// must sort — otherwise the "newest wins" tests would only prove the mock.
const mem = vi.hoisted(() => ({ store: [] as Proposal[] }));

vi.mock("./repository", () => ({
  createRepository: (m: {
    getId: (p: Proposal) => string;
    fileCompare?: (a: Proposal, b: Proposal) => number;
  }) => {
    const sorted = () => (m.fileCompare ? [...mem.store].sort(m.fileCompare) : [...mem.store]);
    return {
      list: async () => sorted(),
      get: async (id: string) => mem.store.find((p) => m.getId(p) === id) ?? null,
      where: async (_col: string, _val: unknown, predicate: (p: Proposal) => boolean) =>
        sorted().filter(predicate),
      create: async (p: Proposal) => {
        mem.store.push(p);
      },
      update: async (id: string, patch: Partial<Proposal>) => {
        const idx = mem.store.findIndex((p) => m.getId(p) === id);
        if (idx === -1) return null;
        const merged = { ...mem.store[idx], ...patch };
        mem.store[idx] = merged;
        return merged;
      },
    };
  },
}));

import {
  mapper,
  createProposal,
  listAllProposals,
  getProposal,
  updateProposal,
  listProposalsForQuote,
  getProposalByQuote,
} from "./proposals-store";

beforeEach(() => {
  mem.store = [];
});

// A fully-populated line-item proposal; override per test.
const mk = (over: Partial<Proposal> = {}): Proposal => ({
  id: "p1",
  quoteId: "q1",
  clientName: "Maria",
  clientEmail: "maria@example.com",
  currency: "EUR",
  lineItems: [{ description: "Decor", qty: 2, unitPrice: 500 }],
  vatRate: 0.23,
  subtotal: 1000,
  vat: 230,
  total: 1230,
  validUntil: "2026-09-01",
  notes: "obrigada",
  status: "enviada",
  createdAt: "2026-07-01T10:00:00.000Z",
  sentAt: "2026-07-01T10:00:00.000Z",
  respondedAt: undefined,
  ...over,
});

// ── mapper: Supabase row mapping (the bug-prone camelCase ↔ snake_case part) ──
describe("mapper — toRow / fromRow round-trip", () => {
  it("round-trips every scalar field (with created_at supplied by the DB column)", () => {
    const p = mk({ doc: undefined });
    const row = mapper.toRow(p);
    // toRow does NOT emit created_at (the DB column defaults to now()); supply it
    // as the read backend would so the round-trip is apples-to-apples.
    row.created_at = p.createdAt;
    expect(mapper.fromRow(row)).toEqual(p);
    expect(mapper.getId(p)).toBe("p1");
    expect(mapper.table).toBe("proposals");
  });

  it("maps camelCase → snake_case columns", () => {
    const row = mapper.toRow(mk());
    expect(row.quote_id).toBe("q1");
    expect(row.client_name).toBe("Maria");
    expect(row.client_email).toBe("maria@example.com");
    expect(row.vat_rate).toBe(0.23);
    expect(row.valid_until).toBe("2026-09-01");
    expect(row.sent_at).toBe("2026-07-01T10:00:00.000Z");
  });

  it("fromRow applies sane defaults for a near-empty row", () => {
    const got = mapper.fromRow({ id: "x", created_at: "2026-01-01T00:00:00.000Z" });
    expect(got).toEqual({
      id: "x",
      quoteId: "",
      clientName: "",
      clientEmail: "",
      currency: "EUR",
      lineItems: [],
      vatRate: 0.23,
      subtotal: 0,
      vat: 0,
      total: 0,
      validUntil: undefined,
      notes: undefined,
      status: "rascunho",
      createdAt: "2026-01-01T00:00:00.000Z",
      sentAt: undefined,
      respondedAt: undefined,
    });
  });

  it("preserves a ZERO vatRate (IVA isento) instead of falling back to 0.23", () => {
    // Uses `?? 0.23`, not `|| 0.23`: a genuine 0% rate (isento) must survive.
    expect(mapper.fromRow({ id: "x", vat_rate: 0 }).vatRate).toBe(0);
  });

  it("preserves ZERO money fields instead of coercing them away", () => {
    const got = mapper.fromRow({ id: "x", subtotal: 0, vat: 0, total: 0 });
    expect([got.subtotal, got.vat, got.total]).toEqual([0, 0, 0]);
  });

  it("keeps negative money verbatim (store does no validation — routes do)", () => {
    const got = mapper.fromRow({ id: "x", subtotal: -100, vat: -23, total: -123 });
    expect([got.subtotal, got.vat, got.total]).toEqual([-100, -23, -123]);
  });

  it("coerces NULL optionals to undefined (valid_until / notes / sent_at / responded_at)", () => {
    const got = mapper.fromRow({
      id: "x",
      valid_until: null,
      notes: null,
      sent_at: null,
      responded_at: null,
    });
    expect(got.validUntil).toBeUndefined();
    expect(got.notes).toBeUndefined();
    expect(got.sentAt).toBeUndefined();
    expect(got.respondedAt).toBeUndefined();
  });

  it("toRow lowers empty-string optionals to NULL (|| null — documented lossiness)", () => {
    const row = mapper.toRow(mk({ validUntil: "", notes: "", sentAt: "", respondedAt: "" }));
    expect(row.valid_until).toBeNull();
    expect(row.notes).toBeNull();
    expect(row.sent_at).toBeNull();
    expect(row.responded_at).toBeNull();
  });

  it("defaults an unknown/absent status to rascunho on read", () => {
    expect(mapper.fromRow({ id: "x" }).status).toBe("rascunho");
  });

  it("does NOT validate the status value on read — an unknown status passes through", () => {
    // The store is a dumb persistence layer; only the PATCH route allow-lists
    // statuses. This pins that the mapper itself never sanitises.
    expect(mapper.fromRow({ id: "x", status: "banana" }).status).toBe("banana");
  });
});

// ── BUG (needs a schema column to fully fix): the studio `doc` is DROPPED ──────
describe("mapper — the Proposal Studio `doc` is silently dropped by the Supabase mapping", () => {
  const doc: ProposalDoc = {
    ref: "PO Decoração",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Évora",
    guests: "150 pax",
    serviceGroups: [],
    moodBoards: [],
    budgetItems: ["Decor"],
    totalLabel: "Valor Total",
    totalText: "3000,00 € + IVA",
    coverImages: [],
    // Only the fields the mapper would carry matter here; the rest of the studio
    // boilerplate is irrelevant to persistence, so cast through unknown.
  } as unknown as ProposalDoc;

  it("toRow produces NO `doc` column (there is no proposals.doc column either)", () => {
    const row = mapper.toRow(mk({ doc }));
    expect("doc" in row).toBe(false);
  });

  it("a full toRow→fromRow round-trip LOSES `doc` (portal PDF + studio re-open break in prod)", () => {
    const row = mapper.toRow(mk({ doc }));
    row.created_at = "2026-07-01T10:00:00.000Z";
    expect(mapper.fromRow(row).doc).toBeUndefined();
  });
});

// ── create / get / list ───────────────────────────────────────────────────────
describe("createProposal / getProposal / listAllProposals", () => {
  it("creates then reads a proposal back", async () => {
    await createProposal(mk({ id: "a" }));
    expect(await getProposal("a")).toMatchObject({ id: "a", quoteId: "q1" });
  });

  it("returns null (not undefined, not throw) for an unknown id", async () => {
    expect(await getProposal("nope")).toBeNull();
  });

  it("lists all proposals", async () => {
    await createProposal(mk({ id: "a" }));
    await createProposal(mk({ id: "b" }));
    expect((await listAllProposals()).map((p) => p.id).sort()).toEqual(["a", "b"]);
  });
});

// ── listProposalsForQuote ─────────────────────────────────────────────────────
describe("listProposalsForQuote — filter correctness", () => {
  it("returns only the proposals of the requested quote", async () => {
    await createProposal(mk({ id: "a", quoteId: "q1" }));
    await createProposal(mk({ id: "b", quoteId: "q2" }));
    await createProposal(mk({ id: "c", quoteId: "q1" }));
    expect((await listProposalsForQuote("q1")).map((p) => p.id).sort()).toEqual(["a", "c"]);
  });

  it("returns an EMPTY ARRAY (not null) for a quote with no proposals", async () => {
    const res = await listProposalsForQuote("ghost");
    expect(res).toEqual([]);
    expect(res).not.toBeNull();
  });
});

// ── getProposalByQuote — "newest wins" ────────────────────────────────────────
describe("getProposalByQuote — newest proposal for a quote", () => {
  it("returns the newest by createdAt even when inserted OUT of order", async () => {
    await createProposal(mk({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" }));
    await createProposal(mk({ id: "new", createdAt: "2026-06-01T00:00:00.000Z" }));
    await createProposal(mk({ id: "mid", createdAt: "2026-03-01T00:00:00.000Z" }));
    expect((await getProposalByQuote("q1"))?.id).toBe("new");
  });

  it("returns null for a quote with no proposals", async () => {
    expect(await getProposalByQuote("q1")).toBeNull();
  });

  it("does not leak proposals from OTHER quotes", async () => {
    await createProposal(mk({ id: "a", quoteId: "q1", createdAt: "2026-01-01T00:00:00.000Z" }));
    await createProposal(mk({ id: "b", quoteId: "q2", createdAt: "2026-09-01T00:00:00.000Z" }));
    expect((await getProposalByQuote("q1"))?.id).toBe("a");
  });

  it("picks a proposal carrying the MAX createdAt when timestamps tie (backend-arbitrary)", async () => {
    // Same createdAt → no defined winner. Pin the meaningful invariant: whatever
    // is returned is one of the newest, never an older one. (Supabase ordering by
    // an equal created_at is arbitrary; a stable file sort keeps insertion order.)
    await createProposal(mk({ id: "t1", createdAt: "2026-05-05T00:00:00.000Z" }));
    await createProposal(mk({ id: "t2", createdAt: "2026-05-05T00:00:00.000Z" }));
    await createProposal(mk({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" }));
    expect(["t1", "t2"]).toContain((await getProposalByQuote("q1"))?.id);
  });

  it("is STATUS-AGNOSTIC — a newer rascunho (draft) shadows an older ACEITE one", async () => {
    // NEEDS DECISION: the client portal renders getProposalByQuote's result. After
    // acceptance the team may start a newer DRAFT; this returns that unsent draft,
    // not the accepted proposal the client actually agreed to. Consumers that need
    // the accepted one resolve it via the contract (see portal proposta-pdf route);
    // pinning the raw store behaviour here so any change is deliberate.
    await createProposal(
      mk({ id: "accepted", status: "aceite", createdAt: "2026-02-01T00:00:00.000Z" }),
    );
    await createProposal(
      mk({ id: "draft", status: "rascunho", createdAt: "2026-08-01T00:00:00.000Z" }),
    );
    expect((await getProposalByQuote("q1"))?.id).toBe("draft");
  });

  it("returns the newest even with MULTIPLE accepted proposals for the quote", async () => {
    await createProposal(
      mk({ id: "acc1", status: "aceite", createdAt: "2026-02-01T00:00:00.000Z" }),
    );
    await createProposal(
      mk({ id: "acc2", status: "aceite", createdAt: "2026-04-01T00:00:00.000Z" }),
    );
    expect((await getProposalByQuote("q1"))?.id).toBe("acc2");
  });
});

// ── updateProposal — the store does NOT enforce the lifecycle ─────────────────
describe("updateProposal — persistence only, no lifecycle guard (guards live in /proposta)", () => {
  it("merges a patch without clobbering untouched fields", async () => {
    await createProposal(mk({ id: "a", status: "enviada", notes: "orig" }));
    const updated = await updateProposal("a", {
      status: "aceite",
      respondedAt: "2026-07-10T00:00:00.000Z",
    });
    expect(updated).toMatchObject({
      status: "aceite",
      notes: "orig",
      respondedAt: "2026-07-10T00:00:00.000Z",
    });
    expect((await getProposal("a"))?.status).toBe("aceite");
  });

  it("returns null when updating an unknown id (no accidental create)", async () => {
    expect(await updateProposal("ghost", { status: "aceite" })).toBeNull();
    expect(await listAllProposals()).toHaveLength(0);
  });

  it("ALLOWS a double-accept (aceite → aceite) — store never rejects a re-transition", async () => {
    await createProposal(mk({ id: "a", status: "aceite" }));
    expect((await updateProposal("a", { status: "aceite" }))?.status).toBe("aceite");
  });

  it("ALLOWS reject-after-accept (aceite → rejeitada) at the store layer", async () => {
    await createProposal(mk({ id: "a", status: "aceite" }));
    expect((await updateProposal("a", { status: "rejeitada" }))?.status).toBe("rejeitada");
  });

  it("ALLOWS accept-after-reject (rejeitada → aceite) at the store layer", async () => {
    await createProposal(mk({ id: "a", status: "rejeitada" }));
    expect((await updateProposal("a", { status: "aceite" }))?.status).toBe("aceite");
  });

  it("persists an UNKNOWN status verbatim — no validation in the store", async () => {
    await createProposal(mk({ id: "a", status: "enviada" }));
    const updated = await updateProposal("a", { status: "expirada" as Proposal["status"] });
    expect(updated?.status).toBe("expirada");
  });

  it("can still accept a proposal whose linked quote no longer exists (no FK check in store)", async () => {
    // A deleted quote does not cascade into the proposals store; accepting still
    // mutates the row. (The quote FK is `on delete set null` in the DB.)
    await createProposal(mk({ id: "a", quoteId: "deleted-quote", status: "enviada" }));
    expect((await updateProposal("a", { status: "aceite" }))?.status).toBe("aceite");
  });
});
