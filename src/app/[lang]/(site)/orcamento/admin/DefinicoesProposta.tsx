"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ParametrosDeslocacao } from "@/lib/orcamento/deslocacao";
import { custoPorKm, sugerirDeslocacao } from "@/lib/orcamento/deslocacao";
import { lerNumero, type LimitesDoNumero } from "@/lib/numero-escrito";
import { porqueRecusou } from "@/lib/erro-do-servidor";
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

/** O número como ela o escreve: vírgula decimal. */
const comVirgula = (n: number) => String(n).replace(".", ",");

/**
 * Um campo numérico com unidade, que aceita vírgula como decimal — e que DIZ
 * quando o que lá está não dá um número que sirva.
 *
 * ── O QUE ESTE CAMPO CALAVA ───────────────────────────────────────────────
 * `abc`, `-2,5`, `1,72 €` ou o campo apagado não chegavam ao formulário: o
 * `onChange` era simplesmente saltado e o parâmetro ficava com o valor
 * ANTERIOR. O ecrã mostrava o que ela escreveu, o botão gravava o valor velho,
 * e o aviso verde dizia «Guardado. As propostas seguintes já usam estes
 * valores.» — sobre uma gravação que não era a dela. O preço do gasóleo velho
 * seguia dentro da deslocação cobrada ao cliente.
 *
 * Continua a não emitir um número que não serve (o formulário nunca fica com
 * lixo dentro), mas agora conta-o para cima: a frase aparece por baixo do
 * campo enquanto se escreve, e é ela que trava o botão.
 */
function Numero({
  label,
  unidade,
  valor,
  limites,
  erro,
  onChange,
  onErro,
  ajuda,
}: {
  label: string;
  unidade: string;
  valor: number;
  limites: LimitesDoNumero;
  erro?: string;
  onChange: (n: number) => void;
  onErro: (porque: string | null) => void;
  ajuda?: string;
}) {
  const idErro = useId();
  // O estado local é TEXTO: com número, escrever "1," apagava a vírgula ao
  // reformatar e era impossível chegar a "1,72".
  const [texto, setTexto] = useState(() => comVirgula(valor));
  /**
   * ── O TEXTO SÓ SE REESCREVE QUANDO O NÚMERO VEM DE FORA ───────────────────
   *
   * O estado local de texto não chegava sozinho: o efeito reescrevia-o a partir
   * do `valor` que ele PRÓPRIO acabava de provocar. E `Number("1,")` é 1 — por
   * isso apagar o "5" de "1,65" punha o formulário a 1, o efeito devolvia "1"
   * ao campo, e a vírgula desaparecia debaixo dos dedos. O "8" seguinte colava-
   * se ao "1": 18 €/litro, dez vezes o preço do gasóleo, na deslocação de todas
   * as propostas seguintes.
   *
   * Guardando o último número que este campo emitiu, distingue-se o eco da
   * própria escrita (não se toca no texto) de um número que veio de fora — a
   * leitura inicial, ou a resposta de uma gravação —, que é a única altura em
   * que o campo tem mesmo de ser reescrito.
   */
  const emitido = useRef(valor);
  useEffect(() => {
    if (valor === emitido.current) return;
    emitido.current = valor;
    setTexto(comVirgula(valor));
  }, [valor]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-[0.1em] uppercase text-foreground/50">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          value={texto}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idErro : undefined}
          onChange={(e) => {
            const escrito = e.target.value;
            setTexto(escrito);
            const leitura = lerNumero(escrito, limites);
            if (!leitura.ok) {
              // Um campo vazio é um campo a meio de ser escrito, e não zero.
              // `Number("")` é 0, e era esse 0 que ficava nos parâmetros: um
              // clique em «Guardar» a seguir tirava o combustível da conta da
              // deslocação de todas as propostas, sem ninguém o ter pedido.
              // O formulário continua a não receber isto — mas deixa de ser um
              // silêncio: a frase fica no campo e o botão sabe dela.
              onErro(leitura.porque);
              return;
            }
            onErro(null);
            if (leitura.valor === null) return;
            emitido.current = leitura.valor;
            onChange(leitura.valor);
          }}
          className={`bo-input w-24 px-2.5 py-2 text-xs${erro ? " border-[#b5654a]" : ""}`}
        />
        <span className="text-[11px] text-foreground/45">{unidade}</span>
      </span>
      {erro && (
        <span id={idErro} className="text-[10px] leading-relaxed text-[#b5654a]">
          {erro}
        </span>
      )}
      {ajuda && <span className="text-[10px] leading-relaxed text-foreground/40">{ajuda}</span>}
    </label>
  );
}

/**
 * Os limites são os do servidor, campo a campo (ver `deslocacaoSchema` na rota
 * `/api/proposta-definicoes`). Estão aqui repetidos de propósito: o servidor
 * continua a ser quem decide — isto é só o ecrã a dizer a mesma coisa a tempo
 * de ela poder corrigir, em vez de a descobrir num 400 ou, pior, num «Guardado»
 * que não guardou.
 *
 * ── E O CAMPO EM BRANCO? ──────────────────────────────────────────────────
 * É um ERRO, e não «não mexer». Nenhum destes números tem estado «por definir»:
 * a conta da deslocação precisa dos seis, e por isso um campo vazio não é uma
 * instrução — é uma edição a meio. Tratá-lo como «fica o que lá estava» seria
 * pôr o ecrã a discordar do que está gravado (o campo em branco, o servidor com
 * 2 €/l) e era exactamente esse desencontro que fazia o preço velho seguir para
 * as propostas seguintes. Quem quer mesmo apagar não quer apagar: quer
 * reescrever, e a frase diz-lhe isso.
 */
const LIMITES: Record<string, LimitesDoNumero> = {
  precoLitro: { min: 0, max: 20, nome: "preço do gasóleo", exemplo: "1,72" },
  consumoLPor100Km: { min: 0, max: 100, nome: "consumo da carrinha", exemplo: "9" },
  portagensPorKm: { min: 0, max: 5, nome: "custo das portagens", exemplo: "0,09" },
  desgastePorKm: { min: 0, max: 5, nome: "desgaste por quilómetro", exemplo: "0,10" },
  franquiaKm: { min: 0, max: 1000, nome: "número de quilómetros", exemplo: "40" },
  margemMinima: { min: 0, max: 100, nome: "margem mínima", exemplo: "35" },
};

/** Que campos pertencem a cada botão de gravar. */
const CAMPOS_DE = {
  deslocacao: [
    "precoLitro",
    "consumoLPor100Km",
    "portagensPorKm",
    "desgastePorKm",
    "franquiaKm",
  ] as const,
  margem: ["margemMinima"] as const,
};

export default function DefinicoesProposta() {
  const { toast } = useToast();
  const [p, setP] = useState<Parametros | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  /** O que está escrito e não dá um número que sirva, campo a campo. */
  const [porCorrigir, setPorCorrigir] = useState<Record<string, string>>({});

  const marcar = useCallback((campo: string, porque: string | null) => {
    setPorCorrigir((antes) => {
      if (!porque) {
        if (!(campo in antes)) return antes;
        const { [campo]: _fora, ...resto } = antes;
        void _fora;
        return resto;
      }
      return antes[campo] === porque ? antes : { ...antes, [campo]: porque };
    });
  }, []);

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
      /**
       * Um campo por corrigir trava o botão — e o que trava é DITO, com a
       * frase do campo. Deixar seguir daqui era mandar ao servidor o valor
       * antigo com cara de novo: 200, aviso verde, e o preço velho dentro da
       * deslocação de todas as propostas seguintes.
       */
      const problema = CAMPOS_DE[id].map((c) => porCorrigir[c]).find(Boolean);
      if (problema) {
        toast(`Não foi guardado: ${problema}`, "error");
        return;
      }
      setAGravar(true);
      try {
        const res = await fetch("/api/proposta-definicoes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, valor }),
        });
        if (!res.ok) {
          // A recusa do servidor tal como ele a explica — em português, e não
          // «não foi possível guardar», que não diz o que fazer a seguir.
          throw new Error((await porqueRecusou(res)) ?? "Não foi possível guardar.");
        }
        setP((await res.json()) as Parametros);
        toast("Guardado. As propostas seguintes já usam estes valores.", "success");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Não foi possível guardar.", "error");
      } finally {
        setAGravar(false);
      }
    },
    [toast, porCorrigir],
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
          cada quilómetro. O gasóleo muda todas as semanas — este número tem de ser teu, não do
          programa.
        </p>

        {desactualizado && (
          <p className="mt-3 rounded-xl border border-[#c08a3e]/40 bg-[#c08a3e]/[0.06] p-3 text-[11px] leading-relaxed text-[#8a6420]">
            {p.definidoEm.deslocacao?.startsWith("1970")
              ? "Estes valores nunca foram confirmados — são um ponto de partida escrito por quem não abastece a carrinha. Confirma o preço do gasóleo antes de a próxima proposta o usar."
              : "O preço do gasóleo já tem algumas semanas. Vale a pena confirmá-lo: o desvio já se nota numa viagem ao Porto."}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-4">
          <Numero
            label="Preço do gasóleo"
            unidade="€/litro"
            valor={d.precoLitro}
            limites={LIMITES.precoLitro}
            erro={porCorrigir.precoLitro}
            onErro={(porque) => marcar("precoLitro", porque)}
            onChange={(precoLitro) => setP({ ...p, deslocacao: { ...d, precoLitro } })}
            ajuda="O que paga na bomba onde abastece."
          />
          <Numero
            label="Consumo da carrinha"
            unidade="l/100 km"
            valor={d.consumoLPor100Km}
            limites={LIMITES.consumoLPor100Km}
            erro={porCorrigir.consumoLPor100Km}
            onErro={(porque) => marcar("consumoLPor100Km", porque)}
            onChange={(consumoLPor100Km) => setP({ ...p, deslocacao: { ...d, consumoLPor100Km } })}
          />
          <Numero
            label="Portagens"
            unidade="€/km"
            valor={d.portagensPorKm}
            limites={LIMITES.portagensPorKm}
            erro={porCorrigir.portagensPorKm}
            onErro={(porque) => marcar("portagensPorKm", porque)}
            onChange={(portagensPorKm) => setP({ ...p, deslocacao: { ...d, portagensPorKm } })}
          />
          <Numero
            label="Desgaste"
            unidade="€/km"
            valor={d.desgastePorKm}
            limites={LIMITES.desgastePorKm}
            erro={porCorrigir.desgastePorKm}
            onErro={(porque) => marcar("desgastePorKm", porque)}
            onChange={(desgastePorKm) => setP({ ...p, deslocacao: { ...d, desgastePorKm } })}
            ajuda="Pneus, revisões, o que a carrinha perde por andar."
          />
          <Numero
            label="Sem cobrar até"
            unidade="km"
            valor={d.franquiaKm}
            limites={LIMITES.franquiaKm}
            erro={porCorrigir.franquiaKm}
            onErro={(porque) => marcar("franquiaKm", porque)}
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
            limites={LIMITES.margemMinima}
            erro={porCorrigir.margemMinima}
            onErro={(porque) => marcar("margemMinima", porque)}
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
