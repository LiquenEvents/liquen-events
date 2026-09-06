import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  agruparOrigens,
  detalheDaOrigem,
  reconhecerOrigem,
  resumoDaEtiqueta,
  tituloDaOrigem,
  MARCA_A_CHEGAR,
} from "./origem-do-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O INSTAGRAM DELA ESTAVA DIVIDIDO EM TRÊS, E ISSO É UMA CONTA ERRADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que se pediu era «troca as etiquetas cruas pelos nomes das aplicações».
 * O que se encontrou pelo caminho é que as etiquetas cruas não estavam só
 * feias: estavam a partir a MESMA origem em várias linhas. O `referralSource`
 * é composto pelo `LeadSourceCapture` com o que cada visita calhou de trazer,
 * portanto o mesmo Instagram chega ao armazém de três maneiras:
 *
 *     source=ig medium=social content=link_in_bio · ref:l.instagram.com
 *     source=ig medium=social content=link_in_bio
 *     ref:www.instagram.com
 *
 * Agrupadas pela cadeia crua — que era o que o `StatsDashboard` fazia — são
 * três linhas. São uma.
 *
 * Por isso o teste que interessa neste ficheiro NÃO é o dos nomes bonitos: é
 * o das CONTAGENS, e tem duas metades que só valem juntas —
 *
 *   · duas etiquetas diferentes do Instagram têm de cair na MESMA linha;
 *   · e duas origens diferentes têm de CONTINUAR separadas.
 *
 * Sem a segunda metade, o teste passaria com uma função que devolvesse sempre
 * a mesma chave e juntasse o mundo inteiro numa barra só — que é o modo de
 * falhar mais caro desta correcção. Juntar duas coisas que não são a mesma é
 * pior do que não juntar nada: pelo menos o «não juntar» vê-se.
 */

describe("as contagens: o que se junta e o que NÃO se junta", () => {
  /**
   * Os números do «antes» são os que o painel mostrava mesmo, medidos com
   * dados de trabalho semeados para isto. Ficam escritos porque são a razão de
   * ser da correcção: 9 é o que se via, 18 é o que era.
   */
  const PEDIDOS_DO_INSTAGRAM = [
    ...Array<string>(9).fill("source=ig medium=social content=link_in_bio · ref:l.instagram.com"),
    ...Array<string>(6).fill("source=ig medium=social content=link_in_bio"),
    ...Array<string>(3).fill("ref:www.instagram.com"),
  ];

  it("as três etiquetas do Instagram passam a ser UMA linha de 18", () => {
    const linhas = agruparOrigens(
      PEDIDOS_DO_INSTAGRAM.map((origem) => ({ origem, aceite: false })),
    );

    // ANTES: três linhas de 9, 6 e 3. DEPOIS: uma de 18.
    expect(linhas).toHaveLength(1);
    expect(linhas[0].nome).toBe("Instagram");
    expect(linhas[0].total).toBe(18);
    expect(linhas[0].chave).toBe("marca:instagram");
  });

  it("mas o Google, o Facebook e o Instagram CONTINUAM três linhas", () => {
    const linhas = agruparOrigens(
      [
        ...PEDIDOS_DO_INSTAGRAM,
        ...Array<string>(7).fill("ref:www.google.com"),
        ...Array<string>(4).fill("source=google medium=cpc campaign=frio-noivos-comporta"),
        ...Array<string>(3).fill("source=fb medium=paid_social campaign=retarget"),
        ...Array<string>(2).fill("ref:m.facebook.com"),
      ].map((origem) => ({ origem, aceite: false })),
    );

    expect(linhas.map((l) => [l.nome, l.total])).toEqual([
      ["Instagram", 18],
      ["Google", 11],
      ["Facebook", 5],
    ]);
  });

  /**
   * A METADE QUE IMPEDE O REMÉDIO DE SER PIOR DO QUE A DOENÇA.
   *
   * Uma normalização demasiado gulosa junta coisas que não são a mesma, e
   * ninguém dá por isso porque o painel fica bonito na mesma. Estes seis casos
   * são os que se pareciam o suficiente para tentar a sorte.
   */
  it("e o que só se PARECE não se junta", () => {
    const pares: [string, string][] = [
      // O Gmail não é a pesquisa da Google. Quem clicou num link dentro de um
      // email não «veio da Google», e contá-lo assim inflacionava justamente a
      // linha por que se decide se se paga anúncios.
      ["ref:mail.google.com", "ref:www.google.com"],
      // Um domínio que CONTÉM o nome não é o domínio.
      ["ref:googleusercontent.com", "ref:www.google.com"],
      ["ref:notinstagram.com", "ref:www.instagram.com"],
      // Duas origens escritas à mão, ambas por reconhecer: ficam separadas.
      ["Feira de noivos de Lisboa", "Revista de casamentos"],
      // «Não indicado» não é passa-a-palavra, por mais que contenha «indicad».
      ["Não indicado", "Recomendação de um casal anterior"],
      // Um `utm_source` que não se reconhece não vai para o saco de ninguém.
      ["source=parceiro medium=referral", "source=ig medium=social"],
    ];

    for (const [a, b] of pares) {
      expect(
        reconhecerOrigem(a).chave,
        `«${a}» e «${b}» foram juntos, e não são a mesma origem`,
      ).not.toBe(reconhecerOrigem(b).chave);
    }
  });

  it("os aceites seguem a linha certa, e a taxa é a da origem inteira", () => {
    // Dois aceites em dezoito pedidos do Instagram: 11%. ANTES, o painel
    // mostrava DUAS taxas para o Instagram na mesma lista (11% numa linha de
    // nove, 17% noutra de seis) — nenhuma delas a taxa do Instagram.
    const linhas = agruparOrigens(
      PEDIDOS_DO_INSTAGRAM.map((origem, i) => ({ origem, aceite: i === 0 || i === 10 })),
    );
    expect(linhas[0].total).toBe(18);
    expect(linhas[0].aceites).toBe(2);
    expect(linhas[0].taxa).toBe(11);
  });
});

describe("nada se deita fora", () => {
  it("uma etiqueta por reconhecer continua a contar, arrumada", () => {
    const { nome, chave, marca } = reconhecerOrigem(
      "source=parceiro medium=referral content=folheto-2026",
    );
    expect(nome).toBe("Parceiro");
    expect(chave).toBe("utm:parceiro");
    expect(marca).toBe("outra");
  });

  it("um referenciador por reconhecer mostra-se pelo domínio, sem `ref:` nem `www.`", () => {
    expect(reconhecerOrigem("ref:www.casamentos.pt").nome).toBe("casamentos.pt");
  });

  it("e prosa que ninguém previu mostra-se tal como foi escrita", () => {
    expect(reconhecerOrigem("Feira de noivos de Lisboa").nome).toBe("Feira de noivos de Lisboa");
  });

  it("uma linha juntada diz do que é feita, e a soma das partes é o total", () => {
    const [linha] = agruparOrigens(
      [
        ...Array<string>(9).fill(
          "source=ig medium=social content=link_in_bio · ref:l.instagram.com",
        ),
        ...Array<string>(6).fill("source=ig medium=social content=link_in_bio"),
      ].map((origem) => ({ origem, aceite: false })),
    );

    expect(linha.partes.reduce((s, p) => s + p.total, 0)).toBe(linha.total);
    expect(detalheDaOrigem(linha)).toBe("l.instagram.com ×9 · link_in_bio ×6");
    expect(tituloDaOrigem(linha)).toContain("Instagram: 15 pedidos");
    // A etiqueta CRUA continua a existir algures — no `title`, letra por letra.
    expect(tituloDaOrigem(linha)).toContain("ref:l.instagram.com");
  });

  it("e uma linha que não juntou nada não inventa detalhe nenhum", () => {
    const [linha] = agruparOrigens([{ origem: "Contacto direto", aceite: false }]);
    expect(detalheDaOrigem(linha)).toBeNull();
  });

  it("o resumo mostra o que DISTINGUE a etiqueta, não a etiqueta toda", () => {
    expect(resumoDaEtiqueta("source=ig medium=social content=link_in_bio")).toBe("link_in_bio");
    expect(resumoDaEtiqueta("source=ig medium=social · ref:l.instagram.com")).toBe(
      "l.instagram.com",
    );
    expect(resumoDaEtiqueta("")).toBe("sem etiqueta");
  });
});

describe("as regras de reconhecimento", () => {
  const CASOS: [string, string][] = [
    // O que a campanha declara ganha ao que o browser deu.
    ["source=ig medium=social content=link_in_bio · ref:l.instagram.com", "Instagram"],
    ["source=fb medium=paid_social campaign=frio-noivos-comporta", "Facebook"],
    ["source=google medium=cpc", "Google"],
    // O referenciador, quando não há campanha.
    ["ref:l.instagram.com", "Instagram"],
    ["ref:www.google.pt", "Google"],
    ["ref:m.facebook.com", "Facebook"],
    ["ref:pt.pinterest.com", "Pinterest"],
    ["ref:www.tiktok.com", "TikTok"],
    ["ref:youtu.be", "YouTube"],
    ["ref:www.linkedin.com", "LinkedIn"],
    ["ref:wa.me", "WhatsApp"],
    // As caixas de correio são Email, e não a plataforma que as aloja.
    ["ref:mail.google.com", "Email"],
    ["ref:outlook.live.com", "Email"],
    ["medium=email campaign=newsletter-outubro", "Email"],
    // O que já estava legível fica como está.
    ["Contacto direto", "Contacto direto"],
    ["Contacto directo", "Contacto direto"],
    ["Cliente recorrente", "Contacto direto"],
    ["Recomendação de um casal anterior", "Passa-a-palavra"],
    ["Passa a palavra", "Passa-a-palavra"],
    ["boca a boca", "Passa-a-palavra"],
    ["Não indicado", "Não indicado"],
    ["", "Não indicado"],
    ["   ", "Não indicado"],
  ];

  it.each(CASOS)("«%s» → %s", (bruto, nome) => {
    expect(reconhecerOrigem(bruto).nome).toBe(nome);
  });

  it("as abreviaturas que este projecto nunca escreveu ficam de fora", () => {
    // `ig` e `fb` estão na lista porque o `UTM-PLAN.md` os fixa. `wa`, `yt`,
    // `li`, `tt` e `pin` não estão em lado nenhum e podem ser outra coisa.
    for (const abreviatura of ["wa", "yt", "li", "tt", "pin"]) {
      expect(reconhecerOrigem(`source=${abreviatura}`).marca).toBe("outra");
    }
  });
});

/**
 * ── E OS DOIS QUADROS TÊM DE CONTINUAR A BEBER DA MESMA FUNÇÃO ────────────
 *
 * Este é o teste que guarda o achado a prazo. A normalização podia ter sido
 * escrita duas vezes — uma em cada quadro — e teria passado todos os testes
 * acima; o defeito só aparecia no dia em que uma das cópias mudasse e os dois
 * quadros passassem a discordar um do outro sobre a mesma origem. Isso é pior
 * do que estarem ambos errados: com dois números diferentes no mesmo ecrã, não
 * há maneira de saber em qual acreditar.
 */
describe("os dois quadros contam pela mesma régua", () => {
  const FONTE = readFileSync(join(__dirname, "StatsDashboard.tsx"), "utf8");

  it("o `StatsDashboard` não volta a agrupar pela etiqueta crua", () => {
    expect(FONTE, "voltou a existir um agrupamento por `referralSource` cru").not.toMatch(
      /byReferral(Conv)?\[/,
    );
    expect(FONTE).toContain("agruparOrigens(");
  });

  it("e há UMA chamada a `agruparOrigens`, que alimenta os dois", () => {
    expect(FONTE.match(/agruparOrigens\(/g) ?? []).toHaveLength(1);
    expect(FONTE).toContain("referralBars:");
    expect(FONTE).toContain("referralConvRows: origens.slice(0, 8)");
  });
});

describe("o movimento da marca", () => {
  it("anda no tempo da barra e não num segundo tempo", () => {
    // 250 ms é o `PROGRESSO` do `ui/movimento.ts`, o degrau `elemento` da casa.
    expect(MARCA_A_CHEGAR).toContain("duration-[250ms]");
  });

  it("e toda a duração anda com a sua guarda", () => {
    // A varredura do `duracao-com-guarda.test.ts` cobre o ficheiro inteiro;
    // esta linha guarda a constante em si, que é onde o descuido cabe.
    for (const classe of MARCA_A_CHEGAR.split(" ")) {
      if (classe.includes("duration-")) expect(classe).toContain("motion-safe:");
    }
    expect(MARCA_A_CHEGAR).toContain("motion-safe:transition-[translate,opacity]");
    // `translate` e não `transform`: no Tailwind v4 a classe `-translate-x-1.5`
    // emite a propriedade autónoma, e um `transition-transform` não lhe toca.
    expect(MARCA_A_CHEGAR).not.toContain("transition-transform");
  });
});
