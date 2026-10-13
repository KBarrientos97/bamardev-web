import { aCentavos, esCero, esPositivo } from "../../../lib/dinero";
import type { HojaNueva } from "../../../lib/planilla";
import type { DescuentosApi } from "../api";
import { hoja } from "../contexto";

/**
 * Las cuentas de Descuentos y anulaciones, aparte de la pantalla para poder
 * probarlas. En el sistema NO hay descuentos a mano: lo que el backend llama
 * descuento es lo que restaron las promociones y los cupones.
 */

/**
 * La clave con que se cruzan listas que sólo traen el NOMBRE del cajero: el
 * backend no manda su id en ninguna. Sin espacios de más ni mayúsculas,
 * "María F." y "maría f. " son la misma persona. El costo de cruzar por
 * nombre: dos usuarios que se llamen igual quedan en una sola fila.
 */
export function claveNombre(nombre: string | null | undefined): string {
  return (nombre ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

export interface FilaDescuentoCajero {
  clave: string;
  cajero: string;
  /** Lo que restaron promos y cupones en sus ventas. */
  descuentos: number;
  /** Tickets con descuento. */
  tickets: number;
  anulado: number;
  anuladas: number;
}

/**
 * Las dos listas del backend (descuentos y anulaciones por cajero) en una
 * tabla. Las dos van a nombre de quien VENDIÓ, no de quien anuló. Primero el
 * que más plata perdió o regaló.
 */
export function porCajero(d: Pick<DescuentosApi, "descuentosPorCajero" | "anulacionesPorCajero">): FilaDescuentoCajero[] {
  const filas = new Map<string, FilaDescuentoCajero>();
  const fila = (nombre: string): FilaDescuentoCajero => {
    const clave = claveNombre(nombre);
    let f = filas.get(clave);
    if (!f) {
      f = { clave, cajero: nombre.trim() || "Sin cajero", descuentos: 0, tickets: 0, anulado: 0, anuladas: 0 };
      filas.set(clave, f);
    }
    return f;
  };
  for (const x of d.descuentosPorCajero) {
    const f = fila(x.cajero);
    f.descuentos = aCentavos(f.descuentos + x.monto);
    f.tickets += x.cantidad;
  }
  for (const x of d.anulacionesPorCajero) {
    const f = fila(x.cajero);
    f.anulado = aCentavos(f.anulado + x.monto);
    f.anuladas += x.cantidad;
  }
  return [...filas.values()].sort(
    (a, b) => b.descuentos + b.anulado - (a.descuentos + a.anulado) || a.cajero.localeCompare(b.cajero, "es"),
  );
}

export function sumaCantidades(lista: { cantidad: number }[]): number {
  return lista.reduce((a, x) => a + x.cantidad, 0);
}

/**
 * Lo perdido o regalado como parte de lo vendido. Null sin ventas: un "0 %"
 * en un período sin ventas se lee como un dato y no lo es.
 */
export function sobreVentas(perdido: number, ventas: number): number | null {
  return esPositivo(ventas) ? Math.max(0, perdido) / ventas : null;
}

/** Ni una promo ni una anulación: el reporte se muestra vacío, no en ceros. */
export function sinDescuentos(d: DescuentosApi): boolean {
  return (
    esCero(d.totalPerdido) &&
    d.ultimasAnulaciones.length === 0 &&
    d.descuentosPorCajero.length === 0 &&
    d.anulacionesPorCajero.length === 0
  );
}

export function hojasDescuentos(d: DescuentosApi): HojaNueva[] {
  const hojas: HojaNueva[] = [
    hoja<FilaDescuentoCajero>(
      "Por cajero",
      [
        ["Cajero", (f) => f.cajero],
        ["Descuentos y promos (Bs)", (f) => f.descuentos],
        ["Tickets con descuento", (f) => f.tickets],
        ["Anulado (Bs)", (f) => f.anulado],
        ["Ventas anuladas", (f) => f.anuladas],
      ],
      porCajero(d),
    ),
  ];
  if (d.ultimasAnulaciones.length > 0) {
    hojas.push(
      hoja<DescuentosApi["ultimasAnulaciones"][number]>(
        "Últimas anulaciones",
        [
          ["Fecha", (a) => a.fecha],
          ["Comprobante", (a) => a.idVenta],
          ["Vendió", (a) => a.cajero],
          ["Motivo", (a) => a.motivo],
          ["Autorizó", (a) => a.autorizadoPor],
          ["Monto (Bs)", (a) => a.monto],
        ],
        d.ultimasAnulaciones,
      ),
    );
  }
  return hojas;
}
