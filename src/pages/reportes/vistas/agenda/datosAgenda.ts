import type { ReporteAgenda } from "../../../../lib/agenda/tiposComisiones";
import { esPositivo } from "../../../../lib/dinero";

/**
 * Las cuentas de los reportes de la agenda (profesionales, servicios,
 * asistencia, ocupación y retención). Los números son del backend
 * (`GET /agenda/reportes`); los porcentajes llegan en 0..100 o null y acá
 * sólo se arman las filas.
 *
 * Ojo con sumar: "clientes" de un profesional son las ventas que atendió, y
 * una venta con dos profesionales cuenta para los dos. Sumarlos daría más
 * clientes que los que entraron; por eso no hay un "total de clientes".
 */

type Produccion = ReporteAgenda["produccion"];
type Asistencia = ReporteAgenda["asistencia"];

/** Lo producido entre todos: esto sí se suma, cada línea cobrada es de un solo profesional. */
export function totalesProduccion(p: Produccion): { produccion: number; servicios: number; productos: number; cantidadServicios: number } {
  return p.reduce(
    (a, x) => ({
      produccion: a.produccion + x.produccion,
      servicios: a.servicios + x.produccionServicios,
      productos: a.productos + x.produccionProductos,
      cantidadServicios: a.cantidadServicios + x.servicios,
    }),
    { produccion: 0, servicios: 0, productos: 0, cantidadServicios: 0 },
  );
}

/**
 * El servicio más pedido y el que más deja: no siempre son el mismo (el
 * corte se pide más; el color deja más) y son dos decisiones distintas.
 * Null si no hubo citas, o si nada se cobró todavía (el que "más deja" con
 * Bs 0 no es un dato).
 */
export function serviciosDestacados(s: ReporteAgenda["serviciosTop"]): {
  masPedido: ReporteAgenda["serviciosTop"][number] | null;
  masDeja: ReporteAgenda["serviciosTop"][number] | null;
} {
  let masPedido: ReporteAgenda["serviciosTop"][number] | null = null;
  let masDeja: ReporteAgenda["serviciosTop"][number] | null = null;
  for (const x of s) {
    if (x.pedidos > 0 && (!masPedido || x.pedidos > masPedido.pedidos)) masPedido = x;
    if (esPositivo(x.ingresos) && (!masDeja || x.ingresos > masDeja.ingresos)) masDeja = x;
  }
  return { masPedido, masDeja };
}

/** Cómo llegó la cita, con el nombre de la recepción. */
export const NOMBRE_ORIGEN: Record<string, string> = { INTERNA: "Agendadas", ONLINE: "Reserva online", WALKIN: "Sin turno" };

export interface FilaOrigen {
  origen: string;
  nombre: string;
  total: number;
  noShows: number;
  /** No-shows sobre las citas de ese origen (0..1). Null sin citas. */
  tasa: number | null;
}

/** Los orígenes con citas, del que más trae al que menos. Uno sin citas no tiene tasa (y no va: sería "0 %" de nada). */
export function filasOrigen(a: Asistencia): FilaOrigen[] {
  return a.porOrigen
    .filter((o) => o.total > 0)
    .map((o) => ({ origen: o.origen, nombre: NOMBRE_ORIGEN[o.origen] ?? o.origen, total: o.total, noShows: o.noShows, tasa: o.noShows / o.total }))
    .sort((x, y) => y.total - x.total);
}

export type ClaveTramo = "atendidas" | "noShows" | "canceladas" | "abandonadas" | "pendientes";

export interface TramoAsistencia {
  clave: ClaveTramo;
  nombre: string;
  cantidad: number;
  /** Sobre el total de citas (0..1). */
  fraccion: number;
}

/**
 * Cómo terminaron las citas del período. Los tramos en cero no van: "Se
 * fueron de la cola: 0" en un salón que no usa la cola es ruido.
 */
export function tramosAsistencia(a: Asistencia): TramoAsistencia[] {
  if (!(a.total > 0)) return [];
  const tramos: [ClaveTramo, string, number][] = [
    ["atendidas", "Atendidas", a.completadas],
    ["noShows", "No vinieron", a.noShows],
    ["canceladas", "Canceladas", a.canceladas],
    ["abandonadas", "Se fueron de la cola", a.abandonadas],
    ["pendientes", "Por venir o cobrar", a.pendientes],
  ];
  return tramos.filter(([, , n]) => n > 0).map(([clave, nombre, cantidad]) => ({ clave, nombre, cantidad, fraccion: cantidad / a.total }));
}

export type FilaOcupacion = ReporteAgenda["ocupacion"]["recursos"][number];

/**
 * Los profesionales, del más ocupado al menos. Uno sin horario cargado no
 * tiene ocupación (null, no 0 %) y va al final: no está vacío, no se sabe.
 */
export function filasOcupacion(o: ReporteAgenda["ocupacion"]): FilaOcupacion[] {
  return [...o.recursos].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.nombre.localeCompare(b.nombre, "es"));
}

/** La parte reservada de un horario (0..1), para la barra. Null sin horario. */
export function parteReservada(reservados: number, disponibles: number): number | null {
  return disponibles > 0 ? Math.min(1, reservados / disponibles) : null;
}
