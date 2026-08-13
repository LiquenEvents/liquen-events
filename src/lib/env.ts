import "server-only";
import { log } from "./logger";

/**
 * Environment validation. Surfaces misconfiguration loudly at startup instead
 * of failing mysteriously at runtime. We warn (rather than throw) so a missing
 * optional integration degrades gracefully, but production-critical security
 * settings are flagged prominently.
 */
interface EnvCheck {
  name: string;
  /** Critical in production — logged at error level when missing. */
  critical?: boolean;
  /** What this var enables, for the log message. */
  enables: string;
}

const CHECKS: EnvCheck[] = [
  { name: "SESSION_SECRET", critical: true, enables: "tamper-proof admin sessions" },
  // Fora de produção, faltar isto é inofensivo: `sharedHash()` cai na hash de
  // desenvolvimento. Em produção NÃO cai — a hash de desenvolvimento está no
  // repositório e é pública, por isso `sharedHash()` devolve `null` e o login
  // de admin fica DESLIGADO. Como o `ADMIN_USERS` é a outra porta para a mesma
  // fechadura, a criticidade não é desta variável sozinha: é das duas em falta
  // ao mesmo tempo, e por isso está tratada à parte (ver `validateEnv`).
  {
    name: "ADMIN_PASSWORD_HASH",
    enables: "the shared admin password (no fallback in production — login is refused without it)",
  },
  // Without Supabase in production the app silently falls back to local JSON
  // files, which are EPHEMERAL on serverless — submissions would be lost on the
  // next deploy/instance swap. That's data loss, not degradation: critical.
  {
    name: "SUPABASE_URL",
    critical: true,
    enables: "persistent storage (without it, prod data is written to ephemeral files and LOST)",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    critical: true,
    enables:
      "persistent storage writes (without it, prod data is written to ephemeral files and LOST)",
  },
  // Email is sent via SMTP/Nodemailer (see lib/mail.ts) — validate the vars the
  // app actually reads, not a Resend key that isn't used anywhere.
  { name: "SMTP_HOST", enables: "outbound email (contact + quote notifications)" },
  { name: "SMTP_USER", enables: "outbound email (SMTP authentication)" },
  { name: "SMTP_PASS", enables: "outbound email (SMTP authentication)" },
  { name: "VAPID_PUBLIC_KEY", enables: "web push notifications" },
  { name: "VAPID_PRIVATE_KEY", enables: "web push notifications" },
  { name: "SENTRY_DSN", enables: "error monitoring (Sentry, via lib/logger)" },
  // Não é crítica: sem ela o botão «Traduzir para inglês» do estúdio diz, com
  // todas as letras, que a tradução automática não está ligada, e a proposta
  // inglesa continua a poder ser escrita à mão. Fica na lista para o aviso de
  // arranque dizer PORQUE é que o botão está desligado — descobri-lo pelo botão
  // é descobri-lo com o cliente à espera.
  {
    name: "DEEPL_API_KEY",
    enables: "automatic PT→EN translation of proposal prose (studio «Traduzir para inglês»)",
  },
  // Without it the /api/cron/* routes fail closed in production (see their
  // authorized() checks) — so this isn't silent data loss, but it does mean
  // the daily digest / inbox-check cron jobs silently stop firing.
  {
    name: "CRON_SECRET",
    critical: true,
    enables: "authenticated /api/cron/* scheduled jobs (daily digest, inbox check)",
  },
];

let validated = false;

/** Run once at startup. Idempotent. */
export function validateEnv(): void {
  if (validated) return;
  validated = true;

  const isProd = process.env.NODE_ENV === "production";
  const missing: string[] = [];
  const missingCritical: string[] = [];

  const definida = (name: string): boolean => {
    const value = process.env[name];
    return Boolean(value && value.length > 0);
  };

  for (const check of CHECKS) {
    if (definida(check.name)) continue;
    if (check.critical && isProd) missingCritical.push(`${check.name} — ${check.enables}`);
    else missing.push(`${check.name} — ${check.enables}`);
  }

  // A PORTA DO BACK OFFICE. Nenhuma das duas variáveis é crítica sozinha — são
  // duas maneiras de configurar a MESMA fechadura, e quem usa contas
  // individuais não tem (nem quer) uma palavra-passe partilhada. Faltarem as
  // duas em produção é que é crítico: `sharedHash()` recusa a hash de
  // desenvolvimento (é pública, está no repositório), `configuredUsers()`
  // devolve null, e o login de admin fica desligado — ninguém entra, e
  // descobre-se ao tentar. Sem esta linha, o aviso ficava no meio dos do SMTP.
  if (isProd && !definida("ADMIN_PASSWORD_HASH") && !definida("ADMIN_USERS")) {
    missingCritical.push(
      "ADMIN_PASSWORD_HASH (ou ADMIN_USERS) — sem um dos dois o login do back office fica DESLIGADO em produção",
    );
  }

  // SESSION_SECRET must be a real key, not merely present: the token/session
  // signers require ≥ 32 chars and otherwise fall back to a weaker derived key.
  // Flag a too-short secret in production so it's fixed, not silently downgraded.
  const sessionSecret = process.env.SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (isProd && sessionSecret && sessionSecret.length < 32) {
    missingCritical.push("SESSION_SECRET — demasiado curto; use 32+ caracteres aleatórios");
  }

  if (missingCritical.length) {
    log.error("Missing critical environment variables in production", undefined, {
      missing: missingCritical,
    });
  }
  if (missing.length) {
    log.warn("Optional environment variables not set; related features are disabled", {
      missing,
    });
  }
  if (!missingCritical.length && !missing.length) {
    log.info("Environment validated — all known variables present");
  }
}
