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
  /**
   * Si el negocio habilitó que el mesero cobre sus propias mesas.
   *
   * Sale de la capacidad `mesero_cobra` del catálogo y viaja con el salón —que
   * la pantalla ya pide cada pocos segundos— porque decide si se dibuja un
   * botón: prenderlo tiene que verse sin que el mesero cierre sesión.
   *
   * Opcional porque un backend anterior a sep-2026 no lo manda; ahí se asume
   * `false`, que es el comportamiento de siempre (cobra la caja).
   */
  meserosCobran?: boolean;
}

/**
 * Una entrega de efectivo del mesero al cajero.
 *
 * Nace cuando el mesero cobra una mesa: esa plata está en su delantal, no en
 * el cajón. Hasta que el cajero la aprueba, el arqueo la **resta** del
 * esperado — sin esa resta el cierre marcaría un faltante que no lo es, y el
 * día que de verdad falte plata nadie podría distinguir una cosa de la otra.
 */
export interface EntregaMesero {
  id: number;
  mesaCodigo: string;
  comprobante: string;
  meseroId: number;
  meseroNombre: string;
  monto: number;
  estado: "PENDIENTE" | "APROBADA";
  creadaEn: string;
  aprobadaEn: string | null;
  aprobadaPorNombre: string | null;
}

/**
 * GET /api/salon/entregas — la misma lista mirada desde los dos lados.
 *
 * El cajero ve lo que le tienen que entregar; el mesero, lo que le falta
 * entregar y lo que ya le aprobaron. Quién ve qué lo decide el backend según
 * quién pregunta.
 */
export interface EntregasMesero {
  items: EntregaMesero[];
  /** Lo que todavía no está en el cajón. Es el mismo número que resta el arqueo. */
  pendiente: number;
  aprobado: number;
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
  /**
   * Los códigos de las mesas todavía a su nombre: impiden cerrar el turno.
   * Llegan como strings sueltos ("M1"), no como objetos.
   */
  mesasSinCerrar: string[];
  historial: {
    id?: number;
    mesaCodigo?: string;
    codigo?: string;
    comensales: number;
    total: number;
    comprobante?: string;
    cerradaEn: string;
    propina?: number;
  }[];
}
