/**
 * JUNTAR DOIS RASCUNHOS CAMPO A CAMPO — achado n.º 6 da auditoria.
 *
 * Duas pessoas no mesmo rascunho, em campos diferentes: a Ana muda o «Local»,
 * a Catarina muda a «Hora» dez segundos depois. Até aqui ganhava a última
 * gravação INTEIRA — o «Local» da Ana desaparecia do rascunho principal, ia
 * para a gaveta do resgate (uma só, que a sobreposição seguinte substituía) e
 * a Ana continuava a ver o seu texto no ecrã como se estivesse gravado.
 *
 * Agora quem grava diz QUE campos mudou desde a última vez que falou com o
 * servidor (`campos`) e com que valor os tinha recebido (`base`). Com isso a
 * rota faz uma junção a três por campo de topo:
 *
 *   · campo que só eu mudei   → fica o meu;
 *   · campo que só o outro mudou → fica o dele (não é meu, não o toco);
 *   · campo que os DOIS mudaram → fica o meu (a última escrita continua a
 *     vencer, como sempre), e é só ESSE caso que vai para a gaveta e que avisa.
 *
 * Os campos são os de topo do documento (`clientNames`, `serviceGroups`,
 * `moodBoards`…): é a granularidade a que as pessoas trabalham — cada caixa do
 * estúdio é um campo —, e descer mais fundo (linha a linha dos serviços) seria
 * inventar intenções que ninguém exprimiu.
 *
 * Sem dependências de servidor: o estúdio usa {@link camposMudados} para
 * preparar o pedido, e a rota usa {@link juntarRascunhos} para o resolver.
 */

type Doc = Record<string, unknown>;

/** Igualdade de valores JSON. `undefined` e `null` contam como o mesmo — no
 *  fio, um campo ausente e um `null` são indistinguíveis. */
export function mesmoValor(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Que campos mudaram de `base` para `atual`, e com que valor estavam em `base`.
 * É o que o estúdio manda ao lado do documento.
 */
export function camposMudados(base: Doc, atual: Doc): { campos: string[]; base: Doc } {
  const campos: string[] = [];
  const antes: Doc = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(atual)])) {
    if (mesmoValor(base[k], atual[k])) continue;
    campos.push(k);
    if (base[k] !== undefined) antes[k] = base[k];
  }
  return { campos, base: antes };
}

/**
 * A junção a três. `noServidor` é o que está gravado agora; `meu` é o que
 * chega; `campos` e `base` são os de {@link camposMudados}.
 *
 * Devolve o documento a gravar e os campos em que as duas pessoas mexeram —
 * os únicos em que o trabalho de alguém foi de facto escrito por cima.
 */
export function juntarRascunhos(
  noServidor: Doc,
  meu: Doc,
  campos: readonly string[],
  base: Doc,
): { doc: Doc; conflitos: string[] } {
  const doc: Doc = { ...noServidor };
  /**
   * Um campo que FALTA do lado do servidor não é «a outra pessoa apagou-o».
   * O estúdio grava sempre o documento inteiro; um campo ausente é um rascunho
   * parcial ou de uma versão antiga. Partir só do que lá está fazia este
   * campo desaparecer da junção — e foi assim que um estúdio ficou sem
   * `serviceGroups` e o editor dos Serviços rebentou (visto no CI). Nesses,
   * fica o que chega.
   */
  for (const k of Object.keys(meu)) {
    if (noServidor[k] === undefined && meu[k] !== undefined) doc[k] = meu[k];
  }
  const conflitos: string[] = [];
  for (const k of campos) {
    const mexeramLa = !mesmoValor(noServidor[k], base[k]);
    if (mexeramLa && !mesmoValor(noServidor[k], meu[k])) conflitos.push(k);
    if (meu[k] === undefined) delete doc[k];
    else doc[k] = meu[k];
  }
  return { doc, conflitos };
}
