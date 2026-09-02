import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { log } from "./logger";
import { DEFAULT_VALID_DAYS } from "./proposal-doc";

/**
 * Signed, expiring tokens for the public "accept your proposal online" links.
 *
 * Same wire format as the admin session (src/lib/admin-auth.ts): an HMAC over a
 * base64url payload. The token is tamper-proof and unguessable, so a client can
 * only ever act on the exact proposal the link was minted for — no id
 * enumeration, no way to forge an acceptance.
 *
 * Domain separation: the payload carries `typ: "proposal"`, and the admin
 * session signs with a *derived* key while these tokens sign with the raw base
 * secret. Together this ensures a proposal link — which lives in a client's URL
 * for months (ver {@link TTL_MS}) — can NEVER be replayed as an admin session
 * cookie (and vice versa), even though both are derived from the same
 * SESSION_SECRET.
 */
/**
 * Quanto tempo o link sobrevive à validade da proposta.
 *
 * O casal que chega um dia atrasado tem de encontrar a frase honesta — «esta
 * proposta expirou a 12 de Outubro, fale connosco» — e não um link partido. E
 * o estúdio esticar a validade por mais uns dias (mudar o `validUntil`) não
 * pode obrigar a reenviar o email.
 */
const DIAS_DE_GRACA = 30;

/**
 * Prazo do link de aceitação.
 *
 * ── PORQUE É QUE ISTO NÃO É UM NÚMERO ESCRITO À MÃO ────────────────────────
 * Eram 14 dias, com o argumento de estarem «comfortably past a normal decision
 * window». Estavam, quando a proposta valia 30 dias; deixaram de estar quando a
 * validade por omissão passou a 60 ({@link DEFAULT_VALID_DAYS}, o que a folha
 * feita à mão sempre disse) — e este ficheiro não soube. O casal que abrisse o
 * email ao fim de três semanas, com o PDF na mão a dizer «válida até 12 de
 * Outubro», carregava no link e lia «Link inválido ou expirado». Um beco sem
 * saída na única página em que eles dizem que sim, e nada no back office a
 * mostrar que aquilo tinha acontecido.
 *
 * O prazo passa a SAIR da validade, para os dois números não poderem voltar a
 * separar-se. O custo é uma janela de exposição maior para um link reencaminhado
 * — e é um custo pequeno: o token é infalsificável, a rota tem limite de taxa, e
 * a acção que ele permite é efectivamente única (uma proposta já aceite ou
 * recusada não volta a mudar de estado). O link do Portal do Cliente, que mostra
 * bastante mais, já vive um ano com o mesmo raciocínio.
 *
 * Uma proposta com uma validade MAIOR do que a por omissão (`validUntilDays`)
 * continua a poder sobreviver ao seu próprio link; para essa fechar, o prazo
 * teria de ser decidido no momento de a enviar, onde a validade é conhecida.
 */
export const TTL_MS = 1000 * 60 * 60 * 24 * (DEFAULT_VALID_DAYS + DIAS_DE_GRACA);

/**
 * Até quando vale um link de proposta emitido AGORA.
 *
 * Exportado para o endereço curto poder expirar no mesmo instante que o token
 * assinado. São duas portas para a mesma sala: se uma fechasse antes da outra,
 * o casal via «expirou» num link e a proposta no outro, e ninguém saberia
 * explicar porquê.
 */
export function validadeDeUmLinkNovo(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + TTL_MS);
}

let randomFallbackSecret: string | null = null;

function secret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (hash) {
      // Derive a STABLE (but non-public) key from the secret password hash, the
      // same way admin-auth does. A per-process random key would differ between
      // concurrently-warm serverless instances, so a proposal link signed by one
      // instance would 401 when the client's click lands on another — breaking
      // real accept/decline links, not just surviving restarts. Still: set a real
      // SESSION_SECRET.
      log.error(
        "proposal-token: SESSION_SECRET não definido em produção — a derivar do ADMIN_PASSWORD_HASH; defina um SESSION_SECRET aleatório de 32+ caracteres",
      );
      return `derived:${hash}`;
    }
    // Neither secret configured: fall back to a per-process random key. Links may
    // stop validating across instances/restarts, but there's no stable secret to
    // sign with and we must never use a public/committed value.
    if (!randomFallbackSecret) randomFallbackSecret = randomBytes(32).toString("base64url");
    return randomFallbackSecret;
  }
  return "liquen-dev-proposal-secret-change-me";
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/** Mint a tamper-proof link token for a proposal. */
export function createProposalToken(proposalId: string): string {
  const payload = { typ: "proposal", pid: proposalId, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Validate a token; returns the proposal id or null if invalid/expired/tampered. */
export function readProposalToken(token: string | undefined | null): { proposalId: string } | null {
  if (!token) return null;
  // A canonical token is exactly `body.sig` (a base64url signature never contains
  // a "."). Reject any trailing junk (`body.sig.x`) rather than silently dropping
  // it — mirrors readPortalToken / readSession so all three verifiers are strict.
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    // A token that declares a different kind (e.g. an admin session,
    // typ:"session") is never a proposal link — refuse it. Tokens minted before
    // this claim existed carry no `typ`; still accept those so already-sent
    // accept links keep working until they expire on their own.
    if (payload.typ !== undefined && payload.typ !== "proposal") return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    if (typeof payload.pid !== "string" || !payload.pid) return null;
    return { proposalId: payload.pid };
  } catch {
    return null;
  }
}
