import { createHash } from "node:crypto";
import { EVENTOS, type NomeEvento } from "./eventos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CONVERSIONS API DA META — O ENVIO PELO SERVIDOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
 * O pixel corre no browser, e no browser há o ITP do Safari (que expira
 * cookies escritos por JavaScript ao fim de sete dias), bloqueadores de
 * anúncios, e o browser interno do Instagram com armazenamento particionado.
 * Uma conta que só tenha pixel vê uma fracção das conversões, e a fracção que
 * vê é enviesada — perde precisamente o iPhone, que neste mercado é a maior
 * parte do público. O envio do servidor não passa por nada disso.
 *
 * ── O QUE VAI CIFRADO E O QUE NÃO VAI ──────────────────────────────────────
 * Cifrado em SHA-256, sobre o valor NORMALIZADO:
 *     em (email), ph (telefone), fn (nome), ln (apelido), ct, st, zp, country
 * NÃO cifrado, nunca:
 *     fbp, fbc, client_ip_address, client_user_agent
 *
 * Cifrar o `fbp`/`fbc` é o erro clássico desta integração e não dá erro
 * nenhum: os eventos são aceites, a correspondência é que fica a zero, e
 * descobre-se semanas depois a olhar para uma qualidade de correspondência
 * inexplicavelmente má. Há um teste que prende isto.
 *
 * ── O QUE ESTE FICHEIRO NÃO FAZ ────────────────────────────────────────────
 * Não decide se PODE enviar. Isso é do `consentimento.ts`, e quem chama tem
 * de perguntar lá primeiro. Aqui só se constrói e se envia.
 *
 * ── CONFIGURAÇÃO ───────────────────────────────────────────────────────────
 *   META_DATASET_ID          o conjunto de dados (era "pixel ID")
 *   META_CAPI_ACCESS_TOKEN   o token de acesso, gerado no Events Manager
 *   META_CAPI_TEST_CODE      opcional; enquanto está definido, os eventos vão
 *                            para o separador "Test events" e NÃO contam para
 *                            a optimização. É como se confere que isto
 *                            funciona sem sujar os dados reais.
 *
 * Sem as duas primeiras, tudo aqui é inerte: `enviarEventos` devolve
 * `{ enviado: false, motivo: "sem-configuracao" }` e não abre socket nenhum.
 * O repositório não guarda nenhum destes valores.
 */

/**
 * A versão da Graph API no URL.
 *
 * Fixada de propósito, e não em "a mais recente": a Meta muda comportamento
 * entre versões e uma actualização silenciosa é a forma de a medição parar de
 * funcionar sem ninguém tocar em nada. Subir isto é uma decisão a tomar com o
 * registo de alterações da Meta à frente.
 */
export const VERSAO_API = "v21.0";

export const ENDPOINT = (datasetId: string) =>
  `https://graph.facebook.com/${VERSAO_API}/${datasetId}/events`;

/** Onde é que a acção aconteceu, na taxonomia da Meta. */
export type FonteDaAccao = "website" | "system_generated" | "business_messaging" | "phone_call";

export interface DadosDaPessoa {
  email?: string;
  telefone?: string;
  nome?: string;
  /** NÃO cifrar. Vem do cookie `_fbp` do pixel. */
  fbp?: string;
  /** NÃO cifrar. Vem do cookie `_fbc` ou é construído do `fbclid`. */
  fbc?: string;
  /** NÃO cifrar. */
  ip?: string;
  /** NÃO cifrar. */
  agente?: string;
}

export interface EventoParaEnviar {
  nome: NomeEvento;
  /** O MESMO que o pixel usou. Ver eventos.ts. */
  eventId: string;
  /** Segundos UNIX. */
  quando: number;
  /** URL da página onde aconteceu, já sem parâmetros sensíveis. */
  url?: string;
  fonte: FonteDaAccao;
  pessoa: DadosDaPessoa;
  /** Só no Purchase. Valor SEM IVA, em euros. */
  valor?: number;
  /** Rótulo do conteúdo, por exemplo "s/comporta". */
  contexto?: string;
}

/**
 * Normalização antes de cifrar. A Meta exige-a, e sem ela a correspondência
 * cai: "Ana@Exemplo.PT " e "ana@exemplo.pt" dariam resumos diferentes e a
 * mesma pessoa apareceria como duas.
 */
export function normalizarEmail(v: string): string {
  return v.trim().toLowerCase();
}

/**
 * Telefone: só dígitos, com indicativo do país e SEM o `+`.
 *
 * Um número português escrito como "919 259 820" não tem indicativo. Escrito
 * assim, a Meta procuraria "919259820" e não encontraria ninguém. Por isso um
 * número nacional de nove dígitos começado por 9 (telemóvel) ou 2 (fixo) leva
 * o 351 à frente. É a mesma regra que a rota do orçamento já aplica para
 * construir a ligação de WhatsApp da equipa.
 */
export function normalizarTelefone(v: string): string {
  const digitos = v.replace(/\D/g, "");
  if (!digitos) return "";
  if (/^[92]\d{8}$/.test(digitos)) return `351${digitos}`;
  return digitos;
}

/** Nome próprio: minúsculas, sem espaços à volta, sem acentos. */
export function normalizarNome(v: string): string {
  return v.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** SHA-256 em hexadecimal minúsculo, que é o que a Meta espera. */
export function cifrar(v: string): string {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

/**
 * `user_data` no formato da API.
 *
 * Um campo vazio é OMITIDO em vez de ir vazio: enviar `"em": [""]` conta como
 * uma chave de correspondência que nunca corresponde e baixa a pontuação de
 * qualidade da correspondência sem trazer nada.
 */
export function construirUserData(p: DadosDaPessoa): Record<string, unknown> {
  const ud: Record<string, unknown> = {};
  const email = p.email ? normalizarEmail(p.email) : "";
  if (email) ud.em = [cifrar(email)];
  const telefone = p.telefone ? normalizarTelefone(p.telefone) : "";
  if (telefone) ud.ph = [cifrar(telefone)];
  if (p.nome) {
    // A Meta quer nome próprio e apelido separados. Primeira palavra e última;
    // com uma palavra só, vai só o nome próprio — inventar um apelido a partir
    // do nada faria a correspondência falhar em vez de melhorar.
    const partes = p.nome.trim().split(/\s+/).filter(Boolean);
    if (partes.length > 0) ud.fn = [cifrar(normalizarNome(partes[0]))];
    if (partes.length > 1) ud.ln = [cifrar(normalizarNome(partes[partes.length - 1]))];
  }
  // Estes quatro vão EM CRU. Ver o cabeçalho.
  if (p.fbp) ud.fbp = p.fbp;
  if (p.fbc) ud.fbc = p.fbc;
  if (p.ip) ud.client_ip_address = p.ip;
  if (p.agente) ud.client_user_agent = p.agente;
  return ud;
}

/** Um evento no formato que o endpoint aceita. */
export function construirEvento(e: EventoParaEnviar): Record<string, unknown> {
  const evento: Record<string, unknown> = {
    event_name: e.nome,
    event_time: e.quando,
    event_id: e.eventId,
    action_source: e.fonte,
    user_data: construirUserData(e.pessoa),
  };
  if (e.url) evento.event_source_url = e.url;
  const custom: Record<string, unknown> = {};
  if (typeof e.valor === "number" && e.valor > 0) {
    custom.value = Math.round(e.valor * 100) / 100;
    custom.currency = "EUR";
  }
  if (e.contexto) {
    custom.content_name = e.contexto;
    custom.content_category = "casamentos";
  }
  if (Object.keys(custom).length) evento.custom_data = custom;
  return evento;
}

export interface ResultadoEnvio {
  enviado: boolean;
  motivo?: "sem-configuracao" | "recusado" | "erro-de-rede";
  /** O que a Meta respondeu, quando respondeu. Para o registo. */
  detalhe?: string;
  /** Quantos eventos a Meta disse ter recebido. */
  recebidos?: number;
}

/**
 * Envia os eventos.
 *
 * NUNCA LANÇA. Um erro de medição não pode fazer cair um pedido de orçamento —
 * o lead vale mil vezes mais do que o evento. Quem chama trata o resultado
 * como informação, não como condição.
 */
export async function enviarEventos(
  eventos: EventoParaEnviar[],
  opcoes: {
    datasetId?: string;
    token?: string;
    codigoDeTeste?: string;
    /** Injectável para os testes; por omissão o `fetch` global. */
    buscar?: typeof fetch;
    /** Corta o pedido. A rota do orçamento tem 30 s no total. */
    tempoLimiteMs?: number;
  } = {},
): Promise<ResultadoEnvio> {
  const datasetId = opcoes.datasetId ?? process.env.META_DATASET_ID ?? "";
  const token = opcoes.token ?? process.env.META_CAPI_ACCESS_TOKEN ?? "";
  if (!datasetId || !token) return { enviado: false, motivo: "sem-configuracao" };
  if (eventos.length === 0) return { enviado: true, recebidos: 0 };

  const corpo: Record<string, unknown> = { data: eventos.map(construirEvento) };
  const codigo = opcoes.codigoDeTeste ?? process.env.META_CAPI_TEST_CODE ?? "";
  if (codigo) corpo.test_event_code = codigo;

  const buscar = opcoes.buscar ?? fetch;
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), opcoes.tempoLimiteMs ?? 4000);
  try {
    const res = await buscar(ENDPOINT(datasetId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // O token vai no cabeçalho e NÃO na query. Na query acabaria no
        // registo de acessos de qualquer intermediário pelo caminho.
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(corpo),
      signal: controlador.signal,
    });
    const texto = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        enviado: false,
        motivo: "recusado",
        detalhe: `${res.status} ${texto.slice(0, 300)}`,
      };
    }
    let recebidos: number | undefined;
    try {
      const j = JSON.parse(texto) as { events_received?: number };
      recebidos = j.events_received;
    } catch {
      /* resposta sem JSON — não impede nada */
    }
    return { enviado: true, recebidos };
  } catch (err) {
    return {
      enviado: false,
      motivo: "erro-de-rede",
      detalhe: String(err instanceof Error ? err.message : err).slice(0, 200),
    };
  } finally {
    clearTimeout(limite);
  }
}

/**
 * O IP do cliente, para a correspondência.
 *
 * Na Vercel o pedido chega por um proxy, portanto o IP do socket é da
 * infraestrutura e não serve. Lê-se do cabeçalho, e só o PRIMEIRO valor de
 * `x-forwarded-for`, que é o do cliente — os seguintes são os proxies.
 */
export function ipDoPedido(cabecalhos: Headers): string {
  const xff = cabecalhos.get("x-forwarded-for") ?? "";
  const primeiro = xff.split(",")[0]?.trim() ?? "";
  return primeiro || (cabecalhos.get("x-real-ip") ?? "").trim();
}

/** Um `Purchase` a partir de um casamento fechado. Só existe no servidor. */
export function eventoDeFecho(args: {
  eventId: string;
  quando: number;
  valorSemIva: number;
  pessoa: DadosDaPessoa;
  ref: string;
}): EventoParaEnviar {
  return {
    nome: EVENTOS.purchase,
    eventId: args.eventId,
    quando: args.quando,
    // `system_generated`: não foi o visitante que carregou em nada — foi o
    // back office a mudar o estado do pedido. Declarar `website` aqui seria
    // dizer à Meta que houve uma acção no sítio que não houve.
    fonte: "system_generated",
    pessoa: args.pessoa,
    valor: args.valorSemIva,
    contexto: `casamento-fechado:${args.ref}`,
  };
}
