import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE, isAuthed, readSession } from "@/lib/admin-auth";
import { isMissingTable, isPersistenceUnavailable } from "@/lib/repository";
import { MAX_DEVICE_LABEL, removePasskeyOwnedBy, renamePasskeyOwnedBy } from "@/lib/passkeys-store";
import { firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Remover (DELETE) ou renomear (PATCH) um dispositivo.
 *
 * O dono é verificado no store, não aqui — o id vem do cliente, e sem essa
 * verificação bastava conhecer o id da credencial de outra pessoa para lha
 * apagar. Apagar a última credencial de alguém é trancá-lo fora.
 *
 * Não existe "remover tudo": quem quiser pôr toda a gente fora de uma vez usa
 * o `SESSION_VERSION`, que é a alavanca desenhada para isso e que também mata
 * as sessões já abertas — coisa que apagar credenciais não faz.
 */

/** A conta com sessão aberta, ou null. A mesma verificação nos dois métodos. */
function contaAutenticada(req: NextRequest): string | null {
  if (!isAuthed(req)) return null;
  const conta = readSession(req.cookies.get(ADMIN_COOKIE)?.value)?.name?.trim();
  return conta ? conta : null;
}

const renomearSchema = z.object({
  deviceLabel: z.string().trim().min(1).max(MAX_DEVICE_LABEL),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const conta = contaAutenticada(req);
  if (!conta) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Dispositivo não indicado" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const parsed = renomearSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  try {
    const mudou = await renamePasskeyOwnedBy(
      decodeURIComponent(id),
      conta,
      parsed.data.deviceLabel,
    );
    // A MESMA resposta para «não existe» e «não é teu», como no DELETE: separá-las
    // dizia a estranhos que ids existem.
    if (!mudou) {
      return NextResponse.json({ error: "Dispositivo não encontrado." }, { status: 404 });
    }
    log.info("passkeys: dispositivo renomeado", { conta });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isMissingTable(err) || isPersistenceUnavailable(err)) {
      return NextResponse.json(
        { error: "A base de dados não está disponível nesta instalação." },
        { status: 503 },
      );
    }
    log.error("passkeys: renomear falhou", { err });
    return NextResponse.json({ error: "Não foi possível mudar o nome." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const conta = contaAutenticada(req);
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
