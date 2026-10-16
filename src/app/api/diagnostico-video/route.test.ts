import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * A rota do registo anónimo do vídeo é PÚBLICA: o corpo é escrito por quem
 * quiser. Estes testes prendem o que a protege — o esquema fechado, o tecto de
 * tamanho, o ritmo e o prazo — e onde grava.
 */
const rl = vi.hoisted(() => ({ ok: true }));
const estado = vi.hoisted(() => ({ setState: vi.fn(async () => ({ gravado: true })) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl),
  clientIp: () => "test-ip",
  sweep: () => {},
}));
vi.mock("@/lib/app-state", () => estado);

import { POST } from "./route";

function post(corpo: unknown): NextRequest {
  return new Request("https://liquen.test/api/diagnostico-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  }) as unknown as NextRequest;
}

const CORPO = {
  v: 1,
  sessao: "abcdefgh1234",
  motivo: "paragem",
  aparelho: {
    ios: "18.1",
    nav: "safari",
    movel: true,
    ecra: "390x844@3",
    alto: true,
    ligacao: "4g",
  },
  desde: 25000,
  paragens: [
    {
      inicio: 19800,
      ms: 450,
      estado: {
        take: 0,
        ct: 18.4,
        dur: 18.4,
        rs: 4,
        ns: 1,
        paused: false,
        ended: false,
        fonte: "rede",
        formato: "hevc",
        leve: false,
        aPassar: true,
        aFrente: 0,
      },
      antes: [{ t: 18000, k: "passar", v: 1 }],
    },
  ],
  contadores: { paragem: 1, passar: 1 },
  qualidade: null,
};

beforeEach(() => {
  rl.ok = true;
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("POST /api/diagnostico-video", () => {
  it("grava a página na sua chave (dia e sessão), e não devolve nada", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T20:10:00Z"));
    const res = await POST(post(CORPO));
    expect(res.status).toBe(204);
    expect(estado.setState).toHaveBeenCalledTimes(1);
    const [chave, valor] = estado.setState.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(chave).toBe("diagnostico-video:2026-10-16:abcdefgh1234");
    expect(valor).toMatchObject({ sessao: "abcdefgh1234", recebidoEm: "2026-10-16T20:10:00.000Z" });
    // O IP não é guardado.
    expect(JSON.stringify(valor)).not.toContain("test-ip");
  });

  it("aceita um registo VERDADEIRO, tal como o browser o manda (apanhado no Chromium)", async () => {
    // Sem isto, um campo a mais no browser faria o esquema recusar tudo em
    // silêncio (a rota responde 204 mesmo assim) — e não chegava nada.
    const real = {
      v: 1,
      sessao: "2qbywkee9bcv",
      motivo: "saida",
      aparelho: {
        ios: "18.1",
        nav: "safari",
        movel: true,
        ecra: "390x844@3",
        alto: true,
        ligacao: "4g",
      },
      desde: 11756,
      paragens: [
        {
          inicio: 5455,
          ms: 1050,
          estado: {
            take: 0,
            ct: 4.17,
            dur: 18.4,
            rs: 4,
            ns: 1,
            paused: false,
            ended: false,
            fonte: "source",
            formato: "webm",
            leve: false,
            aPassar: false,
            aFrente: 14.23,
          },
          antes: [{ t: 1308, k: "playing", v: 0 }],
        },
      ],
      contadores: { playing: 1, paragem: 1 },
      qualidade: { perdidos: 1, total: 245 },
    };
    await POST(post(real));
    expect(estado.setState).toHaveBeenCalledTimes(1);
  });

  it("recusa (em silêncio) o que não está no esquema: campos a mais, texto livre", async () => {
    for (const mau of [
      { ...CORPO, ua: "Mozilla/5.0 (iPhone…)" },
      { ...CORPO, sessao: "../../etc" },
      { ...CORPO, aparelho: { ...CORPO.aparelho, nav: "o meu browser" } },
      { ...CORPO, paragens: [{ ...CORPO.paragens[0], antes: [{ t: 1, k: "<script>" }] }] },
      "isto não é JSON",
    ]) {
      const res = await POST(post(mau));
      expect(res.status).toBe(204);
    }
    expect(estado.setState).not.toHaveBeenCalled();
  });

  it("um corpo maior do que 8 KB não se lê", async () => {
    const res = await POST(post({ ...CORPO, lixo: "x".repeat(9000) }));
    expect(res.status).toBe(204);
    expect(estado.setState).not.toHaveBeenCalled();
  });

  it("com o ritmo esgotado não grava", async () => {
    rl.ok = false;
    await POST(post(CORPO));
    expect(estado.setState).not.toHaveBeenCalled();
  });

  it("depois do prazo, desliga-se", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    await POST(post(CORPO));
    expect(estado.setState).not.toHaveBeenCalled();
  });
});
