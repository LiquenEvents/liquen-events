"use client";

import { useState } from "react";
import {
  MINIMO_DE_OPCOES,
  escolhaPronta,
  novoIdDeEscolha,
  type Escolha,
  type OpcaoDeEscolha,
} from "@/lib/proposta-escolhas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESCREVER AS ALTERNATIVAS — O LADO DELA DA FASE 3
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Onde eu tiver dado alternativas ao casal (duas paletas para a cerimónia,
 * dois estilos de corredor), eles escolhem ali.»
 *
 * ── PORQUE É QUE ISTO VIVE DENTRO DOS MOOD BOARDS ─────────────────────────
 *
 * Porque é onde o trabalho está. As alternativas que ela dá são visuais — duas
 * paletas, dois estilos de corredor — e as fotografias que as explicam já
 * estão nas páginas de inspiração desta proposta. Uma secção própria na
 * navegação obrigava a um visto verde ou a um «por preencher» permanente numa
 * coisa que é OPCIONAL: a maior parte das propostas não leva alternativas
 * nenhumas, e um alarme aceso em todas para servir algumas é um alarme que se
 * aprende a ignorar.
 *
 * ── A FOTOGRAFIA VEM DAS QUE JÁ ESTÃO AQUI ────────────────────────────────
 *
 * Não há aqui carregamento de ficheiros. A opção escolhe-se entre as
 * fotografias que JÁ estão nos mood boards desta proposta — que é como o
 * trabalho acontece («esta paleta é aquela foto do board da cerimónia»), e
 * poupa uma segunda escada de carregamento, de marcadores provisórios e de
 * falhas silenciosas para manter.
 *
 * ── O QUE SAI PARA O CASAL, E O QUE FICA POR ACABAR ───────────────────────
 *
 * Uma escolha com uma opção só não sai (ver `escolhaPronta`) — e o ecrã DI-LO,
 * em vez de a deixar num limbo em que ela jura ter escrito a alternativa e o
 * casal jura não a ter visto.
 */

/** Uma fotografia já usada nesta proposta, para se poder escolher. */
export interface FotoDisponivel {
  /** O caminho, tal como está gravado no documento. */
  caminho: string;
  /** O endereço assinado para a miniatura, quando já foi resolvido. */
  url?: string;
  /** De que board veio — é assim que ela lhe chama. */
  onde: string;
}

const CAIXA =
  "w-full rounded-md border border-[var(--bo-hairline)] bg-white px-2.5 py-1.5 text-sm text-foreground/85 placeholder:text-foreground/30 focus:border-[#4d6350] focus:outline-none";
const BOTAO_MAGRO =
  "alvo-toque rounded-md border border-[var(--bo-hairline)] px-2.5 py-1.5 text-[11px] text-foreground/60 transition-colors hover:bg-foreground/[0.04]";

export default function EditorDeEscolhas({
  escolhas,
  fotos,
  bilingue,
  onChange,
}: {
  escolhas: Escolha[] | undefined;
  /** As fotografias já nos mood boards desta proposta. */
  fotos: FotoDisponivel[];
  /** O interruptor «Proposta bilingue» do estúdio: mostra as caixas inglesas. */
  bilingue: boolean;
  onChange: (escolhas: Escolha[]) => void;
}) {
  const lista = escolhas ?? [];
  /** Que opção está com o selector de fotografia aberto (`e.id:o.id`). */
  const [aEscolherFoto, setAEscolherFoto] = useState<string | null>(null);

  const mudarEscolha = (i: number, p: Partial<Escolha>) =>
    onChange(lista.map((e, k) => (k === i ? { ...e, ...p } : e)));

  const mudarOpcao = (i: number, j: number, p: Partial<OpcaoDeEscolha>) =>
    mudarEscolha(i, { opcoes: lista[i].opcoes.map((o, k) => (k === j ? { ...o, ...p } : o)) });

  const acrescentarEscolha = () =>
    onChange([
      ...lista,
      {
        id: novoIdDeEscolha(),
        titulo: "",
        // Nasce com DUAS opções vazias, e não com uma: duas é o mínimo para
        // isto ser uma escolha, e deixá-la descobrir isso a meio era pô-la a
        // carregar num botão que não sabia que tinha de carregar.
        opcoes: [
          { id: novoIdDeEscolha(), rotulo: "" },
          { id: novoIdDeEscolha(), rotulo: "" },
        ],
      },
    ]);

  return (
    /*
     * ── ISTO NÃO É UM RODAPÉ ────────────────────────────────────────────
     *
     * Palavras dela: «"À escolha do casal" é a funcionalidade mais interessante
     * do ecrã e está no fim, em cinzento, quase invisível».
     *
     * Estava desenhado como uma nota de pé de secção: um título de onze píxeis
     * em maiúsculas cinzentas, do tamanho e da cor de um rótulo de campo, atrás
     * de uma linha fina. Um leitor que percorra a secção com o polegar passa-lhe
     * ao lado — e o que ali está é a única coisa desta proposta que faz o casal
     * responder.
     *
     * Ganha um cartão seu, com a cor da casa e o nome escrito na serifada do
     * documento. Continua a dizer «opcional», porque é, e continua a viver
     * dentro dos mood boards, pela razão escrita no cabeçalho: é lá que estão
     * as fotografias que explicam as alternativas.
     */
    <div className="mt-8 rounded-xl border border-[var(--color-moss)]/25 bg-[color-mix(in_srgb,var(--color-moss)_5%,transparent)] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h4
          className="text-foreground/85 text-[17px]"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          À escolha do casal <span className="text-foreground/40 text-[12px]">(opcional)</span>
        </h4>
        <button type="button" className={BOTAO_MAGRO} onClick={acrescentarEscolha}>
          + Alternativa
        </button>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-foreground/60">
        Duas paletas para a cerimónia, dois estilos de corredor:{" "}
        <strong className="font-medium text-foreground/75">
          deixa o casal decidir sem ser preciso outra reunião
        </strong>
        . Aparecem na página deles — não no PDF — e a resposta volta para a ficha do evento.
      </p>

      {lista.length === 0 ? null : (
        <ul className="mt-5 flex flex-col gap-5">
          {lista.map((escolha, i) => {
            const pronta = escolhaPronta(escolha);
            return (
              <li
                key={escolha.id}
                className="rounded-lg border border-[var(--bo-hairline)] p-3.5 sm:p-4"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 flex flex-col gap-2">
                    <input
                      className={CAIXA}
                      value={escolha.titulo}
                      placeholder="Paleta da cerimónia"
                      aria-label={`Título da alternativa ${i + 1}`}
                      data-campo={`escolhas:${i}:titulo`}
                      onChange={(ev) => mudarEscolha(i, { titulo: ev.target.value })}
                    />
                    {bilingue && (
                      <input
                        className={`${CAIXA} bg-[#4d6350]/[0.04]`}
                        value={escolha.tituloEn ?? ""}
                        placeholder="Ceremony palette"
                        aria-label={`Título da alternativa ${i + 1} (inglês)`}
                        data-campo={`escolhas:${i}:titulo:en`}
                        onChange={(ev) => mudarEscolha(i, { tituloEn: ev.target.value })}
                      />
                    )}
                    <input
                      className={CAIXA}
                      value={escolha.nota ?? ""}
                      placeholder="Uma linha por baixo do título (opcional)"
                      aria-label={`Nota da alternativa ${i + 1}`}
                      data-campo={`escolhas:${i}:nota`}
                      onChange={(ev) => mudarEscolha(i, { nota: ev.target.value })}
                    />
                    {bilingue && (
                      <input
                        className={`${CAIXA} bg-[#4d6350]/[0.04]`}
                        value={escolha.notaEn ?? ""}
                        placeholder="Note in English (optional)"
                        aria-label={`Nota da alternativa ${i + 1} (inglês)`}
                        data-campo={`escolhas:${i}:nota:en`}
                        onChange={(ev) => mudarEscolha(i, { notaEn: ev.target.value })}
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Apagar a alternativa ${i + 1}`}
                    title="Apagar esta alternativa"
                    // À VISTA no telemóvel — é a regra desta casa desde o «×»
                    // das fotos: um botão que apaga não pode ser invisível e
                    // continuar a apanhar o dedo.
                    className="alvo-toque shrink-0 rounded-md px-2 py-1.5 text-[13px] text-foreground/55 transition-colors hover:bg-[#c0392b]/10 hover:text-[#a03123] pointer-coarse:h-8 pointer-coarse:w-8"
                    onClick={() => onChange(lista.filter((_, k) => k !== i))}
                  >
                    ×
                  </button>
                </div>

                <ul className="mt-3 flex flex-col gap-2.5">
                  {escolha.opcoes.map((opcao, j) => {
                    const chave = `${escolha.id}:${opcao.id}`;
                    const foto = fotos.find((f) => f.caminho === opcao.imagem);
                    return (
                      <li key={opcao.id} className="flex items-start gap-2">
                        {/* A miniatura, quando há. É o que faz a lista de
                            opções ser legível de relance no meio de quatro. */}
                        {opcao.imagem && (
                          <span className="mt-0.5 block h-10 w-10 shrink-0 overflow-hidden rounded-md bg-foreground/[0.06]">
                            {foto?.url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={foto.url}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            )}
                          </span>
                        )}
                        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                          <input
                            className={CAIXA}
                            value={opcao.rotulo}
                            placeholder={j === 0 ? "Verde-oliva e branco" : "Terracota e creme"}
                            aria-label={`Opção ${j + 1} de ${escolha.titulo || `alternativa ${i + 1}`}`}
                            data-campo={`escolhas:${i}:opcoes:${j}:rotulo`}
                            onChange={(ev) => mudarOpcao(i, j, { rotulo: ev.target.value })}
                          />
                          {bilingue && (
                            <input
                              className={`${CAIXA} bg-[#4d6350]/[0.04]`}
                              value={opcao.rotuloEn ?? ""}
                              placeholder="Olive and white"
                              aria-label={`Opção ${j + 1} (inglês)`}
                              data-campo={`escolhas:${i}:opcoes:${j}:rotulo:en`}
                              onChange={(ev) => mudarOpcao(i, j, { rotuloEn: ev.target.value })}
                            />
                          )}
                          <input
                            className={CAIXA}
                            value={opcao.descricao ?? ""}
                            placeholder="Uma linha a explicar (opcional)"
                            aria-label={`Descrição da opção ${j + 1}`}
                            data-campo={`escolhas:${i}:opcoes:${j}:descricao`}
                            onChange={(ev) => mudarOpcao(i, j, { descricao: ev.target.value })}
                          />
                          {bilingue && (
                            <input
                              className={`${CAIXA} bg-[#4d6350]/[0.04]`}
                              value={opcao.descricaoEn ?? ""}
                              placeholder="One line in English (optional)"
                              aria-label={`Descrição da opção ${j + 1} (inglês)`}
                              data-campo={`escolhas:${i}:opcoes:${j}:descricao:en`}
                              onChange={(ev) => mudarOpcao(i, j, { descricaoEn: ev.target.value })}
                            />
                          )}

                          {/* A fotografia: escolhe-se entre as que já estão
                              nesta proposta. Ver o cabeçalho. */}
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className={BOTAO_MAGRO}
                              onClick={() =>
                                setAEscolherFoto(aEscolherFoto === chave ? null : chave)
                              }
                            >
                              {opcao.imagem ? "Trocar a fotografia" : "Pôr uma fotografia"}
                            </button>
                            {opcao.imagem && (
                              <button
                                type="button"
                                className={BOTAO_MAGRO}
                                onClick={() => mudarOpcao(i, j, { imagem: undefined })}
                              >
                                Tirar
                              </button>
                            )}
                            {escolha.opcoes.length > MINIMO_DE_OPCOES && (
                              <button
                                type="button"
                                className={BOTAO_MAGRO}
                                onClick={() =>
                                  mudarEscolha(i, {
                                    opcoes: escolha.opcoes.filter((_, k) => k !== j),
                                  })
                                }
                              >
                                Apagar a opção
                              </button>
                            )}
                          </div>

                          {aEscolherFoto === chave && (
                            <div className="rounded-md border border-[var(--bo-hairline)] p-2">
                              {fotos.length === 0 ? (
                                <p className="text-[12px] text-foreground/45">
                                  Ainda não há fotografias nos mood boards desta proposta.
                                </p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {fotos.map((f, n) => (
                                    <button
                                      key={f.caminho}
                                      type="button"
                                      title={f.onde}
                                      // Numerada: num board com seis fotografias
                                      // «a fotografia de Cerimónia» são seis
                                      // botões com o mesmo nome, e quem ouve o
                                      // ecrã não tem como os distinguir.
                                      aria-label={`Usar a fotografia ${n + 1} de ${f.onde}`}
                                      onClick={() => {
                                        mudarOpcao(i, j, { imagem: f.caminho });
                                        setAEscolherFoto(null);
                                      }}
                                      className={`h-14 w-14 overflow-hidden rounded-md border transition-colors ${
                                        opcao.imagem === f.caminho
                                          ? "border-[#4d6350]"
                                          : "border-[var(--bo-hairline)] hover:border-[#4d6350]/60"
                                      }`}
                                    >
                                      {f.url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={f.url}
                                          alt=""
                                          className="h-full w-full object-cover"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <span className="block h-full w-full bg-foreground/[0.06]" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className={BOTAO_MAGRO}
                    onClick={() =>
                      mudarEscolha(i, {
                        opcoes: [...escolha.opcoes, { id: novoIdDeEscolha(), rotulo: "" }],
                      })
                    }
                  >
                    + Opção
                  </button>
                  {/* O aviso é sobre o que o CASAL vai ver, e não sobre o que
                      está escrito aqui: é a única pergunta que interessa. */}
                  {!pronta && (
                    <span className="text-[11px] text-[#8a4632]">
                      Ainda não aparece ao casal — falta o título ou a segunda opção.
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
