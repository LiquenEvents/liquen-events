import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESCOLHER NUMA `Escolha`, NOS TESTES — E O ERRO DE LEITURA QUE ISTO EVITA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A `Escolha` TROCA DE FORMA depois de montar. Sem JavaScript sai um `<select>`
 * nativo, para o campo funcionar na mesma; com o React montado torna-se o
 * combobox do padrão APG — `role="combobox"` num `<button>`.
 *
 * Isso tem uma consequência que já custou cinco tentativas num teste desta
 * casa: **em modo de botão não há `<option>` nenhuma na árvore** até a lista
 * ser aberta (a `Escolha` sem `name` não guarda um `<select>` escondido ao
 * lado). Um `user.selectOptions(...)` rebenta com «não encontrei nenhuma
 * option», e a leitura fácil — «o campo desapareceu» — está errada: o campo
 * está lá, mudou de forma.
 *
 * O `<select>` é o estado TRANSITÓRIO; o botão é o destino. Este ajudante
 * espera pelo destino, abre, e escolhe por PAPEL — que é o que a Catarina faz
 * com o rato.
 *
 * ── PELO RÓTULO, E NÃO PELO VALOR ────────────────────────────────────────
 *
 * `selectOptions` escolhia por `value` («empresas»). Uma lista aberta não tem
 * valores à vista: tem palavras. Quem migra um teste troca o valor pelo rótulo
 * — e o teste fica a dizer o que ela vê, que é melhor teste.
 */
export async function escolher(
  user: UserEvent,
  controlo: HTMLElement,
  rotulo: RegExp | string,
): Promise<void> {
  // Antes da hidratação (ou com `nativoNoToque`) ainda é um `<select>`: aí o
  // caminho nativo é o certo, e é o que o browser faria.
  if (controlo.tagName === "SELECT") {
    const opcao = within(controlo)
      .getAllByRole("option")
      .find((o) =>
        typeof rotulo === "string" ? o.textContent === rotulo : rotulo.test(o.textContent ?? ""),
      );
    if (!opcao) throw new Error(`não há opção «${rotulo}» neste <select>`);
    await user.selectOptions(controlo, opcao as HTMLOptionElement);
    return;
  }
  await user.click(controlo);
  await user.click(await screen.findByRole("option", { name: rotulo }));
}
