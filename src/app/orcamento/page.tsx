import type { Metadata } from "next";
import OrcamentoForm from "./OrcamentoForm";

export const metadata: Metadata = {
  title: "Pedido de Orçamento",
  description:
    "Peça o seu orçamento à Líquen Events. Diga-nos o tipo de evento, a data e o número de pessoas — respondemos com uma proposta à medida em menos de 24 horas.",
};

export default function OrcamentoPage() {
  return <OrcamentoForm />;
}
