/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ENDEREÇO DA ROTA QUE FABRICA UMA FOTOGRAFIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quatro sítios escreviam esta mesma linha à mão — a capa e a fotografia de
 * fecho no `Documento`, a grelha na `Inspiracao`, e as alternativas nas
 * `Escolhas`. Passaram a pedi-la aqui, e é aqui que está a razão.
 *
 * ── O DEFEITO QUE ISTO FECHA ─────────────────────────────────────────────
 *
 * A rota respondia `private, max-age=86400, immutable`, justificado assim:
 * «o conteúdo de um `id` dentro de um documento não muda: se ela trocar a
 * fotografia, muda o DOCUMENTO, e a versão nova é outra proposta».
 *
 * As duas metades da frase são falsas, e verificaram-se:
 *
 *  1. O `id` é POSICIONAL — `b0f2` quer dizer «a terceira fotografia do
 *     primeiro mood board» (ver `inventarioDeFotos`). Trocar essa fotografia
 *     não muda o `id`: muda o que está debaixo dele.
 *
 *  2. O MESMO link salta para a revisão mais recente — é o `maisRecente` do
 *     `proposta-do-link.ts`, e é de propósito: «ela corrigia o preço, gerava a
 *     revisão, e o casal continuava a abrir o link» que já tinha.
 *
 * Juntas: ela revê o mood board, o casal reabre o link do email, e durante 24
 * horas vê a fotografia ANTIGA naquele lugar. É o defeito que esta casa já
 * combateu uma vez — «a página na versão 2 com um botão que descarrega a 1».
 *
 * ── E TIRAR O `immutable` NÃO CHEGAVA ────────────────────────────────────
 *
 * Vale a pena dizer, porque é a correcção que parece óbvia e não é.
 *
 * O `max-age=86400` SOZINHO já manda o navegador servir da cache durante um
 * dia sem perguntar nada. O `immutable` só acrescenta que nem num recarregar
 * à mão se pergunta. Ou seja: tirá-lo deixava o defeito exactamente onde
 * estava, e dava a sensação de o ter resolvido.
 *
 * O que o resolve é o ENDEREÇO deixar de ser ambíguo.
 *
 * ── A MARCA ──────────────────────────────────────────────────────────────
 *
 * A `marca` é um resumo curto e de sentido único da referência da fotografia
 * (ver `marcaDaRef`, no `proposta-fotos.ts`). Não leva um único byte do
 * caminho real — a regra 1 desta casa mantém-se — e muda quando, e só quando,
 * a fotografia daquele lugar passa a ser outra.
 *
 * Com ela no endereço, uma fotografia revista é um endereço NOVO: o navegador
 * não tem nada guardado para ele e vai buscá-lo. E as que ela não mexeu ficam
 * com o endereço de sempre, e continuam a sair da cache sem um pedido — que é
 * o que faz reabrir a proposta ser instantâneo.
 *
 * Sem `marca` (uma fotografia de um documento antigo, um endereço partilhado à
 * mão) o endereço continua a funcionar: a rota serve-a com uma cache curta, em
 * vez de prometer um dia que não pode cumprir.
 */
export function enderecoDaRotaDaFoto(token: string, foto: { id: string; marca?: string }): string {
  const base = `/api/proposta/${encodeURIComponent(token)}/foto/${encodeURIComponent(foto.id)}`;
  return foto.marca ? `${base}?v=${encodeURIComponent(foto.marca)}` : base;
}
