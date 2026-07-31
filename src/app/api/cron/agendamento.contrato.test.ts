import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TODA A ROTA DE CRON TEM DE ESTAR AGENDADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. Uma rota em `src/app/api/cron/` não corre por existir: corre
 * porque alguém a inscreveu no `vercel.json`. As duas metades vivem em
 * ficheiros diferentes e nada as ligava — e a metade que faltava não dá erro
 * nenhum. A rota responde bem quando chamada à mão, os testes dela passam, o
 * CI fica verde, e o trabalho simplesmente nunca acontece.
 *
 * FOI ASSIM QUE ACONTECEU. O `/api/cron/inbox-check` existia, estava testado,
 * estava protegido pelo `CRON_SECRET` — e não estava no `vercel.json`. Só lá
 * estava o `reminders`. Ou seja, a verificação da caixa de correio dos
 * clientes nunca corria sozinha. E o repositório dizia o contrário em dois
 * sítios: o cabeçalho do `lib/inbox.ts` fala do "every-few-minutes
 * inbox-check cron", e o `lib/env.ts` descreve o `CRON_SECRET` como o que
 * autentica "daily digest, inbox check". A documentação descrevia um sistema
 * que não estava ligado.
 *
 * É a mesma família de defeito que já apareceu várias vezes neste projecto:
 * não o código que falha alto, mas o que não chega a correr e não se queixa.
 *
 * O QUE ESTE FICHEIRO GARANTE: acrescentar uma rota de cron sem a agendar fica
 * vermelho, com o nome da rota na mensagem.
 */

const RAIZ_CRON = join(process.cwd(), "src/app/api/cron");

/** As rotas que EXISTEM, pelo caminho por que a Vercel lhes chamaria. */
function rotasDeCron(): string[] {
  const fora: string[] = [];
  for (const nome of readdirSync(RAIZ_CRON)) {
    const dir = join(RAIZ_CRON, nome);
    if (!statSync(dir).isDirectory()) continue;
    const temRota = readdirSync(dir).includes("route.ts");
    if (temRota) fora.push(`/api/cron/${nome}`);
  }
  return fora.sort();
}

interface Cron {
  path: string;
  schedule: string;
}

const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  crons?: Cron[];
};
const agendadas = config.crons ?? [];

describe("agendamento dos crons: o que existe tem de estar inscrito", () => {
  it("nenhuma rota de cron fica por agendar", () => {
    const inscritas = new Set(agendadas.map((c) => c.path));
    const semAgenda = rotasDeCron().filter((r) => !inscritas.has(r));
    expect(
      semAgenda,
      "esta(s) rota(s) existem mas nunca são chamadas — inscreve-as em vercel.json",
    ).toEqual([]);
  });

  it("nenhum agendamento aponta para uma rota que não existe", () => {
    // O contrário do anterior: apagar a rota e esquecer a agenda deixa a Vercel
    // a bater num 404 de hora a hora, e ninguém repara.
    const existentes = new Set(rotasDeCron());
    const orfas = agendadas.map((c) => c.path).filter((p) => !existentes.has(p));
    expect(orfas, "agendamento(s) a apontar para rotas inexistentes").toEqual([]);
  });

  it("todos os agendamentos têm uma expressão cron com cinco campos", () => {
    for (const c of agendadas) {
      expect(c.schedule, `${c.path} sem agenda`).toBeTruthy();
      expect(
        c.schedule.trim().split(/\s+/),
        `${c.path}: "${c.schedule}" não tem os 5 campos de um cron`,
      ).toHaveLength(5);
    }
  });

  it("a rede está mesmo armada (não passa por vacuidade)", () => {
    // Se o leitor de pastas deixar de encontrar rotas, os dois primeiros testes
    // passavam sobre listas vazias e não guardavam nada.
    expect(rotasDeCron().length).toBeGreaterThanOrEqual(2);
    expect(agendadas.length).toBeGreaterThanOrEqual(2);
  });
});
