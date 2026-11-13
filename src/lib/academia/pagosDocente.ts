import { enlaceWhatsApp } from "../agenda/recordatorio";
import { fmtMoney } from "../format";
import { tituloMes } from "./calendario";
import { fechaCorta, horarioGrupo, nombreDe } from "./formato";
import type { GrupoDelMesDocente, MetodoPagoPlanilla, PagoDeSede, PagoPlanilla, Ref, ResumenClasesDocente } from "./tipos";

/**
 * Pagos a docentes, tanda 2 de la revisión del 08-nov: cómo se cuentan en
 * pantalla las clases que dio el docente (ítem 15), con qué se le pagó (ítem
 * 3), sus grupos con días y horario (ítem 4) y el mensaje del comprobante que
 * le manda el admin (ítem 17, D4: el docente no ve lo que cobra en la app).
 * Funciones puras, para probarlas sin pantalla.
 */

const METODO: Record<MetodoPagoPlanilla, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  QR: "QR",
  TARJETA: "Tarjeta",
};

/** "Efectivo", "Transferencia", "QR"; sin método (sin pago), "". */
export function textoMetodoPago(m: MetodoPagoPlanilla | null | undefined): string {
  return m ? (METODO[m] ?? m) : "";
}

/** "Pagado el 03-nov · Efectivo"; sin fecha, "Pagado". */
export function textoPagado(pago: PagoPlanilla | null | undefined, pagadaEn?: string | null): string {
  const fecha = pago?.pagadaEn ?? pagadaEn ?? null;
  const metodo = textoMetodoPago(pago?.metodoPago);
  return [fecha ? `Pagado el ${fechaCorta(fecha)}` : "Pagado", metodo || null].filter(Boolean).join(" · ");
}

const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;

// ── Pago del mes completo (PLAN-SUCURSAL-TOTAL §8.6) ─────────────────────────

/**
 * Lo que realmente sale al pagar: el mes entero del docente, todas sus sedes.
 * `liquido` es sólo el subtotal de la sede que se mira, así que el botón y las
 * confirmaciones usan esto. Sin `aPagar` (un backend anterior), `liquido`.
 */
export function aPagarDe(x: { liquido: number; aPagar?: number | null }): number {
  return x.aPagar ?? x.liquido;
}

/** «Norte», «Norte y Sur», «Norte, Sur y Este». */
function listaDeSedes(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * El aviso de antes de pagar cuando el docente dicta también donde quien mira
 * no está: «Además dicta en Norte (Bs 300): el pago es de todo el mes». Vacío
 * si no hay otras sedes.
 */
export function avisoOtrasSedes(otras: PagoDeSede[] | null | undefined): string {
  if (!otras?.length) return "";
  const monto = otras.reduce((s, x) => s + x.liquido, 0);
  return `Además dicta en ${listaDeSedes(otras.map((x) => x.sede.nombre))} (${fmtMoney(monto)}): el pago es de todo el mes, no sólo de esta sede.`;
}

/**
 * Cómo se reparte el pago en los gastos de sueldos: «Central Bs 600 · Norte
 * Bs 300». Con una sola sede (o ninguna) no hay nada que repartir: vacío.
 */
export function textoRepartoPorSede(porSede: PagoDeSede[] | null | undefined): string {
  if (!porSede || porSede.length < 2) return "";
  return porSede.map((x) => `${x.sede.nombre} ${fmtMoney(x.liquido)}`).join(" · ");
}

/**
 * ¿Quien mira puede cerrar y pagar esta planilla? Un usuario atado a una sede
 * no puede si el docente dicta también en otra (el backend responde 403
 * `OTRA_SEDE`): lo paga la organización.
 */
export function puedeCerrarYPagar(usuarioAtadoASede: boolean, otras: PagoDeSede[] | null | undefined): boolean {
  return !(usuarioAtadoASede && (otras?.length ?? 0) > 0);
}

/** El tono de un dato de las clases: lo que pide mirarlo, en ámbar. */
export type TonoDatoClases = "normal" | "aviso";

export interface DatoClases {
  texto: string;
  tono: TonoDatoClases;
}

/**
 * Las clases del mes de un docente, en frases cortas para su tarjeta:
 * «12 clases» de título y debajo «10 con lista», «9 con llegada», «1 la dio
 * un reemplazo», «2 todavía no llegan» y, en ámbar, «2 sin lista». Lo que es
 * cero no se dice (salvo la lista y la llegada: «0 con lista» es justo lo que
 * hay que ver). D7: la que dio un reemplazo no es «sin lista», se dice aparte.
 * Sin clases en el mes, null.
 */
export function datosClases(c: ResumenClasesDocente | null | undefined): { titulo: string; datos: DatoClases[] } | null {
  if (!c || (c.programadas === 0 && c.comoReemplazo === 0)) return null;
  const datos: DatoClases[] = [];
  if (c.programadas > 0) {
    datos.push({ texto: `${c.conLista} con lista`, tono: "normal" });
    datos.push({ texto: `${c.conLlegada} con llegada`, tono: "normal" });
    if (c.sinLista) datos.push({ texto: `${c.sinLista} sin lista`, tono: "aviso" });
    if (c.porReemplazo) datos.push({ texto: `${c.porReemplazo} ${c.porReemplazo === 1 ? "la dio" : "las dio"} un reemplazo`, tono: "normal" });
    if (c.porDar) datos.push({ texto: `${c.porDar} todavía no ${c.porDar === 1 ? "llega" : "llegan"}`, tono: "normal" });
  }
  if (c.comoReemplazo) datos.push({ texto: `Reemplazó en ${plural(c.comoReemplazo, "clase", "clases")}`, tono: "normal" });
  if (c.suspendidas) datos.push({ texto: plural(c.suspendidas, "suspendida", "suspendidas"), tono: "normal" });
  return { titulo: plural(c.programadas, "clase en el mes", "clases en el mes"), datos };
}

/**
 * Los atrasos del mes, para que decida el admin (D2: no descuentan solos):
 * «Sin atrasos», «2 atrasos · 25 min» o, con justificados, «3 atrasos · 40
 * min (1 justificado, 15 min)».
 */
export function textoAtrasos(a: ResumenClasesDocente["atrasos"] | null | undefined): string {
  if (!a || a.cantidad === 0) return "Sin atrasos";
  const base = `${plural(a.cantidad, "atraso", "atrasos")} · ${a.minutos} min`;
  if (!a.justificados) return base;
  if (a.justificados === a.cantidad) return `${base} (${a.cantidad === 1 ? "justificado" : "todos justificados"})`;
  return `${base} (${plural(a.justificados, "justificado", "justificados")}, ${a.minutosJustificados} min)`;
}

/** ¿Hay atrasos sin justificar? Son los que el admin tiene que mirar. */
export function hayAtrasosSinJustificar(a: ResumenClasesDocente["atrasos"] | null | undefined): boolean {
  return !!a && a.cantidad > a.justificados;
}

/**
 * Un grupo que dio en el mes: «Barbería · M2 Degradados · L-V 09:00–11:00 ·
 * 12 clases». El que reemplazó lo dice al final.
 */
export function textoGrupoDelMes(g: GrupoDelMesDocente): string {
  return [
    nombreDe(g.carrera) || g.nombre,
    `M${g.materia.orden} ${g.materia.nombre}`,
    horarioGrupo(g),
    plural(g.clases, "clase", "clases"),
    g.comoReemplazo ? "como reemplazo" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Un grupo de la planilla (sin clases del mes): «Barbería · L-V 09:00–11:00».
 * Un backend anterior no manda el horario: va el nombre del grupo, que desde
 * el 08-nov ya sigue al horario («L-M-V 09–11»).
 */
export function textoGrupoPlanilla(g: { nombre: string; carrera: string | Ref; dias?: number[]; horaInicio?: string; horaFin?: string }): string {
  const horario = g.dias?.length && g.horaInicio && g.horaFin ? horarioGrupo({ dias: g.dias, horaInicio: g.horaInicio, horaFin: g.horaFin }) : "";
  return [nombreDe(g.carrera), horario || g.nombre || null].filter(Boolean).join(" · ");
}

/** Cómo se dice el método dentro de una frase. */
const COMO_SE_PAGO: Record<MetodoPagoPlanilla, string> = {
  EFECTIVO: "en efectivo",
  TRANSFERENCIA: "por transferencia",
  QR: "por QR",
  TARJETA: "con tarjeta",
};

/** Lo que va en el comprobante y en su mensaje. */
export interface DatosComprobante {
  docente: string;
  negocio?: string | null;
  /** "2026-10". */
  mes: string;
  monto: number;
  metodoPago: MetodoPagoPlanilla | null;
  pagadaEn: string | null;
}

/**
 * El mensaje que acompaña la imagen del comprobante por WhatsApp: corto, con
 * el monto, el mes y cómo se pagó. Al docente se le habla por su nombre.
 */
export function mensajeComprobanteDocente(d: DatosComprobante): string {
  const primero = d.docente.trim().split(/\s+/)[0] || d.docente;
  const como = [d.metodoPago ? COMO_SE_PAGO[d.metodoPago] : null, d.pagadaEn ? `el ${fechaCorta(d.pagadaEn)}` : null].filter(Boolean).join(", ");
  const firma = d.negocio ? ` ${d.negocio}.` : "";
  return `Hola ${primero}, te pagamos ${fmtMoney(d.monto)} por tus clases de ${tituloMes(d.mes).toLowerCase()}${como ? `, ${como}` : ""}. Te paso el comprobante. ¡Gracias!${firma}`;
}

/**
 * El `wa.me` con el mensaje: al chat del docente si tiene WhatsApp; si no, el
 * de elegir el contacto (el admin lo busca en su teléfono).
 */
export function whatsappComprobante(telefono: string | null | undefined, texto: string): string {
  return enlaceWhatsApp(telefono, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

/** El nombre del archivo de la imagen: «comprobante-marco-rojas-2026-10». */
export function archivoComprobante(docente: string, mes: string): string {
  const slug = docente
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `comprobante-${slug || "docente"}-${mes}`;
}
