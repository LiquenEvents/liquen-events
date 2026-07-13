import type { Metadata } from "next";
import NotFoundView from "./NotFoundView";

export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: { index: false, follow: false },
};

// The locale-aware UI lives in a client component so it can read the locale
// from the layout's <LocaleProvider> — not-found.tsx doesn't receive route
// params, and keeping it off request headers lets every page render statically.
export default function NotFound() {
  return <NotFoundView />;
}
