import { describe, it, expect } from "vitest";
import {
  FINGERPRINT_HEX,
  fileNameFor,
  fingerprintBlob,
  fingerprintOfFileName,
  forcedSuffix,
  isFingerprint,
  md5OfETag,
} from "./theme-fingerprint";

/**
 * A identidade de uma foto é o que decide se ela entra no tema ou é saltada.
 * Um furo aqui não dá um erro: dá uma foto BOA que desaparece em silêncio, que
 * é o pior resultado possível numa biblioteca de fotografia. Por isso cada
 * caso feio está fixado aqui.
 */

describe("isFingerprint", () => {
  it("aceita exatamente 32 hex minúsculos", () => {
    expect(isFingerprint("0123456789abcdef0123456789abcdef")).toBe(true);
  });

  it("recusa tudo o que não seja isso", () => {
    expect(isFingerprint("0123456789ABCDEF0123456789ABCDEF")).toBe(false); // maiúsculas
    expect(isFingerprint("0123456789abcdef0123456789abcde")).toBe(false); // 31
    expect(isFingerprint("0123456789abcdef0123456789abcdef0")).toBe(false); // 33
    expect(isFingerprint("0123456789abcdef0123456789abcdeg")).toBe(false); // não-hex
    expect(isFingerprint("")).toBe(false);
    expect(isFingerprint(null)).toBe(false);
    expect(isFingerprint(42)).toBe(false);
    expect(isFingerprint(["0123456789abcdef0123456789abcdef"])).toBe(false);
  });

  it("recusa travessia de diretórios disfarçada", () => {
    // O nome do ficheiro passa a vir do cliente: isto é o que impede que ele
    // aponte para fora da pasta do tema.
    expect(isFingerprint("../../etc/passwd")).toBe(false);
    expect(isFingerprint("0123456789abcdef0123456789abcd/x")).toBe(false);
  });
});

describe("fingerprintOfFileName", () => {
  const H = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

  it("lê o resumo do nome de uma foto guardada com ele", () => {
    expect(fingerprintOfFileName(`${H}.jpg`)).toBe(H);
    expect(fingerprintOfFileName(`${H}.jpeg`)).toBe(H);
    expect(fingerprintOfFileName(`${H}.png`)).toBe(H);
    expect(fingerprintOfFileName(`${H}.webp`)).toBe(H);
    expect(fingerprintOfFileName(`${H}.JPG`)).toBe(H);
  });

  it("uma cópia FORÇADA continua a contar como 'esta foto está no tema'", () => {
    // O sufixo é descartado de propósito: sem isto, cada "Adicionar mesmo
    // assim" abria um buraco permanente no índice do tema.
    expect(fingerprintOfFileName(`${H}-4f2a.jpg`)).toBe(H);
    expect(fingerprintOfFileName(`${H}-${forcedSuffix()}.jpg`)).toBe(H);
  });

  it("UM UUID NUNCA é lido como resumo — é a biblioteca que já existe", () => {
    expect(fingerprintOfFileName("3f2504e0-4f89-11d3-9a0c-0305e82c3301.jpg")).toBeNull();
    expect(fingerprintOfFileName("8f14e45f-ceea-467a-9c39-1e0e6c1b4b21.png")).toBeNull();
    // Um id v4 aleatório, mil vezes: nenhum pode passar por resumo.
    for (let i = 0; i < 1000; i++) {
      expect(fingerprintOfFileName(`${crypto.randomUUID()}.jpg`)).toBeNull();
    }
  });

  it("recusa nomes quase certos", () => {
    expect(fingerprintOfFileName(`${H}.gif`)).toBeNull();
    expect(fingerprintOfFileName(`${H}`)).toBeNull();
    expect(fingerprintOfFileName(`x${H}.jpg`)).toBeNull();
    expect(fingerprintOfFileName(`${H.slice(1)}.jpg`)).toBeNull();
    expect(fingerprintOfFileName("praia-2019.jpg")).toBeNull();
  });
});

describe("fileNameFor", () => {
  const H = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

  it("o nome normal é o próprio resumo", () => {
    expect(fileNameFor(H)).toBe(H);
  });

  it("o nome forçado leva sufixo — e volta a dar o mesmo resumo", () => {
    const forced = fileNameFor(H, "4f2a");
    expect(forced).toBe(`${H}-4f2a`);
    expect(fingerprintOfFileName(`${forced}.jpg`)).toBe(H);
  });
});

describe("fingerprintBlob", () => {
  it("é o SHA-256 do conteúdo, cortado nos 16 primeiros bytes", async () => {
    const bytes = new TextEncoder().encode("foto");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const esperado = Array.from(digest.subarray(0, 16))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(await fingerprintBlob(new Blob([bytes]))).toBe(esperado);
  });

  it("tem o comprimento combinado e é estável", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])]);
    const a = await fingerprintBlob(blob);
    const b = await fingerprintBlob(new Blob([new Uint8Array([1, 2, 3, 4])]));
    expect(a).toHaveLength(FINGERPRINT_HEX);
    expect(a).toBe(b);
    expect(isFingerprint(a)).toBe(true);
  });

  it("bytes diferentes dão resumos diferentes", async () => {
    const a = await fingerprintBlob(new Blob([new Uint8Array([1, 2, 3])]));
    const b = await fingerprintBlob(new Blob([new Uint8Array([1, 2, 4])]));
    expect(a).not.toBe(b);
  });

  it("DESLIGA-SE (null) sem contexto seguro — não parte o carregamento", async () => {
    // `crypto.subtle` só existe em contexto seguro. Num ambiente sem ele a
    // deteção de repetidas desaparece; o carregamento continua exatamente
    // como era antes desta funcionalidade.
    const real = globalThis.crypto;
    try {
      Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
      expect(await fingerprintBlob(new Blob(["x"]))).toBeNull();
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: real, configurable: true });
    }
  });

  it("devolve null para algo que não é um blob, em vez de lançar", async () => {
    expect(await fingerprintBlob(null as unknown as Blob)).toBeNull();
    expect(await fingerprintBlob({} as Blob)).toBeNull();
  });
});

describe("md5OfETag", () => {
  it("tira as aspas e passa a minúsculas", () => {
    expect(md5OfETag('"C5E8C553235D9AF30EF4F6E280790B92"')).toBe(
      "c5e8c553235d9af30ef4f6e280790b92",
    );
    expect(md5OfETag("c5e8c553235d9af30ef4f6e280790b92")).toBe("c5e8c553235d9af30ef4f6e280790b92");
    expect(md5OfETag('W/"c5e8c553235d9af30ef4f6e280790b92"')).toBe(
      "c5e8c553235d9af30ef4f6e280790b92",
    );
  });

  it("DESCARTA o eTag de um carregamento multipart — não é o MD5 do conteúdo", () => {
    expect(md5OfETag('"c5e8c553235d9af30ef4f6e280790b92-3"')).toBeNull();
  });

  it("descarta um eTag de outro formato — a rede secundária desliga-se, não mente", () => {
    // Se esta instalação não usar MD5 no eTag, o que tem de acontecer é NADA
    // casar. Um falso positivo saltaria uma foto boa.
    expect(md5OfETag("nao-e-um-md5")).toBeNull();
    expect(md5OfETag("")).toBeNull();
    expect(md5OfETag(null)).toBeNull();
    expect(md5OfETag(undefined)).toBeNull();
    expect(md5OfETag(12345)).toBeNull();
  });
});

describe("forcedSuffix", () => {
  it("é curto, hex e legível pelo analisador de nomes", () => {
    for (let i = 0; i < 200; i++) {
      const s = forcedSuffix();
      expect(s).toMatch(/^[0-9a-f]{4}$/);
    }
  });
});
