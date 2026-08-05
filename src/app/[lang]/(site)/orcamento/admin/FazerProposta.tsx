"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { Button, Card, EmptyState } from "./ui";
import { ProposalStudio } from "./lazy";

/**
 * FAZER PROPOSTA — um ecrã com um trabalho só.
 *
 * ── Porquê ────────────────────────────────────────────────────────────────
 * O estúdio de propostas existia, mas escondido: era preciso ir a Pedidos,
 * abrir o pedido certo, encontrar o separador "Comunicação" e rolar até ele.
 * Quatro passos e três decisões antes de escrever a primeira linha da proposta
 * — para a tarefa que traz o dinheiro a casa.
 *
 * Aqui é o contrário: escolhe-se para QUEM, e o resto do ecrã é o estúdio.
 *
 * ── Porque é que não se começa numa folha em branco ───────────────────────
 * Uma proposta é sempre PARA alguém. O estúdio precisa do nome, do tipo de
 * evento, da data e do sítio para preencher a capa, e precisa do email para
 * saber para onde a enviar — tudo isso vive no pedido. Uma proposta sem pedido
 * não teria destinatário nem forma de ser aceite.
 *
 * Por isso o primeiro passo é escolher a pessoa. E se ela ainda não estiver na
 * lista — o casal que ligou, o casamento que veio por recomendação — há ali o
 * botão para a criar sem sair do ecrã.
 *
 * ── A ordem da lista não é alfabética, é por urgência ─────────────────────
 * À cabeça vêm os pedidos que ainda ESPERAM proposta (novos e em revisão), e
 * dentro desses os de data de evento mais próxima. É a ordem por que o trabalho
 * se faz. Quem já tem proposta enviada aparece a seguir, apagado — continua
 * alcançável, para refazer ou rever, mas não disputa a atenção.
 */

/** Os mesmos rótulos e cores dos estados usados no resto do back office. */
const ESTADO: Record<QuoteStatus, { label: string; classe: string }> = {
  pendente: { label: "Novo", classe: "bg-foreground/10 text-foreground/50" },
  em_revisao: { label: "Em revisão", classe: "bg-[#4d6350]/15 text-[#4d6350]" },
  cotado: { label: "Proposta enviada", classe: "bg-[#4d6350]/25 text-[#4d6350]" },
  aceite: { label: "Ganho", classe: "bg-[#4d6350]/35 text-[#4d6350]" },
  rejeitado: { label: "Perdido", classe: "bg-foreground/[0.08] text-foreground/30" },
};

/** Estados que ainda não têm proposta enviada — os que este ecrã existe para
 *  despachar. */
const A_ESPERA: QuoteStatus[] = ["pendente", "em_revisao"];

function tipoDeEvento(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Evento";
}

/** "12 de Setembro de 2026", ou o que lá estiver escrito se não for uma data
 *  (o formulário aceita "a definir"). */
function dataLegivel(iso?: string): string {
  if (!iso) return "Sem data";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
}

interface Props {
  quotes: Quote[];
  /** Pedido escolhido, guardado no pai para não se perder ao mudar de vista. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Abre o diálogo de criar um pedido à mão. */
  onNovoPedido: () => void;
  /** A proposta seguiu — o pai actualiza o estado do pedido para "cotado". */
  onSent: (quote: Quote) => void;
}

export default function FazerProposta({
  quotes,
  selectedId,
  onSelect,
  onNovoPedido,
  onSent,
}: Props) {
  const [procura, setProcura] = useState("");
  // O mesmo padrão do resto do back office: a escrita responde já, e o
  // filtro sobre a lista toda corre com prioridade mais baixa.
  const procuraAdiada = useDeferredValue(procura);

  const escolhido = useMemo(
    () => quotes.find((q) => q.id === selectedId) ?? null,
    [quotes, selectedId],
  );

  const lista = useMemo(() => {
    const t = procuraAdiada.trim().toLowerCase();
    const bate = (q: Quote) =>
      !t ||
      [q.name, q.email, q.location, q.id, tipoDeEvento(q)]
        .filter(Boolean)
        .some((c) => String(c).toLowerCase().includes(t));

    return quotes
      .filter((q) => !q.archived && bate(q))
      .sort((a, b) => {
        // Primeiro os que esperam proposta.
        const ea = A_ESPERA.includes(a.status) ? 0 : 1;
        const eb = A_ESPERA.includes(b.status) ? 0 : 1;
        if (ea !== eb) return ea - eb;
        // Depois, o evento mais próximo primeiro. Sem data vai para o fim: não
        // se pode dizer que é urgente o que não tem quando.
        const da = a.date || "9999";
        const db = b.date || "9999";
        return da.localeCompare(db);
      });
  }, [quotes, procuraAdiada]);

  const porFazer = useMemo(
    () => quotes.filter((q) => !q.archived && A_ESPERA.includes(q.status)).length,
    [quotes],
  );

  // ── Com cliente escolhido: o ecrã é o estúdio ────────────────────────────
  if (escolhido) {
    return (
      <div className="flex flex-col gap-4">
        <Card padding="md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="bo-eyebrow mb-1">Proposta para</p>
              <p className="truncate text-base font-medium text-foreground/85">{escolhido.name}</p>
              <p className="mt-0.5 truncate text-xs text-foreground/50">
                {tipoDeEvento(escolhido)} · {dataLegivel(escolhido.date)}
                {escolhido.location ? ` · ${escolhido.location}` : ""}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => onSelect(null)}>
              Trocar de cliente
            </Button>
          </div>
        </Card>

        {/* `key` pelo id: trocar de cliente TEM de recomeçar o estúdio do zero.
            Sem isto o React reaproveitava a instância e o rascunho de um casal
            aparecia no ecrã do seguinte. */}
        <ProposalStudio
          key={`fazer-proposta-${escolhido.id}`}
          quote={escolhido}
          onSent={() => onSent(escolhido)}
        />
      </div>
    );
  }

  // ── Sem cliente escolhido: escolher para quem ────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <Card padding="md">
        <div className="flex flex-col gap-3">
          <div>
            <p className="bo-eyebrow mb-1.5">Passo 1 de 2</p>
            <p className="text-sm text-foreground/70">
              Para quem é a proposta?{" "}
              {porFazer > 0 && (
                <span className="text-foreground/45">
                  {porFazer === 1 ? "1 pedido à espera" : `${porFazer} pedidos à espera`}.
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Procurar por nome, email, local…"
              aria-label="Procurar cliente"
              className="bo-input min-w-[14rem] flex-1 px-3 py-2.5 text-sm text-foreground/75"
            />
            <Button variant="secondary" onClick={onNovoPedido}>
              Cliente novo
            </Button>
          </div>
        </div>
      </Card>

      {lista.length === 0 ? (
        <EmptyState
          title={procura ? "Ninguém com esse nome" : "Ainda não há pedidos"}
          description={
            procura
              ? "Tente outro nome, email ou local — ou crie o cliente de raiz."
              : "Uma proposta é sempre para alguém. Crie o cliente e o estúdio abre a seguir."
          }
          action={{ label: "Cliente novo", onClick: onNovoPedido }}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((q) => {
            const espera = A_ESPERA.includes(q.status);
            const e = ESTADO[q.status] ?? {
              // Um estado que não conheçamos mostra-se cru e em cinzento, em vez
              // de rebentar o ecrã inteiro — a razão está em `status-meta.ts`.
              label: q.status,
              classe: "bg-foreground/[0.08] text-foreground/40",
            };
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => onSelect(q.id)}
                  className={`alvo-toque !justify-start w-full rounded-2xl border p-4 text-left motion-safe:transition-colors ${
                    espera
                      ? "border-foreground/[0.09] bg-white hover:border-[#4d6350]/40"
                      : "border-foreground/[0.06] bg-foreground/[0.015] hover:border-foreground/20"
                  }`}
                >
                  <span className="flex w-full flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-sm font-medium ${espera ? "text-foreground/85" : "text-foreground/55"}`}
                      >
                        {q.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-foreground/45">
                        {tipoDeEvento(q)} · {dataLegivel(q.date)}
                        {q.location ? ` · ${q.location}` : ""}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] uppercase ${e.classe}`}
                    >
                      {e.label}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
