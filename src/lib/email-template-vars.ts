import { eurDocumento, montanteNaLingua } from "./money";
import { eventTypeName } from "./orcamento/data";
import { dataIso } from "./validation";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS VARIÁVEIS DOS MODELOS — E A LINHA QUE SEPARA QUEM RECEBE DE QUEM ASSINA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sem `server-only`: o menu de variáveis e a pré-visualização do back office
 * leem isto no navegador, e o envio lê-o no servidor. É o mesmo catálogo dos
 * dois lados de propósito — um menu que ofereça um nome que o envio não conhece
 * é um buraco no email de um cliente.
 *
 * ── PORQUE É QUE A ENTRADA NÃO É UM `Record<string,string>` ───────────────
 *
 * Esteve a sair correio a clientes ASSINADO COM O NOME DELES. A causa está
 * noutro ficheiro e é de outra pessoa; o que se decide AQUI é que este sistema
 * de variáveis não pode ser mais um sítio onde a mesma troca aconteça.
 *
 * Um mapa achatado — `{ nome, email, … }` — é precisamente o desenho que a
 * permite: há um `nome` só, quem o preenche escolhe de quem ele é, e uma linha
 * distraída dá o do destinatário a quem assina. Por isso a entrada tem
 * COMPARTIMENTOS SEPARADOS ({@link EntradaDosValores}): o `destinatario` e o
 * `remetente` são dois objectos diferentes, com caminhos diferentes, e não há
 * nenhum ponto em que os dois passem pela mesma variável. Trocá-los deixa de
 * ser uma distracção possível e passa a ser um erro de compilação.
 *
 * E, para o caso em que ninguém indica quem assina, a rede: o
 * `remetente_nome` cai em {@link REMETENTE_POR_OMISSAO}, o nome da casa —
 * NUNCA num valor do destinatário. Vazio também não serve: um email assinado
 * por ninguém é estranho, um assinado pelo próprio cliente é uma avaria à
 * vista. Há um teste que percorre TODAS as variáveis e exige que nenhuma, fora
 * as do cliente, contenha o nome do cliente.
 *
 * ── OS NOMES TAMBÉM NÃO SE CONFUNDEM ──────────────────────────────────────
 *
 * Não há nenhum `{{nome}}`. Há `{{cliente_nome}}` e `{{remetente_nome}}`, cada
 * um com o seu dono escrito no princípio, e no menu do editor aparecem em
 * grupos separados. Quem escreve o modelo não tem de adivinhar de quem é o
 * nome que está a inserir.
 */

/** Quem assina, quando ninguém disser quem. A casa — jamais o cliente. */
export const REMETENTE_POR_OMISSAO = "Líquen Events";

export type GrupoDeVariavel = "cliente" | "evento" | "proposta" | "remetente";

export interface VariavelDoModelo {
  chave: string;
  rotulo: string;
  grupo: GrupoDeVariavel;
  /** O que ela faz, em português de quem escreve o email. */
  dica: string;
  /** O que se vê na pré-visualização quando não há proposta escolhida. */
  exemplo: string;
}

/**
 * O catálogo. A ORDEM é a do menu, e os grupos são a razão de ele existir.
 */
export const VARIAVEIS: VariavelDoModelo[] = [
  {
    chave: "cliente_nome",
    rotulo: "Primeiro nome",
    grupo: "cliente",
    dica: "só o primeiro nome de quem recebe («Marta»)",
    exemplo: "Marta",
  },
  {
    chave: "cliente_nome_completo",
    rotulo: "Nome completo",
    grupo: "cliente",
    dica: "o nome tal como ele o escreveu no pedido",
    exemplo: "Marta Gaspar e João Pereira",
  },
  {
    chave: "evento_tipo",
    rotulo: "Tipo de evento",
    grupo: "evento",
    dica: "casamento, batizado, jantar de gala…",
    exemplo: "Casamento",
  },
  {
    chave: "evento_data",
    rotulo: "Data",
    grupo: "evento",
    dica: "a data por extenso — VAZIA quando ainda não está definida",
    exemplo: "12 de setembro de 2026",
  },
  {
    chave: "evento_local",
    rotulo: "Local",
    grupo: "evento",
    dica: "o espaço do evento, se já estiver escolhido",
    exemplo: "Herdade da Malhadinha",
  },
  {
    chave: "valor_total",
    rotulo: "Valor total",
    grupo: "proposta",
    dica: "o total da proposta, com IVA e já formatado",
    exemplo: "14.500,00 €",
  },
  {
    chave: "validade_data",
    rotulo: "Validade",
    grupo: "proposta",
    dica: "até quando a proposta se mantém",
    exemplo: "31 de março de 2026",
  },
  {
    chave: "sinal_percentagem",
    rotulo: "Sinal (%)",
    grupo: "proposta",
    dica: "a percentagem do sinal, com o símbolo",
    exemplo: "30%",
  },
  {
    chave: "link_proposta",
    rotulo: "Ligação da proposta",
    grupo: "proposta",
    dica: "o endereço onde o cliente vê e aceita a proposta",
    exemplo: "https://liquenevents.pt/proposta/exemplo",
  },
  {
    chave: "mensagem_pessoal",
    rotulo: "Mensagem pessoal",
    grupo: "proposta",
    dica: "o que escreveste no estúdio para ESTE casal — vazio quando não escreveste nada",
    exemplo: "O arco de flores fica incluído, como combinámos.",
  },
  {
    chave: "remetente_nome",
    rotulo: "Quem assina",
    grupo: "remetente",
    dica: "quem envia o email — NUNCA o nome do cliente",
    exemplo: "Catarina Gaspar",
  },
];

export const VARIAVEIS_POR_GRUPO: { grupo: GrupoDeVariavel; titulo: string; itens: VariavelDoModelo[] }[] =
  (["cliente", "evento", "proposta", "remetente"] as GrupoDeVariavel[]).map((grupo) => ({
    grupo,
    titulo: {
      cliente: "Cliente",
      evento: "Evento",
      proposta: "Proposta",
      remetente: "Quem assina",
    }[grupo],
    itens: VARIAVEIS.filter((v) => v.grupo === grupo),
  }));

/** Os valores de exemplo do catálogo, para a pré-visualização sem proposta. */
export const VALORES_DE_EXEMPLO: Record<string, string> = Object.fromEntries(
  VARIAVEIS.map((v) => [v.chave, v.exemplo]),
);

// ── A entrada ──────────────────────────────────────────────────────────────

/** QUEM RECEBE. */
export interface Destinatario {
  nomeCompleto?: string;
  email?: string;
}

/** QUEM ASSINA. Compartimento à parte — ver o cabeçalho. */
export interface Remetente {
  nome?: string;
}

export interface DadosDoEvento {
  /** A chave do tipo (`casamentos`, …); o rótulo sai na língua de quem lê. */
  tipo?: string;
  dataIso?: string;
  local?: string;
}

export interface DadosDaProposta {
  /** Já COM IVA — é o número que o cliente vê em baixo na folha. */
  totalComIva?: number;
  moeda?: string;
  validadeIso?: string;
  sinalPercentagem?: number;
  link?: string;
  /** A mensagem escrita à mão no estúdio para esta proposta, se houver. */
  mensagemPessoal?: string;
}

export interface EntradaDosValores {
  destinatario: Destinatario;
  evento?: DadosDoEvento;
  proposta?: DadosDaProposta;
  remetente?: Remetente;
  idioma?: "pt" | "en";
}

/**
 * O PRIMEIRO nome, que é como se saúda alguém.
 *
 * Há quem escreva o nome legal inteiro no formulário, e «Olá Francisco Maria
 * Carrelhas Das Neves Da Palma Gaspar,» já saiu mesmo assim num email da casa.
 */
export function primeiroNome(nome: string | undefined | null): string {
  const inteiro = String(nome ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!inteiro) return "";
  // UM CASAL SÃO DUAS PESSOAS, e a saudação tem de as apanhar às duas.
  // «Marta Sofia Gaspar e João Pedro Pereira» não pode virar «Marta»: metade
  // do casal desaparecia do «Olá». Corta-se pela conjunção e fica o primeiro
  // nome de cada um — «Marta e João», que é como eles se tratam.
  const partes = inteiro.split(/\s+(?:e|&|and)\s+/i);
  if (partes.length > 1) {
    return partes
      .map((parte) => parte.trim().split(" ")[0])
      .filter(Boolean)
      .join(" e ");
  }
  return inteiro.split(" ")[0] ?? "";
}

/** A data como se escreve («12 de setembro de 2026»), ou VAZIO. */
function dataPorExtenso(iso: string | undefined, idioma: "pt" | "en"): string {
  const s = dataIso(iso);
  if (!s) return "";
  // Meio-dia: a hora não interessa, só não pode escorregar de dia.
  return new Date(`${s}T12:00:00`).toLocaleDateString(idioma === "en" ? "en-GB" : "pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Os valores para o interpretador, a partir de compartimentos separados.
 *
 * ── O QUE FALTA FICA VAZIO ────────────────────────────────────────────────
 *
 * Nunca «a definir», nunca «—», nunca «0 €». Um substituto inventado sai no
 * email como se fosse uma decisão dela («Falta uma semana para a definir»), e
 * é indistinguível de um dado verdadeiro para quem lê. Vazio é honesto: quem
 * escreve o modelo tem o `{{#se}}` para dizer o que fazer nesse caso, e quem
 * envia tem o `variaveisPorPreencher` para recusar quando nem isso há.
 */
export function construirValores(entrada: EntradaDosValores): Record<string, string> {
  const idioma = entrada.idioma === "en" ? "en" : "pt";
  const { destinatario, evento, proposta, remetente } = entrada;

  const nomeCompleto = String(destinatario?.nomeCompleto ?? "").trim();
  const total = proposta?.totalComIva;
  const sinal = proposta?.sinalPercentagem;

  return {
    // ── Cliente ──
    cliente_nome: primeiroNome(nomeCompleto),
    cliente_nome_completo: nomeCompleto,
    // ── Evento ──
    evento_tipo: eventTypeName(evento?.tipo, idioma),
    evento_data: dataPorExtenso(evento?.dataIso, idioma),
    evento_local: String(evento?.local ?? "").trim(),
    // ── Proposta ──
    valor_total:
      typeof total === "number" && Number.isFinite(total)
        ? montanteNaLingua(eurDocumento(total, proposta?.moeda ?? "EUR"), idioma)
        : "",
    validade_data: dataPorExtenso(proposta?.validadeIso, idioma),
    sinal_percentagem:
      typeof sinal === "number" && Number.isFinite(sinal) && sinal > 0 ? `${sinal}%` : "",
    link_proposta: String(proposta?.link ?? "").trim(),
    mensagem_pessoal: String(proposta?.mensagemPessoal ?? "").trim(),
    // ── Quem assina ────────────────────────────────────────────────────────
    // Esta linha lê o `remetente` E MAIS NADA. É a única do ficheiro que
    // escreve `remetente_nome`, e o recurso é o nome da casa: não há caminho,
    // nem com dados em falta, por onde o valor do destinatário aqui chegue.
    remetente_nome: String(remetente?.nome ?? "").trim() || REMETENTE_POR_OMISSAO,
  };
}
