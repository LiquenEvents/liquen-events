// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SkeletonList, ViewSkeleton } from "./Skeleton";

/**
 * O esqueleto é a vista INTEIRA enquanto o chunk ou os dados não chegam. Quem
 * vê, vê barras a tremeluzir e percebe. Quem ouve não ouvia nada: o
 * `aria-label="A carregar"` estava numa `div` sem `role`, e uma `div` genérica
 * NÃO ACEITA nome — o rótulo era deitado fora pela árvore de acessibilidade e o
 * ecrã ficava mudo durante os segundos da espera. Sem saber que está a
 * carregar, o que resta é concluir que a página está avariada.
 *
 * A cura é uma região viva com TEXTO lá dentro: o nome de um `role="status"`
 * anuncia-se, mas o que os leitores de ecrã lêem a sério é o conteúdo.
 */

afterEach(cleanup);

describe("os esqueletos de carregamento", () => {
  it("a espera pelo CÓDIGO da vista é anunciada", () => {
    render(<ViewSkeleton />);
    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent(/A carregar/i);
    expect(aviso).toHaveAttribute("aria-busy", "true");
  });

  it("a espera pelos DADOS de uma lista é anunciada", () => {
    render(<SkeletonList rows={3} />);
    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent(/A carregar/i);
    expect(aviso).toHaveAttribute("aria-busy", "true");
  });
});
