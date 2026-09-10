import { describe, expect, it } from "vitest";
import { horarioEmPdf } from "./horario-pdf";
import type { TimelineItem } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A FOLHA QUE SAI DAQUI TEM DE SER A FOLHA DELA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O desenho deste PDF não foi inventado: é a timeline a sério de um casamento
 * — a folha que a equipa levou para a Adega Fita Preta a 28 de Junho — que ela
 * mandou com «quero que faças assim mesmo para o nosso timeline».
 *
 * Um PDF não se mede a olho num teste, e este ficheiro não tenta. Mede o que
 * um teste PODE medir e o que, se se partir, dá uma folha errada nas mãos de
 * dez fornecedores: que o ficheiro sai, que sai em A4 ao alto, que ganha as
 * páginas que o dia precisar, e que um dia sem momentos não dá folha nenhuma
 * em vez de dar uma folha em branco.
 */

const momento = (t: Partial<TimelineItem> & { time: string; title: string }): TimelineItem => ({
  id: `m-${t.time}-${t.title}`,
  ...t,
});

const DIA: TimelineItem[] = [
  momento({ time: "08:30", title: "Chegada Icook para montagem", local: "Fitapreta" }),
  momento({ time: "10:30", title: "Chegada Festaaluga para montagem" }),
  momento({ time: "10:30", title: "Chegada Liquen Flowers" }),
  momento({ time: "14:30", title: "Chegada foto e vídeo aos noivos", local: "Governador" }),
  momento({ time: "16:30", title: "Sergey chega", local: "Fitapreta", notas: "enviar táxi" }),
];

const BASE = {
  titulo: "Casamento J&P 28.06.25",
  adultos: "240",
  criancas: "6 crianças (1 c/ 1 ano)",
  staff: "24",
};

describe("a timeline em PDF", () => {
  it("sai em A4 ao alto, que é o formato da folha dela", async () => {
    const bytes = await horarioEmPdf({ ...BASE, momentos: DIA });
    expect(bytes, "um dia com momentos tem de dar ficheiro").not.toBeNull();

    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(bytes!);
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    // A4 ao alto: 595×842 pt. A folha dela é exactamente esta.
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("um dia sem momentos não dá folha nenhuma", async () => {
    /* E é de propósito. Uma folha em branco com o cabeçalho impresso parece um
       defeito do gerador; um `null` deixa quem chama dizer por palavras que a
       timeline ainda está por escrever — que é a verdade. */
    expect(await horarioEmPdf({ ...BASE, momentos: [] })).toBeNull();
  });

  it("um dia comprido ganha as páginas que precisar, e não corta", async () => {
    /* A folha dela tem três páginas. Um gerador que desenhasse só a primeira
       perdia o jantar e a festa — e perdia-os em silêncio, que é pior. */
    const comprido = Array.from({ length: 120 }, (_, i) =>
      momento({
        time: `${String(8 + Math.floor(i / 8)).padStart(2, "0")}:00`,
        title: `Momento ${i + 1} do dia, com um nome suficientemente comprido para partir em linhas`,
      }),
    );
    const bytes = await horarioEmPdf({ ...BASE, momentos: comprido });
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(bytes!);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("aceita nomes fora da tabela do Windows sem rebentar", async () => {
    /**
     * O defeito que a Helvetica de série dá, e que esta casa já apanhou uma vez
     * no PDF das propostas: um nome fora do WinAnsi não sai com a letra errada
     * — atira uma excepção a meio do desenho, e o download falha inteiro.
     *
     * Por isso a fonte é embutida. Isto é o guarda dessa decisão.
     */
    const bytes = await horarioEmPdf({
      ...BASE,
      titulo: "Casamento Nguyễn & Łukasz 28.06.25",
      momentos: [momento({ time: "17:00", title: "Cerimónia — Nguyễn entra" })],
    });
    expect(bytes).not.toBeNull();
  });
});
