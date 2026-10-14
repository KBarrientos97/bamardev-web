import { isoDia } from "../../lib/format";
import { fechaDeJornada, horaDeCorte } from "../../lib/jornada";
import { MAX_DIAS_REPORTE } from "../../lib/topeReportes";

/**
 * El período de Reportes y contra qué se compara cada flecha.
 *
 * Los días van como `yyyy-MM-dd` y los dos extremos cuentan (del 2 al 8 son
 * siete días): `rangoParaApi` los convierte a medianoche local al viajar.
 *
 * La comparación la decide la pantalla y no el backend, porque una flecha que
 * no dice contra qué compara no se puede leer: "Este mes" (del 1 al 12) contra
 * los doce días que vinieron justo antes (del 19 al 30 del mes pasado) mezcla
 * un fin de mes con un principio, y el dueño compara su mes contra el mismo
 * tramo del mes pasado. Por eso cada preset trae su comparación y su nombre
 * ("la semana anterior", "agosto", "1–12 de septiembre").
 */

export type Preset = "hoy" | "ayer" | "semana" | "mes" | "mesPasado" | "dias30" | "dias90" | "rango";

// El tope de 3 meses (ver `lib/topeReportes`): por él ya no hay "Año", lo
// reemplaza "3 meses". Se re-exporta para que la pantalla lo tome de acá.
export { excedeTope, MAX_DIAS_REPORTE, MENSAJE_TOPE } from "../../lib/topeReportes";

export interface Periodo {
  preset: Preset;
  desde: string;
  hasta: string;
}

export interface Comparacion {
  desde: string;
  hasta: string;
  /** Va después de "comparadas con": "la semana anterior", "agosto". */
  contra: string;
  /** La leyenda de la línea punteada del gráfico. */
  leyenda: string;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** El día del texto, en hora local: `new Date("2026-10-02")` es medianoche UTC y en Bolivia cae el 1. */
export function aDia(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d);
}

function sumarDias(d: Date, dias: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias);
}

/** Días del período, contando los dos extremos. En UTC para que un cambio de hora no corra un día. */
export function diasDe(desde: string, hasta: string): number {
  const a = aDia(desde);
  const b = aDia(hasta);
  const ms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/**
 * El día de `hoy` a medianoche. Con `corteMin` (un billar), el de la jornada
 * que corre: a la 1:30 a. m. del 14 con corte a las 6, el 13 — la noche en
 * curso, que es lo que el dueño quiere ver en "Hoy" (`lib/jornada.ts`). Con
 * corte 0, el día del calendario.
 */
function soloHoy(hoy: Date, corteMin = 0): Date {
  return aDia(fechaDeJornada(hoy, corteMin));
}

/** El período de un preset, al día (o la jornada, con `corteMin`) de `hoy`. */
export function periodoDe(preset: Exclude<Preset, "rango">, hoy = new Date(), corteMin = 0): Periodo {
  const h = soloHoy(hoy, corteMin);
  const y = h.getFullYear();
  const m = h.getMonth();
  switch (preset) {
    case "hoy":
      return { preset, desde: isoDia(h), hasta: isoDia(h) };
    case "ayer": {
      const a = sumarDias(h, -1);
      return { preset, desde: isoDia(a), hasta: isoDia(a) };
    }
    case "semana":
      return { preset, desde: isoDia(sumarDias(h, -6)), hasta: isoDia(h) };
    case "dias30":
      return { preset, desde: isoDia(sumarDias(h, -29)), hasta: isoDia(h) };
    // Noventa días que terminan hoy: el más largo de los presets, dentro del tope.
    case "dias90":
      return { preset, desde: isoDia(sumarDias(h, -89)), hasta: isoDia(h) };
    case "mes":
      return { preset, desde: isoDia(new Date(y, m, 1)), hasta: isoDia(h) };
    case "mesPasado":
      // El día 0 del mes en curso es el último del anterior.
      return { preset, desde: isoDia(new Date(y, m - 1, 1)), hasta: isoDia(new Date(y, m, 0)) };
  }
}

/** Un rango elegido a mano. Si vienen al revés se acomodan: un "del 10 al 3" es del 3 al 10. */
export function rangoElegido(desde: string, hasta: string): Periodo {
  return desde <= hasta ? { preset: "rango", desde, hasta } : { preset: "rango", desde: hasta, hasta: desde };
}

function nombreMes(d: Date): string {
  return MESES[d.getMonth()];
}

/** "02/10", y con el año si se pide. */
function diaMes(d: Date, conAnio = false): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return conAnio ? `${dd}/${mm}/${d.getFullYear()}` : `${dd}/${mm}`;
}

/** "02/10 – 08/10/2026"; un solo día, "08/10/2026"; si cruza el año, los dos años. */
export function textoRango(desde: string, hasta: string): string {
  const a = aDia(desde);
  const b = aDia(hasta);
  if (desde === hasta) return diaMes(b, true);
  return `${diaMes(a, a.getFullYear() !== b.getFullYear())} – ${diaMes(b, true)}`;
}

/** Contra qué se compara el período. */
export function comparacionDe(p: Periodo): Comparacion {
  const desde = aDia(p.desde);
  const hasta = aDia(p.hasta);
  switch (p.preset) {
    case "hoy":
    case "ayer": {
      const d = sumarDias(desde, -1);
      return {
        desde: isoDia(d),
        hasta: isoDia(d),
        contra: p.preset === "hoy" ? "ayer" : "el día anterior",
        leyenda: p.preset === "hoy" ? "Ayer" : "Día anterior",
      };
    }
    case "semana":
    case "dias30":
    case "dias90": {
      const dias = diasDe(p.desde, p.hasta);
      const [contra, leyenda] =
        p.preset === "semana"
          ? ["la semana anterior", "Semana anterior"]
          : p.preset === "dias30"
            ? ["los 30 días anteriores", "30 días anteriores"]
            : ["los 3 meses anteriores", "3 meses anteriores"];
      return { desde: isoDia(sumarDias(desde, -dias)), hasta: isoDia(sumarDias(desde, -1)), contra, leyenda };
    }
    case "mes": {
      // El mismo tramo del mes anterior: del 1 al 12 contra del 1 al 12. Si el
      // mes anterior es más corto (31 de marzo → febrero), hasta su último día.
      const inicio = new Date(desde.getFullYear(), desde.getMonth() - 1, 1);
      const ultimo = new Date(desde.getFullYear(), desde.getMonth(), 0).getDate();
      const fin = new Date(inicio.getFullYear(), inicio.getMonth(), Math.min(hasta.getDate(), ultimo));
      const tramo = fin.getDate() === 1 ? `el 1 de ${nombreMes(inicio)}` : `1–${fin.getDate()} de ${nombreMes(inicio)}`;
      return { desde: isoDia(inicio), hasta: isoDia(fin), contra: tramo, leyenda: capital(tramo.replace(/^el /, "")) };
    }
    case "mesPasado": {
      const inicio = new Date(desde.getFullYear(), desde.getMonth() - 1, 1);
      const fin = new Date(desde.getFullYear(), desde.getMonth(), 0);
      return { desde: isoDia(inicio), hasta: isoDia(fin), contra: nombreMes(inicio), leyenda: capital(nombreMes(inicio)) };
    }
    case "rango": {
      const dias = diasDe(p.desde, p.hasta);
      const d = sumarDias(desde, -dias);
      const h = sumarDias(desde, -1);
      return {
        desde: isoDia(d),
        hasta: isoDia(h),
        contra: dias === 1 ? `el ${diaMes(h, true)}` : `del ${diaMes(d)} al ${diaMes(h, true)}`,
        leyenda: "Período anterior",
      };
    }
  }
}

function capital(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "en la semana", "de hoy", "en septiembre": lo que va después de "Ventas". */
export function enElPeriodo(p: Periodo): string {
  switch (p.preset) {
    case "hoy":
      return "de hoy";
    case "ayer":
      return "de ayer";
    case "semana":
      return "en la semana";
    case "dias30":
      return "en los últimos 30 días";
    case "mes":
      return `en ${nombreMes(aDia(p.desde))}`;
    case "mesPasado":
      return `en ${nombreMes(aDia(p.desde))}`;
    case "dias90":
      return "en los últimos 3 meses";
    case "rango":
      return "en el período";
  }
}

/** La leyenda de la línea llena del gráfico: "Esta semana", "Septiembre". */
export function leyendaDe(p: Periodo): string {
  switch (p.preset) {
    case "hoy":
      return "Hoy";
    case "ayer":
      return "Ayer";
    case "semana":
      return "Esta semana";
    case "dias30":
      return "Últimos 30 días";
    case "mes":
      return "Este mes";
    case "mesPasado":
      return capital(nombreMes(aDia(p.desde)));
    case "dias90":
      return "Últimos 3 meses";
    case "rango":
      return "Este período";
  }
}

/** El nombre del chip: lo que se muestra cuando el período no es uno de los de arriba. */
export const NOMBRE_PRESET: Record<Preset, string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  semana: "Semana",
  mes: "Mes",
  mesPasado: "Mes pasado",
  dias30: "Últimos 30 días",
  dias90: "3 meses",
  rango: "Personalizado",
};

/**
 * ¿Es el mes que corre, todavía sin terminar? Ahí el estado de resultado
 * compara días de ventas contra un mes entero de gastos fijos, y lo que sirve
 * es cuánto falta vender, no la pérdida a mitad de camino.
 */
export function esMesEnCurso(p: Periodo, hoy = new Date(), corteMin = 0): boolean {
  const h = soloHoy(hoy, corteMin);
  return p.preset === "mes" && p.hasta === isoDia(h) && p.desde === isoDia(new Date(h.getFullYear(), h.getMonth(), 1));
}

/** Los días del mes del período (para "Día 12 de 31"). */
export function diasDelMes(p: Periodo): number {
  const d = aDia(p.desde);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** "Del 1 al 12 de octubre", "El 8 de octubre", "Del 28 de septiembre al 4 de octubre". */
export function prosaRango(desde: string, hasta: string): string {
  const a = aDia(desde);
  const b = aDia(hasta);
  const anio = (d: Date) => (a.getFullYear() !== b.getFullYear() ? ` de ${d.getFullYear()}` : "");
  if (desde === hasta) return `El ${b.getDate()} de ${nombreMes(b)}`;
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `Del ${a.getDate()} al ${b.getDate()} de ${nombreMes(b)}`;
  return `Del ${a.getDate()} de ${nombreMes(a)}${anio(a)} al ${b.getDate()} de ${nombreMes(b)}${anio(b)}`;
}

/** El mes del período por su nombre ("octubre"), para "los gastos de octubre". */
export function mesDe(p: Periodo): string {
  return nombreMes(aDia(p.desde));
}

/** Cada día del período, en orden: las fechas del eje del gráfico. */
export function diasDelPeriodo(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let d = aDia(desde);
  const fin = aDia(hasta);
  // El tope de los reportes: aun si llegara un rango más largo (uno guardado
  // de antes), no arma más puntos que los del período más largo permitido.
  for (let i = 0; d <= fin && i < MAX_DIAS_REPORTE; i++) {
    out.push(isoDia(d));
    d = sumarDias(d, 1);
  }
  return out;
}

/**
 * Qué instantes mira un período de jornadas, para ponerlo al lado del rango:
 * "13/10 6:00 a. m. → ahora", "01/09 6:00 a. m. → 01/10 6:00 a. m.". Sin eso
 * el dueño de un billar lee "13/10" y no sabe si la 1 a. m. está adentro.
 * Null con corte 0: el día del calendario no necesita explicación.
 */
export function textoJornada(p: Pick<Periodo, "desde" | "hasta">, corteMin: number, ahora = new Date()): string | null {
  if (!(corteMin > 0)) return null;
  const hora = horaDeCorte(corteMin);
  const inicio = aDia(p.desde);
  const fin = sumarDias(aDia(p.hasta), 1);
  // Si el período llega a la jornada que corre, termina "ahora": el corte de
  // mañana todavía no pasó y poner esa hora parece un dato del futuro.
  if (p.hasta >= fechaDeJornada(ahora, corteMin)) return `${diaMes(inicio)} ${hora} → ahora`;
  const conAnio = inicio.getFullYear() !== fin.getFullYear();
  return `${diaMes(inicio, conAnio)} ${hora} → ${diaMes(fin, conAnio)} ${hora}`;
}
