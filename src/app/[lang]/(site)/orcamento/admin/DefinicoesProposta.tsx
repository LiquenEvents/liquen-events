"use client";

import { useCallback, useEffect, useState } from "react";
import type { ParametrosDeslocacao } from "@/lib/orcamento/deslocacao";
import { custoPorKm, sugerirDeslocacao } from "@/lib/orcamento/deslocacao";
import { Button, Card } from "./ui";
import { useToast } from "./Toast";
import { SkeletonList } from "./Skeleton";
import Miniaturas from "./Miniaturas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS NÚMEROS COM QUE O ESTÚDIO FAZ CONTAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Depende também de que valor está a gasolina." Este é o ecrã onde esse valor
 * se escreve — e onde se vê há quanto tempo lá está.
 *
 * ── PORQUE É QUE ISTO MOSTRA O RESULTADO ENQUANTO SE ESCREVE ───────────────
 * Um formulário de seis números é abstracto: ninguém sabe o que 0,09 €/km de
 * portagens faz a uma proposta. A pré-visualização responde à única pergunta
 * que importa — "e então quanto é que fica ir a Lisboa?" — antes de gravar, e
 * é o que permite reconhecer um engano de vírgula em vez de o descobrir na
 * proposta seguinte.
 */

interface Parametros {
  deslocacao: ParametrosDeslocacao;
  margemMinima: number;
  definidoEm: Record<string, string>;
}

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);

/** "há 4 meses", "hoje", "nunca" — a idade de um número, dita como se fala. */
function idade(iso: string | undefined): string {
  if (!iso || iso.startsWith("1970")) return "nunca confirmado";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(dias)) return "nunca confirmado";
  if (dias <= 0) return "definido hoje";
  if (dias === 1) return "definido ontem";
  if (dias < 30) return `definido há ${dias} dias`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? "definido há 1 mês" : `definido há ${meses} meses`;
}

/** A partir de seis semanas, o preço do gasóleo deixa de merecer confiança. */
function velho(iso: string | undefined): boolean {
  if (!iso || iso.startsWith("1970")) return true;
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return Number.isNaN(dias) || dias > 42;
}

/** Um campo numérico com unidade, que aceita vírgula como decimal. */
function Numero({
  label,
  unidade,
  valor,
  onChange,
  ajuda,
}: {
  label: string;
  unidade: string;
  valor: number;
  onChange: (n: number) => void;
  ajuda?: string;
}) {
  // O estado local é TEXTO: com número, escrever "1," apagava a vírgula ao
  // reformatar e era impossível chegar a "1,72".
  const [texto, setTexto] = useState(String(valor).replace(".", ","));
  useEffect(() => setTexto(String(valor).replace(".", ",")), [valor]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-[0.1em] uppercase text-foreground/50">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            const n = Number(e.target.value.replace(",", "."));
            if (Number.isFinite(n) && n >= 0) onChange(n);
          }}
          className="bo-input w-24 px-2.5 py-2 text-xs"
        />
        <span className="text-[11px] text-foreground/45">{unidade}</span>
      </span>
      {ajuda && <span className="text-[10px] leading-relaxed text-foreground/40">{ajuda}</span>}
    </label>
  );
}

export default function DefinicoesProposta() {
  const { toast } = useToast();
  const [p, setP] = useState<Parametros | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/proposta-definicoes")
      .then(async (r) => {
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) setErro(j?.error ?? "Não foi possível ler as definições.");
        else setP(j as Parametros);
      })
      .catch(() => vivo && setErro("Não foi possível falar com o servidor."));
    return () => {
      vivo = false;
    };
  }, []);

  const gravar = useCallback(
    async (id: "deslocacao" | "margem", valor: object) => {
      setAGravar(true);
      try {
        const res = await fetch("/api/proposta-definicoes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, valor }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? "falhou");
        setP(j as Parametros);
        toast("Guardado. As propostas seguintes já usam estes valores.", "success");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Não foi possível guardar.", "error");
      } finally {
        setAGravar(false);
      }
    },
    [toast],
  );

  if (erro) {
    return (
      <Card padding="md">
        <p className="text-xs leading-relaxed text-[#b5654a]">{erro}</p>
      </Card>
    );
  }
  if (!p) return <SkeletonList rows={2} />;

  const d = p.deslocacao;
  const custo = custoPorKm(d);
  // Três destinos reais, para o número deixar de ser abstracto.
  const exemplos = ["Évora", "Palmela", "Porto"]
    .map((sitio) => ({ sitio, s: sugerirDeslocacao(sitio, d) }))
    .filter((x) => x.s !== null);
  const desactualizado = velho(p.definidoEm.deslocacao);

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground/85">Deslocação</h2>
          <span
            className={`text-[11px] ${desactualizado ? "text-[#b5654a]" : "text-foreground/45"}`}
          >
            {idade(p.definidoEm.deslocacao)}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-foreground/55">
          A deslocação é uma conta: quilómetros de ida e volta a partir de Évora, vezes o custo de
          cada quilómetro. O gasóleo muda todas as semanas — este número tem de ser seu, não do
          programa.
        </p>

        {desactualizado && (
          <p className="mt-3 rounded-xl border border-[#c08a3e]/40 bg-[#c08a3e]/[0.06] p-3 text-[11px] leading-relaxed text-[#8a6420]">
            {p.definidoEm.deslocacao?.startsWith("1970")
              ? "Estes valores nunca foram confirmados — são um ponto de partida escrito por quem não abastece a carrinha. Confirme o preço do gasóleo antes de a próxima proposta o usar."
              : "O preço do gasóleo já tem algumas semanas. Vale a pena confirmá-lo: o desvio já se nota numa viagem ao Porto."}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-4">
          <Numero
            label="Preço do gasóleo"
            unidade="€/litro"
            valor={d.precoLitro}
            onChange={(precoLitro) => setP({ ...p, deslocacao: { ...d, precoLitro } })}
            ajuda="O que paga na bomba onde abastece."
          />
          <Numero
            label="Consumo da carrinha"
            unidade="l/100 km"
            valor={d.consumoLPor100Km}
            onChange={(consumoLPor100Km) => setP({ ...p, deslocacao: { ...d, consumoLPor100Km } })}
          />
          <Numero
            label="Portagens"
            unidade="€/km"
            valor={d.portagensPorKm}
            onChange={(portagensPorKm) => setP({ ...p, deslocacao: { ...d, portagensPorKm } })}
          />
          <Numero
            label="Desgaste"
            unidade="€/km"
            valor={d.desgastePorKm}
            onChange={(desgastePorKm) => setP({ ...p, deslocacao: { ...d, desgastePorKm } })}
            ajuda="Pneus, revisões, o que a carrinha perde por andar."
          />
          <Numero
            label="Sem cobrar até"
            unidade="km"
            valor={d.franquiaKm}
            onChange={(franquiaKm) => setP({ ...p, deslocacao: { ...d, franquiaKm } })}
            ajuda="A isenção do distrito de Évora, que as condições prometem."
          />
        </div>

        <label className="mt-3 inline-flex items-center gap-2.5 py-1.5 cursor-pointer text-foreground/68">
          <input
            type="checkbox"
            checked={d.idaEVolta}
            onChange={(e) => setP({ ...p, deslocacao: { ...d, idaEVolta: e.target.checked } })}
            className="h-4 w-4 accent-[#4d6350]"
          />
          <span className="text-[11px]">Cobrar ida e volta (a carrinha vai e vem)</span>
        </label>

        {/* ── O que isto faz, em euros ─────────────────────────────────── */}
        <div className="mt-4 rounded-xl bg-foreground/[0.02] p-3">
          <p className="text-[11px] text-foreground/60">
            Cada quilómetro fica a{" "}
            <strong className="font-semibold text-foreground/85">{eur(custo.total)}</strong>{" "}
            <span className="text-foreground/45">
              (combustível {eur(custo.combustivel)} + portagens {eur(custo.portagens)} + desgaste{" "}
              {eur(custo.desgaste)})
            </span>
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-foreground/60">
            {exemplos.map(({ sitio, s }) => (
              <li key={sitio}>
                <span className="text-foreground/45">{sitio}:</span>{" "}
                <strong className="font-semibold text-foreground/85">{eur(s!.valor)}</strong>{" "}
                <span className="text-foreground/40">({s!.formula})</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-3">
          <Button size="sm" disabled={aGravar} onClick={() => gravar("deslocacao", d)}>
            Guardar deslocação
          </Button>
        </div>
      </Card>

      <Card padding="md">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground/85">Margem mínima</h2>
          <span className="text-[11px] text-foreground/45">{idade(p.definidoEm.margem)}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-foreground/55">
          Abaixo desta percentagem o estúdio avisa enquanto escreve a proposta. Não impede nada — há
          eventos que se fazem com margem baixa de propósito.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Numero
            label="Avisar abaixo de"
            unidade="%"
            valor={p.margemMinima}
            onChange={(margemMinima) => setP({ ...p, margemMinima })}
          />
          <Button
            size="sm"
            disabled={aGravar}
            onClick={() => gravar("margem", { minima: p.margemMinima })}
          >
            Guardar margem
          </Button>
        </div>
      </Card>

      {/*
        MANUTENÇÃO DAS FOTOGRAFIAS.

        Aqui e não nos Temas porque não é uma acção sobre UM tema: percorre a
        biblioteca inteira e também as pastas das propostas. E vive dentro deste
        componente, e não no `AdminClient`, para viajar no mesmo pedaço de
        código que já é carregado só quando esta vista abre.
      */}
      <Miniaturas />
    </div>
  );
}
