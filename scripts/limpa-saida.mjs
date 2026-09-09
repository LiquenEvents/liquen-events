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
import { readdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const SAIDA = ".next";
/** O que fica. Só isto: é a parte da pasta que poupa tempo em vez de o gastar. */
const GUARDAR = new Set(["cache"]);

if (!existsSync(SAIDA)) {
  console.log("· sem `.next` — nada a limpar antes de construir.");
  process.exit(0);
}

const apagados = [];
for (const nome of readdirSync(SAIDA)) {
  if (GUARDAR.has(nome)) continue;
  rmSync(join(SAIDA, nome), { recursive: true, force: true });
  apagados.push(nome);
}

console.log(
  apagados.length === 0
    ? "· `.next` só tinha a cache — nada a limpar."
    : `· limpou ${apagados.length} entradas da construção anterior em \`.next\` (a cache fica).`,
);
