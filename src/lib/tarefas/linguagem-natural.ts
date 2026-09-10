import type { TaskPriority } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «CONFIRMAR FLORISTA AMANHÃ ÀS 10H #ANA !ALTA» — UMA LINHA, QUATRO CAMPOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A fase 07 do `docs/APPLE-TAREFAS.md`. O ponto 8 da auditoria diz porque é que
 * isto existe: data, responsável e evento estavam escondidos atrás de um
 * «Detalhes (opcional)» colapsado por omissão — os três dados que tornam uma
 * tarefa útil a uma equipa. A regra da Apple que o ponto cita é *oferecer
 * escolha em vez de escrita, e reduzir ao mínimo o que é preciso escrever*.
 *
 * Aqui não se desenha nada. Este ficheiro só LÊ a linha e diz o que percebeu:
 * o título limpo, os campos, e **as posições no texto original** de cada pedaço
 * que reconheceu — que é o que permite ao ecrã realçar o texto no próprio campo
 * e desenhar as pastilhas editáveis por cima. Quem desenha decide as cores; o
 * QUE se reconhece decide-se uma vez, aqui, e prova-se num teste de node.
 *
 * ── A REGRA QUE MANDA EM TODAS AS OUTRAS ─────────────────────────────────
 *
 * **Na dúvida, não se extrai.** Uma extracção que acerta nove em cada dez vezes
 * é PIOR do que não haver nenhuma: ela escreve «Ligar ao Bruno dia 12», a
 * tarefa fica com a data errada e o título cortado, e ela só dá por isso no
 * dia. O custo de não reconhecer é ela escrever a data à mão — dez segundos. O
 * custo de reconhecer mal é uma tarefa que falha.
 *
 * Daí as três decisões estruturais deste ficheiro:
 *
 *  1. **Duas expressões do mesmo tipo anulam-se as duas.** «Ligar amanhã ou na
 *     sexta» não tem uma data — tem uma hesitação. Escolher a primeira era
 *     adivinhar; não escolher nenhuma devolve-lhe a frase inteira no título.
 *
 *  2. **O ano nunca anda para trás.** Sem ano escrito, «12/06» em Setembro é
 *     Junho do ano SEGUINTE, e «dia 12» é o 12 mais próximo que ainda não
 *     passou. Uma tarefa não se marca para o passado; o que se marca para o
 *     passado é uma tarefa que nasce atrasada sem ninguém a ter escrito.
 *
 *  3. **Se do título não sobrar nada, não se extrai nada.** Escrever só
 *     «amanhã» daria uma tarefa sem nome. Fica «amanhã» como título, sem
 *     campos, e ela corrige — que é o comportamento que se explica.
 *
 * ── AS ARMADILHAS DESTA CASA, QUE NÃO SÃO AS DE UM CALENDÁRIO QUALQUER ────
 *
 * **«quinta» é uma casa, não é quinta-feira.** Numa empresa de casamentos no
 * Alentejo, a palavra «quinta» aparece cem vezes como local — «Confirmar
 * florista para a Quinta do Vale» é o exemplo que o próprio documento usa na
 * Parte 3 — e uma vez como dia da semana. Por isso «quinta» sozinha NÃO é uma
 * data; precisa de `quinta-feira` ou de uma preposição de dia («na quinta»).
 * E nenhum dia da semana sobrevive a ser seguido de `de/do/da` — «quinta do
 * Vale», «segunda de Junho».
 *
 * **Um `@` no meio de uma palavra é correio, não é um evento.** «Mandar
 * contrato para ana@liquen.pt» não tem evento nenhum. Os dois sinais, `#` e
 * `@`, só contam no princípio de uma palavra.
 *
 * **Um `!` colado à palavra anterior é pontuação, não é prioridade.** «Ligar
 * hoje!» é uma frase; «Ligar hoje !» é uma prioridade. A diferença é um espaço,
 * e é a única maneira de distinguir as duas sem adivinhar.
 *
 * ── E PORQUE É QUE NÃO ENTRA AQUI UMA BIBLIOTECA DE DATAS ────────────────
 *
 * Isto corre no browser, dentro do campo, a cada tecla. Uma biblioteca de datas
 * traria um analisador de línguas inteiro para resolver quinze expressões
 * portuguesas — e o peso vai no pacote que ela descarrega. `RegExp` e `Date`
 * chegam, e a aritmética é toda em dia civil (ano/mês/dia), nunca em instantes:
 * é a mesma razão pela qual o `data-curta.ts` não tem um `Date` pelo meio. Uma
 * data de tarefa é um DIA escrito «2026-09-11», sem hora e sem fuso; convertê-la
 * a instante e de volta é atravessar duas vezes um sítio onde se perde um dia.
 */

/** O que uma marca no texto pode ser. */
export type TipoDeMarca = "data" | "hora" | "responsavel" | "evento" | "prioridade";

/**
 * Um pedaço reconhecido do texto original.
 *
 * `inicio` e `fim` são índices no texto **tal como ela o escreveu** (`fim`
 * exclusivo, como no `slice`), para o ecrã poder realçar o pedaço no campo e
 * pendurar-lhe a pastilha por cima. O `titulo` devolvido já vem sem eles e com
 * os espaços normalizados, portanto as posições NÃO servem para indexar o
 * título — só o texto de origem.
 */
export interface Marca<V = string> {
  tipo: TipoDeMarca;
  /** Índice do primeiro carácter no texto original. */
  inicio: number;
  /** Índice a seguir ao último carácter, como no `slice`. */
  fim: number;
  /** O que estava escrito, tal e qual — é isto que volta ao título se ela apagar a pastilha. */
  texto: string;
  /** O valor já interpretado. */
  valor: V;
}

/** O que se conseguiu ler de uma linha. */
export interface Interpretacao {
  /** O título sem as expressões reconhecidas, com os espaços normalizados. */
  titulo: string;
  /** Dia civil, «2026-09-11» — o formato do `Task.dueDate`. */
  data?: Marca<string>;
  /** «10:00», 24 horas. Pode existir sem `data`: quem decide o dia é o ecrã. */
  hora?: Marca<string>;
  /** O que estava a seguir ao `#`, tal como escrito. Resolver o nome é do ecrã. */
  responsavel?: Marca<string>;
  /** O que estava a seguir ao `@`, tal como escrito. Ligar à proposta é do ecrã. */
  evento?: Marca<string>;
  prioridade?: Marca<TaskPriority>;
  /** Todas as marcas, por ordem de aparição no texto original. */
  marcas: readonly Marca<string>[];
}

export interface OpcoesDeInterpretacao {
  /**
   * O relógio. Existe para os testes poderem fixar o dia — sem isto, «amanhã»
   * é uma expressão que não se consegue prender num teste.
   */
  agora?: Date;
}

// ── Dia civil ───────────────────────────────────────────────────────────────
// Ano/mês/dia, sem hora e sem fuso. O `Date` só entra para contar dias e para
// perguntar se um dia existe; nunca para transportar a data.

interface DiaCivil {
  ano: number;
  /** 1–12, como se escreve, e não 0–11 como o `Date`. */
  mes: number;
  dia: number;
}

const hojeCivil = (agora: Date): DiaCivil => ({
  ano: agora.getFullYear(),
  mes: agora.getMonth() + 1,
  dia: agora.getDate(),
});

const iso = (d: DiaCivil): string =>
  `${String(d.ano).padStart(4, "0")}-${String(d.mes).padStart(2, "0")}-${String(d.dia).padStart(2, "0")}`;

/** 31 de Setembro não existe, 29 de Fevereiro de 2027 também não. */
function existe(d: DiaCivil): boolean {
  if (!Number.isInteger(d.ano) || d.mes < 1 || d.mes > 12 || d.dia < 1 || d.dia > 31) return false;
  const t = new Date(d.ano, d.mes - 1, d.dia);
  return t.getFullYear() === d.ano && t.getMonth() === d.mes - 1 && t.getDate() === d.dia;
}

const somarDias = (d: DiaCivil, n: number): DiaCivil => {
  const t = new Date(d.ano, d.mes - 1, d.dia + n);
  return { ano: t.getFullYear(), mes: t.getMonth() + 1, dia: t.getDate() };
};

/** Negativo quando `a` é anterior a `b`. */
const comparar = (a: DiaCivil, b: DiaCivil): number => iso(a).localeCompare(iso(b));

const diaDaSemana = (d: DiaCivil): number => new Date(d.ano, d.mes - 1, d.dia).getDay();

/** «terça» e «Sábado» ficam ambos comparáveis a `terca`/`sabado`. */
const semAcentos = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// ── Os padrões ──────────────────────────────────────────────────────────────

/**
 * As preposições que ficam coladas a uma data e que TÊM de sair com ela.
 *
 * Sem isto, «Confirmar florista para amanhã» daria o título «Confirmar florista
 * para» — uma frase truncada é o sinal de que a extracção correu mal, mesmo
 * quando a data está certa. Repete-se (`*`) porque «para a próxima sexta» tem
 * três palavras à frente do dia.
 */
const PREFIXO_DE_DATA = String.raw`(?:(?:para|pra|no|na|em|at[ée]|ao|à|a|nesta|neste|esta|este|pr[óo]xim[ao])\s+)*`;

/** Não estar colado a letra ou algarismo, de um lado e do outro. */
const ABRE = String.raw`(?<![\p{L}\p{N}])`;
const FECHA = String.raw`(?![\p{L}\p{N}])`;

const re = (fonte: string) => new RegExp(fonte, "giu");

const DIAS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

const MESES: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

const MES = String.raw`(jan(?:eiro)?|fev(?:ereiro)?|mar(?:ço|co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)`;

/** «um», «duas», «três» — o resto escreve-se em algarismos. */
const NUMEROS_POR_EXTENSO: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
};

type Candidato = Marca<string>;

const marca = (
  tipo: TipoDeMarca,
  m: RegExpExecArray | RegExpMatchArray,
  valor: string,
): Candidato => ({
  tipo,
  inicio: m.index ?? 0,
  fim: (m.index ?? 0) + m[0].length,
  texto: m[0],
  valor,
});

// ── Datas ───────────────────────────────────────────────────────────────────

/**
 * Nomes de dias.
 *
 * `sábado` e `domingo` não querem dizer mais nada em português e passam
 * sozinhos. `segunda`…`sexta` são também ordinais, e `quinta` é, nesta casa,
 * sobretudo o sítio onde o casamento acontece — por isso a `quinta` exige
 * `-feira` ou uma preposição de dia à frente. E nenhum deles passa seguido de
 * `de/do/da`: aí é um nome («Quinta do Vale», «segunda de Junho»).
 */
/** As preposições que só fazem sentido antes de um DIA, e não antes de um sítio. */
const PREPOSICOES_DE_DIA = [
  "na",
  "no",
  "nesta",
  "neste",
  "esta",
  "este",
  "ate",
  "proxima",
  "proximo",
];

function datasPorDiaDaSemana(texto: string, hoje: DiaCivil): Candidato[] {
  const padrao = re(
    `${ABRE}(${PREFIXO_DE_DATA})(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(\\s*-?\\s*feira)?${FECHA}`,
  );
  const encontrados: Candidato[] = [];
  for (const m of texto.matchAll(padrao)) {
    const prefixo = semAcentos(m[1] ?? "");
    const nome = semAcentos(m[2]);
    const temFeira = Boolean(m[3]);
    const resto = texto.slice((m.index ?? 0) + m[0].length);

    // «quinta do Vale», «segunda de Junho» — a seguir vem um nome, não um dia.
    if (/^\s+(?:de|do|da|dos|das)\b/i.test(resto) && !temFeira) continue;

    const palavras = prefixo.trim().split(/\s+/).filter(Boolean);
    const ultima = palavras[palavras.length - 1] ?? "";

    /**
     * O ARTIGO SOZINHO DESLIGA O DIA. «Rever a sexta página» é um ordinal e «à
     * sexta» é um hábito — nenhum dos dois é uma data. Um dia concreto escreve-
     * se «na sexta», «até sexta» ou «na próxima sexta», e é a diferença entre
     * o artigo e a preposição que os separa sem adivinhar.
     */
    if (!temFeira && (ultima === "a" || ultima === "ao" || ultima === "as")) continue;

    // A `quinta` é a única que não passa nua: nesta casa é quase sempre o
    // local, e nem «para a quinta» a salva. Precisa de `-feira` ou de uma
    // preposição que só faça sentido com um dia.
    // As outras passam nuas — «sexta» está na tabela da Parte 3 — porque o
    // único sentido concorrente que têm é o de ordinal, e um ordinal sozinho no
    // meio de um título («Confirmar florista sexta») não é português que se
    // escreva.
    if (nome === "quinta" && !temFeira && !PREPOSICOES_DE_DIA.includes(ultima)) continue;

    const alvo = DIAS[nome];
    if (alvo === undefined) continue;
    let delta = (alvo - diaDaSemana(hoje) + 7) % 7;
    // «na próxima sexta» escrita numa sexta é a de daqui a uma semana; sem o
    // «próxima», o dia mais perto que não passou — que pode ser hoje.
    if (delta === 0 && /pr[óo]xim/i.test(prefixo)) delta = 7;
    encontrados.push(marca("data", m, iso(somarDias(hoje, delta))));
  }
  return encontrados;
}

/** «hoje», «amanhã», «depois de amanhã». */
function datasRelativas(texto: string, hoje: DiaCivil): Candidato[] {
  const encontrados: Candidato[] = [];
  const padrao = re(`${ABRE}${PREFIXO_DE_DATA}(depois\\s+de\\s+amanh[ãa]|amanh[ãa]|hoje)${FECHA}`);
  for (const m of texto.matchAll(padrao)) {
    const palavra = semAcentos(m[1]).replace(/\s+/g, " ");
    const dias = palavra === "hoje" ? 0 : palavra === "amanha" ? 1 : 2;
    encontrados.push(marca("data", m, iso(somarDias(hoje, dias))));
  }
  return encontrados;
}

/**
 * «dia 12» — o 12 mais próximo que ainda não passou.
 *
 * Escrito a 10 de Setembro, «dia 12» é 12 de Setembro; escrito a 20, é 12 de
 * Outubro. E «dia 31» em Setembro salta para Outubro, porque Setembro não tem
 * 31 — inventar o 30 seria mudar-lhe a data em silêncio.
 */
function datasPorDiaDoMes(texto: string, hoje: DiaCivil): Candidato[] {
  const padrao = re(`${ABRE}${PREFIXO_DE_DATA}dia\\s+(\\d{1,2})(?![\\d/-])${FECHA}`);
  const encontrados: Candidato[] = [];
  for (const m of texto.matchAll(padrao)) {
    const dia = Number(m[1]);
    if (dia < 1 || dia > 31) continue;
    let candidato: DiaCivil | null = null;
    for (let salto = 0; salto <= 13 && !candidato; salto++) {
      const t = new Date(hoje.ano, hoje.mes - 1 + salto, 1);
      const tentativa = { ano: t.getFullYear(), mes: t.getMonth() + 1, dia };
      if (existe(tentativa) && comparar(tentativa, hoje) >= 0) candidato = tentativa;
    }
    if (candidato) encontrados.push(marca("data", m, iso(candidato)));
  }
  return encontrados;
}

/** O ano seguinte em que essa data existe — o 29 de Fevereiro salta anos. */
function proximoAnoValido(mes: number, dia: number, hoje: DiaCivil): DiaCivil | null {
  for (let salto = 0; salto <= 8; salto++) {
    const tentativa = { ano: hoje.ano + salto, mes, dia };
    if (existe(tentativa) && comparar(tentativa, hoje) >= 0) return tentativa;
  }
  return null;
}

/**
 * «12/06» e «12/06/2027».
 *
 * Só com barras. Um `12-06` lê-se como intervalo e um `12.06` como número
 * decimal — reconhecer qualquer um deles como data era apanhar preços e
 * numerações de contrato. E um ano de dois algarismos («12/06/27») fica de
 * fora: nesse formato o `27` tanto é o ano como um terceiro campo qualquer, e
 * as duas leituras dão anos diferentes.
 */
function datasEmBarras(texto: string, hoje: DiaCivil): Candidato[] {
  const padrao = re(
    `(?<![\\p{L}\\p{N}/,.])${PREFIXO_DE_DATA}(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}))?(?![\\d/])`,
  );
  const encontrados: Candidato[] = [];
  for (const m of texto.matchAll(padrao)) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    if (mes < 1 || mes > 12) continue;
    if (m[3]) {
      // Com o ano escrito, respeita-se o que ela escreveu — mesmo que seja uma
      // tarefa que nasce atrasada, que é uma coisa que acontece.
      const d = { ano: Number(m[3]), mes, dia };
      if (existe(d)) encontrados.push(marca("data", m, iso(d)));
      continue;
    }
    const d = proximoAnoValido(mes, dia, hoje);
    if (d) encontrados.push(marca("data", m, iso(d)));
  }
  return encontrados;
}

/** «12 de junho», «12 jun», «dia 12 de junho de 2027». */
function datasPorNomeDoMes(texto: string, hoje: DiaCivil): Candidato[] {
  const padrao = re(
    `${ABRE}${PREFIXO_DE_DATA}(?:dia\\s+)?(\\d{1,2})\\s+(?:de\\s+)?${MES}\\.?(?:\\s+de\\s+(\\d{4}))?${FECHA}`,
  );
  const encontrados: Candidato[] = [];
  for (const m of texto.matchAll(padrao)) {
    const dia = Number(m[1]);
    const mes = MESES[semAcentos(m[2]).slice(0, 3)];
    if (!mes) continue;
    if (m[3]) {
      const d = { ano: Number(m[3]), mes, dia };
      if (existe(d)) encontrados.push(marca("data", m, iso(d)));
      continue;
    }
    const d = proximoAnoValido(mes, dia, hoje);
    if (d) encontrados.push(marca("data", m, iso(d)));
  }
  return encontrados;
}

/**
 * «daqui a 3 dias», «dentro de 2 semanas», «daqui a um mês».
 *
 * Nos meses, se o dia não existir no mês de chegada — 31 de Janeiro mais um mês
 * — não se extrai. Encostar ao 28 ou saltar para o 3 de Março são as duas
 * convenções possíveis e nenhuma é evidente para quem escreveu.
 */
function datasPorContagem(texto: string, hoje: DiaCivil): Candidato[] {
  const padrao = re(
    `${ABRE}(?:daqui\\s+a|dentro\\s+de)\\s+(\\d{1,3}|um|uma|dois|duas|tr[êe]s)\\s+(dias?|semanas?|m[êe]s|meses)${FECHA}`,
  );
  const encontrados: Candidato[] = [];
  for (const m of texto.matchAll(padrao)) {
    const bruto = semAcentos(m[1]);
    const n = /^\d+$/.test(bruto) ? Number(bruto) : NUMEROS_POR_EXTENSO[bruto];
    if (!n) continue;
    const unidade = semAcentos(m[2]);
    if (unidade.startsWith("dia")) {
      encontrados.push(marca("data", m, iso(somarDias(hoje, n))));
    } else if (unidade.startsWith("semana")) {
      encontrados.push(marca("data", m, iso(somarDias(hoje, n * 7))));
    } else {
      const t = new Date(hoje.ano, hoje.mes - 1 + n, hoje.dia);
      const d = { ano: t.getFullYear(), mes: t.getMonth() + 1, dia: hoje.dia };
      if (existe(d) && t.getDate() === hoje.dia) encontrados.push(marca("data", m, iso(d)));
    }
  }
  return encontrados;
}

// ── Horas ───────────────────────────────────────────────────────────────────

const horaValida = (h: number, min: number): boolean => h >= 0 && h <= 23 && min >= 0 && min <= 59;

const comoHora = (h: number, min: number): string =>
  `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;

/**
 * «às 10h», «10h30», «10:00», «às 10 horas».
 *
 * O `12,50` de um preço não entra por aqui: a vírgula não é separador de horas
 * em lado nenhum deste ficheiro, e o `12.50` também não — é a mesma decisão que
 * mantém o ponto fora das datas.
 */
function horas(texto: string): Candidato[] {
  const prefixo = String.raw`(?:(?:[àa]s|pelas|[àa])\s+)?`;
  const encontrados: Candidato[] = [];

  for (const m of texto.matchAll(re(`${ABRE}${prefixo}(\\d{1,2})h(\\d{2})?${FECHA}`))) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (horaValida(h, min)) encontrados.push(marca("hora", m, comoHora(h, min)));
  }
  for (const m of texto.matchAll(re(`(?<![\\d:/])${prefixo}(\\d{1,2}):(\\d{2})(?![\\d:])`))) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (horaValida(h, min)) encontrados.push(marca("hora", m, comoHora(h, min)));
  }
  // Sem `h` nem `:`, o número só é hora se ela escreveu «horas» a seguir — ou
  // «às» à frente. Um `10` solto num título é um número.
  for (const m of texto.matchAll(
    re(`${ABRE}(?:[àa]s|pelas)\\s+(\\d{1,2})(?:\\s+horas?)?${FECHA}`),
  )) {
    const h = Number(m[1]);
    if (horaValida(h, 0)) encontrados.push(marca("hora", m, comoHora(h, 0)));
  }
  return encontrados;
}

// ── Prioridade, responsável e evento ────────────────────────────────────────

const PRIORIDADES: Record<string, TaskPriority> = {
  alta: "alta",
  urgente: "alta",
  normal: "normal",
  media: "normal",
  baixa: "baixa",
};

/**
 * `!`, `!!`, `!alta`, `!baixa`.
 *
 * O `!` tem de estar no princípio de uma palavra — «Ligar hoje!» é pontuação e
 * não uma prioridade, e é só isso que distingue as duas.
 *
 * `!` e `!!` dão os dois `alta`: o `TaskPriority` desta casa tem três degraus
 * («baixa», «normal», «alta») e acima de `alta` não há para onde ir. A Parte 3
 * quer os dois desenhados de maneira diferente no ecrã — quem desenha tem a
 * marca e o texto original (`!` ou `!!`) para o fazer sem que isto invente um
 * quarto degrau que a base de dados não guarda.
 */
function prioridades(texto: string): Candidato[] {
  const padrao = re(`(?<![^\\s])(!{1,3})(alta|urgente|normal|m[ée]dia|baixa)?${FECHA}`);
  const encontrados: Candidato[] = [];
  for (const m of texto.matchAll(padrao)) {
    const nome = m[2] ? PRIORIDADES[semAcentos(m[2])] : "alta";
    if (nome) encontrados.push(marca("prioridade", m, nome));
  }
  return encontrados;
}

/**
 * `#Ana` (responsável) e `@Melanie` (evento).
 *
 * A repartição é a da Parte 3 do documento e da microcopy da Parte 5, onde o
 * estado vazio ensina, à letra, «Confirmar florista amanhã às 10h #Ana».
 *
 * Uma palavra só, a começar por letra. `#12` não é ninguém e `ana@liquen.pt`
 * não é um evento — o `@` de um endereço de correio vem colado à palavra
 * anterior, e é aí que se apanha. Nomes com espaço («#Ana Rita») ficam pelo
 * primeiro pedaço: adivinhar onde acaba um nome de duas palavras era comer
 * título a mais.
 */
function pessoasEEventos(texto: string): Candidato[] {
  const encontrados: Candidato[] = [];
  const corpo = String.raw`([\p{L}][\p{L}\p{N}'_-]*)`;
  for (const m of texto.matchAll(re(`(?<![^\\s])#${corpo}`))) {
    encontrados.push(marca("responsavel", m, m[1]));
  }
  for (const m of texto.matchAll(re(`(?<![^\\s])@${corpo}`))) {
    encontrados.push(marca("evento", m, m[1]));
  }
  return encontrados;
}

// ── A junção ────────────────────────────────────────────────────────────────

/**
 * Lê uma linha escrita à mão e devolve o título limpo mais o que reconheceu.
 *
 * Nunca lança. Um texto que não tem nada de reconhecível volta inteiro no
 * `titulo`, com `marcas` vazio — que é o caso mais comum e tem de ser o mais
 * barato de explicar.
 */
export function interpretarTarefa(
  texto: string,
  opcoes: OpcoesDeInterpretacao = {},
): Interpretacao {
  const original = texto ?? "";
  const limpo = (s: string) =>
    s
      .replace(/\s+/g, " ")
      .trim()
      // O espaço que fica onde estava a pastilha não pode empurrar a pontuação
      // para longe da palavra: «Ligar #Ana.» dava «Ligar .».
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/[\s,;:–—-]+$/u, "")
      .trim();

  const semNada: Interpretacao = { titulo: limpo(original), marcas: [] };
  if (!original.trim()) return { titulo: "", marcas: [] };

  const hoje = hojeCivil(opcoes.agora ?? new Date());

  const candidatos: Candidato[] = [
    ...datasRelativas(original, hoje),
    ...datasPorDiaDaSemana(original, hoje),
    ...datasPorDiaDoMes(original, hoje),
    ...datasEmBarras(original, hoje),
    ...datasPorNomeDoMes(original, hoje),
    ...datasPorContagem(original, hoje),
    ...horas(original),
    ...prioridades(original),
    ...pessoasEEventos(original),
  ];

  /**
   * Os padrões sobrepõem-se de propósito: «dia 12 de junho» é apanhado pelo
   * `dia 12` e pelo `12 de junho`. Ganha o pedaço MAIS COMPRIDO — é o que lê a
   * frase inteira em vez de metade dela — e o outro desaparece sem contar como
   * uma segunda data.
   */
  const porTamanho = [...candidatos].sort(
    (a, b) => b.fim - b.inicio - (a.fim - a.inicio) || a.inicio - b.inicio,
  );
  const aceites: Candidato[] = [];
  for (const c of porTamanho) {
    if (aceites.some((j) => c.inicio < j.fim && j.inicio < c.fim)) continue;
    aceites.push(c);
  }

  // Duas do mesmo tipo é hesitação, não é informação: caem as duas.
  const porTipo = new Map<TipoDeMarca, Candidato[]>();
  for (const c of aceites) porTipo.set(c.tipo, [...(porTipo.get(c.tipo) ?? []), c]);
  const finais = aceites
    .filter((c) => (porTipo.get(c.tipo) ?? []).length === 1)
    .sort((a, b) => a.inicio - b.inicio);

  if (finais.length === 0) return semNada;

  let titulo = "";
  let cursor = 0;
  for (const c of finais) {
    titulo += `${original.slice(cursor, c.inicio)} `;
    cursor = c.fim;
  }
  titulo = limpo(titulo + original.slice(cursor));

  // Se do título não sobrar nada, ela escreveu só a data — e uma tarefa sem
  // nome não se cria. Devolve-se a linha inteira e ela decide.
  if (!titulo) return semNada;

  const doTipo = (tipo: TipoDeMarca) => finais.find((c) => c.tipo === tipo);
  const prioridade = doTipo("prioridade");

  return {
    titulo,
    data: doTipo("data"),
    hora: doTipo("hora"),
    responsavel: doTipo("responsavel"),
    evento: doTipo("evento"),
    prioridade: prioridade as Marca<TaskPriority> | undefined,
    marcas: finais,
  };
}
