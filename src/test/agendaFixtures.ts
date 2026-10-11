import type {
  Cita,
  ClienteFicha,
  Propuesta,
  Recurso,
  RecursoDelDia,
  Servicio,
} from "../lib/agenda/tiposAgenda";

/**
 * Datos de prueba de la agenda, con la forma exacta del contrato (§10.2). Las
 * horas son de un miércoles 21-oct-2026 en La Paz (UTC−4): las 14:00Z son las
 * 10:00 del salón.
 */
export const FECHA = "2026-10-21";

export function cita(extra: Partial<Cita> = {}): Cita {
  return {
    id: 1,
    codigo: "C-0001",
    estado: "RESERVADA",
    origen: "INTERNA",
    sucursalId: 1,
    inicio: "2026-10-21T14:00:00.000Z",
    fin: "2026-10-21T14:45:00.000Z",
    total: 80,
    nota: null,
    cliente: { id: 5, nombre: "Rosa Mamani", telefono: "71234567", noShows: 0, nuevo: false, alergias: null },
    lineas: [
      {
        id: 11,
        servicioId: 100,
        servicio: "Corte dama",
        recursoId: 1,
        recurso: "Carla R.",
        inicio: "2026-10-21T14:00:00.000Z",
        fin: "2026-10-21T14:45:00.000Z",
        sobreTurno: false,
        precio: 80,
      },
    ],
    recursoPreferidoId: null,
    ventaId: null,
    noShowSugerido: false,
    creadaEn: "2026-10-20T15:00:00.000Z",
    ...extra,
  };
}

export function recurso(extra: Partial<Recurso> = {}): Recurso {
  return {
    id: 1,
    tipo: "PROFESIONAL",
    nombre: "Carla R.",
    nombrePublico: null,
    color: "#9B2C6B",
    telefono: null,
    comisionPct: null,
    usuarioId: null,
    usuario: null,
    publicadoOnline: false,
    activo: true,
    orden: 1,
    sucursalIds: [1],
    servicioIds: [100, 101],
    ...extra,
  };
}

export function recursoDelDia(extra: Partial<RecursoDelDia> = {}): RecursoDelDia {
  return { ...recurso(extra), tramos: [{ desde: "09:00", hasta: "13:00" }, { desde: "14:00", hasta: "19:00" }], ...extra };
}

export function servicio(extra: Partial<Servicio> = {}): Servicio {
  return {
    id: 100,
    nombre: "Corte dama",
    categoriaId: null,
    categoria: null,
    precio: 80,
    duracionMin: 45,
    bufferMin: 0,
    reservableOnline: false,
    recursoIds: [1],
    activo: true,
    ...extra,
  };
}

export function ficha(extra: Partial<ClienteFicha> = {}): ClienteFicha {
  return {
    id: 5,
    nombre: "Rosa Mamani",
    telefono: "71234567",
    fechaNacimiento: null,
    alergias: null,
    notas: null,
    noShows: 0,
    bloqueadoOnline: false,
    ultimaVisita: null,
    creadoEn: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

/** Un hueco de una línea a la hora (UTC) dada. */
export function propuesta(inicioUtc: string, recursoId = 1, servicioId = 100): Propuesta {
  const fin = new Date(new Date(inicioUtc).getTime() + 45 * 60000).toISOString();
  return { inicio: inicioUtc, lineas: [{ servicioId, recursoId, inicio: inicioUtc, fin }] };
}
