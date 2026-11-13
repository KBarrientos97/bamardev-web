import { esCero, esPositivo } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import type {
  Actividad,
  CajaSupervision,
  CobradoPorMedio,
  EquipoSupervision,
  SupervisionRestaurante,
  TurnoSupervision,
  VentaSupervision,
} from "./api";

/**
 * Lo de la Supervisión del local (12-nov) que no es dibujo: cómo se lee cada
 * caja y cada turno, el estado del equipo de cada cajero, los números de
 * arriba, la búsqueda de una venta y qué entra en cada filtro de la actividad.
 *
 * Las piezas de tiempo, de las cajas y del turno son COPIA de
 * `farmacia/supervision/Supervision.datos` (que a su vez copió las del
 * billar), y no un import, a propósito: el restaurante tiene un cliente
 * pagando y una regla que se ajuste para la farmacia (la caja de turno que
 * cruza la noche, por ejemplo) no tiene que mover esta pantalla sin que nadie
 * la mire. Si se arregla un error en una, conviene mirar las otras dos.
 */

// ── El tiempo ───────────────────────────────────────────────────────────────

const dos = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** "25/10" */
const diaMes = (d: Date) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}`;
const mismoDia = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * Una hora del servidor en milisegundos. El contrato las manda en número
 * (`tipos.ts` del backend); el latido que Android manda al servidor va en ISO,
 * así que si alguna se colara así se lee igual. Una que no se entiende es
 * `null`: un "NaN:NaN" en la tarjeta del cajero se leería como un equipo roto.
 */
export function aMs(h: number | string | null | undefined): number | null {
  if (h == null) return null;
  const n = typeof h === "number" ? h : Date.parse(h);
  return Number.isFinite(n) ? n : null;
}

/** "hace 3 s", "hace 2 min", "hace 1 h 5 min": cuánto hace que llegó lo último. */
export function haceCuanto(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 1) return "recién";
  if (s < 60) return `hace ${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `hace ${h} h ${min % 60} min` : `hace ${h} h`;
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
 * A partir de cuánto una caja abierta se da por olvidada: abierta, de otro
 * día calendario y con más de 20 horas. Las dos condiciones juntas, como en
 * la farmacia, porque el turno cruza la medianoche: sólo con el día
 * calendario, a las 00:01 ya la marcaba como olvidada.
 *
 * 20 horas y no las 12 de la farmacia: el restaurante abre al mediodía y
 * cierra a las 03:00 (15 h). Con 12, desde la medianoche el aviso de "¿se
 * olvidaron de cerrarla?" salía sobre el turno que estaba trabajando. Con 20,
 * la caja de las 12:00 que de verdad quedó abierta se marca a las 08:00, antes
 * de que abra el turno del día.
 */
const OLVIDADA_MS = 20 * 3_600_000;

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
 * Sobrante en verde y faltante en rojo: lo que falta es plata que se fue del
 * cajón. Cuadró va en gris: no hay nada que mirar.
 */
export const COLOR_DIFERENCIA: Record<TonoDiferencia, string> = {
  cuadra: "text-texto-3",
  sobra: "text-primary-700",
  falta: "text-rose-700",
};

/**
 * "Bs 50,00" con espacio duro: en una columna angosta (la tarjeta de la caja
 * en el celular) el "Bs" quedaba al final de un renglón y el número en el
 * siguiente. Con el escape y no con el carácter pegado: en la copia de la
 * farmacia el espacio duro se perdió por el camino y el reemplazo quedó
 * cambiando un espacio por otro igual.
 */
const bsPegado = (n: number) => fmtMoney(n).replace(" ", "\u00a0");

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

// ── El equipo de cada caja ──────────────────────────────────────────────────

/**
 * Más de esto sin contacto es "sin señal": el mismo umbral que el backend
 * (§2.3). El equipo late cada minuto, así que dos minutos son dos latidos
 * perdidos, no uno que llegó tarde.
 */
export const SIN_SENAL_MS = 2 * 60_000;

/** Cómo se pinta el estado del equipo: verde en línea, ámbar sin señal. */
export interface EstadoEquipo {
  tono: "verde" | "ambar";
  texto: string;
}

/**
 * "En línea · hace 20 s" o "Sin señal desde 14:03 · 3 ventas sin subir en el
 * equipo · última venta sincronizada 14:01".
 *
 * Sin `equipo` no se afirma nada (null): la caja puede ser de la web, que no
 * manda latido, o de un APK anterior al 12-nov. Decir "sin señal" de una caja
 * que nunca latió asustaría al dueño por algo que no pasa. Un estado que no
 * se reconoce (uno nuevo del backend) tampoco: ni verde ni ámbar.
 *
 * "En línea" no se sostiene más allá del umbral aunque el servidor lo haya
 * dicho: entre sondeo y sondeo (o si esta pantalla se quedó sin conexión) el
 * último contacto conocido se sigue envejeciendo, y "En línea · hace 6 min"
 * sería un dato viejo presentado como de ahora. Pasado el umbral lo que se
 * sabe es que no hay noticias del equipo desde esa hora.
 */
export function estadoDelEquipo(equipo: EquipoSupervision | null | undefined, ahora: number): EstadoEquipo | null {
  if (!equipo || (equipo.estado !== "EN_LINEA" && equipo.estado !== "SIN_SENAL")) return null;
  const contacto = aMs(equipo.ultimoContactoEn);
  if (contacto == null) return null;
  // Lo que quedó en el equipo sin llegar al servidor se dice siempre, también
  // en línea: un equipo con red y ventas trabadas es justo lo que hay que ver.
  const sinSubir = equipo.pendientes > 0 ? ` · ${plural(equipo.pendientes, "venta sin subir", "ventas sin subir")} en el equipo` : "";
  if (equipo.estado === "EN_LINEA" && ahora - contacto <= SIN_SENAL_MS) {
    return { tono: "verde", texto: `En línea · ${haceCuanto(ahora - contacto)}${sinSubir}` };
  }
  // Sin señal y con ventas trabadas, hasta cuándo siguió vendiendo el equipo:
  // la última sincronizada sola hacía creer que el cajero dejó de vender ahí.
  const enEquipo = equipo.pendientes > 0 ? aMs(equipo.ultimaVentaEnEquipoEn) : null;
  const ultimaEnEquipo = enEquipo != null ? ` · última venta en el equipo ${cuando(enEquipo, ahora)}, sin subir` : "";
  const venta = aMs(equipo.ultimaVentaEn);
  const ultimaVenta = venta != null ? ` · última venta sincronizada ${cuando(venta, ahora)}` : "";
  return { tono: "ambar", texto: `Sin señal desde ${cuando(contacto, ahora)}${sinSubir}${ultimaEnEquipo}${ultimaVenta}` };
}

/**
 * El estado del equipo de una caja, sólo si sigue abierta. Una caja cerrada no
 * late (el backend rechaza el latido de una cerrada): lo que viniera sería
 * del turno que ya terminó y diría "sin señal" de alguien que se fue a su casa.
 */
export function equipoDeCaja(c: Pick<CajaSupervision, "abierta" | "equipo">, ahora: number): EstadoEquipo | null {
  return c.abierta ? estadoDelEquipo(c.equipo, ahora) : null;
}

// ── Los cajeros ─────────────────────────────────────────────────────────────

/** Un renglón de la tarjeta "Cajeros", listo para pintar. */
export interface FilaCajero {
  id: number;
  nombre: string;
  rol: string | null;
  /** Tiene una caja abierta ahora. */
  abierta: boolean;
  /** La caja abierta quedó de otro día: se olvidaron de cerrarla. */
  olvidada: boolean;
  /** "Caja abierta desde 08:02 · lleva 3 h 12 min" o "Sin caja abierta · última actividad ayer 22:10". */
  linea: string;
  /** Con cuánto abrió (de la caja de la lista); null sin caja o si la caja no vino en la semana. */
  inicial: number | null;
  ventas: number;
  vendido: number;
  equipo: EstadoEquipo | null;
}

/**
 * Los cajeros de la sucursal, con o sin caja: los que tienen caja abierta
 * arriba y, dentro de cada grupo, por nombre. No por la última actividad: la
 * lista se vuelve a pedir cada 5 segundos, y ordenada por lo último que hizo
 * cada uno los renglones saltaban de lugar mientras el dueño los leía.
 *
 * Sin caja abierta no se muestra el equipo, por lo mismo que en una caja
 * cerrada (`equipoDeCaja`): sería el del turno anterior.
 */
export function resumenCajeros(api: Pick<SupervisionRestaurante, "cajeros" | "cajas">, ahora: number): FilaCajero[] {
  return api.cajeros
    .map((c): FilaCajero => {
      const abierta = c.cajaId != null;
      const caja = abierta ? api.cajas.find((k) => k.id === c.cajaId) : undefined;
      const desde = c.abiertaDesde ?? caja?.desde ?? null;
      let linea: string;
      if (abierta) linea = desde != null ? `Caja abierta desde ${cuando(desde, ahora)} · lleva ${duracion(ahora - desde)}` : "Caja abierta";
      else
        linea =
          c.ultimaActividadEn != null ? `Sin caja abierta · última actividad ${cuando(c.ultimaActividadEn, ahora)}` : "Sin caja abierta · sin actividad registrada";
      return {
        id: c.id,
        nombre: c.nombre,
        rol: c.rol,
        abierta,
        olvidada: abierta && desde != null && estadoDeCaja({ abierta: true, desde }, ahora) === "vieja",
        linea,
        inicial: caja?.inicial ?? null,
        ventas: c.ventas,
        vendido: c.vendido,
        equipo: abierta ? estadoDelEquipo(c.equipo ?? caja?.equipo, ahora) : null,
      };
    })
    .sort((a, b) => Number(b.abierta) - Number(a.abierta) || a.nombre.localeCompare(b.nombre, "es"));
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
  api: Pick<SupervisionRestaurante, "cajas" | "turno">,
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
export function etiquetaDeTurno(c: CajaSupervision, api: Pick<SupervisionRestaurante, "turno">, ahora: number): string {
  const defecto = api.turno.defectoId === c.id;
  let marca = "";
  if (c.abierta) marca = estadoDeCaja(c, ahora) === "vieja" ? "Quedó abierta · " : defecto ? "Turno en curso · " : "Caja abierta · ";
  else if (defecto) marca = "Último turno · ";
  return `${marca}${c.cajero} · ${rangoDeTurnoCompleto(c)}`;
}

/** Los turnos que se pueden mirar: las cajas de la semana, la más nueva primero. */
export function opcionesDeTurno(
  api: Pick<SupervisionRestaurante, "cajas" | "turno">,
  ahora: number,
): { id: number; etiqueta: string }[] {
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

/**
 * El pie de "Pedidos en camino": cuánta plata falta cobrar y de cuántos.
 * `porCobrar` del turno es una CANTIDAD y la plata es `porCobrarTotal`: con
 * el primero formateado como plata, dos pedidos se leían "Bs 2,00 por cobrar".
 * Si todos salieron pagados se dice, para que el dueño no espere plata.
 */
export function textoPorCobrar(p: TurnoSupervision["pedidos"]): string {
  if (p.porCobrar > 0) return `${fmtMoney(p.porCobrarTotal)} por cobrar · ${plural(p.porCobrar, "pedido", "pedidos")}`;
  return p.enCamino === 1 ? "ya pagado" : "todos ya pagados";
}

/**
 * Las columnas de los números de arriba cuando hay lugar: tantas como
 * tarjetas hasta cuatro, y con cinco (vendido, anulado, fiado, descuentos y
 * pedidos) 3 + 2, o las cinco en un renglón si la columna es muy ancha. Nunca
 * cuatro y una huérfana abajo, que se leía como un número suelto de otra cosa.
 * Clases enteras, para que Tailwind las vea.
 */
export function columnasDeKpis(n: number): string {
  if (n <= 2) return "@4xl:grid-cols-2";
  if (n === 3) return "@4xl:grid-cols-3";
  if (n === 4) return "@4xl:grid-cols-4";
  return "@4xl:grid-cols-3 @6xl:grid-cols-5";
}

/** Cuántos renglones trae cada bloque, para el contador de su pestaña. */
export function conteoDeBloques(api: Pick<SupervisionRestaurante, "ventas" | "pedidos" | "efectivo">) {
  return { ventas: api.ventas.length, pedidos: api.pedidos.length, efectivo: api.efectivo.length };
}

// ── Las ventas ──────────────────────────────────────────────────────────────

/** Lo más nuevo primero: lo último que hizo el cajero es lo que se mira. */
export function ventasOrdenadas(ventas: VentaSupervision[]): VentaSupervision[] {
  return [...ventas].sort((a, b) => b.hora - a.hora || b.id - a.id);
}

/**
 * "Efectivo", "QR + Efectivo": con qué se pagó, sin repetir; una fiada sin
 * pagos dice "Fiado". Un pedido que se cobra al entregar no tiene pagos todavía
 * y dice "Se cobra al entregar": "Sin pago" se leía como una venta rota.
 */
export function mediosDeVenta(v: Pick<VentaSupervision, "pagos" | "fiada" | "porCobrar">): string {
  const medios = [...new Set(v.pagos.map((p) => p.medio))];
  if (!medios.length) {
    if (v.porCobrar) return "Se cobra al entregar";
    return v.fiada ? "Fiado" : "Sin pago";
  }
  return v.fiada ? `${medios.join(" + ")} y el resto fiado` : medios.join(" + ");
}

/** Cuántas unidades se llevó el cliente, sumando todos los renglones. */
export function unidadesDeVenta(v: Pick<VentaSupervision, "items">): number {
  return v.items.reduce((t, i) => t + i.cantidad, 0);
}

/** "6 u." con coma decimal si hace falta. */
export function unidades(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(3).replace(/\.?0+$/, "").replace(".", ",")} u.`;
}

/** Si el descuento se muestra: uno de centavos de redondeo no es un descuento. */
export function conDescuento(v: Pick<VentaSupervision, "descuento">): boolean {
  return esPositivo(v.descuento);
}

/** "Delivery" o "Recoger"; una venta de mostrador o de mesa no lleva marca (null). */
export function marcaDePedido(tipoPedido: string): string | null {
  if (tipoPedido === "DELIVERY") return "Delivery";
  if (tipoPedido === "RECOGER") return "Recoger";
  return null;
}

/** Sin tildes y en minúscula: "Pérez" se encuentra escribiendo "perez". */
const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** El número de un comprobante: "V-000012" → 12; sin número, null. */
function numeroDeComprobante(c: string | null): number | null {
  const m = c ? /(\d+)\s*$/.exec(c) : null;
  return m ? Number(m[1]) : null;
}

/** "v-12", "V12", "V-000012" → { letras: "v", numero: 12 }. */
function partesDeComprobante(c: string): { letras: string; numero: number } | null {
  const m = /^([a-z]+)\s*-?\s*(\d+)$/.exec(normal(c.trim()));
  return m ? { letras: m[1], numero: Number(m[2]) } : null;
}

/**
 * Las ventas que coinciden con lo que se escribió en el buscador, en el
 * mismo orden. Lo que el dueño tiene en la mano es el ticket ("V-000012"),
 * o el número que le dicta el cajero por teléfono ("la 12"), o el `#id` que
 * muestra el Historial, o el nombre de quien cobró:
 *
 * - `#12`: la venta con ese id, y sólo ésa.
 * - `12`: el id o el número del comprobante, EXACTOS. Por substring, "12"
 *   traía también la 112 y la 120, y la que se buscaba quedaba perdida.
 * - `V-12`, `v12`, `V-000012`: el comprobante, con o sin los ceros.
 * - Cualquier otra cosa: un pedazo del comprobante ("V-0000"), del nombre de
 *   quien cobró o del cliente del pedido. Sin mayúsculas ni tildes.
 *
 * El número del comprobante vuelve a 1 en cada apertura (V-000001 es la
 * primera de CADA caja), así que "12" puede traer una de este turno y una
 * anulada de otro: por eso se muestran todas las que coinciden.
 */
export function buscarVentas<T extends Pick<VentaSupervision, "id" | "comprobante" | "quien" | "clienteNombre">>(ventas: T[], texto: string): T[] {
  const q = normal(texto.trim());
  if (!q) return ventas;
  const porId = /^#\s*(\d+)$/.exec(q);
  if (porId) return ventas.filter((v) => v.id === Number(porId[1]));
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    return ventas.filter((v) => v.id === n || numeroDeComprobante(v.comprobante) === n);
  }
  const buscado = partesDeComprobante(q);
  return ventas.filter((v) => {
    if (v.comprobante) {
      const partes = buscado && partesDeComprobante(v.comprobante);
      if (partes && buscado && partes.letras === buscado.letras && partes.numero === buscado.numero) return true;
      if (normal(v.comprobante).includes(q)) return true;
    }
    return normal(v.quien).includes(q) || (!!v.clienteNombre && normal(v.clienteNombre).includes(q));
  });
}

// ── Los pedidos ─────────────────────────────────────────────────────────────

/** Los tonos del `Badge` de `components/ui` que usan los estados. */
export type TonoEstado = "gris" | "azul" | "amarillo" | "verde" | "rojo";

/**
 * Cómo se dice el estado de un pedido. PENDIENTE es "En camino" en un
 * delivery y "Por recoger" en un recoger: el cliente que pasa a buscarlo no
 * está en ningún camino. Azul, el color de lo que está a medias en toda la
 * app; lo que no se reconoce va tal cual, en gris.
 */
export function estadoDePedido(tipo: string, estado: string): { texto: string; tono: TonoEstado } {
  if (estado === "PENDIENTE") return { texto: tipo === "RECOGER" ? "Por recoger" : "En camino", tono: "azul" };
  if (estado === "ENTREGADO") return { texto: "Entregado", tono: "verde" };
  if (estado === "CANCELADO") return { texto: "Cancelado", tono: "gris" };
  return { texto: estado, tono: "gris" };
}

// ── La actividad ────────────────────────────────────────────────────────────

export type FiltroActividad = "todo" | "ventas" | "anulaciones" | "pedidos" | "caja" | "efectivo";

export const FILTROS_ACTIVIDAD: { clave: FiltroActividad; etiqueta: string }[] = [
  { clave: "todo", etiqueta: "Todo" },
  { clave: "ventas", etiqueta: "Ventas" },
  { clave: "anulaciones", etiqueta: "Anulaciones" },
  { clave: "pedidos", etiqueta: "Pedidos" },
  { clave: "caja", etiqueta: "Caja" },
  { clave: "efectivo", etiqueta: "Efectivo" },
];

/**
 * A qué filtro pertenece un renglón. Una venta fiada (CREDITO) es una venta:
 * el dueño que mira "Ventas" quiere ver todo lo que salió de la caja, y la
 * marca de fiado va en el renglón. Lo que no se reconoce queda sólo en
 * "Todo", así un código nuevo del backend no desaparece de la lista.
 */
export function grupoDeActividad(codigo: string): Exclude<FiltroActividad, "todo"> | null {
  switch (codigo) {
    case "VENTA":
    case "CREDITO":
      return "ventas";
    case "ANULACION":
      return "anulaciones";
    case "PEDIDO":
      return "pedidos";
    case "CAJA_ABIERTA":
    case "CAJA_CERRADA":
      return "caja";
    case "EFECTIVO":
      return "efectivo";
    default:
      return null;
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
export type TonoActividad = "normal" | "ambar" | "rosa" | "verde" | "azul";

/**
 * Anulación en rojo, fiado en ámbar (el color de la plata que te deben en
 * toda la app), venta en verde, pedido en azul (está a medias: salió y no se
 * entregó); la caja y el efectivo en gris, que son del cajón.
 */
export function tonoDeActividad(codigo: string): TonoActividad {
  switch (codigo) {
    case "VENTA":
      return "verde";
    case "CREDITO":
      return "ambar";
    case "ANULACION":
      return "rosa";
    case "PEDIDO":
      return "azul";
    default:
      return "normal";
  }
}

const ICONO_ACTIVIDAD: Record<string, string> = {
  CAJA_ABIERTA: "lock",
  CAJA_CERRADA: "lock",
  VENTA: "billetera",
  CREDITO: "fileText",
  ANULACION: "x",
  EFECTIVO: "swap",
  PEDIDO: "truck",
};

/** El nombre del ícono de `components/Icon` de un renglón; lo que no se reconoce lleva "info". */
export function iconoDeActividad(codigo: string): string {
  return ICONO_ACTIVIDAD[codigo] ?? "info";
}
