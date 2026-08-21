# Agente 6 — Densidade e legibilidade

O trabalho de **densidade** está quase todo feito, e feito bem: o `TabelaOuCartoes` serve cartões
abaixo de 1024 em vez de encolher a tabela, o calendário desce o `p-6` para `p-3` para os dias
ficarem com 44 px, o `PaymentsPanel` decide a forma por *container query* e não por largura de
janela, o `PainelInterno` põe o nome da linha em `col-span-3` e os cartões da Visão Geral já
aprenderam a pôr o rótulo antes do número. Não há tabelas espremidas a 390 px e não há cartões a
flutuar em ar. **O que está partido é a legibilidade**, e está partido por uma razão só: o remédio
existe e quase ninguém o toma. `--bo-text-muted` (5,9:1) foi introduzido, tem 109 chamadas — e ao
lado dele continuam **693 ocorrências de `text-foreground/NN` abaixo de /58 no back office**, todas
por baixo dos 4,5:1, das quais ~459 em linhas que também pedem um tamanho de letra. É a mesma
doença por curar, com nome novo em 109 sítios e nome velho em 693.

A conta é directa e vale a pena tê-la à mão. No back office `--color-foreground` é `#0d0d0d` sobre
branco puro (19,44:1 a cheio), e o modificador `/NN` do Tailwind v4 é alfa a sério
(`color-mix(… , transparent)`), portanto compõe-se sobre o fundo:

| alfa | cor composta | rácio s/ `#ffffff` | AA texto normal |
|---|---|---|---|
| /35 | ≈ `#a8a8a8` | **2,32:1** | falha |
| /40 | ≈ `#9d9d9d` | **2,67:1** | falha |
| /45 | ≈ `#929292` | **3,11:1** | falha |
| /50 | ≈ `#868686` | **3,64:1** | falha |
| /55 | ≈ `#7b7b7b` | **4,30:1** | falha (por 0,2) |
| **/58** | ≈ `#747474` | **4,77:1** | **passa — é aqui que começa o AA** |
| /64 (`--bo-text-muted`) | ≈ `#646464` | 5,91:1 | passa |

**O chão do AA é /58.** Tudo abaixo disso é texto que não se lê ao sol — e /55, que é onde estão
131 chamadas e a variante `ghost` do `Button`, falha por 0,2 num ecrã de escritório. Numa quinta,
com o ecrã a competir com 100 000 lux, falha por muito mais: a norma dos 4,5:1 foi calibrada para
iluminação de interior, e a resposta ao briefing é **não, /55 não chega** — abaixo dele passa a
tratar-se de sorte, não de contraste.

Duas coisas boas que convém registar porque podiam estar mal e não estão: o `viewport`
(`src/app/[lang]/layout.tsx:199-210`) traz `width: device-width, initialScale: 1, viewportFit:
cover` e **não** traz `user-scalable=no` nem `maximum-scale` — o zoom do casal e o dela ficam
livres; e o `text-size-adjust: 100%` (`src/app/globals.css:601-602`) trava a inflação automática do
Safari, não o Dynamic Type nem o zoom, portanto está no sítio certo.

---

[A6-001] [Agente 6] [Todos os ecrãs — barra inferior] [Grave] Os cinco destinos que ela carrega o dia inteiro estão pintados com o token que o próprio CSS proíbe usar como única informação
     Largura onde falha: 390 / 430 / 768 (a barra é `lg:hidden`, some a partir de 1024)
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:3186-3187 e 3220-3224
       (token em src/app/globals.css:172)
     Observado: os rótulos e os ícones das seis células — Visão geral, Pedidos, …, «Mais» —
       usam `text-[var(--bo-text-faint)]` quando não estão activos. `--bo-text-faint` é
       `rgba(13,13,13,0.48)`, que compõe em `#8b8b8b` e dá **3,41:1** sobre o branco da barra.
       O próprio bloco que define o token diz, à letra: «decorative-only micro-labels (≥3:1;
       never the sole carrier of information)». Aqui É o único portador: é o nome do destino.
       O tamanho está bem — `text-[8px]` é levantado a 12 px pelo chão do telemóvel — mas 12 px
       a 3,41:1 não é texto grande para efeito de AA (precisa de ≥18,66 px bold ou ≥24 px),
       portanto o mínimo é 4,5:1 e falha.
     Proposta: trocar por `--bo-text-muted` (5,91:1) no estado inactivo. O activo já é
       `--bo-accent` `#4c6350` = 6,53:1 e fica onde está; a diferença entre 5,9 e 6,5 continua a
       ler-se com a mudança de matiz e a `scale-110` do ícone, que é o sinal a sério.
     Equivalente em desktop: não existe (a barra é só de telemóvel/tablet)

[A6-002] [Agente 6] [Todos os ecrãs] [Grave] 693 `text-foreground/NN` abaixo do chão do AA — o `--bo-text-muted` curou 109 sítios e deixou o resto
     Largura onde falha: todas (mas ao sol, a 390, é onde se nota)
     Onde: 693 ocorrências em ~90 ficheiros de src/app/[lang]/(site)/orcamento/admin/.
       Os piores focos, com a conta feita:
       · ProposalStudio.tsx:8471 — `<span className="text-foreground/45">Total</span>` na barra
         fixa do estúdio. **3,11:1**. É a palavra que diz o que é aquele número.
       · ProposalStudio.tsx:6409, 7362, 7424, 7881 — prosa de ajuda em
         `text-xs text-foreground/45` → 12 px a **3,11:1**.
       · PaymentsPanel.tsx:601 «Registar pagamento» em `/45` → **3,11:1**;
         PaymentsPanel.tsx:704 e 712 em `/35` → **2,32:1**.
       · Overview.tsx:488 «Guardado no servidor» em `/22` → **1,64:1**;
         Overview.tsx:1857, 1901 em `/30` → **2,02:1**.
       · ActivityLog.tsx:295 e 299 em `/22` e `/28` → **1,64:1** e **1,91:1** (o registo de
         quem fez o quê, a 12 px).
       · Toast.tsx:192 — o «×» que fecha o aviso, em `/40` → **2,67:1**.
       · ui/Field.tsx:81 e EditorDeEscolhas.tsx:56 — `placeholder:text-foreground/30` →
         **2,02:1**, e um placeholder é muitas vezes o único exemplo do formato pedido.
       · ui/PageHeader.tsx:60 — o subtítulo de TODOS os ecrãs, `text-sm text-foreground/55` →
         **4,30:1**.
     Proposta: mapa de um para um, sem inventar degrau novo — `/25`…`/45` → `bo-text-muted`
       (5,91:1) quando é informação, `bo-text-faint` só onde é mesmo decoração e há outra pista;
       `/50`…`/68` → `bo-text` (11,63:1) ou `bo-text-muted` conforme o peso. Depois um teste
       irmão do `escala-movel.test.ts` — varre os `.tsx` do back office e falha se aparecer
       `text-foreground/` com alfa < 58. Sem a rede, isto volta na semana seguinte.
     Equivalente em desktop: existe (é a mesma cor no portátil — mas ali há sombra e uma
       secretária, e é por isso que ninguém se queixou até agora)

[A6-003] [Agente 6] [Todos os ecrãs] [Grave] A cor dos avisos falha AA — `#b5654a` dá 4,26:1, e é ela que pinta os `role="alert"`
     Largura onde falha: todas
     Onde: 55 chamadas de `text-[#b5654a]`. As que doem:
       src/app/[lang]/(site)/orcamento/admin/PaymentsPanel.tsx:700-704 (`role="alert"` do erro de
       registo de pagamento); Overview.tsx:465 (`role="alert"`, `text-[10px]`);
       PerguntaDeDesfecho.tsx:355 (`role="alert"`, `text-[11px]`); AvisoDataOcupada.tsx:85-90;
       LifecycleStepper.tsx:99.
     Observado: `#b5654a` sobre branco = **4,26:1**. Falha AA para texto normal por 0,24, e todos
       estes usos são texto pequeno. Pior nas variantes: `text-[#b5654a]/80` = **3,06:1**,
       `/70` = **2,61:1**, e dentro do próprio chip `bg-[#b5654a]/12` o fundo sobe para `#f8efec`
       e o rácio cai para **3,69:1** (LifecycleStepper.tsx:99). O irmão sério, `#a03a1a`, dá
       **6,74:1** e já está no ficheiro (AvisoDeFalha.tsx:46 usa `#a03a1a`) — há duas cores de
       aviso na casa e a que ficou nos alertas é a que não passa.
       O primo amarelo é pior: `#c08a3e` = **3,02:1**, e sobre o seu próprio fundo
       `bg-[#c08a3e]/[0.06]` cai para **2,86:1** (AvisoDataOcupada.tsx:87). «Já há um evento nesta
       data» é exactamente o aviso que ela precisa de ver de pé, ao sol, antes de prometer a data.
     Proposta: uma cor de aviso só, `#a03a1a` (6,74:1), para texto e ícone; `#b5654a` fica
       relegado a bordas e fundos, onde 3:1 basta (WCAG 1.4.11). Para o amarelo, `#8a5d13`
       (**5,74:1**) já existe no ficheiro e é o mesmo tom.
     Equivalente em desktop: existe

[A6-004] [Agente 6] [Entrada — palavra-passe nova] [Grave] «Líquen Events · Portugal» está a 1,00:1 — branco sobre branco
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/recuperar/DefinirPalavraPasse.tsx:153-155
       (fundo em :69-71)
     Observado: `text-white/25` sobre `linear-gradient(180deg, #ffffff 0%, #f4f5f3 100%)`.
       Branco a 25% sobre branco compõe em branco: **1,00:1** no topo do gradiente e **1,02:1** no
       fundo. Não é pouco contraste — é nenhum. **Este bug exacto já foi encontrado e corrigido**
       no ecrã irmão: `EntradaComFotografia.tsx:273-294` traz o post-mortem escrito («Medido:
       1,00:1 sobre o #ffffff do topo do gradiente») e o `RodapeDaEntrada` exportado, já em
       `rgba(13,13,13,0.64)`. O `AdminLogin.tsx:779` importa-o. Este ficheiro ficou com a cópia
       velha à mão e ninguém reparou porque é a página a que só se chega por link de email.
     Proposta: apagar o `<p>` e usar `<RodapeDaEntrada />`, que já está exportado e já tem o
       `EntradaComFotografia.test.tsx` a refazer-lhe a conta.
     Equivalente em desktop: existe (é o mesmo elemento, invisível nos dois)

[A6-005] [Agente 6] [Calendário] [Grave] Os números dos dias vão de 2,67:1 a 1,39:1 — a grelha lê-se, os dias não
     Largura onde falha: 390 / 430 / 768
     Onde: src/app/[lang]/(site)/orcamento/admin/Calendario.tsx:588-590 e 652-654
     Observado: os dias fora do mês são `text-foreground/[0.15]` → **1,39:1**; os dias do mês sem
       marcação são `text-foreground/40` → **2,67:1**. Só o dia de hoje é legível, porque é branco
       sobre `#4d6350` (6,53:1, :648-650). Num calendário, o número do dia é a única coisa que
       diz onde se está a tocar — e o comentário três linhas acima
       (Calendario.tsx:459-465) diz que o `p-3` do telemóvel existe precisamente para «acertar no
       dia certo e não abrir o do lado». O alvo foi tratado; a cor não.
     Proposta: dias do mês em `--bo-text` (11,63:1) — é a informação principal da célula; dias
       fora do mês em `--bo-text-faint` (3,41:1), que aqui é honesto porque a célula já está
       marcada `aria-hidden` e a informação é o vazio.
     Equivalente em desktop: existe

[A6-006] [Agente 6] [Painel interno · Pagamentos] [Grave] Ao empilhar, o rótulo que liga o número ao significado fica a 1,77:1 — ou desaparece
     Largura onde falha: 390 / 430 (e qualquer painel abaixo de 36 rem)
     Onde: src/app/[lang]/(site)/orcamento/admin/PainelInterno.tsx:365-369;
       src/app/[lang]/(site)/orcamento/admin/PaymentsPanel.tsx:607-617 e 618-686
     Observado: dois casos da mesma doença.
       (a) No `PainelInterno`, a grelha colapsa bem — o nome da linha ocupa `col-span-3` e
       «Preço · Custo · Margem» ficam por baixo, alinhados às colunas. Só que o cabeçalho é
       `text-foreground/25` → **1,77:1**. Três números de dinheiro a 12 px, empilhados, com os
       rótulos que os distinguem praticamente invisíveis: a relação rótulo↔valor sobrevive à
       geometria e morre na cor.
       (b) No `PaymentsPanel` é pior: abaixo de 36 rem o cabeçalho é `@max-[36rem]:hidden`
       (:609) e o formulário passa a `grid-cols-2`. Os seis controlos ficam **só com
       `aria-label`** — «Tipo de pagamento», «Valor em euros», «Data do pagamento», «Método ou
       nota». Um leitor de ecrã ouve-os; os olhos dela vêem um `select`, um número à direita, um
       seletor de data e uma caixa com o placeholder «MB Way…». Registar dinheiro sem rótulos
       visíveis é WCAG 3.3.2 e é o ecrã onde um erro custa a conta.
     Proposta: (a) o cabeçalho passa a `bo-text-muted` (5,91:1); (b) abaixo de 36 rem, em vez de
       esconder o cabeçalho, dobrar cada campo num `<label>` visível de 12 px em `bo-text-muted`,
       uma linha por campo. Perde-se densidade; ganha-se poder registar um pagamento de pé.
     Equivalente em desktop: não existe (no portátil o cabeçalho da grelha está lá e o rótulo
       vê-se)

[A6-007] [Agente 6] [Todos os ecrãs] [Grave] Abaixo de 1024 os quatro degraus de letra pequena colapsam todos em 12 px — a hierarquia desaparece no ecrã onde ela mais faz falta
     Largura onde falha: 390 / 430 / 768 (acima de 1024 a hierarquia volta)
     Onde: src/app/globals.css:381-394 (o chão), com o efeito medível em
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx e AdminClient.tsx
     Observado: o chão do telemóvel levanta `text-[7px]`…`text-[11px]` a `var(--bo-fs-caption)`
       = 12 px. Está certo e resolveu um problema real. O efeito colateral é que **quatro degraus
       de tamanho passam a ser um só**, e `text-xs` já era 12 px:
       · ProposalStudio.tsx — 42 nós sub-12 (8/9/10/11 px) + 69 `text-xs` = **111 nós de texto no
         mesmo tamanho**;
       · AdminClient.tsx — 57 + 27 = **84 nós**;
       · Overview.tsx — 46 + 17 = 63; PaymentsPanel — 26 + 11 = 37.
       E o `.bo-eyebrow`, que titula 127 secções, também é levantado a 12 px (globals.css:391-394)
       **e perde as maiúsculas** (globals.css:284-288 põe `text-transform: none` em `.bo-eyebrow`
       dentro do `admin-mode`). Ou seja: no telemóvel um título de secção e a legenda por baixo
       dele têm o mesmo tamanho, a mesma caixa e quase o mesmo espacejamento — separa-os só o
       `font-weight: 600`. A 390 px, num estúdio com 111 nós a 12 px, isso não é hierarquia, é
       uma parede de texto.
     Proposta: dois degraus abaixo do corpo, não um. Manter `--bo-fs-caption` (12 px) para a
       legenda, e dar ao `.bo-eyebrow` do telemóvel `--bo-fs-label` (13 px) com `font-weight:
       650` e `letter-spacing: 0.06em` — ou devolver-lhe as maiúsculas SÓ abaixo de 1024, que é
       onde o tamanho já não as distingue. E, no estúdio, promover a 15 px (`--bo-fs-body`) o
       texto que é conteúdo e não andaime: nomes de serviço, valores, notas do casal.
     Equivalente em desktop: não existe (acima de 1024 há 8, 9, 10, 11, 12 e 15 px, e a hierarquia
       lê-se toda)

[A6-008] [Agente 6] [Página do casal — mood boards] [Grave] O véu da legenda acaba em transparente, e o título de 22 px sobre uma foto clara cai a 1,95:1
     Largura onde falha: todas (mas a 390 px o `clamp` prende o título no mínimo, 22 px)
     Onde: src/app/[lang]/(privado)/proposta/[token]/Inspiracao.tsx:389-412
     Observado: o véu é `bg-gradient-to-t from-black/60 via-black/25 to-transparent` com 58% de
       altura. A conta, sobre um branco de casamento (céu queimado `#ebebeb`, vestido, toalha):
       | posição no véu | véu efectivo | branco 100% | branco/85 |
       |---|---|---|---|
       | rente ao fundo (o subtítulo) | black/60 | 6,48:1 | **5,24:1** |
       | uma linha acima (o título) | ≈ black/45 | 3,88:1 | 3,29:1 |
       | meio do véu | black/25 | **2,16:1** | **1,95:1** |
       O subtítulo (`text-white/85`, `text-sm`) safa-se porque está colado ao fundo. O título
       (`text-white`, `clamp(22px, 3.4vw, 34px)` em Playfair) está por cima dele, no troço fino, e
       a 390 px o `clamp` dá-lhe 22 px — que **não** é texto grande para o AA (precisa de ≥24 px,
       ou ≥18,66 px em bold, e este não é bold). Precisa de 4,5:1 e tem 3,3 ou menos. O
       `textShadow: 0 1px 12px rgba(0,0,0,0.35)` ajuda a vista e não conta para a norma. O
       comentário do próprio ficheiro (:383-388) já diz que «sem o véu um título branco sobre uma
       fotografia de mesa posta em luz alta desaparece» — a intuição estava certa, a curva é que
       ficou curta.
     Proposta: subir o degrau do meio de `via-black/25` para `via-black/50` e levar o véu a 70% da
       altura em vez de 58% — a foto perde pouco (o corte fica na zona onde já há tinta) e o
       título passa a ≥4,5:1 mesmo sobre `#ebebeb`. Alternativa que não escurece a foto: pôr o
       véu só atrás da caixa de texto (`bottom-0` com a altura do bloco), como o
       `EntradaComFotografia.tsx:392-397` já faz — «o véu colado ao texto e não ao painel: assim a
       conta do contraste é a mesma na faixa de 160 px do telemóvel e no painel de 900 px».
     Equivalente em desktop: existe (mas com 34 px o título passa a ser texto grande e o mínimo
       desce para 3:1 — no telemóvel é que a norma aperta)

[A6-009] [Agente 6] [Página do casal — proposta] [Grave] A prosa que o casal tem de ler está entre 3,55:1 e 4,11:1, a 11 e 13 px
     Largura onde falha: todas
     Onde: src/app/[lang]/(privado)/proposta/[token]/page.tsx:637;
       Documento.tsx:244, 699, 833, 861, 1039, 1129; Escolhas.tsx:144, 181
     Observado: esta rota **não** é `admin-mode` — `--color-foreground` é `#2a2620` (mais claro que
       o `#0d0d0d` do back office) e o chão de 12 px do telemóvel **não se aplica aqui**, porque
       está fechado em `body.admin-mode`. Portanto os tamanhos são os que estão escritos, e as
       contas sobre branco (`bg-surface` = `#ffffff`) são:
       · `text-foreground/55` = **3,55:1** — Documento.tsx:244 e 1039 (`text-[13px]`, a linha de
         resumo de uma secção fechada, ou seja o único texto de uma secção que ainda não abriu);
         :699 e :833 a 10 e 11 px.
       · `text-foreground/60` = **4,11:1** — page.tsx:637 («emitida a … · versão N», a 11 px, a
         linha que responde à pergunta «estou a olhar para o mesmo papel?»); Documento.tsx:861 e
         :1129 a 13 px; Escolhas.tsx:144 (`text-sm`, a nota de uma escolha que o casal tem de
         tomar).
       Falham todas. O único que passa é o `/68` (**5,27:1**), usado em page.tsx:527, 618 e 701 —
       o degrau certo já está no ficheiro, ao lado dos que falham.
     Proposta: subir tudo o que é prosa a `/72` (**6,00:1**) e nada abaixo de `/68` (5,27:1) — que
       é o degrau que esta página já usa e que sobrevive a um ecrã ao sol. E, já que o casal
       também está lá fora: dar a esta rota o mesmo chão de 12 px que o back office tem, ou
       subir os `text-[10px]`/`text-[11px]` para 12/13 px à mão. São 13 sítios.
     Equivalente em desktop: existe

[A6-010] [Agente 6] [Botões — toda a interface] [Grave] A variante `ghost` a 4,30:1 não chega para o sol, e o subtítulo de todos os ecrãs está na mesma cor
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/ui/Button.tsx:71;
       src/app/[lang]/(site)/orcamento/admin/ui/PageHeader.tsx:60
     Observado: `ghost` é `text-foreground/55` → `#7b7b7b` → **4,30:1**. Falha AA para texto
       normal (o `sm` é `text-xs` = 12 px, o `md` é `text-sm` = 14 px — nenhum é texto grande) e
       falha por pouco no escritório. Ao sol falha por muito: os 4,5:1 da norma pressupõem
       iluminação de interior, e num ecrã de telemóvel com reflexo o contraste efectivo cai para
       uma fracção do nominal. O `hover:text-foreground/80` (10,80:1) não conta — num ecrã de
       toque não há hover, e o `ghost` é usado nas barras de ferramentas do estúdio e nas linhas
       de lista, que é onde ela toca de pé.
       O mesmo /55 pinta o subtítulo do `PageHeader` — a frase que explica cada ecrã, presente em
       todos eles.
     Proposta: `ghost` → `text-foreground/70` (**7,39:1**), que continua claramente mais leve que
       o `secondary` (`/90`, 15,29:1) e que o texto a cheio, e que resolve o «quieto até ao
       hover» com peso e fundo em vez de com desaparecimento. Subtítulo do `PageHeader` →
       `bo-text-muted` (5,91:1). Nenhum dos dois mexe na identidade: é o mesmo cinzento neutro.
     Equivalente em desktop: existe

[A6-011] [Agente 6] [Calendário] [Menor] Uma fresta no chão da letra: `sm:text-[11px]` escapa ao selector, e o teste não o apanha
     Largura onde falha: 640–1023 (iPad em retrato a 768 é o caso real)
     Onde: src/app/[lang]/(site)/orcamento/admin/Calendario.tsx:588 e 652;
       regra em src/app/globals.css:382-384; rede em
       src/app/[lang]/(site)/orcamento/admin/escala-movel.test.ts:79-101
     Observado: o chão é `body.admin-mode :is(.text-\[10px\], .text-\[11px\], …)`. Uma classe com
       variante gera `.sm\:text-\[11px\]`, que **não** casa com `.text-\[11px\]` — são nomes de
       classe diferentes. Portanto entre 640 e 1023 o `sm:text-[11px]` ganha ao chão e os números
       dos dias voltam a 11 px. É exactamente a fresta que os comentários do `Overview.tsx`
       (:1600-1607 e :1667-1669) descrevem e fecham trocando `sm:` por `lg:` — o `Calendario`
       ficou de fora da varredura.
       E a rede não o apanha: a regex do teste é `/text-\[(\d+)px\]/g`, que casa a **subcadeia**
       de `sm:text-[11px]` e devolve `text-[11px]`; como o CSS contém `.text-\[11px\]`, o teste
       dá verde. Passa uma coisa que em runtime não acontece.
     Proposta: nas duas linhas, `text-[11px] sm:text-[12px]` ou simplesmente `text-xs` (já é 12).
       E na rede, apanhar o prefixo: casar `/(?:^|["\s])((?:[a-z-]+:)*)text-\[(\d+)px\]/` e
       falhar quando há prefixo **e** o tamanho é < 12 — ou, mais robusto, acrescentar
       `[class*="text-[8px]"]`-style ao selector do `globals.css`.
     Equivalente em desktop: não existe (acima de 1024 o chão não se aplica de propósito)

[A6-012] [Agente 6] [Documentação dos tokens] [Menor] O bloco que ensina a escolher a cor diz números que não são os das cores
     Largura onde falha: todas (é um defeito de manutenção, não de desenho)
     Onde: src/app/globals.css:164-172
     Observado: o comentário promete `--bo-text ~6.4:1`, `--bo-text-muted ~5.6:1`,
       `--bo-text-faint ~4.1:1`. Refeitas as contas sobre `#ffffff` (e sobre o
       `--bo-surface-sunken` `#f7f7f8`, entre parênteses):
       · `rgba(13,13,13,0.82)` → `#2e2e2e` → **11,63:1** (11,10) — não 6,4
       · `rgba(13,13,13,0.64)` → `#646464` → **5,91:1** (5,76) — perto, mas por baixo do real
       · `rgba(13,13,13,0.48)` → `#8b8b8b` → **3,41:1** (3,37) — **não 4,1**
       O erro que interessa é o terceiro. Quem lê «~4,1:1» ao escolher um token pensa que está
       quase no AA e usa o `faint` para informação — que é precisamente o que aconteceu na barra
       inferior (A6-001). 3,41 é o degrau dos ≥3:1, e o comentário até o diz duas linhas abaixo;
       só que o número que está lá em cima contradiz a regra que está lá em baixo.
     Proposta: corrigir os três números e acrescentar um teste que os recalcule a partir do
       próprio `globals.css` — a mesma ideia do `EntradaComFotografia.test.tsx`, que já refaz uma
       conta de contraste e falha se a cor mudar.
     Equivalente em desktop: existe

[A6-013] [Agente 6] [Todos os ecrãs — barra inferior] [Menor] A barra cresce com a letra; a reserva por baixo dela não
     Largura onde falha: 390 / 430 / 768, quando o utilizador aumenta a letra
     Onde: src/app/globals.css:235 (`--bo-barra-inferior: 72px`);
       src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:3186, 3220, 3255;
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:8440
     Observado: as células da barra são `min-h-[var(--bo-barra-inferior)]` e o `<main>` reserva
       `pb-[calc(var(--bo-barra-inferior)+env(safe-area-inset-bottom))]`. O token é **72 px
       fixos**, mas o conteúdo da célula é elástico: ícone 16 px + `gap-1` + rótulo de duas linhas
       reservadas (`min-h-[2.2em]`, que a 12 px dá 26,4 px) + `py-2` dos dois lados ≈ 66 px hoje.
       Aumentar a letra do browser leva o rótulo acima de 72 e a barra cresce (é `min-h`, não
       `h`) — mas a reserva do `<main>` continua a ler o token de 72 px, e a última linha da
       lista volta a ficar por baixo da barra. É o mesmo defeito que o comentário do
       `globals.css:216-234` conta ter custado quinze píxeis quando os rótulos subiram de 8 para
       12 px: naquela altura a causa foi copiar o número para quatro sítios, agora é o número ser
       fixo enquanto a coisa que ele mede não é.
       No mesmo saco: o back office pede tamanhos em `px` literais em 568 sítios
       (13× `text-[8px]`, 82× `[9px]`, 225× `[10px]`, 207× `[11px]`, 21× `[12px]`, 13× `[13px]`),
       enquanto a escala da casa está toda em `rem` (`--bo-fs-caption: 0.75rem` …). Abaixo de 1024
       o chão converte-os a `rem` por acidente feliz; acima de 1024 ficam em `px` e não respondem
       ao tamanho de letra do browser.
     Proposta: medir a barra com um `ResizeObserver` e escrever a altura real numa custom property
       (`--bo-barra-inferior-real`), que o `<main>` e a barra do estúdio passam a ler; o token de
       72 px fica como valor inicial. E, quando os tamanhos forem revistos por A6-007, escrevê-los
       em `rem` ou nas variáveis `--bo-fs-*` em vez de `px`.
     Equivalente em desktop: não existe (acima de 1024 não há barra inferior)

[A6-014] [Agente 6] [Visão geral] [Menor] O ▲/▼ do mês está a 2,50:1 e a 3,14:1, e a diferença entre subir e descer é só a cor e uma seta de 9 px
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/Overview.tsx:94-118
     Observado: `up ? "text-[#8aad85]" : "text-[#c08457]"`. `#8aad85` sobre branco = **2,50:1**;
       `#c08457` = **3,14:1**. O texto é `text-[10px] font-semibold` (12 px depois do chão), logo
       precisa de 4,5:1 — falham os dois, e o verde falha até o mínimo de 3:1 dos elementos
       não-textuais, o que apanha também a seta em `currentColor`. O `aria-label` está bem escrito
       («a subir 12% face ao mês anterior») e salva quem ouve; quem vê tem uma percentagem cinzento-
       clara e uma seta de 9×9.
     Proposta: `#3a5c39` (**7,58:1**) para subir e `#a03a1a` (**6,74:1**) para descer — as duas já
       vivem no ficheiro. E aumentar a seta para 12×12, que a 390 px é o que a torna distinguível
       antes de a cor ser lida.
     Equivalente em desktop: existe

[A6-015] [Agente 6] [Clientes · Propostas] [Menor] As etiquetas de estado e o selo VIP estão entre 2,70:1 e 3,46:1 a 8 px
     Largura onde falha: todas
     Onde: src/app/[lang]/(site)/orcamento/admin/Clientes.tsx:258, 328, 338;
       src/app/[lang]/(site)/orcamento/admin/Propostas.tsx:152, 571, 584;
       src/app/[lang]/(site)/orcamento/admin/NewQuoteModal.tsx:162
     Observado: `text-[#b88f28]` sobre `bg-[#d6ab3a]/15` (que compõe em `#fbf3e0`) = **2,70:1**,
       num `text-[8px] uppercase font-bold` (12 px depois do chão). `text-[#a9781f]` sobre
       `bg-[#b5894a]/12` = **3,46:1**. Sobre branco puro seriam 3,00 e 3,89 — o fundo tingido, que
       existe para dar o significado, é o que rouba o resto do contraste. Chips de estado são a
       forma mais rápida de varrer uma lista com os olhos; a 2,7:1 varre-se a mancha e lê-se o
       texto uma etiqueta de cada vez.
     Proposta: escurecer o texto para `#7a5a1c` (**6,35:1** sobre branco, ≈5,7 sobre o fundo
       tingido) e deixar o fundo como está — o dourado da casa mantém-se, o texto é que deixa de
       ser dourado também. É a mesma jogada que o `--color-gold-text` (`#8a6a1d`, 5,05:1) já faz
       no site público: uma cor para a mancha, outra para a letra.
     Equivalente em desktop: existe

[A6-016] [Agente 6] [Formulário público de orçamento] [Menor] O rótulo de cada campo é 10,5 px fixos, e as dicas estão a 3,08:1
     Largura onde falha: todas (o chão de 12 px é `body.admin-mode` e não chega aqui)
     Onde: src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx:160, 202, 1058, 1178, 1324, 1366;
       `.eyebrow` em src/app/globals.css:1670-1676
     Observado: o rótulo de campo é `text-[10.5px] … text-foreground/60` → **4,11:1** a 10,5 px, e
       é o único texto que diz o que se está a preencher. As dicas por baixo são
       `text-[12px] text-foreground/50` → **3,08:1** e `text-[11px] text-foreground/55` →
       **3,55:1**. As opções por escolher são `text-foreground/55` (:222, :1014, :1080, :1203) →
       3,55:1, contra `text-foreground/85` da escolhida — a diferença entre escolhido e não
       escolhido está a ser feita com contraste que já não passa AA no lado não escolhido.
       Ao lado, `.eyebrow` está em `font-size: 10px` **em `px`** (globals.css:1672) e a sua
       variante sobre a fotografia do painel, `rgba(222,218,212,0.55)` (globals.css:1681-1683),
       dá **1,86:1** sobre uma zona média da foto e **1,29:1** sobre uma zona clara — só passa se
       a fotografia por baixo for escura, e nenhuma regra garante que seja.
     Proposta: rótulos a `/72` (**6,00:1**) e 12 px; dicas a `/68` (5,27:1); a opção não escolhida
       a `/70` (5,62:1), deixando a distinção ao fundo e à borda em vez de à legibilidade.
       No `.eyebrow`: `0.625rem` em vez de `10px`, e a variante sobre foto ou ganha um véu como o
       da `EntradaComFotografia` ou sobe para branco a 85%.
     Equivalente em desktop: existe

---

## Tabela de contraste

Todas as contas feitas por composição alfa em sRGB (fórmula WCAG 2.x da luminância relativa),
sobre o fundo real de cada sítio. **Fundos**: back office `#ffffff` (`--bo-surface`) ou `#f7f7f8`
(`--bo-surface-sunken`); site público e página do casal `#ffffff` (`bg-surface`).
**Limiares**: 4,5:1 para texto normal · 3:1 para ≥18,66 px bold ou ≥24 px · 3:1 para elementos
não-textuais (bordas, ícones que carregam sentido).

| ficheiro:linha | cor | fundo | rácio | AA? |
|---|---|---|---|---|
| `admin/recuperar/DefinirPalavraPasse.tsx:153` | `text-white/25` → `#ffffff` | gradiente `#ffffff`→`#f4f5f3` | **1,00:1** | ✗ (nem 3:1) |
| `globals.css:1682` (`.eyebrow` sobre foto) | `rgba(222,218,212,.55)` | foto clara `#b0b0b0` | **1,29:1** | ✗ |
| `admin/Calendario.tsx:588` | `text-foreground/[0.15]` → `#dbdbdb` | `#ffffff` | **1,39:1** | ✗ |
| `admin/PaymentsPanel.tsx:740` | `text-foreground/15` | `#ffffff` | **1,39:1** | ✗ |
| `admin/Overview.tsx:488`, `ActivityLog.tsx:295` | `text-foreground/22` → `#c6c6c6` | `#ffffff` | **1,64:1** | ✗ |
| `admin/PainelInterno.tsx:365` (cab. Preço/Custo/Margem) | `text-foreground/25` → `#bfbfbf` | `#ffffff` | **1,77:1** | ✗ |
| `admin/EmptyState.tsx:19`, `TagsField.tsx:109`, `Overview.tsx:1491,1739,1810` | `text-foreground/25` | `#ffffff` | **1,77:1** | ✗ |
| `admin/ActivityLog.tsx:299` | `text-foreground/28` | `#ffffff` | **1,91:1** | ✗ |
| `Inspiracao.tsx:396` (título, meio do véu) | `#ffffff` | `#ebebeb` + `black/25` | **1,95:1** | ✗ |
| `admin/PaymentsPanel.tsx:609` (cab. de colunas) | `text-foreground/30` → `#b4b4b4` | `#ffffff` | **2,02:1** | ✗ |
| `admin/ui/Field.tsx:81` (placeholder) | `text-foreground/30` | `#ffffff` | **2,02:1** | ✗ |
| `admin/Overview.tsx:1321,1383,1857,1901`, `ShortcutsModal.tsx:103`, `AjudaGlossario.tsx:83,109` | `text-foreground/30` | `#ffffff` | **2,02:1** | ✗ |
| `admin/PaymentsPanel.tsx:704,712` | `text-foreground/35` → `#a8a8a8` | `#ffffff` | **2,32:1** | ✗ |
| `admin/ProposalStudio.tsx:6197,6316,6620,7560,8509` | `text-foreground/35` | `#ffffff` | **2,32:1** | ✗ |
| `admin/Overview.tsx:104` (▲ a subir) | `#8aad85` | `#ffffff` | **2,50:1** | ✗ |
| `admin/Clientes.tsx:338` (selo VIP) | `#b88f28` | `#d6ab3a`/15 → `#fbf3e0` | **2,70:1** | ✗ |
| `admin/Toast.tsx:192` (fechar aviso) | `text-foreground/40` → `#9d9d9d` | `#ffffff` | **2,67:1** | ✗ |
| `admin/Calendario.tsx:652` (nº do dia) | `text-foreground/40` | `#ffffff` | **2,67:1** | ✗ |
| `admin/AvisoDataOcupada.tsx:87` (▲ do aviso) | `#c08a3e` | `#c08a3e`/6 → `#fdf8f1` | **2,86:1** | ✗ |
| `Documento.tsx:244,1039` (resumo de secção fechada, 13 px) | `text-foreground/55` (`#2a2620`) | `#ffffff` | **3,55:1** | ✗ |
| `admin/ProposalStudio.tsx:8471` («Total» da barra) | `text-foreground/45` → `#929292` | `#ffffff` | **3,11:1** | ✗ |
| `admin/ProposalStudio.tsx:6409,7362,7424,7881`, `PaymentsPanel.tsx:601` | `text-foreground/45` | `#ffffff` | **3,11:1** | ✗ |
| `OrcamentoForm.tsx:202,1058` (dicas) | `text-foreground/50` (`#2a2620`) | `#ffffff` | **3,08:1** | ✗ |
| `admin/Overview.tsx:104` (▼ a descer) | `#c08457` | `#ffffff` | **3,14:1** | ✗ (passa só ≥24 px) |
| `Inspiracao.tsx:396` (título, ≈black/45) | `#ffffff` | `#ebebeb` + `black/45` | **3,29:1** | ✗ |
| `AdminClient.tsx:3187,3224` (rótulos da barra inferior) | `--bo-text-faint` `rgba(13,13,13,.48)` → `#8b8b8b` | `#ffffff` | **3,41:1** | ✗ (é o degrau ≥3:1) |
| `admin/Propostas.tsx:152` (chip de estado) | `#a9781f` | `#b5894a`/12 → `#f9f2e9` | **3,46:1** | ✗ |
| `admin/EmailTemplates.tsx:828`, `EmailTemplatesBilingue.tsx:709` | `text-foreground/30`, `text-sm` | `#ffffff` | **2,02:1** | ✗ |
| `admin/LifecycleStepper.tsx:99` (chip de aviso) | `#b5654a` | `#b5654a`/12 → `#f8efec` | **3,69:1** | ✗ |
| `Overview.tsx:1562` (nº do KPI, 24–34 px bold) | `#7c854b` | `#ffffff` | **3,95:1** | ✓ (só por ser grande) |
| `page.tsx:637` (emitida/versão, 11 px) | `text-foreground/60` (`#2a2620`) | `#ffffff` | **4,11:1** | ✗ |
| `Escolhas.tsx:144` (nota da escolha, `text-sm`) | `text-foreground/60` | `#ffffff` | **4,11:1** | ✗ |
| `OrcamentoForm.tsx:160` (rótulo de campo, 10,5 px) | `text-foreground/60` | `#ffffff` | **4,11:1** | ✗ |
| `admin/PaymentsPanel.tsx:701` (`role="alert"`) | `#b5654a` | `#ffffff` | **4,26:1** | ✗ |
| `admin/PerguntaDeDesfecho.tsx:355`, `Overview.tsx:465` (`role="alert"`) | `#b5654a` | `#ffffff` | **4,26:1** | ✗ |
| `admin/ui/Button.tsx:71` (`ghost`) | `text-foreground/55` → `#7b7b7b` | `#ffffff` | **4,30:1** | ✗ (por 0,2) |
| `admin/ui/PageHeader.tsx:60` (subtítulo) | `text-foreground/55` | `#ffffff` | **4,30:1** | ✗ |
| `globals.css:191` (`--bo-control-border`) | `rgba(13,13,13,.55)` | `#ffffff` | **4,30:1** | ✓ (≥3:1 p/ borda) |
| `Inspiracao.tsx:407` (subtítulo, rente ao fundo) | `text-white/85` | `#ebebeb` + `black/60` | **5,24:1** | ✓ (à justa) |
| `page.tsx:527,618,701` | `text-foreground/68` (`#2a2620`) | `#ffffff` | **5,27:1** | ✓ |
| `globals.css:1674` (`.eyebrow` público) | `rgba(42,38,32,.66)` | `#f7f4ee` | **4,75:1** | ✓ |
| `globals.css:171` (`--bo-text-muted`) | `rgba(13,13,13,.64)` → `#646464` | `#ffffff` | **5,91:1** | ✓ |
| `globals.css:1631` (`.bo-eyebrow`) | `rgba(13,13,13,.64)` | `#ffffff` | **5,91:1** | ✓ |
| `admin/ui/Button.tsx:69` (`subtle`) | `#4d6350` | `#4d6350`/10 → `#edf0ee` | **5,67:1** | ✓ |
| `admin/ui/Button.tsx:67` (`primary`, branco s/ moss) | `#ffffff` | `#4d6350` | **6,53:1** | ✓ |
| `admin/AvisoDeFalha.tsx:46` | `#a03a1a` | `#f6e6df`/50 → `#fbf3ef` | **6,13:1** | ✓ |
| `admin/ui/Button.tsx:74` (`danger`) | `#ffffff` | `#8a2a22` | **8,62:1** | ✓ |
| `globals.css:170` (`--bo-text`) | `rgba(13,13,13,.82)` → `#2e2e2e` | `#ffffff` | **11,63:1** | ✓ |
| `admin/ui/Button.tsx:64` (`secondary`) | `text-foreground/90` | `#ffffff` | **15,29:1** | ✓ |

**Nota sobre o `--bo-surface-sunken`** (`#f7f7f8`, as faixas e os insets): baixa todos os rácios
da coluna acima em ~2–4%. Nada que passa por pouco sobre branco continua a passar lá — o
`ghost` cai de 4,30 para **4,22:1** e o `--bo-control-border` também.

---

## Resumo

1. A **densidade** está tratada — cartões em vez de tabela abaixo de 1024, `p-3` no calendário,
   container query nos pagamentos, `col-span-3` no painel interno. Não encontrei nada espremido
   nem nada com ar a mais.
2. A **legibilidade** não: 693 `text-foreground/NN` abaixo de /58 no back office contra 109 usos
   do `--bo-text-muted` que os devia substituir. O chão do AA é **/58 (4,77:1)**.
3. Os rótulos dos **cinco destinos da barra inferior** estão a **3,41:1**, no token que o próprio
   `globals.css` proíbe usar como única informação (A6-001).
4. A cor dos **avisos**, `#b5654a`, dá **4,26:1** — falha AA, e é ela que pinta os `role="alert"`
   (A6-003). Existe já `#a03a1a` a 6,74:1 no mesmo ficheiro.
5. `DefinirPalavraPasse.tsx:153` tem texto branco sobre branco: **1,00:1**. O mesmo bug já foi
   corrigido no ecrã irmão e o componente certo está exportado (A6-004).
6. Abaixo de 1024 os quatro degraus de letra pequena colapsam todos em 12 px: **111 nós no mesmo
   tamanho** no estúdio, 84 no `AdminClient`, e o `.bo-eyebrow` perde tamanho *e* maiúsculas
   (A6-007). A hierarquia existe no portátil e desaparece no telemóvel.
7. O véu da legenda dos **mood boards** vai a `transparent`: o título de 22 px sobre foto clara
   cai a **1,95:1** (A6-008).
8. Na **página do casal** a prosa está entre 3,55 e 4,11:1 a 11–13 px, e o chão de 12 px do
   telemóvel não chega lá porque está fechado em `body.admin-mode` (A6-009).
9. Sobre a pergunta do briefing: **não**, o `ghost` a 4,30:1 não chega ao sol — falha AA por 0,2 no
   escritório e por muito mais lá fora; `/70` (7,39:1) resolve sem perder o «quieto» (A6-010).
10. O `viewport` está limpo — sem `user-scalable=no` nem `maximum-scale`. Fica um defeito de
    escala por resolver: `--bo-barra-inferior` é 72 px fixos e a reserva por baixo da barra não
    acompanha o crescimento dela quando a letra sobe (A6-013).
