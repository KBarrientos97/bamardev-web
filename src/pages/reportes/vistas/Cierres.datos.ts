import { aCentavos, esCero } from "../../../lib/dinero";
import { fmtFecha, fmtFechaHora } from "../../../lib/format";
import type { HojaNueva } from "../../../lib/planilla";
import type { CierreApi } from "../api";
import { hoja } from "../contexto";

/**
 * Las cuentas de Cierres de caja (y de Ventas por cajero, que suma las mismas
 * diferencias), aparte de la pantalla para poder probarlas.
 */

export type Turno = "Mañana" | "Tarde" | "Noche";

const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * El instante de una fecha del backend. Un día pelado ("2026-10-08") no tiene
 * hora: `new Date` lo leería como medianoche UTC —en Bolivia, las 20:00 del
 * día anterior— y saldría un turno "Noche" del día equivocado.
 */
function instante(iso: string | null | undefined): Date | null {
  if (!iso || SOLO_DIA.test(iso)) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * El turno por la hora LOCAL en que se abrió la caja: mañana de 6 a 12, tarde
 * de 12 a 18, noche el resto. El backend no lo manda; sin él, dos cierres del
 * mismo día de dos cajeros se distinguían sólo por el nombre.
 */
export function turnoDe(fechaApertura: string | null | undefined): Turno | null {
  const d = instante(fechaApertura);
  if (!d) return null;
  const h = d.getHours();
  if (h >= 6 && h < 12) return "Mañana";
  if (h >= 12 && h < 18) return "Tarde";
  return "Noche";
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/**
 * "Jue 08/10/2026": el día en que se ABRIÓ el turno. Uno que abre a las 20:00
 * y cierra a las 3 es la noche del jueves, no el viernes; con la fecha del
 * cierre se leía como de otra jornada. Sin hora, lo que mande el backend.
 *
 * `conAnio` en false da "Jue 08/10": en un celular el título entero no entra
 * y lo que se cortaba era justo el turno.
 */
export function diaDelTurno(c: Pick<CierreApi, "fecha" | "fechaApertura" | "fechaCierre">, conAnio = true): string {
  const d = instante(c.fechaApertura) ?? instante(c.fechaCierre);
  if (!d) return c.fecha;
  const fecha = fmtFecha(d);
  return `${DIAS[d.getDay()]} ${conAnio ? fecha : fecha.slice(0, 5)}`;
}

/** "Jue 08/10/2026 · Noche" (o "Jue 08/10 · Noche" sin el año). */
export function tituloCierre(c: Pick<CierreApi, "fecha" | "fechaApertura" | "fechaCierre">, conAnio = true): string {
  const turno = turnoDe(c.fechaApertura);
  const dia = diaDelTurno(c, conAnio);
  return turno ? `${dia} · ${turno}` : dia;
}

/** Contado − esperado, a centavos. Positivo = sobró plata en el cajón. */
export function diferenciaDe(c: Pick<CierreApi, "esperado" | "conteo">): number {
  return aCentavos(c.conteo - c.esperado);
}

export type EstadoCaja = "cuadra" | "faltante" | "sobrante";

/** Una diferencia de centavos (medio centavo para abajo) cuadra: es redondeo, no plata. */
export function estadoDe(diferencia: number): EstadoCaja {
  if (esCero(diferencia)) return "cuadra";
  return diferencia > 0 ? "sobrante" : "faltante";
}

export interface ResumenCierres {
  cierres: number;
  cuadraron: number;
  /** Suma de los faltantes: negativa (o cero). */
  faltantes: number;
  conFaltante: number;
  /** Suma de los sobrantes: positiva (o cero). */
  sobrantes: number;
  conSobrante: number;
}

/**
 * Los KPIs del historial. Faltantes y sobrantes se suman por separado: netos,
 * un turno con −Bs 50 y otro con +Bs 50 daban "cuadró" y la plata que faltó
 * en uno no se veía.
 */
export function resumenCierres(historial: Pick<CierreApi, "esperado" | "conteo">[]): ResumenCierres {
  const r: ResumenCierres = { cierres: historial.length, cuadraron: 0, faltantes: 0, conFaltante: 0, sobrantes: 0, conSobrante: 0 };
  for (const c of historial) {
    const dif = diferenciaDe(c);
    const estado = estadoDe(dif);
    if (estado === "cuadra") r.cuadraron++;
    else if (estado === "faltante") {
      r.faltantes = aCentavos(r.faltantes + dif);
      r.conFaltante++;
    } else {
      r.sobrantes = aCentavos(r.sobrantes + dif);
      r.conSobrante++;
    }
  }
  return r;
}

const NOMBRE_ESTADO: Record<EstadoCaja, string> = { cuadra: "Cuadró", faltante: "Faltante", sobrante: "Sobrante" };

export function hojaCierres(historial: CierreApi[]): HojaNueva {
  return hoja<CierreApi>(
    "Cierres de caja",
    [
      ["Día", (c) => diaDelTurno(c)],
      ["Turno", (c) => turnoDe(c.fechaApertura)],
      ["Cajero (abrió)", (c) => c.cajero],
      ["Abrió", (c) => (c.fechaApertura ? fmtFechaHora(c.fechaApertura) : null)],
      ["Cerró", (c) => (c.fechaCierre ? fmtFechaHora(c.fechaCierre) : null)],
      ["Vendido (Bs)", (c) => c.totalDia],
      ["Fondo de apertura (Bs)", (c) => c.apertura],
      ["Efectivo (Bs)", (c) => c.efectivo],
      ["QR y otros (Bs)", (c) => c.qr],
      ["Esperado (Bs)", (c) => c.esperado],
      ["Contado (Bs)", (c) => c.conteo],
      ["Diferencia (Bs)", (c) => diferenciaDe(c)],
      ["Estado", (c) => NOMBRE_ESTADO[estadoDe(diferenciaDe(c))]],
    ],
    historial,
  );
}
