import { screen, within } from "@testing-library/react";

/**
 * O mínimo de que isto precisa: alguém que saiba carregar.
 *
 * Tipado assim, e não em `UserEvent`, porque os ficheiros desta casa usam as
 * DUAS formas do `user-event` — a instância do `userEvent.setup()` e a API
 * directa do módulo — e as duas assinaturas de `keyboard()` não coincidem
 * (uma devolve `void`, a outra devolve o estado). Pedir só o `click` aceita as
 * duas sem cast nenhum pelo caminho.
 */
interface QuemCarrega {
  click(elemento: Element): Promise<unknown>;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESCOLHER NUM CAMPO QUE JÁ NÃO É UM `<select>`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O back office trocou a caixa do sistema operativo pelo `ui/Escolha` (a razão
 * está no cabeçalho desse ficheiro). Com isso, `user.selectOptions(...)` e
 * `campo.value` deixaram de servir: o controlo é um `role="combobox"` que abre
 * uma `role="listbox"` nossa, e um botão não tem `value`.
 *
 * Estas duas funções são a tradução, num sítio só. Existem para que a mudança
 * não deixe atrás de si dezassete maneiras diferentes de carregar num campo —
 * que é como um dia metade dos testes deixa de medir o que diz medir.
 *
 * ── E PORQUE É QUE NÃO SÃO SÓ DOIS CLIQUES ─────────────────────────────────
 *
 * Porque há dois enganos fáceis a evitar:
 *
 *  · **A lista fica montada 200 ms depois de fechar**, a apagar-se (a
 *    `.bo-saida`). Nesse intervalo já não tem `role`, portanto procurar a opção
 *    por `getAllByRole` é seguro — mas procurar por TEXTO não é: encontrava
 *    duas. Por isso aqui procura-se sempre por papel.
 *  · **O visto (`✓`) faz parte do texto da opção escolhida.** Comparar textos
 *    à bruta dava «✓Confirmado» e não «Confirmado». O `valorVisivel` tira-o.
 */

/** Abre o campo e escolhe a opção com este rótulo. */
export async function escolher(
  u: QuemCarrega,
  campo: HTMLElement,
  rotulo: string | RegExp,
): Promise<void> {
  await u.click(campo);
  const lista = screen.getByRole("listbox");
  await u.click(within(lista).getByRole("option", { name: rotulo }));
}

/** O que o campo mostra fechado — o equivalente ao `select.value` de antes,
 *  só que é o RÓTULO e não o valor (é o que está no ecrã). */
export function valorVisivel(campo: HTMLElement): string {
  return (campo.textContent ?? "").replace("✓", "").trim();
}
