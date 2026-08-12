#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM SUPABASE DE MENTIRA, PARA A MEDIÇÃO PODER SER A SÉRIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O caminho do carregamento acaba no Supabase Storage, e sem ele a rota
 * responde 503 antes de um único byte sair do navegador. Medir assim mediria o
 * nada: o tempo de um 503 é sempre bom.
 *
 * Isto implementa a parte da API REST do Storage que a aplicação usa mesmo —
 * criar bucket, escrever objeto, listar, assinar leitura, emitir bilhete de
 * escrita e aceitar a escrita directa — em memória, no computador que corre o
 * teste. Os bytes atravessam de verdade a ligação estrangulada do Chrome, que
 * é a única coisa que o «antes» e o «depois» têm de partilhar para poderem ser
 * comparados.
 *
 * ── O que isto NÃO é ───────────────────────────────────────────────────────
 * Não é um Supabase. Não valida tokens a sério, não tem RLS e o PostgREST
 * responde vazio a tudo (as escritas na tabela das fotos são, no produto,
 * melhor-esforço e envoltas em try/catch — por isso não influenciam o que aqui
 * se mede). O que se está a medir é o CLIENTE e a REDE, e para isso a latência
 * do armazenamento verdadeiro seria ruído: variaria entre as duas corridas e
 * tornaria a comparação inútil.
 *
 * O atraso artificial (`--latencia`) existe para o tempo do servidor não ser
 * zero — um zero faria o «antes» parecer melhor do que é, porque esconderia o
 * custo de a foto dar um salto a mais (navegador → função → Storage).
 *
 *   node scripts/supabase-de-teste.mjs [--porta 54321] [--latencia 40]
 */
import { createServer } from "node:http";

const arg = (nome, omissao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 ? Number(process.argv[i + 1]) : omissao;
};
const PORTA = arg("porta", 54321);
const LATENCIA = arg("latencia", 40);

/** bucket → (caminho → { bytes, contentType, criadoEm }) */
const buckets = new Map();
const bucketDe = (nome) => {
  if (!buckets.has(nome)) buckets.set(nome, new Map());
  return buckets.get(nome);
};

/** tabela → linhas (o PostgREST de mentira, mais abaixo). */
const tabelas = new Map();

/** Contadores, para o teste poder afirmar por onde é que os bytes passaram. */
const contas = { escritas: 0, bytesEscritos: 0, bilhetes: 0, escritasDirectas: 0 };

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function corpo(req) {
  return new Promise((resolve) => {
    const partes = [];
    req.on("data", (c) => partes.push(c));
    req.on("end", () => resolve(Buffer.concat(partes)));
  });
}

const json = (res, code, valor) => {
  const texto = JSON.stringify(valor);
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "content-length": Buffer.byteLength(texto),
  });
  res.end(texto);
};

/**
 * Texto vindo de um pedido, seguro para ir parar a uma linha de registo.
 *
 * Fora tudo o que não seja imprimível (mudanças de linha e retornos incluídos,
 * que são o que permite forjar uma entrada inteira) e um tecto de comprimento,
 * para um URL absurdo não encher o ficheiro.
 */
const limpoParaRegisto = (valor) =>
  String(valor ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "\u00b7")
    .slice(0, 300);

/** `md5` do conteúdo, que é o que o Storage devolve como eTag. */
async function etag(bytes) {
  const { createHash } = await import("node:crypto");
  return createHash("md5").update(bytes).digest("hex");
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  const p = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
      "access-control-allow-headers": "*",
    });
    return res.end();
  }

  // ── Espreitadela dos contadores, para o teste ler no fim ──
  if (p === "/__contas") return json(res, 200, contas);
  if (p === "/__reset") {
    buckets.clear();
    tabelas.clear();
    Object.keys(contas).forEach((k) => (contas[k] = 0));
    return json(res, 200, { ok: true });
  }

  await dormir(LATENCIA);

  // ── Buckets ──
  if (p.startsWith("/storage/v1/bucket")) {
    const nome = p.replace("/storage/v1/bucket", "").replace(/^\//, "");
    if (req.method === "POST") {
      const b = JSON.parse((await corpo(req)).toString() || "{}");
      bucketDe(b.name ?? b.id);
      return json(res, 200, { name: b.name ?? b.id });
    }
    if (nome) {
      bucketDe(nome);
      return json(res, 200, { name: nome, id: nome, public: false });
    }
    return json(
      res,
      200,
      [...buckets.keys()].map((name) => ({ name, id: name })),
    );
  }

  // ── Bilhete de escrita directa (createSignedUploadUrl) ──
  const mBilhete = p.match(/^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/);
  if (mBilhete && req.method === "POST") {
    const [, bucket, caminho] = mBilhete;
    contas.bilhetes += 1;
    const token = `t-${Math.random().toString(36).slice(2)}`;
    return json(res, 200, {
      url: `/object/upload/sign/${bucket}/${caminho}?token=${token}`,
      token,
    });
  }
  // ── A escrita directa em si ──
  if (mBilhete && (req.method === "PUT" || req.method === "POST")) {
    const [, bucket, caminho] = mBilhete;
    const bytes = await corpo(req);
    bucketDe(bucket).set(caminho, {
      bytes,
      contentType: req.headers["content-type"] ?? "application/octet-stream",
      criadoEm: new Date().toISOString(),
    });
    contas.escritas += 1;
    contas.escritasDirectas += 1;
    contas.bytesEscritos += bytes.length;
    return json(res, 200, { Key: `${bucket}/${caminho}`, path: caminho });
  }

  // ── Assinar leitura, em lote ──
  const mLoteSign = p.match(/^\/storage\/v1\/object\/sign\/([^/]+)$/);
  if (mLoteSign && req.method === "POST") {
    const [, bucket] = mLoteSign;
    const b = JSON.parse((await corpo(req)).toString() || "{}");
    return json(
      res,
      200,
      (b.paths ?? []).map((caminho) => ({
        path: caminho,
        signedURL: `/object/sign/${bucket}/${caminho}?token=leitura`,
        error: null,
      })),
    );
  }

  // ── Assinar leitura, uma ──
  const mSign = p.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
  if (mSign && req.method === "POST") {
    const [, bucket, caminho] = mSign;
    return json(res, 200, {
      signedURL: `/object/sign/${bucket}/${caminho}?token=leitura`,
      signedUrl: `/object/sign/${bucket}/${caminho}?token=leitura`,
    });
  }
  // ── Servir o que foi assinado ──
  if (mSign && req.method === "GET") {
    const [, bucket, caminho] = mSign;
    const o = bucketDe(bucket).get(caminho);
    if (!o) return json(res, 404, { error: "não existe" });
    res.writeHead(200, {
      "content-type": o.contentType,
      "content-length": o.bytes.length,
      "cache-control": "max-age=3600",
      "access-control-allow-origin": "*",
    });
    return res.end(o.bytes);
  }

  // ── Listar ──
  const mList = p.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
  if (mList && req.method === "POST") {
    const [, bucket] = mList;
    const b = JSON.parse((await corpo(req)).toString() || "{}");
    const prefixo = b.prefix ? `${b.prefix.replace(/\/$/, "")}/` : "";
    const saida = [];
    for (const [caminho, o] of bucketDe(bucket)) {
      if (!caminho.startsWith(prefixo)) continue;
      const nome = caminho.slice(prefixo.length);
      if (nome.includes("/")) continue;
      saida.push({
        name: nome,
        id: `id-${nome}`,
        created_at: o.criadoEm,
        updated_at: o.criadoEm,
        metadata: {
          size: o.bytes.length,
          mimetype: o.contentType,
          eTag: `"${await etag(o.bytes)}"`,
        },
      });
    }
    const off = b.offset ?? 0;
    return json(res, 200, saida.slice(off, off + (b.limit ?? 100)));
  }

  // ── Escrever objeto (o caminho multipart, via função) ──
  const mObj = p.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
  if (mObj && (req.method === "POST" || req.method === "PUT")) {
    const [, bucket, caminho] = mObj;
    const bytes = await corpo(req);
    const alvo = bucketDe(bucket);
    // `upsert: false` recusa o que já lá está — é assim que o produto deteta a
    // foto repetida, e o teste conta com isso.
    const upsert = String(req.headers["x-upsert"] ?? "").toLowerCase() === "true";
    if (alvo.has(caminho) && !upsert) {
      return json(res, 409, { statusCode: "409", error: "Duplicate", message: "already exists" });
    }
    alvo.set(caminho, {
      bytes,
      contentType: req.headers["content-type"] ?? "application/octet-stream",
      criadoEm: new Date().toISOString(),
    });
    contas.escritas += 1;
    contas.bytesEscritos += bytes.length;
    return json(res, 200, { Key: `${bucket}/${caminho}`, path: caminho });
  }
  if (mObj && req.method === "DELETE") return json(res, 200, []);
  if (p.startsWith("/storage/v1/object/") && req.method === "DELETE") return json(res, 200, []);

  // ── PostgREST, o suficiente para a aplicação arrancar ──
  //
  // Começou por responder vazio a tudo. Não servia: o tema é uma LINHA, e sem
  // ela a rota do carregamento não encontra o tema e responde 404 — os bytes
  // subiam (medidos: 17–24 s cada) para serem deitados fora no fim. Um «antes»
  // assim mediria o tempo de um erro.
  //
  // Isto guarda linhas em memória e percebe o pedaço do PostgREST que o
  // `repository.ts` usa: `col=eq.valor`, `order`, `limit`, `offset`.
  if (p.startsWith("/rest/v1/")) {
    // O método e o caminho saem LIMPOS para o registo.
    //
    // O CodeQL assinala isto como «log injection», e tem razão mesmo sendo isto
    // uma ferramenta local: o `req.url` vem de quem faz o pedido, e uma mudança
    // de linha lá dentro forja uma entrada de registo inteira — quem depois lê o
    // ficheiro vê um pedido que nunca aconteceu. É barato de fechar e não vale a
    // pena discutir: tira-se o que não é imprimível e corta-se o comprimento.
    if (process.env.SB_VERBOSO)
      console.log(`[rest] ${limpoParaRegisto(req.method)} ${limpoParaRegisto(req.url)}`);
    const tabela = p.slice("/rest/v1/".length).split("?")[0];
    if (!tabelas.has(tabela)) tabelas.set(tabela, []);
    const linhas = tabelas.get(tabela);

    /** `?id=eq.X&pasta=eq.Y` → fica só com o que bate certo. */
    const filtrar = (lista) => {
      let saida = lista;
      for (const [chave, valor] of url.searchParams) {
        if (["select", "order", "limit", "offset", "on_conflict"].includes(chave)) continue;
        const [op, ...resto] = valor.split(".");
        const alvo = resto.join(".");
        if (op === "eq") saida = saida.filter((l) => String(l[chave]) === alvo);
        else if (op === "in") {
          const conjunto = new Set(
            alvo
              .replace(/^\(|\)$/g, "")
              .split(",")
              .map((v) => v.replace(/^"|"$/g, "")),
          );
          saida = saida.filter((l) => conjunto.has(String(l[chave])));
        } else if (op === "is" && alvo === "null") saida = saida.filter((l) => l[chave] == null);
      }
      return saida;
    };

    if (req.method === "GET") {
      let saida = filtrar(linhas);
      const ordem = url.searchParams.get("order");
      if (ordem) {
        const [col, dir] = ordem.split(".");
        saida = [...saida].sort(
          (a, b) =>
            String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1),
        );
      }
      const off = Number(url.searchParams.get("offset") ?? 0);
      const lim = Number(url.searchParams.get("limit") ?? saida.length);
      const pagina = saida.slice(off, off + lim);
      // `.single()` / `.maybeSingle()` pedem um OBJETO, não um array — é o que
      // o cabeçalho `application/vnd.pgrst.object+json` quer dizer. Sem isto o
      // `repo.get()` recebia `[{…}]` onde esperava `{…}`, o tema dava por não
      // encontrado e a rota do carregamento respondia 404 depois de receber a
      // fotografia inteira: 24 segundos de subida para nada.
      const querObjeto = String(req.headers.accept ?? "").includes("pgrst.object");
      if (querObjeto) return json(res, 200, pagina[0] ?? null);
      return json(res, 200, pagina);
    }
    if (req.method === "POST") {
      const b = JSON.parse((await corpo(req)).toString() || "[]");
      const novas = Array.isArray(b) ? b : [b];
      for (const nova of novas) {
        // `upsert` chega como POST com `on_conflict`: substitui em vez de somar.
        const chave = url.searchParams.get("on_conflict");
        const i = chave ? linhas.findIndex((l) => l[chave] === nova[chave]) : -1;
        if (i >= 0) linhas[i] = { ...linhas[i], ...nova };
        else linhas.push({ ...nova });
      }
      return json(res, 201, novas);
    }
    if (req.method === "PATCH") {
      const b = JSON.parse((await corpo(req)).toString() || "{}");
      const alvo = filtrar(linhas);
      for (const l of alvo) Object.assign(l, b);
      return json(res, 200, alvo);
    }
    if (req.method === "DELETE") {
      const alvo = new Set(filtrar(linhas));
      tabelas.set(
        tabela,
        linhas.filter((l) => !alvo.has(l)),
      );
      return json(res, 200, [...alvo]);
    }
    return json(res, 200, []);
  }

  json(res, 404, { error: "não implementado", path: p, method: req.method });
});

servidor.listen(PORTA, () => {
  console.log(`supabase-de-teste em http://localhost:${PORTA} (latência ${LATENCIA} ms)`);
});
