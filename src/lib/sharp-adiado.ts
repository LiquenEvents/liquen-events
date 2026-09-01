import "server-only";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O `sharp` CARREGA-SE À PRIMEIRA VEZ QUE FOR PRECISO, E UMA VEZ SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela sobre a proposta que chega ao casal: «demora imenso tempo a
 * carregar (…) quero mesmo tudo super rápido».
 *
 * O `sharp` não é uma biblioteca de JavaScript: é um vínculo nativo que abre o
 * libvips com `dlopen` — oito megabytes de biblioteca partilhada. MEDIDO neste
 * contentor, com o disco já quente, três vezes seguidas: 274, 177 e 223 ms só
 * para o `import` devolver. Num contentor acabado de nascer é mais.
 *
 * Era um `import` de topo em dois ficheiros, e por isso pagava-se em TODOS os
 * arranques a frio das funções que os importam — mesmo nas que nunca iam
 * fabricar nada. É o caso normal, não a excepção:
 *
 *   • A rota que serve uma fotografia da proposta só precisa do `sharp` quando
 *     a derivada de 1200 px ainda NÃO existe. A partir da segunda visita — o
 *     estado de todas as propostas que ela já enviou — a derivada está no
 *     Storage e a rota limita-se a descarregá-la.
 *   • O `avaliarCabecalho` do `proposal-storage` é a confirmação de um
 *     carregamento no back office. Nunca corre no caminho do casal, e ainda
 *     assim arrastava o módulo para dentro de tudo o que importa aquele
 *     ficheiro.
 *
 * O `sharp` continua lá e faz o mesmo trabalho. O que muda é QUANDO é
 * carregado.
 *
 * ── PORQUE É QUE ISTO É UM MÓDULO E NÃO UM `await import` EM CADA SÍTIO ───
 *
 * Por causa de um defeito que só apareceu com os testes a correr, e que vale a
 * pena deixar escrito porque a mesma armadilha está à espera de quem repetir o
 * padrão à mão.
 *
 * A confirmação de um carregamento avalia os cabeçalhos OITO DE CADA VEZ. Com
 * um `await import("sharp")` solto lá dentro, eram oito `import()` disparados
 * no mesmo instante — e num teste que faz `vi.resetModules()` antes de cada
 * caso, uns resolviam contra o registo já reposto e outros contra o duplo.
 * MEDIDO: na mesma execução, umas chamadas receberam o duplo do teste e outras
 * o `sharp` verdadeiro, que rejeitou trinta fotografias boas por «formato
 * inválido». Em produção a mesma corrida não rejeita nada, mas abre o libvips
 * mais do que uma vez.
 *
 * Uma promessa guardada resolve as duas coisas: há UM `import()`, e todas as
 * chamadas seguintes recebem a mesma promessa já cumprida. É também o que
 * torna isto barato numa fila de vinte e cinco derivadas.
 *
 * `typeof import("sharp")` é uma posição de TIPO: desaparece na compilação e
 * não carrega módulo nenhum.
 */
let modulo: Promise<typeof import("sharp").default> | null = null;

/** O `sharp`, carregado à primeira chamada e reaproveitado a seguir. */
export function oSharp(): Promise<typeof import("sharp").default> {
  modulo ??= import("sharp").then((m) => m.default);
  return modulo;
}
