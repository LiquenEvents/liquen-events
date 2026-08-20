import { NextResponse } from "next/server";
import { propostaDoLink } from "@/lib/proposta-do-link";
import { pdfDaPropostaEmCache, PropostaIncompleta } from "@/lib/proposal-pdf-cache";
import { idiomaDaProposta } from "@/lib/proposta-idioma";
import { nomeDoFicheiroDaProposta } from "@/lib/email-proposta-textos";
import { respostaPdf } from "@/lib/pdf-resposta";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

// pdf-lib + sharp precisam do runtime Node.
export const runtime = "nodejs";
// Teto de uma geração, para um documento grande não prender um worker.
export const maxDuration = 20;

/**
 * O PDF da proposta, servido pelo MESMO link assinado que o casal usa para a
 * aceitar (/[lang]/proposta/[token]).
 *
 * PORQUÊ existe. O PDF seguia em anexo no email e mais nada: na página onde se
 * decide gastar milhares de euros não havia forma de o voltar a ver. Quem
 * arquivasse o email, ou o abrisse no telemóvel de outra pessoa, tinha de pedir
 * a proposta outra vez para poder aceitá-la.
 *
 * Modelo de confiança: o token HMAC É a autorização, tal como no aceite
 * (POST /api/proposta) — ele só serve a proposta para a qual foi emitido, não
 * há nada a enumerar nem a forjar, e ver o documento é estritamente MENOS do
 * que o que esse mesmo token já permite fazer (aceitar).
 *
 * 404 (nunca 401/403) para tudo o que falhe — token inválido ou expirado,
 * proposta apagada, ou proposta antiga sem documento guardado — para um link
 * nunca revelar se um id existe.
 *
 * Serve a proposta do token INDEPENDENTEMENTE do estado: expirada ou já
 * respondida, o cliente continua a poder rever o documento que lhe foi
 * apresentado (a página já lhe explica que não pode responder). O que ele
 * recebe é sempre o documento DESTA proposta, nunca o de uma revisão mais
 * recente que ele não viu.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Desenhar re-codifica todas as fotos (pdf-lib + sharp) — é caro. O token
  // vive 14 dias na caixa de correio do cliente e é reencaminhável, por isso
  // limita-se por IP para um link na mão de alguém não poder ser repetido em
  // ciclo até esgotar CPU/memória. Mesmo teto do PDF do portal.
  const limited = await rateLimit(`proposta-pdf:${clientIp(request)}`, 12, 60_000);
  if (!limited.ok) return new NextResponse(null, { status: 429 });

  /** Só para o registo do `catch`: qual proposta é que estava a ser desenhada. */
  let idParaRegisto = "";
  try {
    /**
     * A MESMA proposta que a página mostra — ver `proposta-do-link.ts`. O link
     * segue o PEDIDO e não a linha, portanto uma revisão que ela envie chega
     * ao casal pelo link que ele já tem. Resolver aqui de outra maneira dava a
     * página na versão 2 com um botão que descarregava a 1.
     */
    const doLink = await propostaDoLink(token);
    const proposal = doLink?.proposta;
    idParaRegisto = proposal?.id ?? "";
    // Sem documento guardado não há PDF nenhum para servir: é o caso das
    // propostas anteriores à coluna `proposals.doc` e das propostas de linhas
    // criadas em /api/propostas. A página do cliente esconde o botão nesse
    // caso; isto fecha a mesma porta do lado do servidor.
    if (!proposal?.doc) return new NextResponse(null, { status: 404 });

    /**
     * ── NA LÍNGUA EM QUE A PROPOSTA FOI FEITA, E NÃO NA DE QUEM PEDE ────────
     *
     * Este botão REDESENHA o documento a partir do `doc` guardado. Enquanto a
     * língua não ficava gravada com a proposta, quem redesenhava não tinha como
     * a saber e caía em português: o casal inglês recebia a proposta inglesa por
     * email e, ao carregar no botão da página onde a aceita, abria a
     * portuguesa — o mesmo documento em duas línguas, sem explicação.
     *
     * Não se olha para a língua do VISITANTE (nem para o segmento da rota, nem
     * para o cookie): o que este link serve é um documento que já existe e que
     * já foi apresentado numa língua. Quem o reencaminhar para um amigo
     * português continua a ver o documento que o casal recebeu.
     *
     * Uma proposta sem língua gravada é portuguesa — ver `idiomaDaProposta`.
     */
    const idioma = idiomaDaProposta(proposal);
    const pdf = await pdfDaPropostaEmCache(proposal.doc, idioma);
    // O nome do ficheiro vai dentro de um cabeçalho: saneia-se a referência
    // (aspas, espaços, acentos) em vez de a confiar tal como está gravada.
    const ref = (proposal.quoteId || proposal.id).replace(/[^A-Za-z0-9_-]/g, "");
    // `Content-Length`, pedaços e `ETag` — a razão está em `pdf-resposta.ts`.
    // O NOME é o mesmo com que o ficheiro seguiu no email: o casal tem-no na
    // caixa de correio e tem de reconhecer o que descarrega como o mesmo.
    return respostaPdf(request, pdf, {
      nome: nomeDoFicheiroDaProposta(
        {
          clientNames: proposal.doc?.clientNames,
          eventDate: proposal.doc?.eventDate,
          ref,
        },
        idioma,
      ),
    });
  } catch (err) {
    /**
     * A PROPOSTA SAIRIA COM FOTOS A MENOS — e por isso não sai.
     *
     * 503 e não 500: isto tem conserto e é temporário. O `Retry-After` diz ao
     * leitor de PDF do cliente para voltar, e o registo do lado de lá
     * (`proposal-storage`: «imagem não resolveu») diz QUAL foto e porquê.
     *
     * Um ficheiro com buracos era o que saía antes, calado. Um casal a ver uma
     * proposta a que faltam duas fotografias não sabe que faltam — a moldura
     * simplesmente não existe.
     */
    if (err instanceof PropostaIncompleta) {
      log.error("proposta pdf: recusado, o documento sairia incompleto", null, {
        proposalId: idParaRegisto,
        emFalta: err.emFalta,
      });
      return new NextResponse(null, { status: 503, headers: { "Retry-After": "30" } });
    }
    log.error("proposta pdf GET falhou", err, { proposalId: idParaRegisto });
    return new NextResponse(null, { status: 500 });
  }
}
