// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Segmented } from "./Segmented";

/**
 * MUITOS SEGMENTOS CURTOS NÃO PODEM FAZER UMA PÍLULA DE DUAS LINHAS
 *
 * MEDIDO a 390 px na passagem de 9 de outubro: os seis filtros das Propostas
 * e os quatro períodos das Estatísticas partiam o controlo em duas linhas —
 * uma pílula larga e torta. O `flex-wrap` do `Segmented` existe para dois
 * rótulos compridos (os do IVA) e continua por omissão; quem tem muitos
 * segmentos pede `quebra="rolar"`, e o contentor rola com o dedo.
 *
 * O jsdom não faz disposição: o que se prende são as classes que a decidem e
 * o pedido para trazer o escolhido para dentro do ecrã.
 */

const OPCOES = [
  { value: "a", label: "Todas · 2" },
  { value: "b", label: "Enviada · 1" },
  { value: "c", label: "Aceite · 1" },
];

afterEach(cleanup);

describe("Segmented com `quebra`", () => {
  it("por omissão continua a quebrar para a linha de baixo", () => {
    render(<Segmented ariaLabel="Filtro" value="a" onChange={() => {}} options={OPCOES} />);
    expect(screen.getByRole("radiogroup").className).toContain("flex-wrap");
  });

  it("com `rolar` fica numa linha só e os rótulos não partem", () => {
    render(
      <Segmented
        ariaLabel="Filtro"
        value="a"
        onChange={() => {}}
        options={OPCOES}
        quebra="rolar"
      />,
    );
    const grupo = screen.getByRole("radiogroup");
    expect(grupo.className).toContain("flex-nowrap");
    expect(grupo.className).not.toContain("flex-wrap ");
    for (const b of screen.getAllByRole("radio")) {
      expect(b.className).toContain("whitespace-nowrap");
      expect(b.className).toContain("shrink-0");
    }
  });

  it("com `rolar`, mudar de segmento trá-lo para dentro do ecrã", () => {
    const visto = vi.fn();
    Element.prototype.scrollIntoView = visto;
    const { rerender } = render(
      <Segmented
        ariaLabel="Filtro"
        value="a"
        onChange={() => {}}
        options={OPCOES}
        quebra="rolar"
      />,
    );
    visto.mockClear();
    rerender(
      <Segmented
        ariaLabel="Filtro"
        value="c"
        onChange={() => {}}
        options={OPCOES}
        quebra="rolar"
      />,
    );
    expect(visto).toHaveBeenCalledWith({ inline: "nearest", block: "nearest" });
    expect(visto.mock.contexts[0]).toBe(screen.getByRole("radio", { name: "Aceite · 1" }));
  });

  it("os filtros das Propostas pedem `rolar`", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("src/app/[lang]/(admin)/orcamento/admin/Propostas.tsx", "utf8");
    const bloco = fonte.slice(fonte.indexOf('ariaLabel="Filtrar propostas por estado"'));
    expect(bloco.slice(0, 200)).toContain('quebra="rolar"');
  });
});
