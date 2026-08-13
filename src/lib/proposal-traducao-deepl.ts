import "server-only";
import type { MotorDeTraducao } from "./proposal-traducao";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MOTOR DE TRADUÇÃO — DeepL, ATRÁS DA FRONTEIRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A fronteira está em `proposal-traducao.ts` e não muda: «dá-me estes textos
 * portugueses, devolve-me os ingleses, pela mesma ordem e no mesmo número».
 * Este ficheiro é UMA implementação dela. Trocar de serviço um dia é escrever
 * outro ficheiro como este; nada do resto — nem o documento, nem o ecrã, nem os
 * avisos — sabe que o DeepL existe.
 *
 * ── `server-only`, E É O PONTO MAIS IMPORTANTE AQUI ───────────────────────
 *
 * A chave nunca pode chegar ao navegador. Este módulo é `server-only` e é usado
 * pela rota `/api/propostas/traduzir`; o estúdio fala com a ROTA, nunca com o
 * DeepL. Uma chave no pacote do browser é uma chave pública, e uma chave de
 * tradução pública é a quota da casa gasta por outra pessoa.
 *
 * Pela mesma razão, a chave não é escrita em lado nenhum: nem num registo, nem
 * numa mensagem de erro, nem em prefixo. As mensagens que saem daqui vão a um
 * `toast` no ecrã dela e ao registo do servidor.
 *
 * ── O QUE O DEEPL RECEBE, E O QUE NÃO RECEBE ──────────────────────────────
 *
 * Recebe uma LISTA de textos e mais nada — não sabe o que é um mood board, uma
 * rubrica ou um cliente. O que não lhe dermos não pode ser mal interpretado, e
 * o que ele nos devolve entra sempre por `escreverEn`, nos campos `…En`: o
 * português NUNCA é escrito por cima, e a tradução continua a poder ser
 * corrigida à mão depois.
 */

/** Onde o serviço vive, conforme o plano. */
const ENDERECO_GRATUITO = "https://api-free.deepl.com/v2/translate";
const ENDERECO_PAGO = "https://api.deepl.com/v2/translate";

/**
 * O endereço para esta chave.
 *
 * As chaves do plano gratuito acabam em `:fx` e falam com outro servidor. A
 * escolha sai do SUFIXO DA CHAVE e não de uma segunda variável de ambiente: uma
 * variável a mais é uma variável para pôr errada, e o sintoma seria um 403 que
 * ninguém relaciona com o endereço.
 */
export function enderecoDoDeepL(chave: string): string {
  return chave.endsWith(":fx") ? ENDERECO_GRATUITO : ENDERECO_PAGO;
}

/**
 * O que dizer quando o serviço recusa — em português, porque é o que ela lê.
 *
 * Sem a chave lá dentro, e sem inventar explicações para estados que não
 * conhecemos: nesses diz-se o número, que é o que permite procurá-lo.
 */
function porqueRecusou(status: number): string {
  if (status === 456) {
    return "a quota de tradução deste mês acabou (o plano gratuito do DeepL tem um limite de caracteres)";
  }
  if (status === 403) return "a chave do serviço de tradução foi recusada";
  if (status === 429) return "foram pedidos traduções a mais de seguida — tenta daqui a um minuto";
  return `o serviço de tradução respondeu ${status}`;
}

/** A forma da resposta do DeepL que nos interessa. */
interface RespostaDeepL {
  translations?: { text?: unknown }[];
}

/**
 * Um {@link MotorDeTraducao} que fala com o DeepL.
 *
 * `buscar` entra por parâmetro para os testes poderem correr sem rede — e para
 * a suite não passar a depender de um serviço externo estar de pé.
 */
export function motorDeepL(chave: string, buscar: typeof fetch = fetch): MotorDeTraducao {
  return async (textos: string[]): Promise<string[]> => {
    // Nada a traduzir não é um pedido — é uma chamada que se poupa, e uma
    // resposta vazia que não é preciso interpretar.
    if (textos.length === 0) return [];

    const r = await buscar(enderecoDoDeepL(chave), {
      method: "POST",
      headers: {
        // O esquema é do DeepL e não é um `Bearer`.
        Authorization: `DeepL-Auth-Key ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // EM LOTE: o parâmetro aceita várias entradas e a resposta vem pela
        // mesma ordem. Um pedido por campo eram dezenas de idas à rede numa
        // proposta cheia, e a ordem teria de ser reconstruída à mão — que é
        // exactamente onde uma tradução acaba no campo errado.
        text: textos,
        source_lang: "PT",
        // «EN» sozinho está descontinuado. A Líquen é europeia e os casais que
        // recebem estas propostas em inglês são, quase sempre, do Reino Unido
        // ou da Irlanda.
        target_lang: "EN-GB",
        // Sem `tag_handling`: os campos da proposta são texto simples, e
        // declarar HTML fazia um «<» escrito por ela virar uma etiqueta.
      }),
    });

    if (!r.ok) throw new Error(porqueRecusou(r.status));

    const corpo = (await r.json().catch(() => null)) as RespostaDeepL | null;
    const traduzidos = (corpo?.translations ?? []).map((t) =>
      typeof t?.text === "string" ? t.text : "",
    );
    // A mesma trava da fronteira, dita aqui com o nome certo: um lote a que
    // faltem textos desalinha tudo o que vem a seguir, e a partir daí a
    // tradução de um campo fica noutro campo.
    if (traduzidos.length !== textos.length) {
      throw new Error(
        `o serviço devolveu ${traduzidos.length} traduções para ${textos.length} textos`,
      );
    }
    return traduzidos;
  };
}

/** A chave, ou `null` quando não há nenhuma configurada. */
function chaveDeTraducao(): string | null {
  const chave = process.env.DEEPL_API_KEY?.trim();
  return chave ? chave : null;
}

/**
 * O motor configurado neste servidor, ou `null`.
 *
 * Sem `DEEPL_API_KEY` devolve `null`, e daí para cima tudo se comporta como se
 * comportava antes de haver serviço nenhum: a rota diz que não está ligada e o
 * botão do estúdio di-lo por palavras. Um botão que finge traduzir e não traduz
 * manda-a enviar uma proposta a acreditar que está traduzida.
 */
export function motorConfigurado(buscar: typeof fetch = fetch): MotorDeTraducao | null {
  const chave = chaveDeTraducao();
  return chave ? motorDeepL(chave, buscar) : null;
}

/** Há tradução automática ligada neste servidor? */
export function haTraducaoAutomatica(): boolean {
  return chaveDeTraducao() !== null;
}
