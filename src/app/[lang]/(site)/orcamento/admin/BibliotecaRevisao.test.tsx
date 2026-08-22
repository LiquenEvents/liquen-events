// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import BibliotecaRevisao from "./BibliotecaRevisao";
import { ToastProvider } from "./Toast";

/**
 * A revisão em lote é o par obrigatório da migração: ela deixa 55 fotos sem
 * tipo (a pasta "Terracotta" nunca soube dizer se a foto é um bouquet), e é
 * aqui que isso se arruma. O que estes testes guardam é o que faz o ecrã valer
 * a pena — chegar depressa às fotos certas e etiquetá-las às dezenas.
 */

const ETIQUETAS = [
  { id: "tipo:bouquet", eixo: "tipo", nome: "bouquet", ordem: 10, createdAt: "2026-01-01" },
  {
    id: "tipo:seating-plan",
    eixo: "tipo",
    nome: "seating plan",
    ordem: 20,
    createdAt: "2026-01-01",
  },
  {
    id: "paleta:terracotta",
    eixo: "paleta",
    nome: "terracotta",
    ordem: 10,
    createdAt: "2026-01-01",
  },
];

const foto = (n: number, over: Record<string, unknown> = {}) => ({
  path: `terracotta/f${n}.jpg`,
  url: `https://cdn.test/f${n}.jpg`,
  thumbUrl: `https://cdn.test/t${n}.jpg`,
  etiquetas: ["paleta:terracotta"],
  porConfirmar: true,
  ...over,
});

/** Os pedidos que o ecrã fez, para se poder afirmar O QUE ele perguntou. */
let pedidos: { url: string; body?: unknown }[] = [];
let resposta = { ok: true, total: 3, fotos: [foto(1), foto(2), foto(3)] };
let mudadas = 2;

beforeEach(() => {
  pedidos = [];
  resposta = { ok: true, total: 3, fotos: [foto(1), foto(2), foto(3)] };
  mudadas = 2;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    pedidos.push({ url, body });
    if (url.startsWith("/api/biblioteca/etiquetas")) {
      return new Response(JSON.stringify(ETIQUETAS), { status: 200 });
    }
    if (url.startsWith("/api/biblioteca/fotos")) {
      return new Response(JSON.stringify(resposta), { status: 200 });
    }
    if (url === "/api/temas") {
      return new Response(JSON.stringify({ id: "novo", name: body?.name }), { status: 200 });
    }
    if (url.startsWith("/api/biblioteca/etiquetar")) {
      return new Response(JSON.stringify({ ok: true, pedidas: 3, mudadas }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const abrir = () =>
  render(
    <ToastProvider>
      <BibliotecaRevisao onBack={() => {}} />
    </ToastProvider>,
  );

const fotos = () => screen.getAllByRole("button", { name: /^Foto / });
const consultas = () => pedidos.filter((p) => p.url.startsWith("/api/biblioteca/fotos"));
/** O contador da barra de selecção. Há mais `role="status"` no ecrã (os avisos
 *  do Toast também o são), por isso escolhe-se pelo texto. */
const contador = () =>
  screen.queryAllByRole("status").find((el) => /escolhidas?$/.test(el.textContent ?? ""));

describe("rever etiquetas", () => {
  it("mostra as fotos e o vocabulário dos três eixos", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    expect(screen.getByRole("button", { name: "seating plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "terracotta" })).toBeInTheDocument();
  });

  /** O atalho que leva ao trabalho que a migração deixou por fazer. */
  it("«sem tipo» é o que vai na pergunta ao servidor", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "sem tipo" }));
    await waitFor(() => expect(consultas().at(-1)!.url).toContain("sem=tipo"));
  });

  /**
   * Duas etiquetas escolhidas viajam as DUAS, porque o servidor exige as duas.
   * Se só uma fosse, "seating plan terracotta" devolvia terracottas que não são
   * seating plans — que é exactamente o problema que isto veio resolver.
   */
  it("duas etiquetas escolhidas vão as duas na procura", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "seating plan" }));
    fireEvent.click(screen.getByRole("button", { name: "terracotta" }));
    await waitFor(() => {
      const url = decodeURIComponent(consultas().at(-1)!.url);
      expect(url).toContain("tipo:seating-plan");
      expect(url).toContain("paleta:terracotta");
    });
  });

  it("clicar escolhe e volta a clicar desescolhe", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(fotos()[0]);
    await waitFor(() => expect(contador()?.textContent).toBe("1 foto escolhida"));
    fireEvent.click(fotos()[0]);
    await waitFor(() => expect(contador()).toBeUndefined());
  });

  /** Sem isto, apanhar uma fiada de trinta fotos eram trinta cliques — e o
   *  ecrã deixava de resolver o problema para que existe. */
  it("Shift+clique apanha tudo o que está entre as duas", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(fotos()[0]);
    fireEvent.click(fotos()[2], { shiftKey: true });
    await waitFor(() => expect(contador()?.textContent).toBe("3 fotos escolhidas"));
  });

  it("aplica a etiqueta às fotos escolhidas, e só a essas", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(fotos()[0]);
    fireEvent.click(fotos()[1]);
    fireEvent.change(screen.getByLabelText("Etiqueta a aplicar"), {
      target: { value: "tipo:bouquet" },
    });
    await waitFor(() => {
      const escrita = pedidos.find((p) => p.url.startsWith("/api/biblioteca/etiquetar"));
      expect(escrita?.body).toEqual({
        paths: ["terracotta/f1.jpg", "terracotta/f2.jpg"],
        etiquetaId: "tipo:bouquet",
        accao: "por",
      });
    });
  });

  /**
   * A conta honesta: seleccionar 3 e mudar 2 (uma já tinha a etiqueta) diz 2.
   * Dizer 3 é uma inflação que se descobre à segunda vez que se usa o ecrã, e
   * a partir daí a mensagem deixa de valer nada.
   */
  it("diz quantas MUDARAM, não quantas foram pedidas", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(fotos()[0]);
    fireEvent.click(fotos()[1], { shiftKey: true });
    fireEvent.click(fotos()[2], { shiftKey: true });
    fireEvent.change(screen.getByLabelText("Etiqueta a aplicar"), {
      target: { value: "tipo:bouquet" },
    });
    expect(await screen.findByText(/2 fotos etiquetadas com “bouquet”/)).toBeInTheDocument();
  });

  /** Pôr o tipo e a seguir a paleta ao mesmo conjunto é o gesto normal. */
  it("a selecção sobrevive a aplicar uma etiqueta", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(fotos()[0]);
    fireEvent.change(screen.getByLabelText("Etiqueta a aplicar"), {
      target: { value: "tipo:bouquet" },
    });
    await waitFor(() =>
      expect(pedidos.some((p) => p.url.startsWith("/api/biblioteca/etiquetar"))).toBe(true),
    );
    expect(contador()?.textContent).toBe("1 foto escolhida");
  });

  /**
   * O passo que fecha o círculo: filtrar, gostar do resultado, dar-lhe um nome.
   * As etiquetas escolhidas agrupam-se POR EIXO — dois valores da mesma paleta
   * são UMA exigência com os dois, não duas exigências —, porque é assim que
   * "Bouquets Branco e Amarelo" continua a querer dizer o que sempre disse.
   */
  it("guarda a procura como tema, com uma exigência por eixo", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "bouquet" }));
    fireEvent.click(screen.getByRole("button", { name: "terracotta" }));
    fireEvent.change(screen.getByLabelText("Nome do tema a criar com este filtro"), {
      target: { value: "Bouquets terracotta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar tema" }));
    await waitFor(() => {
      const criacao = pedidos.find((p) => p.url === "/api/temas");
      expect(criacao?.body).toEqual({
        name: "Bouquets terracotta",
        filterRule: {
          v: 1,
          eixos: [
            { eixo: "tipo", modo: "todas", etiquetas: ["tipo:bouquet"] },
            { eixo: "paleta", modo: "todas", etiquetas: ["paleta:terracotta"] },
          ],
        },
      });
    });
  });

  /** "sem tipo" é um filtro de ARRUMAÇÃO: um tema feito com ele esvaziava-se
   *  sozinho à medida que o trabalho fosse sendo feito. */
  it("não oferece guardar como tema quando o filtro é só «sem tipo»", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "sem tipo" }));
    expect(screen.queryByLabelText("Nome do tema a criar com este filtro")).not.toBeInTheDocument();
  });

  /**
   * A PROCURA LENTA QUE CHEGA DEPOIS DA RÁPIDA.
   *
   * A primeira consulta é a biblioteca inteira e é a mais demorada; a do filtro
   * é curta. Sem cancelamento, a lenta aterrava por cima da que ela pediu a
   * seguir e a grelha ficava a mostrar a biblioteca toda com o chip «sem tipo»
   * aceso — e etiquetar em bloco a partir dali punha o tipo em fotos que já o
   * tinham.
   */
  it("uma resposta atrasada não pinta a grelha por cima do filtro pedido a seguir", async () => {
    const pendentes: ((r: Response) => void)[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/biblioteca/etiquetas")) {
        return new Response(JSON.stringify(ETIQUETAS), { status: 200 });
      }
      if (url.startsWith("/api/biblioteca/fotos")) {
        return new Promise<Response>((resolve) => pendentes.push(resolve));
      }
      return new Response("{}", { status: 404 });
    });

    abrir();
    await waitFor(() => expect(pendentes).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "sem tipo" }));
    await waitFor(() => expect(pendentes).toHaveLength(2));

    const resposta = (fotos: unknown[]) =>
      new Response(JSON.stringify({ ok: true, total: fotos.length, fotos }), { status: 200 });

    // A do filtro responde primeiro…
    await act(async () => {
      pendentes[1](resposta([foto(9)]));
    });
    // …e a da biblioteca inteira só depois. Já não vale nada.
    await act(async () => {
      pendentes[0](resposta([foto(1), foto(2), foto(3)]));
    });

    expect(fotos()).toHaveLength(1);
  });

  /**
   * A MINIATURA QUE NÃO EXISTE.
   *
   * Assinar um caminho no Storage não verifica que o ficheiro lá está: as fotos
   * anteriores às miniaturas vêm com `thumbUrl` bem formado para um objecto que
   * não existe, e o 404 só aparece no navegador. Sem plano B ficava um quadrado
   * vazio — e etiquetar às cegas é exactamente o que este ecrã veio evitar.
   */
  it("uma miniatura que não existe cai para o original, não para um quadrado vazio", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    const img = () => fotos()[0].querySelector("img")!;
    expect(img().getAttribute("src")).toBe("https://cdn.test/t1.jpg");
    fireEvent.error(img());
    await waitFor(() => expect(img().getAttribute("src")).toBe("https://cdn.test/f1.jpg"));
  });

  it("sem nada por arrumar, diz isso em vez de um vazio mudo", async () => {
    resposta = { ok: true, total: 0, fotos: [] };
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "sem tipo" }));
    expect(await screen.findByText(/está tudo etiquetado/)).toBeInTheDocument();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESCOLHEM-SE AS FOTOS E NÃO SE ETIQUETA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Do registo do audit, e é um dos oito bloqueios: «a barra que aplica etiquetas
 * fica por trás da barra de destinos do telemóvel».
 *
 * `bottom-0` cola ao fundo do que ROLA, que é a janela; a navegação do back
 * office é `fixed bottom-0` no plano seguinte, com 72 px mais a área segura. O
 * `padding` que o `AdminClient` põe no conteúdo não salva nada — um elemento
 * `sticky` posiciona-se contra o scrollport e não contra o padding do pai.
 *
 * A 390 px o conteúdo desta barra quebra em quatro filas, e as duas tapadas
 * eram precisamente os dois `select`: a única forma de etiquetar.
 *
 * O jsdom não faz layout. O que se prende é a DECISÃO — a distância ao fundo é
 * a altura da navegação, e sai do token que já existe.
 */
describe("a barra de etiquetas, no telemóvel", () => {
  it("pousa ACIMA da navegação de baixo, e não por trás dela", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(fotos()[0]);
    await waitFor(() => expect(contador()?.textContent).toBe("1 foto escolhida"));

    // A barra é o cartão que contém o contador da selecção.
    const barraDeAccoes = contador()!.closest("div.sticky")!;
    expect(barraDeAccoes.className).toContain(
      "bottom-[calc(var(--bo-barra-inferior)+env(safe-area-inset-bottom))]",
    );
    // Acima de 1024 a navegação é lateral e não há nada por baixo.
    expect(barraDeAccoes.className).toContain("lg:bottom-0");
    // E a folga NÃO é um número escrito à mão: era a quarta cópia do «56px»
    // quando a barra passou a 72, e foi assim que ela ficou a tapar isto.
    expect(barraDeAccoes.className).not.toMatch(/bottom-\[\d+px\]/);
  });
});
