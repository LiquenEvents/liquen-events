import type { TimelineItem } from "./types";
import {
  analisarODia,
  BURACO_MINIMO_MIN,
  duracaoDe,
  estaNoDia,
  porExtenso,
  type AnaliseDoDia,
} from "./guiao-do-dia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS GUIÕES TODOS, E NÃO UM DE CADA VEZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `guiao-do-dia.ts` responde a «isto cabe?» sobre UM dia. Este ficheiro
 * responde à pergunta de cima, que é outra e é a da segunda-feira de manhã:
 * **«dos eventos que aí vêm, quais é que já têm guião e quais é que têm um
 * problema?»**
 *
 * Até aqui não havia forma de a fazer. O guião vivia dentro da zona de produção
 * de um evento; para saber se o casamento de daqui a três semanas tinha guião
 * era preciso abrir o pedido, descer até à Produção e ver. Vinte eventos, vinte
 * aberturas — e a resposta esquecia-se pelo caminho.
 *
 * Como o resto do motor: funções puras, sem React e sem relógio próprio. O
 * relógio entra por argumento (`agora`), para se poder pôr à prova um Sábado
 * de Junho sem esperar por ele.
 */

/**
 * Um evento com o seu guião, como a lista o precisa.
 *
 * É o que a rota `/api/guioes` devolve por evento — e traz os MOMENTOS, não um
 * resumo já cozinhado. A conta faz-se no cliente pela mesma razão por que o
 * `EventTimeline` a faz: é a MESMA função (`analisarODia`), e um resumo
 * calculado no servidor era uma segunda implementação da mesma pergunta, a
 * divergir em silêncio no dia em que uma das duas fosse afinada.
 *
 * O custo é o tamanho: uns 60 bytes por momento, uma dúzia de momentos por
 * evento. Trinta eventos dão ~20 KB — menos do que a lista de pedidos que o
 * back office já carrega.
 */
export interface ResumoDeGuiao {
  /** O id do pedido — é por ele que se abre o guião e se imprime a folha. */
  id: string;
  /** O nome do cliente. */
  cliente: string;
  /** A etiqueta do evento («Casamento», «Batizado da Matilde»). */
  evento: string;
  /** «aaaa-mm-dd». Um evento sem data não entra nesta lista — ver `ordenarGuioes`. */
  data: string;
  local: string;
  momentos: TimelineItem[];
}

/**
 * O que há a dizer sobre um guião, num relance.
 *
 * ── PORQUE É QUE ISTO É UMA LISTA E NÃO UM ESTADO ─────────────────────────
 *
 * A primeira versão devolvia um estado só — «tem guião», «tem buracos», «tem
 * sobreposições» — e obrigava a escolher qual deles ganhava quando um guião
 * tinha as três coisas. Escolher é perder: um dia com um choque de responsável
 * E três horas por marcar tem dois problemas, e o segundo não desaparece por o
 * primeiro ser mais grave.
 *
 * Cada sinal traz a CONTAGEM e a FRASE. A contagem é o que o ecrã põe na
 * pastilha; a frase é o nome acessível dela, porque uma pastilha que diga só
 * «2» não diz nada a quem ouve o ecrã — e porque a regra desta casa é que a cor
 * nunca é o único portador de significado.
 */
export type TipoDeSinal =
  | "sem-guiao"
  | "choque"
  | "sobreposicao"
  | "buraco"
  | "sem-duracao"
  | "pronto";

export interface SinalDoGuiao {
  tipo: TipoDeSinal;
  /** Quantos. Um em `sem-guiao` e em `pronto`, que não se contam. */
  quantos: number;
  /** A frase inteira, para o nome acessível e para quem lê a lista ao telefone. */
  frase: string;
}

/**
 * A gravidade, para a lista poder pôr à frente o que arde.
 *
 * Três degraus e não cinco: um choque de responsável é um ERRO que chega ao dia
 * do evento com duas pessoas à espera uma da outra; um buraco ou um guião por
 * fazer é trabalho por acabar; o resto é informação. Pintar tudo com a mesma
 * urgência era ensiná-la a ignorar a urgência.
 */
export type Gravidade = "erro" | "por-fazer" | "informacao";

export const GRAVIDADE_DO_SINAL: Record<TipoDeSinal, Gravidade> = {
  choque: "erro",
  "sem-guiao": "por-fazer",
  buraco: "por-fazer",
  "sem-duracao": "por-fazer",
  sobreposicao: "informacao",
  pronto: "informacao",
};

const ORDEM_DA_GRAVIDADE: Record<Gravidade, number> = {
  erro: 0,
  "por-fazer": 1,
  informacao: 2,
};

/**
 * Os sinais de um guião, do mais grave para o menos.
 *
 * ── E OS BURACOS INCERTOS NÃO CONTAM, PELA MESMA RAZÃO DE SEMPRE ─────────
 *
 * Uma sobra a seguir a um momento SEM duração tanto pode ser tempo livre como
 * pode ser a montagem a decorrer sem ninguém lhe ter dito quanto tempo leva. O
 * `EventTimeline` já se recusa a chamar-lhe buraco (ver `buracosCertos` lá), e
 * esta lista tem de dizer o mesmo sobre o mesmo dia: uma pastilha «3 buracos»
 * numa lista, ao lado de um ecrã que não nomeia buraco nenhum, é o ecrã a
 * discordar de si próprio.
 *
 * O que os incertos dão é o sinal `sem-duracao`, que diz a verdade: o dia ainda
 * não tem forma, e é por isso que não se pode afirmar mais nada.
 */
export function sinaisDoGuiao(momentos: readonly TimelineItem[]): SinalDoGuiao[] {
  if (momentos.length === 0) {
    return [{ tipo: "sem-guiao", quantos: 1, frase: "Sem timeline" }];
  }

  const dia = analisarODia(momentos);
  const buracosCertos = dia.buracos.filter((b) => !b.anteriorSemDuracao);
  const semDuracao = momentos.filter((i) => duracaoDe(i) === 0);

  const sinais: SinalDoGuiao[] = [];

  if (dia.choques.length > 0) {
    sinais.push({
      tipo: "choque",
      quantos: dia.choques.length,
      frase:
        dia.choques.length === 1
          ? "Uma pessoa em dois sítios ao mesmo tempo"
          : `${dia.choques.length} momentos com a mesma pessoa em dois sítios ao mesmo tempo`,
    });
  }
  if (buracosCertos.length > 0) {
    const maior = Math.max(...buracosCertos.map((b) => b.minutos));
    sinais.push({
      tipo: "buraco",
      quantos: buracosCertos.length,
      frase:
        buracosCertos.length === 1
          ? `${porExtenso(maior)} sem nada marcado`
          : `${buracosCertos.length} vazios, o maior de ${porExtenso(maior)}`,
    });
  }
  if (semDuracao.length > 0) {
    sinais.push({
      tipo: "sem-duracao",
      quantos: semDuracao.length,
      frase:
        semDuracao.length === momentos.length
          ? "Nenhum momento tem duração — o dia ainda não tem forma"
          : `${semDuracao.length} ${semDuracao.length === 1 ? "momento" : "momentos"} sem duração`,
    });
  }
  if (dia.sobreposicoes.length > 0) {
    sinais.push({
      tipo: "sobreposicao",
      quantos: dia.sobreposicoes.length,
      frase:
        dia.sobreposicoes.length === 1
          ? "Duas coisas ao mesmo tempo, com pessoas diferentes"
          : `${dia.sobreposicoes.length} pares a correr ao mesmo tempo, com pessoas diferentes`,
    });
  }

  if (sinais.length === 0) {
    sinais.push({
      tipo: "pronto",
      quantos: 1,
      frase: `Timeline pronta — ${momentos.length} ${momentos.length === 1 ? "momento" : "momentos"}`,
    });
  }

  return sinais.sort(
    (a, b) =>
      ORDEM_DA_GRAVIDADE[GRAVIDADE_DO_SINAL[a.tipo]] -
      ORDEM_DA_GRAVIDADE[GRAVIDADE_DO_SINAL[b.tipo]],
  );
}

/** O sinal que manda — o mais grave. Nunca é `undefined`: há sempre um. */
export function sinalPrincipal(sinais: readonly SinalDoGuiao[]): SinalDoGuiao {
  return sinais[0] ?? { tipo: "sem-guiao", quantos: 1, frase: "Sem timeline" };
}

/** Um guião com a sua leitura já feita — o que a lista desenha. */
export interface GuiaoNaLista extends ResumoDeGuiao {
  dia: AnaliseDoDia;
  sinais: SinalDoGuiao[];
  /** Dias até ao evento. Negativo depois de ele passar, zero no próprio dia. */
  faltamDias: number;
  /** O guião está a correr AGORA (o dia do evento, ou a madrugada seguinte). */
  hoje: boolean;
}

/** «aaaa-mm-dd» de uma data local — a mesma forma com que os eventos são gravados. */
export function diaDe(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/** Dias inteiros entre duas datas «aaaa-mm-dd». Positivo quando `ate` é no futuro. */
export function diasEntre(de: string, ate: string): number {
  const a = Date.parse(`${de}T12:00:00`);
  const b = Date.parse(`${ate}T12:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Os guiões pela ordem em que ela precisa deles.
 *
 * **Os que aí vêm primeiro, do mais próximo para o mais longe; os que já
 * passaram no fim, do mais recente para o mais antigo.**
 *
 * Não é a ordem de uma agenda, que seria cronológica de ponta a ponta e punha
 * o casamento de 2024 no topo. É a ordem do TRABALHO: o que se prepara está à
 * frente, e o que já aconteceu fica atrás mas não desaparece — a folha do dia
 * de um evento passado ainda se imprime, e o guião do ano passado é a melhor
 * matéria-prima para um modelo.
 *
 * O próprio dia do evento conta como futuro (`faltamDias === 0`), e conta até
 * ao fim: é precisamente durante o evento que este ecrã mais serve.
 */
export function ordenarGuioes(guioes: readonly ResumoDeGuiao[], agora: Date): GuiaoNaLista[] {
  const hoje = diaDe(agora);
  const preparados = guioes
    .filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.data))
    .map((g): GuiaoNaLista => {
      const momentos = g.momentos ?? [];
      return {
        ...g,
        momentos,
        dia: analisarODia(momentos),
        sinais: sinaisDoGuiao(momentos),
        faltamDias: diasEntre(hoje, g.data),
        hoje: estaNoDia(g.data, agora),
      };
    });

  const futuros = preparados
    .filter((g) => g.faltamDias >= 0)
    .sort((a, b) => a.data.localeCompare(b.data));
  const passados = preparados
    .filter((g) => g.faltamDias < 0)
    .sort((a, b) => b.data.localeCompare(a.data));
  return [...futuros, ...passados];
}

/**
 * ── A JANELA COMUM: PORQUE É QUE AS RÉGUAS DA LISTA PARTILHAM A ESCALA ────
 *
 * Cada linha da lista traz uma régua do dia em miniatura. Se cada uma tivesse
 * a sua própria escala — do seu início ao seu fim —, todas mediriam o mesmo
 * comprimento e a comparação entre elas seria FALSA: um evento de quatro horas
 * desenhava-se tão largo como um de dezanove, e a lista deixava de responder à
 * pergunta que a faz existir («qual destes dias está cheio?»).
 *
 * Com uma janela comum, o dia mais longo enche a régua e os outros ficam
 * proporcionalmente mais curtos — que é o que os olhos leem sem legenda
 * nenhuma.
 *
 * O chão de doze horas existe para o caso de a lista ter um evento só, e curto:
 * sem ele, um único almoço de três horas enchia a régua de bordo a bordo e
 * parecia um dia inteiro ocupado.
 */
export const JANELA_MINIMA_MIN = 12 * 60;

export interface JanelaDoDia {
  inicio: number;
  fim: number;
}

export function janelaComum(guioes: readonly { dia: AnaliseDoDia }[]): JanelaDoDia {
  const comForma = guioes.filter((g) => g.dia.inicio !== null && g.dia.fim !== null);
  if (comForma.length === 0) return { inicio: 8 * 60, fim: 8 * 60 + JANELA_MINIMA_MIN };
  const inicio = Math.min(...comForma.map((g) => g.dia.inicio as number));
  const fimBruto = Math.max(...comForma.map((g) => g.dia.fim as number));
  return { inicio, fim: Math.max(fimBruto, inicio + JANELA_MINIMA_MIN) };
}

/**
 * Onde um minuto cai dentro da janela, de 0 a 1.
 *
 * Presa aos limites: um momento fora da janela (não acontece com a
 * `janelaComum`, acontece com uma janela fixa) desenhava-se fora da régua e
 * saía do cartão.
 */
export function fracaoNaJanela(minuto: number, janela: JanelaDoDia): number {
  const largura = janela.fim - janela.inicio;
  if (largura <= 0) return 0;
  return Math.min(1, Math.max(0, (minuto - janela.inicio) / largura));
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CARRIS — É ASSIM QUE UMA SOBREPOSIÇÃO SE VÊ EM VEZ DE SE LER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Numa régua horizontal, dois momentos que corram ao mesmo tempo ocupam o mesmo
 * intervalo de píxeis. Desenhados no mesmo carril, o segundo tapa o primeiro e
 * a régua MENTE: mostra um dia limpo onde há duas coisas em cima uma da outra.
 * Era exactamente o defeito que a régua existe para não ter — o pedido diz que
 * «os buracos e as sobreposições vêem-se na régua, não só num aviso de texto».
 *
 * A regra é a de qualquer calendário: cada bloco vai para o PRIMEIRO carril
 * onde já não bate em nada. Um dia sem sobreposições fica com um carril só (uma
 * fita fina); um dia com a montagem e o catering em paralelo abre um segundo,
 * e a altura da régua diz, sem uma palavra, que ali há duas coisas a acontecer.
 *
 * Guloso e por ordem de início — que é o algoritmo certo para intervalos e não
 * uma aproximação: com os blocos ordenados, o número de carris que ele usa é o
 * máximo de blocos simultâneos, que é o mínimo possível.
 *
 * Os momentos SEM hora ficam de fora: não têm sítio na régua, e inventar-lhes
 * um era desenhá-los às 00:00.
 */
export interface BlocoEmCarril {
  bloco: { inicio: number; fim: number; duracao: number; item: TimelineItem };
  carril: number;
}

export function emCarris(
  blocos: readonly {
    inicio: number;
    fim: number;
    duracao: number;
    temHora: boolean;
    item: TimelineItem;
  }[],
): { blocos: BlocoEmCarril[]; carris: number } {
  const comForma = blocos.filter((b) => b.temHora).sort((a, b) => a.inicio - b.inicio);
  /** Onde acaba o último bloco de cada carril. */
  const fins: number[] = [];
  const postos: BlocoEmCarril[] = [];

  for (const b of comForma) {
    // Um instante mede zero e caberia sempre no carril de cima, por cima do
    // bloco que o contém. Dá-se-lhe um minuto de largura só para esta decisão:
    // é o mesmo minuto que o `oQueVemASeguir` lhe dá para ele poder «estar a
    // decorrer», e é o que faz um brinde no meio do jantar abrir um carril em
    // vez de desaparecer dentro dele.
    const fimParaOCarril = b.duracao === 0 ? b.inicio + 1 : b.fim;
    let carril = fins.findIndex((fim) => fim <= b.inicio);
    if (carril === -1) {
      carril = fins.length;
      fins.push(fimParaOCarril);
    } else {
      fins[carril] = fimParaOCarril;
    }
    postos.push({ bloco: b, carril });
  }

  return { blocos: postos, carris: Math.max(1, fins.length) };
}

/**
 * Os vazios da régua — o tempo entre o fim de tudo o que já passou e o começo
 * do que vem a seguir.
 *
 * É a MESMA fronteira que o `analisarODia` usa para a `RelacaoAnterior` (o
 * ponto mais longe a que o dia chegou, e não o fim do último bloco lido), e tem
 * de ser: um vazio desenhado onde a prosa não nomeia nenhum é o ecrã a
 * discordar de si próprio sobre o mesmo intervalo.
 *
 * Só os vazios que valem a pena dizer (`BURACO_MINIMO_MIN`) e só os CERTOS — o
 * momento anterior tem duração, portanto sabe-se mesmo onde acaba. A régua não
 * afirma com píxeis o que a prosa se recusa a afirmar com palavras.
 */
export function vaziosDaRegua(dia: AnaliseDoDia): { inicio: number; fim: number }[] {
  const vazios: { inicio: number; fim: number }[] = [];
  for (const bloco of dia.blocos) {
    const antes = bloco.antes;
    if (!antes || antes.tipo !== "buraco") continue;
    if (antes.minutos < BURACO_MINIMO_MIN) continue;
    if (duracaoDe(antes.com) === 0) continue;
    vazios.push({ inicio: bloco.inicio - antes.minutos, fim: bloco.inicio });
  }
  return vazios;
}
