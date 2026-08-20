// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NavEstudio from "./NavEstudio";
import type { EstadoSeccao, Impedimento } from "@/lib/proposal-progress";

/**
 * O índice do estúdio: onde estou, o que já está feito, e — desde agora — o que
 * falta traduzir em cada secção.
 *
 * O painel «Por traduzir» já lista tudo, mas vive no passo do ENVIO, que é o
 * último sítio onde se olha. A meio de escrever a pergunta é outra: «desta
 * secção, o que é que ainda falta?».
 */

afterEach(cleanup);

const seccoes: EstadoSeccao[] = [
  { id: "evento", titulo: "Evento", preenchida: true, resumo: "Ana e Rui" },
  { id: "servicos", titulo: "Serviços", preenchida: true, resumo: "2 grupos" },
  { id: "orcamento", titulo: "Orçamento", preenchida: true, resumo: "3 linhas" },
];

const faltas: Impedimento[] = [];

describe("o contador de traduções em falta", () => {
  it("diz quantas faltam, secção a secção", () => {
    render(
      <NavEstudio seccoes={seccoes} faltas={faltas} porTraduzir={{ servicos: 2, orcamento: 1 }} />,
    );
    expect(screen.getByText("2 traduções em falta")).toBeTruthy();
    // Uma só diz-se no singular: «1 traduções» é a marca de um contador que
    // ninguém releu.
    expect(screen.getByText("1 tradução em falta")).toBeTruthy();
  });

  it("cala-se nas secções sem faltas", () => {
    render(<NavEstudio seccoes={seccoes} faltas={faltas} porTraduzir={{ servicos: 2 }} />);
    // Um `0` ao lado de cinco secções é uma fila de zeros a dizer que não há
    // nada a fazer.
    expect(screen.queryByText(/0 traduções/)).toBeNull();
    expect(screen.getAllByText(/traduç(ão|ões) em falta/)).toHaveLength(1);
  });

  it("numa proposta portuguesa não aparece de todo", () => {
    // O estúdio só passa a contagem com a proposta a sair em inglês — é a mesma
    // condição do painel «Por traduzir». Sem a propriedade, o índice é o que
    // sempre foi.
    render(<NavEstudio seccoes={seccoes} faltas={faltas} />);
    expect(screen.queryByText(/em falta/)).toBeNull();
    // CONTROLO POSITIVO: o índice está MESMO desenhado — senão «não aparece»
    // era verdade por não haver índice nenhum.
    expect(screen.getByText("Serviços")).toBeTruthy();
  });
});
