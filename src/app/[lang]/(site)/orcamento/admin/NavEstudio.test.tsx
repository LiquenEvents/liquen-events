// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NavEstudio from "./NavEstudio";
import type { EstadoSeccao, Impedimento } from "@/lib/proposal-progress";

/**
 * O índice do estúdio: onde estou, o que já está feito, e — desde agora — o que
 * falta traduzir em cada secção.
 *
 * O painel «Por traduzir» já lista tudo, mas vive no passo do ENVIO, que é o
 * último sítio onde se olha. A meio de escrever a pergunta é outra: «desta
 * secção, o que é que ainda falta?».
 */

afterEach(cleanup);

const seccoes: EstadoSeccao[] = [
  { id: "evento", titulo: "Evento", preenchida: true, resumo: "Ana e Rui" },
  { id: "servicos", titulo: "Serviços", preenchida: true, resumo: "2 grupos" },
  { id: "orcamento", titulo: "Orçamento", preenchida: true, resumo: "3 linhas" },
];

const faltas: Impedimento[] = [];

describe("o contador de traduções em falta", () => {
  it("diz quantas faltam, secção a secção", () => {
    render(
      <NavEstudio seccoes={seccoes} faltas={faltas} porTraduzir={{ servicos: 2, orcamento: 1 }} />,
    );
    expect(screen.getByText("2 traduções em falta")).toBeTruthy();
    // Uma só diz-se no singular: «1 traduções» é a marca de um contador que
    // ninguém releu.
    expect(screen.getByText("1 tradução em falta")).toBeTruthy();
  });

  it("cala-se nas secções sem faltas", () => {
    render(<NavEstudio seccoes={seccoes} faltas={faltas} porTraduzir={{ servicos: 2 }} />);
    // Um `0` ao lado de cinco secções é uma fila de zeros a dizer que não há
    // nada a fazer.
    expect(screen.queryByText(/0 traduções/)).toBeNull();
    expect(screen.getAllByText(/traduç(ão|ões) em falta/)).toHaveLength(1);
  });

  it("numa proposta portuguesa não aparece de todo", () => {
    // O estúdio só passa a contagem com a proposta a sair em inglês — é a mesma
    // condição do painel «Por traduzir». Sem a propriedade, o índice é o que
    // sempre foi.
    render(<NavEstudio seccoes={seccoes} faltas={faltas} />);
    expect(screen.queryByText(/em falta/)).toBeNull();
    // CONTROLO POSITIVO: o índice está MESMO desenhado — senão «não aparece»
    // era verdade por não haver índice nenhum.
    expect(screen.getByText("Serviços")).toBeTruthy();
  });

  it("a tira mostra um ponto — e o ponto DIZ a frase a quem não vê a cor", () => {
    // Na tira não há largura para a linha escrita, e o que lá fica é a marca
    // âmbar. Uma marca `aria-hidden` seria a falta a existir só para quem vê.
    render(<NavEstudio seccoes={seccoes} faltas={faltas} porTraduzir={{ servicos: 2 }} />);
    expect(screen.getByRole("img", { name: "2 traduções em falta" })).toBeTruthy();
  });

  it("e é UMA frase, não uma cópia visível mais outra para quem ouve", () => {
    // Cada largura tem exactamente um portador: abaixo de `lg` o ponto, a
    // partir de `lg` a linha escrita — o outro está `display:none`, que o tira
    // também da árvore de acessibilidade. Duas cópias faziam a mesma falta ser
    // contada a dobrar por quem ouve.
    render(<NavEstudio seccoes={seccoes} faltas={faltas} porTraduzir={{ servicos: 2 }} />);
    expect(screen.getAllByText("2 traduções em falta")).toHaveLength(1);
    expect(screen.getAllByRole("img", { name: /traduç/ })).toHaveLength(1);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ÍNDICE NO ECRÃ ESTREITO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Abaixo de 1024 px este índice não existia — e o que faltava a 375 não era
 * conforto. A proposta tem cinco ecrãs e meio de rolo, e escrevia-se toda sem
 * saber em que secção se está nem quais já estão preenchidas: rolo cego, numa
 * quinta, com 4G.
 *
 * Agora é a MESMA árvore desenhada de duas maneiras — tira horizontal abaixo de
 * `lg`, coluna acima —, e é essa a parte que estes testes prendem. A alternativa
 * (duas instâncias, uma com `lg:hidden`) parece igual e não é: o comentário de
 * abertura do `useMedida.ts` conta o defeito que ela produz, e este componente,
 * que tem estado, é exactamente onde ele ia nascer.
 *
 * ── PORQUE É QUE O TESTE RESOLVE AS CLASSES À MÃO ───────────────────────────
 * O jsdom não faz disposição e não avalia `@media`: renderizar a 375 e a 1440 dá
 * o mesmo DOM com a mesma `className`. O resolvedor abaixo faz o que o navegador
 * faria — é o mesmo do `Cortes.movel.test.tsx`, e rebenta com o nome de qualquer
 * variante que não seja dos cortes desta casa.
 */

/** Só estes dois. É o contrato (`ui/adaptativo.ts`). */
const CORTES_DA_CASA: Record<string, number> = { sm: 640, lg: 1024 };

/** Separa `lg:hover:bg-x` sem partir os dois pontos de dentro de `[…]`. */
function separar(classe: string): string[] {
  const partes: string[] = [];
  let actual = "";
  let dentro = 0;
  for (const c of classe) {
    if (c === "[" || c === "(") dentro++;
    else if (c === "]" || c === ")") dentro--;
    if (c === ":" && dentro === 0) {
      partes.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  partes.push(actual);
  return partes;
}

function ligada(variante: string, largura: number): boolean {
  if (variante in CORTES_DA_CASA) return largura >= CORTES_DA_CASA[variante];
  const ate = /^max-([a-z0-9]+)$/.exec(variante);
  if (ate && ate[1] in CORTES_DA_CASA) return largura < CORTES_DA_CASA[ate[1]];
  // Variantes que não são perguntas sobre LARGURA: um estado, um selector.
  // Não decidem nada aqui e ficam ligadas.
  if (/^\[.*\]$/.test(variante)) return true;
  if (
    /^(hover|focus|active|group|peer|motion-safe|motion-reduce|aria-|data-|has-)/.test(variante)
  ) {
    return true;
  }
  throw new Error(
    `variante \`${variante}:\` desconhecida — este back office só usa \`sm:\` e \`lg:\``,
  );
}

/** Os utilitários que estão MESMO a valer nesta largura. */
function efectivas(className: string, largura: number): Set<string> {
  const fora = new Set<string>();
  for (const classe of className.split(/\s+/).filter(Boolean)) {
    const partes = separar(classe);
    const utilitario = partes.pop()!;
    if (partes.every((v) => ligada(v, largura))) fora.add(utilitario);
  }
  return fora;
}

/** Este elemento ocupa espaço nesta largura? */
function aparece(className: string, largura: number): boolean {
  const ef = efectivas(className, largura);
  if (!ef.has("hidden")) return true;
  return ["block", "flex", "grid", "inline-flex", "inline-block"].some((d) => ef.has(d));
}

/** E os pais dele também? É o que apanha um `hidden` posto no invólucro. */
function visivel(el: Element, largura: number, raiz: Element): boolean {
  for (let n: Element | null = el; n && n !== raiz; n = n.parentElement) {
    if (!aparece(n.className, largura)) return false;
  }
  return true;
}

/** As larguras que interessam: as duas pontas de cada corte, e o telemóvel. */
const LARGURAS = [375, 639, 640, 1023, 1024, 1440];

describe("o resolvedor (senão isto passava por vacuidade)", () => {
  it("liga e desliga o que a casa usa, e rebenta com o resto", () => {
    expect(aparece("hidden lg:block", 1023)).toBe(false);
    expect(aparece("hidden lg:block", 1024)).toBe(true);
    expect(aparece("flex lg:flex-col", 375)).toBe(true);
    expect(() => efectivas("xl:block", 1300)).toThrow(/xl:/);
    expect(() => efectivas("md:hidden", 800)).toThrow(/md:/);
  });
});

describe("a 375 px o índice existe e é navegável", () => {
  const desenhar = () => render(<NavEstudio seccoes={seccoes} faltas={faltas} />);

  it("a coluna deixou de ser `hidden` abaixo de 1024 — está lá nas seis larguras", () => {
    const { container } = desenhar();
    const indice = container.querySelector("nav")!;
    for (const largura of LARGURAS) {
      expect(aparece(indice.className, largura), `a ${largura} px o índice não existia`).toBe(true);
    }
  });

  it("as três secções estão à vista no telemóvel, e não só no portátil", () => {
    const { container } = desenhar();
    for (const s of seccoes) {
      const chip = screen.getByRole("button", { name: new RegExp(s.titulo) });
      expect(visivel(chip, 375, container), `«${s.titulo}» não se via a 375 px`).toBe(true);
    }
  });

  it("é uma TIRA que rola de lado, e uma COLUNA a partir de 1024", () => {
    // A diferença entre «existe» e «serve»: a 375 px uma coluna de 192 px ao
    // lado roubava metade da largura ao trabalho. O que a torna utilizável é
    // rolar na horizontal — e é isso, e não a ortografia da classe, que se
    // prende aqui.
    const { container } = desenhar();
    const lista = container.querySelector("nav ul")!;
    const tira = efectivas(lista.className, 375);
    expect(tira.has("flex") && !tira.has("flex-col")).toBe(true);
    expect(tira.has("overflow-x-auto")).toBe(true);

    const coluna = efectivas(lista.className, 1024);
    expect(coluna.has("flex-col")).toBe(true);
  });

  it("carregar num chip leva a vista E o foco à secção — a 375 como a 1440", () => {
    const alvo = document.createElement("div");
    alvo.id = "seccao-servicos";
    const campo = document.createElement("input");
    alvo.appendChild(campo);
    document.body.appendChild(alvo);
    const levar = vi.fn();
    alvo.scrollIntoView = levar;

    desenhar();
    screen.getByRole("button", { name: /Serviços/ }).click();

    expect(levar).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(campo);
    alvo.remove();
  });

  it("os alvos crescem para os 44 px do dedo (`alvo-toque`), sem mexer no portátil", () => {
    // Os 44×44 são um passo bloqueante do CI. Na coluna os chips tinham 28 px
    // de altura — o que basta com um rato e não basta com um polegar.
    desenhar();
    for (const s of seccoes) {
      const chip = screen.getByRole("button", { name: new RegExp(s.titulo) });
      expect(chip.className.split(/\s+/), `«${s.titulo}»`).toContain("alvo-toque");
    }
  });
});

describe("uma só instância, em qualquer largura", () => {
  /**
   * A armadilha que este teste existe para fechar: desenhar DUAS versões e
   * esconder uma com `lg:hidden`. Ficavam duas árvores montadas, cada uma com o
   * seu «onde estou» e o seu observador, as duas a responder ao estúdio — e ao
   * rodar o telemóvel aparecia a que tinha a outra resposta.
   */
  it("cada secção tem UM botão visível, e nunca dois", () => {
    const { container } = render(<NavEstudio seccoes={seccoes} faltas={faltas} />);
    for (const largura of LARGURAS) {
      for (const s of seccoes) {
        const chips = screen
          .getAllByRole("button", { name: new RegExp(s.titulo) })
          .filter((el) => visivel(el, largura, container));
        expect(chips, `«${s.titulo}» a ${largura} px`).toHaveLength(1);
      }
    }
  });

  it("há UM `<nav>` e UMA lista de secções, em largura nenhuma há dois", () => {
    const { container } = render(<NavEstudio seccoes={seccoes} faltas={faltas} />);
    expect(container.querySelectorAll("nav")).toHaveLength(1);
    expect(container.querySelectorAll("nav > ul")).toHaveLength(1);
  });

  it("e o observador é UM — o estúdio não pode receber duas respostas", () => {
    // Se alguém montar a segunda árvore, são dois `IntersectionObserver` a
    // observar as mesmas secções e a chamar `onSeccaoActual` cada um por si.
    const observados: Element[] = [];
    let instancias = 0;
    class Espia {
      constructor() {
        instancias++;
      }
      observe(el: Element) {
        observados.push(el);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("IntersectionObserver", Espia);
    for (const s of seccoes) {
      const el = document.createElement("div");
      el.id = `seccao-${s.id}`;
      document.body.appendChild(el);
    }

    render(<NavEstudio seccoes={seccoes} faltas={faltas} onSeccaoActual={() => {}} />);

    expect(instancias).toBe(1);
    expect(observados).toHaveLength(seccoes.length);

    vi.unstubAllGlobals();
    document.querySelectorAll('[id^="seccao-"]').forEach((el) => el.remove());
  });
});

describe("o que a tira deixa de fora, deixa-o de propósito", () => {
  const trava: Impedimento[] = [
    { id: "servicos", seccao: "servicos", texto: "Nenhum grupo de serviços", trava: true },
  ] as Impedimento[];

  it("a lista do que trava o envio fica em `lg` — quem a diz a 375 é o botão de enviar", () => {
    // Não é «não cabe»: é «já existe». O `PorqueNaoDaParaEnviar` põe as mesmas
    // faltas encostadas ao botão, com o mesmo salto para o campo. Repeti-las
    // aqui gastava altura permanente para dizer duas vezes o mesmo, e a segunda
    // longe do sítio onde a pergunta se faz.
    const { container } = render(<NavEstudio seccoes={seccoes} faltas={trava} />);
    const linha = screen.getByRole("button", { name: "Nenhum grupo de serviços" });
    expect(visivel(linha, 375, container)).toBe(false);
    expect(visivel(linha, 1023, container)).toBe(false);
    expect(visivel(linha, 1024, container)).toBe(true);
  });

  it("o resumo também — mas o NOME da secção nunca, que é por ele que se salta", () => {
    const { container } = render(<NavEstudio seccoes={seccoes} faltas={faltas} />);
    const resumo = screen.getByText("Ana e Rui");
    expect(visivel(resumo, 375, container)).toBe(false);
    expect(visivel(resumo, 1024, container)).toBe(true);
    expect(visivel(screen.getByText("Evento"), 375, container)).toBe(true);
  });
});
