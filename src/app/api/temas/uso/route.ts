import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { usoDosTemas } from "@/lib/temas-uso";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * EM QUANTAS PROPOSTAS É QUE CADA TEMA JÁ SAIU.
 *
 * Uma rota à parte da lista de temas, de propósito: esta lê os documentos
 * todos, e a outra é a que desenha o primeiro ecrã da Biblioteca. O ecrã pede
 * isto DEPOIS de os cartões estarem no ar — o número entra a seguir, e a sua
 * ausência não atrasa nem estraga nada. Ver `temas-uso.ts`.
 *
 * Devolve um objecto simples (`{ "<id>": 7 }`) e não uma lista: quem desenha
 * pergunta sempre por um tema de cada vez.
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const por = await usoDosTemas();
    return NextResponse.json({ ok: true, usos: Object.fromEntries(por) });
  } catch (err) {
    // Não devia acontecer (o `usoDosTemas` engole as falhas), mas um erro aqui
    // nunca pode fazer barulho no ecrã: é um número decorativo.
    log.warn("temas uso GET falhou", { erro: String(err) });
    return NextResponse.json({ ok: true, usos: {} });
  }
}
