import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

// ── Pure metadata helpers (no IMAP) ──────────────────────────────────────────
import { collectAttachments, parseReferences } from "./inbox";

describe("parseReferences", () => {
  it("pulls every Message-ID out of a References header buffer (order preserved)", () => {
    const buf = Buffer.from("References: <a@x>\r\n <b@y> <c@z>\r\n");
    expect(parseReferences(buf)).toEqual(["<a@x>", "<b@y>", "<c@z>"]);
  });
  it("returns [] for a missing/empty header", () => {
    expect(parseReferences(undefined)).toEqual([]);
    expect(parseReferences(Buffer.from(""))).toEqual([]);
  });

  /**
   * O `References:` é escrito por quem envia e não tem tecto nenhum. Este
   * cabeçalho é pedido para TODAS as mensagens da listagem (ver `LIST_QUERY`),
   * por isso um remetente com um cabeçalho de umas centenas de KB multiplicava
   * a resposta da caixa por si próprio — 20 000 identificadores por linha, num
   * campo que o ecrã nem sequer mostra.
   */
  it("não deixa um cabeçalho hostil crescer sem tecto", () => {
    const enormes = Array.from({ length: 20_000 }, (_, i) => `<m${i}@evil.com>`);
    const out = parseReferences(Buffer.from(`References: ${enormes.join(" ")}\r\n`));
    expect(out.length).toBeLessThanOrEqual(50);
    // O que se guarda é o que serve para encadear: a raiz da conversa e o fim
    // da linhagem. É o meio que se pode deitar fora.
    expect(out[0]).toBe("<m0@evil.com>");
    expect(out.at(-1)).toBe("<m19999@evil.com>");
  });

  it("um identificador absurdamente longo não passa", () => {
    const out = parseReferences(Buffer.from(`References: <${"a".repeat(5_000)}@x> <bom@x>`));
    expect(out).toEqual(["<bom@x>"]);
  });

  it("uma conversa longa mas normal passa intacta", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `<m${i}@cliente.pt>`);
    expect(parseReferences(Buffer.from(`References: ${ids.join(" ")}`))).toEqual(ids);
  });
});

describe("collectAttachments", () => {
  it("collects leaf parts marked attachment or carrying a filename, with real part ids", () => {
    const structure = {
      type: "multipart/mixed",
      childNodes: [
        { type: "text/plain", part: "1" }, // body — skipped
        {
          type: "application/pdf",
          part: "2",
          disposition: "attachment",
          dispositionParameters: { filename: "orcamento.pdf" },
          size: 1234,
        },
        {
          type: "image/png",
          part: "3",
          parameters: { name: "logo.png" }, // no disposition, but has a name
          size: 55,
        },
      ],
    };
    expect(collectAttachments(structure)).toEqual([
      { partId: "2", filename: "orcamento.pdf", size: 1234, contentType: "application/pdf" },
      { partId: "3", filename: "logo.png", size: 55, contentType: "image/png" },
    ]);
  });
  it("returns [] when there is no structure", () => {
    expect(collectAttachments(undefined)).toEqual([]);
  });
});

// ── listInbox / getInboxMessage / setFlags against a mocked imapflow ──────────
// imapflow and mailparser are dynamically imported inside inbox.ts, so mocking
// the modules lets us exercise the real mapping/flag logic without a live server.

type FakeMsg = {
  uid: number;
  envelope: Record<string, unknown>;
  flags: Set<string>;
  bodyStructure?: Record<string, unknown>;
  headers?: Buffer;
};

const imap = vi.hoisted(() => ({
  fixtures: [] as FakeMsg[],
  searchResult: [] as number[] | false,
  lastFetchRange: undefined as unknown,
  lastFetchOptions: undefined as unknown,
  lastSearch: undefined as unknown,
  flagCalls: [] as Array<{ op: "add" | "remove"; range: string; flags: string[]; opts: unknown }>,
}));

vi.mock("imapflow", () => {
  class MockImapFlow {
    constructor(_opts: unknown) {}
    async connect() {}
    async logout() {}
    async getMailboxLock() {
      return { release() {} };
    }
    get mailbox() {
      return { exists: imap.fixtures.length };
    }
    async *fetch(range: unknown, _query: unknown, options?: unknown) {
      imap.lastFetchRange = range;
      imap.lastFetchOptions = options;
      for (const m of imap.fixtures) yield m;
    }
    async fetchOne(seq: unknown) {
      return imap.fixtures.find((f) => String(f.uid) === String(seq)) ?? false;
    }
    async download() {
      return { content: Buffer.from("raw"), meta: {} };
    }
    async search(criteria: unknown) {
      imap.lastSearch = criteria;
      return imap.searchResult;
    }
    async messageFlagsAdd(range: string, flags: string[], opts: unknown) {
      imap.flagCalls.push({ op: "add", range, flags, opts });
      return true;
    }
    async messageFlagsRemove(range: string, flags: string[], opts: unknown) {
      imap.flagCalls.push({ op: "remove", range, flags, opts });
      return true;
    }
  }
  return { ImapFlow: MockImapFlow };
});

vi.mock("mailparser", () => ({
  simpleParser: vi.fn(async () => ({ text: "corpo da mensagem" })),
}));

function fakeMsg(over: Partial<FakeMsg> = {}): FakeMsg {
  return {
    uid: 42,
    envelope: {
      from: [{ name: "Ana Costa", address: "ana@cliente.com" }],
      subject: "Orçamento casamento",
      date: new Date("2026-07-01T10:00:00Z"),
      messageId: "<msg-42@cliente.com>",
      inReplyTo: "<msg-40@liquen.pt>",
    },
    flags: new Set<string>(["\\Seen"]),
    bodyStructure: {
      type: "multipart/mixed",
      childNodes: [
        { type: "text/plain", part: "1" },
        {
          type: "application/pdf",
          part: "2",
          disposition: "attachment",
          dispositionParameters: { filename: "brief.pdf" },
          size: 900,
        },
      ],
    },
    headers: Buffer.from("References: <root@cliente.com> <msg-40@liquen.pt>\r\n"),
    ...over,
  };
}

async function loadInbox() {
  return import("./inbox");
}

beforeEach(() => {
  imap.fixtures = [];
  imap.searchResult = [];
  imap.flagCalls = [];
  imap.lastSearch = undefined;
  imap.lastFetchOptions = undefined;
  vi.clearAllMocks();
});

describe("listInbox — surfaces durable metadata", () => {
  it("maps messageId, inReplyTo, references and attachment metadata", async () => {
    imap.fixtures = [fakeMsg()];
    const { listInbox } = await loadInbox();
    const [item] = await listInbox();
    expect(item).toMatchObject({
      uid: 42,
      from: "Ana Costa",
      fromAddress: "ana@cliente.com",
      subject: "Orçamento casamento",
      seen: true,
      messageId: "<msg-42@cliente.com>",
      inReplyTo: "<msg-40@liquen.pt>",
      references: ["<root@cliente.com>", "<msg-40@liquen.pt>"],
      attachments: [
        { partId: "2", filename: "brief.pdf", size: 900, contentType: "application/pdf" },
      ],
    });
    expect(item.date).toBe("2026-07-01T10:00:00.000Z");
  });

  it("sorts newest-first by date", async () => {
    imap.fixtures = [
      fakeMsg({ uid: 1, envelope: { subject: "velho", date: new Date("2026-01-01T00:00:00Z") } }),
      fakeMsg({ uid: 2, envelope: { subject: "novo", date: new Date("2026-06-01T00:00:00Z") } }),
    ];
    const { listInbox } = await loadInbox();
    const items = await listInbox();
    expect(items.map((i) => i.subject)).toEqual(["novo", "velho"]);
  });

  it("with q, searches server-side and fetches the matching UIDs by uid", async () => {
    imap.fixtures = [fakeMsg({ uid: 7 })];
    imap.searchResult = [7];
    const { listInbox } = await loadInbox();
    const items = await listInbox({ q: "casamento", limit: 10 });
    expect(items).toHaveLength(1);
    expect(imap.lastSearch).toMatchObject({
      or: [{ subject: "casamento" }, { from: "casamento" }, { text: "casamento" }],
    });
    // The filtered path fetches by UID.
    expect(imap.lastFetchOptions).toMatchObject({ uid: true });
  });

  /**
   * O cabeçalho `Date:` é escrito por quem envia, e não há nada que obrigue a
   * que seja uma data. Quando o imapflow não a consegue ler, devolve a STRING
   * crua do cabeçalho em `envelope.date` (ver `lib/tools.js`: `if (date
   * .toString() === 'Invalid Date') envelope.date = getStrValue(...)`) — apesar
   * de o tipo dizer `Date`. Uma só mensagem assim deitava abaixo a LISTAGEM
   * INTEIRA, não só aquela linha.
   */
  it("uma data ilegível não deita abaixo a caixa toda", async () => {
    imap.fixtures = [
      fakeMsg({
        uid: 1,
        envelope: { subject: "data partida", date: "ontem à tarde", messageId: "<mau@x>" },
      }),
      fakeMsg({ uid: 2, envelope: { subject: "normal", date: new Date("2026-06-01T00:00:00Z") } }),
    ];
    const { listInbox } = await loadInbox();
    const items = await listInbox();
    // As duas mensagens continuam a chegar ao back office.
    expect(items.map((i) => i.subject).sort()).toEqual(["data partida", "normal"]);
    // A que não tem data legível fica sem data, em vez de inventar uma.
    expect(items.find((i) => i.subject === "data partida")!.date).toBe("");
  });

  it("recupera uma data que veio como texto mas é legível", async () => {
    imap.fixtures = [
      fakeMsg({ envelope: { subject: "texto", date: "Tue, 07 Jul 2026 10:00:00 +0000" } }),
    ];
    const { listInbox } = await loadInbox();
    const [item] = await listInbox();
    expect(item.date).toBe("2026-07-07T10:00:00.000Z");
  });

  it("uma mensagem sem cabeçalho Date fica sem data (não passa por recente)", async () => {
    imap.fixtures = [fakeMsg({ envelope: { subject: "sem data" } })];
    const { listInbox } = await loadInbox();
    const [item] = await listInbox();
    expect(item.date).toBe("");
  });

  it("with before, constrains the UID range and returns [] when nothing matches", async () => {
    imap.fixtures = [fakeMsg()]; // mailbox non-empty, but the search matches nothing
    imap.searchResult = [];
    const { listInbox } = await loadInbox();
    const items = await listInbox({ before: 100 });
    expect(items).toEqual([]);
    expect(imap.lastSearch).toMatchObject({ uid: "1:99" });
  });
});

describe("getInboxMessage", () => {
  it("returns the mapped item plus decoded body text and seen:true", async () => {
    imap.fixtures = [fakeMsg({ uid: 42 })];
    const { getInboxMessage } = await loadInbox();
    const msg = await getInboxMessage(42);
    expect(msg).toMatchObject({
      uid: 42,
      messageId: "<msg-42@cliente.com>",
      seen: true,
      text: "corpo da mensagem",
      attachments: [{ partId: "2", filename: "brief.pdf" }],
    });
  });

  it("returns null when the message is not found", async () => {
    imap.fixtures = [];
    const { getInboxMessage } = await loadInbox();
    expect(await getInboxMessage(999)).toBeNull();
  });
});

describe("setFlags — durable, reversible IMAP flags", () => {
  it("adds \\Seen when seen:true, keyed by UID", async () => {
    const { setFlags } = await loadInbox();
    const res = await setFlags(42, { seen: true });
    expect(res).toEqual({ seen: true });
    expect(imap.flagCalls).toEqual([
      { op: "add", range: "42", flags: ["\\Seen"], opts: { uid: true } },
    ]);
  });

  it("removes \\Seen when seen:false (marks unread)", async () => {
    const { setFlags } = await loadInbox();
    await setFlags(42, { seen: false });
    expect(imap.flagCalls[0]).toMatchObject({ op: "remove", flags: ["\\Seen"] });
  });

  it("handles \\Flagged (star) independently", async () => {
    const { setFlags } = await loadInbox();
    const res = await setFlags(42, { flagged: true });
    expect(res).toEqual({ flagged: true });
    expect(imap.flagCalls[0]).toMatchObject({ op: "add", flags: ["\\Flagged"] });
  });
});
