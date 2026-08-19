import "server-only";
import { VALOR_DA_LIGACAO_NO_RASCUNHO } from "./email-ligacao-reservada";
import { rascunhoParaEnvio, type RascunhoDeEnvio } from "./email-modelos-rascunho";
import { construirValores, VARIAVEIS } from "./email-template-vars";
import type { IdiomaDoModelo } from "./email-templates-store";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RASCUNHO DO ECRÃ DE ENVIO — E O AVISO DO «OLÁ ,»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `rascunhoParaEnvio` (a ponte que o P1 deixou) resolve o modelo com os
 * valores de um pedido e devolve o texto pronto a pôr na caixa. Falta-lhe uma
 * coisa para o ecrã de envio poder abrir: dizer QUAIS as variáveis que ficaram
 * vazias A DESCOBERTO. Palavras dela: «nada pior do que enviar "Olá ,"».
 *
 * ── A REGRA É A DO P1, E NÃO SE DISCUTE AQUI ──────────────────────────────
 *
 * Só conta a variável que fica À VISTA no texto. Uma variável vazia guardada
 * pelo seu próprio `{{#se}}` NÃO é um problema: ela já escreveu o que fazer
 * sem esse dado, e acusá-la disso era discutir uma decisão tomada. É
 * exactamente o que o `variaveisPorPreencher` do interpretador faz.
 *
 * ── PORQUE É QUE NÃO SE CHAMA O `variaveisPorPreencher` DIRECTAMENTE ──────
 *
 * Porque ele precisa da FONTE do modelo — o texto com os `{{...}}` por
 * resolver — e a fonte não sai do `rascunhoParaEnvio`: o que de lá vem é o
 * texto já desenhado. Para lhe chegar era preciso repetir aqui a escolha entre
 * «o modelo que ela guardou» e «o de origem», com o resgate da leitura que
 * falha e o `fonteEditavel` dos modelos antigos em HTML. Duas cópias dessa
 * escolha eram duas oportunidades para uma delas ficar a olhar para outro
 * modelo — e o aviso passaria a falar de um texto que não é o que vai sair.
 *
 * ── A SAÍDA: PERGUNTAR AO PRÓPRIO DESENHO ─────────────────────────────────
 *
 * Desenha-se DUAS vezes o mesmo rascunho, com a mesma ponte, e compara-se.
 * Na segunda, cada valor vazio leva no lugar um {@link SENTINELA} — um espaço
 * em branco, e é aí que está o truque:
 *
 *   · para as CONDIÇÕES, a sentinela continua a ser vazio (o interpretador
 *     pergunta `String(valor).trim() !== ""`), portanto todos os `{{#se}}` e
 *     `{{#se_nao}}` decidem-se exactamente como no rascunho verdadeiro — nada
 *     que estava fechado abre, nada que estava aberto fecha;
 *   · para o TEXTO, a sentinela escreve-se. Se o desenho mudou, aquela
 *     variável foi mesmo desenhada — ou seja, está a descoberto.
 *
 * Duas passagens quando não falta nada (o caso normal), mais uma por cada
 * valor vazio só quando há alguma coisa a nomear. Sem fonte, sem segunda cópia
 * da resolução do modelo, e impossível de divergir do texto que vai sair,
 * porque é o próprio texto que responde.
 */

/**
 * O valor que substitui um vazio na segunda passagem.
 *
 * TEM de ser só espaço em branco: é isso que faz as condições decidirem-se
 * como no rascunho verdadeiro. Um `«?»` ou um `__X__` abriria os `{{#se}}`
 * fechados e o aviso passava a acusar variáveis que o modelo dela nunca
 * desenha. O espaço fino não-quebrável não aparece em nenhum modelo escrito à
 * mão, mas isso é indiferente — o que se compara são os dois desenhos
 * inteiros, não a presença da sentinela.
 */
const SENTINELA = " ";

/** O rótulo humano de uma variável — «Data», «Primeiro nome». */
const rotuloDaVariavel = (chave: string): string =>
  VARIAVEIS.find((v) => v.chave === chave)?.rotulo ?? chave;

export interface VariavelEmFalta {
  chave: string;
  rotulo: string;
}

export interface RascunhoDoEnvio {
  rascunho: RascunhoDeEnvio;
  /** As variáveis vazias que ficaram À VISTA no texto. Vazio no caso normal. */
  porPreencher: VariavelEmFalta[];
}

/** As chaves cujo valor não tem nada lá dentro. */
const vazias = (valores: Record<string, string>): string[] =>
  Object.keys(valores).filter((k) => String(valores[k] ?? "").trim() === "");

const igual = (a: RascunhoDeEnvio, b: RascunhoDeEnvio): boolean =>
  a.assunto === b.assunto && a.texto === b.texto;

/**
 * O rascunho para a caixa de envio, com o aviso das variáveis a descoberto.
 *
 * Devolve `{ erro }` pelas mesmas razões que a ponte devolve — não há modelo
 * com aquela chave, ou não há versão inglesa dele. O ecrã mostra a frase e
 * oferece os outros modelos; nada disto trava um envio, porque nada disto
 * chegou a enviar coisa nenhuma.
 */
export async function rascunhoDoEnvio(opcoes: {
  chave?: string;
  idioma?: IdiomaDoModelo;
  valores: Record<string, string>;
}): Promise<RascunhoDoEnvio | { erro: string }> {
  const rascunho = await rascunhoParaEnvio(opcoes);
  if ("erro" in rascunho) return rascunho;

  const emBranco = vazias(opcoes.valores);
  if (emBranco.length === 0) return { rascunho, porPreencher: [] };

  const comSentinelas = { ...opcoes.valores };
  for (const k of emBranco) comSentinelas[k] = SENTINELA;
  const todas = await rascunhoParaEnvio({ ...opcoes, valores: comSentinelas });
  // Um erro na segunda passagem só pode vir de o modelo ter mudado no meio das
  // duas leituras. Fica o rascunho da primeira, sem aviso: um aviso é para
  // ajudar, e inventar um a partir de um desenho que não se conseguiu fazer
  // ajudava menos do que ficar calado.
  if ("erro" in todas || igual(rascunho, todas)) return { rascunho, porPreencher: [] };

  // Só aqui é que se paga por variável, e só pelas que estão vazias.
  const porPreencher: VariavelEmFalta[] = [];
  for (const chave of emBranco) {
    const so = await rascunhoParaEnvio({
      ...opcoes,
      valores: { ...opcoes.valores, [chave]: SENTINELA },
    });
    if ("erro" in so || igual(rascunho, so)) continue;
    porPreencher.push({ chave, rotulo: rotuloDaVariavel(chave) });
  }
  return { rascunho, porPreencher };
}

// ── Os valores desta proposta ──────────────────────────────────────────────

export interface DadosDoEnvio {
  /** O casal, tal como está escrito no DOCUMENTO que vai seguir — e não o
   *  `quote.name`, que pode ser a mãe da noiva ou uma wedding planner. É a
   *  mesma escolha que a rota do envio já faz para a saudação. */
  clientNames: string;
  /** O endereço para onde o email vai. */
  emailDoCliente: string;
  /** A chave do tipo de evento (`casamentos`, …) — o rótulo sai na língua. */
  tipoDeEvento?: string;
  /** A data do evento em ISO. Vem do PEDIDO: o `doc.eventDate` do estúdio é
   *  texto livre já por extenso («3 de julho de 2027»), e o catálogo de
   *  variáveis formata-a na língua de quem lê. */
  dataIso?: string;
  local?: string;
  /** O total COM IVA desta proposta — o número que o casal vê no fim da folha. */
  totalComIva?: number;
  validadeIso?: string;
  sinalPercentagem?: number;
  /** A nota pessoal escrita no estúdio para este envio, se houver. */
  mensagemPessoal?: string;
  /** Quem assina: o nome de quem tem a sessão iniciada. Vazio cai no nome da
   *  casa, dentro do `construirValores` — nunca num valor do destinatário. */
  remetente?: string;
  idioma: IdiomaDoModelo;
}

/**
 * Os valores desta proposta, na forma que o interpretador espera.
 *
 * Passa pelo `construirValores` e por mais nada: são os COMPARTIMENTOS
 * SEPARADOS dele que impedem que o nome de quem recebe chegue ao lugar de quem
 * assina, e achatá-los aqui — nem que fosse «só para este ecrã» — era abrir
 * outra vez a porta por onde já saiu correio assinado com o nome do cliente.
 *
 * A `link_proposta` é a excepção conhecida e leva o marcador em vez do
 * endereço: ver o `email-ligacao-reservada.ts`, onde está escrito porquê.
 */
export function valoresDoEnvio(dados: DadosDoEnvio): Record<string, string> {
  return construirValores({
    destinatario: { nomeCompleto: dados.clientNames, email: dados.emailDoCliente },
    evento: { tipo: dados.tipoDeEvento, dataIso: dados.dataIso, local: dados.local },
    proposta: {
      totalComIva: dados.totalComIva,
      moeda: "EUR",
      validadeIso: dados.validadeIso,
      sinalPercentagem: dados.sinalPercentagem,
      link: VALOR_DA_LIGACAO_NO_RASCUNHO,
      mensagemPessoal: dados.mensagemPessoal,
    },
    remetente: { nome: dados.remetente },
    idioma: dados.idioma,
  });
}
