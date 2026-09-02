"use client";

import { useMemo, useState, useDeferredValue } from "react";
// `import type` é totalmente apagado no build, por isso puxar a forma do store
// server-only nunca arrasta o guard `server-only` (→ repository → fs) para o
// bundle cliente. O tipo vive no módulo client-safe `contract-types`.
import type { Contract, ContractStatus } from "@/lib/contract-types";
import { TERMS_VERSION } from "@/lib/contract-terms";
import { SkeletonList } from "./Skeleton";
import { downloadCsv, dateStamp } from "./export";
import {
  Button,
  Card,
  EmptyState,
  TabelaOuCartoes,
  Toolbar,
  useAdaptativo,
  type Coluna,
} from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { useToast } from "./Toast";

// Estado do contrato → rótulo + paleta. Aceite usa o musgo (positivo); pendente
// fica esbatido, à espera da assinatura do cliente. Mesma linguagem cromática
// das chips do Inventário.
const STATUS_META: Record<ContractStatus, { label: string; bg: string; text: string }> = {
  aceite: { label: "Aceite", bg: "#e7efe4", text: "#3a5c39" },
  pendente: { label: "Pendente", bg: "#00000008", text: "#8a8378" },
};

const STATUSES = Object.keys(STATUS_META) as ContractStatus[];

// Data + hora (a aceitação é um evento pontual, ao minuto — importa a hora).
const fmtDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

// Só a data (para a coluna de criação, mais compacta).
const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

/**
 * O estado de UM contrato não pode derrubar a lista toda.
 *
 * `STATUS_META[status]` dá `undefined` para um valor fora do mapa, e num
 * componente de cliente esse erro sobe ao limite de erro e substitui o BACK
 * OFFICE INTEIRO pelo ecrã "Ocorreu um erro inesperado". Este mapa só conhece
 * `aceite` e `pendente`, portanto qualquer estado acrescentado ao contrato sem
 * passar por aqui — ou uma linha corrigida à mão — bastava. Mostramos o valor
 * cru em cinzento e a lista continua de pé.
 */
function statusMeta(status: string): { label: string; bg: string; text: string } {
  return (
    STATUS_META[status as ContractStatus] ?? {
      label: status || "—",
      bg: "#00000008",
      text: "#8a8378",
    }
  );
}

function StatusChip({ status }: { status: ContractStatus }) {
  const s = statusMeta(status);
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-md text-[10px] tracking-[0.08em] uppercase font-medium"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MARCAR UM CONTRATO COMO ASSINADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Não havia porta nenhuma: os contratos nasciam `pendente` e ficavam lá para
 * sempre. O que isso apagava, na prática — o portal do casal nunca oferecia o
 * contrato em PDF, o filtro «Aceite» ficava vazio, o contador dizia sempre 0, e
 * o congelamento da proposta aceite não podia correr.
 *
 * O CAMPO DO «COMO» É OBRIGATÓRIO, e é o coração disto. Este sistema não
 * presenciou o sim — o botão de aceitar pelo link foi retirado, «um casamento
 * não se fecha num botão» — portanto o que se grava não é uma assinatura
 * electrónica: é o registo de que ela aconteceu, feito por alguém com nome, e
 * com a frase que diz onde procurar a prova. Sem essa frase ficava um estado
 * sem nada por trás, e o PDF do contrato ficava a afirmar um aceite que
 * ninguém consegue mostrar.
 */
function RegistarAceite({ contrato, feito }: { contrato: Contract; feito: () => void }) {
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [como, setComo] = useState("");
  const [aGravar, setAGravar] = useState(false);

  if (contrato.status === "aceite") return null;

  async function registar() {
    if (aGravar) return;
    const texto = como.trim();
    if (!texto) {
      toast("Diz como é que o aceite aconteceu — é o que dá valor ao registo.", "error");
      return;
    }
    setAGravar(true);
    try {
      const res = await fetch(`/api/contratos/${encodeURIComponent(contrato.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ como: texto }),
      });
      // O corpo lê-se com cuidado: um 502/504 devolve HTML e o interpretador
      // atira — a frase crua dele não pode chegar ao ecrã dela.
      const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(corpo?.error || `O servidor respondeu ${res.status}.`);
      setAberto(false);
      setComo("");
      toast("Contrato marcado como assinado.", "success");
      feito();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível registar o aceite.", "error");
    } finally {
      setAGravar(false);
    }
  }

  if (!aberto) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setAberto(true)}>
        Marcar como assinado
      </Button>
    );
  }

  return (
    <div className="mt-2 flex w-full flex-wrap items-center gap-2">
      <input
        type="text"
        autoFocus
        value={como}
        onChange={(e) => setComo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void registar();
          if (e.key === "Escape") setAberto(false);
        }}
        maxLength={300}
        aria-label="Como é que o aceite aconteceu"
        placeholder="Como? Ex.: assinado em papel, entregue a 12/05"
        className="bo-input min-w-0 flex-1 px-3 py-2 text-xs"
      />
      <Button size="sm" onClick={() => void registar()} disabled={aGravar}>
        {aGravar ? "A registar…" : "Registar"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAberto(false)} disabled={aGravar}>
        Cancelar
      </Button>
    </div>
  );
}

export default function Contratos() {
  const {
    data: contracts = [],
    loading,
    error,
    errorMessage,
    refresh,
  } = useCachedList<Contract[]>("contratos", "/api/contratos");
  const [search, setSearch] = useState("");
  // Defer so filtering + row reconcile runs off the keystroke; input stays instant.
  const dSearch = useDeferredValue(search);
  const [status, setStatus] = useState<"all" | ContractStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  /**
   * A MESMA PERGUNTA QUE O `TabelaOuCartoes` FAZ POR DENTRO — os termos
   * abertos vivem dentro do cartão no telemóvel e num painel a seguir à
   * tabela no computador, e têm de ser montados UMA vez.
   */
  const { desktop, montado } = useAdaptativo();
  const emTabela = montado && desktop;

  const filtered = useMemo(() => {
    const q = dSearch.trim().toLowerCase();
    return contracts.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (
        q &&
        ![c.clientName, c.clientEmail, c.acceptedName, c.quoteId, c.proposalId]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [contracts, dSearch, status]);

  const aceites = useMemo(() => contracts.filter((c) => c.status === "aceite").length, [contracts]);

  /** O contrato cujos termos estão abertos, se ainda estiver na lista filtrada. */
  const aberto = expanded ? (filtered.find((c) => c.id === expanded) ?? null) : null;

  function exportCsv() {
    const rows: (string | number)[][] = [
      [
        "Cliente",
        "E-mail",
        "Pedido",
        "Proposta",
        "Estado",
        "Criado em",
        "Aceite em",
        "Aceite por",
        "Versão dos termos",
      ],
      ...filtered.map((c) => [
        c.clientName,
        c.clientEmail,
        c.quoteId,
        c.proposalId,
        statusMeta(c.status).label,
        fmtDate(c.createdAt),
        c.acceptedAt ? fmtDateTime(c.acceptedAt) : "",
        c.acceptedName ?? "",
        c.termsVersion,
      ]),
    ];
    downloadCsv(`contratos-${dateStamp()}`, rows);
  }

  // A falha ANTES do estado vazio: sem isto, uma leitura que rebentou aparecia
  // como "Sem contratos ainda — aparecem aqui quando um cliente aceita a
  // proposta", que descreve um sistema a funcionar e a aguardar clientes. O
  // contrato que ela procura pode estar assinado há uma semana. Ver
  // `AvisoDeFalha`.
  if (error && contracts.length === 0) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler os contratos"
        mensagem={errorMessage}
        aoTentarDeNovo={refresh}
      />
    );
  }

  if (loading) return <SkeletonList rows={5} />;

  return (
    <div>
      {/* One calm line saying what this screen is for */}
      <p className="mb-6 text-sm leading-relaxed text-foreground/55">
        Cada contrato é a prova de que o cliente aceitou a proposta. Aparecem aqui automaticamente,
        com a data e o nome de quem aceitou.
      </p>

      {/* Toolbar */}
      <Toolbar
        className="mb-6"
        start={
          <div className="relative w-full max-w-md sm:w-80">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/25"
              width="14"
              height="14"
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
              placeholder="Procurar por cliente ou referência…"
              aria-label="Procurar contratos"
              className="bo-input py-2.5 pl-10 pr-3 text-sm text-foreground/80 placeholder-foreground/30"
            />
          </div>
        }
        end={
          contracts.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={exportCsv}
              title="Guarda a lista dos contratos num ficheiro que abre no Excel"
            >
              Exportar lista
            </Button>
          ) : undefined
        }
      />

      {/* Status filter */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          <Button
            size="sm"
            variant={status === "all" ? "subtle" : "ghost"}
            aria-pressed={status === "all"}
            onClick={() => setStatus("all")}
          >
            Todos · {contracts.length}
          </Button>
          {STATUSES.map((s) => {
            const count = contracts.filter((c) => c.status === s).length;
            return (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "subtle" : "ghost"}
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
              >
                {STATUS_META[s].label} · {count}
              </Button>
            );
          })}
        </div>
        {aceites > 0 && (
          <span className="ml-auto self-center text-xs text-foreground/40">
            {aceites} {aceites === 1 ? "contrato aceite" : "contratos aceites"} · versão atual dos
            termos: {TERMS_VERSION}
          </span>
        )}
      </div>

      {/* Ledger */}
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
                <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m9 14 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title={contracts.length === 0 ? "Sem contratos ainda" : "Nenhum contrato encontrado"}
            description={
              contracts.length === 0
                ? // O botão de aceitar pelo link foi RETIRADO — «um casamento não se
                  // fecha num botão» — e esta frase ficou a descrever um caminho
                  // que já não existe. Um ecrã vazio que explica mal é pior do
                  // que um ecrã vazio: manda esperar por uma coisa que nunca vem.
                  "Os contratos aparecem aqui quando um pedido é marcado como Ganho. Depois de o casal assinar, marca-o aqui como assinado."
                : "Tenta outra pesquisa ou estado."
            }
          />
        ) : (
          /* ── UMA LISTA, UMA ÁRVORE ────────────────────────────────────────
             Aqui estavam DUAS: um `<ul md:hidden>` com os cartões e um
             `<table>` de sete colunas `hidden md:block`, as duas montadas ao
             mesmo tempo, as duas a ler e a escrever o mesmo `expanded`. É o
             defeito que o `useMedida.ts:16-21` descreve — dois componentes
             vivos para a mesma linha — e custava, em cada desenho, uma lista
             inteira de nós que ninguém via.

             O `TabelaOuCartoes` monta uma só, e o corte passa a ser o da casa
             (`CORTES.desktop`, 1024) em vez dos 768 px do `md:`, que este back
             office não usa e que é justamente a largura de um iPad em retrato —
             onde sete colunas não cabem. Ver `ui/adaptativo.ts:53-60`. */
          <div className="p-3 sm:p-4">
            <TabelaOuCartoes
              itens={filtered}
              chaveDe={(c) => c.id}
              legenda="Contratos"
              // O cartão traz a sua própria moldura e os seus próprios botões
              // («Ver termos», «PDF», «Marcar como assinado»): embrulhá-lo no
              // botão do primitivo dava um botão dentro de outro botão.
              semMoldura
              cartao={(c) => (
                <CartaoDeContrato
                  c={c}
                  aberto={expanded === c.id}
                  onAlternar={() => setExpanded(expanded === c.id ? null : c.id)}
                  aoRegistar={refresh}
                />
              )}
              colunas={colunasDeContratos({
                aberto: expanded,
                alternar: (c) => setExpanded((e) => (e === c.id ? null : c.id)),
                aoRegistar: refresh,
              })}
            />

            {/* ── OS TERMOS ABERTOS, NO COMPUTADOR ──────────────────────────
                Na tabela isto era uma segunda `<tr colSpan={7}>`, e o
                `TabelaOuCartoes` desenha uma linha por item — de propósito, é
                o que lhe permite ordenar e rolar sem saber nada do conteúdo.
                Os termos passam para um painel a seguir à tabela, com o nome
                de quem se está a ver por cima. É o MESMO `ContractDetails` do
                cartão, montado uma vez. */}
            {emTabela && aberto && (
              <div className="mt-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.015] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-foreground/80">
                    {aberto.clientName || "—"}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(null)}>
                    Fechar
                  </Button>
                </div>
                <ContractDetails c={aberto} />
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Expanded contract details — audit fields + the saved copy of the accepted
 *  terms. Shared by the desktop table's expand row and the mobile card. */
function ContractDetails({ c }: { c: Contract }) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mb-4">
        <div>
          <p className="bo-eyebrow text-foreground/40 mb-1">Proposta</p>
          <p className="text-foreground/60 font-mono text-[11px] break-all">
            {c.proposalId || "—"}
          </p>
        </div>
        <div>
          <p className="bo-eyebrow text-foreground/40 mb-1">Criado em</p>
          <p className="text-foreground/60">{fmtDateTime(c.createdAt)}</p>
        </div>
        <div>
          <p className="bo-eyebrow text-foreground/40 mb-1">Versão dos termos</p>
          <p className="text-foreground/60">Versão {c.termsVersion}</p>
        </div>
        {/* IP é dado de auditoria — discreto, não em destaque. */}
        <div>
          <p className="bo-eyebrow text-foreground/40 mb-1">IP de quem aceitou</p>
          <p className="text-foreground/45 font-mono text-[11px] break-all">
            {c.acceptedIp || "—"}
          </p>
        </div>
      </div>
      <p className="bo-eyebrow text-foreground/40 mb-2">Termos aceites (cópia guardada)</p>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-foreground/10 bg-white p-4">
        <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground/60">
          {c.termsSnapshot || "Sem cópia dos termos guardada."}
        </pre>
      </div>
    </>
  );
}

/**
 * A prova em papel — o PDF do contrato, numa aba nova.
 *
 * Escrito uma vez porque estava escrito duas (uma no cartão, outra na tabela) e
 * as duas cópias já tinham divergido na altura: `h-9` num sítio, `h-8` no
 * outro, ao lado de botões de 44. `pointer-coarse:h-11` é o que o `ui/Button`
 * faz sozinho; este link está escrito à mão e por isso pede-o à mão.
 */
function PdfDoContrato({ id }: { id: string }) {
  return (
    <a
      href={`/api/contratos/${id}/pdf`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-9 pointer-coarse:h-11 items-center rounded-xl px-3 text-xs font-medium text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/80"
      title="Descarregar contrato em PDF"
    >
      PDF
    </a>
  );
}

/**
 * O CARTÃO DO TELEMÓVEL — quatro coisas, não sete.
 *
 * cliente (+ email por baixo) · estado · aceite em/por · as acções. O pedido e
 * a versão dos termos, que na tabela são colunas próprias, só aparecem aqui
 * enquanto o contrato ainda está pendente — é aí que servem para alguma coisa,
 * porque é aí que ela vai procurar o pedido de onde ele veio.
 */
function CartaoDeContrato({
  c,
  aberto,
  onAlternar,
  aoRegistar,
}: {
  c: Contract;
  aberto: boolean;
  onAlternar: () => void;
  aoRegistar: () => void;
}) {
  return (
    <div
      className={`rounded-xl border border-foreground/[0.08] bg-white p-4 ${
        c.status === "pendente" ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground/80" title={c.clientName}>
            {c.clientName || "—"}
          </p>
          {c.clientEmail && (
            <p className="mt-0.5 truncate text-xs text-foreground/40">{c.clientEmail}</p>
          )}
        </div>
        <div className="shrink-0">
          <StatusChip status={c.status} />
        </div>
      </div>
      <p className="mt-2 text-xs text-foreground/45">
        {c.status === "aceite" ? (
          <>
            Aceite {fmtDateTime(c.acceptedAt)}
            {c.acceptedName && <> · por {c.acceptedName}</>}
          </>
        ) : (
          <>
            Pedido {c.quoteId || "—"} · versão {c.termsVersion}
          </>
        )}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onAlternar} aria-expanded={aberto}>
          {aberto ? "Fechar" : "Ver termos"}
        </Button>
        <PdfDoContrato id={c.id} />
        <RegistarAceite contrato={c} feito={aoRegistar} />
      </div>
      {aberto && (
        <div className="mt-3">
          <ContractDetails c={c} />
        </div>
      )}
    </div>
  );
}

/**
 * AS SETE COLUNAS DA TABELA — as mesmas que já lá estavam.
 *
 * `Pedido` e `Termos` ficam em `soLargo`: são referências de auditoria, não é
 * por elas que se procura um contrato, e a coluna da navegação come 336 px do
 * ecrã. Só aparecem quando há mesmo espaço (≥1440); abaixo disso continuam à
 * mão nos termos abertos, que os desenham os dois.
 */
function colunasDeContratos({
  aberto,
  alternar,
  aoRegistar,
}: {
  aberto: string | null;
  alternar: (c: Contract) => void;
  aoRegistar: () => void;
}): Coluna<Contract>[] {
  return [
    {
      chave: "cliente",
      cabecalho: "Cliente",
      ordenar: (a, b) => (a.clientName || "").localeCompare(b.clientName || "", "pt"),
      celula: (c) => (
        <span className="block">
          <span className="block max-w-[200px] truncate font-medium text-foreground/80">
            {c.clientName || "—"}
          </span>
          {c.clientEmail && (
            <span className="block max-w-[200px] truncate text-xs text-foreground/40">
              {c.clientEmail}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: "pedido",
      cabecalho: "Pedido",
      soLargo: true,
      celula: (c) => (
        <span className="whitespace-nowrap font-mono text-xs text-foreground/50">
          {c.quoteId || "—"}
        </span>
      ),
    },
    {
      chave: "estado",
      cabecalho: "Estado",
      celula: (c) => <StatusChip status={c.status} />,
    },
    {
      chave: "aceiteEm",
      cabecalho: "Aceite em",
      ordenar: (a, b) => (a.acceptedAt ?? "").localeCompare(b.acceptedAt ?? ""),
      celula: (c) => (
        <span className="whitespace-nowrap text-foreground/50">
          {c.status === "aceite" ? fmtDateTime(c.acceptedAt) : "—"}
        </span>
      ),
    },
    {
      chave: "aceitePor",
      cabecalho: "Aceite por",
      celula: (c) => (
        <span
          className="block max-w-[160px] truncate text-foreground/65"
          title={c.acceptedName ?? undefined}
        >
          {c.acceptedName || "—"}
        </span>
      ),
    },
    {
      chave: "termos",
      cabecalho: "Termos",
      soLargo: true,
      celula: (c) => (
        <span className="whitespace-nowrap tabular-nums text-foreground/45">
          Versão {c.termsVersion}
        </span>
      ),
    },
    {
      chave: "contrato",
      cabecalho: "Contrato",
      alinharADireita: true,
      celula: (c) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => alternar(c)}
            aria-expanded={aberto === c.id}
          >
            {aberto === c.id ? "Fechar" : "Ver termos"}
          </Button>
          <PdfDoContrato id={c.id} />
          <RegistarAceite contrato={c} feito={aoRegistar} />
        </span>
      ),
    },
  ];
}
