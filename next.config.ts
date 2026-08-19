import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  // O SELO DE DESENVOLVIMENTO DO NEXT TAPA A NAVEGAÇÃO DO TELEMÓVEL.
  // É um botão fixo no canto inferior esquerdo — exactamente onde vive a barra
  // de baixo do back office. Em `next dev` a 375 px fica por cima do primeiro
  // destino: um toque ali abre o painel do Next em vez de mudar de vista, e o
  // passeio de ergonomia táctil vê o mesmo que um dedo veria (`<nextjs-portal>
  // intercepts pointer events`). Só existe em desenvolvimento — em produção
  // nunca esteve lá —, portanto desligá-lo não muda nada do que é servido.
  devIndicators: false,
  // Self-contained server bundle so the app can run in any container/cloud
  // (Vercel ignores this and uses its own build).
  output: "standalone",
  // sharp is a NATIVE module used directly in the proposal-PDF route (image
  // cover-crop). Keep it external so it's loaded from node_modules at runtime
  // instead of being bundled — a bundled native binary can fail to load on
  // serverless and throw when the first image is processed.
  //
  // O `pdfjs-dist` é externo por outra razão, e é uma que só se descobre em
  // produção: para LER um PDF, o pdf.js carrega o seu descodificador — o
  // «worker» — com um `import()` calculado em tempo de execução, e cai para
  // uma cópia dentro do mesmo processo quando não há Web Workers, que é o caso
  // do Node. Um `import()` cujo destino não é uma constante não é seguido pelo
  // empacotador: o módulo do worker fica fora do pacote, e o motor que lê as
  // propostas antigas (`src/lib/proposta-de-pdf`) rebentaria na primeira
  // leitura, já implantado, com um ficheiro que não se encontra. Externo, é o
  // Node a resolvê-lo a partir de node_modules, que é onde ele está.
  serverExternalPackages: ["sharp", "pdfjs-dist"],
  images: {
    // O CARREGADOR GLOBAL DO next/image. Toda a imagem que não passe um
    // `loader={…}` próprio deixa de pedir ao optimizador on-demand e passa a
    // apontar para um WebP estático gerado no build — ver
    // src/lib/site-image-loader.ts, que explica o porquê e traz as medições.
    //
    // ISTO DESLIGA O `/_next/image`. Não é um efeito lateral subtil: com
    // `images.loader !== "default"` o servidor responde 404 ao endpoint antes
    // de validar seja o que for (node_modules/next/dist/server/next-server.js:
    // 198). Medido contra este build, com o servidor de produção a correr:
    //   antes -> /_next/image?url=%2Flogo-liquen.png&w=256&q=55  HTTP 200
    //   depois-> o MESMO pedido                                  HTTP 404
    // Portanto NENHUM caminho do código pode voltar a construir um URL
    // `/_next/image` à mão e esperar uma imagem. Já há um sítio assim:
    // src/lib/image-src.ts (`sizedImageSrc`), usado pelo HeroCanvas — está
    // documentado no relatório, degrada sem partir a página (a camada WebGL
    // fica sem textura), mas é dívida a pagar.
    //
    // O `loader={…}` passado como prop CONTINUA a ganhar a este carregador
    // global — `let loader = rest.loader || defaultLoader` em
    // node_modules/next/dist/shared/lib/get-img-props.js:175 —, por isso os
    // heróis (src/components/HeroImage.tsx, escada até 2048) e a galeria
    // (GalleryImage) mantêm os seus intactos. Verificado por medição: o srcset
    // dos heróis continua a apontar para /_img/<chave>-2048.webp.
    loader: "custom",
    loaderFile: "./src/lib/site-image-loader.ts",
    // WebP only — no AVIF. AVIF compresses a few % smaller but o seu encode
    // on-the-fly é várias vezes mais lento, e um encode a frio de vários
    // segundos por imagem é exactamente o que fazia o optimizador esgotar o
    // tempo sob rajada ("às vezes nem carregam"). Depois de encodadas, ambas
    // ficam em cache imutável durante um ano, por isso a diferença de tamanho
    // só custaria ao primeiro visitante — não compensa.
    //
    // NOTA: as 427 miniaturas da galeria já NÃO passam por aqui. São ficheiros
    // WebP estáticos gerados no build (scripts/pregen-gallery.mjs +
    // src/app/[lang]/galeria/gallery-image-loader.ts), precisamente para não
    // dependerem de encode on-demand nenhum. O que resta neste optimizador é a
    // foto do lightbox e as imagens de conteúdo das outras páginas.
    formats: ["image/webp"],
    // NOTA DE 2026-07 (carregador global): esta lista já NÃO tem efeito
    // nenhum sobre o que é servido. Medido: com `loader: "custom"` o
    // `/_next/image` responde 404, portanto o `validateParams` que devolvia o
    // HTTP 400 descrito abaixo nunca chega a correr, e o `findClosestQuality`
    // vive no carregador por omissão, que passou a ser substituído pelo nosso
    // (build/create-compiler-aliases.js:146). O que a lista ainda faz é o aviso
    // de DESENVOLVIMENTO em get-img-props.js:423.
    //
    // FICA COMO ESTÁ, na mesma. Duas razões: é o que volta a mandar no instante
    // em que alguém tirar o `loaderFile` (e nessa altura um valor em falta
    // apaga a imagem em produção, sem aviso); e o teste que a guarda
    // (galeria/next-image-config.test.ts) continua a ser a única coisa que
    // impede um `quality={N}` novo de entrar sem ninguém olhar. Tirá-la seria
    // poupar seis números e reabrir uma armadilha já paga.
    //
    // ESTA LISTA TEM DE CONTER TODOS OS `quality={…}` DO SÍTIO. O optimizador
    // rejeita com HTTP 400 (`"q" parameter (quality) of N is not allowed`)
    // qualquer valor que não esteja aqui — ver
    // node_modules/next/dist/server/image-optimizer.js:635-643. Só se avisa em
    // DESENVOLVIMENTO (um warnOnce na consola); em produção a imagem
    // simplesmente nunca carrega, sempre, sistematicamente. Faltavam dois
    // valores que o código usa mesmo: 55 (o logótipo do Navbar, em todas as
    // páginas do sítio) e 70 (a página de confirmação de orçamento).
    //
    // 82 saiu: nenhum `quality={82}` existe no código (os heróis são servidos
    // por ficheiros pré-gerados a 75, ver scripts/pregen-heroes.mjs), e um
    // valor a mais aqui é só mais uma família de chaves de cache que ninguém
    // pede. 65 fica para o caminho de recurso da galeria.
    //
    // Ao mexer nesta lista: `npx tsx`-nada, basta
    // `grep -rho 'quality={[0-9]*}' src/ | sort -u`.
    qualities: [50, 55, 65, 70, 72, 75],
    // Tecto em 1920 — o mesmo que estava em produção.
    //
    // Esteve aqui um 2048 com um comentário a dizer que "baixámos de 2560";
    // 2560 nunca esteve na configuração publicada, por isso na prática o 2048
    // SUBIA o tecto. Medido, fazia o lightbox pedir w=2048 a 250,0 KB por foto
    // (a largura mais cara de toda a matriz) em portáteis 2x, para uma
    // diferença que ninguém vê numa foto em object-contain.
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [16, 32, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31_536_000,
    // Serve images inline instead of as attachment downloads
    contentDispositionType: "inline",
  },

  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,

  /**
   * O BANNER DOS EMAILS TEM DE CHEGAR AO SERVIDOR, NÃO À CDN.
   *
   * `public/` é servido como ficheiro estático — vai para a CDN e NÃO entra, por
   * omissão, no rastreio de ficheiros que acompanha as rotas de servidor. A
   * assinatura dos emails (`src/lib/email-assinatura.ts`) LÊ o banner do disco
   * para o mandar como anexo `cid:`, porque uma imagem remota num email parte-se
   * (ver a nota longa no `email-logo.ts`). Sem esta linha, o ficheiro existe no
   * repositório, existe no site, e não existe onde é preciso: o `readFileSync`
   * falha em produção, a assinatura sai sem banner e nada o denuncia.
   *
   * A chave é um glob de ROTA e o valor um caminho a partir da raiz do projecto.
   *
   * E é `/**`, não `/*`. O glob é avaliado com picomatch, onde um `*` NÃO
   * atravessa barras — medido nesta árvore, `/*` não apanha uma única rota
   * destas:
   *
   *     /*   → /api/orcamento  não · /api/inbox/reply  não
   *              /api/orcamento/[id]/proposta  não · .../fatura  não
   *     /**  → todas SIM
   *
   * Com `/*` o resultado seria o próprio defeito que este bloco existe para
   * evitar, e da pior maneira: silencioso. O `public/email/` não entrava no
   * pacote, o `readFileSync` falhava, e a assinatura saía sem banner sem
   * ninguém dar por isso — porque o ficheiro está no repositório e o site
   * mostra-o na mesma.
   */
  outputFileTracingIncludes: {
    /**
     * ══════════════════════════════════════════════════════════════════════
     * O BINÁRIO DO `sharp` TEM DE VIAJAR COM A FUNÇÃO — não viajava
     * ══════════════════════════════════════════════════════════════════════
     *
     * Em produção, o back office deixou de conseguir listar os TEMAS. O que os
     * registos do Vercel diziam não era um erro de base de dados nenhum:
     *
     *   Failed to handle /api/temas
     *   Error: Could not load the "sharp" module using the linux-x64 runtime
     *   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object
     *   file: No such file or directory
     *
     * Ou seja: a função rebentava INTEIRA (`FUNCTION_INVOCATION_FAILED`) antes
     * de chegar ao código da rota — e é por isso que o ecrã não conseguia
     * dizer o que se passava, e que a lista aparecia vazia como se os temas
     * dela tivessem desaparecido. Não tinham.
     *
     * E a rota dos temas nem sequer usa `sharp`: o empacotador junta rotas em
     * pedaços partilhados, e basta que o pedaço onde ela caiu referencie o
     * módulo para o carregamento ser tentado.
     *
     * ── PORQUE É QUE FALTAVA ─────────────────────────────────────────────
     * O `sharp` está em `serverExternalPackages` (ver acima, com a razão): não
     * é empacotado, é carregado de `node_modules` em tempo de execução. Quem
     * decide então o que vai dentro da função é o rastreador de ficheiros, que
     * segue `import`/`require` — e o `.so` do libvips não é importado por
     * ninguém: é aberto por `dlopen` a partir do binário, já em execução. O
     * rastreador não tem como o ver, e deixava-o para trás.
     *
     * As duas linhas abaixo são os dois pacotes que compõem o `sharp` no
     * Linux x64 (o alvo do Vercel): o vínculo Node e a biblioteca nativa que
     * ele abre. Com `/**` porque o pedaço partilhado pode cair em qualquer
     * rota — foi precisamente o que aconteceu com `/api/temas`.
     */
    "/**": [
      "public/email/**/*",
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },

  experimental: {
    // React <ViewTransition> (View Transitions API): página-a-página com
    // deslize direcional e morph thumbnail→lightbox na galeria. Browsers sem
    // suporte navegam normalmente, apenas sem animação.
    viewTransition: true,
  },

  async headers() {
    const isDev = process.env.NODE_ENV !== "production";

    // Plausible (optional analytics) is the only third party the BROWSER talks
    // to. Derive its exact origin from the script src so a self-hosted instance
    // is covered too — mirrors Analytics.tsx. Empty when analytics is disabled,
    // so the CSP stays tight by default (no analytics env = no extra surface).
    let plausibleOrigin = "";
    if (process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN) {
      try {
        plausibleOrigin = new URL(
          process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io/js/script.js",
        ).origin;
      } catch {
        plausibleOrigin = "https://plausible.io";
      }
    }
    const plausible = plausibleOrigin ? ` ${plausibleOrigin}` : "";

    // Google tag (gtag.js) for Google Ads conversion measurement + remarketing
    // (see GoogleTag.tsx / Consent Mode). These are the hosts the browser talks
    // to once the tag is active: the loader (googletagmanager.com), the pixel/
    // beacon endpoints (google-analytics + doubleclick + googleadservices), and
    // the conversion-linker iframe (td.doubleclick.net). Kept as tight as the
    // ad stack allows — no wildcards beyond the analytics beacon regions.
    const gaScript = " https://www.googletagmanager.com";
    const gaImg =
      " https://www.googletagmanager.com https://www.google.com https://www.google.pt https://googleads.g.doubleclick.net https://pagead2.googlesyndication.com";
    const gaConnect =
      " https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://www.google.com https://pagead2.googlesyndication.com";
    const gaFrame = "https://td.doubleclick.net https://www.googletagmanager.com";

    // ── Meta (Instagram/Facebook) ────────────────────────────────────────
    // Só abre quando NEXT_PUBLIC_META_PIXEL_ID está definido: sem pixel
    // configurado a política fica exactamente como estava, sem hosts a mais.
    //
    // Três hosts, e só três:
    //   connect.facebook.net  o `fbevents.js` (script);
    //   www.facebook.com      o beacon `/tr` (imagem E fetch — o pixel usa os
    //                         dois consoante o browser, por isso vai a img-src
    //                         e a connect-src);
    //   graph.facebook.com    NÃO entra. A Conversions API é chamada pelo
    //                         SERVIDOR (src/lib/meta/capi.ts), portanto o
    //                         browser nunca lhe toca e pô-la aqui seria abrir
    //                         uma porta que ninguém usa.
    const temMeta = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);
    const metaScript = temMeta ? " https://connect.facebook.net" : "";
    const metaImg = temMeta ? " https://www.facebook.com" : "";
    const metaConnect = temMeta ? " https://www.facebook.com" : "";

    // Image hosts the BROWSER loads via <img>: proposal cover/mood-board images
    // are served as signed URLs from Supabase Storage, and the (optional) gallery
    // CDN. Without these in img-src the browser blocks them and the thumbnail
    // renders as a broken image. Derive exact origins from env so the policy
    // stays as tight as possible (empty when unconfigured).
    const imgOrigins = Array.from(
      new Set(
        [
          process.env.SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_IMAGE_CDN,
        ]
          .map((v) => {
            if (!v) return "";
            try {
              return new URL(v).origin;
            } catch {
              return "";
            }
          })
          .filter(Boolean),
      ),
    ).join(" ");
    const imgExtra = imgOrigins ? ` ${imgOrigins}` : "";

    // Browser-side connections. Everything third-party runs SERVER-side with
    // non-public env (Supabase service key, Sentry DSN, Slack/Discord webhooks),
    // so the browser never opens those sockets — connect-src doesn't need them.
    // Web Push uses the ServiceWorker/PushManager (not fetch) and posts the
    // subscription same-origin. So production only needs 'self' plus Plausible's
    // event beacon (when enabled); dev keeps ws/https open for HMR.
    const connectSrc = isDev
      ? "connect-src 'self' https: wss: ws:"
      : `connect-src 'self'${plausible}${gaConnect}${metaConnect}`;

    // Content-Security-Policy.
    //
    // O `script-src 'unsafe-inline'` FICA, e não é por preguiça — é medido. A
    // tentação óbvia é passar a uma política com nonce emitido no proxy
    // (src/proxy.ts), como o guia do Next descreve em
    // node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
    // NESTE SÍTIO ISSO DEITA A CASA ABAIXO, e da pior maneira: em silêncio.
    //
    // A razão está escrita no próprio guia (secção "How nonces work in
    // Next.js"): o nonce é aplicado DURANTE A RENDERIZAÇÃO, a partir do
    // cabeçalho CSP do pedido. Ora quase todas as páginas deste sítio são
    // pré-renderizadas no build (`●` no mapa do `next build`: /, /galeria,
    // /servicos, /sobre, …) e servidas da cache de prerender — `curl -I`
    // devolve `x-nextjs-cache: HIT`. Não há pedido nenhum no momento em que o
    // HTML é gerado, portanto não há nonce nenhum para lá pôr.
    //
    // MEDIDO: com `script-src 'self' 'nonce-…' 'strict-dynamic'` no proxy e o
    // servidor de produção a correr, o Chromium a abrir /galeria dá
    //   • 43 <script> no HTML, 0 com nonce;
    //   • 42 violações de CSP na consola;
    //   • `'strict-dynamic'` faz o browser IGNORAR o `'self'`, por isso até os
    //     /_next/static/chunks/*.js são recusados → a hidratação nunca acontece;
    //   • e `history.scrollRestoration` fica em "auto" em vez de "manual",
    //     ou seja o restauro da posição da galeria morre — exactamente o
    //     sintoma silencioso de que a nota em galeria/page.tsx avisa.
    // A página continua a PARECER bem (o HTML estático desenha-se todo), e
    // nenhum teste de unidade dá erro. É por isso que existe o teste de
    // contrato em src/csp-nonce-contract.test.ts: ele prende a invariante
    // "se a política tiver nonce, o script da galeria tem de o receber".
    //
    // O que seria preciso para a mudança ser segura (nenhum destes passos cabe
    // neste ficheiro, e dois deles ficam fora da pasta que esta auditoria pode
    // tocar): (1) pôr todas as páginas em renderização dinâmica — o que troca
    // o HTML pronto no CDN por um render por visitante, o oposto de tudo o que
    // está optimizado neste repositório; (2) passar `nonce={…}` ao <script> de
    // galeria/page.tsx — MEDIDO: o React NÃO propaga o nonce para um
    // `dangerouslySetInnerHTML` escrito pela aplicação, só para os scripts do
    // próprio Next; (3) o mesmo em SpeculationRules.tsx e GoogleTag.tsx, que
    // sem nonce dão as 2 violações que sobram até nas rotas já dinâmicas.
    //
    // O resto da política — object-src, base-uri, frame-ancestors, form-action,
    // connect-src apertado — está fechado, e é aí que está o valor real.
    // 'unsafe-eval' é só de desenvolvimento (React refresh).
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${plausible}${gaScript}${metaScript}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${imgExtra}${gaImg}${metaImg}`,
      "font-src 'self' data:",
      connectSrc,
      "worker-src 'self'",
      "manifest-src 'self'",
      `frame-src 'self' ${gaFrame}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
      // report-to is the modern reporting directive (Reporting API v1); report-uri
      // is kept as the fallback for browsers that don't yet honour report-to. Both
      // point at the same collector endpoint.
      "report-to csp-endpoint",
      "report-uri /api/security/csp-report",
    ].join("; ");

    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
      // Named endpoint referenced by the CSP `report-to` directive above.
      {
        key: "Reporting-Endpoints",
        value: 'csp-endpoint="/api/security/csp-report"',
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        // Permissions-Policy.
        //
        // O `interest-cohort=()` que aqui estava sozinho JÁ NÃO PROTEGE NADA. O
        // FLoC foi retirado do Chrome em 2022; o nome continua a ser aceite pelo
        // analisador (por isso não dá erro nenhum na consola e parece que está a
        // funcionar), mas a funcionalidade que ele desligava deixou de existir.
        // Quem lhe sucedeu é a Topics API — `browsing-topics` —, e essa estava
        // aberta de par em par.
        //
        // MEDIDO neste build, com o servidor de produção a correr e o Chromium a
        // abrir /galeria (document.featurePolicy.allowsFeature):
        //   browsing-topics  -> true   (permitido!)
        //   interest-cohort  -> false  (mas é um nome morto)
        //   payment/usb/serial/hid/midi -> todos permitidos
        // Ou seja: a intenção de "não perfilar os visitantes por interesses",
        // escrita aqui em 2021, tinha deixado de ser cumprida — e este sítio
        // carrega mesmo a pilha de anúncios da Google (googletagmanager,
        // doubleclick, googleadservices), que é quem lê a Topics API.
        //
        // O QUE FICA DE FORA, DE PROPÓSITO: `join-ad-interest-group`,
        // `run-ad-auction` e `attribution-reporting`. São as APIs que sustentam
        // o REMARKETING e a MEDIÇÃO DE CONVERSÕES do Google Ads — isto é, uma
        // funcionalidade de negócio que a dona acrescentou de propósito (ver o
        // comentário do gtag mais acima). Desligá-las seria uma decisão
        // comercial, não uma correcção de segurança, por isso não é feita aqui.
        //
        // As restantes são capacidades que o sítio comprovadamente nunca usa
        // (não há `<video>`, nem `requestFullscreen`, nem Web USB/Serial/HID/
        // MIDI/Bluetooth em lado nenhum do código) — `(self)` em vez de `()` no
        // fullscreen/autoplay só para não amarrar o lightbox da galeria.
        key: "Permissions-Policy",
        value: [
          "accelerometer=()",
          "autoplay=(self)",
          // `bluetooth` NÃO entra: o Chromium ainda não a reconhece como
          // funcionalidade de Permissions-Policy e responde com
          // "Error with Permissions-Policy header: Unrecognized feature:
          // 'bluetooth'" na consola de TODAS as páginas (medido). Um aviso
          // permanente na consola é ruído que esconde os avisos verdadeiros, e
          // a Web Bluetooth já exige gesto do utilizador e contexto seguro.
          "browsing-topics=()",
          "camera=()",
          "display-capture=()",
          "fullscreen=(self)",
          "geolocation=()",
          "gyroscope=()",
          "hid=()",
          "idle-detection=()",
          "interest-cohort=()",
          "local-fonts=()",
          "magnetometer=()",
          "microphone=()",
          "midi=()",
          "payment=()",
          "screen-wake-lock=()",
          "serial=()",
          "usb=()",
          "xr-spatial-tracking=()",
        ].join(", "),
      },
      // Isolate the browsing context and block legacy cross-domain policy files.
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-site" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    ];

    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/imagens/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/logos/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Imagens pré-geradas no build: as capas de página (scripts/pregen-
        // heroes.mjs) e as 2 135 miniaturas da galeria (scripts/pregen-
        // gallery.mjs).
        //
        // SEM ISTO SÃO 427 IDAS AO SERVIDOR POR VISITA REPETIDA. Ficheiros em
        // public/ são servidos com `Cache-Control: public, max-age=0`
        // (verificado com `curl -I` contra o build de produção), ou seja o
        // browser revalida CADA UM em cada visita. Com as miniaturas da galeria
        // a virem daqui, isso passaria a ser uma tempestade de pedidos
        // condicionais numa página com 427 fotos — e o que se ganhou em tirar o
        // optimizador do caminho perdia-se outra vez em latência.
        //
        // `immutable` por um ano é a mesma política que /imagens já tem, e pela
        // mesma razão: os nomes não têm hash, portanto substituir uma foto
        // implica um nome novo. Como estes ficheiros DERIVAM de /imagens (que
        // já é imutável), não se acrescenta risco nenhum.
        source: "/_img/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Root-level static assets fetched on effectively every visit/crawl but
        // NOT served through /_next/image (so they miss minimumCacheTTL) and NOT
        // under /imagens or /logos: the PWA manifest icons and the social OG
        // image. With output:standalone (self-hosted, no platform CDN backfill)
        // these otherwise revalidate on every request. Hashless filenames, but
        // they only change on a deploy, so a long immutable TTL is safe.
        source: "/:file(og-liquen.jpg|icon-192.png|icon-512.png|icon-maskable-512.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },

  async redirects() {
    // Legacy URLs from the previous (Wix) site that Google still has indexed →
    // the equivalent page on the rebuilt site, so old search results and
    // bookmarks land on real content instead of a 404, and Google transfers the
    // old pages' ranking onto the new URLs. permanent → 308 (Google treats it
    // like a 301). Both the decoded and %-encoded forms of the accented paths
    // are listed because the incoming pathname can arrive either way.
    const APEX = "https://liquen-events.com";
    return [
      { source: "/eventos", destination: `${APEX}/servicos`, permanent: true },
      { source: "/serviços", destination: `${APEX}/servicos`, permanent: true },
      { source: "/servi%C3%A7os", destination: `${APEX}/servicos`, permanent: true },
      { source: "/contactos", destination: `${APEX}/contacto`, permanent: true },
      { source: "/portfólio-de-eventos", destination: `${APEX}/galeria`, permanent: true },
      { source: "/portf%C3%B3lio-de-eventos", destination: `${APEX}/galeria`, permanent: true },
      // Safety net: once www.liquen-events.com's DNS points here, forward every
      // remaining www request to the same path on the canonical apex host (the
      // one the whole site treats as canonical, SITE.url). Vercel's own domain
      // redirect normally covers this too — this just guarantees it in code.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.liquen-events.com" }],
        destination: `${APEX}/:path*`,
        permanent: true,
      },
    ];
  },
};

// Bundle analyzer.
//
// ATENÇÃO: `npm run analyze` NÃO produz relatório nenhum neste projecto. O
// @next/bundle-analyzer é um plugin de webpack e o `next build` do Next 16 usa
// Turbopack; o próprio build avisa "The Next Bundle Analyzer is not compatible
// with Turbopack builds, no report will be generated" — mas sai com código 0, o
// que faz o comando parecer bem-sucedido.
//
// Para ver o peso dos chunks a sério, uma destas duas:
//   • `npx next experimental-analyze` — o analisador do Turbopack (verificado:
//     corre e serve o relatório em http://127.0.0.1:4000);
//   • `next build --webpack`, que reactiva este plugin (build mais lento e não
//     é o que a produção usa, por isso os números afastam-se um pouco).
//
// O wrapper fica: é inerte quando ANALYZE não está definido e volta a funcionar
// se algum dia se voltar ao webpack.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default withBundleAnalyzer(nextConfig);
