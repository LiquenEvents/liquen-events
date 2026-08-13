import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listLists, createList, duplicateList } from "@/lib/material-lists-store";
import { listAllListItems, addListItem } from "@/lib/material-list-items-store";
import { listMaterial, createMaterial } from "@/lib/material-store";
import { chaveDeNome } from "@/lib/material-csv";
import { ESSENCIAIS_CARRINHA, NOME_LISTA_ESSENCIAIS } from "@/lib/material-seed";
import { jsonWithEtag } from "@/lib/api-cache";
import { log } from "@/lib/logger";
import { isMissingTable } from "@/lib/repository";

const NAO_INSTALADO =
  "O Material ainda não está criado na base de dados. No Supabase → SQL Editor, cola e corre o " +
  "ficheiro db/schema.sql (pode repetir-se sem risco) e recarrega esta página.";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Listas com as suas linhas, numa resposta só — o ecrã precisa das duas. */
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const [listas, linhas] = await Promise.all([listLists(), listAllListItems()]);
    return jsonWithEtag(request, { listas, linhas });
  } catch (err) {
    // A tabela em falta não é uma avaria: é uma instalação por acabar,
    // e tem uma resolução que ela pode fazer sozinha.
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    log.error("material listas GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Três ações, distinguidas pelo corpo:
 *   { name }              → lista vazia com esse nome
 *   { duplicarDe, name }  → cópia de outra, com ids novos
 *   { semear: true }      → cria "Essenciais de carrinha" a partir do catálogo
 *
 * A SEMENTE PROCURA ANTES DE CRIAR. Um item que já exista no catálogo é
 * reaproveitado pelo nome (sem ligar a acentos nem maiúsculas); só o que falta
 * é criado. Sem isto, semear duas vezes deixava dois "Escadote 3 degraus" com
 * stocks separados, e a partir daí nenhum dos dois estava certo.
 */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);

    if (body?.semear) {
      const jaExiste = (await listLists()).find(
        (l) => chaveDeNome(l.name) === chaveDeNome(NOME_LISTA_ESSENCIAIS),
      );
      if (jaExiste) {
        return NextResponse.json({ error: "Os essenciais já existem." }, { status: 409 });
      }

      const catalogo = await listMaterial();
      const porNome = new Map(catalogo.map((i) => [chaveDeNome(i.name), i]));
      const lista = await createList({ name: NOME_LISTA_ESSENCIAIS, isDefault: true });

      let posicao = 0;
      let criados = 0;
      for (const s of ESSENCIAIS_CARRINHA) {
        let item = porNome.get(chaveDeNome(s.nome));
        if (!item) {
          item = await createMaterial({
            name: s.nome,
            category: s.categoria,
            kind: s.tipo,
            unit: s.unidade,
            stock: 0,
            minStock: s.tipo === "consumivel" ? s.qty : undefined,
          });
          porNome.set(chaveDeNome(s.nome), item);
          criados++;
        }
        await addListItem({
          listId: lista.id,
          itemId: item.id,
          qty: s.qty,
          qtyPerPax: s.qtyPerPax,
          critical: Boolean(s.critical),
          position: posicao++,
        });
      }
      return NextResponse.json({ lista, criados, linhas: ESSENCIAIS_CARRINHA.length });
    }

    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

    if (typeof body?.duplicarDe === "string" && body.duplicarDe) {
      const copia = await duplicateList(body.duplicarDe, name);
      if (!copia) return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });
      return NextResponse.json(copia);
    }

    const lista = await createList({
      name,
      // `isDefault` NUNCA vem do corpo: só uma lista vai sempre, e deixar isso
      // ao pedido era a maneira de acabar com três listas "que vão sempre".
      isDefault: false,
      notes: typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : undefined,
    });
    return NextResponse.json(lista);
  } catch (err) {
    // A tabela em falta não é uma avaria: é uma instalação por acabar,
    // e tem uma resolução que ela pode fazer sozinha.
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    log.error("material listas POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
