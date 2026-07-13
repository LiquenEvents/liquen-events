"use client";

/**
 * Skeleton loaders for the back office. Instead of a bare spinner or "A
 * carregar…" text, these mirror the shape of the content that's about to
 * arrive — the layout settles in place and the wait feels shorter.
 */

/** A single shimmering bar. `className` controls width/height. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`bo-skeleton ${className}`} aria-hidden />;
}

/** A card-shaped skeleton with a couple of text lines. */
export function SkeletonCard() {
  return (
    <div className="bo-card p-5">
      <div className="flex items-center gap-3 mb-4">
        <SkeletonBar className="w-9 h-9 !rounded-full shrink-0" />
        <div className="flex-1">
          <SkeletonBar className="h-3.5 w-1/2 mb-2" />
          <SkeletonBar className="h-2.5 w-1/3" />
        </div>
      </div>
      <SkeletonBar className="h-2.5 w-full mb-2" />
      <SkeletonBar className="h-2.5 w-4/5" />
    </div>
  );
}

/** A row-shaped skeleton (avatar + two lines + trailing value). */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <SkeletonBar className="w-9 h-9 !rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <SkeletonBar className="h-3 w-2/5 mb-2" />
        <SkeletonBar className="h-2.5 w-3/5" />
      </div>
      <SkeletonBar className="h-3 w-16 shrink-0" />
    </div>
  );
}

/**
 * A full-view loading state used by the code-split views while their JS chunk
 * arrives: a header line, a KPI strip, then a panel. Generic enough to stand
 * in for any of the dashboard views without looking wrong.
 */
export function ViewSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="A carregar">
      {/* Greeting */}
      <div>
        <SkeletonBar className="h-2.5 w-40 mb-3" />
        <SkeletonBar className="h-9 w-72 mb-3" />
        <SkeletonBar className="h-3 w-56" />
      </div>
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bo-card p-5">
            <SkeletonBar className="h-7 w-16 mb-3" />
            <SkeletonBar className="h-2.5 w-20" />
          </div>
        ))}
      </div>
      {/* Panel */}
      <div className="bo-card overflow-hidden">
        <div className="px-5 py-4 border-b border-foreground/[0.07]">
          <SkeletonBar className="h-2.5 w-36" />
        </div>
        <div className="divide-y divide-foreground/[0.06]">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A list of row skeletons inside a card — for the data-fetching views. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div
      className="bo-card overflow-hidden divide-y divide-foreground/[0.06]"
      aria-busy="true"
      aria-label="A carregar"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
