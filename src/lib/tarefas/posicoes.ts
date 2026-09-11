/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ORDEM QUE ELA ARRUMOU À MÃO, GUARDADA — fase 09
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O arrasto da fase 09 reordena uma lista de ids (é o que o
 * `reordenarManualmente` de `./listas` faz, e continua a ser). Este ficheiro
 * responde à outra metade da pergunta: **o que é que se grava**.
 *
 * ── PORQUE É QUE A POSIÇÃO NÃO É O ÍNDICE ─────────────────────────────────
 *
 * Porque com o índice, arrastar a última linha para o topo reescreve a lista
 * INTEIRA: quarenta tarefas, quarenta pedidos `PATCH`, quarenta linhas a
 * mudarem de `updated_at` — e quarenta oportunidades de uma delas chocar com
 * quem estiver a mexer na mesma tarefa do outro lado (ver o `touch` do
 * `tasks-store`).
 *
 * As posições nascem espaçadas (1024, 2048, 3072…) e uma tarefa largada entre
 * duas outras fica com a MÉDIA das vizinhas. O caso normal — largar uma linha
 * entre duas — custa UMA gravação, independentemente da distância percorrida.
 *
 * ── E QUANDO O ESPAÇO ACABA ───────────────────────────────────────────────
 *
 * Uma média entre dois números acaba por esgotar a precisão do vírgula
 * flutuante: partir 1024 ao meio vezes sem conta chega, ao fim de umas
 * cinquenta largadas no MESMO intervalo, a uma diferença que o `double` já não
 * distingue. Aí — e só aí — renumera-se a lista toda, que é a operação cara
 * feita uma vez em vez de ser feita sempre.
 *
 * O mesmo caminho serve o primeiro arrasto de todos, quando nenhuma tarefa tem
 * posição nenhuma: não há vizinhos de onde tirar uma média, e a lista ganha a
 * escada de raiz.
 *
 * Nada aqui conhece o React, o `fetch` ou a base de dados: entra a ordem nova e
 * o que cada tarefa tem hoje, sai a lista de gravações a fazer. É o que permite
 * testar o caso caro sem simular um arrasto.
 */

/** O degrau entre duas posições consecutivas quando a lista é numerada de raiz. */
export const ESPACO = 1024;

/**
 * A distância mínima entre duas posições vizinhas para ainda valer a pena
 * dividi-la ao meio.
 *
 * Um milésimo: acima disto a média ainda dá um número que o `double` distingue
 * com folga de várias ordens de grandeza, e abaixo estamos a caminho do sítio
 * onde `(a + b) / 2` devolve `a`. Renumerar é barato uma vez; devolver uma
 * posição igual à do vizinho é uma ordem que se desfaz sozinha ao recarregar.
 */
export const GAP_MINIMO = 1 / 1024;

/** Uma gravação a fazer: esta tarefa passa a ter esta posição. */
export interface Reposicionamento {
  id: string;
  posicao: number;
}

/** A escada de raiz: 1024, 2048, 3072… pela ordem que está no ecrã. */
function numerarDeRaiz(
  ordem: readonly string[],
  posicaoDe: (id: string) => number | undefined,
): Reposicionamento[] {
  return (
    ordem
      .map((id, i) => ({ id, posicao: (i + 1) * ESPACO }))
      // Quem já está no número certo não se grava. Numa lista acabada de
      // renumerar isto é a diferença entre uma gravação e quarenta.
      .filter((r) => posicaoDe(r.id) !== r.posicao)
  );
}

/**
 * As gravações mínimas para que `ordem` seja a ordem GUARDADA, depois de
 * `mover` ter sido largada no sítio onde está.
 *
 * `ordem` é a ordem NOVA e completa — o que está à frente dela depois do
 * arrasto. `posicaoDe` diz o que cada tarefa tem hoje (`undefined` = nunca foi
 * arrumada à mão).
 *
 * Devolve uma lista vazia quando não há nada a gravar.
 */
export function posicoesDepoisDeMover(
  ordem: readonly string[],
  posicaoDe: (id: string) => number | undefined,
  mover: string,
): Reposicionamento[] {
  const onde = ordem.indexOf(mover);
  if (onde < 0) return [];

  /* A média só é de confiança se o resto da lista JÁ estiver guardado por esta
     ordem. Se faltar uma posição, ou se duas estiverem trocadas em relação ao
     que se vê, gravar só a que se moveu deixava a lista a discordar de si
     própria no recarregamento seguinte — que é precisamente o defeito que
     guardar a ordem existe para não ter. */
  let anteriorValida = -Infinity;
  for (const id of ordem) {
    if (id === mover) continue;
    const p = posicaoDe(id);
    if (typeof p !== "number" || !Number.isFinite(p) || p <= anteriorValida) {
      return numerarDeRaiz(ordem, posicaoDe);
    }
    anteriorValida = p;
  }

  const antes = onde > 0 ? posicaoDe(ordem[onde - 1]) : undefined;
  const depois = onde < ordem.length - 1 ? posicaoDe(ordem[onde + 1]) : undefined;

  let nova: number;
  if (antes !== undefined && depois !== undefined) {
    if (depois - antes < GAP_MINIMO) return numerarDeRaiz(ordem, posicaoDe);
    nova = (antes + depois) / 2;
  } else if (depois !== undefined) {
    // Foi para o TOPO. Um degrau abaixo do primeiro, enquanto houver espaço até
    // ao zero; a meio caminho do zero quando já não houver. O esquema recusa
    // posições negativas, e com razão: o zero é o princípio da lista.
    nova = depois > ESPACO ? depois - ESPACO : depois / 2;
    if (nova < GAP_MINIMO) return numerarDeRaiz(ordem, posicaoDe);
  } else if (antes !== undefined) {
    // Foi para o FIM. Aqui nunca falta espaço.
    nova = antes + ESPACO;
  } else {
    // Sozinha na lista.
    nova = ESPACO;
  }

  return posicaoDe(mover) === nova ? [] : [{ id: mover, posicao: nova }];
}

/**
 * A ordem guardada destas tarefas: primeiro as que ela arrumou à mão, pela
 * posição; depois as que nunca foram arrumadas.
 *
 * ── PORQUE É QUE QUEM NÃO TEM POSIÇÃO FICA NO TOPO ────────────────────────
 *
 * É a mesma regra do `ordenarTarefas` com `manual` — e tem de ser a mesma, ou
 * a lista mudava de ordem entre o que está guardado e o que se desenha. A razão
 * está lá escrita: uma tarefa acabada de criar aterra no topo, que é onde a
 * linha de escrever a pôs; no fim de uma lista de quarenta era uma tarefa que
 * se escreve e se perde de vista.
 */
export function ordemGuardada(tarefas: readonly { id: string; posicao?: number }[]): string[] {
  const comPosicao: { id: string; posicao: number }[] = [];
  const sem: string[] = [];
  for (const t of tarefas) {
    if (typeof t.posicao === "number" && Number.isFinite(t.posicao)) {
      comPosicao.push({ id: t.id, posicao: t.posicao });
    } else {
      sem.push(t.id);
    }
  }
  comPosicao.sort((a, b) => a.posicao - b.posicao);
  return [...sem, ...comPosicao.map((t) => t.id)];
}
