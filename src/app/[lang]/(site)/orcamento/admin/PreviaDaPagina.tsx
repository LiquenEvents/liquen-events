"use client";

import {
  PAGINA_H,
  PAGINA_W,
  caixasDoMoodboard,
  type LayoutDeMoodboard,
} from "@/lib/proposal-geometria";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA, COMO ELA VAI SAIR — AO LADO DO SELECTOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Hoje escolhe-se o layout sem ver o resultado.»
 *
 * Os diagramas do selector já mostravam a FORMA das caixas — o que faltava era
 * ver as fotografias lá dentro, com o título, o subtítulo e a legenda no sítio
 * onde vão sair. É a diferença entre «uma grande e três pequenas» e «esta foto
 * grande, com estas três ao lado».
 *
 * ── DESENHADA EM COORDENADAS DA PÁGINA ────────────────────────────────────
 * As caixas vêm de `caixasDoMoodboard`, a MESMA função do gerador, em pontos
 * de PDF. Aqui só se dividem pela largura da página para virarem percentagens —
 * não há segunda geometria nenhuma, e é isso que faz esta miniatura valer como
 * pré-visualização em vez de ser um desenho parecido.
 *
 * O eixo vertical do PDF cresce para CIMA e o do CSS para baixo: é a única
 * conversão que aqui se faz, e está numa linha só.
 */
export default function PreviaDaPagina({
  layout,
  aspectos,
  urls,
  semRecorte,
  titulo,
  subtitulo,
  legenda,
}: {
  layout: LayoutDeMoodboard;
  /** A forma de cada foto, pela ordem em que a página as desenha. */
  aspectos: number[];
  /** O URL de cada foto, pela MESMA ordem dos aspectos. */
  urls: (string | undefined)[];
  semRecorte: boolean;
  titulo: string;
  subtitulo?: string;
  legenda?: string;
}) {
  // A legenda reserva altura à página real; sem lhe dar a mesma reserva aqui, a
  // miniatura mostrava as fotos mais baixas do que vão ficar.
  const alturaLegenda = legenda?.trim() ? 26 : 8;
  const caixas = caixasDoMoodboard(layout, aspectos, alturaLegenda, semRecorte);
  const pct = (n: number, total: number) => `${(n / total) * 100}%`;

  return (
    <figure className="m-0">
      <div
        className="relative w-full overflow-hidden rounded-md border border-foreground/15 bg-white"
        style={{ aspectRatio: `${PAGINA_W} / ${PAGINA_H}` }}
      >
        {/* O cabeçalho da página: onde o título e o subtítulo saem mesmo. */}
        <p
          className="absolute truncate font-serif italic text-foreground/80"
          style={{
            left: pct(68, PAGINA_W),
            top: pct(92, PAGINA_H),
            right: pct(68, PAGINA_W),
            fontSize: "clamp(6px, 1.6cqw, 11px)",
          }}
        >
          {titulo?.trim() || "sem título"}
        </p>
        {subtitulo?.trim() && (
          <p
            className="absolute truncate font-serif italic text-foreground/45"
            style={{
              left: pct(68, PAGINA_W),
              top: pct(112, PAGINA_H),
              right: pct(68, PAGINA_W),
              fontSize: "clamp(5px, 1.2cqw, 9px)",
            }}
          >
            {subtitulo}
          </p>
        )}

        {caixas.map((c, i) => (
          <span
            key={i}
            className="absolute overflow-hidden bg-foreground/[0.06] ring-[0.5px] ring-foreground/15"
            style={{
              left: pct(c.x, PAGINA_W),
              // O y do PDF é medido a partir do FUNDO: `bottom` em vez de `top`.
              bottom: pct(c.y, PAGINA_H),
              width: pct(c.w, PAGINA_W),
              height: pct(c.h, PAGINA_H),
            }}
          >
            {urls[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[i]}
                alt=""
                loading="lazy"
                decoding="async"
                className={`h-full w-full ${semRecorte ? "object-contain" : "object-cover"}`}
              />
            ) : null}
          </span>
        ))}

        {legenda?.trim() && (
          <p
            className="absolute truncate font-serif italic text-foreground/50"
            style={{
              left: pct(68, PAGINA_W),
              right: pct(68, PAGINA_W),
              bottom: pct(20, PAGINA_H),
              fontSize: "clamp(5px, 1.2cqw, 9px)",
            }}
          >
            {legenda}
          </p>
        )}
      </div>
      <figcaption className="mt-1 text-[10px] text-foreground/40">
        A página, como vai sair
      </figcaption>
    </figure>
  );
}
