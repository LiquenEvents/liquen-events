# Auditoria do back office — Fase 1: o mapa do sistema

> Só leitura. Nada foi alterado para fazer este mapa.
> Data: 7 de outubro de 2026. Código no commit `f2150d0`.

## 0 · Onde vou testar, e com que regras

| | |
|---|---|
| **Ambiente** | O meu, local: `next dev` com o armazém em ficheiros (`data/*.json`). **Não é produção** e não tem nenhum dado real. Produção não é tocada. |
| **Emails** | O SMTP **não está configurado** neste ambiente: o `sendMail` devolve «não enviado» e nada sai. Isso cumpre a tua regra («não envies a clientes reais»), mas quer dizer que **a entrega na caixa de correio não é verificável aqui**. Os emails são renderizados e capturados a partir do HTML que o código monta. |
| **Fotografias e anexos** | O armazenamento de imagens é o Supabase Storage, que **não existe** neste ambiente. Carregar imagens fica «não verificado», e as páginas que dependem delas mostram o estado sem armazenamento. |
| **Dados de teste** | Todos com o prefixo **TESTE** no nome, listados no fim do relatório. |
| **Capturas** | Playwright + Chromium (instalado e já usado nesta sessão), e o axe para acessibilidade. |

## 1 · Tecnologias

| Peça | O que é |
|---|---|
| Framework | **Next.js 16.3.8** (App Router, Turbopack), **React 19.2**, TypeScript, Tailwind CSS v4 |
| Base de dados | **Supabase (Postgres)** em produção — `db/schema.sql`, 28 tabelas. Sem Supabase, um armazém em ficheiros JSON (`data/`), que é o que corre em desenvolvimento |
| Autenticação | Sessão própria em cookie assinado (HMAC, `SESSION_SECRET`). Contas individuais (`ADMIN_USERS`) ou uma palavra-passe partilhada (`ADMIN_PASSWORD_HASH`, bcrypt). **Passkeys** (`@simplewebauthn`). Recuperação de acesso por email. **Sem perfis nem papéis**: não encontrei permissões diferentes por conta (a confirmar na Fase 5) |
| Ligações do cliente | Tokens assinados (HMAC) com prazo: proposta (`proposal-token.ts`) e portal (`portal-token.ts`, 365 dias) |
| Email | **nodemailer 10** por SMTP |
| Ficheiros | **Supabase Storage** (fotografias dos temas, imagens das propostas) |
| PDF | **pdf-lib** + fontkit (gerado no servidor); **pdfjs-dist** para mostrar PDFs |
| Imagens | **sharp** (miniaturas, LQIP, versões leves) |
| Notificações | **Web Push** (`web-push`) para os aparelhos da equipa |
| Alojamento | **Vercel**, com dois *crons*: `/api/cron/reminders` (07:00 UTC) e `/api/cron/backup` (04:00 UTC). Há também um `Dockerfile` |
| Testes | Vitest (10 909 casos), Playwright (8 configurações), axe |

## 2 · Páginas e rotas do back office

**Uma página faz quase tudo.** O back office é `/orcamento/admin`, e as secções mudam por `?v=<vista>`. Sem sessão, a mesma página mostra a entrada (`AdminLogin`). `/admin` redireciona para lá.

| Rota | O que é |
|---|---|
| `/orcamento/admin` | Entrada (sem sessão) e back office (com sessão) |
| `/orcamento/admin?v=…` | As 19 vistas da tabela de baixo |
| `/orcamento/admin/evento/[id]` | Ficha do evento (dossiê: produção, finanças, comunicação) |
| `/orcamento/admin/carregamento/[eventId]` | Carregamento do material de um evento (telemóvel, funciona sem rede) |
| `/orcamento/admin/carregamento/pedido/[quoteId]` | O mesmo, aberto a partir do pedido |
| `/orcamento/admin/recuperar` | Definir uma palavra-passe nova a partir do email de recuperação |

As 19 vistas (`?v=`), com o nome que aparece na barra:

| Vista | Na barra | Nome |
|---|---|---|
| `overview` | sim | Visão Geral |
| `pedidos` | sim | Pedidos |
| `calendario` | sim | Calendário |
| `fazer-proposta` | sim | Fazer proposta (o estúdio) |
| `propostas` | sim | Propostas |
| `guioes` | sim | **Timelines** (a documentação chama-lhe «Guiões do dia») |
| `definicoes` | sim | Definições |
| `tarefas` | sim | Tarefas |
| `material` | sim | Material |
| `temas` | sim | Temas |
| `estatisticas` | sim | Estatísticas |
| `contratos` | sim | **Propostas Aceites** |
| `kanban` | não | Quadro dos pedidos |
| `clientes` | não | Clientes |
| `acompanhamento` | não | Acompanhamento das propostas |
| `fornecedores` | não | Fornecedores |
| `inventario` | não | Inventário |
| `modelos-email` | não | Modelos de email |
| `servicos` | não | Catálogo de serviços |

**Do lado do cliente** (sem sessão): `/orcamento` (formulário), `/orcamento/confirmacao/[id]` (depois de enviar), `/proposta/[token]` (a proposta), `/portal/[token]` (o portal: proposta aceite, contrato, pagamentos).

**A confirmar na Fase 3:** a `CLAUDE.md` e os documentos citam `/orcamento/admin/login`, `/orcamento/admin/propostas/nova` e `/propostas/[id]/editar`, e **nenhuma dessas rotas existe no código**.

API: **108 rotas** em `src/app/api/`. As do percurso estão no diagrama (ponto 7).

## 3 · Funcionalidades, por área

| Área | O que existe |
|---|---|
| **Entrada** | Formulário público em PT/EN (vários passos), proteção por limite de envios, origem do pedido (UTM, referência), Meta CAPI, email de confirmação ao cliente, email + push à equipa |
| **Pedidos** | Lista com filtros, pesquisa e estados; quadro (kanban); detalhe em gaveta/coluna; etiquetas, seguimento, histórico de atividade; pedido manual; arquivar |
| **Clientes** | Lista de clientes a partir dos pedidos |
| **Propostas** | **Dois editores**: o estúdio (`ProposalStudio`, vista «Fazer proposta») e o editor antigo (`ProposalBuilder`, ainda montado no detalhe do pedido). Modelos, cópia de propostas, versões, tradução PT→EN (DeepL), temas e fotografias, alternativas para o cliente escolher, PDF, envio por email, painel «Só para ti» (custos, margem, deslocação), acompanhamento e análise de propostas |
| **Lado do cliente** | Página da proposta com escolha entre alternativas; **não há botão de aceitar** (decisão dela); portal com o contrato e os pagamentos |
| **Contratos / aceitação** | A aceitação é **registada pela equipa** («Propostas Aceites»), com a versão da proposta congelada; PDF do contrato |
| **Evento** | Ficha do evento: plano de produção, checklist, material e carregamento, timeline/guião do dia, pagamentos, custos, convidados, tarefas do evento, comunicação com o cliente (mensagens e modelos) |
| **Calendário** | Dia, semana, mês e ano; eventos, marcações, exportação |
| **Tarefas** | Listas, agrupamentos, linguagem natural, painel de detalhe, arrastar |
| **Material e inventário** | Catálogo de material, listas, regras automáticas por evento, inventário |
| **Temas** | Biblioteca de fotografias com etiquetas, temas, paletas |
| **Fornecedores** | Lista com categoria, contactos, avaliação |
| **Comunicação** | Modelos de email (bilingues, com versões e envio de teste), mensagens escritas à mão ao cliente |
| **Estatísticas** | Painel de números, fechos das campanhas da Meta |
| **Definições** | Aparência, deslocação (consumo, preço do gasóleo), margem mínima, preferências da proposta, catálogo de serviços, equipa, passkeys |
| **Sistema** | Cópia de segurança diária (por email), restauro, lembretes diários (push), notificações push, relatórios de erros do cliente, Web Vitals |

## 4 · Base de dados: tabelas, campos e relações

28 tabelas em `db/schema.sql`, **todas com RLS ativado**. Notas que vão para a Fase 5:

- **`quotes` guarda quase tudo numa coluna `data` (JSON)**: nome, email, evento, data, convidados, notas, etc. As colunas próprias são só `id`, `status`, `name`, `email` e as datas.
- **Relações que existem só no nome**: `contracts.quote_id`/`proposal_id`, `invoices.quote_id`, `tasks.quote_id` e `calendar_events` **não têm chave estrangeira**. Apagar um pedido não toca nesses registos.
- Chaves estrangeiras reais: `proposals → quotes`, `message_links → quotes/proposals`, `event_material → quotes` (apaga em cascata), material e biblioteca entre si.

| Tabela | Colunas | Relações |
|---|---|---|
| `quotes (7 colunas) · RLS` | id:text, created_at:timestamptz, updated_at:timestamptz, status:text, name:text, email:text, data:jsonb | — |
| `proposals (29 colunas) · RLS` | id:uuid, quote_id:text, created_at:timestamptz, updated_at:timestamptz, status:text, client_name:text, client_email:text, currency:text, line_items:jsonb, vat_rate:numeric, subtotal:numeric, vat:numeric, total:numeric, valid_until:date, notes:text, sent_at:timestamptz, responded_at:timestamptz, pdf_sha256:text, pdf_bytes:integer, doc:jsonb, idioma:text, versao_selo:text, versao_numero:integer, versao_em:timestamptz, follow_up_at:date, follow_up_note:text, lost_reason:text, lost_note:text, chosen_version:text | quote_id → quotes.id (on delete set null) |
| `contracts (19 colunas) · RLS` | id:text, quote_id:text, proposal_id:text, client_name:text, client_email:text, terms_version:text, terms_snapshot:text, status:text, created_at:timestamptz, accepted_at:timestamptz, accepted_name:text, accepted_ip:text, proposta_versao_selo:text, proposta_versao_numero:integer, registado_por:text, registado_como:text, idioma:text, proposta_pdf_sha256:text, proposta_pdf_bytes:integer | — |
| `tasks (14 colunas) · RLS` | id:uuid, created_at:timestamptz, title:text, done:boolean, priority:text, due_date:date, quote_id:text, client_name:text, assignee:text, area:text, notas:text, subtarefas:jsonb, anexos:jsonb, posicao:double | — |
| `suppliers (10 colunas) · RLS` | id:uuid, created_at:timestamptz, name:text, category:text, email:text, phone:text, location:text, notes:text, rating:smallint, preferred:boolean | — |
| `calendar_events (7 colunas) · RLS` | id:uuid, created_at:timestamptz, event_date:date, title:text, kind:text, event_time:text, note:text | — |
| `push_subscriptions (3 colunas) · RLS` | endpoint:text, keys:jsonb, created_at:timestamptz | — |
| `app_state (3 colunas) · RLS` | key:text, value:jsonb, updated_at:timestamptz | — |
| `overview_settings (4 colunas) · RLS` | id:text, value:text, revision:integer, updated_at:timestamptz | — |
| `service_catalog (9 colunas) · RLS` | id:uuid, name:text, description:text, name_en:text, description_en:text, category:text, archived:boolean, created_at:timestamptz, updated_at:timestamptz | — |
| `proposal_settings (3 colunas) · RLS` | id:text, value:jsonb, updated_at:timestamptz | — |
| `email_templates (5 colunas) · RLS` | id:text, name:text, subject:text, body:text, updated_at:timestamptz | — |
| `invoices (13 colunas) · RLS` | id:text, number:text, quote_id:text, client_name:text, client_email:text, kind:text, amount:numeric, vat_rate:numeric, issued_at:date, due_at:date, paid_at:date, status:text, note:text | — |
| `invoice_counters (2 colunas) · RLS` | year:int, n:int | — |
| `inventory_items (9 colunas) · RLS` | id:text, name:text, category:text, quantity:integer, unit:text, condition:text, location:text, notes:text, updated_at:timestamptz | — |
| `material_items (10 colunas) · RLS` | id:text, name:text, category:text, kind:text, unit:text, stock:numeric, min_stock:numeric, notes:text, photo_path:text, updated_at:timestamptz | — |
| `material_lists (6 colunas) · RLS` | id:text, name:text, is_default:boolean, notes:text, created_at:timestamptz, updated_at:timestamptz | — |
| `material_list_items (7 colunas) · RLS` | id:text, list_id:text, item_id:text, qty:numeric, qty_per_pax:numeric, critical:boolean, position:integer | list_id → material_lists.id (on delete cascade)<br>item_id → material_items.id (on delete restrict) |
| `material_rules (12 colunas) · RLS` | id:text, name:text, enabled:boolean, match_kind:text, match_value:text, action:text, list_id:text, item_id:text, qty:numeric, qty_per_pax:numeric, position:integer, updated_at:timestamptz | list_id → material_lists.id (on delete cascade)<br>item_id → material_items.id (on delete cascade) |
| `event_material (7 colunas) · RLS` | id:text, quote_id:text, status:text, generated_at:timestamptz, vehicles:jsonb, notes:text, updated_at:timestamptz | quote_id → quotes.id (on delete cascade) |
| `event_material_items (21 colunas) · RLS` | id:text, event_id:text, item_id:text, name:text, category:text, unit:text, kind:text, qty:numeric, critical:boolean, origin:text, origin_ref:text, origin_label:text, vehicle_id:text, loaded_at:timestamptz, loaded_by:text, returned_at:timestamptz, returned_by:text, missing:boolean, used_qty:numeric, note:text, updated_at:timestamptz | event_id → event_material.id (on delete cascade) |
| `event_material_log (9 colunas) · RLS` | id:text, event_id:text, item_id:text, action:text, value:text, actor:text, marked_at:timestamptz, synced_at:timestamptz, superseded:boolean | event_id → event_material.id (on delete cascade) |
| `proposal_themes (13 colunas) · RLS` | id:text, name:text, notes:text, created_at:timestamptz, updated_at:timestamptz, cover_path:text, photo_order:jsonb, kind:text, filter_rule:jsonb, favorito:boolean, arquivado:boolean, manual_paths:jsonb, ordem:int | — |
| `message_links (8 colunas) · RLS` | id:text, quote_id:text, proposal_id:uuid, labels:jsonb, pinned:boolean, archived_at:timestamptz, created_at:timestamptz, updated_at:timestamptz | quote_id → quotes.id (on delete set null)<br>proposal_id → proposals.id (on delete set null) |
| `passkeys (9 colunas) · RLS` | id:text, user_name:text, public_key:text, counter:bigint, transports:jsonb, rp_id:text, device_label:text, created_at:timestamptz, last_used_at:timestamptz | — |
| `biblioteca_etiquetas (6 colunas) · RLS` | id:text, eixo:text, nome:text, ordem:int, created_at:timestamptz, updated_at:timestamptz | — |
| `biblioteca_fotos (11 colunas) · RLS` | path:text, pasta:text, fingerprint:text, md5:text, largura:int, altura:int, lqip:text, urls:jsonb, cor:text, created_at:timestamptz, updated_at:timestamptz | — |
| `biblioteca_foto_etiquetas (5 colunas) · RLS` | path:text, etiqueta_id:text, origem:text, created_at:timestamptz, id:text | path → biblioteca_fotos.path (on delete cascade)<br>etiqueta_id → biblioteca_etiquetas.id (on delete cascade) |

## 5 · Emails e mensagens que o sistema envia

| # | O quê | A quem | Quando | Onde |
|---|---|---|---|---|
| 1 | «Recebemos o seu pedido.» | **Cliente** | Ao submeter o formulário (máx. 5 por dia por endereço) | `api/orcamento/route.ts` → `client-confirmation.ts` |
| 2 | «Pedido de orçamento · …» | **Equipa** (`MAIL_TO`) | Ao submeter o formulário | `api/orcamento/route.ts` |
| 3 | Push «Novo pedido» | **Aparelhos da equipa** | Ao submeter o formulário | `lib/push.ts` |
| 4 | A proposta (estúdio) | **Cliente** | Botão de envio no estúdio | `api/orcamento/[id]/proposta-doc` |
| 5 | A proposta (editor antigo) | **Cliente** | Botão de envio no `ProposalBuilder` | `api/orcamento/[id]/proposta` |
| 6 | Email a partir de modelo | **Cliente** | Ficha do evento → enviar modelo | `api/orcamento/[id]/modelo` |
| 7 | Mensagem escrita à mão | **Cliente** | Ficha do evento → mensagem | `api/orcamento/[id]/mensagem` |
| 8 | Envio de teste de um modelo | Endereço indicado, com «[TESTE]» | Modelos de email → testar | `api/email-templates/teste` |
| 9 | Recuperar acesso | **Conta da equipa** | «Esqueci-me da palavra-passe» | `api/admin/recuperar` |
| 10 | Cópia de segurança (ou aviso de que é grande demais) | **Equipa** | Todos os dias, 04:00 UTC | `api/cron/backup` |
| 11 | Push com o resumo do dia (pagamentos, pedidos por responder, seguimentos) | **Aparelhos da equipa** | Todos os dias, 07:00 UTC | `api/cron/reminders` |

Os emails ao cliente (1, 4, 5, 6, 7) levam `Reply-To` para a caixa da equipa. **WhatsApp não é enviado pelo sistema**: são ligações `wa.me` (com ou sem mensagem pré-escrita) que abrem a aplicação de quem carrega.

## 6 · Integrações externas

| Integração | Para quê | Estado aqui |
|---|---|---|
| Formulário do site | Entrada dos pedidos (mesma aplicação) | testável |
| SMTP | Todos os emails | **não configurado** → não verificável |
| Supabase (Postgres + Storage) | Dados e ficheiros em produção | **não existe aqui** → armazém em ficheiros |
| WhatsApp | Ligações `wa.me` | testável (só a ligação) |
| Meta (Conversions API) | Leads e fechos para as campanhas | **sem chave** → não verificável |
| DeepL | Tradução PT→EN das propostas | **sem chave** → não verificável |
| Web Push | Avisos à equipa | **sem chaves VAPID** → não verificável |
| Sentry | Registo de erros | **sem DSN** → não verificável |
| Vercel Cron | Lembretes e cópia de segurança | a lógica é testável; o agendamento não |
| Pagamentos | **Não há** gateway (nem MB Way, nem Stripe). Os pagamentos são registados à mão no painel do evento | — |
| Calendário externo | **Não encontrei** sincronização (Google/iCal) | a confirmar |

## 7 · O percurso completo

```
CLIENTE                                   SISTEMA                                  EQUIPA
───────                                   ───────                                  ──────
/orcamento (formulário, PT/EN)
   │ POST /api/orcamento ───────────────► valida (zod) · limita · grava `quotes`
   │                                      │ (estado: pendente)
   │                                      ├─► email «Recebemos o seu pedido.» ──► (cliente)
   │                                      ├─► email «Pedido de orçamento» ─────────────────► caixa da equipa
   │                                      ├─► push «Novo pedido» ──────────────────────────► telemóveis
   │                                      └─► Meta CAPI (lead)
   ▼
/orcamento/confirmacao/[id]                                                        Pedidos (?v=pedidos)
                                                                                     │ abre o pedido
                                                                                     ▼
                                                                                   Detalhe (gaveta/coluna):
                                                                                   estado, etiquetas, seguimento
                                                                                     │
                                                                                     ▼
                                                                                   Fazer proposta (estúdio)
                                                                                   [ou o ProposalBuilder antigo]
                                                                                     │ edita · rascunho no servidor
                                                                                     │ · versões · PDF · tradução
                                                                                     ▼
                                          POST /api/orcamento/[id]/proposta-doc ◄─ «Enviar»
                                          grava `proposals` (versão, PDF, selo)
                                          email com a ligação /proposta/[token] ──► (cliente)
   │
   ▼
/proposta/[token]  (sem sessão, token HMAC com prazo)
   │ vê a proposta, descarrega o PDF
   │ escolhe entre alternativas ──────────► POST /api/proposta/[token]/escolha
   │                                        (só grava a preferência: NÃO aceita,
   │                                         não muda o estado, não avisa)
   │
   │ responde por email / WhatsApp ───────────────────────────────────────────────► a equipa lê
   │                                                                                 │
   │                                                                                 ▼
   │                                                                               Regista a aceitação
   │                                                                               («Propostas Aceites»):
   │                                          grava `contracts` (versão congelada)
   │                                          portal /portal/[token] (365 dias)
   ▼
/portal/[token]: contrato, plano de pagamentos, PDFs
                                                                                   Depois de aceite:
                                                                                   ficha do evento — produção,
                                                                                   material e carregamento,
                                                                                   timeline do dia, pagamentos
                                                                                   (à mão), custos, convidados,
                                                                                   tarefas, mensagens ao cliente
                                          cron 07:00 → push com o resumo do dia
RECUSA / SEM RESPOSTA: não há estado automático. A equipa marca «perdida» com motivo
(`lost_reason`) e pode marcar um seguimento (`follow_up_at`), que entra no resumo do dia.
```

## 8 · Ferramenta de capturas

**Playwright com Chromium** (local, já usado nesta sessão para medir e capturar), com o axe para acessibilidade. Dá página inteira, as quatro larguras (1440, 1024, 768, 390), modo claro e escuro (`prefers-color-scheme`), estados (hover, foco, premido) e recortes de zonas. **Posso avançar.**

## Antes de avançar, preciso que confirmes três coisas

1. **Falta alguma área?** Em particular: as faturas (há tabelas `invoices`, mas o ecrã de faturação foi retirado do back office) e os pagamentos (registados à mão, sem gateway). Entram na auditoria como estão?
2. **Onde ficam as capturas.** Pediste `auditoria/capturas/`. Com quatro larguras, dois temas e vários estados por página, são **centenas de ficheiros e dezenas de MB**. Se os guardar no repositório, ficam no histórico para sempre, e cada envio para o GitHub **gera uma pré-visualização na Vercel** (não é produção, mas é um *deploy*). Proponho guardar no repositório só o relatório, o índice e os **recortes que provam cada problema**, e as capturas completas numa pasta fora do repositório desta sessão, que te entrego numa página. Ou guardo tudo no repositório, se preferires.
3. **O que não dá para testar aqui** (ponto 0 e 6): entrega de emails, carregamento de imagens, Meta, DeepL, push. Ficam como «não verificado», com a análise do código. Está bem assim, ou tens um ambiente de testes com SMTP e Supabase que eu possa usar?
