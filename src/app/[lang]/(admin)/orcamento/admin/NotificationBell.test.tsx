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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DESAPARECER DA BARRA NÃO SE LÊ COMO AVARIA — LÊ-SE COMO «AINDA NÃO EXISTE»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O registo passou a levar o motivo, mas o ecrã continuava a fazer o mesmo nos
 * dois casos: com a rota em baixo o sino sumia-se, exactamente como quando o
 * servidor RESPONDE que as notificações não estão montadas. Duas situações
 * opostas com o mesmo desenho — e a que precisa de alguém é a que fica
 * invisível, com o motivo num sítio que ninguém no back office abre.
 *
 * O tratamento honesto é ficar e dizer que não se sabe: sem contagem, sem
 * estado, e com um clique que volta a perguntar. O que não se pode é afirmar
 * «bloqueadas» ou «desligadas», que ninguém aqui tem como saber.
 */
describe("NotificationBell — com a rota em baixo", () => {
  it("o sino fica na barra, calado, em vez de desaparecer", async () => {
    browserComPush();
    servidor({ "/api/push/subscribe": () => json({ error: "Erro" }, 500) });

    render(<NotificationBell />);

    const sino = await screen.findByRole("button");
    expect(sino.getAttribute("title")).toMatch(/não foi possível saber/i);
    // Não inventa um estado que não conhece.
    expect(sino.textContent).not.toMatch(/bloqueadas|ativas/i);
  });

  it("carregar volta a perguntar, em vez de mandar recarregar a página", async () => {
    browserComPush();
    let emBaixo = true;
    servidor({
      "/api/push/subscribe": () =>
        emBaixo
          ? json({ error: "Erro" }, 500)
          : json({ configured: true, publicKey: "BPuBlIcKeY" }),
    });

    render(<NotificationBell />);
    const sino = await screen.findByTitle(/não foi possível saber/i);
    emBaixo = false;
    await userEvent.click(sino);

    await waitFor(() => expect(screen.getByTitle(/Ativar notificações/i)).toBeTruthy());
  });
});

/**
 * A subscrição era mandada com `await fetch(…)` e mais nada — sem `res.ok`,
 * sem `catch`. Falhando o servidor, ela ficava só no navegador (que o servidor
 * não conhece, portanto nunca lhe manda nada) e o ecrã dizia na mesma
 * «Notificações ativadas neste dispositivo». A promessa mais fácil de
 * acreditar do painel, feita precisamente quando não se cumpre — e o preço
 * paga-se semanas depois, num pedido que entra sem avisar ninguém.
 */
describe("NotificationBell — ativar as notificações", () => {
  /** Um navegador que chega até ao fim da subscrição, para sobrar só o servidor. */
  function browserQueSubscreve() {
    vi.stubGlobal("navigator", {
      ...window.navigator,
      serviceWorker: {
        register: vi.fn(async () => ({
          pushManager: {
            subscribe: vi.fn(async () => ({ endpoint: "https://push.exemplo/abc" })),
          },
        })),
        ready: Promise.resolve({}),
      },
    });
    vi.stubGlobal("PushManager", class {});
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: vi.fn(async () => "granted"),
    });
  }

  /** O GET do arranque e o POST da subscrição são a mesma rota, e têm de
   *  poder falhar em separado. */
  function servidorPush(aoGuardar: () => Response) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        (init?.method ?? "GET") === "GET"
          ? json({ configured: true, publicKey: "BPuBlIcKeY" })
          : aoGuardar(),
      ),
    );
  }

  async function ativar() {
    render(<NotificationBell />);
    await userEvent.click(await screen.findByTitle(/Ativar notificações/i));
    await waitFor(() => expect(espia.avisos.length).toBeGreaterThan(0));
    return espia.avisos.at(-1)!;
  }

  it("uma subscrição que não ficou guardada não sai como «ativadas»", async () => {
    browserQueSubscreve();
    servidorPush(() => json({ error: "Erro interno" }, 500));

    const aviso = await ativar();
    expect(aviso.tipo).toBe("error");
    expect(aviso.texto).not.toMatch(/ativadas/i);
    expect(aviso.texto).toContain("guardar as notificações neste dispositivo");
    // E o botão volta ao gesto que resolve, em vez de ficar a dizer que está feito.
    expect(screen.getByTitle(/Ativar notificações/i)).toBeTruthy();
  });

  it("a sessão expirada manda entrar de novo, e não repetir", async () => {
    browserQueSubscreve();
    servidorPush(() => json({ error: "Não autenticado" }, 401));

    const aviso = await ativar();
    expect(aviso.texto).toMatch(/sessão expirou/i);
    expect(aviso.texto).toMatch(/volta a entrar/i);
  });

  it("e quando fica mesmo guardada, continua a dizer que ficou", async () => {
    browserQueSubscreve();
    servidorPush(() => json({ ok: true }));

    const aviso = await ativar();
    expect(aviso.tipo).toBe("success");
    expect(aviso.texto).toMatch(/ativadas neste dispositivo/i);
  });
});
