import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { oQueEstaNaReciclagem } from "@/lib/reciclagem";
import { isMissingTable } from "@/lib/repository";
import { log } from "@/lib/logger";

/**
 * A Reciclagem: o que se apagou nos últimos 30 dias, o mais recente primeiro.
 * Ver `src/lib/reciclagem.ts`.
 *
 * Sem a tabela (a migração ainda não correu) não é uma avaria: responde-se
 * `ligada: false`, e o ecrã diz que a Reciclagem ainda não está ligada.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json({ ligada: true, itens: await oQueEstaNaReciclagem() });
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ ligada: false, itens: [] });
    log.error("reciclagem GET falhou", err);
    return NextResponse.json({ error: "Não foi possível ler a Reciclagem." }, { status: 500 });
  }
}
