/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A APARÊNCIA — TRÊS ESTADOS, E O AUTOMÁTICO É O DE OMISSÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A Parte 5.3 do `docs/DESIGN-SYSTEM.md` é explícita, e diz também porquê: «a
 * Apple desaconselha uma preferência exclusiva da app; três estados com
 * Automático por omissão é o compromisso correto».
 *
 * ── PORQUÊ UM COOKIE E NÃO O `localStorage` ────────────────────────────────
 *
 * Porque o `localStorage` só existe depois de o JavaScript correr, e a
 * aparência tem de valer no PRIMEIRO PIXEL. Guardada no `localStorage`, o
 * caminho seria: o servidor manda claro, o browser pinta claro, o script lê a
 * preferência e troca para escuro — um clarão branco em cheio nos olhos de
 * quem escolheu escuro, todas as vezes.
 *
 * Um cookie é lido pelo servidor. O `layout.tsx` do grupo `(admin)` põe o
 * atributo no HTML que envia, e o CSS já o encontra lá. Zero clarão, zero
 * script inline a correr antes da pintura.
 *
 * ── E PORQUE É QUE O AUTOMÁTICO NÃO ESCREVE ATRIBUTO NENHUM ───────────────
 *
 * Porque o automático não é uma terceira cor: é a AUSÊNCIA de escolha. O CSS
 * declara `color-scheme: light dark` por omissão e o sistema operativo decide;
 * os dois atributos só existem para uma escolha explícita ganhar ao sistema.
 * Escrever `data-aparencia="auto"` seria um estado a mais a ter de ser
 * ignorado em todo o lado.
 */

/** Os três estados. `auto` é o de omissão e não escreve atributo nenhum. */
export type Aparencia = "auto" | "claro" | "escuro";

export const APARENCIAS: ReadonlyArray<{ id: Aparencia; rotulo: string }> = [
  { id: "auto", rotulo: "Automático" },
  { id: "claro", rotulo: "Claro" },
  { id: "escuro", rotulo: "Escuro" },
];

/** O nome do cookie. Num sítio só, para o servidor e o cliente não divergirem. */
export const COOKIE_APARENCIA = "bo-aparencia";

/** Um ano. A escolha de aparência não é uma sessão — é uma preferência. */
export const VALIDADE_APARENCIA_S = 60 * 60 * 24 * 365;

/**
 * Lê um valor vindo de fora (cookie, URL, o que for) e devolve sempre um dos
 * três. Qualquer coisa que não reconheça vale `auto`, que é o comportamento
 * correcto para um cookie corrompido ou de uma versão antiga.
 */
export function aparenciaValida(valor: string | undefined | null): Aparencia {
  return valor === "claro" || valor === "escuro" ? valor : "auto";
}

/**
 * O que vai para o atributo `data-aparencia`. `undefined` no automático, para
 * o atributo não chegar a existir — ver o bloco de cima.
 */
export function atributoDaAparencia(a: Aparencia): "claro" | "escuro" | undefined {
  return a === "auto" ? undefined : a;
}
