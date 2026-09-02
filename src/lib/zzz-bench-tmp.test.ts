// @vitest-environment node
import { test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function bench(nome: string, n: number, fn: () => unknown) {
  for (let i = 0; i < Math.min(n, 50); i++) fn(); // aquecer
  const t0 = process.hrtime.bigint();
  let sink: unknown;
  for (let i = 0; i < n; i++) sink = fn();
  const dt = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(
    `BENCH ${nome}\tn=${n}\t${(dt / n).toFixed(4)} ms/op\tcontrolo=${JSON.stringify(sink).slice(0, 60)}`,
  );
}

test("micro-medicoes", async () => {
  const { getDictionary } = await import("@/lib/i18n");
  const { pt } = await import("@/lib/i18n/pt");
  const { en } = await import("@/lib/i18n/en");
  console.log(
    "DICT pt chaves-topo",
    Object.keys(pt).length,
    "bytes JSON",
    JSON.stringify(pt).length,
  );
  console.log(
    "DICT en chaves-topo",
    Object.keys(en).length,
    "bytes JSON",
    JSON.stringify(en).length,
  );
  console.log(
    "DICT pt.proposta bytes JSON",
    JSON.stringify((pt as Record<string, unknown>).proposta).length,
  );
  bench("getDictionary(pt)", 200000, () => getDictionary("pt").proposta.greeting);

  const { readProposalToken, createProposalToken } = await import("@/lib/proposal-token");
  const tok = createProposalToken("prop-medicao-0001");
  bench("readProposalToken (HMAC+verify)", 20000, () => readProposalToken(tok)?.proposalId);
  bench("createProposalToken", 20000, () => createProposalToken("x").length);

  const props = JSON.parse(
    readFileSync(path.join(process.cwd(), "data", "proposals.json"), "utf-8"),
  );
  const c3 = props.find((p: { id: string }) => p.id === "medicao-c3-46-caminhos");
  const c4 = props.find((p: { id: string }) => p.id === "medicao-c4-46-directas");

  const { inventarioDeFotos, marcaDaRef, fotosDaProposta } = await import("@/lib/proposta-fotos");
  console.log(
    "INVENTARIO c3",
    inventarioDeFotos(c3.doc).length,
    "c4",
    inventarioDeFotos(c4.doc).length,
  );
  bench("inventarioDeFotos (46)", 20000, () => inventarioDeFotos(c3.doc).length);
  bench(
    "marcaDaRef x46 (sha256)",
    20000,
    () => inventarioDeFotos(c3.doc).map((e) => marcaDaRef(e.ref)).length,
  );
  {
    const t0 = process.hrtime.bigint();
    let r: unknown;
    for (let i = 0; i < 200; i++) r = await fotosDaProposta(c4.doc);
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(
      `BENCH fotosDaProposta(46 directas)\tn=200\t${(dt / 200).toFixed(3)} ms/op\tcontrolo=${(r as unknown[]).length} fotos, 1a com original=${Boolean((r as { original?: string }[])[0].original)}`,
    );
  }
  {
    const t0 = process.hrtime.bigint();
    let r: unknown;
    for (let i = 0; i < 200; i++) r = await fotosDaProposta(c3.doc);
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(
      `BENCH fotosDaProposta(46 caminhos, SEM Supabase)\tn=200\t${(dt / 200).toFixed(3)} ms/op\tcontrolo=${(r as unknown[]).length} fotos, 1a com original=${Boolean((r as { original?: string }[])[0].original)}`,
    );
  }

  const { seloDoConteudo } = await import("@/lib/proposta-versao");
  bench("seloDoConteudo (sha256 do doc canonizado)", 5000, () => seloDoConteudo(c4).slice(0, 8));

  const { propostaDoLink } = await import("@/lib/proposta-do-link");
  const tokC4 = createProposalToken("medicao-c4-46-directas");
  {
    const t0 = process.hrtime.bigint();
    let r: unknown;
    for (let i = 0; i < 300; i++) r = await propostaDoLink(tokC4);
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(
      `BENCH propostaDoLink (ficheiro, NAO Supabase)\tn=300\t${(dt / 300).toFixed(3)} ms/op\tcontrolo=${(r as { proposta: { id: string } }).proposta.id}`,
    );
  }
});
