// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Tarefas from "./Tarefas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA TAREFA CUJO TÍTULO SE LÊ A 11 % NÃO É UMA LISTA — É UM ENIGMA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO num telemóvel de 390×844, com o navegador, nesta lista:
 *
 *   · «Confirmar com a Herdade da Maridona a montagem da tenda…»
 *     mostrava **113 px** dos 1009 de que precisa — 11 %.
 *   · a segunda, 113 de 648 (17 %); a terceira, 113 de 276 (41 %).
 *   · o botão de concluir media **20×20 px**, dezasseis vezes na lista, SEM
 *     `alvo-toque` — e sem nome acessível nenhum.
 *
 * A causa era uma só: a linha de tabela do COMPUTADOR mantida a 390 px. Uma
 * fila `flex` que não quebra, com seis colunas a disputar 342 px, e o título —
 * o único com `min-w-0` — a ceder a todas. `truncate` fazia o resto.
 *
 * O QUE ESTE TESTE FIXA, e porque é assim que se escreve num DOM sem
 * disposição: o jsdom não mede nada, portanto não se pode afirmar «113 px».
 * Afirma-se o que PRODUZ os 113 px — o `truncate` incondicional — e o que os
 * desfaz: o título quebra linha no telemóvel e só corta a partir de `sm`.
 * A medição a sério fez-se no navegador, antes e depois; isto é a rede que
 * impede a volta atrás sem ninguém dar por ela.
 */

const LONGA = {
  id: "a",
  title:
    "Confirmar com a Herdade da Maridona a montagem da tenda na véspera e o acesso dos carros de carga",
  done: false,
  priority: "normal" as const,
  createdAt: "2026-08-10T09:00:00.000Z",
};

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta([LONGA])),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function montar() {
  render(
    <ToastProvider>
      <Tarefas />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText(LONGA.title)).toBeInTheDocument());
}

it("o título da tarefa quebra linha no telemóvel — só corta a partir de `sm`", async () => {
  await montar();
  const titulo = screen.getByText(LONGA.title);
  const classes = titulo.className.split(/\s+/);

  // `truncate` sem variante corta em TODAS as larguras — é ele que deixava o
  // título com 113 px num telemóvel. No computador a fila continua a ser uma
  // fila, e aí cortar é a decisão certa: por isso `sm:truncate`, não `truncate`.
  expect(
    classes,
    "o título não pode cortar no telemóvel: `truncate` tem de vir com variante (`sm:truncate`)",
  ).not.toContain("truncate");
  expect(classes).toContain("sm:truncate");
});

it("a caixa de concluir é uma caixa a sério, com nome e alvo de 44 px no dedo", async () => {
  await montar();

  /**
   * Duas coisas neste caso, e a primeira mudou.
   *
   * ERA um `<button aria-pressed>`. Passou a ser uma `<input
   * type="checkbox">` — «checkbox que não é `<input type="checkbox">`» está
   * nas proibições do documento dela. A diferença não é de gosto: um leitor de
   * ecrã lê «botão, premido» a um e «caixa de verificação, marcada» à outra, e
   * só a segunda diz o que aquilo é.
   *
   * O nome é o TÍTULO da tarefa e já não «Marcar como concluída»: numa lista
   * de dezasseis, dezasseis caixas com o mesmo nome não se distinguem — o que
   * distingue é a tarefa de que são.
   */
  const concluir = screen.getByRole("checkbox", { name: LONGA.title });

  // `alvo-toque` é o mínimo da casa (44×44, só sob `(pointer: coarse)` — ver
  // globals.css). O «Editar» e o «Eliminar» ao lado já o têm; este ficou de
  // fora, e é o vizinho deles. A classe está no `<label>` que envolve a caixa,
  // que é o que recebe o dedo.
  const alvo = concluir.closest("label");
  expect(
    alvo?.className.split(/\s+/),
    "o quadrado de concluir tem 20 px e vive entre dois alvos de 44",
  ).toContain("alvo-toque");
});
