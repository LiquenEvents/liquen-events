/**
 * Route-level loading boundary for the public marketing pages.
 *
 * Why this matters for fluidity: the public URLs (`/sobre`, `/servicos`, …) are
 * served by a proxy REWRITE onto the internal `/{lang}/…` segments, so the
 * client router has no local route match and must fetch the RSC payload on a
 * click whose route hasn't been prefetched yet (Data-Saver users, a click before
 * the viewport-triggered prefetch lands, or a stale prefetch cache). With NO
 * loading boundary, the router kept the OLD page frozen on screen until that
 * fetch returned — which reads exactly as the "stuttering / hanging" page
 * transition the owner reported.
 *
 * This boundary makes every not-yet-prefetched navigation reveal an INSTANT
 * screen instead of hanging. It mimics the dark, full-bleed hero backdrop every
 * public page opens on (`-mt-24` cancels <main>'s pt-24 so it runs edge to edge
 * under the transparent navbar), so the handoff to the real hero is seamless.
 * The only motion is a composited opacity pulse (GPU, no layout/paint churn) and
 * it's disabled under prefers-reduced-motion by the global rule.
 */
export default function Loading() {
  return (
    // `ecra-de-espera` é a alça de que a folha `<noscript>` do layout de raiz
    // precisa: sem JS este ecrã fica para sempre (o script que o substitui pelo
    // conteúdo nunca corre), e é por esta classe que ele se esconde para dar
    // lugar à página que ficou na gaveta. Ver o comentário longo lá.
    <div
      aria-hidden
      className="ecra-de-espera -mt-24 flex min-h-[100svh] w-full items-center justify-center bg-[#0c0e0b]"
    >
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white/55" />
    </div>
  );
}
