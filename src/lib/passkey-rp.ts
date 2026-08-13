import "server-only";
import type { NextRequest } from "next/server";

/**
 * Quem somos, do ponto de vista do WebAuthn: o `rpID` (o domínio) e a origem
 * que a assinatura tem de trazer.
 *
 * ── Porque é que isto não é um detalhe ────────────────────────────────────
 * É AQUI que mora a resistência a phishing. O aparelho só assina para a origem
 * que o browser lhe diz, e o servidor só aceita a assinatura se essa origem for
 * a esperada. Alargar isto — aceitar "qualquer subdomínio", aceitar http —
 * desliga a única defesa que não depende de a pessoa reparar em nada.
 *
 * ── Derivar do pedido, e porque é seguro ──────────────────────────────────
 * Sem configuração, o domínio sai do cabeçalho `Host`, que é escolhido por quem
 * faz o pedido. Isso parece grave e não é, por duas razões que se sustentam uma
 * à outra:
 *
 *  • à ENTRADA, a credencial guardada traz o seu `rp_id`, e a rota exige que
 *    seja igual ao que se calcula agora. Um `Host: falso.com` produz um `rpID`
 *    para o qual não existe credencial nenhuma na tabela — não abre porta,
 *    fecha-a;
 *  • ao REGISTO só se chega com sessão de admin válida. Quem lá chegue já está
 *    dentro; registar uma credencial presa a um domínio que não é o nosso não
 *    lhe dá nada que não tivesse.
 *
 * Mesmo assim, defina-se `WEBAUTHN_RP_ID` em produção: torna a regra explícita
 * em vez de deduzida, e é o que impede uma passkey de ser criada num domínio de
 * pré-visualização e depois não funcionar no verdadeiro (ou o contrário) sem
 * ninguém perceber porquê.
 *
 * ── Pré-visualizações ─────────────────────────────────────────────────────
 * Cada deploy de pré-visualização do Vercel tem o seu domínio, portanto as
 * passkeys registadas lá NÃO funcionam em produção, nem as de produção lá. Não
 * é um defeito: é a promessa do protocolo a ser cumprida. Quem testar numa
 * pré-visualização regista lá um dispositivo, e entra na mesma com a
 * palavra-passe em qualquer sítio.
 */

/** Domínio de topo do serviço, quando explicitamente configurado. */
function rpIdConfigurado(): string | null {
  const v = process.env.WEBAUTHN_RP_ID?.trim();
  return v ? v : null;
}

function origemConfigurada(): string | null {
  const v = process.env.WEBAUTHN_ORIGIN?.trim();
  return v ? v.replace(/\/$/, "") : null;
}

/**
 * O `Host` do pedido, sem porta quando é a normal.
 *
 * Nunca usa `x-forwarded-host` sem mais: em produção o Vercel já normaliza o
 * `host`, e aceitar um cabeçalho extra só alargaria o que se pode fazer passar.
 */
function hostDoPedido(req: NextRequest): string {
  const host = req.headers.get("host") ?? "";
  return host.trim().toLowerCase();
}

/** O domínio a que as credenciais ficam presas. */
export function rpID(req: NextRequest): string {
  const configurado = rpIdConfigurado();
  if (configurado) return configurado;
  // `rpID` é só o domínio — sem porta, sem esquema. Em desenvolvimento o host
  // vem como "localhost:3000" e o rpID tem de ser "localhost".
  return hostDoPedido(req).split(":")[0] || "localhost";
}

/**
 * A origem exacta que a assinatura tem de declarar.
 *
 * O esquema sai do próprio pedido — que atrás de um proxy é o que o Next já
 * derivou do `x-forwarded-proto`, e localmente é o esquema verdadeiro. Ficava
 * antes fixo em `https` quando `NODE_ENV=production`, e isso parecia mais
 * seguro sem o ser: um build de produção servido em `http://localhost` (o que
 * o E2E faz, e o que se faz para reproduzir um problema) produzia a origem
 * errada e TODAS as passkeys deixavam de funcionar, com a mensagem genérica de
 * recusa a esconder porquê.
 *
 * Confiar no esquema do pedido também não abre nada: o browser só assina para a
 * origem verdadeira em que está, portanto um esquema forjado produz uma origem
 * que a assinatura não satisfaz — quebra a entrada, não a abre. E em produção
 * o HSTS não deixa lá chegar por `http`.
 */
export function origemEsperada(req: NextRequest): string {
  const configurada = origemConfigurada();
  if (configurada) return configurada;
  const host = hostDoPedido(req);
  const doPedido = req.nextUrl.protocol.replace(":", "");
  const proto = doPedido || (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}

/** Nome que aparece no aparelho quando pede o rosto ou a impressão digital. */
export const RP_NAME = "Líquen Events";
