/**
 * Os ícones do mapa de mesas — à mão, em `currentColor` e com o traço da casa
 * (1,6), como os da navegação (`nav.tsx`). A casa não tem biblioteca de ícones,
 * e estes são poucos o bastante para não a justificar.
 */

import type { ReactNode } from "react";

function Icone({ children, tamanho = 18 }: { children: ReactNode; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconeVoltar = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M15 5l-7 7 7 7" />
  </Icone>
);

export const IconeMais = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M12 5v14M5 12h14" />
  </Icone>
);

export const IconeMenos = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M5 12h14" />
  </Icone>
);

export const IconeMesaRedonda = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="3.6" r="1.4" />
    <circle cx="12" cy="20.4" r="1.4" />
    <circle cx="3.6" cy="12" r="1.4" />
    <circle cx="20.4" cy="12" r="1.4" />
  </Icone>
);

export const IconeMesaComprida = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <rect x="3" y="9" width="18" height="6" rx="1.5" />
    <circle cx="7" cy="5" r="1.3" />
    <circle cx="12" cy="5" r="1.3" />
    <circle cx="17" cy="5" r="1.3" />
    <circle cx="7" cy="19" r="1.3" />
    <circle cx="12" cy="19" r="1.3" />
    <circle cx="17" cy="19" r="1.3" />
  </Icone>
);

export const IconeMesaQuadrada = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <circle cx="12" cy="3.6" r="1.3" />
    <circle cx="12" cy="20.4" r="1.3" />
    <circle cx="3.6" cy="12" r="1.3" />
    <circle cx="20.4" cy="12" r="1.3" />
  </Icone>
);

export const IconeNoivos = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
  </Icone>
);

export const IconePista = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Icone>
);

export const IconePalco = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M3 17h18M5 17v3M19 17v3" />
    <path d="M12 4v7M9.5 6.5L12 4l2.5 2.5" />
    <rect x="3" y="13" width="18" height="4" rx="1" />
  </Icone>
);

export const IconeBuffet = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M4 15a8 8 0 0 1 16 0z" />
    <path d="M2.5 18h19M12 5v2" />
  </Icone>
);

export const IconeBar = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M6 4h12l-6 8z" />
    <path d="M12 12v7M8.5 20h7" />
  </Icone>
);

export const IconeOutro = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <rect x="4" y="4" width="16" height="16" rx="3" strokeDasharray="3 2.4" />
  </Icone>
);

export const IconeVarinha = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M4 20L15 9" />
    <path d="M17 3v3M15.5 4.5h3M20 8v2M19 9h2M12 4v1.6M11.2 4.8h1.6" />
    <path d="M14 8l2 2" />
  </Icone>
);

export const IconeAnular = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icone>
);

export const IconeRefazer = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icone>
);

export const IconeDuplicar = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Icone>
);

export const IconeRodar = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v5h-5" />
  </Icone>
);

export const IconeLixo = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Icone>
);

export const IconeEncaixar = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icone>
);

export const IconePessoas = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M16 14.2A5 5 0 0 1 21 19" />
  </Icone>
);

export const IconeFechar = ({ tamanho }: { tamanho?: number } = {}) => (
  <Icone tamanho={tamanho}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icone>
);

/** O ícone de cada elemento da sala — o mesmo no menu e no desenho. */
export const ICONE_DO_ELEMENTO = {
  noivos: IconeNoivos,
  pista: IconePista,
  palco: IconePalco,
  buffet: IconeBuffet,
  bar: IconeBar,
  outro: IconeOutro,
} as const;
