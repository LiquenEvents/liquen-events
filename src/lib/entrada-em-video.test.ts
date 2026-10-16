import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import {
  ARRANQUE_S,
  TAKE_DE_ENTRADA,
  MEDIR_REDE_MS,
  NUMERO_DE_VIDEOS,
  PASSAGEM_MS,
  TEM_GRANDE,
  duracaoDaSubida,
  eHoraDePassar,
  eRedeLenta,
  enderecoDoVideo,
  enderecoLeve,
  ligacaoLenta,
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
      // A versão leve, só ao alto (rede fraca): ~2 a 3 Mbit/s, metade da normal.
      for (const f of ["hevc", "mp4"] as const) {
        const p = `public${enderecoLeve(i, f)}`;
        expect(existsSync(p), p).toBe(true);
        expect(statSync(p).size, p).toBeLessThan(
          statSync(`public${enderecoDoVideo(i, "retrato", f)}`).size * 0.6,
        );
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

  it("a passagem começa quando falta o tempo dela, mais a folga do arranque, para o fim", () => {
    const fim = 12;
    const comeca = fim - PASSAGEM_MS / 1000 - ARRANQUE_S;
    expect(eHoraDePassar(comeca - 0.1, fim)).toBe(false);
    expect(eHoraDePassar(comeca, fim)).toBe(true);
    // A folga existe: o seguinte arranca ANTES de faltar só a subida (era aí
    // que o que saía chegava ao fim e parava no último fotograma).
    expect(eHoraDePassar(fim - PASSAGEM_MS / 1000 - 0.05, fim)).toBe(true);
    expect(ARRANQUE_S).toBeGreaterThanOrEqual(0.5);
    expect(eHoraDePassar(3, Number.NaN)).toBe(false);
    expect(eHoraDePassar(3, 0)).toBe(false);
  });

  it("uma subida que começa tarde encolhe para acabar antes de o que sai parar", () => {
    expect(duracaoDaSubida(1.5)).toBe(PASSAGEM_MS); // a tempo: a de sempre
    expect(duracaoDaSubida(0.5)).toBe(450); // tarde: 90 % do que falta
    expect(duracaoDaSubida(0.1)).toBe(200); // muito tarde: nunca menos de 200 ms
    expect(duracaoDaSubida(Number.NaN)).toBe(PASSAGEM_MS);
  });

  it("a versão leve: só ao alto, em HEVC ou H.264", () => {
    expect(enderecoLeve(0, "hevc")).toBe("/videos/entrada/v4/entrada-1-retrato-leve-hevc.mp4");
    expect(enderecoLeve(2, "mp4")).toBe("/videos/entrada/v4/entrada-3-retrato-leve.mp4");
    expect(formatoDoEndereco(enderecoLeve(1, "hevc"))).toBe("hevc");
  });

  it("a ligação diz-se lenta: poupar dados, 2G/3G, ou menos de 5 Mbit/s", () => {
    expect(ligacaoLenta(undefined)).toBe(false); // o iPhone não diz nada
    expect(ligacaoLenta({ effectiveType: "4g", downlink: 10 })).toBe(false);
    expect(ligacaoLenta({ effectiveType: "4g", downlink: 3.2 })).toBe(true);
    expect(ligacaoLenta({ effectiveType: "3g" })).toBe(true);
    expect(ligacaoLenta({ effectiveType: "slow-2g" })).toBe(true);
    expect(ligacaoLenta({ saveData: true })).toBe(true);
    expect(ligacaoLenta({ downlink: 0 })).toBe(false); // 0 = não sabe
  });

  it("a rede medida no arranque: menos de 1,3 s de vídeo por segundo de espera é lenta", () => {
    expect(eRedeLenta(0, MEDIR_REDE_MS - 1)).toBe(false); // cedo de mais para decidir
    expect(eRedeLenta(0.5, MEDIR_REDE_MS)).toBe(true);
    expect(eRedeLenta(1.2, 1500)).toBe(true); // 0,8 s por segundo
    expect(eRedeLenta(4, 1500)).toBe(false); // 2,7 s por segundo
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

  it("a entrada é sempre na floresta (decisão dela, 16/10)", () => {
    expect(TAKE_DE_ENTRADA).toBe(0);
    expect(primeiraVolta(TAKE_DE_ENTRADA)[0]).toBe(0);
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
