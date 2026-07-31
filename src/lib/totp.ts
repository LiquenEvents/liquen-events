import "server-only";
import crypto from "node:crypto";

/**
 * TOTP (RFC 6238) — self-contained, dependency-free, using node:crypto.
 * SHA-1, 6 digits, 30s period (the defaults every authenticator app uses).
 * Verified against the RFC 6238 test vectors in totp.test.ts.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

/** TOTP code for a base32 secret at a given unix time (seconds). */
export function totp(secretB32: string, atSeconds = Date.now() / 1000): string {
  return hotp(base32Decode(secretB32), Math.floor(atSeconds / 30));
}

/**
 * Verify a 6-digit token against a base32 secret. Accepts the current step and
 * up to `window` PAST steps for clock drift, but NOT future steps — accepting a
 * not-yet-current code needlessly widens the guess/replay window for no real
 * usability gain. Constant-time comparison.
 *
 * NOTA: não gasta o código — é o verificador puro, mantido sem estado para
 * poder ser confrontado com os vectores da RFC. No login usa-se `verifyTotpOnce`,
 * que recusa um código já usado.
 */
export function verifyTotp(secretB32: string, token: string, window = 1): boolean {
  return matchStep(secretB32, token, window) !== null;
}

/**
 * Como `verifyTotp`, mas devolve o passo que emparelhou (ou null). É esse passo
 * que o registo de códigos gastos precisa de conhecer.
 */
function matchStep(secretB32: string, token: string, window: number): number | null {
  const t = (token ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(t)) return null;
  const secret = base32Decode(secretB32);
  if (secret.length === 0) return null;
  const step = Math.floor(Date.now() / 1000 / 30);
  const provided = Buffer.from(t);
  for (let w = -window; w <= 0; w++) {
    const expected = Buffer.from(hotp(secret, step + w));
    if (expected.length === provided.length && crypto.timingSafeEqual(expected, provided)) {
      return step + w;
    }
  }
  return null;
}

// ── Códigos de uso único ───────────────────────────────────────────────────
//
// A RFC 6238 (§5.2) diz que uma validação bem sucedida NÃO pode ser aceite uma
// segunda vez. Sem isto, um código vale os ~60 s da janela inteira e pode ser
// reutilizado à vontade dentro dela — que é exactamente o que um phishing em
// tempo real faz: apanha a palavra-passe e o código no site falso e usa-os no
// site verdadeiro, segundos depois. O segundo factor deixa de acrescentar seja
// o que for a partir do momento em que o código é reutilizável.
//
// Guarda-se o ÚLTIMO passo aceite por segredo e recusa-se tudo o que seja igual
// ou anterior: isso queima também o passo anterior da janela de tolerância, que
// de outro modo continuaria disponível depois de o actual ter sido usado.
//
// O segredo nunca entra no mapa em claro — a chave é o SHA-256 dele. Quem
// partilhe o mesmo ADMIN_TOTP_SECRET partilha também o registo: se duas pessoas
// usarem o mesmo segredo, a segunda tem de esperar pelo passo seguinte. É a
// consequência certa — um segredo partilhado é um só factor, não dois.
//
// LIMITE CONHECIDO: esta memória é do processo. Em serverless com várias
// instâncias, uma repetição que caia noutra instância passa. Fecha a janela na
// esmagadora maioria dos casos (uma equipa pequena, poucos processos) e nunca é
// pior do que não ter nada; a versão à prova de tudo exige guardar o passo na
// base de dados, e isso é uma alteração de armazenamento, não deste ficheiro.
const passosGastos = new Map<string, number>();

function idDoSegredo(secretB32: string): string {
  return crypto.createHash("sha256").update(secretB32).digest("base64url");
}

/** Descarta segredos parados há mais de uma hora para o mapa não crescer. */
function limparGastos(passoActual: number): void {
  if (passosGastos.size < 256) return;
  for (const [k, passo] of passosGastos) {
    if (passoActual - passo > 120) passosGastos.delete(k);
  }
}

/**
 * Verifica o código E gasta-o: a mesma combinação segredo+código só é aceite
 * uma vez. Devolve false para um código já usado, mesmo que ainda esteja dentro
 * da janela de tolerância. É esta a função que o login deve usar.
 */
export function verifyTotpOnce(secretB32: string, token: string, window = 1): boolean {
  const passo = matchStep(secretB32, token, window);
  if (passo === null) return false;

  const id = idDoSegredo(secretB32);
  const ultimo = passosGastos.get(id);
  // Já gasto (ou já se avançou para lá dele) → recusa.
  if (ultimo !== undefined && passo <= ultimo) return false;

  passosGastos.set(id, passo);
  limparGastos(passo);
  return true;
}

/** Só para testes: esquece os códigos gastos. */
export function resetTotpUsage(): void {
  passosGastos.clear();
}

/** Generate a fresh base32 TOTP secret (160 bits). */
export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** otpauth:// URI to enrol the secret in an authenticator app (QR-encodable). */
export function totpUri(secret: string, account: string, issuer = "Líquen Events"): string {
  const i = encodeURIComponent(issuer);
  return (
    `otpauth://totp/${i}:${encodeURIComponent(account)}` +
    `?secret=${secret}&issuer=${i}&algorithm=SHA1&digits=6&period=30`
  );
}
