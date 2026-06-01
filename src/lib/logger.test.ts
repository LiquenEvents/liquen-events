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
