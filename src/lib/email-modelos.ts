import "server-only";
import { htmlToPlainText } from "./email-template-format";
import {
  DEFAULT_TEMPLATES,
  getTemplate,
  idFisico,
  MERGE_FIELDS,
  MODELOS_DE_ORIGEM,
  renderTemplate,
  type EmailTemplate,
  type IdiomaDoModelo,
} from "./email-templates-store";
import { renderizarAssunto, renderizarCorpo, variaveisPorPreencher } from "./email-template-engine";
import { primeiroNome, REMETENTE_POR_OMISSAO, VARIAVEIS } from "./email-template-vars";
import { dataIso } from "./validation";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DO ECRÃ «MODELOS DE EMAIL» ATÉ À CAIXA DE CORREIO DO CLIENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã dos modelos existia há muito e dizia, por baixo de cada um, quando é
 * que ele era enviado. Não era enviado nunca: o `renderTemplate` não tinha um
 * único chamador de produção, e o que saía com a proposta era HTML escrito à
 * mão dentro da rota. Este módulo é o troço que faltava — e é o único sítio
 * por onde um modelo dela passa a caminho de um cliente.
 *
 * ── ONDE ACABA O MODELO E ONDE COMEÇA A MOLDURA ───────────────────────────
 *
 * Todo o correio ao cliente passa pelo {@link emailAoCliente}
 * (`email-assinatura.ts`), que põe a moldura da casa à volta do corpo e fecha
 * com a assinatura — Catarina Gaspar, cargo, contactos, logótipo e banner.
 * Os corpos dos modelos, esses, trazem de dentro a SUA moldura (`<div>` com
 * largura e tipo de letra) e o SEU rodapé («Líquen Events · Portugal»), porque
 * foram escritos quando o corpo era o email inteiro.
 *
 * Somados, o cliente recebia dois fechos colados — exactamente o defeito que
 * se corrigiu nos modelos de resposta rápida do mensageiro. A regra, aqui
 * escrita uma vez e aplicada a TODOS os modelos:
 *
 *   **o modelo dá o que aquele email tem de particular; a moldura e o fecho
 *   são da casa e entram uma só vez, no fim.**
 *
 * O {@link desmoldurar} é quem a aplica. Trata dos modelos JÁ GUARDADOS por
 * ela (que têm o rodapé lá dentro e não se lhes pode mexer sem lhe apagar
 * trabalho) e os construtores do editor deixaram de o escrever de raiz — as
 * duas metades são precisas: sem o construtor, cada modelo novo voltava a
 * nascer com o defeito; sem isto, os que ela já tem continuavam com ele.
 *
 * ── UM MARCADOR SEM VALOR NÃO É UM ESPAÇO EM BRANCO ───────────────────────
 *
 * O `renderTemplate` troca por `""` o que não conhece. É o que tem de fazer —
 * um `{qualquercoisa}` literal na caixa do cliente é pior. Mas isso significa
 * que «Falta uma semana para {data_evento}» num pedido sem data sai como
 * «Falta uma semana para », e o corpo com «Data do evento: ».
 *
 * A casa já tem uma decisão para isto nas cláusulas da proposta: troca-se a
 * FRASE INTEIRA, não o buraco. Aqui não se pode — a frase é dela, escrita à
 * mão, e não há segunda redacção que se possa adivinhar. Fica então a outra
 * metade da regra, conforme quem está do outro lado:
 *
 *   • BOTÃO (envio a pedido): RECUSA-SE, com uma frase que nomeia o modelo, o
 *     dado que falta e o que fazer. Ela está com o dedo no botão; preencher a
 *     data no pedido é um gesto, e ninguém reescreve o texto dela por ela.
 *   • PROPOSTA (envio automático): não há ninguém para ler a recusa e a
 *     proposta TEM de seguir. Cai-se no texto da casa — o mesmo recurso do
 *     modelo em falta ou vazio —, que nunca tem buracos porque não tem
 *     marcadores. Fica registado no `log` porquê.
 *
 * Em nenhum dos dois sai um buraco.
 */

/** As chaves dos modelos que este módulo sabe enviar. */
export type ChaveDeModelo =
  | "proposta-enviada"
  | "sinal-recebido"
  | "semana-evento"
  | "agradecimento";

/**
 * Os modelos que ela envia A PEDIDO, por um botão, e por esta ordem.
 *
 * O `proposta-enviada` está FORA de propósito, e não por esquecimento: esse
 * anuncia uma proposta e leva o link de aceitação e o PDF em anexo, coisas que
 * só existem no momento em que a proposta é gerada. Um botão que o mandasse
 * sozinho mandava ao cliente o aviso de uma proposta que não vinha — ou, pior,
 * um link para uma proposta antiga. Ver a recusa em `modelo/route.ts`.
 */
export const MODELOS_A_PEDIDO: ChaveDeModelo[] = [
  "sinal-recebido",
  "semana-evento",
  "agradecimento",
];

export function ehModeloAPedido(v: unknown): v is ChaveDeModelo {
  return typeof v === "string" && (MODELOS_A_PEDIDO as string[]).includes(v);
}

// ── Desmoldurar ────────────────────────────────────────────────────────────

/** Os marcadores escondidos que os dois editores deixam no corpo guardado. */
const MARCADORES_DO_EDITOR = /<!--\s*liquen:(?:simple|rich):v1:[A-Za-z0-9+/=]*\s*-->/gi;

/**
 * O rodapé da casa, tal como os corpos guardados o têm: «Líquen Events ·
 * Portugal». Reconhece-se pelo TEXTO e não pelo markup exacto, porque o
 * mesmo rodapé foi escrito por três construtores diferentes ao longo do tempo
 * e ela pode ter-lhe mexido no tamanho da letra.
 *
 * Não apanha (nem deve) um «Com os melhores cumprimentos, / Equipa Líquen
 * Events» escrito por ela no meio do texto: isso é PROSA dela. O que se tira
 * aqui é boilerplate que fomos NÓS que lá pusemos — desfazer a nossa própria
 * duplicação é uma coisa; reescrever a despedida dela é outra. Para essa, o
 * ecrã dos modelos diz-lhe que a assinatura fecha sozinha, como já diz a caixa
 * do mensageiro.
 */
function ehRodapeDaCasa(texto: string): boolean {
  const t = texto.replace(/\s+/g, " ").trim();
  if (!t || t.length > 120) return false;
  return /líquen\s*events/i.test(t) && (t.includes("·") || /portugal/i.test(t));
}

/** Tira as etiquetas sem descodificar entidades — o texto só serve para
 *  RECONHECER o rodapé, nunca para sair daqui. */
const semEtiquetas = (s: string) => s.replace(/<[^>]*>/g, " ");

/**
 * Tira a moldura exterior (um `<div>` que embrulhe o corpo todo) quando ela
 * existe. A do `emailAoCliente` é que manda: sem isto o corpo ia com o seu
 * tipo de letra e a sua largura DENTRO da moldura da casa, e a assinatura logo
 * a seguir saía noutra letra — dois emails colados num só.
 */
function desembrulhar(html: string): string {
  const s = html.trim();
  const abertura = /^<div\b[^>]*>/i.exec(s);
  if (!abertura) return s;
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = abertura[0].length;
  let profundidade = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    profundidade += m[0][1] === "/" ? -1 : 1;
    if (profundidade === 0) {
      // Só é MOLDURA se fechar no fim de tudo. Um `<div>` que feche a meio é
      // uma caixa dentro do email dela e não se lhe toca.
      return s.slice(m.index + m[0].length).trim() === ""
        ? s.slice(abertura[0].length, m.index).trim()
        : s;
    }
  }
  return s;
}

/**
 * O corpo do modelo reduzido ao que é DELE: sem marcador do editor, sem a
 * moldura exterior e sem o rodapé da casa que trazia lá dentro.
 */
export function desmoldurar(html: string): string {
  let s = String(html ?? "")
    .replace(MARCADORES_DO_EDITOR, "")
    .trim();

  // Molduras aninhadas são raras mas possíveis (um `<div>` colado por cima de
  // outro num modelo antigo). O tecto evita um ciclo infinito se algum dia
  // aparecer markup que o `desembrulhar` não saiba fechar.
  for (let i = 0; i < 3; i++) {
    const fora = desembrulhar(s);
    if (fora === s) break;
    s = fora;
  }

  // E agora o fecho, do fim para o princípio: o parágrafo do rodapé, e o
  // risco que o precede. Um `<hr>` que fique a terminar o corpo sai também —
  // colado ao risco da própria assinatura, seriam dois traços seguidos.
  for (let i = 0; i < 6; i++) {
    const antes = s;
    s = s.replace(/<p\b[^>]*>((?:(?!<p\b)[\s\S])*?)<\/p>\s*$/i, (todo, dentro: string) =>
      ehRodapeDaCasa(semEtiquetas(dentro)) ? "" : todo,
    );
    s = s.replace(/<hr\b[^>]*\/?>\s*$/i, "").trimEnd();
    if (s === antes) break;
  }

  return s.trim();
}

// ── Texto simples ──────────────────────────────────────────────────────────

/**
 * A versão em texto simples do corpo. Todo o correio ao cliente a leva: um
 * `multipart/alternative` passa melhor pelos filtros de spam e é o que se lê
 * num cliente só de texto ou num leitor de ecrã. Um modelo é HTML, portanto
 * tem de ser DERIVADA — mandar as etiquetas era pior do que não mandar nada.
 *
 * As LIGAÇÕES levam o endereço consigo (`texto (endereço)`), porque em texto
 * simples não há onde carregar: um «Ver e responder à proposta» sem URL é um
 * beco. Quando o texto visível já é o próprio endereço — que é como os modelos
 * por omissão escrevem o `{link}` — não se repete.
 */
export function textoDoCorpo(html: string): string {
  const comLigacoes = String(html ?? "").replace(
    /<a\b[^>]*\shref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
    (_todo, aspas: string | undefined, plicas: string | undefined, dentro: string) => {
      const url = (aspas ?? plicas ?? "").trim();
      // Ainda por descodificar dos dois lados: quem descodifica é o
      // `htmlToPlainText` no fim, uma vez só. Descodificar aqui e outra vez lá
      // transformava um `&amp;lt;` do nome de um cliente num `<` a sério.
      const visivel = semEtiquetas(dentro).replace(/\s+/g, " ").trim();
      if (!url) return visivel;
      if (!visivel || visivel === url) return url;
      return `${visivel} (${url})`;
    },
  );
  return htmlToPlainText(comLigacoes);
}

// ── Preparar ───────────────────────────────────────────────────────────────

export type ModeloPreparado =
  | { ok: true; assunto: string; html: string; texto: string }
  | { ok: false; motivo: string; emFalta: string[] };

/** Os `{marcadores}` que este modelo usa, pela ordem em que aparecem. */
function marcadoresUsados(...fontes: string[]): string[] {
  const vistos: string[] = [];
  for (const fonte of fontes) {
    for (const m of fonte.matchAll(/\{(\w+)\}/g)) {
      if (!vistos.includes(m[1])) vistos.push(m[1]);
    }
  }
  return vistos;
}

const rotuloDoCampo = (chave: string): string =>
  VARIAVEIS.find((v) => v.chave === chave)?.rotulo ??
  MERGE_FIELDS.find((f) => f.key === chave)?.label.toLowerCase() ??
  chave;

const juntar = (partes: string[]): string =>
  partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;

/** Um modelo do dialecto novo reconhece-se pelas chavetas duplas. */
export function ehDialectoNovo(...fontes: string[]): boolean {
  return fontes.some((f) => String(f ?? "").includes("{{"));
}

/**
 * O caminho do dialecto novo. Tem a mesma forma que o antigo — desenha, ou
 * recusa com uma frase que nomeia o que falta — e duas diferenças que são o
 * ponto todo dos blocos condicionais:
 *
 *   • uma variável vazia GUARDADA pelo seu próprio `{{#se}}` não é uma falta:
 *     ela já escreveu o que fazer sem esse dado. Recusar era discutir uma
 *     decisão tomada, e obrigá-la a preencher a data para poder mandar um
 *     email que ela própria redigiu para o caso de não haver data.
 *   • o corpo VAZIO só se sabe depois de desenhar: um modelo inteiro dentro
 *     de um `{{#se}}` falso não escreve nada, e um email em branco não sai.
 */
function prepararDialectoNovo(
  modelo: EmailTemplate,
  assunto: string,
  corpo: string,
  vars: Record<string, string>,
): ModeloPreparado {
  const emFalta = variaveisPorPreencher(assunto, vars);
  for (const k of variaveisPorPreencher(corpo, vars)) if (!emFalta.includes(k)) emFalta.push(k);
  if (emFalta.length) {
    const nomes = emFalta.map((k) => `${rotuloDoCampo(k)} ({{${k}}})`);
    return {
      ok: false,
      emFalta,
      motivo: `O modelo «${modelo.name}» usa ${juntar(nomes)}, e este pedido não tem ${
        emFalta.length > 1 ? "esses dados" : "esse dado"
      }. O email NÃO foi enviado — preenche ${
        emFalta.length > 1 ? "os campos" : "o campo"
      } no pedido, ou envolve ${
        emFalta.length > 1 ? "os marcadores" : "o marcador"
      } num bloco {{#se …}} para o modelo saber o que fazer sem ${
        emFalta.length > 1 ? "eles" : "ele"
      }, e volta a tentar.`,
    };
  }

  const html = renderizarCorpo(corpo, vars);
  const texto = textoDoCorpo(html);
  if (texto.trim() === "") {
    return {
      ok: false,
      emFalta: [],
      motivo:
        `O modelo «${modelo.name}» não escreveu nada com os dados deste pedido — tudo o que ele ` +
        `tem está dentro de blocos {{#se …}} que ficaram fechados. O email NÃO foi enviado.`,
    };
  }
  return { ok: true, assunto: renderizarAssunto(assunto, vars), html, texto };
}

/**
 * O modelo pronto a entregar ao `emailAoCliente` — ou a recusa, com a frase
 * que se mostra a quem carregou no botão.
 *
 * O `renderTemplate` continua a ser quem resolve os marcadores, de propósito:
 * é lá que vive a distinção entre o CORPO (escapado, porque é markup) e o
 * ASSUNTO (não escapado, porque é um cabeçalho RFC 5322 que o nodemailer
 * codifica sozinho — escapá-lo punha «Marta &amp; João» na única linha que o
 * cliente lê antes de abrir). Reescrever a substituição aqui era arriscar
 * perder essa distinção numa segunda cópia.
 */
export function prepararModelo(
  modelo: EmailTemplate,
  vars: Record<string, string>,
): ModeloPreparado {
  const corpo = desmoldurar(modelo.body ?? "");
  const assunto = String(modelo.subject ?? "").trim();

  // «Vazio» é o que o CLIENTE veria vazio: um corpo só com moldura, riscos e
  // espaços é um email em branco, por muito markup que tenha lá dentro.
  if (!assunto || textoDoCorpo(corpo).trim() === "") {
    return {
      ok: false,
      emFalta: [],
      motivo:
        `O modelo «${modelo.name}» está vazio (sem assunto ou sem texto). ` +
        `O email NÃO foi enviado — escreve o modelo em «Modelos de email» e volta a tentar.`,
    };
  }

  /**
   * ── DOIS DIALECTOS, UM DE CADA VEZ ──────────────────────────────────────
   *
   * Os modelos antigos são escritos com `{marcador}`; os novos com
   * `{{variavel}}` e blocos `{{#se}}`. Um modelo usa UM dos dois, e é o
   * próprio texto que o diz: se tem chavetas duplas, é do novo.
   *
   * Não se corre a substituição antiga por cima da nova, e a razão vê-se num
   * exemplo: o `\{(\w+)\}` do dialecto antigo casa com o `{cliente_nome}` que
   * está DENTRO de um `{{cliente_nome}}`, e o que saía era «Proposta {Marta}»
   * — o nome do cliente entre chavetas, na primeira linha que ele lê. Uma
   * escolha, nunca as duas.
   */
  if (ehDialectoNovo(assunto, corpo)) return prepararDialectoNovo(modelo, assunto, corpo, vars);

  const emFalta = marcadoresUsados(assunto, corpo).filter(
    (k) => String(vars[k] ?? "").trim() === "",
  );
  if (emFalta.length) {
    const nomes = emFalta.map((k) => `${rotuloDoCampo(k)} ({${k}})`);
    return {
      ok: false,
      emFalta,
      motivo: `O modelo «${modelo.name}» usa ${juntar(nomes)}, e este pedido não tem ${
        emFalta.length > 1 ? "esses dados" : "esse dado"
      }. O email NÃO foi enviado — preenche ${
        emFalta.length > 1 ? "os campos" : "o campo"
      } no pedido, ou tira ${emFalta.length > 1 ? "os marcadores" : "o marcador"} do modelo, e volta a tentar.`,
    };
  }

  const rendido = renderTemplate({ ...modelo, subject: assunto, body: corpo }, vars);
  return {
    ok: true,
    assunto: rendido.subject,
    html: rendido.body,
    texto: textoDoCorpo(rendido.body),
  };
}

// ── Carregar ───────────────────────────────────────────────────────────────

/** O que está GUARDADO, ou nada. Uma avaria a ler (tabela em falta, base fora)
 *  não pode ser uma excepção que suba: quem chama tem sempre um recurso. */
async function guardado(
  chave: ChaveDeModelo | string,
  idioma: IdiomaDoModelo = "pt",
): Promise<EmailTemplate | null> {
  try {
    return await getTemplate(idFisico(chave, idioma));
  } catch (e) {
    log.warn("modelos de email: não foi possível ler o modelo guardado", {
      chave,
      idioma,
      erro: String(e),
    });
    return null;
  }
}

/**
 * A semente deste modelo NESTA LÍNGUA, ou nada.
 *
 * Os quatro modelos antigos só têm semente portuguesa; os três novos têm as
 * duas. Um `null` do lado inglês é uma resposta verdadeira — «não há versão
 * inglesa deste modelo» — e é o que faz a recusa acontecer em vez de sair
 * português para um casal que não o lê.
 */
const semente = (
  chave: ChaveDeModelo | string,
  idioma: IdiomaDoModelo = "pt",
): EmailTemplate | null => {
  const nova = MODELOS_DE_ORIGEM.find((m) => m.chave === chave);
  if (nova) {
    const lado = nova[idioma];
    if (!lado.subject.trim() && !lado.body.trim()) return null;
    return {
      key: idFisico(chave, idioma),
      name: nova.nome,
      subject: lado.subject,
      body: lado.body,
      updatedAt: "1970-01-01T00:00:00.000Z",
    };
  }
  if (idioma === "en") return null;
  return DEFAULT_TEMPLATES.find((t) => t.key === chave) ?? null;
};

/**
 * O modelo para o caminho AUTOMÁTICO (a proposta que segue). `null` quer dizer
 * «usa o texto da casa» — e a razão fica no registo.
 *
 * Lê só o que está GUARDADO, nunca a semente. A semente é o exemplo que o
 * editor mostra, não uma decisão dela: adoptá-la aqui fazia com que, numa
 * instalação onde ela nunca tivesse aberto o ecrã, o email da proposta
 * deixasse calado de dizer o VALOR TOTAL e a VALIDADE — que a semente não tem
 * e o texto da casa tem. Nada muda até ela guardar o modelo; a partir daí é o
 * dela que sai.
 */
export async function modeloParaEnvioAutomatico(
  chave: ChaveDeModelo | string,
  vars: Record<string, string>,
  /**
   * A língua do cliente. OPCIONAL, e por omissão português — as rotas que já
   * chamam isto não passam nada e não podem mudar de comportamento por causa
   * desta linha. Quem passar `"en"` vai buscar a versão inglesa GUARDADA; se
   * ela não existir, continua a sair `null`, que quer dizer «sai o texto da
   * casa», e o texto da casa existe nas duas línguas.
   */
  idioma: IdiomaDoModelo = "pt",
): Promise<{ assunto: string; html: string; texto: string } | null> {
  const modelo = await guardado(chave, idioma);
  if (!modelo) return null;
  const pronto = prepararModelo(modelo, vars);
  if (!pronto.ok) {
    // Não é uma avaria — é uma escolha, e tem de se poder ver que foi feita:
    // ela guardou um modelo e o email que saiu não foi o dela.
    log.warn("modelos de email: modelo guardado não utilizável, sai o texto da casa", {
      chave,
      idioma,
      emFalta: pronto.emFalta.join(","),
    });
    return null;
  }
  return { assunto: pronto.assunto, html: pronto.html, texto: pronto.texto };
}

/**
 * O modelo para os BOTÕES dela. Aqui a semente serve de recurso: ao contrário
 * da proposta, não há texto da casa alternativo para estes momentos — e o
 * botão tem de mandar um email a sério, que ela acabou de ver na
 * pré-visualização antes de confirmar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * OS TRÊS SÓ EXISTEM EM PORTUGUÊS — E NÃO HÁ TEXTO DA CASA PARA ONDE CAIR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A proposta tem um recurso para um pedido inglês sem modelo inglês: cai no
 * texto da casa, que existe nas duas línguas (`email-proposta-textos.ts`).
 * Estes três («Sinal recebido», «Falta uma semana», «Agradecimento») não têm
 * essa rede — são só o que ela escreveu no ecrã «Modelos de email», sempre em
 * português. Mandar o modelo à mesma dava a um casal inglês «Sinal recebido,
 * reserva confirmada» sem perceberem uma palavra.
 *
 * Por isso RECUSA-SE, como o botão já recusa um marcador sem valor: nenhum
 * email sai, e a frase diz porquê e o que fazer. Ela está com o dedo no botão
 * — o Mensageiro (`/api/orcamento/[id]/mensagem`) escreve-se à mão e já sai na
 * língua do pedido, é o caminho que sobra até o ecrã dos modelos ganhar uma
 * versão inglesa de cada um.
 */
export async function modeloParaEnvioAPedido(
  chave: ChaveDeModelo | string,
  vars: Record<string, string>,
  idioma?: string,
): Promise<ModeloPreparado> {
  const lingua: IdiomaDoModelo = idioma === "en" ? "en" : "pt";
  const modelo = (await guardado(chave, lingua)) ?? semente(chave, lingua);
  if (!modelo) {
    // ── A RECUSA INGLESA, AGORA COM SAÍDA ────────────────────────────────
    //
    // Isto recusava SEMPRE um pedido inglês, porque não havia onde guardar a
    // versão inglesa de um modelo. Agora há — é o separador «EN» do ecrã dos
    // modelos —, e a recusa passa a ser a resposta verdadeira a uma coisa
    // concreta: esta versão ainda não está escrita.
    //
    // O que NÃO mudou, e não muda: não se traduz à máquina o texto dela, e não
    // se manda português a quem pediu em inglês. Das duas, a que menos
    // surpreende quem RECEBE continua a ser não mandar nada e dizer porquê.
    if (lingua === "en") {
      // Pelo NOME e não pela chave: quem lê isto é ela, a meio de um envio, e
      // «sinal-recebido» é o nome que a base de dados lhe dá — não o que está
      // escrito na lista do ecrã onde ela o vai procurar.
      const nome = semente(chave, "pt")?.name ?? String(chave);
      return {
        ok: false,
        emFalta: [],
        motivo:
          `Este pedido é em inglês e ainda não há versão inglesa do modelo «${nome}». O email ` +
          `NÃO foi enviado — escreve-a em «Modelos de email» (separador EN), ou escreve ao casal ` +
          `pelo Mensageiro, que já sai na língua do pedido.`,
      };
    }
    return {
      ok: false,
      emFalta: [],
      motivo: `Não há nenhum modelo «${chave}». Cria-o em «Modelos de email».`,
    };
  }
  return prepararModelo(modelo, vars);
}

// ── Os valores ─────────────────────────────────────────────────────────────

/** A data como se escreve em Portugal («12 de setembro de 2026»), ou vazio. */
function dataPorExtenso(iso: string | undefined): string {
  const s = dataIso(iso);
  if (!s) return "";
  // Meio-dia: a hora não interessa, só não pode escorregar de dia.
  return new Date(`${s}T12:00:00`).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type PedidoParaMarcadores = {
  name?: string;
  date?: string;
  location?: string;
  company?: string;
};

/**
 * Os valores dos `{marcadores}` a partir do pedido, num sítio só — a rota da
 * proposta, a rota irmã e o botão do dossier têm de dar o MESMO `{nome}` e a
 * mesma `{data_evento}` ao mesmo cliente.
 *
 * O `{nome}` é o PRIMEIRO nome. O `quote.name` é o que a pessoa escreveu no
 * formulário e há quem lá ponha o nome legal inteiro — «Olá Francisco Maria
 * Carrelhas Das Neves Da Palma Gaspar,» saiu mesmo assim num email da casa.
 * É a mesma forma que o mensageiro e a rota da proposta já usam.
 *
 * O que não existe fica VAZIO, e é isso que faz a recusa acontecer lá em cima.
 * Pôr aqui um «a definir» era escrever «Falta uma semana para a definir» no
 * assunto de um email a um cliente.
 */
export function marcadoresDoPedido(
  pedido: PedidoParaMarcadores,
  extra: Partial<Record<string, string>> = {},
): Record<string, string> {
  const base: Record<string, string> = {
    nome:
      String(pedido.name ?? "")
        .trim()
        .split(/\s+/)[0] ?? "",
    data_evento: dataPorExtenso(pedido.date),
    local: String(pedido.location ?? "").trim(),
    empresa: String(pedido.company ?? "").trim(),
    link: "",
    valor: "",
  };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) base[k] = v;

  /**
   * ── A PONTE PARA AS VARIÁVEIS NOVAS ─────────────────────────────────────
   *
   * As rotas que mandam correio (`api/orcamento/**`) chamam isto e passam as
   * chaves antigas. Elas não são minhas para mudar, e mudar-lhes a assinatura
   * a meio de outra pessoa corrigir defeitos lá dentro era pedir um conflito.
   *
   * Então o mesmo mapa passa a trazer OS DOIS nomes para o mesmo dado: quem
   * escrever um modelo novo tem as variáveis novas a funcionar hoje, pelas
   * rotas que já existem, sem que uma linha delas mude.
   *
   * O QUE FALTA — e falta de propósito, porque exige tocar-lhes — são os dados
   * que estas rotas nunca calcularam: o tipo de evento, a validade, a
   * percentagem do sinal e a mensagem pessoal. Ficam VAZIOS, que é o que os
   * blocos `{{#se}}` sabem tratar, e a lista exacta do que acrescentar em cada
   * rota vai no relatório.
   *
   * O `remetente_nome` é o caso que não se resolve por ponte nenhuma: NÃO HÁ
   * nenhuma chave antiga de onde ele possa vir, e é assim que tem de ser. Sai
   * o nome da casa até alguém o indicar por `extra`, e nunca — em caminho
   * nenhum deste ficheiro — o nome de quem recebe.
   */
  // O NOME INTEIRO, e não o `base.nome` — esse já vem cortado no primeiro nome
  // pelo dialecto antigo, e o `{{cliente_nome_completo}}` prometia o contrário.
  // Quem chama pode substituí-lo por `extra.nome` (é o que a rota da proposta
  // faz, com os nomes do CASAL em vez de quem preencheu o formulário).
  const completo = String(extra.nome ?? pedido.name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const novas: Record<string, string> = {
    cliente_nome: primeiroNome(completo),
    cliente_nome_completo: completo,
    evento_tipo: "",
    evento_data: base.data_evento ?? "",
    evento_local: base.local ?? "",
    valor_total: base.valor ?? "",
    validade_data: "",
    sinal_percentagem: "",
    link_proposta: base.link ?? "",
    mensagem_pessoal: "",
    remetente_nome: REMETENTE_POR_OMISSAO,
  };
  for (const [k, v] of Object.entries(novas)) if (base[k] === undefined) base[k] = v;
  // Um `extra` escrito já com os nomes novos ganha — é como quem chama diz
  // «este dado é este», e é por aqui que o `remetente_nome` verdadeiro entra.
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) base[k] = v;
  return base;
}
