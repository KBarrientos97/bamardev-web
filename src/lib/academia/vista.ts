import type { Seccion } from "../permisos";
import type {
  Carrera,
  Cuota,
  EstadoPagoModulo,
  EstadoPlanilla,
  EventoInscripcion,
  FormaPago,
  GrupoResumen,
  MotivoNoPago,
  PagoDocenteCurso,
  PlanillaDocente,
  Ref,
  SemaforoPago,
} from "./tipos";
import { fechaCorta, horarioGrupo, nombreDe, textoModulos } from "./formato";
import { urlInscribirmeDe } from "../pagina/rutas";
import { ApiError } from "../api";
import { fmtMoney } from "../format";
import { normalizar } from "../texto";

/**
 * Cómo se leen en pantalla las cuotas y las inscripciones, con las reglas de
 * la versión limpia (PLAN-ACADEMIAS §5 y §7): rojo sólo lo vencido, gris lo
 * normal. Aparte de los componentes para probarlo sin pantalla.
 */

/** Un renglón del estado de cuenta: rojo sólo lo vencido, gris lo demás. */
export function textoCuota(c: Cuota): { texto: string; urgente: boolean; apagado: boolean } {
  if (c.estado === "ANULADA") return { texto: "anulada", urgente: false, apagado: true };
  if (c.estado === "PAGADA") return { texto: `${fmtMoney(c.monto)} pagado`, urgente: false, apagado: false };
  if (c.vencida) {
    const falta = c.estado === "PARCIAL" ? `faltan ${fmtMoney(c.saldo)}` : fmtMoney(c.saldo);
    return { texto: `${falta} · vencida ${c.diasAtraso} d`, urgente: true, apagado: false };
  }
  if (c.estado === "PARCIAL") return { texto: `faltan ${fmtMoney(c.saldo)} · vence ${fechaCorta(c.vence)}`, urgente: false, apagado: true };
  return { texto: `${fmtMoney(c.saldo)} · vence ${fechaCorta(c.vence)}`, urgente: false, apagado: true };
}

/**
 * "Cuota 2/3 · M2 Degradados": cómo se nombra una cuota en las listas. Con los
 * nombres de los módulos del grupo (D6) dice el módulo como el instituto; sin
 * ellos, el código «M2–M3» de siempre.
 */
export function nombreCuota(c: Pick<Cuota, "concepto" | "numero" | "materiaOrdenes">, nombres?: Record<number, string> | null): string {
  const cubre = c.materiaOrdenes.length ? ` · ${textoModulos(c.materiaOrdenes, nombres)}` : "";
  return `${c.concepto || `Cuota ${c.numero}`}${cubre}`;
}

/**
 * «Barbería · M2 Degradados»: la cuota con el curso por delante, para donde se
 * cobra y el curso hace falta (la línea de «Cobrar», el recibo). Sin módulos
 * que decir, el concepto de la cuota («Barbería · Cuota 2/3»).
 */
export function nombreCuotaDeCurso(
  curso: string,
  c: Pick<Cuota, "concepto" | "numero" | "materiaOrdenes">,
  nombres?: Record<number, string> | null,
): string {
  if (!c.materiaOrdenes.length) return `${curso} · ${c.concepto || `Cuota ${c.numero}`}`;
  return `${curso} · ${textoModulos(c.materiaOrdenes, nombres)}`;
}

/** Abre un `wa.me` en otra pestaña. */
export function abrirWhatsapp(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Los estados de la inscripción como los lee la secretaría (PA §7). */
export function textoEstadoInscripcion(estado: string): { texto: string; tono: "ambar" | "normal" | "gris" | "verde" } {
  switch (estado) {
    case "OBSERVACION":
    case "EN_OBSERVACION":
      return { texto: "En observación", tono: "ambar" };
    case "RETIRADA":
      return { texto: "Retirado", tono: "gris" };
    case "CONCLUIDA":
      return { texto: "Concluido", tono: "verde" };
    case "PREINSCRITA":
      return { texto: "Preinscrito", tono: "gris" };
    case "DESCARTADA":
      return { texto: "Descartado", tono: "gris" };
    default:
      return { texto: "Activo", tono: "normal" };
  }
}

/**
 * A dónde lleva "Cobrar": "Cobrar a estudiante" (A1, 22-oct), que abre las
 * cuotas de esa inscripción. Antes era el POS; desde que el POS quedó sólo
 * para productos, todo cobro de cuotas pasa por ahí. La sede del grupo va en
 * la dirección para avisar si se cobra en otra caja (el carrito de la
 * inscripción no la trae), y `monto` es lo acordado al inscribir.
 */
export function rutaCobroInscripcion(inscripcionId: number, sede?: string | Ref | null, monto?: number): string {
  const params = new URLSearchParams({ inscripcion: String(inscripcionId) });
  if (monto != null && monto > 0) params.set("monto", String(monto));
  if (sede && typeof sede !== "string") {
    params.set("sede", String(sede.id));
    params.set("sedeNombre", sede.nombre);
  } else if (typeof sede === "string" && sede) {
    params.set("sedeNombre", sede);
  }
  return `${RUTA_COBRAR}?${params.toString()}`;
}

/**
 * Las pestañas de la Configuración del instituto (26-oct), en orden: cada una
 * es una pantalla de siempre, en su ruta, con la sección que pide. El menú
 * tiene UNA entrada que se enciende en cualquiera (ver `ConfigAcademia`).
 */
export const PESTANAS_CONFIG_ACADEMIA: readonly { seccion: Seccion; a: string }[] = [
  { seccion: "academia_carreras", a: "/configuracion/carreras" },
  { seccion: "almacenes", a: "/inventario/almacenes" },
  { seccion: "academia_planilla", a: "/academia/planilla" },
  { seccion: "academia_ajustes", a: "/configuracion/academia" },
];

/**
 * La pantalla "Cobrar a estudiante" (A1). Cuelga de Cobranza (26-oct): en el
 * menú hay una sola entrada para la plata de los estudiantes, y estando acá
 * Cobranza queda encendida. La ruta vieja, `/academia/cobrar`, redirige.
 */
export const RUTA_COBRAR = "/academia/cobranza/cobrar";

/**
 * ¿La fila de Cobranza responde a lo que se escribió en el buscador? Cada
 * palabra tiene que estar en el nombre, el código o el teléfono (sin importar
 * mayúsculas ni tildes); una búsqueda de 4 o más dígitos también compara el
 * teléfono sin espacios ni guiones. El CI no viaja en la fila de Cobranza, así
 * que por CI no encuentra: hace falta `q` en `GET /academia/cobranza` para que
 * la búsqueda sea la misma que en Estudiantes y alcance todas las páginas.
 */
export function filaCoincideConBusqueda(
  f: { alumno: { nombre: string; codigo: string | null }; contacto: { telefono: string | null } },
  busqueda: string,
): boolean {
  const texto = busqueda.trim();
  if (!texto) return true;
  const pajar = normalizar([f.alumno.nombre, f.alumno.codigo ?? "", f.contacto.telefono ?? ""].join(" ").replace(/[,;]+/g, " "));
  const palabras = normalizar(texto.replace(/[,;]+/g, " ")).split(/\s+/).filter(Boolean);
  if (palabras.every((w) => pajar.includes(w))) return true;
  const digitos = texto.replace(/\D/g, "");
  return digitos.length >= 4 && (f.contacto.telefono ?? "").replace(/\D/g, "").includes(digitos);
}

/**
 * "Caja" en el menú del instituto: la pantalla del turno del POS (lo vendido
 * y el cierre), con ruta propia para que el menú la marque y "Punto de venta"
 * vuelva a la venta. Las dos montan el mismo POS (ver Pos.tsx).
 */
export const RUTA_CAJA = "/pos/caja";

/**
 * "Cobrar" sin la inscripción (Cobranza, Hoy → Para cobrar): se busca al
 * estudiante por su código o su nombre y, si aparece, se abre solo.
 */
export function rutaCobroAlumno(alumno: { id: number; nombre: string; codigo?: string | null }): string {
  const params = new URLSearchParams({ alumno: String(alumno.id), q: alumno.codigo || alumno.nombre });
  return `${RUTA_COBRAR}?${params.toString()}`;
}

/** A6: los motivos para no pagarle al docente una línea, como los lee el admin. */
export const MOTIVOS_NO_PAGO: readonly (readonly [MotivoNoPago, string])[] = [
  ["NO_PAGO", "El estudiante no pagó"],
  ["RETIRO", "Se retiró"],
  ["BECA", "Tiene beca"],
  ["ACUERDO", "Acuerdo con el estudiante"],
  ["OTRO", "Otro"],
];

/** "Se retiró" o, con OTRO, lo que se escribió. Con el detalle si hay. */
export function textoMotivoNoPago(m: { motivo: MotivoNoPago; detalle?: string | null }): string {
  const base = MOTIVOS_NO_PAGO.find(([k]) => k === m.motivo)?.[1] ?? m.motivo;
  const detalle = m.detalle?.trim();
  if (m.motivo === "OTRO") return detalle || base;
  return detalle ? `${base}: ${detalle}` : base;
}

/**
 * Lo único de plata que ve el docente (D6): si el estudiante pagó el módulo
 * actual. Rojo sólo "Sin pagar", que es lo que pide atención.
 */
export function textoEstadoPago(estado: EstadoPagoModulo | null | undefined): { texto: string; tono: "normal" | "ambar" | "rojo" | "gris" } {
  switch (estado) {
    case "PAGADO":
      return { texto: "Pagado", tono: "normal" };
    case "ABONO":
      return { texto: "Abonó", tono: "ambar" };
    case "SIN_PAGAR":
      return { texto: "Sin pagar", tono: "rojo" };
    default:
      return { texto: "—", tono: "gris" };
  }
}

/**
 * B7: cómo se lee el semáforo en las vistas del docente, sin montos. `corto`
 * va en el chip; `largo`, en el title y para el lector de pantalla.
 */
export function textoSemaforo(s: SemaforoPago): { corto: string; largo: string; tono: "rojo" | "ambar" | "gris" } {
  if (s === "ROJO") return { corto: "Debe, pasó la espera", largo: "Debe, pasó la semana de espera", tono: "rojo" };
  if (s === "AMARILLO") return { corto: "Debe, en espera", largo: "Debe, en semana de espera", tono: "ambar" };
  return { corto: "—", largo: "Sin deudas vencidas", tono: "gris" };
}

/**
 * Cómo cobra el docente en su planilla, curso por curso: "Barbería Bs 90 fijo
 * por módulo · Uñas 20 %" (A5, QA 23-oct). Con todos por % sigue el texto de
 * siempre: "el 20 % (Barbería 25 %) de lo cobrado". Sin cursos, el % del
 * instituto.
 */
export function textoCobroPlanilla(defecto: number, cursos: readonly PagoDocenteCurso[]): string {
  if (cursos.some((c) => c.modo === "MONTO")) {
    const partes = cursos.map((c) =>
      c.modo === "MONTO" ? `${c.nombre} ${fmtMoney(c.monto ?? 0)} fijo por módulo` : `${c.nombre} ${c.pct ?? defecto} %`,
    );
    return `Cobra: ${partes.join(" · ")}`;
  }
  return cursos.length
    ? `Cobra el ${defecto} % (${cursos.map((c) => `${c.nombre} ${c.pct ?? defecto} %`).join(", ")}) de lo cobrado`
    : `Cobra el ${defecto} % de lo cobrado`;
}

/**
 * Los cursos de la planilla con su forma de pago. Primero lo que manda el
 * backend (`carreras`, o `modo` en `pct.porCurso`); con uno anterior, de las
 * carreras (`GET /academia/carreras`), sólo si alguno de sus cursos es monto
 * fijo: si todos van por %, el texto queda como siempre.
 */
export function cursosDePlanilla(
  d: Pick<PlanillaDocente, "pct" | "carreras" | "grupos">,
  carreras: readonly Carrera[] | null,
): PagoDocenteCurso[] {
  if (d.carreras?.length) return d.carreras;
  const porCurso = d.pct.porCurso.map((x) => ({
    nombre: nombreDe(x.carrera),
    modo: x.modo ?? ("PORCENTAJE" as const),
    pct: x.pct,
    monto: x.monto ?? null,
  }));
  if (d.pct.porCurso.some((x) => x.modo)) return porCurso;
  const ids = [...new Set((d.grupos ?? []).map((g) => g.carrera.id))];
  const deCarreras = ids
    .map((id) => carreras?.find((c) => c.id === id))
    .filter((c): c is Carrera => !!c)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      modo: c.pagoDocenteModo ?? (c.montoDocente != null ? ("MONTO" as const) : ("PORCENTAJE" as const)),
      pct: c.pctDocente ?? d.pct.porCurso.find((x) => nombreDe(x.carrera) === c.nombre)?.pct ?? d.pct.defecto,
      monto: c.montoDocente ?? null,
    }));
  return deCarreras.some((c) => c.modo === "MONTO") ? deCarreras : porCurso;
}

/** "Mes a mes", "Pago completo", o el nombre del plan a medida. */
export function textoFormaPago(forma: FormaPago | null | undefined, plan?: string | null): string {
  if (forma === "MES_A_MES") return "Mes a mes";
  if (forma === "COMPLETO") return "Pago completo";
  return plan ?? "—";
}

/** Cómo se dice el estado de una planilla. */
export const TEXTO_ESTADO_PLANILLA: Record<EstadoPlanilla, string> = {
  EN_CURSO: "en curso",
  CERRADA: "cerrada",
  PAGADA: "pagada",
};

/**
 * Lo que se cuenta de una retención: el monto si el instituto la confirmó
 * (D9: hoy está apagada) o "por confirmar".
 */
export function textoRetencion(activa: boolean, monto: number | null): string {
  return activa && monto != null ? `− ${fmtMoney(monto)}` : "por confirmar";
}

// ── Historial de la ficha ───────────────────────────────────────────────────

const TITULO_EVENTO: Record<string, string> = {
  INSCRIBIR: "Inscripción",
  CONVERSION: "Inscripción online confirmada",
  PREINSCRIBIR: "Inscripción online",
  BECA: "Beca",
  PROMO: "Promoción",
  RETIRO: "Retiro",
  DESCARTE: "Inscripción online descartada",
  CAMBIO_GRUPO: "Cambio de grupo",
  CAMBIO_PLAN: "Cambio de forma de pago",
  NOTA: "Nota corregida",
};

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const txt = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const cantidad = (x: unknown, una: string, varias: string): string | null =>
  Array.isArray(x) && x.length ? `${x.length} ${x.length === 1 ? una : varias}` : null;

/**
 * Un evento del historial en palabras: "Beca 50 % · rendimiento". El
 * `detalle` es el JSON que guardó el backend y cambia con la acción; antes
 * se pintaba tal cual y salía "[object Object]" (QA ronda 2, B-17). Lo que no
 * se conoce se lee igual, clave por clave, sin los ids (que no le dicen nada
 * a nadie). Los montos vienen sólo si el backend los manda a ese usuario.
 */
export function textoEvento(e: Pick<EventoInscripcion, "accion" | "detalle">): { titulo: string; detalle: string } {
  const d = e.detalle;
  const o = d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
  // Una acción nueva que todavía no está en la tabla: "CAMBIO_SEDE" → "Cambio sede".
  let titulo =
    TITULO_EVENTO[e.accion] ??
    (/^[A-Z_]+$/.test(e.accion) ? e.accion.charAt(0) + e.accion.slice(1).toLowerCase().replace(/_/g, " ") : e.accion);
  if (typeof d === "string" || typeof d === "number") return { titulo, detalle: String(d) };
  if (!o) return { titulo, detalle: "" };

  const partes: (string | null)[] = [];
  switch (e.accion) {
    case "INSCRIBIR":
    case "CONVERSION": {
      const total = num(o.total);
      const lista = num(o.precioLista);
      if (total != null) partes.push(`total ${fmtMoney(total)}`);
      if (lista != null && total != null && lista > total) partes.push(`precio de lista ${fmtMoney(lista)}`);
      break;
    }
    case "PREINSCRIBIR": {
      const fotos = Array.isArray(o.fotos) ? o.fotos.length : null;
      if (o.origen === "ONLINE") partes.push("desde la página");
      if (num(o.edad) != null) partes.push(`${num(o.edad)} años`);
      if (fotos != null) partes.push(fotos === 0 ? "sin fotos" : fotos === 3 ? "con las 3 fotos" : `con ${fotos} de 3 fotos`);
      break;
    }
    case "BECA":
    case "PROMO": {
      const pct = num(o.pct);
      const monto = num(o.monto);
      if (pct != null) titulo = `${titulo} ${String(pct).replace(".", ",")} %`;
      if (monto != null) partes.push(`− ${fmtMoney(monto)}`);
      partes.push(txt(o.motivo));
      break;
    }
    case "RETIRO":
    case "DESCARTE":
      partes.push(txt(o.motivo), cantidad(o.cuotasAnuladas, "cuota anulada", "cuotas anuladas"));
      break;
    case "CAMBIO_PLAN": {
      const total = num(o.totalNuevo);
      if (total != null) partes.push(`total nuevo ${fmtMoney(total)}`);
      partes.push(cantidad(o.cuotasAnuladas, "cuota anulada", "cuotas anuladas"));
      break;
    }
    case "CAMBIO_GRUPO":
      break;
    case "NOTA":
      if (o.reabierta) {
        titulo = "Notas reabiertas";
        partes.push(txt(o.motivo));
      } else {
        const antes = num(o.anterior);
        const ahora = num(o.nueva);
        if (antes != null || ahora != null) partes.push(`de ${antes ?? "—"} a ${ahora ?? "sin nota"}`);
      }
      break;
    default:
      for (const [k, v] of Object.entries(o)) {
        if (/id$/i.test(k) || v == null || typeof v === "object") continue;
        partes.push(typeof v === "boolean" ? (v ? k : null) : `${k} ${v}`);
      }
  }
  return { titulo, detalle: partes.filter(Boolean).join(" · ") };
}

export type FueraDeAlcance = "OTRA_SEDE" | "NO_EXISTE";

/**
 * Un rechazo por alcance (QA ronda 2, N-3; contrato #36 y #44): la recepción
 * pidió algo de otra sede (403 `OTRA_SEDE`) o el docente, algo que no es de
 * sus grupos (404, como si no existiera). Reintentar no cambia nada: la
 * pantalla dice qué pasa y ofrece volver. `SIN_CLASE` es otro 404 que no es
 * de alcance ("ese día no toca") y lo maneja la lista.
 */
export function fueraDeAlcance(e: unknown): FueraDeAlcance | null {
  if (!(e instanceof ApiError)) return null;
  if (e.status === 403 && e.codigo === "OTRA_SEDE") return "OTRA_SEDE";
  if (e.status === 404 && e.codigo !== "SIN_CLASE") return "NO_EXISTE";
  return null;
}

// ── B9: el enlace de preinscripción de un grupo ─────────────────────────────

/** Lo que hace falta de un grupo para armar el mensaje del enlace. */
export type GrupoParaCompartir = Pick<GrupoResumen, "id" | "carrera" | "sede" | "dias" | "horaInicio" | "horaFin" | "fechaInicio">;

/**
 * La dirección pública de la preinscripción de un grupo, absoluta para
 * mandarla fuera de la app (`<origen>/p/<sub>/inscribirme/<grupo>`).
 */
export function enlaceInscripcion(subdominio: string, grupoId: number, origen = window.location.origin): string {
  return `${origen}${urlInscribirmeDe(subdominio, grupoId)}`;
}

/** El mensaje para WhatsApp y redes: qué, cuándo, dónde y el enlace. */
export function textoInscripcion(g: GrupoParaCompartir, enlace: string): string {
  return `¡Inscribite en ${nombreDe(g.carrera)}! Empieza el ${fechaCorta(g.fechaInicio)}, ${horarioGrupo(g)}, en ${nombreDe(g.sede)}. Dejá tus datos acá: ${enlace}`;
}
