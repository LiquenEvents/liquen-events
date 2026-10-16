import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import {
  NUMERO_DE_VIDEOS,
  PASSAGEM_MS,
  TEM_GRANDE,
  eHoraDePassar,
  enderecoDoVideo,
  escolherPrimeiro,
  formatoDoEndereco,
  formatoQueToca,
  melhorFormato,
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
        for (const f of ["mp4", "webm", "hevc", "av1"] as const) {
          const p = `public${enderecoDoVideo(i, v, f)}`;
          expect(existsSync(p), p).toBe(true);
        }
        // ~6 Mbit/s no máximo: acima disso o 4G deixava de o tocar sem parar.
        expect(statSync(`public${enderecoDoVideo(i, v)}`).size).toBeLessThan(16 * 1024 * 1024);
      }
      if (TEM_GRANDE[i]) {
        for (const f of ["mp4", "hevc", "av1"] as const) {
          const p = `public${enderecoDoVideo(i, "grande", f)}`;
          expect(existsSync(p), p).toBe(true);
          // A grande é para ecrãs largos e densos (8–10 Mbit/s de tecto).
          expect(statSync(p).size).toBeLessThan(20 * 1024 * 1024);
        }
      }
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

  it("o HEVC e o AV1 são MP4 com o codec no nome, e têm versão grande", () => {
    expect(enderecoDoVideo(0, "paisagem", "hevc")).toBe(
      "/videos/entrada/v4/entrada-1-paisagem-hevc.mp4",
    );
    expect(enderecoDoVideo(1, "grande", "av1")).toBe("/videos/entrada/v4/entrada-2-grande-av1.mp4");
    expect(formatoDoEndereco("https://x/videos/entrada/v4/entrada-1-retrato-hevc.mp4")).toBe(
      "hevc",
    );
    expect(formatoDoEndereco("/v/entrada-1-retrato-av1.mp4")).toBe("av1");
    expect(formatoDoEndereco("/v/entrada-1-retrato.mp4")).toBe("mp4");
    expect(formatoDoEndereco("/v/entrada-1-retrato.webm")).toBe("webm");
    expect(formatoDoEndereco("")).toBeNull();
  });

  describe("o melhor formato: qualidade, mas só o que o chip descodifica", () => {
    const tudo = () => "probably";
    const r = (supported: boolean, smooth: boolean, powerEfficient: boolean) => ({
      supported,
      smooth,
      powerEfficient,
    });

    it("AV1 quando o chip o descodifica e corre liso", async () => {
      expect(await melhorFormato(tudo, async () => r(true, true, true), "paisagem")).toBe("av1");
    });

    it("AV1 no processador (sem chip) ou a perder fotogramas não serve: HEVC", async () => {
      const p = async (f: string) => (f === "av1" ? r(true, true, false) : r(true, true, true));
      expect(await melhorFormato(tudo, p, "paisagem")).toBe("hevc");
      const q = async (f: string) => (f === "av1" ? r(true, false, true) : r(true, true, true));
      expect(await melhorFormato(tudo, q, "paisagem")).toBe("hevc");
    });

    it("nem um nem outro no chip: o H.264 de sempre", async () => {
      expect(await melhorFormato(tudo, async () => r(true, true, false), "grande")).toBe("mp4");
    });

    it("sem a pergunta (browsers antigos), ou se ela falhar: só o canPlayType", async () => {
      expect(await melhorFormato(tudo, null, "paisagem")).toBe("mp4");
      const falha = async () => {
        throw new Error("x");
      };
      expect(await melhorFormato(tudo, falha, "paisagem")).toBe("mp4");
      const soWebm = (t: string) => (t.includes("webm") ? "maybe" : "");
      expect(await melhorFormato(soWebm, null, "paisagem")).toBe("webm");
    });

    it("não se pergunta por um formato que o browser nem sabe ler", async () => {
      const semAv1 = (t: string) => (t.includes("av01") ? "" : "probably");
      const perguntas: string[] = [];
      const p = async (f: string) => {
        perguntas.push(f);
        return r(true, true, true);
      };
      expect(await melhorFormato(semAv1, p, "paisagem")).toBe("hevc");
      expect(perguntas).toEqual(["hevc"]);
    });
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

  it("a primeira volta começa no take de entrada, e as outras vão mudando de ordem", () => {
    for (const primeiro of [0, 1, 2]) {
      const vistas = new Set<string>();
      for (let k = 0; k < 200; k++) {
        const v = primeiraVolta(primeiro);
        expect(v[0]).toBe(primeiro);
        expect([...v].sort()).toEqual([0, 1, 2]);
        vistas.add(v.join());
      }
      // As duas ordens possíveis dos outros dois aparecem.
      expect(vistas.size).toBe(2);
    }
  });

  it("o take de entrada: a 1.ª visita na floresta; depois, nunca o da entrada anterior", () => {
    expect(escolherPrimeiro(null)).toBe(0);
    expect(escolherPrimeiro(Number.NaN)).toBe(0);
    expect(escolherPrimeiro(7)).toBe(0);
    for (let ultimo = 0; ultimo < NUMERO_DE_VIDEOS; ultimo++) {
      const vistos = new Set<number>();
      for (let k = 0; k < 200; k++) {
        const n = escolherPrimeiro(ultimo);
        expect(n).not.toBe(ultimo);
        vistos.add(n);
      }
      // Os outros dois aparecem os dois: vai alternando, não troca só entre dois.
      expect(vistos.size).toBe(NUMERO_DE_VIDEOS - 1);
    }
    // Os extremos do sorteio não saem da lista.
    expect(escolherPrimeiro(0, () => 0.9999)).toBe(2);
    expect(escolherPrimeiro(2, () => 0)).toBe(0);
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
