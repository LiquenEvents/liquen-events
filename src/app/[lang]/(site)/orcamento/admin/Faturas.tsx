"use client";

import { memo, useCallback, useMemo, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
// `import type` is fully erased at build time, so pulling the shape from the
// server-only store never drags its runtime `server-only` guard into this
// client bundle.
import type { Invoice } from "@/lib/invoices-store";
import { SkeletonList } from "./Skeleton";
import { eur2 } from "./util";
import { splitSinal } from "@/lib/money";
import { usePercentagemDoSinal } from "./percentagem-do-sinal";
import { contractedAmounts } from "@/lib/orcamento/dossier";
import { useToast } from "./Toast";
import { Button, Card, EmptyState, Field, Segmented } from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { metaFor } from "./status-meta";

type Status = Invoice["status"];
type Kind = Invoice["kind"];

const STATUS_META: Record<Status, { label: string; color: string }> = {
  emitida: { label: "Emitida", color: "#9aa36a" },
  paga: { label: "Paga", color: "#4d6350" },
  anulada: { label: "Anulada", color: "#b5654a" },
};

const STATUSES = Object.keys(STATUS_META) as Status[];

const PlusIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

/**
 * Rótulos do LIVRO — que mistura faturas de eventos diferentes.
 *
 * Sem percentagem, e de propósito: a percentagem do sinal é de cada proposta, e
 * aqui cada linha é de um casamento diferente. Escrever «Sinal (30%)» ao lado
 * de uma fatura emitida a 50% era dizer, com toda a confiança, um número que
 * ninguém tinha usado. Onde a percentagem é conhecida — o formulário, que sabe
 * qual é o evento escolhido — ela aparece.
 */
const KIND_LABEL: Record<Kind, string> = {
  sinal: "Sinal",
  saldo: "Saldo",
  total: "Total",
};

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d?: string) =>
  d
    ? new Date(d + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" })
    : "—";

/**
 * ── Porque é que estas duas peças estão memoizadas ────────────────────────
 *
 * Medido numa compilação de produção com 167 faturas e 300 pedidos: escrever o
 * nome do cliente no formulário "Nova fatura" custava **68 ms por tecla** até o
 * ecrã voltar a pintar (22 teclas → 1473 ms de JavaScript, 22 tarefas longas).
 * Escrever ficava a arrastar visivelmente.
 *
 * A causa não era o formulário — era tudo o que estava POR BAIXO dele. O estado
 * do formulário vive neste componente, por isso cada tecla voltava a desenhar:
 *   · o `<select>` de eventos, com **300 `<option>`**;
 *   · o livro de faturas INTEIRO, e duas vezes — a lista de telemóvel
 *     (`md:hidden`) e a tabela de secretária (`hidden md:block`) estão as duas
 *     sempre no DOM, só escondidas por CSS. São ~2700 elementos por tecla.
 *
 * Nada disto muda enquanto se escreve. Isolar as duas peças em componentes
 * `memo()` deixa o React saltá-las: o formulário continua a redesenhar-se (é o
 * que tem de acontecer), o livro e as opções não. Sem alterar comportamento
 * nenhum — mesmas linhas, mesmas ações, mesmo HTML.
 */

/** As 300 `<option>` do seletor de evento. */
const QuoteOptions = memo(function QuoteOptions({ quotes }: { quotes: Quote[] }) {
  return (
    <>
      {quotes.map((q) => (
        <option key={q.id} value={q.id}>
          {q.name} · {q.eventName || q.eventType || "evento"}
        </option>
      ))}
    </>
  );
});

const statusBadge = (i: Invoice) => (
  <span
    className="inline-block rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
    style={{
      background: `${metaFor(STATUS_META, i.status).color}18`,
      color: metaFor(STATUS_META, i.status).color,
    }}
  >
    {metaFor(STATUS_META, i.status).label}
  </span>
);

interface LedgerProps {
  rows: Invoice[];
  busyId: string | null;
  onSetStatus: (inv: Invoice, status: Status) => void;
  onRemove: (inv: Invoice) => void;
}

/** O livro de faturas: cartões no telemóvel, tabela na secretária. */
const Ledger = memo(function Ledger({ rows, busyId, onSetStatus, onRemove }: LedgerProps) {
  // Partilhado pelos dois layouts, para nunca divergirem.
  const rowActions = (i: Invoice) => (
    <>
      {i.status === "emitida" && (
        <>
          <Button
            size="sm"
            variant="subtle"
            onClick={() => onSetStatus(i, "paga")}
            disabled={busyId === i.id}
            title="Já recebeu o pagamento desta fatura"
          >
            Marcar como paga
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm(`Anular a fatura ${i.number}? Deixa de contar para o total.`))
                onSetStatus(i, "anulada");
            }}
            disabled={busyId === i.id}
            title="Cancelar esta fatura (deixa de contar para os totais)"
          >
            Anular
          </Button>
        </>
      )}
      {i.status === "paga" && (
        <span className="text-xs text-foreground/40">Pago {fmtDate(i.paidAt)}</span>
      )}
      {/* Apagar — só para faturas já anuladas (segurança fiscal:
          anula-se primeiro, depois apaga-se). */}
      {i.status === "anulada" && (
        <Button size="sm" variant="ghost" onClick={() => onRemove(i)} disabled={busyId === i.id}>
          Apagar
        </Button>
      )}
    </>
  );

  return (
    <>
      {/* Mobile: one calm card per invoice (no horizontal scroll) */}
      <ul className="divide-y divide-foreground/[0.06] md:hidden">
        {rows.map((i) => (
          <li key={i.id} className={`p-4 ${i.status === "anulada" ? "opacity-55" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground/80" title={i.clientName}>
                  {i.clientName || "—"}
                </p>
                <p className="mt-0.5 text-xs tabular-nums text-foreground/45">
                  {i.number} · {KIND_LABEL[i.kind]}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-semibold tabular-nums text-foreground/80">
                  {eur2(i.amount)}
                </p>
                <div className="mt-1">{statusBadge(i)}</div>
              </div>
            </div>
            <p className="mt-2 text-xs text-foreground/45">
              Emitida {fmtDate(i.issuedAt)}
              {i.dueAt && <> · vence {fmtDate(i.dueAt)}</>}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">{rowActions(i)}</div>
          </li>
        ))}
      </ul>

      {/* Desktop: the full ledger table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-foreground/[0.08] text-foreground/40">
              <th className="bo-eyebrow px-4 py-3.5 text-left">Nº</th>
              <th className="bo-eyebrow px-4 py-3.5 text-left">Cliente</th>
              <th className="bo-eyebrow px-4 py-3.5 text-left">Tipo</th>
              <th className="bo-eyebrow px-4 py-3.5 text-right">Valor</th>
              <th className="bo-eyebrow px-4 py-3.5 text-left">Emitida</th>
              <th className="bo-eyebrow px-4 py-3.5 text-left">Vencimento</th>
              <th className="bo-eyebrow px-4 py-3.5 text-left">Estado</th>
              <th className="bo-eyebrow px-4 py-3.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/[0.06]">
            {rows.map((i) => (
              <tr
                key={i.id}
                className={`transition-colors hover:bg-foreground/[0.02] ${i.status === "anulada" ? "opacity-55" : ""}`}
              >
                <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums text-foreground/70">
                  {i.number}
                </td>
                <td
                  className="max-w-[180px] truncate px-4 py-3.5 text-foreground/70"
                  title={i.clientName}
                >
                  {i.clientName || "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-foreground/50">
                  {KIND_LABEL[i.kind]}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums text-foreground/80">
                  {eur2(i.amount)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-foreground/45">
                  {fmtDate(i.issuedAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-foreground/45">
                  {fmtDate(i.dueAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">{statusBadge(i)}</td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center justify-end gap-1.5">{rowActions(i)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
});

interface Props {
  /** Optional events to prefill the "Nova fatura" client + total from. */
  quotes?: Quote[];
}

export default function Faturas({ quotes }: Props) {
  const { toast } = useToast();
  const {
    data: invoices = [],
    setData: setInvoices,
    loading,
    error,
    errorMessage,
    refresh,
  } = useCachedList<Invoice[]>("faturas", "/api/faturas");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // Faturas já existentes do evento escolhido — para avisar/impedir um duplo
  // sinal (o aceite da proposta pode já ter emitido o par 30/70).
  const [quoteInvoices, setQuoteInvoices] = useState<Invoice[]>([]);

  // ── New-invoice form state ──
  const [mode, setMode] = useState<"single" | "split">("split");
  const [quoteId, setQuoteId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [kind, setKind] = useState<Kind>("total");
  const [amount, setAmount] = useState("");
  const [vatRate, setVatRate] = useState("23");
  const [issuedAt, setIssuedAt] = useState(today());
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Datas + IVA têm valores predefinidos sensatos (IVA 23%, emissão hoje), por
  // isso ficam recolhidos: o essencial de uma fatura é cliente + valor.
  const [showDates, setShowDates] = useState(false);

  /**
   * A percentagem com que o SERVIDOR vai dividir este split.
   *
   * Estava escrita 30/70 nesta frase de pré-visualização, mas a rota calcula-a
   * a partir da proposta do evento (`depositPercentOf`). Numa proposta de 50%,
   * o formulário prometia «sinal 3.690,00 € + saldo 8.610,00 €» e no livro
   * apareciam duas faturas de 6.150,00 € — o ecrã a dizer uma coisa e o botão a
   * fazer outra, sobre dinheiro que já foi para o cliente.
   */
  const pctSinal = usePercentagemDoSinal(quoteId);

  async function onPickQuote(id: string) {
    setQuoteId(id);
    const q = quotes?.find((x) => x.id === id);
    if (q) {
      setClientName(q.name || "");
      setClientEmail(q.email || "");
      /**
       * ══════════════════════════════════════════════════════════════════════
       * COM IVA — e a linha anterior tirava 23 % à factura sem ninguém dar por isso
       * ══════════════════════════════════════════════════════════════════════
       *
       * Estava `q.quotedPrice ?? q.priceBreakdown?.total`. Os dois ramos deste
       * `??` NÃO estão na mesma unidade, e a diferença é exactamente o IVA:
       *
       *   · `quotedPrice` é o campo «Preço final (SEM IVA)» do estúdio;
       *   · `priceBreakdown.total` é BRUTO;
       *   · e `Invoice.amount`, que é onde isto ia parar, é «valor com IVA»
       *     (`invoice-pdf.ts`, que a partir dele calcula a base por divisão).
       *
       * Um casamento fechado por 10 000 € + IVA passava a uma factura de
       * 10 000 € COM IVA incluído — base 8 130,08 € e IVA 1 869,92 €. Faltavam
       * 2 300 € ao que o casal devia pagar, e o PDF saía internamente coerente,
       * por isso nada acusava. Só se descobre a somar o livro à mão.
       *
       * `contractedAmounts` é a cascata certa e já existia — é a mesma que o
       * dossier usa, e o comentário dela descreve este erro de ~23 % noutro
       * sítio onde já tinha sido corrigido. Este ecrã ficou para trás.
       */
      const total = contractedAmounts(q).gross;
      if (total > 0) setAmount(String(total));
    }
    // Carregar o que já foi faturado a este evento, para bloquear um 2.º sinal.
    setQuoteInvoices([]);
    if (!id) return;
    try {
      const res = await fetch(`/api/faturas?quoteId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (res.ok) setQuoteInvoices(await res.json());
    } catch {
      // Silencioso — o servidor volta a validar na emissão (guarda de duplo sinal).
    }
  }

  // Sinal/saldo não anulados já emitidos para o evento escolhido.
  const existingSinal = useMemo(
    () => quoteInvoices.find((i) => i.kind === "sinal" && i.status !== "anulada"),
    [quoteInvoices],
  );
  const existingSaldo = useMemo(
    () => quoteInvoices.find((i) => i.kind === "saldo" && i.status !== "anulada"),
    [quoteInvoices],
  );
  // O split emitiria um novo sinal — bloqueá-lo quando já existe um.
  const splitBlocked = mode === "split" && !!existingSinal;
  // Modo single: um Tipo=Sinal/Saldo repetido duplicaria a fatura (o servidor
  // recusa com 409, mas avisamos e bloqueamos já na UI). `total` fica livre.
  const dupSingle =
    mode === "single" && kind === "sinal"
      ? existingSinal
      : mode === "single" && kind === "saldo"
        ? existingSaldo
        : undefined;
  const singleBlocked = mode === "single" && !!dupSingle;
  const emitBlocked = splitBlocked || singleBlocked;

  async function submit() {
    if (!clientName.trim()) {
      toast("Indica o nome do cliente", "error");
      return;
    }
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      toast("Indica um valor válido", "error");
      return;
    }
    if (splitBlocked && existingSinal) {
      toast(`Este evento já tem sinal (${existingSinal.number})`, "error");
      return;
    }
    if (singleBlocked && dupSingle) {
      toast(`Este evento já tem ${kind} (${dupSingle.number})`, "error");
      return;
    }
    setSubmitting(true);
    try {
      /**
       * ════════════════════════════════════════════════════════════════════
       * UM IVA VAZIO NÃO É UM IVA DE ZERO POR CENTO
       * ════════════════════════════════════════════════════════════════════
       *
       * Era `parseFloat(vatRate) || 0`. Com o campo vazio — e apagá-lo com o
       * polegar no telemóvel é um gesto, ainda por cima dentro de uma secção
       * recolhida — isso dava ZERO. E o servidor aceita o zero: é um número,
       * portanto o valor por omissão de 23% nunca chegava a correr.
       *
       * Uma factura de 12.300 € saía com base 12.300 € e IVA 0,00 €. É a
       * mesma perda de cerca de 2.300 € que já tínhamos corrigido noutro
       * sítio, por outra porta — e desta vez o número impresso é internamente
       * coerente, portanto nada acusa.
       *
       * Agora: um campo vazio NÃO viaja, e o servidor aplica os 23%. Um valor
       * que não seja um número recusa-se aqui, com uma frase.
       */
      const taxa = vatRate.trim() === "" ? null : parseFloat(vatRate.replace(",", "."));
      if (taxa !== null && (!Number.isFinite(taxa) || taxa < 0 || taxa > 100)) {
        toast("Indica uma taxa de IVA válida (por exemplo, 23).", "error");
        setSubmitting(false);
        return;
      }
      const payload: Record<string, unknown> = {
        quoteId: quoteId || undefined,
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        ...(taxa === null ? {} : { vatRate: taxa / 100 }),
        issuedAt,
        dueAt: dueAt || undefined,
      };
      if (mode === "split") {
        payload.split = true;
        payload.total = value;
      } else {
        payload.kind = kind;
        payload.amount = value;
      }
      const res = await fetch("/api/faturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Erro ao criar a fatura", "error");
        return;
      }
      const created: Invoice[] = data.invoices ?? [];
      setInvoices((prev) => [...created, ...prev]);
      /**
       * ══════════════════════════════════════════════════════════════════════
       * O 30/70 PODE CORRER SÓ METADE — E ISSO NÃO É NEM ÊXITO NEM FALHA
       * ══════════════════════════════════════════════════════════════════════
       *
       * A rota emite o sinal e o saldo em dois passos. Quando o sinal fica
       * gravado e o saldo não, ela responde 201 com um `aviso` — porque um erro
       * seco fazia-a concluir que não tinha acontecido nada, tentar de novo, e
       * levar com "Já existe uma fatura de sinal": o ecrã a dizer ao mesmo
       * tempo que falhou e que já existe.
       *
       * A frase vem TAL E QUAL do servidor: é lá que se sabe que número foi
       * emitido e qual é que ficou por emitir, e é isso que ela precisa de
       * saber para não voltar a emitir o sinal. Vai como "error" de propósito —
       * não porque tenha falhado, mas porque é o único tom que interrompe, e um
       * aviso destes perdido no meio dos sucessos não serve para nada.
       */
      const aviso = typeof data.aviso === "string" ? data.aviso : "";
      if (aviso) {
        toast(aviso, "error");
      } else {
        toast(
          mode === "split"
            ? `Emitidas ${created.length} faturas (sinal + saldo)`
            : `Fatura ${created[0]?.number ?? ""} emitida`,
          "success",
        );
      }
      // Reset the transient fields, keep the date defaults handy.
      setShowForm(false);
      setQuoteId("");
      setClientName("");
      setClientEmail("");
      setAmount("");
      setDueAt("");
      setQuoteInvoices([]);
    } catch {
      toast("Erro de rede ao criar a fatura", "error");
    } finally {
      setSubmitting(false);
    }
  }

  // `useCallback` não é decoração: são estes dois que o `Ledger` memoizado
  // recebe. Se mudassem de identidade a cada tecla escrita no formulário, o
  // `memo()` nunca acertava e o livro voltava a desenhar-se na mesma.
  const setStatus = useCallback(
    async function setStatus(inv: Invoice, status: Status) {
      setBusy(inv.id);
      try {
        const res = await fetch(`/api/faturas/${inv.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast(data.error || "Não foi possível atualizar", "error");
          return;
        }
        // O PATCH pode devolver um saldo emitido automaticamente (quando se marca
        // um sinal como pago). Separamo-lo do próprio registo atualizado.
        const { saldoAutoIssued, ...updated } = data as Invoice & { saldoAutoIssued?: Invoice };
        setInvoices((prev) => {
          const next = prev.map((i) => (i.id === inv.id ? (updated as Invoice) : i));
          return saldoAutoIssued ? [saldoAutoIssued, ...next] : next;
        });
        if (saldoAutoIssued) {
          toast(`Sinal pago · saldo ${saldoAutoIssued.number} emitido automaticamente`, "success");
        } else {
          toast(status === "paga" ? "Fatura marcada como paga" : "Fatura anulada", "success");
        }
      } catch {
        toast("Erro de rede ao atualizar", "error");
      } finally {
        setBusy(null);
      }
    },
    [setInvoices, toast],
  );

  // Apagar definitivamente uma fatura — só permitido quando já está anulada
  // (a guarda fiscal vive também no servidor, que devolve 409 caso contrário).
  // Anula-se primeiro, depois apaga-se: uma fatura viva nunca se apaga por engano.
  const remove = useCallback(
    async function remove(inv: Invoice) {
      if (
        !window.confirm(
          `Apagar definitivamente a fatura ${inv.number}? Esta ação não pode ser anulada.`,
        )
      ) {
        return;
      }
      setBusy(inv.id);
      try {
        const res = await fetch(`/api/faturas/${inv.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast(data.error || "Não foi possível apagar", "error");
          return;
        }
        setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
        toast("Fatura apagada", "success");
      } catch {
        toast("Erro de rede ao apagar", "error");
      } finally {
        setBusy(null);
      }
    },
    [setInvoices, toast],
  );

  const filtered = useMemo(
    () => (filter === "all" ? invoices : invoices.filter((i) => i.status === filter)),
    [invoices, filter],
  );

  // Totals: emitido = tudo o que não está anulado; pago = faturas pagas;
  // em dívida = emitido − pago (o que falta receber).
  // A mesma passagem conta as faturas por estado, para os chips do filtro: antes
  // eram três `invoices.filter()` completos por cada render (e havia um render
  // por tecla escrita no formulário).
  const totals = useMemo(() => {
    let emitido = 0;
    let pago = 0;
    const counts: Record<string, number> = {};
    for (const i of invoices) {
      counts[i.status] = (counts[i.status] ?? 0) + 1;
      if (i.status === "anulada") continue;
      emitido += i.amount;
      if (i.status === "paga") pago += i.amount;
    }
    return { emitido, pago, divida: Math.max(0, emitido - pago), counts };
  }, [invoices]);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * UM LIVRO QUE NÃO SE CONSEGUIU ABRIR NÃO DIZ "EM DÍVIDA 0,00 €"
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O `useCachedList` devolve `data` indefinido tanto com o livro vazio como
   * com a leitura rebentada, e este ecrã só olhava para o `loading`. Com o
   * servidor em baixo os três cartões de topo passavam a AFIRMAR
   * "Emitido 0,00 € · Pago 0,00 € · Em dívida 0,00 €".
   *
   * Nenhum outro estado vazio custa isto. "Em dívida 0,00 €" é uma frase sobre
   * o dinheiro dela, e é a frase que a faz não ir atrás de um saldo por cobrar
   * — nem sequer levanta a pergunta, porque não parece haver nada por
   * responder. Um total em euros só se escreve depois de se ter lido o livro.
   *
   * A falha vem ANTES do esqueleto porque, com `error` a verdade já é
   * conhecida. Quando há dados em cache continuamos a mostrar o livro (velho,
   * mas verdadeiro) — ver o mesmo desenho no ecrã Material.
   */
  if (error && invoices.length === 0) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler as faturas"
        mensagem={errorMessage}
        aoTentarDeNovo={refresh}
      />
    );
  }

  if (loading) return <SkeletonList rows={5} />;

  return (
    <div>
      {/* Totals + primary action */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="grid flex-1 grid-cols-3 gap-3 min-w-[280px]">
          {[
            { l: "Emitido", v: eur2(totals.emitido), c: "text-foreground/80" },
            { l: "Pago", v: eur2(totals.pago), c: "text-[#4d6350]" },
            {
              l: "Em dívida",
              v: eur2(totals.divida),
              c: totals.divida > 0 ? "text-[#8a2a22]" : "text-foreground/40",
            },
          ].map((k) => (
            <Card key={k.l} padding="sm">
              <p className={`text-lg font-semibold tabular-nums ${k.c}`}>{k.v}</p>
              <p className="bo-eyebrow mt-1.5">{k.l}</p>
            </Card>
          ))}
        </div>
        <Button
          variant={showForm ? "secondary" : "primary"}
          iconLeft={showForm ? undefined : PlusIcon}
          onClick={() => setShowForm((s) => !s)}
          className="w-full shrink-0 sm:w-auto"
        >
          {showForm ? "Fechar" : "Nova fatura"}
        </Button>
      </div>

      {/* New-invoice form */}
      {showForm && (
        <Card className="mb-8">
          {/* Mode toggle */}
          <div className="mb-6">
            <Segmented
              ariaLabel="Como queres faturar"
              value={mode}
              onChange={setMode}
              options={[
                { value: "split", label: "Sinal + Saldo (30/70)" },
                { value: "single", label: "Fatura única" },
              ]}
            />
            <p className="mt-2.5 text-xs leading-relaxed text-foreground/50">
              {mode === "split"
                ? `Cria duas faturas de uma vez: o sinal (entrada de ${pctSinal}% agora) e o saldo (os ${100 - pctSinal}% restantes).`
                : "Cria só uma fatura — pode ser o total, só o sinal ou só o saldo."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quotes && quotes.length > 0 && (
              <Field
                as="select"
                label="Evento (opcional)"
                value={quoteId}
                onChange={(e) => void onPickQuote(e.target.value)}
                containerClassName="sm:col-span-2"
              >
                <option value="">— Escolher para preencher —</option>
                <QuoteOptions quotes={quotes} />
              </Field>
            )}

            <Field
              label="Cliente"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nome do cliente"
            />
            <Field
              label="E-mail"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="cliente@email.pt"
            />

            {mode === "single" && (
              <Field
                as="select"
                label="Tipo"
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
              >
                <option value="total">Total</option>
                <option value="sinal">Sinal ({pctSinal}%)</option>
                <option value="saldo">Saldo ({100 - pctSinal}%)</option>
              </Field>
            )}

            <Field
              // «com IVA» no rótulo, e não só no código: é o que o campo espera
              // (`Invoice.amount` é bruto) e é o que evita que alguém volte a
              // escrever aqui o preço sem IVA à mão.
              label={mode === "split" ? "Total do evento (€, com IVA)" : "Valor (€, com IVA)"}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
            />
          </div>

          {/* Datas e IVA — recolhidas por omissão (têm valores predefinidos) */}
          <div className="mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDates((s) => !s)}
              aria-expanded={showDates}
              iconRight={
                <svg
                  className={`motion-safe:transition-transform ${showDates ? "rotate-180" : ""}`}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
            >
              Datas e IVA
            </Button>
            {showDates && (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field
                  label="IVA (%)"
                  type="number"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                />
                <Field
                  label="Emissão"
                  type="date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                />
                <Field
                  label="Vencimento (opcional)"
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
            )}
          </div>

          {splitBlocked && existingSinal ? (
            <p className="mt-4 text-sm leading-relaxed text-[#8a2a22]">
              Este evento já tem um sinal emitido ({existingSinal.number}). Para não faturar o sinal
              duas vezes, usa “Fatura única” (só o saldo) em vez do split.
            </p>
          ) : singleBlocked && dupSingle ? (
            <p className="mt-4 text-sm leading-relaxed text-[#8a2a22]">
              Este evento já tem uma fatura de {kind} ({dupSingle.number}). Para não a faturar duas
              vezes, escolhe outro tipo ou anula a existente primeiro.
            </p>
          ) : (
            mode === "split" &&
            amount &&
            parseFloat(amount) > 0 && (
              <p className="mt-4 text-sm leading-relaxed text-foreground/55">
                Serão emitidas duas faturas: sinal{" "}
                {eur2(splitSinal(parseFloat(amount), pctSinal).sinal)} + saldo{" "}
                {eur2(splitSinal(parseFloat(amount), pctSinal).saldo)}.
              </p>
            )
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              loading={submitting}
              disabled={emitBlocked}
              title={
                splitBlocked
                  ? "Este evento já tem um sinal emitido"
                  : singleBlocked
                    ? `Este evento já tem uma fatura de ${kind}`
                    : undefined
              }
            >
              {submitting ? "A emitir…" : "Emitir"}
            </Button>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        <Button
          size="sm"
          variant={filter === "all" ? "subtle" : "ghost"}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          Todas · {invoices.length}
        </Button>
        {STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? "subtle" : "ghost"}
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
          >
            {STATUS_META[s].label} · {totals.counts[s] ?? 0}
          </Button>
        ))}
      </div>

      {/* Ledger table */}
      <Card padding="none" className="overflow-hidden">
        {filtered.length === 0 ? (
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title={filter !== "all" ? "Nenhuma fatura neste estado" : "Sem faturas ainda"}
            description={
              filter !== "all"
                ? "Muda de filtro para ver outras."
                : "Emite a primeira fatura com o botão “Nova fatura”."
            }
            action={
              filter === "all"
                ? { label: "Nova fatura", onClick: () => setShowForm(true) }
                : undefined
            }
          />
        ) : (
          <Ledger rows={filtered} busyId={busy} onSetStatus={setStatus} onRemove={remove} />
        )}
      </Card>
    </div>
  );
}
