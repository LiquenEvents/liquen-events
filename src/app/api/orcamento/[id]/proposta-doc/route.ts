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
import { transicaoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { getQuote, updateQuoteWith } from "@/lib/quotes-store";
import { eur } from "@/lib/money";
import { createProposal } from "@/lib/proposals-store";
import { renderStoredProposalDocPdfWithReport } from "@/lib/proposal-doc-render";
import {
  ehIdiomaDaProposta,
  IDIOMA_POR_OMISSAO,
  type IdiomaDaProposta,
} from "@/lib/proposal-doc-textos";
import { createProposalToken } from "@/lib/proposal-token";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «NÃO DÁ PARA MANDAR A PROPOSTA PARA O CLIENTE»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta é a rota mais pesada da aplicação inteira: vai buscar ao armazenamento
 * até oitenta fotografias, redimensiona cada uma com o sharp, desenha um PDF de
 * uma dúzia de páginas, guarda a proposta e envia um email com o ficheiro em
 * anexo. E era a ÚNICA das rotas pesadas que não dizia quanto tempo precisa.
 *
 * Sem esta linha, a plataforma dá o mínimo — dez segundos — e mata a função a
 * meio. Do lado dela não aparece um erro que se perceba: aparece um erro
 * qualquer, ou nada, depois de o botão ter ficado a rodar. E o mais cruel é que
 * funciona nos testes e nas propostas pequenas: só falha nas que têm fotografias
 * a sério, que são exactamente as que ela manda aos casais.
 *
 * A comparação diz tudo: a rota que serve o PDF já feito ao cliente pede 20 s,
 * a que faz miniaturas pede 60, e a que faz TUDO isto não pedia nada.
 *
 * 60 s é o tecto do plano e é o valor certo aqui: não torna nada mais lento (só
 * se paga o que se usa), e é a diferença entre uma proposta que sai e uma
 * proposta que morre a meio sem explicação.
 */
export const maxDuration = 60;

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
      idioma?: unknown;
    } | null;
    const raw = body?.doc;
    const mode = body?.mode === "send" ? "send" : "preview";

    /**
     * ══════════════════════════════════════════════════════════════════════
     * A LÍNGUA É DE QUEM GERA, NÃO DO DOCUMENTO
     * ══════════════════════════════════════════════════════════════════════
     *
     * O documento guardado continua a ser um só, em português. A língua entra
     * aqui, no pedido, como o tamanho da página entraria: é um parâmetro de
     * DESENHO. Ver o cabeçalho de `proposal-doc-textos`.
     *
     * ── PORQUE É QUE UM VALOR ESTRANHO NÃO É UM 400 ───────────────────────
     *
     * Cai em português, que é a mesma escolha que esta rota já faz com o
     * `mode`: o que não se reconhece vale o valor por omissão. As razões, por
     * ordem de peso:
     *
     * · O português é a língua em que a proposta foi ESCRITA. Cair nele é cair
     *   no documento que sempre saiu — nada fica mal traduzido, no máximo fica
     *   por traduzir, e ela vê isso no PDF que abre a seguir.
     * · Recusar transformava um erro de quem chama em «não dá para gerar a
     *   proposta» — exactamente a avaria que o cabeçalho deste ficheiro conta.
     *   Uma moldura em português nunca vale um negócio parado.
     * · Um valor estranho só pode vir de um cliente avariado (o estúdio manda
     *   sempre "pt" ou "en"), e por isso fica REGISTADO: cair calado seria
     *   esconder essa avaria para sempre.
     *
     * Um pedido SEM o campo não é um valor estranho — é o caminho de sempre, e
     * não regista nada.
     */
    if (!raw || !raw.ref || !raw.clientNames) {
      return NextResponse.json({ error: "Proposta incompleta." }, { status: 400 });
    }
    let idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO;
    if (body?.idioma !== undefined) {
      if (ehIdiomaDaProposta(body.idioma)) {
        idioma = body.idioma;
      } else {
        log.warn("proposta-doc: idioma desconhecido, a desenhar em português", {
          id,
          recebido: String(body.idioma),
        });
      }
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
    let relatorio = await renderStoredProposalDocPdfWithReport(doc, idioma);

    /**
     * ════════════════════════════════════════════════════════════════════════
     * SEGUNDA TENTATIVA ANTES DE UMA PROPOSTA SEGUIR COM BURACOS
     * ════════════════════════════════════════════════════════════════════════
     *
     * O envio desenhava o documento UMA vez. Se uma fotografia não resolvesse,
     * o email saía à mesma com uma moldura vazia e o estúdio dizia, depois,
     * «no PDF que seguiu, falta uma foto; verifique e reenvie» — com o casal já
     * com a proposta incompleta na caixa de correio.
     *
     * A causa mais comum de uma foto não resolver é PASSAGEIRA: um pedido ao
     * armazenamento que expirou, uma ligação que caiu a meio de oitenta.
     * Desenhar outra vez apanha esse caso, e não custa nada quando não é esse —
     * o caminho normal é zero em falta e não repete.
     *
     * ── O QUE ISTO NÃO FAZ, E PORQUÊ ─────────────────────────────────────
     *
     * NÃO recusa o envio. A porta do CLIENTE recusa (ver `proposal-pdf-cache`,
     * `PropostaIncompleta`), e aqui está escrito o contrário de propósito, com
     * a razão dela: «recusar seria pior — ela fica sem nada e sem perceber
     * porquê». É uma decisão de produto e não é minha para virar; a repetição
     * melhora-a sem lhe tocar. Se um dia quiser que o envio também trave, é
     * mudar estas linhas e o teste que as guarda.
     *
     * Fica-se com o MELHOR dos dois desenhos: se a segunda tentativa correr
     * pior do que a primeira (o armazenamento a piorar a meio), manda-se a
     * primeira. Repetir nunca pode deixar a proposta pior do que estava.
     *
     * A pré-visualização não repete: é onde ela DESCOBRE o que falta, e é para
     * ser rápida.
     */
    if (mode === "send" && relatorio.missingImages > 0) {
      log.warn("proposta-doc: fotos em falta no envio, a desenhar segunda vez", {
        id,
        emFalta: relatorio.missingImages,
      });
      // A segunda tentativa é o MESMO documento na MESMA língua: repetir é para
      // apanhar uma foto que não resolveu, não para mudar o que sai.
      const segunda = await renderStoredProposalDocPdfWithReport(doc, idioma);
      if (segunda.missingImages < relatorio.missingImages) relatorio = segunda;
      if (relatorio.missingImages > 0) {
        log.error("proposta-doc: a proposta segue com fotos a menos", null, {
          id,
          emFalta: relatorio.missingImages,
        });
      }
    }

    const { pdf: pdfBuffer, missingImages, truncations } = relatorio;

    if (mode === "preview") {
      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          // O nome do ficheiro segue a língua pedida. Quem descarrega pelo
          // estúdio nem chega a ver este nome (o botão escolhe o seu), mas quem
          // chamar a rota à mão fica com dois PDF distinguíveis na pasta em vez
          // de `proposta-preview (1).pdf`.
          "Content-Disposition": `inline; filename="${
            idioma === "en" ? "proposal-preview" : "proposta-preview"
          }.pdf"`,
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
        /**
         * ══════════════════════════════════════════════════════════════════
         * UMA COLUNA QUE FALTA NÃO PODE PARAR O NEGÓCIO
         * ══════════════════════════════════════════════════════════════════
         *
         * O `db/schema.sql` é corrido À MÃO no editor de SQL. Numa base onde
         * a versão nova ainda não foi aplicada, as colunas novas não existem
         * — e a gravação rebenta.
         *
         * Este resgate existia e tirava só o `doc`. Não chegava: o envio
         * passou a escrever TAMBÉM o selo do documento (`pdf_sha256`,
         * `pdf_bytes`, acrescentados na mesma altura), portanto a segunda
         * tentativa levava-os na mesma, rebentava exactamente pela mesma
         * razão, e a resposta era 503 — «Não foi possível guardar a proposta.
         * Tente novamente.» Tentar outra vez nunca resolvia.
         *
         * E a avaria era invisível de uma maneira cruel: a PRÉ-VISUALIZAÇÃO
         * continuava perfeita, porque devolve o PDF antes de chegar aqui. O
         * documento via-se, o envio é que nunca ia — que é ao pé da letra
         * «não dá para mandar a proposta para o cliente».
         *
         * Agora tira-se TUDO o que possa não existir numa base antiga, de uma
         * vez. A proposta é gravada com o que a base aceita, o email segue, e
         * o que se perdeu é DITO — em vez de se perder o negócio para guardar
         * um campo acessório.
         */
        log.error(
          "proposta-doc: coluna em falta na tabela `proposals` — proposta guardada sem os campos novos; corra db/schema.sql",
          e,
          { id },
        );
        try {
          await createProposal({
            ...proposal,
            doc: undefined,
            pdfSha256: undefined,
            pdfBytes: undefined,
          });
          docSaved = false;
          docError =
            "A proposta foi guardada e enviada, mas sem o documento nem o selo: falta correr o " +
            "db/schema.sql na base de dados (colunas `proposals.doc`, `pdf_sha256`, `pdf_bytes`). " +
            "Sem o documento o cliente não vê o PDF no link, e do que foi enviado só fica o " +
            "rascunho do estúdio (que se apaga e não vai na cópia de segurança).";
        } catch (e2) {
          log.error("proposta-doc: guardar falhou mesmo sem os campos novos", e2, { id });
          return NextResponse.json(
            {
              error:
                "Não foi possível guardar a proposta — a base de dados recusou a gravação. " +
                "Verifica se o db/schema.sql foi corrido nesta base.",
            },
            { status: 503 },
          );
        }
      } else {
        log.error("proposta-doc: guardar falhou", e, { id });
        return NextResponse.json(
          { error: "Não foi possível guardar a proposta. Tenta novamente." },
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
      /**
       * ══════════════════════════════════════════════════════════════════════
       * O PREÇO GRAVA-SE SEMPRE; O ESTADO SÓ SOBE
       * ══════════════════════════════════════════════════════════════════════
       *
       * `money.base` (SEM IVA) e não `money.gross`. O campo chama-se "Preço
       * final (sem IVA)" no ecrã, quem o escreve à mão escreve-o líquido, e o
       * `contractedAmounts` (dossier.ts) trata-o como líquido — faz
       * `gross = quotedPrice * (1 + taxa)` para obter o valor com IVA.
       *
       * Gravar aqui o valor COM IVA punha as três coisas em desacordo e o
       * estrago era em cascata: a margem do evento (EventCosts) compara
       * `revenueNet` com os custos líquidos, e `revenueNet` passava a ser o
       * valor com IVA — margem cerca de 23% melhor do que a real. O valor "com
       * IVA" derivado ficava 51% acima. E ao fazer uma segunda proposta para o
       * mesmo casamento, o estúdio partia desse número já com IVA e voltava a
       * marcar "+ IVA" por cima.
       *
       * ── O QUE MUDOU: `status: "cotado"` ERA INCONDICIONAL ────────────────
       *
       * Escrever "cotado" a seco fazia RECUAR um pedido já ganho. E não é um
       * caso teórico: rever a proposta DEPOIS do aceite acontece (o cálculo do
       * saldo em faturas/[id] tem uma nota inteira sobre isso). Bastava
       * reenviar o documento com uma linha corrigida para o casamento fechado
       * voltar a «Proposta enviada» no quadro — com o sinal já emitido e pago.
       *
       * Agora a decisão é a de `@/lib/orcamento/estado-do-pedido`, que nunca
       * desce a escada, e deixa a linha no histórico a dizer o que a causou.
       * O PREÇO grava-se na mesma nos dois casos: é o valor da proposta que
       * acabou de seguir, e nada nele depende do estado.
       *
       * `updateQuoteWith` e não `updateQuote` porque o `getQuote` do princípio
       * desta rota está a dezenas de segundos daqui — pelo meio desenhou-se um
       * PDF de uma dúzia de páginas e mandou-se um email. A regra tem de ser
       * avaliada contra o que está gravado AGORA, e a linha nova do histórico
       * não pode apagar a que outra ferramenta escreveu entretanto.
       */
      await updateQuoteWith(id, (actual) => {
        const transicao = transicaoDoPedido({
          acontecimento: "proposta_enviada",
          estadoActual: actual.status,
          detalhe: eur(money.gross),
        });
        return {
          ...actual,
          quotedPrice: money.base,
          ...(transicao
            ? {
                status: transicao.status,
                activityLog: [...(actual.activityLog ?? []), transicao.entrada],
              }
            : {}),
        };
      });
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
      // Quanto pesou este documento. O estúdio guarda-o com o tempo que a
      // geração demorou, e é dessas medições que sai a estimativa que aparece
      // antes do botão — incluindo o aviso de que o anexo passa do que um
      // email leva. Na pré-visualização isto sabe-se do próprio blob; no envio
      // o PDF não passa pelo browser, e sem esta linha o envio não ensinava
      // nada à estimativa.
      pdfBytes: pdfBuffer.byteLength,
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
