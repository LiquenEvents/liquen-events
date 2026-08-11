import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import {
  listInvoices,
  listInvoicesForQuote,
  createInvoice,
  nextInvoiceNumber,
  newInvoiceId,
  isUniqueViolation,
  type Invoice,
} from "@/lib/invoices-store";
import { jsonWithEtag } from "@/lib/api-cache";
import { splitSinal } from "@/lib/money";
import { getProposalByQuote } from "@/lib/proposals-store";
import { depositPercentOf, type ProposalDoc } from "@/lib/proposal-doc";
import { log } from "@/lib/logger";
import { invoiceCreateSchema, readJsonBody, validateBody } from "@/lib/invoice-validation";
import { registarAcontecimento } from "@/lib/estado-do-pedido-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EMITIR UMA FACTURA PASSA O PEDIDO A «GANHO»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto não mexia no pedido nenhum. Ela emitia o sinal daqui — que é a reserva
 * da data, o momento em que o trabalho fica mesmo dela — e o quadro continuava
 * a dizer «Proposta enviada». O negócio estava ganho e a única vista que serve
 * para saber o que falta fazer não sabia.
 *
 * A decisão de PARA ONDE sobe (e de quando não sobe) é toda de
 * `@/lib/orcamento/estado-do-pedido`; aqui só se diz o que aconteceu. E chama-se
 * DEPOIS de a factura estar no livro, nunca antes: se a numeração falhar, não
 * há factura nenhuma e não há nada a registar.
 *
 * `registarAcontecimento` nunca atira — uma factura emitida não pode virar
 * «Erro ao criar a fatura» por causa da cor de uma coluna (ver a nota lá).
 */

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, max);
// Clamp to a sane range AND round to cents — a manually-issued invoice must never
// carry a fractional-cent amount into the fiscal ledger (e.g. 100.567 → 100.57).
const num = (v: unknown) =>
  Math.round(Math.min(Math.max(Number(v) || 0, 0), 100_000_000) * 100) / 100;
const date = (v: unknown) => {
  const s = clean(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const quoteId = request.nextUrl.searchParams.get("quoteId");
    const invoices = quoteId ? await listInvoicesForQuote(quoteId) : await listInvoices();
    return jsonWithEtag(request, invoices);
  } catch (err) {
    log.error("faturas GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // ── Input validation (400 before any work) ──
  // Reject malformed JSON, a non-object body, or wrong-typed/out-of-range fields
  // with a clean 400 instead of letting them 500 or slip bad data into the book.
  const read = await readJsonBody(request);
  if (!read.ok) {
    return NextResponse.json(
      { error: "Corpo do pedido inválido (JSON malformado)." },
      { status: 400 },
    );
  }
  const valid = validateBody(invoiceCreateSchema, read.body);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
  const body = valid.data;

  try {
    const quoteId = clean(body.quoteId, 80);
    const clientName = clean(body.clientName, 120);
    const clientEmail = clean(body.clientEmail, 160);
    const vatRate =
      typeof body.vatRate === "number" ? Math.min(Math.max(body.vatRate, 0), 1) : 0.23;
    const issuedAt = date(body.issuedAt) || new Date().toISOString().slice(0, 10);
    const dueAt = date(body.dueAt) || undefined;
    const note = body.note ? clean(body.note, 500) : undefined;

    if (!clientName) return NextResponse.json({ error: "Cliente obrigatório" }, { status: 400 });

    // Shared factory: assigns a fresh atomic number + id per invoice. Awaiting
    // sequentially keeps the numbering read-increment-write safe under the
    // split path (two invoices → two consecutive numbers, never the same one).
    const build = async (kind: Invoice["kind"], amount: number): Promise<Invoice> => ({
      id: newInvoiceId(),
      number: await nextInvoiceNumber(),
      quoteId,
      clientName,
      clientEmail,
      kind,
      amount,
      vatRate,
      issuedAt,
      dueAt,
      status: "emitida",
      note,
    });

    // ── 30/70 auto-split: one event total → sinal (30%) + saldo (70%) pair ──
    if (body.split) {
      const total = num(body.total ?? body.amount);
      if (total <= 0) return NextResponse.json({ error: "Total inválido" }, { status: 400 });

      // Guarda contra duplo sinal: o fluxo de aceitação da proposta já auto-emite
      // o par sinal+saldo. Se este evento já tem uma fatura de sinal (ou saldo)
      // não anulada no livro, recusamos — evita cobrar o sinal duas vezes por
      // engano do operador. A UI já avisa, mas o servidor é a última linha.
      if (quoteId) {
        const active = (await listInvoicesForQuote(quoteId)).filter((i) => i.status !== "anulada");
        const dupSinal = active.find((i) => i.kind === "sinal");
        if (dupSinal) {
          return NextResponse.json(
            { error: `Já existe uma fatura de sinal para este evento (${dupSinal.number}).` },
            { status: 409 },
          );
        }
        const dupSaldo = active.find((i) => i.kind === "saldo");
        if (dupSaldo) {
          return NextResponse.json(
            { error: `Já existe uma fatura de saldo para este evento (${dupSaldo.number}).` },
            { status: 409 },
          );
        }
      }

      // A percentagem vem da PROPOSTA, não de uma constante. É a mesma que o
      // estúdio mostra; ver `depositPercentOf`.
      const pctSinal = depositPercentOf(
        (await getProposalByQuote(quoteId).catch(() => null))?.doc as ProposalDoc | undefined,
      );
      const { sinal, saldo } = splitSinal(total, pctSinal);
      const sinalInv = await build("sinal", sinal);
      const saldoInv = await build("saldo", saldo);
      try {
        await createInvoice(sinalInv);
      } catch (err) {
        // Backstop de corrida: entre a verificação acima e este insert, uma
        // emissão concorrente pode ter criado o sinal — os índices parciais
        // únicos (db/schema.sql) fazem o insert falhar. Tratamos como duplicado
        // (409) em vez de 500, coerente com a guarda de duplicação acima.
        if (isUniqueViolation(err)) {
          return NextResponse.json(
            { error: "Já existe uma fatura de sinal/saldo para este evento." },
            { status: 409 },
          );
        }
        // Nada ficou gravado — aqui um 500 é honesto, e o `catch` de topo dá-o.
        throw err;
      }

      /**
       * ══════════════════════════════════════════════════════════════════════
       * A PARTIR DAQUI O SINAL ESTÁ NO LIVRO — E ISSO MUDA O QUE SE PODE DIZER
       * ══════════════════════════════════════════════════════════════════════
       *
       * Estes dois inserts estavam num `try` só. Se o SEGUNDO rebentasse por
       * outra coisa que não duplicação, o erro subia ao `catch` de topo e a
       * resposta era 500 "Erro ao criar a fatura" — com o sinal já gravado e o
       * seu número fiscal gasto. O que ela via a seguir:
       *
       *   1. "Erro ao criar a fatura" → conclui, com toda a razão, que não se
       *      emitiu nada;
       *   2. tenta outra vez;
       *   3. "Já existe uma fatura de sinal para este evento" — 409, da guarda
       *      de duplicação.
       *
       * O ecrã a afirmar ao mesmo tempo que falhou e que já existe. Nenhuma das
       * duas frases é a verdade, que é simples: o sinal está emitido, o saldo
       * não, falta emitir o saldo e NÃO se deve reemitir o sinal.
       *
       * Uma resposta de erro não consegue dizer isto — quem a lê arruma-a como
       * "não aconteceu nada". Por isso, com o sinal persistido, isto passa a ser
       * um ÊXITO COM AVISO: 201, a lista do que ficou mesmo emitido, e uma frase
       * que nomeia as duas metades. Não se inventa um saldo que não existe.
       */
      try {
        await createInvoice(saldoInv);
      } catch (err) {
        log.error("faturas POST: saldo falhou com o sinal já emitido", err);
        // Numa violação de unicidade o saldo EXISTE (emissão concorrente); em
        // qualquer outra falha não existe. São duas situações diferentes e a
        // acção seguinte dela também é.
        const sobreOSaldo = isUniqueViolation(err)
          ? `o saldo não foi emitido por já existir uma fatura de saldo para este evento`
          : `a fatura de saldo (${saldoInv.amount.toFixed(2)} €) NÃO foi emitida`;
        // O SINAL ESTÁ EMITIDO — e é o sinal que diz que o trabalho é dela. Que
        // o saldo tenha falhado não muda isso, por isso o estado sobe na mesma.
        await registarAcontecimento(quoteId, "fatura_emitida", `sinal ${sinalInv.number}`);
        return NextResponse.json(
          {
            invoices: [sinalInv],
            aviso:
              `Foi emitida a fatura de sinal ${sinalInv.number} ` +
              `(${sinalInv.amount.toFixed(2)} €), mas ${sobreOSaldo}. ` +
              `Não volte a emitir o sinal — emita apenas o saldo.`,
          },
          { status: 201 },
        );
      }
      await registarAcontecimento(
        quoteId,
        "fatura_emitida",
        `sinal ${sinalInv.number} + saldo ${saldoInv.number}`,
      );
      return NextResponse.json({ invoices: [sinalInv, saldoInv] }, { status: 201 });
    }

    // ── Single invoice ──
    const amount = num(body.amount);
    if (amount <= 0) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    // Schema already validated the enum (or left it absent) — default to "total".
    const kind: Invoice["kind"] = body.kind ?? "total";

    // Mesma guarda de duplicação do ramo split, agora também no modo single: se o
    // operador escolher Tipo=Sinal/Saldo e já existir uma fatura desse tipo (não
    // anulada) para o evento, recusamos — sem esta guarda, o modo single mintava
    // um sinal/saldo duplicado que o split já bloqueia. `total` fica livre.
    if (quoteId && (kind === "sinal" || kind === "saldo")) {
      const active = (await listInvoicesForQuote(quoteId)).filter((i) => i.status !== "anulada");
      const dup = active.find((i) => i.kind === kind);
      if (dup) {
        return NextResponse.json(
          { error: `Já existe uma fatura de ${kind} para este evento (${dup.number}).` },
          { status: 409 },
        );
      }
    }

    const invoice = await build(kind, amount);
    try {
      await createInvoice(invoice);
    } catch (err) {
      // Backstop de corrida: entre a verificação acima e este insert, uma emissão
      // concorrente pode ter criado o sinal/saldo — o índice parcial único
      // (db/schema.sql) fá-lo falhar aqui. Tratamos como duplicado (409), não 500.
      if ((kind === "sinal" || kind === "saldo") && isUniqueViolation(err)) {
        return NextResponse.json(
          { error: `Já existe uma fatura de ${kind} para este evento.` },
          { status: 409 },
        );
      }
      throw err;
    }
    await registarAcontecimento(quoteId, "fatura_emitida", invoice.number);
    return NextResponse.json({ invoices: [invoice] }, { status: 201 });
  } catch (err) {
    log.error("faturas POST falhou", err);
    return NextResponse.json({ error: "Erro ao criar a fatura" }, { status: 500 });
  }
}
