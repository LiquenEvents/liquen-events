import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAuthed, readSession } from "@/lib/admin-auth";
import { isMissingTable, isPersistenceUnavailable } from "@/lib/repository";
import { removePasskeyOwnedBy } from "@/lib/passkeys-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Remover um dispositivo.
 *
 * O dono é verificado no store, não aqui — o id vem do cliente, e sem essa
 * verificação bastava conhecer o id da credencial de outra pessoa para lha
 * apagar. Apagar a última credencial de alguém é trancá-lo fora.
 *
 * Não existe "remover tudo": quem quiser pôr toda a gente fora de uma vez usa
 * o `SESSION_VERSION`, que é a alavanca desenhada para isso e que também mata
 * as sessões já abertas — coisa que apagar credenciais não faz.
 */

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const conta = readSession(req.cookies.get(ADMIN_COOKIE)?.value)?.name?.trim();
  if (!conta) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Dispositivo não indicado" }, { status: 400 });

  try {
    const removido = await removePasskeyOwnedBy(decodeURIComponent(id), conta);
    if (!removido) {
      return NextResponse.json({ error: "Dispositivo não encontrado." }, { status: 404 });
    }
    log.info("passkeys: dispositivo removido", { conta });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isMissingTable(err) || isPersistenceUnavailable(err)) {
      return NextResponse.json(
        { error: "A base de dados não está disponível nesta instalação." },
        { status: 503 },
      );
    }
    log.error("passkeys: remoção falhou", { err });
    return NextResponse.json({ error: "Não foi possível remover." }, { status: 500 });
  }
}
