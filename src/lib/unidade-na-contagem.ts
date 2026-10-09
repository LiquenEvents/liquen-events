/**
 * A UNIDADE CONCORDA COM O NÚMERO — «0 sacos», «1 saco», «3 sacos»
 *
 * O Material, o material do evento e o Inventário escreviam a unidade tal como
 * foi gravada, no singular: «0 saco», «12 unidade». MEDIDO na passagem de 9 de
 * outubro.
 *
 * Em português de Portugal o zero leva plural («0 sacos»), e só o 1 (e o −1)
 * fica no singular. As abreviaturas não se flexionam («3 un.», «2 kg», «5 m»),
 * e uma unidade que já foi escrita no plural fica como está.
 *
 * As regras são as dos substantivos que aparecem como unidade numa casa de
 * decoração (saco, caixa, rolo, metro, par, unidade, peça, molho, vaso, flor,
 * item). Não é uma gramática inteira, e não precisa de ser: o que não sabe
 * flexionar devolve tal e qual, que é o que já acontecia.
 */
export function unidadeNaContagem(n: number, unidade: string | null | undefined): string {
  const u = (unidade ?? "").trim();
  if (!u) return "";
  if (Math.abs(n) === 1) return u;
  // Abreviaturas («un.», «kg», «m», «cm», «L») e o que já está no plural.
  if (u.endsWith(".") || u.length <= 2 || /[sx]$/i.test(u)) return u;
  if (/ão$/i.test(u)) return u.replace(/ão$/i, "ões");
  if (/[aeiouáéíóúâêô]$/i.test(u)) return `${u}s`;
  if (/m$/i.test(u)) return u.replace(/m$/i, "ns");
  if (/[rz]$/i.test(u)) return `${u}es`;
  if (/al$/i.test(u)) return u.replace(/al$/i, "ais");
  return u;
}

/** «0 sacos», «1 saco» — o número e a unidade, com o espaço certo. */
export function quantidadeComUnidade(n: number, unidade: string | null | undefined): string {
  const u = unidadeNaContagem(n, unidade);
  return u ? `${n} ${u}` : String(n);
}
