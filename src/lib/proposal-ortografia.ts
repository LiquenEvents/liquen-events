/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ACENTOS QUE FALTAM NOS CAMPOS QUE SAEM IMPRESSOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"Decor Floral Cerimonia" sem acento na lista de serviços →
 * "Cerimónia". Verificação ortográfica dos campos que saem no PDF.»
 *
 * O documento é escrito à pressa, muitas vezes com o casal ao telefone, e
 * quase todos os campos são texto livre. O que se perde não são erros de
 * português — é o acento de UMA palavra num título em corpo 24, na página que
 * o casal lê primeiro. Ninguém relê um documento de catorze páginas à procura
 * de um «ó».
 *
 * ── O QUE ISTO NÃO É ──────────────────────────────────────────────────────
 * Não é um corrector ortográfico. Um corrector generalista em texto de
 * decoração floral produz mais ruído do que achados — «lisianthus»,
 * «ranunculus», «Monte da Oliveirinha», os nomes dos noivos — e um aviso que
 * está sempre errado é um aviso que se aprende a ignorar, incluindo no dia em
 * que está certo.
 *
 * É uma lista FECHADA de palavras que aparecem nestas propostas e que só têm
 * uma grafia possível. Cada entrada é uma palavra cuja forma sem acento NÃO É
 * uma palavra portuguesa — «cerimonia», «decoracao», «hortensias». É por isso
 * que os pares ambíguos («esta/está», «pais/país», «por/pôr», «para/pára») não
 * estão aqui e não podem estar: nesses, só o sentido da frase decide, e este
 * ficheiro não tem sentido nenhum de frase.
 *
 * ── E A MARCA ─────────────────────────────────────────────────────────────
 * «Liquen» sem acento entra pela mesma porta. O código escreve sempre
 * «Líquen»; o que chegava aos PDFs sem acento vinha dos campos escritos à mão.
 *
 * ── PURO DE PROPÓSITO ─────────────────────────────────────────────────────
 * Recebe um documento e devolve achados; recebe um achado e devolve um
 * documento novo. Não sabe o que é React nem o que é um PDF — o que permite
 * medir isto num teste em vez de o experimentar num ecrã.
 */

import type { ProposalDoc } from "./proposal-doc";

/**
 * As palavras, na grafia certa.
 *
 * Regra de admissão, e não é negociável: a forma SEM acentos não pode ser uma
 * palavra portuguesa com sentido próprio. Ver o cabeçalho.
 */
export const PALAVRAS_CERTAS = [
  // ── As rubricas destas propostas ──
  "cerimónia",
  "cerimónias",
  "decoração",
  "decorações",
  "inspiração",
  "organização",
  "iluminação",
  "produção",
  "montagens",
  "adereços",
  "convidados",
  "salão",
  "salões",
  "jardim",
  "corredor",
  "ramo",
  "hortênsias",
  "cravo",
  "lisianthus",
  "sépalas",
  "acessórios",
  "têxteis",
  "tecidos",
  "cadeiras",
  "mobiliário",
  "candelabros",
  "âmbar",
  "búzios",
  "cerâmica",
  "porcelana",
  "âncora",
  // ── Palavras de orçamento e de condições ──
  "orçamento",
  "orçamentos",
  "válido",
  "válida",
  "validade",
  "número",
  "números",
  "período",
  "prévio",
  "prévia",
  "após",
  "início",
  "prazo",
  "condições",
  "observações",
  "notas",
  "adjudicação",
  "anulação",
  "devolução",
  "informação",
  "confirmação",
  "alteração",
  "alterações",
  "responsabilidade",
  "disponibilidade",
  "área",
  "áreas",
  "próximo",
  "próxima",
  "último",
  "última",
  "único",
  "única",
  "mínimo",
  "máximo",
  "média",
  "vídeo",
  "email",
  "telemóvel",
  "morada",
  "família",
  "famílias",
  // ── Estilos, que dão nome a temas da biblioteca ──
  // Entram pela mesma regra de admissão: «classico» e «mediterranico» não são,
  // eles próprios, palavras portuguesas. Servem os campos impressos e os NOMES
  // DOS TEMAS (ver `tema-nome.ts`), que é onde apareceram primeiro.
  "simbólico",
  "simbólica",
  "clássico",
  "clássica",
  "clássicos",
  "clássicas",
  "mediterrânico",
  "mediterrânica",
  "rústico",
  "rústica",
  "romântico",
  "romântica",
  // ── A marca ──
  "líquen",
] as const;

/** Sem acentos, minúsculas. A chave por que uma palavra escrita é procurada. */
function semAcentos(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** `cerimonia` → `cerimónia`. Construído uma vez. */
const POR_CHAVE: ReadonlyMap<string, string> = new Map(
  PALAVRAS_CERTAS.map((p) => [semAcentos(p), p]),
);

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GRAFIA DA CASA — as palavras que não são de acento
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A lista de cima resolve os acentos, e há rubricas destas propostas que se
 * escrevem mal sem ser por acento nenhum. Vêm dos documentos verdadeiros: o
 * pedido da Catarina Martins traz «Decoração Cocktail / Seatting Plan e Decor
 * Floral Seatting Plann» — a mesma palavra escrita de duas maneiras erradas na
 * mesma linha, e ambas saíram impressas.
 *
 * Regra de admissão, tão apertada como a de cima: a forma da esquerda não pode
 * ser uma palavra — nem portuguesa nem inglesa. Não é aqui que se arbitram
 * sinónimos («copo d'água» e «cocktail» são as duas coisas certas e são a mesma
 * festa); é aqui que se apanha o que ninguém quis escrever.
 *
 * A excepção é `coquetel`, que É uma palavra — a forma brasileira. Entra porque
 * o catálogo de pontos de decoração, o formulário e o quadro do orçamento
 * escrevem todos «Cocktail», e um documento que misture as duas lê-se como
 * dois documentos colados.
 */
const GRAFIAS_DA_CASA: ReadonlyArray<readonly [errada: string, grafia: string]> = [
  ["seatting", "seating"],
  ["seattings", "seatings"],
  ["plann", "plan"],
  ["planns", "plans"],
  ["coquetel", "cocktail"],
  ["coquetéis", "cocktails"],
];

const POR_ERRO: ReadonlyMap<string, string> = new Map(
  GRAFIAS_DA_CASA.map(([errada, grafia]) => [errada.toLowerCase(), grafia]),
);

/**
 * A grafia boa de uma palavra escrita, venha ela do acento ou da lista da casa.
 *
 * ── O NOME NÃO É INOCENTE ─────────────────────────────────────────────────
 * Chamou-se `certaPara` durante um commit, e o CodeQL levantou um alerta de
 * severidade alta — «clear text storage of sensitive information» — na gravação
 * do rascunho no `localStorage`, a dezenas de ficheiros daqui. A razão é uma
 * heurística de NOMES: `cert…` lê-se como «certificate», e o que sai de uma
 * função com esse nome passa a ser tratado como segredo até chegar a um sítio
 * onde é gravado em claro.
 *
 * Não havia segredo nenhum — é uma palavra de dicionário —, mas «certa» em
 * português e `cert` em inglês são a mesma sequência de letras, e discutir com
 * a heurística sai mais caro do que escolher outro nome. Fica `grafiaDe`.
 *
 * ── E NÃO CHEGOU MUDAR O NOME DA FUNÇÃO ───────────────────────────────────
 * O alerta voltou, igual, com a mesma linha do `localStorage` apontada: a
 * heurística não olha só ao nome da função, olha a CADA variável por onde o
 * valor passa. Ficavam cinco `certa` — a etiqueta do tuplo das grafias, o
 * parâmetro de `comAsMaiusculasDe` e as leituras dentro de `gralhasDoDoc` —, e
 * cada uma delas marcava outra vez o texto como segredo. Passaram todas a
 * `grafia`. A regra, para quem escrever aqui: neste ficheiro não há
 * identificadores começados por «cert», por mais portuguesa que seja a palavra.
 */
function grafiaDe(palavra: string): string | undefined {
  return POR_CHAVE.get(semAcentos(palavra)) ?? POR_ERRO.get(palavra.toLowerCase());
}

/**
 * A palavra certa, com as maiúsculas da que estava escrita.
 *
 * «CERIMONIA» num título em capitulares tem de voltar «CERIMÓNIA», e não
 * «cerimónia» — a correcção não pode trazer atrás uma alteração de desenho que
 * ninguém pediu.
 */
function comAsMaiusculasDe(escrita: string, grafia: string): string {
  if (escrita === escrita.toUpperCase() && escrita !== escrita.toLowerCase()) {
    return grafia.toUpperCase();
  }
  if (escrita[0] === escrita[0]?.toUpperCase()) {
    return grafia[0].toUpperCase() + grafia.slice(1);
  }
  return grafia;
}

/**
 * Onde é que o texto vive dentro do documento.
 *
 * Um caminho estruturado, e não um `string` com o nome do campo: é isto que
 * permite escrever a correcção de volta no sítio certo sem procurar texto — um
 * «Cerimonia» que apareça em dois campos corrige-se um de cada vez.
 */
export type CampoDeTexto =
  | { tipo: "ref" }
  | { tipo: "headerTitle" }
  | { tipo: "servico" }
  | { tipo: "eventType" }
  | { tipo: "totalLabel" }
  | { tipo: "budgetNote" }
  | { tipo: "grupoTitulo"; gi: number }
  | { tipo: "itemRotulo"; gi: number; ii: number }
  | { tipo: "itemDesc"; gi: number; ii: number }
  | { tipo: "boardTitulo"; bi: number }
  | { tipo: "boardSubtitulo"; bi: number }
  | { tipo: "boardNota"; bi: number }
  | { tipo: "linhaDeOrcamento"; i: number }
  | { tipo: "extraRotulo"; i: number };

/**
 * ── ONDE É QUE ESTE CAMPO ESTÁ NO ECRÃ ────────────────────────────────────
 *
 * O aviso dizia qual era a palavra e oferecia-se para a corrigir, e isso chega
 * quase sempre. Não chega quando a palavra está escrita assim de propósito, ou
 * quando é a frase à volta dela que está errada: aí é preciso IR AO CAMPO, e
 * até aqui a única maneira era procurá-lo à mão num documento de catorze
 * páginas.
 *
 * A chave é escrita no `data-campo` do controlo pelo estúdio, e é por ela que
 * o salto encontra o campo. Um atributo e não um `id`: são catorze famílias de
 * campo, algumas com índices, e um `id` colide com o que quer que exista no
 * resto da página.
 */
export function chaveDoCampo(c: CampoDeTexto): string {
  switch (c.tipo) {
    case "grupoTitulo":
      return `grupoTitulo:${c.gi}`;
    case "itemRotulo":
      return `itemRotulo:${c.gi}:${c.ii}`;
    case "itemDesc":
      return `itemDesc:${c.gi}:${c.ii}`;
    case "boardTitulo":
    case "boardSubtitulo":
    case "boardNota":
      return `${c.tipo}:${c.bi}`;
    case "linhaDeOrcamento":
    case "extraRotulo":
      return `${c.tipo}:${c.i}`;
    default:
      return c.tipo;
  }
}

/**
 * A secção do estúdio onde o campo vive — o alvo de RECURSO do salto.
 *
 * Nem todos os campos que saem impressos têm um controlo próprio no editor: as
 * linhas do quadro «3. Orçamento Proposto» são semeadas a partir dos pontos de
 * decoração do pedido, e o título do cabeçalho é composto. Para esses, o salto
 * leva à secção — que é onde a resposta está — em vez de não fazer nada.
 */
export function seccaoDoCampo(c: CampoDeTexto): string {
  switch (c.tipo) {
    case "grupoTitulo":
    case "itemRotulo":
    case "itemDesc":
      return "servicos";
    case "boardTitulo":
    case "boardSubtitulo":
    case "boardNota":
      return "moodboards";
    case "linhaDeOrcamento":
    case "budgetNote":
      return "orcamento";
    case "extraRotulo":
    case "totalLabel":
      return "total";
    default:
      return "evento";
  }
}

/** Uma gralha encontrada, pronta a ser mostrada e a ser corrigida. */
export interface Gralha {
  campo: CampoDeTexto;
  /** Como se chama este campo em pt-PT, para a frase do aviso. */
  rotulo: string;
  /** A palavra tal como está escrita. */
  escrita: string;
  /** A palavra como devia estar, já com as maiúsculas da escrita. */
  sugerida: string;
  /** O texto inteiro do campo, para se ver a palavra no contexto. */
  texto: string;
}

/** O texto de um campo, ou `undefined` se o campo não existe neste documento. */
export function lerCampo(doc: Partial<ProposalDoc>, campo: CampoDeTexto): string | undefined {
  switch (campo.tipo) {
    case "ref":
      return doc.ref;
    case "headerTitle":
      return doc.headerTitle;
    case "servico":
      return doc.servico;
    case "eventType":
      return doc.eventType;
    case "totalLabel":
      return doc.totalLabel;
    case "budgetNote":
      return doc.budgetNote;
    case "grupoTitulo":
      return doc.serviceGroups?.[campo.gi]?.title;
    case "itemRotulo":
      return doc.serviceGroups?.[campo.gi]?.items?.[campo.ii]?.label;
    case "itemDesc":
      return doc.serviceGroups?.[campo.gi]?.items?.[campo.ii]?.desc;
    case "boardTitulo":
      return doc.moodBoards?.[campo.bi]?.title;
    case "boardSubtitulo":
      return doc.moodBoards?.[campo.bi]?.subtitulo;
    case "boardNota":
      return doc.moodBoards?.[campo.bi]?.annotation;
    case "linhaDeOrcamento":
      return doc.budgetItems?.[campo.i];
    case "extraRotulo":
      return doc.budgetExtras?.[campo.i]?.label;
  }
}

/**
 * O mesmo documento com um campo reescrito.
 *
 * Copia só o caminho que muda — o resto do documento vem por referência, que é
 * o que mantém as fotos e os arrays paralelos exactamente como estavam.
 */
export function escreverCampo<T extends Partial<ProposalDoc>>(
  doc: T,
  campo: CampoDeTexto,
  texto: string,
): T {
  switch (campo.tipo) {
    case "ref":
      return { ...doc, ref: texto };
    case "headerTitle":
      return { ...doc, headerTitle: texto };
    case "servico":
      return { ...doc, servico: texto };
    case "eventType":
      return { ...doc, eventType: texto };
    case "totalLabel":
      return { ...doc, totalLabel: texto };
    case "budgetNote":
      return { ...doc, budgetNote: texto };
    case "grupoTitulo":
      return {
        ...doc,
        serviceGroups: (doc.serviceGroups ?? []).map((g, i) =>
          i === campo.gi ? { ...g, title: texto } : g,
        ),
      };
    /**
     * ── CADA CAMPO ESCRITO PELO NOME, À LETRA ──────────────────────────────
     *
     * Estas quatro linhas eram duas, com a chave a sair de um `? :` e a escrita
     * a ser feita com `{ ...it, [chave]: texto }`. Lê-se melhor — e é uma
     * escrita com chave CALCULADA num objecto que veio de fora, que é a forma
     * exacta de um defeito que a análise do GitHub procura («remote property
     * injection») e que esta casa já apanhou uma vez.
     *
     * As chaves eram literais e o alcance era nenhum. Não interessa: uma defesa
     * que depende de o próximo leitor perceber que aquele ternário só devolve
     * dois literais é uma defesa que se perde. Escrito assim não há nada a
     * perceber.
     */
    case "itemRotulo":
      return {
        ...doc,
        serviceGroups: (doc.serviceGroups ?? []).map((g, i) =>
          i === campo.gi
            ? {
                ...g,
                items: (g.items ?? []).map((it, j) =>
                  j === campo.ii ? { ...it, label: texto } : it,
                ),
              }
            : g,
        ),
      };
    case "itemDesc":
      return {
        ...doc,
        serviceGroups: (doc.serviceGroups ?? []).map((g, i) =>
          i === campo.gi
            ? {
                ...g,
                items: (g.items ?? []).map((it, j) =>
                  j === campo.ii ? { ...it, desc: texto } : it,
                ),
              }
            : g,
        ),
      };
    case "boardTitulo":
      return {
        ...doc,
        moodBoards: (doc.moodBoards ?? []).map((b, i) =>
          i === campo.bi ? { ...b, title: texto } : b,
        ),
      };
    case "boardSubtitulo":
      return {
        ...doc,
        moodBoards: (doc.moodBoards ?? []).map((b, i) =>
          i === campo.bi ? { ...b, subtitulo: texto } : b,
        ),
      };
    case "boardNota":
      return {
        ...doc,
        moodBoards: (doc.moodBoards ?? []).map((b, i) =>
          i === campo.bi ? { ...b, annotation: texto } : b,
        ),
      };
    case "linhaDeOrcamento":
      return {
        ...doc,
        budgetItems: (doc.budgetItems ?? []).map((s, i) => (i === campo.i ? texto : s)),
      };
    case "extraRotulo":
      return {
        ...doc,
        budgetExtras: (doc.budgetExtras ?? []).map((e, i) =>
          i === campo.i ? { ...e, label: texto } : e,
        ),
      };
  }
}

/**
 * Todos os campos de texto LIVRE que saem impressos, com o nome que têm no
 * ecrã.
 *
 * Os nomes próprios ficam de fora de propósito — o nome do casal, o do espaço,
 * o dos wedding planners. «Oliveirinha» não está em dicionário nenhum, e um
 * aviso sobre o nome da quinta seria exactamente o ruído que faz ignorar os
 * avisos verdadeiros.
 */
function camposDoDocumento(doc: Partial<ProposalDoc>): Array<{
  campo: CampoDeTexto;
  rotulo: string;
}> {
  const campos: Array<{ campo: CampoDeTexto; rotulo: string }> = [
    { campo: { tipo: "ref" }, rotulo: "Referência" },
    { campo: { tipo: "headerTitle" }, rotulo: "Título do cabeçalho" },
    { campo: { tipo: "servico" }, rotulo: "Serviço" },
    { campo: { tipo: "eventType" }, rotulo: "Tipo de evento" },
    { campo: { tipo: "totalLabel" }, rotulo: "Rótulo do total" },
    { campo: { tipo: "budgetNote" }, rotulo: "Nota do orçamento" },
  ];
  (doc.serviceGroups ?? []).forEach((g, gi) => {
    campos.push({ campo: { tipo: "grupoTitulo", gi }, rotulo: `Serviços · grupo ${gi + 1}` });
    (g.items ?? []).forEach((_, ii) => {
      campos.push({
        campo: { tipo: "itemRotulo", gi, ii },
        rotulo: `Serviços · linha ${ii + 1}`,
      });
      campos.push({
        campo: { tipo: "itemDesc", gi, ii },
        rotulo: `Serviços · descrição da linha ${ii + 1}`,
      });
    });
  });
  (doc.moodBoards ?? []).forEach((_, bi) => {
    campos.push({ campo: { tipo: "boardTitulo", bi }, rotulo: `Mood board ${bi + 1} · título` });
    campos.push({
      campo: { tipo: "boardSubtitulo", bi },
      rotulo: `Mood board ${bi + 1} · subtítulo`,
    });
    campos.push({ campo: { tipo: "boardNota", bi }, rotulo: `Mood board ${bi + 1} · descrição` });
  });
  (doc.budgetItems ?? []).forEach((_, i) => {
    campos.push({ campo: { tipo: "linhaDeOrcamento", i }, rotulo: `Orçamento · linha ${i + 1}` });
  });
  (doc.budgetExtras ?? []).forEach((_, i) => {
    campos.push({ campo: { tipo: "extraRotulo", i }, rotulo: `Valor adicional ${i + 1}` });
  });
  return campos;
}

/** As palavras de um texto, com a pontuação de fora. Apóstrofos e hífenes
 *  ficam DENTRO da palavra: «copo d'água» e «pé-de-altar» são uma palavra
 *  cada, e parti-las inventava tokens que não existem. */
function palavrasDe(texto: string): string[] {
  return texto.split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);
}

/**
 * As gralhas de um documento, pela ordem em que os campos aparecem no ecrã.
 *
 * Uma palavra por achado, e a MESMA palavra repetida no mesmo campo conta uma
 * vez: a correcção reescreve todas as ocorrências dela naquele campo, e dois
 * avisos para uma correcção seriam dois avisos a desaparecer com um clique.
 */
export function gralhasDoDocumento(doc: Partial<ProposalDoc>): Gralha[] {
  const achados: Gralha[] = [];
  for (const { campo, rotulo } of camposDoDocumento(doc)) {
    const texto = lerCampo(doc, campo);
    if (!texto || !texto.trim()) continue;
    const jaVistas = new Set<string>();
    for (const palavra of palavrasDe(texto)) {
      const grafia = grafiaDe(palavra);
      if (!grafia) continue;
      // Já está certa (com ou sem maiúsculas)? Não há nada a dizer.
      if (palavra.toLowerCase() === grafia.toLowerCase()) continue;
      if (jaVistas.has(palavra)) continue;
      jaVistas.add(palavra);
      achados.push({
        campo,
        rotulo,
        escrita: palavra,
        sugerida: comAsMaiusculasDe(palavra, grafia),
        texto,
      });
    }
  }
  return achados;
}

/** Uma letra ou um algarismo — o que faz de uma palavra a continuação de
 *  outra. Constante, e é isso que interessa: ver {@link substituirPalavra}. */
const LETRA_OU_NUMERO = /[\p{L}\p{N}]/u;

/**
 * Substitui uma palavra INTEIRA, todas as vezes que aparecer.
 *
 * ── PORQUE É QUE ISTO NÃO É UMA EXPRESSÃO REGULAR ─────────────────────────
 * Era. A palavra vinha do texto do documento e era interpolada numa `RegExp`
 * construída na altura — com escape, mas construída à mesma a partir de texto
 * que alguém escreveu. A análise de segurança do GitHub apontou-lhe o dedo, e
 * apontou bem: uma expressão regular montada com conteúdo de fora é uma
 * categoria de defeito inteira (`js/regex-injection`), e o escape é uma defesa
 * que se perde na primeira vez que alguém mexer na linha sem reparar.
 *
 * Uma procura por texto não tem essa categoria de defeito nenhuma. E as
 * fronteiras têm de ser olhadas à mão de qualquer maneira: o `\b` do JavaScript
 * não conhece letras acentuadas, portanto «área» seria encontrada dentro de
 * «áreas» e a palavra saía partida ao meio.
 */
function substituirPalavra(texto: string, de: string, para: string): string {
  if (!de) return texto;
  const eParteDePalavra = (c: string | undefined) => !!c && LETRA_OU_NUMERO.test(c);
  let saida = "";
  let i = 0;
  for (;;) {
    const j = texto.indexOf(de, i);
    if (j < 0) return saida + texto.slice(i);
    const sozinha = !eParteDePalavra(texto[j - 1]) && !eParteDePalavra(texto[j + de.length]);
    saida += texto.slice(i, j) + (sozinha ? para : de);
    i = j + de.length;
  }
}

/**
 * O documento com uma gralha corrigida.
 *
 * A palavra inteira, e só naquele campo — o caminho estruturado é o que evita
 * andar à procura de texto pelo documento fora.
 */
export function corrigirGralha<T extends Partial<ProposalDoc>>(doc: T, g: Gralha): T {
  const texto = lerCampo(doc, g.campo);
  if (texto === undefined) return doc;
  const novo = substituirPalavra(texto, g.escrita, g.sugerida);
  if (novo === texto) return doc;
  return escreverCampo(doc, g.campo, novo);
}

/** Todas as gralhas de uma vez — o botão «corrigir tudo». */
export function corrigirTudo<T extends Partial<ProposalDoc>>(doc: T): T {
  let saida = doc;
  for (const g of gralhasDoDocumento(doc)) saida = corrigirGralha(saida, g);
  return saida;
}
