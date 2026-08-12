import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { FOTOGRAFIAS_DA_ENTRADA, DESFOCADO_NEUTRO } from "./fotografias-da-entrada";
import { GALLERY_WIDTHS } from "@/app/[lang]/(site)/galeria/gallery-image-loader";
import {
  ESCADA_FAIXA,
  ESCADA_PAINEL,
} from "@/app/[lang]/(site)/orcamento/admin/EntradaComFotografia";

const ROOT = path.join(__dirname, "..", "..");
const BLUR_MAP: Record<string, string> = JSON.parse(
  readFileSync(path.join(ROOT, "src", "lib", "blur-map.json"), "utf8"),
);

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRATO DAS FOTOGRAFIAS DA ENTRADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A lista existe para a dona do site poder trocar uma fotografia sem abrir
 * código nenhum (ver o cabeçalho de `fotografias-da-entrada.ts`). Isso só é
 * verdade enquanto houver quem verifique as três coisas que uma troca à mão
 * pode partir em silêncio, e que NÃO dão erro de compilação:
 *
 *   1. o ficheiro não existe em `public/imagens/` — a entrada fica sem fundo;
 *   2. o `desfocado` ficou o da fotografia ANTERIOR — a página nasce com a cor
 *      errada e muda de cor à vista quando a fotografia chega;
 *   3. o `enquadramento` deixou de ser um par válido — o browser ignora o
 *      `object-position` inteiro e volta ao centro, que é exactamente o recorte
 *      que se estava a tentar evitar.
 */
describe("as fotografias da entrada do back office", () => {
  it("tem fotografias que chegam para a rotação não ser sempre a mesma", () => {
    // Uma só fotografia faz o `fotografiaDoDia` devolver sempre a mesma, que é
    // precisamente o que o pedido excluía.
    expect(FOTOGRAFIAS_DA_ENTRADA.length).toBeGreaterThan(1);
  });

  it("cada ficheiro existe mesmo em public/imagens/", () => {
    for (const foto of FOTOGRAFIAS_DA_ENTRADA) {
      expect(
        foto.ficheiro.startsWith("/imagens/"),
        `${foto.ficheiro} fora de public/imagens/`,
      ).toBe(true);
      const noDisco = path.join(ROOT, "public", foto.ficheiro);
      expect(existsSync(noDisco), `${foto.ficheiro} não existe em public/imagens/`).toBe(true);
    }
  });

  it("cada desfocado é o da SUA fotografia (e não o da anterior)", () => {
    for (const foto of FOTOGRAFIAS_DA_ENTRADA) {
      if (!foto.desfocado) continue; // é opcional — ver o cabeçalho do módulo
      expect(
        foto.desfocado,
        `o desfocado de ${foto.ficheiro} não corresponde ao de blur-map.json ` +
          `(copia o valor certo, ou apaga o campo: a página funciona sem ele)`,
      ).toBe(BLUR_MAP[foto.ficheiro]);
    }
  });

  it("cada enquadramento é um par de percentagens que o CSS aceita", () => {
    // Um `object-position` inválido é descartado INTEIRO pelo browser, sem
    // aviso: a fotografia volta ao centro e o recorte pensado desaparece.
    for (const foto of FOTOGRAFIAS_DA_ENTRADA) {
      expect(foto.enquadramento, `enquadramento de ${foto.ficheiro}`).toMatch(
        /^\d{1,3}% \d{1,3}%$/,
      );
    }
  });

  it("o desfocado neutro é um data: URI de WebP", () => {
    expect(DESFOCADO_NEUTRO.startsWith("data:image/webp;base64,")).toBe(true);
  });
});

/**
 * A PROMESSA DE «NÃO É PRECISO CORRER SCRIPT NENHUM».
 *
 * O cabeçalho da lista diz à dona que basta trocar o nome do ficheiro. Isso só
 * se aguenta enquanto as larguras que a entrada pede forem um subconjunto das
 * que `scripts/pregen-gallery.mjs` já emite para TODA a fotografia de
 * `public/imagens/`. No dia em que alguém acrescentar aqui uma largura que a
 * escada da galeria não tem, a entrada passa a pedir um ficheiro que ninguém
 * gera — 404 por candidato do srcset — e a instrução do cabeçalho passa a ser
 * mentira. Este teste é o que impede isso.
 */
describe("a entrada vive da escada que a galeria já gera", () => {
  it("todas as larguras do painel e da faixa existem em GALLERY_WIDTHS", () => {
    for (const w of [...ESCADA_PAINEL, ...ESCADA_FAIXA]) {
      expect(
        (GALLERY_WIDTHS as readonly number[]).includes(w),
        `${w} não é uma largura pré-gerada — ver scripts/pregen-gallery.mjs`,
      ).toBe(true);
    }
  });

  it("as escadas estão por ordem crescente (o srcset conta com isso)", () => {
    for (const escada of [ESCADA_PAINEL, ESCADA_FAIXA]) {
      const ordenada = [...escada].sort((a, b) => a - b);
      expect([...escada]).toEqual(ordenada);
    }
  });
});
