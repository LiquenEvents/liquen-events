/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM URL ASSINADO SABE DIZER QUANDO MORRE — BASTA PERGUNTAR-LHE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O estúdio guarda os URLs assinados das fotos no `localStorage`, para reabrir
 * uma proposta sem esperar pela rede. Isso é bom, e é para manter: o URL
 * guardado é o MESMO que o browser já tem em cache, portanto reabrir não
 * descarrega nada.
 *
 * Mas os prazos não são todos iguais:
 *
 *   · a pasta do pedido (`proposal-assets`) assina a **10 anos** — é a
 *     pré-visualização dela própria e não vale a pena reassinar;
 *   · a Biblioteca de Temas assina a **6 horas** (`THEME_SIGNED_TTL`), porque é
 *     o activo do estúdio inteiro e cada URL que escapa dela custa mais.
 *
 * Seis horas é pouco para um rascunho que fica aberto de um dia para o outro. E
 * a hidratação, que existe precisamente para trazer assinaturas frescas, tinha
 * isto:
 *
 * ```ts
 * if (im.path && im.url && !next[im.path]) next[im.path] = im.thumbUrl || im.url;
 * ```
 *
 * O `!next[im.path]` deitava fora a assinatura FRESCA sempre que já houvesse
 * uma guardada — mesmo morta. A célula ficava a pedir um URL que o Supabase
 * recusa, e a foto só voltava pelo plano B, depois de pagar um 400 por
 * fotografia.
 *
 * ── PORQUE NÃO É SÓ TIRAR O `!` ────────────────────────────────────────────
 * Substituir sempre resolvia a validade e estragava a cache: uma assinatura
 * nova é um URL novo, e um URL novo é um download novo de uma fotografia que o
 * browser já tem no disco. Reabrir uma proposta com trinta fotos passaria a
 * custar trinta downloads que hoje custam zero.
 *
 * A resposta é perguntar ao próprio URL. Um URL assinado do Supabase Storage
 * leva um JWT no `?token=`, e o JWT diz `exp`. Guarda-se o que ainda serve e
 * substitui-se o que já não serve — cache mantida, validade garantida.
 */

/** Margem antes do fim: um URL que morre daqui a um minuto não serve de nada. */
const MARGEM_MS = 5 * 60 * 1000;

/**
 * Descodifica a parte útil de um JWT sem verificar a assinatura.
 *
 * Sem verificar de propósito, e não é descuido: isto corre no BROWSER e a
 * pergunta é «vale a pena tentar?», não «isto é de confiar?». Quem verifica é o
 * Supabase, do outro lado. A pior consequência de uma leitura errada aqui é
 * pedir-se uma assinatura fresca que não fazia falta.
 */
function cargaDoToken(token: string): { exp?: number } | null {
  const partes = token.split(".");
  if (partes.length < 2) return null;
  try {
    const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
    const dados = JSON.parse(json);
    return dados && typeof dados === "object" ? dados : null;
  } catch {
    return null;
  }
}

/**
 * `true` quando o URL assinado já não serve — ou está tão perto do fim que não
 * vale a pena tentar.
 *
 * **Um URL que não se consegue ler conta como bom.** É o lado seguro: um
 * formato que eu não reconheça (um URL público, um `data:`, um Storage que mude
 * de formato de token) não pode fazer a grelha descartar o que tem e voltar a
 * descarregar tudo. Quem não sabe, não mexe.
 */
export function assinaturaExpirada(url: string | undefined, agora = Date.now()): boolean {
  if (!url) return false;
  let token: string | null;
  try {
    token = new URL(url, "http://x").searchParams.get("token");
  } catch {
    return false;
  }
  if (!token) return false;
  const carga = cargaDoToken(token);
  // `exp` do JWT é em SEGUNDOS. Tratá-lo como milissegundos dava um prazo em
  // 1970 e declarava tudo expirado — que é o erro que faz reabrir uma proposta
  // custar trinta downloads.
  if (!carga || typeof carga.exp !== "number" || !Number.isFinite(carga.exp)) return false;
  return carga.exp * 1000 - MARGEM_MS <= agora;
}

/**
 * O URL a manter no mapa: o guardado enquanto servir, o fresco quando não.
 *
 * Aqui num sítio só porque a hidratação e a restauração do rascunho fazem a
 * mesma pergunta, e já divergiram uma vez.
 */
export function urlAindaBom(guardado: string | undefined, fresco: string): string {
  if (!guardado) return fresco;
  return assinaturaExpirada(guardado) ? fresco : guardado;
}
