/**
 * La lógica del salón, sin React.
 *
 * Es el port de los derivados de `Salon.kt`: lo que la mesa lleva consumido,
 * qué comandas faltan llevar, cómo se llama en pantalla. Vive acá y no en los
 * componentes porque el mismo cálculo lo usan la grilla, la hoja de detalle y
 * "Por servir", y cuando estaba repetido cada pantalla mostraba un número
 * distinto de la misma mesa.
 */

import type { Comanda, EstadoMesa, Mesa } from "../../types/salon";

/** Comandas que el mesero todavía no llevó a la mesa. */
export function tieneQueLlevarse(c: Comanda): boolean {
  // No alcanza con que el estado sea pendiente: una comanda a la que le
  // anularon todos sus productos queda pendiente y sin nada adentro. Aparecía
  // en "Por servir" como una fila vacía con su botón "Servido", contaba en el
  // badge del tab y —lo peor— bloqueaba el paso a caja.
  return c.estado !== "SERVIDA" && c.items.filter((i) => !i.anulado).length > 0;
}

/** Los ítems vivos de una comanda: los anulados se muestran, pero no suman. */
export function itemsVivos(c: Comanda) {
  return c.items.filter((i) => !i.anulado);
}

export function totalComanda(c: Comanda): number {
  return itemsVivos(c).reduce((a, i) => a + i.subtotal, 0);
}

export function cantidadItemsComanda(c: Comanda): number {
  return itemsVivos(c).reduce((a, i) => a + i.cantidad, 0);
}

/**
 * Lo que la mesa lleva consumido. Todavía no es una venta.
 *
 * El backend ya manda `consumo`, pero se recalcula desde las comandas cuando
 * viene en cero: es el mismo número y así la hoja no muestra Bs 0 sobre una
 * lista de platos.
 */
export function consumoDeMesa(m: Mesa): number {
  const delBackend = m.consumo ?? 0;
  if (delBackend > 0) return delBackend;
  return (m.comandas ?? []).reduce((a, c) => a + totalComanda(c), 0);
}

export function cantidadItems(m: Mesa): number {
  return (m.comandas ?? []).reduce((a, c) => a + cantidadItemsComanda(c), 0);
}

/** Cuánto le toca a cada uno si dividen en partes iguales. */
export function porPersona(m: Mesa): number {
  const total = consumoDeMesa(m);
  return m.comensales > 0 ? total / m.comensales : total;
}

export function comandasPendientes(m: Mesa): Comanda[] {
  return (m.comandas ?? []).filter(tieneQueLlevarse);
}

/** true si la mesa tiene algo pedido (aunque esté todo servido). */
export function tieneConsumo(m: Mesa): boolean {
  return (m.comandas ?? []).some((c) => itemsVivos(c).length > 0);
}

/** true si hay gente sentada, cobrada o no. */
export function estaOcupada(m: Mesa): boolean {
  return m.estado === "OCUPADA" || m.estado === "CUENTA" || m.estado === "PAGADA";
}

/**
 * Cómo se llama la mesa en pantalla: "M1" sola, o "M1 + M2" si tiene otra
 * arrimada. Es el nombre con el que el mesero la canta.
 */
export function etiquetaMesa(m: Mesa): string {
  const unidas = m.unidas ?? [];
  if (unidas.length === 0) return m.codigo;
  return [m.codigo, ...unidas.map((u) => u.codigo)].join(" + ");
}

export function estaUnida(m: Mesa): boolean {
  return (m.unidas ?? []).length > 0;
}

/** Los KPIs de la cabecera del salón. */
export interface ResumenSalon {
  libres: number;
  ocupadas: number;
  porCobrar: number;
  /** Ya cobradas, esperando que alguien las levante. */
  porLiberar: number;
}

export function resumirSalon(mesas: Mesa[]): ResumenSalon {
  return {
    libres: mesas.filter((m) => m.estado === "LIBRE").length,
    ocupadas: mesas.filter((m) => m.estado === "OCUPADA").length,
    porCobrar: mesas.filter((m) => m.estado === "CUENTA").length,
    porLiberar: mesas.filter((m) => m.estado === "PAGADA").length,
  };
}

/**
 * Filtra el plano por zona y por "mis mesas".
 *
 * Los dos filtros se cruzan y no se reemplazan: "mis mesas de la terraza" es
 * una pregunta que el mesero hace de verdad.
 */
export function filtrarMesas(
  mesas: Mesa[],
  opciones: { zonaCodigo?: string | null; soloMias?: boolean; miMeseroId?: number | null },
): Mesa[] {
  const { zonaCodigo, soloMias, miMeseroId } = opciones;
  return mesas.filter((m) => {
    if (zonaCodigo && m.zonaCodigo !== zonaCodigo) return false;
    if (soloMias && (m.meseroId == null || m.meseroId !== miMeseroId)) return false;
    return true;
  });
}

/**
 * Todo lo que falta llevar, de TODAS las mesas.
 *
 * No sólo las propias: si un compañero está en la cocina y el plato se enfría
 * en el pase, el que pasa lo lleva. Orden: primero lo que la cocina marcó
 * listo, después lo más viejo — es el orden en que hay que moverse, así que el
 * mesero trabaja de arriba hacia abajo sin decidir nada.
 */
export interface PendienteDeServir {
  mesa: Mesa;
  comanda: Comanda;
}

export function porServir(mesas: Mesa[]): PendienteDeServir[] {
  const filas: PendienteDeServir[] = [];
  for (const mesa of mesas) {
    for (const comanda of comandasPendientes(mesa)) filas.push({ mesa, comanda });
  }
  return filas.sort((a, b) => {
    const listaA = a.comanda.estado === "SERVIDA" ? 0 : 1;
    const listaB = b.comanda.estado === "SERVIDA" ? 0 : 1;
    if (listaA !== listaB) return listaB - listaA;
    return (a.comanda.creadaEn ?? "").localeCompare(b.comanda.creadaEn ?? "");
  });
}

/** Las iniciales con las que se pinta el avatar del mesero. */
export function inicialesDe(nombre: string | null | undefined): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

/**
 * Sólo el primer nombre: en la barra no entra "Carlos Vargas Sánchez" y el
 * apellido no aporta nada al que ya sabe quién es.
 */
export function primerNombre(nombre: string | null | undefined): string {
  return (nombre ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * Hace cuánto pasó algo, en el formato corto de la app: "1h 35m", "12m".
 *
 * Devuelve "" si no hay fecha: la tarjeta esconde el dato en vez de mostrar un
 * guion suelto.
 */
export function hace(iso: string | null | undefined, ahora = Date.now()): string {
  if (!iso) return "";
  const desde = new Date(iso).getTime();
  if (Number.isNaN(desde)) return "";
  const minutos = Math.max(0, Math.floor((ahora - desde) / 60000));
  if (minutos < 60) return `${minutos}m`;
  const horas = Math.floor(minutos / 60);
  return `${horas}h ${minutos % 60}m`;
}

/** Los colores de cada estado, tal cual `colors.xml`. */
export const COLOR_MESA: Record<
  EstadoMesa,
  { texto: string; fondo: string; borde: string }
> = {
  LIBRE: { texto: "text-texto-3", fondo: "bg-white", borde: "border-[#CBD5E1]" },
  OCUPADA: { texto: "text-[#D97706]", fondo: "bg-[#FFFBEB]", borde: "border-[#FCD34D]" },
  CUENTA: { texto: "text-[#DC2626]", fondo: "bg-[#FEF2F2]", borde: "border-[#FCA5A5]" },
  PAGADA: { texto: "text-[#059669]", fondo: "bg-[#ECFDF5]", borde: "border-[#6EE7B7]" },
  RESERVADA: { texto: "text-[#2563EB]", fondo: "bg-[#EFF6FF]", borde: "border-[#93C5FD]" },
};
