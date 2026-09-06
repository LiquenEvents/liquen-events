/**
 * "UMA CAIXA QUE SE DESVANECE MAS CONTINUA A APANHAR O TOQUE" — a prova.
 *
 * É o defeito mais caro que uma saída pode trazer, e é o único que os testes em
 * jsdom NÃO podem provar: o jsdom não tem disposição nenhuma e não decide
 * destinos de cliques, portanto `pointer-events` ali não muda nada. O que os
 * ficheiros `*.saida.test.tsx` prendem é o CICLO DE VIDA e o VOCABULÁRIO — que
 * a classe certa está no elemento que cobre o ecrã, no primeiro fotograma.
 *
 * Falta a ponta que só um browser a sério fecha: **com essa classe lá, o toque
 * chega mesmo ao botão que está por baixo.** É isto.
 *
 * ── O MÉTODO ──────────────────────────────────────────────────────────────
 *
 * A regra `.bo-saida` NÃO é copiada para aqui: é LIDA do `src/app/globals.css`
 * e injectada tal e qual. Uma cópia passava a valer por si própria no dia em
 * que alguém mudasse o original — que é exactamente o defeito que isto existe
 * para apanhar.
 *
 * A marcação é a das caixas desta casa: um botão da página, e por cima dele uma
 * moldura `position: fixed; inset: 0` — a forma que o `FolhaOuDialogo`, o
 * `CriarAPartirDe`, o `RestoreDialog`, o `SessaoExpirada`, o «Novo no
 * calendário» e o `PhotoLightbox` têm todos.
 *
 * Duas medições, e a primeira é o CONTROLO NEGATIVO:
 *
 *   1. moldura SEM a classe  → o toque tem de ficar preso nela. Sem isto, a
 *      medição seguinte passava numa página onde nada tapava nada.
 *   2. moldura COM a classe  → o toque tem de chegar ao botão.
 *
 * E não é só `elementFromPoint`: faz-se um `click` a sério, no meio do ecrã, e
 * conta-se quem o recebeu. `elementFromPoint` é o diagnóstico; o clique é o
 * gesto dela.
 *
 * USO
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node e2e/o-toque-passa-por-baixo.mjs
 *
 * Sai com 1 se alguma das medições não der o que tem de dar.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const CSS = readFileSync("src/app/globals.css", "utf8");

/** A regra tal como está escrita no ficheiro da casa, comentários fora. */
function regra(seletor) {
  const re = new RegExp(`${seletor.replace(".", "\\.")}\\s*\\{[^}]*\\}`);
  const m = re.exec(CSS.replace(/\/\*[\s\S]*?\*\//g, ""));
  if (!m) {
    console.error(`A regra ${seletor} desapareceu do globals.css.`);
    process.exit(1);
  }
  return m[0];
}

const BO_SAIDA = regra(".bo-saida");
const KEYFRAMES = (() => {
  const m = /@keyframes bo-saida\s*\{[\s\S]*?\n\}/.exec(CSS);
  return m ? m[0] : "";
})();

const PAGINA = (classe) => `
<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px system-ui; }
  #alvo {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    padding: 14px 22px; font: inherit;
  }
  /* A moldura das caixas desta casa: cobre o ecrã TODO. */
  .moldura { position: fixed; inset: 0; display: flex; }
  .caixa { margin: auto; padding: 40px; background: #fff; border-radius: 16px; }
  ${KEYFRAMES}
  ${BO_SAIDA}
</style></head><body>
  <button id="alvo">Gerar e enviar</button>
  <div class="moldura ${classe}" id="moldura"><div class="caixa">a caixa que se apaga</div></div>
<script>
  window.recebeu = [];
  document.getElementById("alvo").addEventListener("click", () => window.recebeu.push("alvo"));
  document.getElementById("moldura").addEventListener("click", () => window.recebeu.push("moldura"));
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 667 } });

async function medir(classe) {
  await page.setContent(PAGINA(classe));
  const sobPonto = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return el?.id || el?.className || el?.tagName;
  });
  // Um clique a sério, no meio do ecrã, sem forçar nada.
  await page.mouse.click(187, 333);
  const recebeu = await page.evaluate(() => window.recebeu.join(",") || "ninguem");
  const opacidade = await page.evaluate(
    () => getComputedStyle(document.getElementById("moldura")).pointerEvents,
  );
  return { sobPonto, recebeu, pointerEvents: opacidade };
}

console.log("regra lida do globals.css:", BO_SAIDA.replace(/\s+/g, " ").trim(), "\n");

const controlo = await medir("");
const comSaida = await medir("bo-saida");

console.log(
  "CONTROLO · moldura sem a classe".padEnd(34),
  `sob o ponto: ${String(controlo.sobPonto).padEnd(16)} clique recebido por: ${controlo.recebeu.padEnd(8)} pointer-events: ${controlo.pointerEvents}`,
);
console.log(
  "MEDIDA   · moldura com .bo-saida".padEnd(34),
  `sob o ponto: ${String(comSaida.sobPonto).padEnd(16)} clique recebido por: ${comSaida.recebeu.padEnd(8)} pointer-events: ${comSaida.pointerEvents}`,
);

const falhas = [];
// 1 · O controlo negativo tem de PRENDER o toque. Se não prender, a medição de
//     baixo não está a provar nada — é uma página onde nada tapava nada.
if (controlo.recebeu !== "moldura")
  falhas.push(`o controlo negativo não prendeu o toque (recebeu: ${controlo.recebeu})`);
// 2 · E com a classe, o toque tem de chegar ao botão que está por baixo.
if (comSaida.recebeu !== "alvo")
  falhas.push(`a caixa a sair continua a comer o toque (recebeu: ${comSaida.recebeu})`);

console.log(
  "\n" +
    (falhas.length === 0
      ? "OK — a caixa apaga-se e o toque passa por baixo dela."
      : "FALHOU:\n  · " + falhas.join("\n  · ")),
);

await browser.close();
process.exit(falhas.length === 0 ? 0 : 1);
