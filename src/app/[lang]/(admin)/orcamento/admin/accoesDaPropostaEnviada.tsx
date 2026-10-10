"use client";

import { useState } from "react";
import { dataCurta } from "@/lib/data-curta";
import type { EnvioDeProposta } from "@/lib/envios-de-proposta";
import { useToast } from "./Toast";
import { FolhaOuDialogo } from "./ui/FolhaOuDialogo";
import { Button, type AccaoDeItem } from "./ui";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SE FAZ COM UMA PROPOSTA QUE JÁ SEGUIU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «se eu quiser ver as propostas que já mandei não consigo». A
 * lista de Propostas levava ao pedido, o pedido ao estúdio, e o estúdio abria
 * no rascunho — o documento que seguiu não estava em ecrã nenhum.
 *
 * As mesmas quatro acções servem a lista de Propostas e o cartão do pedido
 * («Propostas enviadas»). Vivem aqui, uma vez: duas cópias destas funções eram
 * duas maneiras de abrir o PDF errado.
 */

/** O endereço do PDF que seguiu — servido pelo back office, com sessão. */
export const enderecoDoPdf = (quoteId: string, propostaId: string) =>
  `/api/orcamento/${encodeURIComponent(quoteId)}/propostas/${encodeURIComponent(propostaId)}/pdf`;

/** O mínimo que as acções precisam de saber de uma proposta. */
export interface PropostaParaAccoes {
  id: string;
  quoteId: string;
  /** Tem documento guardado? Sem ele não há PDF para mostrar. */
  temDoc: boolean;
  /** Já seguiu? Só uma proposta enviada tem link do casal e email. */
  enviada: boolean;
  /** Para o título da folha: «TESTE Ana · enviada 10 out 2026». */
  titulo?: string;
}

async function linkDoCasal(
  p: PropostaParaAccoes,
): Promise<{ url: string; cortado: boolean } | { erro: string }> {
  try {
    const res = await fetch(
      `/api/orcamento/${encodeURIComponent(p.quoteId)}/propostas/${encodeURIComponent(p.id)}/link`,
    );
    const j = (await res.json().catch(() => null)) as {
      url?: string;
      cortado?: boolean;
      error?: string;
    } | null;
    if (!res.ok || !j?.url) return { erro: j?.error || "Não foi possível obter o link." };
    return { url: j.url, cortado: !!j.cortado };
  } catch {
    return { erro: "Sem ligação. Tenta outra vez daqui a pouco." };
  }
}

/**
 * Uma acção para o menu da linha, e a folha que ela abre.
 *
 * ── UMA ENTRADA, E NÃO QUATRO ─────────────────────────────────────────────
 * Eram quatro entradas no menu («Ver o PDF», «Abrir como o casal vê», «Copiar
 * link», «Ver o email»), e com as que já lá estavam o menu ficava com oito: no
 * telemóvel desaparecia atrás da barra de baixo. Passa a ser UMA — «Ver o que
 * seguiu…» — e a folha junta tudo o que seguiu para o casal num sítio só: o
 * PDF, o link, e o email tal e qual.
 *
 * Devolve `accoesDe(p)` (as entradas do menu), `botaoDe(p)` (o mesmo, À VISTA)
 * e `folha` (o elemento, a desenhar uma vez no ecrã que usa isto).
 *
 * ── E À VISTA, NÃO SÓ NOS TRÊS PONTINHOS ──────────────────────────────────
 * Palavras dela, a 10/10: «eu queria algo mais visível que desse conhecimento
 * aos colaboradores da Líquen onde podem ver aquilo que está nos três
 * pontinhos». Um menu esconde o que lá está: quem não o abre não sabe que se
 * pode ver o que seguiu para o cliente. Por isso cada proposta enviada tem
 * também um botão com o nome escrito — `botaoDe(p)` — na linha, no cartão do
 * telemóvel e no cartão do pedido. O menu continua a tê-lo, para quem lá vai.
 */
export function useAccoesDaPropostaEnviada() {
  const { toast } = useToast();
  const [aberta, setAberta] = useState<PropostaParaAccoes | null>(null);
  const [email, setEmail] = useState<{
    aCarregar: boolean;
    envio: EnvioDeProposta | null;
    erro?: string;
  } | null>(null);

  const abrirPdf = (p: PropostaParaAccoes) =>
    // Uma URL da casa num separador novo, e não um blob: a CSP do site não
    // deixa mostrar um blob:PDF, e este endereço abre no leitor do browser.
    window.open(enderecoDoPdf(p.quoteId, p.id), "_blank", "noopener");

  function abrirComoOCasal(p: PropostaParaAccoes) {
    // A janela abre-se JÁ, dentro do toque: um `window.open` depois de um
    // `await` é bloqueado no Safari como janela não pedida.
    const janela = window.open("about:blank", "_blank");
    void linkDoCasal(p).then((r) => {
      if ("erro" in r) {
        janela?.close();
        toast(r.erro, "error");
        return;
      }
      if (janela) {
        janela.opener = null;
        janela.location.href = r.url;
      } else {
        window.location.href = r.url;
      }
      if (r.cortado) {
        toast("Os links deste pedido foram cortados — o casal já não consegue abrir este.", "info");
      }
    });
  }

  function copiarLink(p: PropostaParaAccoes) {
    const pedido = linkDoCasal(p);
    /**
     * `ClipboardItem` com uma PROMESSA: a cópia fica autorizada pelo toque e o
     * texto chega quando o servidor responder. Um `writeText` depois do
     * `await` falha no Safari pela mesma razão do `window.open` acima.
     */
    const texto = pedido.then((r) => {
      if ("erro" in r) throw new Error(r.erro);
      return new Blob([r.url], { type: "text/plain" });
    });
    const copiar =
      typeof ClipboardItem !== "undefined" && navigator.clipboard?.write
        ? navigator.clipboard.write([new ClipboardItem({ "text/plain": texto })])
        : pedido.then((r) => {
            if ("erro" in r) throw new Error(r.erro);
            return navigator.clipboard.writeText(r.url);
          });
    void copiar
      .then(async () => {
        const r = await pedido;
        const cortado = !("erro" in r) && r.cortado;
        toast(
          cortado
            ? "Link copiado — mas os links deste pedido foram cortados, e o casal já não o abre."
            : "Link copiado",
          cortado ? "info" : "success",
        );
      })
      .catch(async () => {
        const r = await pedido;
        toast("erro" in r ? r.erro : "Não deu para copiar o link.", "error");
      });
  }

  async function lerEmail(p: PropostaParaAccoes) {
    setEmail({ aCarregar: true, envio: null });
    try {
      const res = await fetch(`/api/orcamento/${encodeURIComponent(p.quoteId)}/envios`);
      const j = (await res.json().catch(() => null)) as { envios?: EnvioDeProposta[] } | null;
      if (!res.ok || !j?.envios) throw new Error();
      // O email DESTA proposta. Os envios mais antigos não traziam o id da
      // proposta: aí não se adivinha — diz-se que não há cópia.
      const envio = [...j.envios].reverse().find((e) => e.propostaId === p.id) ?? null;
      setEmail({ aCarregar: false, envio });
    } catch {
      setEmail({ aCarregar: false, envio: null, erro: "Não foi possível ler o email enviado." });
    }
  }

  function abrirFolha(p: PropostaParaAccoes) {
    setAberta(p);
    void lerEmail(p);
  }

  function accoesDe(p: PropostaParaAccoes): AccaoDeItem[] {
    if (p.enviada) {
      return [{ id: "seguiu", rotulo: "Ver o que seguiu…", onAccao: () => abrirFolha(p) }];
    }
    return p.temDoc ? [{ id: "pdf", rotulo: "Ver o PDF", onAccao: () => abrirPdf(p) }] : [];
  }

  /** O botão visível da linha. Só nas enviadas: um rascunho não seguiu. */
  function botaoDe(p: PropostaParaAccoes, opcoes: { largo?: boolean } = {}) {
    if (!p.enviada) return null;
    return (
      <Button
        size="sm"
        variant="subtle"
        fullWidth={opcoes.largo}
        onClick={(e) => {
          // Vive dentro de linhas e cartões que abrem o pedido ao toque.
          e.stopPropagation();
          abrirFolha(p);
        }}
        aria-label={`Ver o que seguiu para o cliente — ${p.titulo}`}
        className="whitespace-nowrap"
      >
        Ver o que seguiu
      </Button>
    );
  }

  const folha = (
    <FolhaOuDialogo
      aberto={!!aberta}
      onFechar={() => {
        setAberta(null);
        setEmail(null);
      }}
      titulo="O que seguiu para o cliente"
      sobretitulo={aberta?.titulo}
      largura="md"
      nivel={90}
    >
      {aberta && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            {aberta.temDoc && (
              <Button size="sm" variant="primary" onClick={() => abrirPdf(aberta)}>
                Abrir o PDF que seguiu
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => abrirComoOCasal(aberta)}>
              Abrir como o casal vê
            </Button>
            <Button size="sm" variant="secondary" onClick={() => copiarLink(aberta)}>
              Copiar link
            </Button>
          </div>
          <section aria-label="Email enviado" className="flex flex-col gap-2">
            <p className="bo-eyebrow text-[var(--bo-text-muted)]">Email enviado</p>
            {!email || email.aCarregar ? (
              <p className="text-sm text-[var(--bo-text-muted)]">A ler…</p>
            ) : email.erro ? (
              <p className="text-sm text-[var(--bo-text-muted)]">{email.erro}</p>
            ) : !email.envio ? (
              <p className="text-sm leading-relaxed text-[var(--bo-text-muted)]">
                Não há cópia do email desta proposta. Ou seguiu só por WhatsApp, ou foi enviada
                antes de as cópias se guardarem.
              </p>
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-[var(--bo-text-muted)]">Para</dt>
                  <dd className="break-all text-[var(--bo-text)]">{email.envio.para}</dd>
                  <dt className="text-[var(--bo-text-muted)]">Quando</dt>
                  <dd className="text-[var(--bo-text)]">{dataCurta(email.envio.enviadoEm)}</dd>
                  <dt className="text-[var(--bo-text-muted)]">Assunto</dt>
                  <dd className="text-[var(--bo-text)]">{email.envio.assunto}</dd>
                  {email.envio.anexo && (
                    <>
                      <dt className="text-[var(--bo-text-muted)]">Anexo</dt>
                      <dd className="break-all text-[var(--bo-text)]">{email.envio.anexo.nome}</dd>
                    </>
                  )}
                </dl>
                <p className="whitespace-pre-wrap rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] px-3 py-2.5 leading-relaxed text-[var(--bo-tinta-72)]">
                  {email.envio.texto}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </FolhaOuDialogo>
  );

  return { accoesDe, botaoDe, folha };
}
