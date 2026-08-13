# Tom de voz

Como é que o programa fala com quem o lê. Meia página, e chega.

## Duas audiências, dois tratamentos

O que a Líquen escreve no ecrã tem dois destinatários muito diferentes, e não é o
mesmo texto:

| Quem lê | Onde | Tratamento |
| --- | --- | --- |
| **A equipa** | O back office (`/orcamento/admin`) | **tu** |
| **O cliente** | Site público, formulário de orçamento, propostas, contratos, faturas, emails, portal do cliente | **você** (como está hoje) |

O back office é uma ferramenta interna de uma equipa pequena. Quem o abre já
trabalha aqui. Tratar essa pessoa por «você» é falar com ela como se fosse uma
visita — e ao lado, no mesmo ecrã, já se lhe dizia «o teu nome». Ficava a
parecer que o programa não sabia quem tinha à frente.

Para o cliente nada muda. Uma proposta que vai para um casal, um contrato, uma
fatura ou um email de seguimento continuam no registo cerimonioso de sempre.

## A regra

**No back office, escreve-se por tu.** Isso vale para tudo o que a equipa lê:

- rótulos de campos e as dicas por baixo deles
- botões
- avisos e mensagens de erro
- ecrãs vazios («ainda não há nada aqui, faz isto»)
- títulos de janelas e textos de confirmação
- notificações e mensagens de sucesso

Vale também para as frases que **o servidor devolve ao back office** — «falta
correr o db/schema.sql», «armazenamento indisponível», «isto foi alterado
noutro dispositivo». Quem as lê está no mesmo ecrã e é a mesma pessoa; que a
frase nasça noutro sítio do programa não se vê nem interessa.

## Antes e depois

| Antes | Depois |
| --- | --- |
| Não foi possível guardar. **Tente** novamente. | Não foi possível guardar. **Tenta** novamente. |
| **Verifique** a ligação à internet e **tente** novamente. | **Verifica** a ligação à internet e **tenta** novamente. |
| **Escolha** o cliente e **escreva** a proposta | **Escolhe** o cliente e **escreve** a proposta |
| Os preços por linha são só **para si** | Os preços por linha são só **para ti** |
| Os **seus** eventos no tempo | Os **teus** eventos no tempo |
| Este é o **seu** ponto de partida. Assim que **registar** o primeiro pedido… | Este é o **teu** ponto de partida. Assim que **registares** o primeiro pedido… |
| **Pode** voltar a mostrá-lo quando **quiser** | **Podes** voltar a mostrá-lo quando **quiseres** |
| **Crie** um tema por estilo que **usa** nos casamentos | **Cria** um tema por estilo que **usas** nos casamentos |
| A **sua** proposta foi enviada ao cliente *(texto de cliente)* | fica como está |

## O que fica de fora, e porquê

**Textos de cliente.** Propostas, contratos, faturas, emails ao cliente, o portal
do cliente, o formulário de orçamento do site e as páginas públicas. Trocar o
tratamento numa proposta que vai para um casal seria um erro caro, e o proveito
seria nenhum: o cliente não é da equipa.

Há sítios no back office onde a equipa escreve texto que depois sai para o
cliente — os modelos de email, as respostas rápidas da caixa de entrada. Aí a
divisão passa pelo meio do ecrã: **a moldura é por tu** («Escreve a resposta…»,
«Seleciona um modelo para editar») e **o texto que vai dentro do envelope
continua por você** («Obrigada pelo seu pedido»).

**Frases sobre coisas, não sobre pessoas.** «Esta ação não pode ser anulada»,
«O assunto não pode ficar vazio». O sujeito é a ação e o assunto, não quem lê —
não há tratamento nenhum para mudar.

**Nomes guardados.** Estados de pedidos, chaves, identificadores, valores que a
base de dados compara. Um `Introduza` dentro de uma chave é dados, não texto: se
mudasse, partia-se qualquer coisa.

**O inglês.** O inglês não faz esta distinção — «your name», «use your face» já
são o que têm de ser. O que se evita é o cerimonioso a mais: um «please» em cada
frase soa a formulário de banco, não a ferramenta de trabalho. (Hoje o
dicionário inglês não tem back office nenhum: os textos da equipa vivem só em
português, dentro dos próprios ecrãs.)

## Na dúvida

Se não for evidente se um texto é lido pela equipa ou pelo cliente, **fica como
está e pergunta-se**. É mais barato deixar uma frase por converter do que enviar
um «tu» a um casal que ainda não conhecemos.
