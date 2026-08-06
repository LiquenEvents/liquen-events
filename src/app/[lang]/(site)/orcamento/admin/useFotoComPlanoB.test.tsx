// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { useFotoComPlanoB } from "./ProposalStudio";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A REGRA: UMA FALHA A DESENHAR NUNCA É PERMANENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Foi isto que a Catarina viu: células a dizer "Guardada, mas não foi possível
 * pré-visualizar aqui" com a fotografia inteira a um pedido de distância.
 *
 * Duas causas, e as duas estão fixadas aqui:
 *
 *  1. **não havia plano B** — uma miniatura que não existe (assinar um caminho
 *     no Storage NÃO garante que o ficheiro lá está) dava a célula por perdida;
 *  2. **a falha ficava gravada** — o estado de "falhou" não se limpava, por
 *     isso um URL novo e bom já não era sequer tentado.
 *
 * A segunda é a que se testa mal através da interface, porque obriga a fazer
 * chegar uma assinatura nova a meio. Por isso a regra é testada onde ela vive.
 */

/** Mostra o estado do hook em texto, para o teste o poder ler. */
function Sonda({ url, planoB }: { url?: string; planoB?: string }) {
  const { alvo, desistiu, aoFalhar } = useFotoComPlanoB(url, planoB);
  return (
    <button onClick={aoFalhar}>{desistiu ? "desistiu" : (alvo ?? "sem-alvo")}</button>
  );
}

const estado = () => screen.getByRole("button").textContent;
const falhar = async () => {
  await act(async () => {
    screen.getByRole("button").click();
  });
};

afterEach(cleanup);

describe("useFotoComPlanoB", () => {
  it("começa pela miniatura", () => {
    render(<Sonda url="mini" planoB="original" />);
    expect(estado()).toBe("mini");
  });

  it("cai para o original antes de desistir", async () => {
    render(<Sonda url="mini" planoB="original" />);
    await falhar();
    expect(estado()).toBe("original");
    await falhar();
    expect(estado()).toBe("desistiu");
  });

  it("sem plano B, desiste à primeira — mas só aí", async () => {
    render(<Sonda url="mini" />);
    await falhar();
    expect(estado()).toBe("desistiu");
  });

  /** Um plano B igual ao principal não é plano nenhum: tentá-lo era pedir duas
   *  vezes o mesmo ficheiro que já se sabe que falha. */
  it("não tenta duas vezes o mesmo URL", async () => {
    render(<Sonda url="mesma" planoB="mesma" />);
    await falhar();
    expect(estado()).toBe("desistiu");
  });

  /**
   * O TESTE QUE INTERESSA. Uma assinatura expirada, um instante sem rede, um
   * service worker a servir uma resposta estragada — nada disso pode condenar
   * a célula. Quando chega um URL novo, tenta-se outra vez.
   */
  it("um URL NOVO é sempre uma oportunidade nova", async () => {
    const { rerender } = render(<Sonda url="mini" planoB="original" />);
    await falhar();
    await falhar();
    expect(estado()).toBe("desistiu");

    rerender(<Sonda url="assinatura-fresca" planoB="original-fresco" />);
    expect(estado(), "a falha ficou gravada e o URL novo nem foi tentado").toBe(
      "assinatura-fresca",
    );
  });
});
