import type { AgregadoElegido } from "./tipos";

/**
 * Lo que se tocó, en orden: cada toque es UN topping. El orden importa: los
 * primeros `incluidos` van gratis y el backend los cuenta en el orden del
 * arreglo (PLAN-AGREGADOS §6 #1), así que «Oreo, Chubi, Oreo» no es lo mismo
 * que «Oreo, Oreo, Chubi» cuando los precios difieren.
 */
export interface Toque {
  grupoId: number;
  productoId: number;
}

/** De los toques al arreglo que viaja: los consecutivos del mismo topping se juntan en una cantidad. */
export function elegidosDeToques(toques: Toque[]): AgregadoElegido[] {
  const salida: AgregadoElegido[] = [];
  for (const t of toques) {
    const ultimo = salida[salida.length - 1];
    if (ultimo && ultimo.grupoId === t.grupoId && ultimo.productoId === t.productoId) ultimo.cantidad += 1;
    else salida.push({ grupoId: t.grupoId, productoId: t.productoId, cantidad: 1 });
  }
  return salida;
}

/** Lo contrario: lo elegido de una línea, otra vez como toques (para editarla). */
export function toquesDeElegidos(elegidos: AgregadoElegido[] | undefined): Toque[] {
  const toques: Toque[] = [];
  for (const e of elegidos ?? []) for (let i = 0; i < e.cantidad; i++) toques.push({ grupoId: e.grupoId, productoId: e.productoId });
  return toques;
}
