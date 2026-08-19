"use client";

import { useMemo, useRef, useState } from "react";
import { randomId } from "./util";
import { useToast } from "./Toast";
import { metaFor } from "./status-meta";
import { downloadCsv, guestsToCsvRows, printGuestList, dateStamp } from "./export";
import type { Quote, Guest, RsvpStatus } from "@/lib/orcamento/types";
import { Button, Field } from "./ui";

const RSVP_META: Record<RsvpStatus, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "#8a8a82" },
  confirmado: { label: "Confirmado", color: "#4d6350" },
  recusado: { label: "Recusado", color: "#b5654a" },
};

interface Props {
  quote: Quote;
  onChange: (guestList: Guest[]) => void;
}

/**
 * Event RSVP / guest list. Each entry is a person or party (`party` = headcount
 * for that entry), so the confirmed headcount is the sum of confirmed parties —
 * shown against the estimate the client gave (quote.guests) so the team can see
 * at a glance how the numbers are firming up.
 */
export default function GuestList({ quote, onChange }: Props) {
  const { toast } = useToast();
  const [guests, setGuests] = useState<Guest[]>(quote.guestList ?? []);
  const [name, setName] = useState("");
  const [party, setParty] = useState("1");
  const [note, setNote] = useState("");

  const totals = useMemo(() => {
    let confirmed = 0;
    let pending = 0;
    let declined = 0;
    for (const g of guests) {
      const n = g.party || 1;
      // Só "recusado" conta como recusa. Um valor que este ecrã não conheça cai
      // em "Pendente" — que é o que ele é, uma resposta por apurar — e não em
      // "Recusados", que seria afirmar uma recusa que ninguém deu.
      if (g.rsvp === "confirmado") confirmed += n;
      else if (g.rsvp === "recusado") declined += n;
      else pending += n;
    }
    return { confirmed, pending, declined };
  }, [guests]);

  /**
   * Otimista com reversão — mas a reversão é para o último estado que o SERVIDOR
   * confirmou, e só quando não há gravação mais recente.
   *
   * Guardar `guests` antes do pedido e repô-lo no erro era guardar um instante
   * que já passou. Marcar duas famílias de seguida põe dois PATCH no ar; o
   * segundo leva a lista INTEIRA (já com a primeira alteração dentro), portanto
   * quando o servidor o aceita fica com as duas. A primeira, ao falhar, repunha
   * o mundo anterior às DUAS e apagava do ecrã — e do `onChange`, e por isso da
   * gravação seguinte — uma confirmação que estava gravada.
   */
  const gravacoes = useRef(0);
  const gravado = useRef<Guest[]>(quote.guestList ?? []);

  function persist(next: Guest[]) {
    const minha = ++gravacoes.current;
    setGuests(next);
    onChange(next);
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestList: next }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        if (minha === gravacoes.current) gravado.current = next;
      })
      .catch(() => {
        // Já foi substituída por uma gravação mais recente: o que essa levar
        // contém o que esta levava, portanto não há nada a desfazer nem nada a
        // dizer. Se ELA também falhar, é ela que repõe — e para o mesmo sítio.
        if (minha !== gravacoes.current) return;
        setGuests(gravado.current);
        onChange(gravado.current);
        toast("Não foi possível guardar a lista de convidados. Tenta novamente.", "error");
      });
  }

  function add() {
    const n = name.trim();
    if (!n) return;
    const trimmedNote = note.trim();
    persist([
      ...guests,
      {
        id: randomId(),
        name: n,
        party: Math.max(1, parseInt(party) || 1),
        rsvp: "pendente",
        note: trimmedNote || undefined,
      },
    ]);
    setName("");
    setParty("1");
    setNote("");
  }
  function remove(id: string) {
    persist(guests.filter((g) => g.id !== id));
  }
  // Estado do RSVP escolhido diretamente (um clique para qualquer estado), em vez
  // de ciclar tocando no badge (que ninguém adivinhava).
  function setRsvpOf(id: string, rsvp: RsvpStatus) {
    persist(guests.map((x) => (x.id === id ? { ...x, rsvp } : x)));
  }
  // Escrever no campo atualiza o número no ecrã de imediato (aceita vazio para se
  // poder reescrever); só grava (um PATCH) ao sair do campo, com o mínimo de 1.
  function setPartyOf(id: string, value: string) {
    const n = value === "" ? 0 : Math.max(0, parseInt(value) || 0);
    setGuests((prev) => prev.map((x) => (x.id === id ? { ...x, party: n } : x)));
  }
  function commitPartyOf(id: string) {
    const g = guests.find((x) => x.id === id);
    if (!g) return;
    const n = Math.max(1, g.party || 1);
    persist(guests.map((x) => (x.id === id ? { ...x, party: n } : x)));
  }

  const estimate = quote.guests || 0;

  return (
    <section className="border-t border-foreground/10 pt-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="bo-eyebrow">Lista de Convidados</p>
        {/* ── OS DOIS BOTÕES DE ÍCONE DESTA BARRA ──────────────────────────
            O `ui/Button` já dá os 44 px de ALTURA sob dedo
            (`pointer-coarse:h-11`), mas estes são só ícone e levam `px-2`
            para ficarem compactos — medidos a 375 px davam 39 px de LARGURA.
            Altura certa, largura curta: o alvo continuava por baixo do
            mínimo no eixo que ninguém tinha medido. `alvo-toque` trata do
            `min-width`, e os dois estão colados um ao outro (`gap-1`), que é
            o caso em que falhar a largura acerta no vizinho. */}
        {guests.length > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadCsv(`convidados-${quote.id}-${dateStamp()}`, guestsToCsvRows(quote))
              }
              title="Exportar convidados para CSV"
              aria-label="Exportar CSV"
              iconLeft={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <path
                    d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
              className="px-2 alvo-toque"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => printGuestList(quote)}
              title="Imprimir lista de convidados"
              aria-label="Imprimir"
              iconLeft={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <path
                    d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect x="6" y="14" width="12" height="7" rx="1" />
                </svg>
              }
              className="px-2 alvo-toque"
            />
            <span className="ml-1 shrink-0 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11px] tabular-nums text-foreground/55">
              {guests.length} {guests.length === 1 ? "grupo" : "grupos"}
            </span>
          </div>
        )}
      </div>

      {/* Headcount summary */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl bg-foreground/[0.04] p-3 text-center">
          <p className="text-base font-semibold text-[#4d6350]">{totals.confirmed}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
            Confirm.
          </p>
        </div>
        <div className="rounded-xl bg-foreground/[0.04] p-3 text-center">
          <p className="text-base font-semibold text-foreground/65">{totals.pending}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
            Pendente
          </p>
        </div>
        <div className="rounded-xl bg-foreground/[0.04] p-3 text-center">
          <p className="text-base font-semibold text-[#b5654a]">{totals.declined}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
            Recusados
          </p>
        </div>
        <div className="rounded-xl bg-foreground/[0.04] p-3 text-center">
          <p className="text-base font-semibold text-foreground/65">
            {totals.confirmed}
            <span className="font-normal text-foreground/40">/{estimate || "—"}</span>
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
            Estimativa
          </p>
        </div>
      </div>

      {/* Guests */}
      {guests.length > 0 ? (
        <ul className="mb-5 flex flex-col gap-1.5">
          {guests.map((g) => (
            <li
              key={g.id}
              className="group flex flex-wrap items-center gap-2.5 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground/80">{g.name}</p>
                {g.note && (
                  <p className="truncate text-[11px] text-foreground/40" title={g.note}>
                    {g.note}
                  </p>
                )}
              </div>
              <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-foreground/45">
                <input
                  type="number"
                  min={1}
                  value={g.party || ""}
                  onChange={(e) => setPartyOf(g.id, e.target.value)}
                  onBlur={() => commitPartyOf(g.id)}
                  className="bo-input w-14 px-1.5 py-1 text-center text-xs text-foreground/75"
                  aria-label={`Convidados no grupo ${g.name}`}
                />
                convidados
              </label>
              <select
                // `?? ""` porque um registo anterior ao campo nem sequer o tem:
                // um `value` indefinido passava o select a NÃO-controlado a meio
                // da vida do componente, e a partir daí ele deixava de reflectir
                // o que está gravado.
                value={g.rsvp ?? ""}
                onChange={(e) => setRsvpOf(g.id, e.target.value as RsvpStatus)}
                aria-label={`Estado do RSVP de ${g.name}`}
                // `text-xs` e não `text-[11px]`: a regra de `globals.css` que
                // encolhe legendas (`.text-[11px]` etc.) para
                // `--bo-fs-caption` a 1024px para baixo apanhava também este
                // `<select>` — e ao ganhar por especificidade ao `select {
                // font-size: 16px }` do mesmo ficheiro (que só existe para o
                // Safari do iOS não ampliar a página ao focar), o campo ficava
                // a 12px e o zoom automático voltava. `text-xs` não está na
                // lista de classes que essa regra apanha, por isso o campo
                // fica ao alcance da regra dos 16px em ecrãs de toque.
                className="bo-input w-[110px] shrink-0 px-2 py-1 text-xs font-medium"
                // `RSVP_META[g.rsvp].color` à bruta era `undefined.color` assim
                // que aparecesse um valor de fora — uma linha antiga, uma
                // migração, uma correcção feita à mão na base de dados. Num
                // componente de cliente isso não perde a linha: perde o back
                // office inteiro para o ecrã de erro.
                style={{ color: metaFor(RSVP_META, g.rsvp).color }}
              >
                {/* Sem esta, um valor desconhecido não casava com opção
                    nenhuma e o campo mostrava "Pendente" — dizia uma coisa
                    enquanto o registo dizia outra. Assim vê-se o valor cru. */}
                {!(g.rsvp in RSVP_META) && <option value={g.rsvp ?? ""}>{g.rsvp || "—"}</option>}
                <option value="pendente">Pendente</option>
                <option value="confirmado">Confirmado</option>
                <option value="recusado">Recusado</option>
              </select>
              {/* MEDIDO a 768×1024 com dedo (o iPad em retrato): 12 destes botões e
                    ZERO visíveis. 768 passa dos 640 do `sm:`, portanto `sm:opacity-0`
                    disparava — e sem rato não há como o revelar. A pergunta certa é sobre o
                    PONTEIRO, não sobre a largura: `com-rato:` (globals.css) esconde só onde
                    há mesmo rato, e a 375 e a 768 com dedo ficam os 12 visíveis.

                    Fica um ícone e não um menu «⋯»: com UMA acção por linha, o menu custa
                    os mesmos 44 px e cobra um toque a mais para chegar ao mesmo sítio. */}
              <button
                onClick={() => remove(g.id)}
                className="alvo-toque shrink-0 rounded-md p-1 text-foreground/25 opacity-100 com-rato:opacity-0 hover:text-[#8a2a22] com-rato:focus-visible:opacity-100 motion-safe:transition-all com-rato:group-hover:opacity-100"
                aria-label={`Remover ${g.name}`}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 rounded-xl bg-foreground/[0.02] px-4 py-6 text-center text-sm leading-relaxed text-foreground/50">
          Ainda sem convidados. Adiciona a primeira pessoa ou família abaixo — o número de
          confirmados atualiza-se sozinho.
        </p>
      )}

      {/* Add guest */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field
          as="input"
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nome (convidado ou família)"
          containerClassName="flex-1"
        />
        <Field
          as="input"
          label="Nota (opcional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Ex.: mesa 3, alergia, +1"
          containerClassName="flex-1"
        />
        <Field
          as="input"
          type="number"
          min={1}
          label="Convidados"
          value={party}
          onChange={(e) => setParty(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="text-center"
          containerClassName="w-full sm:w-24"
        />
        <Button variant="primary" onClick={add} disabled={!name.trim()}>
          Adicionar
        </Button>
      </div>
    </section>
  );
}
