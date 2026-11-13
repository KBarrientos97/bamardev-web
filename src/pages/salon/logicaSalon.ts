/**
 * La lógica del salón, sin React.
 *
 * Es el port de los derivados de `Salon.kt`: lo que la mesa lleva consumido,
 * qué comandas faltan llevar, cómo se llama en pantalla. Vive acá y no en los
 * componentes porque el mismo cálculo lo usan la grilla, la hoja de detalle y
 * "Por servir", y cuando estaba repetido cada pantalla mostraba un número
 * distinto de la misma mesa.
 */

import type { Comanda, EstadoMesa, ItemComanda, Mesa, ZonaSalon } from "../../types/salon";

/** Comandas que el mesero todavía no llevó a la mesa. */
export function tieneQueLlevarse(c: Comanda): boolean {
  // No alcanza con que el estado sea pendiente: una comanda a la que le
  // anularon todos sus productos queda ENVIADA y sin nada adentro. Aparecía
  // en "Por servir" como una fila vacía con su botón "Servido", contaba en el
  // badge de la pestaña y —lo peor— bloqueaba el paso a caja.
  return c.estado !== "SERVIDA" && c.estado !== "ANULADA" && (c.items ?? []).length > 0;
}

/**
 * Los ítems que suman.
 *
 * Lo anulado viaja en `anulados`, aparte: acá alcanza con lo que quedó vivo.
 */
export function itemsVivos(c: Comanda) {
  return c.items ?? [];
}

/** El subtotal de una línea. El backend no lo manda: se calcula. */
export function subtotalItem(i: ItemComanda): number {
  return i.precio * i.cantidad;
}

export function totalComanda(c: Comanda): number {
  return itemsVivos(c).reduce((a, i) => a + subtotalItem(i), 0);
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

/** Los tres movimientos entre mesas. Ver `mesasParaElegir`. */
export type MovimientoMesa = "pasar" | "juntar" | "unir";

/**
 * A qué mesas se puede ir desde `mesa` en cada movimiento.
 *
 * Son las reglas del backend, para no ofrecer una mesa que va a rechazar:
 *  - **pasar**: el grupo se levanta y se sienta en otra LIBRE (no en una
 *    arrimada a otra: "pasá el consumo a esa");
 *  - **unir**: una LIBRE que no esté arrimada a otra ni tenga otras arrimadas.
 *    Las uniones son planas ("ya tiene otras mesas unidas: separalas
 *    primero"), y la lista las ofrecía igual;
 *  - **juntar**: una con gente y SIN cobrar. Juntar una PAGADA movería plata
 *    que ya entró a caja ("ya se cobró: no se puede juntar"), y la lista la
 *    ofrecía porque `estaOcupada` cuenta la PAGADA.
 *
 * (El salón no trae las arrimadas como mesa propia, así que en la práctica el
 * `unidaAId` no filtra nada; está para que la regla no dependa de eso.)
 *
 * En los tres, además, la otra mesa tiene que ser **del mismo local**: lo exige
 * el backend (`mismaSucursal`) aunque quien mueve sea el de organización.
 */
export function mesasParaElegir(modo: MovimientoMesa, mesa: Mesa, mesas: Mesa[]): Mesa[] {
  // La mesa que vuelve de una acción (unir, separar) trae la respuesta del
  // backend, sin el local: se lo busca en la lista del salón.
  const local = mesa.sucursalId ?? mesas.find((m) => m.id === mesa.id)?.sucursalId;
  return mesas.filter((m) => {
    if (m.id === mesa.id) return false;
    // Mover entre locales distintos da 400 ("son de locales distintos"): no se
    // ofrecen. Si alguna no tiene local (dato viejo) no hay con qué comparar.
    if (local != null && m.sucursalId != null && m.sucursalId !== local) return false;
    if (modo === "pasar") return m.estado === "LIBRE" && m.unidaAId == null;
    if (modo === "unir") return m.estado === "LIBRE" && !estaUnida(m) && m.unidaAId == null;
    return estaOcupada(m) && m.estado !== "PAGADA";
  });
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
  opciones: {
    zonaCodigo?: string | null;
    /**
     * El local de la zona elegida: dos locales pueden tener una zona con el
     * mismo código ("salon"), y sin esto el chip de una mostraría las mesas de
     * las dos. Las mesas sin local conocido pasan.
     */
    sucursalId?: number | null;
    soloMias?: boolean;
    miMeseroId?: number | null;
    /**
     * Sólo las de un estado: es lo que hace tocar un contador ("5 Ocupadas").
     * Se cruza con la zona y con "mis mesas" igual que ellos entre sí.
     */
    estado?: EstadoMesa | null;
  },
): Mesa[] {
  const { zonaCodigo, sucursalId, soloMias, miMeseroId, estado } = opciones;
  return mesas.filter((m) => {
    if (zonaCodigo && m.zonaCodigo !== zonaCodigo) return false;
    if (sucursalId != null && m.sucursalId != null && m.sucursalId !== sucursalId) return false;
    if (soloMias && (m.meseroId == null || m.meseroId !== miMeseroId)) return false;
    if (estado && m.estado !== estado) return false;
    return true;
  });
}

/**
 * Las mesas del salón en tres tandas, en el orden en que el mesero las mira.
 *
 * Hasta el 10-nov iban todas en una grilla por número, del mismo tamaño: con
 * 14 mesas la primera pantalla eran 6 libres y lo que pedía moverse quedaba
 * abajo (UX-MESEROS §1).
 *  - **atender**: con algo para llevar o con la cuenta pedida;
 *  - **enUso**: el resto de las que tienen gente, más las reservadas;
 *  - **libres**: van chicas, porque de ellas no hay nada que leer.
 * Dentro de cada tanda se respeta el orden del backend (por número).
 */
export function tandasDelSalon(mesas: Mesa[]): {
  atender: Mesa[];
  enUso: Mesa[];
  libres: Mesa[];
} {
  const atender: Mesa[] = [];
  const enUso: Mesa[] = [];
  const libres: Mesa[] = [];
  for (const m of mesas) {
    if (m.estado === "LIBRE") libres.push(m);
    else if (m.estado === "CUENTA" || comandasPendientes(m).length > 0) atender.push(m);
    else enUso.push(m);
  }
  return { atender, enUso, libres };
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
    // Primero lo que la cocina ya dejó listo en el pase.
    const listaA = a.comanda.estado === "LISTA" ? 1 : 0;
    const listaB = b.comanda.estado === "LISTA" ? 1 : 0;
    if (listaA !== listaB) return listaB - listaA;
    return (a.comanda.enviadaEn ?? "").localeCompare(b.comanda.enviadaEn ?? "");
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

/**
 * Qué tan larga viene la mesa, para pintar el tiempo.
 *
 * Antes "5m" y "693h" salían del mismo gris, y una mesa olvidada abierta desde
 * ayer no llamaba la atención de nadie (UX-MESEROS §1). Hasta la hora es lo
 * normal de una comida; de 1 a 2 horas, ámbar; más, rojo. Una mesa ya cobrada
 * no se pinta: lo que espera es que la levanten, no el reloj.
 */
export type NivelDeEspera = "normal" | "larga" | "muyLarga";

export function nivelDeEspera(
  iso: string | null | undefined,
  ahora = Date.now(),
): NivelDeEspera {
  if (!iso) return "normal";
  const desde = new Date(iso).getTime();
  if (Number.isNaN(desde)) return "normal";
  const minutos = (ahora - desde) / 60000;
  if (minutos >= 120) return "muyLarga";
  if (minutos >= 60) return "larga";
  return "normal";
}

/**
 * Los colores de cada estado.
 *
 * Desde el 10-nov siguen al color del NEGOCIO (UX-MESEROS §6): la ocupada va
 * con el tono de la paleta (`primary-*`), la cobrada y la reservada en gris,
 * y sólo dos colores fijos avisan, por token: ámbar (falta algo) y rojo (la
 * cuenta pedida). Antes eran los hex de `colors.xml`, con un verde y un azul
 * fijos que en un negocio ciruela parecían un segundo color de marca.
 *
 * `chip` es la píldora del estado; `borde`, el de la tarjeta.
 */
export const COLOR_MESA: Record<EstadoMesa, { chip: string; borde: string }> = {
  LIBRE: { chip: "bg-white text-texto-3", borde: "border-texto-4 border-dashed" },
  OCUPADA: { chip: "bg-primary-100 text-primary-700", borde: "border-borde" },
  CUENTA: { chip: "bg-danger-bg text-danger-text", borde: "border-danger-borde" },
  PAGADA: { chip: "bg-borde-soft text-texto-2", borde: "border-borde" },
  RESERVADA: {
    chip: "border border-dashed border-texto-4 bg-white text-texto-2",
    borde: "border-texto-4 border-dashed",
  },
};

/**
 * Le pone a cada mesa el local de su zona. El backend no lo manda por mesa
 * (`Mesa.sucursalId`), pero sí en cada zona del salón, y la mesa hereda el de la
 * zona. Sin zonas con local (negocio de un local, dato viejo) devuelve la misma
 * lista, sin copiarla.
 */
export function conLocalDeZona(mesas: Mesa[], zonas: ZonaSalon[]): Mesa[] {
  const locales = new Map<number, { id: number; nombre: string | null }>();
  for (const z of zonas) {
    if (z.sucursalId != null) locales.set(z.id, { id: z.sucursalId, nombre: z.sucursalNombre ?? null });
  }
  if (locales.size === 0) return mesas;
  return mesas.map((m) => {
    const local = m.zonaId != null ? locales.get(m.zonaId) : undefined;
    return local ? { ...m, sucursalId: local.id, sucursalNombre: local.nombre } : m;
  });
}
