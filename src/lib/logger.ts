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
}

export const log = {
  debug: (message: string, context?: Context) => emit("debug", message, context),
  info: (message: string, context?: Context) => emit("info", message, context),
  warn: (message: string, context?: Context) => emit("warn", message, context),
  error: (message: string, err?: unknown, context?: Context) => emit("error", message, context, err),
};
