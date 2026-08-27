// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AdminLoading from "./loading";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESQUELETO TEM DE NASCER ONDE NASCE O QUE VEM A SEGUIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `<main>` público tem `pt-24` — 96 px — e o `globals.css` explica, por
 * extenso, porque é que o `padding-top: 0` da classe `admin-mode` saiu de lá
 * para o `className` de CADA raiz do back office: a classe só entra num efeito,
 * portanto o browser desenhava primeiro os 96 px e só depois os tirava, e o
 * back office inteiro saltava para cima. Valia 0,128 de CLS.
 *
 * Esta raiz ficou de fora — e é a PRIMEIRA que alguém vê, antes do painel e
 * antes do ecrã de entrada.
 *
 * ── ISTO GUARDAVA UM `-mt-24`, E AGORA GUARDA O CONTRÁRIO ─────────────────
 *
 * A classe existia para cancelar o `pt-24` do `<main>` do cromado do sítio, e
 * este teste exigia-a («cancela o `pt-24` do <main> público, como todas as
 * outras raízes»). Estava certo enquanto o back office viveu dentro do sítio.
 *
 * Com o back office no grupo `(admin)` não há cromado, não há `pt-24` — e o
 * `-mt-24` passou a subtrair 96 px a coisa nenhuma: a raiz começava a
 * `top: -96px`, com os primeiros 96 px do ecrã cortados. Agora o teste guarda
 * a decisão inversa: o esqueleto começa no zero, como a página que vem a
 * seguir. Se alguém repuser a margem negativa, o esqueleto volta a assentar
 * num sítio diferente do back office — e isto chumba.
 */
describe("o esqueleto do back office", () => {
  afterEach(cleanup);

  it("começa no zero — já não há `pt-24` nenhum para cancelar", () => {
    render(<AdminLoading />);
    expect(screen.getByRole("status")).not.toHaveClass("-mt-24");
  });

  it("continua a dizer que está a carregar a quem ouve o ecrã", () => {
    render(<AdminLoading />);
    const regiao = screen.getByRole("status");
    expect(regiao).toHaveAttribute("aria-busy", "true");
    expect(regiao).toHaveTextContent(/A carregar/i);
  });
});
