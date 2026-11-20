import { useState } from "react";
import { Boton, ErrorMsg, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { textoMotivo } from "../../lib/entregaFallida";
import { fmtHora, tiempoRelativo } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import type { Venta } from "../../types";

/**
 * Un delivery «en espera» visto desde la caja (20-nov): el repartidor avisó
 * «No se pudo entregar» y ahora decide quien maneja el reparto. Va en el
 * detalle del pedido, con lo que dijo (motivo, nota, quién y hace cuánto) y
 * las tres salidas:
 *
 * - **Reintentar**: el mismo repartidor lo vuelve a intentar (limpia la espera).
 * - **Reasignar**: se lo lleva otro (también limpia la espera).
 * - **Cancelar pedido**: anula la venta y devuelve el stock. Desde el 20-nov es
 *   sólo de la caja: el repartidor ya no puede.
 *
 * Quien no tiene `delivery.asignar` ve el aviso sin los botones: el backend
 * le rechazaría cualquiera de los tres.
 *
 * Reasignar y la confirmación de cancelar se abren acá mismo, en el detalle de
 * la venta, y no en otra hoja encima (regla del dueño, 20-nov).
 */
export default function EnEsperaDeLaCaja({
  venta,
  puedeDecidir,
  onCambio,
}: {
  venta: Venta;
  /** `delivery.asignar`: reintentar, reasignar y cancelar. */
  puedeDecidir: boolean;
  /** Se decidió algo: el pedido cambió y la lista de pendientes se recarga. */
  onCambio: () => void;
}) {
  const [accion, setAccion] = useState<"reasignar" | "cancelar" | null>(null);
  const [repartidorId, setRepartidorId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const repartidores = useApi(
    () => (accion === "reasignar" ? api.getRepartidores() : Promise.resolve([])),
    [accion],
  );
  const otros = (repartidores.datos ?? []).filter((r) => r.id !== venta.repartidor?.id);

  async function hacer(fn: () => Promise<unknown>, falla: string) {
    if (enviando) return;
    setError("");
    setEnviando(true);
    try {
      await fn();
      setAccion(null);
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : falla);
    } finally {
      setEnviando(false);
    }
  }

  const avisoEn = venta.entregaFallidaEn ?? null;
  return (
    <div className="space-y-3 rounded-xl border border-warning-borde bg-warning-suave px-3.5 py-3" aria-label="En espera de la caja">
      <div className="text-[13px] text-warning-text">
        <p className="font-bold">En espera de la caja · {textoMotivo(venta.entregaFallidaMotivo)}</p>
        {venta.entregaFallidaNota && <p className="mt-0.5 italic">«{venta.entregaFallidaNota}»</p>}
        <p className="mt-0.5">
          {venta.repartidor?.nombre ? `Avisó ${venta.repartidor.nombre}` : "Avisó el repartidor"}
          {avisoEn ? ` · ${tiempoRelativo(avisoEn).toLowerCase()} (${fmtHora(avisoEn)})` : ""}
        </p>
      </div>

      {puedeDecidir && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Boton
              variante="soft"
              className="min-h-11 px-2"
              disabled={enviando}
              onClick={() => hacer(() => api.reintentarEntrega(venta.id), "No se pudo volver a mandar el pedido")}
            >
              Reintentar
            </Boton>
            <Boton
              variante="ghost"
              className="min-h-11 px-2"
              disabled={enviando}
              aria-pressed={accion === "reasignar"}
              onClick={() => setAccion(accion === "reasignar" ? null : "reasignar")}
            >
              Reasignar
            </Boton>
            <Boton
              variante="danger"
              className="min-h-11 px-2"
              disabled={enviando}
              aria-pressed={accion === "cancelar"}
              onClick={() => setAccion(accion === "cancelar" ? null : "cancelar")}
            >
              Cancelar pedido
            </Boton>
          </div>

          {accion === "reasignar" && (
            <div className="space-y-2">
              <Select aria-label="Nuevo repartidor" value={repartidorId} onChange={(e) => setRepartidorId(e.target.value)}>
                <option value="">{repartidores.cargando ? "Cargando repartidores…" : "Elegí quién lo lleva"}</option>
                {otros.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </Select>
              {!repartidores.cargando && otros.length === 0 && (
                <p className="text-xs text-texto-3">No hay otro repartidor: reintentá con el mismo o cancelá el pedido.</p>
              )}
              <Boton
                className="min-h-11 w-full"
                disabled={enviando || !repartidorId}
                onClick={() => hacer(() => api.reasignarPedido(venta.id, Number(repartidorId)), "No se pudo reasignar")}
              >
                {enviando ? "Un momento…" : "Pasárselo"}
              </Boton>
            </div>
          )}
          {accion === "cancelar" && (
            <div
              role="group"
              aria-label="¿Cancelar el pedido?"
              className="space-y-2.5 rounded-xl border-[1.5px] border-danger-borde bg-white px-3.5 py-3 motion-safe:animate-[vista-entra_.22s_cubic-bezier(0.32,0.72,0,1)]"
            >
              <p className="text-sm font-bold text-texto">¿Cancelar el pedido?</p>
              <p className="text-[13px] text-texto-2">
                Se anula la venta y el stock vuelve al inventario. Si el repartidor tiene el pedido, que lo devuelva al local.
              </p>
              <div className="flex gap-2">
                <Boton variante="ghost" className="min-h-11 flex-1" disabled={enviando} onClick={() => setAccion(null)}>
                  Volver
                </Boton>
                <Boton
                  variante="danger"
                  className="min-h-11 flex-1"
                  disabled={enviando}
                  onClick={() => hacer(() => api.cancelarPedido(venta.id), "No se pudo cancelar")}
                >
                  {enviando ? "Cancelando…" : "Sí, cancelar"}
                </Boton>
              </div>
            </div>
          )}
        </>
      )}

      <ErrorMsg>{error}</ErrorMsg>

    </div>
  );
}
