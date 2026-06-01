import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { imapHost, imapConfigured } from "./inbox";

const KEYS = [
  "IMAP_HOST",
  "SMTP_HOST",
  "IMAP_USER",
  "IMAP_PASS",
  "SMTP_USER",
  "SMTP_PASS",
] as const;
function clearEnv() {
  for (const k of KEYS) delete process.env[k];
}

beforeEach(clearEnv);
afterEach(clearEnv);

describe("imapHost", () => {
  it("uses IMAP_HOST when set", () => {
    process.env.IMAP_HOST = "imap.custom.com";
    process.env.SMTP_HOST = "smtp.gmail.com";
    expect(imapHost()).toBe("imap.custom.com");
  });

  it("derives the IMAP host from SMTP_HOST (smtp. → imap.)", () => {
    process.env.SMTP_HOST = "smtp.gmail.com";
    expect(imapHost()).toBe("imap.gmail.com");
  });

  it("keeps SMTP_HOST verbatim when it has no smtp. prefix", () => {
    process.env.SMTP_HOST = "mail.example.com";
    expect(imapHost()).toBe("mail.example.com");
  });

  it("is undefined when nothing is configured", () => {
    expect(imapHost()).toBeUndefined();
  });
});

describe("imapConfigured", () => {
  it("is true with only the Gmail SMTP credentials (auto-derives IMAP)", () => {
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_USER = "liquen.alentejo@gmail.com";
    process.env.SMTP_PASS = "app-password";
    expect(imapConfigured()).toBe(true);
  });

  it("is false without a host", () => {
    process.env.SMTP_USER = "liquen.alentejo@gmail.com";
    process.env.SMTP_PASS = "app-password";
    expect(imapConfigured()).toBe(false);
  });

  it("is false without credentials", () => {
    process.env.SMTP_HOST = "smtp.gmail.com";
    expect(imapConfigured()).toBe(false);
  });
});
