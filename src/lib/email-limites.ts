/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TECTOS DO EMAIL ESCRITO À MÃO — E PORQUE É QUE VIVEM SOZINHOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * São dois números, e podiam estar ao lado do código que os aplica
 * (`email-corpo-escrito.ts`). Não estão, e a razão é uma fronteira:
 *
 * O ecrã de envio corre no BROWSER e precisa de saber o tecto para avisar
 * enquanto se escreve, em vez de deixar carregar em Enviar e apanhar um 400.
 * Mas o `email-corpo-escrito.ts` é `server-only` e importa o `mail.ts`, que
 * importa o `nodemailer` — e o `nodemailer` abre ligações SMTP, lê ficheiros e
 * não tem nada que fazer dentro de um telemóvel.
 *
 * Importar a constante de lá arrastava a cadeia inteira para o pacote do
 * browser. MEDIDO: o build parou com
 *
 *     Module not found: Can't resolve 'nodemailer'
 *       ./src/lib/mail.ts → ./src/lib/email-corpo-escrito.ts
 *       → EmailDoEnvio.tsx → ProposalStudio.tsx → AdminClient.tsx
 *
 * e a bateria de testes não o apanhou, porque o vitest não tem a fronteira
 * entre servidor e browser — só o `next build` a tem.
 *
 * Daí este ficheiro: sem `server-only`, sem uma única importação, para poder
 * ser lido dos dois lados. O sítio onde os números são APLICADOS continua a ser
 * um só; o que se partilha é a regra, não a maquinaria.
 */

/**
 * Quantos caracteres cabem no corpo escrito à mão.
 *
 * O mesmo tecto da resposta na caixa de entrada (`inbox/reply`): é a mesma
 * pessoa a escrever a mesma espécie de texto, e dois tectos diferentes para o
 * mesmo gesto seriam uma surpresa em cada um deles.
 */
export const MAXIMO_CORPO_ESCRITO = 10_000;

/**
 * Quantos caracteres cabem no assunto.
 *
 * Não é um limite técnico do correio — é de leitura: um assunto que passe
 * disto já vai cortado em qualquer caixa de entrada, e o que sobra do lado de
 * fora não diz nada a ninguém.
 */
export const MAXIMO_ASSUNTO_ESCRITO = 200;
