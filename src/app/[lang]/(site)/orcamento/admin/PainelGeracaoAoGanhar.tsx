"use client";

import { useCallback, useEffect, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import type { PreviaGeracaoDoEvento, ResultadoGeracaoDoEvento } from "@/lib/semear-producao";
import { Button, Card } from "./ui";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O PAINEL DE «GANHO»: O QUE VAI NASCER, ANTES DE NASCER
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `PROPOSTA-ACEITE.md`: "Marcar como aceite mostra um painel com o que vai ser
 * gerado e quantas linhas de cada; ela carrega em gerar." É este componente.
 *
 * ── ONDE ISTO AINDA NÃO ESTÁ LIGADO ───────────────────────────────────────
 * Este componente é standalone — não está inserido no Kanban, em Propostas,
 * nem em nenhum painel do dossier do evento. Esses ficheiros têm vários
 * agentes a mexer ao mesmo tempo e estavam fora do lote desta tarefa. Fica
 * pronto a montar onde o pedido «aceite» é mostrado (por exemplo, dentro do
 * dossier, ao lado de `PerguntaDeDesfecho`): `<PainelGeracaoAoGanhar quote={quote} />`.
 *
 * ── PORQUE NÃO SE MOSTRA SOZINHO ──────────────────────────────────────────
 * Só renderiza quando `quote.status === "aceite"`. Antes disso não há total
 * resolvido nem faz sentido nenhuma das quatro peças (ver `POST
 * /api/orcamento/[id]`, que recusa com 409).
 */

const ROTULOS: Record<keyof Omit<PreviaGeracaoDoEvento, "haQualquerCoisaAGerar">, string> = {
  material: "Checklist de material",
  montagem: "Plano de montagem",
  calendario: "Datas-chave no calendário",
  pagamentos: "Sinal e saldo",
};

interface Props {
  quote: Pick<Quote, "id" | "status">;
  /** Chamado depois de "Gerar" ter corrido, para quem mostra o pedido o poder
   *  recarregar — o plano de montagem e os pagamentos vivem no PRÓPRIO pedido. */
  onGerado?: (resultado: ResultadoGeracaoDoEvento) => void;
}

type Estado =
  | { fase: "a_carregar" }
  | { fase: "erro"; mensagem: string }
  | { fase: "previa"; previa: PreviaGeracaoDoEvento }
  | { fase: "a_gerar"; previa: PreviaGeracaoDoEvento }
  | { fase: "gerado"; resultado: ResultadoGeracaoDoEvento };

async function pedir(id: string, acao: "prever" | "gerar") {
  const res = await fetch(`/api/orcamento/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao }),
  });
  if (!res.ok) {
    const corpo = await res.json().catch(() => null);
    throw new Error((corpo && corpo.error) || `O servidor respondeu ${res.status}`);
  }
  return res.json();
}

export default function PainelGeracaoAoGanhar({ quote, onGerado }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: "a_carregar" });

  // Sem `setEstado` síncrono no corpo — o primeiro passo é sempre o `await`.
  // O efeito chama isto directamente; quem quer VER o "a carregar" antes de
  // chamar (o botão "Tentar outra vez") marca-o a si próprio primeiro.
  const buscarPrevia = useCallback(async () => {
    try {
      const previa = (await pedir(quote.id, "prever")) as PreviaGeracaoDoEvento;
      setEstado({ fase: "previa", previa });
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Falhou a prévia." });
    }
  }, [quote.id]);

  useEffect(() => {
    if (quote.status !== "aceite") return;
    buscarPrevia();
  }, [quote.status, buscarPrevia]);

  function tentarOutraVez() {
    setEstado({ fase: "a_carregar" });
    buscarPrevia();
  }

  if (quote.status !== "aceite") return null;

  async function gerar() {
    if (estado.fase !== "previa") return;
    setEstado({ fase: "a_gerar", previa: estado.previa });
    try {
      const resultado = (await pedir(quote.id, "gerar")) as ResultadoGeracaoDoEvento;
      setEstado({ fase: "gerado", resultado });
      onGerado?.(resultado);
    } catch (e) {
      setEstado({
        fase: "erro",
        mensagem: e instanceof Error ? e.message : "Falhou a geração.",
      });
    }
  }

  return (
    <Card role="region" aria-labelledby="painel-geracao-titulo" className="flex flex-col gap-3">
      <div>
        <h3
          id="painel-geracao-titulo"
          className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/70"
        >
          Produção a partir da proposta ganha
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-foreground/55">
          A partir dos serviços da proposta e do total já resolvido. Nunca apaga o que já está
          escrito à mão — só acrescenta o que falta.
        </p>
      </div>

      {estado.fase === "a_carregar" && (
        <p className="text-xs text-foreground/50">A ver o que falta gerar…</p>
      )}

      {estado.fase === "erro" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#8a4632]">{estado.mensagem}</p>
          <Button variant="secondary" size="sm" onClick={tentarOutraVez}>
            Tentar outra vez
          </Button>
        </div>
      )}

      {(estado.fase === "previa" || estado.fase === "a_gerar") && (
        <>
          <ul className="flex flex-col gap-1.5" data-testid="previa-linhas">
            {(Object.keys(ROTULOS) as (keyof typeof ROTULOS)[]).map((chave) => (
              <li
                key={chave}
                className="flex items-center justify-between text-xs text-foreground/75"
              >
                <span>{ROTULOS[chave]}</span>
                <span className="tabular-nums text-foreground/50">
                  {estado.previa[chave].linhas === 0
                    ? "nada a gerar"
                    : `${estado.previa[chave].linhas} linha${estado.previa[chave].linhas === 1 ? "" : "s"}`}
                </span>
              </li>
            ))}
          </ul>
          {estado.previa.haQualquerCoisaAGerar ? (
            <Button variant="primary" size="sm" loading={estado.fase === "a_gerar"} onClick={gerar}>
              Gerar
            </Button>
          ) : (
            <p className="text-xs text-foreground/50">Já está tudo gerado para este pedido.</p>
          )}
        </>
      )}

      {estado.fase === "gerado" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-foreground/75" data-testid="resultado-geracao">
            Gerado: {estado.resultado.material.linhas} de material ·{" "}
            {estado.resultado.montagem.linhas} de montagem · {estado.resultado.calendario.linhas}{" "}
            datas-chave · {estado.resultado.pagamentos.linhas} de pagamentos.
          </p>
          <Button variant="secondary" size="sm" onClick={tentarOutraVez}>
            Ver de novo
          </Button>
        </div>
      )}
    </Card>
  );
}
