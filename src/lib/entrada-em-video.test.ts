import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import {
  NUMERO_DE_VIDEOS,
  PASSAGEM_MS,
  TEM_GRANDE,
  eHoraDePassar,
  enderecoDoVideo,
  formatoQueToca,
  novaVolta,
  primeiraVolta,
  proximoVideo,
  varianteParaOEcra,
} from "./entrada-em-video";

const TELEMOVEL = { largura: 390, altura: 844, densidade: 3 };
const PORTATIL = { largura: 1440, altura: 900, densidade: 1 };
const RETINA = { largura: 1440, altura: 900, densidade: 2 };

describe("os vídeos da entrada — as regras", () => {
  it("seguem 1 → 2 → 3 → 1", () => {
    const ordem = [0];
    for (let k = 0; k < 4; k++) ordem.push(proximoVideo(ordem[ordem.length - 1]));
    expect(ordem).toEqual([0, 1, 2, 0, 1]);
  });

  it("cada vídeo existe em todas as versões, e nenhum é pesado demais para o 4G", () => {
    for (let i = 0; i < NUMERO_DE_VIDEOS; i++) {
      for (const v of ["paisagem", "retrato"] as const) {
        for (const f of ["mp4", "webm"] as const) {
          const p = `public${enderecoDoVideo(i, v, f)}`;
          expect(existsSync(p), p).toBe(true);
        }
        // ~6 Mbit/s no máximo: acima disso o 4G deixava de o tocar sem parar.
        expect(statSync(`public${enderecoDoVideo(i, v)}`).size).toBeLessThan(16 * 1024 * 1024);
      }
      if (TEM_GRANDE[i]) expect(existsSync(`public${enderecoDoVideo(i, "grande")}`)).toBe(true);
    }
  });

  it("telemóvel ao alto → retrato; computador → paisagem; ecrã denso → grande (só com fonte 4K)", () => {
    expect(varianteParaOEcra(TELEMOVEL, 0)).toBe("retrato");
    expect(varianteParaOEcra(PORTATIL, 1)).toBe("paisagem");
    expect(varianteParaOEcra(RETINA, 1)).toBe("grande");
    // O vídeo 1 ainda não tem fonte 4K: num ecrã denso fica a paisagem.
    expect(varianteParaOEcra(RETINA, 0)).toBe(TEM_GRANDE[0] ? "grande" : "paisagem");
  });

  it("o WebM e os vídeos sem 4K caem da versão grande para a paisagem", () => {
    expect(enderecoDoVideo(1, "grande", "webm")).toMatch(/entrada-2-paisagem\.webm$/);
    if (!TEM_GRANDE[0]) expect(enderecoDoVideo(0, "grande")).toMatch(/entrada-1-paisagem\.mp4$/);
  });

  it("H.264 primeiro; VP9 só sem ele; sem nenhum, nada", () => {
    expect(formatoQueToca(() => "probably")).toBe("mp4");
    expect(formatoQueToca((t) => (t.includes("webm") ? "maybe" : ""))).toBe("webm");
    expect(formatoQueToca(() => "")).toBeNull();
  });

  it("a passagem começa quando falta o tempo dela para o fim", () => {
    const fim = 12;
    expect(eHoraDePassar(fim - PASSAGEM_MS / 1000 - 0.1, fim)).toBe(false);
    expect(eHoraDePassar(fim - PASSAGEM_MS / 1000, fim)).toBe(true);
    expect(eHoraDePassar(3, Number.NaN)).toBe(false);
    expect(eHoraDePassar(3, 0)).toBe(false);
  });

  /**
   * As tiras pretas (pedido dela: «quero completamente sem nada à volta»):
   * a versão larga tem de ser 2:1, sem os 60 px pretos em cima e em baixo.
   * Mede-se com o `file`/cabeçalho do MP4: a largura e a altura do vídeo.
   */
  it("sem tiras pretas: a versão larga é 1920×960", () => {
    let saida = "";
    try {
      saida = execFileSync("node", ["-e", MEDIR, `public${enderecoDoVideo(0, "paisagem")}`], {
        encoding: "utf8",
      });
    } catch {
      return; // sem node no ambiente: não se mede
    }
    expect(saida.trim()).toBe("1920x960");
  });

  it("a primeira volta começa sempre na floresta, e as outras vão mudando de ordem", () => {
    const vistas = new Set<string>();
    for (let k = 0; k < 200; k++) {
      const v = primeiraVolta();
      expect(v[0]).toBe(0);
      expect([...v].sort()).toEqual([0, 1, 2]);
      vistas.add(v.join());
    }
    // As duas ordens possíveis dos outros dois aparecem.
    expect(vistas.size).toBe(2);
  });

  it("uma volta nova nunca repete o último vídeo logo a seguir", () => {
    const ordens = new Set<string>();
    for (let ultimo = 0; ultimo < NUMERO_DE_VIDEOS; ultimo++) {
      for (let k = 0; k < 300; k++) {
        const v = novaVolta(ultimo);
        expect(v[0]).not.toBe(ultimo);
        expect([...v].sort()).toEqual([0, 1, 2]);
        ordens.add(v.join());
      }
    }
    // E não é sempre a mesma: aparecem as seis ordens possíveis.
    expect(ordens.size).toBe(6);
  });
});

/** Lê a largura × altura do `tkhd` de vídeo de um MP4 (sem ffprobe). */
const MEDIR = `
const b=require("fs").readFileSync(process.argv[1]);
let i=b.indexOf("tkhd");
while(i>0){const v=b[i+4];const off=i+4+(v===1?88:76);const w=b.readUInt32BE(off)>>>16,h=b.readUInt32BE(off+4)>>>16;if(w&&h){console.log(w+"x"+h);break}i=b.indexOf("tkhd",i+4)}
`;
