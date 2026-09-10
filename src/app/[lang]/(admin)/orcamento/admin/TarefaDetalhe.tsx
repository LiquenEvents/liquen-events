"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { AnexoDaTarefa, Subtarefa, Task, TaskPriority } from "@/lib/orcamento/types";
import { idUnico } from "@/lib/id-unico";
import { localizeHref } from "@/lib/i18n/config";
import { Button, Card, Field } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PAINEL DE DETALHE — a coluna que estava vazia (fase 08)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Metade do ecrã está vazia. A coluna de conteúdo ocupa pouco mais de metade
 * da largura, com cerca de 870 px de vazio à direita.» É o ponto 22 da
 * auditoria, e o critério de aceitação nº 7 diz o que fecha o assunto: «zero
 * espaço morto — o painel de detalhe ocupa a coluna que hoje está vazia».
 *
 * ── O QUE SE EDITA AQUI, E O QUE NÃO ──────────────────────────────────────
 *
 * Aqui vivem as três coisas que o documento manda pôr no painel e que não
 * cabem numa linha de lista: **notas, subtarefas e anexos**. Mais a ligação ao
 * evento, que é o ponto 9 («numa empresa de casamentos quase todas as tarefas
 * pertencem a um evento; sem essa ligação a lista é um bloco de notas»).
 *
 * O que NÃO se edita aqui são o prazo, o responsável, a área e a prioridade.
 * Não é esquecimento: esses quatro já têm um editor — a linha que se abre com
 * o «Editar tarefa» — e um segundo editor dos MESMOS campos ao lado do
 * primeiro é o defeito que a Parte −1 do sistema de design manda evitar por
 * escrito. O painel mostra-os, e o botão «Editar tarefa» abre o editor que já
 * existe, na linha, onde ela está habituada a vê-lo. Ficam aqui como uma
 * ficha: lêem-se sem abrir nada, que é metade do que uma ficha serve.
 *
 * ── E PORQUE É QUE OS ANEXOS SÃO LIGAÇÕES ─────────────────────────────────
 *
 * Porque não há rota de upload nenhuma neste produto (ver `AnexoDaTarefa`), e
 * inventar aqui um armazenamento era uma fase inteira disfarçada de campo. O
 * que esta casa tem e usa todos os dias são ligações — a pasta do casamento no
 * Drive, o orçamento do florista, a inspiração. É isso que o painel guarda, e é
 * isso que o rótulo promete: «Ligações», e não «Ficheiros».
 *
 * ── GRAVAR ────────────────────────────────────────────────────────────────
 *
 * Nada aqui grava sozinho. Tudo passa pelo `aoGravar` que o ecrã lhe dá — que é
 * o mesmo caminho de todas as outras escritas das Tarefas: repõe a linha se o
 * servidor recusar, e nomeia a tarefa na frase do erro. Um segundo `fetch` aqui
 * dentro era uma segunda maneira de falhar.
 *
 * As notas gravam-se ao SAIR do campo, e não a cada tecla: um `PATCH` por
 * tecla escrita são quarenta gravações por parágrafo, e cada uma delas mexe no
 * `updated_at` da tarefa — que é o que o `touch` do `tasks-store` usa para
 * detectar duas pessoas na mesma tarefa. Escrever uma nota passaria a
 * desencadear conflitos a quem estivesse do outro lado.
 */

const CaixoteIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path
      d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ROTULO_DA_PRIORIDADE: Record<TaskPriority, string> = {
  alta: "Alta",
  normal: "Normal",
  baixa: "Baixa",
};

export interface TarefaDetalheProps {
  /** A tarefa escolhida, ou `null` quando não há nenhuma. */
  tarefa: Task | null;
  /** Fecha o painel (e desfaz a escolha na lista). */
  aoFechar: () => void;
  /** Abre o editor da linha — o dos quatro campos. Ver o cabeçalho. */
  aoEditar: (t: Task) => void;
  /**
   * Grava um punhado de campos desta tarefa. Devolve `false` se o servidor
   * recusar — e nesse caso quem chama já repôs o ecrã, portanto o painel não
   * tem nada a fazer com a resposta além de não celebrar.
   */
  aoGravar: (id: string, campos: Partial<Task>, oQue: string) => Promise<boolean>;
}

export function TarefaDetalhe({ tarefa, aoFechar, aoEditar, aoGravar }: TarefaDetalheProps) {
  /* O locale sai do endereço, como no resto do back office: só o inglês leva
     prefixo (ver `localizeHref`). Sem isto, a ligação ao evento mandava uma
     sessão em inglês para uma página em português. */
  const caminho = usePathname() ?? "";
  const locale = caminho === "/en" || caminho.startsWith("/en/") ? "en" : "pt";

  if (!tarefa) {
    return (
      <Card className="text-callout text-[var(--bo-text-muted)]">
        <p className="text-headline text-[var(--bo-text)]">Detalhe</p>
        <p className="mt-2">
          Escolhe uma tarefa da lista para lhe escrever notas, partir em passos e juntar as ligações
          do evento.
        </p>
      </Card>
    );
  }

  /* `key` na identidade: cada tarefa recebe um painel seu. É o que faz o
     rascunho das notas nascer certo sem um efeito a copiar dados para estado —
     e o que dá o fade cruzado da Parte 4 sem uma linha de animação escrita à
     mão. */
  return (
    <Corpo
      key={tarefa.id}
      tarefa={tarefa}
      locale={locale}
      aoFechar={aoFechar}
      aoEditar={aoEditar}
      aoGravar={aoGravar}
    />
  );
}

function Corpo({
  tarefa,
  locale,
  aoFechar,
  aoEditar,
  aoGravar,
}: {
  tarefa: Task;
  locale: "pt" | "en";
  aoFechar: () => void;
  aoEditar: (t: Task) => void;
  aoGravar: (id: string, campos: Partial<Task>, oQue: string) => Promise<boolean>;
}) {
  const subtarefas = useMemo(() => tarefa.subtarefas ?? [], [tarefa.subtarefas]);
  const anexos = useMemo(() => tarefa.anexos ?? [], [tarefa.anexos]);

  /* ── AS NOTAS ────────────────────────────────────────────────────────────
     Rascunho local, gravado ao sair do campo. O `ref` existe para o caso que
     não passa pelo `blur`: escolher outra tarefa desmonta este painel com o
     cursor ainda dentro do campo, e sem a descarga na limpeza do efeito o
     parágrafo que ela acabou de escrever ia-se embora sem chegar a lado
     nenhum. */
  const [notas, setNotas] = useState(tarefa.notas ?? "");
  const notasRef = useRef(notas);
  const gravadoRef = useRef(tarefa.notas ?? "");
  const gravarRef = useRef(aoGravar);

  /* Os espelhos actualizam-se DEPOIS do render, num efeito sem lista de
     dependências — que é como dizer «a cada render». Escrevê-los durante o
     render parece igual e não é: o React pode desenhar um render e deitá-lo
     fora sem o mostrar, e nesse caso a ref ficava com um valor que nunca
     chegou ao ecrã. É por isso que o `react-hooks/refs` recusa, e recusou
     este ficheiro no gancho de pré-commit.

     A ordem na desmontagem é a de declaração, portanto este efeito assenta os
     valores antes de a limpeza do efeito de baixo os ir buscar. */
  useEffect(() => {
    notasRef.current = notas;
    gravarRef.current = aoGravar;
  });

  const descarregarNotas = useCallback(() => {
    const valor = notasRef.current;
    if (valor === gravadoRef.current) return;
    /* Marca-se como gravado À IDA, para dois `blur` seguidos não mandarem o
       mesmo parágrafo duas vezes — e DESMARCA-SE se o servidor recusar. Sem a
       segunda metade, uma gravação falhada deixava a nota com aspecto de
       guardada: o aviso dizia que não tinha ido, e o `blur` seguinte não a
       tentava outra vez porque «já estava». */
    const anterior = gravadoRef.current;
    gravadoRef.current = valor;
    void gravarRef
      .current(tarefa.id, { notas: valor }, `guardar as notas de «${tarefa.title}»`)
      .then((ok) => {
        if (!ok) gravadoRef.current = anterior;
      });
  }, [tarefa.id, tarefa.title]);

  useEffect(() => descarregarNotas, [descarregarNotas]);

  const gravarSubtarefas = (lista: Subtarefa[], oQue: string) =>
    void aoGravar(tarefa.id, { subtarefas: lista }, oQue);

  const gravarAnexos = (lista: AnexoDaTarefa[], oQue: string) =>
    void aoGravar(tarefa.id, { anexos: lista }, oQue);

  const feitas = subtarefas.filter((s) => s.feita).length;

  return (
    <Card className="bo-entrada">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="bo-eyebrow">{tarefa.done ? "Concluída" : "Por fazer"}</p>
          {/* `break-words` e não `truncate`: o painel é o sítio onde o título
              INTEIRO se lê, e é metade da razão de ele existir — na linha ele
              corta aos 40 caracteres. */}
          <h2 className="mt-0.5 text-title3 break-words text-[var(--bo-text)]">{tarefa.title}</h2>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar o detalhe"
          className={`alvo-toque -me-2 -mt-2 flex shrink-0 items-center justify-center rounded-lg p-2 text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* ── A FICHA ──────────────────────────────────────────────────────────
          Uma `<dl>` e não uma grelha de `div`: são pares nome/valor, e é assim
          que quem ouve o ecrã os recebe emparelhados em vez de como oito
          pedaços de texto seguidos. */}
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-callout">
        <Linha nome="Quando">
          {tarefa.dueDate ? (
            <span className="tabular-nums">{porExtenso(tarefa.dueDate)}</span>
          ) : (
            <span className="text-[var(--bo-text-faint)]">Sem prazo</span>
          )}
        </Linha>
        <Linha nome="Quem">
          {tarefa.assignee || <span className="text-[var(--bo-text-faint)]">Sem responsável</span>}
        </Linha>
        <Linha nome="Área">
          {tarefa.area || <span className="text-[var(--bo-text-faint)]">Sem área</span>}
        </Linha>
        <Linha nome="Prioridade">{ROTULO_DA_PRIORIDADE[tarefa.priority]}</Linha>
        <Linha nome="Evento">
          {tarefa.quoteId ? (
            /* ── A LIGAÇÃO AO EVENTO (ponto 9 da auditoria) ────────────────
               O nome do cliente deixa de ser texto e passa a porta: abre o
               dossier do evento, que é onde estão a data, o local e o resto
               das tarefas dele. Sem `quoteId` não há para onde ir — a tarefa
               tem um nome escrito à mão e mais nada —, e aí fica o nome. */
            <a
              href={localizeHref(`/orcamento/admin/evento/${tarefa.quoteId}`, locale)}
              className={`text-[var(--bo-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid ${ESTADO}`}
            >
              {tarefa.clientName || "Abrir o evento"}
            </a>
          ) : (
            tarefa.clientName || <span className="text-[var(--bo-text-faint)]">Sem evento</span>
          )}
        </Linha>
      </dl>

      <div className="mt-3">
        <Button size="sm" variant="subtle" onClick={() => aoEditar(tarefa)}>
          Editar tarefa
        </Button>
      </div>

      {/* ── NOTAS ────────────────────────────────────────────────────────── */}
      <div className="mt-5">
        <Field
          as="textarea"
          label="Notas"
          rows={4}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          onBlur={descarregarNotas}
          placeholder="Ex.: o Miguel leva as jarras na sexta"
          hint="Guarda-se ao sair do campo."
        />
      </div>

      {/* ── SUBTAREFAS ───────────────────────────────────────────────────── */}
      <section className="mt-5" aria-labelledby={`subtarefas-${tarefa.id}`}>
        <p className="bo-eyebrow" id={`subtarefas-${tarefa.id}`}>
          Subtarefas
          {subtarefas.length > 0 && (
            <span className="ms-1.5 tabular-nums text-[var(--bo-text-faint)]">
              {feitas}/{subtarefas.length}
            </span>
          )}
        </p>
        <ul role="list" className="mt-2 space-y-0.5">
          {subtarefas.map((s) => (
            <li key={s.id} className="group flex items-center gap-2">
              <label
                className={`alvo-toque -m-1.5 flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg p-1.5 hover:bg-[var(--bo-tinta-3)] ${ESTADO}`}
              >
                <input
                  type="checkbox"
                  checked={s.feita}
                  /* «Subtarefa: » à frente do título de propósito. Duas coisas
                     com o MESMO nome acessível na mesma página mandam quem
                     ouve o ecrã adivinhar de qual se trata — e uma subtarefa
                     chamada como a tarefa que a contém é o caso mais provável
                     de todos («Confirmar florista» dentro de «Confirmar
                     florista»). */
                  aria-label={`Subtarefa: ${s.titulo}`}
                  onChange={() =>
                    gravarSubtarefas(
                      subtarefas.map((x) => (x.id === s.id ? { ...x, feita: !x.feita } : x)),
                      `${s.feita ? "reabrir" : "dar por feito"} «${s.titulo}»`,
                    )
                  }
                  className="h-[18px] w-[18px] shrink-0 accent-[var(--bo-accent)]"
                />
                <span
                  className={`min-w-0 break-words text-callout ${
                    s.feita
                      ? "text-[var(--bo-text-faint)] line-through"
                      : "text-[var(--bo-tinta-72)]"
                  }`}
                >
                  {s.titulo}
                </span>
              </label>
              <button
                type="button"
                aria-label={`Remover a subtarefa «${s.titulo}»`}
                onClick={() =>
                  gravarSubtarefas(
                    subtarefas.filter((x) => x.id !== s.id),
                    `remover «${s.titulo}»`,
                  )
                }
                className={`alvo-toque shrink-0 rounded-lg p-1.5 text-[var(--bo-text-muted)] hover:text-[var(--bo-perigo)] ${ESTADO} ${PRESSAO}`}
              >
                {CaixoteIcon}
              </button>
            </li>
          ))}
        </ul>
        <LinhaQueJunta
          rotulo="Nova subtarefa"
          marcador="Ex.: pedir orçamento"
          aoJuntar={(titulo) =>
            gravarSubtarefas(
              [...subtarefas, { id: idUnico(), titulo, feita: false }],
              `juntar «${titulo}»`,
            )
          }
        />
      </section>

      {/* ── ANEXOS ───────────────────────────────────────────────────────── */}
      <section className="mt-5" aria-labelledby={`anexos-${tarefa.id}`}>
        <p className="bo-eyebrow" id={`anexos-${tarefa.id}`}>
          Ligações
        </p>
        <ul role="list" className="mt-2 space-y-0.5">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`min-w-0 flex-1 truncate py-1.5 text-callout text-[var(--bo-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid ${ESTADO}`}
                title={a.url}
              >
                {a.nome}
              </a>
              <button
                type="button"
                aria-label={`Remover a ligação «${a.nome}»`}
                onClick={() =>
                  gravarAnexos(
                    anexos.filter((x) => x.id !== a.id),
                    `remover a ligação «${a.nome}»`,
                  )
                }
                className={`alvo-toque shrink-0 rounded-lg p-1.5 text-[var(--bo-text-muted)] hover:text-[var(--bo-perigo)] ${ESTADO} ${PRESSAO}`}
              >
                {CaixoteIcon}
              </button>
            </li>
          ))}
        </ul>
        <LinhaQueJunta
          rotulo="Nova ligação"
          marcador="https://…"
          /* A mesma peneira do servidor, à frente dela: o `anexoDaTarefaSchema`
             recusa tudo o que não seja `http(s)` — e um 400 a chegar meio
             segundo depois não diz onde está o erro tão bem como a linha por
             baixo do campo. */
          validar={(v) =>
            /^https?:\/\/\S+$/i.test(v) ? null : "A ligação tem de começar por https://"
          }
          aoJuntar={(url) =>
            gravarAnexos(
              [...anexos, { id: idUnico(), nome: nomeDaLigacao(url), url }],
              "juntar a ligação",
            )
          }
        />
      </section>
    </Card>
  );
}

function Linha({ nome, children }: { nome: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[var(--bo-text-muted)]">{nome}</dt>
      <dd className="min-w-0 break-words text-[var(--bo-tinta-72)]">{children}</dd>
    </>
  );
}

/**
 * A linha que junta mais um — a mesma forma das subtarefas e das ligações.
 *
 * `Enter` junta e o campo fica aberto para o seguinte, como na linha de
 * escrever da lista: quem parte uma tarefa em passos escreve-os em rajada.
 */
function LinhaQueJunta({
  rotulo,
  marcador,
  aoJuntar,
  validar,
}: {
  rotulo: string;
  marcador: string;
  aoJuntar: (valor: string) => void;
  validar?: (valor: string) => string | null;
}) {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const juntar = () => {
    const limpo = valor.trim();
    if (!limpo) return;
    const problema = validar?.(limpo) ?? null;
    setErro(problema);
    if (problema) return;
    aoJuntar(limpo);
    setValor("");
  };

  return (
    <div className="mt-2">
      <Field
        label={rotulo}
        hideLabel
        value={valor}
        error={erro}
        onChange={(e) => {
          setValor(e.target.value);
          if (erro) setErro(null);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          juntar();
        }}
        placeholder={marcador}
        className="text-callout"
      />
    </div>
  );
}

/** O nome de uma ligação, quando ela chega sem nome: o domínio. */
function nomeDaLigacao(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** «11 set» / «11 set 27» — o mesmo formato curto da linha da lista. */
function porExtenso(prazo: string): string {
  const dia = prazo.slice(0, 10);
  const d = new Date(`${dia}T12:00:00`);
  if (Number.isNaN(d.getTime())) return prazo;
  const curto = d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
  const ano = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  // A hora só aparece quando existe — o `dueDate` guarda-a com um «T» pelo
  // meio quando a linguagem natural a leu (ver `add`, no `Tarefas.tsx`).
  const hora = prazo.length > 10 ? `, ${prazo.slice(11, 16).replace(":", "h")}` : "";
  return `${curto}${ano}${hora}`;
}
