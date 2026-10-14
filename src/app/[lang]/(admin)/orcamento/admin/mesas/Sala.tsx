"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Guest } from "@/lib/orcamento/types";
import {
  alinhar,
  CADEIRA,
  cadeiras,
  alargarSala,
  caixaDaSala,
  SALA_MINIMA,
  unirCaixas,
  chaveDoLugar,
  dimensoes,
  iniciais,
  nomeCurto,
  nomeDoLugar,
  TECTOS,
  type MapaDeMesas,
  type Mesa,
  type Ocupante,
} from "@/lib/orcamento/mapa-de-mesas";
import { ESTADO, PRESSAO } from "../ui/movimento";
import {
  ICONE_DO_ELEMENTO,
  IconeDuplicar,
  IconeEncaixar,
  IconeLixo,
  IconeMais,
  IconeMenos,
  IconeRodar,
} from "./icones";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SALA — AS MESAS DESENHADAS, E OS GESTOS SOBRE ELAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * SVG, e não caixas posicionadas: a sala escala para a largura que houver (o
 * telemóvel e o computador vêem a MESMA sala, a escalas diferentes), as medidas
 * são as da sala (centímetros, ver `mapa-de-mesas.ts`) e o desenho fica nítido
 * a qualquer zoom.
 *
 * ── OS GESTOS, NUM SÍTIO SÓ ───────────────────────────────────────────────
 * Um ponteiro (rato ou dedo):
 *   · numa mesa ou num elemento → arrasta-o (depois de 3 px — antes disso é um
 *     toque, que o selecciona; dois toques seguidos numa mesa escrevem-lhe o
 *     nome). Ao arrastar, se o centro fica alinhado com o de outra peça,
 *     encaixa e aparece a guia (`alinhar`);
 *   · numa cadeira com alguém → leva a pessoa para outra cadeira (troca, se
 *     estiver ocupada); um toque numa cadeira é o «sentar aqui»;
 *   · no vazio → anda pela sala.
 * Dois dedos → pinça. No ecrã inteiro, a roda (ou dois dedos no trackpad) anda
 * pela sala, e com Ctrl aproxima — é assim que o trackpad manda a pinça.
 *
 * O arrasto não muda os dados enquanto o dedo anda: desenha a peça no sítio
 * novo e só no fim pede a mudança (`onMoverMesa`). Um arrasto é UM gesto — uma
 * gravação e um passo de «Anular» —, e não trinta.
 *
 * ── A BARRINHA JUNTO DA MESA (14/10) ──────────────────────────────────────
 * «Adicionar um lugar» era ir ao painel, ao lado, carregar num «+» longe da
 * mesa. Ela pediu-o NO desenho: com uma mesa escolhida, flutua por cima dela
 * «− 8 lugares +», Rodar, Duplicar e Apagar. A posição faz-se com contas (a
 * vista tem a forma do quadro, portanto um cm de sala vale `escala` píxeis),
 * e não com o DOM: não há medições a meio de um desenho.
 *
 * ── E SEM PONTEIRO ────────────────────────────────────────────────────────
 * As mesas são botões: Tab chega lá, as setas movem (Shift: 50 cm), Enter
 * selecciona, Delete apaga. As cadeiras da mesa seleccionada também se
 * alcançam pelo Tab. A vista «Lista» faz tudo o resto sem desenho nenhum.
 */

export type Seleccao = { tipo: "mesa" | "elemento"; id: string } | null;

/** Quanto do quadro está tapado por painéis que flutuam por cima (px). */
export interface Margens {
  topo: number;
  esquerda: number;
  direita: number;
  fundo: number;
}

const SEM_MARGENS: Margens = { topo: 0, esquerda: 0, direita: 0, fundo: 0 };

interface Props {
  mapa: MapaDeMesas;
  lista: readonly Guest[];
  seleccao: Seleccao;
  /** Alguém escolhido na lista de espera, à espera de um lugar — as cadeiras
   *  livres acendem-se. */
  aSentar: boolean;
  onSeleccionar: (s: Seleccao) => void;
  onMoverMesa: (id: string, x: number, y: number) => void;
  onMoverElemento: (id: string, x: number, y: number) => void;
  onApagar: (s: NonNullable<Seleccao>) => void;
  onTocarLugar: (chave: string) => void;
  onLevarPessoa: (de: string, para: string) => void;
  /** O ecrã de trabalho: a sala ocupa o quadro todo, sem moldura. */
  cheio?: boolean;
  /** O que os painéis do ecrã de trabalho tapam — o «Encaixar» deixa-os livres. */
  margens?: Margens;
  /** Um grupo a acender (o rato está por cima dele na lista de espera). */
  realce?: string | null;
  /** A cadeira por baixo de um convidado que vem a ser arrastado da lista. */
  lugarAceso?: string | null;
  /** A mesa por baixo dele, quando não está por cima de uma cadeira. */
  mesaAcesa?: string | null;
  onMudarLugares?: (mesaId: string, lugares: number) => void;
  onDuplicar?: (mesaId: string) => void;
  onRodar?: (mesaId: string) => void;
  onEditarNome?: (mesaId: string) => void;
}

interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

const LIMIAR_PX = 3;
/**
 * A escala do chão por omissão: 0,7 px por cm, ou seja uma sala de ~17 × 11 m
 * no computador, com uma redonda de 8 a ~110 px. Com uma mesa só, a mesa
 * enchia o ecrã (14/10: «coloca como predefinido já um espaço grande»). A
 * pinça e o «+» continuam a aproximar.
 */
const PX_POR_CM_MAX = 0.7;
/**
 * A sala vista de mais longe (14/10: «coloca a sala mais afastada do ecrã»):
 * ao abrir e ao «Encaixar» o chão ocupa 86% da parte livre, e à volta fica o
 * pontilhado — vê-se onde a sala acaba, como uma folha pousada na mesa.
 */
const FOLGA_DO_ENCAIXE = 0.86;
const DOIS_TOQUES_MS = 350;

/**
 * A vista que mostra `c` inteira dentro da parte livre do quadro (o quadro
 * menos o que os painéis tapam), com a forma do quadro — assim um cm de sala
 * vale o mesmo na horizontal e na vertical, e as contas da barrinha são uma
 * multiplicação. Sem tamanho medido (o primeiro desenho, o jsdom), é a caixa.
 */
export function encaixar(
  c: { x: number; y: number; largura: number; altura: number },
  quadro: { w: number; h: number },
  m: Margens = SEM_MARGENS,
): Caixa {
  const livreW = quadro.w - m.esquerda - m.direita;
  const livreH = quadro.h - m.topo - m.fundo;
  if (quadro.w <= 0 || quadro.h <= 0 || livreW <= 40 || livreH <= 40)
    return { x: c.x, y: c.y, w: c.largura, h: c.altura };
  const escala = Math.min(livreW / c.largura, livreH / c.altura);
  const w = quadro.w / escala;
  const h = quadro.h / escala;
  const x = c.x - m.esquerda / escala - (livreW / escala - c.largura) / 2;
  const y = c.y - m.topo / escala - (livreH / escala - c.altura) / 2;
  return { x, y, w, h };
}

export default function Sala({
  mapa,
  lista,
  seleccao,
  aSentar,
  onSeleccionar,
  onMoverMesa,
  onMoverElemento,
  onApagar,
  onTocarLugar,
  onLevarPessoa,
  cheio = false,
  margens = SEM_MARGENS,
  realce = null,
  lugarAceso = null,
  mesaAcesa = null,
  onMudarLugares,
  onDuplicar,
  onRodar,
  onEditarNome,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const quadroRef = useRef<HTMLDivElement | null>(null);
  const [quadro, setQuadro] = useState({ w: 0, h: 0 });
  /* ── A SALA FICA PARADA ─────────────────────────────────────────────────
     Era alargada à volta do CENTRO das mesas: pôr uma mesa ou largar uma
     arrastada mudava o centro, a sala ia atrás, a vista voltava a encaixar e
     a mesa ficava no mesmo sítio do ecrã (14/10, no site: «cada vez que eu
     adiciono uma mesa, a sala aumenta… não dá para arrastar»).

     Agora o chão é FIXO, ancorado no canto (0,0) onde as mesas novas nascem,
     do tamanho de uma sala grande para este ecrã — pelo quadro INTEIRO, para
     abrir um painel não mudar a sala —, unido ao que existe. Dentro dele,
     pôr e mover mesas não mexe em nada. */
  const caixa = useMemo(() => {
    const c = caixaDaSala(mapa);
    if (!cheio || quadro.w <= 40 || quadro.h <= 40) return c;
    // A margem à volta do canto: a caixa de cada mesa mede-se pelo lado
    // MAIOR (uma comprida de 10 é um quadrado de 3 m nessa conta), e as
    // primeiras nascem encostadas ao canto — sem margem, a primeira comprida
    // já empurrava a sala para cima.
    const margem = 300;
    const chao = {
      x: -margem,
      y: -margem,
      largura:
        Math.max(SALA_MINIMA.largura, (quadro.w * FOLGA_DO_ENCAIXE) / PX_POR_CM_MAX) + margem,
      altura: Math.max(SALA_MINIMA.altura, (quadro.h * FOLGA_DO_ENCAIXE) / PX_POR_CM_MAX) + margem,
    };
    return unirCaixas(chao, c);
  }, [mapa, cheio, quadro.w, quadro.h]);
  const encaixe = useMemo(
    () =>
      cheio && quadro.w > 0
        ? encaixar(
            alargarSala(caixa, caixa.largura / FOLGA_DO_ENCAIXE, caixa.altura / FOLGA_DO_ENCAIXE),
            quadro,
            margens,
          )
        : encaixar(caixa, { w: 0, h: 0 }, margens),
    [caixa, quadro, cheio, margens],
  );
  const [vista, setVista] = useState<Caixa>(encaixe);
  const vistaRef = useRef(vista);
  useEffect(() => {
    vistaRef.current = vista;
  }, [vista]);

  /** O quadro mudou de tamanho (rodar o telemóvel, abrir um painel). */
  useEffect(() => {
    const el = quadroRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setQuadro((q) =>
        Math.abs(q.w - width) < 1 && Math.abs(q.h - height) < 1 ? q : { w: width, h: height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * A vista acompanha a sala UMA vez quando: o quadro é medido pela primeira
   * vez, ou a sala cresceu (uma mesa nova ao fundo). Mexer numa mesa no meio
   * não volta a encaixar — ela estava a olhar para um sítio, e fica lá.
   */
  const encaixadaEm = useRef<{ caixa: typeof caixa; medido: boolean }>({
    caixa,
    medido: quadro.w > 0,
  });
  useEffect(() => {
    const antes = encaixadaEm.current;
    const mediuAgora = !antes.medido && quadro.w > 0;
    const cresceu =
      caixa.x < antes.caixa.x ||
      caixa.y < antes.caixa.y ||
      caixa.x + caixa.largura > antes.caixa.x + antes.caixa.largura ||
      caixa.y + caixa.altura > antes.caixa.y + antes.caixa.altura;
    encaixadaEm.current = { caixa, medido: quadro.w > 0 };
    if (mediuAgora || cresceu) setVista(encaixe);
  }, [caixa, encaixe, quadro.w]);

  /** O que o dedo está a levar, enquanto o leva. */
  const [noAr, setNoAr] = useState<
    | {
        tipo: "mesa" | "elemento";
        id: string;
        dx: number;
        dy: number;
        guiaX: number | null;
        guiaY: number | null;
      }
    | { tipo: "pessoa"; de: string; x: number; y: number }
    | null
  >(null);

  const gesto = useRef<{
    ponteiros: Map<number, { x: number; y: number }>;
    alvo: string | null;
    inicio: { x: number; y: number } | null;
    moveu: boolean;
    vistaInicial: Caixa;
    pinca: { d: number; vista: Caixa; meio: { x: number; y: number } } | null;
    ultimoToque: { alvo: string; quando: number } | null;
  }>({
    ponteiros: new Map(),
    alvo: null,
    inicio: null,
    moveu: false,
    vistaInicial: vista,
    pinca: null,
    ultimoToque: null,
  });

  /** Do ecrã para a sala: a conta que o próprio SVG sabe fazer. */
  const naSala = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM?.();
    if (!svg || !m) return { x: clientX, y: clientY };
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const r = p.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  }, []);

  /** Quantos cm de sala vale um píxel de ecrã agora. */
  const cmPorPx = useCallback(() => {
    const svg = svgRef.current;
    const v = vistaRef.current;
    const w = svg?.getBoundingClientRect().width || 1;
    const h = svg?.getBoundingClientRect().height || 1;
    return Math.max(v.w / w, v.h / h);
  }, []);

  const limiteDoZoom = Math.max(caixa.largura, caixa.altura) * 4;
  const zoom = useCallback(
    (factor: number, centro?: { x: number; y: number }) => {
      setVista((v) => {
        const c = centro ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
        const w = Math.min(limiteDoZoom, Math.max(200, v.w * factor));
        const h = (v.h / v.w) * w;
        return { x: c.x - ((c.x - v.x) / v.w) * w, y: c.y - ((c.y - v.y) / v.h) * h, w, h };
      });
    },
    [limiteDoZoom],
  );

  /**
   * A roda, ligada à mão e não pelo `onWheel` do React: o React liga-a como
   * passiva, e um `preventDefault` passivo não impede o browser de aproximar
   * a PÁGINA inteira quando ela faz a pinça no trackpad (que chega como
   * Ctrl + roda).
   */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function aoRodar(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoom(e.deltaY > 0 ? 1.08 : 1 / 1.08, naSala(e.clientX, e.clientY));
        return;
      }
      // Fora do ecrã inteiro a roda é da página: a sala não rouba o rolar.
      if (!cheio) return;
      e.preventDefault();
      const escala = cmPorPx();
      setVista((v) => ({ ...v, x: v.x + e.deltaX * escala, y: v.y + e.deltaY * escala }));
    }
    svg.addEventListener("wheel", aoRodar, { passive: false });
    return () => svg.removeEventListener("wheel", aoRodar);
  }, [cheio, zoom, naSala, cmPorPx]);

  function aoBaixar(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesto.current;
    g.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svgRef.current?.setPointerCapture?.(e.pointerId);
    if (g.ponteiros.size === 2) {
      const [a, b] = [...g.ponteiros.values()];
      g.pinca = {
        d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        vista,
        meio: naSala((a.x + b.x) / 2, (a.y + b.y) / 2),
      };
      g.alvo = null;
      setNoAr(null);
      return;
    }
    const alvo = (e.target as Element).closest?.("[data-alvo]")?.getAttribute("data-alvo") ?? null;
    g.alvo = alvo;
    g.inicio = { x: e.clientX, y: e.clientY };
    g.moveu = false;
    g.vistaInicial = vista;
  }

  function aoMover(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesto.current;
    if (!g.ponteiros.has(e.pointerId)) return;
    g.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pinca && g.ponteiros.size >= 2) {
      const [a, b] = [...g.ponteiros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const f = g.pinca.d / d;
      const v0 = g.pinca.vista;
      const w = Math.min(limiteDoZoom, Math.max(200, v0.w * f));
      const h = (v0.h / v0.w) * w;
      const c = g.pinca.meio;
      setVista({ x: c.x - ((c.x - v0.x) / v0.w) * w, y: c.y - ((c.y - v0.y) / v0.h) * h, w, h });
      return;
    }
    if (!g.inicio) return;
    const dxPx = e.clientX - g.inicio.x;
    const dyPx = e.clientY - g.inicio.y;
    if (!g.moveu && Math.hypot(dxPx, dyPx) < LIMIAR_PX) return;
    g.moveu = true;
    const escala = cmPorPx();
    const [tipo, id] = (g.alvo ?? "").split("|");
    if (tipo === "mesa" || tipo === "elemento") {
      const peca =
        tipo === "mesa"
          ? mapa.mesas.find((m) => m.id === id)
          : mapa.elementos.find((x) => x.id === id);
      if (!peca) return;
      const a = alinhar(mapa, { tipo, id }, peca.x + dxPx * escala, peca.y + dyPx * escala);
      setNoAr({ tipo, id, dx: a.x - peca.x, dy: a.y - peca.y, guiaX: a.guiaX, guiaY: a.guiaY });
    } else if (tipo === "lugar" && mapa.lugares[id]) {
      const p = naSala(e.clientX, e.clientY);
      setNoAr({ tipo: "pessoa", de: id, x: p.x, y: p.y });
    } else {
      const v = g.vistaInicial;
      setVista({ ...v, x: v.x - dxPx * escala, y: v.y - dyPx * escala });
    }
  }

  function aoLevantar(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesto.current;
    g.ponteiros.delete(e.pointerId);
    if (g.pinca) {
      if (g.ponteiros.size < 2) g.pinca = null;
      g.inicio = null;
      return;
    }
    const [tipo, id] = (g.alvo ?? "").split("|");
    const levado = noAr;
    setNoAr(null);
    g.inicio = null;
    if (!g.moveu) {
      // Dois toques seguidos na MESMA mesa: escrever-lhe o nome.
      const agora = Date.now();
      const doisToques =
        tipo === "mesa" &&
        g.ultimoToque?.alvo === g.alvo &&
        agora - g.ultimoToque.quando < DOIS_TOQUES_MS;
      g.ultimoToque = g.alvo ? { alvo: g.alvo, quando: agora } : null;
      if (doisToques && onEditarNome) {
        onEditarNome(id);
        return;
      }
      if (tipo === "mesa" || tipo === "elemento") onSeleccionar({ tipo, id });
      else if (tipo === "lugar") onTocarLugar(id);
      else onSeleccionar(null);
      return;
    }
    if (levado?.tipo === "mesa") {
      const m = mapa.mesas.find((x) => x.id === levado.id);
      if (m) onMoverMesa(m.id, m.x + levado.dx, m.y + levado.dy);
    } else if (levado?.tipo === "elemento") {
      const el = mapa.elementos.find((x) => x.id === levado.id);
      if (el) onMoverElemento(el.id, el.x + levado.dx, el.y + levado.dy);
    } else if (levado?.tipo === "pessoa") {
      const sob = document
        .elementFromPoint?.(e.clientX, e.clientY)
        ?.closest?.("[data-alvo^='lugar|']")
        ?.getAttribute("data-alvo");
      if (sob) onLevarPessoa(levado.de, sob.split("|")[1]);
    }
  }

  function teclaNaMesa(
    e: React.KeyboardEvent,
    tipo: "mesa" | "elemento",
    id: string,
    x: number,
    y: number,
  ) {
    const passo = e.shiftKey ? 50 : 10;
    const mover = tipo === "mesa" ? onMoverMesa : onMoverElemento;
    const setas: Record<string, [number, number]> = {
      ArrowUp: [0, -passo],
      ArrowDown: [0, passo],
      ArrowLeft: [-passo, 0],
      ArrowRight: [passo, 0],
    };
    if (setas[e.key]) {
      e.preventDefault();
      mover(id, x + setas[e.key][0], y + setas[e.key][1]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSeleccionar({ tipo, id });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onApagar({ tipo, id });
    }
  }

  const deslocado = (tipo: "mesa" | "elemento", id: string) =>
    noAr && noAr.tipo === tipo && noAr.id === id ? { dx: noAr.dx, dy: noAr.dy } : { dx: 0, dy: 0 };

  /**
   * Píxeis de ecrã por cm de sala. A vista tem a forma do quadro (ver
   * `encaixar`), portanto é uma divisão; sem quadro medido, 0 — e o que
   * depende disto (os nomes de perto, a posição da barrinha) fica de fora.
   */
  const escala = quadro.w > 0 ? quadro.w / vista.w : 0;
  /** De perto: uma cadeira com mais de 34 px já tem espaço para um nome por baixo. */
  const dePerto = escala * CADEIRA >= 34;

  const mesaDaBarrinha =
    seleccao?.tipo === "mesa" && !noAr ? mapa.mesas.find((m) => m.id === seleccao.id) : undefined;

  /**
   * Onde flutua a barrinha: por cima da mesa, dentro da parte livre do quadro —
   * não se esconde por baixo da lista de espera nem do painel (MEDIDO a 1440:
   * o «−» ficava atrás da lista com a Mesa 1 encostada à esquerda). Com a mesa
   * fora do ecrã (depois de aproximar), não aparece: encostada à borda, ficava
   * por cima de OUTRA mesa a dizer o nome desta.
   */
  const posicaoDaBarrinha = ((): { x: number; y: number } | null | "fora" => {
    if (!mesaDaBarrinha || escala <= 0) return null;
    const d = dimensoes(mesaDaBarrinha);
    const metade = Math.max(d.largura, d.altura) / 2 + CADEIRA;
    const cx = (mesaDaBarrinha.x - vista.x) * escala;
    const cy = (mesaDaBarrinha.y - vista.y) * escala;
    if (
      cx < margens.esquerda ||
      cx > quadro.w - margens.direita ||
      cy < margens.topo ||
      cy > quadro.h - margens.fundo
    )
      return "fora";
    const meia = 160;
    return {
      x: Math.min(quadro.w - margens.direita - meia, Math.max(margens.esquerda + meia, cx)),
      y: Math.max(margens.topo + 56, cy - metade * escala),
    };
  })();

  return (
    <div ref={quadroRef} className={cheio ? "absolute inset-0" : "relative"}>
      <svg
        ref={svgRef}
        role="group"
        aria-label="Sala"
        viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`}
        preserveAspectRatio="xMidYMid meet"
        // Fora do ecrã inteiro, a altura segue a forma da sala (largura a
        // mandar), entre um mínimo que ainda se usa com o dedo e um máximo
        // que deixa ver o resto.
        style={cheio ? undefined : { aspectRatio: `${encaixe.w} / ${encaixe.h}` }}
        className={
          cheio
            ? "block h-full w-full touch-none select-none"
            : "block max-h-[62vh] min-h-[18rem] w-full touch-none select-none rounded-[var(--bo-raio-cartao)] border border-[var(--bo-hairline)] bg-[var(--bo-surface-sunken)]"
        }
        onPointerDown={aoBaixar}
        onPointerMove={aoMover}
        onPointerUp={aoLevantar}
        onPointerCancel={aoLevantar}
      >
        <defs>
          <pattern id="pontos-da-sala" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1.6" fill="var(--bo-tinta-13)" />
          </pattern>
        </defs>
        <rect
          x={vista.x - vista.w}
          y={vista.y - vista.h}
          width={vista.w * 3}
          height={vista.h * 3}
          fill="url(#pontos-da-sala)"
        />

        {/* O CHÃO: a área onde o mapa vive, como uma folha clara pousada. A
            sombra é uma cópia descaída da folha — um `filter` não sabe ler os
            tokens de sombra da casa, que são de `box-shadow`. */}
        <rect
          x={caixa.x}
          y={caixa.y + 8}
          width={caixa.largura}
          height={caixa.altura}
          rx={18}
          fill="var(--bo-tinta-6)"
        />
        <rect
          x={caixa.x}
          y={caixa.y}
          width={caixa.largura}
          height={caixa.altura}
          rx={18}
          fill="var(--bo-surface)"
          stroke="var(--bo-hairline)"
          strokeWidth={1.5}
        />

        {/* AS GUIAS de alinhamento, enquanto se arrasta. */}
        {noAr && noAr.tipo !== "pessoa" && (
          <g className="pointer-events-none" aria-hidden="true">
            {noAr.guiaX !== null && (
              <line
                x1={noAr.guiaX}
                x2={noAr.guiaX}
                y1={vista.y - vista.h}
                y2={vista.y + vista.h * 2}
                stroke="var(--bo-accent)"
                strokeWidth={1.5}
                strokeDasharray="8 6"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {noAr.guiaY !== null && (
              <line
                y1={noAr.guiaY}
                y2={noAr.guiaY}
                x1={vista.x - vista.w}
                x2={vista.x + vista.w * 2}
                stroke="var(--bo-accent)"
                strokeWidth={1.5}
                strokeDasharray="8 6"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        )}

        {mapa.elementos.map((el) => {
          const { dx, dy } = deslocado("elemento", el.id);
          const escolhido = seleccao?.tipo === "elemento" && seleccao.id === el.id;
          const Icone = ICONE_DO_ELEMENTO[el.tipo] ?? ICONE_DO_ELEMENTO.outro;
          const lado = Math.min(44, el.altura * 0.42, el.largura * 0.3);
          return (
            <g
              key={el.id}
              data-alvo={`elemento|${el.id}`}
              role="button"
              tabIndex={0}
              aria-label={`${el.nome}. Setas para mover, Delete para apagar.`}
              aria-pressed={escolhido}
              transform={`translate(${el.x + dx} ${el.y + dy})`}
              className="cursor-grab outline-none focus-visible:[&>rect:nth-of-type(2)]:stroke-[var(--bo-accent)]"
              onKeyDown={(e) => teclaNaMesa(e, "elemento", el.id, el.x, el.y)}
            >
              {escolhido && (
                <rect
                  x={-el.largura / 2 - 8}
                  y={-el.altura / 2 - 8}
                  width={el.largura + 16}
                  height={el.altura + 16}
                  rx={16}
                  fill="none"
                  stroke="var(--bo-accent-ring)"
                  strokeWidth={10}
                />
              )}
              <rect
                x={-el.largura / 2}
                y={-el.altura / 2}
                width={el.largura}
                height={el.altura}
                rx={10}
                fill={
                  el.tipo === "noivos" ? "var(--bo-accent-lavagem)" : "var(--bo-surface-sunken)"
                }
                stroke={escolhido ? "var(--bo-accent)" : "var(--bo-hairline-strong)"}
                strokeWidth={escolhido ? 3 : 1.5}
                strokeDasharray={el.tipo === "pista" ? "12 8" : undefined}
              />
              <g color="var(--bo-text-muted)" className="pointer-events-none">
                <svg
                  x={-lado / 2}
                  y={-lado / 2 - lado * 0.45}
                  width={lado}
                  height={lado}
                  viewBox="0 0 24 24"
                  overflow="visible"
                >
                  <Icone tamanho={24} />
                </svg>
              </g>
              <text
                y={lado * 0.55}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(14, Math.min(24, el.altura / 4))}
                fill="var(--bo-text-muted)"
                className="pointer-events-none uppercase tracking-wide"
              >
                {el.nome}
              </text>
            </g>
          );
        })}

        {mapa.mesas.map((mesa) => (
          <DesenhoDaMesa
            key={mesa.id}
            mesa={mesa}
            mapa={mapa}
            lista={lista}
            deslocamento={deslocado("mesa", mesa.id)}
            escolhida={seleccao?.tipo === "mesa" && seleccao.id === mesa.id}
            aSentar={aSentar}
            levada={noAr?.tipo === "pessoa" ? noAr.de : null}
            realce={realce}
            lugarAceso={lugarAceso}
            acesa={mesaAcesa === mesa.id}
            nomes={dePerto}
            letra={escala > 0 ? 11 / escala : 11}
            onTecla={(e) => teclaNaMesa(e, "mesa", mesa.id, mesa.x, mesa.y)}
            onTocarLugar={onTocarLugar}
          />
        ))}

        {noAr?.tipo === "pessoa" && mapa.lugares[noAr.de] && (
          <g
            transform={`translate(${noAr.x} ${noAr.y})`}
            className="pointer-events-none"
            opacity={0.85}
          >
            <circle r={CADEIRA / 2 + 4} fill="var(--bo-accent)" />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={16}
              fill="var(--bo-sobre-acento)"
              fontWeight={600}
            >
              {iniciais(nomeDoLugar(mapa.lugares[noAr.de], lista))}
            </text>
          </g>
        )}
      </svg>

      {mesaDaBarrinha && onMudarLugares && posicaoDaBarrinha !== "fora" && (
        <BarrinhaDaMesa
          mesa={mesaDaBarrinha}
          posicao={posicaoDaBarrinha}
          onMudarLugares={onMudarLugares}
          onDuplicar={onDuplicar}
          onRodar={onRodar}
          onApagar={() => onApagar({ tipo: "mesa", id: mesaDaBarrinha.id })}
        />
      )}

      <div
        className={cheio ? "absolute flex flex-col gap-1.5" : "absolute right-2 top-2 flex gap-1"}
        style={cheio ? { right: margens.direita + 16, bottom: margens.fundo + 16 } : undefined}
      >
        {[
          { rotulo: "Aproximar", icone: <IconeMais />, f: () => zoom(1 / 1.25) },
          { rotulo: "Afastar", icone: <IconeMenos />, f: () => zoom(1.25) },
          { rotulo: "Encaixar a sala", icone: <IconeEncaixar />, f: () => setVista(encaixe) },
        ].map((b) => (
          <button
            key={b.rotulo}
            type="button"
            aria-label={b.rotulo}
            title={b.rotulo}
            onClick={b.f}
            className={`alvo-toque flex h-10 w-10 items-center justify-center rounded-full border border-[var(--bo-hairline)] bg-[var(--bo-surface)] text-[var(--bo-text)] shadow-[var(--bo-sombra-erguida)] hover:bg-[var(--bo-surface-hover)] ${ESTADO} ${PRESSAO}`}
          >
            {b.icone}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A barrinha que flutua por cima da mesa escolhida. Opaca e não de vidro: o
 * vidro do ecrã é a barra de cima, e vidro sobre vidro é a papa cinzenta que o
 * `LIQUID-GLASS.md` proíbe.
 */
function BarrinhaDaMesa({
  mesa,
  posicao,
  onMudarLugares,
  onDuplicar,
  onRodar,
  onApagar,
}: {
  mesa: Mesa;
  posicao: { x: number; y: number } | null;
  onMudarLugares: (mesaId: string, lugares: number) => void;
  onDuplicar?: (mesaId: string) => void;
  onRodar?: (mesaId: string) => void;
  onApagar: () => void;
}) {
  const botao = `alvo-toque flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-[var(--bo-text)] hover:bg-[var(--bo-tinta-6)] disabled:opacity-40 ${ESTADO} ${PRESSAO}`;
  return (
    <div
      role="toolbar"
      aria-label={`${mesa.nome}: lugares e acções`}
      className="absolute z-10 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-full border border-[var(--bo-hairline)] bg-[var(--bo-elevado)] p-1 shadow-[var(--bo-sombra-suspensa)]"
      style={posicao ? { left: posicao.x, top: posicao.y } : { left: "50%", top: 64 }}
    >
      <button
        type="button"
        className={botao}
        aria-label={`Tirar uma cadeira da ${mesa.nome}`}
        title="Tirar uma cadeira"
        disabled={mesa.lugares <= 1}
        onClick={() => onMudarLugares(mesa.id, mesa.lugares - 1)}
      >
        <IconeMenos />
      </button>
      <span
        className="min-w-[5.5rem] text-center text-sm tabular-nums text-[var(--bo-text)]"
        aria-live="polite"
      >
        {mesa.lugares} {mesa.lugares === 1 ? "lugar" : "lugares"}
      </span>
      <button
        type="button"
        className={botao}
        aria-label={`Acrescentar uma cadeira à ${mesa.nome}`}
        title="Acrescentar uma cadeira"
        disabled={mesa.lugares >= TECTOS.lugaresPorMesa}
        onClick={() => onMudarLugares(mesa.id, mesa.lugares + 1)}
      >
        <IconeMais />
      </button>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--bo-hairline)]" />
      {mesa.forma !== "redonda" && onRodar && (
        <button
          type="button"
          className={botao}
          aria-label={`Rodar a ${mesa.nome}`}
          title="Rodar"
          onClick={() => onRodar(mesa.id)}
        >
          <IconeRodar />
        </button>
      )}
      {onDuplicar && (
        <button
          type="button"
          className={botao}
          aria-label={`Duplicar a ${mesa.nome}`}
          title="Duplicar (⌘D)"
          onClick={() => onDuplicar(mesa.id)}
        >
          <IconeDuplicar />
        </button>
      )}
      <button
        type="button"
        className={`${botao} text-[var(--bo-perigo)]`}
        aria-label={`Apagar a ${mesa.nome}`}
        title="Apagar"
        onClick={onApagar}
      >
        <IconeLixo />
      </button>
    </div>
  );
}

function DesenhoDaMesa({
  mesa,
  mapa,
  lista,
  deslocamento,
  escolhida,
  aSentar,
  levada,
  realce,
  lugarAceso,
  acesa,
  nomes,
  letra,
  onTecla,
  onTocarLugar,
}: {
  mesa: Mesa;
  mapa: MapaDeMesas;
  lista: readonly Guest[];
  deslocamento: { dx: number; dy: number };
  escolhida: boolean;
  aSentar: boolean;
  levada: string | null;
  realce: string | null;
  lugarAceso: string | null;
  acesa: boolean;
  /** De perto: escrever o nome curto debaixo de cada cadeira ocupada. */
  nomes: boolean;
  /** O tamanho da letra dos nomes, em cm de sala (para dar ~11 px no ecrã). */
  letra: number;
  onTecla: (e: React.KeyboardEvent) => void;
  onTocarLugar: (chave: string) => void;
}) {
  const { largura, altura } = dimensoes(mesa);
  const cs = cadeiras(mesa);
  const ocupados = cs.filter((c) => mapa.lugares[chaveDoLugar(mesa.id, c.lugar)]).length;
  const tinta = escolhida || acesa ? "var(--bo-accent)" : "var(--bo-hairline-strong)";
  const cheia = ocupados === mesa.lugares;
  const rodada = mesa.forma === "comprida" && mesa.rodada;
  const tamanhoDoNome = Math.max(16, Math.min(24, Math.min(largura, altura) / 4));
  const forma = (props: React.SVGProps<SVGCircleElement & SVGRectElement>, folga = 0) =>
    mesa.forma === "redonda" ? (
      <circle cx={mesa.x} cy={mesa.y} r={largura / 2 + folga} {...props} />
    ) : (
      <rect
        x={mesa.x - largura / 2 - folga}
        y={mesa.y - altura / 2 - folga}
        width={largura + folga * 2}
        height={altura + folga * 2}
        rx={8 + folga}
        {...props}
      />
    );
  return (
    <g transform={`translate(${deslocamento.dx} ${deslocamento.dy})`}>
      {(escolhida || acesa) &&
        forma({ fill: "none", stroke: "var(--bo-accent-ring)", strokeWidth: 12 }, CADEIRA + 8)}
      <g
        data-alvo={`mesa|${mesa.id}`}
        role="button"
        tabIndex={0}
        aria-pressed={escolhida}
        aria-label={`${mesa.nome}, ${mesa.forma}, ${mesa.lugares} lugares, ${ocupados} ocupados. Setas para mover, Delete para apagar.`}
        className="cursor-grab outline-none focus-visible:[&>*:nth-child(2)]:stroke-[var(--bo-accent)]"
        onKeyDown={onTecla}
      >
        {/* A sombra: a mesma forma, descaída. */}
        <g transform="translate(0 6)">{forma({ fill: "var(--bo-tinta-8)" })}</g>
        {forma({ fill: "var(--bo-elevado)", stroke: tinta, strokeWidth: escolhida ? 3 : 1.5 })}
        <text
          x={mesa.x}
          y={mesa.y}
          textAnchor="middle"
          className="pointer-events-none"
          transform={rodada ? `rotate(-90 ${mesa.x} ${mesa.y})` : undefined}
        >
          <tspan
            x={mesa.x}
            dy={-tamanhoDoNome * 0.15}
            fontSize={tamanhoDoNome}
            fill="var(--bo-text)"
            fontWeight={500}
          >
            {mesa.nome}
          </tspan>
          <tspan
            x={mesa.x}
            dy={tamanhoDoNome * 0.95}
            fontSize={tamanhoDoNome * 0.62}
            fill={cheia ? "var(--bo-accent)" : "var(--bo-text-muted)"}
            className="tabular-nums"
          >
            {ocupados}/{mesa.lugares}
          </tspan>
        </text>
      </g>
      {cs.map((c) => {
        const chave = chaveDoLugar(mesa.id, c.lugar);
        const oc: Ocupante | undefined = mapa.lugares[chave];
        const nome = oc ? nomeDoLugar(oc, lista) : null;
        const livreAcesa = !oc && aSentar;
        const sobre = lugarAceso === chave;
        const doGrupo = !!oc && realce === oc.convidadoId;
        // O nome vai para FORA da mesa: a direcção é a do centro para a cadeira.
        const ang = Math.atan2(c.y - mesa.y, c.x - mesa.x);
        const fora = CADEIRA / 2 + letra * 0.9;
        return (
          <g
            key={chave}
            data-alvo={`lugar|${chave}`}
            role="button"
            tabIndex={escolhida ? 0 : -1}
            aria-label={`Lugar ${c.lugar + 1} da ${mesa.nome}: ${nome ?? "livre"}`}
            className={oc ? "cursor-grab" : "cursor-pointer"}
            opacity={levada === chave ? 0.35 : 1}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTocarLugar(chave);
              }
            }}
          >
            <title>{nome ?? "Lugar livre"}</title>
            {(sobre || doGrupo) && (
              <circle
                cx={c.x}
                cy={c.y}
                r={CADEIRA / 2 + 7}
                fill="none"
                stroke="var(--bo-accent-ring)"
                strokeWidth={8}
              />
            )}
            <circle
              cx={c.x}
              cy={c.y}
              r={CADEIRA / 2}
              fill={
                oc
                  ? "var(--bo-accent-lavagem)"
                  : sobre
                    ? "var(--bo-accent-lavagem)"
                    : "var(--bo-surface)"
              }
              stroke={
                sobre || livreAcesa || doGrupo
                  ? "var(--bo-accent)"
                  : oc
                    ? "var(--bo-accent)"
                    : "var(--bo-hairline-strong)"
              }
              strokeWidth={sobre || livreAcesa || doGrupo ? 3 : 1.5}
              strokeDasharray={oc || sobre ? undefined : "5 4"}
            />
            {nome && (
              <text
                x={c.x}
                y={c.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={15}
                fontWeight={600}
                fill="var(--bo-accent)"
                className="pointer-events-none"
              >
                {iniciais(nome)}
              </text>
            )}
            {nome && nomes && (
              <text
                x={c.x + Math.cos(ang) * fora}
                y={c.y + Math.sin(ang) * fora}
                textAnchor={
                  Math.abs(Math.cos(ang)) < 0.35 ? "middle" : Math.cos(ang) > 0 ? "start" : "end"
                }
                dominantBaseline="central"
                fontSize={letra}
                fill="var(--bo-text-muted)"
                className="pointer-events-none"
              >
                {nomeCurto(nome)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
