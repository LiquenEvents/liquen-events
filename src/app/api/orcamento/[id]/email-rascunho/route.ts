import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { rascunhoDoEnvio, valoresDoEnvio } from "@/lib/email-rascunho-do-envio";
import { MODELO_POR_OMISSAO } from "@/lib/email-modelos-rascunho";
import { assinaturaDeQuemEnvia } from "@/lib/email-quem-assina";
import { assinanteDoEmail } from "@/lib/email-assinatura";
import { listarModelos, type IdiomaDoModelo } from "@/lib/email-templates-store";
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import { resolveValidUntil, withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";
import { depositPercentOf } from "@/lib/proposal-doc";
import { getQuote } from "@/lib/quotes-store";
import { getAcceptedContractByQuote } from "@/lib/contracts-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O ECRÃ DE ENVIO PRECISA DE SABER ANTES DE ALGUÉM CARREGAR EM ENVIAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Devolve o corpo do modelo escolhido JÁ RESOLVIDO com os dados desta proposta,
 * quem recebe, quem assina, a lista de modelos por onde trocar, e as variáveis
 * que ficaram vazias à vista. Nada disto envia, grava ou toca no modelo.
 *
 * ── PORQUE É QUE ISTO É UM POST E NÃO UM GET ──────────────────────────────
 *
 * Não muda nada no servidor — é uma leitura, e um GET seria o verbo natural.
 * Mas o que se resolve não é o PEDIDO: é o DOCUMENTO que está no estúdio neste
 * momento, e que ainda não é uma proposta gravada em lado nenhum. O casal
 * chama-se o que a capa diz (que pode não ser quem escreveu o pedido), o valor
 * é o que a folha soma agora, a validade é a que este documento tem. Já existe
 * uma rota que faz isto a partir do pedido — `/api/email-templates/rascunho`,
 * do ecrã dos modelos — e é por isso que ela não serve aqui: ali o que se quer
 * ver é o modelo com um caso real; aqui é o email que vai mesmo sair.
 *
 * O documento é grande de mais para um URL, e mandá-lo por GET era a mesma
 * decisão que a pré-visualização do PDF já tomou (`proposta-doc`, modo
 * `preview`): POST porque o corpo é o dado, não porque haja efeito nenhum.
 *
 * ── E PORQUE É QUE O REMETENTE NÃO VEM NO CORPO ───────────────────────────
 *
 * Quem assina lê-se do cookie assinado da sessão e de mais lado nenhum
 * (`email-quem-assina.ts`). Aceitá-lo do corpo do pedido era deixar qualquer
 * pessoa com sessão pôr o nome de outra debaixo de um email — a mesma razão
 * por que a rota do envio já o lê assim.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const quote = await getQuote(id);
    if (!quote) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    const body = (await request.json().catch(() => null)) as {
      modelo?: unknown;
      idioma?: unknown;
      doc?: ProposalDoc;
      mensagem?: unknown;
    } | null;

    const chave = String(body?.modelo ?? "").trim() || MODELO_POR_OMISSAO;
    const idioma: IdiomaDoModelo = body?.idioma === "en" ? "en" : "pt";
    const mensagem = typeof body?.mensagem === "string" ? body.mensagem.trim() : "";

    /**
     * O documento é opcional. Sem ele o rascunho sai com o que o PEDIDO sabe —
     * é o que acontece a quem chame esta rota à mão, e a um estúdio que ainda
     * não tenha escrito nada. Um ecrã de envio que se recusasse a abrir por
     * causa da forma do documento seria pior do que um que abre com o nome do
     * pedido em vez do nome da capa.
     */
    const doc = body?.doc && typeof body.doc === "object" ? withProposalDefaults(body.doc) : null;
    const money = doc ? dinheiroDaProposta(doc) : null;

    const clientNames = String(doc?.clientNames ?? "").trim() || String(quote.name ?? "");
    const valores = valoresDoEnvio({
      clientNames,
      emailDoCliente: String(quote.email ?? "").trim(),
      tipoDeEvento: quote.eventType ?? undefined,
      /**
       * A data vem do PEDIDO e não do documento, e a razão é a forma: o
       * `doc.eventDate` do estúdio é texto já por extenso e escrito à mão («3
       * de julho de 2027», «Julho de 2027», «a definir»), enquanto o catálogo
       * de variáveis quer uma data ISO para a poder escrever na LÍNGUA de quem
       * lê o email. Adivinhar a data a partir da frase dela era inventar; um
       * pedido sem data dá vazio, e os modelos têm o `{{#se evento_data}}`
       * escrito precisamente para esse caso.
       */
      dataIso: String(quote.date ?? ""),
      local: String(doc?.location ?? "").trim() || String(quote.location ?? ""),
      totalComIva: money?.gross,
      validadeIso: doc ? resolveValidUntil(doc) : undefined,
      sinalPercentagem: doc ? depositPercentOf(doc) : undefined,
      mensagemPessoal: mensagem,
      remetente: assinanteDoEmail({ ...assinaturaDeQuemEnvia(request) }).nome,
      idioma,
    });

    const rascunho = await rascunhoDoEnvio({ chave, idioma, valores });
    if ("erro" in rascunho) {
      // 409 e não 400: o pedido está bem formado e o servidor fez o trabalho —
      // o que falta é um modelo escrito. O ecrã mostra a frase e continua a
      // oferecer os outros, em vez de ficar em branco.
      return NextResponse.json({ error: rascunho.erro, modeloEmFalta: chave }, { status: 409 });
    }

    /**
     * ══════════════════════════════════════════════════════════════════════
     * ESTE PEDIDO JÁ TEM UMA PROPOSTA ACEITE
     * ══════════════════════════════════════════════════════════════════════
     *
     * Regra dela, na Fase 2: «se a proposta já foi aceite, o que foi aceite
     * fica congelado e imutável — alterações posteriores geram uma nova
     * versão, que tem de ser aceite de novo».
     *
     * O congelamento está feito (`proposta-do-link.ts`), e cria uma coisa que
     * ela tem de saber ANTES de carregar em enviar: a revisão que está
     * prestes a sair NÃO substitui o que o casal aceitou. Sem esta linha, ela
     * envia a versão 3, o casal abre o link e vê a versão 1 — e ninguém
     * percebe porquê.
     *
     * Vai nos avisos que o ecrã de envio já desenha, e é melhor esforço: uma
     * leitura que falhe não pode travar o ecrã onde a proposta é enviada.
     */
    try {
      const aceite = await getAcceptedContractByQuote(id);
      if (aceite) {
        const qual = aceite.propostaVersaoNumero
          ? `a versão ${aceite.propostaVersaoNumero}`
          : "uma versão anterior";
        rascunho.rascunho.avisos = [
          ...(rascunho.rascunho.avisos ?? []),
          `Este pedido já tem uma proposta ACEITE (${qual}). O casal continua a ver ` +
            `o que aceitou — enviar esta revisão não altera isso, e o novo aceite tem de ` +
            `ser combinado convosco.`,
        ];
      }
    } catch (e) {
      log.warn("email-rascunho: não deu para saber se o pedido já tem aceite", { id, erro: e });
    }

    // A lista viaja com o rascunho para a troca de modelo ser instantânea: uma
    // segunda ida à rede a cada clique fazia uma escolha rápida parecer lenta.
    // Uma falha a lê-la não pode travar o ecrã — fica-se com o modelo que abriu.
    const modelos = await listarModelos().catch(() => []);

    return NextResponse.json({
      ...rascunho,
      porOmissao: MODELO_POR_OMISSAO,
      /**
       * Quem assina, para o ecrã o poder MOSTRAR — é o mesmo nome que vai
       * parar debaixo do email, e vê-lo antes de enviar é metade do pedido.
       *
       * Passa pelo `assinanteDoEmail` e não pelo nome cru da sessão: é ELE que
       * decide o que vai ser impresso, incluindo a queda para a assinatura da
       * casa. Sem isto, o ecrã mostrava um nome e o email levava outro — e foi
       * assim que «Liquen Alentejo» chegou a uma cliente sem ninguém o ver
       * antes.
       */
      remetente: assinanteDoEmail({ ...assinaturaDeQuemEnvia(request) }).nome,
      destinatario: { nome: clientNames, email: String(quote.email ?? "").trim() },
      modelos: modelos.map((m) => ({
        chave: m.chave,
        nome: m.nome,
        descricao: m.descricao,
        temEsteIdioma: !!m[idioma].subject.trim() || !!m[idioma].body.trim(),
      })),
    });
  } catch (err) {
    log.error("email-rascunho do envio falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
