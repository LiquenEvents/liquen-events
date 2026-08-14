import { randomBytes } from "crypto";
import { updateQuoteWith } from "./quotes-store";
import { buildProductionPlanItems } from "./production-templates";
import { checklistTemplate } from "./checklist-templates";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANDO UM PEDIDO É GANHO, A PRODUÇÃO ARRANCA PREENCHIDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sem isto o separador Produção começava vazio e a equipa reconstruía o mesmo
 * plano à mão de cada vez. Semeia-se do mesmo template que o ecrã usa, para o
 * que o servidor escreve ser igual ao que ela escreveria.
 *
 * ── PORQUE É QUE ISTO MUDOU DE CASA ───────────────────────────────────────
 *
 * Vivia dentro da rota que o CLIENTE chamava ao carregar em «Aceitar proposta»
 * — o botão que a dona da casa mandou tirar, porque um casamento não se fecha
 * num botão. Com o botão fora, a proposta passa a ser aceite pela conversa: o
 * casal responde por email ou por telefone, e alguém marca o pedido como
 * «Ganho» no back office.
 *
 * Se esta lógica tivesse ido abaixo com a rota, marcar «Ganho» à mão deixava a
 * produção vazia — a equipa perdia uma coisa que já tinha, e ninguém ligaria a
 * perda ao botão que desapareceu. Por isso mudou de casa em vez de morrer.
 *
 * ── AS TRÊS PROMESSAS ─────────────────────────────────────────────────────
 *
 *  1. **Idempotente.** Só preenche o que está VAZIO. Marcar «Ganho» duas vezes,
 *     ou corrigir o estado para trás e para a frente, não duplica uma tarefa.
 *  2. **Não pisa trabalho.** Um plano que a equipa já tenha escrito fica
 *     exactamente como está.
 *  3. **Melhor esforço.** Quem chama trata isto como acessório: gravar o estado
 *     do pedido tem de resultar mesmo que a sementeira falhe. O que se perde é
 *     uma lista pré-preenchida, não o negócio.
 *
 * Fornecedores NÃO são semeados: a proposta não tem uma lista estruturada de
 * categorias que se possa mapear — só linhas em texto livre —, e semear
 * fornecedores a partir daí era adivinhar.
 */
export async function semearProducaoAoGanhar(quoteId: string, quando: string): Promise<void> {
  await updateQuoteWith(quoteId, (quote) => {
    const semeado: string[] = [];

    let productionPlan = quote.productionPlan;
    if (!productionPlan?.length) {
      productionPlan = buildProductionPlanItems(() => randomBytes(4).toString("hex"));
      semeado.push(`plano de produção decor (${productionPlan.length} tarefas)`);
    }

    let checklist = quote.checklist;
    if (!checklist?.length) {
      checklist = checklistTemplate(quote.category).map((label) => ({
        id: randomBytes(4).toString("hex"),
        label,
        done: false,
      }));
      semeado.push(`checklist do evento (${checklist.length} itens)`);
    }

    // Já tinha tudo: devolve-se o pedido intacto, sem entrada no histórico.
    // Uma linha a dizer «não semeei nada» seria ruído em cada gravação.
    if (semeado.length === 0) return quote;

    return {
      ...quote,
      productionPlan,
      checklist,
      activityLog: [
        ...(quote.activityLog ?? []),
        {
          id: randomBytes(4).toString("hex"),
          at: quando,
          kind: "note_added" as const,
          actor: "Sistema",
          summary: `Produção pré-preenchida ao marcar como ganho: ${semeado.join(" · ")}`,
        },
      ],
    };
  });
}
