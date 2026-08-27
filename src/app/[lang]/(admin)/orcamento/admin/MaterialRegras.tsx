"use client";

import { useState, type ReactNode } from "react";
import type { MaterialItem } from "@/lib/material-types";
import type { MaterialList, MaterialListItem } from "@/lib/material-list-types";
import type { MaterialRule, MatchKind } from "@/lib/material-rules";
import { useToast } from "./Toast";
import { Button, EmptyState, Field, PerguntaDestrutiva } from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

/**
 * AS REGRAS — o que a proposta implica em material.
 *
 * Escritas em linguagem corrente: "Quando a proposta disser *arco floral* →
 * acrescenta a lista *Estrutura e fixação*". Uma condição por regra, sem E/OU:
 * duas condições fazem-se com duas regras, e a checklist mostra qual disparou.
 */

const TIPO_LABEL: Record<MatchKind, string> = {
  sempre: "Em todos os eventos",
  servico: "Quando a proposta tiver o serviço…",
  texto: "Quando a proposta disser…",
  pax: "A partir de N convidados",
};

interface Listas {
  listas: MaterialList[];
  /** As linhas de TODAS as listas. Vêm na mesma resposta, e são elas que dão o
   *  número à pergunta de apagar uma regra: «a lista X (7 linhas)». */
  linhas: MaterialListItem[];
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * APAGAR UMA REGRA PERGUNTA; DESLIGAR NÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Apagar uma regra é raro e é caro: o que se perde é a condição escrita à mão
 * («quando a proposta disser arco floral»), e não há nada neste ecrã que a
 * traga de volta. Por isso leva PERGUNTA, e a pergunta diz o que a regra
 * deixa de acrescentar — com o número, porque «a lista Estrutura e fixação» e
 * «a lista Estrutura e fixação (7 linhas)» não pesam o mesmo a quem decide.
 *
 * DESLIGAR continua a não perguntar nada, e é de propósito: é o gesto barato,
 * reversível no mesmo botão, e é a alternativa que a própria pergunta oferece.
 * Pôr uma caixa à frente dele era empurrar quem está a experimentar regras para
 * o botão que apaga.
 */

/** Uma pergunta que nomeia o que se perde, e o que fazer se a resposta for sim. */
interface Pergunta {
  /** A pergunta, com o NOME da coisa lá dentro. Nunca «Tens a certeza?». */
  titulo: string;
  /** Uma linha por coisa que desaparece, cada uma com o seu número. */
  oQueSePerde: ReactNode[];
  /** A frase por baixo da lista. */
  aviso?: ReactNode;
  /** O verbo, repetido no botão: «Apagar a regra», não «Confirmar». */
  rotulo: string;
  fazer: () => void | Promise<void>;
}

/** Gravou-se, mas o ecrã ficou a mostrar a versão anterior. Dizer as duas
 *  coisas: o silêncio aqui é o que faz alguém repetir a alteração. */
const AVISO_RELEITURA = "Gravado, mas não foi possível reler as regras. Atualiza a página.";

export default function MaterialRegras() {
  const { toast } = useToast();
  const {
    data: regras = [],
    setData: setRegras,
    error,
    errorMessage,
    refresh,
  } = useCachedList<MaterialRule[]>("material-regras", "/api/material/regras");
  const { data: dados } = useCachedList<Listas>("material-listas", "/api/material/listas");
  const { data: catalogo = [] } = useCachedList<MaterialItem[]>("material", "/api/material");
  const listas = dados?.listas ?? [];
  const linhas = dados?.linhas ?? [];

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<MatchKind>("servico");
  const [valor, setValor] = useState("");
  const [acao, setAcao] = useState<"add_list" | "add_item">("add_list");
  const [listaId, setListaId] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [ocupado, setOcupado] = useState(false);
  /** A pergunta em curso — ver o comentário no topo do ficheiro. */
  const [aPerguntar, setAPerguntar] = useState<Pergunta | null>(null);

  /**
   * Relê as regras. `false` quando a leitura falhou — e aí não escreve nada.
   *
   * Isto era um `.then((r) => r.json())` sem `res.ok`. O corpo de um 401 (a
   * sessão caduca sozinha, e basta caducar entre gravar e reler) é
   * `{ error: "…" }` — um objecto, que entrava no estado no lugar do array. A
   * linha `regras.map(...)` mais abaixo atirava, e como este ecrã é desenhado
   * dentro do back office a excepção levava o back office todo.
   *
   * O `setRegras` escreve através para a cache do `useCachedList`, portanto o
   * objecto de erro nem sequer desaparecia ao mudar de separador.
   */
  async function recarregar(): Promise<boolean> {
    try {
      const res = await fetch("/api/material/regras");
      if (!res.ok) return false;
      const lista = await res.json();
      if (!Array.isArray(lista)) return false;
      setRegras(lista);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ══════════════════════════════════════════════════════════════════════
   * UMA GRAVAÇÃO, E UMA FRASE QUE DIZ O QUE ACONTECEU
   * ══════════════════════════════════════════════════════════════════════
   *
   * As três escritas deste ficheiro diziam «Não foi possível criar a regra.»,
   * «Não foi possível guardar.» e «Não foi possível apagar.» — três frases
   * para seis situações com respostas diferentes: a rede em baixo, a sessão
   * expirada, a regra apagada por outra pessoa, o nome repetido, o servidor em
   * baixo. Nenhuma delas dizia DE QUE REGRA se estava a falar, e este ecrã
   * mostra dez de uma vez.
   *
   * Agora há um sítio só a fazer fetch e a escolher a frase, como no
   * `MaterialListas`. Devolve `ok` em vez de atirar, porque quem chama tem de
   * poder decidir o que faz a seguir.
   */
  async function gravar(oQue: string, url: string, init?: RequestInit): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return false;
    }
    const corpo = await res.json().catch(() => null);
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
      return false;
    }
    return true;
  }

  async function criar() {
    const comoSeChama = nome.trim();
    setOcupado(true);
    const ok = await gravar(`criar a regra «${comoSeChama}»`, "/api/material/regras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: comoSeChama,
        matchKind: tipo,
        matchValue: valor.trim(),
        action: acao,
        listId: acao === "add_list" ? listaId : undefined,
        itemId: acao === "add_item" ? itemId : undefined,
        qty: acao === "add_item" ? Number(qty) || 1 : undefined,
      }),
    });
    setOcupado(false);
    if (!ok) return;
    setNome("");
    setValor("");
    toast("Regra criada.", "success");
    if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
  }

  async function alternar(regra: MaterialRule) {
    // Desligar em vez de apagar: deixa experimentar sem perder o que se
    // escreveu, que é o gesto mais útil quando se está a afinar regras.
    const ok = await gravar(
      `${regra.enabled ? "desligar" : "ligar"} a regra «${regra.name}»`,
      `/api/material/regras/${regra.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !regra.enabled }),
      },
    );
    if (!ok) return;
    if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
  }

  /**
   * O QUE ESTA REGRA DEIXA DE FAZER, em palavras e com o número.
   *
   * Uma regra não «apaga dados»: apaga um automatismo. O que se perde só se
   * percebe pelo que ela acrescentava, e é isso que esta frase diz — a lista
   * (com quantas linhas tem) ou o item (com quantos).
   */
  function oQueEstaRegraAcrescenta(r: MaterialRule): string {
    if (r.action === "add_list") {
      const lista = listas.find((l) => l.id === r.listId);
      if (!lista) return "a lista que ela acrescentava já não existe";
      const quantas = linhas.filter((l) => l.listId === lista.id).length;
      return `a lista «${lista.name}» (${quantas} ${
        quantas === 1 ? "linha" : "linhas"
      }) deixa de entrar nas checklists novas`;
    }
    const item = catalogo.find((i) => i.id === r.itemId);
    if (!item) return "o item que ela acrescentava já não existe no catálogo";
    return `${r.qty ?? 1} × «${item.name}» deixa de entrar nas checklists novas`;
  }

  /** A pergunta de apagar uma regra — e a saída barata, escrita na própria frase. */
  function perguntarSeApaga(regra: MaterialRule) {
    setAPerguntar({
      titulo: `Apagar a regra «${regra.name}»?`,
      oQueSePerde: [
        oQueEstaRegraAcrescenta(regra),
        `a condição escrita à mão: ${TIPO_LABEL[regra.matchKind].toLowerCase()}${
          regra.matchValue ? ` “${regra.matchValue}”` : ""
        }`,
      ],
      aviso:
        "As checklists já geradas não mudam. Se for só para a experimentar sem ela, «Desligar» " +
        "guarda a regra e pode voltar atrás.",
      rotulo: "Apagar a regra",
      fazer: () => apagar(regra),
    });
  }

  async function apagar(regra: MaterialRule) {
    const ok = await gravar(`apagar a regra «${regra.name}»`, `/api/material/regras/${regra.id}`, {
      method: "DELETE",
    });
    if (!ok) return;
    toast("Regra apagada.", "success");
    if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
  }

  const alvo = (r: MaterialRule) =>
    r.action === "add_list"
      ? (listas.find((l) => l.id === r.listId)?.name ?? "(lista apagada)")
      : (catalogo.find((i) => i.id === r.itemId)?.name ?? "(item apagado)");

  // A falha primeiro, e SEM o formulário: criar uma regra contra uma tabela
  // que não existe só produzia um segundo erro, este sem explicação nenhuma.
  if (error && regras.length === 0) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler as regras"
        mensagem={errorMessage}
        aoTentarDeNovo={refresh}
      />
    );
  }

  return (
    <div>
      <div className="rounded-xl border border-[var(--bo-hairline-strong)] p-4">
        <p className="mb-3 text-sm font-medium">Regra nova</p>
        {/* O `Field` desenha o controlo a partir das propriedades. Um `<input>`
            ou `<select>` passado por DENTRO ia parar aos filhos de um elemento
            vazio e o React abortava o ecrã todo. Ver `ui/Field`. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Nome (para ti)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Arco floral leva estrutura"
          />
          <Field
            as="select"
            label="Quando"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as MatchKind)}
          >
            {(Object.keys(TIPO_LABEL) as MatchKind[]).map((k) => (
              <option key={k} value={k}>
                {TIPO_LABEL[k]}
              </option>
            ))}
          </Field>
          {tipo !== "sempre" && (
            <Field
              label={tipo === "pax" ? "Número de convidados" : "Palavras a procurar"}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode={tipo === "pax" ? "numeric" : "text"}
              placeholder={tipo === "pax" ? "100" : "arco floral"}
            />
          )}
          <Field
            as="select"
            label="Então acrescenta"
            value={acao}
            onChange={(e) => setAcao(e.target.value as "add_list" | "add_item")}
          >
            <option value="add_list">Uma lista inteira</option>
            <option value="add_item">Um item</option>
          </Field>
          {acao === "add_list" ? (
            <Field
              as="select"
              label="Lista"
              value={listaId}
              onChange={(e) => setListaId(e.target.value)}
            >
              <option value="">Escolher…</option>
              {listas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Field>
          ) : (
            <>
              <Field
                as="select"
                label="Item"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              >
                <option value="">Escolher…</option>
                {catalogo.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Field>
              <Field
                label="Quantos"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </>
          )}
        </div>
        <div className="mt-3">
          <Button size="sm" onClick={criar} disabled={ocupado || !nome.trim()}>
            Criar regra
          </Button>
        </div>
      </div>

      {regras.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Sem regras"
            description="As regras acrescentam material a partir do que a proposta diz. Sem elas, a checklist leva só os essenciais de carrinha."
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--bo-hairline)]">
          {regras.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
              <span className={r.enabled ? "font-medium" : "font-medium opacity-45"}>{r.name}</span>
              <span className="bo-text-muted text-xs">
                {TIPO_LABEL[r.matchKind]}
                {r.matchValue ? ` “${r.matchValue}”` : ""} → {alvo(r)}
              </span>
              {!r.enabled && (
                <span className="rounded bg-[var(--bo-tinta-10)] px-1.5 text-[10px] tracking-wide uppercase">
                  desligada
                </span>
              )}
              <span className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => alternar(r)}>
                  {r.enabled ? "Desligar" : "Ligar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => perguntarSeApaga(r)}>
                  Apagar
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* ── A PERGUNTA É A DA CASA ────────────────────────────────────────
          `ui/PerguntaDestrutiva`: folha inferior no telemóvel (ao pé do
          polegar), diálogo centrado no computador, e o verbo repetido no botão
          em vez de «OK». Um `confirm()` do browser não cabe em 375 px, não se
          traduz e não leva uma lista de números lá dentro — que é a única
          coisa que faz a pergunta valer a pena. */}
      <PerguntaDestrutiva
        aberto={!!aPerguntar}
        onFechar={() => setAPerguntar(null)}
        titulo={aPerguntar?.titulo ?? ""}
        oQueSePerde={aPerguntar?.oQueSePerde}
        aviso={aPerguntar?.aviso}
        rotuloConfirmar={aPerguntar?.rotulo ?? ""}
        // Fecha PRIMEIRO e só depois age, em vez de esperar pela resposta com a
        // caixa aberta: estes ecrãs são optimistas — tiram a linha logo e
        // repõem-na se o servidor recusar — e uma caixa a rodar por cima deles
        // atrasaria um gesto que hoje é instantâneo, e impedia dois seguidos.
        onConfirmar={() => {
          const escolhido = aPerguntar;
          setAPerguntar(null);
          void escolhido?.fazer();
        }}
      />
    </div>
  );
}
