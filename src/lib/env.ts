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
  {
    name: "ADMIN_PASSWORD_HASH",
    enables: "the shared admin password (else a dev default is used)",
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
];

let validated = false;

/** Run once at startup. Idempotent. */
export function validateEnv(): void {
  if (validated) return;
  validated = true;

  const isProd = process.env.NODE_ENV === "production";
  const missing: string[] = [];
  const missingCritical: string[] = [];

  for (const check of CHECKS) {
    const value = process.env[check.name];
    if (value && value.length > 0) continue;
    if (check.critical && isProd) missingCritical.push(`${check.name} — ${check.enables}`);
    else missing.push(`${check.name} — ${check.enables}`);
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
