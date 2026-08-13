/**
 * ════════════════════════════════════════════════════════════════════════════
 * IDENTIFICADORES ÚNICOS, SEM `Math.random()`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Meia dúzia de sítios do back office precisavam de "uma string diferente de
 * todas as outras": o marcador de uma foto a caminho, a chave de um item de
 * checklist, o id de uma notificação, o `id` de um `<label>`. Todos usavam
 * `Math.random().toString(36)`, cada um com a sua variante.
 *
 * ── Porque é que isso saiu ────────────────────────────────────────────────
 * O `Math.random()` não é imprevisível: é um gerador semeado pelo motor, e o
 * CodeQL assinala-o (com razão) sempre que o valor acaba a servir de
 * IDENTIFICADOR. Aqui nenhum destes ids é um segredo — mas a distinção "este é
 * inofensivo, aquele não" é exactamente o tipo de coisa que se perde quando
 * alguém copia a linha para um sítio novo. É mais barato não ter a linha.
 *
 * ── O que substitui ───────────────────────────────────────────────────────
 * Por ordem: o `crypto.randomUUID()`, o `crypto.getRandomValues()` (muito mais
 * antigo e mais disponível), e — se nenhum existir — um contador com o relógio.
 * Esse último caso NÃO é aleatório e não finge ser: é apenas único dentro deste
 * documento, que é tudo o que um marcador de interface precisa de ser.
 *
 * Se algum dia isto for preciso para um SEGREDO (um token, uma chave), não é
 * esta a função: um segredo não pode ter um caminho de recurso que devolve um
 * contador.
 */

let contador = 0;

/** Uma string única, curta e legível o suficiente para aparecer num `id` HTML. */
export function idUnico(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(9));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Sem crypto nenhum: único, não imprevisível. Ver o cabeçalho.
  return `${Date.now().toString(36)}-${(++contador).toString(36)}`;
}

/** Um id CURTO (~8 caracteres), para quando ele aparece no DOM ou numa lista. */
export function idCurto(): string {
  return idUnico().replace(/-/g, "").slice(0, 10);
}
