// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActivityEntry, Quote } from "@/lib/orcamento/types";
import type { DossierData } from "@/lib/orcamento/dossier";
import { __resetListCache } from "../../useCachedList";
import DossierClient from "./DossierClient";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CHAMADA REGISTADA QUE NUNCA CHEGOU AO SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O registo de atividade do Dossier escreve primeiro no ecrã e só depois manda
 * o PATCH. Quando o PATCH era recusado — uma sessão que expirou é o caso de
 * todos os dias, e 401 é a resposta — o `catch` estava vazio e o `if (res.ok)`
 * não tinha ramo nenhum do outro lado: a linha ficava no ecrã, o formulário
 * fechava-se, e nada dizia que aquilo não existia em lado nenhum.
 *
 * O que ela vê é uma chamada registada. O que fica gravado é nada — e só se dá
 * por isso ao recarregar a página, quando já ninguém se lembra do que dizia a
 * linha. É a mesma avaria que o registo de gravações existe para acabar,
 * escrita noutro sítio: dizer «guardado» sem o estar.
 */

// As ferramentas do Dossier chegam por `next/dynamic`; aqui só é preciso um
// ActivityLog que faça o que o verdadeiro faz — chamar `onAddEntry` e esperar.
vi.mock("../../lazy", () => ({
  ActivityLog: ({ onAddEntry }: { onAddEntry?: (e: ActivityEntry) => Promise<void> }) => (
    <button
      type="button"
      onClick={() =>
        void onAddEntry?.({
          id: "a1",
          at: "2026-08-13T09:00:00.000Z",
          kind: "call_logged",
          actor: "Equipa",
          summary: "Telefonema com a noiva sobre o arco da cerimónia",
        })
      }
    >
      registar chamada
    </button>
  ),
  PaymentsPanel: () => null,
  EventCosts: () => null,
  EventTasks: () => null,
  EventChecklist: () => null,
  ProductionPlan: () => null,
  EventTimeline: () => null,
  GuestList: () => null,
  ProposalStudio: () => null,
  ClientMessenger: () => null,
}));

const QUOTE = {
  id: "LIQ-1",
  name: "Ana Ribeiro",
  email: "ana@exemplo.pt",
  phone: "910000000",
  status: "aceite",
  submittedAt: "2026-01-10T10:00:00.000Z",
  date: "2026-08-20",
  quotedPrice: 10_000,
} as unknown as Quote;

const DADOS: DossierData = { quote: QUOTE, proposal: null, contract: null };

/** Responde à lista leve de propostas e devolve `estado` a qualquer PATCH. */
function servirPatch(status: number, corpo: unknown = { error: "Sessão expirada" }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Response(JSON.stringify(corpo), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("[]", { headers: { "content-type": "application/json" } });
    }),
  );
}

beforeEach(() => {
  __resetListCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar() {
  return render(
    <DossierClient data={DADOS} portalUrl="/pt/portal/abc" lang="pt" userName="Equipa" />,
  );
}

describe("Dossier — uma entrada do registo que o servidor recusa", () => {
  it("di-lo, com o que se escreveu, em vez de a dar por guardada", async () => {
    servirPatch(401);
    montar();

    await userEvent.click(screen.getByRole("button", { name: /registar chamada/i }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(/não ficou guardad/i);
    // Com o texto lá dentro: o formulário do registo já se fechou e limpou-se, e
    // sem estas palavras não há de onde as copiar.
    expect(aviso).toHaveTextContent(/arco da cerimónia/i);
  });

  it("«Tentar de novo» volta a mandá-la, e o aviso sai quando ela fica gravada", async () => {
    servirPatch(401);
    montar();
    await userEvent.click(screen.getByRole("button", { name: /registar chamada/i }));
    await screen.findByRole("alert");

    // Ela voltou a entrar; a mesma entrada segue outra vez.
    servirPatch(200, { ...QUOTE, activityLog: [] });
    await userEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("quando o servidor aceita, não fica aviso nenhum", async () => {
    servirPatch(200, { ...QUOTE, activityLog: [] });
    montar();

    await userEvent.click(screen.getByRole("button", { name: /registar chamada/i }));

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
