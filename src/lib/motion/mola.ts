import { MOLA } from "./tokens";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MOLA — para o que se larga a meio de um gesto
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── Porque é que uma curva não serve aqui ─────────────────────────────────
 *
 * Uma `transition` com `cubic-bezier` descreve um percurso com princípio e fim
 * conhecidos ANTES de começar. Uma fotografia largada a meio de um arrasto não
 * tem nenhum dos dois: vem com uma velocidade que ninguém escolheu, e o sítio
 * onde vai assentar pode mudar enquanto ela viaja. Aplicar-lhe uma curva é
 * fingir que o gesto acabou onde o dedo levantou — e lê-se sempre como atraso.
 *
 * ── Porque é que não há biblioteca ────────────────────────────────────────
 *
 * Porque isto são quarenta linhas. As bibliotecas de movimento pesam entre 30 e
 * 120 KB e trazem um sistema inteiro — variantes, orquestração, layout animado
 * — de que aqui se usaria uma função. O `@dnd-kit` que a casa já tem trata do
 * arrastar; o que lhe falta é só a assentada.
 *
 * ── O passo fixo, que não é detalhe ───────────────────────────────────────
 *
 * A integração usa um passo FIXO de 1/60 e não o tempo real entre quadros. Um
 * `dt` grande — a aba esteve em segundo plano, o telemóvel engasgou — faz a
 * mola divergir em vez de assentar: a peça salta para fora do ecrã e nunca
 * volta. Com passo fixo, uma máquina lenta vê a mola mais devagar; com passo
 * real, vê-a explodir. Entre as duas, a escolha não é difícil.
 */

const PASSO = 1 / 60;

/**
 * ── DOIS LIMIARES, E DUAS UNIDADES ────────────────────────────────────────
 *
 * MEDIDO, e à custa de um erro que vale a pena deixar escrito: o primeiro
 * limiar comparava a posição (px) e a velocidade (px/s) com o MESMO número.
 * Meio píxel por segundo é um centésimo de píxel por quadro — a mola ficava
 * quase parada durante trezentos milissegundos à espera de atingir uma
 * velocidade que ninguém consegue ver, e um arrasto de 200 px levava um
 * segundo inteiro a "assentar".
 *
 * Os dois números abaixo são o que o olho distingue, cada um na sua unidade:
 * meio píxel de distância, e oito píxeis por segundo — que é um oitavo de
 * píxel por quadro.
 */
const REPOUSO_PX = 0.5;
const REPOUSO_PX_S = 8;

export interface Ponto {
  x: number;
  y: number;
}

const emRepouso = (x: number, y: number, vx: number, vy: number) =>
  Math.hypot(x, y) <= REPOUSO_PX && Math.hypot(vx, vy) <= REPOUSO_PX_S;

/**
 * UM passo da física, e um só.
 *
 * Está aqui em vez de duplicado no `assentar` e no `percurso` porque a
 * alternativa é ter duas molas: a que corre no ecrã e a que os testes medem.
 * Duas cópias de uma equação é o mesmo defeito que a casa já apanhou com a
 * curva de assinatura — divergem em silêncio, e o teste passa a certificar
 * outra coisa.
 */
function avancar(p: Ponto, v: Ponto): void {
  const ax = (-MOLA.rigidez * p.x - MOLA.amortecimento * v.x) / MOLA.massa;
  const ay = (-MOLA.rigidez * p.y - MOLA.amortecimento * v.y) / MOLA.massa;
  v.x += ax * PASSO;
  v.y += ay * PASSO;
  p.x += v.x * PASSO;
  p.y += v.y * PASSO;
}

/**
 * Leva `de` até zero com a mola da casa, chamando `pintar` a cada quadro.
 *
 * Devolve uma função que CANCELA — e cancelar é obrigatório, não cortesia: se
 * o dedo voltar a pousar na peça enquanto ela ainda assenta, o gesto novo tem
 * de ganhar ao antigo. Sem isso, os dois escrevem `transform` no mesmo
 * elemento e a peça treme.
 *
 * `velocidade` é a que o gesto trazia ao largar. Passá-la é o que faz um
 * arrasto rápido continuar a viagem em vez de parar no ar — e é a diferença
 * entre a mola parecer física e parecer uma animação a começar do zero.
 */
export function assentar(
  de: Ponto,
  pintar: (p: Ponto) => void,
  velocidade: Ponto = { x: 0, y: 0 },
): () => void {
  const p: Ponto = { x: de.x, y: de.y };
  const v: Ponto = { x: velocidade.x, y: velocidade.y };
  let quadro = 0;
  let vivo = true;

  const passo = () => {
    if (!vivo) return;
    avancar(p, v);
    if (emRepouso(p.x, p.y, v.x, v.y)) {
      // Assenta EXACTAMENTE em zero. Parar a três décimos de píxel do sítio
      // deixa uma grelha de fotografias com todas as peças ligeiramente ao
      // lado — e ninguém sabe dizer porquê.
      p.x = 0;
      p.y = 0;
      pintar(p);
      vivo = false;
      return;
    }
    pintar(p);
    quadro = requestAnimationFrame(passo);
  };

  if (emRepouso(p.x, p.y, v.x, v.y)) return () => {};
  quadro = requestAnimationFrame(passo);
  return () => {
    vivo = false;
    if (quadro) cancelAnimationFrame(quadro);
  };
}

/**
 * O mesmo percurso, calculado de uma vez — para testes, e para quem precise de
 * saber quanto tempo a mola vai demorar antes de a mostrar.
 *
 * Corre a MESMA função de passo que o `assentar`, e acaba no mesmo zero
 * exacto. O tecto de quadros é uma rede: uma mola mal parametrizada não pode
 * transformar um teste num ciclo infinito.
 */
export function percurso(de: Ponto, velocidade: Ponto = { x: 0, y: 0 }, maxQuadros = 900): Ponto[] {
  const p: Ponto = { x: de.x, y: de.y };
  const v: Ponto = { x: velocidade.x, y: velocidade.y };
  const passos: Ponto[] = [];
  if (emRepouso(p.x, p.y, v.x, v.y)) return passos;

  for (let i = 0; i < maxQuadros; i += 1) {
    avancar(p, v);
    if (emRepouso(p.x, p.y, v.x, v.y)) {
      p.x = 0;
      p.y = 0;
      passos.push({ x: 0, y: 0 });
      break;
    }
    passos.push({ x: p.x, y: p.y });
  }
  return passos;
}

/** Quanto tempo a mola demora a assentar, em milissegundos. */
export function duracaoMs(de: Ponto, velocidade: Ponto = { x: 0, y: 0 }): number {
  return percurso(de, velocidade).length * PASSO * 1000;
}
