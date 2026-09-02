// Registers the jest-dom matchers (toBeInTheDocument, toHaveTextContent, …)
// on Vitest's `expect`. Safe under the default `node` environment too — it only
// extends the assertion library; the DOM-touching matchers are used solely by
// the component tests that opt into jsdom via `// @vitest-environment jsdom`.
import "@testing-library/jest-dom/vitest";

/**
 * `scrollIntoView`, que o jsdom não implementa.
 *
 * O back office leva o utilizador ao sítio em vários caminhos — o índice dos
 * mood boards, o aviso de ortografia, a conferência —, e todos chamam isto. Sem
 * o esboço, o teste rebenta com um `TypeError` dentro de um efeito e o erro que
 * se lê não tem nada a ver com o que se está a medir.
 *
 * Um esboço vazio e não um espião: o que interessa a estes testes é o que
 * acontece A SEGUIR ao salto (o foco, o campo certo), e não que a página tenha
 * mesmo rolado — coisa que num DOM sem disposição não quer dizer nada.
 */
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
