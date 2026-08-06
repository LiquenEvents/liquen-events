import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/admin-auth";
import { actualizarServico, apagarServico } from "@/lib/servicos-catalogo-store";
import { firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Corrigir a redacção de um serviço, ou tirá-lo da biblioteca.
 *
 * ── ARQUIVAR EM VEZ DE APAGAR ──────────────────────────────────────────────
 * `PATCH { arquivado: true }` é o caminho normal: o serviço sai do seletor e
 * continua a existir nas propostas antigas, que é onde as palavras dele ainda
 * fazem sentido. O DELETE existe para o que nunca devia ter entrado — um
 * duplicado, um engano de escrita.
 */

const patchSchema = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  descricao: z.string().max(2_000).optional(),
  nomeEn: z.string().max(200).optional(),
  descricaoEn: z.string().max(2_000).optional(),
  categoria: z.string().max(120).optional(),
  arquivado: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const actualizado = await actualizarServico(id, parsed.data);
    if (!actualizado) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(actualizado);
  } catch (err) {
    log.error("servicos-catalogo PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { id } = await params;
    await apagarServico(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("servicos-catalogo DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
