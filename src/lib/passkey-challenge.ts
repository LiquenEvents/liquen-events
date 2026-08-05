import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { subKey } from "./admin-auth";

/**
 * O desafio do WebAuthn, guardado num cookie ASSINADO em vez de numa tabela.
 *
 * ── Porquê um cookie, e não estado no servidor ────────────────────────────
 * O protocolo tem dois tempos: o servidor manda um número aleatório (o desafio),
 * o aparelho assina-o, e o servidor tem de saber, no segundo pedido, que aquele
 * desafio foi mesmo emitido por ele e há pouco. A forma habitual é uma tabela de
 * desafios pendentes. Aqui isso seria montar infraestrutura com estado — e
 * varrer-lhe as linhas mortas — para guardar um número durante dois minutos.
 *
 * Um cookie httpOnly assinado com HMAC dá as mesmas garantias sem nada disso: o
 * conteúdo não pode ser inventado (não se conhece a chave) nem esticado no tempo
 * (a validade vai DENTRO do que é assinado). O cookie é `SameSite=Strict` e de
 * vida curta, e o fluxo — registo ou entrada — vai no `typ`, para que um desafio
 * emitido para uma coisa não sirva para a outra.
 *
 * ── O que este desenho NÃO faz ────────────────────────────────────────────
 * Não impede a REUTILIZAÇÃO do mesmo desafio dentro dos dois minutos de vida:
 * sem estado partilhado não há onde marcar "este já foi gasto". Quem apanhasse
 * um desafio e a assinatura correspondente podia repeti-los nessa janela.
 *
 * Para o fazer valer alguma coisa, o atacante teria de conseguir ler o corpo de
 * um pedido HTTPS já feito — e nesse mundo tem o cookie de sessão, que dura 30
 * dias e não precisa de repetição nenhuma. Ou seja: a repetição de desafio não
 * abre nada que já não estivesse aberto. Fica escrito porque a alternativa —
 * uma tabela de desafios com marca de gasto — é o passo seguinte se um dia isto
 * proteger algo mais do que o back office.
 */

/** Vida do desafio. Curta: é o tempo de tocar no leitor, não o de ir almoçar. */
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

export const CHALLENGE_COOKIE = "liquen_pk_desafio";

export type ChallengeKind = "registo" | "entrada";

interface ChallengePayload {
  typ: "passkey-challenge";
  /** Registo ou entrada — um desafio de um fluxo nunca serve o outro. */
  kind: ChallengeKind;
  /** O desafio em base64url. */
  ch: string;
  /** Só no registo: a conta que estava autenticada quando o desafio foi emitido. */
  sub?: string;
  exp: number;
}

function challengeKey(): Buffer {
  return subKey("liquen.passkey-challenge.v1");
}

function sign(body: string): string {
  return createHmac("sha256", challengeKey()).update(body).digest("base64url");
}

/** Um desafio novo, com 32 bytes de aleatoriedade. */
export function novoDesafio(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Sela um desafio num token para ir no cookie.
 *
 * `userName` é obrigatório no registo (o desafio pertence a quem estava dentro)
 * e ignorado na entrada, onde ainda não se sabe quem é.
 */
export function selarDesafio(kind: ChallengeKind, challenge: string, userName?: string): string {
  const payload: ChallengePayload = {
    typ: "passkey-challenge",
    kind,
    ch: challenge,
    exp: Date.now() + CHALLENGE_TTL_MS,
  };
  if (kind === "registo") payload.sub = (userName ?? "").slice(0, 40);
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Lê e valida o token do cookie. Devolve null a qualquer sinal de problema:
 * formato, assinatura, tipo, fluxo trocado ou validade passada.
 */
export function lerDesafio(
  token: string | undefined | null,
  kind: ChallengeKind,
): { challenge: string; userName: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const esperada = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as ChallengePayload;
    if (payload.typ !== "passkey-challenge") return null;
    // Um desafio emitido para registar um dispositivo não pode ser apresentado
    // no caminho da entrada, nem o contrário.
    if (payload.kind !== kind) return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    if (typeof payload.ch !== "string" || !payload.ch) return null;
    return { challenge: payload.ch, userName: String(payload.sub ?? "") };
  } catch {
    return null;
  }
}

/**
 * Opções do cookie do desafio.
 *
 * `SameSite=Strict` e não `Lax`: este cookie não tem nenhuma razão para viajar
 * num pedido vindo de outro sítio, e o fluxo inteiro acontece dentro da página.
 * `maxAge` acompanha a validade assinada — o cookie desaparece do browser mais
 * ou menos quando deixa de ser aceite pelo servidor.
 */
export function opcoesCookieDesafio() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: Math.floor(CHALLENGE_TTL_MS / 1000),
  };
}
