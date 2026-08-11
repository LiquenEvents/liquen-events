import "server-only";
import { getState, setState } from "./app-state";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SABER SE A CÓPIA DE SEGURANÇA ANDA MESMO A CORRER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A cópia diária (`/api/cron/backup`, 04:00) depende de `CRON_SECRET`. Sem essa
 * variável definida no alojamento, a rota fecha-se em produção e responde 401 —
 * todos os dias, sem erro registado, sem email, sem sintoma nenhum. É a família
 * de defeito que mais aparece neste projecto: não o código que falha alto, mas
 * o que não chega a correr e não se queixa.
 *
 * E é a pior das versões dessa família, porque uma cópia que não corre há
 * semanas é PIOR do que não ter cópia nenhuma: dá a certeza de estar salvo a
 * quem já não está, e essa certeza só se desfaz no dia em que se precisa dela.
 *
 * A solução tem de ser visível onde ela olha, e não num ficheiro do
 * repositório. Por isso: cada cópia bem sucedida deixa um carimbo aqui, e o
 * painel de armazenamento do back office lê-o. Se o carimbo for velho, aparece
 * a frase — com o nome da variável a confirmar, que é o que resolve o problema
 * sozinha.
 *
 * ── PORQUE É QUE ISTO VIVE NO `app_state` E NÃO NUMA TABELA NOVA ──────────
 *
 * Porque é um marcador de funcionamento, exactamente como o marcador da caixa
 * de entrada e os fechos enviados à Meta — e é assim que a cópia de segurança
 * o trata: a chave fica FORA do espaço de nomes `proposal-draft:`, portanto não
 * entra na cópia nem na varredura dos rascunhos, e é excluída da reposição pela
 * mesma regra que já exclui os outros marcadores (`PARTIALLY_BACKED_UP`).
 * Repor um carimbo de há dois meses só faria o painel mentir ao contrário.
 */

/** Onde o carimbo vive. Uma chave só, com tudo o que se sabe sobre a cópia. */
export const CHAVE_DA_COPIA = "copia-de-seguranca:ultima";

/**
 * Quantos dias de silêncio até se falar.
 *
 * A tarefa é diária, portanto um dia sem cópia pode ser um deploy à hora da
 * tarefa ou um atraso do agendador — avisar aí seria o alarme falso que ensina
 * a ignorar o aviso. Três dias já não é acaso nenhum, e ainda está muito longe
 * das «semanas» que este módulo existe para não deixar acontecer.
 */
export const DIAS_ATE_AVISAR = 3;

const DIA_MS = 86_400_000;

/**
 * O que se sabe sobre a cópia.
 *
 *  - `em`     → quando chegou a última que correu bem. Ausente = nunca chegou;
 *  - `desde`  → desde quando se está a olhar. Só existe enquanto `em` não
 *               existir, e é o que impede uma instalação de hoje de ser
 *               acusada de não ter cópias de ontem;
 *  - `modo`   → `automatica` (a tarefa agendada) ou `manual` (o botão em
 *               Definições). As duas contam: o que interessa é o ficheiro
 *               existir fora daqui, não quem carregou no botão;
 *  - `parcial`→ a cópia chegou com conjuntos por ler. Chegou, e não é a cópia
 *               que se pensa que se tem.
 */
export interface MarcadorDeCopia {
  em?: string;
  desde?: string;
  bytes?: number;
  modo?: "automatica" | "manual";
  parcial?: boolean;
}

export type EstadoDaCopiaDeSeguranca = "ok" | "atrasada" | "nunca" | "por-estrear" | "sem-registo";

export interface EstadoDaCopia {
  estado: EstadoDaCopiaDeSeguranca;
  /** Vale a pena interromper alguém com isto? */
  avisar: boolean;
  ultimaEm?: string;
  /** Há quantos dias foi a última (arredondado para baixo). */
  diasSem?: number;
  parcial?: boolean;
  titulo?: string;
  oQueFazer?: string;
}

/**
 * O que fazer quando a cópia parou. É a MESMA frase para «nunca houve» e para
 * «deixou de haver» porque a resolução é a mesma, e é a que o RUNBOOK §7 já
 * aponta: o suspeito nº 1 é o `CRON_SECRET`.
 *
 * A segunda metade não é decoração: enquanto a variável não for corrigida, o
 * caminho para não ficar sem cópia nenhuma é o botão de descarregar. Um aviso
 * que só diz o que está mal deixa a pessoa sem nada para fazer hoje.
 */
const O_QUE_FAZER =
  "A cópia automática corre às 04:00 e chega por email. Quando pára, o suspeito n.º 1 é a variável CRON_SECRET — sem ela a tarefa responde 401 todos os dias, em silêncio. Confirme-a nas variáveis de ambiente do alojamento (Vercel → Settings → Environment Variables) e publique outra vez. Entretanto, descarregue uma cópia à mão em Definições → Cópia de segurança e guarde-a fora do computador de trabalho.";

function lerData(valor: unknown): Date | null {
  if (typeof valor !== "string") return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Regista que uma cópia chegou. Chamado depois de o email sair (ou depois de o
 * ficheiro ser entregue ao browser), nunca antes: o carimbo diz «existe uma
 * cópia», e prometê-lo antes de ela existir era a mentira que este módulo
 * combate.
 *
 * NUNCA lança. A cópia já foi enviada quando isto corre — falhar aqui pode
 * custar um aviso a mais daqui a três dias, e não pode custar a cópia.
 */
export async function registarCopiaEnviada(info: {
  bytes: number;
  parcial: boolean;
  modo: "automatica" | "manual";
}): Promise<void> {
  const marcador: MarcadorDeCopia = {
    em: new Date().toISOString(),
    bytes: info.bytes,
    modo: info.modo,
    ...(info.parcial ? { parcial: true } : {}),
  };
  try {
    // Substitui o carimbo inteiro de propósito: com `em` presente, o `desde`
    // deixa de ter função nenhuma e mantê-lo só deixava lixo para trás.
    await setState(CHAVE_DA_COPIA, marcador);
  } catch (e) {
    log.error("copia-de-seguranca: não consegui registar o carimbo da cópia", e);
  }
}

/**
 * Há quanto tempo é que não chega uma cópia — e se isso é para dizer a alguém.
 *
 * `agora` existe para os testes. Nunca lança: quem chama é um painel de aviso,
 * e um painel que rebenta some sem dizer porquê.
 */
export async function estadoDaCopia(agora: Date = new Date()): Promise<EstadoDaCopia> {
  let marcador: MarcadorDeCopia | null = null;
  try {
    marcador = await getState<MarcadorDeCopia>(CHAVE_DA_COPIA);
  } catch (e) {
    log.error("copia-de-seguranca: não consegui ler o carimbo da cópia", e);
    // Não se sabe é diferente de está mal — e um vermelho por não se saber
    // seria o alarme falso mais frequente de todos.
    return { estado: "sem-registo", avisar: false };
  }

  const ultima = lerData(marcador?.em);
  if (ultima) {
    const diasSem = Math.floor((agora.getTime() - ultima.getTime()) / DIA_MS);
    if (diasSem < DIAS_ATE_AVISAR) {
      return {
        estado: "ok",
        avisar: false,
        ultimaEm: ultima.toISOString(),
        diasSem,
        ...(marcador?.parcial ? { parcial: true } : {}),
      };
    }
    return {
      estado: "atrasada",
      avisar: true,
      ultimaEm: ultima.toISOString(),
      diasSem,
      ...(marcador?.parcial ? { parcial: true } : {}),
      titulo:
        diasSem === 1
          ? "A última cópia de segurança chegou ontem."
          : `Não chega uma cópia de segurança há ${diasSem} dias.`,
      oQueFazer: O_QUE_FAZER,
    };
  }

  // Nunca chegou nenhuma. Isso é normal numa instalação de hoje e é grave numa
  // instalação de há um mês — e a única forma de distinguir as duas é saber
  // desde quando se está a olhar.
  const desde = lerData(marcador?.desde);
  if (!desde) {
    try {
      await setState(CHAVE_DA_COPIA, { desde: agora.toISOString() } satisfies MarcadorDeCopia);
    } catch (e) {
      log.error("copia-de-seguranca: não consegui carimbar o início da vigia", e);
    }
    return { estado: "por-estrear", avisar: false };
  }

  const diasAOlhar = Math.floor((agora.getTime() - desde.getTime()) / DIA_MS);
  if (diasAOlhar < DIAS_ATE_AVISAR) return { estado: "por-estrear", avisar: false };

  return {
    estado: "nunca",
    avisar: true,
    titulo: "Nunca chegou nenhuma cópia de segurança automática.",
    oQueFazer: O_QUE_FAZER,
  };
}
