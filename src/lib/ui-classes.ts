/**
 * Shared Tailwind class strings for repeated UI patterns. Keeps the primary
 * form CTA (orçamento + contacto submit buttons) visually identical without
 * three independently-maintained copies of the same 200+ char string.
 */
// Sharp corners to match the redesigned hero / services CTAs (the site's
// on-brand button shape); keep every primary "Pedir orçamento" identical.
// Geometry + type are shared; only the drop shadow changes with the ground it
// sits on (a moss glow is invisible on a dark photo; a black shadow is
// invisible on cream) — hence the two exported variants below.
const PRIMARY_BUTTON_BASE =
  "inline-flex items-center gap-3 px-9 py-4 btn-shine bg-moss text-white font-medium hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-[11px] tracking-[0.3em] uppercase disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:gap-3";

// On light / cream sections (form submits, service-intro CTA): soft moss lift.
export const PRIMARY_BUTTON_CLASS = `${PRIMARY_BUTTON_BASE} shadow-lg shadow-moss/15`;

// On full-bleed dark / image sections (the closing CTAs): a black drop shadow
// that actually reads over the photo. Identical to the light primary otherwise.
export const PRIMARY_BUTTON_DARK_CLASS = `${PRIMARY_BUTTON_BASE} shadow-xl shadow-black/30`;

// Cinematic outline button for full-bleed dark / image sections (the "SpaceX"
// treatment): a crisp white hairline that inverts to a solid white fill on
// hover. Single source of truth so every dark-section CTA — /servicos bands,
// sobre, galeria, clientes — stays pixel-identical. Add `flex-shrink-0` inline
// where the button sits in a flex row next to a heading.
export const OUTLINE_LIGHT_BUTTON_CLASS =
  "inline-flex items-center gap-3 px-9 py-4 border border-white/35 text-white text-[11px] tracking-[0.28em] uppercase hover:bg-white hover:text-black hover:border-white transition-all duration-300";
