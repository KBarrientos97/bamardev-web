import { aCentavos, esCero, esPositivo } from "../../../lib/dinero";
import { fmtCantidad } from "../../../lib/format";
import type { HojaNueva } from "../../../lib/planilla";
import type { DescuentosApi, ModificacionesApi } from "../api";
import { columnaSucursal, hoja } from "../contexto";

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

/**
 * Ni una promo, ni una anulación, ni una venta modificada: el reporte se
 * muestra vacío, no en ceros.
 */
export function sinDescuentos(d: DescuentosApi): boolean {
  return (
    esCero(d.totalPerdido) &&
    d.ultimasAnulaciones.length === 0 &&
    d.descuentosPorCajero.length === 0 &&
    d.anulacionesPorCajero.length === 0 &&
    (d.modificaciones?.cantidad ?? 0) === 0
  );
}

type Cambio = ModificacionesApi["ultimas"][number];

/** "1× Broaster cuarto, 1× Coca Cola 3L", o "—" si no salió (o no entró) nada. */
export function listaDeProductos(lineas: { producto: string; cantidad: number }[]): string {
  return lineas.length === 0 ? "—" : lineas.map((l) => `${fmtCantidad(l.cantidad)}× ${l.producto}`).join(", ");
}

/**
 * Qué cambió en el pedido, en una línea: "Salió 1× Coca Cola 3L · Entró 1×
 * Coca Cola 2L". Si no salió ni entró nada, cambió una nota o si iba a la mesa.
 */
export function queCambio(c: Pick<Cambio, "sale" | "entra">): string {
  const partes: string[] = [];
  if (c.sale.length > 0) partes.push(`Salió ${listaDeProductos(c.sale)}`);
  if (c.entra.length > 0) partes.push(`Entró ${listaDeProductos(c.entra)}`);
  return partes.length > 0 ? partes.join(" · ") : "Los mismos productos (cambió una nota o mesa/llevar)";
}

/** Por dónde se movió la diferencia: "en efectivo", "por QR". Vacío en un cambio parejo. */
export function medioDelCambio(c: Pick<Cambio, "pagos">): string {
  const medios = [...new Set(c.pagos.map((p) => (/efectivo/i.test(p.formaPago) ? "en efectivo" : `por ${p.formaPago}`)))];
  return medios.join(" y ");
}

export function hojasDescuentos(d: DescuentosApi, conLocal = false, rotulo = "Sucursal"): HojaNueva[] {
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
          ...columnaSucursal<DescuentosApi["ultimasAnulaciones"][number]>(conLocal, (a) => a.sucursal?.nombre, rotulo),
          ["Motivo", (a) => a.motivo],
          ["Autorizó", (a) => a.autorizadoPor],
          ["Monto (Bs)", (a) => a.monto],
        ],
        d.ultimasAnulaciones,
      ),
    );
  }
  const cambios = d.modificaciones?.ultimas ?? [];
  if (cambios.length > 0) {
    hojas.push(
      hoja<Cambio>(
        "Ventas modificadas",
        [
          ["Fecha", (c) => c.fecha],
          ["Comprobante", (c) => c.idVenta],
          ["Cambió", (c) => c.cajero],
          ["Autorizó", (c) => c.autorizadoPor],
          ...columnaSucursal<Cambio>(conLocal, (c) => c.sucursal?.nombre, rotulo),
          ["Motivo", (c) => c.motivo],
          ["Salió del pedido", (c) => listaDeProductos(c.sale)],
          ["Entró al pedido", (c) => listaDeProductos(c.entra)],
          ["Total antes (Bs)", (c) => c.totalAntes],
          ["Total después (Bs)", (c) => c.totalDespues],
          ["Devuelto al cliente (Bs)", (c) => (c.diferencia < 0 ? aCentavos(-c.diferencia) : 0)],
          ["Cobrado de más (Bs)", (c) => (c.diferencia > 0 ? c.diferencia : 0)],
          ["Medio", (c) => medioDelCambio(c)],
          ["Venta anulada después", (c) => (c.anulada ? "Sí" : "No")],
        ],
        cambios,
      ),
    );
  }
  return hojas;
}
