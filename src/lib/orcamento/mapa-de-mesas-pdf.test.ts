import { describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

vi.mock("server-only", () => ({}));

import { mapaDeMesasEmPdf, nomeDoFicheiroDoMapa } from "./mapa-de-mesas-pdf";
import {
  chaveDoLugar,
  mapaVazio,
  mudarMesa,
  novaMesa,
  novoElemento,
  sentarAutomaticamente,
  type MapaDeMesas,
} from "./mapa-de-mesas";
import type { Guest } from "./types";

/**
 * O PDF do mapa de mesas: o desenho numa A4 deitada e a lista por mesa. Um PDF
 * não se mede a olho num teste; mede-se o que, partido, dá uma folha errada no
 * dia: que sai, em A4 deitada, com as páginas da lista; que um mapa sem mesas
 * não dá folha nenhuma; e que um nome fora do WinAnsi («Nguyễn») não rebenta.
 */

const CONVIDADOS: Guest[] = [
  { id: "g1", name: "Família Conceição", party: 6, rsvp: "confirmado" },
  { id: "g2", name: "Nguyễn Văn An", party: 1, rsvp: "confirmado" },
  { id: "g3", name: "Łukasz e Zoë", party: 2, rsvp: "pendente" },
  { id: "g4", name: "Tia Rosa", party: 1, rsvp: "recusado" },
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `x${i}`,
    name: `Convidado ${i + 1}`,
    party: 1 + (i % 3),
    rsvp: "confirmado" as const,
  })),
];

function comMesas(): MapaDeMesas {
  let m = mapaVazio();
  for (let i = 0; i < 9; i++) m = novaMesa(m, i % 3 === 1 ? "comprida" : "redonda", `m${i}`).mapa;
  m = mudarMesa(m, "m2", { rodada: true });
  m = novoElemento(m, "pista", "e1").mapa;
  m = novoElemento(m, "noivos", "e2").mapa;
  return sentarAutomaticamente(m, CONVIDADOS).mapa;
}

describe("o mapa de mesas em PDF", () => {
  it("sai em A4 deitada, com o desenho e as páginas da lista", async () => {
    const bytes = await mapaDeMesasEmPdf({
      cliente: "TESTE Ana e Rui",
      detalhe: "Casamento · sábado, 20 de junho de 2099 · TESTE Quinta",
      mapa: comMesas(),
      lista: CONVIDADOS,
    });
    expect(bytes).not.toBeNull();
    if (process.env.GUARDAR_PDF) writeFileSync(process.env.GUARDAR_PDF, bytes!);
    const pdf = await PDFDocument.load(bytes!);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
    expect(pdf.getTitle()).toBe("Mapa de mesas — TESTE Ana e Rui");
  });

  it("um mapa sem mesas não dá folha nenhuma", async () => {
    expect(
      await mapaDeMesasEmPdf({ cliente: "X", detalhe: "", mapa: mapaVazio(), lista: [] }),
    ).toBeNull();
  });

  it("quem ficou por sentar entra no fim, e um lugar com nome escrito usa-o", async () => {
    let m = novaMesa(mapaVazio(), "redonda", "m1").mapa;
    m = mudarMesa(m, "m1", { lugares: 2 });
    m = {
      ...m,
      lugares: { [chaveDoLugar("m1", 0)]: { convidadoId: "g1", n: 1, nome: "Maria Conceição" } },
    };
    const bytes = await mapaDeMesasEmPdf({ cliente: "X", detalhe: "", mapa: m, lista: CONVIDADOS });
    const pdf = await PDFDocument.load(bytes!);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it("o nome do ficheiro não tem acentos nem espaços", () => {
    expect(nomeDoFicheiroDoMapa("Conceição & João", "2099-06-20")).toBe(
      "mapa-de-mesas-conceicao-joao-2099-06-20.pdf",
    );
    expect(nomeDoFicheiroDoMapa(undefined, undefined)).toBe("mapa-de-mesas-evento.pdf");
  });
});
