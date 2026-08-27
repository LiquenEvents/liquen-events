"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dataCurta } from "@/lib/data-curta";
import { useFocusTrap } from "./useFocusTrap";
import { useTrincoDeScroll } from "./useTrincoDeScroll";
import { Button, EmCurso } from "./ui";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { ModeloProposta } from "@/lib/proposal-templates";
import { fotosDoDocumento, type CampoAMudar } from "@/lib/proposal-copy";

/**
 * CRIAR A PARTIR DE… — escolher a proposta (ou o modelo) de onde partir.
 *
 * ── O problema que resolve ────────────────────────────────────────────────
 * Medido em `PROPOSTA-BEFORE.md`: montar do zero a proposta média custa 16
 * cliques e 23 campos escritos à mão, sem contar as fotos. E, palavras dela,
 * «a maioria é uma variação de uma proposta anterior». Este ecrã é a diferença
 * entre reescrever e ajustar.
 *
 * ── Porque é que a sugestão está em cima ──────────────────────────────────
 * Quando o cliente já teve propostas, a mais recente é quase sempre a resposta
 * certa. Aparece destacada e em primeiro lugar para o caso comum ser um clique
 * — sem procurar, sem ler a lista.
 *
 * ── Teclado ──────────────────────────────────────────────────────────────
 * Escrever filtra, ↑/↓ percorre, Enter escolhe, Esc fecha. Ela usa isto com o
 * cliente ao telefone; tirar a mão do teclado para ir buscar o rato é tempo
 * que se ouve do outro lado.
 */

/** O que a lista precisa de saber sobre uma proposta anterior. */
export interface ResumoProposta {
  id: string;
  quoteId: string;
  clientName: string;
  createdAt: string;
  status: string;
  temDoc: boolean;
  eventType: string;
  eventDate: string;
  location: string;
  guests: string;
  grupos: number;
  moodBoards: number;
  linhas: number;
  fotos: number;
}

export interface Escolha {
  doc: ProposalDoc;
  camposAMudar: CampoAMudar[];
  nomeDaOrigem: string;
  fotosCopiadas: number;
  fotosPartilhadas: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** O pedido para quem a proposta nova vai ser feita. */
  quoteId: string;
  /** Nome do cliente do pedido, para reconhecer propostas anteriores dele. */
  clienteAtual: string;
  onEscolhido: (e: Escolha) => void;
  toast?: (mensagem: string, tipo?: "success" | "error") => void;
}

type Linha =
  | { tipo: "modelo"; id: string; modelo: ModeloProposta }
  | { tipo: "proposta"; id: string; proposta: ResumoProposta; sugerida: boolean };

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO DEMORA A CÓPIA — E PORQUE É UMA ESTIMATIVA E NÃO UMA CONTAGEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Copiar é o atalho que ela usa quase sempre («a maioria é uma variação de uma
 * proposta anterior»), e é o que aqui demora: as fotos todas são recopiadas
 * para a pasta do pedido novo, e isso são 5 a 40 segundos em que o ecrã dizia
 * só «A copiar as fotos…», parado.
 *
 * ── Porquê `estimadoMs` e não `feito`/`total` ────────────────────────────
 * Porque é UM PEDIDO SÓ: `POST /api/propostas/copiar` vai, o servidor copia as
 * fotos em lotes de oito lá dentro, e do lado de cá o que existe é uma resposta
 * que chega ou não chega. Não há contagem nenhuma para mostrar — inventar uma
 * era desenhar uma barra que não sabe o que diz.
 *
 * ── De onde saem os números ──────────────────────────────────────────────
 * O número de fotos este ecrã já o tem (é ele que escreve «14 fotos» em cada
 * linha), e o custo divide-se em dois:
 *
 *  · um ARRANQUE fixo — o pedido a sair do telemóvel, o servidor a ler a
 *    proposta de origem e a resposta a voltar com o documento inteiro. Com 4G
 *    fraco não é pouco;
 *  · um custo POR FOTOGRAFIA — cada uma são duas cópias no Storage, a foto e a
 *    miniatura (`duplicarFotosParaPedido`), oito em paralelo.
 *
 * Calibrados pela ponta a ponta que se observa (5 a 40 s): dá 5,2 s numa
 * proposta de 3 fotos e 38,5 s numa de 40 — as duas pontas. Uma proposta sem
 * fotos nenhumas fica nos 2,5 s, que é só a ida e a volta.
 */
const ARRANQUE_DA_COPIA_MS = 2_500;
const MS_POR_FOTO_COPIADA = 900;

function tempoDaCopia(fotos: number): number {
  return ARRANQUE_DA_COPIA_MS + MS_POR_FOTO_COPIADA * Math.max(0, fotos);
}

/**
 * Quantas fotos esta linha manda copiar.
 *
 * Nas propostas é a contagem que o resumo já traz. Nos modelos conta-se com o
 * `fotosDoDocumento` — a MESMA função que o servidor usa para decidir o que
 * recopiar, e não uma segunda soma escrita à mão que divergisse dela.
 */
function fotosDaLinha(linha: Linha): number {
  return linha.tipo === "modelo"
    ? linha.modelo.doc
      ? fotosDoDocumento(linha.modelo.doc).length
      : 0
    : linha.proposta.fotos;
}

/** Comparação sem acentos nem maiúsculas — «Évora» tem de encontrar «evora». */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function CriarAPartirDe({
  open,
  onClose,
  quoteId,
  clienteAtual,
  onEscolhido,
  toast,
}: Props) {
  const [modelos, setModelos] = useState<ModeloProposta[]>([]);
  const [propostas, setPropostas] = useState<ResumoProposta[]>([]);
  const [aCarregar, setACarregar] = useState(false);
  /** A leitura falhou — o ecrã tem de dizer isso, e não «não há nada». */
  const [naoDeuParaLer, setNaoDeuParaLer] = useState(false);
  const [aCopiar, setACopiar] = useState<string | null>(null);
  const [procura, setProcura] = useState("");
  const [ativo, setAtivo] = useState(0);
  // O gancho devolve o `ref` e trata do ciclo do foco; o Esc é aqui em baixo,
  // no `onKeyDown`, junto das outras teclas.
  // Declarado ANTES da armadilha de foco de propósito: os efeitos correm por
  // ordem de declaração, portanto a página já está trancada quando o foco entra
  // na caixa. Não custa nada e tira uma ordem de que ninguém quer depender.
  useTrincoDeScroll(open);
  const caixa = useFocusTrap<HTMLDivElement>(open);
  const campoProcura = useRef<HTMLInputElement>(null);

  // ── Carregar as duas listas ao abrir ──────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setACarregar(true);
    setNaoDeuParaLer(false);
    // Uma resposta que não seja 2xx traz `{error: …}` no corpo, não a lista.
    // Transformá-la em lista vazia — que era o que estas duas linhas faziam —
    // dizia-lhe, com a sessão caída, que não havia propostas anteriores nem
    // modelos guardados. É a mentira mais cara deste ecrã: a resposta a ela é
    // montar do zero as 23 linhas que já existiam noutro sítio.
    const ler = async (rota: string) => {
      const r = await fetch(rota);
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    };
    Promise.all([ler("/api/propostas/modelos"), ler("/api/propostas?resumo=1")])
      .then(([m, p]) => {
        if (!vivo) return;
        setModelos(Array.isArray(m?.modelos) ? m.modelos : []);
        // Uma proposta sem documento do estúdio não tem nada para copiar. Não
        // aparece de todo: uma linha que não faz nada ao ser clicada lê-se como
        // uma avaria do botão.
        setPropostas((Array.isArray(p) ? p : []).filter((x: ResumoProposta) => x.temDoc));
      })
      .catch(() => {
        if (!vivo) return;
        setNaoDeuParaLer(true);
        toast?.("Não deu para ler as propostas anteriores.", "error");
      })
      .finally(() => vivo && setACarregar(false));
    return () => {
      vivo = false;
    };
  }, [open, toast]);

  useEffect(() => {
    if (open) campoProcura.current?.focus();
  }, [open]);

  // ── A lista, já ordenada e filtrada ───────────────────────────────────
  const linhas = useMemo<Linha[]>(() => {
    const q = normalizar(procura.trim());
    const combina = (...campos: string[]) =>
      !q || campos.some((c) => normalizar(c ?? "").includes(q));

    const doCliente = normalizar(clienteAtual ?? "");
    const ordenadas = [...propostas].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
    // A mais recente DESTE cliente, se houver. É a sugestão.
    const sugerida = doCliente
      ? ordenadas.find((p) => normalizar(p.clientName) === doCliente)
      : undefined;

    const mods: Linha[] = modelos
      .filter((m) => m.tipo === "completo")
      .filter((m) => combina(m.nome, m.origem ?? ""))
      .map((m) => ({ tipo: "modelo", id: `m:${m.id}`, modelo: m }));

    const props: Linha[] = ordenadas
      .filter((p) => combina(p.clientName, p.location, p.eventDate, p.eventType))
      .map((p) => ({
        tipo: "proposta",
        id: `p:${p.id}`,
        proposta: p,
        sugerida: !!sugerida && p.id === sugerida.id,
      }));

    // A sugestão sobe ao topo de tudo — modelos incluídos.
    const suger = props.filter((l) => l.tipo === "proposta" && l.sugerida);
    const resto = props.filter((l) => !(l.tipo === "proposta" && l.sugerida));
    return [...suger, ...mods, ...resto];
  }, [modelos, propostas, procura, clienteAtual]);

  const escolher = useCallback(
    async (linha: Linha) => {
      if (aCopiar) return;
      setACopiar(linha.id);
      try {
        const corpo =
          linha.tipo === "modelo"
            ? { quoteId, modeloId: linha.modelo.id }
            : { quoteId, propostaId: linha.proposta.id };
        const r = await fetch("/api/propostas/copiar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.doc) throw new Error(j?.error ?? "Não deu para copiar.");
        onEscolhido(j as Escolha);
        onClose();
      } catch (e) {
        toast?.(e instanceof Error ? e.message : "Não deu para copiar.", "error");
      } finally {
        setACopiar(null);
      }
    },
    [aCopiar, quoteId, onEscolhido, onClose, toast],
  );

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((i) => Math.min(i + 1, linhas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && linhas[ativo]) {
      e.preventDefault();
      void escolher(linhas[ativo]);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[8vh] backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cad-titulo"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--bo-hairline-strong)] bg-white shadow-[var(--bo-sombra-modal)]"
        onKeyDown={teclas}
      >
        <div className="border-b border-[var(--bo-hairline-strong)] px-5 py-4">
          <h2 id="cad-titulo" className="font-serif text-lg text-[var(--bo-text)]">
            Criar a partir de…
          </h2>
          <p className="mt-1 text-xs text-foreground/50">
            Copia os serviços, os mood boards, o orçamento e as condições. O nome, a data, o local,
            os convidados e o valor passam a ser os deste pedido.
          </p>
          <input
            ref={campoProcura}
            value={procura}
            onChange={(e) => {
              setProcura(e.target.value);
              // Voltar ao topo da lista faz parte de filtrar, por isso é aqui
              // e não num efeito: o que o efeito fazia era reagir a uma coisa
              // que este mesmo gesto já sabe.
              setAtivo(0);
            }}
            placeholder="Procurar por cliente, local ou data…"
            aria-label="Procurar propostas anteriores"
            className="bo-input mt-3 w-full px-3 py-2 text-sm"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {aCarregar && <p className="p-4 text-sm text-foreground/50">A carregar…</p>}
          {!aCarregar && naoDeuParaLer && linhas.length === 0 && (
            <p className="p-4 text-sm text-[#8a2a22]">
              Não deu para ler as propostas anteriores. Fecha e volta a abrir — o que já fizeste
              continua guardado.
            </p>
          )}
          {!aCarregar && !naoDeuParaLer && linhas.length === 0 && (
            <p className="p-4 text-sm text-foreground/50">
              {procura
                ? "Nada encontrado. Experimenta outro nome ou local."
                : "Ainda não há propostas anteriores nem modelos guardados. A primeira faz-se do zero; a partir daí é copiar."}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {linhas.map((linha, i) => {
              const aTrabalhar = aCopiar === linha.id;
              const sugerida = linha.tipo === "proposta" && linha.sugerida;
              return (
                <li key={linha.id}>
                  <button
                    type="button"
                    onClick={() => void escolher(linha)}
                    onMouseEnter={() => setAtivo(i)}
                    disabled={!!aCopiar}
                    aria-current={i === ativo}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                      i === ativo
                        ? "border-[#4d6350]/40 bg-[#4d6350]/[0.06]"
                        : "border-transparent hover:border-[var(--bo-hairline-strong)]"
                    }`}
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--bo-text)]">
                        {linha.tipo === "modelo" ? linha.modelo.nome : linha.proposta.clientName}
                      </span>
                      <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]">
                        {sugerida && (
                          <span className="rounded-full bg-[#4d6350] px-2 py-0.5 text-white">
                            já foi teu cliente
                          </span>
                        )}
                        <span className="text-foreground/40">
                          {linha.tipo === "modelo" ? "modelo" : dataCurta(linha.proposta.createdAt)}
                        </span>
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-foreground/50">
                      {linha.tipo === "modelo"
                        ? resumirModelo(linha.modelo)
                        : resumirProposta(linha.proposta)}
                    </span>
                  </button>
                  {/* ── ENQUANTO ESTÁ A COPIAR ──────────────────────────────
                      Fica DEBAIXO da linha em que ela carregou, e não num canto
                      do diálogo: com a lista toda apagada, o que interessa
                      dizer é qual delas é que está a vir. Fora do `<button>`
                      de propósito — o botão está desactivado, e o que está
                      dentro de um botão desactivado não é lido por toda a
                      gente. */}
                  {aTrabalhar && (
                    <EmCurso
                      className="mt-1"
                      titulo={
                        fotosDaLinha(linha) > 0
                          ? `A copiar as ${fotosDaLinha(linha)} fotos…`
                          : "A copiar a proposta…"
                      }
                      estimadoMs={tempoDaCopia(fotosDaLinha(linha))}
                      nota="Os serviços, os mood boards e o orçamento vêm com elas. Não feches esta janela."
                      notaDemorada="Com rede fraca demora — não feches o separador. As fotos estão a ser copiadas uma a uma."
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--bo-hairline-strong)] px-5 py-3">
          <p className="text-[11px] text-foreground/40">↑ ↓ percorre · Enter escolhe · Esc fecha</p>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

/** O «tamanho» da proposta — é isto que diz se vale a pena partir dela. */
function resumirProposta(p: ResumoProposta): string {
  const partes = [p.eventDate || p.eventType, p.location].filter(Boolean);
  const conta = [
    p.grupos ? `${p.grupos} grupo${p.grupos > 1 ? "s" : ""}` : "",
    p.moodBoards ? `${p.moodBoards} mood board${p.moodBoards > 1 ? "s" : ""}` : "",
    p.fotos ? `${p.fotos} fotos` : "",
  ].filter(Boolean);
  return [partes.join(" · "), conta.join(" · ")].filter(Boolean).join("  —  ");
}

function resumirModelo(m: ModeloProposta): string {
  const d = m.doc;
  if (!d) return "modelo vazio";
  const conta = [
    d.serviceGroups?.length ? `${d.serviceGroups.length} grupos` : "",
    d.moodBoards?.length ? `${d.moodBoards.length} mood boards` : "",
    d.budgetItems?.length ? `${d.budgetItems.length} linhas` : "",
  ].filter(Boolean);
  return [m.origem ? `a partir de ${m.origem}` : "", conta.join(" · ")]
    .filter(Boolean)
    .join("  —  ");
}
