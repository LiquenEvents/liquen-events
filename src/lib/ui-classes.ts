/**
 * Shared Tailwind class strings for repeated UI patterns. Keeps the primary
 * form CTA (orçamento + contacto submit buttons) visually identical without
 * three independently-maintained copies of the same 200+ char string.
 */
export const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center gap-3 px-9 py-4 btn-shine bg-moss text-cream font-medium rounded-sm hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-[11px] tracking-[0.3em] uppercase shadow-lg shadow-moss/15 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:gap-3";
