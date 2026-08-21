# Adaptação a mobile — auditoria

Pedido dela: **nenhum agente corrige na primeira passagem.** Primeiro mapeiam e
catalogam; só depois de ela aprovar o relatório é que se corrige.

Uso real: **iPhone, Safari, 4G frequentemente fraco**, em quintas do Alentejo, durante
montagens, muitas vezes com as mãos ocupadas ou de pé.

## O princípio que governa tudo

**Adaptar não é encolher.** Uma coluna de desktop reduzida a 390 px continua a ser um ecrã
de desktop. A pergunta em cada ecrã é: *como é que esta tarefa se faz num telemóvel, com um
polegar, de pé?* Onde a resposta for «não se faz», diz-se isso — e propõe-se consulta em vez
de edição.

## Porque é que são dez ficheiros e não um

Ela pediu um registo único, e é isso que o `registo.md` é — mas escrito por MERGE e não por
dez escritas concorrentes no mesmo sítio. Dez processos a acrescentar ao mesmo ficheiro ao
mesmo tempo perdem entradas: o último a gravar escreve por cima do que os outros
acrescentaram. É a mesma razão que já valeu para a caça aos bugs (ver
`docs/caca-de-bugs/README.md`).

Cada agente escreve o seu (`agente-01.md` … `agente-10.md`); o `registo.md` é a junção, com
os totais, a tabela de paridade, a classificação de tarefas e a ordem de correção.

## O formato de cada entrada

```
[ID] [Agente] [Ecrã] [Severidade] Título
     Largura onde falha: 390 / 430 / 768 / todas
     Observado:
     Proposta:
     Equivalente em desktop: existe / não existe
```

Ao que ela fixou acrescenta-se sempre **Onde: ficheiro:linha** — sem isso a entrada não é
corrigível por quem não a escreveu.

## Severidades

- **Bloqueia** — a tarefa não se consegue fazer em mobile
- **Grave** — faz-se com atrito sério
- **Menor** — acabamento

## Larguras

390 px (iPhone padrão) · 430 px (Max) · 768 px (tablet) · e **o ponto exato onde cada layout
parte**, que é o que permite corrigir sem adivinhar o breakpoint.

## Cobertura, ecrã a ecrã

Login · Visão Geral · Pedidos (lista e detalhe) · Fazer proposta (Conteúdo com todas as
secções, Pré-visualizar, Enviar) · Painel da biblioteca de temas · Temas (grelha e tema
aberto) · Propostas · Calendário · Definições · Formulário público de orçamento · Página
pública da proposta
