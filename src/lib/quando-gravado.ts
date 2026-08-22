/**
 * ════════════════════════════════════════════════════════════════════════════
 * «GUARDADO ÀS 14:32» — DE QUE DIA?
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do inventário de esperas, e apareceu em **três implementações
 * independentes**: a barra da gravação automática, a Visão Geral e o estúdio
 * diziam todos a hora e nenhum dizia o dia.
 *
 * Numa proposta gravada há dez minutos isso está certo — pôr-lhe a data era
 * ruído. O problema é o caso em que a pergunta se faz: **uma proposta reaberta
 * no dia seguinte** diz «guardado às 14:32» e parece acabada de gravar. É
 * exactamente aí que se quer saber se aquilo é de hoje.
 *
 * E as variantes de alarme herdavam o mesmo defeito — «guardado só neste
 * computador às 14:32», «guardado às 14:32, num sítio que o próximo deploy
 * apaga». Nessas a data importa mais, porque é ela que diz **quanto trabalho
 * está em risco**: uma cópia local de há duas horas e uma de há duas semanas
 * são duas conversas diferentes.
 *
 * ── PORQUE É QUE NÃO LEVA SEMPRE A DATA ───────────────────────────────────
 *
 * Porque a barra vive por baixo do campo que se está a escrever, e «guardado a
 * 22/08 às 14:32» a cada dois segundos é uma linha comprida a dizer o que já se
 * sabe. Uma etiqueta que cresce sem necessidade é uma etiqueta que se aprende a
 * não ler — e esta tem de ser lida no dia em que estiver a avisar de alguma
 * coisa.
 *
 * Por isso: **hoje só a hora, ontem por extenso, e mais atrás com a data.**
 */

const HORA: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
const DIA: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };

/** O mesmo dia do calendário de quem está a olhar — não «há menos de 24 h». */
function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * «14:32» · «ontem às 14:32» · «12/08 às 14:32» · «12/08/2025 às 14:32».
 *
 * Devolve cadeia vazia para uma data que não se consegue ler — quem chama já
 * tem a frase para o caso de não haver hora nenhuma, e uma «Invalid Date» no
 * ecrã é pior do que a ausência.
 *
 * `agora` entra por argumento para os testes não dependerem do relógio da
 * máquina que os corre.
 */
export function quandoGravado(
  quando: Date | string | null | undefined,
  agora = new Date(),
): string {
  if (!quando) return "";
  const d = quando instanceof Date ? quando : new Date(quando);
  if (Number.isNaN(d.getTime())) return "";

  const horas = d.toLocaleTimeString("pt-PT", HORA);
  if (mesmoDia(d, agora)) return horas;

  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  if (mesmoDia(d, ontem)) return `ontem às ${horas}`;

  // O ano só entra quando é outro: «12/08 às 14:32» chega para o mês passado, e
  // «12/08/2025» é o que separa uma proposta do ano passado de uma de agora.
  const dia =
    d.getFullYear() === agora.getFullYear()
      ? d.toLocaleDateString("pt-PT", DIA)
      : d.toLocaleDateString("pt-PT", { ...DIA, year: "numeric" });
  return `${dia} às ${horas}`;
}

/**
 * O mesmo, para entrar numa frase que já tem a preposição escrita — «guardado
 * **às** 14:32».
 *
 * Hoje devolve `às 14:32`; ontem, `ontem às 14:32` (sem o segundo «às», que
 * daria «guardado às ontem às 14:32»). Existe porque a alternativa era cada
 * sítio decidir sozinho onde é que a preposição cabe, e foi assim que a mesma
 * frase apareceu escrita de três maneiras.
 */
export function gravadoEmPorExtenso(
  quando: Date | string | null | undefined,
  agora = new Date(),
): string {
  const texto = quandoGravado(quando, agora);
  if (!texto) return "";
  return /^\d{2}:\d{2}$/.test(texto) ? `às ${texto}` : texto;
}
