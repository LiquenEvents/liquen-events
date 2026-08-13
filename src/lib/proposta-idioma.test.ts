import { describe, it, expect } from "vitest";
import { idiomaDaProposta } from "./proposta-idioma";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LEITURA DA LÍNGUA FAZ-SE NUM SÍTIO SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cinco caminhos precisam da mesma resposta — o email do envio, a página do
 * aceite, o portal, o PDF do link do cliente e o PDF do portal. Se cada um
 * escrevesse `p.idioma ?? "pt"`, bastava um esquecer-se para uma proposta
 * inglesa voltar a sair em português por uma porta só.
 *
 * A regra que este ficheiro guarda é uma: **ausente é português**. Não é uma
 * omissão preguiçosa — é a verdade sobre as propostas que existiam antes de
 * esta coluna existir, que foram todas escritas e enviadas em português.
 */
describe("idiomaDaProposta", () => {
  it("devolve a língua gravada quando ela existe", () => {
    expect(idiomaDaProposta({ idioma: "en" })).toBe("en");
    expect(idiomaDaProposta({ idioma: "pt" })).toBe("pt");
  });

  it("uma proposta ANTIGA, sem língua gravada, é PORTUGUESA", () => {
    // O caso que não pode mudar de comportamento: uma proposta de ontem
    // continua a ser lida, descarregada e respondida em português.
    expect(idiomaDaProposta({})).toBe("pt");
    expect(idiomaDaProposta({ idioma: undefined })).toBe("pt");
  });

  it("sem proposta nenhuma (link partido, portal sem proposta) também é português", () => {
    expect(idiomaDaProposta(null)).toBe("pt");
    expect(idiomaDaProposta(undefined)).toBe("pt");
  });

  it.each([["fr"], [""], ["PT"], ["en-GB"], [42], [null], [{ idioma: "en" }], [["en"]]])(
    "o que não é uma língua que se saiba desenhar (%j) vale português",
    (lixo) => {
      // Uma base sem a restrição, uma cópia de segurança restaurada à mão, um
      // campo escrito por engano: nada disso pode virar uma língua inventada a
      // atravessar o email e o PDF.
      expect(idiomaDaProposta({ idioma: lixo })).toBe("pt");
    },
  );
});
