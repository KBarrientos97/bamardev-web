import { useEffect, useState } from "react";
import { fmtMoney } from "../../lib/format";
import { porSubir, sinSenal, useColaOffline } from "../../lib/offline/cola";
import { ventaSinInternet } from "../../lib/offline/modo";
import { sincronizarAhora } from "../../lib/offline/motor";
import { Icon } from "../Icon";

/**
 * "3 ventas cobradas sin internet, falta subirlas" (PLAN-IOS F3), el banner
 * del POS y del historial de Android (`PuntoVentaFragment`,
 * `HistorialFragment`). Con el botón "Sincronizar" del historial.
 *
 * Las que el servidor rechazó también se avisan acá, en rojo: en Android
 * recién aparecían al cerrar la caja, y para entonces el cliente ya se fue.
 *
 * Fuera de la app instalada del iPhone no dibuja nada.
 */
export default function AvisoSinSubir() {
  const cola = useColaOffline();
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState("");
  // "Sin conexión" tiene que aparecer y desaparecer con la red, aunque no se
  // toque nada; y el modo pegajoso (3 min) se vence solo.
  const [, redibujar] = useState(0);
  useEffect(() => {
    if (!ventaSinInternet()) return;
    const otraVez = () => redibujar((n) => n + 1);
    window.addEventListener("online", otraVez);
    window.addEventListener("offline", otraVez);
    const reloj = setInterval(otraVez, 30_000);
    return () => {
      window.removeEventListener("online", otraVez);
      window.removeEventListener("offline", otraVez);
      clearInterval(reloj);
    };
  }, []);
  if (!ventaSinInternet()) return null;
  const pendientes = porSubir(cola);
  const rechazadas = cola.filter((v) => v.estado === "RECHAZADA");
  const cortado = sinSenal();
  if (pendientes.length === 0 && rechazadas.length === 0 && !cortado) return null;

  async function subir() {
    setSubiendo(true);
    setResultado("");
    try {
      const r = await sincronizarAhora();
      setResultado(
        r.subidas > 0
          ? `${r.subidas} ${r.subidas === 1 ? "venta sincronizada" : "ventas sincronizadas"}.`
          : r.quedan > 0
            ? "No se pudo subir todavía. Revisá tu conexión e intentá de nuevo."
            : "",
      );
    } finally {
      setSubiendo(false);
    }
  }

  const monto = pendientes.reduce((s, v) => s + v.recibo.total, 0);
  return (
    <div className="space-y-2">
      {(pendientes.length > 0 || cortado) && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/40 bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-text"
        >
          <Icon name={cortado ? "wifiOff" : "clock"} size={16} className="shrink-0" />
          <p className="min-w-0 flex-1">
            {pendientes.length > 0 ? (
              <>
                <b>
                  {pendientes.length} {pendientes.length === 1 ? "venta cobrada" : "ventas cobradas"} sin
                  internet
                </b>{" "}
                ({fmtMoney(monto)}), falta {pendientes.length === 1 ? "subirla" : "subirlas"}. Se
                suben solas cuando vuelve la conexión, con la app abierta.
              </>
            ) : (
              <>
                <b>Sin conexión.</b> Podés seguir cobrando: las ventas se guardan en el celular y
                suben solas.
              </>
            )}
            {resultado && <span className="mt-0.5 block font-semibold">{resultado}</span>}
          </p>
          {pendientes.length > 0 && (
            <button
              type="button"
              onClick={() => void subir()}
              disabled={subiendo}
              className="rounded-lg border border-warning/50 bg-white px-3 py-1.5 text-xs font-semibold text-warning-text transition hover:brightness-95 disabled:opacity-60"
            >
              {subiendo ? "Sincronizando…" : "Sincronizar"}
            </button>
          )}
        </div>
      )}
      {rechazadas.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger-text/30 bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-text"
        >
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <p>
            <b>
              {rechazadas.length === 1
                ? "Una venta cobrada sin internet no se pudo subir"
                : `${rechazadas.length} ventas cobradas sin internet no se pudieron subir`}
            </b>{" "}
            ({fmtMoney(rechazadas.reduce((s, v) => s + v.recibo.total, 0))}): el servidor no las
            aceptó. Las ves en Ventas del turno; volvé a cargarlas a mano.
          </p>
        </div>
      )}
    </div>
  );
}
