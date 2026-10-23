import type { DetalleVentaInput, Venta } from "../../types";
import type { CarritoInscripcion, Ref } from "./tipos";

/**
 * El cobro de cuotas (E9, PLAN-ACADEMIAS-TECNICO §4.4), del lado de la web.
 * Una cuota no es un producto del catálogo: todas las de una carrera
 * comparten el mismo `productoId` (el SERVICIO de la carrera, deshabilitado).
 * Cada una viaja como un detalle de la venta con `cuotaId`, `montoCuota` y
 * cantidad 1, y el precio lo impone el servidor.
 *
 * Desde el 22-oct (A1) se cobran en "Cobrar a estudiante" y no en el POS:
 * la venta es la misma, pero sólo con cuotas.
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
 * Las cuotas elegidas en la vista "Cuotas por cobrar": las vencidas
 * arriba y marcadas; si ninguna venció, la primera. El monto arranca en el
 * saldo.
 *
 * Con `montoHoy` (lo que se acordó al inscribir: la primera cuota, todo o un
 * adelanto, N5) ese monto se reparte en orden de vencimiento: las cuotas que
 * alcanza a cubrir van enteras y la que queda a medias lleva el resto como
 * abono.
 */
export function cuotasIniciales(carrito: CarritoInscripcion, montoHoy?: number): { linea: LineaCuota; elegida: boolean }[] {
  const ordenadas = [...carrito.lineas].sort((a, b) => Number(b.vencida) - Number(a.vencida) || (a.vence < b.vence ? -1 : 1));
  const hayVencidas = ordenadas.some((l) => l.vencida);
  let resto = montoHoy != null && montoHoy > 0 ? Math.round(montoHoy * 100) / 100 : null;
  return ordenadas.map((l, i) => {
    let monto = l.saldo;
    let elegida = hayVencidas ? l.vencida : i === 0;
    if (resto != null) {
      monto = Math.min(l.saldo, resto);
      elegida = monto > 0;
      resto = Math.round((resto - monto) * 100) / 100;
      if (!elegida) monto = l.saldo;
    }
    return {
      linea: { cuotaId: l.cuotaId, productoId: l.productoId, descripcion: l.descripcion, monto, saldo: l.saldo, vencida: l.vencida },
      elegida,
    };
  });
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

/**
 * La venta recién cobrada, lista para el recibo (E10). Los renglones del
 * recibo no traen `cuotaId` y todas las cuotas comparten el producto de su
 * carrera: se le pone a cada renglón de ese producto la cuota que le toca, en
 * el orden en que se mandaron (el mismo de `venta.cuotas`). Y si pagó el
 * tutor, se dice quién. Sin cuotas, la MISMA venta.
 */
export function ventaConCuotas(venta: Venta, cobro: CobroCuotas | null): Venta {
  if (!cobro?.lineas.length) return venta;
  const productos = new Set(cobro.lineas.map((l) => l.productoId));
  let k = 0;
  const detalles = venta.detalles?.map((d) => {
    if (d.cuotaId != null || !productos.has(d.productoId)) return d;
    const cuotaId = venta.cuotas?.[k]?.cuotaId ?? cobro.lineas[k]?.cuotaId;
    k++;
    return cuotaId != null ? { ...d, cuotaId } : d;
  });
  const pagador = cobro.pagadores.find((x) => x.clienteId === cobro.pagadorId);
  return {
    ...venta,
    ...(detalles ? { detalles } : {}),
    pagadorCuotas: pagador && pagador.rol === "TUTOR" ? { nombre: pagador.nombre, rol: pagador.rol } : null,
    inscripcionCuotas: cobro.inscripcionId,
  };
}

/**
 * El enlace del estado de cuenta que trajo la venta (contrato #39): todas las
 * cuotas de una venta son de la misma inscripción, así que sirve el primero
 * que venga. `null` si el backend dijo que no hay (sin subdominio);
 * `undefined` si no lo mandó en ninguna (un backend anterior al #39).
 */
export function enlaceDeCuotas(cuotas: NonNullable<Venta["cuotas"]>): string | null | undefined {
  if (cuotas.every((q) => q.enlacePago === undefined)) return undefined;
  return cuotas.find((q) => q.enlacePago)?.enlacePago ?? null;
}

// ── "Cobrar a estudiante" (A1, 22-oct) ─────────────────────────────────────

/** Con qué se entra: desde el grupo, la ficha, Cobranza, Hoy o "Inscribir y cobrar". */
export interface InicialCobro {
  inscripcionId?: number;
  alumnoId?: number;
  q?: string;
  sede?: Ref;
  /** Lo que se acordó que paga hoy al inscribir (A2): ya no se vuelve a pedir. */
  monto?: number;
}

/** Lo que trae la dirección (`?inscripcion=&monto=&sede=&sedeNombre=` o `?alumno=&q=`). */
export function inicialDeLaUrl(params: URLSearchParams): InicialCobro {
  const num = (k: string) => {
    const n = Number(params.get(k));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const sedeId = num("sede");
  const sedeNombre = params.get("sedeNombre");
  return {
    inscripcionId: num("inscripcion"),
    alumnoId: num("alumno"),
    monto: num("monto"),
    q: params.get("q") ?? undefined,
    ...(sedeId != null || sedeNombre ? { sede: { id: sedeId ?? 0, nombre: sedeNombre ?? "" } } : {}),
  };
}

/** Lo que suman los saldos: el tope de lo que se puede cobrar hoy. */
export function saldoTotal(carrito: CarritoInscripcion): number {
  return Math.round(carrito.lineas.reduce((s, l) => s + l.saldo, 0) * 100) / 100;
}

/**
 * El monto que se propone: lo acordado al inscribir (sin pasar el saldo) o,
 * si no hay, lo vencido; si nada venció, la primera cuota. Es lo mismo que
 * marcaba "Módulos por cobrar" en el POS.
 */
export function montoSugerido(carrito: CarritoInscripcion, acordado?: number): number {
  if (acordado != null && acordado > 0) return Math.min(Math.round(acordado * 100) / 100, saldoTotal(carrito));
  const elegidas = cuotasIniciales(carrito).filter((x) => x.elegida);
  return Math.round(elegidas.reduce((s, x) => s + x.linea.saldo, 0) * 100) / 100;
}
