/**
 * Full-screen surface for the quote flow (form, confirmation, back-office).
 *
 * The marker `data-orcamento-mode` is server-rendered, so the global CSS that
 * hides the footer / WhatsApp / scroll bar and switches to the white surface
 * (see globals.css `body:has([data-orcamento-mode])`) applies on the very first
 * paint — no flash, unlike a `useEffect`-added body class. Unmounting on
 * navigation removes the marker and reverts the styles automatically.
 */
export default function OrcamentoLayout({ children }: { children: React.ReactNode }) {
  return <div data-orcamento-mode>{children}</div>;
}
