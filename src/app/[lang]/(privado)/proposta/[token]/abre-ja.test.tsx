// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import ADescarregarAProposta from "./loading";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CASAL DEIXA DE VER UM SEPARADOR EM BRANCO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela sobre o botão «Ver a proposta online»: «demora imenso tempo a
 * carregar (…) a pessoa carrega e vai logo».
 *
 * A página da proposta é `force-dynamic` e não tinha ecrã de espera. Antes
 * deste ficheiro, o browser não recebia um único byte enquanto o servidor
 * acordava, lia o link curto, lia a proposta, assinava as fotografias e lia as
 * escolhas. Segundos de branco no telemóvel, no momento em que se decide.
 *
 * O que este teste guarda não é o desenho — é o que faz o ecrã VALER:
 *
 *   1. QUE NÃO PRECISA DE DADOS. Um ecrã de espera que espere por alguma coisa
 *      não é um ecrã de espera. Se alguém lhe puser um `await`, uma leitura ou
 *      um `"use client"`, volta o branco e nada avisa.
 *   2. QUE DIZ DE QUEM É. O logótipo do estúdio é o que o casal reconhece.
 *   3. QUE DIZ QUE ESTÁ A CARREGAR A QUEM OUVE O ECRÃ. Sem palavras, porque
 *      este ficheiro não pode saber a língua (está nos documentos do Next:
 *      «Loading UI components do not accept any parameters»), e português à
 *      frente de um casal inglês é pior do que nenhuma frase. O `aria-busy`
 *      diz-lo na língua de quem ouve.
 *   4. QUE NÃO SALTA. As medidas da moldura são as do `Shell` da página real:
 *      quando o conteúdo chega, troca-se o que está por baixo do logótipo e
 *      mais nada. Uma moldura diferente fazia a página piscar duas vezes.
 *   5. QUE O MOVIMENTO OBEDECE. O pulsar é `motion-safe` e é opacidade.
 */

const FONTE = readFileSync("src/app/[lang]/(privado)/proposta/[token]/loading.tsx", "utf8");
const PAGINA = readFileSync("src/app/[lang]/(privado)/proposta/[token]/page.tsx", "utf8");

/** Comentários fora: as palavras que se procuram vivem nos comentários. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

afterEach(cleanup);

describe("o ecrã que a proposta mostra enquanto chega", () => {
  it("não espera por dados nenhuns", () => {
    const codigo = semComentarios(FONTE);
    expect(codigo, "o ecrã de espera passou a ser um componente de cliente").not.toContain(
      '"use client"',
    );
    expect(codigo, "o ecrã de espera passou a esperar por alguma coisa").not.toMatch(/\bawait\b/);
    expect(codigo, "o ecrã de espera passou a ir buscar dados").not.toMatch(/\bfetch\(|\basync\b/);
  });

  it("mostra de quem é a proposta", () => {
    render(<ADescarregarAProposta />);
    expect(screen.getByAltText("Líquen Events")).toBeInTheDocument();
  });

  it("diz que está a carregar a quem ouve o ecrã", () => {
    const { container } = render(<ADescarregarAProposta />);
    const seccao = container.querySelector("section");
    expect(seccao?.getAttribute("aria-busy"), "deixou de se anunciar como ocupado").toBe("true");
  });

  it("os retângulos não são anunciados um a um", () => {
    // São decoração. Um leitor de ecrã a ler seis caixas vazias é pior do que
    // silêncio — o `aria-busy` já disse o que interessa.
    const { container } = render(<ADescarregarAProposta />);
    expect(container.querySelector("[aria-hidden]")).not.toBeNull();
  });

  it("tem a moldura da página verdadeira, para não saltar quando ela chega", () => {
    // As mesmas medidas do `Shell`: fundo, respiro e logótipo no mesmo sítio.
    // Com outra moldura, a página pisca duas vezes — uma a entrar, outra a
    // assentar.
    const molde = "min-h-[80vh] bg-surface flex flex-col items-center px-5 py-10 sm:py-20";
    expect(semComentarios(PAGINA), "o `Shell` da página mudou de medidas").toContain(molde);
    expect(semComentarios(FONTE), "o ecrã de espera deixou de acompanhar o `Shell`").toContain(
      molde,
    );
    // E o logótipo com o mesmo tamanho e a mesma margem.
    const logo = 'className="object-contain h-16 w-auto mb-6 opacity-90"';
    expect(semComentarios(PAGINA)).toContain(logo);
    expect(semComentarios(FONTE)).toContain(logo);
  });

  it("o esqueleto não anima — ninguém o vê a mexer, e quem o vê pediu que não mexesse", () => {
    /**
     * ── ESTE CASO GUARDAVA O CONTRÁRIO, E MUDOU ────────────────────────────
     *
     * Guardava que o esqueleto pulsava (`motion-safe:animate-pulse`). Deixou
     * de pulsar, e a razão vale a pena ficar escrita, porque a primeira
     * leitura é «tiraram uma animação, isto está mais pobre».
     *
     * A cortina (`components/Cortina.tsx`) cobre este ecrã inteiro, opaca,
     * durante toda a vida dele: da primeira entrega do servidor até o
     * documento estar lido, que é exactamente quando o esqueleto é
     * substituído. Ou seja, com movimento ligado, NINGUÉM vê este esqueleto —
     * e uma animação infinita de opacidade num contentor da largura toda, com
     * seis caixas, estava a correr a cada fotograma por baixo de uma coisa
     * opaca, a disputar a linha principal com a animação que se vê.
     *
     * E quem O VÊ é precisamente quem pediu MENOS movimento: para esses a
     * cortina é `display: none`, e o esqueleto fica à vista. Um esqueleto
     * quieto é o que essa pessoa pediu.
     *
     * Portanto: nenhuma animação aqui. Se um dia voltar a fazer falta, tem de
     * ser `motion-safe` e de opacidade — e este caso passa a ter de mudar de
     * novo, com a razão escrita.
     */
    const codigo = semComentarios(FONTE);
    expect(codigo, "voltou uma animação a correr por baixo da cortina").not.toMatch(
      /animate-(pulse|bounce|spin|ping)/,
    );
  });
});
