/**
 * Tipos de la configuración de la agenda (A8) y del negocio (A11), calcados del
 * contrato de PLAN-DESARROLLO-BELLEZA §10.1. Viven aparte de `types.ts` porque
 * la agenda se construye en paralelo en varias ramas: así cada una suma sus
 * archivos sin pisarse en el archivo grande de tipos.
 *
 * Fechas del negocio `YYYY-MM-DD` y horas `HH:mm` en hora de La Paz; instantes
 * en ISO 8601 UTC. Días de semana: 1 = lunes … 7 = domingo.
 */

export type TipoRecurso = "PROFESIONAL" | "ESPACIO";

/** Un servicio de la agenda: un `Producto` tipo SERVICIO con su duración. */
export interface Servicio {
  id: number;
  nombre: string;
  categoriaId: number | null;
  categoria: string | null;
  precio: number;
  /** `null` = todavía no se le cargó: no se puede agendar. */
  duracionMin: number | null;
  bufferMin: number | null;
  reservableOnline: boolean;
  /** Quién lo hace: los recursos habilitados para este servicio. */
  recursoIds: number[];
  activo: boolean;
  /** Fase 3: el tipo de espacio que exige y el tiempo de pose. */
  requiereEspacioTipoId?: number | null;
  poseInicioMin?: number | null;
  poseMin?: number | null;
  /**
   * Al desactivarlo, las citas que lo tienen y todavía no pasaron (§7.3, QA
   * S2-03): nada se cancela solo. Sólo viene en la respuesta del PATCH.
   */
  citasAfectadas?: CitaAfectada[];
}

/** `POST /agenda/servicios`: crea el producto tipo SERVICIO con su duración. */
export interface ServicioInput {
  nombre: string;
  categoriaId: number | null;
  precio: number;
  duracionMin: number;
  bufferMin?: number;
  reservableOnline?: boolean;
}

/**
 * `PATCH /agenda/servicios/:productoId`. El nombre y el precio no van: son del
 * producto, y se cambian en Artículos como cualquier otro.
 */
export interface ServicioCambios {
  duracionMin?: number;
  bufferMin?: number;
  reservableOnline?: boolean;
  recursoIds?: number[];
  /** Desactivarlo devuelve `citasAfectadas` (QA S2-03). */
  activo?: boolean;
  /** Fase 3 (sólo se mandan si el negocio tiene la feature). */
  requiereEspacioTipoId?: number | null;
  poseInicioMin?: number | null;
  poseMin?: number | null;
}

/** Un profesional (o un espacio: cabina, sillón) que se agenda. */
export interface Recurso {
  id: number;
  tipo: TipoRecurso;
  nombre: string;
  nombrePublico: string | null;
  /** Hex `#RRGGBB`: es un dato del negocio, no del tema. */
  color: string;
  telefono: string | null;
  comisionPct: number | null;
  /** El usuario con rol PROFESIONAL que entra a "Mi agenda" con este recurso. */
  usuarioId: number | null;
  /**
   * `activo: false` = "Sin usuario" le quitó el acceso (QA VER-03): el
   * usuario sigue siendo de esa persona y se le devuelve en Personal.
   * Opcional: un backend viejo no lo manda.
   */
  usuario: { id: number; nombre: string; username: string; activo?: boolean } | null;
  /**
   * La persona de Personal que es este profesional (PLAN-ROLES §9): de ella
   * son su comisión y sus propinas. Null en un espacio. Opcional: un backend
   * viejo no lo manda.
   */
  personalId?: number | null;
  publicadoOnline: boolean;
  activo: boolean;
  orden: number;
  sucursalIds: number[];
  servicioIds: number[];
  /** % sobre productos de reventa (fase 2). Opcional: un backend viejo no lo manda. */
  comisionProductoPct?: number | null;
  /**
   * Fase 2: lo propio de este profesional en cada servicio que hace (null =
   * el del servicio). Opcional por la misma razón.
   */
  serviciosPropios?: ServicioPropio[];
  /** Fase 3, sólo ESPACIO: de qué tipo es (Cabina, Camilla…). */
  tipoEspacioId?: number | null;
  /**
   * Si tiene algún tramo de horario. Sin horario no se le ofrece ningún
   * turno (ni online ni en "Nueva cita"). Opcional: un backend viejo no lo
   * manda, y entonces no se avisa nada.
   */
  conHorario?: boolean;
  /**
   * Al desactivarlo, sus citas que todavía no pasaron (§7.3, QA S2-03). Sólo
   * viene en la respuesta del PATCH.
   */
  citasAfectadas?: CitaAfectada[];
}

/** Duración, precio y % propios de un profesional en un servicio. */
export interface ServicioPropio {
  servicioId: number;
  duracionMin: number | null;
  precio: number | null;
  comisionPct: number | null;
}

/** Cuerpo de `POST /agenda/recursos` y `PATCH /agenda/recursos/:id`. */
export interface RecursoInput {
  tipo: TipoRecurso;
  nombre: string;
  nombrePublico?: string | null;
  color?: string;
  telefono?: string | null;
  comisionPct?: number | null;
  usuarioId?: number | null;
  /**
   * Sólo en el alta: el profesional se crea desde alguien que ya está en
   * Personal (con o sin login). El login es el de esa persona, así que con
   * este campo no se manda `usuarioId`.
   */
  personalId?: number;
  publicadoOnline?: boolean;
  activo?: boolean;
  orden?: number;
  sucursalIds: number[];
  servicioIds: number[];
  tipoEspacioId?: number | null;
}

/** Un tramo de trabajo dentro de un día: "09:00" a "13:00". */
export interface Tramo {
  desde: string;
  hasta: string;
}

/** Un tramo de la semana tipo de un recurso, en una sucursal. */
export interface TramoHorario extends Tramo {
  sucursalId: number;
  /** 1 = lunes … 7 = domingo. */
  dia: number;
}

/** Un día que no sigue la semana tipo. `tramos` vacío = no trabaja. */
export interface ExcepcionHorario {
  id: number;
  recursoId: number;
  fecha: string;
  tramos: Tramo[];
}

export interface ExcepcionInput {
  fecha: string;
  tramos: Tramo[];
}

/**
 * Un bloqueo de una sola vez (vacaciones, curso, feriado de la sucursal). Sin
 * `recursoId` es de toda la sucursal.
 */
export interface Bloqueo {
  id: number;
  recursoId: number | null;
  sucursalId: number | null;
  /** Instantes ISO en UTC. */
  inicio: string;
  fin: string;
  motivo: string;
}

export interface BloqueoInput {
  recursoId?: number | null;
  sucursalId?: number | null;
  inicio: string;
  fin: string;
  motivo: string;
}

/**
 * Lo que esta pantalla lee de una `Cita` (§10.2) para avisar cuáles quedan
 * dentro de un bloqueo. Es un recorte a propósito: la cita entera es de las
 * pantallas de agenda, y acá sólo se lista.
 */
export interface CitaAfectada {
  id: number;
  codigo: string;
  estado: string;
  inicio: string | null;
  fin: string | null;
  cliente: { nombre: string } | null;
  lineas?: { servicio: string; recurso: string }[];
}

/** El POST de un bloqueo devuelve además las citas que quedaron adentro. */
export interface BloqueoCreado extends Bloqueo {
  citasAfectadas?: CitaAfectada[];
}

/**
 * Guardar la semana tipo o una excepción también devuelve las citas que
 * quedaron fuera del horario nuevo, desde hoy (QA M-06, §7.3). Opcional: un
 * backend anterior no lo manda.
 */
export interface HorariosGuardados {
  tramos: TramoHorario[];
  citasAfectadas?: CitaAfectada[];
}

export interface ExcepcionCreada extends ExcepcionHorario {
  citasAfectadas?: CitaAfectada[];
}

// ── Reglas del negocio (A11) ────────────────────────────────────────────────

/** `AUTOMATICA_CONOCIDOS` (B28): sola para clientes conocidos, solicitud para el resto. */
export type ModoConfirmacion = "MANUAL" | "AUTOMATICA" | "AUTOMATICA_CONOCIDOS" | "ANTICIPO_QR";

/** De dónde sale cada valor resuelto: sucursal → negocio → defecto del rubro. */
export type OrigenRegla = "SUCURSAL" | "NEGOCIO" | "DEFECTO";

export interface Reglas {
  granularidadMin: number;
  bufferGeneralMin: number;
  profesionalPuedeAgendar: boolean;
  profesionalPuedeBloquear: boolean;
  profesionalVeTelefono: boolean;
  profesionalVePrecios: boolean;
  // Reserva online: se guardan desde ya, se usan en la fase 2.
  modoConfirmacion: ModoConfirmacion;
  anticipacionMinHoras: number;
  anticipacionMaxDias: number;
  ventanaCancelacionHoras: number;
  vencimientoSolicitudHoras: number;
  citasActivasPorTelefono: number;
  citasPorTelefonoPorDia: number;
  noShowsParaBloquear: number;
  mostrarPreciosOnline: boolean;
  anticipoPct: number;
  anticipoPlazoMin: number;
  origen: Record<string, OrigenRegla>;
}

/** Los campos editables de las reglas (todo menos `origen`). */
export type CampoRegla = Exclude<keyof Reglas, "origen">;
export type ValoresReglas = Omit<Reglas, "origen">;

/** `PUT /agenda/reglas`: `sucursalId` null = todo el negocio. */
export type ReglasInput = { sucursalId: number | null } & Partial<ValoresReglas>;

/** Una fila de la bitácora de `GET /agenda/reglas/historial`. */
export interface CambioRegla {
  campo: string;
  /** Lo guardado: null = heredaba / vuelve a heredar. */
  antes: string | number | boolean | null;
  despues: string | number | boolean | null;
  /**
   * Lo que regía de verdad antes y después (B11), aunque se heredara. Opcional:
   * un backend anterior no lo manda.
   */
  antesEfectivo?: string | number | boolean | null;
  despuesEfectivo?: string | number | boolean | null;
  sucursalId: number | null;
  usuario: string | null;
  en: string;
}
