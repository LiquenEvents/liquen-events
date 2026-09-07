"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { randomId } from "./util";
import { useToast } from "./Toast";
import { printRunSheet } from "./export";
import type { Quote, TimelineItem } from "@/lib/orcamento/types";
import {
  agoraNaRegua,
  analisarODia,
  BURACO_MINIMO_MIN,
  duracaoDe,
  estaNoDia,
  horaDoMinuto,
  oQueVemASeguir,
  ordenar,
  porExtenso,
  type BlocoDoDia,
} from "@/lib/orcamento/guiao-do-dia";
import { Button, Escolha, Field, EmptyState } from "./ui";
import { DesistirDaEdicao } from "./ui/DesistirDaEdicao";
import { ESTADO, PRESSAO, PROGRESSO } from "./ui/movimento";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

interface Props {
  quote: Quote;
  onChange: (items: TimelineItem[]) => void;
}

/**
 * Sensible starting run sheet for a typical event day.
 *
 * As durações não são enfeite: são o que faz o cronograma-base ter FORMA logo
 * à nascença. Sem elas, gerar o cronograma dava outra vez oito instantes e a
 * pergunta «isto cabe?» continuava sem resposta até ela preencher oito
 * durações à mão — que é exactamente o trabalho que ninguém faz.
 *
 * O buraco das 13:00 às 16:00 é REAL e fica de propósito: é o tempo morto
 * entre a montagem acabada e os convidados a chegar. O ecrã diz que ele
 * existe; ela decide se está certo.
 */
const TEMPLATE: Omit<TimelineItem, "id">[] = [
  { time: "09:00", title: "Montagem e decoração do espaço", duracao: 180 },
  { time: "12:00", title: "Chegada de fornecedores (catering, som)", duracao: 60 },
  { time: "16:00", title: "Receção dos convidados", duracao: 60 },
  { time: "17:00", title: "Cerimónia", duracao: 45 },
  { time: "18:30", title: "Cocktail de boas-vindas", duracao: 90 },
  { time: "20:00", title: "Jantar", duracao: 180 },
  { time: "23:00", title: "Festa / momento de dança", duracao: 180 },
  { time: "02:00", title: "Encerramento e desmontagem", duracao: 120 },
];

/**
 * ── AS DURAÇÕES QUE SE ESCOLHEM COM UM POLEGAR ─────────────────────────────
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
 */
const DEGRAUS_DE_DURACAO = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480] as const;

const SEM_DURACAO = "0";

function opcoesDeDuracao(atual: number) {
  const degraus: number[] = [...DEGRAUS_DE_DURACAO];
  if (atual > 0 && !degraus.includes(atual)) degraus.push(atual);
  degraus.sort((a, b) => a - b);
  return [
    { valor: SEM_DURACAO, rotulo: "Sem duração" },
    ...degraus.map((m) => ({ valor: String(m), rotulo: porExtenso(m) })),
  ];
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A RÉGUA: QUANTOS PÍXEIS VALE UM MINUTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 0,7 px por minuto. A conta: um dia de evento típico vai das 09:00 às 04:00 —
 * dezanove horas, 1140 minutos, ~800 px de altura. São dois ecrãs de telemóvel
 * a rolar com o polegar, que é o gesto que ela já faz; a quatro vezes menos
 * cabia num ecrã e não se distinguia nada, a quatro vezes mais eram oito ecrãs
 * para ver um dia.
 *
 * ── E O CHÃO DE 44 PX, QUE QUEBRA A PROPORÇÃO DE PROPÓSITO ────────────────
 *
 * Abaixo de ~63 minutos todos os blocos medem 44 px — o mínimo em que ainda se
 * toca com o polegar, que é a regra principal desta casa num ecrã onde se
 * trabalha de pé. Ou seja: entre um momento de 30 min e um de 60 a proporção
 * não se lê. É uma escolha, e não um descuido: a proporção existe para
 * responder a «isto cabe?», e essa pergunta joga-se entre a montagem de quatro
 * horas e a cerimónia de quarenta e cinco minutos — não entre trinta e sessenta
 * minutos. Onde os píxeis não chegam, o número está ESCRITO no bloco («45 min»),
 * portanto a informação exacta nunca depende de os medir a olho.
 *
 * `minHeight` e não `height`: um título comprido a 390 px ocupa três linhas, e
 * cortar o nome de um momento no guião do dia é pior do que esticar o bloco.
 */
const PX_POR_MINUTO = 0.7;
const ALTURA_MIN_BLOCO = 44;

/**
 * As bandas — o que há ENTRE dois blocos — têm chão e tecto.
 *
 * O chão (26 px) é para uma sobreposição de dez minutos se ver. O tecto (96 px)
 * é para um guião com um momento às 09:00 e o seguinte às 23:00 não abrir com
 * seiscentos píxeis de nada, que era rolar meio minuto às cegas. Acima do
 * tecto a proporção deixa de valer — e por isso a banda diz o número por
 * extenso lá dentro, que é a informação de que ela precisa.
 */
const ALTURA_MIN_BANDA = 26;
const ALTURA_MAX_BANDA = 96;

/** De quanto em quanto tempo o relógio do «agora» se actualiza. */
const PULSO_DO_RELOGIO_MS = 30_000;

// Um dia de evento estende-se para lá da meia-noite: "02:00 Encerramento" é o
// FIM, não o princípio. A regra vive agora em `guiao-do-dia.ts`, para o guião
// que se IMPRIME poder ordenar da mesma maneira — ver lá porquê.
function sortByTime(items: TimelineItem[]): TimelineItem[] {
  return ordenar(items);
}

type EditableField = "time" | "title" | "owner";

/**
 * Uma gravação que o servidor recusou por o guião ter mudado noutro sítio.
 *
 * Guarda-se o GESTO, não a lista que ele produziu: voltar a mandar a lista era
 * apagar o que a outra pessoa escreveu — exactamente o que o 409 existe para
 * impedir. O gesto volta a aplicar-se POR CIMA da versão adoptada, e ficam as
 * duas coisas: o momento que ela acrescentou e o que ele acrescentou.
 */
interface Colisao {
  /** O número da gravação que colidiu — é o que põe os gestos por ordem. */
  n: number;
  /** O gesto, nomeado: «acrescentar «19:30 Discursos» ao guião». */
  oQue: string;
  /** O mesmo gesto, para o repetir sobre a versão que veio do servidor. */
  reaplicar: (atuais: TimelineItem[]) => TimelineItem[];
}

export default function EventTimeline({ quote, onChange }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<TimelineItem[]>(quote.timeline ?? []);
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [duracaoNova, setDuracaoNova] = useState(SEM_DURACAO);
  // Edição inline de um campo de uma linha: commit em blur/Enter, Escape cancela.
  const [editing, setEditing] = useState<{ id: string; field: EditableField } | null>(null);
  const [draft, setDraft] = useState("");
  // A colisão fica no ECRÃ, e não num toast que desaparece: é onde o que ela
  // escreveu continua à vista e recuperável com um clique.
  const [colisoes, setColisoes] = useState<Colisao[]>([]);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * O RELÓGIO — E PORQUE É QUE ELE SÓ EXISTE NO DIA
   * ══════════════════════════════════════════════════════════════════════
   *
   * O «agora» só se mostra quando o guião está mesmo a correr: no dia do
   * evento, e ainda na madrugada seguinte antes das 05:00, porque o
   * encerramento das 02:00 é o último momento do guião e ninguém quer que o
   * ecrã se apague à meia-noite, a meio da festa (ver `estaNoDia`).
   *
   * Nos outros dias não há relógio nenhum. Um «AGORA» a apontar para as 14:32
   * de um dia que não é o do evento parece informação e é ruído — e o ruído,
   * neste ecrã, é o que a ensina a não confiar no que lá está.
   *
   * Trinta segundos de pulso: o que se mostra é «daqui a 25 min», e um minuto
   * de erro numa frase dessas é meio minuto de erro em média. Um `setInterval`
   * de trinta segundos custa, medido, nada — e pára quando o componente sai.
   */
  const [agora, setAgora] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), PULSO_DO_RELOGIO_MS);
    return () => clearInterval(t);
  }, []);
  const noDia = estaNoDia(quote.date, agora);

  /**
   * Otimista com reversão — mas a reversão é para o último estado que o SERVIDOR
   * confirmou, e só quando não há gravação mais recente.
   *
   * Guardar `items` antes do pedido e repô-lo no erro era guardar um instante
   * que já passou. Aqui não há confirmação nenhuma a separar dois cliques no ×,
   * e é assim que o guião se limpa: a correr a lista. O segundo PATCH leva o
   * guião INTEIRO (já sem o primeiro momento), portanto o servidor fica com os
   * dois apagados; a primeira remoção, ao falhar, repunha o instante anterior às
   * DUAS e devolvia ao ecrã um momento que já não existe — num guião que se
   * imprime e se entrega à equipa na manhã do evento.
   */
  const gravacoes = useRef(0);
  const gravado = useRef<TimelineItem[]>(quote.timeline ?? []);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * DE ONDE ESTE GUIÃO FOI COPIADO
   * ══════════════════════════════════════════════════════════════════════
   *
   * O guião é copiado UMA vez, ao montar, e ao gravar vai INTEIRO — logo a
   * gravação é «substitui o guião por este», e não «acrescenta este momento».
   *
   * O CENÁRIO, sem corrida nenhuma e com as duas gravações a responder 200:
   * ela abre o guião no telemóvel na véspera; ele, no portátil, acrescenta
   * «19:30 Discurso do pai»; ela corrige a hora da cerimónia à noite e manda o
   * guião que copiou de manhã — o discurso do pai desaparece. E este é o papel
   * que se imprime e se entrega à equipa na manhã do evento: o que não está
   * nele não acontece, e ninguém dá pela falta até ao dia.
   *
   * `base` é a versão de que este guião partiu. Vai no pedido, o servidor
   * compara-a com a que tem e recusa com 409 (ver `api/orcamento/[id]`).
   *
   * Avança ao ENVIAR e não ao confirmar: dois toques seguidos põem dois PATCH
   * no ar e o segundo já leva o primeiro lá dentro — declarar a versão de
   * antes do primeiro era inventar uma colisão dela consigo própria.
   */
  const base = useRef<TimelineItem[]>(quote.timeline ?? []);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * A GRAVAÇÃO, E UMA FRASE QUE DIZ O QUE ACONTECEU
   * ══════════════════════════════════════════════════════════════════════
   *
   * As seis acções deste painel passam por aqui, e todas falhavam com «Não foi
   * possível guardar o guião. Tenta novamente.» — a mesma frase para a rede em
   * baixo, a sessão expirada, o pedido apagado por outra pessoa e o servidor em
   * baixo. Nos dois do meio, repetir falha sempre.
   *
   * E o `oQue` nomeia o MOMENTO: a reversão desfaz uma linha de um guião com
   * uma dúzia delas, e sem o nome ninguém sabe qual é que voltou atrás.
   */
  function persist(oQue: string, reaplicar: (atuais: TimelineItem[]) => TimelineItem[]) {
    const sorted = sortByTime(reaplicar(items));
    const minha = ++gravacoes.current;
    setItems(sorted);
    onChange(sorted);
    const baseAnterior = base.current;
    base.current = sorted;

    // Desfaz o que foi posto no ecrã e diz porquê — a não ser que já haja uma
    // gravação mais recente: o que essa levar contém o que esta levava,
    // portanto não há nada a desfazer nem nada a dizer. Se ELA também falhar, é
    // ela que repõe — e para o mesmo sítio.
    const reporEDizer = (mensagem: string) => {
      if (minha !== gravacoes.current) return;
      // A base acompanha o que fica no ecrã: declarar uma versão que nunca
      // chegou a ser gravada dava um 409 inventado na gravação seguinte.
      base.current = gravado.current;
      setItems(gravado.current);
      onChange(gravado.current);
      toast(mensagem, "error");
    };

    void (async () => {
      let res: Response;
      try {
        res = await fetch(`/api/orcamento/${quote.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeline: sorted, base: { timeline: baseAnterior } }),
        });
      } catch {
        reporEDizer(porqueRebentou(oQue).mensagem);
        return;
      }
      /**
       * 409 não é «tenta outra vez»: é «isto mudou noutro sítio», e repetir a
       * mesma lista era apagar o que a outra pessoa escreveu. Adopta-se o que
       * o servidor tem — e o gesto dela fica guardado no aviso, para o poder
       * voltar a aplicar por cima dessa versão sem perder nem um lado nem o
       * outro. Por isso a frase não é a do `porqueFalhou`: aqui não se manda
       * recarregar nada, o guião já está em dia no ecrã.
       */
      if (res.status === 409) {
        const corpo = (await res.json().catch(() => null)) as {
          current?: { timeline?: TimelineItem[] };
        } | null;
        const doServidor = sortByTime(corpo?.current?.timeline ?? gravado.current);
        gravado.current = doServidor;
        base.current = doServidor;
        if (minha === gravacoes.current) {
          setItems(doServidor);
          onChange(doServidor);
        }
        // Dois gestos podem colidir os dois (dois toques dela enquanto a
        // outra pessoa gravava). Cada gesto é um DELTA, portanto o mais
        // recente não contém o anterior: guardam-se todos, por ordem de
        // envio, e reaplicam-se por essa ordem — senão o primeiro perdia-se
        // ao chegar o segundo, e as respostas nem sequer vêm por ordem.
        setColisoes((c) => [...c, { n: minha, oQue, reaplicar }].sort((a, b) => a.n - b.n));
        return;
      }
      if (!res.ok) {
        const corpo = await res.json().catch(() => null);
        reporEDizer(porqueFalhou(oQue, res, corpo).mensagem);
        return;
      }
      if (minha === gravacoes.current) gravado.current = sorted;
    })();
  }

  /**
   * Os gestos que o 409 travou, agora POR CIMA do guião que veio do servidor
   * — e pela ordem por que ela os fez, que é a única em que dão o mesmo
   * resultado. Uma gravação só: o que ela quis fica todo dentro dela.
   */
  function voltarAAplicar() {
    if (colisoes.length === 0) return;
    const gestos = colisoes;
    setColisoes([]);
    persist(gestos.map((g) => g.oQue).join(" e "), (atuais) =>
      gestos.reduce((lista: TimelineItem[], g) => g.reaplicar(lista), atuais),
    );
  }

  function seed() {
    // Os ids nascem AQUI e não dentro do gesto: se o cronograma-base tiver de
    // ser reaplicado depois de uma colisão, tem de ser o mesmo, e não uma
    // segunda cópia com ids novos. E acrescenta em vez de substituir — o botão
    // só aparece com o guião vazio, portanto no uso normal dá o mesmo, mas
    // reaplicá-lo por cima do guião de outra pessoa não o pode deitar fora.
    const novos = TEMPLATE.map((t) => ({ ...t, id: randomId() }));
    persist("gerar o cronograma-base", (atuais) => [
      ...atuais,
      ...novos.filter((n) => !atuais.some((a) => a.id === n.id)),
    ]);
  }
  function add() {
    const t = title.trim();
    if (!t || !time) return;
    const minutos = Number(duracaoNova);
    const momento: TimelineItem = {
      id: randomId(),
      time,
      title: t,
      owner: owner.trim() || undefined,
      // Sem duração escolhida o campo NÃO nasce: um `duracao: 0` gravado é
      // indistinguível de «sem duração» na leitura, mas engorda o guião com
      // uma chave por momento e faz um guião novo deixar de ser igual a um
      // guião antigo — que é a comparação que o 409 faz.
      ...(minutos > 0 ? { duracao: minutos } : {}),
    };
    persist(`acrescentar «${time} ${t}» ao guião`, (atuais) => [...atuais, momento]);
    setTime("");
    setTitle("");
    setOwner("");
    setDuracaoNova(SEM_DURACAO);
  }
  function remove(id: string) {
    const momento = items.find((i) => i.id === id);
    persist(
      `remover «${momento ? `${momento.time} ${momento.title}` : "o momento"}» do guião`,
      (atuais) => atuais.filter((i) => i.id !== id),
    );
  }

  function startEdit(id: string, field: EditableField, current: string) {
    setEditing({ id, field });
    setDraft(current);
  }
  function commitEdit() {
    if (!editing) return;
    const { id, field } = editing;
    setEditing(null); // fecha já — o blur que se segue não volta a fazer commit
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const v = draft.trim();
    if (field === "owner") {
      const next = v || undefined;
      if (next === item.owner) return;
      persist(`mudar o responsável de «${item.title}»`, (atuais) =>
        atuais.map((i) => (i.id === id ? { ...i, owner: next } : i)),
      );
      return;
    }
    // Hora/título vazios cancelam em vez de gravar uma linha inválida.
    if (!v || v === item[field]) return;
    persist(
      field === "time" ? `mudar a hora de «${item.title}»` : `mudar «${item.title}» para «${v}»`,
      (atuais) => atuais.map((i) => (i.id === id ? { ...i, [field]: v } : i)),
    );
  }
  function editKeys(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditing(null);
  }

  /**
   * A duração grava no TOQUE, e não em blur nem Enter.
   *
   * É o único campo que se escolhe de uma lista fechada, portanto não há
   * rascunho nenhum a proteger nem nada de que desistir: o valor escolhido é o
   * valor. Escolher e depois ter de confirmar era um toque a mais num ecrã
   * usado com uma mão só.
   */
  function commitDuracao(id: string, valor: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const minutos = Number(valor);
    const seguinte = Number.isFinite(minutos) && minutos > 0 ? Math.round(minutos) : undefined;
    if (duracaoDe(item) === (seguinte ?? 0)) return;
    persist(
      seguinte
        ? `mudar a duração de «${item.title}» para ${porExtenso(seguinte)}`
        : `tirar a duração de «${item.title}»`,
      (atuais) =>
        atuais.map((i) => {
          if (i.id !== id) return i;
          if (!seguinte) {
            // A chave SAI, e não fica a zero: um guião sem durações tem de
            // voltar a ser exactamente um guião sem durações.
            const { duracao: _fora, ...resto } = i;
            void _fora;
            return resto;
          }
          return { ...i, duracao: seguinte };
        }),
    );
  }

  // ── A FORMA DO DIA, CALCULADA ────────────────────────────────────────────
  // Puro, e por isso testado à parte em `guiao-do-dia.test.ts`. Aqui só se
  // desenha o que ele diz.
  const dia = useMemo(() => analisarODia(items), [items]);
  const minutoAgora = agoraNaRegua(agora);
  const seguinte = useMemo(
    () => (noDia ? oQueVemASeguir(dia.blocos, minutoAgora) : null),
    [noDia, dia.blocos, minutoAgora],
  );
  const idsAgora = new Set((seguinte?.agora ?? []).map((b) => b.item.id));
  // O «agora» caiu num vazio: marca-se a BANDA que vem antes do próximo, que é
  // o único sítio onde isso é verdade. Uma linha do «agora» a atravessar a
  // coluna inteira mentiria — a coluna tem chãos e tectos, não é uma régua
  // linear (ver `PX_POR_MINUTO`).
  const bandaComAgora =
    seguinte && seguinte.agora.length === 0 && seguinte.aSeguir ? seguinte.aSeguir.item.id : null;

  /**
   * ── UM BURACO SÓ SE AFIRMA QUANDO SE SABE ONDE O ANTERIOR ACABA ─────────
   *
   * Isto apareceu ao abrir um guião do modelo antigo com esta vista: sete
   * frases empilhadas, todas a dizer «X h entre A e B — se A leva este tempo
   * todo, marca-lhe a duração». Uma parede de texto sobre uma coisa que o ecrã
   * NÃO SABE: sem a duração da montagem, aquelas três horas tanto podem ser um
   * buraco como podem ser a montagem a decorrer. Afirmá-lo sete vezes é gritar
   * sobre o que se desconhece — e é assim que se ensina alguém a não ler os
   * avisos.
   *
   * Fica então: a prosa nomeia só os buracos CERTOS (o momento anterior tem
   * duração, portanto sabe-se mesmo onde acaba). Os incertos não desaparecem —
   * são cobertos por uma linha só, em baixo, que conta quantos momentos ainda
   * não têm duração e o que isso implica.
   */
  const buracosCertos = dia.buracos.filter((b) => !b.anteriorSemDuracao);
  const semDuracao = items.filter((i) => duracaoDe(i) === 0);
  const semDuracaoNenhuma = items.length > 0 && semDuracao.length === items.length;

  return (
    // O `pt-6` do separador eram 24 px de ar por cima do título, iguais a 375
    // e a 1440, e nesta zona do dossier há vários painéis destes empilhados.
    // `--bo-p-vista` (12 → 24) é o token do respiro vertical de uma vista:
    // 12 px de volta no telemóvel, computador na mesma.
    <section className="border-t border-[var(--bo-hairline-strong)] pt-[var(--bo-p-vista)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="bo-eyebrow">Cronograma do Dia</p>
        {items.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-full bg-[var(--bo-tinta-6)] px-2.5 py-1 text-[11px] tabular-nums text-[var(--bo-text-muted)]">
              {items.length} {items.length === 1 ? "momento" : "momentos"}
            </span>
            <button
              type="button"
              onClick={() => printRunSheet(quote)}
              title="Imprimir guião do dia"
              aria-label="Imprimir guião do dia"
              // 27×27 medidos a 375 px — um botão de ícone sem rótulo, que é
              // a classe de alvo mais fácil de falhar com o polegar.
              className={`alvo-toque rounded-lg p-1.5 text-foreground/40 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 9V3h12v6" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="7" rx="1" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ── «O QUE É QUE VEM A SEGUIR?» ─────────────────────────────────────
          A pergunta que ela faz de pé, numa quinta, com as mãos ocupadas — e
          que tem de ter resposta SEM tocar em nada. Por isso vive no topo, é a
          maior coisa do ecrã, e é a única que não é preciso procurar.

          O que está a decorrer vem em cima, pequeno, como contexto; o que vem
          a SEGUIR vem em baixo, grande, porque é essa a pergunta. A hora é o
          maior número da página (`text-3xl tabular-nums`), legível a um braço
          de distância, e a contagem («daqui a 25 min») está ao lado porque uma
          hora sozinha obriga a fazer a conta de cabeça. */}
      {seguinte && (
        <div className="mb-5 rounded-xl border border-sage-600/25 bg-sage-600/[0.06] px-4 py-3.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-sage-600">
            <span>Agora</span>
            <span className="tabular-nums font-normal tracking-normal text-[var(--bo-text-muted)]">
              {horaDoMinuto(minutoAgora)}
            </span>
          </div>
          {seguinte.agora.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-0.5">
              {seguinte.agora.map((b) => (
                <li key={b.item.id} className="text-sm leading-snug text-[var(--bo-text)]">
                  {b.item.title}
                  {b.duracao > 0 && (
                    <span className="bo-text-muted tabular-nums">
                      {" "}
                      · até às {horaDoMinuto(b.fim)}
                    </span>
                  )}
                  {b.item.owner && <span className="bo-text-muted"> · {b.item.owner}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="bo-text-muted mt-1 text-sm">
              {seguinte.terminado ? "O guião chegou ao fim." : "Não há nada marcado neste momento."}
            </p>
          )}

          {seguinte.aSeguir && (
            <div className="mt-3 border-t border-sage-600/20 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sage-600">
                A seguir
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-3xl font-semibold leading-none tabular-nums text-[var(--bo-text)]">
                  {seguinte.aSeguir.item.time}
                </span>
                <span className="bo-text-muted text-sm tabular-nums">
                  daqui a {porExtenso(seguinte.faltam)}
                </span>
              </div>
              <p className="mt-1.5 text-base leading-snug text-[var(--bo-text)]">
                {seguinte.aSeguir.item.title}
                {seguinte.aSeguir.item.owner && (
                  <span className="bo-text-muted text-sm"> · {seguinte.aSeguir.item.owner}</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── A COLISÃO FICA À VISTA, E COM SAÍDA ────────────────────────────
          Um toast desaparece sozinho e leva com ele a única pista do que não
          ficou guardado. Aqui o guião do servidor já está no ecrã (é a
          verdade), e este aviso fica ao lado a dizer o que é que ela estava a
          fazer quando ele chegou — com o gesto ainda por aplicar, à distância
          de um clique. Reaplicar é somar-se ao que o outro escreveu, não
          apagá-lo: o gesto corre por cima da versão adoptada. */}
      {colisoes.length > 0 && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-[#8a2a22]/25 bg-[#f6e6df]/50 px-4 py-3 text-sm"
        >
          <p className="font-medium text-[#8a2a22]">
            Não deu para {colisoes.map((c) => c.oQue).join(" e ")}: o guião mudou noutro sítio
            entretanto.
          </p>
          <p className="bo-text-muted mt-1">
            O guião que está no ecrã é o que ficou guardado. Não se perdeu nada — podes voltar a
            aplicar o que estavas a fazer por cima dele.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={voltarAAplicar}>
              Voltar a aplicar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setColisoes([])}>
              Ficar com a versão guardada
            </Button>
          </div>
        </div>
      )}

      {/* ── DUAS PESSOAS NO MESMO SÍTIO À MESMA HORA ───────────────────────
          O erro que custa caro num dia de montagem, e o único desta vista que
          é MESMO um erro: num evento há coisas que correm em paralelo (o
          catering a montar enquanto a decoração acaba), mas ninguém está em
          dois sítios ao mesmo tempo.

          A frase diz as três partes da casa: o que aconteceu (quem, e quais
          são os dois momentos), quanto (os minutos em cima um do outro) e o
          que fazer (as três saídas possíveis). Nunca «há um conflito». */}
      {dia.choques.length > 0 && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-[#8a2a22]/25 bg-[#f6e6df]/50 px-4 py-3 text-sm"
        >
          <p className="font-medium text-[#8a2a22]">
            {dia.choques.length === 1
              ? "Há uma pessoa em dois sítios ao mesmo tempo."
              : `Há ${dia.choques.length} momentos com a mesma pessoa em dois sítios ao mesmo tempo.`}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {dia.choques.map((c) => (
              <li key={`${c.a.id}-${c.b.id}`} className="text-[var(--bo-text)]">
                <strong className="font-medium">{c.responsavel}</strong> tem «{c.a.time} {c.a.title}
                » e «{c.b.time} {c.b.title}» a andar {porExtenso(c.minutos)} em cima um do outro.
              </li>
            ))}
          </ul>
          <p className="bo-text-muted mt-1.5">
            Muda a hora de um dos dois, encurta o primeiro, ou passa um deles a outra pessoa.
          </p>
        </div>
      )}

      {/* ── E O QUE É SÓ INFORMAÇÃO FICA COM CARA DE INFORMAÇÃO ────────────
          Sobreposições com responsáveis diferentes e buracos não são erros —
          são a forma do dia dita por palavras, para quem lê o guião ao
          telefone e não está a olhar para os blocos. Pintá-las de vermelho era
          ensiná-la a ignorar o vermelho, e o vermelho tem um dono só. */}
      {(dia.sobreposicoes.length > 0 || buracosCertos.length > 0) && (
        <div className="mb-5 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-surface-sunken)] px-4 py-3 text-sm">
          <ul className="flex flex-col gap-1.5">
            {dia.sobreposicoes.map((s) => (
              <li key={`${s.a.id}-${s.b.id}`} className="text-[var(--bo-text)]">
                «{s.a.title}» e «{s.b.title}» correm {porExtenso(s.minutos)} ao mesmo tempo
                {s.a.owner && s.b.owner ? ` — ${s.a.owner} e ${s.b.owner}, cada um no seu.` : "."}
              </li>
            ))}
            {buracosCertos.map((b) => (
              <li key={`${b.depoisDe.id}-${b.antesDe.id}`} className="text-[var(--bo-text)]">
                {porExtenso(b.minutos)} entre «{b.depoisDe.title}» e «{b.antesDe.title}» sem nada
                marcado.
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          }
          title="Guião do dia por preencher"
          description="Gera um cronograma-base para um dia de evento típico e adapta os momentos a este evento."
          action={{ label: "Gerar cronograma-base", onClick: seed }}
        />
      ) : (
        <div className="mb-5">
          {/* ── UM GUIÃO SÓ DE INSTANTES DIZ O QUE LHE FALTA ──────────────
              Um guião do modelo antigo abre e funciona — e abre CALADO, sem
              sobreposições inventadas. Mas continua a não responder a «isto
              cabe?», e o ecrã tem de dizer porquê e o que fazer, uma vez, sem
              alarme. */}
          {semDuracao.length > 0 && (
            <p className="bo-text-muted mb-3 text-xs leading-relaxed">
              {semDuracaoNenhuma ? (
                <>
                  Nenhum momento tem duração marcada, por isso o dia ainda não tem forma — e o que
                  está entre dois momentos tanto pode ser tempo livre como pode ser o primeiro a
                  decorrer. Escolhe a duração num momento e o bloco passa a medir o tempo que ocupa.
                </>
              ) : semDuracao.length === 1 ? (
                <>
                  «{semDuracao[0].title}» ainda não tem duração. O tempo que vem a seguir tanto pode
                  ser livre como pode ser esse momento ainda a decorrer — por isso o ecrã não lhe
                  chama um buraco.
                </>
              ) : (
                <>
                  {semDuracao.length} momentos ainda não têm duração. O tempo que vem a seguir a
                  cada um deles tanto pode ser livre como pode ser o momento ainda a decorrer — por
                  isso o ecrã não lhes chama buracos.
                </>
              )}
            </p>
          )}

          <ul className="flex flex-col">
            {dia.blocos.map((bloco) => (
              <BlocoLi
                key={bloco.item.id}
                bloco={bloco}
                aDecorrer={idsAgora.has(bloco.item.id)}
                agoraNaBandaAntes={bandaComAgora === bloco.item.id}
                minutoAgora={minutoAgora}
                comRelogio={Boolean(seguinte)}
                emChoque={dia.choques.some(
                  (c) => c.a.id === bloco.item.id || c.b.id === bloco.item.id,
                )}
                editing={editing}
                draft={draft}
                setDraft={setDraft}
                commitEdit={commitEdit}
                editKeys={editKeys}
                startEdit={startEdit}
                cancelarEdicao={() => setEditing(null)}
                commitDuracao={commitDuracao}
                remove={remove}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Add row */}
      <div className="flex flex-wrap items-end gap-2">
        <Field
          as="input"
          type="time"
          label="Hora"
          hideLabel
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="px-2.5"
          containerClassName="w-[104px]"
        />
        {/* A duração escolhe-se — não se escreve. Ver `DEGRAUS_DE_DURACAO`. E é
            o `ui/Escolha` e não um `<select>` cru: a lista de um `<select>` é
            desenhada pelo sistema operativo, fora do documento, e nenhum CSS
            desta casa lá chega. */}
        <Escolha
          aria-label="Duração"
          opcoes={opcoesDeDuracao(Number(duracaoNova))}
          valor={duracaoNova}
          aoMudar={setDuracaoNova}
          className="w-full text-sm"
          containerClassName="w-[136px] shrink-0"
        />
        <Field
          as="input"
          label="Momento"
          hideLabel
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Momento…"
          containerClassName="min-w-[8rem] flex-1"
        />
        <Field
          as="input"
          label="Responsável"
          hideLabel
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Responsável"
          containerClassName="w-40"
        />
        <Button variant="primary" onClick={add} disabled={!title.trim() || !time}>
          Adicionar
        </Button>
      </div>
    </section>
  );
}

interface BlocoProps {
  bloco: BlocoDoDia;
  aDecorrer: boolean;
  agoraNaBandaAntes: boolean;
  minutoAgora: number;
  comRelogio: boolean;
  emChoque: boolean;
  editing: { id: string; field: EditableField } | null;
  draft: string;
  setDraft: (v: string) => void;
  commitEdit: () => void;
  editKeys: (e: React.KeyboardEvent) => void;
  startEdit: (id: string, field: EditableField, current: string) => void;
  cancelarEdicao: () => void;
  commitDuracao: (id: string, valor: string) => void;
  remove: (id: string) => void;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM MOMENTO, COM O COMPRIMENTO DO TEMPO QUE OCUPA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A lista de antes tinha todas as linhas do mesmo tamanho: uma montagem de
 * quatro horas e um brinde de dez minutos mediam o mesmo, e por isso o ecrã não
 * respondia a «isto cabe?». Aqui a altura é o tempo (ver `PX_POR_MINUTO`).
 *
 * ── O QUE SE MANTEVE, LETRA POR LETRA ──────────────────────────────────────
 *
 * Os quatro comandos de uma linha continuam a ser os mesmos, com os mesmos
 * nomes acessíveis: a hora, o momento, o responsável e o × de remover
 * («Remover 09:00 Montagem»). Não é conservadorismo — é que este guião se lê no
 * telemóvel, de pé, e mudar os gestos de quem já o usa custa mais do que a
 * vista nova vale. O que MUDA é a forma; o que se faz com os dedos é igual.
 *
 * ── E A BANDA POR CIMA ─────────────────────────────────────────────────────
 *
 * O espaço entre este bloco e o anterior tem significado e é sempre o mesmo
 * sítio: vazio marcado (buraco), tinta (sobreposição) ou vermelho (a mesma
 * pessoa nos dois). É por aí que os buracos e as sobreposições se VÊEM, e não
 * só se lêem — a altura da banda é proporcional aos minutos, com chão e tecto.
 */
function BlocoLi({
  bloco,
  aDecorrer,
  agoraNaBandaAntes,
  minutoAgora,
  comRelogio,
  emChoque,
  editing,
  draft,
  setDraft,
  commitEdit,
  editKeys,
  startEdit,
  cancelarEdicao,
  commitDuracao,
  remove,
}: BlocoProps) {
  const i = bloco.item;
  const instante = bloco.duracao === 0;
  const altura = Math.max(ALTURA_MIN_BLOCO, Math.round(bloco.duracao * PX_POR_MINUTO));
  const antes = bloco.antes;
  /**
   * ── E A GEOMETRIA TAMBÉM NÃO AFIRMA O QUE NÃO SABE ───────────────────────
   *
   * Uma sobra a seguir a um momento SEM duração é incerta: aquelas três horas
   * tanto são um buraco como são a montagem a decorrer. Desenhá-las à escala,
   * com moldura tracejada, era afirmar com píxeis o que a prosa se recusa a
   * afirmar com palavras — e, num guião do modelo antigo, enchia o ecrã de
   * caixas vazias enormes onde antes havia uma lista compacta.
   *
   * Fica ao MÍNIMO e diz só o número. A forma proporcional é a recompensa de
   * marcar as durações, e não uma coisa que o ecrã inventa sozinho.
   */
  const incerto = antes?.tipo === "buraco" && duracaoDe(antes.com) === 0;
  const alturaBanda = !antes
    ? 0
    : incerto
      ? ALTURA_MIN_BANDA
      : Math.min(
          ALTURA_MAX_BANDA,
          Math.max(ALTURA_MIN_BANDA, Math.round(antes.minutos * PX_POR_MINUTO)),
        );
  // Um vazio curto desenha-se — é a forma do dia — mas não se ANUNCIA: a
  // moldura tracejada e a frase ficam para os buracos que a prosa também
  // nomeia (o mesmo `BURACO_MINIMO_MIN`), senão o ecrã diz uma coisa e a lista
  // de cima diz outra sobre o mesmo intervalo.
  const buracoDeDizer = antes?.tipo === "buraco" && antes.minutos >= BURACO_MINIMO_MIN && !incerto;

  // Quanto já passou deste momento — o único movimento proporcional desta
  // vista, e feito com `scaleX` e origem à esquerda, como as barras das
  // Estatísticas. Animar a LARGURA de uma barra de tempo remede a página a cada
  // fotograma, e é precisamente aqui que apetece fazê-lo.
  const decorrido =
    aDecorrer && bloco.duracao > 0
      ? Math.min(1, Math.max(0, (minutoAgora - bloco.inicio) / bloco.duracao))
      : 0;

  return (
    <li className="flex flex-col">
      {antes && antes.tipo !== "encosta" && (
        <div
          style={{ height: alturaBanda }}
          className={`relative my-1 flex items-center justify-center rounded-lg px-3 text-[11px] leading-tight ${
            antes.tipo === "buraco"
              ? buracoDeDizer
                ? "border border-dashed border-[var(--bo-tinta-13)] text-[var(--bo-text-muted)]"
                : "text-[var(--bo-text-faint)]"
              : emChoque
                ? "bg-[#f6e6df]/70 text-[#8a2a22]"
                : "bg-[#b5894a]/12 text-[#7a5c2e]"
          }`}
        >
          <span className="tabular-nums">
            {antes.tipo === "buraco"
              ? buracoDeDizer
                ? `${porExtenso(antes.minutos)} sem nada marcado`
                : porExtenso(antes.minutos)
              : `${porExtenso(antes.minutos)} em cima de «${antes.com.title}»`}
          </span>
          {/* O «agora» caiu neste vazio: é o único sítio onde marcá-lo é
              verdade. Uma risca a atravessar a coluna inteira mentiria. */}
          {agoraNaBandaAntes && (
            <span className="absolute -left-0.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-sage-600" />
          )}
        </div>
      )}

      <div
        style={{ minHeight: altura }}
        className={`group relative flex flex-col gap-0.5 overflow-hidden rounded-xl py-1.5 pl-3 pr-1 ${
          aDecorrer
            ? "bg-sage-600/[0.09] ring-1 ring-inset ring-sage-600/30"
            : instante
              ? "hover:bg-[var(--bo-tinta-3)]"
              : "bg-[var(--bo-surface-sunken)] hover:bg-[var(--bo-tinta-6)]"
        }`}
      >
        {/* O carril da esquerda é a forma do momento: cheio quando ele ocupa
            tempo, tracejado quando é um instante (um marco, sem duração), e
            vermelho quando entra num choque de responsável. */}
        <span
          aria-hidden="true"
          className={`absolute inset-y-1 left-0 w-[3px] rounded-full ${
            emChoque
              ? "bg-[#8a2a22]"
              : instante
                ? "bg-[repeating-linear-gradient(to_bottom,#4c6752_0_3px,transparent_3px_6px)]"
                : "bg-sage-600"
          }`}
        />

        <div className="flex items-start gap-1.5">
          {editing?.id === i.id && editing.field === "time" ? (
            /* ── A SAÍDA, PARA QUEM NÃO TEM ESCAPE ──────────────────
               Ver `DesistirDaEdicao`: num telemóvel não há tecla que
               devolva o valor anterior, e tudo o que tira o foco GRAVA. */
            <span className="flex shrink-0 items-center gap-1">
              <input
                type="time"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={editKeys}
                aria-label="Editar hora"
                className="bo-input w-[100px] shrink-0 px-2 py-0.5 text-xs tabular-nums text-[var(--bo-text)]"
              />
              <DesistirDaEdicao onDesistir={cancelarEdicao} oQue="a hora" />
            </span>
          ) : (
            <button
              type="button"
              onClick={() => startEdit(i.id, "time", i.time)}
              title="Editar hora"
              // ── OS QUATRO BOTÕES DESTA LINHA SÃO EDIÇÕES A SÉRIO ────
              // Medidos a 375 px com o guião cheio: a hora dava 48×18,
              // o momento 155×39 e o responsável 155×16. Todos abrem
              // um campo de edição, e o guião do dia é lido e corrigido
              // no local, de pé. `alvo-toque` põe-nos nos 44 sob dedo.
              className={`alvo-toque !justify-start shrink-0 rounded-md text-left text-sm font-semibold tabular-nums text-sage-600 decoration-dotted underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
            >
              {i.time}
            </button>
          )}

          {/* A hora de FIM é calculada e não editável — é uma consequência da
              hora e da duração, e ter três campos a dizer a mesma coisa era
              deixar dois deles por actualizar. Ver `TimelineItem.duracao`. */}
          {!instante && (
            <span className="shrink-0 self-center text-xs tabular-nums text-[var(--bo-text-muted)]">
              → {horaDoMinuto(bloco.fim)}
            </span>
          )}

          <span className="flex-1" />

          {/* ── A DURAÇÃO ESCOLHE-SE, NÃO SE ESCREVE ─────────────────────
              Um `Escolha` sempre presente e não um botão que abre outro
              controlo: escolher a duração num telemóvel, de pé, tem de ser UM
              toque. Um botão que revela a lista cobrava dois — e o segundo é
              precisamente o que se falha com a mão ocupada.

              `variante="nua"` para o desenho ser o desta linha e não uma caixa
              de formulário no meio do guião; a seta que o primitivo desenha por
              cima é o que diz que aquilo se escolhe. */}
          <Escolha
            aria-label={`Duração de ${i.title}`}
            opcoes={opcoesDeDuracao(bloco.duracao)}
            valor={String(bloco.duracao)}
            aoMudar={(v) => commitDuracao(i.id, v)}
            variante="nua"
            vazio="sem duração"
            containerClassName="shrink-0"
            className={`alvo-toque !justify-end rounded-md pl-1.5 text-right text-xs tabular-nums ${
              instante ? "text-[var(--bo-text-faint)]" : "text-[var(--bo-text-muted)]"
            } hover:text-[var(--bo-tinta-72)] ${PRESSAO}`}
          />

          {/* MEDIDO a 768×1024 com dedo (o iPad em retrato): 10 destes botões e
              ZERO visíveis. 768 passa dos 640 do `sm:`, portanto `sm:opacity-0`
              disparava — e sem rato não há como o revelar. A pergunta certa é sobre o
              PONTEIRO, não sobre a largura: `com-rato:` (globals.css) esconde só onde
              há mesmo rato, e a 375 e a 768 com dedo ficam os 10 visíveis.

              Fica um ícone e não um menu «⋯»: com UMA acção por linha, o menu custa
              os mesmos 44 px e cobra um toque a mais para chegar ao mesmo sítio. */}
          <button
            onClick={() => remove(i.id)}
            className={`alvo-toque shrink-0 rounded-md p-1 text-foreground/25 sem-rato:text-[var(--bo-text-muted)] opacity-100 com-rato:opacity-0 hover:text-[#8a2a22] com-rato:focus-visible:opacity-100 com-rato:group-hover:opacity-100 ${ESTADO} ${PRESSAO}`}
            aria-label={`Remover ${i.time} ${i.title}`}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-w-0">
          {editing?.id === i.id && editing.field === "title" ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={editKeys}
                aria-label="Editar momento"
                className="bo-input w-full px-2 py-0.5 text-sm text-[var(--bo-text)]"
              />
              <DesistirDaEdicao onDesistir={cancelarEdicao} oQue="o momento" />
            </span>
          ) : (
            <button
              type="button"
              onClick={() => startEdit(i.id, "title", i.title)}
              title="Editar momento"
              className={`alvo-toque !justify-start w-full rounded-md text-left text-sm leading-snug text-[var(--bo-text)] decoration-dotted underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
            >
              {i.title}
            </button>
          )}
          {editing?.id === i.id && editing.field === "owner" ? (
            <span className="mt-1 flex items-center gap-1">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={editKeys}
                aria-label="Editar responsável"
                placeholder="Responsável"
                className="bo-input w-full px-2 py-0.5 text-xs text-[var(--bo-tinta-72)]"
              />
              <DesistirDaEdicao onDesistir={cancelarEdicao} oQue="o responsável" />
            </span>
          ) : (
            i.owner && (
              <button
                type="button"
                onClick={() => startEdit(i.id, "owner", i.owner ?? "")}
                title="Editar responsável"
                className={`alvo-toque !justify-start mt-0.5 w-full rounded-md text-left text-xs text-foreground/45 decoration-dotted underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
              >
                {i.owner}
              </button>
            )
          )}
        </div>

        {/* Quanto já passou deste momento. `scaleX` com origem à esquerda e
            `PROGRESSO` (250 ms, o degrau «elemento» da casa) — nunca `width`. */}
        {aDecorrer && bloco.duracao > 0 && (
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden">
            <span
              className={`block h-full w-full origin-left bg-sage-600/45 ${PROGRESSO}`}
              style={{ transform: `scaleX(${decorrido})` }}
            />
          </span>
        )}
      </div>
      {/* Uma linha só, e é a resposta a «quanto falta». Sem relógio não aparece:
          fora do dia do evento não há «agora» nenhum de que falar. */}
      {comRelogio && aDecorrer && bloco.duracao > 0 && (
        <p className="mt-1 pl-3 text-[11px] tabular-nums text-sage-600">
          A decorrer · faltam {porExtenso(Math.max(0, bloco.fim - minutoAgora))}
        </p>
      )}
    </li>
  );
}
