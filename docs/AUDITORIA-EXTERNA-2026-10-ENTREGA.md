# Auditoria externa (outubro de 2026) — o que foi feito

O pedido está em `docs/AUDITORIA-EXTERNA-2026-10.md`. Tudo está no ramo
`auditoria-correcoes`, com um commit por código. Não houve deploy, nem push
para `main`, nem migrações aplicadas.

## A tabela

| Código | Estado | O que se fez, ou porque não | Ficheiros |
|---|---|---|---|
| S1 | **à mão (tua)** | Ver a lista no fim. | — |
| S2 | feito | `Canonical` sem `www`, `Expires` 2027-12-31, sem a nota interna e sem a `Policy` do GitHub. | `public/.well-known/security.txt` |
| S3 | feito | Ao público sai só `{"status":"ok"}`, sem tocar na base de dados. O detalhe exige `Authorization: Bearer <HEALTH_TOKEN>`, comparado em tempo constante. Sem a variável definida, ninguém vê o detalhe. | `src/app/api/health/route.ts`, `README.md`, `.env.example` |
| S4 | **não feito — o impacto primeiro** | Nonces na CSP obrigam a gerar cada página a cada pedido: todas as páginas estáticas do sítio passavam a dinâmicas. Medido na galeria: 43 scripts, nenhum com nonce, e 42 violações com a CSP estrita. Paraste-me aqui, e eu parei. | `next.config.ts` (comentário com a medição) |
| S5 / C3 | feito | `/.env`, `/backup.zip` e `/pagina-que-nao-existe` devolvem **404** (antes 200, com a página inicial nos dois primeiros). O 404 lê-se sem JavaScript, em PT e EN. | `src/app/global-not-found.tsx`, `src/app/[lang]/layout.tsx`, `src/proxy.ts`, `next.config.ts` |
| B1 | migração escrita, **não aplicada** | Confirmado antes: o servidor usa sempre a chave secreta (`getSupabase()`), e não há Supabase no browser. | `db/migracoes/20261008_b1_revogar_anon_e_authenticated.sql` |
| B2 | migração escrita, **não aplicada** | `next_invoice_seq` com `search_path = ''`. | `db/migracoes/20261008_b2_next_invoice_seq_search_path.sql`, `db/schema.sql` |
| B4 | migração escrita, **não aplicada** | Índices para as cinco chaves estrangeiras sem índice. | `db/migracoes/20261008_b4_indices_das_chaves_estrangeiras.sql`, `db/schema.sql` |
| C1 | feito | **A causa não era a que a auditoria supunha.** Não era 100vw nem o zoom do rato: era a entrada `zoom` do mosaico, que começa ampliado. Medido: 38 px a 1440, 34 a 1280, 27 a 1024. A grelha passa a `overflow-x-clip`. Há um passeio novo a 1440, 1280, 1024 e 390 nas quatro páginas. | `servicos/[slug]/page.tsx`, `e2e/sem-scroll-horizontal.spec.ts` |
| A1 | feito | Em computador o flutuante sai. No telemóvel aparece depois do primeiro ecrã (já era assim) e esconde-se enquanto o aviso de cookies está no ecrã (regra CSS, sem JavaScript). | `StickyCTA.tsx`, `globals.css`, `e2e/cta-flutuante.spec.ts` |
| C2 | feito | «Serviços de Decoração e Produção de Eventos \| Líquen Events» e «Event Decoration & Production Services \| Líquen Events». | `src/lib/i18n/pt.ts`, `en.ts` |
| C4 | **parado — a causa é outra** | Ver «Perguntas para ti». | — |
| C5 | feito | O parágrafo é o do **aviso de cookies**, que está em todas as páginas e não só em /orcamento. Media 4,48:1 sobre a página branca; passa a `text-white`, com 5,92:1. Fica em 12,5 px porque a 14 a barra ganhava uma linha. | `ConsentBanner.tsx` |
| C6 | feito | Com rato, os alvos passam a ≥ 24 px com padding e margem negativa igual (a técnica que a barra já usava). Capturas antes e depois **iguais ao píxel**. Ficam de fora as duas caixas de seleção de /orcamento: o rótulo à volta, que também se clica, já tem 24 px. | `Footer.tsx`, `ManageCookiesLink.tsx`, `page.tsx` (início), `OrcamentoForm.tsx`, `servicos/[slug]/page.tsx`, `e2e/alvos-de-24-com-rato.spec.ts` |
| P2 | **parado — a causa é outra** | Ver «Perguntas para ti». | — |
| P1 | **lista feita, à espera de ti** | Ver «Perguntas para ti». | — |
| P3 | **parado — a causa é outra** | Ver «Perguntas para ti». | — |
| P4 | sem mudança, medido | O próprio browser (Chromium) já pede as fotografias da grelha a **1 200 px** do ecrã, antes dos 600 pedidos. Um observador a 600 px pedia-as **mais tarde**. No Safari não verificado. | — |
| A6 | feito | O desfoque dá lugar à fotografia em 300 ms. A fotografia nunca fica escondida à espera do JavaScript: o véu só existe depois de hidratar, e só se a foto ainda não chegou. | `SafeImage.tsx`, `tema.css` |
| P5 | **parcial** | Fotografia `EW1_0576`: em cinco carregamentos daqui, a página usou sempre a versão de `/_img/g/` e o JPEG de 2 101 px nunca foi pedido. Não reproduzido aqui; não verificado no sítio publicado, porque esta máquina não lhe chega. Logótipo: ver «Perguntas para ti». | — |
| A2 | feito | A barra deixa de animar `height`. A fila tem sempre 76 px e desce por `translate`, e há dois logótipos que trocam por `opacity` e `scale`. Capturas a 1440 e 390: repouso e menu aberto **iguais ao píxel**; descido igual à vista, com diferenças de anti-serrilhado sub-píxel nos links. | `Navbar.tsx` |
| A3 | **parado — contradiz uma decisão tua** | Ver «Perguntas para ti». | — |
| A4 | feito | Todas as fotografias do sítio passam a 400 ms e escala 1.03, com a curva da casa. Eram seis sítios com 0,7 a 1,1 s e escalas de 1.04 a 1.06. | `contacto`, `servicos/[slug]`, `galeria`, `clientes`, `confirmacao`, `tema.css`, `globals.css` |
| A5 | feito | A faixa de logótipos e a parede de fotografias **já paravam** fora do ecrã. Faltava a seta «descer», que agora também pára. | `motion/SetaDeDescer.tsx`, `page.tsx` (início), `globals.css` |
| A8 | feito | `:active` com `scale(.97)` em 100 ms nos botões do sítio. Nada com movimento reduzido. O passeio lê o `scale` com o rato em baixo. | `globals.css`, `ui-classes.ts`, `Navbar`, `StickyCTA`, `WhatsAppButton`, `ConsentBanner`, `BarraFixa`, `e2e/toque-do-sitio.spec.ts` |
| A9 | feito | O `scroll-behavior: smooth` sai do `html`. Fica suave só na âncora `#pedido` das páginas de anúncio e no «voltar ao topo» da galeria, seco com movimento reduzido. | `globals.css`, `[lang]/layout.tsx`, `BarraFixa.tsx` |
| A7 | **não feito — mostrar antes** | Só se sobrasse tempo e mostrando primeiro, como pediste. Não está feito. | — |
| P6 | **à mão (tua)** | Ver a lista no fim. | — |

Fora da auditoria, a teu pedido: o texto corrido das páginas de serviços
passa a justificado («formato quadrado»). Na mesma conversa, o email de
confirmação também ficou justificado; seguiu no PR #162, que já está junto.

Todas as durações novas são tokens (`--transition-duration-foto-zoom`,
`-foto-chega` e `-carregar`, em `tema.css`). A curva é sempre a da casa,
`cubic-bezier(0.16, 1, 0.3, 1)`, e só se anima `transform`/`scale`/`translate`
e `opacity`.

## Perguntas para ti (a tua regra: «se a causa for diferente, diz-me antes»)

**C4 — o salto de layout.** Não é a barra de cookies nem a fonte. É o ecrã
de «a carregar» (`(site)/loading.tsx`). Ele desenha-se a partir do topo da
página (`-mt-24`), mas as páginas sem fotografia de topo começam 96 px mais
abaixo: privacidade, termos, regiões e estilos. Quando a rede é lenta o
suficiente para esse ecrã aparecer primeiro, a página salta 96 px ao chegar.
Medido aqui em `/casamentos/acores`: CLS 0,0667 a 1440.

Proposta: o ecrã de espera passa a ficar por cima da página, sem ocupar
espaço, e assim já não a empurra. Mexe num ecrã que aparece em todas as
navegações lentas, por isso preferi perguntar.

**P2 — o Google carregado duas vezes.** O código carrega **um** `gtag/js`
(`G-29CZZ76H6F`). O segundo pedido (`AW-…`) é a própria biblioteca da Google
a buscar o contentor do Google Ads, quando se configura esse ID. Só se tira
juntando o Google Ads ao Google tag do GA4 nas definições da Google, e isso
não está no código.

Quanto a passar a `lazyOnload`, há um comentário no `GoogleTag.tsx` que diz
que isso **já foi tentado**: nas páginas com muitas imagens o GA4 deixou de
receber dados. Proposta: carregar na primeira interação, ou quando o browser
ficar livre (com um tecto de poucos segundos). Não consigo confirmar daqui
que as conversões do Google Ads continuam a disparar, porque esta máquina não
chega à Google. Ficaria por verificar no Tag Assistant depois do deploy.
Avanço?

**P1 — os componentes cliente.** Medido com o analisador do Next, na página
inicial:

| Bloco | Tamanho | O que é |
|---|---|---|
| react-dom | 200 KB | o React — fixo |
| runtime do Next | 152 KB | **é o «bloco de 156 KB» da auditoria** — fixo |
| polyfills | 110 KB | `noModule`: os browsers modernos não o descarregam |
| dicionários PT + EN inteiros | ~51 KB | **evitável** |
| componentes do sítio (Navbar 10 KB, NotFoundView 4,8, SafeImage 4,4, ConsentBanner 2,5, StickyCTA 2,2, WhatsApp 1,8, …) | ~60 KB no total | os nossos |
| galeria: GaleriaClient | 29 KB | só em /galeria |
| orçamento: OrcamentoForm | 21 KB | só em /orcamento |

Converter componentes a servidor poupa pouco: os nossos somam ~60 KB. O que
pesa é o React e o Next. Proponho três coisas, por esta ordem:

1. O `AvisoDeCarregamento.tsx` (montado em todas as páginas) chama
   `getDictionary`, e isso põe **os dois dicionários inteiros** no browser.
   Ele só precisa da parte `common`, que já chega pelo `LocaleProvider`. Mais
   sete ficheiros cliente importam de `@/lib/i18n` em vez de
   `@/lib/i18n/config`. Poupa ~51 KB por página. Não muda nada à vista.
2. O `NotFoundView` (4,8 KB) vai para todas as páginas e só é preciso no
   404: passa a `next/dynamic`.
3. O ecrã da página inicial é sobretudo o próprio HTML. Tem 474 KB, dos quais
   ~165 KB são uma segunda cópia da folha de estilos, por causa do
   `inlineCss: true`. Essa escolha foi tua, para tirar o ecrã em branco no
   telemóvel, e está medida no `next.config.ts`. Desde então a folha cresceu
   de 34 KB para ~165 KB. Vale a pena voltar a medir a troca, mas não lhe
   mexi.

**P3 — a primeira imagem da galeria.** No telemóvel, a «primeira imagem» que
o Lighthouse mede (o LCP) é o **logótipo da barra**, e não uma fotografia.
Isto vale em /galeria, no início e em /orcamento. A fotografia do topo e o
primeiro mosaico já têm `fetchpriority="high"` e pré-carregamento em AVIF.
Os mosaicos seguintes estão `lazy` de propósito: no telemóvel estão
escondidos, e com `eager` eram descarregados para nada. Dar prioridade alta
a 4 a 6 fotografias punha-as a disputar a ligação com o logótipo e com a
fotografia do topo. Proposta: não mexer, ou pré-carregá-las só em computador
(`media`). Todas passam pelo `/_img/` com AVIF: confirmado.

**P5 — o logótipo.** Os 97 px da auditoria são a barra **descida**. Na
primeira pintura, que é a que conta, o logótipo tem 214 a 248 px de largura.
A versão de 192 px ficava desfocada exactamente aí. Proposta: não mexer. A
diferença entre a versão de 384 e a de 256 são 4 KB.

**A3 — a cortina.** Não está só na página Sobre: está em **todas** as
páginas do sítio. Vê-se sempre, em cada refresh e ao voltar atrás, por
decisão tua, que ficou escrita no `Cortina.tsx`: «Eu quero que apareça
sempre — ou quando faço refresh, ou quando volto atrás e volto a entrar». A
auditoria pede o contrário (só na primeira visita, ≤ 0,8 s). Qual vale?

## Números (Lighthouse, telemóvel, mediana de 3)

Medidos **aqui**, contra o build de produção local. Esta máquina não chega ao
googletagmanager nem ao sítio publicado. Por isso os números são mais
optimistas do que os da auditoria e não incluem o custo da Google (P2).

| Página | | Desempenho | LCP | TBT | CLS | Peso |
|---|---|---|---|---|---|---|
| / | antes | 72 | 3,5 s | 651 ms | 0 | 1 688 KB |
| | depois | **75** | **3,1 s** | **602 ms** | 0 | **1 515 KB** |
| /galeria | antes | 70 | 3,4 s | 766 ms | 0 | 1 178 KB |
| | depois | 70 | 3,7 s | **608 ms** | 0 | **1 104 KB** |
| /orcamento | antes | 83 | 3,0 s | 411 ms | 0 | 877 KB |
| | depois | 82 | 3,1 s | **386 ms** | 0 | **849 KB** |

Lido com honestidade:
- O TBT desce nas três páginas (−7 % a −21 %) e o peso também (−3 % a −10 %).
- O desempenho e o LCP mexem dentro do ruído de uma corrida para a outra. As
  três corridas de cada página variaram até 6 pontos antes e depois. O LCP da
  galeria (3,4 → 3,7 s) está dentro dessa variação.
- Os objetivos (TBT < 300 ms, LCP < 2,5 s, desempenho > 85) **não estão
  atingidos**. O que mais pesava está nas quatro perguntas acima: P1 (os
  dicionários e a folha de estilos duplicada), P2 (a Google) e P3/P5.
- As corridas estão guardadas (`antes_*` e `depois_*`), com o mesmo comando,
  o mesmo Chromium e o Lighthouse 13.5.0.

## As migrações (para reveres e aplicares tu)

- `db/migracoes/20261008_b1_revogar_anon_e_authenticated.sql`
- `db/migracoes/20261008_b2_next_invoice_seq_search_path.sql`
- `db/migracoes/20261008_b4_indices_das_chaves_estrangeiras.sql`

Cada uma tem a consulta de verificação no fim. O `db/schema.sql` já as
reflecte.

## A tua lista, à mão

1. **S1** — pôr o repositório privado.
2. **S1** — rodar o segredo da sessão, a chave secreta do Supabase e a
   palavra-passe do SMTP, e actualizar no Vercel
   (Settings → Environment Variables).
3. **S3** — criar `HEALTH_TOKEN` no Vercel, se quiseres que um monitor veja
   o estado da base de dados. Sem ela, `/api/health` responde só «ok».
4. **P6** — ver nos registos do Vercel se há 502 em /contacto.
5. Aplicar as três migrações, depois de as leres.

## Segredos no histórico (gitleaks, 1 526 commits)

**Nenhum segredo verdadeiro.** Há 12 achados, todos valores de teste escritos
dentro de testes: segredos de sessão de mentira e tokens fabricados.

| Ficheiro | Commit |
|---|---|
| `route.escada.test.ts`, `recuperar/definir/route.test.ts`, `recuperar/route.test.ts`, `admin-auth.recuperacao.test.ts` | e13d38a7 |
| `vitals/route.test.ts`, `safe-path.test.ts`, `analytics-token-leak.test.tsx` | 8b3aca67 |
| `portal-link.test.ts` | f4eeafc5 |
| `proposta/route.test.ts` | dd46ba93 |

Com as regras por omissão aparece também o vector de teste público do
RFC 6238 em `totp.test.ts`.

## Problemas novos que encontrei

- `/servicos/nao-existe` e `/s/abc` também respondiam 200; agora 404.
- `/orcamento/confirmacao/LIQ-X` responde 200 com «Pedido Recebido» para
  qualquer referência, mesmo inexistente. Não mexi.
- Com o 404 global, os 404 com título próprio de alguns ramos («Serviço não
  encontrado») passaram a usar o 404 do sítio.
- O HTML da página inicial tem 474 KB, ~165 KB dos quais uma segunda cópia
  da folha de estilos (ver P1, ponto 3).
- O `Guioes.test.tsx` (back office, que não toquei) falha às vezes numa
  passagem completa. Não tem diferenças em relação ao `main`, e o próprio
  ficheiro regista três falhas destas.
