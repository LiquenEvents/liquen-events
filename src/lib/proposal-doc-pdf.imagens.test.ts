import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { PDFDocument, PDFDict, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import { renderProposalDocPdfWithReport } from "./proposal-doc-pdf";
import { withProposalDefaults } from "./proposal-doc";
import { MAX_IMAGE_EDGE_PX } from "./proposal-image";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTÁ MESMO DENTRO DO PDF QUE VAI PARA O CASAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ~95% do peso de uma proposta são fluxos de imagem, e todas as maneiras de
 * isto correr mal produzem um ficheiro que ABRE BEM. É esse o problema: um PDF
 * de 3,31 MB com as fotos a 266–576 DPI parece igual a um de 900 KB — só é
 * lento a percorrer, e ninguém liga o sintoma à causa (ver PDF-BEFORE.md).
 *
 * Por isso este ficheiro não olha para o aspecto do documento. Abre o PDF
 * GERADO, percorre os objectos de imagem e verifica cinco coisas que só se
 * vêem por dentro:
 *
 *  1. **Nenhuma foto entrou sem ser redimensionada.** É o caminho de recurso
 *     de quando o `sharp` falha, e foi exactamente ele que produziu o tal PDF
 *     de 3,31 MB. Sai um erro nos registos, mas o ficheiro sai à mesma.
 *  2. **A transparência não se espalha.** Compor transparência é das operações
 *     mais caras que um visualizador faz. O documento tem exactamente UMA
 *     imagem com máscara — o logótipo branco da capa — e isso é uma decisão
 *     tomada e escrita (ver `proposal-doc-pdf.ts`: achatá-lo contra o
 *     verde-escuro desenhava um rectângulo visível à volta da marca, por isso
 *     achatam-se as 10 utilizações sobre branco e deixam-se as 2 da capa).
 *     O que este teste impede é essa excepção CRESCER — e sobretudo impede que
 *     uma FOTOGRAFIA passe a trazer canal alfa.
 *  3. **Todas as fotografias em JPEG (DCTDecode).** Uma foto que entre como
 *     PNG/Flate multiplica os bytes por quatro ou cinco.
 *  4. **Nenhuma imagem acima do tecto de pixéis.** É o guarda contra uma caixa
 *     absurda pedir uma imagem gigante.
 *  5. **Nenhuns bytes escritos duas vezes.** A capa é desenhada na página 1 e
 *     na contracapa, e a mesma foto pode ser escolhida para um mood board.
 *
 * Usa fotografias REAIS do repositório — as mesmas ordens de grandeza das que
 * ela escolhe no estúdio. Um teste com quadrados de 10 px não exercitava nada
 * disto.
 *
 * ── Como se distingue uma fotografia de um logótipo ───────────────────────
 * Pelo FILTRO, que é a mesma distinção que o gerador faz de propósito:
 * fotografias saem em JPEG (`/DCTDecode`), a marca sai em PNG (`/FlateDecode`,
 * cor chapada — o JPEG inventava artefactos à volta do traço fino). Não é uma
 * heurística de tamanho: o logótipo tem 720 px de largura e é maior do que
 * várias células de mood board.
 */

/** As fotos maiores do repositório: é sobre elas que o custo aparece. */
function fotos(quantas: number) {
  const dir = path.join(process.cwd(), "public", "imagens");
  return readdirSync(dir)
    .filter((f) => /\.(jpe?g|JPG)$/.test(f))
    .map((f) => ({ nome: f, bytes: statSync(path.join(dir, f)).size }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, quantas)
    .map(
      (f) => `data:image/jpeg;base64,${readFileSync(path.join(dir, f.nome)).toString("base64")}`,
    );
}

interface ImagemNoPdf {
  largura: number;
  altura: number;
  filtros: string[];
  temSMask: boolean;
  /** Resumo dos BYTES do fluxo — é assim que se vê a mesma imagem escrita duas
   *  vezes, que é a única definição de "duplicada" que interessa. */
  conteudo: string;
}

/**
 * Todos os XObjects de imagem DESENHÁVEIS do ficheiro, lidos do PDF já escrito.
 *
 * Uma máscara de transparência é, ela própria, um XObject de imagem — o canal
 * alfa em tons de cinzento, com as mesmas dimensões do seu dono. Não é uma
 * imagem do documento: é metade de outra. Contá-la faria "duas imagens PNG"
 * parecerem três e deixaria este ficheiro a medir uma coisa que ninguém desenha.
 */
async function imagensDo(bytes: Uint8Array): Promise<ImagemNoPdf[]> {
  const pdf = await PDFDocument.load(bytes);
  const objectos = [...pdf.context.enumerateIndirectObjects()];
  const mascaras = new Set<string>();
  for (const [, obj] of objectos) {
    if (!(obj instanceof PDFRawStream)) continue;
    const alvo = obj.dict.get(PDFName.of("SMask"));
    if (alvo) mascaras.add(String(alvo));
  }

  const saida: ImagemNoPdf[] = [];
  for (const [ref, obj] of objectos) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (mascaras.has(String(ref))) continue;
    const dict: PDFDict = obj.dict;
    if (dict.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;
    const bruto = dict.get(PDFName.of("Filter"));
    // `Filter` é um nome OU um array de nomes (uma cadeia de filtros).
    const filtros = (bruto?.toString() ?? "").replace(/[[\]]/g, " ").split(/\s+/).filter(Boolean);
    saida.push({
      largura: (dict.get(PDFName.of("Width")) as PDFNumber)?.asNumber?.() ?? 0,
      altura: (dict.get(PDFName.of("Height")) as PDFNumber)?.asNumber?.() ?? 0,
      filtros,
      temSMask: dict.has(PDFName.of("SMask")),
      conteudo: createHash("sha256").update(obj.contents).digest("hex"),
    });
  }
  return saida;
}

/**
 * Uma proposta com a forma de uma verdadeira: duas fotos de capa e três mood
 * boards. São seis fotografias — o suficiente para exercitar os dois
 * `placement` (capa e collage) e a cache por conteúdo, sem gastar no CI os
 * segundos que catorze gastariam.
 */
function propostaDeAmostra() {
  const f = fotos(6);
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento Teste",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Monte da Oliveirinha, Évora",
    guests: "80 pax",
    ceremony: "Civil, simbólica",
    time: "16h00",
    weddingPlanners: "Equipa AMARA",
    coverImages: [f[0], f[1]],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral de Casamento",
        items: [{ label: "Cerimónia", desc: "Arco floral e passadeira com pétalas naturais." }],
      },
    ],
    moodBoards: [
      { title: "Cerimónia", images: [f[2], f[3]] },
      // A MESMA foto duas vezes, e uma delas também é capa: é o que prova que
      // a cache por conteúdo faz o seu trabalho.
      { title: "Copo d'água", images: [f[4], f[4], f[0]] },
    ],
    budgetItems: ["Decor Cerimónia"],
    totalLabel: "Valor Total Decoração",
    totalText: "4800,00 € + IVA",
  });
}

describe("as imagens dentro do PDF gerado", () => {
  let bytes: Uint8Array;
  let semRedimensionar: number;
  let imagens: ImagemNoPdf[];

  beforeAll(async () => {
    const res = await renderProposalDocPdfWithReport(propostaDeAmostra());
    bytes = res.bytes;
    semRedimensionar = res.semRedimensionar;
    imagens = await imagensDo(bytes);
  }, 300_000);

  /** As fotografias, por oposição às duas variantes da marca — ver o cabeçalho. */
  const fotografias = () => imagens.filter((i) => i.filtros.includes("/DCTDecode"));

  it("a amostra tem mesmo imagens lá dentro", () => {
    // Guarda contra o pior fracasso deste ficheiro: passar a verde por ter
    // deixado de encontrar imagem nenhuma.
    expect(imagens.length).toBeGreaterThanOrEqual(4);
  });

  /**
   * O TESTE QUE INTERESSA. O caminho de recurso existe para o PDF sair sempre,
   * e cumpre — cumpre até demais: embute o ORIGINAL em tamanho de
   * armazenamento. Foi assim que saiu um PDF verdadeiro de 3,31 MB.
   */
  it("nenhuma foto entrou sem ser redimensionada", () => {
    expect(
      semRedimensionar,
      "o sharp falhou e o PDF saiu com fotos em tamanho de armazenamento — pesado a percorrer",
    ).toBe(0);
  });

  /**
   * NENHUMA fotografia com canal alfa. Uma foto é opaca por definição; se
   * alguma trouxer máscara, é porque deixou de passar pelo `resizeToBox` (que
   * reencoda em JPEG) e entrou pelo caminho de recurso com os bytes originais.
   */
  it("nenhuma fotografia traz máscara de transparência", () => {
    for (const im of fotografias()) {
      expect(im.temSMask, `foto de ${im.largura}x${im.altura} com canal alfa`).toBe(false);
    }
  });

  /**
   * A EXCEPÇÃO NÃO PODE CRESCER. É UMA: o logótipo branco da capa, que é
   * desenhado na capa e na contracapa a partir do mesmo objecto. Compor
   * transparência é caro, e antes disto era pago uma vez por página — em todas
   * as doze.
   */
  it("há exactamente uma imagem com transparência em todo o documento", () => {
    const comAlfa = imagens.filter((i) => i.temSMask);
    expect(
      comAlfa.length,
      comAlfa.map((i) => `${i.largura}x${i.altura} ${i.filtros.join("+")}`).join(", ") ||
        "nenhuma — se o logótipo da capa passou a ser achatado, actualize este teste",
    ).toBe(1);
  });

  it("as fotografias são todas JPEG, e a marca é a única que não é", () => {
    expect(
      fotografias().length,
      "não se encontrou fotografia nenhuma para verificar",
    ).toBeGreaterThan(0);
    // Duas variantes da marca (a escura das páginas e a branca da capa) e mais
    // nada. Uma FOTO que entrasse como PNG multiplicava os bytes por quatro ou
    // cinco, e apareceria aqui.
    const naoJpeg = imagens.filter((i) => !i.filtros.includes("/DCTDecode"));
    expect(
      naoJpeg.length,
      naoJpeg.map((i) => `${i.largura}x${i.altura} ${i.filtros.join("+")}`).join(", "),
    ).toBeLessThanOrEqual(2);
  });

  it("nenhuma imagem passa o tecto de pixéis", () => {
    for (const im of imagens) {
      expect(Math.max(im.largura, im.altura)).toBeLessThanOrEqual(MAX_IMAGE_EDGE_PX);
    }
  });

  /**
   * A capa é desenhada na página 1 E na contracapa, e a mesma foto pode ser
   * escolhida para um mood board. Sem a cache por conteúdo, os mesmos bytes
   * eram escritos no ficheiro tantas vezes quantas fossem desenhados.
   *
   * Compara os BYTES e não a contagem: um número esperado de objectos ficaria
   * errado no dia em que se mudasse uma disposição do collage, e ninguém saberia
   * se o novo número era bom ou mau. Bytes iguais escritos duas vezes é sempre
   * mau, seja qual for a disposição.
   */
  it("os mesmos bytes nunca são escritos duas vezes", () => {
    const vistos = new Map<string, ImagemNoPdf>();
    for (const im of imagens) {
      const antes = vistos.get(im.conteudo);
      expect(
        antes,
        `${im.largura}x${im.altura} está no ficheiro duas vezes — a cache por conteúdo falhou`,
      ).toBeUndefined();
      vistos.set(im.conteudo, im);
    }
  });
});
