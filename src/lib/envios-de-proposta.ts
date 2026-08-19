import "server-only";
import { getState, setState, type ResultadoDeEscrita } from "./app-state";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SEGUIU, PARA QUEM, QUANDO, E COM QUE TEXTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Enviada a proposta, ficava gravado o DOCUMENTO (a coluna `proposals.doc`) e
 * mais nada do EMAIL. O quadro dizia «Proposta enviada» e o histórico do
 * pedido ganhava uma linha com o valor — mas a pergunta que se faz três
 * semanas depois, ao telefone, é outra: *o que é que nós lhes escrevemos?*
 *
 * Desde que o corpo passou a ser editável no ecrã de envio, essa pergunta
 * deixou de ter resposta possível em lado nenhum. O modelo guardado não serve
 * — ele é o PONTO DE PARTIDA e pode ter sido reescrito para aquele casal, e
 * pode ter mudado desde então. O rascunho do estúdio também não: é o
 * documento, não o email, e apaga-se no «Limpar rascunho».
 *
 * Isto é a cópia. Uma entrada por envio, com quem recebeu, quando, de que
 * modelo partiu, quem assinou, o assunto, o corpo tal e qual, e o anexo que
 * seguiu com ele.
 *
 * ── O QUE ISTO NÃO É, E NÃO PODE VIR A SER ────────────────────────────────
 *
 * NÃO é rastreio. Não há aqui — nem pode passar a haver — «aberto em», «lido
 * às», «carregou no link». É decisão dela, escrita para quem vier a seguir:
 * um pixel invisível, um endereço que conta cliques ou um aviso de leitura são
 * sinal recolhido às escondidas de quem recebe o email, e esta casa não o
 * recolhe. Os campos abaixo são todos factos do lado de CÁ: o que nós
 * mandámos, quando o mandámos, e quem carregou no botão.
 *
 * ── ONDE FICA GUARDADO, E PORQUÊ AÍ ───────────────────────────────────────
 *
 * Na tabela `app_state`, com a chave `envio-de-proposta:<pedido>` — o mesmo
 * sítio e a mesma decisão dos rascunhos do estúdio (ver `proposal-drafts.ts`,
 * que escreve por extenso o «deliberadamente NÃO se criou uma tabela nova»).
 * Um envio são alguns KB de texto, e a alternativa custava um passo manual de
 * SQL numa instalação a trabalhar.
 *
 * A proposta de esquema para uma tabela `proposal_emails` a sério está no
 * relatório desta entrega — as migrações são aprovadas antes, e é regra dela.
 * Até lá, o que aqui está tem duas limitações escritas à frente: o TECTO de
 * {@link ENVIOS_GUARDADOS} entradas por pedido, e a AUSÊNCIA da cópia de
 * segurança (`backup-restore.ts` exporta os rascunhos por conjunto próprio;
 * este espaço de nomes ainda não tem o seu).
 */

/** O espaço de nomes dos envios dentro do `app_state`. */
export const ENVIOS_PREFIX = "envio-de-proposta:";

/**
 * Quantos envios se guardam por pedido.
 *
 * Uma proposta revista três ou quatro vezes é o normal; doze é uma negociação
 * fora do vulgar e já é mais do que alguém alguma vez vai reler. O tecto existe
 * porque isto vive numa linha só do `app_state`: sem ele, um pedido teimoso
 * fazia crescer um único valor JSON sem fim, e é a linha inteira que se lê e
 * reescreve a cada envio.
 *
 * Quando estoura, o que sai é o MAIS ANTIGO. O que interessa é o que seguiu da
 * última vez.
 */
export const ENVIOS_GUARDADOS = 12;

/** Quanto corpo se guarda. O tecto do que se pode escrever é 10.000; guardar
 *  mais do que isso seria guardar o que nunca chegou a sair. */
const MAXIMO_CORPO_GUARDADO = 12_000;

export interface AnexoEnviado {
  /** O nome do ficheiro tal como ele chega à pasta de transferências deles. */
  nome: string;
  /** O tamanho do PDF em bytes — o do ficheiro, não o do anexo codificado. */
  bytes: number;
}

/** Um email de proposta que SAIU. Só se escreve depois de o correio ter sido
 *  aceite — ver a rota do envio: «enviada» é um facto sobre o mundo. */
export interface EnvioDeProposta {
  /** Quando seguiu (ISO). É também a ordem: o mais recente é o último. */
  enviadoEm: string;
  /** O endereço do cliente para onde foi. */
  para: string;
  /** O nome de quem carregou no botão, lido da sessão. Vazio = a casa. */
  porQuem: string;
  /** A chave do modelo de que o corpo partiu («registo-formal»). Vazia quando
   *  o envio não passou pelo ecrã novo (o texto da casa, um envio antigo). */
  modelo: string;
  /** A língua em que o email saiu. */
  idioma: "pt" | "en";
  assunto: string;
  /** O corpo TAL E QUAL, em texto — o que estava na caixa quando ela carregou
   *  em Enviar, já com a ligação da proposta resolvida. Não é o HTML: o que se
   *  quer reler daqui a três semanas são as palavras, e o markup da moldura da
   *  casa é sempre o mesmo e não é dela. */
  texto: string;
  /** O documento que seguiu com ele. */
  anexo?: AnexoEnviado;
  /** A proposta a que este email pertence, para cruzar com o histórico. */
  propostaId?: string;
}

/** O que fica guardado por pedido: a lista, do mais antigo ao mais recente. */
interface EnviosDoPedido {
  envios: EnvioDeProposta[];
}

/** A chave de um pedido, saneada para não sair do seu espaço de nomes. */
export function chaveDosEnvios(quoteId: string): string {
  return `${ENVIOS_PREFIX}${String(quoteId ?? "").replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

const texto = (valor: unknown, tecto = 500): string =>
  typeof valor === "string" ? valor.slice(0, tecto) : "";

/** Uma entrada lida do armazenamento, com a forma garantida. Uma linha
 *  estragada não pode deitar abaixo a lista inteira de um pedido. */
function comoEnvio(cru: unknown): EnvioDeProposta | null {
  if (!cru || typeof cru !== "object") return null;
  const o = cru as Record<string, unknown>;
  const enviadoEm = texto(o.enviadoEm, 40);
  if (!enviadoEm) return null;
  const anexo = o.anexo as Record<string, unknown> | undefined;
  return {
    enviadoEm,
    para: texto(o.para, 320),
    porQuem: texto(o.porQuem, 120),
    modelo: texto(o.modelo, 120),
    idioma: o.idioma === "en" ? "en" : "pt",
    assunto: texto(o.assunto, 500),
    texto: texto(o.texto, MAXIMO_CORPO_GUARDADO),
    ...(anexo && typeof anexo === "object"
      ? {
          anexo: {
            nome: texto(anexo.nome, 240),
            bytes: typeof anexo.bytes === "number" && anexo.bytes >= 0 ? anexo.bytes : 0,
          },
        }
      : {}),
    ...(texto(o.propostaId, 60) ? { propostaId: texto(o.propostaId, 60) } : {}),
  };
}

/** Os envios de um pedido, do mais antigo ao mais recente. Nunca lança. */
export async function listarEnvios(quoteId: string): Promise<EnvioDeProposta[]> {
  const guardado = await getState<EnviosDoPedido>(chaveDosEnvios(quoteId));
  const crus = Array.isArray(guardado?.envios) ? guardado.envios : [];
  return crus.map(comoEnvio).filter((e): e is EnvioDeProposta => e !== null);
}

/**
 * Acrescenta um envio à lista do pedido.
 *
 * NUNCA LANÇA, e isto é a parte que interessa: o email JÁ SAIU quando esta
 * função é chamada. Uma falha a guardar a cópia não pode virar um erro no ecrã
 * de quem enviou — do lado dela, a proposta seguiu, e a única coisa que uma
 * excepção aqui conseguia era fazê-la carregar em Enviar outra vez e o casal
 * receber a proposta duas vezes. Devolve ONDE ficou, para quem chamar poder
 * dizer a verdade sem ter de a adivinhar.
 */
export async function registarEnvio(
  quoteId: string,
  envio: EnvioDeProposta,
): Promise<ResultadoDeEscrita> {
  try {
    const anteriores = await listarEnvios(quoteId);
    const limpo = comoEnvio(envio);
    if (!limpo) {
      log.warn("envios de proposta: entrada sem forma, não foi guardada", { quoteId });
      return { gravado: false, duradouro: false, onde: "nenhures" };
    }
    // O mais antigo é o que sai. `slice(-N)` depois de acrescentar, e não
    // antes: com a lista já no tecto, cortar primeiro deitava fora um envio
    // para depois falhar a escrita e ficar sem os dois.
    const envios = [...anteriores, limpo].slice(-ENVIOS_GUARDADOS);
    return await setState<EnviosDoPedido>(chaveDosEnvios(quoteId), { envios });
  } catch (e) {
    log.error("envios de proposta: não foi possível guardar a cópia do email", e, { quoteId });
    return { gravado: false, duradouro: false, onde: "nenhures" };
  }
}
