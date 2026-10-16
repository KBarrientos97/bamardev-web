import type { Carrito } from "../../pages/pos/useCarrito";
import type { DetalleVentaInput } from "../../types";
import type { CarritoInscripcion } from "./tipos";

/**
 * El cobro de cuotas en el POS (E9, PLAN-ACADEMIAS-TECNICO §4.4), del lado de
 * la web. Una cuota no es un producto del catálogo: todas las de una carrera
 * comparten el mismo `productoId` (el SERVICIO de la carrera, deshabilitado),
 * y el carrito junta por producto. Por eso las cuotas viajan aparte del
 * carrito y se suman recién al armar la venta: cada una es un detalle con
 * `cuotaId`, `montoCuota` y cantidad 1, y el precio lo impone el servidor.
 *
 * Una venta sin cuotas no pasa por acá y sale EXACTAMENTE como siempre.
 */

export interface LineaCuota {
  cuotaId: number;
  productoId: number;
  descripcion: string;
  /** Lo que se cobra ahora: el saldo, o menos para un abono. */
  monto: number;
  saldo: number;
  vencida: boolean;
}

export interface CobroCuotas {
  inscripcionId: number;
  alumno: CarritoInscripcion["alumno"];
  pagadores: CarritoInscripcion["pagadores"];
  /** El `clienteId` de la venta: el alumno o su tutor. */
  pagadorId: number | null;
  /** La sede del grupo, para avisar si se cobra en otra (E9 punto 6). */
  sedeGrupo: string | null;
  otraSede: boolean;
  lineas: LineaCuota[];
}

/** Lo que suman las cuotas, a centavos. */
export function totalCuotas(cobro: CobroCuotas | null): number {
  if (!cobro) return 0;
  return Math.round(cobro.lineas.reduce((s, l) => s + l.monto, 0) * 100) / 100;
}

/** Los detalles de la venta que cobran las cuotas. */
export function detallesDeCuotas(cobro: CobroCuotas | null): DetalleVentaInput[] {
  if (!cobro) return [];
  return cobro.lineas.map((l) => ({
    productoId: l.productoId,
    cantidad: 1,
    precio: l.monto,
    cuotaId: l.cuotaId,
    montoCuota: l.monto,
  }));
}

/**
 * El carrito como lo ve la pantalla de venta: los mismos renglones de
 * productos, con las cuotas sumadas al total, a las unidades y a los
 * detalles. Vaciar la venta suelta también las cuotas. Sin cuotas, el MISMO
 * carrito.
 */
export function carritoConCuotas(carrito: Carrito, cobro: CobroCuotas | null, soltar: () => void): Carrito {
  if (!cobro || cobro.lineas.length === 0) return carrito;
  const suma = totalCuotas(cobro);
  const subtotal = Math.round((carrito.subtotal + suma) * 100) / 100;
  return {
    ...carrito,
    unidades: carrito.unidades + cobro.lineas.length,
    subtotal,
    total: Math.round((carrito.total + suma) * 100) / 100,
    vaciar: () => {
      carrito.vaciar();
      soltar();
    },
    aDetalles: () => [...carrito.aDetalles(), ...detallesDeCuotas(cobro)],
  };
}

/**
 * Las cuotas elegidas en la vista "Cuotas por cobrar": las vencidas
 * arriba y marcadas; si ninguna venció, la primera. El monto arranca en el
 * saldo.
 */
export function cuotasIniciales(carrito: CarritoInscripcion): { linea: LineaCuota; elegida: boolean }[] {
  const ordenadas = [...carrito.lineas].sort((a, b) => Number(b.vencida) - Number(a.vencida) || (a.vence < b.vence ? -1 : 1));
  const hayVencidas = ordenadas.some((l) => l.vencida);
  return ordenadas.map((l, i) => ({
    linea: {
      cuotaId: l.cuotaId,
      productoId: l.productoId,
      descripcion: l.descripcion,
      monto: l.saldo,
      saldo: l.saldo,
      vencida: l.vencida,
    },
    elegida: hayVencidas ? l.vencida : i === 0,
  }));
}

/** Un monto de abono válido: más que cero y nunca por encima del saldo. */
export function montoValido(monto: number, saldo: number): boolean {
  return Number.isFinite(monto) && monto > 0 && monto <= saldo + 0.005;
}

/**
 * Quién paga por defecto: el primero marcado como principal, en el orden en
 * que los manda el backend (con un menor, el tutor principal primero; con un
 * adulto, el alumno). Si ninguno lo está, el primero.
 */
export function pagadorPorDefecto(pagadores: CarritoInscripcion["pagadores"]): number | null {
  return (pagadores.find((x) => x.principal) ?? pagadores[0])?.clienteId ?? null;
}

const CLAVE = "bamar.cobroCuotas";

/** Sobrevive a un F5, como el carrito (sessionStorage: es de esta sesión). */
export function guardarCobroCuotas(cobro: CobroCuotas | null): void {
  try {
    if (cobro) sessionStorage.setItem(CLAVE, JSON.stringify(cobro));
    else sessionStorage.removeItem(CLAVE);
  } catch {
    /* sin storage se sigue igual */
  }
}

export function leerCobroCuotas(): CobroCuotas | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (!crudo) return null;
    const c = JSON.parse(crudo) as CobroCuotas;
    return c && Array.isArray(c.lineas) && typeof c.inscripcionId === "number" ? c : null;
  } catch {
    return null;
  }
}
