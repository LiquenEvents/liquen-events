# Fazer proposta — o antes, medido

Levantamento da página `Fazer proposta` do back office, feito em 5 de agosto de
2026 antes de lhe mexer. Os números todos saem de
`scripts/medir-estudio-propostas.mjs`, que se pode voltar a correr a seguir às
alterações para o depois ser comparável com a mesma régua.

```
npm run dev                                    # noutro terminal
node scripts/medir-estudio-propostas.mjs       # o estúdio recém-aberto
node scripts/medir-estudio-propostas.mjs --completa   # a proposta da Catarina, construída
node scripts/medir-estudio-propostas.mjs --capturas   # + capturas de ecrã
```

## Como se mediu

**Campo** = um sítio onde se escreve ou escolhe (`input`, `textarea`, `select`).
Botões não são campos — são cliques.

**Ecrã de scroll** = a altura do conteúdo a dividir pela altura útil da janela.
É a medida que corresponde à queixa («dois metros de scroll») e não depende da
velocidade da roda do rato.

**A proposta de referência** é a real da Catarina Martins
(`PO Decoração Casamento Catarina Martins 18.09.2027`): dois grupos de serviços
com seis itens, cinco mood boards, cinco linhas de orçamento e o total. É uma
proposta média da Líquen, não um caso extremo escolhido para o número parecer
mau.

Duas correcções à minha própria medição, porque afectam a leitura dos números:

1. A primeira versão contou o back office inteiro (navegação, barra de topo, a
   vista «Pedidos» que fica montada por baixo) e deu 53 campos. A contagem é
   feita a partir da raiz do estúdio.
2. A segunda versão mediu o estúdio **embutido no dossier do pedido** em vez do
   da vista «Fazer proposta» — os mesmos componentes, outro sítio, e as caixas
   de capa deram 222px em vez dos 391px verdadeiros. Só dei por isso ao olhar
   para a captura de ecrã. O guião passou a verificar em que vista está antes
   de medir.

## Os números

Portátil 1440×900 e tablet 1024×768, que é onde ela diz que trabalha.

| | portátil | tablet |
|---|---:|---:|
| **Estúdio recém-aberto** | | |
| campos | 15 | 15 |
| botões | 17 | 17 |
| altura do conteúdo | 2246px | 2148px |
| ecrãs de scroll | **2,5** | **2,8** |
| **Proposta completa (a da Catarina)** | | |
| campos | 37 | 37 |
| botões | 56 | 56 |
| altura do conteúdo | 4986px | 4368px |
| ecrãs de scroll | **5,54** | **5,69** |
| cliques em botões para lá chegar | **16** | 16 |
| campos escritos à mão | **23** | 23 |

Os 16 cliques e os 23 campos **não incluem as fotos**. A biblioteca de temas
precisa do Supabase, que esta máquina não alcança; na vida real há ainda duas
capas e cerca de trinta fotos de mood board por escolher em cima disto. O número
é o piso, não o tecto.

Altura média de um campo: **40px**. Caixas de capa vazias: **391px cada**, lado
a lado — duas superfícies do tamanho de meia janela a não mostrar nada.

## Dos 15 campos abertos, 9 já vêm preenchidos

| já preenchido, vem do pedido | por preencher à mão |
|---|---|
| Clientes | Cerimónia |
| Tipo de evento | Hora |
| Data | Wedding Planners |
| Local | Título do grupo de serviços |
| Convidados | Primeiro item de serviço |
| Título interno *(gerado)* | Validade (dias) |
| Letra do grupo (`a)`) | |
| Rótulo do total | |
| Valor (sem IVA) *(vem do «Preço final» do pedido)* | |

## Campos repetidos e derivados

- **O nome do cliente aparece duas vezes** no mesmo ecrã: no bloco «Proposta
  para / Ana Antes» no topo, e outra vez dentro do campo «Clientes». Confirmado
  na captura.
- **O «Título interno» é 100% derivado** — compõe-se de tipo de documento, tipo
  de evento, nome e data. Já é gerado automaticamente hoje
  (`buildRef`), e deixa de se auto-gerar assim que se lhe toca.
- **O «Valor (sem IVA)» é o mesmo número do «Preço final» do pedido.** Já estão
  ligados nos dois sentidos, e há um só número — isso foi resolvido antes desta
  missão.
- **A validade mostra «30» como texto de exemplo mas o campo está vazio.** O
  valor por omissão existe no código, mas ela vê uma caixa por preencher todas
  as vezes.

## Quatro coisas que a missão pede e que já estão feitas

Digo-o antes de construir seja o que for, porque construí-las outra vez seria
gastar tempo a não mudar nada:

1. **«Botão Pré-visualizar fixo no fundo do ecrã — hoje está no fim de dois
   metros de scroll.»** Já está fixo (`sticky bottom-0`). *Mas* sobrepõe-se ao
   conteúdo: na captura tapa o campo «Título interno». Isso sim é um defeito, e
   fica na lista.
2. **«Limpar rascunho está em destaque a laranja.»** Está a cinzento discreto
   (`variant="ghost"`) desde antes desta missão. O que falta mesmo é a anulação
   de 10 segundos em vez da confirmação.
3. **«Ao escolher o cliente, preenche automaticamente data, local,
   convidados.»** Já preenche — são cinco dos nove campos da tabela acima.
4. **«O Título interno gera-se automaticamente e fica editável.»** Já faz
   exactamente isso.

## Uma coisa que a missão pede e que o formato das propostas contradiz

O ponto 2 pede que **o total some os itens do Orçamento Proposto**. Nas
propostas reais da Líquen esses itens **não têm preço**: o quadro «3. Orçamento
Proposto» da Catarina tem cinco linhas com a coluna de preço em branco e um
único «Valor Total 6875,00 € + Iva» no fim. O modelo de dados diz o mesmo —
`budgetItems` são só nomes.

Somar os itens obriga a escolher uma de duas coisas, e a escolha é dela:

- **(a)** passar a haver um preço por linha, visível para o cliente — muda o
  aspecto de todas as propostas e mostra ao casal quanto custa cada peça
  (o que, no caso da Catarina, pode ser bom: ela quis cortar linhas);
- **(b)** os preços por linha existem só do lado de dentro, para somar e avisar,
  e o PDF continua a mostrar um total único.

Vou construir **(b)** por omissão, porque não altera nada do que o cliente vê e
dá-lhe na mesma o aviso de «total manual desalinhado da soma». Se preferir (a),
é uma linha de configuração a mais.

## Defeitos encontrados a medir, que não estavam na missão

- **A vista salta para trás.** O back office restaura a última vista aberta num
  efeito que corre depois da montagem. Um clique na navegação feito logo a
  seguir ao carregamento é desfeito por esse efeito. Foi o que fez a minha
  medição ir parar à vista errada duas vezes.
- **O botão «Pré-visualizar» tapa um campo**, como se vê na captura.

## O que se vai medir no fim

O `PROPOSTA-AFTER.md` repete esta tabela e acrescenta a linha que interessa
mais: **criar uma proposta a partir de outra**, que é o caso comum e que hoje
não existe de todo — hoje faz-se do zero, com os mesmos 16 cliques e 23 campos.
