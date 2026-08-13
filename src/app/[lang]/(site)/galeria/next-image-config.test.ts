import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import nextConfig from "../../../../../next.config";

/**
 * Guardas sobre a secção `images` do next.config.ts.
 *
 * Vive nesta pasta porque é aqui que a configuração de imagens tem dono, e
 * porque a galeria é de longe quem mais a usa — mas o que valida é o sítio
 * inteiro.
 *
 * O QUE MOTIVOU O PRIMEIRO TESTE. Se um `<Image quality={N}>` usar um valor que
 * não está em `images.qualities`, o optimizador responde HTTP 400 —
 * `"q" parameter (quality) of N is not allowed`, ver
 * node_modules/next/dist/server/image-optimizer.js:635-643 — e a imagem NUNCA
 * carrega. Sempre. Para todos os visitantes. O Next só avisa em
 * desenvolvimento, com um `warnOnce` na consola
 * (node_modules/next/dist/shared/lib/get-img-props.js:423), por isso passa
 * despercebido até alguém reparar que uma imagem do sítio publicado está em
 * branco. Estavam dois valores em uso e fora da lista: `quality={55}` (o
 * logótipo do Navbar, em TODAS as páginas) e `quality={70}` (a página de
 * confirmação de orçamento).
 */

const SRC = path.join(__dirname, "..", "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("next.config images", () => {
  it("todos os `quality={N}` do código estão em images.qualities", () => {
    const allowed = new Set(nextConfig.images?.qualities ?? []);
    expect(allowed.size, "images.qualities não pode ficar por definir").toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/quality=\{(\d+)\}/g)) {
        const q = Number(m[1]);
        if (!allowed.has(q)) {
          offenders.push(`${path.relative(SRC, file)}: quality={${q}}`);
        }
      }
    }
    expect(offenders, `estas imagens receberiam HTTP 400 do optimizador`).toEqual([]);
  });

  it("deviceSizes e imageSizes estão ordenados (o next/image assume-o)", () => {
    for (const key of ["deviceSizes", "imageSizes"] as const) {
      const list = nextConfig.images?.[key] ?? [];
      expect(list.length, `${key} vazio`).toBeGreaterThan(0);
      expect([...list], key).toEqual([...list].sort((a, b) => a - b));
      expect(new Set(list).size, `${key} tem repetidos`).toBe(list.length);
    }
  });

  it("o tecto de largura não volta a subir sem que alguém repare", () => {
    // 2048 esteve aqui com um comentário a dizer que "baixámos de 2560" —
    // 2560 nunca esteve na configuração publicada, por isso na prática subia o
    // tecto e fazia o lightbox pedir w=2048 a 250KB por foto. Medido: é a
    // largura mais cara de toda a matriz, para uma diferença invisível.
    const deviceSizes = nextConfig.images?.deviceSizes ?? [];
    expect(Math.max(...deviceSizes)).toBe(1920);
  });
});
