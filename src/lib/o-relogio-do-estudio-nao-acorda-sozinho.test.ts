import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveValidUntil } from "./proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RELÓGIO DO ESTÚDIO NÃO PODE ACORDAR SOZINHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `Intl.DateTimeFormat` do fuso de Lisboa estava construído NO TOPO deste
 * módulo — ou seja, a cada leitura do ficheiro, quisesse-se ou não saber as
 * horas.
 *
 * ── O QUE ISSO CUSTAVA, MEDIDO ────────────────────────────────────────────
 *
 * O PRIMEIRO `Intl.DateTimeFormat` de um processo carrega o ICU inteiro. Cinco
 * medições de cada lado, processo novo em cada uma, só a LER o módulo e sem
 * lhe chamar nada:
 *
 *   no topo        19,98  20,09  19,10  19,53  19,37 ms
 *   preguiçoso      0,56   0,52   0,68   0,59   0,82 ms
 *
 * ── E QUEM PAGAVA NÃO ERA QUEM USAVA ──────────────────────────────────────
 *
 * Quem precisa do relógio é o `hojeNoEstudio`, para os prazos das facturas. A
 * página que o CASAL abre não lhe chama — e mesmo assim pagava os vinte
 * milissegundos em cada arranque a frio da função, que é precisamente o
 * instante em que eles estão a olhar para um ecrã branco à espera da proposta.
 *
 * ── PORQUE É QUE ISTO SE LÊ NA FONTE ──────────────────────────────────────
 *
 * Porque a diferença não se vê no COMPORTAMENTO: as datas saem iguais nos dois
 * casos, e por isso nenhum teste de resultado a pode apanhar. O que se está a
 * guardar é ONDE a construção acontece, e isso está escrito no ficheiro.
 *
 * O caso a seguir a este é o controlo: prova que a preguiça não mudou uma
 * única data.
 */
const FONTE = readFileSync("src/lib/proposal-doc.ts", "utf8");

/** A fonte sem comentários — senão a própria explicação acima faria o teste
 *  passar ou reprovar por engano, que é uma armadilha que esta casa já pisou. */
const CODIGO = FONTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("o relógio do estúdio não acorda sozinho", () => {
  it("nenhum `Intl` se constrói ao ler o ficheiro", () => {
    /**
     * Uma construção de topo é a que NÃO está dentro de nenhuma função. A
     * maneira honesta de a distinguir é pela indentação: no topo do módulo o
     * `const`/`let` começa na coluna zero.
     */
    const noTopo = CODIGO.split("\n").filter((l) => /^(const|let|var)\s.*new Intl\./.test(l));
    expect(
      noTopo,
      "um `Intl` construído no topo do módulo carrega o ICU (≈20 ms) em cada " +
        "arranque a frio, mesmo para quem nunca lhe vai chamar",
    ).toEqual([]);
  });

  it("e o que existe é construído à primeira utilização", () => {
    expect(CODIGO, "desapareceu a construção preguiçosa do formatador").toMatch(
      /camposDoDia \?\?= new Intl\.DateTimeFormat/,
    );
  });

  it("CONTROLO: a preguiça não mudou uma única data", () => {
    // Se a construção tardia trocasse o fuso, uma validade calculada à
    // meia-noite de Lisboa saltava um dia — e este caso reprovava.
    const veraoAntesDaMeiaNoite = new Date("2026-07-15T22:30:00Z"); // 23:30 em Lisboa
    const invernoDepoisDaMeiaNoite = new Date("2026-01-15T00:30:00Z"); // 00:30 em Lisboa
    const trintaDias = { validUntilDays: 30 };
    expect(resolveValidUntil(trintaDias, veraoAntesDaMeiaNoite)).toBe("2026-08-14");
    expect(resolveValidUntil(trintaDias, invernoDepoisDaMeiaNoite)).toBe("2026-02-14");
    // E duas chamadas seguidas têm de dar o mesmo — o formatador guardado
    // continua a servir depois da primeira vez.
    const umDia = { validUntilDays: 1 };
    expect(resolveValidUntil(umDia, veraoAntesDaMeiaNoite)).toBe(
      resolveValidUntil(umDia, veraoAntesDaMeiaNoite),
    );
  });
});
