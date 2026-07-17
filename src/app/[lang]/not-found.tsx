import type { Metadata } from "next";
import NotFoundView from "./NotFoundView";

// not-found.tsx can't read route params, so the <title> can't be localized
// here. Use a language-neutral title (rather than PT-only) so an EN visitor on
// a broken /en/* link doesn't get a Portuguese document title. The visible body
// (NotFoundView) still renders in the correct language via LocaleProvider.
export const metadata: Metadata = {
  title: "404 — Líquen Events",
  robots: { index: false, follow: false },
};

// The locale-aware UI lives in a client component so it can read the locale
// from the layout's <LocaleProvider> — not-found.tsx doesn't receive route
// params, and keeping it off request headers lets every page render statically.
export default function NotFound() {
  return <NotFoundView />;
}
