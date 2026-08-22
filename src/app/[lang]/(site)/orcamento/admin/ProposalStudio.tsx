"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { porqueFalhouOEnvio } from "./porque-falhou-o-envio";
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
  MAX_INTENCAO,
  type MoodBoard,
  type VatMode,
} from "@/lib/proposal-doc";
import {
  IDIOMA_POR_OMISSAO,
  camposDoEventoNaLingua,
  dataDoEventoPorExtenso,
  ehIdiomaDaProposta,
  isoDaDataPorExtenso,
  referenciaDoDocumento,
  type IdiomaDaProposta,
} from "@/lib/proposal-doc-textos";
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
import { guestRangeLabel, ceremonyTypeLabel, eventTypeName } from "@/lib/orcamento/data";
import { log } from "@/lib/logger";
import { urlAindaBom } from "./assinatura";
import { relatarFalhaDeImagem } from "./relatar-falha";
import { pedirVezDeImagemPesada, ESPERA_MAXIMA_MS } from "./fila-de-imagens";
import PainelInterno from "./PainelInterno";
import Conferencia from "./Conferencia";
import { nomeDoFicheiroDaProposta } from "@/lib/email-proposta-textos";
import EmailDoEnvio from "./EmailDoEnvio";
import Gralhas from "./Gralhas";
import MoodBoardIndice from "./MoodBoardIndice";
import PreviaDaPagina from "./PreviaDaPagina";
import PainelDoEstudio from "./PainelDoEstudio";
import { useFotoComPlanoB } from "@/lib/useFotoComPlanoB";
import AEnviarAProposta from "./AEnviarAProposta";
import PorqueNaoDaParaEnviar from "./PorqueNaoDaParaEnviar";
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
  lerCampo,
  seccaoDoCampo,
  type CampoDeTexto,
  type CampoPublicado,
} from "@/lib/proposal-ortografia";
import { fotosQueDestoam, ordemPorCor } from "@/lib/cor-dominante";
import {
  comNovaAmostra,
  orcamentoDeTempo,
  passaDoAnexo,
  tamanhoEmPalavras,
  tamanhoEstimado,
  tempoEmPalavras,
  tempoEstimado,
  type AmostraDeGeracao,
} from "@/lib/custo-do-pdf";
import Versoes from "./Versoes";
import { comoSeDiz, noMesmoEspaco, type FotoRepetida } from "@/lib/orcamento/fotos-repetidas";
import { marcarExtra, opcionaisDe, totaisDasVersoes } from "@/lib/orcamento/versoes-da-proposta";
import { custosDe, margemTotal } from "@/lib/orcamento/margem";
import { useDefinicoesDaProposta } from "./definicoes-da-proposta";
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
import EditorDeEscolhas, { type FotoDisponivel } from "./EditorDeEscolhas";
import NavEstudio from "./NavEstudio";
import NotasInternas from "./NotasInternas";
import AvisoDataOcupada from "./AvisoDataOcupada";
import { estadoDasSeccoes, oQueFaltaParaEnviar, podeEnviar } from "@/lib/proposal-progress";
import { folhasAproximadas } from "@/lib/proposal-paginas";
import { avisoDeTituloParecido, titulosParecidos } from "@/lib/proposal-titulos-parecidos";
import { depositPercentOf } from "@/lib/proposal-doc";
// A geometria do documento, para a pré-visualização mostrar a forma que cada
// foto vai MESMO ter. Módulo próprio, sem `server-only`, exactamente para poder
// ser lido aqui — ver `proposal-geometria`. Os diagramas do selector de
// disposição saem das MESMAS caixas que o PDF desenha (`caixasDoMoodboard`):
// um segundo desenho, aproximado, mentia no dia em que divergisse.
import {
  ASPETO_POR_OMISSAO,
  alturaDaLegenda,
  aspetoDaCaixa,
  aspetoDaCapa,
  caixasDoMoodboard,
  layoutSugerido,
  linhasDaLegendaAprox,
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
  dinheiroDaProposta,
  asDuasFormas,
} from "@/lib/proposal-budget";
import { eur, eurDocumento, montanteNaLingua, round2 } from "@/lib/money";
import { resumoDaPropostaParaCopiar } from "@/lib/email-proposta-textos";
import { randomId } from "./util";
import type { ActivityEntry, Quote } from "@/lib/orcamento/types";
import { prepareImageWithThumb, type ImageKind } from "./image-prep";
import ThemePicker, { type ImportedImage, type ReservedImage } from "./ThemePicker";
import ServicesEditor, { MoveBtns } from "./ServicesEditor";
import CaixaInglesa from "./CaixaInglesa";
import PorTraduzir from "./PorTraduzir";
import FotosEmFalta from "./FotosEmFalta";
import {
  aplicarTraducao,
  estadoDaTraducao,
  motorPelaRota,
  traduzirParaIngles,
  type EstadoDaTraducao,
} from "@/lib/proposal-traducao";
import {
  camposPorRever,
  camposPorTraduzir,
  docTemIngles,
  confirmarTraducao,
  escreverEn,
  estadoDoIngles,
  lerEn,
  porTraduzirPorSeccao,
} from "@/lib/proposal-doc-bilingue";
import { aquecerBiblioteca, aquecerFotosEmSegundoPlano } from "./theme-picker-cache";
// A espera desenhada de uma maneira só. Ver `ui/EmCurso.tsx`: uma barra, um
// ponto a pulsar, e a contagem quando o código sabe contar — este ficheiro não
// inventa nenhuma espera sua.
import { Ajuda, Button, Card, EmCurso, Field, FolhaOuDialogo, Segmented } from "./ui";

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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO DEMORA UMA TRADUÇÃO — E PORQUE É QUE ISTO É UM PALPITE E NÃO UMA CONTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A espera da tradução é OPACA vista daqui, e não por preguiça: o estúdio faz
 * UM pedido à rota (`motorPelaRota` só parte em vários acima de 300 campos, e
 * uma proposta pesada tem ~218). Os lotes de 50 que se veem no código são do
 * outro lado da rota — é o motor do serviço que os manda, um a seguir ao
 * outro, e do lado de cá não há nenhum sinal de que o terceiro acabou.
 *
 * Partir o pedido aqui para poder contar os lotes seria trocar um pedido por
 * cinco: mais viagens na rede dela para desenhar uma barra. Uma animação que
 * atrasa a tarefa que retrata não se faz, e por isso isto fica um palpite.
 *
 * O palpite, escrito para poder ser corrigido: uma ida à rota mais a resposta
 * do serviço rondam o segundo, e cada lote de 50 campos que o serviço manda a
 * seguir custa outro tanto. Sobra por cima do que se mede num portátil, porque
 * quem espera está numa quinta com 4G — e a curva do `EmCurso` perdoa um erro
 * de dois para um: o que ela não perdoa é uma barra que chega ao fim e fica lá.
 */
const TRADUCAO_MS_FIXOS = 800;
const TRADUCAO_MS_POR_LOTE = 1_500;
/** O tamanho do lote do motor do serviço (`MAX_TEXTOS_POR_PEDIDO`, no DeepL). */
const TRADUCAO_CAMPOS_POR_LOTE = 50;

/** Quanto tempo, mais ou menos, traduzir `campos` campos de prosa. */
function esperaDaTraducao(campos: number): number {
  const lotes = Math.max(1, Math.ceil(Math.max(0, campos) / TRADUCAO_CAMPOS_POR_LOTE));
  return TRADUCAO_MS_FIXOS + TRADUCAO_MS_POR_LOTE * lotes;
}

/**
 * Quanto demora copiar `fotos` fotografias de um modelo para este pedido.
 *
 * Também opaca, e também um pedido só (`/api/propostas/copiar`): o servidor
 * copia OITO de cada vez (`EM_PARALELO`, em `proposal-storage`), cada foto são
 * duas cópias no armazenamento — o original e a miniatura —, e nada disso é
 * observável daqui. O palpite é essa aritmética, com a folga de sempre para a
 * rede de quem espera.
 */
const COPIA_FOTOS_EM_PARALELO = 8;
function esperaDaCopiaDeFotos(fotos: number): number {
  const lotes = Math.max(1, Math.ceil(Math.max(0, fotos) / COPIA_FOTOS_EM_PARALELO));
  return 900 + 1_500 * lotes;
}

const INPUT_SM = "bo-input min-w-0 px-3 py-2 text-xs text-foreground/85";
const ADD_BTN =
  "alvo-toque !justify-start gap-1 text-xs font-medium text-[#4d6350] hover:text-[#415440] transition-colors inline-flex items-center";
const REMOVE_BTN =
  "alvo-toque text-foreground/30 hover:text-[#8a2a22] transition-colors text-base leading-none shrink-0";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM AVISO QUE NÃO PODE SER CORTADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"9 fotos numa página: cada uma fica peque…" — cortado à
 * direita, no editor de mood boards, por cima da grelha de fotos dessa página».
 *
 * ── Porque é que um parágrafo que quebra saía cortado ─────────────────────
 *
 * Porque `white-space` e `text-overflow` HERDAM-SE. Um `truncate` em qualquer
 * antepassado deste parágrafo — e o cartão de um board tem cabeçalhos, tiras e
 * linhas de resumo que o usam — desce até aqui como `white-space: nowrap` mais
 * `text-overflow: ellipsis`, e o `overflow: hidden` desse antepassado faz o
 * resto. O parágrafo não precisa de ter classe nenhuma para sair com «…»: basta
 * estar debaixo de alguém que a tenha.
 *
 * Por isso a defesa é aqui e é explícita: este parágrafo declara que quebra,
 * seja o que for que lhe esteja por cima. `whitespace-normal` corta a herança
 * do `nowrap`, e o `overflow-wrap: anywhere` garante que uma palavra comprida
 * também não empurra a linha para fora.
 *
 * ── E porque é que é uma constante ────────────────────────────────────────
 *
 * Porque são dois avisos irmãos — «a página está a ficar cheia» e «estas não
 * são impressas» — e o segundo é o mais grave dos dois. Corrigir um e deixar o
 * outro à mercê do mesmo antepassado era resolver metade do problema no sítio
 * onde ele importa menos.
 */
const AVISO_DO_BOARD =
  // Sem cor: os dois avisos têm cores diferentes, e duas classes `text-*` na
  // mesma string não se resolvem pela ordem em que estão escritas — quem ganha
  // é a que aparece depois na FOLHA DE ESTILO. O aviso vermelho podia sair
  // cinzento sem ninguém perceber porquê.
  "mb-2 text-xs leading-relaxed whitespace-normal [overflow-wrap:anywhere]";

/* ── Os campos que o estúdio semeia a partir do pedido ─────────────────────
 *
 * O tipo, a data e a referência nascem escritos por NÓS, em português — e é
 * exactamente por isso que o gerador do PDF os sabe reescrever na língua do
 * casal quando ninguém lhes mexeu (ver «OS CAMPOS QUE O NOSSO CÓDIGO ESCREVEU»,
 * em `proposal-doc-textos.ts`). Esse reconhecimento é uma COMPARAÇÃO com o que
 * estas três funções produzem: uma cópia local do nome do tipo, dos meses ou da
 * forma da referência divergia um dia da de lá, e a partir desse dia a proposta
 * inglesa voltava a sair com a data em português — sem erro nenhum pelo
 * caminho. Por isso nenhuma delas escreve texto seu: pedem-no a quem o tem. */

function eventTypeLabel(q: Quote): string {
  return (
    eventTypeName(q.eventType) || (q.category === "empresas" ? "Evento Corporativo" : "Casamento")
  );
}

/** yyyy-mm-dd → "12 de setembro de 2026"; passes through anything else. */
function formatEventDate(d?: string): string {
  if (!d) return "";
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(d);
  return iso ? dataDoEventoPorExtenso(iso[0]) : d;
}

function buildRef(d: StudioDoc): string {
  return referenciaDoDocumento(d);
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE VEIO DO PEDIDO, E AINDA NÃO FOI OLHADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O pré-preenchimento já existia: a proposta abre com os nomes do casal, o
 * tipo, a data por extenso, o local, os convidados e a cerimónia que o casal
 * escolheu no formulário. Poupa-lhe cinco campos e uma ida ao pedido.
 *
 * O que faltava era DIZÊ-LO. Um campo semeado é uma resposta de terceiros
 * dentro de um documento que sai com a assinatura dela: o casal escreveu
 * «Évora» no formulário e a proposta pode ter de dizer «Herdade da Malhadinha,
 * Albernoa». Sem marca nenhuma, um valor semeado lê-se como um valor escrito —
 * e um valor escrito não se relê.
 *
 * O mecanismo já existia inteiro e é o da CÓPIA: anel laranja, e tocar-lhe é a
 * confirmação (ver `realce`/`confirmado`). Estava só ligado a um dos dois
 * caminhos por onde entra texto de outra pessoa.
 *
 * ── SÓ O QUE TEM MESMO ALGUMA COISA ESCRITA ──────────────────────────────
 * Um campo que o pedido não sabia responder fica VAZIO (é a regra do
 * `initialDoc`: nunca inventa). Um anel laranja à volta de uma caixa em branco
 * não pede confirmação nenhuma — pede que se ignore o anel.
 *
 * ── E O VALOR NÃO ────────────────────────────────────────────────────────
 * O total também é semeado do pedido, e de propósito NÃO entra aqui: não é um
 * palpite a confirmar, é o mesmo número visto de dois sítios — escrever aqui
 * altera-o lá. Marcá-lo pedia confirmação de uma coisa que ela própria escreveu.
 */
function camposVindosDoPedido(d: StudioDoc): CampoAMudar[] {
  const escrito = (v: unknown) => typeof v === "string" && v.trim() !== "";
  const marcar: CampoAMudar[] = [];
  if (escrito(d.clientNames)) marcar.push("clientNames");
  if (escrito(d.eventType)) marcar.push("eventType");
  if (escrito(d.eventDate)) marcar.push("eventDate");
  if (escrito(d.location)) marcar.push("location");
  if (escrito(d.guests)) marcar.push("guests");
  if (escrito(d.ceremony)) marcar.push("ceremony");
  if (escrito(d.time)) marcar.push("time");
  return marcar;
}

/** Passos do fluxo guiado do estúdio. */
type Step = "conteudo" | "prever" | "enviar";
/**
 * Em que pé está a leitura dos URL das fotografias.
 *
 * Três estados e não um booleano, porque a diferença entre «vem a caminho» e
 * «não veio» é a diferença entre esperar e agir — e era exactamente essa que o
 * ecrã não tinha (ver `estadoDosUrls`).
 */
type EstadoDosUrls = "a-caminho" | "pronto" | "falhou";

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
  /**
   * ── OS ADICIONAIS SOMAM, NAS PROPOSTAS NOVAS ─────────────────────────────
   *
   * Palavras dela, a olhar para o quadro que dizia «Subtotal 2.860 +
   * Deslocação 140 = Total 3.000»: «não quero que a parte dos serviços apareça
   * como base somada à deslocação; quero que seja três mil mais a deslocação da
   * equipa, que dá três mil e cento e quarenta».
   *
   * O selector por proposta continua a existir, e continua a poder ser mudado
   * nos dois sentidos. O que muda é o lado para que ele nasce virado, porque
   * ter de o trocar em cada proposta transforma a decisão dela num passo que se
   * esquece — e um passo esquecido aqui é uma deslocação que a casa não cobra.
   *
   * ── E AS PROPOSTAS QUE JÁ EXISTEM ────────────────────────────────────────
   * Não mudam. Isto só escreve quando o campo AINDA NÃO EXISTE no documento, e
   * o `seedDefaults` só corre quando não há rascunho gravado. Uma proposta já
   * enviada continua a ler-se exactamente como o casal a recebeu, e um rascunho
   * a meio mantém a regra com que nasceu — quem a quiser mudar tem o selector.
   */
  if (next.budgetExtrasSomam === undefined) {
    next = { ...next, budgetExtrasSomam: true };
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
 * O helper vive num módulo PRÓPRIO, e não dentro do Estúdio, por uma razão de
 * peso: o construtor de preços (`ProposalBuilder`) precisa dele e é montado
 * SEMPRE, enquanto o Estúdio entra por `dynamic()`. Importá-lo de lá arrastava
 * o Estúdio inteiro para o pacote inicial do back office.
 */
export { porqueFalhouOEnvio };

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
/**
 * ── E O QUARTO, QUE É O DO DEPLOYMENT ─────────────────────────────────────
 *
 * `nao-dura-ao-deploy` é o desfecho do meio, e não é uma subtileza: a gravação
 * CHEGOU ao servidor (não é `so-neste-computador` — noutro computador a
 * proposta abre), e mesmo assim o próximo deploy leva-a, porque em produção sem
 * base de dados o rascunho fica no disco da função.
 *
 * Precisa de palavras próprias exactamente por isso. «Guardado» era falso pelo
 * lado do tempo, e «só neste computador» seria falso pelo lado do sítio —
 * mandaria alguém copiar o trabalho para outra máquina, que é o gesto que não
 * resolve nada aqui.
 */
export type EstadoDaGravacaoNoEcra =
  | "a-guardar"
  | "so-neste-computador"
  | "nao-dura-ao-deploy"
  | "guardado";

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
  if (estado === "nao-dura-ao-deploy") {
    // A hora fica, como no estado de cima e pela mesma razão. O que muda é a
    // segunda metade da frase: o problema não é ONDE está, é ATÉ QUANDO.
    return {
      curto: "⚠ guardado até ao próximo deploy",
      longo: horas
        ? `guardado às ${horas}, num sítio que o próximo deploy apaga`
        : "guardado num sítio que o próximo deploy apaga",
      leitor: "atenção: o rascunho está guardado num sítio que o próximo deploy apaga",
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
  | {
      estado: "guardado";
      updatedAt?: string;
      overwrote?: boolean;
      previousBy?: string;
      /**
       * O sítio onde ficou sobrevive a um deploy?
       *
       * ── PORQUE É QUE ISTO NÃO PODE FICAR DE FORA ────────────────────────
       *
       * Há um terceiro desfecho entre «guardado» e «não guardado», e é o que
       * fez desaparecer uma proposta montada: produção sem Supabase escreve o
       * rascunho no `data/app-state.json`, que em Vercel é o disco da função. A
       * escrita ACONTECE — por isso a rota responde 200 e isto não é um
       * `so-local` —, e o próximo deploy apaga-a. A rota diz-o desde sempre
       * (`duradouro: false`, com a frase em `aviso`); era esta leitura que
       * faltava, e sem ela o indicador escrevia «guardado às 14:32» por cima do
       * trabalho de horas de alguém.
       *
       * As fotos em si não se perdem — os bytes estão no bucket. O que se perde
       * é a MONTAGEM: quais entraram, por que ordem, em que mood board.
       *
       * `undefined` quando o servidor não o disse. Só um `false` explícito
       * alarma: inventar um alarme a partir de uma ausência era pôr um aviso
       * permanente em instalações sãs, que é como se ensina a ignorá-lo.
       */
      duradouro?: boolean;
      /** A frase do servidor para o caso de cima — diz o que fazer e nomeia as
       *  variáveis que o resolvem. Vem escrita de lá para não haver duas
       *  versões da mesma verdade. */
      aviso?: string;
    }
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
          duradouro: typeof dados?.duradouro === "boolean" ? dados.duradouro : undefined,
          aviso: typeof dados?.aviso === "string" ? dados.aviso : undefined,
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

  /**
   * ── O QUE AS GERAÇÕES ANTERIORES ENSINARAM ──────────────────────────────
   *
   * Cada PDF gerado deixa uma amostra `{fotos, ms, bytes}`, e é dela que sai a
   * estimativa que aparece antes do botão. Vive fora do rascunho e SEM o id do
   * pedido: o que se aprende com uma proposta serve para a seguinte — é a
   * mesma máquina, a mesma ligação e o mesmo servidor.
   */
  const [amostras, setAmostras] = useState<AmostraDeGeracao[]>([]);
  useEffect(() => {
    try {
      const cru = localStorage.getItem(AMOSTRAS_KEY);
      const lidas = cru ? JSON.parse(cru) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(lidas)) setAmostras(lidas.filter((x) => x && typeof x.ms === "number"));
    } catch {
      /* sem amostras — a estimativa usa o modelo de arranque */
    }
  }, []);

  /** Aponta uma geração e guarda-a para a próxima estimativa. */
  const apontarGeracao = useCallback((fotos: number, ms: number, bytes: number) => {
    setAmostras((antes) => {
      const proximas = comNovaAmostra(antes, { fotos, ms, bytes });
      try {
        localStorage.setItem(AMOSTRAS_KEY, JSON.stringify(proximas));
      } catch {
        /* sem espaço: a estimativa desta sessão continua a valer */
      }
      return proximas;
    });
  }, []);

  const [doc, setDoc] = useState<StudioDoc>(() => initialDoc(quote));
  /**
   * O documento COMO ESTÁ AGORA, para quem volta de uma ida à rede.
   *
   * Uma função `async` guarda o `doc` que existia quando ela CARREGOU no botão.
   * Se a resposta demorar segundos — e a tradução demora —, esse documento já é
   * história: entretanto entraram fotos, saíram fotos, arrumou-se a grelha. Lê-lo
   * para decidir o que dizer, ou pô-lo de volta no estado, é apagar tudo isso.
   *
   * Isto é só para LER (contar, comparar). Quem ESCREVE continua a escrever pela
   * forma funcional do `setDoc`, que é a única que o React garante actualizada.
   */
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
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
   * O rascunho CHEGOU ao servidor e o próximo deploy apaga-o (produção sem base
   * de dados — ver `duradouro` em `ResultadoDaGravacao`). `aviso` é a frase que
   * o servidor manda, com o nome das variáveis que resolvem.
   */
  const [naoDuraAoDeploy, setNaoDuraAoDeploy] = useState<{ aviso?: string } | null>(null);
  /** O mesmo contrato do `avisouSoLocal`: o indicador di-lo sempre, o aviso
   *  grande uma vez. */
  const avisouNaoDura = useRef(false);
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
   * ══════════════════════════════════════════════════════════════════════════
   * A HIDRATAÇÃO OU CORREU, OU AINDA VAI A CAMINHO, OU FALHOU — E ISSO VÊ-SE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «estava a ver, pelo back office, se conseguia ver as imagens
   * quando estava a fazer a proposta e não consigo» — e, nas capturas, células
   * cinzentas com a palavra «Imagem».
   *
   * Essa caixa é o ramo do `Thumb` em que NÃO HÁ URL. Num telemóvel que nunca
   * abriu esta proposta não há `localStorage` nenhum, portanto o mapa começa
   * vazio e as células dependem inteiramente desta única leitura. E ela era
   * silenciosa nos dois sentidos: enquanto ia a caminho a célula dizia
   * «Imagem», e se falhasse (`!res.ok`, sessão caducada, rede a cair) a função
   * fazia `return` e a célula dizia «Imagem» PARA SEMPRE. As duas coisas com o
   * mesmo aspecto, e nenhuma delas com uma explicação ou uma saída.
   *
   * Com isto, a célula sabe distinguir «vem a caminho» de «não veio», e há um
   * botão para tentar outra vez em vez de recarregar a página.
   */
  const [estadoDosUrls, setEstadoDosUrls] = useState<EstadoDosUrls>("a-caminho");
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
   * ══════════════════════════════════════════════════════════════════════════
   * OS URL QUE ESTA SESSÃO JÁ VIU MORRER
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O `urlAindaBom` prefere o URL guardado ao fresco «enquanto servir», e quem
   * decide se serve é o prazo escrito no token. Isso está certo para o caso que
   * ele veio resolver (não deitar fora assinaturas boas e pagar trinta
   * downloads ao reabrir um rascunho) e está errado para este: um URL pode ter
   * o prazo em dia e mesmo assim dar 403 ou 404 — pasta mudada, objecto que
   * nunca chegou a subir, chave do bucket rodada.
   *
   * Sem esta memória o «Tentar novamente» de uma célula morta era um beco
   * fechado a três voltas: ia buscar a lista outra vez, recebia URLs frescos,
   * e o mapa PREFERIA o mesmo URL morto que já tinha — a `string` não mudava,
   * portanto o `useFotoComPlanoB` não via URL novo, portanto não recomeçava
   * nada. O botão pedia ao servidor e não podia usar o que ele respondia.
   *
   * Uma `ref` e não estado: só é lida DENTRO da hidratação, e um redesenho por
   * cada foto que morre numa grelha de vinte e quatro era um redesenho por
   * nada.
   */
  const urlsMortos = useRef<Set<string>>(new Set());
  /** Esta célula provou que este URL não abre. Ver `urlsMortos`. */
  const marcarUrlMorto = useCallback((url: string) => {
    urlsMortos.current.add(url);
  }, []);
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
  /**
   * ── O CARREGAMENTO DE FOTOS, CONTADO ────────────────────────────────────
   *
   * Era um `boolean` por zona de largar, e a zona só sabia dizer «A carregar…».
   * Vinte fotografias de telemóvel com 4G são minutos, e a contagem existia o
   * tempo todo dentro do `handleUpload` (`results[]` e `files.length`) a ser
   * deitada fora — que é a única coisa que responde à pergunta dela: isto está
   * a andar ou está preso?
   *
   * A chave é a mesma de sempre (`cover-0`, `board-3`), e é por ela que o
   * progresso chega à `UploadArea` pelo caminho por onde o `busy` já ia. A
   * ausência da chave É o «não está a carregar nada».
   */
  const [uploading, setUploading] = useState<Record<string, { feito: number; total: number }>>({});
  /**
   * Quantas fotos de modelo estão a ser copiadas para a pasta deste pedido.
   *
   * Zero é «nenhuma». Soma-se e subtrai-se em vez de se escrever o número do
   * último lote: inserir dois modelos seguidos é um gesto normal, e o segundo
   * não pode apagar a espera do primeiro.
   */
  const [fotosACopiar, setFotosACopiar] = useState(0);
  const [busy, setBusy] = useState<null | "preview" | "send">(null);
  /**
   * ── A LÍNGUA ESCOLHE-SE AO GERAR ──────────────────────────────────────────
   *
   * Não entra no `doc` e não é gravada no rascunho, de propósito: o documento
   * guardado é UM só, em português, e a língua é uma decisão que se toma sobre
   * ESTE clique — como escolher a impressora. Guardá-la era passar a ter uma
   * proposta com uma língua colada, que ninguém voltaria a rever.
   */
  const [idiomaDoPdf, setIdiomaDoPdf] = useState<IdiomaDaProposta>(IDIOMA_POR_OMISSAO);
  /**
   * ── A PROPOSTA É BILINGUE: CADA CAMPO DE PROSA COM DUAS CAIXAS ────────────
   *
   * Estado do ECRÃ, não do documento — como as dobras dos mood boards, o
   * `refEdited` e os mapas de URLs, e pela mesma razão: não diz nada sobre a
   * proposta. Posto no `doc`, ia para a coluna `proposals.doc`, para a cópia de
   * segurança, para a cópia entre pedidos e para a comparação de versões.
   *
   * Desligado por omissão, e desligado o ecrã é o de hoje ao pixel: o
   * `ServicesEditor` é o ecrã mais escrito da casa, e dobrar-lhe a altura para
   * toda a gente — incluindo as propostas que nunca vão a inglês — era pagar
   * todos os dias por um caso ocasional.
   *
   * ── E ABRE LIGADO QUANDO O DOCUMENTO JÁ TRAZ INGLÊS ──────────────────────
   * O `meta` fica neste computador. Abrir a proposta noutro portátil,
   * restaurá-la do servidor ou copiá-la de outra deixa-o para trás — e sem essa
   * regra os textos ingleses existiam no documento e o ecrã não os mostrava:
   * invisíveis e editáveis por acidente, que é a pior combinação. A regra
   * aplica-se no restauro (ver o efeito «CORRE UMA VEZ SÓ») e aqui, para a
   * proposta que já abre com inglês vindo do pedido.
   */
  const [bilingue, setBilingue] = useState(() => docTemIngles(initialDoc(quote)));
  /** A tradução automática está a correr. Trava o botão para não haver duas a
   *  escrever no mesmo documento — a segunda escreveria por cima da primeira. */
  const [aTraduzir, setATraduzir] = useState(false);
  /**
   * O servidor tem serviço de tradução configurado?
   *
   * Pergunta-se, não se adivinha: a chave vive do lado do servidor e o estúdio
   * corre no navegador, onde ela nunca pode chegar. Começa em `"desligada"` — o
   * lado seguro: um botão desligado que diz porquê é melhor do que um botão que
   * promete uma tradução que não vai acontecer.
   *
   * ── E SÃO TRÊS ESTADOS E NÃO DOIS, PORQUE A FRASE MUDA ────────────────────
   *
   * `"indisponivel"` — a pergunta não chegou a ter resposta — desliga o botão
   * exactamente como `"desligada"`, e isso está certo. O que não pode ser igual
   * é o que se lê por baixo: «ainda não está ligada neste servidor» é uma
   * afirmação sobre a CONFIGURAÇÃO, e dita sobre uma sessão caducada manda-a
   * procurar uma chave em falta em vez de recarregar a página.
   */
  const [traducao, setTraducao] = useState<EstadoDaTraducao>("desligada");
  const traducaoLigada = traducao === "ligada";
  const [confirmSend, setConfirmSend] = useState(false);
  /**
   * O que a composição cortou no documento que estava a seguir — `null`
   * enquanto ninguém perguntou nada.
   *
   * Não é um estado de erro: é uma pergunta que o servidor devolveu com o PDF
   * já desenhado e nada ainda gravado nem enviado. Ver `send`.
   */
  const [cortesPorConfirmar, setCortesPorConfirmar] = useState<Corte[] | null>(null);
  /**
   * ── A MENSAGEM QUE SEGUE COM A PROPOSTA ───────────────────────────────────
   *
   * Palavras dela: «quando eu vou enviar a proposta, quero que também dê para
   * enviar uma mensagem juntamente com a proposta». O email levava uma frase
   * fixa e mais nada; esta caixa é o que ela escreve ao casal, e vai no MESMO
   * email da proposta (ver `proposta-doc/route.ts`, que explica onde entra).
   *
   * NÃO faz parte do `doc`: não é conteúdo da proposta, não vai ao PDF, não
   * fica guardado com o documento. É a nota que acompanha ESTE envio, e por
   * isso vive ao lado do rascunho (`SIDE_KEY`), como o `refEdited` e os mapas
   * de apoio.
   *
   * Também não é tocada pelo «Limpar» nem pelo «Repor versão»: esses gestos são
   * sobre o DOCUMENTO (e são reversíveis por dez segundos, com o documento e o
   * preço lá dentro). Deitar fora, ao mesmo tempo, um texto que está escrito no
   * ecrã do passo 3 seria uma perda a mais que a anulação não sabia desfazer.
   */
  const [mensagemAoCliente, setMensagemAoCliente] = useState("");
  /**
   * ── O EMAIL QUE VAI SAIR ─────────────────────────────────────────────────
   *
   * O corpo, o assunto e o modelo de que eles partem vivem AQUI e não dentro do
   * `EmailDoEnvio`, por uma razão só: é este componente que carrega no botão, e
   * o que se envia tem de ser o que está na caixa nesse instante. O ecrã do
   * email preenche-os a partir do servidor e deixa-os editar; o `send` lê-os.
   *
   * Como a mensagem pessoal, não fazem parte do `doc`: são deste envio.
   */
  const [corpoDoEmail, setCorpoDoEmail] = useState("");
  const [assuntoDoEmail, setAssuntoDoEmail] = useState("");
  const [modeloDoEmail, setModeloDoEmail] = useState("");
  /**
   * Quantos bytes tinha o PDF da ÚLTIMA pré-visualização, para o ecrã do email
   * poder confirmar o tamanho do anexo com um número medido em vez de estimado.
   * `null` para quem foi direito ao passo 3 sem gerar nada — aí fica a
   * estimativa, e diz-se que é uma estimativa.
   */
  const [bytesDoPdf, setBytesDoPdf] = useState<number | null>(null);
  /**
   * O link de aceitação da proposta MAIS RECENTE que saiu mesmo para o
   * cliente, para o botão «Copiar resumo». `null` até se saber que existe —
   * nunca um link a adivinhar. Vem de duas fontes: a leitura ao abrir o
   * estúdio (`GET`, em baixo — cobre reabrir o estúdio de uma proposta já
   * enviada numa sessão anterior) e a resposta do próprio envio (`send`, mais
   * abaixo — actualiza-o já, sem esperar por um segundo pedido).
   */
  const [linkDaProposta, setLinkDaProposta] = useState<string | null>(null);
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
  /** A falta que a Conferência mandou visitar — ver `irParaAFalta`. */
  const [faltaAVisitar, setFaltaAVisitar] = useState<{
    seccao?: string;
    campo?: string;
    /** Contador, para pedir DUAS vezes o mesmo sítio voltar a saltar. */
    pedido: number;
  } | null>(null);
  const [campoAVisitar, setCampoAVisitar] = useState<{
    campo: CampoPublicado;
    /** Contador de pedidos. Carregar duas vezes na mesma palavra tem de saltar
     *  as duas — e é ele que evita limpar o alvo DENTRO do efeito. */
    pedido: number;
    /** A qual das duas caixas. O painel «Por traduzir» manda à INGLESA, que é
     *  a que está por escrever; as gralhas mandam à portuguesa, onde a palavra
     *  está. */
    versao?: "pt" | "en";
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
          // Um rascunho que já traz traduções abre com as caixas inglesas à
          // vista, haja `meta` ou não: texto que existe no documento e não
          // aparece no ecrã é texto que se perde sem ninguém dar por isso.
          if (docTemIngles(parsed)) setBilingue(true);
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
        /**
         * A mensagem que acompanha o envio volta com o rascunho. Escrevê-la é
         * trabalho como o resto — fechar o separador para ir ver uma data não
         * pode deitá-la fora.
         *
         * Lê-se AQUI, dentro do efeito que corre uma vez só (ver o bloco de
         * cima, «CORRE UMA VEZ SÓ»): pô-la noutro efeito era abrir a porta ao
         * mesmo defeito que aquele comentário conta — a segunda passagem do
         * modo estrito a ler o que a gravação automática acabou de escrever.
         * Rascunhos guardados antes de esta caixa existir não têm o campo:
         * abrem na mesma, com a caixa vazia.
         */
        if (typeof meta?.mensagem === "string") setMensagemAoCliente(meta.mensagem);
        /**
         * O interruptor «Proposta bilingue» volta com o rascunho — e lê-se AQUI
         * pela razão que o bloco de cima conta: um `useEffect` novo a ler o
         * `localStorage` é a porta por onde o defeito do restauro voltaria a
         * entrar. Uma linha, no mesmo bloco, com a mesma tolerância a rascunhos
         * antigos que não o têm.
         *
         * `if (…) setBilingue(true)` e não `setBilingue(meta.bilingue)`: um
         * `meta` gravado com `false` não pode desligar um interruptor que o
         * documento restaurado acabou de acender (ver logo a seguir).
         */
        if (meta?.bilingue === true) setBilingue(true);
        /**
         * ── A LÍNGUA ESCOLHIDA VOLTA COM O RASCUNHO ─────────────────────────
         *
         * Aqui dentro, no efeito que corre uma vez só, pela razão que o bloco
         * de cima conta.
         *
         * E ao contrário do interruptor bilingue, esta lê-se NOS DOIS SENTIDOS
         * (`setIdiomaDoPdf(meta.idioma)` e não `if (…=== "en")`): o interruptor
         * tem uma segunda fonte — o documento com traduções lá dentro acende-o
         * sozinho —, a língua não tem nenhuma. Guardar só o «en» era guardar
         * metade da escolha, e voltar atrás para português deixava de pegar.
         *
         * Porque é que isto tem de sobreviver: a língua vai GRAVADA com o
         * envio. Decide o email que o casal recebe, o nome do anexo, a página
         * onde ele responde e a segunda descarga. Reposta em silêncio, uma
         * proposta escrita e revista em inglês seguia em português para um
         * casal que não lê português — e no ecrã nada tinha dito que a escolha
         * se perdeu. Rascunhos guardados antes disto existir não trazem o
         * campo: abrem em português, que é o que já faziam.
         */
        if (ehIdiomaDaProposta(meta?.idioma)) setIdiomaDoPdf(meta.idioma);
      }
    } catch {
      /* ignore corrupt draft */
    }
    // Só semeia defaults quando NÃO havia rascunho guardado — um rascunho
    // existente (mesmo sem grupos) nunca é sobrescrito.
    if (!hadDraft) {
      setDoc((d) => seedDefaults(d, quote));
      // E marca o que veio do pedido, pela mesma condição: um rascunho é
      // trabalho DELA, e pedir-lhe que confirme o que ela própria escreveu é o
      // caminho mais curto para o anel laranja deixar de querer dizer alguma
      // coisa. Ver `camposVindosDoPedido`.
      setPorConfirmar(new Set(camposVindosDoPedido(initialDoc(quote))));
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
    // SÓ quando não havia rascunho nenhum. Ver o bloco «A ABERTURA TAMBÉM NÃO
    // É TRABALHO POR GRAVAR»: abrir um pedido virgem é semear o que veio do
    // pedido, e isso não se grava; abrir um pedido COM rascunho é outra coisa
    // — o restauro corrige o que lá está (tira marcadores provisórios de fotos
    // que nunca chegaram a existir, acerta o total pelo «Preço final» do
    // pedido) e essas correcções TÊM de ficar gravadas.
    if (!hadDraft) aAbrir.current = true;
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
   * O rascunho chegou ao servidor, e o servidor disse que o sítio não dura.
   *
   * Mesmo desenho do `registarSoLocal`, e de propósito: o indicador passa a
   * dizê-lo enquanto for verdade, e o aviso grande sai UMA vez. A frase é a do
   * servidor — quem lê isto é quem vai ter com quem gere a instalação, e uma
   * frase com o nome da variável poupa-lhe a viagem de descobrir qual é.
   *
   * NÃO se oferece «tentar outra vez»: a tentativa seguinte cai no mesmo disco.
   * O que resolve isto é ligar a base de dados, e é isso que a frase diz.
   */
  const registarNaoDura = useCallback(
    (aviso?: string) => {
      setNaoDuraAoDeploy({ aviso });
      if (avisouNaoDura.current) return;
      avisouNaoDura.current = true;
      toast(
        aviso ??
          "Este rascunho ficou guardado apenas no disco do servidor, que é apagado no próximo deploy.",
        "error",
      );
    },
    [toast],
  );

  /** O sítio voltou a durar (ligaram a base de dados). Limpa e rearma, pela
   *  mesma razão do `marcarGuardadoNoServidor`. */
  const marcarQueDura = useCallback(() => {
    setNaoDuraAoDeploy(null);
    avisouNaoDura.current = false;
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
          // Só um `false` EXPLÍCITO alarma — ver `duradouro`. Um servidor que
          // não diga nada é tratado como sempre foi.
          if (r.duradouro === false) registarNaoDura(r.aviso);
          else marcarQueDura();
        } else {
          registarSoLocal(r.porque);
        }
        return r;
      } finally {
        setAGravarNoServidor((n) => Math.max(0, n - 1));
      }
    },
    [quote.id, marcarGuardadoNoServidor, registarSoLocal, registarNaoDura, marcarQueDura],
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
      /**
       * ── E OS CAMPOS EM QUE ELA JÁ ESTÁ COM AS MÃOS FICAM DE FORA ────────
       *
       * Ver o bloco do `camposTocados`, mais abaixo. Sem isto, escrever no
       * primeiro segundo depois de o ecrã abrir perdia o princípio da frase —
       * medido, sete rondas em oito.
       */
      const semOsQueElaTocou = Object.fromEntries(
        Object.entries(doDoServidor).filter(([chave]) => !camposTocados.current.has(chave)),
      ) as Partial<StudioDoc>;
      // A abertura ACABA AQUI quando há rascunho no servidor.
      //
      // Sem isto, o que este merge produz — o rascunho do servidor com o preço
      // do pedido por cima, e sem os marcadores provisórios — ficava por
      // gravar: era «a abertura», e a abertura não se grava. Mas isto não é
      // uma abertura derivada do pedido, é trabalho vindo de outro dispositivo
      // com uma correcção aplicada em cima. Ver o bloco «A ABERTURA TAMBÉM NÃO
      // É TRABALHO POR GRAVAR».
      aAbrir.current = false;
      setDoc((d) => {
        const merged = { ...d, ...semOsQueElaTocou };
        const limpo = stripPendingImages({
          ...merged,
          coverImages: normaliseCoverImages(merged.coverImages),
        });
        return mandaOPedido ? aplicarBase(limpo, doPedido) : limpo;
      });
      // O que estava marcado como «vindo do pedido» deixou de estar no ecrã: o
      // que se vê agora é o rascunho dela, feito noutro dispositivo. Manter os
      // anéis pedia confirmação de texto que ela já escreveu — e o anel só vale
      // enquanto quiser dizer «isto não é teu».
      setPorConfirmar(new Set());
      const base = mandaOPedido ? doPedido : baseDoDoc(doDoServidor);
      if (base != null && !camposTocados.current.has("__total")) {
        setTotalInput(textoDoTotal(base));
      }
      // O documento do servidor pode trazer traduções que este computador nunca
      // viu — é o caso de abrir a proposta noutro portátil. As caixas inglesas
      // acendem-se, pela mesma razão do restauro local.
      if (docTemIngles(doDoServidor)) setBilingue(true);
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
        // «A caminho» também no reenvio: uma segunda tentativa que aparecesse
        // como «falhou» até responder era um botão que parece não fazer nada.
        setEstadoDosUrls("a-caminho");
        try {
          const res = await fetch(`/api/orcamento/${quote.id}/assets`);
          if (!res.ok) {
            // Um 401 (sessão caducada) e um 500 (Storage em baixo) davam os
            // dois a mesma coisa: nada. O registo diz qual foi, e o ecrã diz
            // que não conseguiu — em vez de o esconder atrás de uma caixa
            // cinzenta que se lê como «esta foto não existe».
            log.warn("estúdio: não deu para ir buscar as fotografias", {
              estado: res.status,
            });
            if (vivo()) setEstadoDosUrls("falhou");
            return;
          }
          const data = await res.json().catch(() => null);
          const imgs: { path: string; url: string; thumbUrl?: string; cor?: string }[] =
            Array.isArray(data?.images) ? data.images : [];
          if (!vivo()) return;
          // Zero fotografias É uma resposta: uma proposta sem fotos nenhumas
          // não tem células, e um pedido que respondeu vazio não é um pedido
          // que falhou.
          if (imgs.length === 0) {
            setEstadoDosUrls("pronto");
            return;
          }
          /**
           * O guardado só conta se ainda for um candidato: um URL que uma
           * célula desta sessão já viu morrer (403/404) não pode ganhar ao
           * fresco só por ter o prazo em dia. Ver `urlsMortos`.
           */
          const vivo_ = (u?: string) => (u && urlsMortos.current.has(u) ? undefined : u);
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
                next[im.path] = urlAindaBom(vivo_(next[im.path]), im.thumbUrl || im.url);
            return next;
          });
          // O original fica guardado à parte, para a célula ter para onde cair
          // quando a miniatura não existir.
          setAssetOriginais((prev) => {
            const next = { ...prev };
            for (const im of imgs)
              if (im.path && im.url) next[im.path] = urlAindaBom(vivo_(next[im.path]), im.url);
            return next;
          });
          // As cores não expiram (não são URLs assinados): uma vez conhecidas,
          // ficam. Uma foto que volte sem cor não apaga a que já se sabia.
          setAssetCores((prev) => {
            const next = { ...prev };
            for (const im of imgs) if (im.path && im.cor) next[im.path] = im.cor;
            return next;
          });
          setEstadoDosUrls("pronto");
        } catch (e) {
          // Offline, ou o Storage em baixo. O estúdio continua a servir para
          // carregar fotos — o que não continua a servir é fingir que as que já
          // lá estão simplesmente não existem.
          log.warn("estúdio: não deu para ir buscar as fotografias", { erro: String(e) });
          if (vivo()) setEstadoDosUrls("falhou");
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

  /**
   * ── HÁ SERVIÇO DE TRADUÇÃO NESTE SERVIDOR? ────────────────────────────────
   *
   * Uma pergunta, uma vez, ao abrir. A chave vive do lado do servidor — nunca
   * pode chegar ao navegador —, portanto o estúdio não tem como saber sozinho.
   *
   * Falhando (sem rede, sessão caducada), o botão fica desligado — o lado
   * seguro, e é o que já fazia. O que MUDOU é que a falha se distingue de um
   * «não»: `"indisponivel"` e não `"desligada"`, para a frase por baixo do
   * botão não culpar a configuração de um problema que não é dela. Nada aqui lê
   * o `localStorage`, e por isso não pisa o efeito de restauro (ver o bloco
   * «CORRE UMA VEZ SÓ»).
   */
  useEffect(() => {
    let vivo = true;
    void estadoDaTraducao().then((estado) => {
      if (vivo) setTraducao(estado);
    });
    return () => {
      vivo = false;
    };
  }, []);

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
   * efeito correr outra vez — aí sim, com a versão boa à mão. O que essa
   * segunda passagem NÃO é está logo a seguir.
   */
  const montagem = useRef(true);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A ABERTURA TAMBÉM NÃO É TRABALHO POR GRAVAR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A segunda passagem deste efeito é sempre a da ABERTURA: o restauro do
   * rascunho, ou — quando não há rascunho — o `seedDefaults` com o que veio do
   * PEDIDO (os pontos de decoração que o casal marcou, o preço final, a regra
   * dos adicionais). Nenhuma dessas coisas foi escrita por ela, e marcá-las
   * como trabalho por gravar custava duas coisas:
   *
   *   1. cada pedido ABERTO PARA LER deixava uma linha de rascunho gravada, e
   *      cada troca de separador pagava um PUT para reescrever o que já lá
   *      estava — que é o que o comentário de cima já descrevia;
   *   2. o «Guardar tudo (1)» acendia por nada, várias vezes por hora. É esse
   *      botão que ela olha antes de fechar o portátil, e um alarme que mente é
   *      um alarme que se deixa de ver.
   *
   * Nada se perde: a semeadura é DERIVADA do pedido e reabrir volta a produzir
   * o mesmo documento, e o restauro é a leitura do que já está gravado. Assim
   * que ela escrever a primeira letra, grava-se tudo — semeadura incluída.
   *
   * ── PORQUE É QUE ISTO NÃO PODE ENGOLIR TRABALHO A SÉRIO ───────────────────
   *
   * O silêncio só vale enquanto o documento for IGUAL ao da abertura, e só até
   * à primeira gravação. Depois de haver rascunho gravado, voltar ao estado de
   * abertura é uma alteração como outra qualquer — e tem de ser gravada, senão
   * o que fica no servidor é a versão do meio.
   */
  const aAbrir = useRef(false);
  const marcaDaAbertura = useRef<string | null>(null);
  const jaGravou = useRef(false);
  /** O que se compara com a abertura: só o que é TRABALHO DELA. Os mapas de
   *  apoio (`assetUrls`, `themeOrigins`) ficam de fora de propósito — são
   *  memória de endereços que a hidratação vai buscar ao servidor, e mudam
   *  sozinhos depois de o ecrã abrir. */
  const marcaDoTrabalho = useCallback(
    () => JSON.stringify([doc, refEdited, mensagemAoCliente, bilingue, idiomaDoPdf]),
    [doc, refEdited, mensagemAoCliente, bilingue, idiomaDoPdf],
  );
  /** Não há nada por gravar: o que está no ecrã é a abertura, e ainda não se
   *  gravou nada. Vale para o indicador E para a gravação — se só valesse para
   *  o indicador, o alarme calava-se e o PUT continuava a sair, que é meia
   *  correcção com o aspecto de uma inteira. */
  const nadaPorGravar = useCallback(
    // `null` (a marca ainda não foi tirada) NUNCA é igual a uma marca: quando
    // há rascunho guardado a abertura não se marca de todo, e o estúdio grava
    // como sempre gravou.
    () => !jaGravou.current && marcaDaAbertura.current === marcaDoTrabalho(),
    [marcaDoTrabalho],
  );
  /**
   * E a abertura acaba no PRIMEIRO GESTO DELA — não num relógio.
   *
   * É o único sinal honesto: um relógio ou uma contagem de passagens fazia a
   * fronteira depender da velocidade da rede desta manhã, e a partir daí
   * haveria manhãs em que a primeira letra escrita não contava como trabalho.
   * Daqui para a frente, tudo o que mexer no documento é dela até prova em
   * contrário.
   */
  useEffect(() => {
    const fechar = () => {
      aAbrir.current = false;
    };
    // `input` e `change` estão aqui por uma razão que não é teórica: nem toda a
    // escrita passa por uma tecla. O preenchimento automático do browser, um
    // gestor de palavras-passe, a ditadura de voz e os passeios automáticos
    // escrevem o valor e disparam só `input` — sem `keydown`. Sem estes dois,
    // esse texto ficava do lado da «abertura» e não era gravado.
    const gestos = ["pointerdown", "keydown", "input", "change", "drop", "paste"] as const;
    for (const g of gestos) window.addEventListener(g, fechar, true);
    return () => {
      for (const g of gestos) window.removeEventListener(g, fechar, true);
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    if (montagem.current) {
      montagem.current = false;
      return;
    }
    if (aAbrir.current) {
      // Enquanto durar a abertura, o que está no ecrã É a abertura. Não se
      // fixa na primeira passagem porque a abertura não é uma: o restauro (ou
      // a semeadura) é a primeira, e atrás dela vêm as derivadas — os
      // identificadores estáveis dos grupos e das linhas, o merge do rascunho
      // do servidor, as fotos que a hidratação vai buscar. Nenhuma delas é
      // trabalho dela, e fixar a marca antes de todas fazia o alarme acender
      // por causa de um `id` que o próprio estúdio acabou de escrever.
      marcaDaAbertura.current = marcaDoTrabalho();
      return;
    }
    if (nadaPorGravar()) return;
    porGravarRef.current = true;
    setPorGravar(true);
    // A mensagem do envio conta como trabalho por gravar: sem ela nesta lista, o
    // indicador dizia «guardado às 14:32» com o texto dela ainda por escrever no
    // rascunho — e é essa frase que faz uma pessoa fechar o portátil descansada.
  }, [doc, assetUrls, themeOrigins, refEdited, mensagemAoCliente, bilingue, nadaPorGravar]);

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
            // A nota que segue com o envio. Fica ao lado do rascunho e não
            // dentro dele: não é conteúdo da proposta e não pode entrar no
            // documento que é gravado, enviado e reaberto.
            mensagem: mensagemAoCliente,
            // O interruptor das caixas inglesas. É CONVENIÊNCIA e não
            // correcção: se este `meta` se perder, o interruptor abre ligado na
            // mesma quando o documento tem traduções lá dentro. Nenhum trabalho
            // dela depende de isto sobreviver.
            bilingue,
            // A língua escolhida. Ao lado do rascunho e não dentro dele: não é
            // conteúdo da proposta — o mesmo documento sai nas duas línguas —,
            // é a escolha que ela fez para ESTE envio. E é a única das três
            // linhas daqui que, perdida, muda o que o cliente recebe.
            idioma: idiomaDoPdf,
          }),
        );
        setGravadoEm(new Date());
        // A partir daqui há rascunho gravado, e voltar ao estado de abertura
        // deixa de ser «nada por gravar» — ver o bloco da abertura.
        jaGravou.current = true;
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
    // A abertura não se grava. O `flushDraft` fica montado à mesma — o
    // Ctrl/Cmd+Enter dos Serviços tem de continuar a poder gravar à ordem —,
    // mas o relógio dos 800 ms não arranca por causa de um documento que
    // ninguém escreveu. Ver o bloco «A ABERTURA TAMBÉM NÃO É TRABALHO POR
    // GRAVAR».
    if (nadaPorGravar()) return;
    const t = setTimeout(save, 800);
    return () => clearTimeout(t);
  }, [
    doc,
    assetUrls,
    assetOriginais,
    assetCores,
    themeOrigins,
    refEdited,
    // Sem isto, escrever na caixa da mensagem não voltava a agendar a gravação:
    // o texto ficava só na memória desta aba e o rascunho guardava a versão
    // anterior — que é o mesmo que não o guardar.
    mensagemAoCliente,
    // O mesmo para o interruptor: sem ele aqui, ligá-lo e fechar o separador
    // devolvia o ecrã de uma língua só na abertura seguinte.
    bilingue,
    // E o mesmo para a língua: sem ela aqui, escolher «Inglês» não voltava a
    // agendar a gravação, e o `meta` guardado continuava a dizer «pt».
    idiomaDoPdf,
    DRAFT_KEY,
    SIDE_KEY,
    quote.id,
    toast,
    enviarParaServidor,
    nadaPorGravar,
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

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O QUE ELA JÁ ESCREVEU NÃO É SUBSTITUÍDO PELO RASCUNHO QUE VEM A CAMINHO
   * ════════════════════════════════════════════════════════════════════════
   *
   * O estúdio vai buscar o rascunho ao servidor ao abrir, e o merge chega
   * 100–300 ms depois. Até aqui esse merge era `{ ...d, ...doServidor }` —
   * campo a campo, o servidor ganhava. Se ela começasse a escrever nesse
   * primeiro segundo, o princípio do que escreveu era apagado.
   *
   * MEDIDO: escrever `ABCDEFGHIJKLMNOPQRST` meio segundo depois de o ecrã
   * abrir, oito rondas — SETE perderam texto. Ficaram coisas como
   * `HIJKLMNOPQRST`, `MNOPQRST`, `QRST`. Em quatro caixas diferentes, e uma
   * delas (a «Cerimónia») ficou COMPLETAMENTE vazia. Não há erro nem aviso: a
   * frase fica truncada pela frente e é assim que vai no PDF para o casal.
   *
   * Guarda-se aqui QUE CAMPOS ela tocou desde que o ecrã abriu. O merge
   * continua a trazer tudo o resto do rascunho — as fotos, as condições, as
   * traduções feitas noutro computador — e deixa em paz só aquilo em que ela
   * está com as mãos.
   *
   * Só marcam os caminhos por onde a PESSOA escreve (`patch` e o editor de
   * serviços). Os `setDoc` do sistema — semear os textos fixos, aplicar o
   * preço do pedido, o próprio merge — não marcam nada, de propósito.
   */
  const camposTocados = useRef<Set<string>>(new Set());

  const patch = (p: Partial<StudioDoc>) => {
    for (const chave of Object.keys(p)) camposTocados.current.add(chave);
    setDoc((d) => ({ ...d, ...p }));
  };

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

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O CAMPO DO ESTÚDIO E O PREÇO DO PEDIDO PODEM NÃO SER O MESMO NÚMERO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Enquanto os adicionais estavam DENTRO do valor escrito, eram o mesmo: ela
   * escrevia 3.000, o pedido guardava 3.000, e a deslocação saía de lá de
   * dentro.
   *
   * Com «estas linhas somam-se», o campo passa a ser SÓ os serviços e o que o
   * casal paga é serviços mais adicionais. O «Preço final (sem IVA)» do pedido
   * tem de continuar a ser o que o casal paga sem IVA — é dele que a Visão
   * Geral, as Estatísticas e o dossier leem o dinheiro dos pedidos que ainda
   * não têm proposta enviada. Guardar lá só os serviços fazia as deslocações
   * DESAPARECEREM desses ecrãs, sem ninguém dar por isso.
   *
   * Por isso há duas conversões, e são inversas uma da outra:
   *   escrito -> pedido   soma os adicionais
   *   pedido  -> escrito  tira-os
   *
   * Quando os adicionais estão dentro do valor, as duas não fazem nada, e o
   * comportamento é exactamente o de sempre.
   */
  function baseDoEcraParaOPedido(base: number): number {
    if (!doc.budgetExtrasSomam) return base;
    return round2(
      base + somaDosExtrasSemIva(doc.budgetExtras, { mode: vatMode, vatRate: money.vatRate }),
    );
  }

  function baseDoPedidoParaOEcra(base: number, d: StudioDoc): number {
    if (!d.budgetExtrasSomam) return base;
    const mode: VatMode = d.totalVatMode ?? detectVatMode(d.totalText || d.totalEstimatedText);
    const semExtras = round2(
      base - somaDosExtrasSemIva(d.budgetExtras, { mode, vatRate: d.vatRate ?? DEFAULT_VAT_RATE }),
    );
    // Nunca negativo: um pedido com preço mais baixo do que os adicionais
    // escritos é um estado por arrumar, e o aviso de desalinhamento já o diz.
    return semExtras > 0 ? semExtras : 0;
  }

  /** O que se grava no pedido, com a mão travada: escrever "3000" são quatro
   *  teclas e não podem ser quatro gravações. */
  const gravarPreco = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** O último valor que ESTE ecrã mandou gravar — para a resposta que volta do
   *  servidor não disparar outra vez a sincronização e entrar em ciclo. */
  const precoEnviado = useRef<number | undefined>(quote.quotedPrice);

  function persistirPreco(escrito: number | undefined, opcoes?: { jaEfectivo: boolean }) {
    const base = escrito == null || opcoes?.jaEfectivo ? escrito : baseDoEcraParaOPedido(escrito);
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
    // O total não vive no `doc` (é um texto à parte), mas a regra é a mesma:
    // ver `camposTocados`. Sem esta marca, o merge do rascunho reescrevia a
    // caixa do total a meio de ela estar a escrever o valor.
    camposTocados.current.add("__total");
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

  /**
   * O dinheiro EFECTIVO deste documento: já com a regra dos valores adicionais
   * aplicada (dentro do valor escrito, ou a somar-lhe). É o que o casal vai
   * ver e pagar, portanto é o que o estúdio mostra e o que trava o envio.
   *
   * O `escrito` é o outro número, e existe para uma coisa só: o campo «Valor
   * (sem IVA)» e o que se diz ao alinhá-lo com a soma das linhas. Aí o que
   * interessa é o que ELA escreveu, não o total com os adicionais somados.
   */
  const money = dinheiroDaProposta(doc);
  const escrito = resolveProposalMoney(doc);
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
  /**
   * O resumo para o botão «Copiar resumo» — três ou quatro linhas prontas a
   * colar no WhatsApp. Os números são os de `totais` (`totaisDaProposta`),
   * que é o MESMO bloco que a barra do fundo e o passo «Enviar» já mostram;
   * não há aqui uma segunda conta.
   *
   * `eurDocumento` + `montanteNaLingua`: o mesmo par que o gerador do PDF usa
   * para escrever o dinheiro na língua do documento (ver `money.ts`) — para o
   * valor aqui não discordar do valor que o documento em anexo mostra.
   */
  const resumoParaCopiar = resumoDaPropostaParaCopiar(
    {
      clientNames: doc.clientNames ?? "",
      eventDate: camposDoEventoNaLingua(doc, idiomaDoPdf).eventDate ?? "",
      aPagar: montanteNaLingua(eurDocumento(totais.aPagar), idiomaDoPdf),
      link: linkDaProposta ?? undefined,
    },
    idiomaDoPdf,
  );
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
    // O número sai da MESMA lista que a vista de conjunto desenha. Eram duas
    // contas sobre o mesmo documento — «7 páginas» na vista e «cerca de 14» na
    // frase — e discordavam porque contavam coisas diferentes.
    `PDF com cerca de ${folhasAproximadas(doc as ProposalDoc)}${tempoDaProposta}`;

  /**
   * ── OS TÍTULOS QUE SE LÊEM COMO O MESMO NOME ────────────────────────────
   *
   * Um por board, e `undefined` na esmagadora maioria. Calculado uma vez para
   * a lista toda e não board a board: a pergunta é sobre PARES, e fazê-la
   * dentro do cartão dava um varrimento de todos os títulos por cada cartão
   * desenhado — oito páginas, sessenta e quatro comparações, a cada tecla
   * escrita num título.
   */
  const avisosDeTitulo = useMemo(() => {
    const por: Record<number, string> = {};
    for (const grupo of titulosParecidos(doc as ProposalDoc)) {
      for (const bi of grupo.bis) {
        const aviso = avisoDeTituloParecido(doc as ProposalDoc, bi);
        if (aviso) por[bi] = aviso;
      }
    }
    return por;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.moodBoards, doc.serviceGroups, doc.ordemExplicita]);

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

  /**
   * ── A ÚNICA REPETIÇÃO QUE SE DESENHA NA GRELHA ──────────────────────────
   *
   * A mesma fotografia em duas páginas do MESMO documento. É quase sempre um
   * engano, é o único caso em que o casal vê a mesma fotografia duas vezes na
   * proposta que recebe, e é a única das três perguntas que se resolve sem
   * sair desta página — está ali, na grelha ao lado.
   *
   * Marcada NAS DUAS: a contagem é sobre o documento inteiro, portanto as duas
   * células acendem. Assinalar só a segunda obrigava a procurar a primeira.
   *
   * ── E PORQUE É QUE AS OUTRAS DUAS NÃO ACENDEM AQUI ──────────────────────
   * «Já usada noutro casamento» e «já usada no mesmo espaço» são verdadeiras e
   * úteis, mas esta página já pode acender sete avisos ao mesmo tempo (página
   * cheia, fotos fora do PDF, fila desequilibrada, fotos cortadas, foto que
   * destoa da paleta…). Cada aviso novo torna os outros menos lidos. As duas
   * vivem onde a decisão se toma — no selector da biblioteca, que já as mostra
   * — e aqui contam-se ao rato, em `passadoDaFoto`, sem acender nada.
   */
  function repeticaoNestaProposta(caminho: string): { texto: string; grave: boolean } | null {
    const vezesAqui = ondeEstaCadaFoto.get(caminho) ?? 0;
    if (vezesAqui <= 1) return null;
    // CURTO porque a tira é `truncate` e a célula, a 390 px numa grelha de três
    // colunas, tem ~110 px de largura: «Esta fotografia está 2 vezes nesta
    // proposta.» a 8 px sai «Esta fotografia es…», que é uma frase que não diz
    // nada. A frase inteira fica no texto do rato, onde há espaço.
    return { texto: `${vezesAqui}× nesta proposta`, grave: true };
  }

  /**
   * O que se conta ao passar o rato: de que foto da biblioteca veio esta, e para
   * onde ela já foi. Não acende nada no ecrã — é a resposta à pergunta «esta
   * foto já não a usei?», dada a quem a faz.
   */
  function passadoDaFoto(caminho: string): string | undefined {
    const origem = themeOrigins[caminho];
    const f = origem ? repetidasPorOrigem.get(origem) : undefined;
    if (!f) return origem;
    const mesmoEspaco = noMesmoEspaco(f, quote.location || undefined);
    // A repetição DENTRO desta proposta não vem aqui: a `CelulaDeFoto` já lhe
    // cola o texto da tira ao fim do título. Repeti-la era dizer duas vezes a
    // mesma coisa no mesmo balão.
    return [
      origem,
      mesmoEspaco.length > 0
        ? `Já foi para ${mesmoEspaco[0].cliente}, no mesmo espaço.`
        : `Já usada — ${comoSeDiz(f)}.`,
    ]
      .filter(Boolean)
      .join(" · ");
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
   * Os preços, os custos, as escalas e as marcas de extra são arrays PARALELOS
   * às linhas — viajam todos com a mesma permutação ou o orçamento trocava os
   * preços de sítio, que é um erro que só se vê quando o cliente pergunta.
   *
   * ── PORQUE É QUE A LISTA NÃO SE ESCREVE AQUI À MÃO ────────────────────────
   * Escrevia-se, e faltava-lhe um: o `budgetOpcional`. A marca de «extra»
   * ficava para trás na permutação, portanto «Arrumar eu» deixava-a na rubrica
   * errada — o PDF imprimia «extra» ao lado da linha que não era, e a versão
   * sem extras ficava cem euros ao lado da verdade. Uma segunda lista dos
   * arrays paralelos é uma lista que se esquece do array seguinte.
   *
   * A lista verdadeira é a de `proposal-budget` (o `PARALELOS` que o
   * `adicionarLinha`/`removerLinha` usam). Não é exportada, mas o TIPO dela é
   * alcançável pela assinatura do `adicionarLinha` — e com o `satisfies` lá em
   * baixo a exigir que estejam cá todas, esquecer uma passa a ser erro de
   * compilação em vez de um extra na linha errada.
   */
  type ArrayParaleloDaLinha = Omit<Parameters<typeof adicionarLinha>[0], "budgetItems">;

  function arrumadoEExplicito(d: StudioDoc): StudioDoc {
    const linhas = linhasDe(d);
    const ordemL = ordemDeSaida(d as ProposalDoc, linhas, (l) => l.item ?? "");
    const ordemB = ordemDeSaida(d as ProposalDoc, d.moodBoards, (b) => b.title ?? "");
    const paralelo = <T,>(arr: T[] | undefined) =>
      arr === undefined ? undefined : aplicarOrdem(arr, ordemL);
    // `satisfies` e não uma anotação de tipo: exige que estejam cá TODAS as
    // chaves paralelas, sem trocar o tipo exacto de cada array por um tipo
    // comum — que era o que faria o spread lá em baixo deixar de casar.
    const paralelos = {
      budgetAmounts: paralelo(d.budgetAmounts),
      budgetCosts: paralelo(d.budgetCosts),
      budgetScales: paralelo(d.budgetScales),
      budgetOpcional: paralelo(d.budgetOpcional),
      // A rubrica em inglês vai com a rubrica. Sem esta linha, «Alinhar pelos
      // Serviços» punha a tradução da Cerimónia na linha do Cocktail — e o PDF
      // inglês saía com a rubrica errada, sem nada a assinalá-lo. Foi o
      // `satisfies` daqui de baixo que obrigou a escrevê-la.
      budgetItemsEn: paralelo(d.budgetItemsEn),
    } satisfies Record<keyof ArrayParaleloDaLinha, unknown>;
    return {
      ...d,
      ordemExplicita: ORDEM_EXPLICITA,
      budgetItems: aplicarOrdem(d.budgetItems ?? [], ordemL),
      ...paralelos,
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
    setDoc((d) => {
      const mode: VatMode = d.totalVatMode ?? detectVatMode(d.totalText || d.totalEstimatedText);
      // O pedido guarda o que o casal paga sem IVA; o campo do estúdio mostra
      // só a parte dos serviços quando os adicionais somam. Ver o par de
      // conversões acima.
      const paraOEcra =
        typeof doPedido === "number" && doPedido > 0
          ? baseDoPedidoParaOEcra(doPedido, d)
          : undefined;
      setTotalInput(paraOEcra != null && paraOEcra > 0 ? textoDoTotal(paraOEcra) : "");
      const amount =
        paraOEcra != null && paraOEcra > 0
          ? totalAmountParaBase(paraOEcra, mode, d.vatRate ?? DEFAULT_VAT_RATE)
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
      // ── E A MESMA MEDIDA SERVE A QUEM FLUTUA POR CIMA ──────────────────
      // O aviso do `Toast.tsx` põe-se a uma distância fixa do fundo — a altura
      // da navegação do telemóvel mais um respiro — e essa distância cai
      // exactamente dentro desta barra, que pousa nessa mesma navegação. Sem
      // isto, um aviso de gravação falhada nasce por cima do botão
      // «Pré-visualizar» e come-lhe o toque durante quatro segundos.
      // Publicamos a altura MEDIDA (a barra quebra em duas linhas quando o
      // passo o pede, e aí é mais alta) para o aviso se afastar tanto quanto
      // preciso e nem um pixel mais. Só existe enquanto o estúdio estiver
      // aberto: a limpeza do efeito devolve-a a zero.
      document.documentElement.style.setProperty("--bo-barra-accao", `${Math.ceil(r.height)}px`);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    window.addEventListener("resize", medir);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
      document.documentElement.style.removeProperty("--bo-barra-accao");
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

  /**
   * Insere o parágrafo do que mudou (painel Versões) na caixa "Mensagem para
   * o cliente" — NUNCA directamente no email. É a mesma caixa que já viaja
   * com o envio (ver `send`, mais abaixo), por isso não é preciso mais nada
   * para ela poder acompanhar a proposta.
   *
   * Uma caixa vazia recebe o parágrafo tal como está. Uma caixa que já tem
   * algo escrito por ela (uma nota pessoal, por exemplo) NÃO é substituída —
   * o parágrafo entra a seguir, com uma linha em branco pelo meio, para não
   * apagar trabalho.
   */
  function inserirParagrafoDoQueMudou(texto: string) {
    setMensagemAoCliente((actual) => {
      const escrita = actual.trim();
      return escrita ? `${escrita}\n\n${texto}` : texto;
    });
    toast("Parágrafo inserido na mensagem para o cliente. Revê antes de enviar.", "info");
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
    // Limpar volta a pôr no ecrã o que o pedido diz — e o que o pedido diz
    // volta a estar por confirmar.
    setPorConfirmar(new Set(camposVindosDoPedido(initialDoc(quote))));
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
    lqip?: string | null,
  ): Promise<{ path: string; url: string; thumbUrl?: string; cor?: string }> {
    const post = () => {
      const form = new FormData();
      form.append("files", file);
      // O LQIP — a mancha de cor que ocupa a célula enquanto a fotografia não
      // chega. Sai da MESMA descodificação que já calculou a cor e a miniatura
      // (`image-prep`), portanto não custa nada, e sem ele a página do casal
      // abre com rectângulos vazios: o caminho da Biblioteca de Temas gravava-o
      // e este não, e por isso a mesma página tinha metade das células com
      // placeholder e a outra metade sem.
      if (lqip) form.append("lqips", lqip);
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
    setUploading((u) => ({ ...u, [key]: { feito: 0, total: files.length } }));
    /**
     * Mais uma arrumada — e conta tanto a que subiu como a que falhou.
     *
     * A barra retrata o que JÁ NÃO SE ESPERA, e uma foto que falhou também
     * deixou de se esperar: contar só as boas deixava a barra a faltar-lhe um
     * bocado para sempre, num lote com um ficheiro mau. O que correu mal
     * continua a ser dito pelo `toast`, no fim e com o número.
     */
    const maisUma = () =>
      setUploading((u) => {
        const p = u[key];
        if (!p) return u;
        return { ...u, [key]: { ...p, feito: Math.min(p.total, p.feito + 1) } };
      });
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
          const im = await uploadOne(prepared.file, prepared.thumb, prepared.cor, prepared.lqip);
          // Guardado pelo ÍNDICE: as vias acabam fora de ordem e a ordem das
          // fotos escolhidas é a que a Catarina vê no documento.
          results[i] = { path: im.path };
        } catch (e) {
          errors.push(e instanceof Error ? e.message : `Falha ao carregar "${f.name}".`);
        } finally {
          maisUma();
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
      // A chave SAI do mapa: «não está a carregar nada» é a ausência, e não um
      // `{feito, total}` velho à espera de ser lido como se fosse de agora.
      setUploading((u) => {
        if (!(key in u)) return u;
        const resto = { ...u };
        delete resto[key];
        return resto;
      });
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
      // Ver `camposTocados`: o editor de serviços é o outro caminho por onde a
      // PESSOA escreve, e é onde o texto perdido foi medido primeiro.
      camposTocados.current.add("serviceGroups");
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

    // ── ISTO DEIXA DE SER MUDO ────────────────────────────────────────────
    // O bloco aparece na proposta no instante do clique e as fotos vêm a
    // seguir, num pedido só que demora de dois a vinte segundos. Não havia
    // sinal nenhum disso — só um toast lá ao fim, e apenas quando corria mal.
    setFotosACopiar((n) => n + deOutroPedido.length);
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
    } finally {
      setFotosACopiar((n) => Math.max(0, n - deOutroPedido.length));
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
    // A caixa inglesa leva o mesmo `data-campo` com `:en` colado — o salto
    // encontra-a com a maquinaria que já existe, sem uma segunda.
    const chave = chaveDoCampo(campoAVisitar.campo) + (campoAVisitar.versao === "en" ? ":en" : "");
    const alvo =
      document.querySelector<HTMLElement>(`[data-campo="${chave}"]`) ??
      document.getElementById(seccaoDoCampo(campoAVisitar.campo));
    alvo?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) {
      alvo.focus({ preventScroll: true });
      alvo.select();
    }
  }, [campoAVisitar]);

  /** O salto da Conferência, depois de a secção estar aberta e desenhada. */
  useEffect(() => {
    if (!faltaAVisitar) return;
    const { seccao, campo } = faltaAVisitar;
    const cartao = seccao ? document.getElementById(`seccao-${seccao}`) : null;
    // `:scope > div >` e não um `querySelector` solto: dentro de uma secção há
    // outros botões com `aria-expanded` (os mood boards têm as suas dobras), e
    // o primeiro fechado que aparecesse era o que abria — que podia ser outro
    // qualquer, algures no meio do cartão.
    cartao
      ?.querySelector<HTMLButtonElement>(':scope > div > button[aria-expanded="false"]')
      ?.click();
    // Num tique a seguir: o campo só está VISÍVEL depois de o clique acima ter
    // sido processado, e focar um elemento escondido não faz nada.
    const espera = setTimeout(() => {
      const alvo =
        (campo && document.querySelector<HTMLElement>(`[data-campo="${campo}"]`)) || cartao;
      alvo?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) {
        alvo.focus({ preventScroll: true });
        alvo.select();
      }
    }, 0);
    return () => clearTimeout(espera);
  }, [faltaAVisitar]);

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
  /**
   * A caixa inglesa de um campo — ou nada, com o interruptor desligado.
   *
   * Um só sítio a desenhá-las: são catorze famílias de campo espalhadas por
   * duas secções e dois ficheiros, e catorze cópias desta caixa eram catorze
   * sítios onde o `data-campo`, o `aria-label` ou a marca de «por traduzir`
   * podiam divergir. Ver `CaixaInglesa.tsx`.
   */
  function caixaDeIngles(
    campo: CampoDeTexto,
    rotulo: string,
    opts: {
      className?: string;
      as?: "input" | "textarea";
      rows?: number;
      /** A caixa cresce com o texto, a partir de uma linha — ver `CaixaInglesa`. */
      cresce?: boolean;
      readOnly?: boolean;
      placeholder?: string;
      /**
       * Este par NÃO fica lado a lado.
       *
       * A marca é ao contrário — todas ficam, e diz-se quais não — porque o
       * desenho normal passa a ser o par numa linha só, e uma excepção que se
       * esquece de se declarar é uma caixa empilhada no meio de doze ao lado,
       * que se vê. Uma que se esquecesse ao contrário era uma caixa ao lado de
       * uma coisa que não é o seu par, que também se vê.
       */
      empilhada?: boolean;
    } = {},
  ) {
    if (!bilingue) return null;
    const en = lerEn(doc as ProposalDoc, campo) ?? "";
    /**
     * Vazia, para trás, ou em dia — e as três leem-se diferentes.
     *
     * Era `pt !== "" && en === ""`, que só sabia responder «vazia». Um inglês
     * escrito contra um português que entretanto mudou passava por bom, e é
     * esse o defeito que ela apanhou: «Reunião Inicial» com «Ceremony Decor».
     */
    const estado = estadoDoIngles(doc as ProposalDoc, campo);
    // `empilhada` é desta função e não da caixa: separa-se antes de passar o
    // resto, para não escorregar para o DOM como um atributo inventado.
    const { empilhada, ...daCaixa } = opts;
    return (
      <CaixaInglesa
        campo={campo}
        rotulo={rotulo}
        valor={en}
        onChange={(texto) => setDoc((d) => escreverEn(d, campo, texto))}
        porTraduzir={estado === "por-traduzir"}
        desactualizada={estado === "desactualizado"}
        aoConfirmar={() => setDoc((d) => confirmarTraducao(d, campo))}
        aoLado={!empilhada}
        {...daCaixa}
      />
    );
  }

  /**
   * Manda traduzir tudo o que ainda não tem versão inglesa.
   *
   * O documento só muda se a resposta vier ALINHADA — a trava vive na fronteira
   * (`traduzirParaIngles`), e a razão está lá escrita: uma resposta a que
   * faltem textos punha a tradução de um campo noutro campo, em silêncio.
   * Falhando, o que se vê é uma frase a dizê-lo e o documento como estava.
   *
   * ── E O QUE ELA FIZER ENQUANTO A TRADUÇÃO VEM A CAMINHO ──────────────────
   *
   * Fica. O relato que trouxe isto, à letra: «quando alterou para inglês, deu,
   * mas já estava a alterar fotos». A tradução DEU — e as fotos que ela mexeu
   * nos segundos da ida à rede desapareceram, porque o que voltava era o
   * documento de há dez segundos, posto de volta inteiro. A gravação automática
   * gravava a versão amputada logo a seguir, no `localStorage` e no servidor:
   * trabalho perdido nos dois sítios, sem uma palavra.
   *
   * Por isso o que se aplica NÃO é o documento traduzido: são as traduções, uma
   * a uma, escritas no documento como ele estiver neste instante — e só nos
   * campos cujo português ainda é o que foi mandado traduzir (ver
   * `aplicarTraducao`). É a mesma disciplina da cópia de fotos de um modelo
   * parcial, aqui ao lado.
   */
  async function traduzirTudo() {
    if (!traducaoLigada || aTraduzir) return;
    setATraduzir(true);
    try {
      const r = await traduzirParaIngles(doc as ProposalDoc, motorPelaRota());
      if (r.porqueFalhou) {
        toast(`Não deu para traduzir: ${r.porqueFalhou}. O documento ficou como estava.`, "error");
        return;
      }
      // «Não havia nada por traduzir» só é verdade quando não se pediu nada ao
      // serviço. Pedir e não receber é outra coisa — e dizer-lhe que não havia
      // nada a fazer sobre uma proposta que ficou inteira em português é a
      // mentira mais cara que este botão pode contar.
      if (r.escritos === 0 && r.naoVieram === 0) {
        toast("Não havia nada por traduzir.", "info");
        return;
      }
      // O documento de AGORA, e não o que foi mandado traduzir. A contagem sai
      // daqui; a escrita passa pela forma funcional, que é a que o React
      // garante actualizada mesmo que este `ref` esteja um instante atrás.
      const antes = docRef.current;
      const aplicado = aplicarTraducao(antes, r.escritas);
      setDoc((d) => (d === antes ? aplicado.doc : aplicarTraducao(d, r.escritas).doc));
      if (aplicado.escritos > 0) {
        toast(
          aplicado.escritos === 1
            ? "1 campo traduzido. Vale a pena passar os olhos."
            : `${aplicado.escritos} campos traduzidos. Vale a pena passar os olhos.`,
          "success",
        );
      }
      /**
       * ── O QUE FOI PEDIDO AO SERVIÇO E NÃO VOLTOU ─────────────────────────
       *
       * O motor manda os textos em lotes de 50 e um lote que falhe volta VAZIO
       * nas suas posições, de propósito: os que já vieram não se deitam fora
       * nem se pagam duas vezes. Só atira quando NENHUM lote passa.
       *
       * Sem esta frase, uma proposta grande com um 429 (ou uma quota que acaba
       * no segundo lote) mostrava «50 campos traduzidos», a verde, e deixava 70
       * em português sem uma palavra. Do lado dela isso é «não está a dar» —
       * dá numa proposta pequena e não dá numa grande, e o número que aparece
       * está certo.
       *
       * Diz-se também que vale a pena insistir, porque vale: o que já veio está
       * escrito, e a carregada seguinte só manda o que falta.
       */
      if (r.naoVieram > 0) {
        toast(
          r.naoVieram === 1
            ? "1 campo não voltou do serviço de tradução e ficou em português. Carrega outra vez — o que já veio fica como está."
            : `${r.naoVieram} campos não voltaram do serviço de tradução e ficaram em português. Carrega outra vez — o que já veio fica como está.`,
          "error",
        );
      }
      // Os campos que mudaram debaixo da tradução ficam por traduzir, e é isso
      // que eles são. Dizê-lo aqui evita a única leitura errada possível — «eu
      // traduzi isto» sobre um campo que ficou em português.
      if (aplicado.ignorados.length > 0) {
        toast(
          aplicado.ignorados.length === 1
            ? "1 campo mudou enquanto a tradução vinha e ficou por traduzir."
            : `${aplicado.ignorados.length} campos mudaram enquanto a tradução vinha e ficaram por traduzir.`,
          "info",
        );
      }
    } finally {
      setATraduzir(false);
    }
  }

  /**
   * ── IR AO SÍTIO ONDE A FALTA SE RESOLVE ─────────────────────────────────
   *
   * O irmão do `irParaCampo`, para a Conferência. A diferença é a matéria: ali
   * é um campo de PROSA identificado por um `CampoDeTexto`; aqui é uma falta
   * («Falta o valor»), que às vezes tem um controlo próprio e às vezes só tem
   * uma secção — as capas e os mood boards não são um campo.
   *
   * Três coisas, e só a última é o salto: voltar ao conteúdo, ABRIR a secção se
   * ela estiver dobrada (saltar para dentro de um cartão fechado deixava-a a
   * olhar para um cartão que «não abriu», e os campos continuam lá dentro
   * porque uma secção fechada esconde-os sem os desmontar), e só então levar a
   * vista e o foco.
   */
  function irParaAFalta(seccao?: string, campo?: string) {
    setStep("conteudo");
    // Um campo de um mood board pode estar dentro de um cartão DOBRADO, e um
    // campo que não está desenhado não se foca: o salto morria na secção e
    // deixava-a a olhar para a lista de boards fechados. É a mesma abertura
    // que o `irParaCampo` já fazia — ver lá.
    const board = /^board[A-Za-z]*:(\d+)/.exec(campo ?? "");
    if (board) {
      const id = doc.moodBoards[Number(board[1])]?.id;
      if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
    }
    setFaltaAVisitar((antes) => ({ seccao, campo, pedido: (antes?.pedido ?? 0) + 1 }));
  }

  function irParaCampo(campo: CampoPublicado, versao: "pt" | "en" = "pt") {
    setStep("conteudo");
    // Saltar para uma caixa inglesa que não está desenhada deixava-a a olhar
    // para o campo português sem perceber porquê. O interruptor acende-se junto
    // com o salto.
    if (versao === "en") setBilingue(true);
    if (
      campo.tipo === "boardTitulo" ||
      campo.tipo === "boardSubtitulo" ||
      campo.tipo === "boardNota"
    ) {
      const id = doc.moodBoards[campo.bi]?.id;
      if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
    }
    setCampoAVisitar((antes) => ({ campo, pedido: (antes?.pedido ?? 0) + 1, versao }));
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
    /**
     * Quando os adicionais SOMAM ao valor escrito, o campo do total é só dos
     * serviços e não se mexe: acrescentar uma deslocação de 140 deixa os 3.000
     * onde estão e faz o total subir para 3.140. Enquanto isto não existia, o
     * campo era empurrado para cima e os serviços encolhiam por baixo — que é
     * exactamente o quadro que ela viu e que não queria.
     */
    if (doc.budgetExtrasSomam) {
      /**
       * O campo não mexe, mas o PEDIDO tem de mexer.
       *
       * O «Preço final (sem IVA)» do pedido é de onde a Visão Geral, as
       * Estatísticas e o dossier leem o dinheiro dos pedidos que ainda não têm
       * proposta enviada. Se ele ficasse com os serviços apenas, uma deslocação
       * de 140 € deixava de aparecer nesses ecrãs — e o pior de tudo é que
       * desaparecia em silêncio, num número que já ninguém confere.
       *
       * A soma é feita com os adicionais NOVOS, e não com os que estão no
       * documento: o `setDoc` acima é assíncrono, e ler `doc` aqui daria o
       * estado anterior. É a mesma armadilha que o `delta` já evita.
       */
      const escrito = parseMoneyText(totalInput);
      const efectivo = Math.round((escrito + somaDosExtrasSemIva(novos, contexto)) * 100) / 100;
      persistirPreco(efectivo > 0 ? efectivo : undefined, { jaEfectivo: true });
      return;
    }
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
    // De ponta a ponta, que é o que ela espera — e não o que o servidor demora
    // a desenhar. É esta a medida que faz a estimativa valer alguma coisa.
    const comecou = Date.now();
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/proposta-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `idioma` vai SEMPRE, mesmo quando é o português. O servidor tem o
        // português por omissão para os chamadores antigos, mas quem tem um
        // botão para escolher diz o que escolheu — senão «pt» seria só a
        // ausência de um campo, e o dia em que a omissão mudar de lado leva
        // esta chamada atrás sem ninguém dar por isso.
        body: JSON.stringify({
          mode: "preview",
          idioma: idiomaDoPdf,
          doc: stripPendingImages(doc),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Não foi possível gerar a pré-visualização.");
      }
      const blob = await res.blob();
      // A geração que acabou de acontecer ensina a próxima estimativa: quantas
      // fotos, quanto tempo, quantos bytes. Medido, não estimado.
      apontarGeracao(totalDeFotos, Date.now() - comecou, blob.size);
      // …e o mesmo número serve o ecrã do email, que confirma o anexo antes de
      // ele seguir: aqui é MEDIDO, e não a estimativa que se mostra sem isto.
      setBytesDoPdf(blob.size);
      // Descarregar o PDF (anexo) em vez de abrir numa aba nova: a CSP do site
      // (object-src 'none', sem frame-src) bloqueia mostrar um blob:PDF numa aba
      // ou iframe, o que fazia "não acontecer nada". Um download nunca é
      // bloqueado e abre no leitor de PDF do dispositivo.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // O nome do ficheiro diz a língua. Gerar as duas versões é coisa que
      // acontece — ela manda a portuguesa aos pais e a inglesa ao casal — e com
      // o mesmo nome a segunda ficava «proposta-Ana (1).pdf» na pasta de
      // transferências, sem forma de saber qual é qual sem abrir as duas.
      /**
       * O MESMO NOME QUE O CASAL VAI VER.
       *
       * Isto compunha um nome só seu — `proposta-Ana.pdf` — e era o quarto nome
       * diferente para o mesmo documento: um no botão daqui, um no anexo do
       * email, um na descarga do link do casal e um no portal. Ela confere o
       * PDF na pasta de transferências e envia-o a seguir; se o que confere não
       * se chama como o que segue, a conferência não prova nada.
       *
       * Passa a sair da mesma função que o servidor usa — incluindo o nome que
       * ela escreveu, quando escreveu.
       */
      a.download = nomeDoFicheiroDaProposta(
        {
          escolhido: doc.nomeDoFicheiro,
          clientNames: doc.clientNames,
          eventDate: doc.eventDate,
          ref: quote.id,
        },
        idiomaDoPdf,
      );
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

  /**
   * ════════════════════════════════════════════════════════════════════════
   * ENVIAR, DEPOIS DE VER O QUE FICA DE FORA
   * ════════════════════════════════════════════════════════════════════════
   *
   * O gerador diz o que a composição cortou — o nome do casal que não coube na
   * capa, a sétima foto de um mood board, a legenda que acaba a meio da frase.
   * Isso chegava aqui DENTRO da resposta do envio, ou seja depois de o email
   * ter saído: ela lia o aviso com o casal já a ter o documento.
   *
   * Agora o servidor pára e pergunta (409, `precisaConfirmarCortes`), e este
   * é o segundo clique: o mesmo envio, com a resposta dada. Não é um botão
   * diferente nem um caminho diferente — é o mesmo, com `cortesConfirmados`.
   */
  async function send(cortesConfirmados = false) {
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
      const comecou = Date.now();
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
          /**
           * ── A LÍNGUA VAI COM O ENVIO, E FICA GRAVADA COM A PROPOSTA ──────
           *
           * Aqui não ia nenhuma, e a razão de então está escrita na rota: o
           * email era português em qualquer caso, e um PDF inglês dentro de um
           * email português seria pior do que os dois em português. Isso
           * mudou — o email, a página do aceite, o portal e a segunda descarga
           * seguem agora a língua da proposta —, e o que ficaria estranho é o
           * contrário: pré-visualizar em inglês e o casal receber português.
           *
           * É a MESMA escolha do passo 2 (um só estado), por isso não há como
           * enviar numa língua diferente daquela em que ela viu o documento.
           */
          idioma: idiomaDoPdf,
          // FORA do documento, e só quando existe: uma caixa em branco não pode
          // fazer sair um email diferente do de sempre — nem sequer um campo
          // vazio a viajar. A mensagem acompanha ESTE envio; o documento que
          // fica guardado é o mesmo com ela ou sem ela.
          ...(mensagemAoCliente.trim() ? { mensagem: mensagemAoCliente.trim() } : {}),
          /**
           * ── O EMAIL QUE ELA LEU NO ECRÃ É O EMAIL QUE SAI ────────────────
           *
           * O corpo e o assunto viajam JUNTOS e só quando há corpo: é o par que
           * veio do mesmo rascunho, e a rota recusa um assunto solto (ver o
           * `assuntoEscritoAMao`). Sem corpo — um estúdio antigo, uma leitura do
           * rascunho que falhou — nada disto vai e o email sai exactamente como
           * saía: o modelo dela, ou o texto da casa.
           *
           * O `modelo` não escolhe texto nenhum. Vai para a CÓPIA do envio, para
           * daqui a três semanas se saber de que texto é que este partiu.
           */
          ...(corpoDoEmail.trim()
            ? {
                corpo: corpoDoEmail,
                ...(assuntoDoEmail.trim() ? { assunto: assuntoDoEmail } : {}),
                ...(modeloDoEmail ? { modelo: modeloDoEmail } : {}),
              }
            : {}),
          // Só viaja quando é «sim»: um campo a dizer `false` em todos os
          // envios normais era um campo a mais a explicar a quem lesse a rota.
          ...(cortesConfirmados ? { cortesConfirmados: true } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      /**
       * ── O ENVIO PAROU PARA PERGUNTAR ────────────────────────────────────
       *
       * O documento está desenhado e a proposta ainda não foi gravada nem
       * enviada: o servidor devolveu 409 com o que a composição cortou. Isto
       * NÃO é uma falha — é a única altura em que voltar atrás não custa nada,
       * e por isso não passa pelo `throw` (que pinta tudo de vermelho e diz
       * «não foi possível enviar»).
       */
      if (res.status === 409 && data?.precisaConfirmarCortes) {
        setCortesPorConfirmar(normalizaCortes(data.truncations));
        return;
      }
      if (!res.ok) throw new Error(data?.error || porqueFalhouOEnvio(res.status));
      setCortesPorConfirmar(null);
      // O envio também ensina a estimativa. Os bytes vêm do servidor: o PDF do
      // envio não passa pelo browser (segue em anexo), portanto sem esta linha
      // metade das gerações não ensinava nada.
      if (typeof data?.pdfBytes === "number") {
        apontarGeracao(totalDeFotos, Date.now() - comecou, data.pdfBytes);
      }
      // O link desta proposta, já pronto para o botão «Copiar resumo» — sem
      // esperar pela leitura de abertura (`GET`, aqui em cima) que já correu
      // há minutos, antes de haver o que enviar.
      if (typeof data?.acceptUrl === "string") setLinkDaProposta(data.acceptUrl);
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
      /**
       * ══════════════════════════════════════════════════════════════════════
       * PRIMEIRO O QUE ACONTECEU, DEPOIS O QUE ESTAVA LÁ DENTRO
       * ══════════════════════════════════════════════════════════════════════
       *
       * Esta cadeia começava pelo `aviso` do conteúdo, e ele ganhava a tudo.
       * A prioridade fazia sentido quando havia três desfechos («o documento
       * incompleto é o mais importante dos três»); com cinco, produzia frases
       * que afirmam o contrário do que aconteceu:
       *
       *  · com uma foto em falta E o SMTP em baixo, lia-se «No PDF que seguiu,
       *    falta 1 foto. Verifica a proposta e reenvia» — e não seguiu PDF
       *    nenhum, o casal não recebeu nada;
       *  · com uma foto em falta E a marcação do estado a falhar, o
       *    `estadoError` nunca chegava a ser mostrado.
       *
       * A ordem passa a ser: decide-se primeiro por SAIU ou não saiu — que é o
       * facto — e só depois pelo conteúdo. E quando saiu, os avisos JUNTAM-SE
       * em vez de se substituírem: não há razão para escolher entre dizer que
       * faltou uma foto e dizer que o pedido não ficou actualizado.
       */
      if (!saiu) {
        // O email NÃO saiu. Nada do que o documento tenha lá dentro interessa
        // mais do que isto, e sobretudo nada pode dizer «que seguiu».
        toast(
          data?.emailError ||
            "A proposta foi gravada mas o EMAIL NÃO SAIU — o cliente não recebeu nada.",
          "error",
        );
      } else if (typeof data?.repetidoAviso === "string") {
        /**
         * O servidor reconheceu isto como uma REPETIÇÃO e não enviou nada
         * (mesmo documento, há menos de três minutos). Acontece quando a rede
         * tosse a meio, o ecrã diz que falhou, e ela carrega outra vez — o
         * primeiro pedido acabou por seguir. Dizer «Proposta enviada» aqui era
         * verdade só por acidente; dizer o que aconteceu é o que a impede de
         * ficar à espera de perceber porque é que há duas linhas no quadro.
         */
        toast(data.repetidoAviso, "success");
      } else {
        /**
         * O email saiu. Junta-se tudo o que correu mal DEPOIS disso, por ordem
         * de gravidade, numa frase só — cada um destes campos só vem na
         * resposta quando falhou mesmo.
         *
         * O `docError` (A9-003) nunca era lido: `grep docError` no cliente dava
         * zero. É o pior dos quatro — sem documento gravado, o link que o casal
         * acabou de receber não tem PDF nenhum para lhe mostrar.
         */
        const problemas = [
          typeof data?.docError === "string" && data?.docSaved === false ? data.docError : "",
          typeof data?.estadoError === "string" ? data.estadoError : "",
          typeof data?.pedidoError === "string" ? data.pedidoError : "",
          typeof data?.copiaError === "string" ? data.copiaError : "",
          aviso ? `No PDF que seguiu, ${aviso}.` : "",
        ].filter(Boolean);
        if (problemas.length > 0) {
          toast(problemas.join(" "), "error");
        } else {
          toast("Proposta enviada ao cliente", "success");
        }
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

  /**
   * O link da proposta já enviada, lido UMA vez ao abrir o estúdio — para o
   * botão «Copiar resumo» funcionar mesmo sem passar pelo «Enviar» nesta
   * sessão (reabrir o estúdio de uma proposta enviada ontem, por exemplo).
   * Se falhar, o botão simplesmente sai sem o link — o resumo continua a
   * servir sem ele, que é o comportamento normal de uma proposta por enviar.
   */
  useEffect(() => {
    let vivo = true;
    fetch(`/api/orcamento/${quote.id}/proposta-doc`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { acceptUrl?: string | null } | null) => {
        if (vivo && data?.acceptUrl) setLinkDaProposta(data.acceptUrl);
      })
      .catch(() => {
        /* sem link, o resumo sai sem ele */
      });
    return () => {
      vivo = false;
    };
  }, [quote.id]);

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

  /**
   * As fotografias que uma alternativa pode usar: as que JÁ estão nos mood
   * boards desta proposta.
   *
   * Sem carregamento novo e sem marcadores provisórios — uma opção que
   * apontasse para uma foto ainda por copiar ficava com um caminho que nunca
   * vai existir, e o casal via um buraco onde devia estar a paleta.
   */
  const fotosParaEscolhas: FotoDisponivel[] = (doc.moodBoards ?? []).flatMap((b) =>
    (b.images ?? [])
      .filter((caminho) => !!caminho && !isPendingImage(caminho))
      .map((caminho) => ({
        caminho,
        url: assetUrls[caminho],
        onde: (b.title ?? "").trim() || "Mood board",
      })),
  );
  /**
   * ── O QUE O DOCUMENTO NÃO SABE DE SI PRÓPRIO ──────────────────────────────
   *
   * Por agora, só a LÍNGUA.
   *
   * O `oQueFaltaParaEnviar` também sabe travar por fotografias que não
   * resolvem, e essa peça está escrita e testada — mas não é alimentada
   * daqui, de propósito, e a razão é uma corrida:
   *
   * o `assetUrls` chega DEPOIS do documento. Entre abrir o estúdio e o mapa
   * carregar, um `!assetUrls[caminho]` é verdadeiro para TODAS as fotografias
   * da proposta — e o botão de enviar ficaria travado durante esse intervalo, a
   * dizer que catorze fotografias não carregam quando o que se passa é que
   * ainda não foram pedidas.
   *
   * Um bloqueio que dispara por uma corrida é pior do que não existir: ensina a
   * ignorar a lista, e a lista é o que impede a próxima proposta errada de
   * sair. Fica para um bloco próprio, alimentado por falhas REAIS de
   * carregamento (o `ImagemComPlanoB` já as conhece) e não por uma ausência no
   * mapa.
   */
  const contextoDoEnvio = useMemo(() => ({ idioma: idiomaDoPdf }), [idiomaDoPdf]);

  const faltas = oQueFaltaParaEnviar(doc as ProposalDoc, money.gross, contextoDoEnvio);
  // A regra das FOTOS POR CONFIRMAR fica aqui e não em `proposal-progress`:
  // esse olha para o DOCUMENTO, e isto é um estado desta aba — a cópia que
  // ainda vai a caminho só esta sessão a conhece. O email sai uma vez, e um
  // PDF sem a foto escolhida dura para sempre.
  const canSend =
    podeEnviar(doc as ProposalDoc, money.gross, contextoDoEnvio) && fotosPorConfirmar === 0;
  /**
   * Quantas traduções faltam em cada secção, para o índice.
   *
   * SÓ com a proposta a sair em inglês — é a mesma condição do painel «Por
   * traduzir» do passo do envio, e pela mesma razão: numa proposta portuguesa
   * não há nada por traduzir, e uma fila de contagens debaixo de cada secção
   * seria ruído no índice de quem nunca faz propostas inglesas.
   */
  /**
   * ════════════════════════════════════════════════════════════════════════
   * A DATA QUE ELA ESCREVE AQUI TAMBÉM PODE CHOCAR
   * ════════════════════════════════════════════════════════════════════════
   *
   * O aviso de dia ocupado já existia, e disparava ao ESCOLHER o cliente — a
   * partir do `quote.date`. Só que a data que sai impressa é a que está neste
   * documento, e este campo é texto livre: o casal liga a mudar o dia, ela
   * corrige aqui, e o aviso continuava a olhar para a data do formulário.
   *
   * ── CALA-SE QUANDO NÃO CONSEGUE LER A DATA ──────────────────────────────
   * `isoDaDataPorExtenso` só reconhece a forma que o estúdio escreve («12 de
   * setembro de 2026») e devolve `null` para tudo o resto: «a definir»,
   * «18.09.2027», «Set.», ou uma data a meio de ser escrita. Um aviso ERRADO
   * sobre uma data é pior do que nenhum — diz que há um casamento noutro dia,
   * e o dia é inventado por uma leitura falhada.
   *
   * ── E CALA-SE QUANDO É A MESMA DATA DO PEDIDO ───────────────────────────
   * Aí o aviso já está no ecrã, por cima do estúdio (ver `FazerProposta`). O
   * mesmo cartão duas vezes na mesma página é a maneira de se aprender a
   * saltar os dois.
   */
  const dataEscritaNoDoc = isoDaDataPorExtenso(doc.eventDate ?? "");
  const pedidoComADataDoDoc = useMemo(
    () =>
      dataEscritaNoDoc && dataEscritaNoDoc !== quote.date
        ? ({
            ...quote,
            date: dataEscritaNoDoc,
            // O fim de um evento de vários dias é do PEDIDO e não desta data:
            // arrastá-lo para aqui inventava um intervalo que ninguém escreveu.
            endDate: "",
            // E o local também é o do documento quando ele diz outro: a
            // distância por estrada é metade da resposta.
            location: doc.location || quote.location,
          } as Quote)
        : null,
    [dataEscritaNoDoc, quote, doc.location],
  );

  /**
   * A página que ela está a editar — para o painel da direita mostrar ESSA.
   *
   * Marcada quando o foco entra no cartão de um board, e não quando o rato lá
   * passa: o rato atravessa cartões a caminho de outro sítio, e um painel que
   * mudasse de página ao atravessar era um painel a piscar.
   */
  const [boardActivo, setBoardActivo] = useState<number | null>(null);

  /**
   * O que já estava feito quando esta proposta ABRIU.
   *
   * Uma fotografia tirada uma vez, e não uma leitura contínua: é ela que decide
   * que secções nascem dobradas, e uma leitura contínua fechava uma secção no
   * instante em que ela acabasse de a preencher — com o cursor lá dentro.
   *
   * Só se tira depois de o documento chegar. Antes disso «está tudo por
   * preencher» é uma resposta sobre um documento que ainda não existe, e
   * dobrava zero secções em todas as propostas.
   */
  const [feitoAoAbrir, setFeitoAoAbrir] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    if (feitoAoAbrir) return;
    if (!seccoes.some((s) => s.preenchida)) return;
    setFeitoAoAbrir(Object.fromEntries(seccoes.map((s) => [s.id, s.preenchida])));
  }, [seccoes, feitoAoAbrir]);

  /** As páginas COM fotografias, pela ordem em que saem — a ordem do PDF. */
  const paginasParaOPainel = useMemo(
    () =>
      ordemDeSaida(doc as ProposalDoc, doc.moodBoards ?? [], (b) => b.title ?? "")
        .map((bi) => ({ bi, board: (doc.moodBoards ?? [])[bi] }))
        .filter((p) => p.board && (p.board.images ?? []).length > 0),
    [doc],
  );

  const traducoesPorSeccao = useMemo(
    () => (idiomaDoPdf === "en" ? porTraduzirPorSeccao(doc as ProposalDoc) : undefined),
    [idiomaDoPdf, doc],
  );

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
        <NavEstudio
          seccoes={seccoes}
          faltas={faltas}
          onSeccaoActual={anotarSeccao}
          porTraduzir={traducoesPorSeccao}
        />
        <div className="min-w-0 flex-1">
          {/* Template selector */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              ariaLabel="Modelo da proposta"
              value={isDeco ? "decoracao" : "organizacao"}
              onChange={setTemplate}
              options={[
                { value: "decoracao", label: "Decoração" },
                { value: "organizacao", label: "Organização" },
              ]}
            />
            {/* ══════════════════════════════════════════════════════════════
                PROPOSTA BILINGUE — O INTERRUPTOR
                ══════════════════════════════════════════════════════════════

                Ligado, cada campo de prosa ganha uma segunda caixa POR BAIXO,
                marcada «EN». Desligado, o ecrã é o de hoje ao pixel — e é essa
                a razão de haver um interruptor em vez de as caixas estarem lá
                sempre: esta secção é o ecrã mais escrito da casa, muitas vezes
                com o cliente ao telefone, e a maioria das propostas nunca vai a
                inglês.

                Não é derivado do «Idioma do PDF»: esse vive no passo SEGUINTE
                ao da escrita, e escolher «Inglês» só para tirar uma prova
                acendia as caixas todas de repente. */}
            <button
              type="button"
              onClick={() => setBilingue((v) => !v)}
              aria-pressed={bilingue}
              className={`alvo-toque inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                bilingue
                  ? "border-[#4d6350]/40 bg-[#4d6350]/[0.08] text-[#4d6350]"
                  : "border-foreground/15 text-foreground/60 hover:border-foreground/30 hover:text-foreground/80"
              }`}
              title="Acrescenta uma caixa em inglês por baixo de cada campo de texto da proposta."
            >
              <span aria-hidden="true">{bilingue ? "✓" : "+"}</span>
              Proposta bilingue (PT + EN)
            </button>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              TRADUZIR PARA INGLÊS — O BOTÃO, E O MOTOR QUE AINDA NÃO EXISTE
              ══════════════════════════════════════════════════════════════════

              Decisão dela: «nós fazemos as propostas em português, e depois o
              próprio sistema faz uma tradução para inglês». As caixas «EN»
              deixam de ser trabalho obrigatório e passam a ser REVISÃO: ela
              corrige a que quiser, ou não lê nenhuma.

              O motor não existe — não há serviço de tradução escolhido nem
              chave nenhuma no projecto. A fronteira onde ele vai entrar está
              escrita (`proposal-traducao.ts`), e enquanto o motor não existir
              este botão DIZ-O e não faz nada.

              Um botão que fingisse traduzir — com um dicionário de palavras,
              por exemplo — mandava-a enviar uma proposta a acreditar que estava
              traduzida. É o único desfecho pior do que não haver botão nenhum:
              uma frase portuguesa numa proposta inglesa vê-se; inglês falso não.

              Só aparece com o bilingue ligado: é onde as caixas que ele
              preenche estão à vista. */}
          {bilingue && (
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {/* ── ENQUANTO A TRADUÇÃO VEM A CAMINHO ─────────────────────
                  O botão dizia «A traduzir…» e mais nada, durante uma ida à
                  rede que numa proposta cheia são vários segundos — e a única
                  coisa que aparecia a seguir era um toast. A caixa fica no
                  lugar do botão, que é onde o estado já vivia. Quantos campos
                  vão é do que o código sabe, e por isso é dito; quantos já
                  voltaram, não — ver `esperaDaTraducao`. */}
              {aTraduzir ? (
                (() => {
                  // Os mesmos campos que o `traduzirParaIngles` vai buscar: os
                  // vazios e os que ficaram para trás do português.
                  const campos = camposPorRever(doc as ProposalDoc).length;
                  return (
                    <EmCurso
                      className="max-w-xs"
                      titulo="A traduzir para inglês…"
                      estimadoMs={esperaDaTraducao(campos)}
                      nota={
                        campos === 1
                          ? "Vai 1 campo ao serviço de tradução. O que já escreveste fica como está."
                          : `Vão ${campos} campos ao serviço de tradução. O que já escreveste fica como está.`
                      }
                      notaDemorada="O serviço está a demorar. As caixas «EN» preenchem-se assim que a resposta chegar."
                    />
                  );
                })()
              ) : (
                <button
                  type="button"
                  disabled={!traducaoLigada}
                  onClick={() => void traduzirTudo()}
                  className="alvo-toque inline-flex items-center gap-2 rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span aria-hidden="true">⇄</span>
                  Traduzir para inglês
                </button>
              )}
              {/* ── AS TRÊS FRASES, E PORQUE É QUE NÃO SÃO DUAS ─────────────
                  O botão fica desligado nos dois casos maus, e isso está certo.
                  A frase é que não pode ser a mesma: «ainda não está ligada
                  neste servidor» é uma afirmação sobre a CONFIGURAÇÃO, e quem a
                  lê ou vai pôr a chave ou desiste e escreve as caixas à mão.
                  Dita sobre uma sessão caducada ou uma rede que caiu, manda-a
                  resolver um problema que não existe enquanto o verdadeiro se
                  cura recarregando a página. */}
              {traducao === "ligada" ? (
                <p className="text-[11px] leading-snug text-foreground/50">
                  Preenche as caixas «EN» que ainda estão vazias. O que já escreveste fica como está
                  — e vale a pena passar os olhos pelo que sair.
                </p>
              ) : traducao === "desligada" ? (
                <p className="text-[11px] leading-snug text-foreground/50">
                  A tradução automática ainda não está ligada neste servidor. Até lá, as caixas «EN»
                  escrevem-se à mão, e o que ficar em branco sai em português.
                </p>
              ) : (
                <p className="text-[11px] leading-snug text-foreground/50">
                  Não deu para saber se a tradução automática está ligada — o servidor não
                  respondeu. Recarrega a página; se continuar assim, entretanto as caixas «EN»
                  escrevem-se à mão e o que ficar em branco sai em português.
                </p>
              )}
            </div>
          )}

          {/* Event fields */}
          <Section title="Evento" id="evento" fechadaPorOmissao={feitoAoAbrir?.evento}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Clientes"
                value={doc.clientNames}
                onChange={(e) => {
                  confirmado("clientNames");
                  patch({ clientNames: e.target.value });
                }}
                containerClassName={realce("clientNames")}
                data-campo="clientNames"
                placeholder="Maria & Zé"
              />
              <Field
                label="Tipo de evento"
                value={doc.eventType}
                onChange={(e) => {
                  confirmado("eventType");
                  patch({ eventType: e.target.value });
                }}
                containerClassName={realce("eventType")}
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
                data-campo="eventDate"
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
                data-campo="location"
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
                data-campo="guests"
                placeholder="150 pax"
              />
              {isDeco && (
                <>
                  {/* ── ESTES TRÊS NÃO TINHAM ANEL NENHUM ────────────────
                      A cerimónia vem do que o casal escolheu no formulário e a
                      hora vem, quando vem, de uma proposta copiada — texto de
                      outra pessoa, exactamente como os quatro de cima. Eram os
                      únicos campos do Evento onde a marca não acendia, e por
                      isso os únicos onde um valor de terceiros se lia como um
                      valor escrito. */}
                  <Field
                    label="Cerimónia"
                    value={doc.ceremony ?? ""}
                    onChange={(e) => {
                      confirmado("ceremony");
                      patch({ ceremony: e.target.value });
                    }}
                    containerClassName={realce("ceremony")}
                    data-campo="ceremony"
                    placeholder="Civil, simbólica"
                  />
                  <Field
                    label="Hora"
                    value={doc.time ?? ""}
                    onChange={(e) => {
                      confirmado("time");
                      patch({ time: e.target.value });
                    }}
                    containerClassName={realce("time")}
                    data-campo="time"
                    placeholder="A definir"
                  />
                </>
              )}
            </div>

            {/* O que já está marcado à volta da data que ESTÁ ESCRITA AQUI —
                ver `pedidoComADataDoDoc`. O mesmo cartão do ecrã de escolher o
                cliente, com a mesma leitura de distância por estrada. */}
            {pedidoComADataDoDoc && (
              <div className="mt-4">
                <AvisoDataOcupada
                  quote={pedidoComADataDoDoc}
                  quotes={quotes ?? []}
                  motivo="Não impede nada — a decisão é tua. Esta é a data que escreveste na proposta, e não a do pedido."
                />
              </div>
            )}

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

            {/*
             * ══════════════════════════════════════════════════════════════
             * A FRASE DE INTENÇÃO
             * ══════════════════════════════════════════════════════════════
             *
             * «Pensámos o vosso dia em branco e azul, com a serenidade do
             * Redondo em setembro.» É a primeira coisa que o casal lê na
             * página, e é a única coisa da proposta que não é um dado.
             *
             * ── SEM TEXTO POR OMISSÃO, E ISSO É A DECISÃO ────────────────
             * Palavras dela: «uma frase genérica é pior do que nenhuma». Uma
             * frase da casa aqui seria lida como escrita para aquele casal, e
             * no dia em que dois casais a comparassem seria pior do que nunca
             * ter existido. Por isso não há sugestão, não há exemplo
             * pré-preenchido, e o campo vazio não acende aviso nenhum: uma
             * proposta sem frase é uma proposta legítima.
             *
             * O exemplo está no `hint`, onde se lê e não se copia.
             */}
            <div className="mt-4">
              <Field
                as="textarea"
                rows={3}
                label="Frase de intenção (só na página do casal)"
                value={doc.intencao ?? ""}
                maxLength={MAX_INTENCAO}
                onChange={(e) => patch({ intencao: e.target.value.slice(0, MAX_INTENCAO) })}
                data-campo="intencao"
                hint={`abre a página, por cima do nome deles. Três linhas sobre o que imaginou para este casamento, escritas de raiz para eles. Ex.: «Pensámos o vosso dia em branco e azul, com a serenidade do Redondo em setembro.» ${(doc.intencao ?? "").length}/${MAX_INTENCAO}`}
              />
            </div>

            {/* ── O QUE SE SABE E NÃO SE ESCREVE AO CLIENTE ────────────────
                «Quer ficar por baixo dos 8.000 €.» «Quem decide é a mãe.»
                Frases que hoje vivem na cabeça de quem escreveu a proposta e
                que se perdem quando é outra pessoa a pegar nela — ou quando são
                seis meses depois.

                Vive na secção do EVENTO e não ao pé do dinheiro: é sobre o
                negócio inteiro, e é a primeira secção — a nota tem de estar
                onde se dá com ela sem a procurar.

                O aspecto de papel amarelo é a garantia de que não se confunde
                com um campo que sai na proposta; o teste
                (`notas-internas-ficam-em-casa.test.ts`) garante que não sai
                mesmo. */}
            <NotasInternas
              valor={doc.notasInternas ?? ""}
              onChange={(v) => patch({ notasInternas: v })}
            />
          </Section>

          {/* Cover images */}
          <Section title="Imagens de capa (2)" id="capas" fechadaPorOmissao={feitoAoAbrir?.capas}>
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
                /*
                 * ── O NÚMERO É DESTA FOTOGRAFIA, OU NÃO HÁ NÚMERO ───────────
                 *
                 * Palavras dela: «o mesmo texto aparece por baixo das duas
                 * imagens de capa, embora uma seja vertical e a outra
                 * horizontal — logo, perdem áreas diferentes».
                 *
                 * A conta já era por fotografia. O que não era é o DADO: a
                 * forma só se sabe depois de a miniatura carregar e o `Thumb`
                 * a medir, e até lá caía-se na forma por omissão — a mesma
                 * para as duas. Duas fotografias diferentes, uma forma
                 * inventada, o mesmo 69% debaixo de ambas, e a frase a dizer
                 * «ESTA fotografia perde» sobre um número que não é dela.
                 *
                 * Sem medida não há aviso. É a regra da casa em todo o lado
                 * onde isto aparece: não saber é não saber, e um número errado
                 * dito com confiança é pior do que nenhum — sobretudo este,
                 * que existe para ela ESCOLHER a fotografia.
                 */
                const aspetoDestaCapa = path ? aspetosDasFotos[path] : undefined;
                const perdaDaCapa = aspetoDestaCapa ? perdaNaCapa(aspetoDestaCapa) : 0;
                return (
                  <div key={idx}>
                    {path ? (
                      <>
                        <Thumb
                          url={assetUrls[path]}
                          planoB={assetOriginais[path]}
                          estadoDosUrls={estadoDosUrls}
                          aoTentarDeNovo={() => void hidratarAssets()}
                          aoMorrer={marcarUrlMorto}
                          // As capas são duas e estão no topo do passo: nunca
                          // esperam pela fila das fotos que estão fora do ecrã.
                          priority
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
                            A tira da capa é quase duas vezes mais alta do que larga:{" "}
                            <strong className="font-medium">
                              esta fotografia perde {Math.round(perdaDaCapa * 100)}% da área
                            </strong>
                            . Uma fotografia ao alto perde menos.
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <UploadArea
                          // O lado é fixo: a posição 0 imprime à esquerda do
                          // painel do logótipo, a 1 à direita.
                          label={idx === 0 ? "Capa esquerda" : "Capa direita"}
                          progresso={uploading[`cover-${idx}`]}
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
          <Section title="Serviços" id="servicos" fechadaPorOmissao={feitoAoAbrir?.servicos}>
            {/* O editor com teclado, arrasto e anular vive em ServicesEditor. */}
            <ServicesEditor
              groups={doc.serviceGroups}
              onGroupsChange={setServiceGroups}
              showDesc={!isDeco}
              // O Ctrl/Cmd+Enter dos Serviços é o MESMO gesto do botão
              // «Guardar agora» — e por isso a mesma função, não uma segunda
              // gravação com outras regras e outras palavras.
              onSave={guardarAgora}
              // As caixas inglesas dos grupos e das linhas. O editor não sabe
              // o que é uma proposta bilingue: recebe o interruptor e desenha
              // uma caixa a mais por campo, com a mesma pega e o mesmo rótulo
              // do resto da casa.
              bilingue={bilingue}
            />
          </Section>

          {/* Mood boards — decoracao only */}
          {isDeco && (
            <Section
              title="Mood boards"
              id="moodboards"
              nota={contagemDosBoards}
              fechadaPorOmissao={feitoAoAbrir?.moodboards}
            >
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
              {/* ── AS PÁGINAS LADO A LADO ────────────────────────────────
                  A pergunta que o editor não deixa fazer — «isto parece tudo
                  do mesmo casamento?» — só se responde com as folhas todas à
                  mesma distância dos olhos.

                  FORA DA GRELHA, e acima dela. Lá dentro era o TERCEIRO filho
                  de uma grelha de duas colunas: por colocação automática, a
                  vista ficava com a coluna do índice e a lista dos mood boards
                  descia para a coluna de 11 rem — 176 px de largura para as
                  fotografias todas, a partir dos 1024 px. Aqui em cima ocupa a
                  largura toda, que é a única em que umas folhas lado a lado se
                  comparam. */}
              {vistaDeConjunto && (
                <VistaDeConjunto
                  doc={doc as ProposalDoc}
                  ordem={ordemDosBoards}
                  idioma={idiomaDoPdf}
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
                  // O salto de uma folha de texto usa o MESMO caminho da
                  // Conferência: abre a secção se estiver dobrada e só então
                  // leva a vista. Uma segunda maneira de saltar era uma segunda
                  // maneira de falhar a abertura da dobra.
                  onIrParaSeccao={(seccao) => irParaAFalta(seccao)}
                  onFechar={() => setVistaDeConjunto(false)}
                />
              )}
              {/* ── O ÍNDICE ─────────────────────────────────────────────
                  Em ecrã largo é uma coluna fixa ao lado; em telemóvel, uma
                  tira que se percorre por cima da lista — a 390 px, uma coluna
                  lateral roubava metade da grelha das fotos. */}
              <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-5">
                <MoodBoardIndice
                  boards={doc.moodBoards}
                  ordem={ordemDosBoards}
                  bloqueados={doc.moodBoards.map((b) => !!b.bloqueado)}
                  // A MESMA acção dos cartões e da vista de conjunto: três
                  // sítios onde se reordena, uma só maneira de reordenar.
                  onMover={(de, para) => moverBoardParaPosicao(de, para)}
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
                        /*
                         * ── O QUE ESTA PÁGINA FAZ, OU O QUE A PROPOSTA FAZ ──
                         *
                         * A página primeiro, a proposta a seguir, e a sugestão
                         * do número de fotografias em último. É esta ordem que
                         * permite decidir uma vez para as sete páginas e ainda
                         * assim uma delas discordar — ver `layoutPorOmissao`,
                         * em `proposal-doc.ts`.
                         */
                        const semRecorte =
                          (b.enquadramento ?? doc.enquadramentoPorOmissao) === "forma-da-foto";
                        const layoutDoBoard =
                          b.layout ?? doc.layoutPorOmissao ?? layoutSugerido(aspectos.length);
                        /**
                         * A ALTURA QUE A LEGENDA ROUBA ÀS FOTOS.
                         *
                         * A página reserva altura para a descrição, e reserva
                         * MAIS quanto mais linhas ela tiver: com cinco linhas
                         * são 87 pontos, 15% da folha. Aqui deixava-se a omissão
                         * de 8 pt — a de quem não tem legenda nenhuma —, e as
                         * caixas saíam mais altas do que a página as desenha.
                         * A grelha mostrava um recorte que a folha não faz e o
                         * aviso «esta foto perde X%» disparava (ou calava-se)
                         * pelas razões erradas, com dez pontos percentuais de
                         * diferença. A `PreviaDaPagina`, desenhada no MESMO
                         * cartão, já contava a legenda: as duas metades do
                         * cartão discordavam uma da outra.
                         */
                        const alturaLegenda = alturaDaLegenda(linhasDaLegendaAprox(b.annotation));
                        const caixas = caixasDoMoodboard(
                          layoutDoBoard,
                          aspectos,
                          alturaLegenda,
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
                          : // Com a MESMA altura de legenda das caixas aqui em
                            // cima: uma perda medida noutra geometria é uma
                            // percentagem sobre uma página que não existe.
                            perdasDoMoodboard(layoutDoBoard, aspectos, alturaLegenda)
                              .map((perda, i) => ({ perda, i }))
                              .filter(({ perda }) => perda > PERDA_QUE_SE_AVISA);
                        return (
                          <CartaoDeBoard
                            key={bi}
                            bi={bi}
                            // Qual é a página que ela está a editar — para o
                            // painel da direita mostrar ESSA. No foco e não no
                            // rato: o rato atravessa cartões a caminho de
                            // outro sítio, e o painel piscava.
                            onFocusCapture={() => setBoardActivo(bi)}
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
                                  {/* A segunda caixa fica AO LADO em ecrã largo
                                      e por baixo abaixo de `xl` — ver `aoLado`,
                                      em `CaixaInglesa`. Só de leitura quando a
                                      página está fechada, como a portuguesa: um
                                      board terminado é terminado nas duas
                                      línguas. */}
                                  {caixaDeIngles(
                                    { tipo: "boardTitulo", bi },
                                    "Título do mood board",
                                    {
                                      className:
                                        "bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-foreground/75",
                                      readOnly: fechado,
                                      placeholder: "Ceremony Decoration",
                                    },
                                  )}
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
                                  {caixaDeIngles(
                                    { tipo: "boardSubtitulo", bi },
                                    "Subtítulo do mood board",
                                    {
                                      className:
                                        "bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-foreground/75",
                                      readOnly: fechado,
                                    },
                                  )}
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
                                    {/* Cresce com o texto — ver `DescricaoQueCresce`.
                                        Uma altura fixa de duas linhas escondia
                                        154 px dos 224 desta descrição, medidos a
                                        390 px. */}
                                    <DescricaoQueCresce
                                      className={`${INPUT_SM} mb-2 w-full resize-none leading-relaxed`}
                                      valor={b.annotation ?? ""}
                                      onChange={(e) =>
                                        updateBoard(bi, { annotation: e.target.value })
                                      }
                                      data-campo={`boardNota:${bi}`}
                                      placeholder="Descrição (opcional) — ex.: runner floral com hortênsias verdes, cravo verde, lisianthus branco…"
                                      aria-label="Descrição do mood board"
                                    />
                                    {caixaDeIngles(
                                      { tipo: "boardNota", bi },
                                      "Descrição do mood board",
                                      {
                                        className: `${INPUT_SM} mb-2 w-full resize-none leading-relaxed`,
                                        as: "textarea",
                                        // A inglesa cresce com a portuguesa: são
                                        // «a mesma caixa em duas línguas», e uma
                                        // delas a esconder 206 px deixava de o
                                        // ser. A `CaixaInglesa` já sabia fazê-lo.
                                        cresce: true,
                                      },
                                    )}
                                    {/* ── DUAS PÁGINAS COM O MESMO NOME ───────
                                        «"Complementos Dos Noivos" e
                                        "Complementos Noivos". Uma é bouquet,
                                        outra lapelas — mas na proposta aparecem
                                        dois títulos praticamente idênticos
                                        seguidos.»

                                        Não é vermelho e não trava nada: «Mesa
                                        1» e «Mesa 2» é uma decisão, não um
                                        descuido, e um aviso que trava uma
                                        escolha legítima ensina-se a ignorar. Diz
                                        o que viu, cita o outro título, e deixa-a
                                        decidir. */}
                                    {avisosDeTitulo[bi] && (
                                      <p className={`${AVISO_DO_BOARD} text-[#8a6420]`}>
                                        {avisosDeTitulo[bi]}
                                      </p>
                                    )}
                                    {/* ── A PÁGINA ESTÁ A FICAR CHEIA ─────────
                                        Discreto, e antes do limite: às oito
                                        fotos a página ainda sai inteira, mas
                                        cada uma já é pequena. O aviso vermelho
                                        fica para quando alguma deixa mesmo de
                                        ser impressa. */}
                                    {b.images.length >= FOTOS_QUE_ENCHEM_A_PAGINA &&
                                      b.images.length <= MOOD_BOARD_MAX_IMAGES && (
                                        <p className={`${AVISO_DO_BOARD} text-foreground/45`}>
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
                                      <p className={`${AVISO_DO_BOARD} text-[#8a2a22]`}>
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
                                          // A tira e o texto do rato — ver
                                          // `repeticaoNestaProposta` logo por
                                          // cima, e porque é que só uma das
                                          // três perguntas acende.
                                          historia={repeticaoNestaProposta(path)}
                                          origem={passadoDaFoto(path)}
                                          accoes={
                                            fechado ? null : (
                                              <AccoesDaFoto
                                                nome={`Fotografia ${ii + 1} de «${b.title || "mood board sem título"}»`}
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
                                            estadoDosUrls={estadoDosUrls}
                                            aoTentarDeNovo={() => void hidratarAssets()}
                                            aoMorrer={marcarUrlMorto}
                                            // A PRIMEIRA DOBRA do primeiro
                                            // board. Medido: sem prioridade
                                            // nenhuma, as 24 células repartiam
                                            // o canal e a primeira fotografia
                                            // só aparecia aos 34,0 s. Estas
                                            // quatro são as que ela está mesmo
                                            // a olhar quando desce às fotos.
                                            priority={bi === 0 && ii < 4}
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
                                          progresso={uploading[`board-${bi}`]}
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
                                      /*
                                       * ── SEIS DIAGRAMAS VEZES SETE PÁGINAS ──
                                       *
                                       * Palavras dela: «o bloco de seis layouts
                                       * repete-se sete vezes, a ocupar altura».
                                       *
                                       * Passa a estar dobrado, com a escolha
                                       * ACTUAL escrita no fecho — que é a única
                                       * coisa que se precisa de saber quando não
                                       * se está a mexer nela. Abre-se com um
                                       * clique e fica aberto enquanto ela lá
                                       * estiver.
                                       *
                                       * `details` e não um estado nosso: sete
                                       * dobras guardadas num objecto era mais
                                       * uma coisa a manter, para o navegador
                                       * fazer melhor de graça.
                                       */
                                      <details className="group mt-1">
                                        <summary className="marker:content-none inline-flex cursor-pointer list-none items-center gap-1.5 text-xs text-foreground/50 hover:text-foreground/75 [&::-webkit-details-marker]:hidden">
                                          <span
                                            aria-hidden
                                            className="text-[10px] text-foreground/35 motion-safe:transition-transform group-open:rotate-90"
                                          >
                                            ▸
                                          </span>
                                          Disposição:{" "}
                                          <strong className="font-medium text-foreground/75">
                                            {NOME_DO_LAYOUT[layoutDoBoard]}
                                          </strong>
                                          <span className="text-foreground/35">
                                            · {semRecorte ? "sem recorte" : "recorta"}
                                          </span>
                                        </summary>
                                        <div className="mt-2 grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem] 2xl:grid-cols-1">
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
                                          {/*
                                           * ── A MINIATURA REPETIDA SETE VEZES
                                           *
                                           * «Minúscula e repetida sete vezes.»
                                           * A partir de `2xl` deixa de existir:
                                           * o painel da direita mostra a MESMA
                                           * página, grande, e duas cópias da
                                           * mesma coisa no mesmo ecrã são uma a
                                           * mais.
                                           *
                                           * Abaixo disso fica, porque abaixo
                                           * disso o painel não cabe — e tirá-la
                                           * aí era tirar a pré-visualização a
                                           * quem trabalha num portátil, para
                                           * resolver um problema que só existe
                                           * no ecrã grande.
                                           */}
                                          <div className="lg:pt-6 2xl:hidden">
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
                                              // Aqui o rótulo ainda diz alguma
                                              // coisa: é a única miniatura do
                                              // cartão, e sem ele lê-se como
                                              // mais uma fotografia. Ver
                                              // `comRotulo`.
                                              comRotulo
                                            />
                                          </div>
                                        </div>
                                      </details>
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
                    {/*
                     * ── O QUE ESTA PROPOSTA FAZ, DECIDIDO UMA VEZ ──────────
                     *
                     * Palavras dela: «"Manter a forma de cada fotografia" hoje
                     * está desligada no primeiro board e ligada no terceiro,
                     * sem razão». É o que acontece quando a escolha só existe
                     * por página: sete páginas, sete decisões, tomadas em sete
                     * momentos diferentes de uma tarde. O resultado não é
                     * variedade — é uma proposta que parece montada por duas
                     * pessoas.
                     *
                     * Isto vale para as páginas que não disserem outra coisa. A
                     * que discordar continua a ganhar, e é por isso que o botão
                     * de aplicar a todas existe ao lado: é o gesto de quem quer
                     * mesmo pôr as sete de acordo, e escreve a escolha em cada
                     * uma em vez de a adivinhar.
                     */}
                    {doc.moodBoards.length > 1 && (
                      <label className="flex items-center gap-2 text-xs text-foreground/65">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-[#4d6350]"
                          checked={doc.enquadramentoPorOmissao === "forma-da-foto"}
                          onChange={(e) =>
                            patch({
                              // Ausente e não `false`: ausente quer dizer
                              // «ninguém escolheu», e uma proposta já enviada
                              // tem de continuar a sair como sempre saiu.
                              enquadramentoPorOmissao: e.target.checked
                                ? "forma-da-foto"
                                : undefined,
                            })
                          }
                        />
                        <span>Manter a forma das fotografias em toda a proposta</span>
                      </label>
                    )}
                    {doc.moodBoards.length > 1 && (
                      <button
                        type="button"
                        className={ADD_BTN}
                        onClick={() => {
                          const enq = doc.enquadramentoPorOmissao;
                          patch({
                            moodBoards: doc.moodBoards.map((b) => ({
                              ...b,
                              ...(enq ? { enquadramento: enq } : { enquadramento: undefined }),
                            })),
                          });
                          toast(
                            enq
                              ? "As páginas passam todas a manter a forma das fotografias."
                              : "As páginas passam todas a recortar as fotografias.",
                            "info",
                          );
                        }}
                      >
                        Aplicar a todas as páginas
                      </button>
                    )}
                    <ModelosParciais
                      tipo="moodboard"
                      mostrar="inserir"
                      toast={toast}
                      onInserir={(b) => void inserirMoodBoardDeModelo(b as MoodBoard)}
                    />
                    {/* ── AS FOTOS DO MODELO A CHEGAR ────────────────────
                        Ao lado do botão que as pediu, e não em cima do bloco:
                        o bloco já está na lista com as fotografias à vista (é
                        o caminho de origem que ainda lá está), e uma caixa
                        entre os cartões empurrava a grelha para baixo a meio
                        do gesto seguinte. Sai sozinha quando a cópia acaba. */}
                    {fotosACopiar > 0 && (
                      <EmCurso
                        className="max-w-xs"
                        titulo={
                          fotosACopiar === 1
                            ? "A copiar 1 foto do modelo…"
                            : `A copiar ${fotosACopiar} fotos do modelo…`
                        }
                        estimadoMs={esperaDaCopiaDeFotos(fotosACopiar)}
                        nota="O bloco já está na proposta; as fotografias estão a passar para a pasta deste pedido."
                        notaDemorada="A cópia está a demorar. O bloco fica na proposta de qualquer maneira."
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* ── AS ALTERNATIVAS QUE O CASAL ESCOLHE (Fase 3) ───────────
                  Vive aqui dentro, e não numa secção própria: as alternativas
                  são visuais e as fotografias que as explicam já estão nestas
                  páginas. A razão longa está no cabeçalho do editor. */}
              <EditorDeEscolhas
                escolhas={doc.escolhas}
                fotos={fotosParaEscolhas}
                bilingue={bilingue}
                onChange={(escolhas) => patch({ escolhas })}
              />
            </Section>
          )}

          {/* Cronograma — organizacao only */}
          {!isDeco && (
            <Section
              title="Cronograma de Organização"
              id="cronograma"
              fechadaPorOmissao={feitoAoAbrir?.cronograma}
            >
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
                        /* O salto das gralhas encontra o campo por aqui. Ver
                           `chaveDoCampo` — o cronograma entrou na varredura
                           depois de se medir que era texto dela a sair
                           publicado sem passar por corrector nenhum. */
                        data-campo={chaveDoCampo({ tipo: "cronogramaTitulo", pi })}
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
                            data-campo={chaveDoCampo({ tipo: "cronogramaItem", pi, ii })}
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
          <Section
            title="Orçamento Proposto"
            id="orcamento"
            fechadaPorOmissao={feitoAoAbrir?.orcamento}
          >
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
                        {/* ── O NOME DA LINHA NÃO ENCOLHE ABAIXO DE 12 REM ────
                            Do registo do audit, e é um dos oito bloqueios: «a
                            caixa do nome da linha do orçamento tem 62 px — 27
                            com a proposta bilingue ligada».

                            MEDIDO a 390 px: a fila tem 318 px dentro do cartão,
                            e as colunas fixas (a escala `w-32`, o preço `w-28`)
                            mais os espaços comem 264. Sobram 54 para os campos
                            de texto — e como eles são `flex-1` com `min-w-0`
                            escrito à mão, não quebram: ENCOLHEM. Escrever
                            «Decoração da Cerimónia» numa caixa de 62 px é
                            escrever às cegas, e o que ali se escreve é o texto
                            que o casal lê no PDF.

                            O `min-w` é o remédio da própria casa — é o que a
                            fase do cronograma faz cento e trinta linhas acima,
                            e o que o `ServicesEditor` faz nos títulos de grupo.
                            Com um mínimo, o `flex-wrap` que já cá estava passa a
                            fazer o que existe para fazer: o nome fica sozinho
                            numa fila inteira e a escala, o preço e o «Extra»
                            descem para a de baixo. Acima de 520 px nada muda —
                            aí já cabia. */}
                        <input
                          className={`${INPUT_SM} min-w-[12rem] flex-1`}
                          value={l.item}
                          onChange={(e) => updateBudgetItem(i, e.target.value)}
                          // A pega do salto. Faltava: o «Ver no campo» das
                          // gralhas caía na secção porque nenhuma rubrica a
                          // tinha, e o painel «Por traduzir» precisa dela para
                          // chegar à caixa ao lado.
                          data-campo={`linhaDeOrcamento:${i}`}
                          placeholder="Decor Cerimónia"
                          aria-label="Item de orçamento"
                        />
                        {/* A inglesa com o mesmo mínimo: com o bilingue ligado
                            eram os dois a repartir os mesmos 54 px, 27 para
                            cada. */}
                        {caixaDeIngles({ tipo: "linhaDeOrcamento", i }, "Item de orçamento", {
                          className: `${INPUT_SM} min-w-[12rem] flex-1`,
                          placeholder: "Ceremony Decor",
                        })}
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
                            /**
                             * ── A CHAVE TRAZ O PREÇO GRAVADO DE VOLTA AO CAMPO ──
                             * A linha é desenhada com `key={i}`, e o `i` é a
                             * POSIÇÃO: ao apagar a do meio, o React reaproveita
                             * o nó que sobrevive na posição e um `defaultValue`
                             * não se volta a aplicar a um nó que já existia. O
                             * campo ficava a mostrar o preço da linha ANTERIOR
                             * ao lado do nome da linha nova — e o `blur`
                             * seguinte GRAVAVA esse número por cima do
                             * verdadeiro. Com [Alfa, Beta, Gama] a 100/200/300,
                             * apagar a Beta e tocar no campo da Gama punha a
                             * Gama a valer 200 €, e daí ia para o PDF, para o
                             * sinal e para a factura. O mesmo acontecia no
                             * arrumar, no Cmd+Z, no anular a limpeza e no repor
                             * uma versão: o que estava no campo deixava de ser
                             * o que estava no documento.
                             *
                             * Pôr o valor gravado na chave resolve-o pela raiz —
                             * é o mesmo remédio que os valores adicionais já
                             * usam aqui em baixo. A chave só muda quando o
                             * DOCUMENTO muda, nunca a cada tecla: continua a
                             * poder escrever-se «1.500,50» sem o campo se
                             * reformatar a meio da escrita.
                             */
                            key={`preco:${i}:${l.preco}`}
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
                                // A mesma chave do preço, e pela mesma razão: o
                                // unitário é um `defaultValue` num nó que a
                                // remoção de uma linha reaproveita, e sem isto
                                // ficava a mostrar o unitário da linha anterior
                                // — com a fórmula ao lado a explicar uma conta
                                // que já não era a desta linha.
                                key={`unitario:${i}:${escala.unitario}`}
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
                        caixas estão mesmo preenchidas.

                        ── «0 DE 4 LINHAS COM PREÇO» NÃO É UM AVISO ──────────
                        Palavras dela sobre uma proposta CORRECTA: o contador
                        lia-se como erro. E lia-se bem — «0 de 4» tem a forma
                        de um contador por preencher, mas há propostas em que
                        as linhas NUNCA levam valor: o preço vive no total e as
                        linhas são a lista do que está incluído. É, aliás, o
                        formato das propostas dela há anos.

                        As duas situações distinguem-se por um facto e não por
                        um palpite: nenhuma linha com preço E um total escrito é
                        «o preço está no total»; nenhuma linha com preço e nenhum
                        total é «ainda não comecei», e aí um contador a zero
                        também não diz nada que se aproveite. O contador fica
                        para o caso em que ele responde mesmo a alguma coisa —
                        quando há preços por linha para contar. */}
                    {contagem.total > 0 &&
                      (contagem.comPreco === 0 && parseMoneyText(totalInput) > 0 ? (
                        <span className="text-xs text-foreground/55">
                          Preço definido no total — as linhas não levam valor
                        </span>
                      ) : contagem.comPreco > 0 ? (
                        <span className="text-xs text-foreground/55">{contagem.frase}</span>
                      ) : null)}
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
                  <div className="xl:grid xl:grid-cols-2 xl:items-end xl:gap-x-3">
                    <Field
                      label="Rótulo do total"
                      value={doc.totalLabel}
                      onChange={(e) => patch({ totalLabel: e.target.value })}
                      data-campo="totalLabel"
                      placeholder="Valor Total Decoração"
                    />
                    {/* «Valor Total Decoração» já sai «Decoration Total» por
                        reconhecimento; um rótulo reescrito à mão deixa de ser
                        reconhecido, e é para esse que a caixa existe. */}
                    {caixaDeIngles({ tipo: "totalLabel" }, "Rótulo do total", {
                      className: "bo-input px-2.5 py-2 text-xs text-foreground/75",
                      placeholder: "Decoration Total",
                    })}
                  </div>
                </div>

                {/* Valores adicionais — linhas do orçamento que entram no total
                  (Deslocação, Wedding Coordinator, Tecidos, Mobiliário opção A/B, …).
                  Escrever um valor aqui SOMA-O ao total: ver `definirExtras`. */}
                <div className="mt-5">
                  <span className="bo-eyebrow">Valores adicionais</span>
                  <p className="mt-1.5 mb-3 text-xs leading-relaxed text-foreground/45">
                    Linhas mostradas na proposta antes do total (ex.: deslocação, coordenação,
                    tecidos). Entram no sinal e no que o casal paga.
                  </p>
                  {/**
                   * A ESCOLHA QUE VALE DINHEIRO, FEITA À VISTA.
                   *
                   * Palavras dela, sobre uma proposta já enviada: «aparece
                   * "Subtotal dos serviços 2.860" e depois "+140 de
                   * deslocação". Está mal, porque nós tínhamos dito três mil
                   * MAIS cento e quarenta, e depois mais o IVA.»
                   *
                   * As duas leituras são legítimas e a diferença é o que o
                   * casal paga, por isso escolhe-se aqui, por proposta, e a
                   * frase por baixo diz o que cada uma faz aos números que
                   * estão neste ecrã. Uma proposta antiga não muda: nasceu
                   * sem este campo e continua a ler-se como foi enviada.
                   */}
                  <div className="mb-3 flex flex-col gap-1.5">
                    {/* ── A EXPLICAÇÃO SAIU DE DENTRO DO `<option>` ─────────
                        MEDIDO a 375 px: a opção mais comprida — «é só dos
                        serviços, estas linhas somam-se» — precisa de 231 px de
                        letra numa caixa cujo texto tem 261 px de largura útil,
                        mas o `<select>` do iOS reserva ainda a seta e as
                        margens, e um `<option>` NÃO QUEBRA LINHA: a frase saía
                        cortada a meio, e o que se lia era «é só dos serviços,
                        estas linh…». Uma escolha que vale dinheiro não pode
                        ler-se por metade.

                        As opções passam a nomear o modo em duas ou três
                        palavras, e a explicação — que é uma frase, e as frases
                        pertencem ao texto corrido — desce para debaixo do
                        campo, onde pode quebrar à vontade e onde já estavam os
                        números que ela confere.

                        Texto visível num `span` e nome acessível no próprio
                        `select`, em vez de um `label` com as palavras «Valor
                        (sem IVA)» lá dentro: essas são as palavras do CAMPO do
                        total, e um segundo elemento a dizê-las tornava a
                        procura por etiqueta ambígua. Dezanove testes do
                        estúdio deixaram de encontrar o campo do preço por
                        causa disso. A frase de apoio aqui em baixo pode
                        dizê-las — é um `<p>`, e `findByLabelText` não lê
                        parágrafos. */}
                    <span
                      aria-hidden="true"
                      className="text-[9px] tracking-[0.2em] uppercase text-foreground/25"
                    >
                      Como contam no preço final
                    </span>
                    <select
                      id="adicionais-modo"
                      aria-label="Como contam os valores adicionais no preço final"
                      className="bo-input alvo-toque px-2.5 py-2 text-xs"
                      value={doc.budgetExtrasSomam ? "somam" : "dentro"}
                      onChange={(e) =>
                        setDoc((d) => ({ ...d, budgetExtrasSomam: e.target.value === "somam" }))
                      }
                    >
                      <option value="dentro">Já incluídas no valor</option>
                      <option value="somam">Somam ao valor</option>
                    </select>
                    <p className="text-xs leading-relaxed text-foreground/45">
                      {doc.budgetExtrasSomam ? (
                        <>
                          O valor que escreveste em «Valor (sem IVA)» é só dos serviços, e estas
                          linhas somam-se a ele. Subtotal dos serviços{" "}
                          <strong className="font-semibold">{eur(totais.servicos)}</strong>, mais{" "}
                          {eur(totais.adicionais)} destas linhas, dá {eur(totais.total)} sem IVA e{" "}
                          {eur(totais.aPagar)} a pagar.
                        </>
                      ) : (
                        <>
                          O valor que escreveste em «Valor (sem IVA)» já inclui estas linhas: o
                          subtotal dos serviços fica{" "}
                          <strong className="font-semibold">{eur(totais.servicos)}</strong> e o
                          total sem IVA continua {eur(totais.total)}.
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {/* Os rótulos das colunas escondem-se onde as colunas não
                        existem: abaixo de 640 px a linha passa a ser duas
                        filas, e um cabeçalho de quatro colunas por cima disso
                        seria uma legenda para uma grelha que não está lá. */}
                    <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_7rem_9rem_auto] gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25">
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
                          /**
                           * ── A CAIXA DA DESCRIÇÃO COM 22 px ────────────────
                           *
                           * Medido a 375 px: as duas colunas fixas (7rem do
                           * valor + 9rem do IVA) mais a coluna do botão comem
                           * a largura toda, e ao `minmax(0,1fr)` da descrição
                           * sobravam 22 px, uma caixa onde não cabe uma
                           * palavra, no campo que dá nome à linha que o casal
                           * vai ler.
                           *
                           * Abaixo de 640 px a linha passa a duas filas: a
                           * descrição sozinha em cima, e o valor, o IVA e o
                           * botão de apagar por baixo. Acima disso fica
                           * exactamente como estava.
                           */
                          className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_7rem_9rem_auto] items-center gap-2"
                        >
                          {/* Um invólucro só para as duas caixas ficarem uma por
                              cima da outra DENTRO da primeira coluna — a linha é
                              uma grelha, e um filho solto abriria uma coluna
                              nova em vez de descer. */}
                          <div className="col-span-2 min-w-0 sm:col-span-1">
                            <input
                              className="bo-input px-2.5 py-2 text-xs text-foreground/75"
                              value={ex.label}
                              onChange={(e) => updateBudgetExtra(i, { label: e.target.value })}
                              data-campo={`extraRotulo:${i}`}
                              placeholder="Deslocação da equipa Líquen"
                              aria-label="Descrição da linha adicional"
                            />
                            {caixaDeIngles(
                              { tipo: "extraRotulo", i },
                              "Descrição da linha adicional",
                              {
                                className: "bo-input px-2.5 py-2 text-xs text-foreground/75",
                                placeholder: "Líquen team travel",
                                // EMPILHADA: esta já vive numa célula estreita
                                // de uma grelha de dois (o rótulo à esquerda, o
                                // valor à direita). Parti-la outra vez ao meio
                                // dava duas caixas onde não cabe «Deslocação».
                                empilhada: true,
                              },
                            )}
                          </div>
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
                  {/* Os cabeçalhos só a partir de `sm`: no telemóvel a linha
                      passa a duas filas, e três títulos por cima de duas filas
                      nomeiam colunas que ali não existem. */}
                  <div className="hidden grid-cols-[minmax(0,1fr)_10rem_auto] gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25 sm:grid">
                    <span>Item</span>
                    <span className="text-right">Valor</span>
                    <span className="w-5" />
                  </div>
                  {(doc.budgetRows ?? []).map((r, i) => (
                    <div
                      key={i}
                      /* ── A DESCRIÇÃO SOZINHA EM CIMA, NO TELEMÓVEL ──────────
                         Do registo do audit: «a descrição da linha fica com 122
                         px numa grelha que não tem variante de telemóvel».

                         MEDIDO a 390 px: as duas colunas fixas (160 do valor,
                         ~20 do botão) mais os espaços comem 196 dos 318 px da
                         fila. É o irmão mais sortudo do nome da linha do
                         orçamento de Decoração — dá para ler três palavras em
                         vez de uma — mas é a mesma omissão no mesmo ecrã.

                         O desenho é o que as linhas adicionais aqui em cima já
                         fazem: a descrição a ocupar a fila toda, e o valor mais
                         o botão de apagar por baixo. Acima de `sm` fica
                         exactamente como estava. */
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
                    >
                      <input
                        className="bo-input col-span-2 px-2.5 py-2 text-xs text-foreground/75 sm:col-span-1"
                        value={r.item}
                        onChange={(e) => updateBudgetRow(i, { item: e.target.value })}
                        placeholder="Coordenação do dia"
                        aria-label="Item"
                        data-campo={chaveDoCampo({ tipo: "linhaEstimada", i })}
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
                {/* O par PT/EN numa linha só em ecrã largo — ver `aoLado`,
                    em `CaixaInglesa`. Abaixo de `xl` volta a empilhar. */}
                <div className="flex flex-col gap-3 xl:grid xl:grid-cols-2 xl:items-end xl:gap-x-3">
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
                  {caixaDeIngles({ tipo: "budgetNote" }, "Nota do orçamento", {
                    className: `${INPUT_SM} w-full resize-none leading-relaxed`,
                    as: "textarea",
                    rows: 2,
                  })}
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
            /**
             * Os quilómetros até ao local ficam no DOCUMENTO, não num estado
             * do ecrã: é isso que os torna o número desta proposta e que
             * impede que mudar a sede ou o preço do gasóleo lhes toque depois.
             *
             * `null` apaga o campo — «não decidi», e a tabela volta a sugerir.
             * Escrever 0 aqui seria dizer «é em casa», que é outra coisa.
             */
            onKm={(km) =>
              setDoc((d) => {
                if (km === null) {
                  const { kmDeslocacao: _fora, ...resto } = d;
                  void _fora;
                  return resto;
                }
                return { ...d, kmDeslocacao: km };
              })
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

          <Section title="Total, IVA e validade" id="total" fechadaPorOmissao={feitoAoAbrir?.total}>
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
                data-campo="totalAmount"
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
                        de: escrito.base,
                        para: desvio.sugerido,
                        registo: `Total alinhado com a soma das linhas no estúdio: preço final de ${eur(escrito.base)} para ${eur(desvio.sugerido)}.`,
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
                // ── O ÚLTIMO CAMPO DO PASSO, LOGO ACIMA DA BARRA FIXA ───────
                // MEDIDO num iPhone SE (375×667), a fechar este campo com o
                // teclado aberto (~260 px): o teclado mais a barra de acção
                // fixa tapavam-lhe uma fatia. O `scroll-margin-bottom` sozinho
                // não resolve — só entra em jogo se ALGUÉM pedir um scroll, e
                // um toque para abrir o teclado não pede nenhum. Por isso o
                // `onFocus`: ao ganhar foco (é aí que o teclado nasce), o
                // campo centra-se a si próprio no que sobra de ecrã — que já
                // é o ecrã COM o teclado, porque o foco só chega depois de o
                // sistema o ter aberto. `scroll-mb-72` (18 px a mais do que os
                // 260 do teclado) é o cinto e as calças: cobre também quem lá
                // chega por um caminho que não é este foco (uma hiperligação
                // com âncora, um leitor de ecrã a saltar directamente).
                onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center" })}
                containerClassName="scroll-mb-72"
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
                {/* ── SÓ PARA SI ────────────────────────────────────────────
                    O número que falta para decidir com noção. Os custos
                    escrevem-se no painel interno, aqui em cima; a decisão de
                    baixar (ou não) o preço toma-se AQUI, com o total à frente
                    — e era o único sítio onde a margem não estava. */}
                <MargemDoNegocio doc={doc as ProposalDoc} />
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
        {/*
         * ── A TERCEIRA ZONA ──────────────────────────────────────────────
         *
         * «Uma pré-visualização grande e fixa à direita, no espaço hoje
         * vazio.» O índice diz onde estou, a coluna do meio é o que escrevo, e
         * isto é o que vai sair. Ver `PainelDoEstudio` para o resto das razões
         * — em particular por que é um painel só e por que só aparece muito
         * largo.
         */}
        <PainelDoEstudio
          paginas={paginasParaOPainel}
          activa={boardActivo ?? undefined}
          urls={assetUrls}
          originais={assetOriginais}
          aspetos={aspetosDasFotos}
          layoutPorOmissao={doc.layoutPorOmissao}
          enquadramentoPorOmissao={doc.enquadramentoPorOmissao}
          onSaltar={(bi) => irParaAFalta("moodboards", `boardTitulo:${bi}`)}
          onEscolherFotos={(bi) => setPicker({ kind: "board", bi })}
        />
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
          <CustoDaGeracao
            fotos={totalDeFotos}
            capas={doc.coverImages.filter(Boolean).length}
            amostras={amostras}
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
              {/* ── QUANDO O CASAL PREFERE WHATSAPP ─────────────────────────
                  A comunicação sai toda por email, e em Portugal é normal o
                  casal preferir WhatsApp. É aqui, mesmo depois de enviar, que
                  o link fica mais fresco — sem esperar por um segundo pedido. */}
              <CopiarResumo texto={resumoParaCopiar} />
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
              {/* ── QUANDO O CASAL PREFERE WHATSAPP ───────────────────────
                  Antes ainda de enviar: serve para uma revisão de uma
                  proposta que já tinha ido antes (`linkDaProposta` de uma
                  sessão anterior) — o resumo sai com esse link até haver um
                  mais novo. */}
              <div className="mt-3">
                <CopiarResumo texto={resumoParaCopiar} />
              </div>
              {/* ══════════════════════════════════════════════════════════
                  A LÍNGUA TAMBÉM SE ESCOLHE AQUI, ONDE SE ENVIA
                  ══════════════════════════════════════════════════════════

                  A escolha vivia só por cima do «Descarregar PDF», e enquanto
                  desenhava um PDF para ela ver isso chegava. Deixou de chegar:
                  a língua fica GRAVADA com a proposta e decide o email que o
                  casal recebe, o nome do anexo, a página onde ele responde e o
                  que sai quando ele voltar a descarregar o documento.

                  E os passos deste estúdio são clicáveis — dá para ir do
                  Conteúdo direito ao Enviar sem passar pela pré-visualização.
                  Sem este controlo, quem fizesse esse caminho mandava sempre
                  português sem nunca ver a pergunta.

                  É o MESMO estado do passo 2 (`idiomaDoPdf`), de propósito:
                  duas caixas independentes eram a maneira certa de enviar em
                  inglês um documento pré-visualizado em português.

                  A nota diz o que muda ALÉM do PDF, porque é isso que é novo —
                  a ressalva sobre o que o documento traduz (e o que não
                  traduz) está no passo 2, ao lado do botão que o gera. */}
              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-sm text-foreground/60">Idioma</span>
                <Segmented
                  size="sm"
                  ariaLabel="Idioma da proposta"
                  value={idiomaDoPdf}
                  onChange={setIdiomaDoPdf}
                  options={[
                    { value: "pt", label: "Português" },
                    {
                      value: "en",
                      label: "Inglês",
                      ariaLabel:
                        "Inglês — o documento, o email ao cliente e a página onde ele responde saem em inglês",
                    },
                  ]}
                />
                <p className="w-full text-[11px] leading-snug text-foreground/50">
                  Em inglês, o email ao cliente (assunto, texto e botão), o nome do ficheiro em
                  anexo e a página onde ele responde saem em inglês, e é essa a língua que fica
                  guardada com a proposta. O modelo «Proposta enviada» não é usado nesse caso, por
                  estar escrito em português: sai o texto da casa. O contrato e a factura são
                  documentos portugueses e não mudam.
                </p>
              </div>
              {/* ── A MENSAGEM QUE SEGUE COM A PROPOSTA ────────────────────
                  Aqui, logo abaixo do resumo do que vai seguir e ANTES das
                  conferências: faz parte do que o cliente vai receber, e é
                  neste ponto do ecrã que ela está quando decide enviar.

                  A caixa é opcional a sério — em branco, o email sai
                  exactamente como saía antes de ela existir. */}
              <div className="mt-5">
                <Field
                  as="textarea"
                  label="Mensagem para o cliente"
                  rows={4}
                  value={mensagemAoCliente}
                  onChange={(e) => setMensagemAoCliente(e.target.value)}
                  placeholder="Opcional. Ex.: Foi um gosto conhecer-vos na quinta — qualquer ajuste é bem-vindo."
                  className="resize-y"
                  /* O QUE ELA NÃO TEM DE ESCREVER, dito onde ela escreve.
                     Os modelos de resposta rápida despediam-se por cima da
                     assinatura da casa e o cliente recebia dois fechos (ver
                     `ClientMessenger.tsx`). Uma caixa nova sem esta frase era
                     o mesmo convite outra vez. */
                  hint="Vai no mesmo email da proposta, logo a seguir ao «Olá». Em branco, o email segue como sempre. A assinatura da Líquen (Catarina Gaspar, contactos) entra sozinha no fim — não precisas de te despedir."
                />
                {/* ── O `{nome}` QUE NÃO SE RESOLVE AQUI ────────────────────
                    O ecrã «Modelos de email» deste mesmo back office ensina-lhe
                    que `{nome}` é um campo de fusão, com botões que o inserem —
                    e o mensageiro do pedido substitui-o mesmo. Esta caixa não:
                    o email da proposta já abre com «Olá {clientNames},», e um
                    segundo nome pelo meio (que valor teria — o do casal? o do
                    primeiro noivo?) não tem leitura única.

                    Avisar é mais honesto do que inventar um significado: ela vê
                    o problema com o texto à frente e reescreve-o em dois
                    segundos, em vez de o casal receber «Olá {nome},». */}
                {/\{[^}\s]{1,24}\}/.test(mensagemAoCliente) && (
                  <p
                    aria-live="polite"
                    className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-[#b5654a]"
                  >
                    <span aria-hidden="true">⚠</span>
                    <span>
                      Esta caixa não preenche campos como <code>{"{nome}"}</code> — o que escreveres
                      sai tal e qual para o cliente. O email já começa por «Olá{" "}
                      {doc.clientNames || "…"},».
                    </span>
                  </p>
                )}
                {/* ── A NOTA QUE NÃO APARECE NO TEXTO ───────────────────────
                    Com o email editável, o que segue é o TEXTO da caixa de
                    baixo. Um modelo que cite a nota pessoal já a tem lá dentro
                    (o rascunho resolve-a); um que não a cite deixa-a de fora,
                    e a rota nem sequer a acrescenta — ganha o mais específico,
                    que é o corpo escrito.

                    Sem este aviso, ela escrevia a nota, via-a no ecrã, e o
                    casal recebia um email sem ela. */}
                {mensagemAoCliente.trim() &&
                  corpoDoEmail.trim() &&
                  !corpoDoEmail.includes(mensagemAoCliente.trim()) && (
                    <p
                      aria-live="polite"
                      className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-[#8a6420]"
                    >
                      <span aria-hidden="true">⚠</span>
                      <span>
                        Esta nota não aparece no texto do email aqui em baixo — e é esse texto que
                        segue. Escreve-a lá dentro, onde a quiseres.
                      </span>
                    </p>
                  )}
              </div>

              {/* ══════════════════════════════════════════════════════════
                  O EMAIL, ANTES DE ALGUÉM CARREGAR EM ENVIAR
                  ══════════════════════════════════════════════════════════

                  Depois da mensagem (que é um dos dados de que o texto parte) e
                  ANTES da conferência: a passagem de olhos do documento e a do
                  email fazem-se seguidas, com o dedo já a caminho do botão.

                  O `activo` existe porque este passo fica MONTADO enquanto se
                  escreve o conteúdo — sem ele, cada tecla do passo 1 mandava
                  uma leitura do rascunho para o servidor. */}
              <EmailDoEnvio
                quoteId={quote.id}
                doc={doc as ProposalDoc}
                idioma={idiomaDoPdf}
                mensagem={mensagemAoCliente}
                activo={step === "enviar"}
                corpo={corpoDoEmail}
                onCorpo={setCorpoDoEmail}
                assunto={assuntoDoEmail}
                onAssunto={setAssuntoDoEmail}
                onModelo={setModeloDoEmail}
                // Medido quando houve pré-visualização; estimado quando não —
                // e o ecrã diz qual dos dois é.
                bytesDoAnexo={bytesDoPdf ?? tamanhoEstimado(totalDeFotos, amostras)}
                bytesMedidos={bytesDoPdf !== null}
                // Vazio quer dizer «compõe-o tu», e por isso o campo sai do
                // documento em vez de lá ficar como cadeia vazia: um `""`
                // gravado era indistinguível de uma escolha, e o dia em que a
                // composição mudasse não chegava às propostas que passaram por
                // aqui.
                onNomeDoFicheiro={(nome) =>
                  patch({ nomeDoFicheiro: nome.trim() ? nome : undefined })
                }
              />
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
                // A língua escolhida aqui ao lado. Sem ela, a lista falava do
                // pedido que veio em inglês e calava-se sobre a metade da
                // proposta que ia sair em português.
                idioma={idiomaDoPdf}
                onIr={(v) => irParaAFalta(v.seccao, v.campo)}
              />
              {/* ── AS FOTOGRAFIAS ESTÃO MESMO LÁ? ─────────────────────────
                  Primeiro de todos os avisos deste passo, e é de propósito: é
                  o único que fala de uma coisa que já não se vê no ecrã. As
                  gralhas e as traduções lêem-se no documento; um ficheiro que
                  desapareceu do armazenamento só se descobre perguntando.

                  Foi o defeito que a fez escrever: quatro fotos que não
                  existiam seguiram numa proposta, e a primeira pessoa a dar por
                  isso foi o casal. */}
              <FotosEmFalta quoteId={quote.id} doc={doc as ProposalDoc} />

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
              {/* ── O QUE VAI SAIR EM PORTUGUÊS ─────────────────────────────
                  Logo a seguir às Gralhas, e SÓ com «Inglês» escolhido: numa
                  proposta portuguesa não há nada por traduzir, e uma secção
                  vazia a dizê-lo era ruído no ecrã de toda a gente. */}
              {idiomaDoPdf === "en" && (
                <PorTraduzir
                  doc={doc as ProposalDoc}
                  onFicarEmPortugues={(c) => setDoc((d) => escreverEn(d, c.campo, c.texto))}
                  onFicarTodosEmPortugues={() => {
                    const faltam = camposPorTraduzir(doc as ProposalDoc);
                    setDoc((d) => {
                      let saida = d;
                      for (const c of faltam) saida = escreverEn(saida, c.campo, c.texto);
                      return saida;
                    });
                    toast(
                      faltam.length === 1
                        ? "1 campo fica em português."
                        : `${faltam.length} campos ficam em português.`,
                      "info",
                    );
                  }}
                  onIr={(c) => irParaCampo(c.campo, "en")}
                />
              )}
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
                // A língua escolhida ao lado (ver a Conferência, aqui em cima):
                // o parágrafo do que mudou nasce na língua em que a proposta
                // vai mesmo sair.
                idioma={idiomaDoPdf}
                onInserirNaMensagem={inserirParagrafoDoQueMudou}
              />
              {/* ── A FRASE ESTÁTICA SAIU DAQUI ──────────────────────────
                  Dizia «Preenche clientes, referência e um total maior que 0
                  (no passo «Conteúdo») antes de enviar» — sempre as mesmas
                  palavras, mesmo quando só faltava uma das três, sem link para
                  nenhuma e a repetir uma lista que já existia duas vezes (a
                  Conferência aqui em cima e a coluna lateral, que só existe
                  acima de 1280 px).

                  Agora o que trava está na Conferência, em primeiro e a
                  vermelho, com o nome do que falta e um link que põe o cursor
                  dentro do campo. Uma lista, um vocabulário, e visível em
                  qualquer largura — ver `conferencia.ts`. */}
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
        /* Esta barra pousa EM CIMA da barra de destinos do telemóvel, portanto
           a sua distância ao fundo é a altura dessa barra — que passou a viver
           no token `--bo-barra-inferior`. Era a quarta cópia do «56px», e com a
           barra a crescer para 72 px ficava a tapá-la. `lg:bottom-0` porque
           acima de 1024 não há barra nenhuma por baixo. */
        /* ── O AVISO E A BARRA JÁ NÃO DISPUTAM A MESMA FAIXA ───────────────
           MEDIDO a 375 px: um aviso («Este rascunho tinha sido alterado noutro
           sítio…») nasce fixo 12 px acima da navegação do telemóvel, e esta
           barra pousa nessa mesma navegação com ~64 px de altura — ou seja, o
           aviso nascia DENTRO da faixa desta barra, em cima do botão
           «Pré-visualizar» (`elementFromPoint` no centro do botão devolvia o
           texto do aviso) durante os 4 s em que fica no ecrã.
           A saída NÃO é levantar esta barra por cima do aviso: a barra é opaca
           e mais alta do que ele, e o aviso — que é como o estúdio diz que uma
           gravação falhou — desaparecia por completo no telemóvel. Quem se
           afasta é o aviso: esta barra publica a sua altura medida em
           `--bo-barra-accao` (ver o `ResizeObserver` lá em cima) e o
           `Toast.tsx` soma-a à distância a que já se punha do fundo. Ficam os
           dois visíveis, e nenhum tapa o outro. */
        className="sticky bottom-[calc(var(--bo-barra-inferior)+env(safe-area-inset-bottom))] z-20 -mx-1 mt-2 flex flex-wrap items-center gap-2 border-t border-foreground/10 bg-[var(--bo-surface,#ffffff)] px-1 py-2.5 shadow-[0_-8px_16px_-12px_rgba(42,38,32,0.25)] sm:py-3 lg:bottom-0"
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
              {(gravadoEm || porGravar || soNesteComputador || naoDuraAoDeploy) &&
                (() => {
                  const estado: EstadoDaGravacaoNoEcra =
                    porGravar || aGravarNoServidor > 0
                      ? "a-guardar"
                      : soNesteComputador
                        ? "so-neste-computador"
                        : // Depois do `so-neste-computador` e não antes: não
                          // chegar ao servidor é pior do que chegar a um sítio
                          // que não dura, e o indicador só diz uma coisa.
                          naoDuraAoDeploy
                          ? "nao-dura-ao-deploy"
                          : "guardado";
                  const t = textoDaGravacao(estado, gravadoEm);
                  const alarme =
                    estado === "so-neste-computador" || estado === "nao-dura-ao-deploy";
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
                        estado === "so-neste-computador" && soNesteComputador?.porque
                          ? `${t.longo} — ${soNesteComputador.porque}`
                          : estado === "nao-dura-ao-deploy" && naoDuraAoDeploy?.aviso
                            ? `${t.longo} — ${naoDuraAoDeploy.aviso}`
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
            {/* ══════════════════════════════════════════════════════════════
                A LÍNGUA ESCOLHE-SE EM CIMA DO BOTÃO QUE GERA
                ══════════════════════════════════════════════════════════════

                Palavras dela: «na parte de descarregar ou gerar, um botão para
                escolher gerar em inglês».

                Fica encostado ao «Descarregar PDF» e À VISTA — não num menu,
                não nas definições da proposta. A escolha é sobre ESTE clique:
                a mesma proposta sai agora em português e daqui a um minuto em
                inglês, sem nada mudar no documento. Escondida, seria
                descoberta depois de o PDF já ter saído na língua errada — e
                gerar outra vez é um minuto de espera com fotografias a sério.

                ── E A ESCOLHA TEM DE DIZER O QUE FAZ ──────────────────────
                Só a MOLDURA é traduzida: rótulos, texto padrão da casa, datas
                e dinheiro. Os títulos dos serviços, as descrições e as
                legendas que ela escreveu saem tal e qual — foi decisão
                explícita, e está escrita no cabeçalho de
                `proposal-doc-textos`. Sem esta linha, quem carrega em «Inglês»
                abre um PDF meio inglês e conclui que está avariado; com ela,
                sabe que o remédio é escrever esses campos em inglês.

                A linha está sempre no ecrã, e não só depois de escolher: serve
                para DECIDIR, não para explicar um arrependimento. */}
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
              <Segmented
                size="sm"
                ariaLabel="Idioma do PDF"
                value={idiomaDoPdf}
                onChange={setIdiomaDoPdf}
                options={[
                  { value: "pt", label: "Português" },
                  {
                    value: "en",
                    label: "Inglês",
                    // Quem ouve o controlo em vez de o ver leva a mesma
                    // ressalva que está escrita por baixo — o aviso não pode
                    // viver só nos pixéis. Começa por «Inglês», que é o rótulo
                    // visível, para o nome falado e o nome escrito não
                    // divergirem.
                    ariaLabel:
                      "Inglês — sai a moldura do documento em inglês; os campos que preencheste, incluindo a data do evento, ficam como os escreveste",
                  },
                ]}
              />
              {/* ══════════════════════════════════════════════════════════
                  ENQUANTO O PDF SE DESENHA
                  ══════════════════════════════════════════════════════════

                  É o MESMO desenho de documento que o envio faz, na mesma
                  rota, com a mesma espera de 10 a 60 segundos — e aqui havia
                  só um botão a rodar, que ao fim de meio minuto se lê como
                  «isto encravou». A caixa entra no lugar do botão (é onde o
                  estado já vivia, e assim não empurra o selector de idioma
                  nem a ressalva de baixo) e a estimativa é a mesma que o
                  `AEnviarAProposta` usa: aprendida das gerações anteriores
                  desta instalação, e não um número escrito à mão.

                  A espera é OPACA de propósito: é um pedido só, e do lado de
                  cá não há nada para contar até a resposta chegar. */}
              {busy === "preview" ? (
                <EmCurso
                  className="max-w-xs"
                  // A língua continua dita enquanto roda: são dezenas de
                  // segundos numa proposta cheia, tempo que chega para deixar
                  // de haver a certeza do que se escolheu — o português
                  // cala-se porque é o de sempre.
                  titulo={idiomaDoPdf === "en" ? "A gerar o PDF em inglês…" : "A gerar o PDF…"}
                  estimadoMs={tempoEstimado(totalDeFotos, amostras)}
                  nota="Assim que estiver desenhado, o PDF é descarregado."
                  notaDemorada="Com a rede fraca isto demora. Não feches a página — o PDF é descarregado assim que estiver."
                />
              ) : (
                <Button variant="secondary" onClick={preview} disabled={busy !== null}>
                  Descarregar PDF
                </Button>
              )}
              {/* ══════════════════════════════════════════════════════════
                  A RESSALVA TEM DE SER VERIFICÁVEL NO PAPEL
                  ══════════════════════════════════════════════════════════

                  Quem a lê vai a seguir mandar o PDF a um cliente inglês.

                  Já esteve errada duas vezes, e das duas por prometer a
                  descoberta ao cliente: prometeu «datas» quando a data do
                  evento saía em português, e depois prometeu que os campos
                  preenchidos ficavam TODOS como estavam — quando a data e o
                  tipo de evento passaram a traduzir-se sozinhos e a prosa dela
                  passou a ter uma segunda caixa.

                  Diz agora as três coisas que são verdade, e nenhuma a mais:
                  o que ela traduziu sai em inglês, o que não traduziu sai em
                  português, e os valores ficam à portuguesa. */}
              <p className="w-full text-right text-[11px] leading-snug text-foreground/50">
                Em inglês sai a moldura do documento — rótulos, textos da casa, condições, a data e
                o tipo de evento. Da tua prosa sai em inglês o que estiver nas caixas «EN»; o que
                ficar em branco sai em português. Os valores continuam à portuguesa (1.234,56 €).
              </p>
              {/* ── O QUE FALTA, DITO ANTES DO CLIQUE ──────────────────────
                  Este é o sítio onde o PDF nasce, e o primeiro PDF inglês sai
                  quase sempre antes de a Conferência ser vista. Um `toast` não
                  serviria: o toast conta o que ACONTECEU, e isto conta o que
                  vai acontecer — tem de estar à vista antes de se carregar.
                  `aria-live` porque o número muda com o selector ao lado. */}
              {idiomaDoPdf === "en" &&
                (() => {
                  /*
                   * As duas contas, e as duas frases.
                   *
                   * «Vai sair em português» é verdade sobre um campo VAZIO e é
                   * falso sobre um desactualizado — esse tem inglês e vai sair
                   * em inglês, só que no inglês errado. Duas coisas com dois
                   * remédios: uma traduz-se, a outra relê-se.
                   */
                  const faltam = camposPorTraduzir(doc as ProposalDoc);
                  const velhas = camposPorRever(doc as ProposalDoc).filter(
                    (c) => c.estado === "desactualizado",
                  );
                  if (faltam.length === 0 && velhas.length === 0) return null;
                  const primeiro = faltam[0] ?? velhas[0];
                  return (
                    <p
                      aria-live="polite"
                      className="w-full text-right text-[11px] leading-snug text-[#8a6420]"
                    >
                      {faltam.length > 0 &&
                        (faltam.length === 1
                          ? "1 campo ainda não tem versão inglesa — vai sair em português."
                          : `${faltam.length} campos ainda não têm versão inglesa — vão sair em português.`)}{" "}
                      {velhas.length > 0 &&
                        (velhas.length === 1
                          ? "1 tradução ficou para trás do português."
                          : `${velhas.length} traduções ficaram para trás do português.`)}{" "}
                      <button
                        type="button"
                        onClick={() => irParaCampo(primeiro.campo, "en")}
                        className="font-medium underline underline-offset-2"
                      >
                        Ver quais
                      </button>
                    </p>
                  );
                })()}
            </div>
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
            <Button
              variant="ghost"
              onClick={() => setStep("prever")}
              // A meio de um envio, voltar atrás não cancela nada — o pedido já
              // está a correr no servidor — e só serve para ela deixar de ver o
              // que está a acontecer.
              disabled={busy === "send"}
            >
              ← Pré-visualizar
            </Button>
            {/* ── ENQUANTO ESTÁ A IR ──────────────────────────────────────
                «Ao enviar a proposta quero que haja uma animação que eu perceba
                que está a ser enviado.» Não havia nenhuma: o `send()` fechava a
                confirmação e o ecrã voltava ao botão apagado, durante os
                dezenas de segundos que o desenho do PDF e o email demoram numa
                quinta com 4G fraco. */}
            {busy === "send" ? (
              <div className="ml-auto flex justify-end">
                <AEnviarAProposta
                  fotos={totalDeFotos}
                  amostras={amostras}
                  para={quote.email || undefined}
                />
              </div>
            ) : /* ── O QUE FICA DE FORA, PERGUNTADO ANTES DE SEGUIR ────────
                O servidor desenhou o documento, viu o que a composição cortou e
                parou. O email ainda não saiu e a proposta ainda não foi gravada
                — é o último instante em que voltar atrás não custa nada. A
                frase de cada corte é a mesma que o aviso da pré-visualização
                usa; o que muda é a altura em que aparece. */
            cortesPorConfirmar ? (
              <div className="ml-auto flex flex-col items-end gap-2">
                <div className="max-w-lg rounded-xl border border-[#c98a2e]/35 bg-[#c98a2e]/[0.06] px-3 py-2 text-xs leading-relaxed text-foreground/75">
                  <p className="font-medium">O documento sai com conteúdo cortado:</p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {cortesPorConfirmar.map((c) => (
                      <li key={`${c.where}:${c.unit}`}>· {fraseDeCorte(c)}</li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-foreground/55">
                    Volta ao conteúdo para encurtar o que ficou cortado, ou envia assim mesmo se for
                    de propósito.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="primary"
                    onClick={() => void send(true)}
                    disabled={busy !== null}
                  >
                    Enviar assim mesmo
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCortesPorConfirmar(null);
                      setStep("conteudo");
                    }}
                  >
                    Voltar e corrigir
                  </Button>
                </div>
              </div>
            ) : confirmSend ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-sm text-foreground/60">
                  Enviar para {quote.email || "o cliente"}?
                </span>
                <Button variant="primary" onClick={() => void send()} disabled={busy !== null}>
                  Confirmar
                </Button>
                <Button variant="ghost" onClick={() => setConfirmSend(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              /* ── O BOTÃO, E POR CIMA DELE A RAZÃO ────────────────────────
                 «Quando falta alguma coisa na proposta, quero que apareça um
                 aviso a dizer que não dá para enviar porque não preenchi tal
                 coisa.» A razão já existia — vivia no `title`, que num iPhone
                 não aparece. Passa a estar escrita ao lado do botão, com cada
                 falta a saltar para onde se resolve. */
              <div className="ml-auto flex flex-col items-end gap-2">
                <PorqueNaoDaParaEnviar
                  faltas={faltas}
                  fotosPorConfirmar={fotosPorConfirmar}
                  emailDoCliente={quote.email}
                  onIr={(f) => irParaAFalta(f.seccao, f.campo)}
                />
                <Button
                  variant="primary"
                  onClick={() => setConfirmSend(true)}
                  disabled={busy !== null || !canSend}
                  /**
                   * ── O BOTÃO DIZ O QUE FALTA, E NÃO UMA LISTA DECORADA ──────
                   *
                   * Isto dizia «Preenche clientes, referência e um total maior
                   * que 0» — os três bloqueios que existiam quando foi escrito.
                   * Passaram a ser oito, e uma frase fixa que nomeia três deles
                   * é pior do que uma genérica: manda procurar no sítio errado.
                   *
                   * Agora sai do MESMO sítio que trava o botão, portanto não
                   * pode discordar dele.
                   */
                  title={
                    canSend
                      ? undefined
                      : fotosPorConfirmar > 0
                        ? "Há fotos ainda a entrar na proposta. Falta pouco."
                        : faltas
                            .filter((f) => f.trava)
                            .map((f) => f.texto)
                            .join(" · ") || "Falta preencher a proposta antes de enviar."
                  }
                  iconRight={<span aria-hidden="true">→</span>}
                >
                  Gerar e enviar ao cliente
                </Button>
              </div>
            )}
          </>
        )}

        {step === "enviar" && sent && (
          <Button variant="ghost" onClick={() => setStep("conteudo")}>
            ← Voltar ao conteúdo
          </Button>
        )}
      </div>

      {/* NOTA SOBRE A BARRA ACIMA, medida a 375 px num iPhone SE:
          o `flex-wrap` estava a partir de 640 px (`sm:flex-wrap`), e abaixo
          disso a barra era uma fila rígida. No último passo ela leva o
          «← Pré-visualizar» e o «Gerar e enviar ao cliente» lado a lado: 222 px
          de botão numa barra de 351 px, com o botão a acabar em 390 px de um
          ecrã de 375. O último toque de toda a jornada de escrever uma proposta
          ficava cortado, e a 320 px faltavam 70 px.

          O `flex-wrap` passa a valer em todas as larguras: quando não cabem
          lado a lado, o botão principal desce para a linha de baixo, inteiro.
          Acima de 640 px nada muda, porque aí já cabiam. */}

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
          /* ── A PÁGINA QUE SE ESTÁ A COMPOR ─────────────────────────────
             Só para os mood boards: um mood board É uma página do PDF, com
             `MOOD_BOARD_MAX_IMAGES` fotos impressas e as restantes de fora. As
             capas são uma foto por espaço — não há conjunto nenhum a compor, e
             o canto não teria o que dizer.

             Fora também quando se está a TROCAR uma foto no lugar: aí a página
             não cresce, e um contador a somar mais uma seria mentira. */
          paginaEmConstrucao={
            picker.kind === "board" && picker.substituir === undefined
              ? {
                  titulo: doc.moodBoards[picker.bi]?.title,
                  fotos: (doc.moodBoards[picker.bi]?.images ?? []).map((path) => ({
                    path,
                    url: assetUrls[path],
                    // O plano B, como na grelha aqui ao lado: uma miniatura que
                    // não existe cai para o original em vez de dar o ícone de
                    // imagem partida.
                    planoB: assetOriginais[path],
                  })),
                  maximo: MOOD_BOARD_MAX_IMAGES,
                }
              : undefined
          }
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

/**
 * As medições das gerações de PDF, partilhadas por TODAS as propostas.
 *
 * Sem o id do pedido de propósito: o que se aprende numa proposta serve para a
 * seguinte — é a mesma máquina, a mesma ligação e o mesmo servidor. Preso à
 * proposta, a primeira geração de cada uma seria sempre uma adivinha.
 */
const AMOSTRAS_KEY = "liquen-proposal-studio:geracoes";

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
 * UMA DESCRIÇÃO QUE SE VÊ INTEIRA — A CAIXA É QUE CRESCE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A descrição de um mood board tinha `rows={2}` e o resto rolava lá dentro.
 * MEDIDO a 390 px, na proposta de que a dona do negócio mandou fotografia:
 *
 *     campo (pt)   70 px de altura   224 px de conteúdo   →  154 px escondidos
 *     campo (en)   70 px de altura   276 px de conteúdo   →  206 px escondidos
 *
 * Sessenta e nove por cento do texto português fora de vista, e sete por cento
 * do que se vê é meia frase — a captura lê-se «…cores escolhida pelos noivos,
 * em jarras de vidro que podem ser transparentes ou de cor . Integração de
 * velas…», com o princípio cortado por cima. Uma barra de deslocação dentro de
 * uma caixa de 70 px, num telemóvel, não é uma forma de ler: é texto invisível
 * com um sinal de que existe.
 *
 * Uma linha por omissão (uma caixa vazia é mais pequena do que era) e cresce
 * com o que lá está. É o mesmo remédio — e a mesma conta das bordas — do
 * `CampoQueCresce` do `ServicesEditor` e do `TextareaQueCresce` da
 * `CaixaInglesa`; aqui não se importa de nenhum dos dois porque nenhum deles é
 * exportado e um export só para quatro linhas ataria o estúdio ao editor de
 * serviços.
 *
 * `useLayoutEffect` e não `useEffect`: com o segundo, a caixa aparecia com uma
 * linha e saltava para as suas à frente de quem escreve.
 */
function DescricaoQueCresce({
  valor,
  ...resto
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "rows" | "ref"> & {
  valor: string;
}) {
  const meu = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = meu.current;
    if (!el) return;
    // ── VAZIA É UMA LINHA, E ISSO TEVE DE SER DITO ────────────────────────
    // MEDIDO: um `<textarea>` VAZIO com este `placeholder` («Descrição
    // (opcional) — ex.: runner floral com hortênsias verdes…») devolve
    // `scrollHeight: 120` no Chrome — o placeholder é maquetizado como texto e
    // conta. Uma caixa vazia abria com 122 px, quase o dobro dos 70 que tinha
    // antes desta correcção. Sem altura escrita à mão, o `rows={1}` manda, e o
    // mínimo de toque (44 px, globals.css) faz o resto.
    if (valor === "") {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    // `scrollHeight` conta o conteúdo e o `padding` e NÃO conta a borda; com o
    // `box-sizing: border-box` do Tailwind, escrevê-lo tal e qual em `height`
    // faz a borda comer dois píxeis ao texto. Somar `offsetHeight -
    // clientHeight` devolve o número exacto — a mesma conta, e a mesma medição,
    // do `CampoQueCresce`.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, [valor]);
  return <textarea {...resto} value={valor} rows={1} ref={meu} />;
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
 * ── PORQUE É QUE COM RATO ESTÁ NUMA BARRA E AO TOQUE NUM «⋯» ──────────────
 *
 * MEDIDO a 375 px, template Decoração, dois mood boards com 3 e 4 fotografias,
 * proposta bilingue ligada — o ecrã de que a dona do negócio mandou fotografia:
 *
 *     célula da miniatura            84 × 72 px
 *     botão (o `alvo-toque` no dedo) 44 × 44 px
 *     sete botões, a quebrar         84 × 328 px
 *     sobe acima da própria foto        256 px
 *     z-index                              20
 *
 * Sete alvos de 44 px NÃO CABEM numa célula de 84: o `flex-wrap` empilhava-os
 * numa coluna quatro vezes e meia mais alta do que a miniatura, e o
 * `absolute bottom-0` fazia essa coluna crescer PARA CIMA, por cima do que
 * estivesse lá — com `z-20`, portanto por cima e não por baixo. Com sete
 * fotografias na página eram sete colunas de quadrados escuros a atravessar o
 * subtítulo, a caixa EN e a descrição. Medido: 13 pedaços de texto tapados,
 * entre eles «Two columns with Roman vase…» com 53 × 29 px de letra por baixo
 * de um quadrado preto.
 *
 * A regra antiga (`[@media(hover:none)]:opacity-100`) estava certa no
 * princípio — num ecrã táctil, «aparece no hover» quer dizer «não existe» — e
 * errada no resultado: tornou visíveis sete botões que não têm onde caber.
 *
 * Agora a FORMA muda com o apontador, e não só a opacidade:
 *   · com rato  — a barra de sete ícones de 24 px, revelada ao passar por
 *                 cima, exactamente como sempre esteve;
 *   · com dedo  — UM «⋯» de 44 px no canto da miniatura, que abre a folha
 *                 inferior com as sete acções escritas por extenso.
 *
 * Tudo em CSS e não com o `usePodeEsconderNoHover()`: um hook lê `false` no
 * servidor e no primeiro desenho, e o computador via o «⋯» a piscar antes de a
 * barra aparecer. A media query não tem primeiro desenho errado.
 *
 * ── E A PERGUNTA É `com-rato`, NÃO `(hover: none)` — ISTO VOLTOU ──────────
 *
 * A barra voltou a aparecer por cima das células, e a dona do negócio mandou a
 * fotografia. A causa é uma pergunta MAL PARTIDA em duas: a barra escondia-se
 * com `(hover: none)`, mas o tamanho dos botões cresce com `(pointer: coarse)`
 * (`.alvo-toque`, em globals.css). São duas perguntas diferentes, e há
 * aparelhos que respondem SIM à segunda e NÃO à primeira: um iPhone ou um iPad
 * com AssistiveTouch, com rato ou com trackpad ligados, e um portátil de ecrã
 * táctil. Nesses, `(hover: none)` é falso — a barra fica — e
 * `(pointer: coarse)` é verdadeiro — cada ícone salta de 24 px para 44.
 *
 * MEDIDO num Chromium com `primaryPointerType=coarse` e `primaryHoverType=hover`,
 * a 390 px, na proposta das capturas (nove fotos, um mood board):
 *
 *     célula                                   89 × 104 px
 *     barra                                    89 × 328 px
 *     sobe acima do topo da própria célula         209 px
 *     cada um dos sete botões                   44 × 44 px
 *     «⋯» (o caminho do dedo)               display: none
 *     pedaços de texto tapados                          5
 *
 * — incluindo o «Imagem guardada» e o «Não consegui mostrá-la neste ecrã.» da
 * própria célula. E, mesmo a `opacity: 0`, a barra continua a APANHAR o toque:
 * `elementFromPoint` no meio do «Tentar novamente» devolvia o botão «Mover para
 * trás». O botão que explica a avaria estava debaixo de um botão invisível.
 *
 * A casa já tem a pergunta inteira, e é uma só: `com-rato`
 * (`(hover: hover) and (pointer: fine)`, globals.css). Os dois lados penduram-se
 * nela — `hidden com-rato:flex` na barra, `com-rato:hidden` no «⋯» — pela razão
 * escrita lá: um browser que não perceba de ponteiros mostra as DUAS formas,
 * feio mas inteiro, em vez de não mostrar nenhuma.
 *
 * E os sete botões da barra deixaram de ser `alvo-toque`. A barra só existe
 * onde há rato, e com rato o mínimo de 44 px nunca se aplica — mas era ele que,
 * quando a media query falhava, transformava 7 × 24 px numa coluna de 328. Sem
 * ele, o pior caso deixa de poder acontecer.
 *
 * ── E REMOVER FICOU MAIS DIFÍCIL DE ACERTAR POR ENGANO, NÃO MAIS FÁCIL ─────
 * Estava um × de 44 px encostado ao ✓ de escolher, dentro de uma célula de 84 —
 * dois alvos a 4 px um do outro, num sítio onde o dedo tapa os dois. Passa a
 * ser uma linha escrita «Remover fotografia», em baixo, separada por um traço
 * das que não apagam nada, e a vermelho. É a mesma regra que o `MenuDeAccoes`
 * já aplica às linhas das tabelas.
 *
 * ── AS SETAS NÃO SÃO UM ADORNO ────────────────────────────────────────────
 * São o caminho do teclado (e do dedo trémulo). Arrastar exige apontar, mover e
 * largar sem falhar; mover uma foto uma casa é um toque, e é o gesto que se faz
 * dez vezes seguidas ao afinar uma página.
 */
function AccoesDaFoto({
  nome = "esta fotografia",
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
  /** Como se chama esta fotografia na folha do telemóvel («Fotografia 2 de
   *  Decoração Cerimónia»). Sete linhas escritas precisam de dizer a QUEM se
   *  aplicam — a barra de ícones não precisava, porque está em cima da foto. */
  nome?: string;
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
  const [folhaAberta, setFolhaAberta] = useState(false);
  /* SEM `alvo-toque`, e é o coração da correcção: esta barra só existe onde há
     rato (`com-rato`), e ali o mínimo de 44 px nunca se aplicaria de qualquer
     maneira. O que ele fazia era garantir que, no dia em que a media query
     falhasse, sete ícones de 24 px se tornassem sete quadrados de 44 — que é a
     coluna de 328 px medida em cima. */
  const botao =
    "flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-[11px] leading-none text-white transition-colors hover:bg-black/75 disabled:opacity-30";

  /* A MESMA lista para os dois caminhos. Duas listas seriam duas versões da
     verdade — a acção acrescentada num sítio e esquecida no outro é a forma
     mais barata de o telemóvel voltar a ficar para trás. */
  const accoes: {
    id: string;
    rotulo: string;
    glifo: string;
    onAccao: () => void;
    desativada?: boolean;
    activa?: boolean;
    destrutiva?: boolean;
  }[] = [
    {
      id: "recuar",
      rotulo: "Mover para trás",
      glifo: "←",
      onAccao: onRecuar,
      desativada: !podeRecuar,
    },
    {
      id: "avancar",
      rotulo: "Mover para a frente",
      glifo: "→",
      onAccao: onAvancar,
      desativada: !podeAvancar,
    },
    { id: "ampliar", rotulo: "Ver em grande", glifo: "⤢", onAccao: onAmpliar },
    { id: "substituir", rotulo: "Trocar por outra fotografia", glifo: "⇄", onAccao: onSubstituir },
    ...(principal !== undefined
      ? [
          {
            id: "principal",
            rotulo: principal
              ? "Deixar de ser a fotografia principal"
              : "Fotografia principal desta página",
            glifo: "★",
            onAccao: onPrincipal,
            activa: principal,
          },
        ]
      : []),
    {
      id: "seleccionar",
      rotulo: seleccionada ? "Retirar da selecção" : "Escolher para mover em conjunto",
      glifo: "✓",
      onAccao: onSeleccionar,
      activa: seleccionada,
    },
    {
      id: "remover",
      rotulo: "Remover fotografia",
      glifo: "×",
      onAccao: onRemover,
      destrutiva: true,
    },
  ];

  return (
    <>
      {/* ── O CAMINHO DO DEDO: um alvo, e as sete acções por extenso ────────
          `flex com-rato:hidden` — existe por omissão e desaparece só onde há
          MESMO rato. Antes era `hidden [@media(hover:none)]:flex`, e num
          telemóvel com trackpad ou AssistiveTouch (onde `(hover: none)` é
          falso) isto ficava em `display: none`: sem barra utilizável e sem
          «⋯», a célula não tinha acção nenhuma. Fica no canto inferior direito
          da miniatura e mede 44 px numa célula de 84×72: cabe, e é o único que
          cabe. */}
      <button
        type="button"
        onClick={() => setFolhaAberta(true)}
        aria-label={`Acções de ${nome}`}
        aria-haspopup="dialog"
        className="alvo-toque pointer-events-auto absolute right-0.5 bottom-0.5 z-20 flex h-11 w-11 items-center justify-center rounded-lg bg-black/60 text-white transition-colors com-rato:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      <FolhaOuDialogo
        aberto={folhaAberta}
        onFechar={() => setFolhaAberta(false)}
        titulo={nome}
        descricao="O que se pode fazer a esta fotografia."
        largura="sm"
      >
        <div className="flex flex-col">
          {accoes.map((a, i) => {
            // Um traço antes da primeira que apaga: é o que impede o toque
            // distraído em «Remover» quando se queria a linha de cima.
            const primeiraDestrutiva =
              a.destrutiva && !accoes.slice(0, i).some((x) => x.destrutiva);
            return (
              <button
                key={a.id}
                type="button"
                disabled={a.desativada}
                onClick={() => {
                  setFolhaAberta(false);
                  a.onAccao();
                }}
                className={`alvo-toque !justify-start flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors disabled:opacity-30 ${
                  a.destrutiva
                    ? "text-[#8a3d2f] hover:bg-[#8a3d2f]/[0.07]"
                    : "text-foreground/80 hover:bg-foreground/[0.05]"
                } ${primeiraDestrutiva ? "mt-1 border-t border-foreground/[0.08] pt-3" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] ${
                    a.activa ? "bg-[#4d6350] text-white" : "bg-foreground/[0.06] text-foreground/60"
                  }`}
                >
                  {a.glifo}
                </span>
                {a.rotulo}
              </button>
            );
          })}
        </div>
      </FolhaOuDialogo>

      {/* ── O CAMINHO DO RATO: DUAS ACÇÕES, E O RESTO A UM TOQUE ───────────
          Palavras dela: «controlos sobrepostos à imagem». Eram seis círculos
          escuros a tapar a faixa de baixo da fotografia — que é onde costuma
          estar o que interessa numa foto de mesa posta —, e tapavam-na
          precisamente enquanto ela está a olhar para ela.

          Ficam duas: as setas. São o gesto que se faz cem vezes por proposta, e
          mandá-las para dentro de uma folha era trocar um clique por dois no
          trabalho de todos os dias. As outras quatro — ver em grande, trocar,
          principal, escolher — e a que APAGA passam para a folha, que já existe
          e já é a única coisa que o dedo vê. Uma lista escrita por extenso, com
          o «Remover» separado por um traço, é melhor sítio para o botão
          destrutivo do que um círculo de 24 px ao lado de outros cinco iguais.

          `hidden com-rato:flex`: não existe até haver rato — nem desenhada nem
          a apanhar toques. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden flex-wrap items-center justify-center gap-0.5 p-1 opacity-0 transition-opacity group-hover/foto:opacity-100 focus-within:opacity-100 com-rato:flex">
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
          {/* A MESMA folha do dedo, e não uma segunda lista: a acção
              acrescentada num sítio e esquecida no outro é a forma mais barata
              de os dois caminhos divergirem. */}
          {/* SEM tom de estado: a célula já diz o que está ligado — anel verde
              à volta quando está escolhida, etiqueta «principal» no canto. Um
              «⋯» verde ler-se-ia como se o próprio botão estivesse ligado. */}
          <button
            type="button"
            className={botao}
            onClick={() => setFolhaAberta(true)}
            aria-haspopup="dialog"
            aria-label={`Mais acções de ${nome}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        </span>
      </div>
    </>
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
  fechadaPorOmissao,
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
  /**
   * Esta secção já estava feita quando a proposta abriu?
   *
   * `undefined` quer dizer «ainda não se sabe» e não «não estava» — ver o
   * efeito lá dentro. Só vale onde ela nunca dobrou a secção à mão.
   */
  fechadaPorOmissao?: boolean;
}) {
  const [fechada, setFechada] = useState(false);
  const jaDecidiu = useRef(false);
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O QUE JÁ ESTÁ FEITO ABRE FECHADO — MAS SÓ AO ABRIR
   * ════════════════════════════════════════════════════════════════════════
   *
   * «Secções concluídas recolhem-se automaticamente. Só a secção em que se
   * está a trabalhar fica aberta.»
   *
   * Com um limite que ela não pediu e que é o que torna isto usável: **uma
   * secção nunca se fecha por baixo das mãos dela.** Se fechasse quando fica
   * completa, escrever o último campo de um grupo fazia o ecrã saltar e o
   * cursor desaparecer — um editor que se mexe sozinho enquanto se escreve é
   * pior do que um editor comprido.
   *
   * Por isso a decisão é tomada UMA vez, quando a proposta abre, e o que
   * decide é o que já estava feito nesse momento.
   *
   * ── E A ESCOLHA DELA GANHA SEMPRE ───────────────────────────────────────
   *
   * Uma secção que ela tenha aberto ou fechado à mão tem a resposta guardada,
   * e essa manda. O automatismo só fala onde ninguém disse nada.
   *
   * Ler no efeito e não no `useState` inicial: o servidor não tem
   * `localStorage`, e uma diferença entre o que o servidor desenha e o que o
   * browser desenha dá um erro de hidratação.
   */
  useEffect(() => {
    if (!id || jaDecidiu.current) return;
    const guardadas = lerFechadas();
    if (id in guardadas) {
      setFechada(!!guardadas[id]);
      jaDecidiu.current = true;
      return;
    }
    // Ainda não se sabe se esta secção estava feita — o documento pode não ter
    // chegado. Espera-se, em vez de se decidir com uma resposta que é «não sei».
    if (fechadaPorOmissao === undefined) return;
    setFechada(fechadaPorOmissao);
    jaDecidiu.current = true;
  }, [id, fechadaPorOmissao]);

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
      {/* `flex-wrap`: SEM ela, um `nota` comprido («Mood boards», com "0
          páginas · 0 fotos · PDF com cerca de 7" ao lado) e o título competiam
          pela MESMA linha sem ninguém a ceder por inteiro — o `nota` já vinha
          `shrink-0` (não podia encolher), portanto era sempre o título a levar
          com o aperto. MEDIDO a 375 px: o botão do título ficava com 66×56 px
          e o `h3` com 49×40 — «Mood boards» a partir-se em «Mood» / «boards».
          «Só para ti», ao lado (`PainelInterno.tsx`), tinha o mesmo problema
          por uma razão parecida.

          Com a quebra ligada e o BOTÃO do título também `shrink-0` (a seguir),
          o título deixa de ceder espaço nenhum: quando não cabem os dois lado
          a lado, é o `nota` — que já não encolhe — a descer inteiro para a
          linha de baixo, como já acontecia nas linhas de Serviços. */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
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
               a seta e o título continuarem alinhados pela base.
               `shrink-0`: ver o comentário acima do invólucro — o título nunca
               é quem cede espaço a um `nota` comprido. */
            className="alvo-toque group -my-1 flex shrink-0 items-baseline gap-2 py-2 text-left"
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
          <h3 className="font-display shrink-0 text-base leading-tight text-foreground/90">
            {title}
          </h3>
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

/**
 * Indicador de passos "1 · Conteúdo → 2 · Pré-visualizar → 3 · Enviar".
 *
 * ── NO TELEMÓVEL, OS NÚMEROS E SÓ O NOME DO PASSO ONDE SE ESTÁ ────────────
 * MEDIDO a 375 px: os três botões com os nomes por extenso, mais as duas setas
 * e os intervalos, pedem 396 px de fila num espaço de 343 — a fila quebrava e
 * o «3 Enviar» ficava sozinho numa segunda linha, sem seta a ligá-lo, a
 * parecer outra coisa em vez do terceiro passo.
 *
 * O nome dos passos onde NÃO se está passa a `sr-only` abaixo de 640 px: fica
 * o número, que é o que dá o sentido de percurso, e o passo activo continua a
 * dizer o nome — que é a única pergunta a que isto responde quando se está a
 * meio («onde estou?»). Acima de 640 px não muda nada.
 *
 * `sr-only` e NÃO `hidden`: `display: none` tira o texto da árvore de
 * acessibilidade, e o botão passava a chamar-se «2» para quem usa leitor de
 * ecrã — e para os testes que o procuram por «Pré-visualizar».
 */
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
              {/* Um `span` só, com o rótulo INTEIRO lá dentro. Partir a frase
                  em pedaços dentro de um `inline-flex` põe cada pedaço na sua
                  própria coluna — «Pré-» e «visualizar» separados. */}
              <span className={active ? undefined : "max-sm:sr-only"}>{s.label}</span>
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BOTÃO «COPIAR RESUMO»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Três ou quatro linhas prontas a colar no WhatsApp (o texto já vem pronto de
 * fora — `resumoDaPropostaParaCopiar` — este componente só sabe COPIAR, e o
 * que fazer quando copiar falha).
 *
 * ── QUANDO A ÁREA DE TRANSFERÊNCIA FALHA ───────────────────────────────────
 * O Safari recusa `navigator.clipboard.writeText` fora de um gesto directo do
 * utilizador (um `await` a mais pelo meio já chega para deixar de contar como
 * um), e há quem tenha as permissões desligadas. Nenhum dos dois pode virar um
 * erro seco: o texto fica visível E SELECCIONADO, pronto a copiar à mão com
 * Cmd/Ctrl+C — nunca uma mensagem a mandá-la "tentar outra vez" sem dar outra
 * saída.
 */
function CopiarResumo({ texto }: { texto: string }) {
  const { toast } = useToast();
  const [falhou, setFalhou] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  async function copiar() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Sem área de transferência.");
      await navigator.clipboard.writeText(texto);
      setFalhou(false);
      toast("Resumo copiado.", "success");
    } catch {
      setFalhou(true);
    }
  }

  // A caixa só aparece quando falhou, e é aí que o texto se selecciona
  // sozinho — é o gesto que substitui o botão que não funcionou.
  useEffect(() => {
    if (falhou) areaRef.current?.select();
  }, [falhou]);

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => void copiar()}>
        Copiar resumo
      </Button>
      {falhou && (
        <div className="mt-2 max-w-md rounded-xl border border-[#c98a2e]/35 bg-[#c98a2e]/[0.06] p-3">
          <p className="text-xs leading-relaxed text-foreground/70">
            Não foi possível copiar automaticamente. O texto está seleccionado: copia com
            Cmd/Ctrl+C.
          </p>
          <textarea
            ref={areaRef}
            aria-label="Resumo da proposta, para copiar à mão"
            readOnly
            value={texto}
            onFocus={(e) => e.currentTarget.select()}
            rows={4}
            className="bo-input mt-2 w-full px-3 py-2 text-xs text-foreground/85"
          />
        </div>
      )}
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
  /** A fotografia já está no ecrã — é o que apaga o esqueleto por cima. */
  const [pintada, setPintada] = useState(false);
  // Enquanto não está pintada, esta caixa dizia «Imagem» e mais nada — o mesmo
  // ecrã que uma foto avariada dá. Ver `Thumb` para o porquê de isto importar.
  const aCarregar = !pintada && !failed;
  return (
    <div
      aria-busy={pendente || aCarregar || undefined}
      className={`relative aspect-[4/3] overflow-hidden rounded-lg border border-foreground/[0.1] bg-foreground/[0.04] ${
        pendente ? "opacity-45" : ""
      }`}
    >
      {alvo && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={alvo}
          alt=""
          // Este resumo vive no fim do passo, e as suas duas células estão
          // quase sempre fora do ecrã quando a página abre: `lazy` é o que
          // impede que disputem a ligação com as fotos que ela está a ver.
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          // A `ref` E o `onLoad`, pela razão que o `medir` do `Thumb` explica:
          // uma imagem vinda da cache pode já estar completa quando o `onLoad`
          // é ligado, e aí só a referência a apanha.
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) setPintada(true);
          }}
          onLoad={() => setPintada(true)}
          onError={aoFalhar}
        />
      ) : (
        !aCarregar && (
          <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.15em] text-foreground/30">
            Imagem
          </div>
        )
      )}
      {aCarregar && (
        <span className="bo-skeleton pointer-events-none absolute inset-0" aria-hidden />
      )}
    </div>
  );
}

/** Resumo em página: a "forma" da proposta (capa, serviços, total sem IVA/IVA/
 *  com IVA, sinal/saldo) sem ter de descarregar o PDF. */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO VAI DEMORAR, E SE O EMAIL AGUENTA O ANEXO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «tempo estimado de geração do PDF, calculado a partir do
 * número de fotos e de gerações anteriores» e «aviso se o PDF ultrapassar o
 * limite de anexo de email (8 MB)».
 *
 * Sem número nenhum, dez segundos e sessenta são a mesma coisa — uma barra a
 * rodar — e não há como distinguir «está a demorar» de «isto encravou». Com
 * número, ela decide se espera.
 *
 * O aviso do anexo é o mais valioso dos dois, porque a alternativa é descobrir
 * pelo casal: o servidor de email do cliente recusa a mensagem, e do lado dela
 * o envio parece ter corrido bem. A sugestão é a que resolve mesmo — menos
 * fotografias nas páginas mais pesadas — e diz-se também o que NÃO se perde: o
 * link da proposta serve na mesma, com o PDF inteiro do outro lado.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * SÓ PARA SI — QUANTO É QUE ISTO DEIXA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Falta o número que permite decidir com noção» — dentro do
 * bloco dos totais.
 *
 * A margem já era calculada: os custos escrevem-se por linha no painel interno,
 * e ele mostra a conta. O que faltava era ela estar ONDE A DECISÃO SE TOMA. O
 * bloco dos totais é o ecrã que se olha ao decidir se se baixa o preço, e era o
 * único sítio onde o número que responde a isso não estava.
 *
 * ── PARCIAL DIZ-SE PARCIAL ────────────────────────────────────────────────
 * Com custos em três linhas de dez, a conta é sobre essas três — e é declarada
 * como tal. Uma margem calculada sobre metade dos custos, apresentada como «a
 * margem», seria uma mentira sempre optimista, e das que só se descobrem no
 * fim do ano.
 *
 * ── E NUNCA SAI DAQUI ─────────────────────────────────────────────────────
 * Os custos vivem em `budgetCosts`, que o desenhador do PDF não lê — com um
 * teste em `proposal-doc-pdf.test.ts` a comparar as instruções de desenho com e
 * sem custos para garantir que continua assim.
 */
function MargemDoNegocio({ doc }: { doc: ProposalDoc }) {
  const limite = useDefinicoesDaProposta().margemMinima;
  const total = useMemo(() => margemTotal(doc), [doc]);
  // Sem uma única linha com preço E custo não há nada a dizer — e dizer «sem
  // margem» seria dizer que é zero, que é outra coisa.
  if (!total) return null;
  const magra = total.percentagem < limite;

  return (
    <div className="mt-3 border-t border-foreground/[0.08] pt-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="bo-eyebrow">Só para si</span>
        <span className="text-xs text-foreground/70">
          Margem{" "}
          <strong className={`font-semibold ${magra ? "text-[#b5654a]" : "text-[#4d6350]"}`}>
            {eur(total.margem)} · {Math.round(total.percentagem)}%
          </strong>
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-foreground/45">
        {total.parcial
          ? `Sobre as ${total.linhasComCusto} de ${total.linhasTotais} linhas que já têm custo (${eur(total.custo)} de custos em ${eur(total.precoComparavel)} cobrados).`
          : `${eur(total.custo)} de custos em ${eur(total.precoComparavel)} cobrados.`}{" "}
        Não sai no PDF nem em nada que vá para o cliente.
      </p>
      {magra && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-[#c98a2e]/35 bg-[#c98a2e]/[0.06] px-3 py-2 text-[11px] leading-relaxed text-foreground/70">
          <span aria-hidden="true">⚠</span>
          <span>
            Abaixo dos {limite}% que definiu
            {total.parcial ? " — e ainda faltam custos, portanto pode ser menos" : ""}. Não impede
            nada; é para se saber antes de enviar.
          </span>
        </p>
      )}
    </div>
  );
}

function CustoDaGeracao({
  fotos,
  capas,
  amostras,
}: {
  fotos: number;
  /** As tiras da capa — contam à parte porque custam seis vezes mais do que
   *  uma célula de mood board (medido: 590 ms contra 90). */
  capas: number;
  amostras: AmostraDeGeracao[];
}) {
  if (fotos === 0) return null;
  const ms = tempoEstimado(fotos, amostras);
  const bytes = tamanhoEstimado(fotos, amostras);
  const pesado = passaDoAnexo(bytes);
  /**
   * ── E O TECTO DA ROTA, QUE É OUTRA COISA ────────────────────────────────
   *
   * O tempo acima é o que ELA espera, medido daqui. Este é o que o SERVIDOR
   * gasta — e o servidor tem um tecto que ela não tem como saber: as rotas que
   * redesenham o documento para o casal morrem aos 20 segundos. Não é a mesma
   * conta nem a mesma pergunta, e por isso não se mistura com a frase de cima:
   * uma diz «vais esperar isto», a outra diz «isto está a chegar ao limite».
   */
  const orcamento = orcamentoDeTempo(fotos, capas);
  // Com medições, diz-se que são medições — «cerca de» com uma amostra atrás é
  // outra coisa do que «cerca de» com um modelo por omissão.
  const medido = amostras.length >= 2;

  return (
    <div className="mt-3">
      <p className="text-xs leading-relaxed text-foreground/50">
        Gerar este PDF demora {tempoEmPalavras(ms)} e dá um ficheiro de {tamanhoEmPalavras(bytes)}
        {medido ? ", pelas últimas gerações neste computador" : ""}.
      </p>
      {pesado && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-[#c98a2e]/35 bg-[#c98a2e]/[0.06] px-3 py-2 text-xs leading-relaxed text-foreground/70">
          <span aria-hidden="true">⚠</span>
          <span>
            Um anexo deste tamanho pode ser recusado pelo servidor de email do cliente — muitos
            param nos 8 MB, e o anexo viaja ~33% maior do que o ficheiro. Tira algumas fotografias
            das páginas mais cheias. O link da proposta continua a servir na mesma, com o PDF
            inteiro do outro lado.
          </span>
        </p>
      )}
      {orcamento.aperta && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-[#c98a2e]/35 bg-[#c98a2e]/[0.06] px-3 py-2 text-xs leading-relaxed text-foreground/70">
          <span aria-hidden="true">⚠</span>
          <span>
            Com esta quantidade de fotografias, o servidor demora{" "}
            {tempoEmPalavras(orcamento.msOptimista)} a {tempoEmPalavras(orcamento.msPessimista)} a
            desenhar o documento — e a página onde o casal o abre desiste aos 20 segundos. O PDF do
            envio sai na mesma (tem mais tempo); quem pode ficar sem ele é o casal, ao carregar no
            link. Tira algumas fotografias das páginas mais cheias.
          </span>
        </p>
      )}
    </div>
  );
}

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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANDO NÃO É A FOTOGRAFIA — É O SÍTIO QUE NÃO A DEIXA APARECER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma célula que não desenha nada podia ser três coisas (ver os «três estados»
 * mais abaixo); afinal são quatro, e a quarta é de outra natureza.
 *
 * A `Content-Security-Policy` deste sítio traz uma directiva `img-src`, e ela
 * nomeia de onde é que uma imagem pode vir. Quando a origem do Storage não está
 * na lista, o browser RECUSA a fotografia — e recusa-a antes de a pedir. Não há
 * pedido, não há código de estado, não há linha no painel de rede e não há nada
 * para o servidor registar: do lado do JavaScript o único sinal é o `onerror`
 * do `<img>`, exactamente igual ao de um 404. Foi assim que uma proposta com as
 * fotografias todas guardadas e a sair bem no PDF apareceu no telemóvel dela
 * com nove células a dizer «Não consegui mostrá-la neste ecrã».
 *
 * As duas avarias têm donos e remédios OPOSTOS — uma resolve-se com um botão de
 * tentar outra vez, a outra nunca, por mais vezes que se carregue — e por isso
 * não podem dizer a mesma frase. Um «Tentar novamente» que vai falhar sempre da
 * mesma maneira é uma promessa vazia, e é pior do que não haver botão nenhum.
 *
 * ── COMO É QUE SE SABE ────────────────────────────────────────────────────
 * O browser diz, e ninguém o ouvia: `document.addEventListener(
 * "securitypolicyviolation", …)`. MEDIDO no Chromium, com `img-src 'self'
 * data:` e duas imagens de outra origem: dois eventos, `violatedDirective` e
 * `effectiveDirective` os dois `"img-src"`, e o `blockedURI` INTEIRO — caminho
 * e token incluídos.
 *
 * ── E CASA-SE POR ORIGEM, NÃO POR URL ─────────────────────────────────────
 * Porque o `blockedURI` inteiro é o caso do Chromium, e não a regra: a norma
 * deixa o browser entregá-lo cortado à origem (é o que o WebKit faz em vários
 * casos, e o telemóvel dela é um iPhone). Casar por URL completo funcionaria na
 * máquina onde isto se mediu e falhava calado onde interessa. A origem é o que
 * os dois formatos têm em comum, e chega: quem recusa uma fotografia do Storage
 * recusa-as todas.
 *
 * E se nem a origem der para ler (um `blockedURI` vazio, ou o literal
 * `"self"`), fica a marca sem morada — e aí é o ECRÃ inteiro que passa a dizer
 * isto, em vez de uma célula. Uma célula morta ao mesmo tempo que o browser
 * anuncia uma recusa de `img-src` é a mesma avaria com altíssima probabilidade;
 * calar-se seria voltar à frase errada, que é o defeito que isto veio corrigir.
 *
 * Vive fora do React, como a fila das imagens e pela mesma razão: o evento é do
 * documento, é um só, e um ouvinte por célula numa grelha de vinte e quatro
 * eram vinte e quatro ouvintes para a mesma notícia.
 */
const origensRecusadasPelaPolitica = new Set<string>();
/** Houve uma recusa de `img-src` que não deu para atribuir a uma origem. */
let houveRecusaSemMorada = false;
const ouvintesDaRecusa = new Set<() => void>();
let escutaDaPoliticaLigada = false;

function origemDe(url: string | undefined): string {
  if (!url || typeof window === "undefined") return "";
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return "";
  }
}

function ligarEscutaDaPolitica(): void {
  if (escutaDaPoliticaLigada || typeof document === "undefined") return;
  escutaDaPoliticaLigada = true;
  document.addEventListener("securitypolicyviolation", (e) => {
    // `effectiveDirective` é o nome moderno e `violatedDirective` o antigo; os
    // browsers não concordam sobre qual preenchem, e um deles pode vir com a
    // lista de origens colada («img-src 'self' data:»). Daí o `startsWith`.
    const directiva = e.effectiveDirective || e.violatedDirective || "";
    if (!directiva.startsWith("img-src")) return;
    const origem = origemDe(e.blockedURI);
    if (origem && origem !== window.location.origin) origensRecusadasPelaPolitica.add(origem);
    else houveRecusaSemMorada = true;
    for (const avisar of ouvintesDaRecusa) avisar();
  });
}

function subscreverRecusa(avisar: () => void): () => void {
  ligarEscutaDaPolitica();
  ouvintesDaRecusa.add(avisar);
  return () => {
    ouvintesDaRecusa.delete(avisar);
  };
}

/** Esta fotografia foi recusada pelas regras do próprio sítio? */
function useRecusaDaPolitica(url?: string): boolean {
  const ler = useCallback(
    () => houveRecusaSemMorada || origensRecusadasPelaPolitica.has(origemDe(url)),
    [url],
  );
  // No servidor não há política nem recusa nenhuma — e não pode haver desencontro
  // de hidratação por causa disto.
  return useSyncExternalStore(subscreverRecusa, ler, () => false);
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
  estadoDosUrls = "pronto",
  aoTentarDeNovo,
  aoMorrer,
  priority = false,
  // `refDoc` e não `ref`: o React trata `ref` como prop especial, e uma string
  // ali dentro é o padrão antigo das string refs, que ele recusa.
  refDoc,
}: {
  url?: string;
  /** O ORIGINAL, para quando a miniatura não existir. Ver `assetOriginais`. */
  planoB?: string;
  /** Em que pé está a leitura dos URL — ver `estadoDosUrls` no estúdio. */
  estadoDosUrls?: EstadoDosUrls;
  /** Ir buscar os URL outra vez, a pedido dela. */
  aoTentarDeNovo?: () => void;
  /**
   * Este URL não abre — dito ao estúdio, para a hidratação seguinte deixar de
   * o preferir ao fresco. Ver `urlsMortos`.
   */
  aoMorrer?: (url: string) => void;
  /** Está na primeira dobra: não espera pela fila nem pelo `lazy`. */
  priority?: boolean;
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
  /**
   * Não foi a fotografia: foi este sítio que a recusou. Ver a escuta acima.
   *
   * Perguntado com `planoB ?? url` e ANTES da cascata, de propósito: a resposta
   * é por ORIGEM, e as duas moradas desta foto têm a mesma — portanto sabe-se
   * já, sem esperar pelo `ultimoAlvo`, e a cascata pode receber a resposta em
   * vez de gastar uma volta a descobrir o que já se sabia.
   */
  const recusadaPeloSitio = useRecusaDaPolitica(planoB ?? url);
  const {
    alvo,
    desistiu: failed,
    aoFalhar,
    tentarDeNovo,
    ultimoAlvo,
  } = useFotoComPlanoB(url, planoB, recusadaPeloSitio);

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

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A CÉLULA QUE PUXA O ORIGINAL ESPERA PELA VEZ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * «Pesada» é `alvo === planoB`, e é literalmente isso: o URL que esta célula
   * está prestes a pedir É o do original. Acontece nos dois casos que importam
   * — a foto não tem derivada leve nenhuma, ou a que tinha falhou e a cascata
   * caiu para o original (`useFotoComPlanoB`). É o caso caro: medido no estúdio
   * a 1,6 Mbps com 24 células, cada original pesa **1099 KB** (26,4 MB nas 24),
   * a primeira fotografia chega aos **34,0 s** e a grelha que está no ecrã só
   * fica completa aos **67,6 s** — porque as vinte e quatro repartem o mesmo
   * canal e acabam todas no fim. Com a fila: 13,3 MB e 49,4 s.
   *
   * A fila (`fila-de-imagens`) deixa passar três de cada vez, pela ordem da
   * grelha. É o mesmo desenho que a Biblioteca de Temas já usa, e é lá que está
   * medido o que ele vale: a primeira foto passou de 26 s para 1,4 s.
   *
   * ── A PRIORIDADE NÃO FURA A FILA ──────────────────────────────────────────
   * A primeira versão deixava as células da primeira dobra passar à frente sem
   * pedir vez. MEDIDO: quatro prioritárias mais três da fila são sete originais
   * em voo, e a grelha do ecrã ficou completa aos **56,5 s** contra os 49,4 s
   * do tecto de três. Com sete a repartir o canal, cada uma continua a esperar
   * pelas outras seis.
   *
   * A ordem da fila JÁ é a ordem da grelha (as células pedem vez pela ordem em
   * que montam), portanto as de cima são servidas primeiro sem precisarem de
   * excepção. O que a prioridade faz é o que deve fazer: `eager` e
   * `fetchPriority="high"`, para o navegador não as adiar nem as despriorizar.
   * É também o que a Biblioteca de Temas faz, e é lá que está medido o que
   * vale — a primeira foto passou de 26 s para 1,4 s.
   */
  const pesada = alvo != null && alvo === planoB;
  /**
   * A vez, uma vez por célula e para sempre.
   *
   * Não volta a `false` quando o URL é reassinado, e é deliberado: mandar de
   * volta para a fila uma célula que JÁ tem fotografia no ecrã apagava-a — e
   * uma foto que desaparece para voltar igual é exactamente o salto que este
   * ecrã não pode ter (ver `useSrcSemPiscar`). O custo é um download a mais no
   * momento raro em que as assinaturas se renovam.
   */
  const [temVez, setTemVez] = useState(false);
  /**
   * O mesmo, numa referência, para o efeito o poder ler sem o ter nas
   * dependências — tê-lo lá faria a própria concessão da vez desmontar o
   * efeito e largá-la no instante seguinte.
   */
  const temVezRef = useRef(false);
  /** A fotografia já está no ecrã — é o que apaga o esqueleto por cima. */
  const [pintada, setPintada] = useState(false);
  const largarVez = useRef<(() => void) | null>(null);
  useEffect(() => {
    /**
     * ── UM LUGAR NA FILA POR CÉLULA, E SÓ ENQUANTO SERVE PARA ALGUMA COISA ──
     *
     * `temVez` não volta a `false` depois do primeiro arranque (é deliberado —
     * ver acima), e portanto o `src` desta célula JÁ é o alvo e o download já
     * começou. Uma célula que volte aqui — porque o URL foi reassinado, porque
     * a cascata caiu para o original, porque ela carregou em «Tentar
     * novamente» — pedia na mesma vez, e ficava com um dos TRÊS lugares sem
     * precisar dele: o download dela já ia a caminho, e o lugar só se largava
     * ao fim de `ESPERA_MAXIMA_MS` (30 s).
     *
     * Numa grelha onde as fotos falham em cadeia é o pior momento possível
     * para isso: as três vagas ficam com células que não estão à espera de
     * nada, e as que ainda não têm um único pixel no ecrã esperam meio minuto
     * por uma vaga que já não é vaga nenhuma. A fila existe para reger quem
     * ainda não começou.
     */
    if (!pesada || temVezRef.current) return;
    let temporizador = 0;
    const largar = pedirVezDeImagemPesada(() => {
      temVezRef.current = true;
      setTemVez(true);
      // Rede de segurança: um pedido que nunca termina não pode ficar com a vez
      // para sempre.
      temporizador = window.setTimeout(() => largarVez.current?.(), ESPERA_MAXIMA_MS);
    });
    largarVez.current = () => {
      window.clearTimeout(temporizador);
      largar();
    };
    return () => {
      largarVez.current?.();
      largarVez.current = null;
    };
    // `alvo` nas dependências para uma foto reassinada voltar a pedir vez em
    // vez de ficar com um URL que o Storage já recusa.
  }, [pesada, alvo]);
  const largarAVez = () => {
    largarVez.current?.();
    largarVez.current = null;
  };
  /**
   * O URL EFECTIVO — e é aqui que a fila vale alguma coisa.
   *
   * Uma célula à espera de vez fica sem URL nenhum. Não basta não desenhar a
   * imagem: o `useSrcSemPiscar` PRÉ-CARREGA o que lhe passarem (`new Image()`),
   * e passar-lhe o alvo enquanto ela espera era começar o download que a fila
   * está ali para adiar — a fila ficava a contar vezes e o canal continuava
   * repartido pelas vinte e quatro.
   */
  const src = useSrcSemPiscar(pesada && !temVez ? undefined : alvo);

  // O registo sai UMA vez por célula que desiste, com o caminho e o código de
  // estado — que é o que nem ela nem eu tínhamos quando isto apareceu.
  useEffect(() => {
    if (semRemedio && ultimoAlvo) {
      void relatarFalhaDeImagem({ onde, ref: refDoc, url: ultimoAlvo });
      // E fica sabido AQUI dentro também: sem isto, a leitura seguinte da
      // lista devolvia URLs frescos e o mapa continuava a preferir este, que
      // acabou de dar erro. Ver `urlsMortos` no estúdio.
      //
      // MENOS quando quem recusou foi o sítio: aí o URL está impecável e
      // marcá-lo como morto fazia a hidratação seguinte deitar fora
      // assinaturas boas — trinta downloads a mais para corrigir um problema
      // que não é do endereço.
      if (!recusadaPeloSitio) {
        aoMorrer?.(ultimoAlvo);
        if (url && url !== ultimoAlvo) aoMorrer?.(url);
      }
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
    // E JÁ ESTÁ PINTADA. Uma imagem servida da cache pode chegar completa antes
    // de o `onLoad` ter a quem tocar — e sem isto o esqueleto por cima ficava
    // lá para sempre, sobre uma fotografia que está a ser desenhada por baixo.
    if (w > 0) setPintada(true);
  }, []);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS TRÊS ESTADOS DE UMA CÉLULA SEM FOTOGRAFIA, QUE ERAM UM SÓ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Tudo o que não fosse uma imagem pintada dava a MESMA caixa cinzenta com a
   * palavra «Imagem». As capturas dela mostram exactamente isso — e essa caixa
   * pode querer dizer três coisas com três respostas diferentes:
   *
   *   · a caminho     → esperar (medido: a primeira foto sem miniatura demorou
   *                     34,0 s em 4G, e a grelha do ecrã 67,6 s);
   *   · não veio      → tentar outra vez a leitura da lista;
   *   · não abre      → tentar outra vez ESTA foto, ou abri-la à parte.
   *
   * Uma caixa parada com «Imagem» é indistinguível de uma que falhou, e foi
   * isso que fez a dona do negócio concluir que não conseguia ver as
   * fotografias — quando, em parte, o que se passava era estarem a caminho.
   */
  /**
   * Não há URL, e a leitura da lista JÁ ACABOU — portanto não vem mais nenhum.
   *
   * Duas maneiras de aqui chegar, e as duas davam a mesma caixa cinzenta com a
   * palavra «Imagem»: a leitura falhou (rede, sessão caducada, Storage em
   * baixo), ou a leitura correu e esta fotografia não veio na lista. A segunda
   * é a mais traiçoeira — o `listProposalImages` devolve `[]` em vez de atirar
   * quando não alcança o bucket, e uma grelha inteira sem uma única fotografia
   * lia-se como «as fotos desapareceram».
   */
  const semUrlEFalhou = !alvo && estadoDosUrls !== "a-caminho";
  const desenhaImagem = Boolean(src) && !semRemedio;
  const aCarregar = !pintada && !semRemedio && !semUrlEFalhou;

  return (
    <div
      // `aria-busy` e não só a opacidade: quem não vê a célula esbatida tem de
      // saber na mesma que esta foto ainda está a entrar (a pastilha «X a
      // caminho» diz o total, isto diz QUAL).
      //
      // SÓ o `pendente`, e é deliberado: aqui `aria-busy` quer dizer «esta foto
      // ainda não está na proposta», que é um estado do NEGÓCIO. Juntar-lhe «os
      // bytes ainda vêm a caminho» dava o mesmo sinal a duas coisas com
      // consequências opostas — uma impede o envio, a outra passa sozinha — e
      // os testes que lêem este atributo para contar fotos por confirmar
      // passariam a contar fotos que já lá estão. Quem diz que a fotografia vem
      // a caminho é o esqueleto, que é visível e não precisa de ser lido.
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
      {desenhaImagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          // A forma desta fotografia sai desta imagem, que já cá está e já foi
          // descodificada — ver `onMedida`.
          ref={medir}
          onLoad={(e) => {
            largarAVez();
            setPintada(true);
            medir(e.currentTarget);
          }}
          // As PESADAS são geridas pela fila; pô-las também em `lazy` fazia uma
          // célula fora do ecrã ficar com a vez sem chegar a pedir nada. As
          // leves (a miniatura, ~20 KB) continuam em `lazy`, que é o que impede
          // as fotos dos boards lá de baixo de disputarem o canal com as que
          // estão à vista. E a primeira dobra não espera por nenhum dos dois.
          loading={pesada || priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className="h-full w-full object-cover"
          onError={(e) => {
            largarAVez();
            aoFalhar();
            void e;
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-1 text-center text-[9px] leading-tight text-foreground/40">
          {semRemedio && recusadaPeloSitio ? (
            /* ── NÃO É A FOTOGRAFIA: É O SÍTIO ──────────────────────────────
               Sem botão de tentar outra vez, e é a diferença que interessa: a
               recusa não muda por se insistir. O «Abrir ficheiro» fica, e
               funciona — abrir o endereço noutro separador é uma navegação, e
               as regras que barram uma imagem DENTRO desta página não têm nada
               a dizer sobre isso.

               A frase não diz «política», nem «directiva», nem o nome da
               regra: quem lê isto quer saber se a fotografia se perdeu (não se
               perdeu) e se o problema é dela (não é). O resto está escrito no
               `title` e, por extenso, no comentário da escuta lá em cima. */
            <>
              <span className="font-medium text-foreground/55">Fotografia guardada</span>
              {/* Curta porque tem de CABER: a caixa tem 104 px de altura e
                  `overflow-hidden`, e a frase inteira levava o «Abrir ficheiro»
                  para fora do corte. A explicação toda vai no `title` — é a
                  mesma decisão, e a mesma medição, do ramo «não veio na lista». */}
              <span title="A fotografia está guardada e inteira — sai bem no PDF. Quem a recusou aqui foi este site, por uma definição dele. Insistir dá sempre o mesmo.">
                O site não a deixa aparecer.
              </span>
              {ultimoAlvo && (
                <a
                  href={ultimoAlvo}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 underline underline-offset-2 text-foreground/60 hover:text-foreground/80"
                >
                  Abrir ficheiro
                </a>
              )}
            </>
          ) : semRemedio ? (
            <>
              {/* ── E TEM DE CABER NA CAIXA ────────────────────────────────
                  MEDIDO a 390 px, numa célula de 89 × 104 px: a etiqueta, a
                  frase, o botão e o link somavam 128 px de conteúdo e a caixa
                  tem `overflow-hidden` — 24 px cortados em baixo, e o que
                  ficava de fora era o «Abrir ficheiro». A última saída de uma
                  célula morta estava a ser cortada pela explicação de por que
                  é que ela morreu.

                  A frase passa para o `title`, exactamente como no ramo «não
                  veio na lista», que já tinha aprendido isto à sua custa: numa
                  caixa desta altura, cada linha custa uma coisa que já lá
                  estava. */}
              <span
                className="font-medium text-foreground/55"
                title="A fotografia está guardada. Não consegui mostrá-la neste ecrã."
              >
                Imagem guardada
              </span>
              <span className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                {/* ── E TENTA MESMO ALGUMA COISA DIFERENTE ──────────────────
                    MEDIDO com a rede a devolver 503: o botão antigo repetia,
                    ao byte, os dois URL que acabavam de falhar — nenhum
                    pedido novo com um endereço novo. Contra a causa mais
                    provável de uma grelha inteira morta — assinaturas que já
                    não servem — isso é um botão que não pode funcionar.

                    Agora são as duas coisas, por esta ordem: pedir ao
                    servidor a lista outra vez (URLs frescos, e a memória dos
                    mortos garante que o mapa os aceita) e recomeçar a cascata
                    desta célula. */}
                <button
                  type="button"
                  onClick={() => {
                    aoTentarDeNovo?.();
                    tentarDeNovo();
                  }}
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
          ) : semUrlEFalhou ? (
            /* ── NÃO HÁ URL, E NÃO VAI HAVER ────────────────────────────────
               Este é o ramo que ela viu — só que dizia «Imagem» e mais nada. A
               fotografia está guardada; o que falhou foi a leitura da lista.
               Dizê-lo, e dar um botão, é a diferença entre um ecrã avariado e
               um ecrã que explica.

               ── PORQUE É QUE A FRASE É TÃO CURTA ────────────────────────────
               MEDIDO a 375 px: uma célula de um mood board com oito fotos tem
               ~110×75 px, e a caixa tem `overflow-hidden`. A primeira versão
               dizia «Não consegui ir buscar as fotografias desta proposta.» —
               quatro linhas a 9 px mais o botão, e o que se via na captura era
               «as fotografias desta», com a primeira linha E o botão cortados.
               Uma explicação que não cabe não é uma explicação: é a mesma caixa
               cinzenta com outras palavras.

               Cabe uma etiqueta e o botão. A frase inteira vai no `title` e no
               `aria-label` do botão — que é onde ainda serve para alguma coisa
               (leitor de ecrã, rato) sem roubar o espaço a quem só precisa de
               saber que ISTO FALHOU e onde carregar. */
            <>
              {/* Sem ícone: MEDIDO, o ⚠ ocupava a linha que faltava ao botão e
                  a captura mostrava o «Tentar» encostado ao corte de baixo. Numa
                  caixa de 75 px, cada linha custa uma coisa que já lá estava. */}
              <span
                className="font-medium text-foreground/55"
                title={
                  estadoDosUrls === "falhou"
                    ? "Não consegui ir buscar as fotografias desta proposta."
                    : "Esta fotografia está no documento, mas não veio na lista que o servidor devolveu."
                }
              >
                {estadoDosUrls === "falhou" ? "Não carregou" : "Não veio na lista"}
              </span>
              {aoTentarDeNovo && (
                <button
                  type="button"
                  onClick={aoTentarDeNovo}
                  aria-label="Ir buscar outra vez as fotografias desta proposta"
                  className="mt-0.5 rounded border border-foreground/20 px-1.5 py-0.5 text-[9px] text-foreground/70 hover:bg-foreground/[0.06]"
                >
                  Tentar
                </button>
              )}
            </>
          ) : null}
        </div>
      )}
      {/* ── ENQUANTO A FOTOGRAFIA VEM ─────────────────────────────────────
          Por CIMA e em posição absoluta, e não no fluxo: pôr o esqueleto no
          lugar da imagem obrigava a célula a mudar de conteúdo no instante em
          que a foto chega, e o `src` está posto muito antes de os bytes
          chegarem — a caixa ficava cinzenta e calada durante os 34 s medidos.
          Assim há sempre alguma coisa a dizer «isto está a acontecer». */}
      {aCarregar && (
        <span
          className="bo-skeleton pointer-events-none absolute inset-0"
          aria-hidden
          data-a-carregar=""
        />
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
          /**
           * ── INVISÍVEL E TOCÁVEL AO MESMO TEMPO ────────────────────────
           *
           * Isto era `opacity-0 group-hover:opacity-100`. Num ecrã táctil não
           * há hover nenhum, portanto o botão NUNCA se via — e `opacity: 0`
           * não desliga o toque: um dedo no canto da miniatura apagava a
           * fotografia sem que nada tivesse aparecido primeiro. É o único
           * botão destrutivo do back office assim, e no telemóvel o engano nem
           * se desfaz (o Cmd+Z do estúdio não existe lá).
           *
           * O par é o da casa (`globals.css:98`), e é o mesmo que o
           * `ServicesEditor` e os `Fornecedores` já usam: à vista no dedo,
           * escondido até ao hover só onde HÁ rato.
           *
           * 20 px é menos de metade do mínimo de toque, e o `alvo-toque` (44
           * px) não serve aqui: a miniatura tem pouco mais de 100 px de largo
           * e um alvo de 44 px no canto engolia um terço dela — num botão que
           * APAGA, um alvo grande de mais é tão mau como um pequeno de mais.
           * 32 px no dedo é o meio-termo, e é o que cabe.
           */
          className="absolute top-1 right-1 flex h-5 w-5 pointer-coarse:h-8 pointer-coarse:w-8 items-center justify-center rounded-full bg-black/55 text-white text-xs leading-none opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  );
}

function UploadArea({
  label,
  progresso,
  multiple,
  compact = false,
  curto = false,
  faixa = false,
  onFiles,
}: {
  label: string;
  /**
   * O lote que está a subir, ou nada.
   *
   * Era um `busy: boolean`, e a caixa só sabia escrever «A carregar…» — em
   * cima de vinte fotografias de telemóvel numa rede de quinta, que são
   * minutos, «ocupado» e «preso» leem-se exactamente igual. A contagem já
   * existia no `handleUpload`; passa a chegar ao ecrã.
   */
  progresso?: { feito: number; total: number };
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

  /**
   * A ALTURA É A MESMA, esteja a carregar ou não.
   *
   * A caixa de espera vai EXACTAMENTE onde o «A carregar…» já vivia, e no
   * mesmo tamanho: uma faixa de 56 px que crescesse a meio de um lote
   * empurrava a grelha de fotografias para baixo debaixo do dedo dela — que é
   * a maneira mais certa de uma animação de progresso piorar o telemóvel. Por
   * isso a medida sai daqui e serve os dois estados; o que muda lá dentro é só
   * o conteúdo.
   */
  const caixa = faixa ? "h-14" : curto ? "h-24" : compact ? "aspect-square" : "aspect-[4/3]";

  if (progresso) {
    return (
      <div className={`flex w-full items-center justify-center ${caixa}`}>
        <EmCurso
          titulo={progresso.total === 1 ? "A carregar a foto…" : "A carregar as fotos…"}
          // A contagem a sério, que o `handleUpload` sempre soube e nunca disse.
          feito={progresso.feito}
          total={progresso.total}
        />
      </div>
    );
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
      className={`flex w-full items-center justify-center rounded-lg border border-dashed text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d6350]/55 ${caixa} ${
        faixa
          ? "flex-row gap-2 p-2"
          : curto
            ? "flex-col gap-1 p-2"
            : compact
              ? "flex-col gap-1 p-2"
              : "flex-col gap-1 p-3"
      } ${
        drag
          ? "border-[#4d6350]/60 bg-[#4d6350]/[0.06]"
          : "border-foreground/[0.18] bg-foreground/[0.02] hover:border-[#4d6350]/45"
      }`}
    >
      <span className="text-[9px] tracking-[0.15em] uppercase text-foreground/35">{label}</span>
      {!compact && <span className="text-[9px] text-foreground/25">arraste ou clique</span>}
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
