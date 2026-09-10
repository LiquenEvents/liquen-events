"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Quote, TimelineItem } from "@/lib/orcamento/types";
import {
  agoraNaRegua,
  horaDoMinuto,
  oQueVemASeguir,
  porExtenso,
} from "@/lib/orcamento/guiao-do-dia";
import {
  GRAVIDADE_DO_SINAL,
  janelaComum,
  ordenarGuioes,
  sinalPrincipal,
  type GuiaoNaLista,
  type ResumoDeGuiao,
  type SinalDoGuiao,
  type TipoDeSinal,
} from "@/lib/orcamento/guioes";
import type { ModeloDeGuiao, MomentoDeModelo } from "@/lib/orcamento/guiao-modelos";
import { Button, EmptyState, Segmented } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { SkeletonList } from "./Skeleton";
import { useCachedList } from "./useCachedList";
import { useToast } from "./Toast";
import { printRunSheet } from "./export";
import { ReguaDoDia } from "./ReguaDoDia";
import { GrelhaDoDia } from "./GrelhaDoDia";
import { FolhaDaTimeline } from "./FolhaDaTimeline";
import EventTimeline from "./EventTimeline";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * GUIÕES DO DIA — A CASA PRÓPRIA DE UMA COISA QUE JÁ EXISTIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O QUE ESTA VISTA É, E O QUE ELA DELIBERADAMENTE NÃO É ────────────────
 *
 * O guião do dia já estava escrito e resolvido: o motor (`guiao-do-dia.ts`) sabe
 * onde cada momento começa e acaba, quem está em dois sítios ao mesmo tempo e
 * onde estão os vazios; o `EventTimeline` sabe desenhá-lo à escala, editá-lo com
 * o polegar e gravá-lo com protecção contra duas pessoas a escrever ao mesmo
 * tempo. O que faltava não era nenhuma dessas coisas.
 *
 * Faltava CHEGAR LÁ. O guião vivia dentro da zona de produção de UM evento, a
 * três aberturas de distância: escolher o pedido, abrir o pedido, descer até à
 * Produção. Ou seja, a pergunta de segunda-feira de manhã — «dos eventos que aí
 * vêm, quais é que já têm guião e quais é que têm um problema?» — não tinha
 * ecrã nenhum, porque não se responde a abrir vinte pedidos.
 *
 * Por isso esta vista **não reescreve o editor**: monta o `EventTimeline` que já
 * existe, com o `analisarODia` que já existe, e acrescenta só o que faltava —
 * a lista de todos, a régua deitada que os torna comparáveis, e os modelos.
 * Um segundo editor de guiões a viver ao lado do primeiro era o defeito que o
 * `CLAUDE.md` manda evitar por escrito.
 *
 * ── DE ONDE VÊM OS DADOS, E PORQUE SÃO DUAS FONTES ───────────────────────
 *
 *  · a LISTA vem de `/api/guioes`, porque o `timeline` é um dos campos que o
 *    resumo dos pedidos deixa cair de propósito (`CAMPOS_SO_DO_DETALHE`);
 *  · o PEDIDO ABERTO vem do `carregarPedido`, que é o `comPedidoInteiro` do
 *    AdminClient. Não é preguiça de não o pedir aqui: essa função sabe uma
 *    coisa que se aprendeu a doer — a rota do pedido responde 200 com uma
 *    versão CURTA quando a sessão caiu, e só o cabeçalho `x-pedido: completo`
 *    distingue as duas. Uma segunda leitura escrita aqui herdava o defeito.
 */

interface Props {
  /**
   * Vai buscar o pedido inteiro (com o guião, a checklist e os pagamentos que a
   * folha do dia imprime). O AdminClient guarda o que já leu, portanto voltar
   * ao mesmo evento não paga segunda viagem.
   */
  carregarPedido: (
    id: string,
  ) => Promise<{ ok: true; quote: Quote } | { ok: false; porque: string }>;
  /** O guião mudou — para a lista de pedidos do back office ficar em dia. */
  onQuoteAtualizado?: (quote: Quote) => void;
}

type Filtro = "todos" | "por-fazer" | "problemas";

/**
 * ── AS DUAS MANEIRAS DE OLHAR PARA O MESMO DIA ────────────────────────────
 *
 * A régua vertical (`EventTimeline`) e a grelha por responsável
 * (`GrelhaDoDia`) não são duas versões da mesma coisa com desenhos
 * diferentes: respondem a duas perguntas que se fazem em dias diferentes.
 *
 *  · **Régua** — «isto cabe?». Uma pista só, o dia inteiro por ordem, com os
 *    vazios e as sobreposições marcados entre os blocos. É a pergunta da
 *    VÉSPERA, e é o único sítio onde se EDITA e se GRAVA (com o 409 e o
 *    «voltar a aplicar» que já lá estão). A grelha não grava nada — se
 *    gravasse, eram duas gravações a discordar sobre o mesmo dia, que é
 *    exactamente o defeito que o `CLAUDE.md` manda evitar.
 *
 *  · **Por pessoa** — «quem está onde às 14:00, e quem está livre para a
 *    próxima coisa?». Uma coluna por responsável, as horas a descer. É a
 *    pergunta do DIA DO EVENTO, feita de pé, com as mãos ocupadas. A régua não
 *    lhe responde por construção: mistura toda a gente na mesma pista, e ler
 *    «quem está livre» obriga a percorrer o dia a ler nomes.
 *
 * Uma só das duas não chegava. Só a régua deixa a pergunta dela sem ecrã; só a
 * grelha tira a edição e o «isto cabe?» — e a grelha, a editar, seria a segunda
 * gravação. Ficam as duas, com um comutador, e a régua por omissão porque é a
 * que serve nos 364 dias em que o evento não é hoje.
 */
type VistaDoDia = "regua" | "grelha";

/**
 * ── A LINGUAGEM DOS SINAIS: COR, FORMA E PALAVRA, SEMPRE AS TRÊS ──────────
 *
 * Regra da casa e do sistema de design: «nunca comuniques informação só por
 * cor». Já aqui houve um calendário que dizia o estado só com cor. Cada sinal
 * leva por isso um ÍCONE (a forma) e uma PALAVRA (o rótulo) além do tom — uma
 * pastilha vermelha e uma verde continuam a distinguir-se num ecrã em tons de
 * cinzento, e continuam a ler-se em voz alta.
 *
 * As cores são as três com significado desta casa e não mais nenhuma: perigo,
 * aviso e acento. Um guião pronto não ganha uma quarta cor — ganha o cinzento
 * do texto de apoio, porque «pronto» é a ausência de problema e não um estado
 * a celebrar.
 */
const TOM_DO_SINAL: Record<TipoDeSinal, { fundo: string; tinta: string }> = {
  choque: { fundo: "bg-[var(--bo-perigo-lavagem)]", tinta: "text-[var(--bo-perigo)]" },
  buraco: { fundo: "bg-[var(--bo-aviso-lavagem)]", tinta: "text-[var(--bo-aviso)]" },
  "sem-duracao": { fundo: "bg-[var(--bo-aviso-lavagem)]", tinta: "text-[var(--bo-aviso)]" },
  "sem-guiao": { fundo: "bg-[var(--bo-tinta-6)]", tinta: "text-[var(--bo-text-muted)]" },
  sobreposicao: { fundo: "bg-[var(--bo-tinta-6)]", tinta: "text-[var(--bo-text-muted)]" },
  pronto: { fundo: "bg-[var(--bo-accent-lavagem)]", tinta: "text-[var(--bo-accent)]" },
};

const ROTULO_DO_SINAL: Record<TipoDeSinal, string> = {
  choque: "Choque",
  buraco: "Vazio",
  "sem-duracao": "Sem duração",
  "sem-guiao": "Sem timeline",
  sobreposicao: "Em paralelo",
  pronto: "Pronto",
};

function IconeDoSinal({ tipo }: { tipo: TipoDeSinal }) {
  const comum = {
    width: 12,
    height: 12,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  // Uma forma por significado — triângulo para o erro, ampulheta para o vazio,
  // círculo aberto para o que falta, dois traços para o paralelo, visto para o
  // que está feito.
  if (tipo === "choque") {
    return (
      <svg {...comum}>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    );
  }
  if (tipo === "buraco") {
    return (
      <svg {...comum}>
        <path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22" />
        <path d="M7 2v4.2c0 .5.2 1 .6 1.4L12 12l4.4-4.4c.4-.4.6-.9.6-1.4V2" />
      </svg>
    );
  }
  if (tipo === "sem-duracao") {
    return (
      <svg {...comum}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5" />
      </svg>
    );
  }
  if (tipo === "sobreposicao") {
    return (
      <svg {...comum}>
        <path d="M4 8h13M7 16h13" />
      </svg>
    );
  }
  if (tipo === "pronto") {
    return (
      <svg {...comum}>
        <path d="m5 12 5 5L20 7" />
      </svg>
    );
  }
  return (
    <svg {...comum}>
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
    </svg>
  );
}

function Pastilha({ sinal }: { sinal: SinalDoGuiao }) {
  const tom = TOM_DO_SINAL[sinal.tipo];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--bo-raio-distintivo)] px-1.5 py-0.5 text-[11px] font-medium ${tom.fundo} ${tom.tinta}`}
      // A frase inteira é o nome acessível: quem ouve o ecrã recebe «Uma pessoa
      // em dois sítios ao mesmo tempo» e não «Choque, 1».
      title={sinal.frase}
    >
      <IconeDoSinal tipo={sinal.tipo} />
      <span>{ROTULO_DO_SINAL[sinal.tipo]}</span>
      {sinal.quantos > 1 && <span className="tabular-nums">{sinal.quantos}</span>}
      <span className="sr-only"> — {sinal.frase}</span>
    </span>
  );
}

/** «sábado, 12 de junho» — a data como se diz ao telefone. */
function dataPorExtenso(data: string): string {
  const d = new Date(`${data}T12:00:00`);
  if (Number.isNaN(d.getTime())) return data;
  return d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * «Hoje», «amanhã», «daqui a 12 dias», «há 3 dias».
 *
 * É a coluna que decide a ordem de leitura da lista, e por isso vale mais do
 * que a data: uma data obriga a fazer a conta de cabeça, e a conta de cabeça é
 * a que se erra na véspera de um evento.
 */
function quandoPorExtenso(faltamDias: number): string {
  if (faltamDias === 0) return "Hoje";
  if (faltamDias === 1) return "Amanhã";
  if (faltamDias === -1) return "Ontem";
  if (faltamDias > 0) return `Daqui a ${faltamDias} dias`;
  return `Há ${Math.abs(faltamDias)} dias`;
}

/** De quanto em quanto tempo o relógio do «agora» se actualiza. O mesmo pulso
 *  do `EventTimeline` — a frase que ele escreve é «daqui a 25 min». */
const PULSO_DO_RELOGIO_MS = 30_000;

export default function Guioes({ carregarPedido, onQuoteAtualizado }: Props) {
  const { toast } = useToast();
  const lista = useCachedList<{ guioes: ResumoDeGuiao[] }>("guioes", "/api/guioes");
  const modelos = useCachedList<{ modelos: ModeloDeGuiao[] }>(
    "guiao-modelos",
    "/api/guioes/modelos",
  );

  const [filtro, setFiltro] = useState<Filtro>("todos");
  /**
   * A escolha vive AQUI e não dentro do painel do evento: trocar de evento
   * mantém a maneira de olhar. No dia do evento ela põe a grelha e passa a
   * manhã a saltar entre dois casamentos — voltar à régua a cada troca era
   * cobrar-lhe um toque por cada vez.
   */
  /**
   * ── A GRELHA É A VISTA, E A RÉGUA É ONDE SE ESCREVE ──────────────────────
   *
   * Abria na régua. Passa a abrir na grelha, porque foi isso que ela pediu com
   * o horário da faculdade à frente: «quero que o timeline seja mesmo assim».
   *
   * A régua não sai nem podia sair — é o único sítio onde os momentos se
   * escrevem, e continua a um toque. O que muda é qual das duas responde
   * primeiro: quem abre uma timeline vem ver o dia, e só depois mexer nele.
   */
  const [vistaDoDia, setVistaDoDia] = useState<VistaDoDia>("grelha");

  /**
   * ── DESCARREGAR O HORÁRIO EM PDF ────────────────────────────────────────
   *
   * O ficheiro vem do `/api/guioes/<id>/pdf`, desenhado no servidor — é lá que
   * a fonte que escreve nomes portugueses já está carregada (ver o cabeçalho
   * da rota).
   *
   * O `URL.createObjectURL` tem de ser revogado À MÃO: um blob que ninguém
   * revoga fica de pé até a aba fechar, e ela abre horários o dia todo. O
   * `setTimeout` de zero é para o clique já ter partido quando o endereço
   * morre — revogar na mesma volta do laço deixava o download por fazer em
   * alguns browsers.
   */
  const [aDescarregar, setADescarregar] = useState(false);
  const [falhaAoDescarregar, setFalhaAoDescarregar] = useState<string | null>(null);

  async function descarregarPdf(id: string) {
    setADescarregar(true);
    setFalhaAoDescarregar(null);
    try {
      const res = await fetch(`/api/guioes/${encodeURIComponent(id)}/pdf`);
      if (!res.ok) {
        const corpo: unknown = await res.json().catch(() => null);
        const dito = (corpo as { error?: unknown } | null)?.error;
        setFalhaAoDescarregar(
          typeof dito === "string" && dito
            ? dito
            : "Não foi possível preparar o PDF. Tenta daqui a bocado.",
        );
        return;
      }
      const nome =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
        "horario.pdf";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setFalhaAoDescarregar("Erro de ligação. Tenta novamente.");
    } finally {
      setADescarregar(false);
    }
  }
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [pedido, setPedido] = useState<Quote | null>(null);
  const [aAbrir, setAAbrir] = useState<string | null>(null);
  const [falhaAoAbrir, setFalhaAoAbrir] = useState<string | null>(null);

  const [agora, setAgora] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), PULSO_DO_RELOGIO_MS);
    return () => clearInterval(t);
  }, []);

  const guioes = useMemo(() => ordenarGuioes(lista.data?.guioes ?? [], agora), [lista.data, agora]);

  /**
   * A janela é COMUM a todas as réguas e calcula-se sobre a lista INTEIRA, não
   * sobre a filtrada.
   *
   * Se dependesse do filtro, mudar de «Todos» para «Com problema» reescalava
   * todas as fitas ao mesmo tempo — as barras mudavam de comprimento sem que
   * nenhum dia tivesse mudado, e uma régua que se mexe quando os dados não
   * mudam é uma régua em que não se acredita.
   */
  const janela = useMemo(() => janelaComum(guioes), [guioes]);

  const contagens = useMemo(() => {
    let porFazer = 0;
    let problemas = 0;
    for (const g of guioes) {
      const principal = sinalPrincipal(g.sinais);
      if (GRAVIDADE_DO_SINAL[principal.tipo] === "erro") problemas += 1;
      else if (GRAVIDADE_DO_SINAL[principal.tipo] === "por-fazer") porFazer += 1;
    }
    return { todos: guioes.length, porFazer, problemas };
  }, [guioes]);

  const visiveis = useMemo(() => {
    if (filtro === "todos") return guioes;
    return guioes.filter((g) => {
      const gravidade = GRAVIDADE_DO_SINAL[sinalPrincipal(g.sinais).tipo];
      return filtro === "problemas" ? gravidade === "erro" : gravidade === "por-fazer";
    });
  }, [guioes, filtro]);

  const oDeHoje = useMemo(() => guioes.find((g) => g.hoje) ?? null, [guioes]);
  const aberto = useMemo(() => guioes.find((g) => g.id === abertoId) ?? null, [guioes, abertoId]);

  /**
   * A lista visível, partida por MÊS, pela ordem em que já vinha.
   *
   * O ano só se escreve quando não é este — «Setembro», «Outubro», «Maio
   * 2027». Escrever «2026» em todas as linhas de uma agenda de 2026 é ruído
   * que se aprende a saltar, e foi essa a lição da lista dos próximos eventos
   * do Calendário.
   */
  const porMes = useMemo(() => {
    const anoActual = new Date().getFullYear();
    const grupos: { mes: string; eventos: typeof visiveis }[] = [];
    for (const g of visiveis) {
      const d = new Date(`${g.data}T12:00:00`);
      const nome = d.toLocaleDateString("pt-PT", { month: "long" });
      const mes =
        d.getFullYear() === anoActual
          ? nome.charAt(0).toUpperCase() + nome.slice(1)
          : `${nome.charAt(0).toUpperCase() + nome.slice(1)} ${d.getFullYear()}`;
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.mes === mes) ultimo.eventos.push(g);
      else grupos.push({ mes, eventos: [g] });
    }
    return grupos;
  }, [visiveis]);

  /**
   * Abrir um guião é ir buscar o pedido inteiro.
   *
   * O `pedido` só se substitui quando a resposta é do evento que ela quis abrir
   * (`abertaRef`): dois toques seguidos em dois eventos põem duas leituras no
   * ar, e sem esta guarda a primeira a chegar — que pode ser a do evento que já
   * não está aberto — desenhava o guião ERRADO por baixo do nome certo. Num
   * ecrã que grava ao toque, isso escreve o guião de um casamento no outro.
   */
  const abertaRef = useRef<string | null>(null);
  async function abrir(id: string) {
    setAbertoId(id);
    abertaRef.current = id;
    setFalhaAoAbrir(null);
    if (pedido?.id === id) return;
    setPedido(null);
    setAAbrir(id);
    const r = await carregarPedido(id);
    if (abertaRef.current !== id) return;
    setAAbrir(null);
    if (r.ok) setPedido(r.quote);
    else setFalhaAoAbrir(r.porque);
  }

  function fechar() {
    setAbertoId(null);
    abertaRef.current = null;
    setFalhaAoAbrir(null);
  }

  /**
   * O guião mudou no ecrã do evento — a lista tem de mudar com ele.
   *
   * Sem isto, apagar um choque dentro do editor deixava a pastilha vermelha na
   * linha ao lado até alguém recarregar a página: dois sítios a dizer coisas
   * diferentes sobre o mesmo dia, que é o defeito que esta vista existe para
   * não ter. O `setData` do `useCachedList` escreve na cache, portanto sair da
   * vista e voltar não ressuscita o estado antigo.
   */
  /**
   * O título da folha, igual ao do PDF: «CASAMENTO CAROLINA 04.09.26».
   *
   * A data no formato curto que ela escreve à mão — dd.mm.aa, e não «sábado, 4
   * de setembro». Numa folha que anda pelo bolso de dez fornecedores a data é
   * uma etiqueta, não uma frase.
   */
  function tituloDaFolha(g: { evento: string; cliente: string; data: string }): string {
    const [ano, mes, dia] = g.data.split("-");
    const curta = ano && mes && dia ? `${dia}.${mes}.${ano.slice(2)}` : "";
    return [g.evento, g.cliente, curta].filter(Boolean).join(" ") || "Timeline";
  }

  function guiaoMudou(id: string, momentos: TimelineItem[]) {
    lista.setData((prev) => ({
      guioes: (prev?.guioes ?? []).map((g) => (g.id === id ? { ...g, momentos } : g)),
    }));
    setPedido((prev) => (prev && prev.id === id ? { ...prev, timeline: momentos } : prev));
    const inteiro = pedido && pedido.id === id ? { ...pedido, timeline: momentos } : null;
    if (inteiro) onQuoteAtualizado?.(inteiro);
  }

  async function guardarModelo(nome: string, momentos: MomentoDeModelo[]) {
    const origem = aberto ? `${aberto.cliente} · ${dataPorExtenso(aberto.data)}` : undefined;
    const oQue = `guardar o modelo «${nome}»`;
    let res: Response;
    try {
      res = await fetch("/api/guioes/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, momentos, origem }),
      });
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return;
    }
    const corpo = (await res.json().catch(() => null)) as {
      modelos?: ModeloDeGuiao[];
      escrita?: { duradouro?: boolean };
    } | null;
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
      return;
    }
    if (corpo?.modelos) modelos.setData({ modelos: corpo.modelos });
    // A escrita pode ter acontecido num sítio que não dura (ver `app-state.ts`:
    // sem base de dados, em produção, o ficheiro é o disco da função). Dizer
    // «Guardado» sobre isso é a avaria que custou uma proposta inteira.
    if (corpo?.escrita && corpo.escrita.duradouro === false) {
      toast(
        `«${nome}» ficou guardado só nesta máquina — sem base de dados configurada, não sobrevive a uma actualização.`,
        "error",
      );
      return;
    }
    toast(`Modelo «${nome}» guardado.`);
  }

  const relogio = agoraNaRegua(agora);

  return (
    <div className="flex flex-col gap-[var(--bo-gap-vista)]">
      {/* ══════════════════════════════════════════════════════════════════
          O DIA QUE ESTÁ A ACONTECER
          ══════════════════════════════════════════════════════════════════
          Só existe no dia do evento — e ainda na madrugada seguinte, porque o
          encerramento das 02:00 é o último momento do guião (ver `estaNoDia`).
          Nos outros dias não há painel nenhum: um «agora» a apontar para uma
          hora de um dia que não é o do evento parece informação e é ruído. */}
      {oDeHoje && (
        <PainelDeHoje guiao={oDeHoje} relogio={relogio} aoAbrir={() => abrir(oDeHoje.id)} />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* ── A LISTA ──────────────────────────────────────────────────────
            No telemóvel a lista e o guião aberto trocam de lugar: dois painéis
            de largura inteira empilhados obrigavam a rolar a lista toda para
            chegar ao guião que se acabou de abrir. No computador vivem lado a
            lado, que é onde há largura para os dois. */}
        <div className={abertoId ? "hidden lg:block" : "block"}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Segmented<Filtro>
              ariaLabel="Filtrar as timelines"
              size="sm"
              value={filtro}
              onChange={setFiltro}
              options={[
                { value: "todos", label: `Todos · ${contagens.todos}` },
                { value: "por-fazer", label: `Por fazer · ${contagens.porFazer}` },
                { value: "problemas", label: `Com problema · ${contagens.problemas}` },
              ]}
            />
          </div>

          {lista.loading && !lista.data ? (
            <SkeletonList rows={5} />
          ) : lista.error ? (
            <AvisoDeFalha
              titulo="Não foi possível ler as timelines"
              mensagem={lista.errorMessage}
              falha={lista.falha}
              aoTentarDeNovo={lista.refresh}
            />
          ) : guioes.length === 0 ? (
            <EmptyState
              icon={<IconeDeGuiao />}
              title="Ainda não há eventos com data"
              description="Uma timeline pertence a um evento marcado. Assim que um pedido tiver data, aparece aqui à espera de timeline."
            />
          ) : visiveis.length === 0 ? (
            <EmptyState
              icon={<IconeDeGuiao />}
              title={
                filtro === "problemas"
                  ? "Nenhuma timeline com pessoas em dois sítios ao mesmo tempo"
                  : "Nenhuma timeline por fazer"
              }
              description="Mudou o filtro, não os dados: há timelines, só que nenhuma delas cai neste caso."
              action={{ label: "Ver todos", onClick: () => setFiltro("todos") }}
            />
          ) : (
            /* ── A LISTA PASSA A TER CABEÇALHOS DE MÊS ──────────────────────
               O documento do Calendário dela apanha isto noutro sítio e a
               queixa é a mesma aqui: «26 Set → 3 Out → 29 Mai 27. Sete meses de
               intervalo sem qualquer separador. O leitor tem de descobrir
               sozinho que não há nada entre outubro e maio.»

               A lista das timelines tem exactamente essa forma — «Daqui a 23
               dias» seguido de «Daqui a 261 dias» — e o salto de sete meses
               fica escondido atrás de dois números que ninguém subtrai.

               Com os meses escritos, o buraco passa a ser evidente em vez de
               suspeito. E é a informação mais valiosa desta lista: sete meses
               livres é uma decisão comercial, não um detalhe de apresentação.

               Colados ao topo (`sticky`) porque a coluna rola: sem isso, a
               meio de Julho já não se sabe em que mês se está — que é o mesmo
               defeito com outro nome. */
            <ul className="flex flex-col gap-2">
              {porMes.map(({ mes, eventos }) => (
                <li key={mes}>
                  <h2 className="bo-eyebrow sticky top-0 z-10 -mx-1 bg-[var(--bo-surface-sunken)]/85 px-1 py-1.5 text-[var(--bo-text-muted)] backdrop-blur">
                    {mes}
                  </h2>
                  <ul className="mt-1 flex flex-col gap-2">
                    {eventos.map((g) => (
                      <li key={g.id}>
                        <LinhaDeGuiao
                          guiao={g}
                          janela={janela}
                          activo={g.id === abertoId}
                          relogio={g.hoje ? relogio : null}
                          aoAbrir={() => abrir(g.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── O GUIÃO ABERTO ─────────────────────────────────────────────
            `min-w-0`, e não é decoração: este painel é um item de uma grelha,
            e um item de grelha nasce com `min-width: auto` — ou seja, recusa-se
            a ficar mais estreito do que o seu conteúdo mínimo. A grelha do dia
            por responsável tem largura mínima própria (48 px de horas mais
            96 px por pessoa), portanto a 390 px com quatro pessoas o painel
            esticava para 432 px e arrastava a PÁGINA INTEIRA para um rolo
            horizontal — que é a coisa que o sistema de design proíbe à letra.
            Medido, e só se vê num browser: o rolo tem de ficar dentro da caixa
            da grelha, e para isso o painel tem de poder encolher.

            O `lg:grid-cols-[minmax(0,…)]` acima já resolvia isto no computador;
            abaixo dos 1024 px a grelha é de uma coluna só e a coluna implícita
            é `auto`, portanto não resolvia nada — que é exactamente a largura
            onde ela trabalha. */}
        <div className={`min-w-0 ${abertoId ? "block" : "hidden lg:block"}`}>
          {!aberto ? (
            <div className="bo-card">
              <EmptyState
                icon={<IconeDeGuiao />}
                title="Escolhe um evento"
                description="A timeline abre-se aqui: a régua à escala, os avisos, e a folha para imprimir e dar à equipa."
              />
            </div>
          ) : (
            <div className="bo-card p-[var(--bo-p-cartao)]">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                {/* ── A HIERARQUIA ESTAVA INVERTIDA, COMO NOS OUTROS ECRÃS ──
                    «Daqui a 359 dias» estava ACIMA do nome do casal, em
                    cinzento pequeno, na posição de maior destaque do cartão.
                    É a mesma inversão que os três documentos dela apanham nas
                    Tarefas, no Calendário e nos Temas: [APPLE] o título
                    identifica a vista, e o resto é estado.

                    O nome sobe para primeiro. O «daqui a tantos dias» desce
                    para junto da data, que é o sítio onde ele quer dizer
                    alguma coisa — «sábado, 4 de setembro · daqui a 359 dias» é
                    uma frase; sozinho por cima de um nome é um número solto.

                    E fica em `role="status"`: muda com o relógio, sem a página
                    recarregar. */}
                <div className="min-w-0">
                  <h2 className="text-title3 font-semibold text-[var(--bo-text)]">
                    {aberto.cliente || "Sem nome"}
                  </h2>
                  <p className="bo-text-muted mt-0.5 text-sm">
                    {dataPorExtenso(aberto.data)}
                    <span role="status">
                      {" "}
                      · {quandoPorExtenso(aberto.faltamDias).toLowerCase()}
                    </span>
                    {aberto.local ? ` · ${aberto.local}` : ""}
                  </p>
                </div>
                {/* ── ESTA FILA DEIXOU DE PODER SER `shrink-0` ──────────────
                    Tinha dois comandos e cabia; passou a ter três, e a 390 px
                    os três medem 506 px. Com `shrink-0` a fila recusava-se a
                    encolher, o `flex-wrap` nunca chegava a disparar (não há o
                    que quebrar quando a caixa não aperta), e o cabeçalho
                    arrastava a página inteira 116 px para o lado. Medido no
                    browser — no computador não se vê, porque lá sobra largura.

                    `min-w-0` em vez de `shrink-0`: a fila encolhe, o
                    `flex-wrap` faz o seu trabalho e os comandos passam para a
                    linha de baixo. */}
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {/* ── O COMUTADOR DAS DUAS PERGUNTAS ───────────────────
                      Ver `VistaDoDia` para porque é que são duas e não uma.
                      Fica ao pé das acções e não por cima da régua: é uma
                      escolha de como olhar, da mesma família do «Imprimir». */}
                  <Segmented<VistaDoDia>
                    ariaLabel="Como ver esta timeline"
                    size="sm"
                    value={vistaDoDia}
                    onChange={setVistaDoDia}
                    /* Os rótulos dizem o que cada uma FAZ, e não como se
                       chama por dentro. «Por pessoa» descrevia o eixo e não
                       o gesto; «Régua» era o nome de casa de um editor. Quem
                       chega quer ver o horário, ou quer mexer nele. */
                    options={[
                      { value: "grelha", label: "Horário" },
                      { value: "regua", label: "Editar" },
                    ]}
                  />
                  {/* Imprimir vive AQUI e não na linha da lista, e a razão é
                      técnica: o `printRunSheet` abre uma janela, e uma janela
                      aberta depois de um `await` é bloqueada pelo browser. Na
                      lista o pedido inteiro ainda não chegou; aqui já está em
                      mão, portanto a janela abre no mesmo gesto do toque. */}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!pedido}
                    onClick={() => pedido && printRunSheet(pedido)}
                  >
                    Imprimir folha do dia…
                  </Button>
                  {/* ── E DESCARREGAR, QUE NÃO É A MESMA COISA QUE IMPRIMIR ──
                      «Quero que haja uma opção no timeline que seja fazer
                      download. E que fique como a foto que mandei num PDF.»

                      O «Imprimir» abre uma janela e deixa o resto com ela — o
                      destino, a margem, e o cabeçalho que o browser mete com a
                      data e o endereço do back office. Um ficheiro para mandar
                      à equipa não pode levar o endereço do back office impresso
                      no fundo.

                      ── E PORQUE É QUE NÃO É UMA ÂNCORA COM `download` ──────

                      Porque uma âncora não sabe ler uma recusa. A rota responde
                      409 a uma timeline sem uma única hora escrita — que é o
                      estado em que ela abre um evento novo — e com uma âncora
                      isso levava-a a uma página de JSON em cru, fora do back
                      office, com o botão «voltar» como única saída. Assim a
                      recusa é uma frase no sítio onde ela carregou. */}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!pedido || aDescarregar}
                    loading={aDescarregar}
                    onClick={() => void descarregarPdf(aberto.id)}
                  >
                    {aDescarregar ? "A preparar…" : "Descarregar PDF"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={fechar} className="lg:hidden">
                    Voltar aos guiões
                  </Button>
                </div>
              </div>

              {/* A recusa do PDF fica onde ela carregou, e não numa página de
                  JSON fora do back office. Uma linha, `role="status"`, e some
                  assim que ela tenta outra vez. */}
              {falhaAoDescarregar && (
                <p
                  role="status"
                  className="mb-3 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--bo-perigo)]"
                >
                  <span aria-hidden="true">⚠</span>
                  <span>{falhaAoDescarregar}</span>
                </p>
              )}

              {falhaAoAbrir ? (
                <AvisoDeFalha
                  titulo="Não foi possível abrir esta timeline"
                  mensagem={falhaAoAbrir}
                  aoTentarDeNovo={() => void abrir(aberto.id)}
                />
              ) : !pedido || aAbrir === aberto.id ? (
                <div className="flex flex-col gap-3" aria-busy="true">
                  <div className="bo-skeleton h-2.5 w-40" aria-hidden />
                  <div className="bo-skeleton h-11 w-full" aria-hidden />
                  <div className="bo-skeleton h-16 w-full" aria-hidden />
                  <span className="sr-only">A abrir a timeline…</span>
                </div>
              ) : (
                <>
                  {vistaDoDia === "grelha" && (
                    /* A ANÁLISE É A DA LISTA, e não uma segunda conta feita
                       aqui: é a mesma `analisarODia` sobre os mesmos momentos,
                       e o `guiaoMudou` mantém a cache em dia a cada edição. Um
                       `analisarODia` escrito neste sítio dava, no dia em que
                       uma das duas fosse afinada, uma grelha a discordar da
                       pastilha que está na linha ao lado. */
                    <GrelhaDoDia
                      dia={aberto.dia}
                      agora={aberto.hoje ? relogio : null}
                      chaveDoEvento={pedido.id}
                    />
                  )}
                  {/* O painel de edição fica MONTADO, escondido, e não
                      desmontado: ele guarda no seu estado o aviso do 409 com o
                      gesto por reaplicar, e desmontá-lo ao trocar de vista
                      deitava fora a única saída que ela tem para não perder o
                      que escreveu. `hidden` tira-o do ecrã e da árvore de
                      acessibilidade sem lhe tocar no estado. */}
                  {/* ── A EDIÇÃO E A FOLHA, LADO A LADO ─────────────────────
                      «Quero que dê para ir vendo ao lado como está a ficar à
                      medida que vamos preenchendo o timeline, para não termos
                      que estar sempre a fazer download para ver como está.»

                      É a queixa certa: a folha só existia depois de um
                      download. Escrever doze momentos e descarregar doze vezes
                      para ver se as colunas ficam bem é trabalho que o ecrã
                      devia fazer sozinho.

                      Duas colunas só a partir do `lg`. Abaixo disso a folha
                      vai para BAIXO do editor e não desaparece: numa coluna
                      estreita ela deixaria de se ler, mas continua a ser o que
                      ela quer conferir depois de escrever. */}
                  <div
                    hidden={vistaDoDia === "grelha"}
                    className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:items-start"
                  >
                    <EventTimeline
                      key={pedido.id}
                      quote={pedido}
                      onChange={(momentos) => guiaoMudou(pedido.id, momentos)}
                      modelos={modelos.data?.modelos}
                      aoGuardarComoModelo={(nome, momentos) => void guardarModelo(nome, momentos)}
                    />
                    {/* Colada ao topo: ela escreve no fundo do editor (a linha
                        de acrescentar) e confere no topo da folha. Sem o
                        `sticky`, escrever o décimo momento levava a folha para
                        fora do ecrã. */}
                    <aside className="lg:sticky lg:top-4">
                      <p className="bo-eyebrow mb-2 text-[var(--bo-text-muted)]">Como vai ficar</p>
                      <FolhaDaTimeline
                        titulo={tituloDaFolha(aberto)}
                        adultos={pedido.guests ? String(pedido.guests) : ""}
                        momentos={aberto.momentos}
                      />
                    </aside>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ── A LINHA: UM DIA INTEIRO EM QUATRO LINHAS DE TEXTO E UMA FITA ──────────
 *
 * O botão é a linha toda e não um chevron ao canto: no telemóvel, um alvo de
 * 44 px ao lado de um cartão de 90 é a maneira de falhar o toque com a mão
 * ocupada. O nome acessível diz o dia, o cliente e o estado — que é o que
 * distingue esta linha das outras dezanove para quem ouve o ecrã.
 */
function LinhaDeGuiao({
  guiao,
  janela,
  activo,
  relogio,
  aoAbrir,
}: {
  guiao: GuiaoNaLista;
  janela: ReturnType<typeof janelaComum>;
  activo: boolean;
  relogio: number | null;
  aoAbrir: () => void;
}) {
  const emChoque = useMemo(() => {
    const ids = new Set<string>();
    for (const c of guiao.dia.choques) {
      ids.add(c.a.id);
      ids.add(c.b.id);
    }
    return ids;
  }, [guiao.dia.choques]);

  const quando = quandoPorExtenso(guiao.faltamDias);
  const nome = `${quando}, ${dataPorExtenso(guiao.data)} — ${guiao.cliente || "sem nome"}. ${guiao.sinais
    .map((s) => s.frase)
    .join(". ")}`;

  const temMomentos = guiao.momentos.length > 0;

  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-label={nome}
      aria-current={activo ? "true" : undefined}
      className={`alvo-toque w-full rounded-[var(--bo-raio-conteudo)] border p-3 text-left ${ESTADO} ${PRESSAO} ${
        activo
          ? "border-[var(--bo-accent)] bg-[var(--bo-accent-lavagem)]"
          : "border-[var(--bo-hairline)] bg-[var(--bo-surface)] hover:bg-[var(--bo-tinta-3)]"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-[var(--bo-text)]">
          {guiao.cliente || "Sem nome"}
        </span>
        <span
          className={`shrink-0 text-[11px] tabular-nums ${
            guiao.hoje ? "font-semibold text-[var(--bo-accent)]" : "text-[var(--bo-text-muted)]"
          }`}
        >
          {quando}
        </span>
      </div>
      <p className="bo-text-muted mt-0.5 truncate text-xs">
        {dataPorExtenso(guiao.data)}
        {guiao.evento ? ` · ${guiao.evento}` : ""}
      </p>

      <div className="mt-2.5">
        {temMomentos ? (
          <ReguaDoDia
            dia={guiao.dia}
            janela={janela}
            emChoque={emChoque}
            agora={relogio}
            rotulo={`Régua do dia de ${guiao.cliente || "este evento"}: ${
              guiao.dia.inicio !== null && guiao.dia.fim !== null
                ? `das ${horaDoMinuto(guiao.dia.inicio)} às ${horaDoMinuto(guiao.dia.fim)}`
                : "sem horas legíveis"
            }, ${guiao.momentos.length} momentos.`}
          />
        ) : (
          /* Um dia sem guião não desenha uma régua vazia: uma fita cinzenta de
             bordo a bordo lê-se como «um dia inteiro ocupado por nada». Fica um
             traço tracejado, que é a forma de «isto está por preencher». */
          <span
            aria-hidden="true"
            className="block h-2 rounded-full border border-dashed border-[var(--bo-hairline-strong)]"
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {guiao.sinais.map((s) => (
          <Pastilha key={s.tipo} sinal={s} />
        ))}
        {temMomentos && guiao.dia.inicio !== null && guiao.dia.fim !== null && (
          <span className="bo-text-faint ms-auto text-[11px] tabular-nums">
            {horaDoMinuto(guiao.dia.inicio)}–{horaDoMinuto(guiao.dia.fim)} ·{" "}
            {porExtenso(guiao.dia.ocupado)}
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * ── O PAINEL DE HOJE ──────────────────────────────────────────────────────
 *
 * A pergunta que ela faz de pé, numa quinta, com as mãos ocupadas — e que tem
 * de ter resposta SEM tocar em nada. Por isso vive no topo da vista, antes da
 * lista e antes de qualquer filtro: no dia do evento, entrar nesta vista é já
 * ter a resposta no ecrã.
 *
 * O que está a decorrer vem pequeno, como contexto; o que vem a SEGUIR vem
 * grande, porque é essa a pergunta. É a mesma hierarquia do `EventTimeline`, de
 * propósito: o mesmo dia visto de dois sítios não pode ler-se de duas maneiras.
 */
function PainelDeHoje({
  guiao,
  relogio,
  aoAbrir,
}: {
  guiao: GuiaoNaLista;
  relogio: number;
  aoAbrir: () => void;
}) {
  const seguinte = useMemo(
    () => oQueVemASeguir(guiao.dia.blocos, relogio),
    [guiao.dia.blocos, relogio],
  );
  const janela = useMemo(() => janelaComum([guiao]), [guiao]);
  const emChoque = useMemo(() => {
    const ids = new Set<string>();
    for (const c of guiao.dia.choques) {
      ids.add(c.a.id);
      ids.add(c.b.id);
    }
    return ids;
  }, [guiao.dia.choques]);

  return (
    <section
      aria-label="O evento de hoje"
      className="rounded-[var(--bo-raio-cartao)] border border-[var(--bo-accent)]/25 bg-[var(--bo-accent-lavagem)]/40 p-[var(--bo-p-cartao)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {/* O `.bo-eyebrow` do `globals.css` está FORA de camadas, portanto ganha
            a qualquer `text-*` do Tailwind escrito aqui — pedir-lhe acento era
            escrever uma classe morta. A cor desta secção vive na moldura e na
            lavagem à volta, que é onde ela se vê. */}
        <p className="bo-eyebrow">Hoje · {guiao.cliente || "Sem nome"}</p>
        <span className="text-xs tabular-nums text-[var(--bo-text-muted)]">
          {horaDoMinuto(relogio)}
        </span>
      </div>

      {guiao.momentos.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--bo-text)]">
          O evento é hoje e ainda não tem guião. Abre-o e junta um modelo — leva um toque.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <ReguaDoDia
              dia={guiao.dia}
              janela={janela}
              emChoque={emChoque}
              agora={relogio}
              tamanho="painel"
              rotulo={`Régua do dia de hoje, das ${
                guiao.dia.inicio !== null ? horaDoMinuto(guiao.dia.inicio) : "?"
              } às ${guiao.dia.fim !== null ? horaDoMinuto(guiao.dia.fim) : "?"}.`}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              {seguinte.agora.length > 0 ? (
                <p className="text-sm leading-snug text-[var(--bo-text)]">
                  <span className="bo-text-muted">Agora · </span>
                  {seguinte.agora.map((b) => b.item.title).join(" · ")}
                </p>
              ) : (
                <p className="bo-text-muted text-sm">
                  {seguinte.terminado
                    ? "A timeline chegou ao fim."
                    : "Não há nada marcado neste momento."}
                </p>
              )}
              {seguinte.aSeguir && (
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-2xl font-semibold leading-none tabular-nums text-[var(--bo-text)]">
                    {seguinte.aSeguir.item.time}
                  </span>
                  <span className="text-sm text-[var(--bo-text)]">
                    {seguinte.aSeguir.item.title}
                  </span>
                  <span className="bo-text-muted text-xs tabular-nums">
                    daqui a {porExtenso(seguinte.faltam)}
                  </span>
                </p>
              )}
            </div>
            <Button size="sm" variant="secondary" onClick={aoAbrir}>
              Abrir o guião
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function IconeDeGuiao() {
  return (
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
  );
}
