import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import {
  NUMERO_DE_VIDEOS,
  PASSAGEM_MS,
  alturaParaOEcra,
  deveHaverVideo,
  eHoraDePassar,
  enderecoDoVideo,
  formatoQueToca,
  ligacaoLenta,
  proximoVideo,
} from "./entrada-em-video";

describe("os vídeos da entrada — as regras", () => {
  it("seguem 1 → 2 → 3 → 1", () => {
    const ordem = [0];
    for (let k = 0; k < 4; k++) ordem.push(proximoVideo(ordem[ordem.length - 1]));
    expect(ordem).toEqual([0, 1, 2, 0, 1]);
  });

  it("cada ficheiro existe nas duas versões, e as do telemóvel são mais leves", () => {
    for (let i = 0; i < NUMERO_DE_VIDEOS; i++) {
      const grande = `public${enderecoDoVideo(i, 1080)}`;
      const leve = `public${enderecoDoVideo(i, 720)}`;
      expect(existsSync(grande), grande).toBe(true);
      expect(existsSync(leve), leve).toBe(true);
      expect(statSync(leve).size).toBeLessThan(statSync(grande).size);
      // Nenhum passa de 8 MB: é o tecto que deixa o 4G começar a tocar logo.
      expect(statSync(grande).size).toBeLessThan(8 * 1024 * 1024);
      // E a rede para quem não tem H.264.
      expect(existsSync(`public${enderecoDoVideo(i, 1080, "webm")}`)).toBe(true);
    }
  });

  it("H.264 primeiro; VP9 só sem ele; sem nenhum, nada", () => {
    expect(formatoQueToca(() => "probably")).toBe("mp4");
    expect(formatoQueToca((t) => (t.includes("webm") ? "maybe" : ""))).toBe("webm");
    expect(formatoQueToca(() => "")).toBeNull();
    // O WebM existe só em 720p, mesmo num ecrã grande.
    expect(enderecoDoVideo(0, 1080, "webm")).toMatch(/entrada-1-720\.webm$/);
  });

  it("720p no telemóvel, 1080p no computador, 720p numa ligação lenta", () => {
    expect(alturaParaOEcra(390)).toBe(720);
    expect(alturaParaOEcra(900)).toBe(720);
    expect(alturaParaOEcra(1440)).toBe(1080);
    expect(alturaParaOEcra(1440, true)).toBe(720);
    expect(ligacaoLenta("3g")).toBe(true);
    expect(ligacaoLenta("4g")).toBe(false);
  });

  it("sem vídeo com movimento reduzido, «Poupar dados» ou 2G", () => {
    expect(deveHaverVideo({ movimentoReduzido: false })).toBe(true);
    expect(deveHaverVideo({ movimentoReduzido: true })).toBe(false);
    expect(deveHaverVideo({ movimentoReduzido: false, pouparDados: true })).toBe(false);
    expect(deveHaverVideo({ movimentoReduzido: false, tipoDeLigacao: "2g" })).toBe(false);
    expect(deveHaverVideo({ movimentoReduzido: false, tipoDeLigacao: "slow-2g" })).toBe(false);
    expect(deveHaverVideo({ movimentoReduzido: false, tipoDeLigacao: "4g" })).toBe(true);
  });

  it("a passagem começa quando falta o tempo dela para o fim", () => {
    const fim = 12;
    expect(eHoraDePassar(fim - PASSAGEM_MS / 1000 - 0.1, fim)).toBe(false);
    expect(eHoraDePassar(fim - PASSAGEM_MS / 1000, fim)).toBe(true);
    // Antes de se saber a duração, nunca.
    expect(eHoraDePassar(3, Number.NaN)).toBe(false);
    expect(eHoraDePassar(3, 0)).toBe(false);
  });
});
