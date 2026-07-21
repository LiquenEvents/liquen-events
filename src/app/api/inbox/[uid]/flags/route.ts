import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/admin-auth";
import { imapConfigured, setFlags } from "@/lib/inbox";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Toggle durable, REVERSIBLE IMAP flags on a message: `\Seen` (read/unread) and
 * `\Flagged` (star). Both are standard and Gmail-safe. This endpoint never
 * deletes or expunges anything.
 */
const flagsSchema = z
  .object({
    seen: z.boolean().optional(),
    flagged: z.boolean().optional(),
  })
  .refine((b) => b.seen !== undefined || b.flagged !== undefined, {
    message: "Indique 'seen' e/ou 'flagged'.",
  });

export async function POST(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!imapConfigured()) {
    return NextResponse.json({ error: "E-mail não configurado." }, { status: 503 });
  }

  const { uid } = await params;
  const uidNum = Number(uid);
  if (!Number.isInteger(uidNum) || uidNum <= 0) {
    return NextResponse.json({ error: "UID inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo do pedido inválido (JSON malformado)." },
      {
        status: 400,
      },
    );
  }
  const parsed = flagsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Indique 'seen' e/ou 'flagged' (booleanos)." },
      {
        status: 400,
      },
    );
  }

  try {
    const applied = await setFlags(uidNum, parsed.data);
    return NextResponse.json({ ok: true, ...applied });
  } catch (err) {
    log.error("inbox flags POST falhou", err);
    return NextResponse.json({ error: "Não foi possível atualizar o e-mail." }, { status: 502 });
  }
}
