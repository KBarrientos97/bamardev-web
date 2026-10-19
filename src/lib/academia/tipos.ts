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
}

/** `POST /academia/carreras/simple` y `PUT /academia/carreras/:id/simple`. */
export interface CarreraSimpleInput {
  nombre: string;
  descripcion?: string | null;
  /** En orden; con `id` se renombra o reordena, sin `id` se crea. */
  modulos: { id?: number; nombre: string }[];
  precioModulo: number;
  descuentoCompletoPct: number;
  cupoDefecto?: number | null;
  pctDocente?: number | null;
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
  resumenCobro: {
    /** `pendiente` y `baseDocente` van null para el docente. */
    porMateria: { materiaOrden: number; pagaron: number; total: number; pendiente: number | null; baseDocente: number | null }[];
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
  aula?: string | null;
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
  plan: string | Ref | null;
  /** null para el docente. */
  saldo: number | null;
  vencido: boolean;
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
}

export interface FiltroAlumnos extends PedidoPagina {
  q?: string;
  sede?: number | null;
  carreraId?: number | null;
  grupoId?: number | null;
  estado?: string;
  debe?: boolean;
}

export type EstadoCuota = "PENDIENTE" | "PARCIAL" | "PAGADA" | "ANULADA";

export interface Cuota {
  id: number;
  numero: number;
  concepto: string;
  materiaOrdenes: number[];
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
  eventos: { accion: string; detalle: string | null; usuario: string | null; en: string }[];
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
  planElegido?: { id: number; nombre: string; generado: PlanGenerado | null } | null;
  /** Siempre false hasta el QR de BISA. */
  pagoQr?: boolean;
}

export interface CarritoInscripcion {
  alumno: { id: number; nombre: string };
  pagadores: { clienteId: number; nombre: string; rol: "ALUMNO" | "TUTOR"; principal: boolean }[];
  lineas: { productoId: number; cuotaId: number; descripcion: string; saldo: number; vence: string; vencida: boolean }[];
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
  alumno: { id: number; nombre: string; codigo: string | null };
  contacto: { nombre: string; telefono: string | null; esTutor: boolean };
  grupo: Ref;
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
  avisos: { tipo: TipoAvisoHoy; titulo: string; texto: string; grupoId?: number }[];
  /** Las clases de la sede ese día (F1b). */
  clases: ClaseDelDia[];
}

// ── Calendario (ronda 2, N1) ────────────────────────────────────────────────

export interface GrupoEnCalendario {
  grupoId: number;
  nombre: string;
  carrera: Ref;
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
  pagaronModulo: number | null;
  llegadaEn: string | null;
  atrasoMin: number | null;
  lista: { pasada: boolean; presentes: number; total: number };
}

export interface ProximaClase {
  fecha: string;
  grupoId: number;
  nombre: string;
  materia: string | { orden: number; nombre: string };
  horaInicio: string;
  horaFin: string;
  aula: string | null;
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
  };
  guardada: boolean;
  editable: boolean;
  resumen: { pagaron: number; total: number };
  alumnos: { inscripcionId: number; nombre: string; estadoPago: EstadoPagoModulo | null; estado: EstadoAsistencia | null }[];
}

// ── Notas (F1b) ─────────────────────────────────────────────────────────────

export interface NotasDelGrupo {
  materia: { id: number; orden: number; nombre: string; desde: string; hasta: string };
  materias: { id: number; orden: number; nombre: string; estado: EstadoMateriaGrupo }[];
  cerrada: boolean;
  notaMinima: number;
  escalaMax: number;
  items: { inscripcionId: number; nombre: string; estadoPago: EstadoPagoModulo | null; nota: number | null }[];
}

// ── Planilla del docente (F1b, D2) ──────────────────────────────────────────

export type EstadoPlanilla = "EN_CURSO" | "CERRADA" | "PAGADA";

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
}

export interface PlanillaMes {
  mes: string;
  retencionActiva: boolean;
  docentes: FilaPlanillaMes[];
  totales: { bruto: number; liquido: number };
}

export interface LineaPlanilla {
  inscripcionId: number;
  alumno: Ref;
  grupo: Ref;
  materia: { orden: number; nombre: string };
  formaPago: FormaPago;
  cobradoModulo: number;
  abonado: number;
  montoModulo: number;
  pct: number;
  monto: number;
  /** "Pagó Bs 1.350 el 8-sep · 1.350 ÷ 3 = 450 · 20 % = Bs 90". */
  explicacion: string;
}

export interface PlanillaDocente {
  docente: { personalId: number; nombre: string };
  mes: string;
  estado: EstadoPlanilla;
  pct: { defecto: number; porCurso: { carrera: string | Ref; pct: number }[] };
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
  };
  /** Para el docente (PROPIO) las cuatro listas llegan vacías. */
  cuentan: LineaPlanilla[];
  postergados: LineaPlanilla[];
  atrasados: LineaPlanilla[];
  sinPagar: LineaPlanilla[];
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
  }[];
  asistenSinPagar: { alumno: string | Ref; grupo: string | Ref; asistencias: number; estadoPago: EstadoPagoModulo | null; inscritoPor: string }[];
  pagaronNoVienen: { alumno: string | Ref; grupo: string | Ref; asistencias: number; clasesDelMes: number; inscritoPor: string }[];
  descuentosConPin: { inscripcionId: number; alumno: string | Ref; descuento: string; autorizadoPor: string; en: string }[];
  ventasAnuladas: { ventaId: number; comprobante: string | null; total: number; anuladaPor: string; en: string }[];
  inscripcionesPorUsuario: { usuario: string; sede: string | Ref; cantidad: number; cobrado: number }[];
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
  activosPorCurso: { curso: string | Ref; activos: number; cupo: number | null }[];
  morosidad: { vencido: number; estudiantes: number; pctEstudiantes: number };
  asistenciaPromedioPct: number | null;
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
