# Auditoria de cabeçalhos de segurança — Líquen Events

Auditoria defensiva a **cabeçalhos HTTP, Content-Security-Policy e conteúdo do
_bundle_**. Data: 2026-07-31. Ramo: `claude/wedding-themes-photo-folders-v4at22`.
Next.js 16.2.11 (o ficheiro de _middleware_ chama-se agora `src/proxy.ts` — ver
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).

## Como é que isto foi medido

Tudo o que está nas colunas "antes"/"depois" foi lido de um servidor de produção
a correr nesta máquina, não de leitura do código:

```bash
NEXT_DIST_DIR=.next-audit-before npx next build && npx next start -p 4311
curl -sI http://127.0.0.1:4311/galeria
```

O `.next` normal é partilhado com outros trabalhos em curso, por isso cada
compilação foi para uma pasta própria (`.next-audit-before`, `.next-audit-after`).
O comportamento no browser foi medido com Chromium (Playwright), a ler
`document.featurePolicy.allowsFeature(...)` e a recolher as violações de CSP da
consola.

> ### ⚠️ A coluna de terceiros NÃO FOI VERIFICADA
>
> Não há acesso à Internet nesta máquina (política de rede: `stripe.com`,
> `vercel.app` e `linear.app` estão todos bloqueados — foi tentado). Portanto
> **não há nenhuma comparação com o que outros sítios devolvem**, e nenhuma foi
> inventada. A coluna "alvo recomendado" abaixo vem da **especificação**
> (CSP Level 3, RFC 6797 para o HSTS, Permissions-Policy) e da prática
> estabelecida (lista de _preload_ do HSTS, guia de CSP do próprio Next.js em
> `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`) —
> não de medições a terceiros.

---

## Tabela — medido neste sítio

| Cabeçalho | Antes (medido) | Depois (medido) | Alvo (especificação/prática) | Terceiros |
| --- | --- | --- | --- | --- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | (igual) | `max-age≥31536000; includeSubDomains; preload` | NÃO VERIFICADO |
| `Content-Security-Policy` | `script-src 'self' 'unsafe-inline' …` | (igual — ver §1) | `script-src` sem `'unsafe-inline'` | NÃO VERIFICADO |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | 20 funcionalidades desligadas, incl. `browsing-topics=()` | desligar o que não se usa; `browsing-topics` explícito | NÃO VERIFICADO |
| `X-Content-Type-Options` | `nosniff` | (igual) | `nosniff` | NÃO VERIFICADO |
| `X-Frame-Options` | `SAMEORIGIN` | (igual) | `DENY`/`SAMEORIGIN` | NÃO VERIFICADO |
| `frame-ancestors` (na CSP) | `'self'` | (igual) | `'none'` ou `'self'` | NÃO VERIFICADO |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | (igual) | `strict-origin-when-cross-origin` ou mais apertado | NÃO VERIFICADO |
| `Cross-Origin-Opener-Policy` | `same-origin` | (igual) | `same-origin` | NÃO VERIFICADO |
| `Cross-Origin-Resource-Policy` | `same-site` | (igual) | `same-origin`/`same-site` | NÃO VERIFICADO |
| `Cross-Origin-Embedder-Policy` | ausente | ausente (deliberado — ver §5) | `require-corp` só se houver isolamento | NÃO VERIFICADO |
| `X-Permitted-Cross-Domain-Policies` | `none` | (igual) | `none` | NÃO VERIFICADO |
| `X-Powered-By` | ausente (`poweredByHeader: false`) | (igual) | ausente | NÃO VERIFICADO |
| CORS (`Access-Control-Allow-*`) | ausente em todas as rotas | (igual) | nunca `*` com credenciais | NÃO VERIFICADO |

Os cabeçalhos aplicam-se a **todas** as respostas, não só ao HTML — confirmado
por `curl -sI` a `/_next/static/chunks/*.js` e a `/imagens/*.jpg`.

---

## §1 — A CSP com nonce: medida, e NÃO aplicada

O pedido era escrever a CSP definitiva com _nonce_ emitido no proxy, sem
`'unsafe-inline'`. **Foi implementada, medida, e revertida — porque deita o
sítio abaixo, em silêncio.** Isto é o achado principal desta auditoria.

### O que foi feito

Implementou-se exactamente o que o guia do Next descreve: `proxy.ts` gera um
_nonce_ por pedido, mete-o no cabeçalho `Content-Security-Policy` e no
`x-nonce` do pedido, com `script-src 'self' 'nonce-…' 'strict-dynamic'`.
Compilou-se e serviu-se em `.next-audit-probe` / porta 4312.

### O que o browser fez com isso (medido, Chromium, `/galeria`)

| | Política actual | Política com nonce |
| --- | --- | --- |
| `<script>` no HTML | 43 | 43 |
| … com `nonce` | 0 | **0** |
| Violações de CSP na consola | 0 | **42** |
| `history.scrollRestoration` | `manual` ✅ | **`auto`** ❌ |
| Hidratação | sim | **não** |

Mensagem representativa das 42:

```
Refused to load the script '…/_next/static/chunks/1qqz2_b3-j-74.js' because it
violates the following Content Security Policy directive: "script-src 'self'
'nonce-…' 'strict-dynamic'". Note that 'strict-dynamic' is present, so
host-based allowlisting is disabled.
```

### Porquê

Está escrito no próprio guia do Next (secção _"How nonces work in Next.js"_): o
_nonce_ é aplicado **durante a renderização**, a partir do cabeçalho CSP do
pedido. Só que quase todas as páginas deste sítio são **pré-renderizadas no
build** — `●` no mapa do `next build` (`/`, `/galeria`, `/servicos`, `/sobre`,
`/contacto`, `/termos`, `/privacidade`, `/clientes`, `/orcamento` e as 11 de
`/servicos/[slug]`) — e servidas da cache de prerender: `curl -I` devolve
`x-nextjs-cache: HIT` e `x-nextjs-prerender: 1`. No instante em que aquele HTML
foi gerado não havia pedido nenhum, logo não havia _nonce_ nenhum para lá pôr.
O cabeçalho traz um _nonce_ novo a cada pedido; o HTML traz sempre o mesmo,
sem nenhum. Nunca coincidem.

E como `'strict-dynamic'` faz o browser **ignorar o `'self'`**, nem sequer os
`/_next/static/chunks/*.js` passam. Não é a galeria que parte: é o sítio todo.

### O detalhe que torna isto perigoso

A página **continua a parecer bem**. O HTML estático desenha-se todo — heróis,
fotos, texto, tudo. O que desaparece é o comportamento: o scroll infinito, os
filtros, e o restauro da posição da galeria. E nenhum teste de unidade acusa
nada, porque nenhum deles abre um browser com a política aplicada. Era
exactamente o modo de falha de que a nota em `galeria/page.tsx` avisa.

### O que foi medido sobre o script da galeria

Fez-se uma página-sonda temporária, renderizada dinamicamente, com dois
`<script>` embutidos — um sem `nonce` e outro com `nonce={headers().get("x-nonce")}`:

- o `x-nonce` **chega** ao componente de servidor;
- o Next/React aplica o _nonce_ automaticamente aos **seus** scripts (os
  _chunks_, o _bootstrap_, os fluxos de dados do RSC);
- **um `<script dangerouslySetInnerHTML>` escrito pela aplicação NÃO recebe o
  _nonce_.** Sai como `<script>`, pelado.

Ou seja: mesmo que todas as páginas passassem a dinâmicas, o `<script>` do
`scrollRestoration` continuaria bloqueado até alguém lhe passar `nonce={…}` à
mão — e esse ficheiro está fora do que esta auditoria pode alterar.

### O que falta, exactamente, para a mudança ser segura

1. Pôr as páginas em renderização dinâmica (`await connection()`), perdendo a
   pré-renderização — troca o HTML pronto no CDN por um render por visitante, o
   oposto de tudo o que está optimizado neste repositório;
2. `nonce={…}` no `<script>` de `src/app/[lang]/galeria/page.tsx`;
3. o mesmo em `src/components/SpeculationRules.tsx` e
   `src/components/GoogleTag.tsx` — **medido**: mesmo nas rotas já dinâmicas
   (`/orcamento/admin`), com o _nonce_ a funcionar em todo o resto, sobram
   exactamente 2 violações, e são estas duas. A do `GoogleTag` bloqueia o
   `gtag('consent','default', …)`, ou seja o **estado por omissão do Consent
   Mode** deixa de ser definido — uma regressão de privacidade, não só de
   funcionalidade.

Nenhum dos três cabe nos ficheiros desta auditoria.

### O que ficou em vez disso

`src/csp-nonce-contract.test.ts` — um teste de contrato que prende a invariante
_"se a `script-src` tiver nonce, então o `<script>` da galeria tem de o receber,
e a galeria tem de sair da renderização estática"_. Enquanto a política não
tiver _nonce_ não exige nada; no dia em que alguém o acrescentar sem tratar do
resto, falha ali em vez de falhar em produção.

**Dentes provados:** com `script-src 'self' 'nonce-TESTE' 'strict-dynamic'`
injectada no `next.config.ts`, os dois testes falham com a mensagem certa; com o
ficheiro restaurado a partir da cópia guardada, voltam a passar.

---

## §2 — Achados por risco

| # | Ficheiro:linha | Achado | Severidade | Explorabilidade REAL | Esforço | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `next.config.ts:220` (antes) | `Permissions-Policy` assente num nome morto (`interest-cohort`), com a Topics API aberta | **Alto** (privacidade/RGPD) | Alta — passiva e automática: basta a visita | Baixo | **CORRIGIDO** |
| 2 | `next.config.ts:184` | `script-src 'unsafe-inline'` | Médio | **Baixa** — não há sink de injecção (ver §3) | Muito alto | Documentado, não corrigido |
| 3 | `next.config.ts:174` | `connect-src` sem a origem do Supabase | Médio | Nenhuma hoje (cliente ainda não existe) | Baixo | Documentado, não corrigido |
| 4 | `next.config.ts:191` | `script-src`/`frame-src` incluem `googletagmanager.com` | Baixo | Requer conta Google Ads comprometida | — | Aceite (§5) |
| 5 | proxy `/en/*` | `Set-Cookie` numa resposta com `s-maxage=31536000` | Baixo | Cookie é só a preferência de idioma | Baixo | Documentado |

### Achado 1 — Permissions-Policy (Alto, CORRIGIDO)

`next.config.ts:220` (antes):

```
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
```

O `interest-cohort` desligava o **FLoC**, que a Google retirou do Chrome em
2022. O nome continua a ser aceite pelo analisador — por isso **não dá erro
nenhum na consola e parece estar a funcionar** — mas a funcionalidade que ele
desligava já não existe. Quem lhe sucedeu é a **Topics API**
(`browsing-topics`), e essa estava aberta.

Medido no Chromium, em `/galeria`, com `document.featurePolicy.allowsFeature`:

| Funcionalidade | Antes | Depois |
| --- | --- | --- |
| `browsing-topics` | **`true`** (permitido) | `false` |
| `payment` | `true` | `false` |
| `usb` | `true` | `false` |
| `serial` / `hid` / `midi` | `true` | `false` |
| `interest-cohort` | `false` (nome morto) | `false` |
| total de funcionalidades permitidas | **73** | **59** |

Isto não é teórico: o sítio carrega mesmo a pilha de anúncios da Google
(`googletagmanager`, `doubleclick`, `googleadservices`), que é precisamente quem
lê a Topics API, e tem um banner de consentimento — ou seja, a intenção de não
perfilar os visitantes por interesses está declarada, e tinha deixado de ser
cumprida.

**Correcção:** 20 funcionalidades explicitamente desligadas. `(self)` em vez de
`()` no `fullscreen` e no `autoplay`, para não amarrar o lightbox da galeria.

**Deixado de fora, de propósito:** `join-ad-interest-group`, `run-ad-auction` e
`attribution-reporting`. São as APIs que sustentam o **remarketing** e a
**medição de conversões** do Google Ads — uma funcionalidade de negócio
acrescentada de propósito (ver o comentário do `gtag` em `next.config.ts`).
Desligá-las seria uma decisão comercial da dona, não uma correcção de segurança.
`join-ad-interest-group` continua, portanto, medido como permitido.

**Também deixado de fora:** `bluetooth=()`. O Chromium ainda não a reconhece e
responde `Error with Permissions-Policy header: Unrecognized feature:
'bluetooth'` na consola de todas as páginas (medido) — um aviso permanente é
ruído que esconde os avisos verdadeiros.

**Verificação de não-regressão** (Chromium, antes vs depois, `/galeria`):

| | Antes | Depois |
| --- | --- | --- |
| `history.scrollRestoration` ao carregar | `manual` | `manual` |
| Fotos após scroll até estabilizar | **432** | **432** |
| Altura do documento | 79 042 px | 79 126 px |
| Blocos animados (`AnimateIn`) opacos | 14 | 14 |
| View Transitions suportadas | sim | sim |
| Violações de CSP | 0 | 0 |
| Erros de página | 0 | 0 |

(Uma primeira leitura deu contagens de fotos muito diferentes entre os dois — 65
contra 41. Não era regressão: repetindo no **mesmo** servidor deu 17, 41 e 65.
Era o _decode_ das imagens a chegar a horas diferentes. Refeita a medição a
percorrer a página até o número **estabilizar**, ambos convergem para 432, duas
vezes cada.)

### Achado 2 — `'unsafe-inline'` em `script-src` (Médio, documentado)

Estruturalmente forçado enquanto as páginas forem pré-renderizadas (§1). A
explorabilidade real é **baixa**, e isso foi verificado, não assumido: procurou-se
o sink que transformaria isto num buraco a sério e **não existe**. Todos os
`dangerouslySetInnerHTML` do projecto são literais estáticos ou JSON escapado:

- `galeria/page.tsx`, `servicos/[slug]/page.tsx`, `SpeculationRules.tsx`,
  `GoogleTag.tsx` — literais fixos, sem dados do utilizador;
- `JsonLd.tsx` / `StructuredData.tsx` — passam por `src/lib/jsonld.ts`, que faz
  `JSON.stringify` e escapa `<` → `<`, ` ` e ` `. Correcto.

O único `<iframe>` do projecto (`admin/EmailTemplates.tsx:420`) usa
`srcDoc` com `sandbox=""` — origem opaca, sem scripts. Correcto.

### Achado 3 — `connect-src` sem o Supabase (Médio, documentado)

`next.config.ts:174` produz, em produção, `connect-src 'self' <plausible> <google>`.
O comentário ao lado diz que "tudo o que é terceiro corre do lado do SERVIDOR,
por isso o browser nunca abre esses sockets" — **isso deixou de ser verdade**.
As rotas `/api/temas/[id]/imagens/url` e `/api/orcamento/[id]/assets/url` emitem
bilhetes de escrita para o browser falar **directamente** com o Supabase Storage
("um URL de escrita por foto, para o navegador falar com o Storage sem nos
passar pela frente").

Hoje não parte nada — verificado: nenhum ficheiro de cliente chama essas rotas
ainda; só existem os testes. Mas é uma armadilha armada: no dia em que o cliente
for ligado, o `PUT` para `https://<projecto>.supabase.co` é bloqueado pela CSP, e
o `fallback` para _multipart_ que as rotas prevêem **não dispara**, porque um
bloqueio de CSP é um `TypeError`, não um HTTP 503.

Correcção quando isso acontecer (uma linha, e a origem já é derivada do ambiente
logo acima, para o `img-src`):

```ts
: `connect-src 'self'${plausible}${gaConnect}${imgExtra}`,
```

Não aplicada aqui por estar fora do critério "só Crítico e Alto".

### Achado 5 — `Set-Cookie` com `s-maxage` longo

`/en/galeria` devolve `set-cookie: liquen-lang=en` **e**
`Cache-Control: s-maxage=31536000`. Uma cache partilhada que guardasse essa
resposta serviria o `Set-Cookie` a outro visitante. O cookie é só a preferência
de idioma (sem valor de sessão), por isso o impacto é cosmético; fica registado
porque o padrão é o mesmo que noutro contexto seria grave.

---

## §3 — Source maps e segredos no bundle

Ambos **limpos**. Medido em `.next-audit-before/static/` (91 ficheiros `.js`):

- `productionBrowserSourceMaps: false` está a funcionar: **zero** referências
  `sourceMappingURL` no JS servido. O único `.map` presente
  (`chunks/2z3sh82dl8glu.js.map`, 53 bytes) é um esqueleto vazio
  (`"sources": [], "sections": []`) e **não é referenciado por nenhum ficheiro**.
  Não expõe código.
- Zero ocorrências de `SUPABASE_SERVICE_ROLE`, `SESSION_SECRET`, `CRON_SECRET`,
  `SMTP_PASS`, `VAPID_PRIVATE`, `ADMIN_PASSWORD_HASH`, `service_role`.
- Zero padrões de chave (`eyJ…` JWT, `sk_…`, `AIza…`, `xox…`, `-----BEGIN`).
- Os únicos endereços de email no bundle são o público do negócio
  (`liquen.alentejo@gmail.com`) e dois marcadores de exemplo.
- As cinco variáveis `NEXT_PUBLIC_*` são todas legitimamente públicas (URL do
  Supabase, CDN de imagens, domínio do Plausible, chave **pública** VAPID).

---

## §4 — Cabeçalhos em respostas autenticadas

Medido, porque um `Cache-Control` público numa página de sessão seria grave:

| Rota | `Cache-Control` medido |
| --- | --- |
| `/orcamento/admin` | `private, no-cache, no-store, max-age=0, must-revalidate` |
| `/portal/<token>` | `private, no-cache, no-store, max-age=0, must-revalidate` |
| `/proposta/<token>` | `private, no-cache, no-store, max-age=0, must-revalidate` |
| `/orcamento/confirmacao/<id>` | `private, no-cache, no-store, max-age=0, must-revalidate` |

Correcto. Sem achado.

---

## §5 — Falsos positivos descartados, e porquê

| Suspeita | Porque foi descartada |
| --- | --- |
| **CORS com `origin: *` e credenciais** | Não existe CORS nenhum. `grep -rn "Access-Control" src/` em todas as 55 rotas: **zero** ocorrências, zero handlers `OPTIONS`. Não há nada a apertar. |
| **Source maps em produção** | `productionBrowserSourceMaps: false`, zero `sourceMappingURL` no JS servido; o único `.map` é um esqueleto vazio de 53 bytes sem `sources` e sem referência. |
| **Segredos no bundle** | Nenhum, por grep dirigido e por padrões de chave (§3). |
| **`frame-ancestors 'self'` devia ser `'none'`** | Não há vector: seria preciso conteúdo HTML de atacante servido na mesma origem, e não há upload servido same-origin (o Storage é outra origem). Apertar para `'none'` arriscava o `<iframe srcDoc sandbox="">` da pré-visualização de emails, que herda a CSP do pai. Risco sem benefício. |
| **Falta `Cross-Origin-Embedder-Policy`** | `require-corp` partiria os pixels e o iframe da pilha de anúncios da Google, que estão lá de propósito. O COEP só compensa com isolamento cross-origin a sério (SharedArrayBuffer), que este sítio não usa. |
| **`worker-src 'self'` bloqueia o worker de imagens do admin** | Não bloqueia: `image-prep.ts:206` usa `new Worker(new URL("./image-worker.ts", import.meta.url))`, que o bundler resolve para um URL da própria origem. |
| **Endpoint de relatórios de CSP como amplificador/DoS** | `api/security/csp-report/route.ts` tem limite de 30 pedidos/minuto por IP, responde `204` sem corpo, e só regista três campos fixos — nunca ecoa nada. |
| **`X-Frame-Options` redundante com `frame-ancestors`** | É redundante por desenho, e é a intenção: cobre browsers antigos. Não faz mal. |
| **`interest-cohort=()` "já cobre" o rastreio por interesses** | Falso, e é o Achado 1: é um nome morto. Medido `browsing-topics === true` apesar dele. |
| **HSTS insuficiente para a lista de _preload_** | Já cumpre: `max-age=63072000` (2 anos, ≥ 1 ano exigido), `includeSubDomains`, `preload`. Nada a fazer no código. Fica por confirmar **fora** desta máquina se o domínio chegou a ser submetido em `hstspreload.org` — não verificável sem rede. |
| **`vercel.json` a sobrepor cabeçalhos** | Só define `crons`. Não toca em cabeçalhos. |

---

## §6 — O que fica por fazer (por ordem de valor)

1. **`connect-src` + Supabase** (Achado 3) — uma linha, antes de alguém ligar o
   carregamento directo de fotos. Baixo esforço, evita um bug silencioso.
2. **`nonce` em `SpeculationRules.tsx` e `GoogleTag.tsx`** — duas linhas. Não
   muda nada hoje, mas são 2 das violações que impedem qualquer avanço futuro
   para uma CSP com _nonce_, mesmo só nas rotas dinâmicas.
3. **CSP com _nonce_ só nas rotas dinâmicas** (`/orcamento/admin`, `/portal/*`,
   `/proposta/*`) — depois de (2). São as rotas que mexem em sessões de admin,
   tokens de cliente e dados pessoais, e são as únicas onde o _nonce_ funciona
   sem sacrificar a pré-renderização. Medido: nessas rotas o _nonce_ já é
   aplicado correctamente a tudo o que é do Next; só faltam as duas de (2).
4. **Confirmar o _preload_ do HSTS** em `hstspreload.org` (precisa de rede).
