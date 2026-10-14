// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "../Toast";
import { MoreMenu } from "../MoreMenu";
import { usePartilharMapa } from "./PartilharMapa";

/**
 * O «Partilhar» do mapa de mesas. Nada sai daqui: o `fetch`, o
 * `navigator.share` e o `window.open` são simulados. Prova-se o caminho de
 * cada linha — e que antes de pedir o PDF se grava o que está por gravar.
 */

const PEDIDO = {
  id: "q1",
  name: "TESTE Ana e Rui",
  date: "2099-06-20",
  email: "ana@exemplo.test",
} as Quote;

let antes: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let envios: Record<string, unknown>[];
let respostaAoEnvio: { status: number; json: unknown };
let descarregados: string[];

function Harness() {
  const p = usePartilharMapa({ pedido: PEDIDO, antes });
  return (
    <>
      <MoreMenu label="Partilhar" items={p.itens} />
      {p.folha}
    </>
  );
}

function abrir() {
  render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

async function escolher(user: ReturnType<typeof userEvent.setup>, linha: RegExp) {
  await user.click(screen.getByRole("button", { name: /Partilhar/ }));
  await user.click(await screen.findByRole("menuitem", { name: linha }));
}

beforeEach(() => {
  antes = vi.fn(async () => true);
  envios = [];
  respostaAoEnvio = { status: 200, json: { ok: true } };
  descarregados = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/mesas/q1/pdf") {
        return new Response(new Uint8Array([37, 80, 68, 70]), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="mapa-de-mesas-teste.pdf"',
          },
        });
      }
      if (url === "/api/mesas/q1/enviar") {
        envios.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return new Response(JSON.stringify(respostaAoEnvio.json), {
          status: respostaAoEnvio.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 404 });
    }),
  );
  vi.stubGlobal("open", vi.fn());
  URL.createObjectURL = vi.fn(() => "blob:teste");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    descarregados.push(this.download);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "canShare");
  Reflect.deleteProperty(navigator, "share");
});

describe("Partilhar o mapa de mesas", () => {
  it("o menu tem as quatro saídas", async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole("button", { name: /Partilhar/ }));
    for (const nome of [/Descarregar PDF/, /WhatsApp/, /Email/, /Imprimir/]) {
      expect(screen.getByRole("menuitem", { name: nome })).toBeTruthy();
    }
  });

  it("«Descarregar PDF» grava primeiro e descarrega com o nome do servidor", async () => {
    const user = userEvent.setup();
    abrir();
    await escolher(user, /Descarregar PDF/);
    await waitFor(() => expect(descarregados).toEqual(["mapa-de-mesas-teste.pdf"]));
    expect(antes).toHaveBeenCalled();
  });

  it("se não conseguiu gravar, não pede o PDF e di-lo", async () => {
    antes = vi.fn(async () => false);
    const user = userEvent.setup();
    abrir();
    await escolher(user, /Descarregar PDF/);
    expect(await screen.findByText(/ainda não ficou guardado/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("WhatsApp no telemóvel: o «Partilhar» do sistema, com o PDF anexado", async () => {
    const share = vi.fn(async (_d: ShareData) => {});
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    const user = userEvent.setup();
    abrir();
    await escolher(user, /WhatsApp/);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const dados = share.mock.calls[0]![0];
    expect(dados.files?.[0]?.name).toBe("mapa-de-mesas-teste.pdf");
    expect(dados.text).toMatch(/Mapa de mesas de TESTE Ana e Rui \(20\/06\/2099\)/);
    expect(descarregados).toEqual([]);
    expect(window.open).not.toHaveBeenCalled();
  });

  it("WhatsApp no computador: descarrega o PDF e abre o WhatsApp com a frase", async () => {
    const user = userEvent.setup();
    abrir();
    await escolher(user, /WhatsApp/);
    await waitFor(() => expect(window.open).toHaveBeenCalledTimes(1));
    expect(descarregados).toEqual(["mapa-de-mesas-teste.pdf"]);
    const url = vi.mocked(window.open).mock.calls[0]![0] as string;
    expect(url).toMatch(/^https:\/\/api\.whatsapp\.com\/send\?text=/);
    expect(decodeURIComponent(url)).toContain("Segue o PDF.");
    expect(await screen.findByText(/arrasta o ficheiro/)).toBeTruthy();
  });

  it("fechar o «Partilhar» do sistema sem escolher não é um erro", async () => {
    const aborto = Object.assign(new Error("cancelado"), { name: "AbortError" });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn(async () => {
        throw aborto;
      }),
    });
    const user = userEvent.setup();
    abrir();
    await escolher(user, /WhatsApp/);
    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(descarregados).toEqual([]);
    expect(screen.queryByText(/Não foi possível/)).toBeNull();
  });

  it("«Imprimir» abre o PDF no separador, depois de gravar", async () => {
    const user = userEvent.setup();
    abrir();
    await escolher(user, /Imprimir/);
    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith("/api/mesas/q1/pdf?ver=1", "_blank", "noopener"),
    );
    expect(antes).toHaveBeenCalled();
  });

  it("Email: vem com o do casal, muda-se, e segue com o que ela escreveu", async () => {
    const user = userEvent.setup();
    abrir();
    await escolher(user, /Email/);
    const para = await screen.findByLabelText("Para");
    expect((para as HTMLInputElement).value).toBe("ana@exemplo.test");
    await user.clear(para);
    await user.type(para, "quinta@exemplo.test");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(envios).toHaveLength(1));
    expect(envios[0]).toMatchObject({
      para: "quinta@exemplo.test",
      assunto: "Mapa de mesas — TESTE Ana e Rui",
    });
    expect(String(envios[0]!.mensagem)).toContain("mapa de mesas de TESTE Ana e Rui");
    expect(await screen.findByText("Mapa de mesas enviado para quinta@exemplo.test.")).toBeTruthy();
  });

  it("Email: um endereço errado não chega a sair", async () => {
    const user = userEvent.setup();
    abrir();
    await escolher(user, /Email/);
    const para = await screen.findByLabelText("Para");
    await user.clear(para);
    await user.type(para, "quinta");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("Esse email não parece certo.")).toBeTruthy();
    expect(envios).toHaveLength(0);
  });

  it("Email: sem SMTP no servidor, a folha fica aberta e diz que NÃO seguiu", async () => {
    respostaAoEnvio = {
      status: 503,
      json: { error: "O envio de email não está configurado neste servidor — o mapa NÃO seguiu." },
    };
    const user = userEvent.setup();
    abrir();
    await escolher(user, /Email/);
    await user.click(await screen.findByRole("button", { name: "Enviar" }));
    expect(await screen.findByText(/o mapa NÃO seguiu/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeTruthy();
    expect(screen.queryByText(/enviado para/)).toBeNull();
  });
});
