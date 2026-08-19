import "server-only";
import { renderizarAssunto, renderizarCorpo } from "./email-template-engine";
import { esc, extractSimpleText, htmlToPlainText } from "./email-template-format";
import {
  getTemplate,
  idFisico,
  MODELOS_DE_ORIGEM,
  type IdiomaDoModelo,
} from "./email-templates-store";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MODELO NÃO É O EMAIL — É O TEXTO DE ONDE O EMAIL PARTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã de envio abre com o texto dela JÁ PREENCHIDO com os dados daquele
 * casal, numa caixa que se pode editar. Quem envia lê, muda o que quiser (ou
 * não muda nada) e manda. O que sai é o que estava na caixa.
 *
 * ── AS QUATRO REGRAS ──────────────────────────────────────────────────────
 *
 * 1. NÃO EDITAR É O CAMINHO NORMAL. O que abre não é um esqueleto por
 *    completar nem uma sugestão a validar: está pronto a enviar. Por isso o
 *    texto dela chega aqui palavra por palavra — só as variáveis mudam, e os
 *    blocos condicionais decidem-se. Nada de normalizar espaços, nada de
 *    «arrumar» pontuação, e o «Vosso» é maiúsculo porque é a voz dela.
 * 2. O MODELO NÃO SE ALTERA POR SE ENVIAR. Isto só LÊ. Guardar as alterações
 *    no modelo é outro gesto, noutra rota (`/api/email-templates/bilingues`),
 *    e tem de continuar a sê-lo: se enviar gravasse, o envio seguinte partia
 *    do texto que alguém improvisou para outro casal.
 * 3. A MOLDURA DA CASA NÃO ENTRA NA CAIXA. O que é editável é o CORPO. O
 *    cabeçalho, a assinatura e os anexos da marca entram uma só vez, no fim,
 *    pelo `emailAoCliente` — quem escreve não se tem de despedir.
 * 4. O HISTÓRICO É DO MODELO, não dos envios. Guardar cópia do que foi enviado
 *    é outra coisa, e é do ecrã de envio.
 *
 * ── PORQUÊ TEXTO, E NÃO HTML RICO ─────────────────────────────────────────
 *
 * A caixa podia ser o `RichEmailEditor` (que existe e é bom). Escolheu-se
 * TEXTO com parágrafos separados por linhas em branco, por três razões:
 *
 *   • QUEM EDITA É UMA PESSOA COM PRESSA, AO TELEMÓVEL. Numa caixa de texto
 *     escreve-se e apaga-se sem descobrir onde ficou o negrito.
 *   • O TEXTO RESOLVE-SE SEM PERDAS. Os `{{...}}` e os blocos são operações
 *     sobre uma cadeia de caracteres. Resolver HTML com estilos em linha
 *     obrigava a andar a adivinhar texto de volta do markup — e a nota do
 *     `htmlToPlainText` diz, com todas as letras, que ele nunca deve ser
 *     usado no caminho do envio.
 *   • UM BLOCO PODE APANHAR UM PARÁGRAFO INTEIRO. É o que faz o texto sem
 *     data ficar com o mesmo espaçamento do texto com data.
 *
 * O que se perde é a formatação rica dentro do corpo (negritos, listas). Fica
 * dito no relatório: se ela a quiser, o caminho é o `RichEmailEditor` a
 * receber o texto já resolvido, e não o inverso.
 */

/** O modelo que ABRE. Não é um de três em pé de igualdade — é o dela. */
export const MODELO_POR_OMISSAO = "registo-formal";

export interface RascunhoDeEnvio {
  chave: string;
  nome: string;
  idioma: IdiomaDoModelo;
  /** O assunto resolvido. Também é editável no ecrã de envio. */
  assunto: string;
  /** O CORPO resolvido, em texto — é isto que entra na caixa editável. */
  texto: string;
  /** De onde saiu: o que ela guardou, ou o de origem. */
  origem: "guardado" | "origem";
  /** O que quem envia deve saber antes de mandar. Vazio no caso normal. */
  avisos: string[];
}

/**
 * O texto EDITÁVEL de um corpo guardado.
 *
 * Um corpo escrito no editor de texto traz a fonte inteira no marcador e
 * volta exacta. Um corpo em HTML escrito à mão (os quatro modelos antigos) não
 * tem fonte nenhuma e só se pode aproximar — e isso DIZ-SE, num aviso, em vez
 * de se entregar uma aproximação como se fosse o original.
 */
export function fonteEditavel(body: string): { texto: string; aviso: string | null } {
  const guardado = extractSimpleText(String(body ?? ""));
  if (guardado !== null) return { texto: guardado, aviso: null };
  return {
    texto: htmlToPlainText(String(body ?? "")),
    aviso:
      "Este modelo está escrito em HTML à mão, por isso o que aparece na caixa é a melhor " +
      "aproximação em texto. Lê-o antes de enviar — a formatação avançada não passou.",
  };
}

const origem = (chave: string) => MODELOS_DE_ORIGEM.find((m) => m.chave === chave) ?? null;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FRONTEIRA COM O ECRÃ DE ENVIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Dá-lhe o modelo escolhido (ou nenhum, e vem o dela) mais os valores daquela
 * proposta — os mesmos que o `construirValores` produz — e recebe o rascunho
 * pronto a pôr numa caixa de texto. Não envia nada, não grava nada, não toca
 * no modelo.
 */
export async function rascunhoParaEnvio(opcoes: {
  chave?: string;
  idioma?: IdiomaDoModelo;
  valores: Record<string, string>;
}): Promise<RascunhoDeEnvio | { erro: string }> {
  const chave = String(opcoes.chave || MODELO_POR_OMISSAO);
  const idioma: IdiomaDoModelo = opcoes.idioma === "en" ? "en" : "pt";
  const avisos: string[] = [];

  let fonteAssunto = "";
  let fonteTexto = "";
  // Sem valor inicial de propósito: os dois caminhos abaixo ou lhe dão nome, ou
  // saem com erro. Um `= chave` aqui nunca chegava a ser lido, e um valor morto
  // à espera é o que faz alguém acrescentar um terceiro caminho sem reparar que
  // se esqueceu de o preencher — aqui isso passa a não compilar.
  let nome: string;
  let deOnde: "guardado" | "origem" = "origem";

  let guardado = null;
  try {
    guardado = await getTemplate(idFisico(chave, idioma));
  } catch (e) {
    // Uma avaria a ler não pode ser uma excepção que suba até ao ecrã de
    // envio: há sempre o de origem, e o registo diz o que aconteceu.
    log.warn("rascunho de envio: não foi possível ler o modelo guardado", {
      chave,
      idioma,
      erro: String(e),
    });
  }

  if (guardado) {
    deOnde = "guardado";
    nome = guardado.name || chave;
    fonteAssunto = guardado.subject ?? "";
    const editavel = fonteEditavel(guardado.body ?? "");
    fonteTexto = editavel.texto;
    if (editavel.aviso) avisos.push(editavel.aviso);
  } else {
    const semente = origem(chave);
    const lado = semente?.[idioma];
    if (!semente || !lado || (!lado.subject.trim() && !lado.texto.trim())) {
      // NÃO se traduz à máquina e NÃO se manda português a quem pediu inglês.
      return {
        erro:
          idioma === "en"
            ? `Ainda não há versão inglesa do modelo «${chave}». Escreve-a em «Modelos de email» ` +
              `(separador EN), ou escolhe outro modelo.`
            : `Não há nenhum modelo «${chave}». Cria-o em «Modelos de email».`,
      };
    }
    nome = semente.nome;
    fonteAssunto = lado.subject;
    fonteTexto = lado.texto;
  }

  const texto = renderizarCorpo(fonteTexto, opcoes.valores);
  const assunto = renderizarAssunto(fonteAssunto, opcoes.valores);
  return { chave, nome, idioma, assunto, texto, origem: deOnde, avisos };
}

/** Um endereço solto no meio do texto, para ficar carregável no HTML. */
const URL_SOLTA = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTÁ NA CAIXA → O QUE SAI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As duas metades de um `multipart/alternative`, do MESMO texto:
 *
 *   • o HTML, com um parágrafo por bloco separado por linha em branco. As
 *     linhas em branco dela são significado, não formatação a mais: sem isto
 *     o email chegava como um bloco só.
 *   • o texto simples, INTACTO — byte a byte o que estava na caixa. É o que um
 *     leitor de ecrã anuncia, e é a prova de que nada lhe mexeu pelo caminho.
 *
 * TUDO É ESCAPADO. Não é zelo: o texto foi escrito à mão por uma pessoa com
 * pressa e traz lá dentro dados de um cliente. Um casal chamado «Marta & João»
 * não pode partir o email, e um `<` copiado de qualquer lado não pode injectar
 * markup.
 *
 * NÃO LEVA MOLDURA NEM RODAPÉ. O `emailAoCliente` fecha no fim, uma só vez.
 */
export function corpoEnviavel(texto: string): { html: string; texto: string } {
  const limpo = String(texto ?? "");
  const html = limpo
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim().length > 0)
    .map((paragrafo) => {
      const dentro = esc(paragrafo)
        .replace(/\n/g, "<br>")
        // Depois do `esc`, porque a comparação é sobre o endereço já escapado —
        // um `&` de um parâmetro de query virou `&amp;` e é assim que ele tem
        // de ficar dentro do `href`.
        .replace(URL_SOLTA, (url) => `<a href="${url}" style="color:#637a5f">${url}</a>`);
      return `  <p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#2a2620">${dentro}</p>`;
    })
    .join("\n");
  return { html, texto: limpo };
}
