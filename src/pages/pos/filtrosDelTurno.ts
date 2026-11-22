import { requiereRevision } from "../../lib/revisionVenta";
import { NOMBRE_PLATAFORMA, PLATAFORMAS, type Plataforma } from "../../lib/pedidosPlataforma/tipos";
import type { Venta } from "../../types";
import type { FilaDelTurno } from "./mezclaDelTurno";

/**
 * Los filtros rápidos de «Ventas del turno» (CONTRATO-filtros-historial,
 * 22-nov; Android tiene los mismos en `FiltrosHistorial`). Una fila de
 * pastillas de UNA sola elección sobre lo que ya se cargó: funciona igual sin
 * señal y no cambia ningún total del turno, que siguen siendo del turno entero.
 *
 * Cada pastilla usa la misma condición que la marca de la fila
 * (`PantallaHistorial`): lo que dice «Delivery» en la lista es lo que filtra
 * «Delivery», y así con todas.
 */
export type FiltroDelTurno =
  | "todo"
  | "ventas"
  | "delivery"
  | "recojo"
  | Plataforma
  | "modificadas"
  | "anuladas"
  | "revisar";

/**
 * De qué tipo es una venta, con la regla de su marca: sin marca es de
 * mostrador (también la de mesa), y fuera de eso «Delivery» o «Recojo».
 */
function tipoDeVenta(v: Pick<Venta, "tipoPedido">): "ventas" | "delivery" | "recojo" {
  if (v.tipoPedido === "LOCAL") return "ventas";
  return v.tipoPedido === "DELIVERY" ? "delivery" : "recojo";
}

/** La marca «Modificada»: viva y con algún cambio de productos después de cobrada. */
function esModificada(v: Pick<Venta, "estado" | "vecesModificada">): boolean {
  return v.estado === "APROBADO" && (v.vecesModificada ?? 0) > 0;
}

/**
 * ¿La fila se ve con este filtro? Una pastilla de tipo (ventas, delivery,
 * recojo, cada plataforma) muestra TODO lo de ese tipo, también lo anulado,
 * que se sigue viendo tachado. Ningún pedido de plataforma es una venta a
 * revisar ni una modificada.
 */
export function pasaElFiltro(fila: FilaDelTurno, filtro: FiltroDelTurno): boolean {
  if (filtro === "todo") return true;
  if (fila.tipo === "pedido") {
    const p = fila.pedido;
    if (filtro === "anuladas") return !!p.anuladoEn;
    return p.plataforma === filtro;
  }
  const v = fila.venta;
  switch (filtro) {
    case "ventas":
    case "delivery":
    case "recojo":
      return tipoDeVenta(v) === filtro;
    case "modificadas":
      return esModificada(v);
    case "anuladas":
      return v.estado === "ANULADO";
    case "revisar":
      return requiereRevision(v);
    default:
      // Una plataforma: las ventas no son de ninguna.
      return false;
  }
}

/** El orden de las pastillas después de «Todo», y su nombre sin la cantidad. */
const FILTROS: readonly (readonly [Exclude<FiltroDelTurno, "todo">, string])[] = [
  ["ventas", "Ventas"],
  ["delivery", "Delivery"],
  ["recojo", "Recojo"],
  ...PLATAFORMAS.map((p) => [p, NOMBRE_PLATAFORMA[p]] as const),
  ["modificadas", "Modificadas"],
  ["anuladas", "Anuladas"],
  ["revisar", "A revisar"],
];

/**
 * Las pastillas para `Chips`, cada una con su cantidad: «Todo (N)» primero y
 * después sólo las que filtran algo (más de 0 filas y menos que el total: si
 * todo es de mostrador, «Ventas» sería lo mismo que «Todo»). `[]` si no queda
 * ninguna además de «Todo»: entonces la fila de pastillas no se muestra y el
 * historial se ve como siempre.
 */
export function opcionesDeFiltro(filas: FilaDelTurno[]): [FiltroDelTurno, string][] {
  const total = filas.length;
  const otras: [FiltroDelTurno, string][] = [];
  for (const [filtro, nombre] of FILTROS) {
    const n = filas.filter((f) => pasaElFiltro(f, filtro)).length;
    if (n > 0 && n < total) otras.push([filtro, `${nombre} (${n})`]);
  }
  return otras.length === 0 ? [] : [["todo", `Todo (${total})`], ...otras];
}

/**
 * El filtro que vale: el elegido si su pastilla sigue estando, y si no
 * «Todo». Así nunca queda un filtro prendido y escondido con la lista vacía
 * (se recargó y ya no hay anuladas, por ejemplo).
 */
export function filtroVigente(
  elegido: FiltroDelTurno,
  opciones: readonly (readonly [FiltroDelTurno, string])[],
): FiltroDelTurno {
  return opciones.some(([k]) => k === elegido) ? elegido : "todo";
}
