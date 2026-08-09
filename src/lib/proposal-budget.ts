import type { ProposalDoc } from "./proposal-doc";

/**
 * O ORÇAMENTO QUE SE SOMA SOZINHO.
 *
 * ── O problema ────────────────────────────────────────────────────────────
 * Palavras dela: «o Valor (sem IVA) é escrito à mão, desligado dos itens
 * acima. É uma fonte garantida de erro: altero um item e esqueço-me de
 * atualizar o total.»
 *
 * ── O que NÃO muda no PDF ─────────────────────────────────────────────────
 * As propostas reais da Líquen mostram o quadro «3. Orçamento Proposto» com a
 * coluna de preço EM BRANCO e um único «Valor Total» no fim — está assim na
 * proposta da Catarina Martins. Os preços por linha que aqui se introduzem são
 * INTERNOS: servem para somar e para avisar quando a soma e o total não batem
 * certo. O cliente continua a ver o que via.
 *
 * (Se um dia ela quiser os preços por linha impressos, é uma decisão de
 * negócio — o PDF passa a ler `budgetAmounts`. O sítio onde isso se decide é
 * `proposal-doc-pdf.ts`, não aqui.)
 *
 * ── Porque é que os preços são um array paralelo ──────────────────────────
 * `budgetItems` é `string[]` e é lido pelo desenhador do PDF, pelos documentos
 * já gravados e pelo resumo das propostas. Trocar-lhe a forma obrigava a migrar
 * tudo isso de uma vez. O array paralelo tem um risco conhecido — os índices
 * desalinharem — e é por isso que NINGUÉM mexe nos dois à mão: todas as
 * alterações passam pelos ajudantes deste ficheiro, e a leitura normaliza
 * sempre o comprimento. Um desalinhamento perde um preço; nunca parte nada.
 */

/** Uma linha do orçamento, já emparelhada com o seu preço. */
export interface LinhaOrcamento {
  item: string;
  /** `null` quando ainda não tem preço — que é diferente de custar zero. */
  preco: number | null;
}

/**
 * "1.500", "1500", "1 500 €", "1.500,50" → 1500 / 1500 / 1500 / 1500.5
 *
 * Ela escreve os valores de maneiras diferentes conforme a pressa, e a
 * missão pede que isto se normalize sozinho. As regras seguem o português:
 * a vírgula é o decimal, o ponto separa milhares.
 */
export function normalizarValor(texto: unknown): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  if (typeof texto !== "string") return null;
  // Fora tudo o que não é dígito, vírgula, ponto ou sinal: o «€», os espaços,
  // os espaços não separáveis que vêm de copiar e colar de uma folha de cálculo.
  const limpo = texto.replace(/[^\d,.\-]/g, "").trim();
  if (!limpo) return null;

  let normalizado: string;
  if (limpo.includes(",")) {
    // Há vírgula: ela é o decimal, e os pontos são milhares.
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else {
    const partes = limpo.split(".");
    // "1.500" é mil e quinhentos; "1.5" é um e meio. A diferença é o
    // comprimento do último grupo — três dígitos são um separador de milhares.
    // Sem esta regra, escrever "1.500" dava um total de 1,50 € e a proposta
    // saía com o preço de um café.
    const ultimoEhMilhar = partes.length > 1 && partes[partes.length - 1].length === 3;
    normalizado = partes.length === 1 || ultimoEhMilhar ? partes.join("") : limpo;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** Os preços, sempre com o mesmo comprimento que as linhas. */
export function precosDe(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetAmounts">,
): (number | null)[] {
  const n = doc.budgetItems?.length ?? 0;
  const guardados = doc.budgetAmounts ?? [];
  return Array.from({ length: n }, (_, i) => {
    const v = guardados[i];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  });
}

/** As linhas com os preços ao lado, que é como a interface as desenha. */
export function linhasDe(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetAmounts">,
): LinhaOrcamento[] {
  const precos = precosDe(doc);
  return (doc.budgetItems ?? []).map((item, i) => ({ item, preco: precos[i] }));
}

/**
 * Os valores adicionais que se conseguem LER, em euros.
 *
 * São texto livre no documento ("896,00 €", "895,00 € + IVA", "a definir",
 * "sob consulta") porque é assim que aparecem nas propostas verdadeiras. O que
 * tem um número conta; o resto não conta e também não estraga nada.
 */
function valoresDosExtras(extras: ProposalDoc["budgetExtras"]): number[] {
  return (extras ?? [])
    .map((e) => normalizarValor(e.valueText))
    .filter((p): p is number => p !== null);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO VALEM OS «VALORES ADICIONAIS»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «nós colocámos a deslocação da equipa Líquen, que são mil
 * quinhentos e cinquenta euros, e ele depois no total não soma o valor total
 * que nós estamos a colocar. Eu quero que o back office tenha inteligência
 * suficiente para ver os valores que nós colocamos em cada aba e faça a soma.»
 *
 * Tinha razão, e o problema era maior do que o ecrã: o total era também o
 * PREÇO FINAL do pedido, e é dele que saem a factura, o sinal de 30% e o saldo.
 * Uma deslocação de 1.550 € escrita como valor adicional saía da proposta para
 * o cliente, e não entrava em nada do que se cobra — o sinal era calculado sem
 * ela e a factura era emitida sem ela.
 *
 * Devolve `0` quando não há nenhum valor legível, que é o que permite somá-lo
 * sempre sem perguntar primeiro.
 */
export function somaDosExtras(extras: ProposalDoc["budgetExtras"]): number {
  const valores = valoresDosExtras(extras);
  if (valores.length === 0) return 0;
  return Math.round(valores.reduce((a, b) => a + b, 0) * 100) / 100;
}

/**
 * A soma dos itens mais os valores adicionais.
 *
 * `null` quando NÃO HÁ NENHUM preço — que é diferente de somar zero. Sem esta
 * distinção, uma proposta ainda por orçamentar dizia «a soma dos itens é
 * 0,00 €» e o aviso de desalinhamento aparecia sempre, em todas as propostas,
 * desde o primeiro segundo. Um aviso que toca sempre deixa de ser lido.
 */
export function somaDosItens(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetAmounts" | "budgetExtras">,
): number | null {
  const dosItens = precosDe(doc).filter((p): p is number => p !== null);
  const dosExtras = valoresDosExtras(doc.budgetExtras);
  const todos = [...dosItens, ...dosExtras];
  if (todos.length === 0) return null;
  // Arredondar ao cêntimo: somar floats dá 3249.9999999999995.
  return Math.round(todos.reduce((a, b) => a + b, 0) * 100) / 100;
}

/**
 * O total está desalinhado da soma?
 *
 * Devolve `null` quando não há nada a dizer — sem preços nenhuns, ou quando o
 * total bate certo. A tolerância de um cêntimo existe porque a soma é feita em
 * vírgula flutuante e o total foi escrito por uma pessoa.
 */
export function desalinhamento(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetAmounts" | "budgetExtras" | "totalAmount">,
  base: number,
): { soma: number; total: number; diferenca: number } | null {
  const soma = somaDosItens(doc);
  if (soma === null) return null;
  const diferenca = Math.round((base - soma) * 100) / 100;
  if (Math.abs(diferenca) <= 0.01) return null;
  return { soma, total: base, diferenca };
}

/** Sinal e saldo, a partir do total e da percentagem do sinal. */
export function sinalESaldo(
  total: number,
  percentagemSinal: number,
): { sinal: number; saldo: number } {
  const pct = Math.min(100, Math.max(0, percentagemSinal));
  const sinal = Math.round(total * (pct / 100) * 100) / 100;
  // O saldo é o RESTO e não `total × (100-pct)`: assim os dois somam sempre
  // exactamente o total, mesmo quando o arredondamento do sinal come um
  // cêntimo. Uma factura em que a soma das parcelas não dá o total é uma
  // conversa com o contabilista.
  return { sinal, saldo: Math.round((total - sinal) * 100) / 100 };
}

/** As duas leituras do mesmo número, para ela ver o que o cliente vai ver. */
export function asDuasFormas(
  base: number,
  taxa: number,
): {
  acrescer: { base: number; iva: number; total: number };
  incluido: { base: number; iva: number; total: number };
} {
  const cent = (n: number) => Math.round(n * 100) / 100;
  // "acresce": o número escrito é a base e o IVA soma-se por cima.
  const ivaAcrescer = cent(base * taxa);
  // "incluído": o número escrito JÁ traz o IVA lá dentro, e a base extrai-se.
  const baseIncluido = cent(base / (1 + taxa));
  return {
    acrescer: { base: cent(base), iva: ivaAcrescer, total: cent(base + ivaAcrescer) },
    incluido: { base: baseIncluido, iva: cent(base - baseIncluido), total: cent(base) },
  };
}

// ── Alterações às linhas ──────────────────────────────────────────────────
// Todas passam por aqui, e todas mexem nos DOIS arrays. É esta a única defesa
// contra o desalinhamento dos índices.

type ComOrcamento = Pick<
  ProposalDoc,
  "budgetItems" | "budgetAmounts" | "budgetCosts" | "budgetScales" | "budgetOpcional"
>;

/**
 * Os arrays paralelos que NÃO são os preços: custo, escala e marca de extra.
 *
 * Estão aqui porque acompanham a linha e têm de acompanhar também o que lhe
 * acontece. Enquanto só o preço era tratado, apagar a linha 2 de cinco deixava
 * os custos, as escalas e as marcas todas uma posição à frente — o custo da
 * iluminação passava a ser o do ramo da noiva, e a margem dessa linha saía de
 * outra linha qualquer. Não dava erro nenhum: dava números errados com bom
 * aspecto, que é a pior maneira de um orçamento correr mal.
 *
 * Cada um traz o valor com que uma linha nova nasce.
 */
const PARALELOS = [
  { campo: "budgetCosts", nascePor: null },
  { campo: "budgetScales", nascePor: null },
  { campo: "budgetOpcional", nascePor: false },
] as const;

/** Corta ou estica um array paralelo até ao tamanho das linhas. */
function alinhado(doc: ComOrcamento, campo: (typeof PARALELOS)[number]["campo"], omissao: unknown) {
  const n = doc.budgetItems?.length ?? 0;
  const guardado = (doc[campo] as unknown[] | undefined) ?? [];
  return Array.from({ length: n }, (_, i) => (i < guardado.length ? guardado[i] : omissao));
}

/** Aplica a mesma transformação a todos os arrays paralelos de uma vez. */
function comParalelos<T extends ComOrcamento>(
  doc: T,
  transformar: (valores: unknown[], nascePor: unknown) => unknown[],
): Partial<Record<(typeof PARALELOS)[number]["campo"], unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const { campo, nascePor } of PARALELOS) {
    // Só se escreve o que JÁ existia: um documento que nunca teve custos não
    // ganha um array de nulls por ter perdido uma linha, e continua a
    // serializar exactamente como serializava.
    if (doc[campo] === undefined) continue;
    out[campo] = transformar(alinhado(doc, campo, nascePor), nascePor);
  }
  return out;
}

export function adicionarLinha<T extends ComOrcamento>(doc: T, item = ""): T {
  return {
    ...doc,
    budgetItems: [...(doc.budgetItems ?? []), item],
    budgetAmounts: [...precosDe(doc), null],
    ...comParalelos(doc, (v, nascePor) => [...v, nascePor]),
  };
}

export function removerLinha<T extends ComOrcamento>(doc: T, i: number): T {
  return {
    ...doc,
    budgetItems: (doc.budgetItems ?? []).filter((_, j) => j !== i),
    budgetAmounts: precosDe(doc).filter((_, j) => j !== i),
    ...comParalelos(doc, (v) => v.filter((_, j) => j !== i)),
  };
}

export function definirItem<T extends ComOrcamento>(doc: T, i: number, item: string): T {
  return {
    ...doc,
    budgetItems: (doc.budgetItems ?? []).map((v, j) => (j === i ? item : v)),
    // Os preços ficam onde estão, mas NORMALIZADOS: um documento antigo sem
    // `budgetAmounts` ganha aqui o array do tamanho certo, em vez de o ganhar
    // pela primeira vez a meio de uma remoção.
    budgetAmounts: precosDe(doc),
  };
}

export function definirPreco<T extends ComOrcamento>(doc: T, i: number, preco: number | null): T {
  return {
    ...doc,
    budgetItems: [...(doc.budgetItems ?? [])],
    budgetAmounts: precosDe(doc).map((v, j) => (j === i ? preco : v)),
  };
}
