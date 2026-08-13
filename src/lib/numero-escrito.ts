/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SE ESCREVEU DÁ UM NÚMERO? E SE NÃO DÁ, O QUE É QUE SE FAZ?
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Dois ecrãs do back office tinham o mesmo defeito, com a mesma forma: ela
 * escrevia um valor que o programa não conseguia usar, carregava em guardar, e
 * o que ficava gravado não era o que ela tinha escrito — sem que nada lho
 * dissesse. Nas definições da deslocação, o valor era deitado fora em silêncio
 * e o ecrã respondia «Guardado»; no painel do pedido, o servidor recusava e
 * levava à frente tudo o resto da mesma gravação.
 *
 * A regra é uma só, e vive aqui: um número escrito ou É um número que serve, e
 * então segue, ou NÃO É, e então a frase que o diz aparece no campo — antes do
 * clique, e a dizer o que fazer, não a citar o esquema.
 *
 * ── PORQUE É QUE AS FRASES ESTÃO AQUI E NÃO NO ECRÃ ───────────────────────
 * Uma frase por sítio onde se escreve um número é o caminho garantido para
 * três maneiras diferentes de dizer a mesma coisa. Quem chama passa o que
 * distingue o campo — o limite e um exemplo do que lá cabe — e recebe a frase
 * já feita.
 */

export interface LimitesDoNumero {
  /** O mínimo que o servidor aceita. */
  min?: number;
  /** O máximo que o servidor aceita. */
  max?: number;
  /** Convidados são gente: 12,5 não existe. */
  inteiro?: boolean;
  /**
   * Um campo que pode ficar em branco — e aí não se grava nada nele. Só faz
   * sentido onde o vazio é um estado legítimo do PEDIDO (um pedido que entrou
   * sem número de convidados), nunca onde o valor é preciso para uma conta.
   */
  vazioVale?: boolean;
  /** Como se chama o que lá se escreve, para a frase falar da coisa certa. */
  nome?: string;
  /** Um valor plausível, para a frase mostrar em vez de explicar. */
  exemplo?: string;
}

/**
 * O que se leu. Em `valor`, `null` significa «ficou em branco, e o branco era
 * permitido» — não há nada a gravar neste campo, o que é diferente de zero.
 */
export type LeituraDeNumero = { ok: true; valor: number | null } | { ok: false; porque: string };

/** Os números aparecem nas frases como ela os escreve: vírgula decimal. */
const comoSeEscreve = (n: number) => String(n).replace(".", ",");

/**
 * Lê um número escrito à portuguesa (vírgula decimal) e diz o que fazer quando
 * não dá.
 *
 * O que NÃO é aceite, de propósito: unidades coladas ao valor («1,72 €»),
 * porque aceitá-las obrigava a adivinhar quais — e adivinhar em cima de um
 * preço que multiplica quilómetros é como se chega a um valor errado sem
 * ninguém reparar. Diz-se o que fazer, e são dois toques.
 */
export function lerNumero(escrito: string, limites: LimitesDoNumero = {}): LeituraDeNumero {
  const { min, max, inteiro, vazioVale, nome, exemplo } = limites;
  const oQue = nome ? `o ${nome}` : "um valor";
  const porExemplo = exemplo ? ` — por exemplo ${exemplo}` : "";

  const limpo = escrito.trim();
  if (limpo === "") {
    if (vazioVale) return { ok: true, valor: null };
    return { ok: false, porque: `Escreve ${oQue}${porExemplo}. Em branco não há o que guardar.` };
  }

  // Uma vírgula (só uma) é o ponto decimal de quem escreve em português.
  const n = Number(limpo.replace(",", "."));
  if (!Number.isFinite(n)) {
    return {
      ok: false,
      porque: `Escreve só o número, com vírgula decimal${porExemplo}.`,
    };
  }
  if (inteiro && !Number.isInteger(n)) {
    return { ok: false, porque: `Escreve um número inteiro${porExemplo}.` };
  }
  if (min !== undefined && n < min) {
    return {
      ok: false,
      porque:
        min === 0
          ? "Não pode ser negativo — escreve 0 ou mais."
          : `Não pode ser menor que ${comoSeEscreve(min)}.`,
    };
  }
  if (max !== undefined && n > max) {
    return {
      ok: false,
      porque: `Não pode ser maior que ${comoSeEscreve(max)} — confirma o valor.`,
    };
  }
  return { ok: true, valor: n };
}
