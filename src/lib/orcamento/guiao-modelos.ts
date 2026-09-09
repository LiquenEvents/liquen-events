import type { TimelineItem } from "./types";
import { duracaoDe, minutosDe, ordenar } from "./guiao-do-dia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MODELOS DE GUIÃO — ELA FAZ O MESMO DIA VINTE VEZES POR ANO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um guião do dia de um casamento de tarde é, momento a momento, quase igual
 * ao do casamento de tarde anterior: montagem de manhã, fornecedores ao meio-
 * dia, cerimónia ao fim da tarde, jantar, festa, desmontagem de madrugada. O
 * que muda são as horas exactas e os nomes de quem faz o quê.
 *
 * Sem modelos, cada evento novo obriga a escrever oito momentos e oito
 * durações à mão — que é precisamente o trabalho que ninguém faz, e é por isso
 * que a maior parte dos guiões nasce e morre vazia. É esta a diferença entre um
 * formulário e uma ferramenta.
 *
 * ── PORQUE É QUE UM MODELO GUARDA HORAS E NÃO DESVIOS ─────────────────────
 *
 * A alternativa óbvia era guardar «montagem: T−8h», «cerimónia: T+0», e depois
 * ancorar tudo à hora da cerimónia do evento novo. Foi recusada, por duas
 * razões medidas neste domínio:
 *
 *  1. **Ela pensa em horas de relógio, não em desvios.** «A cerimónia é às
 *     cinco» é a frase; «a montagem é oito horas antes da cerimónia» não é. Um
 *     modelo que guarde desvios obriga a escolher uma âncora — qual dos oito
 *     momentos é o T+0? — e essa escolha não existe no ofício.
 *
 *  2. **A régua do dia já tem uma adivinhação, e uma chega.** Uma hora antes
 *     das 05:00 vale +24h (ver `ordemNoDia`), porque o encerramento das 02:00 é
 *     o FIM do dia. Com desvios, aplicar um modelo teria de refazer essa conta
 *     ao contrário para decidir se «−7h» a partir das 02:00 cai nas 19:00 do
 *     mesmo dia ou do anterior. Com horas absolutas não há segunda
 *     adivinhação: o modelo diz «02:00» e o motor já sabe o que isso quer
 *     dizer.
 *
 * O custo, dito com todas as letras: um casamento cuja cerimónia é às 16:00 e
 * não às 17:00 obriga a corrigir as horas depois de aplicar o modelo. É um
 * toque por momento numa lista fechada, contra oito momentos escritos de raiz —
 * e as durações, que são a parte que dá FORMA ao dia, já vêm certas.
 */

/** Um momento de modelo é um momento do guião sem identidade própria. */
export type MomentoDeModelo = Omit<TimelineItem, "id">;

export interface ModeloDeGuiao {
  id: string;
  /** O nome por que ela o encontra outra vez. */
  nome: string;
  /** Uma linha a dizer para que serve — é o que se lê ANTES de escolher. */
  descricao?: string;
  /**
   * Um modelo da casa não se apaga: vem com o produto, é igual em todas as
   * instalações e não é dela para o poder perder. Os que ela guarda não têm
   * esta marca e têm o × que os tira.
   */
  daCasa?: boolean;
  criadoEm?: string;
  /** De que evento saiu, para a lista poder dizer «a partir do casamento de …». */
  origem?: string;
  momentos: MomentoDeModelo[];
}

/**
 * O tecto de momentos de um modelo.
 *
 * O guião em si aceita 500 (`validation.ts`) porque é o que cabe num dia com
 * fornecedores todos declarados. Um MODELO é outra coisa: é o esqueleto que se
 * repete, e um esqueleto de duzentas linhas não é um esqueleto. O tecto existe
 * porque tudo isto vive numa linha de `app_state` que é lida por inteiro.
 */
export const MAX_MOMENTOS_DE_MODELO = 200;

/**
 * ── O CRONOGRAMA-BASE, COM AS DURAÇÕES E COM O BURACO DE PROPÓSITO ────────
 *
 * As durações não são enfeite: são o que faz o cronograma-base ter FORMA logo à
 * nascença. Sem elas, gerar o cronograma dava oito instantes e a pergunta «isto
 * cabe?» continuava sem resposta até ela preencher oito durações à mão — que é
 * exactamente o trabalho que ninguém faz.
 *
 * O buraco das 13:00 às 16:00 é REAL e fica de propósito: é o tempo morto entre
 * a montagem acabada e os convidados a chegar. O ecrã diz que ele existe; ela
 * decide se está certo. Um modelo que escondesse o vazio ensinava-a a não
 * acreditar no que o ecrã marca a tracejado.
 *
 * Estava escrito dentro do `EventTimeline.tsx` com o nome `TEMPLATE`. Mudou-se
 * para aqui inteiro, momento a momento e minuto a minuto — o botão «Gerar
 * cronograma-base» produz exactamente o que produzia — porque um modelo do
 * produto e o cronograma-base do botão são a mesma coisa com dois nomes, e
 * duas cópias divergem no dia em que alguém afinar uma delas.
 */
export const MODELOS_DA_CASA: readonly ModeloDeGuiao[] = [
  {
    id: "casamento-de-tarde",
    nome: "Casamento de tarde",
    descricao: "Cerimónia ao fim da tarde, jantar e festa. O dia mais frequente da casa.",
    daCasa: true,
    momentos: [
      { time: "09:00", title: "Montagem e decoração do espaço", duracao: 180 },
      { time: "12:00", title: "Chegada de fornecedores (catering, som)", duracao: 60 },
      { time: "16:00", title: "Receção dos convidados", duracao: 60 },
      { time: "17:00", title: "Cerimónia", duracao: 45 },
      { time: "18:30", title: "Cocktail de boas-vindas", duracao: 90 },
      { time: "20:00", title: "Jantar", duracao: 180 },
      { time: "23:00", title: "Festa / momento de dança", duracao: 180 },
      { time: "02:00", title: "Encerramento e desmontagem", duracao: 120 },
    ],
  },
  {
    id: "corporativo",
    nome: "Evento corporativo",
    descricao: "Um dia de trabalho: montagem à noite, sessões, almoço e desmontagem à tarde.",
    daCasa: true,
    momentos: [
      { time: "07:00", title: "Montagem de sala e cenografia", duracao: 120 },
      { time: "09:00", title: "Testes de som, luz e projeção", duracao: 60 },
      { time: "10:00", title: "Receção e credenciação", duracao: 60 },
      { time: "11:00", title: "Sessão de abertura", duracao: 90 },
      { time: "12:30", title: "Coffee break", duracao: 30 },
      { time: "13:00", title: "Almoço", duracao: 90 },
      { time: "14:30", title: "Sessões da tarde", duracao: 180 },
      { time: "17:30", title: "Encerramento e networking", duracao: 60 },
      { time: "18:30", title: "Desmontagem", duracao: 120 },
    ],
  },
  {
    id: "batizado",
    nome: "Batizado",
    descricao: "Cerimónia religiosa de manhã e almoço. Acaba a horas de haver luz.",
    daCasa: true,
    momentos: [
      { time: "08:30", title: "Montagem e decoração do espaço", duracao: 150 },
      { time: "11:00", title: "Chegada de fornecedores (catering, bolo)", duracao: 60 },
      { time: "12:00", title: "Cerimónia na igreja", duracao: 60 },
      { time: "13:00", title: "Receção dos convidados", duracao: 45 },
      { time: "13:45", title: "Almoço", duracao: 150 },
      { time: "16:15", title: "Bolo e brinde", duracao: 45 },
      { time: "18:00", title: "Desmontagem", duracao: 90 },
    ],
  },
];

/**
 * O modelo com que um guião vazio nasce quando ela carrega no botão.
 *
 * É o primeiro da lista e não uma quarta cópia: o «Gerar cronograma-base» do
 * dossier e o «Casamento de tarde» da vista de topo põem os MESMOS oito
 * momentos no guião, e é isso que se quer — o botão é um atalho para o modelo
 * mais usado, não um segundo cronograma com vida própria.
 */
export const CRONOGRAMA_BASE: readonly MomentoDeModelo[] = MODELOS_DA_CASA[0].momentos;

/**
 * Os momentos de um modelo, prontos a entrar num guião.
 *
 * Os ids nascem AQUI e não dentro do gesto de gravação: um gesto travado por um
 * 409 é reaplicado por cima da versão que veio do servidor (ver o `persist` do
 * `EventTimeline`), e reaplicá-lo tem de pôr os MESMOS momentos, não uma
 * segunda cópia com ids novos.
 */
export function momentosDoModelo(
  modelo: Pick<ModeloDeGuiao, "momentos">,
  novoId: () => string,
): TimelineItem[] {
  return modelo.momentos.map((m) => ({ ...m, id: novoId() }));
}

/**
 * O guião que está no ecrã, transformado em modelo.
 *
 * Três coisas saem, e cada uma por uma razão:
 *
 *  · **os ids**, porque são a identidade daquele momento naquele evento e não
 *    fazem sentido noutro dia;
 *  · **os momentos sem hora ou sem título**, porque uma linha por preencher
 *    num guião é trabalho a meio, e num modelo seria trabalho a meio repetido
 *    vinte vezes;
 *  · **os responsáveis**, e esta é a que custa explicar. Um modelo é a FORMA do
 *    dia; «Rita» não é a forma de nada. Guardar o responsável fazia com que
 *    aplicar «Casamento de tarde» a um evento onde a Rita não trabalha
 *    inventasse choques com o nome dela — o motor compara responsáveis para
 *    dizer quem está em dois sítios ao mesmo tempo (ver `analisarODia`), e um
 *    nome herdado de outro evento é um choque a mais e uma pessoa a menos.
 *
 * Fica ordenado pela régua do dia, para o modelo se ler pela mesma ordem por
 * que o dia acontece.
 */
export function modeloAPartirDoGuiao(items: readonly TimelineItem[]): MomentoDeModelo[] {
  return ordenar(items)
    .filter((i) => minutosDe(i.time) !== null && i.title.trim() !== "")
    .slice(0, MAX_MOMENTOS_DE_MODELO)
    .map((i) => {
      const duracao = duracaoDe(i);
      return {
        time: i.time,
        title: i.title.trim(),
        // A chave SAI quando não há duração, e não fica a zero: um guião sem
        // durações tem de voltar a ser exactamente um guião sem durações.
        ...(duracao > 0 ? { duracao } : {}),
      };
    });
}

/**
 * Descarta o que não tem a forma de um momento de modelo.
 *
 * Isto vem de uma linha de `app_state` — JSON escrito por uma versão anterior,
 * ou por uma restauração de cópia de segurança. Confiar nele era deixar um
 * `title: null` chegar ao ecrã e derrubar a vista inteira no limite de erro.
 */
export function saoMomentosDeModelo(v: unknown): MomentoDeModelo[] {
  if (!Array.isArray(v)) return [];
  const limpos: MomentoDeModelo[] = [];
  for (const m of v) {
    if (!m || typeof m !== "object") continue;
    const bruto = m as Record<string, unknown>;
    const time = typeof bruto.time === "string" ? bruto.time.trim() : "";
    const title = typeof bruto.title === "string" ? bruto.title.trim() : "";
    if (!time || !title) continue;
    const duracao = typeof bruto.duracao === "number" ? duracaoDe({ duracao: bruto.duracao }) : 0;
    limpos.push({
      time: time.slice(0, 20),
      title: title.slice(0, 300),
      ...(duracao > 0 ? { duracao } : {}),
    });
    if (limpos.length >= MAX_MOMENTOS_DE_MODELO) break;
  }
  return limpos;
}

/** A mesma varredura, para uma lista inteira de modelos. */
export function saoModelosDeGuiao(v: unknown): ModeloDeGuiao[] {
  if (!Array.isArray(v)) return [];
  const modelos: ModeloDeGuiao[] = [];
  for (const m of v) {
    if (!m || typeof m !== "object") continue;
    const bruto = m as Record<string, unknown>;
    const id = typeof bruto.id === "string" ? bruto.id : "";
    const nome = typeof bruto.nome === "string" ? bruto.nome.trim() : "";
    if (!id || !nome) continue;
    const momentos = saoMomentosDeModelo(bruto.momentos);
    // Um modelo vazio aparecia na lista e não fazia nada ao ser escolhido —
    // pior do que não existir, porque se lê como uma avaria do botão.
    if (momentos.length === 0) continue;
    modelos.push({
      id,
      nome: nome.slice(0, 80),
      momentos,
      ...(typeof bruto.criadoEm === "string" ? { criadoEm: bruto.criadoEm } : {}),
      ...(typeof bruto.origem === "string" ? { origem: bruto.origem.slice(0, 120) } : {}),
    });
  }
  return modelos;
}
