"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { idUnico } from "@/lib/id-unico";
import type { EventMaterialItem } from "@/lib/event-material-types";
import { progresso } from "@/lib/event-material-types";
import {
  aplicarFila,
  fechoPendente,
  juntarAFila,
  lerFila,
  escreverFila,
  chaveEvento,
  type EstadoDoFecho,
  type MarcacaoPendente,
} from "@/lib/material-offline";
import { AvisoDeFalha } from "../../AvisoDeFalha";

/**
 * A VISTA DE CARREGAMENTO — telemóvel, uma mão, sem rede.
 *
 * Desenhada para 375 px primeiro. Quem usa isto está de pé, com as mãos
 * ocupadas, a carregar uma carrinha numa quinta onde a rede vai e vem.
 *
 * ── As regras que este ecrã segue ─────────────────────────────────────────
 *  • A LINHA INTEIRA é o alvo de toque, 56 px de altura. A caixa é um desenho,
 *    não o alvo: acertar num quadrado de 24 px com a carrinha a abanar é o que
 *    faz desistir e marcar tudo no fim, de memória.
 *  • Marcar escreve PRIMEIRO no armazenamento local. O dedo nunca espera pela
 *    rede.
 *  • Os CRÍTICOS por marcar travam o "carrinha carregada" com um aviso que diz
 *    QUAIS. Não bloqueia — às vezes há razão — mas obriga a confirmar.
 */

interface Props {
  quoteId: string;
  eventId: string;
  titulo: string;
  actor: string;
}

const idMarca = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : idUnico();

export default function Carregamento({ quoteId, eventId, titulo, actor }: Props) {
  const [itens, setItens] = useState<EventMaterialItem[]>([]);
  const [fila, setFila] = useState<MarcacaoPendente[]>([]);
  const [online, setOnline] = useState(true);
  const [aSincronizar, setASincronizar] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [veiculo, setVeiculo] = useState<string>("todos");
  /**
   * O estado da checklist como o SERVIDOR o conhece. A fila local manda por
   * cima — ver `estado`, mais abaixo.
   */
  const [estadoNoServidor, setEstadoNoServidor] = useState<string>("preparada");
  /**
   * O último envio da fila falhou?
   *
   * Isto existia como um `catch` vazio, e o vazio era o defeito: uma fila que
   * nunca chega ao servidor ficava indistinguível de uma a caminho. O
   * cabeçalho dizia «3 marcações guardadas para enviar» tanto no caso em que
   * iam a caminho como no caso em que estavam presas — e é a diferença entre
   * fechar a carrinha descansada e voltar ao computador a confirmar.
   */
  const [envioFalhou, setEnvioFalhou] = useState(false);
  /**
   * O que a leitura disse quando falhou. `null` é "correu bem"; a string vazia é
   * "falhou e o servidor não explicou". São três estados e não dois, pela mesma
   * razão que estão escritas no painel irmão (`EventMaterial`, que lê ESTA
   * mesma rota): "não há checklist" e "não consegui perguntar" não são a mesma
   * coisa, e este ecrã tem uma frase para a primeira que é cara de mais para se
   * dizer por engano.
   */
  const [falha, setFalha] = useState<string | null>(null);

  // ── Arranque: o que está guardado localmente aparece JÁ ────────────────────
  useEffect(() => {
    try {
      const bruto = localStorage.getItem(chaveEvento(eventId));
      if (bruto) setItens(JSON.parse(bruto));
    } catch {
      /* sem armazenamento: vai-se à rede como sempre */
    }
    setFila(lerFila(localStorage));
    setOnline(navigator.onLine);
  }, [eventId]);

  const guardarLocal = useCallback(
    (lista: EventMaterialItem[]) => {
      try {
        localStorage.setItem(chaveEvento(eventId), JSON.stringify(lista));
      } catch {
        /* quota: o ecrã continua certo, só não sobrevive a fechar */
      }
    },
    [eventId],
  );

  const buscar = useCallback(async () => {
    try {
      /**
       * ══════════════════════════════════════════════════════════════════════
       * UMA LEITURA FALHADA NÃO PODE SAIR DAQUI CALADA
       * ══════════════════════════════════════════════════════════════════════
       *
       * Não havia `res.ok`: era um `fetch(…).then((x) => x.json())`. Numa
       * resposta de erro o corpo é `{ error: "…" }`, portanto `r.itens` ficava
       * `undefined`, o `Array.isArray` apanhava-o e não se escrevia nada — nada
       * rebentava, e era esse o problema. A falha não deixava rasto NENHUM.
       *
       * Os gatilhos são os do costume nesta rota: 401 quando a sessão caduca ou
       * quando alguém carrega em Sair noutro aparelho, 500 quando as tabelas do
       * material não respondem. E o telemóvel que abre o endereço da carrinha é
       * quase sempre um que nunca o abriu — sem cópia local, a lista fica a zero
       * e o ecrã passava a afirmar, a meio de uma quinta:
       *
       *     "Sem checklist. Gera-a primeiro no pedido, no computador."
       *
       * Falso — a checklist existe, feita — e caro: o passo que essa frase manda
       * dar é regenerá-la, e a regeneração só preserva o que está CARREGADO. As
       * marcações de devolvido e de em falta ficavam para trás.
       *
       * O aviso de "Sem rede" do cabeçalho também não cobria isto: com um 401 o
       * browser está online e o `navigator.onLine` é `true`.
       */
      const res = await fetch(`/api/orcamento/${quoteId}/material`);
      if (!res.ok) {
        // A frase do SERVIDOR quando ele deu uma: é a diferença entre "não foi
        // possível ler" e uma instrução que resolve o problema sozinha.
        const corpo = await res.json().catch(() => null);
        setFalha(typeof corpo?.error === "string" ? corpo.error : "");
        return;
      }
      const r = await res.json();
      if (typeof r?.evento?.status === "string") setEstadoNoServidor(r.evento.status);
      if (Array.isArray(r?.itens)) {
        // A fila por cima: uma marcação feita enquanto este pedido ia a
        // caminho não pode ser apagada pela resposta dele.
        const juntos = aplicarFila<EventMaterialItem>(r.itens, lerFila(localStorage), eventId);
        setItens(juntos);
        guardarLocal(juntos);
      }
      setFalha(null);
    } catch {
      /* offline: fica o que está guardado, e o cabeçalho já diz "Sem rede" */
      setFalha("");
    }
  }, [quoteId, eventId, guardarLocal]);

  /** Descarrega a fila. Só remove o que o servidor confirmou. */
  const sincronizar = useCallback(async () => {
    const pendentes = lerFila(localStorage).filter((m) => m.eventId === eventId);
    if (pendentes.length === 0) return;
    setASincronizar(true);
    try {
      const res = await fetch(`/api/orcamento/${quoteId}/material/marcar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcacoes: pendentes }),
      });
      if (!res.ok) throw new Error();
      const r = await res.json();
      // Só se limpa o que FOI enviado: marcações feitas durante o envio ficam
      // na fila em vez de desaparecerem com ela.
      const enviados = new Set(pendentes.map((m) => m.id));
      const resto = lerFila(localStorage).filter((m) => !enviados.has(m.id));
      escreverFila(localStorage, resto);
      setFila(resto);
      if (typeof r?.estado === "string") setEstadoNoServidor(r.estado);
      if (Array.isArray(r?.itens)) {
        const juntos = aplicarFila<EventMaterialItem>(r.itens, resto, eventId);
        setItens(juntos);
        guardarLocal(juntos);
      }
      setEnvioFalhou(false);
    } catch {
      // Continua na fila — nada se perde, que é o que esta página promete. Mas
      // DIZ-SE: um `catch` vazio aqui fazia uma fila presa parecer uma fila a
      // caminho, e quem está ao lado da carrinha não tem como saber a
      // diferença.
      setEnvioFalhou(true);
    } finally {
      setASincronizar(false);
    }
  }, [quoteId, eventId, guardarLocal]);

  useEffect(() => {
    void buscar();
    void sincronizar();
    const volta = () => {
      setOnline(true);
      void sincronizar();
    };
    const cai = () => setOnline(false);
    window.addEventListener("online", volta);
    window.addEventListener("offline", cai);
    return () => {
      window.removeEventListener("online", volta);
      window.removeEventListener("offline", cai);
    };
  }, [buscar, sincronizar]);

  function marcar(item: EventMaterialItem) {
    const carregado = Boolean(item.loadedAt);
    const agora = new Date().toISOString();
    const marca: MarcacaoPendente = {
      id: idMarca(),
      eventId,
      itemId: item.id,
      accao: carregado ? "unloaded" : "loaded",
      markedAt: agora,
      actor,
    };

    // 1) O ecrã muda JÁ. 2) Guarda-se. 3) Só depois a rede.
    const proximos = itens.map((i) =>
      i.id === item.id
        ? { ...i, loadedAt: carregado ? undefined : agora, loadedBy: carregado ? undefined : actor }
        : i,
    );
    setItens(proximos);
    guardarLocal(proximos);

    const novaFila = juntarAFila(lerFila(localStorage), marca);
    escreverFila(localStorage, novaFila);
    setFila(novaFila);

    if (navigator.onLine) void sincronizar();
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O GESTO QUE FECHA O CARREGAMENTO PASSA A GRAVAR ALGUMA COISA
   * ════════════════════════════════════════════════════════════════════════
   *
   * O botão «Dar por carregada» existia, ocupava a barra inferior inteira, e
   * **não fazia nada**: quando não faltava nenhum crítico, o `onClick` não
   * executava acção nenhuma. O «Seguir assim», do outro lado do aviso, só
   * fechava o aviso. O gesto que encerra a tarefa era o único da página que não
   * escrevia.
   *
   * Agora escreve, e escreve como tudo o resto aqui escreve: **primeiro no
   * telemóvel, e a rede a seguir**. Fechar a carrinha é o momento MAIS provável
   * de não haver rede — é o último gesto, já com tudo lá dentro e a caminho do
   * portão —, e um fecho que exigisse ligação era um fecho que se perdia
   * precisamente quando conta.
   */
  function marcarFecho(para: EstadoDoFecho) {
    const marca: MarcacaoPendente = {
      id: idMarca(),
      eventId,
      // Vazio de propósito: isto não é sobre nenhuma linha.
      itemId: "",
      accao: "fechado",
      valor: para,
      markedAt: new Date().toISOString(),
      actor,
    };
    const novaFila = juntarAFila(lerFila(localStorage), marca);
    escreverFila(localStorage, novaFila);
    setFila(novaFila);
    setConfirmar(false);
    if (navigator.onLine) void sincronizar();
  }

  const visiveis = useMemo(
    () => (veiculo === "todos" ? itens : itens.filter((i) => (i.vehicleId ?? "") === veiculo)),
    [itens, veiculo],
  );

  const p = useMemo(() => progresso(visiveis), [visiveis]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, EventMaterialItem[]>();
    for (const i of visiveis) {
      const lista = mapa.get(i.category) ?? [];
      lista.push(i);
      mapa.set(i.category, lista);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visiveis]);

  const veiculos = useMemo(() => {
    const ids = new Set(itens.map((i) => i.vehicleId).filter(Boolean) as string[]);
    return [...ids];
  }, [itens]);

  const pendentesDeste = fila.filter((m) => m.eventId === eventId).length;

  /**
   * O estado que se MOSTRA: a fila por cima do servidor, pela mesma razão que
   * o `aplicarFila` existe para as linhas. Sem isto, fechar a carrinha sem rede
   * não mudava nada no ecrã — e é aí que se carrega no botão.
   */
  const fecho = fechoPendente(fila, eventId);
  const estado = fecho ? fecho.valor : estadoNoServidor;
  const fechada = estado === "carregada" || estado === "devolvida";
  /** A hora do fecho, quando é este telemóvel que a sabe. */
  /**
   * ════════════════════════════════════════════════════════════════════════
   * OS TÍTULOS DE SECÇÃO PARAM ONDE O CABEÇALHO ACABA — MEDIDO, NÃO ESCRITO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Aqui estava `sticky top-[132px]`. O 132 era o fundo do cabeçalho na
   * geometria em que foi escrito: o `<main>` público punha 96 px de `pt-24` e
   * cada raiz do back office cancelava-os com um `-mt-24`, e no meio dessa
   * conta o cabeçalho acabava aos 187 — mas o título ainda nem tinha chegado
   * ao ponto de colar, portanto o número nunca chegou a ser posto à prova.
   *
   * Ao tirar o `pt-24` e os `-mt-24` (o back office saiu do grupo do sítio e
   * levou o `<main>` com ele), a página passou a começar no zero. MEDIDO a
   * 390×844, num telemóvel:
   *
   *     cabeçalho      0 → 91 px
   *     título         132 → 165 px      ← 41 px ABAIXO do cabeçalho
   *     primeira linha 124 → 180 px      ← e o título por cima dela
   *
   * `document.elementFromPoint` no meio da linha devolvia o `<h2>`: a primeira
   * linha de cada secção deixou de se poder TOCAR. Foram os dois passeios de
   * telemóvel do carregamento que o apanharam — cento e vinte segundos a
   * tentar clicar num botão tapado.
   *
   * Um número escrito à mão que descreve a altura de outra coisa fica errado no
   * dia em que essa outra coisa muda, e não se queixa. Passa a ser medido, como
   * já se faz para a barra de acção do estúdio e para a barra de baixo do back
   * office: o cabeçalho diz a sua altura, e os títulos colam exactamente aí.
   *
   * O valor de reserva (5,75rem = 92 px) é a altura medida deste cabeçalho, e
   * serve o primeiro desenho — antes de a medição correr — em vez de deixar os
   * títulos a colar no zero, por baixo do contador.
   */
  const cabecalho = useRef<HTMLElement | null>(null);
  const caixa = useRef<HTMLDivElement | null>(null);
  const [alturaDoCabecalho, setAlturaDoCabecalho] = useState(92);
  useEffect(() => {
    const el = cabecalho.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => setAlturaDoCabecalho(Math.ceil(el.getBoundingClientRect().height));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const horaDoFecho = fecho
    ? new Date(fecho.markedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div
      ref={caixa}
      className="mx-auto min-h-dvh w-full max-w-[640px] bg-white pb-28"
      style={{ "--carregamento-cabecalho": `${alturaDoCabecalho}px` } as React.CSSProperties}
    >
      {/* Cabeçalho fixo: o contador é a única coisa que se olha a meio do
          carregamento, por isso nunca sai do ecrã. */}
      <header
        ref={cabecalho}
        className="sticky top-0 z-10 border-b border-foreground/10 bg-white/95 px-4 py-3 backdrop-blur"
      >
        <p className="truncate text-sm text-foreground/70">{titulo}</p>
        <p className="text-2xl font-medium tabular-nums">
          {p.carregados} <span className="text-foreground/45">de {p.total}</span>{" "}
          <span className="text-base text-foreground/60">carregados</span>
        </p>
        <div
          role="progressbar"
          aria-label="Progresso do carregamento"
          aria-valuemin={0}
          aria-valuemax={p.total}
          aria-valuenow={p.carregados}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
        >
          {/* `scaleX` e não `width`: mudar a largura obriga o telemóvel a
              refazer a disposição a cada marcação, e este é o ecrã que corre
              num telemóvel com a carrinha a abanar. `motion-safe:` porque quem
              desligou o movimento no sistema não o quer aqui. */}
          <div
            className="h-full w-full origin-left rounded-full bg-[#4d6350] motion-safe:transition-transform motion-safe:duration-elemento motion-safe:ease-out"
            style={{ transform: `scaleX(${p.total ? p.carregados / p.total : 0})` }}
          />
        </div>
        {(!online || pendentesDeste > 0) && (
          <p
            className={`mt-2 text-xs ${envioFalhou && online ? "text-[#8a2a22]" : "text-foreground/60"}`}
          >
            {!online && "Sem rede. "}
            {pendentesDeste > 0 &&
              `${pendentesDeste} ${pendentesDeste === 1 ? "marcação guardada" : "marcações guardadas"} para enviar.`}
            {aSincronizar && " A enviar…"}
            {/* Três estados e não dois: a caminho, presa, e guardada sem rede.
                Antes eram todos a mesma frase — e uma fila presa lida como uma
                fila a caminho é como se descobre no dia seguinte que o
                carregamento nunca chegou ao escritório. */}
            {!aSincronizar &&
              online &&
              envioFalhou &&
              " Não deu para enviar — nada se perdeu, e tenta outra vez sozinho."}
          </p>
        )}
        {veiculos.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setVeiculo("todos")}
              className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                veiculo === "todos" ? "bg-foreground/[0.10]" : "bg-foreground/[0.04]"
              }`}
            >
              Todas
            </button>
            {veiculos.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVeiculo(v)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                  veiculo === v ? "bg-foreground/[0.10]" : "bg-foreground/[0.04]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </header>

      {itens.length === 0 ? (
        /**
         * ── LER FALHOU vs NÃO HÁ NADA PARA LER ─────────────────────────────
         * "Sem checklist" é uma AFIRMAÇÃO sobre o evento, e uma leitura que não
         * chegou a acontecer não a sabe fazer — muito menos mandar alguém que
         * está de pé ao lado da carrinha voltar ao computador para gerar de
         * novo uma lista que já existe (ver o `buscar`).
         *
         * Com a cópia local à vista não se desenha nada disto: uma lista velha
         * e verdadeira vale mais do que um aviso, e é com ela que se carrega.
         */
        falha !== null ? (
          <div className="px-4">
            <AvisoDeFalha
              titulo="Não foi possível ler a checklist"
              mensagem={falha}
              aoTentarDeNovo={() => void buscar()}
            />
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-foreground/60">
            Sem checklist. Gera-a primeiro no pedido, no computador.
          </p>
        )
      ) : (
        // A lista tem nome próprio: um leitor de ecrã anuncia onde entrou, em
        // vez de despejar trinta botões sem contexto.
        <div role="group" aria-label="Material a carregar">
          {porCategoria.map(([categoria, linhas]) => (
            <section key={categoria}>
              <h2 className="sticky top-[var(--carregamento-cabecalho,5.75rem)] bg-white/95 px-4 py-2 text-[11px] tracking-[0.14em] text-foreground/55 uppercase backdrop-blur">
                {categoria}
              </h2>
              <ul>
                {linhas.map((i) => {
                  const carregado = Boolean(i.loadedAt);
                  return (
                    <li key={i.id}>
                      {/* A LINHA INTEIRA é o botão. 56 px de altura: acertar num
                        quadrado pequeno com a carrinha a abanar é o que faz
                        marcar tudo no fim, de memória. */}
                      <button
                        type="button"
                        onClick={() => marcar(i)}
                        aria-pressed={carregado}
                        className="flex min-h-[56px] w-full items-center gap-3 border-b border-foreground/[0.06] px-4 text-left active:bg-foreground/[0.04]"
                      >
                        <span
                          aria-hidden
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${
                            carregado
                              ? "border-[#4d6350] bg-[#4d6350] text-white"
                              : "border-foreground/25"
                          }`}
                        >
                          {carregado ? "✓" : ""}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate ${carregado ? "text-foreground/45 line-through" : ""}`}
                          >
                            {i.critical && <span className="text-[#a03a1a]">▲ </span>}
                            {i.name}
                          </span>
                          {i.note && (
                            <span className="block truncate text-xs text-foreground/55">
                              {i.note}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-foreground/70">
                          {i.qty}
                          {i.unit ? ` ${i.unit}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Barra fixa: o gesto que fecha o carregamento fica sempre ao alcance do
          polegar, sem ter de rolar até ao fim de 41 linhas. */}
      {itens.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[640px] border-t border-foreground/10 bg-white/95 p-4 backdrop-blur">
          {fechada ? (
            /* O DESFECHO À VISTA, e uma saída.
               Uma acção que não deixa marca é indistinguível de uma que não
               aconteceu; e uma que não se desfaz, num ecrã usado com uma mão a
               abanar dentro de uma carrinha, é um toque enganado que fica. */
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 flex-1 text-sm">
                <strong className="font-medium text-[#4d6350]">Carrinha dada por carregada</strong>
                {horaDoFecho && <span className="text-foreground/60"> às {horaDoFecho}</span>}
                {p.carregados < p.total && (
                  <span className="text-foreground/55"> · {p.total - p.carregados} por marcar</span>
                )}
              </p>
              {estado !== "devolvida" && (
                <button
                  type="button"
                  onClick={() => marcarFecho("preparada")}
                  className="alvo-toque shrink-0 rounded-lg px-2 text-xs text-foreground/60 underline decoration-dotted underline-offset-2"
                >
                  Reabrir
                </button>
              )}
            </div>
          ) : confirmar && p.criticosPorCarregar.length > 0 ? (
            <div>
              <p className="text-sm">
                Faltam {p.criticosPorCarregar.length} itens críticos:{" "}
                <strong>{p.criticosPorCarregar.map((i) => i.name).join(", ")}</strong>.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmar(false)}
                  className="min-h-[48px] flex-1 rounded-xl bg-foreground/[0.06] px-4"
                >
                  Voltar
                </button>
                {/* «Seguir assim» fechava o aviso e mais nada — a pessoa
                    carregava, o aviso sumia, e ficava a achar que tinha
                    fechado o carregamento. Agora fecha-o mesmo. */}
                <button
                  type="button"
                  onClick={() => marcarFecho("carregada")}
                  className="min-h-[48px] flex-1 rounded-full bg-[#4d6350] px-4 text-white"
                >
                  Seguir assim
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (p.criticosPorCarregar.length > 0) setConfirmar(true);
                else marcarFecho("carregada");
              }}
              className="min-h-[52px] w-full rounded-full bg-[#4d6350] px-4 text-white disabled:opacity-45"
              disabled={p.carregados === 0}
            >
              {p.carregados === p.total
                ? "Carrinha carregada"
                : `Dar por carregada (${p.carregados}/${p.total})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
