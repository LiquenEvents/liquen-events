/**
 * Rich, multi-page proposal DOCUMENT model — mirrors the studio's real
 * landscape "PO Decoração" proposal (cover → apresentação → serviços →
 * mood boards → orçamento → condições → observações → contracapa).
 *
 * The FIXED boilerplate (terms, payment staging, cancellation, reservation
 * conditions) ships as defaults below so every proposal carries the studio's
 * standard wording; the back office overrides only what changes per event.
 */

import { SINAL_POR_OMISSAO } from "./money";

import { round2 } from "@/lib/money";

/** A single reference image in a mood board (base64-encoded JPEG or PNG bytes,
 *  with or without a `data:` prefix — the renderer sniffs the format). */
export type ImageData = string;

/** Taxa de IVA por omissão (23% — taxa normal em Portugal continental). */
export const DEFAULT_VAT_RATE = 0.23;

/** Dias de validade por omissão de uma proposta enviada. */
export const DEFAULT_VALID_DAYS = 30;

/** Como interpretar o `totalAmount`: já COM IVA ("incluido") ou o IVA acresce
 *  ao valor indicado ("acrescer", i.e. "+ IVA"). */
export type VatMode = "incluido" | "acrescer";

/**
 * Fotos que a página de mood board do PDF chega a DESENHAR.
 *
 * É uma decisão de composição (uma foto grande à esquerda + grelha à direita),
 * não um limite técnico. Vive aqui, no modelo, e não no gerador, porque quem
 * precisa deste número são os DOIS lados: o gerador (`proposal-doc-pdf`, que é
 * `server-only`) para desenhar, e o estúdio, no browser, para avisar ao pôr a
 * sétima foto num mood board. Um número, um sítio.
 */
export const MOOD_BOARD_MAX_IMAGES = 6;

/**
 * Teto do tamanho de um documento GUARDADO (JSON, em bytes).
 *
 * Um `ProposalDoc` é texto e CAMINHOS de fotos, nunca bytes de imagem. Medido
 * com as formas reais: 4,3 KB só com o texto fixo do estúdio, ~13 KB numa
 * proposta cheia com um mood board, 18,5 KB no tecto de 80 fotos por documento
 * (o `MAX_IMAGES_PER_DOC` de proposal-doc-render.ts).
 * 512 KB é ~28× a maior proposta possível — folgado para o maior casamento e,
 * ainda assim, uma trava contra um cliente avariado a empurrar meio megabyte
 * para dentro da coluna `proposals.doc` (e, dali, para dentro da cópia de
 * segurança, que viaja inteira no corpo de um pedido).
 *
 * É de propósito o MESMO número que o rascunho do estúdio já usava
 * (`MAX_DRAFT_BYTES`, na rota /proposta-rascunho): o que se grava ao enviar é o
 * que se estava a rascunhar, e dois tetos diferentes deixariam passar um
 * rascunho que depois não se conseguia enviar.
 */
export const MAX_PROPOSAL_DOC_BYTES = 512 * 1024;

export interface MoodBoard {
  /** Elegant serif title, e.g. "Decoração Cerimónia". */
  title: string;
  /** Uploaded reference photos, laid out as an automatic collage. */
  images: ImageData[];
  /** Optional handwritten-style annotation under the collage. */
  annotation?: string;
}

export interface ServiceItem {
  /** IDENTIDADE ESTÁVEL da linha, para o editor (chave de React, arrasto,
   *  foco). Não é impressa: o PDF só lê `label`/`desc`. Ver {@link withServiceIds}. */
  id?: string;
  /** Bold label, e.g. "Reunião inicial" or "Decoração Cerimónia". */
  label: string;
  /** Optional description shown after the label (Organização template). */
  desc?: string;
}

export interface ServiceGroup {
  /** Identidade estável do grupo — ver {@link ServiceItem.id}. */
  id?: string;
  /** Ordinal marker, e.g. "a)". */
  letter?: string;
  /** Group title, e.g. "Decoração Floral de Casamento". */
  title: string;
  /** Sub-items (bullets); each is a label with an optional description. */
  items: ServiceItem[];
}

/**
 * Id de recurso para um grupo/item que ainda não tem nenhum — DERIVADO DA
 * POSIÇÃO, nunca sorteado.
 *
 * O editor usa o mesmo par de funções para desenhar as chaves de React antes de
 * o preenchimento chegar ao documento, por isso a linha nunca troca de
 * identidade a meio (que é exatamente o que fazia o cursor saltar).
 */
export function fallbackServiceGroupId(index: number): string {
  return `g${index}`;
}
export function fallbackServiceItemId(groupId: string, index: number): string {
  return `${groupId}~i${index}`;
}

/**
 * Devolve os grupos com `id` em todos os grupos e itens, preenchendo os que
 * faltam a partir da POSIÇÃO.
 *
 * Determinístico de propósito: isto corre a cada chamada de
 * {@link withProposalDefaults} — do lado do servidor, a cada pré-visualização e
 * a cada envio — e um id sorteado faria o MESMO documento serializar diferente
 * de cada vez (rascunho a "mudar" sozinho, gravações e comparações inúteis).
 *
 * Ids já existentes são respeitados; um id repetido (rascunho estragado) é
 * desempatado com um sufixo, também ele determinístico. Quando não há nada a
 * preencher devolve o MESMO array, para o editor poder comparar por identidade.
 */
export function withServiceIds(groups: readonly ServiceGroup[]): ServiceGroup[] {
  const used = new Set<string>();
  /** O `base`, ou `base_2`, `base_3`… até sair um id livre. */
  const free = (base: string): string => {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    return id;
  };
  let changed = false;
  const next = groups.map((g, gi) => {
    const groupId = free(g.id || fallbackServiceGroupId(gi));
    let itemsChanged = false;
    const items = (g.items ?? []).map((it, ii) => {
      const itemId = free(it.id || fallbackServiceItemId(groupId, ii));
      if (itemId === it.id) return it;
      itemsChanged = true;
      return { ...it, id: itemId };
    });
    if (groupId === g.id && !itemsChanged) return g;
    changed = true;
    return { ...g, id: groupId, items };
  });
  return changed ? next : (groups as ServiceGroup[]);
}

/** A timeline phase in the "Cronograma de Organização" (Organização template). */
export interface CronogramaPhase {
  /** e.g. "6-12 meses antes do casamento". */
  title: string;
  items: string[];
}

/** A priced budget row for the per-item estimate model (Organização template). */
export interface BudgetRow {
  item: string;
  /** Kept as free text ("[Valor]", "1.500,00 €") to match the studio's format. */
  price: string;
}

/**
 * Linha ADICIONAL de orçamento no template Decoração — apresentada por baixo do
 * "Valor Total Decoração", tal como nas propostas reais da Líquen (Deslocação da
 * equipa, Wedding Coordinator, Tecidos suspensos, Mobiliário opção A/B, …).
 *
 * É apenas de DISPLAY (texto livre pt-PT, incl. o "+ IVA" quando aplicável) —
 * não entra no modelo de dinheiro/faturação (que continua a partir do total
 * estruturado), do mesmo modo que `budgetItems` são só nomes. Assim a estrutura
 * do PDF varia conforme o que cada casal pede, sem desestabilizar as finanças.
 */
export interface BudgetExtra {
  /** Rótulo à esquerda, e.g. "Deslocação da equipa Líquen". */
  label: string;
  /** Valor à direita como texto livre, e.g. "896,00 €" ou "895,00 € + IVA". */
  valueText: string;
}

export interface ProposalDoc {
  /** Which studio template this proposal follows — switches the apresentação
   *  heading, the pricing model, and whether a cronograma is shown. */
  template?: "decoracao" | "organizacao";
  /** Running header title, e.g. "PO Decoração Casamento Maria Rebocho 3.07.2027". */
  ref: string;
  /** Header title on the content pages (Organização template shows
   *  "Proposta de orçamento para Organização de Casamento"). */
  headerTitle?: string;

  // ── 1. Apresentação ──
  /** Couple / client, e.g. "Maria & Zé". */
  clientNames: string;
  eventType: string; // "Casamento"
  eventDate: string; // "3 de julho de 2027"
  location: string; // "Monte da Oliveirinha"
  guests: string; // "150 pax"
  ceremony?: string; // "Civil, simbólica"
  time?: string; // "A definir"
  /** Wedding planners a acompanhar o evento, e.g. "Equipa AMARA" (opcional). */
  weddingPlanners?: string;

  // ── 2. Serviços ──
  serviceGroups: ServiceGroup[];

  // ── Mood boards (one page each; Decoração template) ──
  moodBoards: MoodBoard[];

  // ── Cronograma de Organização (Organização template) ──
  cronograma?: CronogramaPhase[];

  // ── 3./4. Orçamento Proposto ──
  // Decoração template: grouped total.
  budgetItems: string[]; // item NAMES only, e.g. "Decor Cerimónia"
  /**
   * Preços por linha, SÓ INTERNOS — o índice `i` corresponde a
   * `budgetItems[i]`. Servem para somar e para avisar quando a soma e o total
   * não batem certo; o PDF continua a imprimir a coluna de preço em branco e
   * um único «Valor Total», como nas propostas reais.
   *
   * Ninguém mexe neste array à mão: as alterações passam pelos ajudantes de
   * `proposal-budget.ts`, que mexem nos dois ao mesmo tempo. Ver lá o porquê
   * de ser um array paralelo e não um campo dentro de `budgetItems`.
   */
  budgetAmounts?: (number | null)[];
  /**
   * O que cada linha CUSTA à Líquen — flores, aluguer, horas de equipa.
   *
   * Mesmo array paralelo que `budgetAmounts`, e pelas mesmas razões (ver
   * `proposal-budget.ts`). Opcional linha a linha: preencher o custo de duas
   * linhas em dez já dá uma margem parcial útil, e exigir todos garantia que
   * não se preenchia nenhum.
   *
   * NUNCA SAI DAQUI. Não é lido pelo desenhador do PDF, não vai no email, não
   * existe no portal do cliente. Um número destes numa proposta é o fim de uma
   * negociação — e há um teste em `proposal-doc-pdf` a garanti-lo.
   */
  budgetCosts?: (number | null)[];
  /**
   * Como é que cada linha ESCALA com o número de convidados: fixa (o normal),
   * por convidado, ou por mesa. Mesmo array paralelo dos outros.
   *
   * Quando uma linha tem escala, o `budgetAmounts[i]` dela deixa de ser escrito
   * à mão e passa a ser o RESULTADO da multiplicação — escrito no mesmo sítio
   * de sempre, para que a soma, o desvio do total, a margem e o resumo
   * continuem a ler o que já liam sem saberem que aquele número foi calculado.
   *
   * Ver `src/lib/orcamento/escala.ts`.
   */
  budgetScales?: (import("./orcamento/escala").Escala | null)[];
  /** Quantas pessoas por mesa, para as linhas "por mesa" (por omissão 10). */
  convidadosPorMesa?: number;
  /**
   * Quais das linhas são EXTRA — o que distingue a versão base da versão com
   * extras da mesma proposta. Mesmo array paralelo dos outros.
   *
   * Uma proposta sem marcas nenhumas é exactamente a proposta de antes: não há
   * segundo total nem uma palavra a mais no PDF. Ver
   * `src/lib/orcamento/versoes-da-proposta.ts` — em particular a razão de o
   * total da base ser DERIVADO e não escrito.
   */
  budgetOpcional?: boolean[];

  /**
   * De que fotos da BIBLIOTECA saíram as fotos desta proposta.
   *
   * Guarda os caminhos de ORIGEM (o ficheiro no bucket dos temas), não os da
   * proposta: as fotos da proposta são cópias, com caminho próprio, e comparar
   * cópias nunca diria que duas propostas mostraram a mesma imagem.
   *
   * Serve uma coisa só, e não sai daqui para lado nenhum: avisar que uma foto
   * já foi para outro casamento. Duas noivas com o mesmo Pinterest é uma
   * coincidência; duas propostas da Líquen com o mesmo arco é um descuido que
   * se vê de longe quando as duas se encontram no Instagram.
   *
   * NÃO É DESENHADA. O PDF não a lê — e o teste que compara os desenhos com e
   * sem custos/notas cobre a mesma garantia por construção: só entra no
   * documento o que alguém mandou desenhar.
   */
  fotosDeBiblioteca?: string[];

  /**
   * NOTAS INTERNAS — o que se sabe sobre este negócio e nunca se escreve ao
   * cliente. "Cliente da AMARA, cuidado com o prazo." "Já recusaram uma
   * proposta em 2025 por preço."
   *
   * Vivem no documento porque é ao documento que dizem respeito, e porque é
   * assim que viajam com ele na cópia de segurança. NUNCA SÃO DESENHADAS: o
   * gerador do PDF não as lê, e há um teste que compara as instruções de
   * desenho com e sem notas para garantir que continua assim.
   *
   * O sítio onde isto podia correr mal é o de sempre — alguém acrescenta um
   * rodapé "para conferir" e esquece-se de o tirar. É esse o teste.
   */
  notasInternas?: string;
  /**
   * Notas presas a uma secção ("nas flores, ela quer eucalipto e mais nada").
   * A chave é o id da secção do estúdio: evento, servicos, orcamento, total…
   */
  notasPorSeccao?: Record<string, string>;
  totalLabel: string; // "Valor Total Decoração"
  totalText: string; // "3000,00 € + IVA" — kept as text to match the studio's format
  /** Linhas adicionais mostradas por baixo do total (Deslocação, Wedding
   *  Coordinator, Tecidos, Mobiliário opção A/B, …). Só DISPLAY — ver {@link BudgetExtra}. */
  budgetExtras?: BudgetExtra[];
  // Organização template: per-item estimated values.
  budgetRows?: BudgetRow[];
  totalEstimatedText?: string; // "[Valor Total]" / "12.500,00 €"
  budgetNote?: string; // "Os valores são estimativas e podem ser ajustados…"

  // ── Total ESTRUTURADO (fonte de verdade do dinheiro quando presente) ──
  // O texto livre acima (`totalText`/`totalEstimatedText`) é só para DISPLAY no
  // PDF; estes campos é que determinam a matemática (base/IVA/total) a jusante,
  // eliminando a ambiguidade "3.000,00 €" (com IVA?) vs "3.000,00 € + IVA".
  /** Valor introduzido pelo estúdio. Interpretação depende de `totalVatMode`. */
  totalAmount?: number;
  /** Se `totalAmount` já inclui IVA ("incluido") ou o IVA acresce ("acrescer"). */
  totalVatMode?: VatMode;
  /** Taxa de IVA aplicável (por omissão {@link DEFAULT_VAT_RATE}). */
  vatRate?: number;
  /**
   * Percentagem do sinal, de 1 a 99 (por omissão {@link SINAL_POR_OMISSAO}).
   *
   * NÃO é só do PDF: é lida pelas rotas que EMITEM as facturas do sinal e do
   * saldo. Foi essa a razão de não bastar acrescentar um campo ao estúdio —
   * uma proposta a dizer 40% com uma factura a sair a 30% é pior do que não
   * poder mudar a percentagem de todo.
   */
  depositPercent?: number;

  // ── Validade da proposta ──
  /** Data explícita de validade (yyyy-mm-dd). Tem prioridade sobre `validUntilDays`. */
  validUntil?: string;
  /** Nº de dias de validade a contar do envio (por omissão {@link DEFAULT_VALID_DAYS}). */
  validUntilDays?: number;

  // ── Cover (two flanking photos around the dark logo panel) ──
  /** SEMPRE {@link COVER_SLOTS} posições: `[esquerda, direita]`, com `""` numa
   *  posição vazia. É a POSIÇÃO que decide o lado onde a foto é impressa, por
   *  isso o array nunca se compacta — ver {@link normaliseCoverImages}. */
  coverImages: ImageData[];

  // ── Fixed boilerplate (defaults below; overridable per event) ──
  notasImportantes: string[];
  incluido: string[];
  naoIncluido: string[];
  condicoesGerais: string[];
  observacoesGerais: string[];
  faseamento: string[];
  cancelamento: string[];
}

/**
 * A percentagem de sinal de um documento, já validada.
 *
 * Um sítio só, lido pelo estúdio E pelas três rotas de facturação, para não
 * poderem discordar. Um valor absurdo (0, 150, NaN, texto) cai na percentagem
 * da casa em vez de emitir uma factura estranha.
 */
export function depositPercentOf(
  doc: Pick<ProposalDoc, "depositPercent"> | null | undefined,
): number {
  const p = doc?.depositPercent;
  if (typeof p !== "number" || !Number.isFinite(p) || p < 1 || p > 99) return SINAL_POR_OMISSAO;
  return Math.round(p);
}

/** The studio's standard "Notas Importantes" (Orçamento page). */
export const DEFAULT_NOTAS_IMPORTANTES: string[] = [
  "O serviço de montagem e desmontagem está incluído na Proposta;",
  "Todos os encargos inerentes ao espaço são da responsabilidade do cliente ou do próprio espaço;",
  "O espaço do Evento e todas as zonas a utilizar, têm de nos ser entregues limpos e prontos a usar;",
];

/** "Condições de Reserva" — Incluído na proposta. */
export const DEFAULT_INCLUIDO: string[] = [
  "Serviço de decoração, material e flores conforme descrito;",
  "Serviço de montagem, desmontagem como descritos.",
];

/** "Condições de Reserva" — Não incluído no orçamento. */
export const DEFAULT_NAO_INCLUIDO: string[] = [
  "Aluguer e/ou outras despesas inerentes ao espaço, como tenda, mobiliário, mobiliário de lounge e palamenta de catering;",
  "Lembranças, papelaria referentes ao evento como menus, seatting chart, seatting plan.",
];

/** "Condições Gerais". `{DATA}` / `{CONVIDADOS}` are substituted from the
 *  event data so the wording stays specific without manual editing. */
export const DEFAULT_CONDICOES_GERAIS: string[] = [
  "Aos valores acresce o IVA à taxa legal em vigor como descrito.",
  "Os orçamentos enviados pela Líquen Events terão de ser validados pela mesma, aquando da sua confirmação por parte dos clientes, sendo o critério aplicado, a disponibilidade para a realização do evento.",
  "A pré-reserva do evento deve ser efetuada por escrito através de email. A confirmação do evento só será concluída após pagamento da adjudicação.",
  // A sede é em Évora e os casamentos são em todo o país: a deslocação é
  // cobrada pela distância até ao sítio onde o evento acontece. A isenção do
  // distrito de Évora fica: aí não há deslocação a cobrar.
  "Será cobrado o valor de deslocação da equipa Líquen de acordo com os quilómetros relativos à distância de Évora ao local do evento, sempre que o evento se realize fora do distrito de Évora.",
  // Trabalhar longe é mais do que combustível: um casamento a quatro horas de
  // Évora obriga a equipa a dormir lá, e isso era um custo que a proposta não
  // dizia e a Líquen absorvia.
  "Sempre que a distância ao local ou o horário do evento obriguem a equipa Líquen a pernoitar, será cobrado o valor do alojamento.",
  "Deve estar contemplada a refeição para os elementos da equipa Líquen que ficam durante todo o evento.",
  "Esta proposta só é válida para o evento a realizar no dia {DATA}.",
  "O orçamento é válido para o número de {CONVIDADOS} convidados; abaixo ou acima deste número o valor da proposta terá de ser revisto.",
  "A confirmação do número de pessoas tem de ser feita até 15 dias antes da festa. Se o número de participantes que se verificar no dia do evento for inferior ao previsto, será pago o número que foi confirmado. Caso o número de participantes seja superior ao comunicado, terá de ser feito o ajuste dos mesmos, não podendo a Líquen Events ser responsabilizada por falhas ou lacunas que resultem do serviço prestado a um número de participantes superior ao previamente confirmado.",
  "A Líquen Events reserva-se ao direito de alterar o preço, caso se verifiquem alterações significativas na conjuntura económica nacional e/ou internacional ou nas premissas estabelecidas aquando da realização desta proposta.",
];

/** "Observações Gerais". */
export const DEFAULT_OBSERVACOES_GERAIS: string[] = [
  "A Líquen Events não se responsabiliza caso o evento não se possa realizar ou tenha de mudar de data devido a alterações significativas na conjuntura económica e/ou social nacional e/ou internacional e/ou em caso de guerras e/ou catástrofes naturais.",
  "Todo o material e adereços usados no evento são para uso exclusivo na decoração.",
  "Líquen Events é uma marca registada propriedade de Líquen Events. Todas as imagens, conteúdo, grafismo, texto e logótipo são propriedade da Líquen Events; todos os direitos são reservados.",
  "O conteúdo desta proposta é intransmissível, pessoal e confidencial, não podendo ser reproduzido ou partilhado com terceiros sem autorização expressa, por escrito, por parte da Líquen Events.",
];

/**
 * "Faseamento do Pagamento" — as duas primeiras linhas seguem a percentagem.
 *
 * Era um array fixo a dizer «30% na adjudicação; 70% 1 mês antes». Assim que a
 * percentagem do sinal passou a ser editável na proposta (ver
 * {@link depositPercentOf}), esse texto passou a poder CONTRADIZER a folha onde
 * está impresso: o quadro dos valores dizia «Sinal 50% 5.000,00 €» e três
 * parágrafos abaixo as condições continuavam a dizer 30%. Duas percentagens no
 * mesmo documento é uma conversa desagradável, e a que o casal vai defender é a
 * mais baixa.
 *
 * A terceira linha não menciona números de propósito — fala da «primeira
 * percentagem definida», que é exactamente o que a primeira linha diz.
 */
export function faseamentoPorOmissao(pctSinal: number = SINAL_POR_OMISSAO): string[] {
  const sinal = depositPercentOf({ depositPercent: pctSinal });
  return [
    `${sinal}% na adjudicação;`,
    `${100 - sinal}% 1 mês antes;`,
    "A adjudicação de um serviço só é considerada válida após pagamento no valor da primeira percentagem definida.",
  ];
}

/** O faseamento da casa (30/70) — o mesmo texto de sempre. */
export const DEFAULT_FASEAMENTO: string[] = faseamentoPorOmissao();

/** "Cancelamento". */
export const DEFAULT_CANCELAMENTO: string[] = [
  "Em caso de cancelamento do serviço, a Líquen Events reserva-se o direito de não devolver o valor da adjudicação. Em caso de cancelamento efetuado entre o 30.º dia anterior e até às 14h do oitavo dia útil anterior à data do evento, a Líquen Events tem direito a receber o montante correspondente a 70% do valor total estipulado para o evento, acrescido do respetivo IVA.",
  "Se o cancelamento do evento ocorrer após as 14h do oitavo dia útil antes da data do evento, a Líquen Events terá direito a receber o montante total estipulado para o evento, acrescido de IVA, sendo a denúncia, em qualquer um dos casos, apenas válida se for efetuada por escrito, por email, valendo para tal a data e hora de receção do mesmo.",
  "Para qualquer eventual conflito recorrer-se-á ao Centro de Arbitragem de Conflitos de Consumo de Lisboa.",
];

/** A capa tem duas fotos, uma de cada lado do painel escuro: `coverImages[0]`
 *  imprime à ESQUERDA e `coverImages[1]` à DIREITA. */
export const COVER_SLOTS = 2;

/**
 * Devolve as imagens de capa com exatamente {@link COVER_SLOTS} posições, `""`
 * onde não há foto.
 *
 * O lado onde uma foto sai impressa é dado pela sua POSIÇÃO no array, por isso
 * um buraco não pode encolher o array: um rascunho antigo guardado como
 * `[null, "foto"]` (ou `["foto"]` depois de se remover a capa da esquerda)
 * colapsava para `["foto"]` e a foto escolhida para a DIREITA saía à esquerda.
 * Aceita as duas formas — a antiga (esparsa/curta) e a nova de 2 posições — e
 * emite sempre a normalizada; o `""` só é descartado na geração do PDF.
 */
export function normaliseCoverImages(
  images?: readonly (ImageData | null | undefined)[] | null,
): ImageData[] {
  return Array.from({ length: COVER_SLOTS }, (_, i) => {
    const v = images?.[i];
    return typeof v === "string" ? v : "";
  });
}

// ── Marcadores provisórios de foto ─────────────────────────────────────────
//
// Quando se escolhem fotos na Biblioteca de Temas, a cópia para a pasta desta
// proposta demora — e a foto tem de aparecer no sítio certo no INSTANTE do
// clique, não quando a cópia confirma. O que entra no documento nesse instante
// é um MARCADOR: `pending:<uuid>`.
//
// Um marcador NÃO é um caminho de Storage e não é um valor legítimo de
// documento: é uma promessa que ainda não tem morada. Por isso tem de ser
// filtrado em TODAS as fronteiras por onde o documento sai do editor — o
// rascunho gravado (local e servidor) e o documento que gera a
// pré-visualização / a proposta enviada. Um marcador que atravesse uma dessas
// fronteiras é uma foto que o gerador não consegue ir buscar: um buraco
// silencioso no PDF do cliente, exatamente o que os avisos de conteúdo
// incompleto existem para evitar.
//
// O prefixo vive AQUI, no modelo do documento, e não no seletor que o cria:
// quem filtra são os dois lados, e uma segunda definição do prefixo seria uma
// maneira de um deles deixar de filtrar sem ninguém dar por isso.

/** Prefixo dos marcadores provisórios. Os dois pontos garantem que nunca
 *  colide com um caminho de Storage (`<uuid>/<ficheiro>`). */
export const PENDING_IMAGE_PREFIX = "pending:";

/** Este caminho é um marcador provisório (uma foto ainda por copiar)? */
export function isPendingImage(path: string | null | undefined): boolean {
  return typeof path === "string" && path.startsWith(PENDING_IMAGE_PREFIX);
}

/** As fotos deste documento que ainda são promessas — o número que decide se
 *  a proposta já pode seguir para o cliente. */
export function countPendingImages(
  doc: Partial<Pick<ProposalDoc, "coverImages" | "moodBoards">>,
): number {
  let n = 0;
  for (const p of doc.coverImages ?? []) if (isPendingImage(p)) n += 1;
  for (const b of doc.moodBoards ?? [])
    for (const p of b.images ?? []) if (isPendingImage(p)) n += 1;
  return n;
}

/**
 * O mesmo documento sem um único marcador provisório.
 *
 * Nas capas o marcador vira `""` e NÃO desaparece do array: é a posição que
 * decide o lado onde a foto é impressa (ver {@link normaliseCoverImages}), por
 * isso compactar aqui mandaria a foto da direita imprimir à esquerda. Nos mood
 * boards sai mesmo da lista — ali a posição é só ordem.
 *
 * Devolve o MESMO objeto quando não há nada a filtrar (o caso normal), para
 * não sujar as comparações por referência de quem grava o rascunho.
 */
export function stripPendingImages<
  T extends Partial<Pick<ProposalDoc, "coverImages" | "moodBoards">>,
>(doc: T): T {
  if (countPendingImages(doc) === 0) return doc;
  const out: T = { ...doc };
  if (doc.coverImages) {
    out.coverImages = doc.coverImages.map((p) => (isPendingImage(p) ? "" : p));
  }
  if (doc.moodBoards) {
    out.moodBoards = doc.moodBoards.map((b) =>
      (b.images ?? []).some(isPendingImage)
        ? { ...b, images: b.images.filter((p) => !isPendingImage(p)) }
        : b,
    );
  }
  return out;
}

/** Extrai o primeiro número monetário de texto livre pt-PT
 *  ("3.000,00 € + IVA" → 3000; "14.700,00 €" → 14700). Só isto — a
 *  interpretação do IVA fica a cargo de {@link resolveProposalMoney}. */
export function parseMoneyText(text: string | undefined): number {
  if (!text) return 0;
  const m = text.match(/\d[\d.\s]*(?:,\d{1,2})?/);
  if (!m) return 0;
  const norm = m[0].replace(/[.\s]/g, "").replace(",", ".");
  return Number.parseFloat(norm) || 0;
}

/** Deteta, em texto livre, uma anotação do tipo "+ IVA" / "acresce IVA" /
 *  "IVA não incluído" ⇒ o valor é LÍQUIDO (modo "acrescer"). Caso contrário
 *  assume-se que o valor já inclui IVA. Case-insensitive e tolerante a acentos. */
export function detectVatMode(text: string | undefined): VatMode {
  if (!text) return "incluido";
  const t = text.toLowerCase();
  // "+ iva", "mais iva", "acresce (o) iva", "iva não/nao incluido/incluído".
  if (/\+\s*iva|mais\s+iva|acresce\s+(?:o\s+)?iva|iva\s+n[aã]o\s+inclu/.test(t)) {
    return "acrescer";
  }
  return "incluido";
}

/** Resultado desdobrado do total de uma proposta, sempre coerente:
 *  `gross = base + vat` e `vat = round2(base * vatRate)`. */
export interface ProposalMoney {
  /** Base tributável (sem IVA). */
  base: number;
  /** Montante de IVA. */
  vat: number;
  /** Total COM IVA — é este que alimenta `Proposal.total` e o split 30/70. */
  gross: number;
  vatRate: number;
  mode: VatMode;
}

/**
 * Resolve o dinheiro de uma proposta para um total BRUTO (com IVA) coerente.
 *
 * Fonte de verdade: os campos ESTRUTURADOS (`totalAmount`/`totalVatMode`).
 * Retrocompatibilidade: se `totalAmount` estiver ausente, extrai o número do
 * texto livre e, se `totalVatMode` também faltar, deteta o "+ IVA" no texto.
 *
 *  - modo "acrescer": `amount` é a BASE ⇒ `vat = base*taxa`, `gross = base+vat`.
 *  - modo "incluido": `amount` é o BRUTO ⇒ `base = gross/(1+taxa)`, `vat = gross-base`.
 */
export function resolveProposalMoney(
  // `Partial` de propósito: um documento a meio de ser escrito ainda não tem
  // texto de total nenhum, e um `Pick` estrito obrigava quem chama a inventar
  // um `totalText: ""` só para satisfazer o tipo — o género de campo inventado
  // que depois alguém lê como se fosse verdade.
  doc: Partial<
    Pick<
      ProposalDoc,
      "totalAmount" | "totalVatMode" | "vatRate" | "totalText" | "totalEstimatedText"
    >
  >,
): ProposalMoney {
  const vatRate =
    typeof doc.vatRate === "number" && doc.vatRate >= 0 ? doc.vatRate : DEFAULT_VAT_RATE;
  const text = doc.totalText || doc.totalEstimatedText;
  const amount =
    typeof doc.totalAmount === "number" && doc.totalAmount > 0
      ? doc.totalAmount
      : parseMoneyText(text);
  const mode: VatMode = doc.totalVatMode ?? detectVatMode(text);

  if (mode === "acrescer") {
    const base = round2(amount);
    const vat = round2(base * vatRate);
    return { base, vat, gross: round2(base + vat), vatRate, mode };
  }
  const gross = round2(amount);
  const base = round2(gross / (1 + vatRate));
  const vat = round2(gross - base);
  return { base, vat, gross, vatRate, mode };
}

/**
 * O `totalAmount` a GRAVAR para uma dada base, no modo de IVA em vigor.
 *
 * É a volta de {@link resolveProposalMoney}, e existe para as duas contas não
 * poderem divergir. O campo do estúdio chama-se «Preço final (sem IVA)» e o
 * que ela lá escreve é sempre a BASE; o que o documento guarda depende do
 * modo — em "acrescer" é a própria base, em "incluído" é a base já com o IVA
 * somado, porque é assim que o resolvedor a volta a ler.
 *
 * ── PORQUE É QUE A BASE É ARREDONDADA PRIMEIRO ─────────────────────────────
 * O estúdio fazia `base × (1+taxa)` e arredondava no fim. Com uma base a
 * chegar do PATCH do pedido com mais de dois decimais (999,995 €), a ida dava
 * 1.229,99 € e a volta devolvia 999,99 € — o campo mudava sozinho debaixo dos
 * dedos dela e o pedido e a proposta separavam-se por um cêntimo sem ninguém
 * ter tocado em nada. Um valor em euros tem cêntimos e mais nada: arredonda-se
 * ANTES de o multiplicar, e a ida e volta passa a devolver sempre o mesmo
 * número.
 */
export function totalAmountParaBase(
  base: number,
  mode: VatMode,
  vatRate: number = DEFAULT_VAT_RATE,
): number {
  const taxa = typeof vatRate === "number" && vatRate >= 0 ? vatRate : DEFAULT_VAT_RATE;
  const b = round2(base);
  return mode === "acrescer" ? b : round2(b * (1 + taxa));
}

/** Data de validade (yyyy-mm-dd) de uma proposta: honra uma `validUntil`
 *  explícita no doc, senão hoje + `validUntilDays` (por omissão
 *  {@link DEFAULT_VALID_DAYS}). `from` é injetável para testes. */
export function resolveValidUntil(
  doc: Pick<ProposalDoc, "validUntil" | "validUntilDays">,
  from: Date = new Date(),
): string {
  if (doc.validUntil && /^\d{4}-\d{2}-\d{2}$/.test(doc.validUntil)) return doc.validUntil;
  // Floor BEFORE the positivity check: a fraction < 1 (e.g. 0.5) must fall back
  // to the default like an integer 0 — never collapse to a same-day (0-day)
  // validity, which /proposta's end-of-day expiry would treat as valid only on
  // the day of sending.
  const flooredDays =
    typeof doc.validUntilDays === "number" ? Math.floor(doc.validUntilDays) : Number.NaN;
  const days = flooredDays > 0 ? flooredDays : DEFAULT_VALID_DAYS;
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Fills the fixed-text defaults into a partial doc, substituting the
 *  event-specific tokens in the general conditions. */
export function withProposalDefaults(
  doc: Omit<
    ProposalDoc,
    | "notasImportantes"
    | "incluido"
    | "naoIncluido"
    | "condicoesGerais"
    | "observacoesGerais"
    | "faseamento"
    | "cancelamento"
  > &
    Partial<
      Pick<
        ProposalDoc,
        | "notasImportantes"
        | "incluido"
        | "naoIncluido"
        | "condicoesGerais"
        | "observacoesGerais"
        | "faseamento"
        | "cancelamento"
      >
    >,
): ProposalDoc {
  const fill = (s: string) =>
    s.replace("{DATA}", doc.eventDate || "—").replace("{CONVIDADOS}", doc.guests || "—");
  return {
    ...doc,
    // Coerce the editor's variable arrays to [] — a corrupt/old localStorage
    // draft (merged in the studio on mount) could omit them, and the PDF
    // renderer iterates serviceGroups/budgetItems/… directly. A missing array
    // would throw "undefined is not iterable" → generic 500 "erro ao gerar".
    // Com `id` em cada grupo/item — preenchido pela POSIÇÃO quando falta (ver
    // {@link withServiceIds}), para o editor ter uma identidade estável por
    // linha sem que o documento serialize diferente a cada chamada.
    serviceGroups: withServiceIds(doc.serviceGroups ?? []),
    moodBoards: doc.moodBoards ?? [],
    cronograma: doc.cronograma ?? [],
    budgetItems: doc.budgetItems ?? [],
    budgetExtras: doc.budgetExtras ?? [],
    budgetRows: doc.budgetRows ?? [],
    // A capa sai sempre com as 2 posições preenchidas ("" = vazia), venha o
    // rascunho na forma antiga (esparsa/curta) ou já na nova.
    coverImages: normaliseCoverImages(doc.coverImages),
    notasImportantes: doc.notasImportantes ?? DEFAULT_NOTAS_IMPORTANTES,
    incluido: doc.incluido ?? DEFAULT_INCLUIDO,
    naoIncluido: doc.naoIncluido ?? DEFAULT_NAO_INCLUIDO,
    condicoesGerais: (doc.condicoesGerais ?? DEFAULT_CONDICOES_GERAIS).map(fill),
    observacoesGerais: doc.observacoesGerais ?? DEFAULT_OBSERVACOES_GERAIS,
    // O faseamento por omissão SEGUE a percentagem do sinal deste documento —
    // um faseamento escrito à mão continua a mandar, como todos os outros
    // blocos de texto fixo.
    faseamento: doc.faseamento ?? faseamentoPorOmissao(depositPercentOf(doc)),
    cancelamento: doc.cancelamento ?? DEFAULT_CANCELAMENTO,
  };
}
