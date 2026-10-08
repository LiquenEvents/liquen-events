"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "@/components/LocaleProvider";

/**
 * O corpo vem a pedido (auditoria externa, P1): o `not-found.tsx` do sítio é
 * nomeado por TODAS as rotas do grupo, e com ele o corpo do 404 seguia no
 * JavaScript de cada página — ~5 KB que só são precisos no dia em que alguém
 * erra um endereço. Com `next/dynamic` o servidor desenha-o na mesma (o HTML
 * do 404 sai completo), e o browser só o descarrega quando o 404 acontece.
 */
const NotFoundConteudo = dynamic(() => import("./NotFoundConteudo"));

/** O 404 desenhado dentro do sítio (com o cromado à volta): lê a língua do
 *  contexto e desenha o corpo partilhado com o `global-not-found.tsx`. */
export default function NotFoundView() {
  const { locale, t } = useTranslations();
  return <NotFoundConteudo locale={locale} t={t} />;
}
