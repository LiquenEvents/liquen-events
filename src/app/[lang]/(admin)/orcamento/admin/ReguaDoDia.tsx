"use client";

import { useMemo } from "react";
import {
  horaDoMinuto,
  porExtenso,
  type AnaliseDoDia,
  type BlocoDoDia,
} from "@/lib/orcamento/guiao-do-dia";
import { emCarris, fracaoNaJanela, vaziosDaRegua, type JanelaDoDia } from "@/lib/orcamento/guioes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A RÉGUA DO DIA, DEITADA — O DIA INTEIRO NUM RELANCE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── PORQUE É QUE EXISTE UMA SEGUNDA RÉGUA ─────────────────────────────────
 *
 * A primeira — a do `EventTimeline` — é VERTICAL, é onde se edita, e cada bloco
 * tem 44 px de chão para se poder tocar com o polegar. Um dia dela mede uns
 * 800 px. Vinte dias medem dezasseis mil, e a pergunta desta vista («dos
 * eventos que aí vêm, qual é que está cheio e qual é que tem um problema?») não
 * se responde a rolar dezasseis mil píxeis.
 *
 * Esta é a mesma informação deitada e sem chão nenhum: um dia cabe numa fita de
 * uma linha, e vinte cabem num ecrã. É a relação que o sistema de design já
 * descreve entre o sparkline da Visão Geral e o gráfico grande das Estatísticas
 * — «o sparkline usa tipo, cor e anotações iguais ao gráfico grande» —, e é por
 * isso que esta régua **não inventa vocabulário nenhum**:
 *
 *   · o bloco com duração é uma barra cheia, a acento, como lá;
 *   · o momento sem duração é um INSTANTE e desenha-se como um traço fino com
 *     um ponto por cima — nunca como uma barra curta, que seria mentir sobre um
 *     comprimento que ninguém declarou;
 *   · o vazio é a moldura tracejada, e só quando é CERTO (ver `vaziosDaRegua`);
 *   · o choque de responsável é perigo — e leva um triângulo por cima, porque a
 *     cor nunca é o único portador de significado nesta casa.
 *
 * ── E A SOBREPOSIÇÃO É GEOMETRIA, NÃO COR ────────────────────────────────
 *
 * Duas coisas ao mesmo tempo ocupam o mesmo intervalo de píxeis. Postas no
 * mesmo carril, a segunda tapava a primeira e a fita mostrava um dia limpo onde
 * há duas coisas em cima uma da outra. Cada bloco vai para o primeiro carril
 * onde não bate em nada (`emCarris`), portanto a régua ENGROSSA onde o dia
 * corre em paralelo. Não é uma legenda: é a forma.
 */

/** Um instante não tem largura. Estes são os píxeis que o tornam tocável e visível. */
const LARGURA_DO_INSTANTE = 3;

/** O chão de um bloco com duração, para um momento de 15 min não desaparecer. */
const LARGURA_MINIMA = 4;

export type TamanhoDaRegua = "fita" | "painel";

/** Altura de um carril, por tamanho. Fora da grelha de 4 não há nada aqui. */
const ALTURA_DO_CARRIL: Record<TamanhoDaRegua, number> = { fita: 8, painel: 20 };
const FOLGA_ENTRE_CARRIS: Record<TamanhoDaRegua, number> = { fita: 4, painel: 4 };

export interface ReguaDoDiaProps {
  dia: AnaliseDoDia;
  janela: JanelaDoDia;
  /** Os ids dos momentos que entram num choque de responsável. */
  emChoque?: ReadonlySet<string>;
  /** O minuto do «agora» na régua do dia. `null` fora do dia do evento. */
  agora?: number | null;
  tamanho?: TamanhoDaRegua;
  /**
   * O nome acessível da régua inteira.
   *
   * A régua é uma imagem: quem ouve o ecrã não a percorre bloco a bloco (seriam
   * vinte paragens para uma informação que se vê de relance), ouve UMA frase que
   * a resume. Quem chama compõe a frase, porque só quem chama sabe de que
   * evento ela é.
   */
  rotulo: string;
}

function estiloDoBloco(
  b: BlocoDoDia,
  janela: JanelaDoDia,
): { left: string; width: string; minWidth: number } {
  const inicio = fracaoNaJanela(b.inicio, janela);
  const fim = fracaoNaJanela(b.fim, janela);
  const instante = b.duracao === 0;
  return {
    left: `${inicio * 100}%`,
    width: instante ? `${LARGURA_DO_INSTANTE}px` : `${Math.max(0, fim - inicio) * 100}%`,
    minWidth: instante ? LARGURA_DO_INSTANTE : LARGURA_MINIMA,
  };
}

/**
 * As horas escritas por baixo da régua grande.
 *
 * De três em três horas e nunca mais de sete marcas: uma régua com uma etiqueta
 * por hora tem dezanove números de 11 px encavalitados a 390 px de largura, que
 * é o mesmo que não ter nenhum. As marcas caem em horas certas (múltiplos de
 * três desde a meia-noite) e não em fracções da janela — «10:20» não é uma hora
 * que alguém procure.
 */
function marcasDeHora(janela: JanelaDoDia): number[] {
  const passo = 180;
  const primeira = Math.ceil(janela.inicio / passo) * passo;
  const marcas: number[] = [];
  for (let m = primeira; m <= janela.fim && marcas.length < 8; m += passo) marcas.push(m);
  return marcas;
}

export function ReguaDoDia({
  dia,
  janela,
  emChoque,
  agora = null,
  tamanho = "fita",
  rotulo,
}: ReguaDoDiaProps) {
  const { blocos, carris } = useMemo(() => emCarris(dia.blocos), [dia.blocos]);
  const vazios = useMemo(() => vaziosDaRegua(dia), [dia]);
  const altura = ALTURA_DO_CARRIL[tamanho];
  const folga = FOLGA_ENTRE_CARRIS[tamanho];
  const alturaTotal = carris * altura + (carris - 1) * folga;
  const grande = tamanho === "painel";
  const marcas = grande ? marcasDeHora(janela) : [];

  return (
    <div className="min-w-0">
      <div
        role="img"
        aria-label={rotulo}
        className="relative w-full"
        style={{ height: alturaTotal }}
      >
        {/* A espinha: onde o dia PODIA estar e não está. É por cima dela que os
            vazios se marcam a tracejado — sem espinha, um vazio a tracejado no
            meio do nada lia-se como uma caixa vazia e não como uma falha. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 rounded-full bg-[var(--bo-tinta-6)]"
          style={{ top: (alturaTotal - 2) / 2, height: 2 }}
        />

        {/* ── OS VAZIOS ────────────────────────────────────────────────────
            Moldura tracejada, o mesmo desenho que a banda vertical do
            `EventTimeline` usa para o mesmo intervalo do mesmo dia. */}
        {vazios.map((v) => {
          const de = fracaoNaJanela(v.inicio, janela);
          const ate = fracaoNaJanela(v.fim, janela);
          return (
            <span
              key={`vazio-${v.inicio}-${v.fim}`}
              aria-hidden="true"
              className="absolute rounded-[var(--bo-raio-miudeza)] border border-dashed border-[var(--bo-hairline-strong)]"
              style={{
                left: `${de * 100}%`,
                width: `${Math.max(0, ate - de) * 100}%`,
                top: 0,
                height: alturaTotal,
              }}
            />
          );
        })}

        {/* ── OS MOMENTOS ──────────────────────────────────────────────────
            Um por bloco, no carril que lhe coube. */}
        {blocos.map(({ bloco, carril }) => {
          const b = bloco as BlocoDoDia;
          const instante = b.duracao === 0;
          const choque = emChoque?.has(b.item.id) ?? false;
          const pos = estiloDoBloco(b, janela);
          const topo = carril * (altura + folga);
          return (
            <span key={b.item.id} aria-hidden="true">
              <span
                className={`absolute rounded-[var(--bo-raio-miudeza)] ${
                  choque
                    ? "bg-[var(--bo-perigo)]"
                    : instante
                      ? "bg-[var(--bo-accent)]"
                      : "bg-[var(--bo-accent)]/70"
                }`}
                style={{
                  left: pos.left,
                  width: pos.width,
                  minWidth: pos.minWidth,
                  top: topo,
                  height: altura,
                }}
                // O `title` é o que o rato mostra ao passar por cima. Não
                // substitui o nome acessível da régua — acrescenta-lhe o
                // detalhe para quem tem ponteiro.
                title={`${b.item.time} ${b.item.title}${b.duracao > 0 ? ` · ${porExtenso(b.duracao)}` : ""}`}
              />
              {/* ── A MARCA POR CIMA: A FORMA QUE ACOMPANHA A COR ──────────
                  Um PONTO redondo para o instante, um LOSANGO para o choque de
                  responsável. Um dia lido em tons de cinzento — ou por quem não
                  distingue vermelho de verde — continua a separar os três
                  estados, que é a regra desta casa.

                  Um losango e não um triângulo: um triângulo em CSS faz-se com
                  `border-x-transparent`, e o `cores-que-existem.test.ts` lê
                  isso como uma classe de cor apontada a um token «x-transparent»
                  que não existe. A rede está certa e a forma é indiferente ao
                  significado — muda-se a forma, não a rede. */}
              {(instante || choque) && (
                <span
                  className={`absolute ${
                    choque
                      ? "rotate-45 bg-[var(--bo-perigo)]"
                      : "rounded-full bg-[var(--bo-accent)]"
                  }`}
                  style={{
                    left: pos.left,
                    top: topo - 6,
                    width: 5,
                    height: 5,
                    marginLeft: pos.minWidth / 2 - 2.5,
                  }}
                />
              )}
            </span>
          );
        })}

        {/* ── O «AGORA» ────────────────────────────────────────────────────
            Uma risca a atravessar os carris todos, e só no dia do evento. Fora
            dele não há «agora» nenhum de que falar — ver `estaNoDia`. */}
        {agora !== null && agora >= janela.inicio && agora <= janela.fim && (
          <span
            aria-hidden="true"
            className="absolute w-px bg-[var(--bo-perigo)]"
            style={{
              left: `${fracaoNaJanela(agora, janela) * 100}%`,
              top: -2,
              height: alturaTotal + 4,
            }}
          />
        )}
      </div>

      {grande && (
        <div className="relative mt-1 h-4">
          {marcas.map((m) => (
            <span
              key={m}
              aria-hidden="true"
              className="absolute -translate-x-1/2 text-[10px] tabular-nums text-[var(--bo-text-faint)]"
              style={{ left: `${fracaoNaJanela(m, janela) * 100}%` }}
            >
              {horaDoMinuto(m)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default ReguaDoDia;
