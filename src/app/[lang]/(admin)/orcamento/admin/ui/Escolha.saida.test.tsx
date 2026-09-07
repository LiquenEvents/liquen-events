// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Escolha } from "./Escolha";
import { SAIDA_MS } from "./saida";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LISTA SAI, E LARGA OS TOQUES NO PRIMEIRO FOTOGRAMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── PORQUE É QUE ESTE FICHEIRO EXISTE ──────────────────────────────────────
 *
 * Nasceu de um CONTROLO NEGATIVO que ficou VERDE. Reverti a saída da lista no
 * `Escolha.tsx` — troquei `aSair ? SAIDA : "bo-entrada"` por `"bo-entrada"` à
 * seca, ou seja tirei-lhe a `.bo-saida` inteira — e os dezanove testes de
 * teclado passaram todos na mesma. Ou seja: nada nesta casa estava a segurar a
 * metade do gesto que mais vezes se vê, porque uma lista abre-se uma vez e
 * fecha-se sempre.
 *
 * E não é uma questão de bonito. A `.bo-saida` traz o `pointer-events: none`
 * DENTRO da própria classe, aplicada no MESMO commit que marca a lista como a
 * sair — antes de o browser pintar o primeiro fotograma. Sem ela ficam 200 ms
 * de uma caixa quase transparente a apanhar os cliques do que está por baixo:
 * a pessoa carrega, não acontece nada, e não há sinal nenhum de porquê. É a
 * regra que já custou caro aqui (ver o `globals.css` e o `Toast`).
 *
 * ── O QUE SE PROVA AQUI E O QUE VAI PARA O BROWSER ─────────────────────────
 *
 * Aqui: que a classe certa está lá no desenho certo, que a lista deixa de ser
 * uma lista para quem ouve o ecrã no INSTANTE do gesto, e que o foco volta
 * antes dos 200 ms — não depois. O `pointer-events` a valer mesmo, e a
 * animação a correr, medem-se num browser (`e2e/escolha.spec.ts`): o jsdom não
 * corre `@keyframes` nenhuns nem sabe o que é uma folha de estilo aplicada.
 */

const OPCOES = [
  { valor: "a", rotulo: "Alta" },
  { valor: "b", rotulo: "Baixa" },
];

const botao = () => screen.getByRole("combobox", { name: "Prioridade" });
/** A lista a sair já não tem `role`, portanto procura-se pelo `aria-controls`
 *  que ela tinha — que é o mesmo `id` do princípio ao fim. */
const caixaDaLista = () => document.querySelector<HTMLElement>('[id$="-lista"]');

afterEach(cleanup);

function montar() {
  return render(<Escolha aria-label="Prioridade" valor="a" opcoes={OPCOES} aoMudar={() => {}} />);
}

describe("Escolha — a entrada e a saída são as palavras da casa", () => {
  it("entra com a `.bo-entrada` — 4 px, a distância de um item de menu", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(botao());
    expect(screen.getByRole("listbox").className).toContain("bo-entrada");
    expect(screen.getByRole("listbox").className).not.toContain("bo-saida");
  });

  it("ao fechar fica montada com a `.bo-saida`, e é ela que larga os toques", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(botao());
    await u.keyboard("{Escape}");

    const caixa = caixaDaLista();
    // Continua no DOM — é preciso haver o que animar.
    expect(caixa).not.toBeNull();
    // E traz a palavra da casa, que é onde o `pointer-events: none` vive.
    expect(caixa!.className).toContain("bo-saida");
    expect(caixa!.className).not.toContain("bo-entrada");
  });

  it("a sair, já não é uma lista para quem ouve o ecrã — no instante do gesto", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(botao());
    await u.keyboard("{Escape}");

    // Sem `role`, sem nome, fora do fio do teclado. Não daqui a 200 ms: já.
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    const caixa = caixaDaLista()!;
    expect(caixa).toHaveAttribute("aria-hidden", "true");
    expect(caixa.hasAttribute("inert")).toBe(true);

    // E o botão já não aponta para ela.
    expect(botao()).toHaveAttribute("aria-expanded", "false");
    expect(botao()).not.toHaveAttribute("aria-controls");
    expect(botao()).not.toHaveAttribute("aria-activedescendant");
  });

  it("o foco está no botão com a lista ainda a apagar-se — e a lista desaparece aos 200 ms", async () => {
    const u = userEvent.setup();
    montar();
    botao().focus();
    await u.keyboard("{ArrowDown}{Escape}");

    // Com a lista ainda montada a apagar-se, o foco já está no sítio.
    expect(caixaDaLista()).not.toBeNull();
    expect(document.activeElement).toBe(botao());

    // E passados os 200 ms a lista desaparece de vez — o nó não fica pendurado.
    await act(async () => {
      await new Promise((r) => setTimeout(r, SAIDA_MS + 50));
    });
    expect(caixaDaLista()).toBeNull();
  });
});

/**
 * ── A VARREDURA DO PRÓPRIO FICHEIRO ────────────────────────────────────────
 *
 * A varredura do back office (`duracao-com-guarda.test.ts`) já apanha uma
 * `duration-*` sem `motion-safe:` em qualquer ficheiro desta árvore. O que ela
 * NÃO vê são as duas armadilhas do Tailwind 4 que este componente pisa de
 * propósito, e que compilam as duas sem um aviso:
 *
 *  · `transition-[transform]` NÃO cobre `rotate` — no v4 a classe `rotate-180`
 *    emite a propriedade autónoma `rotate`, e só `transition-transform` (sem
 *    parênteses) a apanha, junto com `translate` e `scale`. Com os parênteses a
 *    seta salta a seco e ninguém percebe porquê. É a mesma avaria que o
 *    `movimento.ts` conta ter apanhado no `scale` do `Button`.
 *  · Um número de milissegundos escrito à mão fica de fora da subida dos tempos
 *    do vocabulário. A duração do giro sai do `ESTADO`, por leitura.
 */
describe("Escolha — o movimento vem do vocabulário, e não de números à mão", () => {
  const fonte = readFileSync(
    join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin/ui/Escolha.tsx"),
    "utf8",
  );
  /** Sem comentários: o que lá se cita é história, não código. */
  const codigo = fonte
    .replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");

  it("a seta vira-se com `scale`, que o `ESTADO` anima — e nunca com `rotate`", () => {
    // No Tailwind 4 `-scale-y-100` emite a propriedade autónoma `scale`, que
    // está na lista do `ESTADO`; `rotate-180` emitiria `rotate`, que NÃO está.
    // Trocar um pelo outro parece a mesma coisa e é a diferença entre a seta
    // acompanhar os 120 ms e saltar a seco com eles ao lado sem lhe tocarem.
    expect(codigo).toContain("-scale-y-100");
    expect(codigo, "`rotate-*` não é coberto pelo `ESTADO`").not.toMatch(/\brotate-\d/);
    expect(codigo, "a seta tem de andar na escala da casa").toMatch(
      /className=\{cn\("shrink-0 opacity-50", ESTADO/,
    );
  });

  it("não há uma única duração nem curva escrita à mão", () => {
    // Nem para LER: a cadeia `motion-safe:duration-` escrita aqui, ainda que
    // dentro de uma expressão regular, é um sítio onde amanhã alguém escreve um
    // número. É a regra que o `movimento.test.ts` desta pasta guarda — e que
    // esta primeira versão chumbou, com razão.
    const escritas = codigo.match(/duration-\[?\d*\w*\]?|ease-(in|out|linear)\b/g) ?? [];
    expect(escritas, `tempos/curvas à mão: ${escritas.join(" ")}`).toEqual([]);
  });

  /**
   * ── PORQUE É QUE ESTE É ESTÁTICO, E É UMA CONFISSÃO ──────────────────────
   *
   * «O foco volta ao botão no instante, nunca 200 ms depois» não se consegue
   * provar aqui a mexer no componente, e é preciso dizer porquê em vez de
   * fingir que sim: neste padrão o foco NUNCA SAI do botão — é o
   * `aria-activedescendant` que anda, e o único caminho que lhe tocava (o rato
   * a carregar numa opção) está travado no `onPointerDown`. Pus um
   * `setTimeout(…, 200)` à volta do `.focus()` como controlo negativo e os sete
   * testes ficaram VERDES, porque não havia foco nenhum para devolver.
   *
   * Ou seja: o requisito é verdade por CONSTRUÇÃO, e não por comportamento. O
   * que se pode prender é a construção — que ninguém volte a pôr o foco atrás
   * de um relógio no dia em que houver algo focável dentro da lista. O
   * comportamento está preso ao lado, no `Escolha.teclado.test.tsx`, que mede o
   * foco depois do Escape, depois do Enter e depois do rato.
   */
  it("o foco não volta atrás de um relógio", () => {
    expect(codigo).toContain("botaoRef.current?.focus()");
    expect(codigo, "o foco tem de ser devolvido no próprio gesto").not.toMatch(
      /setTimeout\([^;]*focus/,
    );
  });

  it("as classes de entrada e saída são as da casa, e vêm do `saida.ts`", () => {
    expect(codigo).toContain('"bo-entrada"');
    // O `SAIDA` importado, e não a cadeia copiada: é assim que se herda o que
    // lá mudar (a distância, a curva, o largar dos toques).
    expect(codigo).toMatch(/import \{[^}]*\bSAIDA\b[^}]*\} from "\.\/saida"/);
    expect(codigo).not.toMatch(/"bo-saida/);
  });
});
