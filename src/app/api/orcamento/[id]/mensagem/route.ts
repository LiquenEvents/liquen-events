import { NextRequest, NextResponse } from "next/server";
import type { QuoteMessage } from "@/lib/orcamento/types";
import { transicaoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { getQuote, updateQuote } from "@/lib/quotes-store";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  return isAuthed(request);
}

// Reply to the client by email, from within the dashboard.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <p style="font-size:14px;line-height:1.7;color:#222;white-space:pre-wrap">${esc(message)}</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;color:#777;font-size:12px">
        Líquen Events · ${esc(MAIL_TO)} · ${SITE.phoneDisplay}<br>
        <span style="color:#999">Decoramos eventos, eternizamos memórias.</span>
      </div>
    </div>`;

    /**
     * ════════════════════════════════════════════════════════════════════════
     * UM PEDIDO SEM EMAIL NÃO PODE ENGOLIR A MENSAGEM
     * ════════════════════════════════════════════════════════════════════════
     *
     * Um pedido criado a partir de um TELEFONEMA tem `email: ""` — o «Novo
     * pedido» só exige o nome, e o formulário público aceita «email OU
     * telefone». Com o endereço vazio, o servidor de correio recusa («No
     * recipients defined»), o envio atirava, e a rota devolvia 500 «Erro ao
     * enviar a mensagem» — sem nunca dizer que o que faltava era o email.
     *
     * E o pior não era o erro: a gravação vinha DEPOIS do envio, portanto a
     * mensagem nunca chegava a ser guardada. Ela escrevia, carregava em
     * Enviar, e o histórico do pedido continuava vazio — sem forma nenhuma de
     * registar que já tinha respondido, nem que fosse por telefone.
     *
     * Passa a ser como no envio da proposta, que já resolvia isto: sem
     * destinatário válido não se tenta enviar, a mensagem é GRAVADA na mesma
     * (é o registo de que ela respondeu), e a resposta diz porque é que o
     * email não saiu. O ecrã já sabe mostrar essa frase.
     */
    const temDestinatario = !!quote.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(quote.email);
    const mail = temDestinatario
      ? await sendMail({
          to: quote.email,
          replyTo: MAIL_TO,
          subject: `Líquen Events — sobre o seu pedido (${id})`,
          html,
          text: message,
        })
      : { sent: false as const };
    const emailError = temDestinatario
      ? undefined
      : "Este pedido não tem email — a mensagem ficou registada, mas não foi enviada. " +
        "Acrescenta o email do cliente para lhe poderes escrever daqui.";

    const newMessage: QuoteMessage = { at: new Date().toISOString(), body: message };
    const messages = [...(quote.messages ?? []), newMessage];

    /**
     * ════════════════════════════════════════════════════════════════════════
     * RESPONDER MUDA O ESTADO — A BOLA PASSA PARA O LADO DE LÁ
     * ════════════════════════════════════════════════════════════════════════
     *
     * Enviar uma mensagem só acrescentava uma linha ao histórico. O pedido
     * ficava em «Novo» na lista, indistinguível de um que tinha acabado de
     * chegar e ao qual ninguém tinha tocado — e a única forma de saber que já
     * se tinha respondido era abrir o pedido e ler o histórico.
     *
     * Passa a subir para `em_revisao`, que é o estado agora rotulado
     * **«Aguardar resposta»**: já respondemos, falta o cliente responder.
     *
     * ── PORQUE É QUE SÓ SOBE DE «pendente» ────────────────────────────────
     *
     * Um pedido que já tem proposta enviada (`cotado`), que já foi ganho
     * (`aceite`) ou perdido (`rejeitado`) NÃO volta para trás por causa de uma
     * mensagem. Mandar uma nota a um casamento já fechado não o desfecha — e um
     * estado que anda para trás sozinho é a maneira mais rápida de ela deixar de
     * confiar na coluna.
     *
     * Um pedido que já esteja em «Aguardar resposta» também não muda: já lá
     * está, e reescrever o mesmo valor só serviria para mexer no `lastUpdated`.
     *
     * ── PORQUE É QUE A REGRA JÁ NÃO ESTÁ ESCRITA AQUI ─────────────────────
     *
     * Era uma linha (`quote.status === "pendente"`) e estava certa. Mas passou
     * a haver mais meia dúzia de sítios que também têm de mexer no estado —
     * emitir uma factura, registar um pagamento, guardar o contrato — e cada um
     * a escrever a sua versão da regra é como se chega a seis regras
     * diferentes, sendo a sexta a que faz um casamento ganho voltar atrás.
     *
     * A decisão mudou-se inteira para `@/lib/orcamento/estado-do-pedido`, com
     * testes próprios. O comportamento aqui é exactamente o mesmo, mais uma
     * coisa que faltava: a mudança passa a deixar uma LINHA NO HISTÓRICO. Sem
     * ela, ela via a coluna mudar sozinha e não tinha onde ir ver porquê.
     */
    const transicao = transicaoDoPedido({
      acontecimento: "mensagem_enviada",
      estadoActual: quote.status,
    });
    const updated = await updateQuote(id, {
      messages,
      ...(transicao
        ? {
            status: transicao.status,
            activityLog: [...(quote.activityLog ?? []), transicao.entrada],
          }
        : {}),
    });

    return NextResponse.json({
      ok: true,
      emailed: mail.sent,
      ...(emailError ? { emailError } : {}),
      quote: updated,
    });
  } catch (err) {
    log.error("mensagem POST falhou", err);
    return NextResponse.json({ error: "Erro ao enviar a mensagem" }, { status: 500 });
  }
}
