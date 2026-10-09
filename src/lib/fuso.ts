/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM FUSO SÓ (A8-016)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Europe/Lisbon» estava escrito à mão em treze sítios, e cada um decidia por
 * si o que era «hoje». Os que o esqueciam davam datas de Greenwich: a página
 * do casal mostrava «Atualizada a» no dia errado ao lado de «Emitida a» no dia
 * certo (A8-001). Vive aqui, sem dependências, para poder ser importado tanto
 * pelo servidor como pelo browser.
 */

/** O fuso do estúdio. A validade de uma proposta é um DIA DO CALENDÁRIO, e o
 *  calendário que conta é o de quem a envia — ver {@link resolveValidUntil}. */
export const FUSO_DO_ESTUDIO = "Europe/Lisbon";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONSTRUÍDO À PRIMEIRA UTILIZAÇÃO, E NÃO À LEITURA DO FICHEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estava no topo do módulo, e custava 19,91 ms MEDIDOS a cada arranque a frio
 * — porque o primeiro `Intl.DateTimeFormat` de um processo carrega o ICU
 * inteiro. O segundo custa 0,14 ms.
 *
 * E quem o usa (o {@link hojeNoEstudio}, para os prazos das facturas) NÃO é
 * chamado pela página que o casal abre. Ela pagava vinte milissegundos, em
 * cada abertura fria, para construir um formatador de datas que nunca ia usar.
 *
 * Vinte milissegundos parecem nada até se lembrar onde caem: no arranque a
 * frio da função, que é precisamente o instante em que o casal está a olhar
 * para um ecrã branco à espera da proposta.
 *
 * Quem o usa continua a pagá-los, uma vez, na primeira chamada — já os pagava.
 */
let camposDoDia: Intl.DateTimeFormat | null = null;

/** O ano/mês/dia que o relógio de Portugal marca neste instante. */
function diaDoEstudio(instante: Date): [ano: number, mes: number, dia: number] {
  camposDoDia ??= new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_DO_ESTUDIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const partes = camposDoDia.formatToParts(instante);
  const campo = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return [campo("year"), campo("month"), campo("day")];
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * ════════════════════════════════════════════════════════════════════════════
 * HOJE (`yyyy-mm-dd`) — E «HOJE» É O DIA QUE PORTUGAL ESTÁ A VIVER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `new Date().toISOString().slice(0, 10)` é o dia de GREENWICH. Os servidores
 * correm em UTC e, no Verão, Portugal está uma hora à frente: das 00:00 à 01:00
 * o dia já virou cá e ainda não virou lá.
 *
 * Isto não é um detalhe de ecrã. É a data que fica num DOCUMENTO FISCAL: um
 * casal que aceita a proposta às 00:30 de 14 de agosto ficava com a factura do
 * sinal — auto-emitida, sem passar por ecrã nenhum — datada de 13 de agosto. É
 * essa data que sai impressa no PDF e que decide o período de IVA.
 *
 * O ecrã das Faturas já tinha esta regra escrita (`todayKey()`, em
 * `admin/util.ts`, com o relógio do browser, que aí é o de quem está sentado à
 * frente dele). Do lado do SERVIDOR o relógio da máquina não serve para nada:
 * o dia tem de ser lido no fuso do estúdio, e é o que o {@link diaDoEstudio} já
 * fazia para a validade das propostas. Isto é só esse dia escrito por extenso —
 * uma quarta versão do «hoje» era a que ia ficar por corrigir.
 *
 * `instante` é injectável para os testes poderem fixar a hora.
 */
export function hojeNoEstudio(instante: Date = new Date()): string {
  const [ano, mes, dia] = diaDoEstudio(instante);
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}
