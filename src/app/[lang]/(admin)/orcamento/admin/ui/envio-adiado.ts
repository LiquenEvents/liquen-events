"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM ENVIO AO CLIENTE ESPERA DEZ SEGUNDOS — PARA SE PODER CANCELAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um email que saiu não volta. Palavras dela, a 10/10: «tem que haver no site
 * todo, em tudo aquilo que se faz, uma forma de voltar atrás»; e, perguntada
 * sobre os envios, escolheu «10 s para cancelar» — como o Gmail.
 *
 * `agendar(enviar)` arma o relógio; `restam` diz quantos segundos faltam (para
 * o ecrã mostrar «A enviar em 7 s… Cancelar»); `cancelar()` desarma;
 * `enviarJa()` não espera. A espera é no BROWSER, antes do pedido: se o ecrã
 * fechar nesses segundos, nada sai — e o ecrã di-lo.
 */
export const ENVIO_ADIADO_MS = 10_000;

export function useEnvioAdiado(ms = ENVIO_ADIADO_MS) {
  const [restam, setRestam] = useState<number | null>(null);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);
  const accao = useRef<(() => void) | null>(null);

  const parar = useCallback(() => {
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = null;
  }, []);

  const cancelar = useCallback(() => {
    parar();
    accao.current = null;
    setRestam(null);
  }, [parar]);

  const enviarJa = useCallback(() => {
    const f = accao.current;
    parar();
    accao.current = null;
    setRestam(null);
    f?.();
  }, [parar]);

  const agendar = useCallback(
    (enviar: () => void) => {
      parar();
      accao.current = enviar;
      const fim = Date.now() + ms;
      setRestam(Math.ceil(ms / 1000));
      relogio.current = setInterval(() => {
        const falta = fim - Date.now();
        if (falta <= 0) enviarJa();
        else setRestam(Math.ceil(falta / 1000));
      }, 250);
    },
    [ms, parar, enviarJa],
  );

  // Sair do ecrã a meio da espera cancela: nada sai sem ela estar a ver.
  useEffect(() => parar, [parar]);

  return { restam, agendar, cancelar, enviarJa, aEsperar: restam !== null };
}
