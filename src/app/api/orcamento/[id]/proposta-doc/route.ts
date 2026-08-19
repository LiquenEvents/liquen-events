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
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import { isAuthed } from "@/lib/admin-auth";
import { isMissingTable } from "@/lib/repository";
import { transicaoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { getQuote, updateQuoteWith } from "@/lib/quotes-store";
/** `eur` é o formato do PAINEL (a linha do histórico); `eurDocumento` é o de
 *  tudo o que sai para o cliente — aqui, o `{valor}` que um modelo de email
 *  pode citar. O porquê da separação está no `money.ts`. */
import { eur, eurDocumento } from "@/lib/money";
import { createProposal, updateProposal, listProposalsForQuote } from "@/lib/proposals-store";
import { renderStoredProposalDocPdfWithReport } from "@/lib/proposal-doc-render";
import {
  ehIdiomaDaProposta,
  IDIOMA_POR_OMISSAO,
  type IdiomaDaProposta,
} from "@/lib/proposal-doc-textos";
import { textosDoEmailDaProposta } from "@/lib/email-proposta-textos";
import { createProposalToken } from "@/lib/proposal-token";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { emailAoCliente } from "@/lib/email-assinatura";
import { marcadoresDoPedido, modeloParaEnvioAutomatico } from "@/lib/email-modelos";
import { SITE } from "@/lib/site";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * GET — O LINK DA PROPOSTA MAIS RECENTE REALMENTE ENVIADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Para o botão «Copiar resumo» do estúdio (ver `ProposalStudio.tsx`): três ou
 * quatro linhas prontas a colar no WhatsApp, com o link de aceitação quando ele
 * existe. O link é um token assinado (HMAC, `proposal-token.ts`) e só se
 * calcula aqui, no servidor — o estúdio não tem o segredo para o construir
 * sozinho, nem devia ter.
 *
 * Só a proposta REALMENTE enviada conta — `sentAt` só fica marcado quando o
 * `sendMail` do POST aqui em baixo confirma que o correio saiu (ver a nota «O
 * ESTADO NASCE "POR ENVIAR"»). Uma proposta gravada mas cujo email falhou não
 * tem, aos olhos do resto do produto, um link que valha a pena dar ao casal —
 * ele nunca chegou a recebê-lo.
 *
 * `acceptUrl: null` quando não há nenhuma — a primeira vez que se abre o
 * estúdio para um pedido novo, por exemplo. O botão sabe ler isso: o resumo
 * sai sem o link em vez de sair com um link partido.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const propostas = await listProposalsForQuote(id);
    const enviadas = propostas.filter((p): p is Proposal & { sentAt: string } => !!p.sentAt);
    // A mais recente pelo momento em que SEGUIU, não pela criação: uma
    // proposta reenviada (o "rascunho" que a nota da gravação reaproveita)
    // pode ter sido criada há dias e enviada agora mesmo.
    enviadas.sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt));
    const ultima = enviadas[0];
    return NextResponse.json({
      ok: true,
      acceptUrl: ultima ? `${SITE.url}/proposta/${createProposalToken(ultima.id)}` : null,
    });
  } catch (err) {
    log.error("proposta-doc GET falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TEXTO QUE ELA ESCREVEU, EM HTML QUE NÃO SE PARTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A mensagem pessoal é TEXTO escrito à mão numa caixa — não é marcação. Um
 * «arco & flores» ou um «<3» num email HTML sem escape dá, na melhor das
 * hipóteses, um símbolo que desaparece; na pior, uma etiqueta aberta que come o
 * resto da mensagem (o botão da proposta incluído). Por isso passa toda pelo
 * `esc`, e só DEPOIS de escapada é que se lhe acrescenta marcação nossa.
 *
 * As quebras de linha dela têm de sobreviver: num `<p>` sem tratamento, o
 * navegador de correio junta tudo numa só linha e o que ela escreveu em três
 * parágrafos chega como um bloco. Linha em branco = parágrafo novo; quebra
 * simples = `<br>`, que é a leitura que qualquer pessoa faz de uma caixa de
 * texto.
 *
 * `white-space:pre-wrap` teria feito o mesmo com menos código, e não serve
 * aqui: o Outlook (motor Word) ignora-o, e é onde metade destes emails abre.
 */
function paragrafosDaMensagem(texto: string): string {
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="font-size:14px;line-height:1.6">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n        ");
}

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
      mensagem?: unknown;
      /** «Já vi o que fica cortado, envia à mesma» — ver a pergunta antes do
       *  envio, mais abaixo. Só `true` conta: qualquer outra coisa é «ainda
       *  não respondeu». */
      cortesConfirmados?: unknown;
    } | null;
    const raw = body?.doc;
    const mode = body?.mode === "send" ? "send" : "preview";

    /**
     * A mensagem pessoal do passo «Enviar» do estúdio. OPCIONAL A SÉRIO: vazia,
     * só com espaços, ou de um tipo que não é texto (um cliente avariado), o
     * email sai exactamente como saía antes de esta caixa existir. Um envio
     * nunca pode parar por causa da nota de acompanhamento — ver o cabeçalho
     * deste ficheiro: uma proposta que não segue é um negócio parado.
     */
    const mensagem = typeof body?.mensagem === "string" ? body.mensagem.trim() : "";

    /**
     * ══════════════════════════════════════════════════════════════════════
     * A LÍNGUA É DO DOCUMENTO QUE SEGUE, NÃO SÓ DESTE CLIQUE
     * ══════════════════════════════════════════════════════════════════════
     *
     * O documento guardado (`doc`) continua a ser um só, em português: a língua
     * não entra lá dentro, é a moldura com que ele é DESENHADO — ver o
     * cabeçalho de `proposal-doc-textos`.
     *
     * O que mudou é o que acontece a esta variável a seguir. Era um parâmetro
     * de desenho e mais nada: desenhava o PDF, nomeava o ficheiro e morria no
     * fim do pedido. Com isso, uma proposta gerada em inglês seguia dentro de
     * um email português, abria numa página de aceite na língua do VISITANTE, e
     * voltava a descarregar-se em português — pelo link do casal e pelo portal.
     * Agora, no ENVIO, fica GRAVADA com a proposta (`proposals.idioma`), e é
     * dela que vivem o email daqui a vinte linhas, a página do aceite, o portal
     * e as duas rotas que voltam a desenhar o PDF.
     *
     * Na PRÉ-VISUALIZAÇÃO não se grava nada, porque não há proposta nenhuma:
     * é um PDF para ela ver, e volta a gerar-se daqui a dez segundos.
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

    /**
     * ══════════════════════════════════════════════════════════════════════
     * O QUE FICOU CORTADO É UMA PERGUNTA ANTES DE SEGUIR, NÃO UM AVISO DEPOIS
     * ══════════════════════════════════════════════════════════════════════
     *
     * O relatório de truncagens já existia e já viajava — mas no ENVIO chegava
     * ao estúdio DENTRO da resposta, ou seja depois de o email ter saído. Ela
     * lia «o nome do casal não cabe na capa» com o casal já a ter a proposta na
     * caixa de correio, e o nome cortado a acabar num «&» solto.
     *
     * Agora o envio pára aqui e pergunta. O PDF já está desenhado (custou o
     * que custou), a proposta ainda NÃO foi gravada e o email ainda NÃO saiu:
     * é o último instante em que voltar atrás não custa nada a ninguém.
     *
     * ── PORQUE É QUE NÃO RECUSA ──────────────────────────────────────────
     *
     * Porque uma truncagem pode ser deliberada — uma legenda comprida de
     * propósito, um mood board com mais fotos do que a página leva. A regra
     * dela é a de sempre e está escrita duas dezenas de linhas acima: «uma
     * proposta que não sai é pior do que uma proposta com um aviso», e
     * «recusar seria pior — ela fica sem nada e sem perceber porquê». Por isso
     * isto não é uma porta fechada: é uma pergunta com resposta. O estúdio
     * mostra o que ficou de fora e reenvia com `cortesConfirmados`.
     *
     * 409 e não 400: o pedido está bem formado e o servidor fez o trabalho
     * todo — o que falta é uma decisão de quem envia. É o código que o estúdio
     * distingue de uma avaria (ver `porqueFalhouOEnvio`).
     *
     * As FOTOS EM FALTA não passam por aqui, e é de propósito: essas são uma
     * AVARIA (a foto devia estar e não está), já têm segunda tentativa aqui em
     * cima, e a decisão escrita é que o envio não trava por causa delas.
     */
    const cortesConfirmados = body?.cortesConfirmados === true;
    if (mode === "send" && truncations.length > 0 && !cortesConfirmados) {
      log.warn("proposta-doc: envio parado para confirmar o que ficou cortado", {
        id,
        cortado: truncations.map((t) => `${t.where}: -${t.dropped} ${t.unit}`),
      });
      return NextResponse.json(
        {
          error: "O documento sai com conteúdo cortado.",
          // O nome do campo é a pergunta: quem chama esta rota à mão percebe o
          // que lhe falta sem ter de ler o código.
          precisaConfirmarCortes: true,
          truncations,
        },
        { status: 409 },
      );
    }

    // ── Send ──
    // Resolve o total ESTRUTURADO para um bruto (com IVA) coerente. O
    // `total` guardado é sempre o BRUTO, para que splitThirtySeventy(total)
    // devolva o sinal correto e o invoice-pdf (base = amount/(1+IVA)) fique
    // consistente. Se a proposta dizia "+ IVA", o valor é grossed-up aqui.
    // `dinheiroDaProposta` e não `resolveProposalMoney`: quando os valores
    // adicionais somam ao valor escrito, o bruto que fica GRAVADO tem de os
    // trazer. Senão o PDF dizia 3.862,20 € e o sinal continuava a ser calculado
    // sobre 3.690 € — o documento e a cobrança a discordarem em silêncio.
    const money = dinheiroDaProposta(doc);
    // Validade: honra uma data explícita no doc, senão hoje + validUntilDays
    // (30 por omissão) — o /proposta recusa aceitar uma proposta expirada.
    const validUntil = resolveValidUntil(doc);

    /**
     * ══════════════════════════════════════════════════════════════════════
     * REENVIAR NÃO PODE SER GERAR OUTRA
     * ══════════════════════════════════════════════════════════════════════
     *
     * Quando o email não sai (SMTP em baixo, contacto errado), a proposta fica
     * gravada — tem de ficar, ver a nota da gravação aqui em baixo — mas fica
     * POR ENVIAR. Ela corrige o que estava mal e carrega outra vez no mesmo
     * botão: sem isto, cada tentativa gravava MAIS UMA proposta, e três
     * tentativas eram três linhas no quadro «Propostas» para o mesmo casal.
     * É a mesma família das «propostas fantasma» que a rota irmã descreve.
     *
     * Reaproveita-se a mais recente que ainda não foi oferecida a ninguém
     * (`rascunho`) — e só essa. Uma proposta que JÁ seguiu para o casal nunca
     * é reescrita: uma revisão é uma proposta nova, e é disso que dependem o
     * histórico, a análise, e a guarda da proposta mais recente no link do
     * cliente (`/api/proposta`).
     *
     * Uma leitura que falhe não pode travar o envio: cai-se na proposta nova,
     * que é exactamente o que a rota fazia antes.
     */
    let porEnviar: Proposal | null = null;
    if (mode === "send") {
      try {
        const irmas = await listProposalsForQuote(id);
        porEnviar =
          irmas
            .filter((p) => p.status === "rascunho")
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0] ?? null;
      } catch (e) {
        log.warn("proposta-doc: não deu para procurar uma proposta por enviar", { id, erro: e });
      }
    }

    const proposal: Proposal = {
      id: porEnviar?.id ?? randomUUID(),
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
      /**
       * ══════════════════════════════════════════════════════════════════════
       * O ESTADO NASCE «POR ENVIAR», E É O CORREIO QUE O FAZ SUBIR
       * ══════════════════════════════════════════════════════════════════════
       *
       * Isto dizia `status: "enviada"` e `sentAt: agora` — escritos ANTES de se
       * tentar enviar seja o que for. Com o SMTP em baixo, o estúdio mostrava um
       * aviso passageiro e o registo ficava com
       * `{"status":"enviada","sentAt":"…"}` para sempre: o quadro «Propostas»
       * mostrava uma proposta «Enviada, à espera de resposta» que nunca saiu de
       * casa, e o Acompanhamento punha-a a contar dias por uma resposta que não
       * podia chegar. Um aviso passa; um estado errado fica.
       *
       * «Enviada» é um FACTO sobre o mundo — o servidor de correio aceitou a
       * mensagem — e só se escreve depois de ele acontecer (mais abaixo, a
       * seguir ao `sendMail`). Até lá a proposta é o que é: um documento gerado,
       * guardado, por enviar. O `rascunho` é o estado que o resto do produto já
       * lê como «nunca foi oferecida a ninguém» — o link do cliente recusa-a
       * (`EM_ABERTO`), a análise não a conta, o Acompanhamento não a persegue.
       *
       * O que NÃO muda: a proposta é gravada na mesma, antes do envio. Ver a
       * nota da gravação, aqui em baixo — é o que impede as propostas fantasma.
       */
      status: "rascunho",
      createdAt: porEnviar?.createdAt ?? new Date().toISOString(),
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
      /**
       * ── A LÍNGUA EM QUE ESTE PDF FOI DESENHADO ────────────────────────────
       *
       * Gravada SEMPRE, mesmo quando é o português: é um facto sobre o
       * documento que acabou de ser selado na linha de cima — foi desenhado com
       * esta moldura, e é esta que tem de voltar quando alguém o pedir outra
       * vez. Deixá-la em branco no caminho português punha uma proposta nova a
       * ser indistinguível de uma anterior a esta coluna, e obrigava a adivinhar
       * onde não é preciso.
       *
       * É também o que faz o SELO poder ser verificado: quem redesenhar o
       * documento a partir do `doc` tem agora como saber em que língua o fazer,
       * e o `sha256` volta a bater. Enquanto isto não se guardava, um PDF inglês
       * selado no envio nunca mais podia ser reproduzido — quem o redesenhava
       * desenhava-o em português e obtinha outra impressão digital.
       */
      idioma,
    };

    // A proposta fica guardada COM o documento (`doc`): é a única cópia
    // DURÁVEL do que seguiu para o cliente (o rascunho do estúdio vive em
    // `app_state`, apaga-se e não vai na cópia de segurança), e é dela que sai
    // o botão "ver a proposta em PDF" do link do cliente. `docSaved` diz se
    // isso aconteceu mesmo.
    let docSaved = true;
    let docError: string | undefined;
    /** Gravar ESTA proposta: uma linha nova, ou a que ficou por enviar (acima). */
    const guardar = (p: Proposal): Promise<unknown> =>
      porEnviar ? updateProposal(p.id, p) : createProposal(p);
    try {
      await guardar(proposal);
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
          await guardar({
            ...proposal,
            doc: undefined,
            pdfSha256: undefined,
            pdfBytes: undefined,
            // A língua é a coluna mais recente das quatro, portanto é a mais
            // provável de faltar numa base por actualizar. Sai com as outras: o
            // EMAIL desta proposta segue na língua certa de qualquer maneira (é
            // decidido aqui, em memória) e o que se perde é a segunda descarga,
            // que volta a dar o documento em português — o comportamento de
            // antes desta funcionalidade, dito no `docError`.
            idioma: undefined,
          });
          docSaved = false;
          docError =
            "A proposta foi guardada e enviada, mas sem o documento nem o selo: falta correr o " +
            "db/schema.sql na base de dados (colunas `proposals.doc`, `pdf_sha256`, `pdf_bytes`, " +
            "`idioma`). Sem o documento o cliente não vê o PDF no link, sem a língua uma proposta " +
            "inglesa volta a descarregar-se em português, e do que foi enviado só fica o " +
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
    // Só o corpo: a moldura, a assinatura da casa e os anexos da marca vêm do
    // `email-assinatura` — o mesmo fecho de todo o correio que sai daqui.
    /**
     * ══════════════════════════════════════════════════════════════════════
     * ONDE ENTRA A MENSAGEM DELA, E PORQUÊ AÍ
     * ══════════════════════════════════════════════════════════════════════
     *
     * Logo a seguir ao «Olá», ANTES da frase da casa e do botão.
     *
     * Quem abre este email é um casal à espera de saber o que a Catarina lhes
     * tem para dizer. O que é dela — «foi um gosto conhecer-vos na quinta», «o
     * arco fica incluído, como combinámos» — é a única parte que não se
     * adivinha; a frase «segue em anexo a proposta» e o botão são a moldura,
     * que se lê em meio segundo e está igual em todos os emails que já
     * receberam. Pôr a nota pessoal depois do botão era pô-la depois do sítio
     * onde muita gente já carregou.
     *
     * Fica DEPOIS do «Olá» e não antes porque o cumprimento é o cumprimento: a
     * mensagem dela é o que se diz ao casal, não o que se diz antes de o
     * saudar.
     *
     * E fica ANTES da assinatura da casa sem que isso se escreva aqui: o
     * `emailAoCliente` fecha sempre no fim. É por isso que a caixa do estúdio
     * diz, ao lado, que ela não precisa de se despedir — o fecho é um só, e é
     * o da casa (ver `email-assinatura.ts` e os modelos do `ClientMessenger`,
     * que se despediam por cima dele).
     */
    /**
     * ══════════════════════════════════════════════════════════════════════
     * O MODELO DELA, E QUANDO É QUE ELE NÃO É USADO
     * ══════════════════════════════════════════════════════════════════════
     *
     * O modelo «proposta-enviada» do ecrã «Modelos de email» passa a ser o
     * corpo deste email — nas DUAS rotas que mandam uma proposta, senão o que
     * o cliente recebe passava a depender do botão em que ela carregou. O
     * recurso é o texto que está aqui em baixo, e a razão inteira está escrita
     * na rota irmã (`orcamento/[id]/proposta`), que é onde o mesmo `null`
     * também significa «sai o texto da casa».
     *
     * ── A MENSAGEM PESSOAL GANHA AO MODELO ────────────────────────────────
     *
     * Quando ela escreve uma mensagem para acompanhar ESTA proposta, o modelo
     * fica de fora. Não é indecisão: o texto da casa foi desenhado à volta
     * dessa mensagem — ela entra logo a seguir ao «Olá» e antes do botão, pela
     * razão que está na nota aqui em cima. O corpo de um modelo é markup
     * opaco; não há onde lá dentro a enfiar sem adivinhar, e despejá-la no fim
     * era pô-la depois do sítio onde muita gente já carregou.
     *
     * Das duas, ganha a mais específica: a mensagem foi escrita há um minuto
     * para este casal; o modelo serve todos. O ecrã dos modelos di-lo.
     */
    /**
     * ══════════════════════════════════════════════════════════════════════
     * O MODELO DELA É UM TEXTO PORTUGUÊS — E FICA DE FORA NUMA PROPOSTA INGLESA
     * ══════════════════════════════════════════════════════════════════════
     *
     * O ecrã «Modelos de email» guarda UM «Proposta enviada», escrito por ela,
     * em português. Não há versão inglesa, e não se inventa uma: traduzir à
     * máquina o texto que ela escreveu é exactamente o que esta funcionalidade
     * se recusa a fazer no documento («o que ela escreveu sai tal e qual»), e
     * fazê-lo aqui era pior — chegava ao casal sem ninguém o ter lido.
     *
     * Restavam duas opções, e nenhuma é indolor:
     *
     *   a) MANDAR O MODELO À MESMA. O casal inglês recebe um assunto e um corpo
     *      em português com um PDF inglês em anexo. É o defeito que se está a
     *      corrigir, a entrar pela porta do lado — e é o que ele vê PRIMEIRO,
     *      antes sequer de abrir o documento.
     *   b) NÃO O USAR, e sair o texto da casa em inglês. Ela perde, naquele
     *      email, um texto que escreveu; ganha um email inteiro numa língua só.
     *
     * Escolhida a (b), por ser a que menos surpreende quem RECEBE — e porque a
     * rota já tem este recurso montado e explicado para dois casos vizinhos: um
     * modelo vazio e um modelo com um marcador sem valor caem no texto da casa
     * exactamente da mesma maneira. Isto é um terceiro «não dá para usar este
     * modelo aqui», não um mecanismo novo.
     *
     * Fica REGISTADO, pela mesma razão que os outros dois: ela guardou um
     * modelo e o email que saiu não foi o dela; isso tem de se poder ver.
     *
     * O que NÃO muda: numa proposta portuguesa — que são todas menos as que ela
     * marcar como inglesas — o modelo dela continua a ser o que sai, assunto
     * incluído.
     *
     * O caminho por direito é o ecrã dos modelos ganhar uma versão inglesa de
     * cada modelo. É trabalho de interface e é uma decisão dela; até lá, isto.
     */
    if (idioma !== "pt" && !mensagem) {
      log.warn(
        "proposta-doc: proposta noutra língua — o modelo «proposta-enviada» não é consultado, sai o texto da casa",
        { id, idioma },
      );
    }
    const doModelo =
      mensagem || idioma !== "pt"
        ? null
        : await modeloParaEnvioAutomatico(
            "proposta-enviada",
            marcadoresDoPedido(quote, {
              // Quem este email saúda são os NOMES DO CASAL do documento do
              // estúdio, e não o `quote.name` — que é quem escreveu o pedido e
              // pode ser a mãe da noiva ou uma wedding planner. É a mesma escolha
              // que o texto da casa aqui em baixo já fazia.
              nome: String(doc.clientNames ?? "").trim(),
              link: acceptUrl,
              valor: eurDocumento(money.gross),
              ...(String(doc.eventDate ?? "").trim()
                ? { data_evento: String(doc.eventDate).trim() }
                : {}),
              ...(String(doc.location ?? "").trim() ? { local: String(doc.location).trim() } : {}),
            }),
          );

    /**
     * O TEXTO DA CASA, NA LÍNGUA DA PROPOSTA.
     *
     * O desenho do email é UM só — o mesmo título, o mesmo cumprimento, o mesmo
     * botão verde, no mesmo sítio. O que muda são as PALAVRAS, e elas vivem no
     * `email-proposta-textos`. Duplicar o markup por língua era garantir que um
     * dia o botão inglês ficava com outra cor, e ninguém dava por isso porque o
     * email inglês é o que ela não lê.
     *
     * O português é, palavra por palavra, o que sempre saiu daqui.
     */
    const t = textosDoEmailDaProposta(idioma);
    const email = doModelo
      ? emailAoCliente({ html: doModelo.html, texto: doModelo.texto })
      : emailAoCliente({
          html: `<h2 style="font-size:18px;margin:0 0 12px">${esc(t.titulo)}</h2>
        <p style="font-size:14px;line-height:1.6">${esc(t.ola)} ${esc(doc.clientNames)},</p>
        ${mensagem ? `${paragrafosDaMensagem(mensagem)}\n        ` : ""}<p style="font-size:14px;line-height:1.6">${esc(t.intro)}</p>
        <p style="margin:24px 0"><a href="${acceptUrl}" style="display:inline-block;background:#637a5f;color:#f7f4ee;text-decoration:none;padding:13px 28px;border-radius:4px;font-size:13px;letter-spacing:0.06em">${esc(t.botao)}</a></p>`,
          texto: [
            t.titulo,
            "",
            `${t.ola} ${doc.clientNames},`,
            "",
            // Tal e qual, com as quebras dela: escapar é uma preocupação de HTML, e
            // aqui só se lhe acrescenta a linha em branco que a separa do resto.
            // A mensagem pessoal não se traduz em língua nenhuma — é dela, como
            // os títulos e as legendas do documento.
            ...(mensagem ? [mensagem, ""] : []),
            t.introEmTexto,
            `${t.verOnline} ${acceptUrl}`,
          ].join("\n"),
        });

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
          // Sem o identificador interno — a mesma decisão da rota irmã
          // (`orcamento/[id]/proposta`), onde está escrita por extenso: o
          // `randomUUID()` da nossa base não é referência de ninguém.
          // O assunto vem do MODELO quando é o modelo que sai — o corpo é dela
          // e a linha que o cliente lê antes de abrir também tem de ser.
          // …e o assunto da CASA vem na língua da proposta, como o corpo: é a
          // única linha que o casal lê antes de decidir se abre.
          subject: doModelo?.assunto ?? t.assunto,
          html: email.html,
          text: email.text,
          // O PDF junta-se aos anexos da assinatura; substituí-los deixava o
          // logótipo de fora e o `cid:` do HTML sem destino.
          attachments: [
            ...email.attachments,
            {
              // O nome do anexo também é a língua da proposta: ela manda as duas
              // versões (a portuguesa aos pais, a inglesa ao casal) e com o mesmo
              // nome a segunda fica «Proposta-Liquen-q1 (1).pdf» na pasta de quem
              // as receba, sem forma de saber qual é qual sem abrir as duas.
              // O NOME é o do casal e o da data do evento, e não o
              // identificador interno do pedido: é este ficheiro que fica na
              // pasta de transferências deles e que é reencaminhado aos pais.
              filename: t.nomeDoAnexo({
                clientNames: doc.clientNames,
                eventDate: doc.eventDate,
                ref: id,
              }),
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

    /**
     * ══════════════════════════════════════════════════════════════════════
     * AGORA SIM: SEGUIU, LOGO ESTÁ «ENVIADA»
     * ══════════════════════════════════════════════════════════════════════
     *
     * Segunda escrita, e de propósito. A primeira teve de ser antes do email
     * (o link assinado que vai no correio tem de encontrar a proposta se o
     * casal carregar nele no segundo seguinte); esta é a única que pode dizer
     * «enviada», porque só aqui é que isso já aconteceu.
     *
     * Se ESTA falhar, a proposta seguiu na mesma e fica marcada como por
     * enviar. É o erro para o lado seguro — mostra menos do que a verdade em
     * vez de mais — mas não é inofensivo: o link do cliente recusa uma
     * proposta que não está em aberto. Por isso grita no registo e volta na
     * resposta, para ela poder reenviá-la (o reenvio reaproveita esta linha, e
     * o casal recebe o mesmo documento).
     */
    let estadoError: string | undefined;
    /** O estado com que a proposta FICOU — é este que a resposta conta. (Uma
     *  variável e não `proposal.status`: o objecto já foi entregue à camada de
     *  gravação, e mudá-lo por baixo dela seria mentir a quem o guardou.) */
    let estado = proposal.status;
    if (emailed) {
      const sentAt = new Date().toISOString();
      try {
        const gravado = await updateProposal(proposal.id, { status: "enviada", sentAt });
        if (!gravado) throw new Error("proposta não encontrada ao marcar como enviada");
        estado = "enviada";
      } catch (e) {
        log.error("proposta-doc: o email saiu mas a proposta ficou por marcar como enviada", e, {
          id,
          proposta: proposal.id,
        });
        estadoError =
          "O email seguiu para o cliente, mas a proposta ficou marcada como «por enviar» — " +
          "a base de dados recusou a actualização. Reenvia-a para acertar o estado (é a mesma " +
          "proposta, não se cria outra).";
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
       *
       * ── E A TRANSIÇÃO SÓ ACONTECE SE O EMAIL SAIU ────────────────────────
       *
       * «Proposta enviada» no Quadro é a mesma afirmação que o estado da
       * proposta faz, vista do outro lado do back office — e era escrita com a
       * mesma cegueira. Um pedido em «Proposta enviada» sobre um email que
       * nunca saiu tira-o da coluna onde ela ia dar por ele, e escreve no
       * histórico uma linha que não é verdade. O PREÇO grava-se na mesma: foi
       * decidido, é dele que vivem a margem e a proposta seguinte, e nada nele
       * depende de o correio ter funcionado.
       */
      await updateQuoteWith(id, (actual) => {
        const transicao = emailed
          ? transicaoDoPedido({
              acontecimento: "proposta_enviada",
              estadoActual: actual.status,
              detalhe: eur(money.gross),
            })
          : null;
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
      /**
       * O estado em que a proposta FICOU. Vai na resposta porque é a resposta a
       * «e agora, o que é que ela vê no quadro?»: com o email fora, é
       * `rascunho` — «Gerada, por enviar» — e não «Enviada, à espera de
       * resposta». Quem chamar esta rota à mão fica a saber o mesmo.
       */
      estado,
      ...(estadoError ? { estadoError } : {}),
      /**
       * O link de aceitação, só quando o email saiu mesmo (`estado ===
       * "enviada"`) — para o botão «Copiar resumo» poder usá-lo já, sem um
       * segundo pedido, mal este envio termine. `null` no caminho "gravada
       * mas sem email": esse link nunca chegou ao casal, e dá-lo ao estúdio
       * era oferecer para colar num WhatsApp um link que ninguém recebeu.
       */
      acceptUrl: estado === "enviada" ? acceptUrl : null,
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
