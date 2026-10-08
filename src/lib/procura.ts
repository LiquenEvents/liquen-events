/**
 * ════════════════════════════════════════════════════════════════════════════
 * PROCURAR COMO SE ESCREVE À PRESSA — achado n.º 10 da auditoria
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pesquisa dos Pedidos fazia só `toLowerCase`: «evora», «goncalves» e «avila»
 * davam zero resultados (com acento apareciam), e «912345678» não encontrava
 * «+351 912 345 678». É exactamente assim que se escreve numa pesquisa — sem
 * acentos e com o número como vem no telemóvel.
 *
 * Duas regras, e só estas:
 *  · letras sem acentos nem maiúsculas dos DOIS lados («É» = «e», «ç» = «c»);
 *  · com seis ou mais algarismos na procura, compara-se também só os
 *    algarismos, sem o indicativo de Portugal — é um telefone.
 */

/** O texto sem acentos e em minúsculas. */
export function paraProcura(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Só os algarismos, sem o indicativo de Portugal à frente. */
function digitos(texto: string): string {
  const d = String(texto ?? "").replace(/\D/g, "");
  return d.length > 9 ? d.replace(/^(00)?351/, "") : d;
}

/** Algum dos valores contém a procura? Procura vazia casa com tudo. */
export function casaComAProcura(procura: string, valores: readonly unknown[]): boolean {
  const q = paraProcura(procura.trim());
  if (!q) return true;
  const qDigitos = digitos(procura);
  const telefone = qDigitos.length >= 6;
  return valores.some((v) => {
    if (v == null || v === "") return false;
    const s = String(v);
    if (paraProcura(s).includes(q)) return true;
    return telefone && digitos(s).includes(qDigitos);
  });
}
