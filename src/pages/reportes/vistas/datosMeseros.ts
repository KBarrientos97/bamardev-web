import { esPositivo } from "../../../lib/dinero";
import type { MeserosApi } from "../api";

/**
 * Las cuentas de "Ventas por mesero". El backend manda los promedios en 0
 * cuando no se pueden calcular (un mesero sin mesas tiene "ticket 0"); acá
 * pasan a null, que la pantalla escribe "—": un "Bs 0 por mesa" se lee como
 * un mesero que atendió mesas sin vender nada.
 */

export interface FilaMesero {
  /** Para la `key`: el id, o la posición si es "Sin mesero". */
  clave: string;
  nombre: string;
  /** Mesas de antes del panel de meseros (o de alguien dado de baja): su venta cuenta, pero no es un mesero. */
  sinMesero: boolean;
  mesas: number;
  comensales: number;
  vendido: number;
  /** Lo vendido por mesa. Null sin mesas. */
  ticket: number | null;
  /** Lo vendido por persona sentada. Null sin comensales cargados. */
  porComensal: number | null;
  propinas: number;
  /** Cuánto duró en promedio una mesa suya, de sentarse a pagar. Null si ninguna tiene las dos puntas. */
  minutos: number | null;
  itemsAnulados: number;
  montoAnulado: number;
  /**
   * No atendió mesas: está en la lista por lo que sacó de una cuenta. Lo
   * anulado va a nombre de quien lo anuló, así que acá aparecen el encargado
   * o el cajero.
   */
  soloAnulo: boolean;
}

export function filasMeseros(d: MeserosApi): FilaMesero[] {
  return d.items
    .map(
      (m, i): FilaMesero => ({
        clave: m.meseroId != null ? String(m.meseroId) : `sin-mesero-${i}`,
        nombre: m.mesero?.trim() || "Sin mesero",
        sinMesero: m.meseroId == null,
        mesas: m.mesas,
        comensales: m.comensales,
        vendido: m.vendido,
        ticket: m.mesas > 0 ? m.ticketPromedio : null,
        porComensal: m.comensales > 0 ? m.porComensal : null,
        propinas: m.propinas,
        // El backend redondea a minutos enteros y manda 0 sin mesas medibles:
        // una mesa de "0 min" no existe.
        minutos: m.mesas > 0 && m.minutosPromedio > 0 ? m.minutosPromedio : null,
        itemsAnulados: m.itemsAnulados,
        montoAnulado: m.montoAnulado,
        soloAnulo: m.mesas === 0,
      }),
    )
    .sort((a, b) => b.vendido - a.vendido || b.mesas - a.mesas || a.nombre.localeCompare(b.nombre, "es"));
}

/** Los que vendieron algo, del que más al que menos: los de "sólo anuló" no van en el ranking de ventas. */
export function quienVendioMas(filas: FilaMesero[], maximo = 10): FilaMesero[] {
  return filas.filter((f) => esPositivo(f.vendido)).slice(0, maximo);
}

/** "45 min", "1 h 20 min", "2 h": el tiempo de una mesa, que casi nunca pasa de un par de horas. */
export function textoMinutos(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}
