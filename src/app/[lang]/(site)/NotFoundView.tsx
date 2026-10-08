"use client";

import { useTranslations } from "@/components/LocaleProvider";
import NotFoundConteudo from "./NotFoundConteudo";

/** O 404 desenhado dentro do sítio (com o cromado à volta): lê a língua do
 *  contexto e desenha o corpo partilhado com o `global-not-found.tsx`. */
export default function NotFoundView() {
  const { locale, t } = useTranslations();
  return <NotFoundConteudo locale={locale} t={t} />;
}
