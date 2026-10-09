import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * As horas e os minutos no telemóvel liam-se «0C» em vez de «00» (MEDIDO a
 * 390, no diálogo «Novo no calendário»): a letra sobe para 16 px no dedo e a
 * caixa de 68 px só deixava 18 para o texto. No dedo a caixa é de 80 — o
 * degrau «quantidade» da escala de larguras. Com rato fica como estava.
 */
describe("CampoDeHora", () => {
  it("alarga as duas caixas no dedo", () => {
    const fonte = readFileSync("src/app/[lang]/(admin)/orcamento/admin/ui/CampoDeHora.tsx", "utf8");
    expect(fonte.match(/containerClassName="w-\[68px\] pointer-coarse:w-20"/g)).toHaveLength(2);
  });
});
