import {
  ehIdiomaDaProposta,
  IDIOMA_POR_OMISSAO,
  type IdiomaDaProposta,
} from "./proposal-doc-textos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TEXTO DO EMAIL QUE LEVA A PROPOSTA — NAS DUAS LÍNGUAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A proposta podia sair em inglês e o email que a transportava saía sempre em
 * português: o assunto, o «Olá», a frase do anexo, o botão e até o nome do
 * ficheiro. O casal inglês abria uma mensagem que não percebia para chegar a um
 * PDF que percebia. Estas são as frases que faltavam.
 *
 * ── PORQUE É QUE ISTO NÃO ESTÁ NO `proposal-doc-textos` ───────────────────
 *
 * Aquele ficheiro traduz o DOCUMENTO: os títulos das secções, o quadro do
 * orçamento, as condições. Isto é a mensagem que o acompanha, que não aparece
 * em página nenhuma do PDF e muda por razões completamente diferentes (o botão
 * do link, o nome do anexo, a linha de assunto). Duas coisas com ciclos de vida
 * diferentes não partilham ficheiro.
 *
 * ── E PORQUE É QUE NÃO ESTÁ NOS DICIONÁRIOS DO SITE ───────────────────────
 *
 * O `i18n/pt.ts` e o `i18n/en.ts` alimentam PÁGINAS, e há testes que os
 * percorrem inteiros a exigir regras de escrita do site (por exemplo, sem
 * travessões). O assunto deste email tem um travessão desde o primeiro dia e
 * tem de continuar a tê-lo: mudá-lo mudava o email que chega a toda a gente,
 * para satisfazer uma regra que é sobre outra coisa.
 *
 * ── A REGRA DE ESCRITA DO INGLÊS ──────────────────────────────────────────
 *
 * Inglês britânico («personalised»), como o documento — que escreve a validade
 * à maneira britânica, e pela razão que lá está explicada. O nome da casa não
 * se traduz nem se desacentua: é «Líquen Events» nas duas línguas, tal como sai
 * na assinatura e no logótipo.
 */

/**
 * O nome do ficheiro do PDF da proposta.
 *
 * Vive aqui — e não em cada rota — porque tem de ser O MESMO em três sítios: o
 * anexo do email, a descarga pelo link do casal e a descarga pelo portal. O
 * casal já tem um ficheiro na caixa de correio; o que descarrega meses depois
 * tem de ser reconhecível como o mesmo documento, e não um segundo ficheiro com
 * outro nome.
 *
 * «Liquen» sem acento, como sempre esteve: é um nome de ficheiro, e um acento
 * num anexo ainda hoje chega partido a alguns clientes de correio.
 */
export function nomeDoFicheiroDaProposta(ref: string, idioma: IdiomaDaProposta): string {
  return ehIdiomaDaProposta(idioma) && idioma === "en"
    ? `Proposal-Liquen-${ref}.pdf`
    : `Proposta-Liquen-${ref}.pdf`;
}

export interface TextosDoEmailDaProposta {
  /** A linha que o cliente lê ANTES de abrir. */
  assunto: string;
  /** O título dentro do corpo (o `<h2>`). */
  titulo: string;
  /** O cumprimento, sem o nome («Olá», «Hello»). */
  ola: string;
  /** A frase que explica o anexo e o botão (versão HTML, com a menção ao botão). */
  intro: string;
  /** A mesma frase para quem lê em texto simples, onde não há botão nenhum. */
  introEmTexto: string;
  /** O texto do botão. */
  botao: string;
  /** O que precede o endereço na versão em texto simples. */
  verOnline: string;
  /** O nome do PDF em anexo, a partir da referência do pedido. */
  nomeDoAnexo: (ref: string) => string;
}

const PT: TextosDoEmailDaProposta = {
  assunto: "Proposta para o seu evento — Líquen Events",
  titulo: "A sua proposta — Líquen Events",
  ola: "Olá",
  intro:
    "Segue em anexo a proposta personalizada para o seu evento. Pode vê-la e responder online através do botão abaixo.",
  introEmTexto: "Segue em anexo a proposta personalizada para o seu evento.",
  botao: "Ver e responder à proposta →",
  verOnline: "Ver e responder online:",
  nomeDoAnexo: (ref) => nomeDoFicheiroDaProposta(ref, "pt"),
};

const EN: TextosDoEmailDaProposta = {
  assunto: "Proposal for your event — Líquen Events",
  titulo: "Your proposal — Líquen Events",
  ola: "Hello",
  intro:
    "Please find attached the proposal we have prepared for your event. You can also view it and reply online using the button below.",
  introEmTexto: "Please find attached the proposal we have prepared for your event.",
  botao: "View and reply to the proposal →",
  verOnline: "View and reply online:",
  /**
   * O nome do ficheiro também muda. Não é um enfeite: ela gera as duas versões
   * da mesma proposta (a portuguesa para os pais, a inglesa para o casal), e com
   * o mesmo nome a segunda fica «Proposta-Liquen-q1 (1).pdf» na pasta de
   * transferências de quem as receba.
   */
  nomeDoAnexo: (ref) => nomeDoFicheiroDaProposta(ref, "en"),
};

/**
 * As frases do email desta proposta.
 *
 * O que não for uma língua conhecida cai no português — a mesma escolha que a
 * rota e o gerador do documento já fazem. Quem chama resolve a língua com o
 * `idiomaDaProposta`, portanto isto é defesa em profundidade: esta folha nunca
 * pode devolver `undefined` e fazer sair um email com buracos onde deviam estar
 * o assunto e o botão.
 */
export function textosDoEmailDaProposta(idioma: IdiomaDaProposta): TextosDoEmailDaProposta {
  const escolhida = ehIdiomaDaProposta(idioma) ? idioma : IDIOMA_POR_OMISSAO;
  return escolhida === "en" ? EN : PT;
}
