> **Este documento é dela**, e está aqui inteiro a partir da Parte 1. A tabela
> em baixo é a única coisa acrescentada — e existe porque este documento andou
> perdido: chegou pelo chat, foi lido, e nunca ficou guardado em lado nenhum. O
> do Liquid Glass fez o mesmo caminho e só se recuperou por sorte.

## O QUE JÁ ESTÁ FEITO

Auditado no `Tarefas.tsx` (2511 linhas), no `TarefaDetalhe.tsx` e nos três
módulos de `src/lib/tarefas/` contra a tabela da **Parte 7**, e não de memória.

| # | Fase | Estado |
|---|---|---|
| 01 | Toolbar | **feito** — logótipo fora, título, contagem em `role="status"`, «Nova tarefa» com `⌘N` |
| 02 | Linha de tarefa | **feito** — `<input type="checkbox">` a sério, `⋯` no hover |
| 03 | Adição inline | **feito** — `LinhaDeEscrever`: a última linha cria, `Enter` cria e fica |
| 04 | Concluir | **feito** — mola na marca, espera de 1,5 s, e «Anular» |
| 05 | Listas | **feito** — `BarraDeListas` mais as listas por evento, com contagem |
| 06 | Agrupar e ordenar | **feito** — cabeçalhos `sticky`, e «Manual» activa o arrastar |
| 07 | Linguagem natural | **feito** — `lib/tarefas/linguagem-natural.ts`, com pastilhas editáveis |
| 08 | Painel de detalhe | **feito** — `TarefaDetalhe.tsx`: notas, subtarefas, ligações e a porta para o evento. Os quatro campos (prazo, quem, área, prioridade) continuam a EDITAR-SE na linha e o painel só os mostra — um segundo editor dos mesmos campos era a família duplicada que a Parte −1 do sistema de design proíbe |
| 09 | Arrastar e menus | **feito** — arrasto com linha de inserção e Anular, ordem GUARDADA (`Task.posicao`, ver `lib/tarefas/posicoes.ts`), menu no `⋯` e no botão direito, `↓`/`↑`, `⇧F10`, `⌘⌫`, `Esc`. **Três coisas do ponto 21 ficaram fora, com razão:** `⌘1`–`⌘5` (é como o browser troca de separador), `⌘F` (é a pesquisa global da casa e a do browser) e o `Espaço` a marcar a linha focada (o foco está num botão, e roubar-lhe o `Espaço` parte-o). E do ponto 20 ficaram fora os três submenus — «Escolher data…», «Atribuir a…» e «Prioridade» —, que o `ui/MenuDeAccoes` não sabe desenhar e que o «Editar tarefa» já dá |
| 10 | Estado vazio | **feito** — com botão, como a Parte 8 exige |
| 11 | Acessibilidade | **por fazer** — a lista da Parte 6 não foi percorrida de fio a pavio |

Dez das onze. A que falta é a única que não muda o ecrã: percorrer a lista da
Parte 6 inteira e medir o Lighthouse.

---

# PROMPT — Reconstruir o ecrã "Tarefas" segundo o sistema da Apple

> **Âmbito:** a rota `/orcamento/admin/tarefas`. Não toques em mais nada.
> **Pré-requisito:** os tokens do `docs/DESIGN-SYSTEM.md` já existem.
> **Marcações:** **[APPLE]** = regra publicada pela Apple · o resto é tradução para web.
>
> O diagnóstico numa frase: **é uma caixa de texto com uma lista por baixo, não um gestor de tarefas.** Não há listas, não há datas, não há responsáveis, não há prioridades, não há agrupamento, não há concluídas, não há arrastar, não há atalhos. E chama-se "Organização interna da equipa" sem ter nada sobre a equipa.
>
> Há aqui uma segunda oportunidade que o ecrã desperdiça: **este é o ecrã mais vazio do produto**, e um ecrã vazio é a melhor ocasião para ensinar o que a coisa faz. Este limita-se a dizer "adiciona uma acima".
>
> A referência mental certa é a app **Lembretes** do Mac.

---

## PARTE 1 — AUDITORIA

### A. Barra de topo

**1. O logótipo está centrado na toolbar.** *Resistir a repetir o logótipo; a marca defere ao conteúdo.* **[APPLE]** Fora.

**2. A hierarquia do cabeçalho está invertida.** "Organização interna da equipa" acima do título, em cinzento pequeno. *Título curto que identifica a vista.* **[APPLE]** A descrição desaparece.

**3. Não há ação primária na toolbar.**
Todos os outros ecrãs têm "+ Novo". Este não tem — porque a criação está num cartão permanente no conteúdo.
Regra: *uma e uma só ação primária, sempre no fim da toolbar.* **[APPLE]** E a consistência entre ecrãs é um dos três princípios do sistema.
Correção: **"Nova tarefa"** na toolbar, com `⌘N`.

**4. "Tudo guardado" num ecrã com zero conteúdo.** Um indicador de gravação sem nada gravado é ruído. Numa lista de tarefas, cada item guarda-se sozinho; o indicador só aparece quando há uma gravação a decorrer.

### B. Criar uma tarefa

**5. O formulário de criação é um cartão permanente no topo.**
Ocupa ~180 px, sempre, para uma ação ocasional. E empurra para baixo aquilo que é o conteúdo da página — as tarefas.
Regra: *esconder detalhes até serem relevantes; a área de conteúdo é o palco principal.* **[APPLE, Disclosure controls + Layout]**
Correção: **linha de adição rápida dentro da própria lista** — a última linha da lista é sempre "＋ Nova tarefa", que se transforma em campo ao clicar. É como funciona nos Lembretes. O cartão desaparece.

**6. O botão "Adicionar" está desativado e parece avariado.**
É o estado inicial do ecrã: um botão primário cinzento-esverdeado, apagado, mesmo ao lado do campo.
Regra: *manter os controlos ativos e explicar quando o comando não pode ser executado; mostrar que algo não pode ser cumprido **e** ajudar a perceber porquê.* **[APPLE, Feedback]** Um primário desativado como estado por omissão de um ecrã vazio lê-se como erro.
Correção: **o botão desaparece.** `Enter` cria a tarefa. É o gesto que toda a gente tenta primeiro, e o botão só existia para o caso de não se tentar.

**7. O campo de texto é uma cápsula.**
Regra do Tahoe: *mini a medium são retângulos arredondados; cápsula só em large e extra-large.* **[APPLE]** Um campo de texto em cápsula desperdiça padding horizontal e desalinha a base do texto.
Correção: 10 px, como todos os campos do produto.

**8. Data, responsável e evento estão escondidos atrás de "Detalhes (opcional)".**
São exatamente os três dados que tornam uma tarefa útil a uma equipa — e estão colapsados por omissão.
Regra: *oferecer escolha em vez de escrita; obter do sistema tudo o que puderes; reduzir ao mínimo o que é preciso escrever.* **[APPLE, Entering data]**
Correção: **interpretação de linguagem natural no próprio campo**, como nos Lembretes. Escrever `Confirmar florista amanhã às 10h #Ana !alta` cria a tarefa com data, hora, responsável e prioridade — e os valores reconhecidos aparecem como **chips por baixo do campo enquanto se escreve**, editáveis e removíveis. O disclosure só sobrevive para notas longas.

**9. Não há como associar a tarefa a um evento.**
Numa empresa de casamentos, quase todas as tarefas pertencem a um evento. Sem essa ligação, a lista é um bloco de notas.
Correção: `@` abre o seletor de eventos — `@Melanie` liga a tarefa à proposta de Melanie e Sebastien. E na ficha do evento aparecem as tarefas dele.

### C. A lista

**10. Não há listas.**
Uma só lista plana chamada "A fazer".
Regra: os Lembretes têm listas na barra lateral; qualquer gestor de tarefas sério agrupa.
Correção: barra lateral com **listas inteligentes** — `Hoje` · `Esta semana` · `Atrasadas` · `Sem data` · `Todas` — e por baixo as **listas por evento**, geradas automaticamente das propostas ativas. Cada uma com contagem.

**11. Não há agrupamento dentro da lista.** Correção: um seletor `Agrupar por: Data · Evento · Responsável · Nenhum`, com cabeçalhos sticky. Por omissão, **Data**.

**12. Não há concluídas.**
Uma tarefa marcada desaparece para onde?
Correção: secção `Concluídas` colapsada no fim, com contagem, e um `Mostrar concluídas` no menu. Nada se apaga sozinho.

**13. "A fazer (0)" é um cabeçalho com um zero, seguido de um separador e de nada.**
O traço a sublinhar um cabeçalho sem conteúdo por baixo.
Correção: o contador vira **estado da vista** na toolbar, ao lado do título da lista, em `role="status"`.

**14. O estado vazio manda olhar para outro sítio.**
"Adiciona uma acima para começar a organizar a equipa."
Regra: *o estado vazio diz o passo seguinte e traz um botão; nunca contém informação crítica.* **[APPLE]** Apontar para outro elemento do ecrã é sinal de que a ação não está onde devia.
Correção: título, uma frase, e **um botão** — `Nova tarefa`. Mais uma linha discreta a ensinar o truque que ninguém descobre sozinho: *"Experimenta escrever «Confirmar florista amanhã às 10h»."* **É a única instrução que se justifica no produto inteiro, porque ensina uma capacidade real e não a localização de um botão.**

**15. Não há datas visíveis, nem responsáveis, nem prioridades.** Correção: cada linha mostra, quando existem: data (a vermelho quando atrasada), avatar ou iniciais do responsável, chip do evento, e `!` de prioridade. **Nunca só cor:** atrasada tem ícone e texto, não apenas vermelho.

**16. Não há pesquisa nem filtro dentro das tarefas.** A pesquisa da toolbar é global. Correção: filtro por responsável e por prioridade na barra da lista, e `⌘F` a filtrar a lista atual.

**17. Não há ordenação.** Correção: `Ordenar por: Data · Prioridade · Criação · Manual`. **Manual** ativa o arrastar.

### D. Comportamento e espaço

**18. Não está definido o que acontece ao concluir.**
Correção, e é o detalhe que faz esta app parecer viva: ao marcar, a checkbox anima com **mola**, o texto ganha risco e desce a opacidade, a linha **fica no lugar durante ~1,5 s** e só depois desliza para `Concluídas`. Toast **"Tarefa concluída — Anular"**. Marcar e desmarcar rapidamente nunca deve fazer a lista saltar. **[APPLE: feedback breve e preciso; desfazer sempre]**

**19. Não se arrasta para reordenar.** *Permitir reordenar mesmo quando não se pode adicionar nem remover — as pessoas esperam poder reordenar.* **[APPLE, Lists and tables]** Com linha de inserção, destino válido e Anular.

**20. Não há menu de contexto.** Correção: `Editar` · `Marcar como concluída` — separador — `Hoje` · `Amanhã` · `Escolher data…` — separador — `Atribuir a…` · `Prioridade` — separador — `Eliminar` (vermelho, com Anular).

**21. Não há atalhos.** `⌘N` nova · `Enter` criar e manter o campo aberto para a seguinte · `⇧Enter` criar e fechar · `Esc` cancelar · `Espaço` marcar a focada · `⌘⌫` eliminar com Anular · setas navegar · `⌘F` filtrar · `⌘1–5` trocar de lista.

**22. Metade do ecrã está vazia.**
A coluna de conteúdo ocupa pouco mais de metade da largura, alinhada à esquerda, com cerca de 870 px de vazio à direita e 200 px por baixo.
Regra: *dar espaço à informação essencial; o conteúdo principal usa o espaço disponível.* **[APPLE, Layout]**
Correção: split view de três colunas — **listas · tarefas · detalhe da tarefa selecionada**. O espaço deixa de sobrar e a app ganha o painel onde se editam notas, subtarefas e anexos sem sair da lista.

---

## PARTE 2 — A ARQUITETURA NOVA

```
┌────────────────────────────────────────────────────────────────────────┐
│  Hoje            8 por fazer · 2 atrasadas      Agrupar ⌄  ⋯  Nova tarefa│ toolbar vidro 52
├──────────────┬────────────────────────────────────┬────────────────────┤
│ LISTAS       │  ── Atrasadas ──────────────────   │  DETALHE           │
│ ● Hoje    8  │  ☐ ! Pedir orçamento ao florista   │                    │
│ ● Semana 14  │       ontem · AR · @Melanie        │  Confirmar florista│
│ ● Atrasadas 2│  ── Hoje ───────────────────────   │                    │
│ ● Sem data 5 │  ☐ Confirmar florista              │  Lista    Hoje     │
│ ● Todas  31  │       10:00 · CS · @Daniela        │  Data     hoje 10h │
│              │  ☐ Rever seating plan              │  Quem     Catarina │
│ EVENTOS      │  ── Amanhã ─────────────────────   │  Evento   Daniela  │
│ ● Melanie  6 │  ☐ Carregar carrinha               │  Prioridade  Alta  │
│ ● Daniela  4 │       @Daniela                     │                    │
│ ● Catherine 3│                                    │  Notas             │
│              │  ＋ Nova tarefa                    │  Subtarefas        │
│              │  ▸ Concluídas (12)                 │  Anexos            │
└──────────────┴────────────────────────────────────┴────────────────────┘
```

**Seis decisões que isto encerra:**

1. O cartão de criação desaparece; a criação é a última linha da lista, e `⌘N`.
2. O botão "Adicionar" desaparece; `Enter` cria.
3. Data, responsável, evento e prioridade saem do disclosure e entram na **linguagem natural** do próprio campo.
4. Listas inteligentes mais listas por evento na barra lateral.
5. As concluídas passam a existir, colapsadas no fim.
6. O espaço vazio à direita vira o **painel de detalhe**, onde vivem notas, subtarefas e anexos.

---

## PARTE 3 — A LINHA DE TAREFA

```
☐  ! Confirmar florista para a Quinta do Vale        10:00  CS  @Daniela
   ▲              ▲                                    ▲     ▲     ▲
   checkbox    prioridade                            data  quem  evento
```

- Altura 40 px (confortável) / 30 px (compacta). Checkbox 18 px com alvo de 40 px.
- Título em `text-callout`, uma linha, truncatura com reticências e `title` completo.
- Data: `text-caption`, `tabular-nums`; **atrasada** ganha `--danger` **mais ícone**, nunca só cor.
- Responsável: iniciais em círculo de 20 px, com `aria-label` do nome completo.
- Evento: chip discreto com o nome curto; clique abre a proposta.
- Prioridade: `!` / `!!` em `--warning` / `--danger`, com `aria-label`.
- Hover revela, à direita, um `⋯` que abre o mesmo menu do botão direito. **Um botão, não três.**
- Foco e seleção são estados diferentes e podem coexistir. **[APPLE]**

**Adição rápida com linguagem natural.** Enquanto se escreve, os padrões reconhecidos aparecem como chips por baixo do campo, editáveis:

| Escreve | Reconhece |
|---|---|
| `hoje`, `amanhã`, `sexta`, `27/09` | Data |
| `às 10h`, `10:00`, `de manhã` | Hora |
| `#Ana`, `#Catarina` | Responsável |
| `@Melanie`, `@Daniela` | Evento |
| `!`, `!!` | Prioridade |
| `todas as semanas` | Repetição |

O texto reconhecido fica **realçado no próprio campo** e sai do título ao criar. Se a interpretação estiver errada, apaga-se o chip e o texto volta ao título. Nunca adivinhes em silêncio.

---

## PARTE 4 — MOVIMENTO

| Interação | Duração | Curva |
|---|---|---|
| Marcar a checkbox | 320 ms | `--ease-quick`, `scale(1) → 1.18 → 1` |
| Risco a atravessar o texto | 200 ms | `--ease-out`, `clip-path` da esquerda para a direita |
| Linha a sair para Concluídas | 475 ms, **após 1,5 s de espera** | `--ease-reposition` |
| Linha nova a entrar | 475 ms | `--ease-reposition` |
| Reordenar por arrasto | 475 ms | `--ease-reposition`, sem ressalto |
| Trocar de lista | 200 ms | `--ease-out`, fade cruzado **sem deslocação** |
| Painel de detalhe a mudar | 200 ms | fade cruzado |
| Chip de linguagem natural a aparecer | 325 ms | `--ease-quick` |
| Destaque do item restaurado por Anular | 1200 ms | `--ease-out` |

**A espera de 1,5 s antes de a tarefa sair da lista não é decoração** — é o que permite desmarcar sem a lista saltar debaixo do cursor. É o comportamento dos Lembretes e é a diferença entre uma lista que se usa e uma que irrita.

**Nunca animes** a troca de lista com deslocação — é a interação mais frequente do ecrã. **[APPLE]**

---

## PARTE 5 — MICROCOPY

| Atual | Novo |
|---|---|
| Organização interna da equipa | *(fora)* |
| Nova tarefa *(rótulo do cartão)* | *(fora — a linha de adição não precisa de rótulo)* |
| O que há para fazer? | Nova tarefa |
| Adicionar | *(fora — `Enter` cria)* |
| Detalhes (opcional) | Notas *(só para texto longo)* |
| A fazer (0) | *(vira estado na toolbar)* 8 por fazer · 2 atrasadas |
| Tudo em dia | Tudo em dia |
| Não há tarefas pendentes. Adiciona uma acima para começar a organizar a equipa. | Nada por fazer nesta lista. **[botão]** Nova tarefa<br>*Experimenta escrever «Confirmar florista amanhã às 10h #Ana».* |
| *(atrasada)* | ⚠ Atrasada há 2 dias |
| *(toast)* | Tarefa concluída — Anular |
| *(eliminar)* | Eliminar «Confirmar florista»? |

---

## PARTE 6 — ACESSIBILIDADE

- A lista é `<ul>` com `role="list"`; cada tarefa é `<li>` com uma checkbox real (`<input type="checkbox">`), não um `div` com um ícone.
- Marcar anuncia em `role="status"`: *"Confirmar florista, concluída."*
- Cabeçalhos de grupo com `<h2>` visualmente pequenos, ligados por `aria-labelledby`.
- Data atrasada com ícone **e** texto: `⚠ Atrasada` — nunca só a cor vermelha. **[APPLE]**
- Responsável com `aria-label` do nome completo, nunca só as iniciais.
- Prioridade com `aria-label` — `!!` sozinho não se lê.
- Arrasto com alternativa por menu (`Mover para cima` / `Mover para baixo`) e anúncio em `role="status"`.
- Anel de foco de 3 px; foco distinto de seleção.
- Alvos ≥ 40 px; checkbox com 18 px visuais e 40 px de alvo.
- Zoom a 200% sem scroll horizontal — o painel de detalhe colapsa primeiro.
- Percurso completo só com teclado: criar, datar, atribuir, marcar, anular, eliminar.

---

## PARTE 7 — ORDEM DE EXECUÇÃO

| # | Fase | Entrega |
|---|---|---|
| 01 | **Toolbar** | Logótipo fora, título da lista, contagem como estado, "Nova tarefa" com `⌘N`. |
| 02 | **Linha de tarefa** | Checkbox real, título, data, responsável, evento, prioridade, `⋯` no hover. |
| 03 | **Adição inline** | O cartão desaparece; a última linha da lista cria. `Enter` cria e mantém aberto. |
| 04 | **Concluir** | Mola na checkbox, risco, espera de 1,5 s, secção Concluídas, Anular. |
| 05 | **Listas** | Hoje · Esta semana · Atrasadas · Sem data · Todas, mais listas por evento. |
| 06 | **Agrupar e ordenar** | Cabeçalhos sticky; ordenação manual ativa o arrastar. |
| 07 | **Linguagem natural** | Datas, horas, `#`, `@`, `!`, com chips editáveis. |
| 08 | **Painel de detalhe** | Notas, subtarefas, anexos, ligação ao evento. |
| 09 | **Arrastar e menus** | Reordenar, menu de contexto, atalhos. |
| 10 | **Estado vazio** | Título, frase, botão, e a dica da linguagem natural. |
| 11 | **Acessibilidade** | A lista da Parte 6. |

**Critérios de aceitação**

1. Zero botões primários desativados como estado inicial do ecrã.
2. Criar uma tarefa com data, responsável e evento **sem abrir nenhum disclosure**.
3. `Enter` cria e o campo fica pronto para a seguinte.
4. Marcar e desmarcar três vezes seguidas sem a lista saltar.
5. Todas as concluídas continuam acessíveis; nada desaparece.
6. O estado vazio tem um botão e não manda olhar para outro sítio.
7. Zero espaço morto: o painel de detalhe ocupa a coluna que hoje está vazia.
8. Uma tarefa atrasada é identificável em escala de cinzentos.
9. Percurso completo só com teclado.
10. Lighthouse de acessibilidade ≥ 95.

---

## PARTE 8 — PROIBIÇÕES NESTE ECRÃ

Logótipo na toolbar · descrição da vista acima do título · botão primário desativado como estado inicial · cápsula num campo de texto · formulário de criação como cartão permanente · data, responsável e evento atrás de um disclosure · lista única sem agrupamento · contador de zero como cabeçalho · separador por baixo de um cabeçalho sem conteúdo · estado vazio sem botão · estado vazio a apontar para outro elemento do ecrã · tarefa concluída que desaparece sem Anular · lista que salta ao marcar · atrasada comunicada só por cor · checkbox que não é `<input type="checkbox">` · lista sem arrastar · lista sem menu de contexto · metade do ecrã vazia · três botões no hover de uma linha · qualquer valor literal fora dos tokens.