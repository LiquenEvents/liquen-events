import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import type { Proposal } from "@/lib/orcamento/types";
import {
  type ProposalDoc,
  withProposalDefaults,
  resolveProposalMoney,
  resolveValidUntil,
  MAX_PROPOSAL_DOC_BYTES,
} from "@/lib/proposal-doc";
import { isAuthed } from "@/lib/admin-auth";
import { isMissingTable } from "@/lib/repository";
import { getQuote, updateQuote } from "@/lib/quotes-store";
import { createProposal } from "@/lib/proposals-store";
import { renderStoredProposalDocPdfWithReport } from "@/lib/proposal-doc-render";
import { createProposalToken } from "@/lib/proposal-token";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as {
      mode?: "preview" | "send";
      doc?: ProposalDoc;
    } | null;
    const raw = body?.doc;
    const mode = body?.mode === "send" ? "send" : "preview";
    if (!raw || !raw.ref || !raw.clientNames) {
      return NextResponse.json({ error: "Proposta incompleta." }, { status: 400 });
    }
    // Fill the studio's fixed boilerplate (condições, observações, faseamento,
    // cancelamento) + event-token substitution so the UI only sends what varies.
    const doc = withProposalDefaults(raw);

    // O documento passou a ser GUARDADO (coluna `proposals.doc`), por isso o
    // tamanho deixou de ser um detalhe do pedido e passou a ser uma linha na
    // base de dados e uma linha na cópia de segurança. Medido: 4,3 KB de texto
    // fixo, 18,5 KB no tecto de 80 fotos — 512 KB é ~28× isso, e é o mesmo teto
    // que o rascunho já recusava. Recusa-se ANTES de desenhar o PDF: um
    // documento absurdo não vale o trabalho de sharp/pdf-lib.
    const docBytes = JSON.stringify(doc).length;
    if (docBytes > MAX_PROPOSAL_DOC_BYTES) {
      return NextResponse.json(
        { error: "Proposta demasiado grande para ser guardada." },
        { status: 413 },
      );
    }

    // Shared pipeline (resolve Storage images → render) — the exact same helper
    // the public portal PDF route uses, so both emit an identical document.
    const {
      pdf: pdfBuffer,
      missingImages,
      truncations,
    } = await renderStoredProposalDocPdfWithReport(doc);

    if (mode === "preview") {
      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="proposta-preview.pdf"',
          // Quantas fotos não entraram. O gerador salta a que não resolve, por
          // isso sem este cabeçalho o PDF sai com fotos a menos e o estúdio não
          // tem como saber. É lido em ProposalStudio para avisar antes de enviar.
          "X-Fotos-Em-Falta": String(missingImages),
          // O que o DESENHO deixou de fora (a sétima foto de um mood board, a
          // terceira linha do "Local"…) — a mesma perda, por outro caminho.
          // Vai em base64 porque o corpo desta resposta é o PDF e um cabeçalho
          // HTTP não transporta com segurança os acentos dos nomes dos campos.
          "X-Conteudo-Cortado": Buffer.from(JSON.stringify(truncations), "utf8").toString("base64"),
        },
      });
    }

    // ── Send ──
    // Resolve o total ESTRUTURADO para um bruto (com IVA) coerente. O
    // `total` guardado é sempre o BRUTO, para que splitThirtySeventy(total)
    // devolva o sinal correto e o invoice-pdf (base = amount/(1+IVA)) fique
    // consistente. Se a proposta dizia "+ IVA", o valor é grossed-up aqui.
    const money = resolveProposalMoney(doc);
    // Validade: honra uma data explícita no doc, senão hoje + validUntilDays
    // (30 por omissão) — o /proposta recusa aceitar uma proposta expirada.
    const validUntil = resolveValidUntil(doc);
    const proposal: Proposal = {
      id: randomUUID(),
      quoteId: id,
      clientName: doc.clientNames,
      clientEmail: quote.email,
      currency: "EUR",
      lineItems: [],
      vatRate: money.vatRate,
      subtotal: money.base,
      vat: money.vat,
      total: money.gross,
      validUntil,
      status: "enviada",
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      doc, // stored with Storage paths so it can be re-opened + edited
      /**
       * ── O SELO DO DOCUMENTO ────────────────────────────────────────────────
       *
       * A impressão digital do PDF que segue AGORA para o casal. Os bytes já
       * estão em memória (foram desenhados dez linhas acima), portanto isto
       * custa um `createHash` sobre um buffer e mais nada — nem um pedido, nem
       * um milissegundo de espera do lado dela.
       *
       * PORQUÊ AQUI E NÃO NO ACEITE: no aceite, desenhar o PDF outra vez seriam
       * segundos (259 ms fixos + ~75 ms por fotografia) na única página onde não
       * se pode fazer o casal esperar — a do «sim». E seria um documento
       * RECONSTRUÍDO, não o que eles viram. Aqui é o próprio.
       *
       * O que isto passa a permitir: numa discussão do género «o arco não
       * estava incluído», comparar o PDF que ela tem com o que foi aceite é
       * `sha256sum` contra o valor guardado no contrato. Sem isto, o `doc` é
       * reconstruído e qualquer mudança no código do desenho — uma fonte, uma
       * margem, uma fotografia entretanto substituída — dá um ficheiro
       * diferente, sem forma de saber se o conteúdo mudou ou só o desenho.
       */
      pdfSha256: createHash("sha256").update(pdfBuffer).digest("hex"),
      pdfBytes: pdfBuffer.byteLength,
    };

    // A proposta fica guardada COM o documento (`doc`): é a única cópia
    // DURÁVEL do que seguiu para o cliente (o rascunho do estúdio vive em
    // `app_state`, apaga-se e não vai na cópia de segurança), e é dela que sai
    // o botão "ver a proposta em PDF" do link do cliente. `docSaved` diz se
    // isso aconteceu mesmo.
    let docSaved = true;
    let docError: string | undefined;
    try {
      await createProposal(proposal);
    } catch (e) {
      // Coluna `proposals.doc` em falta = instalação onde o db/schema.sql desta
      // versão ainda não foi corrido. NÃO se deita fora o envio por causa
      // disso: grava-se a proposta sem o documento (exatamente o que a
      // aplicação fazia antes desta coluna existir) e diz-se o que se perdeu.
      // Uma proposta por enviar é um negócio parado; uma proposta sem `doc` é
      // só um botão a menos no link do cliente, e um `psql` de um minuto.
      if (isMissingTable(e)) {
        log.error(
          "proposta-doc: coluna `proposals.doc` em falta — proposta guardada SEM o documento; corra db/schema.sql",
          e,
          { id },
        );
        try {
          await createProposal({ ...proposal, doc: undefined });
          docSaved = false;
          docError =
            "A proposta foi guardada, mas o documento não: falta correr o db/schema.sql (coluna `proposals.doc`). Sem ele o cliente não vê o PDF no link, e do documento enviado só fica o rascunho do estúdio (que se apaga e não vai na cópia de segurança).";
        } catch (e2) {
          log.error("proposta-doc: guardar falhou", e2, { id });
          return NextResponse.json(
            { error: "Não foi possível guardar a proposta. Tente novamente." },
            { status: 503 },
          );
        }
      } else {
        log.error("proposta-doc: guardar falhou", e, { id });
        return NextResponse.json(
          { error: "Não foi possível guardar a proposta. Tente novamente." },
          { status: 503 },
        );
      }
    }

    const acceptUrl = `${SITE.url}/proposta/${createProposalToken(proposal.id)}`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2a2620">
        <h2 style="font-size:18px;margin:0 0 12px">A sua proposta — Líquen Events</h2>
        <p style="font-size:14px;line-height:1.6">Olá ${esc(doc.clientNames)},</p>
        <p style="font-size:14px;line-height:1.6">Segue em anexo a proposta personalizada para o seu evento. Pode vê-la e responder online através do botão abaixo.</p>
        <p style="margin:24px 0"><a href="${acceptUrl}" style="display:inline-block;background:#637a5f;color:#f7f4ee;text-decoration:none;padding:13px 28px;border-radius:4px;font-size:13px;letter-spacing:0.06em">Ver e responder à proposta →</a></p>
        <p style="font-size:13px;color:#6b665c;margin-top:20px">Líquen Events · ${esc(MAIL_TO)} · ${SITE.phoneDisplay}</p>
      </div>`;
    const text = [
      "A sua proposta — Líquen Events",
      "",
      `Olá ${doc.clientNames},`,
      "",
      "Segue em anexo a proposta personalizada para o seu evento.",
      `Ver e responder online: ${acceptUrl}`,
      "",
      `Líquen Events · ${MAIL_TO} · ${SITE.phoneDisplay}`,
    ].join("\n");

    // A proposta JÁ foi guardada acima. O envio do email é um passo separado: se
    // falhar (SMTP em baixo, credenciais erradas, email do cliente inválido) NÃO
    // pode deitar abaixo a geração inteira com um 500 — senão o utilizador vê
    // "erro", tenta de novo e cria propostas duplicadas. Falhar no email devolve
    // 200 com emailed:false + motivo, para a UI explicar o que aconteceu.
    const hasRecipient = !!quote.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(quote.email);
    let emailed = false;
    let emailError: string | undefined;
    if (!hasRecipient) {
      emailError = "O pedido não tem um email de cliente válido.";
    } else {
      try {
        const mail = await sendMail({
          to: quote.email,
          replyTo: MAIL_TO,
          subject: `Proposta para o seu evento — Líquen Events (${proposal.id.slice(0, 8)})`,
          html,
          text,
          attachments: [
            {
              filename: `Proposta-Liquen-${id}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        });
        emailed = mail.sent;
        if (!mail.sent) emailError = "Envio de email não configurado.";
      } catch (e) {
        log.error("proposta-doc: envio de email falhou", e, { id });
        emailError = "A proposta foi guardada, mas o email ao cliente falhou.";
      }
    }

    try {
      // `money.base` (SEM IVA) e não `money.gross`. O campo chama-se "Preço
      // final (sem IVA)" no ecrã, quem o escreve à mão escreve-o líquido, e o
      // `contractedAmounts` (dossier.ts) trata-o como líquido — faz
      // `gross = quotedPrice * (1 + taxa)` para obter o valor com IVA.
      //
      // Gravar aqui o valor COM IVA punha as três coisas em desacordo e o
      // estrago era em cascata: a margem do evento (EventCosts) compara
      // `revenueNet` com os custos líquidos, e `revenueNet` passava a ser o
      // valor com IVA — margem cerca de 23% melhor do que a real. O valor "com
      // IVA" derivado ficava 51% acima. E ao fazer uma segunda proposta para o
      // mesmo casamento, o estúdio partia desse número já com IVA e voltava a
      // marcar "+ IVA" por cima.
      await updateQuote(id, { status: "cotado", quotedPrice: money.base });
    } catch (e) {
      log.error("proposta-doc: actualizar pedido falhou", e);
    }

    // `missingImages` VAI TAMBÉM NO ENVIO, não só na pré-visualização.
    //
    // A contagem foi acrescentada quando a Catarina recebeu um PDF com fotos a
    // menos e ninguém a avisou. Mas ficou só no caminho da pré-visualização — e
    // os passos do estúdio são clicáveis, portanto dá para ir do Conteúdo
    // direito ao Enviar sem passar por lá. Nesse caminho o número era calculado
    // (é o mesmo `renderStoredProposalDocPdfWithReport` lá em cima) e deitado
    // fora, o que deixava a porta aberta exactamente para o caso que a magoou:
    // a proposta segue para o noivo com fotos a menos, em silêncio.
    //
    // `truncations` viaja pelo mesmo motivo e pelo mesmo caminho: é a mesma
    // perda vista do outro lado — conteúdo que chegou e que a página não
    // desenhou.
    return NextResponse.json({
      ok: true,
      id: proposal.id,
      emailed,
      emailError,
      missingImages,
      truncations,
      // Só viaja quando NÃO foi guardado: uma resposta normal não ganha nada
      // com um `docSaved:true` a mais, e quem falha tem de sair pelo nome.
      ...(docSaved ? {} : { docSaved, docError }),
    });
  } catch (err) {
    log.error("proposta-doc POST falhou", err);
    // Rota só para administradores autenticados — incluir o motivo real ajuda a
    // equipa (e o suporte) a perceber a causa em vez de um erro genérico opaco.
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Erro ao gerar a proposta: ${detail || "desconhecido"}` },
      { status: 500 },
    );
  }
}
