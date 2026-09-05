"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { Button, Card, EmptyState } from "./ui";
// `ESTADO` já é, neste ficheiro, a tabela de estados do PEDIDO (Novo, Ganho,
// Perdido…). O primitivo de movimento entra com apelido para os dois poderem
// viver lado a lado sem que nenhum tenha de mudar de nome.
import { ESTADO as MOV_ESTADO, PRESSAO } from "./ui/movimento";
import { ProposalStudio } from "./lazy";
import AvisoDataOcupada from "./AvisoDataOcupada";
import { choquesDeData, gravidade } from "@/lib/orcamento/choque-de-datas";

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

/**
 * UM SÓ SISTEMA DE ESTADOS.
 *
 * Os mesmos rótulos do resto do back office, e uma rampa de cor só: o mesmo
 * verde da casa a ganhar corpo à medida que o pedido avança no funil — Novo,
 * Aguardar resposta, Proposta enviada, Ganho. «Perdido» sai da rampa e fica
 * cinzento, que é o que ele é: fora do funil.
 *
 * «Novo» era o único cinzento no meio de quatro verdes, o que o lia como
 * "apagado" quando é precisamente o que ainda está todo por fazer. Passa a ser
 * o primeiro degrau da rampa, com um anel fino a marcá-lo como o que espera
 * por ela.
 */
const ESTADO: Record<QuoteStatus, { label: string; classe: string }> = {
  pendente: {
    label: "Novo",
    classe: "bg-[#4d6350]/10 text-[#4d6350] ring-1 ring-inset ring-[#4d6350]/30",
  },
  em_revisao: { label: "Aguardar resposta", classe: "bg-[#4d6350]/18 text-[#4d6350]" },
  cotado: { label: "Proposta enviada", classe: "bg-[#4d6350]/25 text-[#4d6350]" },
  aceite: { label: "Ganho", classe: "bg-[#4d6350]/35 text-[#4d6350]" },
  rejeitado: { label: "Perdido", classe: "bg-[var(--bo-tinta-10)] text-foreground/30" },
};

/** Estados que ainda não têm proposta enviada — os que este ecrã existe para
 *  despachar. */
const A_ESPERA: QuoteStatus[] = ["pendente", "em_revisao"];

/**
 * A FILA DE FILTROS — e porque é que não há um «Todos».
 *
 * A lista misturava novos, enviados e perdidos, e um casamento que se perdeu há
 * seis meses ficava entre dois que esperam proposta hoje. Estas pastilhas são a
 * triagem: a fila é a ordem do funil, e cada uma diz quantos lá estão.
 *
 * Por omissão fica em «Activos», que é tudo menos os perdidos. Não se chama
 * «Todos» de propósito — chamar-lhe «Todos» e depois esconder uma parte seria
 * mentir na etiqueta. Quem quiser ver os perdidos toca na pastilha deles; não
 * há nenhum trabalho que se faça com perdidos e activos misturados, que é
 * exactamente a queixa que deu origem a isto.
 */
const FILTROS: { id: QuoteStatus; label: string }[] = [
  { id: "pendente", label: "Novo" },
  { id: "em_revisao", label: "Aguardar resposta" },
  { id: "cotado", label: "Proposta enviada" },
  { id: "aceite", label: "Ganho" },
];

type Filtro = QuoteStatus | "activos";

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
  /** O valor mudou no estúdio, que o grava no pedido — o pai actualiza a sua
   *  cópia para o cartão do cliente aqui em cima mostrar o mesmo. */
  onQuoteUpdated: (quote: Quote) => void;
  /**
   * Abrir o pedido deste cliente no painel de detalhe (Produção, Financeiro,
   * mensagens).
   *
   * Existe porque carregar num cliente na lista de Pedidos passou a trazer para
   * aqui: sem esta porta, as outras três ferramentas do pedido ficavam a duas
   * voltas de distância para quem entrou por ali.
   */
  onAbrirPedido: (quote: Quote) => void;
}

export default function FazerProposta({
  quotes,
  selectedId,
  onSelect,
  onNovoPedido,
  onSent,
  onQuoteUpdated,
  onAbrirPedido,
}: Props) {
  const [procura, setProcura] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("activos");
  // O mesmo padrão do resto do back office: a escrita responde já, e o
  // filtro sobre a lista toda corre com prioridade mais baixa.
  const procuraAdiada = useDeferredValue(procura);

  const escolhido = useMemo(
    () => quotes.find((q) => q.id === selectedId) ?? null,
    [quotes, selectedId],
  );

  /**
   * O que a procura deixou passar — antes de o filtro de estado entrar.
   *
   * É daqui que saem as contagens das pastilhas, e é de propósito: as contagens
   * dizem quantos há DENTRO do que ela procurou. Contadas sobre a lista toda,
   * uma pastilha diria «Novo · 12» e ao tocar-lhe apareceria um só — o que
   * procurou.
   */
  const procurados = useMemo(() => {
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

  const contagens = useMemo(() => {
    const por: Record<string, number> = {};
    for (const q of procurados) por[q.status] = (por[q.status] ?? 0) + 1;
    return { por, activos: procurados.filter((q) => q.status !== "rejeitado").length };
  }, [procurados]);

  const perdidos = contagens.por.rejeitado ?? 0;

  const lista = useMemo(
    () =>
      procurados.filter((q) =>
        filtro === "activos" ? q.status !== "rejeitado" : q.status === filtro,
      ),
    [procurados, filtro],
  );

  const porFazer = useMemo(
    () => quotes.filter((q) => !q.archived && A_ESPERA.includes(q.status)).length,
    [quotes],
  );

  /**
   * Que pedidos da lista caem em cima de um dia já comprometido.
   *
   * O aviso a sério aparece depois de escolher, com o outro evento e a
   * distância. Aqui é só uma pastilha, para a escolha não ser às cegas: se dois
   * pedidos servem igualmente bem para começar a manhã, é melhor começar pelo
   * que não vai dar problema.
   *
   * Corre sobre a lista já filtrada, não sobre as centenas todas.
   */
  const comChoque = useMemo(() => {
    const por = new Map<string, "aviso" | "grave">();
    for (const q of lista) {
      const cs = choquesDeData(q, quotes);
      if (cs.length === 0) continue;
      // A pior das colisões manda na cor. Um dia com dois eventos, um deles
      // difícil de conciliar, não é «amarelo» só porque o outro era fácil.
      por.set(q.id, cs.some((c) => gravidade(c) === "grave") ? "grave" : "aviso");
    }
    return por;
  }, [lista, quotes]);

  // ── Com cliente escolhido: o ecrã é o estúdio ────────────────────────────
  if (escolhido) {
    return (
      /**
       * ── A PÁGINA APRESENTA-SE, E EM DOIS TEMPOS ──────────────────────────
       *
       * Palavras dela: «que haja uma animação super fluida que coloca a página
       * para fazer a proposta na página toda».
       *
       * A escada é a da casa (`.bo-cena`, 600 ms, degraus de 20 ms, no máximo
       * seis) e não uma cópia nova: primeiro chega o «Proposta para ‹nome›» —
       * a resposta a «para quem é isto» —, e logo a seguir o estúdio. É a
       * ordem por que se lê, e é a mesma escada da Visão Geral e das Propostas.
       *
       * O que NÃO se fez, e porquê: um `document.startViewTransition` a
       * transformar a linha da lista no cabeçalho desta página. A casa já mediu
       * essa via e desligou-a («o snapshot da página inteira colidia com a nova
       * rota a hidratar, e a transição gaguejava» — `PageTransition.tsx`); o
       * estúdio é a superfície mais pesada do back office, e é exactamente onde
       * isso voltaria a acontecer. Uma animação que trava é o contrário de
       * fluida.
       *
       * Só `opacity` e `transform`, com `backwards` — não fica transform
       * nenhum depois, que é o que quebraria o `position: fixed` de uma folha
       * aberta aqui dentro. E `prefers-reduced-motion` desliga-a no
       * `globals.css`.
       */
      <div className="flex flex-col gap-4">
        <Card padding="md" className="bo-cena">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              {/* O EVENTO, A DATA E O LOCAL SAÍRAM DAQUI.
                  Estavam escritos aqui e outra vez, duzentos pixels abaixo, nos
                  campos "Data" e "Local" da secção Evento — e eram esses que
                  saem na proposta. Duas cópias adjacentes do mesmo dado, sem
                  nada a dizer qual manda, é pior do que uma: quando divergem
                  (porque a data da proposta se escreve por extenso, ou porque o
                  espaço mudou), não há maneira de saber qual está certa. Fica o
                  nome, que é a âncora do "para quem é isto", e o botão de
                  trocar. */}
              <p className="bo-eyebrow mb-1">Proposta para</p>
              <p className="truncate text-base font-medium text-[var(--bo-text)]">
                {escolhido.name}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* O pedido inteiro — Produção, Financeiro, mensagens — a UMA
                  tecla. Ver `onAbrirPedido`. */}
              <Button variant="secondary" size="sm" onClick={() => onAbrirPedido(escolhido)}>
                Abrir o pedido
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onSelect(null)}>
                Trocar de cliente
              </Button>
            </div>
          </div>
        </Card>

        {/* ANTES do estúdio, de propósito. Saber que o dia já está ocupado
            depois de escrever a proposta toda é saber tarde de mais. */}
        <div style={{ "--cena": 1 } as React.CSSProperties} className="bo-cena empty:hidden">
          <AvisoDataOcupada quote={escolhido} quotes={quotes} onAbrir={onSelect} />
        </div>

        {/* `key` pelo id: trocar de cliente TEM de recomeçar o estúdio do zero.
            Sem isto o React reaproveitava a instância e o rascunho de um casal
            aparecia no ecrã do seguinte. */}
        <div style={{ "--cena": 2 } as React.CSSProperties} className="bo-cena">
          <ProposalStudio
            key={`fazer-proposta-${escolhido.id}`}
            quote={escolhido}
            quotes={quotes}
            onQuoteUpdated={onQuoteUpdated}
            onSent={() => onSent(escolhido)}
          />
        </div>
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
            <p className="text-sm text-[var(--bo-tinta-72)]">
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
              className="bo-input min-w-[14rem] flex-1 px-3 py-2.5 text-sm text-[var(--bo-tinta-72)]"
            />
            <Button variant="secondary" onClick={onNovoPedido}>
              Cliente novo
            </Button>
          </div>
        </div>
      </Card>

      {/* ── A FILA DE ESTADOS ────────────────────────────────────────────
          Uma fila só, que se arrasta com o polegar. Seis pastilhas a quebrar
          em duas linhas gastam ecrã que aqui não sobra, e um contentor com
          scroll próprio é a única forma de sair da margem que a auditoria de
          toque aceita — a mesma escolha, e o mesmo desenho, da fila de estados
          dos Pedidos (`AdminClient.tsx`).

          `py-1` não é enfeite: `overflow-x` recorta também na vertical, e sem
          essa folga o anel de foco das pastilhas ficava cortado. */}
      {procurados.length > 0 && (
        <div
          role="group"
          aria-label="Filtrar por estado"
          className="-mt-1 flex flex-nowrap gap-1.5 overflow-x-auto py-1 lg:flex-wrap lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {[
            { id: "activos" as Filtro, label: "Activos", n: contagens.activos },
            ...FILTROS.map((f) => ({
              id: f.id as Filtro,
              label: f.label,
              n: contagens.por[f.id] ?? 0,
            })),
            // «Perdido» só existe na fila quando há algum. Uma pastilha a zero
            // é um convite para um ecrã vazio.
            ...(perdidos > 0 ? [{ id: "rejeitado" as Filtro, label: "Perdido", n: perdidos }] : []),
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
              className={`alvo-toque shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.1em] ${MOV_ESTADO} ${PRESSAO} ${
                filtro === f.id
                  ? "bg-[#1b2119] text-white "
                  : "bg-[var(--bo-tinta-6)] text-foreground/40 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-text-muted)]"
              }`}
            >
              {f.label} · {f.n}
            </button>
          ))}
        </div>
      )}

      {lista.length === 0 && procurados.length > 0 ? (
        // Há pedidos — foi a pastilha que os deixou de fora. Dizer «ainda não há
        // pedidos» aqui seria mandá-la criar um cliente que ela já tem.
        <EmptyState
          title="Nada neste estado"
          description={`Não há pedidos em «${
            filtro === "activos"
              ? "Activos"
              : (ESTADO[filtro as QuoteStatus]?.label ?? String(filtro))
          }»${procura ? " dentro do que procuraste" : ""}.`}
          action={{ label: "Ver os activos", onClick: () => setFiltro("activos") }}
        />
      ) : lista.length === 0 ? (
        <EmptyState
          title={procura ? "Ninguém com esse nome" : "Ainda não há pedidos"}
          description={
            procura
              ? "Tenta outro nome, email ou local — ou cria o cliente de raiz."
              : "Uma proposta é sempre para alguém. Cria o cliente e o estúdio abre a seguir."
          }
          action={{ label: "Cliente novo", onClick: onNovoPedido }}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((q) => {
            const espera = A_ESPERA.includes(q.status);
            const choque = comChoque.get(q.id);
            const e = ESTADO[q.status] ?? {
              // Um estado que não conheçamos mostra-se cru e em cinzento, em vez
              // de rebentar o ecrã inteiro — a razão está em `status-meta.ts`.
              label: q.status,
              classe: "bg-[var(--bo-tinta-10)] text-foreground/40",
            };
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => onSelect(q.id)}
                  className={`alvo-toque !justify-start w-full rounded-2xl border p-4 text-left ${MOV_ESTADO} ${PRESSAO} ${
                    espera
                      ? "border-[var(--bo-hairline)] bg-white hover:border-[#4d6350]/40"
                      : "border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] hover:border-foreground/20"
                  }`}
                >
                  {/* AS ETIQUETAS VÊM PRIMEIRO, E É DE PROPÓSITO.
                      Estavam à direita do nome, e num ecrã de 390 px «Aguardar
                      resposta» encostado à direita do cartão lia-se como um
                      botão — parecia haver ali uma acção que não existe. E
                      «Data ocupada», que é a informação com mais dinheiro em
                      jogo desta lista, ficava a seguir ao nome, apagada, e
                      muitas vezes na segunda linha depois de quebrar.

                      Passam a uma linha própria no topo do cartão, sempre no
                      mesmo sítio: primeiro o alerta de data, depois o estado. O
                      nome fica com o cartão todo para si — que é também o que
                      lhe devolve os caracteres que o truncar comia. */}
                  <span className="flex w-full flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {choque && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase ring-1 ring-inset ${
                            choque === "grave"
                              ? "bg-[#8a2a22]/15 text-[#8a4632] ring-[#8a2a22]/45"
                              : "bg-[#c08a3e]/18 text-[#8a6420] ring-[#c08a3e]/45"
                          }`}
                        >
                          Data ocupada
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] uppercase ${e.classe}`}
                      >
                        {e.label}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-sm font-medium ${espera ? "text-[var(--bo-text)]" : "text-[var(--bo-text-muted)]"}`}
                      >
                        {q.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-foreground/45">
                        {tipoDeEvento(q)} · {dataLegivel(q.date)}
                        {q.location ? ` · ${q.location}` : ""}
                      </span>
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
