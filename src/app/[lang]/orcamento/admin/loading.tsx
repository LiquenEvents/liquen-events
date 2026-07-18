/**
 * Route-level loading UI for the back office.
 *
 * The admin dashboard is a heavy client bundle (sidebar shell + a dozen
 * code-split views). Without this file, navigating to /orcamento/admin leaves
 * the *previous* page frozen on screen while that JS/data streams in. This
 * skeleton renders instantly from the server and mirrors the real shell —
 * dark sidebar, white header, KPI strip + panel — so the wait reads as
 * "the tool is opening" instead of "nothing happened".
 *
 * Server component, no client JS. The white-surface bars use `.bo-skeleton`
 * (shimmer already disabled under prefers-reduced-motion in globals.css); the
 * dark-sidebar placeholders are static tints, so nothing pulses distractingly.
 */
export default function AdminLoading() {
  return (
    <div
      className="min-h-screen bg-surface flex"
      role="status"
      aria-busy="true"
      aria-label="A carregar o back office"
    >
      {/* ── Sidebar (matches the real w-64 #1b2119 rail) ── */}
      <aside className="hidden lg:flex sticky top-0 z-40 h-screen w-64 shrink-0 bg-[#1b2119] flex-col">
        {/* Brand block */}
        <div className="px-5 pt-8 pb-5 flex flex-col items-center">
          <div className="h-24 w-32 rounded-md bg-white/[0.06]" />
          <div className="mt-3 h-1.5 w-20 rounded bg-white/[0.05]" />
        </div>
        <div className="mx-4 h-px bg-white/[0.07] mb-2" />
        {/* Nav items */}
        <div className="flex-1 px-2.5 py-3 flex flex-col gap-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <div className="h-4 w-4 rounded bg-white/[0.07]" />
              <div className="h-2 w-24 rounded bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex-1 min-w-0">
        {/* Header (matches the sticky white bar) */}
        <header className="sticky top-0 z-20 bg-white/92 backdrop-blur-xl border-b border-foreground/[0.07] px-4 sm:px-6 lg:px-10 py-4 flex items-center gap-4">
          <div className="min-w-0">
            <div className="bo-skeleton h-2 w-28 mb-3" />
            <div className="bo-skeleton h-6 w-52" />
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <div className="bo-skeleton h-9 w-9 !rounded-full" />
            <div className="bo-skeleton hidden sm:block h-9 w-28 !rounded-lg" />
            <div className="bo-skeleton h-9 w-20 !rounded-lg" />
          </div>
        </header>

        {/* Content: KPI strip + panel (mirrors the default Overview view) */}
        <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 flex flex-col gap-8">
          <div>
            <div className="bo-skeleton h-2 w-40 mb-3" />
            <div className="bo-skeleton h-9 w-72 mb-3" />
            <div className="bo-skeleton h-3 w-56" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bo-card p-5">
                <div className="bo-skeleton h-7 w-16 mb-3" />
                <div className="bo-skeleton h-2.5 w-20" />
              </div>
            ))}
          </div>
          <div className="bo-card overflow-hidden">
            <div className="px-5 py-4 border-b border-foreground/[0.07]">
              <div className="bo-skeleton h-2.5 w-36" />
            </div>
            <div className="divide-y divide-foreground/[0.06]">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4">
                  <div className="bo-skeleton w-9 h-9 !rounded-full shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="bo-skeleton h-3 w-2/5 mb-2" />
                    <div className="bo-skeleton h-2.5 w-3/5" />
                  </div>
                  <div className="bo-skeleton h-3 w-16 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <span className="sr-only">A carregar…</span>
    </div>
  );
}
