/**
 * ════════════════════════════════════════════════════════════════════════════
 * A RECUSA DO SERVIDOR, DITA A QUEM ESTÁ A TRABALHAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As rotas já dizem o que está mal — `firstError` devolve a primeira queixa do
 * esquema e ela vai no corpo do 400. O back office deitava-a fora e punha no
 * lugar «Não foi possível guardar as alterações»: uma frase que não nomeia o
 * campo nem diz o que fazer, e que deixa a pessoa a carregar no mesmo botão
 * para sempre.
 *
 * ── PORQUE É QUE ISTO NÃO É UM SEGUNDO SISTEMA DE MENSAGENS ────────────────
 * Não há aqui catálogo nenhum de erros a manter em paralelo com o esquema: o
 * que o servidor mandar é o que se mostra. O que isto faz é uma coisa só —
 * apanhar as frases que vêm da BIBLIOTECA (o Zod fala inglês, e «Too small:
 * expected number to be >=0» não é uma frase para quem está a marcar um
 * casamento) e dizê-las em português. Tudo o resto passa tal e qual, porque
 * tudo o resto já foi escrito nesta casa e já está na língua certa.
 */

/** As formas em que o Zod 4 escreve as queixas que chegam ao ecrã. */
const TRADUCOES: { padrao: RegExp; frase: (m: RegExpMatchArray) => string }[] = [
  {
    padrao: /^Too small: expected number to be >=(-?[\d.]+)/i,
    frase: (m) =>
      Number(m[1]) === 0
        ? "O número não pode ser inferior a 0."
        : `O número não pode ser inferior a ${numero(m[1])}.`,
  },
  {
    padrao: /^Too big: expected number to be <=(-?[\d.]+)/i,
    frase: (m) => `O número não pode ser superior a ${numero(m[1])}.`,
  },
  {
    padrao: /^Too small: expected string to have >=(\d+) characters/i,
    frase: (m) =>
      m[1] === "1"
        ? "O campo não pode ficar em branco."
        : `O texto tem de ter pelo menos ${m[1]} caracteres.`,
  },
  {
    padrao: /^Too big: expected string to have <=(\d+) characters/i,
    frase: (m) => `O texto é demasiado longo (o máximo são ${m[1]} caracteres).`,
  },
  {
    padrao: /^Invalid input: expected int, received number/i,
    frase: () => "O número tem de ser inteiro.",
  },
  {
    padrao: /^Invalid input: expected number/i,
    frase: () => "O valor tem de ser um número.",
  },
  { padrao: /^Invalid option: expected one of/i, frase: () => "Essa opção não é válida." },
  { padrao: /^Invalid input/i, frase: () => "Há um campo com um valor que não serve." },
];

const numero = (s: string) => s.replace(".", ",");

/**
 * Devolve a queixa do servidor em português. As que já vêm em português — que
 * são as desta casa — voltam intactas.
 */
export function erroDoServidorEmPortugues(mensagem: string | undefined | null): string | null {
  const texto = (mensagem ?? "").trim();
  if (!texto) return null;
  for (const { padrao, frase } of TRADUCOES) {
    const m = texto.match(padrao);
    if (m) return frase(m);
  }
  return texto;
}

/**
 * Lê a recusa de uma resposta e diz porquê, em português.
 *
 * O corpo pode não ser JSON nenhum (um 502 de um intermediário, uma página de
 * erro): aí não se inventa razão nenhuma — devolve-se `null` e quem chamou diz
 * o que sabe dizer.
 */
export async function porqueRecusou(res: Response): Promise<string | null> {
  try {
    const j = (await res.json()) as { error?: unknown } | null;
    const erro = typeof j?.error === "string" ? j.error : null;
    return erroDoServidorEmPortugues(erro);
  } catch {
    return null;
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FALHA QUE NÃO VEIO DO SERVIDOR — porque nem sequer chegou lá
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `porqueRecusou` acima trata da RESPOSTA. Falta o caso em que resposta não
 * há nenhuma: o wi-fi caiu, o telemóvel saiu de rede, o servidor não atendeu.
 * Aí o `fetch` LANÇA, e o que ele lança é um `Error` como outro qualquer —
 * com uma `message` escrita pelo browser, em inglês, e diferente em cada um:
 *
 *   Chrome   `Failed to fetch`
 *   Safari   `Load failed`
 *   Firefox  `NetworkError when attempting to fetch resource.`
 *
 * ── O QUE ISTO ESTAVA A FAZER, MEDIDO ─────────────────────────────────────
 * Em Definições, cortada a ligação a meio do «Guardar deslocação», o aviso que
 * aparecia no ecrã era, literalmente, **«Failed to fetch»**. O mesmo ao criar
 * um pedido novo. Duas coisas de uma vez: uma frase inglesa num back office
 * português, e — pior — uma frase que não diz o que interessa, que é **o valor
 * NÃO ficou gravado**.
 *
 * E o texto de recurso que estava escrito para este caso nunca chegava a ser
 * usado: `e instanceof Error ? e.message : "Não foi possível guardar."` — a
 * falha de rede TAMBÉM é um `Error`, portanto o ramo da direita é código morto.
 *
 * ── PORQUE É QUE ISTO NÃO É UMA LISTA DE MENSAGENS DE ERRO ────────────────
 * Não se traduz nada nem se inventa catálogo nenhum: o que esta função faz é
 * distinguir DUAS ORIGENS. Se a mensagem foi escrita nesta casa (o
 * `throw new Error(porqueRecusou(res))` de quem chama), passa tal e qual —
 * porque já está na língua certa e já nomeia o campo. Se veio da biblioteca do
 * browser, é substituída pela frase de recurso de quem chama, que é quem sabe
 * o que se estava a tentar fazer («Não foi possível guardar.»).
 *
 * O reconhecimento é por FORMA e não por texto exacto: qualquer `TypeError`
 * conta (é o que os três browsers lançam), e as três frases conhecidas contam
 * mesmo quando reembrulhadas. Uma frase inglesa desconhecida que escape a isto
 * volta a aparecer no ecrã — e é assim que se dá por ela.
 */
const FRASES_DO_BROWSER =
  /^(failed to fetch|load failed|networkerror when attempting to fetch resource\.?|network request failed|the network connection was lost\.?|the internet connection appears to be offline\.?)$/i;

export function porqueFalhou(erro: unknown, recurso: string): string {
  if (erro instanceof TypeError) return recurso;
  if (!(erro instanceof Error)) return recurso;
  const texto = erro.message.trim();
  if (!texto || FRASES_DO_BROWSER.test(texto)) return recurso;
  return texto;
}
