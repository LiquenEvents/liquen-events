import type { Proposal, Quote } from "./types";
import { localizar } from "@/lib/geo/portugal";
import { precosDe } from "@/lib/proposal-budget";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE JÁ COBRASTE POR ISTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O mesmo serviço saía a 800 € numa proposta e a 1.200 € na seguinte, sem que
 * nada tivesse mudado no serviço — mudou o dia em que foi escrito. E ao fim de
 * dois anos de propostas, a resposta a "quanto é que costumo levar por isto?"
 * estava lá dentro, espalhada por duzentos documentos que ninguém relê.
 *
 * ── SUGESTÃO, NUNCA IMPOSIÇÃO ──────────────────────────────────────────────
 * Isto não escreve preços. Mostra o que já foi cobrado — o intervalo, a mediana
 * e em quantas propostas — e ela decide. Um preço escrito automaticamente seria
 * a última vez que alguém pensava naquele número.
 *
 * ── COMPARÁVEL QUER DIZER ALGUMA COISA ─────────────────────────────────────
 * Um arranjo de mesa para 60 pessoas e um para 300 não são o mesmo trabalho.
 * A comparação afina-se por número de convidados e, quando há material que
 * chegue, por região — e quando não há, diz que alargou em vez de o fazer em
 * silêncio.
 */

/** Quantos casos são precisos para o número deixar de ser anedota. */
export const MINIMO_DE_CASOS = 3;

/** Quanto pode variar a dimensão do evento para ainda ser "parecido". */
export const TOLERANCIA_PAX = 0.4;

/**
 * Reduz um nome de linha à sua essência, para "Decoração da cerimónia" e
 * "decoração cerimónia" contarem como o mesmo serviço.
 *
 * Não é uma tentativa de perceber português: é tirar acentos, minúsculas,
 * pontuação e as palavras que não distinguem nada. O que sobra é grosseiro de
 * propósito — um agrupamento errado a mais custa uma sugestão estranha; um
 * agrupamento a menos custa não haver sugestão nenhuma.
 */
const VAZIAS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "a",
  "o",
  "as",
  "os",
  "para",
  "com",
  "em",
  "no",
  "na",
]);

export function chaveDoServico(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !VAZIAS.has(p))
    .sort()
    .join(" ");
}

export interface Historico {
  /** O nome tal como aparecia na proposta mais recente que o usou. */
  nome: string;
  min: number;
  max: number;
  mediana: number;
  casos: number;
  /** Afinado por região, ou nacional? */
  regiao: string | null;
  /** A última vez que este serviço foi cobrado (ISO). */
  ultimaVez: string;
}

interface Linha {
  chave: string;
  nome: string;
  preco: number;
  guests: number;
  regiao: string | null;
  quando: string;
}

function mediana(ordenados: number[]): number {
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[meio]
    : Math.round(((ordenados[meio - 1] + ordenados[meio]) / 2) * 100) / 100;
}

/**
 * Todas as linhas de orçamento já cobradas, achatadas numa lista.
 *
 * Só de propostas ENVIADAS ou aceites: um rascunho tem preços a meio de serem
 * pensados, e deixá-los entrar fazia a memória lembrar-se de números que nunca
 * foram propostos a ninguém.
 */
export function linhasCobradas(propostas: Proposal[], quotes: Quote[]): Linha[] {
  const porId = new Map(quotes.map((q) => [q.id, q]));
  const linhas: Linha[] = [];

  for (const p of propostas) {
    if (p.status === "rascunho") continue;
    const doc = p.doc;
    if (!doc?.budgetItems?.length) continue;

    const quote = porId.get(p.quoteId);
    const guests = quote?.guests ?? 0;
    const regiao = localizar(quote?.location)?.lugar.nome ?? null;
    const quando = p.sentAt ?? p.createdAt;
    const precos = precosDe(doc);

    doc.budgetItems.forEach((item, i) => {
      const nome = (item ?? "").trim();
      const preco = precos[i];
      if (!nome || preco === null || preco <= 0) return;
      linhas.push({ chave: chaveDoServico(nome), nome, preco, guests, regiao, quando });
    });
  }
  return linhas;
}

/**
 * O que já foi cobrado por um serviço, para um evento como este.
 *
 * `null` quando não há casos que cheguem — e nesse caso não se mostra nada, em
 * vez de mostrar "já cobrou 1.000 €" com base numa proposta única de 2024.
 */
export function historicoDe(
  nome: string,
  contexto: { guests?: number; location?: string | null },
  linhas: Linha[],
): Historico | null {
  const chave = chaveDoServico(nome);
  if (!chave) return null;

  const doServico = linhas.filter((l) => l.chave === chave);
  if (doServico.length === 0) return null;

  const pax = contexto.guests ?? 0;
  const semelhantes =
    pax > 0
      ? doServico.filter(
          (l) =>
            l.guests > 0 &&
            l.guests >= pax * (1 - TOLERANCIA_PAX) &&
            l.guests <= pax * (1 + TOLERANCIA_PAX),
        )
      : doServico;

  const regiaoAlvo = localizar(contexto.location)?.lugar.nome ?? null;
  const daRegiao = regiaoAlvo ? semelhantes.filter((l) => l.regiao === regiaoAlvo) : [];

  // Três degraus, do mais específico ao mais geral. Cada um só se usa se tiver
  // casos que cheguem; o último recurso é o serviço todo, sem afinar nada.
  const usar =
    daRegiao.length >= MINIMO_DE_CASOS
      ? daRegiao
      : semelhantes.length >= MINIMO_DE_CASOS
        ? semelhantes
        : doServico.length >= MINIMO_DE_CASOS
          ? doServico
          : null;
  if (!usar) return null;

  const precos = usar.map((l) => l.preco).sort((a, b) => a - b);
  const maisRecente = usar.reduce((a, b) => (a.quando > b.quando ? a : b));

  return {
    nome: maisRecente.nome,
    min: precos[0],
    max: precos[precos.length - 1],
    mediana: mediana(precos),
    casos: precos.length,
    regiao: usar === daRegiao ? regiaoAlvo : null,
    ultimaVez: maisRecente.quando,
  };
}

/**
 * O que costuma incluir em eventos parecidos e falta neste.
 *
 * A pergunta que responde é a que só se faz tarde de mais: "esqueci-me de
 * alguma coisa?". Só nomeia o que aparece na GRANDE MAIORIA das propostas
 * comparáveis — um serviço que entra em metade delas não é um esquecimento, é
 * uma escolha.
 */
export const LIMIAR_DE_HABITO = 0.8;

export interface Omissao {
  nome: string;
  /** Em quantas das propostas comparáveis apareceu, e de quantas. */
  em: number;
  de: number;
}

export function oQueCostumaIncluir(
  jaNaProposta: string[],
  contexto: { guests?: number; location?: string | null },
  propostas: Proposal[],
  quotes: Quote[],
): Omissao[] {
  const porId = new Map(quotes.map((q) => [q.id, q]));
  const pax = contexto.guests ?? 0;

  // Uma proposta comparável é uma proposta enviada, para um evento de dimensão
  // parecida. A região não entra: exigir as duas coisas deixava quase sempre
  // menos de três propostas, e o aviso nunca aparecia.
  const comparaveis = propostas.filter((p) => {
    if (p.status === "rascunho") return false;
    if (!p.doc?.budgetItems?.length) return false;
    if (pax <= 0) return true;
    const g = porId.get(p.quoteId)?.guests ?? 0;
    return g > 0 && g >= pax * (1 - TOLERANCIA_PAX) && g <= pax * (1 + TOLERANCIA_PAX);
  });
  if (comparaveis.length < MINIMO_DE_CASOS) return [];

  const presentes = new Set(jaNaProposta.map(chaveDoServico).filter(Boolean));

  const contagem = new Map<string, { nome: string; n: number }>();
  for (const p of comparaveis) {
    // Uma proposta conta UMA vez por serviço, mesmo que o repita em duas
    // linhas — senão um documento com "Flores" três vezes fazia sozinho um
    // hábito.
    const vistos = new Set<string>();
    for (const item of p.doc!.budgetItems ?? []) {
      const nome = (item ?? "").trim();
      const chave = chaveDoServico(nome);
      if (!chave || vistos.has(chave)) continue;
      vistos.add(chave);
      const actual = contagem.get(chave);
      if (actual) actual.n += 1;
      else contagem.set(chave, { nome, n: 1 });
    }
  }

  const limiar = comparaveis.length * LIMIAR_DE_HABITO;
  return [...contagem.entries()]
    .filter(([chave, v]) => !presentes.has(chave) && v.n >= limiar)
    .map(([, v]) => ({ nome: v.nome, em: v.n, de: comparaveis.length }))
    .sort((a, b) => b.em - a.em);
}
