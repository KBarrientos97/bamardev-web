import type { AjustesAcademia, Carrera, GrupoResumen } from "./tipos";

/**
 * C7 (auditoría 26-oct): la inscripción en línea depende de cinco cosas en
 * cinco lugares. Cada una apagada hace que «no ande» sin decir por qué, así
 * que esta función las junta y dice cuál falta y dónde se arregla. Es pura (sin
 * pantalla ni llamadas) para probarla; los datos salen de lo que las pantallas
 * ya cargan: el plan (features de la sesión), Ajustes, los cursos y los grupos.
 */

export type ClaveCondicion = "plan" | "recibir" | "cursos" | "pagina" | "grupo";

export interface CondicionEnLinea {
  clave: ClaveCondicion;
  /** `null` = todavía no se sabe (cargando) o no se pudo comprobar. */
  ok: boolean | null;
  /** La condición, en una frase corta. */
  titulo: string;
  /** El estado: qué hay hoy y, si falta, qué hacer. */
  detalle: string;
  /**
   * Cómo se arregla: una pantalla a la que ir o, para lo que se resuelve ahí
   * mismo (el interruptor de Ajustes), una acción. Sin nada: lo arregla otra
   * persona (el plan lo cambia BamarDev).
   */
  arreglo?: { texto: string; a?: string; accion?: "activar-recibir" };
}

export interface EntradaEnLinea {
  /** Las features del plan (`negocio.features`). Vacío o ausente: la sesión no las conoce. */
  features: string[] | undefined;
  ajustes: AjustesAcademia | null;
  cursos: Carrera[] | null;
  /** Los grupos; `null` mientras cargan, `"error"` si no se pudieron pedir. */
  grupos: GrupoResumen[] | null | "error";
  palabras: { carreras: string; Carreras: string };
}

/** La ruta de «Mi página», donde se publica. */
export const RUTA_MI_PAGINA = "/mi-pagina";
export const RUTA_CURSOS = "/configuracion/carreras";
export const RUTA_CALENDARIO = "/academia/calendario";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Un grupo que hoy puede recibir inscripciones: abierto, vivo y no terminado. */
export const grupoRecibe = (g: GrupoResumen) => g.inscripcionAbierta && !g.cancelado && g.estado !== "TERMINADO";

export function condicionesInscripcionEnLinea(e: EntradaEnLinea): CondicionEnLinea[] {
  const { ajustes, cursos, grupos, palabras } = e;
  const out: CondicionEnLinea[] = [];

  // (a) La feature del plan. Sin ella los demás pasos no sirven de nada.
  const enElPlan = !!e.features?.includes("preinscripcion_online");
  out.push({
    clave: "plan",
    ok: enElPlan,
    titulo: "Tu plan incluye la inscripción en línea",
    detalle: enElPlan ? "Incluida en tu plan." : "Tu plan no la incluye: pedile a BamarDev que la sume.",
  });

  // (b) El interruptor de Ajustes.
  out.push({
    clave: "recibir",
    ok: ajustes ? ajustes.preinscripcionActiva : null,
    titulo: "Recibir inscripciones desde la página",
    detalle: !ajustes ? "Comprobando…" : ajustes.preinscripcionActiva ? "Activado en Ajustes." : "Está apagado: activalo para que la página reciba inscripciones.",
    arreglo: ajustes && !ajustes.preinscripcionActiva ? { texto: "Activar", accion: "activar-recibir" } : undefined,
  });

  // (c) «Publicar en la página» de cada curso, que nace apagado.
  const vivos = (cursos ?? []).filter((c) => c.activa);
  const publicados = vivos.filter((c) => c.publicarEnPagina);
  out.push({
    clave: "cursos",
    ok: cursos ? publicados.length > 0 : null,
    titulo: `${palabras.Carreras} publicados en la página`,
    detalle: !cursos
      ? "Comprobando…"
      : publicados.length > 0
        ? `${publicados.length} de ${vivos.length} publicados.`
        : vivos.length === 0
          ? `Todavía no hay ${palabras.carreras}.`
          : `Ninguno está publicado: en cada uno hay que prender «Publicar en la página» (nace apagado).`,
    arreglo: cursos && publicados.length === 0 ? { texto: `Ir a ${palabras.Carreras}`, a: RUTA_CURSOS } : undefined,
  });

  // (d) «Mi página» publicada. Un backend anterior no lo manda: no se opina.
  if (ajustes?.paginaPublicada !== undefined || !ajustes) {
    out.push({
      clave: "pagina",
      ok: ajustes ? ajustes.paginaPublicada === true : null,
      titulo: "Mi página publicada",
      detalle: !ajustes
        ? "Comprobando…"
        : ajustes.paginaPublicada
          ? "La página está publicada."
          : "Sin publicar, el enlace abre «Esta página no está disponible».",
      arreglo: ajustes && !ajustes.paginaPublicada ? { texto: "Ir a Mi página", a: RUTA_MI_PAGINA } : undefined,
    });
  }

  // (e) Un grupo con la inscripción abierta.
  const abiertos = Array.isArray(grupos) ? grupos.filter(grupoRecibe) : [];
  out.push({
    clave: "grupo",
    ok: Array.isArray(grupos) ? abiertos.length > 0 : null,
    titulo: "Un grupo con la inscripción abierta",
    detalle:
      grupos === "error"
        ? "No se pudieron comprobar los grupos."
        : !grupos
          ? "Comprobando…"
          : abiertos.length > 0
            ? `${plural(abiertos.length, "grupo abierto", "grupos abiertos")}.`
            : "Ningún grupo recibe inscripciones: abrí uno, o en «Editar grupo» prendé «Inscripción abierta».",
    arreglo: Array.isArray(grupos) && abiertos.length === 0 ? { texto: "Ir al Calendario", a: RUTA_CALENDARIO } : undefined,
  });

  return out;
}

/** ¿Falta algo seguro? (lo que no se sabe todavía no cuenta como falta). */
export const faltantes = (condiciones: CondicionEnLinea[]) => condiciones.filter((c) => c.ok === false);
