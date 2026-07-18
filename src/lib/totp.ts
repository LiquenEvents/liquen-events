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
 * Verify a 6-digit token against a base32 secret, allowing ±`window` 30s steps
 * for clock drift. Constant-time comparison.
 */
export function verifyTotp(secretB32: string, token: string, window = 1): boolean {
  const t = (token ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(t)) return false;
  const secret = base32Decode(secretB32);
  if (secret.length === 0) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  const provided = Buffer.from(t);
  for (let w = -window; w <= window; w++) {
    const expected = Buffer.from(hotp(secret, step + w));
    if (expected.length === provided.length && crypto.timingSafeEqual(expected, provided)) {
      return true;
    }
  }
  return false;
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
