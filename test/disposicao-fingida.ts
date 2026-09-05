/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS MEDIDAS QUE O jsdom NÃO TEM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O jsdom não faz disposição: `offsetParent` é sempre nulo, `offsetTop` e
 * companhia são sempre zero. Quem mede alguma coisa — as marcas que andam do
 * `Segmented`, da barra lateral e do índice do estúdio — fica indistinguível de
 * quem não mede nada. O filete da barra lateral já teve um teste de unidade que
 * morreu por isto e teve de virar passeio de Playwright; está contado em
 * `e2e/admin-views.spec.ts`.
 *
 * Este duplo NÃO devolve a disposição ao jsdom. Deixa cada elemento DECLARAR as
 * suas medidas num `data-*`, para que a CANALIZAÇÃO à volta delas — mede-se o
 * elemento certo? apaga-se a marca quando ele está escondido? o primeiro
 * fotograma anda? — possa ser posta à prova em segundos, em vez de esperar por
 * um browser. Onde é que a marca PÁRA continua a medir-se num browser: são
 * pixéis, e pixéis não se fingem.
 *
 * Regra de uso: `fingirDisposicao()` no teste, `reporDisposicao()` no
 * `afterEach`. Sem o segundo, os `offset*` fingidos ficam no protótipo e
 * contaminam todos os ficheiros que corram a seguir no mesmo processo.
 */

const OFFSETS = ["offsetLeft", "offsetTop", "offsetWidth", "offsetHeight", "offsetParent"] as const;

const originais = new Map<string, PropertyDescriptor | undefined>();

/**
 * Passa a ler `data-x`, `data-y`, `data-w` e `data-h` de cada elemento.
 * `data-escondido` põe o `offsetParent` a nulo — a convenção por onde os
 * medidores desta casa reconhecem «não está à vista».
 */
export function fingirDisposicao(): void {
  if (originais.size > 0) return;
  for (const nome of OFFSETS) {
    originais.set(nome, Object.getOwnPropertyDescriptor(HTMLElement.prototype, nome));
  }
  const definir = (nome: string, ler: (el: HTMLElement) => unknown) =>
    Object.defineProperty(HTMLElement.prototype, nome, {
      configurable: true,
      get(this: HTMLElement) {
        return ler(this);
      },
    });
  definir("offsetLeft", (el) => Number(el.dataset.x ?? 0));
  definir("offsetTop", (el) => Number(el.dataset.y ?? 0));
  definir("offsetWidth", (el) => Number(el.dataset.w ?? 0));
  definir("offsetHeight", (el) => Number(el.dataset.h ?? 0));
  definir("offsetParent", (el) => (el.dataset.escondido ? null : el.parentElement));
}

/** Devolve o protótipo ao que era. Obrigatório num `afterEach`. */
export function reporDisposicao(): void {
  for (const nome of OFFSETS) {
    const antes = originais.get(nome);
    if (antes) Object.defineProperty(HTMLElement.prototype, nome, antes);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[nome];
  }
  originais.clear();
}
