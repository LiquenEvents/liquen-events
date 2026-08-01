"use client";

import type { Quote, ActivityEntry } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from "@/lib/orcamento/data";
import { ActivityLog } from "../../lazy";

/**
 * Coluna lateral do Dossier — Contacto (só leitura) + factos do Evento,
 * levantados da marcação do drawer, mais o registo de atividade (ActivityLog).
 * A edição dos factos vive nas zonas/ferramentas; aqui é referência rápida.
 */
interface Props {
  quote: Quote;
  actor: string;
  onAddEntry: (entry: ActivityEntry) => Promise<void>;
}

export default function DossierAside({ quote, actor, onAddEntry }: Props) {
  const facts: { l: string; v?: string | null }[] = [
    { l: "Tipo", v: CATEGORIES.find((c) => c.id === quote.category)?.label },
    {
      l: "Sub-tipo",
      v:
        quote.category && quote.eventType
          ? EVENT_TYPES_BY_CATEGORY[quote.category]?.find((e) => e.id === quote.eventType)?.label
          : null,
    },
    { l: "Pacote", v: PACKAGES.find((p) => p.id === quote.packageTier)?.label },
    { l: "Duração", v: quote.duration ? `${quote.duration}h` : null },
    { l: "Convidados", v: quote.guests ? String(quote.guests) : null },
    { l: "Local", v: quote.location || null },
  ];

  const wa = quote.phone ? quote.phone.replace(/[^\d]/g, "") : "";

  return (
    <div className="flex flex-col gap-5">
      {/* Contacto */}
      <div className="bo-card p-5">
        <p className="bo-eyebrow mb-3">Contacto</p>
        <div className="flex flex-col gap-2">
          <a
            href={`mailto:${quote.email}`}
            className="text-[#4d6350] text-xs hover:underline truncate"
          >
            {quote.email}
          </a>
          {quote.phone && (
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`tel:${quote.phone}`}
                className="text-foreground/55 text-xs hover:text-foreground/75"
              >
                {quote.phone}
              </a>
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#4d6350] text-[10px] tracking-[0.08em] uppercase hover:opacity-80 transition-opacity"
                title="Abrir conversa no WhatsApp"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-.96.24-3.23-.67-2.73-1.08-4.46-3.86-4.6-4.04-.13-.18-1.1-1.46-1.1-2.79 0-1.33.7-1.98.95-2.25.24-.27.53-.34.7-.34.18 0 .35 0 .5.01.16.01.38-.06.6.46.23.54.77 1.87.84 2 .07.14.11.3.02.48-.09.18-.13.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.54.15.27.67 1.1 1.44 1.78.99.88 1.82 1.16 2.08 1.29.27.13.42.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.25.09 1.58.75 1.85.88.27.13.45.2.52.31.07.11.07.64-.17 1.32Z" />
                </svg>
                WhatsApp
              </a>
            </div>
          )}
          {quote.company && <p className="text-foreground/40 text-xs">{quote.company}</p>}
          {quote.nif && <p className="text-foreground/30 text-xs">NIF: {quote.nif}</p>}
        </div>
      </div>

      {/* Factos do evento */}
      <div className="bo-card p-5">
        <p className="bo-eyebrow mb-3">Evento</p>
        <div className="grid grid-cols-2 gap-3">
          {facts.map(({ l, v }) => (
            <div key={l}>
              <p className="text-foreground/25 text-[9px] tracking-wide uppercase mb-0.5">{l}</p>
              <p className="text-foreground/60 text-xs">{v ?? "—"}</p>
            </div>
          ))}
        </div>
        {quote.notes && (
          <div className="mt-4 pt-3 border-t border-foreground/[0.06]">
            <p className="text-foreground/25 text-[9px] tracking-wide uppercase mb-1">
              Notas do cliente
            </p>
            <p className="text-foreground/45 text-xs leading-relaxed">{quote.notes}</p>
          </div>
        )}
      </div>

      {/* Registo de atividade */}
      <div className="bo-card p-5">
        <ActivityLog quote={quote} actor={actor} onAddEntry={onAddEntry} />
      </div>
    </div>
  );
}
