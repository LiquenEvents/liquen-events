# Google Ads da Líquen Events

Escrito a 31 de Julho de 2026. Tudo o que está aqui parte de **50 €/mês**, que é
o orçamento real.

---

## O resumo, em oito linhas

1. **Não havia histórico nenhum** para analisar. Não existe `/ads-data/` neste
   repositório, portanto a Fase 0 não tem dados e está construída de raiz.
2. **50 €/mês compram UMA campanha.** Não oito. A aritmética está na secção
   "Porque é que é só uma".
3. Essa campanha é o **Alentejo**, e não o Reino Unido nem Lisboa.
4. As **landing pages já estão feitas e no ar**: 22 páginas, todas estáticas.
5. O **formulário curto** tem quatro perguntas, contra as vinte e tal do
   formulário completo.
6. A **medição do valor real** está montada: quando um casamento fecha, o valor
   volta ao Google Ads ligado ao clique que o originou.
7. Os **CSV de importação** estão em `csv/`. Saem todos **em pausa**.
8. **Não recomendo Performance Max.** A razão está em `estrutura.md`.

---

## Por onde começar, pela ordem

| # | Ficheiro | O que é |
|---|---|---|
| 1 | `diagnostico.md` | O que não deu para analisar, e o que fazer para a próxima |
| 2 | `mercado.md` | Concorrência, sazonalidade e keywords por polo |
| 3 | `estrutura.md` | O desenho das campanhas e as decisões, com as razões |
| 4 | `arranque.md` | O que abrir primeiro e quando abrir o seguinte |
| 5 | `medicao.md` | Como ligar as conversões, e o que carregar todos os meses |
| 6 | `rotina.md` | O que ver todas as semanas e o que dispara alarme |
| 7 | `csv/` | Os ficheiros para importar no Google Ads Editor |

---

## Porque é que é só uma campanha

A conta que manda em tudo o resto:

```
50 €/mês ÷ 0,60 € por clique  ≈  83 cliques por mês
```

Para se poder dizer alguma coisa sobre um conjunto de keywords — que compra,
que não compra, que precisa de outro anúncio — são precisos **40 a 80 cliques**.
Uma campanha com menos do que isso não é uma campanha pequena: é uma campanha
que nunca vai responder à pergunta para que existe, e o dinheiro é desperdiçado
por inteiro, não em parte.

Com 83 cliques dá para **uma** resposta. Duas campanhas com 25 € cada dariam 41
cliques a cada uma, e ao fim do mês nenhuma das duas teria dados suficientes
para se decidir seja o que for. É a diferença entre gastar 50 € e aprender uma
coisa, ou gastar 50 € e ficar na mesma com a sensação de ter sido mais
ambicioso.

Isto está **no código**, não só aqui: `campanhasQueCabem()` em
`src/lib/ads/campanhas.ts` recusa-se a abrir campanhas que o orçamento não
sustenta, e há testes que o verificam.

> **O custo por clique de 0,60 € é uma referência de trabalho, não um dado
> medido.** O número verdadeiro dela sai do primeiro mês de campanha. Quando
> souber, muda-se `CPC_REFERENCIA` e todo o plano se reajusta sozinho.

## Porquê o Alentejo, e não o Reino Unido

O Reino Unido tem o maior valor por casamento de toda a conta — um destination
wedding vale várias vezes um casamento português. Foi por isso que a primeira
versão deste plano o escolheu, ordenando as campanhas pelo peso do orçamento.

**Estava errado**, e o teste apanhou-o. Um clique britânico em
"destination wedding portugal" custa várias vezes um clique alentejano em
"decoração de casamento Évora". Com 50 €/mês, o Reino Unido compra umas duas
dezenas de cliques — que não chegam para concluir nada — e o Alentejo compra
perto de uma centena.

Quando só há dinheiro para uma campanha, a pergunta não é "onde está o dinheiro
grande". É "qual delas consegue aprender alguma coisa". O Alentejo ganha por
três razões que se somam:

- **A equipa vive lá.** Custo de deslocação zero, logo margem melhor no mesmo
  preço de venda.
- **Cliques mais baratos.** Menos concorrentes a licitar do que em Lisboa,
  Porto ou Algarve.
- **Já há presença local.** Perfil de Empresa Google com avaliação real, o que
  ajuda o Índice de Qualidade e a taxa de cliques desde o primeiro dia.

O Reino Unido entra a partir dos **240 €/mês**. Está no plano, com anúncios
escritos e página própria à espera.

---

## O que já está feito no site

Isto não é um plano em papel. Está implementado, testado e a compilar:

- **22 landing pages** (`/casamentos/*`), estáticas, uma por polo, por estilo e
  uma para o público internacional.
- **Formulário de quatro perguntas** acima da dobra em todas elas.
- **Captura do identificador do clique pago**, incluindo o de iOS, guardado 90
  dias, primeiro toque.
- **Exportador de conversões offline** ligado ao back office de propostas.
- **Eventos de telefone, WhatsApp e tempo na galeria.**
- **174 negativas** mais as cruzadas entre regiões.

---

## O que falta, e é dela

1. **Criar a acção de conversão "Casamento fechado"** no Google Ads, com
   importação por ficheiro. Sem ela o exportador não tem onde carregar.
2. **Trocar as fotografias por polo** pelas fotografias reais de cada zona. É a
   alteração isolada que mais converte, e não a consigo fazer: o repositório
   não guarda a região de cada fotografia.
3. **Confirmar o custo por clique real** ao fim do primeiro mês.
