"use client";

import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import { aspectFor } from "@/lib/image-meta";
import { useTranslations } from "@/components/LocaleProvider";
import { ViewTransition } from "@/components/vt";

/**
 * Morph thumbnail→lightbox (View Transitions API). Cada miniatura e a foto do
 * lightbox partilham um `view-transition-name` (`g-<índice do pool>`): abrir e
 * fechar animam a MESMA foto a crescer/encolher fisicamente entre os dois
 * lugares. A miniatura ativa fica sem nome enquanto o lightbox está aberto —
 * nunca há dois elementos com o mesmo nome no snapshot. Sem suporte da API
 * (React/browser), tudo funciona como antes.
 */
function VTWrap({
  name,
  exit,
  children,
}: {
  name?: string;
  exit?: string;
  children: React.ReactNode;
}) {
  if (!ViewTransition) return <>{children}</>;
  return (
    <ViewTransition name={name} share="gallery-morph" exit={exit} default="none">
      {children}
    </ViewTransition>
  );
}

type Label = "Casamento" | "Corporativo" | "Conferência" | "Aéreo" | "Evento";
interface Photo {
  src: string;
  label: Label;
}

const photos: Photo[] = [
  { src: "/imagens/20_10_2025_0044.jpg", label: "Conferência" },
  { src: "/imagens/20_10_2025_0220.jpg", label: "Conferência" },
  { src: "/imagens/20_10_2025_0225.jpg", label: "Conferência" },
  { src: "/imagens/20_10_2025_0227.jpg", label: "Conferência" },
  { src: "/imagens/20_10_2025_0244.jpg", label: "Conferência" },
  { src: "/imagens/20_10_2025_0295.jpg", label: "Conferência" },
  { src: "/imagens/20_10_2025_0302.jpg", label: "Conferência" },
  { src: "/imagens/20_10_2025_0358.jpg", label: "Conferência" },
  { src: "/imagens/20_10_2025_0375.jpg", label: "Conferência" },
  { src: "/imagens/20_10_2025_0406.jpg", label: "Conferência" },
  { src: "/imagens/20_10_2025_0407.jpg", label: "Conferência" },
  { src: "/imagens/DaniGui_Adois_25.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_Adois_27.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_Adois_57.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_Adois_58.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_Adois_61.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_Adois_66.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_Adois_78.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_1.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_3.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_6.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_11.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_14.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_15.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_17.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_18.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_24.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_26.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_27.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_35.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_39.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_41.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_43.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_48.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_JantarFesta_130.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_Preview12.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_Preview18.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_Preview19.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_Preview20.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_Preview70.jpg", label: "Casamento" },
  { src: "/imagens/DaniGui_Preview79.jpg", label: "Casamento" },
  { src: "/imagens/DJI_20250913190635_0120_D.jpg", label: "Aéreo" },
  { src: "/imagens/DJI_20250913190640_0121_D.jpg", label: "Aéreo" },
  { src: "/imagens/EW1_0362.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_0363.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_0365.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_0576.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_0580.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_0688.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_0689.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_0690.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_0697.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_0699.jpg", label: "Corporativo" },
  // NB: apesar do prefixo EW1 (maioritariamente corporativo), esta mostra os
  // noivos — verificado visualmente.
  { src: "/imagens/EW1_1100.jpg", label: "Casamento" },
  { src: "/imagens/EW1_1330.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1332.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1333.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1337.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1342.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1392.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1393.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1394.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1395.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1396.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1398.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1401.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1404.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1405.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1408.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1410.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1414.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1427.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1428.jpg", label: "Corporativo" },
  { src: "/imagens/EW1_1505.jpg", label: "Corporativo" },
  { src: "/imagens/ines-goncalo-157.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-242.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-250.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-251.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-252.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-253.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-278.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-282.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-346.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-421.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-498.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-499.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-502.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-506.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-509.jpg", label: "Casamento" },
  { src: "/imagens/ines-goncalo-510.jpg", label: "Casamento" },
  { src: "/imagens/J&P-1Y1A1828.jpg", label: "Casamento" },
  { src: "/imagens/J&P-1Y1A1933.jpg", label: "Casamento" },
  { src: "/imagens/J&P-1Y1A1970.jpg", label: "Casamento" },
  { src: "/imagens/J&P-1Y1A2021.jpg", label: "Casamento" },
  { src: "/imagens/J&P-1Y1A2024.jpg", label: "Casamento" },
  { src: "/imagens/J&P-1Y1A2025.jpg", label: "Casamento" },
  { src: "/imagens/J&P-1Y1A2031.jpg", label: "Casamento" },
  { src: "/imagens/J&P-1Y1A3489.jpg", label: "Casamento" },
  { src: "/imagens/J&P-1Y1A3710.jpg", label: "Casamento" },
  { src: "/imagens/J&P-1Y1A3715.jpg", label: "Casamento" },
  { src: "/imagens/J&P-4B6A1405.jpg", label: "Casamento" },
  { src: "/imagens/J&P-4B6A1477.jpg", label: "Casamento" },
  { src: "/imagens/J&P-4B6A1492.jpg", label: "Casamento" },
  { src: "/imagens/J&P-4B6A1495.jpg", label: "Casamento" },
  { src: "/imagens/J&P-4B6A1506.jpg", label: "Casamento" },
  { src: "/imagens/J&P-DJI_20250628164714_0165_D.jpg", label: "Aéreo" },
  { src: "/imagens/J&P-DJI_20250628174247_0187_D.jpg", label: "Aéreo" },
  { src: "/imagens/J&P-DJI_20250628174304_0188_D.jpg", label: "Aéreo" },
  { src: "/imagens/J&P-IMGL2901.jpg", label: "Casamento" },
  { src: "/imagens/J&P-IMGL2906.jpg", label: "Casamento" },
  { src: "/imagens/J&P-IMGL3185.jpg", label: "Casamento" },
  { src: "/imagens/J&P-IMGL3186.jpg", label: "Casamento" },
  { src: "/imagens/J&P-IMGL3188.jpg", label: "Casamento" },
  { src: "/imagens/J&P-IMGL4767.jpg", label: "Casamento" },
  { src: "/imagens/J&P-IMGL4769.jpg", label: "Casamento" },
  { src: "/imagens/J&P-IMGL4770.jpg", label: "Casamento" },
  { src: "/imagens/J&P-IMGL5231.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3170.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3176.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3179.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3190.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3197.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3200.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3214.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3225.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3232.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3383.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3386.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3391.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3396.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3412.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3419.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3439.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3450.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3453.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A4417.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A4430.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A4463.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A4467.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A4472.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A4738.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A5248.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A5254.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A5263.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg", label: "Aéreo" },
  { src: "/imagens/JOAO_E_PEDRO_DJI_20250628213935_0005_D.jpg", label: "Aéreo" },
  { src: "/imagens/JOAO_E_PEDRO_IMGL1561.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_IMGL2180.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_IMGL2782.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_IMGL2823.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_IMGL2825-2.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_IMGL4216.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_IMGL4226.jpg", label: "Casamento" },
  { src: "/imagens/JOAO_E_PEDRO_IMGL5023.jpg", label: "Casamento" },
  { src: "/imagens/M&F0071.jpg", label: "Casamento" },
  { src: "/imagens/M&F0082.jpg", label: "Casamento" },
  { src: "/imagens/M&F0152.jpg", label: "Casamento" },
  { src: "/imagens/M&F0153.jpg", label: "Casamento" },
  { src: "/imagens/M&F0154.jpg", label: "Casamento" },
  { src: "/imagens/M&F0477.jpg", label: "Casamento" },
  { src: "/imagens/M&F0495.jpg", label: "Casamento" },
  { src: "/imagens/M&F0497.jpg", label: "Casamento" },
  { src: "/imagens/M&F0498.jpg", label: "Casamento" },
  { src: "/imagens/M&F0502.jpg", label: "Casamento" },
  { src: "/imagens/M&F0508.jpg", label: "Casamento" },
  { src: "/imagens/M&F0511.jpg", label: "Casamento" },
  { src: "/imagens/M&F0512.jpg", label: "Casamento" },
  { src: "/imagens/M&F0513.jpg", label: "Casamento" },
  { src: "/imagens/M&F0514.jpg", label: "Casamento" },
  { src: "/imagens/M&F0515.jpg", label: "Casamento" },
  { src: "/imagens/M&F0516.jpg", label: "Casamento" },
  { src: "/imagens/M&F0658.jpg", label: "Casamento" },
  { src: "/imagens/M&F0665.jpg", label: "Casamento" },
  { src: "/imagens/M&F0670.jpg", label: "Casamento" },
  { src: "/imagens/M&F0678.jpg", label: "Casamento" },
  { src: "/imagens/M&F0712.jpg", label: "Casamento" },
  { src: "/imagens/matilde-tomas-27.jpg", label: "Casamento" },
  { src: "/imagens/matilde-tomas-28.jpg", label: "Casamento" },
  { src: "/imagens/matilde-tomas-35.jpg", label: "Casamento" },
  { src: "/imagens/matilde-tomas-36.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-5.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-7.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-8.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-23.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-167.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-198.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-199.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-203.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-205.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-206.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-260.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-315.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-375.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-617.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-619.jpg", label: "Casamento" },
  { src: "/imagens/Natalia e Jonathan-620.jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-905.jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-907 (1).jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-908 (1).jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-909.jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-911 (1).jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-914 (1).jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-915 (1).jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-916 (1).jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-918.jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-923.jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-925.jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-1131.jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-1146.jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-1163.jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-1357 (1).jpg", label: "Casamento" },
  { src: "/imagens/teresinhaeze-1434.jpg", label: "Casamento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.04.jpeg", label: "Casamento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.04 (1).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.04 (2).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.04 (3).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.04 (4).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.04 (6).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.05.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.05 (1).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.05 (2).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.02.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.03.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.04.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.11.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.13.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.14.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.15.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.16.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.17.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.18.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.19.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.20.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.21.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.21 (1).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.22.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.22 (1).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.22 (2).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.22 (3).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.30.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.30 (1).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.30 (2).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.30 (3).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.31.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.33.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.33 (1).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.33 (2).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.34.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.34 (1).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.34 (2).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.35.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.35 (1).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.35 (2).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.36.jpeg", label: "Casamento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.36 (1).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.36 (2).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.36 (3).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.37.jpeg", label: "Evento" },
  // ── Novas coleções (2026) ──
  { src: "/imagens/17860278387017661.jpg", label: "Evento" },
  { src: "/imagens/17920798061835097.jpg", label: "Evento" },
  { src: "/imagens/18002809616226216.jpg", label: "Evento" },
  { src: "/imagens/18009541247101258.jpg", label: "Evento" },
  { src: "/imagens/18030963605093473.jpg", label: "Evento" },
  { src: "/imagens/18299242414135399.jpg", label: "Evento" },
  { src: "/imagens/428658838-339551135742978-7904331374079927456-n.jpg", label: "Evento" },
  { src: "/imagens/428694133-339551105742981-427109035692944303-n.jpg", label: "Evento" },
  { src: "/imagens/428708341-339551125742979-6565889301500133407-n.jpg", label: "Evento" },
  { src: "/imagens/am20241026-miaejoao-1065.jpg", label: "Casamento" },
  { src: "/imagens/am20241026-miaejoao-1066.jpg", label: "Casamento" },
  { src: "/imagens/am20241026-miaejoao-1076.jpg", label: "Casamento" },
  { src: "/imagens/hd-edited.jpg", label: "Evento" },
  { src: "/imagens/image0.jpeg", label: "Evento" },
  { src: "/imagens/image2-1.jpeg", label: "Evento" },
  { src: "/imagens/image2.jpeg", label: "Evento" },
  { src: "/imagens/image4-1.jpeg", label: "Evento" },
  { src: "/imagens/image5-1.jpeg", label: "Evento" },
  { src: "/imagens/image6.jpeg", label: "Evento" },
  { src: "/imagens/image7.jpeg", label: "Evento" },
  { src: "/imagens/imagem-whatsapp-2025-08-18-as-23-01-39-4a836a89.jpg", label: "Evento" },
  { src: "/imagens/matilde-e-tomas0654-1.jpg", label: "Casamento" },
  { src: "/imagens/matilde-e-tomas0663.jpg", label: "Casamento" },
  { src: "/imagens/matilde-e-tomas0669.jpg", label: "Casamento" },
  { src: "/imagens/mom-0961.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-152.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-20.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-21.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-23.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-24.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-25.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-292.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-35.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-350.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-36.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-37.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-391.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-397.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-402.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-403.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-404.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-405.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-406.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-407.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-408.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-409.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-410.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-441.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-523.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-526.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-548.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-553-1.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-553.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-555-1.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-555.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-556.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-557.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-558.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-559.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-560.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-561-1.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-561.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-562.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-563.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-564.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-565.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-566.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-567.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-568.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-569.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-570.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-571-1.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-571.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-572.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-573.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-574.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-575.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-576.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-577.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-578.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-579.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-580.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-581.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-582.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-584.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-586.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-587.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-588.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-589.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-591.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-596.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-597.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-629.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-630.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-636.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-669.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-688.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-689.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-690.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-7.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-714.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-715.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-719.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-756.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-757.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-758.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-759.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-760.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-765.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-766.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-767.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-770.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-781.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-782.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-803.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-804.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-805.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-808.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-810.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-812-1.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-812.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-813.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-814.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-833.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-834-1.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-834.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-835.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-837.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-838-1.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-838.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-840.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-937.jpg", label: "Casamento" },
  { src: "/imagens/stephanie-mizio-940.jpg", label: "Casamento" },
  { src: "/imagens/J&A-8.jpg", label: "Casamento" },
  { src: "/imagens/J&A-9.jpg", label: "Casamento" },
  { src: "/imagens/J&A-10.jpg", label: "Casamento" },
  { src: "/imagens/J&A-51.jpg", label: "Casamento" },
  { src: "/imagens/J&A-52.jpg", label: "Casamento" },
  { src: "/imagens/J&A-59.jpg", label: "Casamento" },
  { src: "/imagens/J&A-67.jpg", label: "Casamento" },
  { src: "/imagens/J&A-68.jpg", label: "Casamento" },
  { src: "/imagens/J&A-69.jpg", label: "Casamento" },
  { src: "/imagens/J&A-73.jpg", label: "Casamento" },
  { src: "/imagens/J&A-76.jpg", label: "Casamento" },
  { src: "/imagens/J&A-206.jpg", label: "Casamento" },
  { src: "/imagens/J&A-207.jpg", label: "Casamento" },
  { src: "/imagens/J&A-216.jpg", label: "Casamento" },
  { src: "/imagens/J&A-218.jpg", label: "Casamento" },
  { src: "/imagens/J&A-219.jpg", label: "Casamento" },
  { src: "/imagens/J&A-225.jpg", label: "Casamento" },
  { src: "/imagens/J&A-242.jpg", label: "Casamento" },
  { src: "/imagens/J&A-243.jpg", label: "Casamento" },
  { src: "/imagens/J&A-272.jpg", label: "Casamento" },
  { src: "/imagens/J&A-338.jpg", label: "Casamento" },
  { src: "/imagens/J&A-339.jpg", label: "Casamento" },
  { src: "/imagens/J&A-342.jpg", label: "Casamento" },
  { src: "/imagens/J&A-351.jpg", label: "Casamento" },
  { src: "/imagens/J&A-368.jpg", label: "Casamento" },
  { src: "/imagens/J&A-369.jpg", label: "Casamento" },
  { src: "/imagens/J&A-370.jpg", label: "Casamento" },
  { src: "/imagens/J&A-371.jpg", label: "Casamento" },
  { src: "/imagens/J&A-372.jpg", label: "Casamento" },
  { src: "/imagens/J&A-377.jpg", label: "Casamento" },
  { src: "/imagens/J&A-387.jpg", label: "Casamento" },
  { src: "/imagens/J&A-394.jpg", label: "Casamento" },
  { src: "/imagens/J&A-421.jpg", label: "Casamento" },
  { src: "/imagens/J&A-427.jpg", label: "Casamento" },
  { src: "/imagens/J&A-442.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-122.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-123.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-128.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-129.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-130.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-131.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-133.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-135.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-573.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-574.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-575.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-576.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-577.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-578.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-579.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-580.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-582.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-583.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-584.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-585.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-586.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-587.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-588.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-593.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-594.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-595.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-596.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-598.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-599.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA-889.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-218.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-233.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-234.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-235.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-236.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-238.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-239.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-302.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-303.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-305.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-306.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-307.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-308.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-313.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-358.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-394.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-424.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-427.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-432.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-458.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-481.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-482.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-485.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-486.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-487.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-488.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-489.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-490.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-505.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-506.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-507.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-517.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-522.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-523.jpg", label: "Casamento" },
  { src: "/imagens/Sophia&Artur_MAINOVA_capa-524.jpg", label: "Casamento" },
];

// Human-readable collection (event) inferred from the file name — adds a
// curated, gallery-grade caption. Only confident matches; otherwise null.
function collectionFor(src: string): string | null {
  const f = src.toLowerCase();
  if (f.includes("danigui")) return "Daniela & Guilherme";
  if (f.includes("joao_e_pedro") || f.includes("j&p-")) return "João & Pedro";
  if (f.includes("ines-goncalo")) return "Inês & Gonçalo";
  if (f.includes("matilde-tomas") || f.includes("matilde-e-tomas")) return "Matilde & Tomás";
  if (f.includes("teresinhaeze")) return "Teresinha & Zé";
  if (f.includes("m&f")) return "Matilde & Filipe";
  if (f.includes("natalia e jonathan")) return "Natália & Jonathan";
  if (f.includes("stephanie-mizio")) return "Stephanie & Mizio";
  if (f.includes("miaejoao")) return "Mia & João";
  if (f.includes("j&a-")) return "J & A";
  if (f.includes("sophia&artur")) return "Sophia & Artur";
  return null;
}

/** The event/collection bucket a photo belongs to (named couple, else its
    category). Photos with no bucket match still cluster by category. */
function bucketKey(p: Photo): string {
  return collectionFor(p.src) ?? `cat:${p.label}`;
}

/**
 * Spread photos so the same event never clusters — no two consecutive photos
 * from the same collection (when mathematically possible) AND each collection
 * appears at its natural frequency throughout the grid, not bunched at the end.
 *
 * Method: give every photo a fractional rank `(j + 0.5) / size` — its position
 * within its own bucket, normalised to [0,1). A 100-photo shoot lands its
 * frames at 0.005, 0.015, 0.025 … so they're ~1/frequency apart across the
 * whole list; a 5-photo shoot lands at 0.1, 0.3, 0.5 … Sorting everything by
 * rank interleaves them proportionally. Deterministic (stable across
 * renders/SSR): equal-size buckets tie-break by first-appearance order, and
 * since a bucket's own ranks are all distinct it can never place itself twice
 * in a row unless it exceeds half the list (only possible inside a
 * single-collection category, where clustering is unavoidable anyway).
 */
function interleaveByCollection(list: Photo[]): Photo[] {
  const buckets = new Map<string, Photo[]>();
  const order: string[] = [];
  for (const p of list) {
    const key = bucketKey(p);
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
      order.push(key);
    }
    arr.push(p);
  }
  const ordOf = new Map(order.map((k, i) => [k, i] as const));
  const ranked: { p: Photo; rank: number; ord: number }[] = [];
  for (const key of order) {
    const arr = buckets.get(key)!;
    const ord = ordOf.get(key)!;
    for (let j = 0; j < arr.length; j++) {
      ranked.push({ p: arr[j], rank: (j + 0.5) / arr.length, ord });
    }
  }
  ranked.sort((a, b) => a.rank - b.rank || a.ord - b.ord);
  return deAdjacent(ranked.map((r) => r.p));
}

/**
 * Final safety pass: eliminate the handful of same-event neighbours the
 * fractional spread can still leave (when two ranks happen to sort together
 * with no other bucket between them). For each such spot, pull forward the
 * nearest later photo whose bucket differs from both neighbours. When a
 * category is a single collection (Corporativo, Conferência…) no fix is
 * possible — the whole shoot is one event — so it's left untouched.
 */
function deAdjacent(list: Photo[]): Photo[] {
  const out = [...list];
  for (let i = 1; i < out.length; i++) {
    if (bucketKey(out[i]) !== bucketKey(out[i - 1])) continue;
    const left = bucketKey(out[i - 1]);
    const right = i + 1 < out.length ? bucketKey(out[i + 1]) : null;
    let swap = -1;
    for (let j = i + 1; j < out.length; j++) {
      const kj = bucketKey(out[j]);
      if (kj !== left && kj !== right) {
        swap = j;
        break;
      }
    }
    if (swap !== -1) {
      const [moved] = out.splice(swap, 1);
      out.splice(i, 0, moved);
    }
  }
  return out;
}

const CATS = ["Todos", "Casamento", "Corporativo", "Conferência", "Aéreo", "Evento"] as const;
type Cat = (typeof CATS)[number];
const PAGE = 24;

// Fotos de DECORAÇÃO — arranjos, mesas postas, centros, styling e detalhes.
// A galeria abre com estas (o dono pediu "as primeiras fotos = decoração").
// Classificadas VISUALMENTE (10 Jul 2026) por coleção. Lista curada e
// facilmente extensível: acrescenta aqui o `src` de qualquer foto de decoração
// para a puxar para a frente. As coleções são intercaladas no `pool`, por isso
// o topo mistura vários casamentos.
const DECOR = new Set<string>([
  // DaniGui — jantar/reception (mesas, centros, detalhes)
  "/imagens/DaniGui_JantarFesta_1.jpg",
  "/imagens/DaniGui_JantarFesta_3.jpg",
  "/imagens/DaniGui_JantarFesta_6.jpg",
  "/imagens/DaniGui_JantarFesta_11.jpg",
  "/imagens/DaniGui_JantarFesta_14.jpg",
  "/imagens/DaniGui_JantarFesta_15.jpg",
  "/imagens/DaniGui_JantarFesta_17.jpg",
  "/imagens/DaniGui_JantarFesta_18.jpg",
  "/imagens/DaniGui_JantarFesta_24.jpg",
  "/imagens/DaniGui_JantarFesta_26.jpg",
  "/imagens/DaniGui_JantarFesta_27.jpg",
  "/imagens/DaniGui_JantarFesta_35.jpg",
  "/imagens/DaniGui_JantarFesta_39.jpg",
  "/imagens/DaniGui_JantarFesta_41.jpg",
  "/imagens/DaniGui_JantarFesta_43.jpg",
  "/imagens/DaniGui_JantarFesta_48.jpg",
  "/imagens/DaniGui_JantarFesta_130.jpg",
  // EW
  "/imagens/EW1_1393.jpg",
  // Matilde & Filipe (M&F) — mesas, velas, eucalipto, detalhes
  "/imagens/M&F0082.jpg",
  "/imagens/M&F0152.jpg",
  "/imagens/M&F0153.jpg",
  "/imagens/M&F0495.jpg",
  "/imagens/M&F0497.jpg",
  "/imagens/M&F0502.jpg",
  "/imagens/M&F0508.jpg",
  "/imagens/M&F0511.jpg",
  "/imagens/M&F0512.jpg",
  "/imagens/M&F0513.jpg",
  "/imagens/M&F0514.jpg",
  "/imagens/M&F0515.jpg",
  "/imagens/M&F0516.jpg",
  // Sophia & Artur
  "/imagens/Sophia&Artur_MAINOVA_capa-233.jpg",
  "/imagens/Sophia&Artur_MAINOVA_capa-234.jpg",
  "/imagens/Sophia&Artur_MAINOVA_capa-235.jpg",
  "/imagens/Sophia&Artur_MAINOVA_capa-236.jpg",
  "/imagens/Sophia&Artur_MAINOVA_capa-238.jpg",
  "/imagens/Sophia&Artur_MAINOVA_capa-239.jpg",
  "/imagens/Sophia&Artur_MAINOVA_capa-394.jpg",
  "/imagens/Sophia&Artur_MAINOVA-122.jpg",
  "/imagens/Sophia&Artur_MAINOVA-123.jpg",
  "/imagens/Sophia&Artur_MAINOVA-128.jpg",
  "/imagens/Sophia&Artur_MAINOVA-129.jpg",
  "/imagens/Sophia&Artur_MAINOVA-130.jpg",
  "/imagens/Sophia&Artur_MAINOVA-573.jpg",
  "/imagens/Sophia&Artur_MAINOVA-574.jpg",
  "/imagens/Sophia&Artur_MAINOVA-575.jpg",
  "/imagens/Sophia&Artur_MAINOVA-576.jpg",
  "/imagens/Sophia&Artur_MAINOVA-577.jpg",
  "/imagens/Sophia&Artur_MAINOVA-578.jpg",
  "/imagens/Sophia&Artur_MAINOVA-579.jpg",
  "/imagens/Sophia&Artur_MAINOVA-580.jpg",
  "/imagens/Sophia&Artur_MAINOVA-582.jpg",
  "/imagens/Sophia&Artur_MAINOVA-583.jpg",
  "/imagens/Sophia&Artur_MAINOVA-584.jpg",
  "/imagens/Sophia&Artur_MAINOVA-585.jpg",
  "/imagens/Sophia&Artur_MAINOVA-586.jpg",
  "/imagens/Sophia&Artur_MAINOVA-587.jpg",
  "/imagens/Sophia&Artur_MAINOVA-588.jpg",
  "/imagens/Sophia&Artur_MAINOVA-593.jpg",
  "/imagens/Sophia&Artur_MAINOVA-594.jpg",
  "/imagens/Sophia&Artur_MAINOVA-598.jpg",
  "/imagens/Sophia&Artur_MAINOVA-599.jpg",
  // João & Pedro (J&P / JOAO_E_PEDRO)
  "/imagens/J&P-1Y1A1828.jpg",
  "/imagens/J&P-1Y1A1970.jpg",
  "/imagens/J&P-1Y1A2021.jpg",
  "/imagens/J&P-1Y1A2024.jpg",
  "/imagens/J&P-1Y1A2025.jpg",
  "/imagens/J&P-1Y1A2031.jpg",
  "/imagens/J&P-1Y1A3710.jpg",
  "/imagens/J&P-1Y1A3715.jpg",
  "/imagens/J&P-4B6A1405.jpg",
  "/imagens/J&P-IMGL2901.jpg",
  "/imagens/J&P-IMGL2906.jpg",
  "/imagens/J&P-IMGL3185.jpg",
  "/imagens/J&P-IMGL3186.jpg",
  "/imagens/J&P-IMGL3188.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3170.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3176.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3179.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3190.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3197.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3200.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3232.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3383.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3386.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3391.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3396.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3412.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3419.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3439.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3450.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3453.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4417.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4430.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4463.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4472.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A5248.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A5254.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A5263.jpg",
  "/imagens/JOAO_E_PEDRO_IMGL4216.jpg",
  "/imagens/JOAO_E_PEDRO_IMGL4226.jpg",
  "/imagens/JOAO_E_PEDRO_IMGL5023.jpg",
  // Inês & Gonçalo
  "/imagens/ines-goncalo-278.jpg",
  "/imagens/ines-goncalo-282.jpg",
  // Natália & Jonathan
  "/imagens/Natalia e Jonathan-5.jpg",
  "/imagens/Natalia e Jonathan-7.jpg",
  "/imagens/Natalia e Jonathan-8.jpg",
  "/imagens/Natalia e Jonathan-23.jpg",
  "/imagens/Natalia e Jonathan-167.jpg",
  "/imagens/Natalia e Jonathan-198.jpg",
  "/imagens/Natalia e Jonathan-199.jpg",
  "/imagens/Natalia e Jonathan-203.jpg",
  "/imagens/Natalia e Jonathan-205.jpg",
  "/imagens/Natalia e Jonathan-206.jpg",
  "/imagens/Natalia e Jonathan-375.jpg",
  "/imagens/Natalia e Jonathan-617.jpg",
  "/imagens/Natalia e Jonathan-619.jpg",
  "/imagens/Natalia e Jonathan-620.jpg",
  // ── Vaga 2 (11 Jul 2026): decoração minerada das coleções restantes ──
  // Stephanie & Mizio — mesas, centros, arranjos, papelaria, styling
  "/imagens/stephanie-mizio-20.jpg",
  "/imagens/stephanie-mizio-23.jpg",
  "/imagens/stephanie-mizio-24.jpg",
  "/imagens/stephanie-mizio-25.jpg",
  "/imagens/stephanie-mizio-35.jpg",
  "/imagens/stephanie-mizio-36.jpg",
  "/imagens/stephanie-mizio-37.jpg",
  "/imagens/stephanie-mizio-152.jpg",
  "/imagens/stephanie-mizio-292.jpg",
  "/imagens/stephanie-mizio-350.jpg",
  "/imagens/stephanie-mizio-441.jpg",
  "/imagens/stephanie-mizio-523.jpg",
  "/imagens/stephanie-mizio-526.jpg",
  "/imagens/stephanie-mizio-553.jpg",
  "/imagens/stephanie-mizio-553-1.jpg",
  "/imagens/stephanie-mizio-555.jpg",
  "/imagens/stephanie-mizio-555-1.jpg",
  "/imagens/stephanie-mizio-556.jpg",
  "/imagens/stephanie-mizio-557.jpg",
  "/imagens/stephanie-mizio-558.jpg",
  "/imagens/stephanie-mizio-559.jpg",
  "/imagens/stephanie-mizio-560.jpg",
  "/imagens/stephanie-mizio-561.jpg",
  "/imagens/stephanie-mizio-561-1.jpg",
  "/imagens/stephanie-mizio-562.jpg",
  "/imagens/stephanie-mizio-563.jpg",
  "/imagens/stephanie-mizio-564.jpg",
  "/imagens/stephanie-mizio-565.jpg",
  "/imagens/stephanie-mizio-566.jpg",
  "/imagens/stephanie-mizio-567.jpg",
  "/imagens/stephanie-mizio-568.jpg",
  "/imagens/stephanie-mizio-569.jpg",
  "/imagens/stephanie-mizio-570.jpg",
  "/imagens/stephanie-mizio-571.jpg",
  "/imagens/stephanie-mizio-571-1.jpg",
  "/imagens/stephanie-mizio-572.jpg",
  "/imagens/stephanie-mizio-573.jpg",
  "/imagens/stephanie-mizio-574.jpg",
  "/imagens/stephanie-mizio-575.jpg",
  "/imagens/stephanie-mizio-576.jpg",
  "/imagens/stephanie-mizio-577.jpg",
  "/imagens/stephanie-mizio-578.jpg",
  "/imagens/stephanie-mizio-579.jpg",
  "/imagens/stephanie-mizio-580.jpg",
  "/imagens/stephanie-mizio-581.jpg",
  "/imagens/stephanie-mizio-582.jpg",
  "/imagens/stephanie-mizio-584.jpg",
  "/imagens/stephanie-mizio-937.jpg",
  "/imagens/stephanie-mizio-940.jpg",
  // J&A — ramos, mesas postas, centros, detalhes
  "/imagens/J&A-8.jpg",
  "/imagens/J&A-9.jpg",
  "/imagens/J&A-10.jpg",
  "/imagens/J&A-52.jpg",
  "/imagens/J&A-67.jpg",
  "/imagens/J&A-68.jpg",
  "/imagens/J&A-69.jpg",
  "/imagens/J&A-73.jpg",
  "/imagens/J&A-76.jpg",
  "/imagens/J&A-206.jpg",
  "/imagens/J&A-207.jpg",
  "/imagens/J&A-216.jpg",
  "/imagens/J&A-218.jpg",
  "/imagens/J&A-219.jpg",
  "/imagens/J&A-225.jpg",
  "/imagens/J&A-243.jpg",
  "/imagens/J&A-272.jpg",
  "/imagens/J&A-368.jpg",
  "/imagens/J&A-369.jpg",
  "/imagens/J&A-370.jpg",
  "/imagens/J&A-371.jpg",
  "/imagens/J&A-372.jpg",
  "/imagens/J&A-377.jpg",
  "/imagens/J&A-387.jpg",
  "/imagens/J&A-394.jpg",
  // Mia & João / Matilde & Tomás / Teresinha — planos de sala, mesas, detalhes
  "/imagens/am20241026-miaejoao-1065.jpg",
  "/imagens/am20241026-miaejoao-1066.jpg",
  "/imagens/am20241026-miaejoao-1076.jpg",
  "/imagens/matilde-e-tomas0654-1.jpg",
  "/imagens/matilde-e-tomas0663.jpg",
  "/imagens/matilde-e-tomas0669.jpg",
  "/imagens/teresinhaeze-1357 (1).jpg",
  "/imagens/teresinhaeze-1434.jpg",
  // WhatsApp (evento) — plano de sala (telhas pintadas), flores, arranjos
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.13.jpeg",
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.16.jpeg",
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.18.jpeg",
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.22 (1).jpeg",
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.22 (3).jpeg",
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.30.jpeg",
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.30 (2).jpeg",
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.30 (3).jpeg",
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.31.jpeg",
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.33 (1).jpeg",
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.34 (1).jpeg",
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.36.jpeg",
  "/imagens/WhatsApp Image 2026-05-21 at 11.53.36 (1).jpeg",
  // DaniGui (Adois/Preview) — detalhes/decoração
  "/imagens/DaniGui_Adois_25.jpg",
  "/imagens/DaniGui_Preview12.jpg",
  "/imagens/DaniGui_Preview79.jpg",
  // Evento genérico (Instagram / 428) — mesas, arranjos
  "/imagens/17860278387017661.jpg",
  "/imagens/18002809616226216.jpg",
  "/imagens/18009541247101258.jpg",
  "/imagens/18030963605093473.jpg",
  "/imagens/428694133-339551105742981-427109035692944303-n.jpg",
  "/imagens/image0.jpeg",
  "/imagens/image2.jpeg",
  "/imagens/image2-1.jpeg",
  "/imagens/image4-1.jpeg",
  "/imagens/image5-1.jpeg",
  "/imagens/image6.jpeg",
  "/imagens/image7.jpeg",
  // EW1 — ramos, mesas, centros, detalhes (EW1_1393 já acima)
  "/imagens/EW1_0362.jpg",
  "/imagens/EW1_0363.jpg",
  "/imagens/EW1_0365.jpg",
  "/imagens/EW1_0688.jpg",
  "/imagens/EW1_0689.jpg",
  "/imagens/EW1_0690.jpg",
  "/imagens/EW1_0697.jpg",
  "/imagens/EW1_0699.jpg",
  "/imagens/EW1_1337.jpg",
  "/imagens/EW1_1342.jpg",
  "/imagens/EW1_1392.jpg",
  "/imagens/EW1_1394.jpg",
  "/imagens/EW1_1395.jpg",
  "/imagens/EW1_1396.jpg",
  "/imagens/EW1_1398.jpg",
  "/imagens/EW1_1401.jpg",
  "/imagens/EW1_1404.jpg",
  "/imagens/EW1_1405.jpg",
  "/imagens/EW1_1408.jpg",
  "/imagens/EW1_1410.jpg",
  "/imagens/EW1_1414.jpg",
  "/imagens/EW1_1427.jpg",
  "/imagens/EW1_1428.jpg",
  "/imagens/EW1_1505.jpg",
]);

// URL-hash slugs for each category, so a filtered view is shareable &
// bookmarkable (e.g. /galeria#casamentos) and survives the back button.
const CAT_SLUGS: Record<Cat, string> = {
  Todos: "",
  Casamento: "casamentos",
  Corporativo: "corporativos",
  Conferência: "conferencias",
  Aéreo: "aereos",
  Evento: "eventos",
};
function catFromSlug(slug: string): Cat {
  return (CATS.find((c) => CAT_SLUGS[c] === slug) as Cat) ?? "Todos";
}

// "Ver este casamento" — a shareable, URL-hashable view of a single couple's
// full story (as opposed to the deliberately-interleaved category grids).
// Prefixed `c-` in the hash so it can't collide with a CAT_SLUGS value.
// Matches combining marks left behind by NFD decomposition (Unicode "Mark"
// category).
const DIACRITICS_RE = /\p{M}/gu;
function collectionSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(/&/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
const COLLECTION_NAMES: string[] = Array.from(
  new Set(photos.map((p) => collectionFor(p.src)).filter((c): c is string => !!c)),
);
function collectionFromSlug(slug: string): string | null {
  return COLLECTION_NAMES.find((n) => collectionSlug(n) === slug) ?? null;
}
const STRIP = 7;
const SLIDE_MS = 5000; // ritmo do slideshow cinematográfico

// Keyboard focus ring that survives `overflow-hidden`. The global :focus-visible
// outline is a box-shadow, which these image cells clip; an *inset* ring renders
// inside the box, so it stays visible for keyboard users tabbing the grid.
const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80";

// Hover overlay — reused in hero cells and masonry cells
function HoverOverlay({ caption, sub }: { caption: string; sub?: string }) {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/65 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 p-3.5 flex items-end justify-between gap-2 opacity-0 group-hover:opacity-100 translate-y-1.5 group-hover:translate-y-0 transition-all duration-300 pointer-events-none">
        <span className="min-w-0">
          <span
            className="block text-white/90 text-[12px] font-medium truncate"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {caption}
          </span>
          {sub && (
            <span className="block text-white/45 text-[9px] tracking-[0.2em] uppercase mt-0.5">
              {sub}
            </span>
          )}
        </span>
        <span className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
          <svg
            className="w-3.5 h-3.5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0zm-3-3v6m-3-3h6"
            />
          </svg>
        </span>
      </div>
    </>
  );
}

export default function GaleriaClient() {
  const [cat, setCat] = useState<Cat>("Todos");
  // Non-null = "ver este casamento" mode: browsing one couple's full story
  // (in shoot order, no interleaving) instead of a category grid.
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [fading, setFading] = useState(false);
  // Right-edge fade on the filter pill row, only while it actually
  // overflows — hints "more categories, swipe" without permanently
  // clipping the last pill on wide viewports where everything fits.
  const [filtersOverflow, setFiltersOverflow] = useState(false);
  const filterScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = filterScrollRef.current;
    if (!el) return;
    const check = () => setFiltersOverflow(el.scrollWidth - el.clientWidth > 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [lb, setLb] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  // Acabou de abrir via morph? Suprime o lb-photo-in dessa primeira foto para
  // a entrada ser SÓ o morph (voltam a coexistir ao navegar com ←/→).
  const [justOpened, setJustOpened] = useState(false);
  // As fotos 1-4 existem duas vezes no DOM (mosaico em sm+, masonry em mobile;
  // o CSS esconde uma). O React NÃO permite dois <ViewTransition> montados com
  // o mesmo nome, por isso só a instância do breakpoint ativo recebe o nome —
  // decidido pós-hidratação (null = ainda sem nomes, nunca há duplicados).
  const [isSm, setIsSm] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setIsSm(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  /** Nome VT estável por FOTO (derivado do src, tal como as keys da grelha).
      Um nome por índice mudaria de foto quando o filtro reordena a lista e o
      React acusaria duplicados transitórios durante a remontagem. */
  const vtId = (src: string) => `g-${src.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  /** Nome VT da instância do mosaico (só a foto 0 é exclusiva do mosaico). */
  const mosaicName = (idx: number) => (idx === 0 || isSm ? vtId(visible[idx].src) : undefined);
  /** Nome VT da instância do masonry (índices 1-4 só contam em mobile). */
  const masonryName = (idx: number, src: string) =>
    idx < 5 ? (isSm === false ? vtId(src) : undefined) : vtId(src);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Drag-to-dismiss / swipe gesture on the lightbox (touch). The photo layer
  // and backdrop are driven directly via refs during the drag (no per-frame
  // React re-render → stays at 60fps); state only changes on release.
  const photoLayerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef({ x: 0, y: 0, dx: 0, dy: 0, axis: "" as "" | "x" | "y" });
  const open = lb !== null;
  const { t } = useTranslations();

  // Scroll-reveal for masonry tiles — they fade+rise as they enter view, so the
  // wall assembles itself instead of popping in. One shared IntersectionObserver
  // for every tile (created lazily on the first ref), transform/opacity only
  // (compositor work, never blocks scroll), and it unobserves each tile once
  // revealed. `registerTile` returns a cleanup (React 19 ref cleanup) so tiles
  // that unmount on a filter change stop being observed — no leak. Reduced
  // motion / no IntersectionObserver → shown immediately.
  const revealObs = useRef<IntersectionObserver | null>(null);
  const registerTile = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      el.classList.add("in", "done");
      return;
    }
    if (!revealObs.current) {
      revealObs.current = new IntersectionObserver(
        (entries, obs) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const tile = e.target as HTMLElement;
            tile.classList.add("in");
            obs.unobserve(tile);
            tile.addEventListener("transitionend", () => tile.classList.add("done"), {
              once: true,
            });
          }
        },
        { rootMargin: "0px 0px -6% 0px" },
      );
    }
    revealObs.current.observe(el);
    return () => revealObs.current?.unobserve(el);
  }, []);
  useEffect(() => () => revealObs.current?.disconnect(), []);

  // Infinite scroll — a sentinel below the grid loads the next page as it nears
  // the viewport (no "Ver mais" click). Recreated whenever `shown`/`pool.length`
  // change: re-observing reports the current intersection immediately, so if the
  // sentinel is still in view after a page loads it chains to the next one, and
  // it naturally stops once every photo is shown. rootMargin loads ~one viewport
  // ahead so tiles are ready before they scroll in. Browsers without
  // IntersectionObserver fall back to the manual button (see `ioSupported`).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [ioSupported, setIoSupported] = useState(true);
  useEffect(() => {
    setIoSupported(typeof window !== "undefined" && "IntersectionObserver" in window);
  }, []);

  // "Voltar ao topo" — o botão flutuante aparece depois de descer bastante (a
  // página cresce muito com o scroll infinito). Listener passivo, throttled com
  // rAF; setShowTop só re-renderiza quando o booleano muda (React ignora o resto).
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setShowTop(window.scrollY > 1200);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  const scrollTop = useCallback(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, []);

  // Sync the active filter with the URL hash so categories and single-couple
  // views are shareable and the browser back button restores the previous
  // filter. Read post-hydration (avoids any SSR/CSR mismatch) and on every
  // hashchange.
  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash.startsWith("c-")) {
        const name = collectionFromSlug(hash.slice(2));
        if (name) {
          setCollectionFilter(name);
          setShown(PAGE);
          return;
        }
      }
      setCollectionFilter(null);
      const c = catFromSlug(hash);
      setCat((prev) => (prev === c ? prev : c));
      setShown(PAGE);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  // Localized display helpers — internal label keys stay PT (used for
  // filtering); only what the user reads is translated.
  const labelText = (l: Label) => t.galeria.labels[l];
  const altText = (l: Label) => t.galeria.alt[l];
  const caption = (src: string, label: Label): { caption: string; sub?: string } => {
    const c = collectionFor(src);
    return c ? { caption: c, sub: labelText(label) } : { caption: labelText(label) };
  };

  // Interleave AFTER filtering, so every category is independently well-mixed:
  // spreading across the full library first, then filtering, would let same-
  // event photos drift back together once the other categories are removed.
  // A collection view is the opposite intent — it's ONE event told in shoot
  // order — so it skips interleaving entirely.
  //
  // DECORAÇÃO PRIMEIRO: em qualquer vista de categoria, as fotos de decoração
  // (ver `DECOR`) sobem para a frente — a galeria abre com arranjos, mesas e
  // detalhes. Cada bloco (decor / resto) é intercalado por coleção à parte, para
  // não amontoar o mesmo evento. A vista de uma coleção específica ignora isto
  // (é a história de um casamento por ordem).
  const pool = useMemo(() => {
    if (collectionFilter) {
      return photos.filter((p) => collectionFor(p.src) === collectionFilter);
    }
    const filtered = cat === "Todos" ? photos : photos.filter((p) => p.label === cat);
    const decor = interleaveByCollection(filtered.filter((p) => DECOR.has(p.src)));
    const rest = interleaveByCollection(filtered.filter((p) => !DECOR.has(p.src)));
    return [...decor, ...rest];
  }, [cat, collectionFilter]);
  const visible = pool.slice(0, shown);

  // Infinite scroll — a sentinel below the grid loads the next page as it nears
  // the viewport (no "Ver mais" click). Recreated whenever `shown`/`pool.length`
  // change: re-observing reports the current intersection immediately, so if the
  // sentinel is still in view after a page loads it chains to the next one, and
  // it naturally stops once every photo is shown. rootMargin loads ~one viewport
  // ahead so tiles are ready before they scroll in. Browsers without
  // IntersectionObserver fall back to the manual button (see `ioSupported`).
  useEffect(() => {
    if (shown >= pool.length) return;
    const el = sentinelRef.current;
    if (!el || typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        // Non-urgent update: React yields while mounting the next page of tiles
        // so a long scroll never stutters ("super fluido"). The new tiles carry
        // `default="none"` view-transition-names, so no morph/flash fires here.
        if (entries[0]?.isIntersecting)
          startTransition(() => setShown((s) => Math.min(s + PAGE, pool.length)));
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, pool.length]);

  // Lightbox navigation (through entire pool, not just shown)
  // Abrir/fechar dentro de startTransition ativa o morph <ViewTransition>;
  // navegar (←/→) fica fora — usa o lb-photo-in clássico entre fotos.
  const openAt = useCallback((idx: number) => {
    setJustOpened(true);
    startTransition(() => setLb(idx));
  }, []);
  const close = useCallback(() => {
    startTransition(() => {
      setLb(null);
      setPlaying(false);
    });
  }, []);
  // Fecho sem morph — para o gesto de arrastar-para-baixo, onde a própria foto
  // já saiu do ecrã com o dedo (o morph de volta à miniatura ficaria estranho).
  const dismiss = useCallback(() => {
    setLb(null);
    setPlaying(false);
  }, []);
  const prev = useCallback(() => {
    setJustOpened(false);
    setLb((i) => (i !== null ? (i - 1 + pool.length) % pool.length : null));
  }, [pool.length]);
  const next = useCallback(() => {
    setJustOpened(false);
    setLb((i) => (i !== null ? (i + 1) % pool.length : null));
  }, [pool.length]);

  useEffect(() => {
    if (lb === null) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "Tab" && dialogRef.current) {
        // Trap focus inside the lightbox dialog.
        const f = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        if (!dialogRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [lb, close, prev, next]);

  // Move focus into the dialog on open; restore it to the trigger on close.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  // Slideshow cinematográfico — auto-avança enquanto estiver a reproduzir e o
  // separador estiver visível. Pausável (botão / barra de espaço) — WCAG 2.2.2.
  useEffect(() => {
    if (lb === null || !playing) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const id = window.setTimeout(next, SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [lb, playing, next]);

  useEffect(() => {
    document.body.style.overflow = lb !== null ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [lb]);

  // Touch gestures on the open lightbox: horizontal swipe = prev/next,
  // vertical drag-down = dismiss (the photo follows the finger and the backdrop
  // fades, iOS-photos style). Attached as a NATIVE non-passive listener so the
  // vertical drag can preventDefault (kill the rubber-band); the photo/backdrop
  // are moved by writing to refs, never React state, so a drag never re-renders.
  useEffect(() => {
    if (lb === null) return;
    const root = dialogRef.current;
    if (!root) return;
    const g = gestureRef.current;
    const layer = () => photoLayerRef.current;
    const backdrop = () => backdropRef.current;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      g.x = t.clientX;
      g.y = t.clientY;
      g.dx = 0;
      g.dy = 0;
      g.axis = "";
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      g.dx = t.clientX - g.x;
      g.dy = t.clientY - g.y;
      if (g.axis === "") {
        if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) return;
        g.axis = Math.abs(g.dy) > Math.abs(g.dx) ? "y" : "x";
        if (g.axis === "y") layer()?.classList.add("lb-dragging");
      }
      if (g.axis === "y" && g.dy > 0) {
        e.preventDefault();
        const l = layer();
        const b = backdrop();
        const scale = 1 - Math.min(g.dy / 1400, 0.12);
        if (l) l.style.transform = `translateY(${g.dy}px) scale(${scale})`;
        if (b) b.style.opacity = String(1 - Math.min(g.dy / 500, 0.72));
      }
    };
    const onEnd = () => {
      const l = layer();
      const b = backdrop();
      if (g.axis === "y") {
        l?.classList.remove("lb-dragging");
        if (g.dy > 120) {
          if (l) l.style.transform = "translateY(115%) scale(0.88)";
          if (b) b.style.opacity = "0";
          window.setTimeout(dismiss, 220);
        } else {
          if (l) l.style.transform = "";
          if (b) b.style.opacity = "";
        }
      } else if (g.axis === "x" && Math.abs(g.dx) > 50) {
        if (g.dx < 0) next();
        else prev();
      }
      g.axis = "";
    };

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
    };
  }, [lb, next, prev, dismiss]);

  function switchCat(c: Cat) {
    if (c === cat && !collectionFilter) return;
    setFading(true);
    setTimeout(() => {
      setCat(c);
      setCollectionFilter(null);
      setShown(PAGE);
      setFading(false);
    }, 160);
    // Reflect the filter in the URL (shareable / bookmarkable) without adding a
    // history entry per click.
    const slug = CAT_SLUGS[c];
    const url = slug ? `#${slug}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, "", url);
  }

  // Called from inside the (open) lightbox, so the grid fade doesn't apply —
  // it's hidden behind the modal. Deliberately does NOT go through close()
  // first: re-pointing `lb` at the same photo's new index, in the same
  // commit as the pool swap, means the visible photo never changes (same
  // src → same view-transition-name), so nothing needs to morph. Closing
  // first and re-opening after would fire two back-to-back ViewTransitions
  // on the same names — the exact bug that made resizing across the mobile
  // breakpoint log duplicate-name errors (see [[galeria-polish-jul-2026]]).
  function viewCollection(name: string) {
    const newPool = photos.filter((p) => collectionFor(p.src) === name);
    const currentSrc = lb !== null ? pool[lb].src : null;
    const newIdx = currentSrc ? newPool.findIndex((p) => p.src === currentSrc) : -1;
    setCollectionFilter(name);
    setShown(PAGE);
    setJustOpened(false);
    if (newIdx >= 0) setLb(newIdx);
    else if (lb !== null) close();
    window.history.replaceState(null, "", `#c-${collectionSlug(name)}`);
  }

  // Thumbnail strip around current photo
  const half = Math.floor(STRIP / 2);
  const stripStart = lb !== null ? Math.max(0, Math.min(lb - half, pool.length - STRIP)) : 0;
  const stripIdx =
    lb !== null
      ? Array.from({ length: Math.min(STRIP, pool.length) }, (_, k) => stripStart + k)
      : [];

  const counts = Object.fromEntries(
    CATS.map((c) => [
      c,
      c === "Todos" ? photos.length : photos.filter((p) => p.label === c).length,
    ]),
  ) as Record<Cat, number>;

  return (
    <>
      {/* ── Filtros / vista de casamento ── */}
      {collectionFilter ? (
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => switchCat("Todos")}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs tracking-[0.12em] uppercase bg-white/8 text-white/60 hover:bg-white/15 hover:text-white/90 transition-all duration-300"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {t.galeria.backToGallery}
          </button>
          <div className="min-w-0">
            <p
              className="text-white/90 text-base truncate"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {collectionFilter}
            </p>
            <p className="text-white/40 text-[10px] tracking-[0.15em] uppercase mt-0.5">
              {pool.length} {t.galeria.photosLabel}
            </p>
          </div>
        </div>
      ) : (
        <div
          ref={filterScrollRef}
          className={`flex gap-2 mb-8 overflow-x-auto pb-1 scrollbar-none${filtersOverflow ? " g-filter-fade" : ""}`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => switchCat(c)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-xs tracking-[0.12em] uppercase transition-all duration-300 ${
                cat === c
                  ? "bg-moss text-cream shadow-lg shadow-moss/20"
                  : "bg-white/8 text-white/60 hover:bg-white/15 hover:text-white/90"
              }`}
            >
              {t.galeria.labels[c]}
              <span
                className={`text-[10px] tabular-nums ${cat === c ? "text-cream/50" : "text-white/35"}`}
              >
                {counts[c]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Grid ── */}
      <div style={{ opacity: fading ? 0 : 1, transition: "opacity 0.16s" }}>
        {/* Hero — mosaico editorial de 5 fotos. Skipped in collection view:
            the mosaic/masonry dual-mount for slots 1-4, combined with a full
            pool swap, is exactly the combination that confuses React's
            <ViewTransition> into logging duplicate-name errors. A collection
            is one simple, uniform story anyway — no need for a hero. */}
        {!collectionFilter && visible.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 grid-rows-2 gap-0.5 mb-0.5 h-[320px] sm:h-[480px] lg:h-[600px]">
            {/* Foto grande — 2×2 */}
            <button
              onClick={() => openAt(0)}
              className={`g-hero g-tile relative col-span-2 row-span-2 h-full w-full overflow-hidden group ${FOCUS_RING}`}
            >
              {/* Enquanto esta foto está aberta no lightbox, a miniatura
                  desmonta o seu <ViewTransition>: é o unmount/mount com o
                  mesmo nome que o React emparelha para o morph (dois montados
                  em simultâneo não é suportado). Fica escondida atrás do
                  overlay opaco, por isso nada se vê. */}
              {lb !== 0 && (
                <VTWrap name={mosaicName(0)}>
                  <Image
                    src={visible[0].src}
                    alt={altText(visible[0].label)}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                    loading="eager"
                    {...blurFor(visible[0].src)}
                  />
                </VTWrap>
              )}
              <HoverOverlay {...caption(visible[0].src, visible[0].label)} />
            </button>

            {/* 4 fotos satélite — só em sm+ (lazy: não descarrega no telemóvel) */}
            {[1, 2, 3, 4].map((idx) =>
              visible.length > idx ? (
                <button
                  key={idx}
                  onClick={() => openAt(idx)}
                  className={`g-hero g-tile relative hidden sm:block h-full w-full overflow-hidden group ${FOCUS_RING}`}
                  style={{ "--hero-delay": `${idx * 70}ms` } as React.CSSProperties}
                >
                  {lb !== idx && (
                    <VTWrap name={mosaicName(idx)}>
                      <Image
                        src={visible[idx].src}
                        alt={altText(visible[idx].label)}
                        fill
                        sizes="25vw"
                        className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                        loading="lazy"
                        {...blurFor(visible[idx].src)}
                      />
                    </VTWrap>
                  )}
                  <HoverOverlay {...caption(visible[idx].src, visible[idx].label)} />
                </button>
              ) : null,
            )}
          </div>
        )}

        {/* Masonry — fotos restantes (satélites 1-4 reaparecem aqui em
            mobile); numa vista de coleção começa em 0, sem hero, cada foto
            com um único nome VT estável (ver nota acima). */}
        {(collectionFilter ? visible.length > 0 : visible.length > 1) && (
          <div className="columns-1 sm:columns-2 md:columns-3 gap-0.5">
            {(collectionFilter ? visible : visible.slice(1)).map((p, i) => {
              const idx = collectionFilter ? i : i + 1;
              return (
                <div
                  key={p.src}
                  ref={registerTile}
                  className={`g-reveal cv-auto break-inside-avoid mb-0.5${!collectionFilter && idx < 5 ? " sm:hidden" : ""}`}
                  style={{ "--reveal-delay": `${(i % 3) * 60}ms` } as React.CSSProperties}
                >
                  <button
                    onClick={() => openAt(idx)}
                    className={`g-tile relative w-full overflow-hidden group ${FOCUS_RING}`}
                    style={{ aspectRatio: aspectFor(p.src) }}
                  >
                    {lb !== idx && (
                      <VTWrap name={collectionFilter ? vtId(p.src) : masonryName(idx, p.src)}>
                        <Image
                          src={p.src}
                          alt={altText(p.label)}
                          fill
                          sizes="(max-width: 768px) 50vw, 33vw"
                          className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                          loading={collectionFilter && i === 0 ? "eager" : "lazy"}
                          {...blurFor(p.src)}
                        />
                      </VTWrap>
                    )}
                    <HoverOverlay {...caption(p.src, p.label)} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Scroll infinito ── */}
      {shown < pool.length && (
        <div className="mt-14 flex flex-col items-center gap-4">
          {/* Sentinela invisível — o IntersectionObserver carrega a próxima
              página quando ela se aproxima do ecrã. */}
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />
          {ioSupported ? (
            <div className="g-loading flex items-center gap-2" aria-live="polite">
              <span className="g-loading-dot h-1.5 w-1.5 rounded-full bg-moss-light" />
              <span className="g-loading-dot h-1.5 w-1.5 rounded-full bg-moss-light" />
              <span className="g-loading-dot h-1.5 w-1.5 rounded-full bg-moss-light" />
            </div>
          ) : (
            // Fallback sem IntersectionObserver — botão manual.
            <button
              onClick={() => setShown((s) => Math.min(s + PAGE, pool.length))}
              className="group flex items-center gap-3 rounded-full border border-white/15 px-10 py-3.5 text-xs uppercase tracking-[0.2em] text-white/60 transition-all duration-300 hover:border-white/40 hover:text-white/90"
            >
              {t.galeria.verMais}
              <span className="text-white/45 transition-colors group-hover:text-moss-light">
                +{Math.min(PAGE, pool.length - shown)}
              </span>
            </button>
          )}
          <div className="relative h-px w-40 overflow-hidden bg-white/10">
            <div
              className="absolute left-0 top-0 h-full bg-moss/60 transition-all duration-500"
              style={{ width: `${(shown / pool.length) * 100}%` }}
            />
          </div>
          <p className="text-[10px] tracking-widest text-white/40">
            {shown} {t.galeria.de} {pool.length}
          </p>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lb !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${t.galeria.lbGallery} — ${labelText(pool[lb].label)}, ${t.galeria.lbPhoto} ${lb + 1} ${t.galeria.lbOf} ${pool.length}`}
            tabIndex={-1}
            className="fixed inset-0 z-[60] flex flex-col select-none focus:outline-none"
            onClick={close}
          >
            {/* Fundo preto — camada própria que só anima opacidade, para o morph
                da foto poder crescer por cima sem brigar com o <ViewTransition>.
                É também o que o gesto de arrastar-para-baixo desvanece. */}
            <div ref={backdropRef} className="lb-backdrop absolute inset-0 bg-black" />

            {/* Barra superior */}
            <div
              className="lb-scrim lb-chrome relative z-10 flex items-center justify-between px-5 py-3.5 flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <span className="text-white/60 text-xs font-light tabular-nums">{lb + 1}</span>
                <span className="text-white/20 text-xs">/</span>
                <span className="text-white/25 text-xs tabular-nums">{pool.length}</span>
                <span className="w-px h-3 bg-white/10 mx-1" />
                {collectionFor(pool[lb].src) && (
                  <span className="flex items-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        viewCollection(collectionFor(pool[lb].src)!);
                      }}
                      aria-label={`${t.galeria.viewWedding} — ${collectionFor(pool[lb].src)}`}
                      title={t.galeria.viewWedding}
                      className="text-white/70 text-xs hover:text-white underline decoration-white/25 hover:decoration-white/70 underline-offset-4 transition-colors"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      {collectionFor(pool[lb].src)}
                    </button>
                    <span className="text-white/20 mx-1.5">·</span>
                  </span>
                )}
                <span className="text-white/30 text-[10px] tracking-[0.15em] uppercase">
                  {labelText(pool[lb].label)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? t.galeria.lbPause : t.galeria.lbPlay}
                  aria-pressed={playing}
                  className={`p-2 transition-colors rounded-full hover:bg-white/8 ${playing ? "text-moss-light" : "text-white/40 hover:text-white"}`}
                >
                  {playing ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.8-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={close}
                  aria-label={t.galeria.lbClose}
                  className="p-2 text-white/40 hover:text-white transition-colors rounded-full hover:bg-white/8"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Barra de progresso do slideshow — reinicia a cada foto */}
            {playing && (
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/8 z-20 pointer-events-none">
                <div
                  key={lb}
                  className="lb-progress h-full bg-gradient-to-r from-moss to-moss-light origin-left"
                />
              </div>
            )}

            {/* Área da foto + botões */}
            <div className="relative flex-1 flex items-center justify-center min-h-0">
              {/* Botão anterior */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                aria-label={t.galeria.lbPrev}
                className="absolute left-3 md:left-6 z-10 grid place-items-center w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/8 backdrop-blur-md text-white/75 ring-1 ring-white/10 hover:bg-white/15 hover:text-white hover:scale-105 active:scale-95 transition-all duration-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>

              {/* Foto principal */}
              <div
                ref={photoLayerRef}
                className="lb-photo-layer absolute inset-0 mx-14 md:mx-20 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <VTWrap key={lb} name={vtId(pool[lb].src)} exit="vt-lb">
                  <Image
                    key={lb}
                    src={pool[lb].src}
                    alt={altText(pool[lb].label)}
                    fill
                    sizes="90vw"
                    className={`object-contain ${
                      playing ? "lb-kenburns" : justOpened && ViewTransition ? "" : "lb-photo-in"
                    }`}
                    {...blurFor(pool[lb].src)}
                  />
                </VTWrap>
              </div>

              {/* Pré-carrega os vizinhos (anterior/seguinte) para que ← → seja
                  instantâneo — fetch na mesma resolução do visor, fora de ecrã. */}
              <div
                aria-hidden
                className="absolute h-px w-px overflow-hidden opacity-0 pointer-events-none"
              >
                {Array.from(new Set([(lb - 1 + pool.length) % pool.length, (lb + 1) % pool.length]))
                  .filter((i) => i !== lb)
                  .map((i) => (
                    <Image key={i} src={pool[i].src} alt="" fill sizes="90vw" loading="eager" />
                  ))}
              </div>

              {/* Botão próxima */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                aria-label={t.galeria.lbNext}
                className="absolute right-3 md:right-6 z-10 grid place-items-center w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/8 backdrop-blur-md text-white/75 ring-1 ring-white/10 hover:bg-white/15 hover:text-white hover:scale-105 active:scale-95 transition-all duration-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>

            {/* Strip de thumbnails */}
            <div
              className="lb-chrome flex items-center justify-center gap-1 px-4 py-3 flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {stripIdx.map((idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setJustOpened(false);
                    setLb(idx);
                  }}
                  className={`relative flex-shrink-0 overflow-hidden transition-all duration-200 ${FOCUS_RING} ${
                    idx === lb
                      ? "w-[72px] h-[52px] ring-1 ring-white/60 opacity-100"
                      : "w-[60px] h-[44px] opacity-30 hover:opacity-60 hover:scale-105"
                  }`}
                >
                  <Image src={pool[idx].src} alt="" fill sizes="72px" className="object-cover" />
                </button>
              ))}
            </div>

            {/* Dicas teclado */}
            <p className="text-center text-white/15 text-[10px] tracking-widest pb-2 flex-shrink-0 hidden md:block">
              ← → navegar · esc fechar · deslize no telemóvel
            </p>
          </div>,
          document.body,
        )}

      {/* ── Voltar ao topo ── Empilhado por cima do botão de WhatsApp (canto
          inferior direito); o canto esquerdo já tem o CTA "Pedir orçamento"
          (StickyCTA). Escondido enquanto o lightbox está aberto. */}
      <button
        onClick={scrollTop}
        aria-label={t.galeria.backToTop}
        title={t.galeria.backToTop}
        className={`fixed z-40 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white/80 ring-1 ring-white/15 backdrop-blur-md transition-all duration-300 hover:scale-105 hover:bg-black/70 hover:text-white active:scale-95 ${
          showTop && lb === null
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
        style={{
          bottom: "calc(5rem + env(safe-area-inset-bottom))",
          right: "calc(1.25rem + env(safe-area-inset-right))",
        }}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </>
  );
}
