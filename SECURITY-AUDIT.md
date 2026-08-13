# Auditoria de segurança — Julho de 2026

Oito frentes em paralelo sobre o repositório e o ambiente local. Só leitura
passiva contra terceiros; nenhum teste activo saiu daqui.

Os Médios e Baixos estão em [SECURITY-BACKLOG.md](./SECURITY-BACKLOG.md). Os
cabeçalhos medidos estão em [SECURITY-BENCHMARK.md](./SECURITY-BENCHMARK.md).

---

## Sumário executivo

**Nada de Crítico.** Nove achados Altos, todos corrigidos, e nenhum era do tipo
"o sítio está aberto". São de outra família, mais difícil de ver: **controlos
que existiam e não funcionavam**.

A medida anti-tempo era ela própria o oráculo de tempo. O tecto que eu pus para
travar ataques trancava a porta à dona. O limite posto para proteger a memória
tornava emails permanentemente ilegíveis. O cabeçalho que bloqueava o
rastreamento publicitário bloqueava uma tecnologia retirada em 2022 enquanto a
sucessora passava. Um documento de segurança descrevia um ficheiro que nunca
existiu.

**Três resultados negativos valem tanto como as correcções**, e estão aqui com
o mesmo destaque: o XSS armazenado que eu esperava não existe; a falta de
políticas de RLS é a postura correcta neste modelo; e a política de segurança
com nonce que pedi **deita o sítio abaixo** e foi revertida.

| Severidade | Encontrados | Corrigidos |
|---|---|---|
| Crítico | 0 | — |
| **Alto** | **9** | **9** |
| Médio | 14 | 2 |
| Baixo | 9 | 0 |
| Falsos positivos descartados | 31 | — |

---

## Altos — todos corrigidos

| # | O quê | Ficheiro | Comprovação |
|---|---|---|---|
| 1 | **Proposta de um cliente servida a outro.** A guarda de posse só comparava se o campo não estivesse vazio, e vazio é um estado real (`on delete set null`) | `api/portal/[token]/proposta-pdf/route.ts:67`, `[lang]/portal/[token]/page.tsx` | Reproduzido: 200 + documento alheio desenhado |
| 2 | **Tokens de cliente enviados à Google** em cada visita, mesmo com consentimento negado | `components/GoogleTag.tsx`, `[lang]/layout.tsx:218` | Token de 140 caracteres no `page_location` |
| 3 | **Tokens escritos nos registos de produção**, até 5× por visita | `components/WebVitals.tsx:29`, `api/vitals/route.ts` | 148 caracteres, tecto do esquema 256 → inteiro |
| 4 | **Oráculo de tempo no login.** O compare-fantasma usava custo 10; as contas reais são custo 12 | `lib/admin-auth.ts:171` | 348,9 ms vs 86,2 ms — rácio 4,05 |
| 5 | **Código do segundo factor reutilizável** dentro da sua janela | `lib/totp.ts:57` | Mesmo código aceite 5× seguidas |
| 6 | **O tecto por conta trancava a dona** — era gasto antes de verificar credenciais | `api/admin/login/route.ts:60` | 20 pedidos anónimos → 429 com a palavra-passe certa |
| 7 | **Um email podia ficar permanentemente ilegível** (502 no back office) | `lib/inbox.ts:210` | `HTML too long for parsing 3000007 bytes` |
| 8 | **Escritas concorrentes perdidas** no backend de ficheiros | `lib/repository.ts:327,409` | Três `create()` → `['c']` em vez de `['a','b','c']` |
| 9 | **Topics API aberta.** O bloqueio era do FLoC, retirado em 2022 | `next.config.ts` | `browsing-topics` `true` → `false`; 73 → 59 permitidas |

Os 2, 3 e 6 têm um agravante comum que merece ser dito: **o token não é de
leitura.** O da proposta autoriza aceitá-la, e aceitar cria contrato e factura
de sinal de 30%.

---

## Os três resultados negativos

**Não há XSS armazenado pelo email.** Era a hipótese que eu considerava mais
provável — qualquer pessoa pode escrever ao estúdio, e o back office mostra a
mensagem. Foi seguida uma carga real desde o servidor IMAP até ao ecrã: o
servidor nunca envia HTML, e o React escapa o nó de texto. Ficou um teste de
guarda, com dentes provados injectando a vulnerabilidade de propósito.

**As 15 tabelas sem políticas de RLS estão certas assim.** Num relatório
genérico isto apareceria como Crítico. Foi determinado o modelo de acesso com
prova: não existe chave anónima em lado nenhum, o browser nunca fala com o
Supabase, e o servidor usa a chave de serviço — que ignora RLS por desenho.
Activo-sem-políticas nega tudo ao que não seja o servidor. **Inventar
severidade para justificar um patch seria pior do que não tocar.**

**A política de segurança com nonce deita o sítio abaixo.** Foi implementada
como pedi, medida no browser, e revertida: 43 scripts, nenhum com nonce, 42
violações, sem hidratação. O nonce é aplicado durante a renderização, a partir
do pedido — e quase todas as páginas são geradas na compilação, sem pedido
nenhum. Pior, `'strict-dynamic'` faz o browser ignorar o próprio domínio.
**Continuava a parecer bem**, porque o HTML estático desenha-se na mesma.

---

## O achado que mais expõe legalmente

Não é técnico. A política de privacidade publicada promete que *"pedidos que
não deem origem a contrato são eliminados no prazo máximo de 12 meses"*
(`legal-content.ts:64`). **Não existe qualquer mecanismo de expurgo** — nem
cron, nem anonimização, nem tarefa. Só apagamento manual. Na prática ficam para
sempre.

Além disso, o Sentry e o webhook de erros não estão declarados como
subcontratantes, e até esta auditoria seguiam para lá dados pessoais dentro das
mensagens de erro.

Não foi corrigido: `legal-content.ts` é texto legal e a decisão de o alterar —
ou de construir o expurgo que ele promete — é da dona, não minha.

---

## Falsos positivos descartados

Trinta e um, cada um com a razão registada no relatório da frente respectiva.
Vale a pena porque poupa a quem vier a seguir o dia que se gasta a
re-investigar o que já foi olhado.

Os que mais custaram a descartar: redirect aberto por `lang` (o Next re-codifica
o caminho — testadas 6 codificações), travessia no guarda de caminhos de temas
(a regex é estanque; a armadilha clássica do `$` antes de `\n` é do Python, não
do JavaScript), injecção de cabeçalhos no email (o nodemailer 9.0.3 neutraliza
CRLF), e a vulnerabilidade conhecida de contorno do middleware — verificada
offline com um controlo de sanidade a provar que a busca funcionava.

---

## Dependências

`npm audit`: **9 Altas, 0 Críticas**, todas da mesma raiz (`brace-expansion`,
pela cadeia do ESLint). **`npm audit --omit=dev` → 0 vulnerabilidades.** Nenhuma
dependência de produção afectada; a exposição é a máquina de quem corre o lint.

Lockfile íntegro: 687 pacotes, 0 sem `integrity`, 0 fora do registo oficial, 0
divergências. Dos 161 scripts de ciclo de vida, **um** é `postinstall` real
(156 bytes, escolhe um binário nativo).

Ressalva: o `npm audit` só vê a base de avisos do npm. Não foram consultadas
bases de CVE independentes, portanto não se afirma que as versões estão
seguras — afirma-se que o `audit` não lhes aponta nada.

---

## O que precisa de decisão da dona

1. **O expurgo dos 12 meses** que a política promete: construir, ou corrigir a
   política. Ambas são decisões suas.
2. **Declarar o Sentry e o webhook** como subcontratantes.
3. **Mover o token do caminho do URL para um cookie** — mata a classe inteira
   das fugas 2 e 3 de uma vez. Maior do que esta auditoria.
4. **`connect-src` sem o Supabase**: hoje não parte nada, mas parte no dia em
   que ligarem o envio directo para o Storage — e o recurso não dispara, porque
   um bloqueio de CSP é `TypeError`, não erro HTTP.
