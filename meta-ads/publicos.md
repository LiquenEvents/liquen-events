# Públicos — a quem se mostra, e por que ordem

---

## O constrangimento que manda em tudo

**50 € por mês, no total, para Google e Meta.** É o mesmo número que governa
`/ads-output/estrutura.md`, e a aritmética aqui é ainda mais apertada do que lá.

Um clique de Instagram em Portugal, no segmento de casamentos, custa
tipicamente menos do que um clique de pesquisa da Google — mas a Meta precisa
de **cerca de 50 conversões por semana e por conjunto de anúncios** para sair
da fase de aprendizagem. Com este orçamento isso é inatingível para qualquer
conjunto, e é preciso dizê-lo à partida em vez de fingir o contrário.

**A consequência prática:** não se optimiza para `Lead`. Otimiza-se para um
evento que acontece muito mais vezes — `Contact` (clique no WhatsApp) ou
`ViewContent` — e lê-se o `Lead` como resultado, não como sinal de treino.
Optimizar para um evento que ocorre duas vezes por mês é entregar o orçamento a
um algoritmo que não tem dados para decidir nada.

---

## A ordem por que se abre

A Meta é muito melhor a **fechar** do que a **abrir**. Quem já esteve no site
converte a uma taxa incomparavelmente maior do que quem nunca ouviu falar da
marca. Com orçamento pequeno, a ordem certa é a que gasta primeiro onde o
retorno é mais provável.

### 1.º — Retargeting de quem já visitou (a jogada mais rentável)

| | |
| --- | --- |
| **quem** | visitou `/casamentos/*` ou `/s/*` nos últimos 180 dias e NÃO submeteu pedido |
| **como se constrói** | Públicos → Personalizado → Site → "Pessoas que visitaram páginas específicas" → URL **contém** `casamentos` OU `/s/` |
| **exclusões** | quem disparou `Lead` (nos últimos 365 dias) |
| **porquê** | é a única fatia onde a marca já não é desconhecida. Estas pessoas viram o portefólio, viram os preços implícitos, e saíram — muitas por não estarem prontas nesse dia, não por não gostarem |
| **dimensão esperada** | pequena, e não faz mal: um público de 500 pessoas com 20 € por mês vê o anúncio o suficiente para se lembrar |
| **criativos** | C02, C04 |
| **orçamento sugerido** | **40% do que for para a Meta** |

⚠ **Este público só existe depois de o pixel estar a correr e a acumular
tráfego.** Nas primeiras duas a três semanas está vazio. É por isso que o
arranque começa na prospecção mesmo sendo esta a jogada mais rentável: não há
nada para retargetar no dia um.

### 2.º — Semelhantes a partir de quem já fechou

| | |
| --- | --- |
| **quem** | Lookalike 1% Portugal, construído sobre a lista de **clientes fechados** |
| **como se constrói** | Públicos → Personalizado → Lista de clientes (carregar CSV com email e telemóvel) → depois Semelhante 1%, Portugal |
| **a fonte** | exporta do back office os pedidos com estado `aceite`. Email e telemóvel bastam; a Meta cifra do lado dela ao carregar |
| **porquê** | a semelhança construída sobre **quem pagou** é de outra qualidade que a construída sobre quem preencheu um formulário. Um formulário barato atrai semelhantes baratos |
| **⚠ o problema real** | a Meta exige um mínimo de **100 correspondências** para gerar um semelhante. Se a lista de casamentos fechados não chegar lá, usa-se a lista de **todos os pedidos** (`Lead`), que é maior e pior — e diz-se que é pior |
| **criativos** | C08, C01 |
| **orçamento sugerido** | 20% |

### 3.º — Prospecção fria, por zona

| | |
| --- | --- |
| **quem** | 25–40 anos, Portugal, com o interesse **"Noivado"** (`Engagement`) ou o comportamento **"Recentemente noivos (3–6 meses)"** |
| **zona** | por conjunto de anúncios: Setúbal+Alcácer (Comporta), Évora+Beja+Portalegre (Alentejo), Lisboa+Cascais+Sintra, Faro (Algarve) |
| **porquê a segmentação é grosseira** | com este orçamento, apertar demais mata o alcance antes de o algoritmo aprender fosse o que fosse. O sinal fino vem do criativo, não da segmentação |
| **criativos** | C01, C03, C05, C07 |
| **orçamento sugerido** | 30% |

**Não segmentes por "casamento" como interesse genérico.** Apanha quem foi
convidado para um, quem gosta de fotografia de casamento, e metade da indústria
— e nenhum deles vai casar.

### 4.º — Wedding planners, como público próprio

| | |
| --- | --- |
| **quem** | cargos e interesses de planeamento de eventos, Portugal, 28–55 |
| **porquê separado** | é um interlocutor completamente diferente: não compra emoção, compra fiabilidade de fornecedor. O anúncio fala de planta técnica e mapa de montagem, não de "o vosso dia" |
| **valor** | um planner que corra bem traz três a seis casamentos por ano, todos os anos. É o público com melhor retorno a prazo e o pior retorno imediato |
| **criativo** | C10, e só esse |
| **orçamento sugerido** | 10%, e só quando houver folga |

### 5.º — Internacional (adiar)

Casais estrangeiros a casar em Portugal. **Não abrir no arranque:** o clique
custa várias vezes mais em Londres do que em Évora, e com 50 €/mês compra-se
uma amostra pequena de mais para se aprender fosse o que fosse. É o mesmo
raciocínio que adiou o Reino Unido do lado da Google.

Abre-se quando o orçamento mensal passar dos 150 €. Página `/en/s/portugal`,
criativo C09.

---

## Exclusões — o que nunca deve ver os anúncios

Aplica-se a **todos** os conjuntos, sem excepção:

| excluir | porquê |
| --- | --- |
| quem disparou `Lead` nos últimos 365 dias | já pediu orçamento; continuar a mostrar-lhe o anúncio de prospecção é pagar para irritar alguém que já está na conversa |
| a lista de clientes fechados | idem, com mais força |
| quem disparou `Contact` nos últimos 90 dias | já falou por WhatsApp |
| a própria equipa | carrega a lista dos emails da equipa como público personalizado e exclui. Sem isto, uma parte das impressões vai para quem construiu o anúncio |

E, dentro da prospecção: **exclui o público de retargeting**. Sem isso, os dois
conjuntos licitam pela mesma pessoa e a conta faz subir o próprio custo.

---

## Cobertura nacional, por conjunto de anúncios

Espelha o que se fez no Google: uma zona por conjunto, e nem todas ao mesmo
tempo.

| conjunto | zona (Meta) | variante | fase |
| --- | --- | --- | --- |
| `frio-noivos-comporta` | Setúbal, Grândola, Alcácer do Sal, Comporta | `/s/comporta` | 1 |
| `frio-noivos-alentejo` | Évora, Beja, Portalegre | `/s/alentejo` | 2 |
| `frio-noivos-lisboa` | Lisboa, Cascais, Sintra, Oeiras, Mafra | `/s/lisboa` | 3 |
| `frio-noivos-algarve` | Faro (distrito) | `/s/algarve` | 3, e só de Abril a Setembro |
| `frio-planners-nacional` | Portugal | `/s/lisboa` | 4 |
| `retarget-visitantes-nacional` | Portugal | conforme o criativo | assim que o público tiver 300 pessoas |
| `similar-leads-nacional` | Portugal | `/s/comporta` | quando houver 100 correspondências |
| `frio-noivos-intl` | Reino Unido, Irlanda, Alemanha, Países Baixos | `/en/s/portugal` | adiado |

**Nunca mais do que dois conjuntos activos ao mesmo tempo com este orçamento.**
Repartir 50 € por seis conjuntos é a mesma diluição que `campanhas.ts` documenta
para o Google: seis aprendizagens que nenhuma chega a acontecer, e três meses a
pagar sem aprender nada.

---

## O que se lê ao fim de duas semanas, e o que se ignora

| lê-se | ignora-se |
| --- | --- |
| custo por `Contact` (clique no WhatsApp) | CPM |
| taxa de `ViewContent` sobre cliques na hiperligação | gostos e partilhas |
| qual dos dois ganchos (A/B) produz mais `Contact` | alcance |
| retenção do vídeo aos 3 s | comentários, salvo se disserem algo útil |

**O `Lead` só se lê ao fim de um mês**, e mesmo aí como contagem, não como
taxa: com este volume, dois pedidos contra um não distinguem nada.

E o número que decide tudo — quanto vale um casamento fechado — só chega à Meta
pela rota `/api/meta/fechos`, que tem de correr **pelo menos uma vez por
semana**. A Meta recusa eventos de fecho com mais de sete dias, em silêncio.
