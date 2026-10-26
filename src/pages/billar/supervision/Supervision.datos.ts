import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtMoney } from "../../../lib/format";
import { round2, type Cuenta } from "../calculo";
import type { ActividadApi, CajaSupervisionApi, SesionSupervisionApi, SupervisionApi } from "../api";
import { aCuenta, aMesa } from "../api";
import type { CuentaSinMesa, Mesa } from "../tipos";
import type { VistaCuenta, VistaMesa } from "../vista";

/**
 * Lo de la pantalla de Supervisión del administrador (21-oct) que no es
 * dibujo: armar mesas y cuentas con quién las abrió y cargó, los números de
 * arriba, cómo se lee cada caja y qué entra en cada filtro de la actividad.
 */

/** Quién hizo qué en una sesión (mesa o cuenta): lo que el tablero de la cajera no trae. */
export interface QuienSesion {
  abrio: string;
  pausadaPor?: { quien: string; autorizo?: string; sinPin?: boolean };
  /** Por id de consumo: quién lo cargó y, si se anuló, quién lo anuló. */
  consumos: Map<string, { por: string; anuladoPor?: string }>;
}

export interface MesaSup {
  mesa: Mesa;
  /** Id interno de la sesión (la ruta de pausar); sin sesión, null. */
  sesionId: number | null;
  quien: QuienSesion | null;
}

export interface CuentaSup {
  cuenta: CuentaSinMesa;
  sesionId: number;
  quien: QuienSesion;
}

function quienDe(s: SesionSupervisionApi): QuienSesion {
  return {
    abrio: s.abiertaPor,
    pausadaPor: s.pausadaPor,
    consumos: new Map(s.consumos.map((c) => [String(c.id), { por: c.por, anuladoPor: c.anuladoPor }])),
  };
}

/** Las mesas y cuentas del backend como las usan las pantallas, con quién las abrió. */
export function armarSupervision(api: SupervisionApi): { mesas: MesaSup[]; cuentas: CuentaSup[] } {
  return {
    mesas: api.mesas.map((m) => ({
      mesa: aMesa(m),
      sesionId: m.sesion?.id ?? null,
      quien: m.sesion ? quienDe(m.sesion) : null,
    })),
    cuentas: api.cuentas.map((c) => ({
      cuenta: aCuenta(c),
      sesionId: c.sesion.id,
      quien: quienDe(c.sesion),
    })),
  };
}

// ── Lo de arriba ────────────────────────────────────────────────────────────

export interface ResumenSup {
  cajasAbiertas: number;
  /** Las de hoy: las abiertas y las que se abrieron o cerraron en la jornada (la lista trae también las de ayer). */
  cajasTotal: number;
  /** Las abiertas que vienen de antes de la jornada: cajas que se olvidaron de cerrar. */
  cajasViejas: number;
  /** Lo vendido en el turno que se mira (ventas aprobadas, sin las anuladas); sin turno, lo de la jornada. */
  vendido: number;
  ventas: number;
  /** Lo vendido en toda la jornada, de todas las cajas (sin las de días atrás). */
  vendidoHoy: number;
  ventasHoy: number;
  mesasEnJuego: number;
  mesasTotal: number;
  pausadas: number;
  cuentas: number;
  /** Lo que suman las mesas y cuentas abiertas, y cuánto falta cobrar. */
  totalAbierto: number;
  porCobrar: number;
  /**
   * Lo que suman sólo las cuentas abiertas, para su rótulo: con
   * `totalAbierto` ahí, una cuenta de Bs 30 con mesas por Bs 420 decía
   * "Cuentas abiertas · Bs 450" (revisión del 23-oct).
   */
  totalCuentas: number;
}

export function resumenSupervision(
  api: Pick<SupervisionApi, "cajas" | "hoy" | "desde" | "turno">,
  mesas: VistaMesa[],
  cuentas: VistaCuenta[],
): ResumenSup {
  const enUso = mesas.filter((v) => v.cuenta);
  // Lo del turno que se mira; un backend anterior no lo manda y todo es de hoy.
  const delTurno = api.turno ?? api.hoy;
  return {
    cajasAbiertas: api.cajas.filter((c) => c.abierta).length,
    cajasTotal: api.cajas.filter((c) => c.abierta || c.desde >= api.desde || (c.hasta ?? 0) >= api.desde).length,
    cajasViejas: api.cajas.filter((c) => estadoDeCaja(c, api.desde) === "vieja").length,
    // No es la suma de las cajas: una caja abierta de ayer trae sus ventas de ayer.
    vendido: round2(delTurno.vendido),
    ventas: delTurno.ventas,
    vendidoHoy: round2(api.hoy.vendido),
    ventasHoy: api.hoy.ventas,
    mesasEnJuego: enUso.length,
    mesasTotal: mesas.length,
    pausadas: enUso.filter((v) => v.estado === "pausada").length,
    cuentas: cuentas.length,
    totalAbierto: round2(enUso.reduce((t, v) => t + v.cuenta!.total, 0) + cuentas.reduce((t, v) => t + v.calc.total, 0)),
    porCobrar: round2(enUso.reduce((t, v) => t + v.cuenta!.saldo, 0) + cuentas.reduce((t, v) => t + v.calc.saldo, 0)),
    totalCuentas: round2(cuentas.reduce((t, v) => t + v.calc.total, 0)),
  };
}

// ── Las cajas ───────────────────────────────────────────────────────────────

const dos = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** "25/10" */
const diaMes = (d: Date) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}`;

/**
 * Cuándo pasó algo, dicho corto: la hora si es de hoy, "ayer 22:10" si fue
 * ayer y "Mar 20/10 22:10" si es más viejo (con el día de la semana: se
 * revisa la semana entera). Una caja que quedó abierta de antes tiene que
 * leerse como lo que es.
 */
export function cuando(ms: number, ahora: number): string {
  const d = new Date(ms);
  const hoy = new Date(ahora);
  const ayer = new Date(ahora);
  ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mismoDia(d, hoy)) return hhmm(d);
  if (mismoDia(d, ayer)) return `ayer ${hhmm(d)}`;
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

/** Abierta, abierta desde antes de la jornada (se olvidó de cerrarla) o cerrada. */
export type EstadoCaja = "abierta" | "vieja" | "cerrada";

export function estadoDeCaja(c: CajaSupervisionApi, desdeJornada: number): EstadoCaja {
  if (!c.abierta) return "cerrada";
  return c.desde < desdeJornada ? "vieja" : "abierta";
}

// ── El turno ────────────────────────────────────────────────────────────────

/**
 * Un turno es una caja: de que se abre a que se cierra. Un billar abre a la
 * tarde y cierra de madrugada, y lo de la caja anterior no se mezcla con lo de
 * la nueva: la pantalla empieza de cero cuando abren otra y el turno de antes
 * se elige aparte.
 */
export type SituacionTurno =
  /** Sin turno que mirar (nadie abrió caja, o un backend anterior): se ve lo de hoy. */
  | "hoy"
  /** La caja que trabaja ahora. */
  | "enCurso"
  /** La única abierta es de antes de la jornada: se olvidaron de cerrarla. */
  | "olvidada"
  /** Todas cerradas: se ve cómo terminó la última, hasta que abran otra. */
  | "cerrado"
  /** Una caja elegida a mano, no la que corresponde ahora. */
  | "elegido";

export function situacionDelTurno(api: Pick<SupervisionApi, "cajas" | "desde" | "turno">): {
  situacion: SituacionTurno;
  caja?: CajaSupervisionApi;
} {
  const t = api.turno;
  const caja = t?.cajaId != null ? api.cajas.find((c) => c.id === t.cajaId) : undefined;
  if (!t || !caja) return { situacion: "hoy" };
  if (t.cajaId !== t.defectoId) return { situacion: "elegido", caja };
  if (!caja.abierta) return { situacion: "cerrado", caja };
  return { situacion: estadoDeCaja(caja, api.desde) === "vieja" ? "olvidada" : "enCurso", caja };
}

const mismoDia = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** "desde 16:02" si sigue abierta; "ayer 16:02 – 02:41" si ya cerró (sin repetir el día si es el mismo). */
export function rangoDeTurno(c: Pick<CajaSupervisionApi, "desde" | "hasta">, ahora: number): string {
  if (c.hasta == null) return `desde ${cuando(c.desde, ahora)}`;
  const fin = mismoDia(c.desde, c.hasta) ? hhmm(new Date(c.hasta)) : cuando(c.hasta, ahora);
  return `${cuando(c.desde, ahora)} – ${fin}`;
}

/** "Domingo 25/10 16:00": el día de la semana, la fecha y la hora, sin "hoy" ni "ayer" (se revisa la semana entera). */
export function diaYHora(ms: number): string {
  const d = new Date(ms);
  return `${DIAS[d.getDay()]} ${diaMes(d)} ${hhmm(d)}`;
}

/**
 * El turno de punta a punta, con el día de cada hora: "Domingo 25/10 16:00 →
 * Lunes 26/10 03:30". Si abrió y cerró el mismo día, el cierre va sin día; si
 * sigue abierta, "desde …".
 */
export function rangoDeTurnoCompleto(c: Pick<CajaSupervisionApi, "desde" | "hasta">): string {
  if (c.hasta == null) return `desde ${diaYHora(c.desde)}`;
  const fin = mismoDia(c.desde, c.hasta) ? hhmm(new Date(c.hasta)) : diaYHora(c.hasta);
  return `${diaYHora(c.desde)} → ${fin}`;
}

/** "lun 19/10 al dom 25/10": los días de la semana de los turnos (se reinicia el lunes, pero termina el domingo). */
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

/** Cómo se nombra un turno en el selector: quién, cuándo y, si es el que corresponde, qué es. */
function etiquetaDeTurno(c: CajaSupervisionApi, api: Pick<SupervisionApi, "desde" | "turno">): string {
  const defecto = api.turno?.defectoId === c.id;
  let marca = "";
  if (c.abierta) marca = estadoDeCaja(c, api.desde) === "vieja" ? "Quedó abierta · " : defecto ? "Turno en curso · " : "Caja abierta · ";
  else if (defecto) marca = "Último turno · ";
  return `${marca}${c.cajero} · ${rangoDeTurnoCompleto(c)}`;
}

/** Los turnos que se pueden mirar: las cajas abiertas y las de la semana, la más nueva primero. */
export function opcionesDeTurno(api: Pick<SupervisionApi, "cajas" | "desde" | "turno">): { id: number; etiqueta: string }[] {
  return [...api.cajas].sort((a, b) => b.desde - a.desde).map((c) => ({ id: c.id, etiqueta: etiquetaDeTurno(c, api) }));
}

/**
 * "Bs 50,00" con espacio duro: en una columna angosta (la tarjeta de la caja
 * en el celular o el iPad) el "Bs" quedaba al final de un renglón y el número
 * en el siguiente. Es el criterio de `PieDelPorCobrar` (Lo que salió).
 */
const bsPegado = (n: number) => fmtMoney(n).replace(" ", " ");

/** "+ Bs 20,00" o "− Bs 20,00", sin cortarse entre el signo y el número. */
const conSigno = (n: number) => `${n < 0 ? "−" : "+"} ${bsPegado(Math.abs(n))}`;

/** "cuadra", "sobran Bs 5,00" o "faltan Bs 5,00": cómo quedó el arqueo. */
export function textoDiferencia(dif: number): string {
  if (Math.abs(dif) < 0.005) return "cuadra";
  return `${dif > 0 ? "sobran" : "faltan"} ${bsPegado(Math.abs(dif))}`;
}

/**
 * De dónde sale el "DEBÍA HABER" de una caja (26-oct), para leerlo sin abrir el
 * detalle. Miguel sumaba "Abrió con Bs 50 + Vendió Bs 676" y no le daba lo
 * contado (Bs 616): lo vendido incluye Bs 120 de QR, que va a la cuenta y no
 * entra al cajón. Lo que debía haber es el cambio más lo cobrado en efectivo:
 * "Bs 50,00 + Bs 556,00", y "− Bs 20,00 de cena" si la hubo.
 *
 * Lo demás va con su nombre y su número, así la suma cierra a la vista: los
 * adelantos de mesas de una caja abierta (el tiempo fijo cobrado de una mesa
 * que sigue en juego, lo más común de una noche) y los otros movimientos de
 * efectivo. Antes todo eso iba junto como "de otros movimientos", y con una
 * mesa de tiempo fijo la tarjeta de movimientos decía que no había ninguno.
 * Lo que no se puede nombrar desde la lista (una venta anulada después del
 * cierre, un adelanto que cruzó con otra caja en una ya cerrada) va como "de
 * otros ajustes", y el detalle de la caja lo tiene renglón por renglón. Con un
 * backend que no manda los movimientos, el resto sigue siendo "de otros
 * movimientos". Sin los datos del 26-oct, null.
 */
export function pieDelEsperado(
  c: Pick<CajaSupervisionApi, "inicial" | "esperado" | "cobrado" | "cena" | "movimientos" | "adelantos">,
): string | null {
  if (c.esperado == null || !c.cobrado) return null;
  const efectivo = c.cobrado.efectivo.monto;
  const cena = c.cena?.monto ?? 0;
  const adelantos = c.adelantos ?? 0;
  const movimientos = c.movimientos ?? 0;
  const resto = round2(c.esperado - c.inicial - efectivo + cena - adelantos - movimientos);
  const partes = [bsPegado(c.inicial), conSigno(efectivo)];
  if (esPositivo(cena)) partes.push(`${conSigno(-cena)} de cena`);
  if (!esCero(adelantos)) partes.push(`${conSigno(adelantos)} ${adelantos > 0 ? "de adelantos de mesas" : "de adelantos que cobró otra caja"}`);
  if (!esCero(movimientos)) partes.push(`${conSigno(movimientos)} de otros movimientos`);
  if (!esCero(resto)) partes.push(`${conSigno(resto)} ${c.movimientos == null ? "de otros movimientos" : "de otros ajustes"}`);
  return partes.join(" ");
}

/** Las dos letras del avatar: "Pepe Mamani" → "PM". */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[1][0] : "")).toUpperCase();
}

// ── La actividad ────────────────────────────────────────────────────────────

export type FiltroActividad = "todo" | "caja" | "mesas" | "ventas" | "efectivo";

export const FILTROS_ACTIVIDAD: { clave: FiltroActividad; etiqueta: string }[] = [
  { clave: "todo", etiqueta: "Todo" },
  { clave: "caja", etiqueta: "Caja" },
  { clave: "mesas", etiqueta: "Mesas y consumos" },
  { clave: "ventas", etiqueta: "Ventas" },
  { clave: "efectivo", etiqueta: "Efectivo" },
];

const DE_CAJA = new Set(["CAJA_ABIERTA", "CAJA_CERRADA"]);
const DE_VENTAS = new Set(["VENTA", "VENTA_ANULADA", "CORREGIR_PAGO"]);
/** El efectivo que se movió sin una venta: la cena del personal y los movimientos de siempre (24-oct). */
const DE_EFECTIVO = new Set(["EFECTIVO", "EFECTIVO_CENA"]);

/** A qué filtro pertenece un renglón: lo que no es de la caja, las ventas ni el efectivo es de las mesas. */
export function grupoDeActividad(codigo: string): Exclude<FiltroActividad, "todo"> {
  if (DE_CAJA.has(codigo)) return "caja";
  if (DE_VENTAS.has(codigo)) return "ventas";
  if (DE_EFECTIVO.has(codigo)) return "efectivo";
  return "mesas";
}

export function filtrarActividad(lista: ActividadApi[], filtro: FiltroActividad): ActividadApi[] {
  return filtro === "todo" ? lista : lista.filter((a) => grupoDeActividad(a.codigo) === filtro);
}

/** Cómo se pinta un renglón: lo que resta o frena (pausas, anulaciones) llama la atención. */
export type TonoActividad = "normal" | "ambar" | "rosa" | "verde" | "azul" | "violeta";

export function tonoDeActividad(codigo: string): TonoActividad {
  switch (codigo) {
    case "EFECTIVO_CENA":
      return "violeta";
    case "PAUSAR":
      return "ambar";
    case "ANULAR_CONSUMO":
    case "ANULAR_MESA":
    case "ANULAR_CUENTA":
    case "VENTA_ANULADA":
    case "EDITAR_INICIO":
    case "CORREGIR_PAGO":
      return "rosa";
    case "VENTA":
      return "verde";
    case "CAJA_ABIERTA":
    case "CAJA_CERRADA":
      return "azul";
    default:
      return "normal";
  }
}

// ── Lo que salió ────────────────────────────────────────────────────────────

/** Un producto de lo que van pidiendo las mesas y cuentas abiertas. */
export interface PedidoEnCurso {
  productoId: number;
  /** El del último que se cargó: si lo renombraron a mitad del turno, el de ahora. */
  nombre: string;
  cantidad: number;
  /** El precio por unidad si todos se cargaron al mismo; null si cambió en el turno. */
  precio: number | null;
  total: number;
}

/**
 * Lo que piden las mesas y cuentas que siguen abiertas, sumado por producto
 * (sin lo anulado): lo que "va saliendo" del turno. Del más caro al más barato.
 *
 * Por artículo y no por nombre (25-oct): dos "Cerveza" distintas (una en
 * Cervezas y otra sin categoría) salían sumadas en una fila, y un producto
 * renombrado a mitad del turno salía partido en dos, porque cada consumo guarda
 * el nombre que tenía al cargarse. Lo ya cobrado (el backend) agrupa igual.
 *
 * Las mismas mesas que cuenta el "Por cobrar" (`vistaDe`: abierta y con
 * sesión), así los consumos de acá son los de su desglose.
 */
export function consumosEnCurso(api: Pick<SupervisionApi, "mesas" | "cuentas">): PedidoEnCurso[] {
  const por = new Map<number, PedidoEnCurso & { hora: number }>();
  const sesiones = [
    ...api.mesas.flatMap((m) => (m.estado === "abierta" && m.sesion ? [m.sesion] : [])),
    ...api.cuentas.map((c) => c.sesion),
  ];
  for (const s of sesiones) {
    for (const c of s.consumos) {
      if (c.anulado) continue;
      const ya = por.get(c.productoId);
      if (!ya) {
        por.set(c.productoId, { productoId: c.productoId, nombre: c.nombre, cantidad: c.cant, precio: c.precio, total: c.precio * c.cant, hora: c.hora });
        continue;
      }
      ya.cantidad += c.cant;
      ya.total += c.precio * c.cant;
      // Cada consumo congela su precio: si el administrador lo cambió en el
      // turno no hay un precio por unidad que mostrar (uno a Bs 10 y otro a
      // Bs 8 no son "2 u × Bs 9,00", aunque la cuenta dé).
      if (ya.precio != null && !esCero(ya.precio - c.precio)) ya.precio = null;
      if (c.hora >= ya.hora) {
        ya.nombre = c.nombre;
        ya.hora = c.hora;
      }
    }
  }
  return [...por.values()]
    .map(({ hora: _hora, ...i }) => ({ ...i, total: round2(i.total) }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

/**
 * Cómo se llega al "Por cobrar" de arriba desde lo que se ve en "Lo que salió"
 * (25-oct). La lista de lo pedido mostraba Bs 34 de consumos y el KPI decía Bs
 * 68: el KPI suma también el tiempo de las mesas y resta lo que ya pagaron
 * (los adelantos, el tiempo fijo cobrado al abrir), y en la pantalla no había
 * forma de ver la cuenta. Con esto: tiempo 50 + consumos 34 − adelantado 16 = 68.
 */
export interface DesglosePorCobrar {
  /** El tiempo de las mesas en juego hasta ahora, con el tiempo fijo aunque ya esté pagado. */
  tiempo: number;
  /** Lo pedido en mesas y cuentas abiertas, sin lo anulado. */
  consumos: number;
  /** Lo que ya pagaron y cubre lo que deben: tiempo + consumos − adelantado = porCobrar. */
  adelantado: number;
  /** Lo pagado de más en alguna (se le devuelve al cerrar): no baja lo que deben las otras. */
  deMas: number;
  /** Todo lo que ya entró por mesas y cuentas abiertas (adelantado + deMas). */
  pagado: number;
  /** El mismo número que el KPI "Por cobrar" (`resumenSupervision`). */
  porCobrar: number;
}

/** Con las mismas vistas de mesas y cuentas que lee `resumenSupervision`, para que dé su número. */
export function desglosePorCobrar(mesas: VistaMesa[], cuentas: VistaCuenta[]): DesglosePorCobrar {
  const deMesas = mesas.flatMap((v) => (v.cuenta ? [v.cuenta] : []));
  const todas: Cuenta[] = [...deMesas, ...cuentas.map((v) => v.calc)];
  const suma = (de: (c: Cuenta) => number) => round2(todas.reduce((t, c) => t + de(c), 0));
  const tiempo = suma((c) => c.tiempoBs);
  const consumos = suma((c) => c.consumosBs);
  const pagado = suma((c) => c.pagado);
  // La misma cuenta, en el mismo orden, que `resumenSupervision`: cada mesa
  // debe su saldo y nunca menos de cero. Si se sumara "tiempo + consumos −
  // pagado", lo pagado de más en una mesa bajaba lo que debe otra y el pie no
  // daba el número del KPI.
  const porCobrar = round2(deMesas.reduce((t, c) => t + c.saldo, 0) + cuentas.reduce((t, v) => t + v.calc.saldo, 0));
  const adelantado = Math.max(0, round2(tiempo + consumos - porCobrar));
  return { tiempo, consumos, adelantado, deMas: Math.max(0, round2(pagado - adelantado)), pagado, porCobrar };
}

/**
 * La cuenta del pie de "Lo que salió", de a términos: ["Tiempo Bs 50,00", "+
 * consumos Bs 34,00", "− ya adelantado Bs 16,00"]. Sin los que están en cero
 * (una noche sin adelantos no dice "− Bs 0,00"). De a términos para que la
 * pantalla no los parta al bajar de renglón: en el celular quedaba "Bs" en un
 * renglón y "16,00" en el otro.
 */
export function cuentaDelPorCobrar(d: Pick<DesglosePorCobrar, "tiempo" | "consumos" | "adelantado">): string[] {
  const partes: string[] = [];
  if (esPositivo(d.tiempo)) partes.push(`tiempo ${fmtMoney(d.tiempo)}`);
  if (esPositivo(d.consumos)) partes.push(`${partes.length ? "+ " : ""}consumos ${fmtMoney(d.consumos)}`);
  if (esPositivo(d.adelantado)) partes.push(`− ya adelantado ${fmtMoney(d.adelantado)}`);
  if (partes.length === 0) return ["Sin tiempo ni consumos todavía"];
  partes[0] = partes[0][0].toUpperCase() + partes[0].slice(1);
  return partes;
}

/**
 * Si "Lo que salió" muestra lo pedido en mesas y cuentas abiertas: sólo con la
 * caja del turno abierta (el turno en curso, una que quedó abierta de antes o
 * una abierta elegida a mano, que llega hasta ahora). Las mesas abiertas son de
 * AHORA: con un turno ya cerrado no hay ninguna de ese turno (la caja no
 * cierra con mesas en juego), y la mitad de la tarjeta decía "Ninguna mesa
 * tiene consumos" bajo un rótulo de "sin cobrar".
 */
export function seVeLoPedido(t: { situacion: SituacionTurno; caja?: Pick<CajaSupervisionApi, "abierta"> }): boolean {
  return t.situacion !== "hoy" && t.caja?.abierta === true;
}
