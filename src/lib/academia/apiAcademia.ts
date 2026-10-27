import { ApiError, qs, request, tokenStore } from "../api";
import { CAMPO_FOTO, formularioConFotos, hayFotos, nombreArchivo } from "./fotos";
import type {
  AjustesAcademia,
  AlumnoDelGrupo,
  AlumnoDetalle,
  AlumnoFila,
  AlumnoPorCobrar,
  Calendario,
  Carrera,
  CarreraInput,
  CarreraSimpleInput,
  CarritoInscripcion,
  DescuentoInput,
  Docente,
  EditarAlumnoInput,
  EstadoAsistencia,
  FiltroAlumnos,
  FiltroAlumnosGrupo,
  FiltroCobranza,
  FiltroGrupos,
  FotosInscripcion,
  GrupoDetalle,
  GrupoInput,
  GrupoResumen,
  HoyAcademia,
  InscripcionDetalle,
  InscripcionInput,
  ListaDeClase,
  Materia,
  MateriaGrupoInput,
  MateriaInput,
  MetodoPagoPlanilla,
  MisClases,
  MotivoNoPago,
  NotasDelGrupo,
  Paginado,
  PanelControl,
  PedidoPagina,
  PlanillaDocente,
  PlanillaMes,
  PlanInput,
  PlanPago,
  Preinscripcion,
  Recordatorio,
  ReportesAcademia,
  RespuestaCobranza,
  TipoFoto,
  Tutor,
  TutorInput,
} from "./tipos";

/**
 * Cliente de la vertical Educación (rondas 1 y 2). Pasa por el mismo
 * `request` que el resto de la app (401, licencia, reporte de 5xx); acá sólo
 * se arman las rutas y los cuerpos. Toda la regla —cupos, calendario de
 * cuotas, cercos de sede, topes de beca, lo que cobra el docente— vive en el
 * backend: estas funciones piden, no calculan.
 */

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

const BASE_API = import.meta.env.VITE_API_URL || "/api";

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
  /** Modo simple (D4): el servidor arma los planes "Mes a mes" y "Pago completo". */
  crearCarreraSimple: (input: CarreraSimpleInput) =>
    request<Carrera>("/academia/carreras/simple", { method: "POST", body: json(input) }),
  editarCarreraSimple: (id: number, input: CarreraSimpleInput) =>
    request<Carrera>(`/academia/carreras/${id}/simple`, { method: "PUT", body: json(input) }),

  // ── Calendario (N1) ────────────────────────────────────────────────────────
  calendario: (f: { sede?: number | null; desde?: string; meses?: number } = {}) =>
    request<Calendario>(`/academia/calendario${qs(f)}`),

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

  // ── Fotos (D7) ─────────────────────────────────────────────────────────────
  /** Reemplaza una foto y le quita la marca de revisada. */
  subirFoto: (alumnoId: number, tipo: TipoFoto, archivo: Blob) => {
    const f = new FormData();
    f.append("archivo", archivo, nombreArchivo(CAMPO_FOTO[tipo], archivo));
    return request<unknown>(`/academia/alumnos/${alumnoId}/fotos/${tipo}`, { method: "PUT", body: f });
  },
  /**
   * La foto como URL de objeto para un `<img>`: es dato sensible, sin ruta
   * pública, y se baja con la sesión. Quien la pide la libera al desmontar.
   */
  async fotoComoUrl(alumnoId: number, tipo: TipoFoto): Promise<string> {
    const token = tokenStore.get();
    const res = await fetch(`${BASE_API}/academia/alumnos/${alumnoId}/fotos/${tipo}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError("No se pudo cargar la foto", res.status);
    return URL.createObjectURL(await res.blob());
  },
  /** Con `ok: false` y `tipos`, la observación va sólo a esas fotos (contrato #33); sin `tipos`, a todas. */
  revisarFotos: (alumnoId: number, input: { ok: boolean; observacion?: string; tipos?: TipoFoto[] }) =>
    request<unknown>(`/academia/alumnos/${alumnoId}/fotos/revisar`, { method: "POST", body: json(input) }),

  // ── Inscripciones ──────────────────────────────────────────────────────────
  /** Con fotos va en multipart (`datos` + `foto`, `ciAnverso`, `ciReverso`). */
  inscribir: (input: InscripcionInput, fotos?: FotosInscripcion) =>
    request<InscripcionDetalle>("/academia/inscripciones", {
      method: "POST",
      body: hayFotos(fotos) ? formularioConFotos(input, fotos) : json(input),
    }),
  enlacePago: (inscripcionId: number) =>
    request<{ enlacePago: string }>(`/academia/inscripciones/${inscripcionId}/enlace-pago`),
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
      /** D3: convertir aunque falten las fotos obligatorias. */
      fotosPendientes?: boolean;
    },
    fotos?: FotosInscripcion,
  ) =>
    request<InscripcionDetalle>(`/academia/inscripciones/${id}/convertir`, {
      method: "POST",
      body: hayFotos(fotos) ? formularioConFotos(input, fotos) : json(input),
    }),
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

  // ── Asistencia (F1b) ───────────────────────────────────────────────────────
  misClases: (fecha?: string) => request<MisClases>(`/academia/mis-clases${qs({ fecha })}`),
  lista: (grupoId: number, fecha?: string) => request<ListaDeClase>(`/academia/grupos/${grupoId}/lista${qs({ fecha })}`),
  guardarLista: (grupoId: number, fecha: string, items: { inscripcionId: number; estado: EstadoAsistencia }[]) =>
    request<ListaDeClase | void>(`/academia/grupos/${grupoId}/lista`, { method: "PUT", body: json({ fecha, items }) }),
  /** La hora la pone el servidor: el atraso no se puede dibujar desde el celular. */
  llegada: (sesionId: number) => request<unknown>(`/academia/sesiones/${sesionId}/llegada`, { method: "POST" }),

  // ── Notas (F1b) ────────────────────────────────────────────────────────────
  notas: (grupoId: number, materiaId?: number) =>
    request<NotasDelGrupo>(`/academia/grupos/${grupoId}/notas${qs({ materiaId })}`),
  guardarNotas: (grupoId: number, materiaId: number, items: { inscripcionId: number; nota: number | null }[]) =>
    request<NotasDelGrupo | void>(`/academia/grupos/${grupoId}/notas`, { method: "PUT", body: json({ materiaId, items }) }),
  cerrarNotas: (grupoId: number, materiaId: number) =>
    request<unknown>(`/academia/grupos/${grupoId}/notas/cerrar`, { method: "POST", body: json({ materiaId }) }),
  reabrirNotas: (grupoId: number, materiaId: number, motivo: string) =>
    request<unknown>(`/academia/grupos/${grupoId}/notas/reabrir`, { method: "POST", body: json({ materiaId, motivo }) }),

  // ── Planilla del docente (F1b) ─────────────────────────────────────────────
  planilla: (mes: string, sede?: number | null) => request<PlanillaMes>(`/academia/planilla${qs({ mes, sede })}`),
  planillaDocente: (personalId: number, mes: string) =>
    request<PlanillaDocente>(`/academia/planilla/${personalId}${qs({ mes })}`),
  cerrarPlanilla: (personalId: number, mes: string, forzar = false) =>
    request<unknown>(`/academia/planilla/${personalId}/cerrar`, {
      method: "POST",
      body: json(forzar ? { mes, forzar } : { mes }),
    }),
  /** A6: el motivo por el que una línea no le suma al docente (pide `planilla.liquidar`). */
  guardarMotivoNoPago: (input: { inscripcionId: number; materiaId: number; motivo: MotivoNoPago; detalle?: string }) =>
    request<unknown>("/academia/planilla/motivos", { method: "PUT", body: json(input) }),
  quitarMotivoNoPago: (inscripcionId: number, materiaId: number) =>
    request<unknown>(`/academia/planilla/motivos/${inscripcionId}/${materiaId}`, { method: "DELETE" }),
  /** `metodoPago`: EFECTIVO (por defecto en el backend), TRANSFERENCIA, QR o TARJETA. */
  pagarPlanilla: (personalId: number, mes: string, metodoPago?: MetodoPagoPlanilla) =>
    request<unknown>(`/academia/planilla/${personalId}/pagar`, {
      method: "POST",
      body: json(metodoPago ? { mes, metodoPago } : { mes }),
    }),

  // ── Control y reportes ─────────────────────────────────────────────────────
  control: (mes: string, sede?: number | null) => request<PanelControl>(`/academia/control${qs({ mes, sede })}`),
  reportes: (mes: string, sede?: number | null) => request<ReportesAcademia>(`/academia/reportes${qs({ mes, sede })}`),
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
  // ── Ronda 2 ──
  FOTOS_REQUERIDAS: "FOTOS_REQUERIDAS",
  SIN_CLASE: "SIN_CLASE",
  LISTA_CERRADA: "LISTA_CERRADA",
  NOTA_INVALIDA: "NOTA_INVALIDA",
  NOTAS_CERRADAS: "NOTAS_CERRADAS",
  NOTAS_INCOMPLETAS: "NOTAS_INCOMPLETAS",
  PLANILLA_CERRADA: "PLANILLA_CERRADA",
  MES_EN_CURSO: "MES_EN_CURSO",
  // ── QA de la ronda 2 ──
  FECHA_PASADA: "FECHA_PASADA",
  OTRA_SEDE: "OTRA_SEDE",
  // ── Auditoría de octubre ──
  /** 409: entró o se anuló un pago mientras se cambiaba el plan o se retiraba (reintentable). */
  CUOTAS_CAMBIARON: "CUOTAS_CAMBIARON",
  /** 403: la lista de esa clase la pasa quien la dicta. */
  CLASE_DE_OTRO_DOCENTE: "CLASE_DE_OTRO_DOCENTE",
  /** 409: un grupo con estudiantes inscritos no se cancela. */
  GRUPO_CON_INSCRITOS: "GRUPO_CON_INSCRITOS",
  /** 409: el inicio del grupo ya no se mueve (hay clases dictadas o módulos liquidados). */
  INICIO_NO_MOVIBLE: "INICIO_NO_MOVIBLE",
  /** 400: la cuota ya no tiene saldo, no se manda recordatorio. */
  CUOTA_SIN_SALDO: "CUOTA_SIN_SALDO",
} as const;
