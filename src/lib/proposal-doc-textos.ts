/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA PROPOSTA, NA LÍNGUA DO CASAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: preparar a proposta em português, como sempre, e no momento de
 * gerar poder escolher que o PDF saia em inglês.
 *
 * ── O QUE ESTE FICHEIRO TRADUZ, E O QUE NÃO TRADUZ ─────────────────────────
 *
 * TRADUZ o que o DOCUMENTO diz por si: os títulos das secções, os cabeçalhos
 * do quadro, os rótulos dos campos, o texto padrão da casa (notas, condições,
 * observações), a forma de escrever a data e a forma de escrever o dinheiro.
 *
 * NÃO traduz o que ELA escreveu: os títulos dos serviços, as descrições, as
 * legendas dos mood boards, os nomes das rubricas do orçamento, o nome do
 * casal, o local. Isso sai tal e qual — foi uma decisão explícita, e é a
 * honesta: uma tradução automática de «Decor Cerimónia» ou de um nome de
 * quinta chega ao cliente sem ninguém a ter lido. Quem quiser esses campos em
 * inglês escreve-os em inglês.
 *
 * A consequência tem de ser dita a quem carrega no botão, e é: a proposta sai
 * com a moldura em inglês e o conteúdo dela na língua em que foi escrito.
 *
 * ── PORQUE É QUE A LÍNGUA NÃO ENTRA NO DOCUMENTO GUARDADO ──────────────────
 *
 * O `ProposalDoc` que fica gravado continua a ser um só, em português. A
 * língua é um parâmetro de DESENHO, como o tamanho da página: entra no
 * gerador, não no documento. Duas cópias do mesmo documento em duas línguas
 * seriam duas coisas para manter coerentes — e a que ninguém reabrisse
 * ficaria a mentir na primeira vez que um preço mudasse.
 */

import {
  DEFAULT_CANCELAMENTO,
  DEFAULT_CONDICOES_GERAIS,
  DEFAULT_INCLUIDO,
  DEFAULT_NAO_INCLUIDO,
  DEFAULT_NOTAS_IMPORTANTES,
  DEFAULT_OBSERVACOES_GERAIS,
  DIAS_PARA_CONFIRMAR_CONVIDADOS,
  depositPercentOf,
  faseamentoPorOmissao,
  preencherMarcadores,
  type ProposalDoc,
  type RedaccoesSemDado,
} from "./proposal-doc";

/** As línguas em que o documento se sabe desenhar. */
export type IdiomaDaProposta = "pt" | "en";

/** `true` para o que é mesmo uma das línguas — para validar o que chega de fora. */
export function ehIdiomaDaProposta(v: unknown): v is IdiomaDaProposta {
  return v === "pt" || v === "en";
}

/**
 * A língua por omissão.
 *
 * É português, e é de propósito: todos os chamadores que existiam antes desta
 * funcionalidade continuam a desenhar exactamente o que desenhavam. Uma
 * proposta antiga, reaberta, sai como saiu.
 */
export const IDIOMA_POR_OMISSAO: IdiomaDaProposta = "pt";

/* ═══════════════════════════════════════════════════════════════════════════
   AS DATAS E O DINHEIRO — AS DUAS DECISÕES QUE NÃO SÃO DE TRADUÇÃO
   ═══════════════════════════════════════════════════════════════════════════

   ── A DATA ────────────────────────────────────────────────────────────────
   A única data que o DOCUMENTO escreve por si é a validade da proposta; em
   português sai «11 de outubro de 2026», por extenso. Em inglês sai
   «11 October 2026»: dia, mês por extenso, ano, sem vírgula e sem sufixo
   ordinal.

   Não é a forma americana («October 11, 2026») por uma razão concreta desta
   folha: a OUTRA data do documento — a do evento — é texto dela e não se
   traduz, portanto continua a ler-se «3 de julho de 2027», com o dia à frente.
   Pôr o mês primeiro na validade e o dia primeiro no evento era a marca de duas
   mãos a escrever o mesmo papel, que é exactamente o defeito que fez os meses
   passarem de abreviados a por extenso. O mês por extenso resolve, de caminho,
   a ambiguidade do 03/07 entre um leitor britânico e um americano.

   ── O DINHEIRO: FICA EM pt-PT, NAS DUAS LÍNGUAS ───────────────────────────
   «2.460,00 €» é o que sai em inglês também. Três razões, por ordem de peso:

     · METADE DO DINHEIRO DESTA FOLHA É TEXTO DELA. O «Valor Total», os valores
       adicionais e o preço estimado são campos livres, escritos à mão em
       português — e o que ela escreve não se traduz, que é a regra desta
       funcionalidade. Formatar só os números CALCULADOS à inglesa punha
       «€2,460.00» e «2.460,00 €» na mesma coluna do mesmo quadro. É o defeito
       que o `milharesComPonto` do gerador foi escrito para corrigir, e voltaria
       pela porta do lado.
     · A FACTURA SAI EM PORTUGAL. O sinal e o saldo impressos aqui são os que as
       rotas de facturação emitem, com os números escritos como o fisco
       português os escreve. Um casal a comparar a proposta com a factura tem de
       ver o mesmo número, com a mesma pontuação.
     · A VÍRGULA E O PONTO TROCAM DE PAPEL entre as duas convenções. Um leitor
       que veja «2.460,00 €» numa linha e «2,460.00 €» noutra não lê duas
       formatações: lê dois números diferentes. Uma folha de dinheiro só pode
       ter uma convenção, e a que tem de ficar é a dos números que ela escreve.

   Pela mesma razão, a percentagem do IVA («23%», «23,5%») também continua com a
   vírgula portuguesa: um ponto decimal ao lado de um ponto de milhares, na
   mesma página, é a maneira mais rápida de fazer alguém desconfiar da conta.

   O que muda em inglês é o RÓTULO — «VAT», «Total payable» —, não o número. */

/** Os meses por extenso, como o resto do documento os escreve. */
const MESES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const MESES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "2026-09-12" → "12 de setembro de 2026" / "12 September 2026".
 *
 * Deixa passar tal e qual o que não seja uma data ISO — é o que se desenha, e
 * uma data estranha impressa é melhor do que um erro a meio da geração.
 *
 * (O motor que lê propostas de volta aceita `[a-zç]{3,10}` como mês, portanto a
 * ida e volta em português continua a devolver a data.)
 */
function dataPorExtenso(
  iso: string,
  meses: readonly string[],
  juntar: (d: number, m: string, a: string) => string,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return iso;
  return juntar(Number(m[3]), meses[mes - 1], m[1]);
}

/** Os campos da faixa de apresentação, por chave — é a chave que liga o rótulo
 *  impresso (na língua do cliente) ao rótulo do AVISO de truncagem, que é
 *  sempre em português porque quem o lê é o estúdio. */
export type CampoDoEvento =
  | "cliente"
  | "noivos"
  | "evento"
  | "data"
  | "local"
  | "convidados"
  | "servico"
  | "cerimonia"
  | "hora";

/**
 * Tudo o que o documento diz POR SI, numa língua.
 *
 * O que não está aqui é conteúdo dela e sai tal e qual — ver o cabeçalho deste
 * ficheiro. Uma entrada que falte é um pedaço de proposta que sai em português
 * dentro de um documento inglês, e isso não se vê até um cliente o ver: é para
 * isso que existe o varrimento em `proposal-doc-textos.test.ts`.
 */
export interface TextosDoDocumento {
  // ── Capa ──
  readonly capaDecoracao: string;
  readonly capaOrganizacao: string;

  // ── 1. Apresentação ──
  readonly sobretituloApresentacao: string;
  readonly tituloApresentacao: string;
  readonly campos: Readonly<Record<CampoDoEvento, string>>;

  // ── 2. Serviços ──
  readonly sobretituloServicos: string;
  readonly tituloServicos: string;

  // ── Cronograma (modelo Organização) ──
  readonly sobretituloCronograma: string;
  readonly tituloCronograma: string;

  /**
   * O sobretítulo das páginas de inspiração.
   *
   * `null` em português DE PROPÓSITO: a palavra vive em `proposal-geometria`,
   * onde vive a medida a que ela é desenhada, e é de lá que o estúdio a lê para
   * a pré-visualização. Copiá-la para aqui era criar uma segunda verdade que um
   * dia discordava da primeira. `null` quer dizer «o que a geometria disser».
   */
  readonly sobretituloInspiracao: string | null;

  // ── 3. Orçamento ──
  readonly sobretituloOrcamento: string;
  readonly tituloOrcamento: string;
  readonly colunaItem: string;
  readonly colunaPreco: string;
  readonly colunaPrecoEstimado: string;
  readonly totalEstimado: string;
  /** A marca de uma linha opcional, à direita do nome da rubrica. */
  readonly marcaExtra: string;
  readonly subtotalServicos: string;
  readonly subtotalServicosEstimado: string;
  readonly totalSemIva: string;
  /** «IVA (23%)» / «VAT (23%)» — a taxa já vem escrita. */
  readonly iva: (taxa: string) => string;
  readonly totalAPagar: string;
  /** O «+ IVA» que se acrescenta a um total que não o diga. */
  readonly maisIva: string;
  readonly semOsExtras: string;
  readonly umaLinhaExtra: string;
  readonly variasLinhasExtra: (quantas: number) => string;
  readonly nota: (texto: string) => string;
  readonly notasImportantes: string;
  readonly condicoesDeReserva: string;
  readonly incluidoNaProposta: string;
  readonly naoIncluidoNoOrcamento: string;

  // ── 4. Condições Gerais ──
  readonly sobretituloCondicoes: string;
  readonly tituloCondicoes: string;

  // ── Fecho ──
  readonly proximosPassos: string;
  readonly passoAceitar: string;
  readonly passoSinal: string;
  readonly passoValidade: (data: string) => string;
  readonly observacoesGerais: string;
  readonly faseamentoDoPagamento: string;
  readonly sinal: (pct: number) => string;
  readonly saldo: (pct: number) => string;
  readonly quandoSinal: string;
  readonly quandoSaldo: string;
  readonly baseDoCalculo: (total: string) => string;
  readonly cancelamento: string;
  readonly contactos: string;
  readonly email: string;
  readonly telefone: string;

  // ── Contracapa ──
  readonly obrigada: string;
  readonly agradecimento: string;
  /** Como o `sobretituloInspiracao`: `null` = o slogan que está em `site.ts`. */
  readonly slogan: string | null;

  /** A data por extenso, na forma que esta língua escreve (ver o cabeçalho). */
  readonly data: (iso: string) => string;
}

const PT: TextosDoDocumento = {
  capaDecoracao: "Proposta · Decoração",
  capaOrganizacao: "Proposta · Organização",

  sobretituloApresentacao: "A Proposta",
  tituloApresentacao: "Apresentação",
  campos: {
    cliente: "Cliente",
    noivos: "Noivos",
    evento: "Evento",
    data: "Data do Evento",
    local: "Local",
    convidados: "Número de Convidados",
    servico: "Serviço",
    cerimonia: "Cerimónia",
    hora: "Hora",
  },

  sobretituloServicos: "O que propomos",
  tituloServicos: "Serviços",

  sobretituloCronograma: "Como avançamos",
  tituloCronograma: "Cronograma de Organização",

  sobretituloInspiracao: null,

  sobretituloOrcamento: "O investimento",
  tituloOrcamento: "Orçamento Proposto",
  colunaItem: "Item",
  colunaPreco: "Preço (€)",
  colunaPrecoEstimado: "Preço Estimado (€)",
  totalEstimado: "Total Estimado",
  marcaExtra: "extra",
  subtotalServicos: "Subtotal dos serviços",
  subtotalServicosEstimado: "Subtotal dos serviços (estimado)",
  totalSemIva: "TOTAL (sem IVA)",
  iva: (taxa) => `IVA (${taxa})`,
  totalAPagar: "Total a pagar",
  maisIva: "+ IVA",
  semOsExtras: "Sem os extras assinalados",
  umaLinhaExtra: "A linha assinalada com «extra» é opcional e pode ser retirada.",
  variasLinhasExtra: (quantas) =>
    `As ${quantas} linhas assinaladas com «extra» são opcionais e podem ser retiradas.`,
  nota: (texto) => `Nota: ${texto}`,
  notasImportantes: "Notas importantes",
  condicoesDeReserva: "Condições de reserva",
  incluidoNaProposta: "Incluído na proposta:",
  naoIncluidoNoOrcamento: "Não incluído no orçamento:",

  sobretituloCondicoes: "Para sua tranquilidade",
  tituloCondicoes: "Condições Gerais",

  proximosPassos: "Próximos Passos",
  passoAceitar:
    "Para confirmar esta proposta, basta aceitá-la online através da ligação enviada no e-mail, ou responder-nos diretamente.",
  passoSinal: "A reserva da data só fica garantida após o pagamento do sinal.",
  passoValidade: (data) => `Esta proposta é válida até ${data}.`,
  observacoesGerais: "Observações Gerais",
  faseamentoDoPagamento: "Faseamento do Pagamento",
  sinal: (pct) => `Sinal ${pct}%`,
  saldo: (pct) => `Saldo ${pct}%`,
  quandoSinal: "na adjudicação, para reservar a data",
  quandoSaldo: "até 1 mês antes do evento",
  baseDoCalculo: (total) => `Calculados sobre o total a pagar — ${total}, com IVA incluído.`,
  cancelamento: "Cancelamento",
  contactos: "Contactos",
  email: "Email",
  telefone: "Telefone",

  obrigada: "OBRIGADA",
  agradecimento: "Por nos deixarem fazer parte deste momento.",
  slogan: null,

  data: (iso) => dataPorExtenso(iso, MESES_PT, (d, m, a) => `${d} de ${m} de ${a}`),
};

const EN: TextosDoDocumento = {
  capaDecoracao: "Proposal · Decoration",
  // «Organização» é o serviço de planeamento do casamento, não a organização
  // enquanto empresa — «Planning» é o que um casal inglês procura.
  capaOrganizacao: "Proposal · Planning",

  sobretituloApresentacao: "The proposal",
  tituloApresentacao: "Introduction",
  campos: {
    cliente: "Client",
    noivos: "Couple",
    evento: "Event",
    data: "Event Date",
    local: "Venue",
    convidados: "Number of Guests",
    servico: "Service",
    cerimonia: "Ceremony",
    hora: "Time",
  },

  sobretituloServicos: "What we propose",
  tituloServicos: "Services",

  sobretituloCronograma: "How we move forward",
  tituloCronograma: "Planning Timeline",

  sobretituloInspiracao: "Inspiration",

  sobretituloOrcamento: "The investment",
  tituloOrcamento: "Proposed Quote",
  colunaItem: "Item",
  colunaPreco: "Price (€)",
  colunaPrecoEstimado: "Estimated Price (€)",
  totalEstimado: "Estimated Total",
  // A mesma palavra nas duas línguas — e é uma sorte: a marca é impressa ao
  // lado da rubrica e citada na frase que a explica, e as duas têm de dizer o
  // mesmo. Se um dia mudar aqui, muda nos dois sítios ao mesmo tempo.
  marcaExtra: "extra",
  subtotalServicos: "Services subtotal",
  subtotalServicosEstimado: "Services subtotal (estimated)",
  // «excl. VAT» e não «before VAT»: é a forma que aparece nas facturas e nos
  // orçamentos europeus, e é a que um casal irlandês ou britânico já leu.
  totalSemIva: "TOTAL (excl. VAT)",
  iva: (taxa) => `VAT (${taxa})`,
  totalAPagar: "Total payable",
  maisIva: "+ VAT",
  semOsExtras: "Without the lines marked extra",
  umaLinhaExtra: "The line marked “extra” is optional and can be removed.",
  variasLinhasExtra: (quantas) =>
    `The ${quantas} lines marked “extra” are optional and can be removed.`,
  nota: (texto) => `Note: ${texto}`,
  notasImportantes: "Important notes",
  condicoesDeReserva: "Booking conditions",
  incluidoNaProposta: "Included in the proposal:",
  naoIncluidoNoOrcamento: "Not included in the quote:",

  sobretituloCondicoes: "For your peace of mind",
  tituloCondicoes: "General Conditions",

  proximosPassos: "Next Steps",
  passoAceitar:
    "To confirm this proposal, simply accept it online through the link sent by e-mail, or reply to us directly.",
  passoSinal: "The date is only secured once the deposit has been paid.",
  passoValidade: (data) => `This proposal is valid until ${data}.`,
  observacoesGerais: "General Remarks",
  faseamentoDoPagamento: "Payment Schedule",
  sinal: (pct) => `Deposit ${pct}%`,
  saldo: (pct) => `Balance ${pct}%`,
  quandoSinal: "on acceptance, to secure the date",
  quandoSaldo: "up to 1 month before the event",
  baseDoCalculo: (total) => `Calculated on the total payable — ${total}, VAT included.`,
  cancelamento: "Cancellation",
  contactos: "Contacts",
  email: "Email",
  telefone: "Phone",

  obrigada: "THANK YOU",
  agradecimento: "For letting us be part of this moment.",
  slogan: "We decorate events, we make memories last.",

  data: (iso) => dataPorExtenso(iso, MESES_EN, (d, m, a) => `${d} ${m} ${a}`),
};

/** O que o documento diz por si, na língua pedida. */
export function textosDaProposta(idioma: IdiomaDaProposta): TextosDoDocumento {
  return idioma === "en" ? EN : PT;
}

/* ═══════════════════════════════════════════════════════════════════════════
   O TEXTO PADRÃO DA CASA — E COMO SE SABE QUE CONTINUA A SER O DA CASA
   ═══════════════════════════════════════════════════════════════════════════

   As notas, as condições de reserva, as condições gerais, as observações, o
   faseamento e o cancelamento são texto FIXO — a moldura, não o conteúdo — e
   por isso traduzem-se. Só que vivem num sítio incómodo: `withProposalDefaults`
   copia-os para DENTRO do documento gravado, ao lado dos que ela reescreveu à
   mão. Depois disso, um array de condições gerais é indistinguível de outro.

   A distinção faz-se por COMPARAÇÃO: se o que está no documento é, palavra por
   palavra, o texto da casa, então é a moldura e traduz-se; se não é, é dela e
   sai tal e qual. Uma condição acrescentada, uma vírgula mudada, uma lista
   apagada — qualquer diferença e o bloco INTEIRO fica como está.

   É conservador de propósito, e na direcção certa: o pior que acontece é uma
   proposta inglesa levar um parágrafo em português que alguém escreveu à mão —
   visível, e verdadeiro, porque foi mesmo isso que ela escreveu. O contrário
   (traduzir por cima do que ela escreveu) é a proposta a dizer ao cliente uma
   coisa que ninguém leu.

   A comparação é feita com os marcadores JÁ PREENCHIDOS, porque é assim que o
   texto chega ao documento — e a versão inglesa é preenchida com a mesma
   função (ver `preencherMarcadores`), para o dia e o número de convidados
   entrarem nas duas línguas. */

/**
 * As duas condições inglesas que citam a data e o número, nas duas redacções —
 * a que cita o dado e a que se usa quando ele ainda não existe.
 *
 * As portuguesas estão em `proposal-doc.ts` (`CONDICOES_SEM_DADO`), com a razão
 * escrita por extenso: uma cláusula contratual sem o dado tem de continuar a
 * ser uma frase. Estas vivem aqui porque o inglês é deste ficheiro — escrever
 * texto inglês no módulo do documento dava duas casas para a mesma língua.
 */
const EN_CONDICAO_DO_DIA = {
  com: "This proposal is only valid for the event to be held on {DATA}.",
  sem: "This proposal is only valid for the event date subsequently confirmed in writing.",
} as const;
const EN_CONDICAO_DO_NUMERO = {
  com: "The quote is valid for the stated number of guests ({CONVIDADOS}); below or above that number the amount of the proposal will have to be revised.",
  sem: "The quote is valid for the number of guests subsequently confirmed in writing; below or above that number the amount of the proposal will have to be revised.",
} as const;

/** A chave é a frase COM marcador, e vem da mesma constante que a lista imprime:
 *  reescrever a condição inglesa não pode deixar esta tabela a apontar para uma
 *  frase que já não existe. */
const EN_CONDICOES_SEM_DADO: RedaccoesSemDado = {
  [EN_CONDICAO_DO_DIA.com]: EN_CONDICAO_DO_DIA.sem,
  [EN_CONDICAO_DO_NUMERO.com]: EN_CONDICAO_DO_NUMERO.sem,
};

/** As condições gerais da casa, em inglês. Os marcadores `{DATA}` e
 *  `{CONVIDADOS}` são os mesmos da versão portuguesa e são preenchidos com os
 *  dados do evento — que são texto dela, e portanto ficam em português. */
const EN_CONDICOES_GERAIS: string[] = [
  "VAT at the legal rate in force is added to the amounts, as described.",
  "Quotes sent by Líquen Events are subject to confirmation by us when the client accepts them, the criterion being our availability to carry out the event.",
  "The event must be pre-booked in writing, by e-mail. The booking is only confirmed once the acceptance payment has been made.",
  "A travel charge for the Líquen team will be applied according to the distance in kilometres from Évora to the event venue, whenever the event takes place outside the district of Évora.",
  "Whenever the distance to the venue or the schedule of the event requires the Líquen team to stay overnight, the cost of the accommodation will be charged.",
  "A meal must be provided for the members of the Líquen team who stay for the whole event.",
  EN_CONDICAO_DO_DIA.com,
  EN_CONDICAO_DO_NUMERO.com,
  `The number of people must be confirmed up to ${DIAS_PARA_CONFIRMAR_CONVIDADOS} days before the event. If the number of attendees on the day of the event is lower than expected, the number confirmed will be charged. If the number of attendees is higher than the one communicated, an adjustment must be made, and Líquen Events cannot be held responsible for any failures or shortcomings resulting from a service provided to a number of attendees higher than the one previously confirmed.`,
  "Líquen Events reserves the right to change the price should there be significant changes in the national and/or international economic climate or in the assumptions on which this proposal was drawn up.",
];

const EN_NOTAS_IMPORTANTES: string[] = [
  "Set-up and dismantling are included in this proposal;",
  "All charges relating to the venue are the responsibility of the client or of the venue itself;",
  "The event venue and every area to be used must be handed over to us clean and ready to use;",
];

const EN_INCLUIDO: string[] = [
  "Decoration service, materials and flowers as described;",
  "Set-up and dismantling services as described.",
];

const EN_NAO_INCLUIDO: string[] = [
  "Rental and/or other costs relating to the venue, such as marquee, furniture, lounge furniture and catering tableware;",
  "Favours and event stationery such as menus, seating chart and seating plan.",
];

const EN_OBSERVACOES_GERAIS: string[] = [
  "Líquen Events cannot be held responsible should the event not be able to take place or have to be moved to another date due to significant changes in the national and/or international economic and/or social climate and/or in the event of war and/or natural disaster.",
  "All materials and props used at the event are for exclusive use in the decoration.",
  "Líquen Events is a registered trademark owned by Líquen Events. All images, content, graphics, text and logo are the property of Líquen Events; all rights reserved.",
  "The content of this proposal is non-transferable, personal and confidential, and may not be reproduced or shared with third parties without the express written consent of Líquen Events.",
];

const EN_CANCELAMENTO: string[] = [
  "In the event of cancellation of the service, Líquen Events reserves the right not to refund the acceptance payment. If the cancellation is made between the 30th day before the event and 2 p.m. on the eighth working day before the date of the event, Líquen Events is entitled to receive 70% of the total amount agreed for the event, plus the applicable VAT.",
  "If the event is cancelled after 2 p.m. on the eighth working day before the date of the event, Líquen Events is entitled to receive the full amount agreed for the event, plus VAT. In either case the cancellation is only valid if made in writing, by e-mail, the date and time of receipt being the ones that count.",
  "Any dispute will be referred to the Lisbon consumer arbitration centre (Centro de Arbitragem de Conflitos de Consumo de Lisboa).",
];

/** O faseamento da casa em inglês — as duas primeiras linhas seguem a
 *  percentagem do sinal deste documento, como a versão portuguesa. */
function faseamentoEn(pctSinal: number): string[] {
  const sinal = depositPercentOf({ depositPercent: pctSinal });
  return [
    `${sinal}% on acceptance;`,
    `${100 - sinal}% 1 month before;`,
    "A service is only considered booked once the first defined percentage has been paid.",
  ];
}

/** Os blocos de texto fixo de um documento. */
export type BlocosFixos = Pick<
  ProposalDoc,
  | "notasImportantes"
  | "incluido"
  | "naoIncluido"
  | "condicoesGerais"
  | "observacoesGerais"
  | "faseamento"
  | "cancelamento"
>;

/** Duas listas com exactamente o mesmo texto, pela mesma ordem. */
function saoIguais(a: readonly string[] | undefined, b: readonly string[]): boolean {
  return !!a && a.length === b.length && a.every((s, i) => s === b[i]);
}

/**
 * Os blocos de texto fixo deste documento, na língua pedida.
 *
 * Em português devolve as MESMAS listas que estão no documento — a mesma
 * referência, sem cópia nenhuma: o caminho de omissão não pode desenhar nada de
 * diferente do que desenhava.
 *
 * Em inglês, cada bloco é traduzido apenas se for, palavra por palavra, o texto
 * da casa (ver o bloco de comentário acima). O que ela reescreveu fica como
 * está.
 */
export function blocosFixosNaLingua(
  doc: ProposalDoc,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): BlocosFixos {
  if (idioma !== "en") return doc;
  // As redacções alternativas vão na LÍNGUA das linhas que se estão a preencher
  // — sem data, a condição inglesa tem de ser reescrita em inglês.
  const preencher = (linhas: readonly string[], semDado?: RedaccoesSemDado) =>
    linhas.map((l) => preencherMarcadores(l, doc, semDado));
  /** O bloco em inglês, se o que está no documento for o da casa. */
  const traduzido = (atual: string[], pt: readonly string[], en: readonly string[]) =>
    saoIguais(atual, pt) ? [...en] : atual;
  const pct = depositPercentOf(doc);
  return {
    notasImportantes: traduzido(
      doc.notasImportantes,
      DEFAULT_NOTAS_IMPORTANTES,
      EN_NOTAS_IMPORTANTES,
    ),
    incluido: traduzido(doc.incluido, DEFAULT_INCLUIDO, EN_INCLUIDO),
    naoIncluido: traduzido(doc.naoIncluido, DEFAULT_NAO_INCLUIDO, EN_NAO_INCLUIDO),
    condicoesGerais: traduzido(
      doc.condicoesGerais,
      preencher(DEFAULT_CONDICOES_GERAIS),
      preencher(EN_CONDICOES_GERAIS, EN_CONDICOES_SEM_DADO),
    ),
    observacoesGerais: traduzido(
      doc.observacoesGerais,
      DEFAULT_OBSERVACOES_GERAIS,
      EN_OBSERVACOES_GERAIS,
    ),
    faseamento: traduzido(doc.faseamento, faseamentoPorOmissao(pct), faseamentoEn(pct)),
    cancelamento: traduzido(doc.cancelamento, DEFAULT_CANCELAMENTO, EN_CANCELAMENTO),
  };
}
