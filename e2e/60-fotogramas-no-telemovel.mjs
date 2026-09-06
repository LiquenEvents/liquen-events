/**
 * ════════════════════════════════════════════════════════════════════════════
 * 60 FOTOGRAMAS NO TELEMÓVEL DELA — o arnês que mede, com o CPU travado
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. O back office ganhou dezenas de animações escritas com a regra
 * «só `transform` e `opacity`». A regra é boa e NÃO É PROVA: uma animação pode
 * cumpri-la e perder fotogramas na mesma — por um antepassado que força layout,
 * por uma camada que o browser não promove, por um `backdrop-filter` a pintar
 * por baixo, por demasiada coisa a animar ao mesmo tempo, ou por uma
 * `box-shadow` grande a ser repintada. Nenhuma delas tinha sido MEDIDA a
 * correr. Isto é a medida.
 *
 * E mede-se com o CPU travado porque ela trabalha num iPhone, em 4G fraco,
 * dentro de quintas — não neste contentor.
 *
 * ── OS TRÊS INSTRUMENTOS, E PORQUÊ CADA UM ─────────────────────────────────
 *
 *  1. **`requestAnimationFrame` a contar intervalos** — o número de fotogramas
 *     perdidos e o fotograma mais longo. Escolhido em vez do rasto do CDP por
 *     duas razões: (a) corre DENTRO do laço de fotogramas da própria página,
 *     portanto conta os fotogramas que o browser mesmo entregou, e não uma
 *     reconstrução a partir de eventos; (b) não custa nada. Ligar o
 *     `Tracing` do CDP acrescenta trabalho à mesma thread principal que já está
 *     travada 4× a 6× — mediria o instrumento e não a animação. Calibrado neste
 *     ambiente: em repouso a mediana do intervalo é **16,70 ms** às quatro
 *     taxas de travagem, ou seja o relógio de fotogramas é um vsync a 60 Hz a
 *     sério e não uma emulação.
 *
 *     LIMITE HONESTO, escrito para quem vier a seguir: o `rAF` só vê a THREAD
 *     PRINCIPAL. Uma animação puramente de compositor (um `transform` numa
 *     camada promovida) pode continuar fluida enquanto a thread principal está
 *     esfomeada — nesse caso este instrumento conta fotogramas perdidos a mais,
 *     não a menos. É o erro do lado seguro: nunca dá um verde que não exista.
 *
 *  2. **`Performance.getMetrics` do CDP** — `LayoutCount`, `LayoutDuration`,
 *     `RecalcStyleCount`, `RecalcStyleDuration`, em delta sobre a janela da
 *     animação. São os recálculos que o motor REALMENTE fez; é o mesmo
 *     instrumento (e a mesma razão) do `e2e/saida-do-aviso.mjs`.
 *
 *     O que o `getMetrics` NÃO tem é um contador de PINTURA — não existe
 *     nenhuma métrica de paint nesta lista (está toda ela impressa com
 *     `--metricas`). Por isso a pintura é inferida pelo terceiro instrumento e
 *     pelo `LayoutCount`: um layout obriga sempre a repintar; o contrário não.
 *
 *  3. **`long-animation-frame` (LoAF)** — a API do próprio browser para
 *     fotogramas com mais de 50 ms. Dá, além da duração, quanto foi `script` e
 *     quanto foi `styleAndLayout` — que é exactamente a repartição que diz se o
 *     fotograma longo foi a animação ou foi o React a montar por baixo dela.
 *     Serve de segunda opinião independente do `rAF`.
 *
 *  4. **`animationstart` e `transitionstart`** — a coluna `animou:` de cada
 *     linha de resultado. Não mede desempenho nenhum: mede se o cenário mediu
 *     ALGUMA COISA. Um gesto cujo toque falha o alvo dá zero fotogramas
 *     perdidos e parece um resultado excelente; com esta coluna dá `NADA` e
 *     denuncia-se. Custou três leituras falsas até estar cá — e apanhou, além
 *     disso, que a reordenação da lista não anima acima das 50 linhas.
 *
 * ── A TAXA DE TRAVAGEM, MEDIDA E NÃO ADIVINHADA ────────────────────────────
 *
 * Calibração feita neste contentor (Xeon 2,1 GHz, 4 vCPU, KVM), com um laço
 * determinístico de 4 000 000 de `Math.sqrt`:
 *
 *     1×  →  10 ms      4×  →  38 ms
 *     2×  →  19 ms      6×  →  56 ms
 *
 * A travagem do CDP é linear e exacta. Corre-se a 1× (controlo), 4× e 6×:
 *
 *   · **1×** é o controlo. Não é «um computador rápido»: um núcleo de servidor
 *     a 2,1 GHz não é dramaticamente mais rápido em JavaScript de thread única
 *     do que o A-series de um iPhone ainda em serviço. O 1× é, portanto, uma
 *     aproximação decente ao telemóvel dela EM REPOUSO, com bateria cheia e
 *     nada mais a acontecer.
 *   · **4×** é o degrau a que o DevTools chama «mid-tier mobile».
 *   · **6×** é o «low-tier», e é o número que interessa: é ele que representa o
 *     telemóvel dela A SÉRIO — o Safari a partilhar a thread principal com
 *     trabalho de rede em 4G fraco, o telefone quente ao fim de uma tarde de
 *     Verão numa quinta, e outras aplicações por trás. Não é uma estimativa do
 *     CPU do aparelho: é um CHÃO deliberado. Se o back office aguenta 6×,
 *     aguenta o pior dia dela.
 *
 * ── O QUE DEU, NA PRIMEIRA VEZ QUE ISTO CORREU ─────────────────────────────
 *
 * Servidor de produção (`.next` de 2026-09-06 15:21), iPhone a 390×844, lista
 * semeada com 140 pedidos, 5 repetições por número, MEDIANA (e o pior entre
 * parênteses). `perdidos` são vsyncs falhados; `maior` é o fotograma mais
 * longo, em milissegundos.
 *
 *                                             1×            4×             6×
 *   1a  troca de vista (barra de baixo)    0 ·   17     5 ·  100      12 ·  183
 *   1b  coluna de destinos + o filete      0 ·   17     7 ·  117      14 ·  183
 *   2a  painel do pedido a ABRIR          18 ·  300    81 · 1133     131 · 1767
 *   2b  painel do pedido a FECHAR          2 ·   33    26 ·  250      37 ·  400
 *   3a  estúdio  Conteúdo → Pré-visual.    0 ·   17     0 ·   17       0 ·   17
 *   3b  estúdio  Pré-visual. → Enviar      0 ·   17    10 ·   83      19 ·  150
 *   4   «Mais do painel» (escada)          4 ·   83    29 ·  433      61 ·  767
 *   5a  aviso a ENTRAR, pilha cheia        0 ·   17    11 ·  183      23 ·  317
 *   5b  aviso a SAIR, pilha cheia          0 ·   17    11 ·  167      21 ·  283
 *   6a  diálogo a ENTRAR                   0 ·   17     5 ·  100       9 ·  167
 *   6b  diálogo a SAIR                     0 ·   17     5 ·   83      10 ·  150
 *   7   lista a REORDENAR (>50 linhas)     1 ·   33    14 ·  250      21 ·  367
 *   7b  lista LONGA a re-desenhar          3 ·   67    32 ·  433      52 ·  683
 *   8   cartão do Kanban a aterrar         0 ·   17    13 ·  133      26 ·  233
 *   9   cabeçalho a encolher ao rolar      0 ·   17     1 ·   33       5 ·   67
 *
 * E com 46 pedidos (a lista inteira numa página, ou seja a reordenação que
 * ANIMA mesmo — ver a nota do cenário 7):
 *
 *   7   lista a REORDENAR, 46 linhas        0 ·   17     7 ·  133      14 ·  217
 *
 * ── A LEITURA, QUE É O QUE INTERESSA ───────────────────────────────────────
 *
 * **Nenhuma das perdas é da animação.** Em todos os cenários o `LayoutCount`
 * fica entre 0 e 20 para a janela INTEIRA (não por fotograma), o
 * `RecalcStyleCount` na mesma ordem, e o fotograma mais longo coincide, ao
 * milissegundo, com o `long-animation-frame` que o browser reporta. Ou seja: o
 * que come os fotogramas é o COMMIT do React que acontece no mesmo instante em
 * que a animação arranca — não a animação, que está composta e não remede nada.
 *
 * A confirmação mais limpa disso é a linha 3a: `animou: view-in`, **zero**
 * layouts, **zero** recálculos de estilo, zero fotogramas perdidos às três
 * taxas. Uma animação de `transform`/`opacity` numa camada promovida custa
 * literalmente nada à thread principal. As outras são a mesma animação com
 * trabalho de React por baixo.
 *
 * O caso a olhar é o **2a**: abrir o painel do pedido custa 1,8 s de ecrã
 * parado a 6×, e o LoAF diz que é um único fotograma de 1,9 s — o painel monta
 * uma árvore enorme (e mostra `bo-shimmer` enquanto espera). Isso é peso de
 * montagem, não de movimento, e corrige-se noutro sítio que não este.
 *
 * ── E O QUE ESTA MEDIÇÃO APANHOU E JÁ ESTÁ CORRIGIDO ───────────────────────
 *
 * Contra a compilação ANTERIOR (`.next` das 05:10 do mesmo dia), o mesmo arnês
 * dava, no cenário 9, **12 layouts** e a lista de animações
 * `padding-top, padding-bottom, font-size, letter-spacing` — o cabeçalho
 * `sticky` a animar DISPOSIÇÃO enquanto se rola. E a passagem `--reduzido`
 * acusava **nove animações a correr com `prefers-reduced-motion: reduce`**: as
 * do cabeçalho e o `translate` do filete. A causa está escrita, com a
 * compilação que a prova, no `duracao-com-guarda.test.ts` — uma duração sem
 * `motion-safe:` compila FORA da media query, o `transition-property` cai em
 * `all`, e quem pediu menos movimento recebe mais.
 *
 * Na compilação de agora: cenário 9 com **1 layout** e sem `padding`/`font-size`
 * na lista, e a passagem `--reduzido` a dizer «NENHUMA animação a correr em
 * nenhum dos gestos». Fica escrito porque é isto que uma medição serve para
 * fazer: confirmar de fora que a correcção pegou.
 *
 * ── A PREFERÊNCIA DE MOVIMENTO REDUZIDO, MEDIDA E NÃO ACREDITADA ───────────
 *
 * `node e2e/60-fotogramas-no-telemovel.mjs --taxas=1 --reduzido` corre os
 * mesmos quinze gestos com `prefers-reduced-motion: reduce` e, a meio de cada
 * um, pergunta ao browser o que ele tem MESMO a correr
 * (`document.getAnimations()`), em vez de acreditar no CSS. Resultado na
 * compilação de agora: **nenhuma animação em nenhum dos quinze gestos**.
 *
 * ── DUAS COISAS QUE ISTO APANHOU DE LADO, E NÃO SÃO DE FLUIDEZ ─────────────
 *
 * Ficam escritas porque foram MEDIDAS e têm receita para se reproduzirem; não
 * se corrigem a partir deste ficheiro, que é um instrumento.
 *
 *  · **Com o painel do pedido aberto, o «×» de um aviso não se consegue
 *    tocar.** `document.elementFromPoint` no centro do botão devolve o conteúdo
 *    do painel por baixo, e um toque real não fecha aviso nenhum; com o painel
 *    fechado, o mesmo ponto devolve o botão e o toque funciona. A pilha é
 *    `z-[80]`, o painel é `z-50`, e os avisos VÊEM-SE por cima — falha o teste
 *    de acerto, não a pintura. Está por extenso no cenário 5b.
 *  · **No estúdio, o chip «1 Conteúdo» está tapado.** Com o estúdio no passo 3,
 *    um toque no centro do chip não muda o `aria-current="step"`; nesse ponto o
 *    `elementFromPoint` devolve um `div.ml-auto.flex` da barra de acções. É por
 *    isso que não há cenário «Enviar → Conteúdo» — a nota está onde ele estaria.
 *
 * ── COMO CORRER ────────────────────────────────────────────────────────────
 *
 *   1. Um servidor de PRODUÇÃO (números de `next dev` são ruído de compilação):
 *
 *        npm run build
 *        NODE_ENV=production PORT=3411 \
 *        SESSION_SECRET=<32+ caracteres> \
 *        ADMIN_PASSWORD_HASH=<hash da palavra-passe de dev> \
 *        npx next start --port 3411
 *
 *      A palavra-passe de desenvolvimento e o seu hash bcrypt já estão no
 *      repositório — a primeira no `e2e/semear-pedido.ts`, o segundo no
 *      `scripts/bench-back-office.mjs` —, e este ficheiro vai lá buscá-los em
 *      vez de fazer uma terceira cópia. São públicos de propósito e nunca
 *      servem um servidor a sério: num servidor a sério o `ADMIN_PASSWORD_HASH`
 *      é outro e recusa-os.
 *
 *   2. Muitos pedidos na lista (o cenário 7 não vale com três linhas):
 *
 *        node e2e/60-fotogramas-no-telemovel.mjs --semear=140
 *        …medir…
 *        node e2e/60-fotogramas-no-telemovel.mjs --repor
 *
 *      `--semear` faz cópia de segurança de `data/` antes de escrever e
 *      `--repor` devolve-a. É OPT-IN pela mesma razão que no
 *      `bench-back-office.mjs`: sem a opção, este ficheiro não escreve nada em
 *      `data/`.
 *
 *   3. A medição:
 *
 *        node e2e/60-fotogramas-no-telemovel.mjs --taxas=1,4,6 --repeticoes=5
 *
 * Opções: `--url=` (por omissão http://localhost:3411), `--taxas=`,
 * `--repeticoes=`, `--so=<parte do nome de um cenário>`, `--largura=`,
 * `--altura=`, `--reduzido` (a passagem do `prefers-reduced-motion`),
 * `--metricas` (imprime os contadores que o CDP tem), `--json=<ficheiro>`.
 *
 * Fica FORA do `playwright.config.ts` de propósito, como o
 * `e2e/saida-do-aviso.mjs`: é um instrumento, não um passeio. Não tem `expect`s
 * de valor — imprime números para se lerem.
 */
import { chromium } from "playwright";
import { promises as fs } from "node:fs";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PASTA_DADOS = path.join(RAIZ, "data");
const COPIA = path.join(RAIZ, ".medicao-60fps-backup");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const URL_BASE = String(args.url ?? "http://localhost:3411");
const TAXAS = String(args.taxas ?? "1,4,6")
  .split(",")
  .map(Number)
  .filter((n) => n > 0);
const REPETICOES = Number(args.repeticoes ?? 5);
const SO = args.so ? String(args.so).toLowerCase() : null;
/** iPhone 14/15 em pontos CSS. O que ela tem na mão. */
const LARGURA = Number(args.largura ?? 390);
const ALTURA = Number(args.altura ?? 844);
const REDUZIDO = !!args.reduzido;

/**
 * O binário. Neste ambiente o Chromium do Playwright NÃO vive em
 * `~/.cache/ms-playwright` (essa pasta está vazia e já enganou agentes) — vive
 * em `/opt/pw-browsers`, que é o que o `PLAYWRIGHT_BROWSERS_PATH` diz.
 */
function acharChromium() {
  const candidatos = [
    process.env.CHROMIUM_BIN,
    process.env.CHROMIUM_PATH,
    "/opt/pw-browsers/chromium-1223/chrome-linux64/chrome",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  ].filter(Boolean);
  for (const c of candidatos) if (fsSync.existsSync(c)) return c;
  return undefined;
}

// ══════════════════════════════════════════════════════════════════════════
// A SEMENTE — muitos pedidos, para o cenário 7 valer alguma coisa
// ══════════════════════════════════════════════════════════════════════════

function aleatorioSemeado(s) {
  let a = s >>> 0;
  return () => {
    a ^= a << 13;
    a >>>= 0;
    a ^= a >> 17;
    a ^= a << 5;
    a >>>= 0;
    return a / 4294967296;
  };
}

const NOMES = [
  "Ana Sofia Ribeiro",
  "João Pedro Matos",
  "Marta Nunes",
  "Rui Almeida",
  "Inês Carvalho",
  "Tiago Ferreira",
  "Beatriz Lopes",
  "Miguel Sousa",
];
const LOCAIS = [
  "Quinta da Bela Vista, Sintra",
  "Herdade da Maridona, Glória",
  "Palácio de Seteais",
  "Quinta do Torneiro, Loures",
];
const ESTADOS_PEDIDO = ["pendente", "contactado", "proposta enviada", "aceite", "perdido"];
const CATEGORIAS = ["particulares", "empresas"];

async function semear(n) {
  await fs.mkdir(COPIA, { recursive: true });
  const jaCopiado = (await fs.readdir(COPIA)).length > 0;
  if (!jaCopiado) {
    for (const f of await fs.readdir(PASTA_DADOS)) {
      await fs.copyFile(path.join(PASTA_DADOS, f), path.join(COPIA, f));
    }
  }
  // Os pedidos VERDADEIROS ficam à frente: é a um deles que pertence o rascunho
  // do estúdio guardado em `data/app-state.json`, e sem ele o cenário 3 não tem
  // proposta nenhuma para percorrer.
  let originais = [];
  try {
    originais = JSON.parse(await fs.readFile(path.join(COPIA, "quotes.json"), "utf8"));
  } catch {
    /* instalação limpa */
  }
  const molde = originais[0] ?? null;

  const rnd = aleatorioSemeado(42);
  const escolhe = (a) => a[Math.floor(rnd() * a.length)];
  const quotes = [...originais];
  const proposals = [];
  const invoices = [];
  const tasks = [];
  const events = [];
  const contracts = [];

  for (let i = 0; i < n; i++) {
    const cat = escolhe(CATEGORIAS);
    const nome = `${escolhe(NOMES)} ${i}`;
    const id = `LIQ-MED${String(i).padStart(5, "0")}`;
    const data = `${2026 + Math.floor(rnd() * 2)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 27)).padStart(2, "0")}`;
    const enviado = new Date(Date.now() - Math.floor(rnd() * 400) * 86400000).toISOString();
    const estado = escolhe(ESTADOS_PEDIDO);
    quotes.push({
      ...(molde ?? {}),
      id,
      name: nome,
      email: `cliente${i}@exemplo.pt`,
      phone: `+351 9${10 + (i % 80)} ${100 + (i % 900)} ${100 + (i % 900)}`,
      company: cat === "empresas" ? `Empresa ${i} Lda.` : "",
      nif: "",
      guests: 40 + Math.floor(rnd() * 260),
      date: data,
      location: escolhe(LOCAIS),
      notes:
        "Pedido gerado para medição de desempenho, com uma descrição com algum " +
        "comprimento, como as reais costumam ter.",
      category: cat,
      eventType: cat === "particulares" ? "casamentos" : "corporativos",
      eventName: cat === "particulares" ? "Casamento" : "Evento corporativo",
      submittedAt: enviado,
      status: estado,
      lastUpdated: enviado,
      guestList: [],
      finalPrice: estado === "aceite" ? 3000 + Math.floor(rnd() * 20000) : undefined,
      tags: rnd() > 0.6 ? ["prioritário"] : [],
      activity: Array.from({ length: 3 }, (_, k) => ({
        at: new Date(Date.parse(enviado) + k * 3600000).toISOString(),
        by: "Catarina",
        what: "Estado alterado durante o acompanhamento do pedido.",
      })),
    });
    if (rnd() > 0.35) {
      const base = 2000 + Math.floor(rnd() * 18000);
      proposals.push({
        id: `prop-med-${i}`,
        quoteId: id,
        clientName: nome,
        clientEmail: `cliente${i}@exemplo.pt`,
        currency: "EUR",
        lineItems: Array.from({ length: 4 }, (_, k) => ({
          description: `Serviço ${k + 1} — decoração, coordenação e produção`,
          qty: 1,
          unitPrice: Math.floor(base / 6),
        })),
        vatRate: 0.23,
        subtotal: base,
        vat: base * 0.23,
        total: base * 1.23,
        status: escolhe(["rascunho", "enviada", "aceite", "rejeitada"]),
        createdAt: enviado,
        sentAt: enviado,
      });
    }
    if (rnd() > 0.5) {
      const valor = 1000 + Math.floor(rnd() * 9000);
      invoices.push({
        id: `inv-med-${i}`,
        number: `FT 2026/${String(i + 1).padStart(4, "0")}`,
        quoteId: id,
        clientName: nome,
        clientEmail: `cliente${i}@exemplo.pt`,
        kind: escolhe(["sinal", "saldo", "total"]),
        amount: valor,
        vatRate: 0.23,
        issuedAt: data,
        dueAt: data,
        paidAt: rnd() > 0.5 ? data : undefined,
        status: escolhe(["emitida", "paga"]),
        note: "",
      });
    }
    if (rnd() > 0.7) {
      tasks.push({
        id: `task-med-${i}`,
        title: `Confirmar fornecedor para ${nome}`,
        done: rnd() > 0.5,
        priority: escolhe(["baixa", "normal", "alta"]),
        dueDate: data,
        quoteId: id,
        clientName: nome,
        assignee: "Catarina",
        area: escolhe(["Comercial", "Produção", "Decoração", "Financeiro"]),
        createdAt: enviado,
      });
    }
    events.push({
      id: `evt-med-${i}`,
      title: `${nome} — ${cat === "particulares" ? "Casamento" : "Evento"}`,
      date: data,
      quoteId: id,
      kind: "evento",
      notes: "",
    });
    if (rnd() > 0.75) {
      contracts.push({
        id: `ct-med-${i}`,
        quoteId: id,
        proposalId: `prop-med-${i}`,
        clientName: nome,
        clientEmail: `cliente${i}@exemplo.pt`,
        termsVersion: "2026-01",
        termsSnapshot: "Condições gerais aceites pelo cliente (amostra de medição).",
        status: escolhe(["pendente", "aceite"]),
        createdAt: enviado,
        acceptedAt: enviado,
        acceptedName: nome,
      });
    }
  }
  const ficheiros = {
    "quotes.json": quotes,
    "proposals.json": proposals,
    "invoices.json": invoices,
    "tasks.json": tasks,
    "calendar-events.json": events,
    "contracts.json": contracts,
  };
  for (const [f, linhas] of Object.entries(ficheiros)) {
    await fs.writeFile(path.join(PASTA_DADOS, f), JSON.stringify(linhas, null, 2));
  }
  console.log(
    "semeado: " +
      Object.entries(ficheiros)
        .map(([f, r]) => `${r.length} ${f.replace(".json", "")}`)
        .join(", "),
  );
  console.log("Reinicia o servidor para ele ler isto, e no fim corre --repor.");
}

async function repor() {
  if (!fsSync.existsSync(COPIA)) {
    console.log("Não há cópia por repor.");
    return;
  }
  for (const f of await fs.readdir(PASTA_DADOS).catch(() => [])) {
    await fs.rm(path.join(PASTA_DADOS, f), { force: true });
  }
  for (const f of await fs.readdir(COPIA)) {
    await fs.copyFile(path.join(COPIA, f), path.join(PASTA_DADOS, f));
  }
  await fs.rm(COPIA, { recursive: true, force: true });
  console.log("dados originais repostos");
}

// ══════════════════════════════════════════════════════════════════════════
// O AMOSTRADOR — instalado em cada documento, antes de haver documento
// ══════════════════════════════════════════════════════════════════════════

/**
 * Dois observadores e um laço, e nada mais. Corre em `addInitScript` para estar
 * de pé antes de o React montar — um `evaluate` a meio da medição custava um
 * turno de thread principal exactamente onde não pode custar nada.
 */
const AMOSTRADOR = `
window.__med = { t: [], activo: false, loaf: [], anim: [] };
/**
 * QUE animações correram MESMO nesta janela. Um ouvinte de \`animationstart\` e
 * outro de \`transitionstart\` não custam nada enquanto nada anima (só disparam
 * quando o browser arranca uma) e são a prova de que o cenário mediu o que diz
 * medir — sem isto, um cenário cuja animação não chegou a correr dá zero
 * fotogramas perdidos e parece um resultado excelente.
 */
for (const tipo of ["animationstart", "transitionstart"]) {
  document.addEventListener(tipo, (e) => {
    if (!window.__med.activo) return;
    const alvo = e.target;
    window.__med.anim.push({
      nome: e.animationName || e.propertyName || "?",
      classe: alvo && alvo.className ? String(alvo.className).slice(0, 90) : (alvo ? alvo.tagName : ""),
      t: performance.now(),
    });
  }, true);
}
try {
  new PerformanceObserver((lista) => {
    for (const e of lista.getEntries()) {
      window.__med.loaf.push({
        inicio: e.startTime,
        dur: e.duration,
        render: e.renderStart ? e.renderStart - e.startTime : 0,
        estiloLayout: e.styleAndLayoutStart ? e.duration - (e.styleAndLayoutStart - e.startTime) : 0,
      });
    }
  }).observe({ type: "long-animation-frame", buffered: false });
} catch {}
window.__medComecar = () => {
  window.__med.t = [];
  window.__med.loaf = [];
  window.__med.anim = [];
  window.__med.activo = true;
  const passo = (agora) => {
    if (!window.__med.activo) return;
    window.__med.t.push(agora);
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
  return performance.now();
};
window.__medMarcar = () => performance.now();
window.__medParar = () => {
  window.__med.activo = false;
  return { t: window.__med.t, loaf: window.__med.loaf, anim: window.__med.anim };
};
/** Quantas animações/transições o browser tem MESMO a correr agora. */
window.__medAnimacoes = () => {
  try {
    return document.getAnimations().filter((a) => a.playState === "running").map((a) => {
      const alvo = a.effect && a.effect.target;
      return {
        nome: a.animationName || a.transitionProperty || "?",
        classe: alvo && alvo.className ? String(alvo.className).slice(0, 90) : (alvo ? alvo.tagName : ""),
      };
    });
  } catch { return []; }
};
`;

/** O vsync desta máquina, medido: 16,70 ms. */
const FOTOGRAMA_MS = 1000 / 60;

/**
 * O resumo de uma janela de fotogramas.
 *
 * `perdidos` conta VSYNCS FALHADOS, não intervalos maus: um intervalo de 50 ms
 * perdeu dois fotogramas, não um. É a conta que o Chrome faz e a única que soma
 * de forma comparável entre animações de durações diferentes.
 */
function resumirFotogramas(carimbos, desde) {
  const t = carimbos.filter((x) => x >= desde);
  const dif = [];
  for (let i = 1; i < t.length; i++) dif.push(t[i] - t[i - 1]);
  if (!dif.length) return { fotogramas: 0, perdidos: 0, maiorMs: 0, janelaMs: 0 };
  let perdidos = 0;
  for (const d of dif) perdidos += Math.max(0, Math.round(d / FOTOGRAMA_MS) - 1);
  return {
    fotogramas: t.length,
    perdidos,
    maiorMs: Math.max(...dif),
    janelaMs: t[t.length - 1] - t[0],
  };
}

async function contadores(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return {
    layouts: m.LayoutCount,
    layoutMs: m.LayoutDuration * 1000,
    estilos: m.RecalcStyleCount,
    estiloMs: m.RecalcStyleDuration * 1000,
  };
}

const mediana = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ══════════════════════════════════════════════════════════════════════════
// ENTRAR
// ══════════════════════════════════════════════════════════════════════════

/**
 * A palavra-passe de desenvolvimento já está no repositório (ver
 * `e2e/semear-pedido.ts`) e é pública de propósito: um servidor a sério tem
 * `ADMIN_PASSWORD_HASH` próprio e nunca aceita esta.
 */
/**
 * ── UMA ENTRADA POR CORRIDA, E NUNCA MAIS ──────────────────────────────────
 *
 * O `POST /api/admin/login` tem dois tectos POR ENDEREÇO: oito por minuto e
 * SESSENTA À HORA. Estão certos e não se tocam. Uma corrida com três taxas
 * abria três contextos e entrava três vezes; uma tarde a afinar o arnês gastou
 * o contador da hora e a corrida seguinte morreu no `waitFor` da barra de
 * baixo, com uma mensagem que se lê como «o back office não abre» e manda
 * procurar a avaria no sítio errado.
 *
 * Entra-se uma vez e guarda-se o estado EM MEMÓRIA (`ctx.storageState()`, sem
 * ficheiro nenhum: uma sessão autenticada não se escreve em disco). As taxas
 * seguintes nascem com ela posta e não gastam entrada nenhuma. É o mesmo
 * remédio, e a mesma razão, do `e2e/sessao-admin.setup.ts`.
 */
let sessaoGuardada = null;

/**
 * As credenciais de desenvolvimento — LIDAS de onde já vivem, não copiadas.
 *
 * O `e2e/semear-pedido.ts` já traz o email e a palavra-passe de dev, e o
 * comentário do `scripts/bench-back-office.mjs` explica porque é que elas são
 * públicas de propósito (um servidor a sério tem `ADMIN_PASSWORD_HASH` próprio
 * e recusa-as). Uma terceira cópia aqui era uma terceira coisa para divergir —
 * e uma credencial a mais escrita num ficheiro. Vai-se buscar a de lá; quem
 * quiser outras passa `MEDICAO_EMAIL` / `MEDICAO_PALAVRA_PASSE` no ambiente.
 */
function credenciaisDeDesenvolvimento() {
  const doAmbiente = {
    email: process.env.MEDICAO_EMAIL,
    palavraPasse: process.env.MEDICAO_PALAVRA_PASSE,
  };
  if (doAmbiente.email && doAmbiente.palavraPasse) return doAmbiente;
  const fonte = fsSync.readFileSync(path.join(RAIZ, "e2e/semear-pedido.ts"), "utf8");
  const email = fonte.match(/email\.fill\("([^"]+)"\)/)?.[1];
  const palavraPasse = fonte.match(/input\[name="password"\][\s\S]{0,40}?\.fill\("([^"]+)"\)/)?.[1];
  if (!email || !palavraPasse) {
    throw new Error(
      "não encontrei as credenciais de dev no `e2e/semear-pedido.ts` — passa " +
        "MEDICAO_EMAIL e MEDICAO_PALAVRA_PASSE no ambiente.",
    );
  }
  return { email, palavraPasse };
}

async function entrar(page) {
  await page.goto(URL_BASE + "/orcamento/admin", { waitUntil: "domcontentloaded" });
  const barra = page.locator('nav[aria-label="Destinos principais"]');
  let limitado = false;
  page.on("response", (r) => {
    if (r.url().includes("/api/admin/login") && r.status() === 429) limitado = true;
  });
  const email = page.getByLabel(/O teu email/i);
  // Ou já se está dentro (sessão reaproveitada), ou aparece o campo do email.
  // A espera é por UM DOS DOIS e não pela barra sozinha — a barra só existe
  // depois de entrar, e esperar por ela primeiro gastava o tempo todo.
  await Promise.race([
    email.waitFor({ timeout: 60_000 }).catch(() => {}),
    barra.waitFor({ timeout: 60_000 }).catch(() => {}),
  ]);
  if (await barra.isVisible().catch(() => false)) return;
  // O SOSSEGO DE UM SEGUNDO E MEIO NÃO É SUPERSTIÇÃO. O HTML do ecrã de entrada
  // chega antes do JavaScript: nessa janela o botão está desenhado e não tem
  // manípulo nenhum. Medido neste arnês: com meio segundo, o `POST
  // /api/admin/login` chegava a responder «ok» no registo do servidor e o ecrã
  // ficava na mesma no formulário — a sessão nascia e o cliente não dava por
  // ela. É a mesma armadilha que o `e2e/semear-pedido.ts` conta por extenso.
  await dormir(1500);
  if (await email.count()) {
    const credenciais = credenciaisDeDesenvolvimento();
    await email.fill(credenciais.email);
    await page.locator('input[name="password"]').fill(credenciais.palavraPasse);
    await page.getByRole("button", { name: /^Entrar com palavra-passe$/ }).click();
  }
  let dentro = await barra
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  /**
   * ── E SE O SERVIDOR DIZ «OK» E O ECRÃ NÃO MUDA, RECARREGA-SE ────────────
   *
   * MEDIDO, e vale a pena ficar escrito porque custou meia hora: há corridas em
   * que o `POST /api/admin/login` responde e o registo do servidor escreve
   * «admin login ok», e o cliente FICA no formulário. A sessão existe (o cookie
   * está posto); o que não aconteceu foi a troca de ecrã do lado do browser.
   * Um `reload` aterra directamente no painel — e é isso que se faz, em vez de
   * gastar outra entrada do contador com um segundo login.
   */
  if (!dentro) {
    await page.reload({ waitUntil: "domcontentloaded" });
    dentro = await barra
      .waitFor({ timeout: 40_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!dentro) {
    const oQueEstaNoEcra = await page
      .evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200))
      .catch(() => "(sem página)");
    console.error("   o que estava no ecrã:", oQueEstaNoEcra);
    throw new Error(
      limitado
        ? "o servidor recusou a entrada com 429 — o tecto de entradas por IP (8/min, 60/hora) " +
            "está gasto. Espera e volta a correr; não é avaria do back office."
        : "não entrei no back office — o servidor está a correr com ADMIN_PASSWORD_HASH?",
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AJUDANTES DE CONDUÇÃO
// ══════════════════════════════════════════════════════════════════════════

/**
 * Um toque a sério, pelo CDP, no centro de um elemento.
 *
 * `locator.click()` do Playwright injecta um guião de actionability na página —
 * trabalho de thread principal a meio de uma janela de medição, e é
 * precisamente o que não pode haver aqui. `touchscreen.tap` desce ao
 * `Input.dispatchTouchEvent` e não corre JavaScript nenhum na página.
 */
async function tocar(page, alvo) {
  let caixa = await alvo.boundingBox({ timeout: 10_000 });
  if (!caixa) throw new Error("alvo sem caixa — não está no ecrã");
  // Um toque é em COORDENADAS do ecrã: se o alvo estiver abaixo da dobra, a
  // pancada cai no que estiver ali e o gesto mede outra coisa qualquer (foi o
  // que aconteceu ao «Copiar email», que vive lá no fundo do painel). Rolar só
  // acontece quando é preciso, e portanto nunca dentro de um gesto cujo alvo já
  // esteja à vista.
  if (caixa.y < 0 || caixa.y + caixa.height > ALTURA) {
    await alvo.scrollIntoViewIfNeeded({ timeout: 10_000 });
    await dormir(350);
    caixa = await alvo.boundingBox({ timeout: 10_000 });
    if (!caixa) throw new Error("alvo sem caixa depois de rolar");
  }
  await page.touchscreen.tap(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Põe o alvo à vista ANTES da janela de medição.
 *
 * Isto não é conforto: rolar a página faz o cabeçalho encolher (ele transiciona
 * `padding` e `font-size` — ver o cenário 9), e um rolo dentro do gesto medido
 * acrescentava trinta layouts que não eram do gesto. Foi assim que a primeira
 * leitura do «Mais do painel» saiu com 11 fotogramas perdidos que eram do
 * arnês.
 */
async function aVista(page, alvo) {
  await alvo.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {});
  await dormir(500);
}

const barraDeBaixo = (page) => page.locator('nav[aria-label="Destinos principais"]');
const listaDePedidos = (page) => page.locator("ul.flex.flex-col.divide-y").first();

/** Leva o ecrã à lista de Pedidos, com a lista toda aberta. */
async function irParaPedidos(page, { todas = false } = {}) {
  const jaLa = await page
    .locator("h1", { hasText: /^Pedidos$/ })
    .isVisible()
    .catch(() => false);
  if (!jaLa) {
    await tocar(page, barraDeBaixo(page).getByRole("button", { name: /^Pedidos/ }));
    await page.locator("h1", { hasText: /^Pedidos$/ }).waitFor({ timeout: 30_000 });
    await dormir(600);
  }
  // Sempre do topo: o cenário anterior pode ter deixado a página rolada, e um
  // cartão fora do ecrã é um toque que cai noutro sítio.
  await page.evaluate(() => window.scrollTo(0, 0));
  await dormir(300);
  if (todas) {
    const mais = page.getByRole("button", { name: /Mostrar mais/ });
    for (let i = 0; i < 6 && (await mais.count()); i++) {
      await tocar(page, mais.first());
      await dormir(700);
    }
  }
}

/**
 * A gaveta do pedido — a folha `z-50` que entra com a `.bo-entrada` e traz um
 * véu (`.bo-entrada-fundo`) atrás. Reconhece-se pela classe e não por `role`
 * porque não é um `dialog`: abaixo de `xl` é uma gaveta fora de fluxo, acima é
 * uma coluna da grelha (ver `sairDoPainel` no `AdminClient.tsx`).
 */
const painelDoPedido = (page) => page.locator(".fixed.z-50.max-w-md").first();

/** Leva ao estúdio de propostas do primeiro pedido da lista. */
async function irParaEstudio(page) {
  const jaLa = await page
    .getByRole("button", { name: /^1 Conteúdo$/ })
    .first()
    .isVisible()
    .catch(() => false);
  if (jaLa) {
    // Voltar ao primeiro passo, para o cenário partir sempre do mesmo sítio.
    await tocar(page, page.getByRole("button", { name: /^1 Conteúdo$/ }).first());
    await dormir(700);
    return;
  }
  await irParaPedidos(page);
  const passo1 = page.getByRole("button", { name: /^1 Conteúdo$/ }).first();
  // Duas tentativas. Um toque num cartão que chegou ao ecrã há um instante nem
  // sempre pega — a lista acabou de se desenhar e o `onClick` do React pode não
  // estar ligado ainda —, e uma espera longa a seguir a um toque perdido é uma
  // espera longa por nada. Insistir uma vez custa menos do que esperar 45 s.
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const cartao = listaDePedidos(page).locator("li").first().locator("button").first();
    await aVista(page, cartao);
    await tocar(page, cartao);
    const abriu = await passo1
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (abriu) {
      await dormir(900);
      return;
    }
    await irParaPedidos(page);
  }
  throw new Error("o cartão do primeiro pedido não abriu o estúdio em duas tentativas");
}

/**
 * Põe o ecrã num estado conhecido antes de cada cenário: sem diálogo aberto,
 * sem gaveta de pedido, sem a coluna de destinos por cima de tudo.
 *
 * Sem isto, o cenário 1b (que ABRE a coluna de destinos) deixava-a aberta e o
 * cenário seguinte batia com a cara no véu — vinte segundos de espera e um
 * vermelho que não era do produto, era do arnês.
 */
async function normalizar(page) {
  const dialogo = page.locator('[role="dialog"]').first();
  if (await dialogo.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await dormir(500);
  }
  const painel = painelDoPedido(page);
  if (await painel.isVisible().catch(() => false)) {
    const fechar = painel.getByRole("button", { name: /^Fechar$/ }).first();
    if (await fechar.count()) await tocar(page, fechar);
    await dormir(600);
  }
  if (await colunaAberta(page)) {
    const fecharMenu = page.getByRole("button", { name: /^Fechar menu$/ }).first();
    if (await fecharMenu.count()) {
      await tocar(page, fecharMenu);
      await dormir(600);
    }
  }
}

/**
 * Abre a coluna de destinos (a gaveta do «Mais» da barra de baixo).
 *
 * ── E NÃO SE PERGUNTA `isVisible()`, QUE MENTE AQUI ───────────────────────
 * A coluna FECHADA continua a ter caixa: no telemóvel ela sai de cena por
 * `translate`, não por `display`, e o Playwright chama a isso visível. Um
 * `if (isVisible()) return` saía-se sempre por aqui sem abrir nada, e o toque
 * seguinte caía no ecrã por baixo — foi assim que o cenário do filete deu
 * «0 fotogramas perdidos» cinco repetições seguidas sem nada ter acontecido.
 * O que distingue aberta de fechada é o CANTO ESQUERDO: fechada, está fora do
 * ecrã (x negativo).
 */
async function colunaAberta(page) {
  const caixa = await page
    .locator('nav[aria-label="Navegação do back office"]')
    .boundingBox()
    .catch(() => null);
  return !!caixa && caixa.x >= 0 && caixa.width > 0;
}

async function abrirColunaDeDestinos(page) {
  if (await colunaAberta(page)) return;
  await tocar(page, barraDeBaixo(page).getByRole("button", { name: /^Mais/ }));
  for (let i = 0; i < 30 && !(await colunaAberta(page)); i++) await dormir(100);
  if (!(await colunaAberta(page))) throw new Error("a coluna de destinos não abriu");
  await dormir(600);
}

/** Volta à Visão Geral pela barra de baixo, que é como ela lá vai. */
async function irParaVisaoGeral(page) {
  await tocar(page, barraDeBaixo(page).getByRole("button", { name: /^Visão Geral/ }));
  await page.locator("details.bo-mais").waitFor({ timeout: 20_000 });
  await dormir(800);
}

/** O quadro de fases, a partir da Visão Geral. */
async function irParaKanban(page) {
  const jaLa = await page
    .locator('[aria-label*="Coluna "]')
    .first()
    .isVisible()
    .catch(() => false);
  if (jaLa) return;
  await irParaVisaoGeral(page);
  await tocar(page, page.getByRole("button", { name: /Fases dos pedidos/ }).first());
  await page.locator('[aria-label*="Coluna "]').first().waitFor({ timeout: 20_000 });
  await dormir(900);
}

/**
 * A pilha cheia de avisos, pelo caminho REAL: `Copiar email`, no painel do
 * pedido, que chama o `toast` do provider como qualquer outro botão do back
 * office. Não há atalho de teste nenhum — o tecto do `MAX_TOASTS` é 4, portanto
 * quatro toques enchem a pilha e o quinto é o que se mede a entrar.
 */
async function encherAPilha(page, quantos) {
  const aberto = await painelDoPedido(page)
    .isVisible()
    .catch(() => false);
  const copiar = page.getByRole("button", { name: /^Copiar email$/ }).first();
  if (!aberto || !(await copiar.count())) {
    const abrir = await abrirPainelDoPedido(page);
    await tocar(page, abrir);
    // Espera pelo BOTÃO e não pela caixa do painel: a caixa aparece antes de o
    // conteúdo montar, e uma espera pela caixa passava com o painel ainda vazio.
    await copiar.waitFor({ timeout: 30_000 });
    await dormir(900);
  }
  await aVista(page, copiar);
  for (let i = 0; i < quantos; i++) {
    await tocar(page, copiar);
    await dormir(120);
  }
  await dormir(350);
  const n = await page.evaluate(
    () => document.querySelectorAll('[role="status"] [aria-label="Fechar"]').length,
  );
  if (n < quantos) throw new Error(`a pilha só tem ${n} avisos, queria ${quantos}`);
}

/** Abre o painel do pedido pelo caminho dela: lista → estúdio → «Abrir o pedido». */
async function abrirPainelDoPedido(page) {
  const aberto = await painelDoPedido(page)
    .isVisible()
    .catch(() => false);
  if (aberto) {
    await tocar(
      page,
      painelDoPedido(page)
        .getByRole("button", { name: /^Fechar$/ })
        .first(),
    );
    await dormir(700);
  }
  await irParaEstudio(page);
  const abrir = page.getByRole("button", { name: /^Abrir o pedido$/ });
  await abrir.waitFor({ timeout: 20_000 });
  await aVista(page, abrir);
  return abrir;
}

// ══════════════════════════════════════════════════════════════════════════
// OS CENÁRIOS — por ordem de quantas vezes por dia ela passa por lá
// ══════════════════════════════════════════════════════════════════════════

/**
 * Cada cenário tem `preparar` (fora da janela de medição), `accao` (dentro) e
 * `esperaMs` — quanto tempo se fica a contar fotogramas depois do gesto. A
 * espera é sempre a duração da animação MAIS uma folga: uma janela curta de
 * mais esconde o fim, que é onde os saltos costumam estar.
 */
const CENARIOS = [
  {
    nome: "1a · barra de baixo: Pedidos → Visão Geral (.view-in)",
    esperaMs: 500,
    async preparar(page) {
      await irParaPedidos(page);
    },
    async accao(page) {
      await tocar(page, barraDeBaixo(page).getByRole("button", { name: /^Visão Geral/ }));
    },
  },
  {
    /**
     * ── O FILETE NO TELEMÓVEL SÓ EXISTE ENTRE OS DESTINOS DO «MAIS» ────────
     *
     * MEDIDO, e confirma o que o comentário do `marcaDoDestino` já previa: os
     * quatro destinos do topo (Visão Geral, Pedidos, Fazer proposta, Propostas)
     * são `hidden lg:flex` dentro da coluna — vivem na barra de baixo. Logo,
     * abaixo de `lg`, `offsetParent` é nulo, `marcaDoDestino` fica `null` e
     * **não há filete nenhum**. Com «Visão Geral» activo a coluna aberta não
     * tem marca; com «Tarefas» activo tem (`translate: 0px 64px; height: 44px`).
     *
     * Ou seja: o filete que desliza, no telemóvel, é o gesto entre dois
     * destinos do «Mais». É esse que aqui se mede — trocar entre Tarefas e
     * Calendário, com a coluna aberta —, porque é o único em que ele anda.
     */
    nome: "1b · coluna de destinos + o filete que desliza",
    esperaMs: 700,
    async preparar(page) {
      await abrirColunaDeDestinos(page);
      const col = page.locator('nav[aria-label="Navegação do back office"]');
      const activo = await page.evaluate(
        () =>
          document
            .querySelector('nav[aria-label="Navegação do back office"] [aria-current="page"]')
            ?.textContent?.trim() ?? "",
      );
      // Um dos dois TEM de estar activo para haver filete de onde partir.
      if (!/Tarefas|Calendário/.test(activo)) {
        await tocar(page, col.getByRole("button", { name: /^Tarefas$/ }));
        await dormir(1400);
        await abrirColunaDeDestinos(page);
      }
      const agora = await page.evaluate(
        () =>
          document
            .querySelector('nav[aria-label="Navegação do back office"] [aria-current="page"]')
            ?.textContent?.trim() ?? "",
      );
      this._destino = /Tarefas/.test(agora) ? /^Calendário$/ : /^Tarefas$/;
      this._filete = await page.evaluate(() => {
        const n = document.querySelector('nav[aria-label="Navegação do back office"]');
        const f = [...(n?.querySelectorAll("span[aria-hidden=true]") ?? [])].filter(
          (s) => getComputedStyle(s).position === "absolute",
        );
        return f.length ? f[0].getAttribute("style") : "SEM FILETE";
      });
    },
    async accao(page) {
      const col = page.locator('nav[aria-label="Navegação do back office"]');
      await tocar(page, col.getByRole("button", { name: this._destino }));
    },
  },
  {
    nome: "2a · painel do pedido a ABRIR (a gaveta do telemóvel)",
    esperaMs: 600,
    async preparar(page) {
      this._abrir = await abrirPainelDoPedido(page);
    },
    async accao(page) {
      await tocar(page, this._abrir);
    },
  },
  {
    nome: "2b · painel do pedido a FECHAR",
    esperaMs: 600,
    async preparar(page) {
      const abrir = await abrirPainelDoPedido(page);
      await tocar(page, abrir);
      await painelDoPedido(page).waitFor({ timeout: 20_000 });
      await dormir(1200);
      this._fechar = painelDoPedido(page)
        .getByRole("button", { name: /^Fechar$/ })
        .first();
      await this._fechar.waitFor({ timeout: 10_000 });
    },
    async accao(page) {
      await tocar(page, this._fechar);
    },
  },
  {
    nome: "3a · estúdio: Conteúdo → Pré-visualizar",
    esperaMs: 700,
    async preparar(page) {
      await irParaEstudio(page);
      this._passo = page.getByRole("button", { name: /^2 Pré-visualizar$/ }).first();
      await this._passo.waitFor({ timeout: 15_000 });
      await aVista(page, this._passo);
    },
    async accao(page) {
      await tocar(page, this._passo);
    },
  },
  {
    nome: "3b · estúdio: Pré-visualizar → Enviar",
    esperaMs: 700,
    async preparar(page) {
      await irParaEstudio(page);
      await tocar(page, page.getByRole("button", { name: /^2 Pré-visualizar$/ }).first());
      await dormir(1200);
      this._passo = page.getByRole("button", { name: /^3 Enviar$/ }).first();
      await this._passo.waitFor({ timeout: 15_000 });
      await aVista(page, this._passo);
    },
    async accao(page) {
      await tocar(page, this._passo);
    },
  },
  /**
   * ── O TERCEIRO PASSO PARA TRÁS NÃO ESTÁ AQUI, E PORQUÊ ───────────────────
   *
   * Houve um cenário «Enviar → Conteúdo». Saiu, e não por dar mau número: por
   * não dar número nenhum. MEDIDO: com o estúdio no passo 3, um toque no centro
   * do chip «1 Conteúdo» não muda o `aria-current="step"`, e o
   * `document.elementFromPoint` nesse ponto devolve um `div.ml-auto.flex` da
   * barra de acções por cima — ou seja, o chip está TAPADO nesse ponto, tal
   * como o «×» dos avisos com o painel aberto (ver o cenário 5b).
   *
   * Um cenário assim daria «0 fotogramas perdidos» — e seria mentira, porque
   * não aconteceu nada. Vale mais esta nota, com a receita, do que um zero
   * bonito. Os dois passos que se fazem para a frente (3a e 3b) medem-se e
   * estão aqui.
   */
  {
    nome: "4 · «Mais do painel» a abrir (a escada de blocos)",
    esperaMs: 900,
    async preparar(page) {
      await tocar(page, barraDeBaixo(page).getByRole("button", { name: /^Visão Geral/ }));
      await page.locator("details.bo-mais").waitFor({ timeout: 20_000 });
      await dormir(900);
      // Fechada, sempre: a gaveta guarda o estado no `localStorage`.
      await page.evaluate(() => {
        const d = document.querySelector("details.bo-mais");
        if (d?.open) d.querySelector("summary")?.click();
      });
      await dormir(500);
      this._resumo = page.locator("details.bo-mais summary").first();
      await aVista(page, this._resumo);
      this._blocos = await page.evaluate(
        () => document.querySelectorAll("details.bo-mais .bo-cena").length,
      );
    },
    async accao(page) {
      await tocar(page, this._resumo);
    },
  },
  {
    nome: "5a · aviso (Toast) a ENTRAR com a pilha cheia",
    esperaMs: 500,
    async preparar(page) {
      await encherAPilha(page, 4);
    },
    async accao(page) {
      await tocar(page, page.getByRole("button", { name: /^Copiar email$/ }).first());
    },
  },
  {
    nome: "5b · aviso (Toast) a SAIR com a pilha cheia",
    esperaMs: 500,
    async preparar(page) {
      await encherAPilha(page, 4);
      this._fechar = page.locator('[role="status"] button[aria-label="Fechar"]').nth(1);
      await this._fechar.waitFor({ timeout: 10_000 });
    },
    /**
     * ── AQUI O GESTO É UM `click()` E NÃO UM TOQUE, E A RAZÃO É UM DEFEITO ──
     *
     * O do MEIO, e não o de baixo: é o que obriga os irmãos a deslizar, que é o
     * FLIP que o `Toast.tsx` faz e que o `saida-do-aviso.mjs` mediu à parte.
     * Fechar o último não move ninguém e não media nada.
     *
     * O toque, esse, NÃO CHEGA LÁ — e isto foi medido, não suposto. Com o
     * painel do pedido ABERTO, `document.elementFromPoint` no centro do «×» de
     * cada um dos quatro avisos devolve o conteúdo do painel por baixo, e um
     * `Input.dispatchTouchEvent` nesse ponto não fecha aviso nenhum. Com o
     * painel FECHADO, o mesmo ponto devolve o `<button aria-label="Fechar">` e
     * o toque funciona. A pilha é `z-[80]`, o painel é `z-50`, e os avisos
     * VÊEM-SE por cima (está no `toast-tapado.png` da medição) — o que falha é
     * o teste de acerto, não a pintura.
     *
     * Ou seja: enquanto o painel do pedido está aberto, os avisos aparecem e
     * não se conseguem fechar com o dedo. É um defeito de alcance, não de
     * fluidez, e por isso não se corrige a partir deste ficheiro — fica aqui
     * escrito, com a receita para o reproduzir.
     *
     * Para MEDIR a saída, o que interessa é o mesmo evento que o dedo
     * entregaria se o acerto o deixasse passar: um `click()` no botão. O que se
     * salta é o teste de acerto; a animação que se segue é exactamente a mesma.
     */
    async accao(page) {
      await page.evaluate(() => {
        document.querySelectorAll('[role="status"] [aria-label="Fechar"]')[1]?.click();
      });
    },
  },
  {
    nome: "6a · diálogo (FolhaOuDialogo) a ENTRAR",
    esperaMs: 700,
    async preparar(page) {
      await irParaVisaoGeral(page);
      this._abrir = page.getByRole("button", { name: /^Novo pedido$/ }).first();
      await this._abrir.waitFor({ timeout: 15_000 });
    },
    async accao(page) {
      await tocar(page, this._abrir);
    },
  },
  {
    nome: "6b · diálogo (FolhaOuDialogo) a SAIR",
    esperaMs: 700,
    async preparar(page) {
      await irParaVisaoGeral(page);
      await tocar(page, page.getByRole("button", { name: /^Novo pedido$/ }).first());
      await page.locator('[role="dialog"]').first().waitFor({ timeout: 15_000 });
      await dormir(1200);
      this._fechar = page
        .locator('[role="dialog"]')
        .first()
        .locator('[aria-label*="Fechar" i], button')
        .first();
      await this._fechar.waitFor({ timeout: 10_000 });
    },
    async accao(page) {
      await tocar(page, this._fechar);
    },
  },
  /**
   * ── O QUE ESTE CENÁRIO DESCOBRIU, E MUDOU-LHE A FORMA ────────────────────
   *
   * A entrada de reordenação do `TabelaOuCartoes` só corre quando é «a MESMA
   * gente noutra ordem» (`mesmaGenteNoutraOrdem`, que compara comprimento e
   * conjunto). E o `AdminClient` repõe `visibleCount` em `LIST_PAGE_SIZE` (50)
   * a cada mudança de `sort` — está escrito no efeito da linha ~3895.
   *
   * Consequência MEDIDA: com mais de 50 pedidos na lista, ordenar troca QUEM
   * está nas 50 linhas visíveis, o conjunto muda, e a `.view-in` **não corre**.
   * A reordenação animada é portanto um caso que só existe até às 50 linhas —
   * e é aí que se mede o pior caso, com a lista inteira a caber numa página.
   *
   * Por isso este cenário NÃO abre o «Mostrar mais»: mede a página como ela
   * está. O `animou:` da linha de resultado diz qual dos dois casos apanhou, e
   * o `--semear=46` é a maneira de forçar o caso animado.
   */
  {
    nome: "7 · lista de Pedidos a REORDENAR",
    esperaMs: 700,
    async preparar(page) {
      await irParaPedidos(page);
      this._linhas = await page.evaluate(
        () => document.querySelectorAll("ul.flex.flex-col.divide-y > li").length,
      );
    },
    async accao(page) {
      // A troca é feita de dentro da página, e não com `selectOption`: o que se
      // quer medir é o que o React faz a seguir ao `change`, e o `selectOption`
      // do Playwright injecta um guião que corre na mesma thread. O gesto do
      // dedo abre um selector NATIVO do sistema — cromado do telemóvel, não
      // fotogramas nossos.
      //
      // O valor SEGUINTE lê-se do próprio `<select>` e não de um contador do
      // arnês: com um contador, a segunda repetição escrevia o mesmo valor que
      // a primeira, o React não mudava de estado e o cenário media zero — que
      // é como as primeiras cinco repetições saíram com «layouts: 0».
      await page.evaluate(() => {
        const s = document.querySelector('select[aria-label="Ordenar pedidos"]');
        if (!s) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter?.call(s, s.value === "recent" ? "old" : "recent");
        s.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
  },
  {
    /**
     * O pior desenho que a lista consegue produzir: o «Mostrar mais» aberto até
     * ao fim (142 cartões no DOM) e depois uma ordenação, que desmonta os 142 e
     * monta 50. Não anima nada — e é precisamente por isso que vale medi-lo: é
     * o momento em que a lista mais trabalho dá e em que, se houvesse animação,
     * ela cairia. Serve de controlo ao cenário 7.
     */
    nome: "7b · lista LONGA a re-desenhar (sem animação)",
    esperaMs: 900,
    async preparar(page) {
      await irParaPedidos(page, { todas: true });
      this._linhas = await page.evaluate(
        () => document.querySelectorAll("ul.flex.flex-col.divide-y > li").length,
      );
    },
    async accao(page) {
      await page.evaluate(() => {
        const s = document.querySelector('select[aria-label="Ordenar pedidos"]');
        if (!s) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter?.call(s, s.value === "recent" ? "old" : "recent");
        s.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
  },
  {
    /**
     * ── O CENÁRIO QUE NASCEU DE UM ARTEFACTO DA PRIMEIRA MEDIÇÃO ───────────
     *
     * A primeira leitura do «Mais do painel» deu 30 layouts e 11 fotogramas
     * perdidos, e a causa não era a escada: era o arnês a ROLAR a página para
     * chegar ao botão. E rolar, aqui, é uma animação:
     *
     *   `AdminClient.tsx:4694`  motion-safe:transition-[padding] duration-200
     *   `AdminClient.tsx:4782`  motion-safe:transition-[font-size] duration-200
     *
     * O cabeçalho `sticky` encolhe quando se passa dos 24 px de rolo, e
     * encolhe animando DUAS propriedades de layout durante 200 ms. `padding` e
     * `font-size` não são `transform` nem `opacity`: cada fotograma da
     * transição obriga a um recálculo de estilo e a um layout do cabeçalho e
     * do que ele empurra. É o exemplo perfeito daquilo que a regra da casa não
     * apanha por leitura — a classe está escrita entre parênteses rectos,
     * portanto parece disciplinada.
     *
     * Ela rola o dia inteiro. Isto merece um número próprio.
     */
    nome: "9 · o cabeçalho a ENCOLHER ao rolar",
    esperaMs: 600,
    async preparar(page) {
      await irParaPedidos(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await dormir(600);
    },
    async accao(page) {
      // Um rolo curto, o suficiente para passar o limiar dos 24 px que faz o
      // cabeçalho encolher. `scrollTo` e não uma roda: o gesto do dedo traria
      // o rolo por inércia por cima da transição e não se saberia o que é de
      // quem.
      await page.evaluate(() => window.scrollTo(0, 200));
    },
  },
  {
    nome: "8 · cartão do Kanban a aterrar (muda de coluna)",
    esperaMs: 900,
    async preparar(page) {
      await irParaKanban(page);
      const cartao = page.locator('[aria-label*="Coluna "]').first();
      await cartao.waitFor({ timeout: 15_000 });
      this._mover = cartao.getByRole("button", { name: /Mover para a coluna seguinte/ }).first();
      if (!(await this._mover.count())) {
        this._mover = page.getByRole("button", { name: /Mover para a coluna seguinte/ }).first();
      }
      await this._mover.waitFor({ timeout: 10_000 });
    },
    async accao(page) {
      await tocar(page, this._mover);
    },
  },
];

// ══════════════════════════════════════════════════════════════════════════
// A CORRIDA
// ══════════════════════════════════════════════════════════════════════════

async function correr() {
  const browser = await chromium.launch({ executablePath: acharChromium() });
  const relatorio = { maquina: {}, taxas: {} };

  for (const taxa of TAXAS) {
    console.log(`\n${"═".repeat(78)}`);
    console.log(
      `CPU travado ${taxa}×${REDUZIDO ? "  ·  prefers-reduced-motion: reduce" : ""}  ·  ${LARGURA}×${ALTURA}  ·  ${REPETICOES} repetições`,
    );
    console.log("═".repeat(78));

    const ctx = await browser.newContext({
      viewport: { width: LARGURA, height: ALTURA },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      reducedMotion: REDUZIDO ? "reduce" : "no-preference",
      storageState: sessaoGuardada ?? undefined,
    });
    await ctx.addInitScript(AMOSTRADOR);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Performance.enable");

    await entrar(page);
    if (!sessaoGuardada) sessaoGuardada = await ctx.storageState();
    await dormir(1500);
    // A travagem entra DEPOIS de entrar: o carregamento inicial não é o que se
    // mede, e travá-lo só faz a preparação demorar minutos.
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: taxa });

    const linhas = [];
    const animacoesVistas = [];
    for (const cenario of CENARIOS) {
      if (SO && !cenario.nome.toLowerCase().includes(SO)) continue;
      const amostras = [];
      let erro = null;
      for (let i = 0; i < REPETICOES; i++) {
        try {
          await normalizar(page);
          await cenario.preparar(page);
          await dormir(400);
          await page.evaluate(() => window.__medComecar());
          const antes = await contadores(cdp);
          const marca = await page.evaluate(() => window.__medMarcar());
          await cenario.accao(page);
          /**
           * Com `prefers-reduced-motion: reduce` NÃO se acredita no CSS: espia-se
           * o `document.getAnimations()` a meio do gesto e conta-se o que o
           * browser tem MESMO a correr. Espiar custa turnos de thread principal,
           * portanto só se faz nesta passagem — aqui não se mede fluidez, mede-se
           * ausência.
           */
          if (REDUZIDO) {
            for (let k = 0; k < 8; k++) {
              const vivas = await page.evaluate(() => window.__medAnimacoes());
              for (const v of vivas) {
                animacoesVistas.push(`${cenario.nome} :: ${v.nome}  (${v.classe || "sem classe"})`);
              }
              await dormir(cenario.esperaMs / 8);
            }
          } else {
            await dormir(cenario.esperaMs);
          }
          const depois = await contadores(cdp);
          const { t, loaf, anim } = await page.evaluate(() => window.__medParar());
          const f = resumirFotogramas(t, marca);
          amostras.push({
            ...f,
            layouts: depois.layouts - antes.layouts,
            layoutMs: depois.layoutMs - antes.layoutMs,
            estilos: depois.estilos - antes.estilos,
            estiloMs: depois.estiloMs - antes.estiloMs,
            loaf: loaf.filter((l) => l.inicio >= marca),
            anim: anim.filter((a) => a.t >= marca),
          });
        } catch (e) {
          erro = String(e.message).split("\n")[0].slice(0, 90);
          break;
        }
      }
      if (erro) {
        console.log(`${cenario.nome.padEnd(48)}  ✗  ${erro}`);
        linhas.push({ cenario: cenario.nome, erro });
        continue;
      }
      const linha = {
        cenario: cenario.nome,
        perdidosMediana: mediana(amostras.map((a) => a.perdidos)),
        perdidosPior: Math.max(...amostras.map((a) => a.perdidos)),
        maiorMsMediana: mediana(amostras.map((a) => a.maiorMs)),
        maiorMsPior: Math.max(...amostras.map((a) => a.maiorMs)),
        layouts: mediana(amostras.map((a) => a.layouts)),
        layoutMs: mediana(amostras.map((a) => a.layoutMs)),
        estilos: mediana(amostras.map((a) => a.estilos)),
        estiloMs: mediana(amostras.map((a) => a.estiloMs)),
        loafPior: Math.max(0, ...amostras.flatMap((a) => a.loaf.map((l) => l.dur))),
        fotogramas: mediana(amostras.map((a) => a.fotogramas)),
        // A prova de que o gesto animou mesmo alguma coisa. Um cenário com
        // `animou: []` deu zero fotogramas perdidos por não ter havido animação
        // nenhuma — o que é um vermelho do arnês, não um verde do produto.
        animou: [...new Set(amostras.flatMap((a) => a.anim.map((x) => x.nome)))],
        // Com a classe, para se saber QUEM animou e não só o quê.
        animouOnde: [
          ...new Set(amostras.flatMap((a) => a.anim.map((x) => `${x.nome} @ ${x.classe}`))),
        ],
      };
      if (cenario._blocos) linha.blocos = cenario._blocos;
      if (cenario._linhas) linha.linhas = cenario._linhas;
      linhas.push(linha);
      console.log(
        cenario.nome.padEnd(48),
        " perdidos:",
        String(linha.perdidosMediana).padStart(4),
        "(pior",
        String(linha.perdidosPior).padStart(3) + ")",
        " maior fotograma:",
        linha.maiorMsMediana.toFixed(1).padStart(6),
        "ms (pior",
        linha.maiorMsPior.toFixed(1).padStart(6) + ")",
        " layouts:",
        String(linha.layouts).padStart(4),
        " estilos:",
        String(linha.estilos).padStart(4),
        " LoAF:",
        linha.loafPior.toFixed(0).padStart(4),
        "ms",
        " animou:",
        linha.animou.join(",") || "NADA",
      );
    }
    if (REDUZIDO) {
      const unicas = [...new Set(animacoesVistas)];
      console.log(
        unicas.length === 0
          ? "\nprefers-reduced-motion: NENHUMA animação a correr em nenhum dos gestos. ✓"
          : `\nprefers-reduced-motion: ainda correm ${unicas.length} animações:\n  ` +
              unicas.join("\n  "),
      );
      relatorio.reduzido = unicas;
    }
    relatorio.taxas[taxa] = linhas;
    await ctx.close();
  }

  await browser.close();
  if (args.json) {
    await fs.writeFile(String(args.json), JSON.stringify(relatorio, null, 2));
    console.log(`\nnúmeros em bruto: ${args.json}`);
  }
  return relatorio;
}

// ══════════════════════════════════════════════════════════════════════════

if (args.semear) {
  await semear(Number(args.semear === true ? 140 : args.semear));
} else if (args.repor) {
  await repor();
} else if (args.metricas) {
  const browser = await chromium.launch({ executablePath: acharChromium() });
  const page = await browser.newPage();
  await page.setContent("<div>oi</div>");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const { metrics } = await cdp.send("Performance.getMetrics");
  console.log(metrics.map((m) => m.name).join(", "));
  await browser.close();
} else {
  await correr();
}
