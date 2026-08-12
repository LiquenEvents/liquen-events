// FICHEIRO TEMPORÁRIO — só para medir e fotografar a entrada nova sem tocar em
// AdminLogin.tsx (que está a ser mexido noutra frente). APAGAR depois de medir.
import type { Metadata } from "next";
import PreVisualizacaoDaEntrada from "./PreVisualizacaoDaEntrada";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Pagina() {
  return <PreVisualizacaoDaEntrada />;
}
