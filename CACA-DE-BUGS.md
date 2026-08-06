# Caça de bugs ao back office — estado

Este ficheiro diz o que ficou construído, o que foi medido, e o que **não** foi.
A parte importante é a última: um relatório de caça que não distingue "procurei
e não encontrei" de "não cheguei a procurar" é pior do que não haver relatório.

---

## O que ficou construído e a funcionar

| Peça | Onde | Estado |
|---|---|---|
| Configuração dedicada, 6 aparelhos, vídeo e trace | `playwright.caca.config.ts` | ✅ funciona |
| Harness: recolha de consola/erros/pedidos + guardas | `e2e/caca/harness.ts` | ✅ funciona |
| Semente de dados de stress (60 pedidos, 24 propostas) | `scripts/semear-caca.mjs` | ✅ funciona |
| Agente 9 — scroll e layout, 14 vistas | `e2e/caca/a09-scroll-layout.spec.ts` | ✅ corre |
| Agente 10 — cliques, toques e estados | `e2e/caca/a10-cliques-toques.spec.ts` | ⚠️ escrito, por correr |
| Agente 2 — editor de serviços sob stress | `e2e/caca/a02-editor-stress.spec.ts` | ⚠️ escrito, por correr |
| Agentes 1, 3–8, 11–15 | — | ❌ **não escritos** |

### Como correr

```bash
node scripts/semear-caca.mjs            # semeia; guarda cópia em data/.antes-da-caca/
npm run dev                             # o servidor tem de estar de pé
npx playwright test --config playwright.caca.config.ts --project=iphone-se
node scripts/semear-caca.mjs --repor    # repõe os dados de antes
```

**Nota de ambiente:** o `@playwright/test` fixado no `package.json` (1.60) procura
o chromium build 1223; esta máquina só tem o 1194, e a descarga está bloqueada
pelo proxy. Para correr aqui é preciso um runner 1.56 instalado fora do
repositório. Em CI, onde o browser certo está instalado, a configuração corre
tal como está.

---

## O que foi efectivamente medido

**Agente 9, quatro aparelhos tácteis (375, 393, 412, 810px) e dois desktops
(1440, 1920), 14 vistas do back office.** Guardas aplicadas: overflow
horizontal, alvos de toque <44px, inputs com letra <16px, erros de consola.

### Resultado: nenhum defeito de layout confirmado

Nas vistas que o percurso conseguiu alcançar — Visão Geral, Pedidos,
Acompanhamento, Propostas, Tarefas, Calendário, Faturas, Temas, Estatísticas —
não há overflow horizontal, não há alvos de toque abaixo de 44px, e não há
campos com letra abaixo de 16px em ecrã táctil. O back office aguenta as
larguras que interessam.

### Falsos positivos descartados, e porquê

Estes apareceram, foram investigados, e **não são defeitos**. Ficam aqui
registados porque quem repetir a caça vai encontrá-los outra vez.

| Achado aparente | Porque foi descartado |
|---|---|
| 31 células do calendário a 36×52px | Medido no perfil `devices["iPhone SE"]` do Playwright, que é o SE de **1.ª geração (320px)**. A 375px — o SE que a equipa tem, e o que o pedido especificava — as células ficam a ~45px e passam. Erro do meu perfil, não da aplicação. |
| 17px de overflow horizontal no Material | Mesmo motivo: só a 320px. |
| ~40 alvos entre 30 e 41px em desktop | A regra dos 44px é de **toque**. Com rato, um botão de 30px acerta-se ao pixel. A guarda passou a medir só onde `(pointer: coarse)` é verdade. |
| 7 campos a 12–14px | O `globals.css` já força `font-size: 16px` dentro de `@media (pointer: coarse)` — e há um comentário longo a explicar porquê, incluindo o iPad. Em desktop não há zoom nenhum a evitar. A guarda passou a medir só em ecrã táctil. |
| Link «Saltar para o conteúdo» a 1×1 | É a técnica normal de um skip link: só ganha corpo com foco, e nunca é tocado com o dedo. |

---

## O que NÃO foi feito, e é preciso dizê-lo

**Os agentes 1, 3–8 e 11–15 não foram escritos nem corridos.** Não há dados
sobre: criar uma proposta de ponta a ponta, biblioteca de temas, financeiro,
geração e envio de PDF, pesquisa e filtros, autenticação e sessão, logística de
material, formulários e teclado virtual, sincronização e conflitos entre
separadores, desempenho com CPU 4x, idioma EN por traduzir, e coerência de
design.

Os agentes 2 e 10 estão escritos mas não chegaram a correr até ao fim.

**Porquê:** o tempo desta sessão foi consumido a pôr o harness de pé. Foram
quatro problemas de ambiente encadeados, cada um a mascarar o seguinte:
o chromium em falta, o `--no-sandbox` em root, os perfis de iPhone do Playwright
que apontam para webkit, e a barra lateral que em telemóvel existe fora do ecrã.
Nenhum deles é um defeito da aplicação, e todos tinham de ser resolvidos antes
de a primeira medição valer alguma coisa.

**O que falta no harness:** a função `irPara` ainda não chega às vistas que
vivem debaixo de «Mais» em ecrã estreito (Material, Definições, Serviços,
Temas, Estatísticas) nem, de forma fiável, a «Pedidos». Essas vistas ficaram
por medir em telemóvel. É o primeiro problema a resolver antes de continuar.

---

## Por onde continuar

1. Fechar o `irPara` para os destinos debaixo de «Mais» em ecrã estreito.
2. Correr os agentes 2 e 10, que já estão escritos.
3. Escrever os restantes por ordem de risco: **5** (geração e envio — é
   irreversível), **4** (financeiro — são números que têm de bater certo),
   **12** (sincronização — é onde se perde trabalho), **7** (sessão), e só
   depois os de superfície.
4. Ligar ao CI: viewport móvel e desktop, com o build a falhar por overflow
   horizontal a 375px, erro de consola em qualquer percurso, input <16px em
   ecrã táctil e alvo de toque <44px.
