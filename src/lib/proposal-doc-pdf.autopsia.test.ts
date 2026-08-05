import { describe, it } from "vitest";
import { writeFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderProposalDocPdf } from "./proposal-doc-pdf";
import { withProposalDefaults } from "./proposal-doc";

/**
 * GERADOR DA AMOSTRA PARA A AUTÓPSIA DO PDF.
 *
 * Não é um teste de regressão: é a forma de produzir um PDF de proposta com o
 * peso de um verdadeiro para depois o abrir com `pdfimages`/`qpdf`/`pdffonts`.
 * Vive como teste porque `proposal-doc-pdf.ts` é `server-only` e só carrega
 * dentro do ambiente que o vitest monta.
 *
 * Corre só quando `PDF_AUTOPSIA` está definido, para não gastar segundos e
 * megabytes em cada passagem normal da suite:
 *
 *   PDF_AUTOPSIA=/tmp/proposta-antes.pdf npx vitest run proposal-doc-pdf.autopsia
 */

const DESTINO = process.env.PDF_AUTOPSIA;

/** Fotografias reais do repositório, como as que ela escolhe no estúdio. */
function fotos(quantas: number) {
  const dir = path.join(process.cwd(), "public", "imagens");
  return readdirSync(dir)
    .filter((f) => /\.(jpe?g|JPG)$/.test(f))
    .map((f) => ({ nome: f, bytes: statSync(path.join(dir, f)).size }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, quantas)
    .map((f) => ({
      ...f,
      b64: `data:image/jpeg;base64,${readFileSync(path.join(dir, f.nome)).toString("base64")}`,
    }));
}

describe.runIf(DESTINO)("amostra para autópsia", () => {
  it(
    "gera uma proposta cheia de fotografias e escreve-a no disco",
    { timeout: 300_000 },
    async () => {
      const f = fotos(14);
      const origem = f.reduce((s, x) => s + x.bytes, 0);

      const doc = withProposalDefaults({
        template: "decoracao",
        ref: "PO Decoração Casamento Maria & Zé 12.09.2026",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Monte da Oliveirinha, Évora",
        guests: "80 pax",
        ceremony: "Civil, simbólica",
        time: "16h00",
        weddingPlanners: "Equipa AMARA",
        coverImages: [f[0].b64, f[1].b64],
        serviceGroups: [
          {
            letter: "a)",
            title: "Decoração Floral de Casamento",
            items: [
              { label: "Cerimónia", desc: "Arco floral e passadeira com pétalas naturais." },
              { label: "Copo d'água", desc: "Centros de mesa e iluminação ambiente." },
              { label: "Jantar", desc: "Composições baixas, velas e têxteis em linho." },
            ],
          },
        ],
        moodBoards: [
          { title: "Decoração Cerimónia", images: f.slice(2, 6).map((x) => x.b64) },
          { title: "Copo d'água", images: f.slice(6, 10).map((x) => x.b64) },
          { title: "Jantar", images: f.slice(10, 14).map((x) => x.b64) },
        ],
        budgetItems: ["Decor Cerimónia", "Decor Copo d'água", "Decor Jantar"],
        budgetExtras: [
          { label: "Deslocação da equipa Líquen", valueText: "896,00 €" },
          { label: "Wedding Coordinator", valueText: "895,00 € + IVA" },
        ],
        totalLabel: "Valor Total Decoração",
        totalText: "4800,00 € + IVA",
      });

      const t0 = Date.now();
      const bytes = await renderProposalDocPdf(doc);
      const ms = Date.now() - t0;
      writeFileSync(DESTINO!, bytes);

      console.log(
        `\nORIGEM: ${f.length} fotos, ${(origem / 1048576).toFixed(1)} MB\n` +
          `PDF:    ${(bytes.length / 1048576).toFixed(2)} MB em ${ms} ms → ${DESTINO}\n`,
      );
    },
  );
});
