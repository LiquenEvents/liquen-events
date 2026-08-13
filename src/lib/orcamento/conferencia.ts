import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "./types";
import { foraDoPadrao, padraoPara } from "./padrao-de-preco";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CONFERÊNCIA ANTES DE ENVIAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Um erro no nome numa proposta de casamento custa credibilidade, e custa-a
 * inteira: quem recebe uma proposta com o nome mal escrito conclui, e conclui
 * bem, que aquilo foi feito à pressa. O envio é irreversível — o email sai uma
 * vez — por isso a última coisa antes do botão é uma passagem de olhos feita
 * pelo programa sobre o que ele consegue mesmo verificar.
 *
 * ── O QUE ISTO É E O QUE NÃO É ─────────────────────────────────────────────
 * Não é um corretor ortográfico nem um juiz de preços. É uma comparação entre
 * a PROPOSTA e o PEDIDO que lhe deu origem — dois documentos que deviam dizer
 * o mesmo e que se escrevem em momentos diferentes, que é exactamente quando
 * as coisas divergem.
 *
 * ── NADA AQUI TRAVA O ENVIO ────────────────────────────────────────────────
 * O que trava está em `proposal-progress.ts` e continua lá. Isto é a passagem
 * de olhos: mostra-se, lê-se, e decide-se. Uma data diferente da do pedido
 * pode ser a data certa — o casal mudou de ideias e disse-o ao telefone.
 */

export type Severidade = "erro" | "aviso" | "ok";

export interface Verificacao {
  id: string;
  titulo: string;
  severidade: Severidade;
  /** O que dizer quando não está bem. Vazio quando está. */
  detalhe: string;
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const semAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Compara nomes ignorando acentos, maiúsculas e espaços a mais. */
function mesmoNome(a: string, b: string): boolean {
  const n = (s: string) => semAcentos(s).replace(/\s+/g, " ").trim();
  return n(a) === n(b);
}

/** Os meses como aparecem escritos numa proposta, já sem acentos. */
const MESES = [
  "janeiro",
  "fevereiro",
  "marco",
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

/**
 * Os meses (1–12) escritos por extenso num texto livre de data.
 *
 * Devolve uma LISTA porque a data de um evento de vários dias pode nomear dois
 * ("de 30 de Setembro a 2 de Outubro"), e vazio quando não há mês legível — que
 * é o caso de "18.09.2027", de "Set." e de tudo o que ela escreva à maneira
 * dela. Vazio quer dizer "não sei", nunca "está errado".
 */
function mesesEscritos(texto: string): number[] {
  const t = semAcentos(texto);
  return MESES.map((m, i) => (t.includes(m) ? i + 1 : 0)).filter((m) => m > 0);
}

/**
 * Marcadores de MODELO — os que nunca são texto verdadeiro, escrevam-se onde
 * se escreverem. Um "[Valor Total]" que chega ao cliente diz-lhe, com todas as
 * letras, que recebeu um modelo por preencher.
 */
const MARCADORES_DE_MODELO = [
  /\[[^\]]+\]/, // [Valor Total], [Nome], [Data]
  /\bxxx+\b/i,
  /\blorem ipsum\b/i,
];

/**
 * E as frases de «ainda não sei» — que num campo normal são um esquecimento.
 *
 * Um cabeçalho, um local ou um nome de serviço a dizer "a definir" é trabalho
 * por acabar a caminho do cliente. Ver a excepção logo a seguir.
 */
const POR_SABER = [/\bpor preencher\b/i, /\ba definir\b/i];

/**
 * ── A EXCEPÇÃO DOS VALORES ADICIONAIS ─────────────────────────────────────
 * O `valueText` de um `BudgetExtra` é TEXTO LIVRE — está dito com todas as
 * letras em `proposal-budget.ts`, e é assim que aparece nas propostas
 * verdadeiras da Líquen: "896,00 €", "895,00 € + IVA", "a definir", "sob
 * consulta". Escrever «Deslocação da equipa Líquen — a definir» porque ainda
 * não se sabe onde é o evento é o comportamento certo, e a conferência
 * acendia-o a vermelho como «Ficou por substituir».
 *
 * O estrago não era o vermelho a mais: ou ela apagava um valor legítimo, ou
 * aprendia a ignorar o único aviso que existe para apanhar um "[Valor Total]"
 * a caminho do cliente. Por isso este campo — e só este — é conferido apenas
 * contra os marcadores de modelo. O RÓTULO do adicional não: o valor é que
 * fica por saber, o nome do que se cobra não.
 */
function encontrarPlaceholders(doc: ProposalDoc): string[] {
  const campos: (string | undefined)[] = [
    doc.headerTitle,
    doc.clientNames,
    doc.eventDate,
    doc.location,
    doc.totalText,
    doc.totalEstimatedText,
    doc.budgetNote,
    ...(doc.observacoesGerais ?? []),
    ...(doc.budgetItems ?? []),
    ...(doc.serviceGroups ?? []).flatMap((g) => [
      g.title,
      ...(g.items ?? []).map((i) => i.label),
      ...(g.items ?? []).map((i) => i.desc),
    ]),
    ...(doc.budgetExtras ?? []).map((e) => e.label),
  ];
  const achados: string[] = [];
  const junta = (t: string, regras: RegExp[]) => {
    if (t && regras.some((re) => re.test(t))) achados.push(t.slice(0, 60));
  };
  for (const c of campos) junta(texto(c), [...MARCADORES_DE_MODELO, ...POR_SABER]);
  for (const e of doc.budgetExtras ?? []) junta(texto(e.valueText), MARCADORES_DE_MODELO);
  return [...new Set(achados)];
}

/** O idioma que o cliente usou, deduzido do que ele escreveu no pedido. */
function idiomaDoCliente(quote: Quote): "pt" | "en" | null {
  const l = (quote as { locale?: string }).locale;
  if (typeof l === "string" && l) return l.startsWith("en") ? "en" : "pt";
  return null;
}

export interface Contexto {
  doc: ProposalDoc;
  quote: Quote;
  /** Todos os pedidos, para o padrão de preço. */
  historico: Quote[];
  /** O total bruto da proposta, como ela o vê no estúdio. */
  totalBruto: number;
}

/**
 * A lista de conferência. Devolve TODAS as verificações, incluindo as que
 * passaram — ver uma lista só com problemas não diz se as outras foram
 * sequer feitas, e é essa dúvida que faz voltar a conferir à mão.
 */
export function conferir({ doc, quote, historico, totalBruto }: Contexto): Verificacao[] {
  const v: Verificacao[] = [];

  // ── O nome ──────────────────────────────────────────────────────────────
  const naProposta = texto(doc.clientNames);
  const noPedido = texto(quote.name);
  if (!naProposta) {
    v.push({
      id: "nome",
      titulo: "Nome dos clientes",
      severidade: "erro",
      detalhe: "Está vazio na proposta.",
    });
  } else if (noPedido && !mesmoNome(naProposta, noPedido)) {
    // Não é necessariamente um erro: o pedido pode ter sido feito pela mãe da
    // noiva, e a proposta dirige-se ao casal. Mas é sempre para olhar.
    v.push({
      id: "nome",
      titulo: "Nome dos clientes",
      severidade: "aviso",
      detalhe: `A proposta diz "${naProposta}" e o pedido veio em nome de "${noPedido}".`,
    });
  } else {
    v.push({ id: "nome", titulo: "Nome dos clientes", severidade: "ok", detalhe: "" });
  }

  // ── A data ──────────────────────────────────────────────────────────────
  const dataProposta = texto(doc.eventDate);
  const dataPedido = texto(quote.date);
  if (!dataProposta) {
    v.push({
      id: "data",
      titulo: "Data do evento",
      severidade: "aviso",
      detalhe: "A proposta não tem data.",
    });
  } else if (dataPedido && /^\d{4}-\d{2}-\d{2}$/.test(dataPedido)) {
    // A data da proposta escreve-se por extenso ("12 de Setembro de 2027"), por
    // isso compara-se pelos números que lá estão: o ano e o dia.
    //
    // ── E PELO MÊS, QUE É O QUE SE TROCA ────────────────────────────────────
    // O mês é a única parte da data que se escreve por palavras, e por isso é a
    // que se troca — um pedido para 18 de Setembro com a proposta a dizer 18 de
    // Outubro batia no ano, batia no dia, e levava um visto verde a caminho do
    // cliente. Um visto verde numa data errada é pior do que não conferir nada:
    // quem lê o visto deixa de conferir.
    //
    // Só desmente quando o mês está mesmo lá escrito. O campo é texto livre e
    // ela escreve-o à maneira dela ("18.09.2027", "Set."); sem mês legível não
    // há nada a contradizer, e o dia e o ano continuam a mandar como sempre.
    const ano = dataPedido.slice(0, 4);
    const dia = String(Number(dataPedido.slice(8, 10)));
    const mes = Number(dataPedido.slice(5, 7));
    const mesesDaProposta = mesesEscritos(dataProposta);
    const bate =
      dataProposta.includes(ano) &&
      new RegExp(`\\b${dia}\\b`).test(dataProposta) &&
      (mesesDaProposta.length === 0 || mesesDaProposta.includes(mes));
    v.push({
      id: "data",
      titulo: "Data do evento",
      severidade: bate ? "ok" : "aviso",
      detalhe: bate ? "" : `A proposta diz "${dataProposta}" e o pedido pedia ${dataPedido}.`,
    });
  } else {
    v.push({ id: "data", titulo: "Data do evento", severidade: "ok", detalhe: "" });
  }

  // ── O local ─────────────────────────────────────────────────────────────
  const localProposta = texto(doc.location);
  const localPedido = texto(quote.location);
  if (!localProposta) {
    v.push({
      id: "local",
      titulo: "Local",
      severidade: "aviso",
      detalhe: "A proposta não diz onde é.",
    });
  } else if (localPedido && !mesmoNome(localProposta, localPedido)) {
    v.push({
      id: "local",
      titulo: "Local",
      severidade: "aviso",
      detalhe: `A proposta diz "${localProposta}" e o pedido dizia "${localPedido}".`,
    });
  } else {
    v.push({ id: "local", titulo: "Local", severidade: "ok", detalhe: "" });
  }

  // ── Os convidados ───────────────────────────────────────────────────────
  const temPax = texto(doc.guests) !== "";
  v.push({
    id: "convidados",
    titulo: "Número de convidados",
    severidade: temPax ? "ok" : "aviso",
    detalhe: temPax ? "" : "A proposta não diz para quantas pessoas é.",
  });

  // ── O valor ─────────────────────────────────────────────────────────────
  if (totalBruto <= 0) {
    v.push({
      id: "valor",
      titulo: "Valor",
      severidade: "erro",
      detalhe: "A proposta não tem valor.",
    });
  } else {
    const fora = foraDoPadrao(
      totalBruto,
      padraoPara({ guests: quote.guests, location: quote.location }, historico),
    );
    v.push({
      id: "valor",
      titulo: "Valor",
      severidade: fora ? "aviso" : "ok",
      detalhe: fora
        ? `${quote.guests} pax costuma ficar entre ${Math.round(fora.padrao.min)} € e ${Math.round(
            fora.padrao.max,
          )} €${fora.padrao.regiao ? ` (${fora.padrao.regiao})` : ""}; esta está ${
            fora.lado === "abaixo" ? "abaixo" : "acima"
          }.`
        : "",
    });
  }

  // ── Texto de exemplo esquecido ──────────────────────────────────────────
  const restos = encontrarPlaceholders(doc);
  v.push({
    id: "placeholders",
    titulo: "Texto de exemplo",
    severidade: restos.length > 0 ? "erro" : "ok",
    detalhe:
      restos.length > 0
        ? `Ficou por substituir: ${restos.slice(0, 3).join(" · ")}${restos.length > 3 ? "…" : ""}`
        : "",
  });

  // ── O idioma ────────────────────────────────────────────────────────────
  //
  // O estúdio escreve o documento em português — não há um interruptor de
  // idioma no PDF, e inventar aqui um seria descrever uma função que não
  // existe. O que se pode dizer, e é útil, é que o pedido veio em inglês: quem
  // escreveu em inglês vai receber uma proposta que não lê, e quem decide se
  // vale a pena reescrevê-la à mão é ela.
  //
  // Os pedidos anteriores a este campo não têm idioma nenhum guardado, e nesse
  // caso não se diz nada — que é diferente de dizer que está tudo bem.
  const idioma = idiomaDoCliente(quote);
  if (idioma) {
    v.push({
      id: "idioma",
      titulo: "Idioma",
      severidade: idioma === "en" ? "aviso" : "ok",
      detalhe:
        idioma === "en" ? "O pedido veio em inglês e a proposta é escrita em português." : "",
    });
  }

  return v;
}

/** Há alguma coisa a que valha a pena olhar antes de carregar em enviar? */
export function temReparos(vs: Verificacao[]): boolean {
  return vs.some((x) => x.severidade !== "ok");
}
