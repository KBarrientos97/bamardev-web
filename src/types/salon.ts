/**
 * El salón: mesas, comandas y el turno del mesero.
 *
 * Todo lo que llega del backend es opcional a propósito, igual que en
 * `SalonDto.kt`: el panel se pinta con lo que mande el servidor y una versión
 * de la web puede quedar corriendo contra un backend más nuevo o más viejo; un
 * campo que falta tiene que dejar la mesa en blanco, no tirar la pantalla abajo
 * en pleno servicio.
 */

/**
 * Los cinco estados de una mesa.
 *
 * Un estado que esta versión no conozca se trata como LIBRE (ver
 * `estadoDeMesa`): es el estado donde nada de lo que haga el mesero rompe algo
 * — no hay consumo que perder ni cuenta que cobrar dos veces.
 */
export type EstadoMesa = "LIBRE" | "OCUPADA" | "CUENTA" | "PAGADA" | "RESERVADA";

export const ESTADOS_MESA: EstadoMesa[] = [
  "LIBRE",
  "OCUPADA",
  "CUENTA",
  "PAGADA",
  "RESERVADA",
];

export function estadoDeMesa(valor: string | null | undefined): EstadoMesa {
  const v = (valor ?? "").toUpperCase() as EstadoMesa;
  return ESTADOS_MESA.includes(v) ? v : "LIBRE";
}

/** Cómo se llama cada estado en pantalla (mismos textos que `strings.xml`). */
export const ETIQUETA_ESTADO: Record<EstadoMesa, string> = {
  LIBRE: "Libre",
  OCUPADA: "Ocupada",
  CUENTA: "Por cobrar",
  PAGADA: "Pagada",
  RESERVADA: "Reservada",
};

export interface ZonaSalon {
  id: number;
  codigo: string;
  nombre: string;
}

export interface ReservaMesa {
  hora: string;
  nombre: string;
  telefono?: string | null;
  personas?: number | null;
  nota?: string | null;
}

/** Los estados que manda el backend. Todo lo que no sea SERVIDA está pendiente. */
export type EstadoComanda =
  | "ENVIADA"
  | "PREPARANDO"
  | "LISTA"
  | "SERVIDA"
  | "ANULADA";

export interface ItemComanda {
  /** El backend lo manda como string ("45"), no como número. */
  id: string | number;
  productoId: number;
  nombre: string;
  cantidad: number;
  precio: number;
  nota?: string | null;
}

/** Un producto que se sacó de la cuenta, con el motivo que dio el mesero. */
export interface ItemAnulado extends ItemComanda {
  motivo?: string | null;
}

export interface Comanda {
  id: string | number;
  /** El que se canta en el pase: "C-101". */
  codigo?: string | null;
  estado: EstadoComanda;
  enviadaEn: string;
  items: ItemComanda[];
  /**
   * Lo anulado viaja en su propia lista, no marcado dentro de `items`. Se
   * muestra tachado y no se borra: sin esto, sacar el único producto de una
   * comanda dejaba una tarjeta vacía con su etiqueta de cocina y parecía un
   * error de la app.
   */
  anulados?: ItemAnulado[];
}

/** Una mesa arrimada a otra para armar una grande. */
export interface MesaUnida {
  id: number;
  codigo: string;
  capacidad: number;
}

export interface Mesa {
  id: number;
  codigo: string;
  nombre: string;
  zonaId?: number | null;
  zonaCodigo: string;
  zonaNombre: string;
  capacidad: number;
  /** Capacidad sumando las mesas unidas. */
  capacidadTotal: number;
  unidas: MesaUnida[];
  unidaAId?: number | null;
  unidaACodigo?: string | null;
  notaMesa?: string | null;
  /** false = fuera de servicio. Sólo llega con datos en la administración. */
  activa: boolean;
  estado: EstadoMesa;
  sesionId?: number | null;
  meseroId?: number | null;
  meseroNombre?: string | null;
  comensales: number;
  abiertaEn?: string | null;
  referencia?: string | null;
  consumo: number;
  comprobante?: string | null;
  propina: number;
  reserva?: ReservaMesa | null;
  comandas: Comanda[];
}

export interface Salon {
  zonas: ZonaSalon[];
  mesas: Mesa[];
}

/** GET /api/salon/turno — lo que el mesero lleva hecho en su turno. */
export interface TurnoMesero {
  meseroNombre: string;
  turno: string;
  desde: string;
  vendidoCobrado: number;
  mesasCerradas: number;
  mesasAbiertas: number;
  comensales: number;
  propinas: number;
  enMesasAbiertas: number;
  mesasPorLiberar: number;
  /** Mesas todavía a su nombre: impiden cerrar el turno. */
  mesasSinCerrar: { id: number; codigo: string; estado: string }[];
  historial: {
    id: number;
    codigo: string;
    comensales: number;
    total: number;
    cerradaEn: string;
  }[];
}

/** Una mesa esperando en caja (lo que ve el cajero). */
export interface MesaPorCobrar {
  mesaId: number;
  sesionId: number;
  codigo: string;
  zonaNombre: string;
  meseroNombre?: string | null;
  comensales: number;
  consumo: number;
  abiertaEn: string;
  comandas: Comanda[];
}
