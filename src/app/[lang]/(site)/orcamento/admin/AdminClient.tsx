"use client";

import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  useDeferredValue,
  memo,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Quote, QuoteStatus, ActivityEntry } from "@/lib/orcamento/types";
import type { RecentQuote } from "./CommandPalette";
import { formatPrice } from "@/lib/orcamento/pricing";
import { contractedAmounts } from "@/lib/orcamento/dossier";
import {
  contextoDeLocal,
  diasDeEspera,
  esperaEmPalavras,
  mesesDeEvento,
  plannersDe,
  porEspera,
  regioesDe,
  tomDeEspera,
} from "@/lib/orcamento/espera";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from "@/lib/orcamento/data";
import { rotularPontos } from "@/lib/orcamento/decoracao";
import { guestRangeLabel } from "@/lib/orcamento/data";
import { useToast } from "./Toast";
import CommandPalette, { type Command } from "./CommandPalette";
import ShortcutsModal from "./ShortcutsModal";
import AjudaGlossario from "./AjudaGlossario";
import NewQuoteModal from "./NewQuoteModal";
import RestoreDialog from "./RestoreDialog";
import PasskeysDialog from "./PasskeysDialog";
import NotificationBell from "./NotificationBell";
import {
  downloadCsv,
  quotesToCsvRows,
  dateStamp,
  printRunSheet,
  printEventDossier,
  downloadEventIcs,
} from "./export";
import { prefetchList } from "./useCachedList";
import { onIdle } from "@/lib/onIdle";
import { eventCountdown, parseMoney, randomId, eur, todayKey } from "./util";
import { useFocusTrap } from "./useFocusTrap";
import EmptyState from "./EmptyState";
import LifecycleStepper, { deriveRequestLifecycle } from "./LifecycleStepper";
import { NAV, CORE_NAV, MORE_NAV, type View } from "./nav";
import { Button, SectionCard, Segmented, TabelaOuCartoes, type Coluna } from "./ui";
import { MoreMenu } from "./MoreMenu";
import {
  Overview,
  Kanban,
  Clientes,
  Calendario,
  Propostas,
  Acompanhamento,
  DefinicoesProposta,
  Servicos,
  Tarefas,
  Fornecedores,
  StatsDashboard,
  ProposalBuilder,
  ProposalStudio,
  FazerProposta,
  ProductionPlan,
  EmailTemplates,
  Faturas,
  Contratos,
  Inventario,
  Material,
  Temas,
  ClientMessenger,
  EventChecklist,
  EventMaterial,
  EventTimeline,
  PaymentsPanel,
  EventCosts,
  GuestList,
  TagsField,
  FollowUpField,
  ActivityLog,
  EventTasks,
} from "./lazy";

// Quantos pedidos a lista renderiza de cada vez ("Mostrar mais" carrega o resto).
const LIST_PAGE_SIZE = 50;

// Shared content shell for the main column: a comfortable centred max-width with
// consistent horizontal padding + vertical rhythm, so screens stay readable
// instead of sprawling edge-to-edge on wide monitors. The top bar aligns to the
// same measure. `view-in` (the enter animation) is appended per view.
const VIEW_WRAP = "mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10 py-6 lg:py-10";

// Code-split views + detail-panel tools live in ./lazy — only the view the
// user opens ships its JS, keeping the back-office's initial load lean.

const STATUS_OPTIONS: { id: QuoteStatus; label: string; color: string }[] = [
  { id: "pendente", label: "Novo", color: "bg-foreground/10 text-foreground/50" },
  { id: "em_revisao", label: "Em revisão", color: "bg-moss/15 text-moss" },
  { id: "cotado", label: "Proposta enviada", color: "bg-moss/25 text-moss" },
  { id: "aceite", label: "Ganho", color: "bg-moss/35 text-moss" },
  { id: "rejeitado", label: "Perdido", color: "bg-foreground/8 text-foreground/30" },
];

// Short, human-readable form of the long internal id (e.g.
// "LIQ-MRR1L78R-438B649E86343C27" → "LIQ-MRR1L78R…C27"). The full id stays
// available via title/tooltip; this is only for display.
function shortRef(id: string): string {
  const parts = id.split("-");
  const last4 = id.slice(-4);
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}…${last4}`;
  return id.length > 10 ? `${id.slice(0, 8)}…${last4}` : id;
}

// Preço final: aceita "1500", "1500,50", "1.500" — ver parseMoney em util.ts.
const parsePriceInput = parseMoney;

// The single "next action" surfaced on the pedido detail — derived from where
// the request sits in its lifecycle, so a newcomer always sees the one sensible
// thing to do next. It routes to the relevant tool tab, or to the always-visible
// management form ("gestao") when the next step is a form edit (e.g. reopening).
type DetailTab = "producao" | "financeiro" | "comunicacao";
type DetailTarget = DetailTab | "gestao";

// The pedido's tool tabs, each with an icon and a plain-language hint so it's
// obvious what you do there. The tablist renders one card per tab (icon +
// label + the hint as a one-line description inside the card).
const DETAIL_TABS: { id: DetailTab; label: string; hint: string; icon: ReactNode }[] = [
  {
    id: "producao",
    label: "Produção",
    hint: "Prepare o evento: tarefas, checklist, plano e convidados.",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" strokeLinejoin="round" />
        <path d="M3 8l9 5 9-5M12 13v8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "financeiro",
    label: "Financeiro",
    hint: "Preço, custos, margem, pagamentos e faturação.",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <circle cx="12" cy="12" r="9" />
        <path
          d="M15 9.5C14.5 8.5 13.3 8 12 8c-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.5-.5-3-1.5M12 6.5v11"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "comunicacao",
    label: "Fazer proposta",
    hint: "Desenhar e enviar a proposta, e falar com o cliente.",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];
function detailNextAction(quote: Quote): { label: string; hint: string; tab: DetailTarget } {
  const { perdido, currentIndex, allDone } = deriveRequestLifecycle(quote);
  if (perdido)
    return { label: "Reabrir pedido", hint: "Voltar a colocar em revisão", tab: "gestao" };
  if (allDone)
    return {
      label: "Rever produção do evento",
      hint: "Guião, checklist e convidados",
      tab: "producao",
    };
  switch (currentIndex) {
    case 0:
      return {
        label: "Enviar proposta",
        hint: "Criar e enviar a proposta ao cliente",
        tab: "comunicacao",
      };
    case 1:
      return {
        label: "Acompanhar proposta",
        hint: "Mensagens e registo de atividade",
        tab: "comunicacao",
      };
    case 2:
      return {
        label: "Registar pagamento",
        hint: "Sinal, faturação e custos do evento",
        tab: "financeiro",
      };
    case 3:
      return {
        label: "Planear produção",
        hint: "Checklist, plano de decoração e guião",
        tab: "producao",
      };
    default:
      return {
        label: "Preparar o dia do evento",
        hint: "Timeline, convidados e checklist",
        tab: "producao",
      };
  }
}

// Single-key destinations for the "g then <key>" navigation chord.
const VIEW_KEYS: Record<string, View> = {
  o: "overview",
  p: "pedidos",
  k: "kanban",
  c: "clientes",
  a: "calendario",
  r: "propostas",
  t: "tarefas",
  f: "fornecedores",
  e: "estatisticas",
};
const VIEW_STORAGE_KEY = "liquen-admin-view";

interface Props {
  initialQuotes: Quote[];
  userName?: string;
}

// Status pill. Module-level (was inside AdminClient) so the memoised QuoteCard
// can render it too — it's pure (status + the module-level STATUS_OPTIONS).
/** "2027-05" → "maio de 2027", para o filtro dos meses ser legível. */
function mesLegivel(yyyymm: string): string {
  const d = new Date(`${yyyymm}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return yyyymm;
  return d.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}

function statusBadge(status: QuoteStatus): ReactNode {
  const s = STATUS_OPTIONS.find((o) => o.id === status);
  return (
    <span
      className={`text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm ${s?.color ?? "bg-foreground/8 text-foreground/30"}`}
    >
      {s?.label ?? status}
    </span>
  );
}

// One quote card in the pedidos list. Extracted to MODULE scope and wrapped in
// React.memo so that typing in the detail edit panel — which only changes
// AdminClient's editX state — no longer reconciles all ~50 cards on every
// keystroke. All props are stable across a keystroke (the quote object comes
// from the memoised visibleQuotes; isCurrent/isSelected are booleans; todayStr
// is a stable string; onOpen/onToggle are stable callbacks), so memo skips
// re-rendering each row. Saves, selection and filtering still update the list
// because they change these props (via visibleQuotes / the booleans).

/**
 * AS COLUNAS DOS PEDIDOS — a forma de computador da mesma lista.
 *
 * A lista de pedidos é o ecrã onde ela passa mais tempo, e num monitor uma
 * pilha de cartões grandes mostra oito pedidos onde cabiam vinte e cinco. A
 * tabela existe para isso: ver muitos ao mesmo tempo, ordenar por quem espera
 * há mais tempo, e varrer com os olhos.
 *
 * O CARTÃO continua a ser o do telemóvel, intacto — foi desenhado para o
 * polegar e auditado ao toque. Isto não o substitui; convive com ele.
 */
function COLUNAS_DE_PEDIDOS(ctx: {
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  todayStr: string;
  atual?: string;
}): Coluna<Quote>[] {
  const diasAEsperar = (q: Quote) =>
    Math.floor((Date.now() - new Date(q.submittedAt).getTime()) / 86400000);
  return [
    {
      chave: "sel",
      cabecalho: "",
      largura: "w-10",
      celula: (q) => (
        <label
          className="flex cursor-pointer items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={ctx.selectedIds.has(q.id)}
            onChange={() => ctx.toggleSelect(q.id)}
            className="h-4 w-4 cursor-pointer accent-[#4d6350]"
            aria-label={`Selecionar pedido de ${q.name}`}
          />
        </label>
      ),
    },
    {
      chave: "nome",
      cabecalho: "Cliente",
      ordenar: (a, b) => a.name.localeCompare(b.name, "pt"),
      celula: (q) => (
        <span className="block">
          <span
            className={`block truncate ${
              ctx.atual === q.id ? "font-semibold text-[#4d6350]" : "text-foreground/85"
            }`}
          >
            {q.name}
          </span>
          <span className="block truncate text-[11px] text-foreground/45">{q.email}</span>
        </span>
      ),
    },
    { chave: "estado", cabecalho: "Estado", celula: (q) => statusBadge(q.status) },
    {
      chave: "data",
      cabecalho: "Data do evento",
      ordenar: (a, b) => (a.date ?? "").localeCompare(b.date ?? ""),
      celula: (q) => {
        const cd = eventCountdown(q.date);
        return (
          <span className="whitespace-nowrap">
            {q.date || "—"}
            {cd && cd.tone !== "past" && (
              <span
                className={`ml-1.5 text-[10px] ${
                  cd.tone === "today" || cd.tone === "soon"
                    ? "font-medium text-[#b5654a]"
                    : "text-foreground/45"
                }`}
              >
                {cd.label}
              </span>
            )}
          </span>
        );
      },
    },
    {
      chave: "local",
      cabecalho: "Local",
      soLargo: true,
      celula: (q) => <span className="block truncate">{q.location || "—"}</span>,
    },
    {
      chave: "pax",
      cabecalho: "Pax",
      soLargo: true,
      alinharADireita: true,
      ordenar: (a, b) => (a.guests ?? 0) - (b.guests ?? 0),
      celula: (q) => <span className="tabular-nums">{q.guests || "—"}</span>,
    },
    {
      // A coluna que ela pediu, e a que muda o que se faz a seguir: quem está
      // à espera há mais tempo. Ordenar por aqui é a pergunta "a quem devo
      // responder já", que na pilha de cartões não se conseguia fazer.
      chave: "espera",
      cabecalho: "À espera",
      alinharADireita: true,
      ordenar: (a, b) => diasAEsperar(b) - diasAEsperar(a),
      celula: (q) => {
        const d = diasAEsperar(q);
        const parado =
          (q.status === "pendente" || q.status === "em_revisao" || q.status === "cotado") &&
          d >= 14;
        return (
          <span
            className={`tabular-nums whitespace-nowrap ${
              parado ? "font-medium text-amber-600" : "text-foreground/60"
            }`}
          >
            {d}d
          </span>
        );
      },
    },
  ];
}

const QuoteCard = memo(function QuoteCard({
  q,
  isCurrent,
  isSelected,
  todayStr,
  onOpen,
  onToggle,
}: {
  q: Quote;
  isCurrent: boolean;
  isSelected: boolean;
  todayStr: string;
  onOpen: (q: Quote) => void;
  onToggle: (id: string) => void;
}) {
  const cat = CATEGORIES.find((c) => c.id === q.category);
  const et =
    q.category && q.eventType
      ? EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType)
      : null;
  // Lead parado: status ativo sem atividade há 14+ dias
  const lastActivity = q.lastUpdated ?? q.submittedAt;
  const daysSince = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000);
  const isStale =
    (q.status === "pendente" || q.status === "em_revisao" || q.status === "cotado") &&
    daysSince >= 14;
  const espera = diasDeEspera(q);
  const tom = espera === null ? null : tomDeEspera(espera);
  const ctx = contextoDeLocal(q);
  return (
    <div className="relative">
      {/* O `<input>` mede 16 px, mas quem se toca é o RÓTULO — o HTML manda o
          toque no rótulo activar o controlo. 24 px chegavam para o rato e não
          para o dedo; `alvo-toque` leva-o a 44 px no telemóvel sem mexer no
          quadrado desenhado, que continua a ser o de 16 px. */}
      <label
        className="alvo-toque absolute left-2 top-3.5 z-10 flex items-center justify-center min-w-[24px] min-h-[24px] cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(q.id)}
          className="w-4 h-4 accent-[#4d6350] cursor-pointer"
          aria-label={`Selecionar pedido de ${q.name}`}
        />
      </label>
      <button
        type="button"
        onClick={() => onOpen(q)}
        className={`w-full text-left p-5 pl-12 rounded-xl border transition-all duration-200 ${
          isCurrent
            ? "border-[#4d6350]/45 bg-[#4d6350]/[0.05] shadow-sm"
            : isSelected
              ? "border-[#4d6350]/30 bg-[#4d6350]/[0.03]"
              : "border-foreground/[0.08] hover:border-foreground/[0.18] bg-white shadow-sm hover:shadow-md"
        }`}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <p className="text-foreground/75 text-sm font-semibold truncate">{q.name}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-foreground/70 text-xs truncate">{q.email}</p>
              {q.assignedTo && (
                <span className="shrink-0 text-[9px] tracking-[0.08em] uppercase px-1.5 py-0.5 rounded bg-[#4d6350]/10 text-[#4d6350] font-medium whitespace-nowrap">
                  {q.assignedTo}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {statusBadge(q.status)}
            {/* HÁ QUANTO TEMPO ESPERA. A etiqueta "Novo" dizia o mesmo de um
                pedido de ontem e de um de há nove dias — e é o de há nove dias
                que já pediu orçamento a mais alguém. Só aparece para quem ainda
                espera resposta nossa: uma proposta enviada está à espera DELES.
                Cores: cinzento até 2 dias, âmbar de 3 a 6, vermelho a partir
                dos 7. */}
            {espera !== null && (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-semibold tracking-[0.1em] uppercase ${
                  tom === "urgente"
                    ? "bg-[#b5654a]/15 text-[#b5654a]"
                    : tom === "aviso"
                      ? "bg-[#c08a3e]/15 text-[#8a6420]"
                      : "bg-foreground/[0.06] text-foreground/45"
                }`}
                title={`Entrou ${esperaEmPalavras(espera)} e ainda não teve resposta`}
              >
                {esperaEmPalavras(espera)}
              </span>
            )}
            {isStale && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] tracking-[0.1em] uppercase font-semibold bg-amber-500/10 text-amber-600"
                title={`Sem atividade há ${daysSince} dias`}
              >
                <span className="w-1 h-1 rounded-full bg-current" />
                {daysSince}d parado
              </span>
            )}
            {q.followUpAt &&
              q.followUpAt <= todayStr &&
              q.status !== "aceite" &&
              q.status !== "rejeitado" && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] tracking-[0.1em] uppercase font-semibold ${
                    q.followUpAt < todayStr
                      ? "bg-[#b5654a]/15 text-[#b5654a]"
                      : "bg-[#637a5f]/15 text-[#4d6350]"
                  }`}
                  title={q.followUpAt < todayStr ? "Seguimento em atraso" : "Seguimento hoje"}
                >
                  <span className="w-1 h-1 rounded-full bg-current" />
                  Seguir
                </span>
              )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-foreground/70 text-[10px]">
          <span>{cat?.label ?? "—"}</span>
          {et && (
            <>
              <span className="w-px h-2.5 bg-foreground/12" />
              <span>{et.label}</span>
            </>
          )}
          <span className="w-px h-2.5 bg-foreground/12" />
          <span>{q.guests} convidados</span>
          {/* ONDE É. A região reconhecida e a distância a Évora dizem, antes
              de abrir seja o que for, se aquele casamento é ali ao lado ou se
              obriga a dormir fora — que muda o preço e a equipa. */}
          {ctx.regiao && (
            <>
              <span className="w-px h-2.5 bg-foreground/12" />
              <span title={ctx.aproximado ? "Região, não morada" : undefined}>
                {ctx.regiao}
                {ctx.km !== null && ctx.km > 0 && ` · ≈ ${ctx.km} km`}
              </span>
            </>
          )}
          {(() => {
            const cd = eventCountdown(q.date);
            if (!cd || cd.tone === "past") return null;
            return (
              <>
                <span className="w-px h-2.5 bg-foreground/12" />
                <span
                  className={
                    cd.tone === "today" || cd.tone === "soon"
                      ? "text-[#b5654a] font-medium"
                      : "text-foreground/70"
                  }
                >
                  {cd.label}
                </span>
              </>
            );
          })()}
        </div>
        {/* PROVÁVEL CASAMENTO À DISTÂNCIA: sem data E sem sítio reconhecível.
            Não é um diagnóstico — é um aviso de que aquele pedido se trabalha
            de outra maneira (fuso horário, visita impossível, tudo por
            escrito). Uma das ausências sozinha não bastava: datas por marcar há
            às dezenas em casamentos de Évora. */}
        {ctx.destination && (
          <div className="mt-2.5">
            <span
              className="inline-flex items-center rounded-full bg-[#4d6350]/10 px-2 py-0.5 text-[9px] font-medium tracking-wide text-[#4d6350]"
              title="Sem data e sem local concreto — normalmente organiza-se à distância"
            >
              Provável casamento à distância
            </span>
          </div>
        )}
        {q.tags && q.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {q.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-full bg-[#4d6350]/10 text-[#4d6350] text-[9px] font-medium tracking-wide"
              >
                {t}
              </span>
            ))}
            {q.tags.length > 4 && (
              <span className="text-foreground/30 text-[9px] px-1">+{q.tags.length - 4}</span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-foreground/[0.07]">
          <span className="text-foreground/40 text-[9px] font-mono tracking-tight" title={q.id}>
            Ref. {shortRef(q.id)}
          </span>
          <div className="flex items-center gap-3">
            {q.quotedPrice ? (
              <span className="text-[#4d6350] text-xs font-semibold">
                {formatPrice(q.quotedPrice)}
              </span>
            ) : q.priceBreakdown?.total ? (
              <span className="text-foreground/70 text-xs">
                ≈ {formatPrice(q.priceBreakdown.rangeMin)}–{formatPrice(q.priceBreakdown.rangeMax)}
              </span>
            ) : null}
            <span className="text-foreground/70 text-[10px]">
              {new Date(q.submittedAt).toLocaleDateString("pt-PT", {
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
});

export default function AdminClient({ initialQuotes, userName = "Catarina" }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [filterStatus, setFilterStatus] = useState<QuoteStatus | "all">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  /**
   * Os quatro filtros rápidos pedidos. Todos "all" por omissão: um filtro
   * ligado sem se dar por isso é a maneira de jurar que um pedido desapareceu.
   *
   * `filterEspera` é o único que não é uma lista de valores — é um corte ("há
   * três dias ou mais"), porque a pergunta que serve não é "quais esperam há
   * exactamente quatro dias" mas "o que é que já esperou de mais".
   */
  const [filterEspera, setFilterEspera] = useState<"all" | "3" | "7">("all");
  const [filterMes, setFilterMes] = useState<string>("all");
  const [filterRegiao, setFilterRegiao] = useState<string>("all");
  const [filterPlanner, setFilterPlanner] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  /**
   * A ordem por omissão é a ESPERA, não a data de entrada.
   *
   * "Mais recentes" põe à cabeça o que acabou de chegar — que é o que menos
   * urge. O que se perde é o pedido de há nove dias, que com essa ordem está no
   * fundo do ecrã, com a mesma etiqueta "Novo" de um que entrou esta manhã.
   */
  const [sort, setSort] = useState<
    "espera" | "recent" | "old" | "value" | "followup" | "eventdate"
  >("espera");
  const [saving, setSaving] = useState(false);
  const [editPrice, setEditPrice] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<QuoteStatus>("pendente");
  const [editAssigned, setEditAssigned] = useState("");
  const [editLostReason, setEditLostReason] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editGuests, setEditGuests] = useState("");
  const [editLocation, setEditLocation] = useState("");
  // Which tools section of the detail panel is showing. Everything is visible
  // at once now — the management form always renders; only the heavier tool
  // groups (Produção / Financeiro / Comunicação) are tabbed for organisation.
  const [detailTab, setDetailTab] = useState<DetailTab>("comunicacao");
  // Comunicação tab shows one proposal tool by default (ProposalStudio); the
  // simpler price-table tool (ProposalBuilder) stays collapsed behind a link.
  const [showBuilder, setShowBuilder] = useState(false);
  // Scroll targets for the "Próxima ação" shortcut: the always-visible
  // management form and the tools (tabs) section.
  const gestaoRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  // ETag da última lista de pedidos vinda de `/api/orcamento`, para a
  // revalidação poder perguntar "mudou alguma coisa?" em vez de mandar vir tudo
  // outra vez. Começa vazio: a primeira lista veio no HTML, sem carimbo.
  const quotesEtag = useRef<string | null>(null);
  /** Quando foi a última revalidação, para não a repetir a cada piscar de olhos. */
  const ultimaRevalidacao = useRef(0);
  const [view, setView] = useState<View>("overview");
  const [navOpen, setNavOpen] = useState(false);
  /** Pedido escolhido na vista "Fazer proposta".
   *
   *  Vive aqui e não dentro da vista porque a vista desmonta ao mudar de
   *  ecrã: sem isto, ir ver o calendário a meio de escrever uma proposta
   *  devolvia-a à lista de clientes ao voltar. (O conteúdo da proposta em si
   *  não se perde — o estúdio grava rascunho —, mas ter de reescolher a
   *  pessoa a cada volta era atrito puro.) */
  const [propostaPara, setPropostaPara] = useState<string | null>(null);
  // The sidebar's "Mais" group (secondary destinations) is collapsed by default.
  const [moreNavOpen, setMoreNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [passkeysOpen, setPasskeysOpen] = useState(false);
  const [ajudaOpen, setAjudaOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [recentQuotes, setRecentQuotes] = useState<RecentQuote[]>([]);
  // Below xl the detail panel is a modal slide-over (overlay + scrim); at xl+ it
  // is an inline sticky column. Only the overlay should behave as a dialog (focus
  // trap, aria-modal, scroll lock) — the inline panel must not trap focus.
  const [isDetailOverlay, setIsDetailOverlay] = useState(false);
  /**
   * A barra lateral está fora do ecrã (gaveta), e não encostada como coluna?
   *
   * Abaixo de `lg` a barra é uma gaveta que vive em `-translate-x-full` quando
   * fechada: continua no DOM, com tamanho, apenas empurrada para fora. A partir
   * de `lg` é uma coluna sempre visível. Sem saber em qual dos dois estamos não
   * há como marcá-la inerte só no caso certo.
   */
  const [navEhGaveta, setNavEhGaveta] = useState(false);
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  // Focus trap for the mobile detail drawer — active only while it's the overlay.
  const drawerRef = useFocusTrap<HTMLDivElement>(!!selected && isDetailOverlay);
  // Focus management for the inline (desktop, non-overlay) detail workspace. The
  // mobile overlay already traps + restores focus via useFocusTrap; for the inline
  // panel we manually move focus to the panel heading on open and hand it back to
  // the element that opened it on close, so keyboard users are never stranded.
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  // Current locale, read from the path (/{lang}/orcamento/admin), to build the
  // deep link into a quote's full-screen Dossier route.
  const pathname = usePathname();
  const lang = pathname?.split("/").filter(Boolean)[0] || "pt";

  // Does the detail panel have edits (status/price/notes) not yet saved? Used to
  // warn before switching/closing a quote so work is never silently lost.
  const isDirty =
    !!selected &&
    (editStatus !== selected.status ||
      editNotes !== (selected.adminNotes ?? "") ||
      // Compare parsed values, not raw strings — "1500,50" vs "1500.5" or a
      // trailing zero must not read as a phantom edit.
      parsePriceInput(editPrice) !== (selected.quotedPrice ?? undefined) ||
      editAssigned !== (selected.assignedTo ?? "") ||
      editLostReason !== (selected.lostReason ?? "") ||
      editDate !== (selected.date ?? "") ||
      editGuests !== String(selected.guests ?? "") ||
      editLocation !== (selected.location ?? ""));
  // Latest value mirrored into a ref for listeners bound earlier (e.g. Escape).
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Full-screen tool surface: hide public nav, grain & chrome.
  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);

  // Warm the caches of the high-traffic API views during idle after first
  // paint, so the first click on Propostas / Faturas / Tarefas / Calendário is
  // instant instead of a cold round-trip. Uses the same shared cache the views
  // read from (useCachedList), so a warmed view renders immediately with no
  // skeleton. Cheap + non-blocking; skipped if already cached/in-flight.
  useEffect(() => {
    return onIdle(() => {
      prefetchList("propostas", "/api/propostas");
      prefetchList("faturas", "/api/faturas");
      prefetchList("tarefas", "/api/tarefas");
      prefetchList("calendario", "/api/calendario");
    });
  }, []);

  // Restore the last view the user was on (per device). Done in an effect so it
  // never causes an SSR/hydration mismatch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY) as View | null;
      if (saved && NAV.some((n) => n.id === saved)) setView(saved);
    } catch {
      /* localStorage unavailable — keep default */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("liquen-recent-quotes");
      if (raw) setRecentQuotes(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  // Restore the Pedidos status filter + sort the team last used (per device).
  useEffect(() => {
    try {
      const f = localStorage.getItem("liquen-admin-filter");
      if (f === "all" || STATUS_OPTIONS.some((s) => s.id === f))
        setFilterStatus(f as QuoteStatus | "all");
      const so = localStorage.getItem("liquen-admin-sort");
      if (
        so === "espera" ||
        so === "recent" ||
        so === "old" ||
        so === "value" ||
        so === "followup" ||
        so === "eventdate"
      )
        setSort(so);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("liquen-admin-filter", filterStatus);
      localStorage.setItem("liquen-admin-sort", sort);
    } catch {
      /* ignore */
    }
  }, [filterStatus, sort]);

  // Jump straight to Pedidos and focus the search box.
  const focusSearch = useCallback(() => {
    setView("pedidos");
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  // Global keyboard shortcuts. ⌘K works anywhere; the rest are ignored while
  // typing so they never fight with form fields.
  useEffect(() => {
    let lastG = 0; // timestamp of the last "g" press, for the "g then key" chord
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }

      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key.toLowerCase();

      // "g" arms the chord; the next key within 900ms picks a destination.
      if (k === "g") {
        lastG = Date.now();
        return;
      }
      if (Date.now() - lastG < 900 && VIEW_KEYS[k]) {
        e.preventDefault();
        setView(VIEW_KEYS[k]);
        lastG = 0;
        return;
      }
      lastG = 0;

      if (k === "n") {
        e.preventDefault();
        setNewQuoteOpen(true);
      } else if (e.key === "/") {
        e.preventDefault();
        focusSearch();
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key === "Escape") {
        setShortcutsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusSearch]);

  // Escape dismisses the open drawer/nav — but only when no modal is capturing
  // it (the palette / new-quote / shortcuts dialogs handle their own Escape).
  useEffect(() => {
    if (paletteOpen || newQuoteOpen || shortcutsOpen || ajudaOpen || restoreOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape dentro de um campo de texto sai do CAMPO (dispensa autocomplete/
      // IME, tira o foco), nunca fecha o painel inteiro — fechar o detalhe a
      // meio da escrita descartava trabalho (ex.: um contractRef por gravar).
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        t.blur();
        return;
      }
      if (navOpen) setNavOpen(false);
      else if (selected) {
        if (
          !dirtyRef.current ||
          window.confirm("Tem alterações por guardar neste pedido. Descartar?")
        ) {
          setSelected(null);
        }
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [paletteOpen, newQuoteOpen, shortcutsOpen, ajudaOpen, restoreOpen, navOpen, selected]);

  // Lock background scroll while the mobile nav drawer is open.
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  // A barra lateral é gaveta abaixo de `lg` (1024px) — o mesmo ponto de corte
  // do `lg:sticky` / `lg:translate-x-0` que a desenha. Mesmo guarda do efeito
  // abaixo: sem `matchMedia` (SSR / jsdom) fica em `false`, que é o estado
  // seguro — nunca marca inerte uma barra que possa estar visível.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setNavEhGaveta(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Track whether the detail panel is currently a modal overlay (below xl) so the
  // dialog/focus-trap behaviour is gated to that state. matchMedia may be absent
  // (SSR / jsdom) — guard so this stays a no-op there, defaulting to inline.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 1279px)");
    const update = () => setIsDetailOverlay(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Lock background scroll while the detail drawer is open as a mobile overlay
  // (mirrors the nav-drawer lock above). The inline xl panel never locks.
  useEffect(() => {
    if (!selected || !isDetailOverlay) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selected, isDetailOverlay]);

  // Inline (desktop) detail: move focus into the workspace heading when a pedido
  // opens and restore it to the opener when it closes. Skipped while the panel is
  // the mobile overlay, where useFocusTrap owns focus instead.
  useEffect(() => {
    if (!selected || isDetailOverlay) return;
    const opener = detailOpenerRef.current;
    // Defer to after paint so the heading exists and layout has settled.
    const id = requestAnimationFrame(() => detailTitleRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      opener?.focus?.();
    };
  }, [selected, isDetailOverlay]);

  const paletteCommands: Command[] = useMemo(
    () => [
      {
        id: "action-new-quote",
        label: "Novo pedido (registo manual)",
        group: "Ações",
        run: () => setNewQuoteOpen(true),
      },
      {
        id: "action-export",
        label: "Exportar pedidos (CSV)",
        group: "Ações",
        run: () => {
          downloadCsv(`pedidos-${dateStamp()}`, quotesToCsvRows(quotes));
          toast(
            `${quotes.length} pedido${quotes.length !== 1 ? "s" : ""} exportado${quotes.length !== 1 ? "s" : ""}`,
            "success",
          );
        },
      },
      {
        id: "action-backup",
        label: "Descarregar backup",
        group: "Ações",
        run: () => {
          window.location.href = "/api/backup";
        },
      },
      {
        // A outra metade do backup. Sai na paleta ao lado dele de propósito:
        // quem procura "backup" num dia mau está a procurar isto.
        id: "action-restore",
        label: "Repor cópia de segurança (backup)",
        group: "Ações",
        run: () => setRestoreOpen(true),
      },
      ...NAV.map((item) => ({
        id: `nav-${item.id}`,
        label: item.label,
        group: "Navegar",
        run: () => setView(item.id),
      })),
    ],
    [quotes, toast],
  );

  // Returns true to proceed; if there are unsaved edits, asks for confirmation.
  function discardGuard(): boolean {
    if (!isDirty) return true;
    return window.confirm("Tem alterações por guardar neste pedido. Descartar?");
  }
  function closeDetail() {
    if (discardGuard()) setSelected(null);
  }

  function openQuote(q: Quote) {
    if (!discardGuard()) return;
    // Remember who opened the detail so focus can return there on close.
    if (typeof document !== "undefined") {
      detailOpenerRef.current = document.activeElement as HTMLElement | null;
    }
    setView("pedidos");
    setSelected(q);
    // Track in recently-viewed list (localStorage)
    try {
      const entry: RecentQuote = { id: q.id, name: q.name, email: q.email, status: q.status };
      const prev: RecentQuote[] = JSON.parse(localStorage.getItem("liquen-recent-quotes") ?? "[]");
      const next = [entry, ...prev.filter((r) => r.id !== q.id)].slice(0, 6);
      localStorage.setItem("liquen-recent-quotes", JSON.stringify(next));
      setRecentQuotes(next);
    } catch {
      /* ignore */
    }
    setEditPrice(q.quotedPrice ? String(q.quotedPrice) : "");
    setEditNotes(q.adminNotes ?? "");
    setEditStatus(q.status);
    setEditAssigned(q.assignedTo ?? "");
    setEditLostReason(q.lostReason ?? "");
    setEditDate(q.date ?? "");
    setEditGuests(String(q.guests ?? ""));
    setEditLocation(q.location ?? "");
    // Open on the tools tab that matches where this pedido is in its lifecycle.
    const target = detailNextAction(q).tab;
    setDetailTab(target === "gestao" ? "comunicacao" : target);
  }
  // Stable identity for the memoised QuoteCard's onOpen prop. openQuote is a
  // plain function (closes over discardGuard and many setters), so its reference
  // changes every render — passing it directly would defeat QuoteCard's memo.
  // A ref that always points at the latest openQuote keeps behaviour identical
  // while giving the row a callback whose identity never changes.
  const openQuoteRef = useRef(openQuote);
  // Keep the ref pointing at the latest openQuote (updated in an effect, not
  // during render). onOpen fires from a click, which is always after commit, so
  // it reads the current closure.
  useEffect(() => {
    openQuoteRef.current = openQuote;
  });
  const openQuoteStable = useCallback((q: Quote) => openQuoteRef.current(q), []);

  // Clone an event's details into a fresh quote (e.g. a returning client).
  // The date is intentionally left blank — it's a new event to schedule.
  async function duplicateQuote(q: Quote) {
    if (!discardGuard()) return;
    try {
      const res = await fetch("/api/orcamento/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: q.name,
          email: q.email,
          phone: q.phone,
          company: q.company,
          category: q.category,
          eventType: q.eventType,
          eventName: q.eventName,
          location: q.location,
          guests: q.guests,
          notes: q.notes,
          referralSource: q.referralSource || "Cliente recorrente",
          status: "em_revisao",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.quote) throw new Error();
      setQuotes((prev) => [data.quote, ...prev]);
      setSelected(data.quote);
      setEditPrice("");
      setEditNotes("");
      setEditStatus(data.quote.status);
      setEditAssigned(data.quote.assignedTo ?? "");
      setEditLostReason("");
      setEditDate(data.quote.date ?? "");
      setEditGuests(String(data.quote.guests ?? ""));
      setEditLocation(data.quote.location ?? "");
      setDetailTab("comunicacao");
      toast("Pedido duplicado — defina a nova data", "success");
    } catch {
      toast("Não foi possível duplicar o pedido", "error");
    }
  }

  /**
   * Vai buscar a lista de pedidos ao servidor, em silêncio.
   *
   * Isto era um botão "Atualizar" no cimo da página. Um botão desses é uma
   * pergunta que o programa faz a quem o usa — "achas que isto está velho?" —
   * quando é o programa que sabe a resposta. Passou a correr sozinho: ao voltar
   * ao separador, ao devolver o foco à janela, e de dois em dois minutos com a
   * página à vista. Um pedido novo entrado pelo site aparece sem ninguém pedir.
   *
   * Custa quase nada porque vai com `If-None-Match`: quando nada mudou o
   * servidor responde **304 sem corpo** e ficamos com o array que já tínhamos —
   * a MESMA referência, por isso o React nem sequer volta a desenhar as linhas.
   *
   * `forcar` salta o intervalo mínimo. É o que as mutações usam: depois de
   * gravar quero a lista do servidor, não a que tinha há trinta segundos.
   */
  const revalidarPedidos = useCallback(
    async (forcar = false) => {
      const agora = Date.now();
      if (!forcar && agora - ultimaRevalidacao.current < 15_000) return;
      ultimaRevalidacao.current = agora;
      try {
        const res = await fetch("/api/orcamento", {
          cache: "no-store",
          headers: {
            "x-admin-refresh": "1",
            ...(quotesEtag.current ? { "If-None-Match": quotesEtag.current } : {}),
          },
        });
        if (res.status === 304) return;
        const data = await res.json();
        if (Array.isArray(data)) {
          quotesEtag.current = res.headers.get("etag");
          setQuotes(data);
        }
      } catch {
        // Sem rede não há nada a dizer: a lista que está no ecrã continua a ser
        // a última verdade conhecida, e um erro por cada tentativa falhada
        // seria ruído de fundo em vez de informação.
      }
    },
    [setQuotes],
  );

  /**
   * A lista mantém-se fresca sozinha — é isto que dispensa o botão "Atualizar".
   *
   * Três gatilhos, todos com uma razão concreta:
   *   • voltar ao separador (`visibilitychange`) — o caso comum, estar noutro
   *     lado e regressar depois de o telefone ter tocado;
   *   • devolver o foco à janela (`focus`) — o mesmo, sem trocar de separador;
   *   • dois em dois minutos com a página à vista, para o pedido que entra pelo
   *     site enquanto a Catarina está a olhar para a lista.
   *
   * O relógio pára quando a página está escondida: revalidar um separador que
   * ninguém vê é gastar bateria para nada. O `revalidarPedidos` tem um intervalo
   * mínimo próprio, por isso alt-tab a repetir não dispara pedidos a repetir.
   */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void revalidarPedidos();
    };
    const relogio = setInterval(() => {
      if (document.visibilityState === "visible") void revalidarPedidos();
    }, 120_000);
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [revalidarPedidos]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/orcamento/admin";
  }

  async function appendActivity(quoteId: string, entries: ActivityEntry[]) {
    if (entries.length === 0) return;
    try {
      // Só as entradas NOVAS — o servidor junta ao histórico mais recente, para
      // que duas ferramentas a gravar em simultâneo nunca se sobrescrevam.
      const res = await fetch(`/api/orcamento/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityLogAppend: entries }),
      });
      if (res.ok) {
        const updated = await res.json();
        setQuotes((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        setSelected((prev) => (prev?.id === updated.id ? updated : prev));
      }
    } catch {
      /* best-effort */
    }
  }

  async function saveChanges() {
    if (!selected) return;
    setSaving(true);
    try {
      const newEntries: ActivityEntry[] = [];
      const now = new Date().toISOString();

      if (editStatus !== selected.status) {
        const from = STATUS_OPTIONS.find((s) => s.id === selected.status)?.label ?? selected.status;
        const to = STATUS_OPTIONS.find((s) => s.id === editStatus)?.label ?? editStatus;
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "status_change",
          actor: userName,
          summary: `${from} → ${to}`,
        });
      }
      const newPrice = parsePriceInput(editPrice);
      if (newPrice !== undefined && newPrice !== (selected.quotedPrice ?? 0)) {
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "price_set",
          actor: userName,
          summary: `Preço: ${eur(newPrice)}`,
        });
      }
      if (editNotes.trim() !== (selected.adminNotes ?? "").trim() && editNotes.trim()) {
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "note_added",
          actor: userName,
          summary: "Notas internas atualizadas",
        });
      }
      if (editAssigned.trim() !== (selected.assignedTo ?? "").trim()) {
        const to = editAssigned.trim();
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "assigned",
          actor: userName,
          summary: to ? `Atribuído a ${to}` : "Responsável removido",
        });
      }

      const newDate = editDate || undefined;
      const newGuests = editGuests ? parseInt(editGuests, 10) : selected.guests;
      const newLocation = editLocation.trim();

      if (newDate !== (selected.date ?? undefined) && newDate) {
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "note_added",
          actor: userName,
          summary: `Data do evento alterada para ${new Date(newDate + "T12:00:00").toLocaleDateString("pt-PT")}`,
        });
      }
      if (newGuests !== selected.guests) {
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "note_added",
          actor: userName,
          summary: `Convidados: ${selected.guests} → ${newGuests}`,
        });
      }
      if ((editLocation.trim() || "") !== (selected.location ?? "") && editLocation.trim()) {
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "note_added",
          actor: userName,
          summary: `Local: ${editLocation.trim()}`,
        });
      }

      // Campos limpos são enviados como null/"" (e não omitidos): `undefined`
      // desaparece no JSON e o merge parcial do servidor mantinha o valor
      // antigo — apagar um responsável/preço/data nunca chegava a gravar.
      const body: Record<string, unknown> = {
        status: editStatus,
        quotedPrice: newPrice ?? null,
        adminNotes: editNotes,
        assignedTo: editAssigned.trim() || null,
        lostReason: editLostReason.trim() || null,
        date: editDate,
        guests: newGuests,
        location: newLocation,
      };
      if (newEntries.length > 0) {
        // Append server-side (nunca o array completo) — ver appendActivity.
        body.activityLogAppend = newEntries;
      }

      const res = await fetch(`/api/orcamento/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("save failed");
      const updated = await res.json();
      setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      setSelected(updated);
      // Re-sync EVERY edit field to what the server persisted, so the form can
      // never sit dirty on a value the user did not type (e.g. price formatting).
      setEditStatus(updated.status);
      setEditPrice(updated.quotedPrice ? String(updated.quotedPrice) : "");
      setEditNotes(updated.adminNotes ?? "");
      setEditAssigned(updated.assignedTo ?? "");
      setEditLostReason(updated.lostReason ?? "");
      setEditDate(updated.date ?? "");
      setEditGuests(String(updated.guests ?? ""));
      setEditLocation(updated.location ?? "");
      toast("Pedido atualizado", "success");
    } catch {
      toast("Não foi possível guardar as alterações", "error");
    } finally {
      setSaving(false);
    }
  }

  // Apply a status to every selected pedido in one go.
  async function applyBulkStatus(status: QuoteStatus) {
    const ids = [...selectedIds];
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/orcamento/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ),
      );
      const updated = new Map<string, Quote>(results.filter(Boolean).map((u: Quote) => [u.id, u]));
      if (updated.size > 0) {
        setQuotes((prev) => prev.map((q) => updated.get(q.id) ?? q));
        setSelected((prev) => (prev && updated.has(prev.id) ? updated.get(prev.id)! : prev));
      }
      const ok = updated.size;
      const failed = ids.length - ok;
      toast(
        failed === 0
          ? `${ok} pedido${ok !== 1 ? "s" : ""} atualizado${ok !== 1 ? "s" : ""}`
          : `${ok} atualizado(s), ${failed} falhou(ram)`,
        failed === 0 ? "success" : "error",
      );
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  }

  // Permanently delete every selected pedido (hard delete, not archive). One
  // confirm covers the whole batch; each id is DELETEd, then the successful
  // ones are dropped from local state and the selection is cleared.
  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0 || bulkBusy) return;
    if (
      !window.confirm(
        `Apagar ${ids.length} pedidos definitivamente? Esta ação não pode ser anulada.`,
      )
    )
      return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/orcamento/${id}`, { method: "DELETE" })
            .then((r) => (r.ok ? id : null))
            .catch(() => null),
        ),
      );
      const removed = new Set(results.filter((x): x is string => x !== null));
      if (removed.size > 0) {
        setQuotes((prev) => prev.filter((q) => !removed.has(q.id)));
        setSelected((prev) => (prev && removed.has(prev.id) ? null : prev));
      }
      const ok = removed.size;
      const failed = ids.length - ok;
      toast(
        failed === 0
          ? `${ok} pedido${ok !== 1 ? "s" : ""} apagado${ok !== 1 ? "s" : ""}`
          : `${ok} apagado(s), ${failed} falhou(ram)`,
        failed === 0 ? "success" : "error",
      );
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  }

  const archivedCount = useMemo(() => quotes.filter((q) => q.archived).length, [quotes]);

  // Archived quotes are soft-deleted: keep them out of the analytical surfaces
  // (overview, pipeline, clientes, calendário, estatísticas) so a junk or
  // duplicate lead never pollutes the numbers. They stay reachable via the
  // "Arquivados" toggle on Pedidos and the command palette.
  const activeQuotes = useMemo(() => quotes.filter((q) => !q.archived), [quotes]);

  /**
   * As opções dos filtros saem dos DADOS, não de uma lista fixa. Um mês sem
   * eventos ou uma região onde nunca houve um casamento não aparecem — um
   * filtro que só tem escolhas vazias é ruído com aspeto de função.
   */
  const mesesDisponiveis = useMemo(() => mesesDeEvento(activeQuotes), [activeQuotes]);
  const regioesDisponiveis = useMemo(() => regioesDe(activeQuotes), [activeQuotes]);
  const plannersDisponiveis = useMemo(() => plannersDe(activeQuotes), [activeQuotes]);

  // Keep the search input instant while the expensive filter+sort over all leads
  // runs at lower priority: typing updates `search` immediately, but the O(n)
  // filter/O(n log n) sort + list re-render key off the deferred value, so a
  // keystroke never blocks on the whole-list recompute (janky at hundreds).
  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    let list = quotes.filter((x) => (showArchived ? x.archived : !x.archived));
    if (!showArchived && filterStatus !== "all") {
      list = list.filter((x) => x.status === filterStatus);
    }
    if (filterCategory !== "all") {
      list = list.filter((x) => x.category === filterCategory);
    }
    if (mineOnly) {
      list = list.filter((x) => x.assignedTo === userName);
    }
    if (filterEspera !== "all") {
      const corte = Number(filterEspera);
      list = list.filter((x) => (diasDeEspera(x) ?? -1) >= corte);
    }
    if (filterMes !== "all") {
      list = list.filter((x) => (x.date ?? "").slice(0, 7) === filterMes);
    }
    if (filterRegiao !== "all") {
      list = list.filter((x) => contextoDeLocal(x).regiao === filterRegiao);
    }
    if (filterPlanner !== "all") {
      list = list.filter((x) => (x.company ?? "").trim() === filterPlanner);
    }
    if (tagFilter) {
      list = list.filter((x) => (x.tags ?? []).includes(tagFilter));
    }
    if (q) {
      list = list.filter((x) =>
        [
          x.name,
          x.email,
          x.phone,
          x.company,
          x.location,
          x.id,
          x.assignedTo,
          x.contractRef,
          ...(x.tags ?? []),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    const sorted = [...list];
    if (sort === "espera") sorted.sort((a, b) => porEspera(a, b));
    else if (sort === "recent")
      sorted.sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt));
    else if (sort === "old")
      sorted.sort((a, b) => +new Date(a.submittedAt) - +new Date(b.submittedAt));
    else if (sort === "followup")
      // Leads needing a follow-up float to the top, soonest/most-overdue first;
      // those without a follow-up date fall to the bottom (most recent among them).
      sorted.sort((a, b) => {
        const av = a.followUpAt ?? "9999-99-99";
        const bv = b.followUpAt ?? "9999-99-99";
        if (av !== bv) return av < bv ? -1 : 1;
        return +new Date(b.submittedAt) - +new Date(a.submittedAt);
      });
    else if (sort === "eventdate")
      // Upcoming events first (soonest at the top); undated quotes sink to the
      // bottom, most recent among them.
      sorted.sort((a, b) => {
        const av = a.date || "9999-99-99";
        const bv = b.date || "9999-99-99";
        if (av !== bv) return av < bv ? -1 : 1;
        return +new Date(b.submittedAt) - +new Date(a.submittedAt);
      });
    else
      sorted.sort(
        (a, b) =>
          (b.quotedPrice ?? b.priceBreakdown?.total ?? 0) -
          (a.quotedPrice ?? a.priceBreakdown?.total ?? 0),
      );
    return sorted;
  }, [
    quotes,
    filterStatus,
    filterCategory,
    filterEspera,
    filterMes,
    filterRegiao,
    filterPlanner,
    tagFilter,
    deferredSearch,
    sort,
    showArchived,
    mineOnly,
    userName,
  ]);

  // Paginação incremental da lista: com centenas de pedidos, renderizar tudo
  // degrada a página. Só o RENDER é paginado — exportar CSV, "selecionar
  // todos" e contagens continuam a operar sobre a lista filtrada completa.
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(LIST_PAGE_SIZE);
  }, [search, filterStatus, filterCategory, tagFilter, sort, showArchived, mineOnly]);
  const visibleQuotes = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const pendingCount = activeQuotes.filter(
    (q) => q.status === "pendente" || q.status === "em_revisao",
  ).length;

  // Every tag in use across all quotes — feeds the tag editor suggestions and
  // the Pedidos tag filter.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const q of quotes) for (const t of q.tags ?? []) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [quotes]);

  // Active-quote counts per status, computed once instead of one full
  // `quotes.filter()` per status pill on every render.
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let activeTotal = 0;
    for (const q of quotes) {
      if (q.archived) continue;
      activeTotal += 1;
      counts[q.status] = (counts[q.status] ?? 0) + 1;
    }
    return { counts, activeTotal };
  }, [quotes]);

  const todayStr = todayKey();

  // One sidebar destination — shared by the always-visible core list and the
  // collapsible "Mais" group so both render identically.
  function renderNavItem(id: View) {
    const item = NAV.find((n) => n.id === id)!;
    const active = view === id;
    return (
      <button
        key={item.id}
        onClick={() => {
          setView(item.id);
          setNavOpen(false);
        }}
        aria-current={active ? "page" : undefined}
        className={`alvo-toque !justify-start group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] motion-safe:transition-colors duration-150 ${
          active
            ? "bg-[var(--bo-surface-hover)] text-[var(--bo-text)] font-medium"
            : "text-[var(--bo-text-muted)] font-normal hover:bg-[var(--bo-surface-hover)] hover:text-[var(--bo-text)]"
        }`}
      >
        <span
          className={`shrink-0 motion-safe:transition-colors duration-150 ${
            active
              ? "text-[var(--bo-text)]"
              : "text-[var(--bo-text-faint)] group-hover:text-[var(--bo-text-muted)]"
          }`}
        >
          {item.icon}
        </span>
        <span className="truncate">{item.label}</span>
        {item.id === "pedidos" && pendingCount > 0 && (
          <span
            className={`ml-auto min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none tabular-nums ${
              active
                ? "bg-[var(--bo-accent)] text-white"
                : "bg-[var(--bo-surface-hover)] text-[var(--bo-text-muted)]"
            }`}
          >
            {pendingCount}
          </span>
        )}
      </button>
    );
  }

  /**
   * As vistas onde as acções DE PEDIDOS da barra de topo — "Atualizar" e
   * "+ Novo" — querem dizer alguma coisa.
   *
   * As duas são sobre pedidos e só sobre pedidos: o "Atualizar" volta a pedir
   * `/api/orcamento` e o "+ Novo" abre o formulário de pedido novo. Estavam a
   * aparecer em TODAS as vistas, e numa página de Temas isso é pior do que
   * redundante — são dois botões que parecem ser sobre o que está no ecrã e não
   * são. Ao lado do "Novo tema" da própria página, o "+ Novo" criava um pedido;
   * o "Atualizar" recarregava uma lista que ali nem se vê, e a equipa carregava
   * nele à espera de ver as fotos novas.
   *
   * Nas vistas que ficam de fora não há nada a substituir: cada uma trata do seu
   * próprio carregamento e actualiza-se sozinha ao gravar (os Temas, por
   * exemplo, actualizam o cartão no momento em que a foto entra).
   */
  const ACOES_DE_PEDIDOS: ReadonlySet<View> = new Set<View>([
    "overview",
    "pedidos",
    "kanban",
    "clientes",
    "calendario",
    "propostas",
    "estatisticas",
  ]);
  const mostrarAccoesDePedidos = ACOES_DE_PEDIDOS.has(view);

  const VIEW_TITLES: Record<View, string> = {
    overview: "Visão Geral",
    pedidos: "Pedidos",
    kanban: "Organização de propostas",
    clientes: "Clientes",
    calendario: "Calendário",
    propostas: "Propostas",
    acompanhamento: "Acompanhamento",
    definicoes: "Definições",
    servicos: "Biblioteca de serviços",
    "fazer-proposta": "Fazer proposta",
    tarefas: "Tarefas",
    fornecedores: "Fornecedores",
    inventario: "Inventário",
    material: "Material",
    temas: "Temas",
    estatisticas: "Estatísticas",
    faturas: "Faturas",
    contratos: "Propostas Aceites",
    "modelos-email": "Modelos de email",
  };

  const VIEW_SUB: Record<View, string> = {
    // Vazio de propósito: a própria Visão Geral já abre com data + saudação —
    // um eyebrow extra aqui era só mais texto.
    overview: "",
    pedidos: "Pedidos de orçamento recebidos",
    kanban: "Arraste os pedidos entre fases",
    clientes: "Histórico por cliente",
    calendario: "Os seus eventos no tempo",
    propostas: "Todas as propostas enviadas",
    acompanhamento: "O que está à espera de resposta, por ordem de urgência",
    definicoes: "Os números com que o estúdio faz contas",
    servicos: "As palavras que vão nas propostas, escritas com tempo",
    "fazer-proposta": "Escolha o cliente e escreva a proposta",
    tarefas: "Organização interna da equipa",
    fornecedores: "Parceiros e contactos",
    inventario: "Adereços e materiais de decoração",
    material: "O que vai nas carrinhas: ferramentas, consumíveis, escadotes",
    temas: "Fotos de inspiração por tema, prontas para as propostas",
    estatisticas: "Métricas e desempenho",
    faturas: "Livro de faturação e pagamentos",
    contratos: "Aceitações de condições e estado de cada contrato",
    "modelos-email": "Emails reutilizáveis da equipa",
  };

  return (
    <>
      <div className="min-h-screen bg-surface flex">
        <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        {/* Repor uma cópia troca os dados TODOS no servidor, e a lista que está
            aqui em memória não tem como saber o que mudou. É o único sítio onde
            a revalidação salta o intervalo mínimo: ao fechar o diálogo, o que
            está no ecrã tem de ser o que ficou gravado. */}
        <RestoreDialog
          open={restoreOpen}
          onClose={() => {
            setRestoreOpen(false);
            void revalidarPedidos(true);
          }}
          toast={toast}
        />
        <PasskeysDialog open={passkeysOpen} onClose={() => setPasskeysOpen(false)} toast={toast} />
        <AjudaGlossario open={ajudaOpen} onClose={() => setAjudaOpen(false)} />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          navCommands={paletteCommands}
          quotes={quotes}
          onOpenQuote={openQuote}
          recentQuotes={recentQuotes}
        />
        <NewQuoteModal
          open={newQuoteOpen}
          onClose={() => setNewQuoteOpen(false)}
          existingQuotes={quotes}
          onCreated={(q) => {
            setQuotes((prev) => [q, ...prev]);
            openQuote(q);
          }}
        />
        {/* ── Sidebar ── */}
        {/* `inert` quando é gaveta E está fechada.
            Sem isto, os 20 botões da gaveta fechada continuavam alcançáveis: o
            `-translate-x-full` empurra-os para `x = -244` mas não os tira do
            DOM, portanto o TAB de um teclado externo e o varrimento do
            VoiceOver entravam lá dentro e o foco desaparecia do ecrã — ficava-se
            a carregar em Tab às cegas. `inert` tira-os da ordem de foco e da
            árvore de acessibilidade de uma vez.
            As duas condições são precisas: a partir de `lg` a barra é uma
            coluna sempre visível, e marcá-la inerte ali desligava a navegação
            no portátil. */}
        <aside
          inert={navEhGaveta && !navOpen}
          className={`fixed lg:sticky top-0 z-40 h-screen w-64 shrink-0 bg-[var(--bo-surface-sunken)] flex flex-col border-r border-[var(--bo-hairline)] shadow-xl lg:shadow-none motion-safe:transition-transform duration-300 ${
            navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          {/* Mobile close */}
          <button
            className="lg:hidden absolute top-3 right-3 w-11 h-11 flex items-center justify-center text-[var(--bo-text-faint)] hover:text-[var(--bo-text)] rounded-lg hover:bg-[var(--bo-surface-hover)] transition-colors"
            onClick={() => setNavOpen(false)}
            aria-label="Fechar menu"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>

          {/* Marca — o logótipo sozinho, em maior. A legenda "Back Office" saiu:
              quem está aqui dentro já sabe onde está, e o rótulo só roubava
              espaço ao único elemento que identifica a casa. O nome continua a
              ser anunciado por leitores de ecrã através do `alt` da imagem. */}
          <div className="w-full px-3 pt-5 pb-6 flex justify-center">
            <Image
              src="/logo-liquen.png"
              alt="Líquen Events"
              width={300}
              height={179}
              priority
              /* Centrado e a ocupar a largura toda da barra.
               *
               * Antes limitava-se a altura (`h-28`), e com isso o logótipo
               * parava nos ~188 px de largura numa barra de 256: sobrava
               * margem dos dois lados e ele ficava pequeno no meio do vazio.
               * Amarrando à LARGURA (`w-full`) e deixando a altura seguir o
               * rácio, passa a encher a barra de margem a margem — é a marca
               * que abre o dia de trabalho, não um ícone. */
              className="w-full h-auto object-contain"
            />
          </div>

          {/* Nav — quiet, ChatGPT-like rail: a short core list always visible,
              everything else tucked into a collapsed "Mais" group so a newcomer
              sees few things at once. The group auto-opens when a "Mais" view is
              active, so the current item (and its aria-current) is never hidden. */}
          <nav
            aria-label="Navegação do back office"
            className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto"
          >
            {CORE_NAV.map((id) => renderNavItem(id))}

            {/* "Mais" — secondary destinations, collapsed by default. */}
            {(() => {
              const activeInMore = MORE_NAV.includes(view);
              const expanded = moreNavOpen || activeInMore;
              return (
                <div className="mt-3 pt-3 border-t border-[var(--bo-hairline)] flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setMoreNavOpen((o) => !o)}
                    aria-expanded={expanded}
                    className="alvo-toque !justify-start group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-normal text-[var(--bo-text-muted)] hover:bg-[var(--bo-surface-hover)] hover:text-[var(--bo-text)] motion-safe:transition-colors duration-150"
                  >
                    <span className="shrink-0 text-[var(--bo-text-faint)] group-hover:text-[var(--bo-text-muted)]">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      >
                        <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
                        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                        <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
                      </svg>
                    </span>
                    <span className="truncate">Mais</span>
                    <svg
                      className={`ml-auto shrink-0 text-[var(--bo-text-faint)] motion-safe:transition-transform duration-200 ${
                        expanded ? "rotate-180" : ""
                      }`}
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {expanded && (
                    <div className="flex flex-col gap-1">{MORE_NAV.map(renderNavItem)}</div>
                  )}
                </div>
              );
            })()}
          </nav>

          {/* User */}
          <div className="px-2.5 pb-5 pt-3 border-t border-[var(--bo-hairline)]">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--bo-surface-hover)] mb-2">
              <div className="w-8 h-8 rounded-full bg-[var(--bo-accent)] flex items-center justify-center text-white text-xs font-bold shrink-0">
                {userName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[var(--bo-text)] text-xs font-medium truncate">{userName}</p>
                <p className="text-[var(--bo-text-faint)] text-[10px] truncate">Administração</p>
              </div>
            </div>
            {/* Linha própria, e não um quinto botão na fila de baixo: com cinco
                não cabia o rótulo de nenhum. É também o sítio onde se procura —
                logo debaixo de quem está com a sessão aberta. */}
            <button
              onClick={() => setPasskeysOpen(true)}
              className="alvo-toque w-full flex items-center justify-center gap-1.5 py-2 mb-1 text-[var(--bo-text-faint)] text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-[var(--bo-text)] hover:bg-[var(--bo-surface-hover)] transition-colors"
              title="Entrar sem palavra-passe neste aparelho"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
              </svg>
              Os meus dispositivos
            </button>
            <div className="flex gap-1 pointer-coarse:gap-2">
              {/* A LISTA DE ATALHOS DE TECLADO NÃO APARECE NUM ECRÃ DE TOQUE.
                  É uma folha inteira a ensinar teclas — ⌘K, ?, G depois P — a
                  quem não tem teclado. Ocupava metade da gaveta de navegação
                  no telemóvel para não oferecer nada que ali se possa fazer.
                  Continua a abrir com "?" em quem tem teclado, e o botão
                  continua lá no computador. */}
              <button
                onClick={() => setShortcutsOpen(true)}
                className="alvo-toque pointer-coarse:hidden flex-1 flex items-center justify-center gap-1.5 py-2 text-[var(--bo-text-faint)] text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-[var(--bo-text)] hover:bg-[var(--bo-surface-hover)] transition-colors"
                title="Atalhos de teclado"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12" strokeLinecap="round" />
                </svg>
                Atalhos
              </button>
              {/* Plain <a> on purpose: this hits an API route that streams a
                  file download, not a page — next/link would be wrong here. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/api/backup"
                className="alvo-toque flex-1 flex items-center justify-center gap-1.5 py-2 text-[var(--bo-text-faint)] text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-[var(--bo-text)] hover:bg-[var(--bo-surface-hover)] transition-colors"
                title="Exportar backup"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Backup
              </a>
              {/* A outra metade do botão ao lado. Fica AQUI, encostado ao
                  Backup, porque é aqui que se procura num dia mau — e porque
                  uma cópia sem forma de a repor nunca foi uma cópia. */}
              <button
                onClick={() => setRestoreOpen(true)}
                className="alvo-toque flex-1 flex items-center justify-center gap-1.5 py-2 text-[var(--bo-text-faint)] text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-[var(--bo-text)] hover:bg-[var(--bo-surface-hover)] transition-colors"
                title="Repor cópia de segurança"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="M12 21V9m0 0l-4 4m4-4l4 4M5 3h14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Repor
              </button>
              <button
                onClick={logout}
                className="alvo-toque flex-1 flex items-center justify-center gap-1.5 py-2 text-[var(--bo-text-faint)] text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-[var(--bo-text)] hover:bg-[var(--bo-surface-hover)] transition-colors"
                title="Terminar sessão"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Sair
              </button>
            </div>
          </div>
        </aside>

        {/* Backdrop (mobile nav drawer) */}
        {navOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 lg:hidden backdrop-blur-[2px]"
            onClick={() => setNavOpen(false)}
          />
        )}

        {/* ── Mobile bottom navigation ──
            Hidden while a quote detail drawer is open: it's a focused, modal
            surface, so the tab bar would only overlap its footer and distract. */}
        <nav
          className={`lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--bo-surface)] border-t border-[var(--bo-hairline)] transition-transform duration-300 ${
            selected ? "translate-y-full" : "translate-y-0"
          }`}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-stretch">
            {(
              [
                { id: "overview", label: "Visão Geral" },
                { id: "pedidos", label: "Pedidos" },
                { id: "propostas", label: "Propostas" },
              ] as const
            ).map((item) => {
              const navItem = NAV.find((n) => n.id === item.id)!;
              const isActive = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-1 min-h-[56px] transition-colors ${
                    isActive ? "text-[var(--bo-accent)]" : "text-[var(--bo-text-faint)]"
                  }`}
                >
                  {item.id === "pedidos" && pendingCount > 0 && (
                    <span className="absolute top-2.5 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-[var(--bo-accent)]" />
                  )}
                  <span
                    className={`transition-transform duration-150 ${isActive ? "scale-110" : ""}`}
                  >
                    {navItem.icon}
                  </span>
                  <span className="text-[8px] tracking-wide uppercase font-medium">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Mais destinos"
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-1 min-h-[56px] transition-colors ${
                !["overview", "pedidos", "propostas"].includes(view)
                  ? "text-[var(--bo-accent)]"
                  : "text-[var(--bo-text-faint)]"
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
              </svg>
              <span className="text-[8px] tracking-wide uppercase font-medium">Mais</span>
            </button>
          </div>
        </nav>

        {/* ── Main ── */}
        {/* Bottom padding clears the real mobile nav height (56px + the notch
            safe-area inset) so the last row never hides under the tab bar. */}
        <div className="flex-1 min-w-0 flex flex-col pb-[calc(56px+env(safe-area-inset-bottom))] lg:pb-0">
          {/* Top bar */}
          {/* A ESCADA DE PLANOS do back office, escrita uma vez para não voltar
              a colidir:
                10  detalhes dentro de um cartão (cabeçalhos de painel)
                20  barras `sticky` DENTRO do conteúdo (a do total do estúdio)
                30  o cabeçalho da vista e a barra de navegação de baixo
                40  a gaveta de navegação e o seu fundo escuro
                50+ diálogos e o Toast

              Este cabeçalho estava a `z-20` — o MESMO plano da barra do total
              do estúdio. Com o mesmo `z-index` quem manda é a ordem no DOM, e a
              barra do estúdio vem depois: passava por cima do cabeçalho. Com o
              fundo a 95% via-se o texto de uma a atravessar a outra, e era isso
              que fazia "Escolha o cliente e escreva a proposta" aparecer por
              cima do título.

              O fundo passa a OPACO pela mesma razão: 5% de transparência num
              ecrã com texto escuro por baixo chega para o tornar ilegível, e
              aqui não há nada a ganhar com o efeito. */}
          <header className="sticky top-0 z-30 bg-[var(--bo-surface,#ffffff)] border-b border-[var(--bo-hairline)] pt-safe">
            <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 sm:gap-4 px-4 sm:px-6 lg:px-10 py-4 lg:py-5">
              {/* Mobile menu — opens the full nav drawer without depending on the
                  bottom-nav "Mais" (which is hidden while a quote drawer is open). */}
              <button
                onClick={() => setNavOpen(true)}
                aria-label="Abrir menu"
                className="lg:hidden -ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--bo-text-muted)] hover:bg-[var(--bo-surface-hover)] hover:text-[var(--bo-text)] transition-colors"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
                </svg>
              </button>
              <div className="min-w-0">
                {VIEW_SUB[view] && (
                  <p className="text-foreground/35 text-[9px] tracking-[0.35em] uppercase mb-1.5 font-medium">
                    {VIEW_SUB[view]}
                  </p>
                )}
                <h1
                  className="text-foreground/88 font-bold leading-none"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "clamp(20px, 2.6vw, 30px)",
                  }}
                >
                  {VIEW_TITLES[view]}
                </h1>
              </div>
              <div className="ml-auto flex items-center gap-1.5 pointer-coarse:gap-2.5 sm:gap-2 shrink-0">
                <button
                  onClick={() => setAjudaOpen(true)}
                  aria-label="Ajuda e glossário"
                  title="Ajuda e glossário"
                  className="alvo-toque w-10 h-10 flex items-center justify-center text-foreground/30 rounded-lg hover:bg-foreground/[0.06] hover:text-foreground/55 transition-colors"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path
                      d="M9.4 9a2.6 2.6 0 1 1 3.4 2.5c-.7.3-1.3.9-1.3 1.7v.3"
                      strokeLinecap="round"
                    />
                    <path d="M12 17h.01" strokeLinecap="round" />
                  </svg>
                </button>
                <NotificationBell />
                {/* A vista dos Temas tem campo de procura próprio, e dois sítios
                    para procurar na mesma página é uma escolha a mais sem ganho
                    nenhum: o de dentro filtra os temas à medida que se escreve,
                    este abre a navegação global. Só o BOTÃO sai — o atalho ⌘K
                    continua a funcionar em todo o lado, aqui incluído. */}
                {view !== "temas" && (
                  <button
                    onClick={() => setPaletteOpen(true)}
                    // `flex` e não `hidden sm:flex`: abaixo de 640 px o botão
                    // desaparecia, e com ele a ÚNICA forma de chegar à pesquisa
                    // global — porque a outra é o ⌘K, e num telemóvel não há ⌘.
                    // A procura por nome de casal deixava de existir no
                    // aparelho onde ela mais a usa. O rótulo continua a só
                    // aparecer a partir de `md`; o que passa a estar sempre lá
                    // é o alvo.
                    // `min-w-11` a par do `min-h-11`: sem rótulo (abaixo de
                    // `md`) o botão fica só com a lupa de 12 px e media 38 px
                    // de largura — alto que chegue e estreito de mais.
                    className="flex items-center gap-2 px-3 py-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center border border-[var(--bo-hairline)] text-[var(--bo-text-faint)] text-[10px] tracking-[0.12em] uppercase rounded-lg hover:bg-[var(--bo-surface-hover)] hover:text-[var(--bo-text-muted)] transition-colors"
                    // Sem isto, abaixo de `md` (onde o rótulo está escondido) o
                    // botão é uma lupa sem nome nenhum para o VoiceOver. O
                    // `title` não serve: num telemóvel nunca chega a aparecer.
                    aria-label="Pesquisar"
                    title="Pesquisar (Ctrl K)"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                    </svg>
                    <span className="hidden md:inline">Pesquisar</span>
                    {/* Num ecrã de toque não há ⌘ nenhum para carregar: a
                        etiqueta anuncia uma tecla que o aparelho não tem. */}
                    <kbd className="pointer-coarse:hidden text-[8px] border border-[var(--bo-hairline-strong)] rounded px-1 py-0.5 ml-0.5">
                      ⌘K
                    </kbd>
                  </button>
                )}
                {mostrarAccoesDePedidos && (
                  <button
                    onClick={() => setNewQuoteOpen(true)}
                    aria-label="Novo pedido"
                    className="alvo-toque flex items-center gap-2 px-4 py-2 bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase rounded-lg hover:bg-[#2a3227] transition-colors shadow-sm"
                    title="Criar pedido manualmente"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                    >
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                    <span className="hidden sm:inline">Novo</span>
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* ── Overview ── */}
          {view === "overview" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Overview
                quotes={activeQuotes}
                userName={userName}
                onOpen={openQuote}
                onGoStats={() => setView("estatisticas")}
                onGo={(v) => setView(v)}
                onNew={() => setNewQuoteOpen(true)}
              />
            </div>
          )}

          {/* ── Pipeline (Kanban) ── */}
          {view === "kanban" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Kanban
                quotes={activeQuotes}
                onOpen={openQuote}
                userName={userName}
                onStatusChange={(id, status) => {
                  setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)));
                  setSelected((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
                }}
              />
            </div>
          )}

          {/* ── Clientes ── */}
          {view === "clientes" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Clientes quotes={activeQuotes} onOpen={openQuote} />
            </div>
          )}

          {/* ── Calendário ── */}
          {view === "calendario" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Calendario quotes={activeQuotes} onOpen={openQuote} />
            </div>
          )}

          {/* ── Fazer proposta ── */}
          {view === "fazer-proposta" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <FazerProposta
                quotes={activeQuotes}
                selectedId={propostaPara}
                onSelect={setPropostaPara}
                onNovoPedido={() => setNewQuoteOpen(true)}
                onQuoteUpdated={(q) => {
                  setQuotes((prev) => prev.map((x) => (x.id === q.id ? q : x)));
                  setSelected((prev) => (prev?.id === q.id ? q : prev));
                  setEditPrice(q.quotedPrice ? String(q.quotedPrice) : "");
                }}
                onSent={(q) => {
                  setQuotes((prev) =>
                    prev.map((x) => (x.id === q.id ? { ...x, status: "cotado" } : x)),
                  );
                  setSelected((prev) => (prev?.id === q.id ? { ...prev, status: "cotado" } : prev));
                }}
              />
            </div>
          )}

          {/* ── Propostas ── */}
          {view === "propostas" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Propostas
                quotes={quotes}
                onOpenQuote={openQuote}
                onQuoteUpdated={(q) => {
                  setQuotes((prev) => prev.map((x) => (x.id === q.id ? q : x)));
                  setSelected((prev) => (prev?.id === q.id ? q : prev));
                }}
              />
            </div>
          )}

          {/* ── Biblioteca de serviços ── */}
          {view === "servicos" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Servicos />
            </div>
          )}

          {/* ── Definições: combustível, custo por km, margem mínima ── */}
          {view === "definicoes" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <DefinicoesProposta />
            </div>
          )}

          {/* ── Acompanhamento: o que ficou à espera de resposta ── */}
          {view === "acompanhamento" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Acompanhamento quotes={quotes} onOpenQuote={openQuote} />
            </div>
          )}

          {/* ── Tarefas ── */}
          {view === "tarefas" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Tarefas defaultAssignee={userName} />
            </div>
          )}

          {/* ── Fornecedores ── */}
          {view === "fornecedores" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Fornecedores />
            </div>
          )}

          {/* ── Estatísticas ── */}
          {view === "estatisticas" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <StatsDashboard quotes={activeQuotes} />
            </div>
          )}

          {/* ── Inventário ── */}
          {view === "inventario" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Inventario />
            </div>
          )}

          {/* ── Material de logística ── */}
          {view === "material" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Material />
            </div>
          )}

          {/* ── Biblioteca de temas ── */}
          {view === "temas" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Temas />
            </div>
          )}

          {/* ── Faturas ── */}
          {view === "faturas" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Faturas quotes={quotes} />
            </div>
          )}

          {/* ── Contratos ── */}
          {view === "contratos" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Contratos />
            </div>
          )}

          {/* ── Modelos de email ── */}
          {view === "modelos-email" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <EmailTemplates />
            </div>
          )}

          {/* ── Pedidos ── */}
          <div className={`${VIEW_WRAP} ${view === "pedidos" ? "view-in" : "hidden"}`}>
            {/* Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
              <div className="relative flex-1 max-w-md">
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/28"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                </svg>
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Procurar pedidos por nome, email, local ou ID"
                  placeholder="Procurar por nome, email, local, ID…  ( / )"
                  className="w-full bg-white border border-foreground/[0.09] rounded-xl pl-10 pr-3 py-2.5 text-sm text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-foreground/25 shadow-sm transition-colors"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setMineOnly((v) => !v)}
                  title={`Mostrar apenas pedidos atribuídos a ${userName}`}
                  className={`alvo-toque flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs border shadow-sm transition-all ${
                    mineOnly
                      ? "bg-[#4d6350] border-[#4d6350] text-white"
                      : "bg-white border-foreground/[0.09] text-foreground/45 hover:text-foreground/65"
                  }`}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                  Atribuídos a mim
                </button>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  aria-label="Filtrar por categoria"
                  className="bg-white border border-foreground/[0.09] rounded-xl px-3 py-2.5 text-xs text-foreground/70 focus:outline-none focus:border-foreground/25 shadow-sm"
                >
                  <option value="all">Todas as categorias</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <select
                  value={filterEspera}
                  onChange={(e) => setFilterEspera(e.target.value as typeof filterEspera)}
                  aria-label="Filtrar por tempo de espera"
                  className="bg-white border border-foreground/[0.09] rounded-xl px-3 py-2.5 text-xs text-foreground/70 focus:outline-none focus:border-foreground/25 shadow-sm"
                >
                  <option value="all">Qualquer espera</option>
                  <option value="3">Espera há 3+ dias</option>
                  <option value="7">Espera há 7+ dias</option>
                </select>
                {mesesDisponiveis.length > 1 && (
                  <select
                    value={filterMes}
                    onChange={(e) => setFilterMes(e.target.value)}
                    aria-label="Filtrar por mês do evento"
                    className="bg-white border border-foreground/[0.09] rounded-xl px-3 py-2.5 text-xs text-foreground/70 focus:outline-none focus:border-foreground/25 shadow-sm"
                  >
                    <option value="all">Todos os meses</option>
                    {mesesDisponiveis.map((m) => (
                      <option key={m} value={m}>
                        {mesLegivel(m)}
                      </option>
                    ))}
                  </select>
                )}
                {regioesDisponiveis.length > 1 && (
                  <select
                    value={filterRegiao}
                    onChange={(e) => setFilterRegiao(e.target.value)}
                    aria-label="Filtrar por região"
                    className="bg-white border border-foreground/[0.09] rounded-xl px-3 py-2.5 text-xs text-foreground/70 focus:outline-none focus:border-foreground/25 shadow-sm"
                  >
                    <option value="all">Todas as regiões</option>
                    {regioesDisponiveis.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                )}
                {plannersDisponiveis.length > 0 && (
                  <select
                    value={filterPlanner}
                    onChange={(e) => setFilterPlanner(e.target.value)}
                    aria-label="Filtrar por planner"
                    className="bg-white border border-foreground/[0.09] rounded-xl px-3 py-2.5 text-xs text-foreground/70 focus:outline-none focus:border-foreground/25 shadow-sm"
                  >
                    <option value="all">Todas as planners</option>
                    {plannersDisponiveis.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                  aria-label="Ordenar pedidos"
                  className="flex-1 lg:flex-none bg-white border border-foreground/[0.09] rounded-xl px-3 py-2.5 text-xs text-foreground/70 focus:outline-none focus:border-foreground/25 shadow-sm"
                >
                  <option value="espera">Quem espera há mais tempo</option>
                  <option value="recent">Mais recentes</option>
                  <option value="old">Mais antigos</option>
                  <option value="value">Maior valor</option>
                  <option value="followup">Seguimentos primeiro</option>
                  <option value="eventdate">Data do evento</option>
                </select>
                <button
                  onClick={() => {
                    downloadCsv(`pedidos-${dateStamp()}`, quotesToCsvRows(filtered));
                    toast(
                      `${filtered.length} pedido${filtered.length !== 1 ? "s" : ""} exportado${filtered.length !== 1 ? "s" : ""}`,
                      "success",
                    );
                  }}
                  // `alvo-toque`: 44 px no dedo sem mexer no aspeto com rato.
                  // Media 85x38 e passava despercebido porque, a 375 px, ficava
                  // fora da margem — os filtros novos mudaram a dobra da barra
                  // e trouxeram-no para dentro do ecrã, onde a régua o apanhou.
                  className="alvo-toque flex items-center gap-2 px-3 py-2.5 bg-white border border-foreground/[0.09] text-foreground/40 text-[10px] tracking-[0.12em] uppercase rounded-xl hover:text-foreground/65 transition-colors shadow-sm whitespace-nowrap"
                  title="Exportar a lista atual para CSV (Excel)"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path
                      d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Exportar
                </button>
              </div>
            </div>

            {/* Status filter */}
            <div className="flex flex-wrap gap-1.5 mb-8">
              {!showArchived && (
                <>
                  <button
                    onClick={() => setFilterStatus("all")}
                    className={`alvo-toque px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${filterStatus === "all" ? "bg-[#1b2119] text-white shadow-sm" : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07] hover:text-foreground/65"}`}
                  >
                    Todos · {statusCounts.activeTotal}
                  </button>
                  {STATUS_OPTIONS.map((s) => {
                    const count = statusCounts.counts[s.id] ?? 0;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setFilterStatus(s.id)}
                        className={`alvo-toque px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${filterStatus === s.id ? "bg-[#1b2119] text-white shadow-sm" : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07] hover:text-foreground/65"}`}
                      >
                        {s.label} · {count}
                      </button>
                    );
                  })}
                </>
              )}
              {archivedCount > 0 && (
                <button
                  onClick={() => {
                    setShowArchived((v) => !v);
                    setFilterStatus("all");
                  }}
                  className={`alvo-toque px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${showArchived ? "bg-[#1b2119] text-white shadow-sm" : "bg-foreground/[0.04] text-foreground/30 hover:bg-foreground/[0.07]"}`}
                >
                  Arquivados · {archivedCount}
                </button>
              )}
            </div>

            {/* Tag filter */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mb-8 -mt-4">
                <span className="text-foreground/30 text-[9px] tracking-[0.2em] uppercase mr-1">
                  Etiquetas
                </span>
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
                    className={`px-3 py-1 rounded-full text-[10px] font-medium tracking-wide transition-all duration-150 ${
                      tagFilter === t
                        ? "bg-[#4d6350] text-white shadow-sm"
                        : "bg-[#4d6350]/10 text-[#4d6350] hover:bg-[#4d6350]/18"
                    }`}
                  >
                    {t}
                  </button>
                ))}
                {tagFilter && (
                  <button
                    onClick={() => setTagFilter(null)}
                    className="text-foreground/35 text-[10px] hover:text-foreground/60 transition-colors ml-1"
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}

            {/* Bulk actions */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 mb-5 p-3 rounded-xl border border-[#4d6350]/25 bg-[#4d6350]/[0.06]">
                <span className="text-[#4d6350] text-xs font-semibold">
                  {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}
                </span>
                {selectedIds.size < filtered.length && (
                  <button
                    onClick={() => setSelectedIds(new Set(filtered.map((q) => q.id)))}
                    className="text-foreground/40 text-xs hover:text-[#4d6350] transition-colors"
                  >
                    Selecionar todos ({filtered.length})
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-foreground/35 text-[10px] tracking-[0.15em] uppercase">
                    Marcar como
                  </span>
                  <select
                    disabled={bulkBusy}
                    value=""
                    onChange={(e) => {
                      const v = e.target.value as QuoteStatus;
                      if (v) applyBulkStatus(v);
                    }}
                    aria-label="Marcar pedidos selecionados como"
                    className="bo-input px-2 py-1.5 text-xs text-foreground/70 disabled:opacity-50"
                  >
                    <option value="">{bulkBusy ? "A aplicar…" : "—"}</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() =>
                    downloadCsv(
                      `pedidos-selecao-${dateStamp()}`,
                      quotesToCsvRows(filtered.filter((q) => selectedIds.has(q.id))),
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-foreground/[0.12] text-foreground/45 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:text-[#4d6350] transition-colors shadow-sm"
                >
                  Exportar seleção
                </button>
                {(() => {
                  const emails = filtered
                    .filter((q) => selectedIds.has(q.id) && q.email)
                    .map((q) => q.email);
                  if (emails.length === 0) return null;
                  return (
                    <a
                      href={`mailto:?bcc=${encodeURIComponent(emails.join(","))}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-foreground/[0.12] text-foreground/45 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:text-[#4d6350] transition-colors shadow-sm"
                      title={`Compor email para ${emails.length} cliente(s) (em bcc)`}
                    >
                      Email ({emails.length})
                    </a>
                  );
                })()}
                {/* Hard delete for the whole selection — restrained terracotta,
                    always behind a single confirm; disabled while a batch runs. */}
                <button
                  onClick={deleteSelected}
                  disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#b5654a]/25 text-[#b5654a]/80 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:bg-[#b5654a]/10 hover:text-[#b5654a] transition-colors shadow-sm disabled:opacity-50"
                >
                  Apagar ({selectedIds.size})
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="ml-auto text-foreground/40 text-xs hover:text-foreground/70 transition-colors"
                >
                  Limpar
                </button>
              </div>
            )}

            {/* When a pedido is open, the list collapses to a slim rail and the
                detail takes over the remaining width as a spacious workspace.
                With nothing selected the list spreads full-width. */}
            <div
              className={`grid grid-cols-1 gap-8 ${
                selected ? "xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]" : "xl:grid-cols-1"
              }`}
            >
              {/* List */}
              <div className="flex min-w-0 flex-col gap-3">
                {filtered.length === 0 && (
                  <div className="bo-card">
                    <EmptyState
                      icon={
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        >
                          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                          <rect x="9" y="3" width="6" height="4" rx="1" />
                          <path d="M9 12h6M9 16h4" strokeLinecap="round" />
                        </svg>
                      }
                      title={
                        search.trim() || filterStatus !== "all"
                          ? "Nenhum pedido corresponde"
                          : "Sem pedidos ainda"
                      }
                      hint={
                        search.trim() || filterStatus !== "all"
                          ? "Limpe a pesquisa ou o filtro para ver todos os pedidos."
                          : "Os pedidos de orçamento do site aparecem aqui. Pode também criar um manualmente."
                      }
                      action={
                        search.trim() || filterStatus !== "all"
                          ? undefined
                          : { label: "+ Novo pedido", onClick: () => setNewQuoteOpen(true) }
                      }
                    />
                  </div>
                )}
                {visibleQuotes.length > 0 && (
                  <TabelaOuCartoes
                    itens={visibleQuotes}
                    chaveDe={(q) => q.id}
                    legenda="Pedidos"
                    // O cartão do telemóvel é o QuoteCard, que já foi desenhado
                    // e auditado ao toque — traz a sua própria moldura e o seu
                    // próprio botão, e não pode ser embrulhado noutro.
                    semMoldura
                    cartao={(q) => (
                      <QuoteCard
                        q={q}
                        isCurrent={selected?.id === q.id}
                        isSelected={selectedIds.has(q.id)}
                        todayStr={todayStr}
                        onOpen={openQuoteStable}
                        onToggle={toggleSelect}
                      />
                    )}
                    aoAbrir={openQuoteStable}
                    colunas={COLUNAS_DE_PEDIDOS({
                      selectedIds,
                      toggleSelect,
                      todayStr,
                      atual: selected?.id,
                    })}
                  />
                )}
                {filtered.length > visibleCount && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + LIST_PAGE_SIZE)}
                    className="w-full py-3.5 text-[11px] tracking-[0.2em] uppercase text-foreground/45 hover:text-foreground/70 bg-white border border-foreground/[0.08] rounded-xl hover:border-foreground/20 transition-colors"
                  >
                    Mostrar mais ({filtered.length - visibleCount} restante
                    {filtered.length - visibleCount !== 1 ? "s" : ""})
                  </button>
                )}
              </div>

              {/* Detail — in-grid sticky panel on desktop, slide-over drawer on mobile */}
              {selected ? (
                <>
                  <div className="fixed inset-0 z-40 bg-black/50 xl:hidden" onClick={closeDetail} />
                  <div
                    ref={drawerRef}
                    role={isDetailOverlay ? "dialog" : undefined}
                    aria-modal={isDetailOverlay ? true : undefined}
                    aria-labelledby={isDetailOverlay ? "detail-drawer-title" : undefined}
                    className="fixed xl:static inset-y-0 right-0 z-50 xl:z-auto w-full max-w-md sm:max-w-xl lg:max-w-3xl xl:max-w-none xl:w-auto bg-white border-l xl:border border-foreground/[0.08] xl:rounded-2xl xl:sticky xl:top-24 max-h-[100dvh] xl:max-h-[calc(100vh-7rem)] overflow-x-hidden overflow-y-auto overscroll-contain shadow-lg xl:shadow-[0_1px_2px_rgba(42,38,32,0.04)]"
                  >
                    <div className="sticky top-0 z-10 border-b border-foreground/[0.08] bg-white px-5 pt-5 sm:px-7">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2
                            id="detail-drawer-title"
                            ref={detailTitleRef}
                            tabIndex={-1}
                            title={selected.name}
                            /* line-clamp (not truncate): a global `h1,h2,h3 {
                               text-wrap: balance }` is unlayered and overrides
                               Tailwind's layered `truncate`, so a long name would
                               wrap to many lines and shove the content down.
                               Clamp to 2 lines with an ellipsis instead. */
                            className="line-clamp-2 break-words font-display text-xl leading-tight text-foreground/90 focus:outline-none sm:text-2xl"
                          >
                            {selected.name}
                          </h2>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                            {statusBadge(selected.status)}
                            <span
                              className="font-mono text-[10px] tracking-tight text-foreground/40"
                              title={selected.id}
                            >
                              Ref. {shortRef(selected.id)}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                          {/* Full-screen cockpit for this event — the one place that
                              unifies proposta/contrato/faturas/produção. Primary. */}
                          <Link
                            href={`/${lang}/orcamento/admin/evento/${selected.id}`}
                            className="alvo-toque h-9 gap-2 rounded-xl bg-[#4d6350]/10 px-3.5 text-xs font-medium tracking-[0.02em] text-[#4d6350] motion-safe:transition-colors hover:bg-[#4d6350]/[0.16] inline-flex items-center"
                            title="Abrir o Dossier do evento (vista completa: ciclo de vida, financeiro, produção)"
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              aria-hidden="true"
                            >
                              <rect x="3" y="3" width="7" height="9" rx="1" />
                              <rect x="14" y="3" width="7" height="5" rx="1" />
                              <rect x="14" y="12" width="7" height="9" rx="1" />
                              <rect x="3" y="16" width="7" height="5" rx="1" />
                            </svg>
                            <span className="hidden sm:inline">Dossier</span>
                          </Link>
                          {/* Every secondary / destructive / print action tucked into
                              one calm overflow menu so the header stays uncluttered. */}
                          <MoreMenu
                            items={[
                              {
                                label: "Duplicar pedido",
                                hint: "Clonar para um cliente recorrente",
                                onClick: () => duplicateQuote(selected),
                                icon: (
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    aria-hidden="true"
                                  >
                                    <rect x="9" y="9" width="11" height="11" rx="2" />
                                    <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
                                  </svg>
                                ),
                              },
                              {
                                label: selected.archived ? "Restaurar pedido" : "Arquivar pedido",
                                hint: selected.archived
                                  ? "Voltar a mostrar na lista principal"
                                  : "Ocultar da lista principal (reversível)",
                                onClick: async () => {
                                  const next = !selected.archived;
                                  const confirm_ =
                                    !next ||
                                    window.confirm(
                                      `Arquivar "${selected.name}"? Ficará oculto da lista principal.`,
                                    );
                                  if (!confirm_) return;
                                  const res = await fetch(`/api/orcamento/${selected.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ archived: next }),
                                  });
                                  if (res.ok) {
                                    const updated = await res.json();
                                    setQuotes((prev) =>
                                      prev.map((q) => (q.id === updated.id ? updated : q)),
                                    );
                                    setSelected(updated);
                                    toast(
                                      next ? "Pedido arquivado" : "Pedido restaurado",
                                      "success",
                                    );
                                  }
                                },
                                icon: (
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M21 8v13H3V8M23 3H1v5h22V3zM10 12h4" />
                                  </svg>
                                ),
                              },
                              {
                                label: "Guião do dia",
                                hint: "Imprimir a folha de operações",
                                onClick: () => printRunSheet(selected),
                                icon: (
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    aria-hidden="true"
                                  >
                                    <path
                                      d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                    <rect x="6" y="14" width="12" height="7" rx="1" />
                                  </svg>
                                ),
                              },
                              {
                                label: "Dossier PDF",
                                hint: "Imprimir o dossier completo do evento",
                                onClick: () => printEventDossier(selected),
                                icon: (
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    aria-hidden="true"
                                  >
                                    <path
                                      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                    <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" strokeLinecap="round" />
                                  </svg>
                                ),
                              },
                              ...(selected.date
                                ? [
                                    {
                                      label: "Adicionar ao calendário",
                                      hint: "Descarregar .ics (Google/Apple/Outlook)",
                                      onClick: () => downloadEventIcs(selected),
                                      icon: (
                                        <svg
                                          width="16"
                                          height="16"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="1.7"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          aria-hidden="true"
                                        >
                                          <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                                          <path d="M12 13v5M9.5 15.5 12 18l2.5-2.5" />
                                        </svg>
                                      ),
                                    },
                                  ]
                                : []),
                              {
                                label: "Apagar pedido",
                                hint: "Ação definitiva — não pode ser anulada",
                                onClick: async () => {
                                  if (
                                    !window.confirm(
                                      "Apagar definitivamente este pedido? Esta ação não pode ser anulada.",
                                    )
                                  )
                                    return;
                                  try {
                                    const res = await fetch(`/api/orcamento/${selected.id}`, {
                                      method: "DELETE",
                                    });
                                    if (!res.ok) throw new Error("delete failed");
                                    setQuotes((prev) => prev.filter((q) => q.id !== selected.id));
                                    setSelected(null);
                                    toast("Pedido apagado", "success");
                                  } catch {
                                    toast("Não foi possível apagar o pedido", "error");
                                  }
                                },
                                icon: (
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
                                  </svg>
                                ),
                              },
                            ]}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={closeDetail}
                            aria-label="Fechar"
                            className="px-2 pointer-coarse:min-w-11"
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              aria-hidden="true"
                            >
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Tudo à vista: ciclo de vida, próxima ação, o formulário de
                        gestão sempre presente e as ferramentas em separadores logo
                        abaixo — nada fica escondido atrás de revelações. */}
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-5 py-6 sm:px-7 sm:py-8">
                      {/* Ciclo de vida — em que fase está o pedido, num relance. */}
                      <LifecycleStepper quote={selected} />

                      {/* Próxima ação — o único passo seguinte, em destaque. Abre a
                          ferramenta certa dentro da área avançada. */}
                      {(() => {
                        const na = detailNextAction(selected);
                        const reopen = deriveRequestLifecycle(selected).perdido;
                        return (
                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                if (reopen) setEditStatus("em_revisao");
                                if (na.tab === "gestao") {
                                  // O próximo passo é uma edição no formulário —
                                  // levar o utilizador até lá.
                                  gestaoRef.current?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "start",
                                  });
                                } else {
                                  setDetailTab(na.tab);
                                  toolsRef.current?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "start",
                                  });
                                }
                              }}
                              className="flex w-full items-center gap-3 rounded-2xl bg-[#4d6350] px-5 py-4 text-left text-white shadow-sm motion-safe:transition-colors hover:bg-[#415440]"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-[9px] uppercase tracking-[0.2em] text-white/60">
                                  Próxima ação
                                </span>
                                <span className="mt-0.5 block text-sm font-semibold">
                                  {na.label}
                                </span>
                                <span className="mt-0.5 block text-xs text-white/70">
                                  {na.hint}
                                </span>
                              </span>
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                className="shrink-0 text-white/80"
                              >
                                <path d="M5 12h14M13 6l6 6-6 6" />
                              </svg>
                            </button>
                          </div>
                        );
                      })()}

                      {/* ── Gestão do pedido — o formulário de trabalho, SEMPRE
                          visível (nada escondido atrás de "Mostrar mais"). ── */}
                      <div ref={gestaoRef} className="scroll-mt-24">
                        <SectionCard eyebrow="Gestão do pedido" padding="md">
                          <div className="flex flex-col gap-5">
                            {/* Factos do evento — contexto compacto, só leitura. */}
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-foreground/55">
                              {[
                                {
                                  l: "Tipo",
                                  v: CATEGORIES.find((c) => c.id === selected.category)?.label,
                                },
                                {
                                  l: "Sub-tipo",
                                  v:
                                    selected.category && selected.eventType
                                      ? EVENT_TYPES_BY_CATEGORY[selected.category]?.find(
                                          (e) => e.id === selected.eventType,
                                        )?.label
                                      : null,
                                },
                                {
                                  l: "Pacote",
                                  v: PACKAGES.find((p) => p.id === selected.packageTier)?.label,
                                },
                                {
                                  l: "Duração",
                                  v: selected.duration ? `${selected.duration}h` : null,
                                },
                                {
                                  l: "Extras",
                                  v: selected.addons?.length
                                    ? `${selected.addons.length} serviços`
                                    : null,
                                },
                                {
                                  // Sem número exacto, a ordem de grandeza. Um
                                  // pedido a dizer só "por definir" não deixa
                                  // decidir nada; "~ 100 a 150" deixa.
                                  l: "Convidados",
                                  v: selected.guests
                                    ? null
                                    : guestRangeLabel(selected.guestsRange)
                                      ? `~ ${guestRangeLabel(selected.guestsRange)}`
                                      : null,
                                },
                                {
                                  // O que o casal marcou no pedido. Aparece
                                  // aqui em cima, com a data e o local, porque
                                  // é o que decide o desenho da proposta e não
                                  // se pode ficar a saber só ao abri-la.
                                  l: "Decoração",
                                  v:
                                    rotularPontos(selected.decorPoints ?? [], "pt").join(" · ") ||
                                    null,
                                },
                              ]
                                .filter((f) => f.v)
                                .map(({ l, v }) => (
                                  <span key={l}>
                                    <span className="uppercase tracking-wide text-foreground/40 text-[9px] mr-1">
                                      {l}
                                    </span>
                                    {v}
                                  </span>
                                ))}
                            </div>

                            {/* Campos editáveis — tudo em grelha, à mão. */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div>
                                <label className="bo-eyebrow block mb-1.5">Estado</label>
                                <select
                                  value={editStatus}
                                  onChange={(e) => setEditStatus(e.target.value as QuoteStatus)}
                                  className="bo-input px-3 py-2 text-sm text-foreground/80 w-full"
                                >
                                  {STATUS_OPTIONS.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="bo-eyebrow block mb-1.5">
                                  Preço final (sem IVA) €
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={editPrice}
                                  onChange={(e) => setEditPrice(e.target.value)}
                                  placeholder="Ex.: 12500"
                                  className="bo-input px-3 py-2 text-sm text-foreground/80 w-full"
                                />
                                {(() => {
                                  const revenue =
                                    parsePriceInput(editPrice) ??
                                    selected.quotedPrice ??
                                    selected.priceBreakdown?.total ??
                                    0;
                                  const costs = (selected.eventSuppliers ?? []).reduce(
                                    (s, e) => s + (e.actualCost ?? e.estimatedCost ?? 0),
                                    0,
                                  );
                                  if (!costs) return null;
                                  const margin = revenue - costs;
                                  return (
                                    <p className="mt-1 text-[10px] text-foreground/45">
                                      Custos {formatPrice(costs)} · Margem{" "}
                                      <span
                                        className={
                                          margin >= 0 ? "text-[#4d6350]" : "text-[#b5654a]"
                                        }
                                      >
                                        {formatPrice(margin)}
                                      </span>
                                    </p>
                                  );
                                })()}
                              </div>
                              <div>
                                <label className="bo-eyebrow block mb-1.5">Data do evento</label>
                                <input
                                  type="date"
                                  value={editDate}
                                  onChange={(e) => setEditDate(e.target.value)}
                                  className="bo-input px-3 py-2 text-sm text-foreground/80 w-full"
                                />
                                {editDate &&
                                  (() => {
                                    const cd = eventCountdown(editDate);
                                    return cd ? (
                                      <p
                                        className={`mt-1 text-[10px] ${cd.tone === "soon" || cd.tone === "today" ? "text-[#b5654a]" : "text-foreground/40"}`}
                                      >
                                        {cd.label}
                                      </p>
                                    ) : null;
                                  })()}
                              </div>
                              <div>
                                <label className="bo-eyebrow block mb-1.5">Convidados</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={editGuests}
                                  onChange={(e) => setEditGuests(e.target.value)}
                                  className="bo-input px-3 py-2 text-sm text-foreground/80 w-full"
                                />
                              </div>
                              <div>
                                <label className="bo-eyebrow block mb-1.5">Responsável</label>
                                <input
                                  type="text"
                                  value={editAssigned}
                                  onChange={(e) => setEditAssigned(e.target.value)}
                                  placeholder="Nome do membro da equipa…"
                                  className="bo-input px-3 py-2 text-sm text-foreground/80 w-full"
                                />
                              </div>
                              <div>
                                <label className="bo-eyebrow block mb-1.5">Local</label>
                                <input
                                  value={editLocation}
                                  onChange={(e) => setEditLocation(e.target.value)}
                                  placeholder="Local do evento…"
                                  className="bo-input px-3 py-2 text-sm text-foreground/80 w-full"
                                />
                              </div>
                            </div>

                            {/* Etiquetas + seguimento — gravam sozinhos. */}
                            <div className="grid grid-cols-1 gap-4 border-t border-foreground/[0.06] pt-4 sm:grid-cols-2">
                              <TagsField
                                key={`tags-${selected.id}`}
                                quote={selected}
                                suggestions={allTags}
                                onChange={(tags) => {
                                  setQuotes((prev) =>
                                    prev.map((q) => (q.id === selected.id ? { ...q, tags } : q)),
                                  );
                                  setSelected((prev) => (prev ? { ...prev, tags } : prev));
                                }}
                              />
                              <FollowUpField
                                key={`fu-${selected.id}`}
                                quote={selected}
                                onChange={(followUpAt) => {
                                  setQuotes((prev) =>
                                    prev.map((q) =>
                                      q.id === selected.id ? { ...q, followUpAt } : q,
                                    ),
                                  );
                                  setSelected((prev) => (prev ? { ...prev, followUpAt } : prev));
                                }}
                              />
                            </div>

                            {editStatus === "rejeitado" && (
                              <div>
                                <label className="bo-eyebrow block mb-1.5">Motivo de perda</label>
                                <textarea
                                  rows={2}
                                  value={editLostReason}
                                  onChange={(e) => setEditLostReason(e.target.value)}
                                  placeholder="Ex.: Orçamento acima do esperado, escolheram outro fornecedor…"
                                  className="bo-input px-3 py-2 text-sm text-foreground/80 resize-none w-full"
                                />
                              </div>
                            )}
                            {selected.status === "rejeitado" &&
                              selected.lostReason &&
                              editStatus !== "rejeitado" && (
                                <div className="rounded-lg border border-foreground/[0.07] bg-foreground/[0.04] px-3 py-2">
                                  <p className="mb-1 text-[9px] uppercase tracking-[0.2em] text-foreground/60">
                                    Motivo de perda anterior
                                  </p>
                                  <p className="text-xs text-foreground/72">
                                    {selected.lostReason}
                                  </p>
                                </div>
                              )}

                            <div>
                              <label className="bo-eyebrow block mb-1.5">Notas internas</label>
                              <textarea
                                rows={3}
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                placeholder="Notas internas sobre este pedido…"
                                className="bo-input px-3 py-2 text-sm text-foreground/80 resize-none w-full"
                              />
                            </div>

                            {/* Estimativa calculada — contexto para definir o preço. */}
                            {selected.priceBreakdown && (
                              <div className="rounded-lg bg-foreground/[0.04] p-3 flex flex-col gap-1.5">
                                <p className="text-[9px] uppercase tracking-[0.2em] text-foreground/50">
                                  Estimativa calculada
                                </p>
                                {selected.priceBreakdown.addonsCost > 0 && (
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-foreground/60">Extras</span>
                                    <span className="text-foreground/72">
                                      {formatPrice(selected.priceBreakdown.addonsCost)}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-foreground/60">Subtotal</span>
                                  <span className="text-foreground/72">
                                    {formatPrice(selected.priceBreakdown.subtotal)}
                                  </span>
                                </div>
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-foreground/60">IVA 23%</span>
                                  <span className="text-foreground/72">
                                    {formatPrice(selected.priceBreakdown.iva)}
                                  </span>
                                </div>
                                <div className="flex justify-between border-t border-foreground/8 pt-1 text-xs font-medium">
                                  <span className="text-foreground/60">Total</span>
                                  <span className="font-semibold text-[#4d6350]">
                                    {formatPrice(selected.priceBreakdown.total)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </SectionCard>
                      </div>

                      {/* Contacto — como falar com o cliente. */}
                      <SectionCard eyebrow="Contacto" padding="sm">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <a
                              href={`mailto:${selected.email}`}
                              className="alvo-toque !justify-start truncate text-xs text-[#4d6350] hover:underline"
                            >
                              {selected.email}
                            </a>
                            <button
                              onClick={() => {
                                navigator.clipboard?.writeText(selected.email);
                                toast("Email copiado", "success");
                              }}
                              className="alvo-toque shrink-0 text-foreground/25 transition-colors hover:text-foreground/55"
                              title="Copiar email"
                              aria-label="Copiar email"
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              >
                                <rect x="9" y="9" width="11" height="11" rx="2" />
                                <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={`tel:${selected.phone}`}
                              className="alvo-toque text-xs text-foreground/70 hover:text-foreground/90"
                            >
                              {selected.phone}
                            </a>
                            {selected.phone && (
                              <a
                                href={`https://wa.me/${selected.phone.replace(/[^\d]/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="alvo-toque shrink-0 gap-1 text-[10px] uppercase tracking-[0.08em] text-[#4d6350] transition-opacity hover:opacity-80 inline-flex items-center"
                                title="Abrir conversa no WhatsApp"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-.96.24-3.23-.67-2.73-1.08-4.46-3.86-4.6-4.04-.13-.18-1.1-1.46-1.1-2.79 0-1.33.7-1.98.95-2.25.24-.27.53-.34.7-.34.18 0 .35 0 .5.01.16.01.38-.06.6.46.23.54.77 1.87.84 2 .07.14.11.3.02.48-.09.18-.13.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.54.15.27.67 1.1 1.44 1.78.99.88 1.82 1.16 2.08 1.29.27.13.42.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.25.09 1.58.75 1.85.88.27.13.45.2.52.31.07.11.07.64-.17 1.32Z" />
                                </svg>
                                WhatsApp
                              </a>
                            )}
                          </div>
                          {selected.company && (
                            <p className="text-xs text-foreground/70">{selected.company}</p>
                          )}
                          {selected.nif && (
                            <p className="text-xs text-foreground/70">NIF: {selected.nif}</p>
                          )}
                        </div>
                      </SectionCard>

                      {/* Notas do cliente — contexto imediato, se existirem. */}
                      {selected.notes && (
                        <div>
                          <p className="bo-eyebrow mb-2">Notas do Cliente</p>
                          <p className="rounded-lg bg-foreground/[0.04] p-3 text-xs leading-relaxed text-foreground/72">
                            {selected.notes}
                          </p>
                        </div>
                      )}

                      <p className="text-[10px] text-foreground/50">
                        Submetido em{" "}
                        {new Date(selected.submittedAt).toLocaleString("pt-PT", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>

                      {/* ── Ferramentas — sempre visíveis, organizadas em três
                          separadores (a gestão já está acima, sempre presente). */}
                      <div
                        id="detail-tools"
                        ref={toolsRef}
                        className="flex scroll-mt-24 flex-col gap-7 border-t border-foreground/[0.08] pt-8"
                      >
                        {/* Section header — the command centre of the pedido. */}
                        <div className="flex flex-col gap-1.5">
                          <p className="bo-eyebrow">Ferramentas do pedido</p>
                          <p className="text-xs leading-relaxed text-foreground/55">
                            Tudo o que precisa para preparar, cobrar e propor — num só lugar.
                          </p>
                        </div>

                        {/* Section tabs as cards — Arrow keys move between tabs
                            (WAI-ARIA tablist pattern). Each card carries the tab's
                            plain-language hint plus its live counter as a pill. */}
                        <div
                          role="tablist"
                          aria-label="Secções do pedido"
                          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                        >
                          {DETAIL_TABS.map((tab, i, arr) => {
                            const active = detailTab === tab.id;
                            // Contador por cartão: "N por fazer" (checklist) na
                            // Produção e "falta €X" no Financeiro — visão imediata
                            // sem abrir cada separador.
                            let badge: string | null = null;
                            if (tab.id === "producao") {
                              const todo = (selected.checklist ?? []).filter((c) => !c.done).length;
                              badge = todo > 0 ? `${todo} por fazer` : null;
                            } else if (tab.id === "financeiro") {
                              const gross = contractedAmounts(selected).gross;
                              const paid = (selected.payments ?? []).reduce(
                                (s, p) => s + (p.paid ? p.amount : 0),
                                0,
                              );
                              const out = Math.max(0, gross - paid);
                              badge = out > 0 ? `falta ${eur(out)}` : null;
                            }
                            return (
                              <button
                                key={tab.id}
                                id={`detail-tab-${tab.id}`}
                                role="tab"
                                aria-selected={active}
                                aria-controls={`detail-panel-${tab.id}`}
                                tabIndex={active ? 0 : -1}
                                onClick={() => setDetailTab(tab.id)}
                                onKeyDown={(e) => {
                                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                                  e.preventDefault();
                                  const dir = e.key === "ArrowRight" ? 1 : -1;
                                  const nextIdx = (i + dir + arr.length) % arr.length;
                                  setDetailTab(arr[nextIdx].id);
                                  const tabs =
                                    e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                                      '[role="tab"]',
                                    );
                                  tabs?.[nextIdx]?.focus();
                                }}
                                className={`flex min-w-0 flex-col items-start gap-3 rounded-2xl border p-4 text-left motion-safe:transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d6350]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                                  active
                                    ? "border-[#4d6350]/45 bg-[#4d6350]/[0.05] shadow-[0_2px_12px_rgba(77,99,80,0.10)]"
                                    : "border-foreground/[0.08] bg-foreground/[0.02] hover:-translate-y-0.5 hover:border-foreground/[0.14] hover:bg-foreground/[0.03] hover:shadow-sm"
                                }`}
                              >
                                <span
                                  aria-hidden
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl motion-safe:transition-colors ${
                                    active
                                      ? "bg-[#4d6350]/[0.12] text-[#4d6350]"
                                      : "bg-foreground/[0.05] text-foreground/55"
                                  }`}
                                >
                                  {tab.icon}
                                </span>
                                <span className="flex min-w-0 flex-col gap-1">
                                  <span
                                    className={`text-xs font-semibold uppercase tracking-[0.08em] ${
                                      active ? "text-foreground/85" : "text-foreground/70"
                                    }`}
                                  >
                                    {tab.label}
                                  </span>
                                  <span className="text-[11px] leading-relaxed text-foreground/50">
                                    {tab.hint}
                                  </span>
                                </span>
                                {badge && (
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold leading-none tracking-[0.04em] tabular-nums ${
                                      active
                                        ? "bg-[#4d6350]/15 text-[#4d6350]"
                                        : "bg-foreground/[0.07] text-foreground/55"
                                    }`}
                                  >
                                    {badge}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Coluna única — as ferramentas do separador ativo */}
                        <div className="flex min-w-0 flex-col gap-6">
                          {/* Keep-alive: os três painéis ficam sempre montados e só
                              escondidos (`hidden`), para nunca se perder trabalho a
                              meio (mensagem por enviar, proposta em edição) ao trocar
                              de separador. */}
                          <div
                            role="tabpanel"
                            id="detail-panel-producao"
                            aria-labelledby="detail-tab-producao"
                            tabIndex={0}
                            hidden={detailTab !== "producao"}
                            className="flex flex-col gap-6 focus:outline-none"
                          >
                            {/* Preparação — the daily driver (tarefas + checklist),
                                  always open and first. */}
                            <p className="bo-eyebrow text-foreground/45">Preparação</p>

                            {/* Tasks linked to this event */}
                            <EventTasks
                              key={`tasks-${selected.id}`}
                              quote={selected}
                              userName={userName}
                            />

                            {/* Production checklist */}
                            <EventChecklist
                              key={`cl-${selected.id}`}
                              quote={selected}
                              onChange={(checklist) => {
                                setQuotes((prev) =>
                                  prev.map((q) => (q.id === selected.id ? { ...q, checklist } : q)),
                                );
                                setSelected((prev) => (prev ? { ...prev, checklist } : prev));
                              }}
                            />

                            {/* Material que vai na carrinha */}
                            <EventMaterial key={`mat-${selected.id}`} quote={selected} />

                            {/* Plano &amp; dia do evento — occasional tools, collapsed so
                                  the tab opens short. Native <details> keeps every child
                                  mounted (hidden via CSS), so fetch/PATCH lifecycles are
                                  untouched. */}
                            <details className="group border-t border-foreground/10 pt-4">
                              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-foreground/55 marker:content-none [&::-webkit-details-marker]:hidden hover:text-foreground/80">
                                <svg
                                  className="shrink-0 text-foreground/40 transition-transform group-open:rotate-90"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                >
                                  <path
                                    d="m9 6 6 6-6 6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                Plano de decoração, cronograma e convidados
                              </summary>
                              <div className="flex flex-col gap-6 pt-6">
                                {/* Decor production plan (sourcing → strike) */}
                                <ProductionPlan
                                  key={`prod-${selected.id}`}
                                  quote={selected}
                                  onChange={(productionPlan) => {
                                    setQuotes((prev) =>
                                      prev.map((q) =>
                                        q.id === selected.id ? { ...q, productionPlan } : q,
                                      ),
                                    );
                                    setSelected((prev) =>
                                      prev ? { ...prev, productionPlan } : prev,
                                    );
                                  }}
                                />

                                {/* Day-of run sheet */}
                                <EventTimeline
                                  key={`tl-${selected.id}`}
                                  quote={selected}
                                  onChange={(timeline) => {
                                    setQuotes((prev) =>
                                      prev.map((q) =>
                                        q.id === selected.id ? { ...q, timeline } : q,
                                      ),
                                    );
                                    setSelected((prev) => (prev ? { ...prev, timeline } : prev));
                                  }}
                                />

                                {/* Guest list / RSVP */}
                                <GuestList
                                  key={`guests-${selected.id}`}
                                  quote={selected}
                                  onChange={(guestList) => {
                                    setQuotes((prev) =>
                                      prev.map((q) =>
                                        q.id === selected.id ? { ...q, guestList } : q,
                                      ),
                                    );
                                    setSelected((prev) => (prev ? { ...prev, guestList } : prev));
                                  }}
                                />
                              </div>
                            </details>
                          </div>

                          <div
                            role="tabpanel"
                            id="detail-panel-financeiro"
                            aria-labelledby="detail-tab-financeiro"
                            tabIndex={0}
                            hidden={detailTab !== "financeiro"}
                            className="flex flex-col gap-6 focus:outline-none"
                          >
                            {/* Cobrança — payments first (the key action), costs
                                  below. Eyebrow mirrors the other two panels. */}
                            <p className="bo-eyebrow text-foreground/45">Pagamentos e faturação</p>

                            {/* Payments & invoicing */}
                            <PaymentsPanel
                              key={`pay-${selected.id}`}
                              quote={selected}
                              showLedger
                              onChange={(payments) => {
                                setQuotes((prev) =>
                                  prev.map((q) => (q.id === selected.id ? { ...q, payments } : q)),
                                );
                                setSelected((prev) => (prev ? { ...prev, payments } : prev));
                              }}
                              onContractRef={(ref) => {
                                const contractRef = ref || undefined;
                                setQuotes((prev) =>
                                  prev.map((q) =>
                                    q.id === selected.id ? { ...q, contractRef } : q,
                                  ),
                                );
                                setSelected((prev) => (prev ? { ...prev, contractRef } : prev));
                              }}
                            />

                            {/* Suppliers booked for this event + budget vs actual cost */}
                            <EventCosts
                              key={`costs-${selected.id}`}
                              quote={selected}
                              onChange={(eventSuppliers) => {
                                setQuotes((prev) =>
                                  prev.map((q) =>
                                    q.id === selected.id ? { ...q, eventSuppliers } : q,
                                  ),
                                );
                                setSelected((prev) => (prev ? { ...prev, eventSuppliers } : prev));
                              }}
                            />
                          </div>

                          <div
                            role="tabpanel"
                            id="detail-panel-comunicacao"
                            aria-labelledby="detail-tab-comunicacao"
                            tabIndex={0}
                            hidden={detailTab !== "comunicacao"}
                            className="flex flex-col gap-6 focus:outline-none"
                          >
                            {/* Step 1 — the proposal. One tool at a time: the detailed
                                  Studio by default, or the quick price-table Builder —
                                  never both stacked on screen. The mode is an explicit,
                                  calm segmented choice so a newcomer sees both exist. */}
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="bo-eyebrow text-foreground/45">1 · A proposta</p>
                              <Segmented
                                ariaLabel="Tipo de proposta"
                                size="sm"
                                value={showBuilder ? "rapida" : "detalhada"}
                                onChange={(v) => setShowBuilder(v === "rapida")}
                                options={[
                                  { value: "detalhada", label: "Detalhada" },
                                  { value: "rapida", label: "Rápida" },
                                ]}
                              />
                            </div>
                            <p className="-mt-3 text-xs leading-relaxed text-foreground/45">
                              {showBuilder
                                ? "Rápida — uma tabela de preços simples, sem imagens nem PDF."
                                : "Detalhada — proposta completa em PDF, com capa, serviços e imagens."}
                            </p>
                            {!showBuilder ? (
                              <>
                                <ProposalStudio
                                  key={`studio-${selected.id}`}
                                  quote={selected}
                                  quotes={activeQuotes}
                                  // O valor é um só: o estúdio grava-o no
                                  // pedido, e o "Preço final" aqui ao lado tem
                                  // de mostrar o mesmo número sem ser preciso
                                  // recarregar nada.
                                  onQuoteUpdated={(q) => {
                                    setQuotes((prev) => prev.map((x) => (x.id === q.id ? q : x)));
                                    setSelected((prev) => (prev?.id === q.id ? q : prev));
                                    setEditPrice(q.quotedPrice ? String(q.quotedPrice) : "");
                                  }}
                                  onSent={() => {
                                    setQuotes((prev) =>
                                      prev.map((q) =>
                                        q.id === selected.id ? { ...q, status: "cotado" } : q,
                                      ),
                                    );
                                    setSelected((prev) =>
                                      prev ? { ...prev, status: "cotado" } : prev,
                                    );
                                    setEditStatus("cotado");
                                    appendActivity(selected.id, [
                                      {
                                        id: randomId(),
                                        at: new Date().toISOString(),
                                        kind: "proposal_sent",
                                        actor: userName,
                                        summary: "Proposta enviada ao cliente (Studio)",
                                      },
                                    ]);
                                  }}
                                />
                              </>
                            ) : (
                              <>
                                <ProposalBuilder
                                  quote={selected}
                                  onSent={(total) => {
                                    setQuotes((prev) =>
                                      prev.map((q) =>
                                        q.id === selected.id
                                          ? { ...q, status: "cotado", quotedPrice: total }
                                          : q,
                                      ),
                                    );
                                    setSelected((prev) =>
                                      prev
                                        ? { ...prev, status: "cotado", quotedPrice: total }
                                        : prev,
                                    );
                                    setEditStatus("cotado");
                                    appendActivity(selected.id, [
                                      {
                                        id: randomId(),
                                        at: new Date().toISOString(),
                                        kind: "proposal_sent",
                                        actor: userName,
                                        summary: `Proposta enviada — ${eur(total)}`,
                                      },
                                    ]);
                                  }}
                                />
                              </>
                            )}

                            {/* Step 2 — talk to the client. */}
                            <p className="bo-eyebrow border-t border-foreground/10 pt-6 text-foreground/45">
                              2 · Falar com o cliente
                            </p>
                            <ClientMessenger
                              key={selected.id}
                              quote={selected}
                              onSent={(messages) => {
                                const prev_count = selected.messages?.length ?? 0;
                                setQuotes((prev) =>
                                  prev.map((q) => (q.id === selected.id ? { ...q, messages } : q)),
                                );
                                setSelected((prev) => (prev ? { ...prev, messages } : prev));
                                if (messages.length > prev_count) {
                                  appendActivity(selected.id, [
                                    {
                                      id: randomId(),
                                      at: new Date().toISOString(),
                                      kind: "message_sent",
                                      actor: userName,
                                      summary: "Mensagem enviada ao cliente",
                                    },
                                  ]);
                                }
                              }}
                            />

                            {/* Activity history — de-emphasised, collapsed by default. */}
                            <details className="group border-t border-foreground/10 pt-4">
                              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-foreground/55 marker:content-none [&::-webkit-details-marker]:hidden hover:text-foreground/80">
                                <svg
                                  className="shrink-0 text-foreground/40 transition-transform group-open:rotate-90"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                >
                                  <path
                                    d="m9 6 6 6-6 6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                Histórico de atividade
                              </summary>
                              <div className="pt-6">
                                <ActivityLog
                                  quote={selected}
                                  actor={userName}
                                  onAddEntry={(entry) => appendActivity(selected.id, [entry])}
                                />
                              </div>
                            </details>
                          </div>
                        </div>
                      </div>

                      {/* ── Barra de gravação fixa — aparece SEMPRE que há
                          alterações por guardar, seja qual for a secção onde o
                          utilizador está. Nunca mais um "guardar" escondido. */}
                      {isDirty && (
                        <div className="sticky bottom-0 z-10 -mx-5 -mb-6 border-t border-foreground/[0.08] bg-white px-5 py-3 sm:-mx-7 sm:-mb-8 sm:px-7">
                          <div className="flex items-center justify-between gap-3">
                            <p
                              role="status"
                              className="flex items-center gap-1.5 text-[11px] tracking-wide text-gold-text"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-gold/80" />
                              Alterações por guardar
                            </p>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={saveChanges}
                              loading={saving}
                            >
                              {saving ? "A guardar…" : "Guardar alterações"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
