"use client";

import {
  PAGINA_H,
  PAGINA_M,
  PAGINA_W,
  TEXTO_DO_MOODBOARD as TXT,
  alturaDaLegenda,
  caixasDoMoodboard,
  linhasDaLegendaAprox,
  type LayoutDeMoodboard,
} from "@/lib/proposal-geometria";
import { useFotoComPlanoB } from "@/lib/useFotoComPlanoB";

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
 * TUDO o que aqui se desenha vem de `proposal-geometria`, em pontos de PDF: as
 * caixas de `caixasDoMoodboard`, e agora também as linhas de texto
 * (`TEXTO_DO_MOODBOARD`) e a altura que a legenda reserva
 * (`alturaDaLegenda`). Aqui só se divide pela página para virar percentagem —
 * não há segunda geometria nenhuma, e é isso que faz esta miniatura valer como
 * pré-visualização em vez de ser um desenho parecido.
 *
 * O eixo vertical do PDF cresce para CIMA e o do CSS para baixo: é a única
 * conversão que aqui se faz, e está numa linha só (`bottom`).
 *
 * ── A TIPOGRAFIA EM ESCALA, A SÉRIO ───────────────────────────────────────
 * Os tamanhos de letra eram `clamp(6px, 1,6cqw, 11px)` — e `cqw` sem nenhum
 * antepassado a declarar-se contentor NÃO é 1% desta caixa: é 1% da JANELA. O
 * título saía a 11 px numa miniatura de 240 px de largura quando a página lhe
 * dá 6,8 px, e não mudava de tamanho quando a miniatura mudava. Daí o
 * `container-type: inline-size` na folha: a partir dele, `cqw` quer mesmo dizer
 * «um centésimo da largura da página», e cada tamanho é o do PDF a dividir pela
 * largura da folha. A miniatura passa a encolher como uma fotocópia.
 */

/** Um valor em pontos de PDF, em percentagem do eixo. */
export const pct = (n: number, total: number) => `${(n / total) * 100}%`;
/**
 * Um tamanho em pontos de PDF, em unidades de contentor — escala com a folha.
 *
 * Exportado com o `pct` porque a folha de TEXTO (`FolhaDaProposta`) se desenha
 * exactamente com as mesmas duas conversões. Escritas duas vezes, divergiam — e
 * a divergência apareceria como duas miniaturas do mesmo documento com a
 * tipografia a escalas diferentes, lado a lado na mesma grelha.
 */
export const cq = (pontos: number) => `${(pontos / PAGINA_W) * 100}cqw`;
/**
 * A descida de uma linha de texto: o PDF ancora a LINHA DE BASE e o CSS ancora
 * a caixa. Um quinto do corpo é a descida típica de uma serifa — o suficiente
 * para as duas coincidirem à vista, e não se finge mais precisão do que esta
 * (a fonte do browser não é a Carlito do documento).
 */
export const DESCIDA = 0.2;

/**
 * A marca no cabeçalho, como o `header` do gerador a desenha: 72 pontos de
 * largura, encostada à margem, seis pontos acima da linha do topo. O aspecto é
 * o do ficheiro (3747 × 2238) — o mesmo desenho que vai embutido no PDF.
 */
const LOGO = { largura: 72, aspecto: 2238 / 3747, subida: 6 };

/**
 * O `style` de uma linha de texto da folha, a partir da linha de base e do
 * corpo que o documento lhe dá.
 *
 * Exportado porque é aqui que a fidelidade se decide, e é isto que o teste que
 * põe a miniatura ao lado do PDF a sério lê — sem precisar de um browser para
 * comparar dois números.
 */
export function estiloDaLinha({ base, tamanho }: { base: number; tamanho: number }) {
  return {
    left: pct(PAGINA_M, PAGINA_W),
    right: pct(PAGINA_M, PAGINA_W),
    bottom: pct(base - tamanho * DESCIDA, PAGINA_H),
    fontSize: cq(tamanho),
    lineHeight: 1,
  } as const;
}

export default function PreviaDaPagina({
  layout,
  aspectos,
  urls,
  originais,
  semRecorte,
  titulo,
  subtitulo,
  legenda,
  comRotulo = false,
}: {
  layout: LayoutDeMoodboard;
  /** A forma de cada foto, pela ordem em que a página as desenha. */
  aspectos: number[];
  /** O URL de cada foto, pela MESMA ordem dos aspectos. */
  urls: (string | undefined)[];
  /**
   * O ORIGINAL de cada foto, pela mesma ordem — o degrau seguinte da cascata.
   *
   * Sem isto, esta era a única superfície do estúdio a desenhar um URL cru: a
   * grelha logo acima já caía para o original sozinha, e a miniatura ao lado
   * mostrava o ícone de imagem partida do navegador para a MESMA fotografia.
   */
  originais?: (string | undefined)[];
  semRecorte: boolean;
  titulo: string;
  subtitulo?: string;
  legenda?: string;
  /**
   * ── «A PÁGINA, COMO VAI SAIR» — SÓ ONDE AINDA DIZ ALGUMA COISA ──────────
   *
   * Palavras dela: «remover "A página, como vai sair" repetido sob cada
   * miniatura».
   *
   * O rótulo nasceu quando esta era a única miniatura do estúdio, ao lado do
   * selector de disposição, e aí faz o seu trabalho: diz que aquele desenho não
   * é uma fotografia, é a folha. Onde já há um número e um nome por baixo — a
   * vista de conjunto, o painel da direita — repete-se em cada célula da grelha
   * e não acrescenta nada: uma linha de ruído multiplicada por catorze.
   *
   * Por isso passa a pedir-se. Ausente é o caso comum, e o caso comum é o da
   * grelha.
   */
  comRotulo?: boolean;
}) {
  // A legenda reserva altura à página real, e reserva MAIS quanto mais linhas
  // tiver. Assumir uma linha mostrava as fotos maiores do que vão sair sempre
  // que a descrição passasse a segunda — e cinco linhas comem 15% da folha.
  const alturaLegenda = alturaDaLegenda(linhasDaLegendaAprox(legenda));
  const caixas = caixasDoMoodboard(layout, aspectos, alturaLegenda, semRecorte);

  return (
    <figure className="m-0">
      <div
        className="relative w-full overflow-hidden rounded-md border border-[var(--bo-hairline-strong)] bg-white"
        style={{
          aspectRatio: `${PAGINA_W} / ${PAGINA_H}`,
          // Sem isto, os `cqw` de baixo medem-se à JANELA. Ver o cabeçalho.
          containerType: "inline-size",
        }}
      >
        {/* ── A MOLDURA DA PÁGINA ──────────────────────────────────────────
            O logótipo em cima e o rodapé em baixo saem em TODAS as páginas do
            documento. Não são enfeite da miniatura: são eles que mostram
            quanto ar fica à volta da mancha, que é metade do que se está a
            avaliar quando se escolhe uma disposição. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-liquen.png"
          alt=""
          aria-hidden="true"
          className="absolute opacity-80"
          style={{
            left: pct(PAGINA_M, PAGINA_W),
            width: pct(LOGO.largura, PAGINA_W),
            // `y = H - M - altura + subida`, como o cabeçalho do PDF.
            bottom: pct(PAGINA_H - PAGINA_M - LOGO.largura * LOGO.aspecto + LOGO.subida, PAGINA_H),
          }}
        />
        <span
          aria-hidden="true"
          className="absolute rounded-full bg-foreground/25"
          style={{
            left: pct(PAGINA_W / 2 - 6, PAGINA_W),
            width: pct(12, PAGINA_W),
            height: pct(1.5, PAGINA_H),
            bottom: pct(PAGINA_M - 26, PAGINA_H),
          }}
        />

        {/* O sobretítulo: «INSPIRAÇÃO», maiúsculas espaçadas, como na folha. */}
        <p
          className="absolute truncate font-medium uppercase text-foreground/40"
          style={{
            ...estiloDaLinha(TXT.sobretitulo),
            letterSpacing: cq(TXT.sobretitulo.espacamento),
          }}
        >
          {TXT.sobretitulo.texto}
        </p>
        <p
          className="absolute truncate font-serif italic text-[var(--bo-text)]"
          style={estiloDaLinha(TXT.titulo)}
        >
          {titulo?.trim() || "sem título"}
        </p>
        {subtitulo?.trim() && (
          <p
            className="absolute truncate font-serif italic text-foreground/50"
            style={estiloDaLinha(TXT.subtitulo)}
          >
            {subtitulo}
          </p>
        )}

        {caixas.map((c, i) => (
          <span
            key={i}
            className="absolute overflow-hidden bg-[var(--bo-tinta-6)] ring-[0.5px] ring-[var(--bo-hairline-strong)]"
            style={{
              left: pct(c.x, PAGINA_W),
              // O y do PDF é medido a partir do FUNDO: `bottom` em vez de `top`.
              bottom: pct(c.y, PAGINA_H),
              width: pct(c.w, PAGINA_W),
              height: pct(c.h, PAGINA_H),
            }}
          >
            <FotoDaPrevia url={urls[i]} original={originais?.[i]} semRecorte={semRecorte} />
          </span>
        ))}

        {legenda?.trim() && (
          <p
            className="absolute overflow-hidden font-serif italic text-foreground/50"
            style={{
              // A ÚLTIMA linha sai sempre à mesma altura — a `folga` acima da
              // margem — e as anteriores empilham-se para cima, tal como o
              // desenho as escreve.
              ...estiloDaLinha({
                base: PAGINA_M + TXT.legenda.folga,
                tamanho: TXT.legenda.tamanho,
              }),
              lineHeight: TXT.legenda.entrelinha / TXT.legenda.tamanho,
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              // O documento corta no mesmo número de linhas.
              WebkitLineClamp: TXT.legenda.maxLinhas,
            }}
          >
            {legenda}
          </p>
        )}
      </div>
      {comRotulo && (
        <figcaption className="mt-1 text-[10px] text-foreground/40">
          A página, como vai sair
        </figcaption>
      )}
    </figure>
  );
}

/**
 * ── UMA FOTO DA MINIATURA — NUNCA UM ÍCONE DE IMAGEM PARTIDA ──────────────
 *
 * A cascata é a mesma da grelha do estúdio (`useFotoComPlanoB`): a derivada que
 * está em memória primeiro, o original a seguir, e se nem esse existir uma
 * caixa vazia e discreta.
 *
 * Porquê caixa vazia e não um aviso: aqui a fotografia tem 30 px de lado e
 * qualquer texto seria ilegível. Quem tem de gritar é a célula da grelha, que é
 * grande, tem o botão de tentar de novo e é lá que se resolve o problema. Esta
 * mostra a página; uma caixa cinzenta lê-se como «não há foto», que é a
 * verdade, em vez do ícone partido do navegador, que se lê como «isto avariou».
 */
export function FotoDaPrevia({
  url,
  original,
  semRecorte,
}: {
  url?: string;
  original?: string;
  semRecorte: boolean;
}) {
  const { alvo, desistiu, aoFalhar } = useFotoComPlanoB(url, original);
  if (!alvo || desistiu) {
    // A pega dos testes: uma pré-visualização sem imagens é um defeito, e tem
    // de haver por onde o apanhar sem ser a olho.
    return <span data-previa="sem-foto" className="block h-full w-full" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={alvo}
      alt=""
      // Já está descarregada: é a MESMA URL que a grelha logo acima está a
      // mostrar, portanto sai da cache do navegador sem tocar na rede.
      loading="lazy"
      decoding="async"
      onError={aoFalhar}
      data-previa="foto"
      className={`h-full w-full ${semRecorte ? "object-contain" : "object-cover"}`}
    />
  );
}
