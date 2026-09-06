// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ThemeImage } from "@/lib/theme-types";
import PhotoLightbox from "./PhotoLightbox";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VISUALIZADOR TAMBÉM SE VAI EMBORA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É a superfície mais violenta da biblioteca: preto, e cobre o ecrã TODO.
 * Abria com a `.bo-entrada` — isso já estava — e fechava A SECO, com a grelha a
 * reaparecer inteira no fotograma seguinte. A diferença entre «a foto fechou-se»
 * e «a página trocou».
 *
 * ── QUEM SEGURA O NÓ É O PAI, E POR ISSO ISTO TEM UMA PROP ────────────────
 *
 * O `zoomAt` vive no `Temas.tsx`, portanto é de lá que vem o «já fechou, fica
 * só a apagar-te». Este ficheiro prende o CONTRATO desse `aberto`: o que o
 * visualizador tem de fazer quando ele cai. Que o pai o segura mesmo os 200 ms
 * está preso no `Temas.saida.test.tsx`.
 */

const FOTOS: ThemeImage[] = [
  { path: "temas/lavanda/1.jpg", url: "https://exemplo/1.jpg", thumbUrl: "https://exemplo/1m.jpg" },
  { path: "temas/lavanda/2.jpg", url: "https://exemplo/2.jpg", thumbUrl: "https://exemplo/2m.jpg" },
];

function montar(aberto: boolean) {
  const onClose = vi.fn();
  const onIndexChange = vi.fn();
  const r = render(
    <PhotoLightbox
      aberto={aberto}
      images={FOTOS}
      index={0}
      onIndexChange={onIndexChange}
      onClose={onClose}
      onDownload={vi.fn()}
    />,
  );
  const voltar = (a: boolean) =>
    r.rerender(
      <PhotoLightbox
        aberto={a}
        images={FOTOS}
        index={0}
        onIndexChange={onIndexChange}
        onClose={onClose}
        onDownload={vi.fn()}
      />,
    );
  return { onClose, onIndexChange, voltar };
}

const raiz = () => document.querySelector("div.fixed.inset-0") as HTMLElement;
const classes = (el: Element) => el.className.split(/\s+/).filter(Boolean);

beforeEach(() => {
  document.body.style.overflow = "";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

describe("aberto, é um visualizador — o controlo negativo de tudo o resto", () => {
  it("cobre o ecrã, entra com a palavra da casa, e apanha os toques", () => {
    const { onClose } = montar(true);
    const el = raiz();

    expect(el).toBe(screen.getByRole("dialog", { name: "Foto 1 de 2" }));
    expect(classes(el)).toContain("bo-entrada");
    expect(classes(el)).not.toContain("bo-saida");
    expect(el.hasAttribute("inert")).toBe(false);
    // A página por baixo não rola enquanto isto está aberto.
    expect(document.body.style.overflow).toBe("hidden");
    // E clicar no preto fecha — é este o toque que a saída tem de largar.
    fireEvent.click(el);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("fechado, é uma imagem a apagar-se", () => {
  it("continua no ecrã, mas já não é um diálogo nem apanha um toque", () => {
    const { onClose, voltar } = montar(true);
    const antes = raiz();

    voltar(false);
    const el = raiz();

    // O MESMO nó: mesmo tipo e mesma posição, o React reaproveita-o — a saída
    // parte da opacidade em que a imagem está, e não de um nó novo.
    expect(el).toBe(antes);
    expect(el.isConnected).toBe(true);

    // Sai pelo sítio por onde entrou: quatro píxeis, e SEM a variante do fundo
    // — aqui a tinta preta não está por trás de nada, é o visualizador.
    expect(classes(el)).toContain("bo-saida");
    expect(classes(el)).not.toContain("bo-saida-fundo");
    expect(classes(el)).not.toContain("bo-entrada");

    // Para quem ouve o ecrã e para quem anda de Tab, acabou.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button", { name: "Fechar" })).toBeNull();

    // E o toque que fechava a foto já não faz nada — a `.bo-saida` larga os
    // `pointer-events` dentro da própria classe, e quem cobre o ecrã inteiro é
    // este mesmo elemento.
    onClose.mockClear();
    fireEvent.click(el);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a página volta a rolar no instante, e não daqui a 200 ms", () => {
    const { voltar } = montar(true);
    expect(document.body.style.overflow).toBe("hidden");

    voltar(false);

    // Zero espera. O trinco segue o `aberto` e não a montagem: uma animação a
    // atrasar a devolução da página era uma animação a atrasar uma tarefa.
    expect(document.body.style.overflow).not.toBe("hidden");
    // E o nó ainda lá está, que é o que faz esta asserção medir alguma coisa.
    expect(raiz().isConnected).toBe(true);
  });

  it("e o teclado deixa de responder — o Escape e as setas param já", () => {
    const { onClose, onIndexChange, voltar } = montar(true);
    // Controlo negativo: aberto, as teclas andam e fecham.
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    onIndexChange.mockClear();
    voltar(false);

    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onIndexChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
