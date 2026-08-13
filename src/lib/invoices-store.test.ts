import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── nextInvoiceNumber — the file/dev FALLBACK path ──
// getSupabase → null forces the app-state read-increment-write branch (the
// Supabase RPC path needs a real DB and is intentionally NOT tested here).
// app-state is mocked with an in-memory Map so the counter is deterministic and
// never touches the real data/ file.
const state = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
// Controllable Supabase stub: null ⇒ dev/file fallback path; an object with a
// mockable `rpc` ⇒ the configured atomic-counter path (FIX 2).
const sb = vi.hoisted(() => ({
  client: null as null | { rpc: (...args: unknown[]) => Promise<unknown> },
}));

vi.mock("./supabase", () => ({
  getSupabase: () => sb.client,
  isDatabaseConfigured: () => sb.client !== null,
}));
vi.mock("./app-state", () => ({
  getState: vi.fn(async (key: string) => (state.store.has(key) ? state.store.get(key) : null)),
  setState: vi.fn(async (key: string, value: unknown) => {
    state.store.set(key, value);
  }),
}));
vi.mock("./logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { nextInvoiceNumber, isUniqueViolation } from "./invoices-store";

beforeEach(() => {
  state.store.clear();
  sb.client = null; // default: Supabase unconfigured (dev/file fallback)
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("nextInvoiceNumber — app-state fallback (Supabase unconfigured)", () => {
  it("increments and zero-pads to 4 digits, starting at 0001", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2026/0001");
    expect(await nextInvoiceNumber()).toBe("FT 2026/0002");
    expect(await nextInvoiceNumber()).toBe("FT 2026/0003");
  });

  it("continues from a persisted counter and grows past 4 digits", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T00:00:00Z"));
    state.store.set("invoice-seq-2026", 41);
    expect(await nextInvoiceNumber()).toBe("FT 2026/0042");
    state.store.set("invoice-seq-2026", 9999);
    expect(await nextInvoiceNumber()).toBe("FT 2026/10000");
  });

  it("resets per year (independent counter per year key)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:00:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2026/0001");
    expect(await nextInvoiceNumber()).toBe("FT 2026/0002");

    // New year → sequence restarts at 0001.
    vi.setSystemTime(new Date("2027-01-01T00:30:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2027/0001");

    // Back in 2026, its own counter picks up where it left off (separate key).
    vi.setSystemTime(new Date("2026-12-31T23:45:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2026/0003");
  });
});

describe("nextInvoiceNumber — Supabase configured (FIX 2: refuse, don't fall back)", () => {
  it("uses the atomic RPC counter when it succeeds", async () => {
    sb.client = { rpc: vi.fn(async () => ({ data: 7, error: null })) };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2026/0007");
  });

  it("THROWS (refuses to issue) when the RPC returns an error — never the racy app_state counter", async () => {
    // Migração em falta / função inexistente: em produção cair no contador racy
    // podia gerar um número fiscal duplicado. Preferimos recusar e berrar.
    sb.client = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "function does not exist" } })),
    };
    await expect(nextInvoiceNumber()).rejects.toThrow(/Numeração de faturas indisponível/);
    // O contador de app_state NÃO foi tocado (não houve fallback silencioso).
    const { setState } = await import("./app-state");
    expect(setState).not.toHaveBeenCalled();
  });

  it("THROWS when the RPC itself rejects (e.g. network/permission)", async () => {
    sb.client = {
      rpc: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    await expect(nextInvoiceNumber()).rejects.toThrow(/Numeração de faturas indisponível/);
  });

  it("THROWS when the RPC returns a non-positive / non-finite value (never a bad FT)", async () => {
    for (const bad of [0, -3, NaN, "abc"]) {
      sb.client = { rpc: vi.fn(async () => ({ data: bad, error: null })) };
      await expect(nextInvoiceNumber()).rejects.toThrow(/Numeração de faturas indisponível/);
    }
  });

  it("zero-pads the RPC value the same way as the fallback path", async () => {
    sb.client = { rpc: vi.fn(async () => ({ data: 12345, error: null })) };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00Z"));
    // >4 digits grow naturally (no truncation).
    expect(await nextInvoiceNumber()).toBe("FT 2026/12345");
  });
});

describe("nextInvoiceNumber — sequential ledger invariants (fallback path)", () => {
  it("SERIAL issuance is strictly monotonic, gap-free and duplicate-free over a long run", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));
    const seen: number[] = [];
    for (let i = 0; i < 250; i++) {
      const ft = await nextInvoiceNumber();
      const m = /^FT 2026\/(\d{4,})$/.exec(ft);
      expect(m).not.toBeNull();
      seen.push(Number(m![1]));
    }
    // No duplicates.
    expect(new Set(seen).size).toBe(seen.length);
    // Strictly +1 each step, starting at 1 (no gaps, never backwards).
    for (let i = 0; i < seen.length; i++) expect(seen[i]).toBe(i + 1);
  });

  it("a voided/'anulada' number is BURNED, never reused — the counter only advances", async () => {
    // The store's counter has no decrement path: issuing N, then conceptually voiding
    // FT .../000N (a route-level status change that never touches invoice-seq), then
    // issuing again yields N+1 — the voided number is gone forever, not recycled.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T09:00:00Z"));
    const a = await nextInvoiceNumber(); // FT 2026/0001
    const b = await nextInvoiceNumber(); // FT 2026/0002 (imagine this one gets "anulada")
    const c = await nextInvoiceNumber(); // FT 2026/0003 — 0002 is NOT handed out again
    expect([a, b, c]).toEqual(["FT 2026/0001", "FT 2026/0002", "FT 2026/0003"]);
    // The persisted counter reflects the highest number ever ISSUED, not the live count.
    expect(state.store.get("invoice-seq-2026")).toBe(3);
  });

  it("CONCURRENT fallback issuance never goes BACKWARDS (monotonic), though dev uniqueness is best-effort", async () => {
    // Documenta o tradeoff conhecido: o fallback de app_state (SÓ dev, Supabase não
    // configurado) é read-increment-write não atómico. Sob concorrência real pode
    // repetir um número — por isso PRODUÇÃO usa o contador atómico (next_invoice_seq).
    // Aqui garantimos apenas o invariante que o código PROMETE: o contador nunca
    // recua e acaba no máximo emitido. Uniqueness sob concorrência = NEEDS DECISION
    // (adicionar um mutex in-process mudaria comportamento documentado; não o faço).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T09:00:00Z"));
    const results = await Promise.all(Array.from({ length: 20 }, () => nextInvoiceNumber()));
    const nums = results.map((ft) => Number(/\/(\d+)$/.exec(ft)![1]));
    const max = Math.max(...nums);
    // Counter ended at the max issued and never below any handed-out value.
    expect(state.store.get("invoice-seq-2026")).toBe(max);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(1);
  });

  it("Supabase path accepts a numeric STRING from the RPC and zero-pads it", async () => {
    // supabase rpc() can surface a bigint/numeric as a string; Number() must coerce it.
    sb.client = { rpc: vi.fn(async () => ({ data: "42", error: null })) };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2026/0042");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTADOR FISCAL NÃO PODE VOLTAR AO PRINCÍPIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O caminho atómico (a RPC `next_invoice_seq`) só existe com Supabase. Sem
 * Supabase, o contador cai no `app_state` — e em produção o `app_state` sem
 * base de dados é um ficheiro no disco da função, que o deploy seguinte apaga.
 *
 * O percurso, por extenso: emite-se até FT 2026/0031; sai um deploy; o disco é
 * substituído; a factura seguinte é FT 2026/0001 — um número JÁ USADO, noutro
 * cliente e noutro valor. Numa contabilidade portuguesa isso não é um incómodo
 * de software, é numeração fiscal repetida: dois documentos com o mesmo número,
 * e o problema passa a ser com a Autoridade Tributária.
 *
 * Já existe a decisão certa para o caso vizinho (Supabase configurado + RPC a
 * falhar: RECUSA emitir). Este é o mesmo raciocínio para o caso que faltava, e
 * é a única regra desta ronda que PODE impedir alguém de trabalhar — de
 * propósito: emitir com um número errado é pior do que não emitir.
 */
describe("nextInvoiceNumber — em produção sem Supabase, RECUSA emitir", () => {
  it("não emite a partir de um contador que o deploy apaga", async () => {
    vi.stubEnv("NODE_ENV", "production");
    sb.client = null;
    await expect(nextInvoiceNumber()).rejects.toThrow(/Numeração de faturas indisponível/);
    vi.unstubAllEnvs();
  });

  it("a recusa diz o que falta — nomeia as variáveis, não «erro interno»", async () => {
    vi.stubEnv("NODE_ENV", "production");
    sb.client = null;
    await nextInvoiceNumber().then(
      () => expect.unreachable("devia ter recusado"),
      (err: Error) => expect(err.message).toMatch(/SUPABASE_SERVICE_ROLE_KEY/),
    );
    vi.unstubAllEnvs();
  });

  it("e não deixa o contador andar — recusar não pode queimar um número", async () => {
    vi.stubEnv("NODE_ENV", "production");
    sb.client = null;
    await expect(nextInvoiceNumber()).rejects.toThrow();
    const { setState } = await import("./app-state");
    expect(setState).not.toHaveBeenCalled();
    expect(state.store.size).toBe(0);
    vi.unstubAllEnvs();
  });

  /** Na máquina de alguém o contador de ficheiro é o desenho e continua a
   *  servir — fechá-lo seria partir o desenvolvimento por causa de produção. */
  it("fora de produção continua a emitir pelo ficheiro, como sempre", async () => {
    vi.stubEnv("NODE_ENV", "development");
    sb.client = null;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-02T10:00:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2026/0001");
    vi.unstubAllEnvs();
  });
});

describe("isUniqueViolation — the 23505 backstop recogniser", () => {
  it("recognises the Postgres unique-violation SQLSTATE (23505)", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("recognises the textual message forms (case-insensitive)", () => {
    expect(isUniqueViolation({ message: "duplicate key value violates unique constraint" })).toBe(
      true,
    );
    expect(isUniqueViolation({ message: "UNIQUE CONSTRAINT failed" })).toBe(true);
  });

  it("returns false for unrelated errors and non-objects", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false); // a bare string is not an error object
    expect(isUniqueViolation(new Error("connection reset"))).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false); // FK violation, not unique
  });
});
