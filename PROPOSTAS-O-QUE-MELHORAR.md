# Propostas, PDF e imagens — o que há, o que falta, e o que eu faria

Pediste-me para dizer antes de fazer. Isto é o que encontrei a ler o código,
separado em **o que já existe e tu talvez não saibas**, **o que falta**, e **o
que eu faria primeiro**. Onde eu não medi, digo que não medi.

---

## 1. O estado que muda sozinho

### O que já muda hoje

| O que fazes | O que acontece ao estado do pedido |
| --- | --- |
| Mandas a **primeira mensagem** ao cliente | `pendente` → **Aguardar resposta** |
| **Envias a proposta** (PDF) | → **Cotado**, e grava o preço final no pedido |
| O casal **aceita pelo link** | → **Aceite** |
| Registas a resposta no painel de Propostas | → **Aceite** / **Rejeitado** |

A mensagem só faz subir de `pendente`. É deliberado: um pedido já fechado não
se desfecha por causa de uma nota, e uma coluna que anda para trás sozinha é a
maneira mais rápida de deixares de confiar nela.

### O que NÃO muda, e devia

1. **Emitir uma factura não mexe no estado.** Podes ter o sinal emitido e o
   pedido continuar a dizer «Cotado». O trabalho está ganho e o quadro não o
   sabe.
2. **Registar um pagamento não mexe no estado.** Idem — e é o sinal mais forte
   que existe de que um casamento é real.
3. **O contrato não mexe no estado.** Assinado ou não, o pedido não muda.
4. **Não há estado para «perdido por não responderem».** Uma proposta enviada há
   três meses sem resposta fica «Cotado» para sempre, ao lado das de ontem.
5. **A proposta não sabe se foi ABERTA.** Não há registo de o casal ter aberto o
   link nem descarregado o PDF. É a informação que decide se se insiste ou se se
   desiste, e neste momento não existe em lado nenhum.
6. **Há duas escadas de estados que não conversam** — o do PEDIDO (pendente,
   aguardar resposta, cotado, aceite, rejeitado) e o da PROPOSTA (rascunho,
   enviada, em negociação, aceite, rejeitada). Podem estar em desacordo, e nada
   no sistema o impede nem o assinala.
7. **Enviar uma segunda versão não diz que é uma renegociação.** Fica «Cotado»
   outra vez, como se fosse a primeira.

### O que eu faria

Uma regra só, escrita num sítio só: **o estado do pedido é a consequência do que
já aconteceu**, e cada acontecimento empurra-o para a frente e nunca para trás.
Factura emitida ou pagamento registado → ganho. Sem resposta ao fim de N dias →
aparece numa lista de «a arrefecer», que é diferente de mudar o estado sozinho.

E **a coluna diz porquê**. «Cotado desde 12 de março · proposta aberta 3 vezes ·
sem resposta há 21 dias» diz-te o que fazer a seguir; «Cotado» não diz nada.

---

## 2. O histórico de propostas enviadas

**Já existe, e em dois sítios.** Se não deste por ele, isso é em si um achado.

- **Por pedido**: dentro do Estúdio de Propostas há um painel de **Versões** —
  cada envio, quando, quanto, e **o que mudou em relação ao anterior**, em
  frases. Dá para restaurar uma versão antiga.
- **Global**: o painel **Propostas** lista todas as propostas de todos os
  pedidos, com estado, valor e seguimento.

Não há tabela nova por trás: **cada envio já grava uma linha** com o documento
inteiro. As versões de uma proposta são os envios daquele pedido, por ordem.

### O que falta

1. **O PDF que o casal recebeu não fica guardado.** Guarda-se o documento e uma
   impressão digital do ficheiro. Reabrir uma proposta de há seis meses
   redesenha-a com o código de hoje — e se o desenho mudou entretanto, sai
   diferente do que eles têm na caixa de correio. A impressão digital existe
   precisamente para se poder dizer que saiu diferente, mas ninguém a compara.
2. **Não há «o que enviámos a este casal» num sítio só** — mensagens, propostas,
   contrato, facturas, tudo por ordem de tempo. Está tudo gravado; está é
   espalhado por quatro painéis.
3. **Não se sabe o que o cliente fez com o que recebeu** (ponto 5 acima).

### O que eu faria

Guardar o PDF de cada envio, tal e qual, ao lado da linha que já existe. É
barato (uns 300 KB por envio) e é a única forma de responderes «foi isto que eu
te mandei» com o ficheiro na mão. E uma linha do tempo por pedido, que não
inventa dados nenhuns — só junta os que já lá estão.

---

## 3. O PDF e o orçamento

1. **Os valores adicionais e o total** — é a tua pergunta, e tem uma decisão por
   trás que só tu podes tomar. Está em baixo, em «A decisão que preciso».
2. **O IVA é uma etiqueta, não uma conta.** O documento sabe se o valor é «com
   IVA» ou «+ IVA», mas o PDF não escreve as três linhas (base, IVA, total) que
   um casal espera ver. Escreve um número e uma etiqueta.
3. **Não há condições de pagamento no PDF** — o sinal de 30%, quando se paga o
   resto, o que acontece se se cancelar. É a pergunta que eles fazem a seguir a
   verem o número, e a resposta não está no documento.
4. **A validade é uma data, não um compromisso.** Passa e nada acontece: nem no
   PDF, nem no back office, nem para o cliente.
5. **Não há número de proposta legível.** Identifica-se por um bocado de um
   identificador técnico. «Proposta 2026-041, versão 2» é o que se diz ao
   telefone.
6. **O PDF não é pesquisável por dentro.** É desenhado, e é bonito, mas nem tu
   nem eles conseguem procurar uma palavra num arquivo de propostas.

---

## 4. As imagens

O que já está resolvido, e vale a pena saber que está: a orientação das fotos de
telemóvel, os PNG transparentes que saíam pretos, o recorte igual ao que vês no
ecrã, os HEIC recusados com uma frase que explica, as fotos que não resolvem
contadas antes do envio, e agora a tira da capa recortada uma vez em vez de a
cada PDF.

### O que ainda incomoda

1. **Escolhes a foto sem ver o recorte da caixa onde ela vai.** O estúdio já
   mostra a forma certa, mas não mostra ONDE corta — e numa tira de capa, que é
   altíssima e estreita, sobra tão pouca largura que a diferença entre um
   enquadramento e outro é a diferença entre uma cara e um ombro.
2. **Não podes ajustar o recorte.** É sempre ao centro. Não há forma de dizer «a
   foto é esta, mas o que interessa está mais à direita».
3. **Não se sabe se uma foto vai sair mole** antes de gerar o PDF. Uma foto de
   800 px numa caixa que pede 1300 sai desfocada e ninguém avisa.
4. **Carregar vinte fotos é vinte esperas.** Não há progresso por foto nem forma
   de continuar a trabalhar enquanto elas sobem.
5. **Não há forma de reordenar as fotos de um mood board arrastando.**
6. **Uma foto apagada da Biblioteca continua a poder desaparecer de um rascunho**
   — está protegida nas propostas gravadas, não nos rascunhos.

### O que eu faria primeiro

O recorte ajustável. É o único da lista que muda o que o casal vê, e é o que te
faz confiar no documento sem o abrires para conferir.

---

## 5. Para o back office ser maior

Por ordem do que eu acho que te muda mais o dia:

1. **Uma linha do tempo por pedido** — tudo o que aconteceu com aquele casal,
   por ordem, num sítio. Os dados já existem todos.
2. **O que fazer a seguir**, calculado. Não uma lista de tarefas que alguém tem
   de escrever: «esta proposta foi enviada há 21 dias e ninguém respondeu»,
   «este casamento é daqui a 40 dias e não tem plano de produção».
3. **Modelos de proposta por tipo de evento**, para não começares do zero.
4. **Duplicar um casamento inteiro**, não só a proposta.
5. **Uma vista de tesouraria a sério** — o que está por receber, por mês, com o
   que já foi facturado e o que falta facturar.
6. **Exportar tudo de um pedido** num ficheiro só, para arquivo ou para o
   contabilista.
7. **Trabalhar mesmo com a rede a falhar** — o back office é usado em armazéns e
   em quintas.

E uma que não se vê mas que sustenta o resto: **a fila de trabalhos** que está à
tua espera em `FILA-RECOMENDACAO.md`. Sem ela, cada coisa nova que demore
(gerar, enviar, exportar, copiar fotos) volta a ser um botão a rodar com um
tecto de 60 segundos por cima.

---

## A decisão que preciso, antes de mexer no orçamento do PDF

Pediste os valores adicionais **por baixo** do total, «porque parece que está
incluído no total, mas não está».

Aqui está o problema: **hoje o estúdio soma-os ao total**. Foi o que me pediste
da última vez — «coloquei a deslocação de 1.550 € e no total isto não soma;
quero que o back office faça a soma». Está feito, e é desse total que saem a
factura, o sinal de 30% e o saldo.

Se eu passar os adicionais para baixo do total sem mais nada, o casal lê
«6.875 €» e por baixo «Deslocação 1.550 €» e soma-os outra vez — e paga a
deslocação a dobrar. É o mesmo erro, ao contrário.

**Mas há um caso em que tu tens razão e o sistema está mesmo errado:** a soma só
acontece quando escreves o adicional no estúdio. Se duplicares uma proposta, ou
partires de um modelo que já traz adicionais, o documento chega com os
adicionais e com um total que nunca os somou. Aí o PDF mente — e é provavelmente
o que viste.

Por isso não adivinho, e proponho isto: **o estúdio passa a perguntar**, uma vez,
por cada bloco de adicionais — «estes valores já estão no total» ou «acrescem ao
total» — e o PDF desenha em conformidade:

- **já incluídos** → ficam antes do total, como agora, e o total é o que se paga;
- **acrescem** → ficam **por baixo** do total, com uma linha final
  «Total com os adicionais», para não sobrar conta nenhuma para o cliente fazer.

Diz-me qual é o comportamento certo para ti e eu faço-o. Enquanto não disseres,
não mexo — é dinheiro que vai num documento para um casal.
