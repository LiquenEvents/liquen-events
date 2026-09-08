// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EmailTemplates from "./EmailTemplates";
import { fingirDisposicao, reporDisposicao } from "../../../../../../test/disposicao-fingida";
import { MARCA } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS DUAS BARRAS DE SEPARADORES ESCRITAS À MÃO GANHAM A MARCA QUE ANDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã dos modelos de email tem DUAS barras `role="tablist"` escritas à mão,
 * fora do `ui/Segmented.tsx` — a de cima («Modelos / Editor clássico») e a da
 * língua («Português / English»). O `Segmented` já tem a pílula que desliza;
 * estas não tinham. O fundo verde apagava-se num separador e acendia-se no
 * outro no MESMO fotograma: as cores tinham os 120 ms do `ESTADO`, a posição
 * não tinha tempo nenhum, porque não havia nada que se movesse.
 *
 * Passam a usar o `ui/useMarcaQueAnda.ts` — o mesmo gancho do `NavEstudio`, o
 * mesmo dos dois eixos.
 *
 * ── LEIA-SE ISTO ANTES DE ACREDITAR NO VERDE ──────────────────────────────
 *
 * O jsdom NÃO TEM DISPOSIÇÃO: `offsetLeft` e companhia são zero e
 * `offsetParent` é sempre nulo. Sem ajuda, uma barra medida e uma barra não
 * medida são indistinguíveis aqui — foi assim que o filete da barra lateral
 * teve um teste de unidade que morreu e virou passeio de Playwright.
 *
 * O `test/disposicao-fingida.ts` não devolve a disposição: deixa cada elemento
 * DECLARAR as suas medidas num `data-*`. É por isso que os testes que medem
 * movimento aqui em baixo escrevem `data-x`/`data-w` nos botões JÁ RENDERIZADOS
 * antes de provocar a troca — os separadores de produção não trazem esses
 * atributos, e não deviam trazer: são andaimes do teste, não do ecrã.
 *
 * O que isto prende é a CANALIZAÇÃO, que é lógica:
 *
 *   · a pílula existe e está DENTRO da barra (é ela o `offsetParent`);
 *   · mede-se o separador MARCADO — o que tem `aria-selected="true"` —, e a
 *     pílula anda para lá quando ele muda;
 *   · o primeiro desenho NÃO anda;
 *   · e — o que mais se parte sem dar sinal — o separador activo LARGA o fundo
 *     próprio quando a pílula está medida, para nunca haver dois fundos.
 *
 * Onde é que a pílula PÁRA, em pixéis, continua a ser matéria de browser.
 */

const MODELOS = [
  {
    chave: "registo-formal",
    nome: "Registo formal",
    descricao: "O texto que já usas.",
    pt: { subject: "Proposta | Líquen", body: "Olá {{cliente_nome}},", updatedAt: "" },
    en: { subject: "Your proposal", body: "Hi", updatedAt: "" },
  },
];

const respostas = (url: string) => {
  if (url.startsWith("/api/email-templates/bilingues")) return MODELOS;
  if (url.startsWith("/api/email-templates/dados")) return { pedidos: [] };
  if (url.startsWith("/api/email-templates/versoes")) return [];
  if (url.startsWith("/api/email-templates")) return [];
  return {};
};

const fetchMock = vi.fn(async (url: string) => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => respostas(String(url)),
}));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  fingirDisposicao();
});

afterEach(() => {
  cleanup();
  reporDisposicao();
  vi.unstubAllGlobals();
});

/** Deixa passar o fotograma que o `podeAndar` do gancho espera. */
async function passarUmFotograma() {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 0));
  });
}

const montar = async () => {
  const r = render(
    <ToastProvider>
      <EmailTemplates />
    </ToastProvider>,
  );
  await screen.findByRole("tab", { name: "Modelos" });
  await passarUmFotograma();
  return r;
};

/** A pílula: o único filho da barra que é desenho e não informação. */
const pilulaDe = (barra: HTMLElement) =>
  barra.querySelector<HTMLElement>(':scope > span[aria-hidden="true"]');

const barraDe = (nome: string) => screen.getByRole("tablist", { name: nome });

/**
 * Dá medidas fingidas aos separadores de uma barra, para o gancho ter o que
 * medir na próxima vez que lhe mandarem medir.
 */
function medirBotoes(barra: HTMLElement, larguras: number[]) {
  const botoes = within(barra).getAllByRole("tab");
  let x = 0;
  botoes.forEach((b, i) => {
    b.dataset.x = String(x);
    b.dataset.y = "0";
    b.dataset.w = String(larguras[i]);
    b.dataset.h = "28";
    x += larguras[i] + 6; // o `gap-1.5` da barra
  });
  return botoes;
}

describe("a barra «Modelos / Editor clássico»", () => {
  it("tem a pílula dentro da própria barra, que é o `offsetParent` das medidas", async () => {
    await montar();
    const barra = barraDe("Editor de modelos");
    // `relative` na barra não é decoração: as medidas que o gancho devolve são
    // relativas a ela, e uma pílula pendurada noutro antepassado ficava pousada
    // no sítio errado assim que a barra saísse do canto da página.
    expect(barra.className).toMatch(/\brelative\b/);
    const pilula = pilulaDe(barra);
    expect(pilula).not.toBeNull();
    expect(pilula!.className).toMatch(/\babsolute\b/);
    // Não apanha toques: quem responde ao clique é o separador por baixo dela.
    expect(pilula!.className).toMatch(/pointer-events-none/);
  });

  it("anda para o separador marcado quando se troca de vista", async () => {
    await montar();
    const barra = barraDe("Editor de modelos");
    const [modelos, classico] = medirBotoes(barra, [70, 110]);
    expect(modelos.getAttribute("aria-selected")).toBe("true");

    // A troca é o que manda medir de novo (a chave do gancho é a vista).
    await act(async () => {
      await userEvent.setup().click(classico);
    });

    expect(classico.getAttribute("aria-selected")).toBe("true");
    const pilula = pilulaDe(barraDe("Editor de modelos"))!;
    // Foi para o SEGUNDO separador — 70 + 6 —, e tomou a largura dele. Uma
    // pílula de largura fixa ficava a apontar para o vizinho: «Modelos» e
    // «Editor clássico» não medem o mesmo.
    expect(pilula.style.translate).toBe("76px 0px");
    expect(pilula.style.width).toBe("110px");
  });

  it("o separador activo larga o fundo próprio quando a pílula está no sítio", async () => {
    // É a manobra do `Segmented`, e a razão está escrita lá: entre o HTML do
    // servidor e a primeira medida não há pílula nenhuma, e um separador activo
    // sem fundo lia-se como inactivo. Por isso o fundo próprio é a rede — e sai
    // no instante em que a pílula existe, para nunca haver DOIS fundos verdes ao
    // mesmo tempo, que é o defeito que se vê e ninguém sabe nomear.
    await montar();
    const activo = within(barraDe("Editor de modelos")).getByRole("tab", { name: "Modelos" });
    expect(activo.getAttribute("aria-selected")).toBe("true");
    expect(activo.classList.contains("bg-[#5F7C66]")).toBe(false);
    // E o rótulo fica POR CIMA da pílula, que é um irmão absoluto desenhado
    // antes dele.
    expect(activo.className).toMatch(/\brelative\b/);
  });

  it("o primeiro desenho não anda — só o fotograma seguinte", async () => {
    // Sem isto, abrir o ecrã punha a pílula a deslizar do canto até ao
    // separador activo: um movimento que ninguém provocou, a anunciar uma troca
    // que não houve.
    const { container } = render(
      <ToastProvider>
        <EmailTemplates />
      </ToastProvider>,
    );
    await screen.findByRole("tab", { name: "Modelos" });
    const antes = container.querySelector<HTMLElement>('[role="tablist"] > span[aria-hidden]');
    expect(antes?.className).not.toMatch(/motion-safe:transition-/);

    await passarUmFotograma();
    const depois = pilulaDe(barraDe("Editor de modelos"))!;
    // E quando anda, anda com a `MARCA` da casa — hoje o degrau `quick` do
    // documento — e com `motion-safe:` nas suas classes, para quem pediu para
    // não animar a ver mudar de sítio num fotograma. Compara-se com a
    // constante: escrever aqui os seus valores era ter o número em dois
    // sítios, e foi a cópia que chumbou quando o degrau mudou.
    const classes = depois.className.split(/\s+/);
    for (const classe of MARCA.split(/\s+/)) expect(classes).toContain(classe);
  });
});

describe("a barra da língua «Português / English»", () => {
  /**
   * A barra da língua só existe com um modelo aberto — e o ecrã abre o primeiro
   * sozinho assim que a lista chega, portanto basta esperar por ela.
   */
  const abrirModelo = async () => {
    const r = await montar();
    await screen.findByRole("tablist", { name: "Língua do modelo" });
    await passarUmFotograma();
    return r;
  };

  it("a pílula nasce com a barra, à primeira abertura de um modelo", async () => {
    // A chave do gancho leva o modelo E a língua exactamente por isto: a barra
    // só existe depois de haver modelo aberto, e com a língua sozinha na chave a
    // marca só aparecia à segunda troca.
    await abrirModelo();
    const pilula = pilulaDe(barraDe("Língua do modelo"));
    expect(pilula).not.toBeNull();
    expect(pilula!.className).toMatch(/pointer-events-none/);
  });

  it("anda de «Português» para «English» sem remontar o que está por publicar", async () => {
    await abrirModelo();
    const barra = barraDe("Língua do modelo");
    const [pt, en] = medirBotoes(barra, [92, 78]);
    expect(pt.getAttribute("aria-selected")).toBe("true");

    // O `<textarea>` da mensagem TEM de ser o mesmo nó antes e depois: é aqui
    // que vive o texto por publicar, e um `key` a remontá-lo deitava-o fora. É
    // a armadilha por que esta barra não podia levar um `key` nem uma `.view-in`
    // pendurada num — ver o comentário no componente.
    const antes = screen.getByLabelText("Mensagem");

    await act(async () => {
      await userEvent.setup().click(en);
    });

    expect(en.getAttribute("aria-selected")).toBe("true");
    const pilula = pilulaDe(barraDe("Língua do modelo"))!;
    expect(pilula.style.translate).toBe("98px 0px");
    expect(pilula.style.width).toBe("78px");
    // O MESMO nó, não um sósia: `toBe`, e não `toEqual`.
    expect(screen.getByLabelText("Mensagem")).toBe(antes);
  });

  it("o separador activo também larga aqui o fundo próprio", async () => {
    await abrirModelo();
    const activo = within(barraDe("Língua do modelo")).getByRole("tab", { name: /Português/ });
    expect(activo.getAttribute("aria-selected")).toBe("true");
    expect(activo.classList.contains("bg-[#5F7C66]")).toBe(false);
    expect(activo.className).toMatch(/\brelative\b/);
  });
});
