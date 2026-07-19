/**
 * Conteúdo da Ajuda do back-office — separado do componente para ser fácil de
 * manter e traduzir. É *puro* e *client-safe*: só dados, sem imports do data
 * layer (nada de `*-store.ts`), por isso pode ser importado por componentes
 * "use client" sem arrastar segredos ou lógica de servidor.
 *
 * Regra de ouro: os nomes aqui têm de coincidir com o que aparece nos ecrãs.
 * Rótulos verificados no código:
 *   · Estados do pedido — STATUS_OPTIONS em AdminClient.tsx:
 *       Novo · Em revisão · Proposta enviada · Ganho · Perdido
 *   · Fases do Dossier — STAGE_LABELS em src/lib/orcamento/dossier.ts
 *   · Estados da fatura — invoice-validation.ts: emitida · paga · anulada
 *   · "Guião do dia" (folha de operações), "Seguimentos", "Mood boards",
 *     "Portal do cliente", filtro "VIP" — todos presentes na UI de admin.
 */

/** Uma etapa do percurso de um trabalho, do primeiro contacto ao dia do evento. */
export interface LifecycleStep {
  step: string;
  desc: string;
}

/** Uma entrada do glossário: a palavra tal como aparece no ecrã + o que significa. */
export interface GlossaryEntry {
  term: string;
  def: string;
}

/**
 * O percurso que cada trabalho faz. Uma frase simples e concreta por etapa —
 * para que os nomes do menu se sintam como um só processo, e não como
 * separadores soltos.
 */
export const LIFECYCLE: LifecycleStep[] = [
  {
    step: "Pedido",
    desc: "Alguém pede um orçamento e nasce um pedido: quem é, que evento quer, para quando e para quantas pessoas.",
  },
  {
    step: "Proposta",
    desc: "Respondemos a esse pedido com uma proposta — um documento com os serviços sugeridos e o preço — e enviamo-la ao cliente.",
  },
  {
    step: "Contrato",
    desc: "Quando o cliente aceita as condições por escrito, fica feito o contrato e a data do evento é reservada para ele.",
  },
  {
    step: "Fatura (sinal + saldo)",
    desc: "Cobramos em duas faturas: primeiro o sinal, que garante a reserva, e mais perto do evento o saldo, que é o resto do valor.",
  },
  {
    step: "Evento",
    desc: "No dia do evento acontece tudo o que preparámos e, no fim, fica o registo no histórico do cliente.",
  },
];

/**
 * Vocabulário do dia a dia, em linguagem simples. A ordem segue o percurso
 * acima (do pedido ao evento) e só depois os termos transversais, para que
 * quem lê de cima a baixo aprenda pela mesma ordem por que vai encontrar as
 * palavras na app.
 */
export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Pedido",
    def: "Um contacto de alguém que quer um orçamento. Cada pedido tem um estado que mostra em que ponto está: Novo, Em revisão, Proposta enviada, Ganho ou Perdido.",
  },
  {
    term: "Pipeline",
    def: "O quadro que mostra todos os pedidos organizados por fase, em colunas (do primeiro contacto ao evento concluído). Serve para ver, num relance, em que ponto está cada trabalho. Também lhe chamamos “quadro”.",
  },
  {
    term: "Proposta",
    def: "O documento que enviamos ao cliente com os serviços sugeridos e o preço. É a nossa resposta a um pedido; monta-se no editor de propostas.",
  },
  {
    term: "Proposta enviada",
    def: "O estado de um pedido a quem já mandámos a proposta e de quem esperamos resposta. É o rótulo que aparece no ecrã (internamente também aparece como “cotado”).",
  },
  {
    term: "Mood board",
    def: "Um painel de imagens de referência que juntamos à proposta para mostrar o ambiente e o estilo do evento. Usa-se sobretudo nas propostas de decoração.",
  },
  {
    term: "Contrato",
    def: "O acordo em que o cliente aceita as condições por escrito. Quando está aceite, o evento fica confirmado e a data reservada.",
  },
  {
    term: "Ganho",
    def: "O estado de um pedido que o cliente aceitou — o negócio foi fechado. É o desfecho que queremos para cada pedido.",
  },
  {
    term: "Perdido",
    def: "O estado de um pedido que não avançou (o cliente desistiu ou escolheu outro). Fica registado para sabermos o que aconteceu, mesmo que não tenha dado evento.",
  },
  {
    term: "Sinal",
    def: "A primeira parte do pagamento (habitualmente 30%), paga no início para reservar a data. Sem sinal, a data não fica garantida.",
  },
  {
    term: "Saldo",
    def: "O resto do pagamento (habitualmente 70%), pago mais perto do evento. Sinal + saldo = valor total.",
  },
  {
    term: "Fatura",
    def: "O documento oficial que pede um pagamento ao cliente. Pode ser do sinal, do saldo, ou uma fatura única com o valor todo. Cada fatura fica emitida, paga ou anulada.",
  },
  {
    term: "Recibo",
    def: "O comprovativo de que um pagamento já foi feito. A fatura pede; o recibo confirma que recebemos.",
  },
  {
    term: "Anulada",
    def: "Uma fatura que foi cancelada e deixou de contar — por exemplo, se foi emitida com um erro. Não desaparece do registo, mas não conta para os totais a receber.",
  },
  {
    term: "Convidados",
    def: "As pessoas que vão ao evento. O número de convidados influencia o espaço, a comida e o preço; a lista de convidados serve para gerir presenças (RSVP).",
  },
  {
    term: "Dossier",
    def: "A vista completa de um evento, tudo num só sítio: contacto, proposta, contrato, faturas e produção. É o “processo” do evento e a fonte de verdade financeira.",
  },
  {
    term: "Guião do dia",
    def: "A folha de operações do evento, pronta a imprimir: o alinhamento de horas e tarefas para a equipa seguir no próprio dia.",
  },
  {
    term: "Seguimento",
    def: "Um lembrete para voltar a falar com o cliente numa certa data — por exemplo, para não deixar uma proposta sem resposta. Se a data já passou, aparece “em atraso”. No menu está em “Seguimentos”.",
  },
  {
    term: "Portal do cliente",
    def: "A página privada, só de leitura, onde o cliente vê a proposta e acompanha o seu evento. Abre-se por um link que enviamos; ninguém sem o link lá chega.",
  },
  {
    term: "VIP",
    def: "Marca um cliente especial — por exemplo, quem já gastou muito connosco ou voltou várias vezes. Ajuda a dar-lhe atenção prioritária e a filtrar a lista de clientes.",
  },
];
