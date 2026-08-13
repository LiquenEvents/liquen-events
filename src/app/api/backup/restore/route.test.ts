import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { gzipSync } from "node:zlib";

/**
 * A ROTA da reposição — a sequência de trancas, não a mecânica de escrever.
 *
 * A mecânica (validar, planear, aplicar, o contador que nunca recua, o percurso
 * exportar→apagar→repor) está testada a sério em `src/lib/backup-restore.test.ts`
 * contra uma base de dados falsa. Aqui o assunto é outro e é o que mata: em que
 * ORDEM a rota se recusa a escrever. Cada teste abaixo é uma tranca —
 *
 *   sem sessão · ficheiro inválido · sem a frase · frase errada · ficheiro
 *   trocado entre o ensaio e a confirmação · estado actual ilegível · cópia de
 *   recuo incompleta
 *
 * — e todos verificam a mesma coisa no fim: `applyRestore` NÃO foi chamado.
 */

const authed = vi.hoisted(() => ({ ok: true }));

const lib = vi.hoisted(() => ({
  validate: vi.fn(),
  plan: vi.fn(),
  apply: vi.fn(),
}));

const backup = vi.hoisted(() => ({
  build: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/backup-restore", () => ({
  validateBackupFile: lib.validate,
  planRestore: lib.plan,
  applyRestore: lib.apply,
}));
// A rota faz a cópia do estado actual com a MESMA função da exportação.
vi.mock("../route", () => ({ buildBackupPayload: backup.build }));

import { POST } from "./route";
import { RESTORE_CONFIRM_PHRASE } from "@/lib/backup-restore-types";

/** Um ficheiro qualquer — a validação está mockada, o conteúdo é irrelevante. */
const FICHEIRO = { schemaVersion: 2, quotes: [{ id: "q1" }] };

/** O `fileHash` que a rota calcula para `FICHEIRO`. Obtém-se do próprio ensaio. */
async function dryRun(backupFile: unknown = FICHEIRO) {
  const res = await POST(req({ backup: backupFile }));
  return { res, json: await res.json() };
}

function req(body: unknown): NextRequest {
  return new NextRequest("https://liquen.test/api/backup/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** O mesmo pedido, mas com o corpo comprimido — como o navegador o envia. */
function reqGzip(body: unknown): NextRequest {
  return new NextRequest("https://liquen.test/api/backup/restore", {
    method: "POST",
    headers: { "content-type": "application/json", "content-encoding": "gzip" },
    body: gzipSync(Buffer.from(JSON.stringify(body))),
  });
}

function emptyPlan(overrides: Record<string, unknown> = {}) {
  return {
    exportedAt: "2026-03-01T00:00:00.000Z",
    schemaVersion: 2,
    ageDays: 10,
    newestCurrent: null,
    datasets: [],
    counters: [],
    warnings: [],
    totals: { incoming: 1, current: 0, created: 1, replaced: 0, removed: 0, newerThanBackup: 0 },
    unreadable: [],
    photosNotice: "As FOTOS não estão na cópia.",
    ...overrides,
  };
}

beforeEach(() => {
  authed.ok = true;
  vi.clearAllMocks();
  lib.validate.mockReturnValue({ ok: true, file: { exportedAt: "2026-03-01T00:00:00.000Z" } });
  lib.plan.mockResolvedValue(emptyPlan());
  lib.apply.mockResolvedValue({ applied: [], failed: [], counters: [], countersFailed: [] });
  backup.build.mockResolvedValue({ incomplete: [], counts: {}, quotes: [] });
});

describe("POST /api/backup/restore — as trancas", () => {
  it("401 sem sessão, e não chega sequer a validar o ficheiro", async () => {
    authed.ok = false;
    const res = await POST(req({ backup: FICHEIRO, confirm: RESTORE_CONFIRM_PHRASE }));
    expect(res.status).toBe(401);
    expect(lib.validate).not.toHaveBeenCalled();
    expect(lib.apply).not.toHaveBeenCalled();
  });

  it("400 sem ficheiro nenhum", async () => {
    const res = await POST(req({ confirm: RESTORE_CONFIRM_PHRASE }));
    expect(res.status).toBe(400);
    expect(lib.apply).not.toHaveBeenCalled();
  });

  it("400 com corpo que não é JSON", async () => {
    const bad = new NextRequest("https://liquen.test/api/backup/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ isto não é json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect(lib.apply).not.toHaveBeenCalled();
  });

  it("400 quando o ficheiro não passa a validação — e devolve os erros PELO NOME", async () => {
    lib.validate.mockReturnValue({
      ok: false,
      errors: ['"Faturas" (invoices) registo 0: status — valor inválido'],
    });
    const res = await POST(req({ backup: FICHEIRO, confirm: RESTORE_CONFIRM_PHRASE }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errors[0]).toContain("Faturas");
    expect(json.error).toMatch(/nada foi alterado/i);
    expect(lib.plan).not.toHaveBeenCalled();
    expect(lib.apply).not.toHaveBeenCalled();
  });

  it("ENSAIO POR OMISSÃO: sem `confirm` devolve o plano e NÃO escreve", async () => {
    const { res, json } = await dryRun();
    expect(res.status).toBe(200);
    expect(json.dryRun).toBe(true);
    expect(json.plan).toBeTruthy();
    expect(typeof json.fileHash).toBe("string");
    expect(lib.plan).toHaveBeenCalledTimes(1);
    expect(lib.apply).not.toHaveBeenCalled();
    // Nem sequer se dá ao trabalho de fazer a cópia do estado actual.
    expect(backup.build).not.toHaveBeenCalled();
  });

  it("400 quando a frase de confirmação está errada — e ainda devolve o plano", async () => {
    const { json: ensaio } = await dryRun();
    const res = await POST(req({ backup: FICHEIRO, confirm: "sim", fileHash: ensaio.fileHash }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain(RESTORE_CONFIRM_PHRASE);
    expect(json.plan).toBeTruthy();
    expect(lib.apply).not.toHaveBeenCalled();
  });

  it("409 quando o ficheiro confirmado NÃO é o que foi pré-visualizado", async () => {
    const { json: ensaio } = await dryRun();
    const outro = { ...FICHEIRO, quotes: [{ id: "OUTRO" }] };
    const res = await POST(
      req({ backup: outro, confirm: RESTORE_CONFIRM_PHRASE, fileHash: ensaio.fileHash }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/não é o mesmo que foi pré-visualizado/i);
    expect(lib.apply).not.toHaveBeenCalled();
  });

  it("409 quando o estado ACTUAL de um conjunto não se consegue ler", async () => {
    lib.plan.mockResolvedValue(
      emptyPlan({ unreadable: [{ key: "invoices", label: "Faturas", error: "db em baixo" }] }),
    );
    const { json: ensaio } = await dryRun();
    const res = await POST(
      req({ backup: FICHEIRO, confirm: RESTORE_CONFIRM_PHRASE, fileHash: ensaio.fileHash }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Faturas");
    expect(lib.apply).not.toHaveBeenCalled();
  });

  it("409 e CANCELA quando a cópia do estado actual sai INCOMPLETA", async () => {
    backup.build.mockResolvedValue({ incomplete: ["invoices"], counts: {} });
    const { json: ensaio } = await dryRun();
    const res = await POST(
      req({ backup: FICHEIRO, confirm: RESTORE_CONFIRM_PHRASE, fileHash: ensaio.fileHash }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/CANCELADA/);
    expect(json.incomplete).toEqual(["invoices"]);
    expect(lib.apply).not.toHaveBeenCalled();
  });

  it("409 e CANCELA quando a cópia do estado actual REBENTA", async () => {
    backup.build.mockRejectedValue(new Error("supabase em baixo"));
    const { json: ensaio } = await dryRun();
    const res = await POST(
      req({ backup: FICHEIRO, confirm: RESTORE_CONFIRM_PHRASE, fileHash: ensaio.fileHash }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/CANCELADA/);
    expect(lib.apply).not.toHaveBeenCalled();
  });
});

describe("POST /api/backup/restore — a reposição", () => {
  it("com tudo em ordem: faz a cópia do estado ANTERIOR, repõe, e devolve a cópia", async () => {
    const snapshot = { incomplete: [], counts: { quotes: 3 }, quotes: [{ id: "antigo" }] };
    backup.build.mockResolvedValue(snapshot);
    lib.apply.mockResolvedValue({
      applied: [{ key: "quotes", label: "Pedidos", deleted: 3, inserted: 1 }],
      failed: [],
      counters: [{ year: 2026, inFile: 7, current: 7, highestIssued: 7, willBe: 7, raised: false }],
      countersFailed: [],
    });

    const { json: ensaio } = await dryRun();
    const res = await POST(
      req({ backup: FICHEIRO, confirm: RESTORE_CONFIRM_PHRASE, fileHash: ensaio.fileHash }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.dryRun).toBe(false);
    expect(json.applied[0]).toMatchObject({ key: "quotes", deleted: 3, inserted: 1 });
    // A rede de segurança: a cópia do estado anterior volta com a resposta.
    expect(json.snapshotBefore).toEqual(snapshot);
    // E foi feita ANTES de escrever.
    expect(backup.build.mock.invocationCallOrder[0]).toBeLessThan(
      lib.apply.mock.invocationCallOrder[0],
    );
  });

  it("aceita a frase em minúsculas mas exige as palavras certas", async () => {
    const { json: ensaio } = await dryRun();
    const res = await POST(
      req({ backup: FICHEIRO, confirm: " repor tudo ", fileHash: ensaio.fileHash }),
    );
    expect(res.status).toBe(200);
    expect(lib.apply).toHaveBeenCalledTimes(1);
  });

  it("207 quando algum conjunto ficou POR REPOR, com o nome de quem falhou", async () => {
    lib.apply.mockResolvedValue({
      applied: [{ key: "quotes", label: "Pedidos", deleted: 0, inserted: 1 }],
      failed: [{ key: "contracts", label: "Contratos aceites", error: "permission denied" }],
      counters: [],
      countersFailed: [
        { key: "invoiceCounters", label: "Contadores de numeração", error: "sem tabela" },
      ],
    });
    const { json: ensaio } = await dryRun();
    const res = await POST(
      req({ backup: FICHEIRO, confirm: RESTORE_CONFIRM_PHRASE, fileHash: ensaio.fileHash }),
    );
    expect(res.status).toBe(207);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.failed.map((f: { label: string }) => f.label)).toEqual([
      "Contratos aceites",
      "Contadores de numeração",
    ]);
  });

  it("500 (e nada de silêncio) quando algo rebenta a meio", async () => {
    lib.plan.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ backup: FICHEIRO }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Erro interno/);
  });
});

describe("POST /api/backup/restore — o corpo comprimido", () => {
  /**
   * A cópia inteira viaja no corpo do pedido, e os alojamentos limitam-no
   * (~4,5 MB na Vercel). Medida com as formas reais dos dados, a cópia são
   * 6,24 MB hoje — ou seja, esta reposição nascia já provavelmente acima do
   * tecto, e um mecanismo de segurança que não corre no dia em que é preciso
   * não é um mecanismo de segurança. Comprimida são 0,35 MB.
   */
  it("aceita o corpo em gzip e planeia na mesma", async () => {
    const res = await POST(reqGzip({ backup: FICHEIRO }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dryRun).toBe(true);
    expect(data.fileHash).toBeTruthy();
  });

  it("o gzip e o não comprimido dão exactamente o mesmo resultado", async () => {
    const ficheiro = FICHEIRO;
    const a = await (await POST(req({ backup: ficheiro }))).json();
    const b = await (await POST(reqGzip({ backup: ficheiro }))).json();
    // A impressão digital é o que amarra a confirmação ao ensaio: se as duas
    // vias divergissem aqui, confirmar depois de um ensaio comprimido daria 409.
    expect(b.fileHash).toBe(a.fileHash);
    expect(b.plan).toEqual(a.plan);
  });

  it("um gzip corrompido é recusado, não rebenta", async () => {
    const mau = new NextRequest("https://liquen.test/api/backup/restore", {
      method: "POST",
      headers: { "content-type": "application/json", "content-encoding": "gzip" },
      body: Buffer.from("isto não é gzip"),
    });
    const res = await POST(mau);
    expect(res.status).toBe(400);
  });
});
