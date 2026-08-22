"use client";

import { useRef, useState } from "react";
import { useToast } from "./Toast";
import { EmCurso } from "./ui/EmCurso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS MINIATURAS QUE FALTAM — o painel
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As fotos carregadas depois de as miniaturas existirem trazem as suas. As que
 * ficaram para trás não têm nenhuma, e para essas as grelhas caem para o
 * ORIGINAL: 2200 px e uns dois ou três megabytes para desenhar uma célula de
 * 150 px. É a explicação mais provável para «a biblioteca demora imenso a
 * mostrar as fotos» — e ninguém sabe quantas são.
 *
 * ── O QUE ESTE PAINEL DIZIA, E PORQUE É QUE ESTAVA ERRADO ──────────────────
 *
 * Dizia «1140 miniaturas em falta, em 683 fotografias», e a seguir doze linhas
 * assim:
 *
 *     6b9d0c4e-… → theme-avif-micro: 47 de 47
 *     6b9d0c4e-… → theme-avif: 47 de 47
 *     … e mais 55.
 *
 * Três defeitos, e nenhum deles é de estilo:
 *
 *  1. **1140 não são 1140 avarias.** A maioria era AVIF — acrescentado ontem,
 *     e que nenhuma fotografia anterior podia ter. Uma foto sem AVIF vê-se na
 *     mesma; uma foto sem miniatura puxa o original. Somar as duas num número
 *     grande e vermelho é dar um alarme que exagera, e um alarme que exagera é
 *     um alarme que se ignora.
 *  2. **Um UUID não é o nome de nada.** Ela conhece o tema por «Bouquets
 *     Campestres». O id da pasta e o nome interno do bucket são o dump de uma
 *     consulta posto num ecrã: não há dali nada a decidir.
 *  3. **«47 de 47» quatro vezes seguidas** era o mesmo tema repetido uma vez
 *     por bucket. Contava-se em derivadas; pensa-se em fotografias.
 *
 * Agora: contas em fotografias, temas com nome, e a avaria separada do ganho —
 * com um botão para cada, porque as miniaturas são uns lotes e o AVIF são
 * centenas de codificações caras. Quem tem a grelha lenta hoje não pode ter de
 * esperar por uma optimização para a arranjar.
 *
 * ── PORQUE É QUE SÃO BOTÕES SEPARADOS E CONTAR NÃO ESCREVE ────────────────
 * Contar não escreve nada; gerar escreve. Um botão que fizesse as duas coisas
 * era um botão em que se hesita — e ver o número tem de ser uma coisa que se
 * faz sem medo. Se a contagem der zero, esta hipótese cai e não se mexe em
 * nada, que é o melhor que pode acontecer.
 *
 * ── PORQUE É QUE A GERAÇÃO ANDA AOS POUCOS ────────────────────────────────
 * O servidor faz um lote de cada vez e diz quantas ficaram; este ecrã repete
 * até dar zero. É o que permite ter uma barra que anda de verdade em vez de um
 * pedido de dez minutos que morre a meio sem dizer onde ia. Fechar a página a
 * meio não estraga nada: nada é substituído, e voltar a carregar retoma — e é
 * por isso que há um «Parar» e não um aviso a dizer para não sair.
 */

type Papel = "essencial" | "leve";

interface Linha {
  origem: string;
  pasta: string;
  /** O nome por que ela conhece a coisa. A rota traduz; ver `pastas-com-nome`. */
  nome: string;
  daBiblioteca: boolean;
  fotos: number;
  semMiniatura: number;
  semVersaoLeve: number;
  emFalta: number;
}

interface Contagem {
  linhas: Linha[];
  fotos: number;
  emFalta: number;
  emFaltaEssenciais: number;
  emFaltaLeves: number;
  fotosSemMiniatura: number;
  fotosSemVersaoLeve: number;
  avisos: string[];
}

/** Quantas pastas se mostram antes de ser preciso pedir o resto. */
const LINHAS_A_MOSTRAR = 8;

/** Até 400 lotes: um travão para o ciclo não poder ficar eterno se o servidor
 *  passar a devolver sempre o mesmo número. 400 × 25 = 10 000 derivadas, que é
 *  mais do que a biblioteca inteira vezes os cinco formatos. */
const MAX_LOTES = 400;

const fotografias = (n: number) => `${n} ${n === 1 ? "fotografia" : "fotografias"}`;

export default function Miniaturas() {
  const { toast } = useToast();
  const [contagem, setContagem] = useState<Contagem | null>(null);
  const [aContar, setAContar] = useState(false);
  /** O que está a ser gerado agora — e `null` quando não está nada. */
  const [tarefa, setTarefa] = useState<{ papel: Papel | "tudo"; total: number } | null>(null);
  /** O que o servidor diz que está mesmo a fazer, que muda a meio quando o
   *  trabalho é «tudo»: primeiro as miniaturas, depois as versões leves. */
  const [aFazer, setAFazer] = useState<Papel | null>(null);
  const [feitas, setFeitas] = useState(0);
  const [falhadas, setFalhadas] = useState<string[]>([]);
  const [tudoAVista, setTudoAVista] = useState(false);
  /** Um sinal, não um estado: o ciclo lê-o entre lotes e não precisa de
   *  redesenhar nada para o ver. */
  const pedidoDeParar = useRef(false);

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
    setTudoAVista(false);
    await contar();
  }

  /**
   * Gera até acabar (ou até ela mandar parar), um lote de cada vez.
   *
   * `alvo` diz o que fazer: só as miniaturas, só as versões leves, ou tudo —
   * e neste último caso o servidor faz as essenciais primeiro, de propósito.
   */
  async function gerar(alvo: Papel | "tudo", total: number) {
    pedidoDeParar.current = false;
    setTarefa({ papel: alvo, total });
    setAFazer(alvo === "tudo" ? "essencial" : alvo);
    setFalhadas([]);
    // A contagem recomeça AQUI, e não à chegada do primeiro lote: uma segunda
    // passagem sobre as que ficaram deixava o número da primeira no ecrã — «A
    // gerar… 52 de 8», com a barra cheia e nada feito — durante todo o tempo
    // do primeiro pedido.
    setFeitas(0);
    let feito = 0;
    const problemas: string[] = [];
    let parou = false;
    const query = alvo === "tudo" ? "" : `?papel=${alvo}`;
    try {
      for (let volta = 0; volta < MAX_LOTES; volta += 1) {
        const res = await fetch(`/api/admin/derivadas${query}`, { method: "POST" });
        const dados = await res.json().catch(() => null);
        if (!res.ok) throw new Error(dados?.error ?? "Não consegui gerar.");
        feito += dados.geradas ?? 0;
        setFeitas(feito);
        if (dados.papel === "essencial" || dados.papel === "leve") setAFazer(dados.papel);
        if (Array.isArray(dados.falhas)) problemas.push(...dados.falhas);
        // Zero geradas E zero restantes é o fim. Zero geradas com restantes a
        // sobrar quer dizer que o que resta está a falhar sempre — parar aqui é
        // melhor do que repetir a mesma falha quatrocentas vezes.
        if (!dados.restantes || dados.geradas === 0) break;
        // O «Parar» é lido ENTRE lotes: um lote a meio acaba, porque abortá-lo
        // deixaria trabalho pago por metade. Nada se perde de qualquer forma.
        if (pedidoDeParar.current) {
          parou = true;
          break;
        }
      }
      toast(
        parou
          ? `Parado. ${feito} feitas até aqui — voltar a carregar continua daqui.`
          : problemas.length > 0
            ? `${feito} geradas, ${problemas.length} falharam.`
            : `${feito} geradas.`,
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
          ? `${porque} — parou a meio: ${feito} geradas e ${problemas.length} falhadas até aqui.`
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
      setTarefa(null);
      setAFazer(null);
      pedidoDeParar.current = false;
    }
  }

  const aGerar = tarefa !== null;
  const semMiniatura = contagem?.fotosSemMiniatura ?? 0;
  const semLeve = contagem?.fotosSemVersaoLeve ?? 0;
  const essenciais = contagem?.emFaltaEssenciais ?? 0;
  const leves = contagem?.emFaltaLeves ?? 0;
  const comProblema = (contagem?.linhas ?? []).filter((l) => l.emFalta > 0);
  const visiveis = tudoAVista ? comProblema : comProblema.slice(0, LINHAS_A_MOSTRAR);

  return (
    <section className="rounded-xl border border-foreground/[0.1] p-4 sm:p-5">
      <h3 className="text-sm font-medium">Miniaturas das fotografias</h3>
      {/* Duas frases, porque são duas coisas. A primeira é uma avaria e diz o
          que custa; a segunda é uma optimização e diz que não parte nada. Ter
          as duas debaixo do mesmo «em falta» era o que tornava o painel
          ilegível. */}
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">
        Uma fotografia <strong className="font-medium">sem miniatura</strong> é descarregada inteira
        — dois a três MB — para desenhar um quadrado de 150 px. É isso que faz a biblioteca demorar
        num telemóvel.
      </p>
      <p className="mt-1 text-xs leading-relaxed text-foreground/50">
        A <strong className="font-medium">versão leve</strong> (AVIF) é outra coisa: sem ela vê-se
        tudo à mesma, só que cada foto pesa mais um quarto em quem a saiba ler. Contar não altera
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
        {/* O botão de cima é sempre o que arranja a avaria. Quando não há
            avaria nenhuma, o único botão é o do ganho — e deixa de ser
            secundário porque já não há nada mais urgente ao lado. */}
        {essenciais > 0 && (
          <button
            type="button"
            onClick={() => gerar("essencial", essenciais)}
            disabled={aGerar || aContar}
            className="min-h-11 rounded-lg bg-foreground px-3 text-sm text-background disabled:opacity-50"
          >
            Gerar as miniaturas de {fotografias(semMiniatura)}
          </button>
        )}
        {leves > 0 && (
          <button
            type="button"
            onClick={() => gerar("leve", leves)}
            disabled={aGerar || aContar}
            className={
              essenciais > 0
                ? "min-h-11 rounded-lg border border-foreground/20 px-3 text-sm hover:bg-foreground/[0.05] disabled:opacity-50"
                : "min-h-11 rounded-lg bg-foreground px-3 text-sm text-background disabled:opacity-50"
            }
          >
            Gerar as versões leves de {fotografias(semLeve)}
          </button>
        )}
      </div>

      {aGerar && (
        <EmCurso
          className="mt-3"
          titulo={aFazer === "leve" ? "A gerar as versões leves" : "A gerar as miniaturas"}
          feito={feitas}
          total={tarefa.total}
          nota="Podes fechar esta página — nada se perde, e voltar aqui continua de onde ficou."
          aoParar={() => {
            pedidoDeParar.current = true;
          }}
          rotuloDoParar="Parar"
        />
      )}

      {contagem && !aGerar && (
        <div className="mt-4 space-y-1.5 text-xs">
          {contagem.emFalta === 0 ? (
            <p className="text-foreground/70">
              Nada em falta — as {contagem.fotos} fotografias têm todas miniatura e versão leve.{" "}
              <span className="text-foreground/50">
                Se as grelhas continuarem lentas, a causa é outra.
              </span>
            </p>
          ) : (
            <>
              {semMiniatura > 0 ? (
                <p className="text-foreground/80">
                  <strong>{fotografias(semMiniatura)}</strong> ainda são descarregadas inteiras, em{" "}
                  {contagem.fotos}.
                </p>
              ) : (
                <p className="text-foreground/70">
                  Nenhuma fotografia está a servir o original — as miniaturas estão todas feitas.
                </p>
              )}
              {semLeve > 0 && (
                <p className="text-foreground/55">
                  {fotografias(semLeve)} ainda sem versão leve. Não parte nada; é peso a mais.
                </p>
              )}
              {comProblema.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-foreground/55">
                  {visiveis.map((l) => (
                    <li key={`${l.origem}/${l.pasta}`} className="truncate">
                      <span className="text-foreground/75">{l.nome}</span>
                      {!l.daBiblioteca && <span className="text-foreground/40"> · pedido</span>}
                      {" — "}
                      {l.semMiniatura > 0
                        ? `${l.semMiniatura} de ${l.fotos} sem miniatura`
                        : `${l.semVersaoLeve} de ${l.fotos} sem versão leve`}
                    </li>
                  ))}
                </ul>
              )}
              {/* Um botão, e não «… e mais 55.». A frase antiga era um beco:
                  dizia que havia mais e não deixava lá chegar. */}
              {comProblema.length > LINHAS_A_MOSTRAR && (
                <button
                  type="button"
                  onClick={() => setTudoAVista((v) => !v)}
                  className="alvo-toque text-[11px] text-foreground/60 underline decoration-dotted underline-offset-2 hover:text-foreground"
                >
                  {tudoAVista
                    ? "Mostrar menos"
                    : `Ver as outras ${comProblema.length - LINHAS_A_MOSTRAR}`}
                </button>
              )}
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
