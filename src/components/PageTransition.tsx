"use client";

import { usePathname } from "next/navigation";

/**
 * Subtle Pixel-Matters-style route transition: on each navigation the page
 * content fades/rises in, driven by the `key` change + the `.route-fade`
 * class. Pure CSS, GPU-friendly, and respects prefers-reduced-motion.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Admin/orçamento run full-screen; don't animate their heavy surfaces.
  if (pathname.startsWith("/orcamento")) return <>{children}</>;

  return (
    <div key={pathname} className="route-fade">
      {children}
    </div>
  );
}
