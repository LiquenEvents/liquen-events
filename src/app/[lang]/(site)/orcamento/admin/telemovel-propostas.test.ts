import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CICLO DA PROPOSTA NUM TELEMÓVEL — QUATRO MEDIÇÕES QUE NÃO PODEM VOLTAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tudo o que está aqui foi MEDIDO num iPhone SE (375×667, `isMobile`,
 * `hasTouch`, `deviceScaleFactor: 2`), com `(pointer: coarse)` verdadeiro — e
 * não deduzido da folha de estilos. Os números de antes ficam escritos porque
 * são eles que explicam porque é que a linha existe.
 *
 * ── PORQUE É QUE ISTO LÊ O CÓDIGO-FONTE E NÃO O DOM ────────────────────────
 * Estes defeitos são todos de GEOMETRIA sob `(pointer: coarse)` e sob
 * *container queries*. O jsdom não faz contas de layout nem avalia media
 * queries: um `render()` daria 0×0 a tudo e o teste ficaria verde por não
 * saber medir. A alternativa honesta é a que o `barra-inferior.test.tsx` já
 * usa — prender a DECISÃO no sítio onde ela está escrita. Quem medir a sério
 * é o passeio do Playwright; isto é a rede que impede a classe de cair fora
 * num refactor distraído.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(site)/orcamento/admin");
const ler = (f: string) => readFileSync(join(RAIZ, f), "utf8");

const PAGAMENTOS = ler("PaymentsPanel.tsx");
const CONTRATOS = ler("Contratos.tsx");
const CONSTRUTOR = ler("ProposalBuilder.tsx");

describe("o resumo do dinheiro dos pagamentos", () => {
  /**
   * MEDIDO a 375 px, com o painel a 343 px: três colunas fixas davam 68 px de
   * conteúdo a cada célula. "22 650,45 €" precisa de 94 px e o "Em falta"
   * (maior, `text-lg`) precisa de 106 px — os dois transbordavam da célula
   * para cima da vizinha, e a linha do IVA partia-se em QUATRO.
   *
   * Duas colunas passaram esses 68 px para 134, e o "Em falta" atravessava-as
   * as duas. Chegou para ele; não chegou para os outros dois.
   *
   * ── PORQUE É QUE ESTA ÂNCORA MUDOU DE SÍTIO ───────────────────────────
   * A medição seguinte foi feita no painel do DOSSIER, que é mais estreito do
   * que o do estúdio: 279 px a 375 de ecrã. Duas colunas dão lá 134 px de
   * CÉLULA, e o `p-3` do quadrado leva 24 — sobram 110 px de conteúdo para um
   * número que, em «202 889,00 €», precisa de 109. Um pixel não é folga: o
   * quadrado tinha uma moldura a mais, e era ela que estava a comer o número.
   *
   * A correcção não é mais uma coluna: é a moldura sair. Abaixo das 26 rem os
   * três quadrados perdem a borda própria e passam a três linhas da MESMA
   * caixa, separadas por um risco — o padrão do `Overview.tsx` (:1641). A
   * célula passa de 110 para 255 px de conteúdo, e o "Em falta" deixa de
   * precisar de atravessar coisa nenhuma porque já não há colunas para
   * atravessar. Por isso o `col-span-2` desapareceu: a propriedade que ele
   * garantia — nenhum destes números a meia largura num painel estreito —
   * passou a ser verdade por construção.
   *
   * O que este teste guarda agora é essa forma, nas duas pontas: uma caixa só
   * com `divide-y` no telemóvel, a grelha de três cartões a partir das 26 rem.
   */
  it("é uma caixa só com riscos enquanto o painel for estreito", () => {
    // A moldura passa para o GRUPO e sai de cada quadrado.
    expect(PAGAMENTOS).toMatch(/flex flex-col divide-y [^"]*rounded-xl border/);
    // E os quadrados só voltam a ter moldura própria a partir das 26 rem.
    expect(PAGAMENTOS).toMatch(/@min-\[26rem\]:rounded-xl @min-\[26rem\]:border\b/);
  });

  it("volta a ser uma grelha de três quando o painel tem largura para elas", () => {
    expect(PAGAMENTOS).toMatch(/@min-\[26rem\]:grid @min-\[26rem\]:grid-cols-3/);
    expect(PAGAMENTOS).toMatch(/@min-\[26rem\]:divide-y-0/);
  });

  it("nenhum dos três números se pode partir a meio", () => {
    // `whitespace-nowrap` no valor + `flex-wrap` na linha: ou o número cabe ao
    // lado do rótulo, ou desce inteiro para uma linha só dele. Nunca «202» numa
    // linha e «889,00 €» na seguinte, que é o que um `<p>` centrado fazia
    // dentro de 110 px.
    expect(PAGAMENTOS).toMatch(/const VALOR =[\s\S]{0,160}whitespace-nowrap/);
    expect(PAGAMENTOS).toMatch(/const QUADRADO =[\s\S]{0,160}flex flex-wrap/);
  });
});

describe("as linhas de pagamento no telemóvel", () => {
  /**
   * MEDIDO a 375 px: o botão que abre a edição do valor tinha 137,5 × 24 px,
   * o interruptor de Pago/Pendente 137,5 × 23,2 px e o × de remover
   * 18,4 × 33,6 px — os três abaixo dos 44 px, e o mais pequeno é o que apaga
   * dinheiro do registo. Depois: 137,5 × 44, 137,5 × 44 e 44 × 44.
   */
  it("dá 44 px de altura ao valor e ao interruptor, sem os descentrar", () => {
    // `pointer-coarse:min-h-11` e não `alvo-toque`: a classe da casa centra o
    // conteúdo, e estes dois estão alinhados com as colunas do formulário.
    const cresce = PAGAMENTOS.match(/pointer-coarse:min-h-11/g) ?? [];
    expect(cresce.length).toBeGreaterThanOrEqual(2);
  });

  it("dá 44 × 44 ao botão de remover um pagamento", () => {
    expect(PAGAMENTOS).toMatch(/className="alvo-toque text-foreground\/45 hover:text-\[#b5654a\]/);
  });
});

describe("o link do PDF do contrato", () => {
  /**
   * MEDIDO a 375 px: 46,9 × 36 px no cartão do telemóvel, encostado a um "Ver
   * termos" de 44 px — dois botões na mesma linha com alturas diferentes. A
   * versão em tabela tinha 32 px, e um tablet é um ecrã largo COM dedo.
   *
   * ── PORQUE É QUE ESTE TESTE MUDOU DE FORMA ────────────────────────────
   * Contava a classe DUAS vezes, porque o link estava escrito duas vezes —
   * uma no cartão do telemóvel, outra na tabela. Contar cópias era a única
   * coisa possível enquanto elas existiam, e era uma rede fraca: as duas já
   * tinham divergido em altura (`h-9` num sítio, `h-8` no outro) sem o teste
   * dar por isso, porque duas cópias erradas contam na mesma como duas.
   *
   * O link passou a ser um componente só, usado pelas duas formas. A rede
   * certa é agora esta: a decisão escrita UMA vez, e as duas formas a
   * chegarem-lhe. Se alguém voltar a escrever o link à mão numa delas, é o
   * primeiro `expect` que cai.
   */
  it("está escrito uma vez só — e é aí que cresce para 44 px no dedo", () => {
    const cresce = CONTRATOS.match(/inline-flex h-\d pointer-coarse:h-11 items-center/g) ?? [];
    expect(cresce).toHaveLength(1);
    expect(CONTRATOS).toMatch(/function PdfDoContrato\(/);
  });

  it("e as duas formas da lista usam-no — o cartão e a tabela", () => {
    const usos = CONTRATOS.match(/<PdfDoContrato\b/g) ?? [];
    expect(usos).toHaveLength(2);
  });
});

describe("a tabela de preços da proposta rápida", () => {
  /**
   * MEDIDO a 375 px, com o painel a 292 px: as três colunas fixas (64 + 96 +
   * 40) mais os intervalos comiam 224 px e deixavam 68 px à DESCRIÇÃO — quatro
   * letras à vista no campo que manda na proposta. Depois: 292 px.
   *
   * O limiar é da largura do PAINEL e não da janela: medido, ele tem 292 px a
   * 375, 469 px a 768, 661 px a 1024 e 444 px a 1280 — todos acima das 24 rem,
   * portanto no computador a linha continua a ser uma só.
   */
  it("dá a linha inteira à descrição quando o painel não chega às 24 rem", () => {
    expect(CONSTRUTOR).toMatch(/@container flex flex-col gap-2 mb-2/);
    expect(CONSTRUTOR).toMatch(/w-full min-w-0 @min-\[24rem\]:w-auto @min-\[24rem\]:flex-1/);
    expect(CONSTRUTOR).toMatch(/flex flex-wrap @min-\[24rem\]:flex-nowrap gap-2 items-center/);
  });

  it("esconde o cabeçalho das colunas quando elas deixam de estar em linha", () => {
    // Uma fila de títulos por cima de campos que já não estão debaixo dela
    // mente mais do que a ausência dela — é o que o `PaymentsPanel` já faz com
    // o `@max-[36rem]:hidden`.
    expect(CONSTRUTOR).toMatch(/hidden @min-\[24rem\]:flex gap-2 text-\[11px\]/);
  });

  it("dá 44 px de largura ao botão de remover a linha", () => {
    // A altura já vinha do `ui/Button.tsx`; a largura ficava presa em 40 px.
    expect(CONSTRUTOR).toMatch(/h-10 w-10 pointer-coarse:w-11 shrink-0/);
  });
});
