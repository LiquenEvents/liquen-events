# LP-AUDIT — o que existe hoje e o que tem de mudar para a Meta

Auditoria das páginas de destino que já existem, feita antes de escrever uma
linha das variantes sociais. Todos os números aqui foram **medidos**, com as
condições ditas, e não estimados.

---

## Como foi medido

`node scripts/medir-social.mjs http://127.0.0.1:3123`, contra `next start` na
mesma máquina, com:

- ecrã de **390 × 844** e densidade 3 (o iPhone que serve de referência de desenho);
- rede estrangulada a **1,6 Mbps / 150 ms** (perfil de 4G lento, o mesmo do Lighthouse mobile);
- **CPU a 1/4** da velocidade;
- as **cadeias de agente reais** do Instagram e do Facebook, em iOS e Android;
- bytes contados pelo `encodedDataLength` do protocolo, já comprimidos.

**O que estes números não são.** Isto é Chromium, não é o WKWebView do iPhone.
A aproximação é honesta em cinco eixos (agente, CPU, rede, armazenamento
bloqueado, ausência de service worker) e não reproduz outros dois (limites de
JIT e de memória do WKWebView, e a barra que a app do Instagram desenha por
cima). **Os valores abaixo são um piso optimista.** O telemóvel real é mais
lento do que isto, nunca mais rápido.

---

## O que existe

| Página | Rota | Para quem |
| --- | --- | --- |
| 13 regionais | `/casamentos/<polo>` | quem pesquisou "decoração casamento \<zona\>" |
| 3 de estilo | `/casamentos/estilo/<estilo>` | quem pesquisou "casamento boho/minimalista/campo" |
| 1 internacional | `/casamentos/destination` | casais estrangeiros, em inglês |

**34 páginas** ao todo (17 × 2 idiomas). Todas estáticas (`force-static`), todas
com um único componente de cliente: o formulário.

### Estrutura, secção a secção

**Regionais** — herói a 92svh com imagem + H1 + 2 parágrafos + formulário ao
lado; lista de espaços da zona; grelha de 6 fotografias; barra de saídas
(formulário completo, telefone, portefólio).

**Estilo** — mesmo herói, sem lista de espaços, 4 fotografias, e uma lista de
ligações para as 13 regionais.

**Internacional** — herói, cinco perguntas e respostas por escrito, regiões,
saídas.

### Formulário

`PedidoRapido` (src/components/ads/PedidoRapido.tsx). O comentário no topo diz
"quatro perguntas"; **são seis campos**: data, convidados, local, nome, email,
telemóvel. Quatro são obrigatórios. Sem caixa de consentimento (base legal
pré-contratual, RGPD art. 6.º/1/b), com aviso de privacidade visível.

---

## Peso e velocidade, medidos

Bytes na rede, perfil **Instagram iOS**, em KB:

| Página | HTML | JS | CSS | imagem | fontes | **total** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/casamentos/alentejo` | 22 | **207** | 31 | 451 | **128** | **856** |
| `/casamentos/comporta` | 21 | **207** | 31 | 464 | **128** | **865** |
| `/casamentos/estilo/boho` | 21 | **207** | 31 | 1299 | **128** | **1858** |
| `/casamentos/destination` | 22 | **207** | 31 | 435 | **128** | **843** |

LCP e TBT, por perfil (ms):

| Página | Safari | Instagram iOS | Facebook iOS | Instagram Android | armazenamento bloqueado | sem service worker |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/casamentos/alentejo` | 2076 | 2080 | 2076 | 2040 | 2064 | 2068 |
| `/casamentos/comporta` | 2148 | 2128 | 2128 | 2136 | 2104 | 2152 |
| `/casamentos/estilo/boho` | 2412 | 2384 | 2428 | **2472** | 2380 | 2428 |
| `/casamentos/destination` | 1904 | 1864 | 2168 | 1952 | 1848 | 1876 |

TBT (limite superior, soma do excesso acima de 50 ms de cada tarefa longa):
**409–583 ms** em tudo. O elemento de LCP é sempre a fotografia do herói na
versão de 1536 px.

### O que estes números dizem

1. **207 KB de JavaScript, iguais em todas as páginas.** Quando escrevi este
   ponto pela primeira vez, atribuí-o ao esqueleto do sítio (menu, rodapé,
   transições, CTA fixo…) e propus tirá-lo daí. **Fui medir e estava errado** —
   ver "Uma correcção a mim próprio", mais abaixo. Os 207 KB são quase todos o
   React e o encaminhador do Next, que qualquer página deste sítio paga. O
   esqueleto são 9 KB.
2. **128 KB de tipografias.** Inter variável + Playfair variável em romano *e*
   itálico. O itálico do Playfair serve a assinatura e a citação do sítio
   institucional; nestas páginas não aparece.
3. **623 KB de fotografias que a página não usa.** Ver a secção seguinte — é o
   achado mais caro desta auditoria.
4. **Nenhuma página parte** em nenhum dos seis perfis. Sem erros de consola,
   sem pedidos próprios falhados, sem primeiro ecrã em branco. O único pedido a
   terceiros é o `gtag.js` da Google (inacessível a partir desta máquina, o que
   é do ambiente de medição e não da página).
5. **O armazenamento bloqueado não parte nada** — as guardas `try/catch` do
   `click-id.ts`, do `LeadSourceCapture` e do `ConsentBanner` aguentam.

### O achado: o pré-aquecimento de capas dispara nas páginas pagas

A `/casamentos/estilo/boho` pesa o dobro das outras. A primeira explicação que
me ocorreu — que as suas quatro fotografias são `.jpeg` de origem e teriam
ficado fora do pré-gerador de WebP — **estava errada**, e verificá-la levou dois
minutos: `public/_img/g/image0-{384,640,768,1024,1280}.webp` existe, como para
todas as outras.

A causa real, lida da lista de pedidos de imagem:

```
=== /casamentos/estilo/boho   18 imagens, 1299 KB
    266 KB  DJI_20250913190635_0120_D-1536.webp   ← capa de /contacto
    181 KB  image2-1280.webp                      ← foto desta página
    168 KB  image0-1280.webp                      ← foto desta página
    145 KB  EW1_1330-1536.webp                    ← capa de /servicos
    134 KB  JOAO_E_PEDRO_DJI_…_0002_D-1536.webp   ← capa da página inicial
     91 KB  image5-1-1280.webp                    ← foto desta página
     82 KB  EW1_1393-1536.webp                    ← capa de /clientes
     81 KB  J_A-52-1536.webp                      ← o herói, o candidato a LCP
     70 KB  hd-edited-1536.webp                   ← capa de /sobre
     66 KB  DaniGui_Preview20-1536.webp           ← capa de /galeria
```

**623 KB dos 1299 KB são as capas das seis páginas institucionais**, que esta
página nunca desenha. É o `HeroWarm` (src/components/HeroWarm.tsx), que vive no
layout de raiz e descarrega em segundo plano as capas das *outras* páginas para
uma navegação futura ser instantânea.

Nas páginas institucionais isso é uma troca defensável. Numa landing page paga
é dinheiro deitado fora, e por três razões que se somam:

1. quem chega de um anúncio **não vai navegar** para /sobre nem para /galeria —
   ou converte, ou sai;
2. `HeroWarm` salta explicitamente `/orcamento` e `/galeria`, e a lista
   `HERO_BY_ROUTE` não contém nenhuma rota `/casamentos/…`. Ou seja: numa
   landing page **nenhuma das seis é a página actual**, e portanto descarregam-se
   **as seis**. É o pior caso possível, exactamente onde os bytes custam mais;
3. corre `onIdle`, portanto compete com as fotografias da própria página.

É também isto que explica a variação entre corridas: quando a folga de CPU
chega cedo, o aquecimento entra dentro da janela de medição e a página salta de
~850 KB para ~1860 KB; quando chega tarde, não entra. O visitante real não
escolhe qual lhe calha.

**Corrigido nesta entrega** (uma linha em `HeroWarm`): as rotas `/casamentos/`
e `/s/` deixam de aquecer capas alheias. As variantes sociais nunca o teriam,
porque não carregam o cromado do sítio — mas as páginas do Google tinham, e
tinham desde o primeiro dia.

### Uma correcção a mim próprio

A primeira corrida deste guião reportou um erro por página no perfil sem
service worker (`Cannot read properties of undefined (reading 'register')`) e
**0 KB de JS/CSS/HTML** em todas as páginas. Nenhuma das duas coisas era
verdade:

- o erro era da simulação, que redefinia `navigator.serviceWorker` para
  `undefined` deixando a propriedade a existir — a guarda `"serviceWorker" in
  navigator` do componente passava e a linha seguinte rebentava. O WKWebView
  não tem lá a propriedade nenhuma. Corrigido para apagar a propriedade do
  protótipo; o erro desapareceu, porque nunca existiu;
- os 0 KB vinham de contar o cabeçalho `Content-Length`, que o Next não envia
  no HTML nem nos pedaços de JS (vão em `chunked`). Corrigido para o
  `encodedDataLength` do protocolo.

Ambas as correcções estão escritas dentro do guião, no sítio onde foram feitas.

### E uma terceira, a maior de todas

Escrevi neste documento, e no código, que os **207 KB de JavaScript eram na
maior parte o esqueleto do sítio**, e que tirá-lo do layout de raiz os
poupava. Construí a separação em grupos de rotas com esse argumento. Depois
medi o resultado:

| página | JS na rede |
| --- | ---: |
| `/casamentos/alentejo` **antes** da separação | 207 KB |
| `/casamentos/alentejo` **depois** | 212 KB |
| `/s/comporta`, sem esqueleto nenhum | **225 KB** |

**A página sem esqueleto descarrega MAIS JavaScript do que a que o tem.** A
causa está no empacotamento, e confirma-se numa linha:

```
$ grep -l "whatsapp-fixed" .next/static/chunks/*.js
1-pcd4gnokre8.js
```

Um ficheiro só, de 9 KB no fio, e é pedido pelas duas páginas. O Turbopack
junta os componentes de cliente do layout de raiz — consentimento, os dois
tags de medição, o provedor de idioma, que as páginas sociais precisam mesmo —
ao mesmo pedaço onde pôs o menu e o rodapé. Os 207 KB são o React e o
encaminhador; nenhuma arrumação de componentes lhes toca.

**A separação fica na mesma**, e o argumento dela passa a ser o verdadeiro:
não são bytes, é **trabalho que deixa de acontecer** — sem DOM de menu e de
rodapé, sem três ouvintes de scroll, sem dois IntersectionObserver, sem
registo de service worker, sem pré-aquecimento de capas alheias, sem
Speculation Rules a pré-renderizar seis páginas que ninguém vai abrir. E sem
menu, que era o pedido.

O comentário no código foi corrigido no mesmo sítio onde estava errado
(`src/components/CromadoDoSitio.tsx`).

---

## O que estas páginas assumem sobre quem chega

Tudo nelas assume **intenção declarada**:

| A página assume | Verdade no Google | Verdade na Meta |
| --- | --- | --- |
| a pessoa procurou isto | sim, escreveu-o | não, estava a ver stories |
| lê dois parágrafos antes de decidir | sim | não |
| a região no H1 é uma resposta que ela quer | sim, foi o que pesquisou | não perguntou nada |
| um formulário é um passo aceitável | sim | é uma barreira |
| a prova social pode vir tarde | sim, ela já procurava | não, é a primeira pergunta dela |
| o herói pode ser qualquer boa fotografia | sim | tem de ser **a do anúncio** |

O H1 "Decoração de casamentos no Alentejo" é uma boa resposta a uma pergunta.
Não é um bom primeiro segundo para quem não fez pergunta nenhuma.

---

## O que se aproveita

| Peça | Estado | Porquê |
| --- | --- | --- |
| `src/lib/ads/polos.ts` | **inteiro** | fotografias, espaços, geografia e textos por zona; as variantes sociais lêem daqui |
| `HeroImage` + `heroImageLoader` | **inteiro** | é o que serve os WebP estáticos por largura |
| `blurFor` | **inteiro** | marcador desfocado sem pedido extra |
| `pageMetadata` | **inteiro** | com `robots: noindex` por cima |
| `/api/orcamento` | **quase** | precisa de aceitar contacto por telemóvel sem email |
| `click-id.ts` | **como molde** | a peça equivalente da Meta (`fbclid`) segue a mesma forma |
| `track()` | **inteiro** | ganha um terceiro destino |
| Estrutura de fotografias e espaços | **inteira** | é o que dá prova local |

## O que tem de mudar

| # | O que | Porquê | Onde se resolve |
| --- | --- | --- | --- |
| 1 | **Tirar o esqueleto do caminho** | menu, CTA fixo, transições e aquecimento de capas não servem quem vem de um anúncio. **Não são os 207 KB** (ver a correcção acima): são 9 KB de bytes e uma quantidade real de trabalho — ouvintes, observadores e a pré-renderização de seis páginas | rota `/s/` fora do cromado |
| 2 | ~~Tirar o itálico do Playfair~~ | **NÃO FEITO.** As tipografias são declaradas no layout de raiz e são as mesmas em todo o sítio; medido, as variantes sociais continuam a carregar os mesmos 128 KB. Separá-las obrigava a duas configurações de `next/font`, o que muda o sítio inteiro para poupar num ramo — desproporcionado, e a dizer para depois |
| 3 | **Herói igual ao anúncio** | quebra de continuidade visual = ressalto imediato | `hero` por variante, no catálogo |
| 4 | **Prova social no primeiro ecrã** | quem não te procurou pergunta primeiro se és real | secção 2 passa a secção 1,5 |
| 5 | **Formulário de 6 para 4 campos** | um formulário de seis campos num semáforo não se preenche | `PedidoRelampago` |
| 6 | **WhatsApp como CTA primário** | em Portugal, tráfego frio de Instagram fala, não escreve formulários | barra fixa no fundo |
| 7 | **CTA sempre visível** | o dedo está a fazer scroll, não a procurar botões | barra fixa, não o `StickyCTA` (que só aparece a 75% do ecrã) |
| 8 | **`noindex`** | não podem competir com o sítio na pesquisa orgânica | metadados da rota |
| 9 | **Desenhar a 390 px primeiro** | o herói actual põe o formulário AO LADO do texto: no telemóvel isso empurra-o para baixo de tudo | grelha de uma coluna |
| 10 | **Medição da Meta** | não existe nenhuma: nem pixel, nem CAPI, nem captura de `fbclid` | `src/lib/meta/*` |
| 11 | **Parar o pré-aquecimento de capas** | 623 KB de fotografias de páginas que quem vem de um anúncio nunca abre | uma linha em `HeroWarm` — vale para as páginas do Google **e** para as sociais |

---

## O resultado, medido depois

Mesmo guião, mesmas condições, 60 pares página × perfil:

| | páginas do Google (antes) | variantes sociais |
| --- | ---: | ---: |
| LCP, intervalo | 1864 – 2472 ms | **1560 – 1752 ms** |
| TBT (limite superior) | 409 – 583 ms | 272 – 592 ms |
| bytes totais | 843 – 1858 KB | **609 – 706 KB** |
| bytes de imagem | 435 – 1299 KB | **174 – 271 KB** |
| elemento do LCP | a fotografia | **o `<h1>`** |

Três coisas a reter:

1. **O LCP passou a ser o texto, não a fotografia.** A frase dos três segundos
   pinta antes da imagem. Para tráfego que decide em três segundos, é o
   melhor sítio onde o LCP pode estar.
2. **As páginas do Google também melhoraram**, e não foi por causa das
   sociais: foi a correcção do pré-aquecimento de capas. A
   `/casamentos/estilo/boho` caiu de 1858 para 1104 KB, e a
   `/casamentos/alentejo` de 856 para 654 KB.
3. **Nada parte em nenhum dos seis perfis** — nem com o armazenamento
   bloqueado, nem sem service worker. As únicas respostas ≥400 foram
   `429 /api/vitals`, que é o limitador de ritmo a reagir a dezenas de
   medições seguidas da mesma máquina, e não um defeito da página.

## O que fica igual, de propósito

- **As 34 páginas do Google não mudam de forma.** Foram desenhadas para
  intenção declarada e é para isso que servem. As variantes sociais são
  páginas **novas**, não uma reescrita destas.
- **A base legal do formulário.** Continua pré-contratual, sem caixa de
  consentimento. O consentimento que passa a existir é outro — o do pixel — e
  vive no banner de cookies, onde já vive o da Google.
- **O catálogo `polos.ts` continua a ser a fonte única.** As variantes sociais
  apontam para lá em vez de copiar textos, e o teste de canibalização passa a
  cobri-las também.
