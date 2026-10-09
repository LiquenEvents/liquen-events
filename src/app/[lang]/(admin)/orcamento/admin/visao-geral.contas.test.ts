import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * TRÊS CONTAS DA VISÃO GERAL QUE NÃO BATIAM CERTO (passagem de 9 de outubro)
 *
 *  · «134 pedidos a precisar de atenção» ao lado de uma barra que dizia
 *    «Por responder: 133». A diferença era uma proposta ENVIADA — que está à
 *    espera do cliente, não de nós. A frase passa a contar o mesmo que a barra
 *    (`A_ESPERAR_RESPOSTA`).
 *  · «Ganho ↑100%» quando o mês anterior foi zero: uma percentagem sobre zero
 *    é uma conta inventada. Sem base, não há seta.
 *  · Os «dias desde» contavam-se entre INSTANTES (`Date.now()` no desenho),
 *    e mudavam à hora a que cada pedido entrou, não à meia-noite.
 */
const FONTE = readFileSync("src/app/[lang]/(admin)/orcamento/admin/Overview.tsx", "utf8");

describe("Visão Geral", () => {
  it("a frase conta os por responder com a mesma regra da barra", () => {
    expect(FONTE).toContain("A_ESPERAR_RESPOSTA.includes(n.q.status)");
    expect(FONTE).toContain("por responder`");
    expect(FONTE).not.toContain("a precisar de atenção`");
  });

  it("não há seta de percentagem sem mês anterior", () => {
    const delta = FONTE.slice(FONTE.indexOf("function Delta("));
    expect(delta.slice(0, 600)).toContain("if (prev === 0) return null;");
    expect(delta.slice(0, 600)).not.toContain("prev === 0 ? 100");
  });

  it("os dias contam-se entre dias, sem `Date.now()` no cálculo", () => {
    const calculo = FONTE.slice(FONTE.indexOf("const data = useMemo(() => {"));
    const fim = calculo.indexOf("}, [");
    expect(calculo.slice(0, fim)).not.toContain("Date.now()");
    expect(calculo.slice(0, fim)).toContain("diasEntre(");
  });
});
