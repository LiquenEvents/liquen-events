"use client";

import { useCallback, useEffect, useState } from "react";
import { eur } from "@/lib/money";
import type { Excluido, MotivoExclusao } from "@/lib/meta/conversoes-fecho";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CASAMENTOS FECHADOS QUE TÊM DE VOLTAR À META
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que estava escrito no manual dos anúncios, passo 5: «uma vez por semana,
 * abre `/api/meta/fechos`, lê o relatório, e se houver casamentos a enviar,
 * faz o envio».
 *
 * A primeira metade funcionava — esse endereço abre no browser e imprime o
 * relatório. A segunda NÃO EXISTIA: enviar é um POST, e um POST não se faz
 * abrindo um endereço. O rodapé do próprio relatório mandava-a fazer um `curl`
 * com o cookie da sessão, que não é uma instrução, é uma barreira. Na prática
 * o envio nunca acontecia.
 *
 * O que isso custa não é uma métrica bonita: sete dias depois do fecho a Meta
 * recusa o evento, **em silêncio**. Os casamentos que ela fecha desaparecem da
 * conta, e os anúncios continuam a optimizar para formulários preenchidos — os
 * mais fáceis de obter, que são os piores — em vez de optimizarem para
 * casamentos fechados. É a avaria que todo este trabalho existia para evitar.
 *
 * ── PORQUE É QUE O BOTÃO PERGUNTA, E COM OS NÚMEROS À VISTA ────────────────
 *
 * Um envio não se desfaz: a Meta recebeu, e o valor entra na conta dela. A
 * confirmação não é «tem a certeza?» — é o número de casamentos e o dinheiro,
 * escritos, para a pergunta ter conteúdo. É o mesmo desenho do «Substituir o
 * total de …» do estúdio.
 *
 * ── E PORQUE É QUE NÃO HÁ AQUI RELÓGIO NENHUM ─────────────────────────────
 *
 * Um agendador semanal a mandar valores de negócios para a Meta sem ninguém
 * carregar em nada é uma decisão dela, não minha. O botão põe o gesto ao
 * alcance; o relógio, se ela o quiser, decide-se depois.
 */

interface PorEnviar {
  ref: string;
  valor: number;
  /** Segundos UNIX. */
  fechadoEm: number;
}

interface Relatorio {
  examinados: number;
  valorTotal: number;
  diasAceites: number;
  configurada: boolean;
  aEnviar: PorEnviar[];
  excluidos: Excluido[];
}

interface Enviado {
  enviados: number;
  recebidos?: number;
  valorTotal?: number;
  motivo?: string;
  detalhe?: string;
  aviso?: string;
}

/** O que cada exclusão quer dizer, na língua de quem lê. As mesmas frases do
 *  relatório em texto — vêm de `conversoes-fecho.ts` e não se inventam aqui,
 *  para as duas leituras do mesmo número não se separarem. */
const EXPLICACAO: Record<MotivoExclusao, string> = {
  "sem-identificador": "não vieram de um anúncio da Meta (passa-a-palavra, Google, orgânico)",
  "identificador-ilegivel": "o identificador guardado não tem a forma esperada",
  "fora-da-janela": "fecharam há demasiado tempo — a Meta já não os aceita",
  "sem-valor": "não têm preço final nem proposta gravada",
  "ja-enviado": "já tinham sido enviados",
};

/** Os dias que faltam até a Meta deixar de aceitar este fecho. */
function diasQueFaltam(fechadoEm: number, diasAceites: number, agora = Date.now()): number {
  const passados = Math.floor((agora - fechadoEm * 1000) / 86_400_000);
  return diasAceites - passados;
}

export default function FechosMeta() {
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [aLer, setALer] = useState(true);
  const [falhouALeitura, setFalhouALeitura] = useState(false);
  const [aPerguntar, setAPerguntar] = useState(false);
  const [aEnviar, setAEnviar] = useState(false);
  const [desfecho, setDesfecho] = useState<Enviado | null>(null);

  /**
   * Nada de `setState` antes do primeiro `await`.
   *
   * O «a contar…» já é o estado inicial, e o botão de repetir liga-o de novo
   * ao ser carregado — que é onde ele pertence. Pô-lo aqui no topo fazia o
   * efeito de montagem escrever estado antes de sair para a rede, e uma
   * montagem que escreve estado é uma segunda passagem de desenho por nada.
   */
  const ler = useCallback(async () => {
    try {
      const res = await fetch("/api/meta/fechos?formato=json", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setRelatorio((await res.json()) as Relatorio);
    } catch {
      // Sem números não se oferece o botão: mandar enviar às cegas o que não
      // se conseguiu contar é o contrário do que este painel faz.
      setFalhouALeitura(true);
      setRelatorio(null);
    } finally {
      setALer(false);
    }
  }, []);

  useEffect(() => {
    void ler();
  }, [ler]);

  const enviar = async () => {
    setAPerguntar(false);
    setAEnviar(true);
    try {
      const res = await fetch("/api/meta/fechos", { method: "POST" });
      const dados = (await res.json().catch(() => null)) as Enviado | null;
      setDesfecho(
        dados ?? { enviados: 0, motivo: "erro-de-rede", detalhe: `resposta ${res.status}` },
      );
      // Voltar a contar: o que seguiu deixou de estar por enviar, e o painel
      // tem de o dizer sem ela ter de recarregar a página para acreditar.
      await ler();
    } catch (e) {
      setDesfecho({ enviados: 0, motivo: "erro-de-rede", detalhe: String(e) });
    } finally {
      setAEnviar(false);
    }
  };

  const quantos = relatorio?.aEnviar.length ?? 0;
  // O mais urgente manda na frase: é o que decide se isto pode esperar por
  // amanhã. `Infinity` quando não há nenhum, para não escrever um prazo falso.
  const maisUrgente = relatorio
    ? relatorio.aEnviar.reduce(
        (menos, e) => Math.min(menos, diasQueFaltam(e.fechadoEm, relatorio.diasAceites)),
        Infinity,
      )
    : Infinity;
  const perdidos = (relatorio?.excluidos ?? []).filter((e) => e.motivo === "fora-da-janela");

  return (
    <section className="rounded-2xl border border-foreground/[0.08] bg-white p-6 shadow-sm">
      <h3 className="text-foreground/55 text-[10px] font-medium uppercase tracking-[0.3em]">
        Casamentos fechados · Meta
      </h3>
      <p className="mt-1 text-[11px] leading-snug text-foreground/35">
        Devolve à Meta o valor dos casamentos que fecharam, para os anúncios
        optimizarem para casamentos e não para formulários.
      </p>

      {aLer && <p className="mt-4 text-xs text-foreground/40">A contar…</p>}

      {falhouALeitura && (
        <div className="mt-4">
          <p className="text-xs text-[#a03123]">
            Não foi possível contar os casamentos fechados.
          </p>
          <button
            type="button"
            onClick={() => {
              setALer(true);
              setFalhouALeitura(false);
              void ler();
            }}
            className="alvo-toque mt-2 rounded-lg border border-[var(--bo-hairline)] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-foreground/55 transition-colors hover:bg-foreground/[0.04]"
          >
            Tentar outra vez
          </button>
        </div>
      )}

      {relatorio && (
        <>
          <p className="mt-4 text-sm text-foreground/75">
            {quantos === 0 ? (
              <>Não há casamentos fechados por enviar.</>
            ) : (
              <>
                <strong className="font-semibold tabular-nums">{quantos}</strong>{" "}
                {quantos === 1 ? "casamento fechado" : "casamentos fechados"} por enviar ·{" "}
                <strong className="font-semibold tabular-nums">{eur(relatorio.valorTotal)}</strong>{" "}
                <span className="text-foreground/40">(sem IVA)</span>
              </>
            )}
          </p>

          {/* O prazo, quando há prazo. É a única frase deste painel que pode
              mudar o que ela faz a seguir, por isso é a que dá nas vistas. */}
          {quantos > 0 && maisUrgente <= 2 && (
            <p
              className="mt-2 rounded-lg bg-[#c0392b]/10 px-3 py-2 text-[12px] font-semibold text-[#a03123]"
              // Anunciado a quem não olha para aqui: é um prazo, não decoração.
              aria-live="polite"
            >
              {maisUrgente < 0
                ? "O mais antigo já passou do prazo da Meta."
                : maisUrgente === 0
                  ? "O mais antigo fecha o prazo da Meta HOJE."
                  : maisUrgente === 1
                    ? "O mais antigo fecha o prazo da Meta amanhã."
                    : `Faltam ${maisUrgente} dias ao mais antigo.`}
            </p>
          )}

          {!relatorio.configurada && (
            <p className="mt-3 rounded-lg bg-foreground/[0.04] px-3 py-2 text-[12px] leading-snug text-foreground/55">
              O envio ainda não está ligado: faltam as variáveis{" "}
              <code className="font-mono text-[11px]">META_DATASET_ID</code> e{" "}
              <code className="font-mono text-[11px]">META_CAPI_ACCESS_TOKEN</code> nas Definições
              do alojamento. Enquanto faltarem, o botão não envia nada — e é melhor sabê-lo aqui do
              que depois de carregar.
            </p>
          )}

          {quantos > 0 && !aPerguntar && (
            <button
              type="button"
              disabled={!relatorio.configurada || aEnviar}
              onClick={() => setAPerguntar(true)}
              className="alvo-toque mt-4 rounded-lg bg-[#4d6350] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-white shadow-sm transition-colors hover:bg-[#415440] disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11"
            >
              {aEnviar ? "A enviar…" : "Enviar à Meta"}
            </button>
          )}

          {/* A pergunta traz os dois números que ela precisa de ver ANTES: o
              envio não se desfaz. */}
          {aPerguntar && (
            <div className="mt-4 rounded-lg border border-[var(--bo-hairline)] p-3">
              <p className="text-[12px] leading-snug text-foreground/70">
                Enviar {quantos} {quantos === 1 ? "casamento" : "casamentos"} à Meta, no valor de{" "}
                {eur(relatorio.valorTotal)} sem IVA? Não se desfaz.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void enviar()}
                  className="alvo-toque rounded-lg bg-[#4d6350] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-white shadow-sm transition-colors hover:bg-[#415440] pointer-coarse:min-h-11"
                >
                  Enviar
                </button>
                <button
                  type="button"
                  onClick={() => setAPerguntar(false)}
                  className="alvo-toque rounded-lg border border-[var(--bo-hairline)] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-foreground/55 transition-colors hover:bg-foreground/[0.04] pointer-coarse:min-h-11"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* O desfecho diz o que ACONTECEU, não o que se pediu. Um envio
              recusado nunca pode sair daqui com o aspecto de um envio feito. */}
          {desfecho && (
            <p
              className={`mt-4 rounded-lg px-3 py-2 text-[12px] leading-snug ${
                desfecho.enviados > 0
                  ? "bg-[#4d6350]/10 text-[#3c5140]"
                  : "bg-[#c0392b]/10 text-[#a03123]"
              }`}
              role="status"
            >
              {desfecho.enviados > 0 ? (
                <>
                  A Meta recebeu {desfecho.recebidos ?? desfecho.enviados} de {desfecho.enviados}.
                  {desfecho.aviso ? ` ${desfecho.aviso}` : ""}
                </>
              ) : desfecho.motivo === "sem-configuracao" ? (
                <>Não seguiu nada: o envio para a Meta não está configurado neste alojamento.</>
              ) : desfecho.motivo === "recusado" ? (
                <>A Meta recusou o envio. {desfecho.detalhe ?? ""}</>
              ) : desfecho.motivo ? (
                <>Não foi possível enviar ({desfecho.motivo}). Tenta outra vez daqui a pouco.</>
              ) : (
                <>Não havia nada para enviar.</>
              )}
            </p>
          )}

          {/* Os que ficaram de fora. O que interessa aqui é o «fora da
              janela»: esse número é dinheiro que a conta da Meta já não vai
              contar, e é a prova de que a rotina falhou — não um detalhe. */}
          {perdidos.length > 0 && (
            <p className="mt-4 text-[12px] leading-snug text-[#a03123]">
              {perdidos.length}{" "}
              {perdidos.length === 1
                ? "casamento fechado já não pode ser enviado"
                : "casamentos fechados já não podem ser enviados"}
              : passaram os {relatorio.diasAceites} dias que a Meta aceita.
            </p>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer text-[11px] text-foreground/40">
              {relatorio.examinados}{" "}
              {relatorio.examinados === 1 ? "fecho examinado" : "fechos examinados"} — ver o que
              ficou de fora
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {contarPorMotivo(relatorio.excluidos).map(([motivo, quantos]) => (
                <li key={motivo} className="text-[11px] text-foreground/45">
                  <span className="tabular-nums">{quantos}</span> — {EXPLICACAO[motivo]}
                </li>
              ))}
              {relatorio.excluidos.length === 0 && (
                <li className="text-[11px] text-foreground/45">Nenhum ficou de fora.</li>
              )}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

/** Quantos por motivo, pela ordem em que aparecem. Exportada para o teste
 *  poder contar sem passar pelo ecrã. */
export function contarPorMotivo(excluidos: Excluido[]): [MotivoExclusao, number][] {
  const conta = new Map<MotivoExclusao, number>();
  for (const e of excluidos) conta.set(e.motivo, (conta.get(e.motivo) ?? 0) + 1);
  return [...conta.entries()];
}
