import "server-only";
import { esc } from "./mail";
import { createRepository, type Mapper } from "./repository";

/**
 * Editable transactional-email templates for the back office.
 *
 * `key` is the STABLE slug (e.g. "proposta-enviada") and doubles as the row's
 * primary id — the Supabase table `email_templates` must have an `id` text
 * column holding this slug (the Repository/Backend key off the `id` column).
 * `body` is HTML with `{merge}` placeholders resolved by `renderTemplate`.
 */
export interface EmailTemplate {
  key: string;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
}

export const mapper: Mapper<EmailTemplate> = {
  table: "email_templates",
  fileName: "email-templates.json",
  getId: (t) => t.key,
  // The slug is persisted as the primary `id` column so the shared Backend
  // (which filters on `id`) keys off it directly.
  toRow: (t) => ({
    id: t.key,
    name: t.name,
    subject: t.subject,
    body: t.body,
    updated_at: t.updatedAt || new Date().toISOString(),
  }),
  fromRow: (r) => ({
    key: String(r.id ?? ""),
    name: String(r.name ?? ""),
    subject: String(r.subject ?? ""),
    body: String(r.body ?? ""),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }),
  order: { column: "id", ascending: true },
  fileCompare: (a, b) => a.key.localeCompare(b.key),
  /**
   * SEM `touch`, e isto merece explicação porque a tabela É do tipo que se
   * perde: o corpo de um modelo é texto escrito por uma pessoa, exactamente a
   * classe de trabalho que o bloqueio optimista existe para salvar.
   *
   * A razão é que aqui ele não salvava nada. O compare-and-set do Repository só
   * evita perdas quando a escrita é um PATCH PARCIAL fundido sobre uma leitura
   * velha — é aí que a repetição do `updateWith` relê e volta a aplicar o
   * patch por cima do que a outra pessoa gravou. O `upsertTemplate` escreve a
   * LINHA INTEIRA (`name`, `subject`, `body`, todos vindos do formulário), por
   * isso a repetição reaplicaria a substituição completa e o resultado final
   * seria byte a byte o mesmo: o último a gravar continua a ganhar. Ligar a
   * comparação daria uma ida-e-volta a mais e a sensação de estar protegido.
   *
   * O que resolve isto de verdade é o desenho que a Visão Geral já usa (ver
   * `overview-settings-store` + `src/app/api/visao-geral/route.ts`): quem grava
   * DIZ sobre que versão escreveu, e se já não for a actual a escrita é
   * recusada com 409 e a versão do servidor no corpo, para o ecrã mostrar as
   * duas. Isso precisa de um `baseUpdatedAt` vindo do cliente — meia dúzia de
   * linhas aqui, na rota, e no editor. A coluna `updated_at` desta tabela já
   * existe e já é escrita, portanto a base para isso está pronta.
   */
};

const repo = createRepository(mapper);

/** Available `{merge}` placeholders, documented for the editor cheatsheet. */
export const MERGE_FIELDS: { key: string; label: string }[] = [
  { key: "nome", label: "Nome do cliente" },
  { key: "link", label: "Ligação (ex.: proposta)" },
  { key: "valor", label: "Valor / montante" },
  { key: "data_evento", label: "Data do evento" },
  { key: "local", label: "Local do evento" },
  { key: "empresa", label: "Nome da empresa" },
];

/**
 * Seed templates. `listTemplatesWithDefaults()` merges any stored rows over
 * these, so a fresh install always exposes the full set even before the
 * operator has saved anything.
 */
export const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    key: "proposta-enviada",
    name: "Proposta enviada",
    subject: "A sua proposta | Líquen Events",
    updatedAt: "1970-01-01T00:00:00.000Z",
    body: [
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">`,
      `  <h2 style="font-size:18px;margin:0 0 16px;color:#1b2119">A sua proposta está pronta</h2>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Olá {nome},</p>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Foi um gosto conhecer a sua visão. Preparámos uma proposta à medida do seu evento, com todo o cuidado que ele merece.</p>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 20px">Pode consultá-la aqui: <a href="{link}" style="color:#7c854b">{link}</a></p>`,
      `  <p style="font-size:13px;line-height:1.6;margin:0 0 20px;color:#555">Ficamos a aguardar o seu feedback e qualquer ajuste é bem-vindo. Basta responder a este email.</p>`,
      `  <hr style="border:none;border-top:1px solid #eee;margin:0 0 12px">`,
      `  <p style="font-size:12px;color:#999;margin:0">Líquen Events · Portugal</p>`,
      `</div>`,
    ].join("\n"),
  },
  {
    key: "sinal-recebido",
    name: "Sinal recebido",
    subject: "Sinal recebido, reserva confirmada",
    updatedAt: "1970-01-01T00:00:00.000Z",
    body: [
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">`,
      `  <h2 style="font-size:18px;margin:0 0 16px;color:#1b2119">Está tudo tratado</h2>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Olá {nome},</p>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Confirmamos a receção do sinal de <strong style="color:#7c854b">{valor}</strong>. A sua data está oficialmente reservada e podemos avançar com a preparação.</p>`,
      `  <p style="font-size:13px;margin:0 0 16px;color:#555">Data do evento: <strong>{data_evento}</strong></p>`,
      `  <p style="font-size:13px;line-height:1.6;margin:0 0 20px;color:#555">Nas próximas semanas iremos afinar cada detalhe consigo. Para já, pode descansar, o mais importante já está garantido.</p>`,
      `  <hr style="border:none;border-top:1px solid #eee;margin:0 0 12px">`,
      `  <p style="font-size:12px;color:#999;margin:0">Líquen Events · Portugal</p>`,
      `</div>`,
    ].join("\n"),
  },
  {
    key: "semana-evento",
    name: "Falta uma semana",
    subject: "Falta uma semana para {data_evento}",
    updatedAt: "1970-01-01T00:00:00.000Z",
    body: [
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">`,
      `  <h2 style="font-size:18px;margin:0 0 16px;color:#1b2119">A contagem decrescente começou</h2>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Olá {nome},</p>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Falta apenas uma semana para o grande dia. Está tudo alinhado da nossa parte e mal podemos esperar por o receber em <strong>{local}</strong>.</p>`,
      `  <p style="font-size:13px;line-height:1.6;margin:0 0 20px;color:#555">Se surgir alguma questão de última hora, estamos a um email de distância. Aproveite estes dias com tranquilidade, o resto é connosco.</p>`,
      `  <hr style="border:none;border-top:1px solid #eee;margin:0 0 12px">`,
      `  <p style="font-size:12px;color:#999;margin:0">Líquen Events · Portugal</p>`,
      `</div>`,
    ].join("\n"),
  },
  {
    key: "agradecimento",
    name: "Agradecimento pós-evento",
    subject: "Obrigado por nos ter escolhido",
    updatedAt: "1970-01-01T00:00:00.000Z",
    body: [
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">`,
      `  <h2 style="font-size:18px;margin:0 0 16px;color:#1b2119">Foi uma honra</h2>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Olá {nome},</p>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Obrigado por nos ter confiado um dia tão especial. Foi um privilégio fazer parte dele e ver tudo ganhar vida.</p>`,
      `  <p style="font-size:13px;line-height:1.6;margin:0 0 20px;color:#555">Se guardou fotografias ou quiser partilhar uma palavra sobre a experiência, teríamos muito gosto em ouvi-lo. Até uma próxima celebração!</p>`,
      `  <hr style="border:none;border-top:1px solid #eee;margin:0 0 12px">`,
      `  <p style="font-size:12px;color:#999;margin:0">Líquen Events · Portugal</p>`,
      `</div>`,
    ].join("\n"),
  },
];

export const listTemplates = (): Promise<EmailTemplate[]> => repo.list();

export const getTemplate = (key: string): Promise<EmailTemplate | null> => repo.get(key);

/**
 * Stored templates layered over {@link DEFAULT_TEMPLATES}: every default key is
 * always present (falling back to the seed copy), and stored edits win. Any
 * stored template whose key isn't a default is appended too.
 */
export async function listTemplatesWithDefaults(): Promise<EmailTemplate[]> {
  const stored = await repo.list();
  const byKey = new Map(stored.map((t) => [t.key, t]));
  const merged = DEFAULT_TEMPLATES.map((d) => byKey.get(d.key) ?? d);
  const known = new Set(DEFAULT_TEMPLATES.map((d) => d.key));
  for (const t of stored) if (!known.has(t.key)) merged.push(t);
  return merged;
}

/** Create or update a template by key, stamping `updatedAt`. */
export async function upsertTemplate(
  t: Omit<EmailTemplate, "updatedAt"> & { updatedAt?: string },
): Promise<EmailTemplate> {
  const entity: EmailTemplate = {
    key: t.key,
    name: t.name,
    subject: t.subject,
    body: t.body,
    updatedAt: new Date().toISOString(),
  };
  const existing = await repo.get(t.key);
  if (existing) {
    const updated = await repo.update(t.key, entity);
    return updated ?? entity;
  }
  await repo.create(entity);
  return entity;
}

/**
 * Resolve `{key}` placeholders in the subject and body against `vars`. Every
 * placeholder is replaced (missing keys → empty string).
 *
 * O CORPO É ESCAPADO, O ASSUNTO NÃO — e a diferença não é um descuido.
 *
 * O corpo é HTML e vai para dentro do email como markup: escapar os valores é
 * o que impede que os dados de um cliente lá metam etiquetas. O assunto é um
 * cabeçalho RFC 5322, texto de uma ponta à outra, e quem o codifica é o
 * nodemailer no envio; passá-lo pelo `esc` não protegia coisa nenhuma e só se
 * via — uma «Marta & João» recebia um email endereçado a «Marta &amp; João»,
 * com o nome dela mal escrito na única linha que ela lê antes de abrir.
 *
 * A pré-visualização do back office faz esta mesma distinção
 * (`renderPreview` / `renderPreviewSubject` em `email-template-format.ts`).
 * As duas andam sempre juntas: mudar uma sem a outra faz o ecrã mentir.
 */
export function renderTemplate(
  t: EmailTemplate,
  vars: Record<string, string>,
): { subject: string; body: string } {
  const replace = (s: string, escapar: boolean): string =>
    s.replace(/\{(\w+)\}/g, (_m, key: string) =>
      key in vars ? (escapar ? esc(vars[key]) : String(vars[key] ?? "")) : "",
    );
  return { subject: replace(t.subject, false), body: replace(t.body, true) };
}

// ═══════════════════════════════════════════════════════════════════════════
// OS MODELOS BILINGUES, E O HISTÓRICO — SEM MEXER NO ESQUEMA
// ═══════════════════════════════════════════════════════════════════════════
//
// As propostas são bilingues e o email tem de seguir a língua do cliente. O
// histórico de versões tem de deixar voltar atrás. Nenhuma das duas coisas
// cabe nas colunas que a tabela `email_templates` tem hoje (`id`, `name`,
// `subject`, `body`, `updated_at`) — mas as duas cabem em LINHAS.
//
// ── PORQUÊ LINHAS E NÃO COLUNAS NOVAS ─────────────────────────────────────
//
// Uma coluna nova (`body_en`, ou um `versoes` em JSON) é uma migração, e uma
// migração é uma coisa que ela quer aprovar antes — e com razão: é o género de
// mudança que corre bem em nove instalações e deixa a décima sem conseguir
// gravar um email. O que aqui se faz não toca no esquema:
//
//   • o INGLÊS de um modelo é outra linha, com o `id` sufixado por `@en`;
//   • cada VERSÃO antiga é outra linha, com o `id` sufixado por `#v<instante>`.
//
// As colunas que uma versão precisa são exactamente as que a tabela já tem —
// assunto, corpo, nome, e um instante. Não há nada a acrescentar.
//
// ── O QUE ISTO CUSTA, DITO POR EXTENSO ────────────────────────────────────
//
// A tabela passa a ter mais linhas, e a cópia de segurança lê-a inteira (tecto
// de 20 MB, ver `api/email-templates/route.ts`). Por isso o {@link MAX_VERSOES}
// existe e é apertado: dez versões por modelo e por língua, as mais antigas
// caem. Com o tecto de 20 000 caracteres por corpo, o pior caso de um modelo
// são ~440 KB — folgado, e limitado por construção.
//
// O caminho por direito continua a ser uma tabela `email_template_versions`
// com o seu `template_id` e a sua data. Fica escrito no relatório com a forma
// que teria; até ela aprovar a migração, isto funciona hoje e não perde nada.

export type IdiomaDoModelo = "pt" | "en";

/** O separador da língua e o das versões. Nenhum aparece numa chave nossa. */
const SUFIXO_EN = "@en";
const SUFIXO_VERSAO = "#v";

/** Quantas versões antigas se guardam, por modelo e por língua. */
export const MAX_VERSOES = 10;

/** O `id` da linha onde este modelo, nesta língua, está guardado. */
export function idFisico(chave: string, idioma: IdiomaDoModelo): string {
  return idioma === "en" ? `${chave}${SUFIXO_EN}` : chave;
}

/** O `id` da linha de uma versão arquivada. */
export function idDeVersao(chave: string, idioma: IdiomaDoModelo, instante: string): string {
  return `${idFisico(chave, idioma)}${SUFIXO_VERSAO}${instante}`;
}

export function ehLinhaDeVersao(id: string): boolean {
  return String(id ?? "").includes(SUFIXO_VERSAO);
}

/** De volta às três partes. Uma chave sem sufixos é portuguesa e é actual. */
export function decomporId(id: string): {
  chave: string;
  idioma: IdiomaDoModelo;
  versaoEm: string | null;
} {
  let resto = String(id ?? "");
  let versaoEm: string | null = null;
  const corte = resto.indexOf(SUFIXO_VERSAO);
  if (corte !== -1) {
    versaoEm = resto.slice(corte + SUFIXO_VERSAO.length);
    resto = resto.slice(0, corte);
  }
  const idioma: IdiomaDoModelo = resto.endsWith(SUFIXO_EN) ? "en" : "pt";
  const chave = idioma === "en" ? resto.slice(0, -SUFIXO_EN.length) : resto;
  return { chave, idioma, versaoEm };
}

export interface LadoDoModelo {
  subject: string;
  body: string;
  /** Vazio enquanto esta língua nunca foi guardada (está a sair a de origem). */
  updatedAt: string;
}

export interface ModeloBilingue {
  chave: string;
  nome: string;
  /** Onde é que ele é usado, em português de quem o vai escrever. */
  descricao: string;
  pt: LadoDoModelo;
  en: LadoDoModelo;
}

export interface VersaoDeModelo {
  chave: string;
  idioma: IdiomaDoModelo;
  /** O instante em que este texto DEIXOU de ser o actual. */
  versaoEm: string;
  nome: string;
  subject: string;
  body: string;
}

const paragrafo = (html: string) =>
  `<p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#2a2620">${html}</p>`;

const ligacao = (texto: string) =>
  `<a href="{{link_proposta}}" style="color:#637a5f">${texto}</a>`;

/**
 * ── A MENSAGEM PESSOAL DENTRO DO MODELO ───────────────────────────────────
 *
 * A rota `proposta-doc` explica que, quando ela escreve uma mensagem para
 * acompanhar UMA proposta, o modelo fica de fora — porque o corpo de um modelo
 * é markup opaco e não há onde lá enfiar a mensagem sem adivinhar. Adivinhar
 * era mesmo a única alternativa, e despejá-la no fim punha-a depois do botão
 * onde muita gente já carregou.
 *
 * O `{{mensagem_pessoal}}` desfaz o nó pelo lado certo: deixa de se adivinhar
 * porque É ELA QUE DIZ ONDE. Nestes modelos de origem está logo a seguir ao
 * cumprimento — o mesmo sítio que o texto da casa lhe dá — e dentro de um
 * `{{#se}}`, para que um envio sem mensagem não deixe um parágrafo vazio.
 *
 * O que falta para isto valer no envio a sério é a rota da proposta passar a
 * mensagem para os valores em vez de desistir do modelo. Essa mudança é de UMA
 * LINHA e está noutro território — fica no relatório com ficheiro e linha.
 */
const MENSAGEM_PESSOAL = `{{#se mensagem_pessoal}}${paragrafo("{{mensagem_pessoal}}")}{{/se}}`;

export interface ModeloDeOrigem {
  chave: string;
  nome: string;
  descricao: string;
  pt: { subject: string; body: string };
  en: { subject: string; body: string };
}

/**
 * OS TRÊS DE ORIGEM. São ELA a escrever, não nós a redigir por ela: o «Registo
 * formal» é, palavra por palavra, o email que ela já manda hoje.
 *
 * O TRATAMENTO É «VOSSO», COM MAIÚSCULA, e não é gralha nenhuma — é como ela
 * trata o casal. Há um teste que falha se alguém o «corrigir».
 */
export const MODELOS_DE_ORIGEM: ModeloDeOrigem[] = [
  {
    chave: "registo-formal",
    nome: "Registo formal",
    descricao:
      "O tom que já usas: a proposta segue em anexo, com a ligação para a ver online. É o modelo " +
      "de partida para a maioria dos envios.",
    pt: {
      subject: "Proposta de decoração | Líquen Events",
      body: [
        paragrafo("Olá {{cliente_nome}}, boa tarde,"),
        MENSAGEM_PESSOAL,
        paragrafo(
          "De acordo com o solicitado, enviamos a nossa proposta de decoração e respetivo " +
            "orçamento{{#se evento_local}} para o {{evento_tipo}} no {{evento_local}}{{/se}}" +
            "{{#se evento_data}}, a {{evento_data}}{{/se}}.",
        ),
        // O parágrafo INTEIRO dentro do bloco, e não só o texto: um `<p>` que
        // sobrasse vazio abria um buraco branco no meio do email.
        `{{#se_nao evento_data}}${paragrafo(
          "Ainda aguardamos a informação relativamente à data, mas podemos depois acrescentá-la à proposta.",
        )}{{/se_nao}}`,
        paragrafo(
          `A proposta segue em anexo e pode também ser consultada aqui: ${ligacao("Ver a proposta online")}`,
        ),
        paragrafo(
          "Estamos ao Vosso dispor para esclarecimento de alguma dúvida ou questão, ou adaptação e " +
            "ajuste de alguma ideia ou outras sugestões de decor.",
        ),
        paragrafo("Obrigada, agradecemos a atenção e aguardamos o Vosso feedback."),
      ].join("\n"),
    },
    en: {
      subject: "Decoration proposal | Líquen Events",
      body: [
        paragrafo("Dear {{cliente_nome}}, good afternoon,"),
        MENSAGEM_PESSOAL,
        paragrafo(
          "As requested, we are sending our decoration proposal and respective quote" +
            "{{#se evento_local}} for the {{evento_tipo}} at {{evento_local}}{{/se}}" +
            "{{#se evento_data}}, on {{evento_data}}{{/se}}.",
        ),
        `{{#se_nao evento_data}}${paragrafo(
          "We are still awaiting the date; we can add it to the proposal later on.",
        )}{{/se_nao}}`,
        paragrafo(
          `The proposal is attached and can also be viewed here: ${ligacao("View the proposal online")}`,
        ),
        paragrafo(
          "We remain at your disposal for any question, or for adjusting any idea or suggesting " +
            "other decor options.",
        ),
        paragrafo("Thank you for your time — we look forward to your feedback."),
      ].join("\n"),
    },
  },
  {
    chave: "resumo-evento",
    nome: "Com resumo do evento",
    descricao:
      "O mesmo que o registo formal, mais um bloco com o tipo, a data, o local, o valor e a " +
      "validade. Para quando queres que o essencial se leia sem abrir o anexo.",
    pt: {
      subject: "Proposta de decoração | Líquen Events",
      body: [
        paragrafo("Olá {{cliente_nome}}, boa tarde,"),
        MENSAGEM_PESSOAL,
        paragrafo(
          "De acordo com o solicitado, enviamos a nossa proposta de decoração e respetivo " +
            "orçamento{{#se evento_local}} para o {{evento_tipo}} no {{evento_local}}{{/se}}" +
            "{{#se evento_data}}, a {{evento_data}}{{/se}}.",
        ),
        `{{#se_nao evento_data}}${paragrafo(
          "Ainda aguardamos a informação relativamente à data, mas podemos depois acrescentá-la à proposta.",
        )}{{/se_nao}}`,
        // Cada linha do resumo dentro do seu bloco: um resumo com «Local:» sem
        // local ao lado é pior do que um resumo com uma linha a menos.
        paragrafo(
          [
            "{{#se evento_tipo}}<strong>Evento:</strong> {{evento_tipo}}<br>{{/se}}",
            "{{#se evento_data}}<strong>Data:</strong> {{evento_data}}<br>{{/se}}",
            "{{#se evento_local}}<strong>Local:</strong> {{evento_local}}<br>{{/se}}",
            "{{#se valor_total}}<strong>Valor total (c/ IVA):</strong> {{valor_total}}<br>{{/se}}",
            "{{#se validade_data}}<strong>Válida até:</strong> {{validade_data}}{{/se}}",
          ].join(""),
        ),
        paragrafo(
          `A proposta segue em anexo e pode também ser consultada aqui: ${ligacao("Ver a proposta online")}`,
        ),
        paragrafo(
          "Estamos ao Vosso dispor para esclarecimento de alguma dúvida ou questão, ou adaptação e " +
            "ajuste de alguma ideia ou outras sugestões de decor.",
        ),
        paragrafo("Obrigada, agradecemos a atenção e aguardamos o Vosso feedback."),
      ].join("\n"),
    },
    en: {
      subject: "Decoration proposal | Líquen Events",
      body: [
        paragrafo("Dear {{cliente_nome}}, good afternoon,"),
        MENSAGEM_PESSOAL,
        paragrafo(
          "As requested, we are sending our decoration proposal and respective quote" +
            "{{#se evento_local}} for the {{evento_tipo}} at {{evento_local}}{{/se}}" +
            "{{#se evento_data}}, on {{evento_data}}{{/se}}.",
        ),
        `{{#se_nao evento_data}}${paragrafo(
          "We are still awaiting the date; we can add it to the proposal later on.",
        )}{{/se_nao}}`,
        paragrafo(
          [
            "{{#se evento_tipo}}<strong>Event:</strong> {{evento_tipo}}<br>{{/se}}",
            "{{#se evento_data}}<strong>Date:</strong> {{evento_data}}<br>{{/se}}",
            "{{#se evento_local}}<strong>Venue:</strong> {{evento_local}}<br>{{/se}}",
            "{{#se valor_total}}<strong>Total (incl. VAT):</strong> {{valor_total}}<br>{{/se}}",
            "{{#se validade_data}}<strong>Valid until:</strong> {{validade_data}}{{/se}}",
          ].join(""),
        ),
        paragrafo(
          `The proposal is attached and can also be viewed here: ${ligacao("View the proposal online")}`,
        ),
        paragrafo(
          "We remain at your disposal for any question, or for adjusting any idea or suggesting " +
            "other decor options.",
        ),
        paragrafo("Thank you for your time — we look forward to your feedback."),
      ].join("\n"),
    },
  },
  {
    chave: "curto",
    nome: "Curto",
    descricao:
      "Três linhas, a ligação, o valor e a validade. Para quando já falaste com o cliente e o " +
      "email só precisa de entregar a proposta.",
    pt: {
      subject: "A Vossa proposta | Líquen Events",
      body: [
        paragrafo("Olá {{cliente_nome}},"),
        MENSAGEM_PESSOAL,
        paragrafo(
          `Segue a nossa proposta${"{{#se evento_data}}"} para {{evento_data}}${"{{/se}}"}: ` +
            `${ligacao("Ver a proposta online")}`,
        ),
        paragrafo(
          "{{#se valor_total}}Valor total, com IVA: <strong>{{valor_total}}</strong>.{{/se}}" +
            "{{#se validade_data}} Válida até {{validade_data}}.{{/se}}",
        ),
        paragrafo("Ficamos a aguardar o Vosso feedback."),
      ].join("\n"),
    },
    en: {
      subject: "Your proposal | Líquen Events",
      body: [
        paragrafo("Dear {{cliente_nome}},"),
        MENSAGEM_PESSOAL,
        paragrafo(
          `Here is our proposal${"{{#se evento_data}}"} for {{evento_data}}${"{{/se}}"}: ` +
            `${ligacao("View the proposal online")}`,
        ),
        paragrafo(
          "{{#se valor_total}}Total, including VAT: <strong>{{valor_total}}</strong>.{{/se}}" +
            "{{#se validade_data}} Valid until {{validade_data}}.{{/se}}",
        ),
        paragrafo("We look forward to your feedback."),
      ].join("\n"),
    },
  },
];

/**
 * Os modelos ANTIGOS vistos como bilingues: o português é o que eles têm, o
 * inglês nasce vazio.
 *
 * Vazio e não traduzido: traduzir à máquina o texto dela é exactamente o que
 * esta casa se recusa a fazer nos documentos. Enquanto o lado inglês estiver
 * vazio, quem envia sabe que não há versão inglesa — que é a verdade — em vez
 * de mandar ao casal uma tradução que ninguém leu.
 */
const origensAntigas = (): ModeloDeOrigem[] =>
  DEFAULT_TEMPLATES.map((d) => ({
    chave: d.key,
    nome: d.name,
    descricao: "",
    pt: { subject: d.subject, body: d.body },
    en: { subject: "", body: "" },
  }));

const TODAS_AS_ORIGENS = (): ModeloDeOrigem[] => [...origensAntigas(), ...MODELOS_DE_ORIGEM];

const ladoVazio = (): LadoDoModelo => ({ subject: "", body: "", updatedAt: "" });

/**
 * Os modelos, nas duas línguas, com o que está guardado por cima do de origem.
 *
 * O guardado ganha SEMPRE, e por lado: um modelo com o português já escrito
 * por ela e o inglês ainda por escrever mostra o dela à esquerda e o de origem
 * à direita, que é o que se quer ver para o poder acabar.
 */
export async function listarModelos(): Promise<ModeloBilingue[]> {
  const linhas = await repo.list();
  const actuais = new Map<string, EmailTemplate>();
  for (const l of linhas) if (!ehLinhaDeVersao(l.key)) actuais.set(l.key, l);

  const lado = (guardado: EmailTemplate | undefined, origem: { subject: string; body: string }) =>
    guardado
      ? { subject: guardado.subject, body: guardado.body, updatedAt: guardado.updatedAt }
      : { subject: origem.subject, body: origem.body, updatedAt: "" };

  const saida: ModeloBilingue[] = [];
  const vistas = new Set<string>();
  for (const origem of TODAS_AS_ORIGENS()) {
    vistas.add(origem.chave);
    vistas.add(idFisico(origem.chave, "en"));
    saida.push({
      chave: origem.chave,
      nome: origem.nome,
      descricao: origem.descricao,
      pt: lado(actuais.get(origem.chave), origem.pt),
      en: lado(actuais.get(idFisico(origem.chave, "en")), origem.en),
    });
  }
  // Modelos criados por ela, que não são de origem nenhuma.
  for (const [id, guardado] of actuais) {
    if (vistas.has(id)) continue;
    const { chave, idioma } = decomporId(id);
    if (vistas.has(chave)) continue;
    const jaLa = saida.find((m) => m.chave === chave);
    const destino = jaLa ?? {
      chave,
      nome: guardado.name || chave,
      descricao: "",
      pt: ladoVazio(),
      en: ladoVazio(),
    };
    destino[idioma] = {
      subject: guardado.subject,
      body: guardado.body,
      updatedAt: guardado.updatedAt,
    };
    if (!jaLa) saida.push(destino);
  }
  return saida;
}

/** Um instante livre para arquivar — o mesmo milissegundo pode repetir-se. */
function instanteLivre(ocupados: Set<string>, partida: string): string {
  let t = Date.parse(partida);
  if (!Number.isFinite(t)) t = Date.now();
  let iso = new Date(t).toISOString();
  while (ocupados.has(iso)) iso = new Date(++t).toISOString();
  return iso;
}

/**
 * Guardar um lado de um modelo, ARQUIVANDO antes o que lá estava.
 *
 * O arquivo é o histórico: guarda-se o texto que DEIXA de ser o actual, com o
 * instante em que deixou de o ser. Um texto igual ao que já lá estava não gera
 * versão nenhuma — um «Guardar» sem alterações não é um ponto na história.
 */
export async function guardarModelo(entrada: {
  chave: string;
  nome: string;
  idioma: IdiomaDoModelo;
  subject: string;
  body: string;
}): Promise<EmailTemplate> {
  const id = idFisico(entrada.chave, entrada.idioma);
  const anterior = await repo.get(id);

  if (anterior && (anterior.subject !== entrada.subject || anterior.body !== entrada.body)) {
    const versoes = await listarVersoes(entrada.chave, entrada.idioma);
    const instante = instanteLivre(
      new Set(versoes.map((v) => v.versaoEm)),
      anterior.updatedAt || new Date().toISOString(),
    );
    await repo.create({
      key: idDeVersao(entrada.chave, entrada.idioma, instante),
      name: anterior.name,
      subject: anterior.subject,
      body: anterior.body,
      updatedAt: instante,
    });
    // As mais antigas caem. Ver o tecto e a razão no cabeçalho desta secção.
    const todas = [...versoes.map((v) => v.versaoEm), instante].sort();
    for (const velha of todas.slice(0, Math.max(0, todas.length - MAX_VERSOES))) {
      await repo.remove(idDeVersao(entrada.chave, entrada.idioma, velha));
    }
  }

  const entidade: EmailTemplate = {
    key: id,
    name: entrada.nome,
    subject: entrada.subject,
    body: entrada.body,
    updatedAt: new Date().toISOString(),
  };
  if (anterior) {
    const actualizado = await repo.update(id, entidade);
    return actualizado ?? entidade;
  }
  await repo.create(entidade);
  return entidade;
}

/** O histórico deste modelo nesta língua, do mais recente para o mais antigo. */
export async function listarVersoes(
  chave: string,
  idioma: IdiomaDoModelo,
): Promise<VersaoDeModelo[]> {
  const prefixo = `${idFisico(chave, idioma)}${SUFIXO_VERSAO}`;
  const linhas = await repo.list();
  return linhas
    .filter((l) => l.key.startsWith(prefixo))
    .map((l) => ({
      chave,
      idioma,
      versaoEm: l.key.slice(prefixo.length),
      nome: l.name,
      subject: l.subject,
      body: l.body,
    }))
    .sort((a, b) => b.versaoEm.localeCompare(a.versaoEm));
}

/**
 * Voltar a uma versão. `null` quando ela já não existe (caiu pelo tecto, ou o
 * ecrã ficou aberto enquanto outra pessoa gravava) — e nesse caso NÃO se toca
 * em nada: repor um texto adivinhado era pior do que dizer que não dá.
 *
 * A reversão é ela própria uma gravação, portanto o texto que estava a sair
 * até agora fica no histórico. Voltar atrás nunca é um caminho sem regresso.
 */
export async function reverterPara(
  chave: string,
  idioma: IdiomaDoModelo,
  versaoEm: string,
): Promise<EmailTemplate | null> {
  const versao = (await listarVersoes(chave, idioma)).find((v) => v.versaoEm === versaoEm);
  if (!versao) return null;
  return guardarModelo({
    chave,
    nome: versao.nome,
    idioma,
    subject: versao.subject,
    body: versao.body,
  });
}
