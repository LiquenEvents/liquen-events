/**
 * Route-level loading UI for the quote confirmation page.
 *
 * ConfirmacaoClient fetches the quote by id before it can render, so the route
 * has an unavoidable data wait. Without this file the previous page stays
 * frozen during that fetch; with it, the confirmation's shape appears instantly
 * — a calm placeholder of the success header and the details/next-steps cards —
 * so the arrival feels immediate and settles in place instead of flashing.
 *
 * Server component, no client JS. Bars use `.bo-skeleton`, whose shimmer is
 * already disabled under prefers-reduced-motion in globals.css. Sits inside the
 * orçamento layout (footer / WhatsApp / scroll-progress already hidden), and
 * uses the same surface, spacing and moss accents as the real page.
 */
export default function ConfirmacaoLoading() {
  return (
    <div
      className="relative min-h-screen overflow-hidden bg-surface"
      role="status"
      aria-busy="true"
      aria-label="A carregar a confirmação"
    >
      <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-16 py-24 lg:py-28">
        {/* ── Success header ── */}
        <div className="flex flex-col items-start mb-16 lg:mb-20">
          {/* Check medallion placeholder — same moss ring as the real badge */}
          <span className="mb-9 inline-flex h-16 w-16 items-center justify-center rounded-full bg-moss/10 ring-1 ring-moss/25">
            <span className="h-6 w-6 rounded-full bg-moss/20" />
          </span>
          <div className="bo-skeleton h-2.5 w-40 mb-7" />
          <div className="bo-skeleton h-12 w-72 max-w-full mb-4" />
          <div className="bo-skeleton h-12 w-56 max-w-full mb-7" />
          <div className="bo-skeleton h-3.5 w-full max-w-xl mb-2.5" />
          <div className="bo-skeleton h-3.5 w-4/5 max-w-xl" />
        </div>

        {/* ── Details + next-steps cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] items-start gap-6 lg:gap-8">
          {/* Quote details card */}
          <div className="rounded-2xl border border-foreground/10 bg-white shadow-[0_1px_2px_rgba(42,38,32,0.04),0_12px_40px_-24px_rgba(42,38,32,0.25)]">
            <div className="flex items-start justify-between gap-4 px-7 pt-7 pb-6 border-b border-foreground/8">
              <div>
                <div className="bo-skeleton h-2.5 w-24 mb-3" />
                <div className="bo-skeleton h-4 w-32" />
              </div>
              <div className="bo-skeleton h-7 w-24 !rounded-full" />
            </div>
            <div className="divide-y divide-foreground/8">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-7 py-4">
                  <div className="bo-skeleton h-2.5 w-20" />
                  <div className="bo-skeleton h-3 w-28" />
                </div>
              ))}
            </div>
          </div>

          {/* Next-steps card */}
          <div className="rounded-2xl border border-moss/20 bg-moss/[0.06] p-7">
            <div className="bo-skeleton h-2.5 w-28 mb-6" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 mb-5 last:mb-0">
                <div className="bo-skeleton h-[26px] w-[26px] !rounded-full shrink-0" />
                <div className="flex-1 pt-1">
                  <div className="bo-skeleton h-3 w-3/4 mb-2" />
                  <div className="bo-skeleton h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <span className="sr-only">A carregar…</span>
    </div>
  );
}
