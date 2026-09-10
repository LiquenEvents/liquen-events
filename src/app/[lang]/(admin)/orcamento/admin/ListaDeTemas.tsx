"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemeSummary } from "@/lib/theme-types";
import { ESTADO, PRESSAO } from "./ui/movimento";
import {
  SPRING_LOADING_MS,
  destinoValido,
  lerCarga,
  trazFotos,
  type CargaDeFotos,
} from "@/lib/temas-arrasto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COLUNA DA ESQUERDA DO SPLIT VIEW — e o destino do arrasto
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fases 06 e 08 do `docs/APPLE-TEMAS.md`.
 *
 * Ponto 16 da auditoria: «o detalhe é uma página nova com "← Temas" — isso é
 * navegação de telemóvel aplicada a um ecrã de desktop». A correcção é o split
 * view: «lista de temas à esquerda, fotografias à direita; trocar de tema não
 * recarrega a página». [APPLE, Split views]
 *
 * ── PORQUE É QUE ESTA LISTA NÃO É A GRELHA ENCOLHIDA ──────────────────────
 *
 * Porque não fazem o mesmo trabalho. A grelha de cartões é uma MONTRA — capa
 * grande, ressalvas, avisos de nome repetido — e serve para escolher o tema
 * onde se vai trabalhar. Esta é uma barra de NAVEGAÇÃO: já se está a trabalhar
 * num tema, e o que ela responde é «para onde é que eu salto a seguir» e «para
 * onde é que eu largo estas quatro fotografias». Uma capa de 40 px, o nome, e
 * os dois números que decidem — quantas fotos tem e há quanto tempo não lhe
 * tocam. Nada mais cabe numa coluna de 256 px sem ela passar a competir com as
 * fotografias que estão ao lado.
 *
 * ── E PORQUE É QUE ELA NÃO É VIDRO ────────────────────────────────────────
 *
 * «Uma camada de vidro por ecrã» e «vidro só no que flutua» (`CLAUDE.md`, e a
 * Parte 5 do `docs/LIQUID-GLASS.md`). O vidro deste ecrã já está gasto — é a
 * barra da selecção, a primeira superfície de Liquid Glass da casa. Esta lista
 * não flutua: está em fluxo, ao lado do conteúdo, e é uma LISTA, que é
 * exactamente o que a regra manda deixar opaco.
 *
 * ── O SINAL DE ACEITAÇÃO SÓ EXISTE DURANTE O ARRASTO ──────────────────────
 *
 * Ponto 17 e critério 8: «mostrar sinal de aceitação SÓ sobre um destino
 * válido, durante o arrasto; remover o feedback ao sair.» [APPLE] Em repouso
 * esta lista não tem tracejado nenhum, nem moldura de destino, nem convite —
 * é uma lista de temas. O realce (`--bo-accent` a 2 px) nasce no `dragenter`
 * de um lote de fotografias e morre no `dragleave`.
 */

/** O que a lista precisa de saber sobre cada tema, e mais nada. */
export interface ListaDeTemasProps {
  temas: readonly ThemeSummary[];
  /** O tema aberto à direita. `null` = a grelha de cartões está à vista. */
  activoId: string | null;
  aoEscolher: (id: string) => void;
  /** Voltar à grelha de cartões — a saída do split view. */
  aoVoltar: () => void;
  /**
   * Largaram-se fotografias em cima de um tema. Quem age é o `Temas.tsx`, que
   * é quem tem a grelha e o «Anular».
   */
  aoLargarFotos: (destino: ThemeSummary, carga: CargaDeFotos) => void;
  /** Está um lote a ser arrastado neste instante? Vem de fora porque quem o
   *  sabe primeiro é a grelha (o `dragstart` acontece lá). */
  aArrastar?: boolean;
}

/** A capa em miniatura, ou o quadrado vazio de um tema sem fotos. */
function Capa({ tema }: { tema: ThemeSummary }) {
  if (!tema.coverUrl) {
    return <span aria-hidden className="h-10 w-10 shrink-0 rounded-md bg-[var(--bo-tinta-6)]" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tema.coverUrl}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-10 w-10 shrink-0 rounded-md object-cover"
    />
  );
}

export default function ListaDeTemas({
  temas,
  activoId,
  aoEscolher,
  aoVoltar,
  aoLargarFotos,
  aArrastar = false,
}: ListaDeTemasProps) {
  /** O tema por cima do qual o lote está agora. `null` = nenhum. */
  const [sobre, setSobre] = useState<string | null>(null);
  /**
   * ── SPRING LOADING ────────────────────────────────────────────────────
   *
   * «Manter sobre um tema ~1 s abre-o.» [APPLE] O temporizador é UM só e
   * pertence ao tema por cima do qual se está: mudar de linha cancela-o e
   * recomeça, senão atravessar a lista abria os três temas do caminho.
   */
  const mola = useRef<{ id: string; timer: number } | null>(null);
  const pararAMola = useCallback(() => {
    if (mola.current) window.clearTimeout(mola.current.timer);
    mola.current = null;
  }, []);

  // Um arrasto que acaba fora da lista (largado no vazio, ou cancelado com
  // Esc) nunca dispara `dragleave` na linha certa. Sem isto ficava um realce
  // aceso e um temporizador a contar para abrir um tema que ninguém pediu.
  useEffect(() => {
    if (aArrastar) return;
    setSobre(null);
    pararAMola();
  }, [aArrastar, pararAMola]);

  useEffect(() => pararAMola, [pararAMola]);

  return (
    <nav
      aria-label="Temas da biblioteca"
      /* `self-start` e `sticky`: a lista acompanha a grelha de fotografias a
         rolar em vez de se esticar até ao fim dela. O `top-2` é o mesmo da
         barra da selecção — as duas coisas coladas ao topo desta vista param
         na mesma linha. */
      className="hidden lg:sticky lg:top-2 lg:block lg:self-start"
    >
      {/* ── A SAÍDA DO SPLIT VIEW ─────────────────────────────────────────
          O «← Temas» desaparece da barra do tema (Parte 6: «(desaparece —
          split view)»), e o caminho de volta à grelha de cartões passa a ser
          o primeiro item desta lista — que é onde um Mac o põe. */}
      <button
        type="button"
        onClick={aoVoltar}
        className={`alvo-toque mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs uppercase tracking-[0.12em] text-[var(--bo-text-muted)] hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
      >
        <span aria-hidden>←</span>
        Todos os temas
      </button>

      <ul className="flex flex-col gap-0.5">
        {temas.map((t) => {
          const activo = t.id === activoId;
          const alvo = sobre === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                // «Seleção persistente no painel que conduz ao detalhe.»
                // [APPLE, Split views] O `aria-current` é o que diz, a quem
                // ouve o ecrã, qual é o tema que está desenhado ao lado.
                aria-current={activo ? "true" : undefined}
                onClick={() => aoEscolher(t.id)}
                onDragEnter={(e) => {
                  if (!trazFotos(e.dataTransfer)) return;
                  e.preventDefault();
                  setSobre(t.id);
                  if (mola.current?.id === t.id) return;
                  pararAMola();
                  mola.current = {
                    id: t.id,
                    // Abrir o tema por baixo do lote não larga nada: o arrasto
                    // continua, e agora com a grelha do destino à vista. É o
                    // que o spring loading é para servir.
                    timer: window.setTimeout(() => {
                      mola.current = null;
                      aoEscolher(t.id);
                    }, SPRING_LOADING_MS),
                  };
                }}
                onDragOver={(e) => {
                  if (!trazFotos(e.dataTransfer)) return;
                  // Sem isto o browser recusa a largada — e o cursor fica em
                  // `not-allowed`, que é o sinal certo para um destino inválido
                  // e o errado para este.
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDragLeave={() => {
                  setSobre((s) => (s === t.id ? null : s));
                  if (mola.current?.id === t.id) pararAMola();
                }}
                onDrop={(e) => {
                  if (!trazFotos(e.dataTransfer)) return;
                  e.preventDefault();
                  setSobre(null);
                  pararAMola();
                  const carga = lerCarga(e.dataTransfer);
                  if (destinoValido(carga, t.id)) aoLargarFotos(t, carga!);
                }}
                className={`alvo-toque flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left ${ESTADO} ${PRESSAO} ${
                  alvo
                    ? // O sinal de aceitação, e só durante o arrasto: o realce
                      // do contentor mais uma moldura de 2 px, que é o que o
                      // ponto 17 pede em vez do tracejado permanente.
                      "border-[var(--bo-accent)] bg-[var(--bo-accent-lavagem)]"
                    : activo
                      ? "border-transparent bg-[var(--bo-tinta-6)]"
                      : "border-transparent hover:bg-[var(--bo-tinta-6)]"
                }`}
              >
                <Capa tema={t} />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[13px] leading-snug ${
                      activo ? "text-[var(--bo-text)]" : "text-[var(--bo-tinta-72)]"
                    }`}
                  >
                    {t.name}
                  </span>
                  <span className="bo-text-muted block truncate text-[11px] tabular-nums">
                    {t.imageCount === null
                      ? "Fotos indisponíveis"
                      : `${t.imageCount}${t.truncated ? "+" : ""} ${t.imageCount === 1 ? "foto" : "fotos"}`}
                    {t.favorito ? (
                      <>
                        {" · "}
                        <span aria-hidden="true" className="text-[var(--bo-accent)]">
                          ★
                        </span>
                        <span className="sr-only">Fixado no topo</span>
                      </>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
