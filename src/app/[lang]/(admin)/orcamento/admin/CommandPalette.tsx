"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { useFocusTrap } from "./useFocusTrap";
import { useTrincoDeScroll } from "./useTrincoDeScroll";
/* A escala de movimento da casa — ver `ui/movimento.ts`. O `PRESSAO` são os
   20 ms do carregar. O `ESTADO` (120 ms) SAIU daqui de propósito: numa lista
   que se percorre com o ↓ segurado, um realce que esbate é um realce que não
   diz qual é a linha. A razão inteira está no ponto 3 do cabeçalho. */
import { PRESSAO } from "./ui/movimento";
import { SAIDA, SAIDA_FUNDO, useSaidaAdiada } from "./ui/saida";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

export interface RecentQuote {
  id: string;
  name: string;
  email: string;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  navCommands: Command[];
  quotes: Quote[];
  onOpenQuote: (q: Quote) => void;
  recentQuotes?: RecentQuote[];
}

/**
 * ⌘K / Ctrl+K command palette: jump to any view or search a quote by name,
 * email or id. Keyboard-first, on-brand, minimal.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE AQUI SE ANIMA, E — SOBRETUDO — O QUE AQUI NÃO SE ANIMA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta é a superfície onde a regra «nenhuma animação pode atrasar uma tarefa»
 * deixa de ser um princípio e passa a ser a única que conta: quem abre isto
 * está a escrever, e escreve depressa. Três decisões, e duas delas são «não».
 *
 * ── 1. A ENTRADA FICA COMO ESTÁ ───────────────────────────────────────────
 *
 * A caixa entra com a `.bo-entrada` e o véu com a `.bo-entrada-fundo`, e não se
 * lhes toca. Não atrasam nada: a caixa está no sítio e a escrever desde o
 * primeiro fotograma (o foco vai para o campo num `requestAnimationFrame`, e
 * não no fim de animação nenhuma), e o que a animação faz são quatro píxeis e
 * uma opacidade a subir por cima disso.
 *
 * ── 2. A SAÍDA DEPENDE DE QUEM A CAUSOU, E ISSO NÃO É UM CAPRICHO ─────────
 *
 * Esta paleta fecha-se por dois motivos diferentes, e só um deles é uma saída:
 *
 *   · **DISPENSA** — o Escape, o «×», o carregar no véu. A paleta vai-se
 *     embora e NADA a substitui: por baixo fica exactamente o ecrã que já lá
 *     estava. Aqui o corte seco lê-se como uma avaria («desapareceu?») e a
 *     saída da casa é a palavra certa — 200 ms, e o ecrã volta.
 *
 *   · **ESCOLHA** — o Enter, ou o clique numa linha. A paleta vai-se embora
 *     PORQUE outra coisa está a chegar: o comando corre no mesmo instante e o
 *     que vem a seguir é uma vista nova, que se apresenta com a sua própria
 *     entrada. Aqui a saída não indica direcção nenhuma — compete com a
 *     resposta que a pessoa pediu. E custa: este véu tem `backdrop-blur-sm`,
 *     ou seja manter 200 ms de véu a apagar-se é manter 200 ms de desfoque a
 *     recompor o ecrã INTEIRO a cada fotograma, exactamente no momento em que
 *     o browser está a montar a vista de destino. É o preço mais alto do
 *     orçamento de quadro pago no instante em que ele já está esgotado, para
 *     um gesto para onde ninguém está a olhar — o olho já foi para o
 *     resultado.
 *
 *     O `globals.css` diz a mesma coisa do outro lado, sobre a entrada dos
 *     véus: «o `backdrop-filter` NÃO entra na animação — um desfoque em
 *     transição repinta o ecrã inteiro a cada fotograma». A opacidade dele
 *     entra; a existência do desfoque durante esse tempo é o que aqui se
 *     recusa a prolongar.
 *
 *     Portanto: escolher fecha A SECO, de propósito, e é a decisão mais
 *     importante deste ficheiro.
 *
 * ── 3. O REALCE DA LINHA ESCOLHIDA NÃO TEM TRANSIÇÃO — E TINHA ────────────
 *
 * As linhas traziam o `ESTADO` (120 ms sobre `background-color` e `color`, a
 * escala de `ui/movimento.ts`). Numa lista normal é o que se quer. Aqui não:
 * a linha escolhida move-se com o ↓ e o ↑ SEGURADOS, à cadência de repetição
 * do teclado.
 *
 * A conta, e é uma CONTA e não uma medição num browser (fica dito, para
 * ninguém a citar como medida): a repetição de tecla dos sistemas anda entre
 * uns 15 e uns 30 por segundo, ou seja um passo a cada 33–66 ms. Com uma
 * transição de 120 ms, isso são DOIS A QUATRO passos dentro do tempo de um só
 * esbatimento — várias linhas meio-acesas ao mesmo tempo e nenhuma a ler-se
 * como «é esta que o Enter abre». Uma escolha não é um estado que assenta: é
 * uma posição, e uma posição ambígua num sítio onde a tecla seguinte confirma é
 * pior do que um corte.
 *
 * (O `ui/TabelaOuCartoes.tsx` já recusou uma animação pelo mesmo motivo e com a
 * mesma aritmética — a entrada por filtro, «a 5 teclas por segundo há uma
 * entrada nova de 240 ms a cada 200 ms». É a mesma família de erro: animar ao
 * ritmo do teclado torna ilegível o ecrã que a pessoa está a tentar ler.)
 *
 * O que FICA é a resposta ao toque: o `PRESSAO` (os 20 ms do carregar) com a
 * lista de propriedades mínima que o cobre — `scale`, e mais nada. Isto não é
 * uma terceira linguagem: são os mesmos dois degraus da casa (120/20 ms), só
 * que sobre a única propriedade que aqui se quer animada. Sem a
 * `transition-[scale]`, o `PRESSAO` não anima coisa nenhuma — no Tailwind 4 a
 * classe `scale-*` emite a propriedade autónoma `scale`, e é precisamente essa
 * a avaria nº 1 que o `ui/movimento.ts` conta por extenso.
 */

/**
 * O toque da linha, sem o esbatimento da escolha. Ver o ponto 3 acima.
 */
const TOQUE_DA_LINHA = `motion-safe:transition-[scale] motion-safe:duration-[120ms] ${PRESSAO}`;

/** Um véu e uma caixa, mas um gesto só — uma chave só. Ver `ui/saida.ts`. */
const CHAVE = "paleta";
export default function CommandPalette({
  open,
  onClose,
  navCommands,
  quotes,
  onOpenQuote,
  recentQuotes,
}: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Trap Tab within the dialog + restore focus to the trigger on close.
  // Declarado ANTES da armadilha de foco de propósito: os efeitos correm por
  // ordem de declaração, portanto a página já está trancada quando o foco entra
  // na caixa. Não custa nada e tira uma ordem de que ninguém quer depender.
  useTrincoDeScroll(open);
  const dialogRef = useFocusTrap<HTMLDivElement>(open);
  const listaId = useId();
  const idDaOpcao = (i: number) => `${listaId}-op-${i}`;

  /**
   * ── PORQUE É QUE ISTO NÃO USA O `useSaidaDeUmSo` ──────────────────────────
   *
   * O atalho de `ui/saida.ts` começa a saída SEMPRE que o `aberto` cai, e é o
   * que se quer nas outras cinco superfícies pequenas desta ronda. Aqui não:
   * a saída depende de QUEM a causou (ponto 2 do cabeçalho), e essa condição
   * não cabe num booleano de entrada. Fica a forma longa, com o motivo à vista.
   *
   * `porEscolha` é estado e não referência: é LIDO durante o desenho, no mesmo
   * commit em que o `open` cai, e uma referência lida no desenho é exactamente
   * o que a análise estática desta casa recusa (e com razão: sob `StrictMode` o
   * valor lido podia ser o da passagem anterior).
   */
  const [porEscolha, setPorEscolha] = useState(false);
  const { aSair, comecarSaida } = useSaidaAdiada(() => {});
  const aSairAgora = !open && aSair.includes(CHAVE);
  const [abertoAntes, setAbertoAntes] = useState(open);
  if (abertoAntes !== open) {
    setAbertoAntes(open);
    // Escolher fecha a seco: a vista de destino é que é a resposta.
    if (!open && !porEscolha) comecarSaida(CHAVE);
    setPorEscolha(false);
  }

  /** Correr um comando: o fecho que vem a seguir é uma ESCOLHA, não uma saída. */
  function escolher(cmd: Command) {
    setPorEscolha(true);
    cmd.run();
    onClose();
  }

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const navMatches = navCommands.filter((c) => !q || c.label.toLowerCase().includes(q));

    const quoteMatches: Command[] = q
      ? quotes
          .filter((quote) =>
            [quote.name, quote.email, quote.id, quote.phone]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
          )
          .slice(0, 6)
          .map((quote) => ({
            id: `quote-${quote.id}`,
            label: quote.name,
            hint: quote.email,
            group: "Pedidos",
            run: () => onOpenQuote(quote),
          }))
      : [];

    const recentMatches: Command[] =
      !q && recentQuotes?.length
        ? (recentQuotes
            .map((r) => {
              const full = quotes.find((x) => x.id === r.id);
              if (!full) return null;
              return {
                id: `recent-${r.id}`,
                label: r.name,
                hint: r.email,
                group: "Recentes",
                run: () => onOpenQuote(full),
              };
            })
            .filter(Boolean) as Command[])
        : [];

    return [...recentMatches, ...navMatches, ...quoteMatches];
  }, [query, navCommands, quotes, onOpenQuote, recentQuotes]);

  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results.length, active]);

  // ── A ESCOLHA TEM DE ESTAR À VISTA ────────────────────────────────────────
  // A lista rola dentro de uma caixa de meia altura de ecrã. As setas mexiam o
  // realce mas não a janela: à quinta ou sexta linha a escolha estava debaixo
  // do rodapé e o que se via era uma lista parada — carregava-se em Enter e
  // abria uma coisa que nunca chegou a aparecer. `block: "nearest"` não faz
  // nada quando já se vê, portanto não há solavanco no caso normal.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listaId}-op-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listaId, results.length]);

  // Enquanto a saída corre o nó fica montado, e é a única coisa que o segura.
  if (!open && !aSairAgora) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = results[active];
      if (cmd) escolher(cmd);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  // Group results preserving order
  const groups: { name: string; items: Command[] }[] = [];
  for (const r of results) {
    let g = groups.find((x) => x.name === r.group);
    if (!g) {
      g = { name: r.group, items: [] };
      groups.push(g);
    }
    g.items.push(r);
  }
  let flatIndex = -1;

  return (
    <div
      /* A MOLDURA LARGA OS TOQUES NO PRIMEIRO FOTOGRAMA DA SAÍDA. Ela cobre o
         ecrã todo e o seu `onClick` fecha a paleta; enquanto o véu se apaga,
         um toque destinado ao que está por baixo era engolido aqui — a pessoa
         carrega e não acontece nada, sem sinal nenhum de porquê. O `.bo-saida`
         larga os toques dentro de si; esta moldura não a leva, por isso é
         explícito — e no mesmo commit, nunca num `setTimeout`. */
      className={`fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12dvh] ${
        aSairAgora ? "pointer-events-none" : ""
      }`}
      onClick={aSairAgora ? undefined : onClose}
    >
      <div
        className={`${
          aSairAgora ? SAIDA_FUNDO : "bo-entrada bo-entrada-fundo"
        } absolute inset-0 bg-[#1b2119]/50 backdrop-blur-sm`}
      />
      <div
        ref={dialogRef}
        /* A SAIR, DEIXA DE SER UM DIÁLOGO — no fotograma do gesto, e não no fim
           da animação: quem ouve o ecrã e quem anda de Tab não pode continuar
           dentro de uma caixa que já foi dispensada. */
        role={aSairAgora ? undefined : "dialog"}
        aria-modal={aSairAgora ? undefined : "true"}
        aria-label={aSairAgora ? undefined : "Pesquisar e navegar"}
        aria-hidden={aSairAgora || undefined}
        inert={aSairAgora}
        className={`${
          aSairAgora ? SAIDA : "bo-entrada"
        } relative w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--bo-hairline)] bg-white shadow-[var(--bo-sombra-modal)]`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-[var(--bo-hairline)] px-4 py-3.5">
          <svg
            className="shrink-0 text-foreground/40"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          {/* O FOCO NUNCA SAI DAQUI — e é por isso que isto tem de ser um
              combobox a sério. As setas mexem uma escolha que vive noutro
              elemento; sem `aria-activedescendant` (e sem `role="option"` do
              outro lado), quem ouve o ecrã carrega em ↓ e não ouve nada, e o
              Enter a seguir abre uma coisa que nunca foi anunciada. O
              `placeholder` também não serve de nome: é uma dica, desaparece
              mal se escreve a primeira letra. */}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar ou navegar…"
            aria-label="Pesquisar ou navegar"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listaId}
            aria-autocomplete="list"
            aria-activedescendant={results.length > 0 ? idDaOpcao(active) : undefined}
            className="flex-1 bg-transparent text-[15px] text-[var(--bo-text)] placeholder-foreground/35 focus:outline-none"
          />
          {/* FECHAR: uma tecla em quem tem teclado, um botão em quem não tem.
              Aqui só havia a etiqueta "ESC". Num telemóvel isso é uma
              instrução impossível de seguir, e o que restava para fechar era
              tocar no fundo escuro — que não é um controlo, é uma coisa que se
              descobre por acaso. */}
          <kbd className="pointer-coarse:hidden rounded-md border border-[var(--bo-hairline-strong)] px-1.5 py-0.5 text-[10px] tracking-wider text-foreground/45">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            // `flex pointer-fine:hidden` e NÃO `hidden pointer-coarse:flex`:
            // o Tailwind arruma as classes de `display` todas no mesmo grupo, e
            // dentro dele o `.hidden` sai DEPOIS do `.flex` — portanto ganhava
            // à variante e o botão nunca aparecia, em ecrã de toque nenhum.
            // Medido: `display: none`, 0x0. Com a variante do lado de quem
            // esconde, a ordem passa a jogar a favor.
            /* O `TOQUE_DA_LINHA` e não o `ESTADO`: este ficheiro recusou o
               esbatimento de 120 ms por escrito (ponto 3 do cabeçalho) e tem um
               teste a guardá-lo. O que este botão precisava era só do toque —
               e da `transition-[scale]` que o cobre, senão o `PRESSAO` não
               anima nada. */
            className={`alvo-toque flex pointer-fine:hidden shrink-0 items-center justify-center rounded-lg text-xl leading-none text-foreground/45 ${TOQUE_DA_LINHA}`}
          >
            ×
          </button>
        </div>

        <div className="max-h-[52dvh] overflow-y-auto overscroll-contain p-2">
          {/* Região viva: esta frase é a resposta à ESCRITA, e escrever não move
              o foco. Sem `role="status"` quem ouve o ecrã escrevia, não ouvia
              nada, e ficava sem saber se a paleta estava a pensar, se tinha
              partido, ou se não havia mesmo nada. */}
          {results.length === 0 && (
            <p role="status" className="py-10 text-center text-sm text-foreground/45">
              Sem resultados para “{query.trim()}”.
            </p>
          )}
          <div id={listaId} role="listbox" aria-label="Resultados">
            {groups.map((g) => (
              <div key={g.name} role="group" aria-label={g.name} className="mb-1 last:mb-0">
                <p
                  aria-hidden="true"
                  className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45"
                >
                  {g.name}
                </p>
                {g.items.map((c) => {
                  flatIndex++;
                  const idx = flatIndex;
                  const isActive = active === idx;
                  return (
                    <button
                      key={c.id}
                      id={idDaOpcao(idx)}
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => escolher(c)}
                      /* Sem `ESTADO`: o realce da escolha não esbate. A razão
                         está por extenso no ponto 3 do cabeçalho. */
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${TOQUE_DA_LINHA} ${
                        isActive ? "bg-[#4d6350]/[0.12]" : "hover:bg-[var(--bo-tinta-6)]"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          isActive
                            ? "bg-[#4d6350]/[0.16] text-[#4d6350]"
                            : "bg-[var(--bo-tinta-6)] text-foreground/40"
                        }`}
                        aria-hidden="true"
                      >
                        {c.hint ? (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <circle cx="12" cy="8" r="3.2" />
                            <path d="M5.5 19a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path
                              d="M5 12h14M13 6l6 6-6 6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          isActive ? "font-medium text-[#4d6350]" : "text-[var(--bo-tinta-72)]"
                        }`}
                      >
                        {c.label}
                      </span>
                      {c.hint && (
                        <span className="max-w-[180px] shrink-0 truncate text-xs text-foreground/40">
                          {c.hint}
                        </span>
                      )}
                      {isActive && (
                        <kbd className="pointer-coarse:hidden shrink-0 rounded-md border border-[#4d6350]/25 px-1.5 py-0.5 text-[10px] text-[#4d6350]">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* O rodapé inteiro é instrução de teclado: setas, enter, escape. Num
            ecrã de toque é uma barra a ocupar altura para dizer três coisas
            que não se podem fazer — e a altura, num telemóvel, é o que falta
            para ver os resultados. */}
        <div className="pointer-coarse:hidden flex items-center gap-4 border-t border-[var(--bo-hairline)] px-4 py-2.5 text-[11px] text-foreground/45">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-[var(--bo-hairline-strong)] px-1.5 py-0.5">
              ↑↓
            </kbd>{" "}
            navegar
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-[var(--bo-hairline-strong)] px-1.5 py-0.5">
              ↵
            </kbd>{" "}
            abrir
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-[var(--bo-hairline-strong)] px-1.5 py-0.5">
              esc
            </kbd>{" "}
            fechar
          </span>
        </div>
      </div>
    </div>
  );
}
