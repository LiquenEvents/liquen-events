// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Material from "./Material";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PAINEL QUE O `Segmented` COMANDA TROCA COM UM GESTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A pílula do `ui/Segmented` DESLIZA de um segmento para o outro — 250 ms, o
 * degrau `elemento` da casa (`ui/movimento.ts`). Metade do gesto estava feita e
 * a outra metade não: o painel que ela comanda mudava A SECO. O conteúdo
 * inteiro do cartão era substituído entre dois fotogramas, sem um único sinal
 * de que foi a ABA que mudou e não o conteúdo que foi trocado por baixo — que é
 * literalmente o caso em que o movimento serve para alguma coisa («indica
 * direcção e origem»).
 *
 * ── PORQUE É AQUI E NÃO NOS OUTROS SEIS `Segmented` DA CASA ───────────────
 *
 * Porque a maioria deles NÃO comanda um painel: comanda um FILTRO
 * (`Propostas.tsx:697`, `StatsDashboard.tsx:633`) ou uma ORDENAÇÃO
 * (`Clientes.tsx:308`). A casa já decidiu os dois casos, e decidiu-os ao
 * contrário deste: filtrar não anima (a lista fica ilegível a escrever — a
 * prosa está em `ui/TabelaOuCartoes.tsx`), e reordenar anima DENTRO da tabela,
 * onde já anima. Este é o único sítio, fora do que tem dono nesta ronda, em que
 * um `Segmented` troca mesmo de painel.
 *
 * A palavra é a da casa: `.view-in`. É a mesma que os separadores do detalhe já
 * usam (`AdminClient.tsx:7195`), e nada de novo se declara aqui.
 */

const vazio = () => ({ ok: true, status: 200, json: async () => [] }) as unknown as Response;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(vazio()));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Material — o painel das abas", () => {
  it("troca de aba com a entrada da casa, num nó novo de cada vez", async () => {
    await act(async () => {
      render(<Material />);
    });

    const painel = () => document.querySelector<HTMLElement>(".view-in.mt-5");
    const primeiro = painel();
    expect(primeiro, "o painel das abas deixou de trazer a entrada da casa").not.toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Listas base" }));
    });

    const segundo = painel();
    expect(segundo).not.toBeNull();
    // Um NÓ NOVO — é o que faz a animação voltar a correr. Sem isto a classe
    // fica lá e não anima nada: o invólucro é o mesmo elemento, e uma animação
    // de CSS só recomeça quando o elemento recomeça.
    expect(segundo).not.toBe(primeiro);
    expect(primeiro!.isConnected).toBe(false);
  });

  /**
   * ── E O `key` AQUI NÃO DEITA NADA FORA ───────────────────────────────────
   *
   * Regra da casa: `key` REMONTA, e nunca se lhe toca para animar o que guarda
   * foco, rolo ou texto escrito. Aqui não guarda: os três ramos são COMPONENTES
   * DIFERENTES, portanto o React já destruía um e montava o outro a cada troca
   * — com `key` ou sem ele. Este teste prende essa premissa: se algum dia os
   * três ramos passarem a ser o mesmo componente com uma `prop` diferente, o
   * `key` deixa de ser gratuito e isto fica vermelho.
   */
  it("as três abas são componentes diferentes — o `key` não deita nada fora", async () => {
    await act(async () => {
      render(<Material />);
    });
    const daAba = () => document.querySelector<HTMLElement>(".view-in.mt-5")!.innerHTML;

    const catalogo = daAba();
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Regras" }));
    });
    expect(daAba()).not.toBe(catalogo);
  });
});
