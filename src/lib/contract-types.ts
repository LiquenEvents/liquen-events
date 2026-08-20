/**
 * Client-safe contract types.
 *
 * Split out from `contracts-store.ts` (which imports `server-only` via the
 * Repository → `fs`) so client components — the public proposal page's accept
 * flow — can `import type` these without pulling the server-only store into the
 * client bundle, which would break the build. Mirrors the
 * `inventory-types.ts` / `inventory-store.ts` split.
 */

/** Lifecycle of the studio's Termos & Condições acceptance for a proposal. */
export type ContractStatus = "pendente" | "aceite";

export interface Contract {
  id: string;
  /** The quote this acceptance belongs to (denormalised for the ledger link). */
  quoteId: string;
  /** The proposal the client accepted — the idempotency key (one per proposal). */
  proposalId: string;
  clientName: string;
  clientEmail: string;
  /** Version of the terms the client agreed to (e.g. "2026-01"). */
  termsVersion: string;
  /** Full plain-text snapshot of the terms AS SHOWN, frozen at acceptance so a
   *  later edit to DEFAULT_TERMS can never rewrite what was agreed. */
  termsSnapshot: string;
  status: ContractStatus;
  createdAt: string;
  /** When the client accepted (ISO). Absent while status is "pendente". */
  acceptedAt?: string;
  /** The full name the client typed to sign the acceptance. */
  acceptedName?: string;
  /** Best-effort client IP captured at acceptance (audit trail). */
  acceptedIp?: string;
  /**
   * ── O SELO DO DOCUMENTO ACEITE ───────────────────────────────────────────
   *
   * A impressão digital (SHA-256) e o tamanho do PDF EXACTO que foi enviado ao
   * casal, copiados da proposta no instante do aceite.
   *
   * O que este contrato já provava: QUEM escreveu o nome, QUANDO, de que IP, e
   * com que texto de termos (congelado em `termsSnapshot`). O que faltava era o
   * mais disputado de todos: QUAL documento. Um PDF é reconstruído a partir do
   * `doc` da proposta, e basta uma mudança no código do desenho para os bytes
   * deixarem de bater certo — sem selo não há como distinguir "o conteúdo
   * mudou" de "só o desenho mudou".
   *
   * Ausentes nos contratos anteriores a esta mudança, e é assim que deve ser:
   * um selo inventado a posteriori não seria prova de nada.
   */
  propostaPdfSha256?: string;
  /**
   * ── QUE VERSÃO É QUE O CASAL ACEITOU ────────────────────────────────────
   *
   * O selo do CONTEÚDO (e o número que se diz em voz alta) da proposta no
   * momento do sim. Não confundir com o {@link Contract.propostaPdfSha256},
   * aqui em cima: aquele é a impressão digital dos BYTES do ficheiro e serve
   * de PROVA; este é a identidade do conteúdo e serve para COMPARAR — é o que
   * distingue «o documento de agora é o que foi aceite» de «foi revisto depois
   * do sim». Os bytes não servem para isso: dois PDFs de conteúdo igual têm
   * bytes diferentes (medido em `proposta-versao.ts`).
   *
   * AUSENTES nos contratos anteriores a estas colunas — e ausente lê-se como
   * «não se sabe», nunca como «foi revisto». Um aviso inventado sobre um
   * contrato antigo era pior do que não haver aviso nenhum.
   */
  propostaVersaoSelo?: string;
  propostaVersaoNumero?: number;
  /**
   * ── QUANDO É A EQUIPA A REGISTAR UM ACEITE QUE ACONTECEU FORA DAQUI ──────
   *
   * Um contrato nasce `pendente` porque este sistema NÃO presenciou o sim: o
   * botão de aceitar pelo link foi retirado — decisão dela, «um casamento não
   * se fecha num botão» — e o que existe é uma conversa, um email, um papel
   * assinado. Sem uma porta para registar isso, NENHUM contrato chegava alguma
   * vez a `aceite`, e três coisas contavam com esse estado: o portal do casal
   * nunca oferecia o contrato em PDF, o filtro «Aceite» ficava vazio para
   * sempre, e o congelamento da proposta aceite era código que não podia
   * correr.
   *
   * Estes campos são a diferença entre um aceite ELECTRÓNICO (o casal escreveu
   * o nome, com hora e IP) e um aceite REGISTADO (alguém da casa diz que ele
   * aconteceu, e diz como). O PDF do contrato imprime blocos diferentes para
   * os dois — é isso que impede o documento de afirmar uma assinatura
   * electrónica que ninguém deu.
   *
   * `registadoPor` é lido da SESSÃO, nunca do corpo do pedido, pela mesma
   * razão que o nome de quem assina os emails: aceitá-lo de fora era deixar
   * qualquer pessoa pôr o nome de outra debaixo de um registo.
   */
  registadoPor?: string;
  /** Como é que a casa soube — «assinado em papel», «por email a 12/05». */
  registadoComo?: string;
  propostaPdfBytes?: number;
}
