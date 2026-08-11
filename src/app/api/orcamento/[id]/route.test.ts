import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  get: vi.fn(async (id: string) =>
    id === "LIQ-1"
      ? {
          id: "LIQ-1",
          submittedAt: "2026-06-01T10:00:00.000Z",
          name: "Ana Silva",
          email: "ana@example.com",
          phone: "910000000",
          company: "ACME",
          nif: "500000000",
          notes: "segredo",
          status: "pendente",
          guests: 50,
          date: "2026-09-01",
          addons: [
            {
              id: "dj",
              name: "DJ",
              tier: "completo",
              price: 900,
              quantity: 1,
              pricingType: "fixed",
            },
          ],
          // Internal CRM data — must never appear in the public response.
          adminNotes: "nota interna",
          quotedPrice: 12500,
          activityLog: [{ id: "a1", at: "2026-06-02", kind: "manual_note", summary: "interno" }],
          messages: [{ at: "2026-06-02", body: "privado" }],
          payments: [{ id: "p1", kind: "sinal", amount: 3000, date: "2026-06-05", paid: true }],
          guestList: [{ id: "g1", name: "Convidado Secreto", party: 2, rsvp: "confirmado" }],
          lostReason: "—",
          assignedTo: "Catarina",
          contractRef: "2026-042",
          tags: ["VIP"],
          // O que cada teste quiser que esteja GRAVADO. A transição automática
          // de estado decide comparando o que vem no corpo com isto, por isso
          // os testes dela precisam de mexer no pedido guardado.
          ...store.override,
        }
      : null,
  ),
  override: {} as Record<string, unknown>,
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
  remove: vi.fn(async (_id: string) => {}),
}));
const rl = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; retryAfter?: number } }));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: store.get,
  updateQuote: store.update,
  deleteQuote: store.remove,
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl.result),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

import { GET, PATCH, DELETE } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(method: "GET" | "PATCH" | "DELETE", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/LIQ-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  rl.result = { ok: true };
  store.override = {};
  vi.clearAllMocks();
});

describe("GET /api/orcamento/[id] — PII protection", () => {
  it("redacts personal data for the public (anti-enumeration)", async () => {
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    // The public view is an explicit allowlist of event facts — exactly these
    // keys, so a new Quote field can never leak by accident. (JSON drops the
    // allowlisted-but-undefined ones, e.g. packageTier/eventName here.)
    expect(Object.keys(json).sort()).toEqual(
      [
        "id",
        "submittedAt",
        "status",
        "guests",
        "date",
        "addons",
        "decorPoints",
        // Tipo de espaço e tipo de cerimónia: respostas que a própria pessoa
        // deu no formulário, e que a página de confirmação volta a mostrar. Se
        // esta linha aparecer num diff sem uma razão dessas, é uma fuga.
        "spaceType",
        "ceremonyType",
      ].sort(),
    );
    expect(json.status).toBe("pendente");
    expect(json.guests).toBe(50);
    // Addons are trimmed to id/name/tier — no pricing internals.
    expect(json.addons).toEqual([{ id: "dj", name: "DJ", tier: "completo" }]);
    // Os pontos de decoração são dados que a própria pessoa escreveu, e a
    // página de confirmação precisa deles para os mostrar depois de um
    // recarregamento. Um pedido antigo, sem escolhas, dá uma lista vazia.
    expect(json.decorPoints).toEqual([]);
  });

  it("returns the full record to an authenticated admin", async () => {
    authed.ok = true;
    const json = await (await GET(req("GET"), ctx("LIQ-1"))).json();
    expect(json.email).toBe("ana@example.com");
  });

  /**
   * ── AS DUAS RESPOSTAS DE 200 TÊM DE SER DISTINGUÍVEIS ───────────────────
   *
   * Com sessão sai o pedido inteiro; sem sessão sai a lista pública acima — e
   * ambas são 200 com `id`. O back office vai buscar aqui o pedido completo
   * quando ela abre um da lista, e com a sessão expirada (o separador fica
   * aberto horas) aceitava a versão pública como se fosse o pedido: painel sem
   * nome, sem contacto, sem pagamentos e sem convidados, e o pedido da lista
   * substituído por essa versão.
   *
   * A marca vive no cabeçalho porque adivinhar pela presença de um campo é uma
   * regra que se parte sozinha no dia em que a lista pública crescer um campo.
   */
  it("marca a resposta com sessão, e SÓ essa, como pedido completo", async () => {
    authed.ok = true;
    expect((await GET(req("GET"), ctx("LIQ-1"))).headers.get("x-pedido")).toBe("completo");

    authed.ok = false;
    expect((await GET(req("GET"), ctx("LIQ-1"))).headers.get("x-pedido")).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    expect((await GET(req("GET"), ctx("nope"))).status).toBe(404);
  });

  it("rate-limits unauthenticated lookups (anti-enumeration)", async () => {
    rl.result = { ok: false, retryAfter: 42 };
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(429);
    expect(store.get).not.toHaveBeenCalled();
  });

  it("never rate-limits an authenticated admin", async () => {
    authed.ok = true;
    rl.result = { ok: false, retryAfter: 42 };
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/orcamento/[id]", () => {
  it("requires authentication", async () => {
    const res = await PATCH(req("PATCH", { status: "cotado" }), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("only persists allow-listed fields (blocks mass-assignment)", async () => {
    authed.ok = true;
    await PATCH(
      req("PATCH", { status: "cotado", quotedPrice: 5000, email: "hacker@x.com", id: "evil" }),
      ctx("LIQ-1"),
    );
    expect(store.update).toHaveBeenCalledWith("LIQ-1", { status: "cotado", quotedPrice: 5000 });
  });

  it("drops non-allowlisted privileged fields (deep mass-assignment guard)", async () => {
    authed.ok = true;
    await PATCH(
      req("PATCH", {
        status: "cotado",
        // None of these may be client-writable: identity, submission time, the
        // computed price breakdown, personal contact data, the reference id.
        submittedAt: "1999-01-01T00:00:00.000Z",
        priceBreakdown: { total: 0 },
        name: "Attacker",
        phone: "000",
        id: "evil",
        lastUpdated: "spoofed",
      }),
      ctx("LIQ-1"),
    );
    expect(store.update).toHaveBeenCalledWith("LIQ-1", { status: "cotado" });
  });

  it("returns 400 (not an uncaught 500) for a malformed JSON body", async () => {
    authed.ok = true;
    const bad = new Request("https://liquen.test/api/orcamento/LIQ-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    }) as unknown as NextRequest;
    const res = await PATCH(bad, ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-object JSON body (null) instead of crashing on `in`", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", null), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid status value with 400", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", { status: "not_a_status" }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/orcamento/[id]", () => {
  it("requires authentication", async () => {
    const res = await DELETE(req("DELETE"), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("hard-deletes the quote for an authenticated admin", async () => {
    authed.ok = true;
    const res = await DELETE(req("DELETE"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(store.remove).toHaveBeenCalledWith("LIQ-1");
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * REGISTAR UM PAGAMENTO OU UM CONTRATO É DIZER QUE O TRABALHO É NOSSO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Este PATCH é a porta por onde o painel de Pagamentos grava (manda a lista
 * inteira em `{ payments }`) e por onde a referência do contrato é guardada.
 * Nenhuma das duas coisas mexia no estado: ela dava um sinal por recebido e o
 * pedido continuava a dizer «Proposta enviada».
 *
 * A regra da transição está guardada nos testes de
 * `@/lib/orcamento/estado-do-pedido`. O que estes prendem é O QUE ESTA ROTA
 * CONTA COMO TENDO ACONTECIDO — que é onde está a subtileza toda.
 */
describe("PATCH /api/orcamento/[id] — o estado segue o que se registou", () => {
  /** O último patch que chegou ao armazenamento. */
  const gravado = () => store.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;

  it("um pagamento que passa a recebido dá o pedido por ganho", async () => {
    authed.ok = true;
    store.override = { status: "cotado", payments: [] };
    await PATCH(
      req("PATCH", {
        payments: [{ id: "p9", kind: "sinal", amount: 3000, date: "2026-07-01", paid: true }],
      }),
      ctx("LIQ-1"),
    );
    expect(gravado()).toMatchObject({ status: "aceite" });
  });

  /**
   * A maioria das linhas nasce assim: o painel pré-preenche o sinal quando se
   * abre, e a linha fica lá por receber. Um PLANO não é um negócio ganho — se
   * contasse, bastava abrir o painel para o quadro mentir.
   */
  it("uma linha de pagamento ainda POR receber não muda nada", async () => {
    authed.ok = true;
    store.override = { status: "cotado", payments: [] };
    await PATCH(
      req("PATCH", {
        payments: [{ id: "p9", kind: "sinal", amount: 3000, date: "2026-07-01", paid: false }],
      }),
      ctx("LIQ-1"),
    );
    expect(gravado()).not.toHaveProperty("status");
  });

  /**
   * O painel manda a lista INTEIRA a cada gravação. Sem comparar com o que
   * está guardado, apagar uma linha ou corrigir um valor voltava a contar como
   * "acabou de entrar dinheiro" — e reescrevia o estado (e o histórico) de cada
   * vez que ela mexesse em qualquer coisa.
   */
  it("regravar a mesma lista com o pagamento que já estava pago não conta outra vez", async () => {
    authed.ok = true;
    store.override = {
      status: "cotado",
      payments: [{ id: "p1", kind: "sinal", amount: 3000, date: "2026-06-05", paid: true }],
    };
    await PATCH(
      req("PATCH", {
        payments: [
          { id: "p1", kind: "sinal", amount: 3000, date: "2026-06-05", paid: true },
          { id: "p2", kind: "saldo", amount: 7000, date: "2026-09-01", paid: false },
        ],
      }),
      ctx("LIQ-1"),
    );
    expect(gravado()).not.toHaveProperty("status");
  });

  it("escrever a referência do contrato dá o pedido por ganho", async () => {
    authed.ok = true;
    store.override = { status: "em_revisao", contractRef: "" };
    await PATCH(req("PATCH", { contractRef: "2026-042" }), ctx("LIQ-1"));
    expect(gravado()).toMatchObject({ status: "aceite" });
  });

  it("apagar a referência do contrato não desfaz nada", async () => {
    authed.ok = true;
    store.override = { status: "aceite", contractRef: "2026-042" };
    await PATCH(req("PATCH", { contractRef: null }), ctx("LIQ-1"));
    expect(gravado()).not.toHaveProperty("status");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * QUEM ESCOLHE O ESTADO À MÃO GANHA SEMPRE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Um arrasto no quadro é uma decisão de uma pessoa. Sem esta regra, marcar um
   * pedido como «Perdido» no mesmo gesto em que se corrige um pagamento fazia a
   * automação escrever «Ganho» por cima — e é também o que garante que
   * `rejeitado` continua a ser exclusivamente humano.
   */
  it("um estado escolhido no corpo do pedido não é discutido pela automação", async () => {
    authed.ok = true;
    store.override = { status: "cotado", payments: [] };
    await PATCH(
      req("PATCH", {
        status: "rejeitado",
        payments: [{ id: "p9", kind: "sinal", amount: 3000, date: "2026-07-01", paid: true }],
      }),
      ctx("LIQ-1"),
    );
    expect(gravado()).toMatchObject({ status: "rejeitado" });
  });

  it("não tira de «Perdido» um pedido que alguém deu por perdido", async () => {
    authed.ok = true;
    store.override = { status: "rejeitado", payments: [] };
    await PATCH(
      req("PATCH", {
        payments: [{ id: "p9", kind: "sinal", amount: 3000, date: "2026-07-01", paid: true }],
      }),
      ctx("LIQ-1"),
    );
    expect(gravado()).not.toHaveProperty("status");
  });

  it("deixa no histórico a linha que explica a mudança, sem apagar o que lá estava", async () => {
    authed.ok = true;
    store.override = { status: "cotado", payments: [] };
    await PATCH(
      req("PATCH", {
        payments: [{ id: "p9", kind: "sinal", amount: 3000, date: "2026-07-01", paid: true }],
      }),
      ctx("LIQ-1"),
    );
    const log = gravado().activityLog as { id: string; actor?: string; summary: string }[];
    // A entrada que já estava gravada sobrevive; a nova vem a seguir.
    expect(log).toHaveLength(2);
    expect(log[0].id).toBe("a1");
    expect(log[1].actor).toBe("Sistema");
    expect(log[1].summary).toContain("Ganho");
  });

  /**
   * O caminho de acrescentar ao histórico (`activityLogAppend`) e a transição
   * automática mexem no MESMO campo. Escritos por ordem errada, um apagava o
   * outro — e o que se perdia era precisamente a explicação da mudança.
   */
  it("convive com um acrescento ao histórico feito no mesmo pedido", async () => {
    authed.ok = true;
    store.override = { status: "cotado", payments: [] };
    await PATCH(
      req("PATCH", {
        payments: [{ id: "p9", kind: "sinal", amount: 3000, date: "2026-07-01", paid: true }],
        activityLogAppend: [
          { id: "nova", at: "2026-07-01T10:00:00.000Z", kind: "note_added", summary: "à mão" },
        ],
      }),
      ctx("LIQ-1"),
    );
    const log = gravado().activityLog as { id: string; summary: string }[];
    expect(log.map((e) => e.id)).toEqual(["a1", "nova", expect.any(String)]);
  });

  /** Guardar o pagamento tem de resultar mesmo que a conta do estado rebente. */
  it("uma nota ou uma etiqueta continuam a gravar sem ler o pedido sequer", async () => {
    authed.ok = true;
    await PATCH(req("PATCH", { adminNotes: "combinado por telefone" }), ctx("LIQ-1"));
    expect(store.get).not.toHaveBeenCalled();
    expect(gravado()).toEqual({ adminNotes: "combinado por telefone" });
  });
});
