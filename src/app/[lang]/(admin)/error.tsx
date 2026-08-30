"use client";

import { useEffect, useState } from "react";
import { log } from "@/lib/logger";
import { Button } from "./orcamento/admin/ui";
import { relatarErro } from "./orcamento/admin/relatar-erro";

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
 * ── E O ERRO CHEGA A QUEM O POSSA LER ─────────────────────────────────────
 *
 * Este bloco do cabeçalho dizia, quando o ecrã nasceu, que isso ainda NÃO
 * acontecia: o `log.error` daqui morre na consola do telemóvel, porque o
 * transporte para fora está preso a uma variável sem `NEXT_PUBLIC_`. «Hoje, um
 * erro no iPhone dela só se sabe se ela o contar.»
 *
 * Já não é assim. O `relatarErro` manda-o para `api/admin/erro-do-cliente`,
 * que o escreve pelo mesmo `log.error` do servidor — e portanto pela mesma
 * redacção do RGPD, que apaga emails, telefones e tokens antes de qualquer
 * coisa sair. Sem serviço externo, sem dependência nova, sem variável nova.
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
    /**
     * ── E AGORA O ERRO CHEGA A ALGUÉM QUE O POSSA LER ────────────────────
     *
     * O `log.error` acima morre na consola do telemóvel: o transporte para
     * fora está preso a uma variável sem `NEXT_PUBLIC_`. Era a lacuna que
     * ficou escrita no cabeçalho deste ficheiro quando ele nasceu — «hoje, um
     * erro no iPhone dela só se sabe se ela o contar».
     *
     * O `relatarErro` manda-o para uma rota nossa, que o escreve no registo da
     * casa passando pela redacção do RGPD que já existe. Não espera, não
     * lança, e não leva o estado da página atrás.
     */
    relatarErro(error, error.digest);
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
          Tenta desenhar outra vez. Se voltar a acontecer, recarrega. E se tinhas coisas por gravar,
          o <strong className="font-medium">Guardar tudo</strong> na barra de cima diz quais são,
          pelo nome.
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
