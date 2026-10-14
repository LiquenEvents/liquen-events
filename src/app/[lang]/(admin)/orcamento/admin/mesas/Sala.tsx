"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Guest } from "@/lib/orcamento/types";
import {
  CADEIRA,
  cadeiras,
  caixaDaSala,
  chaveDoLugar,
  dimensoes,
  iniciais,
  nomeDoLugar,
  type MapaDeMesas,
  type Mesa,
  type Ocupante,
} from "@/lib/orcamento/mapa-de-mesas";
import { ESTADO, PRESSAO } from "../ui/movimento";

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
 *     toque, que o selecciona);
 *   · numa cadeira com alguém → leva a pessoa para outra cadeira (troca, se
 *     estiver ocupada); um toque numa cadeira é o «sentar aqui»;
 *   · no vazio → anda pela sala.
 * Dois dedos → pinça, que aproxima e afasta. No rato, Ctrl + roda faz o mesmo,
 * e os botões «+», «−» e «Encaixar» estão sempre lá.
 *
 * O arrasto não muda os dados enquanto o dedo anda: desenha a peça no sítio
 * novo e só no fim pede a mudança (`onMoverMesa`). Um arrasto é UM gesto — uma
 * gravação e um «Anular» —, e não trinta.
 *
 * ── E SEM PONTEIRO ────────────────────────────────────────────────────────
 * As mesas são botões: Tab chega lá, as setas movem (Shift: 50 cm), Enter
 * selecciona, Delete apaga. As cadeiras da mesa seleccionada também se
 * alcançam pelo Tab. A vista «Lista» faz tudo o resto sem desenho nenhum.
 */

export type Seleccao = { tipo: "mesa" | "elemento"; id: string } | null;

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
}

interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

const LIMIAR_PX = 3;

function ajustarAoQuadro(c: { x: number; y: number; largura: number; altura: number }): Caixa {
  return { x: c.x, y: c.y, w: c.largura, h: c.altura };
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
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const encaixe = useMemo(() => ajustarAoQuadro(caixaDaSala(mapa)), [mapa]);
  const [vista, setVista] = useState<Caixa>(encaixe);
  /** A sala cresceu (uma mesa nova ao fundo): a vista acompanha, uma vez. */
  const encaixadaEm = useRef(encaixe);
  useEffect(() => {
    const antes = encaixadaEm.current;
    const cresceu =
      encaixe.x < antes.x ||
      encaixe.y < antes.y ||
      encaixe.x + encaixe.w > antes.x + antes.w ||
      encaixe.y + encaixe.h > antes.y + antes.h;
    encaixadaEm.current = encaixe;
    if (cresceu) setVista(encaixe);
  }, [encaixe]);

  /** O que o dedo está a levar, enquanto o leva. */
  const [noAr, setNoAr] = useState<
    | { tipo: "mesa" | "elemento"; id: string; dx: number; dy: number }
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
  }>({
    ponteiros: new Map(),
    alvo: null,
    inicio: null,
    moveu: false,
    vistaInicial: vista,
    pinca: null,
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
    const w = svg?.getBoundingClientRect().width || 1;
    const h = svg?.getBoundingClientRect().height || 1;
    return Math.max(vista.w / w, vista.h / h);
  }, [vista]);

  function zoom(factor: number, centro?: { x: number; y: number }) {
    setVista((v) => {
      const c = centro ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
      const w = Math.min(encaixe.w * 4, Math.max(200, v.w * factor));
      const h = (v.h / v.w) * w;
      return { x: c.x - ((c.x - v.x) / v.w) * w, y: c.y - ((c.y - v.y) / v.h) * h, w, h };
    });
  }

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
      const w = Math.min(encaixe.w * 4, Math.max(200, v0.w * f));
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
      setNoAr({ tipo, id, dx: dxPx * escala, dy: dyPx * escala });
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

  function aoRodar(e: React.WheelEvent<SVGSVGElement>) {
    // Sem Ctrl a roda é da página — a sala não rouba o rolar a quem passa.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, naSala(e.clientX, e.clientY));
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

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        role="group"
        aria-label="Sala"
        viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`}
        preserveAspectRatio="xMidYMid meet"
        // A altura segue a forma da sala (largura a mandar), entre um mínimo
        // que ainda se usa com o dedo e um máximo que deixa ver o resto.
        style={{ aspectRatio: `${encaixe.w} / ${encaixe.h}` }}
        className="block max-h-[62vh] min-h-[18rem] w-full touch-none select-none rounded-[var(--bo-raio-cartao)] border border-[var(--bo-hairline)] bg-[var(--bo-surface-sunken)]"
        onPointerDown={aoBaixar}
        onPointerMove={aoMover}
        onPointerUp={aoLevantar}
        onPointerCancel={aoLevantar}
        onWheel={aoRodar}
      >
        <defs>
          <pattern id="grelha-da-sala" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M50 0H0V50" fill="none" stroke="var(--bo-tinta-6)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect
          x={vista.x - vista.w}
          y={vista.y - vista.h}
          width={vista.w * 3}
          height={vista.h * 3}
          fill="url(#grelha-da-sala)"
        />

        {mapa.elementos.map((el) => {
          const { dx, dy } = deslocado("elemento", el.id);
          const escolhido = seleccao?.tipo === "elemento" && seleccao.id === el.id;
          return (
            <g
              key={el.id}
              data-alvo={`elemento|${el.id}`}
              role="button"
              tabIndex={0}
              aria-label={`${el.nome}. Setas para mover, Delete para apagar.`}
              aria-pressed={escolhido}
              transform={`translate(${el.x + dx} ${el.y + dy})`}
              className="cursor-grab outline-none focus-visible:[&>rect]:stroke-[var(--bo-accent)]"
              onKeyDown={(e) => teclaNaMesa(e, "elemento", el.id, el.x, el.y)}
            >
              <rect
                x={-el.largura / 2}
                y={-el.altura / 2}
                width={el.largura}
                height={el.altura}
                rx={10}
                fill="var(--bo-tinta-6)"
                stroke={escolhido ? "var(--bo-accent)" : "var(--bo-hairline-strong)"}
                strokeWidth={escolhido ? 4 : 2}
                strokeDasharray={el.tipo === "pista" ? "12 8" : undefined}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.min(26, el.altura / 3)}
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
              fill="var(--bo-surface)"
              fontWeight={600}
            >
              {iniciais(nomeDoLugar(mapa.lugares[noAr.de], lista))}
            </text>
          </g>
        )}
      </svg>

      <div className="absolute right-2 top-2 flex gap-1">
        {[
          { rotulo: "Aproximar", texto: "+", f: () => zoom(1 / 1.25) },
          { rotulo: "Afastar", texto: "−", f: () => zoom(1.25) },
          { rotulo: "Encaixar a sala", texto: "⤢", f: () => setVista(encaixe) },
        ].map((b) => (
          <button
            key={b.rotulo}
            type="button"
            aria-label={b.rotulo}
            title={b.rotulo}
            onClick={b.f}
            className={`alvo-toque flex h-9 w-9 items-center justify-center rounded-full border border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)] text-base text-[var(--bo-text)] shadow-[var(--bo-sombra-suspensa)] ${ESTADO} ${PRESSAO}`}
          >
            <span aria-hidden="true">{b.texto}</span>
          </button>
        ))}
      </div>
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
  onTecla: (e: React.KeyboardEvent) => void;
  onTocarLugar: (chave: string) => void;
}) {
  const { largura, altura } = dimensoes(mesa);
  const cs = cadeiras(mesa);
  const ocupados = cs.filter((c) => mapa.lugares[chaveDoLugar(mesa.id, c.lugar)]).length;
  const tinta = escolhida ? "var(--bo-accent)" : "var(--bo-hairline-strong)";
  return (
    <g transform={`translate(${deslocamento.dx} ${deslocamento.dy})`}>
      <g
        data-alvo={`mesa|${mesa.id}`}
        role="button"
        tabIndex={0}
        aria-pressed={escolhida}
        aria-label={`${mesa.nome}, ${mesa.forma}, ${mesa.lugares} lugares, ${ocupados} ocupados. Setas para mover, Delete para apagar.`}
        className="cursor-grab outline-none focus-visible:[&>*:first-child]:stroke-[var(--bo-accent)]"
        onKeyDown={onTecla}
      >
        {mesa.forma === "redonda" ? (
          <circle
            cx={mesa.x}
            cy={mesa.y}
            r={largura / 2}
            fill="var(--bo-surface)"
            stroke={tinta}
            strokeWidth={escolhida ? 4 : 2}
          />
        ) : (
          <rect
            x={mesa.x - largura / 2}
            y={mesa.y - altura / 2}
            width={largura}
            height={altura}
            rx={8}
            fill="var(--bo-surface)"
            stroke={tinta}
            strokeWidth={escolhida ? 4 : 2}
          />
        )}
        <text
          x={mesa.x}
          y={mesa.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.max(16, Math.min(24, largura / 6))}
          fill="var(--bo-text)"
          className="pointer-events-none"
          transform={
            mesa.forma === "comprida" && mesa.rodada ? `rotate(-90 ${mesa.x} ${mesa.y})` : undefined
          }
        >
          {mesa.nome}
        </text>
      </g>
      {cs.map((c) => {
        const chave = chaveDoLugar(mesa.id, c.lugar);
        const oc: Ocupante | undefined = mapa.lugares[chave];
        const nome = oc ? nomeDoLugar(oc, lista) : null;
        const livreAcesa = !oc && aSentar;
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
            <circle
              cx={c.x}
              cy={c.y}
              r={CADEIRA / 2}
              fill={oc ? "var(--bo-accent-lavagem)" : "var(--bo-surface)"}
              stroke={
                livreAcesa
                  ? "var(--bo-accent)"
                  : oc
                    ? "var(--bo-accent)"
                    : "var(--bo-hairline-strong)"
              }
              strokeWidth={livreAcesa ? 3 : 1.5}
              strokeDasharray={oc ? undefined : "5 4"}
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
          </g>
        );
      })}
    </g>
  );
}
