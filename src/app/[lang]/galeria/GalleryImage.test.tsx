// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import GalleryImage from "./GalleryImage";

/** O mesmo caminho que `renderTile` usa. */
const SRC = "/imagens/DaniGui_Preview20.jpg";
/** Tentativas pela miniatura pré-gerada antes de se passar ao ficheiro original. */
const MAX_ATTEMPTS = 4;
/** O prefixo dos ficheiros estáticos gerados por scripts/pregen-gallery.mjs. */
const PREGEN_PREFIX = "/_img/g/DaniGui_Preview20-";

/**
 * A PROVA de que a queixa da dona ("nem todas as fotos carregam") deixou de ser
 * permanente.
 *
 * A medição que motivou este componente: injectando UM único HTTP 500 em 23 de
 * 176 pedidos `/_next/image`, ficaram 22 mosaicos em branco e o número de
 * tentativas por URL falhado foi {min:1, max:1} — o browser NUNCA voltou a
 * pedir nenhum deles. Estes testes fixam o comportamento oposto: um erro é
 * seguido de novo pedido, com URL diferente, e a foto acaba visível.
 */

/** IntersectionObserver de mentira: guarda os alvos e deixa-nos disparar. */
class FakeIO {
  static instances: FakeIO[] = [];
  targets: Element[] = [];
  constructor(private cb: IntersectionObserverCallback) {
    FakeIO.instances.push(this);
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  unobserve() {}
  disconnect() {
    this.targets = [];
  }
  takeRecords() {
    return [];
  }
  fire(isIntersecting: boolean) {
    this.cb(
      this.targets.map((target) => ({ target, isIntersecting })) as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    );
  }
}

function renderTile(props: Partial<React.ComponentProps<typeof GalleryImage>> = {}) {
  const anchorRef = createRef<HTMLElement>();
  const view = render(
    <button ref={anchorRef as React.RefObject<HTMLButtonElement>} className="g-tile relative">
      <GalleryImage
        src="/imagens/DaniGui_Preview20.jpg"
        alt="Casamento no Alentejo: Daniela & Guilherme (foto 1 de 30)"
        sizes="33vw"
        quality={65}
        className="object-cover"
        anchorRef={anchorRef}
        unavailableLabel="Foto indisponível"
        priority
        {...props}
      />
    </button>,
  );
  return view;
}

const img = () => document.querySelector("img");
/** O `url=` que o optimizador do Next recebe, mais os parâmetros extra. */
const currentSrc = () => img()?.getAttribute("src") ?? "";

describe("GalleryImage: um mosaico falhado volta a ser pedido", () => {
  beforeEach(() => {
    FakeIO.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIO);
    vi.useFakeTimers();
  });
  afterEach(() => {
    // `globals` está desligado no vitest.config, portanto a limpeza do
    // testing-library não é automática: sem isto os <img> de um teste ficavam
    // no documento e o teste seguinte encontrava-os.
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a miniatura NUNCA passa pelo optimizador: aponta ao ficheiro pré-gerado", () => {
    // A mudança de fundo desta ronda. Cada miniatura era uma transformação
    // on-demand no /_next/image — 431 a 442 URLs distintos numa travessia
    // completa da galeria — e portanto sujeita a quota mensal, a encode a frio
    // e a esgotar o tempo sob rajada (medido: 219ms isolado -> 2900ms em 30
    // simultâneas). Agora é um WebP estático do CDN, que não tem nenhuma
    // dessas três maneiras de falhar.
    renderTile();
    const src = currentSrc();
    expect(src).not.toContain("/_next/image");
    expect(src).toContain(PREGEN_PREFIX);
    expect(src).toMatch(/\.webp$/);
    // E o srcset inteiro, não só o src: nem um único candidato pelo optimizador.
    const srcset = img()!.getAttribute("srcset") ?? "";
    expect(srcset).not.toContain("/_next/image");
    expect(srcset).toContain(PREGEN_PREFIX);
  });

  it("re-tenta depois de um erro e a foto acaba VISÍVEL", () => {
    renderTile();
    const first = currentSrc();
    expect(first).toContain(PREGEN_PREFIX);

    // O pedido falha (o 5xx pontual do optimizador).
    act(() => {
      img()!.dispatchEvent(new Event("error"));
    });
    // Enquanto espera o recuo, não há <img> pendurada em estado de erro.
    expect(img()).toBeNull();

    // Recuo de 600ms -> segunda tentativa, com URL DIFERENTE (cache-buster).
    act(() => vi.advanceTimersByTime(600));
    const second = currentSrc();
    expect(second).not.toBe("");
    expect(second).not.toBe(first);
    expect(second).toContain("r=1");

    // Desta vez o servidor responde. A foto fica no ecrã e não há fallback.
    act(() => {
      img()!.dispatchEvent(new Event("load"));
    });
    expect(img()).not.toBeNull();
    expect(screen.queryByText("Foto indisponível")).toBeNull();
  });

  it("o recuo é exponencial e tem tecto: 4 tentativas, depois um fallback digno", () => {
    renderTile({ blurDataURL: "data:image/webp;base64,AAAA" });
    const urls: string[] = [currentSrc()];

    for (const delay of [600, 1800, 5400]) {
      act(() => {
        img()!.dispatchEvent(new Event("error"));
      });
      // Antes de o recuo passar, nada foi pedido de novo.
      act(() => vi.advanceTimersByTime(delay - 1));
      expect(img()).toBeNull();
      act(() => vi.advanceTimersByTime(1));
      urls.push(currentSrc());
    }
    expect(urls).toHaveLength(4);
    expect(new Set(urls).size).toBe(4); // cada tentativa é um URL novo

    // 4.ª falha: acabou o optimizador, mas ainda falta o ficheiro original.
    act(() => {
      img()!.dispatchEvent(new Event("error"));
    });
    act(() => vi.advanceTimersByTime(60_000));
    const cru = img();
    expect(cru, "ainda faltava tentar o ficheiro original").not.toBeNull();
    expect(cru!.getAttribute("src")).not.toContain("_next/image");

    // Só quando ESSE também falha é que se mostra o fallback.
    act(() => {
      cru!.dispatchEvent(new Event("error"));
    });
    act(() => vi.advanceTimersByTime(60_000));
    expect(img()).toBeNull();
    // Nada de ícone partido: fica a própria foto desfocada e uma legenda.
    const fallback = screen.getByText("Foto indisponível");
    expect(fallback).toBeInTheDocument();
    expect(fallback.parentElement?.getAttribute("style")).toContain("data:image/webp");
  });

  it("depois de esgotar as tentativas, voltar a passar por cima do mosaico tenta de novo", () => {
    // É a recuperação que faltava: medido, o utilizador podia subir e voltar a
    // descer por cima da foto falhada e o browser nunca a voltava a pedir.
    renderTile();
    // 4 pelo optimizador + 1 pelo ficheiro original.
    for (let i = 0; i < 5; i++) {
      act(() => {
        img()!.dispatchEvent(new Event("error"));
      });
      act(() => vi.advanceTimersByTime(6_000));
    }
    expect(screen.getByText("Foto indisponível")).toBeInTheDocument();

    // O observer de recuperação é o último criado. Sair do ecrã e voltar.
    const io = FakeIO.instances[FakeIO.instances.length - 1];
    act(() => io.fire(false));
    expect(img()).toBeNull();
    act(() => io.fire(true));
    expect(screen.queryByText("Foto indisponível")).toBeNull();
    expect(img()).not.toBeNull();
  });

  it("a foto existe no HTML desde o início, mesmo sem `priority`", () => {
    // Este teste já exigiu o CONTRÁRIO: que a foto só aparecesse quando o
    // mosaico se aproximasse do ecrã. Isso escondia o `src` até alguém correr
    // JavaScript e deixava o HTML do servidor sem fotografia nenhuma (medido:
    // 21 `<img>` caíram para 6). Numa galeria, isso é não ter conteúdo para
    // quem tem a ligação lenta, para quem navega sem JavaScript e para os
    // motores de busca.
    //
    // Quem adia o pedido do que está longe do ecrã é o `loading="lazy"` do
    // próprio browser, que não precisa de hidratação para funcionar.
    renderTile({ priority: false });
    const el = img();
    expect(el).not.toBeNull();
    expect(el).toHaveAttribute("loading", "lazy");
  });

  it("uma foto `priority` não é adiada pelo browser", () => {
    renderTile({ priority: true });
    expect(img()).not.toHaveAttribute("loading", "lazy");
  });

  it("a foto com prioridade não espera pelo viewport e pede fetchpriority alto", () => {
    renderTile({ priority: true });
    expect(img()).not.toBeNull();
    expect(img()!.getAttribute("fetchpriority")).toBe("high");
  });

  it("esgotada a miniatura, tenta o ficheiro original antes de desistir", async () => {
    // Rede de segurança final: se a miniatura pré-gerada faltar (uma foto
    // acrescentada a photos-data.ts sem correr o pregen, um deploy truncado),
    // serve-se o original em tamanho inteiro. Uma fotografia pesada é melhor
    // do que nenhuma fotografia.
    renderTile({ priority: true });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const el = img();
      expect(el, `tentativa ${i + 1} devia ter um <img>`).not.toBeNull();
      await act(async () => {
        fireEvent.error(el!);
        await vi.runAllTimersAsync();
      });
    }
    const el = img();
    expect(el, "devia haver um <img> a apontar ao ficheiro original").not.toBeNull();
    // O src é o caminho tal e qual: nem optimizador nem miniatura.
    expect(el!.getAttribute("src")).toContain(SRC);
    expect(el!.getAttribute("src")).not.toContain("_next/image");
    expect(el!.getAttribute("src")).not.toContain("/_img/g/");
  });

  it("só desiste depois de o ficheiro original também falhar", async () => {
    renderTile({ priority: true });
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
      const el = img();
      if (!el) break;
      await act(async () => {
        fireEvent.error(el);
        await vi.runAllTimersAsync();
      });
    }
    expect(img()).toBeNull();
    expect(screen.getByText(/indispon/i)).toBeTruthy();
  });
});
