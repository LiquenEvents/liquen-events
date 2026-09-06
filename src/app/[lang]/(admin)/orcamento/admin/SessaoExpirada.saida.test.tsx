// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { RegistoDeGravacoesProvider } from "./registo-de-gravacoes";
import SessaoExpirada from "./SessaoExpirada";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A BARREIRA DA SESSÃO TAMBÉM SE LEVANTA — não desaparece
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este painel é a única superfície da casa desenhada SEM saída: o fundo não
 * fecha, não há «×», e é de propósito — com a sessão morta, tudo o que se fizer
 * por trás falha em silêncio. A única forma de sair é reautenticar.
 *
 * E era exactamente por isso que o corte doía mais aqui do que em qualquer
 * outro sítio: a pessoa acaba de escrever a palavra-passe e, no fotograma
 * seguinte, o ecrã preto que cobria tudo simplesmente não está. O que se lê é
 * «a página trocou», e não «a barreira levantou-se».
 *
 * ── E ISTO RESOLVE-SE DENTRO DO PRÓPRIO FICHEIRO ──────────────────────────
 *
 * O `AdminClient` monta `<SessaoExpirada />` sem props nenhumas e nunca o
 * desmonta: quem abre e fecha é o estado interno, portanto quem segura o nó os
 * 200 ms também é ele. Zero linhas do lado do pai.
 *
 * ── PORQUE É QUE ESTE FICHEIRO USA RELÓGIO A SÉRIO ────────────────────────
 *
 * Porque o gesto que fecha isto é uma volta ao servidor — escrever a senha e
 * carregar em Enter. O que se prende não é o número 200: é a ORDEM. No instante
 * em que a barreira deixa de ser um diálogo (o `role` cai, o foco volta, a
 * página destranca) o nó AINDA está no DOM. Se o fecho continuasse a ser seco,
 * as duas coisas aconteciam no mesmo instante e a primeira asserção rebentava.
 */

let respostas: number[] = [];

function montar() {
  return render(
    <ToastProvider>
      <RegistoDeGravacoesProvider>
        <textarea defaultValue="o parágrafo que estava a ser escrito" aria-label="Rascunho" />
        <SessaoExpirada />
      </RegistoDeGravacoesProvider>
    </ToastProvider>,
  );
}

/** Abre a barreira da única maneira que ela abre: um 401 numa rota do back
 *  office, apanhado pelo embrulho do `fetch` que o painel põe. */
async function abrirBarreira() {
  montar();
  respostas = [401];
  await fetch("/api/tarefas");
  return await screen.findByRole("dialog");
}

const classes = (el: Element) => el.className.split(/\s+/).filter(Boolean);

beforeEach(() => {
  respostas = [];
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const status = respostas.shift() ?? 200;
      return { ok: status < 400, status, json: async () => ({}) } as unknown as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a barreira levanta-se em vez de desaparecer", () => {
  it("fica montada a apagar-se depois de a sessão voltar", async () => {
    const u = userEvent.setup();
    const caixa = await abrirBarreira();
    // Controlo negativo: enquanto está lá, é uma barreira a sério.
    expect(classes(caixa)).toContain("bo-entrada");
    expect(classes(caixa)).not.toContain("bo-saida");
    expect(caixa.hasAttribute("inert")).toBe(false);

    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(document.querySelector('input[name="password"]')!, "uma-senha-qualquer{Enter}");

    // O `role` cai no instante do fecho — para quem ouve o ecrã, isto acabou.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    /* E ESTA É A LINHA QUE FALHAVA ANTES: o nó ainda está no DOM, a apagar-se.
       Com o fecho seco, o `role` e o nó iam-se embora no mesmo fotograma. */
    expect(caixa.isConnected).toBe(true);
    expect(classes(caixa)).toContain("bo-saida");
    expect(classes(caixa)).not.toContain("bo-entrada");
    expect(caixa.getAttribute("aria-hidden")).toBe("true");
    expect(caixa.hasAttribute("inert")).toBe(true);

    // E depois vai-se mesmo embora, sozinha.
    await waitFor(() => expect(caixa.isConnected).toBe(false));
  });

  it("o véu apaga-se com ela, e o trabalho por trás nunca saiu do sítio", async () => {
    const u = userEvent.setup();
    const caixa = await abrirBarreira();
    const veu = caixa.previousElementSibling as HTMLElement;
    expect(classes(veu)).toContain("bo-entrada-fundo");
    expect(classes(veu)).not.toContain("bo-saida");

    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(document.querySelector('input[name="password"]')!, "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(classes(veu)).toContain("bo-saida");
    expect(classes(veu)).toContain("bo-saida-fundo");
    // O MESMO nó: a saída parte da opacidade em que ele está.
    expect(veu.isConnected).toBe(true);
    // E a promessa antiga continua de pé: nada por trás foi desmontado.
    expect(screen.getByLabelText("Rascunho")).toHaveValue("o parágrafo que estava a ser escrito");
  });
});

/**
 * ── O TESTE QUE IMPEDE UM TOQUE DE SE PERDER ──────────────────────────────
 *
 * Aqui isto é o defeito mais caro possível. A moldura é um `fixed inset-0` a
 * `z-110`: cobre o back office INTEIRO. E a pessoa acabou de reautenticar
 * precisamente para poder voltar a carregar em qualquer coisa — se a barreira a
 * apagar-se continuasse a comer os toques, os 200 ms a seguir à senha certa
 * eram 200 ms em que o back office não responde, sem sinal nenhum de porquê.
 */
describe("a barreira a levantar-se não apanha um único toque", () => {
  it("a moldura larga-os no mesmo instante em que o painel deixa de ser painel", async () => {
    const u = userEvent.setup();
    const caixa = await abrirBarreira();
    const moldura = caixa.parentElement as HTMLElement;
    // Controlo negativo: enquanto a barreira está de pé, ela cobre o ecrã e
    // apanha tudo — é isso que a torna uma barreira.
    expect(moldura.className).toContain("inset-0");
    expect(classes(moldura)).not.toContain("pointer-events-none");

    await u.type(screen.getByLabelText(/O teu email/i), "catarina@liquen-events.com");
    await u.type(document.querySelector('input[name="password"]')!, "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // No mesmo fotograma em que deixa de ser um diálogo, larga os toques — e
    // continua no ecrã, que é o que faz este teste medir alguma coisa.
    expect(classes(moldura)).toContain("pointer-events-none");
    expect(caixa.isConnected).toBe(true);
  });
});
