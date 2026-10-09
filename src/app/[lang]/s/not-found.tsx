import type { Metadata } from "next";
import NaoEncontradoSocial from "./NaoEncontradoSocial";

/**
 * O 404 do ramo dos anúncios (`/s/*`), com os SEUS metadados.
 *
 * O desenho é um componente de cliente (`NaoEncontradoSocial`), e um ficheiro
 * `"use client"` não pode exportar `metadata` — por isso este ramo não
 * declarava título nenhum, e um `notFound()` aqui (`/s/portugal`, variante
 * que só existe em inglês) saía com o título da PÁGINA INICIAL. Só não se via
 * enquanto o 404 global era estático e lhe emprestava o dele; deixou de ser
 * quando passou a ler a língua do pedido (auditoria externa, S5/C3).
 *
 * «404» lê-se nas duas línguas, e o `noindex` diz o resto. O molde
 * `%s | Líquen Events` do layout de raiz acrescenta a marca.
 */
export const metadata: Metadata = {
  title: "404",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <NaoEncontradoSocial />;
}
