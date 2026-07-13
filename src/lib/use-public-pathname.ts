"use client";

import { usePathname } from "next/navigation";
import { LOCALES } from "@/lib/i18n";

/**
 * Strips the internal locale segment (`/pt`, `/en`) from a pathname.
 *
 * Marketing pages are statically prerendered under `/[lang]/…`, so at build
 * time `usePathname()` reports the *internal* path (`/pt/sobre`), while on the
 * client the browser shows the *public* URL (`/sobre` for Portuguese, and
 * `/en/sobre` for the English mirror). Comparing the raw pathname against
 * locale-less routes (`=== "/sobre"`, `startsWith("/contacto")`) therefore
 * disagrees between server and client on Portuguese pages → hydration
 * mismatches. Normalising to the locale-less path makes those comparisons
 * consistent (and, as a bonus, makes them correct on the English mirror too,
 * where the raw `/en/*` path never matched the bare routes).
 */
export function stripLocalePrefix(pathname: string): string {
  for (const l of LOCALES) {
    if (pathname === `/${l}`) return "/";
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1);
  }
  return pathname;
}

/** `usePathname()` with the internal locale segment removed. */
export function usePublicPathname(): string {
  return stripLocalePrefix(usePathname());
}
