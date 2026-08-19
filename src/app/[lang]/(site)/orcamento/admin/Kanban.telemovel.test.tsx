// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import Kanban from "./Kanban";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ‹ › SÃO A ÚNICA FORMA DE MOVER UM CARTÃO NUM TELEMÓVEL — E TINHAM 36 px
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO no navegador, a 375×667 e a 320×667, com `isMobile`, `hasTouch` e
 * `deviceScaleFactor: 2` — ou seja, com `(pointer: coarse)` verdadeiro:
 *
 *   · «Mover para a coluna seguinte» — **36×36 px**
 *   · «Mover para a coluna anterior» — **36×36 px**
 *   · 4 px entre os dois, nas colunas do meio onde aparecem ambos
 *
 * Oito píxeis abaixo do mínimo de 44×44 das Human Interface Guidelines, que é
 * o limiar que toda a casa usa (ver `ergonomia-tactil.mjs`). E não era um
 * botão acessório: o arrasto HTML5 NÃO dispara em ecrã táctil, coisa que o
 * próprio comentário ao lado deste código já dizia — portanto estes dois
 * botões são tudo o que existe para mover um pedido de fase com o dedo. Eram
 * o alvo mais pequeno da vista inteira e o mais necessário.
 *
 * Depois, no mesmo navegador e no mesmo ecrã: **44×44 px** cada um, com 8 px
 * de folga entre eles (grupo de 96 px numa linha de cartão de 228 px, sem
 * transbordar). Com rato continuam nos 36 px de sempre.
 *
 * ── PORQUE É QUE ESTE TESTE OLHA PARA CLASSES ─────────────────────────────
 * O jsdom não faz disposição: não há aqui píxeis para medir, e afirmar «44»
 * seria inventar. A medição a sério está feita no navegador (os números acima).
 * O que este teste guarda é o MECANISMO que os produz — `alvo-toque`, que só
 * existe dentro de `@media (pointer: coarse)` em `globals.css` — e a folga
 * `pointer-coarse:gap-2`, para que ninguém os tire sem dar por isso. É a mesma
 * escolha do `Tarefas.telemovel.test.tsx` e do `Overview.movel.test.tsx`.
 */

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "LIQ-1",
    name: "Ana e Rui",
    email: "ana@exemplo.pt",
    phone: "",
    company: "",
    guests: 100,
    date: "2027-06-12",
    location: "Évora",
    notes: "",
    category: "particulares",
    eventType: "casamentos",
    submittedAt: "2026-01-10T10:00:00.000Z",
    // «Em revisão» é uma coluna do MEIO: é a única posição em que os dois
    // botões existem ao mesmo tempo, e portanto a única em que a folga entre
    // eles chega a ser medida.
    status: "em_revisao",
    ...over,
  }) as unknown as Quote;

function desenhar() {
  return render(
    <ToastProvider>
      <Kanban quotes={[pedido()]} onOpen={() => {}} onStatusChange={() => {}} userName="Catarina" />
    </ToastProvider>,
  );
}

afterEach(cleanup);

describe("Kanban no telemóvel — os botões de mover são alvos de 44 px", () => {
  it("«Mover para a coluna seguinte» leva `alvo-toque`", () => {
    desenhar();
    const seguinte = screen.getByRole("button", { name: "Mover para a coluna seguinte" });
    expect(seguinte.className).toContain("alvo-toque");
  });

  it("«Mover para a coluna anterior» leva `alvo-toque`", () => {
    desenhar();
    const anterior = screen.getByRole("button", { name: "Mover para a coluna anterior" });
    expect(anterior.className).toContain("alvo-toque");
  });

  /**
   * Dois alvos de 44 px a 4 px um do outro são, para um dedo, um alvo de 92 px
   * com uma fronteira invisível a meio — e enganar-se aqui manda o pedido para
   * a coluna errada, que é uma correcção com três toques. A folga sobe só no
   * dedo, pela mesma razão por que o tamanho sobe só no dedo.
   */
  it("a barra dos dois botões abre 8 px de folga no dedo", () => {
    desenhar();
    const barra = screen.getByRole("button", {
      name: "Mover para a coluna seguinte",
    }).parentElement;
    expect(barra?.className).toContain("pointer-coarse:gap-2");
  });
});
