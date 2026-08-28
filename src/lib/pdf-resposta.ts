import "server-only";
import { createHash } from "node:crypto";

/**
 * SERVIR UM PDF COMO DEVE SER: tamanho conhecido, pedaços, e cache.
 *
 * ── O problema que isto resolve ───────────────────────────────────────────
 * O PDF da proposta não é linearizado ("fast web view"). Um PDF linearizado põe
 * a primeira página e a tabela de referências no INÍCIO do ficheiro, para o
 * leitor mostrar a página 1 antes de ter o resto; sem isso, a tabela fica no FIM
 * e o leitor precisa do ficheiro TODO antes de desenhar seja o que for.
 *
 * A pdf-lib não sabe linearizar, e o `qpdf` — que sabe — é um binário nativo que
 * não existe no ambiente serverless onde isto corre. Acrescentá-lo é uma decisão
 * de infraestrutura (ver o fim de PDF-BEFORE.md). Mas o sintoma — abrir devagar
 * no portal — dá-se resolver do lado de CÁ, sem binário nenhum:
 *
 * · `Content-Length` — sem ele a resposta segue em `chunked`, e o leitor de PDF
 *   não sabe onde está o fim do ficheiro. É onde está a tabela de referências.
 * · `Accept-Ranges` + pedidos parciais — o leitor pede primeiro os últimos
 *   quilobytes (a tabela), depois só os objectos da página que está a mostrar,
 *   em vez de arrastar os 3 MB de uma vez.
 * · `ETag` + `Cache-Control` — reabrir o mesmo documento deixa de custar nova
 *   transferência, e um pedido condicional fecha-se com um 304 vazio.
 *
 * ── E porque é que os pedaços PRECISAM da cache ao lado ───────────────────
 * Desenhar esta proposta não é ler um ficheiro do disco: vai buscar até 80 fotos
 * ao Storage e reencoda cada uma com o sharp. Anunciar `Accept-Ranges` sem mais
 * nada seria um TIRO NO PÉ — o leitor passaria a fazer cinco ou seis pedidos, e
 * cada um voltava a desenhar o documento inteiro. Uma transferência passava a
 * seis desenhos.
 *
 * Por isso os pedaços e a cache entram juntos, e é a `cachePdf` ao lado que faz
 * com que o segundo pedido não volte a desenhar nada.
 */

/** Cabeçalho de cache. Privado (é o documento de um cliente) e curto: uma
 *  proposta pode ser revista, e cinco minutos é bastante para a sessão de
 *  leitura sem arriscar mostrar uma versão velha durante muito tempo. */
const CACHE_CONTROL = "private, max-age=300, must-revalidate";

export interface OpcoesPdf {
  /** Nome do ficheiro, JÁ saneado por quem chama. */
  nome: string;
  /** Cabeçalhos extra (por exemplo `X-Fotos-Em-Falta`). */
  extra?: Record<string, string>;
  /**
   * Descarregar em vez de abrir no visualizador do browser?
   *
   * ── PORQUE É QUE ISTO PASSOU A SER UMA ESCOLHA ─────────────────────────
   *
   * Palavras dela sobre o botão do PDF no email: «isto não funciona. quero que
   * vá direto ao pdf da proposta ultra rápido. que se faça download.»
   *
   * A causa era os DOIS caminhos da mesma rota não fazerem a mesma coisa:
   *
   *   · ficheiro JÁ guardado → reencaminha para o endereço assinado do
   *     armazenamento, que leva `download` no pedido e portanto DESCARREGA;
   *   · ficheiro por desenhar → passava por aqui, e aqui estava `inline`.
   *
   * Ou seja: a primeira vez que alguém abre uma proposta — ou a primeira vez
   * depois de uma revisão, que muda a chave e obriga a desenhar de novo — o
   * ficheiro abria dentro do Safari em vez de descarregar. Num iPhone com 4G
   * fraco, um PDF de vários megabytes a abrir no visualizador é a diferença
   * entre «descarregou» e «isto não funciona»: fica um ecrã branco a encher-se
   * aos poucos, sem nada que diga que está a trabalhar.
   *
   * O mesmo botão tinha assim dois comportamentos conforme o dia. Agora tem um.
   *
   * Fica por omissão a `false` — `inline` — porque o contrato em PDF usa a
   * mesma função e abre-se para ler, não para arquivar. Quem quer descarregar
   * pede-o.
   */
  descarregar?: boolean;
}

/**
 * Um pedido de pedaço, já validado contra o tamanho do ficheiro.
 * `null` = não havia `Range`, ou havia e não se percebe / não se suporta.
 */
function lerRange(cabecalho: string | null, total: number): { inicio: number; fim: number } | null {
  if (!cabecalho) return null;
  // Só `bytes`. Qualquer outra unidade ignora-se (a norma manda responder 200).
  const m = /^bytes=(.*)$/i.exec(cabecalho.trim());
  if (!m) return null;
  const partes = m[1].split(",");
  // Vários intervalos exigiam uma resposta `multipart/byteranges`. Nenhum leitor
  // de PDF precisa disso, e responder 200 com o ficheiro inteiro é uma resposta
  // LEGAL a um pedido parcial — o cliente tem de a saber tratar. Fica o caminho
  // simples e correcto em vez do complicado e pouco testado.
  if (partes.length !== 1) return null;

  const p = /^(\d*)-(\d*)$/.exec(partes[0].trim());
  if (!p) return null;
  const [, a, b] = p;

  // `bytes=-500` — os últimos 500 bytes. É EXACTAMENTE o que um leitor de PDF
  // pede primeiro, para encontrar a tabela de referências que está no fim.
  if (a === "") {
    if (b === "") return null; // "bytes=-" não quer dizer nada
    const quantos = Number(b);
    if (!Number.isFinite(quantos) || quantos <= 0) return null;
    return { inicio: Math.max(0, total - quantos), fim: total - 1 };
  }

  const inicio = Number(a);
  if (!Number.isFinite(inicio) || inicio >= total) return null; // fora do ficheiro
  // `bytes=500-` — daí até ao fim.
  const fim = b === "" ? total - 1 : Math.min(Number(b), total - 1);
  if (!Number.isFinite(fim) || fim < inicio) return null;
  return { inicio, fim };
}

/** Um pedido de pedaço que EXISTE mas cai fora do ficheiro merece 416 e não um
 *  200 silencioso: o cliente pediu uma coisa concreta e tem de saber que não
 *  está lá. Distingue-se de "sem Range" e de "Range que não percebemos". */
function rangeForaDoFicheiro(cabecalho: string | null, total: number): boolean {
  if (!cabecalho) return false;
  const m = /^bytes=\s*(\d+)-(\d*)\s*$/i.exec(cabecalho.trim());
  if (!m) return false;
  return Number(m[1]) >= total;
}

/**
 * A resposta com o PDF: sempre com `Content-Length` e `ETag`, com pedaço quando
 * o cliente pede um, e com 304 quando ele já o tem.
 */
export function respostaPdf(
  request: Request,
  bytes: Buffer<ArrayBuffer>,
  opcoes: OpcoesPdf,
): Response {
  const total = bytes.length;
  const etag = `"${createHash("sha256").update(bytes).digest("base64url").slice(0, 27)}"`;

  const base: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${opcoes.descarregar ? "attachment" : "inline"}; filename="${opcoes.nome}"`,
    // Sem isto o cliente nunca chega a PEDIR um pedaço.
    "Accept-Ranges": "bytes",
    ETag: etag,
    "Cache-Control": CACHE_CONTROL,
    ...opcoes.extra,
  };

  // Já tem esta versão: 304 sem corpo. `If-None-Match` pode trazer vários,
  // separados por vírgula, e `*` quer dizer "qualquer uma que exista".
  const jaTem = request.headers.get("if-none-match");
  if (jaTem) {
    const lista = jaTem.split(",").map((s) => s.trim().replace(/^W\//, ""));
    if (lista.includes("*") || lista.includes(etag)) {
      return new Response(null, { status: 304, headers: base });
    }
  }

  const cabecalhoRange = request.headers.get("range");

  // Um `If-Range` que não bate certo com a versão que temos anula o pedido de
  // pedaço: o cliente tinha uma versão diferente em mãos, e costurar pedaços de
  // duas versões dava um ficheiro corrompido. Manda-se o documento inteiro.
  const seRange = request.headers.get("if-range");
  const rangeValido = !seRange || seRange.trim().replace(/^W\//, "") === etag;

  const pedaco = rangeValido ? lerRange(cabecalhoRange, total) : null;
  if (pedaco) {
    const { inicio, fim } = pedaco;
    // `subarray` não copia — partilha a memória do buffer original.
    const corpo = bytes.subarray(inicio, fim + 1);
    return new Response(corpo, {
      status: 206,
      headers: {
        ...base,
        "Content-Range": `bytes ${inicio}-${fim}/${total}`,
        "Content-Length": String(corpo.length),
      },
    });
  }

  if (rangeValido && rangeForaDoFicheiro(cabecalhoRange, total)) {
    return new Response(null, {
      status: 416,
      headers: { ...base, "Content-Range": `bytes */${total}` },
    });
  }

  return new Response(bytes, {
    status: 200,
    headers: { ...base, "Content-Length": String(total) },
  });
}
