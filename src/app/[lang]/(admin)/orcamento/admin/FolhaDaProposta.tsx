"use client";

import type { ProposalDoc } from "@/lib/proposal-doc";
import { PAGINA_H, PAGINA_M, PAGINA_W } from "@/lib/proposal-geometria";
import {
  resumoDaPagina,
  rubricaDaLinha,
  type PaginaDaProposta,
  type ResumoDaPagina,
} from "@/lib/proposal-paginas";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { FotoDaPrevia, cq, pct } from "./PreviaDaPagina";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOLHAS QUE NÃO SÃO DE INSPIRAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «uma pré-visualização parcial dá falsa confiança».
 *
 * A `PreviaDaPagina` desenha as páginas de inspiração à escala, com as
 * fotografias lá dentro. As outras seis — capa, apresentação, orçamento,
 * condições, observações, contracapa — não tinham desenho nenhum, e eram
 * precisamente as que ela nunca via antes de carregar em «Enviar».
 *
 * ── O QUE ISTO PROMETE, E O QUE NÃO PROMETE ───────────────────────────────
 *
 * NÃO promete a paginação. Uma folha de texto parte onde a fonte a manda partir,
 * e só se sabe onde depois de a desenhar — fingir aqui a quebra exacta era estar
 * errado justamente nos casos em que a quebra importa. Quando o texto passa o
 * que a folha leva, isto diz «e mais N linhas» em vez de inventar uma segunda
 * folha.
 *
 * PROMETE as palavras. Cada linha vem de `resumoDaPagina`, que chama as mesmas
 * funções que o gerador chama — os campos por `camposDoEventoNaLingua`, as
 * condições por `blocosFixosNaLingua`, os títulos por `textosDaProposta`. Um
 * `{{marcador}}` por substituir, uma secção vazia, uma folha em português
 * dentro de uma proposta inglesa: os três erros que chegaram a clientes são
 * erros de PALAVRAS, e os três vêem-se aqui.
 *
 * ── E POR ISSO O TEXTO É TEXTO A SÉRIO ────────────────────────────────────
 *
 * Podia ser um desenho de linhas cinzentas — mais bonito na grelha, e inútil.
 * É texto, à escala da folha (`cq`), o que numa miniatura de 170 px dá letra de
 * três píxeis: ilegível, e de propósito. O que se lê na grelha é a FORMA da
 * folha — cheia, vazia, desequilibrada. Para ler as palavras aproxima-se, e é
 * para isso que a vista de conjunto tem a lupa.
 *
 * ── A CAPA É OUTRA COISA ──────────────────────────────────────────────────
 *
 * A capa e a contracapa não são folhas de texto: são duas fotografias com um
 * painel escuro pelo meio, e é a única página do documento cuja cor se decide.
 * Desenha-se como ela é — a mesma proporção do painel (34% da folha), as mesmas
 * fotografias, o mesmo verde-preto —, porque é aí que a pergunta «isto parece
 * tudo do mesmo casamento?» começa a ter resposta.
 */

/** O verde-preto da capa — `DARK`, em `proposal-doc-pdf.ts`. */
const ESCURO = "#0c0e0b";
/** O creme do nome na capa, e o seu tom apagado para as linhas de baixo. */
const CREME = "#f7f4ee";
const CREME_APAGADO = "#b8bcb5";
/** O dourado da régua e do sobretítulo da capa. */
const DOURADO = "#b8993f";

/** A largura do painel central da capa, em fracção da folha (ver o gerador). */
const PAINEL = 0.34;

/* ── AS ALTURAS, EM PONTOS DE PDF ──────────────────────────────────────────
   Copiadas do gerador, uma a uma, e não estimadas a olho: o sobretítulo da
   secção sai em `H - M - 64`, o título 24 abaixo, a régua 36 abaixo, e o corpo
   começa 58 abaixo do sobretítulo. Um número diferente aqui não daria uma
   miniatura «parecida» — daria uma miniatura que mente sobre onde a página
   respira. */
const BASE_SOBRETITULO = PAGINA_H - PAGINA_M - 64;
const BASE_TITULO = BASE_SOBRETITULO - 24;
const BASE_REGUA = BASE_SOBRETITULO - 36;
const BASE_CORPO = BASE_SOBRETITULO - 58;
/** O chão da mancha — abaixo disto o gerador muda de folha. */
const CHAO = PAGINA_M + 24;
/** Corpo e avanço de uma linha do corpo, como o gerador as desenha. */
const CORPO = 9;
const AVANCO = 12;
/** A medida de leitura: o texto não corre até à margem direita. */
const MEDIDA = 430;

/** Quantas linhas cabem numa folha, com esta métrica. */
export const LINHAS_POR_FOLHA = Math.floor((BASE_CORPO - CHAO) / AVANCO);

export default function FolhaDaProposta({
  doc,
  pagina,
  idioma = "pt",
  capas = [],
  originaisDasCapas = [],
}: {
  doc: ProposalDoc;
  pagina: PaginaDaProposta;
  idioma?: IdiomaDaProposta;
  /** O URL de cada fotografia de capa, pela ordem do documento. */
  capas?: (string | undefined)[];
  /** O original de cada uma — o degrau seguinte da cascata. */
  originaisDasCapas?: (string | undefined)[];
}) {
  const resumo = resumoDaPagina(doc, pagina, idioma);
  const daCapa = pagina.especie === "capa" || pagina.especie === "contracapa";

  return (
    <div
      className={`relative w-full overflow-hidden rounded-md border ${
        daCapa ? "border-transparent" : "border-foreground/15 bg-white"
      }`}
      style={{
        aspectRatio: `${PAGINA_W} / ${PAGINA_H}`,
        // Sem isto os `cqw` medem-se à JANELA e a letra deixa de encolher com a
        // folha — ver o cabeçalho da `PreviaDaPagina`.
        containerType: "inline-size",
        ...(daCapa ? { background: ESCURO } : null),
      }}
    >
      {daCapa ? (
        <Capa resumo={resumo} capas={capas} originais={originaisDasCapas} />
      ) : (
        <FolhaDeTexto resumo={resumo} />
      )}
    </div>
  );
}

/**
 * A capa: duas fotografias e um painel escuro pelo meio.
 *
 * Se não houver fotografias nenhumas, o gerador desenha a folha inteira escura —
 * e é isso que aqui se vê, sem caixa cinzenta nenhuma a fingir que falta uma
 * imagem. Uma capa sem fotos é uma decisão possível; o que não pode é parecer um
 * erro quando não é, nem parecer bem quando é.
 */
function Capa({
  resumo,
  capas,
  originais,
}: {
  resumo: ResumoDaPagina;
  capas: (string | undefined)[];
  originais: (string | undefined)[];
}) {
  const temFotos = !!(capas[0] || capas[1]);
  const lado = `${((1 - PAINEL) / 2) * 100}%`;

  return (
    <>
      {temFotos && (
        <>
          <span className="absolute inset-y-0 left-0 block overflow-hidden" style={{ width: lado }}>
            <FotoDaPrevia url={capas[0]} original={originais[0]} semRecorte={false} />
          </span>
          <span
            className="absolute inset-y-0 right-0 block overflow-hidden"
            style={{ width: lado }}
          >
            <FotoDaPrevia url={capas[1]} original={originais[1]} semRecorte={false} />
          </span>
        </>
      )}

      {/* O painel escuro, por cima das duas — é ele que dá o desdobrável. */}
      <span
        className="absolute inset-y-0 block"
        style={{ left: lado, width: `${PAINEL * 100}%`, background: ESCURO }}
      />

      <div
        className="absolute inset-x-0 flex flex-col items-center text-center"
        style={{ bottom: pct(190, PAGINA_H), paddingInline: pct(PAGINA_M, PAGINA_W) }}
      >
        {resumo.sobretitulo && (
          <p
            className="truncate font-medium uppercase"
            style={{ fontSize: cq(9), letterSpacing: cq(3.2), color: DOURADO }}
          >
            {resumo.sobretitulo}
          </p>
        )}
        <span
          className="mt-[1.2cqw] block"
          style={{ width: cq(52), height: cq(1.1), background: DOURADO }}
        />
        <p
          className="mt-[3cqw] font-serif leading-tight"
          style={{ fontSize: cq(40), color: CREME }}
        >
          {resumo.titulo || "—"}
        </p>
        {resumo.linhas.map((l, i) => (
          <p
            key={i}
            className={i === 0 ? "mt-[2.5cqw]" : "mt-[1.4cqw] font-serif italic"}
            style={{
              fontSize: cq(11),
              color: i === 0 ? CREME_APAGADO : "#8d8f88",
              ...(i === 0 ? { letterSpacing: cq(1.4) } : null),
            }}
          >
            {l}
          </p>
        ))}
      </div>
    </>
  );
}

/** Uma folha de texto: o cabeçalho da secção e as linhas que ela leva. */
function FolhaDeTexto({ resumo }: { resumo: ResumoDaPagina }) {
  const cabem = resumo.linhas.slice(0, LINHAS_POR_FOLHA);
  const sobram = resumo.linhas.length - cabem.length;

  return (
    <>
      {resumo.sobretitulo && (
        <p
          className="absolute truncate font-medium uppercase text-foreground/40"
          style={{
            left: pct(PAGINA_M, PAGINA_W),
            right: pct(PAGINA_M, PAGINA_W),
            bottom: pct(BASE_SOBRETITULO, PAGINA_H),
            fontSize: cq(7.5),
            letterSpacing: cq(2),
          }}
        >
          {resumo.sobretitulo}
        </p>
      )}
      <p
        className="absolute truncate font-serif text-foreground/85"
        style={{
          left: pct(PAGINA_M, PAGINA_W),
          right: pct(PAGINA_M, PAGINA_W),
          bottom: pct(BASE_TITULO, PAGINA_H),
          fontSize: cq(20),
        }}
      >
        {resumo.titulo}
      </p>
      <span
        className="absolute block"
        style={{
          left: pct(PAGINA_M, PAGINA_W),
          bottom: pct(BASE_REGUA, PAGINA_H),
          width: pct(32, PAGINA_W),
          height: pct(0.6, PAGINA_H),
          background: "rgba(42,38,32,0.25)",
        }}
      />

      {resumo.vazia ? (
        /* ── UMA FOLHA EM BRANCO É UM ERRO, E TEM DE SE LER COMO UM ──────
           O gerador desenha esta folha na mesma: o cabeçalho sai, e por baixo
           não sai nada. Desenhá-la aqui vazia e calada seria repetir o defeito
           em pequenino — quem olhasse para a grelha via uma folha discreta em
           vez de um problema. */
        <p
          className="absolute font-serif italic"
          style={{
            left: pct(PAGINA_M, PAGINA_W),
            right: pct(PAGINA_M, PAGINA_W),
            bottom: pct(BASE_CORPO - 4, PAGINA_H),
            fontSize: cq(11),
            color: "#a8402f",
          }}
        >
          Esta folha sai em branco.
        </p>
      ) : (
        <div
          className="absolute overflow-hidden"
          style={{
            left: pct(PAGINA_M, PAGINA_W),
            width: pct(MEDIDA, PAGINA_W),
            top: pct(PAGINA_H - BASE_CORPO - CORPO, PAGINA_H),
            height: pct(BASE_CORPO - CHAO + CORPO, PAGINA_H),
          }}
        >
          {cabem.map((linha, i) => {
            const rubrica = rubricaDaLinha(linha);
            return (
              <p
                key={i}
                className={`truncate ${
                  rubrica ? "font-serif text-foreground/75" : "text-foreground/55"
                }`}
                style={{
                  fontSize: cq(rubrica ? 11 : CORPO),
                  lineHeight: AVANCO / (rubrica ? 11 : CORPO),
                  ...(rubrica ? { marginTop: cq(6) } : null),
                }}
              >
                {rubrica ?? linha}
              </p>
            );
          })}
          {sobram > 0 && (
            /* O que não cabe nesta folha continua na seguinte — é o que o
               «cerca de N páginas» já diz, e dizê-lo aqui é preferível a
               desenhar uma folha que não existe. */
            <p
              className="truncate italic text-foreground/35"
              style={{ fontSize: cq(CORPO), lineHeight: AVANCO / CORPO, marginTop: cq(4) }}
            >
              e mais {sobram} {sobram === 1 ? "linha" : "linhas"}, na folha seguinte
            </p>
          )}
        </div>
      )}
    </>
  );
}
