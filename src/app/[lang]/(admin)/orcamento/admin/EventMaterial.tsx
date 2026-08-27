"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Quote } from "@/lib/orcamento/types";
import type { EventMaterial, EventMaterialItem } from "@/lib/event-material-types";
import { progresso } from "@/lib/event-material-types";
import { useToast } from "./Toast";
import { Button, PerguntaDestrutiva, SectionCard } from "./ui";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

/**
 * A CHECKLIST DE MATERIAL DESTE EVENTO.
 *
 * Gerada a partir dos essenciais de carrinha mais o que as regras implicarem da
 * proposta. Cada linha diz DE ONDE VEIO — sem isso, uma lista automática é uma
 * lista que ninguém percebe e toda a gente começa a ignorar.
 *
 * Aqui é onde se prepara. O carregamento no telemóvel, offline, é o bloco 4.
 */

interface Resposta {
  evento: EventMaterial | null;
  itens: EventMaterialItem[];
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «VOLTAR A GERAR» É O PIOR BOTÃO DESTE MÓDULO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A geração preserva o que está CARREGADO, as notas e o veículo. NÃO preserva
 * as marcações de DEVOLVIDO nem as de EM FALTA — e essas são as que se fazem no
 * regresso, com a carrinha à porta, uma a uma, a conferir o que voltou.
 *
 * O botão dizia «Voltar a gerar» e mais nada, e o convite estava por todo o
 * lado: o texto do painel a explicar que gerar junta os essenciais às regras, o
 * aviso de leitura falhada a oferecê-lo, e a própria mensagem de sucesso a
 * contar as marcações mantidas — que é o mesmo que dizer «podes carregar outra
 * vez, não custa nada».
 *
 * Custa. Por isso leva PERGUNTA — não é raro por acaso, é raro porque só se
 * volta a gerar quando a proposta mudou —, e a pergunta CONTA as marcações que
 * se vão embora, uma a uma. Um número em vez de «esta ação não pode ser
 * anulada»: quem lê «12 devoluções e 3 faltas voltam a zero» sabe o que está a
 * decidir.
 *
 * GERAR PELA PRIMEIRA VEZ não pergunta nada. Não há checklist, não há
 * marcações, não há nada a perder — e uma pergunta ali seria atrito numa tarefa
 * que não é destrutiva.
 */

/** Uma pergunta que nomeia o que se perde, e o que fazer se a resposta for sim. */
interface Pergunta {
  /** A pergunta, com o NOME da coisa lá dentro. Nunca «Tens a certeza?». */
  titulo: string;
  /** Uma linha por coisa que desaparece, cada uma com o seu número. */
  oQueSePerde: ReactNode[];
  /** A frase por baixo da lista. */
  aviso?: ReactNode;
  /** O verbo, repetido no botão: «Voltar a gerar», não «Confirmar». */
  rotulo: string;
  fazer: () => void | Promise<void>;
}

/** O que a geração NÃO preserva, contado a partir do que está no ecrã. */
function oQueAGeracaoDeita(itens: EventMaterialItem[]) {
  return {
    devolvidos: itens.filter((i) => i.returnedAt).length,
    emFalta: itens.filter((i) => i.missing).length,
    gastos: itens.filter((i) => typeof i.usedQty === "number").length,
  };
}

export default function EventMaterialPanel({ quote }: { quote: Quote }) {
  const { toast } = useToast();
  const [dados, setDados] = useState<Resposta>({ evento: null, itens: [] });
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  /**
   * O que a leitura disse quando falhou. `null` é "correu bem"; a string vazia é
   * "falhou e o servidor não explicou". São três estados e não dois, porque
   * "não há checklist" e "não consegui perguntar" NÃO são a mesma coisa — ver o
   * desenho, mais abaixo.
   */
  const [falha, setFalha] = useState<string | null>(null);
  /** A pergunta em curso — ver o comentário no topo do ficheiro. */
  const [aPerguntar, setAPerguntar] = useState<Pergunta | null>(null);

  const buscar = useCallback(async () => {
    try {
      /**
       * ══════════════════════════════════════════════════════════════════════
       * UM ERRO AQUI REBENTAVA O BACK OFFICE INTEIRO
       * ══════════════════════════════════════════════════════════════════════
       *
       * Não havia `res.ok`. Numa resposta de erro o corpo é `{ error: "…" }`,
       * portanto `dados.itens` ficava `undefined` — e a linha que conta o
       * progresso faz `itens.filter(...)`, que atira.
       *
       * Este painel é desenhado DENTRO da gaveta do pedido, por isso a excepção
       * subia até ao ecrã de erro da aplicação e substituía o back office todo.
       * Com a gaveta aberta, o preço meio escrito e as notas por gravar a irem
       * com ele.
       *
       * E os gatilhos não são exóticos: a rota devolve 401 quando a sessão
       * caduca ou quando alguém carrega em Sair noutro aparelho, e 500 se as
       * tabelas de material ainda não existirem.
       *
       * A guarda é a mesma que o ecrã da carrinha já fazia — este ficheiro era
       * a excepção. Nunca se escreve no estado o que não tem a forma certa.
       */
      const res = await fetch(`/api/orcamento/${quote.id}/material`);
      if (!res.ok) {
        // E a falha tem de CHEGAR AO ECRÃ. Ficar-se pelo `return` deixava o
        // painel a afirmar "Ainda sem checklist", com o botão de gerar ao lado,
        // sobre um evento que pode ter meia carrinha já carregada — ver o
        // desenho, mais abaixo.
        const corpo = await res.json().catch(() => null);
        setFalha(typeof corpo?.error === "string" ? corpo.error : "");
        return;
      }
      const r = await res.json();
      setDados({
        evento: r?.evento ?? null,
        itens: Array.isArray(r?.itens) ? r.itens : [],
      });
      setFalha(null);
    } catch {
      setFalha("");
    } finally {
      setCarregando(false);
    }
  }, [quote.id]);

  useEffect(() => {
    void buscar();
  }, [buscar]);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * GERAR, E UMA FRASE QUE DIZ O QUE ACONTECEU
   * ══════════════════════════════════════════════════════════════════════
   *
   * Isto falhava com «Não foi possível gerar a checklist.» para a rede em
   * baixo, a sessão expirada, o pedido apagado por outra pessoa, as listas
   * base que ainda não existem e o servidor em baixo. Quem lê carrega outra
   * vez — e com a sessão caduca isso não pode funcionar nunca.
   *
   * A frase nomeia o EVENTO porque este painel vive dentro da gaveta de um
   * pedido, e quem tem seis gavetas abertas não sabe de qual é o aviso.
   */
  /**
   * A PERGUNTA DE VOLTAR A GERAR, com as marcações contadas.
   *
   * Só se pergunta quando JÁ HÁ checklist: sem ela não há nada a deitar fora, e
   * a caixa era atrito puro. Ver o comentário no topo do ficheiro.
   */
  function gerarOuPerguntar() {
    if (!dados.evento) {
      void gerar();
      return;
    }
    const { devolvidos, emFalta, gastos } = oQueAGeracaoDeita(itens);
    const perdas = [
      devolvidos > 0 &&
        `${devolvidos} ${devolvidos === 1 ? "devolução marcada" : "devoluções marcadas"} no regresso`,
      emFalta > 0 && `${emFalta} ${emFalta === 1 ? "item marcado" : "itens marcados"} em falta`,
      gastos > 0 && `${gastos} ${gastos === 1 ? "consumo apontado" : "consumos apontados"}`,
    ].filter((x): x is string => typeof x === "string");

    setAPerguntar({
      titulo: `Voltar a gerar a checklist de «${quote.name}»?`,
      oQueSePerde: perdas,
      aviso:
        (perdas.length > 0
          ? "A geração não preserva estas marcações — voltam a zero. "
          : "Ainda não há devoluções nem faltas marcadas, por isso não se perde nenhuma. ") +
        `Os ${itens.length} ${itens.length === 1 ? "item é refeito" : "itens são refeitos"} a ` +
        `partir dos essenciais de carrinha e das regras; o que já está carregado, as notas e o ` +
        `veículo mantêm-se.`,
      rotulo: "Voltar a gerar",
      fazer: () => gerar(),
    });
  }

  async function gerar() {
    const oQue = `gerar a checklist de material de «${quote.name}»`;
    setGerando(true);
    let res: Response;
    try {
      res = await fetch(`/api/orcamento/${quote.id}/material`, { method: "POST" });
    } catch {
      setGerando(false);
      toast(porqueRebentou(oQue).mensagem, "error");
      return;
    }
    const r = await res.json().catch(() => null);
    setGerando(false);
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, r).mensagem, "error");
      return;
    }
    // A mesma regra do `buscar`: só entra no estado o que tem a forma certa.
    const itensGerados = Array.isArray(r?.itens) ? r.itens : [];
    setDados({ evento: r?.evento ?? null, itens: itensGerados });
    setFalha(null);
    /**
     * A contagem sai da lista JÁ VERIFICADA, e não de `r.itens.length`.
     *
     * Com um corpo sem `itens`, o `.length` atirava DEPOIS de o estado estar
     * escrito: o painel ficava com a checklist gerada no ecrã e, por cima
     * dela, um aviso a dizer que a geração falhou. Quem o lê carrega em
     * «Voltar a gerar» — e é isso que perde as marcações de devolvido e de
     * em falta, que a geração não preserva.
     */
    toast(
      r?.preservadas > 0
        ? `Checklist atualizada. ${r.preservadas} marcações mantidas.`
        : `Checklist gerada: ${itensGerados.length} itens.`,
      "success",
    );
  }

  const { itens } = dados;
  const p = useMemo(() => progresso(itens), [itens]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, EventMaterialItem[]>();
    for (const i of itens) {
      const lista = mapa.get(i.category) ?? [];
      lista.push(i);
      mapa.set(i.category, lista);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [itens]);

  /**
   * ── A LEITURA FALHOU E NÃO TEMOS NADA ────────────────────────────────────
   * Aqui não se desenha o painel: desenha-se a falha, e sem o botão de gerar.
   *
   * "Ainda sem checklist" é uma AFIRMAÇÃO sobre o evento, e uma leitura que não
   * chegou a acontecer não a sabe fazer. O passo seguinte que ela sugere —
   * "Gerar checklist" — é o que faz estragos: a geração só preserva o que está
   * carregado, as notas e o veículo, e as marcações de devolvido e de em falta
   * ficam para trás. Não se convida a isso a partir de um 401.
   *
   * Se já tínhamos lido a checklist e é só a releitura que falha, fica o que
   * temos: velho, mas verdadeiro.
   */
  if (!carregando && falha !== null && !dados.evento) {
    return (
      <SectionCard
        title="Material do evento"
        description="O que tem de ir na carrinha para esta montagem"
      >
        <AvisoDeFalha
          titulo="Não foi possível ler o material deste evento"
          mensagem={falha}
          aoTentarDeNovo={() => void buscar()}
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Material do evento"
      description="O que tem de ir na carrinha para esta montagem"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={gerarOuPerguntar} disabled={gerando}>
          {dados.evento ? "Voltar a gerar" : "Gerar checklist"}
        </Button>
        {dados.evento && itens.length > 0 && (
          // O carregamento faz-se no telemóvel, de pé, ao lado da carrinha —
          // não aqui. Este botão é a ponte para lá.
          <a
            href={`/orcamento/admin/carregamento/${dados.evento.id}`}
            /* `alvo-toque` porque este é um `<a>` escrito à mão: não passa pelo
               `ui/Button.tsx`, que é onde vive o piso de 44 px do dedo, e ficava
               em 32 px de altura. E é o link para o ecrã de carregamento — o
               único que se usa mesmo no telemóvel, de pé ao lado da carrinha.
               O `min-h-[32px]` fica: é a altura com rato, e os 44 do `.alvo-toque`
               (fora de camadas, de propósito) ganham-lhe sob `pointer: coarse`. */
            className="alvo-toque bo-btn-ghost inline-flex min-h-[32px] items-center rounded-xl px-3 text-xs"
          >
            Abrir para carregar
          </a>
        )}
        {dados.evento && (
          <span className="bo-text-muted text-xs">
            {p.total} {p.total === 1 ? "item" : "itens"}
            {p.criticosPorCarregar.length > 0 &&
              ` · ${p.criticosPorCarregar.length} crítico${
                p.criticosPorCarregar.length === 1 ? "" : "s"
              }`}
          </span>
        )}
        {/* ── O DESFECHO DO CARREGAMENTO CHEGA AQUI ────────────────────────
            Quem carrega está numa quinta; quem quer saber se a carrinha já
            saiu está no escritório. Este selo é o único sítio onde essa
            pergunta tem resposta — e até há pouco não tinha nenhuma, porque o
            botão que fecha o carregamento não gravava nada e o estado da
            checklist era uma coluna morta. */}
        {dados.evento?.status === "carregada" && (
          <span className="rounded-full bg-[#4d6350]/12 px-2 py-0.5 text-[11px] font-medium text-[#4d6350]">
            Carrinha carregada
          </span>
        )}
        {dados.evento?.status === "devolvida" && (
          <span className="rounded-full bg-[var(--bo-tinta-6)] px-2 py-0.5 text-[11px] font-medium text-[var(--bo-text-muted)]">
            Material devolvido
          </span>
        )}
      </div>

      {carregando ? null : !dados.evento ? (
        <p className="bo-text-muted mt-3 text-sm">
          Ainda sem checklist. Ao gerar, junta os essenciais de carrinha ao que as regras
          encontrarem nesta proposta.
        </p>
      ) : itens.length === 0 ? (
        <p className="bo-text-muted mt-3 text-sm">
          A geração não trouxe nada. Falta criar os “Essenciais de carrinha” em Material, ou o
          catálogo está vazio.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {porCategoria.map(([categoria, linhas]) => (
            <div key={categoria}>
              <p className="mb-1.5 text-[11px] tracking-[0.14em] text-[var(--bo-text-muted)] uppercase">
                {categoria}
              </p>
              <ul className="divide-y divide-[var(--bo-hairline)]">
                {linhas.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5">
                    {i.critical && (
                      <span className="text-[#8a2a22]" aria-label="crítico" title="Crítico">
                        ▲
                      </span>
                    )}
                    <span>{i.name}</span>
                    <span className="text-sm">
                      {i.qty}
                      {i.unit ? ` ${i.unit}` : ""}
                    </span>
                    {/* A coluna que responde a "porque é que isto está aqui?" */}
                    <span className="bo-text-muted ml-auto text-xs">{i.originLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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
    </SectionCard>
  );
}
