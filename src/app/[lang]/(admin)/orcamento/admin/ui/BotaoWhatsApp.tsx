"use client";

import { linkDoWhatsApp } from "@/lib/whatsapp";
import { ESTADO, PRESSAO } from "./movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PARTILHAR PELO WHATSAPP
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Quero que haja uma opção para partilhar logo pelo WhatsApp e apareça logo os
 * contactos do WhatsApp.»
 *
 * Abre o WhatsApp com a mensagem já escrita; a lista de contactos é a primeira
 * coisa que ele mostra, para ela escolher a quem manda. A razão de não se
 * escolher o destinatário por ela está no `lib/whatsapp.ts`.
 *
 * ── PORQUE É UM `<a>` E NÃO UM `<button>` ────────────────────────────────
 *
 * Porque é uma ida a outro sítio, e um `<a>` diz isso a toda a gente ao mesmo
 * tempo: o leitor de ecrã anuncia uma ligação, o rato mostra o destino na barra
 * de estado, e o «abrir em separador novo» do botão do meio funciona sem
 * ninguém o programar. Um `window.open()` dentro de um `onClick` faz o mesmo
 * até ao dia em que um bloqueador de pop-ups decide que não — e aí não acontece
 * nada, sem erro nenhum.
 *
 * ── A COR É A DELES, E É A ÚNICA VEZ QUE ISSO ACONTECE ───────────────────
 *
 * O `#25D366` não é um token da casa e não devia estar num ficheiro desta
 * pasta. Está, e a excepção é deliberada: um botão de WhatsApp com o verde da
 * Líquen deixa de se reconhecer num relance, e o que este botão vende é
 * exactamente esse relance. É a marca DELES, como o logótipo — e o logótipo
 * também não é um token.
 */

export interface BotaoWhatsAppProps {
  /** A mensagem que vai já escrita. */
  texto: string;
  /**
   * O rótulo. **«Mandar por WhatsApp» por omissão, e são as palavras dela.**
   *
   * Havia três frases para o mesmo gesto — «WhatsApp» na timeline, «Enviar
   * pelo WhatsApp» no estúdio, «Partilhar pelo WhatsApp» aqui por omissão. Três
   * maneiras de dizer a mesma coisa no mesmo produto obrigam a ler o botão de
   * cada vez, em vez de o reconhecer.
   *
   * Ela escolheu a frase a olhar para o botão da timeline. Fica essa, e fica
   * como OMISSÃO — assim o próximo sítio que precise de um destes herda-a sem
   * ter de a decidir outra vez.
   */
  rotulo?: string;
  className?: string;
}

export function BotaoWhatsApp({
  texto,
  rotulo = "Mandar por WhatsApp",
  className = "",
}: BotaoWhatsAppProps) {
  return (
    <a
      href={linkDoWhatsApp(texto)}
      target="_blank"
      rel="noopener noreferrer"
      title="Abre o WhatsApp com a mensagem escrita, para escolheres a quem a mandas"
      className={`bo-whatsapp alvo-toque inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium ${ESTADO} ${PRESSAO} ${className}`}
    >
      <span className="bo-whatsapp-marca" aria-hidden="true">
        <svg viewBox="0 0 32 32" className="h-[18px] w-[18px]" fill="currentColor">
          {/* O glifo oficial: a bolha com o bico em baixo à esquerda e o
              auscultador lá dentro. Um caminho só — dois caminhos com
              `fill-rule` davam um buraco branco no meio quando a cor muda. */}
          <path d="M16.04 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.26.6 4.47 1.73 6.42L3.2 28.8l6.55-1.72a12.75 12.75 0 0 0 6.29 1.64h.01c7.06 0 12.8-5.74 12.8-12.8S23.1 3.2 16.04 3.2Zm0 23.06h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.02 1.05 1.07-3.92-.25-.4a10.58 10.58 0 0 1-1.62-5.66c0-5.87 4.77-10.64 10.64-10.64 2.84 0 5.51 1.11 7.52 3.12a10.57 10.57 0 0 1 3.11 7.53c0 5.87-4.78 10.63-10.65 10.63Zm5.84-7.96c-.32-.16-1.89-.93-2.18-1.04-.3-.11-.51-.16-.72.16-.21.32-.83 1.04-1.02 1.26-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.89-1.78-2.21-.19-.32-.02-.5.14-.66.15-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.99-2.37-.26-.62-.52-.54-.72-.55l-.61-.01c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65s1.14 3.08 1.3 3.29c.16.21 2.24 3.42 5.43 4.8.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.15-1.52.27-.75.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37Z" />
        </svg>
      </span>
      {rotulo}
    </a>
  );
}
