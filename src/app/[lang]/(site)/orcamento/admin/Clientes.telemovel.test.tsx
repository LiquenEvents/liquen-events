// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import Clientes from "./Clientes";

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

afterEach(cleanup);

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
