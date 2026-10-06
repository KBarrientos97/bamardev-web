/**
 * Tipos de la agenda de belleza, calcados del contrato de
 * PLAN-DESARROLLO-BELLEZA §10.2 y §10.3. Se copian tal cual (mismos nombres y
 * mismos nulos) para que no haya traducción entre lo que viaja y lo que se lee:
 * el backend se programa en paralelo contra el mismo texto.
 *
 * Viven acá y no en `types.ts` a propósito: la configuración de la agenda (A8,
 * A11) se escribe en otra rama al mismo tiempo, y un archivo propio no choca.
 * De §10.1 sólo está lo que estas pantallas leen (servicios, recursos, reglas).
 */

import type { CoberturaPaquete } from "./tiposSpa";

export type EstadoCita =
  | "SOLICITADA"
  | "RESERVADA"
  | "CONFIRMADA"
  | "EN_ESPERA"
  | "EN_COLA"
  | "EN_ATENCION"
  | "POR_COBRAR"
  | "COMPLETADA"
  | "CANCELADA"
  | "NO_ASISTIO"
  | "RECHAZADA"
  | "EXPIRADA"
  | "ABANDONADA"
  | "PENDIENTE_PAGO";

export type OrigenCita = "INTERNA" | "ONLINE" | "WALKIN";

export interface ClienteCita {
  id: number | null;
  nombre: string;
  /** null si quien mira es PROFESIONAL y el negocio no le deja ver teléfonos. */
  telefono: string | null;
  noShows: number;
  nuevo: boolean;
  alergias: string | null;
}

export interface LineaCita {
  id: number;
  servicioId: number;
  servicio: string;
  recursoId: number;
  recurso: string;
  inicio: string;
  fin: string;
  sobreTurno: boolean;
  /** 0 si quien mira es PROFESIONAL y el negocio no le deja ver precios. */
  precio: number;
  /** Fase 3: la cabina que ocupa además del profesional, y la pose. */
  espacioId?: number | null;
  espacio?: string | null;
  poseDesde?: string | null;
  poseHasta?: string | null;
}

export interface EventoCita {
  accion: string;
  de: EstadoCita | null;
  a: EstadoCita;
  usuario: string | null;
  en: string;
  origen: "WEB" | "ANDROID" | "ENLACE" | "SISTEMA";
}

export interface Cita {
  id: number;
  codigo: string;
  estado: EstadoCita;
  origen: OrigenCita;
  sucursalId: number;
  /** null en la cola: un walk-in no tiene hora hasta que lo atienden. */
  inicio: string | null;
  fin: string | null;
  total: number;
  nota: string | null;
  cliente: ClienteCita;
  lineas: LineaCita[];
  /**
   * Lo que pidió un walk-in de la cola (todavía sin líneas). El backend lo
   * manda en toda cita; opcional por si una respuesta vieja no lo trae.
   */
  serviciosPedidos?: { id: number; nombre: string }[];
  recursoPreferidoId: number | null;
  ventaId: number | null;
  /**
   * Cobrada dos veces, o cobrada estando cancelada / no vino: la venta se
   * aceptó y queda para revisar en el cierre de caja (ola B). Opcional: un
   * backend anterior no lo manda.
   */
  cobroRevisar?: boolean;
  noShowSugerido: boolean;
  creadaEn: string;
  /** Sólo en `GET /agenda/citas/:id`. */
  eventos?: EventoCita[];
}

export interface Bloqueo {
  id: number;
  /** null = toda la sucursal (un feriado). */
  recursoId: number | null;
  sucursalId: number | null;
  inicio: string;
  fin: string;
  motivo: string;
}

export interface Tramo {
  /** "HH:mm" en hora del negocio. */
  desde: string;
  hasta: string;
}

/** Una forma de hacer toda la secuencia de servicios a partir de `inicio`. */
export interface Propuesta {
  inicio: string;
  lineas: {
    servicioId: number;
    recursoId: number;
    inicio: string;
    fin: string;
    /** Fase 3: la cabina asignada y la pose, si las hay. */
    espacioId?: number;
    poseDesde?: string;
    poseHasta?: string;
  }[];
}

export interface ClienteFicha {
  id: number;
  nombre: string;
  telefono: string | null;
  fechaNacimiento: string | null;
  alergias: string | null;
  notas: string | null;
  noShows: number;
  bloqueadoOnline: boolean;
  ultimaVisita: string | null;
  creadoEn: string;
}

/** Una cita en el historial de la ficha (A7). */
export interface CitaHistorial {
  id: number;
  codigo: string;
  estado: EstadoCita;
  origen: OrigenCita;
  sucursalId: number;
  sucursal: string;
  inicio: string | null;
  fin: string | null;
  /** 0 si quien mira es PROFESIONAL: la ficha no le muestra montos. */
  total: number;
  ventaId: number | null;
  cobroRevisar: boolean;
  motivoCancelacion: string | null;
  lineas: {
    servicioId: number;
    servicio: string;
    recursoId: number;
    recurso: string;
    inicio: string;
    fin: string;
    precio: number;
  }[];
}

/** Una venta del cliente: la que cobró una de sus citas o una que se le fió. */
export interface CompraHistorial {
  id: number;
  comprobante: string | null;
  fecha: string;
  total: number;
  estado: string;
  citaId: number | null;
  fiado: boolean;
  items: {
    producto: string;
    cantidad: number;
    subtotal: number;
    /** La línea se pagó con una sesión de este paquete (QA S2-06). */
    paquete?: string;
  }[];
}

/** `GET /agenda/clientes/:id`: la ficha con su historia (ola B). */
export type ClienteFichaDetalle = ClienteFicha & {
  citas: CitaHistorial[];
  compras: CompraHistorial[];
};

/** Lo que se puede cambiar de la ficha desde A7. `null` borra el dato. */
export interface EditarClienteInput {
  nombre?: string;
  telefono?: string | null;
  fechaNacimiento?: string | null;
  alergias?: string | null;
  notas?: string | null;
  bloqueadoOnline?: boolean;
}

/** `GET /agenda/citas/:id/carrito`: lo que el POS precarga para cobrar la cita. */
export interface CarritoCita {
  citaId: number;
  codigo: string;
  estado: EstadoCita;
  /** La venta que ya la cobró, si la hay: cobrarla otra vez queda para revisar. */
  ventaId: number | null;
  cobroRevisar: boolean;
  sucursalId: number;
  cliente: { id: number | null; nombre: string };
  lineas: {
    productoId: number;
    descripcion: string;
    cantidad: 1;
    /** El precio vigente (el de la sucursal si lo tiene): el que va a cobrar la venta. */
    precio: number;
    recursoId: number | null;
    recurso: string | null;
    /** Fase 3: la sesión de paquete que cubriría este servicio, si hay saldo. */
    paquete?: CoberturaPaquete | null;
  }[];
  total: number;
  /** Fase 3: lo que queda por cobrar si se usan las sesiones de paquete. */
  totalConPaquetes?: number;
}

export type TipoAviso =
  | "CITA_NUEVA"
  | "RESERVA_ONLINE"
  | "SOLICITUD_ONLINE"
  | "CITA_MOVIDA"
  | "CITA_CANCELADA"
  | "NO_SHOW_SUGERIDO"
  | "COBRO_REVISAR";

/** Un aviso interno (§9.1). `texto` viene listo para mostrar. */
export interface AvisoAgenda {
  clave: string;
  tipo: TipoAviso;
  citaId: number;
  codigo: string;
  cliente: string;
  sucursalId: number;
  inicio: string | null;
  recursos: string[];
  usuario: string | null;
  en: string;
  texto: string;
}

// ── De §10.1, sólo lectura ───────────────────────────────────────────────────

export interface Servicio {
  id: number;
  nombre: string;
  categoriaId: number | null;
  categoria: string | null;
  precio: number;
  duracionMin: number | null;
  bufferMin: number | null;
  reservableOnline: boolean;
  recursoIds: number[];
  activo: boolean;
}

export interface Recurso {
  id: number;
  tipo: "PROFESIONAL" | "ESPACIO";
  nombre: string;
  nombrePublico: string | null;
  /** Lo elige el negocio: se pinta tal cual, no sale del tema. */
  color: string;
  telefono: string | null;
  comisionPct: number | null;
  usuarioId: number | null;
  usuario: { id: number; nombre: string; username: string } | null;
  publicadoOnline: boolean;
  activo: boolean;
  orden: number;
  sucursalIds: number[];
  servicioIds: number[];
}

/** Las reglas que estas pantallas consultan; el resto las usa la fase 2. */
export interface ReglasAgenda {
  granularidadMin: number;
  bufferGeneralMin: number;
  profesionalPuedeAgendar: boolean;
  profesionalPuedeBloquear: boolean;
  profesionalVeTelefono: boolean;
  profesionalVePrecios: boolean;
}

// ── Respuestas ───────────────────────────────────────────────────────────────

export type RecursoDelDia = Recurso & { tramos: Tramo[] };

export interface AgendaDia {
  fecha: string;
  sucursalId: number;
  recursos: RecursoDelDia[];
  citas: Cita[];
  bloqueos: Bloqueo[];
  cola: Cita[];
}

export interface ContadoresHoy {
  porConfirmar: number;
  enEspera: number;
  enAtencion: number;
  porCobrar: number;
  noShowSugeridos: number;
  /** Solicitudes online por aprobar de la sucursal, de cualquier día (fase 2). */
  solicitudes?: number;
}

export interface AgendaHoy {
  citas: Cita[];
  cola: Cita[];
  contadores: ContadoresHoy;
}

export interface MiAgendaRespuesta {
  /** Vacío = el usuario no está vinculado a ningún recurso. */
  recursos: Recurso[];
  citas: Cita[];
}

// ── Cuerpos ──────────────────────────────────────────────────────────────────

export type AccionCita =
  | "CONFIRMAR"
  | "LLEGO"
  | "ATENDER"
  | "FINALIZAR"
  | "NO_ASISTIO"
  | "CANCELAR"
  | "SIN_CARGO"
  | "ABANDONO"
  /** Corrige un "No vino" marcado por error: vuelve a como estaba. */
  | "DESHACER_NO_ASISTIO";

export interface LineaPedida {
  servicioId: number;
  /** null = cualquiera que haga el servicio. */
  recursoId: number | null;
}

export interface LineaReservada {
  servicioId: number;
  recursoId: number;
  inicio: string;
}

export interface CrearCitaInput {
  sucursalId: number;
  clienteId?: number;
  cliente?: { nombre: string; telefono: string };
  lineas: LineaReservada[];
  nota?: string;
  confirmada?: boolean;
  sobreTurno?: boolean;
  pin?: string;
  /**
   * No está en el contrato: lo agrega la web para que el backend sepa de
   * quién es el PIN, como en anular. El `ValidationPipe` del backend tiene
   * `whitelist` sin `forbidNonWhitelisted`, así que si no lo usa lo descarta.
   */
  autorizadorUsername?: string;
  clienteRequestId?: string;
}

export interface ColaInput {
  sucursalId: number;
  clienteId?: number;
  /** El walk-in no siempre da teléfono; el contrato no dice si es obligatorio en la cola. */
  cliente?: { nombre: string; telefono?: string };
  servicioIds: number[];
  recursoPreferidoId?: number;
}
