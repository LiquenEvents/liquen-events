// Generate a TOTP secret + enrolment URI for admin 2FA.
// Usage: npm run gen:totp -- "Catarina"
import crypto from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function generateSecret() {
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

const account = process.argv[2] || "Admin";
const issuer = "Líquen Events";
const secret = generateSecret();
const uri =
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

console.log(`
🔐  2FA (TOTP) — novo segredo para "${account}"

1) Define a variável de ambiente (Vercel → Settings → Environment Variables):

   ADMIN_TOTP_SECRET=${secret}

   (ou, com contas individuais, adiciona "totpSecret" à entrada em ADMIN_USERS)

2) Regista no teu autenticador (Google Authenticator / Authy / 1Password):

   • Entrada manual — segredo:  ${secret}
   • Ou por QR a partir deste URI:
     ${uri}

A partir daí, o login passa a pedir o código de 6 dígitos. ✅
`);
