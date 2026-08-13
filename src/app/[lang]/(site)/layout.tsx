import CromadoDoSitio from "@/components/CromadoDoSitio";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

/**
 * O grupo `(site)` — todas as páginas do sítio institucional.
 *
 * `(site)` está entre parênteses, portanto NÃO aparece no URL: `/servicos`
 * continua a ser `/servicos`. O que o grupo faz é separar quem leva cromado
 * (menu, rodapé, CTA fixo, transições) de quem não leva — hoje, `/s/*`, as
 * variantes que recebem tráfego de anúncios do Instagram e do Facebook.
 *
 * Ver o cabeçalho de src/components/CromadoDoSitio.tsx para a medição que
 * motivou esta separação.
 */
export default async function SiteLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ lang: string }> }>) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return (
    <CromadoDoSitio locale={locale} skipLabel={t.skipLink}>
      {children}
    </CromadoDoSitio>
  );
}
