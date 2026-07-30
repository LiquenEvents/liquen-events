// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import SafeImage from "./SafeImage";

/**
 * A PROVA de que uma imagem do sítio (fora da galeria) deixou de ficar partida
 * por causa de um erro pontual.
 *
 * O estado anterior, medido num Chromium com o `/_next/image` a devolver 500:
 * o menu mobile ficava com 9 de 22 `<img>` a `naturalWidth === 0` e a página
 * `/servicos/casamentos` com 14 de 14 — ZERO imagens pintadas. Sem `onError`,
 * o próprio next/image chama `setShowAltText(true)` e pinta o texto alternativo
 * por cima do ícone partido, que é exactamente o que a dona fotografou.
 *
 * Cada teste aqui fixa um degrau do comportamento: erro -> recurso ao ficheiro
 * original, escada de recuo, tecto com recurso digno, e recuperação.
 */

/** Uma das miniaturas do menu (Navbar). Está em `public/imagens/`. */
const SRC = "/imagens/EW1_1100.jpg";
const BLUR = "data:image/webp;base64,AAAA";

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

function renderTile(props: Partial<React.ComponentProps<typeof SafeImage>> = {}) {
  return render(
    <div className="relative h-14 w-14">
      <SafeImage
        src={SRC}
        alt="Casamentos"
        fill
        sizes="56px"
        quality={55}
        className="object-cover"
        blurDataURL={BLUR}
        {...props}
      />
    </div>,
  );
}

const img = () => document.querySelector("img");
const currentSrc = () => img()?.getAttribute("src") ?? "";
/** Faz falhar a imagem que estiver montada neste momento. */
const falhar = () =>
  act(() => {
    img()!.dispatchEvent(new Event("error"));
  });

describe("SafeImage: uma imagem falhada volta a ser pedida", () => {
  beforeEach(() => {
    FakeIO.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIO);
    vi.useFakeTimers();
  });
  afterEach(() => {
    // `globals` está desligado no vitest.config: sem isto os `<img>` de um
    // teste ficavam no documento e o teste seguinte encontrava-os.
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("o primeiro pedido continua a ser feito pelo caminho normal do sítio", () => {
    // Este componente NÃO escolhe o caminho da primeira tentativa: não passa
    // loader nenhum, para não entrar em conflito com o optimizador nem com o
    // que estiver configurado em `images.loader`. Só a re-tentativa é dele.
    renderTile();
    expect(currentSrc()).toContain("/_next/image");
    expect(currentSrc()).toContain(encodeURIComponent(SRC));
    expect(currentSrc()).not.toContain("r=");
  });

  it("uma imagem que falha vai JÁ ao ficheiro original, sem esperar recuo nenhum", () => {
    // O ponto mais importante. O ficheiro original está versionado no
    // repositório e portanto existe sempre; o que falha é a DERIVADA. Uma
    // escada de espera contra um 500 do optimizador só gastaria segundos —
    // na galeria isso custava 4 pedidos e 7,8s por foto antes de se chegar ao
    // ficheiro que estava lá desde o início.
    renderTile();
    const primeiro = img();
    falhar();

    // Sem avançar UM ÚNICO milissegundo já há uma imagem a caminho.
    const el = img();
    expect(el, "o original devia estar pedido já").not.toBeNull();
    // E é um ELEMENTO NOVO, não o mesmo `<img>` com o atributo trocado: está
    // medido na galeria que sem o par desmontar/remontar o browser não repete
    // o pedido (tentativas por URL falhado {min:1, max:1}).
    expect(el).not.toBe(primeiro);
    expect(el!.getAttribute("src")).toContain(SRC);
    expect(el!.getAttribute("src")).not.toContain("/_next/image");
    // E nenhum candidato do srcset volta ao optimizador que acabou de falhar.
    expect(el!.getAttribute("srcset") ?? "").not.toContain("/_next/image");
  });

  it("a escada de recuo é do ORIGINAL: 600ms, 1800ms, 5400ms, sempre com URL novo", () => {
    renderTile();
    falhar(); // optimizador -> original, imediato

    const urls = [currentSrc()];
    for (const delay of [600, 1800, 5400]) {
      falhar();
      // Antes de o recuo passar, o `<img>` que pede o ficheiro está desmontado
      // de propósito: sem o par desmontar/remontar o browser NÃO repete o
      // pedido. O que fica no seu lugar é a superfície reservada (um `data:`
      // URI, que não faz pedido nenhum) — ver o teste do espaço reservado.
      act(() => vi.advanceTimersByTime(delay - 1));
      expect(currentSrc(), `não devia haver pedido antes dos ${delay}ms`).toBe(BLUR);
      act(() => vi.advanceTimersByTime(1));
      urls.push(currentSrc());
    }

    expect(urls).toHaveLength(4);
    expect(urls.every((u) => u.includes(SRC))).toBe(true);
    // Cada tentativa é um URL DIFERENTE (anti-cache): sem isso o browser podia
    // devolver a resposta falhada em cache e a escada corria sem pedir nada.
    expect(new Set(urls).size).toBe(4);
  });

  it("esgotado o tecto, mostra a própria imagem desfocada — nunca o ícone partido", () => {
    renderTile({ unavailableLabel: "Foto indisponível" });

    // 1 falha do optimizador + 4 do original.
    for (let i = 0; i < 5; i++) {
      falhar();
      act(() => vi.advanceTimersByTime(6_000));
    }

    // Continua a haver UMA imagem no documento — e é a superfície desfocada,
    // não um `<img>` a apontar a um ficheiro que não vem (que é o que o
    // browser desenha como ícone partido).
    const el = img();
    expect(el, "o recurso digno tem de ser uma imagem, não um vazio").not.toBeNull();
    expect(el!.getAttribute("src")).toBe(BLUR);
    expect(el!.getAttribute("src")).not.toContain(SRC);
    expect(screen.getByText("Foto indisponível")).toBeInTheDocument();
  });

  it("sem legenda (miniatura de 56px), o recurso é silencioso mas continua a ser uma imagem", () => {
    // Numa miniatura de 56px do menu uma etiqueta de texto não cabe e lê-se
    // como mais um defeito. "Digno" aqui é a superfície desfocada e mais nada.
    renderTile();
    for (let i = 0; i < 5; i++) {
      falhar();
      act(() => vi.advanceTimersByTime(6_000));
    }
    expect(img()!.getAttribute("src")).toBe(BLUR);
    expect(screen.queryByText(/indispon/i)).toBeNull();
  });

  it("o recurso não degrada o texto alternativo distinto de cada foto", () => {
    // Regra de acessibilidade do portefólio: cada foto tem um `alt` próprio
    // para quem usa leitor de ecrã as conseguir distinguir. A imagem que fica
    // é AQUELA foto, degradada — por isso o `alt` mantém-se tal e qual.
    const alt = "Exemplo de decoração da Líquen Events: Casamentos 3";
    renderTile({ alt, unavailableLabel: "Foto indisponível" });
    for (let i = 0; i < 5; i++) {
      falhar();
      act(() => vi.advanceTimersByTime(6_000));
    }
    expect(img()!.getAttribute("alt")).toBe(alt);
  });

  it("uma imagem sem `fill` (o logótipo) mantém as dimensões no recurso", () => {
    // Sem isto o recurso colapsava e a barra de navegação saltava de altura.
    render(
      <SafeImage
        src="/logo-liquen.png"
        alt="Líquen Events"
        width={300}
        height={179}
        className="object-contain w-auto"
      />,
    );
    for (let i = 0; i < 5; i++) {
      falhar();
      act(() => vi.advanceTimersByTime(6_000));
    }
    const el = img()!;
    expect(el.getAttribute("width")).toBe("300");
    expect(el.getAttribute("height")).toBe("179");
    expect(el.getAttribute("class")).toContain("object-contain");
  });

  it("o espaço da imagem é reservado TAMBÉM durante a espera entre tentativas", () => {
    // A QUEIXA QUE ISTO FIXA: "ao fazer scroll no telemóvel fica tudo travado e
    // vai um pouco para cima". Entre tentativas o `<img>` está desmontado de
    // propósito (é a única forma de o browser repetir o pedido), e na primeira
    // versão deste componente esse intervalo não desenhava NADA. Numa imagem
    // `fill` é inofensivo; no logótipo do rodapé, que não é `fill`, saíam 80 px
    // do fluxo durante 600, 1800 e 5400 ms.
    //
    // Medido num Pixel 7, com o pedido do logótipo a falhar e o visitante
    // parado no fim de /sobre: `document.scrollHeight` caía de 4502 para 4422 e
    // o browser encurtava o scroll — `window.scrollY` recuava de 3663 para 3583
    // sem ninguém lhe tocar. Depois desta correcção: 0 recuos, altura constante.
    render(
      <SafeImage
        src="/logo-liquen-branco.png"
        alt="Líquen Events"
        width={215}
        height={128}
        className="h-20 sm:h-24 w-auto object-contain"
      />,
    );
    falhar(); // derivada -> original, imediato (sem espera)

    for (const delay of [600, 1800, 5400]) {
      falhar(); // agora sim, entra-se na espera
      act(() => vi.advanceTimersByTime(Math.floor(delay / 2)));

      const el = img();
      expect(el, `a caixa não pode desaparecer durante a espera de ${delay}ms`).not.toBeNull();
      // A caixa tem de ser A MESMA: é a `className` que dá a altura (h-20) e
      // são os atributos que dão a proporção. Se algum se perder, o espaço
      // colapsa e a página salta.
      expect(el!.getAttribute("class")).toBe("h-20 sm:h-24 w-auto object-contain");
      expect(el!.getAttribute("width")).toBe("215");
      expect(el!.getAttribute("height")).toBe("128");
      // E não pode ser um pedido novo ao ficheiro que acabou de falhar: o que
      // ocupa o espaço é uma superfície `data:`, sem rede nenhuma.
      expect(el!.getAttribute("src")).toMatch(/^data:image\//);
      expect(el!.getAttribute("src")).not.toContain("logo-liquen-branco");

      act(() => vi.advanceTimersByTime(delay)); // passa a espera, novo pedido
      expect(currentSrc()).toContain("logo-liquen-branco");
    }
  });

  it("durante a espera não se promete o que ainda não se sabe: sem legenda", () => {
    // A legenda é do FIM da escada. A meio de um recuo de 600ms ainda se está a
    // tentar; mostrá-la aí seria mentira e piscaria no ecrã a cada tentativa.
    renderTile({ unavailableLabel: "Foto indisponível" });
    falhar();
    falhar();
    act(() => vi.advanceTimersByTime(300));
    expect(img(), "a caixa continua ocupada").not.toBeNull();
    expect(screen.queryByText("Foto indisponível")).toBeNull();
  });

  it("depois de desistir, voltar a passar por cima da imagem tenta de novo", () => {
    // A recuperação que faltava: sem isto o buraco era para o resto da visita,
    // mesmo que a infraestrutura já tivesse recuperado.
    renderTile({ unavailableLabel: "Foto indisponível" });
    for (let i = 0; i < 5; i++) {
      falhar();
      act(() => vi.advanceTimersByTime(6_000));
    }
    expect(screen.getByText("Foto indisponível")).toBeInTheDocument();

    const io = FakeIO.instances[FakeIO.instances.length - 1];
    act(() => io.fire(false)); // saiu do ecrã
    act(() => io.fire(true)); // e voltou
    expect(screen.queryByText("Foto indisponível")).toBeNull();
    expect(currentSrc()).toContain("/_next/image");
  });

  it("depois de desistir, o regresso da rede tenta de novo", () => {
    renderTile({ unavailableLabel: "Foto indisponível" });
    for (let i = 0; i < 5; i++) {
      falhar();
      act(() => vi.advanceTimersByTime(6_000));
    }
    expect(screen.getByText("Foto indisponível")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText("Foto indisponível")).toBeNull();
    expect(img()!.getAttribute("src")).toContain("/_next/image");
  });

  it("a passagem ao original acontece UMA vez: nunca se volta ao optimizador na mesma escada", () => {
    // Fixa o defeito que a galeria já apanhou: se o `onError` não vir o estado
    // actualizado, cada falha volta a "passar ao original" e a escada nunca
    // avança para o tecto — a imagem fica a pedir para sempre e nunca chega a
    // haver recurso digno.
    renderTile();
    const pedidos: string[] = [];
    for (let i = 0; i < 5; i++) {
      const el = img();
      if (!el) break;
      pedidos.push(el.getAttribute("src") ?? "");
      falhar();
      act(() => vi.advanceTimersByTime(6_000));
    }
    // Só o PRIMEIRO pedido foi ao optimizador; os restantes ao ficheiro original.
    expect(pedidos[0]).toContain("/_next/image");
    expect(pedidos.slice(1).some((u) => u.includes("/_next/image"))).toBe(false);
    expect(pedidos.slice(1).every((u) => u.includes(SRC))).toBe(true);
    // E a escada TEM fim.
    expect(img()!.getAttribute("src")).toBe(BLUR);
  });
});
