import { describe, expect, it } from "vitest";
import type { EstadoSeccao, Impedimento } from "@/lib/proposal-progress";
import {
  PASSOS,
  estadoDosPassos,
  nomeDoPasso,
  passoAoLado,
  passoDaSeccao,
} from "./passos-do-estudio";

const seccao = (id: string, preenchida = true): EstadoSeccao => ({
  id,
  titulo: id,
  preenchida,
  resumo: "",
});
const falta = (seccao: string, trava: boolean): Impedimento => ({
  id: `${seccao}-${trava}`,
  seccao,
  texto: "x",
  trava,
});
const TUDO = ["evento", "capas", "servicos", "moodboards", "orcamento", "total"].map((s) =>
  seccao(s),
);

describe("os passos", () => {
  it("são cinco, por esta ordem", () => {
    expect(PASSOS).toEqual(["evento", "servicos", "inspiracao", "orcamento", "enviar"]);
    expect(PASSOS.map((p) => nomeDoPasso(p))).toEqual([
      "Evento",
      "Serviços",
      "Inspiração",
      "Orçamento",
      "Rever e enviar",
    ]);
  });

  it("numa proposta de organização, o 3.º chama-se Cronograma", () => {
    expect(nomeDoPasso("inspiracao", true)).toBe("Cronograma");
  });

  it("cada secção vive num passo, e uma desconhecida cai no primeiro", () => {
    expect(passoDaSeccao("evento")).toBe("evento");
    expect(passoDaSeccao("capas")).toBe("evento");
    expect(passoDaSeccao("servicos")).toBe("servicos");
    expect(passoDaSeccao("moodboards")).toBe("inspiracao");
    expect(passoDaSeccao("cronograma")).toBe("inspiracao");
    expect(passoDaSeccao("orcamento")).toBe("orcamento");
    expect(passoDaSeccao("total")).toBe("orcamento");
    expect(passoDaSeccao("envio")).toBe("enviar");
    expect(passoDaSeccao("outra-coisa")).toBe("evento");
    expect(passoDaSeccao(undefined)).toBe("evento");
  });

  it("o passo ao lado, e nada para lá das pontas", () => {
    expect(passoAoLado("evento", 1)).toBe("servicos");
    expect(passoAoLado("orcamento", 1)).toBe("enviar");
    expect(passoAoLado("evento", -1)).toBeNull();
    expect(passoAoLado("enviar", 1)).toBeNull();
  });
});

describe("o estado de cada passo", () => {
  it("tudo preenchido e nada a faltar: todos completos", () => {
    expect(estadoDosPassos(TUDO, [], false)).toEqual({
      evento: "completo",
      servicos: "completo",
      inspiracao: "completo",
      orcamento: "completo",
      enviar: "completo",
    });
  });

  it("uma falta que trava põe o passo dela em erro, e o «Rever e enviar» também", () => {
    const e = estadoDosPassos(TUDO, [falta("total", true)], false);
    expect(e.orcamento).toBe("erro");
    expect(e.evento).toBe("completo");
    expect(e.enviar).toBe("erro");
  });

  it("uma secção por preencher, ou um conselho, deixa o passo incompleto", () => {
    const porPreencher = TUDO.map((s) => (s.id === "servicos" ? seccao("servicos", false) : s));
    expect(estadoDosPassos(porPreencher, [], false).servicos).toBe("incompleto");
    const comConselho = estadoDosPassos(TUDO, [falta("moodboards", false)], false);
    expect(comConselho.inspiracao).toBe("incompleto");
    // Um conselho não trava: o «Rever e enviar» continua completo.
    expect(comConselho.enviar).toBe("completo");
  });

  it("o erro ganha ao incompleto no mesmo passo", () => {
    const e = estadoDosPassos(
      TUDO.map((s) => (s.id === "evento" ? seccao("evento", false) : s)),
      [falta("evento", true)],
      false,
    );
    expect(e.evento).toBe("erro");
  });

  it("o email em falta trava no próprio passo do envio", () => {
    expect(estadoDosPassos(TUDO, [falta("envio", true)], false).enviar).toBe("erro");
  });

  it("depois de enviada, o «Rever e enviar» está completo", () => {
    expect(estadoDosPassos(TUDO, [falta("total", true)], true).enviar).toBe("completo");
  });
});
