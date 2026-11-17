import { useState } from "react";
import { Boton, ErrorMsg, Modal } from "../../components/ui";
import { api } from "../../lib/api";
import type { Producto } from "../../types";

/** Cómo se llama el local en los avisos si todavía no llegó su nombre. */
export const LOCAL_SIN_NOMBRE = "esta sucursal";

/**
 * «{Producto} está pausado en {sucursal} (no se pide por la página). ¿Venderlo
 * igual?»: la pregunta al tocar en la caja un producto pausado (§4.1).
 */
export function textoVenderPausado(producto: string, sucursal: string | null): string {
  return `${producto} está pausado en ${sucursal ?? LOCAL_SIN_NOMBRE} (no se pide por la página). ¿Venderlo igual?`;
}

/**
 * La hoja de pausar o reactivar un producto en la sucursal de la caja (PLAN-
 * ELGANADERO-16NOV §4.1), como «pausar» en PedidosYa: el producto queda fuera
 * de la página y de las TVs de este local hasta que alguien lo reactive. Se
 * ofrece sólo con `productos.pausar`.
 *
 * Necesita conexión: es un cambio del servidor que ven la página y las otras
 * cajas, así que sin internet se avisa y no se deja en cola (una pausa que
 * llega horas después sería peor que ninguna).
 */
export default function HojaPausa({
  producto,
  pausado,
  sucursal,
  sucursalId,
  onClose,
  onCambio,
}: {
  producto: Producto;
  pausado: boolean;
  /** El nombre del local; null si todavía no llegó. */
  sucursal: string | null;
  sucursalId?: number | null;
  onClose: () => void;
  /** Ya lo guardó el servidor: el POS actualiza la tarjeta. */
  onCambio: (pausado: boolean) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const local = sucursal ?? LOCAL_SIN_NOMBRE;

  async function cambiar() {
    if (enviando) return;
    setError("");
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("Sin internet. Pausar y reactivar necesitan conexión: probá de nuevo cuando vuelva.");
      return;
    }
    setEnviando(true);
    try {
      if (pausado) await api.reactivarProducto(producto.id, sucursalId);
      else await api.pausarProducto(producto.id, sucursalId);
      onCambio(!pausado);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar. Probá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={pausado ? "Reactivar producto" : "Pausar producto"}
      subtitulo={producto.nombre}
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={enviando}>
            Cancelar
          </Boton>
          <Boton icono={pausado ? "play" : "pausa"} onClick={cambiar} disabled={enviando}>
            {enviando ? "Un momento…" : pausado ? "Reactivar" : `Pausar en ${local}`}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-texto-2">
          {pausado
            ? `${producto.nombre} está pausado en ${local}: los clientes no lo pueden pedir por la página. Al reactivarlo vuelve a aparecer.`
            : `${producto.nombre} deja de poder pedirse por la página en ${local} hasta que alguien lo reactive. Acá en la caja se puede vender igual.`}
        </p>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
