import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { textosDoEmailDaProposta } from "@/lib/email-proposta-textos";
import { textosDaProposta } from "@/lib/proposal-doc-textos";
import { pt } from "@/lib/i18n/pt";
import { en } from "@/lib/i18n/en";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CLIENTE NÃO ACEITA UMA PROPOSTA COM UM CLIQUE — E ISTO GUARDA-O
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A dona da casa mandou tirar, com urgência e por escrito: «não quero que eles
 * cliquem num botão para aceitarem a proposta — quero que digam apenas por
 * e-mail ou por telefone se é para avançar». E acrescentou o que este ficheiro
 * existe para garantir: «quero ter a certeza mesmo que isso não acontece».
 *
 * A razão é do negócio, não do código: um casamento não se fecha num botão.
 * Fecha-se numa conversa — e uma proposta «recusada» com um toque distraído no
 * telemóvel é um negócio perdido sem ninguém ter falado com ninguém.
 *
 * ── PORQUE É QUE ISTO LÊ FICHEIROS ────────────────────────────────────────
 *
 * Um teste que montasse a página e não encontrasse o botão provaria pouco: o
 * botão pode voltar por outro caminho — um modelo de email, uma frase no PDF,
 * uma rota reposta por engano num merge. O que se está a guardar não é um
 * componente, é uma PROMESSA feita ao cliente, e ela vive em quatro sítios ao
 * mesmo tempo. Por isso verificam-se os quatro, incluindo a ausência do
 * ficheiro da rota que gravava a decisão: enquanto essa rota existisse, uma
 * ligação antiga numa caixa de correio continuava a poder gravar um «aceito»
 * que ninguém quis.
 */

const RAIZ = process.cwd();
/**
 * O ficheiro SEM comentários.
 *
 * A primeira versão deste teste falhou sobre a própria explicação: o comentário
 * que conta porque é que os botões saíram cita-lhes os nomes, e a procura
 * encontrava-os aí. Um comentário não é um botão — o que se está a proibir é o
 * que CORRE. Tirar os comentários antes de procurar é o que faz a diferença
 * entre guardar uma promessa e proibir uma palavra.
 */
const ler = (caminho: string) =>
  readFileSync(join(RAIZ, caminho), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("nada no que sai para o cliente lhe pede para aceitar com um clique", () => {
  it("a rota que gravava a resposta do cliente NÃO existe", () => {
    // O caminho do PDF (`/api/proposta/[token]/pdf`) fica: é por ele que o
    // casal vê o documento quando já arquivou o email. O que não pode existir
    // é o `POST /api/proposta`, que era quem escrevia «aceite» ou «recusada».
    expect(
      existsSync(join(RAIZ, "src/app/api/proposta/route.ts")),
      "voltou a haver uma rota que grava a resposta do cliente",
    ).toBe(false);
    expect(existsSync(join(RAIZ, "src/app/api/proposta/[token]/pdf")), "o PDF tem de ficar").toBe(
      true,
    );
  });

  it("a página do casal não tem formulário de aceitar nem de recusar", () => {
    const pagina = ler("src/app/[lang]/(site)/proposta/[token]/page.tsx");
    for (const marca of ["ProposalResponse", "Aceitar proposta", "Recusar proposta"]) {
      expect(pagina, `«${marca}» voltou à página do cliente`).not.toContain(marca);
    }
    // E o ficheiro do formulário não voltou a nascer ao lado dela.
    expect(
      existsSync(join(RAIZ, "src/app/[lang]/(site)/proposta/[token]/ProposalResponse.tsx")),
      "o formulário de resposta voltou",
    ).toBe(false);
  });

  it("a página diz, nas duas línguas, que se responde por e-mail ou por telefone", () => {
    // Tirar o botão sem pôr nada no lugar deixava o casal sem saber o que
    // fazer a seguir — que é a maneira mais silenciosa de perder um negócio.
    expect(pt.proposta.respostaComo).toMatch(/e-mail.*telefone/i);
    expect(en.proposta.respostaComo).toMatch(/email.*phone/i);
  });

  it("o PDF não manda aceitar online — manda responder", () => {
    for (const idioma of ["pt", "en"] as const) {
      const passo = textosDaProposta(idioma).passoAceitar;
      expect(passo, `o PDF ${idioma} manda aceitar online`).not.toMatch(
        /aceit\w*[- ]?(a|à)?[- ]?la online|accept it online|through the link|através da ligação/i,
      );
      expect(passo, `o PDF ${idioma} não diz como responder`).toMatch(
        idioma === "pt" ? /e-mail|telefone/i : /email|phone/i,
      );
    }
  });

  it("o botão do email leva a VER a proposta, não a respondê-la ali", () => {
    for (const idioma of ["pt", "en"] as const) {
      const textos = textosDoEmailDaProposta(idioma);
      expect(textos.botao, `o botão do email ${idioma} convida a responder online`).not.toMatch(
        /responder|reply|aceitar|accept/i,
      );
      expect(textos.verOnline, `a ligação do email ${idioma} idem`).not.toMatch(
        /responder|reply|aceitar|accept/i,
      );
    }
  });

  it("os textos do formulário antigo saíram do dicionário", () => {
    // Deixá-los cá era deixar meio caminho andado para alguém voltar a ligar o
    // formulário sem dar por isso — e um dicionário que promete botões que não
    // existem é uma armadilha para quem vier a seguir.
    const proposta = pt.proposta as unknown as Record<string, unknown>;
    expect(proposta.response, "o bloco `response` voltou").toBeUndefined();
    expect(proposta.terms, "o bloco `terms` voltou").toBeUndefined();
  });
});
