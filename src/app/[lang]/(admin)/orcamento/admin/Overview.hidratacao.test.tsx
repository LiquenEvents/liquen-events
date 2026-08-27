// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import type { Quote } from "@/lib/orcamento/types";
import Overview from "./Overview";
import { __resetListCache } from "./useCachedList";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ECRÃ DE ABERTURA REBENTAVA QUANDO OS PEDIDOS ERAM FRESCOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `/orcamento/admin`, Visão Geral, com leads de minutos. `pageerror` literal:
 *
 *     Error: Hydration failed because the server rendered text didn't match
 *     the client.
 *
 * com a diferença exacta no registo: `+ há 3min` / `- há 2min`.
 *
 * A Visão Geral é a ÚNICA vista desenhada no servidor à chegada (ver
 * `lazy.tsx`). O `timeAgo` lia `Date.now()` durante o desenho: o servidor
 * escreveu «há 3min» no HTML, a hidratação aconteceu um minuto depois e o
 * browser calculou «há 2min». O React não tem como saber qual está certo —
 * deita a árvore fora e desenha tudo outra vez. Medido: 3/25 com 5 leads
 * frescos, 2/20 noutra corrida com a CPU 8× mais lenta, e 0/25 quando os
 * pedidos já tinham horas. Ou seja: acontece precisamente quando ela abre o
 * back office ao receber um pedido.
 *
 * ── O QUE ESTES TESTES PRENDEM ─────────────────────────────────────────────
 *
 *  1. O HTML DO SERVIDOR NÃO DEPENDE DO RELÓGIO. É a causa, não o sintoma:
 *     desenhar a mesma Visão Geral às 10:00, às 21:30 e às 00:30 do dia
 *     seguinte tem de dar exactamente os mesmos bytes. Enquanto isso for
 *     verdade, não há relógio nenhum para os dois lados discordarem.
 *  2. A hidratação com o relógio JÁ ADIANTADO não recupera de erro nenhum —
 *     que é a forma directa de dizer «o React não deitou a árvore fora».
 *  3. E o valor não se perde: depois de hidratar, o tempo aparece, e é o do
 *     browser (o de quem está a olhar), não o do servidor.
 */

/** Um lead com três minutos — a idade que fazia o ecrã cair. */
const AGORA = new Date("2026-07-25T10:00:00.000Z");
const HA_TRES_MINUTOS = new Date(AGORA.getTime() - 3 * 60_000).toISOString();

const quotes = [
  {
    id: "q1",
    name: "Casamento da Ana",
    status: "pendente",
    guests: 80,
    category: "casamentos",
    submittedAt: HA_TRES_MINUTOS,
    lastUpdated: HA_TRES_MINUTOS,
    payments: [],
  },
] as unknown as Quote[];

const ecra = (
  <Overview
    quotes={quotes}
    userName="Rita"
    onOpen={() => {}}
    onGoStats={() => {}}
    onGo={() => {}}
    onNew={() => {}}
  />
);

const resposta = () => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: 'W/"vazio"' }),
  json: async () => [],
});

beforeEach(() => {
  vi.useFakeTimers({ now: AGORA, toFake: ["Date"] });
  localStorage.clear();
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta()),
  );
  // O `act` do React precisa de saber que está num ambiente de teste; aqui não
  // se usa o Testing Library (que o marcaria sozinho), porque o que se mede é
  // precisamente a HIDRATAÇÃO de HTML vindo do servidor.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

describe("Visão Geral — o HTML do servidor não pode depender do relógio", () => {
  it("desenhado a três horas diferentes, sai exactamente o mesmo", () => {
    vi.setSystemTime(AGORA);
    const asDez = renderToString(ecra);

    // Mais de meio dia depois: muda a saudação («Bom dia» → «Boa noite») e
    // muda a idade do pedido.
    vi.setSystemTime(new Date("2026-07-25T21:30:00.000Z"));
    const aNoite = renderToString(ecra);

    // E já do outro lado da meia-noite, que muda também a data por extenso.
    vi.setSystemTime(new Date("2026-07-26T00:30:00.000Z"));
    const madrugada = renderToString(ecra);

    expect(aNoite).toBe(asDez);
    expect(madrugada).toBe(asDez);
  });
});

describe("Visão Geral — hidratar com o relógio adiantado", () => {
  it("não deita a árvore fora: nenhum erro de hidratação com um lead fresco", async () => {
    vi.setSystemTime(AGORA);
    const html = renderToString(ecra);

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    // Dois minutos entre o desenho do servidor e a hidratação: é o intervalo
    // que o registo mostrava («+ há 3min» / «- há 2min»), e o que uma ligação
    // lenta ou uma CPU ocupada produz sozinha.
    vi.setSystemTime(new Date(AGORA.getTime() + 2 * 60_000));

    const recuperados: string[] = [];
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(container, ecra, {
        onRecoverableError: (erro) => recuperados.push(String(erro)),
      });
    });
    const gritos = [...recuperados, ...consola.mock.calls.map((c) => String(c[0]))].join("\n");
    consola.mockRestore();

    expect(gritos).not.toMatch(/[Hh]ydrat/);
    expect(gritos).not.toMatch(/didn't match/);
  });

  it("e o tempo aparece na mesma — com o relógio de quem está a olhar", async () => {
    vi.setSystemTime(AGORA);
    const html = renderToString(ecra);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    vi.setSystemTime(new Date(AGORA.getTime() + 2 * 60_000));
    await act(async () => {
      hydrateRoot(container, ecra);
    });

    // 3 minutos quando o servidor desenhou, 5 quando o browser hidratou: quem
    // manda é o relógio de quem está sentado à frente do ecrã.
    expect(container.textContent).toContain("há 5min");
    expect(container.textContent).not.toContain("há 3min");
  });
});
