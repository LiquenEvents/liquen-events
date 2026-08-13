import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { haTraducaoAutomatica, motorConfigurado } from "@/lib/proposal-traducao-deepl";
import { MAX_TEXTOS_POR_TRADUCAO, MAX_CARACTERES_POR_TRADUCAO } from "@/lib/proposal-traducao";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TRADUZIR A PROSA DA PROPOSTA — E A CHAVE FICA DESTE LADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O estúdio corre no navegador; a chave do serviço de tradução não pode lá
 * chegar. É essa, e só essa, a razão de existir uma rota: o browser manda os
 * textos portugueses, o servidor fala com o serviço, e a chave nunca sai daqui.
 * Uma chave no pacote do browser é uma chave pública, e uma chave de tradução
 * pública é a quota da casa gasta por outra pessoa.
 *
 * A rota é FINA de propósito. Não sabe o que é uma proposta, um mood board ou
 * uma rubrica: recebe uma lista de textos e devolve outra, pela mesma ordem.
 * Quem decide QUE campos se mandam traduzir e onde as respostas se escrevem é
 * `proposal-traducao.ts`, no lado do estúdio, onde o documento está.
 *
 * ── O `GET` EXISTE PARA O BOTÃO PODER SER HONESTO ─────────────────────────
 * Sem ele, o estúdio só descobria que não há serviço configurado DEPOIS de
 * carregar em «Traduzir para inglês» — e um botão que parece funcionar e não
 * funciona é pior do que um botão desligado que diz porquê.
 */

/** Só quem está no back office. É a quota da casa que se gasta. */
const semSessao = () => NextResponse.json({ error: "Não autorizado" }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return semSessao();
  // Só o SIM ou NÃO. Nunca a chave, nem um prefixo dela, nem o plano — o que
  // não sai daqui não pode ser lido no separador de rede do browser.
  return NextResponse.json({ ligada: haTraducaoAutomatica() });
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return semSessao();

  const motor = motorConfigurado();
  if (!motor) {
    // 501 e não 500: não correu mal nada — falta escolher e configurar o
    // serviço. O estúdio distingue os dois e diz coisas diferentes.
    return NextResponse.json(
      { error: "A tradução automática não está configurada neste servidor." },
      { status: 501 },
    );
  }

  const body = await request.json().catch(() => null);
  const textos = (body as { textos?: unknown } | null)?.textos;
  if (!Array.isArray(textos) || textos.some((t) => typeof t !== "string")) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  // Tectos, pelas razões de sempre: um pedido feito à mão com dez mil entradas
  // gastava a quota do mês numa carregada, e um texto gigante não é um campo de
  // proposta nenhum. A contagem é a mesma que o estúdio já respeita.
  if (textos.length > MAX_TEXTOS_POR_TRADUCAO) {
    return NextResponse.json({ error: "Textos a mais num só pedido" }, { status: 413 });
  }
  const total = (textos as string[]).reduce((n, t) => n + t.length, 0);
  if (total > MAX_CARACTERES_POR_TRADUCAO) {
    return NextResponse.json({ error: "Texto a mais num só pedido" }, { status: 413 });
  }

  try {
    return NextResponse.json({ textos: await motor(textos as string[]) });
  } catch (e) {
    const porque = e instanceof Error ? e.message : "o serviço de tradução não respondeu";
    // A mensagem que sai do motor nunca leva a chave — ver `porqueRecusou`. É
    // esta frase que o estúdio mostra, por isso é escrita em português.
    log.warn("proposta-traduzir: o serviço recusou", { porque });
    return NextResponse.json({ error: porque }, { status: 502 });
  }
}
