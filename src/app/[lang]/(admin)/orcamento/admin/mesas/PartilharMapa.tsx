"use client";

import { useState, type ReactNode } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { linkDoWhatsApp } from "@/lib/whatsapp";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { Button, Field, FolhaOuDialogo } from "../ui";
import { useToast } from "../Toast";
import type { MoreMenuItem } from "../MoreMenu";
import { LogotipoEmail, LogotipoWhatsApp } from "../LogotiposDosCanais";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MANDAR E IMPRIMIR O MAPA DE MESAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (14/10): «a opção de mandar por WhatsApp, já com o logotipo do
 * WhatsApp e do e-mail. Ou, por exemplo, descarregar.» E as escolhas dela:
 *
 *   · PARA QUEM — «escolho na hora»: o email vem com o do casal do pedido, e
 *     muda-se para a quinta, o catering ou a equipa;
 *   · O WHATSAPP — o PDF pelo «Partilhar» do sistema. Nenhum site consegue
 *     anexar um ficheiro a uma conversa do WhatsApp: o que o telemóvel deixa é
 *     o `navigator.share` com o ficheiro, que abre a folha do sistema onde o
 *     WhatsApp aparece. No computador isso não existe (ou não leva ficheiros),
 *     e então descarrega-se o PDF e abre-se o WhatsApp com a frase escrita,
 *     para o arrastar para a conversa — e o aviso di-lo.
 *
 * Tudo isto é o MESMO PDF (`/api/mesas/[id]/pdf`), e antes de o pedir grava-se
 * o que está por gravar (`antes`): um mapa mandado à quinta sem a última mesa
 * que ela acabou de pôr era pior do que não o mandar.
 *
 * Devolve as linhas do menu (o «Partilhar» no computador; o «⋯» no telemóvel,
 * onde a barra de cima não tem lugar para mais um botão) e a folha do email.
 */

export function usePartilharMapa({
  pedido,
  antes,
}: {
  pedido: Quote;
  /** Grava o que está por gravar. `false` quando não conseguiu. */
  antes: () => Promise<boolean>;
}): { itens: MoreMenuItem[]; folha: ReactNode; aTrabalhar: boolean } {
  const { toast } = useToast();
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [emailAberto, setEmailAberto] = useState(false);

  const nome = pedido.name || "o evento";
  const frase = `Mapa de mesas de ${nome}${pedido.date ? ` (${pedido.date.split("-").reverse().join("/")})` : ""}.`;

  /** O PDF já gravado, pronto a dar. `null` (e o aviso dito) quando não deu. */
  async function obterPdf(): Promise<File | null> {
    if (!(await antes())) {
      toast("O mapa ainda não ficou guardado — tenta outra vez daqui a um instante.", "error");
      return null;
    }
    let res: Response;
    try {
      res = await fetch(`/api/mesas/${pedido.id}/pdf`, { cache: "no-store" });
    } catch {
      toast(porqueRebentou("preparar o PDF do mapa").mensagem, "error");
      return null;
    }
    if (!res.ok) {
      const corpo = await res.json().catch(() => null);
      toast(porqueFalhou("preparar o PDF do mapa", res, corpo).mensagem, "error");
      return null;
    }
    const ficheiro =
      /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
      "mapa-de-mesas.pdf";
    return new File([await res.blob()], ficheiro, { type: "application/pdf" });
  }

  function guardarNoDisco(f: File) {
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function comPdf(gesto: (f: File) => Promise<void> | void) {
    if (aTrabalhar) return;
    setATrabalhar(true);
    try {
      const f = await obterPdf();
      if (f) await gesto(f);
    } finally {
      setATrabalhar(false);
    }
  }

  const descarregar = () =>
    comPdf((f) => {
      guardarNoDisco(f);
      toast("PDF do mapa descarregado.", "success");
    });

  const whatsapp = () =>
    comPdf(async (f) => {
      const comFicheiro = { files: [f], title: f.name, text: frase };
      if (typeof navigator !== "undefined" && navigator.canShare?.(comFicheiro)) {
        try {
          await navigator.share(comFicheiro);
        } catch (e) {
          // Fechar a folha do sistema sem escolher não é um erro.
          if ((e as Error)?.name !== "AbortError") {
            toast("Não foi possível abrir o «Partilhar». Descarreguei o PDF.", "error");
            guardarNoDisco(f);
          }
        }
        return;
      }
      guardarNoDisco(f);
      window.open(linkDoWhatsApp(`${frase} Segue o PDF.`), "_blank", "noopener");
      toast(
        "O PDF foi descarregado e o WhatsApp abriu: escolhe a conversa e arrasta o ficheiro para lá.",
        "info",
      );
    });

  const imprimir = async () => {
    if (!(await antes())) {
      toast("O mapa ainda não ficou guardado — tenta outra vez daqui a um instante.", "error");
      return;
    }
    window.open(`/api/mesas/${pedido.id}/pdf?ver=1`, "_blank", "noopener");
  };

  const itens: MoreMenuItem[] = [
    {
      label: "Descarregar PDF",
      hint: "O desenho e a lista por mesa",
      icon: <IconeDescarregar />,
      onClick: () => void descarregar(),
    },
    {
      label: "WhatsApp",
      hint: "O PDF pelo «Partilhar»",
      icon: <LogotipoWhatsApp />,
      onClick: () => void whatsapp(),
    },
    {
      label: "Email",
      hint: "Com o PDF em anexo",
      icon: <LogotipoEmail />,
      onClick: () => setEmailAberto(true),
    },
    {
      label: "Imprimir",
      hint: "Abre o PDF para imprimir",
      icon: <IconeImprimir />,
      onClick: () => void imprimir(),
    },
  ];

  const folha = (
    <FolhaEmail
      aberta={emailAberto}
      onFechar={() => setEmailAberto(false)}
      pedido={pedido}
      frase={frase}
      antes={antes}
    />
  );

  return { itens, folha, aTrabalhar };
}

function FolhaEmail({
  aberta,
  onFechar,
  pedido,
  frase,
  antes,
}: {
  aberta: boolean;
  onFechar: () => void;
  pedido: Quote;
  frase: string;
  antes: () => Promise<boolean>;
}) {
  const { toast } = useToast();
  const [para, setPara] = useState(pedido.email ?? "");
  const [assunto, setAssunto] = useState(`Mapa de mesas — ${pedido.name || "evento"}`);
  const [mensagem, setMensagem] = useState(
    `Olá,\n\nSegue em anexo o ${frase.charAt(0).toLowerCase()}${frase.slice(1)}\n\nQualquer dúvida, diga-nos.`,
  );
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    setErro(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para.trim())) {
      setErro("Esse email não parece certo.");
      return;
    }
    setAEnviar(true);
    try {
      if (!(await antes())) {
        setErro("O mapa ainda não ficou guardado — tenta outra vez daqui a um instante.");
        return;
      }
      let res: Response;
      try {
        res = await fetch(`/api/mesas/${pedido.id}/enviar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ para: para.trim(), assunto, mensagem }),
        });
      } catch {
        setErro(porqueRebentou("mandar o mapa").mensagem);
        return;
      }
      const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setErro(corpo?.error ?? porqueFalhou("mandar o mapa", res, corpo).mensagem);
        return;
      }
      toast(`Mapa de mesas enviado para ${para.trim()}.`, "success");
      onFechar();
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <FolhaOuDialogo
      aberto={aberta}
      onFechar={onFechar}
      titulo="Mandar o mapa por email"
      descricao="O PDF segue em anexo, com a assinatura da Líquen."
      accoes={
        <>
          <Button variant="ghost" onClick={onFechar} disabled={aEnviar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void enviar()} loading={aEnviar}>
            Enviar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          as="input"
          type="email"
          label="Para"
          value={para}
          onChange={(e) => setPara(e.target.value)}
          hint="Vem com o email do casal. Podes trocar pelo da quinta, do catering ou da equipa."
          autoComplete="email"
        />
        <Field
          as="input"
          label="Assunto"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
        />
        <Field
          as="textarea"
          label="Mensagem"
          rows={5}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          className="resize-y"
        />
        {erro && (
          <p role="alert" className="text-sm text-[var(--bo-perigo)]">
            {erro}
          </p>
        )}
      </div>
    </FolhaOuDialogo>
  );
}

export function IconePartilhar() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function IconeDescarregar() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
      <path d="M5 19h14" />
    </svg>
  );
}

function IconeImprimir() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M7 14h10v7H7z" />
    </svg>
  );
}
