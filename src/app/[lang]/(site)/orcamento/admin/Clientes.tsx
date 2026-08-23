"use client";

import { useMemo, useState, useDeferredValue } from "react";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { downloadCsv, dateStamp } from "./export";
import { Button, Card, EmptyState, Segmented, Toolbar } from "./ui";
import { AvisoDeFalha } from "./AvisoDeFalha";
import type { LeituraFalhada } from "@/lib/porque-nao-leu";
import { eur0 as eur } from "@/lib/money";
import { contractedAmounts } from "@/lib/orcamento/dossier";
import { metaFor } from "./status-meta";

// Unified status vocabulary (Novo / Aguardar resposta / Proposta enviada / Ganho / Perdido).
const STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  pendente: { label: "Novo", color: "#8a8a82" },
  em_revisao: { label: "Aguardar resposta", color: "#9aa36a" },
  cotado: { label: "Proposta enviada", color: "#7c854b" },
  aceite: { label: "Ganho", color: "#525a2f" },
  rejeitado: { label: "Perdido", color: "#5a5a55" },
};

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Outro";
}

/** Meio-dia LOCAL do dia civil desta data — a âncora que faz a subtração dar
 *  dias de calendário inteiros mesmo com uma mudança de hora pelo meio. */
function localNoon(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
}

/**
 * Há quanto tempo, em DIAS DO CALENDÁRIO — não em blocos de 24 horas.
 *
 * Dividir o intervalo em milissegundos por 86 400 000 responde a outra
 * pergunta: um pedido de ontem às 21h, visto hoje às 00h30, tem três horas e
 * meia e dizia "hoje"; um de terça à noite visto na sexta de manhã tem 2,4
 * intervalos e dizia "há 2d" quando já iam três noites sem contacto. Esta
 * coluna é o que decide a quem se liga a seguir, por isso conta-se como uma
 * pessoa conta: pelos dias que viraram (ver `eventCountdown` em util.ts).
 */
function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.round((localNoon(new Date()) - localNoon(d)) / 86400000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days}d`;
  const months = Math.round(days / 30);
  return `há ${months} ${months === 1 ? "mês" : "meses"}`;
}

interface Client {
  /**
   * A identidade por que os pedidos foram juntos — `email || telefone || nome`,
   * em minúsculas. Guardada, e não reconstruída no sítio onde é precisa: a
   * lista identificava as linhas por `email || nome`, que é outra identidade.
   * Duas "Ana Silva" sem e-mail (metade dos pedidos que entram por telefone não
   * trazem) ficavam bem separadas em dois clientes e mal identificadas com a
   * mesma chave — o React avisava, e abrir uma sanfona abria as duas.
   */
  key: string;
  email: string;
  name: string;
  phone: string;
  company: string;
  quotes: Quote[];
  totalWon: number;
  totalPipeline: number;
  wonCount: number;
  rejectedCount: number;
  lastAt: string;
  /** `lastAt` em milissegundos — para ordenar sem construir um `Date` por comparação. */
  lastMs: number;
  /** Nome + email + telefone + empresa, em minúsculas, para a procura. */
  haystack: string;
  vip: boolean;
}

interface Props {
  quotes: Quote[];
  onOpen: (q: Quote) => void;
  /**
   * ── «SEM CLIENTES AINDA» É UMA AFIRMAÇÃO, E ESTE ECRÃ NÃO A SABE FAZER ──
   *
   * Os clientes não são lidos aqui: formam-se a partir dos `quotes` que vêm
   * de cima, e esses vêm do desenho do servidor (`getQuotes` em page.tsx),
   * que engole a falha e devolve uma lista vazia. Vista daqui, uma leitura
   * que rebentou é indistinguível de uma agenda em branco — e o vazio diz,
   * com toda a confiança, que ela ainda não tem clientes nenhuns, quando o
   * que se passou foi a base de dados não ter respondido.
   *
   * A distinção só pode vir de quem fez a leitura. Quando vier, é este vazio
   * que sai da frente e dá lugar à razão e a uma saída; sem ela, o ecrã
   * comporta-se exactamente como antes.
   */
  falhaDeLeitura?: LeituraFalhada | null;
  /** Volta a pedir a lista de pedidos, quando quem lê sabe repeti-la. */
  aoTentarDeNovo?: () => void;
}

export default function Clientes({ quotes, onOpen, falhaDeLeitura, aoTentarDeNovo }: Props) {
  const [search, setSearch] = useState("");
  // Defer the search term so the O(n) aggregate-and-filter over the full lead
  // history (and the row reconcile) runs off the keystroke: the input stays
  // instant, the list catches up a tick later. Same pattern as the main
  // AdminClient quote search.
  const dSearch = useDeferredValue(search);
  const [sort, setSort] = useState<"recent" | "value" | "pipeline">("recent");
  const [vipOnly, setVipOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // A AGREGAÇÃO (varrer todos os pedidos e juntá-los por cliente) só depende dos
  // pedidos. Estava no mesmo `useMemo` do filtro e da ordenação, por isso mudar
  // de ordenação, ligar o VIP ou escrever mais uma letra na procura obrigava a
  // refazer o varrimento inteiro — trabalho O(n) sobre centenas de pedidos para
  // chegar exactamente ao mesmo resultado. Agora são dois passos: este é caro e
  // raro; o de baixo é barato e frequente.
  //
  // De passagem, guarda-se o texto de procura já em minúsculas por cliente: era
  // um `toLowerCase()` por campo, por cliente, POR TECLA.
  const aggregated = useMemo(() => {
    const map = new Map<string, Client>();
    for (const q of quotes) {
      const key = (q.email || q.phone || q.name).toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          email: q.email,
          name: q.name,
          phone: q.phone,
          company: q.company,
          quotes: [],
          totalWon: 0,
          totalPipeline: 0,
          wonCount: 0,
          rejectedCount: 0,
          lastAt: q.submittedAt,
          lastMs: 0,
          haystack: "",
          vip: false,
        });
      }
      const c = map.get(key)!;
      c.quotes.push(q);
      /**
       * ── OS DOIS RAMOS NÃO ESTÃO NA MESMA UNIDADE ─────────────────────────
       * `q.quotedPrice` é o campo «Preço final (SEM IVA)». Somá-lo directo
       * desalinhava «Ganho» e «Pipeline» dos clientes com a «Receita
       * contratada» das Estatísticas (sempre COM IVA) em ~23%, o IVA inteiro.
       * Mesma cascata já usada em `Reminders.tsx`, `PaymentsPanel.tsx`,
       * `Overview.tsx`, `StatsDashboard.tsx` e `Kanban.tsx`.
       */
      const contratado = q.quotedPrice != null ? contractedAmounts(q).gross : 0;
      if (q.status === "aceite" && q.quotedPrice) {
        c.totalWon += contratado;
        c.wonCount++;
      }
      if (q.status === "rejeitado") c.rejectedCount++;
      if (q.status === "cotado" && q.quotedPrice) c.totalPipeline += contratado;
      const latestAt = q.lastUpdated ?? q.submittedAt;
      if (+new Date(latestAt) > +new Date(c.lastAt)) {
        c.lastAt = latestAt;
        c.name = q.name;
        c.phone = q.phone;
        c.company = q.company;
      }
    }
    const list = Array.from(map.values());
    for (const c of list) {
      c.lastMs = +new Date(c.lastAt);
      c.vip = c.totalWon >= 10000 || c.wonCount >= 2;
      c.haystack = [c.name, c.email, c.phone, c.company].filter(Boolean).join(" ").toLowerCase();
    }
    return list;
  }, [quotes]);

  const clients = useMemo(() => {
    let list = aggregated;
    if (vipOnly) list = list.filter((c) => c.vip);
    const s = dSearch.trim().toLowerCase();
    if (s) list = list.filter((c) => c.haystack.includes(s));
    // `sort` muta em sítio, por isso copiamos antes — `aggregated` é partilhado.
    return [...list].sort(
      sort === "value"
        ? (a, b) => b.totalWon - a.totalWon || b.lastMs - a.lastMs
        : sort === "pipeline"
          ? (a, b) => b.totalPipeline - a.totalPipeline || b.lastMs - a.lastMs
          : (a, b) => b.lastMs - a.lastMs,
    );
  }, [aggregated, dSearch, sort, vipOnly]);

  function exportCsv() {
    const rows: (string | number)[][] = [
      [
        "Nome",
        "Empresa",
        "Email",
        "Telefone",
        "Pedidos",
        "Ganho (€, com IVA)",
        "Pipeline (€, com IVA)",
        "Taxa conversão",
        "Último contacto",
      ],
      ...clients.map((c) => {
        const decided = c.wonCount + c.rejectedCount;
        const rate = decided > 0 ? `${Math.round((c.wonCount / decided) * 100)}%` : "—";
        return [
          c.name,
          c.company ?? "",
          c.email,
          c.phone ?? "",
          c.quotes.length,
          c.totalWon || "",
          c.totalPipeline || "",
          rate,
          new Date(c.lastAt).toLocaleDateString("pt-PT"),
        ];
      }),
    ];
    downloadCsv(`clientes-${dateStamp()}`, rows);
  }

  return (
    <div>
      {/* Controls */}
      <Toolbar
        className="mb-6"
        start={
          <>
            <div className="relative w-full sm:w-72">
              <svg
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/30"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Procurar cliente…"
                aria-label="Procurar cliente"
                className="bo-input w-full pl-10 pr-3 py-2.5 text-sm text-foreground/80 placeholder-foreground/30"
              />
            </div>
            <button
              type="button"
              onClick={() => setVipOnly((v) => !v)}
              aria-pressed={vipOnly}
              // ── `pointer-coarse:h-11`, E É O MESMO QUE O VIZINHO JÁ FAZ ───
              // MEDIDO a 375×667 e a 320×667, com toque emulado: **69×36 px**.
              // Oito abaixo do mínimo de 44 — e, pior, oito abaixo do
              // `Segmented` que está ENCOSTADO a ele nesta mesma linha, que
              // serve `h-9 pointer-coarse:h-11` e portanto já cresce para 44
              // no dedo. Um filtro e a ordenação lado a lado, com alturas
              // diferentes: o dedo que falha o VIP acerta no «Recentes».
              //
              // A correcção é copiar a regra do vizinho em vez de inventar
              // outra — assim os dois sobem juntos e não voltam a divergir.
              // Com rato ficam ambos em 36 px, que é a densidade calma que
              // esta barra quer no portátil.
              className={`inline-flex h-9 pointer-coarse:h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium motion-safe:transition-colors ${
                vipOnly
                  ? "bg-[#d6ab3a]/15 text-[#b88f28] shadow-[0_1px_2px_rgba(42,38,32,0.06)]"
                  : "bg-foreground/[0.04] text-foreground/55 hover:bg-foreground/[0.07] hover:text-foreground/75"
              }`}
            >
              <span aria-hidden="true">★</span>
              VIP
            </button>
            <Segmented
              ariaLabel="Ordenar clientes"
              size="sm"
              value={sort}
              onChange={setSort}
              options={[
                { value: "recent", label: "Recentes" },
                { value: "value", label: "Valor ganho" },
                { value: "pipeline", label: "Pipeline" },
              ]}
            />
          </>
        }
        end={
          <>
            <span className="hidden text-xs tabular-nums text-foreground/45 sm:inline">
              {clients.length} cliente{clients.length !== 1 ? "s" : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportCsv}
              iconLeft={
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path
                    d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            >
              Exportar
            </Button>
          </>
        }
      />

      {/* List */}
      <div className="flex flex-col gap-2.5">
        {clients.map((c) => {
          const isOpen = open === c.key;
          const decided = c.wonCount + c.rejectedCount;
          const convRate = decided > 0 ? Math.round((c.wonCount / decided) * 100) : -1;
          const waPhone = c.phone?.replace(/[^\d+]/g, "");

          return (
            <Card key={c.key} padding="none" className="overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : c.key)}
                aria-expanded={isOpen}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-foreground/[0.025] motion-safe:transition-colors"
              >
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ring-2 ${c.vip ? "bg-[#d6ab3a]/20 text-[#b88f28] ring-[#d6ab3a]/20" : "bg-[#4d6350] text-white ring-[#4d6350]/10"}`}
                >
                  {c.name.slice(0, 1).toUpperCase()}
                </div>

                {/* Name + email */}
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/78 text-sm font-semibold truncate flex items-center gap-2">
                    <span className="truncate">{c.name}</span>
                    {c.vip && (
                      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#d6ab3a]/15 text-[#b88f28] text-[8px] tracking-[0.12em] uppercase font-bold">
                        ★ VIP
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-foreground/30 text-xs truncate">{c.email}</p>
                    {c.company && (
                      <span className="text-foreground/22 text-[10px] hidden sm:inline truncate">
                        · {c.company}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0 text-right">
                  <div className="flex items-center gap-3">
                    {c.totalWon > 0 && (
                      <span className="text-[#4d6350] text-xs font-semibold">
                        {eur(c.totalWon)}
                      </span>
                    )}
                    {c.totalPipeline > 0 && c.totalWon === 0 && (
                      <span className="text-foreground/40 text-xs">
                        {eur(c.totalPipeline)} pipeline
                      </span>
                    )}
                    {c.totalPipeline > 0 && c.totalWon > 0 && (
                      <span className="text-foreground/28 text-[10px]">
                        +{eur(c.totalPipeline)} pipeline
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/35 text-[10px]">
                      {c.quotes.length} pedido{c.quotes.length !== 1 ? "s" : ""}
                    </span>
                    {convRate >= 0 && (
                      <span
                        className={`text-[10px] font-medium ${convRate >= 50 ? "text-[#4d6350]" : convRate >= 25 ? "text-foreground/50" : "text-foreground/30"}`}
                      >
                        {convRate}% conv.
                      </span>
                    )}
                  </div>
                </div>

                {/* Last activity + chevron */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-foreground/22 text-[10px] hidden sm:inline">
                    {timeAgo(c.lastAt)}
                  </span>
                  <span
                    className={`text-foreground/25 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-foreground/[0.07]">
                  {/* Contact bar */}
                  {/* ── OS TRÊS ATALHOS DE CONTACTO LEVAM `alvo-toque` ───────
                      MEDIDO a 375×667 e a 320×667, com toque emulado, com o
                      cliente aberto: telefone **78×16 px**, email
                      **171×16 px**, WhatsApp **75×16 px**. Dezasseis píxeis de
                      altura — pouco mais de um terço do mínimo de 44 — em três
                      links empilhados a 8 px uns dos outros (`gap-y-2`).

                      É a barra mais irónica do back office: ligar, escrever e
                      mandar WhatsApp ao cliente são as três coisas que só se
                      fazem MESMO com o telemóvel na mão, e eram os três alvos
                      mais pequenos de toda a vista. Um deles — o `tel:` — abre
                      o marcador do telefone; falhar por um pixel e acertar no
                      `mailto:` do lado troca uma chamada por um rascunho de
                      email.

                      `alvo-toque` cresce só no dedo, portanto a barra fina do
                      portátil não muda. A altura de linha do texto continua a
                      ser a mesma; o que cresce é a caixa em que se toca. */}
                  <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs bg-foreground/[0.015] border-b border-foreground/[0.05]">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="alvo-toque text-foreground/45 hover:text-[#4d6350] transition-colors flex items-center gap-1"
                      >
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.07 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="alvo-toque text-[#4d6350]/80 hover:text-[#4d6350] transition-colors flex items-center gap-1"
                      >
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                        {c.email}
                      </a>
                    )}
                    {waPhone && (
                      <a
                        href={`https://wa.me/${waPhone.replace("+", "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="alvo-toque text-[#4d6350] text-[10px] tracking-[0.08em] uppercase hover:opacity-75 transition-opacity flex items-center gap-1"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-.96.24-3.23-.67-2.73-1.08-4.46-3.86-4.6-4.04-.13-.18-1.1-1.46-1.1-2.79 0-1.33.7-1.98.95-2.25.24-.27.53-.34.7-.34.18 0 .35 0 .5.01.16.01.38-.06.6.46.23.54.77 1.87.84 2 .07.14.11.3.02.48-.09.18-.13.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.54.15.27.67 1.1 1.44 1.78.99.88 1.82 1.16 2.08 1.29.27.13.42.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.25.09 1.58.75 1.85.88.27.13.45.2.52.31.07.11.07.64-.17 1.32Z" />
                        </svg>
                        WhatsApp
                      </a>
                    )}
                    {/* Mini stats */}
                    <div className="ml-auto flex items-center gap-3">
                      {convRate >= 0 && (
                        <span className="text-foreground/35">
                          {convRate}% taxa de conversão ({c.wonCount}/{decided} decididos)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quote rows */}
                  <div className="divide-y divide-foreground/[0.06]">
                    {c.quotes
                      .slice()
                      .sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt))
                      .map((q) => (
                        <button
                          key={q.id}
                          onClick={() => onOpen(q)}
                          className="w-full text-left px-5 py-3 hover:bg-foreground/[0.025] motion-safe:transition-colors flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className="text-[9px] tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-md font-medium"
                                style={{
                                  background: `${metaFor(STATUS_META, q.status).color}18`,
                                  color: metaFor(STATUS_META, q.status).color,
                                }}
                              >
                                {metaFor(STATUS_META, q.status).label}
                              </span>
                              {q.assignedTo && (
                                <span className="text-[9px] tracking-[0.08em] uppercase px-1.5 py-0.5 rounded-md bg-[#4d6350]/10 text-[#4d6350] font-medium">
                                  {q.assignedTo}
                                </span>
                              )}
                            </div>
                            <p className="text-foreground/55 text-xs truncate">
                              {eventTypeLabel(q)} · {q.guests} convidados
                              {q.date
                                ? ` · ${new Date(q.date + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })}`
                                : ""}
                            </p>
                            {q.lostReason && (
                              <p className="text-foreground/28 text-[10px] truncate mt-0.5">
                                ↳ {q.lostReason}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            {q.quotedPrice ? (
                              // Com IVA — para bater com o «Ganho»/«Pipeline»
                              // do cliente ali em cima, que somam o mesmo campo.
                              <span className="text-[#4d6350] text-xs font-medium">
                                {eur(contractedAmounts(q).gross)}
                              </span>
                            ) : q.priceBreakdown?.total ? (
                              <span className="text-foreground/28 text-xs">
                                ≈{eur(q.priceBreakdown.total)}
                              </span>
                            ) : null}
                            <p className="text-foreground/22 text-[10px] font-mono">
                              {q.id.slice(-8)}
                            </p>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {clients.length === 0 &&
          (falhaDeLeitura ? (
            /* A leitura não voltou: aqui não se afirma nada sobre os clientes
               dela — nem que não há nenhum, nem que a procura não encontrou.
               Diz-se o que se passou e o passo a dar. */
            <AvisoDeFalha
              titulo="Não foi possível ler os pedidos"
              falha={falhaDeLeitura}
              aoTentarDeNovo={aoTentarDeNovo}
            />
          ) : (
            <Card padding="none">
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
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
                    <path
                      d="M16 5.5a3 3 0 0 1 0 5.5M21 20c0-2.5-1.8-4.3-4-4.8"
                      strokeLinecap="round"
                    />
                  </svg>
                }
                title={
                  search.trim() || vipOnly ? "Nenhum cliente encontrado" : "Sem clientes ainda"
                }
                description={
                  search.trim()
                    ? "Tenta procurar por outro nome, email ou empresa."
                    : vipOnly
                      ? "Ainda não há clientes VIP."
                      : "Os clientes formam-se automaticamente a partir dos pedidos recebidos."
                }
              />
            </Card>
          ))}
      </div>
    </div>
  );
}
