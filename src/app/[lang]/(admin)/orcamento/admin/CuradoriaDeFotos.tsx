"use client";

import { useEffect, useRef, useState } from "react";
import type { ThemeImage } from "@/lib/theme-types";
import { assentar } from "@/lib/motion/mola";
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FOTO QUE VOLTA — e a diferença entre voltar e saltar
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que estava: `largar` fazia `setArrastoX(0)` e o cartão não tinha transição
 * nenhuma por baixo (o `transform` é escrito no `style`, e o `className` ao
 * lado não trazia um único `transition-*`). Ou seja: um arrasto que não chegou
 * ao limiar acabava com a fotografia a saltar para o sítio num fotograma.
 *
 * E é a leitura errada. Uma fotografia que SALTA de volta parece um erro — o
 * ecrã piscou, alguma coisa se desfez. Uma que REGRESSA é uma recusa educada:
 * ouvi-te, não chegou. É a mesma informação com o sinal trocado, e custa
 * quatrocentos milissegundos.
 *
 * ── PORQUE É QUE É A MOLA E NÃO UMA CURVA ─────────────────────────────────
 *
 * A casa tem uma mola escrita (`lib/motion/mola.ts`) e, até aqui, nunca usada:
 * o token `MOLA` do `lib/motion/tokens.ts` existia, os números estavam medidos,
 * havia teste — e não havia um único sítio no produto a chamá-la. Este é o
 * sítio, e está escrito no próprio ficheiro dela: «para o que se larga a meio
 * de um gesto», «uma fotografia largada a meio de um arrasto», «num painel
 * onde se arrastam quarenta fotografias».
 *
 * A razão é a que ela dá: uma `cubic-bezier` descreve um percurso com princípio
 * e fim conhecidos ANTES de começar. Uma foto largada a meio não tem nenhum dos
 * dois — vem com uma velocidade que ninguém escolheu. Com uma curva de duração
 * fixa, um empurrão de 8 px e um arrasto de 200 px demoram o mesmo tempo a
 * voltar, e o pequeno lê-se como preguiça. Com a mola, o tempo acompanha a
 * distância sozinho (medido no `tokens.ts`: 8 px em 233 ms, 40 px em 350 ms,
 * 200 px em 450 ms) e a velocidade do dedo continua a viagem em vez de a
 * cortar.
 *
 * Aqui a mola tem as duas coisas de que precisa e o quadro do Kanban não tinha:
 * um deslocamento a sério (`arrastoX`, que já existia) e uma velocidade a sério
 * (a que se mede entre os dois últimos eventos do dedo).
 *
 * ── UM SÓ A ESCREVER NA FOTO ──────────────────────────────────────────────
 *
 * A mola pinta através do MESMO `arrastoX` que o dedo usa, e não directamente
 * no `style` do elemento. É de propósito: dois escritores no mesmo `transform`
 * é o defeito que o `assentar` avisa em letra grande — a peça treme. E não
 * custa mais do que já custava, porque arrastar já era um `setArrastoX` por
 * evento do dedo.
 *
 * ── E O QUE **NÃO** VOLTA COM MOLA ────────────────────────────────────────
 *
 * Uma decisão tomada (incluir, saltar) não volta: a foto sai e entra outra. Aí
 * o `arrastoX` vai a zero de uma vez, como sempre foi — a mola é para o gesto
 * que NÃO pegou, e mais nada. É essa a diferença que se quer ver.
 */

/**
 * Abaixo disto não há regresso nenhum para animar: `assentar` já se considera
 * em repouso (meio píxel, oito píxeis por segundo) e devolveria um
 * cancelamento sem nunca pintar — o que deixaria a foto meio píxel ao lado com
 * um `transform` pendurado no elemento para sempre.
 */
const IMOVEL_PX = 1;
const IMOVEL_PX_S = 8;

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
  /** Cancela a mola que ainda esteja a assentar a foto. Ver o bloco lá em cima. */
  const recuo = useRef<(() => void) | null>(null);
  /** A última amostra do dedo — é dela que sai a velocidade de largada. */
  const amostra = useRef<{ x: number; t: number } | null>(null);
  /** A velocidade com que o dedo ia, em píxeis por segundo. */
  const velocidade = useRef(0);

  const foto = images[indice] ?? null;
  const acabou = indice >= images.length;

  /**
   * O foco entra no cartão ao montar, e é isso que faz as setas do teclado
   * funcionarem sem ninguém ter de carregar em nada primeiro.
   */
  useEffect(() => {
    cartao.current?.focus();
  }, []);

  /**
   * A mola morre com o componente. Sem isto, sair da curadoria a meio de um
   * regresso deixava um `requestAnimationFrame` a chamar `setArrastoX` num
   * componente que já não existe.
   */
  useEffect(() => () => recuo.current?.(), []);

  /** Pára a mola, se estiver a assentar alguma coisa. */
  function pararMola() {
    recuo.current?.();
    recuo.current = null;
  }

  /**
   * A foto REGRESSA ao sítio, com a mola da casa e com a velocidade que o dedo
   * trazia.
   */
  function voltarAoSitio(de: number) {
    const v = velocidade.current;
    velocidade.current = 0;
    if (Math.abs(de) < IMOVEL_PX && Math.abs(v) < IMOVEL_PX_S) {
      setArrastoX(0);
      return;
    }
    // Quem pediu para não animar não leva mola: a foto vai directa ao sítio.
    // A regra da casa é `prefers-reduced-motion`, e aqui não há CSS onde a pôr
    // — isto é um ciclo de `requestAnimationFrame`, e desliga-se em JS.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setArrastoX(0);
      return;
    }
    recuo.current = assentar({ x: de, y: 0 }, (p) => setArrastoX(p.x), { x: v, y: 0 });
  }

  function decidir(incluir: boolean) {
    if (!foto) return;
    // Ao TETO, incluir não faz nada — mas saltar continua a fazer, senão a
    // curadoria ficava presa na mesma foto sem dizer porquê.
    if (incluir && !podeEscolherMais && !escolhidas.has(foto.path)) return;
    // Uma decisão não é um regresso: a foto sai e entra outra. Se ainda houver
    // mola a correr, ela escreveria o `arrastoX` da foto anterior por cima da
    // que acabou de chegar.
    pararMola();
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
    pararMola();
    if (ultima.incluida) aoDecidir(ultima.path, false);
    setHistorico((h) => h.slice(0, -1));
    setIndice((i) => Math.max(0, i - 1));
    setArrastoX(0);
  }

  // ── Os dedos ──────────────────────────────────────────────────────────────

  function pousar(e: React.PointerEvent) {
    // O dedo novo ganha à mola velha. Sem isto, pousar em cima de uma foto que
    // ainda está a assentar punha os dois a escrever o mesmo `arrastoX` — que
    // é a tremura que o `assentar` avisa em letra grande.
    pararMola();
    inicio.current = { x: e.clientX, y: e.clientY };
    amostra.current = { x: e.clientX, t: e.timeStamp };
    velocidade.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function mover(e: React.PointerEvent) {
    if (!inicio.current) return;
    const anterior = amostra.current;
    if (anterior) {
      // Entre as duas ÚLTIMAS amostras, e não sobre o gesto todo: o que
      // interessa é a velocidade com que o dedo ia no instante de largar.
      const dx = e.clientX - anterior.x;
      const dt = e.timeStamp - anterior.t;
      // Um dedo que NÃO ANDOU não vai a velocidade nenhuma, e isso sabe-se sem
      // relógio nenhum. Tem de estar antes da divisão por duas razões: um `dt`
      // de zero (duas amostras no mesmo milissegundo, que acontece) daria
      // infinito e a mola divergia; e sem este ramo, o gesto que hesita e
      // levanta parado ficava com a velocidade de quando ainda andava — a foto
      // era atirada por um empurrão que já tinha acabado.
      if (dx === 0) velocidade.current = 0;
      else if (dt > 0) velocidade.current = (dx / dt) * 1000;
    }
    amostra.current = { x: e.clientX, t: e.timeStamp };
    setArrastoX(e.clientX - inicio.current.x);
  }

  function largar(e: React.PointerEvent) {
    const partida = inicio.current;
    inicio.current = null;
    amostra.current = null;
    if (!partida) return;
    const dx = e.clientX - partida.x;
    const dy = e.clientY - partida.y;
    // Para CIMA é ver em grande, e ganha ao horizontal quando é mais vertical
    // do que lateral — senão um arrasto na diagonal decidia por acidente.
    if (-dy > LIMIAR && Math.abs(dy) > Math.abs(dx)) {
      setArrastoX(0);
      velocidade.current = 0;
      aoVerGrande(indice);
      return;
    }
    if (dx > LIMIAR) {
      decidir(true);
      return;
    }
    if (dx < -LIMIAR) {
      decidir(false);
      return;
    }
    // Não chegou ao limiar: a foto não vai a lado nenhum — volta.
    voltarAoSitio(dx);
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
        <p className="font-display text-lg text-[var(--bo-text)]">
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
      {/* `justify-between` não quebra: empurra cada um para o seu extremo e,
          quando deixam de caber, o de baixo sai da margem em vez de descer.
          Medido a 320 px (o iPhone SE de origem): «12 de 37» pede 56 px, os dois
          botões pedem 184 com o intervalo, e sobram 280 — falta 12. `flex-wrap`
          sem ponto de corte nenhum: a fila continua uma linha em todos os
          telemóveis onde cabe, e desce sozinha onde não cabe. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="bo-text-muted text-xs tabular-nums" aria-live="polite">
          {indice + 1} de {images.length}
        </p>
        <div className="flex flex-wrap items-center gap-1">
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
          // Um gesto cancelado (o browser tomou conta do dedo, a folha rolou)
          // não é uma decisão — é o mesmo regresso do arrasto que não pegou.
          inicio.current = null;
          amostra.current = null;
          voltarAoSitio(arrastoX);
        }}
        style={{
          transform: arrastoX ? `translateX(${arrastoX}px) rotate(${inclinacao}deg)` : undefined,
        }}
        className={`relative mt-2 flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden rounded-2xl border-2 bg-[var(--bo-tinta-6)] focus-visible:outline-none ${
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
      {/* Mesma razão do cabeçalho: os três pedem 310 px com os intervalos e a
          320 px só há 280. Sem `flex-wrap`, «Incluir →» — o botão que decide —
          era o que saía da margem. */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
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
