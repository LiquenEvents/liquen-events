import { kmDeEvora } from "@/lib/geo/portugal";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A DESLOCAÇÃO, CALCULADA A PARTIR DO SÍTIO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A sede é em Évora e os casamentos são no país inteiro. A cláusula das
 * condições já dizia que a deslocação se cobra pelos quilómetros; o valor,
 * esse, era escrito à mão de cada vez — e escrito à mão de cada vez quer dizer
 * escrito de maneira diferente de cada vez.
 *
 * ── ESCALÕES, NÃO UMA FÓRMULA POR QUILÓMETRO ───────────────────────────────
 * Porque é assim que ela cobra e é assim que se explica ao telefone. Palmela e
 * Alenquer não custam o mesmo, mas Palmela e Setúbal custam — e um preço ao
 * quilómetro obrigava a justificar por que é que dois sítios da mesma zona
 * levam valores diferentes.
 *
 * ── O QUE ISTO NÃO DECIDE ──────────────────────────────────────────────────
 * O alojamento. Dormir fora depende da hora a que acaba a festa e de quando é
 * a montagem, e nenhuma dessas coisas está nos quilómetros. A cláusula das
 * condições cobre-o em texto; aqui só se assinala que, a esta distância, é
 * provável — para ela decidir.
 */

export interface Escalao {
  /** Até quantos quilómetros (inclusive) este escalão se aplica. */
  ateKm: number;
  /** Euros a cobrar. Zero é um valor legítimo — é a isenção. */
  valor: number;
}

/**
 * Os escalões por omissão, até ela definir os dela.
 *
 * O primeiro é a isenção do distrito de Évora, que já existia na cláusula das
 * condições — e que aqui se traduz em quilómetros, porque é o que temos: a 40
 * km de Évora ainda se está dentro do distrito em praticamente todas as
 * direções.
 */
export const ESCALOES_OMISSAO: Escalao[] = [
  { ateKm: 40, valor: 0 },
  { ateKm: 80, valor: 90 },
  { ateKm: 120, valor: 150 },
  { ateKm: 180, valor: 220 },
  { ateKm: 250, valor: 300 },
  { ateKm: 350, valor: 420 },
  { ateKm: Number.POSITIVE_INFINITY, valor: 700 },
];

/**
 * Porque é que os escalões são estreitos perto de casa e largos longe.
 *
 * A frase dela foi "Palmela, Alenquer e Évora implicam custos diferentes". Com
 * escalões de cem em cem quilómetros isso não acontecia: Palmela (≈110 km) e
 * Alenquer (≈135 km) caíam os dois no mesmo degrau, e a lista mentia à regra
 * que a criou. Perto de Évora é onde está a maior parte do trabalho e onde as
 * diferenças de uma hora de estrada se sentem; a 400 km ou a 500 km a decisão
 * já é a mesma — leva-se a equipa e dorme-se lá.
 *
 * São um PONTO DE PARTIDA. Os valores são dela para mudar.
 */

/** A partir de que distância é preciso contar com dormir fora. */
export const KM_PARA_DORMIR_FORA = 200;

export interface SugestaoDeslocacao {
  km: number;
  valor: number;
  /** O escalão que se aplicou, para se poder mostrar de onde vem o número. */
  escalao: Escalao;
  /** A esta distância, é de esperar que a equipa tenha de pernoitar. */
  provavelAlojamento: boolean;
  /** A distância veio de uma região inteira e não de uma morada. */
  aproximado: boolean;
}

/** Ordena e sanea os escalões: sem isto, uma lista mal ordenada dava o valor errado. */
export function escaloesValidos(escaloes: Escalao[]): Escalao[] {
  return [...escaloes]
    .filter((e) => Number.isFinite(e.valor) && e.valor >= 0 && e.ateKm > 0)
    .sort((a, b) => a.ateKm - b.ateKm);
}

/**
 * Quanto cobrar para ir a este sítio.
 *
 * `null` quando não se sabe onde é o sítio. Nesse caso NÃO se sugere zero: uma
 * proposta com deslocação a zero para um casamento no Gerês é dinheiro perdido
 * com a assinatura dela em baixo.
 */
export function sugerirDeslocacao(
  local: string | null | undefined,
  escaloes: Escalao[] = ESCALOES_OMISSAO,
  opts: { aproximado?: boolean } = {},
): SugestaoDeslocacao | null {
  const km = kmDeEvora(local);
  if (km === null) return null;

  const lista = escaloesValidos(escaloes);
  if (lista.length === 0) return null;

  // O primeiro escalão que cobre esta distância; se nenhum cobrir (uma lista
  // sem tecto), fica o último — que é o mais caro, e o lado seguro do erro.
  const escalao = lista.find((e) => km <= e.ateKm) ?? lista[lista.length - 1];

  return {
    km,
    valor: escalao.valor,
    escalao,
    provavelAlojamento: km >= KM_PARA_DORMIR_FORA,
    aproximado: Boolean(opts.aproximado),
  };
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
