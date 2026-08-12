/**
 * Termos & Condições padrão da Líquen Events — texto do "contrato" que o cliente
 * aceita ao confirmar uma proposta pelo link público.
 *
 * Client-safe DE PROPÓSITO: NÃO importa `server-only` nem o store. O componente
 * de resposta ("use client") value-importa `DEFAULT_TERMS` para os mostrar, e o
 * endpoint do servidor usa `termsToPlainText` para congelar um snapshot no
 * momento da aceitação. Sempre que o texto mudar de forma materialmente
 * relevante, incremente `TERMS_VERSION` — as aceitações antigas guardam a versão
 * e o snapshot que viram, por isso ficam intactas.
 */

/**
 * Versão dos termos. Incrementar quando o texto muda de forma relevante.
 *
 * 2026-08 — o ponto 3 passou a dizer sobre QUE valor o sinal é calculado. Ver
 * a nota do ponto 3: o texto anterior deixava a pergunta em aberto e a resposta
 * que o livro dava (o total COM IVA) era a mais cara das duas.
 */
export const TERMS_VERSION = "2026-08";

export interface TermsSection {
  heading: string;
  body: string;
}

/**
 * Boilerplate profissional para um estúdio de decoração de eventos premium
 * (Líquen Events, Portugal). Conciso mas completo — pensado para ser
 * lido, não para intimidar.
 */
export const DEFAULT_TERMS: TermsSection[] = [
  {
    heading: "1. Objeto",
    body: "Estas condições regem a prestação de serviços de conceção, produção e montagem de decoração de eventos pela Líquen Events (“Estúdio”) ao cliente identificado na proposta associada. A proposta aceite — com os seus itens, quantidades e valores — é parte integrante deste contrato.",
  },
  {
    heading: "2. Orçamento e validade",
    body: "Aos valores apresentados acresce o IVA à taxa legal em vigor. Os valores mantêm-se válidos até à data de validade indicada na proposta. Após essa data, o Estúdio poderá rever preços em função da disponibilidade de materiais e fornecedores. Alterações de âmbito solicitadas pelo cliente podem originar um ajuste de orçamento, sempre acordado por escrito antes da execução.",
  },
  {
    /**
     * ── SOBRE QUE VALOR É O SINAL ──────────────────────────────────────────
     *
     * Este ponto dizia «um sinal de 30% do valor total» e mais nada. Duas
     * linhas acima, o ponto 2 diz que «aos valores apresentados acresce o
     * IVA» — de modo que «valor total» tanto podia ser a base como o valor com
     * IVA, e as duas leituras dão números diferentes: numa proposta de
     * 2.460,00 € + IVA, 738,00 € ou 907,74 €.
     *
     * O sistema sempre emitiu a factura do sinal sobre o valor COM IVA
     * (`splitSinal(proposal.total, …)`, e `Proposal.total` é o bruto — ver
     * `resolveProposalMoney`). O contrato é que não o dizia, e era o contrato
     * que o casal assinava. Fica dito, com a mesma palavra que o PDF da
     * proposta usa no faseamento («total a pagar»), para as duas folhas se
     * lerem uma à outra.
     */
    heading: "3. Pagamento",
    body: "A reserva da data fica confirmada com o pagamento de um sinal de 30% do total a pagar — o valor final da proposta, com IVA incluído —, devido no momento da aceitação da proposta. O restante 70%, calculado sobre a mesma base, é liquidado até 1 mês antes da data do evento. A não liquidação do saldo dentro do prazo poderá implicar a suspensão dos preparativos, sem prejuízo dos valores já pagos.",
  },
  {
    heading: "4. Cancelamento e alterações",
    body: "O sinal de 30% destina-se a garantir a reserva da data e não é reembolsável em caso de cancelamento por parte do cliente. Em caso de cancelamento efetuado entre o 30.º dia anterior e até às 14h do 8.º dia útil anterior à data do evento, o Estúdio tem direito a receber 70% do valor total estipulado, acrescido de IVA; após esse momento, tem direito ao valor total estipulado, acrescido de IVA. A denúncia só é válida se efetuada por escrito, por email, valendo a data e a hora de receção do mesmo. Alterações de data ficam sujeitas à disponibilidade do Estúdio e à confirmação dos fornecedores envolvidos.",
  },
  {
    heading: "5. Responsabilidades das partes",
    body: "O Estúdio compromete-se a executar a decoração com o cuidado e o padrão de qualidade acordados, cumprindo os prazos de montagem e desmontagem combinados. O cliente compromete-se a garantir o acesso atempado ao espaço, as condições necessárias à montagem e o cumprimento das normas do local. O Estúdio não se responsabiliza por atrasos ou impedimentos imputáveis ao espaço, a terceiros ou ao próprio cliente.",
  },
  {
    heading: "6. Materiais e adereços",
    body: "Salvo indicação expressa em contrário, todos os materiais, estruturas e adereços utilizados são propriedade da Líquen Events e são cedidos apenas em regime de aluguer para o evento. Danos, extravios ou perdas causados a estes bens durante o período de cedência são da responsabilidade do cliente, sendo faturados ao valor de reposição.",
  },
  {
    heading: "7. Força maior",
    body: "Nenhuma das partes será responsável pelo incumprimento resultante de circunstâncias imprevisíveis e alheias à sua vontade (fenómenos naturais, restrições legais, indisponibilidade grave de fornecedores, entre outras). Nessas situações, as partes procurarão de boa-fé reagendar o evento ou encontrar uma solução equitativa.",
  },
  {
    heading: "8. Proteção de dados (RGPD)",
    body: "Os dados pessoais do cliente são tratados exclusivamente para a gestão da proposta, do evento e das obrigações legais e fiscais associadas, ao abrigo do Regulamento Geral sobre a Proteção de Dados. Não são cedidos a terceiros para fins de marketing. O cliente pode exercer os direitos de acesso, retificação e eliminação contactando o Estúdio.",
  },
  {
    heading: "9. Foro",
    body: "Estas condições regem-se pela lei portuguesa. Para a resolução de qualquer litígio emergente deste contrato, e não sendo possível um acordo amigável, as partes recorrem ao Centro de Arbitragem de Conflitos de Consumo de Lisboa.",
  },
];

/**
 * Serializa as secções num texto simples estável — usado como snapshot imutável
 * do que o cliente aceitou (guardado em `Contract.termsSnapshot`). Formato:
 * cabeçalho, corpo, linha em branco entre secções.
 */
export function termsToPlainText(sections: TermsSection[] = DEFAULT_TERMS): string {
  return sections.map((s) => `${s.heading}\n${s.body}`).join("\n\n");
}
