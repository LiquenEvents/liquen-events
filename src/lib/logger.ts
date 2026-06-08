/**
 * Minimal structured logger.
 *
 * Emits one JSON line per event in production (easy to grep/ingest in Vercel
 * logs or any log drain) and a readable line in development. Zero dependencies.
 *
 * Sentry-ready: if you later add the Sentry SDK, forward from `error()` — the
 * call sites already pass structured context, so no app changes are needed.
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

  if (level === "error") alertWebhook(message, context, err);
}

export const log = {
  debug: (message: string, context?: Context) => emit("debug", message, context),
  info: (message: string, context?: Context) => emit("info", message, context),
  warn: (message: string, context?: Context) => emit("warn", message, context),
  error: (message: string, err?: unknown, context?: Context) =>
    emit("error", message, context, err),
};
