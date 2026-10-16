/**
 * Os totais de uma parte do CI, numa anotação que se lê pela API do GitHub
 * (os registos dos jobs não se descarregam daqui). Serve para conferir que as
 * partes, somadas, correram TUDO: os ficheiros de unidade e os passeios.
 *
 *   node scripts/ci/totais.mjs <vitest|playwright> <ficheiro.json> <título>
 */
import fs from "node:fs";

const [tipo, ficheiro, titulo] = process.argv.slice(2);
if (!fs.existsSync(ficheiro)) {
  console.log(`::warning title=${titulo}::sem relatório (${ficheiro})`);
  process.exit(0);
}
const r = JSON.parse(fs.readFileSync(ficheiro, "utf8"));
const texto =
  tipo === "vitest"
    ? `ficheiros=${r.testResults?.length} testes=${r.numTotalTests} passaram=${r.numPassedTests} falharam=${r.numFailedTests}`
    : `passeios=${(r.stats?.expected ?? 0) + (r.stats?.unexpected ?? 0) + (r.stats?.flaky ?? 0) + (r.stats?.skipped ?? 0)} passaram=${r.stats?.expected} falharam=${r.stats?.unexpected} instaveis=${r.stats?.flaky} saltados=${r.stats?.skipped}`;
console.log(`::notice title=${titulo}::${texto}`);
