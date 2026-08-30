import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM ERRO NO TELEMÓVEL DELA DEIXA DE SE PERDER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os erros do SERVIDOR são bem tratados: passam pela redacção do `logger` — que
 * apaga emails, telefones e tokens antes de qualquer coisa sair — e vão parar
 * aos registos da Vercel.
 *
 * Do lado do BROWSER não ia nada a lado nenhum. O transporte para fora está
 * preso a uma variável de ambiente sem `NEXT_PUBLIC_`, portanto é `undefined`
 * no browser, e o `log.error` do ecrã de erro morre na consola do telemóvel.
 *
 * Na prática: se alguma coisa rebentar com ela dentro de uma quinta, a única
 * maneira de eu saber é ela contar-me. E o que ela consegue contar é «rebentou
 * uma coisa ontem» — que não se investiga.
 *
 * ── PORQUE É QUE ISTO NÃO É UM SERVIÇO DE ERROS ───────────────────────────
 *
 * Porque não é preciso, e porque seria pior. Ligar um serviço externo ao
 * browser obriga a uma dependência nova (que ela tem de autorizar), a uma
 * variável de ambiente nova, e — o que decide — manda os erros para fora da
 * casa SEM passarem pela redacção que este projecto já escreveu.
 *
 * Assim, o erro faz uma viagem curta até uma rota nossa e sai daqui pelo mesmo
 * `log.error` de sempre. A rede do RGPD que já existe aplica-se sem se lhe
 * tocar: emails, telefones, tokens de proposta e de portal, tudo redigido
 * antes de chegar aos registos.
 *
 * ── O QUE ENTRA, E OS TECTOS ──────────────────────────────────────────────
 *
 * Só o que serve para investigar: a mensagem, o rasto, a marca do erro, e o
 * endereço onde aconteceu. NÃO entra o estado da página — um formulário de
 * proposta a meio tem lá dentro o nome e o email de um casal, e isso não pode
 * viajar por causa de um erro de desenho.
 *
 * Tectos apertados, porque isto é uma porta que aceita texto: 4 KB de corpo,
 * campos cortados, e um limite de ritmo. Um ecrã em ciclo de erro consegue
 * chamar isto centenas de vezes por minuto — e um registo cheio de mil linhas
 * iguais é tão inútil como um registo vazio.
 *
 * ── E PEDE SESSÃO ─────────────────────────────────────────────────────────
 *
 * Isto é do back office. Uma rota aberta que escreve no registo da casa é um
 * megafone para quem a encontrar.
 */

/** O maior corpo que se aceita. Um rasto de pilha cabe folgadamente. */
const MAX_BYTES = 4 * 1024;

/** Corta um campo ao tamanho e garante que é texto. */
function texto(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const limpo = v.trim();
  return limpo ? limpo.slice(0, max) : undefined;
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  /**
   * Doze por minuto por origem. Chega para um ecrã que rebenta e volta a
   * rebentar depois de duas tentativas, e não chega para encher o registo.
   */
  const limite = await rateLimit(`erro-cliente:${clientIp(request)}`, 12, 60_000);
  if (!limite.ok) {
    // 204 e não 429: quem chama isto está a meio de um erro e não pode ficar
    // com um segundo erro por causa do relato do primeiro. O silêncio aqui é
    // a resposta certa — o que interessava já foi registado nas primeiras doze.
    return new NextResponse(null, { status: 204 });
  }

  try {
    const bruto = await request.text();
    if (bruto.length > MAX_BYTES) {
      return NextResponse.json({ error: "Relato demasiado grande." }, { status: 413 });
    }
    const corpo = JSON.parse(bruto) as Record<string, unknown>;

    const mensagem = texto(corpo.mensagem, 300) ?? "erro sem mensagem";
    const rasto = texto(corpo.rasto, 2000);
    const marca = texto(corpo.marca, 80);
    const onde = texto(corpo.onde, 300);
    const aparelho = texto(corpo.aparelho, 200);

    /**
     * `log.error` e não `warn`: isto É um erro, e é a única maneira de ele
     * chegar aos mesmos sítios onde os erros do servidor já chegam. A
     * redacção do `logger` corre sobre tudo o que vai aqui dentro.
     */
    log.error(`back office no browser: ${mensagem}`, null, {
      marca,
      onde,
      aparelho,
      rasto,
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    // Um relato malformado não merece um 500 nem um registo: seria transformar
    // um erro de alguém num erro nosso.
    return new NextResponse(null, { status: 204 });
  }
}
