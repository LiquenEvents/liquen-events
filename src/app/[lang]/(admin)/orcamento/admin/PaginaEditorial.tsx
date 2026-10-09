"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { composicao, LARGURA_DO_MOSAICO, type Caixa } from "@/lib/pdf-editorial/mosaico";
import type { EntradaDoPlano } from "@/lib/pdf-editorial/plano";
import { textosDaProposta } from "@/lib/proposal-doc-textos";
import { ASPETO_POR_OMISSAO } from "@/lib/proposal-geometria";
import { SITE } from "@/lib/site";
import ImagemComPlanoB from "./ImagemComPlanoB";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA PÁGINA DO PDF NOVO, EM PEQUENO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A miniatura que o estúdio mostra na «Vista de conjunto», no painel «O que vai
 * sair» e no cartão de cada tema. Substitui a `PreviaDaPagina` e a
 * `FolhaDaProposta`, que desenhavam a folha BRANCA do PDF antigo: ela pediu
 * «altera tudo à volta de forma a que o sistema de fazer proposta se adapte à
 * forma como agora está o PDF», e uma miniatura branca de um PDF escuro é a
 * pré-visualização parcial que «dá falsa confiança».
 *
 * ── O QUE É EXACTO E O QUE É APROXIMADO ───────────────────────────────────
 *
 * As páginas dos temas são EXACTAS na forma: as caixas saem de `composicao()`
 * (`pdf-editorial/mosaico.ts`), a mesma função que o servidor chama, com as
 * fotografias pela ordem de desenho (a do cartão à frente) e as formas que o
 * estúdio já mediu.
 *
 * As outras páginas são a sua ESTRUTURA — onde fica a fotografia, onde fica o
 * texto. Que fotografia vai em cada separador ou painel escolhe-o o servidor
 * pela resolução de cada ficheiro, que aqui não se sabe; mostra-se uma dos temas
 * certos, e é dito por baixo da vista de conjunto.
 *
 * Tudo em píxeis da folha do exemplo (1123 × 794), convertidos em `cqw` — a
 * miniatura é um contentor, e a letra cresce com ela.
 */

const W = 1123;
const H = 794;
const pct = (n: number, total: number) => `${(n / total) * 100}%`;
/** Píxeis do exemplo em unidades do contentor: a letra escala com a folha. */
const cq = (px: number) => `${(px / W) * 100}cqw`;
const caixa = (c: Caixa): CSSProperties => ({
  left: pct(c.x, W),
  top: pct(c.y, H),
  width: pct(c.w, W),
  height: pct(c.h, H),
});

/** Uma fotografia: o URL da miniatura e o original para quando ela falhar. */
export interface FotoDaFolha {
  url?: string;
  original?: string;
}

function Foto({
  foto,
  estilo,
  escura,
}: {
  foto?: FotoDaFolha;
  estilo: CSSProperties;
  escura?: "esquerda" | "toda";
}) {
  return (
    <span className="absolute overflow-hidden bg-[var(--bo-tinta-10)]" style={estilo}>
      {foto?.url && (
        <ImagemComPlanoB
          src={foto.url}
          planoB={foto.original}
          className="h-full w-full object-cover"
        />
      )}
      {escura && (
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              escura === "toda"
                ? "color-mix(in srgb, var(--bo-papel-pdf) 45%, transparent)"
                : "linear-gradient(90deg, color-mix(in srgb, var(--bo-papel-pdf) 84%, transparent) 0%, color-mix(in srgb, var(--bo-papel-pdf) 62%, transparent) 42%, transparent 75%)",
          }}
        />
      )}
    </span>
  );
}

/** Uma linha de texto da folha, em píxeis do exemplo. */
function Texto({
  x,
  y,
  w,
  tam,
  children,
  serif = false,
  acento = false,
  maiusculas = false,
  linhas = 1,
}: {
  x: number;
  y: number;
  w: number;
  tam: number;
  children: ReactNode;
  serif?: boolean;
  acento?: boolean;
  maiusculas?: boolean;
  linhas?: number;
}) {
  return (
    <p
      className={`absolute m-0 overflow-hidden ${serif ? "font-display-italico" : "font-medium"} ${
        maiusculas ? "uppercase" : ""
      }`}
      style={{
        left: pct(x, W),
        top: pct(y, H),
        width: pct(w, W),
        fontSize: cq(tam),
        lineHeight: 1.1,
        letterSpacing: maiusculas ? cq(tam * 0.2) : undefined,
        color: acento ? "var(--bo-papel-pdf-acento)" : "var(--bo-papel-pdf-texto)",
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: linhas,
      }}
    >
      {children}
    </p>
  );
}

/** As linhas de uma coluna de texto — a forma do texto, sem as palavras. */
function Linhas({
  x,
  y,
  w,
  n,
  alto = H - 120,
}: {
  x: number;
  y: number;
  w: number;
  n: number;
  alto?: number;
}) {
  const passo = Math.min(26, (alto - y) / Math.max(1, n));
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            left: pct(x, W),
            top: pct(y + i * passo, H),
            width: pct(w * (i % 4 === 3 ? 0.6 : 0.95), W),
            height: pct(5, H),
            background: "color-mix(in srgb, var(--bo-papel-pdf-baixo) 28%, transparent)",
          }}
        />
      ))}
    </>
  );
}

const MARGEM = 98;

export default function PaginaEditorial({
  pagina,
  doc,
  fotosDoTema,
  aspetos,
  capa,
  outras,
}: {
  pagina: EntradaDoPlano;
  doc: ProposalDoc;
  /** As fotografias de um tema, pelo índice de `images` — só nas páginas de tema. */
  fotosDoTema?: (bi: number, i: number) => FotoDaFolha | undefined;
  /** A forma medida de cada fotografia, por caminho. */
  aspetos?: Record<string, number>;
  /** A fotografia de fundo da capa e da contracapa. */
  capa?: FotoDaFolha;
  /** Fotografias para os painéis e separadores (uma dos temas, por ordem). */
  outras?: (n: number) => FotoDaFolha | undefined;
}) {
  const nomes = (doc.clientNames ?? "").trim();
  const org = doc.template === "organizacao";
  const outra = (n: number) => outras?.(n);
  // As palavras são as do PDF (`textosDaProposta`), não uma segunda cópia.
  const t = textosDaProposta("pt");
  let conteudo: ReactNode;

  switch (pagina.tipo) {
    case "capa":
    case "contracapa":
      conteudo = (
        <>
          <Foto foto={capa} estilo={{ inset: 0 }} escura="esquerda" />
          {pagina.tipo === "capa" ? (
            <>
              <Texto x={MARGEM} y={290} w={560} tam={13} acento maiusculas>
                {org ? t.capaOrganizacao : t.capaDecoracao}
              </Texto>
              <Texto x={MARGEM} y={320} w={560} tam={64} serif linhas={3}>
                {nomes || "Os nomes do casal"}
              </Texto>
            </>
          ) : (
            <>
              <Texto x={MARGEM} y={150} w={520} tam={13} acento maiusculas>
                {t.obrigada}
              </Texto>
              <Texto x={MARGEM} y={180} w={520} tam={44} serif linhas={3}>
                {t.agradecimento}
              </Texto>
            </>
          )}
        </>
      );
      break;

    case "indice":
    case "proposta":
      conteudo = (
        <>
          {pagina.tipo === "indice" ? (
            <>
              <Foto
                foto={outra(0)}
                estilo={{ left: 0, top: 0, width: pct(440, W), height: "100%" }}
              />
              <Texto x={496} y={110} w={520} tam={56} serif>
                Índice
              </Texto>
              <Linhas x={496} y={220} w={500} n={9} />
            </>
          ) : (
            <>
              <Foto foto={outra(1)} estilo={{ inset: 0 }} escura="esquerda" />
              <Texto x={MARGEM} y={180} w={500} tam={13} acento maiusculas>
                A proposta
              </Texto>
              <Texto x={MARGEM} y={210} w={520} tam={52} serif linhas={2}>
                {nomes ? `Para ${nomes}` : "A proposta"}
              </Texto>
              <Linhas x={MARGEM} y={380} w={460} n={5} alto={600} />
            </>
          )}
        </>
      );
      break;

    case "servicos": {
      const colunas = 3;
      const cw = (W - 2 * MARGEM - 2 * 24) / colunas;
      const ch = 240;
      conteudo = (
        <>
          <Texto x={MARGEM} y={50} w={600} tam={11.5} acento maiusculas>
            O que propomos
          </Texto>
          <Texto x={MARGEM} y={72} w={800} tam={40} serif>
            {pagina.continuacao ? "Serviços (cont.)" : "Serviços"}
          </Texto>
          {pagina.servicos.map((nome, i) => {
            const x = MARGEM + (i % colunas) * (cw + 24);
            const y = 150 + Math.floor(i / colunas) * (ch + 24);
            return (
              <span key={i}>
                <Foto foto={outra(i)} estilo={caixa({ x, y, w: cw, h: ch - 60 })} />
                <Texto x={x} y={y + ch - 50} w={cw} tam={17} serif>
                  {nome}
                </Texto>
              </span>
            );
          })}
        </>
      );
      break;
    }

    case "ambiente":
      conteudo = (
        <>
          <Texto x={MARGEM} y={60} w={600} tam={11.5} acento maiusculas>
            Paleta e ambiente
          </Texto>
          <Texto x={MARGEM} y={82} w={600} tam={40} serif>
            A paleta
          </Texto>
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="absolute rounded-full"
              style={{
                ...caixa({ x: MARGEM + i * 90, y: 170, w: 70, h: 70 }),
                background: `color-mix(in srgb, var(--bo-papel-pdf-baixo) ${85 - i * 15}%, var(--bo-papel-pdf))`,
              }}
            />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <Foto key={i} foto={outra(i)} estilo={caixa({ x: i * 188, y: 420, w: 184, h: 374 })} />
          ))}
        </>
      );
      break;

    case "separador":
      conteudo = (
        <>
          <Foto foto={outra(0)} estilo={caixa({ x: 0, y: 0, w: 559, h: H })} />
          <Foto foto={outra(1)} estilo={caixa({ x: 564, y: 0, w: 559, h: H })} />
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "color-mix(in srgb, var(--bo-papel-pdf) 35%, transparent)" }}
          />
          <Texto x={MARGEM} y={560} w={900} tam={13} acento maiusculas>
            {pagina.grupo
              ? `${String(pagina.numero).padStart(2, "0")} · Inspiração`
              : String(pagina.numero).padStart(2, "0")}
          </Texto>
          <Texto x={MARGEM} y={590} w={900} tam={72} serif>
            {pagina.titulo}
          </Texto>
        </>
      );
      break;

    case "tema": {
      const b = doc.moodBoards[pagina.bi];
      const forma = (i: number) => aspetos?.[b?.images?.[i] ?? ""] ?? ASPETO_POR_OMISSAO;
      const c = composicao(pagina.fotos.map(forma), pagina.vez % 2 === 0);
      const titulo = pagina.parte ? `${pagina.titulo} · Mais ideias…` : pagina.titulo;
      if (c.tipo === "texto") {
        conteudo = (
          <>
            <Foto
              foto={outra(0)}
              estilo={{ left: 0, top: 0, width: pct(440, W), height: "100%" }}
            />
            <Texto x={496} y={250} w={520} tam={56} serif linhas={2}>
              {titulo || "Sem título"}
            </Texto>
            <Linhas x={496} y={400} w={480} n={4} alto={560} />
          </>
        );
        break;
      }
      const mosaico = "mosaico" in c ? c.mosaico : null;
      conteudo = (
        <>
          {c.celulas.map((cel, k) => (
            <Foto key={k} foto={fotosDoTema?.(pagina.bi, pagina.fotos[k])} estilo={caixa(cel)} />
          ))}
          {mosaico ? (
            <Texto
              x={mosaico.x + 28}
              y={mosaico.y + mosaico.h - 120}
              w={LARGURA_DO_MOSAICO - 56}
              tam={34}
              serif
              linhas={2}
            >
              {titulo || "Sem título"}
            </Texto>
          ) : (
            <Texto
              x={MARGEM}
              y={c.tipo === "desalinhadas" ? 620 : 640}
              w={700}
              tam={c.tipo === "inteira" ? 56 : 40}
              serif
            >
              {titulo || "Sem título"}
            </Texto>
          )}
          {c.tipo === "inteira" && (
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0"
              style={{
                height: "40%",
                background:
                  "linear-gradient(0deg, color-mix(in srgb, var(--bo-papel-pdf) 70%, transparent), transparent)",
              }}
            />
          )}
        </>
      );
      break;
    }

    case "citacao":
      conteudo = (
        <>
          <Foto foto={outra(2)} estilo={{ inset: 0 }} escura="toda" />
          <Texto x={180} y={300} w={760} tam={52} serif linhas={3}>
            «{t.slogan ?? SITE.slogan}»
          </Texto>
        </>
      );
      break;

    case "orcamento":
      conteudo = (
        <>
          <Foto foto={outra(3)} estilo={{ right: 0, top: 0, width: pct(400, W), height: "100%" }} />
          <Texto x={MARGEM} y={110} w={560} tam={40} serif>
            {pagina.continuacao ? "Orçamento (cont.)" : "Orçamento"}
          </Texto>
          <Linhas x={MARGEM} y={210} w={560} n={pagina.linhas} alto={680} />
        </>
      );
      break;

    case "total":
      conteudo = (
        <>
          <Foto foto={outra(4)} estilo={{ inset: 0 }} escura="esquerda" />
          <Texto x={MARGEM} y={240} w={600} tam={13} acento maiusculas>
            Total a pagar
          </Texto>
          <Texto x={MARGEM} y={270} w={700} tam={96} serif>
            {doc.totalText?.trim() || "—"}
          </Texto>
        </>
      );
      break;

    case "cronograma":
    case "condicoes": {
      const titulo = pagina.tipo === "cronograma" ? "Cronograma" : pagina.nome;
      const colunas = pagina.tipo === "condicoes" && pagina.qual === "notas" ? 3 : 2;
      const larg = (837 - MARGEM - 28 * (colunas - 1)) / colunas;
      conteudo = (
        <>
          <Foto foto={outra(5)} estilo={{ right: 0, top: 0, width: pct(230, W), height: "100%" }} />
          <Texto x={MARGEM} y={70} w={700} tam={40} serif>
            {titulo}
          </Texto>
          {Array.from({ length: colunas }, (_, i) => (
            <Linhas key={i} x={MARGEM + i * (larg + 28)} y={170} w={larg} n={18} alto={700} />
          ))}
        </>
      );
      break;
    }
  }

  return (
    <div
      // A folha do cliente mantém a letra do cliente: o marcador devolve o
      // `--font-display` à serifa nesta árvore (ver `globals.css`).
      data-folha-do-cliente
      className="relative w-full overflow-hidden rounded-md border border-[var(--bo-hairline-strong)]"
      style={{
        aspectRatio: `${W} / ${H}`,
        containerType: "inline-size",
        background: "var(--bo-papel-pdf)",
      }}
    >
      {conteudo}
    </div>
  );
}

/**
 * De onde vêm as fotografias das miniaturas, para uma lista de páginas.
 *
 * Os temas usam as SUAS fotografias, pela ordem de desenho. A capa usa a que
 * ela escolheu (a primeira que houver em `coverImages`), ou, sem ela, a
 * primeira dos temas. Os separadores usam as do seu capítulo; os outros
 * painéis vão buscar uma dos temas, a rodar, para as páginas seguidas não
 * repetirem a mesma. É uma aproximação — ver o cabeçalho.
 */
export function fontesDasFolhas(
  doc: ProposalDoc,
  plano: readonly EntradaDoPlano[],
  urls: Record<string, string>,
  originais: Record<string, string> = {},
) {
  const daRef = (ref?: string): FotoDaFolha | undefined =>
    ref ? { url: urls[ref], original: originais[ref] } : undefined;
  const todas: string[] = [];
  const porCapitulo = new Map<number, string[]>();
  let capitulo = -1;
  plano.forEach((p, i) => {
    if (p.tipo === "separador" && p.grupo) {
      capitulo = i;
      porCapitulo.set(i, []);
    }
    if (p.tipo === "tema") {
      const refs = p.fotos
        .map((k) => doc.moodBoards[p.bi]?.images?.[k])
        .filter(Boolean) as string[];
      todas.push(...refs);
      if (capitulo >= 0) porCapitulo.get(capitulo)?.push(...refs);
    }
  });
  const capaRef = (doc.coverImages ?? []).find((c) => c && c.trim()) || todas[0];
  return {
    capa: daRef(capaRef),
    fotosDoTema: (bi: number, k: number) => daRef(doc.moodBoards[bi]?.images?.[k]),
    outrasDa: (i: number) => (n: number) => {
      const p = plano[i];
      const doCapitulo = p?.tipo === "separador" && p.grupo ? porCapitulo.get(i) : undefined;
      const lista = doCapitulo?.length ? doCapitulo : todas;
      if (!lista.length) return undefined;
      return daRef(lista[(doCapitulo ? n : i * 3 + n) % lista.length]);
    },
  };
}
