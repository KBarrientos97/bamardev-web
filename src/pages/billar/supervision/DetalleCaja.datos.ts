import { aCentavos, esCero, esPositivo } from "../../../lib/dinero";
import { fmtMoney } from "../../../lib/format";
import type { AnuladaCajaApi, ArqueoCajaApi, CajaSupervisionApi, CobradoPorMedioApi, MovimientoSupervisionApi } from "../api";
import { tituloDeMovimiento } from "./EfectivoSupervision.datos";
import { cuando, duracion } from "./Supervision.datos";

/**
 * Lo del detalle de una caja (26-oct) que no es dibujo: la cuenta del efectivo
 * que debía haber en el cajón, renglón por renglón, con los mismos números del
 * arqueo que vio la cajera al cerrar (`calcularResumen` del backend). Nunca una
 * fórmula nueva: si la pantalla calculara su propio esperado, el día que no
 * coincida con el del cierre nadie sabría cuál creer.
 */

export interface RenglonEfectivo {
  clave: string;
  etiqueta: string;
  /** Con su signo: lo que suma o resta al efectivo. 0 en un movimiento anulado. */
  monto: number;
  /** El primero de la cuenta (el cambio inicial) va sin "+". */
  inicial?: boolean;
  /** Debajo de la etiqueta: qué es, o quién lo registró y cuándo. */
  pie?: string;
  /** Un movimiento anulado: se ve tachado con su monto y no suma. */
  anulado?: { monto: number };
}

export interface CuentaEfectivo {
  renglones: RenglonEfectivo[];
  /** Lo que debía haber: el esperado del cierre si la caja se cerró; si no, el de ahora. */
  total: number;
  /**
   * La caja se cerró y después algo cambió el arqueo (una venta que se anuló):
   * lo que daría la cuenta hoy. Null si sigue igual.
   */
  hoyDaria: number | null;
}

/**
 * La cuenta del efectivo de una caja, de arriba abajo:
 *
 *   Cambio inicial + cobrado en efectivo ± adelantos de mesas + cobros de fiado
 *   ± cada movimiento (los anulados, tachados y sin sumar) − lo que tienen los
 *   meseros = DEBÍA HABER
 *
 * Es la misma cuenta del arqueo del backend, y siempre suma: si algo no entra
 * en ningún renglón (no debería), va en uno propio en vez de quedar escondido.
 * Si la caja se cerró y después se anuló una venta, el arqueo de hoy no es el
 * que vio la cajera: la diferencia va en su renglón, para que la cuenta llegue
 * al esperado del cierre, que es contra el que se contó.
 */
export function cuentaDelEfectivo(
  arqueo: ArqueoCajaApi,
  movimientos: MovimientoSupervisionApi[],
  opc: { cerrada: boolean; anuladas?: AnuladaCajaApi[]; ahora: number },
): CuentaEfectivo {
  const renglones: RenglonEfectivo[] = [
    { clave: "inicial", etiqueta: "Cambio inicial", monto: arqueo.inicial, inicial: true },
    {
      clave: "efectivo",
      etiqueta: "Cobrado en efectivo",
      monto: arqueo.efectivoVentas,
      pie: "Lo de las ventas. Lo cobrado por QR va a tu cuenta, no entra al cajón.",
    },
  ];
  const adelantosAca = {
    clave: "adelantos",
    etiqueta: "Adelantos de mesas",
    // Los de mesas abiertas se listan abajo: el pie lo dice, para no buscarlos dos veces.
    pie: "Adelantos y tiempo fijo en efectivo que ninguna venta de esta caja cuenta: ya están en el cajón. Los de mesas que siguen abiertas están abajo, en «De mesas que siguen abiertas»; los demás son de mesas que cobró otra caja.",
  };
  const deOtraCaja = {
    clave: "adelantos-otra",
    etiqueta: "Adelantos que cobró otra caja",
    pie: "Una venta de esta caja los cuenta como efectivo, pero esa plata entró en el cajón de otra caja.",
  };
  const aca = arqueo.adelantosAca;
  const otra = arqueo.adelantosDeOtraCaja;
  if (aca != null && otra != null && esPositivo(aca) && esPositivo(otra)) {
    // Los dos a la vez (dos cajas abiertas, una mesa para cada lado): cada uno
    // con su monto. El neto con un solo rótulo decía "cobró otra caja − Bs 20"
    // cuando la otra caja había cobrado 30 y acá habían entrado 10.
    renglones.push({ ...adelantosAca, monto: aca }, { ...deOtraCaja, monto: -otra });
  } else if (!esCero(arqueo.adelantosBillar)) {
    renglones.push(
      esPositivo(arqueo.adelantosBillar)
        ? { ...adelantosAca, monto: arqueo.adelantosBillar }
        : { ...deOtraCaja, clave: "adelantos", monto: arqueo.adelantosBillar },
    );
  }
  if (!esCero(arqueo.abonosEfectivo)) {
    renglones.push({
      clave: "abonos",
      etiqueta: "Cobros de fiado en efectivo",
      monto: arqueo.abonosEfectivo,
      pie: "Clientes que vinieron a pagar lo que debían.",
    });
  }
  // La anulación de un movimiento no es un renglón más: es la otra mitad del
  // anulado, que va tachado (como en la tarjeta de efectivo).
  for (const m of movimientos.filter((x) => x.anulaA == null)) {
    const signo = m.tipo === "INGRESO" ? 1 : -1;
    const quien = [m.quien ? `Registró ${m.quien}` : null, cuando(m.hora, opc.ahora)].filter(Boolean).join(" · ");
    renglones.push({
      clave: `mov-${m.id}`,
      etiqueta: tituloDeMovimiento(m),
      monto: m.anulada ? 0 : signo * m.monto,
      pie: m.anulada ? `${quien} · lo anuló ${m.anuladoPor ?? "alguien"}, no cuenta` : quien,
      ...(m.anulada ? { anulado: { monto: signo * m.monto } } : {}),
    });
  }
  if (!esCero(arqueo.enPoderDeMeseros)) {
    renglones.push({
      clave: "meseros",
      etiqueta: "En poder de los meseros",
      monto: -arqueo.enPoderDeMeseros,
      pie: "Lo cobraron y todavía no lo entregaron.",
    });
  }
  const resto = aCentavos(arqueo.esperado - sumar(renglones));
  if (!esCero(resto)) {
    renglones.push({ clave: "otros", etiqueta: "Otros ajustes del arqueo", monto: resto });
  }
  const alCerrar = opc.cerrada ? arqueo.esperadoAlCerrar : null;
  if (alCerrar == null || esCero(alCerrar - arqueo.esperado)) {
    return { renglones, total: aCentavos(arqueo.esperado), hoyDaria: null };
  }
  const despues = (opc.anuladas ?? []).filter((a) => a.despuesDelCierre);
  renglones.push(
    despues.length
      ? {
          clave: "cierre",
          etiqueta: despues.length === 1 ? "Venta anulada después del cierre" : "Ventas anuladas después del cierre",
          monto: aCentavos(alCerrar - arqueo.esperado),
          pie: `${despues.map((a) => a.codigo).join(", ")}: al cerrar todavía ${despues.length === 1 ? "contaba" : "contaban"}.`,
        }
      : {
          clave: "cierre",
          etiqueta: "Cambió después del cierre",
          monto: aCentavos(alCerrar - arqueo.esperado),
          pie: "El arqueo de hoy ya no es el que se vio al cerrar.",
        },
  );
  return { renglones, total: aCentavos(alCerrar), hoyDaria: aCentavos(arqueo.esperado) };
}

function sumar(renglones: RenglonEfectivo[]): number {
  return aCentavos(renglones.reduce((t, r) => t + r.monto, 0));
}

/** "+ Bs 556,00", "− Bs 20,00": el monto de un renglón de la cuenta, con su signo. El primero va sin signo. */
export function montoDeRenglon(r: Pick<RenglonEfectivo, "monto" | "inicial">): string {
  if (r.inicial) return fmtMoney(r.monto);
  return `${r.monto < 0 ? "−" : "+"} ${fmtMoney(Math.abs(r.monto))}`;
}

/** "Sobran" / "Faltan" / "Cuadra" y el monto: el último renglón de la cuenta. */
export function renglonDiferencia(dif: number): { etiqueta: string; valor: string; tono: TonoDiferencia } {
  if (esCero(dif)) return { etiqueta: "Cuadra", valor: fmtMoney(0), tono: "cuadra" };
  return { etiqueta: dif > 0 ? "Sobran" : "Faltan", valor: fmtMoney(Math.abs(dif)), tono: tonoDiferencia(dif) };
}

/**
 * Cuadra = verde, sobran = azul, faltan = rojo: los colores de Reportes →
 * Cierres de caja. Antes un sobrante también salía en rojo, y en Supervisión
 * "sobran Bs 10" se leía como plata que faltaba.
 */
export type TonoDiferencia = "cuadra" | "sobra" | "falta";

export function tonoDiferencia(dif: number): TonoDiferencia {
  if (esCero(dif)) return "cuadra";
  return dif > 0 ? "sobra" : "falta";
}

export const COLOR_DIFERENCIA: Record<TonoDiferencia, string> = {
  cuadra: "text-primary-700",
  sobra: "text-info-text",
  falta: "text-rose-700",
};

/**
 * "Vendió Bs 676,00 en 14 ventas · 1 pagada parte en efectivo y parte por QR":
 * lo vendido en una línea, debajo de las fichas de cada medio.
 */
export function textoVendido(c: Pick<CajaSupervisionApi, "vendido" | "ventas">, cobrado?: CobradoPorMedioApi): string {
  const base = `Vendió ${fmtMoney(c.vendido)} en ${c.ventas} ${c.ventas === 1 ? "venta" : "ventas"}`;
  const n = cobrado?.mixtas ?? 0;
  if (n <= 0) return base;
  // Si hubo otros medios, una mixta pudo ser con tarjeta: no se dice cuáles.
  const como = cobrado!.otros.length ? "con más de un medio" : "parte en efectivo y parte por QR";
  return `${base} · ${n} ${n === 1 ? "pagada" : "pagadas"} ${como}`;
}

/**
 * "Cerrada · ayer 16:58 → 02:33 (9 h 34 min)", "Abierta · desde 16:02 (lleva 3 h
 * 12 min)": el subtítulo del detalle de una caja.
 */
export function subtituloCaja(c: Pick<CajaSupervisionApi, "abierta" | "desde" | "hasta">, ahora: number): string {
  if (c.hasta == null) return `Abierta · desde ${cuando(c.desde, ahora)} (lleva ${duracion(ahora - c.desde)})`;
  return `Cerrada · ${cuando(c.desde, ahora)} → ${cuando(c.hasta, ahora)} (${duracion(c.hasta - c.desde)})`;
}
