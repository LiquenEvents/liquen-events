import { NextRequest, NextResponse } from "next/server";
import { isAuthed, nomesDaEquipa } from "@/lib/admin-auth";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUEM TRABALHA AQUI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O sistema sempre soube — as contas estão configuradas — e nunca o perguntou
 * a ninguém. O responsável de uma tarefa era um campo de texto livre, e a
 * lista de pessoas do filtro nascia do que estivesse escrito nas tarefas.
 * «Ana», «ana» e «Ana R.» eram três colaboradoras diferentes para o produto, e
 * uma tarefa atribuída a uma delas não aparecia no filtro das outras duas.
 *
 * ── O QUE SAI DAQUI, E O QUE NUNCA PODE SAIR ──────────────────────────────
 *
 * Sai uma lista de NOMES. Não saem emails, e sobretudo não saem hashes de
 * palavra-passe — que é o que vive ao lado de cada nome no `ADMIN_USERS`. O
 * `nomesDaEquipa` devolve cadeias e não objectos precisamente por isso: uma
 * projecção que se esqueça de um campo é um acidente a uma linha de distância;
 * uma lista de nomes não tem como transportar um hash.
 *
 * ── E PEDE SESSÃO ─────────────────────────────────────────────────────────
 *
 * Saber quem trabalha numa empresa não é informação pública. Um endereço aberto
 * a listar os nomes da equipa é meio caminho para tentar entrar com um deles.
 */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    /**
     * Lista vazia é uma resposta legítima e diferente de um erro: a instalação
     * com palavra-passe partilhada não tem contas nomeadas. Quem lê isto tem
     * de tratar o vazio como «não sei quem são» e continuar a aceitar um nome
     * escrito à mão — nunca como «não há ninguém».
     */
    return NextResponse.json({ ok: true, nomes: nomesDaEquipa() });
  } catch (err) {
    log.error("equipa GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
