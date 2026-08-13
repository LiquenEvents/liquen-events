import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ACONTECE QUANDO ALGO FALHA DEPOIS DE A META JÁ TER ACEITE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os dois handlers não tinham `try/catch`. No GET isso era um 500 anónimo; no
 * POST era pior: se o `setState` falhasse DEPOIS de os eventos terem sido
 * aceites, o erro subia, a lista de enviados ficava por gravar e as MESMAS
 * conversões voltavam a ser candidatas na corrida seguinte — a Meta recebia-as
 * outra vez e o valor dos negócios fechados aparecia inflado.
 *
 * O `construirFechos`/`relatorio` são puros e estão testados à parte; aqui são
 * substituídos para se poder pôr a rota exactamente no estado que interessa.
 */
const st = vi.hoisted(() => ({
  authed: true,
  storesRebentam: false,
  setStateRebenta: false,
  eventos: [] as { valor: number; contexto: string }[],
  gravado: null as unknown,
  envio: { enviado: true, recebidos: 1 } as Record<string, unknown>,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: async () => st.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/quotes-store", () => ({
  listQuotes: vi.fn(async () => {
    if (st.storesRebentam) throw new Error("base de dados em baixo");
    return [];
  }),
}));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: vi.fn(async () => []) }));
vi.mock("@/lib/contracts-store", () => ({ listContracts: vi.fn(async () => []) }));
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async () => []),
  setState: vi.fn(async (_chave: string, valor: unknown) => {
    if (st.setStateRebenta) throw new Error("app_state em baixo");
    st.gravado = valor;
  }),
}));
vi.mock("@/lib/meta/conversoes-fecho", () => ({
  DIAS_ACEITES: 7,
  construirFechos: vi.fn(() => ({ eventos: st.eventos, excluidos: [], examinados: 3 })),
  relatorio: vi.fn(() => "relatório"),
}));
vi.mock("@/lib/meta/capi", () => ({ enviarEventos: vi.fn(async () => st.envio) }));

import { GET, POST } from "./route";
import { enviarEventos } from "@/lib/meta/capi";

const req = () => new Request("https://liquen.test/api/meta/fechos") as unknown as NextRequest;

beforeEach(() => {
  st.authed = true;
  st.storesRebentam = false;
  st.setStateRebenta = false;
  st.eventos = [{ valor: 5000, contexto: "casamento-fechado:LIQ-1" }];
  st.gravado = null;
  st.envio = { enviado: true, recebidos: 1 };
  vi.clearAllMocks();
});

describe("GET /api/meta/fechos", () => {
  it("recusa quem não entrou", async () => {
    st.authed = false;
    expect((await GET(req())).status).toBe(401);
  });

  it("uma store em baixo dá um 500 tratado, não um erro anónimo", async () => {
    st.storesRebentam = true;
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBeTruthy();
  });
});

describe("POST /api/meta/fechos", () => {
  it("recusa quem não entrou, e não envia nada", async () => {
    st.authed = false;
    expect((await POST(req())).status).toBe(401);
    expect(enviarEventos).not.toHaveBeenCalled();
  });

  it("falhar a reunir é não enviar — a Meta não vê nada", async () => {
    st.storesRebentam = true;
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(enviarEventos).not.toHaveBeenCalled();
  });

  it("envia e grava a referência para não a voltar a enviar", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ enviados: 1, recebidos: 1 });
    expect(st.gravado).toEqual(["LIQ-1"]);
  });

  /**
   * O caso que esta rota não podia deixar passar: a Meta ACEITOU e o registo
   * não ficou gravado. Subir o erro punha as mesmas conversões outra vez na
   * fila da corrida seguinte — duplicadas, e sem ninguém dar por isso.
   */
  it("a lista por gravar vai no corpo, e o envio conta como feito", async () => {
    st.setStateRebenta = true;
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enviados).toBe(1);
    expect(body.registoGuardado).toBe(false);
    expect(body.aviso).toMatch(/duas vezes/);
    expect(body.referencias).toEqual(["LIQ-1"]);
  });

  it("sem fechos para enviar não chama a Meta", async () => {
    st.eventos = [];
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ enviados: 0 });
    expect(enviarEventos).not.toHaveBeenCalled();
  });
});
