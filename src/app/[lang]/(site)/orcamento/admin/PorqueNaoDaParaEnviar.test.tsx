// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PorqueNaoDaParaEnviar from "./PorqueNaoDaParaEnviar";
import type { Impedimento } from "@/lib/proposal-progress";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A RAZÃO TEM DE ESTAR NO ECRÃ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quando falta alguma coisa na proposta, quero que apareça um
 * aviso a dizer que não dá para enviar porque não preenchi tal coisa».
 *
 * A razão existia, e vivia no `title` do botão — uma bolha que só aparece com o
 * rato parado em cima, e que num iPhone não aparece de todo. Ela chegava ao
 * último ecrã, carregava, não acontecia nada, e não havia uma palavra a
 * explicar porquê.
 */

afterEach(cleanup);

const falta = (over: Partial<Impedimento> = {}): Impedimento => ({
  id: "nome",
  seccao: "evento",
  campo: "clientNames",
  texto: "Falta o nome dos clientes",
  trava: true,
  ...over,
});

describe("porque é que não dá para enviar", () => {
  it("nomeia o que falta, palavra por palavra", () => {
    render(
      <PorqueNaoDaParaEnviar
        faltas={[falta(), falta({ id: "servicos", texto: "A secção Serviços está vazia" })]}
        fotosPorConfirmar={0}
        onIr={vi.fn()}
      />,
    );
    expect(screen.getByText("Não dá para enviar: faltam 2 coisas.")).toBeTruthy();
    expect(screen.getByText("Falta o nome dos clientes")).toBeTruthy();
    expect(screen.getByText("A secção Serviços está vazia")).toBeTruthy();
  });

  it("uma falta só não se diz no plural", () => {
    render(<PorqueNaoDaParaEnviar faltas={[falta()]} fotosPorConfirmar={0} onIr={vi.fn()} />);
    expect(screen.getByText("Não dá para enviar: falta uma coisa.")).toBeTruthy();
  });

  /**
   * DIZER O QUE FALTA SEM DIZER ONDE É MEIA RESPOSTA.
   */
  it("cada linha salta para onde se preenche", () => {
    const onIr = vi.fn();
    const f = falta();
    render(<PorqueNaoDaParaEnviar faltas={[f]} fotosPorConfirmar={0} onIr={onIr} />);
    fireEvent.click(screen.getByText("Falta o nome dos clientes"));
    expect(onIr).toHaveBeenCalledWith(f);
  });

  /** Um conselho não trava nada, e não pode aparecer como se travasse. */
  it("os conselhos ficam de fora", () => {
    const { container } = render(
      <PorqueNaoDaParaEnviar
        faltas={[falta({ id: "capas", texto: "Sem imagens de capa", trava: false })]}
        fotosPorConfirmar={0}
        onIr={vi.fn()}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("com tudo preenchido não aparece nada", () => {
    const { container } = render(
      <PorqueNaoDaParaEnviar faltas={[]} fotosPorConfirmar={0} onIr={vi.fn()} />,
    );
    expect(container.textContent).toBe("");
  });

  /**
   * A ESPERA NÃO É UMA FALTA.
   *
   * Nada está por preencher: há fotografias a subir. Dizer «falta preencher»
   * mandava-a procurar um campo que já está preenchido.
   */
  it("fotografias a entrar dizem-se como espera, e não como falta", () => {
    render(<PorqueNaoDaParaEnviar faltas={[]} fotosPorConfirmar={2} onIr={vi.fn()} />);
    expect(screen.getByText(/Ainda há 2 fotografias a entrar/)).toBeTruthy();
    expect(screen.queryByText(/Não dá para enviar/)).toBeNull();
  });

  it("havendo faltas E fotos a entrar, as faltas é que se dizem", () => {
    // Resolver as fotos não desbloqueia nada enquanto o nome não estiver lá.
    render(<PorqueNaoDaParaEnviar faltas={[falta()]} fotosPorConfirmar={2} onIr={vi.fn()} />);
    expect(screen.getByText("Falta o nome dos clientes")).toBeTruthy();
    expect(screen.queryByText(/Ainda há 2 fotografias/)).toBeNull();
  });
});
