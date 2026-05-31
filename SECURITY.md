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
- Sessions are **HMAC-signed, expiring tokens** (tamper-proof); changing the name
  or expiry invalidates the signature.
- Stored in an **httpOnly, Secure (prod), SameSite=Lax** cookie.
- Supports per-user accounts via `ADMIN_USERS`; secrets come from environment
  variables (`SESSION_SECRET`, `ADMIN_PASSWORD_HASH`). Missing critical secrets
  are flagged loudly at startup (`src/lib/env.ts`).

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
