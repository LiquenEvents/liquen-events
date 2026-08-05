/**
 * O lado do browser das passkeys: dois passos de rede à volta de uma chamada
 * ao aparelho. Vive aqui, e não dentro dos componentes, porque o ecrã de
 * entrada e o de gestão fazem exactamente o mesmo — e um deles feito de outra
 * maneira seria a forma mais provável de isto partir sem ninguém ver.
 *
 * NÃO é `server-only`: é o único módulo destes que corre no browser.
 */

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

/** O browser sabe o que são passkeys? Falso em contextos antigos ou sem HTTPS. */
export function suportaPasskeys(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/**
 * O erro que se mostra a quem está à frente do ecrã.
 *
 * Cancelar (fechar a janela do sistema, não pôr o dedo) NÃO é uma falha e não
 * merece um aviso vermelho: devolve-se `null` e o ecrã fica como estava. Só o
 * que é mesmo um problema tem texto.
 */
export function mensagemDeErro(err: unknown): string | null {
  const nome = (err as { name?: string })?.name;
  if (nome === "NotAllowedError" || nome === "AbortError") return null;
  if (nome === "InvalidStateError") {
    return "Este dispositivo já está registado nesta conta.";
  }
  if (nome === "SecurityError") {
    return "O endereço desta página não permite passkeys. Verifique que está em liquen-events.com.";
  }
  const msg = (err as { message?: string })?.message;
  return msg && msg.length < 200 ? msg : "Não foi possível falar com este dispositivo.";
}

async function pedirJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const erro = (data as { error?: string })?.error;
    throw new Error(erro || "Pedido recusado.");
  }
  return data;
}

/**
 * Regista o aparelho actual na conta com sessão aberta.
 *
 * Só é chamado de dentro do back office — o servidor exige sessão válida nos
 * dois passos, e o segundo verifica ainda que a conta não mudou entretanto.
 */
export async function registarDispositivo(deviceLabel: string): Promise<void> {
  const optionsJSON = (await pedirJson("/api/admin/passkeys/registo")) as Parameters<
    typeof startRegistration
  >[0]["optionsJSON"];
  const response = await startRegistration({ optionsJSON });
  await pedirJson("/api/admin/passkeys/registo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response, deviceLabel }),
  });
}

/**
 * Entra com um aparelho já registado. Sem nome, sem palavra-passe: o aparelho
 * mostra as passkeys que tem para este domínio e a pessoa escolhe.
 */
export async function entrarComDispositivo(): Promise<void> {
  const optionsJSON = (await pedirJson("/api/admin/passkeys/entrada")) as Parameters<
    typeof startAuthentication
  >[0]["optionsJSON"];
  const response = await startAuthentication({ optionsJSON });
  await pedirJson("/api/admin/passkeys/entrada", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response }),
  });
}
