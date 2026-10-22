import { useState } from "react";
import { activarPush, type ResultadoPush } from "../lib/push/firebasePush";

/**
 * /prueba-push (sólo QA, temporal): pide el permiso de notificaciones y
 * muestra el token de FCM para mandarle una push de prueba desde la consola de
 * Firebase. No toca la sesión ni el API: es para comprobar que la PWA recibe.
 */
export default function PruebaPush() {
  const [estado, setEstado] = useState<"quieto" | "pidiendo">("quieto");
  const [resultado, setResultado] = useState<ResultadoPush | null>(null);
  const [copiado, setCopiado] = useState(false);
  const instalada =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  async function activar() {
    setEstado("pidiendo");
    setCopiado(false);
    setResultado(await activarPush());
    setEstado("quieto");
  }

  async function copiar(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 bg-white px-4 py-8 text-slate-800">
      <h1 className="text-xl font-bold">Prueba de notificaciones</h1>
      <p className="text-sm text-slate-600">
        Pide el permiso y muestra el token de este equipo. Con ese token se manda una push de prueba
        desde la consola de Firebase (Messaging → Enviar mensaje de prueba).
      </p>
      <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
        Abierta como app instalada: <strong>{instalada ? "sí" : "no"}</strong>. En el iPhone tiene que
        decir «sí» (iOS 16.4 o más, abierta desde el ícono de inicio).
      </p>
      <button
        type="button"
        onClick={() => void activar()}
        disabled={estado === "pidiendo"}
        className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {estado === "pidiendo" ? "Pidiendo permiso…" : "Activar notificaciones"}
      </button>
      {resultado?.ok === false && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {resultado.motivo}
        </p>
      )}
      {resultado?.ok && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-emerald-700">Listo: este equipo puede recibir push.</p>
          <p className="text-xs text-slate-600">
            {resultado.registrado
              ? "Token guardado en el servidor para tu usuario."
              : "No se pudo guardar en el servidor (¿sin sesión o sin red?). Entrá a la app y volvé a intentar."}
          </p>
          <textarea
            readOnly
            value={resultado.token}
            rows={6}
            className="w-full rounded-xl border border-slate-300 p-2 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={() => void copiar(resultado.token)}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold"
          >
            {copiado ? "Copiado" : "Copiar token"}
          </button>
        </div>
      )}
      <a href="/" className="text-center text-sm text-slate-500 underline">
        Volver a la app
      </a>
    </main>
  );
}
