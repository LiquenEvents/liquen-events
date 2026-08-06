import type { ProposalDoc } from "@/lib/proposal-doc";
import { precosDe } from "@/lib/proposal-budget";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE MUDOU DE UMA VERSÃO PARA A OUTRA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma negociação de casamento tem três ou quatro rondas. Ao fim da terceira,
 * a pergunta que se faz ao telefone é sempre a mesma — "o que é que mudou desde
 * a que vos mandei?" — e a resposta hoje é abrir as duas e comparar de olho.
 *
 * ── EM PORTUGUÊS, NÃO EM CAMPOS ────────────────────────────────────────────
 * Isto não é um `diff` de JSON. Um "budgetAmounts[3]: 800 → 950" é verdade e
 * não serve para nada ao telefone. O que sai daqui são frases: "Arranjos de
 * mesa passou de 800 € para 950 €", "saiu a linha Wedding Coordinator".
 *
 * ── SÓ O QUE O CLIENTE VÊ, MAIS O DINHEIRO ─────────────────────────────────
 * Não se comparam custos nem notas internas: mudaram, mas não são o que ela
 * precisa de explicar. Compara-se o que muda a proposta aos olhos de quem a
 * recebeu — os serviços, as linhas do orçamento, o total, a validade — e o
 * dinheiro, que é o que a conversa é.
 */

export type TipoDeMudanca = "acrescentado" | "removido" | "alterado";

export interface Mudanca {
  /** Onde: "Orçamento", "Serviços", "Evento", "Total". */
  onde: string;
  tipo: TipoDeMudanca;
  /** A frase, já pronta para se ler. */
  texto: string;
}

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Compara nomes ignorando acentos, maiúsculas e espaços a mais. */
function mesmo(a: string, b: string): boolean {
  const n = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return n(a) === n(b);
}

/** As linhas do orçamento com o preço ao lado, indexadas pelo nome. */
function linhasPorNome(doc: ProposalDoc): Map<string, { nome: string; preco: number | null }> {
  const precos = precosDe(doc);
  const mapa = new Map<string, { nome: string; preco: number | null }>();
  (doc.budgetItems ?? []).forEach((item, i) => {
    const nome = texto(item);
    if (!nome) return;
    // Uma linha repetida conta uma vez: comparar duplicados por nome daria
    // "acrescentado" e "removido" para a mesma coisa.
    if (!mapa.has(nome.toLowerCase())) mapa.set(nome.toLowerCase(), { nome, preco: precos[i] });
  });
  return mapa;
}

/** Os títulos dos grupos de serviços, para ver o que entrou e saiu. */
function gruposDe(doc: ProposalDoc): string[] {
  return (doc.serviceGroups ?? []).map((g) => texto(g.title)).filter(Boolean);
}

/**
 * O que mudou entre duas versões, em frases.
 *
 * A ordem é a da conversa: primeiro o dinheiro (é o que ele vai perguntar),
 * depois as linhas do orçamento, depois os serviços, e por fim o evento.
 */
export function diferencas(antes: ProposalDoc, depois: ProposalDoc): Mudanca[] {
  const m: Mudanca[] = [];

  // ── O total ─────────────────────────────────────────────────────────────
  const totalAntes = antes.totalAmount ?? 0;
  const totalDepois = depois.totalAmount ?? 0;
  if (Math.abs(totalAntes - totalDepois) > 0.01) {
    m.push({
      onde: "Total",
      tipo: "alterado",
      texto: `O total passou de ${eur(totalAntes)} para ${eur(totalDepois)}`,
    });
  }

  // ── As linhas do orçamento ──────────────────────────────────────────────
  const linhasAntes = linhasPorNome(antes);
  const linhasDepois = linhasPorNome(depois);

  for (const [chave, l] of linhasDepois) {
    const anterior = linhasAntes.get(chave);
    if (!anterior) {
      m.push({
        onde: "Orçamento",
        tipo: "acrescentado",
        texto: l.preco === null ? `Entrou "${l.nome}"` : `Entrou "${l.nome}" por ${eur(l.preco)}`,
      });
    } else if (anterior.preco !== l.preco) {
      // Um preço que aparece ou desaparece não é o mesmo que um preço que muda,
      // e ao telefone essa diferença nota-se.
      if (anterior.preco === null) {
        m.push({
          onde: "Orçamento",
          tipo: "alterado",
          texto: `"${l.nome}" passou a ter preço: ${eur(l.preco ?? 0)}`,
        });
      } else if (l.preco === null) {
        m.push({
          onde: "Orçamento",
          tipo: "alterado",
          texto: `"${l.nome}" ficou sem preço (estava ${eur(anterior.preco)})`,
        });
      } else {
        m.push({
          onde: "Orçamento",
          tipo: "alterado",
          texto: `"${l.nome}" passou de ${eur(anterior.preco)} para ${eur(l.preco)}`,
        });
      }
    }
  }
  for (const [chave, l] of linhasAntes) {
    if (!linhasDepois.has(chave)) {
      m.push({ onde: "Orçamento", tipo: "removido", texto: `Saiu "${l.nome}"` });
    }
  }

  // ── Os grupos de serviços ───────────────────────────────────────────────
  const gAntes = gruposDe(antes);
  const gDepois = gruposDe(depois);
  for (const g of gDepois) {
    if (!gAntes.some((x) => mesmo(x, g))) {
      m.push({ onde: "Serviços", tipo: "acrescentado", texto: `Entrou o grupo "${g}"` });
    }
  }
  for (const g of gAntes) {
    if (!gDepois.some((x) => mesmo(x, g))) {
      m.push({ onde: "Serviços", tipo: "removido", texto: `Saiu o grupo "${g}"` });
    }
  }

  // ── O evento ────────────────────────────────────────────────────────────
  const campos: [keyof ProposalDoc, string][] = [
    ["eventDate", "A data"],
    ["location", "O local"],
    ["guests", "O número de convidados"],
    ["clientNames", "O nome dos clientes"],
  ];
  for (const [campo, comoSeChama] of campos) {
    const a = texto(antes[campo]);
    const b = texto(depois[campo]);
    if (a !== b && (a || b)) {
      m.push({
        onde: "Evento",
        tipo: "alterado",
        texto: !a
          ? `${comoSeChama} passou a ser "${b}"`
          : !b
            ? `${comoSeChama} ficou por preencher (era "${a}")`
            : `${comoSeChama} passou de "${a}" para "${b}"`,
      });
    }
  }

  return m;
}

/** Uma frase única para a lista de versões ("3 alterações no orçamento"). */
export function resumo(mudancas: Mudanca[]): string {
  if (mudancas.length === 0) return "Sem alterações";
  const total = mudancas.find((x) => x.onde === "Total");
  if (total) return total.texto;
  const n = mudancas.length;
  return n === 1 ? mudancas[0].texto : `${n} alterações`;
}
