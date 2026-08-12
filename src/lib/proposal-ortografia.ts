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
const PALAVRAS_CERTAS = [
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
 * A palavra certa, com as maiúsculas da que estava escrita.
 *
 * «CERIMONIA» num título em capitulares tem de voltar «CERIMÓNIA», e não
 * «cerimónia» — a correcção não pode trazer atrás uma alteração de desenho que
 * ninguém pediu.
 */
function comAsMaiusculasDe(escrita: string, certa: string): string {
  if (escrita === escrita.toUpperCase() && escrita !== escrita.toLowerCase()) {
    return certa.toUpperCase();
  }
  if (escrita[0] === escrita[0]?.toUpperCase()) {
    return certa[0].toUpperCase() + certa.slice(1);
  }
  return certa;
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
    case "itemRotulo":
    case "itemDesc": {
      const chave = campo.tipo === "itemRotulo" ? "label" : "desc";
      return {
        ...doc,
        serviceGroups: (doc.serviceGroups ?? []).map((g, i) =>
          i === campo.gi
            ? {
                ...g,
                items: (g.items ?? []).map((it, j) =>
                  j === campo.ii ? { ...it, [chave]: texto } : it,
                ),
              }
            : g,
        ),
      };
    }
    case "boardTitulo":
    case "boardSubtitulo":
    case "boardNota": {
      const chave =
        campo.tipo === "boardTitulo"
          ? "title"
          : campo.tipo === "boardSubtitulo"
            ? "subtitulo"
            : "annotation";
      return {
        ...doc,
        moodBoards: (doc.moodBoards ?? []).map((b, i) =>
          i === campo.bi ? { ...b, [chave]: texto } : b,
        ),
      };
    }
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
      const certa = POR_CHAVE.get(semAcentos(palavra));
      if (!certa) continue;
      // Já está certa (com ou sem maiúsculas)? Não há nada a dizer.
      if (palavra.toLowerCase() === certa.toLowerCase()) continue;
      if (jaVistas.has(palavra)) continue;
      jaVistas.add(palavra);
      achados.push({
        campo,
        rotulo,
        escrita: palavra,
        sugerida: comAsMaiusculasDe(palavra, certa),
        texto,
      });
    }
  }
  return achados;
}

/**
 * O documento com uma gralha corrigida.
 *
 * Substitui a palavra INTEIRA e só naquele campo. As fronteiras são olhadas à
 * mão (`(?<![\p{L}])`) porque `\b` do JavaScript não conhece letras acentuadas:
 * com `\b`, corrigir «área» dentro de «áreas» partia a palavra ao meio.
 */
export function corrigirGralha<T extends Partial<ProposalDoc>>(doc: T, g: Gralha): T {
  const texto = lerCampo(doc, g.campo);
  if (texto === undefined) return doc;
  const escapada = g.escrita.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapada}(?![\\p{L}\\p{N}])`, "gu");
  const novo = texto.replace(re, g.sugerida);
  if (novo === texto) return doc;
  return escreverCampo(doc, g.campo, novo);
}

/** Todas as gralhas de uma vez — o botão «corrigir tudo». */
export function corrigirTudo<T extends Partial<ProposalDoc>>(doc: T): T {
  let saida = doc;
  for (const g of gralhasDoDocumento(doc)) saida = corrigirGralha(saida, g);
  return saida;
}
