/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BACK OFFICE NÃO É UMA PÁGINA DO SÍTIO — E AGORA A ESTRUTURA DI-LO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Achado D-01 de uma auditoria em produção: «durante o arranque vê-se o
 * cabeçalho de marketing — SOBRE / SERVIÇOS / GALERIA / CLIENTES / PT–EN /
 * CONTACTO / PEDIR ORÇAMENTO — sobreposto ao back office, com o logótipo
 * duplicado. Não é só um flash de estilos: fui ao DOM e o `<nav>` do site
 * público está MESMO montado dentro da página de administração.»
 *
 * Estava. O back office vivia dentro do grupo `(site)`, e o layout desse grupo
 * embrulha tudo no `CromadoDoSitio` — barra de navegação, rodapé, botão de
 * WhatsApp, CTA fixo, barra de progresso, transições de página, regras de
 * pré-carregamento, registo do service worker.
 *
 * ── O QUE ESCONDIA O MENU, E PORQUE É QUE ISSO NÃO CHEGAVA ────────────────
 *
 * Uma regra no `globals.css`:
 *
 *     body.admin-mode nav[data-public-nav] { display: none !important }
 *
 * E a classe `admin-mode` só entra num `useEffect`. Ou seja: o servidor
 * desenhava o menu, o browser pintava-o, e só depois de o React hidratar é que
 * ele desaparecia. É o segundo que ela via.
 *
 * Três linhas abaixo dessa regra, no mesmo ficheiro, está a lição já aprendida:
 * o `padding-top` do `<main>` vivia na mesma classe e valia 0,128 de CLS
 * medido — «o back office inteiro saltava para cima, em todas as entradas» —, e
 * a correcção foi tirá-lo do `admin-mode` e pô-lo no HTML do servidor. A casa
 * já sabia o padrão; ao menu é que não o tinha aplicado.
 *
 * ── PORQUÊ UM GRUPO E NÃO UM `if` ────────────────────────────────────────
 *
 * É a regra que o próprio `CromadoDoSitio` escreve: «a única forma de o
 * garantir pela ESTRUTURA — em vez de por um `if` repetido em oito
 * componentes, cada um com a sua hipótese de ficar esquecido — é o cromado
 * viver num ramo por onde essas páginas não passam.»
 *
 * `(admin)` está entre parênteses, portanto NÃO aparece no endereço: o back
 * office continua em `/orcamento/admin`. Verificado na documentação do Next
 * (`route-groups.md`): os grupos são só organização, e a única regra é não
 * haver duas rotas a dar no mesmo caminho — `/orcamento` fica no `(site)`,
 * `/orcamento/admin` fica aqui, e não colidem.
 *
 * Além do menu, saem daqui os 22 pedidos por carregamento a páginas de
 * marketing (achado P-01) — eram os `<Link>` dessa barra a pré-carregarem-se,
 * no telemóvel dela, num 4G de quinta — e os links do sítio público deixam de
 * entrar na ordem de tabulação do teclado dentro do back office.
 *
 * ── E O QUE O BACK OFFICE PERDIA AO SAIR, SE ISTO NÃO EXISTISSE ──────────
 *
 * O `layout.tsx` de `/orcamento` põe um `data-orcamento-mode` SERVIDO PELO
 * SERVIDOR, e o `globals.css` pendura nele três coisas. Duas deixam de fazer
 * falta aqui (esconder o rodapé e o botão de WhatsApp — que já não são
 * montados). A terceira faz: as cores da superfície e do texto.
 *
 * Sem o marcador abaixo, o primeiro desenho do back office usaria o creme do
 * sítio público até a classe `admin-mode` chegar no `useEffect` — ou seja,
 * trocava-se o piscar do menu por um piscar de cor. Seria o mesmo defeito com
 * outra roupa, e é precisamente o que este bloco veio tirar.
 *
 * `data-admin-mode` é o irmão do `data-orcamento-mode`: um atributo no HTML do
 * servidor, que o CSS lê com `body:has(...)` no primeiro pixel. A classe
 * `admin-mode` continua a existir e fica para o que depende mesmo de JS.
 */
/**
 * ── E O `<main>`, QUE VINHA DE CARONA NO CROMADO ───────────────────────────
 *
 * Isto era um `<div>`, e faltava-lhe uma coisa que ninguém tinha reparado que
 * o back office nunca teve por si: o marco `<main>`.
 *
 * Ele vinha do `CromadoDoSitio` — `<main id="conteudo" className="flex-1
 * pt-24">` —, e ao tirar o cromado daqui foi-se com ele. MEDIDO no browser,
 * depois da mudança e antes desta correcção:
 *
 *     document.querySelector("main")            →  null
 *     raiz do back office, topo no ecrã         →  −96 px
 *
 * Duas coisas de uma vez. Um leitor de ecrã deixou de ter para onde saltar; e
 * os 96 px de cima do back office ficaram FORA do ecrã, porque cada raiz do
 * back office trazia um `-mt-24` cujo único trabalho era cancelar o `pt-24`
 * daquele `<main>`. Cancelado o cancelamento, sobrou a subtracção.
 *
 * Foi a suite de telemóvel que apanhou isto — `main li button` deixou de
 * encontrar seja o que for — e é a razão de ela existir.
 *
 * Sem `pt-24`, como no `(privado)/layout.tsx` e no `s/layout.tsx`: aqui não há
 * barra de navegação por cima, e a página começa onde a página começa. Os
 * `-mt-24` das raízes saíram todos no mesmo movimento.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="conteudo" data-admin-mode className="flex-1">
      {children}
    </main>
  );
}
