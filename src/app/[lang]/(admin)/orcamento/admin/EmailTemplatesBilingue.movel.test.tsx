// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EmailTemplatesBilingue from "./EmailTemplatesBilingue";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ECRÃ DOS MODELOS A 390 px
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O back office usa-se no telemóvel — é lá que ela está, entre dois eventos,
 * quando decide mexer num texto. Um editor que só caiba num portátil é um
 * editor que só se usa ao fim do dia.
 *
 * O que estes testes prendem é o que o jsdom pode mesmo garantir: que TUDO
 * está lá e alcançável num ecrã estreito, que nada tem largura fixa maior do
 * que o ecrã, e que o menu de variáveis continua a separar quem recebe de quem
 * assina — que é a parte que não pode desaparecer para caber.
 */

const MODELOS = [
  {
    chave: "registo-formal",
    nome: "Registo formal",
    descricao: "O texto que já usas.",
    pt: { subject: "Proposta | Líquen", body: "<p>Olá {{cliente_nome}},</p>", updatedAt: "" },
    en: { subject: "", body: "", updatedAt: "" },
  },
  {
    chave: "curto",
    nome: "Curto",
    descricao: "Três linhas.",
    pt: { subject: "A Vossa proposta", body: "<p>Olá</p>", updatedAt: "" },
    en: { subject: "Your proposal", body: "<p>Hi</p>", updatedAt: "" },
  },
];

const PEDIDOS = [
  { id: "LQ-1", etiqueta: "Marta e João · 2026-09-12", idioma: "pt", semData: false },
  { id: "LQ-2", etiqueta: "Ana Pinto", idioma: "pt", semData: true },
];

const respostas = (url: string) => {
  if (url.startsWith("/api/email-templates/bilingues")) return MODELOS;
  if (url.startsWith("/api/email-templates/dados?pedido=")) {
    return { valores: { cliente_nome: "Marta", evento_data: "" }, idioma: "pt" };
  }
  if (url.startsWith("/api/email-templates/dados")) return { pedidos: PEDIDOS };
  if (url.startsWith("/api/email-templates/versoes")) return [];
  return {};
};

const fetchMock = vi.fn(async (url: string) => ({
  ok: true,
  status: 200,
  json: async () => respostas(String(url)),
}));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  // 390×844 — o telemóvel de referência da casa.
  window.innerWidth = 390;
  window.innerHeight = 844;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const montar = async () => {
  const r = render(
    <ToastProvider>
      <EmailTemplatesBilingue />
    </ToastProvider>,
  );
  await screen.findByLabelText(/assunto/i);
  return r;
};

describe("cabe num telemóvel de 390 px", () => {
  it("empilha por omissão e só divide em colunas nos ecrãs grandes", async () => {
    const { container } = await montar();
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.className).toContain("grid-cols-1");
    // As colunas só entram a partir de `lg`; a 390 px nunca chegam a valer.
    expect(raiz.className).toMatch(/lg:grid-cols-/);
  });

  it("nada tem largura fixa maior do que o ecrã", async () => {
    const { container } = await montar();
    for (const el of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
      const largura = el.style.width || el.style.minWidth;
      const px = /^(\d+)px$/.exec(largura ?? "");
      if (px) expect(Number(px[1])).toBeLessThanOrEqual(390);
    }
  });

  it("todos os grupos de controlos continuam alcançáveis", async () => {
    await montar();
    expect(screen.getByRole("tab", { name: /português/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /english/i })).toBeTruthy();
    expect(screen.getByLabelText(/assunto/i)).toBeTruthy();
    expect(screen.getByLabelText(/mensagem/i)).toBeTruthy();
    expect(screen.getByLabelText(/pedido a usar/i)).toBeTruthy();
    expect(screen.getByLabelText(/enviar um teste/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /histórico/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /só se NÃO houver data/i })).toBeTruthy();
  });

  it("as filas de botões embrulham em vez de empurrar o ecrã para o lado", async () => {
    const { container } = await montar();
    const filas = container.querySelectorAll(".flex.flex-wrap, .flex-wrap");
    expect(filas.length).toBeGreaterThan(3);
  });
});

describe("quem recebe e quem assina não se confundem", () => {
  it("«Quem assina» é um grupo à parte, com o seu título", async () => {
    await montar();
    // «Quem assina» aparece duas vezes de propósito: o TÍTULO do grupo e o
    // BOTÃO que insere a variável. O título é o `<p>`, não o botão.
    const titulos = screen.getAllByText("Quem assina").filter((el) => el.tagName === "P");
    expect(titulos).toHaveLength(1);
    expect(screen.getAllByText("Cliente").filter((el) => el.tagName === "P")).toHaveLength(1);
  });

  it("o botão de quem assina diz que nunca é o cliente", async () => {
    await montar();
    const botao = screen.getByRole("button", { name: "Quem assina" });
    expect(botao.getAttribute("title")).toMatch(/nunca o nome do cliente/i);
  });

  it("não há nenhum botão que ofereça um «nome» sem dono", async () => {
    await montar();
    expect(screen.queryByRole("button", { name: /^nome$/i })).toBeNull();
  });
});

describe("o que o ecrã diz sobre a língua", () => {
  it("marca o modelo que ainda não tem inglês", async () => {
    await montar();
    // O nome aparece na lista E no cabeçalho «A editar»; o da lista é o que
    // está dentro de um botão.
    const naLista = screen
      .getAllByText("Registo formal")
      .map((el) => el.closest("button"))
      .find(Boolean)!;
    expect(within(naLista).getByText(/sem EN/i)).toBeTruthy();
  });

  it("não promete traduzir — diz que o envio inglês não sai", async () => {
    const user = userEvent.setup();
    await montar();
    await user.click(screen.getByRole("tab", { name: /english/i }));
    await waitFor(() => expect(screen.getByText(/não recebe este modelo/i)).toBeTruthy());
    expect(screen.getByText(/não traduzimos o teu texto à máquina/i)).toBeTruthy();
  });
});

describe("os blocos condicionais", () => {
  it("um bloco mal fechado é apanhado antes de publicar", async () => {
    const user = userEvent.setup();
    await montar();
    const corpo = screen.getByLabelText(/mensagem/i);
    await user.clear(corpo);
    await user.type(corpo, "{{{{#se evento_data}}Olá");
    await waitFor(() => expect(screen.getByText(/por fechar/i)).toBeTruthy());
    expect((screen.getByRole("button", { name: /publicar/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
