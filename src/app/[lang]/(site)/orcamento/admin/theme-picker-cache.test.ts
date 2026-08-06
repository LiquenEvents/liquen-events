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

const fetchMock = vi.fn(async () => new Response("", { status: 200 }));

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
