import "server-only";
import type { Proposal } from "@/lib/orcamento/types";
import { getProposal, listProposalsForQuote } from "@/lib/proposals-store";
import { getAcceptedContractByQuote } from "@/lib/contracts-store";
import { readProposalToken } from "@/lib/proposal-token";
import { estadoDaVersao, seloDoConteudo, type EstadoDaVersao } from "@/lib/proposta-versao";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LINK DO CASAL SEGUE O PEDIDO, NÃO A LINHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Se eu ajustar o preço ou os serviços, o casal vê a versão
 * atual **sem eu reenviar nada**.»
 *
 * Não era o que acontecia, e a razão é de arquitectura. O token guarda um
 * `pid` — o identificador de UMA proposta (`proposal-token.ts`) — e uma
 * revisão nesta casa é uma proposta NOVA («uma proposta que já seguiu para o
 * casal nunca é reescrita», na rota do estúdio). O link que está na caixa de
 * correio do casal apontava, portanto, para a versão 1 até ao fim dos tempos:
 * ela corrigia o preço, gerava a revisão, e o casal continuava a abrir o link
 * antigo e a ler o preço antigo. Sem nada em lado nenhum a dizê-lo.
 *
 * Este ficheiro é a resolução, num sítio só, porque são TRÊS as portas que a
 * fazem — a página, o PDF e as fotografias. Três respostas diferentes davam
 * uma página a mostrar a versão 2 com um botão que descarregava a 1.
 *
 * ── PORQUE É QUE ISTO NÃO ABRE UM BURACO ──────────────────────────────────
 *
 * O token continua a autorizar exactamente o que autorizava: UM pedido, o de
 * quem o recebeu. Só se salta para outra linha quando as três coisas se
 * verificam ao mesmo tempo:
 *
 *   1. é do MESMO pedido (`quoteId` igual, e não vazio — `quote_id` é
 *      `on delete set null`, portanto vazio é um estado real e não pode
 *      emparelhar com vazio);
 *   2. é do MESMO cliente (`clientEmail` igual, os dois preenchidos) — a
 *      defesa em profundidade que já existe no portal, para uma ligação mal
 *      feita na base nunca poder revelar a proposta de outra pessoa;
 *   3. JÁ FOI OFERECIDA a alguém (`status !== "rascunho"`). Esta é a que
 *      protege o trabalho dela: um rascunho de revisão a meio de ser escrito
 *      não pode aparecer ao casal enquanto ela está a pensar. O que ela ainda
 *      não enviou não existe do lado de lá.
 *
 * Sem as três, fica-se na proposta do token — que é exactamente o que a
 * aplicação fazia antes deste ficheiro.
 *
 * ── E O ACEITE MANDA EM TUDO ──────────────────────────────────────────────
 *
 * «Se a proposta já foi aceite, o que foi aceite fica congelado e imutável.»
 * Havendo aceite no pedido, é a proposta ACEITE que se mostra — nunca a mais
 * recente. Uma revisão posterior é uma versão nova, que precisa de um aceite
 * novo (Fase 4); até lá o casal continua a ver o que disse que sim.
 */

export interface PropostaDoLink {
  /** A proposta a mostrar — já resolvida por todas as regras acima. */
  proposta: Proposal;
  /** A proposta para que o token foi emitido (pode ser a mesma). */
  doToken: Proposal;
  /** Se houve mesmo um salto para uma revisão mais recente. */
  seguiu: boolean;
  /** O selo do conteúdo que está a ser mostrado. */
  selo: string;
  estado: EstadoDaVersao;
  /** O número que se diz em voz alta. `undefined` nas anteriores à coluna. */
  versao?: number;
  /** ISO — quando o conteúdo mudou pela última vez. */
  versaoEm?: string;
}

/** Dois emails são do mesmo cliente quando existem os dois e são iguais. */
function mesmoCliente(a: string | undefined, b: string | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase();
  const y = (b ?? "").trim().toLowerCase();
  return !!x && x === y;
}

/**
 * A proposta que o link deve mostrar, e em que versão está.
 *
 * Devolve `null` quando o token não vale ou a proposta desapareceu — os
 * chamadores já tratam esses dois casos com a mesma frase, de propósito (um
 * link privado nunca diz se um identificador existe).
 */
export async function propostaDoLink(
  token: string | undefined | null,
): Promise<PropostaDoLink | null> {
  const claim = readProposalToken(token);
  if (!claim) return null;

  const doToken = await getProposal(claim.proposalId);
  if (!doToken) return null;

  let proposta = doToken;
  let seguiu = false;

  /**
   * Melhor esforço declarado: uma leitura que falhe (base em baixo, tabela por
   * criar) NÃO pode deitar abaixo a página da proposta. Fica-se na linha do
   * token — o comportamento de sempre — e escreve-se o aviso.
   */
  try {
    const quoteId = (doToken.quoteId ?? "").trim();
    if (quoteId) {
      const aceite = await getAcceptedContractByQuote(quoteId);
      if (aceite?.proposalId && aceite.proposalId !== doToken.id) {
        const aceitada = await getProposal(aceite.proposalId);
        if (
          aceitada &&
          (aceitada.quoteId ?? "").trim() === quoteId &&
          mesmoCliente(aceitada.clientEmail, doToken.clientEmail)
        ) {
          proposta = aceitada;
          seguiu = true;
        }
      } else if (!aceite) {
        const irmas = await listProposalsForQuote(quoteId);
        const candidata = irmas
          .filter(
            (p) =>
              p.id !== doToken.id &&
              (p.quoteId ?? "").trim() === quoteId &&
              mesmoCliente(p.clientEmail, doToken.clientEmail) &&
              p.status !== "rascunho" &&
              +new Date(p.createdAt) > +new Date(doToken.createdAt),
          )
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
        if (candidata) {
          proposta = candidata;
          seguiu = true;
        }
      }
    }
  } catch (e) {
    log.warn("proposta-do-link: não deu para procurar a versão atual", {
      proposta: doToken.id,
      erro: e,
    });
  }

  const selo = proposta.versaoSelo || seloDoConteudo(proposta);
  return {
    proposta,
    doToken,
    seguiu,
    selo,
    // O selo do que foi aceite ainda não é gravado — é a peça seguinte da Fase
    // 2. Enquanto não for, uma proposta com aceite lê-se como «em vigor», que
    // é o que a aplicação já dizia; nunca como «revista», que seria inventar
    // um aviso sem prova nenhuma por baixo.
    estado: estadoDaVersao(selo, undefined),
    versao: proposta.versaoNumero,
    versaoEm: proposta.versaoEm,
  };
}
