import type { TimelineItem } from "./types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FORMA DO DIA — o que uma lista de horas não consegue dizer
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O guião do dia era uma lista de instantes: oito horas, oito títulos. Uma
 * lista responde a «a que horas é a cerimónia?» e não responde à pergunta que
 * ela faz de facto, a olhar para o papel na véspera: **«isto cabe?»**
 *
 * Para caber é preciso que os momentos tenham COMPRIMENTO, e é isso que o
 * `duracao` do `TimelineItem` traz (a justificação da escolha está lá). Este
 * ficheiro é a aritmética que daí sai, e vive fora do componente de propósito:
 * são funções puras, sem React e sem relógio próprio, e por isso podem ser
 * postas à prova sem montar um ecrã.
 *
 * Três coisas se calculam aqui:
 *
 *   · **a forma** — onde cada momento começa e acaba, em minutos, na régua do
 *     dia (que não acaba à meia-noite);
 *   · **os choques e as sobreposições** — duas coisas ao mesmo tempo. Com o
 *     MESMO responsável é um erro que custa caro num dia de montagem; com
 *     responsáveis diferentes é informação, porque num evento há coisas que
 *     correm mesmo em paralelo;
 *   · **os buracos** — o tempo em que não está nada marcado. Três horas
 *     vazias entre a montagem e a recepção também são informação.
 */

/** Quanto tempo de nada é preciso para valer a pena dizê-lo. */
export const BURACO_MINIMO_MIN = 60;

/**
 * A hora, em minutos desde a meia-noite — ou `null` se não for uma hora.
 *
 * Sem a regra do dia que passa da meia-noite: é `minutosDe`, cru.
 */
export function minutosDe(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hora ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * ── A REGRA QUE JÁ CÁ ESTAVA, AGORA NUM SÍTIO SÓ ──────────────────────────
 *
 * Um dia de evento estende-se para lá da meia-noite: «02:00 Encerramento» é o
 * FIM, não o princípio. Horas antes das 05:00 contam como +24h para ordenarem
 * depois da noite, em vez de saltarem para o topo do guião.
 *
 * Estava escrita dentro do `EventTimeline.tsx` (chamava-se `timeRank`) e o
 * `export.ts` — o guião que se IMPRIME e se entrega à equipa na manhã do
 * evento — não a tinha: ordenava com `localeCompare`, portanto no papel o
 * encerramento das 02:00 aparecia em primeiro lugar. O ecrã e o papel diziam
 * coisas diferentes sobre o mesmo dia. Vive aqui para os dois a partilharem.
 *
 * Sem hora válida → fim da lista, para uma linha por preencher não se meter
 * no meio do dia.
 */
export function ordemNoDia(hora: string): number {
  const min = minutosDe(hora);
  if (min === null) return Number.MAX_SAFE_INTEGER;
  return min < 5 * 60 ? min + 24 * 60 : min;
}

/** O guião por ordem do dia. Não muda o original. */
export function ordenar<T extends { time: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => ordemNoDia(a.time) - ordemNoDia(b.time));
}

/**
 * A duração em minutos, saneada.
 *
 * Zero quer dizer «instante» — e é também o que sai de um guião gravado antes
 * de este campo existir. Números negativos, `NaN` e lixo vindo do servidor
 * caem no mesmo sítio: um momento sem duração é sempre legível; um momento com
 * duração de −90 min desenhava-se para cima.
 */
export function duracaoDe(item: Pick<TimelineItem, "duracao">): number {
  const d = item.duracao;
  if (typeof d !== "number" || !Number.isFinite(d) || d <= 0) return 0;
  // Um dia inteiro é o tecto: mais do que isso é engano de dedo, não um momento.
  return Math.min(Math.round(d), 24 * 60);
}

/** Um momento colocado na régua do dia. */
export interface BlocoDoDia {
  item: TimelineItem;
  /** Minutos na régua do dia — pode passar de 1440 (a madrugada seguinte). */
  inicio: number;
  /** Minutos. Zero = instante, sem duração marcada. */
  duracao: number;
  /** `inicio + duracao`. Num instante é igual ao início. */
  fim: number;
  /** Falso quando a hora não é legível — o momento fica no fim e sem forma. */
  temHora: boolean;
  /**
   * O que há entre este bloco e tudo o que vem antes dele. `null` no primeiro.
   * Ver `RelacaoAnterior` — é isto que a vista desenha como banda.
   */
  antes: RelacaoAnterior | null;
}

/**
 * ── O QUE HÁ ENTRE UM MOMENTO E O ANTERIOR ────────────────────────────────
 *
 * Não é a diferença para o momento imediatamente acima: é a diferença para o
 * ponto onde TUDO o que vem antes já acabou. Com uma montagem das 08:00 às
 * 13:00 e uma chegada de fornecedores às 12:00, o que interessa dizer da
 * recepção das 16:00 é que há 3 h livres depois da montagem — e não 4 h
 * depois da chegada, que seria falso.
 *
 *   · `buraco`      — sobra tempo por marcar;
 *   · `sobreposicao`— começa antes de o anterior acabar;
 *   · `encosta`     — começa exactamente quando o anterior acaba.
 */
export interface RelacaoAnterior {
  tipo: "buraco" | "sobreposicao" | "encosta";
  /** Minutos de buraco ou de sobreposição. Zero em `encosta`. */
  minutos: number;
  /** O momento que chega mais longe antes deste — o que define a fronteira. */
  com: TimelineItem;
}

/** Duas coisas ao mesmo tempo. */
export interface Cruzamento {
  a: TimelineItem;
  b: TimelineItem;
  /** Minutos em que as duas correm em cima uma da outra. */
  minutos: number;
  /**
   * O mesmo responsável nas duas. É esta a linha entre «informação» e «erro»:
   * num evento há coisas que correm mesmo em paralelo (o catering a montar
   * enquanto a decoração acaba), mas ninguém está em dois sítios ao mesmo
   * tempo.
   */
  mesmoResponsavel: boolean;
  /** O nome do responsável tal como ela o escreveu, para a frase o poder usar. */
  responsavel?: string;
}

/** Tempo por marcar entre duas coisas. */
export interface Buraco {
  /** O que acaba antes do vazio. */
  depoisDe: TimelineItem;
  /** O que começa depois do vazio. */
  antesDe: TimelineItem;
  minutos: number;
  /**
   * O momento anterior não tem duração marcada, portanto este «buraco» pode
   * não ser buraco nenhum — pode ser a montagem a decorrer sem ninguém lhe ter
   * dito quanto tempo leva. Muda a frase: em vez de «não está nada marcado»,
   * «se a montagem leva este tempo todo, marca-lhe a duração».
   */
  anteriorSemDuracao: boolean;
}

export interface AnaliseDoDia {
  blocos: BlocoDoDia[];
  /** Sobreposições com responsáveis diferentes — informação. */
  sobreposicoes: Cruzamento[];
  /** Sobreposições com o MESMO responsável — erro. */
  choques: Cruzamento[];
  buracos: Buraco[];
  /** O princípio do primeiro momento com hora, em minutos. `null` num guião vazio. */
  inicio: number | null;
  /** O fim do último. */
  fim: number | null;
  /** Minutos entre o princípio e o fim, contando os buracos. */
  amplitude: number;
  /** Minutos efectivamente ocupados, sem contar duas vezes o que se sobrepõe. */
  ocupado: number;
}

/**
 * O responsável, comparável: sem espaços à volta, sem maiúsculas e sem
 * acentos. «Rita», «rita » e «RITA» são a mesma pessoa, e um choque que não
 * se detecta por causa de um acento é um choque que chega ao dia do evento.
 *
 * ── PORQUE É QUE ISTO DEIXOU DE SER PRIVADO ───────────────────────────────
 *
 * Passou a haver um segundo sítio a agrupar pessoas: a grelha do dia
 * (`colunasPorResponsavel`, em `guioes.ts`) põe uma COLUNA por responsável. Se
 * ela usasse o `owner` em cru, «Ana» e «ana » abriam duas colunas — e o motor,
 * que compara por esta chave, dizia ao mesmo tempo que era a mesma pessoa em
 * dois sítios ao mesmo tempo. Duas partes do mesmo ecrã a discordar sobre
 * quantas pessoas há no dia.
 *
 * A regra de comparação é UMA e vive aqui, com o resto da aritmética do dia.
 * Exportá-la é mais barato do que a segunda cópia que a alternativa obrigava a
 * escrever.
 */
export function chaveDoResponsavel(owner?: string): string {
  return (owner ?? "")
    .trim()
    .toLocaleLowerCase("pt-PT")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * A forma do dia inteira, de uma vez.
 *
 * ── PORQUE É QUE OS CRUZAMENTOS SÃO PARES E AS BANDAS SÃO VIZINHOS ────────
 *
 * São duas perguntas diferentes e merecem duas contas diferentes:
 *
 *   · a FRASE tem de nomear as duas coisas que se cruzam, mesmo que estejam
 *     longe uma da outra na lista (uma montagem de oito horas cruza-se com
 *     tudo o que lhe cai dentro). Por isso os cruzamentos são todos os pares;
 *   · o DESENHO só pode marcar o espaço entre dois blocos consecutivos, que é
 *     o único sítio onde há espaço para o marcar. Por isso a `RelacaoAnterior`
 *     olha para a fronteira do que já passou.
 *
 * Os pares são O(n²) e é de propósito: um guião com quinhentos momentos — o
 * tecto que a validação impõe — dá 125 000 comparações, que num telemóvel são
 * menos de um milissegundo. Um índice por intervalos aqui era complexidade a
 * pagar por um problema que não existe.
 */
export function analisarODia(items: readonly TimelineItem[]): AnaliseDoDia {
  const porOrdem = ordenar(items);
  const blocos: BlocoDoDia[] = [];

  let fronteira: { fim: number; item: TimelineItem } | null = null;
  for (const item of porOrdem) {
    const min = minutosDe(item.time);
    const temHora = min !== null;
    const inicio = temHora ? ordemNoDia(item.time) : 0;
    const duracao = temHora ? duracaoDe(item) : 0;
    const fim = inicio + duracao;

    let antes: RelacaoAnterior | null = null;
    if (temHora && fronteira) {
      const delta = inicio - fronteira.fim;
      antes = {
        tipo: delta > 0 ? "buraco" : delta < 0 ? "sobreposicao" : "encosta",
        minutos: Math.abs(delta),
        com: fronteira.item,
      };
    }

    blocos.push({ item, inicio, duracao, fim, temHora, antes });

    // A fronteira é o ponto mais longe a que o dia já chegou — e não o fim do
    // último bloco lido. Sem isto, um momento curto a seguir a uma montagem de
    // oito horas «fechava» o dia às 09:15 e tudo o que vinha depois parecia um
    // buraco enorme.
    if (temHora && (!fronteira || fim > fronteira.fim)) fronteira = { fim, item };
  }

  const comForma = blocos.filter((b) => b.temHora);

  const sobreposicoes: Cruzamento[] = [];
  const choques: Cruzamento[] = [];
  for (let i = 0; i < comForma.length; i++) {
    for (let j = i + 1; j < comForma.length; j++) {
      const a = comForma[i];
      const b = comForma[j];
      const minutos = Math.min(a.fim, b.fim) - Math.max(a.inicio, b.inicio);
      /**
       * ── ZERO MINUTOS NÃO É UMA SOBREPOSIÇÃO, E É ISSO QUE CALA UM GUIÃO
       *    DO MODELO ANTIGO ────────────────────────────────────────────────
       *
       * Aqui esteve uma segunda guarda escrita à mão — «um INSTANTE não se
       * sobrepõe a nada» — e um controlo negativo mostrou que era LETRA MORTA:
       * apaguei-a e os cinquenta testes passaram na mesma. A razão é
       * aritmética e vale a pena estar escrita, porque é ela que garante a
       * compatibilidade e não uma linha defensiva:
       *
       *   um instante tem `fim === inicio`, portanto o seu intervalo é um
       *   ponto. A intersecção de um ponto com qualquer intervalo — mesmo com
       *   um que o contenha — mede exactamente ZERO minutos.
       *
       * Ou seja: dois momentos sem duração declarada, à mesma hora e com a
       * mesma pessoa, dão zero; e um instante dentro de uma montagem de quatro
       * horas também dá zero. É esta linha, e só ela, que faz um guião gravado
       * antes de existirem durações abrir CALADO — sem um único choque
       * inventado a partir de silêncio.
       *
       * `<= 0` e não `< 0`: com `< 0` aqueles zeros passavam a contar como
       * sobreposições de zero minutos, e o ecrã acusava a Rita de estar em dois
       * sítios ao mesmo tempo num guião onde ninguém declarou tempo nenhum.
       */
      if (minutos <= 0) continue;
      const chaveA = chaveDoResponsavel(a.item.owner);
      const chaveB = chaveDoResponsavel(b.item.owner);
      const mesmoResponsavel = chaveA !== "" && chaveA === chaveB;
      const cruzamento: Cruzamento = {
        a: a.item,
        b: b.item,
        minutos,
        mesmoResponsavel,
        responsavel: mesmoResponsavel ? a.item.owner?.trim() : undefined,
      };
      (mesmoResponsavel ? choques : sobreposicoes).push(cruzamento);
    }
  }

  const buracos: Buraco[] = [];
  for (const bloco of comForma) {
    const antes = bloco.antes;
    if (!antes || antes.tipo !== "buraco" || antes.minutos < BURACO_MINIMO_MIN) continue;
    buracos.push({
      depoisDe: antes.com,
      antesDe: bloco.item,
      minutos: antes.minutos,
      anteriorSemDuracao: duracaoDe(antes.com) === 0,
    });
  }

  const inicio = comForma.length ? comForma[0].inicio : null;
  const fim = comForma.length ? Math.max(...comForma.map((b) => b.fim)) : null;

  // O tempo ocupado é a UNIÃO dos intervalos, e não a soma das durações: com
  // duas coisas a correr em paralelo, somar dava um dia mais cheio do que o
  // dia tem, e a resposta a «isto cabe?» ficava errada por excesso.
  let ocupado = 0;
  let cursor = -Infinity;
  for (const b of comForma) {
    if (b.fim <= cursor) continue;
    ocupado += b.fim - Math.max(b.inicio, cursor);
    cursor = b.fim;
  }

  return {
    blocos,
    sobreposicoes,
    choques,
    buracos,
    inicio,
    fim,
    amplitude: inicio !== null && fim !== null ? fim - inicio : 0,
    ocupado,
  };
}

/**
 * Minutos escritos como ela os diz: «45 min», «1 h», «1 h 30», «3 h».
 *
 * Sem zeros à esquerda e sem «0 h 45» — a frase é para ser lida de relance, a
 * um braço de distância, e cada caracter a mais é um caracter a decifrar.
 */
export function porExtenso(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  const horas = Math.floor(m / 60);
  const resto = m % 60;
  if (horas === 0) return `${resto} min`;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${String(resto).padStart(2, "0")}`;
}

/** A hora de fim de um bloco, escrita — «11:00», e «01:30» na madrugada. */
export function horaDoMinuto(minutos: number): string {
  const m = ((Math.round(minutos) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «O QUE É QUE VEM A SEGUIR?»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pergunta que ela faz de pé, numa quinta, com as mãos ocupadas. Tem de ter
 * resposta num relance e sem tocar em nada — logo, tem de ser CALCULADA e não
 * procurada com o dedo numa lista de vinte linhas.
 */
export interface OQueVemASeguir {
  /** O que está a decorrer agora. Vários, quando há coisas em paralelo. */
  agora: BlocoDoDia[];
  /** O próximo a começar. `null` quando o dia acabou. */
  aSeguir: BlocoDoDia | null;
  /** Minutos até o `aSeguir` começar. */
  faltam: number;
  /** O dia já passou inteiro. */
  terminado: boolean;
}

/**
 * O relógio na régua do dia — a mesma régua dos blocos.
 *
 * As 02:30 da madrugada seguinte são o minuto 1590 deste dia e não o minuto
 * 150 do dia a seguir: é a mesma regra das 05:00 que ordena o encerramento, e
 * tem de ser a mesma, senão à uma da manhã o «a seguir» saltava para a
 * montagem da manhã anterior.
 */
export function agoraNaRegua(agora: Date): number {
  const min = agora.getHours() * 60 + agora.getMinutes();
  return min < 5 * 60 ? min + 24 * 60 : min;
}

/**
 * Se o guião está a correr AGORA — e é isto que decide se o ecrã mostra um
 * relógio ou não.
 *
 * `dataDoEvento` é «aaaa-mm-dd». É verdade no dia do evento e ainda na
 * madrugada seguinte antes das 05:00, porque é exactamente aí que o guião
 * ainda está a ser usado: o encerramento das 02:00 é o último momento do
 * guião, e ninguém quer que o ecrã se apague à meia-noite, a meio da festa.
 *
 * Fora disso não se mostra relógio nenhum: um «AGORA» a apontar para uma hora
 * de um dia que não é o do evento é pior do que não haver «AGORA» — parece
 * informação e é ruído.
 */
export function estaNoDia(dataDoEvento: string | undefined, agora: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataDoEvento ?? "")) return false;
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  if (dataDoEvento === hoje) return true;
  if (agora.getHours() >= 5) return false;
  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  const diaAnterior = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, "0")}-${String(ontem.getDate()).padStart(2, "0")}`;
  return dataDoEvento === diaAnterior;
}

/** O que está a decorrer e o que vem a seguir, a esta hora. */
export function oQueVemASeguir(blocos: readonly BlocoDoDia[], minutoAgora: number): OQueVemASeguir {
  const comForma = blocos.filter((b) => b.temHora);
  // Um instante «decorre» durante o minuto em que acontece — senão a cerimónia
  // das 17:00 sem duração marcada nunca aparecia como o que está a acontecer,
  // que é precisamente quando ela olha para o ecrã.
  const agora = comForma.filter(
    (b) => minutoAgora >= b.inicio && minutoAgora < b.fim + (b.duracao === 0 ? 1 : 0),
  );
  const aSeguir = comForma.find((b) => b.inicio > minutoAgora) ?? null;
  return {
    agora,
    aSeguir,
    faltam: aSeguir ? aSeguir.inicio - minutoAgora : 0,
    terminado: comForma.length > 0 && !aSeguir && agora.length === 0,
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS DURAÇÕES QUE SE ESCOLHEM COM UM POLEGAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma lista fechada, e não uma caixa de escrever minutos. Ela está de pé, numa
 * quinta, com as mãos ocupadas: escrever «45» num campo numérico são três
 * toques, um teclado a tapar meio ecrã e a hipótese de escrever 450. Escolher
 * de uma lista é um toque.
 *
 * Os degraus são os do ofício — um quarto de hora, meia hora, três quartos,
 * hora a hora até às quatro, e depois os saltos grandes da montagem e da
 * desmontagem. Uma duração fora desta lista (vinda de outro sítio, ou de um
 * guião gravado noutro dia) NÃO se perde: entra na lista como opção própria,
 * ver `opcoesDeDuracao`.
 *
 * ── PORQUE É QUE ISTO SE MUDOU DO COMPONENTE PARA AQUI ────────────────────
 *
 * Estava dentro do `EventTimeline.tsx`, e enquanto ele foi o único sítio onde
 * se editava um guião isso estava certo. Deixou de ser: a vista «Guiões do
 * dia» acrescenta momentos a um guião também, e uma segunda lista de degraus
 * escrita ao lado da primeira é a maneira de, daqui a seis meses, o guião do
 * dossier oferecer «90 min» e o da vista de topo não. Os degraus são uma
 * decisão do ofício, não do componente — vivem com o resto da aritmética do
 * dia.
 */
export const DEGRAUS_DE_DURACAO = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480] as const;

/** O valor da opção «Sem duração» — um instante, um marco sem comprimento. */
export const SEM_DURACAO = "0";

/** Uma opção de duração, na forma que o `ui/Escolha` recebe. */
export interface OpcaoDeDuracao {
  valor: string;
  rotulo: string;
}

/**
 * Os degraus mais a duração ACTUAL, quando ela não é um degrau.
 *
 * Sem essa segunda metade, um momento gravado com 75 min — importado, ou
 * escrito quando a lista era outra — abria com uma lista onde ele não estava, e
 * o primeiro toque em qualquer opção trocava-o sem que ninguém o tivesse
 * pedido.
 */
export function opcoesDeDuracao(atual: number): OpcaoDeDuracao[] {
  const degraus: number[] = [...DEGRAUS_DE_DURACAO];
  if (atual > 0 && !degraus.includes(atual)) degraus.push(atual);
  degraus.sort((a, b) => a - b);
  return [
    { valor: SEM_DURACAO, rotulo: "Sem duração" },
    ...degraus.map((m) => ({ valor: String(m), rotulo: porExtenso(m) })),
  ];
}
