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
