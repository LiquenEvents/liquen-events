// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import Clientes from "./Clientes";
import { eur0 as eur } from "@/lib/money";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LIGAR AO CLIENTE ERA O ALVO MAIS PEQUENO DA VISTA — 16 px DE ALTURA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO no navegador, a 375×667 e a 320×667, com `isMobile`, `hasTouch` e
 * `deviceScaleFactor: 2` — ou seja, com `(pointer: coarse)` verdadeiro — com
 * uma ficha de cliente aberta:
 *
 *   · telefone (`tel:`)     — **78×16 px**
 *   · email (`mailto:`)     — **171×16 px**
 *   · WhatsApp              — **75×16 px**
 *   · filtro «★ VIP»        — **69×36 px**
 *
 * Os três links de contacto ficavam com pouco mais de um terço da altura
 * mínima de 44 px, empilhados a 8 px uns dos outros (`gap-y-2`). É a barra mais
 * irónica do back office: telefonar, escrever e mandar WhatsApp são as três
 * coisas que só se fazem MESMO com o telemóvel na mão, e eram os três alvos
 * mais pequenos de toda a vista. Falhar o `tel:` por um pixel e acertar no
 * `mailto:` do lado troca uma chamada por um rascunho de email.
 *
 * O «★ VIP» tinha um problema com a mesma causa e um agravante próprio: está
 * ENCOSTADO ao `Segmented` da ordenação, que serve `h-9 pointer-coarse:h-11` e
 * portanto já crescia para 44 px no dedo. Dois controlos lado a lado com
 * alturas diferentes — o dedo que falha o VIP acerta no «Recentes».
 *
 * Depois, no mesmo navegador e nos mesmos dois ecrãs: nenhum alvo abaixo de
 * 44 px em toda a vista, aberta ou fechada. Com rato fica tudo como estava.
 *
 * ── PORQUE É QUE ESTE TESTE OLHA PARA CLASSES ─────────────────────────────
 * O jsdom não faz disposição: não há aqui píxeis para medir, e afirmar «44»
 * seria inventar um número. A medição a sério está feita no navegador (acima).
 * O que este teste guarda é o MECANISMO que a produz — `alvo-toque` nos links
 * escritos à mão e `pointer-coarse:h-11` no botão que tem de igualar o vizinho
 * —, para que ninguém o desfaça sem dar por isso.
 */

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "LIQ-1",
    name: "Ana Silva",
    email: "ana@exemplo.pt",
    phone: "912345678",
    company: "",
    guests: 80,
    status: "pendente",
    category: "particulares",
    eventType: "casamentos",
    submittedAt: "2026-08-10T10:00:00.000Z",
    ...over,
  }) as unknown as Quote;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Clientes no telemóvel — alvos de contacto de 44 px", () => {
  it("o filtro «VIP» cresce no dedo como o Segmented ao lado", () => {
    render(<Clientes quotes={[pedido()]} onOpen={() => {}} />);
    const vip = screen.getByRole("button", { name: /VIP/ });
    // A mesma regra que `ui/Segmented.tsx` serve ao vizinho desta linha.
    // Copiada, e não reinventada, para que os dois subam juntos.
    expect(vip.className).toContain("pointer-coarse:h-11");
  });

  describe("com a ficha do cliente aberta", () => {
    async function abrir() {
      render(<Clientes quotes={[pedido()]} onOpen={() => {}} />);
      await userEvent.click(screen.getByRole("button", { expanded: false }));
    }

    it("o telefone é um alvo de toque", async () => {
      await abrir();
      const tel = screen.getByRole("link", { name: /912345678/ });
      expect(tel.getAttribute("href")).toBe("tel:912345678");
      expect(tel.className).toContain("alvo-toque");
    });

    it("o email é um alvo de toque", async () => {
      await abrir();
      const email = screen.getByRole("link", { name: /ana@exemplo\.pt/ });
      expect(email.getAttribute("href")).toBe("mailto:ana@exemplo.pt");
      expect(email.className).toContain("alvo-toque");
    });

    it("o WhatsApp é um alvo de toque", async () => {
      await abrir();
      const wa = screen.getByRole("link", { name: /WhatsApp/ });
      expect(wa.className).toContain("alvo-toque");
    });
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NO TELEMÓVEL, A LISTA DE CLIENTES NÃO TINHA UM ÚNICO NÚMERO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O bloco com o valor ganho, o pipeline, o número de pedidos e a taxa de
 * conversão era `hidden md:flex`. A empresa e a última actividade eram `hidden
 * sm:inline`, sem substituto nenhum. Abaixo de 768 px sobrava o nome e o email:
 * uma lista de clientes sem dinheiro nenhum, e — pior — sem a última actividade,
 * que é o campo por que a lista está ORDENADA por omissão. A ordem dos cartões
 * ficava sem explicação.
 *
 * Isto não é densidade, é informação a desaparecer sem alternativa, que é
 * exactamente o que a regra da casa proíbe.
 *
 * ── PORQUE É QUE ESTE TESTE OLHA PARA OS ANTEPASSADOS ─────────────────────
 * O número ESTAVA no DOM — só estava escondido pelo CSS. Um `getByText` passava
 * antes e depois e não guardava nada. O que se afirma é que, do número até à
 * raiz do cartão, não há um `hidden` nem um `md:` pelo caminho: o valor está
 * mesmo à vista, e a decisão de o mostrar deixou de ser tomada num ponto de
 * corte que esta casa não usa (`ui/adaptativo.ts:53-60`).
 */

/** Um `matchMedia` que responde a partir de uma largura e de um ponteiro. */
function simularAparelho({ largura, toque }: { largura: number; toque: boolean }) {
  vi.stubGlobal("matchMedia", (mq: string): MediaQueryList => {
    const min = /min-width:\s*(\d+)px/.exec(mq);
    const matches = min
      ? largura >= Number(min[1])
      : mq.includes("hover: hover")
        ? !toque
        : mq.includes("pointer: coarse")
          ? toque
          : false;
    return {
      matches,
      media: mq,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

const TELEMOVEL = { largura: 375, toque: true };
/** O iPad em retrato: a largura onde o `md:` fazia entrar a tabela. */
const IPAD_RETRATO = { largura: 768, toque: true };
const COMPUTADOR = { largura: 1280, toque: false };

/** `getByText` normaliza o texto do DOM mas não o critério — ver `Clientes.dinheiro`. */
const semEspacos = (s: string) => s.replace(/\s+/g, " ").trim();
const porTexto = (alvo: string) => (conteudo: string) => semEspacos(conteudo) === semEspacos(alvo);

/** Há um `hidden` ou um `md:` entre este nó e a raiz? */
function escondidoPeloCaminho(el: HTMLElement): string | null {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    for (const cls of Array.from(n.classList)) {
      if (cls === "hidden" || cls.startsWith("md:")) return `${n.tagName.toLowerCase()}.${cls}`;
    }
  }
  return null;
}

const GANHO = pedido({ id: "LIQ-G", status: "aceite", quotedPrice: 20000 });
/** Dez dias atrás — o suficiente para o «há Nd» ser estável em qualquer hora. */
const HA_DIAS = pedido({
  id: "LIQ-V",
  submittedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
});

describe("Clientes no telemóvel — o dinheiro e a ordem voltam a aparecer", () => {
  it("o cartão mostra o total ganho, sem nada escondido pelo caminho", () => {
    simularAparelho(TELEMOVEL);
    render(<Clientes quotes={[GANHO]} onOpen={() => {}} />);

    // 20 000 x 1,23 = 24 600 — com IVA, como o resto da casa.
    const valor = screen.getByText(porTexto(eur(24600)));
    expect(
      escondidoPeloCaminho(valor),
      "o valor ganho voltou a ficar escondido no telemóvel",
    ).toBeNull();
  });

  it("o cartão mostra a última actividade — que é o que ORDENA a lista", () => {
    simularAparelho(TELEMOVEL);
    render(<Clientes quotes={[HA_DIAS]} onOpen={() => {}} />);

    const quando = screen.getByText(/^há \d+d$/);
    expect(
      escondidoPeloCaminho(quando),
      "a ordem da lista voltou a ficar sem explicação no telemóvel",
    ).toBeNull();
  });

  it("e diz quantos pedidos são", () => {
    simularAparelho(TELEMOVEL);
    render(<Clientes quotes={[GANHO, HA_DIAS]} onOpen={() => {}} />);

    const quantos = screen.getAllByText(/^\d+ pedidos?$/);
    expect(quantos.length).toBeGreaterThan(0);
    for (const n of quantos) expect(escondidoPeloCaminho(n)).toBeNull();
  });

  it("a 375 px não há tabela nenhuma", () => {
    simularAparelho(TELEMOVEL);
    render(<Clientes quotes={[GANHO]} onOpen={() => {}} />);
    expect(screen.queryByRole("table")).toBeNull();
  });

  /** O corte é o da casa (`CORTES.desktop`, 1024 = `lg:`) e não os 768 do `md:`
   *  — que é justamente onde os quatro achados Críticos do MOBILE-AUDIT
   *  apareceram, com uma tabela de dez colunas numa janela onde não cabe. */
  it("a 768 px — um iPad em retrato — continuam a ser cartões", () => {
    simularAparelho(IPAD_RETRATO);
    render(<Clientes quotes={[GANHO]} onOpen={() => {}} />);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("a 1280 px é uma tabela a sério", async () => {
    simularAparelho(COMPUTADOR);
    render(<Clientes quotes={[GANHO]} onOpen={() => {}} />);
    await waitFor(() =>
      expect(screen.getByRole("table", { name: "Clientes" })).toBeInTheDocument(),
    );
  });
});
