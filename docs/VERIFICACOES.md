# As verificações de cada mudança (CI)

> Palavras dela, a 15/10: «porque é que demora muito?… tornar tudo super
> eficiente, super rápido… para que não estejamos à espera muito tempo, que
> tudo funcione perfeitamente bem».

Antes de uma mudança entrar no site, o GitHub corre as verificações em
`.github/workflows/`. Até 15/10 um PR esperava **~28 minutos**. A espera estava
no CI do GitHub; a Vercel publica em ~1,5–2 minutos.

## Onde estava o tempo (medido com `gh api`, PRs #228 e #229)

| Job | Duração | Bloqueia? |
|---|---|---|
| E2E (Playwright): **11 invocações em fila** | 27–28 min | sim |
| · o passo «informativo» | 12 min | **não** |
| · `dados` (servidor `dev`, 1 worker) | 4,5–5 min | sim |
| · `@imagens` (118 passeios) | 4,5 min | sim |
| · os outros oito passos | ~4 min | sim |
| Lint · Typecheck · Test · Build | 12–15 min | sim |
| · testes de unidade (881 ficheiros, um processo) | 9–12 min | sim |
| Lighthouse (desktop e telemóvel, seguidos) | 15 min | não |

Quase metade do tempo era um passo que nem pode pôr um PR vermelho.

## Como passou a ser (15/10)

O trabalho é o mesmo: **nenhum teste saiu, nenhum se salta, nenhum orçamento
mudou**. As partes deixaram de esperar em fila, e cada uma tem o seu runner.

| Job | O que corre |
|---|---|
| `estatico` | audit, lint, typecheck, build, peso das rotas |
| `unitarios` ×3 | `vitest --shard=1/3`, `2/3`, `3/3` |
| `quality` | **«Lint · Typecheck · Test · Build»**: passa só se as quatro de cima passarem |
| `e2e-imagens` ×2 | `@imagens --shard=1/2`, `2/2` |
| `e2e-producao` | `@desempenho`, `@galeria`, `@movimento`, `@vidro`, `@semrede` (contra `next start`) |
| `e2e-dados` | `test:e2e:dados` (servidor `dev`, grava) |
| `e2e-gravam` | `test:e2e:movel`, `:propostas`, `:passkeys` (servidor `dev`) |
| `e2e` | **«E2E (Playwright)»**: passa só se os quatro de cima passarem |
| `e2e-informativo` ×3 | o resto da suite, em três partes, sem bloquear (como sempre) |
| Lighthouse ×2 | desktop e telemóvel ao mesmo tempo (informativo, como sempre) |

- **Os dois nomes de sempre ficam.** Não consegui ler que verificações o GitHub
  exige para juntar (a leitura dá 403 com o acesso desta casa). Por isso os jobs
  «Lint · Typecheck · Test · Build» e «E2E (Playwright)» continuam a existir e
  só passam se todas as suas partes passarem. Se forem obrigatórios, continuam a
  sê-lo, com o mesmo significado.
- **O começo de cada job é um só**, a acção `.github/actions/preparar`: Node,
  dependências, a cache das miniaturas e, se pedido, o Chromium e o build. Assim
  nenhum job diverge no que instala nem na chave da cache, como já tinha
  acontecido ao Lighthouse.
- **Os jobs que usam o servidor `dev` não fazem build**, porque não precisam
  dele.

## O que custa

- **Com a cache das miniaturas quente** (quase sempre), cada build leva ~1
  minuto. Há mais builds do que antes (um por job contra `next start`), mas
  correm em paralelo.
- **Com a cache fria** (a primeira corrida depois de entrarem fotografias novas),
  cada job que constrói paga o encode das miniaturas (~13 min), em paralelo. É o
  mesmo que antes pagava o job maior, sozinho.
- **Mais minutos de runner no total.** O repositório é público, e os minutos do
  GitHub Actions não se pagam.

## Os tempos depois

Medidos no PR desta mudança, preenchidos quando o CI dele acabou.
