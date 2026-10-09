// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * A GAVETA «MAIS DESTINOS» É UM DIÁLOGO A SÉRIO
 *
 * MEDIDO na passagem de 9 de outubro, num Chromium: era um `<aside>` sem
 * `role="dialog"` nem `aria-modal`, o foco ficava no botão que a abriu, e o
 * Tab passeava pelo fundo desfocado — Ajuda → Tudo guardado → Pesquisar →
 * Novo. E fechada, a sombra pintava ~40 px de cinzento no canto esquerdo de
 * todos os ecrãs.
 *
 * O que se prende aqui é o que o jsdom consegue ver: o papel, o foco que
 * entra, o fundo que sai da árvore, o véu que fecha e o foco que volta.
 */

/**
 * O duplo do `./lazy` — por PROCURAÇÃO, e não uma lista escrita à mão.
 *
 * Este caso monta o back office INTEIRO e percorre a coluna toda, portanto
 * qualquer vista pode ser pedida. Uma lista à mão desactualiza-se em silêncio:
 * a primeira versão deste ficheiro esqueceu o `FechosMeta` (que a vista das
 * Definições traz dentro) e rebentou com «No "FechosMeta" export is defined on
 * the "./lazy" mock» — um erro que não tem nada que ver com o que se mede.
 *
 * O `Proxy` devolve um duplo para o nome que lhe pedirem, e o `WARM_ORDER` (que
 * é um valor e não um componente) fica de fora à mão.
 */
vi.mock("./lazy", () => {
  const duplos = new Map<string, () => React.ReactElement>();
  return new Proxy({} as Record<string, unknown>, {
    get(_alvo, nome) {
      if (typeof nome !== "string" || nome === "then" || nome === "__esModule") return undefined;
      if (nome === "WARM_ORDER") return [];
      if (!duplos.has(nome)) {
        const C = () => <div data-testid={`view-${nome}`}>{nome} stub</div>;
        C.displayName = `Lazy(${nome})`;
        duplos.set(nome, C);
      }
      return duplos.get(nome);
    },
    has: () => true,
  });
});

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

const pedido = (): Quote =>
  ({
    id: "LQ-001",
    submittedAt: "2026-05-01T10:00:00.000Z",
    lastUpdated: "2026-05-01T10:00:00.000Z",
    status: "pendente",
    name: "Ana Marques",
    email: "ana@example.com",
    category: "particulares",
    eventType: "casamentos",
    date: "2026-09-20",
    location: "Évora",
    guests: 80,
  }) as Quote;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, headers: new Headers(), json: async () => [] })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montarEAbrir() {
  render(
    <ToastProvider>
      <AdminClient initialQuotes={[pedido()]} userName="Catarina" />
    </ToastProvider>,
  );
  const abridor = screen.getAllByRole("button", { name: "Mais destinos" })[0];
  abridor.focus();
  fireEvent.click(abridor);
  return abridor;
}

describe("a gaveta «Mais destinos»", () => {
  it("é um diálogo modal com nome enquanto está aberta", () => {
    montarEAbrir();
    const gaveta = screen.getByRole("dialog", { name: "Menu" });
    expect(gaveta.getAttribute("aria-modal")).toBe("true");
  });

  it("leva o foco para dentro", () => {
    montarEAbrir();
    const gaveta = screen.getByRole("dialog", { name: "Menu" });
    expect(gaveta.parentElement!.contains(document.activeElement)).toBe(true);
  });

  it("tira o fundo da árvore — a barra de baixo deixa de responder", () => {
    montarEAbrir();
    const barra = document.querySelector('[aria-label="Navegação do back office"]') as HTMLElement;
    expect(barra, "a barra de baixo").not.toBeNull();
    expect(barra.closest("[inert], [aria-hidden='true']")).not.toBeNull();
  });

  it("o véu fecha-a, e o foco volta a quem a abriu", () => {
    const abridor = montarEAbrir();
    const veu = document.querySelector(".bo-entrada-fundo.bg-black\\/60") as HTMLElement;
    expect(veu, "o véu da gaveta").not.toBeNull();
    fireEvent.click(veu);
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(document.activeElement).toBe(abridor);
  });

  it("fechada, não tem sombra a pintar o canto do ecrã", () => {
    render(
      <ToastProvider>
        <AdminClient initialQuotes={[pedido()]} userName="Catarina" />
      </ToastProvider>,
    );
    const gaveta = document.querySelector("aside.bo-material-faixa") as HTMLElement;
    expect(gaveta.className).toContain("shadow-none");
    expect(gaveta.className).not.toContain("shadow-[var(--bo-sombra-modal)]");
  });
});
