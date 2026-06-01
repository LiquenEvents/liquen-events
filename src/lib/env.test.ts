import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const VARS = [
  "SESSION_SECRET",
  "ADMIN_PASSWORD_HASH",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "CRON_SECRET",
] as const;

/** validateEnv() is idempotent via a module-level flag, so each test needs a
 *  fresh module instance. */
async function freshValidate() {
  vi.resetModules();
  return (await import("./env")).validateEnv;
}

function joined(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");
}

describe("validateEnv", () => {
  const saved: Record<string, string | undefined> = {};
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const k of VARS) saved[k] = process.env[k];
    for (const k of VARS) delete process.env[k];
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    for (const k of VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    logSpy.mockRestore();
    errSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("logs success when every known variable is present", async () => {
    for (const k of VARS) process.env[k] = "x";
    (await freshValidate())();
    expect(joined(logSpy)).toContain("Environment validated");
  });

  it("warns (but does not error) about optional vars outside production", async () => {
    // Ambient NODE_ENV under vitest is "test" (not production).
    (await freshValidate())();
    expect(joined(errSpy)).toContain("Optional environment variables");
    expect(joined(errSpy)).not.toContain("Missing critical");
  });

  it("errors loudly when a critical var is missing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const k of VARS) if (k !== "SESSION_SECRET") process.env[k] = "x";
    (await freshValidate())();
    const out = joined(errSpy);
    expect(out).toContain("Missing critical environment variables");
    expect(out).toContain("SESSION_SECRET");
  });

  it("is idempotent — repeated calls validate only once", async () => {
    const validateEnv = await freshValidate();
    validateEnv();
    const before = logSpy.mock.calls.length + errSpy.mock.calls.length;
    validateEnv();
    validateEnv();
    expect(logSpy.mock.calls.length + errSpy.mock.calls.length).toBe(before);
  });
});
