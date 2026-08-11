import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listMaterial, createMaterial, updateMaterial } from "@/lib/material-store";
import { planearImportacao } from "@/lib/material-csv";
import { log } from "@/lib/logger";
import { isMissingTable } from "@/lib/repository";

const NAO_INSTALADO =
  "O Material ainda não está criado na base de dados. No Supabase → SQL Editor, cole e corra o " +
  "ficheiro db/schema.sql (pode repetir-se sem risco) e recarregue esta página.";

export const runtime = "nodejs";
// Importação em bloco: tantas linhas quantas o ficheiro trouxer.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Um CSV de inventário completo cabe folgadamente aqui; acima disto é engano. */
const MAX_CSV = 512 * 1024;

/**
 * DUAS FASES, DE PROPÓSITO.
 *
 *  POST { csv, aplicar: false }  → devolve o PLANO, sem escrever nada.
 *  POST { csv, aplicar: true }   → volta a planear a partir do estado ATUAL e
 *                                  escreve.
 *
 * A segunda fase replaneia em vez de receber o plano que o browser mostrou.
 * Parece redundante e não é: entre ver e confirmar pode passar tempo, e um
 * plano vindo do cliente seria uma lista de escritas que o servidor aceitaria
 * sem verificar contra o catálogo atual. Replanear custa uma leitura e fecha
 * essa porta.
 *
 * As linhas com erro NUNCA são escritas — nem sequer as boas ao lado delas
 * ficam por escrever: importa-se o que se percebeu e diz-se o que ficou de
 * fora, porque exigir um ficheiro perfeito para importar 300 linhas é o mesmo
 * que não ter importação.
 */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    const csv = typeof body?.csv === "string" ? body.csv : "";
    if (!csv.trim()) return NextResponse.json({ error: "Ficheiro vazio" }, { status: 400 });
    if (csv.length > MAX_CSV) {
      return NextResponse.json({ error: "Ficheiro demasiado grande" }, { status: 413 });
    }

    const existentes = await listMaterial();
    const plano = planearImportacao(csv, existentes);

    if (!body?.aplicar) return NextResponse.json(plano);

    let criados = 0;
    let atualizados = 0;
    const falhas: { linha: number; erro: string }[] = [];

    for (const l of plano.linhas) {
      if (l.estado === "erro" || !l.item) continue;
      try {
        if (l.estado === "atualiza" && l.alvoId) {
          await updateMaterial(l.alvoId, l.item);
          atualizados++;
        } else {
          await createMaterial(l.item);
          criados++;
        }
      } catch (err) {
        // Uma linha que rebenta não pode levar as outras atrás. Fica contada e
        // devolvida, para se saber exactamente o que não entrou.
        log.error("material importar: linha falhou", err, { linha: l.linha });
        falhas.push({ linha: l.linha, erro: "Não foi possível gravar." });
      }
    }

    return NextResponse.json({
      ok: true,
      criados,
      atualizados,
      ignorados: plano.erros,
      falhas,
    });
  } catch (err) {
    // A tabela em falta não é uma avaria: é uma instalação por acabar,
    // e tem uma resolução que ela pode fazer sozinha.
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    log.error("material importar falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
