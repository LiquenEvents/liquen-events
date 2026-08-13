// @vitest-environment jsdom
import { Component, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

/**
 * O QUE SE VÊ SE O PEDAÇO DE CÓDIGO NUNCA CHEGAR.
 *
 * As vistas do back office vêm em chunks, e um chunk que falha a chegar não é
 * uma hipótese teórica: é o Wi-Fi da quinta a cair a meio de um clique. O que
 * interessa aqui não é o erro — é o DEPOIS: a rede volta, ela volta à vista, e
 * ou o ecrã se recompõe ou ficou preso até alguém recarregar a página inteira.
 *
 * Este `next/dynamic` de mentira é honesto quanto ao que o verdadeiro faz por
 * dentro — `React.lazy` dentro de um `<Suspense>` — incluindo a parte que causa
 * o defeito: a promessa do `import()` fica guardada PARA SEMPRE, mesmo quando
 * rejeitou.
 */
vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: (
      load: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
      opts?: { loading?: React.ComponentType },
    ) => {
      const Adiado = React.lazy(load);
      const Fallback = opts?.loading;
      const C = (props: Record<string, unknown>) =>
        React.createElement(
          React.Suspense,
          { fallback: Fallback ? React.createElement(Fallback) : null },
          React.createElement(Adiado, props),
        );
      C.displayName = "MockDynamic";
      return C;
    },
  };
});

/** O limite de erro da rota, em pequeno: apanha e oferece o ecrã seguinte. */
class Limite extends Component<{ children: ReactNode }, { rebentou: boolean }> {
  state = { rebentou: false };
  static getDerivedStateFromError() {
    return { rebentou: true };
  }
  render() {
    return this.state.rebentou ? <p>A vista rebentou</p> : this.props.children;
  }
}

describe("uma vista cujo chunk não chegou", () => {
  beforeEach(() => {
    vi.resetModules();
    cleanup();
  });

  it("tem uma oportunidade nova ao voltar lá, em vez de ficar presa ao mesmo erro", async () => {
    const mod = await import("./lazy");

    let tentativas = 0;
    const load = vi.fn(async () => {
      tentativas += 1;
      // A primeira falha (rede em baixo); depois a rede volta.
      if (tentativas === 1) throw new Error("Loading chunk failed");
      return { default: () => <p>A vista a sério</p> };
    });
    const { View } = mod.splitView(load);

    const primeira = render(
      <Limite>
        <View />
      </Limite>,
    );
    await waitFor(() => expect(screen.getByText("A vista rebentou")).toBeTruthy());
    primeira.unmount();

    // Ela volta à vista. Sem isto, o mesmo erro voltava a ser desenhado sem
    // sequer se tocar na rede — para sempre, até recarregar a página.
    render(
      <Limite>
        <View />
      </Limite>,
    );
    await waitFor(() => expect(screen.getByText("A vista a sério")).toBeTruthy());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("uma vista que chega à primeira não paga nada por isto", async () => {
    const mod = await import("./lazy");
    const load = vi.fn(async () => ({ default: () => <p>A vista a sério</p> }));
    const { View } = mod.splitView(load);

    render(
      <Limite>
        <View />
      </Limite>,
    );
    await waitFor(() => expect(screen.getByText("A vista a sério")).toBeTruthy());
    expect(load).toHaveBeenCalledTimes(1);
  });
});
