import type { Metadata } from "next";
import DefinirPalavraPasse from "./DefinirPalavraPasse";

/**
 * A página onde a ligação do email vai dar.
 *
 * NÃO é uma página de sessão: quem chega aqui não tem nenhuma, e é isso que
 * veio resolver. O que a fecha é o token que vem no endereço — verificado do
 * lado do servidor, na `POST /api/admin/recuperar/definir`. Aqui não se lê o
 * token para nada a não ser reenviá-lo; nada do que esta página desenha depende
 * de ele ser válido, e por isso ela não diz (nem pode dizer) se ele é.
 */
export const metadata: Metadata = {
  title: "Definir palavra-passe — Líquen Events",
  robots: { index: false, follow: false },
};

export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  // Um `?token=a&token=b` chega como lista. Fica-se pelo primeiro em vez de
  // colar os dois numa cadeia que não é token nenhum.
  const valor = Array.isArray(token) ? (token[0] ?? "") : (token ?? "");
  return <DefinirPalavraPasse token={valor} />;
}
