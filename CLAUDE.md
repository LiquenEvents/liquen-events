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
