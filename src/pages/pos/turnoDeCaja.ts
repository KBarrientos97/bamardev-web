import { duracionTexto, minutosEntre } from "../../lib/agenda/horaAgenda";
import { fmtHora, isoDia } from "../../lib/format";

/**
 * Cuándo abrió y cuándo cerró un turno de caja, con fecha en las dos puntas.
 *
 * El comprobante del cierre decía "Turno de 12:04 a 03:17": el turno de una
 * pollería abre al mediodía y cierra de madrugada, y sin fecha se lee como si
 * hubiera ido para atrás (el error que la app corrigió el 1-sep, memoria
 * `turno_fecha_hora_cierre`). Las fechas son las del SERVIDOR (las de la caja
 * que devuelve el cierre), nunca la hora de este equipo.
 *
 * Como en la app: si abre y cierra el mismo día la fecha va una sola vez, y
 * sólo cuando cruza la medianoche va en las dos puntas, con el aviso. Las
 * horas, con `fmtHora`, como el resto de la caja.
 */
export interface TurnoDeCaja {
  /** "Turno del 28/10 12:04 p. m. al 29/10 03:17 a. m." o "Turno del 28/10, de 12:04 p. m. a 06:30 p. m.". */
  resumen: string;
  /** "mié 28/10 · 12:04 p. m.". */
  abrio: string;
  /** "jue 29/10 · 03:17 a. m.". */
  cerro: string;
  /** "15 h 13". */
  duracion: string;
  /** El aviso de que el turno no es de un solo día; null si abrió y cerró el mismo. */
  avisoDias: string | null;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const dos = (n: number) => String(n).padStart(2, "0");

/** "28/10", en la hora de este equipo (la del local), como `fmtHora`. */
function diaMes(d: Date): string {
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}`;
}

/** Días de calendario entre dos fechas locales (no 24 h: 23:50 → 00:10 es un día). */
function diasEntre(desde: Date, hasta: Date): number {
  const a = new Date(`${isoDia(desde)}T00:00:00`);
  const b = new Date(`${isoDia(hasta)}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** null si falta alguna de las dos fechas o no se puede leer. */
export function turnoDeCaja(
  apertura: string | null | undefined,
  cierre: string | null | undefined,
): TurnoDeCaja | null {
  if (!apertura || !cierre) return null;
  const a = new Date(apertura);
  const c = new Date(cierre);
  if (Number.isNaN(a.getTime()) || Number.isNaN(c.getTime())) return null;

  const dias = diasEntre(a, c);
  const resumen =
    dias === 0
      ? `Turno del ${diaMes(c)}, de ${fmtHora(a)} a ${fmtHora(c)}`
      : `Turno del ${diaMes(a)} ${fmtHora(a)} al ${diaMes(c)} ${fmtHora(c)}`;
  // Más de una medianoche es una caja que nadie cerró: el turno de un día se
  // mezcló con el de otro, y eso es lo primero que tiene que saltar a la vista.
  const avisoDias =
    dias <= 0
      ? null
      : dias === 1
        ? "Este turno cruzó la medianoche: abrió un día y cerró al siguiente."
        : `Esta caja estuvo abierta ${dias + 1} días: abrió el ${diaMes(a)} y cerró el ${diaMes(c)}.`;

  return {
    resumen,
    abrio: `${DIAS[a.getDay()]} ${diaMes(a)} · ${fmtHora(a)}`,
    cerro: `${DIAS[c.getDay()]} ${diaMes(c)} · ${fmtHora(c)}`,
    duracion: duracionTexto(minutosEntre(apertura, cierre)),
    avisoDias,
  };
}
