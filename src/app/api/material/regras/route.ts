import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listRules, createRule } from "@/lib/material-rules-store";
import type { MatchKind, RuleAction } from "@/lib/material-rules";
import { jsonWithEtag } from "@/lib/api-cache";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS: MatchKind[] = ["sempre", "servico", "texto", "pax"];
const ACOES: RuleAction[] = ["add_list", "add_item"];

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return jsonWithEtag(request, await listRules());
  } catch (err) {
    log.error("material regras GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

    const matchKind: MatchKind = TIPOS.includes(body?.matchKind) ? body.matchKind : "sempre";
    const action: RuleAction = ACOES.includes(body?.action) ? body.action : "add_list";

    // Uma regra que não aponta para nada não acrescenta nada, e fica no ecrã a
    // dar a impressão de que faz alguma coisa. Recusa-se à entrada.
    if (action === "add_list" && !body?.listId) {
      return NextResponse.json({ error: "Escolha a lista a acrescentar." }, { status: 400 });
    }
    if (action === "add_item" && !body?.itemId) {
      return NextResponse.json({ error: "Escolha o item a acrescentar." }, { status: 400 });
    }
    if (matchKind !== "sempre" && !String(body?.matchValue ?? "").trim()) {
      return NextResponse.json({ error: "Diga o que procurar." }, { status: 400 });
    }

    const existentes = await listRules();
    const regra = await createRule({
      name,
      enabled: body?.enabled !== false,
      matchKind,
      matchValue:
        String(body?.matchValue ?? "")
          .trim()
          .slice(0, 120) || undefined,
      action,
      listId: typeof body?.listId === "string" ? body.listId : undefined,
      itemId: typeof body?.itemId === "string" ? body.itemId : undefined,
      qty: Number.isFinite(Number(body?.qty)) ? Math.max(0, Number(body.qty)) : undefined,
      qtyPerPax: Number.isFinite(Number(body?.qtyPerPax))
        ? Math.max(0, Number(body.qtyPerPax)) || undefined
        : undefined,
      position: existentes.length,
    });
    return NextResponse.json(regra);
  } catch (err) {
    log.error("material regras POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
