"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Quote, CalendarEvent, CalendarEventKind } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { useToast } from "./Toast";
import { isDateKey, todayKey } from "./util";
import {
  Button,
  CampoDeHora,
  Card,
  EmptyState,
  Field,
  PerguntaDestrutiva,
  Segmented,
  cn,
} from "./ui";
import CalendarioAno from "./CalendarioAno";
import {
  GlifoDoTipo,
  ListaDeCalendarios,
  TIPOS,
  TIPO_META,
  useCalendarios,
} from "./CalendariosFiltraveis";
import { ChipDoDia, MaisDoDia } from "./ChipDoDia";
import { MESES, anoDoCalendario, fechadosNoAno } from "@/lib/orcamento/ano-do-calendario";
import { SAIDA, SAIDA_FUNDO, useSaidaDeUmSo } from "./ui/saida";
import { useCachedList } from "./useCachedList";
import { useTrincoDeScroll } from "./useTrincoDeScroll";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
/**
 * Os nomes dos meses vêm do módulo que faz as contas do ano
 * (`lib/orcamento/ano-do-calendario`), e não de uma segunda lista aqui.
 *
 * Havia uma cópia escrita à mão neste ficheiro. Com a vista de ano montada
 * passavam a ser duas listas a nomear os mesmos doze meses no MESMO ecrã — e
 * duas listas a dizer o mesmo é como se descobre, um dia, que uma delas diz
 * «Setembro» onde a outra diz «Sétembro».
 */
const MONTHS: readonly string[] = MESES;

const STATUS_COLOR: Record<string, string> = {
  pendente: "#8a8a82",
  em_revisao: "#9aa36a",
  cotado: "#7c854b",
  aceite: "#525a2f",
  rejeitado: "#5a5a55",
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTADO DE UM PEDIDO NÃO PODE VIVER SÓ NA COR DO PONTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `STATUS_COLOR` acima pinta um ponto de 6 px à frente de cada pedido — na
 * grelha do mês e no painel do dia — e era o ÚNICO sítio onde o estado
 * aparecia. O nome acessível do botão dizia «Abrir pedido de Marta Nunes —
 * Casamento» e mais nada; o ponto do painel do dia é `aria-hidden`. Ou seja:
 * para quem lê com um leitor de ecrã o estado simplesmente não existia, e para
 * quem vê ficava dependente de distinguir cinco tons.
 *
 * E dois deles não se distinguem mesmo com visão de cor completa: «Novo» é
 * `#8a8a82` e «Perdido» é `#5a5a55` — dois cinzentos a 6 px, lado a lado no
 * mesmo mês. Um pedido novo e um pedido perdido são as duas pontas opostas do
 * funil, e eram o mesmo ponto cinzento.
 *
 * A cura é a PALAVRA, e é a mesma palavra do resto da casa (o `STATUS_META` da
 * Visão Geral): à vista no painel do dia, onde há linha para ela, e no nome
 * acessível dos dois sítios. A cor do ponto fica como está — continua a ser um
 * atalho útil para quem já a conhece —, mas deixa de ser a única via.
 *
 * Porque é que NÃO leva também um ícone por estado: a etiqueta da grelha é
 * `text-[9px]` com o nome já truncado, e o ponto tem 6 px. Um glifo diferente
 * por estado nesse tamanho não se lê — acrescenta ruído sem acrescentar
 * informação, e a informação que falta já vai na palavra.
 */
const STATUS_LABEL: Record<string, string> = {
  pendente: "Novo",
  em_revisao: "Aguardar resposta",
  cotado: "Proposta enviada",
  aceite: "Ganho",
  rejeitado: "Perdido",
};

/** A palavra do estado, ou o valor cru se for um estado que o mapa não conhece. */
function estadoEmPalavra(status: string): string {
  return STATUS_LABEL[status] ?? status ?? "—";
}

/**
 * Os quatro tipos — o rótulo e a cor — vivem no `CalendariosFiltraveis.tsx`,
 * que é onde eles passaram a ser CALENDÁRIOS e não uma legenda. Estavam aqui
 * com quatro hexadecimais escritos à mão; a razão da mudança está lá.
 */

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Evento";
}

/** Build and download an .ics calendar with every dated event. */
function exportIcs(quotes: Quote[]) {
  const day = (iso: string) => iso.replace(/-/g, "");
  // Escape per RFC 5545 instead of blanking commas/semicolons.
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Liquen Events//Back Office//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const q of quotes) {
    // Only real calendar dates — free-form values ("a definir") would otherwise
    // emit a malformed `DTSTART;VALUE=DATE:adefinir`. Skip them.
    if (!isDateKey(q.date)) continue;
    // DTEND is exclusive for all-day events: the day after the last day. Honour
    // multi-day ranges (endDate) so a 3-day wedding shows as 3 days, not 1.
    const lastDay = q.endDate && isDateKey(q.endDate) && q.endDate >= q.date ? q.endDate : q.date;
    const dtEnd = new Date(Date.parse(lastDay + "T00:00:00Z") + 86_400_000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const title = `${eventTypeLabel(q)} — ${q.name}`;
    const desc = [
      q.location && `Local: ${q.location}`,
      q.guests && `${q.guests} convidados`,
      q.phone && `Tel: ${q.phone}`,
    ]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${q.id}@liquen-events.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(q.date)}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${esc(title)}`,
      q.location ? `LOCATION:${esc(q.location)}` : "",
      desc ? `DESCRIPTION:${esc(desc)}` : "",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.filter(Boolean).join("\r\n")], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "liquen-eventos.ics";
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  quotes: Quote[];
  onOpen: (q: Quote) => void;
  /**
   * ── O QUE ABRE DA LISTA DOS PRÓXIMOS EVENTOS ──────────────────────────
   *
   * «Quando carrego num destes vai para a página antiga que havia para fazer
   * propostas. Coloca para ir para a página de fazer proposta do cliente que
   * carregámos.»
   *
   * A lista dos próximos eventos e a grelha respondem a perguntas diferentes.
   * Na grelha, tocar num evento é «mostra-me este pedido» — o painel do pedido
   * é a resposta certa e fica. Na lista dos próximos, o que ela vai fazer a
   * seguir é ESCREVER a proposta daquele casal: é a lista de trabalho da
   * semana, não um índice.
   *
   * Por isso são duas portas e não uma. Quando esta não é dada, a lista cai no
   * `onOpen` — nunca fica sem porta nenhuma.
   */
  onFazerProposta?: (q: Quote) => void;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// Add-event dialog with LOCAL form state. Extracted from Calendario so typing a
// title/time/note re-renders only this small dialog — not the parent and its
// 42-cell month grid + upcoming list. onCreate persists the completed payload
// (the parent appends the result and closes the modal on success).
function AddEventModal({
  aberto,
  date,
  dateLabel,
  onClose,
  onCreate,
}: {
  /**
   * ── E ISTO TAMBÉM SAI ────────────────────────────────────────────────
   *
   * O «Novo no calendário» entrava com a `.bo-entrada` e fechava A SECO: o
   * pai punha o `modalDate` a `null`, o nó desaparecia no fotograma seguinte
   * e o mês voltava. Meio gesto.
   *
   * O pai é o `Calendario` aqui em baixo — o mesmo ficheiro —, portanto a
   * saída resolve-se sem tocar em código partilhado. O que ele passa é isto:
   * `false` quer dizer «já fechou, fica só a apagar-te». Quem SEGURA o nó os
   * 200 ms continua a ser ele, porque é ele que tem o estado.
   */
  aberto: boolean;
  date: string;
  dateLabel: string;
  onClose: () => void;
  onCreate: (payload: {
    title: string;
    kind: CalendarEventKind;
    time: string;
    note: string;
    date: string;
  }) => Promise<boolean>;
}) {
  const [form, setForm] = useState<{
    title: string;
    kind: CalendarEventKind;
    time: string;
    note: string;
  }>({ title: "", kind: "evento", time: "", note: "" });
  const [saving, setSaving] = useState(false);
  // O trinco segue o `aberto` e não a montagem: enquanto o diálogo se apaga já
  // não é um diálogo, e o mês por trás volta a rolar no INSTANTE do gesto. Sem
  // isto, a saída ficava a atrasar a devolução da página por 200 ms — e a
  // regra da casa é que nenhuma animação atrasa uma tarefa.
  useTrincoDeScroll(aberto);

  async function submit() {
    const title = form.title.trim();
    if (!title || saving) return;
    setSaving(true);
    const ok = await onCreate({ ...form, title, date });
    // On success the parent unmounts us (modalDate → null). On failure keep the
    // dialog open so the user can retry (the parent already toasted the error).
    if (!ok) setSaving(false);
  }

  return (
    <div
      /* A `.bo-saida` larga os `pointer-events` dentro da própria classe, mas
         quem cobre o ecrã inteiro é ESTA moldura, e ela não leva classe
         nenhuma. Sem esta linha, o diálogo a desvanecer-se continuava a comer
         os toques da grelha do mês durante 200 ms — e o gesto seguinte de quem
         acabou de adicionar uma marcação é, quase sempre, carregar noutro dia. */
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        !aberto && "pointer-events-none",
      )}
      onClick={aberto ? onClose : undefined}
    >
      {/* Dois ramos e não um `cn()` no ramo aberto: a varredura dos véus
          (`entrada-dos-fundos.test.ts`) LÊ o ficheiro e procura a lista de
          classes por extenso no atributo — não sabe ler um `cn(…)`. Mesmo tipo
          e mesma posição, portanto o React reaproveita o elemento e a saída
          parte da opacidade em que o véu está. O `backdrop-blur-sm` fica FORA
          das duas animações, como manda o `globals.css`. */}
      {aberto ? (
        <div className="bo-entrada bo-entrada-fundo absolute inset-0 bg-black/60 backdrop-blur-sm" />
      ) : (
        <div
          className={cn(SAIDA_FUNDO, "absolute inset-0 bg-black/60 backdrop-blur-sm")}
          aria-hidden
        />
      )}
      <div
        /* Enquanto se apaga não tem `role`, não tem nome e não está no fio do
           teclado: para quem ouve o ecrã e para quem anda de Tab isto acabou no
           instante do gesto. O que fica é uma imagem. */
        role={aberto ? "dialog" : undefined}
        aria-modal={aberto ? "true" : undefined}
        aria-label={aberto ? `Adicionar ao calendário — ${dateLabel}` : undefined}
        aria-hidden={!aberto || undefined}
        inert={!aberto}
        /* O véu acendia (`bo-entrada-fundo`, na linha de cima) e a caixa que
           ele traz aparecia com a opacidade final no primeiro fotograma dele:
           o ecrã escurecia devagar e o diálogo saltava para lá. Meio gesto.

           Quatro píxeis e os mesmos 240 ms da casa. Não atrasa nada: o campo
           do título leva `autoFocus` e recebe o que se escrever desde o
           primeiro fotograma — a animação corre por cima disso, em `opacity`
           e `transform`, sem tocar no layout. */
        className={cn(
          /* Quatro píxeis, e sai por onde entrou. A entrada não tem `fill-mode`
             e larga o elemento; a saída tem `forwards`, e a rede dela é o nó
             deixar de existir no fotograma a seguir aos 200 ms — senão ficava
             um `transform` pendurado a criar bloco de contenção. */
          aberto ? "bo-entrada" : SAIDA,
          "relative w-full max-w-md bg-[var(--bo-surface)] border border-[var(--bo-hairline-strong)] rounded-2xl p-6 shadow-[var(--bo-sombra-modal)]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="bo-eyebrow mb-1.5">Novo no calendário</p>
            <p className="text-[var(--bo-tinta-72)] text-sm capitalize">{dateLabel}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className={`alvo-toque text-foreground/35 text-xl leading-none -mt-1 hover:text-[var(--bo-text-muted)] ${ESTADO} ${PRESSAO}`}
          >
            ×
          </button>
        </div>

        <fieldset className="mb-4">
          <legend className="bo-eyebrow mb-2">Tipo</legend>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={form.kind === k}
                onClick={() => setForm((f) => ({ ...f, kind: k }))}
                className={`px-3 py-1.5 rounded-full text-[10px] tracking-[0.1em] uppercase border ${ESTADO} ${PRESSAO} ${form.kind === k ? "text-cream" : "text-foreground/50 border-[var(--bo-hairline-strong)] hover:border-foreground/30"}`}
                style={
                  form.kind === k
                    ? { background: TIPO_META[k].cor, borderColor: TIPO_META[k].cor }
                    : undefined
                }
              >
                {TIPO_META[k].label}
              </button>
            ))}
          </div>
        </fieldset>

        <Field
          autoFocus
          label="Título"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Ex.: Reunião com fornecedor"
        />

        <div className="mt-3 flex gap-2">
          {/* A hora é o `ui/CampoDeHora` e não um `type="time"` cru — mesma
              razão do `<select>`: a lista do nativo é desenhada pelo sistema
              operativo e nenhum CSS desta casa lá chega. O rótulo é escrito
              aqui porque o campo é um `role="group"` de dois controlos e não
              um `<input>` que um `<label>` possa apontar. */}
          <span className="flex flex-col gap-1.5">
            <span className="bo-eyebrow text-[var(--bo-text-muted)]">Hora</span>
            <CampoDeHora
              ariaLabel="Hora"
              value={form.time}
              onChange={(time) => setForm((f) => ({ ...f, time }))}
            />
          </span>
          <Field
            label="Nota"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Opcional"
            containerClassName="flex-1"
          />
        </div>

        <Button
          fullWidth
          onClick={submit}
          loading={saving}
          disabled={!form.title.trim()}
          className="mt-4"
        >
          {saving ? "A guardar…" : "Adicionar ao calendário"}
        </Button>
      </div>
    </div>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DIA POR EXTENSO — uma escrita só, dois sítios onde ela aparece
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel que abre por baixo da grelha e o popover do «+N mais» dizem a MESMA
 * coisa sobre o mesmo dia. Escritos duas vezes, seriam dois sítios a discordar
 * um dia — e é literalmente o defeito que a Parte −1 do `docs/DESIGN-SYSTEM.md`
 * manda evitar («convergir o que já existe em vez de criar uma segunda família
 * ao lado»).
 *
 * É aqui que a palavra do estado fica À VISTA, e não só na cor: o
 * `Calendario.estado-nao-e-so-cor.test.tsx` lê esta linha.
 */
function LinhasDoDia({
  quotes,
  marcacoes,
  onAbrir,
  onRemover,
}: {
  quotes: Quote[];
  marcacoes: CalendarEvent[];
  onAbrir: (q: Quote) => void;
  onRemover: (id: string, title: string) => void;
}) {
  return (
    <div className="divide-y divide-[var(--bo-hairline)]">
      {quotes.map((q) => (
        <button
          key={q.id}
          onClick={() => onAbrir(q)}
          className={`w-full flex items-center gap-3 text-left px-4 py-3 hover:bg-[var(--bo-tinta-3)] ${ESTADO} ${PRESSAO}`}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: STATUS_COLOR[q.status] }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[var(--bo-tinta-72)] text-xs font-medium truncate">
              {q.name}
            </span>
            {/* A palavra do estado À VISTA — aqui há linha para ela.
                Na grelha do mês o estado ia só na cor da barra (ver o
                `STATUS_LABEL`); este painel é onde o dia se lê a sério, e é
                onde a palavra tem de estar. */}
            <span className="block text-foreground/40 text-[10px] truncate">
              {estadoEmPalavra(q.status)}
              {` · ${eventTypeLabel(q)}`}
              {q.guests ? ` · ${q.guests} convidados` : ""}
            </span>
          </span>
          <span className="text-foreground/30 text-[9px] tracking-[0.15em] uppercase shrink-0">
            Abrir
          </span>
        </button>
      ))}
      {marcacoes.map((ev) => (
        <div key={ev.id} className="flex items-center gap-3 px-4 py-3">
          <GlifoDoTipo kind={ev.kind} />
          <span className="min-w-0 flex-1">
            <span className="block text-[var(--bo-tinta-72)] text-xs font-medium truncate">
              {ev.time ? `${ev.time} · ` : ""}
              {ev.title}
            </span>
            <span className="block text-foreground/40 text-[10px] truncate">
              {TIPO_META[ev.kind].label}
              {ev.note ? ` · ${ev.note}` : ""}
            </span>
          </span>
          <button
            onClick={() => onRemover(ev.id, ev.title)}
            aria-label={`Remover ${TIPO_META[ev.kind].label}: ${ev.title}`}
            className={`text-foreground/35 hover:text-[var(--bo-perigo)] text-[9px] tracking-[0.15em] uppercase shrink-0 ${ESTADO} ${PRESSAO}`}
          >
            Remover
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Calendario({ quotes, onOpen, onFazerProposta }: Props) {
  const { toast } = useToast();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Standalone calendar entries (reuniões, marcações, bloqueios…)
  const {
    data: events = [],
    setData: setEvents,
    error: erroDeLeitura,
    errorMessage: mensagemDeErro,
    refresh: recarregar,
  } = useCachedList<CalendarEvent[]>("calendario", "/api/calendario");
  const [modalDate, setModalDate] = useState<string | null>(null);
  /**
   * ── QUEM ABRIU O «NOVO NO CALENDÁRIO» ─────────────────────────────────────
   *
   * O diálogo fica montado 200 ms a apagar-se e passa a `inert` no fotograma do
   * gesto — mas o campo do título tem `autoFocus`, portanto quem fecha deixa o
   * foco DENTRO de uma caixa que já não conta: o browser larga-o e ele cai no
   * `<body>`, e o Tab seguinte recomeça no topo da página, longe do dia em que
   * se estava. Numa grelha de trinta e cinco dias isso é percorrê-la outra vez.
   *
   * Guarda-se o elemento activo à entrada e devolve-se-lhe o foco à saída, que
   * é o mesmo padrão que a biblioteca de temas já usa para a lupa das fotos
   * (`zoomOpener` / `closeZoom`, no `Temas.tsx`) — e serve os três caminhos de
   * abertura sem cada um ter de trazer a sua referência: o dia vazio, o «+» da
   * célula e o «Adicionar» do painel do dia.
   */
  const abridorDoModal = useRef<HTMLElement | null>(null);
  /**
   * Fecha e devolve o foco JÁ — nunca ao fim dos 200 ms. Devolver o foco é uma
   * tarefa, e nenhuma animação desta casa atrasa uma.
   */
  const fecharOModal = useCallback(() => {
    setModalDate(null);
    abridorDoModal.current?.focus?.();
    abridorDoModal.current = null;
  }, []);

  /**
   * A marcação à espera de resposta à pergunta de a remover.
   *
   * Guarda-se o título e não só o `id`, porque é o título que aparece na
   * pergunta: numa grelha de mês, os alvos são de 9 px e a marcação em que ela
   * tocou não é óbvia depois de a caixa abrir.
   */
  const [aRemover, setARemover] = useState<{ id: string; title: string } | null>(null);
  // Day peek: the day whose events are expanded in the panel under the grid.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * MÊS OU ANO — A PORTA DA FASE 07
   * ══════════════════════════════════════════════════════════════════════
   *
   * Duas das quatro vistas que o `docs/APPLE-CALENDARIO.md` pede (Dia, Semana,
   * Mês, Ano). Entram as duas que já existem; as outras duas juntam-se ao
   * mesmo comutador quando forem escritas, sem nada mudar aqui.
   *
   * O mês continua a ser o que abre: é a vista de trabalho. O ano é a que
   * responde a «temos livre em julho de 2027?», e essa pergunta faz-se quando
   * chega um pedido — não é onde se começa o dia.
   */
  const [vista, setVista] = useState<"mes" | "ano">("mes");

  /**
   * ══════════════════════════════════════════════════════════════════════
   * OS QUATRO CALENDÁRIOS — A FASE 04
   * ══════════════════════════════════════════════════════════════════════
   *
   * O que se liga e desliga na barra lateral (ver `CalendariosFiltraveis.tsx`)
   * é filtrado AQUI, uma vez, e as duas vistas leem daqui: a grelha do mês e
   * os doze mini-meses do ano. Um filtro aplicado só numa delas seria o mesmo
   * mês a dizer duas coisas conforme o botão em que se carregou por último.
   *
   * O que NÃO se filtra são os pedidos — não estavam na legenda que estes
   * quatro substituem. A razão longa está no ficheiro deles.
   */
  const calendarios = useCalendarios();
  const marcacoesVisiveis = useMemo(
    () => events.filter((e) => calendarios.ligados.has(e.kind)),
    [events, calendarios.ligados],
  );

  /**
   * ══════════════════════════════════════════════════════════════════════
   * UMA GRAVAÇÃO, E UMA FRASE QUE DIZ O QUE FICOU POR FAZER
   * ══════════════════════════════════════════════════════════════════════
   *
   * As duas escritas deste ecrã diziam «Não foi possível guardar» e «Não foi
   * possível remover. Tenta novamente.» — a mesma frase para a rede em baixo,
   * a sessão expirada, a marcação que outra pessoa já apagou e o servidor em
   * baixo. E «tenta novamente» é conselho errado em três desses quatro casos.
   *
   * Aqui há um sítio só a pedir, a verificar o `ok` e a escolher a frase
   * (`porque-falhou`), que nomeia a marcação. É o padrão de `MaterialListas`.
   */
  async function gravar(
    oQue: string,
    url: string,
    init?: RequestInit,
  ): Promise<{ ok: boolean; corpo: unknown }> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return { ok: false, corpo: null };
    }
    const corpo = await res.json().catch(() => null);
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
      return { ok: false, corpo };
    }
    return { ok: true, corpo };
  }

  // The add form now lives in <AddEventModal> with LOCAL state, so typing a
  // title no longer re-renders this component (and its 42-cell grid) per
  // keystroke. This just persists a completed payload and appends the result.
  async function createEvent(payload: {
    title: string;
    kind: CalendarEventKind;
    time: string;
    note: string;
    date: string;
  }): Promise<boolean> {
    const { ok, corpo } = await gravar(
      `acrescentar «${payload.title}» ao calendário`,
      "/api/calendario",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!ok) return false;
    const ev = corpo as CalendarEvent | null;
    // Um 200 sem marcação no corpo não dá uma linha para desenhar. Ficou
    // gravada — o que falta é a versão do servidor, e essa vem ao recarregar.
    if (!ev?.id) {
      toast(
        `«${payload.title}» ficou no calendário, mas não voltou do servidor. Atualiza a página.`,
        "error",
      );
      return false;
    }
    setEvents((prev) => [...prev, ev]);
    toast("Adicionado ao calendário", "success");
    fecharOModal();
    return true;
  }

  /**
   * Perguntar primeiro, e é aqui que a pergunta faz mais falta: o alvo de
   * remoção é a própria marcação na grelha, com 9 px de altura, e um toque a
   * mais numa lista apertada apaga o que estava lá.
   *
   * A pergunta fica fora do `deleteEvent` de propósito: esse é o que age, e
   * quem quiser um dia remover sem perguntar não tem de contornar uma caixa.
   */
  function pedirParaRemover(id: string, title: string) {
    setARemover({ id, title });
  }

  async function deleteEvent(id: string, title: string) {
    // Optimistic remove, but put THIS event back if the server rejects the
    // delete — otherwise it silently reappears on the next reload and the team
    // never learns it failed.
    //
    // Antes repunha-se a lista inteira de antes do pedido (`setEvents(snapshot)`),
    // e isso apagava do ecrã o que tivesse gravado bem entretanto: ela remove
    // duas marcações seguidas, a segunda passa, a primeira volta com erro — e a
    // segunda reaparecia no calendário apesar de já não existir na base de
    // dados. Guarda-se a marcação e o sítio dela, e devolve-se só essa.
    const posicao = events.findIndex((e) => e.id === id);
    const removido = posicao < 0 ? null : events[posicao];
    setEvents((prev) => prev.filter((e) => e.id !== id));
    const { ok } = await gravar(`remover «${title}» do calendário`, `/api/calendario/${id}`, {
      method: "DELETE",
    });
    if (!ok && removido) {
      setEvents((prev) => {
        if (prev.some((e) => e.id === id)) return prev;
        const onde = Math.min(posicao, prev.length);
        return [...prev.slice(0, onde), removido, ...prev.slice(onde)];
      });
    }
  }

  // Open the "add event" modal for a given day (shared by click + keyboard).
  function openAdd(key: string) {
    // De onde se veio, para se poder voltar. Ver `abridorDoModal`.
    abridorDoModal.current = document.activeElement as HTMLElement | null;
    setModalDate(key);
  }

  // Month navigation always goes through here so the day peek never lingers
  // pointing at a day the grid no longer shows.
  function goTo(next: Date) {
    setCursor(next);
    setSelectedDay(null);
  }

  // Escape closes the add-event modal — e devolve o foco a quem o abriu, que é
  // a saída de quem anda de teclado e a que mais se usa.
  useEffect(() => {
    if (!modalDate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharOModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalDate, fecharOModal]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of marcacoesVisiveis) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [marcacoesVisiveis]);

  const byDay = useMemo(() => {
    const map = new Map<string, Quote[]>();
    for (const q of quotes) {
      // Free-form dates ("a definir", etc.) are allowed by the schema; skip
      // anything that isn't a real YYYY-MM-DD so `.toISOString()` below can't
      // throw a RangeError and take the whole month grid down with it.
      if (!isDateKey(q.date)) continue;
      // Multi-day events (endDate set) occupy every day of the range, so a
      // 3-day wedding blocks all three days on the grid — not just day one.
      // Capped at 31 days as a guard against bad data.
      const last = q.endDate && isDateKey(q.endDate) && q.endDate >= q.date ? q.endDate : q.date;
      const d = new Date(q.date + "T12:00:00");
      for (let i = 0; i < 31; i++) {
        // Build the key from LOCAL parts (not toISOString/UTC) so it matches the
        // grid cell keys below and stays correct in far-offset zones.
        const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        if (key > last) break;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(q);
        d.setDate(d.getDate() + 1);
      }
    }
    return map;
  }, [quotes]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = todayKey();

  // Full weeks: leading/trailing days of the neighbouring months are rendered
  // dimmed (and inert) so the grid is always a clean rectangle of hairlines.
  const cells: { key: string; day: number; inMonth: boolean }[] = [];
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  /** Quantas linhas tem este mês — quatro, cinco ou seis. É o que reparte a
   *  altura disponível pelas semanas, em vez de a deixar sobrar por baixo. */
  const semanas = totalCells / 7;
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(year, month, i - startOffset + 1);
    cells.push({
      key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    });
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * «PRÓXIMOS EVENTOS» — OS QUE VÃO MESMO ACONTECER
   * ════════════════════════════════════════════════════════════════════════
   *
   * Filtrava só por data. Uma auditoria em produção contou TRÊS das seis
   * entradas como pedidos PERDIDOS — An & Patrick, Tara e Marty, Constança
   * Lourenço Heleno. Um trabalho que se perdeu não é um evento que se
   * aproxima; é um casamento que vai acontecer sem a Líquen lá.
   *
   * Este painel serve para saber o que vem aí. Com perdidos lá dentro, metade
   * do que ele diz é falso — e é o tipo de erro que faz alguém deixar de olhar
   * para o painel.
   *
   * `rejeitado` é o estado que a casa mostra como «Perdido» (ver
   * `estado-do-pedido.ts`). Os restantes ficam todos: um pedido ainda por
   * responder é precisamente o que convém ver com a data a chegar.
   */
  const upcoming = useMemo(() => {
    const today = todayKey();
    return quotes
      .filter((q) => isDateKey(q.date) && q.date >= today && q.status !== "rejeitado")
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
  }, [quotes]);

  /**
   * Quantos eventos tem este mês — contados a partir do que a GRELHA desenha.
   *
   * Contava-se pela data de INÍCIO (`q.date.startsWith(mês)`), e um evento de
   * vários dias ocupa todos os dias do intervalo (ver `byDay`): uma passagem de
   * ano de 30/12 a 02/01 pintava-se em Janeiro e, ao mesmo tempo, Janeiro dizia
   * "Sem eventos este mês" e abria o estado vazio POR BAIXO da grelha que tinha
   * lá o evento. Quem lê aquele número está a decidir se aceita mais trabalho
   * para o mês.
   *
   * Contamos por identidade — um evento de três dias é UM evento — e por
   * tabela, para não somar um pedido e uma marcação com o mesmo id. E, vindo de
   * `byDay`/`eventsByDay`, uma data por marcar ("a definir") fica de fora sem
   * regra à parte: se a grelha não a desenha, também não a conta.
   */
  const monthTotal = useMemo(() => {
    const prefixo = `${year}-${pad2(month + 1)}`;
    const vistos = new Set<string>();
    for (const [dia, doDia] of byDay) {
      if (!dia.startsWith(prefixo)) continue;
      for (const q of doDia) vistos.add(`q:${q.id}`);
    }
    for (const [dia, doDia] of eventsByDay) {
      if (!dia.startsWith(prefixo)) continue;
      for (const e of doDia) vistos.add(`e:${e.id}`);
    }
    return vistos.size;
  }, [byDay, eventsByDay, year, month]);

  /**
   * Quantas marcações de cada tipo tem a unidade à vista — o mês, ou o ano.
   *
   * Conta-se sobre a lista INTEIRA e não sobre a filtrada, de propósito: o
   * número ao lado de um calendário desligado é a única coisa que diz o que
   * está escondido. Um zero a aparecer quando se desliga a caixa era esconder
   * a informação duas vezes.
   */
  const contagensPorTipo = useMemo(() => {
    const prefixo = vista === "ano" ? `${year}-` : `${year}-${pad2(month + 1)}`;
    const conta: Record<CalendarEventKind, number> = {
      reuniao: 0,
      evento: 0,
      bloqueio: 0,
      nota: 0,
    };
    for (const e of events) {
      if (!e.date.startsWith(prefixo)) continue;
      // Um tipo que o servidor invente não soma para nenhum dos quatro — e não
      // deita o ecrã abaixo por ler uma chave que não existe.
      if (conta[e.kind] === undefined) continue;
      conta[e.kind] += 1;
    }
    return conta;
  }, [events, vista, year, month]);

  /**
   * O estado da vista de ano: quantos dias do ano estão fechados.
   *
   * Substitui o «N eventos este mês» quando se troca para o ano, e é o número
   * certo para essa vista — a pergunta do ano não é quantos eventos há, é
   * quantos dias já não dão. Só se conta quando o ano está à vista: são doze
   * meses de contas, e a grelha do mês não precisa delas.
   */
  const fechadosDoAno = useMemo(
    () => (vista === "ano" ? fechadosNoAno(anoDoCalendario(year, quotes, marcacoesVisiveis)) : 0),
    [vista, year, quotes, marcacoesVisiveis],
  );

  const dayLabelLong = (key: string) =>
    new Date(key + "T12:00:00").toLocaleDateString("pt-PT", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

  /* ── QUEM SEGURA O «NOVO NO CALENDÁRIO» OS 200 MS ────────────────────────
     O estado é daqui, portanto o nó é segurado daqui. O `modalDate` cai para
     `null` no instante do gesto — é ele que fecha, que destranca a página e que
     devolve o foco —, e o que fica é a `dataDoModal`: a última data aberta, só
     para o diálogo que se está a apagar ter o que mostrar.

     Guardada em ESTADO e ajustada durante o desenho, que é o padrão do React
     para isto — e não numa referência: uma referência lida no desenho é um
     valor que o React não sabe que existe, e a regra `react-hooks/refs` recusa-a
     com razão. Ajustar estado no desenho re-desenha sem pintar nada pelo meio,
     e a comparação é entre duas datas (`string`), portanto não há ciclo.

     É também isto que segura o `key`: o `key` remonta, e um `key` a passar de
     uma data para `undefined` a meio da saída trocava o diálogo por um novo —
     com o formulário em branco, no fotograma em que ele devia estar a
     apagar-se. */
  const aSairDoModal = useSaidaDeUmSo(modalDate !== null);
  const [ultimaDataDoModal, setUltimaDataDoModal] = useState<string | null>(null);
  if (modalDate !== null && modalDate !== ultimaDataDoModal) setUltimaDataDoModal(modalDate);
  const dataDoModal = modalDate ?? (aSairDoModal ? ultimaDataDoModal : null);

  const modalDateLabel = dataDoModal
    ? new Date(dataDoModal + "T12:00:00").toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const selectedQuotes = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];

  return (
    <>
      {/* ── A grelha desenha-se na mesma, mas com o aviso à frente ──────────
          Os pedidos vêm por `props` e continuam certos; o que falhou foram as
          MARCAÇÕES — reuniões, provas, e sobretudo os bloqueios. Um mês
          desenhado sem bloqueios não parece avariado, parece livre, e é sobre
          um dia "livre" desses que se marca uma prova por cima de férias. Por
          isso o aviso fica por cima, e a grelha fica: metade da informação é
          útil desde que se saiba que é metade. */}
      {erroDeLeitura && events.length === 0 && (
        <AvisoDeFalha
          titulo="Não foi possível ler as marcações do calendário"
          mensagem={mensagemDeErro}
          aoTentarDeNovo={recarregar}
        />
      )}
      {/* ── A COLUNA DO DIA AO LADO DO MÊS A PARTIR DE 1024 ────────────────
          Era `xl:` (1280). Entre 1024 e 1280 a lista do dia escolhido caía para
          DEBAIXO da grelha do mês: clicar num dia mandava-a rolar para fora do
          calendário para ler o que lá estava marcado, e voltar a subir para
          escolher outro. É o gesto que este ecrã existe para poupar. `lg:` é o
          corte da casa, e os 320 px da coluna cabem: a 1024 sobram mais de 600
          para a grelha de sete dias, que a 640 já se desenha inteira.

          `gap-4` empilhado e `gap-6` ao lado: com as duas caixas uma em cima da
          outra, 24 px de intervalo são altura pura num ecrã onde ela já é o que
          falta; lado a lado, são a goteira que separa as duas colunas. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 lg:gap-6">
        {/* ── FORA O CARTÃO — A FASE 02 ───────────────────────────────────
            O ponto 7 da auditoria dela: «Uma grelha de calendário é conteúdo
            de página inteira. O cartão com raio e padding rouba cerca de 60 px
            de cada lado e faz a grelha mais pequena do que podia ser.»

            A CONTA, medida nas duas larguras que esta casa usa:

              · a 375 px o cartão levava `!p-3` (12 px de cada lado) e sobravam
                319 para sete colunas com seis filetes — 44,7 px por dia, que
                era o mínimo à justa. Sem cartão sobram 343, e cada dia fica
                com 48,2. Mais 3,5 px de alvo em cada um dos trinta e cinco;
              · a 1440 px o cartão levava `sm:!p-8` (32 px de cada lado) e
                comia 64 px de grelha. Sem ele, cada coluna ganha 9.

            E não é só largura: sem o cartão, a grelha passa a poder ENCHER A
            ALTURA (o ponto 8 — «metade do ecrã está vazia e a grelha está
            apertada»), porque deixa de haver uma caixa branca a decidir onde
            ela acaba. O que delimita a grelha passam a ser os filetes entre as
            células, que é o que o documento manda: «Os limites das células são
            os separadores; não é preciso mais nada a delimitar.» */}
        {/* `min-w-0` na coluna do mês: `1fr` é `minmax(auto, 1fr)`, e sem
            isto o mínimo automático é o CONTEÚDO — uma etiqueta com o nome
            inteiro de um casal passava a poder empurrar a coluna em vez de
            truncar dentro dela. É o par obrigatório do `truncate` da fase 03.
            O `1fr` fica como estava porque é o que o `Cortes.movel.test.ts`
            mede, e a correcção certa é esta e não trocar o `1fr`. */}
        <section className="bo-cena min-w-0" style={{ "--cena": 0 } as React.CSSProperties}>
          {/* ── Header: month title + quiet controls on one row ──────────────
              …e em DUAS quando não cabem numa. MEDIDO num telemóvel de 390×844:
              «Agosto 2026» mostrava 90 px dos 103 de que precisa, e lia-se
              «Agosto 2…» — o título da vista cortado a meio.

              A fila era `flex` sem quebra, com o grupo de navegação do mês
              `shrink-0` e o título o único `min-w-0`: quando o espaço faltava,
              quem cedia era sempre o título, e o `truncate` fazia o resto.

              `flex-wrap` sem ponto de corte por viewport (a lição das linhas de
              grupo do estúdio, em MOBILE-AUDIT.md: `sm:` mede o ECRÃ, e este
              cabeçalho vive dentro de um cartão) mais um mínimo legível no
              título — que é o que faz a quebra disparar, porque com `min-w-0` o
              título encolhia até 0 em vez de empurrar os botões para baixo. */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="min-w-[12rem]">
              {/* O mês é o TÍTULO deste ecrã, e estava a 20/24 px — o mesmo
                  degrau de um subtítulo qualquer. A grelha por baixo é o herói,
                  mas quem diz DE QUE mês ela é, é esta linha; num ecrã que se
                  navega mês a mês, saber onde se está não pode ser letra
                  miudinha. Sobe para o degrau de display da casa, na letra da
                  casa. */}
              <h3
                className="font-display leading-tight text-[var(--bo-text)]"
                style={{ fontSize: "clamp(26px, 3.5vw, 36px)" }}
              >
                {/* No ano, o título é o ANO. É a mesma regra do documento —
                    o título da vista é a unidade que ela mostra — e o `<>…</>`
                    guarda a expressão do mês tal e qual, que é o que o
                    `entrada-do-calendario.test.ts` mede. */}
                {vista === "ano" ? (
                  year
                ) : (
                  <>
                    {MONTHS[month]} {year}
                  </>
                )}
              </h3>
              <p className="text-foreground/40 text-[10px] tracking-[0.2em] uppercase mt-1.5">
                {vista === "ano"
                  ? fechadosDoAno === 0
                    ? "Ano todo livre"
                    : `${fechadosDoAno} dia${fechadosDoAno !== 1 ? "s" : ""} fechado${fechadosDoAno !== 1 ? "s" : ""} este ano`
                  : monthTotal === 0
                    ? "Sem eventos este mês"
                    : `${monthTotal} evento${monthTotal !== 1 ? "s" : ""} este mês`}
              </p>
            </div>
            {/* ── ESTA FILA DEIXOU DE PODER SER `shrink-0` ──────────────────
                MEDIDO no CI, a 375 px (iPhone SE): «Mês|Ano · Exportar · Hoje ‹ ›»
                dava 3 px para lá da margem direita, e o `body` tem
                `overflow-x: clip` — ou seja, a seta de avançar o mês ficava
                CORTADA, sem maneira nenhuma de lá chegar com o dedo.

                É o mesmo defeito, palavra por palavra, que o `Guioes.tsx` já
                tem escrito: uma fila que cabia com dois comandos, ganhou um
                terceiro, e o `shrink-0` recusou-se a encolher — com ele, o
                `flex-wrap` nunca chega a disparar, porque não há o que quebrar
                quando a caixa não aperta.

                `min-w-0` e `flex-wrap`: a fila encolhe, e quando não couber a
                navegação passa para a linha de baixo inteira em vez de sair
                pela borda. E a lição de medição fica dita — 375 px é o caso
                estreito desta casa, não 390. Eu tinha medido a 390 e não vi. */}
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              {/* ── O COMUTADOR DAS VISTAS ────────────────────────────────
                  Duas das quatro que o documento pede. Fica ANTES do
                  «Exportar» porque trocar de vista é a acção frequente e
                  exportar é a rara — a ordem da barra é a ordem do uso. */}
              <Segmented
                size="sm"
                ariaLabel="Vista do calendário"
                value={vista}
                onChange={(v) => {
                  setVista(v);
                  // O painel do dia aponta para um dia da grelha do mês; no ano
                  // essa grelha sai do ecrã e ele ficaria a apontar para nada.
                  setSelectedDay(null);
                }}
                options={[
                  { value: "mes", label: "Mês" },
                  { value: "ano", label: "Ano" },
                ]}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportIcs(quotes)}
                title="Exportar para calendário (.ics)"
                className="hidden sm:inline-flex"
              >
                Exportar
              </Button>
              <div
                className="flex items-center rounded-xl border border-[var(--bo-hairline)] p-0.5"
                role="group"
                aria-label={vista === "ano" ? "Navegação do ano" : "Navegação do mês"}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  /* No ano, as setas andam de ANO. É o mesmo gesto na mesma
                     tecla a mover a unidade que está à vista — trocar de vista
                     e continuar a saltar de mês seria o botão a mentir. */
                  onClick={() =>
                    goTo(
                      vista === "ano" ? new Date(year - 1, month, 1) : new Date(year, month - 1, 1),
                    )
                  }
                  aria-label={vista === "ano" ? "Ano anterior" : "Mês anterior"}
                  className="w-8 pointer-coarse:w-11 px-0"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const d = new Date();
                    goTo(new Date(d.getFullYear(), d.getMonth(), 1));
                  }}
                >
                  Hoje
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    goTo(
                      vista === "ano" ? new Date(year + 1, month, 1) : new Date(year, month + 1, 1),
                    )
                  }
                  aria-label={vista === "ano" ? "Ano seguinte" : "Mês seguinte"}
                  className="w-8 pointer-coarse:w-11 px-0"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Button>
              </div>
            </div>
          </div>

          {/* ── A VISTA DE ANO, OU A DE MÊS ────────────────────────────────
              As duas vivem no MESMO cartão e trocam-se aqui. É de propósito:
              o título, o estado da vista, as setas e o «Hoje» são os mesmos
              nas duas, e um segundo cartão ao lado seria um segundo cabeçalho
              a discordar do primeiro — o defeito que a Parte −1 do
              `docs/DESIGN-SYSTEM.md` manda evitar.

              A troca é seca, sem transição: mudar de vista é uma interação de
              alta frequência e a Parte 2.4 do sistema de design não as anima.
              (O documento do calendário pede um fade cruzado de 200 ms na
              Parte 6; fica para quando as quatro vistas existirem e houver
              onde o pôr uma vez só, em vez de dois blocos a desvanecer-se um
              por cima do outro dentro de um cartão que muda de altura.) */}
          {vista === "ano" ? (
            <CalendarioAno
              ano={year}
              quotes={quotes}
              marcacoes={marcacoesVisiveis}
              hoje={todayStr}
              /* A saída da vista de ano é a grelha do mês que ela escolheu —
                 é lá que se vê o que está marcado e se marca. */
              onAbrirMes={(mes) => {
                goTo(new Date(year, mes, 1));
                setVista("mes");
              }}
            />
          ) : (
            <>
              {/* ── Weekday header ── */}
              <div className="grid grid-cols-7 mb-2" aria-hidden="true">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="text-center text-foreground/30 text-[9px] tracking-[0.25em] uppercase py-1"
                  >
                    {w}
                  </div>
                ))}
              </div>

              {/* ── A GRELHA, SEM CAIXA E A ENCHER A ALTURA ─────────────────
                  Os filetes continuam a ser os intervalos de 1 px sobre uma
                  base tingida — o que saiu foram o `rounded-xl`, o
                  `overflow-hidden` e a moldura: sem cartão à volta, uma
                  segunda moldura só desenharia o cartão outra vez, mais fino.

                  ── A ALTURA, E A CONTA DELA ────────────────────────────────
                  O ponto 8 dela: cinco linhas ocupavam ~430 px e sobravam
                  ~200 px de página em branco por baixo. As linhas passam a
                  `minmax(--celula, 1fr)`: a célula tem um chão (52 px no
                  telemóvel, 96 no computador — o mínimo que o documento dá na
                  Parte 3) e o que sobrar reparte-se por elas.

                  Os 21rem que se tiram ao ecrã, somados: 81 do cabeçalho
                  fixo (o número está escrito no `AdminClient.tsx`), 40 do
                  respiro da vista, ~64 do título do mês, 28 da fila dos dias
                  da semana, 86 da cápsula da navegação e 40 de respiro em
                  baixo = 339 px ≈ 21,2rem. Só a partir de `lg:`, porque num
                  telemóvel a página é para rolar e uma grelha com a altura do
                  ecrã empurrava tudo o resto para fora dele.

                  MEDIDO no Chromium, com a folha do back office compilada e a
                  marcação real desta vista (grelha de cinco semanas):

                    375×800    grelha 343 px, célula 48,1×52    sem transbordo
                    640×800    célula 83,7×106, etiqueta 20 px de altura
                    1280×800   grelha 534 px de altura
                    1440×900   564 px — o mínimo já manda
                    1440×1080  744 px — e continua a repartir pelas semanas

                  A célula a 375 px era 44,7 com o cartão e passou a 48,1: os
                  24 px de margem que o cartão comia estão nas sete colunas. */}
              <div
                role="group"
                aria-label={`Calendário de ${MONTHS[month]} ${year}`}
                className="grid grid-cols-7 gap-px bg-[var(--bo-hairline)] [--celula:3.25rem] sm:[--celula:6rem] lg:min-h-[calc(100dvh-21rem)]"
                style={{ gridTemplateRows: `repeat(${semanas}, minmax(var(--celula), 1fr))` }}
              >
                {cells.map((c, indice) => {
                  if (!c.inMonth) {
                    return (
                      <div
                        key={c.key}
                        aria-hidden="true"
                        /* ── OS DIAS DO MÊS AO LADO, ESBATIDOS ─────────────
                           O ponto 10 dela: «31 de agosto e 1 a 4 de outubro
                           parecem dias de setembro». Passam a ter o fundo
                           recuado da casa e o número no tom mais calmo que a
                           escada dá — não estão desligados, estão noutro mês,
                           e a grelha tem de o dizer sem se partir em duas. */
                        className="bg-[var(--bo-surface-sunken)] p-1.5 sm:p-2"
                      >
                        <span className="text-[10px] sm:text-[11px] tabular-nums text-foreground/25">
                          {c.day}
                        </span>
                      </div>
                    );
                  }
                  const key = c.key;
                  const dayQuotes = byDay.get(key) ?? [];
                  const dayEvents = eventsByDay.get(key) ?? [];
                  const isToday = key === todayStr;
                  const isSelected = key === selectedDay;
                  const total = dayQuotes.length + dayEvents.length;
                  /* ── O QUE CABE NUMA CÉLULA, E O QUE VAI PARA O «+N MAIS» ──
                     UMA fila só, e a ordem é a do dia: os pedidos primeiro —
                     a data é deles, e é por causa deles que o dia está
                     ocupado —, as marcações a seguir.
                     Havia duas orçamentações separadas («dois pedidos, e as
                     marcações que sobrarem»), e num dia com três marcações e
                     zero pedidos isso deixava uma linha vazia por baixo.

                     CABEM três linhas: a célula tem 96 px de chão (Parte 3 do
                     documento), o número do dia leva ~18 e cada etiqueta 20
                     mais 3 de intervalo — 18 + 3×23 = 87, com 9 de folga.
                     Quando não cabem, a última linha é o «+N mais», portanto
                     mostram-se duas: 2 + 1 continua a dar três. */
                  const CABEM = 3;
                  const doDia = [
                    ...dayQuotes.map((q) => ({ pedido: q, marcacao: null })),
                    ...dayEvents.map((ev) => ({ pedido: null, marcacao: ev })),
                  ];
                  const mostrados = total > CABEM ? doDia.slice(0, CABEM - 1) : doDia;
                  const hiddenCount = total - mostrados.length;
                  // On very narrow screens the chips collapse into plain dots.
                  const dots = [
                    ...dayQuotes.map((q) => STATUS_COLOR[q.status]),
                    ...dayEvents.map((ev) => TIPO_META[ev.kind].cor),
                  ].slice(0, 4);
                  /* ── O DIA TEM DE DIZER DE QUE ANO É ────────────────────────
                 O nome acessível da célula era «9 de Janeiro — 2 eventos», sem
                 ANO. Num calendário em que se anda para trás e para a frente
                 mês a mês — e esta casa fecha datas com um ano e meio de
                 antecedência —, quem o percorre com um leitor de ecrã ouve
                 «9 de Janeiro» e não tem como saber se está no ano que abriu
                 ou dois cliques à frente. O cabeçalho diz «Janeiro 2026», mas
                 fica lá atrás: quando se chega às células já se ouviu, e não
                 se volta a ouvir a cada dia.

                 O ano vem do `year` que a própria grelha já usa para se
                 desenhar, portanto não há segunda fonte para discordar. */
                  const dayLabel = `${c.day} de ${MONTHS[month]} de ${year}${isToday ? " (hoje)" : ""} — ${
                    total > 0
                      ? `${total} evento${total !== 1 ? "s" : ""}; Enter para ver`
                      : "Enter para adicionar"
                  }`;
                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      aria-label={dayLabel}
                      aria-pressed={isSelected || undefined}
                      onClick={(e) => {
                        /* Um clique NASCIDO dentro do popover do «+N mais» já
                           foi tratado lá: é o mesmo dia, mas não é um gesto
                           dirigido à célula. Sem isto, escolher uma linha do
                           popover fechava-o e abria por baixo o painel do dia
                           — duas respostas para um toque só. */
                        if ((e.target as HTMLElement).closest("[data-mais-do-dia]")) return;
                        // A day with entries opens the peek; an empty day goes
                        // straight to "add" — the fastest path either way.
                        if (total > 0) setSelectedDay(isSelected ? null : key);
                        else openAdd(key);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (total > 0) setSelectedDay(isSelected ? null : key);
                          else openAdd(key);
                        }
                      }}
                      /* Sem `min-h` próprio: a altura da célula é a linha da
                         grelha (`minmax(--celula, 1fr)`), e dois mínimos a
                         decidir a mesma altura é como uma delas fica para
                         trás. */
                      className={`group relative bg-[var(--bo-surface)] p-1 sm:p-1.5 ${ESTADO} ${PRESSAO} focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-600/60 ${
                        isSelected
                          ? "ring-1 ring-inset ring-sage-600/45 bg-sage-600/[0.04]"
                          : isToday
                            ? "hover:bg-sage-600/[0.03]"
                            : "hover:bg-sage-600/[0.025]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        {isToday ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sage-600 text-white text-[10px] font-semibold tabular-nums">
                            {c.day}
                          </span>
                        ) : (
                          <span className="text-[10px] sm:text-[11px] tabular-nums text-foreground/40 px-0.5">
                            {c.day}
                          </span>
                        )}
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={`Adicionar a ${c.day} de ${MONTHS[month]}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openAdd(key);
                          }}
                          /* ── 13×14 PX, TRINTA E CINCO A COMPETIR NA GRELHA ────
                         MEDIDO a 1440×900: `13.1×14` px cada. Este «+» nunca é
                         desenhado no dedo (`pointer-coarse:!hidden`), portanto
                         a régua é a do rato — e a da WCAG 2.2 AA (2.5.8) são
                         24×24. Numa grelha de 35 dias, um alvo de 13 px falha
                         para o dia do lado, que é outra data.

                         `size-6` é só a CAIXA que recebe o clique: o «+» fica
                         com o mesmo `text-sm`, centrado, e como a célula tem
                         96 px de chão a linha do topo não empurra nada. */
                          className={`hidden sm:flex pointer-coarse:!hidden size-6 items-center justify-center text-sage-600/0 group-hover:text-sage-600/60 hover:!text-sage-600 text-sm leading-none ${ESTADO} ${PRESSAO}`}
                        >
                          +
                        </button>
                      </div>

                      {/* ── AS ETIQUETAS (de `sm` para cima) ─────────────────
                          A fase 03 inteira: cor por tipo, hora antes do
                          título, truncatura com reticências, e o «+N mais» com
                          popover. O desenho da etiqueta está no `ChipDoDia`.

                          `min-w-0` na pilha, senão as etiquetas empurram a
                          célula em vez de truncarem dentro dela — é a regra do
                          `truncate` dentro de uma grelha. */}
                      <div className="hidden sm:flex flex-col gap-[3px] mt-1 min-w-0">
                        {mostrados.map(({ pedido: q, marcacao: ev }) =>
                          q ? (
                            <ChipDoDia
                              key={`q:${q.id}`}
                              /* O pedido é pintado pelo ESTADO e não pelo tipo:
                                 é o que a casa já fazia no ponto de 6 px, e o
                                 estado é o que muda de semana para semana.
                                 A palavra vai no nome acessível, como manda o
                                 `Calendario.estado-nao-e-so-cor.test.tsx`. */
                              cor={STATUS_COLOR[q.status]}
                              titulo={q.name}
                              rotulo={`Abrir pedido de ${q.name} — ${eventTypeLabel(q)} — ${estadoEmPalavra(q.status)}`}
                              dica={`${q.name} — ${eventTypeLabel(q)} — ${estadoEmPalavra(q.status)}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpen(q);
                              }}
                            />
                          ) : ev ? (
                            <ChipDoDia
                              key={`e:${ev.id}`}
                              cor={TIPO_META[ev.kind].cor}
                              marca={<GlifoDoTipo kind={ev.kind} />}
                              hora={ev.time}
                              titulo={ev.title}
                              rotulo={`Remover ${TIPO_META[ev.kind].label}: ${ev.title}`}
                              dica={`${TIPO_META[ev.kind].label}: ${ev.title} (clique para remover)`}
                              onClick={(e) => {
                                e.stopPropagation();
                                pedirParaRemover(ev.id, ev.title);
                              }}
                              className="hover:line-through"
                            />
                          ) : null,
                        )}
                        {hiddenCount > 0 && (
                          <MaisDoDia
                            quantos={hiddenCount}
                            dia={dayLabelLong(key)}
                            /* As três colunas da direita abrem o popover para
                               dentro: o `body` desta casa tem `overflow-x:
                               clip` e o que sai pela borda direita não se
                               alcança com o dedo nem com a barra. */
                            aoFim={indice % 7 >= 4}
                          >
                            <LinhasDoDia
                              quotes={dayQuotes}
                              marcacoes={dayEvents}
                              onAbrir={onOpen}
                              onRemover={pedirParaRemover}
                            />
                          </MaisDoDia>
                        )}
                      </div>

                      {/* Dots (below sm) — chips would overflow tiny cells */}
                      {dots.length > 0 && (
                        <div className="flex sm:hidden flex-wrap gap-[3px] mt-1.5 px-0.5">
                          {dots.map((color, di) => (
                            <span
                              key={di}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: color }}
                            />
                          ))}
                          {total > dots.length && (
                            <span className="text-foreground/35 text-[8px] leading-[6px]">+</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── A LEGENDA SAIU DAQUI, E NÃO FOI SUBSTITUÍDA POR NADA ───
                  Ela era o ponto 13 («uma legenda necessária para decifrar a
                  grelha, colocada POR BAIXO da grelha — e é só legenda») e
                  passou a ser os quatro CALENDÁRIOS da barra lateral, que
                  ligam e desligam o que se vê. A mesma informação, no sítio
                  onde se age sobre ela.

                  E com ela saiu o «Clica num dia para ver ou adicionar»: o
                  ponto 14 da auditoria e a Parte 15 do `docs/DESIGN-SYSTEM.md`
                  dizem o mesmo — não se explica como funciona um componente
                  padrão; se um clique não se descobre, o que falta é
                  afordância, não uma frase. */}

              {/* ── Day peek: everything on the selected day, with real targets ── */}
              {selectedDay && (selectedQuotes.length > 0 || selectedEvents.length > 0) && (
                /* ── ESPREITAR O DIA ────────────────────────────────────────────
               Montagem condicional: carregar num dia com marcações faz nascer
               este painel por baixo da grelha, e ele empurra o que está a
               seguir para baixo. Aparecia de um fotograma para o outro — a
               página mudava de tamanho e um bloco novo estava simplesmente
               lá.

               `.bo-entrada`, como tudo o que aparece nesta casa: 240 ms,
               quatro píxeis, e SÓ `opacity` e `transform`. A altura NÃO se
               anima, de propósito — animar `height` é remedir a página a cada
               fotograma, que é exactamente o que o telemóvel dela não tem
               para dar. O painel toma o seu espaço de uma vez e é o conteúdo
               que acende e assenta.

               ── E A SAÍDA DESTE PAINEL NÃO SE ANIMA. É UMA DECISÃO. ───────

               A `.bo-saida` deu saída aos diálogos e às folhas do back office,
               e a pergunta óbvia era porque é que este ficou de fora. Ficou
               porque é o único que FECHA ESPAÇO ATRÁS DE SI: está em fluxo,
               dentro do cartão, e quando sai a grelha sobe e o documento
               encolhe. Uma saída em `opacity` sozinha não chega — o buraco
               fecharia na mesma, de repente, por baixo de uma coisa a
               apagar-se.

               Mediu-se, com o método e o instrumento do `Toast` (contadores
               `LayoutCount`/`LayoutDuration` do CDP). O arnês está em
               `e2e/saida-do-espreitar-o-dia.mjs`, com a marcação real desta
               vista — 42 células, o painel de quatro linhas, e a página por
               baixo. Três repetições, num viewport de 375×667:

                 A · transicionar `height`             17,0 layouts   1,52 ms
                 B · `grid-template-rows: 1fr → 0fr`   15,0 layouts   1,49 ms
                 C · FLIP (o painel sai de fluxo)       4,0 layouts   0,82 ms
                 D · não animar                         1,0 layout    0,09 ms

               A e B voltam a dar o MESMO, como já tinha dado na pilha dos
               avisos: a fama de que a grelha «não é layout da mesma maneira»
               continua a não se confirmar. C é barato — e é aí que esta
               conversa costuma acabar, e não pode.

               O FLIP do `Toast` translada os IRMÃOS do que sai: quatro caixas,
               todas dentro de uma pilha `position: fixed`, fora de fluxo. Aqui
               os «irmãos» são o RESTO DA PÁGINA, e o mesmo arnês mede o que
               isso custa em píxeis:

                 · um `transform` no invólucro que contém o que vem a seguir
                   cria bloco de contenção e o cabeçalho `sticky` do back
                   office descola: medido, deixa de estar a 0 px do topo e
                   passa a 24 px, ou seja deixa de estar colado;
                 · e no instante em que o painel sai de fluxo o documento
                   encolhe 291 px. Nesta vista — cartão do mês mais uma lista
                   curta —, com a página no fundo, o browser trava o
                   `scrollTop` (643 → 352) e A GRELHA DO MÊS SALTA 291 px no
                   fotograma ZERO. O painel ia apagar-se suavemente por cima de
                   uma página que acabou de dar um pulo de um ecrã inteiro.

               Ou seja: das quatro, a única que não custa layout também é a que
               parte o `sticky` e faz saltar aquilo para onde a pessoa está a
               olhar. E o que este painel fecha é o painel dela própria — ela
               carregou no «×» daqui de dentro, ou noutro dia, ou noutro mês:
               sabe para onde foi, e não precisa de que lho digam durante 200
               ms. Não animar é 1 recálculo de layout e nenhum salto.

               Se um dia isto mudar de forma — sair do fluxo, passar a folha no
               telemóvel — a resposta muda com ela, e o arnês está lá para se
               voltar a correr. */
                <div className="bo-entrada mt-5 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--bo-hairline)]">
                    <p className="bo-eyebrow capitalize">{dayLabelLong(selectedDay)}</p>
                    <div className="flex items-center gap-1">
                      <Button variant="subtle" size="sm" onClick={() => openAdd(selectedDay)}>
                        Adicionar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedDay(null)}
                        aria-label="Fechar dia"
                        className="w-8 pointer-coarse:w-11 px-0"
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                  <LinhasDoDia
                    quotes={selectedQuotes}
                    marcacoes={selectedEvents}
                    onAbrir={onOpen}
                    onRemover={pedirParaRemover}
                  />
                </div>
              )}

              {/* ── Empty month ── */}
              {monthTotal === 0 && (
                <EmptyState
                  icon={
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      aria-hidden="true"
                    >
                      <rect x="3" y="4" width="18" height="17" rx="2" />
                      <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
                    </svg>
                  }
                  /* ── UM MÊS VAZIO E UM MÊS FILTRADO NÃO SÃO O MESMO ─────
                     A Parte 11 do `docs/DESIGN-SYSTEM.md` separa-os por
                     escrito: «distinguir "ainda não há" de "nenhum corresponde
                     a estes filtros" + limpar filtros». Com quatro calendários
                     que se desligam, um mês cheio pode ficar em branco por
                     escolha dela — e dizer-lhe «mês sem eventos» seria o ecrã
                     a mentir sobre a agenda. */
                  title={
                    calendarios.todosLigados ? "Mês sem eventos" : "Nada nos calendários ligados"
                  }
                  description={
                    calendarios.todosLigados
                      ? "Clica num dia do calendário para adicionar uma reunião, uma data fechada ou uma nota."
                      : "Este mês tem marcações, mas nenhuma dos calendários que estão ligados."
                  }
                  action={
                    calendarios.todosLigados
                      ? undefined
                      : { label: "Mostrar todos os calendários", onClick: calendarios.mostrarTodos }
                  }
                />
              )}
            </>
          )}
        </section>

        {/* ── A BARRA LATERAL: os calendários, e o que vem a seguir ─────────
            Fica à DIREITA e não à esquerda como no desenho da Parte 2 do
            documento dela, e é a mesma razão que já está escrita na Parte 7.2
            do `docs/DESIGN-SYSTEM.md`: «nesta casa a navegação já não é uma
            coluna» — os onze destinos vivem na cápsula que flutua em baixo, e
            o lado esquerdo do conteúdo não é uma barra, é o começo do texto.
            Mudar esta coluna de lado punha-a a competir com uma barra lateral
            que não existe, e — empilhada no telemóvel — punha os filtros e os
            próximos eventos ANTES da grelha, que é o herói do ecrã. */}
        <div className="flex flex-col gap-4 lg:gap-6">
          <ListaDeCalendarios
            calendarios={calendarios}
            contagens={contagensPorTipo}
            className="bo-cena"
            style={{ "--cena": 1 } as React.CSSProperties}
          />

          {/* Upcoming */}
          <Card
            padding="none"
            style={{ "--cena": 2 } as React.CSSProperties}
            className="bo-cena overflow-hidden self-start"
          >
            <p className="bo-eyebrow px-5 sm:px-6 py-4 border-b border-[var(--bo-hairline)]">
              Próximos eventos
            </p>
            <div className="divide-y divide-[var(--bo-hairline)]">
              {upcoming.map((q) => (
                <button
                  key={q.id}
                  /* A porta desta lista é «Fazer proposta» — ver `onFazerProposta`
                   nas props. A queda para o `onOpen` é para nenhum toque ficar
                   sem resposta se alguém montar isto sem a segunda porta. */
                  onClick={() => (onFazerProposta ?? onOpen)(q)}
                  className={`w-full text-left px-5 sm:px-6 py-3.5 hover:bg-[var(--bo-tinta-3)] ${ESTADO} ${PRESSAO}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-center shrink-0 w-10 py-1.5 rounded-lg bg-sage-600/[0.06]">
                      <p className="text-sage-600 text-lg font-light leading-none">
                        {new Date(q.date + "T12:00:00").getDate()}
                      </p>
                      {/* O ANO, quando não é este.
                        A lista lia-se «10 Set · 24 Out · 22 Mai · 29 Mai» e
                        parecia desordenada — está certa, são 2026 e 2027, e
                        faltava a única coisa que o dizia. Só aparece quando é
                        preciso: escrever «2026» em todas as linhas de uma
                        agenda de 2026 é ruído que se aprende a saltar. */}
                      <p className="text-foreground/40 text-[9px] uppercase mt-0.5">
                        {MONTHS[new Date(q.date + "T12:00:00").getMonth()].slice(0, 3)}
                        {new Date(q.date + "T12:00:00").getFullYear() !==
                          new Date().getFullYear() && (
                          <span className="ml-0.5">
                            {String(new Date(q.date + "T12:00:00").getFullYear()).slice(2)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[var(--bo-tinta-72)] text-xs font-medium truncate">
                        {q.name}
                      </p>
                      <p className="text-foreground/40 text-[11px] truncate">
                        {eventTypeLabel(q)} · {q.guests} convidados
                      </p>
                    </div>
                  </div>
                </button>
              ))}
              {upcoming.length === 0 && (
                <EmptyState
                  icon={
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      aria-hidden="true"
                    >
                      <rect x="3" y="4" width="18" height="17" rx="2" />
                      <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
                    </svg>
                  }
                  title="Sem eventos agendados"
                  description="Os próximos eventos com data marcada aparecem aqui."
                />
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Add-event modal — keyed by date so it mounts fresh (and autofocuses)
          each open. Its form state is local, so typing never touches the grid. */}
      {dataDoModal && (
        <AddEventModal
          key={dataDoModal}
          aberto={modalDate !== null}
          date={dataDoModal}
          dateLabel={modalDateLabel}
          onClose={fecharOModal}
          onCreate={createEvent}
        />
      )}

      {/* ── A PERGUNTA É A DA CASA ──────────────────────────────────────────
          Folha inferior no telemóvel — ao pé do polegar, e não no topo do ecrã
          a que o dedo teria de subir — e o verbo no botão em vez de «OK». */}
      <PerguntaDestrutiva
        aberto={!!aRemover}
        onFechar={() => setARemover(null)}
        titulo={`Remover «${aRemover?.title ?? ""}» do calendário?`}
        rotuloConfirmar="Remover"
        // Fecha primeiro e só depois age: a grelha é optimista — a marcação sai
        // logo e volta se o servidor recusar.
        onConfirmar={() => {
          const m = aRemover;
          setARemover(null);
          if (m) void deleteEvent(m.id, m.title);
        }}
      />
    </>
  );
}
