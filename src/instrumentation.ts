/**
 * Next.js instrumentation hook — runs once when the server starts.
 * We use it to validate environment configuration up front.
 * See node_modules/next/dist/docs for the current instrumentation API.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    validateEnv();
  }
}
