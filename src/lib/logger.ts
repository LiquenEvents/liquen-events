/**
 * Minimal structured logger.
 *
 * Emits one JSON line per event in production (easy to grep/ingest in Vercel
 * logs or any log drain) and a readable line in development. Zero dependencies.
 *
 * Error monitoring: set SENTRY_DSN and every error-level log is also captured
 * in Sentry (grouping, alert rules, history) via the plain envelope HTTP API —
 * no SDK dependency. ERROR_WEBHOOK_URL additionally posts errors to a
 * Slack/Discord webhook for real-time pings. Both are fire-and-forget:
 * observability must never become a failure mode.
 */
type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

const isProd = process.env.NODE_ENV === "production";

// Optional real-time error alerting. When ERROR_WEBHOOK_URL is set, error-level
// logs are POSTed (fire-and-forget) to a Slack/Discord/any incoming webhook so
// the team is notified in production. It never blocks or throws — observability
// must never become a failure mode — and a short per-message throttle stops a
// single recurring error from flooding the channel.
const recentAlerts = new Map<string, number>();

function alertWebhook(message: string, context: Context | undefined, err: unknown) {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url || process.env.NODE_ENV !== "production") return;

  const now = Date.now();
  const last = recentAlerts.get(message);
  if (last && now - last < 60_000) return;
  if (recentAlerts.size > 200) recentAlerts.clear();
  recentAlerts.set(message, now);

  const detail =
    err instanceof Error ? `${err.name}: ${err.message}` : err !== undefined ? String(err) : "";
  const ctx = context && Object.keys(context).length ? ` · ${JSON.stringify(context)}` : "";
  const text = `🔴 Líquen — ${message}${detail ? `\n${detail}` : ""}${ctx}`.slice(0, 1500);

  // Slack reads `text`, Discord reads `content` — send both so either works.
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, content: text }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

// Sentry via the envelope HTTP API. DSN format: https://KEY@HOST/PROJECT_ID.
// Same per-message throttle spirit as the webhook: a hot error loop shouldn't
// hammer the ingest endpoint (Sentry also rate-limits server-side).
const recentSentry = new Map<string, number>();

function sentryCapture(message: string, context: Context | undefined, err: unknown) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const m = dsn.match(/^https:\/\/([^@:]+)@([^/]+)\/(\d+)$/);
  if (!m) return;
  const [, key, host, projectId] = m;

  const now = Date.now();
  const last = recentSentry.get(message);
  if (last && now - last < 30_000) return;
  if (recentSentry.size > 200) recentSentry.clear();
  recentSentry.set(message, now);

  const eventId = globalThis.crypto.randomUUID().replace(/-/g, "");
  const sentAt = new Date().toISOString();
  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: "javascript",
    level: "error",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    logger: "liquen",
    message: { formatted: message },
    extra: {
      ...context,
      ...(err instanceof Error ? { stack: err.stack } : {}),
    },
    exception:
      err instanceof Error
        ? { values: [{ type: err.name, value: err.message }] }
        : err !== undefined
          ? { values: [{ type: "Error", value: String(err) }] }
          : undefined,
  };

  // Envelope = 3 newline-separated JSON lines: headers, item header, payload.
  const envelope = `${JSON.stringify({ event_id: eventId, sent_at: sentAt })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`;

  void fetch(`https://${host}/api/${projectId}/envelope/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=liquen-logger/1.0`,
    },
    body: envelope,
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

function emit(level: Level, message: string, context?: Context, err?: unknown) {
  const entry: Record<string, unknown> = {
    level,
    message,
    time: new Date().toISOString(),
    ...context,
  };

  if (err instanceof Error) {
    entry.error = { name: err.name, message: err.message, stack: err.stack };
  } else if (err !== undefined) {
    entry.error = err;
  }

  const sink = level === "error" || level === "warn" ? console.error : console.log;

  if (isProd) {
    sink(JSON.stringify(entry));
  } else {
    const ctx = context && Object.keys(context).length ? ` ${JSON.stringify(context)}` : "";
    sink(`[${level}] ${message}${ctx}`);
    if (err) sink(err);
  }

  if (level === "error") {
    alertWebhook(message, context, err);
    sentryCapture(message, context, err);
  }
}

export const log = {
  debug: (message: string, context?: Context) => emit("debug", message, context),
  info: (message: string, context?: Context) => emit("info", message, context),
  warn: (message: string, context?: Context) => emit("warn", message, context),
  error: (message: string, err?: unknown, context?: Context) =>
    emit("error", message, context, err),
};
