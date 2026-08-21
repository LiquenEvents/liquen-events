# Agente 9 — Erros silenciosos

Esta base de código já passou por várias caçadas a erros silenciosos e nota-se: quase todos os
`catch` vazios têm uma razão escrita ao lado, e os módulos de gravação
(`useGravacaoAutomatica`, `registo-de-gravacoes`, `proposal-storage`) recusam explicitamente
dizer «guardado» sem confirmação do servidor.

O que resta são erros silenciosos de **fronteira**: o servidor faz o trabalho todo — calcula o
motivo, escreve a frase certa, devolve-a — e o cliente deita-a fora; ou o inverso, o cliente
confia num `await fetch` sem olhar para o `res.ok`.

Os quatro que mais custam: as notificações que dizem «ativadas» sem estarem, a cópia de
segurança diária que se carimba a si própria sem o email ter saído, a proposta que segue sem
documento gravado sem ninguém saber, e os modelos de email bilingues que não estão inscritos
em lado nenhum.

**Contagem de `catch` vazios: 118 no total — 116 explicados (com comentário a dizer porquê),
2 mudos.** Os 2 mudos são `src/components/GoogleTag.tsx:37` e `:46`, e estão dentro de uma
*string* de script inline (`dangerouslySetInnerHTML`), onde a única alternativa a engolir é
deitar abaixo o `<head>`. Não contam como defeitos. Na prática: **zero `catch` vazios mudos a
sério**. Foram ainda varridos 148 `catch` com corpo e sem comentário; 140 são conversões
honestas (`return null` num *parse* que falhou). Os que sobram estão abaixo.

---

[A9-001] [Agente 9] [Notificações] [Grave] «Notificações ativadas» sobre uma subscrição que o servidor recusou
     Reproduzir: back office → sino «Ativar notificações» com a rota a responder não-2xx (o
       caso real: instalação sem Supabase → 503; ou sessão expirada noutro separador → 401).
       O browser pede autorização, é concedida.
     Esperado: a frase que o servidor escreveu — «Não dá para ligar as notificações nesta
       instalação: … Define SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY …» — e o sino a ficar
       por ativar.
     Observado: `toast("Notificações ativadas neste dispositivo", "success")` e o botão passa
       a «Ativas». A subscrição não existe no servidor e nunca chegará notificação nenhuma.
       Não há registo nenhum do 503.
     Onde: src/app/[lang]/(site)/orcamento/admin/NotificationBell.tsx:116-123
     Causa provável: `await fetch("/api/push/subscribe", {method:"POST"…})` sem `res.ok`. É
       um esquecimento e não uma decisão: o MESMO ficheiro verifica `res.ok` no GET (linha
       74) e no resumo (linha 174), com comentários longos a explicar exactamente este
       defeito. E a rota (src/app/api/push/subscribe/route.ts:41-51) escreveu a frase
       precisamente para não deixar acontecer isto — «as notificações pareceriam ligadas e
       não chegaria nenhuma».
     Correção proposta: ler a resposta como nos outros dois sítios —
       `if (!res.ok) { const c = await res.json().catch(()=>null); log.error(…, {estado:
       res.status}); toast(c?.error ?? "Não foi possível ativar", "error");
       setState("default"); return; }`
     Chega ao cliente? não (é ela que fica sem os avisos dos pedidos que entram)

[A9-002] [Agente 9] [Cópia de segurança] [Crítico] O carimbo da cópia diária é gravado mesmo quando o email não saiu
     Reproduzir: correr /api/cron/backup com o envio de correio não configurado (sem
       RESEND_API_KEY / SMTP). `sendMail` devolve `{sent:false}` e NÃO atira.
     Esperado: nenhum carimbo, um `log.error`, e o painel de armazenamento a dizer «não chega
       uma cópia há N dias».
     Observado: `registarCopiaEnviada(...)` corre à mesma, `log.info("cron backup enviado",
       …)` (nível info, com `sent:false` escondido no contexto) e 200 `{ok:true}`. O painel do
       back office passa a garantir que há cópia de ontem. Todos os dias, indefinidamente.
     Onde: src/app/api/cron/backup/route.ts:180 (`const { sent } = await sendMail`) → :217
       (`await registarCopiaEnviada(...)`) → :220 (`log.info`)
     Causa provável: `sent` é desestruturado e depois só usado como campo da resposta. O
       comentário imediatamente acima do carimbo (linhas 211-216) diz «O carimbo vai DEPOIS
       do envio, nunca antes … prometê-lo antes de o email sair era a mesma mentira que este
       sistema já apanhou uma vez noutro sítio» — a intenção está escrita, a condição é que
       falta. O `lib/copia-de-seguranca-marcador.ts:15-18` diz o resto: «uma cópia que não
       corre há semanas é PIOR do que não ter cópia nenhuma».
     Correção proposta: `if (!sent) { log.error("cron backup: o email da cópia não saiu —
       nenhum ficheiro deixou a instalação", null, {dia}); return NextResponse.json({ok:false,
       reason:"email-nao-saiu", dia}, {status:500}); }` antes do carimbo. E
       `registarCopiaEnviada` só depois disso.
     Chega ao cliente? não (chega ao dia em que for preciso repor)

[A9-003] [Agente 9] [Estúdio de propostas] [Grave] A proposta segue sem documento gravado e o ecrã diz «Proposta enviada ao cliente»
     Reproduzir: base de dados sem as colunas novas de `proposals` (db/schema.sql por correr
       — o cenário que a própria rota documenta). Enviar uma proposta a partir do estúdio.
     Esperado: ver a frase que o servidor preparou — «A proposta foi guardada e enviada, mas
       sem o documento nem o selo: falta correr o db/schema.sql … Sem o documento o cliente
       não vê o PDF no link …».
     Observado: toast verde «Proposta enviada ao cliente», passo marcado como feito. O casal
       recebe o email, carrega no link, e a página da proposta não tem PDF nenhum para
       mostrar. Do envio só fica o rascunho do estúdio, que se apaga e não vai na cópia de
       segurança.
     Onde: o servidor devolve em src/app/api/orcamento/[id]/proposta-doc/route.ts:747-754 e
       :1259 (`...(docSaved ? {} : { docSaved, docError })`); o cliente nunca lê `docError` —
       src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:4967-5013 (a cadeia de toasts
       trata `missingImages`, `truncations`, `estadoError`, `repetidoAviso`, `emailError`… e
       salta este).
     Causa provável: `docSaved`/`docError` foram acrescentados à rota depois da cadeia de
       toasts do estúdio, e ninguém lá voltou. `grep docError` no cliente devolve zero.
     Correção proposta: acrescentar um ramo antes do «else if (saiu)» — `if (data?.docSaved
       === false && typeof data?.docError === "string") toast(data.docError, "error");` — e
       pô-lo com a mesma prioridade do `aviso` de conteúdo incompleto, porque a consequência
       é a mesma família: o casal recebe menos do que ela julga ter enviado.
     Chega ao cliente? sim (o link da proposta fica sem PDF)

[A9-004] [Agente 9] [Carregamento (telemóvel)] [Grave] Sem localStorage, a marcação nunca vai à rede — apesar do comentário dizer que vai
     Reproduzir: telemóvel com armazenamento cheio ou bloqueado (quota, modo privado). Abrir
       /orcamento/admin/carregamento/[eventId], ONLINE, e marcar um item da carrinha.
     Esperado: o comentário do `escreverFila` promete «a marcação já está no ecrã e vai por
       rede» — logo, o servidor devia recebê-la.
     Observado: `escreverFila` engole a excepção; `sincronizar()` corre logo a seguir mas lê
       os pendentes de `lerFila(localStorage)`, que NÃO contém a marcação que acabou de
       falhar a escrever. Ou a fila vem vazia e sai pelo `return` da linha 136, ou reenvia só
       as antigas. A marcação existe apenas no estado do React desta aba. O cabeçalho chega a
       dizer «1 marcação guardada para enviar» — não está guardada nem vai ser enviada.
     Onde: src/lib/material-offline.ts:66-72 (o `catch` com o comentário errado) e
       src/app/[lang]/(site)/orcamento/admin/carregamento/[eventId]/Carregamento.tsx:202-205
       e :135-136
     Causa provável: `sincronizar` foi desenhado para ler a fila do armazenamento (é o que a
       torna persistente entre abas), mas o caminho de escrita falhada não tem plano B — a
       fila em memória não existe.
     Correção proposta: `escreverFila` devolver `boolean`; em `marcar`, se a escrita falhou,
       guardar a marcação numa fila em memória (`useRef`) e mandá-la directamente ao
       `/material/marcar`, e mostrar «Este telemóvel não consegue guardar as marcações — não
       feches o separador até estarem enviadas». Corrigir também o comentário, que hoje
       descreve um mecanismo inexistente.
     Chega ao cliente? não (perde-se material no dia da montagem)

[A9-005] [Agente 9] [Modelos de email bilingues] [Grave] Ecrã com alterações por publicar que não está inscrito no registo — o «Guardar tudo» diz «Tudo guardado»
     Reproduzir: back office → Modelos de email → separador bilingue. Escrever um corpo novo
       em português SEM carregar em «Guardar». Depois: (a) carregar em «Guardar tudo» no
       cabeçalho, ou (b) clicar noutro modelo da lista, ou (c) trocar PT↔EN, ou (d) fechar o
       separador.
     Esperado: (a) «Faltou guardar 1 de 1», (b) e (c) uma pergunta antes de descartar, (d) o
       travão de saída a nomear o modelo.
     Observado: (a) «Não havia nada por gravar.» / «Tudo guardado» — a mentira por omissão
       que o `registo-de-gravacoes` foi escrito para acabar; (b) e (c) `abrir()` reescreve
       `assunto`/`corpo` em silêncio e o texto desaparece; (d) o separador fecha sem
       perguntar. Não há rascunho local: o texto não está em lado nenhum.
     Onde: src/app/[lang]/(site)/orcamento/admin/EmailTemplatesBilingue.tsx:203 (`const sujo
       = …`, calculado e usado só para desativar o botão na linha 457), :414 e :482 (as duas
       chamadas a `abrir` que descartam). Contraste directo: o irmão monolingue faz tudo isto
       — EmailTemplates.tsx:380-414 tem a inscrição no registo, com um comentário de 14 linhas
       a explicar porque é que este ecrã não pode ficar de fora.
     Causa provável: o ecrã bilingue foi acrescentado depois e não herdou nem a inscrição, nem
       o rascunho local, nem o `beforeunload` do irmão.
     Correção proposta: `useInscricaoNoRegisto({ nome: "Modelo bilingue «…»", porGravar: sujo,
       gravarJa: …, activo: !!modelo })`, com o mesmo desfecho `so-neste-computador` do irmão
       (depois de lhe dar um rascunho local); e `if (sujo && !confirm(...)) return;` antes dos
       dois `abrir()`.
     Chega ao cliente? não (mas o texto perdido é o que vai para clientes)

[A9-006] [Agente 9] [Carregamento (telemóvel)] [Grave] A sincronização falha em ciclo sem nunca o dizer, e sem forma de tentar outra vez
     Reproduzir: abrir a vista de carregamento com a sessão expirada (401) ou com as tabelas
       de material em baixo (500). Marcar itens.
     Esperado: saber que as marcações não estão a chegar, e um gesto para repetir.
     Observado: cada marcação chama `sincronizar()`, que falha e cai num `catch` que só diz
       «continua na fila; tenta-se outra vez à próxima». O cabeçalho mostra «N marcações
       guardadas para enviar» — uma frase de trânsito, não de avaria — e nada mais. Não há
       botão de repetir, não há temporizador: só o evento `online` e a marcação seguinte
       voltam a tentar, e com um 401 nenhum deles resolve. Ela acaba o carregamento e vai-se
       embora.
     Onde: src/app/[lang]/(site)/orcamento/admin/carregamento/[eventId]/Carregamento.tsx:
       133-157 (`sincronizar`, o `catch` de :152) e o cabeçalho em :254-262
     Causa provável: o `buscar()` do mesmo ficheiro tem o tratamento completo (estado `falha`,
       `AvisoDeFalha`, botão «tentar de novo») e está documentado em 25 linhas; o
       `sincronizar()`, que é o caminho de ESCRITA, ficou sem nada equivalente.
     Correção proposta: um estado `falhaDeEnvio` a par do `falha`; distinguir 401 (mostrar «a
       sessão caiu — volta a entrar») de 5xx; escrever no cabeçalho «N marcações POR ENVIAR —
       não fecharam» com um botão «Tentar agora»; e uma repetição com espera crescente
       enquanto houver fila.
     Chega ao cliente? não

[A9-007] [Agente 9] [Portal do casal] [Médio] A escolha do casal pode ficar «a enviar…» para sempre, sem mensagem e com os botões trancados
     Reproduzir: portal da proposta, secção das escolhas, com uma ligação que aceita o socket
       e não responde (3G a morrer, portal cativo). Carregar numa opção.
     Esperado: ao fim de alguns segundos, «Não foi possível guardar» com o «Tentar outra vez»
       — que já lá está e funciona bem para os outros casos.
     Observado: o `fetch` não tem tecto de tempo. `estado` fica em `"a-enviar"`, os dois
       botões dessa pergunta ficam `disabled` com `cursor-progress`, a linha `aria-live` fica
       vazia. Indefinidamente.
     Onde: src/app/[lang]/(privado)/proposta/[token]/Escolhas.tsx:113-118
     Causa provável: o resto da casa resolveu isto — `fetchComTecto` existe em DUAS versões
       (useGravacaoAutomatica.ts:150 e ProposalStudio.tsx:874), as duas com o comentário «uma
       rede que aceita a ligação e nunca responde deixa a gravação pendurada para sempre». O
       portal do cliente ficou de fora.
     Correção proposta: `signal: AbortSignal.timeout(10000)` no `fetch` — o `catch` que já
       existe faz o resto (repõe a marca anterior e mostra o «Tentar outra vez»).
     Chega ao cliente? sim

[A9-008] [Agente 9] [Portal do casal] [Médio] «Voltar a carregar as fotografias» não faz nada e não diz nada quando o servidor recusa
     Reproduzir: portal da proposta, deixar o separador aberto mais de 6 horas (os URLs
       assinados morrem), e carregar no botão de recarregar as fotos com o token já expirado
       ou a proposta fora de aberto → a rota devolve 404/410.
     Esperado: «Este link já não está válido — pede um novo à Líquen.»
     Observado: `if (!r.ok) return;` — o spinner pára, nada muda no ecrã, nada é dito. O botão
       continua lá a convidar a carregar outra vez, para o mesmo nada. (O `catch` de rede logo
       abaixo TEM comentário e é uma decisão defensável: fica o que está. O `!r.ok` não tem,
       e é outro caso.)
     Onde: src/app/[lang]/(privado)/proposta/[token]/Inspiracao.tsx:275-277
     Causa provável: o `!r.ok` foi escrito com o mesmo espírito do `catch` («fica o que
       está»), mas uma resposta de erro não é o mesmo que rede em baixo: aqui o servidor
       respondeu e tem um motivo para dar.
     Correção proposta: distinguir — 5xx/rede: manter o silêncio actual; 4xx: pôr uma frase
       por baixo do botão a partir do corpo da resposta.
     Chega ao cliente? sim

[A9-009] [Agente 9] [Modelos de email bilingues] [Médio] Histórico de versões que falhou a ler mostra-se como «ainda não há versões»
     Reproduzir: abrir o histórico de um modelo bilingue com a sessão expirada (401) ou a rota
       em baixo.
     Esperado: distinguir «não tem versões» de «não consegui perguntar» — a mesma regra que o
       `MaterialListas.tsx:60-71` documenta em detalhe.
     Observado: `setVersoes(r.ok ? … : [])` e `catch { setVersoes([]) }` — o painel abre
       vazio, e a leitura natural é que o modelo nunca foi alterado. Nesse estado o botão
       «reverter» desaparece, que é exactamente o gesto que ela procurava ao abrir o
       histórico.
     Onde: src/app/[lang]/(site)/orcamento/admin/EmailTemplatesBilingue.tsx:310-320
     Causa provável: o padrão `?? []` aplicado a uma leitura que pode falhar — o defeito de
       família já corrigido em três outros ecrãs desta pasta.
     Correção proposta: um terceiro estado (`versoes: VersaoDeModelo[] | null | "falhou"`) e o
       `AvisoDeFalha` que já existe na pasta.
     Chega ao cliente? não

[A9-010] [Agente 9] [Material — listas base] [Médio] Quantidade que não gravou fica na caixa a dizer que gravou
     Reproduzir: separador Material → Listas → abrir uma lista, mudar a quantidade de uma
       linha, e ter a rede a cair (ou a sessão expirada) nesse instante.
     Esperado: a caixa voltar ao valor que está no servidor, como já acontece quando se
       escreve texto que não é número.
     Observado: o toast diz «Não foi possível guardar» (bem) mas a caixa é NÃO CONTROLADA
       (`defaultValue`), o `recarregar()` não corre no caminho de falha, e o número novo fica
       lá até se recarregar a página. É, à letra, o defeito que o comentário três linhas acima
       descreve: «O ecrã ficava a dizer uma coisa e a base de dados outra» — corrigido para o
       texto inválido, não para a gravação falhada.
     Onde: src/app/[lang]/(site)/orcamento/admin/MaterialListas.tsx:344-364 (o `onBlur`) e
       :182-193 (`alterarLinha`, o `catch`)
     Causa provável: o `catch` do `alterarLinha` avisa mas não repõe, e quem chama não tem
       como saber que falhou (a função devolve `void`).
     Correção proposta: `alterarLinha` devolver `Promise<boolean>` e, no `onBlur`, `if
       (!(await alterarLinha(...))) e.target.value = String(l.qty);` (a caixa de «crítico» é
       controlada e já se repõe sozinha).
     Chega ao cliente? não (chega à carrinha: uma quantidade errada na checklist)

[A9-011] [Agente 9] [Quadro de pedidos] [Médio] «2 falhou(ram)» sem dizer quais, e a selecção é limpa na mesma
     Reproduzir: seleccionar 5 pedidos, aplicar um estado em lote (ou apagar em lote) com 2
       pedidos a falhar (401 a meio, conflito, 500).
     Esperado: saber QUAIS falharam e mantê-los seleccionados, para o gesto seguinte ser
       «tentar outra vez» e não «reconstruir a selecção de memória».
     Observado: toast «3 atualizado(s), 2 falhou(ram)» sem nomes, e `esquecerDaSeleccao(ids)`
       corre com TODOS os ids, incluindo os que falharam. A informação de quais falharam
       existe (é `ids` menos as chaves de `updated`) e é deitada fora na linha seguinte. Não
       há `log.` nenhum.
     Onde: src/app/[lang]/(site)/orcamento/admin/AdminClient.tsx:2411-2423 (`applyBulkStatus`)
       e :2450-2470 (`deleteSelected`)
     Causa provável: `esquecerDaSeleccao` foi escrito com o comentário certo («só os pedidos
       sobre que se acabou de agir») mas é chamado com o lote inteiro em vez de com os que
       correram bem.
     Correção proposta: `esquecerDaSeleccao([...updated.keys()])` (e `[...removed]` no
       apagar), nomear no toast os pedidos que ficaram de fora, e um `log.error` com os ids
       falhados.
     Chega ao cliente? não

[A9-012] [Agente 9] [Material — marcações] [Médio] Marcações ignoradas e em conflito voltam num 200 que ninguém lê
     Reproduzir: duas pessoas a marcar a mesma linha da checklist ao mesmo tempo (o caso que a
       própria rota diz ser «o caso normal desta tabela»), ou marcar um item que entretanto
       saiu da checklist.
     Esperado: quem marcou saber que a sua marcação não pegou.
     Observado: a rota devolve `{ok:true, aplicadas, ignoradas, conflitos}` — 200 com a
       contagem certa — e o cliente lê só `res.ok`, limpa da fila TUDO o que enviou (incluindo
       o que não foi aplicado) e reescreve os itens com a resposta do servidor. No ecrã, a
       linha volta ao estado anterior sem explicação. `conflitos` e `ignoradas` não são lidos
       em lado nenhum do cliente.
     Onde: rota src/app/api/orcamento/[id]/material/marcar/route.ts:156-162; cliente
       src/app/[lang]/(site)/orcamento/admin/carregamento/[eventId]/Carregamento.tsx:143-151
     Causa provável: a rota foi endurecida para não deitar o lote fora por causa de uma linha
       disputada (bem), mas o cliente nunca foi ensinado a ler o resultado dessa distinção.
     Correção proposta: `if (r.conflitos > 0 || r.ignoradas > 0)` mostrar no cabeçalho «N
       marcações não pegaram (outra pessoa marcou primeiro)».
     Chega ao cliente? não

[A9-013] [Agente 9] [Persistência (dev)] [Menor] Ficheiro de dados corrompido lê-se como tabela vazia e é reescrito por cima
     Reproduzir: em desenvolvimento (backend de ficheiro), truncar ou corromper um dos JSON de
       `db/`. Abrir o back office e gravar qualquer coisa.
     Esperado: pelo menos um `log.error` a dizer que o ficheiro não é legível.
     Observado: `catch { return [] }` mudo. O `list()` devolve vazio, o ecrã diz que não há
       nada, e a gravação seguinte escreve um array novo por cima do ficheiro estragado — o
       que lá estava por trás do erro de sintaxe desaparece de vez.
     Onde: src/lib/repository.ts:539-545
     Causa provável: o `catch` cobre dois casos que não são o mesmo — «o ficheiro ainda não
       existe» (normal) e «o ficheiro existe e não se lê» (avaria).
     Correção proposta: distinguir `ENOENT` do resto; no resto, `log.error("repository:
       ficheiro ilegível", err, {file})` e recusar a escrita seguinte (o `assertWritableInProd`
       já mostra o padrão).
     Chega ao cliente? não (só desenvolvimento)

[A9-014] [Agente 9] [Passkeys] [Menor] não confirmado — `AbortError` de rede confundido com «a pessoa cancelou»
     Reproduzir: no painel de sessão expirada, «Entrar com este dispositivo» com o pedido a
       ser abortado por outra razão que não o utilizador (cerimónia rearmada pelo temporizador
       do autofill, aba a perder o foco).
     Esperado: uma frase, ou pelo menos um registo.
     Observado: `mensagemDeErro` devolve `null` para `AbortError` e `NotAllowedError` — a
       decisão está escrita e está certa para o cancelamento humano — e o chamador faz `if
       (msg) setErro(msg)`. Se o `AbortError` vier de outro sítio, o botão pára e não acontece
       nada. Não foi possível produzir o caso com o código à frente; fica registado como
       suspeita.
     Onde: src/lib/passkeys-cliente.ts:60-71 e
       src/app/[lang]/(site)/orcamento/admin/SessaoExpirada.tsx:255-257
     Causa provável: o nome do erro do WebAuthn e o do `AbortController` são o mesmo, e não há
       forma de os distinguir só pelo `name`.
     Correção proposta: um `log.warn` no ramo do `null` (mesmo sem mostrar nada à pessoa),
       para o caso deixar rasto se acontecer.
     Chega ao cliente? não

---

## Onde NÃO há defeito (para não voltarem lá)

Verificados e considerados decisões deliberadas e bem escritas, não bugs: os 116 `catch`
vazios comentados; toda a cadeia `useGravacaoAutomatica` + `registo-de-gravacoes` +
`GuardarTudo` (incluindo o `void gravarPendente.current()` da desmontagem e o `Promise.all`
com `try/catch` por item); `proposal-storage.fetchProposalImageBytes` (regista a foto que vai
faltar no PDF); `CriarAPartirDe`, `MaterialListas`, `Material`, `MaterialRegras`, `Overview`,
`AdminClient.saveQuote`, `DossierClient.gravarEntradas`, `Carregamento.buscar`; a telemetria
toda (`WebVitals`, `MetaPixel`, `LeadSourceCapture`, `tempo-activo`, `logger`), que engole de
propósito e diz porquê.

Uma nota de arquitectura que vale mais do que qualquer dos itens acima:
**`useGravacaoAutomatica` não é usado por nenhum ecrã de produção** — só por testes (`grep`
confirma). Os cinco ecrãs que gravam sozinhos inscrevem-se no registo à mão. É exactamente o
que a «NOTA DE MIGRAÇÃO» do ficheiro prevê, mas significa que a garantia «quem usar a cadeia
normal fica inscrito sem ter de se lembrar disso» ainda não vale — e o A9-005 é a primeira
consequência disso a chegar ao ecrã.
