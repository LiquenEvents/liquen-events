"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "./Toast";
import { SkeletonList } from "./Skeleton";
import { Button } from "./ui";
import { insertToken } from "@/lib/email-template-format";
import { renderizarAssunto, renderizarCorpo, validarModelo } from "@/lib/email-template-engine";
import {
  VALORES_DE_EXEMPLO,
  VARIAVEIS_POR_GRUPO,
  type GrupoDeVariavel,
} from "@/lib/email-template-vars";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ECRÃ DOS MODELOS, NAS DUAS LÍNGUAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que este ecrã acrescenta ao editor clássico, e porquê cada coisa:
 *
 *  • PT E EN lado a lado. As propostas já são bilingues e o email tem de
 *    seguir a língua do cliente. Enquanto o lado inglês estiver por escrever,
 *    diz-se — não se traduz à máquina o texto dela.
 *  • O MENU DE VARIÁVEIS POR GRUPOS, com «Quem assina» separado do «Cliente».
 *    Está a sair correio a clientes assinado com o nome deles; um menu que
 *    ofereça «nome» sem dizer de quem é o nome é onde essa troca começa.
 *  • BLOCOS CONDICIONAIS com um botão. `{{#se evento_data}}` escrito à mão
 *    erra-se, e um bloco mal fechado não se vê a olho.
 *  • PRÉ-VISUALIZAÇÃO COM UM PEDIDO A SÉRIO. Ver a forma do email não é ver o
 *    que ele diz: um `{{#se_nao evento_data}}` só se percebe num pedido que
 *    não tem data.
 *  • UM TESTE PARA A PRÓPRIA CAIXA. A moldura e a assinatura da casa só
 *    aparecem depois de o correio passar — não há como as ver aqui.
 *  • HISTÓRICO COM REVERSÃO. Publicar é enviar; poder voltar atrás em dois
 *    cliques é o que torna a experimentação segura.
 *
 * ── A 390 px ──────────────────────────────────────────────────────────────
 *
 * O back office usa-se no telemóvel. Tudo empilha por omissão (`grid-cols-1`)
 * e só se divide em colunas a partir de `lg`. Nada aqui tem largura fixa: a
 * lista de modelos, os separadores de língua, o menu de variáveis e o
 * histórico são todos `flex-wrap`, e a pré-visualização é `w-full`.
 */

interface LadoDoModelo {
  subject: string;
  body: string;
  updatedAt: string;
}
interface ModeloBilingue {
  chave: string;
  nome: string;
  descricao: string;
  pt: LadoDoModelo;
  en: LadoDoModelo;
}
interface VersaoDeModelo {
  chave: string;
  idioma: Idioma;
  versaoEm: string;
  nome: string;
  subject: string;
  body: string;
}
interface PedidoParaPreVisualizar {
  id: string;
  etiqueta: string;
  idioma: Idioma;
  semData: boolean;
}

type Idioma = "pt" | "en";
type Campo = "assunto" | "corpo";

const inputCls = "bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22";
const VERDE = "#5F7C66";

/** Um payload que não tem a forma certa ignora-se — nunca parte o ecrã. */
function ehModelo(v: unknown): v is ModeloBilingue {
  const m = v as Partial<ModeloBilingue> | null;
  return !!m && typeof m.chave === "string" && !!m.pt && !!m.en;
}

const horaCurta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const TITULO_DO_GRUPO: Record<GrupoDeVariavel, string> = {
  cliente: "Cliente",
  evento: "Evento",
  proposta: "Proposta",
  remetente: "Quem assina",
};

export default function EmailTemplatesBilingue() {
  const { toast } = useToast();
  const [modelos, setModelos] = useState<ModeloBilingue[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [chave, setChave] = useState<string | null>(null);
  const [idioma, setIdioma] = useState<Idioma>("pt");

  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [baseAssunto, setBaseAssunto] = useState("");
  const [baseCorpo, setBaseCorpo] = useState("");
  const [aGuardar, setAGuardar] = useState(false);

  const assuntoRef = useRef<HTMLInputElement>(null);
  const corpoRef = useRef<HTMLTextAreaElement>(null);
  const campoActivo = useRef<Campo>("corpo");

  const [pedidos, setPedidos] = useState<PedidoParaPreVisualizar[]>([]);
  const [pedidoId, setPedidoId] = useState("");
  const [valoresReais, setValoresReais] = useState<Record<string, string> | null>(null);

  const [versoes, setVersoes] = useState<VersaoDeModelo[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  const [destinoDoTeste, setDestinoDoTeste] = useState("");
  const [aEnviarTeste, setAEnviarTeste] = useState(false);

  const modelo = useMemo(() => modelos.find((m) => m.chave === chave) ?? null, [modelos, chave]);

  const abrir = useCallback((m: ModeloBilingue, lingua: Idioma) => {
    const lado = m[lingua];
    setChave(m.chave);
    setIdioma(lingua);
    setAssunto(lado.subject);
    setCorpo(lado.body);
    setBaseAssunto(lado.subject);
    setBaseCorpo(lado.body);
    setHistoricoAberto(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [rm, rp] = await Promise.all([
          fetch("/api/email-templates/bilingues", { cache: "no-store" }),
          fetch("/api/email-templates/dados", { cache: "no-store" }),
        ]);
        if (rm.ok) {
          const dados: unknown = await rm.json();
          const lista = Array.isArray(dados) ? dados.filter(ehModelo) : [];
          setModelos(lista);
          if (lista.length) abrir(lista[0], "pt");
        } else {
          toast("Não foi possível carregar os modelos.", "error");
        }
        if (rp.ok) {
          const d = (await rp.json()) as { pedidos?: PedidoParaPreVisualizar[] };
          setPedidos(Array.isArray(d?.pedidos) ? d.pedidos : []);
        }
      } catch {
        toast("Não foi possível carregar os modelos.", "error");
      } finally {
        setACarregar(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Os valores da pré-visualização: de um pedido a sério, ou os de exemplo. */
  useEffect(() => {
    if (!pedidoId) {
      setValoresReais(null);
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/email-templates/dados?pedido=${encodeURIComponent(pedidoId)}`, {
          cache: "no-store",
        });
        if (!vivo) return;
        if (!r.ok) {
          toast("Não foi possível ler esse pedido.", "error");
          setValoresReais(null);
          return;
        }
        const d = (await r.json()) as { valores?: Record<string, string> };
        setValoresReais(d?.valores ?? null);
      } catch {
        if (vivo) setValoresReais(null);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId]);

  const sujo = assunto !== baseAssunto || corpo !== baseCorpo;
  const erros = useMemo(() => validarModelo(assunto, corpo), [assunto, corpo]);
  const valores = valoresReais ?? VALORES_DE_EXEMPLO;

  const previsualizacao = useMemo(() => {
    const html = renderizarCorpo(corpo, valores);
    return `<!doctype html><html lang="${idioma}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0}body{padding:20px;background:#f7f4ee;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}</style></head><body>${html}</body></html>`;
  }, [corpo, valores, idioma]);

  function inserir(texto: string, deslocaCursor = 0) {
    const alvo =
      campoActivo.current === "assunto"
        ? { el: assuntoRef.current, valor: assunto, set: setAssunto }
        : { el: corpoRef.current, valor: corpo, set: setCorpo };
    const el = alvo.el;
    if (!el) {
      alvo.set(alvo.valor + texto);
      return;
    }
    const inicio = el.selectionStart ?? alvo.valor.length;
    const fim = el.selectionEnd ?? alvo.valor.length;
    const { text, caret } = insertToken(alvo.valor, inicio, fim, texto);
    alvo.set(text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret + deslocaCursor, caret + deslocaCursor);
    });
  }

  /** Envolve o que estiver seleccionado — ou abre o bloco vazio no cursor. */
  function inserirBloco(negado: boolean) {
    const variavel = "evento_data";
    const abre = negado ? `{{#se_nao ${variavel}}}` : `{{#se ${variavel}}}`;
    const fecha = negado ? "{{/se_nao}}" : "{{/se}}";
    const el = corpoRef.current;
    campoActivo.current = "corpo";
    if (!el) {
      setCorpo(corpo + abre + fecha);
      return;
    }
    const inicio = el.selectionStart ?? corpo.length;
    const fim = el.selectionEnd ?? corpo.length;
    const dentro = corpo.slice(inicio, fim);
    const novo = corpo.slice(0, inicio) + abre + dentro + fecha + corpo.slice(fim);
    setCorpo(novo);
    // O cursor fica DENTRO do bloco: o gesto seguinte é escrever lá dentro.
    const posicao = inicio + abre.length + dentro.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(posicao, posicao);
    });
  }

  async function guardar() {
    if (!modelo || aGuardar) return;
    if (!assunto.trim()) {
      toast("O assunto não pode ficar vazio.", "error");
      return;
    }
    if (erros.length) {
      toast("Há blocos mal fechados — corrige-os antes de publicar.", "error");
      return;
    }
    setAGuardar(true);
    try {
      const r = await fetch("/api/email-templates/bilingues", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chave: modelo.chave,
          nome: modelo.nome,
          idioma,
          subject: assunto.trim(),
          body: corpo,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        toast(d?.error ?? "Não foi possível guardar.", "error");
        return;
      }
      const guardado = (await r.json()) as LadoDoModelo;
      setModelos((prev) =>
        prev.map((m) =>
          m.chave === modelo.chave
            ? {
                ...m,
                [idioma]: {
                  subject: assunto.trim(),
                  body: corpo,
                  updatedAt: guardado?.updatedAt ?? new Date().toISOString(),
                },
              }
            : m,
        ),
      );
      setBaseAssunto(assunto.trim());
      setBaseCorpo(corpo);
      if (historicoAberto) void carregarVersoes();
      toast("Modelo publicado.", "success");
    } catch {
      toast("Não foi possível guardar.", "error");
    } finally {
      setAGuardar(false);
    }
  }

  const carregarVersoes = useCallback(async () => {
    if (!chave) return;
    try {
      const r = await fetch(
        `/api/email-templates/versoes?chave=${encodeURIComponent(chave)}&idioma=${idioma}`,
        { cache: "no-store" },
      );
      setVersoes(r.ok ? ((await r.json()) as VersaoDeModelo[]) : []);
    } catch {
      setVersoes([]);
    }
  }, [chave, idioma]);

  async function abrirHistorico() {
    const abrirAgora = !historicoAberto;
    setHistoricoAberto(abrirAgora);
    if (abrirAgora) await carregarVersoes();
  }

  async function reverter(versaoEm: string) {
    if (!modelo) return;
    const ok = window.confirm(
      "Voltar a esta versão? O texto que está a sair agora fica guardado no histórico, por isso podes desfazer.",
    );
    if (!ok) return;
    try {
      const r = await fetch("/api/email-templates/versoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: modelo.chave, idioma, versaoEm }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        toast(d?.error ?? "Não foi possível reverter.", "error");
        return;
      }
      const reposto = (await r.json()) as { subject: string; body: string; updatedAt: string };
      setModelos((prev) =>
        prev.map((m) => (m.chave === modelo.chave ? { ...m, [idioma]: reposto } : m)),
      );
      setAssunto(reposto.subject);
      setCorpo(reposto.body);
      setBaseAssunto(reposto.subject);
      setBaseCorpo(reposto.body);
      await carregarVersoes();
      toast("Versão reposta.", "success");
    } catch {
      toast("Não foi possível reverter.", "error");
    }
  }

  async function enviarTeste() {
    if (!modelo || aEnviarTeste) return;
    setAEnviarTeste(true);
    try {
      const r = await fetch("/api/email-templates/teste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: modelo.nome,
          subject: assunto,
          body: corpo,
          idioma,
          pedido: pedidoId,
          para: destinoDoTeste.trim(),
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        toast(d?.error ?? "Não foi possível enviar o teste.", "error");
        return;
      }
      toast(`Teste enviado para ${d?.para ?? "a caixa da Líquen"}.`, "success");
    } catch {
      toast("Não foi possível enviar o teste.", "error");
    } finally {
      setAEnviarTeste(false);
    }
  }

  if (aCarregar) {
    return (
      <div className="max-w-6xl">
        <SkeletonList rows={4} />
      </div>
    );
  }

  const ladoVazio = !!modelo && !modelo[idioma].subject.trim() && !modelo[idioma].body.trim();

  return (
    <div className="max-w-6xl grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
      {/* ── A lista ── */}
      <div className="bo-card overflow-hidden self-start">
        <div className="px-4 py-3 border-b border-foreground/[0.07]">
          <p className="bo-eyebrow">Modelos ({modelos.length})</p>
        </div>
        <div className="divide-y divide-foreground/[0.06]">
          {modelos.map((m) => {
            const activo = m.chave === chave;
            const temIngles = !!m.en.subject.trim() || !!m.en.body.trim();
            return (
              <button
                key={m.chave}
                onClick={() => abrir(m, idioma)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  activo ? "bg-[#5F7C66]/10" : "hover:bg-foreground/[0.02]"
                }`}
              >
                <p
                  className={`text-sm ${activo ? "text-[#5F7C66] font-medium" : "text-foreground/70"}`}
                >
                  {m.nome}
                  {!temIngles && (
                    <span className="ml-1.5 rounded-full bg-[#c98a2e]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#8a5d13] align-middle">
                      sem EN
                    </span>
                  )}
                </p>
                {m.descricao && (
                  <p className="text-[11px] text-foreground/40 mt-0.5 leading-snug">
                    {m.descricao}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {modelo ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          {/* ── O editor ── */}
          <div className="bo-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="bo-eyebrow">A editar</p>
                <p className="text-sm text-foreground/70 mt-1">{modelo.nome}</p>
              </div>
              <div className="flex flex-wrap shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={abrirHistorico}>
                  {historicoAberto ? "Fechar histórico" : "Histórico"}
                </Button>
                <Button
                  variant="primary"
                  onClick={guardar}
                  loading={aGuardar}
                  disabled={aGuardar || !sujo || erros.length > 0}
                >
                  {aGuardar ? "A publicar…" : "Publicar"}
                </Button>
              </div>
            </div>

            {/* ── Língua ──
                Os dois separadores estão sempre presentes, mesmo quando o
                inglês ainda não existe: é a única maneira de ela reparar que
                falta — e a etiqueta di-lo, em vez de o ecrã fingir que está
                tudo escrito. */}
            <div
              className="flex flex-wrap gap-1.5 mb-4"
              role="tablist"
              aria-label="Língua do modelo"
            >
              {(["pt", "en"] as Idioma[]).map((l) => {
                const activo = l === idioma;
                const vazio = !modelo[l].subject.trim() && !modelo[l].body.trim();
                return (
                  <button
                    key={l}
                    role="tab"
                    aria-selected={activo}
                    onClick={() => abrir(modelo, l)}
                    className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                      activo
                        ? "bg-[#5F7C66] text-white"
                        : "bg-[#5F7C66]/10 text-[#5F7C66] hover:bg-[#5F7C66]/20"
                    }`}
                  >
                    {l === "pt" ? "Português" : "English"}
                    {vazio && <span className="ml-1 opacity-70">(por escrever)</span>}
                  </button>
                );
              })}
            </div>

            {ladoVazio && (
              <p className="mb-4 rounded-lg bg-[#c98a2e]/10 px-3 py-2 text-[11px] leading-relaxed text-[#8a5d13]">
                Este modelo ainda não tem versão inglesa. Enquanto não a escreveres, um pedido em
                inglês não recebe este modelo — em vez de receber português, não recebe nada e o
                envio diz-te porquê. Não traduzimos o teu texto à máquina.
              </p>
            )}

            <label htmlFor="etb-assunto" className="bo-eyebrow block mb-1.5">
              Assunto
            </label>
            <input
              id="etb-assunto"
              ref={assuntoRef}
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              onFocus={() => (campoActivo.current = "assunto")}
              placeholder="Assunto do email"
              className={`${inputCls} w-full mb-4`}
            />

            {/* ── O menu de variáveis, por grupos ──
                «Quem assina» é um grupo À PARTE e com a sua nota. Um menu que
                oferecesse um «nome» sem dono é onde a troca entre quem recebe
                e quem assina começa — e ela já aconteceu. */}
            <label className="bo-eyebrow block mb-1.5">Dados a inserir</label>
            <div className="space-y-2 mb-2">
              {VARIAVEIS_POR_GRUPO.filter((g) => g.itens.length > 0).map((grupo) => (
                <div key={grupo.grupo}>
                  <p className="text-[10px] uppercase tracking-wide text-foreground/35 mb-1">
                    {TITULO_DO_GRUPO[grupo.grupo]}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {grupo.itens.map((v) => (
                      <button
                        key={v.chave}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => inserir(`{{${v.chave}}}`)}
                        title={v.dica}
                        className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                          grupo.grupo === "remetente"
                            ? "bg-[#8a5d13]/10 text-[#8a5d13] hover:bg-[#8a5d13]/20"
                            : "bg-[#5F7C66]/10 text-[#5F7C66] hover:bg-[#5F7C66]/20"
                        }`}
                      >
                        {v.rotulo}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-foreground/40 mb-4 leading-relaxed">
              «Quem assina» é quem envia o email — nunca o cliente. Se um dado não existir no
              pedido, sai vazio: usa um bloco «só se» para escrever o que dizer nesse caso.
            </p>

            {/* ── Blocos condicionais ── */}
            <label className="bo-eyebrow block mb-1.5">Texto que só aparece às vezes</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => inserirBloco(false)}
                className="px-2.5 py-1 rounded-md text-[11px] bg-[#5F7C66]/10 text-[#5F7C66] hover:bg-[#5F7C66]/20 transition-colors"
              >
                só se houver data
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => inserirBloco(true)}
                className="px-2.5 py-1 rounded-md text-[11px] bg-[#5F7C66]/10 text-[#5F7C66] hover:bg-[#5F7C66]/20 transition-colors"
              >
                só se NÃO houver data
              </button>
            </div>
            <p className="text-[11px] text-foreground/40 mb-4 leading-relaxed">
              Selecciona o texto e carrega — ele passa a aparecer só nesse caso. Trocando{" "}
              <span className="font-mono text-foreground/55">evento_data</span> por outro nome, a
              regra passa a ser sobre esse dado.
            </p>

            <label htmlFor="etb-corpo" className="bo-eyebrow block mb-1.5">
              Mensagem
            </label>
            <textarea
              id="etb-corpo"
              ref={corpoRef}
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              onFocus={() => (campoActivo.current = "corpo")}
              spellCheck={false}
              rows={14}
              className={`${inputCls} w-full font-mono !text-xs leading-relaxed resize-y`}
            />

            {erros.length > 0 && (
              <ul className="mt-2 space-y-1" aria-live="polite">
                {erros.map((e) => (
                  <li key={e} className="text-[11px] leading-snug text-[#a33]">
                    {e}
                  </li>
                ))}
              </ul>
            )}

            {historicoAberto && (
              <div className="mt-5 border-t border-foreground/[0.07] pt-4">
                <p className="bo-eyebrow mb-2">Histórico ({versoes.length})</p>
                {versoes.length === 0 ? (
                  <p className="text-[11px] text-foreground/40 leading-relaxed">
                    Ainda não há versões anteriores desta língua. A primeira aparece quando
                    publicares uma alteração.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {versoes.map((v) => (
                      <li
                        key={v.versaoEm}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="text-[11px] text-foreground/50 min-w-0 break-words">
                          {horaCurta(v.versaoEm)} · {v.subject || "(sem assunto)"}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => reverter(v.versaoEm)}>
                          Repor
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-foreground/40 mt-2 leading-relaxed">
                  Guardam-se as últimas 10 versões de cada língua. Repor é ele próprio desfazível: o
                  texto que está a sair agora fica no histórico.
                </p>
              </div>
            )}
          </div>

          {/* ── Pré-visualização + teste ── */}
          <div className="bo-card p-5 xl:sticky xl:top-5">
            <p className="bo-eyebrow mb-1.5">Pré-visualização</p>

            <label htmlFor="etb-pedido" className="sr-only">
              Pedido a usar na pré-visualização
            </label>
            <select
              id="etb-pedido"
              value={pedidoId}
              onChange={(e) => setPedidoId(e.target.value)}
              className={`${inputCls} w-full mb-2`}
            >
              <option value="">Dados de exemplo</option>
              {pedidos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.etiqueta}
                  {p.semData ? " · sem data" : ""}
                  {p.idioma === "en" ? " · EN" : ""}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-foreground/40 mb-3 leading-relaxed">
              Escolhe um pedido a sério para veres o que este modelo diz com os dados dele — um
              pedido sem data é a melhor maneira de ver os blocos a funcionar. No fim, a assinatura
              da Líquen entra sozinha: não precisas de te despedir.
            </p>

            <div className="rounded-lg border border-foreground/[0.08] overflow-hidden">
              <div className="px-3 py-2 bg-foreground/[0.03] border-b border-foreground/[0.06]">
                <p className="text-[10px] text-foreground/40">Assunto</p>
                <p className="text-sm text-foreground/75 break-words">
                  {renderizarAssunto(assunto, valores) || (
                    <span className="text-foreground/30">(sem assunto)</span>
                  )}
                </p>
              </div>
              <iframe
                title="Pré-visualização do email"
                srcDoc={previsualizacao}
                sandbox=""
                className="w-full block bg-[#f7f4ee]"
                style={{ height: 420, border: "none" }}
              />
            </div>

            {/* ── O teste ── */}
            <div className="mt-4 border-t border-foreground/[0.07] pt-4">
              <label htmlFor="etb-teste" className="bo-eyebrow block mb-1.5">
                Enviar um teste
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="etb-teste"
                  type="email"
                  value={destinoDoTeste}
                  onChange={(e) => setDestinoDoTeste(e.target.value)}
                  placeholder="para a caixa da Líquen"
                  className={`${inputCls} flex-1 min-w-0`}
                />
                <Button variant="subtle" onClick={enviarTeste} loading={aEnviarTeste}>
                  {aEnviarTeste ? "A enviar…" : "Enviar teste"}
                </Button>
              </div>
              <p className="text-[11px] text-foreground/40 mt-2 leading-relaxed">
                Vai o texto que está no editor, mesmo por publicar, com «[TESTE]» no assunto. Nunca
                é enviado para o cliente do pedido escolhido.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bo-card p-8 text-center text-foreground/30 text-sm">
          Seleciona um modelo para editar.
        </div>
      )}
    </div>
  );
}
