import { kmDeEvora } from "@/lib/geo/portugal";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A DESLOCAÇÃO, CALCULADA A PARTIR DOS QUILÓMETROS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A sede é em Évora e os casamentos são no país inteiro. O valor da deslocação
 * não é uma tabela de preços: é o custo de lá chegar, e esse depende do que a
 * carrinha gasta e de quantos quilómetros faz.
 *
 *     quilómetros × preço por quilómetro
 *
 * ── DE ONDE VEM O PREÇO POR QUILÓMETRO ─────────────────────────────────────
 * De três parcelas somadas, e é assim porque é assim que se explica ao cliente
 * quando ele pergunta:
 *
 *   • COMBUSTÍVEL — o consumo da carrinha vezes o preço do litro. É a parcela
 *     que muda sozinha: o gasóleo sobe e desce, e o número que aqui está tem
 *     de poder ser mudado num campo, não numa linha de código.
 *   • PORTAGENS — quase toda a viagem longa em Portugal é auto-estrada.
 *   • DESGASTE — pneus, revisões, o valor que a carrinha perde por andar. Não
 *     se sente no dia, paga-se na oficina.
 *
 * Deixá-las separadas é o que permite responder "porquê 92 €?" com a conta em
 * vez de com um encolher de ombros. Somadas dão um valor por quilómetro da
 * ordem do das tabelas de quilometragem, mas construído com os números dela.
 *
 * ── IDA E VOLTA ────────────────────────────────────────────────────────────
 * A carrinha vai e vem. Cobrar só a ida era pagar metade do gasóleo do bolso
 * da empresa em todos os casamentos fora de Évora — decisão dela, e é o que
 * `idaEVolta` diz.
 *
 * ── A ISENÇÃO DO DISTRITO DE ÉVORA ─────────────────────────────────────────
 * Continua a valer: é o que as condições gerais prometem por escrito, e mexer
 * nela muda o que um cliente local paga. Aqui traduz-se em quilómetros — a 40
 * km de Évora ainda se está dentro do distrito em quase todas as direções.
 *
 * ── O QUE ISTO NÃO DECIDE ──────────────────────────────────────────────────
 * O alojamento. Dormir fora depende da hora a que acaba a festa e de quando é
 * a montagem, e nenhuma dessas coisas está nos quilómetros. As condições
 * cobrem-no em texto; aqui só se assinala que, a esta distância, é provável.
 */

export interface ParametrosDeslocacao {
  /** Litros por 100 km da carrinha. */
  consumoLPor100Km: number;
  /** Euros por litro de combustível. */
  precoLitro: number;
  /** Euros de portagem por quilómetro. */
  portagensPorKm: number;
  /** Euros de desgaste por quilómetro (pneus, revisões, depreciação). */
  desgastePorKm: number;
  /** Até esta distância não se cobra deslocação (a isenção do distrito). */
  franquiaKm: number;
  /** A carrinha vai e volta? */
  idaEVolta: boolean;
}

/**
 * Os valores de partida. São UM PONTO DE PARTIDA, não uma verdade: o preço do
 * gasóleo muda todos os meses e o consumo é o da carrinha dela, que ninguém
 * mediu daqui. Ficam todos editáveis.
 */
export const PARAMETROS_OMISSAO: ParametrosDeslocacao = {
  consumoLPor100Km: 9,
  precoLitro: 1.65,
  portagensPorKm: 0.09,
  desgastePorKm: 0.1,
  franquiaKm: 40,
  idaEVolta: true,
};

/** A partir de que distância é preciso contar com dormir fora. */
export const KM_PARA_DORMIR_FORA = 200;

const cent = (n: number) => Math.round(n * 100) / 100;

/** Quanto custa cada quilómetro, parcela a parcela. */
export function custoPorKm(p: ParametrosDeslocacao): {
  combustivel: number;
  portagens: number;
  desgaste: number;
  total: number;
} {
  const combustivel = (Math.max(0, p.consumoLPor100Km) / 100) * Math.max(0, p.precoLitro);
  const portagens = Math.max(0, p.portagensPorKm);
  const desgaste = Math.max(0, p.desgastePorKm);
  return {
    combustivel: cent(combustivel),
    portagens: cent(portagens),
    desgaste: cent(desgaste),
    // O total NÃO é a soma dos três já arredondados: arredondar três vezes e
    // somar dava um cêntimo a mais ou a menos por quilómetro, que a 300 km são
    // três euros a sair do nada.
    total: cent(combustivel + portagens + desgaste),
  };
}

export interface SugestaoDeslocacao {
  /** Distância de Évora ao local, num sentido. */
  kmSoIda: number;
  /** Os quilómetros que se cobram (o dobro, com ida e volta). */
  kmCobrados: number;
  custoKm: ReturnType<typeof custoPorKm>;
  /** O valor a cobrar, em euros, arredondado ao euro. */
  valor: number;
  /** Caiu dentro da isenção — o valor é zero por regra, não por engano. */
  isento: boolean;
  /** A esta distância, é de esperar que a equipa tenha de pernoitar. */
  provavelAlojamento: boolean;
  /** A distância veio de uma região inteira e não de uma morada. */
  aproximado: boolean;
  /** A conta escrita, para aparecer ao lado do número. */
  formula: string;
}

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

/**
 * Quanto cobrar para ir a este sítio.
 *
 * `null` quando não se sabe onde é o sítio. Nesse caso NÃO se sugere zero: uma
 * proposta com deslocação a zero para um casamento no Gerês é dinheiro perdido
 * com a assinatura dela em baixo.
 */
export function sugerirDeslocacao(
  local: string | null | undefined,
  parametros: Partial<ParametrosDeslocacao> = {},
  opts: { aproximado?: boolean } = {},
): SugestaoDeslocacao | null {
  const p: ParametrosDeslocacao = { ...PARAMETROS_OMISSAO, ...parametros };
  const kmSoIda = kmDeEvora(local);
  if (kmSoIda === null) return null;

  const custoKm = custoPorKm(p);
  const isento = kmSoIda <= Math.max(0, p.franquiaKm);
  const kmCobrados = isento ? 0 : kmSoIda * (p.idaEVolta ? 2 : 1);
  const valor = Math.round(kmCobrados * custoKm.total);

  return {
    kmSoIda,
    kmCobrados,
    custoKm,
    valor,
    isento,
    provavelAlojamento: kmSoIda >= KM_PARA_DORMIR_FORA,
    aproximado: Boolean(opts.aproximado),
    formula: isento
      ? `${kmSoIda} km — dentro dos ${p.franquiaKm} km sem deslocação a cobrar`
      : `${kmSoIda} km ${p.idaEVolta ? "× 2 (ida e volta) " : ""}× ${eur(custoKm.total)}/km`,
  };
}

/** A conta por extenso, parcela a parcela — para responder a "porquê este valor?". */
export function explicarCustoKm(p: ParametrosDeslocacao = PARAMETROS_OMISSAO): string {
  const c = custoPorKm(p);
  return [
    `combustível ${eur(c.combustivel)} (${p.consumoLPor100Km} l/100 km a ${eur(p.precoLitro)}/l)`,
    `portagens ${eur(c.portagens)}`,
    `desgaste ${eur(c.desgaste)}`,
  ].join(" + ");
}

/** O texto da linha, como entra nos valores adicionais da proposta. */
export function rotuloDeslocacao(s: SugestaoDeslocacao): { label: string; valueText: string } {
  return {
    label: "Deslocação",
    valueText: `${new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(s.valor)} + IVA`,
  };
}
