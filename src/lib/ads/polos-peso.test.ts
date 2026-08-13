import { describe, it, expect } from "vitest";
import { statSync } from "node:fs";
import { join } from "node:path";
import { POLOS, ESTILOS } from "./polos";
import { heroKey } from "@/lib/hero-image-loader";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O HERÓI DE UMA PÁGINA PAGA TEM ORÇAMENTO DE BYTES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE É QUE ISTO EXISTE. Ao medir o LCP das landing pages num perfil de
 * telemóvel estrangulado (4G lento + CPU 4x), as páginas variavam entre 2,1 s e
 * 6,6 s. A diferença inteira eram BYTES DE IMAGEM: duas das fotografias
 * escolhidas eram tomadas de drone, que comprimem mal, e davam ficheiros de
 * 316 KB e 282 KB a 1536 px contra uma norma de 65 a 110 KB.
 *
 * A página não estava partida, e ninguém repararia: aparecia bem, só demorava
 * três vezes mais. Numa página que recebe tráfego PAGO isso custa duas vezes —
 * o visitante que desiste, e o Índice de Qualidade da Google, que inclui a
 * experiência da página de destino e faz subir o custo por clique de TODA a
 * campanha quando ela é lenta.
 *
 * O LIMITE. 100 KB para a versão de 1536 px, que é a que um telemóvel moderno
 * pede (390 pontos × 3 de densidade = 1170, arredondado para cima).
 *
 * O número não é arbitrário: mediu-se a relação entre o peso do herói e o LCP
 * estrangulado, e é quase linear, à volta de 19 ms por KB (5 ms de transferência
 * a 1,6 Mbps mais descodificação com o CPU a um quarto). Traduzido: cada 50 KB
 * a mais no herói é praticamente UM SEGUNDO a mais de espera no telemóvel de
 * quem clicou no anúncio. Três medições, três páginas:
 *
 *      65 KB → 2064 ms      92 KB → 2696 ms      113 KB → 2964 ms
 *
 * Com o limite a 100 KB os heróis ficam todos entre 46 e 84 KB.
 *
 * O QUE ISTO NÃO PROMETE. Não promete LCP abaixo de 2 s: no perfil
 * estrangulado há um piso de cerca de 2,1 s que vem do HTML, do CSS e do
 * JavaScript, e nenhuma escolha de fotografia o baixa. Ver `desempenho.md`.
 */

const LIMITE_KB = 100;
const LARGURA = 1536;

const HEROIS = [
  ...POLOS.map((p) => ({ dono: `polo "${p.slug}"`, src: p.hero })),
  ...ESTILOS.map((e) => ({ dono: `estilo "${e.slug}"`, src: e.hero })),
];

describe("orçamento de bytes dos heróis das landing pages", () => {
  it("não passa por vacuidade", () => {
    expect(HEROIS.length).toBeGreaterThanOrEqual(11);
  });

  it.each(HEROIS)("$dono: $src cabe no orçamento", ({ src }) => {
    const ficheiro = join(process.cwd(), "public", "_img", `${heroKey(src)}-${LARGURA}.webp`);
    let bytes: number;
    try {
      bytes = statSync(ficheiro).size;
    } catch {
      throw new Error(
        `${ficheiro} não existe. Corre \`node scripts/pregen-heroes.mjs\` — e se ` +
          "continuar a faltar, o caminho não está na lista de fotografias de largura total.",
      );
    }
    const kb = Math.round(bytes / 1024);
    expect(
      kb,
      `${src} pesa ${kb} KB a ${LARGURA} px (limite ${LIMITE_KB} KB). É o candidato a LCP ` +
        "de uma página que recebe tráfego pago: numa rede de telemóvel isto são segundos " +
        "de espera, e o Índice de Qualidade da Google faz subir o custo por clique de toda " +
        "a campanha por causa disso. Escolhe outra fotografia — as tomadas de drone e as " +
        "de muito detalhe fino comprimem mal.",
    ).toBeLessThanOrEqual(LIMITE_KB);
  });
});
