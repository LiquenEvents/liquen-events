@AGENTS.md

# O sistema de design manda

Todo o trabalho de interface no back office segue `docs/DESIGN-SYSTEM.md`. Lê o
ficheiro inteiro antes de tocar em qualquer componente. Nenhum valor de cor,
espaço, raio, duração ou curva pode existir fora dos tokens definidos nesse
ficheiro.

A **Parte −1** desse documento lista as quatro adaptações a esta casa que não
são opcionais — o gestor de pacotes, o prefixo dos tokens de duração no
Tailwind v4, a separação do CSS do back office, e a regra de convergir a família
de material que já existe em vez de criar uma segunda ao lado.

# E o ecrã «Fazer proposta» tem um documento só dele

`docs/FAZER-PROPOSTA.md` reconstrói o ecrã onde ela passa mais tempo. Lê-o antes
de tocar em `/orcamento/admin/propostas/nova` ou `/propostas/[id]/editar`.

A **Parte −1** regista a única alteração ao documento, e é dela: o ponto 3 manda
a barra de destinos do fundo desaparecer em favor de uma coluna à esquerda, e ela
respondeu **«Fica a barra de baixo»** quando lhe pus a escolha à frente. A fase
01 desse documento não se faz; tudo o resto vale.

# E o ecrã de entrada tem outro

`docs/LOGIN.md` reconstrói `/orcamento/admin/login`. Tem no topo uma tabela com
o que já está feito e o que falta — lê-a antes de refazer seja o que for.

# E o guião do dia também

`docs/GUIAO-DO-DIA.md` explica a vista «Guiões do dia» (`?v=guioes`), o motor
que ela reutiliza (`lib/orcamento/guiao-do-dia.ts`, que já cá estava) e os
modelos de guião. Lê-o antes de tocar no `Guioes.tsx`, no `ReguaDoDia.tsx` ou no
`EventTimeline.tsx`.

A decisão que o abre é a que interessa a quem vier a seguir: **a vista de topo
MONTA o `EventTimeline` que já existe** em vez de ter um editor próprio. Um
segundo editor de guiões ao lado do primeiro é o defeito que a Parte −1 do
sistema de design manda evitar — e, aqui, seriam dois ecrãs a discordar sobre o
mesmo dia num papel que se entrega à equipa na manhã do evento.

# E o vidro tem o seu

`docs/LIQUID-GLASS.md` é o documento dela sobre o material — porque é que um
`backdrop-filter: blur()` não é Liquid Glass, o que é preciso acrescentar-lhe, e
a tabela de valores por superfície. O motor está em `src/lib/liquid-glass.ts` e a
ponte para React em `ui/Glass.tsx`.

A **Parte −1** regista as quatro decisões em que a execução se afastou do
documento — a primeira superfície não é a que ele nomeia (a barra do portal do
cliente não existe), o `cluster()` ficou de fora até haver o que fundir, as
curvas `linear()` já cá estavam, e o `position` do `.lg` vive no JS e não no CSS.

E as duas regras da Parte 5 que nenhum ficheiro consegue fazer cumprir sozinho,
portanto ficam aqui: **uma camada de vidro por ecrã** — vidro sobre vidro
transforma o fundo em papa cinzenta —, e **vidro só no que flutua**; listas,
tabelas e formulários ficam opacos. Antes de pôr um `<Glass>` num ecrã, conta os
que já lá estão.

# E há três ecrãs com documento próprio à espera

`docs/APPLE-TAREFAS.md`, `docs/APPLE-CALENDARIO.md` e `docs/APPLE-TEMAS.md` são
os três documentos dela para reconstruir esses ecrãs segundo o sistema da Apple.
Cada um abre com uma tabela **auditada no código** — não de memória — do que já
está feito e do que falta, no formato do `docs/LOGIN.md`. Lê a tabela antes de
refazer seja o que for.

Ela escolheu a ordem: **«prefiro as tarefas primeiro»**. Em resumo, hoje:
Tarefas cinco fases de onze; Temas nenhuma inteira mas quase todas começadas
(o ecrã já tinha muito feito antes do documento); Calendário por começar — só
existe a vista de mês, e as de dia, semana e ano são metade daquele documento.

Estes três andaram perdidos: chegaram pelo chat e nunca ficaram guardados. O do
Liquid Glass fez o mesmo caminho e só se recuperou por sorte. **Um documento que
ela manda guarda-se em `docs/` no mesmo dia** — é isso que impede o próximo de
se perder.
