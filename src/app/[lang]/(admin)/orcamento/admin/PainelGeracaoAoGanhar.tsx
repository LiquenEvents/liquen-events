"use client";

import { useCallback, useEffect, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import type { PreviaGeracaoDoEvento, ResultadoGeracaoDoEvento } from "@/lib/semear-producao";
import { porqueFalhou, porqueRebentou, type Falha } from "@/lib/porque-falhou";
import { Button, Card } from "./ui";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O PAINEL DE «GANHO»: O QUE VAI NASCER, ANTES DE NASCER
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `PROPOSTA-ACEITE.md`: "Marcar como aceite mostra um painel com o que vai ser
 * gerado e quantas linhas de cada; ela carrega em gerar." É este componente.
 *
 * ── ONDE ISTO ESTÁ MONTADO ────────────────────────────────────────────────
 * No painel de detalhe do pedido (`AdminClient.tsx`), ao lado da
 * `PerguntaDeDesfecho` — que é onde o «Ganho» acaba de ser dado.
 *
 * Esteve escrito, testado e NÃO MONTADO durante meses, e o custo foi este: o
 * «Ganho» semeia sozinho duas das quatro peças (o plano de montagem e a
 * checklist), e as outras duas — a lista de MATERIAL e as DATAS-CHAVE no
 * calendário — mais as linhas de SINAL e SALDO só saem daqui. Por cada
 * casamento ganho, ela refazia tudo isso à mão. O `nada-fica-por-montar.test.ts`
 * existe para isto não voltar a acontecer em silêncio.
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
  | { fase: "erro"; mensagem: string; repetir: boolean }
  | { fase: "previa"; previa: PreviaGeracaoDoEvento }
  | { fase: "a_gerar"; previa: PreviaGeracaoDoEvento }
  | { fase: "gerado"; resultado: ResultadoGeracaoDoEvento };

/**
 * ── «FAILED TO FETCH», EM INGLÊS, NUM ECRÃ EM PORTUGUÊS ────────────────────
 * O `catch` mostrava o `e.message` tal como vinha — e quando a rede cai, o que
 * vem é o `TypeError` do próprio browser. MEDIDO na passagem de 9 de outubro.
 * As frases passam a ser as da casa (`porque-falhou.ts`): o que aconteceu,
 * porquê e o que fazer, e se repetir tem alguma hipótese de funcionar.
 */
class FalhaDoPedido extends Error {
  constructor(readonly falha: Falha) {
    super(falha.mensagem);
  }
}

async function pedir(id: string, acao: "prever" | "gerar") {
  const oQue = acao === "prever" ? "ver o que falta gerar" : "gerar a produção";
  let res: Response;
  try {
    res = await fetch(`/api/orcamento/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao }),
    });
  } catch {
    throw new FalhaDoPedido(porqueRebentou(oQue));
  }
  if (!res.ok) {
    const corpo = await res.json().catch(() => null);
    throw new FalhaDoPedido(porqueFalhou(oQue, res, corpo));
  }
  try {
    return await res.json();
  } catch {
    throw new FalhaDoPedido(porqueRebentou(oQue));
  }
}

/** O estado de erro a partir do que o `catch` apanhou. */
function erroDe(e: unknown, reserva: string): Extract<Estado, { fase: "erro" }> {
  if (e instanceof FalhaDoPedido) {
    return { fase: "erro", mensagem: e.falha.mensagem, repetir: e.falha.vaidaAdianteRepetir };
  }
  if (e instanceof FormaInesperada) return { fase: "erro", mensagem: e.message, repetir: true };
  return { fase: "erro", mensagem: reserva, repetir: true };
}

/** A única outra coisa que se atira daqui — escrita em casa, em português. */
class FormaInesperada extends Error {
  constructor() {
    super("O servidor respondeu com uma forma inesperada. Recarrega a página e repete.");
  }
}

/**
 * ── UMA RESPOSTA COM OUTRA FORMA NÃO PODE DEITAR ABAIXO A FICHA DO PEDIDO ──
 *
 * A resposta era convertida às cegas (`as PreviaGeracaoDoEvento`) e as quatro
 * contagens lidas no desenho (`previa[chave].linhas`). Um corpo com outra
 * forma — uma sessão que expirou e devolve outra coisa com 200, uma versão do
 * servidor mais antiga, um proxy pelo meio — atirava DENTRO do render, e um
 * `throw` no render leva à frente o painel de detalhe inteiro: o pedido
 * desaparece do ecrã por causa de um painel acessório.
 *
 * Enquanto este componente esteve por montar isto nunca aconteceu. Montá-lo é
 * a primeira vez que a forma da resposta é verdadeira.
 */
function ehContagem(x: unknown): boolean {
  return !!x && typeof x === "object" && typeof (x as { linhas?: unknown }).linhas === "number";
}

const CHAVES = ["material", "montagem", "calendario", "pagamentos"] as const;

function ehPrevia(x: unknown): x is PreviaGeracaoDoEvento {
  if (!x || typeof x !== "object") return false;
  return CHAVES.every((k) => ehContagem((x as Record<string, unknown>)[k]));
}

function ehResultado(x: unknown): x is ResultadoGeracaoDoEvento {
  return ehPrevia(x);
}

export default function PainelGeracaoAoGanhar({ quote, onGerado }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: "a_carregar" });

  // Sem `setEstado` síncrono no corpo — o primeiro passo é sempre o `await`.
  // O efeito chama isto directamente; quem quer VER o "a carregar" antes de
  // chamar (o botão "Tentar outra vez") marca-o a si próprio primeiro.
  const buscarPrevia = useCallback(async () => {
    try {
      const previa = await pedir(quote.id, "prever");
      if (!ehPrevia(previa)) throw new FormaInesperada();
      setEstado({ fase: "previa", previa });
    } catch (e) {
      setEstado(erroDe(e, "Não deu para ver o que falta gerar. Repete daqui a pouco."));
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
      const resultado = await pedir(quote.id, "gerar");
      if (!ehResultado(resultado)) throw new FormaInesperada();
      setEstado({ fase: "gerado", resultado });
      onGerado?.(resultado);
    } catch (e) {
      setEstado(erroDe(e, "Não deu para gerar a produção. Repete daqui a pouco."));
    }
  }

  return (
    <Card role="region" aria-labelledby="painel-geracao-titulo" className="flex flex-col gap-3">
      <div>
        <h3
          id="painel-geracao-titulo"
          className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--bo-tinta-72)]"
        >
          Produção a partir da proposta ganha
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--bo-text-muted)]">
          A partir dos serviços da proposta e do total já resolvido. Nunca apaga o que já está
          escrito à mão — só acrescenta o que falta.
        </p>
      </div>

      {estado.fase === "a_carregar" && (
        <p className="text-xs text-foreground/50">A ver o que falta gerar…</p>
      )}

      {estado.fase === "erro" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--bo-perigo)]">{estado.mensagem}</p>
          {/* Um botão que não pode funcionar (sessão expirada, pedido que já
              não existe, recusa do conteúdo) é pior do que nenhum. */}
          {estado.repetir && (
            <Button variant="secondary" size="sm" onClick={tentarOutraVez}>
              Tentar outra vez
            </Button>
          )}
        </div>
      )}

      {(estado.fase === "previa" || estado.fase === "a_gerar") && (
        <>
          <ul className="flex flex-col gap-1.5" data-testid="previa-linhas">
            {(Object.keys(ROTULOS) as (keyof typeof ROTULOS)[]).map((chave) => (
              <li
                key={chave}
                className="flex items-center justify-between text-xs text-[var(--bo-tinta-72)]"
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
          <p className="text-xs text-[var(--bo-tinta-72)]" data-testid="resultado-geracao">
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
