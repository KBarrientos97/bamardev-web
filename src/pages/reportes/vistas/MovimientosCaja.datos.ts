import type { NombreIcono } from "../../../components/Icon";
import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtFechaHora } from "../../../lib/format";
import type { HojaNueva } from "../../../lib/planilla";
import type { ClaseMovimientoCaja, PaginaMeta, ReporteMovimientosCaja } from "../../../types";
import { hoja } from "../contexto";
import type { TonoR } from "../ui";
import { nombreHojaPagina } from "./Ventas.datos";

/**
 * Las cuentas de Movimientos de caja: el efectivo que entró o salió del cajón
 * SIN una venta detrás (sencillo, retiros, pagos en efectivo) y los cobros de
 * fiado en efectivo. Aparte de la pantalla para poder probarlas.
 */

export type MovimientoCaja = ReporteMovimientosCaja["items"][number];

export interface AspectoMovimiento {
  icono: NombreIcono;
  tono: TonoR;
  etiqueta: string;
  /** Entra al cajón (suma) o sale (resta). El monto del backend viene siempre positivo. */
  entra: boolean;
}

/**
 * Cómo se ve cada clase. El cobro de fiado lleva el reloj ámbar del reporte de
 * Créditos —es la misma cobranza mirada desde el cajón— aunque su monto, que
 * entra, vaya como cualquier entrada.
 */
export function aspectoMovimiento(clase: ClaseMovimientoCaja): AspectoMovimiento {
  switch (clase) {
    case "EGRESO":
      return { icono: "minus", tono: "rosa", etiqueta: "Egreso", entra: false };
    case "COBRO_CREDITO":
      return { icono: "clock", tono: "ambar", etiqueta: "Cobro de fiado", entra: true };
    default:
      return { icono: "plus", tono: "verde", etiqueta: "Ingreso", entra: true };
  }
}

/** El monto con su signo: las salidas restan. */
export function montoConSigno(m: Pick<MovimientoCaja, "clase" | "monto">): number {
  return aspectoMovimiento(m.clase).entra ? m.monto : -m.monto;
}

/**
 * "Turno #12". Un cobro de fiado que hizo el dueño no pasa por ninguna caja y
 * llega sin turno: se dice, en vez de un "#null".
 */
export function textoTurno(turnoId: number | null | undefined): string {
  return turnoId == null ? "Sin turno" : `Turno #${turnoId}`;
}

/**
 * El KPI del neto cambia de nombre con el signo: un neto negativo no se llama
 * igual que uno positivo ni se pinta del color de un ingreso.
 */
export function netoDe(neto: number): { etiqueta: string; tono: "marca" | "alerta" | "apagado" } {
  if (esCero(neto)) return { etiqueta: "Neto", tono: "apagado" };
  return esPositivo(neto) ? { etiqueta: "Neto que entró", tono: "marca" } : { etiqueta: "Neto que salió", tono: "alerta" };
}

const BASE_HOJA = { "": "Movimientos", ENTRADA: "Entradas", SALIDA: "Salidas" } as const;

export function hojaMovimientos(items: MovimientoCaja[], pagina: PaginaMeta, filtro: keyof typeof BASE_HOJA): HojaNueva {
  return hoja<MovimientoCaja>(
    nombreHojaPagina(BASE_HOJA[filtro], pagina),
    [
      ["Fecha", (m) => fmtFechaHora(m.fecha)],
      ["Tipo", (m) => aspectoMovimiento(m.clase).etiqueta],
      ["Concepto", (m) => m.concepto || null],
      ["Detalle", (m) => m.detalle],
      ["Usuario", (m) => m.usuario],
      ["Turno", (m) => textoTurno(m.turnoId)],
      ["Monto (Bs)", (m) => montoConSigno(m)],
    ],
    items,
  );
}
