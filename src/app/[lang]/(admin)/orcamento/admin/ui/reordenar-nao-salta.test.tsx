// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabelaOuCartoes } from "./TabelaOuCartoes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REORDENAR NÃO É SALTAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta primitiva serve CINCO vistas — Pedidos, Propostas, Contratos, Clientes e
 * Inventário. Uma alteração, cinco ecrãs; e um descuido, também.
 *
 * O defeito: carregar num cabeçalho reordena e as linhas saltam para a posição
 * nova entre dois fotogramas. As mesmas dez pessoas, noutra ordem, sem nada que
 * diga que foi a ORDEM que mudou e não o conteúdo que foi substituído.
 *
 * ── O QUE ESTE FICHEIRO GUARDA, E É MAIS O QUE NÃO ANIMA ──────────────────
 *
 * A entrada em si é uma linha de CSS que a casa já tinha (`.view-in`). O que se
 * perde na primeira refactorização distraída é a REGRA — e a regra é quase toda
 * feita de excepções deliberadas:
 *
 *   1. anima quando é a MESMA gente noutra ordem;
 *   2. NÃO anima ao filtrar, porque a procura filtra a cada tecla e uma entrada
 *      de 240 ms a cada 200 ms deixa a lista permanentemente a meio;
 *   3. NÃO anima na primeira montagem, porque quem apresenta o bloco é o ecrã
 *      que o traz, com a sua `.bo-cena`;
 *   4. NÃO anima a troca de hidratação (cartões → tabela), que é um artefacto
 *      de carregamento e não uma navegação;
 *   5. anima a troca com o ecrã vazio, nos dois sentidos, porque aí é mesmo
 *      outro ecrã dentro da mesma moldura;
 *   6. e nunca, em caso nenhum, REMONTA as linhas — o `key` é identidade.
 */

/**
 * Um `matchMedia` falso, com largura e com resposta ao `prefers-reduced-motion`.
 * O jsdom não tem nenhum: sem isto tudo dá `false` e a primitiva resolvia
 * sempre para telemóvel.
 */
function simularAparelho({ largura, calmo = false }: { largura: number; calmo?: boolean }) {
  vi.stubGlobal("matchMedia", (mq: string): MediaQueryList => {
    const min = /min-width:\s*(\d+)px/.exec(mq);
    const matches = min
      ? largura >= Number(min[1])
      : mq.includes("prefers-reduced-motion")
        ? calmo
        : mq.includes("pointer: coarse")
          ? largura < 640
          : mq.includes("hover: hover")
            ? largura >= 640
            : false;
    return {
      matches,
      media: mq,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

interface Pessoa {
  id: string;
  nome: string;
}

/** DE PROPÓSITO fora de ordem alfabética: se já estivessem ordenados, carregar
 *  no cabeçalho não mudava nada e o teste passava sem provar coisa nenhuma. */
const ITENS: Pessoa[] = [
  { id: "c", nome: "Carla e Diogo" },
  { id: "a", nome: "Ana e Bruno" },
  { id: "e", nome: "Eva e Filipe" },
];

const COLUNAS = [
  {
    chave: "nome",
    cabecalho: "Casal",
    celula: (p: Pessoa) => p.nome,
    ordenar: (a: Pessoa, b: Pessoa) => a.nome.localeCompare(b.nome, "pt"),
  },
];

const VAZIO = <p>Nenhum casal encontrado</p>;

function desenhar(props: Partial<React.ComponentProps<typeof TabelaOuCartoes<Pessoa>>> = {}) {
  return render(
    <TabelaOuCartoes
      itens={ITENS}
      chaveDe={(p) => p.id}
      colunas={COLUNAS}
      cartao={(p) => <span>{p.nome}</span>}
      legenda="Pedidos"
      {...props}
    />,
  );
}

/** O `<tbody>` da tabela do computador — o BLOCO que leva a entrada. */
async function corpoDaTabela(): Promise<HTMLElement> {
  return await waitFor(() => {
    const corpo = document.querySelector("tbody");
    if (!corpo) throw new Error("a tabela ainda não montou");
    return corpo as HTMLElement;
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a lista que se reordena", () => {
  it("entra por BLOCO quando é a mesma gente noutra ordem", async () => {
    simularAparelho({ largura: 1440 });
    desenhar();
    const corpo = await corpoDaTabela();
    expect(corpo.className, "não devia haver entrada nenhuma antes de reordenar").not.toContain(
      "view-in",
    );

    await userEvent.click(screen.getByRole("button", { name: /Casal/ }));

    await waitFor(() =>
      expect(
        corpo.className,
        "reordenar voltou a ser um salto entre dois fotogramas — o bloco não entra",
      ).toContain("view-in"),
    );
  });

  it("e a entrada é do BLOCO, nunca da linha", async () => {
    simularAparelho({ largura: 1440 });
    desenhar();
    await corpoDaTabela();
    await userEvent.click(screen.getByRole("button", { name: /Casal/ }));

    await waitFor(() => expect(document.querySelector("tbody")!.className).toContain("view-in"));
    // Cinquenta linhas a chegar uma a uma é a lentidão que o tecto do sexto
    // degrau existe para evitar (`EventTasks.tsx:400-402`).
    for (const linha of document.querySelectorAll("tbody tr")) {
      expect(linha.className, `uma linha ganhou entrada própria: ${linha.className}`).not.toContain(
        "view-in",
      );
      expect(linha.className).not.toContain("bo-cena");
    }
  });

  it("e o cabeçalho onde se carregou não se mexe — entra a resposta, não o botão", async () => {
    simularAparelho({ largura: 1440 });
    desenhar();
    await corpoDaTabela();
    await userEvent.click(screen.getByRole("button", { name: /Casal/ }));

    await waitFor(() => expect(document.querySelector("tbody")!.className).toContain("view-in"));
    const cabeca = document.querySelector("thead")!;
    expect(cabeca.className).not.toContain("view-in");
    expect(document.querySelector("table")!.className).not.toContain("view-in");
  });

  it("NÃO remonta as linhas: o `key` é identidade, não um gatilho de animação", async () => {
    simularAparelho({ largura: 1440 });
    desenhar();
    await corpoDaTabela();
    const antes = screen.getByText("Ana e Bruno").closest("tr");

    await userEvent.click(screen.getByRole("button", { name: /Casal/ }));
    await waitFor(() => expect(document.querySelector("tbody")!.className).toContain("view-in"));

    const depois = screen.getByText("Ana e Bruno").closest("tr");
    expect(
      depois,
      "a linha foi remontada — perde-se o rolo, a selecção e o foco de quem estava a ler",
    ).toBe(antes);
  });

  it("com movimento reduzido não se anima nada", async () => {
    simularAparelho({ largura: 1440, calmo: true });
    desenhar();
    const corpo = await corpoDaTabela();
    await userEvent.click(screen.getByRole("button", { name: /Casal/ }));

    await waitFor(() => expect(screen.getAllByRole("row").length).toBe(4));
    expect(corpo.className, "quem pediu para não animar levou animação").not.toContain("view-in");
  });
});

describe("o que NÃO leva entrada", () => {
  it("a primeira montagem — quem apresenta o bloco é o ecrã que o traz", async () => {
    simularAparelho({ largura: 1440 });
    desenhar();
    const corpo = await corpoDaTabela();
    expect(
      corpo.className,
      "duas entradas encaixadas: a `.bo-cena` do ecrã mais esta — 20 px e dois desvanecimentos",
    ).not.toContain("view-in");
  });

  it("a troca de hidratação: os cartões passam a tabela sem animação nenhuma", async () => {
    // O primeiro desenho é SEMPRE a forma de telemóvel — é o que impede o
    // desencontro de hidratação (`adaptativo.ts`) — e no computador troca para
    // a tabela no desenho seguinte. Os dois acontecem dentro do mesmo `act()`
    // do `render`, portanto a `<ul>` intermédia não é observável daqui; o que
    // se observa é o RESULTADO da troca, que é o que interessa: a árvore mudou
    // toda e nem uma chave mudou.
    simularAparelho({ largura: 1440 });
    desenhar();
    const corpo = await corpoDaTabela();
    expect(
      corpo.className,
      "animou-se um artefacto de hidratação — um salto de um fotograma virou 240 ms",
    ).not.toContain("view-in");
  });

  /**
   * O caso que faltava, e que a rede não apanhava.
   *
   * Os dois testes acima filtram encolhendo a lista, e o comprimento sozinho
   * já os separa de uma reordenação. Mas há um filtro que NÃO muda o
   * comprimento: trocar «Ana» por «Eva» na procura deixa três linhas na mesma,
   * com gente diferente. Aí só a pergunta «entrou alguém de novo?» distingue
   * as duas coisas — e essa cláusula não tinha um único teste a defendê-la.
   *
   * Verifiquei-o a sério: apagando-a, a suite inteira continuava verde.
   */
  it("filtrar sem encolher: mesmo número de linhas, gente diferente — não anima", async () => {
    simularAparelho({ largura: 1440 });
    const { rerender } = desenhar();
    const corpo = await corpoDaTabela();

    // Três linhas antes, três linhas depois: só o «e» saiu e o «g» entrou.
    rerender(
      <TabelaOuCartoes
        itens={[ITENS[0], ITENS[1], { id: "g", nome: "Gabriela e Hugo" }]}
        chaveDe={(p) => p.id}
        colunas={COLUNAS}
        cartao={(p) => <span>{p.nome}</span>}
        legenda="Pedidos"
      />,
    );

    await waitFor(() => expect(screen.getAllByRole("row").length).toBe(4));
    expect(
      corpo.className,
      "o comprimento não mudou, portanto a guarda dos comprimentos deixa passar: " +
        "sem a pergunta «entrou alguém?», um filtro é lido como uma reordenação e a " +
        "lista volta a entrar a cada letra escrita",
    ).not.toContain("view-in");
  });

  it("filtrar: outra gente entra e sai, e a lista NÃO pisca a cada tecla", async () => {
    simularAparelho({ largura: 1440 });
    const { rerender } = desenhar();
    const corpo = await corpoDaTabela();

    // Uma tecla escrita na procura: a lista encolhe.
    rerender(
      <TabelaOuCartoes
        itens={[ITENS[0], ITENS[1]]}
        chaveDe={(p) => p.id}
        colunas={COLUNAS}
        cartao={(p) => <span>{p.nome}</span>}
        legenda="Pedidos"
      />,
    );

    await waitFor(() => expect(screen.getAllByRole("row").length).toBe(3));
    expect(
      corpo.className,
      "a lista volta a entrar a cada letra escrita — nunca chega à opacidade 1 e fica ilegível " +
        "exactamente enquanto se procura",
    ).not.toContain("view-in");
  });
});

describe("a troca com o ecrã vazio", () => {
  it("é outro ecrã dentro da mesma moldura, e entra nos DOIS sentidos", async () => {
    simularAparelho({ largura: 1440 });
    const { rerender } = desenhar({ vazio: VAZIO });
    await corpoDaTabela();

    const semResultados = (
      <TabelaOuCartoes
        itens={[]}
        chaveDe={(p: Pessoa) => p.id}
        colunas={COLUNAS}
        cartao={(p: Pessoa) => <span>{p.nome}</span>}
        legenda="Pedidos"
        vazio={VAZIO}
      />
    );
    rerender(semResultados);

    const embrulho = await waitFor(() => {
      const no = screen.getByText("Nenhum casal encontrado").parentElement;
      if (!no) throw new Error("o estado vazio não montou");
      return no;
    });
    await waitFor(() =>
      expect(
        embrulho.className,
        "a lista foi substituída pelo estado vazio de uma vez, sem transição nenhuma",
      ).toContain("view-in"),
    );

    // E ao apagar a letra a lista volta — a mesma troca ao contrário.
    rerender(
      <TabelaOuCartoes
        itens={ITENS}
        chaveDe={(p) => p.id}
        colunas={COLUNAS}
        cartao={(p) => <span>{p.nome}</span>}
        legenda="Pedidos"
        vazio={VAZIO}
      />,
    );
    const corpo = await corpoDaTabela();
    await waitFor(() =>
      expect(corpo.className, "o regresso à lista continua a ser um corte seco").toContain(
        "view-in",
      ),
    );
  });
});

describe("no telemóvel", () => {
  it("é a `<ul>` que entra — o mesmo bloco, a mesma palavra", async () => {
    simularAparelho({ largura: 375 });
    const { rerender } = desenhar();
    const lista = await waitFor(() => screen.getByRole("list", { name: "Pedidos" }));
    expect(lista.className).not.toContain("view-in");

    // No telemóvel não há cabeçalhos: quem reordena é a barra de cima, e o que
    // chega cá é a mesma gente noutra ordem.
    rerender(
      <TabelaOuCartoes
        itens={[ITENS[1], ITENS[0], ITENS[2]]}
        chaveDe={(p) => p.id}
        colunas={COLUNAS}
        cartao={(p) => <span>{p.nome}</span>}
        legenda="Pedidos"
      />,
    );

    await waitFor(() =>
      expect(lista.className, "a lista do telemóvel reordena-se aos saltos").toContain("view-in"),
    );
  });
});
