import { fmtMoney } from "../../lib/format";
import { contiene } from "../../lib/texto";
import {
  cuentaDe,
  estadoVisual,
  fmtCrono,
  round2,
  segundosDesdeQueSeAbrio,
  segundosEnPausa,
  sePuedeAnular,
  tieneConsumos,
  type Cuenta,
} from "./calculo";
import { tipoDe, type EstadoBillar } from "./store";
import type { CuentaSinMesa, EstadoVisual, Mesa, Pago, TipoMesa, VentaBillar } from "./tipos";

/** Lo que hace falta para dibujar una mesa en un instante. */
export interface VistaMesa {
  mesa: Mesa;
  tipo: TipoMesa;
  estado: EstadoVisual;
  /** null si no está abierta. */
  cuenta: Cuenta | null;
  /**
   * Si todavía se puede anular: los 5 minutos de `sePuedeAnular` (con el plazo
   * desde que se abrió) y sin consumos. Con consumos el link se ofrecía y el
   * diálogo decía que no se podía (el dueño, 18-oct: "si ya consumieron, no es
   * un error, se le tiene que cobrar").
   */
  anulable: boolean;
  /** Segundos que lleva en pausa; null si no está pausada. */
  pausaSeg?: number | null;
}

/**
 * Lo que `vistaDe` lee del estado: las tarifas y los minutos de aviso. Con
 * esto alcanza para dibujar una mesa fuera del tablero (la pantalla de
 * Supervisión del administrador arma el suyo con lo que trae su ruta).
 */
export interface ContextoVista {
  tipos: EstadoBillar["tipos"];
  ajustes: Pick<EstadoBillar["ajustes"], "avisos">;
}

export function vistaDe(e: ContextoVista, mesa: Mesa, ahora: number): VistaMesa {
  const tipo = tipoDe(e, mesa);
  const cuenta = mesa.estado === "abierta" && mesa.sesion ? cuentaDe(mesa.sesion, tipo, ahora) : null;
  return {
    mesa,
    tipo,
    estado: estadoVisual(mesa, ahora, e.ajustes.avisos),
    cuenta,
    anulable:
      !!mesa.sesion &&
      !tieneConsumos(mesa.sesion) &&
      sePuedeAnular(cuenta, segundosDesdeQueSeAbrio(mesa.sesion, ahora)),
    pausaSeg: segundosEnPausa(mesa, ahora),
  };
}

/** Lo que hace falta para dibujar una cuenta abierta (sin mesa ni tiempo). */
export interface VistaCuenta {
  cuenta: CuentaSinMesa;
  /** La cuenta de plata: los consumos, lo cobrado y el saldo (sin tiempo). */
  calc: Cuenta;
  /**
   * Sin consumos se puede anular (se abrió por error o se fueron sin pedir),
   * sin plazo: no hay tiempo que se pierda. Es la regla del backend.
   */
  anulable: boolean;
}

/**
 * Una cuenta abierta no cobra tiempo nunca: se calcula con una tarifa de Bs 0,
 * como la congela el backend (`TARIFA_CUENTA`), y queda total = consumos.
 */
const SIN_TIEMPO: TipoMesa = {
  id: "cuenta",
  nombre: "Cuenta",
  tarifa: 0,
  fraccion: 15,
  tolerancia: 0,
  minimo: 0,
  paquetes: [],
  promos: [],
};

export function vistaCuenta(c: CuentaSinMesa, ahora: number): VistaCuenta {
  return {
    cuenta: c,
    calc: cuentaDe(c.sesion, SIN_TIEMPO, ahora),
    anulable: !tieneConsumos(c.sesion),
  };
}

/** Busca la cuenta por su nombre, sin tildes ni mayúsculas (como las mesas). */
export function pasaBusquedaCuenta(c: CuentaSinMesa, texto: string): boolean {
  const q = texto.trim();
  return !q || contiene(c.nombre, q);
}

/** Los filtros del tablero; "Por vencer" junta las que vencen y las cumplidas. */
export const FILTROS = [
  { clave: "todas", etiqueta: "Todas" },
  { clave: "libre", etiqueta: "Libres" },
  { clave: "juego", etiqueta: "En juego" },
  { clave: "vence", etiqueta: "Por vencer" },
  { clave: "pausada", etiqueta: "Pausadas" },
  { clave: "reservada", etiqueta: "Reservadas" },
  { clave: "fuera", etiqueta: "Fuera de servicio" },
] as const;

export type Filtro = (typeof FILTROS)[number]["clave"];

export function pasaFiltro(v: VistaMesa, f: Filtro): boolean {
  if (f === "todas") return true;
  if (f === "vence") return v.estado === "vence" || v.estado === "cumplido";
  return v.estado === f;
}

/**
 * Busca por número, apodo o cliente (§7.1), sin distinguir tildes ni
 * mayúsculas: "perez" no encontraba a "Juan Pérez" y la pantalla decía
 * "Ninguna mesa coincide" (prueba profunda, 18-oct). El cajero teclea sin
 * tildes; para eso está `contiene`.
 */
export function pasaBusqueda(v: VistaMesa, texto: string): boolean {
  const q = texto.trim();
  if (!q) return true;
  const m = v.mesa;
  const campos = [
    `mesa ${m.id}`,
    String(m.id),
    m.alias ?? "",
    m.sesion?.cliente ?? "",
    m.reserva?.nombre ?? "",
    v.tipo.nombre,
  ];
  return campos.some((c) => contiene(c, q));
}

/** "Mesa 5", y el apodo si tiene. */
export function nombreMesa(m: Mesa): string {
  return m.alias ? `Mesa ${m.id} · ${m.alias}` : `Mesa ${m.id}`;
}

/** El número grande: lo jugado, lo que queda del tiempo fijo o el excedente. */
export function cronoDe(v: VistaMesa): string {
  const c = v.cuenta;
  if (!c) return "";
  if (c.restante === null) return fmtCrono(c.secs);
  return c.restante > 0 ? fmtCrono(c.restante) : `+${fmtCrono(-c.restante)}`;
}

/** "Mesa 5 · Pool", "Cuenta «Juan»" o "Venta rápida": de dónde salió la venta. */
export function origenDe(v: VentaBillar, tipos: Record<string, { nombre: string }>): string {
  if (v.origen !== "mesa") return etiquetaOrigen(v);
  return `Mesa ${v.mesaId}${v.tipoMesa ? ` · ${tipos[v.tipoMesa]?.nombre ?? v.tipoMesa}` : ""}`;
}

/** "Mesa 5", "Cuenta «Juan»" o "Venta rápida": el origen corto, para listas y avisos. */
export function etiquetaOrigen(v: Pick<VentaBillar, "origen" | "mesaId" | "cuenta">): string {
  if (v.origen === "rapida") return "Venta rápida";
  if (v.origen === "cuenta") return `Cuenta «${v.cuenta ?? ""}»`;
  return `Mesa ${v.mesaId}`;
}

/** "Mixto (Efectivo Bs 50,00 + QR Bs 30,00)": el método como se lee en el detalle. */
export function textoMetodo(p: { metodo: string; partes?: { efectivo: number; qr: number } }): string {
  if (p.metodo === "Mixto" && p.partes) {
    return `Mixto (Efectivo ${fmtMoney(p.partes.efectivo)} + QR ${fmtMoney(p.partes.qr)})`;
  }
  return p.metodo;
}

/**
 * Lo que entró en el turno (§7.13), para Ventas y para el cierre de caja.
 *
 * La plata se cuenta por CUÁNDO se cobró y no por cuándo se cerró la mesa:
 * el adelanto o el tiempo fijo cobrado de una mesa que sigue abierta ya está
 * en el cajón de este turno, y el adelanto que una mesa trajo del turno
 * anterior quedó en la caja de ese turno. Las ventas anuladas no cuentan: esa
 * plata se devolvió.
 */
export function resumenTurno(e: EstadoBillar) {
  const desde = e.caja.desde;
  const validas = e.ventas.filter((v) => !v.anulada);
  // Lo cobrado a cuentas abiertas que siguen sin cerrar también está en el cajón.
  const enCurso = [
    ...e.mesas.flatMap((m) => (m.estado === "abierta" && m.sesion ? m.sesion.pagos : [])),
    ...e.cuentas.flatMap((c) => c.sesion.pagos),
  ];
  const delTurno = (p: Pago) => p.hora >= desde;
  let efectivo = 0;
  let qr = 0;
  let fiado = 0;
  for (const p of [...validas.flatMap((v) => v.pagos), ...enCurso].filter(delTurno)) {
    if (p.metodo === "Efectivo") efectivo += p.monto;
    else if (p.metodo === "QR") qr += p.monto;
    else if (p.metodo === "Mixto") {
      efectivo += p.partes?.efectivo ?? 0;
      qr += p.partes?.qr ?? 0;
    } else fiado += p.monto;
  }
  const suma = (vs: VentaBillar[], campo: "total" | "tiempoBs" | "consumosBs") =>
    round2(vs.reduce((t, v) => t + v[campo], 0));
  const mesas = validas.filter((v) => v.origen === "mesa");
  const rapidas = validas.filter((v) => v.origen === "rapida");
  const cuentas = validas.filter((v) => v.origen === "cuenta");
  const anuladas = e.ventas.filter((v) => v.anulada);
  return {
    ventas: validas.length,
    total: suma(validas, "total"),
    efectivo: round2(efectivo),
    qr: round2(qr),
    fiado: round2(fiado),
    /** Adelantos, tiempos fijos y cobros parciales de este turno a mesas y cuentas que siguen abiertas. */
    adelantos: round2(enCurso.filter(delTurno).reduce((t, p) => t + p.monto, 0)),
    tiempoMesa: suma(mesas, "tiempoBs"),
    consumosMesa: suma(mesas, "consumosBs"),
    mesasCerradas: mesas.length,
    rapidas: rapidas.length,
    rapidasBs: suma(rapidas, "total"),
    /** Las cuentas abiertas que se cobraron. */
    cuentasCobradas: cuentas.length,
    cuentasBs: suma(cuentas, "total"),
    anuladas: anuladas.length,
    anuladasBs: suma(anuladas, "total"),
  };
}
