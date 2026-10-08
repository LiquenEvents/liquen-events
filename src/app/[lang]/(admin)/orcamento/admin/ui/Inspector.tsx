"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useAdaptativo } from "./adaptativo";
import { cn } from "./cn";
import { FolhaOuDialogo } from "./FolhaOuDialogo";
import { ESTADO, PRESSAO } from "./movimento";
import { SAIDA, useSaidaDeUmSo } from "./saida";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O INSPECTOR — a coluna da direita, 320 px, ⌘I
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do `docs/PROPOSTAS-E-TEMAS-APPLE.md` §6: o painel das coisas que são só
 * dela (custos, margens, notas internas), ao lado do que se está a fazer, e
 * que se abre e fecha com ⌘I — o atalho do inspector no Finder, no Keynote e
 * no Pages. Fica pronto na Fase 1; quem o monta é a Fase 3.
 *
 * ── DUAS FORMAS, COMO O `FolhaOuDialogo` ──────────────────────────────────
 *
 *  · De `lg` para cima (1024 px, o `desktop` do `useAdaptativo`) é uma COLUNA:
 *    `<aside>` de 320 px (`w-80`) que quem chama põe numa fila ao lado do
 *    conteúdo (`<div className="flex gap-6"><main className="min-w-0
 *    flex-1"/><Inspector/></div>`). Cola-se ao topo como o painel do pedido
 *    do `AdminClient` (`sticky top-24`, a mesma altura máxima).
 *  · Abaixo de `lg` não há onde pôr uma coluna de 320 px ao lado de nada:
 *    passa a FOLHA, pelo `FolhaOuDialogo`, que já traz a armadilha de foco, o
 *    Escape, o gesto de voltar e o arrasto para baixo.
 *
 *  Antes de montar não se sabe a largura (o servidor não tem janela): desenha
 *  -se a coluna com `max-lg:hidden`, para no computador ela estar lá no
 *  primeiro pixel e no telemóvel não aparecer uma coluna espremida por um
 *  instante.
 *
 * ── OPACO, E NÃO VIDRO ────────────────────────────────────────────────────
 *
 * «Uma camada de vidro por ecrã» (`docs/LIQUID-GLASS.md`, Parte 5): o
 * cabeçalho já gasta a deste ecrã. O inspector é `--bo-elevado` com a
 * `--bo-sombra-suspensa` — no claro a sombra é que o separa, no escuro é a
 * luminosidade (`#1e241e` contra o `#171b17` do cartão).
 *
 * ── O TECLADO ─────────────────────────────────────────────────────────────
 *
 *  · Abrir leva o foco para dentro: o primeiro controlo do conteúdo, ou o
 *    «Fechar» se o conteúdo não tiver nenhum. Fechar devolve-o a quem o tinha
 *    — mas só se ele ainda estiver no painel (ou perdido no `<body>`): quem
 *    entretanto clicou noutro sítio fica onde clicou.
 *  · Escape fecha quando o foco está no painel. Não é um modal: um Escape
 *    carregado no resto do ecrã é de quem lá está.
 *  · ⌘I (Ctrl+I fora do Mac) chama o `onAlternar`, com `atalho`. Também
 *    dentro de um campo de texto — num `<input>` ou `<textarea>` o ⌘I não faz
 *    nada no Mac, e no Firefox o Ctrl+I abre a janela de informação da
 *    página, que aqui só atrapalha. A EXCEPÇÃO é um `contenteditable`: aí o
 *    ⌘I é itálico (o `RichEmailEditor` tem um), e o atalho não lho tira.
 */
export interface InspectorProps {
  aberto: boolean;
  onFechar: () => void;
  /** O título do painel. Dá-lhe o nome acessível, nas duas formas. */
  titulo: string;
  children: ReactNode;
  /** Regista o ⌘I / Ctrl+I, que chama o `onAlternar`. */
  atalho?: boolean;
  /** Abrir se está fechado, fechar se está aberto — é quem chama que decide. */
  onAlternar?: () => void;
}

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Inspector({
  aberto,
  onFechar,
  titulo,
  children,
  atalho = false,
  onAlternar,
}: InspectorProps) {
  const { desktop, montado } = useAdaptativo();
  const comoFolha = montado && !desktop;
  const idTitulo = useId();
  const painelRef = useRef<HTMLElement | null>(null);
  const corpoRef = useRef<HTMLDivElement | null>(null);
  const fecharRef = useRef<HTMLButtonElement | null>(null);
  const aSair = useSaidaDeUmSo(aberto);

  /* ── ⌘I ────────────────────────────────────────────────────────────────
     No documento, e não no painel: o atalho tem de ABRIR, e fechado o painel
     não existe. O `onAlternar` vai por referência para o ouvinte não ser
     desmontado e montado a cada desenho de quem chama. */
  const alternar = useRef(onAlternar);
  useEffect(() => {
    alternar.current = onAlternar;
  });
  useEffect(() => {
    if (!atalho) return;
    const aoTeclar = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "i" || e.repeat || e.isComposing || e.defaultPrevented) return;
      const alvo = e.target instanceof HTMLElement ? e.target : null;
      if (alvo?.isContentEditable) return; // aí o ⌘I é itálico
      if (!alternar.current) return;
      e.preventDefault();
      alternar.current();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [atalho]);

  /* ── O FOCO ENTRA, E VOLTA ─────────────────────────────────────────────
     Só na coluna: na folha quem trata disto é a armadilha do
     `FolhaOuDialogo`. A limpeza corre quando o `aberto` cai — o painel já
     está `inert` nesse desenho, e um `inert` deixa o foco no `<body>`, que é
     exactamente o caso em que ele tem de voltar.

     E só quando ELA o abre: um inspector que já vem aberto ao carregar a
     página não puxa o foco para si — «nunca mudes o foco sem acção da
     pessoa» (Parte 12.2 do sistema de design). */
  const jaEsteveFechado = useRef(!aberto);
  useEffect(() => {
    if (!aberto) jaEsteveFechado.current = true;
  }, [aberto]);
  useEffect(() => {
    if (!aberto || comoFolha || !jaEsteveFechado.current) return;
    const painel = painelRef.current;
    if (!painel) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!painel.contains(document.activeElement)) {
      const primeiro = corpoRef.current?.querySelector<HTMLElement>(FOCAVEIS);
      (primeiro ?? fecharRef.current ?? painel).focus();
    }
    return () => {
      const agora = document.activeElement;
      const perdido = !agora || agora === document.body || painel.contains(agora);
      if (perdido && anterior?.isConnected) anterior.focus();
    };
  }, [aberto, comoFolha]);

  if (comoFolha) {
    return (
      <FolhaOuDialogo aberto={aberto} onFechar={onFechar} titulo={titulo}>
        {children}
      </FolhaOuDialogo>
    );
  }

  if (!aberto && !aSair) return null;

  const aoTeclar = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      onFechar();
    }
  };

  return (
    <aside
      ref={painelRef}
      aria-labelledby={aSair ? undefined : idTitulo}
      aria-hidden={aSair || undefined}
      inert={aSair}
      tabIndex={-1}
      onKeyDown={aoTeclar}
      className={cn(
        aSair ? SAIDA : "bo-entrada",
        // O mesmo topo e a mesma altura máxima do painel do pedido no
        // `AdminClient`: fica abaixo do cabeçalho e acima da barra de baixo.
        "sticky top-24 flex max-h-[calc(100vh-6rem-var(--bo-barra-inferior)-env(safe-area-inset-bottom))] w-80 shrink-0 flex-col overflow-hidden",
        "rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-elevado)] shadow-[var(--bo-sombra-suspensa)]",
        // Antes de montar, o CSS é que decide: no telemóvel não há coluna.
        "max-lg:hidden",
      )}
    >
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-[var(--bo-hairline)] pl-4 pr-1">
        <h2
          id={idTitulo}
          className="min-w-0 flex-1 truncate font-display text-lg text-[var(--bo-text)]"
        >
          {titulo}
        </h2>
        <button
          ref={fecharRef}
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className={`alvo-toque flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--bo-text-muted)] hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] active:bg-[var(--bo-tinta-10)] ${ESTADO} ${PRESSAO}`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div ref={corpoRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {children}
      </div>
    </aside>
  );
}
