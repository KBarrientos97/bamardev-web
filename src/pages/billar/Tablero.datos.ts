/**
 * Las reglas del tablero que no son dibujo: los atajos de teclado y cuándo el
 * dueño está mirando un local que no es el de su caja.
 */

/** Lo que hace una tecla en el tablero (§7.1): "/" busca y Escape cierra el panel. */
export type Atajo = "buscar" | "cerrar";

export function atajoDelTablero(t: {
  tecla: string;
  /** El foco está en un campo de texto: la tecla es de lo que se escribe. */
  escribiendo: boolean;
  /** Hay un diálogo abierto (los del billar o cualquier `aria-modal`). */
  hayDialogo: boolean;
  /** El panel de la mesa es una hoja que tapa el buscador (celular y tablet). */
  buscadorTapado?: boolean;
}): Atajo | null {
  // Con un diálogo abierto las teclas son de él. "/" le robaba el foco al
  // modal y lo mandaba al buscador de atrás, que ni se veía (13-oct).
  if (t.hayDialogo || t.escribiendo) return null;
  if (t.tecla === "/") return t.buscadorTapado ? null : "buscar";
  if (t.tecla === "Escape") return "cerrar";
  return null;
}

/**
 * ¿El dueño mira un local que no es el de su caja? Ve las mesas, pero abrir,
 * cargar y cobrar exigen la caja en el local de la mesa (el backend lo
 * rechaza con CAJA_OTRA_SUCURSAL). Un cajero, o un negocio de un local, nunca
 * llega acá: la caja y el tablero son de la misma sucursal.
 */
export function mirandoOtraSucursal(e: {
  caja: { abierta: boolean };
  sucursalId: number | null;
  cajaSucursalId: number | null;
}): boolean {
  return e.caja.abierta && e.sucursalId != null && e.cajaSucursalId != null && e.cajaSucursalId !== e.sucursalId;
}
