# Agente 10 — Integrações

O caminho do envio está invulgarmente bem pensado — a proposta grava antes do email, o estado
só sobe depois de o correio ser aceite, e há trava contra o dedo duas vezes no botão. **O que
falha é o meio-caminho depois do email:** das três escritas que acontecem a seguir ao
`sendMail`, duas falham em silêncio e a terceira, quando falha, pede-lhe por escrito que
reenvie — e reenviar manda um segundo email ao casal. Do lado do PDF, o orçamento de tempo
medido em `custo-do-pdf.ts` não cabe nos `maxDuration` declarados quando o armazenamento está
pendurado, e é exactamente aí que a decisão de servir incompleto deixa de valer para alguma
coisa.

| Integração | Quando falha, o que acontece | Ela perde trabalho? | Ela fica a saber? |
|---|---|---|---|
| **SMTP em baixo / credenciais** | Proposta gravada em `rascunho`, `emailed:false`, botão não marca «enviada» | Não | Sim, com a frase certa |
| **SMTP lento (pendurado)** | Cortes aos 8/8/20 s; se a função morrer aos 60 s, nada se sabe do email | Não (o desenho, sim: 40 s) | Só «demorou demasiado» — e o conselho está errado |
| **Email SAI, estado não grava** | Proposta fica `rascunho`; a frase manda reenviar → **segundo email ao casal** | Não | Sim, mas o conselho provoca o defeito |
| **Email SAI, cópia do envio não grava** | Perde-se «o que é que nós lhes escrevemos» | Sim (o registo) | **Não** — só um `log.error` |
| **Email SAI, pedido não actualiza** | Sem «Proposta enviada» no Quadro, sem `quotedPrice` → margem e proposta seguinte erradas | Sim (o preço) | **Não** — só um `log.error` |
| **Endereço inválido / vazio** | Não se tenta enviar; proposta gravada, link serve | Não | Sim |
| **Anexo grande demais** | O servidor do cliente recusa → erro genérico «o email ao cliente falhou» | Não | Sim, mas sem diagnóstico |
| **Devolução (bounce) depois de aceite** | Proposta «enviada» para sempre; Acompanhamento conta dias | Não | **Não** |
| **PDF: geração a meio / timeout** | 504 sem corpo; nada gravado (o desenho é antes da gravação) | Não | Sim, com um conselho que a leva a tirar fotos por nada |
| **Storage indisponível (pendurado)** | 24,5 s por foto; link do casal (20 s) morre sem corpo | Não | **Não** — nem ela nem o casal |
| **Storage: ficheiro em falta** | Falha rápida, conta como foto em falta, segundo desenho, aviso antes do envio | Não | Sim |
| **BD: ligação perdida antes do envio** | 503 «Não foi possível guardar»; email não sai | Não (rascunho no `app_state` + cópia local) | Sim |
| **BD: linha apagada durante o envio** | `updateProposal` devolve `null` calado → email com link morto | Sim (a proposta inteira) | **Não** |

## Os três que já eram conhecidos — verificação

- **`servirIncompleto`**: mal resolvido no registo, e pior no efeito prático. Ver **A10-006**.
- **Cache em memória do processo**: confirmada e correcta. `proposal-pdf-cache.ts:39-42` di-lo,
  o tecto é por bytes (`:47`), o LRU está certo e a falta nunca é guardada. Nada a apontar.
- **PDF gerado duas vezes (email + link)**: confirmado e agora **quadruplicado** no mau dia — o
  envio pode desenhar duas vezes (`proposta-doc/route.ts:318` e `:358`) e o link do casal
  outras duas (`proposal-pdf-cache.ts:156` e `:163`). O desperdício conhecido deixou de ser 2×
  e passou a 4×.

---

[A10-001] [Agente 10] [Envio de email + base de dados] [Crítico] O email sai, o estado não grava, e a frase manda-a reenviar — o casal recebe duas propostas
     Reproduzir: 1) enviar uma proposta pelo Estúdio com o SMTP a funcionar;
                 2) fazer a segunda escrita falhar (a linha `proposals` apagada noutro
                    separador entre o envio e a marcação, um erro transitório da base, ou a
                    função morta aos 60 s logo a seguir ao `sendMail`);
                 3) ler o toast: «O email seguiu para o cliente, mas a proposta ficou marcada
                    como “por enviar” … Reenvia-a para acertar o estado (é a mesma proposta,
                    não se cria outra)»;
                 4) fazer o que a frase manda: carregar em Enviar outra vez.
     Esperado: reenviar acerta o estado sem voltar a escrever ao casal, ou a frase diz-lhe que
               o cliente JÁ recebeu e oferece outra coisa que não seja reenviar.
     Observado: a trava de repetição (`jaSeguiu`) exige `p.status === "enviada"` — que é
                precisamente o que não ficou gravado. O segundo envio não é reconhecido como
                repetição, o `sendMail` corre outra vez, e o casal recebe dois emails com o
                mesmo documento e o mesmo link. A frase que ela lê é a que provoca o defeito.
     Onde: src/app/api/orcamento/[id]/proposta-doc/route.ts:643-651 (a trava,
           `p.status === "enviada"`), :1127-1140 (a segunda escrita e o conselho),
           src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:4988-4993
     Causa provável: a repetição é reconhecida pelo ESTADO da proposta, não pelo facto do
                     envio. E o facto do envio EXISTE e está gravado uma linha antes: o
                     `registarEnvio` escreve `enviadoEm` + `propostaId` em `app_state`
                     (`envios-de-proposta.ts`) ANTES do `updateProposal`. A trava não o
                     consulta.
     Correção proposta: alargar `jaSeguiu` a «esta proposta consta dos envios registados há
                        menos de JANELA_DE_REPETICAO_MS», lendo `enviosDoPedido(id)` — apanha
                        exactamente o caso em que o estado não subiu. Em alternativa (ou além
                        disso), trocar o conselho por «não reenvies: o cliente já recebeu» e
                        dar-lhe um botão que só acerta o estado.
     Chega ao cliente? sim — dois emails com a mesma proposta.

[A10-002] [Agente 10] [Base de dados / envio] [Crítico] A gravação da proposta não é verificada: o email segue com um link para uma proposta que não existe
     Reproduzir: 1) tentar enviar uma proposta e falhar o email (SMTP em baixo) — fica uma
                    proposta em `rascunho`;
                 2) noutro separador, no quadro «Propostas», apagar essa linha por enviar
                    (DELETE /api/propostas/[id]);
                 3) no primeiro separador, corrigir e carregar em Enviar. O reaproveitamento
                    (`porEnviar`) foi lido no princípio do pedido, e entre essa leitura e a
                    gravação passam os 15–40 s do desenho do PDF.
     Esperado: se a linha a actualizar já não existe, cria-se uma nova ou recusa-se o envio —
               nunca se manda um email com um link morto.
     Observado: `guardar()` faz `updateProposal(p.id, p)`, que devolve `null` sem lançar
                quando a linha desapareceu (`repository.updateWith`: «const current = await
                backend.get(id); if (!current) return null»). O valor de retorno é ignorado,
                `docSaved` fica `true`, o email segue com `acceptUrl` assinado sobre um id
                inexistente, e o casal abre a página e recebe «proposta não encontrada». A
                resposta ao Estúdio diz `ok:true, emailed:true`.
     Onde: src/app/api/orcamento/[id]/proposta-doc/route.ts:683-686 (`const guardar = …`,
           `await guardar(proposal)` sem verificação)
           src/lib/repository.ts:676-679 (o `return null`)
           src/lib/proposals-store.ts:125-126
           E o mesmo na rota irmã, onde o comentário promete o contrário — «A persistence
           failure here is fatal — we do not send an un-acceptable proposal»:
           src/app/api/orcamento/[id]/proposta/route.ts:360-373
     Causa provável: `createProposal` devolve `void` e `updateProposal` devolve
                     `Proposal | null`; ao unificarem-se num `Promise<unknown>` o `null` deixou
                     de se poder ver. A rota já sabe fazer isto bem 440 linhas abaixo
                     (`if (!gravado) throw new Error(…)`, :1129) — falta aqui.
     Correção proposta: `const gravado = await guardar(proposal); if (porEnviar && !gravado) { … }`
                        — e, em vez de recusar, cair para `createProposal` com o mesmo objecto
                        (a linha antiga já não existe, portanto não há duplicado a criar). É a
                        correcção que mantém a regra da casa: uma proposta que não sai é um
                        negócio parado.
     Chega ao cliente? sim — recebe o email e um link que dá «não encontrada».

[A10-003] [Agente 10] [Base de dados] [Grave] Depois do email, duas das três escritas falham em silêncio
     Reproduzir: 1) enviar uma proposta com o SMTP a funcionar;
                 2) fazer falhar o `registarEnvio` (a linha `app_state` do pedido recusada,
                    chave grande demais) e/ou o `updateQuoteWith` (conflito ao fim de três
                    tentativas — `ConflictError` — ou a base a cair no fim do pedido);
                 3) ver a resposta e o ecrã.
     Esperado: uma escrita que não aconteceu tem de sair pelo nome, como o `docError` e o
               `estadoError` já saem.
     Observado: as duas caem em `log.error` e mais nada. A resposta é
                `{ok:true, emailed:true, estado:"enviada"}` e o toast é «Proposta enviada ao
                cliente». Consequências concretas:
                · sem `registarEnvio`, a pergunta «o que é que nós lhes escrevemos?» fica sem
                  resposta em lado nenhum — o modelo é só o ponto de partida e o rascunho é o
                  documento, não o email (está escrito em envios-de-proposta.ts:14-24);
                · sem `updateQuoteWith`, o pedido não avança para «Proposta enviada» no Quadro
                  (sai da coluna onde ela ia dar por ele) e o `quotedPrice` não grava — e é
                  dele que vivem a margem do evento e a proposta seguinte.
                Três escritas depois do correio, uma delas conta, duas calam-se.
     Onde: src/app/api/orcamento/[id]/proposta-doc/route.ts:1106-1125 (registarEnvio),
           :1191-1212 (updateQuoteWith, `catch` a registar e mais nada), :1227-1260 (a
           resposta, que não os menciona)
           Irmã: src/app/api/orcamento/[id]/proposta/route.ts:508-510
     Causa provável: as duas foram declaradas «melhor esforço» porque não podem deitar abaixo
                     um envio que já aconteceu — o que está certo. O que ficou por fazer foi a
                     segunda metade: melhor esforço que falha tem de ser DITO, como a rota faz
                     nos outros dois campos.
     Correção proposta: acrescentar `copiaError` e `pedidoError` à resposta, com o mesmo
                        desenho do `estadoError` (só viajam quando falham), e mostrá-los no
                        toast em vez de os deixar debaixo do «Proposta enviada ao cliente».
     Chega ao cliente? não — mas o preço e o histórico do lado de cá ficam errados.

[A10-004] [Agente 10] [Storage / geração de PDF] [Grave] Armazenamento pendurado: uma fotografia sozinha gasta 24,5 s e mata as duas rotas
     Reproduzir: com o Supabase Storage a aceitar a ligação e a não responder (não «ficheiro
                 apagado», que falha depressa):
                 1) abrir o link da proposta no telemóvel e carregar em «VER A PROPOSTA
                    COMPLETA (PDF)»;
                 2) cronometrar.
     Esperado: ao fim de poucos segundos, um erro que se perceba — ou o PDF.
     Observado: `descarregar` faz 3 tentativas de 8 s com pausas de 150 e 300 ms = 24,45 s
                para UMA fotografia. A rota declara `maxDuration = 20`. Como a foto acaba por
                contar como «em falta», o `pdfDaPropostaEmCache` desenha o documento uma
                SEGUNDA vez, o que repete os 24,45 s. Ou seja: a função é morta muito antes de
                chegar à decisão de servir incompleto, e o que o casal vê é o botão que não faz
                nada — exactamente a avaria que o `servirIncompleto` foi escrito para acabar.
                No envio (60 s) a conta é 2×24,45 s + SMTP: morre também, mas antes da
                gravação, portanto não fica lixo — só 50 s do tempo dela.
     Onde: src/lib/proposal-storage.ts:688-732 (TENTATIVAS=3, TEMPO_POR_TENTATIVA_MS=8000)
           src/lib/proposal-pdf-cache.ts:156-164 (o segundo desenho)
           src/app/api/proposta/[token]/pdf/route.ts:13 (maxDuration=20)
           src/lib/custo-do-pdf.ts:198-209 (o modelo medido, que só conta 300–600 ms por foto —
           o caso pendurado não está no modelo)
     Causa provável: o tecto por tentativa foi escolhido contra o caso «uma foto lenta» (8 s é
                     generoso para uma fotografia) e não contra o caso «o armazenamento não
                     responde a nenhuma». Não há orçamento GLOBAL de tempo: nem a resolução das
                     imagens nem o segundo desenho sabem quanto já foi gasto.
     Correção proposta: um prazo para o desenho inteiro, passado ao
                        `renderStoredProposalDocPdfWithReport` (ex.: 70% do `maxDuration` da
                        rota), que corta as tentativas e devolve o que houver; e não repetir o
                        desenho quando o tempo gasto já passa de metade do orçamento. Assim o
                        `servirIncompleto` volta a ter hipótese de acontecer, que é o que a
                        decisão dela pede.
     Chega ao cliente? sim — o botão do link não faz nada, sem explicação.

[A10-005] [Agente 10] [Envio de email / tempo] [Grave] O orçamento do envio não cabe nos 60 s, e a morte a meio do SMTP é a pior das saídas
     Reproduzir: proposta de 80 fotografias (o tecto, MAX_IMAGES_PER_DOC), num dia mau de
                 armazenamento, com uma foto a não resolver à primeira. Carregar em Enviar.
     Esperado: a rota cabe no tempo que declara, ou pára antes com uma frase.
     Observado: a aritmética do próprio repositório: 14 a 20 s por desenho
                (custo-do-pdf.ts:204), DOIS desenhos quando falta uma foto (route.ts:318 e
                :358) = 28 a 40 s; mais o SMTP, que pode gastar 8 s de ligação + 8 s de saudação
                + 20 s de socket (mail.ts:52-54) a transportar ~11 MB de anexo codificado.
                40 + 28 = 68 s contra um `maxDuration` de 60.
                Quando a função morre a meio do SMTP, o servidor de correio pode ter aceitado a
                mensagem: o casal recebe, a proposta fica em `rascunho`, não há cópia do envio,
                e o Estúdio mostra `porqueFalhouOEnvio(504)` — «tenta outra vez; se voltar a
                acontecer, tira algumas fotos dos mood boards». Se ela tentar outra vez, cai-se
                no A10-001: segundo email.
                Nota: o aviso do Estúdio afirma «O PDF do envio sai na mesma (tem mais tempo)»
                — é essa afirmação que não se sustenta.
     Onde: src/app/api/orcamento/[id]/proposta-doc/route.ts:116, :318, :358
           src/lib/mail.ts:52-54
           src/app/[lang]/(site)/orcamento/admin/porque-falhou-o-envio.ts:20-26
           src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:9899-9910
     Causa provável: o `orcamentoDeTempo` só foi escrito contra o tecto de 20 s das rotas do
                     casal (custo-do-pdf.ts:212-213). O tecto de 60 s do envio nunca foi
                     orçamentado — e é o único que tem, além do desenho, um segundo desenho e
                     uma conversa SMTP.
     Correção proposta: (a) medir o tempo já gasto antes de decidir repetir o desenho, e não
                        repetir quando não sobra orçamento para o email; (b) fazer o
                        `orcamentoDeTempo` responder também para o envio (2×desenho + tecto do
                        SMTP contra 60 s) e acender o aviso do Estúdio nessa conta; (c) descer
                        o `socketTimeout` para caber no que resta.
     Chega ao cliente? sim, e da pior maneira: pode receber sem que se saiba.

[A10-006] [Agente 10] [Geração de PDF] [Médio] O PDF servido INCOMPLETO deixa rasto só no registo — e nunca é guardado, por isso volta a desenhar-se duas vezes a cada abertura
     Reproduzir: 1) enviar uma proposta; 2) apagar do bucket uma foto de mood board; 3) abrir
                 o link do casal e carregar no botão do PDF.
     Esperado: (verificação do item conhecido) o casal recebe o documento — está certo, é
               decisão dela — e ELA fica a saber que o que foi servido ia com buracos.
     Observado: fica um `log.error("proposta-pdf: servido INCOMPLETO …")` e mais nada. Não há
                nada no back office que o mostre; o alerta só chega se `SENTRY_DSN` ou
                `ERROR_WEBHOOK_URL` estiverem definidos (logger.ts:168-260) — e mesmo aí não é
                o ecrã dela. A resposta ao casal não leva cabeçalho nenhum a dizê-lo (o
                `X-Fotos-Em-Falta` existe na pré-visualização do Estúdio e não aqui).
                A verificação PRÉ-envio (`proposta-fotos-verificacao.ts`), que o comentário
                aponta como o novo destinatário do aviso, só apanha o que já falta ANTES de
                enviar — não o que desaparece depois, que é o caso em que isto dispara.
                E há um segundo efeito: o incompleto não entra na cache (o que está certo em
                princípio), portanto CADA abertura repete os DOIS desenhos — ver A10-004, onde
                isso passa do tecto da rota.
     Onde: src/lib/proposal-pdf-cache.ts:187-195
           src/app/api/proposta/[token]/pdf/route.ts:88-90
           src/app/api/portal/[token]/proposta-pdf/route.ts:91
     Causa provável: o aviso mudou de destinatário (do casal para ela, antes do envio) mas não
                     ganhou um sítio onde ela o veja quando o acontecimento é posterior ao
                     envio.
     Correção proposta: escrever o facto onde ela olha — uma marca no pedido («o casal abriu um
                        documento com N fotos em falta») ou uma linha no diagnóstico de fotos,
                        que já existe (`/api/admin/fotos-diagnostico`). O registo continua.
     Chega ao cliente? sim — recebe o documento com molduras vazias, sem saber.

[A10-007] [Agente 10] [Envio de email] [Médio] O servidor nunca compara o PDF com o limite de anexo que já tem escrito
     Reproduzir: montar uma proposta cujo PDF real passe dos 8 MB (o `LIMITE_DE_ANEXO`) —
                 fácil com fotografias grandes que a recta de estimativa subavalie — e enviar
                 para uma caixa com tecto de 10 MB.
     Esperado: ou se recusa antes de gastar o desenho, com a frase que o repositório já sabe
               escrever, ou se explica depois com o motivo certo.
     Observado: `LIMITE_DE_ANEXO` e `passaDoAnexo` só são usados no ecrã, sobre uma ESTIMATIVA
                (ProposalStudio.tsx:9867). O servidor tem o `pdfBuffer.byteLength` na mão
                (usa-o para o `pdfBytes` e para o selo) e nunca o compara com nada. Quando o
                servidor do cliente recusa, o `sendMail` atira e o que ela lê é «A proposta foi
                guardada, mas o email ao cliente falhou» — a mesma frase de umas credenciais
                erradas. Reenviar dá o mesmo, e custa outro desenho.
     Onde: src/app/api/orcamento/[id]/proposta-doc/route.ts:1036-1057
           src/lib/custo-do-pdf.ts:60, :161-163
     Causa provável: o limite nasceu como aviso de interface e ficou só lá.
     Correção proposta: no envio, `if (passaDoAnexo(pdfBuffer.byteLength))` devolver o motivo
                        específico no `emailError` (e o link, que serve na mesma com o PDF
                        inteiro do outro lado — é o que o próprio aviso do ecrã já diz).
     Chega ao cliente? não — e ela não sabe porquê.

[A10-008] [Agente 10] [Envio de email] [Médio] «Enviada» quer dizer «o relay aceitou»: uma devolução posterior é invisível
     Reproduzir: enviar para um endereço sintacticamente válido mas inexistente (`a@b.co`
                 passa na expressão regular). O relay aceita, devolve mais tarde.
     Esperado: o sistema distingue «aceite para entrega» de «entregue», ou pelo menos não fica
               a contar dias por uma resposta impossível.
     Observado: `sendMail` devolve `{sent:true}` assim que o `transport.sendMail` resolve, sem
                olhar para `info.rejected` nem para a resposta do servidor. A partir daí a
                proposta é «enviada», o Acompanhamento persegue-a, a análise conta-a. Não há
                tratamento de devoluções em lado nenhum do repositório (nenhum webhook, nenhuma
                caixa de retorno). Na prática a devolução cai na caixa do `SMTP_USER`, que é
                humana — mas o ESTADO do sistema fica errado para sempre.
                O caso `info.rejected` com um destinatário só é teórico: **não confirmado**.
     Onde: src/lib/mail.ts:128-138
           src/app/api/orcamento/[id]/proposta-doc/route.ts:1012 (a regra do endereço)
     Causa provável: a fronteira do `sendMail` é o SMTP, e mais nada foi pedido.
     Correção proposta: mínimo honesto — ler `info.rejected`/`info.response` e devolver
                        `{sent:false}` quando o destinatário foi recusado. E, no ecrã, dizer
                        «entregue ao servidor de correio» em vez de «enviada ao cliente», que é
                        a única coisa que se sabe.
     Chega ao cliente? não — e o sistema jura que sim.

[A10-009] [Agente 10] [Estúdio / mensagens] [Médio] «No PDF que seguiu…» aparece mesmo quando nada seguiu, e engole o aviso mais grave
     Reproduzir: (a) enviar com uma foto em falta E o SMTP em baixo;
                 (b) enviar com uma foto em falta E a segunda escrita a falhar.
     Esperado: (a) «o email NÃO saiu»; (b) o `estadoError`, que é o mais grave.
     Observado: o ramo `if (aviso)` é o primeiro e ganha a tudo. Em (a) ela lê «No PDF que
                seguiu, falta 1 foto. Verifica a proposta e reenvia» — quando não seguiu PDF
                nenhum e o casal não recebeu nada. Em (b) o `estadoError` nunca é mostrado. O
                passo não é marcado como feito (isso está certo), mas a frase que fica no ecrã
                afirma o contrário do que aconteceu.
     Onde: src/app/[lang]/(site)/orcamento/admin/ProposalStudio.tsx:4985-5012
     Causa provável: a prioridade («o documento incompleto é o aviso mais importante dos três»)
                     foi escrita antes de haver um quarto e um quinto desfecho.
     Correção proposta: decidir primeiro por `saiu`, e só depois pelo conteúdo: sem envio, a
                        frase é a do email; com envio, junta-se o aviso do conteúdo ao
                        `estadoError` em vez de o substituir.
     Chega ao cliente? não — mas ela pode ficar convencida de que sim.

[A10-010] [Agente 10] [Storage / tempo] [Menor] A escrita da derivada da capa está no caminho crítico de uma rota de 20 s
     Reproduzir: primeira geração de uma proposta cuja capa venha da Biblioteca de Temas (sem
                 derivada ainda), com o Storage lento nas escritas.
     Esperado: uma optimização para a PRÓXIMA geração não faz esperar esta.
     Observado: `await uploadProposalCover(ref, derivada)` — a função é defensiva (5 s de
                tecto, nunca lança, devolve `false`), mas o `await` está no caminho de
                resolução da capa. São duas tiras, logo até 10 s dentro de uma rota que morre
                aos 20. O comentário ao lado diz «o único custo extra é a escrita, que é melhor
                esforço e tem tecto de tempo» — verdade quanto ao risco de falhar, não quanto
                ao tempo.
     Onde: src/lib/proposal-doc-render.ts:320-327
           src/lib/proposal-storage.ts:990-1022
     Causa provável: a escrita foi encaixada onde os bytes já estavam à mão.
     Correção proposta: não esperar por ela — `void uploadProposalCover(...)` com o `catch` que
                        já lá está dentro, ou fazê-la depois de o PDF estar desenhado. Os bytes
                        devolvidos são os mesmos.
     Chega ao cliente? não (só torna A10-004 mais provável).

[A10-011] [Agente 10] [Envio de email] [Menor] SMTP não configurado: a rota irmã não diz o motivo (a do Estúdio diz)
     Reproduzir: sem SMTP_HOST/USER/PASS, criar uma proposta pelo construtor
                 (`POST /api/orcamento/[id]/proposta`) com um email de cliente válido.
     Esperado: a mesma frase da rota do Estúdio — «Envio de email não configurado.»
     Observado: `sendMail` devolve `{sent:false}` sem atirar, portanto `envioFalhou` fica
                `false` e `temDestinatario` fica `true`: a resposta sai com `emailed:false` e
                SEM `emailError`. O ecrã salva-se pelo texto de recurso («Descarrega o PDF e
                envia-o à mão»), que por acaso é o certo para este caso — mas o comentário do
                ecrã afirma que o servidor distingue as três avarias, e não distingue.
     Onde: src/app/api/orcamento/[id]/proposta/route.ts:441-449, :512-531 (contrastar com
           proposta-doc/route.ts:1052-1053)
     Causa provável: o embrulho `try/catch` foi copiado da rota irmã; o ramo do `{sent:false}`
                     sem excepção não veio com ele.
     Correção proposta: `if (!mail.sent && !envioFalhou) emailError = "Envio de email não
                        configurado."`.
     Chega ao cliente? não.

[A10-012] [Agente 10] [Geração de PDF] [Menor] `PropostaIncompleta` já não pode ser lançada por nenhum dos dois chamadores que a apanham
     Reproduzir: leitura. As duas únicas rotas que fazem `catch (err) { if (err instanceof
                 PropostaIncompleta) … 503 }` chamam `pdfDaPropostaEmCache(doc, idioma, true)`
                 — com `servirIncompleto`.
     Esperado: código morto identificado como tal, ou um chamador que o use.
     Observado: o ramo do 503 com `Retry-After` nunca corre. O comentário do
                `proposal-pdf-cache` diz que «a recusa continua a ser a regra onde ela foi
                pedida — o ANEXO DO EMAIL», mas o anexo do email não passa por esta função
                (chama o renderizador directamente, proposta-doc/route.ts:318). Ou seja, hoje
                NENHUM caminho usa `servirIncompleto = false`.
     Onde: src/lib/proposal-pdf-cache.ts:119, :196-199, :213-218
           src/app/api/proposta/[token]/pdf/route.ts:106-124
           src/app/api/portal/[token]/proposta-pdf/route.ts:118-123
     Causa provável: a decisão mudou nas rotas e o parâmetro (e a excepção) ficaram para trás.
     Correção proposta: nenhuma urgente — mas vale um comentário a dizer que o `false` está lá
                        para o dia em que o anexo do email passe pela cache, ou tirar o
                        parâmetro e a classe.
     Chega ao cliente? não.

---

## O que não tem defeito nenhum e vale a pena dizer

A cadeia de assinatura do email degrada bem (uma imagem em falta em `public/email` não parte o
envio — `email-assinatura.ts:225-231`); o `descarregar` do Storage tem tecto e três tentativas;
o rascunho do Estúdio distingue «guardado», «guardado num sítio que não dura» e «só local»,
com repetição e frase própria (`ProposalStudio.tsx:806-930`) — é o melhor tratamento de escrita
perdida do repositório; a chave `anon` que devolveria listas vazias em silêncio está
identificada e nomeada (`supabase.ts:papelDaChaveSupabase`); e a validação do destinatário
recusa injecção de cabeçalhos (a expressão regular não deixa passar espaços nem um segundo `@`).
