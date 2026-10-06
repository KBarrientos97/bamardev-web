import type { Tramo, TramoHorario } from "./tiposConfigAgenda";

/**
 * Lógica de los horarios de la agenda, sin React: se prueba sola y la usan la
 * semana tipo, las excepciones y los bloqueos.
 *
 * Todo en hora del negocio (America/La_Paz, UTC−4 fijo: Bolivia no cambia la
 * hora en verano). El navegador puede estar en otra zona —la PC de un dueño
 * que viaja—, así que acá no se usa la hora local del navegador: un bloqueo
 * "de 14:00 a 16:00" es de 14 a 16 en el salón, se cargue desde donde se cargue.
 */

/** Días de la semana del contrato: 1 = lunes … 7 = domingo. */
export const DIAS: { dia: number; nombre: string; corto: string }[] = [
  { dia: 1, nombre: "Lunes", corto: "Lun" },
  { dia: 2, nombre: "Martes", corto: "Mar" },
  { dia: 3, nombre: "Miércoles", corto: "Mié" },
  { dia: 4, nombre: "Jueves", corto: "Jue" },
  { dia: 5, nombre: "Viernes", corto: "Vie" },
  { dia: 6, nombre: "Sábado", corto: "Sáb" },
  { dia: 7, nombre: "Domingo", corto: "Dom" },
];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "09:30" → 570. Una hora mal escrita da NaN, para que ninguna comparación pase. */
export function aMinutos(hora: string): number {
  if (!HORA.test(hora)) return Number.NaN;
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Qué está mal en los tramos de UN día. Vacío = se puede guardar.
 *
 * Los dos errores que importan son los que la base después rechazaría o
 * interpretaría raro: un tramo que termina antes de empezar, y dos tramos del
 * mismo día que se pisan (09:00-13:00 y 12:00-15:00). Que se toquen sí vale:
 * 09:00-13:00 y 13:00-19:00 es un día corrido partido en dos.
 */
export function erroresTramos(tramos: Tramo[]): string[] {
  const errores: string[] = [];
  for (const t of tramos) {
    if (!t.desde || !t.hasta) {
      errores.push("Completá la hora de inicio y la de fin.");
      continue;
    }
    const d = aMinutos(t.desde);
    const h = aMinutos(t.hasta);
    if (Number.isNaN(d) || Number.isNaN(h)) {
      errores.push(`La hora ${Number.isNaN(d) ? t.desde : t.hasta} no es válida.`);
    } else if (h <= d) {
      errores.push(`El tramo ${t.desde} a ${t.hasta} termina antes de empezar: el fin tiene que ser posterior al inicio.`);
    }
  }
  if (errores.length) return errores;

  const ordenados = [...tramos].sort((a, b) => aMinutos(a.desde) - aMinutos(b.desde));
  for (let i = 1; i < ordenados.length; i++) {
    const previo = ordenados[i - 1];
    const actual = ordenados[i];
    if (aMinutos(actual.desde) < aMinutos(previo.hasta)) {
      errores.push(
        `Los tramos ${previo.desde}-${previo.hasta} y ${actual.desde}-${actual.hasta} se pisan.`,
      );
    }
  }
  return errores;
}

/** La semana tipo de una sucursal: día → sus tramos, ordenados. */
export type Semana = Record<number, Tramo[]>;

export function semanaVacia(): Semana {
  return Object.fromEntries(DIAS.map(({ dia }) => [dia, [] as Tramo[]]));
}

const porInicio = (a: Tramo, b: Tramo) => aMinutos(a.desde) - aMinutos(b.desde);

/** Los tramos de una sucursal, armados como semana. */
export function semanaDeSucursal(tramos: TramoHorario[], sucursalId: number): Semana {
  const semana = semanaVacia();
  for (const t of tramos) {
    if (t.sucursalId !== sucursalId || !semana[t.dia]) continue;
    semana[t.dia].push({ desde: t.desde, hasta: t.hasta });
  }
  for (const dia of Object.keys(semana)) semana[Number(dia)].sort(porInicio);
  return semana;
}

/**
 * La lista completa para el PUT, con la semana de UNA sucursal reemplazada.
 *
 * El PUT reemplaza todo el horario del recurso, en todas sus sucursales: si
 * se mandara sólo la semana que se está editando, un estilista que trabaja
 * lunes en el Centro y martes en la Sur perdería el martes al guardar el lunes.
 */
export function reemplazarSucursal(
  todos: TramoHorario[],
  sucursalId: number,
  semana: Semana,
): TramoHorario[] {
  const otras = todos.filter((t) => t.sucursalId !== sucursalId);
  const propias: TramoHorario[] = DIAS.flatMap(({ dia }) =>
    [...(semana[dia] ?? [])].sort(porInicio).map((t) => ({
      sucursalId,
      dia,
      desde: t.desde,
      hasta: t.hasta,
    })),
  );
  return [...otras, ...propias];
}

/** Copia los tramos de un día a otros (pisa lo que esos días tenían). */
export function copiarDia(semana: Semana, origen: number, destinos: number[]): Semana {
  const copia: Semana = { ...semana };
  for (const d of destinos) {
    if (d === origen) continue;
    copia[d] = (semana[origen] ?? []).map((t) => ({ ...t }));
  }
  return copia;
}

/** Resumen corto de un día: "09:00-13:00 · 14:00-19:00", o "No trabaja". */
export function resumenTramos(tramos: Tramo[]): string {
  if (!tramos.length) return "No trabaja";
  return [...tramos]
    .sort(porInicio)
    .map((t) => `${t.desde}-${t.hasta}`)
    .join(" · ");
}

// ── Hora del negocio ────────────────────────────────────────────────────────

const OFFSET_NEGOCIO = "-04:00";
const OFFSET_MS = 4 * 60 * 60 * 1000;

/** "2026-10-21" + "09:00" en La Paz → el instante ISO en UTC que pide la API. */
export function instanteNegocio(fecha: string, hora: string): string {
  return new Date(`${fecha}T${hora}:00${OFFSET_NEGOCIO}`).toISOString();
}

/** Un instante ISO, leído en el reloj del negocio. */
export function partesNegocio(iso: string): { fecha: string; hora: string } {
  const local = new Date(new Date(iso).getTime() - OFFSET_MS);
  const s = local.toISOString();
  return { fecha: s.slice(0, 10), hora: s.slice(11, 16) };
}

/** Hoy en el negocio, `YYYY-MM-DD`. */
export function hoyNegocio(ahora: Date = new Date()): string {
  return partesNegocio(ahora.toISOString()).fecha;
}

/** `YYYY-MM-DD` + n días (sin pasar por la zona del navegador). */
export function sumarDias(fecha: string, n: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "2026-10-21" → "21/10/2026". */
export function fmtFechaNegocio(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  return `${d}/${m}/${a}`;
}

/** Nombre del día de una fecha del negocio: "Martes". */
export function nombreDia(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const js = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  return DIAS[(js + 6) % 7].nombre;
}

/** Un rango de instantes, en palabras del negocio: "21/10/2026 09:00 a 13:00". */
export function fmtRangoNegocio(inicio: string, fin: string): string {
  const a = partesNegocio(inicio);
  const b = partesNegocio(fin);
  if (a.fecha === b.fecha) return `${fmtFechaNegocio(a.fecha)} ${a.hora} a ${b.hora}`;
  return `${fmtFechaNegocio(a.fecha)} ${a.hora} a ${fmtFechaNegocio(b.fecha)} ${b.hora}`;
}
