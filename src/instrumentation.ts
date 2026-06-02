/**
 * Next.js instrumentation hook — runs once when the server starts (Node.js
 * runtime only; the Edge runtime gets a separate cold start per request).
 * See node_modules/next/dist/docs for the current instrumentation API.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    validateEnv();

    const { log } = await import("./lib/logger");

    // Catch unhandled promise rejections before Node.js crashes the process.
    // Common source: fire-and-forget push notifications or email sending that
    // fail silently. Log and continue — the orchestrator will restart on real
    // crashes via uncaughtException below.
    process.on("unhandledRejection", (reason) => {
      log.error("Unhandled promise rejection", reason);
    });

    // Catch synchronous exceptions that slip past all try/catch boundaries.
    // Log, then exit so the orchestrator (Docker/Kubernetes/Vercel) can restart
    // the instance — staying up in an unknown state is worse than restarting.
    process.on("uncaughtException", (err) => {
      log.error("Uncaught exception — initiating shutdown", err);
      // Give the logger time to flush the structured JSON line before exiting.
      process.exitCode = 1;
      setTimeout(() => process.exit(1), 200).unref();
    });
  }
}
