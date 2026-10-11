import type { Cita, Recurso } from "./tiposAgenda";

/**
 * Piezas puras de la cola de espera (walk-in, feature `cola_walkin`).
 *
 * Lo que el backend exige al anotar con preferido o al atender con alguien
 * elegido (`exigirRecurso`): que sea un profesional activo de esa sucursal y
 * que haga TODOS los servicios pedidos; si no, responde 400. Ofrecer sólo a
 * esos evita el rebote.
 */
export function profesionalesParaCola(
  recursos: Recurso[],
  servicioIds: number[],
  sucursalId: number | null,
): Recurso[] {
  return recursos
    .filter(
      (r) =>
        r.tipo === "PROFESIONAL" &&
        r.activo !== false &&
        (sucursalId == null || r.sucursalIds.length === 0 || r.sucursalIds.includes(sucursalId)) &&
        servicioIds.every((s) => r.servicioIds.includes(s)),
    )
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

/**
 * Lo que pidió el que espera. Un walk-in no tiene líneas hasta que lo
 * atienden: lo pedido viene en `serviciosPedidos` (antes la cola leía las
 * líneas y nunca decía qué quería).
 */
export function serviciosDeLaCola(c: Cita): string {
  const pedidos = c.serviciosPedidos?.map((s) => s.nombre) ?? [];
  const nombres = pedidos.length ? pedidos : c.lineas.map((l) => l.servicio);
  return [...new Set(nombres)].join(" + ");
}
