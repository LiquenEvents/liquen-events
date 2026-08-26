// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { DesistirDaEdicao } from "./DesistirDaEdicao";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A SAÍDA DE UMA EDIÇÃO EM LINHA, PARA QUEM NÃO TEM TECLADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Do registo do audit, e é um dos oito bloqueios: «uma edição em linha começada
 * não se consegue abandonar: a única saída é o Escape … num telemóvel não há
 * Escape. Tocou-se por engano na hora errada, escreveu-se "1" a mais, e a
 * partir daí não há gesto nenhum que devolva o valor anterior».
 */

afterEach(cleanup);

/** Uma linha como as do guião do dia: grava ao perder o foco. */
function LinhaEditavel({ gravar, desistir }: { gravar: () => void; desistir: () => void }) {
  const [aEditar, setAEditar] = useState(true);
  if (!aEditar) return <span>fechado</span>;
  return (
    <span>
      <input
        autoFocus
        aria-label="Editar hora"
        onBlur={() => {
          gravar();
          setAEditar(false);
        }}
      />
      <DesistirDaEdicao
        onDesistir={() => {
          desistir();
          setAEditar(false);
        }}
        oQue="a hora"
      />
    </span>
  );
}

describe("desistir de uma edição", () => {
  /**
   * O DEFEITO INVISÍVEL QUE ISTO EVITA.
   *
   * Sem `preventDefault` no `pointerdown`, pousar o dedo tira o foco ao campo,
   * o `onBlur` GRAVA, o campo fecha, e o clique aterra onde já não há botão
   * nenhum. Ou seja: o botão de desistir gravaria — e o que se vê é o valor
   * errado a ficar lá, sem explicação.
   */
  it("pousar o dedo não tira o foco ao campo", () => {
    const gravar = vi.fn();
    render(<LinhaEditavel gravar={gravar} desistir={vi.fn()} />);
    const botao = screen.getByRole("button", { name: /Desistir de editar a hora/ });

    const evento = fireEvent.pointerDown(botao);
    // `fireEvent` devolve `false` quando o `preventDefault` foi chamado.
    expect(evento, "o `pointerdown` tem de ser travado").toBe(false);
    expect(gravar, "o campo não podia ter perdido o foco").not.toHaveBeenCalled();
  });

  it("e o clique desiste, sem gravar", () => {
    const gravar = vi.fn();
    const desistir = vi.fn();
    render(<LinhaEditavel gravar={gravar} desistir={desistir} />);
    fireEvent.click(screen.getByRole("button", { name: /Desistir de editar a hora/ }));
    expect(desistir).toHaveBeenCalledTimes(1);
    expect(gravar).not.toHaveBeenCalled();
    expect(screen.getByText("fechado")).toBeTruthy();
  });

  /** Sete linhas escritas precisam de dizer a QUEM se aplicam. */
  it("diz de que campo está a desistir", () => {
    render(<DesistirDaEdicao onDesistir={vi.fn()} oQue="o responsável" />);
    expect(screen.getByRole("button", { name: "Desistir de editar o responsável" })).toBeTruthy();
  });

  /** É um alvo de dedo: é para isso que existe. */
  it("é um alvo de toque", () => {
    render(<DesistirDaEdicao onDesistir={vi.fn()} oQue="a hora" />);
    expect(screen.getByRole("button").className).toContain("alvo-toque");
  });
});
