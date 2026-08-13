// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ThemeImage } from "@/lib/theme-types";
import PhotoLightbox from "./PhotoLightbox";

/**
 * O visualizador é o único sítio da biblioteca onde se vê a foto a sério, e é
 * por isso o sítio onde ficar em branco custa mais: quem está aqui está a
 * decidir se aquela foto entra na proposta.
 *
 * O que se prende aqui é o desfecho MAU — o URL assinado que expirou, a foto
 * apagada noutro separador. A grelha ao lado já sabia cair para o original e
 * já sabia dizer que não conseguiu; este ecrã ficou de fora, e o que se via
 * era a miniatura desfocada para sempre ou, nas fotos sem miniatura, um
 * retângulo preto sem uma palavra.
 */

const COM_MINIATURA: ThemeImage = {
  path: "temas/lavanda/1.jpg",
  url: "https://exemplo/1-original.jpg",
  thumbUrl: "https://exemplo/1-mini.jpg",
};

/** Uma foto anterior às miniaturas — exactamente as que o painel "Miniaturas"
 *  existe para reparar, e as que ficavam num retângulo preto. */
const SEM_MINIATURA: ThemeImage = {
  path: "temas/lavanda/2.jpg",
  url: "https://exemplo/2-original.jpg",
};

function montar(images: ThemeImage[], index = 0, props: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  const onIndexChange = vi.fn();
  render(
    <PhotoLightbox
      images={images}
      index={index}
      onIndexChange={onIndexChange}
      onClose={onClose}
      onDownload={vi.fn()}
      {...props}
    />,
  );
  return { onClose, onIndexChange };
}

/** A imagem grande — a que pede o original. */
const grande = () => screen.getByRole("img", { name: /^Foto \d+ de \d+$/ }) as HTMLImageElement;

afterEach(cleanup);

describe("o caminho bom", () => {
  it("pede o original e revela-o quando ele chega", () => {
    montar([COM_MINIATURA]);
    expect(grande().getAttribute("src")).toBe(COM_MINIATURA.url);
    fireEvent.load(grande());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("quando o original não chega", () => {
  it("cai para a miniatura antes de desistir", () => {
    montar([COM_MINIATURA]);
    fireEvent.error(grande());
    expect(grande().getAttribute("src")).toBe(COM_MINIATURA.thumbUrl);
  });

  it("uma foto sem miniatura diz o que se passou, em vez de um retângulo preto", () => {
    montar([SEM_MINIATURA]);
    fireEvent.error(grande());
    const aviso = screen.getByRole("alert");
    expect(aviso.textContent).toMatch(/não foi possível mostrar esta fotografia/i);
  });

  it("com as duas em baixo, também desiste a dizer alguma coisa", () => {
    montar([COM_MINIATURA]);
    fireEvent.error(grande()); // o original
    fireEvent.error(grande()); // a miniatura
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("«Tentar de novo» volta a pedir a fotografia — desistir não é para sempre", async () => {
    montar([SEM_MINIATURA]);
    fireEvent.error(grande());
    await userEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(grande().getAttribute("src")).toBe(SEM_MINIATURA.url);
  });

  it("mudar de foto é sempre uma oportunidade nova", () => {
    const { rerender } = render(
      <PhotoLightbox
        images={[SEM_MINIATURA, COM_MINIATURA]}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    fireEvent.error(grande());
    expect(screen.getByRole("alert")).toBeTruthy();

    rerender(
      <PhotoLightbox
        images={[SEM_MINIATURA, COM_MINIATURA]}
        index={1}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(grande().getAttribute("src")).toBe(COM_MINIATURA.url);
  });

  it("o botão de recuperar fica DENTRO do diálogo, ao alcance do teclado", () => {
    montar([SEM_MINIATURA]);
    fireEvent.error(grande());
    const dialogo = screen.getByRole("dialog");
    expect(dialogo.contains(screen.getByRole("button", { name: /tentar de novo/i }))).toBe(true);
  });
});
