import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ÍCONES TÊM DE SE VER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ícone anterior era o logótipo inteiro — emblema e as nove letras de
 * "LÍQUEN EVENTS" — encolhido num quadrado preto. Nada nele estava partido: o
 * ficheiro existia, tinha o tamanho certo, o browser mostrava-o. Só que a
 * tinta ocupava 2,1% do quadrado e o que se via no separador era um borrão.
 *
 * É o modo de falhar contra o qual este repositório já tem rede noutros
 * sítios: aquilo que existe, não dá erro, e não serve. Daí um teste que mede
 * o que os olhos veem — quanta tinta há, de que cor, e sobre que fundo — em
 * vez de se limitar a confirmar que os ficheiros lá estão.
 */

const RAIZ = process.cwd();

interface Icone {
  caminho: string;
  lado: number;
  /** Percentagem mínima do quadrado que tem de ser desenho. */
  tintaMinima: number;
}

/**
 * Os limiares não são redondos por acaso.
 *
 * MEDIDO nos ficheiros actuais: os ícones normais têm 7,1 a 8,4% de tinta e o
 * `maskable` 3,6%, porque o Android recorta-o e obriga a margens largas. Os
 * limiares ficam um pouco abaixo — dão espaço a o desenho mudar sem deixarem
 * passar um logótipo perdido no meio do quadrado, que é o defeito de origem
 * (o ícone antigo tinha 2,1%).
 *
 * A tinta é menos do que os 16,6% da versão só com o emblema, e isso é
 * esperado: o logótipo completo é quase o dobro da largura da altura, portanto
 * sobram margens em cima e em baixo, e as letras são traço fino. Continua a
 * ser mais do triplo do ícone antigo.
 */
const ICONES: Icone[] = [
  { caminho: "src/app/icon.png", lado: 512, tintaMinima: 5 },
  { caminho: "src/app/apple-icon.png", lado: 180, tintaMinima: 5 },
  { caminho: "public/icon-192.png", lado: 192, tintaMinima: 5 },
  { caminho: "public/icon-512.png", lado: 512, tintaMinima: 5 },
  { caminho: "public/icon-maskable-512.png", lado: 512, tintaMinima: 2.5 },
];

async function analisar(caminho: string) {
  const { data, info } = await sharp(join(RAIZ, caminho))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const fundo = [data[0], data[1], data[2]];
  let tinta = 0;
  let transparentes = 0;
  let amarelo = 0;
  let verde = 0;

  for (let i = 0; i < width * height; i++) {
    const p = i * channels;
    if (data[p + 3] < 250) transparentes++;
    const distancia =
      Math.abs(data[p] - fundo[0]) +
      Math.abs(data[p + 1] - fundo[1]) +
      Math.abs(data[p + 2] - fundo[2]);
    if (distancia > 60) {
      tinta++;
      // O amarelo do "LÍQUEN" (#D4B23C, mais ou menos): vermelho e verde altos,
      // azul baixo. O verde do emblema e de "EVENTS" (#5F7C66): o verde domina.
      if (data[p] > 140 && data[p + 1] > 120 && data[p + 2] < 110) amarelo++;
      if (data[p + 1] > data[p] + 8 && data[p + 1] > data[p + 2] + 8) verde++;
    }
  }

  return {
    width,
    height,
    fundo,
    transparentes,
    percentagemTinta: (100 * tinta) / (width * height),
    fraccaoAmarela: tinta ? amarelo / tinta : 0,
    fraccaoVerde: tinta ? verde / tinta : 0,
  };
}

describe("ícones do sítio", () => {
  it.each(ICONES)("$caminho é quadrado e do tamanho declarado", async (ic) => {
    const a = await analisar(ic.caminho);
    expect(a.width).toBe(ic.lado);
    expect(a.height).toBe(ic.lado);
  });

  it.each(ICONES)("$caminho tem desenho que chegue para se ver", async (ic) => {
    const a = await analisar(ic.caminho);
    expect(
      a.percentagemTinta,
      `${ic.caminho}: só ${a.percentagemTinta.toFixed(1)}% do quadrado é desenho. ` +
        "Um ícone com pouca tinta é um borrão a 16 px, que foi exactamente a queixa " +
        "que originou este teste. Correr `npm run gen:favicons`.",
    ).toBeGreaterThanOrEqual(ic.tintaMinima);
  });

  it.each(ICONES)("$caminho é A CORES, não a versão a branco nem a preto", async (ic) => {
    // As duas cores da marca têm de estar lá. Um logótipo a branco sobre preto
    // — que era o ícone antigo — não tem nenhuma delas e reprova aqui.
    const a = await analisar(ic.caminho);
    expect(
      a.fraccaoVerde,
      `${ic.caminho}: ${(100 * a.fraccaoVerde).toFixed(0)}% do desenho é verde de marca`,
    ).toBeGreaterThan(0.3);
  });

  it.each(ICONES)("$caminho DIZ 'Líquen Events'", async (ic) => {
    // O pedido, textual: "quero o favicon colorido a dizer Líquen Events".
    //
    // A verificação é indirecta e é de propósito: a palavra "LÍQUEN" é a única
    // parte do logótipo desenhada a AMARELO. Se ela lá estiver, há amarelo; se
    // alguém voltar a pôr só o emblema, o amarelo desaparece e este teste
    // acende. Não é preciso reconhecer letras para vigiar isto.
    //
    // MEDIDO: entre 26 e 35% da tinta é amarela nos ficheiros actuais.
    const a = await analisar(ic.caminho);
    expect(
      a.fraccaoAmarela,
      `${ic.caminho}: só ${(100 * a.fraccaoAmarela).toFixed(0)}% do desenho é o amarelo de ` +
        `"LÍQUEN". Ou a palavra saiu do ícone, ou o logótipo mudou de cores.`,
    ).toBeGreaterThan(0.15);
  });

  it.each(ICONES)("$caminho é opaco", async (ic) => {
    // O iOS compõe o ícone sobre PRETO. Um emblema verde com fundo
    // transparente ficaria verde sobre preto — 2,2:1 de contraste, ilegível.
    // O mesmo vale para o `maskable`, que o Android compõe sobre a cor do
    // sistema.
    const a = await analisar(ic.caminho);
    expect(a.transparentes, `${ic.caminho} tem ${a.transparentes} píxeis não opacos`).toBe(0);
  });

  it.each(ICONES)("$caminho assenta em fundo claro", async (ic) => {
    // O separador do Chrome e o cartão de sítio do Android são escuros. Um
    // ícone de fundo escuro desaparece lá dentro — era o caso do antigo,
    // rgb(8, 8, 8).
    const a = await analisar(ic.caminho);
    const luminancia = (a.fundo[0] + a.fundo[1] + a.fundo[2]) / 3;
    expect(luminancia, `${ic.caminho}: fundo rgb(${a.fundo.join(", ")})`).toBeGreaterThan(200);
  });

  it("o favicon.ico traz 16, 32 e 48", () => {
    // Sem isto, o browser que só sabe ler .ico fica com o tamanho errado
    // redimensionado por ele — e a redução dele não tem o engrossamento que o
    // gerador faz aos 16 px.
    const buf = readFileSync(join(RAIZ, "src/app/favicon.ico"));
    expect(buf.readUInt16LE(0), "campo reservado do cabeçalho ICO").toBe(0);
    expect(buf.readUInt16LE(2), "tipo: 1 = ícone").toBe(1);
    const n = buf.readUInt16LE(4);
    const lados: number[] = [];
    for (let i = 0; i < n; i++) {
      const e = 6 + 16 * i;
      lados.push(buf.readUInt8(e) || 256);
      const bytes = buf.readUInt32LE(e + 8);
      const inicio = buf.readUInt32LE(e + 12);
      expect(inicio + bytes, "uma entrada aponta para fora do ficheiro").toBeLessThanOrEqual(
        buf.length,
      );
      // Assinatura PNG: os browsers actuais lêem PNG dentro de ICO, e é assim
      // que o gerador os escreve.
      expect(buf.subarray(inicio, inicio + 8).toString("hex")).toBe("89504e470d0a1a0a");
    }
    expect(lados.sort((a, b) => a - b)).toEqual([16, 32, 48]);
  });
});
