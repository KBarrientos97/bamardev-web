/**
 * Tipos de la vertical Educación, ronda 1 (F0 + F1a). Son los del contrato
 * compartido con el backend (ACADEMIAS-CONTRATO-API.md): JSON en camelCase,
 * montos como number con 2 decimales, fechas de calendario `AAAA-MM-DD` y
 * horas `HH:mm`. Lo que el contrato no fija y la web supone está marcado con
 * "Supuesto" para revisarlo contra el backend real.
 */

/** Las listas paginadas del contrato: `?page=1&pageSize=20` (máx 100). */
export interface Paginado<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PedidoPagina {
  page?: number;
  pageSize?: number;
}

// ── Ajustes ─────────────────────────────────────────────────────────────────

export interface AjustesAcademia {
  notaMinima: number;
  escalaMax: number;
  toleranciaAtrasoMin: number;
  descuentoAtrasoPorMin: number | null;
  pctDocenteDefecto: number;
  retencionPctDefecto: number;
  /** Hasta este % de descuento se inscribe sin PIN de quien autoriza. */
  topePromoSinPinPct: number;
  asistenciaMinimaPct: number | null;
  preinscripcionActiva: boolean;
  textosWhatsapp: Record<string, string> | null;
  // ── Ronda 2 ──
  /** Todos los módulos del instituto empiezan este día del mes (1..28). */
  diaInicioModulo: number;
  /** Cuántos meses dura un módulo (1..6). */
  duracionModuloMeses: number;
  /** Las filas del calendario; `almacenId` null = vale para todas las sedes. */
  franjas: Franja[] | null;
  /** Sin las 3 fotos la inscripción no pasa (D7). */
  fotosObligatorias: boolean;
  /** La retención del 16 %: por confirmar con el cliente (D9), apagada. */
  retencionActiva: boolean;
  /**
   * B7 (D2, 22-oct): días después del vencimiento en que el docente ve en
   * amarillo a quien debe; después, en rojo. 7 por defecto. Un backend
   * anterior no lo manda y el campo no se muestra.
   */
  diasEspera?: number;
  /**
   * B9: el subdominio del negocio, para armar el enlace de preinscripción
   * desde la recepción (que no ve "Mi página"). Ausente en un backend que no
   * lo manda: ahí se intenta con "Mi página".
   */
  subdominio?: string | null;
  /**
   * QA 23-oct: si la página está publicada. Sin publicar, el enlace de
   * preinscripción abre "Esta página no está disponible". Ausente en un
   * backend anterior: no se avisa nada.
   */
  paginaPublicada?: boolean;
}

export interface Franja {
  almacenId: number | null;
  inicio: string;
  fin: string;
}

// ── Carreras, materias y planes ─────────────────────────────────────────────

export type CategoriaCctp = "A" | "B";

export interface Materia {
  id: number;
  nombre: string;
  orden: number;
  horas: number;
  descripcion: string | null;
  periodo: string | null;
  activa: boolean;
}

export type TipoVence = "INSCRIPCION" | "INICIO_MATERIA" | "DIAS";

/** Una cuota del calendario de un plan. `cubre` son órdenes de materia. */
export interface CuotaPlan {
  n: number;
  monto: number;
  vence: { tipo: TipoVence; materiaOrden?: number; dias?: number };
  cubre: number[];
}

export interface PlanPago {
  id: number;
  nombre: string;
  orden: number;
  activo: boolean;
  total: number;
  calendario: CuotaPlan[];
  /** Base del docente por materia, con la clave = orden de la materia. Deja de usarse (D2). */
  baseDocente: Record<string, number>;
  /** Los dos del modo simple (D4); null = un plan armado a mano. */
  generado?: PlanGenerado | null;
}

export type PlanGenerado = "MES_A_MES" | "COMPLETO";

export interface Carrera {
  id: number;
  nombre: string;
  descripcion: string | null;
  horasTotales: number;
  categoriaCctp: CategoriaCctp | null;
  publicarEnPagina: boolean;
  activa: boolean;
  orden: number;
  fotoUrl: string | null;
  materias: Materia[];
  planes: PlanPago[];
  gruposActivos: number;
  /** El producto SERVICIO de la carrera: el de las líneas de cuota del POS. */
  productoId?: number | null;
  // ── Ronda 2: modo simple (D4) ──
  precioModulo?: number | null;
  descuentoCompletoPct?: number | null;
  cupoDefecto?: number | null;
  /** null = el del instituto (`pctDocenteDefecto`). */
  pctDocente?: number | null;
  /** Todos sus planes activos son los generados. */
  modoSimple?: boolean;
  /** Cambio #5: `round(n × precioModulo × (1 − desc))`, null sin precio. */
  precioCompleto?: number | null;
  // ── A4 (22-oct): el pago completo por precio final ──
  /** Si tiene valor, manda sobre `descuentoCompletoPct` (Bs 1.300 en vez de 13,33 %). */
  precioCompletoFijo?: number | null;
  /** Lo que se cobra por el pago completo, venga del % o del precio final. */
  precioCompletoEfectivo?: number | null;
  /** El % que equivale al precio final (13.33). */
  descuentoCompletoEquivalentePct?: number | null;
  // ── A5 (22-oct): el pago al docente, por % o por monto fijo ──
  /** Un backend anterior no lo manda: es PORCENTAJE. */
  pagoDocenteModo?: PagoDocenteModo;
  /** Bs por estudiante y por módulo pagado, con el modo MONTO. */
  montoDocente?: number | null;
}

/** Cómo se le paga al docente (A5): un % de lo que paga cada estudiante, o un monto fijo. */
export type PagoDocenteModo = "PORCENTAJE" | "MONTO";

/** Un curso de la planilla con su forma de pago al docente (QA 23-oct). */
export interface PagoDocenteCurso {
  id?: number;
  nombre: string;
  modo: PagoDocenteModo;
  pct: number | null;
  monto: number | null;
}

/** `POST /academia/carreras/simple` y `PUT /academia/carreras/:id/simple`. */
export interface CarreraSimpleInput {
  nombre: string;
  descripcion?: string | null;
  /** En orden; con `id` se renombra o reordena, sin `id` se crea. */
  modulos: { id?: number; nombre: string }[];
  precioModulo: number;
  /**
   * Con `precioCompletoFijo` el backend lo pone en null (A4: mandar uno limpia
   * el otro); igual se manda, con el % equivalente, por si el backend todavía
   * no conoce el precio final.
   */
  descuentoCompletoPct: number;
  /** A4: el precio final del pago completo; `null` lo saca y vuelve a mandar el %. */
  precioCompletoFijo?: number | null;
  cupoDefecto?: number | null;
  pctDocente?: number | null;
  /** A5: PORCENTAJE (como siempre) o MONTO, con `montoDocente` > 0. */
  pagoDocenteModo?: PagoDocenteModo;
  montoDocente?: number | null;
  publicarEnPagina?: boolean;
}

export interface CarreraInput {
  nombre: string;
  descripcion?: string | null;
  horasTotales: number;
  categoriaCctp?: CategoriaCctp | null;
  publicarEnPagina?: boolean;
}

export interface MateriaInput {
  nombre: string;
  horas: number;
  descripcion?: string | null;
  periodo?: string | null;
}

export interface PlanInput {
  nombre: string;
  calendario: CuotaPlan[];
  baseDocente: Record<string, number>;
}

// ── Grupos ──────────────────────────────────────────────────────────────────

export type EstadoGrupo = "POR_EMPEZAR" | "EN_CURSO" | "TERMINADO";
export type EstadoMateriaGrupo = "CERRADA" | "ACTUAL" | "FUTURA";

export interface Ref {
  id: number;
  nombre: string;
}

export interface GrupoResumen {
  id: number;
  nombre: string;
  carrera: Ref;
  sede: Ref;
  aula: string | null;
  /** El aula de la lista de la sede (BACK-5); `aula` queda como su nombre. Un backend anterior no lo manda. */
  aulaId?: number | null;
  /** 0 = domingo … 6 = sábado (Supuesto: como `Date.getDay()`). */
  dias: number[];
  horaInicio: string;
  horaFin: string;
  fechaInicio: string;
  fechaFin: string;
  cupo: number | null;
  inscripcionAbierta: boolean;
  publicarEnPagina: boolean;
  estado: EstadoGrupo;
  inscritos: number;
  alDia: number;
  deben: number;
  /** null para el docente (alcance PROPIO): no ve montos. */
  montoDebe: number | null;
  /** Cancelado: no aparece en la lista, pero el detalle lo dice. */
  cancelado?: boolean;
  materiaActual: { orden: number; nombre: string; docente: string | null } | null;
  materias: { orden: number; estado: EstadoMateriaGrupo }[];
}

export interface MateriaDelGrupo {
  id: number;
  materia: Materia;
  docente: { personalId: number; nombre: string } | null;
  desde: string;
  hasta: string;
  mesLiquidacion: string;
  notasCerradasEn: string | null;
}

export interface GrupoDetalle extends GrupoResumen {
  planesOfrecidos: PlanPago[];
  materiasGrupo: MateriaDelGrupo[];
  /** Al docente le llega sin `pagaron` (QA 23-oct): se trata como ausente. */
  resumenCobro?: {
    /** `pendiente` y `baseDocente` van null para el docente. */
    porMateria: { materiaOrden: number; pagaron?: number; total: number; pendiente: number | null; baseDocente: number | null }[];
  };
  /** Al crear: "más de 4 h por día" y parecidos. */
  avisos?: string[];
}

export interface FiltroGrupos extends PedidoPagina {
  sede?: number | null;
  carreraId?: number | null;
  estado?: EstadoGrupo | "";
  q?: string;
}

export type EstadoPagoMateria = "PAGADA" | "PARCIAL" | "PENDIENTE" | "VENCIDA" | "NA";

export interface DescuentoInscripcion {
  tipo: TipoDescuento;
  pct: number | null;
  monto: number | null;
  motivo?: string | null;
}

/** El pago del módulo actual, lo único de plata que ve el docente (D6). */
export type EstadoPagoModulo = "PAGADO" | "ABONO" | "SIN_PAGAR";

/**
 * B7 (22-oct): lo único de plata que ve el docente. ROJO = debe y pasó la
 * semana de espera (`diasEspera`), AMARILLO = debe dentro de la espera, null
 * = al día o todavía no venció. Lo calcula el backend; ausente en uno anterior.
 * Nunca bloquea nada (RM 0008/2016 art. 41).
 */
export type SemaforoPago = "ROJO" | "AMARILLO" | null;
export type FormaPago = "MES_A_MES" | "COMPLETO" | "OTRO";

export interface AlumnoDelGrupo {
  inscripcionId: number;
  alumno: { id: number; codigo: string | null; apellidos: string; nombres: string; menor: boolean };
  estado: EstadoInscripcion;
  plan: Ref | null;
  descuento: DescuentoInscripcion | null;
  /** `detalle` va null para el docente. */
  pagos: { materiaOrden: number; estado: EstadoPagoMateria; detalle: string | null }[];
  /** null para el docente. */
  saldo: number | null;
  vencido: boolean;
  asistenciaPct: number | null;
  /** Del módulo actual; null si el grupo no empezó o el módulo no tiene cuota. */
  estadoPago?: EstadoPagoModulo | null;
  formaPago?: FormaPago | null;
  /** B7: sólo para el docente. */
  semaforo?: SemaforoPago;
}

export type FiltroAlumnosGrupo = "todos" | "deben" | "aldia" | "retirados";

export interface MateriaGrupoInput {
  materiaId: number;
  personalId?: number | null;
  desde?: string;
  hasta?: string;
  mesLiquidacion?: string;
}

export interface GrupoInput {
  carreraId: number;
  almacenId: number;
  nombre?: string;
  /** Texto libre, el de antes: lo preferido es `aulaId`. */
  aula?: string | null;
  /** El aula de la lista de la sede del grupo; `null` = sin aula. Si se muda de sede hay que mandar la de la nueva o `null`. */
  aulaId?: number | null;
  dias: number[];
  horaInicio: string;
  horaFin: string;
  fechaInicio: string;
  fechaFin?: string;
  cupo?: number | null;
  inscripcionAbierta?: boolean;
  publicarEnPagina?: boolean;
  planesOfrecidos?: number[];
  materias?: MateriaGrupoInput[];
  /** Sólo en el PATCH: cancelar el grupo o reactivarlo. */
  cancelado?: boolean;
  /**
   * Contrato #31: un inicio anterior al del módulo en curso es un grupo que
   * ya venía en clases; sólo vale con `academia.configurar`.
   */
  confirmarInicioPasado?: boolean;
}

export interface Docente {
  personalId: number;
  nombre: string;
  sedes: Ref[];
  pctDocente: number | null;
  retencionPct: number | null;
  tieneLogin: boolean;
}

// ── Alumnos ─────────────────────────────────────────────────────────────────

/** Supuesto: los estados que nombra PA §7 (En observación · Activa · Retirada · Concluida). */
export type EstadoInscripcion =
  | "PREINSCRITA"
  | "OBSERVACION"
  | "ACTIVA"
  | "RETIRADA"
  | "CONCLUIDA"
  | "DESCARTADA"
  | (string & {});

export interface AlumnoFila {
  id: number;
  codigo: string | null;
  apellidos: string;
  nombres: string;
  ci: string | null;
  telefono: string | null;
  grupoActual: { id: number; nombre: string; sede: string | Ref } | null;
  /** null para el docente (no ve cómo paga cada estudiante). */
  plan: string | Ref | null;
  /** null para el docente. */
  saldo: number | null;
  /**
   * null para el docente: quien no ve montos tampoco ve si hay deuda vencida
   * (el semáforo lo ve en el grupo). `null` NO es «al día».
   */
  vencido: boolean | null;
  ultimaAsistencia: string | null;
  estado: EstadoInscripcion;
  /** Ronda 2 (D7): cómo están sus 3 fotos. */
  fotos?: EstadoFotos;
}

export type EstadoFotos = "COMPLETAS" | "POR_REVISAR" | "OBSERVADAS" | "FALTAN";
export type TipoFoto = "FOTO" | "CI_ANVERSO" | "CI_REVERSO";
export const TIPOS_FOTO: TipoFoto[] = ["FOTO", "CI_ANVERSO", "CI_REVERSO"];

/** Los metadatos de una foto: los ve quien ve la ficha; la imagen, sólo con `academia.fotos`. */
export interface FotoAlumno {
  tipo: TipoFoto;
  subidaEn: string;
  revisadaEn: string | null;
  revisadaPor: string | null;
  observacion: string | null;
  /**
   * Lo que el backend dice de esta foto (QA ronda 2, B-06): la observada no
   * es revisada. Un backend anterior no lo manda y se deduce de los campos.
   */
  estado?: "POR_REVISAR" | "REVISADA" | "OBSERVADA";
}

/**
 * Una fila del historial de las fotos (L9, 28-oct): quién las aprobó, les puso
 * una observación o cambió una, y cuándo. Lo último primero. Llega sólo a quien
 * revisa fotos (`academia.fotos`).
 */
export interface RevisionFoto {
  accion: "APROBADA" | "OBSERVADA" | "REEMPLAZADA";
  tipos: TipoFoto[];
  observacion: string | null;
  usuario: string | null;
  en: string;
}

export interface FiltroAlumnos extends PedidoPagina {
  q?: string;
  sede?: number | null;
  carreraId?: number | null;
  grupoId?: number | null;
  estado?: string;
  debe?: boolean;
  /** Cambio #47: filtra por cómo están las fotos. */
  fotos?: EstadoFotos;
}

export type EstadoCuota = "PENDIENTE" | "PARCIAL" | "PAGADA" | "ANULADA";

export interface Cuota {
  id: number;
  numero: number;
  concepto: string;
  materiaOrdenes: number[];
  /**
   * D6: los módulos que cubre con su nombre, ordenados. Opcional sólo para una
   * respuesta de un backend anterior: sin esto se dicen los códigos «M2».
   */
  materias?: { orden: number; nombre: string }[];
  monto: number;
  pagado: number;
  saldo: number;
  vence: string;
  estado: EstadoCuota;
  vencida: boolean;
  diasAtraso: number;
  ultimoRecordatorioEn: string | null;
  recordatorios: number;
}

export interface Tutor {
  id: number;
  clienteId: number;
  nombre: string;
  telefono: string | null;
  parentesco: string;
  principal: boolean;
  ci?: string | null;
}

export interface InscripcionDetalle {
  id: number;
  estado: EstadoInscripcion;
  alumnoId?: number;
  /** MOSTRADOR u ONLINE. */
  origen?: string;
  /** El producto de la carrera: el que lleva cada línea de cuota en el POS. */
  productoId?: number | null;
  inscritaEn?: string | null;
  preinscritaEn?: string | null;
  retiradaEn?: string | null;
  retiroMotivo?: string | null;
  turnoPreferido?: string | null;
  mensaje?: string | null;
  grupo: { id: number; nombre: string; carrera: Ref | string; sede: Ref | string };
  plan: Ref | null;
  /** null para el docente, que tampoco recibe las cuotas. */
  precioLista: number | null;
  descuento: DescuentoInscripcion | null;
  total: number | null;
  cuotas: Cuota[];
  pagos: { ventaId: number; comprobante: string | null; fecha: string; sede: string | Ref; monto: number; cuotaId: number }[];
  /**
   * `detalle` es el JSON que guardó el backend (cambia según la acción): se
   * muestra con `textoEvento`, nunca tal cual (QA ronda 2, B-17).
   */
  eventos: EventoInscripcion[];
  /**
   * Sólo en la respuesta de inscribir y convertir: el WhatsApp de bienvenida
   * que arma el backend (QA ronda 2, B-19), al tutor si es menor. `null` si
   * no hay a quién escribirle. Un backend anterior no lo manda (`undefined`)
   * y la web lo arma como antes.
   */
  bienvenida?: { telefono: string | null; aTutor: boolean; texto: string; url: string } | null;
  /**
   * D3: sólo en la respuesta de inscribir y convertir. `true` si se inscribió
   * sin las fotos obligatorias; `fotosFaltan` dice cuáles. Un backend anterior no los manda.
   */
  fotosPendientes?: boolean;
  fotosFaltan?: TipoFoto[];
}

export interface EventoInscripcion {
  accion: string;
  detalle: unknown;
  usuario: string | null;
  en: string;
}

export interface AlumnoDetalle {
  id: number;
  codigo: string | null;
  apellidos: string;
  nombres: string;
  clienteId: number;
  ci: string | null;
  ciExpedido: string | null;
  fechaNacimiento: string | null;
  edad: number | null;
  menor: boolean;
  telefono: string | null;
  genero: string | null;
  direccion: string | null;
  observaciones: string | null;
  tutores: Tutor[];
  inscripciones: InscripcionDetalle[];
  /** Ronda 2: las que tiene (las que faltan no vienen). */
  fotos?: FotoAlumno[];
  /** L9: el historial de las fotos (vacío sin `academia.fotos`; un backend anterior no lo manda). */
  historialFotos?: RevisionFoto[];
}

export interface EditarAlumnoInput {
  apellidos?: string;
  nombres?: string;
  ci?: string | null;
  ciExpedido?: string | null;
  fechaNacimiento?: string | null;
  telefono?: string | null;
  genero?: string | null;
  direccion?: string | null;
  observaciones?: string | null;
}

export interface TutorInput {
  nombre: string;
  telefono: string;
  parentesco: string;
  ci?: string;
  principal?: boolean;
}

// ── Inscripciones ───────────────────────────────────────────────────────────

export type TipoDescuento = "BECA" | "PROMOCION";

export interface DescuentoInput {
  tipo: TipoDescuento;
  pct?: number;
  monto?: number;
  motivo: string;
  autorizador?: { username: string; pin: string };
}

export interface AlumnoNuevoInput {
  ci: string;
  ciExpedido?: string;
  apellidos: string;
  nombres: string;
  fechaNacimiento?: string;
  telefono?: string;
}

export interface InscripcionInput {
  alumnoId?: number;
  alumno?: AlumnoNuevoInput;
  tutor?: { nombre: string; telefono: string; parentesco: string; ci?: string };
  grupoId: number;
  planPagoId: number;
  descuento?: DescuentoInput;
  confirmarSobreCupo?: boolean;
  /** D3: inscribir aunque falten las fotos (sólo con `fotosObligatorias` prendido); queda en «Faltan fotos». */
  fotosPendientes?: boolean;
}

export interface Preinscripcion {
  id: number;
  /** PREINSCRITA o DESCARTADA (la bandeja también muestra las descartadas). */
  estado?: EstadoInscripcion;
  origen?: string;
  alumno: { id: number; apellidos: string; nombres: string; telefono: string | null; menor: boolean };
  tutor: { nombre: string; telefono: string | null; parentesco?: string | null } | null;
  grupo: { id: number; nombre: string; carrera: Ref | string; sede: Ref | string };
  turnoPreferido: string | null;
  mensaje: string | null;
  preinscritaEn: string;
  /** Más de 30 días: se calcula, sin cron. */
  vieja: boolean;
  /** Ronda 2: cuántas de las 3 fotos mandó (0..3). */
  fotos?: number;
  /** L9: cuáles mandó y cómo están (un backend anterior no los manda). */
  tiposFotos?: TipoFoto[];
  estadoFotos?: EstadoFotos;
  planElegido?: { id: number; nombre: string; generado: PlanGenerado | null } | null;
  /** Siempre false hasta el QR de BISA. */
  pagoQr?: boolean;
}

export interface CarritoInscripcion {
  alumno: { id: number; nombre: string };
  pagadores: { clienteId: number; nombre: string; rol: "ALUMNO" | "TUTOR"; principal: boolean }[];
  /** El curso, para decir «Barbería · M2 Degradados» (D6). */
  carrera?: { id: number; nombre: string };
  lineas: {
    productoId: number;
    cuotaId: number;
    descripcion: string;
    saldo: number;
    vence: string;
    vencida: boolean;
    /** Lo que cubre la cuota, con su nombre y ordenado (D6). Un backend anterior no lo manda. */
    materias?: { id?: number; orden: number; nombre: string }[];
  }[];
}

/** Un resultado de la búsqueda del POS (`GET /academia/cuotas-por-cobrar`). */
export interface AlumnoPorCobrar {
  alumnoId: number;
  inscripcionId: number;
  nombre: string;
  codigo: string | null;
  grupo: string | Ref;
  sede: Ref | string;
  saldo: number;
  vencido: boolean;
}

// ── Cobranza ────────────────────────────────────────────────────────────────

export type TipoCobranza = "vencidas" | "por-vencer" | "parciales";
export type Antiguedad = "1-7" | "8-30" | "30+";

export interface TotalesCobranza {
  vencido: number;
  vencidoCuotas: number;
  vencidoAlumnos: number;
  venceSemana: number;
  venceSemanaCuotas: number;
  venceMes: number;
  venceMesCuotas: number;
  cobradoMes: number;
  /** Ronda 2: abonos a medias. */
  parciales?: number;
  parcialesCuotas?: number;
}

export interface FilaCobranza {
  /**
   * Supuesto: el contrato no lo nombra, pero cobrar desde Cobranza necesita
   * la inscripción para pedir su carrito. Si no viene, el POS busca al alumno.
   */
  inscripcionId?: number;
  /** `ci` (D10): null si quien mira no ve datos personales. */
  alumno: { id: number; nombre: string; codigo: string | null; ci?: string | null };
  contacto: { nombre: string; telefono: string | null; esTutor: boolean };
  grupo: Ref;
  /** El curso del grupo (D6). */
  carrera?: Ref;
  sede: Ref;
  cuotas: Cuota[];
  saldo: number;
  diasAtraso: number;
  ultimoRecordatorioEn: string | null;
  recordatorios: number;
  /** El enlace público de pago, si ya se creó (ronda 2). */
  enlacePago?: string | null;
}

export interface RespuestaCobranza extends Paginado<FilaCobranza> {
  totales: TotalesCobranza;
}

export interface FiltroCobranza extends PedidoPagina {
  tipo: TipoCobranza;
  /** D10: nombre (cualquier orden, sin tildes), código, CI o teléfono (4 o más dígitos). */
  q?: string;
  sede?: number | null;
  carreraId?: number | null;
  antiguedad?: Antiguedad | "";
  agrupar?: "alumno";
}

export interface Recordatorio {
  telefono: string;
  texto: string;
  url: string;
  /** Ronda 2: el estado de cuenta público, ya incluido en `texto`. */
  enlacePago?: string;
}

// ── Hoy ─────────────────────────────────────────────────────────────────────

/** `SIE` sale de la lista en la ronda 2; se acepta cualquier otro por si el backend suma. */
export type TipoAvisoHoy = "PREINSCRIPCIONES" | "INSCRIPCIONES_ONLINE" | "EMPIEZA" | "CUPO" | "NOTAS" | (string & {});

export interface HoyAcademia {
  fecha: string;
  /** La sede que se miró, o null (todas). */
  sede?: number | null;
  cobrar: {
    venceHoy: number;
    venceHoyCuotas: number;
    vencido: number;
    vencidoCuotas: number;
    items: { alumno: { id: number; nombre: string }; detalle: string; monto: number }[];
  };
  preinscripcionesNuevas: number;
  avisos: { tipo: TipoAvisoHoy; titulo: string; texto: string; grupoId?: number; cantidad?: number }[];
  /** Las clases de la sede ese día (F1b). */
  clases: ClaseDelDia[];
}

// ── Aulas por sede (BACK-5) ─────────────────────────────────────────────────

export interface Aula {
  id: number;
  almacenId: number;
  sede: Ref;
  nombre: string;
  capacidad: number | null;
  activa: boolean;
  /** Cuántos grupos vigentes la usan. */
  enUso: number;
}

export interface AulaInput {
  almacenId: number;
  nombre: string;
  capacidad?: number | null;
}

// ── Sedes del instituto (BACK-6, C4) ────────────────────────────────────────

/** Una sede con lo que le importa al instituto: sin stock ni precios. */
export interface Sede {
  id: number;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  /** Texto libre ("Lun a Vie 8:00–20:00"); es el mismo que muestra Mi página. */
  horarioAtencion: string | null;
  esPrincipal: boolean;
  /** Aulas activas. */
  aulas: number;
  /** Franjas de la sede más las "de todas las sedes". */
  franjas: number;
  gruposVigentes: number;
}

export interface SedeInput {
  nombre?: string;
  direccion?: string | null;
  telefono?: string | null;
  horarioAtencion?: string | null;
}

/** Una franja tal como la ve una sede (C5). */
export interface FranjaDeSede {
  inicio: string;
  fin: string;
  /** Cargada antes "para todas las sedes": al guardar queda copiada a esta sede. */
  todasLasSedes: boolean;
}

export interface FranjasDeSede {
  sede: Ref;
  franjas: FranjaDeSede[];
}

export interface OmitidaTipica {
  inicio: string;
  fin: string;
  motivo: "YA_ESTA" | "SE_PISA";
  /** Con qué franja de la sede se pisa (o la que ya estaba). */
  con: { inicio: string; fin: string };
}

export interface ResultadoTipicas extends FranjasDeSede {
  agregadas: { inicio: string; fin: string }[];
  omitidas: OmitidaTipica[];
}

// ── Choques de horario (C10) ────────────────────────────────────────────────

export interface ConsultaChoques {
  almacenId: number;
  dias: number[];
  horaInicio: string;
  horaFin: string;
  fechaInicio: string;
  fechaFin?: string;
  aulaId?: number | null;
  docentes?: number[];
  excluirGrupoId?: number;
}

/** Un grupo que ya ocupa el aula o al docente en ese horario. */
interface GrupoQueChoca {
  grupoId: number;
  nombre: string;
  carrera: Ref;
  sede: Ref | string;
  /** Ya armado por el backend: «Lu Mi Vi 08:00–10:00». */
  horario: string;
  dias: number[];
  horaInicio: string;
  horaFin: string;
}

export interface ChoqueAula extends GrupoQueChoca {
  fechaInicio: string;
  fechaFin: string | null;
}

export interface ChoqueDocente extends GrupoQueChoca {
  personalId: number;
  docente: string;
  desde: string;
  hasta: string;
}

export interface RespuestaChoques {
  hayChoques: boolean;
  aula: ChoqueAula[];
  docentes: ChoqueDocente[];
}

// ── Calendario (ronda 2, N1) ────────────────────────────────────────────────

export interface GrupoEnCalendario {
  grupoId: number;
  nombre: string;
  carrera: Ref;
  /** U3: la sede del grupo, para rotular la tarjeta con «Todas las sedes». Un backend anterior no la manda. */
  sede?: Ref | null;
  modulo: { orden: number; nombre: string; total: number };
  ultimo: boolean;
  dias: number[];
  aula: string | null;
  docente: { personalId: number; nombre: string } | null;
  inscritos: number;
  cupo: number | null;
  inscripcionAbierta: boolean;
  /** null para el docente. */
  pagaronModulo: number | null;
}

export interface FilaCalendario {
  inicio: string;
  fin: string;
  /** false = un grupo que no calza con ninguna franja abrió su propia fila. */
  esFranja: boolean;
  celdas: { mes: string; grupos: GrupoEnCalendario[] }[];
}

export interface Calendario {
  sede: Ref | null;
  /** Cambio #9. */
  diaInicioModulo?: number;
  /** `AAAA-MM`. */
  meses: string[];
  filas: FilaCalendario[];
}

// ── Asistencia (F1b) ────────────────────────────────────────────────────────

export interface ClaseDelDia {
  sesionId: number;
  grupoId: number;
  nombre: string;
  carrera: string | Ref;
  materia: { orden: number; nombre: string };
  horaInicio: string;
  horaFin: string;
  aula: string | null;
  sede: string | Ref;
  docente: string | { personalId: number; nombre: string } | null;
  inscritos: number;
  /** Al docente ya no le llega (QA 23-oct): ausente = no se muestra. */
  pagaronModulo?: number | null;
  /** B7: al docente, cuántos de la clase tienen el semáforo en rojo y en amarillo. */
  semaforos?: { rojo: number; amarillo: number };
  llegadaEn: string | null;
  atrasoMin: number | null;
  lista: { pasada: boolean; presentes: number; total: number };
  /** Cambio #13. */
  fecha?: string;
  estado?: string;
}

export interface ProximaClase {
  /** Cambio #13. */
  sesionId?: number;
  carrera?: string | Ref;
  fecha: string;
  grupoId: number;
  nombre: string;
  materia: string | { orden: number; nombre: string };
  horaInicio: string;
  horaFin: string;
  aula: string | null;
}

/** Lo que responde `POST /academia/sesiones/:id/llegada` (D7). El docente nunca ve `descuento`: la UI no lo usa. */
export interface LlegadaRegistrada {
  sesionId: number;
  llegadaEn: string;
  atrasoMin: number;
  toleranciaMin: number;
  conAtraso: boolean;
  minutosAntes?: number;
  muyTemprano?: boolean;
  descuento?: unknown;
}

export interface MisClases {
  fecha: string;
  clases: ClaseDelDia[];
  proximas: ProximaClase[];
}

export type EstadoAsistencia = "PRESENTE" | "AUSENTE" | "TARDE" | "JUSTIFICADO";

export interface ListaDeClase {
  sesion: {
    id: number;
    fecha: string;
    horaInicio: string;
    horaFin: string;
    estado: string;
    materia: { orden: number; nombre: string };
    /** Cambio #14. */
    llegadaEn?: string | null;
    atrasoMin?: number | null;
  };
  /** Cambio #14: el grupo, para el título. */
  grupo?: { id: number; nombre: string; carrera: string | Ref; sede: string | Ref; aula: string | null };
  guardada: boolean;
  editable: boolean;
  /**
   * Al docente no le llegan `pagaron` (QA 23-oct) y sí `semaforos` (cuántos
   * en rojo y en amarillo). Admin y recepción, como siempre.
   */
  resumen: { pagaron?: number; total: number; semaforos?: { rojo: number; amarillo: number } };
  /** `semaforo` (B7) sólo para el docente. */
  alumnos: {
    inscripcionId: number;
    nombre: string;
    estadoPago: EstadoPagoModulo | null;
    estado: EstadoAsistencia | null;
    semaforo?: SemaforoPago;
  }[];
}

// ── Notas (F1b) ─────────────────────────────────────────────────────────────

export interface NotasDelGrupo {
  materia: { id: number; orden: number; nombre: string; desde: string; hasta: string };
  materias: { id: number; orden: number; nombre: string; estado: EstadoMateriaGrupo; docente?: string | { personalId: number; nombre: string } | null }[];
  cerrada: boolean;
  /** Cambio #16. */
  cerradaEn?: string | null;
  notaMinima: number;
  escalaMax: number;
  /** `semaforo` (B7) sólo para el docente. */
  items: { inscripcionId: number; nombre: string; estadoPago: EstadoPagoModulo | null; nota: number | null; semaforo?: SemaforoPago }[];
}

// ── Planilla del docente (F1b, D2) ──────────────────────────────────────────

export type EstadoPlanilla = "EN_CURSO" | "CERRADA" | "PAGADA";

/** Cómo se le paga al docente: lo que acepta `POST /academia/planilla/:id/pagar` (contrato, cambio 22). */
export type MetodoPagoPlanilla = "EFECTIVO" | "TRANSFERENCIA" | "QR" | "TARJETA";

export interface FilaPlanillaMes {
  personalId: number;
  nombre: string;
  grupos: number;
  cuentan: number;
  total: number;
  bruto: number;
  retencion: number | null;
  liquido: number;
  estado: EstadoPlanilla;
  /** Cambio #18. */
  atrasados?: number;
  postergados?: number;
  sinPagar?: number;
  /** Bug 4: cuántos ajustes trae el mes. */
  ajustes?: number;
}

export interface PlanillaMes {
  mes: string;
  retencionActiva: boolean;
  docentes: FilaPlanillaMes[];
  totales: { bruto: number; liquido: number };
}

/** A6 (22-oct): por qué no se le paga al docente una línea postergada o sin pagar. */
export type MotivoNoPago = "NO_PAGO" | "RETIRO" | "BECA" | "ACUERDO" | "OTRO";

export interface MotivoNoPagoLinea {
  motivo: MotivoNoPago;
  /** Obligatorio con OTRO. */
  detalle: string | null;
  /** Quién lo anotó. */
  usuario: string | Ref | null;
  fecha: string;
}

export interface LineaPlanilla {
  inscripcionId: number;
  alumno: Ref;
  grupo: Ref;
  /** `id` (o `materiaId` en la línea) identifica la línea para el motivo (A6); uno anterior no lo manda. */
  materia: { id?: number; orden: number; nombre: string };
  materiaId?: number;
  /** A6: sólo en postergados y sin pagar; `null` si nadie lo anotó, ausente en un backend anterior. */
  motivoNoPago?: MotivoNoPagoLinea | null;
  formaPago: FormaPago;
  cobradoModulo: number;
  abonado: number;
  montoModulo: number;
  /**
   * Cómo se le paga al docente esta línea (bug 17). Un backend anterior no lo
   * manda y todo era por %.
   */
  modalidad?: PagoDocenteModo;
  /** El % de lo cobrado; `null` con `modalidad` MONTO (no hay % que mostrar). */
  pct: number | null;
  /** Bs por módulo pagado con `modalidad` MONTO; `null` por %. */
  montoFijo?: number | null;
  /** 0 en postergados y sin pagar (cambio #19): lo que sumaría es `montoPotencial`. */
  monto: number;
  montoPotencial?: number;
  sede?: Ref;
  /** "Pagó Bs 1.350 el 8-sep · 1.350 ÷ 3 = 450 · 20 % = Bs 90". */
  explicacion: string;
}

export interface PlanillaDocente {
  docente: { personalId: number; nombre: string };
  mes: string;
  estado: EstadoPlanilla;
  /** QA 23-oct: `modo` y `monto` (A5) en cada curso; un backend anterior no los manda. */
  pct: { defecto: number; porCurso: { carrera: string | Ref; pct: number; modo?: PagoDocenteModo; monto?: number | null }[] };
  /** QA 23-oct: cómo se le paga en cada curso de la planilla (A5). `monto` es null con PORCENTAJE. */
  carreras?: PagoDocenteCurso[];
  /** Cambio #19: los módulos del mes, también para el docente. */
  cerradaEn?: string | null;
  pagadaEn?: string | null;
  grupos?: { grupoId: number; nombre: string; carrera: Ref; materia: { orden: number; nombre: string }; sede: Ref; estudiantes: number; pct: number }[];
  resumen: {
    cuentan: number;
    postergados: number;
    sinPagar: number;
    atrasados: number;
    bruto: number;
    retencion: number | null;
    retencionActiva: boolean;
    /** Por confirmar con el cliente (D9): siempre null. */
    atrasos: number | null;
    liquido: number;
    // Cambio #19: cantidades y montos que el docente sí ve.
    cuentanPorForma?: { MES_A_MES: number; COMPLETO: number; OTRO: number };
    brutoCuentan?: number;
    brutoAtrasados?: number;
    /** Bug 4: cuántos ajustes (cobros anulados o repuestos después de liquidar) y lo que suman, con signo. */
    ajustes?: number;
    brutoAjustes?: number;
    postergadoHasta?: number;
    retencionPct?: number | null;
  };
  /** Para el docente (PROPIO) las cuatro listas llegan vacías. */
  cuentan: LineaPlanilla[];
  postergados: LineaPlanilla[];
  atrasados: LineaPlanilla[];
  sinPagar: LineaPlanilla[];
  /**
   * Bug 4: correcciones por cobros anulados o vueltos a cobrar de módulos ya
   * liquidados. Pueden ser negativas y ya están sumadas en el bruto.
   */
  ajustes?: LineaPlanilla[];
  meses: { mes: string; estado: EstadoPlanilla; liquido: number }[];
}

// ── Panel de control (N9) y reportes (E18) ──────────────────────────────────

export interface PanelControl {
  fotosPorRevisar: {
    alumnoId: number;
    nombre: string;
    ci: string | null;
    fechaNacimiento: string | null;
    grupo: string | Ref;
    inscritoPor: string;
    inscritaEn: string;
    /** Cambio #28: los tipos cargados. */
    fotos?: TipoFoto[];
    /** D3: las que faltan de las tres. */
    faltan?: TipoFoto[];
  }[];
  /**
   * D3 (26-oct): quienes se inscribieron con las fotos pendientes («Faltan
   * fotos»). Misma forma que `fotosPorRevisar`; llega vacío si el instituto no
   * pide las fotos (`fotosObligatorias` apagado) y un backend anterior no lo manda.
   */
  fotosFaltan?: PanelControl["fotosPorRevisar"];
  /**
   * Cambio #33 (QA ronda 2, B-06): los que tienen alguna foto observada. Ya
   * no esperan al dueño sino a la recepción, que tiene que cambiarlas; un
   * backend anterior no lo manda.
   */
  fotosObservadas?: {
    alumnoId: number;
    nombre: string;
    ci: string | null;
    fechaNacimiento: string | null;
    grupo: string | Ref | null;
    inscritoPor: string;
    inscritaEn: string | null;
    fotos?: TipoFoto[];
    faltan?: TipoFoto[];
    observadas: TipoFoto[];
    observacion: string | null;
    observadaEn: string | null;
    observadaPor: string | null;
  }[];
  /**
   * Ronda 1 (F1): los arreglos de arriba llegan cortados (50 estudiantes, 100
   * grupos); estos totales dicen cuántos son de verdad, para avisar «y N más»
   * en vez de mostrar el corte como si fuera todo. Un backend anterior no los manda.
   */
  fotosPorRevisarTotal?: number;
  fotosObservadasTotal?: number;
  /**
   * L9 (28-oct): las aprobadas en los últimos días por alguien que no es el
   * administrador (la recepción con el permiso de fotos), para que el dueño
   * las vuelva a mirar. Salen cuando él las revisa. Un backend anterior no lo manda.
   */
  fotosAprobadasPorOtros?: (PanelControl["fotosPorRevisar"][number] & { aprobadaPor: string | null; aprobadaEn: string })[];
  fotosAprobadasPorOtrosTotal?: number;
  /** Cuántos días mira esa lista (14). */
  fotosAprobadasPorOtrosDias?: number;
  fotosFaltanTotal?: number;
  gruposSinDocenteTotal?: number;
  /** Cambio #49 (B-31): grupos vivos con más inscritos que su cupo, el más pasado primero. */
  sobrecupos?: { grupoId: number; nombre: string; carrera: Ref | null; sede: Ref | null; inscritos: number; cupo: number }[];
  /**
   * D9 (26-oct): grupos vigentes con módulos que todavía no terminaron y no
   * tienen docente («Elegir después»), el que empieza antes primero (máx. 100).
   * Un backend anterior no lo manda.
   */
  gruposSinDocente?: {
    grupoId: number;
    nombre: string;
    carrera: Ref;
    sede: Ref;
    horario: { dias: number[]; horaInicio: string; horaFin: string };
    modulos: { orden: number; nombre: string; desde: string }[];
    inicio: string;
  }[];
  asistenSinPagar: { alumno: string | Ref; grupo: string | Ref; asistencias: number; estadoPago: EstadoPagoModulo | null; inscritoPor: string }[];
  pagaronNoVienen: { alumno: string | Ref; grupo: string | Ref; asistencias: number; clasesDelMes: number; inscritoPor: string }[];
  /** Cambio #28: todas las becas y promociones del mes; `conPin` = las autorizó otra persona. */
  descuentosConPin: {
    inscripcionId: number;
    alumno: string | Ref;
    descuento: string;
    autorizadoPor: string | null;
    en: string;
    conPin?: boolean;
    pidio?: string | null;
    motivo?: string | null;
    grupo?: string | Ref;
  }[];
  ventasAnuladas: { ventaId: number; comprobante: string | null; total: number; anuladaPor: string; en: string; sede?: string | Ref; vendio?: string | null; motivo?: string | null }[];
  inscripcionesPorUsuario: { usuario: string; sede: string | Ref | null; cantidad: number; cobrado: number; usuarioId?: number | null; descuentos?: number; anulaciones?: number }[];
}

export interface ReportesAcademia {
  mes: string;
  porSede: {
    sede: string | Ref;
    cobradoModulos: number;
    ventasProductos: number;
    sueldosDocentes: number;
    otrosGastos: number;
    resultado: number;
  }[];
  activosPorCurso: {
    curso: string | Ref;
    activos: number;
    cupo: number | null;
    // Cambio #29.
    grupos?: number;
    inscritosPorEmpezar?: number;
    cobrado?: number;
    vencido?: number;
  }[];
  morosidad: { vencido: number; estudiantes: number; pctEstudiantes: number; activos?: number };
  asistenciaPromedioPct: number | null;
  /** Cambio #29. */
  asistenciaPorGrupo?: { grupo: string | Ref; docente: string | Ref | null; pct: number | null }[];
}

// ── Público ─────────────────────────────────────────────────────────────────

export interface GrupoPublico {
  id: number;
  sede: Ref;
  dias: number[];
  horaInicio: string;
  horaFin: string;
  fechaInicio: string;
  cuposLibres: number | null;
}

export interface CursoPublico {
  id: number;
  nombre: string;
  descripcion: string | null;
  horasTotales: number;
  fotoUrl: string | null;
  materias: string[];
  desde: number | null;
  grupos: GrupoPublico[];
  // ── Ronda 2: las dos formas de pagar a la vista ──
  precioModulo?: number | null;
  precioCompleto?: number | null;
  ahorro?: number | null;
  modulos?: string[];
  planes?: { id: number; nombre: string; generado: PlanGenerado | null }[];
}

/** `GET /publico/academia/:sub/pagar/:token` (P6): nunca CI, teléfono ni apellidos. */
export interface EstadoCuentaPublico {
  instituto: { nombre: string; logoUrl: string | null; telefono: string | null };
  alumno: { nombres: string };
  curso: string;
  grupo: { nombre: string; sede: string };
  cuotas: { concepto: string; monto: number; pagado: number; saldo: number; vence: string; vencida: boolean; estado: EstadoCuota }[];
  proxima: { concepto: string; saldo: number; vence: string; vencida: boolean } | null;
  saldoTotal: number;
  qr: { tipo: "FIJO"; imagenUrl: string } | null;
}

export interface PreinscripcionInput {
  grupoId: number;
  nombres: string;
  apellidos: string;
  telefono: string;
  fechaNacimiento?: string;
  edad?: number;
  tutor?: { nombre: string; telefono: string };
  mensaje?: string;
  /** Un horario que le quedaría mejor, si ninguno de los grupos le sirve. */
  turnoPreferido?: string;
  privacidad: true;
  captcha?: string;
  // ── Ronda 2 ──
  planPagoId?: number;
  ci?: string;
  ciExpedido?: string;
}

/** Las 3 fotos (D7), ya achicadas en el navegador. */
export type FotosInscripcion = Partial<Record<TipoFoto, Blob>>;

export interface PreinscripcionEnviada {
  ok: true;
  grupo: { nombre: string; sede: string; fechaInicio: string; direccion: string | null };
}
