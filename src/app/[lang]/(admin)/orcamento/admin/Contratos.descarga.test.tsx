// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Contract } from "@/lib/contract-types";
import { __resetListCache } from "./useCachedList";
import { ToastProvider } from "./Toast";
import Contratos from "./Contratos";
import { contagemEmBytes } from "./ui/EmCurso";

/**
 * O PDF DO CONTRATO ERA UM `<a target=_blank>` SEM SINAL NENHUM.
 *
 * Passou pela descarga da casa (`ui/descarregar.ts`): o botão pede o ficheiro,
 * a barra conta os bytes contra o `Content-Length`, o ficheiro guarda-se com o
 * nome que a rota manda, e o fim diz «PDF pronto».
 */

const CONTRATO: Contract = {
  id: "ct-1",
  quoteId: "LQ-001",
  proposalId: "PR-001",
  clientName: "Ana e Rui",
  clientEmail: "ana@exemplo.pt",
  termsVersion: "2026-01",
  termsSnapshot: "Termos.",
  status: "aceite",
  createdAt: "2026-05-01T10:00:00.000Z",
  acceptedAt: "2026-05-12T14:30:00.000Z",
  acceptedName: "Ana Ribeiro",
  acceptedIp: "1.2.3.4",
} as Contract;

let soltar: (() => void) | null = null;
const guardados: string[] = [];

beforeEach(() => {
  __resetListCache();
  guardados.length = 0;
  vi.stubGlobal(
    "matchMedia",
    (mq: string) =>
      ({
        matches: /min-width/.test(mq),
        media: mq,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/pdf")) {
        // O corpo chega em dois pedaços, e o segundo só quando o teste deixa.
        const corpo = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new Uint8Array(400));
            soltar = () => {
              c.enqueue(new Uint8Array(600));
              c.close();
            };
          },
        });
        return new Response(corpo, {
          status: 200,
          headers: {
            "Content-Length": "1000",
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="contrato-ana-e-rui.pdf"',
          },
        });
      }
      return Response.json([CONTRATO]);
    }),
  );
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    guardados.push(this.download);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  soltar = null;
});

describe("descarregar o PDF de um contrato", () => {
  it("mostra a barra a contar, guarda com o nome da rota, e diz que está pronto", async () => {
    render(
      <ToastProvider>
        <Contratos />
      </ToastProvider>,
    );
    // Espera pela tabela: o `TabelaOuCartoes` desenha primeiro os cartões
    // (hidratação) e troca-os pela tabela no fotograma seguinte.
    await screen.findByRole("table", { name: "Contratos" });
    const pdf = screen.getByRole("button", { name: "PDF" });
    fireEvent.click(pdf);

    // A meio: a frase, a contagem em bytes e o botão ocupado.
    await waitFor(() => expect(screen.getByText("A descarregar o contrato em PDF…")).toBeTruthy());
    await waitFor(() => expect(screen.getByText(contagemEmBytes(400, 1000))).toBeTruthy());
    expect(pdf.getAttribute("aria-busy")).toBe("true");

    // O botão é o mesmo nó do princípio ao fim: o foco do teclado não se perde.
    expect(pdf.isConnected).toBe(true);
    soltar!();
    await waitFor(() => expect(screen.getByText("PDF pronto")).toBeTruthy());
    expect(guardados).toEqual(["contrato-ana-e-rui.pdf"]);
  });
});
