import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM REDIRECCIONAMENTO NÃO PODE FAZER UMA FOTO DESAPARECER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os pedidos ao armazenamento iam com `redirect: "error"`. É uma boa defesa
 * contra o SSRF — é o que impede um endereço aparentemente inofensivo de nos
 * levar a um sítio interno — mas era cega: se o armazenamento respondesse
 * «isto agora está noutro sítio» (uma rede de distribuição à frente, uma rota
 * assinada que muda de forma), o `fetch` lançava, a foto contava como em falta,
 * e não ficava nada escrito a dizer porquê. A proposta saía com um buraco e o
 * registo estava mudo.
 *
 * O que estes testes guardam é o equilíbrio: SEGUIR o desvio quando ele é para
 * o mesmo sítio de sempre, e continuar a RECUSAR — agora com registo — quando
 * não é.
 */

vi.mock("./supabase", () => ({
  getSupabase: () => null,
  isDatabaseConfigured: () => false,
}));

const registos = vi.hoisted(() => ({ erros: [] as unknown[][] }));
vi.mock("./logger", () => ({
  log: {
    error: (...a: unknown[]) => registos.erros.push(a),
    warn: () => {},
    info: () => {},
    debug: () => {},
  },
}));

const FOTO = Buffer.from("%%bytes-da-foto%%");
const ANFITRIAO = "projecto.supabase.co";

/** As respostas que o `fetch` vai dar, pela ordem em que forem pedidas. */
const respostas = vi.hoisted(() => ({ fila: [] as Response[], pedidos: [] as string[] }));

function redireccionaPara(destino: string): Response {
  return new Response(null, { status: 302, headers: { location: destino } });
}

beforeEach(() => {
  vi.resetModules();
  registos.erros = [];
  respostas.fila = [];
  respostas.pedidos = [];
  process.env.SUPABASE_URL = `https://${ANFITRIAO}`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      respostas.pedidos.push(String(url));
      return respostas.fila.shift() ?? new Response(FOTO, { status: 200 });
    }),
  );
});

async function buscar(ref: string) {
  const { fetchProposalImageBytes } = await import("./proposal-storage");
  return fetchProposalImageBytes(ref);
}

describe("o armazenamento a responder «mudou de sítio»", () => {
  it("segue o desvio dentro do mesmo anfitrião e traz a foto", async () => {
    respostas.fila = [redireccionaPara(`https://${ANFITRIAO}/object/authenticated/foto.jpg`)];
    const bytes = await buscar(`https://${ANFITRIAO}/object/sign/foto.jpg?token=x`);
    expect(bytes?.toString()).toBe(FOTO.toString());
    expect(respostas.pedidos).toHaveLength(2);
  });

  it("um desvio relativo também é seguido", async () => {
    respostas.fila = [redireccionaPara("/object/authenticated/foto.jpg")];
    const bytes = await buscar(`https://${ANFITRIAO}/object/sign/foto.jpg`);
    expect(bytes?.toString()).toBe(FOTO.toString());
    expect(respostas.pedidos[1]).toBe(`https://${ANFITRIAO}/object/authenticated/foto.jpg`);
  });

  /**
   * A defesa que NÃO se toca: um desvio para outro anfitrião é o caminho do
   * SSRF. Continua recusado — a diferença é que agora fica escrito, com o
   * destino, em vez de desaparecer como «uma foto em falta» qualquer.
   */
  it("um desvio para outro anfitrião é recusado, e fica registado", async () => {
    respostas.fila = [redireccionaPara("https://169.254.169.254/latest/meta-data/")];
    expect(await buscar(`https://${ANFITRIAO}/object/sign/foto.jpg`)).toBeNull();
    expect(registos.erros.some((e) => String(e[0]).includes("SSRF"))).toBe(true);
  });

  it("um desvio para http simples é recusado", async () => {
    respostas.fila = [redireccionaPara(`http://${ANFITRIAO}/foto.jpg`)];
    expect(await buscar(`https://${ANFITRIAO}/object/sign/foto.jpg`)).toBeNull();
  });

  it("uma cadeia infinita de desvios pára", async () => {
    respostas.fila = Array.from({ length: 10 }, () =>
      redireccionaPara(`https://${ANFITRIAO}/outra-vez`),
    );
    expect(await buscar(`https://${ANFITRIAO}/object/sign/foto.jpg`)).toBeNull();
    // Não anda a saltar para sempre: pára ao fim de poucos.
    expect(respostas.pedidos.length).toBeLessThanOrEqual(5);
  });

  it("sem desvio nenhum, tudo como sempre foi", async () => {
    const bytes = await buscar(`https://${ANFITRIAO}/object/sign/foto.jpg`);
    expect(bytes?.toString()).toBe(FOTO.toString());
    expect(respostas.pedidos).toHaveLength(1);
  });
});
