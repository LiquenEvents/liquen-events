import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * A rota que responde «o armazenamento está ligado?».
 *
 * Duas coisas a prender aqui, e são as duas de segurança e de custo:
 *
 *  1. só com sessão. A resposta nomeia variáveis de ambiente e diz se a base de
 *     dados está em baixo — é um mapa da instalação, e não se dá a quem passa.
 *  2. um estado mau NÃO é um erro da rota. Responder 503 fazia o ecrã que a
 *     consome tratar isto como «não consegui perguntar», que é precisamente a
 *     resposta que se estava a tentar substituir por uma frase útil.
 */
const st = vi.hoisted(() => ({
  authed: false,
  chamadas: [] as (boolean | undefined)[],
  diagnostico: {
    estado: "ok",
    duradouro: true,
    avisar: false,
    titulo: "O armazenamento está ligado.",
    oQueFazer: "Não é preciso fazer nada.",
    fotos: "ok",
    verificadoEm: "2026-08-11T10:00:00.000Z",
  },
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/estado-do-armazenamento", () => ({
  verificarArmazenamento: vi.fn(async (opcoes?: { forcar?: boolean }) => {
    st.chamadas.push(opcoes?.forcar);
    return st.diagnostico;
  }),
}));

import { GET } from "./route";

function req(query = ""): NextRequest {
  return new Request(
    `https://liquen.test/api/admin/armazenamento${query}`,
  ) as unknown as NextRequest;
}

beforeEach(() => {
  st.authed = true;
  st.chamadas = [];
});

describe("GET /api/admin/armazenamento", () => {
  it("não responde a quem não tem sessão — e nem sequer verifica", async () => {
    st.authed = false;
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(st.chamadas).toHaveLength(0);
  });

  it("devolve o diagnóstico a quem tem sessão", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.estado).toBe("ok");
    expect(body.avisar).toBe(false);
    expect(body.oQueFazer.length).toBeGreaterThan(0);
  });

  it("um armazenamento em baixo é uma RESPOSTA, não uma falha da rota", async () => {
    st.diagnostico = {
      ...st.diagnostico,
      estado: "tabela-em-falta",
      avisar: true,
      duradouro: false,
      oQueFazer: "Corra o ficheiro db/schema.sql no editor de SQL do Supabase.",
    };
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.avisar).toBe(true);
    expect(body.oQueFazer).toMatch(/db\/schema\.sql/);
  });

  it("por omissão aproveita a resposta em cache; `?forcar=1` pede uma nova", async () => {
    await GET(req());
    await GET(req("?forcar=1"));
    expect(st.chamadas).toEqual([undefined, true]);
  });

  /** Isto muda de minuto a minuto e nunca pode ser servido de uma cache
   *  partilhada: é o estado de uma instalação, respondido a uma sessão. */
  it("não se guarda em cache pelo caminho", async () => {
    const res = await GET(req());
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
  });
});
