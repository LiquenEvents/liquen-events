import { MINUTOS_POR_HORA, horasDaJanela, type JanelaDoHorario } from "./horario";
import { MESES, maisDias } from "./ano-do-calendario";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A GEOMETRIA DAS VISTAS DE DIA E DE SEMANA — fases 06 e 08
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `docs/APPLE-CALENDARIO.md` descreve as duas em duas linhas da Parte 3:
 *
 *   «**Dia** — coluna de horas das 07:00 às 24:00, 44 px por hora, linha do
 *    momento atual a `--accent` com bolinha à esquerda. Eventos sobrepostos
 *    dividem a largura.»
 *   «**Semana** — sete colunas com a mesma escala de horas; eventos de dia
 *    inteiro numa faixa fixa no topo.»
 *
 * Ou seja: a semana É a vista de dia sete vezes. Por isso a conta vive UMA vez,
 * aqui, e não desenha nada — devolve minutos e pistas, e quem desenha é que
 * decide quanto vale um minuto. É o mesmo contrato do `horario.ts`, e é dele
 * que vêm o `MINUTOS_POR_HORA` e o `horasDaJanela`: uma segunda maneira de
 * partir um dia em horas, no mesmo repositório, era a segunda família de
 * material que a Parte −1 do `docs/DESIGN-SYSTEM.md` manda não criar.
 *
 * ── PORQUE É QUE A JANELA É FIXA AQUI, E DERIVADA DOS DADOS NO `horario.ts` ─
 *
 * O `janelaDoHorario` calcula a janela a partir do que o dia tem, porque um
 * guião de evento é um bloco de horas seguidas e o que está fora dele não
 * existe. Um CALENDÁRIO é outra coisa: a coluna das horas tem de estar no
 * mesmo sítio quando se salta de terça para quarta, senão as 14:00 mudam de
 * altura entre dois dias e a vista deixa de se poder comparar com o olho. Por
 * isso 07:00–24:00, sempre, e o que cai fora encosta-se à borda (ver
 * `dentroDaJanela`).
 */

/** 07:00 — o princípio da coluna de horas. A Parte 3 do documento dá o número. */
export const INICIO_DA_JANELA = 7 * MINUTOS_POR_HORA;

/** 24:00 — o fim. Não é 00:00 do dia seguinte: é o fim DESTE. */
export const FIM_DA_JANELA = 24 * MINUTOS_POR_HORA;

export const JANELA_DO_DIA: JanelaDoHorario = {
  inicio: INICIO_DA_JANELA,
  fim: FIM_DA_JANELA,
};

/** As dezassete horas cheias que a coluna escreve — 07:00, 08:00, …, 23:00. */
export const HORAS_DA_COLUNA: readonly number[] = horasDaJanela(JANELA_DO_DIA).slice(0, -1);

/**
 * Quanto dura uma marcação que não diz quanto dura.
 *
 * O `CalendarEvent` desta casa tem `time` e não tem fim (ver `types.ts`): uma
 * reunião marcada para as 15:00 não sabe se acaba às 15:30 ou às 17:00. Numa
 * vista de horas isso tem de virar altura, e há duas saídas: desenhar um
 * traço sem altura (o que o `ReguaDoDia` faz aos instantes) ou dar-lhe uma
 * duração assumida.
 *
 * Fica a duração assumida, por uma razão de leitura: aqui a pergunta é «o que
 * é que se sobrepõe?», e dois traços sem altura às 15:00 e às 15:30 nunca se
 * sobrepõem — a vista diria que a tarde está livre quando ela tem duas
 * reuniões encavalitadas. Uma hora é o degrau da coluna, portanto um bloco
 * ocupa exactamente uma faixa e ninguém lê a altura como uma medida exacta.
 */
export const DURACAO_ASSUMIDA = MINUTOS_POR_HORA;

/** 44 px por hora — o número da Parte 3, escrito uma vez. */
export const PX_POR_HORA = 44;

/**
 * A largura mínima de uma coluna de dia, em píxeis.
 *
 * 96 é o mesmo número da `GrelhaDoDia.tsx`, e pela mesma medição que lá está
 * escrita: é a largura a que um bloco ainda escreve «17:00 Cerimónia» em duas
 * linhas legíveis. Abaixo disso a coluna não encolhe mais — a caixa passa a
 * rolar na horizontal, com a coluna das horas presa à esquerda.
 */
export const LARGURA_MINIMA_DA_COLUNA = 96;

/**
 * A largura mínima de uma PISTA dentro de uma coluna, em píxeis.
 *
 * Dois eventos à mesma hora repartem a coluna ao meio, três repartem-na em
 * três — e aos 96 px de chão isso dava 48 e 32 px de alvo. A régua da casa são
 * 44 px no dedo (ver `.alvo-toque` no `globals.css`), portanto o chão da
 * coluna cresce com o número de pistas em vez de as espremer: com duas pistas
 * o mínimo passa a 88, com três a 132. Quem tem três coisas à mesma hora rola
 * mais um bocado e continua a poder tocar em cada uma delas.
 */
export const LARGURA_MINIMA_DA_PISTA = 44;

/** Uma coisa que ocupa um intervalo de minutos do dia. */
export interface Posicionavel {
  /** Identidade estável — `q:LIQ-1`, `e:abc`. Só serve para o `key` do React. */
  chave: string;
  /** Minutos desde a meia-noite. */
  inicio: number;
  /** Minutos desde a meia-noite. Sempre maior do que `inicio`. */
  fim: number;
}

export interface Posicionado {
  /** A pista onde este bloco cai, 0 à esquerda. */
  pista: number;
  /** Quantas pistas tem o GRUPO a que ele pertence. */
  pistas: number;
}

/**
 * Encosta um minuto à janela desenhada.
 *
 * Uma marcação às 06:00 existe e não pode desaparecer da vista só porque a
 * coluna começa às sete — encosta-se ao topo, com o `title` e o nome acessível
 * a dizerem a hora verdadeira. Desenhá-la fora da caixa era escondê-la; não a
 * desenhar era mentir sobre o dia.
 */
export function dentroDaJanela(minuto: number): number {
  return Math.min(Math.max(minuto, INICIO_DA_JANELA), FIM_DA_JANELA);
}

/**
 * ── QUEM SE SOBREPÕE A QUEM, E EM QUANTAS PISTAS ──────────────────────────
 *
 * O documento pede uma linha: «Eventos sobrepostos dividem a largura.» A
 * conta tem duas partes e a segunda é a que costuma sair errada.
 *
 *  1. **O GRUPO.** Não basta comparar aos pares: A das 9 às 11 e B das 10 às
 *     12 sobrepõem-se, B e C das 11:30 às 13 também, mas A e C não. Os três
 *     têm de repartir a MESMA largura, senão B fica com metade da coluna numa
 *     ponta e um terço na outra e o bloco desenha-se torto. O grupo é o fecho
 *     transitivo: fecha-se quando um bloco começa depois de TODOS os
 *     anteriores acabarem.
 *
 *  2. **A PISTA.** Dentro do grupo, cada bloco vai para a primeira pista que
 *     já esteja livre à hora a que ele começa — é a colocação gulosa, e dá o
 *     número mínimo de pistas para um grupo de intervalos. As duas reuniões
 *     das 9 e das 10 em pistas diferentes; a das 11, que já não choca com a
 *     primeira, volta à pista 0.
 *
 * A ordenação é por início e, em empate, pelo mais LONGO primeiro: um bloco de
 * três horas na pista 0 com os curtos à direita lê-se como «isto atravessa a
 * manhã»; ao contrário, o longo aparece encostado à direita e a manhã parece
 * partida.
 */
export function disporEmPistas<T extends Posicionavel>(itens: readonly T[]): (T & Posicionado)[] {
  const ordenados = [...itens].sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
  const saida: (T & Posicionado)[] = [];

  /** Os índices, em `saida`, do grupo que ainda está aberto. */
  let grupo: number[] = [];
  /** Quando acaba cada pista do grupo aberto. */
  let pistas: number[] = [];

  const fecharGrupo = () => {
    for (const i of grupo) saida[i] = { ...saida[i], pistas: pistas.length };
    grupo = [];
    pistas = [];
  };

  for (const item of ordenados) {
    // O grupo fecha quando o novo bloco começa depois de todas as pistas
    // estarem livres — é aí, e só aí, que ninguém do grupo anterior o toca.
    if (pistas.length > 0 && pistas.every((fim) => fim <= item.inicio)) fecharGrupo();

    let pista = pistas.findIndex((fim) => fim <= item.inicio);
    if (pista === -1) {
      pista = pistas.length;
      pistas.push(item.fim);
    } else {
      pistas[pista] = Math.max(pistas[pista], item.fim);
    }

    grupo.push(saida.length);
    // `pistas` é provisório: só se sabe quantas são quando o grupo fecha.
    saida.push({ ...item, pista, pistas: 1 });
  }
  fecharGrupo();

  return saida;
}

/**
 * Os sete dias da semana que contém `iso`, de segunda a domingo.
 *
 * Segunda-feira primeiro porque é o que a casa usa em todo o lado (a grelha do
 * mês, os mini-meses do ano, a Parte 9.6 do sistema de design). A conta é em
 * UTC ao meio-dia, como no `ano-do-calendario`, para nenhuma mudança de hora
 * legal deslocar a semana num fuso qualquer.
 */
export function diasDaSemana(iso: string): string[] {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return [];
  const desvio = (d.getUTCDay() + 6) % 7;
  const segunda = maisDias(iso, -desvio);
  return Array.from({ length: 7 }, (_, i) => maisDias(segunda, i));
}

/**
 * O título da vista de semana — a unidade que ela mostra, como manda o
 * documento («o mês é o título da vista»; aqui a unidade é a semana).
 *
 * Três formas, e a razão de serem três é não escrever o que já se sabe:
 *
 *   `8 – 14 Set 2026`          a semana inteira no mesmo mês
 *   `28 Set – 4 Out 2026`      duas pontas em meses diferentes
 *   `28 Dez 2026 – 3 Jan 2027` e em anos diferentes, que é o único caso em
 *                              que o ano tem de aparecer duas vezes
 */
export function tituloDaSemana(dias: readonly string[]): string {
  if (dias.length === 0) return "";
  const parte = (iso: string) => {
    const [ano, mes, dia] = iso.split("-").map(Number);
    return { ano, mes: mes - 1, dia };
  };
  const a = parte(dias[0]);
  const b = parte(dias[dias.length - 1]);
  const mesCurto = (m: number) => MESES[m].slice(0, 3);
  if (a.ano !== b.ano) {
    return `${a.dia} ${mesCurto(a.mes)} ${a.ano} – ${b.dia} ${mesCurto(b.mes)} ${b.ano}`;
  }
  if (a.mes !== b.mes) {
    return `${a.dia} ${mesCurto(a.mes)} – ${b.dia} ${mesCurto(b.mes)} ${b.ano}`;
  }
  return `${a.dia} – ${b.dia} ${mesCurto(a.mes)} ${a.ano}`;
}

/**
 * Quantos minutos vão desde a meia-noite LOCAL até `agora`.
 *
 * Local e não UTC: a linha do momento atual tem de cair onde ela vê o relógio
 * da parede. Em Lisboa no verão, contada em UTC, ficaria uma hora acima.
 */
export function minutoDoRelogio(agora: Date): number {
  return agora.getHours() * MINUTOS_POR_HORA + agora.getMinutes();
}
