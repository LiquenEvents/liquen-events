"use client";

import { useState } from "react";
import { useToast } from "./Toast";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS MINIATURAS QUE FALTAM — o painel
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As fotos carregadas depois de as miniaturas existirem trazem as suas. As que
 * ficaram para trás não têm nenhuma, e para essas as grelhas caem para o
 * ORIGINAL: 2200 px e ~2,6 MB para desenhar uma célula de 150 px. É a
 * explicação mais provável para «a biblioteca demora imenso a mostrar as
 * fotos» — e ninguém sabe quantas são.
 *
 * ── PORQUE É QUE SÃO DOIS BOTÕES ──────────────────────────────────────────
 * Contar não escreve nada; gerar escreve. Um botão que fizesse as duas coisas
 * era um botão em que se hesita — e ver o número tem de ser uma coisa que se
 * faz sem medo. Se a contagem der zero, esta hipótese cai e não se mexe em
 * nada, que é o melhor que pode acontecer.
 *
 * ── PORQUE É QUE A GERAÇÃO ANDA AOS POUCOS ────────────────────────────────
 * O servidor faz um lote de cada vez e diz quantas ficaram; este ecrã repete
 * até dar zero. É o que permite ter uma barra que anda de verdade em vez de um
 * pedido de dez minutos que morre a meio sem dizer onde ia. Fechar a página a
 * meio não estraga nada: nada é substituído, e voltar a carregar retoma.
 */

interface Linha {
  origem: string;
  destino: string;
  pasta: string;
  fotos: number;
  emFalta: number;
}

interface Contagem {
  linhas: Linha[];
  fotos: number;
  emFalta: number;
  avisos: string[];
}

export default function Miniaturas() {
  const { toast } = useToast();
  const [contagem, setContagem] = useState<Contagem | null>(null);
  const [aContar, setAContar] = useState(false);
  const [aGerar, setAGerar] = useState(false);
  const [feitas, setFeitas] = useState(0);
  const [falhadas, setFalhadas] = useState<string[]>([]);

  /**
   * A contagem, e mais nada.
   *
   * **Não limpa a lista do que falhou**, e isso é o ponto. A primeira versão
   * limpava — e como a geração faz uma recontagem no fim para actualizar o
   * número, a lista das fotografias que não deram era apagada no instante em
   * que passava a fazer falta. Ficava um «8 em falta» sem dizer quais. O teste
   * apanhou-o.
   *
   * Quem limpa é o BOTÃO de contar, porque aí é uma leitura nova a pedido dela.
   */
  async function contar() {
    setAContar(true);
    try {
      const res = await fetch("/api/admin/derivadas");
      const dados = await res.json().catch(() => null);
      if (!res.ok) throw new Error(dados?.error ?? "Não consegui contar.");
      setContagem(dados);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui contar.", "error");
    } finally {
      setAContar(false);
    }
  }

  async function contarDeNovo() {
    setFeitas(0);
    setFalhadas([]);
    await contar();
  }

  async function gerar() {
    setAGerar(true);
    setFalhadas([]);
    // A contagem recomeça AQUI, e não à chegada do primeiro lote: uma segunda
    // passagem sobre as que ficaram deixava o número da primeira no ecrã — «A
    // gerar… 52/8», com a barra cheia e nada feito — durante todo o tempo do
    // primeiro pedido.
    setFeitas(0);
    let total = 0;
    const problemas: string[] = [];
    try {
      // Até 200 lotes: um travão para o ciclo não poder ficar eterno se o
      // servidor passar a devolver sempre o mesmo número. 200 × 25 = 5000
      // fotografias, que é mais do que a biblioteca inteira.
      for (let volta = 0; volta < 200; volta += 1) {
        const res = await fetch("/api/admin/derivadas", { method: "POST" });
        const dados = await res.json().catch(() => null);
        if (!res.ok) throw new Error(dados?.error ?? "Não consegui gerar.");
        total += dados.geradas ?? 0;
        setFeitas(total);
        if (Array.isArray(dados.falhas)) problemas.push(...dados.falhas);
        // Zero geradas E zero restantes é o fim. Zero geradas com restantes a
        // sobrar quer dizer que o que resta está a falhar sempre — parar aqui é
        // melhor do que repetir a mesma falha duzentas vezes.
        if (!dados.restantes || dados.geradas === 0) break;
      }
      toast(
        problemas.length > 0
          ? `${total} miniaturas geradas, ${problemas.length} falharam.`
          : `${total} miniaturas geradas.`,
        problemas.length > 0 ? "error" : "success",
      );
      await contar();
    } catch (e) {
      const porque = e instanceof Error ? e.message : "Não consegui gerar.";
      // Dizer que PAROU A MEIO, e não só o que se avariou: a lista que fica no
      // ecrã é do que se apurou até aqui, não do trabalho todo. Sem esta parte,
      // ela lia três falhas e dava a corrida por fechada.
      toast(
        problemas.length > 0
          ? `${porque} — parou a meio: ${total} geradas e ${problemas.length} falhadas até aqui.`
          : porque,
        "error",
      );
    } finally {
      /**
       * AQUI, e não no fim do `try`.
       *
       * A lista das que falharam era escrita no ecrã só depois de o ciclo
       * inteiro correr bem. Basta o segundo lote apanhar a rede em baixo para o
       * `catch` levar consigo tudo o que já se sabia — e o que se sabia era
       * exactamente o que este painel promete: QUAIS falharam, para se poder
       * voltar a correr só para essas. Ficava um aviso genérico e nomes
       * nenhuns, com o trabalho de os apurar a ter de ser repetido do zero.
       */
      setFalhadas(problemas);
      setAGerar(false);
    }
  }

  const emFalta = contagem?.emFalta ?? 0;
  const porPasta = (contagem?.linhas ?? []).filter((l) => l.emFalta > 0);

  return (
    <section className="rounded-xl border border-foreground/[0.1] p-4 sm:p-5">
      <h3 className="text-sm font-medium">Miniaturas das fotografias</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">
        As fotos antigas não têm miniatura, e sem ela a biblioteca e os mood boards descarregam a
        fotografia inteira — cerca de 2,6 MB — para desenhar um quadrado pequeno. Contar não altera
        nada.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={contarDeNovo}
          disabled={aContar || aGerar}
          className="min-h-11 rounded-lg border border-foreground/20 px-3 text-sm hover:bg-foreground/[0.05] disabled:opacity-50"
        >
          {aContar ? "A contar…" : "Contar as que faltam"}
        </button>
        {emFalta > 0 && (
          <button
            type="button"
            onClick={gerar}
            disabled={aGerar || aContar}
            className="min-h-11 rounded-lg bg-foreground px-3 text-sm text-background disabled:opacity-50"
          >
            {aGerar ? `A gerar… ${feitas}/${emFalta}` : `Gerar as ${emFalta} que faltam`}
          </button>
        )}
      </div>

      {aGerar && (
        <div className="mt-3">
          {/* A barra é a contagem a sério, não uma animação: o servidor diz
              quantas fez em cada lote. */}
          <div
            className="h-1.5 overflow-hidden rounded-full bg-foreground/10"
            role="progressbar"
            aria-valuenow={feitas}
            aria-valuemin={0}
            aria-valuemax={emFalta}
            aria-label="Miniaturas geradas"
          >
            <div
              className="h-full bg-foreground/70 transition-[width] duration-300"
              style={{ width: `${emFalta > 0 ? Math.round((feitas / emFalta) * 100) : 0}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-foreground/55">
            Podes fechar esta página — nada se perde, e voltar aqui continua de onde ficou.
          </p>
        </div>
      )}

      {contagem && !aGerar && (
        <div className="mt-4 text-xs">
          {emFalta === 0 ? (
            <p className="text-foreground/70">
              Nenhuma em falta — as {contagem.fotos} fotografias têm todas miniatura.{" "}
              <span className="text-foreground/50">
                Se as grelhas continuarem lentas, a causa é outra.
              </span>
            </p>
          ) : (
            <>
              <p className="text-foreground/70">
                <strong>{emFalta}</strong> miniaturas em falta, em {contagem.fotos} fotografias.
              </p>
              <ul className="mt-2 space-y-0.5 text-foreground/55">
                {porPasta.slice(0, 12).map((l) => (
                  <li key={`${l.destino}-${l.pasta}`}>
                    {l.pasta} → {l.destino}: {l.emFalta} de {l.fotos}
                  </li>
                ))}
                {porPasta.length > 12 && <li>… e mais {porPasta.length - 12}.</li>}
              </ul>
            </>
          )}
          {contagem.avisos.length > 0 && (
            <p className="mt-2 text-[#8a2a22]">{contagem.avisos.join(" · ")}</p>
          )}
        </div>
      )}

      {falhadas.length > 0 && (
        <div className="mt-3 text-xs text-[#8a2a22]">
          {/* As que falharam ficam à vista: uma foto por gerar é uma foto que
              continua a servir o original, e saber QUAIS permite voltar a
              correr só para essas. */}
          {/* Uma frase inteira e não `{n} não deram`: interpolar parte o texto
              em dois nós, e "1 não deram" também não é português. */}
          <p className="font-medium">
            {falhadas.length === 1 ? "Uma não deu:" : `${falhadas.length} não deram:`}
          </p>
          <ul className="mt-1 space-y-0.5 text-foreground/55">
            {falhadas.slice(0, 8).map((f) => (
              <li key={f}>{f}</li>
            ))}
            {falhadas.length > 8 && <li>… e mais {falhadas.length - 8}.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
