import type { MetodoPagoApi } from "../api";
import { variacion } from "../formato";
import { PALETA } from "../trazos";

/** Las filas de Métodos de pago, aparte de la pantalla para poder probarlas. */

export interface FilaMetodo {
  nombre: string;
  monto: number;
  fraccion: number;
  cantidad?: number;
  anterior?: number;
  delta: number | null;
  color: string;
  esFiado: boolean;
}

/** El color de cada forma de pago es fijo: el efectivo es verde en todos los reportes, el fiado ámbar. */
export function colorMetodo(nombre: string, i: number): string {
  const n = nombre.toLowerCase();
  if (n.includes("efectivo")) return "#10B981";
  if (n.includes("qr")) return "#8B5CF6";
  if (n.includes("tarjeta")) return "#3B82F6";
  if (n.includes("transfer")) return "#06B6D4";
  if (n.includes("gift") || n.includes("vale")) return "#F43F5E";
  if (n.includes("fiado")) return "#F59E0B";
  return PALETA[(i + 5) % PALETA.length];
}

/** Las filas del reporte: los cobros por forma de pago y, aparte, lo fiado. */
export function armarFilas(actual: MetodoPagoApi[], previo: MetodoPagoApi[] | null, fiado: number): FilaMetodo[] {
  const conMonto = actual.filter((m) => m.monto > 0.005);
  const total = conMonto.reduce((a, m) => a + m.monto, 0) + Math.max(0, fiado);
  const filas: FilaMetodo[] = conMonto.map((m, i) => {
    const antes = previo?.find((p) => p.nombre === m.nombre)?.monto;
    return {
      nombre: m.nombre,
      monto: m.monto,
      fraccion: total > 0 ? m.monto / total : 0,
      cantidad: m.cantidad,
      anterior: previo ? (antes ?? 0) : undefined,
      delta: previo ? variacion(m.monto, antes ?? 0) : null,
      color: colorMetodo(m.nombre, i),
      esFiado: false,
    };
  });
  if (fiado > 0.005) {
    filas.push({ nombre: "Fiado", monto: fiado, fraccion: total > 0 ? fiado / total : 0, delta: null, color: colorMetodo("fiado", 0), esFiado: true });
  }
  return filas;
}
