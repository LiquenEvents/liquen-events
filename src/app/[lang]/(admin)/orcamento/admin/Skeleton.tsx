"use client";

import { hex, lerHex } from "@/lib/cor-dominante";
import { cn } from "./ui/cn";

/**
 * Skeleton loaders for the back office. Instead of a bare spinner or "A
 * carregar…" text, these mirror the shape of the content that's about to
 * arrive — the layout settles in place and the wait feels shorter.
 */

/**
 * «A CARREGAR», DITO PARA QUEM NÃO VÊ AS BARRAS.
 *
 * Estava um `aria-label="A carregar"` numa `div` sem `role`. Uma `div` genérica
 * não aceita nome — a árvore de acessibilidade deita-o fora —, portanto quem
 * ouve o ecrã tinha silêncio durante toda a espera e a única conclusão possível
 * era que a página estava avariada. Uma região viva com texto lá dentro é o que
 * se anuncia: o texto é o que os leitores lêem, o `role="status"` é o que lhes
 * diz que apareceu sem ninguém ter carregado em nada.
 */
function ADizerQueCarrega() {
  return <span className="sr-only">A carregar…</span>;
}

/** A single shimmering bar. `className` controls width/height. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`bo-skeleton ${className}`} aria-hidden />;
}

/** A card-shaped skeleton with a couple of text lines. */
export function SkeletonCard() {
  return (
    <div className="bo-card p-5">
      <div className="flex items-center gap-3 mb-4">
        <SkeletonBar className="w-9 h-9 !rounded-full shrink-0" />
        <div className="flex-1">
          <SkeletonBar className="h-3.5 w-1/2 mb-2" />
          <SkeletonBar className="h-2.5 w-1/3" />
        </div>
      </div>
      <SkeletonBar className="h-2.5 w-full mb-2" />
      <SkeletonBar className="h-2.5 w-4/5" />
    </div>
  );
}

/** A row-shaped skeleton (avatar + two lines + trailing value). */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <SkeletonBar className="w-9 h-9 !rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <SkeletonBar className="h-3 w-2/5 mb-2" />
        <SkeletonBar className="h-2.5 w-3/5" />
      </div>
      <SkeletonBar className="h-3 w-16 shrink-0" />
    </div>
  );
}

/**
 * A full-view loading state used by the code-split views while their JS chunk
 * arrives: a header line, a KPI strip, then a panel. Generic enough to stand
 * in for any of the dashboard views without looking wrong.
 *
 * `data-view-skeleton` marca especificamente a espera pelo CÓDIGO da vista (o
 * chunk), por oposição a `SkeletonList`, que é a espera pelos DADOS. São dois
 * atrasos diferentes com curas diferentes — o primeiro resolve-se com
 * pré-carregamento (ver `warmViewChunks` em lazy.tsx), o segundo com cache de
 * listas — e sem esta marca não se consegue medir um sem o outro.
 */
export function ViewSkeleton() {
  return (
    /* O MESMO espaço do conteúdo que vem a seguir, lido do MESMO token.
       Um esqueleto mais folgado do que aquilo que substitui empurra as
       silhuetas para baixo, e quando o conteúdo chega tudo sobe de uma vez —
       o salto acontece precisamente no instante em que ela já está a olhar. */
    <div
      className="flex flex-col gap-[var(--bo-gap-vista)]"
      data-view-skeleton=""
      role="status"
      aria-busy="true"
    >
      <ADizerQueCarrega />
      {/* Greeting */}
      <div>
        <SkeletonBar className="h-2.5 w-40 mb-3" />
        <SkeletonBar className="h-9 w-72 mb-3" />
        <SkeletonBar className="h-3 w-56" />
      </div>
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bo-card p-[var(--bo-p-cartao)]">
            <SkeletonBar className="h-7 w-16 mb-3" />
            <SkeletonBar className="h-2.5 w-20" />
          </div>
        ))}
      </div>
      {/* Panel */}
      <div className="bo-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--bo-hairline)]">
          <SkeletonBar className="h-2.5 w-36" />
        </div>
        <div className="divide-y divide-[var(--bo-hairline)]">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A list of row skeletons inside a card — for the data-fetching views. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div
      className="bo-card overflow-hidden divide-y divide-[var(--bo-hairline)]"
      role="status"
      aria-busy="true"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
      {/* Em ÚLTIMO, e não em primeiro: o `divide-y` desenha a linha divisória em
          todos os filhos menos o primeiro, e pôr o anúncio à cabeça dava uma
          linha a mais por cima da primeira fila. Numa região viva a ordem não
          conta para nada — quem lê, lê o conteúdo todo. */}
      <ADizerQueCarrega />
    </div>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESQUELETO DA COR DA FOTOGRAFIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Enquanto uma fotografia não chega, o lugar dela pinta-se com a cor que ela
 * VAI ter — a dominante, que o trabalhador das imagens já calcula ao carregar
 * (`src/lib/cor-dominante.ts`) e que vem gravada em `ThemeImage.cor`. Uma
 * grelha de temas a carregar passa a ser uma grelha de cores certas em vez de
 * vinte rectângulos cinzentos iguais, e a foto que chega assenta numa mancha
 * que já era dela. Fica pronto aqui; quem o usa são as grelhas dos Temas, na
 * fase seguinte.
 *
 * Sem cor — fotos carregadas antes de a cor existir, ou um valor que não se
 * reconhece — é o `.bo-skeleton` de sempre, com o brilho a passar.
 *
 * ── A COR NÃO ENTRA NO CSS SEM SER LIDA ──────────────────────────────────
 *
 * O valor vem da base de dados, e uma cor escrita num `style` é uma porta
 * aberta para o CSS se não for verificada. Só passa o formato que o
 * `cor-dominante.ts` produz — `#rrggbb`, verificado pelo `lerHex` dele — e o
 * que chega ao `style` é REESCRITO pelo `hex` a partir dos três números, não
 * o texto que entrou. Tudo o resto cai no cinzento.
 *
 * ── E SEM BRILHO ──────────────────────────────────────────────────────────
 *
 * Com cor, é um bloco liso e parado: o brilho a passar por cima de uma cor
 * sólida fazia-a piscar, e o que se quer é que ela já pareça a fotografia. É
 * também o que pede quem prefere menos movimento — e aqui nem é preciso
 * perguntar, porque não há movimento nenhum para tirar.
 *
 * O raio é o do `.bo-skeleton` (`--bo-raio-conteudo`, 8 px), para as duas
 * formas terem o mesmo canto. Quem quiser outro passa-o em `className` — com
 * `!` no caso cinzento, porque a regra do `.bo-skeleton` está fora de camadas
 * (é o que o `SkeletonCard` já faz com o `!rounded-full`).
 */
export interface EsqueletoDeCorProps {
  /** A cor dominante da fotografia, em `#rrggbb` (`ThemeImage.cor`). */
  cor?: string | null;
  className?: string;
  /** A proporção da fotografia, para o lugar já ter o tamanho certo: `"4 / 3"`, `"1.5"`. */
  aspecto?: string;
}

/** `#rrggbb` reescrito a partir dos números, ou `null`. Nunca o texto que entrou. */
export function corSegura(cor: string | null | undefined): string | null {
  if (typeof cor !== "string") return null;
  const rgb = lerHex(cor);
  return rgb ? hex(rgb.r, rgb.g, rgb.b) : null;
}

/** Uma proporção do CSS (`4 / 3`, `1.5`) e nada mais. */
const PROPORCAO = /^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?$/;

export function EsqueletoDeCor({ cor, className, aspecto }: EsqueletoDeCorProps) {
  const fundo = corSegura(cor);
  const proporcao = aspecto && PROPORCAO.test(aspecto.trim()) ? aspecto.trim() : undefined;
  if (!fundo) {
    return (
      <div
        className={cn("bo-skeleton", className)}
        style={proporcao ? { aspectRatio: proporcao } : undefined}
        aria-hidden
      />
    );
  }
  return (
    <div
      className={cn("rounded-[var(--bo-raio-conteudo)]", className)}
      style={{ backgroundColor: fundo, ...(proporcao && { aspectRatio: proporcao }) }}
      data-cor={fundo}
      aria-hidden
    />
  );
}
