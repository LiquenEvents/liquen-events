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
