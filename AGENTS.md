<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# O `next dev` da 16.3.3 não é o produto — e duas coisas partem-se só lá

Medido, nas três combinações, com o mesmo código:

|  | `next dev` 16.2.11 | `next dev` 16.3.3 | `next start` 16.3.3 |
|---|---|---|---|
| recarregar SEM REDE uma página do cache do service worker | hidrata | **não hidrata** | hidrata |
| reabrir o back office na última secção (cookie `liquen-admin-view`) | restaura | **não restaura**, e reescreve o cookie para `overview` | restaura |

A versão fica: fecha um crítico. E o produto está bom — o que se parte é o
servidor de DESENVOLVIMENTO, que é onde três suites de passeios têm de correr
porque precisam de GRAVAR (o servidor de produção recusa escritas sem Supabase).

**REMEDIDO na 16.3.8** (a subida que fecha o RCE do `next/og`, GHSA-vcvr-r3jv-pc5j):
a linha do COOKIE continua igual — pôr `?v=temas` grava `liquen-admin-view=temas`,
e reabrir `/orcamento/admin` sem parâmetro cai na Visão Geral **e reescreve o
cookie para `overview`**. A tabela vale na mesma, e as consequências práticas
aqui em baixo também.

A linha do SEM REDE não foi remedida: precisa de um service worker e de cortar a
rede, e tem passeio próprio com guarda contra produção
(`e2e/o-ecra-volta-vivo-sem-rede.spec.ts`). Fica por medir, e está dito.

Consequências práticas, se um passeio ficar vermelho sem razão aparente:

  · não semeies a secção pelo `localStorage` — pede-a pelo endereço público,
    `/orcamento/admin?v=<secção>`, que o SERVIDOR resolve;
  · e nesse caso espera pela hidratação antes de clicar, porque o cabeçalho
    passa a vir desenhado do servidor e deixa de a provar. O sinal é a classe
    `admin-mode` no `body` (o `data-admin-mode` é o irmão que vem do servidor e
    não serve);
  · o que dependa de hidratar depois de um recarregar sem rede não se pode
    provar em `dev` — tem guarda próprio contra produção
    (`e2e/o-ecra-volta-vivo-sem-rede.spec.ts`).
