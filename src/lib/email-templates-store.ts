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
    subject: "A sua proposta — Líquen Events",
    updatedAt: "1970-01-01T00:00:00.000Z",
    body: [
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">`,
      `  <h2 style="font-size:18px;margin:0 0 16px;color:#1b2119">A sua proposta está pronta</h2>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Olá {nome},</p>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Foi um gosto conhecer a sua visão. Preparámos uma proposta à medida do seu evento, com todo o cuidado que ele merece.</p>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 20px">Pode consultá-la aqui: <a href="{link}" style="color:#7c854b">{link}</a></p>`,
      `  <p style="font-size:13px;line-height:1.6;margin:0 0 20px;color:#555">Ficamos a aguardar o seu feedback — qualquer ajuste é bem-vindo. Basta responder a este email.</p>`,
      `  <hr style="border:none;border-top:1px solid #eee;margin:0 0 12px">`,
      `  <p style="font-size:12px;color:#999;margin:0">Líquen Events · Évora, Alentejo</p>`,
      `</div>`,
    ].join("\n"),
  },
  {
    key: "sinal-recebido",
    name: "Sinal recebido",
    subject: "Sinal recebido — reserva confirmada",
    updatedAt: "1970-01-01T00:00:00.000Z",
    body: [
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">`,
      `  <h2 style="font-size:18px;margin:0 0 16px;color:#1b2119">Está tudo tratado</h2>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Olá {nome},</p>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Confirmamos a receção do sinal de <strong style="color:#7c854b">{valor}</strong>. A sua data está oficialmente reservada e podemos avançar com a preparação.</p>`,
      `  <p style="font-size:13px;margin:0 0 16px;color:#555">Data do evento: <strong>{data_evento}</strong></p>`,
      `  <p style="font-size:13px;line-height:1.6;margin:0 0 20px;color:#555">Nas próximas semanas iremos afinar cada detalhe consigo. Para já, pode descansar — o mais importante já está garantido.</p>`,
      `  <hr style="border:none;border-top:1px solid #eee;margin:0 0 12px">`,
      `  <p style="font-size:12px;color:#999;margin:0">Líquen Events · Évora, Alentejo</p>`,
      `</div>`,
    ].join("\n"),
  },
  {
    key: "semana-evento",
    name: "Falta uma semana",
    subject: "Falta uma semana — {data_evento}",
    updatedAt: "1970-01-01T00:00:00.000Z",
    body: [
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">`,
      `  <h2 style="font-size:18px;margin:0 0 16px;color:#1b2119">A contagem decrescente começou</h2>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Olá {nome},</p>`,
      `  <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Falta apenas uma semana para o grande dia. Está tudo alinhado da nossa parte e mal podemos esperar por o receber em <strong>{local}</strong>.</p>`,
      `  <p style="font-size:13px;line-height:1.6;margin:0 0 20px;color:#555">Se surgir alguma questão de última hora, estamos a um email de distância. Aproveite estes dias com tranquilidade — o resto é connosco.</p>`,
      `  <hr style="border:none;border-top:1px solid #eee;margin:0 0 12px">`,
      `  <p style="font-size:12px;color:#999;margin:0">Líquen Events · Évora, Alentejo</p>`,
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
      `  <p style="font-size:12px;color:#999;margin:0">Líquen Events · Évora, Alentejo</p>`,
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
 * placeholder is replaced (missing keys → empty string); values are
 * HTML-escaped so merge data can't inject markup into the email body.
 */
export function renderTemplate(
  t: EmailTemplate,
  vars: Record<string, string>,
): { subject: string; body: string } {
  const replace = (s: string): string =>
    s.replace(/\{(\w+)\}/g, (_m, key: string) => (key in vars ? esc(vars[key]) : ""));
  return { subject: replace(t.subject), body: replace(t.body) };
}
