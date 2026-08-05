/**
 * PONTOS DE DECORAÇÃO — o que o casal escolhe no pedido de orçamento.
 *
 * ── Porque é que isto existe ──────────────────────────────────────────────
 * A proposta da Catarina Martins (18.09.2027) saiu com cinco pontos de
 * decoração e 6875 € + IVA. A resposta dela foi: «o valor excede um pouco o
 * nosso orçamento. Pode me atualizar o orçamento apenas para: Decoração
 * Cocktail / Seatting Plan e Decor Floral Seatting Plann / Design Floral e
 * Decoração Mesas.» Ou seja — a proposta foi desenhada, orçamentada e enviada
 * com dois pontos que o casal nunca quis, e o trabalho todo teve de ser
 * refeito.
 *
 * Perguntar isto no MOMENTO DO PEDIDO evita a ida e volta inteira: a proposta
 * nasce já com os pontos certos.
 *
 * ── Porque é que a lista é ESTA ───────────────────────────────────────────
 * Não foi inventada. São as linhas do quadro «3. Orçamento Proposto» das
 * propostas reais da Líquen — as mesmas palavras, para que o que o casal
 * marca aqui e o que aparece no orçamento sejam reconhecivelmente a mesma
 * coisa.
 *
 * ── O que NÃO está na lista, e porquê ─────────────────────────────────────
 * Iluminação, mobiliário, tenda, atoalhados e mesas/cadeiras estão de fora de
 * propósito: as «Condições de Reserva» das propostas listam-nos em NÃO
 * INCLUÍDO NO ORÇAMENTO. Oferecê-los aqui como se fossem decoração seria
 * prometer no formulário o que a proposta depois exclui — a pior espécie de
 * incoerência, porque só se descobre no fim.
 *
 * Catering, espaço, mesas e cadeiras também não: não é o que a Líquen faz.
 */

export interface PontoDecoracao {
  id: string;
  /** Rótulo para o casal, no formulário público. Curto e concreto. */
  pt: string;
  en: string;
  /**
   * A linha tal como aparece no quadro de orçamento das propostas. É esta que
   * o estúdio usa para semear o documento — com as palavras dela, não com as
   * minhas.
   */
  linhaOrcamento: string;
}

export const PONTOS_DECORACAO: PontoDecoracao[] = [
  {
    id: "cerimonia",
    pt: "Cerimónia",
    en: "Ceremony",
    linhaOrcamento: "Decoração Cerimónia",
  },
  {
    id: "cocktail",
    pt: "Cocktail",
    en: "Cocktail hour",
    linhaOrcamento: "Decoração Cocktail",
  },
  {
    id: "mesas",
    pt: "Mesas do jantar",
    en: "Dinner tables",
    linhaOrcamento: "Design Floral e Decoração Mesas",
  },
  {
    id: "seating",
    pt: "Seating plan",
    en: "Seating plan",
    linhaOrcamento: "Seating Plan e Decor Floral Seating Plan",
  },
  {
    id: "bar",
    pt: "Bar",
    en: "Bar",
    linhaOrcamento: "Decor Floral Bar",
  },
  {
    id: "bolo",
    pt: "Mesa do bolo e buffet",
    en: "Cake and buffet table",
    linhaOrcamento: "Apontamento Floral Mesa Buffet",
  },
  {
    id: "complementos",
    pt: "Ramo da noiva e lapelas",
    en: "Bridal bouquet and boutonnières",
    linhaOrcamento: "Complementos dos Noivos",
  },
];

/** Só os identificadores que conhecemos, pela ordem do catálogo. */
export function pontosConhecidos(ids: readonly string[]): PontoDecoracao[] {
  // Filtrar pelo catálogo (e não pela ordem de chegada) faz duas coisas de uma
  // vez: descarta um `id` inventado num pedido forjado, e garante que a ordem
  // mostrada é sempre a do evento — cerimónia, cocktail, jantar — e não a
  // ordem em que o casal foi carregando nas opções.
  const escolhidos = new Set(ids);
  return PONTOS_DECORACAO.filter((p) => escolhidos.has(p.id));
}

/** Os rótulos para o casal, na língua do pedido. */
export function rotularPontos(ids: readonly string[], locale: string): string[] {
  const en = locale.startsWith("en");
  return pontosConhecidos(ids).map((p) => (en ? p.en : p.pt));
}

/** As linhas de orçamento correspondentes, para semear a proposta. */
export function linhasDeOrcamento(ids: readonly string[]): string[] {
  return pontosConhecidos(ids).map((p) => p.linhaOrcamento);
}
