import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { mapper as propostasMapper } from "./proposals-store";
import { mapper as contratosMapper } from "./contracts-store";
import type { Proposal } from "./orcamento/types";
import type { Contract } from "./contract-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O SELO DO ACEITE — provar QUAL documento foi aceite
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O aceite já guardava quem escreveu o nome, quando, de que IP e com que texto
 * de termos. Faltava a peça mais disputada numa discussão: **qual documento**.
 *
 * Um PDF é reconstruído a partir do `doc` da proposta, e basta uma mudança no
 * código do desenho — uma fonte, uma margem, uma fotografia entretanto
 * substituída no Storage — para os bytes deixarem de bater certo. Sem selo não
 * há como distinguir «o conteúdo mudou» de «só o desenho mudou», e a conversa
 * passa a ser a palavra de um contra a do outro.
 *
 * A impressão digital é calculada no ENVIO (os bytes já lá estão, custa um
 * hash) e copiada para o contrato no aceite — nunca recalculada, porque
 * recalcular é justamente o que não prova nada.
 *
 * Estes testes guardam as três propriedades que sustentam isso:
 *   1. o selo sobrevive à ida e volta à base de dados;
 *   2. propostas antigas, sem selo, não ganham um selo inventado;
 *   3. o selo distingue mesmo dois documentos diferentes.
 */

const SEM_SELO: Proposal = {
  id: "p-antiga",
  quoteId: "q-1",
  clientName: "Casal Antigo",
  clientEmail: "antigo@exemplo.pt",
  currency: "EUR",
  lineItems: [],
  vatRate: 0.23,
  subtotal: 1000,
  vat: 230,
  total: 1230,
  status: "enviada",
  createdAt: "2026-01-01T10:00:00.000Z",
};

describe("o selo do documento sobrevive à base de dados", () => {
  it("a proposta leva a impressão digital e o tamanho na ida e na volta", () => {
    const pdf = Buffer.from("%PDF-1.7 documento que seguiu para o casal");
    const sha = createHash("sha256").update(pdf).digest("hex");

    const linha = propostasMapper.toRow({ ...SEM_SELO, pdfSha256: sha, pdfBytes: pdf.byteLength });
    expect(linha.pdf_sha256).toBe(sha);
    expect(linha.pdf_bytes).toBe(pdf.byteLength);

    const devolta = propostasMapper.fromRow(linha as Record<string, unknown>);
    expect(devolta.pdfSha256).toBe(sha);
    expect(devolta.pdfBytes).toBe(pdf.byteLength);
  });

  /**
   * Uma proposta enviada antes desta mudança não tem selo — e não pode passar a
   * ter. Um contrato que mostrasse uma impressão digital calculada hoje sobre um
   * PDF reconstruído hoje seria pior do que não mostrar nada: parece prova e
   * não é.
   */
  it("uma proposta anterior a isto não ganha selo nenhum", () => {
    const linha = propostasMapper.toRow(SEM_SELO);
    expect("pdf_sha256" in linha, "a coluna nem sequer é escrita").toBe(false);
    expect(propostasMapper.fromRow(linha as Record<string, unknown>).pdfSha256).toBeUndefined();
  });

  it("o contrato guarda o selo copiado da proposta", () => {
    const sha = createHash("sha256").update("um documento").digest("hex");
    const contrato: Contract = {
      id: "c-1",
      quoteId: "q-1",
      proposalId: "p-1",
      clientName: "Casal",
      clientEmail: "casal@exemplo.pt",
      termsVersion: "2026-01",
      termsSnapshot: "…",
      status: "aceite",
      createdAt: "2026-05-01T10:00:00.000Z",
      acceptedAt: "2026-05-01T10:00:00.000Z",
      acceptedName: "Quem assinou",
      propostaPdfSha256: sha,
      propostaPdfBytes: 12,
    };
    const linha = contratosMapper.toRow(contrato);
    expect(linha.proposta_pdf_sha256).toBe(sha);
    const devolta = contratosMapper.fromRow(linha as Record<string, unknown>);
    expect(devolta.propostaPdfSha256).toBe(sha);
    expect(devolta.propostaPdfBytes).toBe(12);
  });

  it("um contrato antigo continua sem selo, e a coluna nem é escrita", () => {
    const contrato: Contract = {
      id: "c-0",
      quoteId: "q-0",
      proposalId: "p-0",
      clientName: "Casal",
      clientEmail: "c@exemplo.pt",
      termsVersion: "2025-01",
      termsSnapshot: "…",
      status: "aceite",
      createdAt: "2025-05-01T10:00:00.000Z",
    };
    const linha = contratosMapper.toRow(contrato);
    expect("proposta_pdf_sha256" in linha).toBe(false);
    expect(
      contratosMapper.fromRow(linha as Record<string, unknown>).propostaPdfSha256,
    ).toBeUndefined();
  });

  /**
   * A propriedade que dá sentido a tudo o resto: dois documentos diferentes têm
   * de dar selos diferentes. Uma vírgula muda o preço; o selo muda com ela.
   */
  it("dois documentos diferentes dão selos diferentes", () => {
    const a = createHash("sha256").update("Total: 12.300,00 €").digest("hex");
    const b = createHash("sha256").update("Total: 12.300,10 €").digest("hex");
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });
});
