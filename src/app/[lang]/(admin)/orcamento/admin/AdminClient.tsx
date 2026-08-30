"use client";

import { resumoDoEnvio } from "./envio-da-mensagem";

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
import { localeDoCaminho, localizeHref } from "@/lib/i18n/config";
import { dataCurta } from "@/lib/data-curta";
import { razaoDaRecusa, porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import type { LeituraFalhada } from "@/lib/porque-nao-leu";
import type { Quote, QuoteSummary, QuoteStatus, ActivityEntry } from "@/lib/orcamento/types";
import type { RecentQuote } from "./CommandPalette";
import { AvisoDeArmazenamento } from "./AvisoDeArmazenamento";
import { formatPrice } from "@/lib/orcamento/pricing";
import { contractedAmounts, effectiveVatRate } from "@/lib/orcamento/dossier";
import { round2 } from "@/lib/money";
import { lerNumero } from "@/lib/numero-escrito";
import { porqueRecusou } from "@/lib/erro-do-servidor";
import {
  esquecerRascunho,
  fraseDoQueMudou,
  guardarRascunho,
  haQuantoTempo,
  lerRascunho,
  oQueMudou,
  type CamposDoPedido,
} from "./rascunho-do-pedido";
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
import { faltaODesfecho } from "@/lib/orcamento/desfecho";
import PerguntaDeDesfecho from "./PerguntaDeDesfecho";
import PainelGeracaoAoGanhar from "./PainelGeracaoAoGanhar";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from "@/lib/orcamento/data";
import { rotularPontos } from "@/lib/orcamento/decoracao";
import { guestRangeLabel, ceremonyTypeLabel, spaceTypeLabel } from "@/lib/orcamento/data";
import { useToast } from "./Toast";
import CommandPalette, { type Command } from "./CommandPalette";
import ShortcutsModal from "./ShortcutsModal";
import AjudaGlossario from "./AjudaGlossario";
import NewQuoteModal from "./NewQuoteModal";
import RestoreDialog from "./RestoreDialog";
import PasskeysDialog from "./PasskeysDialog";
import SessaoExpirada from "./SessaoExpirada";
import NotificationBell from "./NotificationBell";
import NotaDaProposta from "./NotaDaProposta";
import {
  downloadCsv,
  quotesToCsvRows,
  dateStamp,
  printRunSheet,
  printEventDossier,
  downloadEventIcs,
} from "./export";
import { prefetchList } from "./useCachedList";
import {
  useGravacaoAutomatica,
  useTravaoDeSaida,
  fetchComTecto,
  enviarComRepeticao,
  respostaDeHttp,
  type RespostaDoEnvio,
} from "./useGravacaoAutomatica";
import { useInscricaoNoRegisto, type ResultadoDoEcra } from "./registo-de-gravacoes";
import BotaoGuardarTudo from "./GuardarTudo";
import { onIdle } from "@/lib/onIdle";
import { marcarSaidaDeProposito } from "./entrada-destino";
import { eventCountdown, parseMoney, randomId, eur, todayKey } from "./util";
import { useFocusTrap } from "./useFocusTrap";
import { useCamadaDeHistoria } from "./useCamadaDeHistoria";
import { useTrincoDeScroll } from "./useTrincoDeScroll";
import EmptyState from "./EmptyState";
import LifecycleStepper, { deriveRequestLifecycle } from "./LifecycleStepper";
import { NAV, CORE_NAV, MORE_NAV, BARRA_INFERIOR, vistaValida, type View } from "./nav";
import { useDesceu } from "./ui/adaptativo";
import {
  Button,
  EmCurso,
  PerguntaDestrutiva,
  SectionCard,
  Segmented,
  TabelaOuCartoes,
  type Coluna,
} from "./ui";
import { MoreMenu } from "./MoreMenu";
import { varrerDerivadasEmFundo } from "./varrer-derivadas";
import {
  faltaADataDoEvento,
  AVISO_SEM_DATA,
  PORQUE_FALTA_A_DATA,
} from "@/lib/orcamento/data-em-falta";
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
  FechosMeta,
  ProposalBuilder,
  ProposalStudio,
  FazerProposta,
  ProductionPlan,
  EmailTemplates,
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
// O respiro vertical é o token da escala do espaço (`globals.css`): 12 px
// abaixo de 640, 24 a partir daí, os 40 de sempre no portátil. Eram 24 px fixos
// em ~15 vistas, antes de qualquer conteúdo — e num iPhone SE são 24 dos 667 que
// já tinham perdido 137 para o cabeçalho fixo e para a barra de baixo.
const VIEW_WRAP =
  "mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10 py-[var(--bo-p-vista)] lg:py-10";

// Code-split views + detail-panel tools live in ./lazy — only the view the
// user opens ships its JS, keeping the back-office's initial load lean.

const STATUS_OPTIONS: { id: QuoteStatus; label: string; color: string }[] = [
  { id: "pendente", label: "Novo", color: "bg-[var(--bo-tinta-10)] text-foreground/50" },
  { id: "em_revisao", label: "Aguardar resposta", color: "bg-moss/15 text-moss" },
  { id: "cotado", label: "Proposta enviada", color: "bg-moss/25 text-moss" },
  { id: "aceite", label: "Ganho", color: "bg-moss/35 text-moss" },
  { id: "rejeitado", label: "Perdido", color: "bg-[var(--bo-tinta-10)] text-foreground/30" },
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
    hint: "Preço, custos, margem e pagamentos.",
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
        hint: "Sinal, saldo e custos do evento",
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
/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA SECÇÃO, MAS NUM COOKIE — PARA O SERVIDOR A PODER LER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO por uma auditoria, em separador limpo: a ~1 s aparece a Visão Geral
 * (desenhada no servidor), a ~2 s a aplicação troca SOZINHA para a última
 * secção usada e o menu lateral fecha-se. Quem entrou para ver a Visão Geral
 * vê-a desaparecer-lhe da frente.
 *
 * A causa é a memória estar num sítio onde o servidor não chega: o
 * `localStorage` só existe depois de a página ter sido desenhada, portanto a
 * escolha dela só podia ser aplicada DEPOIS — como uma correcção, à vista.
 *
 * Um cookie é a mesma memória por aparelho, mas viaja com o pedido. O servidor
 * desenha logo a secção certa e não há salto nenhum para corrigir.
 *
 * O `localStorage` FICA, e não é redundância: é ele que continua a valer para
 * quem tenha os cookies restringidos, e é a ponte para quem já tem uma escolha
 * guardada e ainda não tem cookie nenhum.
 */
export const VIEW_COOKIE = "liquen-admin-view";

/**
 * O nome do parâmetro que leva a secção no endereço: `/orcamento/admin?v=pedidos`.
 *
 * Curto de propósito. Isto vai parar a favoritos e a mensagens («abre-me isto»),
 * e um endereço que se lê ao telefone vale mais do que um que se explica.
 */
export const PARAM_VISTA = "v";
/** A barra lateral recolhida no computador — por aparelho, como o resto. */
const CHAVE_MENU_RECOLHIDO = "liquen-admin-menu-recolhido";

interface Props {
  /**
   * A lista vem em RESUMO do servidor (ver `resumirQuote`): traz tudo o que
   * esta lista, os filtros e as vistas de conjunto lêem, e NÃO traz as
   * colecções que só o pedido aberto mostra. Um resumo continua a ser um
   * `Quote` válido — os campos que faltam são todos opcionais —, por isso as
   * vistas que recebem a lista não mudam; o que muda é `openQuote`, que vai
   * buscar o pedido inteiro antes de o mostrar.
   */
  initialQuotes: QuoteSummary[];
  userName?: string;
  /**
   * A leitura dos pedidos falhou do lado do servidor?
   *
   * Vem do `page.tsx`, que até aqui engolia a falha e devolvia `[]` — e o back
   * office abria como se ela não tivesse pedido nenhum. Ver o comentário lá.
   */
  falhaDosPedidos?: LeituraFalhada | null;
  /**
   * A secção com que abrir, decidida NO SERVIDOR a partir do cookie.
   *
   * `undefined` = não havia cookie, e o primeiro desenho é a Visão Geral. Ver
   * `VIEW_COOKIE`: é isto que faz o salto de secção desaparecer, porque o
   * servidor já desenha a secção certa em vez de o cliente a corrigir à vista.
   */
  vistaInicial?: View;
  /**
   * Há armazenamento configurado neste ambiente?
   *
   * Decidido NO SERVIDOR, e serve uma coisa só: não deixar a varredura das
   * versões leves arrancar onde ela não pode fazer nada. Sem isto, a primeira
   * chamada dela levava 503 («Armazenamento indisponível») e o browser
   * escrevia «Failed to load resource» na consola — em TODAS as entradas no
   * back office de qualquer ambiente sem Supabase.
   *
   * Não é ruído inofensivo: um passeio de telemóvel que exige a consola limpa
   * chumbou por causa disto, nas três tentativas. E uma consola com um erro
   * fixo é uma consola onde o erro seguinte, o verdadeiro, passa despercebido.
   *
   * Perguntar ao servidor com um pedido era trocar um erro por outro — a rota
   * que responde a contagem também devolve 503 sem armazenamento. Quem sabe é
   * quem desenha a página, e por isso a resposta desce daí.
   */
  armazenamentoLigado?: boolean;
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
      className={`text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm ${s?.color ?? "bg-[var(--bo-tinta-10)] text-foreground/30"}`}
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
  /** Quem está a marcar — vai para o histórico do pedido. */
  userName: string;
  /** O pedido gravado quando alguém marca o desfecho na própria linha. */
  onDesfecho: (q: Quote) => void;
}): Coluna<Quote>[] {
  /**
   * ════════════════════════════════════════════════════════════════════════
   * UM CASAMENTO JÁ GANHO NÃO ESTÁ «À ESPERA» DE NADA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Isto contava os dias desde a submissão para TODOS os pedidos, e a coluna
   * desenhava-os a todos. Debaixo de um cabeçalho que diz «À espera», um
   * trabalho ganho em Maio aparecia com «104d» — e um perdido também.
   *
   * O número não estava errado; a pergunta é que era outra. «Há quanto tempo
   * este pedido entrou» e «há quanto tempo isto está parado à espera de
   * alguém» são coisas diferentes, e esta coluna existe para a segunda: é por
   * ela que se ordena para responder a «a quem devo responder já».
   *
   * Um pedido em aberto está à espera de alguém — de nós enquanto não tem
   * proposta (`pendente`, `em_revisao`), do casal depois de ela seguir
   * (`cotado`). Um `aceite` e um `rejeitado` não estão à espera de ninguém:
   * acabaram. Esses passam a mostrar «—», que é a mesma marca que o resto da
   * tabela usa para «não se aplica».
   *
   * `null` e não zero, pela mesma razão que está escrita em `diasDeEspera`
   * (`lib/orcamento/espera.ts`): zero é um número, e um número debaixo desta
   * coluna é uma afirmação sobre quanto tempo alguém está à espera.
   */
  const diasAEsperar = (q: Quote): number | null => {
    if (q.status === "aceite" || q.status === "rejeitado") return null;
    return Math.floor((Date.now() - new Date(q.submittedAt).getTime()) / 86400000);
  };
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
              ctx.atual === q.id ? "font-semibold text-[#4d6350]" : "text-[var(--bo-text)]"
            }`}
          >
            {q.name}
          </span>
          <span className="block truncate text-[11px] text-foreground/45">{q.email}</span>
        </span>
      ),
    },
    {
      /**
       * ── «JÁ RESPONDERAM?» TAMBÉM NO COMPUTADOR ─────────────────────────
       *
       * No telemóvel a lista é uma pilha de cartões e o gesto vive no cartão;
       * no computador é ESTA tabela. Sem isto, o gesto existia no telemóvel e
       * desaparecia no portátil onde ela trabalha o dia inteiro.
       *
       * Vai por baixo do próprio estado, e NÃO numa coluna nova ao fundo: a
       * tabela já pede mais largura do que a caixa tem num portátil de 1440 (é
       * por isso que a caixa rola), e uma coluna nova no fim nascia fora do
       * ecrã — que é o oposto de «à frente dela no momento em que se lembra».
       * A pergunta é sobre o estado; fica colada a ele.
       */
      chave: "estado",
      cabecalho: "Estado",
      celula: (q) => (
        // Um `div` e não um `span`: o componente traz a sua própria caixa de
        // bloco, e um `div` dentro de um `span` é HTML inválido — o browser
        // desfaz o aninhamento e a célula parte-se ao meio.
        <div className="min-w-[9rem]">
          {statusBadge(q.status)}
          {faltaODesfecho(q) && (
            <PerguntaDeDesfecho
              key={`desfecho-${q.id}`}
              quote={q}
              quem={ctx.userName}
              onGravado={ctx.onDesfecho}
            />
          )}
        </div>
      ),
    },
    {
      chave: "data",
      cabecalho: "Data do evento",
      ordenar: (a, b) => (a.date ?? "").localeCompare(b.date ?? ""),
      celula: (q) => {
        const cd = eventCountdown(q.date);
        return (
          <span className="whitespace-nowrap">
            {/* Era `q.date` cru: `2028-08-13`, o formato da base de dados, no
                ÚNICO ecrã onde ele chegava à frente de alguém. Em todo o resto
                da aplicação — cartões, calendário, propostas, dossier — a data
                está escrita em português. Ver `dataCurta`. */}
            {/* F-15 da auditoria: aqui estava só «—». Um travessão não é um
                aviso — é um espaço em branco com um caracter dentro. Ver
                `data-em-falta.ts` para a fronteira (só depois de a proposta
                seguir). */}
            {faltaADataDoEvento(q) ? (
              <span
                className="inline-flex items-center rounded-full bg-[#c98a2e]/12 px-2 py-0.5 text-[11px] font-medium text-[#8a6420]"
                title={PORQUE_FALTA_A_DATA}
              >
                {AVISO_SEM_DATA}
              </span>
            ) : (
              dataCurta(q.date) || "—"
            )}
            {cd && cd.tone !== "past" && (
              <span
                className={`ml-1.5 text-[10px] ${
                  cd.tone === "today" || cd.tone === "soon"
                    ? "font-medium text-[#8a2a22]"
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
      // Os fechados vão para o FIM da ordenação, e não para o princípio: ordenar
      // por «à espera» é procurar o que está parado há mais tempo, e um trabalho
      // acabado no topo dessa lista era ruído no sítio de maior atenção.
      ordenar: (a, b) => (diasAEsperar(b) ?? -1) - (diasAEsperar(a) ?? -1),
      celula: (q) => {
        const d = diasAEsperar(q);
        if (d === null) return <span className="text-foreground/40">—</span>;
        const parado =
          (q.status === "pendente" || q.status === "em_revisao" || q.status === "cotado") &&
          d >= 14;
        return (
          <span
            className={`tabular-nums whitespace-nowrap ${
              parado ? "font-medium text-amber-600" : "text-[var(--bo-text-muted)]"
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
  userName,
  onOpen,
  onToggle,
  onDesfecho,
}: {
  q: Quote;
  isCurrent: boolean;
  isSelected: boolean;
  todayStr: string;
  /** Quem está a marcar — vai para o histórico do pedido. */
  userName: string;
  onOpen: (q: Quote) => void;
  onToggle: (id: string) => void;
  /** O pedido gravado quando alguém marca aqui o desfecho. */
  onDesfecho: (q: Quote) => void;
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
  /** Este cartão foi marcado agora, aqui. Ver o comentário lá em baixo. */
  const [marcadoAqui, setMarcadoAqui] = useState(false);
  return (
    /* ── A MOLDURA DO CARTÃO É ESTA CAIXA, E NÃO O BOTÃO LÁ DENTRO ──────────
       Estava no `<button>`: o risco, o fundo branco e a sombra eram dele. Com a
       pergunta «já responderam?» a ter de ficar FORA desse botão (um botão
       dentro de outro é HTML inválido), o gesto ficava a flutuar por baixo do
       cartão, em cima do fundo da página, como se pertencesse ao pedido
       seguinte. A moldura sobe um nível e passa a abraçar os dois. */
    <div
      className={`relative rounded-xl border transition-all duration-200 motion-reduce:transition-none ${
        isCurrent
          ? "border-[#4d6350]/45 bg-[#4d6350]/[0.05] "
          : isSelected
            ? "border-[#4d6350]/30 bg-[#4d6350]/[0.03]"
            : "border-[var(--bo-hairline)] hover:border-[var(--bo-hairline-strong)] bg-white "
      }`}
    >
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
        className="w-full text-left p-5 pl-12 rounded-xl"
      >
        {/* ── A HIERARQUIA, E PORQUE É QUE ELA NÃO EXISTIA ─────────────────
            Palavras dela: «o nome do casal tem o mesmo peso visual que o email,
            que a categoria e que a referência». Medido, era mesmo: 14 / 12 / 10
            / 9 px, todos no mesmo cinzento a rondar `/70`. Quatro degraus tão
            juntos que o olho não os separa — e numa lista o que se faz é
            VARRER, não ler.

            A ordem que o cartão passa a dizer, e que é a ordem por que se usa:
            o NOME (o que se procura) · o ESTADO e a ESPERA (o que decide) · o
            contexto (confirma) · a REFERÊNCIA (um detalhe, e só serve depois de
            já se saber qual é). Tamanho, peso e tom, os três a dizer o mesmo —
            um só não chega. */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            {/* Um tamanho só, sem variante `lg:`: este cartão NÃO EXISTE no
                computador. O `TabelaOuCartoes` troca-o pela tabela a partir de
                1024, portanto um `lg:` aqui seria uma regra que nunca chega a
                aplicar-se — e a pior espécie de código morto é a que parece
                cuidada. */}
            <p className="text-[17px] font-semibold text-[var(--bo-text)] leading-snug truncate">
              {q.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-[13px] bo-text-muted truncate">{q.email}</p>
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
                    ? "bg-[#8a2a22]/15 text-[#8a2a22]"
                    : tom === "aviso"
                      ? "bg-[#c08a3e]/15 text-[#8a6420]"
                      : "bg-[var(--bo-tinta-6)] text-foreground/45"
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
                      ? "bg-[#8a2a22]/15 text-[#8a2a22]"
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
        {/* A FILA QUEBRA, e é por isso que o cartão cabe num telemóvel.
            Categoria · tipo · convidados · região · contagem: são cinco factos
            que num iPhone SE pedem 316 px numa caixa de 273 (o `pl-12` do risco
            de estado come 48). Sem `flex-wrap` nada disto encolhe — a fila
            esticava o cartão, o cartão esticava a página, e o que sobrava para
            lá da margem («faltam 16 meses», e a própria barra de baixo) ficava
            CORTADO, porque o `body` tem `overflow-x: clip` e não há como lá
            chegar. `gap-y-1` e não `gap-3` na vertical: a segunda linha é a
            continuação da mesma frase, não outro bloco. */}
        {/* NO TELEMÓVEL SEPARA O ESPAÇO, NÃO O RISCO.
            Os riscos são elementos próprios entre cada facto, e numa fila que
            QUEBRA (é o que esta faz num telemóvel) um deles fica a fechar a
            linha: lia-se «Eventos Particulares | Casamentos |» com um risco
            pendurado no fim, que parece um erro. Não há CSS que esconda só o
            último de cada linha — a linha é decidida na disposição, não na
            folha de estilo.
            Por isso os riscos vivem a partir de `sm`, onde a fila NÃO quebra, e
            no telemóvel separa-se com mais ar (`gap-x-4`), que é o que os
            cartões bem desenhados fazem. */}
        <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-3 gap-y-1 bo-text-muted text-[10px]">
          <span>{cat?.label ?? "—"}</span>
          {et && (
            <>
              <span className="hidden sm:block w-px h-2.5 bg-[var(--bo-tinta-10)]" />
              <span>{et.label}</span>
            </>
          )}
          <span className="hidden sm:block w-px h-2.5 bg-[var(--bo-tinta-10)]" />
          <span>{q.guests} convidados</span>
          {/* ONDE É. A região reconhecida e a distância a Évora dizem, antes
              de abrir seja o que for, se aquele casamento é ali ao lado ou se
              obriga a dormir fora — que muda o preço e a equipa. */}
          {ctx.regiao && (
            <>
              <span className="hidden sm:block w-px h-2.5 bg-[var(--bo-tinta-10)]" />
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
                <span className="hidden sm:block w-px h-2.5 bg-[var(--bo-tinta-10)]" />
                {/* QUANDO É O EVENTO — «a data é o que decide». Era um de
                    cinco factos todos iguais nesta fila; passa a ter peso
                    sempre, e não só quando já está em cima. O vermelho continua
                    reservado ao que urge: o peso diz «isto conta», a cor diz
                    «isto conta AGORA», e as duas coisas não são a mesma. */}
                <span
                  className={
                    cd.tone === "today" || cd.tone === "soon"
                      ? "text-[#8a2a22] font-semibold"
                      : "text-[var(--bo-text)] font-medium"
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
        {/* F-15: no cartão a data em falta nem «—» tinha — a fila de factos
            simplesmente não a mencionava, e um facto que não aparece lê-se
            como um facto que está bem. */}
        {faltaADataDoEvento(q) && (
          <div className="mt-2.5">
            <span
              className="inline-flex items-center rounded-full bg-[#c98a2e]/12 px-2 py-0.5 text-[11px] font-medium text-[#8a6420]"
              title={PORQUE_FALTA_A_DATA}
            >
              {AVISO_SEM_DATA}
            </span>
          </div>
        )}
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
        {/* ── A REFERÊNCIA SAIU DAQUI ─────────────────────────────────────
            Estava nesta linha, em `font-mono`, em TODOS os pedidos da lista.
            Perguntei-lhe se precisava dela de relance ou só ao abrir o pedido,
            e a resposta foi «retira a referência».

            Tinha razão, e a defesa que aqui estava escrita dizia-o sem dar por
            isso: «quando SE PRECISA dela é para a ler letra a letra ao
            telefone». Uma coisa que só se usa com o pedido já aberto não tem de
            estar em vinte linhas de lista — está no painel de detalhe, que é
            onde ela está quando precisa de a ler.

            O que fica nesta fila é o que decide: o VALOR e a data. Sem a
            referência à esquerda deixa de haver duas pontas para separar, por
            isso a fila deixa de ser `justify-between` e encosta ao fim, ao pé
            do resto dos números. */}
        <div className="flex items-center justify-end mt-3 pt-3 border-t border-[var(--bo-hairline)]">
          <div className="flex items-center gap-3">
            {q.quotedPrice ? (
              <span className="text-[#4d6350] text-[13px] font-semibold">
                {formatPrice(q.quotedPrice)}
              </span>
            ) : q.priceBreakdown?.total ? (
              <span className="bo-text-muted text-[13px]">
                ≈ {formatPrice(q.priceBreakdown.rangeMin)}–{formatPrice(q.priceBreakdown.rangeMax)}
              </span>
            ) : null}
            <span className="bo-text-faint text-[12px]">
              {new Date(q.submittedAt).toLocaleDateString("pt-PT", {
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
        </div>
      </button>
      {/* ── «JÁ RESPONDERAM?» ───────────────────────────────────────────────
          FORA do botão do cartão, e é obrigatório que assim seja: um <button>
          dentro de outro <button> é HTML inválido, o browser desfaz o aninhamento
          e o que sai é um cartão partido em pedaços com o gesto a abrir o pedido
          em vez de o marcar.

          A moldura só existe quando há pergunta a fazer: um `div` com margem
          desenhado à mesma em todos os cartões punha 16 px de vazio por baixo
          de cada pedido novo da lista.

          O `|| marcadoAqui` é o que impede a moldura de desaparecer NO INSTANTE
          da marcação: assim que o servidor responde, o pedido deixa de ter
          proposta enviada e a condição de cima passa a falsa. Sem a segunda
          metade, o recibo («Marcado como perdido») e o campo do motivo — que é
          opcional e vem DEPOIS — nasciam e morriam no mesmo render. */}
      {(faltaODesfecho(q) || marcadoAqui) && (
        <div className="px-5 pb-4 -mt-2">
          <PerguntaDeDesfecho
            quote={q}
            quem={userName}
            onGravado={(actualizado) => {
              setMarcadoAqui(true);
              onDesfecho(actualizado);
            }}
          />
        </div>
      )}
    </div>
  );
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O PAINEL DO PEDIDO GRAVA SOZINHO — E O QUE CONTINUA A PEDIR UM CLIQUE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que acontecia: escreviam-se três mil caracteres nas notas internas, tocava
 * o telefone, fechava-se o separador, e não tinha sido enviado nada. Tudo o que
 * este painel edita vivia em estado do React até alguém carregar em «Guardar».
 *
 * A divisão não é «campos pequenos gravam-se, campos grandes não». É esta:
 *
 *  · **O que se ESCREVE grava-se sozinho** — as notas internas e o motivo de
 *    perda. É prosa, é dela, e o pior que uma gravação a meio produz é uma
 *    frase por acabar, que a gravação seguinte completa. Ficar por gravar é que
 *    é o estrago.
 *
 *  · **O que é uma DECISÃO, ou um FACTO que outros ecrãs lêem, continua a
 *    exigir um clique** — o estado, o preço, a data, os convidados, o local, o
 *    responsável. Três razões, e nenhuma delas é preguiça:
 *      1. metade de um número é um número errado: «8» a caminho de «80»
 *         gravado sozinho põe oitenta convidados a oito, e a data, o local e o
 *         preço aparecem no calendário, nas contas e na proposta;
 *      2. mudar o estado muda a coluna do quadro e o que conta como ganho —
 *         é uma coisa que se faz, não uma coisa que se rascunha;
 *      3. a rota trata a PRESENÇA de `status` no PATCH como «escolhido à mão»
 *         e desliga as transições automáticas por causa disso. Mandá-lo em cada
 *         gravação automática desligava-as em silêncio, para sempre.
 *
 * O motivo de perda é o caso de fronteira: é prosa, mas escrito no MESMO gesto
 * em que se marca o pedido como perdido é parte dessa decisão. Por isso grava-se
 * sozinho só quando não há uma mudança de estado à espera de confirmação.
 */
interface NotasAutomaticas {
  id: string;
  adminNotes: string;
  /** `null` quando o motivo de perda viaja com a decisão do estado e não sozinho. */
  lostReason: string | null;
}

/**
 * Comparação por CAMPOS e não por identidade: o `selected` é substituído por
 * tudo o que grava neste painel (etiquetas, seguimento, pagamentos, a própria
 * revalidação da lista), e comparar objectos fazia cada uma dessas substituições
 * parecer uma alteração dela — uma gravação por cada redesenho.
 */
function mesmasNotas(a: NotasAutomaticas, b: NotasAutomaticas): boolean {
  return a.id === b.id && a.adminNotes === b.adminNotes && a.lostReason === b.lostReason;
}

/** O preço como o campo o mostra — para saber se o que lá está veio do pedido
 *  ou foi escrito por ela. */
function textoDoPreco(q: Quote): string {
  // `!= null` e não a verdade do valor: um preço de ZERO é um preço escrito (a
  // criação manual chega a gravá-lo, ao aparar um valor negativo). Lido como
  // «sem preço», o campo abria vazio, a comparação com `undefined` dava
  // diferente, e o pedido nascia com «alterações por guardar» sem ninguém lhe
  // ter tocado — com o aviso de saída da página a travar o fecho do separador.
  return q.quotedPrice != null ? String(q.quotedPrice) : "";
}

/**
 * O que se diz de uma gravação recusada, pelo código que voltou.
 *
 * A regra vive agora em `razaoDaRecusa` (`lib/porque-falhou.ts`), e este nome
 * fica como o atalho local. Havia DUAS cópias disto — esta e a da
 * `PerguntaDeDesfecho` — e tinham divergido: uma tratava o 413 e a outra o 404,
 * portanto o mesmo 404 dizia «este pedido já não existe» num sítio e nada no
 * outro, no mesmo ecrã.
 */
const porqueNaoGravou = razaoDaRecusa;

/**
 * O que a leitura de um pedido devolve.
 *
 * `Quote | null` não chegava: o `null` servia quatro avarias diferentes — rede
 * em baixo, recusa do servidor, sessão caída (que responde **200**, ver abaixo)
 * e resposta truncada — e quem chamava só sabia dizer «Verifica a ligação e
 * tenta de novo». Numa sessão caída, essa frase manda fazer a única coisa que
 * não resolve nada.
 */
type LeituraDoPedido = { ok: true; quote: Quote } | { ok: false; porque: string };

/**
 * O que desaparece com um pedido — em linhas, com números.
 *
 * Só o que EXISTE entra na lista: uma pergunta com «0 pagamentos» a meio é
 * ruído, e ruído numa pergunta destrutiva é o que ensina a saltá-la. Um pedido
 * sem nada por baixo dá uma lista vazia, e aí a `PerguntaDestrutiva` mostra só
 * o título e o aviso — que continua a ser melhor do que «tens a certeza».
 */
function oQueSePerdeComOPedido(q: Quote | null): string[] {
  if (!q) return [];
  const linhas: string[] = [];
  const conta = (n: number, um: string, muitos: string) =>
    n > 0 ? linhas.push(`${n} ${n === 1 ? um : muitos}`) : undefined;
  conta(q.messages?.length ?? 0, "mensagem trocada", "mensagens trocadas");
  conta(q.payments?.length ?? 0, "pagamento registado", "pagamentos registados");
  conta(q.guestList?.length ?? 0, "convidado", "convidados");
  conta(q.checklist?.length ?? 0, "linha da checklist", "linhas da checklist");
  conta(q.productionPlan?.length ?? 0, "tarefa de produção", "tarefas de produção");
  conta(q.activityLog?.length ?? 0, "entrada no histórico", "entradas no histórico");
  if (q.quotedPrice) {
    linhas.push(
      `o valor combinado, ${q.quotedPrice.toLocaleString("pt-PT", {
        style: "currency",
        currency: "EUR",
      })}`,
    );
  }
  return linhas;
}

/** No máximo esta lista, e o resto contado. Trinta nomes não se leem. */
const NOMES_A_MOSTRAR = 8;

export default function AdminClient({
  initialQuotes,
  userName = "Catarina",
  falhaDosPedidos = null,
  vistaInicial,
  armazenamentoLigado = false,
}: Props) {
  // `QuoteSummary` é atribuível a `Quote` (só faltam campos opcionais), e o
  // estado tem mesmo de ser `Quote[]`: assim que um pedido é aberto ou gravado,
  // o elemento da lista passa a ser o pedido INTEIRO devolvido pelo servidor.
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [selected, setSelected] = useState<Quote | null>(null);
  /**
   * Os pedidos que já foram buscados por inteiro nesta sessão. Sem esta marca
   * não havia como distinguir «este casamento não tem convidados registados»
   * de «a lista de convidados ainda não veio» — as duas coisas são um campo
   * ausente —, e reabrir o mesmo pedido pagava outra ida ao servidor.
   */
  const completos = useRef(new Set<string>());
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
  /** O pedido que está a ser aberto agora — ver `openQuote`. */
  const [aAbrir, setAAbrir] = useState<{ id: string; nome: string } | null>(null);
  /**
   * As perguntas destrutivas abertas.
   *
   * Estado e não `window.confirm`: a pergunta tem de caber uma LISTA lá dentro
   * — ver `PerguntaDestrutiva`, e a razão por que «tens a certeza?» não é uma
   * pergunta.
   */
  const [aApagar, setAApagar] = useState<Quote | null>(null);
  const [aApagarLote, setAApagarLote] = useState<string[] | null>(null);
  const [aSair, setASair] = useState(false);
  const [filterEspera, setFilterEspera] = useState<"all" | "3" | "7">("all");
  const [filterMes, setFilterMes] = useState<string>("all");
  const [filterRegiao, setFilterRegiao] = useState<string>("all");
  const [filterPlanner, setFilterPlanner] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  /**
   * O painel dos filtros está aberto? SÓ IMPORTA NO TELEMÓVEL.
   *
   * Medido a 390×844: os controlos comiam 52% do ecrã antes de aparecer um
   * pedido. A partir de `lg` o painel é sempre visível por CSS e este estado
   * não pinta nada — não há dois layouts, há um que recolhe.
   *
   * Começa fechado de propósito: a lista é o que se veio ver.
   */
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
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
  /**
   * QUANTOS FILTROS ESTÃO A ESCONDER PEDIDOS NESTE MOMENTO.
   *
   * É o que o botão «Filtros» mostra ao lado do nome, e é o que torna honesto
   * recolher os controlos: um filtro escondido E calado faz uma lista filtrada
   * parecer uma lista vazia — e é assim que se perde um pedido e se responde
   * tarde a um casamento.
   *
   * O que NÃO entra na conta, e porquê:
   *   · a ORDENAÇÃO — muda a ordem, não tira nada da lista. Contá-la seria um
   *     alarme falso, e um alarme falso gasta-se depressa (a mesma razão por
   *     que o aviso laranja do orçamento se cala quando não há preços).
   *   · o ESTADO, as ETIQUETAS e os ARQUIVADOS — continuam à vista em pastilhas
   *     próprias, portanto já se vê que estão ligados. Contá-los era dizer duas
   *     vezes a mesma coisa.
   */
  /**
   * Está alguma coisa a esconder pedidos? (filtros + procura + estado + etiqueta)
   *
   * Serve o ecrã de lista vazia, que tem de saber distinguir «ainda não entrou
   * nada» de «isto está filtrado». São perguntas diferentes: `filtrosActivos`
   * conta só o que está DENTRO do painel recolhido, porque é isso que o botão
   * anuncia; esta inclui também o que está à vista, porque para a lista vazia
   * o que importa é se há ALGUMA razão para faltarem pedidos.
   */
  const filtrosActivos =
    (mineOnly ? 1 : 0) +
    (filterCategory !== "all" ? 1 : 0) +
    (filterEspera !== "all" ? 1 : 0) +
    (filterMes !== "all" ? 1 : 0) +
    (filterRegiao !== "all" ? 1 : 0) +
    (filterPlanner !== "all" ? 1 : 0);
  const haFiltroAActuar =
    filtrosActivos > 0 || search.trim() !== "" || filterStatus !== "all" || tagFilter !== null;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A SAÍDA TEM DE ESTAR ONDE SE DÁ POR ELA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A lista filtrada e vazia já sabia dizer que estava filtrada — o que não
   * fazia era dar a saída. Dizia «Limpa a pesquisa ou os filtros» e mandava
   * procurá-los: no telemóvel estão dentro de um painel RECOLHIDO, que é
   * precisamente o que faz ninguém dar por eles.
   *
   * Do inventário: vinte e cinco vazios explicam-se bem e não põem a acção ao
   * alcance. Um vazio que manda ir a outro sítio é meio vazio — e este é o
   * mais caro de todos, porque a conclusão errada («não entrou nada») fecha o
   * telemóvel e deixa um pedido sem resposta.
   */
  function limparFiltros() {
    setSearch("");
    setFilterStatus("all");
    setTagFilter(null);
    setFilterCategory("all");
    setFilterEspera("all");
    setFilterMes("all");
    setFilterRegiao("all");
    setFilterPlanner("all");
    setMineOnly(false);
  }

  /**
   * O que está a esconder os pedidos, por extenso.
   *
   * «Nenhum pedido corresponde» não diz o que fazer se não se souber o que
   * está ligado — e o que está ligado pode ser uma pesquisa de há dez minutos
   * ou um filtro de mês escolhido noutro separador.
   */
  function oQueEstaAFiltrar(): string {
    const partes: string[] = [];
    if (search.trim()) partes.push(`a pesquisa «${search.trim()}»`);
    if (filterStatus !== "all") partes.push("um estado");
    if (tagFilter) partes.push(`a etiqueta «${tagFilter}»`);
    if (filtrosActivos > 0) {
      partes.push(
        filtrosActivos === 1 ? "um filtro do painel" : `${filtrosActivos} filtros do painel`,
      );
    }
    if (partes.length === 0) return "";
    if (partes.length === 1) return partes[0];
    return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
  }
  const [saving, setSaving] = useState(false);
  /**
   * O id do pedido cujo desfecho acabou de ser marcado NO PAINEL.
   *
   * É um id e não um booleano: trocar de pedido tem de voltar a mostrar a
   * pergunta, e um `true` esquecido deixava o recibo do casamento anterior em
   * cima do pedido seguinte.
   */
  const [marcadoNoPainel, setMarcadoNoPainel] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<QuoteStatus>("pendente");
  const [editAssigned, setEditAssigned] = useState("");
  const [editLostReason, setEditLostReason] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editGuests, setEditGuests] = useState("");
  const [editLocation, setEditLocation] = useState("");
  /**
   * ── OS DADOS DE CONTACTO, EDITÁVEIS ─────────────────────────────────────
   *
   * Palavras dela: «se criarmos um pedido novo e não colocarmos um email,
   * depois quando quisermos alterar para colocar o email para enviarmos a
   * proposta, não conseguimos editar».
   *
   * Um pedido nascido de um telefonema entra sem email, e é a rota do envio
   * que dá pela falta: grava a proposta, não a manda a ninguém, e responde
   * «acrescenta o email e reenvia». Não havia por onde. Estes três campos são
   * esse «por onde», e gravam pelo mesmo botão que o resto do painel.
   */
  const [editNome, setEditNome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  // Which tools section of the detail panel is showing. Everything is visible
  // at once now — the management form always renders; only the heavier tool
  // groups (Produção / Financeiro / Comunicação) are tabbed for organisation.
  const [detailTab, setDetailTab] = useState<DetailTab>("comunicacao");
  /**
   * ════════════════════════════════════════════════════════════════════════
   * QUE SEPARADORES JÁ FORAM ABERTOS NESTE PEDIDO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Abrir um pedido montava os três separadores AO MESMO TEMPO: os doze
   * `dynamic()` lá dentro (Produção tem seis, Financeiro dois, Comunicação
   * quatro, entre `ProposalStudio` e `ProposalBuilder`) eram todos
   * descarregados e arrancados de uma vez, mesmo para quem só queria ver um
   * telefone. Cada separador só monta a sua ferramenta a PRIMEIRA vez que é
   * aberto: o resto do tempo os dois que ninguém tocou nem chegam a existir
   * no DOM.
   *
   * Uma vez aberto, um separador NUNCA desmonta ao trocar de separador (só
   * fica escondido por `hidden`, como já estava) — é a mesma garantia de
   * sempre, escrita ao lado de cada painel: trocar de separador não pode
   * perder uma mensagem por enviar ou uma proposta a meio de editar. Cada um
   * dos doze componentes foi visto antes desta mudança: guardam campos de
   * formulário por gravar (um título de tarefa a meio, um nome de convidado),
   * e nenhum é seguro para desmontar sozinho ao trocar de separador. Montar
   * só à primeira abertura, e nunca mais desmontar, resolve os dois lados:
   * poupa o que a maioria dos pedidos nunca chega a tocar, sem arriscar o que
   * a mudança para `hidden` já protegia.
   */
  const [detailTabsVisitados, setDetailTabsVisitados] = useState<Set<DetailTab>>(
    () => new Set([detailTab]),
  );
  /** Abre um separador do detalhe DO PEDIDO JÁ ABERTO: primeira vez que se vê
   *  é primeira vez que monta. Usar sempre em vez de `setDetailTab` directo
   *  para uma troca de separador. Para ABRIR um pedido (novo `selected`), usa
   *  antes `abrirPrimeiroDetailTab` — essa RECOMEÇA a lista de visitados, esta
   *  ACRESCENTA-lhe. */
  const abrirDetailTab = useCallback((tab: DetailTab) => {
    setDetailTab(tab);
    setDetailTabsVisitados((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, []);
  /** O pedido MUDOU: os separadores visitados do pedido anterior não dizem
   *  nada sobre este. Recomeça a lista só com o separador de abertura. */
  const abrirPrimeiroDetailTab = useCallback((tab: DetailTab) => {
    setDetailTab(tab);
    setDetailTabsVisitados(new Set([tab]));
  }, []);
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
  const [view, setView] = useState<View>(vistaInicial ?? "overview");
  const [navOpen, setNavOpen] = useState(false);
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O MENU ENCOLHIDO NO COMPUTADOR — E SOZINHO AO FAZER PROPOSTA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «quero que haja uma cruz para que dê no desktop para
   * carregar e o menu fica ocultado e a zona do back office estende de forma a
   * aumentar o espaço para fazer propostas (…) aliás eu quero que quando
   * carregamos em fazer proposta o menu oculte-se automaticamente».
   *
   * A barra lateral mede 256 px e está sempre lá. No estúdio isso importa mais
   * do que em qualquer outro ecrã: a coluna onde ela escreve vive dentro de
   * TRÊS outras (esta, o índice do estúdio a 192 e o painel «O que vai sair» a
   * 336), e é a primeira a pagar quando o ecrã não é enorme.
   *
   * `navOpen` é outra coisa e continua a ser: é a GAVETA do telemóvel. Isto é
   * o computador, onde a barra é uma coluna em fluxo. Dois estados porque são
   * dois comportamentos — juntá-los fazia fechar a gaveta no telemóvel
   * esconder a barra no computador da próxima vez que lá voltasse.
   */
  const [menuRecolhido, setMenuRecolhido] = useState(false);
  /** Já se recolheu sozinho nesta visita ao estúdio? Sem isto, voltar a abrir a
   *  barra à mão e continuar a trabalhar fazia-a fechar-se outra vez a cada
   *  render — ela abria e o ecrã fechava-lhe. */
  const recolhidoPeloEstudio = useRef(false);
  /** Já desceu o suficiente para o cabeçalho encolher? Ver `ui/adaptativo.ts`. */
  const desceu = useDesceu();
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
  /**
   * O LOTE QUE ESTÁ A CORRER, E QUANTOS JÁ LÁ VÃO.
   *
   * Era um booleano (`bulkBusy`), e o único sinal que dava vivia dentro de um
   * `<option>` de um `<select>` FECHADO — ou seja, na prática ela carregava e
   * não via nada acontecer. Guardar a contagem é o que permite ao `EmCurso`
   * dizer a verdade: são N pedidos, e a barra sobe a cada um que responde.
   *
   * `bulkBusy` continua a existir logo abaixo, derivado, porque o que os botões
   * precisam de saber (está a correr? então não se carrega outra vez) não mudou.
   */
  const [lote, setLote] = useState<{ titulo: string; feito: number; total: number } | null>(null);
  const bulkBusy = lote !== null;

  /** Mais um pedido respondeu. Ver a nota em `applyBulkStatus`. */
  function contarMaisUmNoLote() {
    setLote((l) => (l ? { ...l, feito: l.feito + 1 } : l));
  }
  const [recentQuotes, setRecentQuotes] = useState<RecentQuote[]>([]);
  // Below xl the detail panel is a modal slide-over (overlay + scrim); at xl+ it
  // is an inline sticky column. Only the overlay should behave as a dialog (focus
  // trap, aria-modal, scroll lock) — the inline panel must not trap focus.
  const [isDetailOverlay, setIsDetailOverlay] = useState(false);
  /**
   * ── A ALTURA DA COLUNA DE DETALHE, MEDIDA E NÃO PRESUMIDA ─────────────────
   *
   * `xl:max-h-[calc(100vh-7rem)]` presumia que esta coluna começa colada ao
   * cabeçalho: 6rem do `xl:top-24` mais 1rem de folga no fundo. Não começa.
   * MEDIDO num 1440×900: a linha da grelha arranca a 341 px do topo — abaixo
   * do título e da barra de filtros —, a coluna ficava com 788 px de altura, e
   * 341 + 788 dá 1129 num ecrã de 900. A barra «Guardar alterações», que vive
   * colada ao fundo DESTA coluna, nascia 229 px abaixo da dobra:
   * `elementFromPoint` no centro do botão devolvia `null`.
   *
   * E rolar a gaveta até ao fim não a trazia — ela está colada ao fundo do
   * contentor que rola, não ao fundo do ecrã —, portanto quem rola até bater no
   * fim conclui, com toda a razão, que não há mais nada por baixo. Só rolar a
   * PÁGINA inteira (269 px, todo o curso que ela tem) a revelava.
   *
   * O `xl:sticky xl:top-24` também nunca chegou a colar nada: um `sticky` só
   * tem caminho para andar se a caixa que o contém for mais alta do que ele, e
   * aqui a altura da grelha É a desta coluna — zero caminho. Por isso isto não
   * se resolve só com CSS: a altura que sobra depende de ONDE a coluna começa,
   * e onde ela começa mede-se.
   *
   * `null` até à primeira medição — e nessa altura vale a classe do Tailwind,
   * que é o comportamento de antes. Nunca se aplica no telemóvel: lá a gaveta é
   * `fixed inset-y-0` e já está certa (medida: 775→844 num ecrã de 844).
   */
  const [alturaDoDetalhe, setAlturaDoDetalhe] = useState<number | null>(null);
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
  /**
   * ── O LINK DO DOSSIER SAÍA DO BACK OFFICE PARA UM 404 ───────────────────
   *
   * Estava `pathname.split("/").filter(Boolean)[0]`, a chamar «língua» ao
   * primeiro segmento do caminho. Mas o site é português SEM prefixo: a página
   * canónica é `/orcamento/admin`, e nesse caminho o primeiro segmento é a
   * palavra **`orcamento`**. O link do Dossier ficava
   * `/orcamento/orcamento/admin/evento/{id}` — o 404 do site público, com o
   * menu comercial e um botão que leva à homepage comercial. Sem caminho de
   * volta ao back office a não ser escrever o URL à mão.
   *
   * E o destino verdadeiro é o Dossier do Evento: financeiro, pagamentos,
   * fornecedores, produção, cronograma do dia, convidados. Estava construído,
   * a funcionar, e inacessível pela interface.
   *
   * `localeDoCaminho` faz a pergunta certa (é o espelho inglês?) e
   * `localizeHref` é quem sabe compor o endereço nas duas línguas — as mesmas
   * funções que o resto do site já usa.
   */
  const locale = localeDoCaminho(pathname);

  /**
   * O motivo de perda acompanha a decisão do estado?
   *
   * Enquanto houver uma mudança de estado por confirmar, o motivo escrito faz
   * parte dessa mudança e vai com ela no clique. Sem mudança nenhuma à espera
   * (o pedido já está marcado como perdido e ela está a arrumar o texto), é
   * prosa como as notas — e grava-se sozinho.
   */
  const motivoVaiComADecisao = !!selected && editStatus !== selected.status;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O NÚMERO DE CONVIDADOS, LIDO ANTES DE SAIR DO ECRÃ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `-50` era enviado tal e qual: o servidor respondia 400 com «Too small:
   * expected number to be >=0», o painel dizia «Não foi possível guardar as
   * alterações» — sem nomear o campo — e TUDO o que ia na mesma gravação (o
   * estado, o email acabado de acrescentar) ficava por gravar. O `min={0}` do
   * input era decoração: o teclado escreve o que quer lá dentro.
   *
   * É a mesma regra das definições da proposta, do mesmo módulo: o que não dá
   * um número que sirva é dito no campo, e não segue.
   *
   * ── O CAMPO EM BRANCO AQUI NÃO É O MESMO QUE LÁ ──────────────────────────
   * Um pedido pode ter entrado sem número de convidados (um telefonema, uma
   * referência de terceiros), e continuar assim é um estado legítimo — em
   * branco não há nada para gravar e não se reclama de um campo que ninguém
   * tocou. Mas APAGAR um número que lá estava é outra coisa: é uma edição a
   * meio, e o ecrã tem de o dizer em vez de gravar o velho por baixo.
   */
  const convidadosEscritos = lerNumero(editGuests, {
    min: 0,
    max: 100000,
    inteiro: true,
    vazioVale: selected?.guests == null,
    nome: "número de convidados",
    exemplo: "80",
  });
  const erroDeConvidados = convidadosEscritos.ok ? null : convidadosEscritos.porque;

  /**
   * As alterações que ainda esperam por um clique. São só os campos que NÃO
   * gravam sozinhos — o que se escreve já foi (ou está a ser) gravado, e
   * contá-lo aqui punha o painel a pedir para guardar o que já está guardado.
   */
  const alteracoesPorConfirmar =
    !!selected &&
    (editStatus !== selected.status ||
      // Compare parsed values, not raw strings — "1500,50" vs "1500.5" or a
      // trailing zero must not read as a phantom edit.
      parsePriceInput(editPrice) !== (selected.quotedPrice ?? undefined) ||
      editAssigned !== (selected.assignedTo ?? "") ||
      (motivoVaiComADecisao && editLostReason !== (selected.lostReason ?? "")) ||
      editDate !== (selected.date ?? "") ||
      editGuests !== String(selected.guests ?? "") ||
      // TRIMADOS DOS DOIS LADOS, como o corpo do PATCH os compara (ver
      // `saveChanges`). Com as duas comparações diferentes, um espaço a mais no
      // fim de um campo punha o painel a pedir para guardar uma alteração que a
      // gravação depois não encontrava: respondia «já está tudo guardado» e a
      // barra não limpava — e a partir daí fechar o pedido perguntava sempre
      // «descartar?».
      //
      // ── E FALTAVA METADE ──────────────────────────────────────────────────
      //
      // Só o lado do ECRÃ estava aparado. O lado do SERVIDOR entrava tal e
      // qual, portanto um pedido gravado com um espaço no fim do nome — o que
      // acontece a toda a hora a quem cola de um email — dava sempre diferente:
      // `"Maria".trim()` contra `"Maria "`. Abrir a ficha, sem lhe tocar,
      // acendia «Guardar tudo (1)», e a partir daí fechá-la perguntava sempre
      // «descartar?». É o achado F-08 de uma auditoria em produção, e MEDIDO:
      // dos doze feitios de pedido que sondei, sujavam-se estes quatro, e só
      // estes quatro — nome, email, telefone e local com espaço.
      //
      // Aparar os dois lados é o que torna a comparação a mesma pergunta que a
      // gravação faz. Um espaço a mais não é uma alteração dela.
      editLocation.trim() !== (selected.location ?? "").trim() ||
      editNome.trim() !== (selected.name ?? "").trim() ||
      editEmail.trim() !== (selected.email ?? "").trim() ||
      editTelefone.trim() !== (selected.phone ?? "").trim());

  /** O que se escreve e ainda não está igual ao que o servidor tem. */
  const escritoPorGravar =
    !!selected &&
    (editNotes !== (selected.adminNotes ?? "") ||
      (!motivoVaiComADecisao && editLostReason !== (selected.lostReason ?? "")));

  // Does the detail panel have edits not yet saved? Used to warn before
  // switching/closing a quote so work is never silently lost.
  const isDirty = alteracoesPorConfirmar || escritoPorGravar;
  // Latest value mirrored into a ref for listeners bound earlier (e.g. Escape).
  // É o que ainda exige um clique: o que grava sozinho não se «descarta» — está
  // no servidor, ou a caminho dele.
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = alteracoesPorConfirmar;
  }, [alteracoesPorConfirmar]);

  // ── A gravação automática do que se escreve ───────────────────────────────
  //
  // É a MESMA cadeia do estúdio de propostas (ver `useGravacaoAutomatica`): o
  // adiamento, a descarga do que ficou pendente ao fechar ou ao trocar de
  // pedido, o travão de fechar o separador, as repetições, e o indicador que só
  // diz «guardado» depois de o servidor o confirmar. Não há aqui um segundo
  // mecanismo — há este, usado por mais um ecrã.

  /** O pedido aberto, para quem corre fora do desenho. */
  const selectedRef = useRef<Quote | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  /**
   * O que o SERVIDOR tem dos campos que gravam sozinhos.
   *
   * É contra isto que se decide o que enviar. Enviar um campo que ninguém tocou
   * é escrever por cima do que outra pessoa acabou de lá pôr — e gravar sozinho
   * torna esse encontro mais frequente, não menos.
   */
  const escritoNoServidor = useRef<NotasAutomaticas | null>(null);
  /** O pedido cuja linha «Notas internas atualizadas» já foi escrita. O registo
   *  de atividade conta O QUE ACONTECEU, não quantas vezes o temporizador
   *  correu: uma linha por sessão de edição, não uma a cada 800 ms. */
  const registouNotas = useRef<string | null>(null);

  /**
   * A linha de base acompanha o pedido que está aberto — SEMPRE, e não só no
   * `openQuote`.
   *
   * O painel adopta um pedido por mais caminhos do que um: duplicar um cliente,
   * a paleta de comandos, uma acção da lista. Marcar a base num sítio só era
   * deixar esses caminhos com uma gravação automática que não sabe contra o quê
   * comparar — e uma gravação que não sabe o que está no servidor não deve
   * escrever lá nada.
   */
  useEffect(() => {
    if (!selected) {
      escritoNoServidor.current = null;
      return;
    }
    if (escritoNoServidor.current?.id === selected.id) return;
    escritoNoServidor.current = {
      id: selected.id,
      adminNotes: selected.adminNotes ?? "",
      lostReason: selected.lostReason ?? "",
    };
    registouNotas.current = null;
  }, [selected]);

  /**
   * Arruma o pedido que o servidor devolveu.
   *
   * Os campos que ela NÃO tocou passam a mostrar o que o servidor tem — é a
   * forma barata de o painel deixar de ser cego ao que outra pessoa gravou
   * enquanto ele esteve aberto. Os que ela tocou ficam como estão: substituí-los
   * era deitar fora trabalho por causa de uma gravação alheia.
   */
  const absorverDoServidor = useCallback((updated: Quote) => {
    const antes = selectedRef.current;
    setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
    setSelected((prev) => (prev?.id === updated.id ? updated : prev));
    if (!antes || antes.id !== updated.id) return;
    setEditStatus((v) => (v === antes.status ? updated.status : v));
    setEditPrice((v) => (v === textoDoPreco(antes) ? textoDoPreco(updated) : v));
    setEditAssigned((v) => (v === (antes.assignedTo ?? "") ? (updated.assignedTo ?? "") : v));
    setEditDate((v) => (v === (antes.date ?? "") ? (updated.date ?? "") : v));
    setEditGuests((v) => (v === String(antes.guests ?? "") ? String(updated.guests ?? "") : v));
    setEditLocation((v) => (v === (antes.location ?? "") ? (updated.location ?? "") : v));
    setEditNome((v) => (v === (antes.name ?? "") ? (updated.name ?? "") : v));
    setEditEmail((v) => (v === (antes.email ?? "") ? (updated.email ?? "") : v));
    setEditTelefone((v) => (v === (antes.phone ?? "") ? (updated.phone ?? "") : v));
  }, []);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O PEDIDO QUE VOLTOU DE UMA MARCAÇÃO DE DESFECHO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Parece o {@link absorverDoServidor} e não é — e a diferença tem duas
   * razões, uma de conteúdo e outra de forma.
   *
   * ── Conteúdo: aqui a marcação GANHA ────────────────────────────────────
   * O `absorverDoServidor` é conservador de propósito: só acerta os campos que
   * ela NÃO tocou, para uma gravação alheia não lhe apagar trabalho. Uma
   * marcação de desfecho não é alheia — é ela, agora, a confirmar um estado e
   * um valor que acabou de ler no ecrã. Esses dois campos passam a ser o que
   * o servidor gravou, ponto.
   *
   * ── Forma: nada de `ref` ───────────────────────────────────────────────
   * O `absorverDoServidor` lê o `selectedRef` para saber como o pedido estava
   * antes. Passá-lo à fábrica das colunas — que é CHAMADA durante o desenho —
   * fazia a regra `react-hooks` acusar leitura de `ref` no desenho. A regra
   * tem razão na forma (ninguém garante que a fábrica não chama o que recebe),
   * e a saída certa não é calá-la: é este caminho, que lê o `selected` do
   * estado e não de um `ref`.
   *
   * Só mexe no formulário quando o pedido marcado é o que está ABERTO. Sem
   * essa guarda, marcar o casamento da Ana na tabela escrevia o estado dela
   * por cima do formulário do casamento do Rui, aberto ao lado.
   */
  const marcarDesfecho = useCallback(
    (actualizado: Quote) => {
      setQuotes((prev) => prev.map((q) => (q.id === actualizado.id ? actualizado : q)));
      if (selected?.id !== actualizado.id) return;
      setSelected(actualizado);
      setEditStatus(actualizado.status);
      setEditPrice(textoDoPreco(actualizado));
      setEditLostReason(actualizado.lostReason ?? "");
      /**
       * ── O QUE AQUI NÃO SE FAZ, E PORQUÊ ──────────────────────────────────
       * Não se mexe na linha de base da gravação automática
       * (`escritoNoServidor`). Seria uma escrita num `ref` dentro do que a
       * fábrica das colunas recebe, e é exactamente isso que faz a regra
       * `react-hooks` acusar leitura de `ref` no desenho — o preço de a
       * calar seria pior do que o defeito.
       *
       * O que se perde: quando o gesto grava um motivo de perda com o pedido
       * ABERTO, a base fica um passo atrás e a gravação automática reenvia o
       * MESMO motivo uma vez. É um PATCH repetido e idempotente, não uma
       * perda: o `isDirty` não se acende (o campo e o pedido dizem o mesmo) e
       * nada é apagado. Trocar isso pela regra desligada não valia a pena.
       */
    },
    [selected?.id],
  );

  /**
   * Manda ao servidor SÓ o que foi tocado. Uma tentativa — a repetição é do
   * hook.
   */
  const enviarEscrito = useCallback(
    async (v: NotasAutomaticas): Promise<RespostaDoEnvio> => {
      const base = escritoNoServidor.current;
      if (!base || base.id !== v.id) {
        // Sem saber o que está no servidor não se escreve por cima dele às
        // cegas. Não se repete: a resposta seguinte seria a mesma.
        return {
          estado: "falhou",
          porque: "O pedido ainda não foi lido do servidor.",
          definitivo: true,
        };
      }
      const corpo: Record<string, unknown> = {};
      if (v.adminNotes !== base.adminNotes) corpo.adminNotes = v.adminNotes;
      if (v.lostReason !== null && v.lostReason !== base.lostReason) {
        corpo.lostReason = v.lostReason || null;
      }
      // Não há nada por enviar — o clique em «Guardar» chegou primeiro. Está
      // guardado, e dizê-lo é a verdade.
      if (Object.keys(corpo).length === 0) return { estado: "guardado" };

      const primeiraNota = corpo.adminNotes !== undefined && registouNotas.current !== v.id;
      if (primeiraNota) {
        corpo.activityLogAppend = [
          {
            id: randomId(),
            at: new Date().toISOString(),
            kind: "note_added",
            actor: userName,
            summary: "Notas internas atualizadas",
          },
        ];
      }

      const res = await fetchComTecto(`/api/orcamento/${encodeURIComponent(v.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) return respostaDeHttp(res.status, { porque: porqueNaoGravou(res.status) });
      const updated = (await res.json()) as Quote;
      if (primeiraNota) registouNotas.current = v.id;
      escritoNoServidor.current = {
        id: updated.id,
        adminNotes: updated.adminNotes ?? "",
        lostReason: updated.lostReason ?? "",
      };
      absorverDoServidor(updated);
      return { estado: "guardado" };
    },
    [userName, absorverDoServidor],
  );

  /**
   * ── A REDE DE SEGURANÇA DO PAINEL ─────────────────────────────────────────
   *
   * Só duas coisas gravam sozinhas aqui: as notas e o motivo de perda. O preço,
   * a data, os convidados, o local e os contactos só saem deste telemóvel
   * quando ela carrega em «Guardar» — e o travão que existia, um
   * `beforeunload`, é quase decorativo num iPhone: o Safari descarta
   * separadores em segundo plano e não o corre quando o faz.
   *
   * Ver `rascunho-do-pedido.ts` para o porquê de ser cópia LOCAL e não no
   * servidor, e de nunca repor sozinha.
   */
  const camposNoEcra = useMemo<CamposDoPedido>(
    () => ({
      preco: editPrice,
      notas: editNotes,
      // A outra ponta do mesmo campo (ver `camposDoPedido` mais abaixo): o
      // `editStatus` é semeado a partir de `q.status`, que pode não existir.
      estado: editStatus ?? "",
      responsavel: editAssigned,
      motivoDePerda: editLostReason,
      data: editDate,
      convidados: editGuests,
      local: editLocation,
      nome: editNome,
      email: editEmail,
      telefone: editTelefone,
    }),
    [
      editPrice,
      editNotes,
      editStatus,
      editAssigned,
      editLostReason,
      editDate,
      editGuests,
      editLocation,
      editNome,
      editEmail,
      editTelefone,
    ],
  );

  /** O mesmo pedido, como o servidor o tem — para se poder comparar. */
  const camposDoPedido = useCallback(
    (q: Quote): CamposDoPedido => ({
      preco: textoDoPreco(q),
      notas: q.adminNotes ?? "",
      /**
       * `?? ""` como os dez irmãos, e não por simetria: era o ÚNICO campo sem
       * defesa, e um pedido sem `status` fazia o `oQueMudou` chamar `.trim()`
       * sobre `undefined` — dentro de um efeito, portanto o que ela via era o
       * back office inteiro substituído por «Ocorreu um erro inesperado».
       *
       * E pedidos sem `status` existem: o `degrauDoEstado` da máquina de
       * estados di-lo por escrito — «há pedidos gravados antes de metade destes
       * campos existirem», e trata o caso em vez de recusar. Aqui não tratava.
       */
      estado: q.status ?? "",
      responsavel: q.assignedTo ?? "",
      motivoDePerda: q.lostReason ?? "",
      data: q.date ?? "",
      convidados: String(q.guests ?? ""),
      local: q.location ?? "",
      nome: q.name ?? "",
      email: q.email ?? "",
      telefone: q.phone ?? "",
    }),
    [],
  );

  /** O rascunho encontrado ao abrir, à espera de uma decisão dela. */
  const [rascunhoPorRepor, setRascunhoPorRepor] = useState<{
    campos: CamposDoPedido;
    /** Já escrito — «há 12 minutos». Calculado ao ABRIR e não a cada desenho:
     *  no desenho, `new Date()` faz a frase mudar sozinha quando o painel
     *  redesenha por outra razão qualquer, e uma frase que se mexe sem motivo
     *  chama a atenção para o sítio errado. */
    quando: string;
    mudou: (keyof CamposDoPedido)[];
  } | null>(null);

  /**
   * Guarda o que está escrito, com um atraso curto.
   *
   * O atraso não é para poupar escritas — é para não guardar o meio de uma
   * palavra como se fosse uma decisão. E quando o que está no ecrã volta a ser
   * igual ao servidor (gravou, ou ela desfez), a cópia é deitada fora: uma rede
   * de segurança que sobrevive ao perigo passa a ser um aviso falso da próxima
   * vez que se abre o pedido.
   */
  useEffect(() => {
    const q = selected;
    if (!q) return;
    if (oQueMudou(camposNoEcra, camposDoPedido(q)).length === 0) {
      esquecerRascunho(q.id);
      return;
    }
    const t = setTimeout(() => guardarRascunho(q.id, camposNoEcra, new Date().toISOString()), 800);
    return () => clearTimeout(t);
  }, [selected, camposNoEcra, camposDoPedido]);

  /**
   * Repõe o que ficou por gravar — nos campos, e NÃO no servidor.
   *
   * A distinção é o ponto todo: repor escreve no ecrã e deixa-o por gravar, com
   * o botão «Guardar» a acender como acenderia se ela tivesse escrito aquilo
   * agora. Gravar por ela seria decidir por ela, e o rascunho pode ter dias.
   */
  function reporRascunho() {
    const r = rascunhoPorRepor;
    if (!r) return;
    setEditPrice(r.campos.preco);
    setEditNotes(r.campos.notas);
    // O estado é o único campo que não é texto livre. Um valor que já não
    // existe (um separador removido entretanto) fica de fora em silêncio, em
    // vez de pôr o pedido num estado que a aplicação não sabe desenhar.
    if (STATUS_OPTIONS.some((o) => o.id === r.campos.estado)) {
      setEditStatus(r.campos.estado as QuoteStatus);
    }
    setEditAssigned(r.campos.responsavel);
    setEditLostReason(r.campos.motivoDePerda);
    setEditDate(r.campos.data);
    setEditGuests(r.campos.convidados);
    setEditLocation(r.campos.local);
    setEditNome(r.campos.nome);
    setEditEmail(r.campos.email);
    setEditTelefone(r.campos.telefone);
    setRascunhoPorRepor(null);
    toast("Reposto no ecrã. Ainda não está guardado — confirma e carrega em Guardar.", "success");
  }

  function descartarRascunho() {
    if (selected) esquecerRascunho(selected.id);
    setRascunhoPorRepor(null);
  }

  const escritoNoEcra = useMemo<NotasAutomaticas>(
    () => ({
      id: selected?.id ?? "",
      adminNotes: editNotes,
      lostReason: motivoVaiComADecisao ? null : editLostReason,
    }),
    [selected?.id, editNotes, editLostReason, motivoVaiComADecisao],
  );

  const gravacao = useGravacaoAutomatica<NotasAutomaticas>({
    valor: escritoNoEcra,
    enviar: enviarEscrito,
    // Fechado, não há nada para gravar; e a `chave` faz com que fechar ou trocar
    // de pedido descarregue primeiro o que ficou por gravar do anterior.
    activo: !!selected,
    chave: selected?.id ?? null,
    saoIguais: mesmasNotas,
    // Este painel inscreve-se no registo À MÃO, mesmo por baixo. Não é
    // esquecimento: pelo hook entrava só o texto que grava sozinho, e este
    // painel tem também as decisões que continuam a exigir um clique. Duas
    // linhas sobre o mesmo pedido no botão «Guardar tudo» seria ela ter de
    // perceber por que é que o pedido dela aparece duas vezes.
    nome: null,
  });

  /**
   * ── O PAINEL DO PEDIDO NO BOTÃO «GUARDAR TUDO» ────────────────────────────
   *
   * Uma linha só, com o nome por que ela chama ao pedido, e que conta as duas
   * metades do painel: o que se escreve (grava sozinho) e o que é uma decisão
   * (espera por um clique). A segunda metade é a que mais falta fazia aqui — é
   * trabalho feito, à espera de um gesto, e sem isto o gesto único do back
   * office passava-lhe ao lado.
   */
  const nomeNoRegisto = selected ? `Pedido ${selected.id} — ${selected.name}` : "";
  const oRegistoFalaPeloPedido = useInscricaoNoRegisto({
    nome: nomeNoRegisto,
    porGravar: escritoPorGravar || alteracoesPorConfirmar || !!gravacao.naoChegouAoServidor,
    // Calado: quem dá a notícia é a resposta do «Guardar tudo», que fala de
    // todos os ecrãs de uma vez e nomeia cada um.
    gravarJa: () => guardarTudoDoPedido(true),
    activo: !!selected,
  });

  // O travão de fechar o separador vale TAMBÉM para o que ainda exige um
  // clique. (O que grava sozinho já tem o seu, dentro do hook.) Era isto que
  // não existia de todo: escrevia-se, tocava o telefone, fechava-se o
  // separador, e o navegador não perguntava nada.
  //
  // Havendo registo, quem trava é ele — um só travão para o back office
  // inteiro, e que sabe nomear o que se perde. Sem registo, este continua a
  // valer: um travão que desaparecesse em silêncio seria a pior troca possível.
  useTravaoDeSaida(!oRegistoFalaPeloPedido && alteracoesPorConfirmar);

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
  // paint, so the first click on Propostas / Tarefas / Calendário is
  // instant instead of a cold round-trip. Uses the same shared cache the views
  // read from (useCachedList), so a warmed view renders immediately with no
  // skeleton. Cheap + non-blocking; skipped if already cached/in-flight.
  useEffect(() => {
    return onIdle(() => {
      // A lista de propostas vai em modo LEVE (`?semDoc=1`): aquecer a cache
      // não pode custar o documento inteiro de cada proposta — com um ano de
      // trabalho lá dentro são megabytes descarregados a seguir à primeira
      // pintura, para uma vista em que muitas vezes ninguém chega a tocar.
      //
      // Chave PRÓPRIA, e é de propósito: os painéis de Propostas,
      // Acompanhamento e Análise ainda pedem a forma pesada em "propostas", e
      // servir-lhes o que não têm (o `doc`) a partir da cache mostrava-lhes
      // números errados durante uma pintura. Quando passarem a `?semDoc=1`,
      // passam também a esta chave e voltam a aproveitar o aquecimento.
      prefetchList("propostas-leves", "/api/propostas?semDoc=1");
      prefetchList("tarefas", "/api/tarefas");
      prefetchList("calendario", "/api/calendario");
    });
  }, []);

  /**
   * ── A PONTE, E SÓ A PONTE ────────────────────────────────────────────────
   *
   * A secção passou a vir DO SERVIDOR (ver `VIEW_COOKIE`): quando o cookie já
   * existe, o primeiro desenho já é o certo e não há nada a restaurar aqui.
   *
   * O que fica é o caso de quem já tinha uma escolha guardada no
   * `localStorage` e ainda não tem cookie — a primeira visita depois desta
   * alteração. Aí ainda há um salto, uma vez, e a gravação seguinte escreve o
   * cookie que o faz desaparecer para sempre.
   *
   * `vistaInicial` a dizer que já veio decidida é o que impede isto de voltar
   * a pôr o salto no ecrã de quem já não precisa dele.
   */
  useEffect(() => {
    if (vistaInicial) return;
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY) as View | null;
      if (saved && NAV.some((n) => n.id === saved)) setView(saved);
    } catch {
      /* localStorage unavailable — keep default */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    /**
     * E no cookie, que é o que o servidor lê no arranque seguinte. Um ano, o
     * mesmo horizonte do `localStorage`; `SameSite=Lax` porque isto não é uma
     * credencial — é a preferência de que separador abrir — e `Lax` é o que
     * deixa o cookie viajar numa navegação normal sem o oferecer a terceiros.
     * Sem `Secure` escrito à mão: em `localhost` ele impedia a gravação, e em
     * produção o site é servido só por HTTPS.
     */
    try {
      document.cookie = `${VIEW_COOKIE}=${encodeURIComponent(view)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch {
      /* sem cookies: fica o `localStorage`, e volta a haver o salto de uma vez */
    }
  }, [view]);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O BACK OFFICE INTEIRO TINHA UM ENDEREÇO SÓ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Achado F-05 de uma auditoria em produção, e é dos que se sentem todos os
   * dias: Visão Geral, Pedidos, Propostas, Temas, Definições — dezoito secções,
   * e `/orcamento/admin` para todas. Quatro consequências, todas verdadeiras:
   *
   *  · **os favoritos não servem.** Guardar as Propostas guarda a aplicação, e
   *    abrir o favorito leva ao que estivesse aberto da última vez;
   *  · **não se manda um link a ninguém.** «Vê as Definições» é uma frase, não
   *    um endereço;
   *  · **o botão «voltar» sai da aplicação.** Não recua uma secção: sai. Num
   *    telemóvel, onde o gesto de voltar é o mais usado que há, isso quer dizer
   *    que o gesto natural a deita fora do back office;
   *  · **dois separadores em secções diferentes é impossível** — partilham a
   *    memória, e o segundo arrasta o primeiro.
   *
   * ── COMO, E PORQUE É QUE NÃO SÃO ROTAS ────────────────────────────────────
   *
   * `window.history.replaceState` com `?v=<secção>`. É o caminho que o guia de
   * `single-page-applications` do próprio Next descreve para isto — «shallow
   * routing on the client» —, e diz que estas chamadas se integram no Router,
   * portanto o `usePathname`/`useSearchParams` continuam a ver a verdade.
   *
   * Rotas a sério (`/orcamento/admin/pedidos`) dariam um endereço mais bonito e
   * custariam caro: cada troca de secção passava a ser uma navegação do Next,
   * com o `AdminClient` inteiro a remontar — e com ele os pedidos carregados, o
   * pedido aberto, o rascunho por gravar. Trocar de secção é uma coisa que ela
   * faz dezenas de vezes por dia, e é instantânea. Fica assim.
   *
   * ── TRÊS DOS QUATRO, E O QUARTO RECUSADO COM RAZÃO ────────────────────────
   *
   * Dos quatro estragos que a auditoria enumera, este bloco resolve três — os
   * favoritos, o link que se manda a alguém, os dois separadores. O quarto — «o
   * botão voltar sai da aplicação em vez de recuar uma secção» — fica por
   * resolver, DE PROPÓSITO, e vale a pena dizer porquê.
   *
   * O gesto de voltar já tem dono neste back office. O `useCamadaDeHistoria`
   * põe uma ENTRADA MARCADA por cada camada aberta — gaveta, folha, diálogo —
   * para que o deslizar da esquerda no iPhone feche o que está aberto em vez de
   * sair. Foi o primeiro dos oito bloqueios do registo do audit, e o ficheiro
   * dele é uma lista de armadilhas que essa contabilidade tem: uma entrada a
   * mais no sítio errado e uma camada conclui que foi consumida e fecha-se
   * sozinha.
   *
   * Eu escrevi a primeira versão disto com `pushState`, para o «voltar» andar
   * pelas secções. Chumbou três testes do painel de detalhe, e a causa era
   * exactamente essa: as minhas entradas sem marca entravam no meio das
   * marcadas e desalinhavam a contagem. Não é um defeito dos testes — é o
   * mesmo desalinhamento que aconteceria no telemóvel dela, onde o gesto de
   * voltar é o mais usado que há.
   *
   * Dar duas leituras ao mesmo gesto («fecha o que está aberto» E «recua uma
   * secção») era pedir-lhe que adivinhasse qual delas ia acontecer. Fica com a
   * que já tinha, que é a que importa num telemóvel. `replaceState`: o endereço
   * acompanha sempre a secção, e o histórico fica exactamente como estava.
   *
   * ── E O ESTADO QUE JÁ LÁ ESTÁ VIAJA SEMPRE ────────────────────────────────
   *
   * `replaceState(window.history.state, …)` e nunca `null`. `null` APAGA o
   * `history.state`, e com ele a marca da camada aberta — que é, palavra por
   * palavra, o acidente que o `useCamadaDeHistoria` descreve vindo do router do
   * Next: «reescreve o estado do topo e leva a nossa marca com ele».
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get(PARAM_VISTA) === view) return;
      url.searchParams.set(PARAM_VISTA, view);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* sem `history` (embutidos antigos) a aplicação funciona como sempre
         funcionou: o endereço é que deixa de acompanhar. */
    }
  }, [view]);

  /**
   * ── E PORQUE É QUE NÃO HÁ AQUI UM OUVINTE DE `popstate` ───────────────────
   *
   * Havia. Escutava o «voltar» e punha a secção que o endereço passasse a
   * dizer. Saiu, e a razão é a mesma do `replaceState` acima, vista do outro
   * lado: com as secções a substituir e nunca a empilhar, ESTE componente nunca
   * cria uma entrada de história com um `?v=` diferente. Um `popstate` que
   * chegue aqui é sempre de outra pessoa — quase sempre do `useCamadaDeHistoria`
   * a consumir a entrada de uma camada que fechou.
   *
   * E segui-lo tinha custo: o `back()` de limpeza de uma camada é ADIADO (o
   * próprio ficheiro dela conta que já «aterrou a meio do que vinha a seguir»),
   * portanto o ouvinte apanhava um endereço de outro momento e trocava a secção
   * debaixo dos pés de quem estava a trabalhar. Foi o que dois testes do apagar
   * mostraram, com o painel a desaparecer sozinho.
   *
   * O `?v=` é uma PORTA DE ENTRADA — favorito, link, separador novo —, e quem a
   * lê é o servidor, no arranque. Não é uma dimensão do histórico, e fingir que
   * era custava mais do que valia.
   */

  /** A escolha dela sobrevive ao recarregar — é por aparelho, como o resto. */
  useEffect(() => {
    try {
      const cru = localStorage.getItem(CHAVE_MENU_RECOLHIDO);
      if (cru != null) setMenuRecolhido(cru === "1");
    } catch {
      /* sem `localStorage` abre como sempre abriu */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_MENU_RECOLHIDO, menuRecolhido ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [menuRecolhido]);

  /**
   * ENTRAR EM «FAZER PROPOSTA» RECOLHE A BARRA. Uma vez, e não a cada render:
   * o `recolhidoPeloEstudio` é o que faz a abertura à mão sobreviver — sem ele,
   * carregar na cruz para a trazer de volta era ver o ecrã fechá-la outra vez.
   * Sair do estúdio arma-o de novo, e a barra NÃO é reaberta: o que ela escolheu
   * enquanto lá estava é a escolha dela.
   */
  useEffect(() => {
    if (view !== "fazer-proposta") {
      recolhidoPeloEstudio.current = false;
      return;
    }
    if (recolhidoPeloEstudio.current) return;
    recolhidoPeloEstudio.current = true;
    setMenuRecolhido(true);
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

  /**
   * ── UMA JANELA À FRENTE CALA OS ATALHOS DE UMA TECLA ──────────────────────
   *
   * «Está a escrever num campo» não chegava. Com uma destas janelas aberta o
   * foco está quase sempre num BOTÃO — a armadilha de foco leva-o para o «×» de
   * fechar — e um botão não é um campo: o «n» passava, e o «Novo pedido» abria
   * POR BAIXO da janela que ela tinha à frente. O mesmo com o «/» (saltava para
   * os Pedidos) e com o acorde «g»+destino (trocava a vista por trás).
   *
   * A regra é uma só: enquanto houver uma janela à frente, uma tecla solta não
   * muda o que está por trás dela. O Escape não passa por aqui — cada janela é
   * dona do seu, e é assim que continua a fechar-se com uma tecla.
   */
  const janelaAberta = newQuoteOpen || shortcutsOpen || ajudaOpen || restoreOpen;
  const janelaAbertaRef = useRef(false);
  const paletteAbertaRef = useRef(false);
  useEffect(() => {
    janelaAbertaRef.current = janelaAberta;
    paletteAbertaRef.current = paletteOpen;
  }, [janelaAberta, paletteOpen]);

  // Global keyboard shortcuts. ⌘K works anywhere; the rest are ignored while
  // typing so they never fight with form fields.
  useEffect(() => {
    let lastG = 0; // timestamp of the last "g" press, for the "g then key" chord
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // A paleta também não se abre por baixo de outra janela; fechá-la com o
        // mesmo atalho continua a valer, que é o que ⌘K faz quando ela é a que
        // está à frente.
        if (janelaAbertaRef.current) return;
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
      if (janelaAbertaRef.current || paletteAbertaRef.current) return;

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
      }
      // O Escape saiu daqui: com a janela aberta esta linha já não é alcançada
      // (ver a guarda acima) e sem ela não havia nada para fechar. Quem o trata
      // é a própria janela, que é onde ele tem de continuar a valer.
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

  // Lock background scroll while the mobile nav drawer is open. O trinco é o
  // mesmo dos diálogos (`useTrincoDeScroll`), agora num sítio só: era daqui que
  // o padrão vinha, e faltava em dez caixas que também tapam a página.
  useTrincoDeScroll(navOpen);

  /* ── O GESTO DE VOLTAR FECHA O QUE ESTÁ ABERTO ─────────────────────────────
     Do registo do audit, e são dois dos oito bloqueios de uma vez.

     O primeiro: «zero `pushState` em todo o `src/` … no iPhone, deslizar da
     esquerda É o botão de voltar, portanto isto acontece por acidente, a
     qualquer profundidade».

     O segundo: «com um pedido aberto sobra UM alvo de saída no ecrã todo» — o
     «×» do canto superior direito, que é o ponto do ecrã mais longe do polegar.
     A partir daqui o gesto é uma segunda saída, e é a que a mão já faz.

     E o `closeDetail` é o caminho, e não o `setSelected(null)`: é ele que
     pergunta «tem alterações por guardar?». Era esse guarda que o audit dizia
     que nunca chegava a correr. */
  useCamadaDeHistoria(navOpen, () => setNavOpen(false));
  useCamadaDeHistoria(!!selected, () => closeDetail());

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

  /**
   * Mede quanto ECRÃ sobra a partir de onde a coluna de detalhe começa, e é
   * essa a altura dela. Ver a nota do `alturaDoDetalhe`, lá em cima.
   *
   * Mede-se o topo da LINHA da grelha e não o do painel: o painel é `sticky`, e
   * um painel colado ao cabeçalho mentiria sobre onde começa. A linha é
   * estática, portanto `rect.top + scrollY` é sempre o sítio dela no documento
   * — o pior caso, com a página por rolar, que é como ela abre um pedido.
   *
   * Volta a medir quando a janela muda de tamanho e quando alguma caixa acima
   * cresce (a barra de filtros a passar para duas linhas, por exemplo). O
   * `ResizeObserver` também dispara com a mudança que nós próprios fazemos —
   * mas aí o topo é o mesmo, o valor é o mesmo, e o React não volta a desenhar.
   */
  useEffect(() => {
    if (!selected || isDetailOverlay) return;
    if (typeof window === "undefined") return;
    const linha = drawerRef.current?.parentElement;
    if (!linha) return;

    const medir = () => {
      const topo = linha.getBoundingClientRect().top + window.scrollY;
      // A mesma folga de 1rem que o `calc(100vh-7rem)` já reservava no fundo.
      const sobra = Math.round(window.innerHeight - topo - 16);
      // Um chão para janelas muito baixas: mais vale uma coluna curta que rola
      // do que uma coluna de 100 px onde não cabe nada.
      setAlturaDoDetalhe(Math.max(sobra, 320));
    };

    medir();
    window.addEventListener("resize", medir);
    const observador = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    observador?.observe(linha);
    // E a caixa da vista inteira, que é quem muda de altura quando cresce algo
    // ACIMA da grelha — a grelha sozinha não dá por isso.
    if (linha.parentElement) observador?.observe(linha.parentElement);
    return () => {
      window.removeEventListener("resize", medir);
      observador?.disconnect();
    };
  }, [selected, isDetailOverlay, drawerRef]);

  /**
   * ── AS VERSÕES LEVES DAS FOTOGRAFIAS FAZEM-SE ENQUANTO ELA TRABALHA ──────
   *
   * Uma linha aqui porque é aqui que o back office abre, e a lista de
   * fotografias por converter só se limpa se alguém a limpar. O porquê inteiro
   * — os 1099 KB de um original contra os 20 KB de uma miniatura, e as duas
   * únicas portas que isto tinha antes (um botão e as sobras de um cron
   * diário) — está em `varrer-derivadas.ts`.
   *
   * Não pede rede a ela: o trabalho pesado é do servidor, e o que sai daqui é
   * um POST pequeno de cada vez.
   */
  useEffect(() => {
    if (!armazenamentoLigado) return;
    return varrerDerivadasEmFundo();
  }, [armazenamentoLigado]);

  // Lock background scroll while the detail drawer is open as a mobile overlay
  // (mirrors the nav-drawer lock above). The inline xl panel never locks.
  useTrincoDeScroll(!!selected && isDetailOverlay);

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

  /**
   * Devolve true para prosseguir; havendo alterações por confirmar, pergunta.
   *
   * Pergunta só pelo que AINDA EXIGE UM CLIQUE. O que se escreve já não se
   * descarta — está no servidor, ou vai a caminho dele mal este gesto largue o
   * painel (ver a `chave` da gravação automática). Continuar a perguntar por
   * isso era ensinar-lhe que «Descartar» deita fora o que ela escreveu, quando
   * não deita.
   */
  function discardGuard(): boolean {
    if (!alteracoesPorConfirmar) return true;
    return window.confirm("Tem alterações por guardar neste pedido. Descartar?");
  }
  function closeDetail() {
    if (discardGuard()) setSelected(null);
  }

  /**
   * O PEDIDO INTEIRO, ANTES DE O PAINEL ABRIR.
   *
   * A lista chega em resumo (ver `resumirQuote`), sem convidados, checklist,
   * plano de produção nem cronograma. Aqui vai-se buscar o resto — uma vez por
   * pedido e por sessão.
   *
   * Porque é que se ESPERA em vez de mostrar já e completar por trás: o
   * GuestList, o EventChecklist, o ProductionPlan e o EventTimeline copiam a
   * colecção para estado interno no primeiro render (`useState(quote.guestList
   * ?? [])`) e estão presos por `key` ao id do pedido — não voltam a ler a
   * propriedade quando ela mudar. Abertos com o resumo, ficavam com uma lista
   * VAZIA que a primeira edição gravava por cima da verdadeira. A diferença
   * entre esperar e não esperar é um painel que abre um instante mais tarde
   * contra uma lista de 150 convidados apagada sem ninguém dar por isso.
   *
   * Se a ida ao servidor falhar, NÃO se abre com o resumo — devolve-se null e
   * quem chamou avisa. Uma falha visível é melhor do que um painel que parece
   * completo e não está.
   */
  async function comPedidoInteiro(q: Quote): Promise<LeituraDoPedido> {
    if (completos.current.has(q.id)) return { ok: true, quote: q };
    const oQue = `abrir o pedido de ${q.name || "este cliente"}`;
    let res: Response;
    try {
      res = await fetch(`/api/orcamento/${encodeURIComponent(q.id)}`, {
        cache: "no-store",
      });
    } catch {
      return { ok: false, porque: porqueRebentou(oQue).mensagem };
    }
    if (!res.ok) {
      const corpo = await res.json().catch(() => null);
      return { ok: false, porque: porqueFalhou(oQue, res, corpo).mensagem };
    }
    /**
     * SESSÃO EXPIRADA RESPONDE 200. Esta rota é pública — a página de
     * confirmação do casal lê-a — e sem sessão devolve uma lista curta de
     * factos do evento que TAMBÉM tem `id` e TAMBÉM vem com 200. Aceitá-la
     * era abrir o painel sem nome, sem contacto, sem pagamentos e sem
     * convidados, e ainda substituir o pedido na lista por essa versão.
     *
     * O cabeçalho é a única marca fiável de que veio o pedido inteiro; a
     * rota explica porquê. Sem ele, isto é uma falha — e uma falha visível é
     * melhor do que um painel que parece completo e não está.
     */
    if (res.headers.get("x-pedido") !== "completo") {
      // Este 200 não é um 200: é a sessão caída, e dizer «verifica a ligação»
      // sobre ela mandava-a fazer a única coisa que não resolve nada.
      return {
        ok: false,
        porque: `A sessão expirou — não deu para ${oQue}. Volta a entrar e tenta outra vez.`,
      };
    }
    const inteiro = (await res.json().catch(() => null)) as Quote | null;
    if (!inteiro?.id) {
      return { ok: false, porque: `A resposta veio incompleta — não deu para ${oQue}. Repete.` };
    }
    completos.current.add(inteiro.id);
    setQuotes((prev) => prev.map((x) => (x.id === inteiro.id ? inteiro : x)));
    return { ok: true, quote: inteiro };
  }

  /**
   * Voltar a ler o pedido INTEIRO do servidor, ignorando a cache de sessão.
   *
   * O `comPedidoInteiro` guarda o que já leu (`completos`) para não repetir a
   * ida ao servidor a cada abertura. Isso é certo para abrir; é errado depois
   * de uma acção que muda o pedido do lado de LÁ — a geração ao ganhar escreve
   * o plano de montagem e as linhas de sinal e saldo no próprio pedido, e sem
   * esta releitura o painel de Pagamentos ao lado continuava vazio até ela
   * fechar e reabrir a ficha.
   *
   * Melhor esforço: uma leitura que falhe deixa o ecrã como estava. O trabalho
   * foi feito no servidor de qualquer maneira.
   */
  async function recarregarPedido(id: string) {
    const actual = quotes.find((q) => q.id === id);
    if (!actual) return;
    completos.current.delete(id);
    const r = await comPedidoInteiro(actual);
    if (r.ok) absorverDoServidor(r.quote);
  }

  async function openQuote(pedido: Quote) {
    if (!discardGuard()) return;
    // Remember who opened the detail so focus can return there on close.
    if (typeof document !== "undefined") {
      detailOpenerRef.current = document.activeElement as HTMLElement | null;
    }
    // A vista muda JÁ — quem clicou num pedido no Calendário ou no Kanban vê a
    // resposta ao clique no mesmo instante em que a dava antes. O que espera
    // pelo servidor é só o painel de detalhe.
    setView("pedidos");
    /**
     * ══════════════════════════════════════════════════════════════════════
     * ABRIR UM PEDIDO ERA MUDO — SEIS VEZES
     * ══════════════════════════════════════════════════════════════════════
     *
     * Do inventário: **seis portas para abrir um pedido — a lista, o Kanban, o
     * Calendário, os Clientes, o Acompanhamento e a Visão Geral — e todas
     * mudas.** Toca-se, e não acontece nada visível enquanto o servidor não
     * responder. Num 4G de quinta são segundos, e o gesto seguinte é tocar
     * outra vez.
     *
     * O painel espera de propósito e por boa razão (ver `comPedidoInteiro`:
     * abrir com o resumo apagava listas de convidados). O que não pode é
     * esperar em silêncio.
     *
     * As seis portas passam todas por aqui, portanto o aviso escreve-se uma
     * vez. Fica por cima de todas as vistas, ao lado do
     * `AvisoDeArmazenamento` — porque quem tocou pode ter tocado no
     * Calendário, e é lá que ele tem de aparecer.
     */
    setAAbrir({ id: pedido.id, nome: pedido.name || "este pedido" });
    const r = await comPedidoInteiro(pedido);
    setAAbrir(null);
    if (!r.ok) {
      toast(r.porque, "error");
      return;
    }
    const q = r.quote;
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
    setEditPrice(textoDoPreco(q));
    setEditNotes(q.adminNotes ?? "");
    setEditStatus(q.status);
    setEditAssigned(q.assignedTo ?? "");
    setEditLostReason(q.lostReason ?? "");
    setEditDate(q.date ?? "");
    setEditGuests(String(q.guests ?? ""));
    setEditLocation(q.location ?? "");
    setEditNome(q.name ?? "");
    setEditEmail(q.email ?? "");
    setEditTelefone(q.phone ?? "");

    /**
     * O que ficou por gravar da última vez que este pedido esteve aberto.
     *
     * Só se oferece quando é MESMO diferente do que o servidor tem agora: se
     * ela gravou entretanto noutro sítio, ou se os valores calharam iguais,
     * uma barra a perguntar seria ruído — e ruído numa barra destas ensina a
     * carregar em «Descartar» sem ler.
     */
    const ficou = lerRascunho(q.id);
    const diferencas = ficou ? oQueMudou(ficou.campos, camposDoPedido(q)) : [];
    setRascunhoPorRepor(
      ficou && diferencas.length > 0
        ? {
            campos: ficou.campos,
            quando: haQuantoTempo(ficou.em, new Date()),
            mudou: diferencas,
          }
        : null,
    );
    // Open on the tools tab that matches where this pedido is in its lifecycle.
    // Pedido NOVO: os separadores visitados do anterior não valem para este.
    const target = detailNextAction(q).tab;
    abrirPrimeiroDetailTab(target === "gestao" ? "comunicacao" : target);
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
      setEditNome(data.quote.name ?? "");
      setEditEmail(data.quote.email ?? "");
      setEditTelefone(data.quote.phone ?? "");
      // Pedido NOVO (é uma cópia): recomeça os separadores visitados.
      abrirPrimeiroDetailTab("comunicacao");
      toast("Pedido duplicado — define a nova data", "success");
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
        // Em RESUMO, como no primeiro carregamento: isto corre de dois em dois
        // minutos e sem o resumo a lista inteira voltava a descarregar-se aí,
        // deitando fora a poupança da página logo à primeira revalidação.
        const res = await fetch("/api/orcamento?resumo=1", {
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
          // A lista voltou a ser de RESUMOS: o que estava completo já não está.
          // Não limpar isto era o pior dos casos — reabrir um pedido dado como
          // completo montava o painel de convidados sobre uma lista vazia, e a
          // primeira edição gravava-a por cima da verdadeira.
          completos.current.clear();
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

  /**
   * ── SAIR NÃO PERGUNTAVA NADA ──────────────────────────────────────────
   *
   * Nem sequer com trabalho por gravar. Fechar o painel de um pedido pergunta
   * (ver `discardGuard`); sair do back office inteiro — que fecha o painel e
   * mais tudo o resto — não perguntava. Era o buraco maior dos dois, e o mais
   * fácil de encontrar por acidente: o «Sair» está na barra, ao lado de tudo.
   */
  function pedirParaSair() {
    if (isDirty) {
      setASair(true);
      return;
    }
    void sairMesmo();
  }

  async function sairMesmo() {
    setASair(false);
    await fetch("/api/admin/logout", { method: "POST" });
    // Sair é uma decisão, e tem de aguentar a chegada ao ecrã de entrada: sem
    // esta marca, a entrada automática pela passkey voltava a abrir a sessão
    // sozinha (ver `consumirMarcaDeSaida`).
    marcarSaidaDeProposito();
    window.location.href = "/orcamento/admin";
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O HISTÓRICO DEIXA DE SE PERDER EM SILÊNCIO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Isto era `if (res.ok) { … }` sem `else`, e um `catch {}` vazio por baixo.
   * Uma linha de histórico que não chegasse ao servidor desaparecia sem uma
   * palavra — e o histórico é o que se lê meses depois para saber o que se
   * disse a quem.
   *
   * O caso caro é o registo de uma CHAMADA: quem acaba de falar ao telefone
   * escreve o que combinou, a caixa limpa-se como se tivesse gravado, e o que
   * foi escrito não existe em lado nenhum. Ver o `ActivityLog`, que agora só
   * limpa a caixa quando isto devolver `true`.
   *
   * O `oQue` importa aqui mais do que noutros sítios: nas chamadas vindas de um
   * `onSent`, a acção principal JÁ correu bem — a proposta seguiu, a mensagem
   * saiu. A frase tem de dizer que o que falhou foi a linha do histórico, e não
   * o envio.
   */
  async function appendActivity(
    quoteId: string,
    entries: ActivityEntry[],
    oQue = "escrever no histórico",
  ): Promise<boolean> {
    if (entries.length === 0) return true;
    let res: Response;
    try {
      // Só as entradas NOVAS — o servidor junta ao histórico mais recente, para
      // que duas ferramentas a gravar em simultâneo nunca se sobrescrevam.
      res = await fetch(`/api/orcamento/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityLogAppend: entries }),
      });
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return false;
    }
    const corpo = await res.json().catch(() => null);
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
      return false;
    }
    const updated = corpo as Quote | null;
    if (updated?.id) {
      setQuotes((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
    }
    return true;
  }

  /**
   * Confirma o que exige um clique.
   *
   * Devolve se ficou guardado, e sabe estar CALADO: quando é o gesto «Guardar
   * tudo» a chamá-lo, quem dá a notícia é a resposta desse gesto — item a item,
   * com o nome de cada um. Dois recados ao mesmo tempo sobre a mesma gravação
   * seriam ruído, e o recado que sobra é sempre o menos exacto dos dois.
   */
  async function saveChanges(
    opcoes: { silencioso?: boolean } = {},
  ): Promise<{ ok: boolean; porque?: string }> {
    if (!selected) return { ok: true };
    const dizer = (mensagem: string, tipo: "success" | "error") => {
      if (!opcoes.silencioso) toast(mensagem, tipo);
    };
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
      /**
       * Um número que não serve NÃO é uma alteração: fica igual ao que está
       * gravado e, por isso, nem vai no corpo nem se anuncia no registo de
       * atividade. É assim que o email escrito na mesma gravação deixa de ser
       * arrastado abaixo por um sinal a menos — o que se consegue guardar
       * guarda-se, e o que não se consegue fica DITO no campo.
       */
      const newGuests =
        convidadosEscritos.ok && convidadosEscritos.valor !== null
          ? convidadosEscritos.valor
          : selected.guests;
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

      /**
       * O que mudou nos contactos fica no registo, como tudo o resto que se
       * altera à mão. Acrescentar um email é a diferença entre uma proposta que
       * chega e uma que fica gravada sem destinatário — e daqui a três meses
       * ninguém se lembra de quem o acrescentou.
       */
      if (editEmail.trim() !== (selected.email ?? "")) {
        const novo = editEmail.trim();
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "note_added",
          actor: userName,
          summary: novo ? `Email do cliente: ${novo}` : "Email do cliente removido",
        });
      }
      if (editTelefone.trim() !== (selected.phone ?? "")) {
        const novo = editTelefone.trim();
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "note_added",
          actor: userName,
          summary: novo ? `Telefone do cliente: ${novo}` : "Telefone do cliente removido",
        });
      }
      if (editNome.trim() !== (selected.name ?? "") && editNome.trim()) {
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "note_added",
          actor: userName,
          summary: `Nome do cliente: ${selected.name} → ${editNome.trim()}`,
        });
      }

      /**
       * ── SÓ O QUE FOI TOCADO ─────────────────────────────────────────────
       *
       * Isto mandava os oito campos em todas as gravações, com os valores que
       * ESTE ecrã tinha lido ao abrir. Duas pessoas no mesmo pedido escreviam
       * por cima uma da outra sem nunca colidirem: bastava uma delas guardar
       * para os oito campos voltarem ao que ela tinha à frente.
       *
       * Um campo que ninguém tocou não vai. Um campo LIMPO continua a ir (como
       * `null`/`""`, nunca omitido): `undefined` desaparece no JSON e o merge
       * parcial do servidor mantinha o valor antigo — apagar um responsável ou
       * uma data nunca chegava a gravar.
       *
       * E o `status` é o mais importante de todos para não ir por hábito: a
       * rota trata a presença dele como «estado escolhido à mão» e desliga as
       * transições automáticas por causa disso.
       */
      const body: Record<string, unknown> = {};
      if (editStatus !== selected.status) body.status = editStatus;
      if (newPrice !== (selected.quotedPrice ?? undefined)) body.quotedPrice = newPrice ?? null;
      if (editNotes !== (selected.adminNotes ?? "")) body.adminNotes = editNotes;
      if (editAssigned !== (selected.assignedTo ?? "")) {
        body.assignedTo = editAssigned.trim() || null;
      }
      if (editLostReason !== (selected.lostReason ?? "")) {
        body.lostReason = editLostReason.trim() || null;
      }
      if (editDate !== (selected.date ?? "")) body.date = editDate;
      if (newGuests !== selected.guests) body.guests = newGuests;
      if (newLocation !== (selected.location ?? "")) body.location = newLocation;
      // Os contactos vão TRIMADOS e sempre que mudarem — incluindo para vazio:
      // apagar um email errado tem de gravar, e um `undefined` desaparecia no
      // JSON e deixava o antigo no lugar.
      if (editNome.trim() !== (selected.name ?? "")) body.name = editNome.trim();
      if (editEmail.trim() !== (selected.email ?? "")) body.email = editEmail.trim();
      if (editTelefone.trim() !== (selected.phone ?? "")) body.phone = editTelefone.trim();
      if (newEntries.length > 0) {
        // Append server-side (nunca o array completo) — ver appendActivity.
        body.activityLogAppend = newEntries;
      }

      // Nada mudou (o botão foi carregado depois de a gravação automática já ter
      // feito o trabalho). Não se inventa um pedido para não fazer nada.
      if (Object.keys(body).length === 0) {
        // A não ser que o que ela mudou tenha sido justamente o que não serve:
        // aí «já está tudo guardado» seria mentira.
        if (erroDeConvidados) {
          const porque = `Convidados não ficou guardado. ${erroDeConvidados}`;
          dizer(porque, "error");
          return { ok: false, porque };
        }
        dizer("Já está tudo guardado", "success");
        return { ok: true };
      }

      /**
       * ── O MESMO CUIDADO QUE A GRAVAÇÃO AUTOMÁTICA AO LADO ────────────────
       *
       * Este era o caminho MENOS resistente dos dois que vivem neste ficheiro.
       * A gravação automática das notas já usava `fetchComTecto` (tecto de
       * tempo) e `enviarComRepeticao` (três tentativas); o botão «Guardar» —
       * por onde sai o preço, a data, os convidados e os contactos — fazia um
       * `fetch` cru, sem `signal`, sem tecto e sem repetição.
       *
       * Numa quinta com 4G fraco isso não é um pormenor: uma rede que aceita a
       * ligação e nunca responde deixa esse `fetch` pendurado até o Safari
       * desistir sozinho, com o botão eternamente em «a guardar…», e uma única
       * falha de rede devolvia «não foi possível» sem sequer tentar outra vez.
       *
       * A resposta do servidor tem de sair daqui de dentro: o
       * `enviarComRepeticao` devolve se ficou guardado, não o corpo. Daí a
       * variável apanhada no fecho.
       */
      let guardado: Quote | null = null;
      const resultado = await enviarComRepeticao(async () => {
        const res = await fetchComTecto(`/api/orcamento/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          /**
           * O servidor já diz o que está mal — e era essa a frase que se
           * deitava fora, para pôr no lugar «Não foi possível guardar as
           * alterações», que não nomeia o campo nem diz o que fazer. Passa a
           * ser a dele, em português (ver `erro-do-servidor`). Sem corpo
           * aproveitável fica a frase genérica, que pelo menos não inventa uma
           * razão.
           *
           * O `respostaDeHttp` decide também se vale a pena repetir: um 4xx é
           * o pedido que está errado e repeti-lo dá exactamente o mesmo.
           */
          return respostaDeHttp(res.status, {
            porque: (await porqueRecusou(res)) ?? undefined,
          });
        }
        guardado = (await res.json()) as Quote;
        return { estado: "guardado" } satisfies RespostaDoEnvio;
      });
      if (resultado.estado !== "guardado") {
        const porque = resultado.porque
          ? `Não foi guardado. ${resultado.porque}`
          : "Não foi possível guardar. Fica no telemóvel — volta a tentar quando houver rede.";
        dizer(porque, "error");
        return { ok: false, porque };
      }
      // O TypeScript não vê a atribuição que acontece dentro do fecho acima, e
      // por isso continua a achar que isto é `null`. A leitura tem de ser
      // explícita — e a verificação que se segue não é cerimónia: se o servidor
      // respondesse 200 com um corpo ilegível, seguir em frente escrevia
      // `undefined` por cima do pedido que está no ecrã.
      // Chegou ao servidor: a cópia local deixa de ter razão de existir. O
      // efeito acima também a apagaria assim que os campos re-sincronizassem,
      // mas entre uma coisa e outra há uma janela — e uma rede de segurança que
      // sobra é um aviso falso na abertura seguinte.
      esquecerRascunho(selected.id);
      setRascunhoPorRepor(null);
      const updated = guardado as Quote | null;
      if (updated === null) {
        const porque = "Não foi guardado: o servidor respondeu sem o pedido.";
        dizer(porque, "error");
        return { ok: false, porque };
      }
      setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      setSelected(updated);
      // Re-sync EVERY edit field to what the server persisted, so the form can
      // never sit dirty on a value the user did not type (e.g. price formatting).
      setEditStatus(updated.status);
      setEditPrice(textoDoPreco(updated));
      setEditNotes(updated.adminNotes ?? "");
      setEditAssigned(updated.assignedTo ?? "");
      setEditLostReason(updated.lostReason ?? "");
      setEditDate(updated.date ?? "");
      // O campo por corrigir fica COMO ELA O ESCREVEU: substituí-lo pelo valor
      // gravado apagava o que ela acabou de escrever e voltava a esconder o
      // problema — que é o defeito de origem, ao contrário.
      if (!erroDeConvidados) setEditGuests(String(updated.guests ?? ""));
      setEditLocation(updated.location ?? "");
      setEditNome(updated.name ?? "");
      setEditEmail(updated.email ?? "");
      setEditTelefone(updated.phone ?? "");
      // A linha de base da gravação automática move-se com este clique: sem
      // isto, a gravação adiada que estivesse a caminho reenviava o texto que o
      // botão acabou de gravar.
      escritoNoServidor.current = {
        id: updated.id,
        adminNotes: updated.adminNotes ?? "",
        lostReason: updated.lostReason ?? "",
      };
      if (erroDeConvidados) {
        // Guardou-se o que se conseguia guardar, e diz-se o que ficou de fora
        // e porquê. A barra continua em «Alterações por guardar» — porque
        // continua mesmo a haver uma alteração por guardar.
        const porque = `Convidados não ficou guardado. ${erroDeConvidados} O resto das alterações ficou.`;
        dizer(porque, "error");
        return { ok: false, porque };
      }
      dizer("Pedido atualizado", "success");
      return { ok: true };
    } catch {
      const porque = "Não foi possível guardar as alterações";
      dizer(porque, "error");
      return { ok: false, porque };
    } finally {
      setSaving(false);
    }
  }

  /**
   * O painel do pedido inteiro, gravado de uma vez.
   *
   * Faz as duas coisas pela ordem certa: primeiro descarrega o que grava
   * sozinho (é o que ela está a tentar outra vez quando a gravação automática
   * falhou), e só depois confirma o que exige um clique. Ao contrário, o clique
   * gravava o texto e a gravação adiada voltava a mandá-lo a seguir.
   *
   * É esta a função que o botão «Guardar» do painel usa E a que o registo
   * chama quando ela carrega em «Guardar tudo» — o mesmo trabalho pelo mesmo
   * caminho, para os dois gestos não poderem divergir com o tempo.
   *
   * O que devolve não arredonda para melhor: basta uma das metades falhar para
   * a resposta ser «não ficou guardado». Aqui não há cópia local nenhuma — o
   * que não chega ao servidor não existe em mais lado nenhum, e é por isso que
   * o desfecho é `nao-guardado` e não «só neste computador».
   */
  async function guardarTudoDoPedido(silencioso = false): Promise<ResultadoDoEcra> {
    let porque: string | undefined;
    let falhou = false;
    if (gravacao.porGravar || gravacao.naoChegouAoServidor || escritoPorGravar) {
      const r = await gravacao.gravarJa();
      if (r.estado !== "guardado") {
        falhou = true;
        porque = r.porque;
      }
    }
    if (alteracoesPorConfirmar) {
      const r = await saveChanges({ silencioso });
      if (!r.ok) {
        falhou = true;
        // A razão é a do próprio campo — «Convidados não ficou guardado. Não
        // pode ser negativo…». Dizer «o servidor não aceitou as alterações»
        // por cima disso era voltar ao recado que não diz nada.
        porque = porque ?? r.porque ?? "O servidor não aceitou as alterações do pedido.";
      }
    }
    return falhou ? { estado: "nao-guardado", porque } : { estado: "guardado" };
  }

  /** O botão «Guardar» da barra do painel. Fala por si (com `toast`), porque
   *  aqui o gesto é dela e a resposta é sobre este pedido e mais nenhum. */
  function guardarAgora() {
    void guardarTudoDoPedido();
  }

  /**
   * Apply a status to every selected pedido in one go.
   *
   * Os `ids` vêm de fora, e são sempre os que estão À VISTA (ver
   * `seleccionadosAVista`). Lidos daqui de dentro eram a selecção crua — que
   * inclui o que o filtro e a procura tiraram do ecrã.
   */
  async function applyBulkStatus(status: QuoteStatus, ids: string[]) {
    if (ids.length === 0 || bulkBusy) return;
    setLote({ titulo: "A marcar os pedidos…", feito: 0, total: ids.length });
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/orcamento/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
            // A contagem sobe à medida que cada pedido responde — e não há
            // outra maneira de a ter, porque um `Promise.all` puro só fala no
            // fim. Isto é uma nota à passagem: os N pedidos já foram todos
            // lançados na linha acima, continuam a correr ao mesmo tempo, e
            // ninguém espera por ninguém. A espera não atrasa o trabalho.
            .then((v) => {
              contarMaisUmNoLote();
              return v;
            }),
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
      esquecerDaSeleccao(ids);
    } finally {
      setLote(null);
    }
  }

  /** Tira do lote os pedidos sobre que se acabou de agir, e só esses: o resto
   *  da selecção é dela e não se apaga por causa de um gesto sobre outros. */
  function esquecerDaSeleccao(ids: string[]) {
    const feitos = new Set(ids);
    setSelectedIds((prev) => new Set([...prev].filter((id) => !feitos.has(id))));
  }

  // Permanently delete every selected pedido (hard delete, not archive). One
  // confirm covers the whole batch; each id is DELETEd, then the successful
  // ones are dropped from local state and the selection is cleared. Os `ids`
  // são os que estão À VISTA — ver `applyBulkStatus`.
  function deleteSelected(ids: string[]) {
    if (ids.length === 0 || bulkBusy) return;
    // A pergunta NOMEIA-OS. «Apagar 12 pedidos?» é um número que não se
    // consegue verificar: quem o lê não sabe se a selecção é a que pensa que
    // é, e a única maneira de saber era cancelar e contar à mão.
    setAApagarLote(ids);
  }

  /** Os nomes dos pedidos seleccionados, cortados a `NOMES_A_MOSTRAR`. */
  function nomesDoLote(ids: string[] | null): string[] {
    if (!ids || ids.length === 0) return [];
    const porId = new Map(quotes.map((q) => [q.id, q]));
    const nomes = ids.map((id) => porId.get(id)?.name ?? id);
    if (nomes.length <= NOMES_A_MOSTRAR) return nomes;
    return [...nomes.slice(0, NOMES_A_MOSTRAR), `… e mais ${nomes.length - NOMES_A_MOSTRAR}`];
  }

  async function apagarMesmo(ids: string[]) {
    setAApagarLote(null);
    setLote({ titulo: "A apagar os pedidos…", feito: 0, total: ids.length });
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/orcamento/${id}`, { method: "DELETE" })
            .then((r) => (r.ok ? id : null))
            .catch(() => null)
            // Ver `applyBulkStatus`: conta à passagem, sem serializar nada.
            .then((v) => {
              contarMaisUmNoLote();
              return v;
            }),
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
      esquecerDaSeleccao(ids);
    } finally {
      setLote(null);
    }
  }

  const archivedCount = useMemo(() => quotes.filter((q) => q.archived).length, [quotes]);

  /**
   * «Ver os arquivados» — a saída dos vazios da Visão Geral e do Kanban.
   *
   * Os três gestos andam juntos: levar à lista sem destapar os arquivados, ou
   * com um filtro de estado ainda por limpar, dava outra lista vazia — e essa
   * já não tinha saída nenhuma.
   */
  const verArquivados = useCallback(() => {
    setShowArchived(true);
    setFilterStatus("all");
    setView("pedidos");
  }, []);

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

  /**
   * ── A SELECÇÃO SOBRE QUE OS BOTÕES DO LOTE AGEM ───────────────────────────
   *
   * `selectedIds` guarda o que ela marcou; isto é a parte que continua NO ECRÃ
   * depois de o filtro ou a procura terem mudado. A barra do lote contava a
   * selecção crua e as duas acções que mexem (Marcar como, Apagar) corriam-na
   * inteira: marcavam-se três pedidos, escrevia-se um nome na procura para
   * conferir um, e o «Apagar (3)» apagava para sempre dois que já não estavam
   * no ecrã. O número que a barra mostra e o número sobre que os botões agem
   * têm de ser o mesmo.
   *
   * Sobre `filtered` e não sobre `visibleQuotes`: a paginação é só do desenho —
   * «Selecionar todos (N)» já conta a lista filtrada inteira, e cortar aqui
   * pelo que coube na primeira página era um segundo desencontro.
   */
  const seleccionadosAVista = useMemo(
    () => filtered.filter((q) => selectedIds.has(q.id)).map((q) => q.id),
    [filtered, selectedIds],
  );

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
    // O QUE JÁ ESTÁ NA BARRA DE BAIXO NÃO SE REPETE NA GAVETA.
    // A regra e a razão estão em `nav.tsx`, ao lado do `BARRA_INFERIOR`. Aqui
    // faz-se por CSS e não por JavaScript de propósito: a mesma árvore serve a
    // gaveta do telemóvel e a coluna do computador, e no computador — onde não
    // há barra de baixo nenhuma — a lista tem de continuar completa. Uma
    // condição em JS obrigava a saber a largura antes de desenhar, que é
    // exactamente o que dá saltos ao hidratar.
    const soNoComputador = BARRA_INFERIOR.includes(id) ? "hidden lg:flex" : "flex";
    return (
      <button
        key={item.id}
        onClick={() => {
          setView(item.id);
          setNavOpen(false);
        }}
        aria-current={active ? "page" : undefined}
        className={`alvo-toque !justify-start group ${soNoComputador} items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] motion-safe:transition-colors duration-150 ${
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
          <>
            {/* ── O NÚMERO DIZ DE QUE É ────────────────────────────────────
                O contador era lido tal e qual: quem ouve o menu ouvia
                «Pedidos, 4» — e um 4 sozinho tanto pode ser o que falta
                responder como a posição do item na lista. A casa já resolve
                isto assim nos cartões da Visão Geral («Pedidos ativos: 4 —
                ainda em aberto»): a bolha fica decorativa e o nome acessível
                leva a frase inteira.

                E há um efeito lateral que vale por si: o nome do botão passa
                a ser estável. Enquanto o número entrava nele, o botão
                chamava-se «Pedidos» num estúdio sem trabalho e «Pedidos 4»
                num estúdio com trabalho — que é o estado normal. O `smoke`
                do back office procurava-o por «Pedidos» exacto e só falhava
                quando havia dados: um teste que passa no vazio e parte na
                vida real. */}
            <span className="sr-only">, {pendingCount} por responder</span>
            <span
              aria-hidden="true"
              className={`ml-auto min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none tabular-nums ${
                active
                  ? "bg-[var(--bo-accent)] text-white"
                  : "bg-[var(--bo-surface-hover)] text-[var(--bo-text-muted)]"
              }`}
            >
              {pendingCount}
            </span>
          </>
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
    contratos: "Propostas Aceites",
    "modelos-email": "Modelos de email",
  };

  /**
   * O NOME CURTO PARA O TELEMÓVEL — só onde o comprido não cabe.
   *
   * Entre o título e os botões do cabeçalho sobram ~179 px a 375. Dos onze
   * destinos, dez cabem por inteiro; "Organização de propostas" precisa de 240
   * e saía cortado a meio de uma palavra, que é pior do que qualquer abreviação
   * escolhida por alguém.
   *
   * A primeira palavra e não uma sigla: é a palavra que ela acabou de ler no
   * botão da gaveta para chegar aqui, portanto reconhece-se sem esforço. No
   * computador continua o nome inteiro — não é o mesmo título encolhido, é o
   * nome que serve cada sítio.
   *
   * Só entram aqui os que MEDIDAMENTE não cabem. O passeio do telemóvel falha
   * se algum título for cortado, e é essa falha que manda acrescentar uma
   * linha a esta tabela.
   */
  const VIEW_TITLES_CURTOS: Partial<Record<View, string>> = {
    kanban: "Organização",
  };

  const VIEW_SUB: Record<View, string> = {
    // Vazio de propósito: a própria Visão Geral já abre com data + saudação —
    // um eyebrow extra aqui era só mais texto.
    overview: "",
    pedidos: "Pedidos de orçamento recebidos",
    kanban: "Arrasta os pedidos entre fases",
    clientes: "Histórico por cliente",
    calendario: "Os teus eventos no tempo",
    propostas: "Todas as propostas enviadas",
    acompanhamento: "O que está à espera de resposta, por ordem de urgência",
    definicoes: "Os números com que o estúdio faz contas",
    servicos: "As palavras que vão nas propostas, escritas com tempo",
    "fazer-proposta": "Escolhe o cliente e escreve a proposta",
    tarefas: "Organização interna da equipa",
    fornecedores: "Parceiros e contactos",
    inventario: "Adereços e materiais de decoração",
    material: "O que vai nas carrinhas: ferramentas, consumíveis, escadotes",
    temas: "Fotos de inspiração por tema, prontas para as propostas",
    estatisticas: "Métricas e desempenho",
    contratos: "Aceitações de condições e estado de cada contrato",
    "modelos-email": "Emails reutilizáveis da equipa",
  };

  return (
    <>
      {/* Houve aqui um `-mt-24` a cancelar o `pt-24` do `<main>` do cromado do
          sítio — em `className` e não em CSS, porque a versão em CSS dependia
          da classe `admin-mode`, que só entra num efeito, e o salto de 96 px à
          montagem valia 0,128 de CLS medidos.
          Saiu com o cromado: o back office no grupo `(admin)` já não tem
          `pt-24` para cancelar, e o `<main>` que faltava está no layout do
          grupo. Enquanto os dois se cruzaram, a raiz começava a `top: -96px` —
          os primeiros 96 px do back office estavam fora do ecrã. */}
      <div className="min-h-screen bg-[var(--bo-chao)] flex">
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
        {/* Se a sessão cair a meio do trabalho, este painel abre POR CIMA e
            reautentica sem desmontar nada — ver o cabeçalho do ficheiro. Está
            aqui, e não numa vista, para valer no back office inteiro. */}
        <SessaoExpirada />
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
        {/* ── O INVÓLUCRO QUE IMPEDE A PÁGINA DE SE ARRASTAR PARA O LADO ─────
            ESTE É O DEFEITO QUE ELA VIU DUAS VEZES, e que nunca se reproduziu
            aqui. Medido no ecrã dela: a página desliza 261 px para a direita e
            do outro lado fica uma folha branca. A gaveta fechada tem 256 px.

            A gaveta é `position: fixed` e, fechada, vive em `x = -256`. Duas
            consequências que se juntam:

            · A rede de segurança do `globals.css` (`body { overflow-x: clip }`)
              NÃO a alcança. Um elemento `fixed` tem como bloco contentor o
              viewport, e nenhum antepassado o corta — a não ser que esse
              antepassado seja ele próprio o bloco contentor dos fixos, o que
              só acontece com `transform`, `filter` ou `contain`. O `clip` do
              `body` corta tudo menos exactamente isto.

            · O Safari do iPhone conta os elementos `fixed` para a área que se
              pode arrastar. O Chromium não — e é por isso que aqui a página
              mede 390 px em 390 px de ecrã, com zero elementos a passar a
              margem direita, e no telemóvel dela se arrasta 256.

            O invólucro resolve as duas de uma vez: `translateZ(0)` faz dele o
            bloco contentor da gaveta, e aí o `overflow-hidden` já a corta. Fica
            do tamanho exacto do ecrã, portanto não transborda nada.

            `lg:contents` desmonta-o a partir dos 1024 px: sem caixa não há
            transform, não há corte, e a gaveta volta a ser a coluna `sticky` em
            fluxo que era. `pointer-events-none` no invólucro (e `auto` na
            gaveta) porque ele cobre o ecrã todo e não pode comer os toques da
            página por baixo.

            Porque não `hidden` quando fechada, que era mais simples: matava as
            duas animações — a gaveta passava a aparecer e desaparecer de um
            fotograma para o outro. Isto corrige o arrasto e não mexe no que
            já estava bem. */}
        <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden [transform:translateZ(0)] lg:contents">
          <aside
            inert={navEhGaveta && !navOpen}
            className={`pointer-events-auto fixed lg:sticky top-0 z-40 h-screen w-64 shrink-0 bg-[var(--bo-chao)] flex flex-col border-r border-[var(--bo-hairline)] shadow-[var(--bo-sombra-modal)] lg:shadow-none motion-safe:transition-transform duration-300 ${
              navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            } ${
              /* Recolhida, a coluna vale ZERO no computador e o conteúdo passa
                 a ocupar a largura toda. `overflow-hidden` porque o que está lá
                 dentro continua a medir 256 px — não se desmonta, para a
                 abertura seguinte não ter de o montar outra vez. E `border-r-0`
                 porque um risco de 1 px sem nada de um dos lados lê-se como uma
                 coluna vazia. O `transform` desta transição não é o mesmo que o
                 da gaveta: aqui anima-se a LARGURA, que é a única coisa que
                 empurra o conteúdo. */
              menuRecolhido ? "lg:w-0 lg:overflow-hidden lg:border-r-0" : ""
            } motion-safe:lg:transition-[width] motion-safe:lg:duration-200`}
          >
            {/* A CRUZ DO COMPUTADOR — recolhe a coluna e devolve os 256 px ao
                trabalho. É irmã da de baixo, não a mesma: aquela fecha a GAVETA
                do telemóvel (um estado que se perde ao sair), esta recolhe uma
                COLUNA (um estado que fica). Por isso são dois botões, cada um
                visível exactamente onde o seu estado existe. */}
            <button
              className="hidden lg:flex absolute top-3 right-3 w-11 h-11 items-center justify-center text-[var(--bo-text-faint)] hover:text-[var(--bo-text)] rounded-lg hover:bg-[var(--bo-surface-hover)] transition-colors"
              onClick={() => setMenuRecolhido(true)}
              aria-label="Recolher o menu"
              title="Recolher o menu"
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

              {/* "Mais" — secondary destinations, collapsed by default.
                NO TELEMÓVEL NÃO SE DOBRA. Ali esta gaveta já É "o resto" (os
                quatro do dia estão na barra de baixo), portanto uma dobra
                chamada "Mais" dentro de um menu que se abriu para ver mais era
                a terceira camada da mesma escolha — e, fechada, deixava a
                gaveta com dois destinos à vista num ecrã inteiro.
                Na coluna do computador a lista está completa e a dobra continua
                a fazer o seu trabalho: manter a vista curta. */}
              {(() => {
                const activeInMore = MORE_NAV.includes(view);
                const expanded = moreNavOpen || activeInMore;
                return (
                  <div className="mt-3 pt-3 border-t border-[var(--bo-hairline)] flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setMoreNavOpen((o) => !o)}
                      aria-expanded={expanded}
                      className="alvo-toque !justify-start group hidden lg:flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-normal text-[var(--bo-text-muted)] hover:bg-[var(--bo-surface-hover)] hover:text-[var(--bo-text)] motion-safe:transition-colors duration-150"
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
                    {/* Sempre no DOM, e sempre visível no telemóvel; no
                      computador é a dobra que decide. */}
                    <div className={`flex flex-col gap-1 ${expanded ? "" : "lg:hidden"}`}>
                      {MORE_NAV.map(renderNavItem)}
                    </div>
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
              {/* A AJUDA MUDA-SE PARA AQUI NO TELEMÓVEL.
                Estava na barra de topo, e um botão de 40 px mais o seu espaço
                custavam 50 dos ~110 px que sobravam para o título — que por
                isso saía "Visão…". Aqui é o sítio dela: é uma coisa que se lê
                uma vez, ao lado do backup e da sessão, e não uma acção da
                vista. No computador continua no topo, onde há espaço. */}
              <button
                onClick={() => setAjudaOpen(true)}
                className="alvo-toque lg:hidden w-full flex items-center justify-center gap-1.5 py-2 mb-1 text-[var(--bo-text-faint)] text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-[var(--bo-text)] hover:bg-[var(--bo-surface-hover)] transition-colors"
              >
                <svg
                  width="11"
                  height="11"
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
                Ajuda e glossário
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
                    <path
                      d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12"
                      strokeLinecap="round"
                    />
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
                  onClick={pedirParaSair}
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
        </div>

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
          // Duas navegações no mesmo ecrã precisam de dois nomes: sem isto,
          // um leitor de ecrã anuncia "navegação" duas vezes e não há como
          // saber qual é qual — nem para quem ouve, nem para um teste.
          aria-label="Destinos principais"
          className={`lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--bo-surface)] border-t border-[var(--bo-hairline)] motion-safe:transition-transform motion-safe:duration-300 ${
            selected ? "translate-y-full" : "translate-y-0"
          }`}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* OS QUATRO DO DIA, MAIS O ABRIDOR DA GAVETA.
              Estavam aqui três destinos repetidos da gaveta e um "Mais" que
              abria a mesma gaveta que o hambúrguer do cabeçalho já abria — dois
              abridores em cantos opostos. A regra que ficou é outra: os quatro
              destinos do dia vivem SÓ aqui, o resto vive SÓ na gaveta (a lista
              e a razão estão em `nav.tsx`), e há **um** abridor de cada vez.

              O abridor voltou para aqui, e não para o canto superior esquerdo,
              por uma razão de mão: o polegar de quem segura o telemóvel chega
              ao fundo do ecrã e não chega ao topo do lado oposto. Como o
              Calendário, as Tarefas e os Temas passaram todos a viver na
              gaveta, obrigá-la a esticar-se até ao canto para lá chegar era
              trocar uma duplicação por um mau alcance.

              Não voltam a ser dois: o hambúrguer do cabeçalho só aparece
              quando ESTA barra não está — ver lá em cima. */}
          <div className="flex items-stretch">
            {BARRA_INFERIOR.map((id) => {
              const navItem = NAV.find((n) => n.id === id)!;
              const isActive = view === id;
              return (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 min-h-[var(--bo-barra-inferior)] transition-colors ${
                    isActive ? "text-[var(--bo-accent)]" : "text-[var(--bo-text-faint)]"
                  }`}
                >
                  {id === "pedidos" && pendingCount > 0 && (
                    <span className="absolute top-2.5 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-[var(--bo-accent)]" />
                  )}
                  <span
                    className={`motion-safe:transition-transform motion-safe:duration-150 ${isActive ? "scale-110" : ""}`}
                  >
                    {navItem.icon}
                  </span>
                  {/* `text-center` e `leading-tight`: com cinco células cada
                      uma fica com 75 px, e "Fazer proposta" precisa de partir
                      em duas linhas em vez de ser cortado a meio. 75 px continua
                      bem acima dos 44 do alvo mínimo.

                      DUAS LINHAS RESERVADAS EM TODAS AS CÉLULAS (`min-h-[2.2em]`),
                      e não só na que parte. Sem isso, a célula mais alta empurra
                      o seu ícone para cima e os cinco ícones da barra deixam de
                      estar à mesma altura — lê-se como um desalinhamento, que é
                      exactamente a queixa que trouxe este trabalho. Reservar o
                      espaço em todas custa uns píxeis e devolve a linha direita. */}
                  <span className="text-[8px] tracking-wide uppercase font-medium leading-tight text-center min-h-[2.2em] flex items-start justify-center">
                    {navItem.label}
                  </span>
                </button>
              );
            })}
            {/* O ABRIDOR DA GAVETA, ao alcance do polegar. Não é um destino —
                é a porta para os que não cabem aqui. */}
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Mais destinos"
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 min-h-[var(--bo-barra-inferior)] transition-colors ${
                !BARRA_INFERIOR.includes(view)
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
              {/* A mesma reserva de duas linhas das outras cinco células: esta
                  é a sexta da mesma barra e tem de alinhar com elas. */}
              <span className="text-[8px] tracking-wide uppercase font-medium leading-tight text-center min-h-[2.2em] flex items-start justify-center">
                Mais
              </span>
            </button>
          </div>
        </nav>

        {/* ── Main ── */}
        {/* Bottom padding clears the real mobile nav height + the notch
            safe-area inset, so the last row never hides under the tab bar.
            A altura vem do token `--bo-barra-inferior` e não de um número
            copiado: eram dois «56px» em ficheiros diferentes, e discordaram
            assim que os rótulos da barra subiram ao chão de 12 px (a barra
            passou a 71, o conteúdo continuou a guardar 56). Ver
            `barra-inferior.test.tsx`. */}
        <div className="flex-1 min-w-0 flex flex-col pb-[calc(var(--bo-barra-inferior)+env(safe-area-inset-bottom))] lg:pb-0">
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
              que fazia "Escolhe o cliente e escreve a proposta" aparecer por
              cima do título.

              O fundo passa a OPACO pela mesma razão: 5% de transparência num
              ecrã com texto escuro por baixo chega para o tornar ilegível, e
              aqui não há nada a ganhar com o efeito. */}
          {/* O CABEÇALHO ENCOLHE ASSIM QUE ELA COMEÇA A DESCER.
              Media 102 px num ecrã de 667. Com os 56 da barra de baixo, eram
              158 px de moldura — quase um quarto do telemóvel — ocupados para
              sempre por uma coisa que só se lê uma vez: o nome da vista.
              A partir daqui fica a faixa com os botões, que é o que serve para
              alguma coisa a meio de uma lista. No computador não encolhe nada:
              lá o espaço não é o problema. */}
          {/* ── O FIO DO CABEÇALHO SÓ APARECE QUANDO HÁ COISA POR CIMA ──────
              Da análise do site que ela mandou: lá o cabeçalho começa sem
              moldura e ganha-a ao rolar. A razão é boa e aqui é ainda melhor,
              porque o chão do painel passou a branco: no topo, um cabeçalho
              branco com um risco por baixo desenha uma linha a separar o nada.
              O fio passa a dizer uma coisa — «há conteúdo escondido acima» — em
              vez de estar sempre lá.

              O `border-b` FICA sempre; o que muda é a cor. Ligar e desligar a
              moldura mudava a altura do cabeçalho em 1 px a cada rolagem, e um
              salto de um pixel numa lista é pior do que um risco a mais.

              O gatilho é o `desceu` que já existe para o cabeçalho encolher —
              com a histerese dele (desce aos 24, volta aos 8), que evita o
              tremor de quem pára o dedo em cima do limiar. Nenhum ouvinte
              novo. */}
          <header
            className={`sticky top-0 z-30 bg-[var(--bo-surface,#ffffff)] border-b pt-safe motion-safe:transition-colors duration-150 ${
              desceu ? "border-[var(--bo-hairline)]" : "border-transparent"
            }`}
          >
            <div
              className={`mx-auto flex w-full max-w-[1600px] items-center gap-3 sm:gap-4 px-4 sm:px-6 lg:px-10 lg:py-5 motion-safe:transition-[padding] duration-200 ${
                desceu ? "py-1.5" : "py-2.5"
              }`}
            >
              {/* O SUPLENTE, e só suplente.
                  O abridor da gaveta vive na barra de baixo, ao alcance do
                  polegar. Só que essa barra desaparece enquanto uma proposta
                  está aberta em detalhe — e uma navegação que às vezes não
                  está lá não pode ser a única.
                  Por isso este aparece exactamente quando a outra sai, e nunca
                  ao mesmo tempo: continua a haver UM abridor de cada vez, que
                  é a regra que esta arrumação existe para cumprir. */}
              {/* ── E A PORTA DE VOLTA ────────────────────────────────────
                  Uma coluna que se recolhe e não se pode trazer de volta é uma
                  coluna que se perde. Este botão existe EXACTAMENTE enquanto ela
                  está recolhida e só no computador — que é onde o estado existe.
                  No telemóvel a barra nunca foi uma coluna, e quem abre a gaveta
                  é a barra de baixo. */}
              {menuRecolhido && (
                <button
                  onClick={() => setMenuRecolhido(false)}
                  aria-label="Mostrar o menu"
                  title="Mostrar o menu"
                  className="hidden lg:flex -ml-1 h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--bo-text-muted)] hover:bg-[var(--bo-surface-hover)] hover:text-[var(--bo-text)] transition-colors"
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
              )}
              {selected && (
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
              )}
              <div className="min-w-0">
                {/* O SUBTÍTULO NÃO VAI PARA O TELEMÓVEL.
                    "Pedidos de orçamento recebidos" por cima de "Pedidos" diz,
                    com 9 px e um espaçamento de 0.35em, o que o título já diz —
                    e custava 25 px de altura fixa. No computador, onde há
                    espaço de sobra numa faixa que já existe, continua a dar
                    contexto. */}
                {VIEW_SUB[view] && (
                  <p className="hidden lg:block text-foreground/35 text-[9px] tracking-[0.35em] uppercase mb-1.5 font-medium">
                    {VIEW_SUB[view]}
                  </p>
                )}
                {/* `truncate`: o título partia em duas linhas ("Visão / Geral")
                    porque no telemóvel sobram-lhe ~110 px entre o menu e os
                    quatro botões. Duas linhas de título é o dobro da altura
                    para a mesma palavra. Uma linha, e o que não couber corta —
                    o nome da vista está sempre também na barra de baixo ou na
                    gaveta de onde se veio. */}
                <h1
                  className="text-[var(--bo-text)] font-medium leading-none truncate motion-safe:transition-[font-size] duration-200"
                  style={{
                    fontFamily: "var(--font-display)",
                    letterSpacing: "var(--bo-tracking-display)",
                    // A meio de uma lista o título é o que menos falta faz —
                    // por isso é ele que encolhe primeiro.
                    fontSize: desceu ? "clamp(16px, 2.6vw, 30px)" : "clamp(19px, 2.6vw, 30px)",
                  }}
                >
                  {/* Um só `<h1>`, com o texto a mudar por CSS. Dois `<h1>`
                      irmãos dariam dois títulos de nível 1 na mesma página, e
                      um leitor de ecrã anunciava ambos. */}
                  {VIEW_TITLES_CURTOS[view] ? (
                    <>
                      <span className="lg:hidden">{VIEW_TITLES_CURTOS[view]}</span>
                      <span className="hidden lg:inline">{VIEW_TITLES[view]}</span>
                    </>
                  ) : (
                    VIEW_TITLES[view]
                  )}
                </h1>
              </div>
              <div className="ml-auto flex items-center gap-1.5 pointer-coarse:gap-2.5 sm:gap-2 shrink-0">
                <button
                  onClick={() => setAjudaOpen(true)}
                  aria-label="Ajuda e glossário"
                  title="Ajuda e glossário"
                  // No telemóvel vive na gaveta (ver lá o porquê): aqui os
                  // 50 px que ocupava eram quase metade do que sobrava para o
                  // título da vista.
                  className="alvo-toque hidden lg:flex w-10 h-10 items-center justify-center text-foreground/30 rounded-lg hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-text-muted)] transition-colors"
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
                {/* ── O GESTO QUE GRAVA TUDO ──────────────────────────────
                    Vive aqui, no cabeçalho, porque é o único sítio que está
                    sempre à vista seja qual for a vista aberta — e o que ele
                    diz («2 por gravar» ou «Tudo guardado») tem de valer antes
                    de se carregar nele. Um botão de guardar que só fala depois
                    do clique obriga a carregar nele para saber se era preciso.
                    Fica ANTES da campainha e da pesquisa: entre saber se o
                    trabalho está guardado e ver notificações, a pergunta que se
                    faz de portátil na mão é a primeira. */}
                <BotaoGuardarTudo />
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
                    className="alvo-toque flex items-center gap-2 px-4 py-2 bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase rounded-full hover:bg-[#2a3227] transition-colors "
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

          {/* ── O ARMAZENAMENTO, ANTES DE SE COMEÇAR A TRABALHAR ─────────────
              Uma colaboradora montou uma proposta inteira — fotos, mood boards,
              textos — numa instalação onde a tabela dos rascunhos não existia.
              O sistema dizia «Guardado» e não estava a guardar nada. Isto é a
              mesma verdade dita à ABERTURA, enquanto ainda dá para não começar.

              Aqui e num sítio só: fica por baixo da navegação e por cima de
              todas as vistas, portanto vê-se em qualquer separador sem ter de
              ser repetido dentro de cada um. Quase nunca aparece — só quando o
              servidor diz que há mesmo alguma coisa errada. Ver o cabeçalho do
              componente. */}
          <AvisoDeArmazenamento />

          {/* ── AS PERGUNTAS DESTRUTIVAS ────────────────────────────────────
              Aqui e não junto de cada botão: as três podem ser disparadas de
              sítios diferentes (o menu do detalhe, a barra do lote, a
              navegação) e uma caixa modal não pertence a nenhum deles. */}
          <PerguntaDestrutiva
            aberto={aApagar !== null}
            onFechar={() => setAApagar(null)}
            titulo={`Apagar o pedido de ${aApagar?.name ?? ""}?`}
            oQueSePerde={oQueSePerdeComOPedido(aApagar)}
            aviso="Não pode ser anulado. Para o tirar da lista sem o apagar, usa «Arquivar»."
            rotuloConfirmar="Apagar o pedido"
            onConfirmar={async () => {
              const alvo = aApagar;
              if (!alvo) return;
              const oQue = `apagar o pedido de ${alvo.name}`;
              let res: Response;
              try {
                res = await fetch(`/api/orcamento/${alvo.id}`, { method: "DELETE" });
              } catch {
                toast(porqueRebentou(oQue).mensagem, "error");
                return;
              }
              if (!res.ok) {
                const corpo = await res.json().catch(() => null);
                toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
                return;
              }
              setQuotes((prev) => prev.filter((q) => q.id !== alvo.id));
              setSelected(null);
              setAApagar(null);
              toast(`Pedido de ${alvo.name} apagado`, "success");
            }}
          />

          <PerguntaDestrutiva
            aberto={aApagarLote !== null}
            onFechar={() => setAApagarLote(null)}
            titulo={`Apagar ${aApagarLote?.length ?? 0} pedido${
              (aApagarLote?.length ?? 0) === 1 ? "" : "s"
            }?`}
            /* Os NOMES, e não só a conta. Quem lê «12 pedidos» não tem como
               saber se a selecção é a que pensa que é — e a única maneira de
               confirmar era cancelar e contar à mão. */
            oQueSePerde={nomesDoLote(aApagarLote)}
            aviso="Não pode ser anulado."
            rotuloConfirmar={`Apagar ${aApagarLote?.length ?? 0} pedido${
              (aApagarLote?.length ?? 0) === 1 ? "" : "s"
            }`}
            onConfirmar={() => apagarMesmo(aApagarLote ?? [])}
          />

          <PerguntaDestrutiva
            aberto={aSair}
            onFechar={() => setASair(false)}
            titulo="Sair com alterações por guardar?"
            oQueSePerde={[
              <>
                O que está no painel de <strong>{selected?.name ?? "um pedido"}</strong> e ainda não
                foi confirmado.
              </>,
            ]}
            aviso="Fechar o painel primeiro guarda-as."
            rotuloConfirmar="Sair mesmo assim"
            onConfirmar={sairMesmo}
          />

          {/* A espera de abrir um pedido, aqui pelo mesmo motivo que o aviso
              acima: as seis portas que abrem um pedido estão espalhadas por
              cinco vistas, e o sinal tem de aparecer naquela em que o dedo
              tocou. */}
          {aAbrir && (
            <EmCurso
              className="mb-4"
              titulo={`A abrir o pedido de ${aAbrir.nome}`}
              estimadoMs={1200}
              nota="Vai buscar os convidados, a checklist e o cronograma — é o que falta ao resumo da lista."
              notaDemorada="A ligação está lenta. Podes esperar, ou voltar atrás e tentar daqui a pouco."
            />
          )}

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
                // Marcar «Ganho» na lista «à espera de resposta» da Visão Geral
                // grava no servidor; sem isto, a lista continuava a mostrar o
                // pedido pendurado e o ecrã ficava a dizer o contrário.
                onQuoteAtualizado={marcarDesfecho}
                falhaDeLeitura={quotes.length === 0 ? falhaDosPedidos : null}
                aoTentarDeNovo={() => void revalidarPedidos()}
                arquivados={archivedCount}
                onVerArquivados={verArquivados}
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
                falhaDeLeitura={quotes.length === 0 ? falhaDosPedidos : null}
                aoTentarDeNovo={() => void revalidarPedidos()}
                onNovoPedido={() => setNewQuoteOpen(true)}
                arquivados={archivedCount}
                onVerArquivados={verArquivados}
              />
            </div>
          )}

          {/* ── Clientes ── */}
          {view === "clientes" && (
            <div className={`${VIEW_WRAP} view-in`}>
              <Clientes
                quotes={activeQuotes}
                onOpen={openQuote}
                /* Só quando a lista está mesmo vazia: com pedidos no ecrã, uma
                   falha da leitura INICIAL já não é o que se está a ver. */
                falhaDeLeitura={quotes.length === 0 ? falhaDosPedidos : null}
                aoTentarDeNovo={() => void revalidarPedidos()}
              />
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
                  // A MESMA guarda de id das duas linhas de cima. Sem ela, o
                  // estúdio a gravar o preço do pedido B escrevia-o no campo do
                  // pedido A que está aberto no painel — e o «Guardar tudo» do
                  // cabeçalho mandava-o para A.
                  if (q.id === selectedRef.current?.id) setEditPrice(textoDoPreco(q));
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
                userName={userName}
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
              <Acompanhamento
                quotes={quotes}
                onOpenQuote={openQuote}
                onFazerProposta={() => setView("fazer-proposta")}
                onQuoteAtualizado={(q) => {
                  setQuotes((prev) => prev.map((x) => (x.id === q.id ? q : x)));
                  setSelected((prev) => (prev?.id === q.id ? q : prev));
                }}
              />
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
              {/* Os casamentos fechados que têm de voltar à Meta. Vive aqui e
                  não nas Definições porque é uma leitura de desempenho, e
                  porque é neste ecrã que ela olha para o que a publicidade
                  trouxe — ver o cabeçalho de `FechosMeta`. */}
              <div className="mt-4 sm:mt-6">
                <FechosMeta />
              </div>
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
            {/* ── OS CONTROLOS, E O ECRÃ QUE ELES COMIAM ───────────────────
                Medido a 390×844: o primeiro cartão de pedido começava a 436 px.
                Metade do telemóvel gasta em controlos antes de se ver aquilo a
                que se veio — quatro filtros de larguras diferentes em três filas
                irregulares.

                A procura fica à vista, porque essa usa-se em todas as sessões.
                O resto recolhe atrás de um botão que diz QUANTOS estão activos.
                A partir de `lg` o painel é sempre visível e o botão desaparece:
                no computador há largura para tudo numa fila, e era assim que já
                estava. */}
            <div
              style={{ "--cena": 0 } as React.CSSProperties}
              className="bo-cena flex flex-col lg:flex-row lg:items-center gap-2.5 sm:gap-3 mb-2.5 sm:mb-4 lg:mb-6"
            >
              <div className="flex items-center gap-2 lg:flex-1 lg:max-w-md">
                <div className="relative flex-1">
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
                    /* ── O QUE ESTE CAMPO DIZIA, E O QUE CABIA ─────────────
                       Era «Procurar por nome, email, local, ID…  ( / )», e a
                       390 px aparecia cortado a meio, a acabar em «( /» — uma
                       dica de atalho de TECLADO, num aparelho onde não há tecla
                       nenhuma para carregar. Um rótulo cortado não ensina nada;
                       ensina que a página está partida.
                       A dica passa para um `kbd` que só existe onde há teclado,
                       e o texto encolhe até caber ao lado do «Filtros». O que
                       se pode procurar continua dito por inteiro no
                       `aria-label`, que é quem serve o leitor de ecrã. */
                    placeholder="Procurar pedidos…"
                    className="w-full bg-white border border-[var(--bo-hairline)] rounded-xl pl-10 pr-3 py-2.5 text-sm text-[var(--bo-tinta-72)] placeholder-foreground/22 focus:outline-none focus:border-foreground/25 transition-colors"
                  />
                  <kbd className="pointer-coarse:hidden absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--bo-hairline-strong)] px-1.5 py-0.5 text-[10px] text-[var(--bo-text-faint)] lg:block">
                    /
                  </kbd>
                </div>
                {/* O ABRIDOR. `lg:hidden` porque no computador o painel está
                    sempre aberto e um botão que não faz nada é ruído. */}
                <button
                  type="button"
                  onClick={() => setFiltrosAbertos((v) => !v)}
                  aria-expanded={filtrosAbertos}
                  aria-controls="painel-filtros-pedidos"
                  className={`alvo-toque lg:hidden shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] font-medium transition-colors ${
                    filtrosActivos > 0
                      ? "bg-[#4d6350] border-[#4d6350] text-white"
                      : "bg-white border-[var(--bo-hairline)] text-[var(--bo-text-muted)]"
                  }`}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M3 5h18M6 12h12M10 19h4" />
                  </svg>
                  Filtros
                  {filtrosActivos > 0 && (
                    <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-white/25 px-1 text-[12px] font-semibold">
                      {filtrosActivos}
                    </span>
                  )}
                </button>
              </div>
              <div
                id="painel-filtros-pedidos"
                role="group"
                aria-label="Filtros dos pedidos"
                /* `hidden` a sério, e não `opacity-0`: fechado, também não se
                   percorre com o teclado nem com o leitor de ecrã. */
                className={`${filtrosAbertos ? "grid" : "hidden"} grid-cols-2 gap-2 lg:flex lg:flex-wrap`}
              >
                <button
                  onClick={() => setMineOnly((v) => !v)}
                  title={`Mostrar apenas pedidos atribuídos a ${userName}`}
                  className={`alvo-toque flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs border transition-all ${
                    mineOnly
                      ? "bg-[#4d6350] border-[#4d6350] text-white"
                      : "bg-white border-[var(--bo-hairline)] text-foreground/45 hover:text-[var(--bo-text-muted)]"
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
                  className="bg-white border border-[var(--bo-hairline)] rounded-xl px-3 py-2.5 text-xs text-[var(--bo-tinta-72)] focus:outline-none focus:border-foreground/25 "
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
                  className="bg-white border border-[var(--bo-hairline)] rounded-xl px-3 py-2.5 text-xs text-[var(--bo-tinta-72)] focus:outline-none focus:border-foreground/25 "
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
                    className="bg-white border border-[var(--bo-hairline)] rounded-xl px-3 py-2.5 text-xs text-[var(--bo-tinta-72)] focus:outline-none focus:border-foreground/25 "
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
                    className="bg-white border border-[var(--bo-hairline)] rounded-xl px-3 py-2.5 text-xs text-[var(--bo-tinta-72)] focus:outline-none focus:border-foreground/25 "
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
                    className="bg-white border border-[var(--bo-hairline)] rounded-xl px-3 py-2.5 text-xs text-[var(--bo-tinta-72)] focus:outline-none focus:border-foreground/25 "
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
                  /* `col-span-2` no telemóvel: «Quem espera há mais tempo» não
                     cabe em meia largura, e um selector com o rótulo cortado
                     não diz por que ordem a lista está. */
                  className="col-span-2 flex-1 lg:flex-none bg-white border border-[var(--bo-hairline)] rounded-xl px-3 py-2.5 text-xs text-[var(--bo-tinta-72)] focus:outline-none focus:border-foreground/25 "
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
                  className="alvo-toque flex items-center gap-2 px-3 py-2.5 bg-white border border-[var(--bo-hairline)] text-foreground/40 text-[10px] tracking-[0.12em] uppercase rounded-xl hover:text-[var(--bo-text-muted)] transition-colors whitespace-nowrap"
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

            {/* ── AS PASTILHAS DE ESTADO ───────────────────────────────────
                Estas NÃO recolhem com as outras, e a diferença é de uso: são a
                triagem («o que é novo? o que está à espera de resposta?»), não
                um filtro de ocasião. Recolhê-las era esconder o gesto mais
                repetido do ecrã.

                O que muda é a forma: eram seis pastilhas a quebrar em duas
                linhas (mais de 70 px), passam a UMA fila que se arrasta com o
                polegar. Um contentor com scroll próprio é, aliás, a única
                maneira de sair da margem que a auditoria de toque aceita — ver
                `temScrollProprio` em `ergonomia-tactil.mjs`.

                `py-1` não é enfeite: `overflow-x` recorta também na vertical, e
                sem essa folga o anel de foco das pastilhas ficava cortado. */}
            <div
              style={{ "--cena": 1 } as React.CSSProperties}
              className="bo-cena flex flex-nowrap lg:flex-wrap overflow-x-auto lg:overflow-visible gap-1.5 py-1 mb-3 sm:mb-5 lg:mb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {!showArchived && (
                <>
                  <button
                    onClick={() => setFilterStatus("all")}
                    className={`alvo-toque shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${filterStatus === "all" ? "bg-[#1b2119] text-white " : "bg-[var(--bo-tinta-6)] text-foreground/40 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-text-muted)]"}`}
                  >
                    Todos · {statusCounts.activeTotal}
                  </button>
                  {STATUS_OPTIONS.map((s) => {
                    const count = statusCounts.counts[s.id] ?? 0;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setFilterStatus(s.id)}
                        className={`alvo-toque shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${filterStatus === s.id ? "bg-[#1b2119] text-white " : "bg-[var(--bo-tinta-6)] text-foreground/40 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-text-muted)]"}`}
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
                  className={`alvo-toque shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${showArchived ? "bg-[#1b2119] text-white " : "bg-[var(--bo-tinta-6)] text-foreground/30 hover:bg-[var(--bo-tinta-6)]"}`}
                >
                  Arquivados · {archivedCount}
                </button>
              )}
            </div>

            {/* Tag filter */}
            {allTags.length > 0 && (
              /* O `-mt` cancela parte da margem da fila de cima: as duas filas
                 são o mesmo gesto e não precisam de ar entre elas. Abaixo de 640
                 a conta é sobre margens já apertadas (12 em vez de 20), portanto
                 o cancelamento também encolhe — senão as pastilhas encostavam. */
              <div className="flex flex-wrap items-center gap-1.5 mb-4 -mt-2 sm:mb-8 sm:-mt-4">
                <span className="text-foreground/30 text-[9px] tracking-[0.2em] uppercase mr-1">
                  Etiquetas
                </span>
                {/* `alvo-toque` como o «Arquivados · N» dez linhas acima: estes
                    chips são a MESMA fila de filtros, e mediam 68×24 px no
                    telemóvel — metade do mínimo da casa. O ajudante só cresce
                    onde há dedo (`pointer: coarse`), portanto no portátil a
                    fila fica exactamente como está. */}
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
                    className={`alvo-toque px-3 py-1 rounded-full text-[10px] font-medium tracking-wide transition-all duration-150 ${
                      tagFilter === t
                        ? "bg-[#4d6350] text-white "
                        : "bg-[#4d6350]/10 text-[#4d6350] hover:bg-[#4d6350]/18"
                    }`}
                  >
                    {t}
                  </button>
                ))}
                {tagFilter && (
                  <button
                    onClick={() => setTagFilter(null)}
                    className="text-foreground/35 text-[10px] hover:text-[var(--bo-text-muted)] transition-colors ml-1"
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}

            {/* Bulk actions */}
            {seleccionadosAVista.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 mb-5 p-3 rounded-xl border border-[#4d6350]/25 bg-[#4d6350]/[0.06]">
                <span className="text-[#4d6350] text-xs font-semibold">
                  {seleccionadosAVista.length} selecionado
                  {seleccionadosAVista.length !== 1 ? "s" : ""}
                </span>
                {seleccionadosAVista.length < filtered.length && (
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
                      if (v) applyBulkStatus(v, seleccionadosAVista);
                    }}
                    aria-label="Marcar pedidos selecionados como"
                    className="bo-input px-2 py-1.5 text-xs text-[var(--bo-tinta-72)] disabled:opacity-50"
                  >
                    {/* Era aqui que vivia o «A aplicar…». Um `<option>` de um
                        `<select>` fechado é texto que ninguém vê: quem está a
                        olhar para a barra não abre o selector para ir ver se o
                        que pediu está a andar. O sinal passou para o `EmCurso`
                        no fundo desta barra. */}
                    <option value="">—</option>
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
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[var(--bo-hairline-strong)] text-foreground/45 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:text-[#4d6350] transition-colors "
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
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[var(--bo-hairline-strong)] text-foreground/45 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:text-[#4d6350] transition-colors "
                      title={`Compor email para ${emails.length} cliente(s) (em bcc)`}
                    >
                      Email ({emails.length})
                    </a>
                  );
                })()}
                {/* Hard delete for the whole selection — restrained terracotta,
                    always behind a single confirm; disabled while a batch runs. */}
                <button
                  onClick={() => deleteSelected(seleccionadosAVista)}
                  disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#8a2a22]/25 text-[#8a2a22]/80 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:bg-[#8a2a22]/10 hover:text-[#8a2a22] transition-colors disabled:opacity-50"
                >
                  Apagar ({seleccionadosAVista.length})
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="ml-auto text-foreground/40 text-xs hover:text-[var(--bo-tinta-72)] transition-colors"
                >
                  Limpar
                </button>
                {/* A espera fica DENTRO da barra da seleção, por baixo dos
                    botões que a lançaram — é onde os olhos já estão.
                    `basis-full` para tomar uma linha só sua: a 390 px esta
                    barra já quebra em várias filas e um cartão encaixado entre
                    dois botões não cabia. */}
                {lote && (
                  <EmCurso
                    className="basis-full"
                    titulo={lote.titulo}
                    feito={lote.feito}
                    total={lote.total}
                    nota="Não feches a página até acabar."
                  />
                )}
              </div>
            )}

            {/* When a pedido is open, the list collapses to a slim rail and the
                detail takes over the remaining width as a spacious workspace.
                With nothing selected the list spreads full-width. */}
            <div
              className={`grid grid-cols-1 gap-[var(--bo-gap-vista)] ${
                selected ? "xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]" : "xl:grid-cols-1"
              }`}
            >
              {/* List */}
              <div
                style={{ "--cena": 2 } as React.CSSProperties}
                className="bo-cena flex min-w-0 flex-col gap-3"
              >
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
                      /* ── «VAZIA» E «FILTRADA» NÃO SÃO A MESMA COISA ───────
                         A condição olhava só para a procura e para o estado, e
                         ignorava os seis filtros do painel — que são
                         precisamente os que passaram a estar RECOLHIDOS no
                         telemóvel. O resultado era o pior ecrã possível: uma
                         lista filtrada a dizer «Sem pedidos ainda», com os
                         filtros fora de vista. Ela conclui que não entrou nada,
                         fecha o telemóvel, e o pedido fica sem resposta.
                         `filtrosActivos` é a mesma conta que o botão mostra —
                         uma fonte, dois sítios. */
                      title={haFiltroAActuar ? "Nenhum pedido corresponde" : "Sem pedidos ainda"}
                      hint={
                        haFiltroAActuar
                          ? `Estão a esconder pedidos: ${oQueEstaAFiltrar()}.`
                          : "Os pedidos de orçamento do site aparecem aqui. Podes também criar um manualmente."
                      }
                      /* A saída AQUI, e não «vai procurar os filtros». */
                      action={
                        haFiltroAActuar
                          ? { label: "Limpar tudo e ver todos", onClick: limparFiltros }
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
                        userName={userName}
                        onOpen={openQuoteStable}
                        onToggle={toggleSelect}
                        onDesfecho={marcarDesfecho}
                      />
                    )}
                    aoAbrir={openQuoteStable}
                    colunas={COLUNAS_DE_PEDIDOS({
                      selectedIds,
                      toggleSelect,
                      todayStr,
                      atual: selected?.id,
                      userName,
                      onDesfecho: marcarDesfecho,
                    })}
                  />
                )}
                {filtered.length > visibleCount && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + LIST_PAGE_SIZE)}
                    className="w-full py-3.5 text-[11px] tracking-[0.2em] uppercase text-foreground/45 hover:text-[var(--bo-tinta-72)] bg-white border border-[var(--bo-hairline)] rounded-xl hover:border-foreground/20 transition-colors"
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
                    /* ── O PAINEL É UMA MOLDURA: CABEÇA, MEIO QUE ROLA, PÉ ───
                       O que rola passou a ser a caixa de DENTRO. Antes rolava
                       o painel inteiro e a barra de gravação ia lá dentro,
                       `sticky bottom-0` — colada ao fundo do que rola. Duas
                       coisas más saíam daí:

                       · o estúdio de propostas tem a SUA barra `sticky
                         bottom-0` (z-20) e as duas disputavam a mesma aresta:
                         medido a 1280×800, a meio da rolagem quem estava no
                         centro do «Guardar alterações» era a barra do estúdio;
                       · e uma barra colada ao fundo de uma caixa que rola
                         depende de onde a caixa está — não é uma promessa.

                       Com o pé FORA da caixa que rola, a aresta de baixo do
                       que rola fica por cima dele: o `sticky` do estúdio cola
                       ali e nunca mais o tapa, sem guerra de `z-index` e sem o
                       estúdio ter de saber que existe um pé por baixo. */
                    className="fixed xl:static inset-y-0 right-0 z-50 xl:z-auto flex w-full max-w-md flex-col overflow-hidden border-l bg-white shadow-[var(--bo-sombra-modal)] xl:shadow-none sm:max-w-xl lg:max-w-3xl xl:sticky xl:top-24 xl:w-auto xl:max-w-none xl:rounded-2xl xl:border border-[var(--bo-hairline)] max-h-[100dvh] xl:max-h-[calc(100vh-7rem)]"
                    // A altura medida ganha à classe — e só existe na coluna do
                    // computador. Ver `alturaDoDetalhe`.
                    style={
                      isDetailOverlay || alturaDoDetalhe === null
                        ? undefined
                        : { maxHeight: alturaDoDetalhe }
                    }
                  >
                    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
                      <div className="sticky top-0 z-10 border-b border-[var(--bo-hairline)] bg-white px-3.5 pt-3.5 sm:px-7 sm:pt-5">
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
                              className="line-clamp-2 break-words font-display text-xl leading-tight text-[var(--bo-text)] focus:outline-none sm:text-2xl"
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
                              unifies proposta/contrato/pagamentos/produção. Primary. */}
                            <Link
                              href={localizeHref(`/orcamento/admin/evento/${selected.id}`, locale)}
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
                                    /**
                                     * ── UM `if (res.ok)` SEM `else` NEM `catch` ──
                                     *
                                     * Era esta a forma anterior, e o resultado é o
                                     * pior possível num gesto que faz um pedido
                                     * DESAPARECER da lista: com a rede em baixo não
                                     * acontecia nada nenhum — nem o pedido saía da
                                     * lista, nem havia aviso. Ficava-se a olhar para
                                     * um menu que não respondeu, sem saber se foi o
                                     * dedo que falhou ou o servidor.
                                     */
                                    const oQue = `${next ? "arquivar" : "restaurar"} «${selected.name}»`;
                                    let res: Response;
                                    try {
                                      res = await fetch(`/api/orcamento/${selected.id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ archived: next }),
                                      });
                                    } catch {
                                      toast(porqueRebentou(oQue).mensagem, "error");
                                      return;
                                    }
                                    const corpo = await res.json().catch(() => null);
                                    if (!res.ok) {
                                      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
                                      return;
                                    }
                                    const updated = corpo as Quote;
                                    setQuotes((prev) =>
                                      prev.map((q) => (q.id === updated.id ? updated : q)),
                                    );
                                    setSelected(updated);
                                    toast(
                                      next ? "Pedido arquivado" : "Pedido restaurado",
                                      "success",
                                    );
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
                                      <path
                                        d="M14 2v6h6M9 13h6M9 17h6M9 9h1"
                                        strokeLinecap="round"
                                      />
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
                                  // A pergunta nomeia o pedido e enumera o que
                                  // vai atrás dele. Ver `PerguntaDestrutiva`.
                                  onClick: () => setAApagar(selected),
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

                      {/* ── O QUE FICOU POR GRAVAR ─────────────────────────────
                          Primeira coisa do conteúdo, e não presa ao cabeçalho:
                          aparece exactamente onde o olho já está ao abrir o
                          pedido, e rolar para lá dela é uma forma legítima de a
                          ignorar. Presa, roubava altura a um cabeçalho que a
                          390 px já está apertado — e a decisão não é urgente,
                          é só importante.

                          Diz o QUE está diferente, por nome, e há quanto tempo.
                          Sem isso, «há alterações por gravar» obriga a aceitar
                          às cegas — e uma barra que se aceita às cegas mais vale
                          não existir. */}
                      {rascunhoPorRepor && (
                        <div
                          role="status"
                          className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#8a6420]/25 bg-[#8a6420]/[0.07] px-3.5 py-2.5"
                        >
                          <p className="min-w-0 flex-1 text-xs leading-snug text-[var(--bo-tinta-72)]">
                            Ficou por gravar {fraseDoQueMudou(rascunhoPorRepor.mudou)} deste pedido
                            {rascunhoPorRepor.quando ? `, ${rascunhoPorRepor.quando}` : ""}.
                          </p>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {/* «Recuperar» e não «Repor»: o produto já tem um
                                «Repor», que repõe uma CÓPIA DE SEGURANÇA e
                                apaga o que está lá. Duas palavras iguais para
                                duas coisas diferentes — uma delas destrutiva —
                                é como se carrega na errada. */}
                            <Button size="sm" variant="secondary" onClick={reporRascunho}>
                              Recuperar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={descartarRascunho}>
                              Descartar
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Tudo à vista: ciclo de vida, próxima ação, o formulário de
                        gestão sempre presente e as ferramentas em separadores logo
                        abaixo — nada fica escondido atrás de revelações. */}
                      <div className="mx-auto flex w-full max-w-3xl flex-col gap-[var(--bo-gap-vista)] px-3.5 py-3.5 sm:px-7 sm:py-8">
                        {/* Ciclo de vida — em que fase está o pedido, num relance. */}
                        <LifecycleStepper quote={selected} />

                        {/* ── «JÁ RESPONDERAM?», TAMBÉM AQUI ─────────────────
                          O mesmo gesto do cartão da lista, no sítio onde ela
                          está quando abre um pedido para lhe telefonar. Está em
                          cima, antes de tudo o resto, porque é a única coisa que
                          falta para os números serem verdade — e não em baixo,
                          escondido no selector de estado do formulário de gestão
                          (que continua a existir, e é por onde se CORRIGE um
                          desfecho já marcado).

                          `marcadoNoPainel` faz aqui o que o `marcadoAqui` faz no
                          cartão: segura a moldura no instante em que o pedido
                          deixa de ter proposta enviada, para o recibo e o campo
                          opcional do motivo não desaparecerem ao nascer. */}
                        {(faltaODesfecho(selected) || marcadoNoPainel === selected.id) && (
                          <PerguntaDeDesfecho
                            key={`desfecho-${selected.id}`}
                            quote={selected}
                            quem={userName}
                            variante="painel"
                            onGravado={(actualizado) => {
                              setMarcadoNoPainel(actualizado.id);
                              marcarDesfecho(actualizado);
                            }}
                          />
                        )}

                        {/* ── O QUE NASCE COM O «GANHO» ────────────────────
                          Marcar «Ganho» semeia sozinho DUAS das quatro peças —
                          o plano de montagem e a checklist genérica. As outras
                          duas, a lista de MATERIAL e as DATAS-CHAVE no
                          calendário, mais as linhas de SINAL e SALDO, só saem
                          de `POST /api/orcamento/[id]` com `{acao:"gerar"}`, e
                          o único ecrã que o pedia não estava montado em lado
                          nenhum — o próprio ficheiro admite-o em comentário.

                          Resultado: por cada casamento ganho, ela refazia à
                          mão a lista de material, metia as datas-chave uma a
                          uma e criava as linhas de sinal e saldo. O Dossier
                          chegava a dizer «Registar o sinal (30%)» a apontar
                          para um painel de Pagamentos vazio.

                          O painel só se desenha a si próprio quando o pedido
                          está `aceite` (é o que ele faz na primeira linha), por
                          isso montá-lo aqui não acrescenta ruído a mais nenhum
                          estado. Fica ao lado da pergunta do desfecho, que é
                          onde o «Ganho» acabou de ser dado. */}
                        <PainelGeracaoAoGanhar
                          key={`geracao-${selected.id}`}
                          quote={selected}
                          onGerado={() => {
                            // O plano de montagem e os pagamentos vivem no
                            // PRÓPRIO pedido: sem esta releitura, o painel de
                            // Pagamentos ao lado continuava vazio até ela
                            // fechar e reabrir a ficha.
                            void recarregarPedido(selected.id);
                          }}
                        />

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
                                    abrirDetailTab(na.tab);
                                    toolsRef.current?.scrollIntoView({
                                      behavior: "smooth",
                                      block: "start",
                                    });
                                  }
                                }}
                                className="flex w-full items-center gap-3 rounded-full bg-[#4d6350] px-5 py-4 text-left text-white motion-safe:transition-colors hover:bg-[#415440]"
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
                              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--bo-text-muted)]">
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
                                    // Interior ou exterior. Fica ao lado do
                                    // local porque é a continuação da mesma
                                    // pergunta — e porque é o que diz se há uma
                                    // montagem alternativa a preparar.
                                    l: "Espaço",
                                    v: spaceTypeLabel(selected.spaceType) || null,
                                  },
                                  {
                                    // Civil, religiosa ou as duas: é o que diz se
                                    // são dois sítios para montar num só dia.
                                    l: "Cerimónia",
                                    v: ceremonyTypeLabel(selected.ceremonyType) || null,
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

                              {/* ── CAMPOS EDITÁVEIS ────────────────────────────
                                  Tudo em grelha, à mão — e cada rótulo LIGADO ao
                                  seu campo (`htmlFor` ↔ `id`). Eram dez rótulos
                                  soltos: por cima de um campo, a dizer o que ele
                                  é, e sem nada que o dissesse ao browser.

                                  Duas consequências, e a segunda é a que se nota
                                  todos os dias. Quem usa leitor de ecrã ouvia
                                  «edit text» sem saber de quê. E tocar no rótulo
                                  não fazia nada — quando um rótulo ligado põe o
                                  cursor no campo, o que num telemóvel duplica o
                                  alvo de cada um destes onze campos sem mexer no
                                  desenho.

                                  Havia dois remendos com `aria-label`, e saíram:
                                  um `aria-label` SUBSTITUI o rótulo visível, o
                                  que deixa os dois livres para dizerem coisas
                                  diferentes sem ninguém dar por isso — era o
                                  caso, «Estado» no ecrã e «Estado do pedido» no
                                  leitor.

                                  O campo dos convidados já estava certo, e é o
                                  modelo: é o único que também liga o erro ao
                                  campo (`aria-invalid` + `aria-describedby`). */}
                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                  <label
                                    htmlFor="pedido-estado"
                                    className="bo-eyebrow block mb-1.5"
                                  >
                                    Estado
                                  </label>
                                  <select
                                    id="pedido-estado"
                                    value={editStatus}
                                    onChange={(e) => setEditStatus(e.target.value as QuoteStatus)}
                                    className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
                                  >
                                    {STATUS_OPTIONS.map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {s.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label htmlFor="pedido-preco" className="bo-eyebrow block mb-1.5">
                                    Preço final (sem IVA) €
                                  </label>
                                  <input
                                    id="pedido-preco"
                                    type="text"
                                    inputMode="decimal"
                                    value={editPrice}
                                    onChange={(e) => setEditPrice(e.target.value)}
                                    placeholder="Ex.: 12500"
                                    className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
                                  />
                                  {(() => {
                                    /**
                                     * ── A MESMA BASE DOS DOIS LADOS ──────────
                                     *
                                     * Isto misturava três coisas na mesma conta:
                                     * o preço escrito e o `quotedPrice` são
                                     * LÍQUIDOS, o `priceBreakdown.total` do
                                     * fallback é BRUTO, e os custos de
                                     * fornecedor são com IVA (que é dedutível).
                                     *
                                     * O resultado era dois números para a mesma
                                     * pergunta no mesmo ecrã: num pedido de
                                     * 10.000 € com 5.000 € de custos, aqui dizia
                                     * «Margem 5.000 €» e o separador Financeiro
                                     * dizia 5.934,96 €. A regra certa é a que o
                                     * `EventCosts` já aplica e explica.
                                     */
                                    const escrito = parsePriceInput(editPrice);
                                    const revenue =
                                      escrito != null ? escrito : contractedAmounts(selected).net;
                                    const taxa = effectiveVatRate(selected);
                                    const custosComIva = (selected.eventSuppliers ?? []).reduce(
                                      (s, e) => s + (e.actualCost ?? e.estimatedCost ?? 0),
                                      0,
                                    );
                                    if (!custosComIva) return null;
                                    const costs = round2(custosComIva / (1 + taxa));
                                    const margin = round2(revenue - costs);
                                    return (
                                      <p className="mt-1 text-[10px] text-foreground/45">
                                        Custos {formatPrice(costs)} · Margem{" "}
                                        <span
                                          className={
                                            margin >= 0 ? "text-[#4d6350]" : "text-[#8a2a22]"
                                          }
                                        >
                                          {formatPrice(margin)}
                                        </span>
                                      </p>
                                    );
                                  })()}
                                </div>
                                <div>
                                  <label htmlFor="pedido-data" className="bo-eyebrow block mb-1.5">
                                    Data do evento
                                  </label>
                                  <input
                                    id="pedido-data"
                                    type="date"
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                    className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
                                  />
                                  {editDate &&
                                    (() => {
                                      const cd = eventCountdown(editDate);
                                      return cd ? (
                                        <p
                                          className={`mt-1 text-[10px] ${cd.tone === "soon" || cd.tone === "today" ? "text-[#8a2a22]" : "text-foreground/40"}`}
                                        >
                                          {cd.label}
                                        </p>
                                      ) : null;
                                    })()}
                                </div>
                                <div>
                                  <label
                                    className="bo-eyebrow block mb-1.5"
                                    htmlFor="campo-convidados"
                                  >
                                    Convidados
                                  </label>
                                  <input
                                    id="campo-convidados"
                                    type="number"
                                    min={0}
                                    value={editGuests}
                                    aria-invalid={erroDeConvidados ? true : undefined}
                                    aria-describedby={
                                      erroDeConvidados ? "erro-dos-convidados" : undefined
                                    }
                                    onChange={(e) => setEditGuests(e.target.value)}
                                    className={`bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full${
                                      erroDeConvidados ? " border-[#8a2a22]" : ""
                                    }`}
                                  />
                                  {/* O `min={0}` do input não trava nada — o
                                    teclado escreve o que quer. Esta é a frase
                                    que chega ANTES do clique, e diz o que
                                    fazer em vez de citar o esquema. */}
                                  {erroDeConvidados && (
                                    <p
                                      id="erro-dos-convidados"
                                      className="mt-1 text-[10px] leading-relaxed text-[#8a2a22]"
                                    >
                                      {erroDeConvidados}
                                    </p>
                                  )}
                                </div>
                                <div>
                                  <label
                                    htmlFor="pedido-responsavel"
                                    className="bo-eyebrow block mb-1.5"
                                  >
                                    Responsável
                                  </label>
                                  <input
                                    id="pedido-responsavel"
                                    type="text"
                                    value={editAssigned}
                                    onChange={(e) => setEditAssigned(e.target.value)}
                                    placeholder="Nome do membro da equipa…"
                                    className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
                                  />
                                </div>
                                <div>
                                  <label htmlFor="pedido-local" className="bo-eyebrow block mb-1.5">
                                    Local
                                  </label>
                                  <input
                                    id="pedido-local"
                                    value={editLocation}
                                    onChange={(e) => setEditLocation(e.target.value)}
                                    placeholder="Local do evento…"
                                    className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
                                  />
                                </div>
                              </div>

                              {/* ── OS CONTACTOS, QUE ATÉ AQUI ERAM DEFINITIVOS ──
                                Palavras dela: «se criarmos um pedido novo e não
                                colocarmos um email, depois quando quisermos
                                colocar o email para enviarmos a proposta, não
                                conseguimos editar».

                                Um pedido nascido de um telefonema entra sem
                                email — o formulário público aceita «email OU
                                telefone», e o back office nem isso exige. Quem
                                dava pela falta era a rota do envio: gravava a
                                proposta, não a mandava a ninguém, e respondia
                                «acrescenta o email e reenvia». Não havia por
                                onde.

                                Ficam num bloco próprio e por baixo: são os
                                dados de QUEM, e o que está em cima é o QUÊ. */}
                              <div className="grid grid-cols-1 gap-4 border-t border-[var(--bo-hairline)] pt-4 sm:grid-cols-3">
                                <div>
                                  <label htmlFor="pedido-nome" className="bo-eyebrow block mb-1.5">
                                    Nome do cliente
                                  </label>
                                  <input
                                    id="pedido-nome"
                                    value={editNome}
                                    onChange={(e) => setEditNome(e.target.value)}
                                    placeholder="Quem pediu…"
                                    className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
                                  />
                                </div>
                                <div>
                                  <label htmlFor="pedido-email" className="bo-eyebrow block mb-1.5">
                                    Email
                                  </label>
                                  <input
                                    id="pedido-email"
                                    type="email"
                                    inputMode="email"
                                    autoComplete="off"
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    placeholder="para onde a proposta segue…"
                                    className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
                                  />
                                  {/* O aviso aparece só quando falta MESMO, e diz
                                    a consequência em vez de dizer «campo
                                    obrigatório» — porque não é: há pedidos que
                                    só têm telefone, e isso é legítimo. */}
                                  {!editEmail.trim() && (
                                    <p className="mt-1 text-[10px] leading-relaxed text-[#8a2a22]">
                                      Sem email, a proposta é gravada e o link continua a servir,
                                      mas não é enviada a ninguém.
                                    </p>
                                  )}
                                </div>
                                <div>
                                  <label
                                    htmlFor="pedido-telefone"
                                    className="bo-eyebrow block mb-1.5"
                                  >
                                    Telefone
                                  </label>
                                  <input
                                    id="pedido-telefone"
                                    type="tel"
                                    inputMode="tel"
                                    autoComplete="off"
                                    value={editTelefone}
                                    onChange={(e) => setEditTelefone(e.target.value)}
                                    placeholder="+351…"
                                    className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
                                  />
                                </div>
                              </div>

                              {/* Etiquetas + seguimento — gravam sozinhos. */}
                              <div className="grid grid-cols-1 gap-4 border-t border-[var(--bo-hairline)] pt-4 sm:grid-cols-2">
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
                                  <label
                                    htmlFor="pedido-motivo"
                                    className="bo-eyebrow block mb-1.5"
                                  >
                                    Motivo de perda
                                  </label>
                                  <textarea
                                    id="pedido-motivo"
                                    rows={2}
                                    value={editLostReason}
                                    onChange={(e) => setEditLostReason(e.target.value)}
                                    placeholder="Ex.: Orçamento acima do esperado, escolheram outro fornecedor…"
                                    className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] resize-none w-full"
                                  />
                                </div>
                              )}
                              {selected.status === "rejeitado" &&
                                selected.lostReason &&
                                editStatus !== "rejeitado" && (
                                  <div className="rounded-lg border border-[var(--bo-hairline)] bg-[var(--bo-tinta-6)] px-3 py-2">
                                    <p className="mb-1 text-[9px] uppercase tracking-[0.2em] text-[var(--bo-text-muted)]">
                                      Motivo de perda anterior
                                    </p>
                                    <p className="text-xs text-[var(--bo-tinta-72)]">
                                      {selected.lostReason}
                                    </p>
                                  </div>
                                )}

                              <div>
                                <label htmlFor="pedido-notas" className="bo-eyebrow block mb-1.5">
                                  Notas internas
                                </label>
                                <textarea
                                  id="pedido-notas"
                                  rows={3}
                                  // O que se escreve aqui grava-se sozinho — ver a
                                  // gravação automática lá em cima. A barra de
                                  // baixo diz em que pé está.
                                  aria-describedby="estado-da-gravacao-do-pedido"
                                  value={editNotes}
                                  onChange={(e) => setEditNotes(e.target.value)}
                                  placeholder="Notas internas sobre este pedido…"
                                  className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] resize-none w-full"
                                />
                                {/* ── E A NOTA QUE FOI ESCRITA NO ESTÚDIO ────
                                    A caixa acima é do PEDIDO. Esta é a nota da
                                    PROPOSTA, e mostra-se aqui porque quem abre
                                    a ficha três semanas depois não passa pelo
                                    estúdio — era aí que a frase se perdia.
                                    Só de leitura: ver `NotaDaProposta`. */}
                                <NotaDaProposta key={selected.id} quoteId={selected.id} />
                              </div>

                              {/* Estimativa calculada — contexto para definir o preço. */}
                              {selected.priceBreakdown && (
                                <div className="rounded-lg bg-[var(--bo-tinta-6)] p-3 flex flex-col gap-1.5">
                                  <p className="text-[9px] uppercase tracking-[0.2em] text-foreground/50">
                                    Estimativa calculada
                                  </p>
                                  {selected.priceBreakdown.addonsCost > 0 && (
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-[var(--bo-text-muted)]">Extras</span>
                                      <span className="text-[var(--bo-tinta-72)]">
                                        {formatPrice(selected.priceBreakdown.addonsCost)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-[var(--bo-text-muted)]">Subtotal</span>
                                    <span className="text-[var(--bo-tinta-72)]">
                                      {formatPrice(selected.priceBreakdown.subtotal)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-[var(--bo-text-muted)]">IVA 23%</span>
                                    <span className="text-[var(--bo-tinta-72)]">
                                      {formatPrice(selected.priceBreakdown.iva)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between border-t border-[var(--bo-hairline)] pt-1 text-xs font-medium">
                                    <span className="text-[var(--bo-text-muted)]">Total</span>
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
                                className="alvo-toque shrink-0 text-foreground/25 transition-colors hover:text-[var(--bo-text-muted)]"
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
                                className="alvo-toque text-xs text-[var(--bo-tinta-72)] hover:text-[var(--bo-text)]"
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
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                  >
                                    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-.96.24-3.23-.67-2.73-1.08-4.46-3.86-4.6-4.04-.13-.18-1.1-1.46-1.1-2.79 0-1.33.7-1.98.95-2.25.24-.27.53-.34.7-.34.18 0 .35 0 .5.01.16.01.38-.06.6.46.23.54.77 1.87.84 2 .07.14.11.3.02.48-.09.18-.13.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.54.15.27.67 1.1 1.44 1.78.99.88 1.82 1.16 2.08 1.29.27.13.42.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.25.09 1.58.75 1.85.88.27.13.45.2.52.31.07.11.07.64-.17 1.32Z" />
                                  </svg>
                                  WhatsApp
                                </a>
                              )}
                            </div>
                            {selected.company && (
                              <p className="text-xs text-[var(--bo-tinta-72)]">
                                {selected.company}
                              </p>
                            )}
                            {selected.nif && (
                              <p className="text-xs text-[var(--bo-tinta-72)]">
                                NIF: {selected.nif}
                              </p>
                            )}
                          </div>
                        </SectionCard>

                        {/* Notas do cliente — contexto imediato, se existirem. */}
                        {selected.notes && (
                          <div>
                            <p className="bo-eyebrow mb-2">Notas do Cliente</p>
                            <p className="rounded-lg bg-[var(--bo-tinta-6)] p-3 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
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
                          className="flex scroll-mt-24 flex-col gap-[var(--bo-gap-vista)] border-t border-[var(--bo-hairline)] pt-5 sm:pt-8"
                        >
                          {/* Section header — the command centre of the pedido. */}
                          <div className="flex flex-col gap-1.5">
                            <p className="bo-eyebrow">Ferramentas do pedido</p>
                            <p className="text-xs leading-relaxed text-[var(--bo-text-muted)]">
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
                                const todo = (selected.checklist ?? []).filter(
                                  (c) => !c.done,
                                ).length;
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
                                  onClick={() => abrirDetailTab(tab.id)}
                                  onKeyDown={(e) => {
                                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                                    e.preventDefault();
                                    const dir = e.key === "ArrowRight" ? 1 : -1;
                                    const nextIdx = (i + dir + arr.length) % arr.length;
                                    abrirDetailTab(arr[nextIdx].id);
                                    const tabs =
                                      e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                                        '[role="tab"]',
                                      );
                                    tabs?.[nextIdx]?.focus();
                                  }}
                                  className={`flex min-w-0 flex-col items-start gap-3 rounded-2xl border p-4 text-left motion-safe:transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d6350]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                                    active
                                      ? "border-[#4d6350]/45 bg-[#4d6350]/[0.05] "
                                      : "border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] hover:-translate-y-0.5 hover:border-[var(--bo-hairline-strong)] hover:bg-[var(--bo-tinta-3)] "
                                  }`}
                                >
                                  <span
                                    aria-hidden
                                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl motion-safe:transition-colors ${
                                      active
                                        ? "bg-[#4d6350]/[0.12] text-[#4d6350]"
                                        : "bg-[var(--bo-tinta-6)] text-[var(--bo-text-muted)]"
                                    }`}
                                  >
                                    {tab.icon}
                                  </span>
                                  <span className="flex min-w-0 flex-col gap-1">
                                    <span
                                      className={`text-xs font-semibold uppercase tracking-[0.08em] ${
                                        active
                                          ? "text-[var(--bo-text)]"
                                          : "text-[var(--bo-tinta-72)]"
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
                                          : "bg-[var(--bo-tinta-6)] text-[var(--bo-text-muted)]"
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
                          <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
                            {/* Cada painel só monta as suas ferramentas na PRIMEIRA vez
                              que se abre (`detailTabsVisitados`, ver a nota onde é
                              declarado) — depois disso fica sempre montado e só
                              escondido (`hidden`), para nunca se perder trabalho a
                              meio (mensagem por enviar, proposta em edição) ao trocar
                              de separador. */}
                            <div
                              role="tabpanel"
                              id="detail-panel-producao"
                              aria-labelledby="detail-tab-producao"
                              tabIndex={0}
                              hidden={detailTab !== "producao"}
                              className="flex flex-col gap-4 focus:outline-none sm:gap-6"
                            >
                              {detailTabsVisitados.has("producao") && (
                                <>
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
                                        prev.map((q) =>
                                          q.id === selected.id ? { ...q, checklist } : q,
                                        ),
                                      );
                                      setSelected((prev) => (prev ? { ...prev, checklist } : prev));
                                    }}
                                  />

                                  {/* Material que vai na carrinha */}
                                  <EventMaterial key={`mat-${selected.id}`} quote={selected} />

                                  {/* Plano &amp; dia do evento — occasional tools, collapsed so
                                  the tab opens short. Native <details> keeps every child
                                  mounted (hidden via CSS), so fetch/PATCH lifecycles are
                                  untouched.

                                  O `alvo-toque` do interruptor não é cosmético:
                                  MEDIDO a 375 px, este `<summary>` tinha 334×16
                                  e é a única porta para o plano de decoração, o
                                  cronograma e a lista de convidados. Um
                                  `<summary>` não é `<button>` nem tem `role`,
                                  por isso nenhuma auditoria de alvos o via —
                                  agora vê (ver `e2e/ergonomia-tactil.mjs`). Só
                                  cresce sob `(pointer: coarse)`; no portátil
                                  fica como estava. */}
                                  <details className="group border-t border-[var(--bo-hairline-strong)] pt-4">
                                    <summary className="alvo-toque !justify-start flex cursor-pointer list-none items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--bo-text-muted)] marker:content-none [&::-webkit-details-marker]:hidden hover:text-[var(--bo-text)]">
                                      <svg
                                        className="shrink-0 text-foreground/40 motion-safe:transition-transform group-open:rotate-90"
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
                                    <div className="flex flex-col gap-4 pt-4 sm:gap-6 sm:pt-6">
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
                                          setSelected((prev) =>
                                            prev ? { ...prev, timeline } : prev,
                                          );
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
                                          setSelected((prev) =>
                                            prev ? { ...prev, guestList } : prev,
                                          );
                                        }}
                                      />
                                    </div>
                                  </details>
                                </>
                              )}
                            </div>

                            <div
                              role="tabpanel"
                              id="detail-panel-financeiro"
                              aria-labelledby="detail-tab-financeiro"
                              tabIndex={0}
                              hidden={detailTab !== "financeiro"}
                              className="flex flex-col gap-4 focus:outline-none sm:gap-6"
                            >
                              {detailTabsVisitados.has("financeiro") && (
                                <>
                                  {/* Cobrança — payments first (the key action), costs
                                  below. Eyebrow mirrors the other two panels. */}
                                  <p className="bo-eyebrow text-foreground/45">Pagamentos</p>

                                  <PaymentsPanel
                                    key={`pay-${selected.id}`}
                                    quote={selected}
                                    onChange={(payments) => {
                                      setQuotes((prev) =>
                                        prev.map((q) =>
                                          q.id === selected.id ? { ...q, payments } : q,
                                        ),
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
                                      setSelected((prev) =>
                                        prev ? { ...prev, contractRef } : prev,
                                      );
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
                                      setSelected((prev) =>
                                        prev ? { ...prev, eventSuppliers } : prev,
                                      );
                                    }}
                                  />
                                </>
                              )}
                            </div>

                            <div
                              role="tabpanel"
                              id="detail-panel-comunicacao"
                              aria-labelledby="detail-tab-comunicacao"
                              tabIndex={0}
                              hidden={detailTab !== "comunicacao"}
                              className="flex flex-col gap-4 focus:outline-none sm:gap-6"
                            >
                              {detailTabsVisitados.has("comunicacao") && (
                                <>
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
                                          setQuotes((prev) =>
                                            prev.map((x) => (x.id === q.id ? q : x)),
                                          );
                                          setSelected((prev) => (prev?.id === q.id ? q : prev));
                                          // `textoDoPreco` e não a verdade do valor:
                                          // um total de ZERO é um preço escrito, e
                                          // lido como «sem preço» deixava o campo
                                          // vazio sobre um pedido que tem 0 — a barra
                                          // a pedir para gravar o que o estúdio
                                          // acabou de gravar.
                                          setEditPrice(textoDoPreco(q));
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
                                          // A proposta JÁ seguiu — o que pode
                                          // falhar aqui é a linha do histórico, e a
                                          // frase tem de dizer isso e não o
                                          // contrário.
                                          void appendActivity(
                                            selected.id,
                                            [
                                              {
                                                id: randomId(),
                                                at: new Date().toISOString(),
                                                kind: "proposal_sent",
                                                actor: userName,
                                                summary: "Proposta enviada ao cliente (Studio)",
                                              },
                                            ],
                                            "escrever no histórico que a proposta seguiu",
                                          );
                                        }}
                                      />
                                    </>
                                  ) : (
                                    <>
                                      <ProposalBuilder
                                        // A CHAVE, como todos os outros painéis do
                                        // detalhe (`pay-`, `costs-`, `studio-`,
                                        // `guests-`). Sem ela este era o único que
                                        // NÃO remontava ao trocar de pedido: ficava
                                        // com as linhas e os preços do cliente
                                        // anterior e, 800 ms depois, a gravação
                                        // automática escrevia-os no rascunho do
                                        // cliente novo — que nunca os teve.
                                        key={`builder-${selected.id}`}
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
                                          void appendActivity(
                                            selected.id,
                                            [
                                              {
                                                id: randomId(),
                                                at: new Date().toISOString(),
                                                kind: "proposal_sent",
                                                actor: userName,
                                                summary: `Proposta enviada — ${eur(total)}`,
                                              },
                                            ],
                                            "escrever no histórico que a proposta seguiu",
                                          );
                                        }}
                                      />
                                    </>
                                  )}

                                  {/* Step 2 — talk to the client. */}
                                  <p className="bo-eyebrow border-t border-[var(--bo-hairline-strong)] pt-6 text-foreground/45">
                                    2 · Falar com o cliente
                                  </p>
                                  <ClientMessenger
                                    key={selected.id}
                                    quote={selected}
                                    onSent={(messages, envio) => {
                                      const prev_count = selected.messages?.length ?? 0;
                                      setQuotes((prev) =>
                                        prev.map((q) =>
                                          q.id === selected.id ? { ...q, messages } : q,
                                        ),
                                      );
                                      setSelected((prev) => (prev ? { ...prev, messages } : prev));
                                      if (messages.length > prev_count) {
                                        // A mensagem JÁ saiu; o que pode falhar
                                        // aqui é a linha do histórico.
                                        void appendActivity(
                                          selected.id,
                                          [
                                            {
                                              id: randomId(),
                                              at: new Date().toISOString(),
                                              kind: "message_sent",
                                              actor: userName,
                                              /**
                                               * O QUE ACONTECEU, E NÃO O QUE SE QUIS FAZER.
                                               *
                                               * Um pedido que entrou por telefonema não tem
                                               * email. A rota grava a mensagem à mesma e
                                               * responde que o email NÃO saiu; o mensageiro
                                               * diz-o a vermelho, mas o histórico ficava com
                                               * «Mensagem enviada ao cliente» — e o histórico
                                               * é o que se lê meses depois para saber o que se
                                               * disse a quem. Mesma frase que a zona de
                                               * comunicações do dossiê já usa.
                                               */
                                              summary: resumoDoEnvio(envio),
                                            },
                                          ],
                                          "escrever no histórico que a mensagem saiu",
                                        );
                                      }
                                    }}
                                  />

                                  {/* Activity history — de-emphasised, collapsed by default. */}
                                  <details className="group border-t border-[var(--bo-hairline-strong)] pt-4">
                                    <summary className="alvo-toque !justify-start flex cursor-pointer list-none items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--bo-text-muted)] marker:content-none [&::-webkit-details-marker]:hidden hover:text-[var(--bo-text)]">
                                      <svg
                                        className="shrink-0 text-foreground/40 motion-safe:transition-transform group-open:rotate-90"
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
                                    <div className="pt-4 sm:pt-6">
                                      <ActivityLog
                                        quote={selected}
                                        actor={userName}
                                        onAddEntry={(entry) =>
                                          appendActivity(
                                            selected.id,
                                            [entry],
                                            entry.kind === "call_logged"
                                              ? "guardar o registo da chamada"
                                              : "guardar a nota",
                                          )
                                        }
                                      />
                                    </div>
                                  </details>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* A aresta que diz «há mais por baixo» — F-09 da auditoria. Última
                          filha do que rola, de propósito: é o `sticky` que a faz aparecer e
                          desaparecer sozinha, sem uma linha de JavaScript a ouvir o scroll.
                          O porquê inteiro está em `globals.css`, na regra. */}
                      <div className="bo-ha-mais-abaixo" aria-hidden="true" />
                    </div>

                    {/* ── O PÉ DO PAINEL: A BARRA DE GRAVAÇÃO ─────────────
                        Aparece seja qual for a secção onde ela está — nunca
                        mais um "guardar" escondido — e agora também DEPOIS de
                        gravar, porque «guardado às 14:32» é a informação que
                        dispensa a pergunta «isto ficou guardado?».

                        O botão não desaparece: ela pediu «um botão para
                        guardar ou então que guarde automaticamente», e ter os
                        dois é melhor do que ter um — o automático protege, o
                        botão dá sossego. Mas tem de dizer a verdade: se já
                        está guardado, é isso que ele diz.

                        E deixou de ser `sticky` porque deixou de precisar: é o
                        PÉ da moldura, fora da caixa que rola, portanto está no
                        fundo do painel sempre — em vez de estar no fundo do que
                        rola, que é onde ela não estava a ver. */}
                    {(isDirty || gravacao.estado) &&
                      (() => {
                        const alarme = !!gravacao.naoChegouAoServidor;
                        const porque = gravacao.naoChegouAoServidor?.porque;
                        const rotuloDoBotao = saving
                          ? "A guardar…"
                          : alarme
                            ? "Tentar de novo"
                            : alteracoesPorConfirmar
                              ? "Guardar alterações"
                              : "Guardado";
                        const haQueFazer = alteracoesPorConfirmar || alarme || gravacao.porGravar;
                        return (
                          <div className="shrink-0 border-t border-[var(--bo-hairline)] bg-white">
                            {/* A mesma medida e o mesmo respiro do corpo
                                  (`max-w-3xl px-5 sm:px-7`), para o botão ficar
                                  alinhado com o que está por cima dele. */}
                            <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-3 sm:px-7">
                              <p
                                id="estado-da-gravacao-do-pedido"
                                role="status"
                                // Um aviso que não chegou ao servidor tem de
                                // ser anunciado, não descoberto.
                                aria-live={alarme ? "assertive" : "polite"}
                                className={
                                  alarme
                                    ? "flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[#8a2a22]"
                                    : "flex items-center gap-1.5 text-[11px] tracking-wide text-gold-text"
                                }
                              >
                                {alarme ? (
                                  <>
                                    <span aria-hidden>⚠</span>
                                    {gravacao.texto?.longo}
                                    {porque ? ` ${porque}` : ""}
                                  </>
                                ) : (
                                  <>
                                    {alteracoesPorConfirmar && (
                                      <>
                                        <span className="h-1.5 w-1.5 rounded-full bg-gold/80" />
                                        Alterações por guardar
                                      </>
                                    )}
                                    {gravacao.texto && (
                                      <span
                                        className={
                                          alteracoesPorConfirmar ? "text-foreground/45" : ""
                                        }
                                      >
                                        {alteracoesPorConfirmar ? "· " : ""}
                                        {gravacao.texto.longo}
                                      </span>
                                    )}
                                  </>
                                )}
                              </p>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={guardarAgora}
                                loading={saving}
                                disabled={!haQueFazer}
                              >
                                {rotuloDoBotao}
                              </Button>
                            </div>
                          </div>
                        );
                      })()}
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
