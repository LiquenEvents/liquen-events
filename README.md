# Líquen Events

Marketing site **and** quote/event back-office for Líquen Events (Évora, PT).
Public site in a dark, editorial "Pixel Matters" style; an authenticated admin
at `/orcamento/admin` for quotes, tasks, calendar, suppliers, proposals and an
email inbox.

## Tech stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (Postgres) with a local-JSON fallback for dev
- **Vitest** (unit) · **Playwright** (E2E)
- Hosted on **Vercel** (also fully containerized — see below)

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in what you need (all optional in dev)
npm run dev                  # http://localhost:3000
```

With no env vars the app runs against a local JSON store under `data/`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` / `test:watch` / `test:coverage` | Vitest |
| `npm run test:e2e` | Playwright (needs `npx playwright install`) |
| `npm run format` | Prettier |
| `npm run gen:blur` / `gen:dims` | Regenerate image blur/size maps |

## Environment

All configuration is via environment variables — see [`.env.example`](./.env.example).
Nothing secret is committed; `.env*` is gitignored. The app validates env at
startup and logs loudly about anything missing (`src/lib/env.ts`).

Key security vars: `SESSION_SECRET` (required in prod), `ADMIN_PASSWORD_HASH`
or `ADMIN_USERS`, `CRON_SECRET`.

## CI/CD

GitHub Actions:

- **CI** (`ci.yml`) — lint · typecheck · unit tests · build · `npm audit`
  (fails on high/critical) + a non-blocking Playwright E2E job.
- **CodeQL** (`codeql.yml`) — security & quality code scanning, weekly + per PR.
- **Lighthouse** (`lighthouse.yml`) — non-blocking performance / a11y / SEO /
  best-practices budgets (`lighthouserc.json`).
- **Dependabot** keeps npm deps and Actions patched.

## Deployment

### Vercel (primary)
Push to the branch; Vercel builds and deploys. The daily reminder cron is
declared in [`vercel.json`](./vercel.json) (`0 7 * * *`), and form/cron
functions get a longer `maxDuration` so email/push sends don't time out.

### Docker (anywhere)
The app builds a self-contained server (`output: "standalone"`):

```bash
docker build -t liquen-events .
docker run -p 3000:3000 --env-file .env.local liquen-events
```

Runs as a non-root user with a container `HEALTHCHECK` against `/api/health`.

## Operations

- **Health probe:** `GET /api/health` → status, uptime, commit and which
  integrations are configured (booleans only) — point an uptime monitor here.
- **Cron:** `GET /api/cron/reminders` (daily) sends the team's summary; gated by
  `CRON_SECRET`.
- **Node:** pinned to 22 (`.nvmrc`, `engines`).

## Security

See [`SECURITY.md`](./SECURITY.md) and `/.well-known/security.txt`. Highlights:
bcrypt + signed/expiring sessions, `__Host-` cookie, per-route auth, PII
redaction, CSRF proxy, zod validation, rate-limiting, honeypot, hardened CSP
with violation reporting, and a full set of security headers.
