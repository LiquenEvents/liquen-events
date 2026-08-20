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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MESMO RELATÓRIO EM JSON — PARA O ECRÃ, E SEM DADOS PESSOAIS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel das Estatísticas precisa dos números um a um para poder dizer
 * «faltam 2 dias» em vez de imprimir um parágrafo. O risco de o dar em JSON é
 * o caminho fácil: `NextResponse.json(resultado)` mandava os EVENTOS inteiros
 * para o browser — e os eventos trazem o email, o telefone e o nome do casal
 * EM CLARO (a cifragem acontece só à saída para a Meta, no `construirEvento`).
 *
 * O teste do fim deste bloco é o que impede essa fuga de voltar.
 */
describe("GET /api/meta/fechos?formato=json", () => {
  const reqJson = () =>
    new Request("https://liquen.test/api/meta/fechos?formato=json") as unknown as NextRequest;

  it("recusa quem não entrou, como o outro formato", async () => {
    st.authed = false;
    expect((await GET(reqJson())).status).toBe(401);
  });

  it("dá os números que o ecrã precisa de saber", async () => {
    st.eventos = [
      { valor: 5000, contexto: "casamento-fechado:LIQ-1" },
      { valor: 7400, contexto: "casamento-fechado:LIQ-2" },
    ];
    const dados = await (await GET(reqJson())).json();
    expect(dados.examinados).toBe(3);
    expect(dados.valorTotal).toBe(12400);
    expect(dados.diasAceites).toBe(7);
    expect(dados.aEnviar.map((e: { ref: string }) => e.ref)).toEqual(["LIQ-1", "LIQ-2"]);
  });

  it("diz se o envio está sequer configurado — vale mais sabê-lo antes do clique", async () => {
    const antesId = process.env.META_DATASET_ID;
    const antesToken = process.env.META_CAPI_ACCESS_TOKEN;
    try {
      delete process.env.META_DATASET_ID;
      delete process.env.META_CAPI_ACCESS_TOKEN;
      expect((await (await GET(reqJson())).json()).configurada).toBe(false);
      // E o controlo positivo: com as duas variáveis, diz que sim. Sem ele,
      // um `configurada: false` fixo passava.
      //
      // Valores de mentira e curtos DE PROPÓSITO: aqui só se lê se estão
      // preenchidas. Nada que se pareça com uma chave verdadeira entra num
      // ficheiro deste repositório.
      process.env.META_DATASET_ID = "id-de-teste";
      process.env.META_CAPI_ACCESS_TOKEN = "sem-valor";
      expect((await (await GET(reqJson())).json()).configurada).toBe(true);
    } finally {
      if (antesId === undefined) delete process.env.META_DATASET_ID;
      else process.env.META_DATASET_ID = antesId;
      if (antesToken === undefined) delete process.env.META_CAPI_ACCESS_TOKEN;
      else process.env.META_CAPI_ACCESS_TOKEN = antesToken;
    }
  });

  it("NÃO deixa sair o email, o telefone nem o nome do casal", async () => {
    st.eventos = [
      {
        valor: 5000,
        contexto: "casamento-fechado:LIQ-1",
        // Como o `construirFechos` os devolve: em claro, para serem cifrados
        // só à saída para a Meta.
        pessoa: {
          email: "maria@exemplo.pt",
          telefone: "+351912345678",
          nome: "Maria Silva",
          fbc: "fb.1.123.abc",
        },
      } as unknown as (typeof st.eventos)[number],
    ];
    const cru = await (await GET(reqJson())).text();
    expect(cru).not.toContain("maria@exemplo.pt");
    expect(cru).not.toContain("912345678");
    expect(cru).not.toContain("Maria Silva");
    expect(cru).not.toContain("fb.1.123.abc");
    // E o que interessa continua lá.
    expect(cru).toContain("LIQ-1");
  });

  it("sem `formato=json` continua a devolver o relatório em texto", async () => {
    const res = await GET(req());
    expect(res.headers.get("Content-Type")).toContain("text/plain");
  });
});
