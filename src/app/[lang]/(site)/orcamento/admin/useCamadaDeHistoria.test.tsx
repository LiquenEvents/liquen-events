// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { MARCA_DA_CAMADA, useCamadaDeHistoria } from "./useCamadaDeHistoria";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O GESTO DE VOLTAR FECHA O QUE ESTÁ ABERTO — E NÃO O BACK OFFICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Do registo do audit, o primeiro dos oito bloqueios: «zero `pushState` em todo
 * o `src/` fora da galeria pública … no iPhone, deslizar da esquerda É o botão
 * de voltar, portanto isto acontece por acidente, a qualquer profundidade».
 *
 * O jsdom não tem gesto nenhum, mas tem o que interessa: `pushState`, e o
 * evento `popstate` que o gesto dispara. É contra esses dois que se prende o
 * contrato — quantas entradas se empilham, quem as tira, e quem NÃO as ouve.
 */

/**
 * A história é UMA por janela, e o jsdom dá a mesma a todos os testes do
 * ficheiro. Sem isto, o `back()` que o desmontar de um teste pede chegava a
 * meio do teste seguinte — e o que se via era um teste a falhar por causa do
 * anterior.
 */
beforeEach(async () => {
  await esperarUmTique();
  window.history.replaceState(null, "");
});
afterEach(async () => {
  cleanup();
  await esperarUmTique();
});

/** O jsdom anda na história numa tarefa sua; um tique de zero não a apanha. */
const esperarUmTique = () => new Promise((r) => setTimeout(r, 20));

/** Uma camada que se abre e se fecha, com o gancho ligado. */
function Camada({ aoFechar }: { aoFechar?: () => void }) {
  const [aberta, setAberta] = useState(true);
  useCamadaDeHistoria(aberta, () => {
    setAberta(false);
    aoFechar?.();
  });
  return (
    <button type="button" onClick={() => setAberta(false)}>
      {aberta ? "aberta" : "fechada"}
    </button>
  );
}

/**
 * O gesto de voltar do Safari, como o navegador o entrega.
 *
 * O jsdom implementa a história a sério: o `back()` anda uma entrada para trás e
 * dispara o `popstate` sozinho, numa tarefa seguinte — que é exactamente o que
 * o browser faz, e é essa assincronia que derrubou a primeira versão disto.
 */
const assentar = () => act(async () => void (await esperarUmTique()));
const gestoDeVoltar = async () => {
  window.history.back();
  await assentar();
};

describe("uma camada aberta", () => {
  it("empurra uma entrada na história", () => {
    const antes = window.history.length;
    render(<Camada />);
    expect(window.history.length).toBe(antes + 1);
    // O valor é o NÚMERO da camada — é por ele que uma camada sabe se a entrada
    // que acabou de ser consumida era a dela. Ver o cabeçalho do gancho.
    expect(typeof window.history.state?.[MARCA_DA_CAMADA]).toBe("number");
  });

  it("e o gesto de voltar fecha-a", async () => {
    const aoFechar = vi.fn();
    const { getByRole } = render(<Camada aoFechar={aoFechar} />);
    await gestoDeVoltar();
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(getByRole("button").textContent).toBe("fechada");
  });

  /**
   * FECHAR PELO BOTÃO TIRA A ENTRADA.
   *
   * Sem isto, fechar cinco folhas pelo «×» deixava cinco entradas mortas na
   * história, e o gesto de voltar passava a precisar de cinco repetições para
   * sair de facto do ecrã.
   */
  it("fechar pelo botão devolve a história ao estado em que estava", async () => {
    const antes = window.history.state;
    const { getByRole } = render(<Camada />);
    await act(async () => getByRole("button").click());
    await assentar();
    expect(window.history.state).toEqual(antes);
  });

  it("e o gesto NÃO pede um `back()` a mais — o navegador já o fez", async () => {
    const voltar = vi.spyOn(window.history, "back");
    render(<Camada />);
    voltar.mockClear();
    await gestoDeVoltar();
    // UM: o do próprio gesto. Um segundo, pedido por nós ao fechar, andava duas
    // entradas para trás com um só deslizar do polegar — e o que se via era a
    // folha a fechar e o ecrã a sair por baixo dela.
    expect(voltar).toHaveBeenCalledTimes(1);
    voltar.mockRestore();
  });

  it("desmontar sem fechar também não deixa a entrada para trás", async () => {
    const antes = window.history.state;
    const { unmount } = render(<Camada />);
    await act(async () => unmount());
    await assentar();
    expect(window.history.state).toEqual(antes);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ERRO CLÁSSICO: UMA CAMADA A FECHAR AS QUE ESTÃO POR BAIXO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `history.back()` que a camada de cima faz ao fechar-se dispara um
 * `popstate` — e as camadas ABAIXO também o ouvem. Sem defesa, um toque no «×»
 * de uma folha fechava a gaveta por baixo, e a vista por baixo dessa.
 */
describe("duas camadas empilhadas", () => {
  function Duas({ deBaixo, deCima }: { deBaixo: () => void; deCima: () => void }) {
    const [baixo, setBaixo] = useState(true);
    const [cima, setCima] = useState(true);
    useCamadaDeHistoria(baixo, () => {
      setBaixo(false);
      deBaixo();
    });
    useCamadaDeHistoria(cima, () => {
      setCima(false);
      deCima();
    });
    return (
      <button type="button" onClick={() => setCima(false)}>
        {baixo ? "baixo aberto" : "baixo fechado"}
      </button>
    );
  }

  it("fechar a de cima pelo botão não fecha a de baixo", async () => {
    const deBaixo = vi.fn();
    const deCima = vi.fn();
    const { getByRole } = render(<Duas deBaixo={deBaixo} deCima={deCima} />);

    await act(async () => {
      getByRole("button").click();
    });
    // O `back()` da de cima provoca um `popstate` que a de baixo OUVE. É este o
    // momento em que uma bandeira temporizada deixava o ecrã inteiro
    // desmontar-se: a de baixo pergunta se a entrada DELA ainda lá está, e está.
    await assentar();
    expect(deBaixo).not.toHaveBeenCalled();
    expect(getByRole("button").textContent).toBe("baixo aberto");
  });

  it("mas o gesto da pessoa continua a fechar uma camada", async () => {
    const deBaixo = vi.fn();
    const deCima = vi.fn();
    render(<Duas deBaixo={deBaixo} deCima={deCima} />);
    await gestoDeVoltar();
    // Um gesto fecha UMA camada: a de cima. As duas ouvem o mesmo evento — é o
    // preço de partilharem uma história — e é o número da entrada que decide
    // qual delas foi consumida.
    expect(deCima).toHaveBeenCalledTimes(1);
    expect(deBaixo).not.toHaveBeenCalled();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUANDO A CAMADA RECUSA FECHAR-SE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A gaveta de um pedido pergunta «tem alterações por guardar; descartar?» antes
 * de fechar. Quem responder «não» fica com ela aberta — mas a entrada da
 * história já foi consumida pelo gesto. Sem cuidado, a camada ficava aberta SEM
 * entrada, e o deslizar seguinte saía do back office: o mesmo defeito, agora só
 * a partir do segundo gesto e por isso ainda mais difícil de ver.
 */
describe("uma camada com guarda", () => {
  function ComGuarda({ deixar }: { deixar: () => boolean }) {
    const [aberta, setAberta] = useState(true);
    useCamadaDeHistoria(aberta, () => {
      if (deixar()) setAberta(false);
    });
    return <span>{aberta ? "aberta" : "fechada"}</span>;
  }

  it("o guarda corre com o gesto de voltar — que era o que nunca acontecia", async () => {
    const deixar = vi.fn(() => true);
    const { container } = render(<ComGuarda deixar={deixar} />);
    await gestoDeVoltar();
    expect(deixar).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("fechada");
  });

  it("e se ele recusar, a camada volta a ter entrada na história", async () => {
    const { container } = render(<ComGuarda deixar={() => false} />);
    await gestoDeVoltar();
    expect(container.textContent, "o guarda disse que não").toBe("aberta");

    // A prova: um SEGUNDO gesto tem outra vez uma entrada nossa para consumir.
    // Sem o rearmar, este gesto saía do back office.
    const marca = window.history.state?.[MARCA_DA_CAMADA];
    expect(typeof marca, "a camada ficou sem entrada na história").toBe("number");
  });
});
