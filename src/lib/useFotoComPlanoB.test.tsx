// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { ESPERA_ANTES_DA_SEGUNDA_VOLTA_MS, useFotoComPlanoB } from "./useFotoComPlanoB";

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
function Sonda({
  url,
  planoB,
  naoInsistir,
}: {
  url?: string;
  planoB?: string | readonly (string | undefined)[];
  naoInsistir?: boolean;
}) {
  const { alvo, desistiu, aoFalhar } = useFotoComPlanoB(url, planoB, naoInsistir);
  return <button onClick={aoFalhar}>{desistiu ? "desistiu" : (alvo ?? "sem-alvo")}</button>;
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

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * UMA PISCADELA NÃO É UMA AVARIA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Sem isto, «desistiu» era o fim: a única saída de uma célula morta era um
   * dedo dela no botão, ou recarregar a página inteira. Numa grelha de nove
   * fotografias, um segundo sem rede dava nove células mortas para sempre —
   * que foi o que apareceu no telemóvel da dona do negócio.
   */
  it("dá uma segunda volta sozinha, e só uma", async () => {
    vi.useFakeTimers();
    try {
      render(<Sonda url="mini" planoB="original" />);
      await falhar();
      await falhar();
      expect(estado()).toBe("desistiu");

      await act(async () => {
        vi.advanceTimersByTime(ESPERA_ANTES_DA_SEGUNDA_VOLTA_MS + 10);
      });
      expect(estado(), "ficou em «desistiu» para sempre").toBe("mini");

      // A segunda volta falha na mesma — e aí acabou mesmo: uma pasta apagada
      // não pode pôr a grelha a pedir para sempre.
      await falhar();
      await falhar();
      expect(estado()).toBe("desistiu");
      await act(async () => {
        vi.advanceTimersByTime(ESPERA_ANTES_DA_SEGUNDA_VOLTA_MS * 5);
      });
      expect(estado(), "deu uma terceira volta — isto não pode ser um ciclo").toBe("desistiu");
    } finally {
      vi.useRealTimers();
    }
  });

  /** O caso do telemóvel: o elevador, o comboio, sair do wi-fi. O browser sabe
   *  quando a ligação voltou, e até aqui ninguém o ouvia. */
  it("quando a rede volta, a célula volta com ela", async () => {
    vi.useFakeTimers();
    try {
      render(<Sonda url="mini" planoB="original" />);
      await falhar();
      await falhar();
      // Gasta a volta automática, para o que se mede a seguir ser mesmo o
      // ouvinte da rede e não a segunda volta a passar por ali.
      await act(async () => {
        vi.advanceTimersByTime(ESPERA_ANTES_DA_SEGUNDA_VOLTA_MS + 10);
      });
      await falhar();
      await falhar();
      expect(estado()).toBe("desistiu");

      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });
      expect(estado(), "a rede voltou e a célula continuou morta").toBe("mini");
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * A recusa do próprio sítio (`img-src`) não muda por se insistir: a
   * fotografia nem chega a ser pedida. Insistir é só barulho — e um botão que
   * promete o que não pode dar é pior do que não haver botão.
   */
  it("com a recusa do sítio não insiste, nem por tempo nem por rede", async () => {
    vi.useFakeTimers();
    try {
      render(<Sonda url="mini" planoB="original" naoInsistir />);
      await falhar();
      await falhar();
      expect(estado()).toBe("desistiu");
      await act(async () => {
        vi.advanceTimersByTime(ESPERA_ANTES_DA_SEGUNDA_VOLTA_MS * 5);
        window.dispatchEvent(new Event("online"));
      });
      expect(estado(), "insistiu numa recusa que dá sempre o mesmo").toBe("desistiu");
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DEGRAU DO MEIO — 200 KB EM VEZ DE 1099
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A cascata tinha dois degraus e nada entre eles: a miniatura de 400 px
 * (~20 KB) e, a falhar essa, o ORIGINAL. MEDIDO no estúdio a 1,6 Mbps, o
 * original pesa **1099 KB** por célula — 26,4 MB numa grelha de 24, e a
 * primeira fotografia aos 34,0 s. Numa caixa que o estúdio desenha a ~92–126 px
 * (medido: ~101 px aos 375, ~126 entre 640 e 1023, ~92 aos 1024), isso é pagar
 * cinquenta e cinco vezes o peso pela mesma imagem no ecrã.
 *
 * A derivada de 1200 px já existia e já era fabricada em lote — só que ninguém
 * a punha no meio da queda. Estes casos são o meio.
 */
describe("a cascata com o degrau do meio", () => {
  it("cai para a derivada de 1200 px ANTES de pedir o original", async () => {
    render(<Sonda url="mini" planoB={["media", "original"]} />);
    expect(estado()).toBe("mini");
    await falhar();
    // O que este caso existe para impedir: aqui estava «original».
    expect(estado()).toBe("media");
    await falhar();
    expect(estado()).toBe("original");
    await falhar();
    expect(estado()).toBe("desistiu");
  });

  /**
   * Os buracos da lista não são degraus. A derivada de 1200 px pode não estar
   * fabricada (o `/assets` só devolve `midUrl` quando o Storage a tem), e nesse
   * caso a cascata é a de sempre — não uma tentativa gasta a pedir `undefined`.
   */
  it("um degrau que não existe não gasta uma tentativa", async () => {
    render(<Sonda url="mini" planoB={[undefined, "original"]} />);
    await falhar();
    expect(estado()).toBe("original");
  });

  /**
   * E o repetido também não. Uma fotografia sem miniatura nenhuma chega aqui
   * com o original nos dois lugares; contá-lo duas vezes era dar-lhe uma
   * tentativa a mais do que às outras, contra o mesmo endereço que acabou de
   * falhar.
   */
  it("o mesmo endereço duas vezes é um degrau só", async () => {
    render(<Sonda url="original" planoB={["original", "original"]} />);
    expect(estado()).toBe("original");
    await falhar();
    expect(estado()).toBe("desistiu");
  });
});
