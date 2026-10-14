/**
 * Para dónde se abre el menú "…" de una mesa en pantalla ancha (en el celular
 * es una hoja de abajo y esto no corre).
 *
 * Antes se abría siempre hacia la izquierda y para abajo: en una tablet
 * angosta la tarjeta de la primera columna lo cortaba contra el borde, y en la
 * última fila del tablero las opciones de abajo quedaban fuera de la pantalla
 * (QA del 13-oct, 375 px).
 */
export interface Ubicacion {
  /** "derecha" = alineado al borde derecho del botón (se abre hacia la izquierda). */
  horizontal: "derecha" | "izquierda";
  vertical: "abajo" | "arriba";
}

export function ubicarMenu(
  boton: { left: number; right: number; top: number; bottom: number },
  ventana: { ancho: number; alto: number },
  menu: { ancho: number; alto: number },
  margen = 8,
): Ubicacion {
  const entraHaciaIzquierda = boton.right - menu.ancho >= margen;
  const entraHaciaDerecha = boton.left + menu.ancho <= ventana.ancho - margen;
  // Hacia la izquierda es lo de siempre (el botón está en la esquina derecha
  // de la tarjeta); si no entra, y para el otro lado sí, se da vuelta.
  const horizontal = entraHaciaIzquierda || !entraHaciaDerecha ? "derecha" : "izquierda";

  const abajo = ventana.alto - boton.bottom - margen;
  const arriba = boton.top - margen;
  // Para abajo si entra; si no, para donde haya más lugar.
  const vertical = menu.alto <= abajo || abajo >= arriba ? "abajo" : "arriba";
  return { horizontal, vertical };
}

/** Alto aproximado del menú: un renglón por acción y el margen de la caja. */
export const altoMenu = (acciones: number) => acciones * 40 + 10;
