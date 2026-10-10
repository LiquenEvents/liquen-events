// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider, TOAST_ANULAR_MS } from "../Toast";
import { useAnular } from "./anular";

/**
 * O «Anular» da casa fica DEZ segundos no ecrã (`TOAST_ANULAR_MS`) — o dobro
 * e meio de um aviso comum. É o tempo que ela tem para dar pelo engano e
 * tocar; quatro segundos não chegavam para ler a frase e mover o dedo.
 */

function Disparador({ repor }: { repor: () => void }) {
  const anular = useAnular();
  return <button onClick={() => anular("Movido para Ganho.", repor)}>mover</button>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useAnular", () => {
  it("o tempo é de 10 s", () => {
    expect(TOAST_ANULAR_MS).toBe(10_000);
  });

  it("o aviso com «Anular» continua lá aos 9 s e vai-se depois dos 10 s", () => {
    render(
      <ToastProvider>
        <Disparador repor={() => {}} />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "mover" }));
    });
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(screen.getByRole("button", { name: "Anular" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });

  it("tocar em «Anular» corre o gesto ao contrário, uma vez", async () => {
    const repor = vi.fn();
    render(
      <ToastProvider>
        <Disparador repor={repor} />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "mover" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anular" }));
    });
    expect(repor).toHaveBeenCalledTimes(1);
  });
});
