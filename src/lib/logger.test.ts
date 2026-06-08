import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log } from "./logger";

/** Flatten a spy's calls into one searchable string, unwrapping Error args. */
function text(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls
    .flat()
    .map((a: unknown) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a)))
    .join("\n");
}

describe("log", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("routes info/debug to stdout and warn/error to stderr", () => {
    log.info("an info");
    log.debug("a debug");
    log.warn("a warning");
    log.error("an error");
    expect(text(logSpy)).toContain("an info");
    expect(text(logSpy)).toContain("a debug");
    expect(text(errSpy)).toContain("a warning");
    expect(text(errSpy)).toContain("an error");
  });

  it("includes the structured context with the message", () => {
    log.info("with context", { quoteId: "q_1", count: 3 });
    const out = text(logSpy);
    expect(out).toContain("with context");
    expect(out).toContain("quoteId");
    expect(out).toContain("q_1");
  });

  it("surfaces an Error's message when one is passed to error()", () => {
    log.error("operation failed", new Error("kaboom"), { route: "/api/x" });
    const out = text(errSpy);
    expect(out).toContain("operation failed");
    expect(out).toContain("kaboom");
    expect(out).toContain("route");
  });
});

describe("log — error webhook alerting", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete process.env.ERROR_WEBHOOK_URL;
  });

  it("does nothing when ERROR_WEBHOOK_URL is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    log.error("unset-webhook-case");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts error-level logs to the webhook in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/abc";
    log.error("alert-me-please", new Error("kaboom"), { route: "/api/x" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/abc");
    expect(String(opts.body)).toContain("alert-me-please");
    expect(String(opts.body)).toContain("kaboom");
  });

  it("throttles repeated identical errors", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/abc";
    log.error("repeated-identical-error");
    log.error("repeated-identical-error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never alerts outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/abc";
    log.error("dev-no-alert");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
