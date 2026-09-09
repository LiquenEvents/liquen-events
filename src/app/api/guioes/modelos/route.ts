import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isAuthed } from "@/lib/admin-auth";
import {
  listarModelosDeGuiao,
  guardarModeloDeGuiao,
  ModeloDemasiadoGrande,
  DemasiadosModelos,
  MAX_MODELOS,
} from "@/lib/guiao-modelos-guardados";
import {
  MODELOS_DA_CASA,
  saoMomentosDeModelo,
  type ModeloDeGuiao,
} from "@/lib/orcamento/guiao-modelos";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Modelos de guião — os da casa e os dela, na mesma lista.
 *
 * Tudo aqui é só para a equipa: um modelo diz a que horas a montagem começa e
 * quanto tempo leva, e não tem nada que ser lido por quem não entrou.
 *
 * ── OS DA CASA VÃO SEMPRE À FRENTE, E NÃO SE GRAVAM ───────────────────────
 *
 * Vêm do produto (`MODELOS_DA_CASA`), são iguais em todas as instalações e não
 * ocupam uma linha de base de dados. Juntam-se aqui, na leitura, para o ecrã
 * ter UMA lista para desenhar em vez de duas para reconciliar — e ficam
 * primeiro porque numa instalação nova são os únicos que existem, e uma lista
 * que abre vazia por baixo de um título «Modelos» lê-se como uma avaria.
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const meus = await listarModelosDeGuiao();
    return NextResponse.json({ modelos: [...MODELOS_DA_CASA, ...meus] });
  } catch (err) {
    log.error("modelos de guião GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  // Analisar em defensiva: um corpo malformado tem de dar 400 e não um 500 por
  // excepção não apanhada — este `json()` está FORA do try de baixo.
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  const bruto = body as Record<string, unknown>;

  const nome = String(bruto.nome ?? "")
    .trim()
    .slice(0, 80);
  if (!nome) return NextResponse.json({ error: "Dá um nome ao modelo." }, { status: 400 });

  const momentos = saoMomentosDeModelo(bruto.momentos);
  if (momentos.length === 0) {
    return NextResponse.json(
      { error: "O guião ainda não tem momentos com hora e nome para guardar." },
      { status: 400 },
    );
  }

  /**
   * O id NÃO vem do corpo quando é novo, e vem quando é uma substituição.
   *
   * Um id vindo de fora sem esta distinção deixava gravar por cima de um modelo
   * DA CASA — que não vive na base de dados, portanto o que acontecia era
   * nascer um segundo modelo com o mesmo id do da casa, e a lista passava a ter
   * dois «Casamento de tarde» com conteúdos diferentes.
   */
  const idPedido = typeof bruto.id === "string" ? bruto.id.trim().slice(0, 80) : "";
  const daCasa = MODELOS_DA_CASA.some((m) => m.id === idPedido);
  if (daCasa) {
    return NextResponse.json(
      { error: "Os modelos da casa não se alteram. Guarda este com um nome novo." },
      { status: 409 },
    );
  }

  const modelo: ModeloDeGuiao = {
    id: idPedido || randomUUID(),
    nome,
    momentos,
    criadoEm: new Date().toISOString(),
    ...(typeof bruto.origem === "string" && bruto.origem.trim()
      ? { origem: bruto.origem.trim().slice(0, 120) }
      : {}),
  };

  try {
    const { modelos, escrita } = await guardarModeloDeGuiao(modelo);
    /**
     * A resposta diz ONDE ficou, e quem chama mostra a frase certa.
     *
     * Sem base de dados configurada em produção, isto escreveu para o disco da
     * função e desaparece no deploy seguinte. Responder 200 e escrever
     * «Guardado» sobre isso é a avaria que o `app-state.ts` conta por extenso —
     * uma proposta inteira montada e perdida. Aqui o modelo vai na resposta
     * (portanto o ecrã fica em dia) com o aviso ao lado.
     */
    return NextResponse.json({ modelo, modelos, escrita });
  } catch (err) {
    if (err instanceof ModeloDemasiadoGrande) {
      return NextResponse.json(
        { error: "Este guião é grande demais para caber num modelo." },
        { status: 413 },
      );
    }
    if (err instanceof DemasiadosModelos) {
      return NextResponse.json(
        { error: `Já tens ${MAX_MODELOS} modelos guardados. Apaga um antes de guardar outro.` },
        { status: 409 },
      );
    }
    log.error("modelos de guião POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
