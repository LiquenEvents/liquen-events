// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityLog from "./ActivityLog";
import type { ActivityEntry, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A NOTA DA CHAMADA QUE DESAPARECIA COMO SE TIVESSE SIDO GRAVADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quem acaba de desligar o telefone escreve aqui o que combinou. O `submitEntry`
 * fazia `await onAddEntry(...)` e a seguir `setText("")` — sempre, acontecesse o
 * que acontecesse. E do outro lado, no `AdminClient`, o `appendActivity` era um
 * `if (res.ok)` com um `catch {}` vazio por baixo.
 *
 * Somadas, as duas coisas dão o pior desfecho possível: a rede cai, o servidor
 * não recebe nada, **e a caixa limpa-se à frente de quem escreveu** — sem um
 * aviso, sem o texto, sem maneira de saber que se perdeu. O que se combinou ao
 * telefone deixa de existir, e o histórico é precisamente o que se vai ler
 * meses depois para saber o que se disse a quem.
 *
 * A regra: **só se limpa o que ficou gravado.**
 */

afterEach(cleanup);

const PEDIDO = {
  id: "q1",
  name: "Ana Marques",
  submittedAt: "2026-01-02T10:00:00.000Z",
  activityLog: [],
} as unknown as Quote;

/** Escreve uma nota de chamada e submete-a. */
async function registarChamada(onAddEntry: (e: ActivityEntry) => Promise<boolean>) {
  render(<ActivityLog quote={PEDIDO} actor="Catarina" onAddEntry={onAddEntry} />);
  await userEvent.click(screen.getByRole("button", { name: /^chamada$/i }));
  const caixa = await screen.findByRole("textbox");
  await userEvent.type(caixa, "Ficou de confirmar o arco até sexta");
  await userEvent.click(screen.getByRole("button", { name: /^guardar$/i }));
  return caixa as HTMLTextAreaElement;
}

describe("ActivityLog — uma nota que não ficou gravada", () => {
  it("mantém o texto na caixa quando a gravação falha", async () => {
    const caixa = await registarChamada(async () => false);

    await waitFor(() =>
      expect(screen.getByRole("textbox")).toHaveValue("Ficou de confirmar o arco até sexta"),
    );
    expect(caixa.value).toBe("Ficou de confirmar o arco até sexta");
  });

  it("e limpa-a quando ficou", async () => {
    await registarChamada(async () => true);

    // A caixa fecha-se: a nota está no histórico e não há nada a repetir.
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("a entrada leva o tipo certo — uma chamada não é uma nota", async () => {
    const guardadas: ActivityEntry[] = [];
    await registarChamada(async (e) => {
      guardadas.push(e);
      return true;
    });

    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].kind).toBe("call_logged");
    expect(guardadas[0].actor).toBe("Catarina");
    expect(guardadas[0].summary).toBe("Ficou de confirmar o arco até sexta");
  });

  it("uma falha não grava a mesma nota duas vezes ao repetir", async () => {
    const guardadas: ActivityEntry[] = [];
    let passa = false;
    render(
      <ActivityLog
        quote={PEDIDO}
        actor="Catarina"
        onAddEntry={async (e) => {
          guardadas.push(e);
          return passa;
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^chamada$/i }));
    await userEvent.type(await screen.findByRole("textbox"), "Confirmar o arco");
    const submeter = screen.getByRole("button", { name: /^guardar$/i });

    await userEvent.click(submeter);
    // Falhou: o texto ficou, e é o mesmo texto que se volta a mandar.
    expect(screen.getByRole("textbox")).toHaveValue("Confirmar o arco");
    passa = true;
    await userEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(guardadas.map((e) => e.summary)).toEqual(["Confirmar o arco", "Confirmar o arco"]);
  });
});
