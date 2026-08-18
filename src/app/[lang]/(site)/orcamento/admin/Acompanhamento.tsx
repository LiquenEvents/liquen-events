"use client";

import { useCallback, useMemo, useState } from "react";
import type { MotivoDeRecusa, Proposal, ProposalStatus, Quote } from "@/lib/orcamento/types";
import {
  acompanhamento,
  aExpirar,
  seguimentosDevidos,
  type LinhaDeAcompanhamento,
} from "@/lib/orcamento/proposta-estado";
import { opcionaisDe } from "@/lib/orcamento/versoes-da-proposta";
import { SkeletonList } from "./Skeleton";
import { useToast } from "./Toast";
import { Button, Card, EmptyState } from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LISTA LEVE (`?semDoc=1`) EM VEZ DA PESADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este painel não desenha o documento nenhum. Pedia a lista inteira na mesma
 * (`/api/propostas`, chave "propostas"), com todos os mood boards e todas as
 * dezenas de caminhos de fotos de cada proposta lá dentro só para acabar sem
 * os usar. A rota tem uma forma leve para isto mesmo (`?semDoc=1`), e o
 * AdminClient já aquece a cache dela em ociosidade sob a chave
 * "propostas-leves" (ver AdminClient.tsx): sem este ecrã pedir a mesma chave,
 * esse aquecimento era deitado fora.
 *
 * A ÚNICA coisa que este painel tirava do documento era `opcionaisDe(p.doc)`,
 * para saber se a proposta tinha extras marcados. A rota leve já calcula
 * exactamente isso e chama-lhe `temOpcionais`, o mesmo facto, calculado do
 * mesmo sítio, sem trazer o documento todo para o poder ler.
 */
type PropostaLeve = Omit<Proposal, "doc"> & { temOpcionais: boolean };

/**
 * A resposta de um PATCH (`/api/propostas/[id]`) continua a vir com o
 * documento completo: só a LISTA é que veio pela rota leve. Para a
 * guardar de volta na cache partilhada sem lhe voltar a colar o `doc`
 * (o que reintroduzia o peso que a mudança acima existe para evitar),
 * troca-se `doc` por `temOpcionais`, calculado da mesma forma que a rota o
 * calcularia.
 */
function paraLeve(p: Proposal): PropostaLeve {
  const { doc, ...resto } = p;
  return { ...resto, temOpcionais: !!doc && opcionaisDe(doc).some(Boolean) };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ACOMPANHAMENTO — o que acontece depois de a proposta seguir
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Enviar a proposta é metade do trabalho. A outra metade não tinha ecrã: a
 * proposta caía numa lista por data de criação, ao lado de rascunhos e de
 * negócios fechados há meses, e a única maneira de saber o que ainda estava
 * vivo era abrir tudo à vez.
 *
 * Aqui só está o que está EM ABERTO, por ordem do relógio que está mais perto
 * de tocar — a validade a acabar, o casamento a chegar, ou o seguimento que ela
 * marcou. A aritmética vive em `proposta-estado.ts`, sem React, e é lá que está
 * testada.
 *
 * ── NADA DISTO CHEGA AO CLIENTE ───────────────────────────────────────────
 * Não há email automático de "a sua proposta está a expirar", não há aviso do
 * lado de lá, não há forma de saber se abriu. O prazo a acabar é um lembrete
 * DELA para pegar no telefone. Foi pedido assim e é assim que está.
 */

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

/** Os estados que ela pode marcar a partir daqui. */
const ESTADOS: { id: ProposalStatus; label: string; ajuda: string }[] = [
  { id: "enviada", label: "Enviada", ajuda: "Seguiu, ainda sem resposta" },
  { id: "em_negociacao", label: "Em negociação", ajuda: "Houve resposta, está a discutir-se" },
  { id: "aceite", label: "Aceite", ajuda: "Ganho" },
  { id: "rejeitada", label: "Recusada", ajuda: "Perdido" },
];

const MOTIVOS: { id: MotivoDeRecusa; label: string }[] = [
  { id: "preco", label: "Preço" },
  { id: "data", label: "Data" },
  { id: "escolheram-outro", label: "Escolheram outro" },
  { id: "sem-resposta", label: "Sem resposta" },
  { id: "outro", label: "Outro" },
];

function dataCurta(iso?: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

/** "daqui a 3 dias", "hoje", "há 2 dias" — a mesma frase em todo o painel. */
function emDias(n: number): string {
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  return n > 0 ? `daqui a ${n} dias` : `há ${Math.abs(n)} dias`;
}

/** Hoje em "yyyy-mm-dd", no fuso de quem está a olhar. */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  /** Os pedidos já carregados pelo AdminClient — dão a data do evento. */
  quotes: Quote[];
  /** Abrir o pedido correspondente no painel de detalhe. */
  onOpenQuote?: (q: Quote) => void;
}

/**
 * O corpo de um PATCH a uma proposta.
 *
 * `null` é «APAGA ESTE CAMPO», e `undefined` não sabe dizer isso: desaparece
 * no `JSON.stringify` e o servidor, que só escreve o que vem no corpo, não
 * apaga nada. É a diferença entre retirar um seguimento e julgar que o
 * retirou.
 */
type PatchDeProposta = Partial<{ [K in keyof Proposal]: Proposal[K] | null }>;

export default function Acompanhamento({ quotes, onOpenQuote }: Props) {
  const {
    data: propostas,
    loading,
    setData,
    error,
    errorMessage,
    refresh,
  } = useCachedList<PropostaLeve[]>("propostas-leves", "/api/propostas?semDoc=1");
  const { toast } = useToast();
  const [aGravar, setAGravar] = useState<string | null>(null);
  /** Qual das linhas está com o formulário de "porque é que se perdeu" aberto. */
  const [aRecusar, setARecusar] = useState<string | null>(null);

  const linhas = useMemo(() => acompanhamento(propostas ?? [], quotes), [propostas, quotes]);
  const expirando = useMemo(() => aExpirar(linhas), [linhas]);
  const devidos = useMemo(() => seguimentosDevidos(linhas), [linhas]);

  /**
   * As propostas ACEITES que tinham extras e em que ninguém registou qual das
   * versões o casal ficou.
   *
   * Não entram na lista de cima — `acompanhamento` só devolve o que está em
   * aberto, e uma proposta ganha não está. Mas é uma pergunta por responder, e
   * as perguntas por responder é aqui que vivem. Quando estiverem todas
   * respondidas, esta secção desaparece sozinha.
   */
  const porRegistar = useMemo(
    () =>
      (propostas ?? []).filter(
        (p) => p.status === "aceite" && !p.versaoEscolhida && p.temOpcionais,
      ),
    [propostas],
  );

  const gravar = useCallback(
    async (id: string, patch: PatchDeProposta, comoDizer: string) => {
      setAGravar(id);
      // Otimista: o ecrã muda já e desfaz-se se o servidor recusar. Ver a
      // decisão em PaymentsPanel — o mesmo padrão, pelas mesmas razões.
      //
      // No ECRÃ, `null` (que quer dizer «apaga») lê-se como campo ausente; no
      // CORPO do pedido tem de ir mesmo `null`, senão o servidor não apaga
      // nada. São duas linguagens para a mesma intenção, e é aqui que se
      // traduzem.
      const paraOEcra = Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [k, v === null ? undefined : v]),
      ) as Partial<Proposal>;
      /**
       * ════════════════════════════════════════════════════════════════════
       * ACTUALIZAR A LINHA, E NÃO REPOR A LISTA INTEIRA
       * ════════════════════════════════════════════════════════════════════
       *
       * Era `const antes = propostas ?? []` — um retrato tirado ANTES do
       * `await` — e tanto o sucesso como o erro voltavam a escrever a lista
       * toda a partir dele. Numa manhã de segunda-feira marcam-se três ou
       * quatro seguidas, e as chamadas cruzam-se: a segunda gravação repunha
       * o retrato anterior à primeira e desfazia-a no ecrã. Ficava gravada no
       * servidor, mas o ecrã dizia o contrário — e é o ecrã que ela lê a
       * seguir.
       *
       * A forma funcional pega sempre na lista ACTUAL, e a reversão mexe só
       * na linha que falhou. Guardamos essa linha (e só essa) para a repor.
       */
      const linhaAntes = (propostas ?? []).find((p) => p.id === id);
      setData((prev) => (prev ?? []).map((p) => (p.id === id ? { ...p, ...paraOEcra } : p)));
      try {
        const res = await fetch(`/api/propostas/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("falhou");
        // O PATCH devolve a proposta COMPLETA (com `doc`): esta lista só guarda
        // a forma leve, por isso converte-se antes de voltar a pousá-la na
        // cache. Sem isto, o `doc` inteiro reentrava aqui por uma porta lateral.
        const actualizada = paraLeve((await res.json()) as Proposal);
        setData((prev) => (prev ?? []).map((p) => (p.id === id ? actualizada : p)));
        toast(comoDizer, "success");
      } catch {
        setData((prev) => (prev ?? []).map((p) => (p.id === id && linhaAntes ? linhaAntes : p)));
        toast("Não foi possível gravar. Verifica a ligação.", "error");
      } finally {
        setAGravar(null);
      }
    },
    [propostas, setData, toast],
  );

  // Este ecrã EXISTE para dizer o que está por responder. Uma leitura que
  // rebentou levava-o a afirmar "Nenhuma proposta à espera de resposta" — a
  // única frase que o dispensa de ser aberto. As validades continuam a correr
  // na mesma, e os seguimentos marcados passam sem ninguém dar por eles.
  if (error && !propostas) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler as propostas"
        mensagem={errorMessage}
        aoTentarDeNovo={refresh}
      />
    );
  }

  if (loading && !propostas) return <SkeletonList rows={4} />;

  if (linhas.length === 0 && porRegistar.length === 0) {
    return (
      <EmptyState
        title="Nenhuma proposta à espera de resposta"
        description="Aqui ficam as propostas enviadas e em negociação, por ordem do que está mais perto de acabar — a validade, o casamento, ou o seguimento que marcar."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── O resumo: as duas perguntas de segunda-feira de manhã ────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card padding="md">
          <p className="bo-eyebrow mb-1">Em aberto</p>
          <p className="text-2xl font-light text-foreground/85">{linhas.length}</p>
        </Card>
        <Card padding="md">
          <p className="bo-eyebrow mb-1">Prazo a acabar</p>
          <p
            className={`text-2xl font-light ${expirando.length > 0 ? "text-[#b5654a]" : "text-foreground/85"}`}
          >
            {expirando.length}
          </p>
          <p className="mt-1 text-[11px] text-foreground/45">Validade nos próximos 7 dias</p>
        </Card>
        <Card padding="md">
          <p className="bo-eyebrow mb-1">Seguimentos devidos</p>
          <p
            className={`text-2xl font-light ${devidos.length > 0 ? "text-[#c08a3e]" : "text-foreground/85"}`}
          >
            {devidos.length}
          </p>
          <p className="mt-1 text-[11px] text-foreground/45">Marcados para hoje ou antes</p>
        </Card>
      </div>

      {/* ── QUAL DAS DUAS VERSÕES ELES FICARAM ────────────────────────────
          Só propostas que TINHAM extras, e só depois de aceites: antes disso a
          pergunta não tem resposta, e sem extras não há duas versões.

          Perguntada, não deduzida. O valor facturado não responde a isto — em
          qualquer negociação em que se fez um desconto depois de aceitar,
          deduzir dava a versão errada em silêncio. */}
      {porRegistar.length > 0 && (
        <section
          aria-labelledby="versao-escolhida-titulo"
          className="rounded-2xl border border-foreground/[0.10] bg-foreground/[0.015] p-4"
        >
          <h3 id="versao-escolhida-titulo" className="bo-eyebrow">
            Ficaram com que versão?
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/50">
            Propostas ganhas que tinham extras. É a resposta a uma pergunta só, e é a que interessa:
            os extras vendem-se?
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {porRegistar.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-foreground/10 p-3"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/75">
                  {`${p.clientName} · ${eur(p.total)}`}
                </span>
                {(
                  [
                    { id: "base", label: "Versão base" },
                    { id: "extras", label: "Com extras" },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={aGravar === p.id}
                    onClick={() =>
                      gravar(
                        p.id,
                        { versaoEscolhida: v.id },
                        v.id === "base" ? "Ficaram pela versão base." : "Levaram os extras.",
                      )
                    }
                    className="alvo-toque rounded-full border border-foreground/12 px-3 py-1.5 text-[10px] tracking-[0.1em] uppercase text-foreground/55 transition-colors hover:border-[#4d6350]/40 hover:text-foreground/85 disabled:opacity-50"
                  >
                    {v.label}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="flex flex-col gap-3">
        {linhas.map((l) => (
          <li key={l.proposta.id}>
            <LinhaCartao
              linha={l}
              ocupada={aGravar === l.proposta.id}
              aRecusar={aRecusar === l.proposta.id}
              onRecusar={() => setARecusar(l.proposta.id)}
              onCancelarRecusa={() => setARecusar(null)}
              onEstado={(status) =>
                gravar(
                  l.proposta.id,
                  { status },
                  `${l.proposta.clientName} — ${ESTADOS.find((e) => e.id === status)?.label}`,
                )
              }
              onMotivo={(lostReason, lostNote) => {
                setARecusar(null);
                return gravar(
                  l.proposta.id,
                  { status: "rejeitada", lostReason, lostNote: lostNote || undefined },
                  "Registado. Fica na contagem dos motivos.",
                );
              }}
              /**
               * `null` e NÃO `undefined` ao retirar.
               *
               * `JSON.stringify({ followUpAt: undefined })` é `"{}"`, e o
               * servidor só escreve o que vem no corpo (`if (k in body)`).
               * Resultado: o patch ia vazio, a data ficava na base de dados, e
               * o ecrã dizia «Seguimento retirado» na mesma.
               *
               * Isto agravou-se quando o resumo da manhã passou a contar
               * também os seguimentos das PROPOSTAS: um seguimento que ela
               * julgava ter retirado voltava a aparecer todas as manhãs, para
               * sempre, sem forma nenhuma de o apagar.
               */
              onSeguimento={(followUpAt, followUpNote) =>
                gravar(
                  l.proposta.id,
                  { followUpAt: followUpAt || null, followUpNote: followUpNote || null },
                  followUpAt ? `Seguimento a ${dataCurta(followUpAt)}` : "Seguimento retirado",
                )
              }
              onAbrirPedido={l.quote && onOpenQuote ? () => onOpenQuote(l.quote!) : undefined}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface CartaoProps {
  linha: LinhaDeAcompanhamento;
  ocupada: boolean;
  aRecusar: boolean;
  onRecusar: () => void;
  onCancelarRecusa: () => void;
  onEstado: (s: ProposalStatus) => void;
  onMotivo: (m: MotivoDeRecusa, nota: string) => void;
  onSeguimento: (data: string, nota: string) => void;
  onAbrirPedido?: () => void;
}

function LinhaCartao({
  linha,
  ocupada,
  aRecusar,
  onRecusar,
  onCancelarRecusa,
  onEstado,
  onMotivo,
  onSeguimento,
  onAbrirPedido,
}: CartaoProps) {
  const { proposta: p, quote, validade, evento, seguimento, urgencia } = linha;
  const [seguimentoAberto, setSeguimentoAberto] = useState(false);
  const [dataSeguimento, setDataSeguimento] = useState(p.followUpAt ?? "");
  const [notaSeguimento, setNotaSeguimento] = useState(p.followUpNote ?? "");
  const [motivo, setMotivo] = useState<MotivoDeRecusa>("sem-resposta");
  const [notaMotivo, setNotaMotivo] = useState("");

  const borda =
    urgencia === "expirada"
      ? "border-[#b5654a]/45"
      : urgencia === "expira-ja"
        ? "border-[#c08a3e]/45"
        : "border-foreground/[0.08]";

  return (
    <div className={`rounded-2xl border bg-[var(--bo-surface,#fff)] p-4 ${borda}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground/85">{p.clientName}</p>
          <p className="mt-0.5 text-xs text-foreground/45">
            {eur(p.total)}
            {quote?.date && ` · casamento ${dataCurta(quote.date)}`}
            {quote?.location && ` · ${quote.location}`}
          </p>
        </div>
        {onAbrirPedido && (
          <Button variant="secondary" size="sm" onClick={onAbrirPedido}>
            Abrir pedido
          </Button>
        )}
      </div>

      {/* ── Os relógios ─────────────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {validade !== null && (
          <span
            className={
              validade < 0
                ? "text-[#b5654a]"
                : validade <= 7
                  ? "text-[#8a6420]"
                  : "text-foreground/50"
            }
          >
            {validade < 0
              ? `Validade acabou ${emDias(validade)}`
              : `Validade acaba ${emDias(validade)}`}
          </span>
        )}
        {evento !== null && <span className="text-foreground/50">Casamento {emDias(evento)}</span>}
        {seguimento !== null && (
          <span className={seguimento <= 0 ? "text-[#8a6420]" : "text-foreground/50"}>
            Seguimento {emDias(seguimento)}
            {p.followUpNote && ` — ${p.followUpNote}`}
          </span>
        )}
      </div>

      {/* ── Estado ──────────────────────────────────────────────────────── */}
      <div
        role="group"
        aria-label={`Estado da proposta de ${p.clientName}`}
        className="mt-3 flex flex-wrap gap-1.5"
      >
        {ESTADOS.map((e) => {
          const activo = p.status === e.id;
          return (
            <button
              key={e.id}
              type="button"
              disabled={ocupada}
              aria-pressed={activo}
              title={e.ajuda}
              onClick={() => (e.id === "rejeitada" ? onRecusar() : onEstado(e.id))}
              className={`alvo-toque rounded-full border px-3 py-1.5 text-[10px] tracking-[0.1em] uppercase transition-colors disabled:opacity-50 ${
                activo
                  ? "border-[#4d6350] bg-[#4d6350] text-white"
                  : "border-foreground/12 text-foreground/55 hover:border-[#4d6350]/40 hover:text-foreground/85"
              }`}
            >
              {e.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setSeguimentoAberto((v) => !v)}
          aria-expanded={seguimentoAberto}
          className="alvo-toque rounded-full border border-foreground/12 px-3 py-1.5 text-[10px] tracking-[0.1em] uppercase text-foreground/55 transition-colors hover:border-foreground/30 hover:text-foreground/85"
        >
          {p.followUpAt ? "Mudar seguimento" : "Marcar seguimento"}
        </button>
      </div>

      {/* ── Seguimento ──────────────────────────────────────────────────── */}
      {seguimentoAberto && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-foreground/[0.02] p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-[0.1em] uppercase text-foreground/50">
              Voltar a falar em
            </span>
            <input
              type="date"
              value={dataSeguimento}
              min={hojeISO()}
              onChange={(e) => setDataSeguimento(e.target.value)}
              className="bo-input px-2.5 py-2 text-xs"
            />
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className="text-[10px] tracking-[0.1em] uppercase text-foreground/50">
              Para quê (opcional)
            </span>
            <input
              type="text"
              value={notaSeguimento}
              maxLength={200}
              placeholder="Ex.: mandar fotos do arco"
              onChange={(e) => setNotaSeguimento(e.target.value)}
              className="bo-input px-2.5 py-2 text-xs"
            />
          </label>
          <Button
            size="sm"
            disabled={ocupada}
            onClick={() => {
              onSeguimento(dataSeguimento, notaSeguimento);
              setSeguimentoAberto(false);
            }}
          >
            Guardar
          </Button>
          {p.followUpAt && (
            <Button
              variant="ghost"
              size="sm"
              disabled={ocupada}
              onClick={() => {
                setDataSeguimento("");
                setNotaSeguimento("");
                onSeguimento("", "");
                setSeguimentoAberto(false);
              }}
            >
              Retirar
            </Button>
          )}
        </div>
      )}

      {/* ── Porque é que se perdeu ──────────────────────────────────────── */}
      {aRecusar && (
        <div className="mt-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-3">
          <p className="text-[11px] text-foreground/60">
            Porque é que se perdeu? Fica só do lado de cá, e é o que permite saber daqui a um ano
            quantas se perderam por preço.
          </p>
          <div role="group" aria-label="Motivo da recusa" className="mt-2 flex flex-wrap gap-1.5">
            {MOTIVOS.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={motivo === m.id}
                onClick={() => setMotivo(m.id)}
                className={`alvo-toque rounded-full border px-3 py-1.5 text-[10px] tracking-[0.1em] uppercase transition-colors ${
                  motivo === m.id
                    ? "border-foreground/40 bg-foreground/[0.08] text-foreground/80"
                    : "border-foreground/12 text-foreground/55 hover:border-foreground/30"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              type="text"
              value={notaMotivo}
              maxLength={300}
              placeholder="Detalhe (opcional)"
              aria-label="Detalhe do motivo"
              onChange={(e) => setNotaMotivo(e.target.value)}
              className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs"
            />
            <Button size="sm" disabled={ocupada} onClick={() => onMotivo(motivo, notaMotivo)}>
              Marcar como recusada
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelarRecusa}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
