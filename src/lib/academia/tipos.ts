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
  /** Base del docente por materia, con la clave = orden de la materia. */
  baseDocente: Record<string, number>;
}

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
  montoDebe: number;
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
    porMateria: { materiaOrden: number; pagaron: number; total: number; pendiente: number; baseDocente: number }[];
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
}

export interface AlumnoDelGrupo {
  inscripcionId: number;
  alumno: { id: number; codigo: string | null; apellidos: string; nombres: string; menor: boolean };
  estado: EstadoInscripcion;
  plan: Ref | null;
  descuento: DescuentoInscripcion | null;
  pagos: { materiaOrden: number; estado: EstadoPagoMateria; detalle: string }[];
  saldo: number;
  vencido: boolean;
  asistenciaPct: number | null;
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
  saldo: number;
  vencido: boolean;
  ultimaAsistencia: string | null;
  estado: EstadoInscripcion;
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
}

export interface InscripcionDetalle {
  id: number;
  estado: EstadoInscripcion;
  grupo: { id: number; nombre: string; carrera: Ref | string; sede: Ref | string };
  plan: Ref | null;
  precioLista: number;
  descuento: DescuentoInscripcion | null;
  total: number;
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
  alumno: { id: number; apellidos: string; nombres: string; telefono: string | null; menor: boolean };
  tutor: { nombre: string; telefono: string | null } | null;
  grupo: { id: number; nombre: string; carrera: Ref | string; sede: Ref | string };
  turnoPreferido: string | null;
  mensaje: string | null;
  preinscritaEn: string;
  /** Más de 30 días: se calcula, sin cron. */
  vieja: boolean;
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
  sede: string | Ref;
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
}

// ── Hoy ─────────────────────────────────────────────────────────────────────

export type TipoAvisoHoy = "PREINSCRIPCIONES" | "SIE" | "CUPO" | "NOTAS";

export interface HoyAcademia {
  fecha: string;
  cobrar: {
    venceHoy: number;
    venceHoyCuotas: number;
    vencido: number;
    vencidoCuotas: number;
    items: { alumno: string; detalle: string; monto: number }[];
  };
  preinscripcionesNuevas: number;
  avisos: { tipo: TipoAvisoHoy; titulo: string; texto: string; grupoId?: number }[];
  /** Llegan en F1b. */
  clases: unknown[];
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
  privacidad: true;
  captcha?: string;
}

export interface PreinscripcionEnviada {
  ok: true;
  grupo: { nombre: string; sede: string; fechaInicio: string; direccion: string | null };
}
