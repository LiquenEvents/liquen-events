import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { etagFor, matchesEtag, jsonWithEtag } from "./api-cache";

function req(ifNoneMatch?: string): NextRequest {
  return new Request("https://liquen.test/api/propostas", {
    method: "GET",
    headers: ifNoneMatch ? { "If-None-Match": ifNoneMatch } : undefined,
  }) as unknown as NextRequest;
}

describe("etagFor", () => {
  it("gives the same body the same tag, and a changed body a different one", () => {
    const a = etagFor(JSON.stringify([{ id: "p1", total: 100 }]));
    const b = etagFor(JSON.stringify([{ id: "p1", total: 100 }]));
    const c = etagFor(JSON.stringify([{ id: "p1", total: 101 }]));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("is a weak tag (a 304 must never be taken as byte-for-byte equality)", () => {
    expect(etagFor("[]")).toMatch(/^W\/"/);
  });
});

describe("matchesEtag", () => {
  const tag = etagFor("[]");

  it("does not match when the client sent nothing", () => {
    expect(matchesEtag(null, tag)).toBe(false);
  });

  it("matches the same tag", () => {
    expect(matchesEtag(tag, tag)).toBe(true);
  });

  it("matches weakly — W/ on one side only still counts for a GET", () => {
    expect(matchesEtag(tag.replace('W/"', '"'), tag)).toBe(true);
  });

  it("matches one entry inside the comma-separated list RFC 9110 allows", () => {
    expect(matchesEtag(`W/"outra", ${tag}, W/"mais-outra"`, tag)).toBe(true);
  });

  it("matches the wildcard", () => {
    expect(matchesEtag("*", tag)).toBe(true);
  });

  it("does not match a different tag", () => {
    expect(matchesEtag(etagFor("[1]"), tag)).toBe(false);
  });

  it("falls back to sending the body when the header is malformed", () => {
    expect(matchesEtag("lixo sem aspas", tag)).toBe(false);
    expect(matchesEtag("", tag)).toBe(false);
  });
});

describe("jsonWithEtag", () => {
  const data = [{ id: "p1", clientName: "Ana", total: 1230 }];

  it("returns 200 with the body and a tag when the client has nothing", async () => {
    const res = jsonWithEtag(req(), data);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(data);
    expect(res.headers.get("etag")).toBeTruthy();
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("returns 304 with no body when the client already has this version", async () => {
    const first = jsonWithEtag(req(), data);
    const tag = first.headers.get("etag")!;

    const second = jsonWithEtag(req(tag), data);
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("etag")).toBe(tag);
  });

  it("returns the full body again as soon as the data changes", async () => {
    const tag = jsonWithEtag(req(), data).headers.get("etag")!;
    const changed = [...data, { id: "p2", clientName: "Rui", total: 900 }];

    const res = jsonWithEtag(req(tag), changed);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(changed);
    expect(res.headers.get("etag")).not.toBe(tag);
  });

  it("never lets a shared cache serve one session's data to another", () => {
    const res = jsonWithEtag(req(), data);
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).toContain("private");
    // `no-cache` = pode guardar, mas revalida SEMPRE antes de mostrar.
    expect(cc).toContain("no-cache");
    expect(res.headers.get("vary")).toContain("Cookie");
  });

  it("puts the same guarantees on the 304 as on the 200", () => {
    const tag = jsonWithEtag(req(), data).headers.get("etag")!;
    const res = jsonWithEtag(req(tag), data);
    expect(res.headers.get("cache-control")).toContain("private");
    expect(res.headers.get("vary")).toContain("Cookie");
  });

  it("distinguishes two lists that differ only in order", () => {
    const a = jsonWithEtag(req(), [{ id: "1" }, { id: "2" }]).headers.get("etag");
    const b = jsonWithEtag(req(), [{ id: "2" }, { id: "1" }]).headers.get("etag");
    expect(a).not.toBe(b);
  });

  it("handles an empty list without claiming a match against a non-empty one", () => {
    const empty = jsonWithEtag(req(), []);
    expect(empty.status).toBe(200);
    const res = jsonWithEtag(req(empty.headers.get("etag")!), data);
    expect(res.status).toBe(200);
  });
});
