"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EIXOS, type Eixo, type EixoDaRegra, type Etiqueta } from "@/lib/biblioteca-types";
import { MAX_THEME_NAME } from "@/lib/theme-types";
import { Button, Card, EmCurso } from "./ui";
import { useToast } from "./Toast";
import ImagemComPlanoB from "./ImagemComPlanoB";

/**
 * REVER ETIQUETAS — o ecrã onde se arruma a biblioteca em lote.
 *
 * Existe por causa de uma limitação assumida da migração: ela deriva as
 * etiquetas da PASTA onde cada foto estava, e uma pasta chamada "Terracotta"
 * sabe dizer a paleta mas nunca soube dizer se aquela foto é um bouquet ou um
 * centro de mesa. São 55 fotos sem tipo à saída da migração — não é um defeito,
 * é o que a informação de origem dava.
 *
 * Por isso este ecrã é o par obrigatório da migração, e não um extra. O que ele
 * tem de fazer bem é UMA coisa: pôr uma etiqueta a trinta fotos em três
 * cliques. Tudo o resto — os filtros, os contadores — existe para chegar
 * depressa às trinta certas.
 */

interface FotoDaBiblioteca {
  path: string;
  url: string;
  thumbUrl?: string;
  etiquetas: string[];
  porConfirmar: boolean;
}

const PAGINA = 60;

/**
 * Quanto costuma demorar etiquetar em bloco, para a espera OPACA do `EmCurso`.
 *
 * É UM pedido só — não há nada para contar enquanto ele não volta (o servidor
 * é que devolve quantas `mudadas`) —, mas o tempo cresce com o tamanho do
 * lote: são duas idas à base de dados por foto, em série. Daí um palpite com
 * duas partes: a ida e volta, mais o trabalho por foto. É um palpite, e a
 * curva do `espera-em-curso.ts` é feita para nunca chegar ao fim sozinha — o
 * que a fecha é a resposta.
 */
const ESPERA_BASE_MS = 900;
const ESPERA_POR_FOTO_MS = 40;

/** Os eixos como se lêem. */
const NOME_DO_EIXO: Record<Eixo, string> = {
  tipo: "Tipo de peça",
  paleta: "Paleta",
  estilo: "Estilo",
};

export default function BibliotecaRevisao({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [vocabulario, setVocabulario] = useState<Etiqueta[]>([]);
  const [fotos, setFotos] = useState<FotoDaBiblioteca[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);

  const [exigidas, setExigidas] = useState<string[]>([]);
  const [semEixo, setSemEixo] = useState<Eixo[]>([]);
  const [porConfirmar, setPorConfirmar] = useState(false);

  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  /** A última foto tocada — é a âncora do Shift+clique. */
  const ancora = useRef<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  /** Quantas fotos leva o lote que está a ser etiquetado agora. `null` = nada
   *  a decorrer. É o que dá tamanho à espera e o que se lê no cartão. */
  const [aEtiquetar, setAEtiquetar] = useState<{ quantas: number; accao: "por" | "tirar" } | null>(
    null,
  );
  const [nomeDoTema, setNomeDoTema] = useState("");
  const [aCriarTema, setACriarTema] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/biblioteca/etiquetas", { cache: "no-store" });
        if (res.ok) {
          setVocabulario(await res.json());
          setBlocked(null);
        } else {
          const data = await res.json().catch(() => null);
          if (res.status === 503 && data?.error) setBlocked(data.error);
        }
      } catch {
        /* a grelha reporta a falha por si */
      }
    })();
  }, []);

  const procura = useMemo(() => {
    const p = new URLSearchParams();
    if (exigidas.length) p.set("etiquetas", exigidas.join(","));
    if (semEixo.length) p.set("sem", semEixo.join(","));
    if (porConfirmar) p.set("porConfirmar", "1");
    p.set("limit", String(PAGINA));
    return p.toString();
  }, [exigidas, semEixo, porConfirmar]);

  /**
   * A consulta em curso. Só a ÚLTIMA manda no que aparece.
   *
   * A primeira procura é a biblioteca inteira e é a demorada; a de um filtro é
   * curta. Sem isto, a lenta aterrava por cima da que ela pediu a seguir e a
   * grelha ficava a mostrar a biblioteca toda com o chip «sem tipo» aceso — e
   * daí a etiquetar em bloco fotos que já tinham tipo é um clique.
   */
  const consulta = useRef(0);

  const recarregar = useCallback(async () => {
    const minha = ++consulta.current;
    setCarregando(true);
    try {
      const res = await fetch(`/api/biblioteca/fotos?${procura}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      // Chegou tarde: já há uma procura mais nova a caminho (ou entregue).
      if (minha !== consulta.current) return;
      if (res.ok && data?.ok) {
        setFotos(data.fotos ?? []);
        setTotal(data.total ?? 0);
        setBlocked(null);
      } else if (res.status === 503 && data?.error) {
        setBlocked(data.error);
        setFotos([]);
        setTotal(0);
      } else {
        toast(data?.error || "Não foi possível procurar na biblioteca.", "error");
      }
    } catch {
      if (minha === consulta.current)
        toast("Não foi possível procurar. Verifica a ligação.", "error");
    } finally {
      // O indicador só se apaga com a resposta que interessa: apagá-lo com uma
      // resposta velha dizia "pronto" com a grelha ainda a mudar.
      if (minha === consulta.current) setCarregando(false);
    }
  }, [procura, toast]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  /**
   * Clicar numa foto.
   *
   * Shift+clique escolhe TUDO entre a âncora e esta — que é como se apanha uma
   * fiada inteira sem trinta cliques, e é a razão de haver uma âncora em vez de
   * um simples "última clicada".
   */
  const tocar = useCallback(
    (path: string, comShift: boolean) => {
      // A âncora é lida AQUI, e não lá dentro. A função passada ao `setState`
      // só corre quando o React a chama — depois da linha que muda a âncora lá
      // em baixo —, e nessa altura ela já é esta mesma foto: o intervalo ficava
      // com um elemento só e o Shift+clique comportava-se como um clique.
      const inicio = ancora.current;
      setSeleccionadas((prev) => {
        const nova = new Set(prev);
        if (comShift && inicio) {
          const i = fotos.findIndex((f) => f.path === inicio);
          const j = fotos.findIndex((f) => f.path === path);
          if (i >= 0 && j >= 0) {
            for (const f of fotos.slice(Math.min(i, j), Math.max(i, j) + 1)) nova.add(f.path);
            return nova;
          }
        }
        if (nova.has(path)) nova.delete(path);
        else nova.add(path);
        return nova;
      });
      ancora.current = path;
    },
    [fotos],
  );

  async function aplicar(etiquetaId: string, accao: "por" | "tirar") {
    const paths = [...seleccionadas];
    if (paths.length === 0) return;
    setAGuardar(true);
    // 200 fotos são segundos a dezenas de segundos com o ecrã calado: o que se
    // via era dois `select` desactivados. Ver `ui/EmCurso.tsx`.
    setAEtiquetar({ quantas: paths.length, accao });
    try {
      const res = await fetch("/api/biblioteca/etiquetar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths, etiquetaId, accao }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "falhou");
      const nome = vocabulario.find((e) => e.id === etiquetaId)?.nome ?? etiquetaId;
      // Diz quantas MUDARAM, não quantas foram pedidas: com 30 seleccionadas
      // das quais 8 já tinham a etiqueta, dizer 30 era uma conta inflacionada
      // que se descobre à segunda vez que se usa o ecrã.
      const n = data?.mudadas ?? 0;
      toast(
        accao === "por"
          ? `${n} ${n === 1 ? "foto etiquetada" : "fotos etiquetadas"} com “${nome}”`
          : `“${nome}” retirada de ${n} ${n === 1 ? "foto" : "fotos"}`,
        "success",
      );
      // A selecção MANTÉM-SE: pôr o tipo e a seguir a paleta ao mesmo conjunto
      // é o gesto normal, e limpá-la obrigava a escolher tudo outra vez.
      await recarregar();
    } catch (e) {
      toast(
        e instanceof Error && e.message !== "falhou" ? e.message : "Não foi possível guardar.",
        "error",
      );
    } finally {
      setAGuardar(false);
      setAEtiquetar(null);
    }
  }

  /**
   * Guarda a procura actual como tema.
   *
   * As etiquetas escolhidas são agrupadas POR EIXO, e cada eixo vira uma
   * exigência com `modo: "todas"` — a mesma leitura que a Catarina aprovou e a
   * mesma que a migração usou nos seis temas de origem. Escolher "branco" e
   * "amarelo" no eixo da paleta faz um tema de bouquets branco E amarelo, tal
   * como o nome sempre disse.
   */
  async function guardarComoTema() {
    const nome = nomeDoTema.trim();
    if (!nome || exigidas.length === 0) return;
    const porEixoDaRegra = new Map<Eixo, string[]>();
    for (const id of exigidas) {
      const eixo = vocabulario.find((e) => e.id === id)?.eixo;
      if (!eixo) continue;
      porEixoDaRegra.set(eixo, [...(porEixoDaRegra.get(eixo) ?? []), id]);
    }
    const eixos: EixoDaRegra[] = [...porEixoDaRegra].map(([eixo, etiquetas]) => ({
      eixo,
      modo: "todas",
      etiquetas,
    }));
    setACriarTema(true);
    try {
      const res = await fetch("/api/temas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome, filterRule: { v: 1, eixos } }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Não foi possível criar o tema.");
      setNomeDoTema("");
      toast(`Tema “${nome}” criado com esta procura`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível criar o tema.", "error");
    } finally {
      setACriarTema(false);
    }
  }

  const porEixo = (eixo: Eixo) => vocabulario.filter((e) => e.eixo === eixo);

  const chip = (activo: boolean) =>
    `alvo-toque rounded-full px-3 py-1.5 text-xs transition-colors ${
      activo
        ? "bg-[#4d6350] text-white"
        : "bg-foreground/[0.05] text-foreground/60 hover:bg-foreground/[0.09]"
    }`;

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={onBack}>
          ← Temas
        </Button>
        <div>
          <h2 className="font-display text-lg text-foreground/85">Rever etiquetas</h2>
          <p className="bo-text-muted text-xs">
            {carregando ? "A procurar…" : `${total} ${total === 1 ? "foto" : "fotos"}`}
          </p>
        </div>
      </div>

      {blocked && (
        <Card padding="sm" className="mb-5 border-[#8a6d2f]/30 bg-[#f6efe1]/60">
          <p className="bo-eyebrow mb-1.5 text-[#8a6d2f]">Falta um passo de instalação</p>
          <p className="text-sm leading-relaxed text-foreground/75">{blocked}</p>
        </Card>
      )}

      <Card padding="sm" className="mb-5">
        {/* Os atalhos que levam ao trabalho que falta. Estão à frente das
            etiquetas de propósito: quem abre este ecrã vem quase sempre para
            "o que está por arrumar", não para uma procura fina. */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="bo-eyebrow mr-1">Falta arrumar</span>
          {EIXOS.map((eixo) => (
            <button
              key={eixo}
              type="button"
              aria-pressed={semEixo.includes(eixo)}
              onClick={() =>
                setSemEixo((prev) =>
                  prev.includes(eixo) ? prev.filter((e) => e !== eixo) : [...prev, eixo],
                )
              }
              className={chip(semEixo.includes(eixo))}
            >
              sem {eixo}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={porConfirmar}
            onClick={() => setPorConfirmar((v) => !v)}
            className={chip(porConfirmar)}
          >
            por confirmar
          </button>
        </div>

        {EIXOS.map((eixo) => {
          const valores = porEixo(eixo);
          if (valores.length === 0) return null;
          return (
            <div key={eixo} className="mt-3 flex flex-wrap items-center gap-2">
              <span className="bo-eyebrow mr-1 w-20 shrink-0">{NOME_DO_EIXO[eixo]}</span>
              {valores.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={exigidas.includes(e.id)}
                  onClick={() =>
                    setExigidas((prev) =>
                      prev.includes(e.id) ? prev.filter((x) => x !== e.id) : [...prev, e.id],
                    )
                  }
                  className={chip(exigidas.includes(e.id))}
                >
                  {e.nome}
                </button>
              ))}
            </div>
          );
        })}

        {/* O passo que fecha o círculo: filtrar, gostar do resultado, e dar-lhe
            um nome. É assim que um tema NASCE a partir de agora — uma pergunta
            guardada, não uma pasta para onde é preciso copiar fotos.
            Só com etiquetas escolhidas: "sem tipo" é um filtro de arrumação,
            e um tema que mostrasse "o que ainda não etiquetei" esvaziava-se
            sozinho à medida que o trabalho fosse sendo feito. */}
        {exigidas.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-foreground/[0.07] pt-3">
            <input
              value={nomeDoTema}
              onChange={(ev) => setNomeDoTema(ev.target.value)}
              placeholder="Guardar esta procura como tema…"
              aria-label="Nome do tema a criar com este filtro"
              maxLength={MAX_THEME_NAME}
              className="bo-input w-auto min-w-56 flex-1 py-2 text-sm"
              onKeyDown={(ev) => {
                if (ev.key === "Enter") void guardarComoTema();
              }}
            />
            <Button
              size="sm"
              onClick={guardarComoTema}
              loading={aCriarTema}
              disabled={!nomeDoTema.trim() || aCriarTema}
            >
              Criar tema
            </Button>
            <span className="bo-text-muted text-xs">
              {total} {total === 1 ? "foto" : "fotos"} — e as próximas que corresponderem entram
              sozinhas
            </span>
          </div>
        )}

        {(exigidas.length > 0 || semEixo.length > 0 || porConfirmar) && (
          <button
            type="button"
            onClick={() => {
              setExigidas([]);
              setSemEixo([]);
              setPorConfirmar(false);
            }}
            className="bo-text-muted mt-3 text-xs underline underline-offset-2"
          >
            Limpar filtros
          </button>
        )}
      </Card>

      {carregando ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bo-skeleton aspect-square rounded-lg" aria-hidden />
          ))}
        </div>
      ) : fotos.length === 0 ? (
        <Card padding="sm">
          <p className="bo-text-muted text-sm">
            {semEixo.length > 0 || porConfirmar
              ? "Nada por arrumar aqui — está tudo etiquetado."
              : "Nenhuma foto com estas etiquetas."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {fotos.map((f) => {
            const escolhida = seleccionadas.has(f.path);
            return (
              <button
                key={f.path}
                type="button"
                aria-pressed={escolhida}
                aria-label={`Foto ${f.path.split("/").pop()}`}
                onClick={(ev) => tocar(f.path, ev.shiftKey)}
                className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                  escolhida ? "border-[#4d6350]" : "border-transparent hover:border-foreground/20"
                }`}
              >
                {/* A miniatura, com o ORIGINAL como plano B. Assinar um caminho
                    no Storage não confirma que o ficheiro lá está: as fotos
                    anteriores às miniaturas trazem um `thumbUrl` bem formado
                    para um objecto que não existe, e o 404 só aparece no
                    navegador. Sem isto ficava um quadrado vazio — e escolher
                    trinta fotos a partir de quadrados vazios não é escolher. */}
                <ImagemComPlanoB
                  src={f.thumbUrl || f.url}
                  planoB={f.url}
                  className="h-full w-full object-cover"
                />
                {escolhida && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#4d6350] text-[11px] text-white">
                    ✓
                  </span>
                )}
                {/* Um ponto para o que a migração adivinhou e ninguém confirmou.
                    Discreto de propósito: é uma pista, não um alarme. */}
                {f.porConfirmar && !escolhida && (
                  <span
                    className="absolute left-1 top-1 h-2 w-2 rounded-full bg-[#8a6d2f]"
                    title="Etiqueta por confirmar"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* A barra de acções aparece com a selecção e fica colada em baixo: com
          oitenta fotos no ecrã, ter de subir ao topo para aplicar uma etiqueta
          era o que fazia desistir a meio.

          ── E COLADA ACIMA DA NAVEGAÇÃO, NÃO POR BAIXO DELA ─────────────────
          Do registo do audit, e é um dos oito bloqueios: «a barra que aplica
          etiquetas fica por trás da barra de destinos do telemóvel — escolhem-se
          as fotos e não se etiqueta».

          `bottom-0` cola ao fundo do que ROLA, que aqui é a janela; a navegação
          do back office é `fixed bottom-0` no plano seguinte, com 72 px mais a
          área segura. O `padding` que o `AdminClient` põe no conteúdo não salva
          nada: um elemento `sticky` posiciona-se contra o scrollport e não
          contra o padding do pai. A 390 px o conteúdo desta barra quebra em
          quatro filas, e as duas que ficavam tapadas eram precisamente os dois
          `select` — a única forma de aplicar ou tirar uma etiqueta.

          A distância ao fundo passa a ser a altura dessa navegação, que vive no
          token `--bo-barra-inferior`. É o mesmo remédio que a barra de acções do
          estúdio já usa, escrito no mesmo token; era só propagá-lo. `lg:bottom-0`
          porque acima de 1024 a navegação é lateral e não há nada por baixo. */}
      {seleccionadas.size > 0 && (
        <div className="sticky bottom-[calc(var(--bo-barra-inferior)+env(safe-area-inset-bottom))] z-20 mt-4 rounded-xl border border-foreground/[0.1] bg-[var(--bo-surface,#ffffff)] p-3 shadow-[0_-2px_12px_rgba(42,38,32,0.06)] lg:bottom-0">
          <div className="flex flex-wrap items-center gap-3">
            {/* `role="status"` porque o número muda com o teclado e com o
                Shift+clique, e quem não vê o ecrã tem de ouvir quantas leva —
                é a única confirmação de que a selecção fez o que se queria. */}
            <p role="status" className="text-sm text-foreground/75">
              <strong>{seleccionadas.size}</strong>{" "}
              {seleccionadas.size === 1 ? "foto escolhida" : "fotos escolhidas"}
            </p>
            <button
              type="button"
              onClick={() => setSeleccionadas(new Set())}
              className="bo-text-muted text-xs underline underline-offset-2"
            >
              limpar
            </button>
            <button
              type="button"
              onClick={() => setSeleccionadas(new Set(fotos.map((f) => f.path)))}
              className="bo-text-muted text-xs underline underline-offset-2"
            >
              escolher as {fotos.length} do ecrã
            </button>
            <label className="ml-auto flex items-center gap-2">
              <span className="sr-only">Etiqueta a aplicar</span>
              <select
                disabled={aGuardar}
                defaultValue=""
                onChange={(ev) => {
                  const id = ev.target.value;
                  ev.target.value = "";
                  if (id) void aplicar(id, "por");
                }}
                className="bo-input w-auto py-2 pl-3 pr-8 text-xs"
              >
                <option value="">Pôr etiqueta…</option>
                {EIXOS.map((eixo) => (
                  <optgroup key={eixo} label={NOME_DO_EIXO[eixo]}>
                    {porEixo(eixo).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                disabled={aGuardar}
                defaultValue=""
                onChange={(ev) => {
                  const id = ev.target.value;
                  ev.target.value = "";
                  if (id) void aplicar(id, "tirar");
                }}
                className="bo-input w-auto py-2 pl-3 pr-8 text-xs"
              >
                <option value="">Tirar etiqueta…</option>
                {EIXOS.map((eixo) => (
                  <optgroup key={eixo} label={NOME_DO_EIXO[eixo]}>
                    {porEixo(eixo).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>

          {/* A ESPERA, DENTRO DA BARRA E NÃO POR CIMA DELA.

              Este ecrã já tem duas barras coladas em baixo — esta e a navegação
              de destinos do telemóvel, que vive no token `--bo-barra-inferior`.
              Um cartão flutuante era o terceiro andar e tapava um dos dois
              `select`, que é o bloqueio que esta barra já teve uma vez. Aqui
              dentro ela cresce para CIMA e nada fica escondido.

              É a espera OPACA: um pedido só, e quantas mudaram é o servidor que
              diz no fim. O número de fotos vai no título, que é a informação que
              ela tem antes da resposta. */}
          {aEtiquetar && (
            <EmCurso
              className="mt-3"
              titulo={
                aEtiquetar.accao === "por"
                  ? `A etiquetar ${aEtiquetar.quantas} ${aEtiquetar.quantas === 1 ? "foto" : "fotos"}…`
                  : `A tirar a etiqueta a ${aEtiquetar.quantas} ${aEtiquetar.quantas === 1 ? "foto" : "fotos"}…`
              }
              estimadoMs={ESPERA_BASE_MS + aEtiquetar.quantas * ESPERA_POR_FOTO_MS}
              nota="A grelha é lida outra vez no fim, e a selecção mantém-se."
              notaDemorada="Está a demorar mais do que o costume. Não feches o separador — o lote continua a ser gravado."
            />
          )}
        </div>
      )}
    </div>
  );
}
