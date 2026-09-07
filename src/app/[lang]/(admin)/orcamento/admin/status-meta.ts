/**
 * UMA LINHA MÁ NÃO PODE DERRUBAR O ECRÃ TODO.
 *
 * Quase todos os ecrãs do back office pintam uma etiqueta indexando um mapa com
 * o valor da própria linha — `STATUS_META[q.status].color`. Isso dá `undefined`
 * assim que aparece um valor fora do mapa, e como estes são componentes de
 * cliente o erro sobe ao limite de erro e substitui o BACK OFFICE INTEIRO pelo
 * ecrã "Ocorreu um erro inesperado" — não só aquela linha, não só aquele ecrã.
 *
 * Foi mesmo assim que se perdeu o back office numa medição: uma proposta
 * gravada como `recusada` em vez de `rejeitada` (o mapa usa a segunda e mostra
 * "Recusada" como rótulo — a troca é fácil de fazer à mão). Encontrou-se depois
 * a mesma forma em sete ecrãs.
 *
 * As APIs validam os valores, portanto pelo uso normal isto não acontece.
 * Acontece com uma linha antiga, uma migração, ou uma correcção feita
 * directamente na base de dados — que é exactamente quando ela menos pode
 * dar-se ao luxo de perder o ecrã.
 *
 * A escolha aqui é deliberada: **mostrar o valor cru em cinzento** em vez de
 * inventar um rótulo bonito ou esconder a linha. Ela vê que aquela linha tem
 * algo estranho, sabe qual é, e continua a trabalhar.
 */

export interface StatusMeta {
  label: string;
  color: string;
}

/** Cinzento neutro — o mesmo que os mapas já usam para o estado mais apagado. */
export const UNKNOWN_STATUS_COLOR = "#8a8a82";

/**
 * Lê o mapa de estados sem rebentar com um valor desconhecido.
 *
 * Usar SEMPRE que a chave venha dos dados (`q.status`, `t.priority`, …). Para
 * chaves vindas de uma constante do próprio ficheiro (por exemplo iterar
 * `Object.keys(STATUS_META)` ou uma lista fixa de filtros) o acesso directo é
 * seguro e continua a ser o mais claro.
 */
export function metaFor<T extends StatusMeta>(map: Record<string, T>, key: string): T | StatusMeta {
  return map[key] ?? { label: key || "—", color: UNKNOWN_STATUS_COLOR };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COR DE PREENCHER NÃO É A COR DE ESCREVER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A paleta de estados desta casa serve duas coisas ao mesmo tempo: pinta pontos,
 * barras e fundos de crachá — e ESCREVE o rótulo lá dentro. Para a primeira
 * função os valores estão certos; para a segunda não chegam.
 *
 * MEDIDO no browser, a 1280, pela varredura de contraste dos onze destinos
 * (`e2e/contraste-do-back-office.spec.ts`), com a fórmula da norma e o fundo
 * composto:
 *
 *     «Normal»       #9aa36a sobre #9aa36a22      2,40:1
 *     «Novo»         #8a8a82 sobre #8a8a8218      3,16:1
 *     «0%»           #8a8a82 sobre branco         3,48:1
 *     «Consumível»   #8a6d2f sobre #f6efe1        4,26:1
 *
 * A norma pede 4,5:1. Quatro rótulos que ela lê todos os dias — a prioridade de
 * uma tarefa, o estado de um pedido, a taxa de conversão, o tipo de material —
 * estavam abaixo, e o pior deles a menos de metade.
 *
 * ── PORQUE NÃO SE ESCURECE A PALETA TODA ─────────────────────────────────
 *
 * Porque estaria errado. Estes três valores aparecem em ~20 ficheiros, e mais
 * de metade das utilizações são preenchimentos: o ponto do calendário, a barra
 * do funil (`bg-[#8a8a82]/60`), o fundo do aviso (`bg-[#f6efe1]`). Aí a cor
 * clara é a certa, e escurecê-la era estragar o que está bem para corrigir o
 * que está mal.
 *
 * É a mesma separação da escada de tinta do `globals.css`, onde os degraus de
 * risco e de fundo são outros que não os de texto. Aqui: a paleta continua a
 * ser a paleta, e ESCREVER passa a ter o seu degrau.
 *
 * Os valores abaixo são a mesma cor, escurecida em espaço linear até passar —
 * o tom mantém-se, e ficam todos no primeiro valor que chega aos 4,5:1, para
 * não escurecerem mais do que o necessário. O `#9aa36a` serve dois fundos
 * diferentes e leva o valor do PIOR deles.
 *
 * ── A SEGUNDA VOLTA: A TABELA ESTAVA CERTA E CURTA ───────────────────────
 *
 * Três cores não eram as três cores da paleta — eram as três que a lista
 * ESCRITA À MÃO do `contraste-dos-rotulos.test.ts` calhou de visitar. O padrão
 * do crachá (`background: ${cor}<alfa>` com `color: cor`) aparece em nove
 * ficheiros, e a lista tinha cinco entradas. Medido sobre o fundo composto de
 * cada um:
 *
 *     «Enviada»              #9aa36a sobre #9aa36a1f      2,43:1   Propostas
 *     «Em negociação»        #7d8a55 sobre #7d8a551f      3,27:1   Propostas
 *     «Gerada, por enviar»   #a9781f sobre #a9781f1f      3,40:1   Propostas
 *     crachá âmbar           #b5894a sobre #b5894a1f      2,81:1   Agenda
 *     crachá azul            #7a8caa sobre #7a8caa1f      3,01:1   Agenda
 *     «Confirmado»           #7c854b sobre #7c854b1f      3,45:1   Produção
 *
 * E o mais revelador: o `#8a8a82`, que JÁ ESTAVA corrigido e JÁ ESTAVA a ser
 * testado, media 4,40:1 no `#8a8a821f` do plano de produção — porque esse sítio
 * não constava da lista. A cor tinha sido curada; o sítio é que não tinha sido
 * visitado. Uma lista à mão de sítios envelhece exactamente como o número à mão
 * num comentário: ninguém a revisita quando acrescenta um crachá.
 *
 * Por isso o degrau deixou de ser calculado contra os fundos que alguém se
 * lembrou de escrever e passa a ser calculado contra o PIOR fundo que a casa
 * usa — o próprio tom no alfa mais escuro que existe no código (`0x22`) — e o
 * teste varre a fonte à procura de cores e de alfas em vez de os ter em lista.
 * Um crachá novo, ou um alfa novo, entra na conta sozinho.
 */
const TEXTO_LEGIVEL: Record<string, string> = {
  "#9aa36a": "#6c724a", // 2,40:1 → 4,53:1
  "#8a8a82": "#6d6d67", // 3,03:1 → 4,54:1  (era #707069, e dava 4,40 no `1f`)
  "#8a6d2f": "#84692d", // 4,12:1 → 4,55:1
  "#7c854b": "#69703f", // 3,40:1 → 4,53:1
  "#b5894a": "#8a6736", // 2,77:1 → 4,52:1
  "#a9781f": "#8e6418", // 3,34:1 → 4,52:1
  "#7d8a55": "#677145", // 3,23:1 → 4,52:1
  "#7a8caa": "#606e86", // 2,98:1 → 4,50:1
};

/**
 * A cor com que se ESCREVE um rótulo desta paleta.
 *
 * Uma cor que não esteja na tabela volta como veio — as outras da paleta já
 * passam a norma, e `contraste-dos-rotulos.test.ts` é que garante que assim
 * continua. Assim uma cor nova nunca fica INVISÍVEL por esquecimento: fica
 * como estava, e o teste é que dá pela falta.
 */
export function corDeTexto(cor: string): string {
  return TEXTO_LEGIVEL[cor.toLowerCase()] ?? cor;
}
