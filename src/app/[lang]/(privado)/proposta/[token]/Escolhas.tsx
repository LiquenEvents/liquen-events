"use client";

import { useState } from "react";
import { useFotoComPlanoB } from "@/lib/useFotoComPlanoB";
import type { FotoDaProposta } from "@/lib/proposta-fotos";
import type { Escolha, OpcaoDeEscolha } from "@/lib/proposta-escolhas";
import type { TextosDaPagina } from "./textos-da-pagina";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS ALTERNATIVAS — O ÚNICO SÍTIO DESTA PÁGINA ONDE O CASAL ESCREVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Onde eu tiver dado alternativas ao casal (duas paletas para a cerimónia,
 * dois estilos de corredor), eles escolhem ali.»
 *
 * ── O QUE SE GRAVA, E QUANDO ──────────────────────────────────────────────
 *
 * Só o clique. Não há aqui nada que fale com o servidor ao abrir a página, ao
 * rolar, ao sair, nem passado um tempo: o único pedido que este componente faz
 * nasce de um dedo em cima de uma opção. É a regra dela, à letra — e é por
 * isso que não há `useEffect` nenhum neste ficheiro. O teste
 * `zero-rastreio.test.ts` lê este ficheiro e recusa-o se voltar a haver.
 *
 * ── PORQUE É QUE ISTO NÃO É UM `<form>` COM UM BOTÃO DE CONFIRMAR ─────────
 *
 * Porque não é um compromisso. Um casamento não se fecha num botão — e esta
 * escolha, ao contrário do aceite, também não fecha nada: é «gostamos mais
 * desta», e a conversa continua na mesma. Um passo de confirmação a mais
 * transformava uma preferência num contrato.
 *
 * E é por isso que a frase que aparece a seguir NÃO é «guardado»: é «ficámos a
 * saber, podem mudar de ideias quando quiserem». O que interessa ao casal não
 * é o nosso registo — é saber que a mensagem chegou a alguém e que não ficaram
 * presos à primeira ideia.
 *
 * ── UM ESTADO POR PERGUNTA, E NÃO UM PARA A PÁGINA ────────────────────────
 *
 * Duas escolhas na mesma página são duas conversas independentes. Com um
 * estado só, um erro de rede na segunda apagava a confirmação da primeira do
 * ecrã — e o casal ficava sem saber qual das duas tinha seguido.
 */

interface Props {
  escolhas: Escolha[];
  /** O que já estava escolhido quando a página foi desenhada, no servidor. */
  escolhido: Record<string, string>;
  /** A fotografia de cada opção, pelo id opaco `e{i}o{j}` — ver `proposta-fotos`. */
  fotos: Record<string, FotoDaProposta>;
  token: string;
  textos: TextosDaPagina;
  /** Já traduzido pelo servidor: rótulo, descrição, título e nota na língua. */
  emLingua: {
    titulo: Record<string, string>;
    nota: Record<string, string>;
    rotulo: Record<string, string>;
    descricao: Record<string, string>;
  };
}

type Estado = "quieto" | "a-enviar" | "seguiu" | "falhou";

/** A fotografia de uma opção. Sem fotografia não desenha caixa nenhuma: uma
 *  moldura cinzenta ao lado de um rótulo lê-se como uma foto que não carregou. */
function FotoDaOpcao({ foto, alt }: { foto?: FotoDaProposta; alt: string }) {
  const { alvo, aoFalhar, desistiu } = useFotoComPlanoB(foto?.miniatura, foto?.original);
  if (!foto || !alvo || desistiu) return null;
  return (
    <span
      className="block overflow-hidden rounded-md bg-foreground/[0.04]"
      style={{
        aspectRatio: foto.largura && foto.altura ? `${foto.largura}/${foto.altura}` : "4/3",
      }}
    >
      {/* `<img>` e não `next/image`: estes URLs são assinados e de vida curta,
          e o optimizador do Next guardaria em cache uma assinatura que expira.
          É a mesma decisão da galeria — ver `Inspiracao.tsx`. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={alvo}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={aoFalhar}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

export default function Escolhas({ escolhas, escolhido, fotos, token, textos, emLingua }: Props) {
  const [respostas, setRespostas] = useState<Record<string, string>>(escolhido);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  /**
   * A opção que se TENTOU, por pergunta — que não é a mesma coisa que a opção
   * escolhida.
   *
   * Quando o envio falha, a marca volta atrás (senão a página mentia). Sem
   * guardar aqui o que se tentou, o «Tentar outra vez» ficava sem saber o que
   * repetir — carregava-se nele e não acontecia nada, que é a pior forma de um
   * botão falhar.
   */
  const [tentado, setTentado] = useState<Record<string, string>>({});

  const escolher = async (escolha: Escolha, opcao: OpcaoDeEscolha) => {
    const anterior = respostas[escolha.id];
    setTentado((t) => ({ ...t, [escolha.id]: opcao.id }));
    // O ecrã responde já: a escolha é uma preferência, e esperar meio segundo
    // por um servidor para o botão reagir faz o casal carregar outra vez.
    setRespostas((r) => ({ ...r, [escolha.id]: opcao.id }));
    setEstados((e) => ({ ...e, [escolha.id]: "a-enviar" }));
    try {
      const res = await fetch(`/api/proposta/${encodeURIComponent(token)}/escolha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escolhaId: escolha.id, opcaoId: opcao.id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEstados((e) => ({ ...e, [escolha.id]: "seguiu" }));
    } catch {
      // E VOLTA ATRÁS. Deixar a marca em cima da opção nova depois de o envio
      // falhar era a página a dizer «escolhido» sobre coisa nenhuma — o casal
      // fechava o separador convencido, e do lado de cá não havia nada.
      setRespostas((r) => {
        const volta = { ...r };
        if (anterior) volta[escolha.id] = anterior;
        else delete volta[escolha.id];
        return volta;
      });
      setEstados((e) => ({ ...e, [escolha.id]: "falhou" }));
    }
  };

  return (
    <div className="mt-8 flex flex-col gap-12">
      {escolhas.map((escolha, i) => {
        const estado = estados[escolha.id] ?? "quieto";
        const nota = emLingua.nota[escolha.id];
        return (
          <div key={escolha.id}>
            <h3 className="text-foreground/85 text-[17px] font-medium">
              {emLingua.titulo[escolha.id]}
            </h3>
            {nota && <p className="mt-1 text-foreground/60 text-sm leading-relaxed">{nota}</p>}

            {/* Uma coluna no telemóvel — a mesma razão da galeria: duas
                alternativas lado a lado num ecrã de 390 px dão 180 px cada, e
                aí a fotografia da paleta deixa de se ver, que é o único
                motivo de ela lá estar. */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {escolha.opcoes.map((opcao, j) => {
                const escolhida = respostas[escolha.id] === opcao.id;
                const rotulo = emLingua.rotulo[opcao.id];
                const descricao = emLingua.descricao[opcao.id];
                return (
                  <button
                    key={opcao.id}
                    type="button"
                    onClick={() => void escolher(escolha, opcao)}
                    disabled={estado === "a-enviar"}
                    // `aria-pressed` e não um `radio`: são botões que se podem
                    // voltar a carregar, e quem ouve o ecrã precisa de saber
                    // qual está marcado sem ter de procurar a marca visual.
                    aria-pressed={escolhida}
                    className={`alvo-toque flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors disabled:cursor-progress ${
                      escolhida
                        ? "border-moss bg-moss/8"
                        : "border-foreground/12 hover:border-moss/50 hover:bg-moss/4"
                    }`}
                  >
                    <FotoDaOpcao foto={fotos[`e${i}o${j}`]} alt={rotulo} />
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-foreground/85 text-sm font-medium">{rotulo}</span>
                      {escolhida && (
                        <span className="shrink-0 text-moss text-[10px] uppercase tracking-[0.18em]">
                          {textos.escolhida}
                        </span>
                      )}
                    </span>
                    {descricao && (
                      <span className="text-foreground/60 text-[13px] leading-relaxed">
                        {descricao}
                      </span>
                    )}
                    {/* O nome que o leitor de ecrã anuncia é o gesto inteiro,
                        e não só o rótulo da paleta. */}
                    <span className="sr-only">
                      {textos.escolherEsta} {rotulo}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* O desfecho DESTA pergunta, por baixo dela. `aria-live` porque a
                frase aparece sem que nada mude de sítio. */}
            <p className="mt-3 min-h-5 text-[13px]" aria-live="polite">
              {estado === "seguiu" && <span className="text-moss">{textos.escolhaGuardada}</span>}
              {estado === "falhou" && (
                <span className="text-[#a03123]">
                  {textos.escolhaFalhou}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      const opcao = escolha.opcoes.find(
                        (o) => o.id === (tentado[escolha.id] ?? ""),
                      );
                      setEstados((e) => ({ ...e, [escolha.id]: "quieto" }));
                      if (opcao) void escolher(escolha, opcao);
                    }}
                    className="alvo-toque underline"
                  >
                    {textos.escolhaRepetir}
                  </button>
                </span>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
