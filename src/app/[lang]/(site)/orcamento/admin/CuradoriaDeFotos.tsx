"use client";

import { useEffect, useRef, useState } from "react";
import type { ThemeImage } from "@/lib/theme-types";
import { Button } from "./ui";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FOTO DE CADA VEZ — o modo de curadoria
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «percorrer 40 fotos parecidas numa grelha de miniaturas leva a
 * escolhas distraídas. Uma de cada vez, em grande, permite decidir com atenção —
 * e é mais rápido, não mais lento.»
 *
 * ── PORQUE É QUE É MAIS RÁPIDO, E NÃO MAIS LENTO ──────────────────────────
 *
 * Numa grelha, cada foto custa uma comparação com as vizinhas: olha-se para
 * nove ao mesmo tempo e decide-se por eliminação, o que obriga a voltar atrás.
 * Aqui cada foto custa UMA decisão, e a decisão seguinte não depende da
 * anterior. O que se perde em visão de conjunto ganha-se em não reconsiderar.
 *
 * ── O QUE ESTE COMPONENTE NÃO SABE ────────────────────────────────────────
 *
 * Não sabe o que é uma proposta, não copia nada e não guarda nada. Recebe as
 * fotos e o conjunto do que já está escolhido, e devolve decisões — quem as
 * aplica é o painel, no MESMO estado que a grelha usa. É isso que faz «alternar
 * entre grelha e curadoria a qualquer momento, sem perder as escolhas» sair de
 * graça: não há duas listas para sincronizar, há uma.
 *
 * ── OS GESTOS, E PORQUE É QUE HÁ BOTÕES ───────────────────────────────────
 *
 * Direita inclui, esquerda salta, cima abre em ecrã inteiro. E há três botões
 * que fazem exactamente o mesmo, porque um gesto que ninguém descobre é uma
 * funcionalidade que não existe — e porque quem navega por teclado não desliza
 * nada. As setas do teclado fazem o mesmo que os dedos.
 */

/** Uma decisão tomada, para se poder voltar atrás. */
interface Decisao {
  path: string;
  incluida: boolean;
}

/** Quanto é preciso arrastar para valer como decisão. Abaixo disto é um toque
 *  trémulo, e a foto volta ao sítio. */
const LIMIAR = 70;

export function CuradoriaDeFotos({
  images,
  escolhidas,
  usadas,
  podeEscolherMais,
  aoDecidir,
  aoVerGrande,
  aoSair,
}: {
  images: readonly ThemeImage[];
  /** Os caminhos já escolhidos — a curadoria começa depois deles. */
  escolhidas: ReadonlySet<string>;
  /** As que já estão nesta proposta. Aparecem marcadas, e não se voltam a
   *  propor como novidade. */
  usadas: ReadonlySet<string>;
  /** Há espaço no lote para mais uma? */
  podeEscolherMais: boolean;
  /** Uma decisão: incluir (ou tirar) esta foto. */
  aoDecidir: (path: string, incluir: boolean) => void;
  aoVerGrande: (indice: number) => void;
  aoSair: () => void;
}) {
  const [indice, setIndice] = useState(0);
  /** A pilha das decisões, para o «Anular». */
  const [historico, setHistorico] = useState<Decisao[]>([]);
  /** Para onde a foto está a ser arrastada agora. */
  const [arrastoX, setArrastoX] = useState(0);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const cartao = useRef<HTMLDivElement | null>(null);

  const foto = images[indice] ?? null;
  const acabou = indice >= images.length;

  /**
   * O foco entra no cartão ao montar, e é isso que faz as setas do teclado
   * funcionarem sem ninguém ter de carregar em nada primeiro.
   */
  useEffect(() => {
    cartao.current?.focus();
  }, []);

  function decidir(incluir: boolean) {
    if (!foto) return;
    // Ao TETO, incluir não faz nada — mas saltar continua a fazer, senão a
    // curadoria ficava presa na mesma foto sem dizer porquê.
    if (incluir && !podeEscolherMais && !escolhidas.has(foto.path)) return;
    aoDecidir(foto.path, incluir);
    setHistorico((h) => [...h, { path: foto.path, incluida: incluir }]);
    setIndice((i) => i + 1);
    setArrastoX(0);
  }

  function anular() {
    const ultima = historico[historico.length - 1];
    if (!ultima) return;
    // Desfazer é desfazer mesmo: uma foto incluída sai da selecção. Uma saltada
    // não tem nada para tirar — só se volta a ela.
    if (ultima.incluida) aoDecidir(ultima.path, false);
    setHistorico((h) => h.slice(0, -1));
    setIndice((i) => Math.max(0, i - 1));
    setArrastoX(0);
  }

  // ── Os dedos ──────────────────────────────────────────────────────────────

  function pousar(e: React.PointerEvent) {
    inicio.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function mover(e: React.PointerEvent) {
    if (!inicio.current) return;
    setArrastoX(e.clientX - inicio.current.x);
  }

  function largar(e: React.PointerEvent) {
    const partida = inicio.current;
    inicio.current = null;
    if (!partida) return;
    const dx = e.clientX - partida.x;
    const dy = e.clientY - partida.y;
    setArrastoX(0);
    // Para CIMA é ver em grande, e ganha ao horizontal quando é mais vertical
    // do que lateral — senão um arrasto na diagonal decidia por acidente.
    if (-dy > LIMIAR && Math.abs(dy) > Math.abs(dx)) {
      aoVerGrande(indice);
      return;
    }
    if (dx > LIMIAR) decidir(true);
    else if (dx < -LIMIAR) decidir(false);
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      decidir(true);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      decidir(false);
    } else if (e.key === "ArrowUp" || e.key === "v" || e.key === "V") {
      e.preventDefault();
      if (!acabou) aoVerGrande(indice);
    }
  }

  // ── O fim ─────────────────────────────────────────────────────────────────

  if (acabou) {
    const incluidas = historico.filter((d) => d.incluida);
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center">
        <p className="font-display text-lg text-foreground/85">
          {incluidas.length === 0
            ? "Passaste por todas e não escolheste nenhuma."
            : `Escolheste ${incluidas.length} ${incluidas.length === 1 ? "foto" : "fotos"}.`}
        </p>
        <p className="bo-text-muted mt-1 max-w-sm text-sm">
          {incluidas.length === 0
            ? "Podes voltar atrás, mudar de tema, ou ver a grelha toda de uma vez."
            : "Ainda não entraram na proposta — confirma em baixo, ou volta à grelha para rever."}
        </p>
        {incluidas.length > 0 && (
          /* O resumo é de MINIATURAS e não de nomes: o que se está a confirmar
             são fotografias, e uma lista de caminhos não diz nada sobre elas. */
          <div className="mt-4 flex max-w-full flex-wrap justify-center gap-2 overflow-y-auto">
            {incluidas.map((d) => {
              const im = images.find((i) => i.path === d.path);
              return (
                <img
                  key={d.path}
                  src={im?.thumbUrl || im?.url || ""}
                  alt=""
                  className="h-16 w-16 rounded-lg object-cover"
                />
              );
            })}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {historico.length > 0 && (
            <Button size="sm" variant="ghost" onClick={anular}>
              ↩ Anular a última
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={aoSair}>
            Ver a grelha
          </Button>
        </div>
      </div>
    );
  }

  const inclinacao = Math.max(-8, Math.min(8, arrastoX / 14));
  /** O que vai acontecer se largar agora — é o que pinta a moldura. */
  const rumo = arrastoX > LIMIAR ? "incluir" : arrastoX < -LIMIAR ? "saltar" : null;

  return (
    <div className="flex flex-1 flex-col px-5 py-3">
      {/* ── O PROGRESSO ─────────────────────────────────────────────────────
          «12 de 37» e não uma barra: o número diz quantas faltam, que é a
          pergunta de quem está a meio de quarenta fotografias parecidas. */}
      <div className="flex items-center justify-between gap-3">
        <p className="bo-text-muted text-xs tabular-nums" aria-live="polite">
          {indice + 1} de {images.length}
        </p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={anular} disabled={historico.length === 0}>
            ↩ Anular
          </Button>
          <Button size="sm" variant="ghost" onClick={aoSair}>
            Ver em grelha
          </Button>
        </div>
      </div>

      {/* ── A FOTO ──────────────────────────────────────────────────────────
          `object-contain` e não `object-cover`: aqui a decisão é sobre a
          fotografia inteira, e cortar-lhe as pontas para encher um quadrado era
          decidir sobre uma foto que não é aquela. */}
      <div
        ref={cartao}
        tabIndex={0}
        role="group"
        aria-label={`Foto ${indice + 1} de ${images.length}${
          foto && usadas.has(foto.path) ? " (já nesta proposta)" : ""
        }`}
        onKeyDown={teclado}
        onPointerDown={pousar}
        onPointerMove={mover}
        onPointerUp={largar}
        onPointerCancel={() => {
          inicio.current = null;
          setArrastoX(0);
        }}
        style={{
          transform: arrastoX ? `translateX(${arrastoX}px) rotate(${inclinacao}deg)` : undefined,
        }}
        className={`relative mt-2 flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden rounded-2xl border-2 bg-foreground/[0.04] focus-visible:outline-none ${
          rumo === "incluir"
            ? "border-[#4d6350]"
            : rumo === "saltar"
              ? "border-foreground/30"
              : "border-transparent"
        }`}
      >
        {foto && (
          <img
            src={foto.url || foto.thumbUrl || ""}
            alt=""
            draggable={false}
            className="max-h-full max-w-full select-none object-contain"
          />
        )}
        {foto && usadas.has(foto.path) && (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-white">
            Já nesta proposta
          </span>
        )}
        {/* O que vai acontecer, escrito por cima enquanto o dedo ainda está
            pousado. Sem isto, um arrasto a meio não diz o que está prestes a
            fazer — e o gesto aprende-se por engano em vez de por leitura. */}
        {rumo && (
          <span
            aria-hidden
            className={`pointer-events-none absolute top-3 rounded-lg px-3 py-1 text-sm font-medium text-white ${
              rumo === "incluir" ? "left-3 bg-[#4d6350]" : "right-3 bg-foreground/60"
            }`}
          >
            {rumo === "incluir" ? "Incluir" : "Saltar"}
          </span>
        )}
      </div>

      {/* ── OS BOTÕES ───────────────────────────────────────────────────────
          Fazem o mesmo que os gestos, e existem por três razões: um gesto que
          ninguém descobre é uma funcionalidade que não existe; quem navega por
          teclado não desliza nada; e há dias em que se está com uma mão
          ocupada. */}
      <div className="mt-3 flex items-center justify-center gap-3">
        <Button variant="secondary" onClick={() => decidir(false)}>
          ← Saltar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => aoVerGrande(indice)}>
          Ver em grande
        </Button>
        <Button
          variant="primary"
          onClick={() => decidir(true)}
          disabled={!podeEscolherMais && !(foto && escolhidas.has(foto.path))}
        >
          Incluir →
        </Button>
      </div>
      <p className="bo-text-muted mt-2 text-center text-[11px]">
        Desliza para a direita para incluir, para a esquerda para saltar, para cima para ver em
        grande.
      </p>
    </div>
  );
}

export default CuradoriaDeFotos;
