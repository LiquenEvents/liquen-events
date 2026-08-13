// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getDictionary, pickChromeDict } from "@/lib/i18n";
import { QUOTE_EVENT_OPTIONS } from "@/lib/orcamento/data";
import ConfirmacaoClient from "./ConfirmacaoClient";
import { CONFIRMACAO_PHOTOS } from "./photos";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O ECRÃ DE CONFIRMAÇÃO DE QUEM ENVIOU SEM EMAIL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * O formulário passou a aceitar pedidos só com telemóvel, que é o que o
 * servidor sempre aceitou. Isso traz aqui uma pessoa nova: a que não vai
 * receber a confirmação automática, porque a confirmação automática vai por
 * email e ela não deixou nenhum.
 *
 * A página dizia-lhe «Recebemos o seu pedido», e a lista de próximos passos
 * prometia-lhe uma proposta detalhada POR EMAIL. Ficava a vigiar uma caixa de
 * correio onde nunca chega nada, e a primeira coisa que pensa ao fim de dois
 * dias é que o pedido se perdeu.
 */
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/ads-conversion", () => ({ reportLeadConversion: vi.fn() }));

const dict = getDictionary("pt");
const tc = dict.confirmacao;
const ID = "LIQ-AAA-1";

const BLUR = Object.fromEntries(
  Object.keys(CONFIRMACAO_PHOTOS).map((k) => [k, "data:image/webp;base64,AAAA"]),
) as Record<keyof typeof CONFIRMACAO_PHOTOS, string>;

/** O que o formulário deixa em sessionStorage ao saltar para esta página. */
function comPedido(form: Record<string, unknown>) {
  sessionStorage.setItem(
    `liquen-quote-${ID}`,
    JSON.stringify({
      id: ID,
      status: "pendente",
      submittedAt: new Date().toISOString(),
      name: "Ana Dias",
      category: "particulares",
      eventType: "casamentos",
      date: "2027-05-15",
      guests: 80,
      location: "Sintra",
      notes: "Um jardim, ao fim da tarde.",
      ...form,
    }),
  );
  render(
    <LocaleProvider locale="pt" dict={pickChromeDict(dict)}>
      <ConfirmacaoClient
        id={ID}
        confirmacao={tc}
        eventTypeLabels={dict.orcamento.eventTypeLabels}
        blur={BLUR}
      />
    </LocaleProvider>,
  );
  // Um só tipo de evento chega para o teste; a lista existe para o índice.
  expect(QUOTE_EVENT_OPTIONS.length).toBeGreaterThan(0);
}

beforeEach(() => {
  sessionStorage.clear();
  // O jsdom não tem IntersectionObserver, e o `AnimateIn` desta página cria um.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("confirmação de um pedido sem email", () => {
  it("diz-lhe que não vai receber a confirmação por escrito", () => {
    comPedido({ email: "", phone: "912345678" });
    expect(screen.getByText(tc.semEmailNotaPlural)).toBeInTheDocument();
  });

  it("e a lista de passos deixa de prometer uma proposta por email", () => {
    comPedido({ email: "", phone: "912345678" });
    expect(screen.getByText(tc.stepPropostaSemEmail)).toBeInTheDocument();
    expect(screen.queryByText(tc.steps[1].desc)).toBeNull();
  });

  it("quem deixou email não lê nada disto, e a promessa mantém-se", () => {
    comPedido({ email: "ana@exemplo.pt", phone: "912345678" });
    expect(screen.queryByText(tc.semEmailNota)).toBeNull();
    expect(screen.queryByText(tc.semEmailNotaPlural)).toBeNull();
    expect(screen.getByText(tc.steps[1].desc)).toBeInTheDocument();
  });

  it("o registo segue o do resto da página: um casamento fala no plural", () => {
    // A nota é dita ao casal, como tudo o resto desta página.
    comPedido({ email: "", phone: "912345678", eventType: "aniversarios" });
    expect(screen.getByText(tc.semEmailNota)).toBeInTheDocument();
  });
});
