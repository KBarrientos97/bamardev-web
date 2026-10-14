import { aCentavos, esCero, esPositivo } from "../../../lib/dinero";
import type { HojaNueva } from "../../../lib/planilla";
import type { CierresApi, DescuentosApi } from "../api";
import { hoja } from "../contexto";
import { diferenciaDe, estadoDe } from "./Cierres.datos";
import { claveNombre } from "./Descuentos.datos";

/**
 * Ventas por cajero: junta tres listas que el backend arma por separado.
 *
 * - `performance` (de cierres): quién COBRÓ cada venta del período.
 * - `historial` (de cierres): las cajas que se cerraron en el período, a
 *   nombre de quien la abrió.
 * - descuentos y anulaciones: a nombre de quien VENDIÓ.
 *
 * La unión es por NOMBRE (`claveNombre`) porque ninguna de las tres trae el id
 * del usuario. Dos usuarios que se llamen igual quedan en una sola fila; el
 * backend los nombra con `nombre ?? username`, así que sólo pasa si dos
 * personas cargaron el mismo nombre.
 */

export interface FilaCajero {
  clave: string;
  cajero: string;
  /** Cajas que abrió y se cerraron en el período. */
  turnos: number;
  /** De esos, los que no cuadraron. */
  turnosConDiferencia: number;
  /** Suma de contado − esperado de sus turnos. */
  diferencia: number;
  ventas: number;
  total: number;
  /** Null sin ventas: un promedio que no se puede calcular no es Bs 0. */
  ticketPromedio: number | null;
  anuladas: number;
  anulado: number;
  /** Tickets con promo o cupón. */
  tickets: number;
  descuentos: number;
}

export function unirCajeros(
  cierres: Pick<CierresApi, "performance" | "historial">,
  descuentos: Pick<DescuentosApi, "descuentosPorCajero" | "anulacionesPorCajero">,
): FilaCajero[] {
  const filas = new Map<string, FilaCajero>();
  const fila = (nombre: string): FilaCajero => {
    const clave = claveNombre(nombre);
    let f = filas.get(clave);
    if (!f) {
      f = {
        clave,
        cajero: nombre.trim() || "Sin cajero",
        turnos: 0,
        turnosConDiferencia: 0,
        diferencia: 0,
        ventas: 0,
        total: 0,
        ticketPromedio: null,
        anuladas: 0,
        anulado: 0,
        tickets: 0,
        descuentos: 0,
      };
      filas.set(clave, f);
    }
    return f;
  };

  for (const p of cierres.performance) {
    const f = fila(p.cajero);
    f.ventas += p.ventas;
    f.total = aCentavos(f.total + p.total);
  }
  for (const c of cierres.historial) {
    const f = fila(c.cajero);
    const dif = diferenciaDe(c);
    f.turnos++;
    if (estadoDe(dif) !== "cuadra") f.turnosConDiferencia++;
    f.diferencia = aCentavos(f.diferencia + dif);
  }
  for (const a of descuentos.anulacionesPorCajero) {
    const f = fila(a.cajero);
    f.anuladas += a.cantidad;
    f.anulado = aCentavos(f.anulado + a.monto);
  }
  for (const d of descuentos.descuentosPorCajero) {
    const f = fila(d.cajero);
    f.tickets += d.cantidad;
    f.descuentos = aCentavos(f.descuentos + d.monto);
  }

  return [...filas.values()]
    .map((f) => ({ ...f, ticketPromedio: f.ventas > 0 ? aCentavos(f.total / f.ventas) : null }))
    .sort((a, b) => b.total - a.total || b.turnos - a.turnos || a.cajero.localeCompare(b.cajero, "es"));
}

/** Cómo le quedó la caja a cada uno, en sus turnos del período. */
export type CajaCajero =
  | { tipo: "sinTurnos" }
  | { tipo: "cuadra" }
  /** Hubo diferencias, pero se anulan entre sí: no se dice "cuadra" porque no cuadró. */
  | { tipo: "compensada" }
  | { tipo: "diferencia"; monto: number };

/**
 * CUADRA sólo si TODOS sus turnos cuadraron. Con la suma sola, un turno con
 * −Bs 50 y otro con +Bs 50 daban "cuadra" y la plata que faltó en uno no se
 * veía; ahí se dice que se compensaron.
 */
export function cajaDe(f: Pick<FilaCajero, "turnos" | "turnosConDiferencia" | "diferencia">): CajaCajero {
  if (f.turnos === 0) return { tipo: "sinTurnos" };
  if (f.turnosConDiferencia === 0) return { tipo: "cuadra" };
  if (esCero(f.diferencia)) return { tipo: "compensada" };
  return { tipo: "diferencia", monto: f.diferencia };
}

/** El texto de la caja para el Excel. */
export function textoCaja(c: CajaCajero): string {
  switch (c.tipo) {
    case "sinTurnos":
      return "Sin turnos";
    case "cuadra":
      return "Cuadra";
    case "compensada":
      return "Diferencias que se compensan";
    case "diferencia":
      return esPositivo(c.monto) ? "Sobrante" : "Faltante";
  }
}

export function hojaCajeros(filas: FilaCajero[]): HojaNueva {
  return hoja<FilaCajero>(
    "Ventas por cajero",
    [
      ["Cajero", (f) => f.cajero],
      ["Turnos", (f) => f.turnos],
      ["Ventas", (f) => f.ventas],
      ["Total (Bs)", (f) => f.total],
      ["Ticket promedio (Bs)", (f) => f.ticketPromedio],
      ["Ventas anuladas", (f) => f.anuladas],
      ["Anulado (Bs)", (f) => f.anulado],
      ["Tickets con descuento", (f) => f.tickets],
      ["Descuentos (Bs)", (f) => f.descuentos],
      ["Diferencia de caja (Bs)", (f) => (f.turnos > 0 ? f.diferencia : null)],
      ["Caja", (f) => textoCaja(cajaDe(f))],
    ],
    filas,
  );
}
