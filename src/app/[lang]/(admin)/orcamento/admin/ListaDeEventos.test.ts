import { describe, expect, it } from "vitest";
import { arrumarEventos, filtrarPorProcura } from "./ListaDeEventos";

/**
 * As contas da lista dos eventos, que o mapa de mesas e as Timelines usam as
 * duas: o próximo à cabeça, e os outros por mês, com o ano só quando não é
 * este.
 */

const EVENTOS = [
  { id: "a", cliente: "Ana e Rui", data: "2026-05-02", local: "Évora" },
  { id: "b", cliente: "Beatriz", data: "2026-06-20", local: "Quinta do Sobral" },
  { id: "c", cliente: "Carla", data: "2026-06-28", local: "Lisboa" },
  { id: "d", cliente: "Diogo", data: "2027-05-29", local: "Torre de Palma" },
];

describe("arrumar a lista dos eventos", () => {
  it("o próximo é o primeiro de hoje em diante, e não volta a aparecer nos meses", () => {
    const { proximo, porMes } = arrumarEventos(EVENTOS, "2026-06-10");
    expect(proximo?.id).toBe("b");
    expect(porMes.flatMap((m) => m.eventos.map((e) => e.id))).toEqual(["a", "c", "d"]);
  });

  it("os meses deste ano sem ano; os dos outros com ele", () => {
    const { porMes } = arrumarEventos(EVENTOS, "2026-06-10");
    expect(porMes.map((m) => m.mes)).toEqual(["Maio", "Junho", "Maio 2027"]);
  });

  it("sem nada daqui para a frente, não há próximo", () => {
    expect(arrumarEventos(EVENTOS, "2028-01-01").proximo).toBeNull();
  });

  it("a procura casa com o nome ou o local, sem acentos nem maiúsculas", () => {
    expect(filtrarPorProcura(EVENTOS, "evora").map((e) => e.id)).toEqual(["a"]);
    expect(filtrarPorProcura(EVENTOS, "  ").length).toBe(4);
  });
});
