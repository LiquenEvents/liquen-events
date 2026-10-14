import { describe, expect, it } from "vitest";
import { diaDoEvento } from "./proposal-doc";
import { dataDoEventoPorExtenso, isoDaDataPorExtenso } from "./proposal-doc-textos";

/** `diaDoEvento` é uma cópia de `isoDaDataPorExtenso` (ver o comentário dela):
 *  as duas têm de reconhecer as mesmas datas, todas as do ano. */
describe("diaDoEvento e isoDaDataPorExtenso dizem o mesmo", () => {
  it("em todos os dias de um ano", () => {
    for (let d = 0; d < 366; d++) {
      const iso = new Date(Date.UTC(2028, 0, 1 + d)).toISOString().slice(0, 10);
      const texto = dataDoEventoPorExtenso(iso);
      expect(diaDoEvento(texto)).toBe(isoDaDataPorExtenso(texto));
      expect(diaDoEvento(texto)).toBe(iso);
    }
  });
});
