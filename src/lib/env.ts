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
  { name: "ADMIN_PASSWORD_HASH", enables: "the shared admin password (else a dev default is used)" },
  { name: "SUPABASE_URL", enables: "persistent storage (else local file in dev)" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", enables: "persistent storage writes" },
  { name: "RESEND_API_KEY", enables: "outbound email notifications" },
  { name: "VAPID_PUBLIC_KEY", enables: "web push notifications" },
  { name: "VAPID_PRIVATE_KEY", enables: "web push notifications" },
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
