"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUEM É QUE TEM COISA POR GRAVAR — UM SÍTIO SÓ, PARA UM GESTO SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela perdeu uma proposta. O pedido, nas palavras dela, foi «quero que o botão
 * guardar seja incrível e guarde tudo aquilo que foi feito no back office» — e
 * o que isso quer dizer não é mais um botão: é um gesto que lhe dê a certeza de
 * que nada do que fez fica para trás, aconteça o que acontecer a seguir (fechar
 * o portátil, ir para o carro, mudar de computador).
 *
 * O back office já grava bem em quatro sítios — o estúdio de propostas, o
 * painel do pedido, o construtor de orçamentos e os modelos de email — e cada
 * um deles sabe gravar o SEU trabalho. O que faltava era alguém saber os
 * quatro ao mesmo tempo. Sem isso não há resposta possível para a única
 * pergunta que interessa antes de fechar o portátil: «falta gravar alguma
 * coisa?»
 *
 * ── PORQUÊ UM REGISTO, E NÃO UM ARMAZÉM ───────────────────────────────────
 *
 * Isto **não guarda nada**. Não sabe o que é um rascunho, nem uma nota, nem um
 * modelo de email; não fala com servidor nenhum. Guarda apenas, por cada ecrã
 * montado: o nome por que quer ser chamado, se tem coisa por gravar, e como se
 * lhe pede que grave já.
 *
 * A alternativa — um armazém central que soubesse gravar tudo — seria um
 * SEGUNDO mecanismo de gravação a viver ao lado dos que já existem, com as suas
 * próprias regras de repetição, de conflito e de palavras. Dois mecanismos que
 * gravam a mesma coisa é o desenho que produz a avaria que se está a corrigir:
 * um deles diz «guardado» sem saber o que o outro fez.
 *
 * ── PORQUÊ UM ARMAZÉM EXTERNO E NÃO ESTADO DO REACT ───────────────────────
 *
 * A inscrição acontece dentro de ecrãs enormes (o estúdio tem 200 KB de
 * código), e a cada tecla escrita muda o «tem coisa por gravar» de alguém. Se
 * isto fosse estado do React no topo, cada uma dessas mudanças voltava a
 * desenhar o back office inteiro — o preço de saber se há coisa por gravar
 * seria pagar em fluidez enquanto se escreve, que é exactamente onde ela mais
 * o sentiria. Com um armazém externo (`useSyncExternalStore`), só quem
 * SUBSCREVE volta a desenhar: na prática, o botão.
 *
 * ── O QUE ISTO NÃO PODE FAZER: MENTIR POR OMISSÃO ─────────────────────────
 *
 * O registo só sabe de quem se inscreveu. Um ecrã com trabalho por gravar que
 * não esteja inscrito não é «nada por gravar» — é um ecrã de que ninguém sabe.
 * Por isso a inscrição está DENTRO da gravação automática partilhada
 * (`useGravacaoAutomatica`): quem usar a cadeia normal fica inscrito sem ter de
 * se lembrar disso, e um ecrã futuro não se pode esquecer daquilo que não tem
 * de escrever. Quem tem máquina própria inscreve-se à mão — e essa é uma linha
 * que se vê em revisão, ao contrário de um esquecimento.
 */

/**
 * O que aconteceu a UM ecrã quando lhe pediram para gravar já.
 *
 * São três e não dois, porque o meio-termo é o desfecho que fez perder a
 * proposta: o trabalho ficou no `localStorage` daquele portátil, e o ecrã dizia
 * «guardado». «Guardado só neste computador» é uma resposta diferente de
 * «guardado», e tem de continuar a sê-lo aqui.
 */
export type ResultadoDoEcra =
  /** Ficou no servidor. É a única que autoriza a palavra «guardado». */
  | { estado: "guardado" }
  /** Ficou neste computador e não chegou ao servidor. */
  | { estado: "so-neste-computador"; porque?: string }
  /** Não ficou em lado nenhum. */
  | { estado: "nao-guardado"; porque?: string };

/** O que um ecrã declara ao registo enquanto está montado. */
export interface DadosDoEcra {
  /**
   * Como ela lhe chama — «Proposta de Rita & Tomás», «Notas do pedido LQ-042».
   *
   * Nunca o nome do componente: este nome é lido por ela na resposta do botão e
   * na pergunta ao fechar o separador, e «ProposalStudio» não lhe diz que
   * proposta é que está em risco.
   */
  nome: string;
  /** Há trabalho que ainda não está no servidor. */
  porGravar: boolean;
  /** Grava já e diz onde ficou. Não pode lançar — quem chama trata disso à
   *  mesma, mas um ecrã que rebenta a gravar não pode levar os outros atrás. */
  gravarJa: () => Promise<ResultadoDoEcra>;
}

/** Uma inscrição viva. O `gravar` é reatribuído a cada desenho sem acordar
 *  ninguém: é uma função nova em cada render de quem se inscreveu, e avisar o
 *  botão por causa disso era voltar a desenhá-lo a cada tecla. */
interface Inscricao {
  id: string;
  nome: string;
  porGravar: boolean;
  gravar: () => Promise<ResultadoDoEcra>;
}

export interface ArmazemDoRegisto {
  subscrever(ouvinte: () => void): () => void;
  /** O instantâneo actual. Identidade estável enquanto nada MUDAR à vista —
   *  `useSyncExternalStore` compara por identidade e um array novo a cada
   *  leitura seria um ciclo de desenho infinito. */
  ler(): readonly Inscricao[];
  inscrever(id: string, dados: Omit<Inscricao, "id">): () => void;
  /** Só o que se vê (nome, porGravar) faz o botão voltar a desenhar. */
  actualizar(id: string, dados: { nome: string; porGravar: boolean }): void;
}

const VAZIO: readonly Inscricao[] = [];

export function criarArmazemDoRegisto(): ArmazemDoRegisto {
  const inscricoes = new Map<string, Inscricao>();
  const ouvintes = new Set<() => void>();
  let instantaneo: readonly Inscricao[] = VAZIO;

  const avisar = () => {
    instantaneo = [...inscricoes.values()];
    for (const f of ouvintes) f();
  };

  return {
    subscrever(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
    ler: () => instantaneo,
    inscrever(id, dados) {
      inscricoes.set(id, { id, ...dados });
      avisar();
      return () => {
        // Sair do registo ao desmontar é metade do trabalho: sem isto, o botão
        // ficava para sempre a dizer que há coisa por gravar num ecrã que já
        // não existe — e um contador que mente é um contador que se deixa de
        // ler, que é a avaria de origem noutro sítio desta casa.
        if (inscricoes.delete(id)) avisar();
      };
    },
    actualizar(id, dados) {
      const i = inscricoes.get(id);
      if (!i) return;
      if (i.nome === dados.nome && i.porGravar === dados.porGravar) return;
      i.nome = dados.nome;
      i.porGravar = dados.porGravar;
      avisar();
    },
  };
}

/** Um item da resposta: quem, e o que lhe aconteceu. */
export interface ItemDaResposta {
  nome: string;
  resultado: ResultadoDoEcra;
}

export interface RespostaDeGuardarTudo {
  /** Vazio significa que não havia nada por gravar — e diz-se isso, não
   *  «guardado». */
  itens: ItemDaResposta[];
  quando: Date;
}

export interface AccaoDeGuardarTudo {
  aGravar: boolean;
  resposta: RespostaDeGuardarTudo | null;
  /** Manda gravar TODOS os inscritos com coisa por gravar, ao mesmo tempo, e
   *  espera por todos. */
  guardarTudo: () => Promise<void>;
  dispensarResposta: () => void;
}

/**
 * Dois contextos, e não um.
 *
 * O armazém nunca muda, portanto quem só se inscreve (os ecrãs, que são os
 * componentes grandes) nunca volta a desenhar por causa disto. A acção muda
 * duas vezes por gesto — a começar a gravar e a acabar — e disso só o botão
 * precisa de saber. Num contexto só, cada clique no botão voltava a desenhar o
 * back office inteiro.
 */
const ContextoDoArmazem = createContext<ArmazemDoRegisto | null>(null);
const ContextoDaAccao = createContext<AccaoDeGuardarTudo | null>(null);

/** Junta nomes numa frase que se lê: «A, B e C». */
export function enumerarNomes(nomes: readonly string[]): string {
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

export interface LinhaDaResposta {
  nome: string;
  /** O que aconteceu a este, em palavras. */
  texto: string;
  /** Isto correu mal? A resposta não pode arredondar para melhor. */
  mau: boolean;
}

/**
 * As palavras exactas de cada desfecho.
 *
 * Está fora do componente para poder ser lida (e presa por testes) sem passar
 * por pixel nenhum: é a parte que não pode mudar por distracção. A regra:
 * **«guardado» só se diz quando TODOS ficaram no servidor.** Um de cinco a
 * faltar dá «Faltou guardar 1 de 5» — nunca um «guardado» com um aviso pequeno
 * ao lado, que é a mesma mentira com outra tipografia.
 */
export function frasesDaResposta(resposta: RespostaDeGuardarTudo): {
  titulo: string;
  linhas: LinhaDaResposta[];
  tudoBem: boolean;
} {
  const linhas: LinhaDaResposta[] = resposta.itens.map(({ nome, resultado }) => {
    if (resultado.estado === "guardado") {
      return { nome, texto: "guardado no servidor", mau: false };
    }
    if (resultado.estado === "so-neste-computador") {
      return {
        nome,
        texto: `guardado só neste computador — não chegou ao servidor.${
          resultado.porque ? ` ${resultado.porque}` : ""
        }`,
        mau: true,
      };
    }
    return {
      nome,
      texto: `não ficou guardado.${resultado.porque ? ` ${resultado.porque}` : ""}`,
      mau: true,
    };
  });

  const emFalta = linhas.filter((l) => l.mau).length;
  if (resposta.itens.length === 0) {
    return { titulo: "Não havia nada por gravar.", linhas, tudoBem: true };
  }
  if (emFalta === 0) {
    return { titulo: "Está tudo guardado no servidor.", linhas, tudoBem: true };
  }
  return {
    titulo: `Faltou guardar ${emFalta} de ${resposta.itens.length}.`,
    linhas,
    tudoBem: false,
  };
}

/** A frase da pergunta ao fechar o separador. */
export function fraseDoTravaoDeSaida(nomes: readonly string[]): string {
  return `Há trabalho por gravar: ${enumerarNomes(nomes)}.`;
}

export function RegistoDeGravacoesProvider({ children }: { children: ReactNode }) {
  const armazem = useMemo(() => criarArmazemDoRegisto(), []);
  const [aGravar, setAGravar] = useState(false);
  const [resposta, setResposta] = useState<RespostaDeGuardarTudo | null>(null);

  const guardarTudo = useCallback(async () => {
    const pendentes = armazem.ler().filter((i) => i.porGravar);
    if (pendentes.length === 0) {
      // Responder «guardado» a um gesto que não guardou nada é ensinar que a
      // palavra aparece sempre, carregue-se quando se carregar — e a partir
      // daí ela deixa de a poder acreditar quando importa.
      setResposta({ itens: [], quando: new Date() });
      return;
    }
    // O nome é fotografado AGORA: o ecrã pode fechar-se a meio da gravação (e
    // fecha-se — é o gesto de quem se vai levantar), e uma resposta sem nome
    // seria uma linha a dizer «não ficou guardado» sem dizer o quê.
    const aGravarAgora = pendentes.map((i) => ({ nome: i.nome, gravar: i.gravar }));
    setAGravar(true);
    try {
      const itens = await Promise.all(
        aGravarAgora.map(async ({ nome, gravar }): Promise<ItemDaResposta> => {
          try {
            return { nome, resultado: await gravar() };
          } catch {
            // Um ecrã que rebenta a gravar não pode levar os outros atrás, nem
            // desaparecer da resposta: sem isto, o `Promise.all` rejeitava e a
            // resposta ficava vazia — silêncio, que é o desfecho proibido.
            return { nome, resultado: { estado: "nao-guardado" } };
          }
        }),
      );
      setResposta({ itens, quando: new Date() });
    } finally {
      setAGravar(false);
    }
  }, [armazem]);

  /**
   * ── ⌘/Ctrl+S EM QUALQUER SÍTIO DO BACK OFFICE ────────────────────────────
   *
   * O atalho que toda a gente já tem nos dedos de outros programas, e o que o
   * browser faz com ele («guardar a página») não serve aqui a ninguém — daí o
   * `preventDefault`.
   *
   * Vale TAMBÉM com o cursor dentro de uma caixa de texto: é precisamente a
   * meio de escrever um parágrafo que apetece guardar, e não há um «guardar» do
   * browser dentro de um campo para lhe ficar no caminho.
   *
   * Vive aqui, e não no estúdio (que o tinha só para si), porque o gesto passa
   * a ser um só: o mesmo atalho, o mesmo resultado e a mesma resposta, esteja
   * ela onde estiver. O estúdio guarda o seu como recurso para quando é montado
   * fora deste registo — ver lá o comentário.
   */
  const guardarTudoRef = useRef(guardarTudo);
  useEffect(() => {
    guardarTudoRef.current = guardarTudo;
  }, [guardarTudo]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      void guardarTudoRef.current();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  /**
   * ── O TRAVÃO DE SAÍDA, UM SÓ E COM NOMES ─────────────────────────────────
   *
   * Cada ecrã tinha o seu `beforeunload`. Todos faziam a mesma coisa e nenhum
   * sabia dos outros, portanto a pergunta ao fechar o separador só podia dizer
   * «tem alterações por guardar» — sem dizer de quê, que é a informação de que
   * ela precisa para decidir se cancela.
   *
   * Com o registo há uma verdade sobre o back office inteiro, e a pergunta pode
   * nomear o que se perde. Escreve-se em `returnValue` com os olhos abertos: os
   * browsers deixaram de mostrar texto próprio (Chrome 51, Firefox 44) e
   * mostram a frase deles. Continua a valer — é o que é lido por quem automatiza
   * o browser, é o que aparece nos que ainda o mostram, e é onde a frase certa
   * fica escrita para o dia em que voltar a ser mostrada. O que trava mesmo é o
   * `preventDefault`, e esse é a razão de isto existir.
   */
  useEffect(() => {
    const aoFechar = (e: BeforeUnloadEvent) => {
      const nomes = armazem
        .ler()
        .filter((i) => i.porGravar)
        .map((i) => i.nome);
      if (nomes.length === 0) return;
      e.preventDefault();
      e.returnValue = fraseDoTravaoDeSaida(nomes);
    };
    window.addEventListener("beforeunload", aoFechar);
    return () => window.removeEventListener("beforeunload", aoFechar);
  }, [armazem]);

  const accao = useMemo<AccaoDeGuardarTudo>(
    () => ({
      aGravar,
      resposta,
      guardarTudo,
      dispensarResposta: () => setResposta(null),
    }),
    [aGravar, resposta, guardarTudo],
  );

  return (
    <ContextoDoArmazem.Provider value={armazem}>
      <ContextoDaAccao.Provider value={accao}>{children}</ContextoDaAccao.Provider>
    </ContextoDoArmazem.Provider>
  );
}

/** `null` quando não há registo — fora do back office, ou num teste que monta o
 *  ecrã sozinho. Quem depender disto tem de continuar a valer-se por si. */
export function useAccaoDeGuardarTudo(): AccaoDeGuardarTudo | null {
  return useContext(ContextoDaAccao);
}

const subscreverNada = () => () => {};
const lerVazio = () => VAZIO;

/** O que está inscrito, agora. Só quem chama isto volta a desenhar quando o
 *  registo muda. */
export function useInscritos(): readonly Inscricao[] {
  const armazem = useContext(ContextoDoArmazem);
  return useSyncExternalStore(
    armazem?.subscrever ?? subscreverNada,
    armazem?.ler ?? lerVazio,
    lerVazio,
  );
}

/**
 * Inscreve este ecrã enquanto ele estiver montado.
 *
 * Devolve **se há registo** — não se a inscrição foi feita. É essa a pergunta
 * que quem chama tem de fazer para decidir se mantém o seu próprio travão de
 * saída e o seu próprio ⌘S: com registo, quem fala é o registo; sem ele, cada
 * ecrã continua a valer-se por si, e um travão que desaparecesse em silêncio
 * seria a pior troca possível.
 */
export function useInscricaoNoRegisto(
  dados: DadosDoEcra & {
    /** `false` para um painel fechado, que não tem nada por gravar. */ activo?: boolean;
  },
): boolean {
  const armazem = useContext(ContextoDoArmazem);
  const id = useId();
  const { nome, porGravar, gravarJa } = dados;
  const activo = dados.activo ?? true;

  /** A função de gravar é nova a cada desenho de quem se inscreveu; o registo
   *  guarda esta, que é estável, e que chama sempre a mais fresca. */
  const gravarRef = useRef(gravarJa);
  const chamar = useCallback(() => gravarRef.current(), []);
  /** O que dizer na inscrição inicial. Um `ref` porque o efeito de inscrever
   *  não pode depender do nome — mudar de pedido no painel renomeia a
   *  inscrição, e não pode desinscrever e voltar a inscrever. */
  const ultimos = useRef({ nome, porGravar });

  useEffect(() => {
    gravarRef.current = gravarJa;
    ultimos.current = { nome, porGravar };
  });

  useEffect(() => {
    if (!armazem || !activo) return;
    return armazem.inscrever(id, {
      nome: ultimos.current.nome,
      porGravar: ultimos.current.porGravar,
      gravar: chamar,
    });
  }, [armazem, activo, id, chamar]);

  useEffect(() => {
    if (!armazem || !activo) return;
    armazem.actualizar(id, { nome, porGravar });
  }, [armazem, activo, id, nome, porGravar]);

  return armazem !== null;
}
