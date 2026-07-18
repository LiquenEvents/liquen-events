import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listContracts } from "@/lib/contracts-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Contratos nascem do fluxo público de aceitação da proposta (o cliente aceita
// os Termos & Condições pelo link). Aqui há apenas leitura — a gestão do back
// office é de consulta/auditoria, não de criação.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await listContracts());
  } catch (err) {
    log.error("contratos GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
