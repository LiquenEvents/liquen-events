import { NextRequest, NextResponse } from "next/server";
import { isAuthed, ADMIN_NAME_COOKIE } from "@/lib/admin-auth";
import { cortarLinksDoPedido, corteDoPedido } from "@/lib/links-cortados";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ALAVANCA QUE CORTA OS LINKS JÁ ENVIADOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O caso real: ela envia a proposta e dá-se conta de que o preço está errado,
 * ou o casal reencaminhou o link a meia família. Até aqui não havia nada a
 * fazer — o `proposta-link-curto.ts` escreveu-o quando nasceu: «a única
 * maneira de invalidar um link era rodar o segredo da casa — o que punha toda
 * a equipa fora do back office e matava, ao mesmo tempo, os links de TODOS os
 * casais. Na prática, não se fazia.»
 *
 * O corte é por PEDIDO e é um carimbo de tempo. O porquê das duas coisas está
 * escrito em `links-cortados.ts`, e resume-se numa frase: **morre o que foi
 * emitido antes do corte**, portanto o endereço que ela cunhar a seguir nasce
 * vivo sem ninguém ter de desligar nada.
 *
 * ── PORQUE É QUE ESTA ROTA NÃO TEM «DESCORTAR» ────────────────────────────
 *
 * Porque não é preciso, e porque um botão a desfazer isto seria pior do que
 * não haver botão nenhum. Cortar existe para o caso em que um endereço chegou
 * a mãos erradas; «voltar a abrir» devolveria a vida a esse mesmo endereço, e
 * ninguém sabe onde ele já anda. A maneira de dar acesso outra vez é a que ela
 * já usa todos os dias: enviar a proposta, que cunha um endereço novo — um
 * acto deliberado, com o email a acompanhar, e que o corte anterior não toca.
 */

/** Quem cortou, para o registo. Um nome de login, não identidade. */
function quemCorta(request: NextRequest): string | undefined {
  const raw = request.cookies?.get?.(ADMIN_NAME_COOKIE)?.value?.trim();
  return raw ? raw.slice(0, 40) : undefined;
}

/** O estado do corte deste pedido — para o botão poder dizer o que já houve. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const corte = await corteDoPedido(id);
    return NextResponse.json({ ok: true, corte });
  } catch (err) {
    log.error("links GET falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Corta os links deste pedido.
 *
 * ── E RESPONDE 503 QUANDO NÃO CONSEGUIU CORTAR ────────────────────────────
 *
 * É o mesmo desenho da gravação do rascunho, e pela mesma razão, que aqui pesa
 * ainda mais: dizer «cortado» a quem carregou no botão, quando o carimbo não
 * ficou gravado, é mandá-la seguir a vida a pensar que fechou uma porta que
 * continua aberta. Um 503 com a frase por escrito é a única resposta honesta.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  if (!String(id ?? "").trim()) {
    return NextResponse.json({ error: "Pedido em falta." }, { status: 400 });
  }
  try {
    const { corte, persistencia } = await cortarLinksDoPedido(id, quemCorta(request));
    if (!persistencia.gravado) {
      return NextResponse.json(
        {
          ok: false,
          cortado: false,
          erro:
            "Não consegui cortar: o armazenamento recusou a escrita, e os links " +
            "continuam a abrir. Tenta outra vez daqui a pouco.",
        },
        { status: 503 },
      );
    }
    log.info("links cortados", { pedido: id, por: corte.por });
    return NextResponse.json({ ok: true, cortado: true, corte });
  } catch (err) {
    log.error("links POST falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
