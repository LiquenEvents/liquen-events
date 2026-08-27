"use client";

import { useRef, useState } from "react";
import { randomId } from "./util";
import { useToast } from "./Toast";
import { printRunSheet } from "./export";
import type { Quote, TimelineItem } from "@/lib/orcamento/types";
import { Button, Field, EmptyState } from "./ui";
import { DesistirDaEdicao } from "./ui/DesistirDaEdicao";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

interface Props {
  quote: Quote;
  onChange: (items: TimelineItem[]) => void;
}

// Sensible starting run sheet for a typical event day.
const TEMPLATE: Omit<TimelineItem, "id">[] = [
  { time: "09:00", title: "Montagem e decoração do espaço" },
  { time: "12:00", title: "Chegada de fornecedores (catering, som)" },
  { time: "16:00", title: "Receção dos convidados" },
  { time: "17:00", title: "Cerimónia" },
  { time: "18:30", title: "Cocktail de boas-vindas" },
  { time: "20:00", title: "Jantar" },
  { time: "23:00", title: "Festa / momento de dança" },
  { time: "02:00", title: "Encerramento e desmontagem" },
];

// Um dia de evento estende-se para lá da meia-noite: "02:00 Encerramento" é o
// FIM, não o princípio. Horas antes das 05:00 contam como +24h para ordenarem
// depois da noite, em vez de saltarem para o topo do guião.
function timeRank(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return Number.MAX_SAFE_INTEGER; // sem hora válida → fim
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins < 5 * 60 ? mins + 24 * 60 : mins;
}

function sortByTime(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => timeRank(a.time) - timeRank(b.time));
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
  // Edição inline de um campo de uma linha: commit em blur/Enter, Escape cancela.
  const [editing, setEditing] = useState<{ id: string; field: EditableField } | null>(null);
  const [draft, setDraft] = useState("");
  // A colisão fica no ECRÃ, e não num toast que desaparece: é onde o que ela
  // escreveu continua à vista e recuperável com um clique.
  const [colisoes, setColisoes] = useState<Colisao[]>([]);

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
    const momento = { id: randomId(), time, title: t, owner: owner.trim() || undefined };
    persist(`acrescentar «${time} ${t}» ao guião`, (atuais) => [...atuais, momento]);
    setTime("");
    setTitle("");
    setOwner("");
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
            <span className="rounded-full bg-[var(--bo-tinta-6)] px-2.5 py-1 text-[11px] tabular-nums text-[var(--bo-text-faint)]">
              {items.length} {items.length === 1 ? "momento" : "momentos"}
            </span>
            <button
              type="button"
              onClick={() => printRunSheet(quote)}
              title="Imprimir guião do dia"
              aria-label="Imprimir guião do dia"
              // 27×27 medidos a 375 px — um botão de ícone sem rótulo, que é
              // a classe de alvo mais fácil de falhar com o polegar.
              className="alvo-toque rounded-lg p-1.5 text-foreground/40 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] motion-safe:transition-colors"
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
        <div className="relative mb-5 pl-1">
          {/* vertical line */}
          <div className="absolute left-[3.25rem] top-3 bottom-3 w-px bg-[var(--bo-tinta-10)]" />
          <ul className="flex flex-col">
            {items.map((i) => (
              <li
                key={i.id}
                className="group relative flex items-start gap-3 rounded-xl py-2.5 pr-1 hover:bg-[var(--bo-tinta-3)]"
              >
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
                    <DesistirDaEdicao onDesistir={() => setEditing(null)} oQue="a hora" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(i.id, "time", i.time)}
                    title="Editar hora"
                    // ── OS TRÊS BOTÕES DESTA LINHA SÃO EDIÇÕES A SÉRIO ─────
                    // Medidos a 375 px com o guião cheio: a hora dava 48×18,
                    // o momento 155×39 e o responsável 155×16. Os três abrem
                    // um campo de edição, e o guião do dia é lido e corrigido
                    // no local, de pé. `alvo-toque` põe-nos nos 44 sob dedo.
                    // `!justify-end` mantém a hora encostada à direita (a
                    // classe centra por omissão) e `pt-0.5` sai porque a
                    // centragem vertical passa a ser dela.
                    className="alvo-toque !justify-end w-12 shrink-0 rounded-md text-right text-xs font-semibold tabular-nums text-[#4d6350] decoration-dotted underline-offset-2 hover:underline"
                  >
                    {i.time}
                  </button>
                )}
                <span className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#4d6350] ring-4 ring-white" />
                <div className="min-w-0 flex-1">
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
                      <DesistirDaEdicao onDesistir={() => setEditing(null)} oQue="o momento" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(i.id, "title", i.title)}
                      title="Editar momento"
                      className="alvo-toque !justify-start w-full rounded-md text-left text-sm leading-snug text-[var(--bo-text)] decoration-dotted underline-offset-2 hover:underline"
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
                      <DesistirDaEdicao onDesistir={() => setEditing(null)} oQue="o responsável" />
                    </span>
                  ) : (
                    i.owner && (
                      <button
                        type="button"
                        onClick={() => startEdit(i.id, "owner", i.owner ?? "")}
                        title="Editar responsável"
                        className="alvo-toque !justify-start mt-0.5 w-full rounded-md text-left text-xs text-foreground/45 decoration-dotted underline-offset-2 hover:underline"
                      >
                        {i.owner}
                      </button>
                    )
                  )}
                </div>
                {/* MEDIDO a 768×1024 com dedo (o iPad em retrato): 10 destes botões e
                      ZERO visíveis. 768 passa dos 640 do `sm:`, portanto `sm:opacity-0`
                      disparava — e sem rato não há como o revelar. A pergunta certa é sobre o
                      PONTEIRO, não sobre a largura: `com-rato:` (globals.css) esconde só onde
                      há mesmo rato, e a 375 e a 768 com dedo ficam os 10 visíveis.

                      Fica um ícone e não um menu «⋯»: com UMA acção por linha, o menu custa
                      os mesmos 44 px e cobra um toque a mais para chegar ao mesmo sítio. */}
                <button
                  onClick={() => remove(i.id)}
                  className="alvo-toque shrink-0 rounded-md p-1 text-foreground/25 sem-rato:text-[var(--bo-text-faint)] opacity-100 com-rato:opacity-0 hover:text-[#8a2a22] com-rato:focus-visible:opacity-100 motion-safe:transition-all com-rato:group-hover:opacity-100"
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
              </li>
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
