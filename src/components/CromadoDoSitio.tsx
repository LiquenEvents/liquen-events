import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import StickyCTA from "@/components/StickyCTA";
import ScrollProgress from "@/components/ScrollProgress";
import { AvisoDeCarregamento } from "@/components/AvisoDeCarregamento";
import { Cortina } from "@/components/Cortina";
import SpeculationRules from "@/components/SpeculationRules";
import PageTransition from "@/components/PageTransition";
import HeroWarm from "@/components/HeroWarm";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import SmoothScroll from "@/components/motion/SmoothScroll";
import type { Locale } from "@/lib/i18n/config";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CROMADO DO SÍTIO INSTITUCIONAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Barra de navegação, rodapé, botão flutuante de WhatsApp, CTA fixo, barra de
 * progresso, transições de página, pré-aquecimento de capas e registo do
 * service worker. Tudo isto ESTAVA no layout de raiz, ou seja em TODAS as
 * páginas, incluindo as que recebem tráfego pago.
 *
 * ── PORQUE É QUE ISTO SAIU DO LAYOUT DE RAIZ ───────────────────────────────
 * Porque as variantes sociais (`/s/*`) não podem ter menu nenhum, e a única
 * forma de o garantir pela ESTRUTURA — em vez de por um `if` repetido em oito
 * componentes, cada um com a sua hipótese de ficar esquecido — é o cromado
 * viver num ramo por onde essas páginas não passam.
 *
 * ── UMA CORRECÇÃO, PORQUE A PRIMEIRA VERSÃO DESTE COMENTÁRIO MENTIA ────────
 * Aqui esteve escrito que isto poupava a maior parte dos "207 KB de
 * JavaScript" que uma landing page paga descarrega. **É FALSO, e foi medido
 * depois de eu já o ter escrito.** Os números, do mesmo guião que produziu o
 * 207 (scripts/medir-social.mjs, perfil Instagram iOS, 390x844, 4G lento,
 * CPU a 1/4):
 *
 *   • `/casamentos/alentejo` antes desta separação:  207 KB de JS
 *   • `/casamentos/alentejo` depois:                 212 KB
 *   • `/s/comporta`, sem cromado nenhum:             225 KB
 *
 * A página SEM cromado descarrega MAIS JavaScript do que a que o tem. A razão
 * está no empacotamento: o Turbopack junta os componentes de cliente do layout
 * de raiz — que `/s/` precisa mesmo (consentimento, os dois tags de medição,
 * o provedor de idioma) — no MESMO pedaço que o cromado. Verificado à mão:
 * `grep -l whatsapp-fixed .next/static/chunks/*.js` dá um único ficheiro,
 * `1-pcd4gnokre8.js`, e esse ficheiro é pedido pelas duas páginas. São 9 KB
 * no fio.
 *
 * Os 207 KB são, quase todos, o React e o encaminhador do Next. Nenhuma
 * arrumação de componentes os tira; só os tiraria não usar o encaminhador.
 *
 * ── O QUE ESTA SEPARAÇÃO ENTÃO DÁ, E É REAL ────────────────────────────────
 * Não são bytes: é TRABALHO que deixa de acontecer. Em `/s/*` não há DOM de
 * menu nem de rodapé, não há ouvintes de scroll (barra de progresso, CTA
 * fixo, pílula de WhatsApp), não há dois IntersectionObserver, não há o
 * embrulho de transição de página, não há registo de service worker, não há
 * pré-aquecimento de capas alheias, e não há Speculation Rules a
 * pré-renderizar seis páginas que ninguém vai abrir. E, sobretudo, não há
 * menu — que era o pedido, e que é uma lista de sítios para onde a pessoa
 * pode ir que não são o formulário.
 *
 * ── QUEM O USA ─────────────────────────────────────────────────────────────
 *   • src/app/[lang]/(site)/layout.tsx  — todas as páginas institucionais
 *   • src/app/[lang]/not-found.tsx      — o 404, que tem de continuar a ter menu
 *   • src/app/[lang]/error.tsx          — idem para o ecrã de erro
 *
 * Quem NÃO o usa, de propósito: `/casamentos/*` continua a usá-lo (é uma
 * página do sítio, indexada, e uma pessoa que lá chegue organicamente precisa
 * de navegação) e `/s/*` NÃO (ver src/app/[lang]/s/layout.tsx).
 */
export default function CromadoDoSitio({
  children,
  locale,
  skipLabel,
}: {
  children: React.ReactNode;
  locale: Locale;
  skipLabel: string;
}) {
  // O `locale` desce para o rodapé e para o aviso de carregamento. Fica na
  // assinatura para quem monta o cromado ter de o fornecer, em vez de cada um
  // deles o ir buscar por sua conta a um contexto que pode não existir.
  return (
    <SmoothScroll>
      <SpeculationRules />
      <HeroWarm />
      <ServiceWorkerRegister />
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:bg-moss focus:text-white focus:rounded-md focus:text-sm"
      >
        {skipLabel}
      </a>
      {/*
        O ARRANQUE DO SÍTIO, COM O LOGÓTIPO A RESPIRAR.

        Palavras dela, com o segundo exemplo: «é isto que eu quero quando
        carrega, mas para a Líquen com a animação».

        É a MESMA peça da proposta e do back office, com a MESMA frase. Cheguei
        a pô-la aqui com o logótipo a respirar; ela viu e disse o que queria:
        «no site online não quero aquilo do logo — quero a frase a dizer
        eternizamos memórias, organizamos eventos, com o mesmo cor de fundo do
        site, aquele a verde clarinho».

        Muda só o fundo: o verde do menu e da barra, em vez do verde-quase-preto
        da proposta. No sítio a cortina não abre um documento — abre a casa, e a
        casa tem uma cor.
      */}
      <Cortina locale={locale} chaveDeSessao="cortina:sitio" />
      <ScrollProgress />
      {/*
        O aviso de que uma página está a demorar. Palavras dela: «caso demore
        tempo, quero que coloques aquela animação de está a carregar e metemos
        o logo».

        Vive AQUI, e num sítio só, porque é do sítio inteiro: os `<Link>` estão
        espalhados por vinte e dois ficheiros, e o `useLinkStatus` do Next só
        funciona dentro de um deles. Vinte e duas cópias seriam vinte e duas
        hipóteses de ficar esquecido no próximo link que alguém escrever.

        Não custa nada quando não é preciso: nasce invisível e só começa a
        aparecer aos 400 ms — uma navegação normal monta isto, não pinta um
        pixel, e desmonta.
      */}
      <AvisoDeCarregamento locale={locale} />
      <StickyCTA />
      <Navbar />
      {/* tabIndex=-1 so the skip link actually MOVES keyboard focus into
          the content (an <a href="#conteudo"> only scrolls to a non-
          focusable target — focus would stay on the skip link). */}
      <main id="conteudo" tabIndex={-1} className="flex-1 pt-24 outline-none">
        <PageTransition>{children}</PageTransition>
      </main>
      <Footer locale={locale} />
      <WhatsAppButton />
    </SmoothScroll>
  );
}
