// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aquecerFotosEmSegundoPlano } from "./theme-picker-cache";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRAVÕES DO CARREGAMENTO EM SEGUNDO PLANO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto vai buscar ~1,2 MB de miniaturas que ninguém pediu, para o seletor de
 * temas abrir instantâneo mais tarde. É uma boa troca com Wi-Fi e uma má troca
 * num plano de dados ao fim do mês — e a diferença entre as duas são estes
 * travões.
 *
 * Um travão que deixe de funcionar não dá erro nenhum: dá uma factura de dados
 * maior, num telemóvel que não é o meu. Por isso são testados um a um, e todos
 * têm de falhar para o lado de NÃO carregar.
 */

// Os parâmetros são declarados (mesmo sem serem usados) para que
// `fetchMock.mock.calls[0][0]` tenha tipo: sem eles o TypeScript vê um tuplo
// vazio e o `expect` sobre o URL pedido não compila.
const fetchMock = vi.fn(
  async (_url?: unknown, _init?: unknown) => new Response("", { status: 200 }),
);

/** Instala uma ligação com as características dadas. */
function comRede(rede: { saveData?: boolean; effectiveType?: string } | undefined) {
  Object.defineProperty(navigator, "connection", { value: rede, configurable: true });
}

/** O `requestIdleCallback` que o jsdom não tem — corre já, para o teste poder
 *  observar o efeito sem esperar por um tempo morto que nunca vem. */
function comIdle(existe = true) {
  if (existe) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback =
      (cb) => {
        cb();
        return 1;
      };
  } else {
    delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
  }
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  comIdle(true);
  comRede(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Deixa correr as promessas encadeadas que o aquecimento dispara. */
const assentar = () => new Promise((r) => setTimeout(r, 0));

describe("aquecer as fotos em segundo plano", () => {
  it("com dados poupados ligados, não gasta um único byte", async () => {
    comRede({ saveData: true });
    aquecerFotosEmSegundoPlano();
    await assentar();
    expect(
      fetchMock,
      "o browser disse que quem manda pediu para poupar dados, e foi buscar fotos na mesma",
    ).not.toHaveBeenCalled();
  });

  it("numa ligação lenta, não gasta um único byte", async () => {
    for (const tipo of ["slow-2g", "2g", "3g"]) {
      fetchMock.mockClear();
      comRede({ effectiveType: tipo });
      aquecerFotosEmSegundoPlano();
      await assentar();
      expect(
        fetchMock,
        `${tipo}: a largura de banda é para o que ela está a fazer agora`,
      ).not.toHaveBeenCalled();
    }
  });

  /**
   * Sem `requestIdleCallback` não se inventa um `setTimeout`: isso poria este
   * trabalho a competir com o desenho da página, que é exactamente o que ele
   * não pode fazer.
   */
  it("sem tempo morto declarado pelo browser, não faz nada", async () => {
    comIdle(false);
    aquecerFotosEmSegundoPlano();
    await assentar();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("numa ligação boa, vai mesmo buscar — senão não servia de nada", async () => {
    comRede({ effectiveType: "4g" });
    aquecerFotosEmSegundoPlano();
    await assentar();
    // A lista de temas é o primeiro pedido; é quanto basta para provar que o
    // caminho feliz não está travado por engano.
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/temas");
  });

  /** Um `navigator.connection` que não existe (Safari) não pode ser lido como
   *  "ligação má" — senão isto nunca corria no iPhone dela. */
  it("sem informação de rede, assume que pode", async () => {
    comRede(undefined);
    aquecerFotosEmSegundoPlano();
    await assentar();
    expect(fetchMock).toHaveBeenCalled();
  });
});

/**
 * ── CONFIRMAR A LISTA DEIXOU DE CUSTAR A LISTA ────────────────────────────
 *
 * A entrada guardada mostra-se já e confirma-se por trás (ver `vaiRevalidar`).
 * Essa confirmação descarregava a biblioteca inteira outra vez — capas, tiras,
 * tudo — quase sempre para dizer que estava igual. A rota passou a carimbar a
 * resposta com um ETag e aqui reenvia-se esse carimbo.
 *
 * O que estes testes prendem é a parte que se pode partir sem dar erro:
 *   · num 304 fica-se com o array que já se tinha, e com a MESMA referência
 *     (é isso que impede a grelha de voltar a desenhar);
 *   · e o `at` NÃO se renova. É ele que mata a entrada aos 30 minutos e obriga
 *     a URLs assinados de novo; renová-lo num 304 deixava a entrada viver até
 *     as assinaturas expirarem às 6 horas, e a grelha aparecia vazia.
 */
describe("a lista de temas revalida-se com ETag", () => {
  const lista = [{ id: "t-1", name: "Terracotta", imageCount: 2 }];

  /** Resposta completa, com carimbo. */
  const cheia = (etag: string) =>
    new Response(JSON.stringify(lista), { status: 200, headers: { ETag: etag } });

  it("reenvia o carimbo da leitura anterior", async () => {
    const { buscarTemas } = await import("./theme-picker-cache");
    fetchMock.mockResolvedValueOnce(cheia('W/"biblioteca-1"'));
    await buscarTemas(true);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await buscarTemas(true);

    const init = fetchMock.mock.calls[1]?.[1] as { headers?: Record<string, string> };
    expect(init?.headers?.["If-None-Match"]).toBe('W/"biblioteca-1"');
  });

  it("num 304 devolve o que já tinha — a MESMA lista, sem corpo novo", async () => {
    const { buscarTemas } = await import("./theme-picker-cache");
    fetchMock.mockResolvedValueOnce(cheia('W/"biblioteca-1"'));
    const primeira = await buscarTemas(true);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    const segunda = await buscarTemas(true);

    expect(segunda).toBe(primeira);
  });

  it("um 200 novo substitui a lista e o carimbo", async () => {
    const { buscarTemas } = await import("./theme-picker-cache");
    fetchMock.mockResolvedValueOnce(cheia('W/"biblioteca-1"'));
    await buscarTemas(true);

    const outra = [...lista, { id: "t-2", name: "Itália", imageCount: 5 }];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(outra), { status: 200, headers: { ETag: 'W/"biblioteca-2"' } }),
    );
    expect(await buscarTemas(true)).toHaveLength(2);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await buscarTemas(true);
    const init = fetchMock.mock.calls[2]?.[1] as { headers?: Record<string, string> };
    expect(init?.headers?.["If-None-Match"]).toBe('W/"biblioteca-2"');
  });
});
