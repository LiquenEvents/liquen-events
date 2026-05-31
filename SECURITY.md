# Security

Security is a first-class concern in this project. This document summarises the
controls in place and how to report issues.

## Reporting a vulnerability

Please email **liquen.alentejo@gmail.com** (see also `/.well-known/security.txt`).
We support responsible disclosure and aim to respond promptly. Please do not
open public issues for security reports.

## Controls in place

### Authentication & sessions (`src/lib/admin-auth.ts`)
- Passwords are verified against **bcrypt** hashes — never stored or compared in plaintext.
- Optional **two-factor authentication (TOTP, RFC 6238)** — `src/lib/totp.ts`,
  verified against the official RFC test vectors; per-user (`ADMIN_USERS.totpSecret`)
  or global (`ADMIN_TOTP_SECRET`). Login is a two-step flow when enabled.
- Sessions are **HMAC-signed, expiring tokens** (tamper-proof); changing the name
  or expiry invalidates the signature.
- Stored in an **httpOnly, Secure (prod), SameSite=Lax**, `__Host-`-prefixed cookie.
- Supports per-user accounts via `ADMIN_USERS`; secrets come from environment
  variables (`SESSION_SECRET`, `ADMIN_PASSWORD_HASH`). Missing critical secrets
  are flagged loudly at startup (`src/lib/env.ts`).
- The login endpoint is **rate-limited** and writes an **audit log** for every
  attempt (success/failure/2FA, with client IP).

### Authorisation
- Every admin API route is gated by `isAuthed()`. The only public endpoints are
  the contact/quote form submissions, login and logout.
- The public quote-confirmation endpoint **redacts all personal data** (name,
  email, phone, …) for unauthenticated callers, so enumerating a reference id
  cannot leak PII.

### Input validation & abuse prevention
- Public form payloads are validated with **zod** (`src/lib/validation.ts`).
- Login and public forms are **rate-limited** per IP (`src/lib/rate-limit.ts`).
- The cron endpoint is protected by a `CRON_SECRET` bearer token.

### CSRF
- `SameSite=Lax` session cookie, plus an **edge middleware** (`src/middleware.ts`)
  that rejects cross-origin state-changing API requests (POST/PUT/PATCH/DELETE).

### Output / XSS
- React escapes all rendered values by default.
- JSON-LD is serialised through a hardened helper (`src/lib/jsonld.ts`) that
  escapes `<` and U+2028/U+2029 to prevent `</script>` breakout.
- Outbound email HTML escapes interpolated values (`esc()` in `src/lib/mail.ts`).

### HTTP security headers (`next.config.ts`)
- **Content-Security-Policy** (locks down `object-src`, `base-uri`,
  `frame-ancestors`, `form-action`).
- **Strict-Transport-Security** (HSTS, 2y, preload), `X-Content-Type-Options:
  nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`,
  `X-Permitted-Cross-Domain-Policies: none`.

### Secrets
- No secrets in source control (`.env*` is gitignored; only `.env.example`
  templates are committed). The service-role database key is server-only.

## Design decisions (documented risk acceptance)
- **CSP keeps `'unsafe-inline'` for `script-src`.** A nonce-based CSP was
  evaluated and deliberately **not** adopted: per the Next.js docs it forces
  fully dynamic rendering, which would cost this marketing site its static
  prerendering and CDN caching, for a marginal gain. The residual risk is low
  here — there is no user-generated content rendered into scripts and every
  other XSS control is in place (React auto-escaping, hardened JSON-LD inline
  data, escaped outbound email HTML, and a CSP that locks down everything else
  with violation reporting). Revisited periodically.

## Known low-risk / accepted items
- `npm audit` reports a moderate advisory in **postcss**, pulled in transitively
  by Next.js and used only at build time on our own CSS (no untrusted input).
  The advised "fix" downgrades Next.js, so we track it rather than apply it.
- CodeQL flags "network data written to file" in `src/lib/push.ts`. This is
  **by design** — storing a Web Push subscription is the feature. It is
  mitigated: the subscription is validated and reconstructed via zod (https
  endpoint, size caps) before persisting, and the file path is a fixed constant
  (no path traversal). The endpoint that accepts it is also authenticated. The
  file store is only a dev fallback; production uses Supabase. Accepted risk.
