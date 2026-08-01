/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BARRA FIXA DAS VARIANTES SOCIAIS — ALTURA E ROTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Duas coisas que a barra (src/components/meta/BarraFixa.tsx) e o banner de
 * consentimento (src/components/ConsentBanner.tsx) TÊM de saber os dois, e que
 * por isso não podem viver dentro de nenhum deles.
 *
 * ── O DEFEITO QUE ISTO EXISTE PARA CORRIGIR ────────────────────────────────
 * Os dois eram `position: fixed; bottom: 0`, e o banner tem z-index maior.
 * Resultado, medido no primeiro ecrã de `/s/comporta` a 390x844:
 *
 *     barra   topo 771, altura  73, fundo 844
 *     banner  topo 663, altura 181, fundo 844   → tapava-a por inteiro
 *
 * Ou seja: o botão de WhatsApp — a acção principal da página, e a única razão
 * pela qual ela tem uma barra fixa — estava INVISÍVEL para toda a gente que
 * chega de um anúncio. E é toda a gente: quem clica num anúncio nunca esteve
 * no sítio, portanto nunca respondeu ao banner, portanto vê-o sempre.
 *
 * Foi encontrado a OLHAR para uma captura de ecrã, não por um teste. O teste
 * que eu tinha escrito verificava que o botão estava dentro da janela
 * (`y < altura`) e passava alegremente com ele debaixo do banner. Está
 * corrigido em e2e/social.spec.ts, e agora verifica que o ponto central do
 * botão pertence mesmo ao botão.
 *
 * ── A CORRECÇÃO ───────────────────────────────────────────────────────────
 * Nestas rotas o banner sobe o equivalente à altura da barra. Os dois ficam
 * visíveis ao mesmo tempo: o banner por cima, a barra colada ao fundo.
 */

/**
 * Altura da barra fixa, em pixels. MEDIDA, não estimada — ver acima.
 *
 * Se a barra mudar de tamanho (mais texto, outro espaçamento), este número
 * fica errado e o banner volta a tapá-la ou a deixar uma fresta. É por isso
 * que existe um teste que compara este valor com a altura real desenhada.
 */
export const ALTURA_BARRA_FIXA_PX = 73;

/**
 * É uma rota de variante social?
 *
 * Recebe o caminho tal como o `usePathname` o dá, que sob a reescrita do proxy
 * é a forma INTERNA (`/pt/s/comporta`) e não a pública (`/s/comporta`). Por
 * isso se procura o segmento `/s/` em qualquer posição, à imagem do que o
 * ConsentBanner já faz para o back office.
 *
 * `/servicos/…` NÃO dá positivo: o segmento pedido é barra-s-barra, e
 * "/servicos/" tem um "e" a seguir ao "s".
 */
export function ehRotaSocial(pathname: string | null | undefined): boolean {
  return typeof pathname === "string" && pathname.includes("/s/");
}
