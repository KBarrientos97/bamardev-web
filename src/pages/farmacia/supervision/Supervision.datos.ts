import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtMoney } from "../../../lib/format";
import { fmtHace } from "../../billar/calculo";
import type {
  Actividad,
  CajaSupervision,
  CobradoPorMedio,
  SupervisionFarmacia,
  VentaSupervision,
} from "./api";

/**
 * Lo de la pantalla de Supervisión de la farmacia (11-nov) que no es dibujo:
 * cómo se lee cada caja y cada turno, los números de arriba, qué entra en
 * cada filtro de la actividad y de qué color va cada cosa.
 *
 * Las piezas de tiempo (`cuando`, `duracion`, los rangos del turno y de la
 * semana) son copia de `billar/supervision/Supervision.datos`: aquél está
 * atado a las mesas del billar y traerlo entero arrastraba sus tipos. Si se
 * arregla algo en uno conviene mirar el otro.
 */

// ── El tiempo ───────────────────────────────────────────────────────────────

const dos = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** "25/10" */
const diaMes = (d: Date) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}`;
const mismoDia = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** "hace 3 s", "hace 2 min", "hace 1 h 5 min": cuánto hace que llegó lo último. */
export function haceCuanto(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 1) return "recién";
  if (s < 60) return `hace ${s} s`;
  return `hace ${fmtHace(ms)}`;
}

/**
 * Cuándo pasó algo, dicho corto: la hora si es de hoy, "ayer 22:10" si fue
 * ayer y "Mar 20/10 22:10" si es más viejo (con el día de la semana: se
 * revisa la semana entera).
 */
export function cuando(ms: number, ahora: number): string {
  const d = new Date(ms);
  const hoy = new Date(ahora);
  const ayer = new Date(ahora);
  ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(ms, ahora)) return hhmm(d);
  if (mismoDia(ms, ayer.getTime())) return `ayer ${hhmm(d)}`;
  return `${DIAS[d.getDay()].slice(0, 3)} ${diaMes(d)} ${hhmm(d)}`;
}

/** "3 h 12 min", "45 min", "menos de 1 min": cuánto lleva abierta o cuánto duró. */
export function duracion(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

/** "desde 16:02" si sigue abierta; "ayer 16:02 – 02:41" si ya cerró (sin repetir el día si es el mismo). */
export function rangoDeTurno(c: Pick<CajaSupervision, "desde" | "hasta">, ahora: number): string {
  if (c.hasta == null) return `desde ${cuando(c.desde, ahora)}`;
  const fin = mismoDia(c.desde, c.hasta) ? hhmm(new Date(c.hasta)) : cuando(c.hasta, ahora);
  return `${cuando(c.desde, ahora)} – ${fin}`;
}

/** "Domingo 25/10 16:00": el día de la semana, la fecha y la hora, sin "hoy" ni "ayer". */
export function diaYHora(ms: number): string {
  const d = new Date(ms);
  return `${DIAS[d.getDay()]} ${diaMes(d)} ${hhmm(d)}`;
}

/** El turno de punta a punta con el día de cada hora; si sigue abierta, "desde …". */
export function rangoDeTurnoCompleto(c: Pick<CajaSupervision, "desde" | "hasta">): string {
  if (c.hasta == null) return `desde ${diaYHora(c.desde)}`;
  const fin = mismoDia(c.desde, c.hasta) ? hhmm(new Date(c.hasta)) : diaYHora(c.hasta);
  return `${diaYHora(c.desde)} → ${fin}`;
}

/** "lun 19/10 al dom 25/10": los días de la semana de los turnos. */
export function rangoDeSemana(semana: { desde: number }): string {
  const ini = new Date(semana.desde);
  const fin = new Date(semana.desde);
  fin.setDate(fin.getDate() + 6);
  const corto = (d: Date) => `${DIAS[d.getDay()].slice(0, 3).toLowerCase()} ${diaMes(d)}`;
  return `${corto(ini)} al ${corto(fin)}`;
}

/** "lunes 26/10 a las 13:00": cuándo empieza la semana nueva y los turnos de ésta dejan de verse. */
export function reinicioDeSemana(semana: { hasta: number }): string {
  const d = new Date(semana.hasta);
  return `${DIAS[d.getDay()].toLowerCase()} ${diaMes(d)} a las ${hhmm(d)}`;
}

// ── Las cajas ───────────────────────────────────────────────────────────────

/** Abierta, abierta desde antes (se olvidaron de cerrarla) o cerrada. */
export type EstadoCaja = "abierta" | "vieja" | "cerrada";

/**
 * A partir de cuánto una caja abierta se da por olvidada. El backend de la
 * farmacia no manda desde cuándo es la jornada (el billar sí), así que se
 * decide acá: abierta, de otro día calendario y con más de 12 horas. Las dos
 * condiciones juntas porque una farmacia de turno abre de noche y cruza la
 * medianoche: sólo con el día calendario, a las 00:01 ya la marcaba como
 * olvidada; sólo con las horas, una caja de 8 h abierta a las 20:00 pasaba
 * la noche entera sin aviso.
 */
const OLVIDADA_MS = 12 * 3_600_000;

export function estadoDeCaja(c: Pick<CajaSupervision, "abierta" | "desde">, ahora: number): EstadoCaja {
  if (!c.abierta) return "cerrada";
  return !mismoDia(c.desde, ahora) && ahora - c.desde > OLVIDADA_MS ? "vieja" : "abierta";
}

/** Cómo quedó el arqueo de una caja cerrada: cuadró, sobró o faltó. */
export type TonoDiferencia = "cuadra" | "sobra" | "falta";

export function tonoDiferencia(dif: number): TonoDiferencia {
  if (esCero(dif)) return "cuadra";
  return dif > 0 ? "sobra" : "falta";
}

/**
 * Sobrante en verde y faltante en rojo, como pide el dueño: lo que falta es
 * plata que se fue del cajón. Cuadró va en gris: no hay nada que mirar.
 */
export const COLOR_DIFERENCIA: Record<TonoDiferencia, string> = {
  cuadra: "text-texto-3",
  sobra: "text-primary-700",
  falta: "text-rose-700",
};

/**
 * "Bs 50,00" con espacio duro: en una columna angosta (la tarjeta de la caja
 * en el celular) el "Bs" quedaba al final de un renglón y el número en el
 * siguiente.
 */
const bsPegado = (n: number) => fmtMoney(n).replace(" ", " ");

/** "cuadró", "sobran Bs 5,00" o "faltan Bs 5,00". */
export function textoDiferencia(dif: number): string {
  if (esCero(dif)) return "cuadró";
  return `${dif > 0 ? "sobran" : "faltan"} ${bsPegado(Math.abs(dif))}`;
}

/** Las dos letras del avatar: "Rosa Quispe" → "RQ". */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[1][0] : "")).toUpperCase();
}

// ── El turno ────────────────────────────────────────────────────────────────

/**
 * Un turno es una caja: de que se abre a que se cierra. Lo de la caja
 * anterior no se mezcla con lo de la nueva: la pantalla empieza de cero
 * cuando abren otra y el turno de antes se elige aparte.
 */
export type SituacionTurno =
  /** Nadie abrió caja en la semana: los números son de la jornada de hoy. */
  | "sinCaja"
  /** La caja que trabaja ahora. */
  | "enCurso"
  /** La que corresponde es de antes y sigue abierta: se olvidaron de cerrarla. */
  | "olvidada"
  /** Todas cerradas: se ve cómo terminó la última, hasta que abran otra. */
  | "cerrado"
  /** Una caja elegida a mano, no la que corresponde ahora. */
  | "elegido";

export function situacionDelTurno(
  api: Pick<SupervisionFarmacia, "cajas" | "turno">,
  ahora: number,
): { situacion: SituacionTurno; caja?: CajaSupervision } {
  const t = api.turno;
  const caja = t.cajaId != null ? api.cajas.find((c) => c.id === t.cajaId) : undefined;
  if (!caja) return { situacion: "sinCaja" };
  if (t.cajaId !== t.defectoId) return { situacion: "elegido", caja };
  if (!caja.abierta) return { situacion: "cerrado", caja };
  return { situacion: estadoDeCaja(caja, ahora) === "vieja" ? "olvidada" : "enCurso", caja };
}

/** Cómo se nombra un turno en el selector: quién, cuándo y, si es el que corresponde, qué es. */
export function etiquetaDeTurno(c: CajaSupervision, api: Pick<SupervisionFarmacia, "turno">, ahora: number): string {
  const defecto = api.turno.defectoId === c.id;
  let marca = "";
  if (c.abierta) marca = estadoDeCaja(c, ahora) === "vieja" ? "Quedó abierta · " : defecto ? "Turno en curso · " : "Caja abierta · ";
  else if (defecto) marca = "Último turno · ";
  return `${marca}${c.cajero} · ${rangoDeTurnoCompleto(c)}`;
}

/** Los turnos que se pueden mirar: las cajas de la semana, la más nueva primero. */
export function opcionesDeTurno(api: Pick<SupervisionFarmacia, "cajas" | "turno">, ahora: number): { id: number; etiqueta: string }[] {
  return [...api.cajas].sort((a, b) => b.desde - a.desde).map((c) => ({ id: c.id, etiqueta: etiquetaDeTurno(c, api, ahora) }));
}

// ── Los números de arriba ───────────────────────────────────────────────────

export interface MedioCobrado {
  clave: string;
  nombre: string;
  monto: number;
  cobros: number;
}

/**
 * Lo cobrado por medio, listo para los KPIs: efectivo y QR siempre (un turno
 * sin QR dice "Bs 0,00 · 0 cobros", que es un dato), y los otros medios sólo
 * si hubo alguno. `mixtas` va aparte: una venta pagada mitad y mitad cuenta
 * en los dos y la suma de cobros no da la de ventas.
 */
export function resumenPorMedio(p: CobradoPorMedio): { medios: MedioCobrado[]; mixtas: number } {
  return {
    medios: [
      { clave: "efectivo", nombre: "Efectivo", monto: p.efectivo.monto, cobros: p.efectivo.cobros },
      { clave: "qr", nombre: "QR", monto: p.qr.monto, cobros: p.qr.cobros },
      ...p.otros.map((o, i) => ({ clave: `otro-${i}`, nombre: o.nombre, monto: o.monto, cobros: o.cobros })),
    ],
    mixtas: p.mixtas,
  };
}

/** "3 ventas" / "1 venta", y lo mismo para cualquier cosa contable. */
export function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Cuántos renglones trae cada bloque, para el contador de su pestaña. */
export function conteoDeBloques(api: Pick<SupervisionFarmacia, "ventas" | "controlados" | "encargos" | "efectivo" | "inventario">) {
  return {
    ventas: api.ventas.length,
    controlados: api.controlados.length,
    encargos: api.encargos.length,
    efectivo: api.efectivo.length,
    inventario: api.inventario.length,
  };
}

// ── Las ventas ──────────────────────────────────────────────────────────────

/** Lo más nuevo primero: lo último que hizo la auxiliar es lo que se mira. */
export function ventasOrdenadas(ventas: VentaSupervision[]): VentaSupervision[] {
  return [...ventas].sort((a, b) => b.hora - a.hora || b.id - a.id);
}

/** Una venta que lleva al menos un controlado: va marcada aunque no tenga receta asentada. */
export function llevaControlado(v: Pick<VentaSupervision, "items">): boolean {
  return v.items.some((i) => i.controlado);
}

/** "Efectivo", "QR + Efectivo": con qué se pagó, sin repetir; una fiada sin pagos dice "Fiado". */
export function mediosDeVenta(v: Pick<VentaSupervision, "pagos" | "fiada">): string {
  const medios = [...new Set(v.pagos.map((p) => p.medio))];
  if (!medios.length) return v.fiada ? "Fiado" : "Sin pago";
  return v.fiada ? `${medios.join(" + ")} y el resto fiado` : medios.join(" + ");
}

/** Cuántas unidades se llevó el cliente, sumando todos los renglones. */
export function unidadesDeVenta(v: Pick<VentaSupervision, "items">): number {
  return v.items.reduce((t, i) => t + i.cantidad, 0);
}

/** Si el descuento se muestra: uno de centavos de redondeo no es un descuento. */
export function conDescuento(v: Pick<VentaSupervision, "descuento">): boolean {
  return esPositivo(v.descuento);
}

// ── Encargos e inventario ───────────────────────────────────────────────────

/** Los tonos del `Badge` de `components/ui` que usan los estados. */
export type TonoEstado = "gris" | "azul" | "amarillo" | "verde" | "rojo";

/** Los mismos nombres y colores que la pantalla de Encargos: un estado se lee igual en toda la farmacia. */
export const ESTADO_ENCARGO: Record<string, { texto: string; tono: TonoEstado }> = {
  ANOTADO: { texto: "Anotado", tono: "gris" },
  PEDIDO: { texto: "Pedido", tono: "azul" },
  LLEGO: { texto: "Llegó", tono: "amarillo" },
  ENTREGADO: { texto: "Entregado", tono: "verde" },
  CANCELADO: { texto: "Cancelado", tono: "gris" },
};

export function estadoDeEncargo(estado: string): { texto: string; tono: TonoEstado } {
  return ESTADO_ENCARGO[estado] ?? { texto: estado, tono: "gris" };
}

const TIPO_INVENTARIO: Record<string, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste",
  TRANSFERENCIA: "Transferencia",
};

export function tipoDeInventario(tipo: string): string {
  return TIPO_INVENTARIO[tipo] ?? tipo;
}

/** "6 u." con coma decimal si hace falta, como lo dice el backend en la actividad. */
export function unidades(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(3).replace(/\.?0+$/, "").replace(".", ",")} u.`;
}

// ── La actividad ────────────────────────────────────────────────────────────

export type FiltroActividad = "todo" | "ventas" | "anulaciones" | "controlados" | "encargos" | "caja" | "efectivo" | "inventario";

export const FILTROS_ACTIVIDAD: { clave: FiltroActividad; etiqueta: string }[] = [
  { clave: "todo", etiqueta: "Todo" },
  { clave: "ventas", etiqueta: "Ventas" },
  { clave: "anulaciones", etiqueta: "Anulaciones" },
  { clave: "controlados", etiqueta: "Controlados" },
  { clave: "encargos", etiqueta: "Encargos" },
  { clave: "caja", etiqueta: "Caja" },
  { clave: "efectivo", etiqueta: "Efectivo" },
  { clave: "inventario", etiqueta: "Inventario" },
];

/**
 * A qué filtro pertenece un renglón. Una venta fiada (CREDITO) es una venta:
 * el dueño que mira "Ventas" quiere ver todo lo que salió del mostrador, y
 * la marca de fiado va en el renglón. Lo que no se reconoce queda sólo en
 * "Todo", así un código nuevo del backend no desaparece de la lista.
 */
export function grupoDeActividad(codigo: string): Exclude<FiltroActividad, "todo"> | null {
  switch (codigo) {
    case "VENTA":
    case "CREDITO":
      return "ventas";
    case "ANULACION":
      return "anulaciones";
    case "CONTROLADO":
      return "controlados";
    case "ENCARGO":
      return "encargos";
    case "CAJA_ABIERTA":
    case "CAJA_CERRADA":
      return "caja";
    case "EFECTIVO":
      return "efectivo";
    default:
      return codigo.startsWith("INVENTARIO_") ? "inventario" : null;
  }
}

export function filtrarActividad(lista: Actividad[], filtro: FiltroActividad): Actividad[] {
  return filtro === "todo" ? lista : lista.filter((a) => grupoDeActividad(a.codigo) === filtro);
}

/**
 * Lo más nuevo primero. El backend ya la manda así, pero la pantalla no
 * depende de eso: dos renglones de la misma hora (el cierre de la caja y el
 * movimiento que lo precede) quedan en un orden fijo por su id.
 */
export function ordenarActividad(lista: Actividad[]): Actividad[] {
  return [...lista].sort((a, b) => b.hora - a.hora || a.id.localeCompare(b.id));
}

/** Cómo se pinta un renglón: lo que resta o llama la atención se distingue del resto. */
export type TonoActividad = "normal" | "ambar" | "rosa" | "verde" | "azul" | "violeta";

/**
 * Anulación en rojo, controlado y fiado en ámbar (lo que el dueño quiere
 * revisar: el ámbar es el color de la plata que te deben en toda la app),
 * venta en verde, inventario en azul, encargo en violeta; la caja y el
 * efectivo en gris, que son del cajón y no del mostrador.
 */
export function tonoDeActividad(codigo: string): TonoActividad {
  switch (codigo) {
    case "VENTA":
      return "verde";
    case "CREDITO":
    case "CONTROLADO":
      return "ambar";
    case "ANULACION":
      return "rosa";
    case "ENCARGO":
      return "violeta";
    default:
      return codigo.startsWith("INVENTARIO_") ? "azul" : "normal";
  }
}

const ICONO_ACTIVIDAD: Record<string, string> = {
  CAJA_ABIERTA: "lock",
  CAJA_CERRADA: "lock",
  VENTA: "billetera",
  CREDITO: "fileText",
  ANULACION: "x",
  CONTROLADO: "alert",
  ENCARGO: "bolsa",
  EFECTIVO: "swap",
  INVENTARIO_ENTRADA: "arrowDown",
  INVENTARIO_SALIDA: "arrowUp",
  INVENTARIO_AJUSTE: "perillas",
  INVENTARIO_TRANSFERENCIA: "truck",
};

/** El nombre del ícono de `components/Icon` de un renglón; lo que no se reconoce lleva "info". */
export function iconoDeActividad(codigo: string): string {
  return ICONO_ACTIVIDAD[codigo] ?? "info";
}
