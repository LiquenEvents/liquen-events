import { describe, expect, it } from "vitest";
import type { Proposal, Quote } from "./types";
import { valoresDiferentesDoEnviado, ultimaEnviadaPorPedido } from "./valor-enviado";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VALOR DO PEDIDO TEM DE SER O QUE SAIU NO PDF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «caso apareça propostas onde os valores não são iguais ao que
 * enviamos, quero que automaticamente se coloque no valor que foi enviado».
 *
 * O que aqui se guarda são as quatro maneiras de isto correr mal, e as quatro
 * são maneiras de ESTRAGAR DINHEIRO gravado:
 *
 *   · escrever num pedido o valor de um RASCUNHO, que nunca saiu;
 *   · escrever o valor de uma proposta ANTIGA por cima da que o casal tem;
 *   · escrever ZERO por causa de um campo em falta;
 *   · listar pedidos que já concordam, e a lista deixar de se poder ler.
 */

const pedido = (id: string, quotedPrice: number | null, over: Partial<Quote> = {}): Quote =>
  ({ id, quotedPrice, name: `Cliente ${id}`, ...over }) as Quote;

const proposta = (
  id: string,
  quoteId: string,
  subtotal: number,
  sentAt: string | undefined,
): Pick<Proposal, "id" | "quoteId" | "subtotal" | "sentAt" | "clientName"> => ({
  id,
  quoteId,
  subtotal,
  sentAt,
  clientName: `Cliente ${quoteId}`,
});

describe("os valores diferentes do que foi enviado", () => {
  it("aponta o pedido cujo valor não é o do PDF", () => {
    const fora = valoresDiferentesDoEnviado(
      [pedido("q1", 3140)],
      [proposta("p1", "q1", 3000, "2026-05-02T10:00:00Z")],
    );
    expect(fora).toHaveLength(1);
    expect(fora[0]).toMatchObject({ quoteId: "q1", noPedido: 3140, enviado: 3000 });
  });

  it("cala-se quando já concordam", () => {
    expect(
      valoresDiferentesDoEnviado(
        [pedido("q1", 3000)],
        [proposta("p1", "q1", 3000, "2026-05-02T10:00:00Z")],
      ),
    ).toEqual([]);
  });

  it("dá um cêntimo de folga — dois números iguais podem diferir no bit", () => {
    expect(
      valoresDiferentesDoEnviado(
        [pedido("q1", 3000.001)],
        [proposta("p1", "q1", 3000, "2026-05-02T10:00:00Z")],
      ),
    ).toEqual([]);
  });

  it("NÃO usa rascunhos — um rascunho nunca saiu", () => {
    // Pôr o pedido a valer o de um rascunho é inventar um envio que não houve.
    expect(
      valoresDiferentesDoEnviado([pedido("q1", 3140)], [proposta("p1", "q1", 3000, undefined)]),
    ).toEqual([]);
  });

  it("com várias enviadas, vale a ÚLTIMA — é a que o casal tem à frente", () => {
    const fora = valoresDiferentesDoEnviado(
      [pedido("q1", 3140)],
      [
        proposta("p1", "q1", 3000, "2026-03-01T10:00:00Z"),
        proposta("p2", "q1", 4200, "2026-05-02T10:00:00Z"),
      ],
    );
    expect(fora[0].enviado, "usou a proposta antiga em vez da última").toBe(4200);
    expect(fora[0].propostaId).toBe("p2");
  });

  it("desempata sem dançar quando as duas saíram no mesmo instante", () => {
    const mesmo = "2026-05-02T10:00:00Z";
    const props = [proposta("pA", "q1", 1000, mesmo), proposta("pZ", "q1", 2000, mesmo)];
    const uma = ultimaEnviadaPorPedido(props);
    const outra = ultimaEnviadaPorPedido([...props].reverse());
    expect(uma.get("q1")?.id).toBe(outra.get("q1")?.id);
  });

  it("NÃO escreve zero por causa de um campo em falta", () => {
    // Um `subtotal` ausente ou a zero não é «o cliente pagou zero» — é um
    // registo incompleto. Apagar dinheiro por causa disso é o pior desfecho
    // possível desta ferramenta.
    expect(
      valoresDiferentesDoEnviado(
        [pedido("q1", 3140)],
        [proposta("p1", "q1", 0, "2026-05-02T10:00:00Z")],
      ),
    ).toEqual([]);
  });

  it("apanha o pedido que não tem valor nenhum", () => {
    const fora = valoresDiferentesDoEnviado(
      [pedido("q1", null)],
      [proposta("p1", "q1", 3000, "2026-05-02T10:00:00Z")],
    );
    expect(fora).toHaveLength(1);
    expect(fora[0].noPedido).toBeNull();
  });

  it("ignora uma proposta de um pedido que já não existe", () => {
    expect(
      valoresDiferentesDoEnviado([], [proposta("p1", "q9", 3000, "2026-05-02T10:00:00Z")]),
    ).toEqual([]);
  });

  it("põe o maior desvio primeiro", () => {
    const fora = valoresDiferentesDoEnviado(
      [pedido("q1", 3100), pedido("q2", 9000)],
      [
        proposta("p1", "q1", 3000, "2026-05-02T10:00:00Z"),
        proposta("p2", "q2", 3000, "2026-05-02T10:00:00Z"),
      ],
    );
    expect(fora.map((f) => f.quoteId)).toEqual(["q2", "q1"]);
  });
});
