"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "./Toast";
import { useInscricaoNoRegisto, type ResultadoDoEcra } from "./registo-de-gravacoes";
import {
  withProposalDefaults,
  resolveProposalMoney,
  totalAmountParaBase,
  detectVatMode,
  parseMoneyText,
  normaliseCoverImages,
  countPendingImages,
  isPendingImage,
  stripPendingImages,
  DEFAULT_VALID_DAYS,
  DEFAULT_VAT_RATE,
  MOOD_BOARD_MAX_IMAGES,
  type MoodBoard,
  type VatMode,
} from "@/lib/proposal-doc";
import { ordemDeSaida, eAOrdemEscrita, aplicarOrdem, ORDEM_EXPLICITA } from "@/lib/proposal-ordem";
import {
  CONTAGEM_VAZIA,
  comAcontecimento,
  emPalavras,
  totalAte,
  type Contagem,
} from "@/lib/tempo-activo";
import { ehRefDeTema } from "@/lib/theme-ref";
import { linhasDeOrcamento } from "@/lib/orcamento/decoracao";
import { guestRangeLabel, ceremonyTypeLabel } from "@/lib/orcamento/data";
import { urlAindaBom } from "./assinatura";
import { relatarFalhaDeImagem } from "./relatar-falha";
import PainelInterno from "./PainelInterno";
import Conferencia from "./Conferencia";
import Gralhas from "./Gralhas";
import MoodBoardIndice from "./MoodBoardIndice";
import PreviaDaPagina from "./PreviaDaPagina";
import { useFotoComPlanoB } from "./useFotoComPlanoB";
import VistaDeConjunto from "./VistaDeConjunto";
import LupaDeFotos from "./LupaDeFotos";
import {
  ArrastoDosMoodBoards,
  CartaoDeBoard,
  CelulaDeFoto,
  GrelhaDeFotos,
  ListaDeBoards,
  type LargadaDeFoto,
} from "./MoodBoardFotos";
import {
  filaDesequilibrada,
  fotoPrincipalDe,
  marcaDepoisDeMexer,
  ordemDasFotos,
  porqueEsteAutomatico,
  temLugarDeDestaque,
} from "@/lib/proposal-moodboard";
import {
  chaveDoCampo,
  corrigirGralha,
  corrigirTudo,
  gralhasDoDocumento,
  seccaoDoCampo,
  type CampoDeTexto,
} from "@/lib/proposal-ortografia";
import { fotosQueDestoam, ordemPorCor } from "@/lib/cor-dominante";
import Versoes from "./Versoes";
import { comoSeDiz, noMesmoEspaco, type FotoRepetida } from "@/lib/orcamento/fotos-repetidas";
import { marcarExtra, opcionaisDe, totaisDasVersoes } from "@/lib/orcamento/versoes-da-proposta";
import { custosDe } from "@/lib/orcamento/margem";
import {
  CONVIDADOS_POR_MESA_OMISSAO,
  convidadosDoDoc,
  escalasDe,
  formulaDaLinha,
  recalcular,
  totalDaLinha,
  type TipoDeEscala,
} from "@/lib/orcamento/escala";
import CriarAPartirDe, { type Escolha } from "./CriarAPartirDe";
import ModelosParciais from "./ModelosParciais";
import NavEstudio from "./NavEstudio";
import { estadoDasSeccoes, oQueFaltaParaEnviar, podeEnviar } from "@/lib/proposal-progress";
import { depositPercentOf } from "@/lib/proposal-doc";
// A geometria do documento, para a pré-visualização mostrar a forma que cada
// foto vai MESMO ter. Módulo próprio, sem `server-only`, exactamente para poder
// ser lido aqui — ver `proposal-geometria`. Os diagramas do selector de
// disposição saem das MESMAS caixas que o PDF desenha (`caixasDoMoodboard`):
// um segundo desenho, aproximado, mentia no dia em que divergisse.
import {
  ASPETO_POR_OMISSAO,
  aspetoDaCaixa,
  aspetoDaCapa,
  caixasDoMoodboard,
  layoutSugerido,
  PAGINA_H,
  PAGINA_W,
  perdaNaCapa,
  perdasDoMoodboard,
  PERDA_QUE_SE_AVISA,
  type LayoutDeMoodboard,
} from "@/lib/proposal-geometria";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { CampoAMudar } from "@/lib/proposal-copy";
import {
  adicionarLinha,
  definirItem,
  definirPreco,
  desalinhamento,
  linhasDe,
  normalizarValor,
  precosDe,
  removerLinha,
  somaDosExtrasSemIva,
  totaisDaProposta,
  asDuasFormas,
} from "@/lib/proposal-budget";
import { eur } from "@/lib/money";
import { randomId } from "./util";
import type { ActivityEntry, Quote } from "@/lib/orcamento/types";
import { prepareImageWithThumb, type ImageKind } from "./image-prep";
import ThemePicker, { type ImportedImage, type ReservedImage } from "./ThemePicker";
import ServicesEditor, { MoveBtns } from "./ServicesEditor";
import { aquecerBiblioteca, aquecerFotosEmSegundoPlano } from "./theme-picker-cache";
import { Ajuda, Button, Card, Field, Segmented } from "./ui";

/**
 * Visual editor for the studio's multi-page proposal PDF. Produces a
 * {@link ProposalDoc}-shaped payload (minus the fixed boilerplate, which the
 * server fills via {@link withProposalDefaults}) and previews / e-mails it.
 */
type StudioDoc = Parameters<typeof withProposalDefaults>[0];

// ── Shared styling (matches ProposalBuilder / PaymentsPanel) ──
/**
 * Fotos a preparar/enviar ao mesmo tempo num carregamento. Quatro é o mesmo
 * número que a Biblioteca de Temas usa: chega para a rede nunca ficar parada à
 * espera do processador (nem o contrário) sem encher a ligação da Catarina, que
 * é a mesma por onde ela está a trabalhar.
 */
const UPLOAD_CONCURRENCY = 4;

const INPUT_SM = "bo-input min-w-0 px-3 py-2 text-xs text-foreground/85";
const ADD_BTN =
  "alvo-toque !justify-start gap-1 text-xs font-medium text-[#4d6350] hover:text-[#415440] transition-colors inline-flex items-center";
const REMOVE_BTN =
  "alvo-toque text-foreground/30 hover:text-[#8a2a22] transition-colors text-base leading-none shrink-0";

const PT_MONTHS = [
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

const EVENT_TYPE_LABELS: Record<string, string> = {
  casamentos: "Casamento",
  batizados: "Batizado",
  aniversarios: "Aniversário",
  jantares_gala: "Jantar de Gala",
  conferencias: "Conferência",
  teambuilding: "Teambuilding",
  lancamentos: "Lançamento de Produto",
  jantares_empresa: "Jantar de Empresa",
};

function eventTypeLabel(q: Quote): string {
  if (q.eventType && EVENT_TYPE_LABELS[q.eventType]) return EVENT_TYPE_LABELS[q.eventType];
  if (q.category === "empresas") return "Evento Corporativo";
  return "Casamento";
}

/** yyyy-mm-dd → "12 de setembro de 2026"; passes through anything else. */
function formatEventDate(d?: string): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return d;
  return `${Number(m[3])} de ${PT_MONTHS[month - 1]} de ${m[1]}`;
}

function buildRef(d: StudioDoc): string {
  const tpl = d.template === "organizacao" ? "Organização" : "Decoração";
  return `${tpl} ${d.eventType} ${d.clientNames} · ${d.eventDate}`.replace(/\s+/g, " ").trim();
}

/** "Maria & Zé" a partir dos nomes que o casal deu, ou "" se não deu nenhum.
 *  Com um só nome escrito, devolve esse — meio par continua a ser melhor do que
 *  o nome de quem preencheu o formulário. */
function nomesDoCasal(quote: Quote): string {
  const par = [quote.partnerA, quote.partnerB].map((n) => n?.trim()).filter(Boolean);
  return par.join(" & ");
}

function initialDoc(quote: Quote): StudioDoc {
  const base: StudioDoc = {
    template: "decoracao",
    ref: "",
    // Se o casal escreveu os dois nomes no pedido, a proposta abre dirigida a
    // ELES. O `quote.name` é de quem escreveu — pode ser a mãe da noiva ou uma
    // planner, e uma proposta endereçada a quem preencheu o formulário em vez
    // de a quem casa lê-se como um erro de quem a mandou.
    clientNames: nomesDoCasal(quote) || (quote.name ?? ""),
    eventType: eventTypeLabel(quote),
    eventDate: formatEventDate(quote.date),
    location: quote.location ?? "",
    // Sem número exacto, vale a ordem de grandeza que o casal deu ("100 a 150").
    // Escrever "0 pax" era pior do que não escrever nada.
    guests: quote.guests ? `${quote.guests} pax` : guestRangeLabel(quote.guestsRange),
    // A cerimónia que o casal escolheu no pedido, já escrita no documento.
    // O campo existe desde sempre («Civil, simbólica») e abria vazio, para ela
    // preencher à mão a partir do que estivesse no pedido — que era exactamente
    // onde a resposta se perdia. Continua editável: isto é uma semente, não uma
    // trave, e um casal que muda de ideias muda-se aqui.
    //
    // Em português mesmo quando o pedido veio em inglês: o documento do estúdio
    // é escrito em português.
    ceremony: ceremonyTypeLabel(quote.ceremonyType),
    time: "",
    serviceGroups: [],
    moodBoards: [],
    cronograma: [],
    budgetItems: [],
    budgetExtras: [],
    totalLabel: "Valor Total Decoração",
    totalText: "",
    budgetRows: [],
    totalEstimatedText: "",
    budgetNote: "",
    coverImages: normaliseCoverImages(),
  };
  base.ref = buildRef(base);
  return base;
}

/** Passos do fluxo guiado do estúdio. */
type Step = "conteudo" | "prever" | "enviar";
const STEPS: { id: Step; n: string; label: string }[] = [
  { id: "conteudo", n: "1", label: "Conteúdo" },
  { id: "prever", n: "2", label: "Pré-visualizar" },
  { id: "enviar", n: "3", label: "Enviar" },
];

/** Numa proposta nova/vazia, semeia um grupo de serviços com um item — para que
 *  o estúdio não abra como uma parede de botões "+ Adicionar" vazios. Nunca
 *  toca num rascunho que já tenha conteúdo. */
/**
 * Põe a BASE (o "Preço final (sem IVA)" do pedido) no documento, respeitando o
 * modo de IVA em vigor.
 *
 * `resolveProposalMoney` lê `totalAmount` como a base em "acrescer" e como o
 * BRUTO em "incluído" — por isso o valor guardado tem de ser derivado, para a
 * base ser sempre o número do pedido nos dois modos.
 */
function aplicarBase(d: StudioDoc, base: number): StudioDoc {
  const mode: VatMode = d.totalVatMode ?? detectVatMode(d.totalText || d.totalEstimatedText);
  const rate = d.vatRate ?? DEFAULT_VAT_RATE;
  // A conta é a partilhada, e não uma cópia: arredondar a base ANTES de a
  // multiplicar é o que faz base → bruto → base devolver o mesmo número. Feita
  // à mão aqui, uma base com mais de dois decimais perdia um cêntimo em cada
  // ida e volta, e o campo mudava sozinho debaixo dos dedos dela.
  const amount = totalAmountParaBase(base, mode, rate);
  const text = mode === "acrescer" ? `${eur(amount)} + IVA` : eur(amount);
  return d.template === "organizacao"
    ? { ...d, totalAmount: amount, totalVatMode: mode, totalEstimatedText: text }
    : { ...d, totalAmount: amount, totalVatMode: mode, totalText: text };
}

/**
 * A BASE (sem IVA) de um documento, seja qual for o modo.
 *
 * O campo do estúdio mostra SEMPRE a base — é o número que o pedido guarda e o
 * que o rótulo "(sem IVA)" promete. Mas `totalAmount` só é a base em modo
 * "acrescer"; em "incluído" é o BRUTO. Encher o campo com o valor cru mostrava
 * 9963 onde o pedido dizia 8100. Medido.
 */
function baseDoDoc(d: Partial<StudioDoc>): number | undefined {
  const m = resolveProposalMoney(d as StudioDoc);
  return m.base > 0 ? m.base : undefined;
}

function seedDefaults(d: StudioDoc, quote: Quote): StudioDoc {
  const quotedPrice = quote.quotedPrice;
  // O que o casal marcou no pedido de orçamento. É a razão de ser desta
  // funcionalidade: a proposta da Catarina Martins saiu com cinco pontos, ela
  // pediu para refazer com três, e o trabalho teve de ser todo repetido. Se o
  // casal já disse o que quer, a proposta abre com esses pontos e mais nenhum.
  const linhas = linhasDeOrcamento(quote.decorPoints ?? []);
  let next = d;
  if (next.serviceGroups.length === 0) {
    next = {
      ...next,
      serviceGroups: [
        linhas.length > 0
          ? {
              letter: "a)",
              title: "Decoração Floral e Decoração",
              items: linhas.map((label) => ({ label, desc: "" })),
            }
          : { letter: "a)", title: "", items: [{ label: "", desc: "" }] },
      ],
    };
  }
  // O quadro "3. Orçamento Proposto" com as mesmas linhas. Sem preços: o valor
  // continua a ser um só, no total, tal como nas propostas dela.
  if (next.budgetItems.length === 0 && linhas.length > 0) {
    next = { ...next, budgetItems: [...linhas] };
  }
  // O valor vem do "Preço final (sem IVA)" do pedido, e é o mesmo número —
  // não há aqui um segundo. A condição `== null` que aqui estava era a origem
  // do defeito: uma vez semeado, o estúdio deixava de acompanhar o pedido e os
  // dois números separavam-se em silêncio. Agora semeia-se SEMPRE, e o efeito
  // de sincronização trata das alterações posteriores.
  if (typeof quotedPrice === "number" && quotedPrice > 0) {
    // `totalAmount` NÃO é o preço do pedido: é a base em «acrescer» e o BRUTO
    // em «IVA incluído». Escrever aqui o líquido cru fazia uma proposta já em
    // «IVA incluído» perder 23% em silêncio — o número do pedido passava a ser
    // lido como se já trouxesse o imposto dentro.
    const modo: VatMode = next.totalVatMode ?? "acrescer";
    next = {
      ...next,
      totalAmount: totalAmountParaBase(quotedPrice, modo, next.vatRate ?? DEFAULT_VAT_RATE),
      totalVatMode: modo,
    };
  }
  return next;
}

/**
 * Quantos passos atrás o Cmd+Z consegue ir.
 *
 * Cada passo é um documento inteiro em memória. Cinquenta chegam de sobra
 * para desfazer um engano — ninguém carrega em Cmd+Z cinquenta vezes seguidas
 * — e mantêm a conta de memória modesta mesmo numa proposta com muitos mood
 * boards (os documentos guardam caminhos de fotos, não bytes).
 */
const MAX_HISTORICO = 50;

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

/**
 * Reescreve TODAS as posições de foto do documento (capas + mood boards) com
 * `f`, que devolve o caminho novo ou `null` para a foto sair.
 *
 * Um só sítio a andar por dentro do documento à procura de fotos, porque as
 * duas operações do estado provisório — trocar o marcador pelo caminho
 * definitivo e tirar o marcador que ficou sem foto — têm de tratar os DOIS
 * sítios da mesma maneira, e falhar um deles deixaria um `pending:` para trás.
 *
 * Numa capa, "sair" é ficar `""` e NÃO encolher o array: é a posição que decide
 * o lado onde a foto é impressa. Num mood board é ordem, e sai mesmo.
 *
 * Devolve o mesmo objeto quando nada muda — uma entrega que já não encontra o
 * seu lugar (a foto foi removida à mão entretanto) não pode marcar o rascunho
 * como alterado.
 */
function mapImagePaths(d: StudioDoc, f: (path: string) => string | null): StudioDoc {
  let changed = false;
  const cover = normaliseCoverImages(d.coverImages).map((p) => {
    if (!p) return p;
    const next = f(p);
    if (next === p) return p;
    changed = true;
    return next ?? "";
  });
  const boards = d.moodBoards.map((b) => {
    let touched = false;
    const images: string[] = [];
    for (const p of b.images) {
      const next = f(p);
      if (next !== p) touched = true;
      if (next !== null) images.push(next);
    }
    if (!touched) return b;
    changed = true;
    return { ...b, images };
  });
  return changed ? { ...d, coverImages: cover, moodBoards: boards } : d;
}

// ── O que o PDF não leva ──
//
// Há duas maneiras de uma proposta seguir para o cliente incompleta, e a
// Catarina tem de ver as DUAS antes de a enviar:
//
//  1. a foto não chegou — o servidor não a conseguiu ir buscar (`missingImages`);
//  2. o conteúdo chegou e NÃO COUBE — a sétima foto de um mood board, a
//     terceira linha do "Local", uma descrição comprida de mais (`truncations`).
//
// O caso 2 era completamente mudo: as fotos eram carregadas, descarregadas com
// sucesso, e simplesmente nunca desenhadas. Vem agora do gerador já com o sítio
// e a quantidade; aqui só se escreve a frase.

/** Uma perda por composição, tal como o gerador a relata (o tipo vive em
 *  `proposal-doc-pdf`, que é `server-only` e por isso não se importa aqui). */
interface Corte {
  where: string;
  dropped: number;
  unit: "fotos" | "linhas";
}

/** Aceita só o que tem forma de corte — o resto é ignorado em vez de rebentar
 *  a mensagem (uma resposta estranha nunca pode tapar o aviso). */
function normalizaCortes(raw: unknown): Corte[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is Corte =>
      !!c &&
      typeof c === "object" &&
      typeof (c as Corte).where === "string" &&
      typeof (c as Corte).dropped === "number" &&
      (c as Corte).dropped > 0 &&
      ((c as Corte).unit === "fotos" || (c as Corte).unit === "linhas"),
  );
}

/** Lê o cabeçalho `X-Conteudo-Cortado` da pré-visualização (JSON em base64 —
 *  o corpo da resposta é o PDF e os nomes dos campos trazem acentos). */
export function cortesDoCabecalho(header: string | null): Corte[] {
  if (!header) return [];
  try {
    const bytes = Uint8Array.from(atob(header), (ch) => ch.charCodeAt(0));
    return normalizaCortes(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return [];
  }
}

/** "Mood board «Cerimónia»: 3 fotos não entram no PDF". */
function fraseDeCorte(c: Corte): string {
  if (c.unit === "fotos") {
    return `${c.where}: ${c.dropped === 1 ? "1 foto não entra" : `${c.dropped} fotos não entram`} no PDF`;
  }
  return `${c.where}: ${c.dropped === 1 ? "1 linha cortada" : `${c.dropped} linhas cortadas`}`;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE FALHOU, QUANDO O SERVIDOR NEM CHEGA A EXPLICAR-SE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Todas as falhas do envio caíam na MESMA frase de oito palavras — «Não foi
 * possível enviar a proposta.» — porque o código lia a explicação do corpo da
 * resposta, e as falhas que não trazem corpo nenhum ficavam sem nada.
 *
 * A pior delas é o TEMPO ESGOTADO: a plataforma mata a função e responde com
 * uma página de erro que não é sequer JSON. Do lado dela, um botão que roda e
 * uma frase que não distingue «a base recusou» de «demorou demais» de «não
 * estás autenticada». Foi com essa frase que este problema chegou até mim, e é
 * também por isso que demorou a ser encontrado.
 *
 * O código de estado não é um detalhe técnico a esconder: é a única coisa que
 * distingue estes casos, e cada um tem uma acção diferente do outro lado.
 */
export function porqueFalhouOEnvio(status: number): string {
  if (status === 504 || status === 502 || status === 408) {
    return (
      "O servidor demorou demasiado a preparar a proposta e desistiu a meio. " +
      "Propostas com muitas fotografias demoram mais — tenta outra vez; se voltar a " +
      "acontecer, tira algumas fotos dos mood boards."
    );
  }
  if (status === 401 || status === 403) {
    return "A sessão expirou. Volta a entrar e tenta de novo — o rascunho está guardado.";
  }
  if (status === 413) {
    return "A proposta é grande demais para ser guardada. Tira algumas fotos ou encurta os textos.";
  }
  if (status === 503) {
    return "O serviço não está disponível neste momento. Tenta daqui a pouco.";
  }
  return `Não foi possível enviar a proposta (erro ${status}).`;
}

/**
 * A frase única do aviso, ou `null` quando o documento vai completo.
 *
 * As duas perdas aparecem JUNTAS porque, para quem vai carregar em "Enviar", o
 * problema é o mesmo — o documento vai incompleto — mas ficam DISTINTAS na
 * frase, porque a correcção não é a mesma: uma foto que não chegou tenta-se de
 * novo, um mood board com fotos a mais tem de perder fotos.
 */
export function avisoDeConteudoIncompleto(emFalta: number, cortes: Corte[]): string | null {
  const partes: string[] = [];
  if (emFalta > 0) {
    // "buscá-la OU desenhá-la": a contagem cobre as duas avarias — a foto que
    // não se conseguiu ir buscar ao armazenamento e a que se foi buscar e não
    // se conseguiu imprimir (um WebP antigo da biblioteca, bytes corrompidos).
    // Para quem envia é a mesma perda e a mesma correcção: recarregar a foto.
    partes.push(
      emFalta === 1
        ? "1 foto não entrou (não foi possível ir buscá-la ou desenhá-la)"
        : `${emFalta} fotos não entraram (não foi possível ir buscá-las ou desenhá-las)`,
    );
  }
  for (const c of cortes) partes.push(fraseDeCorte(c));
  return partes.length ? partes.join("; ") : null;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS ESTADOS DO INDICADOR DE GRAVAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tinha dois — «a guardar…» e «guardado às 14:32» — e o segundo era dito
 * também quando a gravação no servidor tinha falhado, porque a cópia local
 * tinha corrido bem e mais nada era verificado. «Guardado» é a palavra que faz
 * uma pessoa fechar o portátil descansada, e foi exactamente isso que
 * aconteceu: uma proposta inteira ficou num `localStorage` e o ecrã disse, o
 * tempo todo, que estava guardada.
 *
 * O terceiro estado tem de ser LIDO, não decifrado. Por isso não é um visto de
 * outra cor: são as palavras «só neste computador», por extenso, também no
 * telemóvel — é a única forma de a informação mudar o que a pessoa faz a
 * seguir.
 */
export type EstadoDaGravacaoNoEcra = "a-guardar" | "so-neste-computador" | "guardado";

export function textoDaGravacao(
  estado: EstadoDaGravacaoNoEcra,
  gravadoEm: Date | null,
): { curto: string; longo: string; leitor: string } {
  if (estado === "a-guardar") {
    return { curto: "…", longo: "a guardar…", leitor: "a guardar" };
  }
  const horas = gravadoEm
    ? gravadoEm.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
    : "";
  if (estado === "so-neste-computador") {
    // A hora entra na frase porque a pergunta seguinte dela é sempre «desde
    // quando?» — é o que lhe diz quanto trabalho está em risco.
    return {
      curto: "⚠ guardado só neste computador",
      longo: horas ? `guardado só neste computador às ${horas}` : "guardado só neste computador",
      leitor: "atenção: o rascunho está guardado só neste computador e não chegou ao servidor",
    };
  }
  return { curto: "✓", longo: `guardado às ${horas}`, leitor: "rascunho guardado no servidor" };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTAS LINHAS JÁ TÊM PREÇO — E PORQUE É QUE ISSO PRECISA DE SER DITO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre o `placeholder="900"` que estava no campo do preço: «um
 * número redondo e plausível como placeholder num campo de preço é perigoso —
 * mais cedo ou mais tarde alguém pensa que já está preenchido». Tinha razão, e
 * o caso já tinha acontecido: uma proposta de 2.460,00 € com QUATRO serviços
 * sem preço nenhum mostrava «900» a cinzento em todos eles, e a única coisa
 * legível no orçamento inteiro era uma deslocação de 75,00 €.
 *
 * O placeholder saiu. Mas tirar a mentira não chega — é preciso dizer a
 * verdade, e a verdade é um número: quantas das linhas têm mesmo preço. Um
 * contador responde à pergunta de uma vez, sem obrigar a percorrer o formulário
 * a contar caixas vazias.
 *
 * `incompleta` é o caso que faz uma soma mentir sem parecer: UMAS linhas com
 * preço e outras sem. Nem tudo por orçamentar (aí não há soma nenhuma, e a
 * biblioteca devolve `null`), nem tudo orçamentado — o meio, que é onde a soma
 * dá um número plausível que está errado por baixo.
 */
export function contagemDePrecos(precos: (number | null)[]): {
  comPreco: number;
  total: number;
  semPreco: number;
  incompleta: boolean;
  frase: string;
} {
  const total = precos.length;
  const comPreco = precos.filter((p) => p !== null).length;
  const semPreco = total - comPreco;
  return {
    comPreco,
    total,
    semPreco,
    // Só há soma incompleta quando há mesmo uma soma a fazer: zero linhas com
    // preço é «ainda não orçamentei», não «orçamentei mal».
    incompleta: comPreco > 0 && semPreco > 0,
    frase: `${comPreco} de ${total} ${total === 1 ? "linha" : "linhas"} com preço`,
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O IVA QUE UM VALOR ADICIONAL DECLARA — PERGUNTADO À BIBLIOTECA, NÃO ADIVINHADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os valores adicionais são texto («896,00 €», «895,00 € + IVA») e esse texto é
 * impresso no PDF tal e qual. Quem decide o que ele quer dizer é
 * `somaDosExtrasSemIva`, em `proposal-budget.ts`: uma linha que diz «+ IVA» é
 * líquida, uma que diz «IVA incluído» é bruta, e uma calada segue o modo do
 * documento.
 *
 * Para o ecrã poder mostrar essa escolha num selector é preciso LER de volta o
 * que a linha declara — e isso podia ser feito com uma cópia da expressão
 * regular que está lá dentro. Não é: uma segunda cópia diverge no dia em que
 * alguém acrescentar uma forma de escrever «sem IVA», e o selector passaria a
 * mostrar uma coisa e a soma a fazer outra, em silêncio.
 *
 * Em vez disso pergunta-se à própria função, duas vezes, com contextos
 * opostos. Uma linha CALADA responde de maneira diferente conforme o contexto
 * (é essa a definição de calada); uma linha que declara responde o mesmo às
 * duas. E o valor devolvido diz qual das duas declarações é.
 */
export type ModoDeIvaDoAdicional = "documento" | "acrescer" | "incluido";

export function modoDoAdicional(valueText: string, vatRate: number): ModoDeIvaDoAdicional {
  const cru = normalizarValor(valueText);
  // Sem número legível («a definir») não há IVA nenhum a declarar.
  if (cru === null || cru === 0) return "documento";
  const linha = [{ label: "", valueText }];
  const comoLiquido = somaDosExtrasSemIva(linha, { mode: "acrescer", vatRate });
  const comoBruto = somaDosExtrasSemIva(linha, { mode: "incluido", vatRate });
  if (comoLiquido !== comoBruto) return "documento";
  // Responde o mesmo aos dois contextos: a linha declara. Se o que responde é
  // o próprio número escrito, declarou-se líquida («+ IVA»); se responde menos,
  // declarou-se bruta e a função converteu-a («IVA incluído»).
  return Math.abs(comoLiquido - cru) < 0.005 ? "acrescer" : "incluido";
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O NÚMERO ESCRITO NO CAMPO DO TOTAL — COM VÍRGULA, SEMPRE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O campo do total é TEXTO (aceita «1.500» e «1 500 €» a meio de serem
 * escritos) e é relido com `parseMoneyText`, que segue o português: o ponto é
 * separador de MILHARES, a vírgula é o decimal.
 *
 * Quem escrevia neste campo por código usava `String(n)`, e o JavaScript
 * escreve os decimais com PONTO. `String(3355.98)` dava «3355.98», que
 * `parseMoneyText` relê como 335 598 — cem vezes mais. Media-se assim:
 *
 *     parseMoneyText(String(3355.98))  →  335598
 *     parseMoneyText("3355,98")        →  3355.98
 *
 * Aconteceu de verdade no botão «Usar X €»: com uma proposta de 2.460,00 € e
 * uma deslocação de 75,00 € lida com IVA incluído, a sugestão é 3.355,98 € e o
 * campo ficava com 335.598,00 € — e esse número seguia para o preço final do
 * pedido, para o sinal e para a fatura. O mesmo valia para qualquer total com
 * cêntimos escrito por um valor adicional, por uma versão reposta ou por uma
 * proposta copiada.
 *
 * Um número inteiro sai como sempre saiu («2460»), para não mudar o que ela vê
 * no caso normal.
 */
export function textoDoTotal(base: number): string {
  return Number.isInteger(base) ? String(base) : String(base).replace(".", ",");
}

/**
 * O texto que fica GRAVADO num valor adicional — o mesmo que o PDF imprime.
 *
 * O campo do valor passou a ser numérico (ela escrevia «1.500», «1500» e
 * «1 500 €» conforme a pressa, e as três tinham de dar o mesmo número), mas o
 * documento continua a guardar TEXTO: é o que o gerador desenha, e é lá que
 * mora a informação de «+ IVA» que não se pode perder. Este é o único sítio
 * onde os dois se juntam.
 *
 * Um valor que não se consegue ler («a definir», «sob consulta») fica exactamente
 * como foi escrito: é uma frase que o casal tem de ver na proposta, não um
 * número que se possa formatar.
 */
export function textoDoAdicional(escrito: string, modo: ModoDeIvaDoAdicional): string {
  const valor = normalizarValor(escrito);
  if (valor === null) return escrito;
  if (modo === "acrescer") return `${eur(valor)} + IVA`;
  if (modo === "incluido") return `${eur(valor)} (IVA incluído)`;
  return eur(valor);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RASCUNHO NO SERVIDOR — E O QUE SE FAZ QUANDO ELE NÃO LÁ CHEGA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta gravação era um `fetch` seco: `if (!res.ok) return`, e um `catch` vazio
 * com o comentário «offline — a cópia local guarda o trabalho até haver rede».
 * A cópia local guarda mesmo — mas só naquele computador. Uma colaboradora
 * montou uma proposta inteira com esta chamada a falhar de cada vez, o
 * indicador a dizer «guardado às 14:32» o tempo todo, e quem a foi abrir noutra
 * máquina encontrou o ecrã vazio.
 *
 * Duas coisas mudam. A primeira é REPETIR: uma gravação que morre por causa de
 * uma ligação que caiu não pode morrer à primeira. É o mesmo desenho de
 * `proposal-storage.descarregar` e da segunda tentativa do envio — tentativas
 * com pausa curta e crescente, e um tecto de tempo por tentativa para um pedido
 * pendurado não segurar o resto. A segunda é DIZER o que aconteceu, que é a
 * parte que faltava por inteiro.
 *
 * O que não se repete: um 4xx (o pedido é que está errado — sessão expirada,
 * rascunho grande demais) e um 503 marcado como `permanente` (a instalação não
 * tem a tabela, ou a chave não a pode escrever). Nesses, tentar outra vez dá
 * exactamente a mesma resposta e só atrasa o aviso.
 */
const GRAVACAO_TENTATIVAS = 3;
const GRAVACAO_PAUSA_MS = 400;
const GRAVACAO_TECTO_MS = 10000;

export type ResultadoDaGravacao =
  | { estado: "guardado"; updatedAt?: string; overwrote?: boolean; previousBy?: string }
  /** Não ficou no servidor. O trabalho está no ecrã e na cópia local — e é isso
   *  mesmo que a pessoa tem de ouvir, com estas palavras. */
  | { estado: "so-local"; porque?: string };

/** Um `fetch` com tecto de tempo próprio. Sem ele, uma rede que aceita a
 *  ligação e nunca responde deixa a gravação pendurada para sempre — e o
 *  indicador ficaria eternamente em «a guardar…», que é outra maneira de
 *  mentir. */
async function fetchComTecto(url: string, init: RequestInit, ms: number): Promise<Response> {
  const abortador = new AbortController();
  const t = setTimeout(() => abortador.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: abortador.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Grava o rascunho no servidor, repetindo enquanto fizer sentido, e devolve a
 * VERDADE sobre onde ele ficou. Nunca lança.
 */
export async function gravarRascunhoNoServidor(
  quoteId: string,
  corpo: { doc: unknown; baseUpdatedAt: string | null },
): Promise<ResultadoDaGravacao> {
  let porque: string | undefined;
  for (let tentativa = 1; tentativa <= GRAVACAO_TENTATIVAS; tentativa++) {
    try {
      const res = await fetchComTecto(
        `/api/orcamento/${quoteId}/proposta-rascunho`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        },
        GRAVACAO_TECTO_MS,
      );
      const dados = await res.json().catch(() => null);
      if (res.ok) {
        return {
          estado: "guardado",
          updatedAt: typeof dados?.updatedAt === "string" ? dados.updatedAt : undefined,
          overwrote: Boolean(dados?.overwrote),
          previousBy: typeof dados?.previousBy === "string" ? dados.previousBy : undefined,
        };
      }
      porque = typeof dados?.erro === "string" ? dados.erro : undefined;
      // Um 4xx é o pedido que está errado, e repeti-lo dá o mesmo. Um 503
      // `permanente` é a instalação que está incompleta — também dá o mesmo.
      if (res.status < 500 || dados?.permanente === true) break;
    } catch {
      // Rede em baixo, ou o tecto de tempo. É exactamente o caso que a
      // repetição existe para apanhar.
      porque = undefined;
    }
    if (tentativa < GRAVACAO_TENTATIVAS) {
      await new Promise((r) => setTimeout(r, GRAVACAO_PAUSA_MS * tentativa));
    }
  }
  return { estado: "so-local", porque };
}

interface Props {
  quote: Quote;
  /**
   * Os outros pedidos, só para o painel interno saber o que ela costuma cobrar
   * num casamento desta dimensão. Opcional: sem eles o estúdio funciona na
   * mesma e o aviso de "valor fora do habitual" simplesmente não aparece —
   * comparar com dois eventos seria pior do que não comparar.
   */
  quotes?: Quote[];
  onSent?: () => void;
  /**
   * O valor mudou aqui. O pai actualiza a sua cópia do pedido para o "Preço
   * final" da Gestão do pedido mostrar o mesmo número — porque é o MESMO
   * número: o estúdio grava-o no pedido, não guarda um segundo.
   */
  onQuoteUpdated?: (quote: Quote) => void;
}

export default function ProposalStudio({ quote, quotes, onSent, onQuoteUpdated }: Props) {
  const { toast } = useToast();
  const DRAFT_KEY = `liquen-proposal-studio-${quote.id}`;
  const SIDE_KEY = `${DRAFT_KEY}:meta`;

  const [doc, setDoc] = useState<StudioDoc>(() => initialDoc(quote));
  const [copiarAberto, setCopiarAberto] = useState(false);
  /**
   * Os campos que vieram de OUTRA proposta e ainda não foram confirmados.
   *
   * Depois de copiar, estes cinco são os únicos que mudam de casamento para
   * casamento — e são exactamente aqueles cujo erro só se descobre com o PDF
   * já enviado. Ficam marcados até ela lhes tocar.
   */
  const [porConfirmar, setPorConfirmar] = useState<Set<CampoAMudar>>(() => new Set());
  /** Caixa do nome, aberta pelo "Guardar como modelo" do cabeçalho. */
  const [nomeModelo, setNomeModelo] = useState<string | null>(null);
  /** Quando foi gravado — para o indicador discreto "Guardado às 14:32". */
  const [gravadoEm, setGravadoEm] = useState<Date | null>(null);
  /** Há alterações à espera do debounce? É o que o aviso de saída lê. */
  const [porGravar, setPorGravar] = useState(false);
  /**
   * ── O TERCEIRO ESTADO DO INDICADOR ────────────────────────────────────────
   *
   * O indicador tinha dois: «a guardar…» e «guardado às 14:32». Faltava o que
   * de facto acontecia quando o servidor recusava a gravação — o rascunho ficava
   * no `localStorage` DESTE computador e em mais lado nenhum, e o ecrã dizia
   * «guardado», que é a palavra que faz uma pessoa fechar o portátil descansada.
   *
   * É por isso que este estado existe e é por isso que o que ele mostra tem de
   * ser lido de longe: quem está a trabalhar não vai investigar um visto cinzento
   * — só muda de comportamento se lhe disserem, com estas palavras, que o
   * trabalho está guardado SÓ NESTE COMPUTADOR.
   *
   * `porque` é o que se sabe da causa (a tabela em falta, as permissões), para o
   * aviso poder dizer o que resolver em vez de só que não deu.
   */
  const [soNesteComputador, setSoNesteComputador] = useState<{ porque?: string } | null>(null);
  /** Já dissemos isto em voz alta? O indicador diz-o sempre; o aviso grande
   *  aparece UMA vez, para não virar ruído a cada 800 ms. */
  const avisouSoLocal = useRef(false);
  /**
   * Quantas gravações estão AGORA a caminho do servidor.
   *
   * Sem isto havia uma janela em que o ecrã dizia «guardado às 14:32» sem
   * ninguém saber ainda se tinha ficado guardado: a cópia local corre primeiro
   * e é síncrona, o pedido ao servidor demora — e com as repetições demora
   * mais. Uma contagem e não um booleano porque a gravação de saída (a da
   * desmontagem) pode sobrepor-se à do debounce.
   */
  const [aGravarNoServidor, setAGravarNoServidor] = useState(0);
  /**
   * O rascunho que o "Limpar" deitou fora, à espera de ser resgatado.
   *
   * Dez segundos e um botão, em vez de uma caixa de confirmação. A caixa
   * pergunta ANTES, quando ela ainda não viu o que ia perder, e a resposta
   * certa é quase sempre "sim" — por isso carrega-se sem ler. A anulação
   * pergunta DEPOIS, quando o ecrã já mostra o estrago.
   */
  const [limpo, setLimpo] = useState<{
    doc: StudioDoc;
    total: string;
    segundos: number;
    /** O que aconteceu, para o aviso poder dizê-lo. O "Limpar" não é o único
     *  gesto que deita fora o que estava no ecrã: repor uma versão antiga
     *  também, e um aviso a dizer "rascunho limpo" depois de um restauro
     *  mandava procurar um problema que não houve. */
    motivo: string;
  } | null>(null);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * UMA ACÇÃO QUE MEXE NO DINHEIRO PERGUNTA COM OS DOIS NÚMEROS À VISTA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela sobre o «Usar X €»: «é um botão perigoso». E era: um clique
   * substituía o preço final da proposta — o número de que saem a fatura, o
   * sinal e o saldo — sem dizer o que ia sair dali para fora. O rótulo mostrava
   * o valor NOVO; o valor que se perdia não estava escrito em lado nenhum.
   *
   * A pergunta traz os DOIS: «Substituir 2.460,00 € por 2.535,00 €?». É a única
   * forma de a resposta ser uma decisão em vez de um reflexo — e é diferente de
   * um «tem a certeza?», que se responde sem ler porque não acrescenta
   * informação nenhuma.
   *
   * Depois de aplicada, a anulação de dez segundos (a mesma do «Limpar») fica
   * disponível: a confirmação protege de carregar por engano, a anulação
   * protege de confirmar por engano.
   */
  const [confirmacaoDeDinheiro, setConfirmacaoDeDinheiro] = useState<{
    /** O que aparece na pergunta, já composto. */
    pergunta: string;
    /** O que fica no histórico do pedido quando for aplicada. */
    registo: string;
    /** O que a anulação dirá que foi desfeito. */
    motivo: string;
    /**
     * O documento no instante em que a pergunta foi feita.
     *
     * A pergunta guarda o gesto que a vai aplicar, e esse gesto foi composto
     * com os números desse instante. Se entretanto se escrever no formulário,
     * «substituir 2.460,00 € por 2.535,00 €» passa a falar de um documento que
     * já não existe — e aplicá-la escrevia por cima do que se acabou de
     * escrever. Por isso a pergunta só se DESENHA enquanto o documento for este
     * (ver a marcação); caducada, desaparece, e volta a perguntar-se se for
     * preciso. Comparado por identidade porque o documento é imutável: cada
     * alteração devolve um objecto novo.
     */
    docNoMomento: StudioDoc;
    aplicar: () => void;
  } | null>(null);
  /**
   * Histórico para o Cmd+Z. Guardado num `ref` e não em estado: crescer o
   * histórico não pode redesenhar a página, ou escrever numa caixa de texto
   * passava a redesenhar o formulário inteiro a cada tecla.
   */
  const historico = useRef<StudioDoc[]>([]);
  /**
   * Há alguma coisa para desfazer? Isto É estado, ao contrário do histórico:
   * é o que acende e apaga o botão "Desfazer".
   *
   * O botão existe porque o `Cmd+Z` não existe num telemóvel. Enquanto desfazer
   * foi só um atalho de teclado, desfazer era uma coisa que só se podia fazer
   * ao computador — e ela escreve propostas no telemóvel. Custa um redesenho a
   * cada 800 ms (o mesmo instante em que o rascunho é gravado), não a cada
   * tecla, que é a razão de o histórico continuar num `ref`.
   */
  const [podeDesfazer, setPodeDesfazer] = useState(false);
  /** O modo de arrumar a ordem dos grupos de serviços. Só existe no telemóvel
   *  — a razão está escrita ao lado do botão "Reordenar". */
  /** Qual o grupo cujo menu de acções está aberto (por toque longo). */
  /**
   * O que ela já escreveu antes, para não voltar a escrever.
   *
   * Sai das propostas anteriores em vez de um catálogo à parte: um catálogo
   * precisava de ser mantido, e um catálogo que ninguém mantém fica pior do
   * que não existir. O que ela usou é, por definição, o que ela usa.
   */
  const [sugestoes, setSugestoes] = useState<{ locais: string[] }>({ locais: [] });
  // Free-typed mirror of the structured total, so pt-PT formatting ("3.000,00")
  // survives keystrokes. Parsed into `doc.totalAmount` (the money source of truth).
  const [totalInput, setTotalInput] = useState<string>("");
  // path → signed url, so freshly-uploaded images render as thumbnails.
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  /**
   * O ORIGINAL de cada foto — o plano B da célula.
   *
   * O `assetUrls` guarda o que é MELHOR desenhar (a miniatura, quando existe).
   * Uma miniatura pode não existir: as fotos anteriores às miniaturas não têm
   * nenhuma, e assinar um caminho no Storage não verifica que o ficheiro lá
   * está — devolve um URL bem formado para um objecto que dá 404. Quem
   * descobre isso é o navegador, e até aqui o que acontecia a seguir era a
   * célula desistir e dizer "não foi possível pré-visualizar".
   *
   * Este mapa é para onde ela cai. É a mesma rede que a grelha dos temas e o
   * seletor já tinham, e que só ao estúdio faltava.
   */
  const [assetOriginais, setAssetOriginais] = useState<Record<string, string>>({});
  /**
   * A cor dominante de cada fotografia, `caminho → "#rrggbb"`.
   *
   * Vem do servidor (que a leu da linha da foto), e não de um `canvas` daqui:
   * estas fotos chegam por URLs assinados de OUTRO domínio, e ler-lhes os
   * píxeis lançaria — ver o cabeçalho de `cor-dominante.ts`. É com isto que se
   * avisa que uma foto destoa da paleta do board e se arruma um board por cor.
   *
   * As fotos anteriores a isto existir não estão no mapa, e não entram em
   * nenhuma das duas coisas: nunca se inventa uma cor para poder arrumar.
   */
  const [assetCores, setAssetCores] = useState<Record<string, string>>({});
  // Foto NESTA proposta → foto da BIBLIOTECA de onde foi copiada.
  //
  // A importação copia os bytes para um uuid novo, por isso o caminho de
  // destino não guarda memória nenhuma da origem — e sem essa memória o
  // seletor não consegue dizer "esta já está nesta proposta", que é
  // exatamente o que evita o mesmo ramo de eucalipto duas vezes no mesmo mood
  // board. Vive no lado ("meta") do rascunho e não no documento: é auxiliar,
  // não vai para o PDF, e um rascunho antigo — que não o tem — abre na mesma,
  // apenas sem as marcas.
  const [themeOrigins, setThemeOrigins] = useState<Record<string, string>>({});
  /**
   * ── A FORMA DE CADA FOTO, MEDIDA NA CÉLULA QUE JÁ A MOSTRA ────────────────
   *
   * Os diagramas do selector de disposição precisam do aspecto (largura ÷
   * altura) de cada fotografia: é isso que faz uma vertical sair vertical e é
   * disso que `caixasDoMoodboard` vive. A informação já está no browser — a
   * miniatura da grelha do estúdio está descodificada e sabe o seu
   * `naturalWidth`/`naturalHeight` —, por isso mede-se ALI, no `onLoad` da
   * célula (ver `Thumb`), e não se pede nada de novo ao servidor. Um pedido por
   * foto só para saber a forma seria pagar outra vez o que já foi pago, e na
   * ligação por onde ela está a trabalhar.
   *
   * Chave: o caminho no documento — a mesma foto usada em dois mood boards é
   * medida uma vez só. Não vai para o rascunho: é uma medida do ficheiro, não
   * uma decisão dela, e volta sozinha quando a célula carregar outra vez.
   *
   * O que fica de fora fica com {@link ASPETO_POR_OMISSAO}: as células são
   * `loading="lazy"` e uma que nunca chegou ao ecrã não tem medidas.
   */
  const [aspetosDasFotos, setAspetosDasFotos] = useState<Record<string, number>>({});
  /** Regista a medida de uma foto. Estável (o `Thumb` guarda-a numa `ref`) e
   *  silencioso quando o valor não mudou, para medir não redesenhar a secção. */
  const registarAspeto = useCallback((ref: string, aspeto: number) => {
    setAspetosDasFotos((m) => (m[ref] === aspeto ? m : { ...m, [ref]: aspeto }));
  }, []);
  const [refEdited, setRefEdited] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<null | "preview" | "send">(null);
  const [confirmSend, setConfirmSend] = useState(false);
  // Depois de um envio bem-sucedido, o formulário NÃO fica pronto a re-disparar:
  // mostra um estado de confirmação e exige uma escolha consciente para reenviar.
  const [sent, setSent] = useState(false);
  // Fluxo guiado: Conteúdo → Pré-visualizar → Enviar.
  const [step, setStep] = useState<Step>("conteudo");
  // Qual o destino das fotos escolhidas na biblioteca de temas (null = fechado).
  const [picker, setPicker] = useState<
    // `substituir` é a posição a TROCAR no lugar: a foto escolhida entra ali em
    // vez de ir para o fim. Sem isto, trocar uma foto era removê-la, escolher
    // outra, e arrastá-la de volta ao sítio onde a primeira estava.
    { kind: "board"; bi: number; substituir?: number } | { kind: "cover"; idx: number } | null
  >(null);
  /** O que está a ser arrastado agora (identificador do dnd-kit), ou nada. */
  /** As fotos de biblioteca já usadas noutras propostas, com onde e quando. */
  const [repetidas, setRepetidas] = useState<FotoRepetida[]>([]);
  const [aArrastar, setAArrastar] = useState<string | null>(null);
  /** A fotografia aberta em grande: o board e a posição. */
  const [lupa, setLupa] = useState<{ bi: number; ii: number } | null>(null);
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O TEMPO QUE ESTA PROPOSTA CUSTOU MESMO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «não relógio de parede: tempo com a página em foco».
   *
   * A contagem vive numa `ref` e não em estado: um acontecimento por tecla
   * escrita a redesenhar o estúdio inteiro seria pagar em fluidez o preço de
   * medir a fluidez. O ecrã lê-a de meio em meio minuto, que é o passo a que o
   * número muda.
   *
   * A regra do que conta está em `tempo-activo.ts`, com relógio injectado e
   * testes — incluindo o caso que estraga qualquer medição destas: o ecrã que
   * ficou aberto enquanto ela foi ao telefone.
   */
  const tempo = useRef<Contagem>(CONTAGEM_VAZIA);
  const [tempoMostrado, setTempoMostrado] = useState(0);
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O TEMPO SOBE PARA O SERVIDOR — E SOBE EM PEDAÇOS, NÃO EM TOTAIS
   * ════════════════════════════════════════════════════════════════════════
   *
   * A pergunta que motiva tudo isto é «que boards custam mais tempo?», e essa
   * pergunta atravessa PROPOSTAS e APARELHOS. Guardado no `localStorage`, o
   * total seria o deste computador — e uma proposta começada no portátil e
   * acabada no tablet contaria metade em cada sítio.
   *
   * Envia-se o INCREMENTO desde o último envio, e o servidor soma. Se se
   * enviasse o total, dois separadores abertos na mesma proposta escreviam um
   * por cima do outro e ficava só o do último a falar.
   *
   * O que já foi enviado vive numa `ref`: é o ponto de referência do próximo
   * incremento, e não tem nada que redesenhar o ecrã quando muda.
   */
  const tempoEnviado = useRef(0);
  /**
   * A secção onde ela está agora, vinda da coluna lateral (que já a calcula).
   *
   * Numa `ref` e não em estado: muda a cada scroll, e o número que ela alimenta
   * só é lido de meio em meio minuto. Em estado, rolar a página redesenhava o
   * estúdio inteiro para não mudar nada no ecrã.
   */
  const seccaoActivaRef = useRef<string | null>(null);
  const anotarSeccao = useCallback((id: string | null) => {
    seccaoActivaRef.current = id;
  }, []);
  const reportarTempo = useCallback(
    (total: number, aFechar = false) => {
      const delta = Math.round(total - tempoEnviado.current);
      // Menos de um segundo não vale um pedido. A `ref` não avança, portanto
      // este bocadinho não se perde: vai no envio seguinte.
      if (delta < 1000) return;
      tempoEnviado.current = total;
      const seccao = seccaoActivaRef.current;
      const corpo = JSON.stringify({ ms: delta, ...(seccao ? { seccao } : {}) });
      const url = `/api/orcamento/${quote.id}/tempo-activo`;
      if (aFechar && typeof navigator !== "undefined" && navigator.sendBeacon) {
        // O beacon sobrevive à página; um `fetch` não.
        try {
          navigator.sendBeacon(url, new Blob([corpo], { type: "application/json" }));
          return;
        } catch {
          /* sem beacon — tenta pelo caminho normal, que ainda pode chegar */
        }
      }
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo,
        keepalive: aFechar,
      }).catch(() => {
        // Sem rede o pedaço perde-se, e isso é aceitável: é uma MEDIÇÃO, não
        // trabalho. Interromper quem está a montar uma proposta para lhe falar
        // de um número que ela não pediu seria trocar o essencial pelo
        // acessório.
      });
    },
    [quote.id],
  );
  useEffect(() => {
    const sinal = (tipo: "vida" | "pausa") => () => {
      tempo.current = comAcontecimento(tempo.current, { tipo, em: Date.now() });
    };
    const vivo = sinal("vida");
    const parado = sinal("pausa");
    const aoMudarDeFoco = () => (document.hidden ? parado() : vivo());
    for (const ev of ["pointerdown", "keydown", "wheel", "scroll"] as const) {
      window.addEventListener(ev, vivo, { passive: true });
    }
    window.addEventListener("focus", vivo);
    window.addEventListener("blur", parado);
    document.addEventListener("visibilitychange", aoMudarDeFoco);
    vivo();
    // Meio minuto: o número mostrado é em minutos, portanto qualquer passo mais
    // curto seria trabalho para não mudar nada no ecrã. É também o passo a que
    // o tempo sobe para o servidor — o mesmo relógio serve as duas coisas.
    const relogio = setInterval(() => {
      const total = totalAte(tempo.current, Date.now());
      setTempoMostrado(total);
      reportarTempo(total);
    }, 30_000);
    /**
     * ── AO FECHAR, O QUE FALTAVA ─────────────────────────────────────────
     *
     * O passo é de meio minuto, portanto fechar o separador deixava sempre
     * para trás até meio minuto — e, num dia de trabalho partido em muitas
     * aberturas curtas, «até meio minuto de cada vez» deixa de ser arredondar
     * e passa a ser um viés sempre para baixo.
     *
     * `sendBeacon` e não `fetch`: um `fetch` disparado no `pagehide` é
     * cancelado com a página. O beacon é entregue pelo browser depois de o
     * separador morrer, que é precisamente o que aqui se quer.
     */
    const aoFechar = () => reportarTempo(totalAte(tempo.current, Date.now()), true);
    window.addEventListener("pagehide", aoFechar);
    return () => {
      for (const ev of ["pointerdown", "keydown", "wheel", "scroll"] as const) {
        window.removeEventListener(ev, vivo);
      }
      window.removeEventListener("focus", vivo);
      window.removeEventListener("blur", parado);
      document.removeEventListener("visibilitychange", aoMudarDeFoco);
      window.removeEventListener("pagehide", aoFechar);
      clearInterval(relogio);
      // Trocar de cliente também fecha esta medição: sem isto, o tempo desde o
      // último passo ficava por contar em todas as trocas.
      aoFechar();
    };
  }, [reportarTempo]);

  /**
   * O campo a que o aviso de ortografia mandou ir, à espera de ser desenhado.
   *
   * Não se pode saltar no mesmo instante em que se carrega: o aviso vive no
   * passo do envio e o campo está no do conteúdo, portanto no momento do clique
   * o controlo ainda não existe no DOM. Guarda-se o alvo e o salto é dado por um
   * efeito, depois do desenho — que é a única altura em que ele existe.
   */
  const [campoAVisitar, setCampoAVisitar] = useState<{
    campo: CampoDeTexto;
    /** Contador de pedidos. Carregar duas vezes na mesma palavra tem de saltar
     *  as duas — e é ele que evita limpar o alvo DENTRO do efeito. */
    pedido: number;
  } | null>(null);
  /** A vista com as páginas lado a lado está aberta? */
  const [vistaDeConjunto, setVistaDeConjunto] = useState(false);
  /** As fotos escolhidas para serem movidas em conjunto — chaves `bi:ii`. */
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const hydrated = useRef(false);
  /** `updatedAt` do rascunho do servidor tal como o lemos — é com isto que o
   *  servidor deteta que alguém gravou por cima entretanto. */
  const serverStamp = useRef<string | null>(null);
  /** Já avisámos desta gravação cruzada? (uma vez chega; não a cada gravação) */
  const warnedOverwrite = useRef(false);

  // ── Restore draft on mount ──
  //
  // ════════════════════════════════════════════════════════════════════════
  // CORRE UMA VEZ SÓ, E O `return` DE CIMA É O QUE O GARANTE
  // ════════════════════════════════════════════════════════════════════════
  //
  // As dependências vazias não chegam. Em desenvolvimento o React monta,
  // limpa e volta a montar cada componente de propósito (`reactStrictMode`),
  // e este efeito corria as duas vezes — mas a SEGUNDA já não lia o rascunho
  // dela. Lia o que a gravação automática tinha entretanto escrito por cima.
  //
  // A sequência medida, com um rascunho de 2 boards no `localStorage`:
  //
  //   1ª passagem   lê 2 boards, põe `setDoc` na fila, `hydrated = true`
  //   (a limpeza)   `hydrated` já é `true`, portanto a desmontagem simulada
  //                 grava — e o documento que ela tem à mão ainda é o de
  //                 ANTES do restauro: escreve 0 boards por cima dos 2
  //   2ª passagem   lê os 0 boards que acabaram de ser escritos e mete-os
  //                 na fila também
  //   fim           as duas actualizações correm por ordem: 0 → 2 → 0
  //
  // Resultado: o estúdio abria vazio com o trabalho todo no `localStorage`, e
  // a gravação seguinte tornava a perda definitiva. Era isto que impedia
  // qualquer teste de ponta-a-ponta de partir de um rascunho semeado — a
  // suite das propostas corre contra o servidor de DESENVOLVIMENTO, que é
  // precisamente onde a segunda passagem existe.
  //
  // Um efeito de restauro tem de ser idempotente: correr outra vez não pode
  // significar ler outra vez. Lido uma vez, fica lido.
  useEffect(() => {
    if (hydrated.current) return;
    let hadDraft = false;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          hadDraft = true;
          // Rascunhos antigos guardaram a capa esparsa (`[null, "foto"]`) ou
          // curta (`["foto"]`) — normalizar já aqui mantém a foto da direita
          // na posição da direita.
          setDoc((d) => {
            const merged = { ...d, ...parsed };
            // `stripPendingImages` também aqui: gravar já os filtra, mas um
            // rascunho escrito por uma versão anterior (ou por outra aba) não
            // pode fazer aparecer no ecrã um caminho que nunca vai existir.
            return stripPendingImages({
              ...merged,
              coverImages: normaliseCoverImages(merged.coverImages),
            });
          });
          // A BASE, não o `totalAmount` cru — ver `baseDoDoc`.
          const base = baseDoDoc(parsed);
          if (base != null) setTotalInput(textoDoTotal(base));
        }
      }
      const rawMeta = localStorage.getItem(SIDE_KEY);
      if (rawMeta) {
        const meta = JSON.parse(rawMeta);
        if (meta?.urls && typeof meta.urls === "object") setAssetUrls(meta.urls);
        // Rascunhos gravados antes de o plano B existir não o têm: abrem na
        // mesma, e a hidratação preenche-o assim que responder.
        if (meta?.originais && typeof meta.originais === "object") {
          setAssetOriginais(meta.originais);
        }
        // Rascunhos guardados antes de as cores existirem não as têm: abrem na
        // mesma, e a hidratação preenche-as assim que o servidor responder.
        if (meta?.cores && typeof meta.cores === "object") setAssetCores(meta.cores);
        // Rascunhos guardados antes de isto existir não têm `themeOrigins` —
        // abrem na mesma, só sem as marcas de "já nesta proposta".
        if (meta?.themeOrigins && typeof meta.themeOrigins === "object") {
          setThemeOrigins(meta.themeOrigins);
        }
        if (typeof meta?.refEdited === "boolean") setRefEdited(meta.refEdited);
      }
    } catch {
      /* ignore corrupt draft */
    }
    // Só semeia defaults quando NÃO havia rascunho guardado — um rascunho
    // existente (mesmo sem grupos) nunca é sobrescrito.
    if (!hadDraft) {
      setDoc((d) => seedDefaults(d, quote));
    }

    // O VALOR é a excepção, e de propósito: vem SEMPRE do pedido, haja rascunho
    // ou não. Era aqui que os dois números se separavam — com rascunho, o
    // estúdio nunca mais olhava para o "Preço final", e uma alteração feita na
    // Gestão do pedido não chegava ao PDF.
    const doPedido = quote.quotedPrice;
    if (typeof doPedido === "number" && doPedido > 0) {
      precoEnviado.current = doPedido;
      setTotalInput(textoDoTotal(doPedido));
      setDoc((d) => aplicarBase(d, doPedido));
    } else if (hadDraft) {
      // O pedido ainda não tem preço mas o rascunho tem um valor escrito antes
      // de isto existir. Não se deita fora: adopta-se, e GRAVA-SE no pedido —
      // é o que faz os dois convergirem numa verdade só, em vez de escolher
      // uma e perder a outra.
      const daProposta = parseMoneyText(totalInput) || undefined;
      if (daProposta && daProposta > 0) persistirPreco(daProposta);
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * O rascunho não chegou ao servidor. Duas coisas acontecem, e são diferentes
   * de propósito:
   *
   *  1. o INDICADOR passa a dizê-lo, e continua a dizê-lo enquanto for verdade —
   *     é o que está à vista quando ela olha para o ecrã;
   *  2. um aviso grande, UMA vez. À segunda seria ruído a cada 800 ms, e um
   *     aviso que aparece sempre é um aviso que se aprende a ignorar.
   */
  const registarSoLocal = useCallback(
    (porque?: string) => {
      setSoNesteComputador({ porque });
      if (avisouSoLocal.current) return;
      avisouSoLocal.current = true;
      toast(
        `Este rascunho está guardado SÓ NESTE COMPUTADOR — não chegou ao servidor.${
          porque ? ` ${porque}` : ""
        } Não feche o separador sem falar com quem gere a instalação: noutro dispositivo esta proposta não existe.`,
        "error",
      );
    },
    [toast],
  );

  /** A gravação chegou ao servidor. Limpa o aviso E rearma-o: se voltar a
   *  falhar mais tarde, ela tem de ouvir outra vez — a rede pode ter voltado a
   *  cair e o segundo silêncio custaria tanto como o primeiro. */
  const marcarGuardadoNoServidor = useCallback(() => {
    setSoNesteComputador(null);
    avisouSoLocal.current = false;
  }, []);

  /**
   * Manda o rascunho ao servidor e ARRUMA a verdade que voltar: o carimbo, o
   * indicador, o aviso. Está num sítio só porque são dois os caminhos que
   * gravam — o debounce de cada alteração e o resgate da abertura — e um deles
   * a esquecer-se de dizer que falhou é exactamente o problema que isto veio
   * resolver.
   */
  const enviarParaServidor = useCallback(
    async (docGravavel: unknown): Promise<ResultadoDaGravacao> => {
      setAGravarNoServidor((n) => n + 1);
      try {
        const r = await gravarRascunhoNoServidor(quote.id, {
          doc: docGravavel,
          baseUpdatedAt: serverStamp.current,
        });
        if (r.estado === "guardado") {
          if (r.updatedAt) serverStamp.current = r.updatedAt;
          marcarGuardadoNoServidor();
        } else {
          registarSoLocal(r.porque);
        }
        return r;
      } finally {
        setAGravarNoServidor((n) => Math.max(0, n - 1));
      }
    },
    [quote.id, marcarGuardadoNoServidor, registarSoLocal],
  );

  // ── O rascunho que está no SERVIDOR ──
  // A cópia local abre primeiro (é instantânea e funciona sem rede); logo a
  // seguir vai-se buscar a do servidor e, se for mais recente, é essa que
  // vale. É isto que faz começar no portátil e continuar no tablet — e que
  // impede limpar o histórico de apagar trabalho.
  useEffect(() => {
    let active = true;
    (async () => {
      // O que este navegador tem guardado, e de quando. Lê-se ANTES de falar
      // com o servidor porque é isto que decide se há alguma coisa para
      // resgatar — ver o bloco do resgate, mais abaixo.
      let localStamp = 0;
      let docLocal: unknown = null;
      try {
        localStamp = Number(localStorage.getItem(`${DRAFT_KEY}:at`) ?? 0);
        const cru = localStorage.getItem(DRAFT_KEY);
        if (cru) docLocal = JSON.parse(cru);
      } catch {
        /* localStorage indisponível ou rascunho ilegível — fica a valer o servidor */
      }

      let leituraOk = false;
      let draft: { doc?: unknown; updatedAt?: string } | null = null;
      try {
        const res = await fetch(`/api/orcamento/${quote.id}/proposta-rascunho`, {
          cache: "no-store",
        });
        if (res.ok) {
          leituraOk = true;
          const data = await res.json().catch(() => null);
          const d = data?.draft;
          if (d?.doc && typeof d.doc === "object") draft = d;
        }
      } catch {
        /* sem rede: continua-se com a cópia local, como antes */
      }
      if (!active) return;
      if (draft) {
        serverStamp.current = typeof draft.updatedAt === "string" ? draft.updatedAt : null;
      }

      const carimboDoServidor = draft ? Date.parse(draft.updatedAt ?? "") || 0 : 0;
      const localMaisRecente = localStamp > carimboDoServidor;

      /**
       * ══════════════════════════════════════════════════════════════════════
       * O RESGATE DO QUE FICOU PRESO NESTE NAVEGADOR
       * ══════════════════════════════════════════════════════════════════════
       *
       * Este é o caminho por onde o trabalho da colaboradora volta. Enquanto o
       * servidor recusou as gravações, tudo o que ela montou ficou no
       * `localStorage` daquele portátil — intacto, e invisível para toda a
       * gente. O estúdio abria, via que o servidor não tinha rascunho nenhum, e
       * não fazia nada com essa informação: esperava pela próxima tecla.
       *
       * Agora, ao abrir, se a cópia deste navegador for mais recente do que a
       * do servidor — ou se o servidor não tiver nenhuma e esta existir —
       * tenta-se ENVIÁ-LA outra vez. É o gesto que a pessoa faria se soubesse
       * que tinha de o fazer, feito sem ela ter de saber.
       *
       * Só quando a leitura CORREU BEM. Se o `GET` falhou não se sabe o que
       * está lá; escrever por cima às cegas podia apagar uma versão mais
       * recente feita noutro dispositivo, e trocar uma perda por outra não é
       * resgate nenhum.
       */
      if (leituraOk && docLocal && typeof docLocal === "object" && (localMaisRecente || !draft)) {
        // Os marcadores provisórios saem, como em qualquer gravação. Mas se o
        // rascunho preso for de uma versão antiga e não tiver a forma toda, o
        // que se envia é o que lá está: entre enviar com um marcador a mais e
        // não enviar de todo, envia-se — é isto que está a resgatar trabalho.
        let paraEnviar: unknown = docLocal;
        try {
          paraEnviar = stripPendingImages(docLocal as StudioDoc);
        } catch {
          /* fica o original */
        }
        void (async () => {
          const r = await enviarParaServidor(paraEnviar);
          // Dizer que o resgate aconteceu é metade do resgate: sem isto ela não
          // tem como saber que o que estava preso já está a salvo, e continua a
          // não fechar o portátil.
          if (active && r.estado === "guardado") {
            toast(
              "O rascunho que estava guardado só neste computador foi enviado para o servidor. Já pode ser aberto noutro dispositivo.",
              "success",
            );
          }
        })();
      }

      if (!draft?.doc || typeof draft.doc !== "object") return;
      // A local só ganha se for MESMO mais recente; em empate vale a do
      // servidor, que é a que os outros dispositivos veem.
      if (localMaisRecente) return;
      // ── O VALOR É A EXCEPÇÃO, AQUI TAMBÉM ───────────────────────────
      //
      // A montagem aplica o "Preço final" do PEDIDO por cima do rascunho,
      // de propósito e com a razão escrita lá em cima: é o mesmo número
      // visto de dois sítios. Este merge, 100–300 ms depois, punha o
      // `totalAmount` do rascunho por cima outra vez — e ganhava quase
      // sempre, porque o carimbo local é escrito ANTES do PUT e o
      // `updatedAt` do servidor DEPOIS, portanto a comparação de datas
      // acima está estruturalmente a favor do servidor.
      //
      // O percurso: ela corrigia o preço de 8.100 para 9.400 na Gestão do
      // pedido, voltava ao estúdio, e o campo voltava sozinho a 8.100. Ao
      // enviar, gravava 8.100 e a correcção desaparecia dos DOIS lados.
      //
      // O rascunho traz o texto, as fotos e as condições — tudo menos o
      // valor. Quem manda no valor é o pedido, e só quando ele tem um.
      const doPedido = quote.quotedPrice;
      const mandaOPedido = typeof doPedido === "number" && doPedido > 0;
      const doDoServidor = draft.doc as Partial<StudioDoc>;
      setDoc((d) => {
        const merged = { ...d, ...doDoServidor };
        const limpo = stripPendingImages({
          ...merged,
          coverImages: normaliseCoverImages(merged.coverImages),
        });
        return mandaOPedido ? aplicarBase(limpo, doPedido) : limpo;
      });
      const base = mandaOPedido ? doPedido : baseDoDoc(doDoServidor);
      if (base != null) setTotalInput(textoDoTotal(base));
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id]);

  // ── Hydrate signed URLs for images already in this draft ──
  // Fills in signed URLs for any image already used in the draft (covers / mood
  // boards) so thumbnails render even on a fresh device or after the cached URL
  // expired. Uploaded images are NOT offered back as a re-pickable gallery.
  //
  // É uma função e não só um efeito porque há um segundo momento em que a
  // pasta do pedido ganha fotos SEM ser por carregamento: quando um modelo
  // parcial traz fotos de outro pedido e elas são recopiadas para cá. Sem uma
  // segunda leitura, as células ficavam sem miniatura até recarregar a página.
  const hidratarAssets = useCallback(
    async (vivo: () => boolean = () => true) => {
      {
        try {
          const res = await fetch(`/api/orcamento/${quote.id}/assets`);
          if (!res.ok) return;
          const data = await res.json().catch(() => null);
          const imgs: { path: string; url: string; thumbUrl?: string; cor?: string }[] =
            Array.isArray(data?.images) ? data.images : [];
          if (!vivo() || imgs.length === 0) return;
          setAssetUrls((prev) => {
            const next = { ...prev };
            // A miniatura ganha ao original: é este o caminho que corre quando se
            // REABRE uma proposta, que é onde a grelha mais pesa.
            //
            // E o guardado só ganha ao fresco ENQUANTO SERVIR. Antes era um
            // `!next[im.path]` seco, que deitava fora a assinatura fresca mesmo
            // quando a guardada já estava morta — as fotos de tema assinam a 6
            // horas, e um rascunho aberto de um dia para o outro voltava com a
            // grelha inteira a pedir URLs que o Supabase recusa. Ver
            // `assinatura.ts` para porque é que não bastava substituir sempre.
            for (const im of imgs)
              if (im.path && im.url)
                next[im.path] = urlAindaBom(next[im.path], im.thumbUrl || im.url);
            return next;
          });
          // O original fica guardado à parte, para a célula ter para onde cair
          // quando a miniatura não existir.
          setAssetOriginais((prev) => {
            const next = { ...prev };
            for (const im of imgs)
              if (im.path && im.url) next[im.path] = urlAindaBom(next[im.path], im.url);
            return next;
          });
          // As cores não expiram (não são URLs assinados): uma vez conhecidas,
          // ficam. Uma foto que volte sem cor não apaga a que já se sabia.
          setAssetCores((prev) => {
            const next = { ...prev };
            for (const im of imgs) if (im.path && im.cor) next[im.path] = im.cor;
            return next;
          });
        } catch {
          /* offline / storage unavailable — the studio still works with uploads */
        }
      }
    },
    [quote.id],
  );

  useEffect(() => {
    let alive = true;
    void hidratarAssets(() => alive);
    return () => {
      alive = false;
    };
  }, [hidratarAssets]);

  // ── Auto-compose the reference until the user overrides it ──
  useEffect(() => {
    if (refEdited) return;
    setDoc((d) => {
      const next = buildRef(d);
      return d.ref === next ? d : { ...d, ref: next };
    });
  }, [doc.template, doc.eventType, doc.clientNames, doc.eventDate, refEdited]);

  // ── Debounced draft persistence ──
  //
  // `flushDraft` guarda a MESMA gravação que o debounce ia fazer, para o
  // Ctrl/Cmd+Enter dos Serviços a poder disparar já (sem duplicar a lógica nem
  // encurtar o debounce, que é o que segura a escrita durante a escrita).
  // Devolve o que o SERVIDOR respondeu, e não `void`: é o que permite ao
  // Ctrl/Cmd+Enter dizer «guardado» só quando o for mesmo, em vez de o dizer
  // por ter escrito no `localStorage` — que era o erro original, em ponto
  // pequeno.
  const flushDraft = useRef<() => Promise<ResultadoDaGravacao>>(async () => ({
    estado: "so-local",
  }));

  // Assim que o documento muda há trabalho por gravar. Volta a false quando a
  // gravação local acontece, oitocentos milissegundos depois.
  //
  // O `ref` ao lado do estado existe para a limpeza da desmontagem (mais
  // abaixo) o poder ler: essa corre uma vez só, com as dependências vazias, e
  // portanto ficaria para sempre com o `porGravar` do primeiro desenho.
  const porGravarRef = useRef(false);
  /**
   * A montagem NÃO é trabalho por gravar.
   *
   * Este efeito também corre no desenho da montagem, e ali o `doc` ainda é o
   * de antes do restauro — o restauro deixou o `setDoc` na fila e ele só
   * chega ao desenho seguinte. Marcar «por gravar» já aqui dava à limpeza da
   * desmontagem (mais abaixo) autorização para gravar esse documento, que é
   * o documento VAZIO: quem abrisse o estúdio e saísse no mesmo instante
   * escrevia-o por cima do rascunho guardado.
   *
   * Saltar a primeira passagem não adia nada do que interessa: o restauro (ou
   * o `seedDefaults`, quando não há rascunho) muda o documento e faz este
   * efeito correr outra vez — aí sim, com a versão boa à mão. E quando o
   * restauro não muda nada, não há mesmo nada por gravar: é o caso que o
   * comentário de cima descreve, o de cada troca de separador pagar um PUT
   * para reescrever o que já lá estava.
   */
  const montagem = useRef(true);
  useEffect(() => {
    if (!hydrated.current) return;
    if (montagem.current) {
      montagem.current = false;
      return;
    }
    porGravarRef.current = true;
    setPorGravar(true);
  }, [doc, assetUrls, themeOrigins, refEdited]);

  useEffect(() => {
    if (!hydrated.current) return;
    const save = () => {
      // Uma fotografia para o Cmd+Z, tirada quando ela pára de escrever. Se
      // fosse a cada tecla, desfazer andava letra a letra e não servia para
      // nada; se fosse só nas remoções, não desfazia um texto trocado.
      const ultimo = historico.current[historico.current.length - 1];
      if (!ultimo || JSON.stringify(ultimo) !== JSON.stringify(doc)) {
        historico.current = [...historico.current, doc].slice(-MAX_HISTORICO);
      }
      // Dois, e não um: o último do histórico é o documento ACTUAL, portanto
      // com uma só fotografia não há nada anterior para onde voltar.
      setPodeDesfazer(historico.current.length >= 2);

      // NADA DE MARCADORES PROVISÓRIOS NO RASCUNHO GRAVADO.
      //
      // Um `pending:<uuid>` é uma promessa viva na memória desta aba: a cópia
      // que lhe vai dar morada corre aqui, e mais ninguém a conhece. Gravado,
      // sobreviveria ao recarregar da página como um caminho que nunca vai
      // existir — uma foto fantasma no mood board, e um buraco silencioso no
      // PDF que ninguém volta a saber explicar. Sai do documento e sai também
      // dos mapas de apoio, que são gravados ao lado dele.
      const gravavel = stripPendingImages(doc);
      const semProvisorios = <T,>(mapa: Record<string, T>): Record<string, T> => {
        const out: Record<string, T> = {};
        for (const [k, v] of Object.entries(mapa)) if (!isPendingImage(k)) out[k] = v;
        return out;
      };
      /**
       * ══════════════════════════════════════════════════════════════════════
       * O RASCUNHO FICA NESTE COMPUTADOR — E ISSO É O QUE SE QUER
       * ══════════════════════════════════════════════════════════════════════
       *
       * O CodeQL assinala estas linhas com «Clear text storage of sensitive
       * information», severidade alta. O que ele vê é verdade: o documento tem
       * o nome do casal e a morada do espaço, e é gravado em claro no
       * `localStorage` desta máquina.
       *
       * É o comportamento pretendido, e a alternativa é pior. Uma proposta
       * demora horas a montar; a rede de casa dela cai; o portátil vai para a
       * quinta no dia da montagem. Sem esta cópia, uma gravação falhada ao
       * servidor é trabalho perdido — e foi exactamente isso que aconteceu
       * antes de isto existir. Cifrar não resolveria nada: a chave teria de
       * viver ao lado, no mesmo browser.
       *
       * O que NÃO está aqui, e é o que importa: não há segredos nenhuns. Nem
       * palavra-passe, nem sessão, nem chaves de armazenamento. Os marcadores
       * provisórios são filtrados acima (`semProvisorios`), e os preços de
       * custo, que são o único número verdadeiramente interno, nunca saem para
       * o cliente por outro caminho — ver `proposal-doc-pdf`.
       *
       * Quem tem acesso a este `localStorage` já tem acesso à sessão aberta do
       * back office no mesmo browser, e daí a tudo.
       */
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(gravavel));
        localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now()));
        localStorage.setItem(
          SIDE_KEY,
          JSON.stringify({
            urls: semProvisorios(assetUrls),
            // O plano B viaja com o rascunho. Sem isto, reabrir num sítio sem
            // rede (ou antes de a hidratação responder) deixava as células sem
            // para onde cair — que é exactamente quando mais falta faz.
            originais: semProvisorios(assetOriginais),
            // As cores viajam com o rascunho pela mesma razão que o plano B:
            // reabrir sem rede (ou antes de a hidratação responder) deixava o
            // aviso de paleta mudo justamente quando ele ainda faz falta.
            cores: semProvisorios(assetCores),
            themeOrigins: semProvisorios(themeOrigins),
            refEdited,
          }),
        );
        setGravadoEm(new Date());
        porGravarRef.current = false;
        setPorGravar(false);
      } catch {
        /* quota / unavailable — non-fatal */
      }
      // E no servidor, que é o que sobrevive à mudança de dispositivo. Falhar
      // aqui não interrompe o trabalho: a cópia local continua a valer e a
      // gravação seguinte tenta de novo. O que NÃO pode acontecer é falhar sem
      // se ver — era isso que fazia o indicador dizer «guardado» a uma proposta
      // que só existia neste portátil.
      return (async () => {
        const r = await enviarParaServidor(gravavel);
        if (r.estado === "so-local") return r;
        // Alguém gravou entre a nossa leitura e esta escrita. A nossa versão
        // fica (a última vence), mas dizê-lo é o mínimo — desaparecer com o
        // trabalho de outra pessoa em silêncio, não.
        if (r.overwrote && !warnedOverwrite.current) {
          warnedOverwrite.current = true;
          toast(
            r.previousBy
              ? `Este rascunho tinha sido alterado por ${r.previousBy} noutro sítio. Ficou a tua versão.`
              : "Este rascunho tinha sido alterado noutro sítio. Ficou a tua versão.",
            "info",
          );
        }
        return r;
      })();
    };
    flushDraft.current = save;
    const t = setTimeout(save, 800);
    return () => clearTimeout(t);
  }, [
    doc,
    assetUrls,
    assetOriginais,
    assetCores,
    themeOrigins,
    refEdited,
    DRAFT_KEY,
    SIDE_KEY,
    quote.id,
    toast,
    enviarParaServidor,
  ]);

  /**
   * ── AO DESMONTAR, GRAVA-SE O QUE FALTAVA ──────────────────────────────
   *
   * A gravação acima é um `setTimeout` a 800 ms, e a sua limpeza corre em
   * QUALQUER desmontagem. A única protecção era um `beforeunload`, que apanha
   * fechar o separador — e mais nada.
   *
   * Só que o estúdio é desmontado por gestos normais, e frequentes: «Trocar de
   * cliente» (o `key` em `FazerProposta`), o link «Rápida» do `AdminClient`, e
   * mudar de separador de detalhe. O percurso: ela escreve a última linha de
   * um grupo e clica em «Trocar de cliente» dentro de 800 ms. A gravação era
   * cancelada, o indicador continuava a dizer «Guardado às 14:32» — a hora da
   * gravação ANTERIOR — e ao voltar faltava a linha. Um indicador que diz que
   * gravou aquilo que não gravou é pior do que não haver indicador nenhum.
   *
   * Corre DEPOIS da limpeza de cima (as limpezas seguem a ordem de declaração
   * dos efeitos), portanto o `setTimeout` já foi cancelado e não há gravação a
   * dobrar. E só grava quando há mesmo trabalho por gravar: sem o `ref`, cada
   * troca de separador pagava um PUT para reescrever o que já lá estava.
   *
   * O `flushDraft.current` é reatribuído a cada alteração do documento, por
   * isso o que aqui corre é a gravação da ÚLTIMA versão, não a da montagem.
   */
  useEffect(() => {
    return () => {
      if (porGravarRef.current) void flushDraft.current();
    };
  }, []);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * «GUARDAR AGORA» — O BOTÃO, O ⌘S E O CTRL/CMD+ENTER DOS SERVIÇOS
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «quero que haja um botão para guardar onde se ficou». O
   * estúdio grava sozinho ao fim de 800 ms — e isso é invisível. Um botão
   * continua a valer com o automático a funcionar: é o gesto de quem se vai
   * levantar da secretária e quer ter a CERTEZA antes de fechar o portátil.
   *
   * E é justamente por ser esse o gesto que este é o sítio da página onde uma
   * mentira custa mais caro. Três respostas, e nenhuma delas inventada:
   *
   *  · GUARDOU — di-lo depois de o SERVIDOR o ter confirmado, nunca no instante
   *    do clique. Dizia «Rascunho guardado» sem esperar por resposta nenhuma:
   *    era o mesmo erro do indicador, à escala de uma mensagem.
   *
   *  · NÃO CHEGOU AO SERVIDOR — di-lo com as palavras do indicador («guardado
   *    só neste computador»), porque ela não pode ter de aprender duas
   *    linguagens no mesmo back office. Cala-se apenas quando o aviso grande
   *    de `registarSoLocal` está a aparecer NESTE momento — esse diz tudo isto
   *    e mais o que fazer a seguir, e duas mensagens ao mesmo tempo seriam
   *    ruído. Mas o aviso grande só aparece UMA vez por avaria; à segunda vez
   *    que ela carregue no botão é esta mensagem que fala, senão um botão
   *    calado passaria por um botão que guardou.
   *
   *  · NÃO HAVIA NADA POR GRAVAR — di-lo. A alternativa era responder
   *    «guardado» a um gesto que não guardou coisa nenhuma, e ensinar que a
   *    palavra «guardado» aparece sempre, carregue-se quando se carregar.
   *
   * O `soNesteComputador` entra na conta do «nada por gravar» de propósito: com
   * o servidor a recusar, a cópia local está feita (portanto `porGravarRef` é
   * falso) e o trabalho continua a não existir em mais lado nenhum. É o caso em
   * que mais falta faz voltar a tentar — e entre gravar a mais e gravar a
   * menos, grava-se a mais.
   */
  const [aGuardarAgora, setAGuardarAgora] = useState(false);
  const guardarAgora = useCallback(() => {
    void (async () => {
      // `aGravarNoServidor` entra na conta com a mesma lógica: a cópia local é
      // síncrona e apaga o «por gravar» ANTES de o servidor responder. Nessa
      // janela, dizer «já está guardado no servidor» era dizer uma coisa que
      // ainda ninguém sabe — grava-se outra vez e responde-se pelo que voltar.
      if (!porGravarRef.current && !soNesteComputador && aGravarNoServidor === 0) {
        toast("Não havia nada por gravar — o rascunho já está guardado no servidor.", "info");
        return;
      }
      // Lido ANTES da gravação: é o que distingue «o aviso grande vai falar» de
      // «o aviso grande já falou e agora é comigo».
      const avisoGrandeVaiFalar = !avisouSoLocal.current;
      setAGuardarAgora(true);
      try {
        const r = await flushDraft.current();
        if (r.estado === "guardado") {
          toast("Rascunho guardado no servidor.", "success");
        } else if (!avisoGrandeVaiFalar) {
          toast("Guardado só neste computador — não chegou ao servidor.", "error");
        }
      } finally {
        setAGuardarAgora(false);
      }
    })();
  }, [toast, soNesteComputador, aGravarNoServidor]);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O ESTÚDIO NO REGISTO DO BACK OFFICE
   * ════════════════════════════════════════════════════════════════════════
   *
   * A inscrição é feita À MÃO, e não pelo hook partilhado
   * (`useGravacaoAutomatica`), porque este ecrã ainda tem a sua própria cópia
   * da máquina de gravar — reescrevê-la agora era mexer no ficheiro onde a
   * perda de trabalho já foi cara, para ganhar arrumação e arriscar o resto.
   * A inscrição não precisa de esperar por essa migração: são três linhas que
   * põem o estúdio dentro do gesto único, e no dia em que a máquina migrar,
   * isto sai daqui sem deixar buraco.
   *
   * O nome é o que ELA lhe chama: «Proposta de Rita & Tomás». Nunca o nome do
   * ecrã — a pergunta ao fechar o separador tem de dizer QUE proposta é que
   * está em risco, não que componente é que está montado.
   */
  const nomeNoRegisto = doc.clientNames?.trim()
    ? `Proposta de ${doc.clientNames.trim()}`
    : `Proposta do pedido ${quote.id}`;
  const oRegistoFalaPorMim = useInscricaoNoRegisto({
    nome: nomeNoRegisto,
    porGravar: porGravar || aGravarNoServidor > 0 || !!soNesteComputador,
    gravarJa: async (): Promise<ResultadoDoEcra> => {
      const r = await flushDraft.current();
      // A cópia local é feita SEMPRE (é síncrona e não depende de rede), por
      // isso o desfecho de uma recusa do servidor aqui é «só neste
      // computador» e nunca «não ficou guardado»: o trabalho existe, mas só
      // neste portátil — que é precisamente a diferença que fez perder uma
      // proposta inteira.
      return r.estado === "guardado"
        ? { estado: "guardado" }
        : { estado: "so-neste-computador", porque: r.porque };
    },
  });

  const patch = (p: Partial<StudioDoc>) => setDoc((d) => ({ ...d, ...p }));

  // ── Total estruturado + IVA ──
  // O modo efetivo: explícito no doc, senão detetado a partir do texto livre
  // (retrocompatibilidade com propostas antigas só com "3.000,00 € + IVA").
  const vatMode: VatMode =
    doc.totalVatMode ?? detectVatMode(doc.totalText || doc.totalEstimatedText);

  /** Compõe o texto de DISPLAY do PDF a partir do valor + modo estruturados,
   *  no formato do estúdio ("3.000,00 € + IVA" ou "3.000,00 €"). */
  function composeTotalText(amount: number | undefined, mode: VatMode): string {
    if (amount == null || !(amount > 0)) return "";
    return mode === "acrescer" ? `${eur(amount)} + IVA` : eur(amount);
  }

  /** Escreve o valor + modo estruturados e sincroniza o texto de display do
   *  template ativo (totalText p/ Decoração, totalEstimatedText p/ Organização). */
  function writeTotal(amount: number | undefined, mode: VatMode) {
    const text = composeTotalText(amount, mode);
    patch(
      doc.template === "organizacao"
        ? { totalAmount: amount, totalVatMode: mode, totalEstimatedText: text }
        : { totalAmount: amount, totalVatMode: mode, totalText: text },
    );
  }

  /**
   * O VALOR É UM SÓ, e é o "Preço final (sem IVA)" do pedido.
   *
   * ── O que estava errado ─────────────────────────────────────────────────
   * Havia duas caixas com o mesmo número: aqui e na Gestão do pedido. Pior do
   * que duplicado — podiam DISCORDAR. O estúdio só copiava o preço do pedido
   * quando ainda não havia rascunho (ver `seedDefaults`), e a partir daí
   * alterar o preço na Gestão do pedido não mexia aqui. O PDF seguia para o
   * cliente com o valor antigo, e nada no ecrã o dizia.
   *
   * Agora escrever aqui GRAVA no pedido, e uma alteração feita na Gestão do
   * pedido aparece aqui. É o mesmo número, visto de dois sítios.
   *
   * ── E o IVA ─────────────────────────────────────────────────────────────
   * O número partilhado é sempre a BASE, sem IVA — é o que o pedido diz que é.
   * O modo de IVA muda o que o PDF MOSTRA (e portanto o que o cliente paga),
   * e o `totalAmount` do documento é derivado da base: em "acrescer" é a
   * própria base, em "incluído" é a base já com o IVA somado, porque é assim
   * que `resolveProposalMoney` o lê. Em qualquer dos modos a base continua a
   * ser o número do pedido, que é o que o rótulo "(sem IVA)" promete.
   */
  function amountParaBase(base: number, mode: VatMode): number {
    return totalAmountParaBase(base, mode, money.vatRate);
  }

  /** O que se grava no pedido, com a mão travada: escrever "3000" são quatro
   *  teclas e não podem ser quatro gravações. */
  const gravarPreco = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** O último valor que ESTE ecrã mandou gravar — para a resposta que volta do
   *  servidor não disparar outra vez a sincronização e entrar em ciclo. */
  const precoEnviado = useRef<number | undefined>(quote.quotedPrice);

  function persistirPreco(base: number | undefined) {
    precoEnviado.current = base;
    if (gravarPreco.current) clearTimeout(gravarPreco.current);
    gravarPreco.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orcamento/${quote.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // `null` e não `undefined`: apagar o preço tem de chegar ao servidor,
          // e `undefined` desaparece no JSON (o merge parcial mantinha o
          // valor antigo). É a mesma razão que está escrita na Gestão do pedido.
          body: JSON.stringify({ quotedPrice: base ?? null }),
        });
        if (!res.ok) throw new Error("falhou");
        const atualizado: Quote = await res.json();
        onQuoteUpdated?.(atualizado);
      } catch {
        // Não interrompe a escrita da proposta: o valor fica no ecrã e no
        // rascunho, e a gravação seguinte volta a tentar. Avisar a cada tecla
        // seria pior do que o problema.
      }
    }, 600);
  }

  function onTotalInput(raw: string) {
    setTotalInput(raw);
    const base = raw.trim() === "" ? undefined : parseMoneyText(raw);
    writeTotal(base == null ? undefined : amountParaBase(base, vatMode), vatMode);
    persistirPreco(base);
  }

  function setVatMode(mode: VatMode) {
    // A base não muda ao trocar de modo — muda o que o cliente vê. O valor do
    // documento é recalculado a partir da mesma base.
    const base = parseMoneyText(totalInput);
    writeTotal(base > 0 ? amountParaBase(base, mode) : undefined, mode);
  }

  // Split 30/70 sobre o BRUTO — o que o estúdio vê é o que será faturado.
  const money = resolveProposalMoney(doc);
  // A percentagem do sinal é do DOCUMENTO, e é a mesma que as rotas de
  // facturação leem quando emitem o sinal e o saldo (ver `depositPercentOf`).
  // Sem isso, a proposta dizia 40% e a factura saía a 30% — que é pior do que
  // não a poder mudar de todo.
  const pctSinal = depositPercentOf(doc as ProposalDoc);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS NÚMEROS DO ECRÃ SÃO OS NÚMEROS DO PAPEL — A MESMA FUNÇÃO, UMA VEZ SÓ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «um bloco de totais inequívoco». O ecrã mostrava TRÊS somas
   * ao mesmo tempo — «Soma das linhas: 2.400,00 €», «Somado ao total: 970,00 €»
   * e, na barra do fundo, «Total 2.460,00 € · o cliente paga 3.025,80 € · soma
   * das linhas 2.400,00 €» — e nenhuma delas era o quadro que o casal recebe.
   * Três números a competir pela mesma pergunta ensinam a não confiar em
   * nenhum.
   *
   * Agora há um bloco só, pela ordem do PDF, e sai de `totaisDaProposta` — a
   * MESMA chamada que `proposal-doc-pdf.ts` faz para desenhar o quadro
   * (`totaisDaProposta(doc, depositPercentOf(doc))`). Enquanto o ecrã fizesse
   * as suas contas e o gerador as dele, o dia em que divergissem chegava — foi
   * exactamente assim que a proposta da Tara e do Marty saiu com o sinal e o
   * saldo a somarem 3.025,80 € e o «Valor Total» a dizer 2.950,79 €.
   */
  const totais = totaisDaProposta(doc, pctSinal);
  // O sinal e o saldo saem daí também, e não de uma segunda chamada a
  // `splitSinal`: eram a mesma divisão feita em dois sítios, e duas
  // implementações da mesma divisão podem arredondar para lados diferentes.
  const split = { sinal: totais.sinal, saldo: totais.saldo };
  // O desvio do total escrito à mão. Vive aqui em cima porque é lido em dois
  // sítios: na dica do campo e no aviso com o botão que o arruma.
  const desvio = desalinhamento(doc, money.base);
  /**
   * Quantas linhas do orçamento já têm preço.
   *
   * Sai de `precosDe` e não de contar campos no ecrã: os preços são um array
   * paralelo às linhas, e é a biblioteca que garante que os dois têm o mesmo
   * comprimento.
   */
  const precos = precosDe(doc);
  const contagem = contagemDePrecos(precos);
  /** Quantas pessoas, lido do campo do documento ("125 pax" → 125). */
  const convidados = convidadosDoDoc(doc as ProposalDoc);
  const escalasDoDoc = escalasDe(doc as ProposalDoc);
  const extrasDoDoc = opcionaisDe(doc as ProposalDoc);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A ORDEM QUE VAI SAIR IMPRESSA, MOSTRADA AQUI
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela, duas vezes: na lista de Serviços é Cerimónia →
   * Complementos → Cocktail → Jantar, no Orçamento é Cerimónia → Cocktail →
   * Jantar → Complementos. As mesmas rubricas, duas ordens.
   *
   * A regra que as alinha já existia — mas dentro de `proposal-doc-pdf.ts`,
   * que é `server-only`. O PDF saía certo e o ECRÃ continuava a mostrar a
   * ordem de escrita, portanto o que ela via era a divergência, sempre. A
   * regra mudou-se para `proposal-ordem.ts` e é agora a MESMA chamada dos
   * dois lados: estas duas linhas e as duas do gerador.
   *
   * As listas por baixo percorrem estes índices e não `map((_, i) =>`. O
   * índice que sai daqui é o VERDADEIRO — o do array — e é esse que os
   * botões recebem: o que muda é a ordem por que se desenham, não onde se
   * escreve.
   */
  const linhasDoOrcamento = linhasDe(doc);
  const ordemDoOrcamento = ordemDeSaida(doc as ProposalDoc, linhasDoOrcamento, (l) => l.item ?? "");
  const ordemDosBoards = ordemDeSaida(doc as ProposalDoc, doc.moodBoards, (b) => b.title ?? "");
  /**
   * ════════════════════════════════════════════════════════════════════════
   * QUANTO PESA ESTA PROPOSTA, SEMPRE À VISTA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «Contagem de fotos por board e total da proposta, sempre
   * visível. Número estimado de páginas do PDF.»
   *
   * As páginas de inspiração são exactamente uma por board COM fotos — um board
   * vazio não imprime nada (o gerador salta-o, para nunca mostrar uma folha em
   * branco a um cliente).
   *
   * O total do PDF é MEDIDO e não estimado a olho: sete páginas fixas (capa,
   * apresentação, serviços, orçamento, condições, observações, contracapa) mais
   * uma por página de inspiração. Um texto muito longo pode empurrar uma secção
   * para a folha seguinte, e é por isso que se diz «cerca de».
   */
  const fotosPorBoard = doc.moodBoards.map((b) => b.images.length);
  const totalDeFotos = fotosPorBoard.reduce((a, b) => a + b, 0);
  const paginasDeInspiracao = fotosPorBoard.filter((n) => n > 0).length;
  const tempoDaProposta = tempoMostrado > 0 ? ` · ${emPalavras(tempoMostrado)} de trabalho` : "";
  const contagemDosBoards =
    `${paginasDeInspiracao} ${paginasDeInspiracao === 1 ? "página" : "páginas"} · ` +
    `${totalDeFotos} ${totalDeFotos === 1 ? "foto" : "fotos"} · ` +
    `PDF com cerca de ${PAGINAS_FIXAS_DO_PDF + paginasDeInspiracao}${tempoDaProposta}`;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * ONDE É QUE ESTA FOTOGRAFIA JÁ ESTEVE
   * ════════════════════════════════════════════════════════════════════════
   *
   * Duas perguntas diferentes, e só uma delas é um aviso:
   *
   *  · JÁ ESTÁ NOUTRO BOARD desta proposta — quase sempre um engano, e é o
   *    único caso em que o casal vê a mesma fotografia duas vezes no mesmo
   *    documento;
   *  · JÁ FOI a outra proposta, e, dentro dessas, as que foram para um
   *    casamento NO MESMO ESPAÇO. É a repetição que alguém nota: a equipa da
   *    quinta, o fotógrafo da casa, os convidados que vão aos dois.
   *
   * As outras repetições — outro casal, outro sítio, outro mês — não são aviso
   * nenhum: a biblioteca existe para ser usada.
   */
  const ondeEstaCadaFoto = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const b of doc.moodBoards)
      for (const p of b.images) {
        if (p) contagem.set(p, (contagem.get(p) ?? 0) + 1);
      }
    return contagem;
  }, [doc.moodBoards]);

  const repetidasPorOrigem = useMemo(
    () => new Map(repetidas.map((f) => [f.origem, f])),
    [repetidas],
  );

  /** O que dizer sobre uma foto, ou nada. */
  function historiaDaFoto(caminho: string): { texto: string; grave: boolean } | null {
    const vezesAqui = ondeEstaCadaFoto.get(caminho) ?? 0;
    if (vezesAqui > 1) {
      return {
        texto: `Esta fotografia está ${vezesAqui} vezes nesta proposta.`,
        grave: true,
      };
    }
    const origem = themeOrigins[caminho];
    const f = origem ? repetidasPorOrigem.get(origem) : undefined;
    if (!f) return null;
    const mesmoEspaco = noMesmoEspaco(f, quote.location || undefined);
    if (mesmoEspaco.length > 0) {
      return {
        texto: `Já foi para ${mesmoEspaco[0].cliente}, no mesmo espaço.`,
        grave: true,
      };
    }
    return { texto: `Já usada — ${comoSeDiz(f)}.`, grave: false };
  }

  /** Alguma das duas listas sai por ordem diferente da que está escrita? */
  const ordemSugerida = !eAOrdemEscrita(ordemDoOrcamento) || !eAOrdemEscrita(ordemDosBoards);

  /**
   * Fixa no documento a ordem que está a ser mostrada.
   *
   * Escreve os arrays já ordenados e acende `ordemExplicita` — a partir daí a
   * sugestão cala-se e a ordem escrita vale sozinha, aqui e no PDF. É o que
   * torna o arrasto possível: enquanto a sugestão mandasse, arrastar um board
   * era pô-lo num sítio e vê-lo voltar na página seguinte.
   *
   * Os preços, os custos e as escalas são arrays PARALELOS às linhas — viajam
   * com a mesma permutação ou o orçamento trocava os preços de sítio, que é
   * um erro que só se vê quando o cliente pergunta.
   */
  function arrumadoEExplicito(d: StudioDoc): StudioDoc {
    const linhas = linhasDe(d);
    const ordemL = ordemDeSaida(d as ProposalDoc, linhas, (l) => l.item ?? "");
    const ordemB = ordemDeSaida(d as ProposalDoc, d.moodBoards, (b) => b.title ?? "");
    const paralelo = <T,>(arr: T[] | undefined) =>
      arr === undefined ? undefined : aplicarOrdem(arr, ordemL);
    return {
      ...d,
      ordemExplicita: ORDEM_EXPLICITA,
      budgetItems: aplicarOrdem(d.budgetItems ?? [], ordemL),
      budgetAmounts: paralelo(d.budgetAmounts),
      budgetCosts: paralelo(d.budgetCosts),
      budgetScales: paralelo(d.budgetScales),
      moodBoards: aplicarOrdem(d.moodBoards, ordemB),
    };
  }

  /**
   * Fixa no documento a ordem que está a ser mostrada.
   *
   * AS DUAS LISTAS DE UMA VEZ, sempre. Acender `ordemExplicita` a arrumar só
   * os mood boards congelava o orçamento na ordem por arrumar — ressuscitava
   * a divergência que isto veio fechar, e desta vez sem sugestão nenhuma a
   * corrigi-la.
   */
  function fixarOrdem(porque: string) {
    setDoc(arrumadoEExplicito);
    toast(porque, "info");
  }

  /**
   * Trocar o tipo de escala de uma linha.
   *
   * Ao passar a escalonável, o unitário nasce do preço que já lá estava
   * dividido pelas unidades — para o total não dar um salto no instante em que
   * ela escolhe a opção. Ao voltar a fixa, o preço fica onde está: era o
   * resultado da última multiplicação, e é um número que ela reconhece.
   */
  function definirEscala(i: number, tipo: TipoDeEscala) {
    setDoc((d) => {
      const escalas = escalasDe(d as ProposalDoc);
      const porMesa = d.convidadosPorMesa ?? CONVIDADOS_POR_MESA_OMISSAO;
      const proximas = escalas.map((e, j) => {
        if (j !== i) return e;
        if (tipo === "fixa") return null;
        const unidades =
          tipo === "por-mesa"
            ? Math.max(1, Math.ceil(convidados / porMesa))
            : Math.max(1, convidados);
        const precoActual = (d.budgetAmounts ?? [])[i];
        const base =
          typeof precoActual === "number" && precoActual > 0 ? precoActual / unidades : 0;
        return { tipo, unitario: Math.round(base * 100) / 100 };
      });
      return recalcular({ ...d, budgetScales: proximas }, convidados);
    });
  }

  function definirUnitario(i: number, texto: string) {
    const n = normalizarValor(texto);
    setDoc((d) => {
      const escalas = escalasDe(d as ProposalDoc);
      const proximas = escalas.map((e, j) => (j === i && e ? { ...e, unitario: n ?? 0 } : e));
      return recalcular({ ...d, budgetScales: proximas }, convidados);
    });
  }
  const duasFormas = asDuasFormas(money.base, doc.vatRate ?? DEFAULT_VAT_RATE);

  // ── O preço mudou na Gestão do pedido: aparece aqui ─────────────────────
  // O outro sentido do mesmo número. Sem isto voltava a haver duas verdades:
  // alterar o "Preço final" no pedido não mexia no estúdio, e o PDF saía com o
  // valor antigo.
  //
  // `precoEnviado` evita o ciclo: quando a mudança veio DAQUI, o valor que
  // volta é o que acabámos de mandar e não há nada a fazer.
  useEffect(() => {
    if (!hydrated.current) return;
    const doPedido = quote.quotedPrice;
    if (doPedido === precoEnviado.current) return;
    precoEnviado.current = doPedido;
    setTotalInput(typeof doPedido === "number" && doPedido > 0 ? textoDoTotal(doPedido) : "");
    setDoc((d) => {
      const mode: VatMode = d.totalVatMode ?? detectVatMode(d.totalText || d.totalEstimatedText);
      const amount =
        typeof doPedido === "number" && doPedido > 0
          ? totalAmountParaBase(doPedido, mode, d.vatRate ?? DEFAULT_VAT_RATE)
          : undefined;
      const text = amount == null ? "" : mode === "acrescer" ? `${eur(amount)} + IVA` : eur(amount);
      return d.template === "organizacao"
        ? { ...d, totalAmount: amount, totalVatMode: mode, totalEstimatedText: text }
        : { ...d, totalAmount: amount, totalVatMode: mode, totalText: text };
    });
  }, [quote.quotedPrice]);

  function setTemplate(t: "decoracao" | "organizacao") {
    setDoc((d) => {
      // Recompõe o texto de display do total para o campo do template ativo, para
      // que o PDF nunca fique com o total em branco após uma troca de template.
      const mode: VatMode = d.totalVatMode ?? detectVatMode(d.totalText || d.totalEstimatedText);
      const text = composeTotalText(d.totalAmount, mode);
      return {
        ...d,
        template: t,
        headerTitle:
          t === "organizacao" ? "Proposta de orçamento para Organização de Casamento" : undefined,
        ...(t === "organizacao" ? { totalEstimatedText: text } : { totalText: text }),
      };
    });
  }

  /**
   * Volta ao documento anterior. Chamada pelo `Cmd/Ctrl+Z` e pelo botão
   * "Desfazer" — o teclado é um atalho, não o caminho.
   *
   * O último elemento do histórico É o documento actual (foi lá posto pela
   * gravação); por isso desfazer tira DOIS e usa o penúltimo.
   */
  function desfazer(): boolean {
    if (historico.current.length < 2) return false;
    const anterior = historico.current[historico.current.length - 2];
    historico.current = historico.current.slice(0, -1);
    setPodeDesfazer(historico.current.length >= 2);
    setDoc(anterior);
    // O campo do total é estado à parte (aceita texto a meio de ser escrito),
    // por isso tem de acompanhar — senão desfazer devolvia o documento antigo
    // e deixava o valor novo na caixa.
    const base = baseDoDoc(anterior);
    setTotalInput(base === undefined ? "" : textoDoTotal(base));
    return true;
  }

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      /**
       * ⌘/Ctrl+S — o MESMO gesto do botão «Guardar agora».
       *
       * É o atalho que toda a gente já tem nos dedos de outros programas, e o
       * que o browser faz com ele por omissão («guardar a página») não serve
       * aqui a ninguém — daí o `preventDefault`. Ao contrário do ⌘Z, vale
       * TAMBÉM com o cursor dentro de uma caixa de texto: é precisamente a
       * meio de escrever um parágrafo que apetece guardar, e não há um
       * «guardar» do browser dentro de um campo para lhe ficar no caminho.
       *
       * DENTRO DO BACK OFFICE ESTE ATALHO NÃO É DAQUI. Passou a ser o gesto
       * único, tratado pelo registo, que grava o estúdio E tudo o resto que
       * tenha coisa por gravar — e responde por todos de uma vez. Dois
       * tratadores para a mesma tecla dariam duas gravações e duas respostas
       * diferentes ao mesmo gesto, que é como se ensina uma pessoa a
       * desconfiar das duas.
       *
       * Fica aqui como recurso para quando o estúdio é montado FORA do registo
       * (o dossier do evento, um teste): um atalho que desaparecesse em
       * silêncio nesses sítios seria trocar uma duplicação por uma perda.
       */
      if (!oRegistoFalaPorMim && e.key.toLowerCase() === "s" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        guardarAgora();
        return;
      }
      if (e.key.toLowerCase() !== "z" || e.shiftKey) return;
      // Dentro de uma caixa de texto, o Cmd+Z do browser desfaz a escrita —
      // que é o que ela espera. Só se assume o comando fora dos campos, ou
      // quando o browser já não tem nada para desfazer nesse campo.
      const alvo = e.target as HTMLElement | null;
      const aEscrever =
        alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (aEscrever) return;
      if (desfazer()) {
        e.preventDefault();
        toast("Desfeito.", "info");
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  });

  /**
   * Depois de o estúdio assentar, vai buscando as miniaturas da biblioteca em
   * segundo plano. É neste ecrã que o seletor de temas se abre — uma vez por
   * mood board —, e é aqui que faz sentido pagar esse trabalho adiantado.
   *
   * Os travões (dados poupados, ligação lenta) estão no próprio
   * `aquecerFotosEmSegundoPlano`, não aqui: quem decide se vale a pena gastar
   * bytes é quem sabe como está a rede, não quem sabe que ecrã é este.
   */
  useEffect(() => {
    aquecerFotosEmSegundoPlano();
  }, []);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A FOLGA POR BAIXO DO FORMULÁRIO É A ALTURA MEDIDA DA BARRA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Ver o comentário ao lado do `paddingBottom`, na marcação. O que aqui se
   * mede são duas coisas somadas: a altura da barra e a distância a que ela
   * está do fundo do ecrã (o `bottom-[calc(56px+…)]` que a levanta por cima da
   * navegação do telemóvel). Sem a segunda, a folga era curta exactamente nos
   * ecrãs onde a barra está mais alta.
   *
   * Começa em 80 px — o número que aqui estava escrito à mão — para o primeiro
   * desenho não ficar sem folga nenhuma antes de a medição correr.
   */
  const barraDeBaixo = useRef<HTMLDivElement | null>(null);
  const [folgaDaBarra, setFolgaDaBarra] = useState(80);
  useEffect(() => {
    const el = barraDeBaixo.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      // `innerHeight - r.bottom` é o que sobra por baixo da barra quando ela
      // está encostada — os 56 px da navegação, mais a área segura do iPhone.
      const porBaixo = Math.max(0, window.innerHeight - r.bottom);
      setFolgaDaBarra(Math.ceil(r.height + porBaixo + 12));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    window.addEventListener("resize", medir);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
    };
    // O passo muda o conteúdo da barra (e portanto a altura); remedir aí.
  }, [step]);

  // ── Aviso ao sair com trabalho por gravar ─────────────────────────────
  // A janela é estreita (a gravação é a 800ms), mas existe: fechar o
  // separador logo a seguir a escrever perdia essas últimas palavras.
  //
  // E também quando o rascunho ficou SÓ NESTE COMPUTADOR: aí a janela não é
  // estreita nenhuma — é todo o tempo em que o servidor recusar as gravações.
  // Fechar o separador nesse estado não perde o `localStorage`, mas perde a
  // única pessoa que ainda podia fazer alguma coisa acerca disso.
  //
  // DENTRO DO BACK OFFICE QUEM TRAVA É O REGISTO: um travão só para todos os
  // ecrãs, e capaz de nomear o que se perde («Proposta de Rita & Tomás») em vez
  // de dizer apenas que se perde alguma coisa. Este continua a valer onde não
  // há registo — o dossier do evento, um teste — porque um travão que
  // desaparecesse em silêncio seria a pior troca possível.
  useEffect(() => {
    if (oRegistoFalaPorMim) return;
    if (!porGravar && !soNesteComputador && aGravarNoServidor === 0) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [oRegistoFalaPorMim, porGravar, soNesteComputador, aGravarNoServidor]);

  // ── A contagem dos dez segundos para anular a limpeza ─────────────────
  useEffect(() => {
    if (!limpo) return;
    if (limpo.segundos <= 0) {
      setLimpo(null);
      return;
    }
    const t = setTimeout(
      () => setLimpo((l) => (l ? { ...l, segundos: l.segundos - 1 } : null)),
      1000,
    );
    return () => clearTimeout(t);
  }, [limpo]);

  /** Devolve o rascunho que o "Limpar" deitou fora. */
  function anularLimpeza() {
    if (!limpo) return;
    setDoc(limpo.doc);
    setTotalInput(limpo.total);
    // E o preço volta ao pedido com ele: quem repôs o rascunho repôs o valor
    // que lá estava, e deixá-lo só no ecrã era voltar a ter duas verdades.
    const base = parseMoneyText(limpo.total);
    persistirPreco(base > 0 ? base : undefined);
    setLimpo(null);
    toast("Rascunho reposto.", "success");
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O QUE MEXE EM DINHEIRO FICA ESCRITO NO HISTÓRICO DO PEDIDO
   * ════════════════════════════════════════════════════════════════════════
   *
   * O mesmo sítio onde já ficam o estado, os pagamentos e as propostas
   * enviadas — o `activityLog` que o `ActivityLog.tsx` desenha. Nada de um
   * registo novo só para o estúdio: dois históricos sobre o mesmo negócio são
   * dois sítios onde procurar, e o segundo é sempre o que ninguém abre.
   *
   * `activityLogAppend` e não `activityLog`: o servidor junta a entrada ao
   * registo FRESCO (ver a rota `PATCH /api/orcamento/[id]`). Mandar o array
   * inteiro fazia duas ferramentas a gravar ao mesmo tempo apagarem as
   * entradas uma da outra.
   *
   * `price_set` porque é disso que se trata em todas elas: o número que muda é
   * o preço final do pedido. Falhar não interrompe nada — perde-se uma linha
   * de histórico, não o trabalho. A resposta NÃO é propagada com
   * `onQuoteUpdated`: pode cruzar-se com a gravação do preço (que tem o seu
   * próprio travão de 600 ms) e devolver um valor já velho.
   */
  function registarNoHistorico(summary: string) {
    const entrada: ActivityEntry = {
      id: randomId(),
      at: new Date().toISOString(),
      kind: "price_set",
      summary,
    };
    void fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityLogAppend: [entrada] }),
    }).catch(() => {
      /* sem rede: a alteração vale na mesma, fica é sem linha no histórico */
    });
  }

  /**
   * Pede a confirmação de uma alteração drástica ao dinheiro, com os dois
   * valores à vista — e, aplicada, deixa dez segundos para a anular.
   *
   * Um só caminho para todas elas (ver `confirmacaoDeDinheiro`): enquanto cada
   * botão tivesse a sua maneira de perguntar, cada um respondia por si e
   * nenhum ficava no histórico.
   */
  function pedirConfirmacaoDeDinheiro(p: {
    de: number;
    para: number;
    /** O que se está a substituir, em palavras («o total», «a deslocação»). */
    oQue: string;
    registo: string;
    motivo: string;
    aplicar: () => void;
  }) {
    setConfirmacaoDeDinheiro({
      pergunta: `Substituir ${p.oQue} de ${eur(p.de)} por ${eur(p.para)}?`,
      registo: p.registo,
      motivo: p.motivo,
      docNoMomento: doc,
      aplicar: p.aplicar,
    });
  }

  /** Aplica o que estava por confirmar: escreve, regista e abre a anulação. */
  function confirmarDinheiro() {
    const c = confirmacaoDeDinheiro;
    // A pergunta caducada não se aplica — nem sequer está desenhada.
    if (!c || c.docNoMomento !== doc) return;
    // A fotografia é tirada ANTES de aplicar — é ela que a anulação repõe.
    setLimpo({ doc, total: totalInput, segundos: 10, motivo: c.motivo });
    c.aplicar();
    registarNoHistorico(c.registo);
    setConfirmacaoDeDinheiro(null);
  }

  /**
   * Repõe no estúdio uma versão que já tinha sido enviada.
   *
   * Passa pela MESMA anulação de dez segundos do "Limpar", e pela mesma razão:
   * o gesto deita fora o que estava no ecrã, e quem carrega só vê o que perdeu
   * depois de carregar. Uma caixa a perguntar "tem a certeza?" seria respondida
   * sem ser lida.
   *
   * Não envia nada. Fica um rascunho igual ao que seguiu naquele dia, para se
   * mexer e voltar a passar pelo Enviar.
   *
   * ── PORQUE É QUE ESTA NÃO GANHOU CAIXA DE CONFIRMAÇÃO ──────────────────
   * É uma das acções que mudam o preço final, e portanto entra na lista das
   * que têm de ser reversíveis e ficar no histórico — e ficam as duas coisas.
   * O que não ganha é a PERGUNTA: a razão está escrita três linhas acima e não
   * mudou. Perguntar antes de repor uma versão que ela acabou de escolher numa
   * lista, pelo nome e pela data, era pedir para confirmar a leitura.
   */
  function restaurarVersao(antiga: ProposalDoc) {
    setLimpo({
      doc,
      total: totalInput,
      segundos: 10,
      motivo: "Versão anterior reposta no rascunho.",
    });
    const reposto = antiga as StudioDoc;
    setDoc(reposto);
    // O campo do total é texto (aceita "1.500" e "1 500 €"), por isso não sai de
    // graça do documento: deriva-se a base do que foi reposto, senão ficava com
    // o número da versão que se acabou de substituir.
    const base = baseDoDoc(reposto);
    setTotalInput(typeof base === "number" && base > 0 ? textoDoTotal(base) : "");
    // E GRAVA-SE no pedido. Escrever no campo do valor já gravava — é a
    // promessa que está escrita ao lado dele, «Há um número só» — e repor uma
    // versão trocava o documento inteiro, valor incluído, sem gravar nada. O
    // estúdio passava a dizer 8.000 e a Gestão do pedido, o Kanban e o dossier
    // continuavam a dizer 9.400 até ela enviar. Duas verdades sobre o mesmo
    // negócio, e a errada era a que aparecia em todos os outros ecrãs.
    persistirPreco(typeof base === "number" && base > 0 ? base : undefined);
    // A referência é composta a partir dos campos ATÉ alguém lhe mexer. Uma
    // versão reposta traz a referência com que seguiu, e recompô-la por cima
    // trocava o número da proposta que o cliente tem em mãos.
    setRefEdited(true);
    setConfirmSend(false);
    setSent(false);
    setStep("conteudo");
    // Só se o preço tiver MESMO mudado: repor uma versão com o mesmo valor não
    // é um acontecimento do dinheiro, e uma linha por cada não-mudança ensina a
    // saltar o histórico todo.
    const anterior = parseMoneyText(totalInput);
    const novo = typeof base === "number" && base > 0 ? base : 0;
    if (Math.abs(novo - anterior) > 0.01) {
      registarNoHistorico(
        `Versão anterior reposta no estúdio: preço final de ${eur(anterior)} para ${eur(novo)}.`,
      );
    }
    toast("Versão reposta. Podes anular durante 10 segundos.", "info");
  }

  function clearDraft() {
    // Sem caixa de confirmação: guarda-se o que estava e dá-se dez segundos
    // para o trazer de volta. Ver a razão em `limpo`, mais acima.
    setLimpo({ doc, total: totalInput, segundos: 10, motivo: "Rascunho limpo." });
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(`${DRAFT_KEY}:at`);
      localStorage.removeItem(SIDE_KEY);
    } catch {
      /* ignore */
    }
    // E no servidor — senão o rascunho limpo aqui reaparecia no dispositivo
    // seguinte, que é precisamente o que guardá-lo lá veio resolver.
    serverStamp.current = null;
    warnedOverwrite.current = false;
    void fetch(`/api/orcamento/${quote.id}/proposta-rascunho`, { method: "DELETE" }).catch(() => {
      /* sem rede: fica para a próxima limpeza; nada se perde por isso */
    });
    setDoc(seedDefaults(initialDoc(quote), quote));
    setTotalInput(
      typeof quote.quotedPrice === "number" && quote.quotedPrice > 0
        ? textoDoTotal(quote.quotedPrice)
        : "",
    );
    setAssetUrls({});
    setAssetOriginais({});
    setAssetCores({});
    setThemeOrigins({});
    setRefEdited(false);
    setConfirmSend(false);
    setSent(false);
    setStep("conteudo");
    // Limpar deita o total fora com o resto — e o total é o preço do pedido.
    // Fica no histórico pela mesma razão que o «Usar X €»: um preço que muda
    // sozinho, visto três semanas depois, tem de ter um sítio onde se explique.
    const anterior = parseMoneyText(totalInput);
    const doPedido = typeof quote.quotedPrice === "number" ? quote.quotedPrice : 0;
    if (Math.abs(doPedido - anterior) > 0.01) {
      registarNoHistorico(
        `Rascunho da proposta limpo: preço final de ${eur(anterior)} para ${eur(doPedido)}.`,
      );
    }
    toast("Rascunho limpo", "info");
  }

  // ── Image upload ──
  // Uma imagem por pedido: um lote inteiro num só POST rebentava o limite de
  // corpo do alojamento (~4,5 MB) com fotos reais de telemóvel — o upload
  // "às vezes não funcionava". Cada ficheiro é comprimido no navegador
  // (image-prep) e enviado individualmente, com uma repetição automática em
  // falha de rede; um ficheiro mau nunca deita fora os restantes.
  async function uploadOne(
    file: File,
    thumb: File | null,
    cor?: string | null,
  ): Promise<{ path: string; url: string; thumbUrl?: string; cor?: string }> {
    const post = () => {
      const form = new FormData();
      form.append("files", file);
      // A cor dominante, calculada na mesma descodificação que encolheu a foto
      // (ver `image-prep`). É aqui que ela pode ser calculada — do lado do
      // estúdio as fotos já vêm de outro domínio e o `canvas` fica manchado.
      if (cor) form.append("cores", cor);
      // A miniatura viaja ao lado do original, no mesmo pedido: sai da MESMA
      // descodificação que já se fez para encolher a foto, portanto não custa
      // tempo nenhum, e ~30–60 KB não se notam ao lado de uma foto de 2 MB.
      // Sem ela, a grelha voltava a puxar 1130 KB por célula para desenhar
      // 174 px (medido em IMAGES-BEFORE.md).
      if (thumb) form.append("thumbs", thumb);
      return fetch(`/api/orcamento/${quote.id}/assets`, { method: "POST", body: form });
    };
    let res: Response;
    try {
      res = await post();
    } catch {
      // Soluço de rede — tenta uma segunda vez antes de desistir.
      res = await post();
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        data?.error ||
          (res.status === 413
            ? "Imagem demasiado grande para envio."
            : "Falha ao carregar a imagem."),
      );
    }
    const im: { path: string; url: string; thumbUrl?: string; cor?: string } | undefined =
      data?.images?.[0];
    if (!im) throw new Error("Falha ao carregar a imagem.");
    // A grelha desenha pela miniatura quando existe; o original fica para o
    // detalhe e para o PDF.
    setAssetUrls((prev) => ({ ...prev, [im.path]: im.thumbUrl || im.url }));
    setAssetOriginais((prev) => ({ ...prev, [im.path]: im.url }));
    if (im.cor) setAssetCores((prev) => ({ ...prev, [im.path]: im.cor as string }));
    return im;
  }

  async function handleUpload(key: string, files: File[], onPaths: (paths: string[]) => void) {
    if (files.length === 0) return;
    setUploading((u) => ({ ...u, [key]: true }));
    // Cover photos print large (the document's hero) so they keep more pixels and
    // a higher JPEG quality; mood-board photos render as small collage cells and
    // use a tighter cap. The upload key encodes which is which ("cover-…"/"board-…").
    const kind: ImageKind = key.startsWith("board-") ? "board" : "cover";
    // Preparar e enviar em VIAS PARALELAS. Em sequência, o processador ficava
    // parado à espera da rede e a rede parada à espera do processador; assim a
    // foto N+1 é preparada enquanto a N sobe. A preparação em si já corre fora
    // do fio principal (image-prep → image-worker), por isso a interface
    // continua a responder durante o lote.
    const results: ({ path: string } | null)[] = new Array(files.length).fill(null);
    const errors: string[] = [];
    let next = 0;
    async function lane() {
      for (;;) {
        const i = next++;
        if (i >= files.length) return;
        const f = files[i];
        try {
          const prepared = await prepareImageWithThumb(f, kind);
          const im = await uploadOne(prepared.file, prepared.thumb, prepared.cor);
          // Guardado pelo ÍNDICE: as vias acabam fora de ordem e a ordem das
          // fotos escolhidas é a que a Catarina vê no documento.
          results[i] = { path: im.path };
        } catch (e) {
          errors.push(e instanceof Error ? e.message : `Falha ao carregar "${f.name}".`);
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, lane));
      const paths = results.filter((r): r is { path: string } => r !== null).map((r) => r.path);
      if (paths.length > 0) onPaths(paths);
      if (errors.length > 0) {
        toast(
          errors.length === files.length
            ? errors[0]
            : `${paths.length} de ${files.length} carregadas. ${errors[0]}`,
          "error",
        );
      } else if (paths.length > 1) {
        toast(`${paths.length} imagens carregadas`, "success");
      }
    } finally {
      setUploading((u) => ({ ...u, [key]: false }));
    }
  }

  // ── Biblioteca de temas ──
  //
  /** As fotos da biblioteca que já estão nesta proposta, para o seletor as
   *  marcar. Sai do DOCUMENTO (capas + mood boards) e não do mapa de origens:
   *  uma foto removida do rascunho deixa de contar no instante em que é
   *  removida, mesmo que a origem fique lá guardada. */
  /**
   * Os caminhos de ORIGEM das fotos de biblioteca que estão neste documento.
   *
   * Origem e não caminho da proposta: as fotos da proposta são cópias com
   * caminho próprio, e comparar cópias nunca diria que duas propostas mostraram
   * a mesma imagem.
   */
  function origensNoDocumento(): string[] {
    const noDoc = new Set<string>();
    for (const p of doc.coverImages ?? []) if (p) noDoc.add(p);
    for (const b of doc.moodBoards ?? []) for (const p of b.images) if (p) noDoc.add(p);
    const origens = new Set<string>();
    for (const p of noDoc) {
      const de = themeOrigins[p];
      if (de) origens.add(de);
    }
    return [...origens];
  }

  /**
   * As fotos da biblioteca que já foram para OUTROS casamentos, e para onde.
   *
   * Lê-se uma vez por pedido: o que já foi enviado não muda enquanto se escreve
   * esta proposta. Falhar não impede nada — sem a resposta a grelha é a de
   * antes, e escolher uma foto repetida continua a ser possível, que é como
   * deve ser.
   */
  const [usadasNoutras, setUsadasNoutras] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/orcamento/${quote.id}/fotos-repetidas`);
        if (!res.ok) return;
        const data = (await res.json()) as { fotos?: FotoRepetida[] };
        if (!vivo || !Array.isArray(data.fotos)) return;
        setUsadasNoutras(Object.fromEntries(data.fotos.map((f) => [f.origem, comoSeDiz(f)])));
        // A lista inteira, e não só a frase: é dela que sai o aviso do MESMO
        // ESPAÇO, que precisa do `local` de cada uso.
        setRepetidas(data.fotos);
      } catch {
        /* a grelha fica a de antes */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [quote.id]);

  const usedThemePaths = useMemo(() => {
    if (!picker) return [];
    const inDoc = new Set<string>();
    for (const p of doc.coverImages ?? []) if (p) inDoc.add(p);
    for (const b of doc.moodBoards) for (const p of b.images) inDoc.add(p);
    const sources: string[] = [];
    for (const p of inDoc) {
      const from = themeOrigins[p];
      if (from) sources.push(from);
    }
    return sources;
  }, [picker, doc.coverImages, doc.moodBoards, themeOrigins]);

  /**
   * O INSTANTE DO CLIQUE — a foto ocupa já o seu lugar.
   *
   * O seletor entrega um marcador por foto (`pending:<uuid>`), que não é
   * caminho de coisa nenhuma, e a miniatura que ele JÁ tem desenhada em
   * memória. O marcador entra no documento no sítio para onde o seletor foi
   * aberto e o `assetUrls` aponta-o a essa miniatura: a foto aparece no mood
   * board (ou na capa) sem um único pedido de rede novo, na célula certa e com
   * o mesmo `aspect-ratio` das outras — nada salta quando ela assentar.
   *
   * A origem entra AQUI e não só na confirmação: uma foto a caminho já conta
   * como "já nesta proposta" (ver `usedThemePaths`), senão dava para a escolher
   * outra vez enquanto a primeira cópia ainda ia a caminho.
   */
  function onReservedFromLibrary(reservas: ReservedImage[]) {
    if (reservas.length === 0) return;
    setAssetUrls((prev) => {
      const next = { ...prev };
      for (const r of reservas) if (r.thumbUrl) next[r.marcador] = r.thumbUrl;
      return next;
    });
    setThemeOrigins((prev) => {
      const next = { ...prev };
      for (const r of reservas) if (r.sourcePath) next[r.marcador] = r.sourcePath;
      return next;
    });
    if (picker?.kind === "board" && picker.substituir !== undefined) {
      substituirFotoDoBoard(picker.bi, picker.substituir, reservas[0].marcador);
    } else if (picker?.kind === "board") {
      addBoardImages(
        picker.bi,
        reservas.map((r) => r.marcador),
      );
    } else if (picker?.kind === "cover") {
      setCoverAt(picker.idx, reservas[0].marcador);
    }
  }

  // As fotos escolhidas vêm REFERENCIADAS (`tema:<caminho>`) pela rota
  // /assets/importar — deixaram de ser copiadas. Para o documento é
  // indiferente: continua a ser uma string por foto, e quem a resolve (a grelha
  // aqui, o gerador de PDF lá) sabe ler as duas famílias. O porquê está em
  // `src/lib/theme-ref.ts`.
  //
  // O seletor entrega as fotos LOTE A LOTE (é assim que a barra de progresso
  // pode ser verdadeira), por isso isto corre várias vezes por importação.
  //
  // Cada foto que traz o seu `marcador` é uma TROCA NO LUGAR: o marcador provisório
  // dá lugar ao caminho definitivo na mesma célula, sem reordenar nada. As que
  // vêm sem `marcador` — quem não reservou lugar, ou um lote que o servidor não
  // deixou emparelhar com segurança — são acrescentadas, como sempre foram.
  //
  // Um marcador que já não esteja no documento (ela removeu a foto enquanto a
  // cópia ia a caminho) não volta a entrar: a decisão dela é mais recente.
  function onPickedFromLibrary(images: ImportedImage[]) {
    if (images.length === 0) return;
    const trocas = new Map<string, string>();
    const novas: ImportedImage[] = [];
    for (const im of images) {
      if (!im.path) continue;
      if (im.marcador) trocas.set(im.marcador, im.path);
      else novas.push(im);
    }
    setAssetUrls((prev) => {
      const next = { ...prev };
      // A miniatura é a DO TEMA — o mesmo `theme-thumbs/<pasta>/<x>.jpg` que o
      // seletor acabou de mostrar. É esse o ganho da referência: o service
      // worker já a tem no disco (guarda por caminho, sem marcador), portanto a
      // célula desenha sem tocar na rede.
      for (const im of images) if (im.path && im.url) next[im.path] = im.thumbUrl || im.url;
      for (const marcador of trocas.keys()) delete next[marcador];
      return next;
    });
    setAssetOriginais((prev) => {
      const next = { ...prev };
      for (const im of images) if (im.path && im.url) next[im.path] = im.url;
      for (const marcador of trocas.keys()) delete next[marcador];
      return next;
    });
    setThemeOrigins((prev) => {
      const next = { ...prev };
      for (const im of images) if (im.path && im.sourcePath) next[im.path] = im.sourcePath;
      for (const marcador of trocas.keys()) delete next[marcador];
      return next;
    });
    if (trocas.size > 0) {
      setDoc((d) => mapImagePaths(d, (p) => trocas.get(p) ?? p));
    }
    if (novas.length === 0) return;
    if (picker?.kind === "board" && picker.substituir !== undefined) {
      substituirFotoDoBoard(picker.bi, picker.substituir, novas[0].path);
    } else if (picker?.kind === "board") {
      addBoardImages(
        picker.bi,
        novas.map((im) => im.path),
      );
    } else if (picker?.kind === "cover") {
      setCoverAt(picker.idx, novas[0].path);
    }
  }

  /**
   * A cópia falhou (ou foi parada): o lugar reservado desaparece.
   *
   * SEM AVISO NENHUM daqui — a pastilha do seletor já diz quantas não entraram,
   * porquê, e oferece "Repetir". Um segundo aviso a dizer o mesmo só ensinaria
   * a ignorar os dois.
   */
  function onDroppedFromLibrary(marcadores: string[]) {
    if (marcadores.length === 0) return;
    const perdidos = new Set(marcadores);
    setDoc((d) => mapImagePaths(d, (p) => (perdidos.has(p) ? null : p)));
    setAssetUrls((prev) => {
      const next = { ...prev };
      for (const t of marcadores) delete next[t];
      return next;
    });
    setThemeOrigins((prev) => {
      const next = { ...prev };
      for (const t of marcadores) delete next[t];
      return next;
    });
  }

  // ── Serviços ──
  // O editor da secção vive em `ServicesEditor.tsx` (teclado, arrasto, anular).
  // Aqui fica só a ponte para o documento.
  const setServiceGroups = useCallback(
    (update: (prev: StudioDoc["serviceGroups"]) => StudioDoc["serviceGroups"]) => {
      setDoc((d) => {
        const next = update(d.serviceGroups);
        return next === d.serviceGroups ? d : { ...d, serviceGroups: next };
      });
    },
    [],
  );

  // ── Mood boards (decoracao) ──
  /**
   * Um mood board NOVO nasce a manter a forma das fotografias.
   *
   * O campo está no documento e não no código de desenho justamente para os
   * documentos ANTIGOS não mudarem (o PDF é redesenhado a cada abertura do link
   * do casal, e uma proposta já enviada não pode mudar de aspecto por baixo
   * dele). Mas uma página que ainda não existe não tem passado nenhum a
   * proteger — e o que ela pediu, por escrito e em duas páginas, foi que as
   * fotografias deixassem de sair cortadas. Portanto o que nasce hoje nasce
   * assim; o que já lá está muda quando ela quiser, no interruptor de cada
   * bloco.
   */
  function addBoard() {
    setDoc((d) => ({
      ...d,
      moodBoards: [
        ...d.moodBoards,
        { title: "", annotation: "", images: [], enquadramento: "forma-da-foto" },
      ],
    }));
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * INSERIR UM MOOD BOARD GUARDADO COMO MODELO
   * ═══════════════════════════════════════════════════════════════════════
   *
   * ── Porque é que isto não é um `setDoc` de uma linha ────────────────────
   * Era. E as fotos do modelo vêm com o caminho que tinham onde foram
   * guardadas — `<quoteIdOrigem>/<uuid>.jpg`, debaixo de OUTRO pedido.
   * Inseridas tal e qual, o documento novo ficava a apontar para a pasta
   * alheia: as células abriam sem miniatura (a listagem de fotos é por
   * pedido), e no dia em que esse pedido fosse apagado a proposta — a essa
   * altura já enviada — ficava sem imagens, sem ninguém dar por nada.
   *
   * É o mesmo problema que o «Criar a partir de…» já resolvia com
   * `duplicarFotosParaPedido`, e que ao inserir um BLOCO ninguém resolvia.
   *
   * ── O que NÃO se recopia ────────────────────────────────────────────────
   * As referências à Biblioteca (`tema:…`) não vivem debaixo de pedido nenhum
   * — são estáveis por construção e copiá-las seria desfazer o que a
   * referência veio ganhar (ver `theme-ref.ts`). As embutidas (`data:`) viajam
   * dentro do documento. E as que já são deste pedido ficam onde estão.
   *
   * ── E se a cópia falhar ─────────────────────────────────────────────────
   * O bloco fica na mesma, com os caminhos de origem, e diz-se. É a mesma
   * política do «Criar a partir de…»: uma proposta acoplada à pasta de outro
   * pedido é pior do que uma proposta com fotos — mas é muito melhor do que um
   * mood board vazio e um gesto que não fez nada.
   */
  async function inserirMoodBoardDeModelo(modelo: MoodBoard) {
    const novo: MoodBoard = { ...modelo, images: [...(modelo.images ?? [])] };
    setDoc((d) => ({ ...d, moodBoards: [...d.moodBoards, novo] }));

    // O predicado é uma função à parte, e a referência à Biblioteca fica para
    // ÚLTIMO: `ehRefDeTema` é um type guard (`ref is string`), portanto negá-lo
    // a meio estreita a string até `never` e o TypeScript recusa tudo o que
    // venha a seguir sobre a mesma variável.
    const precisaDeCopia = (p: string): boolean => {
      if (!p || p.startsWith("data:") || isPendingImage(p)) return false;
      if (p.startsWith(`${quote.id}/`)) return false;
      return !ehRefDeTema(p);
    };
    const deOutroPedido = novo.images.filter(
      (p): p is string => typeof p === "string" && precisaDeCopia(p),
    );
    if (deOutroPedido.length === 0) return;

    try {
      const res = await fetch("/api/propostas/copiar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id, fotos: deOutroPedido }),
      });
      const dados = await res.json().catch(() => null);
      const mapa = (dados?.fotos ?? {}) as Record<string, string>;
      const copiadas = Object.keys(mapa);
      if (!res.ok || copiadas.length === 0) throw new Error("sem cópias");
      // A troca é feita no documento INTEIRO e por caminho: se ela já tiver
      // mexido no bloco entretanto (arrastado, removido uma foto), a troca
      // acompanha na mesma em vez de escrever por cima do que ela fez.
      setDoc((d) => mapImagePaths(d, (p) => mapa[p] ?? p));
      // As fotos novas ainda não têm assinatura nenhuma neste ecrã.
      void hidratarAssets();
      const ficaram = deOutroPedido.length - copiadas.length;
      if (ficaram > 0) {
        toast(`${ficaram} foto(s) do modelo ficaram na pasta da proposta de origem.`, "error");
      }
    } catch {
      toast(
        "As fotos deste modelo ficaram na pasta da proposta de origem — volta a escolhê-las se essa proposta for apagada.",
        "error",
      );
    }
  }
  function updateBoard(bi: number, p: Partial<StudioDoc["moodBoards"][number]>) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) => (i === bi ? { ...b, ...p } : b)),
    }));
  }
  function removeBoard(bi: number) {
    setDoc((d) => ({ ...d, moodBoards: d.moodBoards.filter((_, i) => i !== bi) }));
  }
  /**
   * Move o board que está NA POSIÇÃO `pos` do ecrã.
   *
   * Recebe a posição visível e não o índice do array porque, enquanto a ordem
   * vier sugerida pelos Serviços, os dois números são diferentes — e mover
   * «o terceiro que vejo» tem de mover o terceiro que se vê.
   *
   * Arrumar à mão é uma decisão: materializa a ordem mostrada e acende
   * `ordemExplicita`. Sem isso, ela punha o board no sítio e a sugestão
   * devolvia-o ao lugar de onde saiu.
   */
  function moveBoard(pos: number, dir: -1 | 1) {
    setDoc((d) => {
      const arrumado = arrumadoEExplicito(d);
      return { ...arrumado, moodBoards: move(arrumado.moodBoards, pos, dir) };
    });
  }
  function addBoardImages(bi: number, paths: string[]) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        i === bi ? { ...b, images: [...b.images, ...paths] } : b,
      ),
    }));
    // AVISAR AQUI, e não só depois de gerar o PDF. Quem põe a sétima foto num
    // mood board fica a saber nesse instante — e não quando o documento já
    // seguiu (ou nem isso, que era o que acontecia). O cartão do mood board
    // fica também com a marca permanente, para o aviso não se perder com o
    // toast: ver `MOOD_BOARD_MAX_IMAGES` mais abaixo, na grelha de fotos.
    const total = (doc.moodBoards[bi]?.images.length ?? 0) + paths.length;
    if (total > MOOD_BOARD_MAX_IMAGES) {
      const sobra = total - MOOD_BOARD_MAX_IMAGES;
      toast(
        `Este mood board fica com ${total} fotos e a página do PDF mostra ${MOOD_BOARD_MAX_IMAGES}: ` +
          `${sobra === 1 ? "a última não entra" : `as últimas ${sobra} não entram`}. ` +
          "Remove fotos ou cria outro mood board.",
        "error",
      );
    }
  }
  /**
   * Remover uma foto — PELA POSIÇÃO, e com dez segundos para voltar atrás.
   *
   * Era por caminho (`filter((p) => p !== path)`), e a mesma fotografia pode
   * estar duas vezes no mesmo board: remover uma removia as duas. Com a grelha
   * a poder ser reordenada e a receber fotos de outros boards, a posição passou
   * a ser a única coisa que identifica uma célula.
   *
   * A anulação é a mesma dos dez segundos do «Limpar» (`setLimpo`): guarda o
   * documento inteiro antes de mexer. Sem diálogo a perguntar — é a regra desta
   * casa, e uma pergunta antes de tirar uma foto de uma grelha de quarenta
   * seria respondida sem ser lida.
   */
  function removeBoardImageAt(bi: number, ii: number) {
    setLimpo({ doc, total: totalInput, segundos: 10, motivo: "Fotografia removida." });
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        i === bi
          ? {
              ...b,
              images: b.images.filter((_, j) => j !== ii),
              // A marca da principal acompanha: sem isto, tirar a foto de cima
              // fazia «a principal» passar a ser a que calhou àquele índice.
              principal: marcaDepoisDeMexer(b, (antigo) =>
                antigo === ii ? null : antigo > ii ? antigo - 1 : antigo,
              ),
            }
          : b,
      ),
    }));
  }

  /**
   * Trocar UMA fotografia no lugar.
   *
   * Palavras dela: «Substituir uma foto sem a apagar primeiro: abre a
   * biblioteca e troca no lugar.» Sem isto, trocar era remover (perdendo a
   * posição), escolher outra — que ia para o fim — e arrastá-la de volta.
   *
   * A marca da principal não se toca: o lugar continua a ser o mesmo, e quem
   * troca a foto que manda na página quer que a nova mande na mesma.
   */
  function substituirFotoDoBoard(bi: number, ii: number, path: string) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        i === bi ? { ...b, images: b.images.map((p, j) => (j === ii ? path : p)) } : b,
      ),
    }));
    setPicker(null);
  }

  /** Reordenar dentro do mesmo board. */
  /**
   * ════════════════════════════════════════════════════════════════════════
   * ARRUMAR UM BOARD POR COR
   * ════════════════════════════════════════════════════════════════════════
   *
   * A ordem das fotos É a composição da página (ver `proposal-moodboard.ts`),
   * e uma página lê-se melhor quando as cores fazem uma transição em vez de
   * saltarem. Isto arruma-as por parecença — ver `ordemPorCor`, que encadeia
   * cada foto com a mais próxima da anterior.
   *
   * Não é destrutivo nem definitivo: entra no histórico como qualquer outra
   * alteração, e o Cmd+Z desfaz. Por isso não há caixa de confirmação.
   *
   * As fotos sem cor conhecida (as carregadas antes de a cor existir) ficam no
   * fim, pela ordem em que estavam — nunca se lhes inventa uma cor.
   */
  function arrumarPorCor(bi: number) {
    const board = doc.moodBoards[bi];
    if (!board) return;
    const ordem = ordemPorCor(board.images.map((p) => assetCores[p]));
    if (ordem.every((idx, i) => idx === i)) {
      toast("Esta página já está arrumada por cor.", "info");
      return;
    }
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) => {
        if (i !== bi) return b;
        return {
          ...b,
          images: ordem.map((idx) => b.images[idx]),
          // A foto que manda na página continua a ser a MESMA fotografia, no
          // sítio novo. Sem isto, arrumar por cor promovia a destaque outra
          // foto qualquer — a que calhasse cair na posição marcada.
          principal: marcaDepoisDeMexer(b, (antigo) => {
            const novo = ordem.indexOf(antigo);
            return novo < 0 ? antigo : novo;
          }),
        };
      }),
    }));
    toast("Fotografias arrumadas por cor. Cmd+Z desfaz.", "success");
  }

  function reordenarFotos(bi: number, de: number, para: number) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) => {
        if (i !== bi) return b;
        const imagens = [...b.images];
        const [foto] = imagens.splice(de, 1);
        if (foto === undefined) return b;
        imagens.splice(para, 0, foto);
        return {
          ...b,
          images: imagens,
          principal: marcaDepoisDeMexer(b, (antigo) => {
            if (antigo === de) return para;
            // As que ficam entre o sítio de onde saiu e aquele para onde foi
            // deslizam uma posição — para que lado depende da direcção.
            if (de < antigo && antigo <= para) return antigo - 1;
            if (para <= antigo && antigo < de) return antigo + 1;
            return antigo;
          }),
        };
      }),
    }));
  }

  /**
   * Mover uma foto de um board para outro.
   *
   * `paraIndice = -1` quer dizer «no fim» — é o que chega de uma largada na
   * grelha em vez de sobre uma foto, que é o único caminho possível quando o
   * board de destino está vazio.
   */
  function moverFotoDeBoard(
    deBoard: number,
    deIndice: number,
    paraBoard: number,
    paraIndice: number,
  ) {
    setDoc((d) => {
      const origem = d.moodBoards[deBoard];
      const foto = origem?.images[deIndice];
      if (foto === undefined) return d;
      return {
        ...d,
        moodBoards: d.moodBoards.map((b, i) => {
          if (i === deBoard) {
            return {
              ...b,
              images: b.images.filter((_, j) => j !== deIndice),
              principal: marcaDepoisDeMexer(b, (antigo) =>
                antigo === deIndice ? null : antigo > deIndice ? antigo - 1 : antigo,
              ),
            };
          }
          if (i === paraBoard) {
            const imagens = [...b.images];
            const onde = paraIndice < 0 ? imagens.length : Math.min(paraIndice, imagens.length);
            imagens.splice(onde, 0, foto);
            return {
              ...b,
              images: imagens,
              principal: marcaDepoisDeMexer(b, (antigo) => (antigo >= onde ? antigo + 1 : antigo)),
            };
          }
          return b;
        }),
      };
    });
  }

  /** Mover VÁRIAS de uma vez — a selecção múltipla, sem passar pela biblioteca. */
  function moverSeleccaoParaBoard(paraBoard: number) {
    const escolhidas = [...seleccionadas]
      .map((k) => {
        const [b, i] = k.split(":").map(Number);
        return { bi: b, ii: i };
      })
      .filter((s) => s.bi !== paraBoard);
    if (escolhidas.length === 0) {
      setSeleccionadas(new Set());
      return;
    }
    setLimpo({ doc, total: totalInput, segundos: 10, motivo: "Fotografias movidas." });
    setDoc((d) => {
      // Os caminhos são lidos ANTES de mexer em nada: mover uma foto muda os
      // índices das outras, e uma lista de índices lida a meio do caminho
      // apanharia as fotos erradas.
      const caminhos = escolhidas
        .map(({ bi, ii }) => ({ bi, ii, path: d.moodBoards[bi]?.images[ii] }))
        .filter((c): c is { bi: number; ii: number; path: string } => typeof c.path === "string");
      const aTirar = new Map<number, Set<number>>();
      for (const c of caminhos) {
        if (!aTirar.has(c.bi)) aTirar.set(c.bi, new Set());
        aTirar.get(c.bi)!.add(c.ii);
      }
      return {
        ...d,
        moodBoards: d.moodBoards.map((b, i) => {
          const tirar = aTirar.get(i);
          const semAsQueSaem = tirar
            ? {
                ...b,
                images: b.images.filter((_, j) => !tirar.has(j)),
                principal: marcaDepoisDeMexer(b, (antigo) =>
                  tirar.has(antigo) ? null : antigo - [...tirar].filter((j) => j < antigo).length,
                ),
              }
            : b;
          if (i !== paraBoard) return semAsQueSaem;
          return {
            ...semAsQueSaem,
            images: [...semAsQueSaem.images, ...caminhos.map((c) => c.path)],
          };
        }),
      };
    });
    setSeleccionadas(new Set());
    toast(
      escolhidas.length === 1
        ? "Fotografia movida. Podes anular durante 10 segundos."
        : `${escolhidas.length} fotografias movidas. Podes anular durante 10 segundos.`,
      "info",
    );
  }

  /**
   * Uma foto foi largada — dentro do board ou noutro.
   *
   * Um só sítio a decidir, e é aqui e não dentro do contexto de arrasto: o
   * `MoodBoardFotos.tsx` sabe de gestos e de identificadores, não sabe o que é
   * um documento de proposta.
   */
  function aoLargarFoto(largada: LargadaDeFoto) {
    if (largada.tipo === "reordenar") {
      reordenarFotos(largada.bi, largada.de, largada.para);
      return;
    }
    moverFotoDeBoard(largada.deBoard, largada.deIndice, largada.paraBoard, largada.paraIndice);
  }

  /** Um mood board largado noutra POSIÇÃO do ecrã — ver `moveBoard`. */
  function moverBoardParaPosicao(de: number, para: number) {
    setDoc((d) => {
      const arrumado = arrumadoEExplicito(d);
      const boards = [...arrumado.moodBoards];
      const [board] = boards.splice(de, 1);
      if (board === undefined) return d;
      boards.splice(para, 0, board);
      return { ...arrumado, moodBoards: boards };
    });
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * OS BOARDS FECHADOS — POR DISPOSITIVO, NÃO NO DOCUMENTO
   * ════════════════════════════════════════════════════════════════════════
   *
   * A mesma regra das secções do estúdio (ver `SECOES_KEY`): dobrar um board
   * terminado é uma preferência de quem está a trabalhar, não uma propriedade
   * da proposta. No documento, abrir a proposta noutro computador herdava as
   * dobras de outra pessoa — e uma alteração de disposição contava como
   * alteração por gravar.
   *
   * A chave é o ID do board e não a posição: arrastar um board para outro
   * sítio trocaria as dobras todas de lugar.
   */
  const [dobrados, setDobrados] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDobrados(lerDobrasDeBoards(quote.id));
  }, [quote.id]);

  function escreverDobras(proximas: Record<string, boolean>) {
    setDobrados(proximas);
    gravarDobrasDeBoards(quote.id, proximas);
  }

  /**
   * O salto para o campo, DEPOIS de ele estar desenhado.
   *
   * O controlo leva a chave num `data-campo`; quando o campo não tem controlo
   * próprio no editor — as linhas do quadro do orçamento são semeadas a partir
   * do pedido — cai-se na SECÇÃO, que é onde a resposta está. Não fazer nada
   * seria a pior das três hipóteses.
   *
   * `focus` depois do `scrollIntoView` e com `preventScroll`: o foco sozinho
   * salta a página de golpe e sem margem nenhuma; assim o campo fica ao centro
   * e a escrita começa onde ela está a olhar.
   */
  useEffect(() => {
    if (!campoAVisitar) return;
    const chave = chaveDoCampo(campoAVisitar.campo);
    const alvo =
      document.querySelector<HTMLElement>(`[data-campo="${chave}"]`) ??
      document.getElementById(seccaoDoCampo(campoAVisitar.campo));
    alvo?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) {
      alvo.focus({ preventScroll: true });
      alvo.select();
    }
  }, [campoAVisitar]);

  function alternarDobra(id: string) {
    escreverDobras({ ...dobrados, [id]: !dobrados[id] });
  }

  function dobrarTodos(fechar: boolean) {
    const proximas: Record<string, boolean> = {};
    for (const b of doc.moodBoards) if (b.id) proximas[b.id] = fechar;
    escreverDobras(proximas);
  }

  /**
   * ── IR AO CAMPO ONDE A PALAVRA ESTÁ ─────────────────────────────────────
   *
   * Do aviso de ortografia (que vive no passo do envio) até ao controlo (que
   * vive no do conteúdo, e pode estar dentro de um mood board fechado).
   *
   * Três coisas antes do salto, e só a última é o salto: voltar ao conteúdo,
   * abrir a dobra do board se for um campo de board — saltar para dentro de uma
   * dobra fechada deixava-a a olhar para um cartão que «não abriu» —, e só
   * então marcar o alvo, para o efeito o encontrar depois de desenhado.
   */
  function irParaCampo(campo: CampoDeTexto) {
    setStep("conteudo");
    if (
      campo.tipo === "boardTitulo" ||
      campo.tipo === "boardSubtitulo" ||
      campo.tipo === "boardNota"
    ) {
      const id = doc.moodBoards[campo.bi]?.id;
      if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
    }
    setCampoAVisitar((antes) => ({ campo, pedido: (antes?.pedido ?? 0) + 1 }));
  }

  /**
   * Duplicar um board inteiro — fotos, textos, disposição.
   *
   * As fotos são CAMINHOS, e o mesmo caminho pode estar em dois boards sem
   * custo nenhum: não há bytes a copiar e o gerador resolve cada um por si. É
   * o que torna «esta página outra vez, com duas fotos trocadas» num gesto.
   *
   * O id NÃO é copiado (`id: undefined`): dois boards com a mesma identidade
   * partilhariam a dobra e a chave de React. É preenchido a partir da posição
   * na gravação seguinte.
   */
  function duplicarBoard(bi: number) {
    setDoc((d) => {
      const original = d.moodBoards[bi];
      if (!original) return d;
      const copia = {
        ...original,
        id: undefined,
        title: original.title?.trim() ? `${original.title} (cópia)` : "",
        images: [...original.images],
      };
      const boards = [...d.moodBoards];
      boards.splice(bi + 1, 0, copia);
      return { ...d, moodBoards: boards };
    });
    toast("Mood board duplicado.", "info");
  }

  /** Fechar (ou reabrir) um board a alterações — ver `MoodBoard.bloqueado`. */
  function alternarBloqueio(bi: number) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        i === bi ? { ...b, bloqueado: b.bloqueado ? undefined : true } : b,
      ),
    }));
  }

  /** Escolher (ou desescolher) uma foto para o conjunto que se move de uma vez. */
  function alternarSeleccao(bi: number, ii: number) {
    setSeleccionadas((antes) => {
      const proxima = new Set(antes);
      const chave = `${bi}:${ii}`;
      if (proxima.has(chave)) proxima.delete(chave);
      else proxima.add(chave);
      return proxima;
    });
  }

  /** A foto que manda na página — ver `proposal-moodboard.ts`. */
  function marcarPrincipal(bi: number, ii: number) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        // Voltar a carregar na que já é principal DESMARCA: sem isso, marcar
        // seria uma porta de sentido único e a única saída era marcar a
        // primeira à mão.
        i === bi ? { ...b, principal: b.principal === ii ? undefined : ii } : b,
      ),
    }));
  }

  // ── Cover images (two slots) ──
  // A capa tem DUAS posições fixas: a 0 imprime à esquerda do painel do
  // logótipo, a 1 à direita. Escrever na posição (em vez de compactar a lista)
  // é o que garante que a foto escolhida para a direita sai à direita.
  function setCoverAt(idx: number, path: string) {
    setDoc((d) => {
      const cover = normaliseCoverImages(d.coverImages);
      cover[idx] = path;
      return { ...d, coverImages: cover };
    });
  }
  function removeCoverAt(idx: number) {
    setCoverAt(idx, "");
  }

  // ── Cronograma (organizacao) ──
  function addPhase() {
    setDoc((d) => ({ ...d, cronograma: [...(d.cronograma ?? []), { title: "", items: [] }] }));
  }
  function updatePhase(pi: number, p: Partial<{ title: string; items: string[] }>) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) => (i === pi ? { ...ph, ...p } : ph)),
    }));
  }
  function removePhase(pi: number) {
    setDoc((d) => ({ ...d, cronograma: (d.cronograma ?? []).filter((_, i) => i !== pi) }));
  }
  function movePhase(pi: number, dir: -1 | 1) {
    setDoc((d) => ({ ...d, cronograma: move(d.cronograma ?? [], pi, dir) }));
  }
  function addPhaseItem(pi: number) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) =>
        i === pi ? { ...ph, items: [...ph.items, ""] } : ph,
      ),
    }));
  }
  function updatePhaseItem(pi: number, ii: number, value: string) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) =>
        i === pi ? { ...ph, items: ph.items.map((it, j) => (j === ii ? value : it)) } : ph,
      ),
    }));
  }
  function removePhaseItem(pi: number, ii: number) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) =>
        i === pi ? { ...ph, items: ph.items.filter((_, j) => j !== ii) } : ph,
      ),
    }));
  }

  // ── Budget: decoracao (grouped) ──
  // Tudo passa pelos ajudantes de `proposal-budget`: os nomes e os preços são
  // dois arrays paralelos, e mexer num sem mexer no outro faz os preços
  // deslizarem uma posição — o preço da cerimónia acabaria no ramo da noiva,
  // sem nada a assinalar.
  function addBudgetItem() {
    setDoc((d) => adicionarLinha(d));
  }
  function updateBudgetItem(i: number, value: string) {
    setDoc((d) => definirItem(d, i, value));
  }
  function removeBudgetItem(i: number) {
    setDoc((d) => removerLinha(d, i));
  }
  function updateBudgetPrice(i: number, texto: string) {
    setDoc((d) => definirPreco(d, i, normalizarValor(texto)));
  }
  /**
   * Marca (ou desmarca) uma linha como EXTRA.
   *
   * É isto que faz a mesma proposta ter uma versão base e uma versão com
   * extras: o casal pede "uma coisa mais simples e outra com tudo", e a
   * alternativa era duas propostas — dois documentos a divergir, e ao fim de
   * duas semanas ninguém saber qual é a que vale.
   */
  function updateBudgetExtraFlag(i: number, extra: boolean) {
    setDoc((d) => marcarExtra(d as ProposalDoc, i, extra) as StudioDoc);
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * MEXER NUM VALOR ADICIONAL MEXE NO TOTAL
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «colocámos a deslocação da equipa Líquen, que são mil
   * quinhentos e cinquenta euros, e depois no total, naquela aba onde diz total
   * IVA e validade, isto não soma. Eu quero que o back office tenha
   * inteligência suficiente para ver os valores que nós colocamos em cada aba e
   * faça a soma com o valor total.»
   *
   * O problema era maior do que o ecrã. Este total é também o PREÇO FINAL do
   * pedido, e é dele que saem a factura, o sinal de 30% e o saldo: uma
   * deslocação de 1.550 € escrita aqui aparecia na proposta que o cliente lê e
   * não entrava em nada do que se cobra. O sinal era pedido a menos e a factura
   * era emitida a menos.
   *
   * ── PORQUE É QUE SE SOMA A DIFERENÇA, E NÃO O TOTAL DOS EXTRAS ───────────
   *
   * Aplica-se ao total o que MUDOU (o depois menos o antes), e nunca o valor
   * inteiro. É isso que torna a conta imune a ser feita duas vezes: escrever
   * «1550» são quatro teclas, e quatro somas do valor inteiro dariam um total
   * absurdo. Assim, cada tecla soma o que acrescentou e o resultado final é
   * exactamente a diferença entre o que lá estava e o que ficou.
   *
   * Também é o que respeita um total escrito à mão: quem apagar um extra vê o
   * total descer o mesmo que ele subiu, e mais nada é tocado.
   */
  function definirExtras(novos: { label: string; valueText: string }[]) {
    /**
     * ── O IVA QUE A LINHA DECLARA CONTA ─────────────────────────────────────
     *
     * Este campo é a base (o rótulo diz «Preço final (sem IVA)»), por isso o que
     * se lhe soma tem de ser base. A soma pegava no número e somava-o tal e
     * qual: «895,00 € + IVA» e «895,00 €» acabavam exactamente no mesmo sítio.
     *
     * Só a primeira estava certa. Numa proposta que se lê COM IVA, a segunda
     * promete ao casal que aquela linha custa 895 — e fazia o total subir 895 de
     * BASE, que são 1.101 do que eles vão pagar. A linha e o total a dizerem
     * números diferentes sobre a mesma coisa, no mesmo documento.
     *
     * `somaDosExtrasSemIva` lê o que cada linha declara e, quando ela não
     * declara nada, segue o modo do documento — que é a leitura que o casal faz,
     * porque é a que está impressa ao lado do total.
     */
    const contexto = { mode: vatMode, vatRate: doc.vatRate };
    const delta =
      Math.round(
        (somaDosExtrasSemIva(novos, contexto) -
          somaDosExtrasSemIva(doc.budgetExtras ?? [], contexto)) *
          100,
      ) / 100;
    setDoc((d) => ({ ...d, budgetExtras: novos }));
    if (delta === 0) return;
    // Um total não pode ficar negativo por causa de um extra apagado.
    const base = Math.max(0, Math.round((parseMoneyText(totalInput) + delta) * 100) / 100);
    setTotalInput(base > 0 ? textoDoTotal(base) : "");
    writeTotal(base > 0 ? amountParaBase(base, vatMode) : undefined, vatMode);
    persistirPreco(base > 0 ? base : undefined);
  }

  // ── Budget extras: linhas adicionais (Deslocação, Coordenação, Tecidos…) ──
  function addBudgetExtra() {
    // Uma linha nova nasce vazia: não há valor nenhum para somar ainda.
    definirExtras([...(doc.budgetExtras ?? []), { label: "", valueText: "" }]);
  }
  function updateBudgetExtra(i: number, p: Partial<{ label: string; valueText: string }>) {
    definirExtras((doc.budgetExtras ?? []).map((r, j) => (j === i ? { ...r, ...p } : r)));
  }
  /**
   * O valor escrito no campo numérico, já normalizado e com o IVA da linha.
   *
   * «1.500», «1500» e «1 500 €» dão os três 1500 — é o que a missão pede e é o
   * que `normalizarValor` já sabia fazer para os preços das linhas. O que se
   * GRAVA continua a ser texto, porque é ele que o PDF imprime; ver
   * `textoDoAdicional`.
   */
  function definirValorDoAdicional(i: number, escrito: string) {
    const linha = (doc.budgetExtras ?? [])[i];
    if (!linha) return;
    const modo = modoDoAdicional(linha.valueText ?? "", doc.vatRate ?? DEFAULT_VAT_RATE);
    updateBudgetExtra(i, { valueText: textoDoAdicional(escrito, modo) });
  }
  /** Troca o IVA que a linha declara, mantendo o número que lá está. */
  function definirIvaDoAdicional(i: number, modo: ModoDeIvaDoAdicional) {
    const linha = (doc.budgetExtras ?? [])[i];
    if (!linha) return;
    updateBudgetExtra(i, { valueText: textoDoAdicional(linha.valueText ?? "", modo) });
  }
  /**
   * Apagar um valor adicional TIRA-O do total — e portanto do sinal e da
   * fatura. Uma deslocação de 1.550 € desaparecia do preço final com um clique
   * num «×» de doze pixéis, sem pergunta e sem volta atrás; é exactamente o
   * mesmo estrago do «Usar X €» e leva o mesmo tratamento.
   *
   * Uma linha sem valor legível (a que se acabou de acrescentar, ou uma que
   * diga «a definir») sai sem perguntar: não mexe em dinheiro nenhum, e
   * perguntar aí seria ensinar a responder que sim sem ler.
   */
  function removeBudgetExtra(i: number) {
    const linha = (doc.budgetExtras ?? [])[i];
    const contexto = { mode: vatMode, vatRate: doc.vatRate };
    const vale = linha ? somaDosExtrasSemIva([linha], contexto) : 0;
    const apagar = () => definirExtras((doc.budgetExtras ?? []).filter((_, j) => j !== i));
    if (!linha || vale === 0) {
      apagar();
      return;
    }
    const base = parseMoneyText(totalInput);
    const nome = linha.label?.trim() || "esta linha";
    pedirConfirmacaoDeDinheiro({
      oQue: "o total",
      de: base,
      para: Math.max(0, Math.round((base - vale) * 100) / 100),
      registo: `«${nome}» removida dos valores adicionais no estúdio: preço final de ${eur(base)} para ${eur(Math.max(0, base - vale))}.`,
      motivo: `«${nome}» removida dos valores adicionais.`,
      aplicar: apagar,
    });
  }

  // ── Budget: organizacao (per-item rows) ──
  function addBudgetRow() {
    setDoc((d) => ({ ...d, budgetRows: [...(d.budgetRows ?? []), { item: "", price: "" }] }));
  }
  function updateBudgetRow(i: number, p: Partial<{ item: string; price: string }>) {
    setDoc((d) => ({
      ...d,
      budgetRows: (d.budgetRows ?? []).map((r, j) => (j === i ? { ...r, ...p } : r)),
    }));
  }
  function removeBudgetRow(i: number) {
    setDoc((d) => ({ ...d, budgetRows: (d.budgetRows ?? []).filter((_, j) => j !== i) }));
  }

  // ── Actions ──
  //
  // ── FOTOS POR CONFIRMAR ──
  //
  // O documento que sai daqui NUNCA leva marcadores provisórios: o gerador não
  // os sabe ir buscar e o resultado seria uma foto a menos, em silêncio, no PDF
  // do cliente. `stripPendingImages` é a fronteira.
  //
  // Filtrar sozinho não chega — seria enviar com buracos e calar. Por isso:
  //
  //  · PRÉ-VISUALIZAR gera à mesma, sem elas, e DIZ-LO. É um PDF para ela ver,
  //    volta a gerar-se daqui a dez segundos, e travar aqui só a impedia de ir
  //    ver o resto da proposta enquanto as fotos assentam.
  //
  //  · ENVIAR ESPERA. É o gesto irreversível: o email sai uma vez e o noivo lê
  //    o que lhe chegou. A cópia demora segundos; um PDF sem a foto que ela
  //    escolheu dura para sempre. O botão fica desligado enquanto houver fotos
  //    a caminho, com a razão escrita ao lado, e volta sozinho quando assentam.
  async function preview() {
    if (busy) return;
    setBusy("preview");
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/proposta-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", doc: stripPendingImages(doc) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Não foi possível gerar a pré-visualização.");
      }
      const blob = await res.blob();
      // Descarregar o PDF (anexo) em vez de abrir numa aba nova: a CSP do site
      // (object-src 'none', sem frame-src) bloqueia mostrar um blob:PDF numa aba
      // ou iframe, o que fazia "não acontecer nada". Um download nunca é
      // bloqueado e abre no leitor de PDF do dispositivo.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposta-${quote.name || quote.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      // O gerador SALTA a foto que não consegue ir buscar E CORTA o que não
      // cabe no desenho, por isso um PDF incompleto sai na mesma, com ar de
      // estar bem. Sem este aviso, a primeira pessoa a dar pela falta era o
      // cliente. O servidor conta as duas coisas e devolve-as nos cabeçalhos.
      const emFalta = Number(res.headers.get("X-Fotos-Em-Falta") ?? "0");
      const cortes = cortesDoCabecalho(res.headers.get("X-Conteudo-Cortado"));
      const aviso = avisoDeConteudoIncompleto(emFalta, cortes);
      if (aviso) {
        toast(`PDF gerado, mas ${aviso}. Verifica antes de enviar.`, "error");
      } else if (fotosPorConfirmar > 0) {
        toast(
          fotosPorConfirmar === 1
            ? "PDF gerado sem 1 foto que ainda está a entrar na proposta. Gera outra vez daqui a pouco."
            : `PDF gerado sem ${fotosPorConfirmar} fotos que ainda estão a entrar na proposta. Gera outra vez daqui a pouco.`,
          "info",
        );
      } else {
        toast("Pré-visualização gerada (PDF descarregado)", "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro na pré-visualização.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (busy) return;
    // A trava do envio é o `canSend` (o botão nem chega a estar ligado), mas
    // repete-se aqui: entre carregar em "Enviar" e carregar em "Confirmar" pode
    // ter entrado outro lote de fotos, e o segundo clique não pode ser o que
    // manda a proposta sem elas.
    if (fotosPorConfirmar > 0) {
      toast(
        fotosPorConfirmar === 1
          ? "Ainda há 1 foto a entrar na proposta. Assim que assentar, o envio fica disponível."
          : `Ainda há ${fotosPorConfirmar} fotos a entrar na proposta. Assim que assentarem, o envio fica disponível.`,
        "info",
      );
      setConfirmSend(false);
      return;
    }
    setBusy("send");
    setConfirmSend(false);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/proposta-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // As ORIGENS das fotos entram no documento no envio, e só no envio:
        // é a partir daqui que a proposta seguinte pode saber que esta já usou
        // aquele arco. Enquanto é rascunho, o mapa vive ao lado (SIDE_KEY) e
        // não tem de viajar.
        body: JSON.stringify({
          mode: "send",
          doc: { ...stripPendingImages(doc), fotosDeBiblioteca: origensNoDocumento() },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || porqueFalhouOEnvio(res.status));
      // A proposta ficou guardada em qualquer caso; a mensagem distingue enviada
      // por email vs guardada-mas-sem-email, para a equipa saber o que fazer.
      // O DOCUMENTO INCOMPLETO É O AVISO MAIS IMPORTANTE DOS TRÊS, por isso é o
      // que fica no ecrã. Uma proposta que seguiu para o noivo com fotos a
      // menos é o problema que originou esta contagem; saber que o email saiu
      // é secundário quando o documento que ele leva está incompleto.
      const emFalta = Number(data?.missingImages ?? 0);
      const aviso = avisoDeConteudoIncompleto(emFalta, normalizaCortes(data?.truncations));
      /**
       * ══════════════════════════════════════════════════════════════════════
       * «ENVIADA» SÓ QUANDO FOI MESMO ENVIADA
       * ══════════════════════════════════════════════════════════════════════
       *
       * Um pedido sem email de cliente válido devolvia 200 com `emailed:false`
       * — e o ecrã mostrava um aviso cinzento, marcava o passo como «Proposta
       * enviada ✓» e seguia. Ela ficava convencida de que tinha ido; o casal
       * não recebia nada. É, ao pé da letra, «não dá para mandar a proposta
       * para o cliente» — e da pior maneira, porque nem sequer parecia falhar.
       *
       * O email não ter saído é um ERRO, não uma informação. E o passo só é
       * dado por feito quando o email saiu: a proposta fica gravada na mesma
       * (isso não se perde), mas o botão continua lá para ela poder corrigir o
       * contacto e enviar a sério.
       */
      const saiu = Boolean(data?.emailed);
      if (aviso) {
        toast(`No PDF que seguiu, ${aviso}. Verifica a proposta e reenvia.`, "error");
      } else if (saiu) {
        toast("Proposta enviada ao cliente", "success");
      } else {
        toast(
          data?.emailError ||
            "A proposta foi gravada mas o EMAIL NÃO SAIU — o cliente não recebeu nada.",
          "error",
        );
      }
      // Trava contra reenvio acidental: o passo Enviar passa a mostrar a
      // confirmação "Proposta enviada ✓" em vez do botão pronto a disparar.
      // Só quando há mesmo o que confirmar.
      if (saiu) {
        setSent(true);
        onSent?.();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao enviar a proposta.", "error");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Há destinatário para esta proposta?
   *
   * A MESMA regra do servidor (ver a rota do envio): um endereço com arroba e
   * um ponto no domínio. Não é uma validação a sério — é a que distingue «não
   * há email nenhum» de «há». Se as duas discordassem, o ecrã dizia que ia
   * seguir e o servidor não o mandava.
   */
  const emailDoCliente = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(quote.email ?? "");

  // Sugestões e a validade por omissão. Uma leitura só, ao abrir; se falhar,
  // o estúdio funciona como antes — nenhuma destas coisas é indispensável.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch("/api/propostas?resumo=1").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/propostas/preferencias").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([lista, prefs]) => {
        if (!vivo) return;
        const unicos = (vals: unknown[]) =>
          [...new Set(vals.map((v) => String(v ?? "").trim()).filter(Boolean))].sort();
        if (Array.isArray(lista)) {
          setSugestoes({
            locais: unicos(lista.map((p: { location?: string }) => p.location)),
          });
        }
        // A validade só se aplica a um documento que ainda NÃO tem uma: mexer
        // numa proposta já escrita porque a política mudou seria alterar-lhe
        // as condições nas costas de quem a escreveu.
        const dias = Number(prefs?.validUntilDays);
        if (Number.isFinite(dias) && dias > 0) {
          setDoc((d) => (d.validUntilDays ? d : { ...d, validUntilDays: dias }));
        }
      })
      .catch(() => {
        /* sem sugestões e com a validade de sempre */
      });
    return () => {
      vivo = false;
    };
  }, []);

  /** O documento copiado passa a ser este, com os campos a confirmar marcados. */
  /**
   * Copiar uma proposta antiga para cima desta.
   *
   * Também mexe no preço final, e por isso também tem de ser reversível e
   * ficar no histórico. A PERGUNTA já existe e é melhor do que uma caixa: o
   * `CriarAPartirDe` mostra de quem é a proposta a copiar antes de a aplicar, e
   * os cinco campos que mudam de casamento para casamento ficam marcados a
   * laranja até ela lhes tocar (ver `porConfirmar`). Duas perguntas sobre o
   * mesmo gesto seriam uma a mais.
   */
  function aplicarCopia(e: Escolha) {
    const anterior = parseMoneyText(totalInput);
    const copiado = e.doc as StudioDoc;
    setLimpo({
      doc,
      total: totalInput,
      segundos: 10,
      motivo: `Proposta copiada de ${e.nomeDaOrigem}.`,
    });
    setDoc(copiado);
    // O campo do valor é estado à parte (aceita texto a meio de ser escrito),
    // por isso não acompanha o documento de graça: ficava a mostrar o número
    // ANTERIOR enquanto o documento copiado já tinha outro — ou nenhum. E,
    // como no repor, o valor GRAVA-SE no pedido: sem isto o estúdio dizia um
    // número e a Gestão do pedido, o Kanban e o dossier diziam outro.
    const base = baseDoDoc(copiado);
    const temValor = typeof base === "number" && base > 0;
    setTotalInput(temValor ? textoDoTotal(base!) : "");
    persistirPreco(temValor ? base : undefined);
    setPorConfirmar(new Set(e.camposAMudar));
    // O título interno volta a gerar-se sozinho: a cópia esvaziou-o de
    // propósito para não ficar com o nome do casal anterior no cabeçalho.
    setRefEdited(false);
    const partilha =
      e.fotosPartilhadas > 0
        ? ` ${e.fotosPartilhadas} foto(s) ficaram na pasta da proposta antiga.`
        : "";
    if (Math.abs((temValor ? base! : 0) - anterior) > 0.01) {
      registarNoHistorico(
        `Proposta copiada de ${e.nomeDaOrigem} no estúdio: preço final de ${eur(anterior)} para ${eur(temValor ? base! : 0)}.`,
      );
    }
    toast(
      `Copiado de ${e.nomeDaOrigem}. Confirma o que está marcado.${partilha}`,
      e.fotosPartilhadas > 0 ? "error" : "success",
    );
  }

  /**
   * O realce de um campo por confirmar, e a forma de o desmarcar.
   *
   * Laranja e não verde: é um AVISO de coisa por rever, não uma acção. O
   * `DESIGN-TOKENS.md` fixa esta regra para a página toda.
   */
  const realce = (campo: CampoAMudar) =>
    porConfirmar.has(campo)
      ? "rounded-lg ring-2 ring-[#c98a2e]/45 ring-offset-2 ring-offset-background"
      : undefined;
  const confirmado = (campo: CampoAMudar) => {
    // Tocar-lhe É a confirmação. Um botão "confirmar" ao lado de cada campo
    // seria mais um clique para dizer o que o gesto já disse.
    setPorConfirmar((atual) => {
      if (!atual.has(campo)) return atual;
      const proximo = new Set(atual);
      proximo.delete(campo);
      return proximo;
    });
  };

  /**
   * A validade desta proposta passa a ser a de todas as novas.
   *
   * A missão pede um valor por omissão «configurável», e a forma mais barata
   * de o configurar é a partir do sítio onde ela já está a decidir o número —
   * em vez de um ecrã de definições que é preciso ir procurar.
   */
  async function guardarValidadePadrao(dias: number) {
    try {
      const r = await fetch("/api/propostas/preferencias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validUntilDays: dias }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "Não deu para guardar.");
      toast(`As propostas novas passam a valer ${dias} dias.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu para guardar.", "error");
    }
  }

  /** Guarda ESTA proposta como modelo reutilizável, com o nome que ela der. */
  async function guardarComoModelo(nome: string) {
    const limpo = nome.trim();
    if (!limpo) return;
    try {
      const r = await fetch("/api/propostas/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O documento vai TAL COMO ESTÁ, com o nome e a data deste casal lá
        // dentro. Não faz mal: quem o usar passa pelo `copiarParaPedido`, que
        // é o mesmo caminho de qualquer proposta anterior e substitui tudo o
        // que é de outra pessoa. Limpar aqui seria uma segunda regra a poder
        // discordar da primeira.
        body: JSON.stringify({ nome: limpo, tipo: "completo", doc, origem: doc.clientNames }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "Não deu para guardar o modelo.");
      setNomeModelo(null);
      toast(`Modelo «${limpo}» guardado.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu para guardar o modelo.", "error");
    }
  }

  const isDeco = doc.template !== "organizacao";
  /** Fotos que ocupam já o seu lugar no documento mas ainda não têm caminho.
   *  Nome distinto do `porConfirmar` dos CAMPOS (acima): são coisas diferentes
   *  e partilhar o nome era o caminho para uma delas passar a mentir. */
  const fotosPorConfirmar = countPendingImages(doc);
  // O botão e o aviso lateral leem a MESMA lista, de propósito: escritos cada
  // um à sua maneira, mais cedo ou mais tarde discordavam — o aviso dizia que
  // faltava o valor e o botão deixava enviar na mesma. A regra (e a razão de
  // cada exigência) está em `proposal-progress.ts`.
  const seccoes = estadoDasSeccoes(doc as ProposalDoc);
  const faltas = oQueFaltaParaEnviar(doc as ProposalDoc, money.gross);
  // A regra das FOTOS POR CONFIRMAR fica aqui e não em `proposal-progress`:
  // esse olha para o DOCUMENTO, e isto é um estado desta aba — a cópia que
  // ainda vai a caminho só esta sessão a conhece. O email sai uma vez, e um
  // PDF sem a foto escolhida dura para sempre.
  const canSend = podeEnviar(doc as ProposalDoc, money.gross) && fotosPorConfirmar === 0;

  return (
    <div className="border-t border-foreground/10 pt-5">
      {/* EMPILHA no telemóvel, em vez de repartir a largura.
          O que estava aqui era um `flex` em linha com o texto de um lado e três
          botões do outro, marcados `shrink-0`. A 375 px os botões ficavam com
          ~330 px e o parágrafo com o que sobrava: encolhia até à largura da
          palavra mais comprida e passava a UMA PALAVRA POR LINHA — dois ecrãs
          de scroll para ler duas frases. O `min-w-0` do lado do texto, que
          existe para o truncar deixar de empurrar, aqui deixava-o chegar a zero.
          É o padrão a evitar em todo o back office: texto e barra de acções na
          mesma linha só a partir de `sm`. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="bo-eyebrow">Estúdio de propostas (PDF)</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/55">
            Monta aqui a proposta em PDF para o cliente. Preenche de cima para baixo; podes
            pré-visualizar antes de enviar.
          </p>
        </div>
        {/* `flex-wrap` e não `shrink-0`: com três botões a 375 px, um deles
            saía pela margem direita e ficava cortado ("Limpa…"). */}
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {/* A acção principal desta secção: quase todas as propostas são uma
              variação de uma anterior. É a única aqui a verde. */}
          <Button size="sm" onClick={() => setCopiarAberto(true)}>
            Criar a partir de…
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setNomeModelo(doc.eventType || "")}>
            Guardar como modelo
          </Button>
          {/* DESFAZER TEM DE SE PODER TOCAR.
              Isto existia só como `Cmd+Z`, e num telemóvel não há `Cmd+Z`:
              desfazer um engano era uma coisa que só se podia fazer sentada ao
              computador. Fica ao lado de "Limpar rascunho" de propósito — é o
              par dela, e é onde se vai procurar depois de estragar alguma
              coisa. Apagado quando não há para onde voltar, para não prometer
              o que não faz. */}
          <Button
            variant="ghost"
            size="sm"
            disabled={!podeDesfazer}
            onClick={() => {
              if (desfazer()) toast("Desfeito.", "info");
            }}
          >
            Desfazer
          </Button>
          <Button variant="ghost" size="sm" onClick={clearDraft}>
            Limpar rascunho
          </Button>
        </div>
      </div>

      {limpo && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#c98a2e]/35 bg-[#c98a2e]/[0.06] px-3 py-2">
          <span className="text-xs text-foreground/70">
            {limpo.motivo} Pode anular durante {limpo.segundos}s.
          </span>
          <button
            type="button"
            className="alvo-toque text-xs font-medium text-[#4d6350] underline-offset-2 hover:underline"
            onClick={anularLimpeza}
          >
            Anular
          </button>
        </div>
      )}

      {/* ── A PERGUNTA COM OS DOIS NÚMEROS À VISTA ─────────────────────────
          Fica no topo do estúdio e não ao lado do botão que a levantou: as
          acções que mexem no dinheiro estão espalhadas por três secções (o
          «Usar X €», a deslocação do painel interno, o «×» de um valor
          adicional) e uma pergunta que aparece cada vez noutro sítio é uma
          pergunta que se responde sem procurar o que ela diz. Aqui é sempre
          o mesmo sítio, e é o primeiro que se vê.

          `assertive` porque interrompe mesmo: é uma pergunta, e ficar à espera
          de resposta sem ser anunciada seria deixar quem usa leitor de ecrã a
          carregar num botão que não fez nada. */}
      {confirmacaoDeDinheiro && confirmacaoDeDinheiro.docNoMomento === doc && (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-label="Confirmar alteração ao valor"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#c98a2e]/45 bg-[#c98a2e]/[0.08] px-3 py-2.5"
        >
          <span className="min-w-[12rem] flex-1 text-xs leading-relaxed text-foreground/80">
            {confirmacaoDeDinheiro.pergunta}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setConfirmacaoDeDinheiro(null)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={confirmarDinheiro}>
            Substituir
          </Button>
        </div>
      )}

      {nomeModelo !== null && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
          <label className="flex-1 min-w-[14rem]">
            <span className="bo-eyebrow">Nome do modelo</span>
            <input
              autoFocus
              value={nomeModelo}
              onChange={(e) => setNomeModelo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void guardarComoModelo(nomeModelo);
                if (e.key === "Escape") setNomeModelo(null);
              }}
              placeholder="Casamento standard"
              className="bo-input mt-1 w-full px-3 py-2 text-sm"
            />
          </label>
          <Button
            size="sm"
            disabled={!nomeModelo.trim()}
            onClick={() => void guardarComoModelo(nomeModelo)}
          >
            Guardar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setNomeModelo(null)}>
            Cancelar
          </Button>
        </div>
      )}

      <CriarAPartirDe
        open={copiarAberto}
        onClose={() => setCopiarAberto(false)}
        quoteId={quote.id}
        clienteAtual={quote.name ?? ""}
        onEscolhido={aplicarCopia}
        toast={toast}
      />

      {/* Passos do fluxo — sempre visível, dá o sentido de "onde estou / o que
          fazer a seguir". Clicável para saltar entre passos. */}
      <StepNav step={step} onSelect={setStep} sent={sent} />

      {/* ══════════ PASSO 1 · Conteúdo ══════════ */}
      {/* ── A FOLGA POR BAIXO É A ALTURA MEDIDA DA BARRA, NÃO UM NÚMERO ─────
          Era `pb-20` — 80 px escritos à mão. A barra do fundo é `sticky` e
          desenha-se POR CIMA do conteúdo; sem folga suficiente, o que fica por
          baixo dela não se lê nem se toca. E ela NÃO tem 80 px: cresce com o
          que lhe está dentro (o total embrulha, o botão de tentar outra vez
          aparece) e cresce outra vez no telemóvel, onde a barra de navegação do
          back office lhe soma mais 56 px por baixo. Medido na captura desta
          missão: 66 px de barra num ecrã largo, mais os 56 da navegação — 122,
          contra os 80 reservados. A linha do Sinal ficava debaixo dela.

          Agora a folga sai de `getBoundingClientRect` da própria barra, mais o
          que a separa do fundo do ecrã, e volta a ser medida sempre que a barra
          muda de tamanho (`ResizeObserver`). Um número que se mede não pode
          ficar desactualizado por alguém acrescentar um botão. */}
      <div
        hidden={step !== "conteudo"}
        className="flex gap-6"
        style={{ paddingBottom: folgaDaBarra }}
      >
        <NavEstudio seccoes={seccoes} faltas={faltas} onSeccaoActual={anotarSeccao} />
        <div className="min-w-0 flex-1">
          {/* Template selector */}
          <div className="mb-4">
            <Segmented
              ariaLabel="Modelo da proposta"
              value={isDeco ? "decoracao" : "organizacao"}
              onChange={setTemplate}
              options={[
                { value: "decoracao", label: "Decoração" },
                { value: "organizacao", label: "Organização" },
              ]}
            />
          </div>

          {/* Event fields */}
          <Section title="Evento" id="evento">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Clientes"
                value={doc.clientNames}
                onChange={(e) => {
                  confirmado("clientNames");
                  patch({ clientNames: e.target.value });
                }}
                containerClassName={realce("clientNames")}
                placeholder="Maria & Zé"
              />
              <Field
                label="Tipo de evento"
                value={doc.eventType}
                onChange={(e) => patch({ eventType: e.target.value })}
                data-campo="eventType"
                placeholder="Casamento"
              />
              <Field
                label="Data"
                value={doc.eventDate}
                onChange={(e) => {
                  confirmado("eventDate");
                  patch({ eventDate: e.target.value });
                }}
                containerClassName={realce("eventDate")}
                placeholder="12 de setembro de 2026"
              />
              <Field
                label="Local"
                list="sug-locais"
                value={doc.location}
                onChange={(e) => {
                  confirmado("location");
                  patch({ location: e.target.value });
                }}
                containerClassName={realce("location")}
                placeholder="Monte da Oliveirinha"
              />
              <Field
                label="Convidados"
                value={doc.guests}
                onChange={(e) => {
                  confirmado("guests");
                  patch({ guests: e.target.value });
                }}
                containerClassName={realce("guests")}
                placeholder="150 pax"
              />
              {isDeco && (
                <>
                  <Field
                    label="Cerimónia"
                    value={doc.ceremony ?? ""}
                    onChange={(e) => patch({ ceremony: e.target.value })}
                    placeholder="Civil, simbólica"
                  />
                  <Field
                    label="Hora"
                    value={doc.time ?? ""}
                    onChange={(e) => patch({ time: e.target.value })}
                    placeholder="A definir"
                  />
                </>
              )}
            </div>

            {/* As sugestões. `datalist` e não um `select`: ela TEM de poder
                escrever um espaço novo — a lista ajuda, não fecha a porta. */}
            <datalist id="sug-locais">
              {sugestoes.locais.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>

            {/* Reference (advanced) */}
            <div className="mt-4">
              {refEdited && (
                <div className="mb-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setRefEdited(false);
                      setDoc((d) => ({ ...d, ref: buildRef(d) }));
                    }}
                    className={ADD_BTN}
                  >
                    ↺ Automática
                  </button>
                </div>
              )}
              <Field
                label="Título interno (opcional)"
                value={doc.ref}
                onChange={(e) => {
                  setRefEdited(true);
                  patch({ ref: e.target.value });
                }}
                data-campo="ref"
                hint="sobretudo para uso interno; aparece apenas em letra pequena no topo de cada página da proposta."
              />
            </div>
          </Section>

          {/* Cover images */}
          <Section title="Imagens de capa (2)" id="capas">
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((idx) => {
                const path = doc.coverImages?.[idx];
                /**
                 * ── O ÚNICO SÍTIO ONDE O RECORTE NÃO SE PODE EVITAR ─────────
                 *
                 * As tiras da capa correm de topo a fundo da página e têm
                 * aspecto 0,467:1 — quase 1:2. Nenhuma fotografia normal tem
                 * essa forma, e dar-lhe a forma da foto deixaria uma barra de
                 * fundo entre ela e a aresta da folha, que é pior.
                 *
                 * O que se pode fazer é DIZER o número antes: uma fotografia ao
                 * alto perde ali ~30%, uma deitada ~69%. Com o número à frente,
                 * escolher uma vertical para a capa deixa de ser sorte — e ela
                 * deixa de descobrir o corte com o PDF já feito.
                 */
                const perdaDaCapa = path
                  ? perdaNaCapa(aspetosDasFotos[path] ?? ASPETO_POR_OMISSAO)
                  : 0;
                return (
                  <div key={idx}>
                    {path ? (
                      <>
                        <Thumb
                          url={assetUrls[path]}
                          planoB={assetOriginais[path]}
                          onRemove={() => removeCoverAt(idx)}
                          // A forma REAL da tira de capa, e não um 4:3 que o
                          // documento nunca desenha. Ver `aspeto` em `Thumb`.
                          aspeto={aspetoDaCapa()}
                          // Medir aqui é o que dá o número do aviso de baixo —
                          // a mesma medida que os mood boards já faziam, na
                          // célula que já está no ecrã e sem pedir nada ao
                          // servidor.
                          onMedida={(a) => registarAspeto(path, a)}
                          pendente={isPendingImage(path)}
                          onde={idx === 0 ? "capa-esquerda" : "capa-direita"}
                          refDoc={path}
                        />
                        {perdaDaCapa > PERDA_QUE_SE_AVISA && (
                          <p className="mt-1.5 text-xs leading-relaxed text-[#8a2a22]">
                            A tira da capa é muito mais alta do que larga: esta fotografia perde{" "}
                            {Math.round(perdaDaCapa * 100)}% da área. Uma fotografia ao alto perde
                            menos.
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <UploadArea
                          // O lado é fixo: a posição 0 imprime à esquerda do
                          // painel do logótipo, a 1 à direita.
                          label={idx === 0 ? "Capa esquerda" : "Capa direita"}
                          busy={!!uploading[`cover-${idx}`]}
                          multiple={false}
                          curto
                          onFiles={(files) =>
                            handleUpload(`cover-${idx}`, files.slice(0, 1), (paths) =>
                              setCoverAt(idx, paths[0]),
                            )
                          }
                        />
                        <button
                          type="button"
                          className={`${ADD_BTN} mt-1.5`}
                          onClick={() => setPicker({ kind: "cover", idx })}
                          // Ao passar o rato já se vai buscar o que o diálogo
                          // precisa. Quando ela carrega, está lá. `focus` para
                          // quem navega por teclado, e `touchstart` para o
                          // telemóvel, onde não há hover nenhum — é o instante
                          // entre pousar o dedo e o levantar.
                          onPointerEnter={aquecerBiblioteca}
                          onFocus={aquecerBiblioteca}
                          onTouchStart={aquecerBiblioteca}
                        >
                          Da biblioteca de temas
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Service groups */}
          <Section title="Serviços" id="servicos">
            {/* O editor com teclado, arrasto e anular vive em ServicesEditor. */}
            <ServicesEditor
              groups={doc.serviceGroups}
              onGroupsChange={setServiceGroups}
              showDesc={!isDeco}
              // O Ctrl/Cmd+Enter dos Serviços é o MESMO gesto do botão
              // «Guardar agora» — e por isso a mesma função, não uma segunda
              // gravação com outras regras e outras palavras.
              onSave={guardarAgora}
            />
          </Section>

          {/* Mood boards — decoracao only */}
          {isDeco && (
            <Section title="Mood boards" id="moodboards" nota={contagemDosBoards}>
              <p className="-mt-2 mb-4 text-sm leading-relaxed text-foreground/55">
                grupos de imagens de inspiração para o cliente
              </p>
              <AvisoDeOrdem
                mostrar={ordemSugerida}
                onde="As páginas de inspiração"
                onFixar={() =>
                  fixarOrdem("Ordem fixada. Daqui para a frente manda a ordem que aqui está.")
                }
              />
              <BarraDaSeleccao
                quantas={seleccionadas.size}
                boards={doc.moodBoards}
                onMover={moverSeleccaoParaBoard}
                onLimpar={() => setSeleccionadas(new Set())}
              />
              {/* ── O ÍNDICE ─────────────────────────────────────────────
                  Em ecrã largo é uma coluna fixa ao lado; em telemóvel, uma
                  tira que se percorre por cima da lista — a 390 px, uma coluna
                  lateral roubava metade da grelha das fotos. */}
              <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-5">
                {/* ── AS PÁGINAS LADO A LADO ────────────────────────────────
                  A pergunta que o editor não deixa fazer — «isto parece tudo
                  do mesmo casamento?» — só se responde com as folhas todas à
                  mesma distância dos olhos. */}
                {vistaDeConjunto && (
                  <VistaDeConjunto
                    boards={doc.moodBoards}
                    ordem={ordemDosBoards}
                    urls={assetUrls}
                    originais={assetOriginais}
                    aspetos={aspetosDasFotos}
                    onMover={(de, para) => moverBoardParaPosicao(de, para)}
                    onSaltar={(bi) => {
                      const id = doc.moodBoards[bi]?.id;
                      if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
                      document
                        .getElementById(`mood-board-${bi}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    onFechar={() => setVistaDeConjunto(false)}
                  />
                )}
                <MoodBoardIndice
                  boards={doc.moodBoards}
                  ordem={ordemDosBoards}
                  bloqueados={doc.moodBoards.map((b) => !!b.bloqueado)}
                  onSaltar={(bi) => {
                    // Abrir a dobra ANTES de saltar: saltar para um board
                    // fechado deixava-a a olhar para uma linha de miniaturas
                    // sem perceber porque é que o board «não abriu».
                    const id = doc.moodBoards[bi]?.id;
                    if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
                    document
                      .getElementById(`mood-board-${bi}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                />
                <div className="min-w-0">
                  <ArrastoDosMoodBoards
                    ordemDosBoards={ordemDosBoards}
                    aArrastar={aArrastar}
                    onArrastoComeca={setAArrastar}
                    fantasma={<FantasmaDaFoto id={aArrastar} doc={doc} urls={assetUrls} />}
                    onLargarBoard={(de, para) => moverBoardParaPosicao(de, para)}
                    onLargarFoto={aoLargarFoto}
                  >
                    <ListaDeBoards ordem={ordemDosBoards} className="flex flex-col gap-3">
                      {/* Pela ordem que as páginas vão sair — ver `ordemDosBoards`. */}
                      {ordemDosBoards.map((bi, pos) => {
                        const b = doc.moodBoards[bi];
                        /**
                         * A FORMA DE CADA FOTO, E DAÍ AS CAIXAS DESTA PÁGINA.
                         *
                         * As medidas vêm das miniaturas que já estão no ecrã (ver
                         * `aspetosDasFotos`); o que ainda não se mediu entra com a
                         * omissão, que é a mesma do gerador. Daqui saem as duas
                         * coisas que têm de concordar: os diagramas do selector e a
                         * forma de cada célula da grelha. Antes a célula usava o
                         * arranjo único e antigo, e mostrava um recorte que a página
                         * já não fazia — a mesma fotografia, cortada noutro sítio.
                         */
                        /**
                         * A ORDEM POR QUE A PÁGINA DESENHA — a mesma função do
                         * gerador (`ordemDasFotos`). Com uma foto marcada como
                         * principal, ela troca para a caixa grande.
                         *
                         * Vem ANTES dos aspectos porque são os aspectos POR ESTA
                         * ORDEM que dão as caixas: medir numa ordem e desenhar
                         * noutra daria à foto marcada a forma da caixa da vizinha.
                         */
                        const ordemDeDesenho = ordemDasFotos(b);
                        const aspectos = ordemDeDesenho
                          .slice(0, MOOD_BOARD_MAX_IMAGES)
                          .map((i) => aspetosDasFotos[b.images[i]] ?? ASPETO_POR_OMISSAO);
                        /**
                         * A escolha desta página: as caixas tomam a FORMA das
                         * fotografias em vez de as recortarem. Viaja daqui para as
                         * três coisas que têm de concordar — a forma de cada célula
                         * da grelha, os diagramas do selector, e a página do PDF.
                         * Se uma delas ficasse para trás, ela escolhia por um
                         * desenho e recebia outro.
                         */
                        const semRecorte = b.enquadramento === "forma-da-foto";
                        const layoutDoBoard = b.layout ?? layoutSugerido(aspectos.length);
                        const caixas = caixasDoMoodboard(
                          layoutDoBoard,
                          aspectos,
                          undefined,
                          semRecorte,
                        );
                        const comDestaque = temLugarDeDestaque(layoutDoBoard);
                        /** Esta página está fechada a alterações? */
                        const fechado = !!b.bloqueado;
                        /** E dobrada, que é só uma questão de espaço no ecrã? */
                        const dobrado = !!(b.id && dobrados[b.id]);
                        /**
                         * Quanto é que cada fotografia perde, uma a uma.
                         *
                         * Por fotografia e não por disposição: na mesma página, uma
                         * panorâmica perde 5% e uma vertical 69%. Um aviso por página
                         * obrigava-a a adivinhar qual é que era o problema — e a
                         * resposta a «qual delas?» é a única coisa que torna o aviso
                         * accionável (trocar aquela foto, ou ligar o interruptor).
                         */
                        const cortadas = semRecorte
                          ? []
                          : perdasDoMoodboard(layoutDoBoard, aspectos)
                              .map((perda, i) => ({ perda, i }))
                              .filter(({ perda }) => perda > PERDA_QUE_SE_AVISA);
                        return (
                          <CartaoDeBoard
                            key={bi}
                            bi={bi}
                            // O `id` é o alvo do índice lateral. Pelo ÍNDICE REAL:
                            // a ordem desenhada pode mudar debaixo do salto.
                            ancora={`mood-board-${bi}`}
                            className={`rounded-2xl border p-4 ${
                              fechado
                                ? "border-[#4d6350]/35 bg-[#4d6350]/[0.04]"
                                : "border-foreground/[0.08] bg-foreground/[0.015]"
                            }`}
                          >
                            {(pega) => (
                              <>
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  {/* A PEGA DO CARTÃO. Alvo próprio, sempre visível ao
                            toque: com oito boards, levar o último ao topo eram
                            sete cliques nas setas. */}
                                  <button
                                    type="button"
                                    {...pega}
                                    aria-label={`Arrastar o mood board ${pos + 1}`}
                                    className="alvo-toque flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-foreground/35 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/70 active:cursor-grabbing"
                                  >
                                    <span aria-hidden="true">⠿</span>
                                  </button>
                                  {/* ── A DOBRA ──────────────────────────────────
                                  Um board terminado ocupa um ecrã inteiro de
                                  altura. Fechado fica com o que basta para o
                                  reconhecer: título, subtítulo, quantas fotos
                                  tem e uma tira de miniaturas. */}
                                  <button
                                    type="button"
                                    onClick={() => b.id && alternarDobra(b.id)}
                                    aria-expanded={!dobrado}
                                    aria-label={
                                      dobrado
                                        ? `Abrir o mood board ${pos + 1}`
                                        : `Fechar o mood board ${pos + 1}`
                                    }
                                    className="alvo-toque flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-foreground/40 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/70"
                                  >
                                    <span aria-hidden="true">{dobrado ? "▸" : "▾"}</span>
                                  </button>
                                  <input
                                    className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-foreground/75"
                                    value={b.title}
                                    onChange={(e) => updateBoard(bi, { title: e.target.value })}
                                    // A pega do aviso de ortografia: é por ela
                                    // que o «Ver no campo» encontra este
                                    // controlo (ver `chaveDoCampo`).
                                    data-campo={`boardTitulo:${bi}`}
                                    placeholder="Decoração Cerimónia"
                                    aria-label="Título do mood board"
                                    readOnly={fechado}
                                  />
                                  {/* O SEGUNDO andar do cabeçalho da página.
                            A proposta feita à mão tem «Complementos dos Noivos»
                            e, por baixo, «Ramo de Noiva (a definir com a
                            Noiva)»: o primeiro diz o capítulo, o segundo diz o
                            que aquelas fotos são e o que ainda está por
                            decidir. Sem campo, ou se perdia a segunda frase ou
                            se enfiava tudo num título com parênteses. */}
                                  <input
                                    className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-foreground/75"
                                    value={b.subtitulo ?? ""}
                                    onChange={(e) => updateBoard(bi, { subtitulo: e.target.value })}
                                    data-campo={`boardSubtitulo:${bi}`}
                                    placeholder="Subtítulo (opcional) — ex.: Ramo de Noiva (a definir com a Noiva)"
                                    aria-label="Subtítulo do mood board"
                                    readOnly={fechado}
                                  />
                                  {/* A POSIÇÃO NO ECRÃ, não o índice do array: ver
                            `moveBoard`. */}
                                  <MoveBtns
                                    onUp={() => moveBoard(pos, -1)}
                                    onDown={() => moveBoard(pos, 1)}
                                    disUp={pos === 0}
                                    disDown={pos === doc.moodBoards.length - 1}
                                  />
                                  {/* ── FECHAR A PÁGINA ──────────────────────────
                                  Marcada como terminada, fica só de leitura e
                                  muda de cor. Reabrir é um clique — e não uma
                                  pergunta a que se responde sem ler. */}
                                  <button
                                    type="button"
                                    onClick={() => alternarBloqueio(bi)}
                                    aria-pressed={fechado}
                                    aria-label={
                                      fechado
                                        ? `Reabrir o mood board ${pos + 1} a alterações`
                                        : `Marcar o mood board ${pos + 1} como terminado`
                                    }
                                    className={`alvo-toque flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-xs transition-colors ${
                                      fechado
                                        ? "bg-[#4d6350]/15 text-[#4d6350]"
                                        : "text-foreground/35 hover:bg-foreground/[0.06] hover:text-foreground/70"
                                    }`}
                                  >
                                    <span aria-hidden="true">{fechado ? "🔒" : "🔓"}</span>
                                  </button>
                                  {/* ── ARRUMAR POR COR ──────────────────────
                                      Só aparece quando há mesmo o que arrumar:
                                      três fotos com cor conhecida. Com menos, o
                                      botão não teria nada para fazer e seria só
                                      mais um ícone a ocupar a barra. Fica
                                      escondido — e não desactivado — porque um
                                      botão desactivado que nunca se explica é
                                      pior do que um botão que não está lá. */}
                                  {b.images.filter((p) => assetCores[p]).length >= 3 && (
                                    <button
                                      type="button"
                                      onClick={() => arrumarPorCor(bi)}
                                      aria-label={`Arrumar por cor as fotografias do mood board ${pos + 1}`}
                                      title="Arrumar as fotografias por cor"
                                      disabled={fechado}
                                      className="alvo-toque flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-xs text-foreground/35 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/70 disabled:opacity-40"
                                    >
                                      <span aria-hidden="true">◑</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => duplicarBoard(bi)}
                                    aria-label={`Duplicar o mood board ${pos + 1}`}
                                    className="alvo-toque flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-xs text-foreground/35 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/70"
                                  >
                                    <span aria-hidden="true">⧉</span>
                                  </button>
                                  <button
                                    type="button"
                                    className={REMOVE_BTN}
                                    onClick={() => removeBoard(bi)}
                                    aria-label="Remover mood board"
                                    disabled={fechado}
                                  >
                                    ×
                                  </button>
                                </div>
                                {/* ── O QUE SE VÊ COM O BOARD FECHADO ───────────
                                Título e subtítulo já estão no cabeçalho; falta
                                o que diz se está pronto: quantas fotos, e quais.
                                Sem a tira, «Decoração Cerimónia · 6 fotos» podia
                                ser qualquer página. */}
                                {dobrado ? (
                                  <div className="flex items-center gap-2">
                                    <p className="shrink-0 text-[11px] text-foreground/45">
                                      {b.images.length === 0
                                        ? "sem fotos"
                                        : b.images.length === 1
                                          ? "1 foto"
                                          : `${b.images.length} fotos`}
                                    </p>
                                    <div className="flex min-w-0 gap-1 overflow-hidden">
                                      {b.images.slice(0, 8).map((path, ii) => (
                                        <span
                                          key={ii}
                                          className="h-9 w-9 shrink-0 overflow-hidden rounded border border-foreground/10 bg-foreground/[0.04]"
                                        >
                                          {assetUrls[path] ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={assetUrls[path]}
                                              alt=""
                                              loading="lazy"
                                              className="h-full w-full object-cover"
                                            />
                                          ) : null}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <textarea
                                      className={`${INPUT_SM} mb-2 w-full resize-none leading-relaxed`}
                                      rows={2}
                                      value={b.annotation ?? ""}
                                      onChange={(e) =>
                                        updateBoard(bi, { annotation: e.target.value })
                                      }
                                      data-campo={`boardNota:${bi}`}
                                      placeholder="Descrição (opcional) — ex.: runner floral com hortênsias verdes, cravo verde, lisianthus branco…"
                                      aria-label="Descrição do mood board"
                                    />
                                    {/* ── A PÁGINA ESTÁ A FICAR CHEIA ─────────
                                        Discreto, e antes do limite: às oito
                                        fotos a página ainda sai inteira, mas
                                        cada uma já é pequena. O aviso vermelho
                                        fica para quando alguma deixa mesmo de
                                        ser impressa. */}
                                    {b.images.length >= FOTOS_QUE_ENCHEM_A_PAGINA &&
                                      b.images.length <= MOOD_BOARD_MAX_IMAGES && (
                                        <p className="mb-2 text-xs leading-relaxed text-foreground/45">
                                          {b.images.length} fotos numa página: cada uma fica
                                          pequena. Duas páginas com metade lêem-se melhor do que uma
                                          cheia.
                                        </p>
                                      )}
                                    {/* A página deste mood board desenha MOOD_BOARD_MAX_IMAGES
                          fotos. As que passam disso ficam marcadas — e ditas por
                          extenso a seguir — em vez de desaparecerem caladas no
                          PDF. */}
                                    {b.images.length > MOOD_BOARD_MAX_IMAGES && (
                                      <p className="mb-2 text-xs leading-relaxed text-[#8a2a22]">
                                        A página deste mood board mostra {MOOD_BOARD_MAX_IMAGES}{" "}
                                        fotos:{" "}
                                        {b.images.length - MOOD_BOARD_MAX_IMAGES === 1
                                          ? "a última, marcada «fora do PDF», não é impressa"
                                          : `as ${b.images.length - MOOD_BOARD_MAX_IMAGES} últimas, marcadas «fora do PDF», não são impressas`}
                                        . Remove fotos ou cria outro mood board.
                                      </p>
                                    )}
                                    {/* ── A FOTO QUE DESTOA DA PALETA ────────────
                                        Não é um erro, e por isso não é vermelho:
                                        uma fotografia de cor diferente pode ser
                                        exactamente o que se quer. É uma coisa que
                                        se vê melhor dita do que olhando para uma
                                        grelha de miniaturas pequenas — e que só
                                        aparece quando salta à vista mesmo (ver
                                        `LIMIAR_DE_AVISO` em `cor-dominante.ts`).

                                        Cala-se sozinho quando não há cores que
                                        cheguem: as fotos carregadas antes de a
                                        cor existir não entram na conta. */}
                                    {(() => {
                                      const fora = fotosQueDestoam(
                                        b.images.map((p) => assetCores[p]),
                                      );
                                      if (fora.length === 0) return null;
                                      const quais = fora
                                        .slice(0, 3)
                                        .sort((x, y) => x - y)
                                        .map((i) => `${i + 1}.ª`);
                                      return (
                                        <p className="mb-2 text-xs leading-relaxed text-foreground/55">
                                          <span aria-hidden="true">◐ </span>
                                          {fora.length === 1
                                            ? `A ${quais[0]} fotografia destoa da paleta desta página.`
                                            : `A ${quais.slice(0, -1).join(", a ")} e a ${quais[quais.length - 1]} fotografias destoam da paleta desta página.`}{" "}
                                          Pode ser de propósito — se não for, troca-a ou arruma a
                                          página por cor.
                                        </p>
                                      );
                                    })()}
                                    <GrelhaDeFotos
                                      bi={bi}
                                      quantas={b.images.length}
                                      className="grid grid-cols-3 sm:grid-cols-4 gap-2"
                                    >
                                      {b.images.map((path, ii) => (
                                        <CelulaDeFoto
                                          // A chave é a POSIÇÃO, não o caminho: quando o
                                          // marcador provisório dá lugar ao caminho definitivo,
                                          // uma chave com o caminho faria o React desmontar a
                                          // célula e a foto piscava a meio da troca.
                                          key={ii}
                                          bi={bi}
                                          ii={ii}
                                          principal={comDestaque && fotoPrincipalDe(b) === ii}
                                          seleccionada={seleccionadas.has(`${bi}:${ii}`)}
                                          // Fechado, a foto vê-se mas não se mexe: é
                                          // isso que «terminado» quer dizer.
                                          bloqueada={fechado}
                                          accoes={
                                            fechado ? null : (
                                              <AccoesDaFoto
                                                podeRecuar={ii > 0}
                                                podeAvancar={ii < b.images.length - 1}
                                                seleccionada={seleccionadas.has(`${bi}:${ii}`)}
                                                principal={
                                                  comDestaque
                                                    ? fotoPrincipalDe(b) === ii
                                                    : undefined
                                                }
                                                onRecuar={() => reordenarFotos(bi, ii, ii - 1)}
                                                onAvancar={() => reordenarFotos(bi, ii, ii + 1)}
                                                onAmpliar={() => setLupa({ bi, ii })}
                                                onSubstituir={() =>
                                                  setPicker({ kind: "board", bi, substituir: ii })
                                                }
                                                onPrincipal={() => marcarPrincipal(bi, ii)}
                                                onSeleccionar={() => alternarSeleccao(bi, ii)}
                                                onRemover={() => removeBoardImageAt(bi, ii)}
                                              />
                                            )
                                          }
                                        >
                                          <Thumb
                                            url={assetUrls[path]}
                                            planoB={assetOriginais[path]}
                                            onde="mood-board"
                                            refDoc={path}
                                            // A remoção mudou-se para a barra de acções, que
                                            // é visível ao toque — o × só aparecia em hover, e
                                            // num telemóvel isso é um botão que não existe.
                                            semRemover
                                            onRemove={() => removeBoardImageAt(bi, ii)}
                                            onMedida={(a) => registarAspeto(path, a)}
                                            // A forma da célula que ESTA foto vai ocupar na
                                            // página — sai da caixa que a disposição escolhida
                                            // lhe dá, e muda com ela e com o número de fotos.
                                            // Nenhuma delas é quadrada. As que já não são
                                            // impressas ficam quadradas: não têm caixa nenhuma.
                                            //
                                            // Pela ORDEM DE DESENHO e não pela posição no
                                            // array: com uma foto marcada como principal, a
                                            // página troca-a para a caixa grande, e a célula
                                            // tem de mostrar a forma dessa caixa (ver
                                            // `ordemDasFotos`).
                                            aspeto={aspetoDaCaixa(
                                              caixas[ordemDeDesenho.indexOf(ii)],
                                            )}
                                            foraDoPdf={
                                              ordemDeDesenho.indexOf(ii) >= MOOD_BOARD_MAX_IMAGES
                                            }
                                            pendente={isPendingImage(path)}
                                          />
                                        </CelulaDeFoto>
                                      ))}
                                    </GrelhaDeFotos>
                                    {/* ── A CAIXA DE ACRESCENTAR, FORA DA GRELHA ────────
                                        Estava DENTRO da grelha, como se fosse
                                        mais uma fotografia — uma célula quadrada
                                        tracejada entre fotos que têm a forma da
                                        caixa que vão ocupar na página. Num board
                                        de cinco fotos numa grelha de quatro
                                        colunas, ela caía a meio da segunda fila,
                                        e lia-se como um buraco: uma foto que
                                        faltava, não um botão.

                                        Fora da grelha e a toda a largura, é o
                                        que é — a acção que vem A SEGUIR às
                                        fotografias. E nunca mais pode aparecer
                                        no meio delas, porque já não é uma
                                        célula.

                                        Num board fechado não existe: o gesto de
                                        largar uma foto é exactamente o engano
                                        contra o qual o fecho existe. */}
                                    {!fechado && (
                                      <div className="mt-2">
                                        <UploadArea
                                          label="+ Imagens"
                                          busy={!!uploading[`board-${bi}`]}
                                          multiple
                                          faixa
                                          onFiles={(files) =>
                                            handleUpload(`board-${bi}`, files, (paths) =>
                                              addBoardImages(bi, paths),
                                            )
                                          }
                                        />
                                      </div>
                                    )}
                                    {/* Sem fotos não há disposição nenhuma para escolher — o
                        selector aparece com a primeira foto, que é quando a
                        pergunta passa a ter resposta. */}
                                    {/* ── VER ANTES DE GERAR ───────────────────
                                        A página com as fotos no sítio, ao lado
                                        das opções. Os diagramas dizem a FORMA
                                        das caixas; isto diz que fotografia
                                        fica em qual. */}
                                    {aspectos.length > 0 && (
                                      <div className="mt-1 grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
                                        <div className="min-w-0">
                                          <SelectorDeLayout
                                            valor={b.layout}
                                            aspectos={aspectos}
                                            semRecorte={semRecorte}
                                            // `undefined` APAGA o campo: um mood board sem
                                            // layout gravado continua sem ele, e uma proposta
                                            // já enviada não muda de aspecto por causa disto.
                                            onEscolher={(layout) => updateBoard(bi, { layout })}
                                          />
                                        </div>
                                        <div className="lg:pt-6">
                                          <PreviaDaPagina
                                            layout={layoutDoBoard}
                                            aspectos={aspectos}
                                            // Pela ordem de DESENHO, com a principal à frente
                                            // — a mesma que a página vai usar.
                                            urls={ordemDeDesenho
                                              .slice(0, MOOD_BOARD_MAX_IMAGES)
                                              .map((i) => assetUrls[b.images[i]])}
                                            // O plano B, o mesmo da grelha aqui
                                            // ao lado: uma miniatura que não
                                            // existe cai para o original em vez
                                            // de dar o ícone de imagem partida.
                                            originais={ordemDeDesenho
                                              .slice(0, MOOD_BOARD_MAX_IMAGES)
                                              .map((i) => assetOriginais[b.images[i]])}
                                            semRecorte={semRecorte}
                                            titulo={b.title}
                                            subtitulo={b.subtitulo}
                                            legenda={b.annotation}
                                          />
                                        </div>
                                      </div>
                                    )}
                                    {/* ── O INTERRUPTOR DO RECORTE ─────────────────────────
                          Está aqui, por baixo dos diagramas, porque é com eles
                          que se percebe o que ele faz: liga-se e as caixas
                          mudam de forma à frente dela.

                          Desligar APAGA o campo (não guarda um `false`): um
                          mood board que nunca teve a escolha tem de continuar
                          sem ela, para uma proposta já enviada sair como
                          sempre saiu. */}
                                    <div className="mt-2 flex items-center gap-1.5">
                                      <label className="flex items-start gap-2 text-xs leading-relaxed text-foreground/65">
                                        <input
                                          type="checkbox"
                                          className="mt-0.5 h-4 w-4 shrink-0 accent-[#4d6350]"
                                          checked={semRecorte}
                                          onChange={(e) =>
                                            updateBoard(bi, {
                                              enquadramento: e.target.checked
                                                ? "forma-da-foto"
                                                : undefined,
                                            })
                                          }
                                        />
                                        <span>Manter a forma de cada fotografia (não corta)</span>
                                      </label>
                                      {/* FORA do `<label>`, e é por uma razão: um
                                          botão lá dentro ligava e desligava a
                                          opção ao ser carregado.

                                          O que ele explica é a consequência de
                                          DESLIGAR — a parte que ninguém precisa
                                          de reler à quinquagésima página. */}
                                      <Ajuda sobre="o que muda ao manter a forma das fotografias">
                                        Desligado, as fotografias são recortadas para encher as
                                        caixas da disposição — como saía antes. Ligado, cada uma
                                        entra inteira e as caixas é que se ajustam à forma dela.
                                      </Ajuda>
                                    </div>
                                    {/* ── A ÚLTIMA FILA ────────────────────────
                                        Uma última fila com uma foto, quando as
                                        de cima têm três ou quatro, lê-se como
                                        um esquecimento. Medido nas caixas que a
                                        página vai mesmo desenhar. */}
                                    {(() => {
                                      const fila = filaDesequilibrada(caixas);
                                      if (!fila) return null;
                                      const fotos = (n: number) =>
                                        n === 1 ? "uma foto" : `${n} fotos`;
                                      // Os dois remédios, com o mais barato à
                                      // frente: quatro em cima e uma em baixo
                                      // pede que se tire uma, não que se
                                      // acrescentem três.
                                      const acrescentar = `com mais ${fotos(fila.aAcrescentar)}`;
                                      const remover = `tirando ${fila.aRemover === 1 ? "a que lá está" : `as ${fila.aRemover} que lá estão`}`;
                                      return (
                                        <p className="mt-1.5 text-xs leading-relaxed text-foreground/50">
                                          A última fila desta página fica com{" "}
                                          {fila.naUltima === 1
                                            ? "uma foto só"
                                            : `${fila.naUltima} fotos`}
                                          , contra {fila.nasOutras} nas de cima. A página fecha
                                          certa{" "}
                                          {fila.sugestao === "remover"
                                            ? `${remover} — ou ${acrescentar}`
                                            : `${acrescentar} — ou ${remover}`}
                                          .
                                        </p>
                                      );
                                    })()}
                                    {cortadas.length > 0 && (
                                      <p className="mt-1.5 text-xs leading-relaxed text-[#8a2a22]">
                                        Nesta disposição{" "}
                                        {cortadas.length === 1
                                          ? "1 fotografia é cortada"
                                          : `${cortadas.length} fotografias são cortadas`}
                                        :{" "}
                                        {cortadas
                                          .map(
                                            ({ perda, i }) =>
                                              `a ${i + 1}.ª perde ${Math.round(perda * 100)}%`,
                                          )
                                          .join(", ")}
                                        . Liga «Manter a forma de cada fotografia» para não perder
                                        nada.
                                      </p>
                                    )}
                                    <div className="mt-2 flex flex-wrap items-center gap-4">
                                      <button
                                        type="button"
                                        className={ADD_BTN}
                                        onClick={() => setPicker({ kind: "board", bi })}
                                        disabled={fechado}
                                        onPointerEnter={aquecerBiblioteca}
                                        onFocus={aquecerBiblioteca}
                                        onTouchStart={aquecerBiblioteca}
                                      >
                                        Escolher da biblioteca de temas
                                      </button>
                                      {/* GUARDAR ESTE, e não «o primeiro com título».
                          O controlo era único para a secção inteira e recebia
                          `doc.moodBoards.find(…)` — portanto guardava sempre o
                          PRIMEIRO mood board com título. Ela montava o
                          terceiro, carregava em «Guardar como modelo», e
                          guardava o primeiro; para o terceiro não havia
                          maneira nenhuma. Agora o botão vive ao lado do bloco
                          a que se refere, que é a única forma de a pergunta
                          "qual deles?" não ter de ser respondida por adivinha. */}
                                      {(b.title ?? "").trim() && (
                                        <ModelosParciais
                                          tipo="moodboard"
                                          mostrar="guardar"
                                          toast={toast}
                                          paraGuardar={b}
                                          nomeSugerido={b.title}
                                        />
                                      )}
                                    </div>
                                  </>
                                )}
                              </>
                            )}
                          </CartaoDeBoard>
                        );
                      })}
                    </ListaDeBoards>
                  </ArrastoDosMoodBoards>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <button type="button" className={ADD_BTN} onClick={addBoard}>
                      + Adicionar mood board
                    </button>
                    {/* Fechar tudo é o gesto de quem acabou uma proposta e quer ver
                    a forma dela; abrir tudo, o de quem vai rever. Dois botões e
                    não um interruptor: o estado de cada board é seu, e um
                    interruptor teria de mentir sobre o conjunto. */}
                    {doc.moodBoards.length > 1 && (
                      <>
                        {/* As oito páginas à mesma distância dos olhos — a única
                            maneira de ver se parecem todas do mesmo casamento. */}
                        <button
                          type="button"
                          className={ADD_BTN}
                          onClick={() => setVistaDeConjunto((v) => !v)}
                          aria-pressed={vistaDeConjunto}
                        >
                          {vistaDeConjunto
                            ? "Fechar a vista de conjunto"
                            : "Ver as páginas lado a lado"}
                        </button>
                        <button type="button" className={ADD_BTN} onClick={() => dobrarTodos(true)}>
                          Fechar todos
                        </button>
                        <button
                          type="button"
                          className={ADD_BTN}
                          onClick={() => dobrarTodos(false)}
                        >
                          Abrir todos
                        </button>
                      </>
                    )}
                    <ModelosParciais
                      tipo="moodboard"
                      mostrar="inserir"
                      toast={toast}
                      onInserir={(b) => void inserirMoodBoardDeModelo(b as MoodBoard)}
                    />
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* Cronograma — organizacao only */}
          {!isDeco && (
            <Section title="Cronograma de Organização" id="cronograma">
              <div className="flex flex-col gap-3">
                {(doc.cronograma ?? []).map((ph, pi) => (
                  <div
                    key={pi}
                    className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <input
                        className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-foreground/75"
                        value={ph.title}
                        onChange={(e) => updatePhase(pi, { title: e.target.value })}
                        placeholder="6-12 meses antes do casamento"
                        aria-label="Título da fase"
                      />
                      <MoveBtns
                        onUp={() => movePhase(pi, -1)}
                        onDown={() => movePhase(pi, 1)}
                        disUp={pi === 0}
                        disDown={pi === (doc.cronograma?.length ?? 0) - 1}
                      />
                      <button
                        type="button"
                        className={REMOVE_BTN}
                        onClick={() => removePhase(pi)}
                        aria-label="Remover fase"
                      >
                        ×
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 pl-1">
                      {ph.items.map((it, ii) => (
                        <div key={ii} className="flex items-center gap-2">
                          <input
                            className={INPUT_SM}
                            value={it}
                            onChange={(e) => updatePhaseItem(pi, ii, e.target.value)}
                            placeholder="Definição do conceito"
                            aria-label="Tarefa"
                          />
                          <button
                            type="button"
                            className={REMOVE_BTN}
                            onClick={() => removePhaseItem(pi, ii)}
                            aria-label="Remover tarefa"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button type="button" className={ADD_BTN} onClick={() => addPhaseItem(pi)}>
                        + Adicionar tarefa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className={`${ADD_BTN} mt-3`} onClick={addPhase}>
                + Adicionar fase
              </button>
            </Section>
          )}

          {/* Budget */}
          <Section title="Orçamento Proposto" id="orcamento">
            {isDeco ? (
              <>
                <AvisoDeOrdem
                  mostrar={ordemSugerida}
                  onde="As linhas do orçamento"
                  onFixar={() =>
                    fixarOrdem("Ordem fixada. Daqui para a frente manda a ordem que aqui está.")
                  }
                />
                <div className="flex flex-col gap-2 mb-3">
                  {/* ── OS CABEÇALHOS DAS COLUNAS ────────────────────────────
                      A caixa do fim não tinha nome nenhum: uma quadrícula com a
                      palavra «extra» ao lado, sem cabeçalho e sem uma frase que
                      dissesse o que faz. Palavras dela: «a caixa "extra" não
                      está explicada».

                      As larguras são as MESMAS das dos campos por baixo
                      (`w-32`, `w-28`, `w-16`) — é isso, e só isso, que faz um
                      cabeçalho apontar para a coluna certa. O campo do preço
                      unitário passou para a segunda linha de cada item, ao pé
                      da fórmula a que pertence: enquanto esteve no meio da
                      linha, aparecia só nas linhas que escalam e empurrava as
                      colunas dessas para fora do cabeçalho. */}
                  <div className="hidden items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-foreground/25 sm:flex">
                    <span className="flex-1">Item</span>
                    <span className="w-32 shrink-0">Como escala</span>
                    <span className="flex w-28 shrink-0 items-center justify-end gap-1">
                      Preço (sem IVA)
                      <Ajuda sobre="para que servem os preços por linha">
                        Os preços por linha são{" "}
                        <strong className="font-semibold text-foreground/85">só para ti</strong>:
                        servem para somar e para avisar quando o total já não bate certo. O PDF
                        continua a mostrar as linhas sem preço e um «
                        {doc.totalLabel || "Valor Total"}» único, como nas tuas propostas.
                      </Ajuda>
                    </span>
                    {/* ── A EXPLICAÇÃO, AO PÉ DO CABEÇALHO E A PEDIDO ──────
                        Eram três linhas sempre visíveis por baixo das linhas do
                        orçamento. Palavras dela: «ocupa três linhas sempre
                        visíveis». Úteis na primeira vez, ruído a partir da
                        segunda — e a ocupar o espaço onde deviam estar as
                        linhas. Agora está onde a pergunta se faz: em cima da
                        coluna, atrás de um «?». */}
                    <span className="flex w-16 shrink-0 items-center justify-center gap-1">
                      Extra
                      <Ajuda sobre="o que faz a caixa Extra">
                        <strong className="font-semibold text-foreground/85">Extra</strong> marca
                        uma linha como opcional: ela sai assinalada no quadro do PDF e, por baixo do
                        total, a proposta passa a mostrar também o valor <em>sem</em> essa linha.
                        Uma proposta só, com as duas versões lá dentro — em vez de dois documentos a
                        divergir.
                      </Ajuda>
                    </span>
                    <span className="w-5 shrink-0" />
                  </div>
                  {/* Pela ordem que vai SAIR — ver `ordemDoOrcamento`. O `i`
                      continua a ser o índice do array, que é o que os campos
                      escrevem; só a ordem de desenho muda. */}
                  {ordemDoOrcamento.map((i) => {
                    const l = linhasDoOrcamento[i];
                    const escala = escalasDoDoc[i];
                    const semPreco = l.preco === null;
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <input
                          className={`${INPUT_SM} flex-1`}
                          value={l.item}
                          onChange={(e) => updateBudgetItem(i, e.target.value)}
                          placeholder="Decor Cerimónia"
                          aria-label="Item de orçamento"
                        />
                        {/* COMO É QUE ESTA LINHA ESCALA. Metade das linhas de um
                          orçamento de casamento não é um preço, é uma
                          multiplicação — e quando os convidados mudam, refazer
                          essas contas à mão é onde entra o erro que ninguém vê,
                          porque o resultado continua a parecer um preço. */}
                        <select
                          value={escala?.tipo ?? "fixa"}
                          onChange={(e) => definirEscala(i, e.target.value as TipoDeEscala)}
                          aria-label={`Como escala ${l.item || "a linha sem nome"}`}
                          className="bo-input w-32 shrink-0 px-2 py-2 text-xs"
                        >
                          <option value="fixa">Valor fixo</option>
                          <option value="por-convidado">Por convidado</option>
                          <option value="por-mesa">Por mesa</option>
                        </select>
                        {/* A largura vai no invólucro e não no campo: `.bo-input`
                        tem `width: 100%` escrito em CSS, que ganha a um
                        `w-28` do Tailwind. Sem isto o preço comia a linha
                        toda e o nome ficava numa caixa de trinta pixels — foi
                        o que a captura de ecrã mostrou. */}
                        <span className="w-28 shrink-0">
                          {/* ── PREENCHIDO E POR PREENCHER, INCONFUNDÍVEIS ──
                              Tinha aqui `placeholder="900"`. Palavras dela: «um
                              número redondo e plausível como placeholder num
                              campo de preço é perigoso — mais cedo ou mais
                              tarde alguém pensa que já está preenchido». E
                              tinha acontecido: quatro serviços por orçamentar
                              mostravam «900» a cinzento cada um.

                              O placeholder saiu, e as duas caixas passaram a
                              ser diferentes ao olhar, não só ao ler: a que tem
                              preço é sólida e escura, a que não tem é
                              tracejada, lavada, e diz «sem preço» — três
                              palavras que ninguém confunde com euros. */}
                          <input
                            className={`bo-input px-2.5 py-2 text-right text-xs ${
                              semPreco
                                ? "border-dashed bg-foreground/[0.02] text-foreground/40 placeholder:text-foreground/30 placeholder:italic"
                                : "font-medium text-foreground/90"
                            }`}
                            defaultValue={l.preco === null ? "" : String(l.preco)}
                            // `onBlur` e não `onChange`: normalizar a cada tecla
                            // apagava o que ela estava a escrever a meio ("1." vira
                            // 1, e o "500" seguinte já não tinha onde entrar).
                            onBlur={(e) => updateBudgetPrice(i, e.target.value)}
                            placeholder="sem preço"
                            inputMode="decimal"
                            aria-label={`Preço de ${l.item || "linha sem nome"}`}
                          />
                        </span>
                        {/* EXTRA OU NÃO. Uma caixa e não um menu: a pergunta é
                          de sim ou não, e um menu de duas entradas custa duas
                          carregadas para responder a uma pergunta de uma.
                          A palavra «extra» some a partir de `sm`, onde o
                          cabeçalho da coluna já a diz — e fica no telemóvel,
                          onde não há cabeçalho nenhum. */}
                        <label className="alvo-toque flex w-16 shrink-0 items-center justify-center gap-1.5 text-[11px] text-foreground/50">
                          <input
                            type="checkbox"
                            checked={extrasDoDoc[i] ?? false}
                            onChange={(e) => updateBudgetExtraFlag(i, e.target.checked)}
                            aria-label={`${l.item || "Linha sem nome"} é um extra opcional`}
                          />
                          <span className="sm:hidden">extra</span>
                        </label>
                        {/* No telemóvel não há cabeçalho de coluna, e portanto
                            não há onde pendurar o «?». Fica na PRIMEIRA linha,
                            que é o equivalente móvel do cabeçalho — e só nela:
                            um ponto de interrogação por linha seriam oito
                            botões a explicar a mesma coisa.

                            Fora do `<label>`: um botão lá dentro carregaria a
                            quadrícula ao ser carregado. */}
                        {ordemDoOrcamento[0] === i && (
                          <Ajuda className="sm:hidden" sobre="o que faz a caixa Extra">
                            <strong className="font-semibold text-foreground/85">Extra</strong>{" "}
                            marca uma linha como opcional: ela sai assinalada no quadro do PDF e,
                            por baixo do total, a proposta passa a mostrar também o valor{" "}
                            <em>sem</em> essa linha. Uma proposta só, com as duas versões lá dentro
                            — em vez de dois documentos a divergir.
                          </Ajuda>
                        )}
                        <button
                          type="button"
                          className={REMOVE_BTN}
                          onClick={() => removeBudgetItem(i)}
                          aria-label="Remover item"
                        >
                          ×
                        </button>
                        {/* A fórmula ao lado do número: um total que muda sozinho
                          e não explica porquê é um total em que se deixa de
                          confiar à primeira surpresa. E o preço UNITÁRIO ao pé
                          dela, que é a única coisa da fórmula que se edita. */}
                        {escala && (
                          <div className="flex w-full flex-wrap items-center gap-2 pl-1">
                            <span className="w-24 shrink-0">
                              <input
                                className="bo-input px-2.5 py-2 text-right text-xs text-foreground/75"
                                defaultValue={String(escala.unitario)}
                                onBlur={(e) => definirUnitario(i, e.target.value)}
                                placeholder="45"
                                inputMode="decimal"
                                aria-label={`Preço por ${escala.tipo === "por-mesa" ? "mesa" : "convidado"} de ${l.item || "linha sem nome"}`}
                              />
                            </span>
                            <span className="text-[10px] text-foreground/40">
                              {`${formulaDaLinha(
                                escala,
                                convidados,
                                doc.convidadosPorMesa ?? CONVIDADOS_POR_MESA_OMISSAO,
                              )} = ${eur(
                                totalDaLinha(
                                  escala,
                                  convidados,
                                  doc.convidadosPorMesa ?? CONVIDADOS_POR_MESA_OMISSAO,
                                ) ?? 0,
                              )}`}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button type="button" className={ADD_BTN} onClick={addBudgetItem}>
                      + Adicionar item
                    </button>
                    {/* O CONTADOR, no lugar onde estava «Soma das linhas».
                        A soma mudou-se para o bloco de totais (que a mostra
                        pela ordem do PDF); aqui fica a única coisa que este
                        sítio pode responder melhor do que ele — quantas destas
                        caixas estão mesmo preenchidas. */}
                    {contagem.total > 0 && (
                      <span className="text-xs text-foreground/55">{contagem.frase}</span>
                    )}
                  </div>
                  {/* ── UMAS COM PREÇO, OUTRAS SEM: A SOMA ESTÁ INCOMPLETA ──
                      É o caso que mente sem parecer. Nenhuma linha com preço é
                      «ainda não orçamentei» e não soma nada; TODAS com preço é
                      uma soma verdadeira. O meio dá um número plausível que
                      está errado por baixo — e é a partir dele que o aviso de
                      desalinhamento e o botão que arruma o total falam. */}
                  {contagem.incompleta && (
                    <p className="flex items-start gap-1.5 rounded-xl border border-[#c98a2e]/35 bg-[#c98a2e]/[0.06] px-3 py-2 text-xs leading-relaxed text-foreground/70">
                      <span aria-hidden="true">⚠</span>
                      <span>
                        {contagem.semPreco === 1
                          ? "1 linha ainda não tem preço"
                          : `${contagem.semPreco} linhas ainda não têm preço`}
                        , por isso a soma dos serviços está incompleta — o que aparece nos totais
                        conta só as {contagem.comPreco} que têm.
                      </span>
                    </p>
                  )}

                  {/* ── AS DUAS VERSÕES, SEM SEREM DUAS PROPOSTAS ──────────
                      Assim que uma linha é marcada como extra, esta proposta
                      passa a responder ao "e sem isso, quanto fica?" — e o PDF
                      leva os dois números. É de propósito que só o total com
                      extras é escrito à mão: o outro é a subtracção, e dois
                      números escritos podiam discordar no dia em que ela
                      corrigisse só um. */}
                  {(() => {
                    // Sem segundo argumento: a base sai do próprio documento, e é a
                    // mesma leitura que o PDF faz. Passar `totalAmount` cru dava a
                    // base em «acrescer» e o BRUTO em «IVA incluído» — o ecrã e o
                    // documento a discordarem sobre o mesmo casamento.
                    const v = totaisDasVersoes(doc as ProposalDoc);
                    if (!v) return null;
                    return (
                      <div className="mt-1 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5">
                        {/* O IMPACTO, na frase que ela pediu: quantos estão
                            marcados, e quanto vale a proposta com eles. */}
                        <p className="text-xs leading-relaxed text-foreground/70">
                          {`${v.linhasExtra} ${v.linhasExtra === 1 ? "item marcado" : "itens marcados"} como extra · versão com extras: `}
                          <strong className="font-semibold text-foreground/85">
                            {eur(v.comoOTotal.comExtras)}
                          </strong>
                          {" · versão base: "}
                          <strong className="font-semibold text-foreground/85">
                            {eur(v.comoOTotal.base)}
                          </strong>
                        </p>
                        {v.extrasSemPreco > 0 && (
                          <p className="mt-0.5 text-[11px] leading-relaxed text-[#8a6420]">
                            {v.extrasSemPreco === 1
                              ? "Um dos extras não tem preço, por isso não desce da versão base — e enquanto assim for o PDF não mostra o segundo valor."
                              : `${v.extrasSemPreco} extras não têm preço, por isso não descem da versão base — e enquanto assim for o PDF não mostra o segundo valor.`}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Rótulo do total"
                    value={doc.totalLabel}
                    onChange={(e) => patch({ totalLabel: e.target.value })}
                    data-campo="totalLabel"
                    placeholder="Valor Total Decoração"
                  />
                </div>

                {/* Valores adicionais — linhas do orçamento que entram no total
                  (Deslocação, Wedding Coordinator, Tecidos, Mobiliário opção A/B, …).
                  Escrever um valor aqui SOMA-O ao total: ver `definirExtras`. */}
                <div className="mt-5">
                  <span className="bo-eyebrow">Valores adicionais</span>
                  <p className="mt-1.5 mb-3 text-xs leading-relaxed text-foreground/45">
                    Linhas mostradas na proposta antes do total (ex.: deslocação, coordenação,
                    tecidos). <strong className="font-semibold">Somam ao total</strong> — e portanto
                    ao sinal e à fatura.
                  </p>
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_7rem_9rem_auto] gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25">
                      <span>Descrição</span>
                      <span className="text-right">Valor (€)</span>
                      <span>IVA da linha</span>
                      <span className="w-5" />
                    </div>
                    {(doc.budgetExtras ?? []).map((ex, i) => {
                      const modo = modoDoAdicional(
                        ex.valueText ?? "",
                        doc.vatRate ?? DEFAULT_VAT_RATE,
                      );
                      const numero = normalizarValor(ex.valueText);
                      return (
                        <div
                          key={i}
                          className="grid grid-cols-[minmax(0,1fr)_7rem_9rem_auto] items-center gap-2"
                        >
                          <input
                            className="bo-input px-2.5 py-2 text-xs text-foreground/75"
                            value={ex.label}
                            onChange={(e) => updateBudgetExtra(i, { label: e.target.value })}
                            data-campo={`extraRotulo:${i}`}
                            placeholder="Deslocação da equipa Líquen"
                            aria-label="Descrição da linha adicional"
                          />
                          {/* ── UM CAMPO DE DINHEIRO, NÃO UM CAMPO DE TEXTO ──
                              Chamava-se «Valor (texto)» e aceitava o que lhe
                              escrevessem — que é o que se pede a um campo cujo
                              conteúdo é impresso no PDF tal e qual. O preço
                              disso era «1.500» a valer mil e quinhentos ou um e
                              meio conforme quem o lê.

                              Agora entra um NÚMERO («1.500», «1500», «1 500 €»
                              dão os três 1500, por `normalizarValor`) e o «+
                              IVA» — que era a informação que vinha escondida no
                              texto — passou a ser o selector ao lado. O que se
                              grava continua a ser a frase que o PDF imprime;
                              ver `textoDoAdicional`.

                              `defaultValue` + `onBlur`, como no preço da linha:
                              normalizar a cada tecla apagava o que ela estava a
                              escrever a meio. O `key` traz o valor gravado de
                              volta ao campo quando ele muda por outra via (o
                              selector do IVA, a deslocação calculada, o anular). */}
                          <input
                            key={`${i}:${ex.valueText}`}
                            className="bo-input px-2.5 py-2 text-xs text-foreground/75 text-right"
                            defaultValue={numero === null ? (ex.valueText ?? "") : String(numero)}
                            onBlur={(e) => definirValorDoAdicional(i, e.target.value)}
                            placeholder="896"
                            inputMode="decimal"
                            aria-label={`Valor de ${ex.label?.trim() || "linha adicional sem nome"}`}
                          />
                          <select
                            className="bo-input px-2 py-2 text-xs text-foreground/75"
                            value={modo}
                            onChange={(e) =>
                              definirIvaDoAdicional(i, e.target.value as ModoDeIvaDoAdicional)
                            }
                            aria-label={`IVA de ${ex.label?.trim() || "linha adicional sem nome"}`}
                          >
                            <option value="documento">Como o total</option>
                            <option value="acrescer">+ IVA</option>
                            <option value="incluido">IVA incluído</option>
                          </select>
                          <button
                            type="button"
                            className={REMOVE_BTN}
                            onClick={() => removeBudgetExtra(i)}
                            aria-label="Remover linha adicional"
                          >
                            ×
                          </button>
                          {/* O que fica escrito na proposta, à letra. É a única
                              forma de ela ver que «1500» e «+ IVA» viram
                              «1 500,00 € + IVA» no papel — e de um texto livre
                              antigo («a definir») se ver que continua lá. */}
                          {(ex.valueText ?? "").trim() !== "" && (
                            <span className="col-span-full pl-1 text-[10px] text-foreground/35">
                              {`No PDF: ${ex.valueText}`}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <button type="button" className={ADD_BTN} onClick={addBudgetExtra}>
                      + Adicionar valor adicional
                    </button>
                    {/* O «Somado ao total: X» que aqui estava saiu para o bloco
                        de totais, onde é a linha «Valores adicionais». A conta
                        continua à vista — deixou é de ser a terceira soma
                        diferente no mesmo ecrã. */}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2 mb-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_10rem_auto] gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25">
                    <span>Item</span>
                    <span className="text-right">Valor</span>
                    <span className="w-5" />
                  </div>
                  {(doc.budgetRows ?? []).map((r, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(0,1fr)_10rem_auto] items-center gap-2"
                    >
                      <input
                        className="bo-input px-2.5 py-2 text-xs text-foreground/75"
                        value={r.item}
                        onChange={(e) => updateBudgetRow(i, { item: e.target.value })}
                        placeholder="Coordenação do dia"
                        aria-label="Item"
                      />
                      <input
                        className="bo-input px-2.5 py-2 text-xs text-foreground/75 text-right"
                        value={r.price}
                        onChange={(e) => updateBudgetRow(i, { price: e.target.value })}
                        placeholder="1.500,00 €"
                        aria-label="Valor"
                      />
                      <button
                        type="button"
                        className={REMOVE_BTN}
                        onClick={() => removeBudgetRow(i)}
                        aria-label="Remover linha"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button type="button" className={ADD_BTN} onClick={addBudgetRow}>
                    + Adicionar linha
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <Field
                    as="textarea"
                    label="Nota do orçamento"
                    rows={2}
                    className="resize-none"
                    value={doc.budgetNote ?? ""}
                    onChange={(e) => patch({ budgetNote: e.target.value })}
                    data-campo="budgetNote"
                    placeholder="Os valores são estimativas e podem ser ajustados…"
                  />
                </div>
              </>
            )}
          </Section>

          {/* Total, IVA e validade — fonte de verdade do dinheiro. O valor + o modo
          de IVA eliminam a ambiguidade "3.000,00 €" (com IVA?) vs "+ IVA"; o
          texto do PDF é composto a partir daqui. */}
          {/* ── O painel que o cliente nunca vê ────────────────────────────
              Custos, margem, deslocação calculada e o aviso de valor fora do
              habitual. Vive AQUI, no fim do orçamento, porque é aqui que os
              números que ele comenta acabam de ser escritos. */}
          <PainelInterno
            doc={doc as ProposalDoc}
            quote={quote}
            quotes={quotes}
            totalBruto={money.gross}
            onCusto={(i, custo) =>
              setDoc((d) => ({
                ...d,
                // O array dos custos acompanha sempre o das linhas — se ficasse
                // mais curto, o índice 3 passava a ser o custo da linha 4.
                budgetCosts: custosDe(d as ProposalDoc).map((v, j) => (j === i ? custo : v)),
              }))
            }
            onDeslocacao={(label, valueText) => {
              // Se já lá está uma linha de deslocação, actualiza-se essa em
              // vez de acrescentar uma segunda — duas linhas de deslocação
              // numa proposta são uma pergunta do cliente ao telefone.
              //
              // Passa por `definirExtras` como todas as outras: aceitar a
              // deslocação calculada tem de somar ao total, ou volta a haver
              // um valor na proposta que não está no que se cobra.
              const extras = [...(doc.budgetExtras ?? [])];
              const i = extras.findIndex((e) => /desloca/i.test(e.label ?? ""));
              if (i >= 0) extras[i] = { ...extras[i], label, valueText };
              else extras.push({ label, valueText });
              /**
               * ── E PERGUNTA-SE, COM OS DOIS NÚMEROS À VISTA ────────────────
               * «Pôr nos valores adicionais» é a segunda acção do editor que
               * muda o preço final de uma só carregada: a deslocação calculada
               * SOMA-SE ao total, e portanto ao sinal e à fatura. Levava
               * nenhuma pergunta e nenhuma volta atrás — o mesmo desenho do
               * «Usar X €», e por isso o mesmo tratamento.
               */
              const contexto = { mode: vatMode, vatRate: doc.vatRate };
              const antes = parseMoneyText(totalInput);
              const depois = Math.max(
                0,
                Math.round(
                  (antes +
                    somaDosExtrasSemIva(extras, contexto) -
                    somaDosExtrasSemIva(doc.budgetExtras ?? [], contexto)) *
                    100,
                ) / 100,
              );
              // Sem diferença nenhuma no dinheiro (a mesma deslocação outra
              // vez) não há nada a confirmar: aplica-se e cala-se.
              if (Math.abs(depois - antes) <= 0.01) {
                definirExtras(extras);
                return;
              }
              pedirConfirmacaoDeDinheiro({
                oQue: "o total",
                de: antes,
                para: depois,
                registo: `Deslocação calculada (${valueText}) posta nos valores adicionais no estúdio: preço final de ${eur(antes)} para ${eur(depois)}.`,
                motivo: "Deslocação posta nos valores adicionais.",
                aplicar: () => definirExtras(extras),
              });
            }}
          />

          <Section title="Total, IVA e validade" id="total">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <p className="text-xs leading-relaxed text-foreground/50 sm:col-span-2">
                É o mesmo valor do <strong className="font-semibold">Preço final</strong> do pedido
                — escrever aqui altera-o lá, e alterá-lo lá aparece aqui. Há um número só.
              </p>
              <Field
                // Sempre a base: é o que o pedido guarda, e é o que o rótulo
                // "(sem IVA)" da Gestão do pedido promete. O modo de IVA muda o
                // que o cliente vê, não o significado deste campo.
                label="Valor (sem IVA)"
                inputMode="decimal"
                value={totalInput}
                onChange={(e) => {
                  confirmado("totalAmount");
                  onTotalInput(e.target.value);
                }}
                placeholder="3000"
                containerClassName={realce("totalAmount")}
                hint={
                  desvio
                    ? `Escrito à mão — a soma dos serviços com preço é ${eur(desvio.soma)}`
                    : contagem.comPreco > 0
                      ? "Bate certo com a soma dos serviços com preço."
                      : undefined
                }
              />
              {/* O aviso e o atalho para o corrigir andam juntos: dizer que está
                errado sem dar o gesto que o arruma é meio trabalho. */}
              {desvio && (
                <div className="sm:col-span-2 -mt-1 flex flex-wrap items-center gap-3 rounded-xl border border-[#c98a2e]/35 bg-[#c98a2e]/[0.06] px-3 py-2">
                  <span className="text-xs text-foreground/70">
                    O total está escrito à mão e difere da soma das linhas em{" "}
                    <strong className="font-semibold">{eur(Math.abs(desvio.diferenca))}</strong>.
                  </span>
                  {/**
                   * O BOTÃO ESCREVE A SOMA COM OS ADICIONAIS, e não a soma das
                   * linhas que está escrita ao lado.
                   *
                   * O campo onde ele escreve é o TOTAL, e o total desta casa
                   * inclui os valores adicionais — é o que o `definirExtras`
                   * faz quando se acrescenta uma deslocação, e é o que o PDF
                   * confirma ao subtrai-los para imprimir a linha «Valor
                   * Total». Escrever aqui a soma dos serviços apagava a
                   * deslocação do preço final e, com ela, do sinal e da
                   * factura que sai a seguir.
                   *
                   * E por isso o rótulo mostra o número que vai mesmo ser
                   * escrito: um botão que diz 75 € e escreve 2460 € é pior do
                   * que não haver botão nenhum.
                   *
                   * ── E PERGUNTA ANTES DE ESCREVER ─────────────────────────
                   * Palavras dela: «é um botão perigoso». Escrevia o número
                   * novo por cima do preço final — o valor de que saem a
                   * fatura, o sinal e o saldo — sem mostrar o que ia
                   * desaparecer. A pergunta traz OS DOIS, e depois de aplicada
                   * ficam dez segundos para a anular. Ver
                   * `pedirConfirmacaoDeDinheiro`.
                   */}
                  <button
                    type="button"
                    className="alvo-toque -my-1 py-2 text-xs font-medium text-[#4d6350] underline-offset-2 hover:underline"
                    onClick={() =>
                      pedirConfirmacaoDeDinheiro({
                        oQue: "o total",
                        de: money.base,
                        para: desvio.sugerido,
                        registo: `Total alinhado com a soma das linhas no estúdio: preço final de ${eur(money.base)} para ${eur(desvio.sugerido)}.`,
                        motivo: "Total alinhado com a soma das linhas.",
                        aplicar: () => {
                          confirmado("totalAmount");
                          onTotalInput(textoDoTotal(desvio.sugerido));
                        },
                      })
                    }
                  >
                    Usar {eur(desvio.sugerido)}
                  </button>
                </div>
              )}
              {/* ══════════════════════════════════════════════════════════════
                  O SELECTOR DO IVA — UM SÓ, E O ESCOLHIDO É O QUE DÁ NAS VISTAS
                  ══════════════════════════════════════════════════════════════

                  Eram duas coisas: um selector de dois botões e, por baixo, dois
                  cartões com as mesmas duas leituras. Palavras dela: «o selector
                  tem o não-seleccionado mais visível do que o seleccionado».
                  Tinha — o segmento escolhido ficava BRANCO sobre um cartão que
                  também é branco (é assim que o `Segmented` do back office
                  marca a escolha, e funciona sobre fundos lavados, não sobre
                  este), enquanto o outro ficava recortado na calha cinzenta.

                  Passou a haver UM controlo: os dois cartões É que se carregam.
                  O escolhido leva moldura de dois pixéis, fundo de musgo, texto
                  a cheio e a palavra «escolhido»; o outro é uma linha fina e
                  cinzenta. Não há como trocá-los, e desaparece a repetição —
                  eram dois sítios a dizer «IVA incluído» a um palmo um do outro.

                  `radiogroup` + `radio` e não botões: é o que faz as setas
                  andarem entre as duas opções e o leitor de ecrã anunciar «1 de
                  2, escolhido». A marca nunca é só a cor (moldura, negrito e
                  palavra), como manda o `DESIGN-TOKENS.md`. */}
              <div className="flex flex-col gap-1.5">
                <span className="bo-eyebrow">IVA</span>
                <div
                  role="radiogroup"
                  aria-label="Modo de IVA"
                  className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2"
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    e.preventDefault();
                    setVatMode(vatMode === "acrescer" ? "incluido" : "acrescer");
                  }}
                >
                  {(["acrescer", "incluido"] as const).map((modo) => {
                    const v = duasFormas[modo];
                    const ativa = vatMode === modo;
                    return (
                      <button
                        key={modo}
                        type="button"
                        role="radio"
                        aria-checked={ativa}
                        tabIndex={ativa ? 0 : -1}
                        onClick={() => setVatMode(modo)}
                        className={`alvo-toque !justify-start rounded-xl border px-3 py-2.5 text-left motion-safe:transition-colors ${
                          ativa
                            ? "border-2 border-[#4d6350] bg-[#4d6350]/[0.09] text-foreground/90"
                            : "border border-foreground/12 text-foreground/45 hover:border-foreground/25 hover:text-foreground/65"
                        }`}
                      >
                        <span className="block">
                          <span className={`block ${ativa ? "font-semibold" : "font-medium"}`}>
                            {modo === "acrescer" ? "+ IVA (acresce)" : "IVA incluído"}
                            {ativa && " · escolhido"}
                          </span>
                          {money.base > 0 && (
                            <>
                              <span className="mt-0.5 block">
                                base {eur(v.base)} · IVA {eur(v.iva)}
                              </span>
                              <span className="block">
                                o cliente paga{" "}
                                <strong className="font-semibold">{eur(v.total)}</strong>
                              </span>
                            </>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs leading-relaxed text-foreground/45">
                  Muda o que o cliente vê no PDF: «+ IVA» mostra o valor e soma o IVA por cima;
                  «incluído» mostra já a soma. O valor acima é sempre sem IVA.
                </p>
              </div>
              <Field
                label="Validade (dias)"
                type="number"
                min={1}
                value={doc.validUntilDays ?? ""}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  patch({ validUntilDays: Number.isFinite(n) && n > 0 ? n : undefined });
                }}
                placeholder={String(DEFAULT_VALID_DAYS)}
                aria-label="Dias de validade"
                hint={
                  doc.validUntilDays ? (
                    <button
                      type="button"
                      /* `alvo-toque` + `py-2`: media 18 px de altura. Foi o CI
                         a apanhá-lo e não a máquina de quem escreveu — só
                         aparece quando a proposta tem uma validade diferente da
                         preferida, e os dados locais não a tinham. */
                      className="alvo-toque -my-1 py-2 text-[11px] text-[#4d6350] underline-offset-2 hover:underline"
                      onClick={() => void guardarValidadePadrao(doc.validUntilDays!)}
                    >
                      Passar a usar {doc.validUntilDays} dias em todas as propostas novas
                    </button>
                  ) : undefined
                }
              />
            </div>
            {/* ══════════════════════════════════════════════════════════════
                O BLOCO DE TOTAIS — UM SÓ, PELA ORDEM DO PAPEL
                ══════════════════════════════════════════════════════════════

                Substitui as três somas que apareciam ao mesmo tempo («Soma das
                linhas», «Somado ao total» e o resumo desta caixa) e segue a
                ordem exacta em que o PDF as imprime: subtotal dos serviços →
                valores adicionais → total sem IVA → IVA → total a pagar →
                sinal e saldo.

                Os números NÃO são calculados aqui. Saem de `totais`, que é
                `totaisDaProposta(doc, pctSinal)` — a mesma chamada que
                `proposal-doc-pdf.ts` faz. É essa a razão de este bloco existir
                assim: enquanto o ecrã tivesse a sua conta e o gerador a dele,
                divergiam, e já divergiram (ver `proposal-budget.ts`). */}
            {money.gross > 0 && (
              <div className="mt-5 rounded-2xl border border-foreground/10 bg-foreground/[0.015] p-4">
                <span className="bo-eyebrow">Totais</span>
                <dl className="mt-2.5 flex flex-col gap-1.5 text-xs">
                  <LinhaDeTotal rotulo="Subtotal dos serviços" valor={eur(totais.servicos)} />
                  <LinhaDeTotal rotulo="Valores adicionais" valor={eur(totais.adicionais)} />
                  {/* A régua separa as parcelas dos resultados: é a mesma
                      leitura que a folha em papel dá, e sem ela as seis linhas
                      lêem-se como uma lista em que tudo tem o mesmo peso. */}
                  <LinhaDeTotal rotulo="Total sem IVA" valor={eur(totais.total)} forte regua />
                  <LinhaDeTotal
                    rotulo={`IVA (${Math.round(totais.taxa * 100)}%)`}
                    valor={eur(totais.iva)}
                  />
                  <LinhaDeTotal rotulo="Total a pagar" valor={eur(totais.aPagar)} forte />
                  <LinhaDeTotal
                    regua
                    rotulo={
                      <span className="inline-flex items-center gap-1">
                        Sinal
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={pctSinal}
                          onChange={(e) => {
                            const n = Number.parseInt(e.target.value, 10);
                            patch({ depositPercent: Number.isFinite(n) ? n : undefined });
                          }}
                          aria-label="Percentagem do sinal"
                          className="bo-input w-16 px-1.5 py-0.5 text-center text-xs"
                        />
                        %
                      </span>
                    }
                    valor={eur(totais.sinal)}
                  />
                  <LinhaDeTotal rotulo={`Saldo ${100 - pctSinal}%`} valor={eur(totais.saldo)} />
                </dl>
                {/* ── A BASE, DITA AQUI TAMBÉM ──────────────────────────────
                    A mesma frase que o PDF imprime no faseamento. Está aqui
                    porque é aqui que ela mexe na percentagem: com o cursor
                    dentro da caixa, «30%» de que é a pergunta óbvia, e a
                    resposta não pode obrigar a abrir o PDF para a confirmar. */}
                <p className="mt-2.5 text-[11px] leading-relaxed text-foreground/45">
                  Sinal e saldo são calculados sobre o total a pagar ({eur(totais.aPagar)}), com IVA
                  incluído — é essa a base que a factura usa.
                </p>
                {/* ── QUANDO AS SOMAS NÃO FECHAM ────────────────────────────
                    Por construção fecham sempre. Este aviso é a rede para o dia
                    em que deixarem de fechar — e nesse dia tem de se ver antes
                    de o PDF sair, não depois de o casal perguntar. As frases
                    vêm feitas de `totaisDaProposta`. */}
                {!totais.fecha && (
                  <ul className="mt-3 flex flex-col gap-1 rounded-xl border border-[#c0392b]/35 bg-[#c0392b]/[0.06] px-3 py-2 text-[11px] leading-relaxed text-[#a03123]">
                    {totais.porQueNaoFecha.map((porque) => (
                      <li key={porque}>⚠ As contas não fecham: {porque}.</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Section>
        </div>
      </div>
      {/* ══════════ /PASSO 1 ══════════ */}

      {/* ══════════ PASSO 2 · Pré-visualizar ══════════ */}
      {/* Only mount the preview while it's the active step. It was previously
          kept mounted (just `hidden`), so its filter/map over every service
          group + budget line re-ran on EVERY keystroke in the content step —
          the main source of typing lag on large proposals. */}
      {step === "prever" && (
        <div>
          <PreviewSummary
            doc={doc}
            assetUrls={assetUrls}
            assetOriginais={assetOriginais}
            money={money}
            split={split}
            pctSinal={pctSinal}
          />
        </div>
      )}

      {/* ══════════ PASSO 3 · Enviar ══════════ */}
      <div hidden={step !== "enviar"}>
        <Section title="Enviar ao cliente">
          {sent ? (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#4d6350]/25 bg-[#4d6350]/[0.06] p-5">
              <p className="flex items-center gap-2 font-display text-base text-[#4d6350]">
                <span aria-hidden="true">✓</span> Proposta enviada
              </p>
              <p className="text-sm leading-relaxed text-foreground/60">
                A proposta foi gerada e enviada para {quote.email || "o cliente"}. Não precisas de
                fazer mais nada.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSent(false);
                  setConfirmSend(false);
                }}
              >
                Enviar de novo / nova revisão
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-foreground/60">
                Confirma os dados abaixo. Ao enviar, o cliente recebe a proposta em PDF por email.
              </p>
              {/* ── SEM DESTINATÁRIO, DIZ-SE AQUI E NÃO DEPOIS ──────────────
                  Um pedido que entrou por telefone não tem email. Até aqui só
                  se sabia DEPOIS de carregar em Enviar: a proposta ficava
                  gravada, o email não saía, e o aviso vinha a seguir ao gesto.

                  Agora está antes do dedo, e diz ONDE se resolve — no painel do
                  pedido, que passou a deixar corrigir os contactos. */}
              {!emailDoCliente && (
                <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-[#c98a2e]/35 bg-[#c98a2e]/[0.06] px-3 py-2 text-xs leading-relaxed text-foreground/70">
                  <span aria-hidden="true">⚠</span>
                  <span>
                    Este pedido não tem email de cliente. A proposta é gravada e o link continua a
                    servir, mas não segue para ninguém — acrescenta o email nos{" "}
                    <strong className="font-medium">contactos do pedido</strong>, em Detalhes.
                  </span>
                </p>
              )}
              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <SummaryRow label="Para" value={quote.email || "—"} />
                <SummaryRow label="Clientes" value={doc.clientNames || "—"} />
                <SummaryRow
                  label="Total (com IVA)"
                  value={money.gross > 0 ? eur(money.gross) : "—"}
                />
                {/* A percentagem é a do DOCUMENTO e não um «30%» à letra: uma
                    proposta a 40% dizia aqui 30% e mostrava o valor de 40%. */}
                <SummaryRow
                  label={`Sinal ${pctSinal}%`}
                  value={money.gross > 0 ? eur(split.sinal) : "—"}
                />
              </dl>
              {/* As fotos a caminho têm a sua própria linha, e não a genérica
                  dos campos por preencher: aqui não há nada a fazer senão
                  esperar uns segundos — dizer-lhe para "preencher" seria
                  mandá-la procurar um campo que está bem. */}
              {fotosPorConfirmar > 0 && (
                <p
                  aria-live="polite"
                  className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-[#b5654a]"
                >
                  <span aria-hidden="true">⏳</span>
                  <span>
                    {fotosPorConfirmar === 1
                      ? "1 foto ainda está a entrar na proposta."
                      : `${fotosPorConfirmar} fotos ainda estão a entrar na proposta.`}{" "}
                    O envio fica disponível mal ela assente — assim a proposta segue completa.
                  </span>
                </p>
              )}
              {/* A PASSAGEM DE OLHOS. Depois do resumo (que diz o que vai
                  seguir) e antes do botão (que o torna irreversível). */}
              <Conferencia
                doc={doc as ProposalDoc}
                quote={quote}
                quotes={quotes}
                totalBruto={money.gross}
              />
              {/* Os acentos que faltam nos campos que saem impressos. Aqui, ao
                  pé da Conferência, e não a meio de escrever: a palavra ainda
                  está a ser escrita quando o aviso apareceria. */}
              <Gralhas
                doc={doc as ProposalDoc}
                onCorrigir={(g) => setDoc((d) => corrigirGralha(d, g))}
                onIr={(g) => irParaCampo(g.campo)}
                onCorrigirTudo={() => {
                  const quantas = gralhasDoDocumento(doc as ProposalDoc).length;
                  setDoc((d) => corrigirTudo(d));
                  toast(
                    quantas === 1 ? "1 palavra corrigida." : `${quantas} palavras corrigidas.`,
                    "info",
                  );
                }}
              />
              {/* ── O QUE JÁ SEGUIU ────────────────────────────────────────
                  Depois da conferência (que olha para ESTA proposta) e antes
                  do botão: é aqui que a pergunta "o que é que eles vão ver de
                  diferente?" se faz, com o dedo já a caminho do Enviar.

                  O `key` muda quando se envia — assim o painel volta a ler o
                  histórico e a proposta que acabou de sair aparece nele, em vez
                  de ficar com a lista de antes do envio. */}
              <Versoes
                key={String(sent)}
                quoteId={quote.id}
                doc={doc as ProposalDoc}
                onRestaurar={restaurarVersao}
              />
              {!canSend && fotosPorConfirmar === 0 && (
                <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-[#b5654a]">
                  <span aria-hidden="true">⚠</span>
                  <span>
                    Preenche clientes, referência e um total maior que 0 (no passo «Conteúdo») antes
                    de enviar.
                  </span>
                </p>
              )}
            </>
          )}
        </Section>
      </div>

      {/* Ação principal — muda conforme o passo, para haver sempre UMA próxima
          ação óbvia. */}
      <div
        ref={barraDeBaixo}
        // `z-20` não é enfeite: sem ele os cartões das secções — que criam o seu
        // próprio contexto de empilhamento — desenham-se POR CIMA desta barra, e o
        // texto do total aparecia misturado com o do campo por baixo. Vê-se na
        // captura de ecrã antes desta linha existir; nenhum teste apanhava.
        /* A barra encosta ao fundo do CONTEÚDO, mas por baixo dela ainda vem a
           barra de navegação do back office (56 px, fixa, só abaixo de `lg`).
           Com `bottom-0` a acção principal — "Pré-visualizar", "Enviar" —
           ficava por baixo dela: tocar ali tocava na navegação e mudava de
           vista. Foi o cheque de oclusão a apanhá-lo; à vista não se distingue
           de um toque que não pegou.
           A partir de `lg` a navegação passa a barra lateral e a folga deixa de
           fazer sentido. */
        className="sticky bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 -mx-1 mt-2 flex items-center gap-2 border-t border-foreground/10 bg-[var(--bo-surface,#ffffff)] px-1 py-2.5 shadow-[0_-8px_16px_-12px_rgba(42,38,32,0.25)] sm:flex-wrap sm:py-3 lg:bottom-0"
      >
        {step === "conteudo" && (
          <>
            {/* O TOTAL SEMPRE À VISTA.
                Palavras dela: «não quero fazer scroll para saber quanto vai a
                proposta». O valor vive cinco ecrãs abaixo do sítio onde ela
                está a escrever os serviços; aqui acompanha-a por toda a
                página, e muda enquanto ela escreve. */}
            {/* UMA LINHA NO TELEMÓVEL.
                Esta barra é fixa, e por baixo dela ainda vem a barra de
                navegação e a do Safari. O texto completo ("Total 3000,00 € sem
                IVA · o cliente paga 3690,00 € · guardado às 12:34") embrulhava
                para três linhas e comia o pouco ecrã que sobrava.

                O que fica no telemóvel é só o número que decide — o que o
                CLIENTE paga —, e o resto do detalhe volta a partir de `sm`.
                O "guardado às 12:34" vira um visto: é uma confirmação, e um
                visto confirma tão bem como a frase, num décimo do espaço.
                A hora continua lá para quem a procurar, no `title`. */}
            {/* ── SÓ O ESSENCIAL ───────────────────────────────────────────
                Havia aqui uma TERCEIRA soma — «soma das linhas: 2.400,00 €»
                numa etiqueta cor de laranja — ao lado de um total de 2.460,00 €
                e de um «o cliente paga 3.025,80 €». Três números diferentes na
                mesma linha de rodapé, e nenhum deles a explicar-se: a barra
                existe para responder a «quanto vai a proposta», não para abrir
                a discussão que o bloco de totais já resolve.
                Ficam o total sem IVA, o total a pagar e o estado de guardado. */}
            <p className="mr-auto min-w-0 truncate text-xs text-foreground/55">
              {money.base > 0 ? (
                <>
                  <span className="text-foreground/45">Total</span>{" "}
                  <strong className="font-semibold text-foreground/85">
                    <span className="sm:hidden">{eur(totais.aPagar)}</span>
                    <span className="hidden sm:inline">{eur(totais.total)}</span>
                  </strong>{" "}
                  <span className="hidden text-foreground/45 sm:inline">
                    sem IVA · a pagar {eur(totais.aPagar)}
                  </span>
                </>
              ) : (
                <span className="hidden sm:inline">
                  Preenche o conteúdo e avança para pré-visualizar.
                </span>
              )}
              {(gravadoEm || porGravar || soNesteComputador) &&
                (() => {
                  const estado: EstadoDaGravacaoNoEcra =
                    porGravar || aGravarNoServidor > 0
                      ? "a-guardar"
                      : soNesteComputador
                        ? "so-neste-computador"
                        : "guardado";
                  const t = textoDaGravacao(estado, gravadoEm);
                  const alarme = estado === "so-neste-computador";
                  return (
                    <span
                      // O aviso não pode ter o cinzento discreto dos outros dois:
                      // este é para dar nas vistas, e o `aria-live` faz com que
                      // também seja anunciado a quem não olha para aqui.
                      className={
                        alarme
                          ? "ml-2 rounded-full bg-[#c0392b]/12 px-2 py-0.5 text-[11px] font-semibold text-[#a03123]"
                          : "ml-2 text-[11px] text-foreground/35"
                      }
                      aria-live={alarme ? "assertive" : "polite"}
                      title={
                        alarme && soNesteComputador?.porque
                          ? `${t.longo} — ${soNesteComputador.porque}`
                          : t.longo
                      }
                    >
                      {/* No telemóvel os outros dois estados são um glifo; este
                          NÃO, e é de propósito: um triângulo sozinho não avisa
                          de nada. */}
                      <span aria-hidden className="sm:hidden">
                        {t.curto}
                      </span>
                      <span className="hidden sm:inline">{t.longo}</span>
                      {/* O visto sozinho não diz nada a quem usa leitor de ecrã. */}
                      <span className="sr-only">{t.leitor}</span>
                    </span>
                  );
                })()}
            </p>
            {/* ══════════════════════════════════════════════════════════════
                O «GUARDAR AGORA» SAIU — MENOS NO ÚNICO CASO EM QUE ERA A ÚNICA
                MANEIRA DE GRAVAR
                ══════════════════════════════════════════════════════════════

                Palavras dela: «"Guardar agora" ao lado de "Tudo guardado" é
                redundante e contraditório». É, e a gravação automática cobre
                MESMO o que o botão cobria — não é uma suposição: `guardarAgora`
                chama `flushDraft.current()`, que é exactamente a mesma função
                `save` que o temporizador de 800 ms chama. Botão e automático
                gravavam pelo mesmo caminho, com as mesmas regras. Além disso a
                desmontagem grava o que faltasse, e o registo do back office
                trava a saída da página com trabalho por gravar.

                ── O CASO EM QUE O BOTÃO NÃO ERA REDUNDANTE ──────────────────
                Quando o servidor RECUSA: a cópia local é síncrona e apaga o
                «por gravar», e o temporizador só volta a correr à tecla
                seguinte. Nesse estado — o mesmo em que uma proposta inteira já
                se perdeu — carregar aqui era a única forma de voltar a tentar.
                Tirar o botão por inteiro era tirar isso.

                Por isso ele fica, mas SÓ nesse estado, e com o nome do que faz
                nele: «Tentar guardar outra vez». Ao lado de «Tudo guardado» já
                não há botão nenhum — há o indicador, e mais nada. O ⌘S continua
                a valer sempre, para quem se levanta da secretária e quer a
                certeza sem esperar pelos 800 ms. */}
            {soNesteComputador && (
              <Button
                variant="secondary"
                onClick={guardarAgora}
                loading={aGuardarAgora}
                title="Tentar guardar outra vez no servidor (⌘S)"
              >
                Tentar outra vez
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => setStep("prever")}
              iconRight={<span aria-hidden="true">→</span>}
            >
              Pré-visualizar
            </Button>
          </>
        )}

        {step === "prever" && (
          <>
            <Button variant="ghost" onClick={() => setStep("conteudo")}>
              ← Conteúdo
            </Button>
            <Button
              variant="secondary"
              onClick={preview}
              disabled={busy !== null}
              loading={busy === "preview"}
              className="ml-auto"
            >
              {busy === "preview" ? "A gerar…" : "Descarregar PDF"}
            </Button>
            <Button
              variant="primary"
              onClick={() => setStep("enviar")}
              iconRight={<span aria-hidden="true">→</span>}
            >
              Rever e enviar
            </Button>
          </>
        )}

        {step === "enviar" && !sent && (
          <>
            <Button variant="ghost" onClick={() => setStep("prever")}>
              ← Pré-visualizar
            </Button>
            {confirmSend ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-sm text-foreground/60">
                  Enviar para {quote.email || "o cliente"}?
                </span>
                <Button
                  variant="primary"
                  onClick={send}
                  disabled={busy !== null}
                  loading={busy === "send"}
                >
                  {busy === "send" ? "A enviar…" : "Confirmar"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmSend(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                onClick={() => setConfirmSend(true)}
                disabled={busy !== null || !canSend}
                title={
                  canSend
                    ? undefined
                    : fotosPorConfirmar > 0
                      ? "Há fotos ainda a entrar na proposta. Falta pouco."
                      : "Preenche clientes, referência e um total maior que 0 antes de enviar."
                }
                iconRight={<span aria-hidden="true">→</span>}
                className="ml-auto"
              >
                Gerar e enviar ao cliente
              </Button>
            )}
          </>
        )}

        {step === "enviar" && sent && (
          <Button variant="ghost" onClick={() => setStep("conteudo")}>
            ← Voltar ao conteúdo
          </Button>
        )}
      </div>

      {/* A fotografia em grande, com as setas a percorrer as deste board. */}
      {lupa && (
        <LupaDeFotos
          aberta
          titulo={doc.moodBoards[lupa.bi]?.title ?? ""}
          urls={(doc.moodBoards[lupa.bi]?.images ?? []).map(
            (p) => assetOriginais[p] ?? assetUrls[p],
          )}
          indice={lupa.ii}
          onFechar={() => setLupa(null)}
          onMudar={(ii) => setLupa((l) => (l ? { ...l, ii } : l))}
        />
      )}

      {picker && (
        <ThemePicker
          quoteId={quote.id}
          // A trocar UMA foto no lugar, escolher várias não faz sentido: as
          // outras iriam para o fim e a troca deixava de ser uma troca.
          multiple={picker.kind === "board" && picker.substituir === undefined}
          usedThemePaths={usedThemePaths}
          usadasNoutras={usadasNoutras}
          onClose={() => setPicker(null)}
          onPicked={onPickedFromLibrary}
          onReserve={onReservedFromLibrary}
          onDropped={onDroppedFromLibrary}
        />
      )}
    </div>
  );
}

// ── Small presentational helpers ──

/**
 * Onde ficam guardadas as secções fechadas.
 *
 * Por DISPOSITIVO e não no documento: fechar o «Cronograma» é uma preferência
 * de quem está a trabalhar, não uma propriedade da proposta. Guardá-la no
 * documento fazia com que abrir a proposta noutro computador herdasse as
 * dobras de outra pessoa — e, pior, fazia uma alteração de disposição contar
 * como alteração por gravar.
 */
const SECOES_KEY = "liquen-estudio-secoes";

/**
 * As dobras dos mood boards, por PROPOSTA e por dispositivo.
 *
 * Chave própria (e não a das secções) porque isto é por proposta: as dobras de
 * um casamento não dizem nada sobre as do seguinte. Guardado por `quote.id` +
 * id do board — ver `withMoodBoardIds`.
 */
/**
 * As páginas que uma proposta tem SEM contar com a inspiração.
 *
 * MEDIDO, não estimado: gerou-se o PDF de um documento com 0, 1 e 3 mood
 * boards e contaram-se as folhas — 7, 8 e 10. Sete fixas, mais uma por página
 * de inspiração.
 *
 * Um texto muito longo (condições reescritas à mão, uma lista de serviços
 * enorme) pode empurrar uma secção para a folha seguinte. Daí o «cerca de» na
 * frase que mostra este número: é um piso honesto, não uma promessa.
 */
const PAGINAS_FIXAS_DO_PDF = 7;

/**
 * A partir de quantas fotos a página começa a ficar apertada.
 *
 * O tecto duro são as `MOOD_BOARD_MAX_IMAGES` (10), acima do qual as fotos
 * deixam de ser impressas e o aviso é vermelho. Este é o degrau ANTES: às oito,
 * a página sai inteira e cada fotografia já é pequena — que é uma decisão de
 * composição e não um erro, e por isso diz-se em voz baixa.
 */
const FOTOS_QUE_ENCHEM_A_PAGINA = 8;

const BOARDS_KEY = "liquen-estudio-boards";

function lerDobrasDeBoards(quoteId: string): Record<string, boolean> {
  try {
    const cru = localStorage.getItem(`${BOARDS_KEY}:${quoteId}`);
    const v = cru ? JSON.parse(cru) : null;
    return v && typeof v === "object" ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function gravarDobrasDeBoards(quoteId: string, dobras: Record<string, boolean>) {
  try {
    localStorage.setItem(`${BOARDS_KEY}:${quoteId}`, JSON.stringify(dobras));
  } catch {
    /* quota / armazenamento desligado — as dobras valem só nesta sessão */
  }
}

function lerFechadas(): Record<string, boolean> {
  try {
    const cru = localStorage.getItem(SECOES_KEY);
    const v = cru ? JSON.parse(cru) : null;
    return v && typeof v === "object" ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/**
 * Uma linha do bloco de totais: o nome à esquerda, o número à direita.
 *
 * `dt`/`dd` e não duas `span`: são pares de rótulo e valor, e é isso que faz um
 * leitor de ecrã ler «Total a pagar, 3.025,80 €» em vez de duas coisas soltas.
 * Os números vão com `tabular-nums` para as vírgulas ficarem uma por baixo da
 * outra — num quadro de dinheiro, colunas desalinhadas leem-se como erros.
 */
function LinhaDeTotal({
  rotulo,
  valor,
  /** O resultado de uma soma, e não uma parcela. */
  forte,
  /** Traço por cima, a separar as parcelas do que elas dão. */
  regua,
}: {
  rotulo: React.ReactNode;
  valor: string;
  forte?: boolean;
  regua?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        regua ? "border-t border-foreground/10 pt-1.5" : ""
      }`}
    >
      <dt className={forte ? "text-foreground/75" : "text-foreground/55"}>{rotulo}</dt>
      <dd
        className={`tabular-nums ${
          forte ? "text-sm font-semibold text-foreground/90" : "text-foreground/70"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ISTO NÃO SAI PELA ORDEM QUE AQUI VÊS» — DITO, E COM SAÍDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Enquanto a ordem vier sugerida pela lista de Serviços, a lista desenhada por
 * baixo NÃO é a ordem em que os campos estão guardados. É a ordem certa — a
 * que sai impressa — mas uma lista que se reordena sozinha sem dizer nada é
 * uma lista em que não se confia.
 *
 * A frase diz o que está a acontecer; o botão dá a saída, que é passar a
 * mandar nela (`ordemExplicita`). Nem sequer é uma acção destrutiva: escreve
 * exactamente a ordem que já está à vista.
 */
/**
 * A fotografia que vai na mão, enquanto se arrasta.
 *
 * Sem isto, arrastar de um board para outro é mover um buraco: a célula de
 * origem esvazia-se e não há nada a acompanhar o cursor até ao destino — o que
 * numa página com oito boards quer dizer largar às cegas.
 */
function FantasmaDaFoto({
  id,
  doc,
  urls,
}: {
  id: string | null;
  doc: StudioDoc;
  urls: Record<string, string>;
}) {
  if (!id) return null;
  const partes = id.split(":");
  if (partes[0] !== "foto") return null;
  const caminho = doc.moodBoards[Number(partes[1])]?.images[Number(partes[2])];
  const url = caminho ? urls[caminho] : undefined;
  return (
    <div className="h-24 w-24 overflow-hidden rounded-lg border border-white/40 bg-foreground/10 shadow-xl">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : null}
    </div>
  );
}

/**
 * A barra do conjunto: «3 fotografias escolhidas → mover para…».
 *
 * Palavras dela: «Também com seleção múltipla, para mover várias de uma vez.»
 * Arrastar uma a uma resolve o engano de uma foto; quando um board inteiro foi
 * parar ao sítio errado — o que acontece ao colar uma pasta da biblioteca —,
 * são vinte gestos.
 *
 * Só aparece quando há alguma coisa escolhida: uma barra permanentemente ali é
 * uma linha de ruído em todas as outras vezes.
 */
function BarraDaSeleccao({
  quantas,
  boards,
  onMover,
  onLimpar,
}: {
  quantas: number;
  boards: StudioDoc["moodBoards"];
  onMover: (paraBoard: number) => void;
  onLimpar: () => void;
}) {
  if (quantas === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#4d6350]/35 bg-[#4d6350]/[0.06] px-3 py-2">
      <p className="text-xs font-medium text-foreground/75">
        {quantas === 1 ? "1 fotografia escolhida" : `${quantas} fotografias escolhidas`}
      </p>
      <label className="flex items-center gap-1.5 text-xs text-foreground/60">
        Mover para
        <select
          // Volta sempre a «—» depois de mover: é uma acção, não um estado, e
          // um selector que ficasse a mostrar o último destino leria como se a
          // selecção ainda lá estivesse.
          value=""
          onChange={(e) => {
            const bi = Number(e.target.value);
            if (Number.isInteger(bi)) onMover(bi);
          }}
          className="bo-input w-44 px-2 py-1 text-xs"
          aria-label="Mover as fotografias escolhidas para outro mood board"
        >
          <option value="">—</option>
          {boards.map((b, bi) => (
            <option key={bi} value={bi}>
              {b.title?.trim() || `Mood board ${bi + 1}`}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onLimpar}
        className="alvo-toque text-xs font-medium text-foreground/55 transition-colors hover:text-foreground/80"
      >
        Limpar
      </button>
    </div>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SE PODE FAZER A UMA FOTOGRAFIA, SEM A TIRAR DE LÁ PRIMEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Antes havia um botão só, o × de remover, e só aparecia ao passar o rato.
 * Num telemóvel — que é onde metade deste trabalho é feito — isso é um botão
 * que não existe; e no computador era a única resposta para «esta foto está no
 * sítio errado», o que fazia de remover a ferramenta para tudo.
 *
 * ── PORQUE É QUE ESTÁ SEMPRE VISÍVEL AO TOQUE ─────────────────────────────
 * `[@media(hover:none)]:opacity-100`. Onde há rato, a barra aparece ao passar
 * por cima e a grelha fica limpa; onde não há, está lá. A alternativa —
 * revelá-la com um toque longo — obrigava a descobrir que o toque longo existe.
 *
 * ── AS SETAS NÃO SÃO UM ADORNO ────────────────────────────────────────────
 * São o caminho do teclado (e do dedo trémulo). Arrastar exige apontar, mover e
 * largar sem falhar; mover uma foto uma casa é um toque, e é o gesto que se faz
 * dez vezes seguidas ao afinar uma página.
 */
function AccoesDaFoto({
  podeRecuar,
  podeAvancar,
  principal,
  seleccionada,
  onRecuar,
  onAvancar,
  onAmpliar,
  onSubstituir,
  onPrincipal,
  onSeleccionar,
  onRemover,
}: {
  podeRecuar: boolean;
  podeAvancar: boolean;
  /** `undefined` = esta disposição não tem lugar de destaque; o botão não aparece. */
  principal?: boolean;
  seleccionada: boolean;
  onRecuar: () => void;
  onAvancar: () => void;
  onAmpliar: () => void;
  onSubstituir: () => void;
  onPrincipal: () => void;
  onSeleccionar: () => void;
  onRemover: () => void;
}) {
  const botao =
    "alvo-toque flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-[11px] leading-none text-white transition-colors hover:bg-black/75 disabled:opacity-30";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-center gap-0.5 p-1 opacity-0 transition-opacity group-hover/foto:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
      <span className="pointer-events-auto flex flex-wrap items-center justify-center gap-0.5">
        <button
          type="button"
          className={botao}
          onClick={onRecuar}
          disabled={!podeRecuar}
          aria-label="Mover para trás"
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          className={botao}
          onClick={onAvancar}
          disabled={!podeAvancar}
          aria-label="Mover para a frente"
        >
          <span aria-hidden="true">→</span>
        </button>
        <button type="button" className={botao} onClick={onAmpliar} aria-label="Ver em grande">
          <span aria-hidden="true">⤢</span>
        </button>
        <button
          type="button"
          className={botao}
          onClick={onSubstituir}
          aria-label="Trocar por outra fotografia"
        >
          <span aria-hidden="true">⇄</span>
        </button>
        {principal !== undefined && (
          <button
            type="button"
            className={`${botao} ${principal ? "bg-[#4d6350]" : ""}`}
            onClick={onPrincipal}
            aria-pressed={principal}
            aria-label={
              principal
                ? "Deixar de ser a fotografia principal"
                : "Fotografia principal desta página"
            }
          >
            <span aria-hidden="true">★</span>
          </button>
        )}
        <button
          type="button"
          className={`${botao} ${seleccionada ? "bg-[#4d6350]" : ""}`}
          onClick={onSeleccionar}
          aria-pressed={seleccionada}
          aria-label={seleccionada ? "Retirar da selecção" : "Escolher para mover em conjunto"}
        >
          <span aria-hidden="true">✓</span>
        </button>
        <button
          type="button"
          className={`${botao} hover:bg-[#8a2a22]`}
          onClick={onRemover}
          aria-label="Remover fotografia"
        >
          <span aria-hidden="true">×</span>
        </button>
      </span>
    </div>
  );
}

function AvisoDeOrdem({
  mostrar,
  onde,
  onFixar,
}: {
  mostrar: boolean;
  /** «As linhas do orçamento», «As páginas de inspiração». */
  onde: string;
  onFixar: () => void;
}) {
  if (!mostrar) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2">
      <p className="min-w-[16rem] flex-1 text-[11px] leading-relaxed text-foreground/55">
        {onde} estão pela ordem da lista de <strong className="font-medium">Serviços</strong>, que é
        a ordem por que o PDF sai — e não pela ordem em que foram escritas. Arruma os Serviços e
        isto acompanha.
      </p>
      <button
        type="button"
        onClick={onFixar}
        className="alvo-toque shrink-0 rounded-lg border border-foreground/15 px-2.5 py-1 text-[11px] font-medium text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground/90"
      >
        Arrumar eu
      </button>
    </div>
  );
}

function Section({
  title,
  children,
  /** Chave estável para lembrar a dobra. Sem ela a secção não colapsa. */
  id,
  /** Marca à direita do título — "3 linhas", "por preencher". */
  nota,
  /** Um controlo à direita do título — o "Reordenar" dos Serviços, por
   *  exemplo. Fica FORA do botão que dobra a secção: um botão dentro de outro
   *  botão não é HTML válido, e clicar num fecharia o outro. */
  accao,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
  nota?: string;
  accao?: React.ReactNode;
}) {
  const [fechada, setFechada] = useState(false);
  // Ler no efeito e não no `useState` inicial: o servidor não tem
  // `localStorage`, e uma diferença entre o que o servidor desenha e o que o
  // browser desenha dá um erro de hidratação.
  useEffect(() => {
    if (id) setFechada(!!lerFechadas()[id]);
  }, [id]);

  function alternar() {
    if (!id) return;
    const proxima = !fechada;
    setFechada(proxima);
    try {
      localStorage.setItem(SECOES_KEY, JSON.stringify({ ...lerFechadas(), [id]: proxima }));
    } catch {
      /* sem localStorage a dobra não sobrevive à sessão; o resto funciona */
    }
  }

  const corpoId = id ? `sec-${id}` : undefined;
  return (
    <Card className="mb-4" id={id ? `seccao-${id}` : undefined}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        {id ? (
          <button
            type="button"
            onClick={alternar}
            aria-expanded={!fechada}
            aria-controls={corpoId}
            /* `alvo-toque` + `py-2`: o cabeçalho de uma secção É o interruptor
               que a abre e fecha, e media 20 px de altura — metade do mínimo de
               44. Num telemóvel, abrir "Serviços" era acertar numa faixa da
               espessura de uma linha de texto. O `items-baseline` mantém-se para
               a seta e o título continuarem alinhados pela base. */
            className="alvo-toque group -my-1 flex items-baseline gap-2 py-2 text-left"
          >
            <span
              aria-hidden
              className={`text-[10px] text-foreground/35 transition-transform ${fechada ? "" : "rotate-90"}`}
            >
              ▶
            </span>
            <h3 className="font-display text-base leading-tight text-foreground/90 group-hover:text-foreground">
              {title}
            </h3>
          </button>
        ) : (
          <h3 className="font-display text-base leading-tight text-foreground/90">{title}</h3>
        )}
        {nota && <span className="shrink-0 text-xs text-foreground/45">{nota}</span>}
        {accao && <div className="shrink-0">{accao}</div>}
      </div>
      {/* `hidden` e não desmontar: uma secção fechada continua a ter os campos
          no formulário, e fechá-la não pode apagar o que lá está escrito. */}
      <div id={corpoId} hidden={fechada}>
        {children}
      </div>
    </Card>
  );
}

/** Indicador de passos "1 · Conteúdo → 2 · Pré-visualizar → 3 · Enviar". */
function StepNav({
  step,
  onSelect,
  sent,
}: {
  step: Step;
  onSelect: (s: Step) => void;
  sent: boolean;
}) {
  return (
    <nav aria-label="Passos da proposta" className="mb-5 flex flex-wrap items-center gap-1.5">
      {STEPS.map((s, i) => {
        const active = s.id === step;
        return (
          <Fragment key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              aria-current={active ? "step" : undefined}
              className={`alvo-toque gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-xs font-medium motion-safe:transition-colors inline-flex items-center ${
                active
                  ? "bg-[#4d6350] text-white"
                  : "text-foreground/50 hover:bg-foreground/[0.05] hover:text-foreground/80"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  active ? "bg-white/25 text-white" : "bg-foreground/[0.08] text-foreground/50"
                }`}
              >
                {sent && s.id === "enviar" ? "✓" : s.n}
              </span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && (
              <span aria-hidden="true" className="text-foreground/20">
                →
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

/** Linha "rótulo → valor" para os resumos (pré-visualização e envio). */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-foreground/[0.06] pb-1.5">
      <dt className="text-foreground/45">{label}</dt>
      <dd className="text-right text-foreground/85">{value}</dd>
    </div>
  );
}

/** Miniatura só de leitura (sem botão de remover) para o resumo. */
function PreviewThumb({
  url,
  planoB,
  pendente = false,
}: {
  url?: string;
  /** O ORIGINAL, para quando a miniatura não existir. */
  planoB?: string;
  pendente?: boolean;
}) {
  const { alvo, desistiu: failed, aoFalhar } = useFotoComPlanoB(url, planoB);
  return (
    <div
      aria-busy={pendente || undefined}
      className={`aspect-[4/3] overflow-hidden rounded-lg border border-foreground/[0.1] bg-foreground/[0.04] ${
        pendente ? "opacity-45" : ""
      }`}
    >
      {alvo && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={alvo}
          alt=""
          // Cada célula puxa o ORIGINAL — medido, 1130 KB por foto para uma
          // caixa de 174 px (ver IMAGES-BEFORE.md). Enquanto as propostas não
          // tiverem miniaturas próprias, `lazy` é o que impede as células fora
          // do ecrã de disputarem a ligação com as que estão à vista: sem isto
          // a primeira imagem só terminava aos 35 s em 4G, porque esperava
          // pelas outras vinte e três.
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={aoFalhar}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.15em] text-foreground/30">
          Imagem
        </div>
      )}
    </div>
  );
}

/** Resumo em página: a "forma" da proposta (capa, serviços, total sem IVA/IVA/
 *  com IVA, sinal/saldo) sem ter de descarregar o PDF. */
function PreviewSummary({
  doc,
  assetUrls,
  assetOriginais,
  money,
  split,
  pctSinal,
}: {
  doc: StudioDoc;
  assetUrls: Record<string, string>;
  /** O ORIGINAL de cada foto — o plano B das células. */
  assetOriginais: Record<string, string>;
  money: ReturnType<typeof resolveProposalMoney>;
  /** O sinal e o saldo, tal como `totaisDaProposta` os devolve. */
  split: { sinal: number; saldo: number };
  /** A percentagem do sinal DESTA proposta (`depositPercentOf`), não um 30 fixo. */
  pctSinal: number;
}) {
  const covers = (doc.coverImages ?? []).filter(Boolean) as string[];
  const groups = doc.serviceGroups.filter((g) => (g.title ?? "").trim() || g.items.length > 0);
  const extras = (doc.budgetExtras ?? []).filter(
    (e) => (e.label ?? "").trim() || (e.valueText ?? "").trim(),
  );
  /** Calculado aqui e não recebido: este resumo só conhece o documento. */
  const fotosPorConfirmar = countPendingImages(doc);
  return (
    <Section title="Resumo da proposta">
      <p className="-mt-2 mb-4 text-sm leading-relaxed text-foreground/55">
        Esta é a forma da proposta que o cliente vai receber. Para o documento completo, usa
        «Descarregar PDF».
      </p>

      {/* O resumo mostra as fotos a caminho esbatidas; dizer quantas são evita
          que um PDF gerado agora — que não as leva — pareça um erro. */}
      {fotosPorConfirmar > 0 && (
        <p aria-live="polite" className="-mt-2 mb-4 text-sm leading-relaxed text-[#b5654a]">
          {fotosPorConfirmar === 1
            ? "1 foto ainda está a entrar na proposta e não entra num PDF gerado agora."
            : `${fotosPorConfirmar} fotos ainda estão a entrar na proposta e não entram num PDF gerado agora.`}
        </p>
      )}

      {covers.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          {covers.map((path, i) => (
            <PreviewThumb
              key={i}
              url={assetUrls[path]}
              planoB={assetOriginais[path]}
              pendente={isPendingImage(path)}
            />
          ))}
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <SummaryRow label="Clientes" value={doc.clientNames || "—"} />
        <SummaryRow label="Tipo de evento" value={doc.eventType || "—"} />
        <SummaryRow label="Data" value={doc.eventDate || "—"} />
        <SummaryRow label="Local" value={doc.location || "—"} />
        {doc.guests ? <SummaryRow label="Convidados" value={doc.guests} /> : null}
      </dl>

      {groups.length > 0 && (
        <div className="mt-5">
          <p className="bo-eyebrow mb-2">Serviços</p>
          <ul className="flex flex-col gap-1 text-sm text-foreground/75">
            {groups.map((g, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-foreground/40">{g.letter || `${i + 1}.`}</span>
                <span>
                  {g.title || "(sem título)"}
                  {g.items.length > 0 && (
                    <span className="text-foreground/40">
                      {" "}
                      · {g.items.length} {g.items.length === 1 ? "item" : "itens"}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {extras.length > 0 && (
        <div className="mt-5">
          <p className="bo-eyebrow mb-2">Valores adicionais</p>
          <ul className="flex flex-col gap-1 text-sm text-foreground/75">
            {extras.map((e, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <span>{e.label || "—"}</span>
                <span className="text-foreground/55">{e.valueText || "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4">
        {money.gross > 0 ? (
          <dl className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/50">Sem IVA</dt>
              <dd className="text-foreground/80">{eur(money.base)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/50">IVA ({Math.round(money.vatRate * 100)}%)</dt>
              <dd className="text-foreground/80">{eur(money.vat)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-foreground/[0.08] pt-1.5">
              <dt className="font-medium text-foreground/70">Com IVA</dt>
              <dd className="font-display text-base text-foreground/90">{eur(money.gross)}</dd>
            </div>
            {/* A PERCENTAGEM É A DO DOCUMENTO. Este resumo dizia «Sinal 30%»
                escrito à letra ao lado do valor certo: numa proposta a 40%
                mostrava 30% e o número de 40% — o mesmo defeito que o PDF e o
                portal já tinham corrigido, deixado para trás aqui. */}
            <div className="mt-1 flex items-baseline justify-between text-xs text-foreground/50">
              <dt>Sinal {pctSinal}%</dt>
              <dd>{eur(split.sinal)}</dd>
            </div>
            <div className="flex items-baseline justify-between text-xs text-foreground/50">
              <dt>Saldo {100 - pctSinal}%</dt>
              <dd>{eur(split.saldo)}</dd>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-foreground/40">
              Sobre o valor com IVA.
            </p>
          </dl>
        ) : (
          <p className="text-sm text-foreground/50">
            Ainda sem total. Define o valor no passo «Conteúdo» → «Total, IVA e validade».
          </p>
        )}
      </div>
    </Section>
  );
}

/**
 * A foto de uma célula, com a URL a trocar SEM a célula piscar.
 *
 * Quando uma foto provisória assenta, o caminho muda e com ele a URL assinada —
 * mesmos pixéis, morada nova. Pôr a nova no `src` de imediato deixava a célula
 * branca durante o download: a foto desaparecia para voltar igual, que é o
 * salto que este ecrã não pode ter. Por isso a nova só entra depois de estar
 * descarregada; até lá continua a ver-se a que já estava.
 *
 * Só quando JÁ há foto desenhada: a primeira nunca espera por nada.
 */
function useSrcSemPiscar(url?: string): string | undefined {
  /** A última URL que já esteve mesmo desenhada nesta célula. */
  const [pronta, setPronta] = useState<string | undefined>(url);
  useEffect(() => {
    if (!url || url === pronta) return;
    let alive = true;
    const pre = new window.Image();
    // Falhar também troca: a célula tem o seu próprio estado de erro, e ficar
    // presa à foto antiga seria mostrar uma coisa que já não está no documento.
    const swap = () => {
      if (alive) setPronta(url);
    };
    pre.onload = swap;
    pre.onerror = swap;
    pre.decoding = "async";
    pre.src = url;
    return () => {
      alive = false;
    };
    // `pronta` é o que já está no ecrã: entrar nas dependências reexecutaria
    // isto no momento exato em que a troca acabou de acontecer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  // Sem nada desenhado, a URL nova entra já — a primeira foto nunca espera.
  return pronta && url ? pronta : url;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ESCOLHER A DISPOSIÇÃO A VER, E NÃO A LER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Os cinco arranjos existiam no documento e o estúdio não os deixava escolher.
 * Uma lista de nomes resolvia metade do problema e criava outro: «mosaico» e
 * «filas» não querem dizer nada até se ver o que dão — e o que dão depende das
 * fotos DESTE mood board, porque a geometria respeita a forma de cada uma (uma
 * fila de verticais fica alta, a mesma fila de panorâmicas fica baixa).
 *
 * Por isso cada opção é um diagrama, desenhado com `caixasDoMoodboard` e com os
 * aspectos verdadeiros das fotos que o board tem NESTE momento. É a mesma
 * função que o PDF chama: não há aqui geometria nenhuma, só a conversão do
 * sistema de coordenadas do PDF (que conta de baixo) para o do SVG (que conta
 * de cima).
 */
const NOME_DO_LAYOUT: Record<LayoutDeMoodboard, string> = {
  filas: "Filas",
  "fila-unica": "Fila única",
  mosaico: "Mosaico",
  destaque: "Destaque",
  "texto-e-imagem": "Texto e imagem",
};

/** Pela ordem em que aparecem no selector — do mais usado ao mais especial. */
const LAYOUTS: LayoutDeMoodboard[] = [
  "filas",
  "fila-unica",
  "mosaico",
  "destaque",
  "texto-e-imagem",
];

/**
 * As caixas de um layout, desenhadas à escala da página.
 *
 * `caixasDoMoodboard` fica com a altura de anotação por omissão — a mesma que o
 * resolvedor usa quando ainda não tem fontes para medir o texto. A diferença
 * são uns pontos na base da mancha: invisível num diagrama de 90 px, e é o lado
 * certo para onde errar (as caixas saem por excesso, nunca por defeito).
 */
function DiagramaDeLayout({
  layout,
  aspectos,
  semRecorte = false,
}: {
  layout: LayoutDeMoodboard;
  aspectos: number[];
  /**
   * A mesma escolha que a página tem («Manter a forma de cada fotografia»).
   *
   * Vem por prop e não por omissão: o diagrama e a página TÊM de ser desenhados
   * com os mesmos argumentos. Se divergirem, ela escolhe uma disposição por um
   * desenho e recebe outra — que é o defeito que este selector existe para não
   * haver, e que já custou caro nesta casa.
   */
  semRecorte?: boolean;
}) {
  const caixas = caixasDoMoodboard(layout, aspectos, undefined, semRecorte);
  return (
    <svg
      viewBox={`0 0 ${PAGINA_W} ${PAGINA_H}`}
      className="block h-auto w-full"
      // O diagrama é o mesmo que o rótulo diz por palavras; para quem ouve o
      // ecrã, repeti-lo em caixinhas não acrescenta nada.
      aria-hidden="true"
      focusable="false"
    >
      {/* O «texto e imagem» é o único arranjo que não é só fotos: a nota ocupa
          a esquerda e a página fica meia vazia sem ela. Estes traços são
          indicativos e nascem da PRÓPRIA caixa da foto (vão da margem até onde
          ela começa), portanto não têm como divergir da geometria. */}
      {layout === "texto-e-imagem" &&
        caixas[0] &&
        [0, 1, 2].map((i) => (
          <line
            key={i}
            x1={caixas[0].x * 0.18}
            x2={caixas[0].x * 0.82}
            y1={PAGINA_H * 0.3 + i * 34}
            y2={PAGINA_H * 0.3 + i * 34}
            stroke="#2a2620"
            strokeOpacity={0.18}
            strokeWidth={9}
            strokeLinecap="round"
          />
        ))}
      {caixas.map((c, i) => (
        <rect
          key={i}
          x={c.x}
          // O PDF conta o `y` a partir da BASE da página; o SVG a partir do
          // topo. É a única conta que este diagrama faz.
          y={PAGINA_H - c.y - c.h}
          width={c.w}
          height={c.h}
          rx={6}
          fill="#4d6350"
          fillOpacity={0.22}
          stroke="#4d6350"
          strokeOpacity={0.45}
          strokeWidth={3}
        />
      ))}
    </svg>
  );
}

/**
 * O selector de disposição de UM mood board.
 *
 * `valor` a `undefined` é a opção «Automático», e é uma opção a sério — não é o
 * mesmo que escolher à mão o layout que hoje calha ser sugerido. Sem escolha, a
 * página acompanha o número de fotos (tirar uma de cinco muda o arranjo); com
 * escolha, fica como está para sempre, que é o que faz uma proposta reaberta
 * meses depois voltar a sair como saiu. O rótulo diz as duas coisas ao mesmo
 * tempo: «Automático (fila única)».
 */
function SelectorDeLayout({
  valor,
  aspectos,
  semRecorte = false,
  onEscolher,
}: {
  valor: LayoutDeMoodboard | undefined;
  /** A forma de cada foto que a página vai desenhar, pela ordem delas. */
  aspectos: number[];
  /** O enquadramento deste mood board — os diagramas desenham-se com ele. */
  semRecorte?: boolean;
  onEscolher: (layout: LayoutDeMoodboard | undefined) => void;
}) {
  const sugerido = layoutSugerido(aspectos.length);
  const opcoes: (LayoutDeMoodboard | undefined)[] = [undefined, ...LAYOUTS];
  const escolhido = opcoes.findIndex((o) => o === valor);

  // Um só ponto de paragem no tabulador e as setas a andar de opção em opção —
  // a mesma navegação do `Segmented`, que é o outro grupo de opções do estúdio.
  function aoTeclar(e: React.KeyboardEvent<HTMLDivElement>) {
    const passo =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!passo || escolhido === -1) return;
    e.preventDefault();
    onEscolher(opcoes[(escolhido + passo + opcoes.length) % opcoes.length]);
  }

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[10px] tracking-[0.14em] uppercase text-foreground/35">
        Disposição na página
      </p>
      {/* ── PORQUE É QUE O AUTOMÁTICO ESCOLHEU AQUILO ────────────────────
          Palavras dela: «sem explicar porquê». A regra é curta — depende só
          de quantas fotos há — e dizê-la torna óbvio o remédio quando a
          escolha não serve: tirar uma foto, acrescentar outra, ou escolher à
          mão nas opções que estão logo ao lado. */}
      <p className="mb-2 text-[11px] leading-relaxed text-foreground/45">
        {valor
          ? `Escolhida à mão: ${NOME_DO_LAYOUT[valor].toLowerCase()}. O «Automático» acompanharia o número de fotos.`
          : `Automático — ${porqueEsteAutomatico(aspectos.length)}`}
      </p>
      <div
        role="radiogroup"
        aria-label="Disposição das fotos na página"
        onKeyDown={aoTeclar}
        className="flex flex-wrap gap-2"
      >
        {opcoes.map((op, i) => {
          const activo = op === valor;
          const rotulo = op ? NOME_DO_LAYOUT[op] : "Automático";
          return (
            <button
              key={op ?? "auto"}
              type="button"
              role="radio"
              aria-checked={activo}
              tabIndex={i === (escolhido === -1 ? 0 : escolhido) ? 0 : -1}
              onClick={() => onEscolher(op)}
              className={`w-[5.75rem] rounded-lg border p-1.5 text-left motion-safe:transition-colors ${
                activo
                  ? "border-[#4d6350]/70 bg-[#4d6350]/[0.07] shadow-[0_1px_2px_rgba(42,38,32,0.08)]"
                  : "border-foreground/[0.1] bg-white hover:border-[#4d6350]/40"
              }`}
            >
              <span className="block overflow-hidden rounded-[3px] border border-foreground/[0.08] bg-white">
                <DiagramaDeLayout
                  layout={op ?? sugerido}
                  aspectos={aspectos}
                  semRecorte={semRecorte}
                />
              </span>
              {/* A escolha nunca é só cor: a opção assinalada muda de peso e de
                  elevação, e o `aria-checked` diz o mesmo a quem ouve. */}
              <span
                className={`mt-1 block text-[10px] leading-tight ${
                  activo ? "font-semibold text-foreground/85" : "text-foreground/55"
                }`}
              >
                {rotulo}
                {!op && (
                  <span className="block text-[9px] text-foreground/40">
                    ({NOME_DO_LAYOUT[sugerido].toLowerCase()})
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {/* «Texto e imagem» desenha UMA foto — as outras ficam de fora, e isso
          tem de ser dito aqui, no instante da escolha, e não descoberto no PDF
          já enviado. É o mesmo princípio do aviso das fotos a mais. */}
      {(valor ?? sugerido) === "texto-e-imagem" && aspectos.length > 1 && (
        <p className="mt-2 text-xs leading-relaxed text-[#8a2a22]">
          «Texto e imagem» desenha só a primeira foto ao lado da descrição:{" "}
          {aspectos.length - 1 === 1
            ? "a outra não é impressa"
            : `as outras ${aspectos.length - 1} não são impressas`}
          .
        </p>
      )}
    </div>
  );
}

function Thumb({
  url,
  planoB,
  onRemove,
  className = "",
  aspeto,
  onMedida,
  foraDoPdf = false,
  pendente = false,
  semRemover = false,
  onde = "estúdio",
  // `refDoc` e não `ref`: o React trata `ref` como prop especial, e uma string
  // ali dentro é o padrão antigo das string refs, que ele recusa.
  refDoc,
}: {
  url?: string;
  /** O ORIGINAL, para quando a miniatura não existir. Ver `assetOriginais`. */
  planoB?: string;
  onRemove: () => void;
  className?: string;
  /**
   * O ASPECTO DA CAIXA QUE ESTA FOTO VAI OCUPAR NO PDF.
   *
   * A célula pré-visualizava as capas em 4:3 e as fotos dos mood boards em
   * quadrado — e o documento não desenha NENHUMA foto em 4:3 nem NENHUMA em
   * quadrado. As capas são tiras altas (≈ 0,47:1, quase 1:2) e as células do
   * collage mudam de forma consoante o número de fotos do board.
   *
   * O resultado era ela escolher uma foto pelo que via e o cliente receber
   * outra coisa: a MESMA fotografia, cortada noutro sítio. Com uma tira de capa
   * tão estreita, os dois recortes podem não ter nada em comum — é a definição
   * de «desconfigurada», e não havia como descobri-lo sem gerar o PDF.
   *
   * Vem de `proposal-geometria`, a mesma função que o desenho usa. Em falta,
   * mantém-se o que o `className` disser.
   */
  aspeto?: number;
  /**
   * A FORMA REAL DESTA FOTOGRAFIA, dita assim que a célula consegue medi-la.
   *
   * A imagem que está aqui já foi descodificada pelo navegador — tem
   * `naturalWidth`/`naturalHeight` e não custa mais nada perguntar. É daqui que
   * o selector de disposição tira os aspectos com que desenha os diagramas (ver
   * `aspetosDasFotos`), em vez de haver um pedido novo por foto só para saber a
   * forma. Quando o URL é o da miniatura serve na mesma: a miniatura é gerada
   * dentro de uma caixa, conservando as proporções (ver `image-prep`).
   */
  onMedida?: (aspeto: number) => void;
  /** Esta foto está no rascunho mas a página do PDF já não a desenha. */
  foraDoPdf?: boolean;
  /** A foto já ocupa este lugar mas a cópia ainda não confirmou. */
  pendente?: boolean;
  /** Onde está esta célula, para os registos do servidor dizerem qual falhou. */
  onde?: string;
  /** O caminho no documento — o que se procura no Storage quando isto falha. */
  refDoc?: string;
  /**
   * Não desenhar o × desta célula.
   *
   * Nas grelhas dos mood boards a remoção passou para a barra de acções, que é
   * visível ao toque; o × da miniatura só aparecia em hover, e num telemóvel um
   * botão que só aparece em hover é um botão que não existe. As capas continuam
   * com ele — ali há duas células e nenhuma barra.
   */
  semRemover?: boolean;
}) {
  const {
    alvo,
    desistiu: failed,
    aoFalhar,
    tentarDeNovo,
    ultimoAlvo,
  } = useFotoComPlanoB(url, planoB);
  const src = useSrcSemPiscar(alvo);

  /**
   * UMA FOTO A CAMINHO NÃO É UMA FOTO PARTIDA.
   *
   * Enquanto a cópia não confirma, a célula desenha a miniatura que o seletor
   * já tinha — e essa é provisória por natureza. Dizer «não foi possível
   * pré-visualizar» a meio disso é acusar de avaria o que ainda está a
   * acontecer. Espera-se pelo caminho definitivo, que traz URL novo e uma
   * oportunidade nova.
   */
  const semRemedio = failed && !pendente;

  // O registo sai UMA vez por célula que desiste, com o caminho e o código de
  // estado — que é o que nem ela nem eu tínhamos quando isto apareceu.
  useEffect(() => {
    if (semRemedio && ultimoAlvo) {
      void relatarFalhaDeImagem({ onde, ref: refDoc, url: ultimoAlvo });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semRemedio]);

  /**
   * Mede e diz. Vive numa `ref` para o `ref={}` da imagem poder ser uma função
   * ESTÁVEL: uma função nova a cada desenho fazia o React desligar e voltar a
   * ligar a referência da imagem em cada tecla escrita na secção.
   *
   * Chamado nos dois momentos possíveis — quando a imagem acaba de carregar, e
   * quando o elemento aparece já completo (o navegador serviu-a da cache, que é
   * o caso normal aqui: o `useSrcSemPiscar` pré-carrega-a antes de a desenhar).
   */
  const medidaRef = useRef(onMedida);
  useEffect(() => {
    medidaRef.current = onMedida;
  }, [onMedida]);
  const medir = useCallback((img: HTMLImageElement | null) => {
    if (!img?.complete) return;
    const { naturalWidth: w, naturalHeight: h } = img;
    if (w > 0 && h > 0) medidaRef.current?.(w / h);
  }, []);
  return (
    <div
      // `aria-busy` e não só a opacidade: quem não vê a célula esbatida tem de
      // saber na mesma que esta foto ainda está a entrar (a pastilha «X a
      // caminho» diz o total, isto diz QUAL).
      aria-busy={pendente || undefined}
      // A PEGA DOS TESTES. Uma célula de foto identificava-se pelo seu «×» —
      // e o × saiu daqui para a barra de acções, que é visível ao toque. Um
      // atributo próprio diz o que a célula É, em vez de a fazer depender de
      // que botões calha ter naquele sítio.
      data-foto=""
      // `self-start` com o aspecto: dentro de uma grelha, sem isto a célula
      // esticava-se à altura da linha e o `aspect-ratio` era ignorado — que é
      // exactamente o contrário do que se quer aqui.
      style={aspeto ? { aspectRatio: String(aspeto) } : undefined}
      className={`group relative overflow-hidden rounded-lg border bg-foreground/[0.04] motion-safe:transition-opacity motion-safe:duration-500 ${
        foraDoPdf ? "border-[#8a2a22]/60 opacity-60" : "border-foreground/[0.1]"
      } ${pendente ? "opacity-45" : ""} ${aspeto ? "self-start" : ""} ${className}`}
    >
      {src && !semRemedio ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          // A forma desta fotografia sai desta imagem, que já cá está e já foi
          // descodificada — ver `onMedida`.
          ref={medir}
          onLoad={(e) => medir(e.currentTarget)}
          // Cada célula puxa o ORIGINAL — medido, 1130 KB por foto para uma
          // caixa de 174 px (ver IMAGES-BEFORE.md). Enquanto as propostas não
          // tiverem miniaturas próprias, `lazy` é o que impede as células fora
          // do ecrã de disputarem a ligação com as que estão à vista: sem isto
          // a primeira imagem só terminava aos 35 s em 4G, porque esperava
          // pelas outras vinte e três.
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={aoFalhar}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[9px] leading-relaxed text-foreground/40">
          {semRemedio ? (
            <>
              <span className="font-medium text-foreground/55">Imagem guardada</span>
              {/* A frase antiga acabava aqui, e era um beco: a foto estava lá,
                  havia coisas a fazer, e o ecrã não oferecia nenhuma. */}
              <span>Não consegui mostrá-la neste ecrã.</span>
              <span className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  onClick={tentarDeNovo}
                  className="rounded border border-foreground/20 px-1.5 py-0.5 text-[9px] text-foreground/70 hover:bg-foreground/[0.06]"
                >
                  Tentar novamente
                </button>
                {ultimoAlvo && (
                  <a
                    href={ultimoAlvo}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 text-foreground/60 hover:text-foreground/80"
                  >
                    Abrir ficheiro
                  </a>
                )}
              </span>
            </>
          ) : (
            <span className="tracking-[0.15em] uppercase text-foreground/30">Imagem</span>
          )}
        </div>
      )}
      {/* Sobreposta, nunca no fluxo: a célula tem de ter exatamente o mesmo
          tamanho antes e depois de a foto assentar. */}
      {pendente && (
        <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-center text-[8px] tracking-[0.12em] uppercase text-white">
          a entrar…
        </span>
      )}
      {foraDoPdf && !pendente && (
        <span className="absolute inset-x-0 bottom-0 bg-[#8a2a22]/85 px-1 py-0.5 text-center text-[8px] tracking-[0.12em] uppercase text-white">
          fora do PDF
        </span>
      )}
      {!semRemover && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover imagem"
          className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white text-xs leading-none opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  );
}

function UploadArea({
  label,
  busy,
  multiple,
  compact = false,
  curto = false,
  faixa = false,
  onFiles,
}: {
  label: string;
  busy: boolean;
  multiple: boolean;
  compact?: boolean;
  /**
   * Caixa BAIXA em vez de proporcional.
   *
   * Uma zona de largar com `aspect-[4/3]` numa coluna de 520px fica com 391px
   * de altura — medido. Duas dessas, lado a lado, são metade da janela de
   * trabalho gasta a não mostrar nada. Vazia é uma faixa; ao ganhar uma foto,
   * a miniatura é que traz a proporção de volta.
   */
  curto?: boolean;
  /**
   * Uma FAIXA por baixo da grelha, e não uma célula dentro dela.
   *
   * É a forma que a caixa de acrescentar fotos tem num mood board. Como célula
   * quadrada, caía a meio de uma fila e lia-se como uma foto em falta; a toda a
   * largura e baixa, lê-se pelo que é: o que se faz A SEGUIR às que já lá
   * estão.
   */
  faixa?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function pick(list: FileList | null) {
    if (!list) return;
    // Alguns sistemas entregam HEIC/ficheiros de câmara com `type` vazio —
    // aceitar também por extensão, em vez de os descartar em silêncio.
    const files = Array.from(list).filter(
      (f) =>
        f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(f.name),
    );
    if (files.length) onFiles(files);
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        pick(e.dataTransfer.files);
      }}
      // `flex-row`/`flex-col` e `gap` são escolhidos AQUI, e não acrescentados
      // por cima: duas utilidades da mesma propriedade decidem-se pela ordem na
      // folha de estilo e não pela ordem na string, e um `flex-col` de base
      // ganharia ao `flex-row` da faixa sem nada o denunciar.
      className={`flex w-full items-center justify-center rounded-lg border border-dashed text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d6350]/55 ${
        faixa
          ? "h-14 flex-row gap-2 p-2"
          : curto
            ? "h-24 flex-col gap-1 p-2"
            : compact
              ? "aspect-square flex-col gap-1 p-2"
              : "aspect-[4/3] flex-col gap-1 p-3"
      } ${
        drag
          ? "border-[#4d6350]/60 bg-[#4d6350]/[0.06]"
          : "border-foreground/[0.18] bg-foreground/[0.02] hover:border-[#4d6350]/45"
      }`}
    >
      <span className="text-[9px] tracking-[0.15em] uppercase text-foreground/35">
        {busy ? "A carregar…" : label}
      </span>
      {!busy && !compact && (
        <span className="text-[9px] text-foreground/25">arraste ou clique</span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </button>
  );
}
