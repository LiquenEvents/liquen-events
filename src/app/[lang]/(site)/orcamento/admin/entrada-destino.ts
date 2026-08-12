/**
 * ════════════════════════════════════════════════════════════════════════════
 * PARA ONDE SE VOLTA DEPOIS DE ENTRAR — E PORQUE É QUE ISTO É UMA PORTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quem clica no link de um evento e não tem sessão é atirado para a entrada. A
 * seguir a entrar, ia parar sempre à página inicial do back office e tinha de
 * voltar a procurar o evento à mão. O destino tem de viajar com a pessoa.
 *
 * Só que «depois de entrar, vai para o endereço que vem no URL» é, escrito assim,
 * um REDIRECCIONAMENTO ABERTO: quem mandasse
 *
 *     .../orcamento/admin?destino=https://liquen-eventos.com/entrar
 *
 * punha o nosso próprio ecrã de entrada a despejar a equipa, já autenticada e a
 * confiar no que vê, num site que imita este. É o degrau que falta a metade dos
 * ataques de phishing, e é oferecido por uma funcionalidade de conforto.
 *
 * A defesa aqui NÃO é uma lista de coisas proibidas — «não começa por http»,
 * «não tem duas barras» — porque essa lista está sempre incompleta (`//evil.com`,
 * `/\evil.com`, `https:/evil.com`, `java\nscript:`, o `@` no meio de uma
 * autoridade…). É uma lista do que é PERMITIDO, e do que é permitido só faz
 * parte um caminho dentro do back office desta casa:
 *
 *  1. o texto é interpretado como URL relativo a uma base inventada. Se o
 *     resultado sair dessa base, tinha esquema ou autoridade próprios: recusa-se;
 *  2. e o caminho que sobra tem de bater certo com o back office
 *     (`/orcamento/admin…`, com ou sem prefixo de idioma). Um destino válido
 *     para fora dele — a página pública, o portal do cliente — não é um erro,
 *     mas também não é para aqui: quem entra no back office quer o back office.
 *
 * O que se devolve é sempre um caminho absoluto que começa por `/`, nunca o
 * texto de entrada tal e qual.
 */

/** O parâmetro que leva o destino no URL da entrada. */
export const PARAM_DESTINO = "destino";

/**
 * O caminho é uma página do back office?
 *
 * Aceita `/orcamento/admin`, `/pt/orcamento/admin/evento/123`, `/en/orcamento/
 * admin/carregamento/abc` — e nada mais. O prefixo de idioma é opcional porque
 * as duas formas existem no site (ver `normalizeLocale`).
 */
const CAMINHO_DO_BACK_OFFICE = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?orcamento\/admin(?:\/|$)/i;

/**
 * O destino, limpo — ou `null` quando não serve.
 *
 * Nunca lança: é chamada com o que vier no URL, e o que vier no URL é escolhido
 * por quem manda o link.
 */
export function destinoSeguro(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  // Um destino inteiro não passa de um caminho com filtros; 2000 é o tecto
  // prático dos browsers para o URL todo. Acima disto é ruído.
  if (bruto.length > 2000) return null;
  // Caracteres de controlo (incluindo `\n` e `\t`) são o truque que faz um
  // `java\nscript:` passar por cima de um filtro que só olha para o princípio.
  if (/[\u0000-\u001f\u007f]/.test(bruto)) return null;
  if (!bruto.startsWith("/")) return null;

  // A base é um domínio que não existe: se o texto trouxer esquema ou
  // autoridade próprios, a origem do resultado deixa de ser esta e apanha-se.
  const BASE = "https://destino.invalid";
  let url: URL;
  try {
    url = new URL(bruto, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  if (!CAMINHO_DO_BACK_OFFICE.test(url.pathname)) return null;

  // Recomposto a partir das partes já interpretadas, e não do texto original:
  // é o que garante que o que sai é exactamente o que foi verificado.
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Acrescenta o destino a um endereço de entrada. Usado pelo servidor, onde a
 * página protegida reencaminha para o ecrã de entrada.
 */
export function entradaCom(entrada: string, destino: string): string {
  return `${entrada}?${PARAM_DESTINO}=${encodeURIComponent(destino)}`;
}

// ── A marca de «esta aba esteve lá dentro» ─────────────────────────────────

/**
 * A chave, no `sessionStorage`, que diz que ESTA ABA teve o back office aberto.
 *
 * Serve uma pergunta a que o servidor não sabe responder: quando o ecrã de
 * entrada aparece, foi porque a sessão EXPIROU a meio do trabalho, ou porque
 * alguém acabou de abrir a página? Para o servidor as duas são iguais — não há
 * cookie válido — e a diferença é toda para quem está à frente do ecrã: uma
 * merece «a tua sessão expirou, o que estava guardado está guardado», a outra
 * não merece aviso nenhum.
 *
 * `sessionStorage` e não `localStorage`: a resposta é por ABA e por visita. Um
 * separador novo não herda o susto de outro, e fechar o browser limpa tudo.
 *
 * A marca é posta pelo back office ao montar e TIRADA quando se sai de
 * propósito (ver `SessaoExpirada.tsx`), para que carregar em «Sair» não produza
 * um aviso de expiração que seria mentira.
 */
export const MARCA_DE_SESSAO = "liquen:sessao-aberta";

/** Houve sessão nesta aba? Lê e LIMPA — a pergunta só se responde uma vez. */
export function consumirMarcaDeSessao(): boolean {
  try {
    if (typeof sessionStorage === "undefined") return false;
    const tinha = sessionStorage.getItem(MARCA_DE_SESSAO) !== null;
    if (tinha) sessionStorage.removeItem(MARCA_DE_SESSAO);
    return tinha;
  } catch {
    // Modo privado, armazenamento desligado por política. Não saber é o mesmo
    // que não ter havido: mostra-se a entrada normal, sem inventar um aviso.
    return false;
  }
}

export function marcarSessaoAberta(): void {
  try {
    sessionStorage.setItem(MARCA_DE_SESSAO, "1");
  } catch {
    /* sem armazenamento — o aviso perde-se, o resto funciona */
  }
}

export function limparMarcaDeSessao(): void {
  try {
    sessionStorage.removeItem(MARCA_DE_SESSAO);
  } catch {
    /* idem */
  }
}
