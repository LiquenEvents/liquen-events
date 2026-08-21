# Agente 7 — Permissões e segurança

**Sete achados: 1 Grave, 3 Médios, 3 Menores. Nenhum expõe os dados de um cliente a OUTRO
cliente — a fronteira entre casais aguenta em todos os caminhos percorridos.** O pior é o
A7-001: a página pública da proposta serializa, no HTML que o casal recebe, o objecto inteiro
das «alternativas» — e com ele os caminhos reais do armazenamento (a taxonomia da Biblioteca
de Temas e o id interno do pedido), coisa que o próprio `proposta-fotos.ts` proíbe por
escrito, em maiúsculas, três parágrafos acima. A seguir a esse, o que mais preocupa não é um
buraco: é que o link da proposta **não é revogável por desenho** e que a auditoria de guardas
prende ficheiros mas não métodos.

---

[A7-001] [Agente 7] [Proposta viva — página do casal] [Grave] Os caminhos do armazenamento saem no HTML da página da proposta
     Reproduzir:
       1. No estúdio, criar uma proposta com uma escolha («duas paletas») com ≥2 opções
          prontas, e pôr fotografia em cada opção — uma importada da Biblioteca de Temas,
          outra da pasta do pedido.
       2. Enviar. Abrir `/[lang]/proposta/<token>` como o casal.
       3. Ver o código-fonte da página (ou `curl` ao endereço) e procurar `"imagem"`.
          Aparece, dentro do payload RSC (`self.__next_f.push`),
          `"imagem":"tema:<nome-da-pasta>/<ficheiro>.jpg"` e
          `"imagem":"<LIQ-...-id-do-pedido>/<uuid>.jpg"`.
     Esperado: nada do que sai para o browser do casal é um caminho de bucket. É a Regra 1
       escrita em `proposta-fotos.ts`: «O que sai daqui NUNCA é um caminho de bucket. Nem no
       valor, nem na CHAVE», porque `tema:outono-quente/ab12.jpg` «entrega os nomes das
       pastas da Biblioteca — a taxonomia do activo do estúdio, à borla». As fotografias dos
       mood boards cumprem isto à risca: só o id opaco `b0f2` atravessa.
     Observado: `Escolhas` é um componente `"use client"`, e o Next serializa TODAS as props
       de um componente de cliente para dentro do HTML — usadas ou não. `Documento.tsx:804`
       passa-lhe `escolhas={escolhas}`, que é o resultado de `escolhasParaOCasal`, e essa
       função faz `{...e}` do objecto inteiro (`proposta-escolhas.ts:132`), incluindo
       `OpcaoDeEscolha.imagem` (`proposta-escolhas.ts:74`) — a referência crua ao
       armazenamento. O componente NEM SEQUER a usa: desenha as fotos por
       `fotos[`e${i}o${j}`]`, o mapa de ids opacos (`Escolhas.tsx:171`). O caminho viaja para
       o browser sem ninguém o querer lá.
     Onde:
       src/app/[lang]/(privado)/proposta/[token]/Documento.tsx:411, 804-811
       src/lib/proposta-escolhas.ts:74, 131-136
       src/app/[lang]/(privado)/proposta/[token]/Escolhas.tsx:1, 45, 171
       (a regra que isto quebra: src/lib/proposta-fotos.ts:22-42)
     Causa provável: a Fase 3 (as escolhas) foi montada depois da disciplina das fotografias
       e não passou pela mesma projecção. Os mood boards têm uma redução explícita para ids
       opacos (`Documento.tsx:378-402`); as escolhas passam o objecto do documento tal e
       qual, e o `{...e}` é o sítio exacto onde a fuga entra.
     Correção proposta: projectar as escolhas antes da fronteira, como já se faz com os
       boards. `Escolhas` só precisa de `{ id, opcoes: [{ id }] }` — tudo o resto já lhe
       chega traduzido em `emLingua`, e as fotos já lhe chegam por id opaco. Uma função
       `escolhasParaEcra()` ao lado de `escolhasParaOCasal()`, e um teste do género do
       `notas-internas-ficam-em-casa` a afirmar que o objecto entregue ao componente de
       cliente não tem `imagem` nem `/` em valor nenhum. Vale a pena generalizá-lo: um teste
       que percorra as props de cada componente `"use client"` desta rota e recuse `tema:` e
       a forma `<algo>/<algo>.jpg`.
     Chega ao cliente? sim — está no HTML que o casal abre, e vai com a página quando ele a
       guarda ou a reencaminha. Não revela dados de outro casal; revela o id interno deste
       pedido e os nomes das pastas do estúdio.

[A7-002] [Agente 7] [API — auditoria de guardas] [Médio] A auditoria prende ficheiros, não métodos: dois métodos escapam-lhe
     Reproduzir:
       1. Listar os métodos exportados de cada `route.ts`:
          `grep -oE "^export (async )?function (GET|POST|PUT|PATCH|DELETE)"`.
       2. Comparar com a tabela ADMIN + a lista NON_ADMIN do `auth-guard-audit.test.ts`.
       3. Sobram: `POST /api/orcamento/[id]` e `GET /api/orcamento/[id]/proposta-doc`.
     Esperado: o mesmo que o teste de completude promete — «uma rota nova falha aqui até ser
       classificada». A promessa devia valer por MÉTODO, que é a unidade onde a guarda vive.
     Observado: o `walk()` do teste de completude junta nomes de FICHEIRO
       (`entry.name === "route.ts"`) e compara-os com um `Set` de caminhos. Um ficheiro já
       coberto por um método passa a cobrir todos os outros. Os dois métodos acima têm
       `isAuthed` hoje (verificado: `route.ts:576` e `proposta-doc/route.ts:71`) — não há
       buraco aberto. O que não existe é o que prende. O `POST /api/orcamento/[id]` semeia a
       produção e gera o evento (escreve); o `GET .../proposta-doc` CUNHA UM TOKEN DE
       PROPOSTA novo e devolve o link do casal — sem guarda, era uma fábrica de links de
       acesso a propostas a quem soubesse um id de pedido.
     Onde:
       src/app/api/auth-guard-audit.test.ts:656-739 (o walk por ficheiro)
       src/app/api/auth-guard-audit.test.ts:477 (só PATCH/DELETE listados)
       src/app/api/auth-guard-audit.test.ts:495 (só POST listado)
       src/app/api/orcamento/[id]/route.ts:575-577
       src/app/api/orcamento/[id]/proposta-doc/route.ts:70-73
     Causa provável: a tabela é `{ path, methods[] }` mas a completude só sabe ler `path`.
       Quem acrescentou o `POST` de «prever/gerar» e o `GET` do link não teve nada a ficar
       vermelho.
     Correção proposta: no teste de completude, ler os métodos exportados de cada ficheiro (a
       mesma regex do passo 1, ou um `import()` e `Object.keys`) e exigir que CADA par
       (ficheiro, método) apareça numa das tabelas. Depois acrescentar `"POST"` à linha 477 e
       `"GET"` à 495.
     Chega ao cliente? não — é a rede de segurança que tem buracos, não a rede eléctrica.

[A7-003] [Agente 7] [Link da proposta] [Médio] O link não se pode revogar, e mostra as revisões futuras a quem o tiver
     Reproduzir:
       1. Enviar a proposta v1 a um casal. O email leva `/proposta/<token>`.
       2. O casal reencaminha o email ao pai / ao wedding planner / a um fornecedor — o caso
          normal, não o adversarial.
       3. Semanas depois, o estúdio revê o preço e gera a v2 (proposta nova, mesmo pedido,
          mesmo email de cliente, estado ≠ rascunho).
       4. Quem tem o link antigo abre-o: vê a v2, com o preço novo. E não há nada, em lado
          nenhum, que o corte.
     Esperado: um link de capacidade que vive 90 dias numa caixa de correio reencaminhável
       devia poder ser cortado sem colateral — como a sessão de admin, que tem
       `SESSION_VERSION`.
     Observado: o payload do token de proposta é `{ typ, pid, exp }` e mais nada
       (`proposal-token.ts:91`) — não há claim de versão, não há lista de revogação, não há
       consulta a estado nenhum na verificação. A única alavanca é rodar o `SESSION_SECRET`,
       que ao mesmo tempo põe TODA a equipa fora do back office e mata TODOS os links do
       Portal do Cliente (365 dias) de todos os casais. Na prática: não se roda.
       Duas coisas amplificam:
        · o TTL é `DEFAULT_VALID_DAYS + 30` = 90 dias (`proposal-token.ts:55`,
          `proposal-doc.ts:42`), contado da EMISSÃO;
        · `GET /api/orcamento/[id]/proposta-doc` cunha um token NOVO a cada chamada
          (`proposta-doc/route.ts:85`) sem invalidar os anteriores — «regerar o link» não
          substitui nada, acumula;
        · e `proposta-do-link.ts` faz o link seguir o PEDIDO e não a linha, o que resolve um
          problema real («o casal vê a versão atual sem eu reenviar nada») e, ao mesmo tempo,
          faz um link antigo passar a mostrar preços que ninguém decidiu mostrar-lhe.
       As três guardas do salto (mesmo `quoteId`, mesmo `clientEmail`, estado ≠ rascunho)
       estão bem postas e foram verificadas: nunca deixam saltar para a proposta de outro
       casal. O problema não é a quem salta — é que quem está do lado de lá do link não se
       consegue mudar.
     Onde:
       src/lib/proposal-token.ts:55, 91, 97-125
       src/lib/proposta-do-link.ts:114-146
       src/app/api/orcamento/[id]/proposta-doc/route.ts:83-86
     Causa provável: o token nasceu como «aceite de uso praticamente único, 14 dias». Ganhou
       90 dias e ganhou a propriedade de mostrar tudo o que vier a seguir; o modelo de
       revogação não acompanhou.
     Correção proposta: um claim de geração no payload, por proposta ou por pedido —
       `{ typ, pid, g, exp }`, com `g` lido de um campo do pedido que um botão «invalidar os
       links deste pedido» incrementa. Custa uma leitura na verificação (que já vai ao store
       logo a seguir, no `getProposal`) e dá ao estúdio a alavanca que a sessão já tem.
       Enquanto isso não existe, escrever no ecrã do estúdio, ao lado do botão do link, que
       ele não se pode cortar.
     Chega ao cliente? sim — é o link que está na caixa de correio dele.

[A7-004] [Agente 7] [Autenticação — tokens] [Médio] Os limites de taxa são por instância quando o Upstash não está configurado
     Reproduzir: não confirmado em produção — é leitura de código mais uma pergunta de
       configuração. Com `UPSTASH_REDIS_*` ausente, `rateLimit()` cai no `memoryRateLimit`,
       que é um `Map` no processo. Numa função serverless com N instâncias quentes, um tecto
       de «20 por minuto» é na prática «20×N por minuto», e um arranque a frio zera-o.
     Esperado: os tectos que as rotas anunciam valerem o que dizem.
     Observado: dependem deles, entre outros:
        · a enumeração de ids de pedido em `GET /api/orcamento/[id]`;
        · a força bruta na entrada por palavra-passe e por passkey;
        · o tecto de pedidos de recuperação de palavra-passe.
       O desenho está certo (Redis quando há, memória quando não, e falha ABERTA de propósito
       para uma avaria de cache não deitar abaixo os formulários) — o que falta é a certeza
       de que em produção há Redis.
     Onde: src/lib/rate-limit.ts:1-52
     Causa provável: nada de errado no código; é uma dependência de configuração que nenhum
       teste nem nenhuma sonda afirma.
     Correção proposta: pôr o facto no `/api/health` (um booleano
       `checks.rateLimit: "redis" | "memoria"`, ao lado dos que já lá estão para email e
       push) e um `log.error` de arranque em produção quando cai na memória. Um tecto que não
       se sabe se existe não é um tecto.
     Chega ao cliente? não.

[A7-005] [Agente 7] [Email — modelos] [Menor] O `esc()` dos modelos não escapa a plica, ao contrário do que o comentário promete
     Reproduzir: não confirmado como explorável hoje — nenhum modelo de origem usa atributos
       entre plicas (verificado com `grep -oE "='[^']*\{\{"` sobre `src/lib/email-modelos*.ts`:
       zero). O caminho existe assim que alguém escrever um:
       1. No back office, «HTML avançado», escrever um modelo com
          `<a href='{{link_portal}}'>` ou `style='color:{{x}}'`.
       2. Um pedido do formulário público com um nome que contenha `'` seguido de um atributo
          (o nome só passa por `trimmed(120)`).
       3. O corpo sai com o atributo partido.
     Esperado: as duas funções escaparem o mesmo, como o comentário afirma — «Mirrors `esc`
       in `src/lib/mail.ts` byte-for-byte so the preview renders identically to what the
       server sends».
     Observado: não é byte-for-byte. O de `mail.ts` escapa `& < > " '` (cinco); o de
       `email-template-format.ts` escapa `& < > "` (quatro) — falta o `&#39;`. E não é só a
       pré-visualização que usa o curto: o `email-template-engine.ts` importa este `esc` na
       primeira linha, logo é ELE que escapa o corpo real dos modelos `{{…}}` no envio.
     Onde:
       src/lib/email-template-format.ts:35-41
       src/lib/mail.ts:142-148
       src/lib/email-template-engine.ts:1, 152
     Causa provável: cópia feita antes de o `mail.ts` ganhar o `'`, com o comentário a
       garantir uma equivalência que deixou de ser verdade.
     Correção proposta: acrescentar a linha da plica e um teste que compare as duas funções
       sobre a mesma entrada — é a única forma de o comentário voltar a poder ser lido como
       um facto.
     Chega ao cliente? não hoje; chega no dia em que um modelo usar plicas.

[A7-006] [Agente 7] [Autenticação — tokens] [Menor] `readProposalToken` aceita um token sem `typ`
     Reproduzir: não confirmado como explorável. Não é conhecido nenhum token assinado com o
       segredo base sem `typ` — o do portal declara `typ:"portal"` e é recusado, o da sessão
       usa uma sub-chave derivada.
     Esperado: um verificador estrito, como os dois irmãos.
     Observado: `if (payload.typ !== undefined && payload.typ !== "proposal") return null;` —
       a porta fica aberta a QUALQUER payload assinado com o segredo base que não declare
       tipo. A razão está escrita e é boa («tokens minted before this claim existed carry no
       `typ`; still accept those so already-sent accept links keep working until they
       expire»), mas esses links já expiraram há muito.
     Onde: src/lib/proposal-token.ts:118
     Causa provável: caminho de transição que ficou por remover.
     Correção proposta: exigir `payload.typ === "proposal"`, como o `readPortalToken` já
       exige (`portal-token.ts:86`). O custo é zero se nenhum token vivo for anterior à
       claim — dá para confirmar pelo prazo.
     Chega ao cliente? não.

[A7-007] [Agente 7] [Segredos versionados] [Menor] Hashes de palavra-passe em ficheiros versionados
     Reproduzir: `grep -rE '\$2[aby]\$' --include=*.ts --include=*.mjs .`
     Esperado: nenhum material de credencial no repositório.
     Observado: quatro hashes bcrypt de palavra-passe versionados. Nenhum é de produção: um é
       o partilhado de desenvolvimento (e o `admin-auth` recusa-o explicitamente em produção)
       e os outros três são de arreios de teste. O `.env.example` está limpo: só marcadores,
       sem um único valor. NÃO se reproduz aqui nenhum dos valores — só o sítio e o tipo.
     Onde (tipo: hash bcrypt de palavra-passe):
       src/lib/admin-auth.ts:113
       playwright.dados.config.ts:103
       playwright.movel.config.ts:59
       scripts/bench-back-office.mjs:97
     Causa provável: conveniência de desenvolvimento, assumida por escrito.
     Correção proposta: nenhuma urgente. Se se quiser fechar, os três de teste passam a ser
       gerados no arranque do arreio (`hashSync` sobre uma constante de teste) em vez de
       literais.
     Chega ao cliente? não.

---

## O que está bem defendido — e com que nome

**A auditoria de guardas por rota** (`src/app/api/auth-guard-audit.test.ts`) é a peça central
e é forte. Não afirma só «devolveu 401»: espia todos os módulos com efeito e afirma que o
*array de chamadas está vazio* — ou seja, que a guarda correu **antes** de a rota tocar no
armazenamento. Cobre 93 ficheiros de rota, classifica-os em três famílias (sessão de admin,
público, token/segredo) e tem controlos positivos autenticados para provar que os 401 são a
guarda a decidir e não a rota a rebentar. Percorrida a árvore inteira: **não foi encontrada
uma única rota de back office alcançável sem sessão.** As dez que não referem guarda nenhuma
são exactamente as dez que a lista `NON_ADMIN` declara públicas por necessidade. O que ela não
cobre está no A7-002.

**A separação de domínios das chaves** (`admin-auth.ts:632-648`). Cada uso tem a sua sub-chave
HMAC nomeada (`liquen.admin-session.v1`, `liquen.passkey-challenge.v1`), e há um `typ` no
payload como segunda guarda independente. Fechou um caso real em que um token de proposta era
aceite como cookie de sessão de admin. Os três verificadores (`readSession`,
`readProposalToken`, `readPortalToken`) exigem exactamente duas partes, comparam com
`timingSafeEqual` depois de igualar comprimentos, e recusam lixo colado a seguir a uma
assinatura válida.

**A lista `NUNCA_NO_PDF`** (`proposta-de-pdf/tipos.ts:182-200`) e o teste que a prende
(`notas-internas-ficam-em-casa.test.ts`). O teste não procura a frase no ficheiro — compara as
**instruções de desenho** de um documento com nota e sem ela, e tem controlo positivo. Cobre
também o PDF inglês e a cópia para outro casal. Campos confirmados: `budgetCosts`,
`budgetScales`, `notasInternas`, `notasPorSeccao`, `fotosDeBiblioteca`, `escolhas`. E
`Documento.tsx` — a página web, terceiro caminho — não menciona um único deles.

**O painel «Só para ti»** (`PainelInterno.tsx`) só é importado pelo `ProposalStudio`, que só
existe dentro do `AdminClient`, que só é montado depois de `readSession`
(`orcamento/admin/page.tsx:39`). Custos, margens e a memória de preços não têm caminho para
fora do back office.

**A Regra 1 do `proposta-fotos.ts`** — ids opacos em vez de caminhos, e assinar só o que está
NAQUELE documento «por construção, e não por validação». As três rotas do casal (`/fotos`,
`/foto/[id]`, `/escolha`) não aceitam um caminho vindo de fora: nem da query, nem do corpo,
nem de um cabeçalho. O A7-001 é a única fuga a esta regra, e entra pela fronteira RSC.

**A fronteira servidor/cliente** (`fronteira-servidor-cliente.test.ts`) percorre o grafo de
importações de cada componente `"use client"` e recusa qualquer caminho até um módulo
`server-only`, distinguindo `import type` de importação real. Verifica **módulos**, não
**dados** — o A7-001 passa por baixo dela precisamente por isso.

**A limpeza dos caminhos com token** (`safe-path.ts` + `logger.ts:57-86`). Uma definição do
padrão, três consumidores, e o `logger` mantém deliberadamente a sua própria rede —
`CAPABILITY_PATH_RE` redige `/proposta/<token>` e `/portal/<token>` de tudo o que entre nos
registos, incluindo o `documentUri` de um relatório de CSP. `isTokenRoute` impede que qualquer
analítico seja montado nessas rotas, com três testes a prendê-lo.

**As duas páginas de link privado** são `force-dynamic` (logo `private, no-store`), `noindex`,
com `openGraph.images: []` e `twitter.images: []` declarados de propósito. O portal entrega ao
componente de cliente uma **lista explícita** de campos em vez do objecto; o
`GET /api/orcamento/[id]` sem sessão devolve uma allowlist. Um token forjado e um id apagado
dão a MESMA frase, nos dois ecrãs.

**Os carregamentos** têm quatro camadas a sério: tipo declarado, tamanho, *sniff* real dos
bytes, e um tecto de píxeis contra bombas de descompressão. No carregamento directo os limites
estão gravados **no próprio bucket**. Os caminhos são construídos no servidor, nunca aceites
do cliente. Não foi encontrado um upload sem validação de tipo.

**A injecção em campos de texto**: o formulário público passa por `esc()` em todas as células
do email de aviso, o `href` do `mailto:` também, e o assunto vai por `encodeURIComponent`. O
motor de modelos interpreta pouco de propósito e um valor substituído nunca volta ao
interpretador. Os nomes de ficheiro em `Content-Disposition` são todos filtrados. A única
fenda é a plica do A7-005.

**Duas ausências que são guardas**: a rota do aceite (`POST /api/proposta`) foi **apagada** e
há um teste que recusa o ficheiro de volta (`nada-de-aceitar-por-botao.test.ts`); e
`folha-limpa.test.ts` pergunta à *estrutura* dos layouts que nenhum monta o cromado do sítio
na rota da proposta, com controlo positivo.
