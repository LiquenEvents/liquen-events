import "server-only";
import { getSupabase } from "./supabase";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ENDEREÇO ASSINADO DE UMA FOTOGRAFIA NÃO MUDA A CADA VISITA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «caso as pessoas vão ver as propostas outra vez no email, mas
 * já esteja muito mais rápido».
 *
 * Estava exactamente ao contrário. A página do casal é dinâmica e assinava as
 * fotografias todas a cada visita; o Supabase devolve um token novo de cada
 * vez, portanto o endereço mudava sempre. E a chave da cache do navegador
 * inclui o endereço inteiro — logo, para o telemóvel, o mesmo ficheiro com
 * outro endereço é OUTRA fotografia.
 *
 * As fotografias estão gravadas com validade de um ano (`cache-das-fotos.ts`),
 * e esse ano nunca valeu nada. Numa proposta de 46 fotografias, reabrir o link
 * do email voltava a descarregar 6,6 a 9,2 MB — pelos números medidos neste
 * repositório, mais de meio minuto numa ligação rural. É a explicação inteira
 * do «reabrir é tão lento como abrir».
 *
 * ── PORQUE É QUE GUARDAR O ENDEREÇO É SEGURO ──────────────────────────────
 *
 * Porque o CONTEÚDO de um caminho nunca muda, e isso não é uma esperança: está
 * escrito e argumentado no `cache-das-fotos.ts`. Cada ficheiro tem um `uuid`
 * gerado no carregamento e nunca reutilizado; trocar uma fotografia grava um
 * caminho NOVO e apaga o antigo; e a única reescrita que existe refaz os mesmos
 * bytes a partir do mesmo original.
 *
 * Caminho → bytes é imutável. Logo caminho → endereço pode ser permanente.
 *
 * ── E PORQUE É QUE A CHAVE É O CAMINHO, E NUNCA A PROPOSTA ────────────────
 *
 * É isto que torna impossível servir uma versão velha, por construção e não
 * por cuidado.
 *
 * Uma revisão muda QUE caminhos o documento lista — não muda o que um caminho
 * significa. O endereço guardado só é usado para um caminho que esteja no
 * documento que a rota acabou de resolver, e essa resolução (incluindo o salto
 * para a versão mais recente) acontece antes de isto ser sequer consultado.
 *
 * Consequência prática: **não há nada a invalidar quando ela revê uma
 * proposta.** Nenhum gancho no gravar, nenhuma limpeza no envio.
 */

/**
 * O que se guarda por caminho: um endereço por FAMÍLIA.
 *
 * As famílias são as quatro que a página assina — `original`, `miniatura`,
 * `media`, `mediaAvif` — e não os baldes, porque o balde de uma família depende
 * ainda de a fotografia vir da biblioteca de temas ou da própria proposta. O
 * balde continua a mandar na validação: lê-se do endereço guardado.
 */
export type UrlsPorFamilia = Record<string, string>;

/**
 * Quanto tempo de vida um endereço guardado ainda tem de ter para ser usado.
 *
 * Não é a validade da assinatura — é a MARGEM. Um endereço que expire enquanto
 * o casal ainda está a descarregar a fotografia é uma fotografia partida no
 * ecrã, e a margem é o que impede isso.
 *
 * Os dois números são muito diferentes porque as duas validades são muito
 * diferentes: as fotografias da proposta são assinadas por dez anos e as da
 * biblioteca de temas por seis horas (ver `theme-ref.ts`, que explica porquê).
 */
const MARGEM_MS = {
  /** Dez anos de validade: trinta dias de margem nunca se atingem na prática. */
  longa: 30 * 24 * 60 * 60 * 1000,
  /** Seis horas de validade: meia hora de margem é o que sobra sem arriscar. */
  curta: 30 * 60 * 1000,
} as const;

/**
 * O balde vem do próprio endereço: `…/object/sign/<balde>/<caminho>?token=…`.
 *
 * Lê-se de lá em vez de se receber de fora porque é o endereço que manda: se
 * ele aponta para um balde de temas, é pela regra dos temas que tem de ser
 * julgado, diga o que disser quem o guardou.
 */
function baldeDoEndereco(url: string, base: string): string | null {
  const prefixo = `${base}/storage/v1/object/sign/`;
  if (!url.startsWith(prefixo)) return null;
  const resto = url.slice(prefixo.length);
  const barra = resto.indexOf("/");
  return barra > 0 ? resto.slice(0, barra) : null;
}

/** Um balde de temas assina por seis horas; os das propostas, por dez anos. */
function margemDoBalde(balde: string): number {
  return balde.startsWith("theme-") ? MARGEM_MS.curta : MARGEM_MS.longa;
}

/**
 * O instante em que esta assinatura expira, ou `null` se não se conseguir ler.
 *
 * O token é um JWT: três partes separadas por pontos, e a do meio traz o `exp`
 * em segundos.
 */
function expiraEm(url: string): number | null {
  try {
    const token = new URL(url).searchParams.get("token");
    const meio = token?.split(".")[1];
    if (!meio) return null;
    const json = Buffer.from(meio.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Este endereço guardado ainda serve?
 *
 * ── A DECISÃO DE SEGURANÇA, E É O CONTRÁRIO DA DO NAVEGADOR ───────────────
 *
 * Existe um ajudante parecido no back office, e o comentário dele diz: «um URL
 * que não se consegue ler conta como bom — quem não sabe, não mexe». Ali está
 * certo: um palpite errado no navegador custa uma transferência a mais.
 *
 * Aqui custa outra coisa. Se se servir um endereço que não se consegue ler e
 * ele estiver morto, o casal abre a proposta de vinte mil euros com as
 * fotografias partidas. Portanto a omissão é a inversa: **o que não se consegue
 * ler não se usa** — assina-se de novo, que custa uma ida ao Storage.
 *
 * E confere-se de onde o endereço veio. Uma cópia de segurança restaurada
 * noutro projecto, ou um clone de testes, traria endereços de outro Supabase:
 * bem formados, com `exp` no futuro, e completamente mortos.
 */
function aindaServe(url: string, base: string): boolean {
  const balde = baldeDoEndereco(url, base);
  if (!balde) return false;
  const fim = expiraEm(url);
  if (fim === null) return false;
  return fim - Date.now() > margemDoBalde(balde);
}

/** A origem do Storage deste ambiente, para conferir de onde vêm os endereços. */
function origemDoStorage(): string | null {
  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? base.replace(/\/+$/, "") : null;
}

/**
 * Os endereços guardados que ainda servem, por caminho e por balde.
 *
 * Uma consulta só, pela chave primária. Nunca lança: sem armazenamento, sem
 * tabela, ou com a leitura a falhar, devolve-se um mapa vazio — e quem chama
 * assina tudo, que é exactamente o que fazia antes disto existir.
 */
export async function urlsGuardados(
  paths: readonly string[],
): Promise<Map<string, UrlsPorFamilia>> {
  const saida = new Map<string, UrlsPorFamilia>();
  const base = origemDoStorage();
  const sb = getSupabase();
  if (!sb || !base || paths.length === 0) return saida;
  try {
    const { data, error } = await sb
      .from("biblioteca_fotos")
      .select("path, urls")
      .in("path", [...new Set(paths)]);
    if (error || !data) return saida;
    for (const linha of data as { path?: unknown; urls?: unknown }[]) {
      const caminho = typeof linha.path === "string" ? linha.path : "";
      const guardados = linha.urls;
      if (!caminho || !guardados || typeof guardados !== "object") continue;
      const bons: UrlsPorFamilia = {};
      for (const [familia, url] of Object.entries(guardados as Record<string, unknown>)) {
        if (typeof url === "string" && aindaServe(url, base)) bons[familia] = url;
      }
      if (Object.keys(bons).length > 0) saida.set(caminho, bons);
    }
  } catch (e) {
    log.warn("urls-assinados: não deu para ler os guardados", { erro: String(e) });
  }
  return saida;
}

/**
 * Guarda os endereços acabados de assinar, juntando-os aos que já lá estavam.
 *
 * `urls || excluded.urls` do lado do Postgres seria mais elegante, mas obrigava
 * a SQL cru; juntar aqui os que se acabaram de ler custa nada e mantém isto
 * dentro do cliente normal.
 *
 * Nunca lança: falhar a gravar custa uma assinatura repetida na visita
 * seguinte, e mais nada. Nunca escreve `pasta`, que é uma coluna gerada.
 */
export async function guardarUrls(
  novos: Map<string, UrlsPorFamilia>,
  jaGuardados: Map<string, UrlsPorFamilia>,
): Promise<void> {
  const sb = getSupabase();
  if (!sb || novos.size === 0) return;
  try {
    const linhas = [...novos].map(([path, urls]) => ({
      path,
      urls: { ...(jaGuardados.get(path) ?? {}), ...urls },
    }));
    const { error } = await sb.from("biblioteca_fotos").upsert(linhas, { onConflict: "path" });
    if (error) log.warn("urls-assinados: não ficaram guardados", { erro: error.message });
  } catch (e) {
    log.warn("urls-assinados: não ficaram guardados", { erro: String(e) });
  }
}
