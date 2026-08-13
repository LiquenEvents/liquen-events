/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O VÍDEO CURTO EM CICLO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── ESTADO: NÃO HÁ MATERIAL ────────────────────────────────────────────────
 * Este componente está escrito e testado, e HOJE não é usado por variante
 * nenhuma, porque o repositório não tem um único ficheiro de vídeo
 * (`find public -name "*.mp4" -o -name "*.webm"` devolve zero). Não se inventa
 * um caminho para um ficheiro que não existe: uma landing page paga com um
 * `<video>` a 404 é pior do que uma sem vídeo.
 *
 * Assim que houver material, basta preencher `video` na entrada da variante
 * em `src/lib/meta/variantes.ts`. O que é preciso filmar está em
 * /meta-ads/criativos.md.
 *
 * ── AS QUATRO CONDIÇÕES DO AUTOPLAY ────────────────────────────────────────
 * Um vídeo só arranca sozinho, sem gesto do utilizador, se cumprir as quatro:
 *
 *   `muted`        — sem isto, nenhum browser corrente o deixa arrancar. É a
 *                    regra, não uma preferência;
 *   `playsInline`  — sem isto o Safari do iPhone abre o vídeo em ecrã inteiro
 *                    por cima da página. Numa landing page isso é o visitante
 *                    a perder a página de vista e a carregar em "concluído";
 *   `autoPlay`     — o pedido;
 *   `loop`         — para não ficar um fotograma parado no fim.
 *
 * ── O POSTER ───────────────────────────────────────────────────────────────
 * `preload="none"` e um poster leve: o vídeo NÃO é o candidato a LCP e não
 * pode competir com a fotografia de capa pela largura de banda. O que se vê
 * enquanto ele não chega é o poster, e o poster é uma imagem estática da
 * escada normal do sítio.
 *
 * ── SEM CONTROLOS, E COM `aria-hidden` ─────────────────────────────────────
 * É decoração em ciclo, muda, sem informação que não esteja no texto à volta.
 * Anunciá-lo a um leitor de ecrã seria dar-lhe um objecto com que não pode
 * fazer nada. Quem quiser ver o trabalho tem as fotografias, que têm texto
 * alternativo.
 */
export default function VideoCiclo({
  src,
  poster,
  className = "",
}: {
  src: string;
  poster: string;
  className?: string;
}) {
  return (
    <video
      className={className}
      src={src}
      poster={poster}
      muted
      playsInline
      autoPlay
      loop
      preload="none"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
