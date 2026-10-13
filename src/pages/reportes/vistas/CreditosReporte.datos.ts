import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtFechaHora } from "../../../lib/format";
import type { HojaNueva } from "../../../lib/planilla";
import type { CreditosApi } from "../api";
import { hoja } from "../contexto";
import { plural } from "../formato";

/**
 * Las cuentas del reporte de Créditos (fiado), aparte de la pantalla para
 * poder probarlas.
 *
 * Mezcla dos cortes de tiempo a propósito, como el backend: la deuda es una
 * foto de HOY (lo que se debe se debe ahora, elija el período que elija) y lo
 * fiado y lo cobrado sí son del período.
 */

type Tramo = CreditosApi["antiguedad"][number];
type Deudor = CreditosApi["deudores"][number];

/**
 * Los tramos de antigüedad, siempre en el mismo orden y con su color: verde
 * al día, ámbar lo recién vencido, rojo y rojo oscuro lo viejo. El rojo es el
 * de lo vencido en toda la app; el ámbar del primer tramo es el de la plata
 * que te deben, todavía cobrable.
 */
const TRAMOS: { clave: string; nombre: string; color: string }[] = [
  { clave: "al_dia", nombre: "Al día", color: "bg-primary" },
  { clave: "atraso_1_30", nombre: "1 a 30 días vencido", color: "bg-amber-500" },
  { clave: "atraso_31_60", nombre: "31 a 60 días vencido", color: "bg-rose-500" },
  { clave: "atraso_60_mas", nombre: "Más de 60 días vencido", color: "bg-rose-800" },
];

export interface TramoFila {
  clave: string;
  nombre: string;
  color: string;
  monto: number;
  cantidad: number;
  /** Peso sobre lo que se debe, de 0 a 1. **Null sin deuda**: "—", no "0 %". */
  fraccion: number | null;
}

/**
 * Los cuatro tramos en orden aunque el backend mande uno de menos o en otro
 * orden; uno que no se conoce (un backend más nuevo) va al final con su
 * etiqueta, en gris, en vez de perderse.
 */
export function tramosDeDeuda(antiguedad: Tramo[], totalPorCobrar: number): TramoFila[] {
  const hayDeuda = esPositivo(totalPorCobrar);
  const fila = (t: Tramo | undefined, base: { clave: string; nombre: string; color: string }): TramoFila => ({
    ...base,
    monto: t?.monto ?? 0,
    cantidad: t?.cantidad ?? 0,
    fraccion: hayDeuda ? Math.max(0, Math.min(1, (t?.monto ?? 0) / totalPorCobrar)) : null,
  });
  const conocidos = TRAMOS.map((b) => fila(antiguedad.find((t) => t.clave === b.clave), b));
  const otros = antiguedad
    .filter((t) => !TRAMOS.some((b) => b.clave === t.clave))
    .map((t) => fila(t, { clave: t.clave, nombre: t.etiqueta, color: "bg-slate-400" }));
  return [...conocidos, ...otros];
}

/** Lo vencido como parte de lo que se debe. Null sin deuda. */
export function fraccionVencida(r: Pick<CreditosApi["resumen"], "totalVencido" | "totalPorCobrar">): number | null {
  return esPositivo(r.totalPorCobrar) ? Math.max(0, r.totalVencido / r.totalPorCobrar) : null;
}

export function esVencido(d: Pick<Deudor, "montoVencido">): boolean {
  return esPositivo(d.montoVencido);
}

/**
 * "2 créditos · atrasado 18 días" o "1 crédito · al día". El atraso es el del
 * crédito MÁS atrasado del cliente: el que conviene reclamar primero.
 */
export function lineaDeudor(d: Pick<Deudor, "creditos" | "diasAtrasoMax">): string {
  const atraso = d.diasAtrasoMax > 0 ? `atrasado ${plural(d.diasAtrasoMax, "día", "días")}` : "al día";
  return `${plural(d.creditos, "crédito", "créditos")} · ${atraso}`;
}

/**
 * Nada por cobrar y nada que haya pasado en el período: se muestra vacío y no
 * un tablero de ceros, que se lee como un dato.
 */
export function sinNadaDeCreditos(d: Pick<CreditosApi, "resumen" | "deudores" | "cobros">): boolean {
  const r = d.resumen;
  return (
    esCero(r.totalPorCobrar) &&
    esCero(r.fiadoEnPeriodo) &&
    esCero(r.cobradoEnPeriodo) &&
    d.deudores.length === 0 &&
    d.cobros.length === 0
  );
}

export function hojasCreditos(d: CreditosApi): HojaNueva[] {
  const hojas: HojaNueva[] = [
    hoja<Deudor>(
      "Quién debe",
      [
        ["Cliente", (x) => x.cliente],
        ["Teléfono", (x) => x.telefono],
        ["Créditos", (x) => x.creditos],
        ["Saldo (Bs)", (x) => x.saldoTotal],
        ["Vencido (Bs)", (x) => x.montoVencido],
        ["Días de atraso", (x) => x.diasAtrasoMax],
      ],
      d.deudores,
    ),
    hoja<TramoFila>(
      "Antigüedad",
      [
        ["Tramo", (t) => t.nombre],
        ["Créditos", (t) => t.cantidad],
        ["Monto (Bs)", (t) => t.monto],
        ["% del total", (t) => (t.fraccion == null ? null : Math.round(t.fraccion * 1000) / 10)],
      ],
      tramosDeDeuda(d.antiguedad, d.resumen.totalPorCobrar),
    ),
  ];
  if (d.cobros.length > 0) {
    hojas.push(
      hoja<CreditosApi["cobros"][number]>(
        "Cobros del período",
        [
          ["Fecha", (c) => fmtFechaHora(c.fecha)],
          ["Cliente", (c) => c.cliente],
          ["Crédito", (c) => c.codigo],
          ["Forma de pago", (c) => c.formaPago],
          ["Cobró", (c) => c.usuario],
          ["Monto (Bs)", (c) => c.monto],
        ],
        d.cobros,
      ),
    );
  }
  return hojas;
}
