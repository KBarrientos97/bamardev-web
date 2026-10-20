import type {
  AjustesAcademia,
  AlumnoDelGrupo,
  AlumnoDetalle,
  GrupoDetalle,
  PlanPago,
} from "../lib/academia/tipos";

/**
 * Datos de prueba de la vertical Educación, con los nombres del lienzo
 * (PLAN-ACADEMIAS §11): Barbería en Central, Camila debe la cuota 2.
 */

/** Los ajustes del instituto de los tests: los valores por defecto del contrato. */
export function ajustesDePrueba(cambios: Partial<AjustesAcademia> = {}): AjustesAcademia {
  return {
    notaMinima: 51,
    escalaMax: 100,
    toleranciaAtrasoMin: 5,
    descuentoAtrasoPorMin: null,
    pctDocenteDefecto: 20,
    retencionPctDefecto: 16,
    topePromoSinPinPct: 10,
    asistenciaMinimaPct: null,
    preinscripcionActiva: true,
    textosWhatsapp: null,
    diaInicioModulo: 10,
    duracionModuloMeses: 1,
    franjas: [
      { almacenId: null, inicio: "07:00", fin: "09:00" },
      { almacenId: null, inicio: "19:00", fin: "21:00" },
    ],
    fotosObligatorias: true,
    retencionActiva: false,
    ...cambios,
  };
}

export const PLAN_COMPLETO: PlanPago = {
  id: 1,
  nombre: "Completo",
  orden: 1,
  activo: true,
  total: 1360,
  baseDocente: { "1": 315, "2": 315, "3": 315 },
  calendario: [{ n: 1, monto: 1360, vence: { tipo: "INSCRIPCION" }, cubre: [1, 2, 3] }],
};

export const PLAN_CUOTAS: PlanPago = {
  id: 2,
  nombre: "Cuotas",
  orden: 2,
  activo: true,
  total: 1500,
  baseDocente: { "1": 315, "2": 315, "3": 315 },
  calendario: [
    { n: 1, monto: 750, vence: { tipo: "INSCRIPCION" }, cubre: [1] },
    { n: 2, monto: 750, vence: { tipo: "INICIO_MATERIA", materiaOrden: 2 }, cubre: [2, 3] },
  ],
};

const materia = (id: number, orden: number, nombre: string) => ({
  id,
  nombre,
  orden,
  horas: 40,
  descripcion: null,
  periodo: null,
  activa: true,
});

export function grupoDetalle(extra: Partial<GrupoDetalle> = {}): GrupoDetalle {
  return {
    id: 7,
    nombre: "Barbería · L-V 10:00",
    carrera: { id: 3, nombre: "Barbería y Peluquería" },
    sede: { id: 1, nombre: "Central" },
    aula: "Aula 2",
    dias: [1, 2, 3, 4, 5],
    horaInicio: "10:00",
    horaFin: "12:00",
    fechaInicio: "2026-08-17",
    fechaFin: "2026-11-13",
    cupo: 30,
    inscripcionAbierta: true,
    publicarEnPagina: true,
    estado: "EN_CURSO",
    inscritos: 28,
    alDia: 22,
    deben: 5,
    montoDebe: 4320,
    materiaActual: { orden: 2, nombre: "Degradados", docente: "Marco Rojas" },
    materias: [
      { orden: 1, estado: "CERRADA" },
      { orden: 2, estado: "ACTUAL" },
      { orden: 3, estado: "FUTURA" },
    ],
    planesOfrecidos: [PLAN_COMPLETO, PLAN_CUOTAS],
    materiasGrupo: [
      { id: 71, materia: materia(31, 1, "Corte clásico"), docente: { personalId: 9, nombre: "Marco Rojas" }, desde: "2026-08-17", hasta: "2026-09-16", mesLiquidacion: "2026-09", notasCerradasEn: "2026-09-17" },
      { id: 72, materia: materia(32, 2, "Degradados"), docente: { personalId: 9, nombre: "Marco Rojas" }, desde: "2026-09-17", hasta: "2026-10-16", mesLiquidacion: "2026-10", notasCerradasEn: null },
      { id: 73, materia: materia(33, 3, "Barba y color"), docente: null, desde: "2026-10-17", hasta: "2026-11-13", mesLiquidacion: "2026-11", notasCerradasEn: null },
    ],
    resumenCobro: {
      porMateria: [
        { materiaOrden: 1, pagaron: 28, total: 28, pendiente: 0, baseDocente: 8820 },
        { materiaOrden: 2, pagaron: 22, total: 28, pendiente: 6, baseDocente: 6930 },
      ],
    },
    ...extra,
  };
}

export const CAMILA: AlumnoDelGrupo = {
  inscripcionId: 102,
  alumno: { id: 52, codigo: "2026-0102", apellidos: "Bustillos Rek", nombres: "Camila", menor: false },
  estado: "ACTIVA",
  plan: { id: 2, nombre: "Cuotas" },
  descuento: null,
  pagos: [
    { materiaOrden: 1, estado: "PAGADA", detalle: "pagado" },
    { materiaOrden: 2, estado: "VENCIDA", detalle: "vencido hace 12 días" },
    { materiaOrden: 3, estado: "VENCIDA", detalle: "misma cuota" },
  ],
  saldo: 750,
  vencido: true,
  asistenciaPct: 90,
};

export const MATEO: AlumnoDelGrupo = {
  inscripcionId: 101,
  alumno: { id: 51, codigo: "2026-0101", apellidos: "Andrade Villca", nombres: "Mateo", menor: false },
  estado: "ACTIVA",
  plan: { id: 1, nombre: "Completo" },
  descuento: null,
  pagos: [
    { materiaOrden: 1, estado: "PAGADA", detalle: "pagado" },
    { materiaOrden: 2, estado: "PAGADA", detalle: "pagado" },
    { materiaOrden: 3, estado: "PAGADA", detalle: "pagado" },
  ],
  saldo: 0,
  vencido: false,
  asistenciaPct: 96,
};

export function fichaCamila(): AlumnoDetalle {
  return {
    id: 52,
    codigo: "2026-0102",
    apellidos: "Bustillos Rek",
    nombres: "Camila",
    clienteId: 520,
    ci: "8765432",
    ciExpedido: "SC",
    fechaNacimiento: "2004-05-02",
    edad: 22,
    menor: false,
    telefono: "75512340",
    genero: null,
    direccion: null,
    observaciones: null,
    tutores: [],
    inscripciones: [
      {
        id: 102,
        estado: "ACTIVA",
        grupo: { id: 7, nombre: "Barbería · L-V 10:00", carrera: { id: 3, nombre: "Barbería y Peluquería" }, sede: { id: 1, nombre: "Central" } },
        plan: { id: 2, nombre: "Cuotas" },
        precioLista: 1500,
        descuento: null,
        total: 1500,
        cuotas: [
          { id: 901, numero: 1, concepto: "Cuota 1", materiaOrdenes: [1], monto: 750, pagado: 750, saldo: 0, vence: "2026-08-17", estado: "PAGADA", vencida: false, diasAtraso: 0, ultimoRecordatorioEn: null, recordatorios: 0 },
          { id: 902, numero: 2, concepto: "Cuota 2", materiaOrdenes: [2, 3], monto: 750, pagado: 0, saldo: 750, vence: "2026-09-17", estado: "PENDIENTE", vencida: true, diasAtraso: 12, ultimoRecordatorioEn: null, recordatorios: 0 },
        ],
        pagos: [{ ventaId: 300, comprobante: "000300", fecha: "2026-08-17T14:00:00.000Z", sede: { id: 1, nombre: "Central" }, monto: 750, cuotaId: 901 }],
        eventos: [{ accion: "Inscripción", detalle: "plan Cuotas", usuario: "lucia", en: "2026-08-17T14:00:00.000Z" }],
      },
    ],
  };
}

/** La sesión de la secretaría de Central, para los mocks de `useAuth`. */
export const SESION_SECRETARIA = {
  usuario: {
    id: 3,
    username: "lucia",
    nombre: "Lucía",
    rol: "CAJERO",
    sucursalId: 1,
    sucursal: "Central",
    permisos: ["academia.ver", "academia.inscribir", "academia.cobranza", "asistencia.registrar", "asistencia.llegadas", "ventas.vender", "caja.operar"],
    permisosPropios: [] as string[],
  },
  negocio: {
    id: 20,
    nombre: "CCTP Horizonte",
    tipoNegocio: "ACADEMIA",
    features: ["academia", "preinscripcion_online", "pos", "caja"],
  },
  rubro: "ACADEMIA",
  vocabulario: undefined,
};

/** La sesión del dueño (de organización: ve todas las sedes). */
export const SESION_ADMIN = {
  usuario: {
    id: 1,
    username: "hugo",
    nombre: "Hugo Salinas",
    rol: "ADMIN",
    sucursalId: null,
    sucursal: null,
    permisos: [
      "academia.ver",
      "academia.configurar",
      "academia.grupos",
      "academia.inscribir",
      "academia.becas",
      "academia.cobranza",
      "academia.fotos",
      "academia.control",
      "asistencia.registrar",
      "asistencia.llegadas",
      "notas.registrar",
      "notas.reabrir",
      "planilla.ver",
      "planilla.liquidar",
      "reportes.ver",
      "ventas.vender",
      "caja.operar",
    ],
    permisosPropios: [] as string[],
  },
  negocio: {
    id: 20,
    nombre: "CCTP Horizonte",
    tipoNegocio: "ACADEMIA",
    features: ["academia", "asistencia", "notas", "planilla_docente", "preinscripcion_online", "pos", "caja", "reportes"],
  },
  rubro: "ACADEMIA",
  vocabulario: undefined,
};

/** La sesión del docente: todo lo suyo, alcance PROPIO. */
export const SESION_DOCENTE = {
  usuario: {
    id: 9,
    username: "marco",
    nombre: "Marco Rojas",
    rol: "PROFESIONAL",
    sucursalId: 1,
    sucursal: "Central",
    permisos: ["academia.ver", "asistencia.registrar", "notas.registrar", "planilla.ver"],
    permisosPropios: ["academia.ver", "asistencia.registrar", "notas.registrar", "planilla.ver"],
  },
  negocio: SESION_ADMIN.negocio,
  rubro: "ACADEMIA",
  vocabulario: undefined,
};
