"use client";

import { FolhaOuDialogo } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * ── O QUE DESAPARECE NUM ECRÃ DE DEDO, E PORQUÊ ────────────────────────────
 *
 * `soTeclado` marca os grupos que não têm contrapartida nenhuma no toque: uma
 * combinação («G, depois P»), um ⌘Z, ou setas sobre um cartão FOCADO — sem
 * teclado não há foco nem combinação, e o que fica no ecrã é uma lista de
 * teclas que o aparelho não tem.
 *
 * O «Geral» fica, e não é por descuido: cada uma das suas seis linhas tem um
 * botão à vista no telemóvel (guardar tudo, pesquisar, novo pedido, o «?», o
 * «×»), portanto lê-se como um índice do que a barra faz e não como uma lista
 * de teclas inúteis.
 *
 * É a mesma decisão que o botão que abre isto já tinha tomado — ele próprio é
 * `pointer-coarse:hidden` na gaveta de navegação (ver `AdminClient`) — e o
 * mesmo padrão do `AjudaGlossario`, que esconde as menções ao «?» e ao Escape
 * pela mesma razão.
 */
const GROUPS: {
  title: string;
  soTeclado?: boolean;
  items: { keys: string[]; label: string }[];
}[] = [
  {
    title: "Geral",
    items: [
      // Deixou de ser um atalho do estúdio de propostas: vale em qualquer sítio
      // do back office e grava TODOS os ecrãs com trabalho por gravar — é o
      // mesmo gesto do botão «Guardar tudo» do cabeçalho, com a mesma resposta.
      { keys: ["⌘", "S"], label: "Guardar tudo o que está por gravar" },
      { keys: ["⌘", "K"], label: "Pesquisar / comandos" },
      { keys: ["/"], label: "Procurar nos pedidos" },
      { keys: ["N"], label: "Novo pedido" },
      { keys: ["?"], label: "Mostrar atalhos" },
      { keys: ["Esc"], label: "Fechar janelas" },
    ],
  },
  {
    title: "Navegar — pressiona G, depois…",
    soTeclado: true,
    items: [
      { keys: ["G", "O"], label: "Visão Geral" },
      { keys: ["G", "P"], label: "Pedidos" },
      { keys: ["G", "K"], label: "Organização de propostas" },
      { keys: ["G", "C"], label: "Clientes" },
      { keys: ["G", "A"], label: "Calendário" },
      { keys: ["G", "R"], label: "Propostas" },
      { keys: ["G", "T"], label: "Tarefas" },
      { keys: ["G", "F"], label: "Fornecedores" },
      { keys: ["G", "E"], label: "Estatísticas" },
    ],
  },
  {
    title: "Estúdio de propostas",
    soTeclado: true,
    items: [{ keys: ["⌘", "Z"], label: "Desfazer" }],
  },
  {
    title: "Organização de propostas — com um cartão focado",
    soTeclado: true,
    items: [
      { keys: ["Enter"], label: "Abrir o pedido" },
      { keys: ["←"], label: "Mover para a coluna anterior" },
      { keys: ["→"], label: "Mover para a coluna seguinte" },
    ],
  },
];

/** A discoverable cheat-sheet for the back-office keyboard shortcuts (opens with "?"). */
export default function ShortcutsModal({ open, onClose }: Props) {
  return (
    <FolhaOuDialogo
      aberto={open}
      onFechar={onClose}
      titulo="Atalhos de teclado"
      largura="md"
      // Acima da gaveta do pedido (50, e depois disto na árvore); era `z-[90]`
      // à mão e continua a ser.
      nivel={90}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
        {GROUPS.map((g) => (
          <div key={g.title} className={g.soTeclado ? "pointer-coarse:hidden" : undefined}>
            <p className="text-foreground/30 text-[10px] tracking-[0.25em] uppercase mb-3">
              {g.title}
            </p>
            <div className="flex flex-col gap-2">
              {g.items.map((it) => (
                <div key={it.label} className="flex items-center justify-between gap-4">
                  <span className="text-foreground/55 text-sm">{it.label}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {it.keys.map((kk) => (
                      <kbd
                        key={kk}
                        className="min-w-[22px] text-center text-[10px] text-foreground/55 bg-foreground/[0.06] border border-foreground/12 rounded px-1.5 py-1 leading-none"
                      >
                        {kk}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </FolhaOuDialogo>
  );
}
