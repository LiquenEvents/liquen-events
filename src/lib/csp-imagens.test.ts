import { describe, it, expect, afterEach } from "vitest";
import nextConfig from "../../next.config";
import { origensDeImagem, permiteOrigem, CURINGA_SUPABASE } from "./csp-imagens";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A POLÍTICA QUE APAGA TODAS AS FOTOGRAFIAS SEM DIZER NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A `img-src` da CSP é escrita no `next.config.ts` a partir do `SUPABASE_URL`.
 * E o `next.config.ts` corre UMA VEZ, no build: a política vai inteira para o
 * `.next/routes-manifest.json` e é de lá que é servida em todos os pedidos.
 *
 * MEDIDO no build que estava nesta árvore (`.next/routes-manifest.json`), antes
 * desta correcção:
 *
 *     img-src 'self' data: blob: https://www.googletagmanager.com …
 *
 * Sem uma única origem do Supabase. Todas as fotografias dos mood boards são
 * `<img src="https://<projecto>.supabase.co/storage/v1/object/sign/…">`, e o
 * browser recusa-as ANTES de as pedir. Não há registo no servidor, não há
 * código de estado, não há nada: as células caem para o plano B (o original,
 * do mesmo host, também recusado) e mostram «Imagem guardada / Não consegui
 * mostrá-la neste ecrã». TODAS. Foi o que a Catarina viu em produção.
 *
 * Um build sem `SUPABASE_URL` no ambiente — o `Dockerfile` deste repositório
 * não lhe passa nenhuma variável, e no Vercel basta a variável estar marcada
 * como sensível ou ter sido acrescentada depois do último deploy — produz
 * exactamente essa política. O que se prende aqui é a invariante:
 *
 *     a `img-src` TEM de conseguir permitir o Storage do Supabase,
 *     com ou sem variável de ambiente no momento do build.
 */

const ASSINADO = "https://abcd1234.supabase.co/storage/v1/object/sign/proposal-assets/p1/a.jpg";

async function imgSrc(): Promise<string> {
  const cfg = nextConfig as unknown as {
    headers: () => Promise<{ headers: { key: string; value: string }[] }[]>;
  };
  const grupos = await cfg.headers();
  const csp = grupos.flatMap((g) => g.headers).find((h) => h.key === "Content-Security-Policy");
  expect(csp, "o next.config.ts tem de emitir uma Content-Security-Policy").toBeTruthy();
  const directiva = csp!.value
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("img-src"));
  expect(directiva, "a CSP tem de ter uma directiva img-src explícita").toBeTruthy();
  return directiva!;
}

const guardado = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in guardado)) delete process.env[k];
  Object.assign(process.env, guardado);
});

describe("img-src × Storage do Supabase", () => {
  it("um build SEM SUPABASE_URL continua a poder desenhar as fotos do Storage", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_IMAGE_CDN;
    const directiva = await imgSrc();
    expect(
      permiteOrigem(directiva, ASSINADO),
      `a img-src não permite o Storage do Supabase: ${directiva}`,
    ).toBe(true);
  });

  it("com SUPABASE_URL, a origem exacta entra na política", async () => {
    process.env.SUPABASE_URL = "https://abcd1234.supabase.co";
    const directiva = await imgSrc();
    expect(directiva).toContain("https://abcd1234.supabase.co");
    expect(permiteOrigem(directiva, ASSINADO)).toBe(true);
  });

  it("a origem exacta dispensa o curinga", () => {
    const r = origensDeImagem({ SUPABASE_URL: "https://abcd1234.supabase.co" });
    expect(r.origens).toEqual(["https://abcd1234.supabase.co"]);
    expect(r.usouCuringa).toBe(false);
  });

  it("sem nada configurado, fica o curinga — e é dito", () => {
    const r = origensDeImagem({});
    expect(r.origens).toEqual([CURINGA_SUPABASE]);
    expect(r.usouCuringa).toBe(true);
  });

  it("um URL ilegível não deita a política abaixo", () => {
    const r = origensDeImagem({ SUPABASE_URL: "isto-não-é-um-url" });
    expect(r.origens).toEqual([CURINGA_SUPABASE]);
    expect(r.usouCuringa).toBe(true);
  });

  it("o CDN de imagens entra ao lado do Storage, sem repetições", () => {
    const r = origensDeImagem({
      SUPABASE_URL: "https://abcd1234.supabase.co/",
      NEXT_PUBLIC_SUPABASE_URL: "https://abcd1234.supabase.co",
      NEXT_PUBLIC_IMAGE_CDN: "https://cdn.exemplo.pt/fotos",
    });
    expect(r.origens).toEqual(["https://abcd1234.supabase.co", "https://cdn.exemplo.pt"]);
  });

  it("`permiteOrigem` sabe ler o curinga e recusa o que não é dele", () => {
    const comCuringa = `img-src 'self' data: blob: ${CURINGA_SUPABASE}`;
    expect(permiteOrigem(comCuringa, ASSINADO)).toBe(true);
    expect(permiteOrigem(comCuringa, "https://mau.exemplo.pt/a.jpg")).toBe(false);
    // Um curinga de um só nível não atravessa pontos: é a regra da CSP.
    expect(permiteOrigem(comCuringa, "https://a.b.supabase.co/x.jpg")).toBe(false);
    expect(permiteOrigem("img-src 'self' data: blob:", ASSINADO)).toBe(false);
  });
});
