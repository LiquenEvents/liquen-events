import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ROTA QUE AQUECE OS PDF DAS PROPOSTAS JÁ ENVIADAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A auditoria (`src/app/api/auth-guard-audit.test.ts`) já prende o guarda: sem
 * sessão, 401 nos dois verbos, sem tocar em nada. Aqui prende-se o resto — e
 * sobretudo as duas coisas que fazem esta rota valer a pena:
 *
 *   1. **O GET não desenha.** Ver quantas faltam tem de ser uma coisa que se
 *      faz sem medo; um botão que conta e desenha ao mesmo tempo é um botão em
 *      que se hesita.
 *
 *   2. **O POST tem a função INTEIRA para si.** É a diferença entre esta rota
 *      e a noite: lá o aquecimento recebe o tempo que a cópia de segurança já
 *      gastou e faz seis; aqui o relógio começa em zero e faz oito. Se algum
 *      dia alguém trocar estes números pelos da noite, a varredura passa a
 *      demorar duas semanas outra vez, em silêncio.
 */

const H = vi.hoisted(() => ({
  autenticado: true,
  bd: true,
  chamadas: [] as { decorridoMs: number; opcoes: Record<string, unknown> }[],
  contagens: 0,
  aquecerRebenta: false,
  contarRebenta: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => H.autenticado }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => H.bd }));
vi.mock("@/lib/aquecimento-de-pdf", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  aquecerPdfsEmFalta: async (decorridoMs: number, opcoes: Record<string, unknown>) => {
    if (H.aquecerRebenta) throw new Error("rebentou");
    H.chamadas.push({ decorridoMs, opcoes });
    return {
      vistas: 8,
      jaTinham: 1,
      aquecidas: 7,
      incompletas: 0,
      falhadas: 0,
      adiadas: 0,
      semTempo: false,
      restantes: 61,
    };
  },
  contarPorAquecer: async () => {
    if (H.contarRebenta) throw new Error("rebentou");
    H.contagens++;
    return { enviadas: 80, quentes: 12, desistidas: 1, adiadas: 0, porAquecer: 67 };
  },
}));

const { GET, POST } = await import("./route");
const { ORCAMENTO_AVULSO_MS, TECTO_POR_CHAMADA } = await import("@/lib/aquecimento-de-pdf");

const pedido = () =>
  new Request("https://liquen.test/api/admin/aquecimento-pdf", {
    method: "POST",
  }) as unknown as Parameters<typeof POST>[0];

beforeEach(() => {
  H.autenticado = true;
  H.bd = true;
  H.chamadas = [];
  H.contagens = 0;
  H.aquecerRebenta = false;
  H.contarRebenta = false;
});

describe("aquecer os PDF a pedido", () => {
  it("o GET conta e NÃO desenha — contar e aquecer são verbos diferentes", async () => {
    const res = await GET(pedido());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, porAquecer: 67, enviadas: 80 });
    expect(H.contagens).toBe(1);
    expect(H.chamadas, "o GET não pode aquecer nada").toEqual([]);
  });

  it("o POST tem a função inteira para si: relógio a zero e o tecto da chamada", async () => {
    const res = await POST(pedido());
    expect(res.status).toBe(200);
    expect(H.chamadas).toHaveLength(1);
    /**
     * `decorridoMs = 0` é a peça toda. Na noite, o aquecimento recebe o tempo
     * que a cópia de segurança já gastou e trabalha com o que sobra; aqui não
     * vem atrás de trabalho nenhum.
     */
    expect(H.chamadas[0].decorridoMs).toBe(0);
    expect(H.chamadas[0].opcoes).toEqual({
      orcamentoMs: ORCAMENTO_AVULSO_MS,
      tecto: TECTO_POR_CHAMADA,
    });
  });

  it("o POST diz quantas ficaram, que é o que manda a varredura continuar", async () => {
    const res = await POST(pedido());
    await expect(res.json()).resolves.toMatchObject({ ok: true, aquecidas: 7, restantes: 61 });
  });

  it("sem base de dados é 503, e não se chega a tentar", async () => {
    H.bd = false;
    expect((await GET(pedido())).status).toBe(503);
    expect((await POST(pedido())).status).toBe(503);
    expect(H.chamadas).toEqual([]);
    expect(H.contagens).toBe(0);
  });

  it("sem sessão é 401 nos dois, e não se chega a tentar", async () => {
    H.autenticado = false;
    expect((await GET(pedido())).status).toBe(401);
    expect((await POST(pedido())).status).toBe(401);
    expect(H.chamadas).toEqual([]);
    expect(H.contagens).toBe(0);
  });

  it("uma avaria devolve 500 com uma frase, e nunca o erro em cru", async () => {
    // A regra dela: «se falhar, dizer o que aconteceu» — e nunca despejar no
    // ecrã dela o que só serve para os registos.
    H.aquecerRebenta = true;
    H.contarRebenta = true;
    for (const res of [await GET(pedido()), await POST(pedido())]) {
      expect(res.status).toBe(500);
      const corpo = (await res.json()) as { error?: string };
      expect(corpo.error).toBeTruthy();
      expect(corpo.error).not.toContain("rebentou");
    }
  });
});

describe("o tecto da função", () => {
  it("o orçamento avulso deixa margem para a memória ser gravada", async () => {
    /**
     * Um desenho de uma proposta de 80 fotografias chega aos 20 s (medido, em
     * `custo-do-pdf.ts`), e a gravação do que correu bem vem DEPOIS do último
     * desenho. Se o orçamento fosse os 60 s inteiros da função, o último lote
     * morria antes de gravar — e amanhã repetia-se o trabalho de hoje.
     */
    const { maxDuration } = await import("./route");
    expect(maxDuration).toBeLessThanOrEqual(60);
    expect(ORCAMENTO_AVULSO_MS).toBeLessThan(maxDuration * 1000);
    expect(maxDuration * 1000 - ORCAMENTO_AVULSO_MS).toBeGreaterThanOrEqual(10_000);
  });
});
