"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RESTORE_CONFIRM_PHRASE,
  type CounterPlan,
  type DatasetFailure,
  type RestoreOutcome,
  type RestorePlan,
} from "@/lib/backup-restore-types";
import { useFocusTrap } from "./useFocusTrap";
import { useTrincoDeScroll } from "./useTrincoDeScroll";
import { Button } from "./ui";

/**
 * REPOR UMA CÓPIA DE SEGURANÇA — o ecrã da operação mais destrutiva da casa.
 *
 * O botão "Backup" ao lado descarrega o ficheiro; até agora não havia forma
 * nenhuma de o voltar a pôr lá dentro. Este diálogo é a outra metade, e está
 * desenhado à volta de uma ideia só: NINGUÉM REPÕE SEM VER O QUE VAI PERDER.
 *
 *   1. Escolher o ficheiro faz um ENSAIO no servidor. Nada é escrito. O que
 *      volta é uma tabela: por conjunto, quantos registos entram, quantos já lá
 *      estão, quantos são substituídos e quantos DESAPARECEM.
 *   2. Os avisos vêm por cima da tabela, os críticos a vermelho — em especial o
 *      que diz que a cópia é mais VELHA do que os dados que lá estão, com a
 *      conta dos registos feitos depois dela.
 *   3. Só depois aparece a caixa da frase. Escrever “REPOR TUDO” é o gesto
 *      deliberado; um clique distraído não chega lá.
 *   4. A resposta traz a CÓPIA DO ESTADO ANTERIOR, que é descarregada
 *      automaticamente — uma reposição feita por engano tem volta.
 *
 * As FOTOS não vêm na cópia (vivem nos buckets de Storage). Está escrito no
 * ecrã, antes de confirmar, não escondido num README dentro do ficheiro.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** Aviso curto no canto (o mesmo `toast` do resto do back office). */
  toast?: (message: string, kind?: "success" | "error") => void;
}

interface DryRunResponse {
  dryRun: true;
  fileHash: string;
  plan: RestorePlan;
}

interface ApplyResponse {
  dryRun: false;
  ok: boolean;
  plan: RestorePlan;
  applied: RestoreOutcome[];
  failed: DatasetFailure[];
  counters: CounterPlan[];
  snapshotBefore: unknown;
}

type Fase = "escolher" | "plano" | "a-repor" | "resultado";

/** Guarda um JSON no disco de quem está a ver. */
function descarregar(nome: string, conteudo: unknown): boolean {
  try {
    const blob = new Blob([JSON.stringify(conteudo, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    // Um browser que recuse o download não pode fazer passar a cópia por
    // guardada — quem chama mostra o botão manual.
    return false;
  }
}

function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`;
}

/**
 * O invólucro existe só para MONTAR e DESMONTAR o diálogo com o `open`. Assim o
 * estado (ficheiro escolhido, plano, frase escrita) nasce e morre com ele, sem
 * um efeito a limpá-lo à mão — que era onde se esquecia a frase de confirmação
 * escrita da vez anterior, pronta a ser submetida sobre outro ficheiro.
 */
/**
 * Envia o pedido COMPRIMIDO quando o navegador sabe fazê-lo.
 *
 * A cópia inteira viaja no corpo, e os alojamentos limitam esse corpo (~4,5 MB
 * na Vercel). Medida com as formas reais dos dados, a cópia são 6,24 MB hoje e
 * 24,7 MB a três anos — ou seja, esta reposição nascia já provavelmente acima
 * do tecto. Comprimida são 0,35 MB e 1,38 MB, o que afasta o problema uma
 * década.
 *
 * Sem `CompressionStream` (navegador antigo) envia-se como antes: a rota aceita
 * as duas formas, e o aviso do 413 continua a existir para o caso de nem assim
 * caber.
 */
async function enviar(corpo: unknown): Promise<Response> {
  const texto = JSON.stringify(corpo);
  if (typeof CompressionStream === "function") {
    try {
      const comprimido = await new Response(
        new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip")),
      ).arrayBuffer();
      return fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
        body: comprimido,
      });
    } catch {
      // Cai para o envio normal — melhor grande do que nenhum.
    }
  }
  return fetch("/api/backup/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: texto,
  });
}

export default function RestoreDialog({ open, onClose, toast }: Props) {
  if (!open) return null;
  return <RestoreDialogInner onClose={onClose} toast={toast} />;
}

function RestoreDialogInner({ onClose, toast }: Omit<Props, "open">) {
  // Declarado ANTES da armadilha de foco de propósito: os efeitos correm por
  // ordem de declaração, portanto a página já está trancada quando o foco entra
  // na caixa. Não custa nada e tira uma ordem de que ninguém quer depender.
  useTrincoDeScroll(true);
  const dialogRef = useFocusTrap<HTMLDivElement>(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const [fase, setFase] = useState<Fase>("escolher");
  const [ficheiro, setFicheiro] = useState<unknown>(null);
  const [nomeFicheiro, setNomeFicheiro] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [plano, setPlano] = useState<RestorePlan | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [frase, setFrase] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<ApplyResponse | null>(null);
  const [copiaPorGuardar, setCopiaPorGuardar] = useState<unknown>(null);

  const reiniciar = useCallback(() => {
    setFase("escolher");
    setFicheiro(null);
    setNomeFicheiro("");
    setFileHash("");
    setPlano(null);
    setErros([]);
    setFrase("");
    setResultado(null);
    setCopiaPorGuardar(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // Fechar com Esc — mas nunca a meio de uma reposição: fechar o separador
  // agora não pararia a escrita, só esconderia o que está a acontecer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fase !== "a-repor") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, fase]);

  useEffect(() => {
    if (fase !== "a-repor") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [fase]);

  async function escolherFicheiro(f: File) {
    setErros([]);
    setOcupado(true);
    setNomeFicheiro(f.name);
    try {
      const texto = await f.text();
      let json: unknown;
      try {
        json = JSON.parse(texto);
      } catch {
        setErros([
          "O ficheiro não é JSON válido — pode ter ficado cortado a meio do download. Volta a exportar a cópia.",
        ]);
        return;
      }
      setFicheiro(json);
      // ENSAIO: sem `confirm`, o servidor lê tudo e não escreve nada.
      const res = await enviar({ backup: json });
      if (res.status === 413) {
        // O ficheiro nem chegou ao servidor: foi recusado pelo alojamento por
        // ser grande demais para um pedido. Dizer "erro de ligação" aqui era
        // mandar procurar no sítio errado.
        setErros([
          "A cópia é grande demais para ser enviada pelo browser (o alojamento recusa pedidos acima de alguns MB). Esta reposição tem de ser feita a partir do servidor.",
        ]);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setErros(
          Array.isArray(data.errors) && data.errors.length
            ? [data.error, ...data.errors]
            : [data.error ?? "Não foi possível ler a cópia de segurança."],
        );
        return;
      }
      const dry = data as DryRunResponse;
      setPlano(dry.plan);
      setFileHash(dry.fileHash);
      setFase("plano");
    } catch {
      setErros(["Não foi possível falar com o servidor. Verifica a ligação e tenta outra vez."]);
    } finally {
      setOcupado(false);
    }
  }

  async function repor() {
    if (!ficheiro || !plano) return;
    setOcupado(true);
    setFase("a-repor");
    setErros([]);
    try {
      const res = await enviar({ backup: ficheiro, confirm: frase, fileHash });
      const data = await res.json();
      if (res.status !== 200 && res.status !== 207) {
        setErros(
          Array.isArray(data.errors) && data.errors.length
            ? [data.error, ...data.errors]
            : [data.error ?? "A reposição não foi feita."],
        );
        setFase("plano");
        return;
      }
      const aplicado = data as ApplyResponse;
      setResultado(aplicado);
      setFase("resultado");
      // A rede de segurança: guardar já a cópia do estado ANTERIOR.
      const guardado = descarregar(
        `liquen-antes-do-restauro-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`,
        aplicado.snapshotBefore,
      );
      if (!guardado) setCopiaPorGuardar(aplicado.snapshotBefore);
      toast?.(
        aplicado.ok
          ? "Cópia reposta"
          : `Reposto com ${plural(aplicado.failed.length, "conjunto por repor", "conjuntos por repor")}`,
        aplicado.ok ? "success" : "error",
      );
    } catch {
      setErros(["Não foi possível falar com o servidor. Verifica se a reposição foi feita."]);
      setFase("plano");
    } finally {
      setOcupado(false);
    }
  }

  const criticos = plano?.warnings.filter((w) => w.level === "critico") ?? [];
  const avisos = plano?.warnings.filter((w) => w.level === "aviso") ?? [];
  const bloqueado = (plano?.unreadable.length ?? 0) > 0;
  const podeRepor = !bloqueado && frase.trim().toUpperCase() === RESTORE_CONFIRM_PHRASE && !ocupado;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center px-4">
      <div className="bo-entrada bo-entrada-fundo absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Repor cópia de segurança"
        className="relative flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--bo-hairline-strong)] bg-white shadow-[var(--bo-sombra-modal)]"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-[var(--bo-hairline)] px-6 py-4">
          <div>
            <p className="bo-eyebrow">Repor cópia de segurança</p>
            <p className="bo-text-muted mt-0.5 text-xs">
              Escreve por cima dos dados actuais. Faz primeiro uma cópia do estado de agora.
            </p>
          </div>
          {/* 12×18 px, medido a 375 px — e neste diálogo pesa mais do que no
              das passkeys: o fundo NÃO fecha (não há `onClick` no scrim, de
              propósito, para não se perder uma reposição a meio) e o Escape
              precisa de um teclado que um telemóvel não tem. Restava este ×,
              com um terço da largura mínima, como única saída para um dedo.
              `alvo-toque` põe-lhe os 44×44; o desenho fica igual. */}
          <button
            onClick={onClose}
            disabled={fase === "a-repor"}
            className="alvo-toque text-lg leading-none text-foreground/30 transition-colors hover:text-[var(--bo-text-muted)] disabled:opacity-30"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {/* ── Erros ── */}
          {erros.length > 0 && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-[#8a2a22]/25 bg-[#f6e6df]/50 px-4 py-3"
            >
              <p className="text-sm font-medium text-[#8a2a22]">Nada foi alterado.</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {erros.map((e, i) => (
                  <li key={i} className="text-sm text-[var(--bo-tinta-72)]">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── 1. Escolher o ficheiro ── */}
          {fase === "escolher" && (
            <div>
              <p className="text-sm leading-relaxed text-[var(--bo-tinta-72)]">
                Escolhe o ficheiro <strong>liquen-backup-….json</strong> que descarregaste do botão{" "}
                <strong>Backup</strong>. Carregá-lo mostra primeiro um <strong>ensaio</strong>: o
                que aconteceria a cada conjunto de dados, sem escrever nada.
              </p>
              <label className="mt-4 block">
                <span className="sr-only">Ficheiro da cópia de segurança</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  disabled={ocupado}
                  aria-label="Ficheiro da cópia de segurança"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void escolherFicheiro(f);
                  }}
                  className="block w-full text-sm text-[var(--bo-tinta-72)] file:mr-3 file:rounded-full file:border-0 file:bg-[#4d6350] file:px-4 file:py-2 file:text-sm file:text-white hover:file:bg-[#415440]"
                />
              </label>
              {ocupado && <p className="bo-text-muted mt-3 text-sm">A ler a cópia…</p>}
            </div>
          )}

          {/* ── 2. O ensaio ── */}
          {(fase === "plano" || fase === "a-repor") && plano && (
            <div className="flex flex-col gap-4">
              <p className="bo-text-muted text-xs">
                {nomeFicheiro} · exportada em {plano.exportedAt.slice(0, 10)}
                {plano.ageDays != null && ` (há ${plural(plano.ageDays, "dia", "dias")})`}
              </p>

              {criticos.map((w, i) => (
                <div
                  key={i}
                  role="alert"
                  className="rounded-xl border border-[#8a2a22]/30 bg-[#f6e6df]/60 px-4 py-3"
                >
                  <p className="text-sm leading-relaxed text-[#8a2a22]">{w.message}</p>
                </div>
              ))}

              {/* A tabela do ensaio */}
              <div className="overflow-x-auto rounded-xl border border-[var(--bo-hairline)]">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <caption className="sr-only">
                    O que aconteceria a cada conjunto de dados se repusesse esta cópia
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)]">
                      <th scope="col" className="px-3 py-2 font-medium text-[var(--bo-text-muted)]">
                        Conjunto
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium text-[var(--bo-text-muted)]"
                      >
                        Na cópia
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium text-[var(--bo-text-muted)]"
                      >
                        Estão lá
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium text-[var(--bo-text-muted)]"
                      >
                        Novos
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium text-[var(--bo-text-muted)]"
                      >
                        Substituídos
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium text-[#8a2a22]">
                        Apagados
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {plano.datasets.map((d) => (
                      <tr
                        key={d.key}
                        className="border-b border-[var(--bo-hairline)] last:border-0"
                      >
                        <th scope="row" className="px-3 py-2 font-normal text-[var(--bo-text)]">
                          {d.label}
                          {d.skipped && (
                            <span className="bo-text-muted block text-xs">
                              não é reposto — {d.skipped}
                            </span>
                          )}
                        </th>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--bo-tinta-72)]">
                          {d.skipped ? "—" : d.incoming}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--bo-tinta-72)]">
                          {d.current}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--bo-tinta-72)]">
                          {d.skipped ? "—" : d.created}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--bo-tinta-72)]">
                          {d.skipped ? "—" : d.replaced}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            d.removed > 0 ? "font-medium text-[#8a2a22]" : "text-foreground/40"
                          }`}
                        >
                          {d.skipped ? "—" : d.removed}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Numeração fiscal */}
              {plano.counters.length > 0 && (
                <div className="rounded-xl border border-[var(--bo-hairline)] px-4 py-3">
                  <p className="text-foreground/30 text-[10px] uppercase tracking-[0.25em]">
                    Numeração de faturas
                  </p>
                  <ul className="mt-2 space-y-1">
                    {plano.counters.map((c) => (
                      <li key={c.year} className="text-sm text-[var(--bo-tinta-72)]">
                        {c.year}: fica em <strong>{c.willBe}</strong>
                        {c.raised && (
                          <span className="text-[#8a2a22]">
                            {" "}
                            — elevado (a cópia dizia {c.inFile ?? 0}; o número mais alto já emitido
                            foi {c.highestIssued}, e um contador nunca pode recuar)
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {avisos.map((w, i) => (
                <p key={i} className="bo-text-muted text-xs leading-relaxed">
                  {w.message}
                </p>
              ))}

              {/* A frase */}
              {!bloqueado && (
                <div className="rounded-xl border border-[#8a2a22]/25 bg-[#f6e6df]/30 px-4 py-4">
                  <label
                    htmlFor="restore-frase"
                    className="block text-sm leading-relaxed text-[var(--bo-text)]"
                  >
                    Para repor, escreve <strong>{RESTORE_CONFIRM_PHRASE}</strong> aqui. Vai apagar{" "}
                    <strong>{plural(plano.totals.current, "registo", "registos")}</strong> e
                    escrever <strong>{plural(plano.totals.incoming, "registo", "registos")}</strong>{" "}
                    da cópia.
                  </label>
                  <input
                    id="restore-frase"
                    value={frase}
                    onChange={(e) => setFrase(e.target.value)}
                    disabled={fase === "a-repor"}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={RESTORE_CONFIRM_PHRASE}
                    className="bo-input mt-3 px-3 py-2 text-sm text-[var(--bo-text)] placeholder-foreground/25"
                  />
                </div>
              )}

              {fase === "a-repor" && (
                <p className="text-sm text-[var(--bo-tinta-72)]" role="status">
                  A repor… não feches este separador.
                </p>
              )}
            </div>
          )}

          {/* ── 3. O resultado ── */}
          {fase === "resultado" && resultado && (
            <div className="flex flex-col gap-4">
              <div
                role="status"
                className={`rounded-xl px-4 py-3 ${
                  resultado.ok
                    ? "border border-[#4d6350]/30 bg-[#4d6350]/[0.07]"
                    : "border border-[#8a2a22]/30 bg-[#f6e6df]/60"
                }`}
              >
                <p className="text-sm font-medium text-[var(--bo-text)]">
                  {resultado.ok
                    ? "Cópia reposta."
                    : `Reposição INCOMPLETA — ${plural(resultado.failed.length, "conjunto ficou por repor", "conjuntos ficaram por repor")}.`}
                </p>
                <p className="bo-text-muted mt-1 text-xs">
                  A cópia do estado ANTERIOR foi descarregada para o teu computador. Guarda-a: é o
                  caminho de volta se esta reposição foi um engano.
                </p>
              </div>

              {copiaPorGuardar != null && (
                <div className="rounded-xl border border-[#8a2a22]/25 bg-[#f6e6df]/40 px-4 py-3">
                  <p className="text-sm text-[var(--bo-text)]">
                    O download automático da cópia anterior não passou. Guarda-a à mão:
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={() => {
                      if (descarregar("liquen-antes-do-restauro.json", copiaPorGuardar)) {
                        setCopiaPorGuardar(null);
                      }
                    }}
                  >
                    Descarregar a cópia anterior
                  </Button>
                </div>
              )}

              {resultado.failed.length > 0 && (
                <div className="rounded-xl border border-[#8a2a22]/25 px-4 py-3">
                  <p className="text-foreground/30 text-[10px] uppercase tracking-[0.25em]">
                    Conjuntos por repor
                  </p>
                  <ul className="mt-2 space-y-1">
                    {resultado.failed.map((f) => (
                      <li key={`${f.key}-${f.label}`} className="text-sm text-[var(--bo-text)]">
                        <strong>{f.label}</strong> — {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-[var(--bo-hairline)]">
                <table className="w-full min-w-[22rem] text-left text-sm">
                  <caption className="sr-only">Conjuntos repostos</caption>
                  <thead>
                    <tr className="border-b border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)]">
                      <th scope="col" className="px-3 py-2 font-medium text-[var(--bo-text-muted)]">
                        Conjunto
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium text-[var(--bo-text-muted)]"
                      >
                        Apagados
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium text-[var(--bo-text-muted)]"
                      >
                        Repostos
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.applied.map((a) => (
                      <tr
                        key={a.key}
                        className="border-b border-[var(--bo-hairline)] last:border-0"
                      >
                        <th scope="row" className="px-3 py-2 font-normal text-[var(--bo-text)]">
                          {a.label}
                        </th>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--bo-tinta-72)]">
                          {a.deleted}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--bo-tinta-72)]">
                          {a.inserted}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="bo-text-muted text-xs leading-relaxed">{resultado.plan.photosNotice}</p>
              <p className="bo-text-muted text-xs leading-relaxed">
                Actualiza a página para ver os dados repostos.
              </p>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--bo-hairline)] px-6 py-4">
          {fase === "plano" && (
            <Button variant="ghost" size="sm" onClick={reiniciar} disabled={ocupado}>
              Escolher outro ficheiro
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={fase === "a-repor"}>
            {fase === "resultado" ? "Fechar" : "Cancelar"}
          </Button>
          {(fase === "plano" || fase === "a-repor") && !bloqueado && (
            <Button
              size="sm"
              variant="danger"
              loading={fase === "a-repor"}
              disabled={!podeRepor}
              onClick={() => void repor()}
            >
              Repor definitivamente
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
