import type { NombreIcono } from "../../../components/Icon";
import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtFechaHora } from "../../../lib/format";
import type { HojaNueva } from "../../../lib/planilla";
import type { ClaseMovimientoCaja, CodigoMotivoEfectivo, PaginaMeta, ReporteMovimientosCaja } from "../../../types";
import { CODIGOS_GASTO, motivoDeCodigo } from "../../pos/motivosMovimiento";
import { hoja } from "../contexto";
import type { TonoR } from "../ui";
import { nombreHojaPagina } from "./Ventas.datos";

/**
 * Las cuentas de Movimientos de caja: el efectivo que entró o salió del cajón
 * SIN una venta detrás (sencillo, retiros, pagos en efectivo) y los cobros de
 * fiado en efectivo. Aparte de la pantalla para poder probarlas.
 *
 * Billar (25-oct): lo que el administrador registra desde Supervisión lleva un
 * motivo (`origen`: la cena, un gasto, un pago a proveedor…; ver
 * `motivosMovimiento.ts`) y la pantalla lo nombra y dice si resta de la
 * ganancia. Sin motivo (todo lo de los demás rubros, el cierre de caja, la
 * propina de belleza) todo queda como siempre.
 */

export type MovimientoCaja = ReporteMovimientosCaja["items"][number];
export type AnuladoCaja = NonNullable<ReporteMovimientosCaja["anulados"]>[number];

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

/**
 * El título de la fila. Con motivo, el motivo y lo que se escribió ("Gasto ·
 * Hielo", "Pago a proveedor", "Cena"), igual que en la lista de Supervisión:
 * el mismo movimiento se llama igual en las dos pantallas, y un "Hielo" suelto
 * no decía si fue un gasto o un pago a proveedor. Sin motivo, lo de siempre.
 */
export function tituloMovimiento(m: { clase: ClaseMovimientoCaja; concepto: string; origen?: string | null }): string {
  const motivo = motivoDeCodigo(m.origen);
  const concepto = m.concepto?.trim();
  if (motivo) return concepto && concepto !== motivo.etiqueta ? `${motivo.etiqueta} · ${concepto}` : motivo.etiqueta;
  return concepto || aspectoMovimiento(m.clase).etiqueta;
}

export type EfectoEnGanancia = "resta" | "no-cambia";

/**
 * Qué hace con la ganancia del mes un movimiento con motivo: la cena y el
 * gasto restan (`CODIGOS_GASTO`), el resto no. Null sin motivo: de un
 * movimiento común no se sabe, y no se dice nada.
 */
export function efectoEnGanancia(origen: string | null | undefined): EfectoEnGanancia | null {
  const codigo = motivoDeCodigo(origen)?.origen;
  if (!codigo) return null;
  return CODIGOS_GASTO.has(codigo) ? "resta" : "no-cambia";
}

export const TEXTO_EFECTO: Record<EfectoEnGanancia, string> = {
  resta: "Resta de la ganancia",
  "no-cambia": "No cambia la ganancia",
};

/** Un renglón de la tarjeta "Por motivo". */
export interface FilaPorMotivo {
  codigo: CodigoMotivoEfectivo;
  etiqueta: string;
  cantidad: number;
  /** Con signo: lo que salió del cajón va en negativo. */
  monto: number;
  efecto: EfectoEnGanancia;
}

/**
 * Cuánto quedó de cada motivo en el período, sin lo anulado: la respuesta a
 * "¿cuánto se fue en cenas, en gastos, en proveedores?". En el orden en que
 * llega (el de los motivos) y sólo los que hubo. Sin el campo (un backend
 * anterior, o cualquier rubro que no es billar) no hay tarjeta.
 */
export function filasPorMotivo(porMotivo: ReporteMovimientosCaja["porMotivo"]): FilaPorMotivo[] {
  return (porMotivo ?? []).flatMap((p) => {
    const motivo = motivoDeCodigo(p.codigo);
    if (!motivo || p.cantidad <= 0) return [];
    return [
      {
        codigo: p.codigo,
        etiqueta: motivo.etiqueta,
        cantidad: p.cantidad,
        monto: motivo.tipo === "EGRESO" ? -p.monto : p.monto,
        efecto: CODIGOS_GASTO.has(p.codigo) ? "resta" : "no-cambia",
      },
    ];
  });
}

/**
 * Los anulados que corresponden al filtro: con "Salidas" puesto, una entrada
 * anulada no tiene nada que hacer abajo de la lista. (Los totales y "Por
 * motivo" sí son del período entero, como dice la pantalla.)
 */
export function anuladosDelFiltro(anulados: ReporteMovimientosCaja["anulados"], filtro: "" | "ENTRADA" | "SALIDA"): AnuladoCaja[] {
  const todos = anulados ?? [];
  if (filtro === "SALIDA") return todos.filter((a) => a.clase === "EGRESO");
  if (filtro === "ENTRADA") return todos.filter((a) => a.clase !== "EGRESO");
  return todos;
}

const BASE_HOJA = { "": "Movimientos", ENTRADA: "Entradas", SALIDA: "Salidas" } as const;

export function hojaMovimientos(items: MovimientoCaja[], pagina: PaginaMeta, filtro: keyof typeof BASE_HOJA): HojaNueva {
  // La columna del motivo sólo si alguna fila tiene uno (un billar): el Excel
  // de los demás rubros queda como siempre.
  const conMotivo = items.some((m) => motivoDeCodigo(m.origen));
  const motivo: [string, (m: MovimientoCaja) => string | null][] = conMotivo
    ? [["Motivo", (m) => motivoDeCodigo(m.origen)?.etiqueta ?? null]]
    : [];
  return hoja<MovimientoCaja>(
    nombreHojaPagina(BASE_HOJA[filtro], pagina),
    [
      ["Fecha", (m) => fmtFechaHora(m.fecha)],
      ["Tipo", (m) => aspectoMovimiento(m.clase).etiqueta],
      ...motivo,
      ["Concepto", (m) => m.concepto || null],
      ["Detalle", (m) => m.detalle],
      ["Usuario", (m) => m.usuario],
      ["Turno", (m) => textoTurno(m.turnoId)],
      ["Monto (Bs)", (m) => montoConSigno(m)],
    ],
    items,
  );
}
