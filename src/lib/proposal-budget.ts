import { DEFAULT_VAT_RATE, resolveProposalMoney, type ProposalDoc } from "./proposal-doc";
import { round2, splitSinal } from "./money";

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

/**
 * O documento visto por quem SOMA: as linhas, os adicionais, e os campos que
 * dizem como o total se lê.
 *
 * Os campos do total são opcionais porque uma proposta a meio de ser escrita
 * ainda não tem total nenhum — e nesse caso a leitura cai no que
 * `resolveProposalMoney` decide por omissão, que é o mesmo que o PDF fará.
 */
export type DocComLinhasETotal = Pick<
  ProposalDoc,
  "budgetItems" | "budgetAmounts" | "budgetExtras"
> &
  Partial<
    Pick<
      ProposalDoc,
      "totalAmount" | "totalVatMode" | "vatRate" | "totalText" | "totalEstimatedText"
    >
  >;

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
  return round2(valores.reduce((a, b) => a + b, 0));
}

/**
 * O que a PRÓPRIA linha declara sobre o IVA, ou `null` quando não declara nada.
 *
 * Não é o `detectVatMode` do `proposal-doc`: esse responde sempre, e responde
 * «incluído» quando o texto está calado — o que é a leitura certa para o total
 * escrito à mão e a errada para uma linha, porque uma linha calada não está a
 * dizer «com IVA», está a não dizer nada. A diferença entre «não diz» e «diz
 * incluído» é o que permite cair para o modo do DOCUMENTO em vez de adivinhar.
 */
function modoDeIvaDaLinha(texto: string | undefined): "acrescer" | "incluido" | null {
  if (!texto) return null;
  const t = texto.toLowerCase();
  if (/\+\s*iva|mais\s+iva|acresce\s+(?:o\s+)?iva|iva\s+n[aã]o\s+inclu|s\/\s*iva|sem\s+iva/.test(t))
    return "acrescer";
  if (/iva\s+inclu|c\/\s*iva|com\s+iva/.test(t)) return "incluido";
  return null;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO É QUE OS ADICIONAIS ACRESCENTAM À BASE — LENDO O IVA QUE ELES DIZEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O campo do total no estúdio chama-se «Preço final (SEM IVA)»: é a base
 * tributável, e é dela que saem a factura, o sinal e o saldo. Os adicionais são
 * texto livre, e nas propostas verdadeiras aparecem das duas maneiras —
 * «895,00 € + IVA» e «895,00 €».
 *
 * A soma tratava-as exactamente da mesma maneira: pegava no número e somava-o à
 * base. Para «895,00 € + IVA» isso está certo — o texto diz que 895 é líquido.
 * Para «895,00 €» numa proposta que se lê COM IVA, está errado: a linha promete
 * ao casal que aquilo custa 895, e o total sobe 895 de base, ou seja 1.101 do
 * que eles vão pagar. A linha e o total dizem números diferentes sobre a mesma
 * coisa, no mesmo documento.
 *
 * A regra, por ordem:
 *   1. o que a linha DIZ ganha sempre («+ IVA» ⇒ líquido, «IVA incluído» ⇒
 *      bruto). É a intenção escrita por quem a escreveu;
 *   2. uma linha calada segue o modo do DOCUMENTO — é a leitura que o casal vai
 *      fazer, porque é a que está impressa ao lado do total;
 *   3. sem contexto nenhum, líquido, que é o comportamento de sempre.
 *
 * Devolve SEMPRE base (sem IVA), para poder ser somado ao campo do total sem
 * mais conversões.
 */
export function somaDosExtrasSemIva(
  extras: ProposalDoc["budgetExtras"],
  contexto?: { mode?: "acrescer" | "incluido"; vatRate?: number },
): number {
  const taxa =
    typeof contexto?.vatRate === "number" && contexto.vatRate >= 0
      ? contexto.vatRate
      : DEFAULT_VAT_RATE;
  // Soma-se tudo em vírgula flutuante e arredonda-se UMA vez, no fim.
  // Arredondar cada linha ao converter deixava a soma de três adicionais a
  // divergir da conversão da soma — e é a soma que vai para o total.
  const total = (extras ?? []).reduce((acc, e) => {
    const valor = normalizarValor(e.valueText);
    if (valor === null) return acc;
    const modo = modoDeIvaDaLinha(e.valueText) ?? contexto?.mode ?? "acrescer";
    // Bruto → base. Nunca o contrário: o que se soma é sempre a base.
    return acc + (modo === "incluido" ? valor / (1 + taxa) : valor);
  }, 0);
  return round2(total);
}

/**
 * A soma dos itens mais os valores adicionais.
 *
 * `null` quando NÃO HÁ NENHUM preço — que é diferente de somar zero. Sem esta
 * distinção, uma proposta ainda por orçamentar dizia «a soma dos itens é
 * 0,00 €» e o aviso de desalinhamento aparecia sempre, em todas as propostas,
 * desde o primeiro segundo. Um aviso que toca sempre deixa de ser lido.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A SOMA É SEM IVA, PORQUE É COM A BASE QUE ELA VAI SER COMPARADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os preços por LINHA são sempre líquidos — são campos numéricos, sem IVA
 * nenhum escrito ao lado. Os ADICIONAIS não: são texto livre, e nas propostas
 * verdadeiras aparecem «895,00 € + IVA» e «895,00 €», que querem dizer coisas
 * diferentes. Esta soma pegava nos dois e somava-os tal e qual.
 *
 * O estrago aparecia do outro lado: quem lê esta soma compara-a com a BASE da
 * proposta (`desalinhamento`, o painel de progresso, o aviso ao lado das
 * linhas). Numa proposta que se lê COM IVA, uma deslocação escrita «1.550,00 €»
 * entrava na soma por 1.550 de líquido quando o casal só paga 1.550 no total —
 * 1.260,16 de base. A soma ficava 289,84 € acima da base e o aviso «o total não
 * bate com a soma das linhas» acendia numa proposta que estava certa.
 *
 * Agora o adicional passa por {@link somaDosExtrasSemIva}, que lê o que a
 * própria linha declara e, quando ela está calada, segue o modo do DOCUMENTO.
 * Os dois lados da comparação ficam na mesma unidade — que é a única maneira de
 * a comparação querer dizer alguma coisa.
 *
 * O que NÃO se decide aqui: se os adicionais estão DENTRO do total ou ACRESCEM
 * a ele. Continuam a entrar na soma, exactamente como entravam. Essa pergunta
 * está em aberto com a dona do negócio (fim de `PROPOSTAS-O-QUE-MELHORAR.md`) e
 * não é um problema de aritmética.
 */
export function somaDosItens(doc: DocComLinhasETotal): number | null {
  const dosItens = precosDe(doc).filter((p): p is number => p !== null);
  const extrasLegiveis = valoresDosExtras(doc.budgetExtras);
  if (dosItens.length === 0 && extrasLegiveis.length === 0) return null;

  // O mesmo modo e a mesma taxa por que o total é lido — sem isso, os dois
  // lados da comparação saem de leituras diferentes do mesmo documento.
  const { mode, vatRate } = resolveProposalMoney(doc);
  const dosExtras = somaDosExtrasSemIva(doc.budgetExtras, { mode, vatRate });
  // Arredondar ao cêntimo: somar floats dá 3249.9999999999995.
  return round2(dosItens.reduce((a, b) => a + b, 0) + dosExtras);
}

/**
 * O total está desalinhado da soma?
 *
 * Devolve `null` quando não há nada a dizer — sem preços nenhuns, ou quando o
 * total bate certo. A tolerância de um cêntimo existe porque a soma é feita em
 * vírgula flutuante e o total foi escrito por uma pessoa.
 */
export function desalinhamento(
  doc: DocComLinhasETotal,
  base: number,
): { soma: number; total: number; diferenca: number } | null {
  const soma = somaDosItens(doc);
  if (soma === null) return null;
  const diferenca = round2(base - soma);
  if (Math.abs(diferenca) <= 0.01) return null;
  return { soma, total: base, diferenca };
}

/**
 * Sinal e saldo, a partir do total e da percentagem do sinal.
 *
 * Delega em {@link splitSinal}, e é de propósito que não repete a conta: eram
 * duas implementações da mesma divisão — esta e a de `money.ts` — e enquanto
 * foram duas podiam arredondar para lados diferentes. O sinal que o estúdio
 * mostra tem de ser, ao cêntimo, o sinal que a factura emite; se forem duas
 * funções, um dia deixam de ser o mesmo número e ninguém dá por isso até um
 * cliente perguntar.
 */
export function sinalESaldo(
  total: number,
  percentagemSinal: number,
): { sinal: number; saldo: number } {
  return splitSinal(total, percentagemSinal);
}

/** As duas leituras do mesmo número, para ela ver o que o cliente vai ver. */
export function asDuasFormas(
  base: number,
  taxa: number,
): {
  acrescer: { base: number; iva: number; total: number };
  incluido: { base: number; iva: number; total: number };
} {
  const cent = round2;
  // "acresce": o número escrito é a base e o IVA soma-se por cima.
  const ivaAcrescer = cent(base * taxa);
  // "incluído": o número escrito JÁ traz o IVA lá dentro, e a base extrai-se.
  const baseIncluido = cent(base / (1 + taxa));
  // Nos dois casos o IVA sai por SUBTRACÇÃO ou o total por SOMA das parcelas
  // já arredondadas — nunca as três por sua conta. É o que garante que estas
  // duas leituras, que existem para ela comparar, fecham cada uma em si.
  return {
    acrescer: { base: cent(base), iva: ivaAcrescer, total: cent(cent(base) + ivaAcrescer) },
    incluido: { base: baseIncluido, iva: cent(cent(base) - baseIncluido), total: cent(base) },
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
