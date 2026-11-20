import { useState } from "react";
import { Boton, Confirmar, ErrorMsg, Select } from "../../components/ui";
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
            <Boton variante="danger" className="min-h-11 px-2" disabled={enviando} onClick={() => setAccion("cancelar")}>
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
        </>
      )}

      <ErrorMsg>{error}</ErrorMsg>

      <Confirmar
        abierto={accion === "cancelar"}
        titulo="¿Cancelar el pedido?"
        texto="Se anula la venta y el stock vuelve al inventario. Si el repartidor tiene el pedido, que lo devuelva al local."
        etiquetaOk="Sí, cancelar"
        peligroso
        procesando={enviando}
        onCancel={() => setAccion(null)}
        onOk={() => hacer(() => api.cancelarPedido(venta.id), "No se pudo cancelar")}
      />
    </div>
  );
}
