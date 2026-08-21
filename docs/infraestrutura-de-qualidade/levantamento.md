# Infraestrutura de qualidade — Passo 1: levantamento

**Nada foi implementado.** Isto é só o inventário: o que já existe, o que falta, e onde é que
eu acho que uma camada é exagero para este sistema.

## O que há hoje, em números

| | |
|---|---|
| Ficheiros de teste unitário | 502 |
| Testes unitários | 7 427 |
| Ficheiros de teste ponta a ponta | 32 specs, 7 configurações do Playwright |
| TypeScript | `strict: true`, sem uma única excepção silenciosa* |
| Esquemas `zod` | 11 esquemas em `src/lib/validation.ts`, usados por 17 ficheiros |
| Rotas de API | 96 — **10 com `zod`** |
| Fluxos de CI | 7 (`ci`, `codeql`, `container`, `gitleaks`, `lighthouse`, `scorecard`, `semgrep`) |
| Passos bloqueantes no CI | lint · typecheck · 7 427 testes · build · 5 baterias E2E |

\* `@ts-ignore`: 0. `@ts-expect-error`: 1. `: any` fora de testes: 1. `as any` fora de testes: 0.
`eslint-disable`: 63 (não os li um a um). Isto é invulgarmente limpo — a Camada 6, na parte dos
tipos, está feita.

---

## Camada a camada

### Camada 1 — Testes de propriedade · **NÃO EXISTE**

Não há `fast-check` nem equivalente. **Mas há mais do que parece:** o Agente 3 correu à mão o
que esta camada automatizaria — 600 000 casos de ida e volta `totalAmountParaBase ↔
resolveProposalMoney`, zero desvios; 400 001 totais a verificar o invariante do sinal. Encontrou
os defeitos nas **bordas** (texto livre), não no núcleo.

O que existe hoje: `money-invariantes.test.ts`, `proposal-doc-math.adversarial.test.ts`,
`pricing.adversarial.test.ts` — testes de exemplo bem escolhidos sobre exactamente estas
propriedades. O que falta é a geração aleatória.

**Round-trip de serialização: não existe teste nenhum.** É a propriedade mais barata da lista e
a que mais protege — guardar uma proposta e recarregá-la devolve a mesma estrutura.

> `fast-check` é dependência nova. Preciso do teu sim. É `devDependency`, ~1 MB, não vai para
> produção.

### Camada 2 — Fuzzing de entradas · **PARCIAL**

Há 17 ficheiros `*.adversarial.*` e mais uma dúzia de testes com entradas hostis
(`export-injection`, `calendar-dates`, `contract-pdf-wrap`, `csp-nonce-contract`,
`admin-auth.adversarial`). Cobrem bem o que já mordeu.

O que falta: **geração automática**. Hoje as entradas hostis são escolhidas à mão, uma a uma. Não
há varrimento sistemático de todas as rotas com unicode/RTL/zero-width/`Infinity`/`NaN`, nem
teste de MIME falsificado (embora as quatro camadas de validação de upload existam e estejam
bem — o Agente 7 confirmou-as).

### Camada 3 — Ponta a ponta · **PARCIAL, e o buraco é grande**

32 specs, 5 baterias bloqueantes no CI (imagens, galeria, ergonomia móvel, dados+geometria,
propostas, passkeys). Isto é sólido e foi construído com cuidado — cada passo tem um comentário a
explicar porque é bloqueante.

**Dos seis fluxos obrigatórios do teu prompt, estão cobertos: 1 (parcialmente), 4 e metade do 6.**
Faltam por inteiro: 3 (proposta enviada → editada → reenviada), 5 (mudar para EN a meio), 2
(foto → mood board → PDF → página) e o «apagar» do 6.

E o dado mais duro da caça: **a página do casal tem 22 linhas de teste ponta a ponta**, que
verificam um token inválido e o `noindex`. Nenhum teste abre a página de uma proposta real.
É a superfície mais cara do produto e a menos coberta — e foi exactamente aí que os agentes
encontraram A3-003, A3-004, A5-001, A6-005 e A8-001.

Não há rede lenta simulada em nenhum spec.

### Camada 4 — Regressão visual · **NÃO EXISTE**

Zero `toHaveScreenshot`, zero `toMatchSnapshot`, zero pastas de snapshots.

> **Digo-te já: esta camada é a que eu não construía.** Ver a secção final.

### Camada 5 — Verificação de conteúdo · **METADE, e a metade que falta é a do CI**

| Peça | Estado |
|---|---|
| Corrector ortográfico PT/EN | **existe** (`proposal-ortografia.ts`, `gralhasDoDocumento`) |
| Dicionário de grafias erradas («Seatting») | **existe** — `GRAFIAS_DA_CASA`, com teste |
| Termos ingleses da casa | **existe** — `TERMOS_INGLESES_DA_CASA` |
| Glossário de tradução única | **existe** — `GLOSSARIO` em `proposal-traducao.ts`, com teste adversarial |
| Detecção de EN dessincronizado | **existe** — `estadoDoIngles` / `traducoesFeitas` |
| Verificação de variáveis de template | **existe** — `email-template-vars.test.ts`, 19 testes |

Tudo isto existe e funciona **no ecrã dela**, no estúdio: o painel de gralhas, o «Por traduzir»,
a Conferência. **Nada disto corre no CI sobre o conteúdo publicável que vive fora de uma
proposta** — o catálogo de serviços, os modelos de email semeados, os textos de interface.

E é precisamente aí que o Agente 4 encontrou os dois casos conhecidos ainda vivos: «para o ␣no
Torre de Palma» e «no Torre de Palma» estão nos **modelos semeados** (`email-templates-store.ts`),
que nenhum corrector visita.

Também há duas cegueiras já provadas: as alternativas não entram na contagem de traduções
(A6-010, A8-009) e o corrector não vê o cronograma nem as linhas estimadas (A8-010).

### Camada 6 — Contratos e tipos · **TIPOS FEITOS, CONTRATOS A 10 %**

TypeScript estrito, sem escapes: feito. Erro de tipo falha o build: feito (`npm run typecheck` é
bloqueante).

Validação nas fronteiras: **10 rotas em 96**. O formulário público está bem coberto
(`quoteFormSchema`, com o `mensagemDeValidacao` que traduz as recusas). O back office não —
metade das rotas de administração lê o corpo do pedido sem esquema, e as que têm mostram o texto
interno do `zod` em inglês ao ecrã (A1-009).

**Contrato de saída: não existe.** É a metade que o Agente 7 provou que faz falta: o A7-001 é
exactamente um campo interno a escapar por acidente numa fronteira RSC, e a
`fronteira-servidor-cliente.test.ts` não o apanha porque verifica **módulos**, não **dados**.

### Camada 7 — Privacidade e exposição · **A MAIS BEM FEITA DAS DEZ**

| Requisito | Estado |
|---|---|
| Custos e margem fora do PDF e da página | **feito** — `NUNCA_NO_PDF` + `notas-internas-ficam-em-casa.test.ts` (5 testes, compara instruções de desenho, com controlo positivo) |
| Notas internas fora do output de cliente | **feito** — mesmo teste, cobre PT, EN e a cópia para outro casal |
| Rotas de back office inacessíveis sem autenticação | **feito** — `auth-guard-audit.test.ts`, 31 testes, 93 ficheiros de rota, espia os módulos com efeito para provar que a guarda corre ANTES de tocar no armazenamento |
| Link não adivinhável | **feito** — HMAC com sub-chave por domínio, `timingSafeEqual` |
| Link expirável | **feito** — 90 dias |
| Link **revogável** | **NÃO EXISTE** — A7-003 |
| Zero rastreio nas rotas com token | **feito** — 3 testes (`zero-rastreio`, `analytics-token-leak`, `nada-se-mede-na-rota-privada`) |
| Fronteira servidor/cliente | **feito para módulos**, cego para dados (A7-001) |

Falta pouco, e é preciso: (a) o teste de dados na fronteira RSC, (b) a auditoria de guardas a
prender **métodos** e não ficheiros (A7-002), (c) a decisão sobre o link revogável.

Esta camada **já bloqueia o deploy**: os testes correm no job bloqueante do CI.

### Camada 8 — Resiliência · **PARCIAL**

122 ficheiros de teste simulam falhas (`mockRejected`, timeouts). O tratamento de erro no código
é bom — o Agente 9 contou 118 `catch` vazios e **116 têm um comentário a explicar porquê**; os 2
restantes estão dentro de um script inline onde não há alternativa.

O que falta é o teste do **critério** que tu escreveste: «o utilizador percebe o que aconteceu, e
não perde trabalho». Nenhum teste afirma isso. E os agentes encontraram cinco sítios onde não é
verdade: A2-004, A2-005, A9-004, A9-006, A10-004.

### Camada 9 — Observabilidade · **MAIS DO QUE ESPERAVAS**

- **Captura de erros em produção: existe**, sem SDK. `logger.ts` fala o protocolo de envelope
  HTTP do Sentry directamente — basta pôr `SENTRY_DSN` no Vercel. E `ERROR_WEBHOOK_URL` manda
  os erros para um webhook (Slack/Discord).
- **Redacção de segredos e tokens: existe e é boa** — `CAPABILITY_PATH_RE` corta
  `/proposta/<token>` de tudo o que entre nos registos.
- **Web Vitals: existe** — `src/components/WebVitals.tsx` + `/api/vitals` (com `zod`), e com o
  cuidado de nunca correr nas rotas privadas.
- **Log estruturado nas operações críticas: existe** — envio, geração de PDF, cópia de segurança.
- **Sonda de saúde: existe** — `/api/health` com `checks`.

**O que falta: alertas.** Um `log.error` que ninguém lê não é observabilidade. E há dois casos
provados em que a coisa importante *é* registada e não chega a ninguém: A10-006 (PDF servido
incompleto ao casal) e A9-002 (a cópia de segurança que se carimba sem o email ter saído).

> `@sentry/nextjs` é dependência nova — **e eu acho que não é precisa.** O envelope HTTP já
> funciona. Preciso só que ponhas o `SENTRY_DSN` no Vercel.

### Camada 10 — Portões no CI · **6 DOS 7**

| Portão | Estado |
|---|---|
| 1. Tipos e lint | **bloqueante** |
| 2. Testes unitários | **bloqueante** (7 427) |
| 2b. Testes de propriedade | não existem (Camada 1) |
| 3. Ponta a ponta | **5 baterias bloqueantes**; o resto da suite é informativo (`continue-on-error`) por decisão escrita |
| 4. Regressão visual | não existe |
| 5. Verificação de conteúdo | não existe no CI |
| 6. **Privacidade** | **bloqueante** — corre no job de testes |
| 7. Orçamento de desempenho | **meio**: `galeria-desempenho.spec.ts` é bloqueante; o Lighthouse corre com `continue-on-error` |

Ambiente de pré-visualização por alteração: **já existe**, é a Vercel.

---

## As três dependências novas

| | Para quê | O meu parecer |
|---|---|---|
| `fast-check` | Camada 1 | **Vale a pena.** É a única forma de fazer a Camada 1, e o round-trip da proposta sozinho já paga. Preciso do teu sim. |
| `@sentry/nextjs` | Camada 9 | **Não é precisa.** O `logger.ts` já fala o protocolo. Poupa-te um SDK inteiro no bundle. |
| `pixelmatch` | Camada 4 | **Não recomendo** — ver abaixo. |

---

## O que eu acho que é exagero para um sistema com duas utilizadoras

Pediste-me para dizer em vez de construir. Três coisas:

**1. Camada 4 (regressão visual) — não a construía como está escrita.**
«Capturas de referência de todos os ecrãs principais, em desktop e mobile, com aprovação humana
no CI» é a camada com a pior relação entre manutenção e defeitos apanhados. Com duas
utilizadoras, o que ela apanharia é sobretudo *falsos positivos*: um `padding` que mudou de
propósito, uma fonte que carregou meio milissegundo mais tarde, uma sombra que o Chromium do
runner desenha com outro anti-aliasing. E a resposta humana a um falso positivo repetido é
carimbar sem olhar — que é pior do que não ter a camada. Some-se a isto que vamos mexer no
sistema visual do back office (a direcção estética que aprovaste): todas as referências ficariam
obsoletas na primeira semana.

**O que eu faria em vez disso**, e que apanha o que te preocupa a sério («um `padding` alterado
num componente partilhado»): a `geometria-dos-alvos.spec.ts` e a `ergonomia-tactil.mjs`, que já
existem, medem **regras** (alvos de 44 px, letra ≥ 16 px, nada fora da margem) em vez de píxeis.
Regras não têm falsos positivos e não ficam obsoletas quando a cor muda. Alargá-las custa uma
fracção e não te obriga a aprovar capturas.

**A excepção:** o **PDF** merece regressão visual, e por outra razão — é um artefacto binário que
ninguém revê e onde já apareceram três defeitos de desenho (nome a sair da folha, palavra a
invadir a coluna do preço, escada de totais negativa). Aí uma captura por página, com número
pequeno de referências e mudanças raras, paga-se. Isso não precisa de `pixelmatch`: o Playwright
já traz comparação de imagens.

**2. Fuzzing de SQL/NoSQL injection (Camada 2) — é exagero.**
Não há SQL escrito à mão em lado nenhum: tudo passa pelo cliente do Supabase, que parametriza. O
CodeQL e o Semgrep já correm no CI e cobrem esta classe. O tempo que isso custava está melhor
gasto no fuzzing de **unicode e números**, onde os agentes já encontraram defeitos reais
(«999999» convidados, `Infinity` em campos de dinheiro, texto com prosa dentro de um valor).

**3. «Ambiente de pré-visualização com dados de teste realistas» (Camada 10) — já tens metade e a
outra metade é cara.**
A Vercel dá-te a pré-visualização. Semear dados realistas por deploy exige uma base de dados
descartável por PR, e isso é infraestrutura a sério. Com duas utilizadoras e sete configurações
do Playwright que já semeiam o que precisam, não compensa.

---

## O retroactivo — onde estamos

O teu princípio: *«se um bug já aconteceu uma vez, tem de existir um teste que o impeça de
voltar»*. Estado de cada um dos seis que nomeaste:

| Bug conhecido | Tem teste? | Está corrigido? |
|---|---|---|
| «Seatting» com dois t | **sim** — `GRAFIAS_DA_CASA` + teste com a linha real | sim |
| Frase partida por variável vazia | **não** | **não** — A4-001, vivo e reproduzido |
| Email assinado com o nome do cliente | **sim** — `email-assinatura.ts`, com teste | metade: A4-006 é o outro sintoma, vivo |
| Campos EN dessincronizados | **sim** — `estadoDoIngles`, com teste | metade: cego às alternativas (A8-009) e ao cronograma (A8-010) |
| Imagens partidas na página do cliente | **sim** — `e2e/imagens.spec.ts`, bloqueante | metade: não cobre a capa nem o fecho (A5-001) |
| Contadores a mentir | **sim** — `oQueTemODocumento`, uma contagem só | metade: dois contadores novos por sua conta (A8-007, A8-008) |

**Quatro dos seis voltaram noutro sítio.** Não porque o teste falhou — porque o teste prende o
*sítio* e não a *regra*. É o argumento mais forte a favor da Camada 1 e da Camada 5 no CI: uma
propriedade não tem sítio.

---

## O que eu proponho para o Passo 2

Quando disseres, escrevo o plano com esforço por camada. A ordem que te vou propor é a tua, com
duas diferenças que justifico lá: a Camada 5 sobe (é barata e os dois casos conhecidos estão
vivos AGORA, em produção), e a Camada 4 desce para «só o PDF».

E há uma decisão que vem antes de tudo: **a caça aos bugs devolveu 131 entradas, 67 delas a
chegar ao casal.** Construir a maquinaria que impede os de amanhã e deixar os de hoje em pé é a
ordem errada. A minha sugestão é intercalar: cada bloco de correcções entra com o teste que o
prende, e é assim que as camadas nascem — a Camada 1 nasce a corrigir o dinheiro, a Camada 5
nasce a corrigir os modelos, a Camada 3 nasce a corrigir a página do casal.
