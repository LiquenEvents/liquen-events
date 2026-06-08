import { describe, it, expect, vi, beforeEach } from "vitest";

// pageMetadata reads headers() to detect the /en mirror — mock it (hoisted so
// the factory can read a mutable the tests flip).
const ctx = vi.hoisted(() => ({ forced: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => (k === "x-liquen-locale" ? ctx.forced : null) }),
}));

import { pageMetadata } from "./page-metadata";
import { SITE } from "./site";

type Og = {
  url?: string;
  title?: string;
  images?: Array<{ url: string; width: number; height: number; alt: string }>;
};
type Tw = { card?: string; title?: string; images?: string[] };

describe("pageMetadata", () => {
  beforeEach(() => {
    ctx.forced = null;
  });

  it("builds canonical, OpenGraph and Twitter metadata from a minimal input", async () => {
    const meta = await pageMetadata({
      title: "Serviços",
      description: "O que fazemos.",
      path: "/servicos",
    });
    expect(meta.title).toBe("Serviços");
    expect(meta.description).toBe("O que fazemos.");
    expect(meta.alternates?.canonical).toBe("/servicos");

    const og = meta.openGraph as Og;
    expect(og.url).toBe(`${SITE.url}/servicos`);
    expect(og.title).toBe(`Serviços | ${SITE.name}`);

    const tw = meta.twitter as Tw;
    expect(tw.card).toBe("summary_large_image");
  });

  it("declares the reciprocal PT/EN hreflang set", async () => {
    const meta = await pageMetadata({ title: "T", description: "D", path: "/servicos" });
    expect(meta.alternates?.languages).toEqual({
      "pt-PT": "/servicos",
      en: "/en/servicos",
      "x-default": "/servicos",
    });
  });

  it("self-canonicalises to the /en mirror when the English header is set", async () => {
    ctx.forced = "en";
    const meta = await pageMetadata({ title: "T", description: "D", path: "/servicos" });
    expect(meta.alternates?.canonical).toBe("/en/servicos");
    const og = meta.openGraph as Og;
    expect(og.url).toBe(`${SITE.url}/en/servicos`);
  });

  it("uses the site default OG image with its real dimensions", async () => {
    const meta = await pageMetadata({ title: "T", description: "D", path: "/" });
    const og = meta.openGraph as Og;
    expect(og.images?.[0].url).toBe(SITE.ogImage);
    expect(og.images?.[0].width).toBe(2048);
    expect(og.images?.[0].height).toBe(1152);
  });

  it("falls back to 1200×630 when the image dimensions are unknown", async () => {
    const meta = await pageMetadata({
      title: "T",
      description: "D",
      path: "/x",
      image: "/imagens/__unknown__.jpg",
    });
    const og = meta.openGraph as Og;
    expect(og.images?.[0].width).toBe(1200);
    expect(og.images?.[0].height).toBe(630);
  });

  it("respects an explicit ogTitle for social cards", async () => {
    const meta = await pageMetadata({
      title: "T",
      description: "D",
      path: "/x",
      ogTitle: "Título Social Personalizado",
    });
    const og = meta.openGraph as Og;
    const tw = meta.twitter as Tw;
    expect(og.title).toBe("Título Social Personalizado");
    expect(tw.title).toBe("Título Social Personalizado");
  });
});
