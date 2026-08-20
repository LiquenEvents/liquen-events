"use client";

import { useEffect, useState } from "react";

/**
 * A NOTA DA PROPOSTA, VISTA DA FICHA DO PEDIDO.
 *
 * ── Porquê aqui também ─────────────────────────────────────────────────────
 * A nota escreve-se no estúdio, com a proposta à frente («quer ficar por baixo
 * dos 8.000 €», «quem decide é a mãe»). Mas quem abre o pedido três semanas
 * depois — para responder ao telefone, para mudar o estado, para dar o preço a
 * outra pessoa — não passa pelo estúdio. Era exactamente aí que a frase se
 * perdia.
 *
 * ── SÓ SE LÊ, E ISSO É DE PROPÓSITO ────────────────────────────────────────
 * A ficha já tem uma caixa de notas — as `adminNotes`, que são do PEDIDO e se
 * gravam aqui. Esta é a nota da PROPOSTA e edita-se onde ela vive. Duas caixas
 * a aceitar escrita na mesma coluna, cada uma a gravar num sítio, é a maneira
 * mais rápida de uma nota ser escrita no sítio onde ninguém a vai procurar.
 * Por isso esta mostra-se, e diz onde se muda.
 *
 * ── CALA-SE QUANDO NÃO HÁ NADA ─────────────────────────────────────────────
 * Sem rascunho, sem nota, ou sem rede: não desenha nada. Um cartão vazio a
 * dizer «sem notas» em todos os pedidos que ainda não têm proposta seria ruído
 * na ficha inteira, e a falha de rede não é notícia nenhuma para quem só quer
 * mudar o estado do pedido.
 */
export default function NotaDaProposta({ quoteId }: { quoteId: string }) {
  const [nota, setNota] = useState<string>("");

  // Sem reposição do estado à cabeça do efeito: quem monta este cartão dá-lhe
  // `key={quoteId}`, portanto trocar de pedido é uma montagem nova e não um
  // `quoteId` novo na mesma instância. Repor aqui era um `setState` dentro do
  // efeito — uma renderização em cascata a cada abertura da ficha.
  useEffect(() => {
    let vivo = true;
    fetch(`/api/orcamento/${encodeURIComponent(quoteId)}/proposta-rascunho`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo) return;
        const texto = j?.draft?.doc?.notasInternas;
        if (typeof texto === "string" && texto.trim()) setNota(texto.trim());
      })
      .catch(() => {
        /* sem rede a ficha é o que era — ver o cabeçalho */
      });
    return () => {
      vivo = false;
    };
  }, [quoteId]);

  if (!nota) return null;

  return (
    <div className="rounded-xl border border-[#c9a227]/30 bg-[#f6efd8]/60 p-3">
      <p className="flex flex-wrap items-center gap-x-1.5 text-[10px] font-medium tracking-[0.12em] uppercase text-[#7a6420]">
        <span aria-hidden="true">✎</span>
        Nota da proposta
        <span className="font-normal normal-case tracking-normal text-[#7a6420]/70">
          — escreve-se no estúdio, nunca sai na proposta
        </span>
      </p>
      {/* `whitespace-pre-wrap`: a nota escreve-se em linhas («abaixo dos 8.000
          €» numa, «decide a mãe» noutra) e juntá-las num parágrafo só é perder
          a única arrumação que ela tem. */}
      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground/75">
        {nota}
      </p>
    </div>
  );
}
