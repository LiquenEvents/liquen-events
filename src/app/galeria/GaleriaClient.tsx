"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import { aspectFor } from "@/lib/image-meta";

type Label = "Casamento" | "Corporativo" | "Conferência" | "Aéreo" | "Evento";
interface Photo { src: string; label: Label; }

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
  { src: "/imagens/EW1_1100.jpg", label: "Corporativo" },
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
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-157.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-242.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-250.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-251.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-252.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-253.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-278.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-282.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-346.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-421.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-498.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-499.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-502.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-506.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-509.jpg", label: "Casamento" },
  { src: "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-510.jpg", label: "Casamento" },
  { src: "/imagens/J&P-1Y1A1828.jpg", label: "Casamento" },
  { src: "/imagens/J&P-1Y1A1833.jpg", label: "Casamento" },
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
  { src: "/imagens/M&F0081.jpg", label: "Casamento" },
  { src: "/imagens/M&F0082.jpg", label: "Casamento" },
  { src: "/imagens/M&F0123.jpg", label: "Casamento" },
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
  { src: "/imagens/Matilde&Tomás27.jpg", label: "Casamento" },
  { src: "/imagens/Matilde&Tomás28.jpg", label: "Casamento" },
  { src: "/imagens/Matilde&Tomás35.jpg", label: "Casamento" },
  { src: "/imagens/Matilde&Tomás36.jpg", label: "Casamento" },
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
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.04.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.04 (1).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.04 (2).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.04 (3).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.04 (4).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-18 at 19.08.04 (5).jpeg", label: "Evento" },
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
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.36.jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.36 (1).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.36 (2).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.36 (3).jpeg", label: "Evento" },
  { src: "/imagens/WhatsApp Image 2026-05-21 at 11.53.37.jpeg", label: "Evento" },
];

// Human-readable collection (event) inferred from the file name — adds a
// curated, gallery-grade caption. Only confident matches; otherwise null.
function collectionFor(src: string): string | null {
  const f = src.toLowerCase();
  if (f.includes("danigui")) return "Daniela & Guilherme";
  if (f.includes("joao_e_pedro") || f.includes("j&p-")) return "João & Pedro";
  if (f.includes("carinho.mio")) return "Inês & Gonçalo";
  if (f.includes("matilde&tom")) return "Matilde & Tomás";
  if (f.includes("m&f")) return "Matilde & Filipe";
  if (f.includes("natalia e jonathan")) return "Natália & Jonathan";
  return null;
}

function captionFor(src: string, label: string): { caption: string; sub?: string } {
  const c = collectionFor(src);
  return c ? { caption: c, sub: label } : { caption: label };
}

// Descriptive alt text for image SEO/accessibility (instead of a bare label)
const ALT_BY_LABEL: Record<Label, string> = {
  Casamento: "Casamento organizado pela Líquen Events no Alentejo",
  Corporativo: "Evento corporativo organizado pela Líquen Events",
  Conferência: "Conferência organizada pela Líquen Events em Évora",
  Aéreo: "Vista aérea de evento da Líquen Events",
  Evento: "Evento organizado pela Líquen Events em Portugal",
};
function altFor(label: Label): string {
  return ALT_BY_LABEL[label] ?? `Evento da Líquen Events — ${label}`;
}

const CATS = ["Todos","Casamento","Corporativo","Conferência","Aéreo","Evento"] as const;
type Cat = (typeof CATS)[number];
const PAGE = 24;
const STRIP = 7;

// Hover overlay — reused in hero cells and masonry cells
function HoverOverlay({ caption, sub }: { caption: string; sub?: string }) {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/65 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 p-3.5 flex items-end justify-between gap-2 opacity-0 group-hover:opacity-100 translate-y-1.5 group-hover:translate-y-0 transition-all duration-300 pointer-events-none">
        <span className="min-w-0">
          <span className="block text-white/90 text-[12px] font-medium truncate" style={{ fontFamily: "var(--font-playfair)" }}>{caption}</span>
          {sub && <span className="block text-white/45 text-[9px] tracking-[0.2em] uppercase mt-0.5">{sub}</span>}
        </span>
        <span className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0zm-3-3v6m-3-3h6" />
          </svg>
        </span>
      </div>
    </>
  );
}

export default function GaleriaClient() {
  const [cat, setCat] = useState<Cat>("Todos");
  const [shown, setShown] = useState(PAGE);
  const [fading, setFading] = useState(false);
  const [lb, setLb] = useState<number | null>(null);
  const touchX = useRef<number | null>(null);

  const pool = cat === "Todos" ? photos : photos.filter((p) => p.label === cat);
  const visible = pool.slice(0, shown);

  // Lightbox navigation (through entire pool, not just shown)
  const close = useCallback(() => setLb(null), []);
  const prev  = useCallback(() => setLb((i) => i !== null ? (i - 1 + pool.length) % pool.length : null), [pool.length]);
  const next  = useCallback(() => setLb((i) => i !== null ? (i + 1) % pool.length : null), [pool.length]);

  useEffect(() => {
    if (lb === null) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape")      close();
      if (e.key === "ArrowLeft")   prev();
      if (e.key === "ArrowRight")  next();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [lb, close, prev, next]);

  useEffect(() => {
    document.body.style.overflow = lb !== null ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [lb]);

  function switchCat(c: Cat) {
    if (c === cat) return;
    setFading(true);
    setTimeout(() => { setCat(c); setShown(PAGE); setFading(false); }, 160);
  }

  // Thumbnail strip around current photo
  const half = Math.floor(STRIP / 2);
  const stripStart = lb !== null ? Math.max(0, Math.min(lb - half, pool.length - STRIP)) : 0;
  const stripIdx   = lb !== null ? Array.from({ length: Math.min(STRIP, pool.length) }, (_, k) => stripStart + k) : [];

  const counts = Object.fromEntries(CATS.map((c) => [c, c === "Todos" ? photos.length : photos.filter((p) => p.label === c).length])) as Record<Cat, number>;

  return (
    <>
      {/* ── Filtros ── */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-1 scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => switchCat(c)}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-xs tracking-[0.12em] uppercase transition-all duration-300 ${
              cat === c
                ? "bg-moss text-cream shadow-lg shadow-moss/20"
                : "bg-foreground/5 text-foreground/40 hover:bg-foreground/10 hover:text-foreground/70"
            }`}
          >
            {c}
            <span className={`text-[10px] tabular-nums ${cat === c ? "text-cream/50" : "text-foreground/20"}`}>{counts[c]}</span>
          </button>
        ))}
      </div>

      {/* ── Grid ── */}
      <div style={{ opacity: fading ? 0 : 1, transition: "opacity 0.16s" }}>

        {/* Hero — mosaico editorial de 5 fotos */}
        {visible.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 grid-rows-2 gap-0.5 mb-0.5 h-[320px] sm:h-[480px] lg:h-[600px]">
            {/* Foto grande — 2×2 */}
            <button
              onClick={() => setLb(0)}
              className="relative col-span-2 row-span-2 h-full w-full overflow-hidden group focus:outline-none"
            >
              <Image src={visible[0].src} alt={altFor(visible[0].label)} fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" priority {...blurFor(visible[0].src)} />
              <HoverOverlay {...captionFor(visible[0].src, visible[0].label)} />
            </button>

            {/* 4 fotos satélite — só em sm+ */}
            {[1, 2, 3, 4].map((idx) =>
              visible.length > idx ? (
                <button
                  key={idx}
                  onClick={() => setLb(idx)}
                  className="relative hidden sm:block h-full w-full overflow-hidden group focus:outline-none"
                >
                  <Image src={visible[idx].src} alt={altFor(visible[idx].label)} fill sizes="25vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" priority {...blurFor(visible[idx].src)} />
                  <HoverOverlay {...captionFor(visible[idx].src, visible[idx].label)} />
                </button>
              ) : null
            )}
          </div>
        )}

        {/* Masonry — fotos restantes (satélites 1-4 reaparecem aqui em mobile) */}
        {visible.length > 1 && (
          <div className="columns-1 sm:columns-2 md:columns-3 gap-0.5">
            {visible.slice(1).map((p, i) => {
              const idx = i + 1;
              return (
              <div key={p.src} className={`break-inside-avoid mb-0.5${idx < 5 ? " sm:hidden" : ""}`}>
                <button
                  onClick={() => setLb(idx)}
                  className="relative w-full overflow-hidden group focus:outline-none"
                  style={{ aspectRatio: aspectFor(p.src) }}
                >
                  <Image
                    src={p.src}
                    alt={altFor(p.label)}
                    fill
                    sizes="(max-width: 768px) 50vw, 33vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    loading="lazy"
                    {...blurFor(p.src)}
                  />
                  <HoverOverlay {...captionFor(p.src, p.label)} />
                </button>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Ver mais ── */}
      {shown < pool.length && (
        <div className="mt-14 flex flex-col items-center gap-4">
          <button
            onClick={() => setShown((s) => Math.min(s + PAGE, pool.length))}
            className="group px-10 py-3.5 border border-foreground/15 text-foreground/40 text-xs tracking-[0.2em] uppercase rounded-full hover:border-foreground/40 hover:text-foreground/70 transition-all duration-300 flex items-center gap-3"
          >
            Ver mais
            <span className="text-foreground/25 group-hover:text-foreground/50 transition-colors">+{Math.min(PAGE, pool.length - shown)}</span>
          </button>
          <div className="relative w-40 h-px bg-foreground/8 overflow-hidden">
            <div className="absolute left-0 top-0 h-full bg-moss/50 transition-all duration-500" style={{ width: `${(shown / pool.length) * 100}%` }} />
          </div>
          <p className="text-foreground/20 text-[10px] tracking-widest">{shown} de {pool.length}</p>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lb !== null && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col select-none"
          onClick={close}
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 50) dx < 0 ? next() : prev();
            touchX.current = null;
          }}
        >
          {/* Barra superior */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="text-white/60 text-xs font-light tabular-nums">{lb + 1}</span>
              <span className="text-white/20 text-xs">/</span>
              <span className="text-white/25 text-xs tabular-nums">{pool.length}</span>
              <span className="w-px h-3 bg-white/10 mx-1" />
              {collectionFor(pool[lb].src) && (
                <span className="text-white/70 text-xs" style={{ fontFamily: "var(--font-playfair)" }}>
                  {collectionFor(pool[lb].src)}
                  <span className="text-white/20 mx-1.5">·</span>
                </span>
              )}
              <span className="text-white/30 text-[10px] tracking-[0.15em] uppercase">{pool[lb].label}</span>
            </div>
            <button
              onClick={close}
              className="p-2 text-white/40 hover:text-white transition-colors rounded-full hover:bg-white/8"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Área da foto + botões */}
          <div className="relative flex-1 flex items-center justify-center min-h-0">
            {/* Botão anterior */}
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-3 md:left-6 z-10 p-3 text-white/30 hover:text-white transition-colors rounded-full hover:bg-white/8"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Foto principal */}
            <div className="relative w-full h-full mx-16 md:mx-20" onClick={(e) => e.stopPropagation()}>
              <Image
                key={lb}
                src={pool[lb].src}
                alt={altFor(pool[lb].label)}
                fill
                sizes="90vw"
                className="object-contain lb-photo-in"
                priority
                {...blurFor(pool[lb].src)}
              />
            </div>

            {/* Botão próxima */}
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-3 md:right-6 z-10 p-3 text-white/30 hover:text-white transition-colors rounded-full hover:bg-white/8"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Strip de thumbnails */}
          <div
            className="flex items-center justify-center gap-1 px-4 py-3 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {stripIdx.map((idx) => (
              <button
                key={idx}
                onClick={() => setLb(idx)}
                className={`relative flex-shrink-0 overflow-hidden transition-all duration-200 ${
                  idx === lb
                    ? "w-[72px] h-[52px] ring-1 ring-white/60 opacity-100"
                    : "w-[60px] h-[44px] opacity-30 hover:opacity-60 hover:scale-105"
                }`}
              >
                <Image
                  src={pool[idx].src}
                  alt=""
                  fill
                  sizes="72px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>

          {/* Dicas teclado */}
          <p className="text-center text-white/15 text-[10px] tracking-widest pb-2 flex-shrink-0 hidden md:block">
            ← → navegar · esc fechar · deslize no telemóvel
          </p>
        </div>
      )}
    </>
  );
}
