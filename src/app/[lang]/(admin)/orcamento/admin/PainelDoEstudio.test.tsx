// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PainelDoEstudio, { type PaginaParaOPainel } from "./PainelDoEstudio";
import { CORTES } from "./ui/adaptativo";
import type { MoodBoard } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A TERCEIRA ZONA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Uma pré-visualização grande e fixa à direita, no espaço hoje vazio.»
 *
 * As duas afirmações que aqui se prendem são as que custam dinheiro se
 * falharem: o painel NÃO EXISTE onde não cabe (e por isso não se paga a
 * desenhá-lo), e o que ele mostra é a página que ela está a editar.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Um `matchMedia` que responde a partir de uma largura de verdade, e não de um
 * `true`/`false` combinado.
 *
 * A versão anterior dizia sempre que sim ou sempre que não, portanto o NÚMERO
 * do limiar nunca era afirmado — e era o número que estava errado: a medida
 * dizia 1536 e o corte da casa para «há espaço para um painel lateral» é o
 * `CORTES.largo`, 1440. Entre os dois o painel cabia e não aparecia.
 */
const aJanelaTem = (px: number) =>
  vi.stubGlobal("matchMedia", (q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q);
    return {
      matches: min ? px >= Number(min[1]) : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PERGUNTA MUDOU DE SÍTIO, E ESTE FICHEIRO COM ELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estes casos mediam a JANELA (`matchMedia`), porque era à janela que o painel
 * perguntava. Era essa a avaria: MEDIDO num Chromium, no painel que abre a
 * partir do cartão de um cliente, a janela tinha 2000 px e a caixa onde este
 * `<aside>` aterra tinha 712 — a coluna onde ela escreve ficava com 136 px.
 *
 * A decisão passou para quem desenha a fila, que é o único que sabe quanto ela
 * mede, e chega aqui já respondida na propriedade `cabe`. Os casos ficam, com a
 * mesma intenção: o que se guarda é que, quando NÃO cabe, não se desenha NADA —
 * nem escondido.
 */
const largura = (cabe: boolean) => aJanelaTem(cabe ? CORTES.largo : CORTES.largo - 1);

const board = (over: Partial<MoodBoard> = {}): MoodBoard =>
  ({ title: "Cerimónia", images: ["p/a.jpg", "p/b.jpg"], ...over }) as MoodBoard;

const paginas: PaginaParaOPainel[] = [
  { bi: 0, board: board({ title: "Cerimónia" }) },
  { bi: 1, board: board({ title: "Jantar" }) },
];

const desenhar = (over: Partial<React.ComponentProps<typeof PainelDoEstudio>> = {}) =>
  render(
    <PainelDoEstudio
      /* A decisão deixou de ser deste ficheiro: quem desenha a fila é que sabe
         quanto ela mede. Aqui diz-se «cabe» porque é o caso que se quer ver
         desenhado; o caso do «não cabe» tem o seu próprio teste no estúdio. */
      cabe
      paginas={paginas}
      urls={{ "p/a.jpg": "u/a", "p/b.jpg": "u/b" }}
      originais={{}}
      aspetos={{ "p/a.jpg": 1.5, "p/b.jpg": 0.7 }}
      onSaltar={() => {}}
      {...over}
    />,
  );

describe("o painel só existe onde cabe", () => {
  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("num ecrã estreito não desenha NADA — nem escondido", () => {
    // Um `hidden 2xl:block` esconde com CSS e o React desenha na mesma. Medido:
    // numa proposta no tecto do gerador isso chegou para o estúdio deixar de
    // responder. Quem trabalha num portátil não pode pagar o painel que não tem.
    const { container } = desenhar({ cabe: false });
    expect(container.firstChild).toBeNull();
  });

  it("quando cabe, desenha", () => {
    desenhar({ cabe: true });
    expect(screen.getByRole("complementary", { name: /o que vai sair/i })).toBeTruthy();
  });

  /**
   * ── O LIMIAR É UM NÚMERO SÓ, E É O DA CASA ─────────────────────────────
   *
   * Havia dois a discordar: a medida em JavaScript dizia 1536 e o `<aside>`
   * trazia `hidden 2xl:block`. Entre 1440 e 1536 — que é o portátil dela —
   * o painel montava-se (pagava-se o desenho das páginas) e ficava escondido
   * por CSS: o pior dos dois mundos.
   */
  it("aparece quando quem desenha a fila diz que cabe", () => {
    desenhar({ cabe: true });
    expect(screen.getByRole("complementary", { name: /o que vai sair/i })).toBeTruthy();
  });

  it("e um píxel abaixo do limiar não desenha NADA — nem escondido", () => {
    /* O limiar deixou de viver aqui: é `LARGURA_MINIMA_DA_FILA`, no
       `ProposalStudio`, medido na FILA e não na janela. O caso que este ficheiro
       guarda é o que continua a ser dele: com um «não cabe», não sai nada. */
    const { container } = desenhar({ cabe: false });
    expect(container.firstChild).toBeNull();
  });

  it("a 1440 não sobra CSS a escondê-lo — quem decide é a montagem", () => {
    // Um `hidden … 2xl:block` no `<aside>` era a segunda resposta à mesma
    // pergunta, e a errada: esconder por CSS é o que este ficheiro existe para
    // NÃO fazer. Quando o painel é desenhado, é porque cabe.
    desenhar({ cabe: true });
    const painel = screen.getByRole("complementary", { name: /o que vai sair/i });
    expect(painel.className.split(/\s+/)).not.toContain("hidden");
    expect(painel.className).not.toMatch(/\b(sm|md|lg|xl|2xl):/);
  });

  it("sem resposta nenhuma sobre a largura, não rebenta — não desenha", () => {
    // Acontece no servidor e em ambientes de teste. Um painel que rebentasse
    // por não saber a largura era pior do que não haver painel. O `cabe` por
    // omissão do lado de quem desenha a fila é `false` enquanto não houver
    // medida — «ainda não sei» lê-se como «não cabe», que é o lado seguro.
    vi.stubGlobal("matchMedia", undefined);
    const { container } = desenhar({ cabe: false });
    expect(container.firstChild).toBeNull();
  });
});

describe("o que o painel mostra", () => {
  /**
   * ── DOIS NÚMEROS COM O MESMO NOME ────────────────────────────────────────
   *
   * Palavras dela: «a contagem tem de bater certo».
   *
   * Este painel conta as páginas de INSPIRAÇÃO — as que mudam com o que ela faz
   * nesta secção —, e a vista de conjunto ao lado conta as folhas do DOCUMENTO.
   * Contarem coisas diferentes é de propósito; chamarem-lhes as duas «páginas»
   * é que punha dois números a discordar sobre a mesma proposta.
   */
  it("a inspiração que está a ser editada, e diz qual é de quantas", () => {
    largura(true);
    desenhar({ activa: 1 });
    expect(screen.getByText(/Inspiração 2 de 2/)).toBeTruthy();
    // E não se chama «página», que é o que a vista de conjunto conta.
    expect(screen.queryByText(/Página 2 de 2/)).toBeNull();
  });

  it("sem página activa, mostra a primeira em vez de nada", () => {
    // Abrir o estúdio e ver o painel vazio até tocar num board era um painel
    // que parece avariado.
    largura(true);
    desenhar();
    expect(screen.getByText(/Inspiração 1 de 2/)).toBeTruthy();
  });

  it("conta as inspirações ao vivo, e diz que é isso que conta", () => {
    largura(true);
    desenhar();
    expect(screen.getByText("2 inspirações")).toBeTruthy();
  });

  it("em «Todas», cada página leva ao sítio dela no editor", async () => {
    largura(true);
    const saltos: number[] = [];
    const user = userEvent.setup();
    desenhar({ onSaltar: (bi) => saltos.push(bi) });
    await user.click(screen.getByRole("tab", { name: "Todas" }));
    await user.click(screen.getByRole("button", { name: /Ir para a página 2: Jantar/ }));
    expect(saltos).toEqual([1]);
  });

  it("sem páginas nenhumas, diz o que vai acontecer em vez de ficar vazio", () => {
    largura(true);
    desenhar({ paginas: [] });
    expect(screen.getByText(/Ainda não há páginas de inspiração/i)).toBeTruthy();
  });
});
