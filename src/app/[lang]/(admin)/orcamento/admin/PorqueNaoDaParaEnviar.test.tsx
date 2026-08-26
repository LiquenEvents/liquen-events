// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PorqueNaoDaParaEnviar from "./PorqueNaoDaParaEnviar";
import type { Impedimento } from "@/lib/proposal-progress";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A RAZÃO TEM DE ESTAR NO ECRÃ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quando falta alguma coisa na proposta, quero que apareça um
 * aviso a dizer que não dá para enviar porque não preenchi tal coisa».
 *
 * A razão existia, e vivia no `title` do botão — uma bolha que só aparece com o
 * rato parado em cima, e que num iPhone não aparece de todo. Ela chegava ao
 * último ecrã, carregava, não acontecia nada, e não havia uma palavra a
 * explicar porquê.
 */

afterEach(cleanup);

const falta = (over: Partial<Impedimento> = {}): Impedimento => ({
  id: "nome",
  seccao: "evento",
  campo: "clientNames",
  texto: "Falta o nome dos clientes",
  trava: true,
  ...over,
});

describe("porque é que não dá para enviar", () => {
  it("nomeia o que falta, palavra por palavra", () => {
    render(
      <PorqueNaoDaParaEnviar
        faltas={[falta(), falta({ id: "servicos", texto: "A secção Serviços está vazia" })]}
        fotosPorConfirmar={0}
        emailDoCliente="melanie@exemplo.pt"
        onIr={vi.fn()}
      />,
    );
    expect(screen.getByText("Não dá para enviar: faltam 2 coisas.")).toBeTruthy();
    expect(screen.getByText("Falta o nome dos clientes")).toBeTruthy();
    expect(screen.getByText("A secção Serviços está vazia")).toBeTruthy();
  });

  it("uma falta só não se diz no plural", () => {
    render(
      <PorqueNaoDaParaEnviar
        faltas={[falta()]}
        fotosPorConfirmar={0}
        emailDoCliente="melanie@exemplo.pt"
        onIr={vi.fn()}
      />,
    );
    expect(screen.getByText("Não dá para enviar: falta uma coisa.")).toBeTruthy();
  });

  /**
   * DIZER O QUE FALTA SEM DIZER ONDE É MEIA RESPOSTA.
   */
  it("cada linha salta para onde se preenche", () => {
    const onIr = vi.fn();
    const f = falta();
    render(
      <PorqueNaoDaParaEnviar
        faltas={[f]}
        fotosPorConfirmar={0}
        emailDoCliente="melanie@exemplo.pt"
        onIr={onIr}
      />,
    );
    fireEvent.click(screen.getByText("Falta o nome dos clientes"));
    expect(onIr).toHaveBeenCalledWith(f);
  });

  /** Um conselho não trava nada, e não pode aparecer como se travasse. */
  it("os conselhos ficam de fora", () => {
    render(
      <PorqueNaoDaParaEnviar
        faltas={[falta({ id: "capas", texto: "Sem imagens de capa", trava: false })]}
        fotosPorConfirmar={0}
        emailDoCliente="melanie@exemplo.pt"
        onIr={vi.fn()}
      />,
    );
    expect(screen.queryByText("Sem imagens de capa")).toBeNull();
    expect(screen.queryByText(/Não dá para enviar/)).toBeNull();
  });

  it("com tudo preenchido não sobra aviso nenhum — só o endereço", () => {
    render(
      <PorqueNaoDaParaEnviar
        faltas={[]}
        fotosPorConfirmar={0}
        emailDoCliente="melanie@exemplo.pt"
        onIr={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Não dá para enviar/)).toBeNull();
    expect(screen.getByText("melanie@exemplo.pt")).toBeTruthy();
  });

  /**
   * A ESPERA NÃO É UMA FALTA.
   *
   * Nada está por preencher: há fotografias a subir. Dizer «falta preencher»
   * mandava-a procurar um campo que já está preenchido.
   */
  it("fotografias a entrar dizem-se como espera, e não como falta", () => {
    render(
      <PorqueNaoDaParaEnviar
        faltas={[]}
        fotosPorConfirmar={2}
        emailDoCliente="melanie@exemplo.pt"
        onIr={vi.fn()}
      />,
    );
    expect(screen.getByText(/Ainda há 2 fotografias a entrar/)).toBeTruthy();
    expect(screen.queryByText(/Não dá para enviar/)).toBeNull();
  });

  it("havendo faltas E fotos a entrar, as faltas é que se dizem", () => {
    // Resolver as fotos não desbloqueia nada enquanto o nome não estiver lá.
    render(
      <PorqueNaoDaParaEnviar
        faltas={[falta()]}
        fotosPorConfirmar={2}
        emailDoCliente="melanie@exemplo.pt"
        onIr={vi.fn()}
      />,
    );
    expect(screen.getByText("Falta o nome dos clientes")).toBeTruthy();
    expect(screen.queryByText(/Ainda há 2 fotografias/)).toBeNull();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PARA ONDE É QUE ISTO VAI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «a proposta para "Melanie e Sebastien" ia para
 * franciscomariagaspar6@gmail.com. Nada avisa que o destinatário não é o
 * cliente.»
 *
 * O endereço só aparecia DEPOIS de carregar em «Gerar e enviar», na frase de
 * confirmação — um clique depois de a decisão de enviar já estar tomada.
 */
describe("o destinatário", () => {
  const desenhar = (email?: string) =>
    render(
      <PorqueNaoDaParaEnviar
        faltas={[]}
        fotosPorConfirmar={0}
        emailDoCliente={email}
        onIr={vi.fn()}
      />,
    );

  it("está à vista antes de se carregar em enviar", () => {
    desenhar("franciscomariagaspar6@gmail.com");
    expect(screen.getByText("franciscomariagaspar6@gmail.com")).toBeTruthy();
  });

  it("um endereço da casa diz que a proposta ia para nós", () => {
    desenhar("liquen.alentejo@gmail.com");
    expect(screen.getByText(/endereço da casa/i)).toBeTruthy();
  });

  it("um email de cliente qualquer passa calado", () => {
    // A maioria dos endereços de casamento não tem o nome de ninguém lá
    // dentro. Um aviso que dispara neles ensina-se a ignorar.
    desenhar("geral@quinta.pt");
    expect(screen.getByText("geral@quinta.pt")).toBeTruthy();
    expect(screen.queryByText(/endereço da casa/i)).toBeNull();
  });

  it("sem email, diz que a proposta fica guardada e não sai", () => {
    desenhar(undefined);
    expect(screen.getByText(/não tem email de cliente/i)).toBeTruthy();
  });
});
