"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FILA DAS FOTOGRAFIAS PESADAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma célula sem miniatura puxa o ORIGINAL. Medido no estúdio de propostas, num
 * telemóvel a 1,6 Mbps com 24 células: **24 originais pedidos ao mesmo tempo,
 * 1099 KB cada, e a grelha que está no ecrã só completa aos 67,6 s**. Não é que
 * sejam lentas uma a uma: é que são vinte e quatro a repartir o mesmo canal, e
 * por isso acabam TODAS no fim em vez de acabarem umas primeiro. Com a fila, os
 * mesmos ficheiros: 13,3 MB em vez de 26,4, e a grelha visível aos 49,4 s.
 *
 * O `loading="lazy"` não trava nada disto: está medido na Biblioteca de Temas
 * que o navegador pediu as 60 na mesma. Quem trava é isto — deixa passar
 * `LIMITE_DE_PESADAS` de cada vez, pela ordem em que as células pedem vez, que é
 * a ordem da grelha e portanto a ordem por que ela olha.
 *
 * ── PORQUE É QUE VIVE FORA DO REACT ───────────────────────────────────────
 * O canal também é um só. Duas grelhas abertas ao mesmo tempo não têm o dobro
 * da linha, e um estado por componente daria a cada uma o seu tecto. Aqui é
 * módulo, e portanto é um tecto para o separador inteiro.
 *
 * ── DE ONDE VEIO ──────────────────────────────────────────────────────────
 * Do `Temas.tsx`/`ThemePicker.tsx`, onde este desenho está provado (a primeira
 * foto da Biblioteca passou de 26 s para 1,4 s). Sai para um ficheiro próprio
 * porque o estúdio de propostas precisava exactamente do mesmo, e uma terceira
 * cópia seria a terceira oportunidade de só uma delas ser corrigida.
 */

/**
 * Quantos originais em voo ao mesmo tempo.
 *
 * Três, o mesmo número da Biblioteca: com um só, uma foto encravada para a
 * grelha toda; com muitos, volta-se ao problema de repartir o canal. Três dá
 * margem de erro e continua a acabar a primeira depressa.
 */
const LIMITE_DE_PESADAS = 3;

/**
 * Se um download ficar pendurado — nem carrega nem falha, que é o que uma rede
 * móvel a cair faz — a vez volta ao fim deste tempo. Uma foto encravada não pode
 * fechar a grelha toda.
 */
export const ESPERA_MAXIMA_MS = 30_000;

interface Vez {
  arrancar: () => void;
  arrancou: boolean;
  largada: boolean;
}

const aEsperar: Vez[] = [];
let emVoo = 0;

function despachar() {
  while (emVoo < LIMITE_DE_PESADAS && aEsperar.length > 0) {
    const vez = aEsperar.shift();
    if (!vez || vez.largada) continue;
    vez.arrancou = true;
    emVoo += 1;
    vez.arrancar();
  }
}

/**
 * Pede vez para descarregar um original. Devolve a função de LARGAR a vez —
 * serve para os dois casos (acabou / desistiu) e é idempotente, porque a
 * desmontagem de uma célula e o `onLoad` da sua imagem chegam os dois.
 */
export function pedirVezDeImagemPesada(arrancar: () => void): () => void {
  const vez: Vez = { arrancar, arrancou: false, largada: false };
  aEsperar.push(vez);
  despachar();
  return () => {
    if (vez.largada) return;
    vez.largada = true;
    if (vez.arrancou) {
      emVoo = Math.max(0, emVoo - 1);
      despachar();
      return;
    }
    const i = aEsperar.indexOf(vez);
    if (i >= 0) aEsperar.splice(i, 1);
  };
}

/** Só para os testes: a fila é de módulo e sobrevive entre casos. */
export function limparFilaDeImagens(): void {
  aEsperar.length = 0;
  emVoo = 0;
}
