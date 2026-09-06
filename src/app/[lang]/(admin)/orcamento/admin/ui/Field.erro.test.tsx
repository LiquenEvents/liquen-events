// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Field } from "./Field";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LINHA DE ERRO APARECE DE ALGUM SÍTIO — E NÃO SE FAZ ESPERAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A dica e o erro trocam de lugar (`hint && !error` / `error &&`): quando o
 * erro chega, uma linha desaparece e outra monta no mesmo fotograma. Lê-se como
 * um salto do formulário, e não como uma resposta ao que se acabou de escrever.
 *
 * Passa a `.bo-entrada` nua — quatro píxeis, a distância de um RÓTULO. Não é um
 * aviso que chega de fora do ecrã: nasce colada ao campo que a explica.
 *
 * ── E O TESTE QUE INTERESSA É O SEGUNDO ───────────────────────────────────
 *
 * Uma animação numa mensagem de erro só é aceitável enquanto não atrasar a
 * mensagem. O `<p>` tem de estar no DOM, com o seu `id`, e o controlo tem de o
 * apontar no `aria-describedby` desde o primeiro fotograma — quem ouve o ecrã
 * ouve o erro ao mesmo tempo que quem o vê, anime-se ou não.
 *
 * ── HONESTIDADE SOBRE O TAMANHO DISTO ─────────────────────────────────────
 *
 * Hoje o `error` do `Field` tem UM chamador em toda a pasta
 * (`EmailDoEnvio.tsx:368`). Isto é higiene do primitivo, não o ganho do dia — e
 * fica dito aqui para ninguém o ler como mais do que é.
 */

afterEach(cleanup);

describe("a linha de erro do Field", () => {
  it("não existe enquanto não houver erro", () => {
    render(<Field label="Assunto" hint="Só para uso interno." />);
    expect(screen.getByText("Só para uso interno.").className).not.toContain("bo-entrada");
    expect(screen.queryByText("Falta o assunto.")).toBeNull();
  });

  it("entra com a palavra da casa, à distância de um rótulo", () => {
    render(<Field label="Assunto" error="Falta o assunto." />);
    const linha = screen.getByText("Falta o assunto.").closest("p");
    expect(linha, "a linha de erro não montou").not.toBeNull();
    expect(linha!.className, "a linha de erro ainda monta de repente").toContain("bo-entrada");
    // Quatro píxeis: isto não vem de fora do ecrã, vem do campo que está por
    // cima dela. Oito seriam os de uma folha ou de um aviso.
    expect(linha!.className).not.toContain("bo-entrada-folha");
    expect(linha!.className).not.toContain("bo-entrada-fundo");
  });

  it("e a mensagem chega a quem ouve o ecrã sem esperar pela animação", () => {
    render(<Field label="Assunto" error="Falta o assunto." />);
    const campo = screen.getByLabelText("Assunto");
    const linha = screen.getByText("Falta o assunto.").closest("p")!;

    // No MESMO fotograma em que a animação começa: o `id` existe, o
    // `aria-describedby` aponta-lhe, e o `aria-invalid` está posto.
    expect(linha.id).toBeTruthy();
    expect(campo.getAttribute("aria-describedby")).toContain(linha.id);
    expect(campo.getAttribute("aria-invalid")).toBe("true");
  });

  it("e o erro substitui a dica — não se empilham duas linhas", () => {
    render(<Field label="Assunto" hint="Só para uso interno." error="Falta o assunto." />);
    expect(screen.queryByText("Só para uso interno.")).toBeNull();
    expect(screen.getByText("Falta o assunto.").closest("p")!.className).toContain("bo-entrada");
  });
});
