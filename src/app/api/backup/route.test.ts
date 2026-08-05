import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({ authed: true }));

/**
 * Um mock por store, indexado pela MESMA chave que o conjunto tem no ficheiro
 * de backup, para que os testes possam percorrer `BACKUP_DATASETS` em vez de
 * repetirem à mão a lista de conjuntos (que é precisamente o hábito que deixou
 * as faturas e os contratos de fora durante meses).
 */
const stores = vi.hoisted(() => ({
  quotes: vi.fn(async () => [] as unknown[]),
  proposals: vi.fn(async () => [] as unknown[]),
  suppliers: vi.fn(async () => [] as unknown[]),
  tasks: vi.fn(async () => [] as unknown[]),
  calendarEvents: vi.fn(async () => [] as unknown[]),
  invoices: vi.fn(async () => [] as unknown[]),
  contracts: vi.fn(async () => [] as unknown[]),
  inventoryItems: vi.fn(async () => [] as unknown[]),
  materialItems: vi.fn(async () => [] as unknown[]),
  materialLists: vi.fn(async () => [] as unknown[]),
  materialListItems: vi.fn(async () => [] as unknown[]),
  materialRules: vi.fn(async () => [] as unknown[]),
  eventMaterial: vi.fn(async () => [] as unknown[]),
  eventMaterialItems: vi.fn(async () => [] as unknown[]),
  emailTemplates: vi.fn(async () => [] as unknown[]),
  themes: vi.fn(async () => [] as unknown[]),
  messageLinks: vi.fn(async () => [] as unknown[]),
  overviewSettings: vi.fn(async () => [] as unknown[]),
}));

/** Estado do cliente Supabase falso que serve os contadores de numeração. */
const sb = vi.hoisted(() => ({ configured: true, rows: [] as unknown[], fails: false }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authState.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/quotes-store", () => ({ listQuotes: stores.quotes }));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: stores.proposals }));
vi.mock("@/lib/suppliers-store", () => ({ listSuppliers: stores.suppliers }));
vi.mock("@/lib/tasks-store", () => ({ listTasks: stores.tasks }));
vi.mock("@/lib/calendar-store", () => ({ listCalendarEvents: stores.calendarEvents }));
vi.mock("@/lib/invoices-store", () => ({ listInvoices: stores.invoices }));
vi.mock("@/lib/contracts-store", () => ({ listContracts: stores.contracts }));
vi.mock("@/lib/inventory-store", () => ({ listItems: stores.inventoryItems }));
vi.mock("@/lib/material-store", () => ({ listMaterial: stores.materialItems }));
vi.mock("@/lib/material-lists-store", () => ({ listLists: stores.materialLists }));
vi.mock("@/lib/material-list-items-store", () => ({
  listAllListItems: stores.materialListItems,
}));
vi.mock("@/lib/material-rules-store", () => ({ listRules: stores.materialRules }));
vi.mock("@/lib/event-material-store", () => ({ listEventMaterial: stores.eventMaterial }));
vi.mock("@/lib/event-material-items-store", () => ({
  listAllEventItems: stores.eventMaterialItems,
}));
vi.mock("@/lib/email-templates-store", () => ({
  listTemplatesWithDefaults: stores.emailTemplates,
}));
vi.mock("@/lib/themes-store", () => ({ listThemes: stores.themes }));
vi.mock("@/lib/message-links-store", () => ({ listLinks: stores.messageLinks }));
// `readOverviewSettings` devolve os campos indexados; a rota faz-lhes
// `Object.values`, que sobre um array devolve o próprio conteúdo — por isso o
// mock pode servir uma lista como todos os outros.
vi.mock("@/lib/overview-settings-store", () => ({
  readOverviewSettings: stores.overviewSettings,
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () =>
    sb.configured
      ? {
          from: () => ({
            select: () => ({
              order: async () =>
                sb.fails
                  ? { data: null, error: new Error("db down") }
                  : { data: sb.rows, error: null },
            }),
          }),
        }
      : null,
}));

import { GET, BACKUP_DATASETS, NOT_BACKED_UP, EXTERNAL_ASSETS } from "./route";

function get(): NextRequest {
  return new Request("https://liquen.test/api/backup") as unknown as NextRequest;
}

/** Chaves servidas por um store mockado (todas menos os contadores de faturas). */
const STORE_KEYS = Object.keys(stores) as (keyof typeof stores)[];

beforeEach(() => {
  authState.authed = true;
  sb.configured = true;
  sb.rows = [];
  sb.fails = false;
  for (const fn of Object.values(stores)) {
    fn.mockReset();
    fn.mockResolvedValue([]);
  }
  vi.clearAllMocks();
});

describe("GET /api/backup", () => {
  it("401 without auth (never reads any store)", async () => {
    authState.authed = false;
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(stores.quotes).not.toHaveBeenCalled();
    expect(stores.invoices).not.toHaveBeenCalled();
  });

  it("empty data → 200 with a well-formed export, never 500", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.exportedAt).toBe("string");
    expect(Number.isNaN(Date.parse(json.exportedAt))).toBe(false);
    expect(typeof json.schemaVersion).toBe("number");
    expect(json.incomplete).toEqual([]);
    for (const d of BACKUP_DATASETS) {
      expect(json[d.key], `conjunto "${d.key}" em falta no ficheiro`).toEqual([]);
      expect(json.counts[d.key], `contagem de "${d.key}" em falta`).toBe(0);
    }
  });

  /**
   * O teste que a versão antiga desta rota não tinha: o ficheiro tem de trazer
   * TODOS os conjuntos declarados, não os cinco que alguém se lembrou de listar.
   * `route.coverage.test.ts` garante o passo seguinte — que a declaração não
   * fica atrás dos stores que existem mesmo.
   */
  it("exporta TODOS os conjuntos declarados, com contagens certas", async () => {
    STORE_KEYS.forEach((key, i) => {
      stores[key].mockResolvedValue(
        Array.from({ length: i + 1 }, (_, n) => ({ id: `${key}-${n}` })),
      );
    });
    sb.rows = [{ year: 2026, n: 7 }];

    const res = await GET(get());
    const json = await res.json();

    STORE_KEYS.forEach((key, i) => {
      expect(json[key], `conjunto "${key}"`).toHaveLength(i + 1);
      expect(json.counts[key], `contagem de "${key}"`).toBe(i + 1);
    });
    expect(json.invoiceCounters).toEqual([{ year: 2026, n: 7 }]);
    expect(json.counts.invoiceCounters).toBe(1);
    // Nenhum conjunto declarado pode faltar às contagens, nem sobrar nelas.
    expect(Object.keys(json.counts).sort()).toEqual(BACKUP_DATASETS.map((d) => d.key).sort());
  });

  it("o livro de faturas e os contratos aceites vão mesmo no ficheiro", async () => {
    stores.invoices.mockResolvedValue([{ id: "i1", number: "FT 2026/0001", status: "paga" }]);
    stores.contracts.mockResolvedValue([
      { id: "c1", status: "aceite", acceptedName: "Ana", termsSnapshot: "…" },
    ]);
    const json = await (await GET(get())).json();
    expect(json.invoices[0].number).toBe("FT 2026/0001");
    expect(json.contracts[0].termsSnapshot).toBe("…");
  });

  it("sets a downloadable JSON Content-Disposition/Content-Type", async () => {
    const res = await GET(get());
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain("liquen-backup-");
    expect(cd).toContain(".json");
  });

  it("a single store rejecting does not 500 — that dataset degrades to [] but is FLAGGED", async () => {
    stores.suppliers.mockRejectedValue(new Error("db down"));
    stores.quotes.mockResolvedValue([{ id: "q1" }]);
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.suppliers).toEqual([]);
    expect(json.counts.suppliers).toBe(0);
    expect(json.counts.quotes).toBe(1);
    // Um vazio por avaria não pode passar por "não havia nada".
    expect(json.incomplete).toEqual(["suppliers"]);
  });

  it("contadores de numeração: erro do Supabase marca a cópia como incompleta", async () => {
    sb.fails = true;
    const json = await (await GET(get())).json();
    expect(json.invoiceCounters).toEqual([]);
    expect(json.incomplete).toEqual(["invoiceCounters"]);
  });

  it("sem Supabase (desenvolvimento) os contadores vêm vazios sem falhar a cópia", async () => {
    sb.configured = false;
    const json = await (await GET(get())).json();
    expect(json.invoiceCounters).toEqual([]);
    expect(json.incomplete).toEqual([]);
  });

  it("all stores rejecting still yields a 200 backup that ADMITS being empty", async () => {
    for (const fn of Object.values(stores)) fn.mockRejectedValue(new Error("total outage"));
    sb.fails = true;
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    for (const d of BACKUP_DATASETS) expect(json.counts[d.key]).toBe(0);
    expect(json.incomplete.sort()).toEqual(BACKUP_DATASETS.map((d) => d.key).sort());
  });

  it("o ficheiro diz por escrito o que NÃO traz (fotos) e COMO se repõe", async () => {
    const json = await (await GET(get())).json();
    expect(typeof json.readme).toBe("string");
    // Durante muito tempo dizia "NÃO existe botão de restauro". Agora existe, e
    // o ficheiro tem de dizer por onde — quem o abre daqui a dois anos, num dia
    // mau, não vai adivinhar o caminho da rota.
    expect(json.readme).toMatch(/repor/i);
    expect(json.readme).toContain("/api/backup/restore");
    for (const key of [...Object.keys(NOT_BACKED_UP), ...Object.keys(EXTERNAL_ASSETS)]) {
      expect(json.notIncluded[key], `exclusão "${key}" sem explicação no ficheiro`).toBeTruthy();
    }
    expect(Object.keys(json.notIncluded)).toContain("storage:proposal-assets");
    expect(Object.keys(json.notIncluded)).toContain("storage:theme-assets");
  });
});
