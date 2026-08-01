import type { Metadata } from "next";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O RAMO SOCIAL — /s/*
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As variantes que recebem tráfego de anúncios do Instagram e do Facebook.
 * Este layout existe para NÃO montar o cromado do sítio: sem barra de
 * navegação, sem rodapé, sem CTA flutuante, sem barra de progresso, sem
 * transições de página, sem pré-aquecimento de capas.
 *
 * ── PORQUE É QUE ISTO É UM LAYOUT E NÃO UM `if` ────────────────────────────
 * A alternativa era deixar o cromado no layout de raiz e cada peça
 * suprimir-se a si própria em `/s/` — é o que o ConsentBanner já faz para o
 * back office. Seriam oito `if` espalhados por oito ficheiros, cada um com a
 * sua hipótese de ficar esquecido quando alguém acrescentar a nona peça. Aqui
 * a garantia é da estrutura: estas páginas não passam pelo ramo onde o
 * cromado vive, e portanto não podem tê-lo por acidente.
 *
 * NÃO é uma poupança de bytes, e o cabeçalho de CromadoDoSitio.tsx explica
 * porquê com os números medidos — a página sem cromado descarrega até mais
 * JavaScript do que a que o tem, porque o empacotador junta o cromado ao que
 * o layout de raiz precisa de qualquer forma. O que se poupa é trabalho:
 * ouvintes, observadores, e a pré-renderização de seis páginas que ninguém
 * vai abrir.
 *
 * ── O CABEÇALHO ────────────────────────────────────────────────────────────
 * Foi pedido "tira o header ou reduz a logótipo + contacto". Está reduzido, e
 * vive dentro da própria página (`CapaSocial`), não aqui: é uma faixa de
 * 44 px com o logótipo e o telefone, desenhada por cima da fotografia, sem
 * menu nenhum. Um menu numa página destas é uma lista de sítios para onde a
 * pessoa pode ir que não são o formulário.
 *
 * ── `noindex` ──────────────────────────────────────────────────────────────
 * Declarado aqui, no layout, para valer para TODA a rota — incluindo qualquer
 * página que venha a ser acrescentada e cujo autor se esqueça. A dona foi
 * explícita: as páginas de campanha não podem competir com o sítio na
 * pesquisa orgânica. As do Google são indexadas de propósito (uma página que
 * a Google já conhece arranca com melhor Índice de Qualidade); estas não têm
 * esse argumento — o tráfego da Meta é todo pago — e portanto ficam fora.
 *
 * `follow` fica ligado: as ligações internas desta página (para a política de
 * privacidade) continuam a passar sinal, e não há nada a esconder.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
};

export default function LayoutSocial({ children }: { children: React.ReactNode }) {
  // Sem <main> com `pt-24`: aqui a fotografia começa no pixel zero, por baixo
  // da barra de estado. É o que faz a página parecer a continuação do anúncio
  // em vez de um sítio que se abriu.
  return (
    <main id="conteudo" className="flex-1">
      {children}
    </main>
  );
}
