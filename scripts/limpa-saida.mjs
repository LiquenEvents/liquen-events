/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APAGA A SAÍDA DA CONSTRUÇÃO ANTERIOR — E GUARDA A CACHE, QUE É O QUE VALE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. A subida do Next 16.2.11 → 16.3.4 (feita para fechar um aviso
 * crítico de segurança) passou aqui e no CI, e REBENTOU no Vercel:
 *
 *     Error: ENOENT: no such file or directory,
 *            open '/vercel/path0/.next/next-server.js.nft.json'
 *
 * Medido três vezes, e a conclusão não deixa margem:
 *
 *     commit 4862e6b3, deploy automático (com cache) ....... ERRO
 *     commit 4862e6b3, redeploy com a cache desligada ...... PRONTO
 *     commit 51a4d316, deploy automático (com cache) ....... ERRO
 *
 * Mesmo código, resultados opostos. O que sobra da construção anterior é
 * restaurado por cima da nova, e a versão nova do Next tropeça no que a antiga
 * lá deixou.
 *
 * ── PORQUE É QUE ISTO NÃO É «DESLIGAR A CACHE» ─────────────────────────────
 *
 * Porque a cache VALE MESMO: é ela que evita recompilar o mundo a cada deploy,
 * e desligá-la de vez pagava esse preço todos os dias por causa de uma subida
 * de versão que acontece de meio em meio ano.
 *
 * O que se apaga é só a SAÍDA — o que a construção vai regerar dentro de
 * segundos. O `.next/cache`, que é a parte que poupa tempo, fica intacto.
 *
 * ── E PORQUE É QUE NÃO SE ESPERA QUE O NEXT SE DESENRASQUE ─────────────────
 *
 * Porque a alternativa é a dona do negócio ter de se lembrar de desligar uma
 * caixa chamada «Use existing Build Cache» na próxima vez que uma dependência
 * subir — e ela não tem de saber que essa caixa existe. Uma construção que se
 * limpa sozinha é uma coisa que nunca mais precisa de ser explicada a ninguém.
 */
import { readdirSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SAIDA = ".next";
const CACHE = join(SAIDA, "cache");
/** Onde fica escrito com que versão do Next é que esta cache foi feita. */
const MARCA = join(CACHE, "versao-do-next.txt");

/** A versão do Next instalada nesta construção. */
function versaoDoNext() {
  try {
    return JSON.parse(readFileSync("node_modules/next/package.json", "utf8")).version ?? "";
  } catch {
    return "";
  }
}

if (!existsSync(SAIDA)) {
  console.log("· sem `.next` — nada a limpar antes de construir.");
} else {
  /**
   * ── PRIMEIRO A DECISÃO SOBRE A CACHE, QUE É A PARTE CARA ─────────────────
   *
   * A primeira versão disto guardava a cache SEMPRE e limpava só a saída. Não
   * chegou: o deploy falhou na mesma, e foi essa falha que localizou a avaria.
   * Se limpar a saída e manter a cache continua a partir, e desligar a cache
   * inteira resolve, então o que está estragado está DENTRO da cache.
   *
   * Faz sentido: o `.next/cache` guarda trabalho de compilação, e trabalho
   * compilado por uma versão do Next não é para ser lido por outra.
   *
   * Por isso a cache não se deita fora todos os dias — deita-se fora UMA VEZ,
   * quando a versão muda. Nos outros dias fica inteira e continua a poupar o
   * que sempre poupou.
   */
  const versao = versaoDoNext();
  const anterior = existsSync(MARCA) ? readFileSync(MARCA, "utf8").trim() : "";
  if (existsSync(CACHE) && anterior !== "" && versao !== "" && anterior !== versao) {
    /**
     * ── E DENTRO DA CACHE, NEM TUDO É DO NEXT ────────────────────────────
     *
     * A primeira versão disto apagava o `.next/cache` inteiro — e levava com
     * ele as miniaturas pré-geradas (`pregen-gallery`, `pregen-logos`), que
     * são NOSSAS, não têm nada que ver com a versão do Next, e são caras: o
     * `ci.yml` guarda-as num passo próprio, e a última vez que se refizeram
     * do zero a construção ficou ~13 minutos mais lenta.
     *
     * Sai o que é do Next; fica o que é nosso.
     */
    const guardados = [];
    for (const nome of readdirSync(CACHE)) {
      if (nome.startsWith("pregen-") || nome === "versao-do-next.txt") {
        guardados.push(nome);
        continue;
      }
      rmSync(join(CACHE, nome), { recursive: true, force: true });
    }
    console.log(
      `· o Next mudou de ${anterior} para ${versao} — a cache dele foi deitada fora` +
        (guardados.length > 0
          ? ` (as miniaturas pré-geradas ficaram: ${guardados.filter((n) => n.startsWith("pregen-")).join(", ")}).`
          : "."),
    );
  }

  /** E a saída da construção anterior, essa, sai sempre: regera-se em segundos. */
  const apagados = [];
  for (const nome of readdirSync(SAIDA)) {
    if (nome === "cache") continue;
    rmSync(join(SAIDA, nome), { recursive: true, force: true });
    apagados.push(nome);
  }
  console.log(
    apagados.length === 0
      ? "· `.next` só tinha a cache — nada a limpar."
      : `· limpou ${apagados.length} entradas da construção anterior em \`.next\`.`,
  );
}

/**
 * E deixa dito com que versão é que esta cache vai ficar, para a construção
 * seguinte poder tomar a mesma decisão. Escreve-se ANTES de construir de
 * propósito: uma construção que rebente a meio deixa a marca certa na mesma, e
 * a seguinte não deita fora uma cache que está boa.
 */
const versaoAgora = versaoDoNext();
if (versaoAgora) {
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(MARCA, `${versaoAgora}\n`, "utf8");
}
