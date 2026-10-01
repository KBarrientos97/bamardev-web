import { esCero, esPositivo, excede } from "./dinero";
import { fmtNum } from "./format";
import type { EstadoGasto, FiltroGasto, Gasto, MetodoPagoGasto, PlantillaGasto } from "../types";

/**
 * Las reglas de los gastos operativos que no son de una pantalla sola.
 *
 * Las usan la pantalla de Gastos de siempre y la de farmacia: qué está
 * saldado, cómo se dice un vencimiento, de qué mes a qué mes va el período.
 * Viven en un solo lugar para que las dos digan lo mismo del mismo gasto —si
 * una lo diera por pagado y la otra no, ninguna de las dos serviría.
 */

export const OPC_FILTRO = [
  ["TODOS", "Todos"],
  ["PENDIENTES", "Pendientes"],
  ["VENCIDOS", "Vencidos"],
  ["PAGADOS", "Pagados"],
] as const satisfies readonly (readonly [FiltroGasto, string])[];

/**
 * Los chips del filtro. "De meses anteriores" sólo aparece cuando hay algo
 * que mostrar (o cuando ya está elegido): un chip que siempre da vacío es
 * ruido, y en un negocio al día la pantalla queda como siempre.
 */
export function opcionesFiltro(conAtrasados: boolean): readonly (readonly [FiltroGasto, string])[] {
  return conAtrasados ? [...OPC_FILTRO, ["ATRASADOS", "De meses anteriores"]] : OPC_FILTRO;
}

export const TONO_ESTADO: Record<EstadoGasto, "amarillo" | "azul" | "verde"> = {
  PENDIENTE: "amarillo",
  PARCIAL: "azul",
  PAGADO: "verde",
};

export const ETIQUETA_ESTADO: Record<EstadoGasto, string> = {
  PENDIENTE: "Pendiente",
  PARCIAL: "Parcial",
  PAGADO: "Pagado",
};

/**
 * **Vencido gana sobre el estado**, igual que `GastoUi.labelEstado` en la app:
 * a quien mira la lista le importa más que la luz se atrasó que si está
 * pendiente o a medio pagar. Sin esto el mismo alquiler vencido salía
 * "Pendiente" en amarillo en la web y "VENCIDO" en rojo en el celular.
 */
export function badgeEstado(g: Gasto): { tono: "amarillo" | "azul" | "verde" | "rojo"; texto: string } {
  if (g.vencido && !saldado(g)) return { tono: "rojo", texto: "Vencido" };
  return { tono: TONO_ESTADO[g.estado], texto: ETIQUETA_ESTADO[g.estado] };
}

export const METODOS = [
  ["EFECTIVO", "Efectivo"],
  ["TRANSFERENCIA", "Transferencia"],
  ["QR", "QR"],
  ["TARJETA", "Tarjeta"],
] as const satisfies readonly (readonly [MetodoPagoGasto, string])[];

/** Hoy en la zona del navegador, en el `yyyy-MM-dd` que espera el backend. */
export function hoyIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** El primer día del mes que se está mirando. */
export function inicioDeMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * El corte del mes: el **día 1 del mes siguiente**.
 *
 * `hasta` es EXCLUSIVO en el backend (`fecha < hasta`, el mismo criterio que
 * los reportes), así que mandar el último día del mes dejaba afuera todo lo
 * cargado ese día: el alquiler del 30 no aparecía en septiembre y el mes
 * cerraba con un gasto menos. Es el mismo par que arma la app para
 * "mes pasado": del primero de un mes al primero del siguiente.
 */
export function finDeMes(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  // `m` ya viene 1-based, así que esto es el mes siguiente. Diciembre rueda
  // solo a enero del año que viene.
  const siguiente = new Date(a, m, 1);
  const mm = String(siguiente.getMonth() + 1).padStart(2, "0");
  return `${siguiente.getFullYear()}-${mm}-01`;
}

/**
 * Un gasto **saldado** no debe nada.
 *
 * **Monto cero NO es saldado**, y ésa es toda la razón de que esto no sea
 * `saldo === 0`. El gasto que crea una regla de monto variable —la luz, el
 * agua, el gas— nace con monto 0 y saldo 0 mientras no llega la factura, y el
 * servidor lo manda PENDIENTE a propósito. Tomarlo por saldado le saca el
 * botón de pagar y lo manda a la pestaña "Pagados": la luz figura paga sin que
 * nadie la haya pagado. Es el mismo bug que se corrigió en Android.
 */
export function saldado(g: Gasto): boolean {
  // Con la tolerancia de Dinero y no `=== 0` / `> 0` pelados: un saldo de
  // Bs 0.004 (residuo de redondeo) está saldado, igual que en la app.
  return g.estado === "PAGADO" || (esCero(g.saldo) && esPositivo(g.monto));
}

/** Lo que la fila dice del vencimiento, o null si no hay nada urgente. */
export function textoVencimiento(g: Gasto): string | null {
  if (saldado(g) || !g.fechaVencimiento) return null;
  if (g.vencido) {
    return g.diasAtraso <= 1 ? "Venció ayer" : `Venció hace ${g.diasAtraso} días`;
  }
  if (g.diasParaVencer === 0) return "Vence hoy";
  if (g.diasParaVencer === 1) return "Vence mañana";
  return `Vence en ${g.diasParaVencer} días`;
}

/**
 * Cuánto de lo vendido en el período se fue en gastos, en por ciento.
 *
 * **Sin tope.** Hasta el 1-oct-2026 se cortaba en 100, copiando a la app, y un
 * mes con Bs 3.000 de gastos y Bs 1.000 de ventas decía "100.0%": el mes en que
 * el negocio pierde plata se leía como "se gastó todo lo vendido, ni un peso
 * más". El 300 % es justo el dato que el dueño tiene que ver.
 *
 * Null sin ventas: no hay con qué comparar, y un "0 %" se leería como que no se
 * gastó nada. Mismo criterio que `proporcionSobreVentas` en la app.
 */
export function sobreVentas(total: number, ventas: number): number | null {
  if (!esPositivo(ventas)) return null;
  return (total / ventas) * 100;
}

/**
 * "1 gasto", "3 gastos": el número con la palabra que le toca. Las tarjetas de
 * arriba decían "1 gastos" y "1 vencidos" en cualquier mes con uno solo.
 */
export function contar(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** "35,2%": con un decimal y la coma de acá, como el resto de la web. */
export function fmtSobreVentas(porcentaje: number): string {
  return `${fmtNum(porcentaje, 1)}%`;
}

/**
 * Los gastos ya pasan todo lo vendido: el período da pérdida antes de contar
 * siquiera el costo de la mercadería. Comparando montos con la tolerancia de
 * Dinero, no porcentajes: Bs 1.000,004 de gastos contra Bs 1.000 de ventas es
 * un empate, no una alarma.
 */
export function gastosSuperanVentas(total: number, ventas: number): boolean {
  return esPositivo(ventas) && excede(total, ventas);
}

/** `iso` corrido `dias` días, en hora local como todo lo de este archivo. */
function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(a, m - 1, d + dias);
  const mm = String(f.getMonth() + 1).padStart(2, "0");
  const dd = String(f.getDate()).padStart(2, "0");
  return `${f.getFullYear()}-${mm}-${dd}`;
}

/**
 * Las reglas que van a crear un gasto pronto, para avisarlo arriba de la lista.
 *
 * Una regla no aparece en la lista hasta el día que el servidor crea su gasto,
 * y quien la acaba de cargar busca el alquiler en Gastos operativos y no lo
 * encuentra. Esto le dice cuándo va a estar.
 *
 * - **El mes de hoy** mira 31 días para adelante, no hasta fin de mes: el 26
 *   de septiembre, el alquiler del 1 de octubre es lo que se viene. Con 31
 *   días toda regla mensual activa aparece siempre.
 * - **Un mes que viene** muestra las que caen en ese mes.
 * - **Un mes pasado** no anuncia nada: lo que se cargó ya está en la lista.
 *
 * Sólo se sabe la próxima carga de cada regla (la calcula el servidor): un mes
 * lejano no muestra las repeticiones, y está bien, es un aviso y no un
 * calendario.
 */
export function proximosAutomaticos(
  plantillas: readonly PlantillaGasto[],
  mes: string,
  hoy: string = hoyIso(),
): PlantillaGasto[] {
  const mesDeHoy = hoy.slice(0, 7);
  if (mes < mesDeHoy) return [];
  const desde = mes === mesDeHoy ? hoy : `${mes}-01`;
  // Hasta EXCLUSIVO, como `finDeMes`.
  const hasta = mes === mesDeHoy ? sumarDias(hoy, 32) : finDeMes(`${mes}-01`);
  return plantillas
    .filter((p) => p.activa && p.proximaCarga && p.proximaCarga >= desde && p.proximaCarga < hasta)
    .sort(
      (a, b) =>
        a.proximaCarga!.localeCompare(b.proximaCarga!) || a.concepto.localeCompare(b.concepto, "es"),
    );
}
