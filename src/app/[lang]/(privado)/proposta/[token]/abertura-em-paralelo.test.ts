import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA DA PROPOSTA NÃO ESPERA DUAS VEZES PELO MESMO SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Tem que ser ultra rápido abrir a proposta, tanto online como a do PDF.»
 *
 * Depois de ler a proposta, faltavam duas idas ao servidor: assinar os
 * endereços das FOTOGRAFIAS no Storage, e ler o PEDIDO para saber o que o casal
 * já escolheu. Estavam em fila — a segunda só partia quando a primeira voltasse
 * — e nenhuma precisa do resultado da outra.
 *
 * Em fila, a página espera a soma. Juntas, espera a maior das duas. Num
 * telemóvel em 4G, onde o que custa é a ida e a volta e não o trabalho do outro
 * lado, é uma volta inteira que desaparece de todas as aberturas.
 *
 * ── PORQUÊ UM TESTE QUE LÊ A FONTE ───────────────────────────────────────
 *
 * Porque o que se guarda aqui é a ORDEM em que duas esperas acontecem, e isso
 * não aparece no resultado: a página desenha exactamente o mesmo HTML das duas
 * maneiras. É invisível para qualquer teste de comportamento — e foi assim que
 * a fila lá esteve sem ninguém dar por ela.
 */

const FONTE = fs.readFileSync(
  path.join(process.cwd(), "src/app/[lang]/(privado)/proposta/[token]/page.tsx"),
  "utf8",
);

describe("a abertura da proposta online", () => {
  it("lança a leitura do pedido ANTES de esperar pelas fotografias", () => {
    const iPedido = FONTE.indexOf("const pedidoDasEscolhas =");
    const iFotos = FONTE.indexOf("await fotosDaProposta(");
    expect(iPedido, "desapareceu a leitura do pedido em paralelo").toBeGreaterThan(-1);
    expect(iFotos, "desapareceu a leitura das fotografias").toBeGreaterThan(-1);
    expect(
      iPedido,
      "a leitura do pedido voltou para DEPOIS das fotografias — a página passa a " +
        "esperar a soma das duas idas ao servidor em vez da maior",
    ).toBeLessThan(iFotos);
  });

  it("e o erro fica preso à promessa no instante em que ela nasce", () => {
    // Uma promessa que rebenta antes de alguém a esperar é uma rejeição sem
    // dono, e essas derrubam o processo em vez de desenharem a página sem as
    // marcas das escolhas — que é o pior caso honesto.
    const bloco = FONTE.slice(
      FONTE.indexOf("const pedidoDasEscolhas ="),
      FONTE.indexOf("await fotosDaProposta("),
    );
    expect(bloco, "a promessa do pedido ficou sem `.catch` próprio").toContain(".catch(");
  });
});
