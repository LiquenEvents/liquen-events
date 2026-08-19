import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { validarModelo } from "@/lib/email-template-engine";
import { guardarModelo, listarModelos, type IdiomaDoModelo } from "@/lib/email-templates-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Os modelos nas DUAS línguas, e a gravação de um lado de cada vez.
 *
 * A rota antiga (`/api/email-templates`) fica onde está e a fazer o que fazia:
 * é ela que serve o ecrã actual e é ela que os testes dele exercitam. Esta é a
 * que o ecrã bilingue usa. Gravam na mesma tabela, e o português de um modelo é
 * exactamente a mesma linha nas duas — quem gravar por aqui vê o resultado
 * por ali.
 */

/** Os mesmos tectos da rota antiga, e pela mesma razão (a cópia de segurança
 *  lê a tabela inteira e tem um tecto de 20 MB). */
const MAX_KEY = 80;
const MAX_NAME = 120;
const MAX_SUBJECT = 300;
const MAX_BODY = 20_000;

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await listarModelos());
  } catch (err) {
    log.error("email-templates bilingues GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

async function guardar(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const corpo = await request.json().catch(() => null);
    const chave = String(corpo?.chave ?? "")
      .trim()
      .slice(0, MAX_KEY);
    if (!chave) return NextResponse.json({ error: "Chave obrigatória" }, { status: 400 });
    // Os separadores das linhas compostas não podem vir de fora: uma chave com
    // «@en» ou «#v» lá dentro escrevia por cima da versão inglesa de outro
    // modelo, ou plantava uma versão que ninguém pediu.
    if (chave.includes("@") || chave.includes("#")) {
      return NextResponse.json({ error: "A chave não pode ter «@» nem «#»." }, { status: 400 });
    }

    const idioma: IdiomaDoModelo = corpo?.idioma === "en" ? "en" : "pt";
    const nome = String(corpo?.nome ?? "")
      .trim()
      .slice(0, MAX_NAME);
    // O assunto acaba num cabeçalho de email: sem CR/LF, como em toda a casa.
    const subject = String(corpo?.subject ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, MAX_SUBJECT);
    const body = String(corpo?.body ?? "").slice(0, MAX_BODY);
    if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    if (!subject) return NextResponse.json({ error: "Assunto obrigatório" }, { status: 400 });

    /**
     * UM MODELO MAL FECHADO NÃO SE GRAVA.
     *
     * O interpretador aguenta-o — nunca deixa sair um `{{#se}}` para a caixa
     * de correio de ninguém —, mas o que ele desenha com um bloco por fechar
     * não é o que ela quis escrever. Recusar aqui é dizer-lho enquanto o texto
     * ainda está no ecrã à frente dela; deixar passar é descobri-lo num email
     * que já saiu.
     */
    const erros = validarModelo(subject, body);
    if (erros.length) {
      return NextResponse.json(
        { error: `O modelo tem blocos mal fechados: ${erros.join(" ")}`, erros },
        { status: 400 },
      );
    }

    return NextResponse.json(await guardarModelo({ chave, nome, idioma, subject, body }));
  } catch (err) {
    log.error("email-templates bilingues gravação falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export const POST = guardar;
export const PUT = guardar;
