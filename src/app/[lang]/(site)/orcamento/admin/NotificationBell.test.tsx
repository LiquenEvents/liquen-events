// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA ROTA DE PUSH A REBENTAR NÃO PODE PARECER «NÃO ESTÁ CONFIGURADO»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O arranque do sino perguntava ao servidor se as notificações estão
 * configuradas e tratava QUALQUER desfecho da mesma maneira: um `catch` vazio
 * que punha o estado em «unconfigured», e um `res.json()` sem olhar ao
 * `res.ok`. Um 500 na rota, uma sessão expirada, o servidor em baixo — tudo
 * dava o mesmo: o sino desaparecia da barra, sem uma linha em lado nenhum.
 *
 * O percurso: ela abre o painel numa segunda-feira e o sino não está lá. Não há
 * erro, não há aviso, não há registo. A conclusão a que qualquer pessoa chega é
 * «isto ainda não está montado» — e a rota que rebentou fica a rebentar durante
 * semanas, enquanto os pedidos de orçamento entram sem avisar ninguém.
 *
 * A segunda metade do mesmo defeito está no botão «Ativas»: pedia o resumo,
 * lia o JSON sem olhar ao estado da resposta, e um 500 saía como «Sem novidades
 * para notificar agora» — a frase mais tranquilizadora do painel, dita
 * precisamente quando o sistema falhou.
 */

const espia = vi.hoisted(() => ({
  avisos: [] as { texto: string; tipo?: string }[],
}));

vi.mock("./Toast", () => ({
  useToast: () => ({
    toast: (texto: string, tipo?: string) => {
      espia.avisos.push({ texto, tipo });
    },
  }),
}));
vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import NotificationBell from "./NotificationBell";
import { log } from "@/lib/logger";

/** O que o registo de erro chegou a dizer, em texto corrido. */
function registado(): string {
  return JSON.stringify((log.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
}

/** Um browser com service worker e push — sem isto o sino nem tenta. */
function browserComPush(permissao: NotificationPermission = "default") {
  vi.stubGlobal("navigator", {
    ...window.navigator,
    serviceWorker: { register: vi.fn(), ready: Promise.resolve({}) },
  });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: permissao, requestPermission: vi.fn() });
}

/** Respostas por rota, para o arranque e o resumo poderem falhar em separado. */
function servidor(rotas: Record<string, () => Promise<Response> | Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const caminho = String(url).split("?")[0];
      const resposta = rotas[caminho];
      if (!resposta) throw new Error(`rota não simulada: ${caminho}`);
      return resposta();
    }),
  );
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  espia.avisos = [];
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NotificationBell — o arranque", () => {
  it("uma rota em erro deixa rasto, em vez de passar por «não configurado»", async () => {
    browserComPush();
    servidor({ "/api/push/subscribe": () => json({ error: "Erro" }, 500) });

    render(<NotificationBell />);

    await waitFor(() => expect(log.error).toHaveBeenCalled());
    expect(registado()).toContain("500");
  });

  it("o servidor em baixo também deixa rasto", async () => {
    browserComPush();
    servidor({
      "/api/push/subscribe": () => {
        throw new TypeError("Failed to fetch");
      },
    });

    render(<NotificationBell />);

    await waitFor(() => expect(log.error).toHaveBeenCalled());
  });

  it("mas «não está configurado» é uma resposta, e não uma avaria: nada a registar", async () => {
    // Sem chaves VAPID o servidor responde 200 a dizer que não está montado.
    // Registar isto como erro todos os dias treinava-nos a ignorar o registo.
    browserComPush();
    servidor({
      "/api/push/subscribe": () => json({ configured: false, publicKey: null }),
    });

    const { container } = render(<NotificationBell />);

    await waitFor(() => expect(container.querySelector("button")).toBeNull());
    expect(log.error).not.toHaveBeenCalled();
  });
});

describe("NotificationBell — o botão «Ativas»", () => {
  const arranqueOk = () => json({ configured: true, publicKey: "BPuBlIcKeY" });

  it("um resumo que rebenta não sai como «sem novidades»", async () => {
    browserComPush("granted");
    servidor({
      "/api/push/subscribe": arranqueOk,
      "/api/cron/reminders": () => json({ error: "Erro interno" }, 500),
    });

    render(<NotificationBell />);
    const botao = await screen.findByTitle(/Notificações ativas/);
    await userEvent.click(botao);

    await waitFor(() => expect(espia.avisos.length).toBeGreaterThan(0));
    expect(espia.avisos.at(-1)?.tipo).toBe("error");
    expect(espia.avisos.at(-1)?.texto).not.toMatch(/Sem novidades/);
    expect(log.error).toHaveBeenCalled();
  });

  it("um resumo que ninguém recebeu não sai como «enviado» nem como «sem novidades»", async () => {
    // O resumo TINHA coisas para dizer e nenhuma chegou a um aparelho — o
    // serviço de push recusou. É a diferença entre «não havia nada» e «havia e
    // não chegou», e é ela que decide se alguém vai ver o que entrou hoje.
    browserComPush("granted");
    servidor({
      "/api/push/subscribe": arranqueOk,
      "/api/cron/reminders": () =>
        json({ sent: 0, falhados: 2, summary: ["3 pedidos por responder"] }),
    });

    render(<NotificationBell />);
    const botao = await screen.findByTitle(/Notificações ativas/);
    await userEvent.click(botao);

    await waitFor(() => expect(espia.avisos.length).toBeGreaterThan(0));
    expect(espia.avisos.at(-1)?.tipo).toBe("error");
    expect(espia.avisos.at(-1)?.texto).not.toMatch(/Sem novidades/);
  });

  it("sem nada a dizer continua a dizer que não há nada", async () => {
    browserComPush("granted");
    servidor({
      "/api/push/subscribe": arranqueOk,
      "/api/cron/reminders": () => json({ sent: 0, reason: "nada a notificar" }),
    });

    render(<NotificationBell />);
    const botao = await screen.findByTitle(/Notificações ativas/);
    await userEvent.click(botao);

    await waitFor(() => expect(espia.avisos.length).toBeGreaterThan(0));
    expect(espia.avisos.at(-1)?.texto).toMatch(/Sem novidades/);
  });

  it("e um resumo entregue diz que foi entregue", async () => {
    browserComPush("granted");
    servidor({
      "/api/push/subscribe": arranqueOk,
      "/api/cron/reminders": () => json({ sent: 3, summary: ["3 pedidos por responder"] }),
    });

    render(<NotificationBell />);
    const botao = await screen.findByTitle(/Notificações ativas/);
    await userEvent.click(botao);

    await waitFor(() => expect(espia.avisos.length).toBeGreaterThan(0));
    expect(espia.avisos.at(-1)?.tipo).toBe("success");
  });
});
