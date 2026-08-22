/**
 * ════════════════════════════════════════════════════════════════════════════
 * «NÃO FOI POSSÍVEL GUARDAR.» — A FRASE QUE APARECE 41 VEZES E NÃO DIZ NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do inventário de esperas: **105 acções falham com uma frase que não diz o
 * quê, nem porquê, nem o que fazer a seguir.** Três frases cobrem quase metade
 * do back office — «Não foi possível guardar.», «Não foi possível atualizar» e
 * «Verifica a ligação e tenta de novo».
 *
 * O problema não é serem secas. É serem a MESMA para coisas com respostas
 * diferentes:
 *
 *   · a rede caiu           → espera e repete; o que escreveste está aí
 *   · a sessão expirou      → volta a entrar (repetir não resolve nada)
 *   · alguém apagou isto    → recarrega; repetir vai falhar sempre
 *   · alguém mexeu ao mesmo tempo → recarrega e vê o que ficou
 *   · o servidor recusou    → o valor está errado, e ele costuma dizer porquê
 *   · o servidor está em baixo → espera; não é culpa de nada do que fizeste
 *
 * Quem lê «Não foi possível guardar.» faz sempre a mesma coisa: carrega outra
 * vez. Nos casos 2, 3 e 4 isso não funciona nunca — e a segunda tentativa
 * falhada é o que faz alguém deixar de confiar no ecrã.
 *
 * ── A REGRA DE ESCRITA ────────────────────────────────────────────────────
 *
 * Palavras dela: «se falhar, dizer **o que aconteceu, porquê e o que fazer** —
 * nunca "algo correu mal". Se falhar, **não perder trabalho**.»
 *
 * Cada frase daqui tem as três partes, por esta ordem, e nomeia a coisa: não
 * «não foi possível guardar» mas «não deu para guardar a quantidade de
 * "Escadote"». O nome é metade da frase — sem ele, quem tem seis separadores
 * abertos não sabe sobre o que é o aviso.
 *
 * ── PORQUE É QUE A FRASE DO SERVIDOR GANHA ────────────────────────────────
 *
 * Quando o servidor devolve um `error` escrito, é ele que sabe: «Já existe uma
 * lista com esse nome», «Faltam os essenciais de carrinha». Substituí-la por
 * uma frase genérica é deitar fora a única informação útil da resposta. Só se
 * usa a genérica quando não veio nenhuma.
 *
 * Este módulo é puro e sem React de propósito: é a camada onde as palavras se
 * decidem, e tem de poder ser posta à prova sem montar um ecrã.
 */

/** O que o servidor manda no corpo quando tem alguma coisa a dizer. */
export interface CorpoDeErro {
  error?: unknown;
}

export interface Falha {
  /** A frase inteira, pronta a mostrar. */
  mensagem: string;
  /**
   * Repetir o mesmo gesto tem alguma hipótese de funcionar?
   *
   * `false` na sessão expirada, no que já não existe e no que o servidor
   * recusou — os três casos em que carregar outra vez falha sempre. Quem chama
   * usa isto para decidir se mostra um «Tentar de novo» ou não: um botão que
   * não pode funcionar é pior do que nenhum.
   */
  vaidaAdianteRepetir: boolean;
  /** A sessão caiu — quem chama pode querer mandar entrar de novo. */
  sessaoExpirou: boolean;
}

/** Trinta e seis caracteres de UUID no meio de um aviso não ajudam ninguém. */
const MAX_FRASE_DO_SERVIDOR = 300;

function fraseDoServidor(corpo: unknown): string {
  const e = (corpo as CorpoDeErro | null)?.error;
  if (typeof e !== "string") return "";
  const limpo = e.trim();
  if (!limpo || limpo.length > MAX_FRASE_DO_SERVIDOR) return "";
  // As genéricas do servidor não valem mais do que as nossas — e são as
  // mesmas palavras vazias vistas do outro lado.
  if (/^(erro interno|internal server error|erro|error)\.?$/i.test(limpo)) return "";
  return limpo;
}

/** Acaba a frase com ponto final, sem duplicar o que já lá está. */
const pontuar = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/**
 * A frase de uma gravação que não passou.
 *
 * @param oQue  o que se estava a fazer, em minúsculas e nomeando a coisa:
 *              «guardar a quantidade de "Escadote"», «apagar a lista
 *              "Essenciais de carrinha"». Entra no meio da frase.
 * @param resposta  a resposta HTTP, quando houve uma. `null` quando o pedido
 *              nem chegou a sair — que é o caso da rede em baixo.
 * @param corpo o corpo JSON já lido, se deu para ler.
 */
export function porqueFalhou(
  oQue: string,
  resposta: { status: number } | null,
  corpo?: unknown,
): Falha {
  const coisa = oQue.trim();

  // ── O pedido não chegou a sair ─────────────────────────────────────────
  if (!resposta) {
    return {
      mensagem: `Sem ligação — não deu para ${coisa}. Nada se perdeu: repete quando a rede voltar.`,
      vaidaAdianteRepetir: true,
      sessaoExpirou: false,
    };
  }

  const { status } = resposta;
  const doServidor = fraseDoServidor(corpo);

  if (status === 401 || status === 403) {
    return {
      mensagem: `A sessão expirou — não deu para ${coisa}. Volta a entrar e repete.`,
      // Repetir sem voltar a entrar falha sempre. É o caso onde um «Tentar de
      // novo» faz mais mal do que bem.
      vaidaAdianteRepetir: false,
      sessaoExpirou: true,
    };
  }

  if (status === 404) {
    return {
      mensagem: `Isto já não existe — não deu para ${coisa}. Alguém apagou entretanto; recarrega a página.`,
      vaidaAdianteRepetir: false,
      sessaoExpirou: false,
    };
  }

  if (status === 409) {
    return {
      mensagem:
        doServidor ||
        `Alguém mexeu nisto ao mesmo tempo — não deu para ${coisa}. Recarrega para ver o que ficou, e repete.`,
      vaidaAdianteRepetir: true,
      sessaoExpirou: false,
    };
  }

  if (status === 413) {
    return {
      mensagem: `É grande demais para guardar — não deu para ${coisa}. Corta um pouco e repete.`,
      vaidaAdianteRepetir: false,
      sessaoExpirou: false,
    };
  }

  if (status === 429) {
    return {
      mensagem: `Pedidos a mais seguidos — não deu para ${coisa}. Espera um minuto e repete.`,
      vaidaAdianteRepetir: true,
      sessaoExpirou: false,
    };
  }

  if (status >= 500) {
    return {
      // Aqui a frase do servidor NÃO ganha: um 500 traz rastos de pilha e
      // nomes de tabelas, e nenhum deles diz o que fazer a seguir.
      mensagem: `O servidor não está a aceitar gravações agora — não deu para ${coisa}. Espera um pouco e repete.`,
      vaidaAdianteRepetir: true,
      sessaoExpirou: false,
    };
  }

  // 400, 422 e o resto: é uma recusa do CONTEÚDO, e o servidor costuma saber
  // dizer porquê. Repetir o mesmo não muda nada — tem de se mudar o que se
  // está a mandar.
  return {
    mensagem: doServidor
      ? pontuar(doServidor)
      : `O servidor recusou — não deu para ${coisa}. Confere o que está escrito e repete.`,
    vaidaAdianteRepetir: false,
    sessaoExpirou: false,
  };
}

/**
 * O mesmo, a partir de um `catch`.
 *
 * O padrão em todo o back office é `try { fetch } catch {}`, e lá dentro não se
 * sabe se o que rebentou foi a rede ou o `res.json()`. As duas contam como «não
 * chegou», que é a resposta certa para quem está a olhar.
 */
export function porqueRebentou(oQue: string): Falha {
  return porqueFalhou(oQue, null);
}

/**
 * A RAZÃO SEM A COISA — para onde o contexto já está no ecrã.
 *
 * A gravação automática do painel do pedido e a `PerguntaDeDesfecho` mostram o
 * aviso ENCOSTADO ao que falhou: a barra de gravação está por baixo do campo, o
 * cartão do desfecho está dentro do próprio diálogo. Aí, repetir o nome da
 * coisa na frase é dizer duas vezes o que já se vê.
 *
 * Existiam duas cópias desta função — uma no `AdminClient`, outra na
 * `PerguntaDeDesfecho` — e tinham DIVERGIDO: uma tratava o 413 e a outra o 404,
 * portanto o mesmo 404 dizia «Este pedido já não existe» num sítio e nada no
 * outro. É o que acontece a uma regra escrita duas vezes.
 *
 * `undefined` quando não há nada de útil a dizer: quem chama tem a sua própria
 * frase de reserva, e uma genérica por cima dela só a piorava.
 */
export function razaoDaRecusa(status: number): string | undefined {
  if (status === 401 || status === 403) return "A sessão expirou — volta a entrar.";
  if (status === 404) return "Isto já não existe — alguém apagou entretanto.";
  if (status === 409) return "Alguém mexeu nisto ao mesmo tempo — recarrega para ver o que ficou.";
  if (status === 413) return "O texto é grande demais para ser guardado assim.";
  if (status === 429) return "Pedidos a mais seguidos — espera um minuto.";
  if (status === 400 || status === 422) return "O servidor recusou o conteúdo.";
  if (status >= 500) return "O servidor não está a aceitar gravações neste momento.";
  return undefined;
}
