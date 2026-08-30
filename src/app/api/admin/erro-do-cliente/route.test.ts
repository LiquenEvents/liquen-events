import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM ERRO NO TELEMÓVEL DELA DEIXA DE SE PERDER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os erros do servidor iam para os registos, já redigidos. Do lado do browser
 * não ia nada: o transporte para fora está preso a uma variável sem
 * `NEXT_PUBLIC_`, portanto é `undefined` no browser e o `log.error` do ecrã de
 * erro morre na consola do telemóvel. Se alguma coisa rebentasse com ela numa
 * quinta, a única maneira de eu saber era ela contar-me — e o que ela consegue
 * contar é «rebentou uma coisa ontem», que não se investiga.
 *
 * Esta rota é a viagem curta que faltava. O que se prende aqui é sobretudo o
 * que ela NÃO pode fazer: não pode ser um megafone aberto, não pode encher o
 * registo, e não pode transformar o erro de alguém num erro nosso.
 */

const st = vi.hoisted(() => ({
  authed: true,
  ritmoOk: true,
  registado: [] as Array<{ mensagem: string; contexto: unknown }>,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "1.2.3.4",
  rateLimit: async () => ({ ok: st.ritmoOk }),
}));
vi.mock("@/lib/logger", () => ({
  log: {
    error: (mensagem: string, _e: unknown, contexto: unknown) =>
      st.registado.push({ mensagem, contexto }),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { POST } from "./route";

function req(corpo: unknown): NextRequest {
  return new Request("https://liquen.test/api/admin/erro-do-cliente", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  st.authed = true;
  st.ritmoOk = true;
  st.registado = [];
});

describe("o relato chega ao registo", () => {
  it("escreve o erro pelo `log.error`, que é onde a redacção do RGPD corre", async () => {
    /**
     * É esta a razão de a rota existir em vez de um serviço externo: o
     * `logger` já apaga emails, telefones e tokens antes de qualquer coisa
     * sair. Mandar os erros para fora directamente do browser saltava essa
     * rede.
     */
    const res = await POST(
      req({ mensagem: "não consegui ler `doc`", rasto: "at Estudio (x.js:1)", marca: "a1b2" }),
    );
    expect(res.status).toBe(204);
    expect(st.registado).toHaveLength(1);
    expect(st.registado[0].mensagem).toContain("não consegui ler");
    expect(st.registado[0].contexto).toMatchObject({ marca: "a1b2" });
  });

  it("um relato sem mensagem nenhuma continua a valer", async () => {
    // Metade dos erros de browser não têm mensagem útil. O que interessa é
    // saber que aconteceu, e onde.
    await POST(req({ onde: "/orcamento/admin" }));
    expect(st.registado[0].mensagem).toContain("erro sem mensagem");
  });
});

describe("o que esta porta não pode ser", () => {
  it("sem sessão, não escreve nada", async () => {
    // Uma rota aberta que escreve no registo da casa é um megafone para quem a
    // encontrar.
    st.authed = false;
    expect((await POST(req({ mensagem: "olá" }))).status).toBe(401);
    expect(st.registado).toEqual([]);
  });

  it("acima do ritmo, cala-se em vez de dar erro", async () => {
    /**
     * 204 e não 429: quem chama isto está a meio de um erro e não pode ficar
     * com um segundo por causa do relato do primeiro. Um ecrã em ciclo chama
     * isto centenas de vezes por minuto, e um registo com mil linhas iguais é
     * tão inútil como um registo vazio.
     */
    st.ritmoOk = false;
    const res = await POST(req({ mensagem: "em ciclo" }));
    expect(res.status).toBe(204);
    expect(st.registado).toEqual([]);
  });

  it("um corpo enorme é recusado, e não registado", async () => {
    const enorme = JSON.stringify({ mensagem: "x".repeat(5000) });
    const res = await POST(req(enorme));
    expect(res.status).toBe(413);
    expect(st.registado).toEqual([]);
  });

  it("um relato malformado não vira um erro NOSSO", async () => {
    // Transformar o erro de alguém num 500 nosso seria trocar um problema por
    // dois.
    const res = await POST(req("isto não é json"));
    expect(res.status).toBe(204);
    expect(st.registado).toEqual([]);
  });

  it("os campos são cortados — isto aceita texto de fora", async () => {
    /**
     * Dois guardas diferentes, e este é o SEGUNDO. O corpo cabe nos 4 KB (a
     * primeira versão deste teste mandava 10 KB e batia no tecto de tamanho,
     * portanto nunca chegava a provar o corte dos campos — os dois guardas
     * pareciam um só).
     */
    const corpo = { mensagem: "m".repeat(1000), rasto: "r".repeat(2500) };
    expect(JSON.stringify(corpo).length, "este corpo tem de caber nos 4 KB").toBeLessThan(4096);
    await POST(req(corpo));
    expect(st.registado, "o corpo bateu no tecto de tamanho em vez de ser cortado").toHaveLength(1);
    const { mensagem, contexto } = st.registado[0];
    expect(mensagem.length).toBeLessThanOrEqual(300 + "back office no browser: ".length);
    expect((contexto as { rasto?: string }).rasto?.length).toBe(2000);
  });

  it("campos que não são texto são ignorados em vez de aceites", async () => {
    // Um `marca: {}` calado acabava dentro do registo como `[object Object]`.
    await POST(req({ mensagem: "erro", marca: { a: 1 }, onde: 42 }));
    const contexto = st.registado[0].contexto as Record<string, unknown>;
    expect(contexto.marca).toBeUndefined();
    expect(contexto.onde).toBeUndefined();
  });
});
