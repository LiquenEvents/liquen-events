import type { Proposal } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUAS LINHAS COM O MESMO NOME — E NENHUMA A DIZER QUE SÃO A MESMA PESSOA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A-01 da auditoria, o sintoma que ela vê: «"Melanie e Sebastien" aparece DUAS
 * VEZES na lista de Propostas, e "Margarida & Duarte" duas vezes — sem
 * agrupamento e sem dizer que é o mesmo cliente.»
 *
 * A causa é de estrutura e está escrita à parte: não existe a entidade Cliente,
 * e por isso não há nada a que duas propostas se possam pendurar. Isso é um
 * projecto, e é dela a decisão. Isto aqui é a metade que se pode fazer sem
 * tocar nos dados — e sem prometer o que não cumpre.
 *
 * ── O QUE ISTO **NÃO** FAZ, E PORQUÊ ──────────────────────────────────────
 *
 * Não junta as linhas numa só. A tentação é essa — «agrupar» —, e seria pior:
 * cada proposta é um documento com o seu valor, o seu estado e a sua validade,
 * e esconder uma atrás da outra tira-lhe da vista a que estava a expirar. A
 * lista continua a mostrar TUDO o que mostrava.
 *
 * O que muda é que cada linha passa a saber que não está sozinha, e a dizê-lo:
 * «2.ª de 3». É essa a pergunta que ela faz quando vê o mesmo nome duas vezes —
 * *isto é um engano meu, ou são mesmo duas propostas?*
 *
 * ── PORQUE É QUE A CHAVE É O EMAIL, E SÓ O EMAIL ─────────────────────────
 *
 * Pelo nome era mais fácil e estaria errado nos dois sentidos: juntava duas
 * «Ana Silva» que não têm nada a ver uma com a outra, e separava a «Margarida
 * Serra» da «Margarida & Duarte», que é o mesmo casal escrito de duas maneiras
 * — o defeito que a própria auditoria descreve noutra linha.
 *
 * O email não tem esses dois problemas. Tem outro, mais pequeno e honesto: um
 * casal com dois emails aparece como dois clientes. Prefiro isso ao contrário —
 * dizer que duas pessoas são a mesma é um erro que ela não tem como desfazer a
 * olho; não dizer nada deixa-a exactamente onde já estava.
 *
 * Sem email, não há grupo. Um `""` não é uma pessoa, e juntar todas as
 * propostas sem email num «cliente» de doze cabeças seria inventar.
 */

/** A posição de uma proposta dentro do conjunto do mesmo cliente. */
export interface LugarNoCliente {
  /** 1 para a mais antiga. */
  ordem: number;
  /** Quantas propostas tem este cliente ao todo. */
  total: number;
}

/** Um email comparável: sem espaços à volta e sem maiúsculas. */
export function chaveDoCliente(email: string | null | undefined): string | null {
  const limpo = (email ?? "").trim().toLowerCase();
  return limpo === "" ? null : limpo;
}

/**
 * Para cada proposta com irmãs, onde ela fica na fila do cliente.
 *
 * Só entram as que TÊM irmãs: quem está sozinho não é caso nenhum, e devolver
 * «1 de 1» obrigava cada consumidor a filtrar o óbvio.
 *
 * A ordem é por `createdAt` crescente — a mais antiga é a 1.ª —, com o `id` a
 * desempatar. Sem o desempate, duas propostas criadas no mesmo segundo trocavam
 * de número entre desenhos, e um número que dança é pior do que número nenhum.
 */
export function lugaresNoCliente(
  propostas: readonly Pick<Proposal, "id" | "clientEmail" | "createdAt">[],
): Map<string, LugarNoCliente> {
  const porCliente = new Map<string, typeof propostas>();
  for (const p of propostas) {
    const chave = chaveDoCliente(p.clientEmail);
    if (chave === null) continue;
    porCliente.set(chave, [...(porCliente.get(chave) ?? []), p]);
  }

  const lugares = new Map<string, LugarNoCliente>();
  for (const grupo of porCliente.values()) {
    if (grupo.length < 2) continue;
    const ordenadas = [...grupo].sort(
      (a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id),
    );
    ordenadas.forEach((p, i) => lugares.set(p.id, { ordem: i + 1, total: ordenadas.length }));
  }
  return lugares;
}

/** O que se escreve na etiqueta. Curto, porque vive dentro de uma linha. */
export function etiquetaDoLugar(l: LugarNoCliente): string {
  return `${l.ordem}.ª de ${l.total}`;
}

/** O porquê, para quem passa o rato ou ouve a página. */
export function explicacaoDoLugar(l: LugarNoCliente): string {
  return (
    `Este cliente tem ${l.total} propostas — esta é a ${l.ordem}.ª, da mais antiga para a mais ` +
    `recente. Estão agrupadas pelo email, que é o mesmo nas ${l.total}.`
  );
}
