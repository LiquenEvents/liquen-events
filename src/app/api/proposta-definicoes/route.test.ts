import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SEDE ATRAVESSA O SERVIDOR OU NÃO EXISTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã das Definições podia ter um campo para o local da sede e o servidor
 * deitá-lo fora sem dizer nada — um `z.object` sem a chave STRIPA-A, e o
 * resultado seria um «Guardado. As propostas seguintes já usam estes valores.»
 * a verde sobre uma gravação que não guardou a base.
 *
 * Estes testes prendem as duas metades: o que é aceite e o que é recusado, e
 * que aquilo que passou chega mesmo ao armazenamento.
 */

const authed = vi.hoisted(() => ({ ok: true }));
const store = vi.hoisted(() => ({
  gravado: [] as { id: string; valor: Record<string, unknown> }[],
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/proposta-definicoes-store", async () => {
  // O `parametrosDe` e o `isDefinicaoId` verdadeiros: são eles que dizem o que
  // sai da rota, e substituí-los era testar o duplo em vez do código.
  const real = await vi.importActual<typeof import("@/lib/proposta-definicoes-store")>(
    "@/lib/proposta-definicoes-store",
  );
  return {
    ...real,
    listarDefinicoes: vi.fn(async () =>
      store.gravado.map((g) => ({
        id: g.id as "deslocacao" | "margem",
        valor: g.valor,
        updatedAt: "2026-08-01T10:00:00.000Z",
      })),
    ),
    gravarDefinicao: vi.fn(async (id: string, valor: Record<string, unknown>) => {
      store.gravado = [...store.gravado.filter((g) => g.id !== id), { id, valor }];
      return { id, valor, updatedAt: "2026-08-01T10:00:00.000Z" };
    }),
  };
});

import { GET, PUT } from "./route";

function req(method: "GET" | "PUT", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/proposta-definicoes", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** Os seis números da deslocação mais a base, como o ecrã os envia. */
const deslocacao = (over: Record<string, unknown> = {}) => ({
  base: "Évora",
  consumoLPor100Km: 9,
  precoLitro: 1.65,
  portagensPorKm: 0.09,
  desgastePorKm: 0.1,
  franquiaKm: 40,
  idaEVolta: true,
  ...over,
});

beforeEach(() => {
  authed.ok = true;
  store.gravado = [];
  vi.clearAllMocks();
});

describe("a base da casa, no servidor", () => {
  it("uma instalação sem nada gravado responde com Évora", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect((await res.json()).deslocacao.base).toBe("Évora");
  });

  it("guarda a base que ela escreveu, e devolve-a", async () => {
    const res = await PUT(req("PUT", { id: "deslocacao", valor: deslocacao({ base: "Setúbal" }) }));
    expect(res.status).toBe(200);
    expect((await res.json()).deslocacao.base).toBe("Setúbal");
    // E chegou mesmo ao armazenamento — não ficou só na resposta.
    expect(store.gravado[0].valor.base).toBe("Setúbal");
  });

  it("apara os espaços, para «Évora » e «Évora» não serem duas sedes", async () => {
    await PUT(req("PUT", { id: "deslocacao", valor: deslocacao({ base: "  Évora  " }) }));
    expect(store.gravado[0].valor.base).toBe("Évora");
  });

  it("recusa uma base em branco, em vez de a guardar", async () => {
    // Uma sede em branco não é uma escolha: é um campo por preencher, e com
    // ela nenhuma proposta voltava a ter sugestão de quilómetros.
    const res = await PUT(req("PUT", { id: "deslocacao", valor: deslocacao({ base: "   " }) }));
    expect(res.status).toBe(400);
    expect(store.gravado).toHaveLength(0);
  });

  it("recusa uma base que não é texto", async () => {
    const res = await PUT(req("PUT", { id: "deslocacao", valor: deslocacao({ base: 42 }) }));
    expect(res.status).toBe(400);
  });

  it("um pedido de um ecrã antigo, sem base, continua a ser aceite", async () => {
    // Não se parte uma gravação por causa de um separador aberto antes do
    // deploy. Sem base escrita, fica a de partida.
    const { base: _fora, ...semBase } = deslocacao();
    void _fora;
    const res = await PUT(req("PUT", { id: "deslocacao", valor: semBase }));
    expect(res.status).toBe(200);
    expect((await res.json()).deslocacao.base).toBe("Évora");
  });

  it("os outros limites continuam a valer", async () => {
    const res = await PUT(req("PUT", { id: "deslocacao", valor: deslocacao({ precoLitro: 40 }) }));
    expect(res.status).toBe(400);
    expect(store.gravado).toHaveLength(0);
  });
});
