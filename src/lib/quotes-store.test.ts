import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Mapper } from "./repository";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";

/**
 * Adversarial store-level coverage for the quotes CRM entity.
 *
 * quotes-store is a thin delegation layer over the shared Repository plus a
 * `data`-jsonb mapper (the full quote lives in one blob; id/status/name/email
 * are mirrored into columns for DB-side listing/searching). Business validation
 * (status enum, price bounds, allow-listed fields) lives in the PATCH route's
 * zod schema — NOT here — so these tests pin exactly what the store itself does
 * and does NOT guard.
 *
 * The Repository generic (backends, optimistic-lock retry) is proven in
 * repository.test.ts; here the store's OWN mapper is bound to a faithful
 * in-memory fake that reproduces the real read-merge-write semantics
 * (update ⇒ updateWith ⇒ applies mapper.beforeUpdate) so mapper wiring and the
 * store's delegation are exercised without disk or Supabase.
 */

const db = vi.hoisted(() => ({ rows: new Map<string, Quote>() }));

vi.mock("./repository", () => ({
  createRepository: (mapper: Mapper<Quote>) => {
    // Mirror Repository.updateWith: read → mutate → beforeUpdate → write,
    // null when the id is unknown. Repository.update is updateWith with a
    // shallow-spread mutator, so model it the same way.
    const updateWith = async (id: string, mutate: (c: Quote) => Quote) => {
      const cur = db.rows.get(id);
      if (!cur) return null;
      let merged = mutate(cur);
      if (mapper.beforeUpdate) merged = mapper.beforeUpdate(merged);
      db.rows.set(id, merged);
      return merged;
    };
    return {
      list: async () => [...db.rows.values()],
      get: async (id: string) => db.rows.get(id) ?? null,
      where: async (_c: string, _v: unknown, pred: (e: Quote) => boolean) =>
        [...db.rows.values()].filter(pred),
      create: async (e: Quote) => {
        db.rows.set(mapper.getId(e), e);
      },
      update: (id: string, patch: Partial<Quote>) =>
        updateWith(id, (c) => ({ ...c, ...patch }) as Quote),
      updateWith,
      remove: async (id: string) => {
        db.rows.delete(id);
      },
    };
  },
}));

import {
  mapper,
  generateQuoteId,
  quoteIdFor,
  createQuote,
  listQuotes,
  listQuoteSummaries,
  resumirQuote,
  getQuote,
  updateQuote,
  updateQuoteWith,
  deleteQuote,
} from "./quotes-store";

const priceBreakdown = () => ({
  basePrice: 1000,
  guestCost: 500,
  packageMultiplier: 1,
  locationSurcharge: 0,
  weekendSurcharge: 0,
  seasonSurcharge: 0,
  urgencySurcharge: 0,
  addonsCost: 0,
  subtotal: 1500,
  iva: 345,
  total: 1845,
  rangeMin: 1500,
  rangeMax: 2000,
  isEstimate: true,
});

function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    submittedAt: "2026-01-01T10:00:00.000Z",
    status: "pendente",
    priceBreakdown: priceBreakdown(),
    category: "particulares",
    eventType: "casamentos",
    eventName: "Casamento Ana & Rui",
    date: "2026-09-01",
    endDate: "",
    location: "Lisboa",
    locationType: "lisboa",
    guests: 100,
    duration: 8,
    isMultiDay: false,
    packageTier: "completo",
    addons: [],
    budgetRange: "30k_60k",
    urgency: "standard",
    notes: "",
    referralSource: "",
    name: "Ana",
    email: "ana@example.pt",
    phone: "910000000",
    company: "",
    nif: "",
    acceptTerms: true,
    acceptMarketing: false,
    ...over,
  };
}

beforeEach(() => {
  db.rows.clear();
  vi.clearAllMocks();
});

// ── generateQuoteId — random public reference ───────────────────────────────
describe("generateQuoteId", () => {
  it("has the LIQ prefix and a 16-hex (64-bit) random suffix", () => {
    expect(generateQuoteId()).toMatch(/^LIQ-[0-9A-Z]+-[0-9A-F]{16}$/);
  });

  it("is unique across many calls (random suffix, no same-millisecond collision)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5000; i++) ids.add(generateQuoteId());
    expect(ids.size).toBe(5000);
  });

  it("keeps its full entropy even when called repeatedly within one millisecond", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T00:00:00.000Z"));
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateQuoteId()); // clock frozen
    expect(ids.size).toBe(1000);
    vi.useRealTimers();
  });
});

// ── quoteIdFor — deterministic idempotency id (POST retry dedupe) ────────────
describe("quoteIdFor", () => {
  const saved = { s: process.env.SESSION_SECRET, a: process.env.ADMIN_SESSION_SECRET };
  beforeEach(() => {
    process.env.SESSION_SECRET = "unit-secret";
    delete process.env.ADMIN_SESSION_SECRET;
  });
  afterEach(() => {
    if (saved.s === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = saved.s;
    if (saved.a === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = saved.a;
  });

  it("is deterministic and well-shaped for a given submission id", () => {
    expect(quoteIdFor("sub-abc")).toBe(quoteIdFor("sub-abc"));
    expect(quoteIdFor("sub-abc")).toMatch(/^LIQ-[0-9A-F]{6}-[0-9A-F]{16}$/);
  });

  it("differs across submission ids (no collision on distinct input)", () => {
    expect(quoteIdFor("sub-abc")).not.toBe(quoteIdFor("sub-xyz"));
  });

  it("is exact — whitespace/case variants are treated as distinct submissions", () => {
    expect(quoteIdFor("sub-abc")).not.toBe(quoteIdFor(" sub-abc"));
    expect(quoteIdFor("sub-abc")).not.toBe(quoteIdFor("SUB-ABC"));
  });

  it("is keyed by the server secret: the same submission id yields a different id under a different secret", () => {
    const a = quoteIdFor("sub-abc");
    process.env.SESSION_SECRET = "a-different-secret";
    expect(quoteIdFor("sub-abc")).not.toBe(a);
  });

  // ⚠️ NEEDS DECISION (pinned): with NEITHER secret set, quoteIdFor silently
  // keys the HMAC with the hardcoded, repo-public constant "liquen-idem-dev".
  // env.ts only WARNS (never throws) on a missing SESSION_SECRET, so this branch
  // is reachable in a misconfigured production — where anyone with the source
  // can recompute a quote's id from its submissionId, voiding the "unguessable /
  // can't be enumerated" guarantee in the function's own docstring. The codebase
  // elsewhere refuses to serve on a prod dev-fallback (FileBackend.assertWritable
  // InProd, invoices-store FIX 2). This test pins the CURRENT (vulnerable)
  // behaviour so the exposure is visible and can't drift silently.
  it("[NEEDS DECISION] with no secret set, derives the id from the PUBLIC constant dev key", async () => {
    delete process.env.SESSION_SECRET;
    delete process.env.ADMIN_SESSION_SECRET;
    const { createHmac } = await import("node:crypto");
    // Anyone with the repo can reproduce this — that is the point.
    const h = createHmac("sha256", "liquen-idem-dev")
      .update("quote:sub-abc")
      .digest("hex")
      .toUpperCase();
    const forgeable = `LIQ-${h.slice(0, 6)}-${h.slice(6, 22)}`;
    expect(quoteIdFor("sub-abc")).toBe(forgeable);
  });

  it("falls back to ADMIN_SESSION_SECRET when SESSION_SECRET is unset", () => {
    delete process.env.SESSION_SECRET;
    process.env.ADMIN_SESSION_SECRET = "admin-secret";
    const withAdmin = quoteIdFor("sub-abc");
    process.env.SESSION_SECRET = "admin-secret";
    delete process.env.ADMIN_SESSION_SECRET;
    // Same effective key ⇒ same id regardless of WHICH env var supplied it.
    expect(quoteIdFor("sub-abc")).toBe(withAdmin);
  });
});

// ── mapper — data-blob + mirror columns ─────────────────────────────────────
describe("mapper (quote ↔ row)", () => {
  it("mirrors id/status/name/email into columns and keeps the full quote in `data`", () => {
    const q = quote({ id: "q9", status: "cotado", name: "Rui", email: "rui@x.pt" });
    const row = mapper.toRow(q);
    expect(row).toMatchObject({ id: "q9", status: "cotado", name: "Rui", email: "rui@x.pt" });
    expect(row.data).toEqual(q);
  });

  it("round-trips a fully-populated quote, deeply (arrays/nested objects intact)", () => {
    const q = quote({
      id: "q-full",
      quotedPrice: 184500,
      adminNotes: "Cliente VIP",
      tags: ["VIP", "Outono"],
      payments: [{ id: "p1", kind: "sinal", amount: 500, date: "2026-02-01", paid: true }],
      activityLog: [{ id: "a1", at: "2026-01-01T10:00:00Z", kind: "created", summary: "criado" }],
      addons: [
        { id: "dj", name: "DJ", tier: "completo", price: 800, quantity: 1, pricingType: "fixed" },
      ],
    });
    expect(mapper.fromRow(mapper.toRow(q))).toEqual(q);
  });

  it("treats `data` as the source of truth: stale mirror columns never override the blob", () => {
    // A row whose mirror columns drifted from the blob (e.g. an out-of-band SQL
    // update) must still read back the authoritative blob, not the columns.
    const q = quote({ id: "q2", status: "aceite", name: "Ana", email: "ana@x.pt" });
    const back = mapper.fromRow({
      id: "q2",
      status: "pendente", // stale
      name: "STALE",
      email: "stale@x.pt",
      data: q,
    });
    expect(back).toEqual(q);
    expect(back.status).toBe("aceite");
    expect(back.name).toBe("Ana");
  });
});

// ── CRUD delegation ─────────────────────────────────────────────────────────
describe("CRUD delegation", () => {
  it("createQuote persists verbatim (no server-side mutation of the payload)", async () => {
    const q = quote({ id: "q1" });
    await createQuote(q);
    const got = await getQuote("q1");
    expect(got).toEqual(q);
    expect(got?.lastUpdated).toBeUndefined(); // create does not stamp lastUpdated
  });

  it("getQuote returns null (never throws) for an unknown id", async () => {
    await expect(getQuote("does-not-exist")).resolves.toBeNull();
  });

  it("listQuotes returns every stored quote", async () => {
    await createQuote(quote({ id: "a" }));
    await createQuote(quote({ id: "b" }));
    expect(await listQuotes()).toHaveLength(2);
  });

  it("updateQuote merges the patch and stamps lastUpdated (beforeUpdate wiring)", async () => {
    await createQuote(quote({ id: "q1", status: "pendente" }));
    const updated = await updateQuote("q1", { status: "cotado", quotedPrice: 200000 });
    expect(updated).toMatchObject({ status: "cotado", quotedPrice: 200000 });
    expect(updated?.lastUpdated).toBeTruthy();
    // Untouched fields survive.
    expect(updated?.eventName).toBe("Casamento Ana & Rui");
    expect((await getQuote("q1"))?.status).toBe("cotado");
  });

  it("updateQuote returns null for an unknown id (no phantom insert)", async () => {
    expect(await updateQuote("ghost", { status: "aceite" })).toBeNull();
    expect(await listQuotes()).toHaveLength(0);
  });

  it("deleteQuote removes the quote", async () => {
    await createQuote(quote({ id: "q1" }));
    await deleteQuote("q1");
    expect(await getQuote("q1")).toBeNull();
  });

  it("deleteQuote on an unknown id is a silent no-op (does not throw)", async () => {
    await createQuote(quote({ id: "keep" }));
    await expect(deleteQuote("ghost")).resolves.toBeUndefined();
    expect(await listQuotes()).toHaveLength(1); // unrelated quote untouched
  });
});

// ── updateQuoteWith — read-derived append safety ────────────────────────────
describe("updateQuoteWith", () => {
  it("derives the new quote from the freshly-read current (safe for appends)", async () => {
    await createQuote(quote({ id: "q1", activityLog: [] }));
    const updated = await updateQuoteWith("q1", (q) => ({
      ...q,
      activityLog: [
        ...(q.activityLog ?? []),
        { id: "a1", at: "2026-02-01T00:00:00Z", kind: "note_added", summary: "nota" },
      ],
    }));
    expect(updated?.activityLog).toHaveLength(1);
    expect(updated?.lastUpdated).toBeTruthy();
  });

  it("returns null for an unknown id and never invokes the mutator", async () => {
    const mutate = vi.fn((q: Quote) => q);
    expect(await updateQuoteWith("ghost", mutate)).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });
});

// ── Adversarial pins: the store does NOT enforce domain rules (route does) ───
// These lock the store's real behaviour so a future refactor can't silently
// change it. Where the "right" behaviour is a product judgment call, it is
// flagged in the agent report under NEEDS DECISION rather than changed here.
describe("adversarial — the store is an unguarded persistence layer", () => {
  it("allows an illegal status jump (pendente → aceite, skipping stages)", async () => {
    await createQuote(quote({ id: "q1", status: "pendente" }));
    const updated = await updateQuote("q1", { status: "aceite" });
    expect(updated?.status).toBe("aceite"); // no transition guard in the store
  });

  it("allows a transition OUT of a terminal state (rejeitado → pendente)", async () => {
    await createQuote(quote({ id: "q1", status: "rejeitado" }));
    const updated = await updateQuote("q1", { status: "pendente" });
    expect(updated?.status).toBe("pendente"); // terminal states are not sticky here
  });

  it("re-applying the same status is idempotent (no throw, value unchanged)", async () => {
    await createQuote(quote({ id: "q1", status: "cotado" }));
    const updated = await updateQuote("q1", { status: "cotado" });
    expect(updated?.status).toBe("cotado");
  });

  it("accepts any status string the mapper is handed (mirror column is not enum-checked)", async () => {
    await createQuote(quote({ id: "q1" }));
    const updated = await updateQuote("q1", { status: "banana" as QuoteStatus });
    expect(updated?.status).toBe("banana");
    // The mirror column would carry the bogus value too.
    expect(mapper.toRow(updated as Quote).status).toBe("banana");
  });

  it("persists out-of-range money verbatim (negative, zero, fractional, huge)", async () => {
    for (const [id, price] of [
      ["neg", -5000],
      ["zero", 0],
      ["frac", 1234.567],
      ["huge", 9_999_999_999],
    ] as const) {
      await createQuote(quote({ id, quotedPrice: price }));
      const updated = await updateQuote(id, { quotedPrice: price });
      expect(updated?.quotedPrice).toBe(price); // store does no bounds/integer check
    }
  });

  it("clobbers a field when the caller passes an explicit undefined patch value", async () => {
    // Shallow spread means { quotedPrice: undefined } wipes an existing price.
    // The route never sends this (it omits absent keys), but a direct store
    // caller can — pinned so the hazard is visible.
    await createQuote(quote({ id: "q1", quotedPrice: 200000 }));
    const updated = await updateQuote("q1", { quotedPrice: undefined });
    expect(updated?.quotedPrice).toBeUndefined();
  });

  it("does not normalise whitespace/case in name or email (stored as given)", async () => {
    await createQuote(quote({ id: "q1", name: "  Ana  ", email: "Ana@Example.PT" }));
    const got = await getQuote("q1");
    expect(got?.name).toBe("  Ana  ");
    expect(got?.email).toBe("Ana@Example.PT");
    // Mirror columns carry the un-normalised values, so DB search is case/space sensitive.
    expect(mapper.toRow(got as Quote)).toMatchObject({ name: "  Ana  ", email: "Ana@Example.PT" });
  });
});

/**
 * ── O RESUMO DA LISTA ─────────────────────────────────────────────────────
 *
 * A página de administração serializava a tabela de pedidos INTEIRA para
 * dentro do HTML: com 300 pedidos, medidos ~3,8 MB antes de haver um pixel
 * desenhado — e a lista de convidados sozinha era 47% dos bytes de um
 * casamento já trabalhado.
 *
 * Este bloco prende as DUAS metades da mesma decisão, porque errar qualquer
 * uma delas é silencioso:
 *
 *   1. o que SAI — se um destes campos voltar a viajar na lista, o peso volta
 *      com ele e ninguém dá por isso até alguém voltar a medir;
 *
 *   2. o que FICA — e esta é a metade perigosa. `payments`, `messages`,
 *      `activityLog`, `eventSuppliers` e `adminNotes` são lidos sobre a lista
 *      TODA (dinheiro na Visão Geral, tempo de resposta e margem nas
 *      Estatísticas, o histórico a que o painel de Propostas acrescenta uma
 *      entrada, as notas internas que gravar escreve de volta). Tirar um
 *      deles "porque também é grande" não parte nada — muda números no ecrã e
 *      apaga texto que ninguém pediu para apagar.
 */
describe("resumirQuote — o pedido como a lista o precisa", () => {
  const trabalhado = () =>
    quote({
      id: "q-trabalhado",
      guestList: [{ id: "g1", name: "Família Rodrigues", party: 4, rsvp: "confirmado" }],
      checklist: [{ id: "c1", label: "Confirmar montagem", done: false }],
      productionPlan: [{ id: "p1", label: "Atelier — arco", done: true }],
      timeline: [{ id: "t1", time: "16:30", title: "Cerimónia" }],
      decorPoints: ["cerimonia", "copo-agua"],
      payments: [{ id: "pg1", kind: "sinal", amount: 2000, date: "2026-03-01", paid: true }],
      messages: [{ at: "2026-01-02T10:00:00.000Z", body: "Bom dia" }],
      activityLog: [
        { id: "a1", at: "2026-01-02T10:00:00.000Z", kind: "created", summary: "Criado" },
      ],
      eventSuppliers: [
        { id: "s1", name: "Catering", category: "Catering", estimatedCost: 5000, status: "pago" },
      ],
      adminNotes: "Cuidado com o prazo da AMARA",
      tags: ["prioritário"],
    });

  it("não leva as colecções que só o pedido ABERTO mostra", () => {
    const resumo = resumirQuote(trabalhado()) as Partial<Quote>;
    expect(resumo.guestList).toBeUndefined();
    expect(resumo.checklist).toBeUndefined();
    expect(resumo.productionPlan).toBeUndefined();
    expect(resumo.timeline).toBeUndefined();
    expect(resumo.decorPoints).toBeUndefined();
    // Não é "vazio", é AUSENTE: uma lista vazia gravada por cima da verdadeira
    // é precisamente a avaria que o `openQuote` espera pelo pedido inteiro
    // para não poder acontecer.
    expect("guestList" in resumo).toBe(false);
  });

  it("leva tudo o que as vistas de conjunto lêem sobre a lista inteira", () => {
    const resumo = resumirQuote(trabalhado());
    expect(resumo.payments).toHaveLength(1);
    expect(resumo.messages).toHaveLength(1);
    expect(resumo.activityLog).toHaveLength(1);
    expect(resumo.eventSuppliers).toHaveLength(1);
    expect(resumo.adminNotes).toBe("Cuidado com o prazo da AMARA");
  });

  it("leva o que a tabela, os filtros e a procura desenham", () => {
    const resumo = resumirQuote(trabalhado());
    expect(resumo).toMatchObject({
      id: "q-trabalhado",
      name: "Ana",
      email: "ana@example.pt",
      phone: "910000000",
      company: "",
      status: "pendente",
      category: "particulares",
      eventType: "casamentos",
      date: "2026-09-01",
      location: "Lisboa",
      guests: 100,
      submittedAt: "2026-01-01T10:00:00.000Z",
      tags: ["prioritário"],
    });
    expect(resumo.priceBreakdown.total).toBe(1845);
  });

  it("não toca no pedido que recebeu — a loja continua a ter tudo", async () => {
    const original = trabalhado();
    resumirQuote(original);
    expect(original.guestList).toHaveLength(1);
    await createQuote(original);
    expect((await getQuote("q-trabalhado"))?.guestList).toHaveLength(1);
  });

  it("listQuoteSummaries resume a lista toda; listQuotes continua inteira", async () => {
    await createQuote(trabalhado());
    const [resumo] = await listQuoteSummaries();
    expect((resumo as Partial<Quote>).guestList).toBeUndefined();
    const [inteiro] = await listQuotes();
    expect(inteiro.guestList).toHaveLength(1);
  });

  it("é MESMO mais leve — é a única razão de existir", async () => {
    await createQuote(trabalhado());
    const inteiro = JSON.stringify(await listQuotes()).length;
    const resumo = JSON.stringify(await listQuoteSummaries()).length;
    expect(resumo).toBeLessThan(inteiro);
  });
});
