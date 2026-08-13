import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// O ficheiro do banner ainda NÃO existe no repositório, e é isso que este teste
// tem de conseguir simular nos dois sentidos: sem ele (o estado de hoje) e com
// ele (o dia em que ela o largar em `public/email/`). Mexer no disco de verdade
// deixava um ficheiro para trás que passaria a ir em todos os emails.
const disco = vi.hoisted(() => ({ ficheiros: new Map<string, Buffer>() }));
vi.mock("node:fs", async (original) => {
  const real = await original<typeof import("node:fs")>();
  return {
    ...real,
    default: real,
    readFileSync: (p: Parameters<typeof real.readFileSync>[0], ...resto: unknown[]) => {
      const nome = String(p).split("/").pop() ?? "";
      const guardado = disco.ficheiros.get(nome);
      if (guardado) return guardado;
      if (String(p).includes("/public/email/")) throw new Error("ENOENT");
      return (real.readFileSync as (...a: unknown[]) => Buffer)(p, ...resto);
    },
  };
});

import {
  assinaturaDeEmail,
  emailAoCliente,
  esquecerBannerDoEmail,
  ASSINATURA_NOME,
  ASSINATURA_CARGO,
  BANNER_EMAIL_CID,
  BANNER_EMAIL_FICHEIRO,
} from "./email-assinatura";
import { SITE } from "./site";
import { MAIL_TO } from "./mail";
import { EMAIL_LOGO_CID } from "./email-logo";

beforeEach(() => {
  disco.ficheiros.clear();
  esquecerBannerDoEmail();
});
afterEach(() => {
  disco.ficheiros.clear();
  esquecerBannerDoEmail();
});

describe("assinaturaDeEmail", () => {
  it("assina sempre com o mesmo nome e cargo da casa", () => {
    const { html, texto } = assinaturaDeEmail();
    expect(html).toContain(ASSINATURA_NOME);
    expect(html).toContain(ASSINATURA_CARGO);
    expect(texto).toContain(ASSINATURA_NOME);
    expect(texto).toContain(ASSINATURA_CARGO);
  });

  /**
   * A assinatura que ela usa no telemóvel tem «líquen.alentejo@gmail.com» e
   * «líquen-events.com», com acento no i. O endereço não existe e a ligação não
   * abre. Este teste é o que impede que alguém volte a escrever os contactos à
   * mão a partir da fotografia em vez de os ler do `SITE`.
   */
  it("nunca escreve o domínio nem o email com acento", () => {
    const { html, texto } = assinaturaDeEmail();
    expect(html).not.toMatch(/líquen[.-]/i);
    expect(texto).not.toMatch(/líquen[.-]/i);
    expect(html).toContain(MAIL_TO);
    expect(html).toContain(SITE.url);
  });

  it("mostra o telefone com o espaçamento único do SITE", () => {
    const { html, texto } = assinaturaDeEmail();
    expect(html).toContain(SITE.phoneDisplay);
    expect(texto).toContain(SITE.phoneDisplay);
    // «+351 91 92 59 820» é o mesmo número com outro espaçamento — dois
    // espaçamentos espalhados pelo produto é o que se está a evitar.
    expect(html).not.toContain("91 92 59 820");
  });

  it("a versão em texto leva os mesmos contactos que o HTML", () => {
    const { texto } = assinaturaDeEmail();
    expect(texto).toContain(MAIL_TO);
    expect(texto).toContain(SITE.url);
    expect(texto).toContain(SITE.name);
  });

  it("leva o logótipo por cid: e nenhuma imagem remota", () => {
    const { html, anexos } = assinaturaDeEmail();
    expect(html).toContain(`cid:${EMAIL_LOGO_CID}`);
    expect(anexos.some((a) => a.cid === EMAIL_LOGO_CID)).toBe(true);
    // Nenhum <img> pode apontar para http(s): o Gmail/Outlook bloqueiam-nas de
    // um remetente desconhecido e o ficheiro só existe depois do deploy.
    expect(html).not.toMatch(/<img[^>]+src="https?:/);
  });

  it("dá um Buffer novo a cada chamada — o nodemailer consome o anterior", () => {
    const a = assinaturaDeEmail().anexos[0];
    const b = assinaturaDeEmail().anexos[0];
    expect(a.content).not.toBe(b.content);
    expect(Buffer.from(a.content).equals(Buffer.from(b.content))).toBe(true);
  });

  it("mostra as redes configuradas e cala o LinkedIn enquanto não tiver endereço", () => {
    const { html } = assinaturaDeEmail();
    expect(html).toContain(SITE.instagram);
    expect(html).toContain(SITE.facebook);
    expect(SITE.linkedin).toBe("");
    expect(html).not.toContain("LinkedIn");
  });

  describe("banner", () => {
    it("sem ficheiro, sai sem imagem partida e sem espaço vazio", () => {
      const { html, anexos } = assinaturaDeEmail();
      expect(html).not.toContain(BANNER_EMAIL_CID);
      expect(html).not.toContain("banner");
      expect(anexos).toHaveLength(1);
    });

    it("basta largar o ficheiro em public/email/ para passar a ir", () => {
      disco.ficheiros.set(BANNER_EMAIL_FICHEIRO, Buffer.from("PNG-a-fingir"));
      const { html, anexos } = assinaturaDeEmail();
      expect(html).toContain(`cid:${BANNER_EMAIL_CID}`);
      const anexo = anexos.find((a) => a.cid === BANNER_EMAIL_CID);
      expect(anexo?.contentType).toBe("image/png");
      expect(anexo?.filename).toBe(BANNER_EMAIL_FICHEIRO);
    });

    it("aceita o mesmo banner em JPEG, com o tipo certo", () => {
      disco.ficheiros.set("banner-liquen-email.jpg", Buffer.from("JPEG-a-fingir"));
      const anexo = assinaturaDeEmail().anexos.find((a) => a.cid === BANNER_EMAIL_CID);
      expect(anexo?.contentType).toBe("image/jpeg");
    });
  });
});

describe("emailAoCliente", () => {
  it("junta a assinatura ao corpo, nas duas versões, e devolve os anexos", () => {
    const { html, text, attachments } = emailAoCliente({
      html: "<p>Segue a proposta.</p>",
      texto: "Segue a proposta.",
    });
    expect(html).toContain("<p>Segue a proposta.</p>");
    expect(html).toContain(ASSINATURA_NOME);
    expect(text).toContain("Segue a proposta.");
    expect(text).toContain(SITE.phoneDisplay);
    expect(attachments.some((a) => a.cid === EMAIL_LOGO_CID)).toBe(true);
  });

  /**
   * HTML de email é hostil: o Outlook não percebe metade do CSS moderno. Nada
   * daqui pode depender de flexbox/grid nem de uma folha de estilo no
   * cabeçalho — que o Gmail deita fora de qualquer forma.
   */
  it("não usa flexbox, grid nem <style> no cabeçalho", () => {
    const { html } = emailAoCliente({ html: "<p>Olá.</p>", texto: "Olá." });
    expect(html).not.toContain("display:flex");
    expect(html).not.toContain("display:grid");
    expect(html).not.toContain("<style");
  });
});
