import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { hojeNoEstudio } from "./fuso";

/**
 * UM FUSO SÓ (A8-016). «Europe/Lisbon» estava escrito à mão em treze sítios,
 * e os que o esqueciam davam datas de Greenwich. Este teste prende as duas
 * coisas: o «hoje» é o de Portugal, e o nome do fuso vive num sítio só.
 */
describe("hojeNoEstudio", () => {
  it("às 00:30 de Lisboa, no Verão, já é o dia seguinte ao de Greenwich", () => {
    expect(hojeNoEstudio(new Date("2026-08-13T23:30:00Z"))).toBe("2026-08-14");
  });
});

function ficheiros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const c = join(dir, n);
    if (statSync(c).isDirectory()) return ficheiros(c);
    return /\.(ts|tsx)$/.test(n) && !n.includes(".test.") ? [c] : [];
  });
}

describe("o nome do fuso", () => {
  it("só está escrito em src/lib/fuso.ts", () => {
    const culpados = ficheiros(join(process.cwd(), "src"))
      .filter((f) => !f.endsWith(join("lib", "fuso.ts")))
      .filter((f) => readFileSync(f, "utf8").includes('"Europe/Lisbon"'));
    expect(culpados).toEqual([]);
  });
});
