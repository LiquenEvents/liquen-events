// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  RegistoDeGravacoesProvider,
  useInscricaoNoRegisto,
  type ResultadoDoEcra,
} from "./registo-de-gravacoes";
import BotaoGuardarTudo from "./GuardarTudo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM GESTO QUE GRAVA TUDO — E QUE DIZ O QUE ACONTECEU A CADA UM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela perdeu uma proposta. O pedido dela foi: «quero que o botão guardar seja
 * incrível e guarde tudo aquilo que foi feito no back office» — não um botão
 * por ecrã, mas um gesto que lhe dê a certeza de que nada fica para trás
 * quando ela fecha o portátil e vai para o carro.
 *
 * O back office tem quatro sítios a gravar bem, e até aqui nenhum falava pelos
 * outros. Estes testes seguram as cinco coisas sem as quais o botão volta a ser
 * mais uma promessa:
 *
 *  1. dois ecrãs com trabalho por gravar são gravados por UM só gesto;
 *  2. um que falha é NOMEADO na resposta — nunca desaparece atrás de um
 *     «guardado», que é exactamente a mentira que fez perder a proposta;
 *  3. o contador desce à medida que gravam (é o que torna o botão útil ANTES
 *     de se carregar nele);
 *  4. o ⌘/Ctrl+S faz o mesmo que o botão, e não uma segunda coisa parecida;
 *  5. um ecrã que desmonta sai do registo — senão o botão fica para sempre a
 *     dizer que há coisa por gravar, e um contador que mente deixa de se ler.
 */

afterEach(cleanup);

/**
 * Um ecrã de mentira que se inscreve no registo, exactamente como um ecrã a
 * sério: diz o nome por que quer ser chamado, se tem coisa por gravar, e sabe
 * gravar já.
 */
function EcraDeTeste({
  nome,
  resultado = { estado: "guardado" },
  aoGravar,
}: {
  nome: string;
  resultado?: ResultadoDoEcra;
  aoGravar?: (nome: string) => void;
}) {
  const [porGravar, setPorGravar] = useState(true);
  useInscricaoNoRegisto({
    nome,
    porGravar,
    gravarJa: async () => {
      aoGravar?.(nome);
      // Só deixa de haver coisa por gravar quando ficou mesmo guardada: um ecrã
      // que falhou continua a ter trabalho pendente, e o contador tem de o
      // continuar a contar.
      if (resultado.estado === "guardado") setPorGravar(false);
      return resultado;
    },
  });
  // Não desenha nada de propósito: o que se lê no ecrã sobre este ecrã é o que
  // o BOTÃO diz dele, e é isso que estes testes lêem.
  return null;
}

function montar(children: React.ReactNode) {
  return render(
    <RegistoDeGravacoesProvider>
      <BotaoGuardarTudo />
      {children}
    </RegistoDeGravacoesProvider>,
  );
}

const botao = () => screen.getByRole("button", { name: /guardar tudo|tudo guardado/i });

describe("O botão «Guardar tudo» — o que diz antes de se carregar nele", () => {
  it("sem nada por gravar, é um estado calmo e não um alarme", () => {
    montar(null);
    expect(screen.getByRole("button", { name: /tudo guardado/i })).toBeInTheDocument();
  });

  it("com dois ecrãs por gravar, diz QUANTOS estão por gravar", async () => {
    montar(
      <>
        <EcraDeTeste nome="Proposta de Rita & Tomás" />
        <EcraDeTeste nome="Notas do pedido LQ-042" />
      </>,
    );
    expect(await screen.findByRole("button", { name: /guardar tudo \(2\)/i })).toBeInTheDocument();
  });

  /**
   * Sem isto o botão fica para sempre a dizer que há coisa por gravar de um
   * ecrã que já não existe — e um contador que mente é um contador que se
   * deixa de ler, que é a mesma avaria de origem noutro sítio.
   */
  it("um ecrã que desmonta sai do registo", async () => {
    const { rerender } = render(
      <RegistoDeGravacoesProvider>
        <BotaoGuardarTudo />
        <EcraDeTeste nome="Proposta de Rita & Tomás" />
      </RegistoDeGravacoesProvider>,
    );
    await screen.findByRole("button", { name: /guardar tudo \(1\)/i });

    rerender(
      <RegistoDeGravacoesProvider>
        <BotaoGuardarTudo />
      </RegistoDeGravacoesProvider>,
    );
    expect(await screen.findByRole("button", { name: /tudo guardado/i })).toBeInTheDocument();
  });
});

describe("O botão «Guardar tudo» — o gesto", () => {
  it("grava os dois ecrãs de uma vez, e o contador desce", async () => {
    const gravados: string[] = [];
    const user = userEvent.setup();
    montar(
      <>
        <EcraDeTeste nome="Proposta de Rita & Tomás" aoGravar={(n) => gravados.push(n)} />
        <EcraDeTeste nome="Notas do pedido LQ-042" aoGravar={(n) => gravados.push(n)} />
      </>,
    );
    await screen.findByRole("button", { name: /guardar tudo \(2\)/i });

    await user.click(botao());

    expect(gravados.sort()).toEqual(["Notas do pedido LQ-042", "Proposta de Rita & Tomás"]);
    // O contador desce sozinho: quem gravou deixa de ter coisa por gravar.
    expect(await screen.findByRole("button", { name: /tudo guardado/i })).toBeInTheDocument();
  });

  it("com tudo gravado, di-lo — e diz onde ficou cada um", async () => {
    const user = userEvent.setup();
    montar(
      <>
        <EcraDeTeste nome="Proposta de Rita & Tomás" />
        <EcraDeTeste nome="Notas do pedido LQ-042" />
      </>,
    );
    await screen.findByRole("button", { name: /guardar tudo \(2\)/i });
    await user.click(botao());

    expect(await screen.findByText(/está tudo guardado no servidor/i)).toBeInTheDocument();
    expect(screen.getByText(/Proposta de Rita & Tomás/)).toBeInTheDocument();
    expect(screen.getByText(/Notas do pedido LQ-042/)).toBeInTheDocument();
  });

  /**
   * O caso que fez perder a proposta, agora à escala do botão: um de três
   * falha, e a resposta arredonda para «guardado». Se isto passar, ela fecha o
   * portátil por causa de uma palavra que não era verdade.
   */
  it("um que falha é NOMEADO, e a resposta não é «guardado»", async () => {
    const user = userEvent.setup();
    montar(
      <>
        <EcraDeTeste nome="Proposta de Rita & Tomás" />
        <EcraDeTeste
          nome="Modelo de email «sinal recebido»"
          resultado={{ estado: "nao-guardado", porque: "A sessão expirou — volte a entrar." }}
        />
        <EcraDeTeste nome="Notas do pedido LQ-042" />
      </>,
    );
    await screen.findByRole("button", { name: /guardar tudo \(3\)/i });
    await user.click(botao());

    // O número não arredonda para melhor.
    expect(await screen.findByText(/faltou guardar 1 de 3/i)).toBeInTheDocument();
    // E o que falhou tem NOME e motivo — não é «alguma coisa correu mal».
    const linha = screen.getByText(/Modelo de email «sinal recebido»/).closest("li");
    expect(linha).toHaveTextContent(/não ficou guardado/i);
    expect(linha).toHaveTextContent(/A sessão expirou/i);
    // O que falhou continua por gravar, e o botão continua a dizê-lo.
    expect(await screen.findByRole("button", { name: /guardar tudo \(1\)/i })).toBeInTheDocument();
  });

  /**
   * «Guardado só neste computador» é o terceiro desfecho, e não pode ser
   * contado como guardado: é trabalho que desaparece ao mudar de portátil.
   */
  it("o que ficou só neste computador é dito com essas palavras", async () => {
    const user = userEvent.setup();
    montar(
      <EcraDeTeste
        nome="Proposta de Rita & Tomás"
        resultado={{ estado: "so-neste-computador", porque: "O servidor não aceitou a gravação." }}
      />,
    );
    await screen.findByRole("button", { name: /guardar tudo \(1\)/i });
    await user.click(botao());

    expect(await screen.findByText(/faltou guardar 1 de 1/i)).toBeInTheDocument();
    const linha = screen.getByText(/Proposta de Rita & Tomás/).closest("li");
    expect(linha).toHaveTextContent(/só neste computador/i);
    expect(linha).not.toHaveTextContent(/guardado no servidor/i);
  });

  it("sem nada por gravar, di-lo em vez de fingir que gravou", async () => {
    const user = userEvent.setup();
    montar(null);
    await user.click(botao());
    expect(await screen.findByText(/não havia nada por gravar/i)).toBeInTheDocument();
  });

  /** O atalho que toda a gente já tem nos dedos. É o MESMO gesto — não uma
   *  segunda gravação com outras regras e outras palavras. */
  it("⌘/Ctrl+S faz o mesmo que o botão", async () => {
    const gravados: string[] = [];
    const user = userEvent.setup();
    montar(
      <>
        <EcraDeTeste nome="Proposta de Rita & Tomás" aoGravar={(n) => gravados.push(n)} />
        <EcraDeTeste nome="Notas do pedido LQ-042" aoGravar={(n) => gravados.push(n)} />
      </>,
    );
    await screen.findByRole("button", { name: /guardar tudo \(2\)/i });

    await user.keyboard("{Control>}s{/Control}");

    expect(gravados.sort()).toEqual(["Notas do pedido LQ-042", "Proposta de Rita & Tomás"]);
    expect(await screen.findByText(/está tudo guardado no servidor/i)).toBeInTheDocument();
  });
});

describe("Fechar o separador — uma pergunta só, que diz o que se perde", () => {
  /**
   * O `returnValue` do jsdom é o booleano legado, e engolia a frase. Por isso a
   * frase é apanhada com um espião no próprio evento: o que se quer prender
   * aqui é que o travão SABE dizer o que se perde, e não o que cada browser
   * decidiu fazer com essa frase.
   */
  function fecharSeparador() {
    const evento = new Event("beforeunload", { cancelable: true });
    let frase = "";
    Object.defineProperty(evento, "returnValue", {
      configurable: true,
      get: () => frase,
      set: (v: unknown) => {
        frase = String(v);
      },
    });
    window.dispatchEvent(evento);
    return { travou: evento.defaultPrevented, frase };
  }

  it("com trabalho por gravar, trava — e nomeia o que está por gravar", async () => {
    montar(
      <>
        <EcraDeTeste nome="Proposta de Rita & Tomás" />
        <EcraDeTeste nome="Notas do pedido LQ-042" />
      </>,
    );
    await screen.findByRole("button", { name: /guardar tudo \(2\)/i });

    const { travou, frase } = fecharSeparador();
    expect(travou).toBe(true);
    expect(frase).toContain("Proposta de Rita & Tomás");
    expect(frase).toContain("Notas do pedido LQ-042");
  });

  it("com tudo guardado, não pergunta nada", async () => {
    const user = userEvent.setup();
    montar(<EcraDeTeste nome="Proposta de Rita & Tomás" />);
    await screen.findByRole("button", { name: /guardar tudo \(1\)/i });
    await act(async () => {
      await user.click(botao());
    });

    expect(fecharSeparador().travou).toBe(false);
  });
});
