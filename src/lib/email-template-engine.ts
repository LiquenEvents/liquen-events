import { esc } from "./email-template-format";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O INTERPRETADOR DOS MODELOS — `{{variavel}}` E `{{#se}}`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sem `server-only`: isto corre no servidor (no envio) E no navegador (na
 * pré-visualização do back office). As duas metades TÊM de ser a mesma função,
 * senão o ecrã mostra um email e sai outro.
 *
 * ── PORQUÊ ESCRITO À MÃO E NÃO UMA BIBLIOTECA ─────────────────────────────
 *
 * A gramática que ela precisa cabe em vinte linhas: um nome entre chavetas
 * duplas e dois blocos condicionais. Um motor de modelos a sério (Handlebars e
 * afins) traz consigo helpers, sub-expressões, acesso a propriedades e, na
 * versão errada, execução — sobre texto ESCRITO POR UMA PESSOA no back office.
 * Interpretar pouco é aqui uma medida de segurança, não uma limitação.
 *
 * ── AS TRÊS REGRAS QUE VALEM MAIS DO QUE O CÓDIGO ─────────────────────────
 *
 * 1. NADA DE CHAVETAS PARA O CLIENTE. Uma variável desconhecida, um bloco por
 *    fechar, um fecho a mais — o que quer que corra mal, o que sai nunca
 *    contém `{{`. Um «Olá {{cliente_nome}},» na caixa de correio de um casal é
 *    pior do que um «Olá ,», porque mostra a máquina por dentro.
 *
 * 2. UM VALOR EM FALTA SAI VAZIO — e a resposta a «Olá ,» NÃO é inventar um
 *    valor («a definir», «o cliente»), é o BLOCO CONDICIONAL: quem escreve o
 *    modelo diz o que fazer quando não há dado. Inventar é escrever à socapa
 *    no email dela; o bloco é ela a decidir. Quem quiser recusar o envio em
 *    vez de deixar o buraco tem o {@link variaveisPorPreencher}, que só conta
 *    o que está A DESCOBERTO — uma variável guardada pelo seu próprio `{{#se}}`
 *    é uma decisão tomada, não um esquecimento.
 *
 * 3. O CORPO ESCAPA OS VALORES, O ASSUNTO NÃO. O corpo é markup e um nome com
 *    `<` não pode injectar etiquetas; o assunto é um cabeçalho RFC 5322 que o
 *    nodemailer codifica, e escapá-lo punha «Marta &amp; João» na única linha
 *    que o cliente lê antes de abrir. É a mesma divisão que o `renderTemplate`
 *    dos modelos antigos já fazia — ver `email-templates-store.ts`.
 *
 * O TEXTO ENTRE AS ETIQUETAS NÃO SE ESCAPA: é o markup dela, escrito no editor.
 * O que se escapa são os VALORES que lá entram, que vêm de dados do cliente.
 */

/** `{{#se x}}`, `{{#se_nao x}}`, `{{/se}}`, `{{/se_nao}}` ou `{{nome}}`. */
const RE_ETIQUETA =
  /\{\{\s*(?:(#se_nao|#se|\/se_nao|\/se)(?:\s+([A-Za-z_][A-Za-z0-9_]*))?|([A-Za-z_][A-Za-z0-9_]*))\s*\}\}/g;

type No =
  | { tipo: "texto"; valor: string }
  | { tipo: "var"; nome: string }
  | { tipo: "bloco"; negado: boolean; nome: string; filhos: No[] };

interface Aberto {
  negado: boolean;
  nome: string;
  filhos: No[];
  /** Onde começou, para a mensagem de erro dizer qual bloco ficou por fechar. */
  origem: string;
}

interface Analise {
  raiz: No[];
  erros: string[];
}

/**
 * Do texto para a árvore. Não atira NUNCA: um modelo mal escrito devolve a
 * melhor árvore possível mais a lista de erros, porque quem chama no envio
 * precisa de mandar alguma coisa e quem chama no editor precisa de a mostrar.
 */
function analisar(fonte: string): Analise {
  const erros: string[] = [];
  const raiz: No[] = [];
  const pilha: Aberto[] = [];
  const actuais = (): No[] => (pilha.length ? pilha[pilha.length - 1].filhos : raiz);

  let indice = 0;
  RE_ETIQUETA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_ETIQUETA.exec(fonte))) {
    if (m.index > indice) actuais().push({ tipo: "texto", valor: fonte.slice(indice, m.index) });
    indice = m.index + m[0].length;

    const comando = m[1];
    const argumento = m[2];
    const variavel = m[3];

    if (!comando) {
      actuais().push({ tipo: "var", nome: variavel });
      continue;
    }
    if (comando === "#se" || comando === "#se_nao") {
      if (!argumento) {
        // Sem nome não há condição possível. O bloco desaparece por inteiro em
        // vez de ficar a render-se sempre: `{{#se}}` é um erro de escrita, e
        // mostrar o conteúdo dava a ilusão de que a condição estava a funcionar.
        erros.push(`«${m[0]}» não diz de que variável depende (ex.: {{#se evento_data}}).`);
        continue;
      }
      pilha.push({ negado: comando === "#se_nao", nome: argumento, filhos: [], origem: m[0] });
      continue;
    }
    // Fecho.
    const aberto = pilha[pilha.length - 1];
    if (!aberto) {
      erros.push(`«${m[0]}» está sem abertura (falta o {{#se …}} correspondente).`);
      continue;
    }
    const fechoEsperado = aberto.negado ? "/se_nao" : "/se";
    if (comando !== fechoEsperado) {
      erros.push(
        `«${aberto.origem}» fecha com «{{${fechoEsperado}}}», mas está escrito «${m[0]}».`,
      );
      // Fecha-o à mesma: um fecho trocado é um engano de escrita, e recusar o
      // fecho fazia o resto do email desaparecer para dentro do bloco.
    }
    pilha.pop();
    const pai = pilha.length ? pilha[pilha.length - 1].filhos : raiz;
    pai.push({ tipo: "bloco", negado: aberto.negado, nome: aberto.nome, filhos: aberto.filhos });
  }
  if (indice < fonte.length) actuais().push({ tipo: "texto", valor: fonte.slice(indice) });

  // O que ficou aberto fecha-se no fim do texto, do mais interior para fora.
  while (pilha.length) {
    const aberto = pilha.pop()!;
    erros.push(
      `«${aberto.origem}» ficou por fechar (falta o {{/${aberto.negado ? "se_nao" : "se"}}}).`,
    );
    const pai = pilha.length ? pilha[pilha.length - 1].filhos : raiz;
    pai.push({ tipo: "bloco", negado: aberto.negado, nome: aberto.nome, filhos: aberto.filhos });
  }
  return { raiz, erros };
}

/** Um valor «tem conteúdo» quando, tirados os espaços, sobra alguma coisa. */
const temValor = (valores: Record<string, string>, nome: string): boolean =>
  String(valores[nome] ?? "").trim() !== "";

function desenhar(nos: No[], valores: Record<string, string>, escapar: boolean): string {
  let saida = "";
  for (const no of nos) {
    if (no.tipo === "texto") {
      saida += no.valor;
    } else if (no.tipo === "var") {
      const cru = String(valores[no.nome] ?? "");
      // O valor entra TAL E QUAL (ou escapado). Nunca volta ao interpretador:
      // um cliente chamado «{{remetente_nome}}» não pode passar a assinar o
      // email — e essa é a diferença entre substituir uma vez e substituir
      // em ciclo.
      saida += escapar ? esc(cru) : cru;
    } else {
      const verdade = temValor(valores, no.nome);
      if (no.negado !== verdade) saida += desenhar(no.filhos, valores, escapar);
    }
  }
  return saida;
}

/** O CORPO: markup dela, valores escapados. */
export function renderizarCorpo(fonte: string, valores: Record<string, string>): string {
  return desenhar(analisar(String(fonte ?? "")).raiz, valores, true);
}

/** O ASSUNTO: cabeçalho de email, valores por escapar (ver o cabeçalho). */
export function renderizarAssunto(fonte: string, valores: Record<string, string>): string {
  return desenhar(analisar(String(fonte ?? "")).raiz, valores, false);
}

/**
 * As variáveis que iam sair VAZIAS e estão A DESCOBERTO — as que dariam um
 * «Olá ,» a um cliente.
 *
 * Fica de fora, de propósito, tudo o que não chega a ser desenhado (dentro de
 * um bloco falso) e tudo o que está guardado por um bloco com o SEU nome: aí
 * ela já escreveu o que fazer sem o dado, e recusar o envio seria discutir uma
 * decisão que ela tomou.
 */
export function variaveisPorPreencher(fonte: string, valores: Record<string, string>): string[] {
  const emFalta: string[] = [];
  const visitar = (nos: No[], guardas: Set<string>) => {
    for (const no of nos) {
      if (no.tipo === "var") {
        if (!temValor(valores, no.nome) && !guardas.has(no.nome) && !emFalta.includes(no.nome)) {
          emFalta.push(no.nome);
        }
      } else if (no.tipo === "bloco") {
        if (no.negado === temValor(valores, no.nome)) continue; // não é desenhado
        const dentro = new Set(guardas);
        dentro.add(no.nome);
        visitar(no.filhos, dentro);
      }
    }
  };
  visitar(analisar(String(fonte ?? "")).raiz, new Set());
  return emFalta;
}

/** Os erros de escrita do modelo, em português, para o editor os mostrar. */
export function validarModelo(...fontes: string[]): string[] {
  const erros: string[] = [];
  for (const fonte of fontes) {
    for (const e of analisar(String(fonte ?? "")).erros) if (!erros.includes(e)) erros.push(e);
  }
  return erros;
}

/** Todas as variáveis que um modelo menciona (em `{{x}}` e nas condições). */
export function variaveisDoModelo(...fontes: string[]): string[] {
  const vistas: string[] = [];
  const visitar = (nos: No[]) => {
    for (const no of nos) {
      if (no.tipo === "texto") continue;
      if (!vistas.includes(no.nome)) vistas.push(no.nome);
      if (no.tipo === "bloco") visitar(no.filhos);
    }
  };
  for (const fonte of fontes) visitar(analisar(String(fonte ?? "")).raiz);
  return vistas;
}
