# Índice das capturas

> Duas partes. **No projeto** (`auditoria/capturas/`) só os recortes que provam cada problema — o número à frente é o do problema no [`relatorio.md`](relatorio.md). **Na página** que te entrego, as 244 capturas completas, em WebP: **[abrir a página](https://claude.ai/artifact/TRj3U6pTmRT9VPDBTLFh65)**.

> Todas foram tiradas no servidor de testes local, só com dados TESTE e os dados fictícios dos testes automáticos. Nenhuma tem dados reais de clientes. O selo vermelho «1 Issue» é do servidor de desenvolvimento, não do produto. Nas capturas de página inteira, a barra de destinos e os painéis fixos aparecem a meio da página — é assim que uma captura de página inteira desenha o que está fixo.

## No projeto — recortes de prova

| Ficheiro | O que mostra | Onde está o problema |
|---|---|---|
| `capturas/calendario/12-30_calendario_proximos_30-fev-vira-2-mar_1440_claro.png` | 12-30 · calendario · proximos · 30 fev vira 2 mar · 1440 · claro | «2 Mar 27 · TESTE Data Impossível» (escrito 30/02); «10 Jun 27» (n.º 30). |
| `capturas/cliente/19_portal_aceite-e-contrato-pendente_390_claro.png` | 19 · portal · aceite e contrato pendente · 390 · claro | «Estado: Aceite» e, abaixo, «Aceitação pendente» (e o portal que não queres, n.º 37). |
| `capturas/definicoes/22_definicoes_deslocacao_formula-nao-bate_1440_claro.png` | 22 · definicoes · deslocacao · formula nao bate · 1440 · claro | Última linha: «Palmela: 71,00 € (105 km × 2 × 0,34)», «Porto: 252,00 €». |
| `capturas/emails/28_email-cliente_icones-das-redes_390_escuro.png` | 28 · email cliente · icones das redes · 390 · escuro | Ícones f / Instagram / in escuros sobre escuro. |
| `capturas/emails/28_email-cliente_logotipo-placa-branca_390_escuro.png` | 28 · email cliente · logotipo placa branca · 390 · escuro | Logótipo com retângulo branco no fundo escuro. |
| `capturas/estatisticas/13_estatisticas_inicial_100-conversao-0-ganho_1440_claro.png` | 13 · estatisticas · inicial · 100 conversao 0 ganho · 1440 · claro | «100% Conversão» ao lado de «0 € Ganho». |
| `capturas/material/23_material_catalogo_barra-de-pesquisa_1440_claro.png` | 23 · material · catalogo · barra de pesquisa · 1440 · claro | Campo de pesquisa fino ao lado de seletores grandes. |
| `capturas/modelos-email/09_modelos-email_editar_mensagem-codificada_1440_claro.png` | 09 · modelos email · editar · mensagem codificada · 1440 · claro | Caixa «Mensagem»: `<!-- liquen:simple:v1:…` e base64. |
| `capturas/pdf/02_pdf_servicos_linha-com-enter-sobreposta_a4_claro.png` | 02 · pdf · servicos · linha com enter sobreposta · a4 · claro | Caixa vermelha: «com segunda linha…» desenhada por cima da linha seguinte. |
| `capturas/pdf/02_pdf_servicos_pagina-3-inteira_a4_claro.png` | 02 · pdf · servicos · pagina 3 inteira · a4 · claro | Página 3 inteira; a sobreposição está na 2.ª linha da lista. |
| `capturas/pdf/32_pdf_servicos_emoji-desaparece_a4_claro.png` | 32 · pdf · servicos · emoji desaparece · a4 · claro | Título sem o 💐 que foi escrito. |
| `capturas/pedidos/10_pedidos_lista_procura-sem-acento-0-resultados_1440_claro.png` | 10 · pedidos · lista · procura sem acento 0 resultados · 1440 · claro | Pesquisa «evora»: lista vazia — há vários pedidos com local «Évora». |
| `capturas/pedidos/14_pedidos_lista_botao-filtro-colunas-invisiveis_1440_escuro.png` | 14 · pedidos · lista · botao filtro colunas invisiveis · 1440 · escuro | «+ Novo» (topo direito), «Todos · 19» e «Cliente/Estado» quase invisíveis. |
| `capturas/pedidos/29_pedidos_lista_valor-sem-rotulo-de-iva_390_claro.png` | 29 · pedidos · lista · valor sem rotulo de iva · 390 · claro | «4450 €» sem dizer «s/ IVA». |
| `capturas/pedidos/31_pedidos_novo-pedido_criar-desligado_1440_claro.png` | 31 · pedidos · novo pedido · criar desligado · 1440 · claro | «Criar pedido» desligado sem mensagem. |
| `capturas/pedidos/35_pedidos_ficha_notas-sem-quebras-de-linha_1440_claro.png` | 35 · pedidos · ficha · notas sem quebras de linha · 1440 · claro | «Notas do cliente»: «Linha 1 Linha 2» numa linha só (à direita). |
| `capturas/propostas/03_propostas_enviar_botao-antes-do-clique_1440_claro.png` | 03 · propostas · enviar · botao antes do clique · 1440 · claro | O botão «Gerar e enviar ao cliente», à direita. |
| `capturas/propostas/03_propostas_enviar_confirmar-no-mesmo-sitio_1440_claro.png` | 03 · propostas · enviar · confirmar no mesmo sitio · 1440 · claro | «Confirmar» ocupa a ponta direita onde estava o botão. |
| `capturas/propostas/04_propostas_enviar-whatsapp_erro-e-sem-link_1440_claro.png` | 04 · propostas · enviar whatsapp · erro e sem link · 1440 · claro | «WhatsApp» escolhido, aviso «EMAIL NÃO SAIU» à direita, nenhum link. |
| `capturas/propostas/05_propostas_estudio_valor-negativo-conta-positivo_1440_claro.png` | 05 · propostas · estudio · valor negativo conta positivo · 1440 · claro | Campo «-500»; ao lado «base 500,00 € · IVA 115,00 € · paga 615,00 €». |
| `capturas/propostas/07_propostas_estudio_modelo-substitui-o-escrito_1440_claro.png` | 07 · propostas · estudio · modelo substitui o escrito · 1440 · claro | Faixa «Proposta copiada… Pode anular durante 10s» — o título escrito foi substituído. |
| `capturas/propostas/11_propostas_lista_linha-e-aviso-sem-caminho_1440_claro.png` | 11 · propostas · lista · linha e aviso sem caminho · 1440 · claro | Aviso vermelho sem ligação; linha sem ação. |
| `capturas/propostas/14_propostas_estudio_titulo-invisivel_1440_escuro.png` | 14 · propostas · estudio · titulo invisivel · 1440 · escuro | Caixa vermelha: «Estúdio de propostas (PDF)» preto sobre preto. |
| `capturas/propostas/16_propostas_estudio_valor-zero-volta-atras_1440_claro.png` | 16 · propostas · estudio · valor zero volta atras · 1440 · claro | Campo voltou a «4250» depois de escrever 0. |
| `capturas/propostas/17_propostas_estudio_sinal-150-volta-a-30_1440_claro.png` | 17 · propostas · estudio · sinal 150 volta a 30 · 1440 · claro | «Sinal 30 %» depois de escrever 150. |
| `capturas/propostas/25_propostas_estudio_nota-interna-contraste_1440_claro.png` | 25 · propostas · estudio · nota interna contraste · 1440 · claro | «— só para ti, nunca sai na proposta» em dourado claro. |
| `capturas/propostas/26_propostas_estudio_botoes-de-16px_390_claro.png` | 26 · propostas · estudio · botoes de 16px · 390 · claro | «+ Adicionar linha», «⌕ Da biblioteca» com 16 px de altura. |
| `capturas/propostas/34_propostas_estudio_sessao-expirada-aviso_1440_claro.png` | 34 · propostas · estudio · sessao expirada aviso · 1440 · claro | Aviso «…sem falar com quem gere a instalação» ao lado da janela de sessão. |
| `capturas/site/25_site_formulario_tipos-de-evento-contraste_1440_claro.png` | 25 · site · formulario · tipos de evento contraste · 1440 · claro | Botões «Corporativo», «Aniversário»… em cinzento claro. |
| `capturas/site/27_site_confirmacao_plural_1440_claro.png` | 27 · site · confirmacao · plural · 1440 · claro | «Recebemos o vosso pedido.» |
| `capturas/tarefas/15_tarefas_inicial_pagina-mais-larga-que-o-ecra_390_claro.png` | 15 · tarefas · inicial · pagina mais larga que o ecra · 390 · claro | Ecrã de 390 com a página a 453 px (encolhida, faixa à direita). |
| `capturas/timelines/15_timelines_inicial_pagina-mais-larga-que-o-ecra_390_claro.png` | 15 · timelines · inicial · pagina mais larga que o ecra · 390 · claro | Captura de 417 px num ecrã de 390 — faixa branca à direita. |
| `capturas/timelines/21_timelines_inicial_filtro-vazio_1440_claro.png` | 21 · timelines · inicial · filtro vazio · 1440 · claro | «Fechados · 0» e «Mudou o filtro, não os dados». |

## Na página — as capturas completas

**[Abrir a página das capturas](https://claude.ai/artifact/TRj3U6pTmRT9VPDBTLFh65)** (privada; só tu a vês até a partilhares). 244 capturas em WebP, com filtros por área, largura e tema; clicar abre a imagem inteira.

Agrupadas por pasta. Nome: `pagina_estado_largura_tema`.

### calendario

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `calendario_proximos-30-fev-vira-2-mar_1440_claro_RECORTE.webp` | calendario · proximos 30 fev vira 2 mar · 1440 · claro · RECORTE | 320×140 |

### cliente

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `proposta_adulterado_390_claro.webp` | Página da proposta — link adulterado (390 px · claro) | 390×844 |
| `proposta_codigo-curto-aleatorio_390_claro.webp` | Página da proposta — código curto ao calhas (390 px · claro) | 390×844 |
| `proposta_expirado_390_claro.webp` | Página da proposta — link expirado (390 px · claro) | 390×844 |
| `proposta_inventado_390_claro.webp` | Página da proposta — link inventado (390 px · claro) | 390×844 |
| `proposta_valido_1440_claro.webp` | Página da proposta do cliente — link válido (1440 px · claro) | 1440×4472 |
| `proposta_valido_390_claro.webp` | Página da proposta do cliente — link válido (390 px · claro) | 390×5562 |
| `proposta_valido_390_escuro.webp` | Página da proposta do cliente — link válido (390 px · escuro) | 390×5562 |

### emails

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `email-cliente-en_renderizado_390_claro.webp` | Email «Pedido recebido» (EN) (390 px · claro) | 390×1952 |
| `email-cliente-en_renderizado_390_escuro.webp` | Email «Pedido recebido» (EN) (390 px · escuro) | 390×1952 |
| `email-cliente-en_renderizado_640_claro.webp` | Email «Pedido recebido» (EN) (640 px · claro) | 640×1896 |
| `email-cliente-en_renderizado_640_escuro.webp` | Email «Pedido recebido» (EN) (640 px · escuro) | 640×1896 |
| `email-cliente-pt_renderizado_390_claro.webp` | Email «Pedido recebido» (PT) (390 px · claro) | 390×1977 |
| `email-cliente-pt_renderizado_390_escuro.webp` | Email «Pedido recebido» (PT) (390 px · escuro) | 390×1977 |
| `email-cliente-pt_renderizado_640_claro.webp` | Email «Pedido recebido» (PT) (640 px · claro) | 640×1896 |
| `email-cliente-pt_renderizado_640_escuro.webp` | Email «Pedido recebido» (PT) (640 px · escuro) | 640×1896 |
| `email-equipa_renderizado_390_claro.webp` | Email «Novo pedido» (equipa) (390 px · claro) | 390×1240 |
| `email-equipa_renderizado_390_escuro.webp` | Email «Novo pedido» (equipa) (390 px · escuro) | 390×1240 |
| `email-equipa_renderizado_640_claro.webp` | Email «Novo pedido» (equipa) (640 px · claro) | 640×1179 |
| `email-equipa_renderizado_640_escuro.webp` | Email «Novo pedido» (equipa) (640 px · escuro) | 640×1179 |
| `email-proposta_no-estudio_1440_claro.webp` | email-proposta (1440 px · claro) | 1440×900 |

### material

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `material_barra-de-pesquisa-desalinhada_1440_claro_RECORTE.webp` | material · barra de pesquisa desalinhada · 1440 · claro · RECORTE | 1360×180 |

### modelos-email

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `modelos-email_mensagem-codificada_1440_claro_RECORTE.webp` | modelos email · mensagem codificada · 1440 · claro · RECORTE | 446×1037 |

### pdf

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `proposta_TESTE-Ana-longa_pt_pagina-01.webp` | PDF da proposta (30 linhas) — página 01 | 1178×833 |
| `proposta_TESTE-Ana-longa_pt_pagina-02.webp` | PDF da proposta (30 linhas) — página 02 | 1178×833 |
| `proposta_TESTE-Ana-longa_pt_pagina-03.webp` | PDF da proposta (30 linhas) — página 03 | 1178×833 |
| `proposta_TESTE-Ana-longa_pt_pagina-04.webp` | PDF da proposta (30 linhas) — página 04 | 1178×833 |
| `proposta_TESTE-Ana-longa_pt_pagina-05.webp` | PDF da proposta (30 linhas) — página 05 | 1178×833 |
| `proposta_TESTE-Ana-longa_pt_pagina-06.webp` | PDF da proposta (30 linhas) — página 06 | 1178×833 |
| `proposta_TESTE-Ana-longa_pt_pagina-07.webp` | PDF da proposta (30 linhas) — página 07 | 1178×833 |
| `proposta_TESTE-Ana-longa_pt_pagina-08.webp` | PDF da proposta (30 linhas) — página 08 | 1178×833 |
| `proposta_TESTE-Ana-longa_pt_pagina-09.webp` | PDF da proposta (30 linhas) — página 09 | 1178×833 |
| `proposta_TESTE-Ana-longa_pt_pagina-10.webp` | PDF da proposta (30 linhas) — página 10 | 1178×833 |
| `proposta_servicos-linha-com-quebra-sobreposta_pt_RECORTE.webp` | proposta · servicos linha com quebra sobreposta · pt · RECORTE | 900×120 |

### pedidos

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `novo-pedido_dialogo-erros_1440_claro.webp` | Novo pedido manual — Enter com tudo vazio (1440 px · claro) | 1440×900 |
| `novo-pedido_dialogo_1440_claro.webp` | Novo pedido manual — aberto (1440 px · claro) | 1440×900 |
| `pedido_ficha-evento-topo_1440_claro_ZOOM.webp` | pedido · ficha evento topo · 1440 · claro · ZOOM | 1440×1150 |
| `pedido_ficha-evento_1440_claro.webp` | Ficha do pedido (dossiê) (1440 px · claro) | 1440×8580 |
| `pedido_ficha-evento_1440_escuro.webp` | Ficha do pedido (dossiê) (1440 px · escuro) | 1440×8580 |
| `pedido_ficha-evento_390_claro.webp` | Ficha do pedido (dossiê) (390 px · claro) | 390×11273 |
| `pedido_ficha_1440_claro.webp` | Clicar no pedido → abre o estúdio (1440 px · claro) | 1440×4685 |
| `pedido_ficha_390_claro.webp` | Clicar no pedido → abre o estúdio (390 px · claro) | 390×6264 |
| `pedido_ficha_ecra_1440_claro.webp` | Clicar no pedido → abre o estúdio (ecrã) (1440 px · claro) | 1440×900 |
| `pedido_ficha_ecra_390_claro.webp` | Clicar no pedido → abre o estúdio (ecrã) (390 px · claro) | 390×844 |
| `pedidos_linha-TESTE-Ano-Cinco_1440_claro_RECORTE.webp` | Pedidos — linha de TESTE Ano Cinco_1440_claro (recorte) | 2201×45 |
| `pedidos_linha-TESTE-Data-Impossivel_1440_claro_RECORTE.webp` | Pedidos — linha de TESTE Data Impossível_1440_claro (recorte) | 2201×45 |
| `pedidos_linha-TESTE-Data-Passada_1440_claro_RECORTE.webp` | Pedidos — linha de TESTE Data Passada_1440_claro (recorte) | 2201×45 |
| `pedidos_linha-TESTE-Data-Texto_1440_claro_RECORTE.webp` | Pedidos — linha de TESTE Data Texto_1440_claro (recorte) | 2201×45 |
| `pedidos_lista_procura-sem-resultados_1440_claro.webp` | Pesquisa sem resultados (1440 px · claro) | 1440×900 |
| `pedidos_menu-qualquer-espera_1440_claro.webp` | Pedidos — menu aberto: qualquer espera (1440 px · claro) | 1440×900 |
| `pedidos_menu-quem-espera-ha-mais-tempo_1440_claro.webp` | Pedidos — menu aberto: quem espera há mais tempo (1440 px · claro) | 1440×900 |
| `pedidos_menu-todas-as-categorias_1440_claro.webp` | Pedidos — menu aberto: todas as categorias (1440 px · claro) | 1440×900 |
| `pedidos_menu-todos-os-meses_1440_claro.webp` | Pedidos — menu aberto: todos os meses (1440 px · claro) | 1440×900 |
| `pedidos_procura-evora-sem-acento-0-resultados_1440_claro.webp` | Pesquisa «evora» sem acento: 0 (1440 px · claro) | 1440×900 |

### propostas

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `enviar_a-gerar_1440_claro.webp` | Passo 3 — logo depois do duplo clique (1440 px · claro) | 1440×900 |
| `enviar_canal-whatsapp_1440_claro.webp` | Passo 3 — canal WhatsApp escolhido (1440 px · claro) | 1440×3143 |
| `enviar_depois-do-clique_1440_claro.webp` | Passo 3 — a confirmação «Confirmar/Cancelar» (1440 px · claro) | 1440×900 |
| `enviar_passo3_1440_claro.webp` | Passo 3 — enviar (página inteira) (1440 px · claro) | 1440×2469 |
| `enviar_passo3_390_claro.webp` | Passo 3 — enviar (página inteira) (390 px · claro) | 390×3930 |
| `enviar_passo3_390_escuro.webp` | Passo 3 — enviar (página inteira) (390 px · escuro) | 390×3930 |
| `enviar_passo3_ecra_390_claro.webp` | Passo 3 — enviar (ecrã) (390 px · claro) | 390×844 |
| `enviar_passo3_ecra_390_escuro.webp` | Passo 3 — enviar (ecrã) (390 px · escuro) | 390×844 |
| `enviar_resultado-sem-smtp_1440_claro.webp` | Passo 3 — resultado sem email configurado (1440 px · claro) | 1440×900 |
| `enviar_resultado-sem-smtp_pagina_1440_claro.webp` | enviar · resultado sem smtp · pagina (1440 px · claro) | 1440×2469 |
| `enviar_whatsapp-resultado_1440_claro.webp` | Passo 3 — resultado do WhatsApp (erro, sem link) (1440 px · claro) | 1440×900 |
| `estudio_criar-a-partir-de_1440_claro.webp` | «Criar a partir de…» aberto (1440 px · claro) | 1440×900 |
| `estudio_depois-de-aplicar-modelo_1440_claro.webp` | Depois de aplicar um modelo (Anular 10 s) (1440 px · claro) | 1440×900 |
| `estudio_duas-pessoas_sessao1_1440_claro.webp` | Duas pessoas — sessão 1 (não avisada) (1440 px · claro) | 1440×900 |
| `estudio_duas-pessoas_sessao2_1440_claro.webp` | Duas pessoas — sessão 2 (avisada) (1440 px · claro) | 1440×900 |
| `estudio_inicial_1440_claro.webp` | Estúdio — ao abrir, antes de escrever (1440 px · claro) | 1440×4506 |
| `estudio_inicial_1440_escuro.webp` | Estúdio — ao abrir, antes de escrever (1440 px · escuro) | 1440×5196 |
| `estudio_inicial_390_claro.webp` | Estúdio — ao abrir, antes de escrever (390 px · claro) | 390×6420 |
| `estudio_inicial_390_escuro.webp` | Estúdio — ao abrir, antes de escrever (390 px · escuro) | 390×6420 |
| `estudio_rotulo-invisivel-em-escuro_1440_escuro_RECORTE.webp` | estudio · rotulo invisivel em escuro · 1440 · escuro · RECORTE | 760×130 |
| `estudio_sessao-expirada_1440_claro.webp` | Sessão expirada a meio (1440 px · claro) | 1440×900 |
| `fazer-proposta_escolher-cliente_1440_claro.webp` | Fazer proposta — escolher o cliente (1440 px · claro) | 1440×2400 |
| `fazer-proposta_escolher-cliente_390_claro.webp` | Fazer proposta — escolher o cliente (390 px · claro) | 390×2310 |
| `fazer-proposta_escolher-cliente_390_escuro.webp` | Fazer proposta — escolher o cliente (390 px · escuro) | 390×2310 |
| `pre-visualizar_1440_claro.webp` | Passo 2 — pré-visualizar (página inteira) (1440 px · claro) | 1440×1270 |
| `pre-visualizar_390_claro.webp` | Passo 2 — pré-visualizar (página inteira) (390 px · claro) | 390×1340 |
| `pre-visualizar_390_escuro.webp` | Passo 2 — pré-visualizar (página inteira) (390 px · escuro) | 390×1340 |
| `pre-visualizar_fundo-ecra-real_1440_claro.webp` | Passo 2 — fundo da página no ecrã real (nada tapado) (1440 px · claro) | 1440×900 |
| `pre-visualizar_fundo-ecra-real_390_claro.webp` | Passo 2 — fundo da página no ecrã real (nada tapado) (390 px · claro) | 390×844 |
| `propostas_linha-aberta_1440_claro.webp` | Propostas — depois de clicar na linha (nada muda) (1440 px · claro) | 1440×900 |

### site

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `orcamento_confirmacao_1440_claro.webp` | Formulário do site — página de confirmação (1440 px · claro) | 1440×2721 |
| `orcamento_confirmacao_390_claro.webp` | Formulário do site — página de confirmação (390 px · claro) | 390×4421 |
| `orcamento_formulario-erros_1440_claro.webp` | Formulário do site — enviado vazio (erros) (1440 px · claro) | 1440×900 |
| `orcamento_formulario-erros_390_claro.webp` | Formulário do site — enviado vazio (erros) (390 px · claro) | 390×844 |
| `orcamento_formulario-preenchido_1440_claro.webp` | Formulário do site — preenchido (1440 px · claro) | 1440×2073 |
| `orcamento_formulario-preenchido_390_claro.webp` | Formulário do site — preenchido (390 px · claro) | 390×2709 |
| `orcamento_formulario-vazio_1440_claro.webp` | Formulário do site — vazio (1440 px · claro) | 1440×1456 |
| `orcamento_formulario-vazio_390_claro.webp` | Formulário do site — vazio (390 px · claro) | 390×2061 |

### vistas/acompanhamento

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `acompanhamento_inicial_1024_claro.webp` | Acompanhamento — ao abrir (1024 px · claro) | 1024×768 |
| `acompanhamento_inicial_1024_escuro.webp` | Acompanhamento — ao abrir (1024 px · escuro) | 1024×768 |
| `acompanhamento_inicial_1440_claro.webp` | Acompanhamento — ao abrir (1440 px · claro) | 1440×900 |
| `acompanhamento_inicial_1440_escuro.webp` | Acompanhamento — ao abrir (1440 px · escuro) | 1440×900 |
| `acompanhamento_inicial_390_claro.webp` | Acompanhamento — ao abrir (390 px · claro) | 390×844 |
| `acompanhamento_inicial_390_escuro.webp` | Acompanhamento — ao abrir (390 px · escuro) | 390×844 |
| `acompanhamento_inicial_768_claro.webp` | Acompanhamento — ao abrir (768 px · claro) | 768×1024 |
| `acompanhamento_inicial_768_escuro.webp` | Acompanhamento — ao abrir (768 px · escuro) | 768×1024 |

### vistas/calendario

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `calendario_inicial_1024_claro.webp` | Calendário — ao abrir (1024 px · claro) | 1024×1207 |
| `calendario_inicial_1024_escuro.webp` | Calendário — ao abrir (1024 px · escuro) | 1024×1207 |
| `calendario_inicial_1440_claro.webp` | Calendário — ao abrir (1440 px · claro) | 1440×1237 |
| `calendario_inicial_1440_escuro.webp` | Calendário — ao abrir (1440 px · escuro) | 1440×1237 |
| `calendario_inicial_390_claro.webp` | Calendário — ao abrir (390 px · claro) | 390×1659 |
| `calendario_inicial_390_escuro.webp` | Calendário — ao abrir (390 px · escuro) | 390×1659 |
| `calendario_inicial_768_claro.webp` | Calendário — ao abrir (768 px · claro) | 768×1821 |
| `calendario_inicial_768_escuro.webp` | Calendário — ao abrir (768 px · escuro) | 768×1821 |

### vistas/clientes

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `clientes_inicial_1024_claro.webp` | Clientes — ao abrir (1024 px · claro) | 1024×768 |
| `clientes_inicial_1024_escuro.webp` | Clientes — ao abrir (1024 px · escuro) | 1024×768 |
| `clientes_inicial_1440_claro.webp` | Clientes — ao abrir (1440 px · claro) | 1440×900 |
| `clientes_inicial_1440_escuro.webp` | Clientes — ao abrir (1440 px · escuro) | 1440×900 |
| `clientes_inicial_390_claro.webp` | Clientes — ao abrir (390 px · claro) | 390×844 |
| `clientes_inicial_390_escuro.webp` | Clientes — ao abrir (390 px · escuro) | 390×844 |
| `clientes_inicial_768_claro.webp` | Clientes — ao abrir (768 px · claro) | 768×1024 |
| `clientes_inicial_768_escuro.webp` | Clientes — ao abrir (768 px · escuro) | 768×1024 |

### vistas/contratos

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `contratos_inicial_1024_claro.webp` | Propostas Aceites — ao abrir (1024 px · claro) | 1024×768 |
| `contratos_inicial_1024_escuro.webp` | Propostas Aceites — ao abrir (1024 px · escuro) | 1024×768 |
| `contratos_inicial_1440_claro.webp` | Propostas Aceites — ao abrir (1440 px · claro) | 1440×900 |
| `contratos_inicial_1440_escuro.webp` | Propostas Aceites — ao abrir (1440 px · escuro) | 1440×900 |
| `contratos_inicial_390_claro.webp` | Propostas Aceites — ao abrir (390 px · claro) | 390×844 |
| `contratos_inicial_390_escuro.webp` | Propostas Aceites — ao abrir (390 px · escuro) | 390×844 |
| `contratos_inicial_768_claro.webp` | Propostas Aceites — ao abrir (768 px · claro) | 768×1024 |
| `contratos_inicial_768_escuro.webp` | Propostas Aceites — ao abrir (768 px · escuro) | 768×1024 |

### vistas/definicoes

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `definicoes_inicial_1024_claro.webp` | Definições — ao abrir (1024 px · claro) | 1024×1806 |
| `definicoes_inicial_1024_escuro.webp` | Definições — ao abrir (1024 px · escuro) | 1024×1806 |
| `definicoes_inicial_1440_claro.webp` | Definições — ao abrir (1440 px · claro) | 1440×1631 |
| `definicoes_inicial_1440_escuro.webp` | Definições — ao abrir (1440 px · escuro) | 1440×1631 |
| `definicoes_inicial_390_claro.webp` | Definições — ao abrir (390 px · claro) | 390×2383 |
| `definicoes_inicial_390_escuro.webp` | Definições — ao abrir (390 px · escuro) | 390×2383 |
| `definicoes_inicial_768_claro.webp` | Definições — ao abrir (768 px · claro) | 768×1809 |
| `definicoes_inicial_768_escuro.webp` | Definições — ao abrir (768 px · escuro) | 768×1809 |

### vistas/estatisticas

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `estatisticas_inicial_1024_claro.webp` | Estatísticas — ao abrir (1024 px · claro) | 1024×1515 |
| `estatisticas_inicial_1024_escuro.webp` | Estatísticas — ao abrir (1024 px · escuro) | 1024×2371 |
| `estatisticas_inicial_1440_claro.webp` | Estatísticas — ao abrir (1440 px · claro) | 1440×1498 |
| `estatisticas_inicial_1440_escuro.webp` | Estatísticas — ao abrir (1440 px · escuro) | 1440×2399 |
| `estatisticas_inicial_390_claro.webp` | Estatísticas — ao abrir (390 px · claro) | 390×3091 |
| `estatisticas_inicial_390_escuro.webp` | Estatísticas — ao abrir (390 px · escuro) | 390×3091 |
| `estatisticas_inicial_768_claro.webp` | Estatísticas — ao abrir (768 px · claro) | 768×1578 |
| `estatisticas_inicial_768_escuro.webp` | Estatísticas — ao abrir (768 px · escuro) | 768×2694 |

### vistas/fazer-proposta

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `fazer-proposta_inicial_1024_claro.webp` | Fazer proposta — ao abrir (1024 px · claro) | 1024×2397 |
| `fazer-proposta_inicial_1024_escuro.webp` | Fazer proposta — ao abrir (1024 px · escuro) | 1024×2623 |
| `fazer-proposta_inicial_1440_claro.webp` | Fazer proposta — ao abrir (1440 px · claro) | 1440×2400 |
| `fazer-proposta_inicial_1440_escuro.webp` | Fazer proposta — ao abrir (1440 px · escuro) | 1440×2400 |
| `fazer-proposta_inicial_390_claro.webp` | Fazer proposta — ao abrir (390 px · claro) | 390×2310 |
| `fazer-proposta_inicial_390_escuro.webp` | Fazer proposta — ao abrir (390 px · escuro) | 390×2530 |
| `fazer-proposta_inicial_768_claro.webp` | Fazer proposta — ao abrir (768 px · claro) | 768×2273 |
| `fazer-proposta_inicial_768_escuro.webp` | Fazer proposta — ao abrir (768 px · escuro) | 768×2494 |

### vistas/fornecedores

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `fornecedores_inicial_1024_claro.webp` | Fornecedores — ao abrir (1024 px · claro) | 1024×768 |
| `fornecedores_inicial_1024_escuro.webp` | Fornecedores — ao abrir (1024 px · escuro) | 1024×768 |
| `fornecedores_inicial_1440_claro.webp` | Fornecedores — ao abrir (1440 px · claro) | 1440×900 |
| `fornecedores_inicial_1440_escuro.webp` | Fornecedores — ao abrir (1440 px · escuro) | 1440×900 |
| `fornecedores_inicial_390_claro.webp` | Fornecedores — ao abrir (390 px · claro) | 390×844 |
| `fornecedores_inicial_390_escuro.webp` | Fornecedores — ao abrir (390 px · escuro) | 390×844 |
| `fornecedores_inicial_768_claro.webp` | Fornecedores — ao abrir (768 px · claro) | 768×1024 |
| `fornecedores_inicial_768_escuro.webp` | Fornecedores — ao abrir (768 px · escuro) | 768×1024 |

### vistas/guioes

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `guioes_inicial_1024_claro.webp` | Timelines — ao abrir (1024 px · claro) | 1024×768 |
| `guioes_inicial_1024_escuro.webp` | Timelines — ao abrir (1024 px · escuro) | 1024×768 |
| `guioes_inicial_1440_claro.webp` | Timelines — ao abrir (1440 px · claro) | 1440×900 |
| `guioes_inicial_1440_escuro.webp` | Timelines — ao abrir (1440 px · escuro) | 1440×900 |
| `guioes_inicial_390_claro.webp` | Timelines — ao abrir (390 px · claro) | 417×903 |
| `guioes_inicial_390_escuro.webp` | Timelines — ao abrir (390 px · escuro) | 454×983 |
| `guioes_inicial_768_claro.webp` | Timelines — ao abrir (768 px · claro) | 768×1024 |
| `guioes_inicial_768_escuro.webp` | Timelines — ao abrir (768 px · escuro) | 768×1024 |

### vistas/inventario

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `inventario_inicial_1024_claro.webp` | Inventário — ao abrir (1024 px · claro) | 1024×768 |
| `inventario_inicial_1024_escuro.webp` | Inventário — ao abrir (1024 px · escuro) | 1024×768 |
| `inventario_inicial_1440_claro.webp` | Inventário — ao abrir (1440 px · claro) | 1440×900 |
| `inventario_inicial_1440_escuro.webp` | Inventário — ao abrir (1440 px · escuro) | 1440×900 |
| `inventario_inicial_390_claro.webp` | Inventário — ao abrir (390 px · claro) | 390×844 |
| `inventario_inicial_390_escuro.webp` | Inventário — ao abrir (390 px · escuro) | 390×844 |
| `inventario_inicial_768_claro.webp` | Inventário — ao abrir (768 px · claro) | 768×1024 |
| `inventario_inicial_768_escuro.webp` | Inventário — ao abrir (768 px · escuro) | 768×1024 |

### vistas/kanban

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `kanban_inicial_1024_claro.webp` | Organização (quadro) — ao abrir (1024 px · claro) | 1024×962 |
| `kanban_inicial_1024_escuro.webp` | Organização (quadro) — ao abrir (1024 px · escuro) | 1024×922 |
| `kanban_inicial_1440_claro.webp` | Organização (quadro) — ao abrir (1440 px · claro) | 1440×1105 |
| `kanban_inicial_1440_escuro.webp` | Organização (quadro) — ao abrir (1440 px · escuro) | 1440×1065 |
| `kanban_inicial_390_claro.webp` | Organização (quadro) — ao abrir (390 px · claro) | 390×990 |
| `kanban_inicial_390_escuro.webp` | Organização (quadro) — ao abrir (390 px · escuro) | 390×990 |
| `kanban_inicial_768_claro.webp` | Organização (quadro) — ao abrir (768 px · claro) | 768×1237 |
| `kanban_inicial_768_escuro.webp` | Organização (quadro) — ao abrir (768 px · escuro) | 768×1200 |

### vistas/material

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `material_inicial_1024_claro.webp` | Material — ao abrir (1024 px · claro) | 1024×1332 |
| `material_inicial_1024_escuro.webp` | Material — ao abrir (1024 px · escuro) | 1024×1332 |
| `material_inicial_1440_claro.webp` | Material — ao abrir (1440 px · claro) | 1440×1336 |
| `material_inicial_1440_escuro.webp` | Material — ao abrir (1440 px · escuro) | 1440×1336 |
| `material_inicial_390_claro.webp` | Material — ao abrir (390 px · claro) | 390×1975 |
| `material_inicial_390_escuro.webp` | Material — ao abrir (390 px · escuro) | 390×1975 |
| `material_inicial_768_claro.webp` | Material — ao abrir (768 px · claro) | 768×1263 |
| `material_inicial_768_escuro.webp` | Material — ao abrir (768 px · escuro) | 768×1263 |

### vistas/modelos-email

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `modelos-email_inicial_1024_claro.webp` | Modelos de email — ao abrir (1024 px · claro) | 1024×1392 |
| `modelos-email_inicial_1024_escuro.webp` | Modelos de email — ao abrir (1024 px · escuro) | 1024×1392 |
| `modelos-email_inicial_1440_claro.webp` | Modelos de email — ao abrir (1440 px · claro) | 1440×1343 |
| `modelos-email_inicial_1440_escuro.webp` | Modelos de email — ao abrir (1440 px · escuro) | 1440×1343 |
| `modelos-email_inicial_390_claro.webp` | Modelos de email — ao abrir (390 px · claro) | 390×2685 |
| `modelos-email_inicial_390_escuro.webp` | Modelos de email — ao abrir (390 px · escuro) | 390×2685 |
| `modelos-email_inicial_768_claro.webp` | Modelos de email — ao abrir (768 px · claro) | 768×2420 |
| `modelos-email_inicial_768_escuro.webp` | Modelos de email — ao abrir (768 px · escuro) | 768×2420 |

### vistas/overview

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `overview_inicial_1024_claro.webp` | Visão Geral — ao abrir (1024 px · claro) | 1024×768 |
| `overview_inicial_1024_escuro.webp` | Visão Geral — ao abrir (1024 px · escuro) | 1024×768 |
| `overview_inicial_1440_claro.webp` | Visão Geral — ao abrir (1440 px · claro) | 1440×900 |
| `overview_inicial_1440_escuro.webp` | Visão Geral — ao abrir (1440 px · escuro) | 1440×900 |
| `overview_inicial_390_claro.webp` | Visão Geral — ao abrir (390 px · claro) | 390×844 |
| `overview_inicial_390_escuro.webp` | Visão Geral — ao abrir (390 px · escuro) | 390×844 |
| `overview_inicial_768_claro.webp` | Visão Geral — ao abrir (768 px · claro) | 768×1024 |
| `overview_inicial_768_escuro.webp` | Visão Geral — ao abrir (768 px · escuro) | 768×1024 |

### vistas/pedidos

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `pedidos_inicial_1024_claro.webp` | Pedidos — ao abrir (1024 px · claro) | 1024×1232 |
| `pedidos_inicial_1024_escuro.webp` | Pedidos — ao abrir (1024 px · escuro) | 1024×1320 |
| `pedidos_inicial_1440_claro.webp` | Pedidos — ao abrir (1440 px · claro) | 1440×1190 |
| `pedidos_inicial_1440_escuro.webp` | Pedidos — ao abrir (1440 px · escuro) | 1440×1190 |
| `pedidos_inicial_390_claro.webp` | Pedidos — ao abrir (390 px · claro) | 390×3294 |
| `pedidos_inicial_390_escuro.webp` | Pedidos — ao abrir (390 px · escuro) | 390×3650 |
| `pedidos_inicial_768_claro.webp` | Pedidos — ao abrir (768 px · claro) | 768×2981 |
| `pedidos_inicial_768_escuro.webp` | Pedidos — ao abrir (768 px · escuro) | 768×3297 |

### vistas/propostas

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `propostas_inicial_1024_claro.webp` | Propostas — ao abrir (1024 px · claro) | 1024×825 |
| `propostas_inicial_1024_escuro.webp` | Propostas — ao abrir (1024 px · escuro) | 1024×768 |
| `propostas_inicial_1440_claro.webp` | Propostas — ao abrir (1440 px · claro) | 1440×900 |
| `propostas_inicial_1440_escuro.webp` | Propostas — ao abrir (1440 px · escuro) | 1440×900 |
| `propostas_inicial_390_claro.webp` | Propostas — ao abrir (390 px · claro) | 390×903 |
| `propostas_inicial_390_escuro.webp` | Propostas — ao abrir (390 px · escuro) | 390×844 |
| `propostas_inicial_768_claro.webp` | Propostas — ao abrir (768 px · claro) | 768×1024 |
| `propostas_inicial_768_escuro.webp` | Propostas — ao abrir (768 px · escuro) | 768×1024 |

### vistas/servicos

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `servicos_inicial_1024_claro.webp` | Biblioteca de serviços — ao abrir (1024 px · claro) | 1024×768 |
| `servicos_inicial_1024_escuro.webp` | Biblioteca de serviços — ao abrir (1024 px · escuro) | 1024×768 |
| `servicos_inicial_1440_claro.webp` | Biblioteca de serviços — ao abrir (1440 px · claro) | 1440×900 |
| `servicos_inicial_1440_escuro.webp` | Biblioteca de serviços — ao abrir (1440 px · escuro) | 1440×900 |
| `servicos_inicial_390_claro.webp` | Biblioteca de serviços — ao abrir (390 px · claro) | 390×844 |
| `servicos_inicial_390_escuro.webp` | Biblioteca de serviços — ao abrir (390 px · escuro) | 390×844 |
| `servicos_inicial_768_claro.webp` | Biblioteca de serviços — ao abrir (768 px · claro) | 768×1024 |
| `servicos_inicial_768_escuro.webp` | Biblioteca de serviços — ao abrir (768 px · escuro) | 768×1024 |

### vistas/tarefas

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `tarefas_inicial_1024_claro.webp` | Tarefas — ao abrir (1024 px · claro) | 1024×1872 |
| `tarefas_inicial_1024_escuro.webp` | Tarefas — ao abrir (1024 px · escuro) | 1024×1872 |
| `tarefas_inicial_1440_claro.webp` | Tarefas — ao abrir (1440 px · claro) | 1440×1732 |
| `tarefas_inicial_1440_escuro.webp` | Tarefas — ao abrir (1440 px · escuro) | 1440×1732 |
| `tarefas_inicial_390_claro.webp` | Tarefas — ao abrir (390 px · claro) | 453×2774 |
| `tarefas_inicial_390_escuro.webp` | Tarefas — ao abrir (390 px · escuro) | 453×2774 |
| `tarefas_inicial_768_claro.webp` | Tarefas — ao abrir (768 px · claro) | 768×1739 |
| `tarefas_inicial_768_escuro.webp` | Tarefas — ao abrir (768 px · escuro) | 768×1739 |

### vistas/temas

| Ficheiro | O que mostra | Tamanho |
|---|---|---|
| `temas_inicial_1024_claro.webp` | Temas — ao abrir (1024 px · claro) | 1024×768 |
| `temas_inicial_1024_escuro.webp` | Temas — ao abrir (1024 px · escuro) | 1024×768 |
| `temas_inicial_1440_claro.webp` | Temas — ao abrir (1440 px · claro) | 1440×900 |
| `temas_inicial_1440_escuro.webp` | Temas — ao abrir (1440 px · escuro) | 1440×900 |
| `temas_inicial_390_claro.webp` | Temas — ao abrir (390 px · claro) | 390×1015 |
| `temas_inicial_390_escuro.webp` | Temas — ao abrir (390 px · escuro) | 390×1015 |
| `temas_inicial_768_claro.webp` | Temas — ao abrir (768 px · claro) | 768×1024 |
| `temas_inicial_768_escuro.webp` | Temas — ao abrir (768 px · escuro) | 768×1024 |

