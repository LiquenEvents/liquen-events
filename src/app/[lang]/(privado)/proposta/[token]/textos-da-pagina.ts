import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PALAVRAS QUE SÃO DA PÁGINA, E NÃO DO DOCUMENTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Ampliar», «Fechar», «Fotografia 3 de 12». Nada disto existe no documento —
 * são gestos de um ecrã, e um ecrã é coisa que o PDF não tem. O documento tem
 * os seus (`proposal-doc-textos.ts`) e continua a ser de lá que sai tudo o que
 * o casal já leu no papel: os títulos das secções, os rótulos do orçamento, as
 * condições.
 *
 * ── PORQUE É QUE NÃO VIVEM NO DICIONÁRIO DO SÍTIO ─────────────────────────
 *
 * Porque o `getDictionary(locale)` responde na língua do VISITANTE, e esta
 * página segue a língua da PROPOSTA (`idiomaDaProposta` — a decisão está
 * escrita no cabeçalho da `page.tsx` e não se mexe). São dois eixos diferentes
 * com o mesmo nome; misturá-los era convidar o defeito que já cá esteve — a
 * moldura numa língua e o documento noutra, na mesma folha.
 *
 * Estas seguem o documento, e por isso são indexadas por
 * {@link IdiomaDaProposta} e não por `Locale`. O tipo é que o garante.
 */
export interface TextosDaPagina {
  /** O rótulo do botão que abre a fotografia em grande. */
  ampliar: string;
  fechar: string;
  anterior: string;
  seguinte: string;
  /**
   * «Fotografia 3 de 12» — o que o leitor de ecrã anuncia ao mudar de foto.
   *
   * É um MOLDE com `{i}` e `{n}`, e não uma função, porque isto atravessa a
   * fronteira servidor→cliente: uma função não se serializa, e o React
   * rebentaria a passá-la como propriedade a um Client Component. Ver
   * {@link contar}.
   */
  contagem: string;
  /** A célula que não conseguiu mostrar a fotografia. */
  fotoFalhou: string;
  /**
   * O botão que volta a tentar UMA fotografia — dentro da célula que falhou.
   *
   * Separado do {@link recarregarFotos} de propósito: são duas acções
   * diferentes (uma volta a pedir esta imagem, a outra vai buscar assinaturas
   * novas ao servidor) e enquanto tiveram o mesmo rótulo estavam os dois no
   * ecrã a dizer a mesma coisa, um por cima do outro.
   */
  tentarDeNovo: string;
  /** O botão que volta a pedir as assinaturas ao servidor. */
  recarregarFotos: string;
  /** O índice no topo, para se chegar às fotografias sem rolar tudo. */
  nestaPagina: string;
  inspiracao: string;
  /** O aviso de que a galeria não abriu — sem fotografias não há nada a fazer. */
  semFotos: string;

  /* ── AS ESCOLHAS DO CASAL (Fase 3) ─────────────────────────────────────── */
  /** O título da secção onde ela deixou alternativas. */
  escolhas: string;
  /** A linha que explica o que ali se faz, e o que acontece a seguir. */
  escolhasIntro: string;
  /** O botão de cada alternativa, para quem lê o ecrã: «Escolher …». */
  escolherEsta: string;
  /** A marca da que ficou escolhida. */
  escolhida: string;
  /**
   * O que se diz DEPOIS de a escolha seguir.
   *
   * Não é «guardado»: o que interessa ao casal não é o nosso registo, é saber
   * que a mensagem chegou a alguém. E é o que permite mudar de ideias sem
   * telefonar — a frase di-lo.
   */
  escolhaGuardada: string;
  /** A escolha não chegou ao servidor. Diz-se, e não se finge. */
  escolhaFalhou: string;
  /** O botão que tenta outra vez a mesma escolha. */
  escolhaRepetir: string;

  /* ── AS SECÇÕES DE CONDIÇÕES, DOBRADAS ─────────────────────────────────── */
  /**
   * O resumo de uma linha por baixo do título de cada secção dobrada.
   *
   * Uma secção fechada esconde o que lá está dentro, e um título sozinho não
   * chega para se decidir se vale a pena abrir: «Condições Gerais» podia ser
   * uma linha ou catorze. O resumo é o que substitui a leitura.
   *
   * Estão escritos a olhar para o TEXTO DA CASA, cláusula a cláusula, e por
   * isso só se mostram enquanto o texto for esse — quem decide é o
   * `blocoEDaCasa`. Onde ela reescreveu, a página conta os pontos
   * ({@link pontos}): menos útil, sempre verdade.
   */
  resumos: Readonly<Record<SeccaoDobravel, string>>;
  /** «9 pontos» — o molde com `{n}`, para quando não se pode resumir. */
  pontos: string;
  /** O mesmo, no singular. Um molde com `{n}` dizia «1 pontos». */
  umPonto: string;
}

/** As secções que a página dobra. Todas são texto de condições. */
export type SeccaoDobravel =
  | "notasImportantes"
  | "condicoesGerais"
  | "observacoesGerais"
  | "faseamento"
  | "cancelamento";

const PT: TextosDaPagina = {
  ampliar: "Ampliar",
  fechar: "Fechar",
  anterior: "Fotografia anterior",
  seguinte: "Fotografia seguinte",
  contagem: "Fotografia {i} de {n}",
  fotoFalhou: "Não foi possível mostrar esta fotografia.",
  tentarDeNovo: "Tentar de novo",
  recarregarFotos: "Voltar a carregar as fotografias",
  nestaPagina: "Nesta página",
  inspiracao: "Inspiração",
  semFotos: "As fotografias desta secção não estão disponíveis neste momento.",
  escolhas: "À vossa escolha",
  escolhasIntro:
    "Deixámos aqui algumas alternativas. Escolham a que preferirem: podem mudar de ideias, e falamos sobre isso na mesma.",
  escolherEsta: "Escolher",
  escolhida: "A vossa escolha",
  escolhaGuardada: "Ficámos a saber. Podem mudar de ideias quando quiserem.",
  escolhaFalhou: "Não foi possível registar a escolha.",
  escolhaRepetir: "Tentar outra vez",
  resumos: {
    notasImportantes: "A montagem e a desmontagem, e o que fica do lado do espaço.",
    condicoesGerais:
      "IVA, pré-reserva, deslocações da equipa e a confirmação do número de convidados.",
    observacoesGerais: "O uso do material, os direitos de imagem e a confidencialidade.",
    faseamento: "Quando se paga cada parte, e sobre que valor.",
    cancelamento: "O que acontece se o evento for cancelado, e em que prazos.",
  },
  pontos: "{n} pontos",
  umPonto: "1 ponto",
};

const EN: TextosDaPagina = {
  ampliar: "Enlarge",
  fechar: "Close",
  anterior: "Previous photo",
  seguinte: "Next photo",
  contagem: "Photo {i} of {n}",
  fotoFalhou: "This photo could not be shown.",
  tentarDeNovo: "Try again",
  recarregarFotos: "Load the photos again",
  nestaPagina: "On this page",
  inspiracao: "Inspiration",
  semFotos: "The photos in this section are not available right now.",
  escolhas: "Yours to choose",
  escolhasIntro:
    "We have left a few alternatives here. Pick the one you prefer: you can change your mind, and we will talk it through anyway.",
  escolherEsta: "Choose",
  escolhida: "Your choice",
  escolhaGuardada: "We have got it. Change your mind whenever you like.",
  escolhaFalhou: "We could not register your choice.",
  escolhaRepetir: "Try again",
  resumos: {
    notasImportantes: "Set-up and take-down, and what the venue is responsible for.",
    condicoesGerais: "VAT, booking, the team's travel, and confirming the final guest count.",
    observacoesGerais: "Use of the materials, image rights, and confidentiality.",
    faseamento: "When each part is due, and on which amount.",
    cancelamento: "What happens if the event is cancelled, and by when.",
  },
  pontos: "{n} points",
  umPonto: "1 point",
};

export function textosDaPagina(idioma: IdiomaDaProposta): TextosDaPagina {
  return idioma === "en" ? EN : PT;
}

/** O molde da contagem preenchido — a única forma de o ler, dos dois lados. */
export function contar(molde: string, i: number, n: number): string {
  return molde.replace("{i}", String(i)).replace("{n}", String(n));
}
