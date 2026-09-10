import { ordenar } from "./guiao-do-dia";
import type { TimelineItem } from "./types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * COMO A FOLHA SE AGRUPA — UMA REGRA SÓ, PARA O ECRÃ, O PAPEL E O PDF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A timeline sai agora em três sítios: a pré-visualização ao lado do editor
 * («quero que dê para ir vendo ao lado como está a ficar, para não termos que
 * estar sempre a fazer download»), a folha que sai na impressora, e o PDF.
 *
 * As três têm de mostrar o MESMO. Não por elegância: uma pré-visualização que
 * agrupa de maneira diferente do ficheiro é pior do que não haver
 * pré-visualização nenhuma — ela confia no que vê, manda imprimir, e a folha
 * que sai é outra.
 *
 * Por isso as duas regras de agrupamento vivem aqui, puras, sem React e sem
 * `pdf-lib`. Quem desenha decide as cores e as larguras; o QUE se desenha
 * decide-se uma vez.
 *
 * ── AS DUAS REGRAS, QUE VÊM DA FOLHA DELA ────────────────────────────────
 *
 *  1. **A hora escreve-se uma vez.** Às 10h30 acontecem cinco coisas, e as
 *     cinco vivem na mesma linha da tabela — a hora à esquerda, as cinco
 *     descrições empilhadas na célula do meio. Numa lista seriam cinco linhas
 *     com a hora repetida, e a coluna da esquerda passava a parecer cinco
 *     momentos diferentes.
 *
 *  2. **O local escreve-se quando MUDA.** «Fitapreta» às 08h30 e «Governador»
 *     às 14h30; entre as duas, nada. Uma coluna cheia de «Fitapreta» não diz
 *     nada; uma coluna com duas palavras em três páginas diz exactamente onde
 *     o dia troca de sítio.
 */

/** Uma linha da folha: uma HORA, e tudo o que acontece nela. */
export interface BlocoDaFolha {
  /** «08h30». Já no formato da folha dela. */
  hora: string;
  /** Os locais que MUDARAM dentro deste bloco. Vazio quando não mudou nenhum. */
  locais: string[];
  /** As descrições, por ordem. Uma por momento. */
  descricoes: string[];
  /** As notas dos momentos que as têm. */
  notas: string[];
}

/** «08:30» → «08h30», que é como a folha dela escreve as horas. */
export function horaDaFolha(hhmm: string): string {
  const encontro = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!encontro) return hhmm.trim();
  return `${encontro[1].padStart(2, "0")}h${encontro[2]}`;
}

/**
 * Os momentos de um dia, agrupados como a folha dela os agrupa.
 *
 * Ordenados pelo `ordenar` do guião — que é quem sabe que uma hora antes das
 * 05:00 é o FIM do dia e não o princípio — e depois juntos por hora.
 */
export function blocosDaFolha(momentos: readonly TimelineItem[]): BlocoDaFolha[] {
  const blocos: BlocoDaFolha[] = [];
  let atual: BlocoDaFolha | null = null;
  let localAnterior = "";

  for (const m of ordenar(momentos)) {
    const hora = horaDaFolha(m.time);
    if (!atual || atual.hora !== hora) {
      atual = { hora, locais: [], descricoes: [], notas: [] };
      blocos.push(atual);
    }
    const local = (m.local ?? "").trim();
    if (local && local !== localAnterior) {
      atual.locais.push(local);
      localAnterior = local;
    }
    atual.descricoes.push(m.title);
    const nota = (m.notas ?? "").trim();
    if (nota) atual.notas.push(nota);
  }

  return blocos;
}
