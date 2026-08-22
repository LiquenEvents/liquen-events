"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCamadaDeHistoria } from "../useCamadaDeHistoria";
import { useFocusTrap } from "../useFocusTrap";
import { useTrincoDeScroll } from "../useTrincoDeScroll";
import { useAdaptativo } from "./adaptativo";
import { cn } from "./cn";

/**
 * UMA CAIXA QUE MUDA DE FORMA — diálogo centrado no computador, folha inferior
 * arrastável no telemóvel.
 *
 * ── Porque é que não é o mesmo modal a encolher ─────────────────────────────
 * Um diálogo centrado num ecrã de 375 px é uma caixa a flutuar com margens
 * inúteis dos dois lados, com o botão de fechar no canto superior direito — o
 * ponto mais longe do polegar de quem segura o telemóvel com uma mão. A folha
 * inferior resolve as duas coisas: usa a largura toda e as acções ficam em
 * baixo, onde o polegar está. E fecha-se com um gesto para baixo, que é o gesto
 * que o sistema já ensinou a toda a gente.
 *
 * ── O que é IGUAL nos dois, e não é por acaso ───────────────────────────────
 * A armadilha de foco, o Escape, o bloqueio do scroll de fundo e o `aria-modal`.
 * A forma muda; o contrato de acessibilidade não. Ter duas implementações a
 * sério significaria duas maneiras de esquecer uma delas.
 */

export interface FolhaOuDialogoProps {
  aberto: boolean;
  onFechar: () => void;
  /** Título — obrigatório, é o nome acessível da caixa. */
  titulo: string;
  /** Uma linha por baixo do título. */
  descricao?: string;
  children: ReactNode;
  /** Acções principais. No telemóvel ficam coladas em baixo, ao alcance do
   *  polegar; no computador, no rodapé do diálogo. */
  accoes?: ReactNode;
  /** Largura máxima do DIÁLOGO (não afecta a folha, que usa o ecrã todo). */
  largura?: "sm" | "md" | "lg";
  /** A folha ocupa quase o ecrã todo — para grelhas de fotos, onde ver muito é
   *  o objectivo. Sem isto ajusta-se ao conteúdo. */
  folhaAlta?: boolean;
}

const LARGURAS = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl" } as const;

/** Distância, em píxeis, a partir da qual o arrasto para baixo fecha a folha.
 *  Curto de mais fecha sozinho ao rolar; longo de mais parece que não responde. */
const FECHAR_A_PARTIR_DE = 80;

export function FolhaOuDialogo({
  aberto,
  onFechar,
  titulo,
  descricao,
  children,
  accoes,
  largura = "md",
  folhaAlta = false,
}: FolhaOuDialogoProps) {
  const { telemovel, montado } = useAdaptativo();
  // Trava o scroll do fundo enquanto está aberto. Sem isto, arrastar dentro da
  // folha faz a página lá atrás andar — e ao fechar já não se está onde se
  // estava. O trinco é partilhado com os outros diálogos (e conta-se, para uma
  // folha aberta por cima de um diálogo não destrancar o de baixo ao fechar);
  // vem ANTES da armadilha de foco para o foco a entrar não rolar a página.
  useTrincoDeScroll(aberto);
  /* ── O GESTO DE VOLTAR FECHA ISTO, E NÃO O BACK OFFICE ─────────────────────
     Num iPhone, deslizar da esquerda É o botão de voltar, e faz-se sem pensar —
     numa quinta, com o telemóvel numa mão e uma caixa de flores na outra,
     faz-se por acidente. Sem uma entrada na história, o Safari saía da
     aplicação e levava com ele o que estivesse escrito aqui dentro.

     Ao pé do Escape de propósito: é a mesma promessa, no gesto que o telemóvel
     tem em vez do teclado que não tem. Ver `useCamadaDeHistoria`. */
  useCamadaDeHistoria(aberto, onFechar);
  const caixaRef = useFocusTrap<HTMLDivElement>(aberto);
  const [arrasto, setArrasto] = useState(0);
  const inicioY = useRef<number | null>(null);

  // Escape fecha, nos dois formatos. Um `keydown` no documento e não no
  // elemento: o foco pode estar num campo lá dentro.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, onFechar]);

  // Cada abertura começa sem arrasto acumulado: sem isto, uma folha fechada a
  // meio de um gesto reabria já puxada para baixo.
  useEffect(() => {
    if (aberto) setArrasto(0);
  }, [aberto]);

  if (!aberto) return null;

  // Antes de montar não sabemos a largura real. Desenha-se a FOLHA, que é o
  // formato mais simples e o que menos estranha se aparecer por um instante num
  // ecrã grande — o contrário (um diálogo centrado a saltar para folha) vê-se.
  const comoFolha = telemovel || !montado;

  const cabecalho = (
    <div className="px-5 pt-4">
      <h2 className="font-display text-lg text-foreground/85">{titulo}</h2>
      {descricao && <p className="bo-text-muted mt-1 text-sm">{descricao}</p>}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="presentation"
      // O fundo fecha — mas só quando o toque COMEÇOU nele. Sem esta condição,
      // arrastar de dentro para fora (a seleccionar texto, por exemplo) fechava
      // a caixa e perdia-se o que lá estava escrito.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="absolute inset-0 bg-[#1b2119]/40 backdrop-blur-[2px]" aria-hidden />

      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        style={comoFolha && arrasto ? { transform: `translateY(${arrasto}px)` } : undefined}
        className={cn(
          "relative z-10 flex flex-col overflow-hidden bg-[var(--bo-surface,#ffffff)] shadow-xl",
          comoFolha
            ? cn(
                // `dvh` e não `vh`: com a barra do browser à vista, `100vh` é
                // maior do que o que se vê, e o rodapé com as acções ficava
                // debaixo dela.
                "mt-auto w-full rounded-t-2xl",
                folhaAlta ? "h-[92dvh]" : "max-h-[88dvh]",
              )
            : cn("m-auto w-full rounded-2xl", LARGURAS[largura], "max-h-[85dvh]"),
        )}
      >
        {comoFolha && (
          // A pega. É ela que diz, sem palavras, que isto se arrasta — e é
          // deliberadamente um alvo grande: o gesto começa aqui, não no
          // conteúdo, senão competia com o scroll da lista lá dentro.
          <div
            className="flex h-9 shrink-0 cursor-grab touch-none items-center justify-center"
            onPointerDown={(e) => {
              inicioY.current = e.clientY;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (inicioY.current === null) return;
              // Só para BAIXO: puxar para cima não faz nada, em vez de
              // descolar a folha do fundo do ecrã.
              setArrasto(Math.max(0, e.clientY - inicioY.current));
            }}
            onPointerUp={() => {
              const passou = arrasto > FECHAR_A_PARTIR_DE;
              inicioY.current = null;
              setArrasto(0);
              if (passou) onFechar();
            }}
            onPointerCancel={() => {
              inicioY.current = null;
              setArrasto(0);
            }}
            aria-hidden
          >
            <span className="h-1 w-10 rounded-full bg-foreground/20" />
          </div>
        )}

        {cabecalho}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>

        {accoes && (
          <div
            className={cn(
              "flex shrink-0 gap-2 border-t border-foreground/[0.08] px-5 py-3",
              // No telemóvel as acções encostam ao fundo e respeitam a área
              // segura do iPhone; no computador vão para a direita, como num
              // diálogo de sempre.
              comoFolha ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "justify-end",
            )}
          >
            {accoes}
          </div>
        )}

        {/* Fechar por botão existe SEMPRE. O gesto é um atalho, não a única
            saída: quem usa leitor de ecrã ou teclado não arrasta nada. */}
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className={cn(
            "alvo-toque absolute right-2 flex h-11 w-11 items-center justify-center rounded-lg text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground/70",
            comoFolha ? "top-8" : "top-2",
          )}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
