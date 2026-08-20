"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { parseMoney, randomId, eur2, todayKey, isDateKey } from "./util";
import { Button } from "./ui";
import { useToast } from "./Toast";
import type { Quote, Payment, PaymentKind } from "@/lib/orcamento/types";
import { splitSinal } from "@/lib/money";
import { usePercentagemDoSinal } from "./percentagem-do-sinal";
import { computeEventMetrics, paidTotal, type DossierData } from "@/lib/orcamento/dossier";

const KIND_LABEL: Record<PaymentKind, string> = {
  sinal: "Sinal",
  pagamento: "Pagamento",
  saldo: "Saldo final",
};
const KIND_ORDER: PaymentKind[] = ["sinal", "pagamento", "saldo"];

/** Métodos habituais — juntam-se aos usados neste evento, que vêm primeiro. */
const METHOD_SUGGESTIONS = ["MB Way", "Transferência", "Numerário", "Multibanco", "Cheque"];

/**
 * Colunas partilhadas pelo cabeçalho, pela linha de registo e por cada linha de
 * pagamento — é isto que faz o formulário ficar alinhado com a tabela por baixo.
 *
 * Larguras próprias por campo, não `flex flex-wrap`: a linha em flex empilhava
 * em coluna assim que o contentor apertava (painel do estúdio, tablet), que era
 * exactamente onde precisava de continuar uma linha. O limiar é uma *container
 * query* (`@min-[36rem]`), não um breakpoint de ecrã: o que manda é a largura do
 * painel, não a da janela.
 */
const GRID =
  "grid items-center gap-x-2 gap-y-1.5 grid-cols-2 " +
  "@min-[36rem]:gap-y-0 " +
  "@min-[36rem]:grid-cols-[6.25rem_5.5rem_7.25rem_minmax(3.5rem,1fr)_5rem_5.5rem]";

/** Data curta para a tabela de pagamentos ("12 mai"). */
const fmtRowDate = (d: string) =>
  isDateKey(d)
    ? new Date(d + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" })
    : d || "—";

/** Número → texto do campo "Valor €" em hábito pt-PT ("450,00"). */
const fmtAmountInput = (n: number) => n.toFixed(2).replace(".", ",");

/** Dia de ontem como chave LOCAL `YYYY-MM-DD` (mesmo cuidado do `todayKey`). */
function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Operação que o servidor recusou — a linha fica marcada, com "Repetir". */
interface FailedOp {
  /** Pagamento afectado (marca a linha; se já não existir, mostra o fantasma). */
  id: string;
  /** A lista que deve voltar a ser tentada tal e qual. */
  next: Payment[];
  /** Cópia do pagamento para desenhar a linha que o registo perdeu. */
  ghost: Payment | null;
  label: string;
}

interface Props {
  quote: Quote;
  onChange: (payments: Payment[]) => void;
  /**
   * Notifica o pai quando o Nº de contrato é gravado, para o estado partilhado
   * (selected/quotes) não ficar velho — o ciclo de vida e o CSV dependem dele.
   */
  onContractRef?: (ref: string) => void;
}

export default function PaymentsPanel({ quote, onChange, onContractRef }: Props) {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>(quote.payments ?? []);
  const [kind, setKind] = useState<PaymentKind>("sinal");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayKey());
  // Registar assume, por omissão, que o dinheiro JÁ foi recebido (é o caso comum:
  // "colocar o que já foi pago") — assim "Recebido" sobe logo. Desligar regista
  // um pagamento previsto/por receber.
  const [paidOnAdd, setPaidOnAdd] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [contractRef, setContractRef] = useState(quote.contractRef ?? "");
  const [savingRef, setSavingRef] = useState(false);
  // Edição inline do valor de uma linha (sem modal): clico, altero, Enter.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [failed, setFailed] = useState<FailedOp | null>(null);

  // O foco volta sempre ao PRIMEIRO campo depois de registar — é isso que
  // permite encadear pagamentos sem tocar no rato.
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  // Evita que o `blur` provocado pelo Enter grave a mesma edição duas vezes.
  const committing = useRef(false);
  // Ela já mexeu no valor (escreveu, limpou, ou escolheu um atalho)? A partir
  // daí o campo é dela e nada lhe volta a escrever por cima.
  const valorTocado = useRef(false);

  // Dossier "sintético" só com o que as funções puras precisam; usa os
  // pagamentos *vivos* (state) para o topo reagir aos toggles sem esperar
  // pela gravação.
  const dossier: DossierData = useMemo(
    () => ({ quote: { ...quote, payments }, proposal: null, contract: null }),
    [quote, payments],
  );
  const metrics = useMemo(() => computeEventMetrics(dossier), [dossier]);

  async function saveContractRef() {
    const next = contractRef.trim();
    if (next === (quote.contractRef ?? "")) return;
    setSavingRef(true);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // null (não undefined): limpar o campo tem de chegar ao servidor —
        // undefined desaparece no JSON e o valor antigo voltava sozinho.
        body: JSON.stringify({ contractRef: next || null }),
      });
      if (!res.ok) throw new Error();
      onContractRef?.(next);
      toast("Nº de contrato guardado", "success");
    } catch {
      toast("Não foi possível guardar o nº de contrato. Tenta novamente.", "error");
    } finally {
      setSavingRef(false);
    }
  }

  // Total COM IVA (o que o cliente paga): a mesma base dos pagamentos, que são
  // com IVA. Antes usava-se `contracted`, que para um preço manual (quotedPrice,
  // sem IVA) deixava o "Em falta" errado em ~23%.
  const total = metrics.contractedGross; // proposta > preço cotado > estimativa
  const totalNet = metrics.contractedNet;
  const totalIva = metrics.contractedIva;
  // ── "RECEBIDO" É O QUE ESTÁ REGISTADO COMO RECEBIDO ──────────────────────
  //
  // Este número já foi de tudo. Foi o livro de faturas sozinho, e só mexia ao
  // emitir uma factura («registo um pagamento e nada muda»). Depois passou a
  // somar as duas fontes espécie a espécie, para não perder o dinheiro que
  // entrava por um lado e não pelo outro.
  //
  // Agora há uma fonte só — a facturação saiu desta casa — e é a que ela
  // alimenta: as linhas de pagamento deste painel, mesmo aqui em baixo. Sobe ao
  // vivo à medida que se marcam como recebidas, que é o comportamento que ela
  // conhece e o que este ecrã sempre prometeu.
  const headlinePaid = useMemo(() => paidTotal(dossier.quote), [dossier]);
  const outstanding = Math.max(0, total - headlinePaid);
  // Estado "tudo recebido" só faz sentido quando há um total contratado.
  const allReceived = total > 0 && outstanding === 0;
  // Aviso suave: registaram-se recebimentos acima do total contratado.
  const overReceived = total > 0 && headlinePaid > total;
  // Faseamento sobre o total com IVA — alimenta os atalhos de registo.
  //
  // A percentagem é a da PROPOSTA deste pedido, não 30% fixos: é ela que as
  // rotas de facturação usam para emitir o sinal e o saldo. Enquanto isto
  // dividia sempre 30/70, o atalho oferecia 369 € numa proposta de 50% cuja
  // factura de sinal era de 615 € — ela registava o que o botão dizia e o «Em
  // falta» ficava errado a partir daí, sem nada no ecrã a denunciá-lo.
  const pctSinal = usePercentagemDoSinal(quote.id);
  const split = useMemo(() => splitSinal(total, pctSinal), [total, pctSinal]);
  const today = todayKey();
  const yesterday = useMemo(() => yesterdayKey(), []);

  // ── Pré-visualização ao vivo (só apresentação; não mexe em nada gravado) ──
  // Enquanto se escreve o valor, o topo mostra onde Recebido/Em falta vão ficar.
  const draft = parseMoney(amount) ?? 0;
  const draftValid = draft > 0;
  const previewPaid = headlinePaid + (draftValid && paidOnAdd ? draft : 0);
  const previewOutstanding = Math.max(0, total - previewPaid);
  const pct = total > 0 ? Math.min(100, (headlinePaid / total) * 100) : 0;
  const pctDraft =
    total > 0 && draftValid && paidOnAdd
      ? Math.max(0, Math.min(100 - pct, (draft / total) * 100))
      : 0;

  // O último tipo/método usados ficam à cabeça — é o que se repete no dia-a-dia.
  const lastKind = payments.length > 0 ? payments[payments.length - 1].kind : null;
  const kindOptions = useMemo(
    () => (lastKind ? [lastKind, ...KIND_ORDER.filter((k) => k !== lastKind)] : KIND_ORDER),
    [lastKind],
  );
  const methodOptions = useMemo(() => {
    const used: string[] = [];
    for (let i = payments.length - 1; i >= 0; i--) {
      const n = payments[i].note?.trim();
      if (n && !used.some((u) => u.toLowerCase() === n.toLowerCase())) used.push(n);
    }
    return [
      ...used,
      ...METHOD_SUGGESTIONS.filter((m) => !used.some((u) => u.toLowerCase() === m.toLowerCase())),
    ];
  }, [payments]);

  // Ecrã vazio útil: em vez de uma caixa a dizer que não há nada, a linha de
  // registo já vem com o sinal da proposta preenchido — falta carregar em Registar.
  //
  // ── E ACOMPANHA A PERCENTAGEM ATÉ ELA MEXER ─────────────────────────────
  // A percentagem do sinal vem da lista leve de propostas, por rede: no
  // primeiro desenho vale ainda a da casa (30%). Enquanto isto se preenchia
  // UMA só vez, o campo ficava com os 369,00 € dos 30% e o atalho ao lado, já
  // com a resposta, dizia «Sinal 50% · 615,00 €» — dois números para a mesma
  // coisa, e o botão Registar grava o do campo.
  //
  // Por isso a condição não é "já preenchi", é "ela ainda não mexeu": enquanto
  // o valor for uma sugestão nossa, é nosso dever mantê-lo certo; a partir do
  // momento em que é dela, não se lhe toca (ver `valorTocado`).
  useEffect(() => {
    if (valorTocado.current || payments.length > 0 || total <= 0) return;
    setKind("sinal");
    setAmount(fmtAmountInput(split.sinal));
  }, [payments.length, total, split.sinal]);

  // Foco (e seleção) no campo de edição inline assim que ele aparece.
  useEffect(() => {
    if (!editingId) return;
    editRef.current?.focus();
    editRef.current?.select();
  }, [editingId]);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * DE ONDE ESTA LISTA FOI COPIADA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Este painel copia `quote.payments` UMA vez, quando monta (`useState`, lá em
   * cima), e está preso por `key` ao id do pedido — não volta a ler a
   * propriedade quando ela mudar. Ao gravar manda a lista INTEIRA, portanto a
   * gravação não é «marca este pagamento como recebido»: é «substitui a lista
   * de pagamentos por esta».
   *
   * O que isso fazia, sem corrida nenhuma: painel aberto de manhã no telemóvel,
   * um pagamento dado por recebido no portátil ao meio-dia, um toque no
   * telemóvel à tarde — e o `paid: true` voltava a `false`, com as duas
   * gravações a responder 200. É dinheiro a mudar de estado sozinho, e muda a
   * coluna do Quadro e a margem do evento.
   *
   * `base` é a versão de que esta lista partiu. Vai no pedido, o servidor
   * compara-a com a que tem guardada e recusa com 409 se alguém lhe mexeu no
   * meio.
   *
   * ── PORQUE É QUE AVANÇA AO ENVIAR E NÃO AO CONFIRMAR ────────────────────
   *
   * Dois cliques seguidos dela põem dois PATCH no ar, e o segundo leva a lista
   * inteira JÁ COM o primeiro lá dentro. Se a base só avançasse na confirmação,
   * o segundo pedido declarava a versão de antes do primeiro e o servidor
   * recusava-o — uma colisão inventada, dela consigo própria, no meio de um
   * gesto normal. Avança ao enviar, e volta atrás se a gravação falhar.
   */
  const base = useRef<Payment[]>(quote.payments ?? []);

  /**
   * Gravação otimista COM REVERSÃO: se o servidor recusar, o dinheiro não pode
   * ficar diferente no ecrã e na base de dados sem ninguém dar por isso. Além de
   * reverter, marca a linha em causa e guarda a tentativa para o botão "Repetir".
   */
  function persist(next: Payment[], op: { id: string; ghost?: Payment | null; label: string }) {
    const snapshot = payments;
    setPayments(next);
    onChange(next);
    setFailed((f) => (f && f.id === op.id ? null : f));
    const baseAnterior = base.current;
    base.current = next;
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payments: next, base: { payments: baseAnterior } }),
    })
      .then(async (res) => {
        /**
         * 409 NÃO é «tenta outra vez». É «isto mudou noutro sítio», e repetir
         * seria escrever por cima do que a outra pessoa acabou de fazer — que é
         * exactamente o que este guarda existe para impedir. Por isso NÃO se
         * marca a linha para o botão «Repetir»: adopta-se o que o servidor tem,
         * diz-se-lhe, e ela decide o que fazer já a olhar para a verdade.
         */
        if (res.status === 409) {
          const corpo = (await res.json().catch(() => null)) as {
            current?: { payments?: Payment[] };
          } | null;
          const doServidor = corpo?.current?.payments ?? snapshot;
          setPayments(doServidor);
          onChange(doServidor);
          base.current = doServidor;
          setFailed(null);
          toast(
            "Os pagamentos foram alterados noutro sítio. Está aqui a versão guardada.",
            "error",
          );
          return;
        }
        if (!res.ok) throw new Error();
      })
      .catch(() => {
        base.current = baseAnterior;
        setPayments(snapshot);
        onChange(snapshot);
        setFailed({ id: op.id, next, ghost: op.ghost ?? null, label: op.label });
        toast("Não foi possível guardar. Usa o Repetir na linha marcada.", "error");
      });
  }

  function retryFailed() {
    if (!failed) return;
    persist(failed.next, { id: failed.id, ghost: failed.ghost, label: failed.label });
  }

  /** Submissão do formulário — Enter em QUALQUER campo passa por aqui. */
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // parseMoney entende "1.500", "1500,50" e "1 500€" — parseFloat lia 1,5 €.
    const a = parseMoney(amount);
    if (!a || a <= 0) {
      setFormError("Escreve um valor maior que zero.");
      amountRef.current?.focus();
      return;
    }
    const p: Payment = {
      id: randomId(),
      kind,
      amount: a,
      date: isDateKey(date) ? date : todayKey(),
      paid: paidOnAdd,
      note: note.trim() || undefined,
    };
    persist([...payments, p], {
      id: p.id,
      ghost: p,
      label: `${KIND_LABEL[p.kind]} ${eur2(p.amount)}`,
    });
    setAmount("");
    setNote("");
    setFormError(null);
    // De volta ao início da linha, pronto para o pagamento seguinte.
    firstFieldRef.current?.focus();
  }

  function togglePaid(p: Payment) {
    persist(
      payments.map((x) => (x.id === p.id ? { ...x, paid: !x.paid } : x)),
      { id: p.id, ghost: null, label: `${KIND_LABEL[p.kind]} ${eur2(p.amount)}` },
    );
  }
  function remove(p: Payment) {
    persist(
      payments.filter((x) => x.id !== p.id),
      { id: p.id, ghost: p, label: `${KIND_LABEL[p.kind]} ${eur2(p.amount)}` },
    );
  }

  function startEdit(p: Payment) {
    committing.current = false;
    setEditingId(p.id);
    setEditValue(fmtAmountInput(p.amount));
  }
  function cancelEdit() {
    committing.current = true;
    setEditingId(null);
    setEditValue("");
  }
  /** Grava a edição inline. Chamada pelo Enter e pelo blur — só corre uma vez. */
  function commitEdit(p: Payment) {
    if (committing.current) return;
    committing.current = true;
    const v = parseMoney(editValue);
    setEditingId(null);
    setEditValue("");
    if (v == null || !(v > 0) || v === p.amount) return;
    persist(
      payments.map((x) => (x.id === p.id ? { ...x, amount: v } : x)),
      { id: p.id, ghost: null, label: `${KIND_LABEL[p.kind]} ${eur2(v)}` },
    );
  }

  /** Sugestão de valor: um clique preenche o campo (e o tipo, quando é óbvio). */
  function suggest(value: number, k?: PaymentKind) {
    if (k) setKind(k);
    // Escolha dela, sobre um número que estava no ecrã: o valor passa a ser
    // dela e o pré-preenchimento não volta a mexer-lhe.
    valorTocado.current = true;
    setAmount(fmtAmountInput(value));
    setFormError(null);
    amountRef.current?.focus();
  }

  /** Mudar o tipo no select pré-preenche o valor se o campo estiver vazio. */
  function pickKind(k: PaymentKind) {
    setKind(k);
    if (amount.trim() !== "" || total <= 0) return;
    // O sinal continua a ser sugestão nossa (fica a acompanhar a percentagem da
    // proposta); o saldo é um número que só faz sentido agora, e esse fixa-se.
    if (k === "sinal") setAmount(fmtAmountInput(split.sinal));
    else if (k === "saldo" && outstanding > 0) {
      valorTocado.current = true;
      setAmount(fmtAmountInput(outstanding));
    }
  }

  /**
   * Os atalhos que preenchem o formulário: «Sinal 30% · 450 €», «50% · …»,
   * «Hoje», «Ontem».
   *
   * MEDIDO a 375 px: 45×28 e 56×28 — abaixo dos 44 de altura das guidelines, e
   * encostados uns aos outros numa fila. Errar o toque aqui não é inócuo: entre
   * «Hoje» e «Ontem» está a diferença entre datar um recebimento no dia certo e
   * no dia errado, e entre «Sinal» e «50%» está o dobro do valor.
   *
   * `alvo-toque` só cresce sob `(pointer: coarse)`; com rato a fila mantém a
   * densidade que tem. O `inline-flex` que a classe traz é o que estes já são
   * na prática, portanto o desenho não muda — cresce a caixa em que se toca.
   */
  const chip =
    "alvo-toque rounded-full border border-foreground/[0.12] bg-foreground/[0.02] px-2.5 py-1 " +
    "text-[11px] tabular-nums text-foreground/65 hover:border-[#4d6350]/50 hover:text-[#4d6350] " +
    "motion-safe:transition-colors";
  const ghostFailed = Boolean(failed?.ghost && !payments.some((p) => p.id === failed.id));

  return (
    // `@container`: as colunas do formulário/tabela reagem à largura DESTE painel
    // (que muda entre o estúdio, o separador Financeiro e o tablet), não à janela.
    <div className="@container border-t border-foreground/10 pt-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="bo-eyebrow">Pagamentos</p>
        {/* Contract reference */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="payments-contract-ref"
            className="text-foreground/45 text-[10px] tracking-[0.15em] uppercase"
          >
            Ref.
          </label>
          <input
            id="payments-contract-ref"
            value={contractRef}
            onChange={(e) => setContractRef(e.target.value)}
            onBlur={saveContractRef}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveContractRef();
            }}
            placeholder="2026-001"
            className={`bo-input w-24 px-2.5 py-1.5 text-xs text-foreground/80 ${savingRef ? "opacity-50" : ""}`}
            title="Número de referência do contrato"
          />
        </div>
      </div>

      {/* ── Resumo — as três respostas que importam, numa linha ──
          Recebido = pagamentos marcados como pagos (atualiza ao vivo). "Em
          falta" é o herói quando há dinheiro por receber; quando está tudo
          recebido vira um estado calmo de confirmação.

          ── PORQUE É QUE AS TRÊS COLUNAS TÊM UM LIMIAR ─────────────────────
          Três colunas fixas partiam os números no telemóvel. Medido num
          iPhone SE (375 px), com este painel a 343 px de largura: cada célula
          dava 68 px de conteúdo, e "22 650,45 €" precisa de 94 px, o "Em
          falta" (que é maior, `text-lg`) precisa de 106 px, e a linha do IVA
          partia-se em QUATRO. O número transbordava da célula e ia por cima da
          vizinha — e é este o número que ela lê para decidir se já pode
          facturar.

          Duas colunas dão 142 px de conteúdo a cada uma, que chega com folga
          para os dois. As três só voltam quando o PAINEL (não a janela: ele
          vive no dossier, no separador Financeiro e no estúdio) tem 26 rem —
          3 × 130 px de célula mais os intervalos, que é o mínimo em que o "Em
          falta" cabe inteiro.

          O "Em falta" atravessa as duas colunas em baixo, e não fica meio a
          meio com o "Recebido": é o herói deste bloco, e uma linha só para ele
          é a leitura que já tinha no computador. */}
      <div className="grid grid-cols-2 @min-[26rem]:grid-cols-3 gap-2.5 mb-1.5">
        <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-3 text-center">
          <p className="text-base font-semibold tabular-nums text-foreground/85">{eur2(total)}</p>
          <p className="text-foreground/40 text-[9px] tracking-[0.2em] uppercase mt-1">
            Total (c/ IVA)
          </p>
          <p className="text-foreground/35 text-[9px] tabular-nums mt-1 leading-tight">
            s/ IVA {eur2(totalNet)} · IVA {eur2(totalIva)}
          </p>
        </div>
        <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-3 text-center">
          <p className="text-base font-semibold tabular-nums text-[#4d6350]">
            {eur2(headlinePaid)}
          </p>
          <p className="text-foreground/40 text-[9px] tracking-[0.2em] uppercase mt-1">Recebido</p>
        </div>
        {allReceived ? (
          <div className="col-span-2 @min-[26rem]:col-span-1 rounded-xl border border-[#4d6350]/25 bg-[#4d6350]/[0.05] p-3 text-center flex flex-col items-center justify-center">
            <p className="text-sm font-semibold text-[#4d6350] inline-flex items-center gap-1.5">
              Tudo recebido
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                aria-hidden="true"
              >
                <path d="M4 12.5 9.5 18 20 6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </p>
            <p className="text-[#4d6350]/60 text-[9px] tracking-[0.2em] uppercase mt-1">Em falta</p>
          </div>
        ) : (
          <div
            className={`col-span-2 @min-[26rem]:col-span-1 rounded-xl border p-3 text-center ${
              outstanding > 0
                ? "border-[#b5654a]/35 bg-[#b5654a]/[0.05]"
                : "border-foreground/[0.06] bg-foreground/[0.02]"
            }`}
          >
            <p
              className={`font-semibold tabular-nums ${
                outstanding > 0 ? "text-lg text-[#b5654a]" : "text-base text-foreground/45"
              }`}
            >
              {eur2(outstanding)}
            </p>
            <p
              className={`text-[9px] tracking-[0.2em] uppercase mt-1 ${
                outstanding > 0 ? "text-[#b5654a]/70" : "text-foreground/40"
              }`}
            >
              Em falta
            </p>
          </div>
        )}
      </div>

      {/* Barra do recebido face ao total. O segmento claro é o valor que está a
          ser escrito agora — pré-visualização, ainda não gravada. */}
      {total > 0 && (
        <div
          role="progressbar"
          aria-label="Percentagem recebida do total"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-valuetext={`${Math.round(pct)}% recebido de ${eur2(total)}`}
          className="flex h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
        >
          <div className="h-full bg-[#4d6350]" style={{ width: `${pct}%` }} />
          <div className="h-full bg-[#4d6350]/35" style={{ width: `${pctDraft}%` }} />
        </div>
      )}
      {/* Linha de altura fixa: alterna entre a nota fixa e a pré-visualização —
          o texto muda enquanto se escreve, a altura nunca (zero saltos). */}
      <p className="text-foreground/35 text-[10px] min-h-[1.1rem] leading-[1.1rem] mt-1.5 mb-3">
        {draftValid && paidOnAdd && total > 0 ? (
          <span className="text-foreground/55 tabular-nums">
            Com este registo: recebido {eur2(previewPaid)} · em falta {eur2(previewOutstanding)}
          </span>
        ) : (
          "Recebido e Em falta atualizam à medida que marca cada pagamento como pago."
        )}
      </p>

      {/* Aviso suave: recebido acima do total contratado (mesmo estilo do banner
          de reconciliação — algo para verificar, não um erro bloqueante). */}
      {overReceived && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-[#c99a3a]/40 bg-[#c99a3a]/[0.08] px-3.5 py-2.5 mb-4"
        >
          <svg
            className="text-[#a9781f] shrink-0 mt-0.5"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path
              d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="min-w-0">
            <p className="text-[#a9781f] text-xs font-medium leading-snug">
              Recebido excede o total contratado ({eur2(headlinePaid)} de {eur2(total)}).
            </p>
            <p className="text-foreground/45 text-[11px] mt-0.5">
              Verifica os valores registados ou o total do contrato.
            </p>
          </div>
        </div>
      )}

      {/* ── Linha única de registo ──
          Um <form> a sério: dá submissão implícita (Enter em qualquer campo) e o
          comportamento de teclado certo, de graça. */}
      <p className="text-foreground/45 text-[10px] tracking-[0.2em] uppercase mb-2">
        Registar pagamento
      </p>

      {/* Cabeçalho das colunas — também serve de rótulo visível ao formulário.
          Só aparece quando a linha única cabe. */}
      <div
        aria-hidden="true"
        className={`${GRID} @max-[36rem]:hidden text-foreground/30 text-[9px] tracking-[0.12em] uppercase mb-1`}
      >
        <span>Tipo</span>
        <span className="text-right">Valor</span>
        <span>Data</span>
        <span>Método</span>
        <span>Estado</span>
        <span />
      </div>

      <form onSubmit={submit} aria-label="Registar pagamento" className={GRID}>
        <select
          ref={firstFieldRef}
          aria-label="Tipo de pagamento"
          value={kind}
          onChange={(e) => pickKind(e.target.value as PaymentKind)}
          className="bo-input px-2 py-2 text-xs text-foreground/70"
        >
          {kindOptions.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          ref={amountRef}
          type="text"
          inputMode="decimal"
          aria-label="Valor em euros"
          aria-invalid={formError ? true : undefined}
          value={amount}
          onChange={(e) => {
            valorTocado.current = true;
            setAmount(e.target.value);
            if (formError) setFormError(null);
          }}
          placeholder="0,00"
          className="bo-input px-2 py-2 text-xs text-right tabular-nums text-foreground/85"
        />
        <input
          type="date"
          aria-label="Data do pagamento"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bo-input px-2 py-2 text-xs text-foreground/70"
        />
        <input
          type="text"
          aria-label="Método ou nota (opcional)"
          list="payments-method-list"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="MB Way…"
          className="bo-input px-2 py-2 text-xs text-foreground/70"
        />
        {/* ── 163×18 NUM TELEMÓVEL ────────────────────────────────────────
            MEDIDO a 375 px: o alvo deste interruptor era 163×18 — menos de
            metade dos 44 de altura. E é o que decide se a linha que se está a
            registar já entrou ou é só um plano: falhá-lo dá um pagamento
            marcado por receber quando o dinheiro já cá está (ou o contrário),
            e é essa marca que faz o pedido passar a «Ganho» (ver o PATCH em
            `api/orcamento/[id]/route.ts`).

            Cresce o RÓTULO, não o quadrado: o HTML manda o toque no rótulo
            activar o controlo, e o desenho fica igual. `alvo-toque` só age sob
            `(pointer: coarse)`. */}
        <label className="alvo-toque !justify-start inline-flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-foreground/65">
          <input
            type="checkbox"
            checked={paidOnAdd}
            onChange={(e) => setPaidOnAdd(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#4d6350]"
          />
          Já pago
        </label>
        {/* Nunca `disabled`: um botão apagado lê-se como avariado. Com o valor
            em falta, carregar aponta o erro e devolve o foco ao campo. */}
        <Button type="submit" size="sm" fullWidth>
          Registar
        </Button>
      </form>

      {/* Fora da grelha do formulário (é um elemento invisível, não uma coluna).
          Últimos métodos usados primeiro, depois os habituais. */}
      <datalist id="payments-method-list">
        {methodOptions.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {/* Linha de altura fixa para o erro / atalho de teclado. */}
      <p
        className={`min-h-[1.1rem] leading-[1.1rem] text-[10px] mt-1.5 ${
          formError ? "text-[#b5654a]" : "text-foreground/35"
        }`}
        role={formError ? "alert" : undefined}
      >
        {formError ?? "Enter em qualquer campo regista e volta ao início da linha."}
      </p>

      {/* Sugestões: um clique preenche o valor (ou a data). */}
      <div className="flex flex-wrap items-center gap-1.5 mt-1 mb-4">
        {total > 0 && (
          <>
            <span className="text-foreground/35 text-[9px] tracking-[0.15em] uppercase">Valor</span>
            {outstanding > 0 && (
              <button
                type="button"
                onClick={() => suggest(outstanding, "saldo")}
                title="Preencher com o valor em falta"
                className={chip}
              >
                Em falta · {eur2(outstanding)}
              </button>
            )}
            <button
              type="button"
              onClick={() => suggest(split.sinal, "sinal")}
              title={`Preencher com o sinal de ${pctSinal}% do total`}
              className={chip}
            >
              Sinal {pctSinal}% · {eur2(split.sinal)}
            </button>
            <button
              type="button"
              onClick={() => suggest(Math.round(total * 50) / 100)}
              title="Preencher com metade do total"
              className={chip}
            >
              50% · {eur2(Math.round(total * 50) / 100)}
            </button>
            <span className="text-foreground/15" aria-hidden="true">
              |
            </span>
          </>
        )}
        <span className="text-foreground/35 text-[9px] tracking-[0.15em] uppercase">Data</span>
        <button type="button" onClick={() => setDate(today)} className={chip}>
          Hoje
        </button>
        <button type="button" onClick={() => setDate(yesterday)} className={chip}>
          Ontem
        </button>
      </div>

      {/* ── Pagamentos registados (registo interno do dia-a-dia) ── */}
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <p className="text-foreground/45 text-[10px] tracking-[0.2em] uppercase">
          Pagamentos registados
        </p>
        {payments.length > 0 && (
          <span className="text-foreground/40 text-[10px] tabular-nums">
            {eur2(headlinePaid)} recebido
          </span>
        )}
      </div>

      {/* Lista — uma linha por pagamento, nas mesmas colunas do formulário. */}
      <div className="flex flex-col gap-1">
        {payments.length === 0 && !ghostFailed && (
          <p className="text-foreground/35 text-[11px] py-1">
            Ainda sem registos — a linha acima já traz o sinal sugerido.
          </p>
        )}
        {payments.map((p) => {
          const overdue = !p.paid && isDateKey(p.date) && p.date < today;
          const isFailed = failed?.id === p.id;
          return (
            <div
              key={p.id}
              className={`group ${GRID} rounded-lg px-2 py-1.5 motion-safe:transition-colors ${
                isFailed
                  ? "border border-[#b5654a]/50 bg-[#b5654a]/[0.06]"
                  : "border border-transparent hover:bg-foreground/[0.03]"
              }`}
            >
              <span className="text-foreground/75 text-xs truncate">{KIND_LABEL[p.kind]}</span>

              {editingId === p.id ? (
                <input
                  ref={editRef}
                  type="text"
                  inputMode="decimal"
                  aria-label={`Valor de ${KIND_LABEL[p.kind]} em euros`}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitEdit(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitEdit(p);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEdit();
                    }
                  }}
                  className="bo-input px-1.5 py-1 text-xs text-right tabular-nums text-foreground/85"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  aria-label={`Editar valor de ${KIND_LABEL[p.kind]}, ${eur2(p.amount)}`}
                  title="Clica para editar o valor"
                  // `pointer-coarse:min-h-11` e não `alvo-toque`: a classe da
                  // casa põe `justify-content: center`, e este número está
                  // alinhado à DIREITA para bater certo com a coluna do
                  // formulário por cima. Media 137,5 × 24 px no telemóvel — é o
                  // botão que abre a edição do valor, e 24 px é meia polpa de
                  // dedo.
                  className={`rounded-md px-1.5 py-1 pointer-coarse:min-h-11 text-xs font-semibold tabular-nums text-right hover:bg-foreground/[0.06] ${
                    p.paid ? "text-[#4d6350]" : "text-foreground/55"
                  }`}
                >
                  {eur2(p.amount)}
                </button>
              )}

              <span
                className={`text-[11px] tabular-nums truncate ${overdue ? "text-[#b5654a]" : "text-foreground/45"}`}
                title={overdue ? "Em atraso" : undefined}
              >
                {fmtRowDate(p.date)}
                {overdue && " · atraso"}
              </span>

              <span className="text-foreground/40 text-[11px] truncate" title={p.note}>
                {p.note || "—"}
              </span>

              <button
                type="button"
                role="switch"
                aria-checked={p.paid}
                aria-label={`Estado de ${KIND_LABEL[p.kind]} ${eur2(p.amount)}`}
                onClick={() => togglePaid(p)}
                title={p.paid ? "Pago — clique para pôr pendente" : "Pendente — clique para pago"}
                // Media 137,5 × 23,2 px no telemóvel. É o interruptor de
                // "Pago/Pendente" — o gesto que muda o Recebido lá em cima — e
                // fica encostado ao × de remover.
                className={`rounded-md px-1.5 py-0.5 pointer-coarse:min-h-11 text-[9px] tracking-[0.1em] uppercase text-center motion-safe:transition-colors ${
                  p.paid
                    ? "bg-[#4d6350]/15 text-[#4d6350] hover:bg-[#4d6350]/25"
                    : "bg-foreground/[0.06] text-foreground/50 hover:bg-foreground/[0.12]"
                }`}
              >
                {p.paid ? "Pago" : "Pendente"}
              </button>

              <div className="flex items-center justify-end gap-0.5">
                {isFailed ? (
                  <button
                    type="button"
                    onClick={retryFailed}
                    className="rounded-md border border-[#b5654a]/50 px-1.5 py-0.5 text-[10px] text-[#b5654a] hover:bg-[#b5654a]/10"
                  >
                    Repetir
                  </button>
                ) : (
                  <>
                    {/* MEDIDO a 768×1024 com dedo (o iPad em retrato): 8 destes botões e
                        ZERO visíveis. 768 passa dos 640 do `sm:`, portanto `sm:opacity-0`
                        disparava — e sem rato não há como o revelar. A pergunta certa é sobre o
                        PONTEIRO, não sobre a largura: `com-rato:` (globals.css) esconde só onde
                        há mesmo rato, e a 375 e a 768 com dedo ficam os 8 visíveis.

                        Fica um ícone e não um menu «⋯»: com UMA acção por linha, o menu custa
                        os mesmos 44 px e cobra um toque a mais para chegar ao mesmo sítio. */}
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      // 18,4 × 33,6 px medidos no telemóvel, a 2 px do
                      // interruptor de Pago. Apagar um pagamento por engano é
                      // apagar dinheiro do registo, e é o alvo mais pequeno da
                      // linha — aqui a centragem do `alvo-toque` é a certa,
                      // porque o conteúdo é um símbolo.
                      className="alvo-toque text-foreground/45 hover:text-[#b5654a] opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 transition-all p-1"
                      aria-label={`Remover ${KIND_LABEL[p.kind]} ${eur2(p.amount)}`}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Fantasma: o registo que o servidor recusou. Fica à vista, marcado e
            com "Repetir" — em vez de desaparecer com um toast. */}
        {ghostFailed && failed?.ghost && (
          <div
            className={`${GRID} rounded-lg border border-[#b5654a]/50 bg-[#b5654a]/[0.06] px-2 py-1.5`}
          >
            <span className="text-foreground/60 text-xs truncate">
              {KIND_LABEL[failed.ghost.kind]}
            </span>
            <span className="text-foreground/60 text-xs font-semibold tabular-nums text-right px-1.5">
              {eur2(failed.ghost.amount)}
            </span>
            <span className="text-foreground/45 text-[11px] tabular-nums truncate">
              {fmtRowDate(failed.ghost.date)}
            </span>
            <span className="text-[#b5654a] text-[11px] truncate">Não guardado</span>
            <span className="text-foreground/40 text-[9px] tracking-[0.1em] uppercase">—</span>
            <div className="flex items-center justify-end gap-0.5">
              <button
                type="button"
                onClick={retryFailed}
                className="rounded-md border border-[#b5654a]/50 px-1.5 py-0.5 text-[10px] text-[#b5654a] hover:bg-[#b5654a]/10"
              >
                Repetir
              </button>
              <button
                type="button"
                onClick={() => setFailed(null)}
                aria-label="Descartar registo não guardado"
                className="text-foreground/45 hover:text-[#b5654a] p-1"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
