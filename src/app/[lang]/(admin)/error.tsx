"use client";

import { useEffect, useState } from "react";
import { log } from "@/lib/logger";
import { Button } from "./orcamento/admin/ui";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ECRÃ DE ERRO DO BACK OFFICE — a casa não tinha um, e isso via-se
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O sítio público tem `(site)/error.tsx`. O back office não tinha nada, e
 * portanto qualquer excepção num componente de cliente caía no
 * `app/global-error.tsx`, que diz:
 *
 *     «Algo correu mal.»
 *     «Pedimos desculpa pelo incómodo. Tente novamente — se o problema
 *      persistir, contacte-nos diretamente.»
 *
 * Três coisas erradas de uma vez, e todas contra regras que esta casa já tem
 * escritas:
 *
 *  1. «Algo correu mal» é a frase que a regra dela proíbe pelo nome: «se
 *     falhar, dizer o que aconteceu, porquê e o que fazer — nunca "algo correu
 *     mal"». É a única frase do produto inteiro que a viola.
 *
 *  2. Está em «você», e o `TOM-DE-VOZ.md` fixa que o back office se escreve
 *     por TU. Quem lê isto trabalha aqui.
 *
 *  3. «Contacte-nos directamente» é dito a quem trabalha na empresa. Convida
 *     a colaboradora a contactar a própria casa onde trabalha.
 *
 * ── O QUE ESTE ECRÃ FAZ, QUE O OUTRO NÃO FAZIA ────────────────────────────
 *
 * O QUE ACONTECEU. Não «algo»: um ecrã do back office parou. E diz-se logo o
 * que interessa a seguir — que a paragem é do desenho da página, não de uma
 * gravação, portanto o que já foi para o servidor está lá.
 *
 * O QUE FAZER, por ordem de custo: tentar desenhar outra vez (`reset()`, que
 * não recarrega a página nem perde o que está em memória noutros ecrãs), e só
 * depois recarregar de vez.
 *
 * O QUE NÃO SE PERDEU. É a outra regra dela — «se falhar, não perder
 * trabalho» —, e aqui não basta ser verdade, tem de ser DITO, senão a pessoa
 * assume o pior e refaz tudo. O «Guardar tudo» da barra sabe nomear o que
 * ficou por gravar; este ecrã aponta para lá em vez de repetir a promessa.
 *
 * A MARCA DO ERRO. O `digest` é o número que liga este ecrã ao registo do
 * servidor. Sem ele, «rebentou-me uma coisa ontem» não é diagnosticável. Com
 * ele, é uma linha de registo. Fica visível e à mão para copiar — não escondido
 * atrás de um «detalhes técnicos», porque quem o lê é a equipa, não um
 * visitante a quem se queira poupar o susto.
 *
 * ── O QUE ESTE ECRÃ AINDA NÃO FAZ ─────────────────────────────────────────
 *
 * Não faz chegar o erro a lado nenhum. O `log.error` daqui morre na consola do
 * telemóvel: o transporte para fora está preso a uma variável de ambiente sem
 * `NEXT_PUBLIC_`, portanto é `undefined` no browser. Ou seja: hoje, um erro no
 * iPhone dela só se sabe se ela o contar.
 *
 * Isso é uma correcção com outro tamanho — mexe no transporte e no que se pode
 * ou não mandar para fora sem levar dados de casais atrás — e vai num bloco
 * próprio. Fica dito aqui para não se pensar que já está resolvido.
 */
export default function ErroDoBackOffice({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copiada, setCopiada] = useState(false);

  useEffect(() => {
    log.error("ecrã do back office parou", error);
  }, [error]);

  /** A marca que liga este ecrã ao registo do servidor. */
  const marca = error.digest ?? null;

  async function copiarMarca() {
    if (!marca) return;
    try {
      await navigator.clipboard.writeText(marca);
      setCopiada(true);
      window.setTimeout(() => setCopiada(false), 2000);
    } catch {
      // Sem área de transferência (Safari sem gesto, permissão negada): o
      // número está no ecrã e lê-se. Não se estraga o ecrã de erro por causa
      // de um atalho que falhou.
      setCopiada(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-[var(--bo-text)] mb-3 text-lg font-semibold">Este ecrã parou.</h1>

        <p className="text-[var(--bo-text-muted)] mb-2 text-sm leading-relaxed">
          Foi o desenho da página que falhou, não uma gravação. O que já tinhas enviado para o
          servidor está guardado.
        </p>

        <p className="text-[var(--bo-text-muted)] mb-6 text-sm leading-relaxed">
          Tenta desenhar outra vez. Se voltar a acontecer, recarrega. E se tinhas coisas por
          gravar, o <strong className="font-medium">Guardar tudo</strong> na barra de cima diz quais
          são, pelo nome.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={reset}>
            Tentar outra vez
          </Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Recarregar a página
          </Button>
        </div>

        {marca ? (
          <div className="border-[var(--bo-hairline)] mt-8 border-t pt-4">
            <p className="text-[var(--bo-text-faint)] mb-2 text-xs leading-relaxed">
              Se me contares o que estavas a fazer, este número diz-me qual foi o erro:
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="bg-[var(--bo-surface-sunken)] text-[var(--bo-text-muted)] rounded-md px-2 py-1 font-mono text-xs">
                {marca}
              </code>
              <Button variant="ghost" size="sm" onClick={copiarMarca}>
                {copiada ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
