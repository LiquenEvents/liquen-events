import "server-only";
import { createRepository, type Mapper } from "./repository";
import { PARAMETROS_OMISSAO, type ParametrosDeslocacao } from "./orcamento/deslocacao";
import { MARGEM_MINIMA_OMISSAO } from "./orcamento/margem";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS NÚMEROS QUE MUDAM SOZINHOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Depende também de que valor está a gasolina."
 *
 * Está, e é isso que torna um número escrito no código a coisa errada: o
 * gasóleo muda todas as semanas e o código muda quando alguém se lembra. Um
 * valor de 2026 a calcular deslocações de 2027 não dá um erro — dá um preço
 * silenciosamente errado, para menos, em todas as propostas.
 *
 * Estes números passam a viver na base de dados, com a data em que foram
 * postos. A data é metade do ponto: permite ao estúdio dizer "o preço do
 * gasóleo foi definido há quatro meses" e a decisão de o actualizar deixa de
 * depender de alguém se lembrar de que ele existe.
 *
 * ── PORQUE NÃO SE VAI BUSCAR O PREÇO A LADO NENHUM ─────────────────────────
 * Porque o preço que interessa não é o preço médio do país: é o que ela paga
 * na bomba onde abastece, com o cartão que usa. Um número da internet estaria
 * sempre a discutir com o talão dela — e daria a impressão de rigor a um valor
 * que ela não reconhece.
 *
 * ── ÚLTIMA ESCRITA GANHA ───────────────────────────────────────────────────
 * Ao contrário das notas da equipa (ver `overview-settings-store`), aqui não há
 * `revision`. São meia dúzia de números mudados por uma pessoa de poucos em
 * poucos meses; o conflito que a compare-and-set resolve — duas pessoas a
 * escrever texto ao mesmo tempo — não existe neste ecrã, e a maquinaria toda
 * seria peso sem uso.
 */

export const DEFINICOES = ["deslocacao", "margem"] as const;
export type DefinicaoId = (typeof DEFINICOES)[number];

export interface Definicao {
  id: DefinicaoId;
  /** Os valores, como objecto. A forma depende do `id`. */
  valor: Record<string, unknown>;
  updatedAt: string;
}

/** Data de uma definição que ainda nunca foi gravada — nunca "agora". */
const NUNCA = "1970-01-01T00:00:00.000Z";

export function isDefinicaoId(v: unknown): v is DefinicaoId {
  return typeof v === "string" && (DEFINICOES as readonly string[]).includes(v);
}

export const mapper: Mapper<Definicao> = {
  table: "proposal_settings",
  fileName: "proposal-settings.json",
  getId: (d) => d.id,
  toRow: (d) => ({ id: d.id, value: d.valor, updated_at: d.updatedAt }),
  fromRow: (r) => ({
    id: String(r.id) as DefinicaoId,
    valor: (r.value as Record<string, unknown>) ?? {},
    updatedAt: String(r.updated_at ?? NUNCA),
  }),
  order: { column: "id", ascending: true },
  fileCompare: (a, b) => a.id.localeCompare(b.id),
  /**
   * SEM `touch`, coerente com a decisão explicada no cabeçalho («última escrita
   * ganha»), e por uma razão mecânica além dessa: o `gravarDefinicao` escreve a
   * LINHA INTEIRA — constrói uma `Definicao` nova com o `valor` completo do
   * formulário. O compare-and-set do Repository só evita perdas quando a
   * escrita é um patch parcial sobre uma leitura velha; num substituto
   * completo, a repetição do `updateWith` reaplicaria a mesma substituição e o
   * estado final seria idêntico. Seria maquinaria a girar sem mover nada.
   *
   * (E as duas definições vivem em LINHAS separadas — `deslocacao` e `margem` —
   * por isso mudar uma nunca pisa a outra.)
   */
};

const repo = createRepository(mapper);

export const listarDefinicoes = (): Promise<Definicao[]> => repo.list();

/** Grava (ou cria) uma definição. A data é sempre a de agora. */
export async function gravarDefinicao(
  id: DefinicaoId,
  valor: Record<string, unknown>,
): Promise<Definicao> {
  const linha: Definicao = { id, valor, updatedAt: new Date().toISOString() };
  const existente = await repo.get(id);
  if (existente) {
    return (await repo.update(id, linha)) ?? linha;
  }
  await repo.create(linha);
  return linha;
}

export interface Parametros {
  deslocacao: ParametrosDeslocacao;
  /** Percentagem mínima de margem antes de o estúdio avisar. */
  margemMinima: number;
  /** Quando cada uma foi definida, para o ecrã poder dizer que está velha. */
  definidoEm: Record<DefinicaoId, string>;
}

/** Só aceita números finitos e positivos — o resto fica com o valor de partida. */
function num(v: unknown, omissao: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : omissao;
}

/**
 * Os parâmetros a usar agora: o que estiver gravado, com os valores de partida
 * a tapar os buracos.
 *
 * Nunca falha por falta de linhas: uma instalação nova calcula com os valores
 * de omissão e o ecrã diz que nunca foram confirmados.
 */
export function parametrosDe(linhas: Definicao[]): Parametros {
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const d = porId.get("deslocacao")?.valor ?? {};
  const m = porId.get("margem")?.valor ?? {};

  return {
    deslocacao: {
      consumoLPor100Km: num(d.consumoLPor100Km, PARAMETROS_OMISSAO.consumoLPor100Km),
      precoLitro: num(d.precoLitro, PARAMETROS_OMISSAO.precoLitro),
      portagensPorKm: num(d.portagensPorKm, PARAMETROS_OMISSAO.portagensPorKm),
      desgastePorKm: num(d.desgastePorKm, PARAMETROS_OMISSAO.desgastePorKm),
      franquiaKm: num(d.franquiaKm, PARAMETROS_OMISSAO.franquiaKm),
      idaEVolta: typeof d.idaEVolta === "boolean" ? d.idaEVolta : PARAMETROS_OMISSAO.idaEVolta,
    },
    margemMinima: num(m.minima, MARGEM_MINIMA_OMISSAO),
    definidoEm: {
      deslocacao: porId.get("deslocacao")?.updatedAt ?? NUNCA,
      margem: porId.get("margem")?.updatedAt ?? NUNCA,
    },
  };
}

/**
 * A partir de quantos dias é que o preço do combustível deixa de merecer
 * confiança. Seis semanas: o gasóleo em Portugal mexe todas as segundas-feiras,
 * e ao fim de mês e meio o desvio já se vê na conta de uma viagem ao Porto.
 */
export const DIAS_ATE_O_COMBUSTIVEL_ENVELHECER = 42;

/** Há quantos dias foi definido — `null` quando nunca o foi. */
export function diasDesde(iso: string, agora = new Date()): number | null {
  if (!iso || iso === NUNCA) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((agora.getTime() - t) / 86_400_000);
}

/**
 * O preço do combustível está velho (ou nunca foi confirmado)?
 *
 * Nunca-confirmado conta como velho de propósito: os valores de partida são um
 * palpite escrito por quem não abastece a carrinha.
 */
export function combustivelDesactualizado(p: Parametros, agora = new Date()): boolean {
  const dias = diasDesde(p.definidoEm.deslocacao, agora);
  return dias === null || dias > DIAS_ATE_O_COMBUSTIVEL_ENVELHECER;
}
