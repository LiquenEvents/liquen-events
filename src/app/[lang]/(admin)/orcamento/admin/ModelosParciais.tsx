"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModeloProposta, TipoModelo } from "@/lib/proposal-templates";

/**
 * MODELOS PARCIAIS — guardar e reutilizar UM grupo de serviços, ou UM mood
 * board, sem copiar a proposta inteira.
 *
 * ── Porque é que isto não é o mesmo que duplicar a proposta ───────────────
 * Duplicar serve quando a proposta nova é uma variação da anterior. Isto serve
 * para a outra metade do trabalho repetido: o bloco «Complementos dos Noivos»
 * é igual em todos os casamentos, e o mood board da cerimónia na igreja
 * também. Copiar a proposta toda para ir buscar um bloco obrigaria a apagar
 * tudo o resto — mais trabalho do que escrever de novo.
 *
 * ── É um menu e não um diálogo ───────────────────────────────────────────
 * Vive dentro da secção a que pertence, ao lado do «+ Adicionar». Um diálogo
 * a ecrã inteiro para escolher entre três blocos rouba o contexto de onde ela
 * está — e ela está a meio de uma lista, não a começar uma tarefa nova.
 */

interface Props {
  tipo: Extract<TipoModelo, "grupo" | "moodboard">;
  /** O que inserir quando ela escolhe um modelo. */
  onInserir?: (
    conteudo: NonNullable<ModeloProposta["grupo"] | ModeloProposta["moodboard"]>,
  ) => void;
  /** O bloco que está neste momento em edição, para o poder guardar. */
  paraGuardar?: NonNullable<ModeloProposta["grupo"] | ModeloProposta["moodboard"]>;
  /** Um nome de partida para a caixa do nome (o título do grupo/board). */
  nomeSugerido?: string;
  /**
   * Que controlos desenhar.
   *
   * ── PORQUE É QUE ISTO É UMA ESCOLHA E NÃO SÃO SEMPRE OS DOIS ────────────
   * Os dois botões têm âmbitos DIFERENTES. «De um modelo…» acrescenta um bloco
   * novo ao fim da secção — pertence à secção, e um por secção chega.
   * «Guardar como modelo» guarda UM bloco concreto, e por isso tem de viver ao
   * lado desse bloco.
   *
   * Enquanto foram um par indivisível ao fundo da secção, o `paraGuardar` era
   * escolhido por quem chamava — na prática, «o primeiro mood board com
   * título». Ela montava o terceiro mood board, carregava em «Guardar como
   * modelo», e guardava o primeiro. Sem aviso, e sem maneira nenhuma de
   * guardar o terceiro.
   */
  mostrar?: "ambos" | "inserir" | "guardar";
  toast?: (mensagem: string, tipo?: "success" | "error") => void;
  className?: string;
}

const ROTULO = {
  grupo: { um: "grupo", inserir: "De um modelo…", guardar: "Guardar como modelo" },
  moodboard: { um: "mood board", inserir: "De um modelo…", guardar: "Guardar como modelo" },
} as const;

/**
 * O PAINEL QUE CAÍA PARA FORA DO ECRÃ.
 *
 * Medido a 375 px, no estúdio, com «De um modelo…» aberto: o invólucro destes
 * botões começa em x = 204, e um painel de 288 px (`w-72`) ancorado à ESQUERDA
 * dele acabava em x = 492 — 117 px para lá da margem. E como o `body` tem
 * `overflow-x: clip`, esses 117 px não são arrastáveis: ficam CORTADOS. O que
 * lá estava escrito era a lista de modelos guardados e, quando não há nenhum, a
 * frase que explica como se guarda o primeiro — lida pela metade.
 *
 * Ancorado à DIREITA, o painel cresce para dentro do ecrã — que é o que os
 * outros menus do back office já faziam (`ui/MenuDeAccoes`, `MoreMenu`). Só
 * isso não chegava: a 320 px o invólucro acaba em x = 205, e 288 px de painel
 * a crescer para a esquerda saíam 83 px pelo OUTRO lado. Daí o tecto de 60vw
 * enquanto o ecrã é de telemóvel — 192 px a 320 e 225 px a 375, ou seja nunca
 * menos do que os 192 px (`min-w-48`) que o menu de acções da casa já usa. A
 * partir de `sm` o tecto sai e o painel volta aos 288 px de sempre.
 *
 * Não é posicionamento a sério (isso pedia JavaScript a medir o gatilho); é a
 * garantia, em CSS, de que o que está escrito lá dentro se lê inteiro.
 */
const PAINEL_SUSPENSO =
  "absolute top-full right-0 z-30 mt-1 w-72 max-w-[60vw] sm:max-w-none " +
  "rounded-xl border border-foreground/10 bg-white shadow-[var(--bo-sombra-suspensa)]";

export default function ModelosParciais({
  tipo,
  onInserir,
  paraGuardar,
  nomeSugerido,
  mostrar = "ambos",
  toast,
  className,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [modelos, setModelos] = useState<ModeloProposta[]>([]);
  const [aGuardar, setAGuardar] = useState(false);
  const [nome, setNome] = useState("");
  /** A leitura falhou — o menu tem de dizer isso e não «não tens nenhum». */
  const [naoDeuParaLer, setNaoDeuParaLer] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/propostas/modelos");
      const j = await r.json().catch(() => null);
      // Sem olhar ao `r.ok`, o corpo de um 401 (sessão caída) ou de um 500 é
      // `{error: …}`, não traz `modelos`, e entrava aqui como lista vazia — o
      // menu passava a dizer-lhe que nunca tinha guardado nada. Os modelos
      // estavam lá; o que ela lia era o convite a montar tudo outra vez.
      if (!r.ok || !Array.isArray(j?.modelos)) {
        throw new Error(typeof j?.error === "string" ? j.error : "Não deu para ler os modelos.");
      }
      setNaoDeuParaLer(false);
      setModelos((j.modelos as ModeloProposta[]).filter((m) => m.tipo === tipo));
    } catch (e) {
      setNaoDeuParaLer(true);
      toast?.(e instanceof Error ? e.message : "Não deu para ler os modelos.", "error");
    }
  }, [tipo, toast]);

  // Fechar ao clicar fora e no Esc — as duas saídas que as pessoas tentam.
  useEffect(() => {
    if (!aberto && !aGuardar) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false);
        setAGuardar(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        setAGuardar(false);
      }
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto, aGuardar]);

  async function guardar() {
    const limpo = nome.trim();
    if (!limpo) return;
    try {
      const r = await fetch("/api/propostas/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: limpo,
          tipo,
          ...(tipo === "grupo" ? { grupo: paraGuardar } : { moodboard: paraGuardar }),
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "Não deu para guardar.");
      setModelos((j.modelos as ModeloProposta[]).filter((m) => m.tipo === tipo));
      setAGuardar(false);
      setNome("");
      toast?.(`Modelo «${limpo}» guardado.`, "success");
    } catch (e) {
      toast?.(e instanceof Error ? e.message : "Não deu para guardar.", "error");
    }
  }

  // `alvo-toque` leva estes dois a 44 px no telemóvel sem lhes mudar o aspecto:
  // eram links de 16 px de altura, e num ecrã táctil isso é acertar numa linha
  // de texto. No computador continuam a ser o que eram.
  const botao =
    "alvo-toque py-2 text-xs text-foreground/50 underline-offset-2 hover:text-foreground/80 hover:underline";

  const podeInserir = mostrar !== "guardar" && !!onInserir;
  const podeGuardar = mostrar !== "inserir" && !!paraGuardar;

  return (
    <div ref={caixa} className={`relative inline-flex items-center gap-3 ${className ?? ""}`}>
      {podeInserir && (
        <button
          type="button"
          className={botao}
          aria-expanded={aberto}
          onClick={() => {
            const vai = !aberto;
            setAberto(vai);
            setAGuardar(false);
            if (vai) void carregar();
          }}
        >
          {ROTULO[tipo].inserir}
        </button>
      )}

      {podeGuardar && (
        <button
          type="button"
          className={botao}
          onClick={() => {
            setAGuardar((v) => !v);
            setAberto(false);
            setNome(nomeSugerido ?? "");
          }}
        >
          {ROTULO[tipo].guardar}
        </button>
      )}

      {aberto && (
        <div className={PAINEL_SUSPENSO + " p-1"}>
          {naoDeuParaLer ? (
            <p className="px-3 py-2 text-xs text-[#a03123]">
              Não deu para ler os modelos guardados. Volta a tentar — os que tinhas continuam lá.
            </p>
          ) : modelos.length === 0 ? (
            <p className="px-3 py-2 text-xs text-foreground/50">
              Ainda não guardaste nenhum {ROTULO[tipo].um}. Monta um e carrega em «Guardar como
              modelo».
            </p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {modelos.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-foreground/[0.05]"
                    onClick={() => {
                      const conteudo = tipo === "grupo" ? m.grupo : m.moodboard;
                      // Um modelo sem conteúdo não pode passar por inserção
                      // bem sucedida: ela carregava e não acontecia nada.
                      if (!conteudo) {
                        toast?.("Esse modelo está vazio.", "error");
                        return;
                      }
                      // Cópia funda: inserir o mesmo objecto duas vezes fazia
                      // as duas cópias partilharem os itens, e editar uma
                      // mudava a outra.
                      onInserir?.(JSON.parse(JSON.stringify(conteudo)));
                      setAberto(false);
                    }}
                  >
                    {m.nome}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aGuardar && (
        <div className={PAINEL_SUSPENSO + " p-3"}>
          <label className="block text-[11px] text-foreground/55" htmlFor={`mp-${tipo}`}>
            Nome do modelo
          </label>
          <input
            id={`mp-${tipo}`}
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void guardar()}
            placeholder={tipo === "grupo" ? "Complementos dos noivos" : "Cerimónia na igreja"}
            className="bo-input mt-1 w-full px-2.5 py-1.5 text-xs"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className={botao} onClick={() => setAGuardar(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-full bg-[#4d6350] px-3 py-1.5 text-xs text-white disabled:opacity-40"
              disabled={!nome.trim()}
              onClick={() => void guardar()}
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
