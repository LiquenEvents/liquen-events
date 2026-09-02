"use client";

import { LIFECYCLE, GLOSSARY } from "./glossario-data";
import { FolhaOuDialogo } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Ajuda de entrada para quem começa: explica o percurso de um trabalho
 * (Pedido → Proposta → Contrato → Pagamento → Evento) e traduz o vocabulário do
 * back-office em linguagem simples. Abre a partir do botão "?" na barra de topo.
 *
 * Espelha o ShortcutsModal, e os dois vivem no `FolhaOuDialogo`: no computador
 * é o diálogo centrado de sempre; num telemóvel é a folha inferior, com a pega
 * e o arrasto para fechar. A armadilha de foco, o Escape, o trinco do scroll e
 * a camada de história (o gesto de voltar do iPhone fecha isto e não o back
 * office) deixaram de ser três efeitos copiados à mão e passaram a vir de lá.
 */
export default function AjudaGlossario({ open, onClose }: Props) {
  return (
    <FolhaOuDialogo
      aberto={open}
      onFechar={onClose}
      titulo="Ajuda e glossário"
      largura="md"
      // Texto longo a rolar: a folha ocupa o ecrã todo em vez de se ajustar ao
      // conteúdo, senão são 129 linhas de glossário a rolar numa janelinha.
      folhaAlta
      // Acima da paleta de comandos (90) não é preciso, mas acima da gaveta do
      // pedido (50, e depois disto na árvore) é: com 50 esta janela abria por
      // trás da gaveta.
      nivel={90}
    >
      {/* ── Boas-vindas ── */}
      <p className="text-foreground/55 text-sm leading-relaxed mb-6">
        Bem-vindo(a). Esta janela explica, em poucas palavras, como funciona o back-office e o que
        significa cada termo que vais encontrar. Podes voltar aqui sempre que precisares — abre com
        o botão “?” no topo
        {/* A tecla e o "Escape" só se dizem a quem os tem. Num telemóvel a
            frase mandava carregar em teclas que não existem; o botão “?” e
            o × do canto são o caminho, e esses estão lá sempre. */}
        <span className="pointer-coarse:hidden">
          {" "}
          ou com a tecla{" "}
          <kbd className="text-[10px] text-foreground/55 bg-[var(--bo-tinta-6)] border border-[var(--bo-hairline-strong)] rounded px-1.5 py-0.5 leading-none">
            ?
          </kbd>
        </span>
        . Fecha
        <span className="pointer-coarse:hidden"> com Escape ou</span> no × do canto.
      </p>

      {/* ── Como funciona ── */}
      <section>
        <p className="text-foreground/30 text-[10px] tracking-[0.25em] uppercase mb-1">
          Como funciona
        </p>
        <p className="text-foreground/45 text-sm mb-4">
          Cada trabalho faz sempre o mesmo percurso. Os nomes do menu são só as fases deste caminho:
        </p>
        <ol className="flex flex-col gap-3">
          {LIFECYCLE.map((it, i) => (
            <li key={it.step} className="flex gap-3">
              <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-[#4d6350]/12 text-[#4d6350] text-[11px] font-semibold flex items-center justify-center tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-foreground/75 text-sm font-medium">{it.step}</p>
                <p className="text-foreground/50 text-sm leading-relaxed">{it.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="h-px bg-[var(--bo-tinta-6)] my-6" />

      {/* ── Glossário ── */}
      <section>
        <p className="text-foreground/30 text-[10px] tracking-[0.25em] uppercase mb-1">
          Glossário — o que significa cada palavra
        </p>
        <p className="text-foreground/45 text-sm mb-4">
          As palavras aparecem pela ordem do percurso acima. São exatamente os nomes que vai ver no
          menu, nos estados dos pedidos e nos botões.
        </p>
        <dl className="flex flex-col gap-4">
          {GLOSSARY.map((it) => (
            <div key={it.term}>
              <dt className="text-foreground/75 text-sm font-medium">{it.term}</dt>
              <dd className="text-foreground/50 text-sm leading-relaxed">{it.def}</dd>
            </div>
          ))}
        </dl>
      </section>
    </FolhaOuDialogo>
  );
}
