import type { ThemeImage, ThemeSummary } from "@/lib/theme-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CAPA DE UM CARTÃO MUDA INTEIRA, OU NÃO MUDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O cartão de um tema não desenha UM endereço: desenha quatro, que têm de ser
 * da MESMA fotografia — a derivada que se pede (`coverUrl`), a oferta em AVIF
 * que o `<picture>` põe à frente dela (`coverAvif`), o original para quando a
 * derivada dá 404 (`coverFallbackUrl`) e o borrão que se pinta enquanto se
 * espera (`coverLqip`).
 *
 * Trocar a capa mudava só o primeiro. O AVIF ficava da fotografia ANTIGA, e
 * como o `<source>` ganha ao `<img>` em qualquer navegador que leia AVIF, o
 * cartão continuava a mostrar a capa de antes — com o servidor a dizer que a
 * nova estava gravada. O borrão e o plano B ficavam também desencontrados.
 *
 * Por isso a troca passa por aqui, e só por aqui: os campos da capa saem
 * TODOS do cartão e entram todos os da fotografia nova. Um campo que a
 * fotografia nova não tenha fica ausente — nunca herdado da antiga.
 */
export type CapaDoCartao = Pick<
  ThemeSummary,
  "coverUrl" | "coverAvif" | "coverFallbackUrl" | "coverLqip"
>;

/**
 * Os campos de capa que uma fotografia da pasta dá ao cartão.
 *
 * A pasta não conhece o AVIF (a `ThemeImage` não o traz), e por isso uma capa
 * vinda daqui não o oferece: o cartão pede a miniatura, que existe sempre que
 * foi assinada. O original só vai como plano B quando há uma miniatura à
 * frente dele — sem miniatura, o original já É o `coverUrl`.
 *
 * `null` é a pasta vazia: o cartão fica sem capa nenhuma.
 */
export function capaDaFoto(im: ThemeImage | null): CapaDoCartao {
  if (!im) return {};
  const url = im.thumbUrl || im.url;
  return {
    ...(url ? { coverUrl: url } : {}),
    ...(im.thumbUrl && im.url ? { coverFallbackUrl: im.url } : {}),
    ...(im.lqip ? { coverLqip: im.lqip } : {}),
  };
}

/** O ficheiro, sem a assinatura (que muda a cada pedido). */
function semAssinatura(url: string | undefined): string {
  return url ? url.split("?")[0] : "";
}

/**
 * O cartão com a capa trocada — todos os campos de uma vez.
 *
 * ── E A MESMA FOTOGRAFIA NÃO CONTA COMO TROCA ─────────────────────────────
 *
 * Abrir a pasta devolve a capa que ela vê, e quase sempre é a mesma que o
 * cartão já tinha — só que assinada outra vez, com outro `?token=`. Trocar aí
 * deitava fora o AVIF (que a pasta não conhece) por nada. A pergunta é feita
 * ao FICHEIRO, sem a assinatura: o mesmo ficheiro deixa o cartão como está.
 */
export function comCapa<T extends ThemeSummary>(t: T, capa: CapaDoCartao): T {
  if (capa.coverUrl && semAssinatura(capa.coverUrl) === semAssinatura(t.coverUrl)) return t;
  // Os quatro saem, e só depois entram os da fotografia nova.
  const {
    coverUrl: _url,
    coverAvif: _avif,
    coverFallbackUrl: _planoB,
    coverLqip: _lqip,
    ...resto
  } = t;
  return { ...resto, ...capa } as T;
}
