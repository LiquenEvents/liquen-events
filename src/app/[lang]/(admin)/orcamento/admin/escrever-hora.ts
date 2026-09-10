import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESCREVER UMA HORA NUM CAMPO QUE JÁ NÃO É UMA CAIXA DO SISTEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Os passeios escreviam a hora assim:
 *
 *     await user.type(screen.getByLabelText("Hora"), "19:30");
 *
 * — porque a hora era um `<input type="time">`, e a um input escreve-se. Desde
 * o `ui/CampoDeHora` deixou de ser: ela mandou a captura da lista azul que o
 * controlo nativo abre («vamos melhorar isto para o software da Apple e com
 * uma boa animação») e a hora passou a ser DOIS controlos da casa — as horas e
 * os minutos —, cada um com a sua lista no documento.
 *
 * Este ajudante dá os gestos que ela dá. Fica num ficheiro só seu porque três
 * ficheiros de teste precisam dele, e três cópias divergem no dia em que o
 * campo mudar outra vez.
 *
 * O nome do grupo é o mesmo de sempre («Hora», «Hora de início»), e os dois
 * controlos chamam-se «<nome> — horas» e «<nome> — minutos»: é assim que quem
 * ouve o ecrã os distingue, e é por aí que se lhes pega aqui.
 */
export async function escreverHora(
  user: ReturnType<typeof userEvent.setup>,
  valor: string,
  nome = "Hora",
): Promise<void> {
  const [horas, minutos] = valor.split(":");

  await user.click(screen.getByRole("combobox", { name: `${nome} — horas` }));
  await user.click(screen.getByRole("option", { name: horas }));

  // Os minutos só ficam disponíveis depois de haver hora — sem ela, escolher
  // minutos inventava uma hora que ninguém escreveu (ver `CampoDeHora`).
  await user.click(screen.getByRole("combobox", { name: `${nome} — minutos` }));
  await user.click(screen.getByRole("option", { name: minutos }));
}
