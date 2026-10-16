import { qs, request } from "../api";
import type {
  AjustesAcademia,
  AlumnoDelGrupo,
  AlumnoDetalle,
  AlumnoFila,
  AlumnoPorCobrar,
  Carrera,
  CarreraInput,
  CarritoInscripcion,
  DescuentoInput,
  Docente,
  EditarAlumnoInput,
  FiltroAlumnos,
  FiltroAlumnosGrupo,
  FiltroCobranza,
  FiltroGrupos,
  GrupoDetalle,
  GrupoInput,
  GrupoResumen,
  HoyAcademia,
  InscripcionDetalle,
  InscripcionInput,
  Materia,
  MateriaGrupoInput,
  MateriaInput,
  Paginado,
  PedidoPagina,
  PlanInput,
  PlanPago,
  Preinscripcion,
  Recordatorio,
  RespuestaCobranza,
  Tutor,
  TutorInput,
} from "./tipos";

/**
 * Cliente de la vertical Educación (ronda 1). Pasa por el mismo `request` que
 * el resto de la app (401, licencia, reporte de 5xx); acá sólo se arman las
 * rutas y los cuerpos. Toda la regla —cupos, calendario de cuotas, cercos de
 * sede, topes de beca— vive en el backend: estas funciones piden, no calculan.
 */

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

export const apiAcademia = {
  // ── Ajustes ────────────────────────────────────────────────────────────────
  ajustes: () => request<AjustesAcademia>("/academia/ajustes"),
  guardarAjustes: (cambios: Partial<AjustesAcademia>) =>
    request<AjustesAcademia>("/academia/ajustes", { method: "PATCH", body: json(cambios) }),

  // ── Carreras, materias y planes ────────────────────────────────────────────
  carreras: (incluirInactivas = false) =>
    request<Carrera[]>(`/academia/carreras${qs({ incluirInactivas: incluirInactivas || undefined })}`),
  carrera: (id: number) => request<Carrera>(`/academia/carreras/${id}`),
  crearCarrera: (input: CarreraInput) =>
    request<Carrera>("/academia/carreras", { method: "POST", body: json(input) }),
  editarCarrera: (id: number, cambios: Partial<CarreraInput> & { activa?: boolean }) =>
    request<Carrera>(`/academia/carreras/${id}`, { method: "PATCH", body: json(cambios) }),
  crearMateria: (carreraId: number, input: MateriaInput) =>
    request<Materia>(`/academia/carreras/${carreraId}/materias`, { method: "POST", body: json(input) }),
  editarMateria: (id: number, cambios: Partial<MateriaInput> & { activa?: boolean }) =>
    request<Materia>(`/academia/materias/${id}`, { method: "PATCH", body: json(cambios) }),
  /** Todos los ids de materia de la carrera, en el orden nuevo. */
  ordenarMaterias: (carreraId: number, ids: number[]) =>
    request<Materia[] | void>(`/academia/carreras/${carreraId}/materias/orden`, {
      method: "PUT",
      body: json({ ids }),
    }),
  crearPlan: (carreraId: number, input: PlanInput) =>
    request<PlanPago>(`/academia/carreras/${carreraId}/planes`, { method: "POST", body: json(input) }),
  editarPlan: (id: number, cambios: Partial<PlanInput> & { activo?: boolean; orden?: number }) =>
    request<PlanPago>(`/academia/planes/${id}`, { method: "PATCH", body: json(cambios) }),

  // ── Grupos ─────────────────────────────────────────────────────────────────
  grupos: (f: FiltroGrupos = {}) => request<Paginado<GrupoResumen>>(`/academia/grupos${qs(f)}`),
  grupo: (id: number) => request<GrupoDetalle>(`/academia/grupos/${id}`),
  alumnosDelGrupo: (id: number, filtro: FiltroAlumnosGrupo = "todos", p: PedidoPagina = {}) =>
    request<Paginado<AlumnoDelGrupo>>(`/academia/grupos/${id}/alumnos${qs({ filtro, ...p })}`),
  crearGrupo: (input: GrupoInput) =>
    request<GrupoDetalle>("/academia/grupos", { method: "POST", body: json(input) }),
  editarGrupo: (id: number, cambios: Partial<GrupoInput>) =>
    request<GrupoDetalle>(`/academia/grupos/${id}`, { method: "PATCH", body: json(cambios) }),
  editarMateriaDelGrupo: (grupoId: number, materiaId: number, cambios: Omit<MateriaGrupoInput, "materiaId">) =>
    request<GrupoDetalle>(`/academia/grupos/${grupoId}/materias/${materiaId}`, {
      method: "PATCH",
      body: json(cambios),
    }),
  docentes: () => request<Docente[]>("/academia/docentes"),

  // ── Alumnos ────────────────────────────────────────────────────────────────
  alumnos: (f: FiltroAlumnos = {}) => request<Paginado<AlumnoFila>>(`/academia/alumnos${qs(f)}`),
  alumno: (id: number) => request<AlumnoDetalle>(`/academia/alumnos/${id}`),
  editarAlumno: (id: number, cambios: EditarAlumnoInput) =>
    request<AlumnoDetalle>(`/academia/alumnos/${id}`, { method: "PATCH", body: json(cambios) }),
  agregarTutor: (id: number, input: TutorInput) =>
    request<Tutor>(`/academia/alumnos/${id}/tutores`, { method: "POST", body: json(input) }),
  quitarTutor: (id: number, tutorId: number) =>
    request<void>(`/academia/alumnos/${id}/tutores/${tutorId}`, { method: "DELETE" }),

  // ── Inscripciones ──────────────────────────────────────────────────────────
  inscribir: (input: InscripcionInput) =>
    request<InscripcionDetalle>("/academia/inscripciones", { method: "POST", body: json(input) }),
  /** La bandeja: por defecto lo que espera respuesta; también las descartadas. */
  preinscripciones: (f: { sede?: number | null; estado?: "PREINSCRITA" | "DESCARTADA" } & PedidoPagina = {}) =>
    request<Paginado<Preinscripcion>>(`/academia/inscripciones${qs({ estado: "PREINSCRITA", ...f })}`),
  convertir: (
    id: number,
    input: {
      planPagoId: number;
      descuento?: DescuentoInput;
      tutor?: { nombre: string; telefono: string; parentesco: string; ci?: string };
      confirmarSobreCupo?: boolean;
    },
  ) =>
    request<InscripcionDetalle>(`/academia/inscripciones/${id}/convertir`, { method: "POST", body: json(input) }),
  descartar: (id: number, motivo: string) =>
    request<void>(`/academia/inscripciones/${id}/descartar`, { method: "POST", body: json({ motivo }) }),
  retirar: (id: number, motivo: string) =>
    request<InscripcionDetalle | void>(`/academia/inscripciones/${id}/retirar`, {
      method: "POST",
      body: json({ motivo }),
    }),
  cambiarGrupo: (id: number, grupoId: number, confirmarSobreCupo = false) =>
    request<InscripcionDetalle | void>(`/academia/inscripciones/${id}/cambiar-grupo`, {
      method: "POST",
      body: json(confirmarSobreCupo ? { grupoId, confirmarSobreCupo } : { grupoId }),
    }),
  cambiarPlan: (id: number, planPagoId: number) =>
    request<InscripcionDetalle | void>(`/academia/inscripciones/${id}/cambiar-plan`, {
      method: "POST",
      body: json({ planPagoId }),
    }),
  carrito: (inscripcionId: number) =>
    request<CarritoInscripcion>(`/academia/inscripciones/${inscripcionId}/carrito`),
  cuotasPorCobrar: (q: string, sede?: number | null) =>
    request<{ alumnos: AlumnoPorCobrar[] }>(`/academia/cuotas-por-cobrar${qs({ q: q.trim(), sede })}`),

  // ── Cobranza ───────────────────────────────────────────────────────────────
  cobranza: (f: FiltroCobranza) => request<RespuestaCobranza>(`/academia/cobranza${qs(f)}`),
  /** Registra el recordatorio y devuelve el `wa.me` armado. */
  recordatorio: (cuotaId: number) =>
    request<Recordatorio>(`/academia/cuotas/${cuotaId}/recordatorio`, { method: "POST" }),

  // ── Hoy ────────────────────────────────────────────────────────────────────
  hoy: (sede?: number | null) => request<HoyAcademia>(`/academia/hoy${qs({ sede })}`),
};

/**
 * Los códigos con que el backend explica un rechazo de la ronda 1, para
 * reaccionar a cada uno (pedir el PIN, confirmar el sobrecupo…).
 */
export const CODIGOS_ACADEMIA = {
  TUTOR_REQUERIDO: "TUTOR_REQUERIDO",
  GRUPO_LLENO: "GRUPO_LLENO",
  DESCUENTO_REQUIERE_AUTORIZACION: "DESCUENTO_REQUIERE_AUTORIZACION",
  YA_INSCRIPTO: "YA_INSCRIPTO",
  PLAN_INVALIDO: "PLAN_INVALIDO",
  CI_DUPLICADO: "CI_DUPLICADO",
  TELEFONO_DUPLICADO: "TELEFONO_DUPLICADO",
  GRUPO_CANCELADO: "GRUPO_CANCELADO",
  CAMBIO_DE_SEDE: "CAMBIO_DE_SEDE",
  SIN_TELEFONO: "SIN_TELEFONO",
  CUOTA_SALDO: "CUOTA_SALDO",
  CUOTA_NO_EXISTE: "CUOTA_NO_EXISTE",
  CUOTA_CON_FIADO: "CUOTA_CON_FIADO",
  CUOTA_CON_DESCUENTO: "CUOTA_CON_DESCUENTO",
} as const;
