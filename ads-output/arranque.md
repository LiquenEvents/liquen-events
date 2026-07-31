# Fase 6 — Arranque

Foi pedido para não lançar os oito polos ao mesmo tempo. Com 50 €/mês a questão
nem se põe: **abre uma campanha**, e a decisão difícil é qual.

---

## Semana 0 — antes de gastar um euro

Por esta ordem. Os dois primeiros pontos são bloqueantes: sem eles, o mês
inteiro é dinheiro gasto sem se conseguir aprender nada.

1. **Criar a acção de conversão "Pedido de orçamento"** no Google Ads, importada
   da propriedade GA4 já ligada. O evento `generate_lead` já é disparado pelo
   site na página de confirmação. **Sem isto não há conversões, e sem conversões
   não há decisão possível ao fim do mês.**
2. **Criar a acção de conversão "Casamento fechado"**, com origem
   "Importar → Carregamentos" e categoria "Compra". É onde entra o valor real
   (`medicao.md`).
3. **Colar as negativas** de `csv/5b-lista-partilhada.txt` numa lista de
   exclusão partilhada, e aplicá-la à conta.
4. **Importar os CSV** por ordem numérica no Ads Editor (`csv/README.md`).
5. **Conferir a segmentação geográfica** de cada campanha antes de activar. As
   campanhas saem em pausa de propósito. Este é o erro que mais dinheiro custa
   numa importação e o mais fácil de detectar em trinta segundos.
6. **Correr o Keyword Planner** com `csv/keywords-seed.csv` e anotar os
   volumes e CPCs reais. Não bloqueia o arranque, mas muda o plano da semana 8.

## O que abre: **Alentejo, e só**

**Campanha:** `PT · alentejo` · 1,64 €/dia · 50 €/mês
**Grupos:** intenção local (Évora e arredores) e espaços da região
**Página:** `/casamentos/alentejo`
**Licitação:** manual, 0,60 € de CPC máximo

Porquê esta e não outra, em três razões que se somam: a equipa vive lá (custo de
deslocação zero, logo margem melhor), os cliques são os mais baratos dos oito
polos (menos concorrentes a licitar), e já existe presença local reconhecida —
Perfil de Empresa Google com avaliação real, que ajuda o Índice de Qualidade e a
taxa de cliques desde o primeiro dia.

O Reino Unido tem o maior valor por casamento de toda a conta. Não é a primeira
porque um clique britânico custa várias vezes um clique alentejano: 50 € lá
compram umas duas dezenas de cliques, que não chegam para concluir nada.

## Quanto tempo dar antes de decidir

**Nada de decisões antes de 6 semanas.** Não é paciência: é aritmética.

83 cliques/mês ÷ 30 = menos de 3 cliques por dia. Ao fim de uma semana há 19
cliques. Com uma taxa de conversão plausível de 5%, isso é **uma conversão** — e
uma conversão não distingue sorte de tendência. Julgar aos 14 dias é a forma
mais comum de desligar uma campanha que estava a funcionar.

Acrescente-se que o ciclo de compra de um casamento é longo: quem clicar em
Agosto pode pedir orçamento em Outubro. O primeiro mês subavalia sempre.

| Quando | O que se olha | O que se pode decidir |
|---|---|---|
| **Dias 1–3** | Impressões > 0, cliques > 0, anúncios aprovados, zero erros | Só se está tecnicamente a funcionar |
| **Semana 1** | Termos de pesquisa | **Acrescentar negativas.** É a única acção legítima nesta fase |
| **Semana 2** | Termos de pesquisa, CTR | Negativas. Reescrever o anúncio se o CTR < 2% |
| **Semana 4** | ~85 cliques, CPC real | Podar keywords com >15 cliques e 0 conversões. **Substituir o CPC de referência pelo real** |
| **Semana 6** | Primeiras conversões | Primeira leitura a sério de custo por lead |
| **Semana 12** | Custo por lead estável, primeiros fechos | Decidir: manter, mudar de região, ou parar |

## O sinal para abrir a região seguinte

Não é "correu bem". São **três condições ao mesmo tempo**:

1. **Custo por lead abaixo de 25 €.** Com um casamento a valer ~20 000 € sem
   IVA e uma taxa de fecho de 1 em 5 leads, 25 €/lead são 125 € por casamento
   fechado. Continua a ser barato de mais para se hesitar.
2. **Pelo menos 6 leads acumulados.** Menos do que isso é anedota.
3. **Orçamento novo disponível.** A região seguinte precisa dos seus próprios
   40 € mínimos, e **não se tira** ao Alentejo — cortar a campanha que está a
   funcionar para financiar uma que ainda não se sabe é como se estraga uma
   conta que ia bem.

Cumpridas as três, a seguir é **Lisboa** (160 €/mês no total). Se nunca
chegarem a cumprir-se, a resposta certa não é abrir mais regiões: é melhorar
esta, ou parar.

## Quando parar

Vale a pena escrever isto antes de haver dinheiro emocional investido.

**Parar se, à semana 12:** custo por lead acima de 60 € **e** nenhum casamento
fechado vindo de anúncio. Aos 60 €/lead e 1 em 5 a fechar, cada casamento custa
300 € em publicidade — ainda pode valer a pena, mas já não é óbvio, e sem
nenhum fecho não há prova de que o canal funciona para este negócio.

Nesse caso a hipótese seguinte não é "mais orçamento". É que a procura paga em
decoração de casamento no Alentejo seja pequena de mais, e que o dinheiro renda
mais noutro sítio — SEO local, Instagram, ou parcerias com espaços.

## Projecção realista dos primeiros 90 dias

Com os pressupostos ditos: 0,60 €/clique, 5% de conversão da landing page, 1 em
5 leads a fechar, 20 000 € de valor médio sem IVA.

| | Mês 1 | Mês 2 | Mês 3 | Total |
|---|---:|---:|---:|---:|
| Investimento | 50 € | 50 € | 50 € | **150 €** |
| Cliques | ~83 | ~83 | ~83 | ~250 |
| Pedidos de orçamento | 2–5 | 3–6 | 3–6 | **8–17** |
| Casamentos fechados | 0 | 0–1 | 0–1 | **0–3** |
| Receita atribuível (sem IVA) | 0 € | 0–20 000 € | 0–20 000 € | **0–60 000 €** |

**Como ler isto honestamente:**

- **O caso mais provável dos 90 dias é: 8 a 17 pedidos e um casamento fechado.**
  Isso é 150 € investidos contra 20 000 € de receita. Se acontecer, o canal está
  provado e a decisão passa a ser quanto escalar.
- **O caso do zero é perfeitamente possível**, e não significa que falhou. Com
  este volume, um ciclo de compra de seis a doze meses e três casamentos em
  jogo, "zero fechos em 90 dias" cabe dentro do acaso. É por isso que o critério
  de paragem olha para o **custo por lead** e não para os fechos.
- **A variação é enorme e é inerente ao orçamento**, não à execução. Com 83
  cliques por mês, a diferença entre 2 e 5 pedidos é ruído. Quem quiser uma
  previsão mais apertada precisa de mais orçamento, não de melhor previsão.
- **Os pressupostos são pressupostos.** Os quatro números (CPC, conversão, taxa
  de fecho, valor médio) são plausíveis para o sector, e nenhum é dela. Ao fim
  do mês 1 os dois primeiros passam a ser medidos, e esta tabela deve ser
  refeita com eles.
