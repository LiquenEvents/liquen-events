# Onde fica guardado

O que um deploy apaga, e o que não apaga.

Este documento existe por causa de uma frase que era mentira: o sistema dizia
«gravado» sobre um sítio que um deploy apaga. Está corrigido — mas a pergunta
«e isto, onde é que fica?» tem de ter resposta escrita, para não ser preciso
descobri-la outra vez de cada vez que alguém pergunta.

**A regra, numa linha:** só sobrevive a um deploy o que está na **base de
dados** (Supabase Postgres), nos **buckets de fotografias** (Supabase Storage)
ou **fora da aplicação** (a cópia de segurança que chega por email). Tudo o
resto é temporário, por muito que pareça estar guardado.

---

## 1. Sobrevive a um deploy

| Onde                                             | O que lá está                                                                                                                                                                                                                                                                             | Notas                                                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Base de dados** — tabelas do `db/schema.sql`   | Pedidos (`quotes`), propostas (`proposals`), contratos, facturas e o contador fiscal, tarefas, agenda, fornecedores, inventário, material e listas, temas, biblioteca de fotografias e etiquetas, modelos de email, catálogo de serviços, definições, passkeys, subscrições de notificações | O sítio de verdade. Exige `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.                    |
| **Base de dados** — tabela `app_state`           | **Rascunhos do estúdio e do construtor de propostas** (`proposal-draft:<pedido>`), marcador da caixa de entrada, fechos enviados à Meta, contador de facturas de desenvolvimento                                                                                                          | Uma tabela partilhada. Os rascunhos são o maior bloco de trabalho irrecuperável da casa.   |
| **Buckets de fotografias** (Storage)             | `proposal-assets`, `theme-assets` (originais) e as derivadas `proposal-thumbs`, `theme-thumbs`, `theme-micro`, `proposal-capas`, `theme-capas`                                                                                                                                             | Os originais são insubstituíveis; as derivadas regeneram-se (Definições → Miniaturas).     |
| **Cópia de segurança diária, por email**         | Um `.json.gz` com os conjuntos todos, incluindo os rascunhos — e um SEGUNDO anexo com a lista das fotografias                                                                                                                                                                              | `/api/cron/backup`, 04:00. Está FORA do Supabase de propósito — é a linha de defesa final. |

> A cópia de segurança **não leva as fotografias** (são gigabytes e vivem nos
> buckets). Uma reposição devolve propostas e mood boards com os _caminhos_ das
> imagens; se o bucket tiver desaparecido, as imagens não voltam.
>
> O que ela leva desde agora é a **lista** delas: `liquen-fotografias-<data>.json.gz`,
> com chave, tamanho, assinatura e data de cada original. Não devolve uma
> fotografia — responde à pergunta que se faz primeiro, e que até aqui não tinha
> resposta nenhuma: **o que é que se perdeu?**. Guarde esse anexo com o outro.
>
> Copiar os BYTES não é trabalho desta aplicação (uma cópia guardada por quem já
> tem acesso de escrita ao bucket não protege contra o dia mau). As hipóteses,
> com o custo de cada uma, estão em [RESILIENCE.md §6](./RESILIENCE.md).

## 2. NÃO sobrevive a um deploy

| Onde                                                | O que lá está                                             | O que acontece                                                                                                     |
| --------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `data/*.json` **em produção**                       | O recurso de quem não tem base de dados ligada            | Em Vercel vive no disco da função: apaga-se no deploy seguinte e muitas vezes até antes, quando o contentor recicla. |
| `data/app-state.json` **em produção**               | Rascunhos, marcadores, contador de facturas               | O buraco que motivou este documento. Hoje o sistema di-lo (ver §4) em vez de dizer «guardado».                       |
| `data/push-subscriptions.json` **em produção**      | Quem subscreveu notificações no telemóvel                 | **Já não se escreve lá.** Sem base de dados em produção, ligar as notificações é RECUSADO com uma frase que diz o que falta — ver §5. |
| Caches em memória do servidor                       | Limitador de pedidos (`rate-limit`), PDFs já desenhados    | Por instância e por invocação. É desenho: nada disto é dado, tudo se recalcula.                                      |
| `.next/`, ficheiros gerados no `build`              | Resultado da compilação, imagens pré-geradas              | Reconstruído a cada deploy, por definição.                                                                           |

**Nota que engana — corrigida:** os `data/*.json` estão _no repositório_
(`quotes.json`, `tasks.json`, `app-state.json`…) e estiveram commitados com
dados de exemplo (um pedido da «Maria Teste», uma tarefa, e um rascunho de
proposta inteiro dentro do `app-state.json`). Numa instalação em produção sem
base de dados, o que se LÊ é essa fotografia congelada do repositório — e é ela
que reaparece a cada deploy, por cima do que tiver sido escrito entretanto.
Parece que «os dados voltaram atrás»; o que aconteceu foi o disco ter sido
substituído pelo do deploy. Havia ainda uma segunda vítima, mais silenciosa: um
`git checkout` de outro ramo escrevia por cima do `data/app-state.json` local —
ou seja, por cima dos rascunhos de quem estivesse a trabalhar sem base de dados.

**No repositório esses ficheiros passam a estar VAZIOS** (`[]` / `{}`). Os
dados de exemplo não valiam o que custavam: quem quiser um back office com
conteúdo para experimentar tem o `scripts/semear-caca.mjs`, que gera cinquenta
pedidos e guarda o que lá estava antes. O aviso do `pre-commit` passa a dizer
isto por extenso, porque a passagem dos testes escreve nesses ficheiros e é fácil
levá-los num commit sem reparar.

## 3. Sobrevive ao deploy — mas só naquele navegador

Isto não é armazenamento do sistema: é a cópia local de quem está a trabalhar.
Sobrevive a deploys e a fechar o portátil, mas **não existe em mais lado
nenhum** — muda de computador, ou limpa o histórico, e desaparece.

| Onde                                             | O que lá está                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `localStorage` — `liquen-proposal-studio-<pedido>` | A cópia local do rascunho do estúdio (a rede de segurança quando o servidor recusa) |
| `localStorage` — `liquen-email-template-draft:*`   | Rascunhos dos modelos de email por enviar                                            |
| `localStorage` — `liquen-last-proposal-items`      | As últimas linhas do construtor de propostas                                         |
| `localStorage` — preferências                      | Vista aberta, filtros, ordenação, densidade, tema recente, modo de carga             |
| `localStorage` — `liquen-material-*`               | A fila de material registada sem rede, à espera de subir                             |
| Cache do service worker (`liquen-cache-v3`, `liquen-fotos-v2`) | Páginas e fotografias já vistas, para abrir depressa e sem rede            |

## 4. Como saber, sem adivinhar

`GET /api/admin/armazenamento` (só com sessão) responde ao que interessa —
e responde **tentando**: escreve uma chave de diagnóstico e volta a lê-la, em
vez de deduzir pela configuração. Uma instalação pode ter as variáveis todas
postas e não gravar nada (foi o que aconteceu).

| Resposta                     | O que fazer                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `ok`                         | Nada.                                                                                          |
| `ficheiro-de-desenvolvimento` | Nada — nesta máquina o ficheiro é o desenho.                                                    |
| `sem-configuracao`           | Definir `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no alojamento e publicar outra vez.        |
| `tabela-em-falta`            | Correr `db/schema.sql` no editor de SQL do Supabase (é idempotente, não apaga nada).            |
| `sem-permissao`              | A chave em uso não é a `service_role` — a `app_state` tem RLS e nenhuma política, e a `anon` é recusada. |
| `escrita-recusada`           | Pode ser passageiro; se persistir, ver se o projeto Supabase está suspenso.                     |
| `leitura-nao-confirma`       | Confirmar que `SUPABASE_URL` aponta para o projeto certo.                                       |

O aviso no ecrã está pronto em
`src/app/[lang]/(site)/orcamento/admin/AvisoDeArmazenamento.tsx` e só aparece
quando há mesmo alguma coisa a fazer — um aviso que aparece com tudo bem é um
aviso que se deixa de ler.

Em cada gravação de rascunho a rota continua a dizer a verdade caso a caso:
`guardado: false` (503) quando não gravou, e `guardado: true` com
`duradouro: false` quando gravou num sítio que o próximo deploy apaga.

A mesma resposta traz agora o campo `copia` — há quanto tempo é que não chega
uma cópia de segurança. Passados três dias sem nenhuma, o aviso diz-o e nomeia
a variável a confirmar (`CRON_SECRET`). Só se pergunta quando o armazenamento
está bom: numa máquina de desenvolvimento a tarefa não corre, e com a base de
dados em baixo o carimbo nem se lê. Descarregar uma cópia à mão também conta.

---

## 5. O que é RECUSADO em vez de fingido

Três sítios em que a aplicação prefere dizer que não a deixar alguém pensar que
ficou guardado. Nenhum deles impede trabalho — excepto o terceiro, e esse é
deliberado.

| Onde | O que acontece sem base de dados em produção | Porquê |
| ---- | -------------------------------------------- | ------ |
| Gravar pedidos, propostas, facturas… (`repository`) | Recusa a escrita | Um ficheiro que o deploy apaga não é um sítio |
| Repor uma cópia de segurança (`backup-restore`) | Recusa repor | Repor para um sítio que desaparece é perder a cópia e os dados |
| **Ligar as notificações** (`push`) | Recusa, com 503 e uma frase que nomeia as variáveis | Guardadas no disco da função, as notificações ficavam **activas no telemóvel** e não chegava nenhuma — sem erro, sem sintoma |
| **Emitir uma factura** (`invoices-store`) | Recusa emitir, com 503 | O contador viveria num ficheiro apagado no deploy: a numeração recomeçava em `FT AAAA/0001` e repetia números já emitidos. Numeração fiscal repetida é um problema com a Autoridade Tributária, e é pior do que não emitir hoje |
