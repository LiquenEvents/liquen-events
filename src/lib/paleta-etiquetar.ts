import { idDaPaleta, paletaDaCor } from "./paleta-da-cor";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUE FOTOS RECEBEM A ETIQUETA DE PALETA, E QUAIS NÃO SE TOCA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A parte pura da aplicação automática: recebe o que se sabe das fotografias e
 * devolve a lista de etiquetas a criar. Não fala com a base de dados, não
 * escreve nada — é por isso que se pode testar.
 *
 * ── A REGRA QUE MANDA: NUNCA POR CIMA DE QUEM DECIDIU ─────────────────────
 * Se uma fotografia JÁ tem uma etiqueta de paleta, não se lhe toca. Seja ela
 * qual for e tenha vindo de onde tiver vindo.
 *
 * Isto é mais importante do que parece. Uma fotografia de um ramo branco sobre
 * uma parede de barro pode ser «branco» pelos píxeis e «terracotta» para quem
 * a vai usar numa proposta — e quem tem razão é quem a vai usar. O automático
 * existe para pôr uma etiqueta onde não havia nenhuma, não para discutir com
 * ninguém.
 *
 * A consequência prática: correr isto duas vezes não muda nada da segunda vez,
 * e correr isto depois de ela corrigir à mão não desfaz a correcção. É o que
 * torna seguro correr sempre que apetecer.
 *
 * ── E AS FOTOS SEM COR ────────────────────────────────────────────────────
 * Ficam de fora, e ficam CONTADAS. São as carregadas antes de a cor existir;
 * um relatório que as somasse ao «nada a fazer» escondia o trabalho que falta.
 */

/** O que se sabe de uma foto, para esta decisão. */
export interface FotoParaPaleta {
  path: string;
  /** A cor dominante, `#rrggbb`, quando já foi calculada. */
  cor?: string | null;
}

export interface PlanoDePaletas {
  /** As etiquetas a criar: uma por foto. */
  aAplicar: Array<{ path: string; etiquetaId: string }>;
  /** Já tinham paleta — não se toca. */
  jaTinham: number;
  /** Sem cor conhecida: não dá para decidir, e é preciso saber quantas são. */
  semCor: number;
  /** Tinham cor, mas ilegível (nunca deve acontecer; conta-se na mesma). */
  corIlegivel: number;
}

/**
 * O plano, sem escrever nada.
 *
 * `jaComPaleta` é o conjunto dos caminhos que já têm QUALQUER etiqueta do eixo
 * paleta — quem chama constrói-o de uma vez, para isto não ter de perguntar à
 * base de dados uma vez por fotografia.
 */
export function planearPaletas(
  fotos: readonly FotoParaPaleta[],
  jaComPaleta: ReadonlySet<string>,
): PlanoDePaletas {
  const plano: PlanoDePaletas = { aAplicar: [], jaTinham: 0, semCor: 0, corIlegivel: 0 };

  for (const foto of fotos) {
    if (jaComPaleta.has(foto.path)) {
      plano.jaTinham += 1;
      continue;
    }
    if (!foto.cor) {
      plano.semCor += 1;
      continue;
    }
    const paleta = paletaDaCor(foto.cor);
    if (!paleta) {
      plano.corIlegivel += 1;
      continue;
    }
    plano.aAplicar.push({ path: foto.path, etiquetaId: idDaPaleta(paleta) });
  }

  return plano;
}

/**
 * O plano dito por palavras, para o relatório da migração e para o ecrã.
 *
 * Diz sempre as quatro contas, incluindo as que são zero: «0 sem cor» é uma
 * informação (a biblioteca está toda medida), e não uma linha a mais.
 */
export function resumoDoPlano(p: PlanoDePaletas): string {
  return [
    `${p.aAplicar.length} a etiquetar`,
    `${p.jaTinham} já tinham`,
    `${p.semCor} sem cor conhecida`,
    `${p.corIlegivel} com cor ilegível`,
  ].join(" · ");
}
