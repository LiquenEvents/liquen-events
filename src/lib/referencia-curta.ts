/**
 * ════════════════════════════════════════════════════════════════════════════
 * A REFERÊNCIA DE UM PEDIDO, EM TAMANHO DE SE LER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um pedido chama-se `LIQ-MT7CWVWU-C4BFD3877E978CFF`. Isso é um nome de
 * máquina: trinta caracteres de que só a ponta interessa a quem os lê, e que
 * numa coluna de tabela ocupa mais espaço do que o nome do casal.
 *
 * A casa já decidiu isto duas vezes, e sempre no mesmo sentido:
 *
 *   · na lista de pedidos, a referência SAIU («retira a referência» — o que
 *     decide numa linha de lista é o valor e a data);
 *   · no painel do pedido, ficou ENCURTADA, com a forma inteira no `title`,
 *     porque quando se precisa dela é para a ler letra a letra ao telefone.
 *
 * Esta função é essa segunda decisão, tirada de dentro do `AdminClient` para
 * poder valer em mais do que um sítio. Andava lá privada, e a tabela de
 * Contratos — que mostra a referência inteira numa coluna — nunca lhe chegou.
 *
 * O que se corta é o MEIO e nunca o princípio nem o fim: o princípio diz de
 * que casa é e quando foi criado, o fim é o que distingue dois pedidos do
 * mesmo dia. Cortar por qualquer uma das pontas fazia duas referências
 * diferentes parecerem a mesma.
 */
export function referenciaCurta(id: string): string {
  const partes = id.split("-");
  const ultimos4 = id.slice(-4);
  if (partes.length >= 2) return `${partes[0]}-${partes[1]}…${ultimos4}`;
  return id.length > 10 ? `${id.slice(0, 8)}…${ultimos4}` : id;
}
