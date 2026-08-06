"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui";
import { useToast } from "./Toast";

/**
 * ESCOLHER DA BIBLIOTECA EM VEZ DE ESCREVER OUTRA VEZ.
 *
 * O mesmo serviço saía escrito de maneira diferente conforme o dia. Não é
 * desarrumação: é o cliente a receber uma descrição feita à pressa quando
 * existia uma feita com tempo.
 *
 * ── UMA GAVETA, NÃO UM DIÁLOGO ─────────────────────────────────────────────
 * Abre por baixo do botão, dentro do editor, e fecha ao escolher. Um diálogo a
 * meio ecrã para acrescentar uma linha de serviço tapava exactamente o grupo
 * onde ela estava a trabalhar, e obrigava a duas decisões (o quê, e depois
 * fechar) onde só há uma.
 *
 * ── A BIBLIOTECA CRESCE SOZINHA ────────────────────────────────────────────
 * O que se escreve à mão continua a poder ser escrito à mão; há um botão para
 * o guardar aqui quando valer a pena. É assim que uma biblioteca se enche sem
 * ninguém parar um dia para a encher.
 */

export interface ServicoDaBiblioteca {
  id: string;
  nome: string;
  descricao: string;
  nomeEn: string;
  descricaoEn: string;
  categoria: string;
  arquivado?: boolean;
}

interface Props {
  /** Foi escolhido um serviço: o editor acrescenta a linha. */
  onEscolher: (s: ServicoDaBiblioteca) => void;
  /** Fechar sem escolher. */
  onFechar: () => void;
}

export default function BibliotecaServicos({ onEscolher, onFechar }: Props) {
  const { toast } = useToast();
  const [servicos, setServicos] = useState<ServicoDaBiblioteca[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [procura, setProcura] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch("/api/servicos-catalogo")
      .then(async (r) => {
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) setErro(j?.error ?? "Não foi possível ler a biblioteca.");
        else setServicos(j as ServicoDaBiblioteca[]);
      })
      .catch(() => vivo && setErro("Não foi possível falar com o servidor."));
    return () => {
      vivo = false;
    };
  }, []);

  const lista = useMemo(() => {
    const t = procura.trim().toLowerCase();
    return (servicos ?? [])
      .filter((s) => !s.arquivado)
      .filter(
        (s) =>
          !t || [s.nome, s.descricao, s.categoria].some((c) => (c ?? "").toLowerCase().includes(t)),
      );
  }, [servicos, procura]);

  /** Agrupada por categoria: é assim que ela pensa nos serviços. */
  const porCategoria = useMemo(() => {
    const mapa = new Map<string, ServicoDaBiblioteca[]>();
    for (const s of lista) {
      const c = s.categoria || "Outros";
      const actual = mapa.get(c);
      if (actual) actual.push(s);
      else mapa.set(c, [s]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b, "pt"));
  }, [lista]);

  return (
    <div className="mt-2 rounded-xl border border-foreground/[0.10] bg-[var(--bo-surface,#fff)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          autoFocus
          value={procura}
          onChange={(e) => setProcura(e.target.value)}
          placeholder="Procurar na biblioteca…"
          aria-label="Procurar na biblioteca de serviços"
          className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs"
        />
        <Button variant="ghost" size="sm" onClick={onFechar}>
          Fechar
        </Button>
      </div>

      {erro && <p className="mt-2 text-[11px] leading-relaxed text-[#b5654a]">{erro}</p>}

      {!erro && servicos === null && (
        <p className="mt-2 text-[11px] text-foreground/40">A carregar…</p>
      )}

      {!erro && servicos !== null && lista.length === 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-foreground/50">
          {procura
            ? "Nada na biblioteca com esse nome. Escreva à mão e guarde depois."
            : "A biblioteca ainda está vazia. Escreva os serviços à mão e guarde os que valer a pena reutilizar."}
        </p>
      )}

      {porCategoria.map(([categoria, itens]) => (
        <div key={categoria} className="mt-3">
          <p className="text-[9px] tracking-[0.2em] uppercase text-foreground/30">{categoria}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {itens.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    onEscolher(s);
                    toast(`"${s.nome}" acrescentado`, "success");
                  }}
                  className="alvo-toque !justify-start w-full rounded-lg border border-transparent px-2 py-1.5 text-left hover:border-foreground/[0.12] hover:bg-foreground/[0.02]"
                >
                  <span className="block text-xs font-medium text-foreground/80">{s.nome}</span>
                  {s.descricao && (
                    <span className="mt-0.5 block truncate text-[11px] text-foreground/45">
                      {s.descricao}
                    </span>
                  )}
                  {/* Sem inglês, di-lo aqui: é onde ela pode decidir escrevê-lo,
                      e uma proposta em inglês com metade dos serviços em
                      português lê-se como descuido. */}
                  {!s.nomeEn && (
                    <span className="mt-0.5 block text-[10px] text-[#8a6420]">
                      sem versão inglesa
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Guarda na biblioteca um serviço escrito à mão.
 *
 * Devolve `true` quando ficou guardado (ou já lá estava — a rota devolve o
 * existente em vez de um erro, porque quem carregou no botão queria o serviço
 * na biblioteca, e ele está).
 */
export async function guardarNaBiblioteca(nome: string, descricao: string): Promise<boolean> {
  try {
    const res = await fetch("/api/servicos-catalogo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, descricao }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
