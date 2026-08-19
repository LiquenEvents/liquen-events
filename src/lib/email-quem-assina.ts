import "server-only";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, readSession } from "./admin-auth";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUEM É QUE CARREGOU NO BOTÃO — LIDO DO COOKIE, NUNCA DO CORPO DO PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A assinatura dos emails ao cliente deixou de ser fixa (ver
 * `email-assinatura.ts`) e passou a ser a de quem os enviou. Este é o único
 * sítio por onde esse nome entra, e vem de um sítio só: o token ASSINADO da
 * sessão do back office. Não vem do corpo do pedido nem de um cabeçalho — um
 * nome escrito por quem faz o pedido era deixar qualquer pessoa com uma sessão
 * assinar emails com o nome de outra.
 *
 * O `readSession` já valida a assinatura HMAC, o prazo e a geração do token; um
 * token forjado, expirado ou revogado devolve `null`, e aqui isso é vazio — que
 * a assinatura lê como «assina a casa». É o mesmo comportamento de sempre, e é
 * o lado seguro: o nome da casa nunca está errado.
 *
 * Vive num ficheiro à parte e não dentro do `email-assinatura.ts` de propósito:
 * a assinatura é usada TAMBÉM na confirmação automática do formulário público
 * (`client-confirmation.ts`), que não tem sessão nenhuma e não pode arrastar o
 * módulo de autenticação atrás de si.
 */
/**
 * ── E NUNCA ATIRA ─────────────────────────────────────────────────────────
 *
 * Um nome para pôr debaixo de uma assinatura não pode, em circunstância
 * nenhuma, ser a razão pela qual uma proposta não chega ao cliente. Qualquer
 * coisa que corra mal aqui — um pedido sem `cookies` (um caminho interno que
 * não venha do browser), um cookie estragado — dá vazio, e vazio quer dizer
 * «assina a casa», que é exactamente o que saía antes desta funcionalidade
 * existir. Falha para o comportamento anterior, nunca para um 500.
 */
export function nomeDeQuemEnvia(request: NextRequest): string {
  try {
    const sessao = readSession(request.cookies?.get(ADMIN_COOKIE)?.value);
    return String(sessao?.name ?? "")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}
