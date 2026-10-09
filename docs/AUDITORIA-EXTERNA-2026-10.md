# Corrigir os problemas da auditoria do site e back-office da Líquen Events

Fiz uma auditoria externa ao site liquen-events.com (Next.js na Vercel, Supabase).
Quero que corrijas os problemas abaixo, por ordem de prioridade.

## Regras
- Trabalha num branch novo: auditoria-correcoes. Um commit por problema, com o
  código do problema na mensagem (por exemplo "C1: corrigir scroll horizontal").
- Antes de alterar, confirma o problema no código. Se a causa for diferente da que
  descrevo, diz-me o que encontraste antes de corrigir.
- Não faças deploy, não faças push para main, não corras migrações na base de dados
  de produção. Mudanças na base de dados vão para ficheiros de migração para eu rever.
- Não mudes textos, cores nem o design, exceto onde o problema o pede.
- Depois de cada grupo de correções, corre o lint, os testes (Vitest e Playwright) e
  o build. Se algo partir, para e diz-me.
- No fim, corre o Lighthouse em modo telemóvel nas páginas /, /galeria e /orcamento
  e mostra-me os números antes e depois.

## Coisas que eu faço à mão (só me lembras no fim, não as faças)
- S1: tornar o repositório LiquenEvents/liquen-events privado no GitHub.
- S1: rodar o segredo da sessão do back-office, a chave secreta do Supabase e a
  palavra-passe SMTP, e atualizar as variáveis na Vercel.
- P6: ver nos registos da Vercel se há erros 502 reais, sobretudo em /contacto.
Antes disso, corre `gitleaks detect` sobre o histórico completo do repositório e
diz-me se alguma vez foi commitado um segredo, com o ficheiro e o commit.

## Grupo 1: Segurança

S2. public/.well-known/security.txt (ou onde for gerado):
- Apagar o comentário "NOTA (auditoria de Julho 2026)" e todo o texto interno.
- Canonical: https://liquen-events.com/.well-known/security.txt (sem www; o www
  redireciona para o domínio sem www).
- Retirar a linha Policy que aponta para o GitHub (o repositório vai ficar privado).

S3. /api/health é público e mostra o estado da base de dados, do email, das
notificações e o uptime. Ao público devolve só {"status":"ok"}. O detalhe só com
um cabeçalho de autorização (variável de ambiente HEALTH_TOKEN).

S4. A CSP tem script-src 'unsafe-inline'. Passar para nonces por pedido no
middleware (padrão oficial do Next.js), mantendo o Google Tag Manager a funcionar.
Se isto obrigar a tornar dinâmicas páginas que hoje são estáticas e em cache,
NÃO avances: diz-me o impacto primeiro.

S5 / C3. Páginas inexistentes devolvem 200 em vez de 404. Endereços de um só
segmento como /.env ou /backup.zip mostram a página inicial, porque a rota
/[lang] aceita qualquer valor. Corrigir:
- /[lang] só aceita "pt" e "en" (generateStaticParams com dynamicParams = false,
  ou notFound() para outros valores).
- A rota [...caminho] e a página "Página não encontrada" têm de devolver HTTP 404.
- Confirmar com curl que /.env, /backup.zip e /pagina-que-nao-existe devolvem 404.

## Grupo 2: Base de dados (só ficheiros de migração, não aplicar)

B1. As roles anon e authenticated têm SELECT, INSERT, UPDATE e DELETE em todas as
28 tabelas de public; hoje só o RLS sem regras as trava. Primeiro confirma no
código que o servidor usa sempre a chave secreta e nunca a chave anon/publishable
para ler ou escrever tabelas. Se for o caso, cria uma migração com:
  revoke all on all tables in schema public from anon, authenticated;
  revoke all on all sequences in schema public from anon, authenticated;
  revoke all on all functions in schema public from anon, authenticated;
  alter default privileges in schema public revoke all on tables from anon, authenticated;
  alter default privileges in schema public revoke all on sequences from anon, authenticated;
  alter default privileges in schema public revoke all on functions from anon, authenticated;
Se encontrares algum sítio que use a chave anon, diz-me antes.

B2. A função public.next_invoice_seq não fixa o search_path. Migração com
`set search_path = ''` e nomes de tabelas qualificados com public.

B4. Índices para as chaves estrangeiras sem índice:
- message_links.proposal_id
- material_rules.item_id e material_rules.list_id
- material_list_items.item_id
- biblioteca_foto_etiquetas.path

## Grupo 3: Visual e conteúdo

C1. Scroll horizontal de 38 px em computador (1440 px) nas páginas
/servicos/casamentos, /servicos/eventos-corporativos,
/servicos/festas-e-aniversarios e /servicos/batizados-e-comunhoes. A grelha de
imagens (divs "relative overflow-hidden group lg:col-span-2/3/4") e a imagem do
topo (img "object-cover hero-settle") passam do limite do ecrã. Encontrar a causa
(provável largura 100vw mais margens, ou scale no hover sem contentor com overflow)
e corrigir. Testar com Playwright a 1440, 1280, 1024 e 390 px que
document.documentElement.scrollWidth não passa da largura da janela.

A1. Há quatro chamadas para a ação ao mesmo tempo: "Pedir orçamento" na barra,
um "Pedir orçamento" flutuante em baixo à esquerda (.piso-flutuante), o botão
WhatsApp e a barra de cookies. Em computador (lg e acima), retirar o
"Pedir orçamento" flutuante. Em telemóvel, mostrá-lo só depois de passar o topo
da página e escondê-lo enquanto a barra de cookies estiver visível.

C2. /servicos e /en/servicos têm o mesmo título que a página inicial. Dar título
próprio: "Serviços de Decoração e Produção de Eventos | Líquen Events" e
"Event Decoration & Production Services | Líquen Events".

C4. Salto de layout (CLS) de cerca de 0,07 em computador em 12 páginas (regiões,
estilos, privacidade, termos) e 0,12 em telemóvel em /casamentos/acores.
Encontrar o elemento que se mexe (provavelmente a barra de cookies ou a fonte a
assentar) e reservar o espaço antes de aparecer.

C5. Contraste insuficiente em /orcamento: <p class="text-[12.5px] leading-relaxed
text-white/80">. Passar a text-white ou subir para 14 px.

C6. Entre 12 e 26 elementos clicáveis por página com menos de 24 px em computador
(rodapé, PT/EN, ícones sociais). Aumentar a área clicável para 24 px no mínimo
com padding, sem mudar o aspeto.

## Grupo 4: Desempenho (o mais importante para a fluidez)

Medições de referência (Lighthouse, telemóvel):
- Início: desempenho 59, LCP 3,1 s, TBT 3 170 ms, 1 801 KB
- Galeria: 61, LCP 3,3 s, TBT 1 930 ms, 1 328 KB
- Orçamento: 67, LCP 2,6 s, TBT 1 370 ms, 1 101 KB
Objetivo: TBT abaixo de 300 ms, LCP abaixo de 2,5 s, desempenho acima de 85.

P2. O Google é carregado duas vezes: gtag/js?id=G-29CZZ76H6F e
gtag/js?id=AW-16724349653, 361 KB e 948 ms de bloqueio. Carregar um só gtag/js e
configurar os dois IDs com gtag('config', ...). Carregar depois da página ficar
interativa (strategy="lazyOnload" ou na primeira interação). Manter exatamente o
comportamento atual do consentimento (Consent Mode v2, default denied) e
confirmar que as conversões do Google Ads continuam a disparar.

P1. Demasiado JavaScript no arranque: o react-dom e um bloco de 156 KB somam 3,6 s
de execução em telemóvel. Rever os componentes com "use client":
- Tudo o que só mostra texto e imagens passa a componente de servidor.
- Carrossel de logótipos, galeria, banner de cookies e outros componentes
  interativos que não aparecem logo no ecrã: carregar com next/dynamic.
- Lista-me os componentes cliente com o tamanho de cada um (usa o analisador de
  bundle) antes de mexer, e diz-me o que propões converter.

P3. /galeria demora 3,3 a 4,4 s a mostrar a primeira imagem. Dar prioridade
(priority / fetchpriority="high") às 4 a 6 primeiras imagens e loading="lazy" ao
resto. Confirmar que todas usam o pipeline /_img/ com AVIF.

P4 / A6. Nas grelhas das páginas de serviços, algumas imagens ficam com o
placeholder desfocado mais de 2,5 s. Pré-carregar quando a grelha está a 600 px de
entrar no ecrã (rootMargin) e fazer a transição do desfoque para a imagem em 300 ms.

P5. Imagens maiores do que o necessário:
- /imagens/EW1_0576.jpg tem 2 101 px e aparece a 479 px em
  /servicos/eventos-corporativos. Passar pelo pipeline /_img/ como as outras.
- O logótipo logo-liquen-384.webp aparece a 97 px. Usar a versão de 192 px.

## Grupo 5: Animações

A2. A barra de navegação anima height (e a altura do logótipo) ao descer a página,
o que obriga a recalcular o layout em cada frame. Manter a altura fixa e animar só
transform e opacity.

A3. A cortina de entrada da página Sobre (.cortina, 2,25 s) segura o conteúdo.
Passar para 0,8 s no máximo e mostrar só na primeira visita da sessão
(sessionStorage).

A4. O zoom das imagens ao passar o rato (duration-700, group-hover:scale) parece
lento. Passar para 400 ms, mantendo a curva cubic-bezier(0.16, 1, 0.3, 1), com
escala máxima 1.03.

A5. A seta "descer" (scroll-chevron, infinita) e a faixa de logótipos (marquee,
infinita) continuam a animar fora do ecrã. Pausar com IntersectionObserver
(animation-play-state: paused) quando saem da vista.

A8. Resposta ao toque nos botões: :active com transform: scale(.97) em 100 ms.

A9. scroll-behavior: smooth está no html. Retirar do global e aplicar só nos saltos
internos (âncoras e "voltar ao topo").

A7 (só se sobrar tempo, e mostra-me antes): View Transitions entre a página de
serviços e cada serviço, com a imagem do cartão a expandir para o topo, 400 a 500 ms,
desligado com prefers-reduced-motion.

Em todas as animações:
- Manter a curva atual cubic-bezier(0.16, 1, 0.3, 1).
- Manter o respeito por prefers-reduced-motion.
- Animar só transform e opacity.

## Entrega
No fim, dá-me:
1. Tabela com cada código (S2, S3, ..., A9), o que fizeste, os ficheiros alterados,
   e "feito", "parcial" ou "não feito" com o motivo.
2. Os números do Lighthouse antes e depois.
3. As migrações de base de dados criadas, para eu rever antes de aplicar.
4. A lista das coisas que tenho de fazer à mão.
5. Qualquer problema novo que tenhas encontrado pelo caminho.
