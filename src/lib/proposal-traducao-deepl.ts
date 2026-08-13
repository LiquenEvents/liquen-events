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
const BASE_GRATUITA = "https://api-free.deepl.com/v2";
const BASE_PAGA = "https://api.deepl.com/v2";

/**
 * O endereço para esta chave.
 *
 * As chaves do plano gratuito acabam em `:fx` e falam com outro servidor. A
 * escolha sai do SUFIXO DA CHAVE e não de uma segunda variável de ambiente: uma
 * variável a mais é uma variável para pôr errada, e o sintoma seria um 403 que
 * ninguém relaciona com o endereço.
 */
function baseDoDeepL(chave: string): string {
  return chave.endsWith(":fx") ? BASE_GRATUITA : BASE_PAGA;
}

export function enderecoDoDeepL(chave: string): string {
  return `${baseDoDeepL(chave)}/translate`;
}

/** Os glossários vivem no mesmo servidor da tradução — e é por isso que o
 *  endereço sai do mesmo sítio: dois endereços independentes é a certeza de que
 *  um dia divergem. */
export function enderecoDosGlossarios(chave: string): string {
  return `${baseDoDeepL(chave)}/glossaries`;
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O GLOSSÁRIO DA CASA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas propostas da mesma casa não podem falar línguas diferentes. «Decoração
 * Cerimónia» tem de dar a mesma coisa em Maio e em Novembro, senão o casal que
 * recebe a segunda proposta lê outra empresa. E há palavras que um tradutor
 * automático acerta gramaticalmente e erra por inteiro: «Quinta» vira «Farm»,
 * «Monte» vira «Mount», «copo d'água» vira «water glass», «cortejo» vira
 * «parade». A proposta passa a mandar o casal para um sítio que não existe.
 *
 * ── ISTO NÃO É A TABELA CASEIRA QUE ESTÁ PROIBIDA ─────────────────────────
 *
 * O cabeçalho da fronteira proíbe um dicionário nosso a fazer de conta que
 * traduz, e tem razão. Aqui não se traduz nada: a lista é MANDADA AO SERVIÇO,
 * que a aplica dentro da tradução dele — a concordância, a ordem das palavras e
 * o resto da frase continuam a ser dele. É a diferença entre dizer ao tradutor
 * como é que a casa chama às coisas e fazer de conta que somos o tradutor.
 *
 * ── DE ONDE VEIO CADA ENTRADA ─────────────────────────────────────────────
 *
 * De três sítios, e de mais nenhum:
 *  · da moldura inglesa que já está escrita (`proposal-doc-textos.ts`) — «local»
 *    é «Venue» no cabeçalho da folha, e seria absurdo a prosa por baixo dizer
 *    «location»;
 *  · do inglês da casa já publicado (`ads/polos.ts`) — «cenografia» é «set
 *    design», «decoração de casamentos» é «wedding design», e as quintas ficam
 *    quintas («Alentejo estates and quintas»);
 *  · do vocabulário obrigatório do sector, onde a tradução à letra é
 *    reconhecivelmente estrangeira para quem casa em Inglaterra.
 *
 * ── O QUE NÃO ESTÁ AQUI, DE PROPÓSITO ─────────────────────────────────────
 *
 * Os nomes dos casais e o nome do espaço não estão nem podem estar: são
 * diferentes em cada proposta, e um glossário é uma lista fixa. A defesa desses
 * é outra e é mais forte — não vão à tradução de todo, porque `location`,
 * `clientNames` e a referência não são campos de prosa (ver `temVersaoInglesa`
 * e o teste que o prende em `proposal-traducao.test.ts`). O que este glossário
 * apanha é o que sobra: o nome do espaço quando ela o ESCREVE dentro de uma
 * frase («o arco à entrada da capela da Herdade dos Grous»). Prender a palavra
 * de cabeça — «Herdade», «Quinta», «Monte» — é o que evita o «Farm».
 */
export const GLOSSARIO_DA_CASA: ReadonlyArray<readonly [string, string]> = [
  // ── Nomes que não se traduzem ─────────────────────────────────────────────
  // A cabeça de um nome de espaço português. Só em maiúscula: dentro de um nome
  // próprio está sempre em maiúscula, e a minúscula é outra palavra («quinta»
  // também é um dia da semana, «monte» é um monte).
  ["Quinta", "Quinta"],
  ["Herdade", "Herdade"],
  ["Monte", "Monte"],
  ["Solar", "Solar"],
  ["Convento", "Convento"],
  ["Palácio", "Palácio"],
  ["Adega", "Adega"],
  // A marca. «Líquen» traduzido é «Lichen», e é o nome que assina o documento.
  ["Líquen", "Líquen"],
  ["Líquen Events", "Líquen Events"],

  // ── Os termos ingleses que ela já escreve em português ────────────────────
  // Sem estas entradas, um «mood board» escrito numa legenda volta traduzido
  // para inglês a partir do inglês — e o resultado não é «mood board».
  ["mood board", "mood board"],
  ["moodboard", "mood board"],
  ["venue", "venue"],
  ["styling", "styling"],
  ["tablescape", "tablescape"],
  ["welcome drinks", "welcome drinks"],
  ["save the date", "Save the Date"],

  // ── A moldura inglesa que já existe (`proposal-doc-textos.ts`) ────────────
  ["local", "venue"],
  ["noivos", "couple"],
  ["convidados", "guests"],
  ["cerimónia", "ceremony"],
  ["serviço", "service"],
  ["orçamento", "quotation"],

  // ── O inglês da casa já publicado (`ads/polos.ts`) ────────────────────────
  ["decoração", "design"],
  ["decoração floral", "floral design"],
  ["cenografia", "set design"],
  ["produção", "production"],
  ["coordenação do dia", "day-of coordination"],

  // ── Vocabulário do sector ─────────────────────────────────────────────────
  // «Copo d'água» à letra é «water glass»; o que é, é a festa a seguir à
  // cerimónia, e em inglês chama-se «wedding reception».
  ["copo d'água", "wedding reception"],
  ["copo de água", "wedding reception"],
  ["cerimónia civil", "civil ceremony"],
  ["cerimónia religiosa", "religious ceremony"],
  ["cerimónia simbólica", "symbolic ceremony"],
  // «Cortejo» sozinho dá «parade» ou «cortège» — um é uma marcha, o outro é um
  // funeral. A entrada dos noivos chama-se «processional».
  ["cortejo", "processional"],
  ["arco", "arch"],
  ["arco floral", "floral arch"],
  // «Passadeira» dá «carpet». O tecido do corredor da cerimónia é «aisle runner».
  ["passadeira", "aisle runner"],
  // Ortografia britânica, que é o destino («EN-GB»): «centrepiece», não
  // «centerpiece».
  ["centro de mesa", "centrepiece"],
  ["centros de mesa", "centrepieces"],
  // A mesa dos noivos é «top table» em Inglaterra e «sweetheart table» nos
  // Estados Unidos. O casal que lê isto casa em Inglaterra.
  ["mesa dos noivos", "top table"],
  ["ramo da noiva", "bridal bouquet"],
  ["buquê", "bouquet"],
  ["adereços", "props"],
  ["montagem", "set-up"],
  ["desmontagem", "breakdown"],
];

/** A lista no formato que o serviço aceita: uma entrada por linha, os dois
 *  lados separados por uma tabulação. */
function comoTsv(entradas: ReadonlyArray<readonly [string, string]>): string {
  return entradas.map(([pt, en]) => `${pt}\t${en}`).join("\n");
}

/**
 * O nome do glossário, com uma MARCA DA LISTA lá dentro.
 *
 * Um glossário do DeepL não se edita — cria-se. Se a lista mudar aqui e o nome
 * ficar igual, o servidor continua a encontrar na conta o glossário VELHO, e a
 * casa passa a ter propostas com vocabulários diferentes: exactamente o defeito
 * que o glossário existe para não haver. A marca sai da própria lista, portanto
 * ninguém se pode esquecer de a mudar.
 *
 * O resumo é um FNV-1a de 32 bits: não é criptografia nem quer ser — é só um
 * número que muda quando o texto muda, e cabe num nome.
 */
export function nomeDoGlossario(entradas: ReadonlyArray<readonly [string, string]>): string {
  const texto = comoTsv(entradas);
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `liquen-propostas-pt-en-${(h >>> 0).toString(36)}`;
}

export const NOME_DO_GLOSSARIO = nomeDoGlossario(GLOSSARIO_DA_CASA);

/**
 * O identificador do glossário por servidor, para não se perguntar duas vezes.
 *
 * A chave NÃO entra aqui — nem inteira nem em pedaço. A entrada é o endereço
 * (que só diz se o plano é gratuito ou pago) mais o nome do glossário. Assume um
 * servidor, uma chave, que é o que `DEEPL_API_KEY` é.
 *
 * `null` guardado quer dizer «já se tentou e não deu»: sem isso, uma conta sem
 * glossários punha dois pedidos falhados à frente de cada tradução. O preço é
 * uma falha passageira ficar guardada até o servidor reiniciar — e o preço da
 * alternativa é pior.
 */
const glossariosSabidos = new Map<string, string | null>();

/** Esquecer o que se sabe — para os testes poderem começar do zero. */
export function esquecerGlossarios(): void {
  glossariosSabidos.clear();
}

interface GlossarioListado {
  glossary_id?: unknown;
  name?: unknown;
  ready?: unknown;
}

/**
 * O identificador do glossário da casa neste servidor, ou `null`.
 *
 * NUNCA atira. Uma tradução inteira a falhar porque a conta não aceitou uma
 * lista de quarenta palavras seria trocar um problema de vocabulário por um
 * problema de serviço — e o vocabulário é o menor dos dois.
 *
 * Custo: dois pedidos, uma vez por servidor (listar e criar). Nenhum deles gasta
 * caracteres da quota mensal, que é o que se paga.
 */
async function idDoGlossario(chave: string, buscar: typeof fetch): Promise<string | null> {
  const endereco = enderecoDosGlossarios(chave);
  const guardado = glossariosSabidos.get(endereco);
  if (guardado !== undefined) return guardado;

  const resultado = await procurarOuCriarGlossario(chave, buscar, endereco).catch(() => ({
    id: null,
    guardar: true,
  }));
  if (resultado.guardar) glossariosSabidos.set(endereco, resultado.id);
  return resultado.id;
}

async function procurarOuCriarGlossario(
  chave: string,
  buscar: typeof fetch,
  endereco: string,
): Promise<{ id: string | null; guardar: boolean }> {
  const autorizacao = { Authorization: `DeepL-Auth-Key ${chave}` };

  const lista = await buscar(endereco, { headers: autorizacao });
  // Se a conta não deixa LISTAR, também não vai deixar criar — e um segundo
  // pedido a bater na mesma porta é um pedido gasto por nada.
  if (!lista.ok) return { id: null, guardar: true };

  const corpo = (await lista.json().catch(() => null)) as {
    glossaries?: GlossarioListado[];
  } | null;
  const jaLa = (corpo?.glossaries ?? []).find((g) => g?.name === NOME_DO_GLOSSARIO);
  if (jaLa && typeof jaLa.glossary_id === "string") {
    // Um glossário acabado de criar pode ainda não estar pronto. Não se usa
    // agora e não se guarda a resposta: da próxima vez já lá está.
    if (jaLa.ready === false) return { id: null, guardar: false };
    return { id: jaLa.glossary_id, guardar: true };
  }

  const criacao = await buscar(endereco, {
    method: "POST",
    headers: { ...autorizacao, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: NOME_DO_GLOSSARIO,
      // Os glossários falam em códigos de duas letras — não há `EN-GB` aqui,
      // ao contrário do `target_lang` da tradução.
      source_lang: "pt",
      target_lang: "en",
      entries: comoTsv(GLOSSARIO_DA_CASA),
      entries_format: "tsv",
    }),
  });
  if (!criacao.ok) return { id: null, guardar: true };
  const criado = (await criacao.json().catch(() => null)) as GlossarioListado | null;
  return {
    id: typeof criado?.glossary_id === "string" ? criado.glossary_id : null,
    guardar: true,
  };
}

/** A forma da resposta do DeepL que nos interessa. */
interface RespostaDeepL {
  translations?: { text?: unknown }[];
}

/**
 * ── OS TECTOS DE UM PEDIDO AO DEEPL ───────────────────────────────────────
 *
 * 50 textos por pedido é o limite do serviço, não uma prudência nossa: o 51.º
 * volta recusado e leva os 50 bons com ele. Uma proposta cheia — meia dúzia de
 * grupos com descrição, os mood boards, as rubricas todas — passa disto com
 * facilidade, e o sintoma seria «não deu para traduzir» numa proposta grande e
 * nunca numa pequena.
 *
 * Os caracteres são o segundo tecto: o corpo do pedido também tem limite, e
 * 20 000 é folgado para os campos de uma proposta e fica muito abaixo dele.
 */
export const MAX_TEXTOS_POR_PEDIDO = 50;
export const MAX_CARACTERES_POR_PEDIDO = 20_000;

/**
 * Os lotes de um pedido, PELA ORDEM.
 *
 * Um texto sozinho maior do que o tecto vai à mesma, sozinho: cortá-lo era
 * devolver meia frase e deixá-lo de fora era devolver menos textos do que os
 * pedidos — o desalinhamento, que é o defeito que toda a gente aqui evita.
 */
function emLotes(textos: string[]): string[][] {
  const lotes: string[][] = [];
  let lote: string[] = [];
  let caracteres = 0;
  for (const texto of textos) {
    const cabe =
      lote.length < MAX_TEXTOS_POR_PEDIDO && caracteres + texto.length <= MAX_CARACTERES_POR_PEDIDO;
    if (lote.length > 0 && !cabe) {
      lotes.push(lote);
      lote = [];
      caracteres = 0;
    }
    lote.push(texto);
    caracteres += texto.length;
  }
  if (lote.length > 0) lotes.push(lote);
  return lotes;
}

/**
 * Um erro do serviço, com uma pergunta a mais: vale a pena insistir nos lotes
 * seguintes?
 *
 * A chave recusada e a quota acabada são definitivas — os lotes a seguir iam
 * falhar exactamente da mesma maneira, e insistir é bater cinco vezes à porta
 * fechada. Os pedidos a mais (429) também: mais pedidos é precisamente o que
 * não ajuda. Um 500 é outra coisa; esse pode ter sido só aquele pedido.
 */
class ErroDoServico extends Error {
  readonly definitivo: boolean;
  /** O estado que o serviço devolveu, ou 0 quando o erro não veio de uma
   *  resposta. NUNCA leva nada da chave — é um número. */
  readonly estado: number;
  constructor(mensagem: string, definitivo: boolean, estado = 0) {
    super(mensagem);
    this.name = "ErroDoServico";
    this.definitivo = definitivo;
    this.estado = estado;
  }
}

const eDefinitivo = (status: number) =>
  status === 401 || status === 403 || status === 429 || status === 456;

/**
 * Este erro pode ser do glossário?
 *
 * Alguém apaga o glossário no painel do DeepL e o identificador que temos
 * guardado deixa de existir: o serviço responde 400 (ou 404) a TODAS as
 * traduções. Sem esta pergunta, a tradução ficava partida até o servidor
 * reiniciar — e a causa («apaguei uma coisa no site do DeepL») não estaria ao
 * alcance de ninguém que esteja a olhar para o painel dela.
 */
const podeSerDoGlossario = (e: unknown) =>
  e instanceof ErroDoServico && (e.estado === 400 || e.estado === 404);

/**
 * Um {@link MotorDeTraducao} que fala com o DeepL.
 *
 * `buscar` entra por parâmetro para os testes poderem correr sem rede — e para
 * a suite não passar a depender de um serviço externo estar de pé.
 *
 * ── UMA FALHA A MEIO NÃO DEITA FORA O QUE JÁ VEIO ─────────────────────────
 *
 * Os lotes vão um a seguir ao outro (em paralelo era multiplicar o risco de
 * 429, e o plano gratuito tem limites de concorrência). Um lote que falhe volta
 * VAZIO nas suas posições, e a fronteira já sabe ler uma posição vazia: fica por
 * traduzir, cai para o português no papel e continua a contar como falta no
 * painel. Sabe-se portanto exactamente QUAIS ficaram, e a carregada seguinte
 * manda só esses — o que já veio não se paga duas vezes.
 *
 * Se NENHUM lote passar, atira-se: o painel precisa da frase para ela poder
 * fazer alguma coisa, e «traduzi zero campos» sem uma palavra não é uma frase.
 */
export function motorDeepL(chave: string, buscar: typeof fetch = fetch): MotorDeTraducao {
  async function pedirUmLote(lote: string[], glossario: string | null): Promise<string[]> {
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
        text: lote,
        source_lang: "PT",
        // «EN» sozinho está descontinuado. A Líquen é europeia e os casais que
        // recebem estas propostas em inglês são, quase sempre, do Reino Unido
        // ou da Irlanda.
        target_lang: "EN-GB",
        // O vocabulário da casa, quando o serviço o aceitou. `undefined` não
        // chega a aparecer no JSON — um pedido sem glossário é um pedido igual
        // aos de antes de haver glossário nenhum.
        glossary_id: glossario ?? undefined,
        // Sem `tag_handling`: os campos da proposta são texto simples, e
        // declarar XML ou HTML fazia um «<» escrito por ela virar uma etiqueta.
        // Sem `formality`: o DeepL não o suporta para inglês — ver o cabeçalho.
      }),
    });

    if (!r.ok) throw new ErroDoServico(porqueRecusou(r.status), eDefinitivo(r.status), r.status);

    const corpo = (await r.json().catch(() => null)) as RespostaDeepL | null;
    const traduzidos = (corpo?.translations ?? []).map((t) =>
      typeof t?.text === "string" ? t.text : "",
    );
    // A mesma trava da fronteira, dita aqui com o nome certo: um lote a que
    // faltem textos desalinha tudo o que vem a seguir, e a partir daí a
    // tradução de um campo fica noutro campo. Um lote é um pedido seu, com o seu
    // array de textos e o seu array de respostas: recusá-lo não contamina os
    // outros.
    if (traduzidos.length !== lote.length) {
      throw new ErroDoServico(
        `o serviço devolveu ${traduzidos.length} traduções para ${lote.length} textos`,
        false,
      );
    }
    return traduzidos;
  }

  return async (textos: string[]): Promise<string[]> => {
    // Nada a traduzir não é um pedido — é uma chamada que se poupa, e uma
    // resposta vazia que não é preciso interpretar.
    if (textos.length === 0) return [];

    // O vocabulário da casa, se o serviço o quiser dar. `null` é um pedido
    // exactamente igual aos de antes de haver glossário: pior inglês, nunca
    // menos tradução.
    let glossario = await idDoGlossario(chave, buscar);

    const saida = new Array<string>(textos.length).fill("");
    let posicao = 0;
    let algumPassou = false;
    let primeiroErro: unknown = null;

    for (const lote of emLotes(textos)) {
      const inicio = posicao;
      posicao += lote.length;
      if (primeiroErro instanceof ErroDoServico && primeiroErro.definitivo) continue;
      try {
        let traduzidos: string[];
        try {
          traduzidos = await pedirUmLote(lote, glossario);
        } catch (e) {
          if (!glossario || !podeSerDoGlossario(e)) throw e;
          // Só uma vez, e para todos os lotes a seguir: o glossário fica de
          // fora e repete-se ESTE pedido sem ele. Um pedido recusado não gasta
          // caracteres, portanto a repetição não se paga duas vezes.
          esquecerGlossarios();
          glossario = null;
          traduzidos = await pedirUmLote(lote, null);
        }
        for (const [i, t] of traduzidos.entries()) saida[inicio + i] = t;
        algumPassou = true;
      } catch (e) {
        primeiroErro ??= e;
      }
    }

    if (!algumPassou && primeiroErro) throw primeiroErro;
    return saida;
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
