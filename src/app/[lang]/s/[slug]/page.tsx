import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import HeroImage from "@/components/HeroImage";
import RatingBadge from "@/components/RatingBadge";
import MetaPixel from "@/components/meta/MetaPixel";
import BarraFixa from "@/components/meta/BarraFixa";
import VideoCiclo from "@/components/meta/VideoCiclo";
import PedidoRelampago, { RELAMPAGO_PT, RELAMPAGO_EN } from "@/components/meta/PedidoRelampago";
import { blurFor } from "@/lib/blur";
import { normalizeLocale } from "@/lib/i18n";
import { localizeHref } from "@/lib/i18n/config";
import { SITE } from "@/lib/site";
import {
  resolverVariante,
  todosOsCaminhos,
  conteudoVariante,
  ganchoNoIdioma,
  fotosDaVariante,
  espacosDaVariante,
} from "@/lib/meta/variantes";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A VARIANTE SOCIAL — DESENHADA PARA SCROLL, NÃO PARA PESQUISA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O destino dos anúncios do Instagram e do Facebook. NÃO é a página do Google
 * com um parâmetro: é uma página própria, com URL próprio, para os números de
 * uma fonte nunca contaminarem os da outra.
 *
 * ── A ORDEM DAS SECÇÕES, E PORQUE É ESTA ───────────────────────────────────
 * A pessoa que chega aqui estava a ver stories. Não pesquisou nada, não
 * conhece a marca, e decide em três segundos. A ordem responde às perguntas
 * dela pela ordem por que ela as faz:
 *
 *   1. CAPA        "o que é isto?"      — a fotografia DO ANÚNCIO, uma frase,
 *                                         um botão. Nada mais no primeiro ecrã.
 *   2. PROVA       "isto é real?"       — a avaliação, o número de anos, uma
 *                                         frase concreta. VEM AQUI, e não a
 *                                         meio: quem não te procurou pergunta
 *                                         isto antes de qualquer outra coisa.
 *   3. TRABALHO    "o que fazem?"       — três linhas e quatro fotografias.
 *   4. TERRENO     "conhecem a zona?"   — espaços da região, quando há.
 *   5. PEDIDO      "como falo convosco?" — quatro campos.
 *
 * Na página do Google a ordem é outra (texto longo primeiro, prova a meio),
 * e está certa lá: quem pesquisou já decidiu que quer o serviço e está a
 * avaliar quem o presta.
 *
 * ── O QUE ESTA PÁGINA NÃO TEM ──────────────────────────────────────────────
 * Sem barra de navegação, sem rodapé, sem transições de página, sem barra de
 * progresso, sem pré-aquecimento de capas de outras páginas. Não é por
 * omissão: é o layout `/s/layout.tsx` que a mantém fora desse ramo, e a razão
 * está medida em LP-AUDIT.md — o cromado do sítio eram 207 KB de JavaScript
 * numa página cujo trabalho inteiro é mostrar uma fotografia e um botão.
 *
 * Menu nenhum é intencional em segundo grau: um menu é uma lista de sítios
 * para onde a pessoa pode ir que não são o formulário.
 *
 * ── 390 PX PRIMEIRO ────────────────────────────────────────────────────────
 * Tudo aqui é uma coluna. As poucas regras `sm:`/`lg:` que existem só alargam
 * o que já funciona estreito. A página do Google faz o contrário — desenha uma
 * grelha de duas colunas e no telemóvel empurra o formulário para baixo de
 * tudo —, e é o defeito mais caro que ela tem para este tráfego.
 */

export const dynamic = "force-static";

export function generateStaticParams() {
  return todosOsCaminhos().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const locale = normalizeLocale(lang);
  const r = resolverVariante(slug);
  if (!r) return { title: locale === "en" ? "Page not found" : "Página não encontrada" };
  const c = conteudoVariante(r.variante, locale);
  // Sem `pageMetadata`: essa função emite canónico e hreflang, que só fazem
  // sentido numa página para ser indexada. Esta é `noindex` (declarado no
  // layout do ramo) e um canónico numa página noindex é um sinal contraditório.
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    openGraph: {
      title: c.metaTitle,
      description: c.metaDescription,
      images: [{ url: r.variante.capa }],
    },
  };
}

export default async function PaginaSocial({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const locale = normalizeLocale(lang);
  const r = resolverVariante(slug);
  if (!r) notFound();

  const { variante } = r;
  // Uma variante restrita a um idioma (a internacional) não é servida no
  // outro. Devolver a página em português seria servir a página nacional
  // outra vez, com outro URL — duas páginas a dizer o mesmo.
  if (variante.soEm && variante.soEm !== locale) notFound();

  const c = conteudoVariante(variante, locale);
  const gancho = ganchoNoIdioma(variante, r.gancho.id, locale);
  const textos = locale === "en" ? RELAMPAGO_EN : RELAMPAGO_PT;
  const en = locale === "en";
  const contexto = `s/${slug}`;
  const fotos = fotosDaVariante(variante);
  const espacos = espacosDaVariante(variante);
  const anos = new Date().getFullYear() - Number(SITE.founded);

  return (
    <>
      <MetaPixel contexto={contexto} />

      {/* ── 1. CAPA ─────────────────────────────────────────────────────────
          Ecrã inteiro (100svh, não 100vh: o `vh` no iPhone conta a barra do
          browser que ainda não recolheu, e a frase ficava cortada). Uma
          fotografia, uma frase, um botão — o botão é a barra fixa, que já está
          desenhada no fundo deste mesmo ecrã. */}
      <section className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden">
        <div className="absolute inset-0">
          <HeroImage
            src={variante.capa}
            alt=""
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            {...blurFor(variante.capa)}
            className="object-cover"
          />
          {/* Véu só na metade de baixo, onde está o texto. Um véu uniforme
              apagava a fotografia inteira — e a fotografia é o que dá a
              continuidade com o anúncio, que é a razão de ela estar aqui. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15" />
        </div>

        {/* O cabeçalho reduzido: logótipo e telefone. Sem menu. */}
        <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <SafeImage
            src="/logo-liquen-branco.png"
            alt={SITE.name}
            width={104}
            height={52}
            sizes="104px"
            priority
            className="h-[38px] w-auto"
          />
          <a
            href={`tel:${SITE.phone}`}
            className="text-[11px] tracking-[0.14em] text-white/80 underline underline-offset-4"
          >
            {SITE.phoneDisplay}
          </a>
        </header>

        {/* `pb-[7.5rem]` deixa a frase acima da barra fixa em vez de por baixo
            dela. É a colisão mais fácil de deixar passar num desenho com barra
            fixa, e a mais visível quando acontece. */}
        <div className="relative z-10 px-5 pb-[7.5rem] pt-24 sm:px-8">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-[30px] font-bold uppercase leading-[1.06] tracking-display text-white sm:text-[40px]">
              {gancho.titulo}
            </h1>
            {gancho.apoio ? (
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/85">
                {gancho.apoio}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── 2. PROVA, IMEDIATAMENTE ────────────────────────────────────────
          Isto na página do Google está a meio. Aqui é a segunda coisa que se
          vê, porque é a segunda pergunta de quem não te procurou. */}
      <section className="border-b border-foreground/10 bg-surface px-5 py-9 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <RatingBadge label={en ? "Google reviews" : "avaliações Google"} />
            <span className="text-[12px] uppercase tracking-[0.18em] text-foreground/55">
              {en ? `${anos} years producing weddings` : `${anos} anos a produzir casamentos`}
            </span>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-foreground/80">{c.prova}</p>
        </div>
      </section>

      {/* ── 3. O TRABALHO ─────────────────────────────────────────────────
          Três linhas, não três parágrafos. E quatro fotografias, as primeiras
          duas sem `lazy` porque no telemóvel entram no ecrã logo a seguir à
          capa — adiá-las seria adiar o que convence. */}
      <section className="px-5 py-11 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <ul className="space-y-2.5">
            {c.oQueFazemos.map((linha) => (
              <li key={linha} className="flex items-baseline gap-3 text-[16px] text-foreground/85">
                <span aria-hidden className="h-px w-4 flex-shrink-0 bg-moss" />
                {linha}
              </li>
            ))}
          </ul>

          {variante.video ? (
            <div className="mt-8 aspect-[9/16] overflow-hidden bg-foreground/5 sm:aspect-[4/5]">
              <VideoCiclo
                src={variante.video.src}
                poster={variante.video.poster}
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}

          <div className="mt-8 grid grid-cols-2 gap-2">
            {fotos.map((foto, i) => (
              <div key={foto} className="relative aspect-[4/5] overflow-hidden bg-foreground/5">
                <SafeImage
                  src={foto}
                  alt=""
                  fill
                  loading={i < 2 ? "eager" : "lazy"}
                  sizes="(max-width: 640px) 50vw, 320px"
                  {...blurFor(foto)}
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. O TERRENO ──────────────────────────────────────────────────
          Só quando há espaços listados. Uma secção com um título a dizer
          "espaços da região" e nada por baixo é pior do que secção nenhuma. */}
      {espacos.length > 0 && (
        <section className="border-y border-foreground/10 bg-surface px-5 py-10 sm:px-8">
          <div className="mx-auto max-w-2xl">
            <p className="text-[10px] uppercase tracking-[0.3em] text-foreground/45">
              {en ? "Venues we know" : "Espaços que conhecemos"}
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {espacos.map((espaco) => (
                <li
                  key={espaco}
                  className="border border-foreground/15 px-3 py-1.5 text-[12px] text-foreground/75"
                >
                  {espaco}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] leading-relaxed text-foreground/45">
              {en
                ? "If yours is not listed, tell us which it is. We will have built something like it."
                : "Se o seu não estiver na lista, diga-nos qual é. Já montámos em espaços do mesmo género."}
            </p>
          </div>
        </section>
      )}

      {/* ── 5. O PEDIDO ───────────────────────────────────────────────────
          `pb-32` deixa espaço para a barra fixa não tapar o botão de submeter
          nem o aviso de privacidade. */}
      <section className="px-2 pb-32 pt-6 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <PedidoRelampago locale={locale} textos={textos} contexto={contexto} />
        </div>
      </section>

      <BarraFixa
        contexto={contexto}
        textoWhatsApp={c.ctaWhatsApp}
        mensagemWhatsApp={c.mensagemWhatsApp}
        textoFormulario={en ? "Form" : "Formulário"}
      />

      {/* Um rodapé de uma linha. Não é o rodapé do sítio: é o mínimo legal —
          quem somos e onde está a política de privacidade. */}
      <footer className="px-5 pb-28 text-center text-[11px] text-foreground/40">
        {SITE.name} ·{" "}
        <a href={localizeHref("/privacidade", locale)} className="underline">
          {en ? "Privacy" : "Privacidade"}
        </a>
      </footer>
    </>
  );
}
