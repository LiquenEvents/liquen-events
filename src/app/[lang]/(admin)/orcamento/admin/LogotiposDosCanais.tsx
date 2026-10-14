/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS LOGÓTIPOS DO EMAIL E DO WHATSAPP, NAS CORES DELES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela (14/10), com a captura do «Por onde segue»: «coloca mesmo os
 * logos do email coloridos e do whatsapp». Eram dois traços cinzentos na cor do
 * texto — liam-se como ícones de interface, e o que ela queria reconhecer num
 * relance era o canal.
 *
 * Os dois têm a forma de um ícone de aplicação — um quadrado de cantos
 * redondos, cheio, com o símbolo em branco por cima —, que é como os dois se
 * vêem no telemóvel dela, e é o que os faz ler-se como um par.
 *
 * As cores não são tokens da casa, e é de propósito: são a marca DELES, como o
 * logótipo. É a mesma excepção escrita para o botão do WhatsApp
 * (`ui/BotaoWhatsApp.tsx`, `.bo-whatsapp` em `admin.css`), e vive ao lado dela,
 * em `.bo-marca-*`. Só se usam onde se escolhe o canal.
 */

const TAMANHO = "h-[18px] w-[18px] shrink-0";

export function LogotipoEmail() {
  return (
    <svg viewBox="0 0 24 24" className={`${TAMANHO} bo-marca-email`} aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" className="bo-marca-fundo" />
      <rect x="5" y="7" width="14" height="10" rx="1.6" className="bo-marca-glifo" />
      <path
        d="M5.8 8 12 12.6 18.2 8"
        fill="none"
        className="bo-marca-traco"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogotipoWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" className={`${TAMANHO} bo-marca-whatsapp`} aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" className="bo-marca-fundo" />
      {/* O símbolo do `WhatsAppIcon`, reduzido a 70 % e centrado no quadrado. */}
      <g transform="translate(3.6 3.6) scale(0.7)" className="bo-marca-glifo">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </g>
    </svg>
  );
}
